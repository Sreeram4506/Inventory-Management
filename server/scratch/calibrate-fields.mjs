/**
 * Calibration script FINAL — matches the FINAL coordinates
 */
import { readFile, writeFile } from 'fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const basePageSize = { width: 612, height: 792 };
const templatePath = new URL('../used-vechile-report.jpeg', import.meta.url);
const templateBuffer = await readFile(templatePath);

const pdfDoc = await PDFDocument.create();
const jpgImage = await pdfDoc.embedJpg(templateBuffer);
const page = pdfDoc.addPage([basePageSize.width, basePageSize.height]);
page.drawImage(jpgImage, { x: 0, y: 0, width: basePageSize.width, height: basePageSize.height });

const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
const courier = await pdfDoc.embedFont(StandardFonts.Courier);

function mark(label, x, y, font, fontSize = 10) {
  page.drawText(label, { x, y, size: fontSize, font, color: rgb(1, 0, 0) });
}

// ── Top ──
mark('BN355731', 124, 753, helvetica);
mark('077174', 475, 755, helvetica);

// ── Vehicle row ──
mark('2008', 135, 669, helvetica);
mark('Toyota', 228, 669, helvetica);
mark('Yaris', 392, 669, helvetica);
mark('Blue', 512, 669, helvetica);

// ── VIN ──
const VIN = 'JTDBT923X84012320';
[...VIN].forEach((ch, i) => {
  const charWidth = courier.widthOfTextAtSize(ch, 10);
  const boxCenter = (17.05 - charWidth) / 2;
  page.drawText(ch, { x: 114 + i * 17.05 + Math.max(0, boxCenter), y: 613, size: 10, font: courier, color: rgb(1, 0, 0) });
});

// ── Acquisition ──
mark('BOSTON VOLVO VILLAGE', 192, 421, courier);
mark('13-JUN-2025', 448, 421, courier);
mark('75 NORTH BEACON ST', 192, 392, courier);
mark('ALLSTON', 118, 362, courier);
mark('MA', 300, 362, courier);
mark('02134', 375, 362, courier);
mark('133713', 505, 362, courier);

// ── Source repeater ──
mark('BOSTON VOLVO VILLAGE', 355, 278, courier);

// ── Disposition ──
mark('Zandria Silene White', 192, 203, courier);
mark('26-SEP-2025', 448, 203, courier);
mark('506 Old Derby Rd', 192, 173, courier);
mark('Norwood', 118, 144, courier);
mark('MA', 300, 144, courier);
mark('02062', 375, 144, courier);
mark('133731', 505, 144, courier);

// ── Bottom ──
mark('$5,500', 235, 50, courier);
mark('S46382912', 195, 70, courier);
mark('MA', 395, 70, courier);
mark('AUTHORIZED REP', 412, 34, courier);

const pdfBytes = await pdfDoc.save();
await writeFile(new URL('./calibration-output.pdf', import.meta.url), pdfBytes);
console.log('Done');
