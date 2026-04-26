import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken, authorizeAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Get all team members and their activity
router.get('/', authenticateToken, authorizeAdmin, async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        role: { in: ['MANAGER', 'STAFF'] }
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            vehiclesAdded: true,
            salesMade: true
          }
        },
        vehiclesAdded: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            createdAt: true
          }
        },
        salesMade: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            salePrice: true,
            profit: true,
            createdAt: true,
            vehicle: {
              select: { make: true, model: true }
            }
          }
        }
      }
    });

    res.json(users);
  } catch (err) {
    next(err);
  }
});

export default router;
