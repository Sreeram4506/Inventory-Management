import { PrismaClient } from '@prisma/client';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { extractVehicleInfo } from '../services/documentParser.js';
import { fillUsedVehiclePdf } from '../services/usedVehiclePdfService.js';
import mime from 'mime-types';

const prisma = new PrismaClient();

process.on('uncaughtException', err => {
  console.error('[Batch] CRITICAL UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Batch] UNHANDLED REJECTION:', reason);
});

async function processBuyDocs() {
  const dir = '../public/buy';
  const files = await readdir(dir);
  console.log(`[Batch] Processing ${files.length} buy documents...`);

  const templateBuffer = await readFile(new URL('../used-vechile-report.jpeg', import.meta.url));

  for (const file of files) {
    if (!file.match(/\.(jpe?g|png|pdf)$/i)) continue;
    
    console.log(`[Batch] Processing BUY: ${file}`);
    const filePath = join(dir, file);
    const buffer = await readFile(filePath);
    const mimetype = mime.lookup(filePath) || 'image/jpeg';

    try {
      // 1. Extract Info
      const info = await extractVehicleInfo(buffer, mimetype);
      if (!info.vin) {
        console.warn(`[Batch] No VIN found for ${file}, skipping.`);
        continue;
      }

      // 2. Generate PDF
      const pdfBase64Str = await fillUsedVehiclePdf(templateBuffer, info, mimetype);

      // 3. Save to Registry (with duplicate check)
      const existingLog = await prisma.documentRegistry.findFirst({
        where: { vin: info.vin, documentType: 'Used Vehicle Record' }
      });

      const docData = {
        vin: info.vin,
        make: info.make || null,
        model: info.model || null,
        year: info.year ? String(info.year) : null,
        documentType: 'Used Vehicle Record',
        documentBase64: pdfBase64Str,
        sourceFileName: file,
        sourceDocumentBase64: buffer.toString('base64'),
        purchasedFrom: info.purchasedFrom || 'Auction',
        createdAt: new Date()
      };

      if (existingLog) {
        await prisma.documentRegistry.update({ where: { id: existingLog.id }, data: docData });
      } else {
        await prisma.documentRegistry.create({ data: docData });
      }

      // 4. Push to Inventory
      const existingVehicle = await prisma.vehicle.findUnique({ where: { vin: info.vin } });
      if (!existingVehicle) {
        const purchasePrice = parseFloat(String(info.purchasePrice).replace(/[^0-9.]/g, '')) || 0;
        await prisma.vehicle.create({
          data: {
            vin: info.vin,
            make: info.make || 'Unknown',
            model: info.model || 'Unknown',
            year: parseInt(info.year) || 2024,
            mileage: parseInt(info.mileage) || 0,
            color: info.color || 'Unknown',
            status: 'Available',
            purchaseDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date(),
            purchase: {
              create: {
                sellerName: info.purchasedFrom || 'Auction',
                purchasePrice: purchasePrice,
                totalPurchaseCost: purchasePrice,
                purchaseDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date(),
                paymentMethod: 'Cash'
              }
            }
          }
        });
        console.log(`[Batch] Created vehicle: ${info.vin}`);
      }
    } catch (err) {
      console.error(`[Batch] Error processing ${file}:`, err.message);
    }
  }
}

async function processSaleDocs() {
  const dir = '../public/sale';
  const files = await readdir(dir);
  console.log(`[Batch] Processing ${files.length} sale documents...`);

  const templateBuffer = await readFile(new URL('../used-vechile-report.jpeg', import.meta.url));

  for (const file of files) {
    if (!file.match(/\.(jpe?g|png|pdf)$/i)) continue;

    console.log(`[Batch] Processing SALE: ${file}`);
    const filePath = join(dir, file);
    const buffer = await readFile(filePath);
    const mimetype = mime.lookup(filePath) || 'image/jpeg';

    try {
      // 1. Extract Info (Retail)
      const info = await extractVehicleInfo(buffer, mimetype);
      if (!info.vin) {
        console.warn(`[Batch] No VIN found for ${file}, skipping.`);
        continue;
      }

      // 2. Find vehicle
      const vehicle = await prisma.vehicle.findUnique({
        where: { vin: info.vin },
        include: { purchase: true, repairs: true, sale: true }
      });

      if (!vehicle) {
        console.warn(`[Batch] Vehicle ${info.vin} not found in inventory, skipping sale.`);
        continue;
      }

      const salePrice = parseFloat(String(info.disposedPrice).replace(/[^0-9.]/g, '')) || 0;
      const purchaseCost = vehicle.purchase?.totalPurchaseCost || 0;
      const repairCost = vehicle.repairs?.reduce((acc, r) => acc + (r.partsCost || 0) + (r.laborCost || 0), 0) || 0;
      const profit = salePrice - purchaseCost - repairCost;

      // 3. Update/Create Sale
      if (vehicle.sale) {
        await prisma.sale.update({
          where: { id: vehicle.sale.id },
          data: {
            customerName: info.disposedTo || 'Retail Customer',
            salePrice,
            profit,
            saleDate: info.disposedDate ? new Date(info.disposedDate) : new Date(),
            billOfSaleBase64: buffer.toString('base64'),
            hasBillOfSale: true
          }
        });
      } else {
        await prisma.sale.create({
          data: {
            vehicleId: vehicle.id,
            customerName: info.disposedTo || 'Retail Customer',
            salePrice,
            profit,
            saleDate: info.disposedDate ? new Date(info.disposedDate) : new Date(),
            billOfSaleBase64: buffer.toString('base64'),
            hasBillOfSale: true
          }
        });
        await prisma.vehicle.update({
          where: { id: vehicle.id },
          data: { status: 'Sold' }
        });
      }

      // 4. Update Registry (Used Vehicle Record with Disposition)
      const existingLog = await prisma.documentRegistry.findFirst({
        where: { vin: info.vin, documentType: 'Used Vehicle Record' }
      });

      const mergedInfo = {
        ...info,
        disposedPrice: salePrice,
        disposedTo: info.disposedTo || 'Retail Customer'
      };
      const filledPdf = await fillUsedVehiclePdf(templateBuffer, mergedInfo, mimetype);

      if (existingLog) {
        await prisma.documentRegistry.update({
          where: { id: existingLog.id },
          data: {
            documentBase64: filledPdf,
            disposedTo: info.disposedTo || 'Retail Customer',
            disposedPrice: String(salePrice),
            disposedDate: info.disposedDate || new Date().toISOString()
          }
        });
      }

      console.log(`[Batch] Processed sale for ${info.vin}: profit=${profit}`);

    } catch (err) {
      console.error(`[Batch] Error processing ${file}:`, err.message);
    }
  }
}

async function main() {
  await processBuyDocs();
  await processSaleDocs();
  console.log('[Batch] Finished all processing.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
