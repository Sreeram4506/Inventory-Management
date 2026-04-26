import { PrismaClient } from '@prisma/client';
import { extractVehicleInfo } from '../services/documentParser.js';
import { fillUsedVehiclePdf } from '../services/usedVehiclePdfService.js';
import path from 'path';

const prisma = new PrismaClient();

async function reprocessRegistry() {
  console.log('🔄 Starting Registry Reprocessing...');
  
  try {
    const records = await prisma.documentRegistry.findMany();
    console.log(`📂 Found ${records.length} records to reprocess.`);

    for (const record of records) {
      console.log(`\n📄 Reprocessing record for VIN: ${record.vin || 'Unknown'} (File: ${record.sourceFileName})`);
      
      try {
        // Use the stored source document base64
        const sourceBase64 = record.sourceDocumentBase64;
        if (!sourceBase64) {
          console.log('⚠️ No source document base64 found, skipping.');
          continue;
        }

        // Convert base64 to Buffer
        const fileBuffer = Buffer.from(sourceBase64, 'base64');
        
        // Detect mimetype
        const ext = path.extname(record.sourceFileName).toLowerCase();
        let mimetype = 'application/octet-stream';
        if (ext === '.pdf') mimetype = 'application/pdf';
        else if (['.jpg', '.jpeg', '.png'].includes(ext)) mimetype = `image/${ext.slice(1) === 'jpg' ? 'jpeg' : ext.slice(1)}`;

        // Add special instruction to avoid Broadway as customer
        const extraPrompt = "IMPORTANT: If the buyer or 'Disposed To' customer is 'Broadway Auto Sales' or any variation of it (e.g. Broadway Used Auto Sales Inc), please leave 'disposedTo' as null or empty. We only want to record a sale if it is to a DIFFERENT company or individual. If Broadway is listed, treat the vehicle as Available in inventory.";

        // Re-extract info with Vision AI
        const info = await extractVehicleInfo(fileBuffer, mimetype, extraPrompt);
        
        if (!info || !info.vin) {
          console.log('❌ Failed to extract valid info, skipping.');
          continue;
        }

        console.log(`✅ Extracted: ${info.year} ${info.make} ${info.model} | Buyer: ${info.disposedTo || 'None'}`);

        // Update DocumentRegistry with new info (convert all to String as per schema)
        await prisma.documentRegistry.update({
          where: { id: record.id },
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
          }
        });

        // Upsert Vehicle
        const isSold = info.disposedTo && info.disposedTo.trim() !== '' && !info.disposedTo.toLowerCase().includes('broadway');
        
        const vehicle = await prisma.vehicle.upsert({
          where: { vin: info.vin },
          update: {
            make: info.make,
            model: info.model,
            year: info.year,
            color: info.color || 'N/A',
            mileage: info.mileage || 0,
            status: isSold ? 'Sold' : 'Available',
          },
          create: {
            vin: info.vin,
            make: info.make,
            model: info.model,
            year: info.year,
            color: info.color || 'N/A',
            mileage: info.mileage || 0,
            status: isSold ? 'Sold' : 'Available',
            purchaseDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date(),
          }
        });

        // Purchase record
        await prisma.purchase.upsert({
          where: { vehicleId: vehicle.id },
          update: {
            purchasePrice: info.purchasePrice || 0,
            purchaseDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date(),
            sellerName: info.purchasedFrom || 'N/A',
            documentBase64: record.documentBase64,
            sourceDocumentBase64: record.sourceDocumentBase64
          },
          create: {
            vehicleId: vehicle.id,
            purchasePrice: info.purchasePrice || 0,
            purchaseDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date(),
            sellerName: info.purchasedFrom || 'N/A',
            documentBase64: record.documentBase64,
            sourceDocumentBase64: record.sourceDocumentBase64,
            totalPurchaseCost: info.purchasePrice || 0,
            paymentMethod: 'Cash'
          }
        });

        // Sale record (if sold to someone else)
        if (isSold) {
          const profit = (info.disposedPrice || 0) - (info.purchasePrice || 0);
          await prisma.sale.upsert({
            where: { vehicleId: vehicle.id },
            update: {
              customerName: info.disposedTo,
              salePrice: info.disposedPrice || 0,
              saleDate: info.disposedDate ? new Date(info.disposedDate) : new Date(),
              profit: profit,
              address: info.disposedAddress || 'N/A',
              phone: 'N/A',
              paymentMethod: 'Cash'
            },
            create: {
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
        } else {
          // If not sold or sold to Broadway, delete any existing sale record
          await prisma.sale.deleteMany({
            where: { vehicleId: vehicle.id }
          });
        }

        console.log(`✨ Successfully reprocessed ${info.vin}`);

      } catch (err) {
        console.error(`❌ Error reprocessing record ${record.id}:`, err);
      }
    }

    console.log('\n🏁 Registry Reprocessing Finished!');

  } catch (error) {
    console.error('Fatal Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

reprocessRegistry();
