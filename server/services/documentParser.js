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
// POST-PROCESSING: Deterministic price & title extraction from raw text
// These run AFTER AI extraction and OVERRIDE the AI if they find better data
// ═══════════════════════════════════════════════════════════════

/**
 * Scans raw OCR/PDF text for a "TOTAL" line and extracts the dollar amount.
 * Returns the total price if found, or null if not found.
 */
function extractTotalFromText(text) {
  if (!text) return null;

  const lines = text.split(/\r?\n/);
  const amountRegex = /\$?\s*[\d,]+(?:\.\d{1,2})?/g;
  const totalMarkers = /\b(?:TOTAL|BALANCE\s+DUE|AMOUNT\s+DUE|TOTAL\s+DUE|DUE\s+NOW|AMOUNT\s+PAYABLE|NET\s+AMOUNT|BALANCE)\b/i;
  const skipMarkers = /\bSUBTOTAL\b/i;
  const excludeSaleMarkers = /\bTOTAL\s+(?:SALE|SELLING)\s+PRICE\b/i;
  const candidates = [];

  for (const line of lines) {
    if (!totalMarkers.test(line) || skipMarkers.test(line)) continue;
    if (excludeSaleMarkers.test(line)) continue;

    const matches = line.match(amountRegex);
    if (!matches) continue;

    for (const match of matches) {
      const value = parseFloat(match.replace(/[^0-9.]/g, ''));
      if (Number.isFinite(value) && value > 100) {
        candidates.push(value);
      }
    }
  }

  let totalPrice = candidates.length ? Math.max(...candidates) : null;

  if (!totalPrice) {
    const broadRegex = /\b(?:TOTAL|BALANCE\s+DUE|AMOUNT\s+DUE|TOTAL\s+DUE|DUE\s+NOW|AMOUNT\s+PAYABLE|NET\s+AMOUNT|BALANCE)\b[^\n]*?(\$?\s*[\d,]+(?:\.\d{1,2})?)/gi;
    let match;
    while ((match = broadRegex.exec(text)) !== null) {
      const value = parseFloat(match[1].replace(/[^0-9.]/g, ''));
      if (Number.isFinite(value) && value > 100) {
        candidates.push(value);
      }
    }
    if (candidates.length) totalPrice = Math.max(...candidates);
  }

  if (totalPrice) {
    console.log(`[Parser:PostProcess] Found TOTAL price from text: $${totalPrice}`);
  }
  return totalPrice;
}

function extractVinFromText(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^A-Z0-9\n]/gi, ' ').toUpperCase();
  const vinMatch = cleaned.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
  return vinMatch ? vinMatch[1] : null;
}

/**
 * Scans raw OCR/PDF text for title number patterns.
 * Returns the title number if found, or null.
 */
