import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function clearData() {
  console.log('🗑️ Clearing all sample data...');
  
  try {
    // Transaction to ensure all or nothing
    await prisma.$transaction([
      prisma.sale.deleteMany({}),
      prisma.repair.deleteMany({}),
      prisma.purchase.deleteMany({}),
      prisma.advertisingExpense.deleteMany({}),
      prisma.businessExpense.deleteMany({}),
      prisma.documentRegistry.deleteMany({}),
      prisma.vehicle.deleteMany({}),
    ]);
    
    console.log('✅ All sample data cleared successfully.');
    console.log('Note: User accounts were preserved.');
  } catch (error) {
    console.error('❌ Failed to clear data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearData();
