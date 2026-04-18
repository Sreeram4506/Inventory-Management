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
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit for security
});

const defaultUsedVehicleTemplatePath = new URL('../../used-vechile-report.jpeg', import.meta.url);

router.post('/scan-document', authenticateToken, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const info = await extractVehicleInfo(req.file.buffer, req.file.mimetype);
    res.json({ success: true, info });
  } catch (err) {
    next(err);
  }
});

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
        return res.status(400).json({ message: 'Source document is required' });
      }

      if (templateFile && !supportedTemplateMimeTypes.has(templateFile.mimetype)) {
        return res.status(400).json({
          message: 'Used vehicle template must be a PDF, JPG, or PNG',
        });
      }

      info = await extractVehicleInfo(sourceFile.buffer, sourceFile.mimetype);
      
      const templateBuffer = templateFile
        ? templateFile.buffer
        : await readFile(defaultUsedVehicleTemplatePath);
      const templateMimeType = templateFile?.mimetype || 'image/jpeg';
      const filledPdf = await fillUsedVehiclePdf(
        templateBuffer,
        info,
        templateMimeType
      );

      const isPushToInventory = req.body.pushToInventory === 'true';
      let vehicleId = null;
      let registryId = null;

      const pdfBase64Str = filledPdf;

      // 1. ALWAYS check if the vehicle already exists in the inventory, regardless of what we're doing.
      // If it exists in the inventory, block the entire process and throw an error.
      if (info.vin) {
        const existingVehicle = await prisma.vehicle.findUnique({ where: { vin: info.vin } });
        if (existingVehicle) {
          throw new Error(`Vehicle with VIN ${info.vin} already exists in inventory.`);
        }
      } else if (isPushToInventory && !info.vin) {
        throw new Error('Could not extract a valid VIN from the document. Unable to push to inventory.');
      }

      // 2. Check for exact duplicate document in registry to prevent log bloat
      if (info.vin) {
        const existingLog = await prisma.documentRegistry.findFirst({
           where: { vin: info.vin, documentType: 'Used Vehicle Record' },
           orderBy: { createdAt: 'desc' }
        });
        
        // If a registry entry exists from less than 5 minutes ago for this exact VIN, block it as duplicate
        if (existingLog && (Date.now() - new Date(existingLog.createdAt).getTime()) < 5 * 60 * 1000) {
           throw new Error(`Vehicle with VIN ${info.vin} already exists in inventory.`);
        }
      }

      // ALWAYS save to Document Registry (Logs) AFTER validation
      try {
        await prisma.documentRegistry.create({
          data: {
            vin: info.vin || null,
            make: info.make || null,
            model: info.model || null,
            year: info.year ? String(info.year) : null,
            titleNumber: info.titleNumber || null,
            documentType: 'Used Vehicle Record',
            documentBase64: pdfBase64Str,
            sourceFileName: sourceFile.originalname || null,
            sourceDocumentBase64: sourceFile.buffer.toString('base64'),
          }
        });
        registryId = 'logged'; // Marker that registry was updated
      } catch (logErr) {
        console.error('Failed to save to DocumentRegistry:', logErr);
      }

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
            status: 'Available',
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
      }

      const fileName = buildUsedVehiclePdfFileName(info);

      res.json({
        success: true,
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
           message: err.message, 
           existingId: existing?.id 
         });
      }
      next(err);
    }
  }
);

import { vehicleCache, salesCache } from '../utils/cache.js';

