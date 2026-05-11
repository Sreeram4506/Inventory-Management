import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken, authorizeAdmin } from '../middlewares/authMiddleware.js';
import { validate, advertisingSchema } from '../utils/validators.js';
import { adsCache } from '../utils/cache.js';

const router = express.Router();

// Only Admin can see/manage advertising spend
router.use(authorizeAdmin);

router.get('/', async (req, res, next) => {
  try {
    const cacheKey = `ads-list:${req.dealershipId}`;
    const cached = adsCache.get(cacheKey);
    if (cached) return res.json(cached);

    const ads = await prisma.advertisingExpense.findMany({ 
      where: { dealershipId: req.dealershipId },
      orderBy: { startDate: 'desc' } 
    });
    adsCache.set(cacheKey, ads);
    res.json(ads);
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(advertisingSchema), async (req, res, next) => {
  try {
    const ad = await prisma.advertisingExpense.create({
      data: {
        ...req.body,
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate),
        dealershipId: req.dealershipId
      }
    });
    const cacheKey = `ads-list:${req.dealershipId}`;
    adsCache.delete(cacheKey);
    res.status(201).json(ad);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validate(advertisingSchema), async (req, res, next) => {
  try {
    const result = await prisma.advertisingExpense.updateMany({
      where: { id: req.params.id, dealershipId: req.dealershipId },
      data: {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined
      }
    });

    if (result.count === 0) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    const ad = await prisma.advertisingExpense.findUnique({ where: { id: req.params.id } });
    const cacheKey = `ads-list:${req.dealershipId}`;
    adsCache.delete(cacheKey);
    res.json(ad);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.advertisingExpense.deleteMany({
      where: { id: req.params.id, dealershipId: req.dealershipId }
    });
    const cacheKey = `ads-list:${req.dealershipId}`;
    adsCache.delete(cacheKey);
    res.json({ message: 'Campaign deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
