import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken, authorizeManagerOrAdmin } from '../middlewares/authMiddleware.js';
import { validate, saleSchema } from '../utils/validators.js';

import { salesCache, vehicleCache } from '../utils/cache.js';

import multer from 'multer';
import { readFile } from 'fs/promises';
import { fillUsedVehiclePdf } from '../../services/usedVehiclePdfService.js';
const upload = multer({ storage: multer.memoryStorage() });

const defaultUsedVehicleTemplatePath = new URL('../../used-vechile-report.jpeg', import.meta.url);

const router = express.Router();

// Allow all authenticated users, but we will mask data for STAFF
// router.use(authenticateToken); // Redundant, handled by app.js

router.get('/', async (req, res, next) => {
  try {
    const cacheKey = `sales-list:${req.dealershipId}`;
    const cachedData = salesCache.get(cacheKey);
    if (cachedData) return res.json(cachedData);

    const sales = await prisma.sale.findMany({
      where: { dealershipId: req.dealershipId },
      select: {
        id: true,
        vehicleId: true,
        customerName: true,
        salePrice: true,
        saleDate: true,
        profit: true,
        paymentMethod: true,
        hasBillOfSale: true,
        address: true,
        phone: true,
        // billOfSaleBase64 EXCLUDED for performance
        vehicle: {
          include: { 
            purchase: {
              select: {
                id: true,
                sellerName: true,
                totalPurchaseCost: true,
                purchaseDate: true,
                // base64 strings EXCLUDED
              }
            }, 
            repairs: true 
          }
        } 
      },
      orderBy: { saleDate: 'desc' }
    });
    
    const isStaff = req.user.role === 'STAFF';
    
    // Mask profit for staff
    const processedSales = sales.map(s => {
      const hasBillOfSale = s.hasBillOfSale || false;
      
      if (isStaff) {
        const { profit, ...rest } = s;
        return { ...rest, profit: 0, hasBillOfSale };
      }
      return { ...s, hasBillOfSale };
    });

    salesCache.set(cacheKey, processedSales);
    res.json(processedSales);
  } catch (err) {
    next(err);
  }
});

