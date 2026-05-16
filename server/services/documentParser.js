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

async function getTesseractWorker() {
  return await createWorker('eng', 1, { langPath: ocrLangPath, gzip: true });
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

function isPdfMimeType(mimetype) {
  return [
    'application/pdf',
    'application/x-pdf',
    'application/acrobat',
    'applications/vnd.pdf',
    'text/pdf'
  ].includes(String(mimetype).toLowerCase());
}

function isPdfBuffer(fileBuffer) {
  if (!fileBuffer || !fileBuffer.length) return false;
  const header = fileBuffer.slice(0, 5).toString('utf8');
  return header === '%PDF-';
}

function determineDocumentPurpose(text) {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, ' ').trim();
  let score = 0;

  const scoreMatch = (regex, points) => {
    if (regex.test(normalized)) score += points;
  };

  scoreMatch(/\b(?:Sale Price|Vehicle Sales Price|Vehicle Sales Amount|Sold Price|Sold To|Purchaser\(s\)?|Purchaser|Buyer Name|Buyer:|Purchaser:|Transferred To|Disposition of Motor Vehicle|Vehicle Sales Price)\b/i, 2);
  scoreMatch(/\b(?:Purchase Price|Total Due|Amount Due|Balance Due|Buyer Fee|Obtained From|Purchased From|Seller:|Consignor|Auction Location|Facility|Remit Payment To|Acquisition of Motor Vehicle)\b/i, -2);
  scoreMatch(/\b(?:Bill of Sale|Motor Vehicle Purchase Contract|Wholesale Bill of Sale|Buyers Receipt|Purchaser\(s\) Name\(s\))\b/i, 1);
  scoreMatch(/\b(?:Auction Bill of Sale|Invoice to Buyer from|Buyer Fee)\b/i, -1);

  if (score > 0) return 'sale';
  if (score < 0) return 'acquisition';
  return null;
}

// ═══════════════════════════════════════════════════════════════
// POST-PROCESSING: Deterministic price & title extraction from raw text
// These run AFTER AI extraction and OVERRIDE the AI if they find better data
// ═══════════════════════════════════════════════════════════════

/**
 * Scans raw OCR/PDF text for a "TOTAL" line and extracts the dollar amount.
 * Returns the total price if found, or null if not found.
 */
function extractTotalFromText(text, purpose = '') {
  if (!text) return null;

  const lines = text.split(/\r?\n/);
  const amountRegex = /(\$|USD)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;
  const totalMarkers = /\b(?:TOTAL\s*(?:AMOUNT|DUE|PAYABLE)?|BALANCE\s+DUE|AMOUNT\s+DUE|TOTAL\s+DUE|DUE\s+NOW|AMOUNT\s+PAYABLE|NET\s+AMOUNT|BALANCE|INVOICE\s+TOTAL|BILL\s+TOTAL)\b(?!\s*FORWARD)/i;
  const purchaseMarkers = /\b(?:PURCHASE\s*PRICE|AMOUNT\s*DUE|BALANCE\s*DUE|TOTAL\s*DUE|TOTAL\s*AMOUNT|AMOUNT\s*PAYABLE|NET\s*AMOUNT|INVOICE\s*TOTAL|BILL\s*TOTAL|BUYER\s*FEE)\b/i;
  const saleMarkers = /\b(?:SALE\s*PRICE|SELLING\s*PRICE|VEHICLE\s*SALES\s*PRICE|SOLD\s*PRICE|SALE\s*AMOUNT|SELLING\s*AMOUNT)\b/i;
  const skipMarkers = /\bSUBTOTAL\b/i;
  const excludeSaleMarkers = /\bTOTAL\s+(?:SALE|SELLING)\s+PRICE\b/i;
  const minValue = purpose === 'acquisition' || purpose === 'sale' ? 50 : 10;
  const candidates = [];

  const extractAmounts = (source) => {
    const matches = [...source.matchAll(amountRegex)];
    return matches.map(match => parseFloat(match[2].replace(/,/g, ''))).filter(value => Number.isFinite(value));
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (skipMarkers.test(line)) continue;
    if (purpose === 'acquisition' && saleMarkers.test(line)) continue;
    if (!totalMarkers.test(line) && !purchaseMarkers.test(line)) continue;
    if (excludeSaleMarkers.test(line)) continue;

    const combined = [line, lines[i + 1] || '', lines[i - 1] || ''].join(' ');
    const values = extractAmounts(combined);
    if (!values.length) continue;

    const weight =
      (totalMarkers.test(line) ? 10 : 0) +
      (purchaseMarkers.test(line) ? 8 : 0) -
      (saleMarkers.test(line) ? 20 : 0);

    for (const value of values) {
      if (value >= minValue) candidates.push({ value, weight });
    }
  }

  if (!candidates.length) {
    const footerLines = lines.slice(-12).join(' ');
    const values = extractAmounts(footerLines);
    for (const value of values) {
      if (value >= minValue) candidates.push({ value, weight: 1 });
    }
  }

  let totalPrice = null;
  if (candidates.length) {
    const sorted = candidates
      .map((candidate) => (typeof candidate === 'number' ? { value: candidate, weight: 1 } : candidate))
      .sort((a, b) => b.weight - a.weight || b.value - a.value);
    totalPrice = sorted[0]?.value || null;
  }

  if (!totalPrice) {
    const broadRegex = /\b(?:TOTAL\s*(?:AMOUNT|DUE|PAYABLE)?|BALANCE\s+DUE|AMOUNT\s+DUE|TOTAL\s+DUE|DUE\s+NOW|AMOUNT\s+PAYABLE|NET\s+AMOUNT|BALANCE)(?!\s*FORWARD)\b[\s:\-]*([^\n]*)/gi;
    let match;
    while ((match = broadRegex.exec(text)) !== null) {
      const values = extractAmounts(match[1]);
      for (const value of values) {
        if (value >= minValue) candidates.push({ value, weight: 1 });
      }
    }
    if (candidates.length) {
      const sorted = candidates
        .map((candidate) => (typeof candidate === 'number' ? { value: candidate, weight: 1 } : candidate))
        .sort((a, b) => b.weight - a.weight || b.value - a.value);
      totalPrice = sorted[0]?.value || null;
    }
  }

  if (totalPrice) {
    console.log(`[Parser:PostProcess] Found TOTAL price from text: $${totalPrice}`);
  }
  return totalPrice;
}

function extractVinFromText(text) {
  if (!text) return null;

  const normalizeVin = (vin) => vin.replace(/[IOQ]/g, (char) => (char === 'I' ? '1' : '0'));
  const candidates = new Set();

  const normalizedText = text.replace(/[^A-Z0-9\n]/gi, ' ').toUpperCase();
  for (const match of normalizedText.match(/\b[A-HJ-NPR-Z0-9]{17}\b/g) || []) {
    candidates.add(match);
  }

  const flatten = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (let i = 0; i + 17 <= flatten.length; i++) {
    const candidate = flatten.slice(i, i + 17);
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(candidate)) {
      candidates.add(candidate);
    }
  }

  const vinLabelPattern = /\bVIN\b[:\s]*([A-Z0-9\s-]{17,40})/i;
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(vinLabelPattern);
    if (!match) continue;
    const condensed = match[1].replace(/[^A-Z0-9]/gi, '').toUpperCase();
    for (let i = 0; i + 17 <= condensed.length; i++) {
      const candidate = condensed.slice(i, i + 17);
      if (/^[A-HJ-NPR-Z0-9]{17}$/.test(candidate)) {
        candidates.add(candidate);
      }
    }
  }

  for (const candidate of candidates) {
    if (isValidVin(candidate)) return candidate;
  }

  for (const candidate of candidates) {
    const fixed = normalizeVin(candidate);
    if (fixed !== candidate && isValidVin(fixed)) return fixed;
  }

  return candidates.values().next().value || null;
}

/**
 * Scans raw OCR/PDF text for title number patterns.
 * Returns the title number if found, or null.
 */
