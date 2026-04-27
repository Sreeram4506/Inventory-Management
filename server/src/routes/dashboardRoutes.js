import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken, authorizeManagerOrAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/summary', authenticateToken, authorizeManagerOrAdmin, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'ADMIN';

    // Fetch everything in parallel
    const [vehicles, sales, advertising, expenses, team] = await Promise.all([
      prisma.vehicle.findMany({
        include: { 
          purchase: {
            select: {
              documentBase64: true,
              sourceDocumentBase64: true,
              sellerName: true,
              totalPurchaseCost: true
            }
          },
          repairs: true,
          sale: true 
        }
      }),
      prisma.sale.findMany({
        include: {
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
