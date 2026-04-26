import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const ADMIN_ID = '69ea488b43b2b3075f6089e7';

async function processDocs() {
  console.log('Starting Batch 5 document processing...');

  // 1. 2013 Ford Fiesta (Inventory)
  await prisma.vehicle.upsert({
    where: { vin: '3FADP4EJ5DM191087' },
    update: { status: 'Available' },
    create: {
      vin: '3FADP4EJ5DM191087',
      make: 'Ford',
      model: 'Fiesta',
      year: 2013,
      mileage: 64680,
      color: 'Red',
      purchaseDate: new Date('2024-12-10'),
      status: 'Available',
      createdById: ADMIN_ID,
      purchase: {
        create: {
          sellerName: 'Manheim New England',
          purchasePrice: 1800,
          buyerFee: 265,
          totalPurchaseCost: 2065,
          purchaseDate: new Date('2024-12-10'),
          paymentMethod: 'ACH Bank Transfer'
        }
      }
    }
  });
  console.log('Processed Fiesta Inventory');

  // 2. 2013 Honda Fit (Inventory)
  await prisma.vehicle.upsert({
    where: { vin: 'JHMGE8H32DC003644' },
    update: { status: 'Available' },
    create: {
      vin: 'JHMGE8H32DC003644',
      make: 'Honda',
      model: 'Fit',
      year: 2013,
      mileage: 90787,
      color: 'Silver',
      purchaseDate: new Date('2024-11-04'),
      status: 'Available',
      createdById: ADMIN_ID,
      purchase: {
        create: {
          sellerName: 'CarMax - Westborough',
          purchasePrice: 6400,
          buyerFee: 425,
          totalPurchaseCost: 6825,
          purchaseDate: new Date('2024-11-04'),
          paymentMethod: 'Wholesale'
        }
      }
    }
  });
  console.log('Processed Honda Fit Inventory');

  // 3. 2013 Ford Focus (Inventory Placeholder + Sale)
  await prisma.vehicle.upsert({
    where: { vin: '1FADP3F25DL227699' },
    update: {},
    create: {
      vin: '1FADP3F25DL227699',
      make: 'Ford',
      model: 'Focus',
      year: 2013,
      mileage: 117259,
      color: 'Gray',
      purchaseDate: new Date('2025-01-01'),
      status: 'Available',
      createdById: ADMIN_ID,
      purchase: {
        create: {
          sellerName: 'Unknown (Batch 5 Entry)',
          purchasePrice: 3000,
          totalPurchaseCost: 3000,
          purchaseDate: new Date('2025-01-01'),
          paymentMethod: 'Unknown'
        }
      }
    }
  });
  
  const focusRecord = await prisma.vehicle.findUnique({ where: { vin: '1FADP3F25DL227699' }, include: { purchase: true } });
  if (focusRecord) {
    const salePrice = 6650.00;
    const profit = salePrice - (focusRecord.purchase?.totalPurchaseCost || 0);
    await prisma.sale.upsert({
      where: { vehicleId: focusRecord.id },
      update: {},
      create: {
        vehicleId: focusRecord.id,
        customerName: 'Diana Carolina Abad Navarrete',
        phone: 'N/A',
        address: '18 South Gate park, Newton, MA 02465',
        saleDate: new Date('2025-01-16'),
        salePrice: salePrice,
        paymentMethod: 'Cash/Check',
        profit: profit,
        createdById: ADMIN_ID
      }
    });
    await prisma.vehicle.update({ where: { id: focusRecord.id }, data: { status: 'Sold' } });
    console.log('Processed Focus Sale');
  }

  // 4. Record Fiesta Sale
  const fiestaRecord = await prisma.vehicle.findUnique({ where: { vin: '3FADP4EJ5DM191087' }, include: { purchase: true } });
  if (fiestaRecord) {
    const salePrice = 7416.00;
    const profit = salePrice - (fiestaRecord.purchase?.totalPurchaseCost || 0);
    await prisma.sale.upsert({
      where: { vehicleId: fiestaRecord.id },
      update: {},
      create: {
        vehicleId: fiestaRecord.id,
        customerName: 'Emerson Orlando Del Cuadro Mori',
        phone: 'N/A',
        address: '30 Press Ave, Norwood, MA 02062',
        saleDate: new Date('2025-03-08'),
        salePrice: salePrice,
        paymentMethod: 'Cash',
        profit: profit,
        createdById: ADMIN_ID
      }
    });
    await prisma.vehicle.update({ where: { id: fiestaRecord.id }, data: { status: 'Sold' } });
    console.log('Processed Fiesta Sale');
  }

  // 5. Record Honda Fit Sale
  const fitRecord = await prisma.vehicle.findUnique({ where: { vin: 'JHMGE8H32DC003644' }, include: { purchase: true } });
  if (fitRecord) {
    const salePrice = 12077.71;
    const profit = salePrice - (fitRecord.purchase?.totalPurchaseCost || 0);
    await prisma.sale.upsert({
      where: { vehicleId: fitRecord.id },
      update: {},
      create: {
        vehicleId: fitRecord.id,
        customerName: 'Bruce M Simone',
        phone: '401-539-6034',
        address: '33 New London Tpke, Wyoming, RI 02898',
        saleDate: new Date('2025-02-25'),
        salePrice: salePrice,
        paymentMethod: 'Finance',
        profit: profit,
        createdById: ADMIN_ID
      }
    });
    await prisma.vehicle.update({ where: { id: fitRecord.id }, data: { status: 'Sold' } });
    console.log('Processed Honda Fit Sale');
  }

  console.log('Batch 5 documents processed successfully.');
}

processDocs()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
