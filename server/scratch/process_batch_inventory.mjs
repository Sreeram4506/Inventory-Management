import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import prisma from '../src/db/prisma.js';
import { extractVehicleInfo } from '../services/documentParser.js';
import { fillUsedVehiclePdf } from '../services/usedVehiclePdfService.js';
import { readFile } from 'fs/promises';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');
const testDir = path.join(rootDir, 'public/test');
const templatePath = path.join(rootDir, 'server/used-vechile-report.jpeg');

async function run() {
  console.log('🚀 Starting Bulk Document Processing...');
  
  const files = fs.readdirSync(testDir).filter(f => /\.(jpe?g|png|pdf)$/i.test(f));
  console.log(`📂 Found ${files.length} documents to process.`);

  const templateBuffer = await readFile(templatePath);
  let processedCount = 0;
  let errorCount = 0;

  for (const fileName of files) {
    const filePath = path.join(testDir, fileName);
    console.log(`\n📄 Processing: ${fileName}`);

    try {
      const fileBuffer = fs.readFileSync(filePath);
      const mimetype = fileName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
      
      // 1. Extract Data via AI
      console.log('   🔍 Extracting info...');
      const info = await extractVehicleInfo(fileBuffer, mimetype);
      
      if (!info.vin || info.vin.length < 5) {
        console.warn(`   ⚠️  Could not extract valid VIN from ${fileName}. Skipping.`);
        errorCount++;
        continue;
      }

      console.log(`   ✅ Extracted VIN: ${info.vin} (${info.year} ${info.make} ${info.model})`);

      // 2. Determine Action (Acquisition vs Disposition)
      const isDisposition = !!(info.disposedTo || info.disposedPrice);
      console.log(`   🛠️  Type: ${isDisposition ? 'SALE (Bill of Sale)' : 'PURCHASE (Acquisition)'}`);

      // 3. Check for existing vehicle
      const existingVehicle = await prisma.vehicle.findUnique({
        where: { vin: info.vin },
        include: { purchase: true, sale: true, repairs: true }
      });

      let vehicle;
      if (!existingVehicle) {
        // Create new vehicle if it doesn't exist
        console.log('   🆕 Creating new vehicle record...');
        vehicle = await prisma.vehicle.create({
          data: {
            vin: info.vin,
            make: info.make || 'Unknown',
            model: info.model || 'Unknown',
            year: Number(info.year) || new Date().getFullYear(),
            mileage: Number(info.mileage) || 0,
            color: info.color || 'Unknown',
            purchaseDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date(),
            status: isDisposition ? 'Sold' : 'Available',
            purchase: {
              create: {
                sellerName: info.purchasedFrom || 'Source',
                sellerAddress: info.usedVehicleSourceAddress || '',
                sellerCity: info.usedVehicleSourceCity || '',
                sellerState: info.usedVehicleSourceState || '',
                sellerZip: info.usedVehicleSourceZipCode || '',
                purchasePrice: Number(info.purchasePrice) || 0,
                totalPurchaseCost: Number(info.purchasePrice) || 0,
                purchaseDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date(),
                paymentMethod: 'Bank Transfer',
                sourceDocumentBase64: fileBuffer.toString('base64')
              }
            }
          },
          include: { purchase: true, repairs: true }
        });
      } else {
        vehicle = existingVehicle;
        console.log(`   🔄 Updating existing vehicle (ID: ${vehicle.id})`);
        if (isDisposition && vehicle.status === 'Available') {
          await prisma.vehicle.update({
            where: { id: vehicle.id },
            data: { status: 'Sold' }
          });
        }
      }

      // 4. Handle Sale record if it's a disposition
      if (isDisposition) {
        const salePrice = Number(info.disposedPrice) || 0;
        const purchaseCost = vehicle.purchase?.totalPurchaseCost || 0;
        const profit = salePrice - purchaseCost;

        if (!vehicle.sale) {
          console.log('   💰 Creating sale record...');
          await prisma.sale.create({
            data: {
              vehicleId: vehicle.id,
              customerName: info.disposedTo || 'Unknown Customer',
              phone: 'N/A',
              address: [info.disposedAddress, info.disposedCity, info.disposedState].filter(Boolean).join(', ') || 'N/A',
              saleDate: info.disposedDate ? new Date(info.disposedDate) : new Date(),
              salePrice,
              profit,
              paymentMethod: 'Cash'
            }
          });
        } else {
          console.log('   💰 Updating existing sale record...');
          await prisma.sale.update({
            where: { id: vehicle.sale.id },
            data: {
              customerName: info.disposedTo || vehicle.sale.customerName,
              salePrice: salePrice || vehicle.sale.salePrice,
              profit: salePrice ? (salePrice - purchaseCost) : vehicle.sale.profit
            }
          });
        }
      }

      // 5. Generate and Store the Filled PDF
      console.log('   📄 Generating filled PDF...');
      const mergedInfo = {
        ...info,
        // Ensure we have vehicle context for the PDF if it's a sale
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        mileage: vehicle.mileage,
        purchasedFrom: vehicle.purchase?.sellerName,
        purchaseDate: vehicle.purchase?.purchaseDate
      };
      
      const filledPdfBase64 = await fillUsedVehiclePdf(templateBuffer, mergedInfo, 'image/jpeg');
      
      // Update Purchase with both source and generated doc
      await prisma.purchase.update({
        where: { id: vehicle.purchase.id },
        data: {
          documentBase64: filledPdfBase64,
          sourceDocumentBase64: fileBuffer.toString('base64')
        }
      });

      // 6. Log to DocumentRegistry
      await prisma.documentRegistry.create({
        data: {
          vin: info.vin,
          make: vehicle.make,
          model: vehicle.model,
          year: String(vehicle.year),
          documentType: 'Used Vehicle Record',
          documentBase64: filledPdfBase64,
          sourceFileName: fileName,
          sourceDocumentBase64: fileBuffer.toString('base64'),
          disposedTo: info.disposedTo || null,
          disposedPrice: info.disposedPrice ? String(info.disposedPrice) : null
        }
      });

      console.log(`   ✨ Successfully processed ${fileName}`);
      processedCount++;

    } catch (err) {
      console.error(`   ❌ Error processing ${fileName}:`, err.message);
      errorCount++;
    }
  }

  console.log('\n🏁 Bulk Processing Finished!');
  console.log(`📊 Summary: ${processedCount} Success, ${errorCount} Failed.`);
  process.exit(0);
}

run();
