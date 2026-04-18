import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';

const basePageSize = { width: 612, height: 792 };

// UPDATED field map — matches usedVehiclePdfService.js after final calibration
const fieldMap = {
  year:            { x: 132, y: 667, label: 'YEAR' },
  make:            { x: 224, y: 667, label: 'MAKE' },
  model:           { x: 388, y: 667, label: 'MODEL' },
  color:           { x: 508, y: 667, label: 'COLOR' },
  obtainedFrom:    { x: 188, y: 419, label: 'OBTAINED_FROM' },
  transactionDate: { x: 448, y: 419, label: 'TXN_DATE' },
  address:         { x: 188, y: 389, label: 'ADDRESS' },
  city:            { x: 118, y: 359, label: 'CITY' },
  state:           { x: 300, y: 359, label: 'STATE' },
  zipCode:         { x: 375, y: 359, label: 'ZIP' },
  odometerIn:      { x: 498, y: 359, label: 'ODO_IN' },
  sourceRepeater:  { x: 368, y: 275, label: 'SRC_RPT' },
  stockNo:         { x: 475, y: 753, label: 'STOCK' },
  titleNo:         { x: 124, y: 751, label: 'TITLE' },
  disposedTo:      { x: 212, y: 201, label: 'DISP_TO' },
  disposedAddress: { x: 212, y: 171, label: 'DISP_ADDR' },
  disposedCity:    { x: 165, y: 141, label: 'DISP_CITY' },
  disposedState:   { x: 385, y: 141, label: 'DISP_ST' },
  disposedZip:     { x: 475, y: 141, label: 'DISP_ZIP' },
  disposedOdometer:{ x: 575, y: 141, label: 'DISP_ODO' },
  disposedDate:    { x: 475, y: 201, label: 'DISP_DATE' },
  disposedPrice:   { x: 235, y: 111, label: 'DISP_PRICE' },
  disposedDl:      { x: 195, y: 79,  label: 'DL_NUM' },
  disposedDlState: { x: 395, y: 79,  label: 'DL_ST' },
  dealerSignature: { x: 412, y: 32,  label: 'SIGNATURE' },
};

async function createCalibrationPdf() {
  const templateBuffer = fs.readFileSync(new URL('../used-vechile-report.jpeg', import.meta.url));
  
  const pdfDoc = await PDFDocument.create();
  const image = await pdfDoc.embedJpg(templateBuffer);
  const page = pdfDoc.addPage([basePageSize.width, basePageSize.height]);
  
  page.drawImage(image, {
    x: 0, y: 0,
    width: basePageSize.width,
    height: basePageSize.height,
  });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const red = rgb(1, 0, 0);
  const green = rgb(0, 0.6, 0);

  for (const [name, field] of Object.entries(fieldMap)) {
    const { x, y, label } = field;
    
    // Draw crosshair
    page.drawLine({ start: { x: x - 6, y }, end: { x: x + 6, y }, thickness: 1.2, color: red });
    page.drawLine({ start: { x, y: y - 6 }, end: { x, y: y + 6 }, thickness: 1.2, color: red });
    page.drawCircle({ x, y, size: 2, color: red });
    
    // Label
    page.drawText(label, { x: x + 3, y: y + 8, size: 5, font, color: green });
  }

  // Y-axis ruler
  for (let y = 0; y <= 792; y += 30) {
    page.drawLine({ start: { x: 0, y }, end: { x: 12, y }, thickness: 0.3, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(String(y), { x: 1, y: y + 1, size: 4, font, color: rgb(0.4, 0.4, 0.4) });
  }

  const pdfBytes = await pdfDoc.save();
  const outPath = new URL('../scratch/calibration_v2.pdf', import.meta.url);
  fs.writeFileSync(outPath, pdfBytes);
  console.log('Calibration V2 PDF written to:', outPath.pathname);
}

createCalibrationPdf().catch(console.error);
