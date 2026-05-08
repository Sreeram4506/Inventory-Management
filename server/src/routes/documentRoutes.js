import express from 'express';
import multer from 'multer';
import { readFile } from 'fs/promises';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { extractVehicleInfo } from '../../services/documentParser.js';
import { buildUsedVehiclePdfFileName, fillUsedVehiclePdf } from '../../services/usedVehiclePdfService.js';
import prisma from '../db/prisma.js';

const router = express.Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const defaultUsedVehicleTemplatePath = new URL('../../used-vechile-report.jpeg', import.meta.url);
let cachedTemplateBuffer = null;

async function getTemplateBuffer() {
  if (!cachedTemplateBuffer) {
    cachedTemplateBuffer = await readFile(defaultUsedVehicleTemplatePath);
  }
  return cachedTemplateBuffer;
}

function parseCurrency(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  const parsed = Number(String(value).replace(/[^0-9.-]+/g, ""));
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Fuzzy VIN matching to handle OCR errors (5/S, 0/O, 1/I, etc)
 */
async function findFuzzyRegistryEntry(vin, type) {
  if (!vin) return null;
  const upperVin = vin.toUpperCase();

  // 1. Exact match first
  let entry = await prisma.documentRegistry.findFirst({
    where: { vin: upperVin, documentType: type },
    orderBy: { createdAt: 'desc' }
  });
  if (entry) return entry;

  // 2. Try common OCR swaps
  const swaps = { '5': 'S', 'S': '5', '0': 'O', 'O': '0', '1': 'I', 'I': '1', 'B': '8', '8': 'B' };
  const vinChars = upperVin.split('');
  
  for (let i = 0; i < vinChars.length; i++) {
    const char = vinChars[i];
    if (swaps[char]) {
      const altVin = [...vinChars];
      altVin[i] = swaps[char];
      const altVinStr = altVin.join('');
      
      entry = await prisma.documentRegistry.findFirst({
        where: { vin: altVinStr, documentType: type },
        orderBy: { createdAt: 'desc' }
      });
      if (entry) {
        console.log(`[FuzzyMatch] Found match by swapping ${char}->${swaps[char]} at pos ${i}: ${altVinStr}`);
        return entry;
      }
    }
  }

  // 3. Last 8 characters match (VIS)
  if (upperVin.length >= 8) {
    const vis = upperVin.substring(upperVin.length - 8);
    entry = await prisma.documentRegistry.findFirst({
      where: { 
        vin: { endsWith: vis },
        documentType: type 
      },
      orderBy: { createdAt: 'desc' }
    });
    if (entry) {
      console.log(`[FuzzyMatch] Found match by VIS (last 8): ${entry.vin}`);
      return entry;
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// ROUTE: /scan-document — Quick scan, no inventory action
// ═══════════════════════════════════════════════════════════════
router.post('/scan-document', authenticateToken, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    const info = await extractVehicleInfo(req.file.buffer, req.file.mimetype);
    res.json({ success: true, info });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════
// ROUTE: /generate-used-vehicle-form — USER_FORM processing
// Extracts: Motor Vehicle Details + Execution ONLY
// Stores: INVENTORY with status = "Available"
// ═══════════════════════════════════════════════════════════════
router.post(
  '/generate-used-vehicle-form',
  authenticateToken,
  upload.fields([
    { name: 'sourceFile', maxCount: 1 },
    { name: 'templateFile', maxCount: 1 },
  ]),
  async (req, res, next) => {
    let info = null;
    try {
      const sourceFile = req.files?.sourceFile?.[0];
      const templateFile = req.files?.templateFile?.[0];
      const supportedTemplateMimeTypes = new Set([
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
      ]);

      if (!sourceFile) {
        return res.status(400).json({ status: 'error', message: 'Source document is required' });
      }

      if (templateFile && !supportedTemplateMimeTypes.has(templateFile.mimetype)) {
        return res.status(400).json({
          status: 'error',
          message: 'Used vehicle template must be a PDF, JPG, or PNG',
        });
      }

      // ── Extract data from document ──
      info = await extractVehicleInfo(sourceFile.buffer, sourceFile.mimetype);
      console.log(`[UserForm] Extracted VIN: ${info.vin}, Make: ${info.make}, Model: ${info.model}`);

      // ── Generate PDF ──
      const templateBuffer = templateFile
        ? templateFile.buffer
        : await getTemplateBuffer();
      const templateMimeType = templateFile?.mimetype || 'image/jpeg';
      const filledPdf = await fillUsedVehiclePdf(templateBuffer, info, templateMimeType);
      const pdfBase64Str = filledPdf;

      const isPushToInventory = req.body.pushToInventory === 'true';
      let vehicleId = null;
      let registryId = null;

      // ── Check for duplicate in inventory ──
      const existingVehicle = await prisma.vehicle.findUnique({ where: { vin: info.vin } });
      if (existingVehicle) {
        return res.status(409).json({ 
          status: 'error', 
          message: `Vehicle with VIN ${info.vin} already exists in inventory.`,
          existingId: existingVehicle.id
        });
      }

      // ── Save/Update in Document Registry ──
      try {
        const docData = {
          vin: info.vin,
          make: info.make || null,
          model: info.model || null,
          year: info.year ? String(info.year) : null,
          titleNumber: info.titleNumber || null,
          purchasedFrom: info.purchasedFrom || null,
          sellerAddress: info.usedVehicleSourceAddress || null,
          sellerCity: info.usedVehicleSourceCity || null,
          sellerState: info.usedVehicleSourceState || null,
          sellerZip: info.usedVehicleSourceZipCode || null,
          documentType: 'Used Vehicle Record',
          documentBase64: pdfBase64Str,
          sourceFileName: sourceFile.originalname || null,
          sourceDocumentBase64: sourceFile.buffer.toString('base64'),
          createdAt: new Date() // Refresh timestamp to move to top
        };

        const existingLog = await findFuzzyRegistryEntry(info.vin, 'Used Vehicle Record');

        if (existingLog) {
          await prisma.documentRegistry.update({
            where: { id: existingLog.id },
            data: { ...docData, vin: info.vin } // Prefer the new (likely corrected) VIN
          });
          
          // Cleanup any other duplicates for this VIN to keep it clean
          await prisma.documentRegistry.deleteMany({
            where: {
              vin: { in: [info.vin, existingLog.vin] },
              documentType: 'Used Vehicle Record',
              id: { not: existingLog.id }
            }
          });
          console.log(`[Registry] Updated existing log for VIN: ${info.vin} (matched ${existingLog.vin})`);
        } else {
          await prisma.documentRegistry.create({
            data: docData
          });
          console.log(`[Registry] Created new log for VIN: ${info.vin}`);
        }
        registryId = 'logged';
      } catch (logErr) {
        console.error('Failed to save/update DocumentRegistry:', logErr);
      }

      // ── Push to Inventory with status = "Available" ──
      if (isPushToInventory) {
        const purchasePrice = parseCurrency(info.purchasePrice);
        const transportCost = parseCurrency(info.transportCost);
        const repairCost = parseCurrency(info.repairCost);
        const inspectionCost = parseCurrency(info.inspectionCost);
        const registrationCost = parseCurrency(info.registrationCost);
        const totalPurchaseCost = purchasePrice + transportCost + inspectionCost + registrationCost;

        const vehicle = await prisma.vehicle.create({
          data: {
            vin: info.vin,
            make: info.make || 'Unknown',
            model: info.model || 'Unknown',
            year: Number(info.year) || new Date().getFullYear(),
            mileage: Number(info.mileage) || 0,
            color: info.color || 'Unknown',
            purchaseDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date(),
            titleNumber: info.titleNumber || null,
            status: 'Available', // USER_FORM → status = AVAILABLE
            purchase: {
              create: {
                sellerName: info.purchasedFrom || 'Auction',
                sellerAddress: info.usedVehicleSourceAddress || '',
                sellerCity: info.usedVehicleSourceCity || '',
                sellerState: info.usedVehicleSourceState || '',
                sellerZip: info.usedVehicleSourceZipCode || '',
                purchasePrice,
                transportCost,
                inspectionCost,
                registrationCost,
                totalPurchaseCost,
                purchaseDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date(),
                paymentMethod: 'Bank Transfer',
                documentBase64: pdfBase64Str,
                sourceDocumentBase64: sourceFile.buffer.toString('base64')
              }
            },
            ...(repairCost > 0 && {
              repairs: {
                create: {
                  repairShop: 'Initial Pre-Purchase',
                  partsCost: repairCost,
                  laborCost: 0,
                  description: 'Initial repairs added during document scan',
                  repairDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date()
                }
              }
            })
          }
        });
        vehicleId = vehicle.id;
        vehicleCache.delete('vehicle-list'); // Invalidate cache
      }

      const fileName = buildUsedVehiclePdfFileName(info);

      res.json({
        status: 'success',
        action: 'user_form_processed',
        info,
        fileName,
        pdfBase64: pdfBase64Str,
        inventoryAdded: !!vehicleId,
        registryAdded: !!registryId
      });
    } catch (err) {
      if (err.message && err.message.includes('already exists in inventory')) {
         const vin = info?.vin;
         const existing = await prisma.vehicle.findUnique({ where: { vin } });
         return res.status(409).json({ 
           status: 'error',
           message: err.message, 
           existingId: existing?.id 
         });
      }
      next(err);
    }
  }
);

import { vehicleCache, salesCache } from '../utils/cache.js';

// ═══════════════════════════════════════════════════════════════
// ROUTE: /upload-bill-of-sale — BILL_OF_SALE processing
// Extracts: Disposition + VIN ONLY
// VIN Match: EXACT match in inventory required
// Action: AVAILABLE → SOLD, move to SALES
// ═══════════════════════════════════════════════════════════════
router.post('/upload-bill-of-sale', authenticateToken, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    }

    // ── Step 1: Extract ONLY Disposition + VIN from Bill of Sale ──
    const billOfSaleInfo = await extractVehicleInfo(req.file.buffer, req.file.mimetype);
    
    console.log(`[BillOfSale] Extracted:`, JSON.stringify(billOfSaleInfo, null, 2));

    // ── Step 2: Validate VIN ──
    const extractedVin = billOfSaleInfo.vin || (req.body.vin ? req.body.vin.trim().toUpperCase() : null);
    
    if (!extractedVin || extractedVin.length !== 17) {
      return res.status(400).json({ status: 'error', message: 'VIN not found in BILL_OF_SALE' });
    }

    // Use manual customer name fallback if AI didn't extract it
    const customerName = billOfSaleInfo.disposedTo || req.body.customerName || 'Unknown Customer';

    // ── Step 3: VIN match in inventory ──
    let vehicle = await prisma.vehicle.findUnique({
      where: { vin: extractedVin },
      include: { 
        purchase: true,
        repairs: true,
        sale: true
      }
    });

    if (!vehicle) {
      console.log(`[BillOfSale] Exact match fail for ${extractedVin}. Trying fuzzy match...`);
      const allVehicles = await prisma.vehicle.findMany({
        where: { status: 'Available' },
        include: { purchase: true, repairs: true, sale: true }
      });
      
      // Look for a vehicle where only 1 or 2 characters are different
      const closeMatches = allVehicles.filter(v => {
        const dist = levenshteinDistance(v.vin, extractedVin);
        return dist > 0 && dist <= 2;
      });

      if (closeMatches.length === 1) {
        vehicle = closeMatches[0];
        console.log(`[BillOfSale] FUZZY MATCH found: ${extractedVin} matches ${vehicle.vin} (dist: ${levenshteinDistance(vehicle.vin, extractedVin)})`);
        // We proceed with this vehicle
      } else {
        return res.status(404).json({ 
          status: 'error', 
          message: `VIN not found in inventory: ${extractedVin}. Please ensure the vehicle was scanned into inventory first.` 
        });
      }
    }

    const matchedVin = vehicle.vin;
    console.log(`[BillOfSale] VIN matched: ${matchedVin} → Vehicle ID: ${vehicle.id}`);

    // ── Step 4: Update vehicle status: AVAILABLE → SOLD ──
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { status: 'Sold' }
    });
    console.log(`[BillOfSale] Vehicle status updated: Available → Sold`);

    // ── Step 5: Create Sale record (move to SALES) ──
    const salePrice = parseCurrency(billOfSaleInfo.disposedPrice);
    const purchaseCost = vehicle.purchase?.totalPurchaseCost || 0;
    const repairCost = vehicle.repairs?.reduce((acc, r) => acc + (r.partsCost || 0) + (r.laborCost || 0), 0) || 0;
    const profit = salePrice - purchaseCost - repairCost;

    if (!vehicle.sale) {
      await prisma.sale.create({
        data: {
          vehicleId: vehicle.id,
          customerName: customerName,
          phone: 'N/A',
          address: [
            billOfSaleInfo.disposedAddress,
            billOfSaleInfo.disposedCity,
            billOfSaleInfo.disposedState,
            billOfSaleInfo.disposedZip
          ].filter(Boolean).join(', ') || 'N/A',
          driverLicense: billOfSaleInfo.disposedDlNumber || null,
          saleDate: billOfSaleInfo.disposedDate ? new Date(billOfSaleInfo.disposedDate) : new Date(),
          salePrice,
          paymentMethod: 'Cash',
          profit,
          billOfSaleBase64: req.file.buffer.toString('base64'),
          hasBillOfSale: true
        }
      });
      console.log(`[BillOfSale] Sale record CREATED: price=${salePrice}, profit=${profit}`);
    } else {
      await prisma.sale.update({
        where: { id: vehicle.sale.id },
        data: {
          customerName: customerName !== 'Unknown Customer' ? customerName : vehicle.sale.customerName,
          address: billOfSaleInfo.disposedAddress ? [
            billOfSaleInfo.disposedAddress,
            billOfSaleInfo.disposedCity,
            billOfSaleInfo.disposedState,
            billOfSaleInfo.disposedZip
          ].filter(Boolean).join(', ') : vehicle.sale.address,
          driverLicense: billOfSaleInfo.disposedDlNumber || vehicle.sale.driverLicense,
          saleDate: billOfSaleInfo.disposedDate ? new Date(billOfSaleInfo.disposedDate) : vehicle.sale.saleDate,
          salePrice: salePrice || vehicle.sale.salePrice,
          profit: salePrice ? (salePrice - purchaseCost - repairCost) : vehicle.sale.profit,
          billOfSaleBase64: req.file.buffer.toString('base64'),
          hasBillOfSale: true
        }
      });
      console.log(`[BillOfSale] Sale record UPDATED`);
    }

    // ── Step 6: Update Registry entry with disposition data ──
    const existingEntry = await findFuzzyRegistryEntry(extractedVin, 'Used Vehicle Record');

    let filledPdf;
    if (existingEntry || vehicle) {
      // Merge disposition data into existing registry entry (or build from scratch if none exists)
      // IMPORTANT: We strictly preserve Acquisition and Motor Vehicle data from the database record
      // and only use the Bill of Sale for Disposition fields.
      const mergedInfo = {
        // 1. Motor Vehicle Identification (Strictly from Database)
        vin: vehicle?.vin || extractedVin,
        make: vehicle?.make || '',
        model: vehicle?.model || '',
        year: vehicle?.year || '',
        color: vehicle?.color || '',
        mileage: vehicle?.mileage || 0, // This is Odometer IN
        titleNumber: vehicle?.titleNumber || '',

        // 2. Acquisition Section (Strictly from Original Purchase)
        purchasedFrom: vehicle?.purchase?.sellerName || '',
        purchaseDate: vehicle?.purchaseDate?.toISOString() || vehicle?.purchase?.purchaseDate?.toISOString(),
        purchasePrice: vehicle?.purchase?.purchasePrice || 0,
        usedVehicleSourceAddress: vehicle?.purchase?.sellerAddress || '',
        usedVehicleSourceCity: vehicle?.purchase?.sellerCity || '',
        usedVehicleSourceState: vehicle?.purchase?.sellerState || '',
        usedVehicleSourceZipCode: vehicle?.purchase?.sellerZip || '',

        // 3. Disposition Section (Strictly from Bill of Sale extraction)
        disposedTo: customerName,
        disposedAddress: billOfSaleInfo.disposedAddress || '',
        disposedCity: billOfSaleInfo.disposedCity || '',
        disposedState: billOfSaleInfo.disposedState || '',
        disposedZip: billOfSaleInfo.disposedZip || '',
        disposedDate: billOfSaleInfo.disposedDate || new Date().toISOString(),
        disposedPrice: parseCurrency(billOfSaleInfo.disposedPrice),
        disposedOdometer: billOfSaleInfo.disposedOdometer || '',
        disposedDlNumber: billOfSaleInfo.disposedDlNumber || '',
        disposedDlState: billOfSaleInfo.disposedDlState || '',
      };

      const templateBuffer = await getTemplateBuffer();
      filledPdf = await fillUsedVehiclePdf(templateBuffer, mergedInfo, 'image/jpeg');

      if (existingEntry) {
        await prisma.documentRegistry.update({
          where: { id: existingEntry.id },
          data: {
            disposedTo: String(customerName || ''),
            disposedAddress: String(billOfSaleInfo.disposedAddress || ''),
            disposedCity: String(billOfSaleInfo.disposedCity || ''),
            disposedState: String(billOfSaleInfo.disposedState || ''),
            disposedZip: String(billOfSaleInfo.disposedZip || ''),
            disposedDate: billOfSaleInfo.disposedDate ? String(billOfSaleInfo.disposedDate) : null,
            disposedPrice: String(parseCurrency(billOfSaleInfo.disposedPrice) || ''),
            disposedOdometer: billOfSaleInfo.disposedOdometer ? String(billOfSaleInfo.disposedOdometer) : null,
            disposedDlNumber: String(billOfSaleInfo.disposedDlNumber || ''),
            disposedDlState: String(billOfSaleInfo.disposedDlState || ''),
            documentBase64: filledPdf
          }
        });
        
        // Delete any other duplicates for this VIN (and the matched VIN) to keep the registry clean
        await prisma.documentRegistry.deleteMany({
          where: {
            vin: { in: [extractedVin, existingEntry.vin] },
            documentType: 'Used Vehicle Record',
            id: { not: existingEntry.id }
          }
        });
        console.log(`[BillOfSale] Registry duplicates CLEANED for VIN: ${extractedVin} (matched ${existingEntry.vin})`);
      } else {
        await prisma.documentRegistry.create({
          data: {
            vin: extractedVin,
            make: vehicle?.make || '',
            model: vehicle?.model || '',
            year: String(vehicle?.year || ''),
            documentType: 'Used Vehicle Record',
            documentBase64: filledPdf,
            disposedTo: String(customerName || ''),
            disposedAddress: String(billOfSaleInfo.disposedAddress || ''),
            disposedCity: String(billOfSaleInfo.disposedCity || ''),
            disposedState: String(billOfSaleInfo.disposedState || ''),
            disposedZip: String(billOfSaleInfo.disposedZip || ''),
            disposedDate: billOfSaleInfo.disposedDate ? String(billOfSaleInfo.disposedDate) : null,
            disposedPrice: String(parseCurrency(billOfSaleInfo.disposedPrice) || ''),
            disposedOdometer: billOfSaleInfo.disposedOdometer ? String(billOfSaleInfo.disposedOdometer) : null,
            disposedDlNumber: String(billOfSaleInfo.disposedDlNumber || ''),
            disposedDlState: String(billOfSaleInfo.disposedDlState || ''),
            sourceFileName: req.file.originalname,
            sourceDocumentBase64: req.file.buffer.toString('base64'),
          }
        });
        console.log(`[BillOfSale] New Registry entry CREATED with disposition data`);
      }
      // Also update the Purchase record's documentBase64 if the vehicle exists
      if (vehicle && vehicle.purchase) {
        await prisma.purchase.update({
          where: { id: vehicle.purchase.id },
          data: { documentBase64: filledPdf }
        });
        console.log(`[BillOfSale] Purchase record UPDATED with new Generated Record for vehicle: ${vehicle.id}`);
      }
    }

    // ── Step 7: Invalidate caches ──
    vehicleCache.delete('vehicle-list');
    salesCache.delete('sales-list');

    // ── Step 8: Return strict JSON response ──
    const fileName = `UsedVehicleRecord_${extractedVin}.pdf`;
    res.json({
      status: 'success',
      action: 'updated_inventory_and_sales',
      vin: extractedVin,
      info: billOfSaleInfo,
      pdfBase64: typeof filledPdf !== 'undefined' ? filledPdf : null,
      fileName
    });

  } catch (err) {
    console.error('[BillOfSale] ERROR:', err);
    next(err);
  }
});

function levenshteinDistance(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

export default router;
