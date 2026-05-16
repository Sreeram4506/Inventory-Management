import express from 'express';
import multer from 'multer';
import prisma from '../db/prisma.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { extractText, extractVinFromText, extractTotalFromText } from '../../services/documentParser.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/', async (req, res, next) => {
  const { vehicleId, repairShop, partsCost, laborCost, description, repairDate } = req.body;
  try {
    const repair = await prisma.repair.create({
      data: {
        vehicleId,
        repairShop,
        partsCost: parseFloat(partsCost),
        laborCost: parseFloat(laborCost),
        description,
        repairDate: new Date(repairDate || Date.now()),
        dealershipId: req.dealershipId
      }
    });
    res.status(201).json(repair);
  } catch (err) {
    next(err);
  }
});

// Upload repair bill: extract VIN and total, attach repair to matching vehicle
router.post('/upload-bill', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ status: 'error', message: 'No file uploaded' });

    const rawText = await extractText(req.file.buffer, req.file.mimetype);
    const vin = extractVinFromText(rawText) || (req.body.vin ? String(req.body.vin).trim().toUpperCase() : null);
    const total = extractTotalFromText(rawText) || (req.body.total ? parseFloat(req.body.total) : 0);

    if (!vin) return res.status(400).json({ status: 'error', message: 'VIN not found in repair bill' });

    const vehicle = await prisma.vehicle.findFirst({ where: { vin, dealershipId: req.dealershipId } });
    if (!vehicle) return res.status(404).json({ status: 'error', message: `Vehicle with VIN ${vin} not found` });

    // Try to infer shop/vendor name from top of document
    const candidateLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 6);
    let vendor = null;
    for (const line of candidateLines) {
      if (/TOTAL|INVOICE|BILL|AMOUNT|DATE/i.test(line)) continue;
      if (/[A-Za-z]{3,}/.test(line) && line.length > 3) { vendor = line; break; }
    }

    const repair = await prisma.repair.create({
      data: {
        vehicleId: vehicle.id,
        repairShop: vendor || 'Uploaded Repair Bill',
        partsCost: total || 0,
        laborCost: 0,
        description: `Repair bill uploaded: ${req.file.originalname}`,
        repairDate: new Date(),
        dealershipId: req.dealershipId
      }
    });

    res.json({ success: true, repair, vin });
  } catch (err) {
    next(err);
  }
});

export default router;