router.post('/', upload.single('file'), validate(saleSchema), async (req, res, next) => {
  try {
    const { vehicleId, saleDate, salePrice, customerName, phone, address, paymentMethod, ...loanDetails } = req.body;
    
    // Fetch vehicle with all costs for profit calculation
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, dealershipId: req.dealershipId },
      include: { purchase: true, repairs: true }
    });

    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });

    const totalPurchaseCost = vehicle.purchase?.totalPurchaseCost || 0;
    const totalRepairCost = vehicle.repairs.reduce((sum, r) => sum + r.partsCost + r.laborCost, 0);
    
    // Profit = Sale Price - Purchase Cost - Repair Cost
    const profit = salePrice - totalPurchaseCost - totalRepairCost;

    const sale = await prisma.$transaction(async (tx) => {
      const s = await tx.sale.create({
        data: {
          customerName,
          phone,
          address,
          saleDate: new Date(saleDate),
          salePrice,
          paymentMethod,
          profit,
          vehicleId,
          createdById: req.user.id,
          dealershipId: req.dealershipId,
          hasBillOfSale: !!req.file,
          billOfSaleBase64: req.file ? req.file.buffer.toString('base64') : undefined,
          ...loanDetails
        }
      });
      await tx.vehicle.update({
        where: { id: vehicleId, dealershipId: req.dealershipId },
        data: { status: 'Sold' }
      });

      // ── Step 3: Regenerate Used Vehicle Record PDF with Disposition Data ──
      try {
        const fullVehicle = await tx.vehicle.findFirst({
          where: { id: vehicleId, dealershipId: req.dealershipId },
          include: { purchase: true, sale: { where: { id: s.id } } }
        });

        if (fullVehicle && fullVehicle.purchase) {
          const templateBuffer = await readFile(defaultUsedVehicleTemplatePath);
          
          const registryEntry = await tx.documentRegistry.findFirst({
            where: { 
              vin: fullVehicle.vin, 
              documentType: 'Used Vehicle Record',
              dealershipId: req.dealershipId 
            },
            orderBy: { createdAt: 'desc' }
          });

          let parsedCity = '', parsedState = '', parsedZip = '';
          const addr = fullVehicle.sale?.address || '';
          const addrParts = addr.split(',').map(p => p.trim());
          if (addrParts.length >= 3) {
            parsedZip = addrParts.pop() || '';
            parsedState = addrParts.pop() || '';
            parsedCity = addrParts.pop() || '';
          }

          const pdfInfo = {
            vin: fullVehicle.vin,
            make: fullVehicle.make,
            model: fullVehicle.model,
            year: fullVehicle.year,
            color: fullVehicle.color,
            mileage: fullVehicle.mileage,
            titleNumber: fullVehicle.titleNumber || registryEntry?.titleNumber || '',
            purchaseDate: fullVehicle.purchaseDate,
            purchasedFrom: fullVehicle.purchase.sellerName,
            usedVehicleSourceAddress: fullVehicle.purchase.sellerAddress,
            usedVehicleSourceCity: fullVehicle.purchase.sellerCity,
            usedVehicleSourceState: fullVehicle.purchase.sellerState,
            usedVehicleSourceZipCode: fullVehicle.purchase.sellerZip,
            purchasePrice: fullVehicle.purchase.purchasePrice,
            disposedTo: fullVehicle.sale?.customerName || '',
            disposedAddress: addrParts.join(', ') || addr,
            disposedCity: parsedCity,
            disposedState: parsedState,
            disposedZip: parsedZip,
            disposedDate: fullVehicle.sale?.saleDate,
            disposedPrice: fullVehicle.sale?.salePrice,
            disposedOdometer: fullVehicle.mileage, 
            disposedDlNumber: fullVehicle.sale?.driverLicense || '',
            paymentMethod: fullVehicle.sale?.paymentMethod || '',
          };

          const newPdfBase64 = await fillUsedVehiclePdf(templateBuffer, pdfInfo, 'image/jpeg');

          await tx.purchase.update({
            where: { id: fullVehicle.purchase.id },
            data: { documentBase64: newPdfBase64 }
          });

          if (registryEntry) {
            await tx.documentRegistry.update({
              where: { id: registryEntry.id },
              data: {
                disposedTo: String(fullVehicle.sale?.customerName || ''),
                disposedAddress: String(pdfInfo.disposedAddress),
                disposedCity: String(pdfInfo.disposedCity),
                disposedState: String(pdfInfo.disposedState),
                disposedZip: String(pdfInfo.disposedZip),
                disposedDate: fullVehicle.sale?.saleDate ? String(fullVehicle.sale.saleDate) : null,
                disposedPrice: String(fullVehicle.sale?.salePrice || ''),
                documentBase64: newPdfBase64
              }
            });
          }
        }
      } catch (pdfErr) {
        console.error('[Sale PDF Update] Failed to regenerate record:', pdfErr);
      }

      return s;
    });

    const sCacheKey = `sales-list:${req.dealershipId}`;
    const vCacheKey = `vehicle-list:${req.dealershipId}`;
    salesCache.delete(sCacheKey);
    vehicleCache.delete(vCacheKey); // Invalidate inventory as well
    res.status(201).json(sale);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authorizeManagerOrAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { salePrice, saleDate, customerName, phone, address, paymentMethod } = req.body;

    const existingSale = await prisma.sale.findFirst({
      where: { id, dealershipId: req.dealershipId },
      include: { 
        vehicle: {
          include: { purchase: true, repairs: true }
        }
      }
    });

    if (!existingSale) return res.status(404).json({ message: 'Sale not found' });

    let profit = existingSale.profit;
    if (salePrice !== undefined) {
      const vehicle = existingSale.vehicle;
      const totalPurchaseCost = vehicle.purchase?.totalPurchaseCost || 0;
      const totalRepairCost = vehicle.repairs.reduce((sum, r) => sum + r.partsCost + r.laborCost, 0);
      profit = Number(salePrice) - totalPurchaseCost - totalRepairCost;
    }

    const updateResult = await prisma.sale.updateMany({
      where: { id, dealershipId: req.dealershipId },
      data: {
        salePrice: salePrice !== undefined ? Number(salePrice) : undefined,
        saleDate: saleDate ? new Date(saleDate) : undefined,
        customerName,
        phone,
        address,
        paymentMethod,
        profit
      }
    });

    if (updateResult.count === 0) return res.status(404).json({ message: 'Sale not found' });
    const updatedSale = await prisma.sale.findUnique({ where: { id } });

    const sCacheKey = `sales-list:${req.dealershipId}`;
    const vCacheKey = `vehicle-list:${req.dealershipId}`;
    salesCache.delete(sCacheKey);
    vehicleCache.delete(vCacheKey);

    // ── Step 4: Regenerate Used Vehicle Record PDF ──
    try {
      const fullVehicle = await prisma.vehicle.findFirst({
        where: { id: updatedSale.vehicleId, dealershipId: req.dealershipId },
        include: { purchase: true, sale: true }
      });

      if (fullVehicle && fullVehicle.purchase) {
        const templateBuffer = await readFile(defaultUsedVehicleTemplatePath);
        const registryEntry = await prisma.documentRegistry.findFirst({
          where: { 
            vin: fullVehicle.vin, 
            documentType: 'Used Vehicle Record',
            dealershipId: req.dealershipId
          },
          orderBy: { createdAt: 'desc' }
        });

        let parsedCity = '', parsedState = '', parsedZip = '';
        const addr = fullVehicle.sale?.address || '';
        const addrParts = addr.split(',').map(p => p.trim());
        if (addrParts.length >= 3) {
          parsedZip = addrParts.pop() || '';
          parsedState = addrParts.pop() || '';
          parsedCity = addrParts.pop() || '';
        }

        const pdfInfo = {
          vin: fullVehicle.vin,
          make: fullVehicle.make,
          model: fullVehicle.model,
          year: fullVehicle.year,
          color: fullVehicle.color,
          mileage: fullVehicle.mileage,
          titleNumber: fullVehicle.titleNumber || registryEntry?.titleNumber || '',
          purchaseDate: fullVehicle.purchaseDate,
          purchasedFrom: fullVehicle.purchase.sellerName,
          usedVehicleSourceAddress: fullVehicle.purchase.sellerAddress,
          usedVehicleSourceCity: fullVehicle.purchase.sellerCity,
          usedVehicleSourceState: fullVehicle.purchase.sellerState,
          usedVehicleSourceZipCode: fullVehicle.purchase.sellerZip,
          purchasePrice: fullVehicle.purchase.purchasePrice,
          disposedTo: fullVehicle.sale?.customerName || '',
          disposedAddress: addrParts.join(', ') || addr,
          disposedCity: parsedCity,
          disposedState: parsedState,
          disposedZip: parsedZip,
          disposedDate: fullVehicle.sale?.saleDate,
          disposedPrice: fullVehicle.sale?.salePrice,
          disposedOdometer: fullVehicle.mileage,
          disposedDlNumber: fullVehicle.sale?.driverLicense || '',
          paymentMethod: fullVehicle.sale?.paymentMethod || '',
        };

        const newPdfBase64 = await fillUsedVehiclePdf(templateBuffer, pdfInfo, 'image/jpeg');

        await prisma.purchase.update({
          where: { id: fullVehicle.purchase.id },
          data: { documentBase64: newPdfBase64 }
        });

        if (registryEntry) {
          await prisma.documentRegistry.update({
            where: { id: registryEntry.id },
            data: {
              disposedTo: String(fullVehicle.sale?.customerName || ''),
              disposedAddress: String(pdfInfo.disposedAddress),
              disposedCity: String(pdfInfo.disposedCity),
              disposedState: String(pdfInfo.disposedState),
              disposedZip: String(pdfInfo.disposedZip),
              disposedDate: fullVehicle.sale?.saleDate ? String(fullVehicle.sale.saleDate) : null,
              disposedPrice: String(fullVehicle.sale?.salePrice || ''),
              documentBase64: newPdfBase64
            }
          });
        }
      }
    } catch (err) {
      console.error('[Sale Update PDF] Error:', err);
    }

    res.json(updatedSale);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authorizeManagerOrAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const sale = await prisma.sale.findFirst({
      where: { id, dealershipId: req.dealershipId },
      select: { vehicleId: true }
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale record not found' });
    }

    await prisma.$transaction([
      // 1. Delete the sale record
      prisma.sale.deleteMany({ where: { id, dealershipId: req.dealershipId } }),
      // 2. Move vehicle back to Available
      prisma.vehicle.updateMany({
        where: { id: sale.vehicleId, dealershipId: req.dealershipId },
        data: { status: 'Available' }
      })
    ]);

    // ── Step 3: Regenerate Used Vehicle Record (Clear Disposition) ──
    try {
      const fullVehicle = await prisma.vehicle.findFirst({
        where: { id: sale.vehicleId, dealershipId: req.dealershipId },
        include: { purchase: true }
      });

      if (fullVehicle && fullVehicle.purchase) {
        const templateBuffer = await readFile(defaultUsedVehicleTemplatePath);
        const registryEntry = await prisma.documentRegistry.findFirst({
          where: { 
            vin: fullVehicle.vin, 
            documentType: 'Used Vehicle Record',
            dealershipId: req.dealershipId
          },
          orderBy: { createdAt: 'desc' }
        });

        const pdfInfo = {
          vin: fullVehicle.vin,
          make: fullVehicle.make,
          model: fullVehicle.model,
          year: fullVehicle.year,
          color: fullVehicle.color,
          mileage: fullVehicle.mileage,
          titleNumber: fullVehicle.titleNumber || registryEntry?.titleNumber || '',
          purchaseDate: fullVehicle.purchaseDate,
          purchasedFrom: fullVehicle.purchase.sellerName,
          usedVehicleSourceAddress: fullVehicle.purchase.sellerAddress,
          usedVehicleSourceCity: fullVehicle.purchase.sellerCity,
          usedVehicleSourceState: fullVehicle.purchase.sellerState,
          usedVehicleSourceZipCode: fullVehicle.purchase.sellerZip,
          purchasePrice: fullVehicle.purchase.purchasePrice,
          // Clear disposition fields
          disposedTo: '',
          disposedAddress: '',
          disposedCity: '',
          disposedState: '',
          disposedZip: '',
          disposedDate: null,
          disposedPrice: 0,
          disposedOdometer: 0,
          disposedDlNumber: '',
          paymentMethod: '',
        };

        const newPdfBase64 = await fillUsedVehiclePdf(templateBuffer, pdfInfo, 'image/jpeg');

        await prisma.purchase.update({
          where: { id: fullVehicle.purchase.id },
          data: { documentBase64: newPdfBase64 }
        });

        if (registryEntry) {
          await prisma.documentRegistry.update({
            where: { id: registryEntry.id },
            data: {
              disposedTo: '',
              disposedAddress: '',
              disposedCity: '',
              disposedState: '',
              disposedZip: '',
              disposedDate: null,
              disposedPrice: '',
              documentBase64: newPdfBase64
            }
          });
        }
      }
    } catch (err) {
      console.error('[Sale Delete PDF] Error:', err);
    }

    // 3. Clear caches
    const sCacheKey = `sales-list:${req.dealershipId}`;
    const vCacheKey = `vehicle-list:${req.dealershipId}`;
    salesCache.delete(sCacheKey);
    vehicleCache.delete(vCacheKey);

    res.json({ message: 'Sale deleted and vehicle reverted to Available status.' });
  } catch (err) {
    console.error('[Sale Delete Error]', err);
    next(err);
  }
});

export default router;