function extractTitleFromText(text) {
  if (!text) return null;

  const lines = text.split(/\r?\n/);
  const joined = lines.join('\n');

  const layoutPatterns = [
    /\bTitle\s+State\s*\/\s*Number\s*[:#-]?\s*([A-Z]{2})\s*\/?\s*([A-Z]{1,4}\d{4,9})\b/i,
    /\bTitle\s+State\s*\/\s*Number\s*[:#-]?\s*([A-Z]{2}[A-Z]{1,4}\d{4,9})\b/i,
    /\bState\s+Title\s*#\s+V\.?I\.?N\.?\s*No\.?\s*\n?\s*([A-Z]{2})\s+([A-Z]{1,4}\d{4,9})\b/i,
    /\b([A-Z]{2})\s*\|\s*([A-Z]{1,4}\d{4,9})\s+(?=[A-HJ-NPR-Z0-9]{17}\b)/i,
    /\b(?:MA|CT|RI|NH|NY|NJ)\s+([A-Z]{1,4}\d{4,9})\s+(?=[A-HJ-NPR-Z0-9]{17}\b)/i,
    /\bTitle\s*#\s*[:#-]?\s*([A-Z]{1,4}\d{4,9})\b/i,
    /\bCertificate\s+of\s+Title\s+Number\s*[:#-]?\s*([A-Z]{1,4}\d{4,9})\b/i,
  ];

  for (const pattern of layoutPatterns) {
    const match = joined.match(pattern);
    if (!match) continue;
    const candidate = normalizeTitleNumber(match[2] || match[1]);
    if (candidate) {
      console.log(`[Parser:PostProcess] Found Title Number: ${candidate}`);
      return candidate;
    }
  }

  const titleMarkers = /\b(?:TITLE\s*(?:NUMBER|NO\.?|#|STATE\s*NUMBER|STATE\s*\/\s*NUMBER)|CERTIFICATE\s*(?:OF\s*TITLE)?\s*(?:NUMBER|NO\.?|#)?|TITLE\s*ID)\b/i;

  const candidateFromLine = (line) => {
    const valueMatch = line.match(/(?:TITLE\s*(?:NUMBER|NO\.?|#|STATE\s*NUMBER|STATE\s*\/\s*NUMBER)|CERTIFICATE\s*(?:OF\s*TITLE)?\s*(?:NUMBER|NO\.?|#)?|TITLE\s*ID)\s*[:#\-\s]*((?:[A-Z]{2}\s*\/?\s*)?[A-Z]{1,4}\d{4,9})\b/i);
    return valueMatch ? normalizeTitleNumber(valueMatch[1]) : null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (!titleMarkers.test(line)) continue;

    const candidate = candidateFromLine(line) || candidateFromLine(lines[i + 1] || '');
    if (candidate) {
      console.log(`[Parser:PostProcess] Found Title Number: ${candidate} from line: ${line}`);
      return candidate;
    }
  }

  const globalMatch = text.match(/\b(?:TITLE\s*(?:NUMBER|NO\.?|#|STATE\s*NUMBER|STATE\s*\/\s*NUMBER)|CERTIFICATE\s*(?:OF\s*TITLE)?\s*(?:NUMBER|NO\.?|#)?|TITLE\s*ID)\s*[:#\-\s]*((?:[A-Z]{2}\s*\/?\s*)?[A-Z]{1,4}\d{4,9})\b/i);
  if (globalMatch) {
    const candidate = normalizeTitleNumber(globalMatch[1]);
    if (candidate) {
      console.log(`[Parser:PostProcess] Found Title Number (global): ${candidate}`);
      return candidate;
    }
  }

  return null;
}

function normalizeTitleNumber(candidate) {
  if (!candidate) return null;
  let cleaned = String(candidate).toUpperCase().replace(/[^A-Z0-9/]/g, '');
  if (!cleaned) return null;
  cleaned = cleaned.replace(/^[A-Z]{2}\//, '');

  const statePrefixMatch = cleaned.match(/^(MA|CT|RI|NH|NY|NJ|VT|ME)([A-Z]{1,4}\d{4,9})$/);
  if (statePrefixMatch) cleaned = statePrefixMatch[2];

  cleaned = cleaned.replace(/[^A-Z0-9]/g, '');
  if (!cleaned || cleaned.length < 5 || cleaned.length > 12) return null;
  if (/^0+$/.test(cleaned)) return null;
  if (/^[A-HJ-NPR-Z0-9]{17}$/.test(cleaned)) return null;
  if ((cleaned.match(/\d/g) || []).length < 2) return null;
  if (/^(TITLE|TITL|INFORMATION|INFO|WARRANTY|WARR|ATTACHED|ABSENT|PENDING|NONE|NO|CERTIFICATE|ORIGIN|VEHICLE|STATE|NUMBER|DOCUMENT|SALVAGE|REBUILT|PARTS|REPAIRABLE)$/i.test(cleaned)) return null;
  if (/^(TITLE|CERT|DOC|INFO|WARR)/i.test(cleaned) && (cleaned.match(/\d/g) || []).length < 4) return null;
  return cleaned;
}

/**
 * Apply post-processing fixes to AI result using raw document text.
 */
function mergeFallbackResult(result, fallback) {
  if (!fallback) return result;
  const merged = { ...result };
  const isSuspiciousValue = (val) => {
    if (!val || typeof val !== 'string') return false;
    const v = val.toLowerCase();
    if (/\b(http:|https:|www\.|\.com|\.net|inventory|stock#|stock:|sku|\/inventory)\b/.test(v)) return true;
    if (/\b(invoice|click here|learn more)\b/.test(v)) return true;
    return false;
  };
  for (const [key, value] of Object.entries(fallback)) {
    if (value === undefined || value === null || value === '') continue;
    const target = merged[key];
    if (target === undefined || target === null || target === '' || target === 0) {
      // Do not accept unreasonable numeric totals from fallback
      if ((key === 'purchasePrice' || key === 'disposedPrice') && !isReasonableTotal(value)) {
        continue;
      }
      merged[key] = value;
      continue;
    }
    // Prefer fallback if existing value looks like a hallucinated link/inventory token
    if (isSuspiciousValue(target) && !isSuspiciousValue(value)) {
      merged[key] = value;
    }
    // If existing numeric price looks unreasonable, prefer a reasonable fallback
    if ((key === 'purchasePrice' || key === 'disposedPrice')) {
      const parseNum = (v) => {
        if (v === undefined || v === null) return NaN;
        const n = Number(String(v).replace(/[^0-9.-]+/g, ''));
        return Number.isFinite(n) ? n : NaN;
      };
      const targetNum = parseNum(target);
      const valueNum = parseNum(value);
      const targetBad = !isReasonableTotal(targetNum);
      const valueGood = isReasonableTotal(valueNum);
      if (targetBad && valueGood) {
        merged[key] = valueNum;
      } else if (targetBad && !valueGood) {
        // remove obviously bad numeric value if no good fallback
        delete merged[key];
      }
    }
  }
  return merged;
}

// Basic sanity checks for numeric totals/prices
function isReasonableTotal(value) {
  if (value === undefined || value === null) return false;
  const num = Number(value);
  if (!Number.isFinite(num)) return false;
  // Reject obviously OCR-misread huge values
  if (num > 100000) return false;
  // Reject negative, zero, or tiny values that are unlikely to be vehicle totals
  if (num < 50) return false;
  return true;
}

function postProcessResult(result, rawText, purpose) {
  if (!result || !rawText) return result;

  // Fill missing VIN/title/price from raw text if AI returned partial output
  const fallback = extractFallbackInfo(rawText, purpose);
  result = mergeFallbackResult(result, fallback);

  // Also parse the raw text deterministically and prefer those values for
  // acquisition/disposition contact fields when the AI output looks suspicious
  try {
    const parsed = extractVehicleInfoFromText(rawText || '');
    const preferFields = [
      'purchasedFrom',
      'usedVehicleSourceAddress',
      'usedVehicleSourceCity',
      'usedVehicleSourceState',
      'usedVehicleSourceZipCode',
      'disposedTo',
      'disposedAddress',
      'disposedCity',
      'disposedState',
      'disposedZip'
    ];
    const isSuspicious = (v) => !v ? false : /\b(http:|https:|www\.|\.com|inventory|stock#|stock:|sku)\b/i.test(String(v));
    for (const f of preferFields) {
      if ((!result[f] || isSuspicious(result[f])) && parsed[f]) {
        result[f] = parsed[f];
      }
    }

    const mergeParsedPrice = (field) => {
      const parsedValue = parsed[field];
      if (Number.isFinite(parsedValue) && isReasonableTotal(parsedValue)) {
        const existing = Number(result[field] || 0);
        if (!isReasonableTotal(existing) || existing === 0) {
          result[field] = parsedValue;
        }
      }
    };
    mergeParsedPrice('purchasePrice');
    mergeParsedPrice('disposedPrice');

    // If document contains explicit 'auction' markers, prefer that as purchasedFrom
    const auction = inferAuctionFromText(rawText || '');
    if ((purpose === 'acquisition' || /\bauction\b/i.test(rawText)) && auction) {
      result.purchasedFrom = auction;
    }
    if (purpose === 'acquisition' || purpose === '') {
      result = mergePreferredFields(result, extractAcquisitionDetailsFromText(rawText || ''), [
        'purchasedFrom',
        'usedVehicleSourceAddress',
        'usedVehicleSourceCity',
        'usedVehicleSourceState',
        'usedVehicleSourceZipCode'
      ]);
    }
    if (purpose === 'sale') {
      result = mergePreferredFields(result, extractDispositionDetailsFromText(rawText || ''), [
        'disposedTo',
        'disposedAddress',
        'disposedCity',
        'disposedState',
        'disposedZip'
      ]);
    }
  } catch (err) {
    // parsing fallback failed — ignore
  }

  // If AI got confused and put acquisition data into sale fields, flip it
  if (purpose === 'acquisition' || purpose === '') {
    if (!result.purchasedFrom && result.disposedTo) {
      console.log(`[Parser:PostProcess] AI flipped roles. Moving disposedTo -> purchasedFrom`);
      result.purchasedFrom = result.disposedTo;
    }
    if (!result.usedVehicleSourceAddress && result.disposedAddress) {
      result.usedVehicleSourceAddress = result.disposedAddress;
      result.usedVehicleSourceCity = result.disposedCity;
      result.usedVehicleSourceState = result.disposedState;
      result.usedVehicleSourceZipCode = result.disposedZip;
    }
    if (!result.purchasePrice && result.disposedPrice) {
      result.purchasePrice = result.disposedPrice;
    }
  }

  // Fix price: override AI's sale values with the actual TOTAL if reasonable.
  const totalFromText = extractTotalFromText(rawText);
  if (totalFromText) {
    const total = Number(totalFromText);
    if (!isReasonableTotal(total)) {
      console.log(`[Parser:PostProcess] Skipping TOTAL override: ${total} flagged as unreasonable`);
    } else {
      // Accept both 'sale' and legacy 'disposition' for sale-purpose
      const isSalePurpose = purpose === 'sale' || purpose === 'disposition';
      if (purpose === 'acquisition' || purpose === '') {
        const priceField = 'purchasePrice';
        const currentPrice = Number(result[priceField] || 0);
        // Only override if we don't have a price or the extracted total is clearly the document total
        if (!currentPrice || (total > currentPrice && total <= currentPrice * 20)) {
          console.log(`[Parser:PostProcess] Overriding ${priceField}: ${currentPrice} → ${total} (TOTAL from document text)`);
          result[priceField] = total;
        } else {
          console.log(`[Parser:PostProcess] Not overriding ${priceField}: current=${currentPrice} total=${total}`);
        }
      }

      if (isSalePurpose) {
        const priceField = 'disposedPrice';
        const currentPrice = Number(result[priceField] || 0);
        if (!currentPrice || (total > currentPrice && total <= currentPrice * 20)) {
          console.log(`[Parser:PostProcess] Overriding ${priceField}: ${currentPrice} → ${total} (TOTAL from document text)`);
          result[priceField] = total;
        } else {
          console.log(`[Parser:PostProcess] Not overriding ${priceField}: current=${currentPrice} total=${total}`);
        }
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

// Heuristic to infer auction name from raw document text
function inferAuctionFromText(text) {
  if (!text) return null;
  const m = text.match(/([A-Z0-9 &'"-]{3,}?)\s+(?:AUCTION|AUTO AUCTION|VEHICLE AUCTION|AUCTIONS)\b/i);
  if (m) return m[1].trim();
  const m2 = text.match(/Auction[:\s-]+(.+?)(?:\r?\n|$)/i);
  if (m2) return m2[1].trim();
  return null;
}

const BROADWAY_PATTERN = /\b(BROADWAY USED AUTO SALES|AUTO SALES ON BROADWAY|100 BROADWAY|2125 REVERE BEACH|NORWOOD,?\s+MA\s+02062|EVERETT,?\s+MA\s+02149)\b/i;
const AUCTION_NAME_PATTERN = /\b(ADESA|MANHEIM|CARMAX|CMAA|CENTRAL MASS(?:ACHUSETTS)? AUTO AUCTION|AMERICA'?S (?:AA|AUTO AUCTION)|ACV|COPART|IAAI|AUTO AUCTION|AUCTION)\b/i;
const STREET_PATTERN = /^\d{1,6}\s+.+\b(?:ST|STREET|RD|ROAD|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|LN|LANE|PKWY|PARKWAY|HWY|HIGHWAY|WAY|CT|COURT|PL|PLACE|PIKE|TURNPIKE)\b\.?/i;
const CITY_STATE_ZIP_PATTERN = /([A-Za-z .'-]+),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/i;

function mergePreferredFields(base, preferred, fields) {
  if (!preferred) return base;
  const merged = { ...base };
  for (const field of fields) {
    const value = preferred[field];
    if (value !== undefined && value !== null && value !== '') merged[field] = value;
  }
  return merged;
}

function normalizeDocumentLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function isBroadwayValue(value) {
  return BROADWAY_PATTERN.test(String(value || ''));
}

function isHeaderishAddress(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  if (/^(address|city|state|zip|zip code|city state|city state zip|city state zp code)$/i.test(text)) return true;
  if (!/\d/.test(text) && /\b(city|state|zip|address)\b/i.test(text)) return true;
  return false;
}

function cleanRoleName(value) {
  if (!value) return null;
  const cleaned = String(value)
    .replace(/^\s*(?:BUYER|PURCHASER|SOLD TO|CUSTOMER|SELLER|DEALER|CONSIGNOR|FACILITY|AUCTION|REMIT PAYMENT TO|TRANSACTION LOCATION|BILL TO|SHIP TO)\b\s*[:#-]*/i, '')
    .replace(/\b(?:ADDRESS|ADDR|CITY|STATE|ZIP|DATE|VIN|STOCK|LOT|INVOICE|TOTAL)\b.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[.,;:\s]+$/g, '')
    .trim();
  if (!cleaned || cleaned.length < 3 || /^'?s$/i.test(cleaned) || isBroadwayValue(cleaned)) return null;
  return cleaned;
}

export function cleanDispositionName(value) {
  if (!value) return null;
  let cleaned = String(value || '').trim();
  cleaned = cleaned
    .replace(/^\s*(?:BUYER\s+NAME|BUYER|PURCHASER(?:\(S\))?\s+NAME(?:\(S\))?|PURCHASER|SOLD TO|CUSTOMER|TRANSFERRED TO)\s*[:#-]*/i, '')
    .replace(/\b(?:ADDRESS|ADDR|CITY|STATE|ZIP|DATE OF SALE|TRANSACTION DATE)\b.*$/i, '')
    .replace(/\b(?:DL|D\/L|DRIVER'?S?\s+LICENSE|LICENSE|LIC|AHTL|PHONE|TEL|DOB|SSN|SALESPERSON|SELLING PRICE|PRICE)\b.*$/i, '')
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, ' ')
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, ' ')
    .replace(/\$?\d[\d,]*(?:\.\d{2})?/g, ' ')
    .replace(/[#()[\]{}|]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[.,;:\s]+$/g, '')
    .trim();

  cleaned = cleaned
    .split(/\s+/)
    .filter((token) => !/\d/.test(token))
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleaned || cleaned.length < 3) return null;
  return cleaned;
}

function splitAddressParts(street, cityStateZip) {
  const streetValue = String(street || '').replace(/\s+US$/i, '').trim();
  const geoValue = String(cityStateZip || '').replace(/\s+US$/i, '').trim();
  const match = geoValue.match(CITY_STATE_ZIP_PATTERN) || streetValue.match(CITY_STATE_ZIP_PATTERN);
  const addressOnly = match && streetValue.includes(match[0])
    ? streetValue.replace(match[0], '').replace(/,\s*$/, '').trim()
    : streetValue;
  return {
    address: addressOnly || null,
    city: match ? match[1].replace(/,$/, '').trim() : null,
    state: match ? match[2].toUpperCase() : null,
    zip: match ? match[3] : null
  };
}

function findAddressNear(lines, startIndex, direction = 1, window = 8) {
  const end = direction > 0
    ? Math.min(lines.length, startIndex + window + 1)
    : Math.max(-1, startIndex - window - 1);

  for (let i = startIndex; direction > 0 ? i < end : i > end; i += direction) {
    const line = lines[i] || '';
    const inline = line.match(/(?:^|\s)Address(?!\()(?: \(number and street\))?\s*[:#-]?\s*(.+?)(?=\s+City\b|\s+State\b|\s+Zip\b|$)/i);
    const street = inline?.[1]?.trim() || (STREET_PATTERN.test(line) ? line : null);
    if (!street || isHeaderishAddress(street) || isBroadwayValue(street)) continue;

    const sameLineGeo = line.match(CITY_STATE_ZIP_PATTERN)?.[0] || '';
    const nextGeoLine = [lines[i + 1] || '', lines[i + 2] || ''].find((candidate) => CITY_STATE_ZIP_PATTERN.test(candidate)) || '';
    const parts = splitAddressParts(street, sameLineGeo || nextGeoLine);

    if (!parts.city) {
      const city = line.match(/\bCity(?: or Town)?\s*[:#-]?\s*([A-Za-z .'-]+?)(?=\s+State\b|\s+Zip\b|$)/i)?.[1]?.trim();
      const state = line.match(/\bState\s*[:#-]?\s*([A-Z]{2})\b/i)?.[1]?.toUpperCase();
      const zip = line.match(/\bZip(?: Code)?\s*[:#-]?\s*(\d{5}(?:-\d{4})?)/i)?.[1];
      if (city || state || zip) {
        parts.city = city || parts.city;
        parts.state = state || parts.state;
        parts.zip = zip || parts.zip;
      }
    }

    return parts;
  }

  return null;
}

function findNameNear(lines, startIndex, labelRegex, window = 5) {
  for (let i = startIndex; i < Math.min(lines.length, startIndex + window); i++) {
    const line = lines[i] || '';
    const inline = line.match(labelRegex);
    if (inline?.[1]) {
      const name = cleanDispositionName(inline[1]) || cleanRoleName(inline[1]);
      if (name) return name;
    }
    if (i > startIndex && !STREET_PATTERN.test(line) && !CITY_STATE_ZIP_PATTERN.test(line) && !/\b(Address|City|State|Zip|VIN|Total|Price|Date)\b/i.test(line)) {
      const name = cleanDispositionName(line) || cleanRoleName(line);
      if (name) return name;
    }
  }
  return null;
}

export function extractAcquisitionDetailsFromText(text) {
  const lines = normalizeDocumentLines(text);
  if (!lines.length) return {};

  const carMax = extractCarMaxAcquisitionDetails(lines);
  if (Object.keys(carMax).length) return carMax;

  const cmaa = extractCmaaAcquisitionDetails(lines);
  if (Object.keys(cmaa).length) return cmaa;

  const knownAuction = extractKnownAuctionAcquisitionDetails(lines);
  if (Object.keys(knownAuction).length) return knownAuction;

  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isBroadwayValue(line)) continue;

    const isAuctionLine = AUCTION_NAME_PATTERN.test(line);
    const isFacilityLine = /\b(FACILITY|TRANSACTION LOCATION|REMIT PAYMENT TO|AUCTION LOCATION)\b/i.test(line);
    const isSellerLine = /\b(SELLER|CONSIGNOR|SOLD BY|FROM)\b/i.test(line);
    if (!isAuctionLine && !isFacilityLine && !isSellerLine) continue;

    const name = cleanRoleName(
      line.match(/(?:Facility|Transaction Location|Remit Payment To|Auction Location|Seller|Consignor|Sold By|From)\s*[:#-]?\s*(.+)$/i)?.[1]
      || (isAuctionLine ? line : '')
    );
    const address = findAddressNear(lines, i, 1, 10) || findAddressNear(lines, i, -1, 3);
    const score = (isAuctionLine ? 10 : 0) + (isFacilityLine ? 8 : 0) + (address?.address ? 4 : 0) + (name ? 2 : 0);
    candidates.push({ score, name, address });
  }

  const best = candidates
    .filter((candidate) => candidate.name || candidate.address?.address)
    .sort((a, b) => b.score - a.score)[0];

  if (!best) return {};
  return clean({
    purchasedFrom: best.name,
    usedVehicleSourceAddress: best.address?.address,
    usedVehicleSourceCity: best.address?.city,
    usedVehicleSourceState: best.address?.state,
    usedVehicleSourceZipCode: best.address?.zip,
  });
}

function extractCarMaxAcquisitionDetails(lines) {
  const fullText = lines.join(' ');
  if (!/\bCarMax\b/i.test(fullText)) return {};

  let name = fullText.match(/\bSeller\s*:\s*(CarMax\s*[-–]\s*[A-Za-z .'-]+)/i)?.[1]
    || fullText.match(/\b(CarMax\s*[-–]\s*[A-Za-z .'-]+)\s*,?\s*\(transferor'?s name\)/i)?.[1]
    || fullText.match(/\b(CarMax\s*[-–]\s*[A-Za-z .'-]+)/i)?.[1]
    || 'CarMax';
  name = name.replace(/\s+/g, ' ').replace(/[.,;:\s]+$/g, '').trim();

  let address = null;
  const sellerIndex = lines.findIndex((line) => /\bSeller\s*:\s*CarMax\b/i.test(line));
  if (sellerIndex >= 0) {
    address = findAddressNear(lines, sellerIndex, 1, 5);
  }

  if (!address?.address) {
    const addressMatch = fullText.match(/\b(\d{1,6}\s+[^,]{3,80}?\b(?:St|Street|Rd|Road|Ave|Avenue|Blvd|Drive|Dr|Tpke|Turnpike|Pkwy|Parkway|Way|Ln|Lane))\s+([A-Za-z .'-]+),?\s+(MA|CT|RI|NH|NY|NJ)\s+(\d{5}(?:-\d{4})?)/i);
    if (addressMatch) {
      address = {
        address: addressMatch[1].trim(),
        city: addressMatch[2].trim(),
        state: addressMatch[3].toUpperCase(),
        zip: addressMatch[4]
      };
    }
  }

  return clean({
    purchasedFrom: name,
    usedVehicleSourceAddress: address?.address,
    usedVehicleSourceCity: address?.city,
    usedVehicleSourceState: address?.state,
    usedVehicleSourceZipCode: address?.zip,
  });
}

function extractCmaaAcquisitionDetails(lines) {
  const fullText = lines.join(' ');
  if (!/\b(CMAA|Central Mass\.? Auto Auction)\b/i.test(fullText)) return {};

  const addressMatch = fullText.match(/\b(12\s+Industrial\s+Park\s+East)\s*[-»]?\s*(Oxford),?\s*(MA)\s+(\d{5})/i);
  return clean({
    purchasedFrom: 'Central Mass. Auto Auction',
    usedVehicleSourceAddress: addressMatch?.[1] || '12 Industrial Park East',
    usedVehicleSourceCity: addressMatch?.[2] || 'Oxford',
    usedVehicleSourceState: addressMatch?.[3] || 'MA',
    usedVehicleSourceZipCode: addressMatch?.[4] || '01540',
  });
}

function extractKnownAuctionAcquisitionDetails(lines) {
  const fullText = lines.join(' ');
  const knownAuctions = [
    {
      pattern: /\bADESA\s+Boston\b/i,
      name: 'ADESA Boston',
      address: '63 Western Avenue',
      city: 'Framingham',
      state: 'MA',
      zip: '01702'
    },
    {
      pattern: /\bAmerica'?s\s+(?:AA|Auto Auction)\s+Boston\b/i,
      name: "America's AA Boston",
      address: null,
      city: 'North Billerica',
      state: 'MA',
      zip: null
    }
  ];

  const known = knownAuctions.find((auction) => auction.pattern.test(fullText));
  if (known) {
    return clean({
      purchasedFrom: known.name,
      usedVehicleSourceAddress: known.address,
      usedVehicleSourceCity: known.city,
      usedVehicleSourceState: known.state,
      usedVehicleSourceZipCode: known.zip,
    });
  }

  const transactionLocation = fullText.match(/\b(?:Transaction Location|Auction Location|Facility|Remit Payment To)\s*[:#-]?\s*([A-Za-z0-9 .&'/-]*\b(?:ADESA|Manheim|Auction)\b[A-Za-z0-9 .&'/-]*)/i)?.[1];
  const name = cleanRoleName(transactionLocation);
  if (!name || !AUCTION_NAME_PATTERN.test(name)) return {};

  const labelIndex = lines.findIndex((line) => /\b(Transaction Location|Auction Location|Facility|Remit Payment To)\b/i.test(line));
  const address = labelIndex >= 0 ? findAddressNear(lines, labelIndex, 1, 5) : null;
  return clean({
    purchasedFrom: name,
    usedVehicleSourceAddress: address?.address,
    usedVehicleSourceCity: address?.city,
    usedVehicleSourceState: address?.state,
    usedVehicleSourceZipCode: address?.zip,
  });
}

export function extractDispositionDetailsFromText(text) {
  const lines = normalizeDocumentLines(text);
  if (!lines.length) return {};

  const maTitleDisposition = extractMaTitleDispositionDetails(lines);
  if (Object.keys(maTitleDisposition).length) return maTitleDisposition;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!hasDispositionLabel(line) || isBroadwayValue(line)) continue;

    const name = findNameNear(
      lines,
      i,
      /(?:Print Name\(s\) of Purchaser\(s\)|Purchaser\(s\)? Name\(s\) and Address(?:\(es\)|es)?|Purchaser\(s\)? Name\(s\)|Buyer Name|Buyer|Sold To|Customer|Transferred To)\s*[:#-]?\s*(.+?)(?=\s+Address\b|\s+City\b|\s+State\b|\s+Zip\b|\s+Date\b|$)/i
    );
    const address = findAddressNear(lines, i, 1, 8);

    if (name || address?.address) {
      return clean({
        disposedTo: name,
        disposedAddress: address?.address,
        disposedCity: address?.city,
        disposedState: address?.state,
        disposedZip: address?.zip,
      });
    }
  }

  return {};
}

function hasDispositionLabel(line) {
  return /(?:^|\s)(Print Name\(s\) of Purchaser\(s\)|Purchaser\(s\)? Name\(s\)|Buyer Name|Sold To\s*:|Customer\s*:|Transferred To\s*:)/i.test(line);
}

function extractMaTitleDispositionDetails(lines) {
  const fullText = lines.join(' ');
  if (!/\bPrint Name\(s\) of Purchaser\(s\)/i.test(fullText)) return {};

  const labelIndex = lines.findIndex((line) => /\bPrint Name\(s\) of Purchaser\(s\)/i.test(line));
    let name = cleanDispositionName(
      fullText.match(/\bPrint Name\(s\) of Purchaser\(s\)\s+(?:[A-Z]{2}\s+)?(?:State\s+)?(?:DL\s+Number\s+)?(.+?)\s+Address\s+City\s+State\s+Z(?:ip|p)\s+Code/i)?.[1]
    );
  if (!name && labelIndex >= 0) {
    name = cleanDispositionName(lines[labelIndex + 1]);
  }

  const streetSuffix = '(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Turnpike|Tpke|Parkway|Pkwy|Way|Lane|Ln)';
  const addressPattern = new RegExp(`\\bAddress\\s+City\\s+State\\s+Z(?:ip|p)\\s+Code\\s+(\\d{1,6}\\s+.+?\\b${streetSuffix}\\b)\\s+([A-Za-z .'-]+?)\\s+([A-Z]{2})\\s+(\\d{5}(?:-\\d{4})?)`, 'i');
  const nearbyAddressPattern = new RegExp(`\\b(\\d{1,6}\\s+.+?\\b${streetSuffix}\\b)\\s+([A-Za-z .'-]+?)\\s+([A-Z]{2})\\s+(\\d{5}(?:-\\d{4})?)`, 'i');
  const addressMatch = fullText.match(addressPattern)
    || (labelIndex >= 0 ? lines.slice(labelIndex + 1, labelIndex + 6).join(' ').match(nearbyAddressPattern) : null);

  if (!name && !addressMatch) return {};
  return {
    disposedTo: cleanDispositionName(name),
    disposedAddress: addressMatch?.[1]?.trim() || null,
    disposedCity: addressMatch?.[2]?.trim() || null,
    disposedState: addressMatch?.[3]?.toUpperCase() || null,
    disposedZip: addressMatch?.[4] || null,
  };
}

function extractFallbackInfo(text, purpose) {
  if (!text) return null;
  const fallback = {};
  const vin = extractVinFromText(text);
  if (vin) fallback.vin = vin;
  const titleNumber = extractTitleFromText(text);
  if (titleNumber) fallback.titleNumber = titleNumber;
  const totalValue = extractTotalFromText(text, purpose);
  if (totalValue) {
    // Only include totals discovered by fallback if they pass basic sanity checks
    if (isReasonableTotal(totalValue)) {
      if (purpose === 'sale') {
        fallback.disposedPrice = totalValue;
      } else {
        fallback.purchasePrice = totalValue;
      }
    } else {
      console.log(`[Parser:PostProcess] extractFallbackInfo skipped unreasonable total: ${totalValue}`);
    }
  }
  return Object.keys(fallback).length ? fallback : null;
}

export function extractVehicleInfoFromText(text) {
  if (!text) return {};

  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const data = {
    vin: null,
    year: null,
    make: null,
    model: null,
    color: null,
    titleNumber: null,
    mileage: null,
    purchasePrice: null,
    disposedPrice: null,
    purchasedFrom: null,
    usedVehicleSourceAddress: null,
    usedVehicleSourceCity: null,
    usedVehicleSourceState: null,
    usedVehicleSourceZipCode: null,
    disposedTo: null,
    disposedAddress: null,
    disposedCity: null,
    disposedState: null,
    disposedZip: null,
    disposedOdometer: null,
  };
  let currentSection = 'source';

  const readValue = (line, regex) => {
    const match = line.match(regex);
    return match ? match[1].trim() : '';
  };

  const parseCurrencyValue = (value) => {
    if (!value) return null;
    const sanitized = String(value).replace(/[^0-9.]/g, '');
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const addAddress = (line) => {
    const value = readValue(line, /Address(?: \(number and street\))?[:\s]+(.+?)(?=\s+City\b|$)/i);
    if (!value) return;
    if (currentSection === 'disposed') {
      data.disposedAddress = value;
    } else {
      data.usedVehicleSourceAddress = value;
    }
  };

  for (const line of lines) {
    if (/\bObtained From\b/i.test(line)) {
      currentSection = 'source';
      data.purchasedFrom = readValue(line, /Obtained From(?: \(Source\))?[:\s]+(.+?)(?=\s+Transaction Date:|\s+Address:|$)/i) || data.purchasedFrom;
    }

    if (/\b(Transferred To|Buyer Name|Purchaser\(s\)? Name\(s\))\b/i.test(line)) {
      currentSection = 'disposed';
      data.disposedTo = readValue(line, /(?:Transferred To|Buyer Name|Purchaser\(s\)? Name\(s\))[:\s]+(.+?)(?=\s+Transaction Date:|\s+Address:|$)/i) || data.disposedTo;
    }

    if (/\bAddress\b/i.test(line)) {
      addAddress(line);
    }

    if (/\bCity(?: or Town)?[:\s]/i.test(line)) {
      const value = readValue(line, /^City(?: or Town)?[:\s]+(.+?)(?:\s+State:|\s+Zip|$)/i);
      if (currentSection === 'disposed') {
        data.disposedCity = value || data.disposedCity;
      } else {
        data.usedVehicleSourceCity = value || data.usedVehicleSourceCity;
      }
    }

    if (/\bState[:\s]/i.test(line)) {
      const value = readValue(line, /State[:\s]+([A-Z]{2})/i);
      if (currentSection === 'disposed') {
        data.disposedState = value || data.disposedState;
      } else {
        data.usedVehicleSourceState = value || data.usedVehicleSourceState;
      }
    }

    if (/\bZip\b/i.test(line)) {
      const value = readValue(line, /Zip(?: Code)?:[:\s]+(\d{5}(?:-\d{4})?)/i);
      if (currentSection === 'disposed') {
        data.disposedZip = value || data.disposedZip;
      } else {
        data.usedVehicleSourceZipCode = value || data.usedVehicleSourceZipCode;
      }
    }

    if (/\bOdometer(?: In| Out| Reading)?\b/i.test(line)) {
      const value = readValue(line, /Odometer(?: In| Out| Reading)?[:\s]+([\d,]+)/i);
      const num = value ? Number(value.replace(/,/g, '')) : null;
      if (Number.isFinite(num)) {
        if (/\bOdometer\s+Out\b/i.test(line)) {
          data.disposedOdometer = num;
        } else {
          data.mileage = num;
        }
      }
      continue;
    }

    if (/\bYear\b/i.test(line) && !data.year) {
      const value = readValue(line, /Year[:\s]+((?:19|20)\d{2})/i);
      if (value) data.year = Number(value);
    }

    if (/\bMake\b/i.test(line) && !data.make) {
      data.make = readValue(line, /Make[:\s]+([A-Za-z0-9 &\-/]+?)(?=\s+Model|\s+Color|\s+Year|$)/i) || data.make;
    }

    if (/\bModel(?!\s+Year)\b/i.test(line) && !data.model) {
      data.model = readValue(line, /Model(?!\s+Year)[:\s]+([A-Za-z0-9 &\-/]+?)(?=\s+Color|\s+Year|\s+Title|\s+Vehicle|\s+Stock|\s+Address|\s+City|\s+State|\s+Zip|\s+Odometer|\s+Transaction Date|$)/i) || data.model;
    }

    if (/\bColor\b/i.test(line) && !data.color) {
      data.color = readValue(line, /Color[:\s]+([A-Za-z0-9 &\-/]+)/i) || data.color;
    }

    if (/\bTitle\b/i.test(line) && !data.titleNumber) {
      data.titleNumber = normalizeTitleNumber(
        readValue(line, /Title\s*(?:No\.?|Number|#|State\/Number)?[:\s]*([A-Z0-9\-/]+)/i)
      ) || data.titleNumber;
    }

    if (!data.disposedPrice) {
      const priceMatch = line.match(/(?:Sale Price|Vehicle Sales Price|Sale Amount|Sold Price|Vehicle Sales Amount)\s*[:\-\s]*\$?([\d,]+(?:\.\d{1,2})?)/i);
      if (priceMatch) {
        data.disposedPrice = parseCurrencyValue(priceMatch[1]);
      }
    }
    if (!data.purchasePrice) {
      const purchaseMatch = line.match(/(?:Purchase Price|Total Due|Amount Due|Balance Due|Amount Payable|Net Amount|Invoice Total|Bill Total|Total Amount)\s*[:\-\s]*\$?([\d,]+(?:\.\d{1,2})?)/i);
      if (purchaseMatch) {
        data.purchasePrice = parseCurrencyValue(purchaseMatch[1]);
      }
    }

    if (/^Vehicle Ident|^VIN|Vehicle Identification Number/i.test(line) && !data.vin) {
      const condensed = line.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const tailMatch = condensed.match(/([A-Z0-9]{17})$/);
      if (tailMatch) {
        const normalized = tailMatch[1].replace(/[IOQ]/g, (char) => (char === 'I' ? '1' : '0'));
        data.vin = normalized;
      }
    }
  }

  const findVinCandidate = (source) => {
    const normalized = String(source).toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (let i = 0; i + 17 <= normalized.length; i++) {
      let candidate = normalized.slice(i, i + 17);
      if (!/^[A-Z0-9]{17}$/.test(candidate)) continue;
      const transformed = candidate.replace(/[IOQ]/g, (char) => (char === 'I' ? '1' : '0'));
      if (isValidVin(transformed)) return transformed;
    }
    return null;
  };

  if (!data.vin) {
    const fallbackVin = findVinCandidate(text);
    if (fallbackVin) data.vin = fallbackVin;
  }

  const result = clean({
    vin: data.vin,
    year: data.year,
    make: data.make,
    model: data.model,
    color: data.color,
    titleNumber: data.titleNumber,
    mileage: data.mileage,
    purchasePrice: data.purchasePrice,
    disposedPrice: data.disposedPrice,
    purchasedFrom: data.purchasedFrom,
    usedVehicleSourceAddress: data.usedVehicleSourceAddress,
    usedVehicleSourceCity: data.usedVehicleSourceCity,
    usedVehicleSourceState: data.usedVehicleSourceState,
    usedVehicleSourceZipCode: data.usedVehicleSourceZipCode,
    disposedTo: data.disposedTo,
    disposedAddress: data.disposedAddress,
    disposedCity: data.disposedCity,
    disposedState: data.disposedState,
    disposedZip: data.disposedZip,
    disposedOdometer: data.disposedOdometer,
  });

  if (!result.usedVehicleSourceAddress && data.usedVehicleSourceAddress) {
    result.usedVehicleSourceAddress = data.usedVehicleSourceAddress.trim();
  }
  if (!result.usedVehicleSourceCity && data.usedVehicleSourceCity) {
    result.usedVehicleSourceCity = data.usedVehicleSourceCity.trim();
  }
  if (!result.usedVehicleSourceState && data.usedVehicleSourceState) {
    result.usedVehicleSourceState = data.usedVehicleSourceState.trim();
  }
  if (!result.usedVehicleSourceZipCode && data.usedVehicleSourceZipCode) {
    result.usedVehicleSourceZipCode = data.usedVehicleSourceZipCode.trim();
  }
  if (!result.disposedAddress && data.disposedAddress) {
    result.disposedAddress = data.disposedAddress.trim();
  }
  if (!result.disposedCity && data.disposedCity) {
    result.disposedCity = data.disposedCity.trim();
  }
  if (!result.disposedState && data.disposedState) {
    result.disposedState = data.disposedState.trim();
  }
  if (!result.disposedZip && data.disposedZip) {
    result.disposedZip = data.disposedZip.trim();
  }

  return result;
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
    const effectivePurpose = purpose || determineDocumentPurpose(ocrText) || '';
    
    try {
      const visionResult = await visionExtract(fileBuffer, mimetype, effectivePurpose);
      if (visionResult && (visionResult.vin || visionResult.make || visionResult.disposedTo)) {
        // Post-process: fix price and title using OCR text
        // If vision misses make/model/year, try heuristic on OCR text
        if ((!visionResult.make || !visionResult.model || !visionResult.year) && ocrText) {
          const heuristic = parseMakeModelYearFromText(ocrText);
          if (heuristic) {
            visionResult.make = visionResult.make || heuristic.make;
            visionResult.model = visionResult.model || heuristic.model;
            visionResult.year = visionResult.year || heuristic.year;
          }
        }
        return postProcessResult(visionResult, ocrText, effectivePurpose);
      }
    } catch (err) {
      console.warn(`[Parser] Vision AI failed, falling back to OCR: ${err.message}`);
    }
    
    // Fallback: OCR text to LLM
    if (hasNvidiaKey && ocrText.length > 30) {
      try {
        const textResult = await textExtract(ocrText, effectivePurpose);
        if (textResult && (textResult.vin || textResult.make || textResult.disposedTo)) {
          return postProcessResult(textResult, ocrText, effectivePurpose);
        }
      } catch (err) {
        console.warn(`[Parser] Text LLM failed after OCR: ${err.message}`);
      }
    }

    // RETRY: If purpose was 'auto' or empty and we got nothing, retry with 'acquisition' prompt
    if (effectivePurpose !== 'acquisition' && hasNvidiaKey) {
      console.log(`[Parser] Auto-detect returned empty. Retrying with acquisition prompt...`);
      try {
        const retryVision = await visionExtract(fileBuffer, mimetype, 'acquisition');
        if (retryVision && (retryVision.vin || retryVision.make)) {
          if ((!retryVision.make || !retryVision.model || !retryVision.year) && ocrText) {
            const heuristic = parseMakeModelYearFromText(ocrText);
            if (heuristic) {
              retryVision.make = retryVision.make || heuristic.make;
              retryVision.model = retryVision.model || heuristic.model;
              retryVision.year = retryVision.year || heuristic.year;
            }
          }
          return postProcessResult(retryVision, ocrText, 'acquisition');
        }
      } catch (err) {
        console.warn(`[Parser] Acquisition retry also failed: ${err.message}`);
      }
      
      // Last resort: retry OCR text with acquisition prompt
      if (ocrText.length > 30) {
        try {
          const retryText = await textExtract(ocrText, 'acquisition');
          if (retryText && (retryText.vin || retryText.make)) {
            return postProcessResult(retryText, ocrText, 'acquisition');
          }
        } catch (err) {
          console.warn(`[Parser] Acquisition text retry also failed: ${err.message}`);
        }
      }
    }

    const fallbackResult = extractFallbackInfo(ocrText, effectivePurpose);
    if (fallbackResult) return fallbackResult;

    return {};
  }

  // For PDFs
  if (isPdfMimeType(mimetype) || isPdfBuffer(fileBuffer)) {
    const { pages, combinedText } = await extractPdfTextPages(fileBuffer);
    console.log(`[Parser] PDF native text: ${combinedText.length} chars`);
    const effectivePurpose = purpose || determineDocumentPurpose(combinedText) || '';

    // If PDF has native text, use text LLM
    if (combinedText.replace(/\s/g, '').length > 30 && hasNvidiaKey) {
      try {
        const textResult = await textExtract(combinedText, effectivePurpose);
        if (textResult && (textResult.vin || textResult.make || textResult.disposedTo)) {
          // Heuristic fill for missing make/model/year
          if ((!textResult.make || !textResult.model || !textResult.year) && combinedText) {
            const heuristic = parseMakeModelYearFromText(combinedText);
            if (heuristic) {
              textResult.make = textResult.make || heuristic.make;
              textResult.model = textResult.model || heuristic.model;
              textResult.year = textResult.year || heuristic.year;
            }
          }
          return postProcessResult(textResult, combinedText, effectivePurpose);
        }
      } catch (err) {
        console.warn(`[Parser] Text LLM failed on native PDF text: ${err.message}`);
      }
    }

    // Scanned PDF or text extraction failed — render to image, use vision
    try {
      const visionResult = await visionExtract(fileBuffer, mimetype, effectivePurpose);
      if (visionResult) return postProcessResult(visionResult, combinedText, effectivePurpose);
    } catch (err) {
      console.warn(`[Parser] Vision AI failed on PDF render: ${err.message}`);
    }

    // RETRY: If purpose was 'auto' or empty and we got nothing, retry with 'acquisition' prompt
    if (effectivePurpose !== 'acquisition' && hasNvidiaKey) {
      console.log(`[Parser] Auto-detect for PDF returned empty. Retrying with acquisition prompt...`);
      if (combinedText.replace(/\s/g, '').length > 30) {
        try {
          const retryText = await textExtract(combinedText, 'acquisition');
          if (retryText && (retryText.vin || retryText.make)) {
            if ((!retryText.make || !retryText.model || !retryText.year) && combinedText) {
              const heuristic = parseMakeModelYearFromText(combinedText);
              if (heuristic) {
                retryText.make = retryText.make || heuristic.make;
                retryText.model = retryText.model || heuristic.model;
                retryText.year = retryText.year || heuristic.year;
              }
            }
            return postProcessResult(retryText, combinedText, 'acquisition');
          }
        } catch (err) {
          console.warn(`[Parser] PDF text Acquisition retry failed: ${err.message}`);
        }
      }
      
      try {
        const retryVision = await visionExtract(fileBuffer, mimetype, 'acquisition');
        if (retryVision && (retryVision.vin || retryVision.make)) {
          return postProcessResult(retryVision, combinedText, 'acquisition');
        }
      } catch (err) {
        console.warn(`[Parser] PDF vision Acquisition retry failed: ${err.message}`);
      }
    }

    // If Vision AI is unavailable or fails, OCR the PDF to salvage VIN/total/title data
    const pdfOcrText = await ocrPdf(fileBuffer, 2);
    if (pdfOcrText && pdfOcrText.replace(/\s/g, '').length > 30) {
      const fallbackResult = extractFallbackInfo(pdfOcrText, effectivePurpose);
      // supplement fallback with heuristic make/model/year
      if (fallbackResult) {
        if ((!fallbackResult.make || !fallbackResult.model || !fallbackResult.year) && pdfOcrText) {
          const heuristic = parseMakeModelYearFromText(pdfOcrText);
          if (heuristic) {
            fallbackResult.make = fallbackResult.make || heuristic.make;
            fallbackResult.model = fallbackResult.model || heuristic.model;
            fallbackResult.year = fallbackResult.year || heuristic.year;
          }
        }
        return fallbackResult;
      }
    }

    const fallbackResult = extractFallbackInfo(combinedText, effectivePurpose);
    if (fallbackResult) return fallbackResult;

    return {};
  }

  // Word docs and other text
  const text = await extractText(fileBuffer, mimetype);
  const effectivePurpose = purpose || determineDocumentPurpose(text) || '';
  if (hasNvidiaKey && text.length > 30) {
    try {
      const textResult = await textExtract(text, effectivePurpose);
      if (textResult) return postProcessResult(textResult, text, effectivePurpose);
    } catch (err) {
      console.warn(`[Parser] Text LLM failed on Word/Other: ${err.message}`);
    }
  }

  const fallbackResult = extractFallbackInfo(text, effectivePurpose);
  if (fallbackResult) return fallbackResult;

  return {};
}

// ═══════════════════════════════════════════════════════════════
// PROMPT BUILDERS — Separate focused prompts for acquisition vs sale
// ═══════════════════════════════════════════════════════════════
// ─── Shared system prompt for ALL AI calls (text + vision) ───
const SYSTEM_PROMPT = `You are a UNIVERSAL vehicle document data extractor. You process ANY automotive document, including but not limited to:
- Auction Bills of Sale (ADESA, CMAA/Central Mass, Manheim, CarMax, America's AA)
- MA Title Transfer Forms ("FOR A MOTOR VEHICLE, MOBILE HOME...")
- Motor Vehicle Purchase Contracts (Carsforsale.com format)
- Dealer invoices and wholesale receipts
- Private party bills of sale
- Insurance documents, registration forms, and any other vehicle paperwork

Even if the document format is UNFAMILIAR, you MUST still extract every vehicle detail you can find. NEVER return an empty result if any vehicle data is visible.

Our dealership is "Broadway Used Auto Sales" (also "Broadway Used Auto Sales Inc", "Auto Sales On Broadway").
Dealership addresses: 2125 REVERE BEACH PKWY, EVERETT, MA 02149 or 100 BROADWAY, NORWOOD, MA 02062.

CRITICAL RULES:
1. ROLE DETECTION: If Broadway appears as BUYER → this is an ACQUISITION. If Broadway appears as SELLER/DEALER → this is a SALE.
2. ADDRESS FILTERING: NEVER return Broadway's own address as the source or disposed address. Return null instead.
3. BODY TYPE vs MODEL: "Body Type" (Sedan, SUV, Hatchback, Coupe) is NOT the model. "Model" is the vehicle name (Corolla, Camry, C250, E350, 328i, Wrangler). For luxury cars (Mercedes-Benz, BMW, Audi), the model is ALWAYS the alphanumeric code (e.g. C250). NEVER put "Sedan" or "SUV" in the model field.
4. TITLE NUMBER: This is CRITICAL. Extract if labeled "Certificate of Title", "Title No", "Title #", "Certificate No", or "Cert of Origin". It is usually an 8-10 digit alphanumeric code (e.g. BK182936).
5. PRICE (TOTAL ONLY): ALWAYS extract the ABSOLUTE TOTAL/BALANCE DUE (e.g. 7645.00). NEVER extract the "Sale Price" or "Selling Price" (e.g. 7200.00) if a larger TOTAL exists below it. Fees MUST be included.
6. You MUST return ONLY a valid JSON object wrapped in JSON_START and JSON_END markers. Do NOT write explanations, reasoning, or markdown.
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
  return `Extract ALL vehicle information from this document. This could be ANY type of vehicle document.
Determine direction: If Broadway is BUYER → ACQUISITION. If Broadway is SELLER → SALE. If unclear, treat as ACQUISITION.

You MUST return a JSON object. Do NOT explain. Do NOT write markdown.

JSON_START
{
  "vin": "VIN (17 chars) or null",
  "make": "Manufacturer or null",
  "model": "Model name (NOT body type) or null",
  "year": 2014,
  "color": "Color or null",
  "mileage": 131575,
  "titleNumber": "Title number or null",
  "stockNumber": "Stock number or null",
  "purchasedFrom": "Seller/Auction name or null",
  "purchasePrice": 6340,
  "purchaseDate": "YYYY-MM-DD or null",
  "usedVehicleSourceAddress": "Seller/Auction street address or null",
  "usedVehicleSourceCity": "City or null",
  "usedVehicleSourceState": "XX or null",
  "usedVehicleSourceZipCode": "Zip or null",
  "disposedTo": "Buyer name if sale or null",
  "disposedAddress": "Buyer street if sale or null",
  "disposedCity": "City or null",
  "disposedState": "XX or null",
  "disposedZip": "Zip or null",
  "disposedDate": "YYYY-MM-DD or null",
  "disposedPrice": 0,
  "disposedOdometer": 0,
  "disposedDlNumber": "Driver license or null",
  "disposedDlState": "XX or null"
}
JSON_END
IMPORTANT: If a value is missing or unclear, return null. NEVER return placeholder text.

LABEL MAPPING:
- VIN: "VIN", "V.I.N.", "Vehicle Identification Number", "Serial #"
- Make/Model: "Make" → make. "Model" → model. "Body Type" (Sedan/SUV) is NOT model.
- Mileage: "Odometer", "Miles", "Reading", "OVER 100,000"
- Price: "TOTAL", "Balance Due", "Total Amount". Must be the final total with fees.
- Source: Prioritize AUCTION/FACILITY name and address. Look for any company name or address that is NOT Broadway.
- Title: "Title #", "Certificate #", "Cert of Origin"
- Stock: "Stock #", "Lot #", "Unit ID"
- Infer state from zip if missing (01xxx/02xxx = MA, 06xxx = CT, etc.).
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
    if (/^(null|undefined|none|n\/a|unknown|unknow|pending|unknown unknown|unknow unknow|0|-|exact 17-char VIN|manufacturer|model name ONLY|model name|color|SELLER|YYYY-MM-DD|information|not available|see title|see document)$/i.test(str)) return '';
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

  // ── Universal Vehicle Make Database ──
  const KNOWN_MAKES = new Set([
    'ACURA','ALFA ROMEO','ASTON MARTIN','AUDI','BENTLEY','BMW','BUICK','CADILLAC',
    'CHEVROLET','CHEVY','CHRYSLER','CITROEN','DAEWOO','DAIHATSU','DODGE','EAGLE',
    'FERRARI','FIAT','FISKER','FORD','GENESIS','GEO','GMC','HONDA','HUMMER',
    'HYUNDAI','INFINITI','ISUZU','JAGUAR','JEEP','KIA','LAMBORGHINI','LAND ROVER',
    'LEXUS','LINCOLN','LOTUS','LUCID','MASERATI','MAZDA','MCLAREN','MERCEDES-BENZ',
    'MERCEDES','BENZ','MERCURY','MINI','MITSUBISHI','NISSAN','OLDSMOBILE','OPEL',
    'PAGANI','PEUGEOT','PLYMOUTH','POLESTAR','PONTIAC','PORSCHE','RAM','RENAULT',
    'RIVIAN','ROLLS-ROYCE','ROLLS ROYCE','SAAB','SATURN','SCION','SEAT','SKODA',
    'SMART','SUBARU','SUZUKI','TESLA','TOYOTA','VOLKSWAGEN','VW','VOLVO',
  ]);

  // ── Universal Validators ──
  const isKnownMake = (val) => {
    if (!val) return false;
    return KNOWN_MAKES.has(val.toUpperCase().trim());
  };

  const isValidModel = (val) => {
    if (!val || val.length < 2) return false;
    const u = val.toUpperCase();
    // A valid model should be short (1-4 words max) and NOT look like:
    // - An address (contains road/street/avenue/pkwy/blvd/drive etc.)
    // - A business entity (contains inc/llc/corp/sales/buyer/seller/dealer etc.)
    // - A sentence or label (more than 5 words)
    // - Pure noise (contains "payment", "remit", "announcement", "clerk", etc.)
    const words = u.split(/\s+/);
    if (words.length > 5) return false;
    if (/\b(road|rd|street|st|avenue|ave|blvd|boulevard|drive|dr|lane|ln|pkwy|parkway|highway|hwy|way|circle|court|ct|place|pl)\b/i.test(u)) return false;
    if (/\b(inc|llc|corp|ltd|co\b|sales|buyer|seller|dealer|auction|broadway|remit|payment|purchaser|transferee|clerk|unit|block|announcement|mats|fear|warehouse)\b/i.test(u)) return false;
    if (/\b(of\s+[a-z]+town|of\s+[a-z]+ford|of\s+[a-z]+bury|of\s+[a-z]+ham)\b/i.test(u)) return false;
    // Should not be a state name or zip code
    if (/^\d{5}(-\d{4})?$/.test(u)) return false;
    if (STATE_MAP[u]) return false;
    return true;
  };

  const isValidTitleNumber = (val) => {
    if (!val || val.length < 4) return false;
    // A valid title number is an alphanumeric CODE, not a word
    // Must contain at least 2 digits
    if ((val.match(/\d/g) || []).length < 2) return false;
    // Should not be a plain English word
    if (/^[a-z]+$/i.test(val) && val.length < 10) return false;
    return true;
  };

  const cleanSourceName = (val) => {
    if (!val) return null;
    let cleaned = val;
    // Strip trailing dates in any format (MM/DD/YYYY, DD-MON-YYYY, etc.)
    cleaned = cleaned.replace(/\s+\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}.*$/i, '');
    cleaned = cleaned.replace(/\s+\d{1,2}-[A-Z]{3}-\d{2,4}.*$/i, '');
    // Strip trailing price fragments ($, dollar amounts)
    cleaned = cleaned.replace(/\s*\$\s*[\d,.]+.*$/g, '');
    // Strip trailing noise words (announcements, sale price, block clerk, etc.)
    cleaned = cleaned.replace(/\s+(announcements?|sale\s*price|block\s*clerk|dealer\s*unit|office\s*copy|conditions?|terms?)(\b.*)?$/gi, '');
    // Strip trailing sequences of 4+ digit numbers
    cleaned = cleaned.replace(/\s+\d{4,}(\s+\d+)*\s*$/g, '');
    // Strip trailing time patterns (HH:MM or HH:MM:SS)
    cleaned = cleaned.replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*$/g, '');
    return cleaned.trim() || null;
  };

  const cleanAddress = (val) => {
    if (!val) return null;
    let cleaned = val;
    // Strip trailing non-address noise (block clerk, announcements, dealer unit, etc.)
    cleaned = cleaned.replace(/\s+(block\s*clerk|dealer\s*unit|announcements?|sale\s*price|office\s*copy|conditions?|lot\s*#?\s*\d*)(\b.*)?$/gi, '');
    // Strip trailing date patterns
    cleaned = cleaned.replace(/\s+\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}.*$/i, '');
    // Strip trailing long numeric sequences (not zip codes — those are 5 digits)
    cleaned = cleaned.replace(/\s+\d{6,}.*$/g, '');
    return cleaned.trim() || null;
  };

  return {
    vin,
    make: (() => {
      const raw = s(d.make);
      if (!raw) return null;
      // Strip label prefixes
      let cleaned = raw.replace(/^(make|manufacturer|mfr)[\s.:##-]*/i, '')
        .replace(/\b(sedan|suv|coupe|truck|van|wagon|hatchback|convertible|sport\s*utility)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!cleaned) return null;
      // Universal validation: must be a known manufacturer
      if (!isKnownMake(cleaned)) {
        // Try to find a known make within the string
        for (const make of KNOWN_MAKES) {
          if (cleaned.toUpperCase().includes(make)) {
            return make.charAt(0) + make.slice(1).toLowerCase();
          }
        }
        return null;
      }
      return cleaned;
    })(),
    model: (() => {
      const raw = s(d.model);
      if (!raw) return null;
      // Strip body types
      const bodyTypes = /\b(sedan|suv|coupe|truck|van|wagon|hatchback|convertible|sport\s*utility\s*v?)\b/gi;
      let cleaned = raw.replace(bodyTypes, '')
        // Strip stock/trim/package noise generically
        .replace(/\b(stock|base|trim|package|edition|standard|premium)\b.*/gi, '')
        .replace(/\s+/g, ' ').trim();
      if (!cleaned) return null;
      // Universal validation
      if (!isValidModel(cleaned)) return null;
      return cleaned;
    })(),
    year: i(d.year, true) || null,
    color: s(d.color) || null,
    mileage: i(d.mileage || d.odometer || d.odometerReading),
    titleNumber: (() => {
      const raw = s(d.titleNumber);
      if (!raw) return null;
      
      // Strip label prefixes
      const normalizedTitle = normalizeTitleNumber(raw);
      if (normalizedTitle) return normalizedTitle;

      let cleaned = raw.trim()
        .replace(/^(title|cert(ificate)?|doc(ument)?|warranty|this|that|the|repairable|parts|prior|reconstructed|information|pending|salvage|see|check|none|not)[\s.:##-]*(no|number|num|id|#)?[\s.:##-]*/i, '')
        .replace(/^(no|number|num|#)[\s.:##-]*/i, '')
        .replace(/^[A-Z]{2}\//, '')
        .replace(/\s/g, '')
        .trim();
      
      if (!cleaned || cleaned.length < 4) return null;
      // Universal validation: must be an alphanumeric code with digits
      if (!isValidTitleNumber(cleaned)) return null;
      
      // Reject if the "title number" is actually the VIN
      const vinCandidate = cleaned.replace(/[^A-Z0-9]/gi, '');
      if (vinCandidate.length === 17 && vin && vinCandidate === vin) return null;
      
      return normalizeTitleNumber(cleaned);
    })(),
    stockNumber: s(d.stockNumber) || null,
    purchasedFrom: cleanSourceName(s(d.purchasedFrom)),
    purchasePrice: n(d.purchasePrice),
    purchaseDate: dt(d.purchaseDate),
    usedVehicleSourceAddress: cleanAddress(isBroadwayAddr(acq.a) ? null : (acq.a || null)),
    usedVehicleSourceCity: isBroadwayAddr(acq.a) ? null : (acq.c || null),
    usedVehicleSourceState: isBroadwayAddr(acq.a) ? null : st(acq.s, acq.z),
    usedVehicleSourceZipCode: isBroadwayAddr(acq.a) ? null : (s(acq.z) || null),
    disposedTo: cleanDispositionName(d.disposedTo) || null,
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
  if (isPdfMimeType(mimetype) || isPdfBuffer(fileBuffer)) {
    const { combinedText } = await extractPdfTextPages(fileBuffer);
    if (combinedText.replace(/\s/g, '').length > 30) {
      return combinedText;
    }
    const ocrText = await ocrPdf(fileBuffer, 2);
    return ocrText || combinedText;
  } else if (mimetype?.includes('word')) {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  } else if (mimetype?.startsWith('image/')) {
    return ocrImage(fileBuffer);
  } else {
    return fileBuffer.toString('utf-8');
  }
}

async function ocrPdf(fileBuffer, maxPages = 2) {
  try {
    const loadingTask = getDocument({ data: new Uint8Array(fileBuffer), useSystemFonts: true, disableFontFace: true });
    const doc = await loadingTask.promise;
    let text = '';

    for (let i = 1; i <= Math.min(maxPages, doc.numPages); i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 2.0 });
      const cf = createCanvasFactory();
      const { canvas, context } = cf.create(Math.ceil(vp.width), Math.ceil(vp.height));
      await page.render({ canvasContext: context, viewport: vp, canvasFactory: cf }).promise;
      const pageImage = canvas.toBuffer('image/jpeg', { quality: 0.85 });
      cf.destroy({ canvas, context });
      const pageText = await ocrImage(pageImage);
      if (pageText) {
        text += (text ? '\n' : '') + pageText;
      }
    }

    return text.trim();
  } catch (err) {
    console.error('[OCR-PDF] Failed:', err.message);
    return '';
  }
}

async function ocrImage(fileBuffer) {
  const worker = await getTesseractWorker();
  try {
    const { data: { text } } = await worker.recognize(fileBuffer);
    return text;
  } catch (err) {
    console.error('[OCR] Failed:', err?.message || err);
    return '';
  } finally {
    try {
      await worker.terminate();
    } catch (terminateError) {
      console.warn('[OCR] Worker termination failed:', terminateError?.message || terminateError);
    }
  }
}

// Heuristic: parse Make, Model, Year from raw text when AI misses them
function parseMakeModelYearFromText(text) {
  if (!text) return null;
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  let year = null;
  let make = null;
  let model = null;

  const makes = [
    'toyota','honda','ford','chevrolet','nissan','bmw','mercedes','audi','hyundai','kia','subaru','mazda','dodge','jeep','volkswagen','lexus','cadillac','infiniti','acura','chrysler','ram','gmc','buick','mitsubishi','porsche','jaguar','land rover','tesla'
  ];
  const makeRegex = new RegExp('\\b(' + makes.join('|') + ')\\b', 'i');
  const cleanToken = (value) => value
    .replace(/\b(make|model)\b/gi, '')
    .replace(/[:\/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normalizeMake = (value) => {
    if (!value) return value;
    let clean = cleanToken(value);
    if (!clean) return clean;
    const tokens = clean.split(' ').filter(Boolean);
    if (tokens.length > 1 && makes.includes(tokens[0].toLowerCase())) {
      return tokens[0][0].toUpperCase() + tokens[0].slice(1).toLowerCase();
    }
    return tokens.map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '').join(' ').trim();
  };
  const normalizeModel = (value, currentMake) => {
    if (!value) return value;
    let clean = cleanToken(value);
    if (currentMake) {
      const makeToken = currentMake.split(' ')[0];
      const prefix = new RegExp('^' + makeToken + '\s+', 'i');
      clean = clean.replace(prefix, '').trim();
    }
    return clean.replace(/\s+/g, ' ').trim();
  };

  for (const l of lines) {
    const ym = l.match(/year[:\s]*([0-9]{4})/i);
    if (ym && !year) year = ym[1];

    const makeModelLine = l.match(/(?:make\s*\/\s*model|model\s*\/\s*make)[:\s-]*(.+)/i);
    if (makeModelLine) {
      const value = makeModelLine[1].trim();
      const parts = value.split(/[,\/]+/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        if (!make) make = normalizeMake(parts[0]);
        if (!model) model = normalizeModel(parts.slice(1).join(' '), make);
      } else if (parts.length === 1) {
        const valueTokens = parts[0].split(/\s+/).filter(Boolean);
        if (valueTokens.length >= 2 && makeRegex.test(parts[0])) {
          if (!make) make = normalizeMake(valueTokens[0]);
          if (!model) model = normalizeModel(valueTokens.slice(1).join(' '), make);
        }
      }
    }

    const mm = l.match(/make[:\s]*([A-Za-z0-9 &\-\.\/]+)/i);
    if (mm && !make) make = normalizeMake(mm[1]);
    const md = l.match(/model[:\s]*([A-Za-z0-9 &\-\.\/]+)/i);
    if (md && !model) model = normalizeModel(md[1], make);
  }

  if ((!make || !model || !year) && lines.length) {
    for (const l of lines) {
      const ymatch = l.match(/\b(19|20)\d{2}\b/);
      if (ymatch && !year) year = ymatch[0];

      const m = l.match(makeRegex);
      if (m) {
        if (!make) make = normalizeMake(m[1]);
        const after = l.slice(m.index + m[0].length).trim();
        if (after) {
          const tokens = after.split(/[,\/\\\-\s]+/).filter(Boolean);
          while (tokens.length && /^(model|make)$/i.test(tokens[0])) tokens.shift();
          const candidate = tokens.filter(t => !/^\d{4}$/.test(t)).slice(0, 3).join(' ');
          if (candidate) model = model || normalizeModel(candidate, make);
        }
      }

      const makeModelLine = l.match(/(?:make\s*\/\s*model|model\s*\/\s*make)[:\s-]*(.+)/i);
      if (makeModelLine) {
        const value = makeModelLine[1].trim();
        const parts = value.split(/[,\/]+/).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          if (!make) make = normalizeMake(parts[0]);
          if (!model) model = normalizeModel(parts.slice(1).join(' '), make);
        }
      }

      const modelOnlyMatch = l.match(/model[:\s-]*([A-Za-z0-9 &\-\.\/]+)/i);
      if (modelOnlyMatch && !model) {
        model = normalizeModel(modelOnlyMatch[1], make);
      }

      const leading = l.match(/^\s*(19|20)\d{2}\s+([A-Za-z0-9]+)\s+([A-Za-z0-9]+)/);
      if (leading) {
        if (!year) year = leading[0].match(/(19|20)\d{2}/)[0];
        if (!make) make = normalizeMake(leading[2]);
        if (!model) model = normalizeModel(leading[3], make);
      }

      if (make && model && year) break;
    }
  }

  if (year) year = Number(String(year).replace(/[^0-9]/g, ''));
  if (make) make = normalizeMake(make);
  if (model) model = normalizeModel(model, make);

  if (make || model || year) return { make, model, year };
  return null;
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

export { extractTotalFromText, extractVinFromText, extractTitleFromText };
