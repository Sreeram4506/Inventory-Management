import { PrismaClient } from '@prisma/client';
import { extractVehicleInfo } from '../services/documentParser.js';
import { fillUsedVehiclePdf } from '../services/usedVehiclePdfService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const BUY_DIR = path.join(PROJECT_ROOT, 'public', 'buy');
const PREVIEW_DIR = path.join(PROJECT_ROOT, 'public', 'preview');

async function resetAndImport() {
  console.log('🧹 Wiping Database...');
  await prisma.sale.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.repair.deleteMany();
  await prisma.advertisingExpense.deleteMany();
  await prisma.businessExpense.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.documentRegistry.deleteMany();
  console.log('✅ Database Wiped.');

  if (!fs.existsSync(PREVIEW_DIR)) {
    fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  }

  const files = fs.readdirSync(BUY_DIR).filter(f => /\.(jpe?g|png|pdf)$/i.test(f));
  console.log(`📂 Found ${files.length} documents in public/buy to import.`);

  const extraPrompt = "IMPORTANT: If the buyer or 'Disposed To' customer is 'Broadway Auto Sales' or any variation of it (e.g. Broadway Used Auto Sales Inc), please leave 'disposedTo' as null or empty. We only want to record a sale if it is to a DIFFERENT company or individual. If Broadway is listed, treat the vehicle as Available in inventory.";

  const htmlRows = [];

  for (const file of files) {
    const filePath = path.join(BUY_DIR, file);
    console.log(`\n📄 Processing: ${file}`);

    try {
      const buffer = fs.readFileSync(filePath);
      const mimetype = file.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
      
      const info = await extractVehicleInfo(buffer, mimetype, extraPrompt);
      if (!info || !info.vin) {
        console.log('❌ Failed to extract valid info, skipping.');
        continue;
      }

      console.log(`✅ Extracted: ${info.year} ${info.make} ${info.model} | Buyer: ${info.disposedTo || 'None'}`);

      // Generate PDF
      const pdfBase64 = await fillUsedVehiclePdf(buffer, info, mimetype);
      const pdfBuffer = Buffer.from(pdfBase64, 'base64');

      // Save preview files
      const safeVin = info.vin.replace(/[^A-Z0-9]/g, '');
      const sourceExt = path.extname(file);
      const outSource = `source_${safeVin}${sourceExt}`;
      const outPdf = `record_${safeVin}.pdf`;
      fs.writeFileSync(path.join(PREVIEW_DIR, outSource), buffer);
      fs.writeFileSync(path.join(PREVIEW_DIR, outPdf), pdfBuffer);

      // Save to DB
      const isSold = info.disposedTo && info.disposedTo.trim() !== '' && !info.disposedTo.toLowerCase().includes('broadway');
      
      const vehicle = await prisma.vehicle.create({
        data: {
          vin: info.vin,
          make: info.make,
          model: info.model,
          year: info.year || 2000,
          color: info.color || 'N/A',
          mileage: info.mileage || 0,
          status: isSold ? 'Sold' : 'Available',
          purchaseDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date(),
        }
      });

      await prisma.purchase.create({
        data: {
          vehicleId: vehicle.id,
          purchasePrice: info.purchasePrice || 0,
          purchaseDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date(),
          sellerName: info.purchasedFrom || 'N/A',
          documentBase64: pdfBase64,
          sourceDocumentBase64: buffer.toString('base64'),
          totalPurchaseCost: info.purchasePrice || 0,
          paymentMethod: 'Cash'
        }
      });

      if (isSold) {
        const profit = (info.disposedPrice || 0) - (info.purchasePrice || 0);
        await prisma.sale.create({
          data: {
            vehicleId: vehicle.id,
            customerName: info.disposedTo,
            salePrice: info.disposedPrice || 0,
            saleDate: info.disposedDate ? new Date(info.disposedDate) : new Date(),
            profit: profit,
            address: info.disposedAddress || 'N/A',
            phone: 'N/A',
            paymentMethod: 'Cash'
          }
        });
      }

      await prisma.documentRegistry.create({
        data: {
          vin: info.vin,
          make: info.make,
          model: info.model,
          year: String(info.year || ''),
          color: info.color,
          mileage: String(info.mileage || ''),
          titleNumber: info.titleNumber,
          purchaseDate: info.purchaseDate ? String(info.purchaseDate) : null,
          purchasedFrom: info.purchasedFrom,
          sellerAddress: info.usedVehicleSourceAddress,
          sellerCity: info.usedVehicleSourceCity,
          sellerState: info.usedVehicleSourceState,
          sellerZip: info.usedVehicleSourceZipCode,
          disposedTo: info.disposedTo,
          disposedAddress: info.disposedAddress,
          disposedCity: info.disposedCity,
          disposedState: info.disposedState,
          disposedZip: info.disposedZip,
          disposedDate: info.disposedDate ? String(info.disposedDate) : null,
          disposedPrice: String(info.disposedPrice || ''),
          disposedOdometer: String(info.disposedOdometer || ''),
          disposedDlNumber: info.disposedDlNumber,
          disposedDlState: info.disposedDlState,
          documentBase64: pdfBase64,
          sourceFileName: file,
          sourceDocumentBase64: buffer.toString('base64'),
        }
      });

      htmlRows.push(`
        <tr>
          <td>${info.vin}</td>
          <td>${info.year} ${info.make} ${info.model}</td>
          <td>${isSold ? 'Sold' : 'Available'}</td>
          <td><a href="/preview/${outSource}" target="_blank">View Source</a></td>
          <td><a href="/preview/${outPdf}" target="_blank">View Generated PDF</a></td>
        </tr>
      `);

    } catch (err) {
      console.error(`❌ Error processing ${file}:`, err);
    }
  }

  // Generate HTML index
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Batch Import Preview</title>
    <style>
      body { font-family: sans-serif; padding: 20px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 10px; border: 1px solid #ccc; text-align: left; }
      th { background: #f4f4f4; }
    </style>
  </head>
  <body>
    <h1>Batch Import Preview</h1>
    <table>
      <tr>
        <th>VIN</th>
        <th>Vehicle</th>
        <th>Status</th>
        <th>Source Document</th>
        <th>Generated PDF</th>
      </tr>
      ${htmlRows.join('')}
    </table>
  </body>
  </html>
  `;
  fs.writeFileSync(path.join(PREVIEW_DIR, 'index.html'), html);

  console.log('\n🏁 Import Finished!');
  console.log('Open http://localhost:3001/preview/index.html to view results.');
}

resetAndImport().finally(() => prisma.$disconnect());
