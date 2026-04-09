import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/', authenticateToken, async (req, res, next) => {
  const { vehicleId, repairShop, partsCost, laborCost, description, repairDate } = req.body;
  try {
    const repair = await prisma.repair.create({
      data: {
        vehicleId,
        repairShop,
        partsCost: parseFloat(partsCost),
        laborCost: parseFloat(laborCost),
        description,
        repairDate: new Date(repairDate || Date.now())
      }
    });
    res.status(201).json(repair);
  } catch (err) {
    next(err);
  }
});

export default router;
