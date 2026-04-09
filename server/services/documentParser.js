import path from 'path';
import { createRequire } from 'module';
import mammoth from 'mammoth';
import { createCanvas } from '@napi-rs/canvas';
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

export async function extractVehicleInfo(fileBuffer, mimetype) {
  const aiInfo = await parseVehicleInfoFromDocument(fileBuffer, mimetype);
  if (aiInfo) {
    return normalizeVehicleInfo(aiInfo);
  }

  if (mimetype === 'application/pdf') {
    const { pages, combinedText } = await extractPdfTextPages(fileBuffer);
    const pageCandidates = (pages.length ? pages : [combinedText]).map((pageText) => {
      const info = normalizeVehicleInfo(mockExtraction(pageText));
      return {
        info,
        score: scoreVehicleInfo(info, pageText),
      };
    });
    const bestCandidate = [...pageCandidates].sort((left, right) => right.score - left.score)[0];

    if (bestCandidate?.score > 0) {
      return bestCandidate.info;
    }
  }

  const text = await extractText(fileBuffer, mimetype);
  return normalizeVehicleInfo(mockExtraction(text));
}

export async function extractText(fileBuffer, mimetype) {
  if (mimetype === 'application/pdf') {
    const { combinedText } = await extractPdfTextPages(fileBuffer);
    return combinedText;
  } else if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimetype === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  } else if (mimetype.startsWith('image/')) {
    return ocrImage(fileBuffer);
  } else {
    return fileBuffer.toString('utf-8');
  }
}

