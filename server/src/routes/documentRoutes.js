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

      // ── Check for duplicate in registry ──
      const existingLog = await prisma.documentRegistry.findFirst({
        where: { vin: info.vin, documentType: 'Used Vehicle Record' },
        orderBy: { createdAt: 'desc' }
      });
      if (existingLog && (Date.now() - new Date(existingLog.createdAt).getTime()) < 5 * 60 * 1000) {
        return res.status(409).json({ 
          status: 'error', 
          message: `Vehicle with VIN ${info.vin} already exists in inventory.` 
        });
      }

      // ── Save to Document Registry ──
      try {
        await prisma.documentRegistry.create({
          data: {
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
          }
        });
        registryId = 'logged';
      } catch (logErr) {
        console.error('Failed to save to DocumentRegistry:', logErr);
      }

      // ── Push to Inventory with status = "Available" ──
      if (isPushToInventory) {
        const purchasePrice = Number(info.purchasePrice) || 0;
        const transportCost = Number(info.transportCost) || 0;
        const repairCost = Number(info.repairCost) || 0;
        const inspectionCost = Number(info.inspectionCost) || 0;
        const registrationCost = Number(info.registrationCost) || 0;
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

    // ── Step 3: EXACT VIN match in inventory ──
    const vehicle = await prisma.vehicle.findUnique({
      where: { vin: extractedVin },
      include: { 
        purchase: true,
        repairs: true,
        sale: true
      }
    });

    if (!vehicle) {
      return res.status(404).json({ status: 'error', message: `VIN not found in inventory: ${extractedVin}` });
    }

    console.log(`[BillOfSale] EXACT VIN match found: ${extractedVin} → Vehicle ID: ${vehicle.id}`);

    // ── Step 4: Update vehicle status: AVAILABLE → SOLD ──
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { status: 'Sold' }
    });
    console.log(`[BillOfSale] Vehicle status updated: Available → Sold`);

    // ── Step 5: Create Sale record (move to SALES) ──
    const salePrice = Number(billOfSaleInfo.disposedPrice) || 0;
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
          profit
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
          profit: salePrice ? (salePrice - purchaseCost - repairCost) : vehicle.sale.profit
        }
      });
      console.log(`[BillOfSale] Sale record UPDATED`);
    }

    // ── Step 6: Update Registry entry with disposition data ──
    const existingEntry = await prisma.documentRegistry.findFirst({
      where: { vin: extractedVin, documentType: 'Used Vehicle Record' },
      orderBy: { createdAt: 'desc' }
    });

    let filledPdf;
    if (existingEntry || vehicle) {
      // Merge disposition data into existing registry entry (or build from scratch if none exists)
      const mergedInfo = {
        vin: extractedVin,
        make: vehicle?.make || '',
        model: vehicle?.model || '',
        year: vehicle?.year || '',
        color: vehicle?.color || '',
        mileage: vehicle?.mileage || 0,
        titleNumber: vehicle?.titleNumber || '',
        purchasedFrom: vehicle?.purchase?.sellerName || '',
        purchaseDate: vehicle?.purchaseDate?.toISOString(),
        purchasePrice: vehicle?.purchase?.purchasePrice || 0,
        usedVehicleSourceAddress: vehicle?.purchase?.sellerAddress || '',
        usedVehicleSourceCity: vehicle?.purchase?.sellerCity || '',
        usedVehicleSourceState: vehicle?.purchase?.sellerState || '',
        usedVehicleSourceZipCode: vehicle?.purchase?.sellerZip || '',
        // Disposition from Bill of Sale extraction
        disposedTo: customerName,
        disposedAddress: billOfSaleInfo.disposedAddress,
        disposedCity: billOfSaleInfo.disposedCity,
        disposedState: billOfSaleInfo.disposedState,
        disposedZip: billOfSaleInfo.disposedZip,
        disposedDate: billOfSaleInfo.disposedDate,
        disposedPrice: billOfSaleInfo.disposedPrice,
        disposedOdometer: billOfSaleInfo.disposedOdometer,
        disposedDlNumber: billOfSaleInfo.disposedDlNumber,
        disposedDlState: billOfSaleInfo.disposedDlState,
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
            disposedPrice: billOfSaleInfo.disposedPrice ? String(billOfSaleInfo.disposedPrice) : null,
            disposedOdometer: billOfSaleInfo.disposedOdometer ? String(billOfSaleInfo.disposedOdometer) : null,
            disposedDlNumber: String(billOfSaleInfo.disposedDlNumber || ''),
            disposedDlState: String(billOfSaleInfo.disposedDlState || ''),
            documentBase64: filledPdf
          }
        });
        console.log(`[BillOfSale] Registry entry UPDATED with disposition data`);
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
            disposedPrice: billOfSaleInfo.disposedPrice ? String(billOfSaleInfo.disposedPrice) : null,
            disposedOdometer: billOfSaleInfo.disposedOdometer ? String(billOfSaleInfo.disposedOdometer) : null,
            disposedDlNumber: String(billOfSaleInfo.disposedDlNumber || ''),
            disposedDlState: String(billOfSaleInfo.disposedDlState || ''),
            sourceFileName: req.file.originalname,
            sourceDocumentBase64: req.file.buffer.toString('base64'),
          }
        });
        console.log(`[BillOfSale] New Registry entry CREATED with disposition data`);
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

export default router;
