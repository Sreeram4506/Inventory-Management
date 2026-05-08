import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function wipeAllData() {
  console.log('🧹 Wiping ALL Database Records...');
  try {
    const noteCount = await prisma.customerNote.deleteMany();
    const saleCount = await prisma.sale.deleteMany();
    const purchaseCount = await prisma.purchase.deleteMany();
    const repairCount = await prisma.repair.deleteMany();
    const adCount = await prisma.advertisingExpense.deleteMany();
    const bizCount = await prisma.businessExpense.deleteMany();
    const vehicleCount = await prisma.vehicle.deleteMany();
    const registryCount = await prisma.documentRegistry.deleteMany();

    console.log(`✅ Database Wiped:
    - ${saleCount.count} Sales
    - ${purchaseCount.count} Purchases
    - ${repairCount.count} Repairs
    - ${adCount.count} Ad Expenses
    - ${bizCount.count} Biz Expenses
    - ${vehicleCount.count} Vehicles
    - ${registryCount.count} Document Registry entries
    - ${noteCount.count} Customer Notes`);

  } catch (error) {
    console.error('❌ Wipe Failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

wipeAllData();
