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
// ═══════════════════════════════════════════════════════════════
export async function extractVehicleInfo(fileBuffer, mimetype) {
  console.log(`[Parser] START | mime=${mimetype} | nvidia=${hasNvidiaKey}`);

  // For images — go straight to Vision AI
  if (mimetype.startsWith('image/')) {
    const visionResult = await visionExtract(fileBuffer, mimetype);
    if (visionResult) return visionResult;
    // Fallback: OCR the image then send text to LLM
    const ocrText = await ocrImage(fileBuffer);
    if (hasNvidiaKey && ocrText.length > 30) {
      const textResult = await textExtract(ocrText);
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
      const textResult = await textExtract(combinedText);
      if (textResult) return textResult;
    }

    // Scanned PDF — render to image, use vision
    const visionResult = await visionExtract(fileBuffer, mimetype);
    if (visionResult) return visionResult;

    return {};
  }

  // Word docs and other text
  const text = await extractText(fileBuffer, mimetype);
  if (hasNvidiaKey && text.length > 30) {
    const textResult = await textExtract(text);
    if (textResult) return textResult;
  }
  return {};
}

// ═══════════════════════════════════════════════════════════════
// TEXT LLM — One simple prompt, extract ALL fields
// ═══════════════════════════════════════════════════════════════
async function textExtract(text) {
  try {
    const prompt = `Read this vehicle document carefully and extract ALL information. Return ONLY a JSON object.
    
    VIN EXTRACTION RULE:
    - Extract the EXACT 17-character VIN accurately.
    - The VIN may be printed with widely spaced characters or in individual boxes. Read ALL characters from left to right.
    - Do NOT include any labels like "VIN:", "VIN NO:", or "Serial:" in the value. Return ONLY the 17 characters.
    - Pay special attention to the very first character. Do not skip it.

{
  "vin": "5FNYF4H61BB077174",
  "make": "Honda",
  "model": "Fit",
  "year": 2013,
  "color": "Black",
  "mileage": 135182,
  "titleNumber": "BN815993",
  "stockNumber": "477843",
  "purchasedFrom": "name of the SELLER of the vehicle",
  "purchasePrice": 4100,
  "purchaseDate": "2024-08-23",
  "usedVehicleSourceAddress": "seller street address",
  "usedVehicleSourceCity": "Norwood",
  "usedVehicleSourceState": "MA",
  "usedVehicleSourceZipCode": "02062",
  "disposedTo": "name of the BUYER/PURCHASER/CUSTOMER",
  "disposedAddress": "buyer street address",
  "disposedCity": "buyer city",
  "disposedState": "MA",
  "disposedZip": "02703",
  "disposedDate": "2025-02-11",
  "disposedPrice": 5300,
  "disposedOdometer": 135361,
  "disposedDlNumber": "S29353237",
  "disposedDlState": "MA"
}

IMPORTANT INSTRUCTIONS:
- "purchasePrice" = The TOTAL COST of the vehicle (look for 'Total Price', 'Grand Total', or the final bottom-line amount including any buyer fees).
- "disposedPrice" = The TOTAL SELLING PRICE for the customer (look for the 'Total' or 'Final Price' at the bottom of the costs section).
- "purchasedFrom" = whoever is labeled SELLER on the document. 
- "disposedTo" = whoever is labeled BUYER, PURCHASER, or "Print Name(s) of Purchaser(s)" on the document.
- If both SELLER and BUYER are shown, extract both.
- If this is an auction document (ADESA, Manheim, etc.), the SELLER is listed under "SELLER:" and the BUYER is listed under "BUYER:".
- If this is a retail Bill of Sale, look for "Seller's Printed Name" and "Purchaser's Printed Name".
- VIN must be exactly 17 characters. Remove spaces/dashes.
- All money values as plain numbers: 5300 not $5,300.00
- Dates as ISO 8601 (YYYY-MM-DD)
- Use null for any field not found. Do NOT guess.

Document text:
${text}`;

    console.log(`[Parser:Text] Sending ${text.length} chars to LLM...`);
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
        temperature: 0.05,
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
async function visionExtract(fileBuffer, mimetype) {
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
      base64Image = canvas.toBuffer('image/jpeg', { quality: 0.8 }).toString('base64');
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
    const prompt = `Read this vehicle document image and extract ALL data. Return ONLY a JSON object.

    VIN EXTRACTION RULE:
    - Extract the EXACT 17-character VIN accurately.
    - The VIN may be printed with widely spaced characters or in individual boxes. Read ALL characters from left to right.
    - Do NOT include any labels like "VIN:", "VIN NO:", or "Serial:" in the value. Return ONLY the 17 characters.
    - Look closely for the first and last characters of the VIN. Do not skip the first digit.

{
  "vin": "5FNYF4H61BB077174",
  "make": "Honda",
  "model": "Fit",
  "year": 2013,
  "color": "Black",
  "mileage": 135182,
  "titleNumber": "BN815993",
  "purchasedFrom": "SELLER name",
  "purchasePrice": 4100,
  "purchaseDate": "2024-08-23",
  "usedVehicleSourceAddress": "seller address",
  "usedVehicleSourceCity": "city",
  "usedVehicleSourceState": "MA",
  "usedVehicleSourceZipCode": "02062",
  "disposedTo": "BUYER/PURCHASER name",
  "disposedAddress": "buyer address",
  "disposedCity": "city",
  "disposedState": "MA",
  "disposedZip": "02703",
  "disposedDate": "2025-02-11",
  "disposedPrice": 5300,
  "disposedOdometer": 135361,
  "disposedDlNumber": "S29353237",
  "disposedDlState": "MA"
}

RULES:
- "purchasePrice" = The TOTAL amount paid (look for 'Total Price' or bottom-line amount).
- "disposedPrice" = The TOTAL amount sold for (look for 'Total' or 'Final Balance').
- "purchasedFrom" = SELLER on the document
- "disposedTo" = BUYER/PURCHASER on the document
- VIN = exactly 17 chars, no I/O/Q
- Money = plain numbers (5300 not $5,300)
- Use null if not found
- Return ONLY JSON`;

    console.log(`[Parser:Vision] Sending image to Vision AI...`);
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
        stream: false
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

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
  const n = v => { const x = parseFloat(String(v || '0').replace(/[^0-9.]/g, '')); return Number.isFinite(x) ? x : 0; };
  const i = v => { const x = parseInt(String(v || '0').replace(/\D/g, ''), 10); return Number.isFinite(x) ? x : 0; };
  const vin = s(d.vin).toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^(VIN|SERIAL|NUMBER|ID|VEHICLEID|IDENTIFICATION|STOCK|LOT|NO)+/, '')
    .replace(/[IOQ]/g, '')
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

