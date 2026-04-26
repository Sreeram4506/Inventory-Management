import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkRegistry() {
  try {
    const records = await prisma.documentRegistry.findMany({
      where: {
        disposedTo: {
          contains: 'Broadway',
          mode: 'insensitive'
        }
      }
    });

    console.log(`Found ${records.length} registry records with 'Broadway' as buyer.`);
    records.forEach(r => console.log(`- VIN: ${r.vin}, Buyer: ${r.disposedTo}`));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkRegistry();
