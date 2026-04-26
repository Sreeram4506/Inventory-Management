import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const ADMIN_ID = '69ea488b43b2b3075f6089e7';

async function processDocs() {
  console.log('Starting document processing...');

  // 1. 2012 Toyota Corolla (Inventory)
  const corolla = await prisma.vehicle.upsert({
    where: { vin: '2T1BU4EEXCC883365' },
    update: { status: 'Available' },
    create: {
      vin: '2T1BU4EEXCC883365',
      make: 'Toyota',
      model: 'Corolla LE',
      year: 2012,
      mileage: 131575,
      color: 'Silver',
      purchaseDate: new Date('2025-01-30'),
      status: 'Available',
      createdById: ADMIN_ID,
      purchase: {
        create: {
          sellerName: "Linder's INC",
          purchasePrice: 5800,
          buyerFee: 440,
          inspectionCost: 100,
          totalPurchaseCost: 6340,
          purchaseDate: new Date('2025-01-30'),
          paymentMethod: 'Auction'
        }
      }
    }
  });
  console.log('Processed Corolla Inventory');

  // 2. 2011 Toyota Prius (Inventory)
  const prius = await prisma.vehicle.upsert({
    where: { vin: 'JTDKN3DU9B1362964' },
    update: { status: 'Available' },
    create: {
      vin: 'JTDKN3DU9B1362964',
      make: 'Toyota',
      model: 'Prius',
      year: 2011,
      mileage: 125174,
      color: 'Blue',
      purchaseDate: new Date('2025-03-14'),
      status: 'Available',
      createdById: ADMIN_ID,
      purchase: {
        create: {
          sellerName: 'Bernardi Toyota-Scion',
          purchasePrice: 5300,
          buyerFee: 485,
          totalPurchaseCost: 5785,
          purchaseDate: new Date('2025-03-14'),
          paymentMethod: 'ADESA'
        }
      }
    }
  });
  console.log('Processed Prius Inventory');

  // 3. 2010 Buick LaCrosse (Inventory)
  const buick = await prisma.vehicle.upsert({
    where: { vin: '1G4GC5EG2AF235244' },
    update: { status: 'Available' },
    create: {
      vin: '1G4GC5EG2AF235244',
      make: 'Buick',
      model: 'LaCrosse',
      year: 2010,
      mileage: 112250,
      color: 'Silver',
      purchaseDate: new Date('2025-05-02'),
      status: 'Available',
      createdById: ADMIN_ID,
      purchase: {
        create: {
          sellerName: 'McGovern GMC',
          purchasePrice: 2300,
          totalPurchaseCost: 2300,
          purchaseDate: new Date('2025-05-02'),
          paymentMethod: 'ADESA'
        }
      }
    }
  });
  console.log('Processed Buick Inventory');

  // 4. Record Prius Sale
  const priusRecord = await prisma.vehicle.findUnique({ where: { vin: 'JTDKN3DU9B1362964' }, include: { purchase: true } });
  if (priusRecord) {
    const salePrice = 11710.38;
    const profit = salePrice - (priusRecord.purchase?.totalPurchaseCost || 0);
    await prisma.sale.upsert({
      where: { vehicleId: priusRecord.id },
      update: {},
      create: {
        vehicleId: priusRecord.id,
        customerName: 'Nanci Haze',
        phone: '617-733-5199',
        address: '19 Blanchard Rd, SCITUATE, MA 02066',
        saleDate: new Date('2025-05-28'),
        salePrice: salePrice,
        paymentMethod: 'Finance',
        profit: profit,
        createdById: ADMIN_ID
      }
    });
    await prisma.vehicle.update({ where: { id: priusRecord.id }, data: { status: 'Sold' } });
    console.log('Processed Prius Sale');
  }

  // 5. Record Buick Sale
  const buickRecord = await prisma.vehicle.findUnique({ where: { vin: '1G4GC5EG2AF235244' }, include: { purchase: true } });
  if (buickRecord) {
    const salePrice = 5945.00;
    const profit = salePrice - (buickRecord.purchase?.totalPurchaseCost || 0);
    await prisma.sale.upsert({
      where: { vehicleId: buickRecord.id },
      update: {},
      create: {
        vehicleId: buickRecord.id,
        customerName: 'Peter Joseph Mullen',
        phone: 'N/A',
        address: '12 Vernon st, Norwood, MA 02062',
        saleDate: new Date('2025-06-06'),
        salePrice: salePrice,
        paymentMethod: 'Cash',
        profit: profit,
        createdById: ADMIN_ID
      }
    });
    await prisma.vehicle.update({ where: { id: buickRecord.id }, data: { status: 'Sold' } });
    console.log('Processed Buick Sale');
  }

  console.log('All documents processed successfully.');
}

processDocs()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
