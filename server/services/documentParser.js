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
function buildAcquisitionPrompt(textOrEmpty) {
  const docText = textOrEmpty ? `\n\nDocument text:\n${textOrEmpty}` : '';
  return `You are extracting data from a VEHICLE ACQUISITION document.
Our dealership (the BUYER) is "Broadway Used Auto Sales" (or "Broadway Used Auto Sales Inc").

Return ONLY a raw JSON object. Set unknown fields to null.

{
  "vin": "exact 17-char VIN",
  "make": "manufacturer",
  "model": "model name",
  "year": 2014,
  "color": "color",
  "mileage": 131575,
  "titleNumber": "exact title number (e.g. CJ469594, T1234567, 123456789)",
  "stockNumber": "exact stock number if present",
  "purchasedFrom": "AUCTION name (e.g. ADESA Boston, Manheim - NOT the individual seller)",
  "purchasePrice": 6340,
  "purchaseDate": "YYYY-MM-DD",
  "usedVehicleSourceAddress": "AUCTION street address",
  "usedVehicleSourceCity": "AUCTION city",
  "usedVehicleSourceState": "XX",
  "usedVehicleSourceZipCode": "AUCTION zip"
}

TITLE NUMBER GUIDELINES:
- Look for: "Title No", "Cert of Title", "Document #", "Title #", "T-Number", "T-No", "Certificate of Title Number", "Title Number", "Document ID", "Doc ID", "Certificate #".
- It is often located near the VIN or Odometer sections.
- For ADESA documents, it is under "Title State/Number" (e.g. MA/CJ469594 -> extract "CJ469594").
- For CARMAX documents, it might be labeled as "Document #" or "Title #".
- If it's a state-prefixed number (e.g. MA/12345678), ALWAYS extract ONLY the alphanumeric part after the slash.

CASE STUDIES FOR ACCURACY:
1. **ADESA (BOSTON/CONCORD/ETC) BILL OF SALE**:
   - VIN: Located in the "VEHICLE INFORMATION" box (e.g. KNAFK4A...).
   - VEHICLE DETAILS: The line below the VIN contains "Year Make Model, Color, Trim" (e.g. "2016 KIA FORTE, Red, LX").
   - MAKE/MODEL: Extract "KIA" as Make and "FORTE" as Model from that line.
   - TITLE NUMBER: Labeled "Title State/Number" (e.g. MA/CJ469594).
   - PURCHASED FROM: Use the facility name in the top left header (e.g. "ADESA Concord").
   - PRICE: Use "Purchase Price" (e.g. 1,900.00).
2. **USED VEHICLE RECORD (System Form)**:
   - VIN: Often in individual boxes labeled "Vehicle Ident. No.". Combine them.
   - STOCK NO: Top right corner.
   - YEAR: "Mfrs. Model Year".
   - COLOR: "Color".
   - SOURCE: "Obtained From (Source)".
   - ODOMETER: "Odometer In".
3. **CARMAX WHOLESALE**:
   - VIN: Top left under Year/Make/Model.
   - PRICE: "TOTAL" in the bottom grey box.
4. **GENERAL ROLE RULE**: "purchasedFrom" is the AUCTION/FACILITY. If Broadway is BUYER, use the Seller/Auction name. Never Broadway.${docText}`;
}

