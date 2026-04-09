import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { validate, saleSchema } from '../utils/validators.js';

const router = express.Router();

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const sales = await prisma.sale.findMany({
      include: { 
        vehicle: {
          include: { purchase: true, repairs: true }
        } 
      },
      orderBy: { saleDate: 'desc' }
    });
    res.json(sales);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, validate(saleSchema), async (req, res, next) => {
  try {
    const { vehicleId, saleDate, salePrice, customerName, phone, address, paymentMethod, ...loanDetails } = req.body;
    
    // Fetch vehicle with all costs for profit calculation
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { purchase: true, repairs: true }
    });

    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });

    const totalPurchaseCost = vehicle.purchase?.totalPurchaseCost || 0;
    const totalRepairCost = vehicle.repairs.reduce((sum, r) => sum + r.partsCost + r.laborCost, 0);
    
    // Profit = Sale Price - Purchase Cost - Repair Cost
    const profit = salePrice - totalPurchaseCost - totalRepairCost;

    const sale = await prisma.$transaction(async (tx) => {
      const s = await tx.sale.create({
        data: {
          customerName,
          phone,
          address,
          saleDate: new Date(saleDate),
          salePrice,
          paymentMethod,
          profit,
          vehicleId,
          ...loanDetails
        }
      });
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: { status: 'Sold' }
      });
      return s;
    });
    res.status(201).json(sale);
  } catch (err) {
    next(err);
  }
});

export default router;
