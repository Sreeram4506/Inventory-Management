import express from 'express';
import multer from 'multer';
import { readFile } from 'fs/promises';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { extractVehicleInfo } from '../../services/documentParser.js';
import { buildUsedVehiclePdfFileName, fillUsedVehiclePdf } from '../../services/usedVehiclePdfService.js';
import prisma from '../db/prisma.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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

      const info = await extractVehicleInfo(sourceFile.buffer, sourceFile.mimetype);
      
      // Automatic Inventory Addition
      let vehicleId = null;
      if (info.vin && info.vin.length >= 11) {
        const existingVehicle = await prisma.vehicle.findUnique({
          where: { vin: info.vin },
          select: { id: true }
        });

        if (!existingVehicle) {
          const totalPurchaseCost = (info.purchasePrice || 0) + 
                                  (info.transportCost || 0) + 
                                  (info.inspectionCost || 0) + 
                                  (info.registrationCost || 0);

          const newVehicle = await prisma.vehicle.create({
            data: {
              vin: info.vin,
              make: info.make || 'Unknown',
              model: info.model || 'Unknown',
              year: info.year || new Date().getFullYear(),
              mileage: info.mileage || 0,
              color: info.color || 'Unknown',
              purchaseDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date(),
              status: 'Available',
              purchase: {
                create: {
                  sellerName: info.purchasedFrom || 'Automated Scan',
                  purchasePrice: info.purchasePrice || 0,
                  transportCost: info.transportCost || 0,
                  inspectionCost: info.inspectionCost || 0,
                  registrationCost: info.registrationCost || 0,
                  totalPurchaseCost,
                  purchaseDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date(),
                  paymentMethod: info.paymentMethod || 'Bank Transfer',
                  documentBase64: sourceFile.buffer.toString('base64'),
                }
              },
              ...(info.repairCost > 0 && {
                repairs: {
                  create: {
                    repairShop: 'Scanner Detected Repairs',
                    partsCost: info.repairCost,
                    laborCost: 0,
                    description: 'Repairs extracted from scanned document',
                    repairDate: info.purchaseDate ? new Date(info.purchaseDate) : new Date()
                  }
                }
              })
            }
          });
          vehicleId = newVehicle.id;
        } else {
          vehicleId = existingVehicle.id;
        }
      }

      const templateBuffer = templateFile
        ? templateFile.buffer
        : await readFile(defaultUsedVehicleTemplatePath);
      const templateMimeType = templateFile?.mimetype || 'image/jpeg';
      const filledPdf = await fillUsedVehiclePdf(
        templateBuffer,
        info,
        templateMimeType
      );
      const fileName = buildUsedVehiclePdfFileName(info);

      res.json({
        success: true,
        info,
        fileName,
        pdfBase64: filledPdf.toString('base64'),
        inventoryAdded: !!vehicleId
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
