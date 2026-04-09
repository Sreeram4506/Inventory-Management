import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const white = rgb(1, 1, 1);
const basePageSize = {
  width: 612,
  height: 792,
};

const fieldMap = {
  year: { x: 175, y: 658, width: 80, height: 14, font: 'helvetica' },
  make: { x: 310, y: 658, width: 140, height: 14, font: 'helvetica' },
  model: { x: 455, y: 658, width: 100, height: 14, font: 'helvetica' },
  color: { x: 580, y: 658, width: 50, height: 14, font: 'helvetica' },
  vinArea: { x: 135, y: 625, width: 440, height: 16 },
  obtainedFrom: { x: 200, y: 423, width: 360, height: 12, font: 'courier' },
  transactionDate: { x: 505, y: 423, width: 102, height: 12, font: 'courier' },
  address: { x: 190, y: 397, width: 400, height: 12, font: 'courier' },
  city: { x: 100, y: 371, width: 300, height: 12, font: 'courier' },
  state: { x: 440, y: 371, width: 40, height: 12, font: 'courier' },
  zipCode: { x: 535, y: 371, width: 60, height: 12, font: 'courier' },
  odometerIn: { x: 550, y: 371, width: 55, height: 12, font: 'courier' },
  sourceRepeater: { x: 575, y: 262, width: 300, height: 12, font: 'courier' },
  stockNo: { x: 495, y: 735, width: 100, height: 14, font: 'helvetica' },
};

export async function fillUsedVehiclePdf(templateBuffer, vehicleInfo, templateMimeType = 'application/pdf') {
  const pdfDoc = await loadTemplateDocument(templateBuffer, templateMimeType);
  const [page] = pdfDoc.getPages();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);
  const sourceName = vehicleInfo.usedVehicleSourceName || vehicleInfo.purchasedFrom || '';

  drawField(page, fieldMap.year, String(vehicleInfo.year || ''), helvetica);
  drawField(page, fieldMap.make, vehicleInfo.make || '', helvetica);
  drawField(page, fieldMap.model, vehicleInfo.model || '', helvetica);
  drawField(page, fieldMap.color, vehicleInfo.color || '', helvetica);
  drawVin(page, vehicleInfo.vin || '', courier);

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

  const vin = vehicleInfo.vin || '';
  const stockNoValue = vin.length >= 6 ? vin.slice(-6).toUpperCase() : vin.toUpperCase();
  drawField(page, fieldMap.stockNo, stockNoValue, helvetica);

  return Buffer.from(await pdfDoc.save());
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

function drawField(page, field, value, font) {
  const bounds = scaleRect(page, field);
  const text = truncateToFit(value, bounds.width);
  const fontSize = scaleFontSize(page, 10);

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
  const startX = scaleX(page, 137);
  const startY = scaleY(page, 551);
  const stepX = scaleSize(page, 25.4, 'x');
  const fontSize = scaleFontSize(page, 10);

  const sanitizedVin = (vin || '').replace(/[^A-HJ-NPR-Z0-9]/gi, '').slice(0, 17).toUpperCase();

  [...sanitizedVin].forEach((character, index) => {
    page.drawText(character, {
      x: startX + index * stepX,
      y: startY,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  });
}

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

function truncateToFit(value, maxWidth) {
  if (!value) {
    return '';
  }

  const text = String(value).replace(/\s+/g, ' ').trim();
  const maxChars = Math.max(1, Math.floor(maxWidth / 5.8));
  return text.length > maxChars ? `${text.slice(0, maxChars - 1).trim()}` : text;
}

function sanitizeFileNamePart(value) {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

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
