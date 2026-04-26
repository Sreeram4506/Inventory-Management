import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken, authorizeAdmin } from '../middlewares/authMiddleware.js';
import { validate, expenseSchema } from '../utils/validators.js';
import { expenseCache } from '../utils/cache.js';

const router = express.Router();

// Only Admin can manage/view business expenses
router.use(authenticateToken, authorizeAdmin);

router.get('/', async (req, res, next) => {
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

router.post('/', authenticateToken, validate(expenseSchema), async (req, res, next) => {
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

router.patch('/:id', authenticateToken, validate(expenseSchema), async (req, res, next) => {
  try {
    const expense = await prisma.businessExpense.update({
      where: { id: req.params.id },
      data: { ...req.body, date: new Date(req.body.date) }
    });
    expenseCache.delete('expense-list');
    res.json(expense);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    await prisma.businessExpense.delete({
      where: { id: req.params.id }
    });
    expenseCache.delete('expense-list');
    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
