import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const white = rgb(1, 1, 1);
const basePageSize = {
  width: 612,
  height: 792,
};

// ──────────────────────────────────────────────────────────────────────
// Field coordinate map — calibrated against the USED VEHICLE RECORD
// template image (used-vechile-report.jpeg).
//
// Coordinates are in PDF points (origin = bottom-left of a 612×792 page).
// Each field's (x, y) marks the text baseline start position.
// ──────────────────────────────────────────────────────────────────────
const fieldMap = {
  // Row: "Mfrs. Model Year: ___ Make: ___ Model: ___ Color: ___"
  year:            { x: 124, y: 668, width: 58,  height: 14, font: 'helvetica' },
  make:            { x: 212, y: 668, width: 120, height: 14, font: 'helvetica' },
  model:           { x: 374, y: 668, width: 100, height: 14, font: 'helvetica' },
  color:           { x: 502, y: 668, width: 90,  height: 14, font: 'helvetica' },

  // VIN box row (individual chars drawn separately by drawVin)
  vinArea:         { x: 112, y: 613, width: 290, height: 16 },

  // "Obtained From (Source): ___ Transaction Date: ___"
  obtainedFrom:    { x: 174, y: 438, width: 195, height: 12, font: 'courier' },
  transactionDate: { x: 434, y: 438, width: 145, height: 12, font: 'courier' },

  // "Address (number and street): ___"
  address:         { x: 179, y: 408, width: 400, height: 12, font: 'courier' },

  // "City or Town: ___ State: ___ Zip Code: ___ Odometer In: ___"
  city:            { x: 99,  y: 378, width: 138, height: 12, font: 'courier' },
  state:           { x: 286, y: 378, width: 42,  height: 12, font: 'courier' },
  zipCode:         { x: 364, y: 378, width: 80,  height: 12, font: 'courier' },
  odometerIn:      { x: 489, y: 378, width: 95,  height: 12, font: 'courier' },

  // Repeater: "The source … was obtained from: ___"
  sourceRepeater:  { x: 359, y: 295, width: 220, height: 12, font: 'courier' },

  // Stock No. — top-right corner
  stockNo:         { x: 462, y: 754, width: 120, height: 14, font: 'helvetica' },
};

// VIN grid constants
const VIN_START_X = 112;
const VIN_START_Y = 613;
const VIN_STEP_X  = 17.06;

export async function fillUsedVehiclePdf(templateBuffer, vehicleInfo, templateMimeType = 'application/pdf') {
  const pdfDoc = await loadTemplateDocument(templateBuffer, templateMimeType);
  const [page] = pdfDoc.getPages();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);
  const sourceName = vehicleInfo.usedVehicleSourceName || vehicleInfo.purchasedFrom || '';

  // ── Motor Vehicle/Part Identification & History ──
  drawField(page, fieldMap.year, String(vehicleInfo.year || ''), helvetica);
  drawField(page, fieldMap.make, vehicleInfo.make || '', helvetica);
  drawField(page, fieldMap.model, vehicleInfo.model || '', helvetica);
  drawField(page, fieldMap.color, vehicleInfo.color || '', helvetica);
  drawVin(page, vehicleInfo.vin || '', courier);

  // ── Acquisition of Motor Vehicle/Part ──
  drawField(page, fieldMap.obtainedFrom, sourceName, courier);
  drawField(page, fieldMap.transactionDate, formatUsedVehicleDate(vehicleInfo.purchaseDate), courier);
  drawField(page, fieldMap.address, vehicleInfo.usedVehicleSourceAddress || '', courier);
  drawField(page, fieldMap.city, vehicleInfo.usedVehicleSourceCity || '', courier);
  drawField(page, fieldMap.state, vehicleInfo.usedVehicleSourceState || '', courier);
  drawField(page, fieldMap.zipCode, vehicleInfo.usedVehicleSourceZipCode || '', courier);
  drawField(
    page,
    fieldMap.odometerIn,
    vehicleInfo.mileage ? String(vehicleInfo.mileage) : '',
    courier
  );
  drawField(page, fieldMap.sourceRepeater, sourceName, courier);

  // ── Stock No. ──
  const vin = vehicleInfo.vin || '';
  const stockNoValue = vin.length >= 6 ? vin.slice(-6).toUpperCase() : vin.toUpperCase();
  drawField(page, fieldMap.stockNo, stockNoValue, helvetica);

  return await pdfDoc.saveAsBase64({ useObjectStreams: false });
}

