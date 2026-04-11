import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const logs = await prisma.documentRegistry.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        vin: true,
        make: true,
        model: true,
        year: true,
        documentType: true,
        sourceFileName: true,
        createdAt: true,
      }
    });
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

// Route to fetch a specific document base64 since it might be heavy, we download it on demand
router.get('/:id/download', authenticateToken, async (req, res, next) => {
  try {
    const log = await prisma.documentRegistry.findUnique({
      where: { id: req.params.id },
      select: { documentBase64: true, sourceFileName: true, documentType: true }
    });
    
    if (!log || !log.documentBase64) {
      return res.status(404).json({ message: 'Document not found' });
    }
    
    let base64 = log.documentBase64;
    if (base64.includes('base64,')) {
      base64 = base64.split('base64,')[1];
    }

    const buffer = Buffer.from(base64, 'base64');
    
    res.setHeader('Content-Type', 'application/pdf');
    // Content-Disposition helps browser know it's a file
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// Optionally delete a log (Admin or self)
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    await prisma.documentRegistry.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'Document log deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
