import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import jwt from 'jsonwebtoken';

import { fillUsedVehiclePdf } from '../../services/usedVehiclePdfService.js';
import { readFile } from 'fs/promises';

const router = express.Router();
const defaultUsedVehicleTemplatePath = new URL('../../used-vechile-report.jpeg', import.meta.url);

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const allLogs = await prisma.documentRegistry.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        vin: true,
        make: true,
        model: true,
        year: true,
        titleNumber: true,
        purchasedFrom: true,
        sellerAddress: true,
        sellerCity: true,
        sellerState: true,
        sellerZip: true,
        disposedTo: true,
        disposedPrice: true,
        disposedDate: true,
        documentType: true,
        sourceFileName: true,
        createdAt: true
      }
    });
    
    // De-duplicate: Keep only the latest entry for each (VIN + DocumentType) combination
    const uniqueLogsMap = new Map();
    
    allLogs.forEach(log => {
      const type = log.documentType || 'Used Vehicle Record';
      const key = `${log.vin}-${type}`;
      
      // Since it's ordered by createdAt DESC, the first one we see is the latest
      if (!uniqueLogsMap.has(key)) {
        uniqueLogsMap.set(key, {
          ...log,
          documentType: type
        });
      }
    });

    const logs = Array.from(uniqueLogsMap.values());
    console.log(`[Registry] Found ${allLogs.length} logs, returning ${logs.length} unique entries`);
    res.json(logs);
  } catch (err) {
    console.error('[Registry Error]', err);
    next(err);
  }
});

router.get('/:id/data', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const log = await prisma.documentRegistry.findUnique({
      where: { id },
      select: { documentBase64: true, sourceDocumentBase64: true, vin: true }
    });
    
    if (!log) {
      return res.status(404).json({ message: 'Document log not found' });
    }
    
    // Also try to find a Bill of Sale associated with this VIN
    let billOfSaleBase64 = null;
    if (log.vin) {
      const vehicle = await prisma.vehicle.findUnique({
        where: { vin: log.vin },
        include: { sale: true }
      });
      if (vehicle?.sale?.hasBillOfSale) {
        billOfSaleBase64 = vehicle.sale.billOfSaleBase64;
      }
    }
    
    res.json({
      ...log,
      billOfSaleBase64
    });
  } catch (err) {
    console.error('[Registry Data Error]', err);
    next(err);
  }
});

router.patch('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // 1. Get current log to ensure it exists
    const currentLog = await prisma.documentRegistry.findUnique({
      where: { id }
    });

    if (!currentLog) {
      return res.status(404).json({ message: 'Document log not found' });
    }

    // 2. Merge updates
    const updatedData = { ...currentLog, ...updates };

    // 3. Regenerate PDF with updated info
    // We use the default template for now as it's the standard for 'Used Vehicle Record'
    const templateBuffer = await readFile(defaultUsedVehicleTemplatePath);
    const filledPdf = await fillUsedVehiclePdf(
      templateBuffer,
      updatedData,
      'image/jpeg'
    );

    // 4. Save back to DB
    const log = await prisma.documentRegistry.update({
      where: { id },
      data: {
        ...updates,
        documentBase64: filledPdf
      }
    });

    res.json(log);
  } catch (err) {
    console.error('[Registry Patch Error]', err);
    next(err);
  }
});

router.get('/:id/download', async (req, res, next) => {
  try {
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

    try {
      jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const log = await prisma.documentRegistry.findUnique({
      where: { id: req.params.id },
      select: { documentBase64: true, sourceDocumentBase64: true, sourceFileName: true, documentType: true }
    });
    
    if (!log) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const isSource = req.query.type === 'source';
    let base64 = isSource ? log.sourceDocumentBase64 : log.documentBase64;

    if (!base64) {
      return res.status(404).json({ message: 'Requested document data not available' });
    }
    
    if (base64.includes('base64,')) {
      base64 = base64.split('base64,')[1];
    }

    const buffer = Buffer.from(base64, 'base64');

    // Determine extension based on type and context
    let extension = 'pdf';
    if (isSource && log.sourceFileName) {
       const parts = log.sourceFileName.split('.');
       if (parts.length > 1) extension = parts.pop().toLowerCase();
    } else {
       // Generated records are usually PDF
       extension = 'pdf';
    }

    const prefix = isSource ? 'Source_' : '';
    const safeFileName = `${prefix}${(log.documentType || 'Document').replace(/\s+/g, '_')}_${(log.sourceFileName || 'log').split('.')[0]}.${extension}`;
    
    const contentType = extension === 'pdf' ? 'application/pdf' : 
                        extension === 'png' ? 'image/png' : 
                        (extension === 'jpg' || extension === 'jpeg') ? 'image/jpeg' : 
                        'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': buffer.length,
      'Content-Disposition': `attachment; filename="${safeFileName}"`,
    });
    
    res.end(buffer);
  } catch (err) {
    next(err);
  }
});

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
