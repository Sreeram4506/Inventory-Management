import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const basePageSize = { width: 612, height: 792 };

// Current coordinates from usedVehiclePdfService.js
const fieldMap = {
  year:            { x: 132, y: 667, width: 50,  height: 14, font: 'helvetica' },
  make:            { x: 224, y: 667, width: 110, height: 14, font: 'helvetica' },
  model:           { x: 388, y: 667, width: 95,  height: 14, font: 'helvetica' },
  color:           { x: 508, y: 667, width: 85,  height: 14, font: 'helvetica' },
  vinArea:         { x: 112, y: 611, width: 290, height: 16 },
  obtainedFrom:    { x: 188, y: 419, width: 185, height: 12, font: 'courier' },
  transactionDate: { x: 448, y: 419, width: 130, height: 12, font: 'courier' },
  address:         { x: 188, y: 389, width: 395, height: 12, font: 'courier' },
  city:            { x: 118, y: 359, width: 130, height: 12, font: 'courier' },
  state:           { x: 300, y: 359, width: 35,  height: 12, font: 'courier' },
  zipCode:         { x: 375, y: 359, width: 75,  height: 12, font: 'courier' },
  odometerIn:      { x: 498, y: 359, width: 85,  height: 12, font: 'courier' },
  sourceRepeater:  { x: 368, y: 275, width: 215, height: 12, font: 'courier' },
  stockNo:         { x: 475, y: 753, width: 110, height: 14, font: 'helvetica' },
  titleNo:         { x: 124, y: 751, width: 200, height: 14, font: 'helvetica' },
  disposedTo:      { x: 212, y: 201, width: 235, height: 12, font: 'courier' },
  disposedAddress: { x: 212, y: 171, width: 380, height: 12, font: 'courier' },
  disposedCity:    { x: 165, y: 141, width: 155, height: 12, font: 'courier' },
  disposedState:   { x: 385, y: 141, width: 35,  height: 12, font: 'courier' },
  disposedZip:     { x: 475, y: 141, width: 60,  height: 12, font: 'courier' },
  disposedOdometer:{ x: 575, y: 141, width: 55,  height: 12, font: 'courier' },
  disposedDate:    { x: 475, y: 201, width: 115, height: 12, font: 'courier' },
  disposedPrice:   { x: 235, y: 111, width: 130, height: 12, font: 'courier' },
  disposedDl:      { x: 195, y: 79,  width: 150, height: 11, font: 'courier' },
  disposedDlState: { x: 395, y: 79,  width: 40,  height: 11, font: 'courier' },
  dealerSignature: { x: 412, y: 32,  width: 175, height: 12, font: 'courier' },
};

async function run() {
  const templatePath = path.join(__dirname, '../used-vechile-report.jpeg');
  const templateBuffer = await readFile(templatePath);
  
  const pdfDoc = await PDFDocument.create();
  const embeddedImage = await pdfDoc.embedJpg(templateBuffer);
  const page = pdfDoc.addPage([basePageSize.width, basePageSize.height]);
  page.drawImage(embeddedImage, { x: 0, y: 0, width: basePageSize.width, height: basePageSize.height });

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);

  Object.entries(fieldMap).forEach(([name, field]) => {
    const font = field.font === 'courier' ? courier : helvetica;
    const fontSize = 10;
    
    // Draw boundary box (red)
    page.drawRectangle({
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      borderColor: rgb(1, 0, 0),
      borderWidth: 0.5,
      opacity: 0.2
    });

    // Draw text (blue)
    page.drawText(name.toUpperCase(), {
      x: field.x + 2,
      y: field.y + 2,
      size: fontSize,
      font,
      color: rgb(0, 0, 1),
    });
  });

  const pdfBytes = await pdfDoc.save();
  await writeFile(path.join(__dirname, '../calibration-report.pdf'), pdfBytes);
  console.log('Calibration report generated at calibration-report.pdf');
}

run().catch(console.error);