function buildSalePrompt(textOrEmpty) {
  const docText = textOrEmpty ? `\n\nDocument text:\n${textOrEmpty}` : '';
  return `You are extracting data from a VEHICLE SALE document.
Our dealership (the SELLER) is "Broadway Used Auto Sales".

Return ONLY a raw JSON object.

{
  "vin": "exact 17-char VIN",
  "make": "manufacturer",
  "model": "model name",
  "year": 2014,
  "titleNumber": "exact title number",
  "stockNumber": "exact stock number if present",
  "disposedTo": "PURCHASER name (the customer, NOT Broadway)",
  "disposedAddress": "PURCHASER street address",
  "disposedCity": "PURCHASER city",
  "disposedState": "XX",
  "disposedZip": "PURCHASER zip code",
  "disposedDate": "YYYY-MM-DD",
  "disposedPrice": 12030,
  "disposedOdometer": 119629
}

TITLE NUMBER GUIDELINES:
- Title Number is MANDATORY for sales documents.
- Look for labels: "Title No", "Certificate of Title", "T-Number", "Document #", "Title #", "Title Number", "Document ID", "Doc ID", "Certificate #".
- If multiple numbers are present, look for the one explicitly linked to the title certificate.

IMPORTANT: If the document shows Broadway Used Auto Sales is the BUYER, this is actually an ACQUISITION. In that case, extract the SELLER name into "disposedTo" (as a fallback) but ideally return empty for disposition fields and set VIN.

CASE STUDIES FOR ACCURACY:
1. **MOTOR VEHICLE PURCHASE CONTRACT / BILL OF SALE**:
   - PURCHASER: Look for "Print Name(s) of Purchaser(s)" (Example: "Thomas Digianvittorio").
   - TITLE NUMBER: Mandatory. Check for "Title Number", "Certificate of Title", or "T-Number".
   - PRICE: Use the "Total" at the bottom of the "COSTS AND DISCOUNTS" section (e.g. 26900). **Ignore** any "Selling Price" in the top section if it contradicts the "Total" in the bottom table.
   - ODOMETER: Look for the hand-written or typed digits in the "Odometer Disclosure" boxes.
2. **USED VEHICLE RECORD (System Form)**:
   - VIN: Combine characters from individual boxes.
   - PURCHASER: "Transferred To".
   - PRICE: "Price" or "Transaction Price".
3. **GENERAL ROLE RULE**: "disposedTo" is ALWAYS the customer. It is NEVER Broadway. If you see "Broadway" as the Buyer, set "disposedTo" to null.${docText}`;
}

function buildAutoPrompt(textOrEmpty) {
  const docText = textOrEmpty ? `\n\nDocument text:\n${textOrEmpty}` : '';
  return `Extract all vehicle information from this document. Return ONLY a raw JSON object.
Determine if this is an ACQUISITION (we bought) or a SALE (we sold). Our dealership is "Broadway Used Auto Sales".
If Broadway is the BUYER → this is an acquisition. Extract the AUCTION/FACILITY info into purchasedFrom/usedVehicleSource fields.
If Broadway is the SELLER → this is a sale. Extract the PURCHASER info into disposed fields.

{
  "vin": "17-char VIN", "make": "", "model": "", "year": 0, "color": "", "mileage": 0,
  "titleNumber": "CRITICAL: exact title number", "stockNumber": "",
  "purchasedFrom": "AUCTION name if acquisition", "purchasePrice": 0, "purchaseDate": "YYYY-MM-DD",
  "usedVehicleSourceAddress": "", "usedVehicleSourceCity": "", "usedVehicleSourceState": "", "usedVehicleSourceZipCode": "",
  "disposedTo": "BUYER name if sale", "disposedAddress": "", "disposedCity": "", "disposedState": "", "disposedZip": "",
  "disposedDate": "YYYY-MM-DD", "disposedPrice": 0, "disposedOdometer": 0, "disposedDlNumber": "", "disposedDlState": ""
}

NOTE: The Title Number is a top priority. Look for labels like "Title No", "Cert of Title", "Document #", "Title #", "T-Number", "T-No", "Title Number", "Document ID", "Doc ID", "Certificate #". If it is prefixed by a state (e.g. MA/123456), extract the alphanumeric part after the slash.

NOTE: Vehicle details are often consolidated into one line (e.g., "2016 KIA FORTE, Red, LX"). Extract the individual components accordingly.${docText}`;
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
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${nvidiaApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-8b-instruct",
        messages: [
          { 
            role: "system", 
            content: "You are a precise document data extractor. Your primary goal is to extract the VIN, TITLE NUMBER, and VEHICLE DETAILS (Year, Make, Model). The Title Number is CRITICAL and must be extracted if present. Look for labels like 'Title No', 'Cert of Title', 'Document #', 'Title #', 'T-Number', 'T-No', 'Certificate of Title', 'Document ID', 'Doc ID', or 'Certificate #'. If a state prefix is present (e.g., 'MA/12345'), extract ONLY the alphanumeric number part ('12345'). Output ONLY valid JSON." 
          },
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
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${nvidiaApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta/llama-3.2-11b-vision-instruct",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${imgMime};base64,${base64Image}` } }
          ]
        }],
        max_tokens: 1500,
        temperature: 0,
        stream: false
      })
    });

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

