import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const expenses = await prisma.businessExpense.findMany({ orderBy: { date: 'desc' } });
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
    res.status(201).json(expense);
  } catch (err) {
    next(err);
  }
});

export default router;