function extractTitleFromText(text) {
  if (!text) return null;

  const cleanCandidate = (candidate) => {
    if (!candidate) return null;
    const cleaned = String(candidate).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleaned || cleaned.length < 4 || cleaned.length > 12) return null;
    if (/^0+$/.test(cleaned)) return null;
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(cleaned)) return null; // avoid VIN
    return cleaned;
  };

  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const titleLineMatch = line.match(/\b(?:Title\s*(?:State\/?Number|#|No\.?|Number|State Number)|Certificate\s*(?:of\s*Title|No\.?|#)|Cert\s*(?:of\s*Origin)?|Title\s*ID|Document\s*(?:No\.?|ID))\b/i);
    if (!titleLineMatch) continue;

    const valueMatch = line.match(/(?:Title\s*(?:State\/?Number|#|No\.?|Number|State Number)|Certificate\s*(?:of\s*Title|No\.?|#)|Cert\s*(?:of\s*Origin)?|Title\s*ID|Document\s*(?:No\.?|ID))\s*[:\-]?\s*(?:([A-Z]{2})\s*[\/\\]\s*)?([A-Z0-9]{4,12})/i);
    if (valueMatch) {
      const titleNum = cleanCandidate(valueMatch[2]);
      if (titleNum) {
        console.log(`[Parser:PostProcess] Found Title Number (label format): ${titleNum}`);
        return titleNum;
      }
    }

    const slashMatch = line.match(/\b([A-Z]{2})\s*[\/\\]\s*([A-Z0-9]{4,12})\b/);
    if (slashMatch) {
      const candidate = cleanCandidate(slashMatch[2]);
      if (candidate) {
        console.log(`[Parser:PostProcess] Found Title Number (state/number format): ${candidate}`);
        return candidate;
      }
    }

    const fallbackMatch = line.match(/\b([A-Z]{1,2}[0-9]{4,12})\b/);
    if (fallbackMatch && /title/i.test(line)) {
      const candidate = cleanCandidate(fallbackMatch[1]);
      if (candidate) {
        console.log(`[Parser:PostProcess] Extracted Title Number from title line: ${candidate}`);
        return candidate;
      }
    }
  }

  // Final pass: find any labeled title state/number string in the whole text
  const globalMatch = text.match(/\b(?:Title\s*(?:State\/?Number|#|No\.?|Number)|Certificate\s*(?:of\s*Title|No\.?|#)|Cert\s*(?:of\s*Origin)?|Title\s*ID|Document\s*(?:No\.?|ID))\s*[:\-]?\s*(?:([A-Z]{2})\s*[\/\\]\s*)?([A-Z0-9]{4,12})\b/i);
  if (globalMatch) {
    const titleNum = cleanCandidate(globalMatch[2]);
    if (titleNum) {
      console.log(`[Parser:PostProcess] Found Title Number (global label scan): ${titleNum}`);
      return titleNum;
    }
  }

  return null;
}

/**
 * Apply post-processing fixes to AI result using raw document text.
 */
function mergeFallbackResult(result, fallback) {
  if (!fallback) return result;
  const merged = { ...result };
  for (const [key, value] of Object.entries(fallback)) {
    if (value === undefined || value === null || value === '') continue;
    if (merged[key] === undefined || merged[key] === null || merged[key] === '' || merged[key] === 0) {
      merged[key] = value;
    }
  }
  return merged;
}

function postProcessResult(result, rawText, purpose) {
  if (!result || !rawText) return result;

  // Fill missing VIN/title/price from raw text if AI returned partial output
  const fallback = extractFallbackInfo(rawText, purpose);
  result = mergeFallbackResult(result, fallback);

  // Fix price: override AI's "Sale Price" with the actual TOTAL
  // Only for ACQUISITION documents — sale documents (MA Title) don't have separate totals
  if (purpose === 'acquisition' || purpose === '') {
    const totalFromText = extractTotalFromText(rawText);
    if (totalFromText) {
      const priceField = 'purchasePrice';
      const currentPrice = Number(result[priceField] || 0);
      if (totalFromText > 100 && (currentPrice <= 0 || totalFromText >= currentPrice + 50)) {
        console.log(`[Parser:PostProcess] Overriding ${priceField}: ${currentPrice} → ${totalFromText} (TOTAL from document text)`);
        result[priceField] = totalFromText;
      }
    }
  }

  if (!result.titleNumber) {
    const titleFromText = extractTitleFromText(rawText);
    if (titleFromText) {
      console.log(`[Parser:PostProcess] Filling titleNumber from text: ${titleFromText}`);
      result.titleNumber = titleFromText;
    }
  }

  if (!result.vin) {
    const vinFromText = extractVinFromText(rawText);
    if (vinFromText) {
      console.log(`[Parser:PostProcess] Filling VIN from text: ${vinFromText}`);
      result.vin = vinFromText;
    }
  }

  return result;
}

function extractFallbackInfo(text, purpose) {
  if (!text) return null;
  const fallback = {};
  const vin = extractVinFromText(text);
  if (vin) fallback.vin = vin;
  const titleNumber = extractTitleFromText(text);
  if (titleNumber) fallback.titleNumber = titleNumber;
  const totalValue = extractTotalFromText(text);
  if (totalValue) {
    if (purpose === 'sale') {
      fallback.disposedPrice = totalValue;
    } else {
      fallback.purchasePrice = totalValue;
    }
  }
  return Object.keys(fallback).length ? fallback : null;
}

// ═══════════════════════════════════════════════════════════════
// SINGLE ENTRY POINT — Extract everything from any document
// purpose: "acquisition" | "sale" | "" (unknown)
// ═══════════════════════════════════════════════════════════════
export async function extractVehicleInfo(fileBuffer, mimetype, purpose = "") {
  console.log(`[Parser] START | mime=${mimetype} | purpose=${purpose || 'auto'} | nvidia=${hasNvidiaKey}`);

  // For images — go straight to Vision AI, then post-process with OCR text
  if (mimetype.startsWith('image/')) {
    // Always run OCR so we have raw text for post-processing
    const ocrText = await ocrImage(fileBuffer);
    
    try {
      const visionResult = await visionExtract(fileBuffer, mimetype, purpose);
      if (visionResult && (visionResult.vin || visionResult.make || visionResult.disposedTo)) {
        // Post-process: fix price and title using OCR text
        return postProcessResult(visionResult, ocrText, purpose);
      }
    } catch (err) {
      console.warn(`[Parser] Vision AI failed, falling back to OCR: ${err.message}`);
    }
    
    // Fallback: OCR text to LLM
    if (hasNvidiaKey && ocrText.length > 30) {
      try {
        const textResult = await textExtract(ocrText, purpose);
        if (textResult && (textResult.vin || textResult.make || textResult.disposedTo)) {
          return postProcessResult(textResult, ocrText, purpose);
        }
      } catch (err) {
        console.warn(`[Parser] Text LLM failed after OCR: ${err.message}`);
      }
    }

    const fallbackResult = extractFallbackInfo(ocrText, purpose);
    if (fallbackResult) return fallbackResult;

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
        if (textResult && (textResult.vin || textResult.make || textResult.disposedTo)) {
          return postProcessResult(textResult, combinedText, purpose);
        }
      } catch (err) {
        console.warn(`[Parser] Text LLM failed on native PDF text: ${err.message}`);
      }
    }

    // Scanned PDF or text extraction failed — render to image, use vision
    try {
      const visionResult = await visionExtract(fileBuffer, mimetype, purpose);
      if (visionResult) return postProcessResult(visionResult, combinedText, purpose);
    } catch (err) {
      console.warn(`[Parser] Vision AI failed on PDF render: ${err.message}`);
    }

    const fallbackResult = extractFallbackInfo(combinedText, purpose);
    if (fallbackResult) return fallbackResult;

    return {};
  }

  // Word docs and other text
  const text = await extractText(fileBuffer, mimetype);
  if (hasNvidiaKey && text.length > 30) {
    try {
      const textResult = await textExtract(text, purpose);
      if (textResult) return postProcessResult(textResult, text, purpose);
    } catch (err) {
      console.warn(`[Parser] Text LLM failed on Word/Other: ${err.message}`);
    }
  }

  const fallbackResult = extractFallbackInfo(text, purpose);
  if (fallbackResult) return fallbackResult;

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
3. BODY TYPE vs MODEL: "Body Type" (Sedan, SUV, Hatchback, Coupe) is NOT the model. "Model" is the vehicle name (Corolla, Camry, C250, E350, 328i, Wrangler). For luxury cars (Mercedes-Benz, BMW, Audi), the model is ALWAYS the alphanumeric code (e.g. C250). NEVER put "Sedan" or "SUV" in the model field.
4. TITLE NUMBER: This is CRITICAL. Extract if labeled "Certificate of Title", "Title No", "Title #", "Certificate No", or "Cert of Origin". It is usually an 8-10 digit alphanumeric code (e.g. BK182936).
5. PRICE (TOTAL ONLY): ALWAYS extract the ABSOLUTE TOTAL/BALANCE DUE (e.g. 7645.00). NEVER extract the "Sale Price" or "Selling Price" (e.g. 7200.00) if a larger TOTAL exists below it. Fees MUST be included.
6. Return ONLY a valid JSON object wrapped in JSON_START and JSON_END markers.
Example:
JSON_START
{ "vin": "...", ... }
JSON_END
No markdown, no explanation outside markers.`;

function buildAcquisitionPrompt(textOrEmpty) {
  const docText = textOrEmpty ? `\n\nDocument text:\n${textOrEmpty}` : '';
  return `Extract data from this VEHICLE ACQUISITION document. Broadway is the BUYER.

JSON_START
{
  "vin": "VIN (17 chars) or null",
  "make": "Manufacturer or null",
  "model": "Model name or null",
  "year": 2014,
  "color": "Color or null",
  "mileage": 131575,
  "titleNumber": "Number or null",
  "stockNumber": "Number or null",
  "purchasedFrom": "Seller or null",
  "purchasePrice": 6340,
  "purchaseDate": "YYYY-MM-DD or null",
  "usedVehicleSourceAddress": "Address or null",
  "usedVehicleSourceCity": "City or null",
  "usedVehicleSourceState": "XX or null",
  "usedVehicleSourceZipCode": "Zip or null"
}
JSON_END
IMPORTANT: If a value is missing or unclear, return null. NEVER return placeholder text like "exact 17-char VIN".

LABEL MAPPING:
- VIN: "VIN", "V.I.N. No.", "Vehicle Identification Number", "Serial #"
- Make/Model: "Make/Manufacturer" → make. "Model" → model. "Body Type" is NOT model.
- Mileage: "Odometer", "Miles", "Reading", "OVER 100,000", "EXEMPT" (means check title)
- Price: "TOTAL", "Balance Due", "Total Amount", "Amount Paid". YOU MUST SCROLL TO THE BOTTOM. The price MUST be the final balance due (selling price + fees). Ignore subtotals.
- Source (Obtained From): ALWAYS prioritize the AUCTION/FACILITY name and address (e.g. ADESA, Manheim, CarMax, Central Mass Auto Auction) as the "purchasedFrom" and source address. Even if a separate "SELLER" or "CONSIGNOR" is listed, we want the FACILITY details.
- Stock: "Stock #", "Lot #", "Unit ID", "Stock Number", "Inventory #"
- Title: "Title #", "Title State/Number", "Certificate #", "Cert of Origin" — return just the number

DOCUMENT-SPECIFIC:
- AMERICA'S AA (America's Auto Auction): Use "AMERICA'S AA BOSTON" and the North Billerica, MA address as the source. The TOTAL is at the absolute bottom of the price table on the right ($4,765.00 in the example). Title # is in the small box on the right (e.g. BJ713930).
- ADESA: Use the AUCTION FACILITY name and address (usually at the top or labeled "FACILITY") as the source, not the individual seller.
- CMAA: The price MUST be the one beside "TOTAL" or "TOTAL DUE", not "SALE PRICE". The Total is usually at the bottom-right of the table and includes buyer fees. Ignore the "Selling Price" column.
- CarMax: SELLER address is at the ABSOLUTE BOTTOM-RIGHT (e.g. "170 Turnpike Rd"). Broadway's address is in the middle table — IGNORE the middle table for address extraction. The price MUST be the "TOTAL" at the bottom of the table, not "Selling Price".
- Manheim: Use the "TRANSACTION LOCATION" or "REMIT PAYMENT TO" as the auction name and source address. Strip " US" from addresses.

NEVER use Broadway's address (100 BROADWAY / 2125 REVERE BEACH PKWY / NORWOOD, MA 02062) as the source address. If you see "BROADWAY USED AUTO SALES" in a table, the address beside it is the BUYER, not the seller.${docText}`;
}

function buildSalePrompt(textOrEmpty) {
  const docText = textOrEmpty ? `\n\nDocument text:\n${textOrEmpty}` : '';
  return `Extract data from this VEHICLE SALE document. Broadway is the SELLER.

JSON_START
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
JSON_END

LABEL MAPPING:
- VIN: "VIN", "Vehicle/Vessel Identification Number", "Vessel ID"
- Make/Model: "Make/Manufacturer" → make. "Model" → model. "Body Type" (Sedan/SUV/Hatchback) is NOT model.
- Purchaser: "Print Name(s) of Purchaser(s)", "Purchaser(s) Name(s)", "Buyer", "Sold To"
- Address: "Address" row under purchaser. City/State/Zip in labeled columns.
- Price: "Total Price", "Selling Price", "Sale Price", "Vehicle Sales Price". The price must be the final total, including fees. Look for "Total Due" or "Balance Due".
- Date: "Date of Sale", "Transaction Date", "Date"
- DL: "DL Number", "DL State", "Driver License"
- Title: "Certificate of Title Number", "Title #" — return just the alphanumeric code

MA TITLE TRANSFER FORM SPECIFIC:
- Layout: Year | Make/Manufacturer | Body Type | Model | Color
- "Body Type" column contains Sedan/SUV/Hatchback — do NOT put this in model field.
- "Selling Price" is often next to a "Salesperson" ID number (e.g. "6/17/2025 9121" where 9121 is the price). Ensure you don't confuse the Salesperson ID with the Price.
- Address may lack state code — infer MA if zip starts with 01xxx or 02xxx.
- "Selling Price" is a bare number without $ sign.

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

JSON_START
{
  "vin": "17-char VIN", "make": "", "model": "model name NOT body type", "year": 0, "color": "", "mileage": 0,
  "titleNumber": null, "stockNumber": "",
  "purchasedFrom": "SELLER name if acquisition", "purchasePrice": 0, "purchaseDate": "YYYY-MM-DD",
  "usedVehicleSourceAddress": "SELLER street", "usedVehicleSourceCity": "", "usedVehicleSourceState": "XX", "usedVehicleSourceZipCode": "",
  "disposedTo": "BUYER name if sale", "disposedAddress": "BUYER street", "disposedCity": "", "disposedState": "XX", "disposedZip": "",
  "disposedDate": "YYYY-MM-DD", "disposedPrice": 0, "disposedOdometer": 0,
  "disposedDlNumber": "", "disposedDlState": "XX"
}
JSON_END

RULES:
- "Body Type" (Sedan/SUV/Hatchback/Coupe) is NOT the model. Model = vehicle name (Corolla, Pilot, Focus).
- Price: The price must be the final total, including fees. Look for "Total Due" or "Balance Due".
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
    const jsonMatch = raw.match(/JSON_START\s*(\{[\s\S]*\})\s*JSON_END/) || raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
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
      base64Image = canvas.toBuffer('image/jpeg', { quality: 0.6 }).toString('base64');
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
    const jsonMatch = raw.match(/JSON_START\s*(\{[\s\S]*\})\s*JSON_END/) || raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in vision response');

    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
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

// ZIP prefix -> state code mapping for inferring missing states
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
    if (/^(null|undefined|none|n\/a|unknown|unknow|pending|unknown unknown|unknow unknow|0|-|exact 17-char VIN|manufacturer|model name ONLY|color|SELLER|YYYY-MM-DD)$/i.test(str)) return '';
    return str;
  };
  const n = v => {
    if (typeof v === 'number') return v;
    const cleanStr = String(v || '0').trim();
    const matches = cleanStr.replace(/[$,]/g, '').match(/-?\d+(\.\d+)?/g);
    if (!matches) return 0;
    
    const numericMatches = matches.map(m => parseFloat(m)).filter(num => Number.isFinite(num));
    if (numericMatches.length === 0) return 0;
    
    // User wants the "belowest" (last) one. 
    // We'll filter out years (1900-2026) to avoid model years.
    const candidates = numericMatches.filter(num => num > 2026 || num < 1900);
    if (candidates.length > 0) return candidates[candidates.length - 1];

    return numericMatches[numericMatches.length - 1];
  };
  const i = (v, isYear = false) => {
    if (typeof v === 'number') return v;
    const cleanStr = String(v || '0').replace(/[,]/g, '').trim();
    const matches = cleanStr.match(/\d+/g);
    if (!matches) return 0;
    
    if (isYear) {
      // Find a 4-digit number between 1900 and 2030
      const yearMatch = matches.find(m => m.length === 4 && parseInt(m, 10) > 1900 && parseInt(m, 10) < 2030);
      if (yearMatch) return parseInt(yearMatch, 10);
    }

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
        // Support 5-digit or 9-digit (ZIP+4) codes
        const stateZipMatch = lastPart.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/i);
        if (stateZipMatch || /^[A-Z]{2}$/i.test(lastPart)) {
          return {
            a: parts.slice(0, -2).join(',').trim() || rawAddr,
            c: city || cityPart,
            s: state || (stateZipMatch ? stateZipMatch[1] : lastPart),
            z: zip || (stateZipMatch ? stateZipMatch[2] : null)
          };
        }
      }
      
      // 2. Try regex fallback for "City ST 12345" or "City, ST 12345-6789"
      const geoMatch = rawAddr.match(/([^,]+)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)?$/i);
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
      // Strip labels and body types
      return raw.replace(/^(make|manufacturer|mfr)[\s.:##-]*/i, '')
        .replace(/\b(sedan|suv|coupe|truck|van|wagon|hatchback|convertible|sport\s*utility)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim() || null;
    })(),
    model: (() => {
      const raw = s(d.model);
      if (!raw) return null;
      // Strip body types that may have been prepended or embedded
      const bodyTypes = /\b(sedan|suv|coupe|truck|van|wagon|hatchback|convertible|sport\s*utility\s*v?)\b/gi;
      return raw.replace(bodyTypes, '').replace(/\s+/g, ' ').trim() || raw;
    })(),
    year: i(d.year, true) || null,
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
        .replace(/\s/g, '')         // Strip all internal whitespace for consistency
        .trim();
      
      if (!cleaned || cleaned.length < 4) return null;
      
      // Reject if the "title number" is actually the VIN (17 chars, all alphanum)
      const vinCandidate = cleaned.replace(/[^A-Z0-9]/gi, '');
      if (vinCandidate.length === 17 && vin && vinCandidate === vin) return null;
      
      return cleaned.toUpperCase();
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
    const maxDim = 2048; // Reverting to high resolution for absolute accuracy on price/fees
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
    return canvas.toBuffer('image/jpeg', { quality: 0.85 });
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

