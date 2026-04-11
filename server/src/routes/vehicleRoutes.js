import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken, authorizeAdmin } from '../middlewares/authMiddleware.js';
import { validate, vehicleSchema } from '../utils/validators.js';
import jwt from 'jsonwebtoken';

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

    if (!vehicle || !vehicle.purchase?.documentBase64) {
      return res.status(404).json({ message: 'Document not found' });
    }

    let base64 = vehicle.purchase.documentBase64;
    if (base64.includes('base64,')) {
      base64 = base64.split('base64,')[1];
    }

    const buffer = Buffer.from(base64, 'base64');
    const safeFileName = `Document_${vehicle.make}_${vehicle.model}_${(vehicle.vin || 'unk').slice(-4)}.pdf`;
    console.log(`[BinaryStream] Forcing Download for vehicle ${req.params.id}, size: ${buffer.length} bytes`);
    
    // Use attachment and octet-stream + noopen to FORCE a local save in Edge
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

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const vehicles = await prisma.vehicle.findMany({
      orderBy: { createdAt: 'desc' },
      include: { 
        purchase: {
          select: {
            id: true,
            sellerName: true,
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
          }
        },
        repairs: true,
        sale: true 
      }
    });

    const enrichedVehicles = vehicles.map(v => {
      const hasDocument = !!v.purchase?.documentBase64;
      // Strip the heavy documentBase64 from purchase before sending
      const { documentBase64, ...purchaseWithoutDoc } = v.purchase || {};
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
      };
    });

    res.json(enrichedVehicles);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, validate(vehicleSchema), async (req, res, next) => {
  const { 
    vin, make, model, year, mileage, color, purchaseDate,
    purchasedFrom, purchasePrice, paymentMethod, transportCost, buyerFee,
    inspectionCost, registrationCost, repairCost, documentBase64
  } = req.body;

  try {
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
            documentBase64
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
    res.status(201).json(vehicle);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticateToken, async (req, res, next) => {
  try {
    const vehicle = await prisma.vehicle.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(vehicle);
  } catch (err) {
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
    res.json({ message: 'Vehicle deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
