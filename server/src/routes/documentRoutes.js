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
      
      // We do not add the vehicle to the inventory here. 
      // The user will review the extracted data in the UI and submit it via the AddVehicleDialog.

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
