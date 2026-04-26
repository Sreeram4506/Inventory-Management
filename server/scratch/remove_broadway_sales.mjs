import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function removeBroadwayAutoSales() {
  try {
    // Search for sales where buyer name contains 'Broadway Auto Sales' (case insensitive)
    const sales = await prisma.sale.findMany({
      where: {
        customerName: {
          contains: 'Broadway',
          mode: 'insensitive'
        }
      },
      include: {
        vehicle: true
      }
    });

    console.log(`Found ${sales.length} sales to Broadway Auto Sales.`);

    if (sales.length > 0) {
      const vehicleIds = sales
        .filter(s => s.vehicleId)
        .map(s => s.vehicleId);

      // Revert status to Available
      if (vehicleIds.length > 0) {
        await prisma.vehicle.updateMany({
          where: {
            id: { in: vehicleIds }
          },
          data: {
            status: 'Available'
          }
        });
        console.log(`Reverted status for ${vehicleIds.length} vehicles to 'Available'.`);
      }

      // Delete the sales
      const deleteResult = await prisma.sale.deleteMany({
        where: {
          id: { in: sales.map(s => s.id) }
        }
      });
      console.log(`Deleted ${deleteResult.count} sale records.`);
    }

  } catch (error) {
    console.error('Error removing sales:', error);
  } finally {
    await prisma.$disconnect();
  }
}

removeBroadwayAutoSales();
