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

// ═══════════════════════════════════════════════════════════════
// SINGLE ENTRY POINT — Extract everything from any document
// purpose: "acquisition" | "sale" | "" (unknown)
// ═══════════════════════════════════════════════════════════════
export async function extractVehicleInfo(fileBuffer, mimetype, purpose = "") {
  console.log(`[Parser] START | mime=${mimetype} | purpose=${purpose || 'auto'} | nvidia=${hasNvidiaKey}`);

  // For images — go straight to Vision AI
  if (mimetype.startsWith('image/')) {
    const visionResult = await visionExtract(fileBuffer, mimetype, purpose);
    if (visionResult) return visionResult;
    // Fallback: OCR the image then send text to LLM
    const ocrText = await ocrImage(fileBuffer);
    if (hasNvidiaKey && ocrText.length > 30) {
      const textResult = await textExtract(ocrText, purpose);
      if (textResult) return textResult;
    }
    return {};
  }

  // For PDFs
  if (mimetype === 'application/pdf') {
    const { pages, combinedText } = await extractPdfTextPages(fileBuffer);
    console.log(`[Parser] PDF native text: ${combinedText.length} chars`);

    // If PDF has native text, use text LLM
    if (combinedText.replace(/\s/g, '').length > 30 && hasNvidiaKey) {
      const textResult = await textExtract(combinedText, purpose);
      if (textResult) return textResult;
    }

    // Scanned PDF — render to image, use vision
    const visionResult = await visionExtract(fileBuffer, mimetype, purpose);
    if (visionResult) return visionResult;

    return {};
  }

  // Word docs and other text
  const text = await extractText(fileBuffer, mimetype);
  if (hasNvidiaKey && text.length > 30) {
    const textResult = await textExtract(text, purpose);
    if (textResult) return textResult;
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
  "purchasedFrom": "SELLER name (NOT Broadway)",
  "purchasePrice": 6340,
  "purchaseDate": "YYYY-MM-DD",
  "usedVehicleSourceAddress": "SELLER street address",
  "usedVehicleSourceCity": "SELLER city",
  "usedVehicleSourceState": "XX",
  "usedVehicleSourceZipCode": "SELLER zip"
}

CASE STUDIES FOR ACCURACY:
1. **ADESA BOSTON INVOICE**:
   - VIN: Located in the middle "VEHICLE INFORMATION" box. (Example: "JTDKN3DU9B1362964"). Do NOT misread as barcodes or other numbers.
   - SELLER: Top-middle box labeled "SELLER:". (Example: "BERNARDI TOYOTA-SCION").
   - BUYER: Top-right box. If it says "BROADWAY", ignore it for the "purchasedFrom" field.
   - PRICE: Use "Net Due" (e.g., 5785.00). DO NOT join digits across columns.
2. **CARMAX WHOLESALE**:
   - VIN: At the top left under Year/Make/Model.
   - SELLER: Bottom right text block (e.g., "CarMax - Norwood").
   - PRICE: "TOTAL" in the bottom grey box.
3. **GENERAL ROLE RULE**: "purchasedFrom" must ALWAYS be the vendor/auction/dealer we bought from. It is NEVER Broadway.${docText}`;
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
  "disposedTo": "PURCHASER name (the customer, NOT Broadway)",
  "disposedAddress": "PURCHASER street address",
  "disposedCity": "PURCHASER city",
  "disposedState": "XX",
  "disposedZip": "PURCHASER zip code",
  "disposedDate": "YYYY-MM-DD",
  "disposedPrice": 12030,
  "disposedOdometer": 119629
}

CASE STUDIES FOR ACCURACY:
1. **MOTOR VEHICLE PURCHASE CONTRACT**:
   - PURCHASER: Look for "Print Name(s) of Purchaser(s)" (Example: "Thomas Digianvittorio").
   - PRICE: Use the "Total" (bottom of the COSTS AND DISCOUNTS section). (Example: 12030.00).
   - ODOMETER: Look for the hand-written or typed digits in the "Odometer Disclosure" boxes.
2. **GENERAL ROLE RULE**: "disposedTo" is ALWAYS the customer. It is NEVER Broadway.${docText}`;
}

function buildAutoPrompt(textOrEmpty) {
  const docText = textOrEmpty ? `\n\nDocument text:\n${textOrEmpty}` : '';
  return `Extract all vehicle information from this document. Return ONLY a raw JSON object.
Determine if this is an ACQUISITION (we bought) or a SALE (we sold). Our dealership is "Broadway Used Auto Sales".
If Broadway is the BUYER → this is an acquisition. Extract the SELLER info into purchasedFrom/usedVehicleSource fields.
If Broadway is the SELLER → this is a sale. Extract the PURCHASER info into disposed fields.

{
  "vin": "17-char VIN", "make": "", "model": "", "year": 0, "color": "", "mileage": 0,
  "titleNumber": "", "stockNumber": "",
  "purchasedFrom": "SELLER name if acquisition", "purchasePrice": 0, "purchaseDate": "YYYY-MM-DD",
  "usedVehicleSourceAddress": "", "usedVehicleSourceCity": "", "usedVehicleSourceState": "", "usedVehicleSourceZipCode": "",
  "disposedTo": "BUYER name if sale", "disposedAddress": "", "disposedCity": "", "disposedState": "", "disposedZip": "",
  "disposedDate": "YYYY-MM-DD", "disposedPrice": 0, "disposedOdometer": 0, "disposedDlNumber": "", "disposedDlState": ""
}${docText}`;
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
          { role: "system", content: "You are a document data extractor. Output ONLY valid JSON. No markdown, no explanation, no extra text." },
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

      const vp = page.getViewport({ scale: 2.0 });
      const cf = createCanvasFactory();
      const { canvas, context } = cf.create(Math.ceil(vp.width), Math.ceil(vp.height));
      await page.render({ canvasContext: context, viewport: vp, canvasFactory: cf }).promise;
      base64Image = canvas.toBuffer('image/jpeg', { quality: 0.85 }).toString('base64');
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
    // Use the same purpose-based prompts, but without document text (image is the source)
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
        model: "meta/llama-3.2-90b-vision-instruct",
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
  const s = v => String(v || '').trim();
  const n = v => {
    if (typeof v === 'number') return v;
    const cleanStr = String(v || '0').replace(/[$,]/g, '').trim();
    const matches = cleanStr.match(/-?\d+(\.\d+)?/g);
    if (!matches) return 0;
    const priceMatch = matches.find(m => m.includes('.'));
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
    titleNumber: s(d.titleNumber) || null,
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
  const worker = await createWorker('eng', 1, { langPath: ocrLangPath, gzip: true });
  try {
    const { data: { text } } = await worker.recognize(fileBuffer);
    return text;
  } finally {
    await worker.terminate();
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

