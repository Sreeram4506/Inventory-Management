import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken, authorizeManagerOrAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/summary', authenticateToken, authorizeManagerOrAdmin, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'ADMIN';

    // Fetch everything in parallel - EXCLUDING heavy base64 strings
    const [vehicles, sales, advertising, expenses, team] = await Promise.all([
      prisma.vehicle.findMany({
        include: { 
          purchase: {
            select: {
              sellerName: true,
              totalPurchaseCost: true,
              purchasePrice: true,
              purchaseDate: true,
              // base64 strings EXCLUDED
            }
          },
          repairs: true,
          sale: {
            select: {
              id: true,
              salePrice: true,
              profit: true,
              saleDate: true,
              // base64 strings EXCLUDED
            }
          } 
        }
      }),
      prisma.sale.findMany({
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
      isAdmin ? prisma.advertisingExpense.findMany() : Promise.resolve([]),
      isAdmin ? prisma.businessExpense.findMany({ orderBy: { date: 'desc' }, take: 20 }) : Promise.resolve([]),
      isAdmin ? prisma.user.findMany({
        select: {
          id: true,
          name: true,
          role: true,
          _count: { select: { vehiclesAdded: true, salesMade: true } }
        }
      }) : Promise.resolve([])
    ]);

    res.json({
      vehicles,
      sales,
      advertising,
      expenses,
      team
    });
  } catch (err) {
    next(err);
  }
});

export default router;
