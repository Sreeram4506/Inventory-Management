import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken, authorizeAdmin } from '../middlewares/authMiddleware.js';
import { validate, advertisingSchema } from '../utils/validators.js';
import { adsCache } from '../utils/cache.js';

const router = express.Router();

// Only Admin can see/manage advertising spend
router.use(authenticateToken, authorizeAdmin);

router.get('/', async (req, res, next) => {
  try {
    const cached = adsCache.get('ads-list');
    if (cached) return res.json(cached);

    const ads = await prisma.advertisingExpense.findMany({ orderBy: { startDate: 'desc' } });
    adsCache.set('ads-list', ads);
    res.json(ads);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, validate(advertisingSchema), async (req, res, next) => {
  try {
    const ad = await prisma.advertisingExpense.create({
      data: {
        ...req.body,
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate)
      }
    });
    adsCache.delete('ads-list');
    res.status(201).json(ad);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticateToken, validate(advertisingSchema), async (req, res, next) => {
  try {
    const ad = await prisma.advertisingExpense.update({
      where: { id: req.params.id },
      data: {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined
      }
    });
    adsCache.delete('ads-list');
    res.json(ad);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    await prisma.advertisingExpense.delete({
      where: { id: req.params.id }
    });
    adsCache.delete('ads-list');
    res.json({ message: 'Campaign deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
