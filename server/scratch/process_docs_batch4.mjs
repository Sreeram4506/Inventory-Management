import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const ADMIN_ID = '69ea488b43b2b3075f6089e7';

async function processDocs() {
  console.log('Starting Batch 4 document processing...');

  // 1. 2016 Hyundai Sonata (Inventory)
  await prisma.vehicle.upsert({
    where: { vin: '5NPE24AF5GH338985' },
    update: { status: 'Available' },
    create: {
      vin: '5NPE24AF5GH338985',
      make: 'Hyundai',
      model: 'Sonata',
      year: 2016,
      mileage: 91761,
      color: 'Black',
      purchaseDate: new Date('2024-12-20'),
      status: 'Available',
      createdById: ADMIN_ID,
      purchase: {
        create: {
          sellerName: 'McGovern Hyundai Route 93',
          purchasePrice: 4500,
          totalPurchaseCost: 4500,
          purchaseDate: new Date('2024-12-20'),
          paymentMethod: 'ADESA'
        }
      }
    }
  });
  console.log('Processed Sonata Inventory');

  // 2. 2014 Subaru Forester (Acquisition Placeholder + Sale)
  await prisma.vehicle.upsert({
    where: { vin: 'JF2SJAEC3EH502817' },
    update: {},
    create: {
      vin: 'JF2SJAEC3EH502817',
      make: 'Subaru',
      model: 'Forester',
      year: 2014,
      mileage: 133029,
      color: 'Cherry Red',
      purchaseDate: new Date('2025-09-01'),
      status: 'Available',
      createdById: ADMIN_ID,
      purchase: {
        create: {
          sellerName: 'Unknown (Batch 4 Entry)',
          purchasePrice: 5000,
          totalPurchaseCost: 5000,
          purchaseDate: new Date('2025-09-01'),
          paymentMethod: 'Unknown'
        }
      }
    }
  });
  
  const subaru = await prisma.vehicle.findUnique({ where: { vin: 'JF2SJAEC3EH502817' }, include: { purchase: true } });
  if (subaru) {
    const salePrice = 9006.50;
    const profit = salePrice - (subaru.purchase?.totalPurchaseCost || 0);
    await prisma.sale.upsert({
      where: { vehicleId: subaru.id },
      update: {},
      create: {
        vehicleId: subaru.id,
        customerName: 'Gregory Paul Hughes',
        phone: 'N/A',
        address: '165 Marlboro, Quincy, MA 02170',
        saleDate: new Date('2025-09-27'),
        salePrice: salePrice,
        paymentMethod: 'Cash/Check',
        profit: profit,
        createdById: ADMIN_ID
      }
    });
    await prisma.vehicle.update({ where: { id: subaru.id }, data: { status: 'Sold' } });
    console.log('Processed Subaru Sale');
  }

  // 3. 2014 Toyota Camry (Sale) - Acquired in Batch 2
  const camry = await prisma.vehicle.findUnique({ where: { vin: '4T1BF1FK9EU446777' }, include: { purchase: true } });
  if (camry) {
    const salePrice = 13448.00;
    const profit = salePrice - (camry.purchase?.totalPurchaseCost || 0);
    await prisma.sale.upsert({
      where: { vehicleId: camry.id },
      update: {},
      create: {
        vehicleId: camry.id,
        customerName: 'Chase Laraia Abbott',
        phone: 'N/A',
        address: '1 Deer Run, Charlton, MA 01507',
        saleDate: new Date('2025-02-25'),
        salePrice: salePrice,
        paymentMethod: 'Finance',
        profit: profit,
        createdById: ADMIN_ID
      }
    });
    await prisma.vehicle.update({ where: { id: camry.id }, data: { status: 'Sold' } });
    console.log('Processed Camry Sale');
  }

  // 4. 2012 Jeep Liberty (Sale) - Acquired in Batch 3
  const jeep = await prisma.vehicle.findUnique({ where: { vin: '1C4PJMAK5CW109915' }, include: { purchase: true } });
  if (jeep) {
    const salePrice = 8820.00;
    const profit = salePrice - (jeep.purchase?.totalPurchaseCost || 0);
    await prisma.sale.upsert({
      where: { vehicleId: jeep.id },
      update: {},
      create: {
        vehicleId: jeep.id,
        customerName: 'Patricia Ann Rockensies',
        phone: 'N/A',
        address: '69 hawthrone st, wetwood, MA 02090',
        saleDate: new Date('2025-03-19'),
        salePrice: salePrice,
        paymentMethod: 'Cash',
        profit: profit,
        createdById: ADMIN_ID
      }
    });
    await prisma.vehicle.update({ where: { id: jeep.id }, data: { status: 'Sold' } });
    console.log('Processed Jeep Sale');
  }

  // 5. 2016 Hyundai Sonata (Sale)
  const sonata = await prisma.vehicle.findUnique({ where: { vin: '5NPE24AF5GH338985' }, include: { purchase: true } });
  if (sonata) {
    const salePrice = 10000.00;
    const profit = salePrice - (sonata.purchase?.totalPurchaseCost || 0);
    await prisma.sale.upsert({
      where: { vehicleId: sonata.id },
      update: {},
      create: {
        vehicleId: sonata.id,
        customerName: 'James Thomas Sanders, JR',
        phone: 'N/A',
        address: '74 Orchardhill, Bosotn, MA 02130',
        saleDate: new Date('2025-03-31'),
        salePrice: salePrice,
        paymentMethod: 'Cash/Finance',
        profit: profit,
        createdById: ADMIN_ID
      }
    });
    await prisma.vehicle.update({ where: { id: sonata.id }, data: { status: 'Sold' } });
    console.log('Processed Sonata Sale');
  }

  console.log('Batch 4 documents processed successfully.');
}

processDocs()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
