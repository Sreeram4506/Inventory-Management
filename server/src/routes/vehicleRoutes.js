import express from 'express';
import { readFile } from 'fs/promises';
import prisma from '../db/prisma.js';
import { authenticateToken, authorizeAdmin } from '../middlewares/authMiddleware.js';
import { validate, vehicleSchema } from '../utils/validators.js';
import jwt from 'jsonwebtoken';
import { vehicleCache } from '../utils/cache.js';
import { fillUsedVehiclePdf } from '../../services/usedVehiclePdfService.js';

const defaultUsedVehicleTemplatePath = new URL('../../used-vechile-report.jpeg', import.meta.url);

const router = express.Router();

// Document download - accepts token via query param for direct browser navigation
router.get('/:id/document', async (req, res, next) => {
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
      console.log(`[BinaryStream] Token verified successfully for vehicle ${req.params.id}`);
    } catch (e) {
      console.error(`[BinaryStream] Token verification FAILED: ${e.message}`);
      return res.status(401).json({ message: 'Invalid token' });
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      include: { purchase: true }
    });

    if (!vehicle || !vehicle.purchase) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    const isSource = req.query.type === 'source';
    let base64 = isSource ? vehicle.purchase.sourceDocumentBase64 : vehicle.purchase.documentBase64;

    if (!base64) {
      return res.status(404).json({ message: 'Requested document data not available' });
    }

    if (base64.includes('base64,')) {
      base64 = base64.split('base64,')[1];
    }

    const buffer = Buffer.from(base64, 'base64');
    
    // Determine extension based on type and context
    let extension = 'pdf';
    if (isSource) {
       // Since we don't store sourceFileName in Purchase, we try to detect or default.
       // Most sources are images or PDFs.
       extension = base64.startsWith('JVBER') ? 'pdf' : 'jpg';
    }

    const prefix = isSource ? 'Source_' : 'Report_';
    const safeFileName = `${prefix}${vehicle.make}_${vehicle.model}_${(vehicle.vin || 'unk').slice(-4)}.${extension}`;
    
    console.log(`[BinaryStream] Forcing Download for vehicle ${req.params.id}, type: ${isSource ? 'source' : 'report'}, size: ${buffer.length} bytes`);
    
    const contentType = extension === 'pdf' ? 'application/pdf' : 'image/jpeg';

    res.writeHead(200, {
      'Content-Type': contentType,
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

router.get('/:id/data', authenticateToken, async (req, res, next) => {
  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      include: { purchase: true }
    });
    
    if (!vehicle || !vehicle.purchase) {
      return res.status(404).json({ message: 'Vehicle or purchase record not found' });
    }
    
    res.json({
      documentBase64: vehicle.purchase.documentBase64,
      sourceDocumentBase64: vehicle.purchase.sourceDocumentBase64
    });
  } catch (err) {
    console.error('[Vehicle Data Error]', err);
    next(err);
  }
});

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const cachedData = vehicleCache.get('vehicle-list');
    if (cachedData) {
      console.log('[Cache] Returning cached vehicle list');
      return res.json(cachedData);
    }

    const vehicles = await prisma.vehicle.findMany({
      orderBy: { createdAt: 'desc' },
      include: { 
        purchase: {
          select: {
            id: true,
            sellerName: true,
            sellerAddress: true,
            sellerCity: true,
            sellerState: true,
            sellerZip: true,
            purchasePrice: true,
            buyerFee: true,
            transportCost: true,
            inspectionCost: true,
            registrationCost: true,
            totalPurchaseCost: true,
            purchaseDate: true,
            paymentMethod: true,
            // We only need to know IF a document exists, not the actual data
            documentBase64: true,
            sourceDocumentBase64: true,
          }
        },
        repairs: true,
        sale: true 
      }
    });

    const enrichedVehicles = vehicles.map(v => {
      const hasDocument = !!v.purchase?.documentBase64;
      const hasSourceDocument = !!v.purchase?.sourceDocumentBase64;
      // Strip the heavy base64 strings from purchase before sending
      const { documentBase64, sourceDocumentBase64, ...purchaseWithoutDoc } = v.purchase || {};
      return {
        ...v,
        purchase: v.purchase ? purchaseWithoutDoc : null,
        purchasePrice: v.purchase?.purchasePrice || 0,
        totalPurchaseCost: v.purchase?.totalPurchaseCost || 0,
        inspectionCost: v.purchase?.inspectionCost || 0,
        registrationCost: v.purchase?.registrationCost || 0,
        transportCost: v.purchase?.transportCost || 0,
        repairCost: v.repairs.reduce((sum, r) => sum + r.partsCost + r.laborCost, 0),
        hasDocument,
        hasSourceDocument,
      };
    });

    vehicleCache.set('vehicle-list', enrichedVehicles);
    res.json(enrichedVehicles);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, validate(vehicleSchema), async (req, res, next) => {
  const { 
    vin, make, model, year, mileage, color, purchaseDate,
    purchasedFrom, purchasePrice, paymentMethod, transportCost, buyerFee,
    inspectionCost, registrationCost, repairCost, documentBase64, sourceDocumentBase64
  } = req.body;

  try {
    // Check if vehicle with this VIN already exists
    const existingVehicle = await prisma.vehicle.findUnique({
      where: { vin }
    });

    if (existingVehicle) {
      return res.status(409).json({ 
        message: `Vehicle with VIN '${vin}' already exists in inventory.`,
        existingId: existingVehicle.id
      });
    }

    const totalPurchaseCost = purchasePrice + transportCost + buyerFee + inspectionCost + registrationCost;
    
    // Efficiently create the vehicle with nested relations
    const vehicle = await prisma.vehicle.create({
      data: {
        vin,
        make,
        model,
        year,
        mileage,
        color,
        purchaseDate: new Date(purchaseDate),
        status: 'Available',
        purchase: {
          create: {
            sellerName: purchasedFrom,
            purchasePrice,
            buyerFee,
            transportCost,
            inspectionCost,
            registrationCost,
            totalPurchaseCost,
            purchaseDate: new Date(purchaseDate),
            paymentMethod,
            documentBase64,
            sourceDocumentBase64
          }
        },
        ...(repairCost > 0 && {
          repairs: {
            create: {
              repairShop: 'Initial Pre-Purchase Inspection/Repair',
              partsCost: repairCost,
              laborCost: 0,
              description: 'Initial repairs added during vehicle entry',
              repairDate: new Date(purchaseDate)
            }
          }
        })
      },
      include: { purchase: true, repairs: true }
    });
    
    vehicleCache.delete('vehicle-list'); // Invalidate cache
    res.status(201).json(vehicle);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { 
      vin, make, model, year, mileage, color, status, purchaseDate,
      purchasedFrom, purchasePrice, paymentMethod, transportCost, buyerFee,
      inspectionCost, registrationCost, titleNumber,
      sellerAddress, sellerCity, sellerState, sellerZip
    } = req.body;

    const vehicleId = req.params.id;

    // 1. Update the Vehicle and Purchase records
    const updatedVehicle = await prisma.$transaction(async (tx) => {
      // Check for VIN conflicts if VIN is being updated
      if (vin) {
        const existing = await tx.vehicle.findUnique({ where: { vin } });
        if (existing && existing.id !== vehicleId) {
          throw new Error('VIN_CONFLICT');
        }
      }

      // Update Vehicle details
      const v = await tx.vehicle.update({
        where: { id: vehicleId },
        data: {
          ...(vin !== undefined && { vin }),
          ...(make !== undefined && { make }),
          ...(model !== undefined && { model }),
          ...(year !== undefined && { year: Number(year) }),
          ...(mileage !== undefined && { mileage: Number(mileage) }),
          ...(color !== undefined && { color }),
          ...(status !== undefined && { status }),
          ...(titleNumber !== undefined && { titleNumber: titleNumber || null }),
          ...(purchaseDate && { purchaseDate: new Date(purchaseDate) }),
        },
        include: { purchase: true }
      });

      // Update Purchase details if provided
      if (v.purchase) {
        const pPrice = purchasePrice !== undefined ? Number(purchasePrice) : v.purchase.purchasePrice;
        const tCost = transportCost !== undefined ? Number(transportCost) : v.purchase.transportCost;
        const bFee = buyerFee !== undefined ? Number(buyerFee) : v.purchase.buyerFee;
        const iCost = inspectionCost !== undefined ? Number(inspectionCost) : v.purchase.inspectionCost;
        const rCost = registrationCost !== undefined ? Number(registrationCost) : v.purchase.registrationCost;
        const total = pPrice + tCost + bFee + iCost + rCost;

        await tx.purchase.update({
          where: { id: v.purchase.id },
          data: {
            ...(purchasedFrom !== undefined && { sellerName: purchasedFrom }),
            ...(sellerAddress !== undefined && { sellerAddress }),
            ...(sellerCity !== undefined && { sellerCity }),
            ...(sellerState !== undefined && { sellerState }),
            ...(sellerZip !== undefined && { sellerZip }),
            ...(purchasePrice !== undefined && { purchasePrice: pPrice }),
            ...(buyerFee !== undefined && { buyerFee: bFee }),
            ...(transportCost !== undefined && { transportCost: tCost }),
            ...(inspectionCost !== undefined && { inspectionCost: iCost }),
            ...(registrationCost !== undefined && { registrationCost: rCost }),
            totalPurchaseCost: total,
            ...(purchaseDate && { purchaseDate: new Date(purchaseDate) }),
            ...(paymentMethod !== undefined && { paymentMethod }),
          }
        });
      }

      return await tx.vehicle.findUnique({
        where: { id: vehicleId },
        include: { purchase: true, repairs: true, sale: true }
      });
    });

    // 2. Regenerate the PDF document
    try {
      if (updatedVehicle && updatedVehicle.purchase) {
        const templateBuffer = await readFile(defaultUsedVehicleTemplatePath);
        
        // Look up DocumentRegistry for granular disposition fields
        let registryEntry = null;
        if (updatedVehicle.vin) {
          registryEntry = await prisma.documentRegistry.findFirst({
            where: { vin: updatedVehicle.vin, documentType: 'Used Vehicle Record' },
            orderBy: { createdAt: 'desc' }
          });
        }

        // Parse the combined Sale.address string into city/state/zip components
        let parsedCity = '', parsedState = '', parsedZip = '';
        if (updatedVehicle.sale?.address) {
          const parts = updatedVehicle.sale.address.split(',').map(p => p.trim());
          // Typical format: "121 WINSLOW AVE, Norwood, MA, 02062" or "Norwood, MA, 02062"
          if (parts.length >= 3) {
            parsedZip = parts[parts.length - 1] || '';
            parsedState = parts[parts.length - 2] || '';
            parsedCity = parts[parts.length - 3] || '';
          } else if (parts.length === 2) {
            parsedState = parts[1] || '';
            parsedCity = parts[0] || '';
          }
        }

        // Build the full address for disposition line (just the street part)
        let disposedStreetAddress = updatedVehicle.sale?.address || '';
        if (updatedVehicle.sale?.address) {
          const parts = updatedVehicle.sale.address.split(',').map(p => p.trim());
          // If there are 4+ parts, first part(s) are the street address
          if (parts.length >= 4) {
            disposedStreetAddress = parts.slice(0, parts.length - 3).join(', ');
          } else {
            disposedStreetAddress = parts[0] || '';
          }
        }

        // Prepare info object for the PDF service — merging all sources
        const pdfInfo = {
          // Vehicle identification
          vin: updatedVehicle.vin,
          make: updatedVehicle.make,
          model: updatedVehicle.model,
          year: updatedVehicle.year,
          color: updatedVehicle.color,
          mileage: updatedVehicle.mileage,
          titleNumber: updatedVehicle.titleNumber || registryEntry?.titleNumber || '',
          // Acquisition details
          purchaseDate: updatedVehicle.purchaseDate,
          purchasedFrom: updatedVehicle.purchase.sellerName,
          usedVehicleSourceAddress: updatedVehicle.purchase.sellerAddress,
          usedVehicleSourceCity: updatedVehicle.purchase.sellerCity,
          usedVehicleSourceState: updatedVehicle.purchase.sellerState,
          usedVehicleSourceZipCode: updatedVehicle.purchase.sellerZip,
          purchasePrice: updatedVehicle.purchase.purchasePrice,
          transportCost: updatedVehicle.purchase.transportCost,
          inspectionCost: updatedVehicle.purchase.inspectionCost,
          registrationCost: updatedVehicle.purchase.registrationCost,
          // Disposition details — prefer registry (granular) over parsed Sale address
          disposedTo: updatedVehicle.sale?.customerName || registryEntry?.disposedTo || '',
          disposedAddress: registryEntry?.disposedAddress || disposedStreetAddress || '',
          disposedCity: registryEntry?.disposedCity || parsedCity || '',
          disposedState: registryEntry?.disposedState || parsedState || '',
          disposedZip: registryEntry?.disposedZip || parsedZip || '',
          disposedDate: updatedVehicle.sale?.saleDate || (registryEntry?.disposedDate ? new Date(registryEntry.disposedDate) : null),
          disposedPrice: updatedVehicle.sale?.salePrice || Number(registryEntry?.disposedPrice) || 0,
          disposedOdometer: Number(registryEntry?.disposedOdometer) || 0,
          disposedDlNumber: updatedVehicle.sale?.driverLicense || registryEntry?.disposedDlNumber || '',
          disposedDlState: registryEntry?.disposedDlState || '',
          paymentMethod: updatedVehicle.sale?.paymentMethod || '',
        };

        const newPdfBase64 = await fillUsedVehiclePdf(templateBuffer, pdfInfo, 'image/jpeg');

        await prisma.purchase.update({
          where: { id: updatedVehicle.purchase.id },
          data: { documentBase64: newPdfBase64 }
        });
        
        console.log(`[Regenerate] PDF rebuilt successfully for vehicle ${vehicleId}`);
      }
    } catch (pdfErr) {
      console.error('[Regenerate] Failed to rebuild PDF:', pdfErr);
      // We don't fail the whole update if only PDF regeneration fails, 
      // but the user might notice the old PDF.
    }
    
    vehicleCache.delete('vehicle-list'); // Invalidate cache
    res.json(updatedVehicle);
  } catch (err) {
    if (err.message === 'VIN_CONFLICT') {
      return res.status(409).json({ message: 'A vehicle with this VIN already exists.' });
    }
    next(err);
  }
});

router.delete('/:id', authenticateToken, authorizeAdmin, async (req, res, next) => {
  try {
    // Delete associated purchase and repairs first in a transaction
    await prisma.$transaction([
      prisma.purchase.deleteMany({ where: { vehicleId: req.params.id } }),
      prisma.repair.deleteMany({ where: { vehicleId: req.params.id } }),
      prisma.vehicle.delete({ where: { id: req.params.id } })
    ]);
    
    vehicleCache.delete('vehicle-list'); // Invalidate cache
    res.json({ message: 'Vehicle deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
