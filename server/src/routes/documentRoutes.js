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

export default router;