export function buildUsedVehiclePdfFileName(vehicleInfo) {
  const parts = [
    'used-vehicle-record',
    vehicleInfo.year || '',
    vehicleInfo.make || '',
    vehicleInfo.model || '',
    (vehicleInfo.vin || '').slice(-6),
  ]
    .map((part) => sanitizeFileNamePart(String(part || '')))
    .filter(Boolean);

  return `${parts.join('-') || 'used-vehicle-record'}.pdf`;
}

// ──────────────────────────────────────────────────────────────────────
// Drawing helpers
// ──────────────────────────────────────────────────────────────────────

function drawField(page, field, value, font) {
  const bounds = scaleRect(page, field);
  const fontSize = scaleFontSize(page, 10);
  const text = truncateToFit(value, bounds.width, font, fontSize);

  if (!text) {
    return;
  }

  page.drawText(text, {
    x: bounds.x,
    y: bounds.y,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });
}

function drawVin(page, vin, font) {
  const startX = scaleX(page, VIN_START_X);
  const startY = scaleY(page, VIN_START_Y);
  const stepX = scaleSize(page, VIN_STEP_X, 'x');
  const fontSize = scaleFontSize(page, 10);

  const sanitizedVin = (vin || '').replace(/[^A-HJ-NPR-Z0-9]/gi, '').slice(0, 17).toUpperCase();

  [...sanitizedVin].forEach((character, index) => {
    // Center each character within its box
    const charWidth = font.widthOfTextAtSize(character, fontSize);
    const boxCenterOffset = (stepX - charWidth) / 2;
    const charX = startX + index * stepX + Math.max(0, boxCenterOffset);

    page.drawText(character, {
      x: charX,
      y: startY,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  });
}

// ──────────────────────────────────────────────────────────────────────
// Template loading
// ──────────────────────────────────────────────────────────────────────

async function loadTemplateDocument(templateBuffer, templateMimeType) {
  if (templateMimeType === 'application/pdf') {
    return PDFDocument.load(templateBuffer);
  }

  if (templateMimeType === 'image/jpeg' || templateMimeType === 'image/jpg') {
    return buildPdfFromImageTemplate(templateBuffer, 'jpeg');
  }

  if (templateMimeType === 'image/png') {
    return buildPdfFromImageTemplate(templateBuffer, 'png');
  }

  throw new Error('Unsupported used vehicle template format');
}

async function buildPdfFromImageTemplate(templateBuffer, imageType) {
  const pdfDoc = await PDFDocument.create();
  const embeddedImage =
    imageType === 'png'
      ? await pdfDoc.embedPng(templateBuffer)
      : await pdfDoc.embedJpg(templateBuffer);

  const page = pdfDoc.addPage([basePageSize.width, basePageSize.height]);
  page.drawImage(embeddedImage, {
    x: 0,
    y: 0,
    width: basePageSize.width,
    height: basePageSize.height,
  });

  return pdfDoc;
}

// ──────────────────────────────────────────────────────────────────────
// Formatting utilities
// ──────────────────────────────────────────────────────────────────────

function formatUsedVehicleDate(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = date
    .toLocaleString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    })
    .toUpperCase();
  const year = date.getUTCFullYear();

  return `${day}-${month}-${year}`;
}

function truncateToFit(value, maxWidth, font, fontSize) {
  if (!value) {
    return '';
  }

  const text = String(value).replace(/\s+/g, ' ').trim();

  // If we have font metrics, use them for precise truncation
  if (font && fontSize) {
    let truncated = text;
    while (truncated.length > 1 && font.widthOfTextAtSize(truncated, fontSize) > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return truncated.trim();
  }

  // Fallback: approximate character width
  const maxChars = Math.max(1, Math.floor(maxWidth / 5.8));
  return text.length > maxChars ? `${text.slice(0, maxChars - 1).trim()}` : text;
}

function sanitizeFileNamePart(value) {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

// ──────────────────────────────────────────────────────────────────────
// Coordinate scaling — maps base 612×792 coords to actual page size
// ──────────────────────────────────────────────────────────────────────

function scaleRect(page, field) {
  return {
    x: scaleX(page, field.x),
    y: scaleY(page, field.y),
    width: scaleSize(page, field.width, 'x'),
    height: scaleSize(page, field.height, 'y'),
  };
}

function scaleX(page, value) {
  return (value / basePageSize.width) * page.getWidth();
}

function scaleY(page, value) {
  return (value / basePageSize.height) * page.getHeight();
}

function scaleSize(page, value, axis) {
  const base = axis === 'x' ? basePageSize.width : basePageSize.height;
  const target = axis === 'x' ? page.getWidth() : page.getHeight();
  return (value / base) * target;
}

function scaleFontSize(page, value) {
  return value * Math.min(page.getWidth() / basePageSize.width, page.getHeight() / basePageSize.height);
}
