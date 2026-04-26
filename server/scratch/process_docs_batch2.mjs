import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const ADMIN_ID = '69ea488b43b2b3075f6089e7';

async function processDocs() {
  console.log('Starting Batch 2 document processing...');

  // 1. 2014 Toyota Camry (Inventory)
  await prisma.vehicle.upsert({
    where: { vin: '4T1BF1FK9EU446777' },
    update: { status: 'Available' },
    create: {
      vin: '4T1BF1FK9EU446777',
      make: 'Toyota',
      model: 'Camry LE',
      year: 2014,
      mileage: 98989,
      color: 'Gray',
      purchaseDate: new Date('2024-08-29'),
      status: 'Available',
      createdById: ADMIN_ID,
      purchase: {
        create: {
          sellerName: 'Toyota of Colchester',
          purchasePrice: 5000,
          buyerFee: 400,
          inspectionCost: 15,
          totalPurchaseCost: 5415,
          purchaseDate: new Date('2024-08-29'),
          paymentMethod: 'Auction (CMAA)'
        }
      }
    }
  });
  console.log('Processed Camry Inventory');

  // 2. 2016 Kia Forte (Inventory)
  const kia = await prisma.vehicle.upsert({
    where: { vin: 'KNAFK4A68G5471659' },
    update: { status: 'Available' },
    create: {
      vin: 'KNAFK4A68G5471659',
      make: 'Kia',
      model: 'Forte LX',
      year: 2016,
      mileage: 110595,
      color: 'Red',
      purchaseDate: new Date('2025-06-03'),
      status: 'Available',
      createdById: ADMIN_ID,
      purchase: {
        create: {
          sellerName: "Ron Bouchard's Auto Sales INC",
          purchasePrice: 1900,
          totalPurchaseCost: 1900,
          purchaseDate: new Date('2025-06-03'),
          paymentMethod: 'ADESA'
        }
      }
    }
  });
  console.log('Processed Kia Inventory');

  // 3. 2016 Kia Forte (Sale)
  const kiaRecord = await prisma.vehicle.findUnique({ where: { vin: 'KNAFK4A68G5471659' }, include: { purchase: true } });
  if (kiaRecord) {
    const salePrice = 6507.00;
    const profit = salePrice - (kiaRecord.purchase?.totalPurchaseCost || 0);
    await prisma.sale.upsert({
      where: { vehicleId: kiaRecord.id },
      update: {},
      create: {
        vehicleId: kiaRecord.id,
        customerName: 'Maikel M Abdelmalak',
        phone: 'N/A',
        address: '7 Dailey St, Attleboro, MA 02703',
        saleDate: new Date('2025-06-23'),
        salePrice: salePrice,
        paymentMethod: 'Cash/Check',
        profit: profit,
        createdById: ADMIN_ID
      }
    });
    await prisma.vehicle.update({ where: { id: kiaRecord.id }, data: { status: 'Sold' } });
    console.log('Processed Kia Sale');
  }

  // 4. 2014 Toyota Prius (Acquisition Placeholder + Sale)
  // Since we have the Bill of Sale but not the acquisition, we'll create a placeholder to record the sale.
  const prius = await prisma.vehicle.upsert({
    where: { vin: 'JTDKN3DU8E0384819' },
    update: {},
    create: {
      vin: 'JTDKN3DU8E0384819',
      make: 'Toyota',
      model: 'Prius',
      year: 2014,
      mileage: 136623,
      color: 'Black',
      purchaseDate: new Date('2025-06-01'),
      status: 'Available',
      createdById: ADMIN_ID,
      purchase: {
        create: {
          sellerName: 'Unknown (Batch 2 Entry)',
          purchasePrice: 4000,
          totalPurchaseCost: 4000,
          purchaseDate: new Date('2025-06-01'),
          paymentMethod: 'Unknown'
        }
      }
    }
  });
  
  const priusRecord = await prisma.vehicle.findUnique({ where: { id: prius.id }, include: { purchase: true } });
  if (priusRecord) {
    const salePrice = 7500.00;
    const profit = salePrice - (priusRecord.purchase?.totalPurchaseCost || 0);
    await prisma.sale.upsert({
      where: { vehicleId: priusRecord.id },
      update: {},
      create: {
        vehicleId: priusRecord.id,
        customerName: 'Ghaly Mahrous Ghaly',
        phone: 'N/A',
        address: '2519 Francis Ave, Mansfield, MA 02048',
        saleDate: new Date('2025-06-30'),
        salePrice: salePrice,
        paymentMethod: 'Cash',
        profit: profit,
        createdById: ADMIN_ID
      }
    });
    await prisma.vehicle.update({ where: { id: priusRecord.id }, data: { status: 'Sold' } });
    console.log('Processed Prius Sale');
  }

  console.log('Batch 2 documents processed successfully.');
}

processDocs()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
