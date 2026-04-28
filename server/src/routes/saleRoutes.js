import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken, authorizeManagerOrAdmin } from '../middlewares/authMiddleware.js';
import { validate, saleSchema } from '../utils/validators.js';

import { salesCache, vehicleCache } from '../utils/cache.js';

import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

// Allow all authenticated users, but we will mask data for STAFF
router.use(authenticateToken);

router.get('/', async (req, res, next) => {
  try {
    const cachedData = salesCache.get('sales-list');
    if (cachedData) return res.json(cachedData);

    const sales = await prisma.sale.findMany({
      select: {
        id: true,
        vehicleId: true,
        customerName: true,
        salePrice: true,
        saleDate: true,
        profit: true,
        paymentMethod: true,
        hasBillOfSale: true,
        address: true,
        phone: true,
        // billOfSaleBase64 EXCLUDED for performance
        vehicle: {
          include: { 
            purchase: {
              select: {
                id: true,
                sellerName: true,
                totalPurchaseCost: true,
                purchaseDate: true,
                // base64 strings EXCLUDED
              }
            }, 
            repairs: true 
          }
        } 
      },
      orderBy: { saleDate: 'desc' }
    });
    
    const isStaff = req.user.role === 'STAFF';
    
    // Mask profit for staff
    const processedSales = sales.map(s => {
      const hasBillOfSale = s.hasBillOfSale || false;
      
      if (isStaff) {
        const { profit, ...rest } = s;
        return { ...rest, profit: 0, hasBillOfSale };
      }
      return { ...s, hasBillOfSale };
    });

    salesCache.set('sales-list', processedSales);
    res.json(processedSales);
  } catch (err) {
    next(err);
  }
});

router.post('/', upload.single('file'), validate(saleSchema), async (req, res, next) => {
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
          hasBillOfSale: !!req.file,
          billOfSaleBase64: req.file ? req.file.buffer.toString('base64') : undefined,
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

router.patch('/:id', authenticateToken, authorizeManagerOrAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { salePrice, saleDate, customerName, phone, address, paymentMethod } = req.body;

    const existingSale = await prisma.sale.findUnique({
      where: { id },
      include: { 
        vehicle: {
          include: { purchase: true, repairs: true }
        }
      }
    });

    if (!existingSale) return res.status(404).json({ message: 'Sale not found' });

    let profit = existingSale.profit;
    if (salePrice !== undefined) {
      const vehicle = existingSale.vehicle;
      const totalPurchaseCost = vehicle.purchase?.totalPurchaseCost || 0;
      const totalRepairCost = vehicle.repairs.reduce((sum, r) => sum + r.partsCost + r.laborCost, 0);
      profit = Number(salePrice) - totalPurchaseCost - totalRepairCost;
    }

    const updatedSale = await prisma.sale.update({
      where: { id },
      data: {
        salePrice: salePrice !== undefined ? Number(salePrice) : undefined,
        saleDate: saleDate ? new Date(saleDate) : undefined,
        customerName,
        phone,
        address,
        paymentMethod,
        profit
      }
    });

    salesCache.delete('sales-list');
    res.json(updatedSale);
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
