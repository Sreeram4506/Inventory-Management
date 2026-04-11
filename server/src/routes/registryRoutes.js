import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import jwt from 'jsonwebtoken';

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
router.get('/:id/download', async (req, res, next) => {
  try {
    // Accept token from either Authorization header OR query parameter
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Verify the token manually
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      console.log(`[BinaryStream] Token verified successfully for registry log ${req.params.id}`);
    } catch (e) {
      console.error(`[BinaryStream] Token verification FAILED for registry: ${e.message}`);
      return res.status(401).json({ message: 'Invalid token' });
    }

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
    const safeFileName = `${(log.documentType || 'Document').replace(/\s+/g, '_')}_${(log.sourceFileName || 'log').split('.')[0]}.pdf`;
    console.log(`[BinaryStream] Forcing registry download ${req.params.id}, size: ${buffer.length} bytes`);
    
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': buffer.length,
      'Content-Disposition': `attachment; filename="${safeFileName}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Download-Options': 'noopen',
      'Content-Transfer-Encoding': 'binary'
    });
    
    res.end(buffer);
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
