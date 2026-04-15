import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

import { expenseCache } from '../utils/cache.js';

const router = express.Router();

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const cached = expenseCache.get('expense-list');
    if (cached) return res.json(cached);

    const expenses = await prisma.businessExpense.findMany({ orderBy: { date: 'desc' } });
    expenseCache.set('expense-list', expenses);
    res.json(expenses);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const expense = await prisma.businessExpense.create({
      data: { ...req.body, date: new Date(req.body.date) }
    });
    expenseCache.delete('expense-list');
    res.status(201).json(expense);
  } catch (err) {
    next(err);
  }
});

export default router;
