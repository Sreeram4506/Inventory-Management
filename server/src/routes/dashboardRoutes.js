import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import Cache from '../utils/cache.js';

// Separate caches per role to prevent data leakage
const dashboardCache = new Cache(120000); // 2 minutes — dashboard data changes less frequently

const router = express.Router();

router.get('/summary', async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'ADMIN';
    const isStaff = req.user.role === 'STAFF';
    const cacheKey = `dashboard-${req.user.role}-${req.dealershipId}`; // Tenant-specific cache key

    // Check cache first — avoids 5 parallel DB queries on rapid dashboard visits
    const cached = dashboardCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Fetch everything in parallel - EXCLUDING heavy base64 strings
    const [vehicles, sales, advertising, expenses, team] = await Promise.all([
      prisma.vehicle.findMany({
        where: { dealershipId: req.dealershipId },
        include: { 
          purchase: {
            select: {
              sellerName: true,
              totalPurchaseCost: true,
              purchasePrice: true,
              purchaseDate: true,
            }
          },
          repairs: true,
          sale: {
            select: {
              id: true,
              salePrice: true,
              profit: true,
              saleDate: true,
            }
          } 
        }
      }),
      prisma.sale.findMany({
        where: { dealershipId: req.dealershipId },
        select: {
          id: true,
          salePrice: true,
          profit: true,
          saleDate: true,
          customerName: true,
          vehicle: {
            select: { make: true, model: true }
          }
        },
        orderBy: { saleDate: 'desc' }
      }),
      isAdmin ? prisma.advertisingExpense.findMany({ where: { dealershipId: req.dealershipId } }) : Promise.resolve([]),
      isAdmin ? prisma.businessExpense.findMany({ 
        where: { dealershipId: req.dealershipId }, 
        orderBy: { date: 'desc' }, 
        take: 20 
      }) : Promise.resolve([]),
      isAdmin ? prisma.user.findMany({
        where: { dealershipId: req.dealershipId },
        select: {
          id: true,
          name: true,
          role: true,
          _count: { select: { vehiclesAdded: true, salesMade: true } }
        }
      }) : Promise.resolve([])
    ]);

    // If Staff, mask sensitive financial data in the summary
    const maskedVehicles = isStaff ? vehicles.map(v => ({
      ...v,
      purchase: null,
      repairs: [],
      sale: v.sale ? { id: v.sale.id, saleDate: v.sale.saleDate } : null
    })) : vehicles;

    const maskedSales = isStaff ? sales.map(s => ({
      id: s.id,
      saleDate: s.saleDate,
      vehicle: s.vehicle,
      salePrice: 0,
      profit: 0,
      customerName: 'Customer' // Generic name for staff
    })) : sales;

    const result = {
      vehicles: maskedVehicles,
      sales: maskedSales,
      advertising,
      expenses,
      team
    };

    // Cache the role-specific result
    dashboardCache.set(cacheKey, result);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
