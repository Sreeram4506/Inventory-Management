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
  year:            { x: 135, y: 669, width: 50,  height: 14, font: 'helvetica' },
  make:            { x: 228, y: 669, width: 110, height: 14, font: 'helvetica' },
  model:           { x: 392, y: 669, width: 95,  height: 14, font: 'helvetica' },
  color:           { x: 512, y: 669, width: 85,  height: 14, font: 'helvetica' },

  // VIN box row (individual chars drawn separately by drawVin)
  vinArea:         { x: 114, y: 613, width: 290, height: 16 },

  // "Obtained From (Source): ___ Transaction Date: ___"
  obtainedFrom:    { x: 192, y: 421, width: 185, height: 12, font: 'courier' },
  transactionDate: { x: 448, y: 421, width: 130, height: 12, font: 'courier' },

  // "Address (number and street): ___"
  address:         { x: 192, y: 392, width: 395, height: 12, font: 'courier' },

  // "City or Town: ___ State: ___ Zip Code: ___ Odometer In: ___"
  city:            { x: 118, y: 362, width: 130, height: 12, font: 'courier' },
  state:           { x: 300, y: 362, width: 35,  height: 12, font: 'courier' },
  zipCode:         { x: 375, y: 362, width: 75,  height: 12, font: 'courier' },
  odometerIn:      { x: 505, y: 362, width: 85,  height: 12, font: 'courier' },

  // Repeater: "The source … was obtained from: ___"
  sourceRepeater:  { x: 355, y: 278, width: 230, height: 12, font: 'courier' },

  // Stock No. — top-right corner
  stockNo:         { x: 475, y: 755, width: 110, height: 14, font: 'helvetica' },

  // Title No. — top-leftish or near stock
  titleNo:         { x: 124, y: 753, width: 200, height: 14, font: 'helvetica' },

  // ── Disposition of Motor Vehicle/Part ──
  disposedTo:      { x: 192, y: 203, width: 235, height: 12, font: 'courier' },
  disposedAddress: { x: 192, y: 173, width: 230, height: 12, font: 'courier' },
  disposedCity:    { x: 118, y: 144, width: 155, height: 12, font: 'courier' },
  disposedState:   { x: 300, y: 144, width: 35,  height: 12, font: 'courier' },
  disposedZip:     { x: 375, y: 144, width: 60,  height: 12, font: 'courier' },
  disposedOdometer:{ x: 505, y: 144, width: 85,  height: 12, font: 'courier' },
  disposedDate:    { x: 448, y: 203, width: 115, height: 12, font: 'courier' },
  disposedPrice:   { x: 235, y: 50,  width: 130, height: 12, font: 'courier' },
  
  // DL Info & Signature
  disposedDl:      { x: 195, y: 70,  width: 150, height: 11, font: 'courier' },
  disposedDlState: { x: 395, y: 70,  width: 40,  height: 11, font: 'courier' },
  dealerSignature: { x: 412, y: 34,  width: 175, height: 12, font: 'courier' },
};

const VIN_START_X = 114;
const VIN_START_Y = 613;
const VIN_STEP_X  = 17.05;

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

  // ── Stock & Title No. ──
  const vin = vehicleInfo.vin || '';
  const stockNoValue = vin.length >= 6 ? vin.slice(-6).toUpperCase() : vin.toUpperCase();
  drawField(page, fieldMap.stockNo, stockNoValue, helvetica);
  drawField(page, fieldMap.titleNo, vehicleInfo.titleNumber || '', helvetica);

  // ── Disposition of Motor Vehicle/Part ──
  drawField(page, fieldMap.disposedTo, vehicleInfo.disposedTo || '', courier);
  drawField(page, fieldMap.disposedAddress, vehicleInfo.disposedAddress || '', courier);
  drawField(page, fieldMap.disposedCity, vehicleInfo.disposedCity || '', courier);
  drawField(page, fieldMap.disposedState, vehicleInfo.disposedState || '', courier);
  drawField(page, fieldMap.disposedZip, vehicleInfo.disposedZip || '', courier);
  drawField(page, fieldMap.disposedOdometer, vehicleInfo.disposedOdometer ? String(vehicleInfo.disposedOdometer) : '', courier);
  drawField(page, fieldMap.disposedDate, formatUsedVehicleDate(vehicleInfo.disposedDate), courier);
  drawField(page, fieldMap.disposedPrice, vehicleInfo.disposedPrice ? `$${vehicleInfo.disposedPrice.toLocaleString()}` : '', courier);
  
  // ── DL & Signature ──
  drawField(page, fieldMap.disposedDl, vehicleInfo.disposedDlNumber || '', courier);
  drawField(page, fieldMap.disposedDlState, vehicleInfo.disposedDlState || '', courier);
  drawField(page, fieldMap.dealerSignature, "AUTHORIZED REPRESENTATIVE", courier);

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

  const sanitizedVin = (vin || '').toUpperCase()
    .replace(/^VIN[:\s-]*/, '') // Only strip exact "VIN:" prefix
    .replace(/[^A-Z0-9]/g, '')
    .replace(/[IOQ]/g, '')
    .slice(0, 17);

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
