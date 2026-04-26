import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixSoldVehiclesWithoutSales() {
  try {
    const soldVehicles = await prisma.vehicle.findMany({
      where: {
        status: 'Sold'
      },
      include: {
        sale: true
      }
    });

    const orphanedVehicles = soldVehicles.filter(v => !v.sale);

    console.log(`Found ${orphanedVehicles.length} vehicles marked 'Sold' but without a Sale record.`);

    if (orphanedVehicles.length > 0) {
      const ids = orphanedVehicles.map(v => v.id);
      await prisma.vehicle.updateMany({
        where: {
          id: { in: ids }
        },
        data: {
          status: 'Available'
        }
      });
      console.log(`Reverted status for ${orphanedVehicles.length} vehicles to 'Available'.`);
    }

  } catch (error) {
    console.error('Error fixing vehicles:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixSoldVehiclesWithoutSales();
