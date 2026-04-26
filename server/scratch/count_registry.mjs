import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function countAll() {
  try {
    const count = await prisma.documentRegistry.count();
    console.log(`Total records in DocumentRegistry: ${count}`);
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

countAll();
