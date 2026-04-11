import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { fillUsedVehiclePdf } from '../server/services/usedVehiclePdfService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function diagnostic() {
  try {
    const templatePath = path.join(__dirname, '../server/used-vechile-report.jpeg');
    const templateBuffer = await readFile(templatePath);
    
    const mockInfo = {
      year: 2024,
      make: 'DIAGNOSTIC',
      model: 'TEST-CAR',
      color: 'RED',
      vin: '1234567890ABCDEFG',
      purchaseDate: new Date().toISOString(),
      mileage: 12345,
      purchasedFrom: 'Local Auction',
    };

    console.log('Generating PDF...');
    const pdfBase64 = await fillUsedVehiclePdf(templateBuffer, mockInfo, 'image/jpeg');
    
    console.log('PDF Base64 length:', pdfBase64.length);
    console.log('First 50 chars:', pdfBase64.slice(0, 50));
    
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const outputPath = path.join(__dirname, 'diagnostic_test.pdf');
    
    await writeFile(outputPath, pdfBuffer);
    console.log('SUCCESS: Diagnostic PDF written to', outputPath);
    console.log('Please check if this file is readable.');
  } catch (err) {
    console.error('DIAGNOSTIC FAILED:', err);
  }
}

diagnostic();
