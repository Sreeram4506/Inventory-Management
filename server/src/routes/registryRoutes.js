import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import jwt from 'jsonwebtoken';

import { fillUsedVehiclePdf } from '../../services/usedVehiclePdfService.js';
import { readFile } from 'fs/promises';

const router = express.Router();
const defaultUsedVehicleTemplatePath = new URL('../../used-vechile-report.jpeg', import.meta.url);

router.get('/', async (req, res, next) => {
  try {
    const allLogs = await prisma.documentRegistry.findMany({
      where: { dealershipId: req.dealershipId },
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

router.get('/:id/data', async (req, res, next) => {
  try {
    const { id } = req.params;
    const log = await prisma.documentRegistry.findFirst({
      where: { id, dealershipId: req.dealershipId },
      select: { documentBase64: true, sourceDocumentBase64: true, vin: true }
    });
    
    if (!log) {
      return res.status(404).json({ message: 'Document log not found' });
    }
    
    // Also try to find a Bill of Sale associated with this VIN
    let billOfSaleBase64 = null;
    if (log.vin) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { vin: log.vin, dealershipId: req.dealershipId },
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

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // 1. Get current log to ensure it exists and belongs to THIS dealership
    const currentLog = await prisma.documentRegistry.findFirst({
      where: { id, dealershipId: req.dealershipId }
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
    const updateResult = await prisma.documentRegistry.updateMany({
      where: { id, dealershipId: req.dealershipId },
      data: {
        ...updates,
        documentBase64: filledPdf
      }
    });

    if (updateResult.count === 0) {
      return res.status(404).json({ message: 'Document log not found' });
    }

    const log = await prisma.documentRegistry.findUnique({ where: { id } });

    res.json(log);
  } catch (err) {
    console.error('[Registry Patch Error]', err);
    next(err);
  }
});

router.get('/:id/download', async (req, res, next) => {
  try {
    // Authentication already handled by global app middleware
    
    const log = await prisma.documentRegistry.findFirst({
      where: { id: req.params.id, dealershipId: req.dealershipId },
      select: { documentBase64: true, sourceDocumentBase64: true, sourceFileName: true, documentType: true, vin: true }
    });
    
    if (!log) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const docType = req.query.type;
    let base64;
    let prefix = '';

    if (docType === 'source') {
      base64 = log.sourceDocumentBase64;
      prefix = 'Source_';
    } else if (docType === 'sale') {
      if (log.vin) {
        const vehicle = await prisma.vehicle.findFirst({
          where: { vin: log.vin, dealershipId: req.dealershipId },
          include: { sale: true }
        });
        base64 = vehicle?.sale?.billOfSaleBase64;
      }
      prefix = 'BillOfSale_';
    } else {
      base64 = log.documentBase64;
    }

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

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.documentRegistry.deleteMany({
      where: { id: req.params.id, dealershipId: req.dealershipId }
    });
    res.json({ message: 'Document log deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
