import path from 'path';
import { createRequire } from 'module';
import mammoth from 'mammoth';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import dotenv from 'dotenv';

dotenv.config();

const require = createRequire(import.meta.url);
const nvidiaApiKey = process.env.NVIDIA_API_KEY;
const hasNvidiaKey = !!nvidiaApiKey && nvidiaApiKey !== 'YOUR_NVIDIA_API_KEY_HERE';
const ocrLangPath = path.dirname(
  require.resolve('@tesseract.js-data/eng/4.0.0/eng.traineddata.gz')
);

let tesseractWorker = null;

async function getTesseractWorker() {
  if (!tesseractWorker) {
    tesseractWorker = await createWorker('eng', 1, { langPath: ocrLangPath, gzip: true });
  }
  return tesseractWorker;
}

// Fetch with timeout + 1 automatic retry for transient NVIDIA API failures
async function fetchWithTimeout(url, options, timeoutMs = 25000, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (attempt < retries) {
        const isTimeout = err.name === 'AbortError';
        console.warn(`[API] ${isTimeout ? 'Timeout' : 'Error'} on attempt ${attempt + 1}, retrying in 2s...`);
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw err;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// SINGLE ENTRY POINT — Extract everything from any document
// purpose: "acquisition" | "sale" | "" (unknown)
// ═══════════════════════════════════════════════════════════════
export async function extractVehicleInfo(fileBuffer, mimetype, purpose = "") {
  console.log(`[Parser] START | mime=${mimetype} | purpose=${purpose || 'auto'} | nvidia=${hasNvidiaKey}`);

  // For images — go straight to Vision AI
  if (mimetype.startsWith('image/')) {
    try {
      const visionResult = await visionExtract(fileBuffer, mimetype, purpose);
      if (visionResult && visionResult.vin) return visionResult;
    } catch (err) {
      console.warn(`[Parser] Vision AI failed, falling back to OCR: ${err.message}`);
    }
    
    // Fallback: OCR the image then send text to LLM
    const ocrText = await ocrImage(fileBuffer);
    if (hasNvidiaKey && ocrText.length > 30) {
      try {
        const textResult = await textExtract(ocrText, purpose);
        if (textResult) return textResult;
      } catch (err) {
        console.warn(`[Parser] Text LLM failed after OCR: ${err.message}`);
      }
    }
    return {};
  }

  // For PDFs
  if (mimetype === 'application/pdf') {
    const { pages, combinedText } = await extractPdfTextPages(fileBuffer);
    console.log(`[Parser] PDF native text: ${combinedText.length} chars`);

    // If PDF has native text, use text LLM
    if (combinedText.replace(/\s/g, '').length > 30 && hasNvidiaKey) {
      try {
        const textResult = await textExtract(combinedText, purpose);
        if (textResult && textResult.vin) return textResult;
      } catch (err) {
        console.warn(`[Parser] Text LLM failed on native PDF text: ${err.message}`);
      }
    }

    // Scanned PDF or text extraction failed — render to image, use vision
    try {
      const visionResult = await visionExtract(fileBuffer, mimetype, purpose);
      if (visionResult) return visionResult;
    } catch (err) {
      console.warn(`[Parser] Vision AI failed on PDF render: ${err.message}`);
    }

    return {};
  }

  // Word docs and other text
  const text = await extractText(fileBuffer, mimetype);
  if (hasNvidiaKey && text.length > 30) {
    try {
      const textResult = await textExtract(text, purpose);
      if (textResult) return textResult;
    } catch (err) {
      console.warn(`[Parser] Text LLM failed on Word/Other: ${err.message}`);
    }
  }
  return {};
}

// ═══════════════════════════════════════════════════════════════
// PROMPT BUILDERS — Separate focused prompts for acquisition vs sale
// ═══════════════════════════════════════════════════════════════
// ─── Shared system prompt for ALL AI calls (text + vision) ───
const SYSTEM_PROMPT = `You are a UNIVERSAL vehicle document data extractor. You process diverse automotive documents including:
- Auction Bills of Sale (ADESA, CMAA/Central Mass, Manheim, CarMax)
- MA Title Transfer Forms ("FOR A MOTOR VEHICLE, MOBILE HOME...")
- Motor Vehicle Purchase Contracts (Carsforsale.com format)
- Dealer invoices and wholesale receipts

Our dealership is "Broadway Used Auto Sales" (also "Broadway Used Auto Sales Inc", "Auto Sales On Broadway").
Dealership addresses: 2125 REVERE BEACH PKWY, EVERETT, MA 02149 or 100 BROADWAY, NORWOOD, MA 02062.

CRITICAL RULES:
1. ROLE DETECTION: If Broadway appears as BUYER → this is an ACQUISITION. If Broadway appears as SELLER/DEALER → this is a SALE.
2. ADDRESS FILTERING: NEVER return Broadway's own address as the source or disposed address. Return null instead.
3. BODY TYPE vs MODEL: "Body Type" (Sedan, SUV, Hatchback, Coupe) is NOT the model. "Model" is the vehicle name (Corolla, Pilot, Focus, Wrangler).
4. TITLE NUMBER: Only extract if explicitly labeled "Title No", "Title #", "Certificate of Title Number". If not present, return null. VIN is NOT a title number.
5. Return ONLY valid JSON. No markdown, no explanation.`;

function buildAcquisitionPrompt(textOrEmpty) {
  const docText = textOrEmpty ? `\n\nDocument text:\n${textOrEmpty}` : '';
  return `Extract data from this VEHICLE ACQUISITION document. Broadway is the BUYER.

Return ONLY this JSON (set unknown fields to null):
{
  "vin": "exact 17-char VIN",
  "make": "manufacturer (Toyota, Ford, Honda, etc.)",
  "model": "model name ONLY (Corolla, Camry, Pilot) — NOT body type",
  "year": 2014,
  "color": "color",
  "mileage": 131575,
  "titleNumber": null,
  "stockNumber": "stock or lot number",
  "purchasedFrom": "SELLER/AUCTION name",
  "purchasePrice": 6340,
  "purchaseDate": "YYYY-MM-DD",
  "usedVehicleSourceAddress": "SELLER street address",
  "usedVehicleSourceCity": "SELLER city",
  "usedVehicleSourceState": "XX (2-letter code)",
  "usedVehicleSourceZipCode": "SELLER zip"
}

LABEL MAPPING:
- VIN: "VIN", "V.I.N. No.", "Vehicle Identification Number"
- Make/Model: "Make/Manufacturer" → make. "Model" → model. "Body Type" is NOT model.
- Mileage: "Odometer", "Miles", "Reading", "OVER 100,000" means mileage > 100000
- Price: "Purchase Price", "Selling Price", "VEHICLE PURCHASE" amount
- Seller: "SELLER:", "CONSIGNOR:", top-left entity name on auction docs
- Title: "Title #", "Title State/Number", "Certificate #" — return just the number

DOCUMENT-SPECIFIC:
- ADESA: Seller name in "SELLER:" field or top-left header. Address under facility name.
- CMAA: Seller in top-left box. Buyer (Broadway) at bottom-left. Total = selling price + fees.
- CarMax: Seller address at BOTTOM-RIGHT (e.g. "CarMax - Westborough, 170 Turnpike Rd..."). Broadway in middle.
- Manheim: "TRANSACTION LOCATION" = auction name. Seller in "REMIT PAYMENT TO" or "DUE FROM OWNER" section. Strip " US" from addresses.

NEVER use Broadway's address (100 BROADWAY / 2125 REVERE BEACH PKWY) as source address.${docText}`;
}

function buildSalePrompt(textOrEmpty) {
  const docText = textOrEmpty ? `\n\nDocument text:\n${textOrEmpty}` : '';
  return `Extract data from this VEHICLE SALE document. Broadway is the SELLER.

Return ONLY this JSON (set unknown fields to null):
{
  "vin": "exact 17-char VIN",
  "make": "manufacturer (Toyota, Ford, Honda, etc.)",
  "model": "model name ONLY (Corolla, Camry, Pilot) — NOT body type",
  "year": 2014,
  "color": "color",
  "titleNumber": null,
  "stockNumber": "stock number",
  "disposedTo": "PURCHASER/BUYER name",
  "disposedAddress": "PURCHASER street address",
  "disposedCity": "PURCHASER city",
  "disposedState": "XX (2-letter code)",
  "disposedZip": "PURCHASER zip code",
  "disposedDate": "YYYY-MM-DD",
  "disposedPrice": 7751,
  "disposedOdometer": 119629,
  "disposedDlNumber": "driver license number",
  "disposedDlState": "XX"
}

LABEL MAPPING:
- VIN: "VIN", "Vehicle/Vessel Identification Number"
- Make/Model: "Make/Manufacturer" → make. "Model" → model. "Body Type" (Sedan/SUV/Hatchback) is NOT model.
- Purchaser: "Print Name(s) of Purchaser(s)", "Purchaser(s) Name(s)", "Buyer"
- Address: "Address" row under purchaser. City/State/Zip in labeled columns. If state is missing, infer from zip.
- Price: "Selling Price", "Vehicle Sales Price", the numeric value (e.g. 7751 means $7,751)
- Date: "Date of Sale", field next to selling price
- DL: "DL Number", "DL State" — the purchaser's driver license
- Title: "Certificate of Title Number" — return just the alphanumeric code (e.g. "BK517792")

MA TITLE TRANSFER FORM SPECIFIC:
- Layout: Year | Make/Manufacturer | Body Type | Model | Color
- "Body Type" column contains Sedan/SUV/Hatchback — do NOT put this in model field
- Address may lack state code — infer MA if zip starts with 01xxx or 02xxx
- "Selling Price" is a bare number without $ sign

PURCHASE CONTRACT SPECIFIC:
- "Dealer/Seller Name and Address" = Broadway (ignore this address)
- "Purchaser(s) Name(s) and Address(es)" = the BUYER
- "Vehicle Sales Price" = disposedPrice
- "Stock No." = stockNumber

NEVER use Broadway's address as the purchaser's address.${docText}`;
}

function buildAutoPrompt(textOrEmpty) {
  const docText = textOrEmpty ? `\n\nDocument text:\n${textOrEmpty}` : '';
  return `Extract all vehicle information from this document.
Determine direction: If Broadway is BUYER → ACQUISITION. If Broadway is SELLER → SALE.

Return ONLY this JSON (set unknown fields to null):
{
  "vin": "17-char VIN", "make": "", "model": "model name NOT body type", "year": 0, "color": "", "mileage": 0,
  "titleNumber": null, "stockNumber": "",
  "purchasedFrom": "SELLER name if acquisition", "purchasePrice": 0, "purchaseDate": "YYYY-MM-DD",
  "usedVehicleSourceAddress": "SELLER street", "usedVehicleSourceCity": "", "usedVehicleSourceState": "XX", "usedVehicleSourceZipCode": "",
  "disposedTo": "BUYER name if sale", "disposedAddress": "BUYER street", "disposedCity": "", "disposedState": "XX", "disposedZip": "",
  "disposedDate": "YYYY-MM-DD", "disposedPrice": 0, "disposedOdometer": 0,
  "disposedDlNumber": "", "disposedDlState": "XX"
}

RULES:
- "Body Type" (Sedan/SUV/Hatchback/Coupe) is NOT the model. Model = vehicle name (Corolla, Pilot, Focus).
- Infer state from zip if missing (01xxx/02xxx = MA, 06xxx = CT, etc.).
- "Selling Price" bare number (e.g. 7751) = dollar amount without $ sign.
- NEVER use Broadway's address for source or disposed fields.${docText}`;
}

// ═══════════════════════════════════════════════════════════════
// TEXT LLM — Purpose-aware extraction
// ═══════════════════════════════════════════════════════════════
async function textExtract(text, purpose = "") {
  try {
    let prompt;
    if (purpose === 'acquisition') {
      prompt = buildAcquisitionPrompt(text);
    } else if (purpose === 'sale') {
      prompt = buildSalePrompt(text);
    } else {
      prompt = buildAutoPrompt(text);
    }

    console.log(`[Parser:Text] Sending ${text.length} chars to LLM (purpose=${purpose || 'auto'})...`);
    const response = await fetchWithTimeout("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${nvidiaApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-8b-instruct",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ],
        temperature: 0,
        max_tokens: 1500,
        stream: false
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    const raw = data.choices[0].message.content;
    console.log(`[Parser:Text] Raw AI response: ${raw.substring(0, 800)}`);

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);
    const result = clean(parsed);
    console.log(`[Parser:Text] Cleaned result:`, JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    console.error('[Parser:Text] FAILED:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// VISION LLM — For images and scanned PDFs
// ═══════════════════════════════════════════════════════════════
async function visionExtract(fileBuffer, mimetype, purpose = "") {
  if (!hasNvidiaKey) return null;

  let base64Image = '';
  let imgMime = mimetype;

  if (mimetype === 'application/pdf') {
    try {
      const loadingTask = getDocument({ data: new Uint8Array(fileBuffer), useSystemFonts: true, disableFontFace: true });
      const doc = await loadingTask.promise;
      const page = await doc.getPage(1);
      const tc = await page.getTextContent();
      const txt = tc.items.map(i => ('str' in i ? i.str : '')).join(' ').trim();
      if (txt.length > 40) return null; // has native text, skip vision

      const vp = page.getViewport({ scale: 1.5 });
      const cf = createCanvasFactory();
      const { canvas, context } = cf.create(Math.ceil(vp.width), Math.ceil(vp.height));
      await page.render({ canvasContext: context, viewport: vp, canvasFactory: cf }).promise;
      base64Image = canvas.toBuffer('image/jpeg', { quality: 0.7 }).toString('base64');
      imgMime = 'image/jpeg';
      cf.destroy({ canvas, context });
    } catch (e) {
      console.warn('[Parser:Vision] PDF render fail:', e.message);
      return null;
    }
  } else if (mimetype.startsWith('image/')) {
    try {
      const resizedBuffer = await resizeImageIfNeeded(fileBuffer);
      base64Image = resizedBuffer.toString('base64');
      imgMime = 'image/jpeg';
    } catch (e) {
      console.warn('[Parser:Vision] Image resize fail:', e.message);
      base64Image = fileBuffer.toString('base64');
    }
  } else {
    return null;
  }

  if (!base64Image) return null;

  try {
    let prompt;
    if (purpose === 'acquisition') {
      prompt = buildAcquisitionPrompt('');
    } else if (purpose === 'sale') {
      prompt = buildSalePrompt('');
    } else {
      prompt = buildAutoPrompt('');
    }

    console.log(`[Parser:Vision] Sending image to Vision AI (purpose=${purpose || 'auto'})...`);
    const response = await fetchWithTimeout("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${nvidiaApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta/llama-3.2-11b-vision-instruct",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${imgMime};base64,${base64Image}` } }
            ]
          }
        ],
        max_tokens: 1500,
        temperature: 0,
        stream: false
      })
    }, 30000);

    const data = await response.json();
    if (data.error) {
      console.error('[Parser:Vision] API Error:', data.error);
      throw new Error(data.error.message);
    }

    const raw = data.choices[0].message.content;
    console.log(`[Parser:Vision] Raw response: ${raw.substring(0, 800)}`);

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in vision response');

    const parsed = JSON.parse(jsonMatch[0]);
    const result = clean(parsed);
    console.log(`[Parser:Vision] Cleaned result:`, JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    console.error('[Parser:Vision] FAILED:', err.message);
    return null;
  }
}

// ══════════════════════════════════════�
// ===============================================================
// CLEAN - Normalize all extracted data
// ===============================================================
const STATE_MAP = {
  'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR', 'CALIFORNIA': 'CA',
  'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE', 'FLORIDA': 'FL', 'GEORGIA': 'GA',
  'HAWAII': 'HI', 'IDAHO': 'ID', 'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA',
  'KANSAS': 'KS', 'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
  'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS', 'MISSOURI': 'MO',
  'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', 'OHIO': 'OH',
  'OKLAHOMA': 'OK', 'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT', 'VERMONT': 'VT',
  'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV', 'WISCONSIN': 'WI', 'WYOMING': 'WY'
};

// ZIP prefix -> state code mapping for inferring missing states → state code mapping for inferring missing states
const ZIP_TO_STATE = {
  '01': 'MA', '02': 'MA', '03': 'NH', '04': 'ME', '05': 'VT', '06': 'CT',
  '07': 'NJ', '08': 'NJ', '10': 'NY', '11': 'NY', '12': 'NY', '13': 'NY', '14': 'NY',
  '15': 'PA', '16': 'PA', '17': 'PA', '18': 'PA', '19': 'PA',
  '20': 'DC', '21': 'MD', '22': 'VA', '23': 'VA', '24': 'VA',
  '02861': 'RI', '02840': 'RI', '02860': 'RI', '02898': 'RI', '028': 'RI', '029': 'RI',
  '30': 'GA', '33': 'FL', '02119': 'MA', '02170': 'MA',
};

function inferStateFromZip(zip) {
  if (!zip) return null;
  const z = String(zip).trim();
  // Check 5-digit first, then 3-digit prefix, then 2-digit prefix
  if (ZIP_TO_STATE[z]) return ZIP_TO_STATE[z];
  if (ZIP_TO_STATE[z.substring(0, 3)]) return ZIP_TO_STATE[z.substring(0, 3)];
  if (ZIP_TO_STATE[z.substring(0, 2)]) return ZIP_TO_STATE[z.substring(0, 2)];
  return null;
}

function clean(d) {
  if (!d) return {};
  // s() returns empty string for junk values, NEVER null — safe for chaining
  const s = v => {
    const str = String(v || '').trim()
      .replace(/\s+US$/i, '')   // Strip " US" suffix from Manheim addresses
      .trim();
    if (!str) return '';
    if (/^(null|undefined|none|n\/a|unknown|unknow|pending|unknown unknown|unknow unknow|0|-)$/i.test(str)) return '';
    return str;
  };
  const n = v => {
    if (typeof v === 'number') return v;
    const cleanStr = String(v || '0').replace(/[$,]/g, '').trim();
    const matches = cleanStr.match(/-?\d+(\.\d+)?/g);
    if (!matches) return 0;
    const priceMatch = [...matches].reverse().find(m => m.includes('.'));
    const x = parseFloat(priceMatch || matches[matches.length - 1]);
    return Number.isFinite(x) ? x : 0;
  };
  const i = v => {
    if (typeof v === 'number') return v;
    const cleanStr = String(v || '0').replace(/[,]/g, '').trim();
    const matches = cleanStr.match(/\d+/g);
    if (!matches) return 0;
    const x = parseInt(matches[matches.length - 1], 10);
    return Number.isFinite(x) ? x : 0;
  };
  const st = (v, zip) => {
    const raw = String(v || '').trim().toUpperCase().replace(/\s+US$/i, '');
    if (!raw && zip) return inferStateFromZip(zip);
    if (!raw) return null;
    if (STATE_MAP[raw]) return STATE_MAP[raw];
    if (raw.length === 2 && /^[A-Z]{2}$/.test(raw)) return raw;
    const match = raw.match(/\b([A-Z]{2})\b/);
    if (match) return match[1];
    // Last resort: try ZIP inference
    if (zip) return inferStateFromZip(zip);
    return raw.slice(0, 2) || null;
  };

  const vin = (s(d.vin) || '').toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^(VIN|SERIAL|NUMBER|ID|VEHICLEID|IDENTIFICATION|STOCK|LOT|NO)+/, '')
    .replace(/I/g, '1')
    .replace(/[OQ]/g, '0')
    .slice(0, 17);
  const dt = v => {
    if (!v) return null;
    const t = String(v).trim();
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(Date.UTC(+m[3], +m[1]-1, +m[2])).toISOString();
    const dd = new Date(t);
    return isNaN(dd.getTime()) ? null : dd.toISOString();
  };

  // Helper to split address if AI combined them
  const splitAddr = (addr, city, state, zip) => {
    const rawAddr = String(addr || '').trim();
    if (rawAddr && (!city || !state)) {
      // 1. Try splitting by comma
      const parts = rawAddr.split(',');
      if (parts.length >= 2) {
        const lastPart = parts[parts.length - 1].trim();
        const cityPart = parts[parts.length - 2].trim();
        const stateZipMatch = lastPart.match(/^([A-Z]{2})\s*(\d{5})?$/i);
        if (stateZipMatch || /^[A-Z]{2}$/i.test(lastPart)) {
          return {
            a: parts.slice(0, -2).join(',').trim() || rawAddr,
            c: city || cityPart,
            s: state || (stateZipMatch ? stateZipMatch[1] : lastPart),
            z: zip || (stateZipMatch ? stateZipMatch[2] : null)
          };
        }
      }
      
      // 2. Try regex fallback for "City ST 12345" or "City, ST 12345"
      const geoMatch = rawAddr.match(/([^,]+)\s+([A-Z]{2})\s+(\d{5})?$/i);
      if (geoMatch) {
        const fullPrefix = rawAddr.substring(0, geoMatch.index).trim();
        const streetParts = fullPrefix.split(/\s+/);
        // Usually the last word before the City is the street name, but City might be 2 words.
        // This is tricky, but let's try to assume the match captured City ST Zip.
        return {
          a: city ? rawAddr : (fullPrefix || rawAddr),
          c: city || geoMatch[1].trim(),
          s: state || geoMatch[2],
          z: zip || geoMatch[3] || null
        };
      }
    }
    return { a: addr, c: city, s: state, z: zip };
  };

  const acq = splitAddr(
    s(d.usedVehicleSourceAddress),
    s(d.usedVehicleSourceCity),
    s(d.usedVehicleSourceState),
    s(d.usedVehicleSourceZipCode)
  );

  const disp = splitAddr(
    s(d.disposedAddress),
    s(d.disposedCity),
    s(d.disposedState),
    s(d.disposedZip)
  );

  // Filter out Broadway addresses that may have leaked into source/disposed fields
  const isBroadwayAddr = (addr) => {
    if (!addr) return false;
    const u = String(addr).toUpperCase();
    return u.includes('REVERE BEACH') || u.includes('100 BROADWAY') || u.includes('BROADWAY USED');
  };

  return {
    vin,
    make: (() => {
      const raw = s(d.make);
      if (!raw) return null;
      // Strip "Make/Manufacturer" label noise and body types that leaked
      return raw.replace(/^make\/manufacturer:?\s*/i, '')
        .replace(/^(sedan|suv|coupe|truck|van|wagon|hatchback|convertible)\s*/i, '')
        .trim() || null;
    })(),
    model: (() => {
      const raw = s(d.model);
      if (!raw) return null;
      // Strip body types that may have been prepended ("SUV Pilot" → "Pilot")
      const parts = raw.split(/\s+/);
      const bodyTypes = /^(suv|sedan|coupe|truck|van|wagon|hatchback|convertible|sport\s*utility)$/i;
      if (parts.length > 1 && bodyTypes.test(parts[0])) {
        return parts.slice(1).join(' ');
      }
      // Also handle "Sedan Corolla LE" → "Corolla LE"
      return raw.replace(/^(sedan|suv|coupe|truck|van|wagon|hatchback|convertible|sport\s*utility\s*v?)\s+/i, '').trim() || raw;
    })(),
    year: i(d.year) || null,
    color: s(d.color) || null,
    mileage: i(d.mileage || d.odometer || d.odometerReading),
    titleNumber: (() => {
      const raw = s(d.titleNumber);
      if (!raw) return null;
      
      // Strip only obvious label prefixes the AI might have included
      let cleaned = raw.trim()
        .replace(/^(title|cert(ificate)?|doc(ument)?)[\s.:##-]*(no|number|num|id|#)?[\s.:##-]*/i, '')
        .replace(/^(no|number|num|#)[\s.:##-]*/i, '')
        .replace(/^[A-Z]{2}\//, '')  // Remove state prefix like "MA/"
        .trim();
      
      if (!cleaned) return null;
      
      // Reject if the "title number" is actually the VIN (17 chars, all alphanum)
      const vinCandidate = cleaned.replace(/[^A-Z0-9]/gi, '');
      if (vinCandidate.length === 17 && vin && vinCandidate === vin) return null;
      
      // Reject if it's clearly not a title number (too short or just "0")
      if (/^(0+|null|none|n\/a|unknown|pending|not available)$/i.test(cleaned)) return null;
      
      return cleaned;
    })(),
    stockNumber: s(d.stockNumber) || null,
    purchasedFrom: s(d.purchasedFrom) || null,
    purchasePrice: n(d.purchasePrice),
    purchaseDate: dt(d.purchaseDate),
    usedVehicleSourceAddress: isBroadwayAddr(acq.a) ? null : (acq.a || null),
    usedVehicleSourceCity: isBroadwayAddr(acq.a) ? null : (acq.c || null),
    usedVehicleSourceState: isBroadwayAddr(acq.a) ? null : st(acq.s, acq.z),
    usedVehicleSourceZipCode: isBroadwayAddr(acq.a) ? null : (s(acq.z) || null),
    disposedTo: s(d.disposedTo) || null,
    disposedAddress: isBroadwayAddr(disp.a) ? null : (disp.a || null),
    disposedCity: isBroadwayAddr(disp.a) ? null : (disp.c || null),
    disposedState: isBroadwayAddr(disp.a) ? null : st(disp.s, disp.z),
    disposedZip: isBroadwayAddr(disp.a) ? null : (s(disp.z) || null),
    disposedDate: dt(d.disposedDate),
    disposedPrice: n(d.disposedPrice),
    disposedOdometer: i(d.disposedOdometer),
    disposedDlNumber: s(d.disposedDlNumber) || null,
    disposedDlState: st(d.disposedDlState),
    transportCost: n(d.transportCost),
    repairCost: n(d.repairCost),
    inspectionCost: n(d.inspectionCost),
    registrationCost: n(d.registrationCost),
    paymentMethod: s(d.paymentMethod) || null,
  };
}

// ═══════════════════════════════════════════════════════════════
// TEXT EXTRACTION HELPERS
// ═══════════════════════════════════════════════════════════════
export async function extractText(fileBuffer, mimetype) {
  if (mimetype === 'application/pdf') {
    const { combinedText } = await extractPdfTextPages(fileBuffer);
    return combinedText;
  } else if (mimetype?.includes('word')) {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  } else if (mimetype?.startsWith('image/')) {
    return ocrImage(fileBuffer);
  } else {
    return fileBuffer.toString('utf-8');
  }
}

async function ocrImage(fileBuffer) {
  const worker = await getTesseractWorker();
  try {
    const { data: { text } } = await worker.recognize(fileBuffer);
    return text;
  } catch (err) {
    console.error('[OCR] Failed:', err.message);
    return '';
  }
}

async function resizeImageIfNeeded(fileBuffer) {
  try {
    const img = await loadImage(fileBuffer);
    const maxDim = 2048; // Higher resolution to prevent OCR/Vision issues with spaced characters
    if (img.width <= maxDim && img.height <= maxDim) return fileBuffer;

    let w = img.width;
    let h = img.height;
    if (w > h) {
      h = Math.floor((h * maxDim) / w);
      w = maxDim;
    } else {
      w = Math.floor((w * maxDim) / h);
      h = maxDim;
    }

    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toBuffer('image/jpeg', { quality: 0.8 });
  } catch (err) {
    console.error('[Resize] Failed:', err.message);
    return fileBuffer;
  }
}

function createCanvasFactory() {
  return {
    create: (w, h) => { const c = createCanvas(w, h); return { canvas: c, context: c.getContext('2d') }; },
    destroy: (t) => { t.canvas.width = 0; t.canvas.height = 0; },
  };
}

async function extractPdfTextPages(fileBuffer) {
  const loadingTask = getDocument({ data: new Uint8Array(fileBuffer), useSystemFonts: true, disableFontFace: true });
  const doc = await loadingTask.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push(tc.items.map(item => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' ').trim());
  }
  return { pages, combinedText: pages.join('\n').trim() };
}

/**
 * Validates a 17-character VIN using the standard check digit rule (position 9).
 * Useful for catching OCR errors.
 */
export function isValidVin(vin) {
  if (!vin || vin.length !== 17) return false;
  
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  const transliteration = {
    'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6, 'G': 7, 'H': 8,
    'J': 1, 'K': 2, 'L': 3, 'M': 4, 'N': 5, 'P': 7, 'R': 9,
    'S': 2, 'T': 3, 'U': 4, 'V': 5, 'W': 6, 'X': 7, 'Y': 8, 'Z': 9,
    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9
  };

  try {
    let sum = 0;
    for (let i = 0; i < 17; i++) {
      const char = vin[i].toUpperCase();
      const val = transliteration[char];
      if (val === undefined && i !== 8) return false; // Invalid char in non-check-digit position
      sum += (val || 0) * weights[i];
    }

    const remainder = sum % 11;
    const checkDigit = remainder === 10 ? 'X' : String(remainder);
    
    return vin[8].toUpperCase() === checkDigit;
  } catch (err) {
    return false;
  }
}

