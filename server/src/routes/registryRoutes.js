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
    
    if (!log) {
      return res.status(404).json({ message: 'Document not found' });
    }
    
    res.json(log);
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
