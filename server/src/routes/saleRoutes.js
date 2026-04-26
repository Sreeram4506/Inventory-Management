import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken, authorizeManagerOrAdmin } from '../middlewares/authMiddleware.js';
import { validate, saleSchema } from '../utils/validators.js';

import { salesCache, vehicleCache } from '../utils/cache.js';

const router = express.Router();

// Allow all authenticated users, but we will mask data for STAFF
router.use(authenticateToken);

router.get('/', async (req, res, next) => {
  try {
    const cachedData = salesCache.get('sales-list');
    if (cachedData) return res.json(cachedData);

    const sales = await prisma.sale.findMany({
      include: { 
        vehicle: {
          include: { purchase: true, repairs: true }
        } 
      },
      orderBy: { saleDate: 'desc' }
    });
    
    const isStaff = req.user.role === 'STAFF';
    
    // Mask profit for staff
    const processedSales = sales.map(s => {
      if (isStaff) {
        const { profit, ...saleData } = s;
        return { ...saleData, profit: 0 };
      }
      return s;
    });

    salesCache.set('sales-list', processedSales);
    res.json(processedSales);
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
          createdById: req.user.id,
          ...loanDetails
        }
      });
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: { status: 'Sold' }
      });
      return s;
    });

    salesCache.delete('sales-list');
    vehicleCache.delete('vehicle-list'); // Invalidate inventory as well
    res.status(201).json(sale);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticateToken, authorizeManagerOrAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id },
      select: { vehicleId: true }
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale record not found' });
    }

    await prisma.$transaction([
      // 1. Delete the sale record
      prisma.sale.delete({ where: { id } }),
      // 2. Move vehicle back to Available
      prisma.vehicle.update({
        where: { id: sale.vehicleId },
        data: { status: 'Available' }
      })
    ]);

    // 3. Clear caches
    salesCache.delete('sales-list');
    vehicleCache.delete('vehicle-list');

    res.json({ message: 'Sale deleted and vehicle reverted to Available status.' });
  } catch (err) {
    console.error('[Sale Delete Error]', err);
    next(err);
  }
});

export default router;
