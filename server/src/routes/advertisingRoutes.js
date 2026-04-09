import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const ads = await prisma.advertisingExpense.findMany({ orderBy: { startDate: 'desc' } });
    res.json(ads);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const ad = await prisma.advertisingExpense.create({
      data: {
        ...req.body,
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate)
      }
    });
    res.status(201).json(ad);
  } catch (err) {
    next(err);
  }
});

export default router;