export async function parseVehicleInfo(text) {
  if (!hasNvidiaKey) {
    console.warn('NVIDIA API key not found, falling back to mock extraction');
    return normalizeVehicleInfo(mockExtraction(text));
  }

  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${nvidiaApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-405b-instruct",
        messages: [
          {
            role: "user",
            content: `
              Extract vehicle information from the following text and return it as a pure JSON object.
              The output MUST be a JSON object with these EXACT keys (use null if not found):
              vin, make, model, year (number), color, mileage (number), purchasedFrom, purchasePrice (number), purchaseDate (ISO string), paymentMethod, usedVehicleSourceAddress, usedVehicleSourceCity, usedVehicleSourceState, usedVehicleSourceZipCode, transportCost (number), repairCost (number), inspectionCost (number), registrationCost (number).

              IMPORTANT FORMATTING RULES:
              - Extract text exactly as it appears in the document
              - Preserve original formatting and spacing where relevant
              - For addresses, keep full address format
              - For dates, convert to ISO format (YYYY-MM-DDTHH:mm:ss.sssZ)
              - For monetary values, extract as numbers without currency symbols
              - For VIN, extract 17-character alphanumeric code
              - If information spans multiple lines, combine them properly
              - Look for seller information, bill of sale details, and vehicle specifications

              Text:
              ${text}
            `
          }
        ],
        temperature: 0.1,
        max_tokens: 1024,
        stream: false
      })
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(`NVIDIA API Error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    const resultText = data.choices[0].message.content;
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : resultText;
    return normalizeVehicleInfo(JSON.parse(jsonStr));
  } catch (err) {
    console.error('NVIDIA Text Extraction failed:', err);
    return normalizeVehicleInfo(mockExtraction(text));
  }
}

function mockExtraction(text) {
  const normalizedText = text
    .replace(/\r/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\S\n]+/g, ' ');
  const condensedText = normalizedText.replace(/\n+/g, '\n');
  const flattenedText = normalizedText.replace(/\s+/g, ' ');

  const getFirstMatch = (patterns, defaultValue = '') => {
    for (const pattern of patterns) {
      const match = condensedText.match(pattern) || flattenedText.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }

    return defaultValue;
  };

  const cleanMoney = (value) => {
    const rawValue = (value || '').replace(/[^0-9.]/g, '');
    const normalizedValue = /^\d{1,3}\.\d{4,5}$/.test(rawValue)
      ? String(Number(rawValue.replace('.', '')) / 100)
      : rawValue;
    const parsed = parseFloat(normalizedValue || '0');
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const cleanNumber = (value) => {
    const parsed = parseInt((value || '0').replace(/[^\d]/g, ''), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const cleanVehicleToken = (value) =>
    value
      .replace(/\s+/g, ' ')
      .replace(/\b(?:stock number|vin|color)\b.*$/i, '')
      .replace(/\b[xX]\b$/g, '')
      .replace(/[^\w\s/-]/g, '')
      .replace(/\s+-\s*$/g, '')
      .trim();

  const vehicleLine =
    condensedText.match(/Year\s+(\d{4})\s+Make\s+(.+?)\s+Model\s+(.+?)(?=\s+VIN|\s+Color|\s+Stock Number)/is) ||
    flattenedText.match(/Year\s+(\d{4})\s+Make\s+(.+?)\s+Model\s+(.+?)(?=\s+VIN|\s+Color|\s+Stock Number)/is) ||
    // Alternative patterns for different document formats
    condensedText.match(/(?:Vehicle|Car|Auto).*?(\d{4})\s+(.+?)\s+(.+?)(?=\s+VIN|\s+Color|\s+Mileage)/is) ||
    flattenedText.match(/(?:Vehicle|Car|Auto).*?(\d{4})\s+(.+?)\s+(.+?)(?=\s+VIN|\s+Color|\s+Mileage)/is);

  // Enhanced VIN extraction with better pattern matching
  const vinMatch =
    condensedText.match(/VIN\s*[:#]?\s*([A-HJ-NPR-Z0-9\s-]{17,24})/i) ||
    flattenedText.match(/VIN\s*[:#]?\s*([A-HJ-NPR-Z0-9\s-]{17,24})/i) ||
    condensedText.match(/(?:Vehicle Identification Number|VIN).*?([A-HJ-NPR-Z0-9\s-]{17,24})/i) ||
    flattenedText.match(/(?:Vehicle Identification Number|VIN).*?([A-HJ-NPR-Z0-9\s-]{17,24})/i);
  const normalizedVin = vinMatch
    ? vinMatch[1].replace(/[^A-HJ-NPR-Z0-9]/gi, '').slice(0, 17).toUpperCase()
    : '';

  // Improved seller/address extraction with better alignment
  const sellerBlock =
    condensedText.match(/seller:\s*([^\n]+)\n([^\n]+)\n([A-Za-z .'-]+),\s*([A-Z]{2})\s*(\d{5})/i) ||
    flattenedText.match(/seller:\s*(.+?)\s+(?:Purchaser's Name \(Print\)\s+)?(\d+[A-Za-z0-9 .'-]+?)\s+([A-Za-z .'-]+),\s*([A-Z]{2})\s*(\d{5})/i) ||
    // Alternative seller patterns
    condensedText.match(/(?:Sold By|Seller|From):\s*([^\n]+)\n([^\n]*)\n([^\n]*)/i) ||
    flattenedText.match(/(?:Sold By|Seller|From):\s*(.+?)(?:\s+(?:Address|Location):\s*(.+?))?(?:\s+(?:City|State):\s*(.+?),\s*([A-Z]{2}))?(?:\s+(\d{5}))?/i);

  const dateText = getFirstMatch([
    /dated\s+([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i,
    /\b([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})\b/i,
    /\b([0-9]{2}-[A-Z]{3}-[0-9]{4})\b/i,
  ]);

  return {
    vin: normalizedVin,
    make: cleanVehicleToken(
      vehicleLine?.[2] ||
        getFirstMatch([/Make[:\s]+([A-Za-z0-9 .'-]+)/i], '')
    ),
    model: cleanVehicleToken(
      vehicleLine?.[3] ||
        getFirstMatch([/Model[:\s]+([A-Za-z0-9 .'-]+)/i], '')
    ),
    year: cleanNumber(
      vehicleLine?.[1] ||
        getFirstMatch([/(?:Model Year|Year)[:\s]+(\d{4})/i], '0')
    ),
    color: cleanVehicleToken(
      getFirstMatch([
        /Color[:\s]+([A-Za-z0-9 .'-]+)/i,
        /Color\s+([A-Za-z0-9 .'-]+?)(?=\s+(?:EXCEPT|VIN|Stock Number|x\b))/i,
      ])
    ),
    mileage: cleanNumber(
      getFirstMatch([
        /now reads\s+([0-9,]{3,8})\b/i,
        /Odometer(?: In| Out)?\.?\s*[:#]?\s*([0-9,]{3,8})\b/i,
        /Mileage[:\s]+([0-9,]{3,8})\b/i,
      ], '0')
    ),
    purchasePrice: cleanMoney(
      getFirstMatch([
        /(?:selling price|purchase price|sale price)\s*[:$~©]*\s*\$?\s*([0-9][0-9,]*\.?[0-9]{0,2})/i,
        /(?:sellingprice|selling price).*?\$([0-9][0-9.,]{3,})/i,
        /(?:seilingprice|sellingprice|selling price)[^0-9$]{0,20}\$?\s*([0-9][0-9.,]{3,})/i,
      ], '0')
    ),
    purchaseDate: parseDateToIso(dateText) || new Date().toISOString(),
    purchasedFrom: cleanVehicleToken(
      sellerBlock?.[1] ||
        getFirstMatch([
          /Obtained From \(Source\):\s*(.+?)(?=\s+Transaction Date)/i,
          /seller:\s*([^\n]+)/i,
          /(?:Purchased From|Seller)[:\s]+([A-Za-z0-9 .&'-]+)/i,
        ], 'Auction')
    ).replace(/\s*-\s*$/, ''),
    paymentMethod: getFirstMatch([/Payment Method[:\s]+([A-Za-z\s]+)/i], 'Bank Transfer'),
    usedVehicleSourceAddress: (sellerBlock?.[2] || '').replace(/^Purchaser's Name \(Print\)\s*/i, '').trim(),
    usedVehicleSourceCity: (sellerBlock?.[3] || '').trim(),
    usedVehicleSourceState: (sellerBlock?.[4] || '').trim(),
    usedVehicleSourceZipCode: (sellerBlock?.[5] || '').trim(),
    // Additional cost extraction
    transportCost: cleanMoney(
      getFirstMatch([
        /transport(?:ation)?(?: cost| fee)?\s*[:$~©]*\s*\$?\s*([0-9][0-9,]*\.?[0-9]{0,2})/i,
        /shipping(?: cost| fee)?\s*[:$~©]*\s*\$?\s*([0-9][0-9,]*\.?[0-9]{0,2})/i,
      ], '0')
    ),
    repairCost: cleanMoney(
      getFirstMatch([
        /repair(?:s)?(?: cost| fee)?\s*[:$~©]*\s*\$?\s*([0-9][0-9,]*\.?[0-9]{0,2})/i,
        /maintenance(?: cost| fee)?\s*[:$~©]*\s*\$?\s*([0-9][0-9,]*\.?[0-9]{0,2})/i,
      ], '0')
    ),
    inspectionCost: cleanMoney(
      getFirstMatch([
        /inspection(?: cost| fee)?\s*[:$~©]*\s*\$?\s*([0-9][0-9,]*\.?[0-9]{0,2})/i,
        /certification(?: cost| fee)?\s*[:$~©]*\s*\$?\s*([0-9][0-9,]*\.?[0-9]{0,2})/i,
      ], '0')
    ),
    registrationCost: cleanMoney(
      getFirstMatch([
        /registration(?: cost| fee)?\s*[:$~©]*\s*\$?\s*([0-9][0-9,]*\.?[0-9]{0,2})/i,
        /title(?: cost| fee)?\s*[:$~©]*\s*\$?\s*([0-9][0-9,]*\.?[0-9]{0,2})/i,
        /dmv(?: cost| fee)?\s*[:$~©]*\s*\$?\s*([0-9][0-9,]*\.?[0-9]{0,2})/i,
      ], '0')
    ),
  };
}

async function parseVehicleInfoFromDocument(fileBuffer, mimetype) {
  if (!hasNvidiaKey || !(mimetype === 'application/pdf' || mimetype.startsWith('image/'))) {
    return null;
  }

  // Vision capabilities are typically for images. For PDF, we often extract text first unless using a doc-AI model.
  // NVIDIA NIM meta/llama-3.2-11b-vision-instruct supports image input.
  if (mimetype === 'application/pdf') {
    return null; // Fallback to extractText + parseVehicleInfo
  }

  try {
    const base64Image = fileBuffer.toString('base64');
    const prompt = `
      Extract vehicle information from this vehicle purchase document image and return only pure JSON.
      Use these exact keys:
      vin, make, model, year, color, mileage, purchasedFrom, purchasePrice, purchaseDate, paymentMethod, usedVehicleSourceAddress, usedVehicleSourceCity, usedVehicleSourceState, usedVehicleSourceZipCode, transportCost, repairCost, inspectionCost, registrationCost.
      Rules:
      - year and mileage must be numbers.
      - purchasePrice, transportCost, repairCost, inspectionCost, registrationCost must be numbers.
      - purchaseDate must be an ISO 8601 string if present.
      - If a field is missing, return null for that field.
      - purchasedFrom should be the seller/source of the vehicle, not the buyer.
      - Look for additional costs like transport, shipping, repair, inspection, registration fees.
      - Extract complete address information when available.
    `;

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${nvidiaApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta/llama-3.2-11b-vision-instruct",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimetype};base64,${base64Image}` } }
            ]
          }
        ],
        max_tokens: 1024,
        stream: false
      })
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(`NVIDIA Vision Error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    const resultText = data.choices[0].message.content;
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : resultText;
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error('NVIDIA Vision extraction failed:', err);
    return null;
  }
}

async function ocrPdf(fileBuffer) {
  const { combinedText } = await extractPdfTextPages(fileBuffer, { forceOcr: true });
  return combinedText;
}

async function ocrImage(fileBuffer) {
  const worker = await createOcrWorker();

  try {
    const {
      data: { text },
    } = await worker.recognize(fileBuffer);
    return text;
  } finally {
    await worker.terminate();
  }
}

function createCanvasFactory() {
  return {
    create: (width, height) => {
      const canvas = createCanvas(width, height);
      return {
        canvas,
        context: canvas.getContext('2d'),
      };
    },
    reset: (target, width, height) => {
      target.canvas.width = width;
      target.canvas.height = height;
    },
    destroy: (target) => {
      target.canvas.width = 0;
      target.canvas.height = 0;
    },
  };
}

async function extractPdfTextPages(fileBuffer, options = {}) {
  const loadingTask = getDocument({
    data: new Uint8Array(fileBuffer),
    useSystemFonts: true,
    disableFontFace: true,
  });
  const document = await loadingTask.promise;
  const pages = [];

  if (!options.forceOcr) {
    for (let index = 1; index <= document.numPages; index += 1) {
      const page = await document.getPage(index);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      pages.push(pageText);
    }

    const combinedText = pages.join('\n').trim();
    if (combinedText.replace(/\s/g, '').length >= 40) {
      return { pages, combinedText };
    }
  }

  const worker = await createOcrWorker();
  const ocrPages = [];

  try {
    for (let index = 1; index <= document.numPages; index += 1) {
      const page = await document.getPage(index);
      const viewport = page.getViewport({ scale: 2 });
      const canvasFactory = createCanvasFactory();
      const { canvas, context } = canvasFactory.create(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height)
      );

      await page.render({
        canvasContext: context,
        viewport,
        canvasFactory,
      }).promise;

      const imageBuffer = canvas.toBuffer('image/png');
      const {
        data: { text },
      } = await worker.recognize(imageBuffer);
      ocrPages.push(text);
      canvasFactory.destroy({ canvas, context });
    }
  } finally {
    await worker.terminate();
  }

  return { pages: ocrPages, combinedText: ocrPages.join('\n') };
}

function createOcrWorker() {
  return createWorker('eng', 1, {
    langPath: ocrLangPath,
    gzip: true,
  });
}

function parseDateToIso(value) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const slashDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDate) {
    const [, month, day, year] = slashDate;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toISOString();
  }

  const nativeDate = new Date(trimmed);
  return Number.isNaN(nativeDate.getTime()) ? null : nativeDate.toISOString();
}

function normalizeVehicleInfo(info) {
  const normalized = {
    ...info,
    vin: sanitizeString(info?.vin).replace(/[^A-HJ-NPR-Z0-9]/gi, '').slice(0, 17).toUpperCase(),
    make: sanitizeString(info?.make),
    model: sanitizeString(info?.model),
    color: sanitizeString(info?.color),
    purchasedFrom: sanitizeString(info?.purchasedFrom),
    paymentMethod: sanitizeString(info?.paymentMethod) || 'Bank Transfer',
    usedVehicleSourceAddress: sanitizeString(info?.usedVehicleSourceAddress),
    usedVehicleSourceCity: sanitizeString(info?.usedVehicleSourceCity),
    usedVehicleSourceState: sanitizeString(info?.usedVehicleSourceState).toUpperCase().slice(0, 2),
    usedVehicleSourceZipCode: sanitizeString(info?.usedVehicleSourceZipCode).replace(/[^\d-]/g, '').slice(0, 10),
    year: normalizeNumber(info?.year),
    mileage: normalizeNumber(info?.mileage),
    purchasePrice: normalizeFloat(info?.purchasePrice),
    purchaseDate: parseDateToIso(info?.purchaseDate) || new Date().toISOString(),
    // Additional cost fields
    transportCost: normalizeFloat(info?.transportCost),
    repairCost: normalizeFloat(info?.repairCost),
    inspectionCost: normalizeFloat(info?.inspectionCost),
    registrationCost: normalizeFloat(info?.registrationCost),
  };

  return normalized;
}

function scoreVehicleInfo(info, text) {
  let score = 0;

  if (info.vin?.length === 17) score += 5;
  if (info.year) score += 3;
  if (info.make) score += 2;
  if (info.model) score += 2;
  if (info.color) score += 1;
  if (info.mileage) score += 2;
  if (info.purchasedFrom) score += 2;
  if (info.usedVehicleSourceAddress) score += 1;
  if (info.purchasePrice) score += 1;

  if (/bill of sale|seller|purchaser|transferor|obtained from/i.test(text)) score += 3;
  if (/year\s+\d{4}\s+make\s+/i.test(text)) score += 2;
  if (/collision center|final bill|estimate totals|insurance total/i.test(text)) score -= 4;
  if (/powered by carstrade|certificate of title number/i.test(text)) score -= 1;

  return score;
}

function sanitizeString(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeNumber(value) {
  const parsed = parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeFloat(value) {
  const parsed = parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