// ═══════════════════════════════════════════════════════════════
// CLEAN — Normalize all extracted data
// ═══════════════════════════════════════════════════════════════
function clean(d) {
  if (!d) return {};
  const s = v => {
    const str = String(v || '').trim();
    if (/^(null|undefined|none|n\/a|unknown|unknow|pending|unknown unknown|unknow unknow)$/i.test(str)) return null;
    return str;
  };
  const n = v => {
    if (typeof v === 'number') return v;
    const cleanStr = String(v || '0').replace(/[$,]/g, '').trim();
    const matches = cleanStr.match(/-?\d+(\.\d+)?/g);
    if (!matches) return 0;
    // Prioritize the LAST match with a decimal, as it's usually the 'Total'
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
  const vin = s(d.vin).toUpperCase()
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

  return {
    vin,
    make: s(d.make) || null,
    model: s(d.model) || null,
    year: i(d.year) || null,
    color: s(d.color) || null,
    mileage: i(d.mileage),
    titleNumber: (() => {
      const raw = s(d.titleNumber);
      if (!raw || /^(null|undefined|none|n\/a|unknown|pending)$/i.test(raw)) return null;
      
      // Remove common prefixes and state codes (e.g., "MA/", "TITLE NO:", "CERTIFICATE:")
      const cleaned = raw.toUpperCase()
        .replace(/^[A-Z]{2}\//, '') // Remove state code prefix like "MA/"
        .replace(/^(TITLE|CERTIFICATE|CERT|DOCUMENT|DOC|T-NO|T-NUMBER|T-NUM|REF|NO|NUMBER|NUM|#|DOC ID|DOCUMENT ID)[:\s#.-]*/gi, '')
        .replace(/^(TITLE|CERTIFICATE|CERT|DOCUMENT|DOC|T-NO|T-NUMBER|T-NUM|REF|NO|NUMBER|NUM|#|DOC ID|DOCUMENT ID)[:\s#.-]*/gi, '') // double pass for "TITLE NO:"
        .replace(/^(NO|NUMBER|NUM|#)[:\s#.-]*/gi, '') // triple pass for nested things
        .trim();
        
      return cleaned || null;
    })(),
    stockNumber: s(d.stockNumber) || null,
    purchasedFrom: s(d.purchasedFrom) || null,
    purchasePrice: n(d.purchasePrice),
    purchaseDate: dt(d.purchaseDate),
    usedVehicleSourceAddress: s(d.usedVehicleSourceAddress) || null,
    usedVehicleSourceCity: s(d.usedVehicleSourceCity) || null,
    usedVehicleSourceState: s(d.usedVehicleSourceState).toUpperCase().slice(0, 2) || null,
    usedVehicleSourceZipCode: s(d.usedVehicleSourceZipCode) || null,
    disposedTo: s(d.disposedTo) || null,
    disposedAddress: s(d.disposedAddress) || null,
    disposedCity: s(d.disposedCity) || null,
    disposedState: s(d.disposedState).toUpperCase().slice(0, 2) || null,
    disposedZip: s(d.disposedZip) || null,
    disposedDate: dt(d.disposedDate),
    disposedPrice: n(d.disposedPrice),
    disposedOdometer: i(d.disposedOdometer),
    disposedDlNumber: s(d.disposedDlNumber) || null,
    disposedDlState: s(d.disposedDlState).toUpperCase().slice(0, 2) || null,
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

