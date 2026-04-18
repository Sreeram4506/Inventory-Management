import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';

const basePageSize = { width: 612, height: 792 };

// Current field map — we'll draw a red cross + label at each position
const fieldMap = {
  year:            { x: 132, y: 671, label: 'YEAR' },
  make:            { x: 224, y: 671, label: 'MAKE' },
  model:           { x: 388, y: 671, label: 'MODEL' },
  color:           { x: 508, y: 671, label: 'COLOR' },
  obtainedFrom:    { x: 188, y: 425, label: 'OBTAINED_FROM' },
  transactionDate: { x: 448, y: 425, label: 'TXN_DATE' },
  address:         { x: 188, y: 395, label: 'ADDRESS' },
  city:            { x: 118, y: 365, label: 'CITY' },
  state:           { x: 300, y: 365, label: 'STATE' },
  zipCode:         { x: 375, y: 365, label: 'ZIP' },
  odometerIn:      { x: 498, y: 365, label: 'ODO_IN' },
  sourceRepeater:  { x: 368, y: 282, label: 'SRC_RPT' },
  stockNo:         { x: 475, y: 756, label: 'STOCK' },
  titleNo:         { x: 124, y: 754, label: 'TITLE' },
  disposedTo:      { x: 212, y: 209, label: 'DISP_TO' },
  disposedAddress: { x: 212, y: 179, label: 'DISP_ADDR' },
  disposedCity:    { x: 165, y: 149, label: 'DISP_CITY' },
  disposedState:   { x: 385, y: 149, label: 'DISP_ST' },
  disposedZip:     { x: 475, y: 149, label: 'DISP_ZIP' },
  disposedOdometer:{ x: 575, y: 149, label: 'DISP_ODO' },
  disposedDate:    { x: 475, y: 209, label: 'DISP_DATE' },
  disposedPrice:   { x: 235, y: 119, label: 'DISP_PRICE' },
  disposedDl:      { x: 195, y: 89,  label: 'DL_NUM' },
  disposedDlState: { x: 395, y: 89,  label: 'DL_ST' },
  dealerSignature: { x: 412, y: 42,  label: 'SIGNATURE' },
};

async function createCalibrationPdf() {
  const templateBuffer = fs.readFileSync(new URL('../used-vechile-report.jpeg', import.meta.url));
  
  const pdfDoc = await PDFDocument.create();
  const image = await pdfDoc.embedJpg(templateBuffer);
  const page = pdfDoc.addPage([basePageSize.width, basePageSize.height]);
  
  // Draw template image
  page.drawImage(image, {
    x: 0, y: 0,
    width: basePageSize.width,
    height: basePageSize.height,
  });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const red = rgb(1, 0, 0);
  const blue = rgb(0, 0, 1);

  // Draw a crosshair and label at each field position
  for (const [name, field] of Object.entries(fieldMap)) {
    const { x, y, label } = field;
    
    // Draw crosshair
    page.drawLine({ start: { x: x - 8, y }, end: { x: x + 8, y }, thickness: 1, color: red });
    page.drawLine({ start: { x, y: y - 8 }, end: { x, y: y + 8 }, thickness: 1, color: red });
    
    // Draw small circle at exact point
    page.drawCircle({ x, y, size: 3, color: red, borderColor: red, borderWidth: 1 });
    
    // Draw label above the crosshair
    page.drawText(label, { x: x + 2, y: y + 10, size: 6, font, color: blue });
  }

  // Also draw horizontal guide lines every 30 points in the key areas
  for (let y = 0; y <= 792; y += 30) {
    page.drawLine({
      start: { x: 0, y },
      end: { x: 15, y },
      thickness: 0.3,
      color: rgb(0.5, 0.5, 0.5),
    });
    page.drawText(String(y), { x: 1, y: y + 1, size: 5, font, color: rgb(0.5, 0.5, 0.5) });
  }

  const pdfBytes = await pdfDoc.save();
  const outPath = new URL('../scratch/calibration_output.pdf', import.meta.url);
  fs.writeFileSync(outPath, pdfBytes);
  console.log('Calibration PDF written to:', outPath.pathname);
  console.log('Open this PDF and check where each red crosshair lands relative to the form blanks.');
}

createCalibrationPdf().catch(console.error);
