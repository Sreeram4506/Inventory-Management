import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkNegativeSales() {
  try {
    const negativeSales = await prisma.sale.findMany({
      where: {
        profit: {
          lt: 0
        }
      },
      include: {
        vehicle: true
      }
    });

    console.log(`Found ${negativeSales.length} negative profit sales.`);
    
    for (const sale of negativeSales) {
      console.log(`- Sale ID: ${sale.id}`);
      console.log(`  Vehicle: ${sale.vehicle?.year} ${sale.vehicle?.make} ${sale.vehicle?.model} (${sale.vehicle?.vin})`);
      console.log(`  Sale Price: ${sale.salePrice}`);
      console.log(`  Profit: ${sale.profit}`);
    }

    if (negativeSales.length > 0) {
      console.log('\nReverting vehicle statuses and deleting negative profit sales...');
      
      const vehicleIds = negativeSales
        .filter(s => s.vehicleId)
        .map(s => s.vehicleId);

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

      const deleteResult = await prisma.sale.deleteMany({
        where: {
          profit: {
            lt: 0
          }
        }
      });
      console.log(`Deleted ${deleteResult.count} records.`);
    }

  } catch (error) {
    console.error('Error checking sales:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkNegativeSales();
