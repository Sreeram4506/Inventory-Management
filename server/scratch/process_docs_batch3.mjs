import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const ADMIN_ID = '69ea488b43b2b3075f6089e7';

async function processDocs() {
  console.log('Starting Batch 3 document processing...');

  // 1. 2012 Jeep Liberty (Inventory Only - no sale doc provided)
  await prisma.vehicle.upsert({
    where: { vin: '1C4PJMAK5CW109915' },
    update: { status: 'Available' },
    create: {
      vin: '1C4PJMAK5CW109915',
      make: 'Jeep',
      model: 'Liberty Sport',
      year: 2012,
      mileage: 91839,
      color: 'Silver',
      purchaseDate: new Date('2024-08-30'),
      status: 'Available',
      createdById: ADMIN_ID,
      purchase: {
        create: {
          sellerName: 'Colonial Volkswagen',
          purchasePrice: 1200,
          totalPurchaseCost: 1200,
          purchaseDate: new Date('2024-08-30'),
          paymentMethod: 'ADESA'
        }
      }
    }
  });
  console.log('Processed Jeep Inventory');

  // 2. 2013 Mercedes-Benz C250 (Inventory)
  await prisma.vehicle.upsert({
    where: { vin: 'WDDGF4HB2DA809211' },
    update: { status: 'Available' },
    create: {
      vin: 'WDDGF4HB2DA809211',
      make: 'Mercedes-Benz',
      model: 'C250',
      year: 2013,
      mileage: 77194,
      color: 'Red',
      purchaseDate: new Date('2024-08-19'),
      status: 'Available',
      createdById: ADMIN_ID,
      purchase: {
        create: {
          sellerName: 'CarMax - Westborough',
          purchasePrice: 7200,
          buyerFee: 445,
          totalPurchaseCost: 7645,
          purchaseDate: new Date('2024-08-19'),
          paymentMethod: 'Wholesale'
        }
      }
    }
  });
  console.log('Processed Mercedes Inventory');

  // 3. 2013 Mercedes-Benz C250 (Sale)
  const mercRecord = await prisma.vehicle.findUnique({ where: { vin: 'WDDGF4HB2DA809211' }, include: { purchase: true } });
  if (mercRecord) {
    const salePrice = 12869.63;
    const profit = salePrice - (mercRecord.purchase?.totalPurchaseCost || 0);
    await prisma.sale.upsert({
      where: { vehicleId: mercRecord.id },
      update: {},
      create: {
        vehicleId: mercRecord.id,
        customerName: 'Felix Numero',
        phone: '857-261-7841',
        address: '9 Standard St, Boston, MA 02126',
        saleDate: new Date('2024-12-28'),
        salePrice: salePrice,
        paymentMethod: 'Finance',
        profit: profit,
        createdById: ADMIN_ID
      }
    });
    await prisma.vehicle.update({ where: { id: mercRecord.id }, data: { status: 'Sold' } });
    console.log('Processed Mercedes Sale');
  }

  // 4. 2010 Toyota Yaris (Inventory)
  await prisma.vehicle.upsert({
    where: { vin: 'JTDBT4K33A4072187' },
    update: { status: 'Available' },
    create: {
      vin: 'JTDBT4K33A4072187',
      make: 'Toyota',
      model: 'Yaris',
      year: 2010,
      mileage: 164348,
      color: 'Silver',
      purchaseDate: new Date('2025-03-14'),
      status: 'Available',
      createdById: ADMIN_ID,
      purchase: {
        create: {
          sellerName: 'Bernardi Toyota-Scion',
          purchasePrice: 2400,
          buyerFee: 400,
          totalPurchaseCost: 2800,
          purchaseDate: new Date('2025-03-14'),
          paymentMethod: 'ADESA'
        }
      }
    }
  });
  console.log('Processed Yaris Inventory');

  // 5. 2010 Toyota Yaris (Sale)
  const yarisRecord = await prisma.vehicle.findUnique({ where: { vin: 'JTDBT4K33A4072187' }, include: { purchase: true } });
  if (yarisRecord) {
    const salePrice = 4999.00;
    const profit = salePrice - (yarisRecord.purchase?.totalPurchaseCost || 0);
    await prisma.sale.upsert({
      where: { vehicleId: yarisRecord.id },
      update: {},
      create: {
        vehicleId: yarisRecord.id,
        customerName: 'Ashley Marie Torres Rodriguez',
        phone: 'N/A',
        address: '114 moreland st, Roxbury, MA 02119',
        saleDate: new Date('2025-06-02'),
        salePrice: salePrice,
        paymentMethod: 'Cash',
        profit: profit,
        createdById: ADMIN_ID
      }
    });
    await prisma.vehicle.update({ where: { id: yarisRecord.id }, data: { status: 'Sold' } });
    console.log('Processed Yaris Sale');
  }

  console.log('Batch 3 documents processed successfully.');
}

processDocs()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
