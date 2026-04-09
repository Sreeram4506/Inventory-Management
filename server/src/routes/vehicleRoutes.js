import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken, authorizeAdmin } from '../middlewares/authMiddleware.js';
import { validate, vehicleSchema } from '../utils/validators.js';

const router = express.Router();

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const vehicles = await prisma.vehicle.findMany({
      orderBy: { createdAt: 'desc' },
      include: { 
        purchase: true,
        repairs: true,
        sale: true 
      }
    });

    const enrichedVehicles = vehicles.map(v => ({
      ...v,
      purchasePrice: v.purchase?.purchasePrice || 0,
      totalPurchaseCost: v.purchase?.totalPurchaseCost || 0,
      inspectionCost: v.purchase?.inspectionCost || 0,
      registrationCost: v.purchase?.registrationCost || 0,
      transportCost: v.purchase?.transportCost || 0,
      repairCost: v.repairs.reduce((sum, r) => sum + r.partsCost + r.laborCost, 0),
      documentBase64: v.purchase?.documentBase64 || null,
    }));

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