router.post('/upload-bill-of-sale', authenticateToken, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    
    // 1. Extract info from Bill of Sale
    const billOfSaleInfo = await extractVehicleInfo(req.file.buffer, req.file.mimetype);
    
    if (!billOfSaleInfo.vin) {
      return res.status(400).json({ message: 'Could not extract VIN from Bill of Sale.' });
    }

    const cleanVin = billOfSaleInfo.vin.trim().toUpperCase();

    // 2. Find existing registry entry for this VIN
    let existingEntry = await prisma.documentRegistry.findFirst({
      where: { vin: cleanVin, documentType: 'Used Vehicle Record' },
      orderBy: { createdAt: 'desc' }
    });

    let mergedInfo;
    if (existingEntry) {
      mergedInfo = {
        ...existingEntry,
        vin: cleanVin,
        disposedTo: billOfSaleInfo.disposedTo || existingEntry.disposedTo,
        disposedAddress: billOfSaleInfo.disposedAddress || existingEntry.disposedAddress,
        disposedCity: billOfSaleInfo.disposedCity || existingEntry.disposedCity,
        disposedState: billOfSaleInfo.disposedState || existingEntry.disposedState,
        disposedZip: billOfSaleInfo.disposedZip || existingEntry.disposedZip,
        disposedDate: billOfSaleInfo.disposedDate || existingEntry.disposedDate,
        disposedPrice: billOfSaleInfo.disposedPrice || existingEntry.disposedPrice,
        disposedOdometer: billOfSaleInfo.disposedOdometer || existingEntry.disposedOdometer,
        disposedDlNumber: billOfSaleInfo.disposedDlNumber || existingEntry.disposedDlNumber,
        disposedDlState: billOfSaleInfo.disposedDlState || existingEntry.disposedDlState,
      };
    } else {
      mergedInfo = { ...billOfSaleInfo, vin: cleanVin };
    }

    // 3. Regenerate PDF
    const templateBuffer = await readFile(defaultUsedVehicleTemplatePath);
    const filledPdf = await fillUsedVehiclePdf(
      templateBuffer,
      mergedInfo,
      'image/jpeg'
    );

    // 4. Update or Create Registry Entry
    let result;
    if (existingEntry) {
      result = await prisma.documentRegistry.update({
        where: { id: existingEntry.id },
        data: {
          disposedTo: String(mergedInfo.disposedTo || ''),
          disposedAddress: String(mergedInfo.disposedAddress || ''),
          disposedCity: String(mergedInfo.disposedCity || ''),
          disposedState: String(mergedInfo.disposedState || ''),
          disposedZip: String(mergedInfo.disposedZip || ''),
          disposedDate: mergedInfo.disposedDate ? String(mergedInfo.disposedDate) : null,
          disposedPrice: mergedInfo.disposedPrice ? String(mergedInfo.disposedPrice) : null,
          disposedOdometer: mergedInfo.disposedOdometer ? String(mergedInfo.disposedOdometer) : null,
          disposedDlNumber: String(mergedInfo.disposedDlNumber || ''),
          disposedDlState: String(mergedInfo.disposedDlState || ''),
          documentBase64: filledPdf
        }
      });
    } else {
      result = await prisma.documentRegistry.create({
        data: {
          vin: cleanVin,
          make: mergedInfo.make,
          model: mergedInfo.model,
          year: String(mergedInfo.year),
          documentType: 'Used Vehicle Record',
          documentBase64: filledPdf,
          disposedTo: String(mergedInfo.disposedTo || ''),
          disposedAddress: String(mergedInfo.disposedAddress || ''),
          disposedCity: String(mergedInfo.disposedCity || ''),
          disposedState: String(mergedInfo.disposedState || ''),
          disposedZip: String(mergedInfo.disposedZip || ''),
          disposedDate: mergedInfo.disposedDate ? String(mergedInfo.disposedDate) : null,
          disposedPrice: mergedInfo.disposedPrice ? String(mergedInfo.disposedPrice) : null,
          disposedOdometer: mergedInfo.disposedOdometer ? String(mergedInfo.disposedOdometer) : null,
          disposedDlNumber: String(mergedInfo.disposedDlNumber || ''),
          disposedDlState: String(mergedInfo.disposedDlState || ''),
          sourceFileName: req.file.originalname,
          sourceDocumentBase64: req.file.buffer.toString('base64'),
        }
      });
    }

    const fileName = buildUsedVehiclePdfFileName(mergedInfo);
    let inventorySynced = false;

    // 5. If it's a Bill of Sale, we should also update the Vehicle status in Inventory
    try {
      const vehicle = await prisma.vehicle.findUnique({
        where: { vin: cleanVin },
        include: { 
          purchase: true,
          repairs: true,
          sale: true
        }
      });

      if (vehicle) {
        console.log(`[Sync] Matching vehicle found for VIN ${cleanVin}. Updating status to Sold.`);
        // Update vehicle status
        await prisma.vehicle.update({
          where: { id: vehicle.id },
          data: { status: 'Sold' }
        });

        // Create or update Sale record
        const salePrice = Number(billOfSaleInfo.disposedPrice) || 0;
        const purchaseCost = vehicle.purchase?.totalPurchaseCost || 0;
        const repairCost = vehicle.repairs?.reduce((acc, r) => acc + (r.partsCost || 0) + (r.laborCost || 0), 0) || 0;
        const profit = salePrice - purchaseCost - repairCost;

        if (!vehicle.sale) {
          await prisma.sale.create({
            data: {
              vehicleId: vehicle.id,
              customerName: billOfSaleInfo.disposedTo || 'Unknown Customer',
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
        } else {
          await prisma.sale.update({
            where: { id: vehicle.sale.id },
            data: {
              customerName: billOfSaleInfo.disposedTo || vehicle.sale.customerName,
              address: [
                billOfSaleInfo.disposedAddress,
                billOfSaleInfo.disposedCity,
                billOfSaleInfo.disposedState,
                billOfSaleInfo.disposedZip
              ].filter(Boolean).join(', ') || vehicle.sale.address,
              driverLicense: billOfSaleInfo.disposedDlNumber || vehicle.sale.driverLicense,
              saleDate: billOfSaleInfo.disposedDate ? new Date(billOfSaleInfo.disposedDate) : vehicle.sale.saleDate,
              salePrice: salePrice || vehicle.sale.salePrice,
              profit: salePrice ? (salePrice - purchaseCost - repairCost) : vehicle.sale.profit
            }
          });
        }
        
        // IMPORTANT: Invalidate both caches so the frontend sees the change
        vehicleCache.delete('vehicle-list');
        salesCache.delete('sales-list');
        inventorySynced = true;
        console.log(`[Sync] Caches invalidated for VIN ${cleanVin}`);
      } else {
        console.warn(`[Sync] No vehicle found in inventory matching VIN ${cleanVin}`);
      }
    } catch (syncErr) {
      console.error('[Sync Error] Failed to sync Bill of Sale with Inventory:', syncErr);
    }

    res.json({
      success: true,
      info: mergedInfo,
      fileName,
      pdfBase64: filledPdf,
      registryId: result.id,
      inventorySynced
    });
  } catch (err) {
    next(err);
  }
});

export default router;
