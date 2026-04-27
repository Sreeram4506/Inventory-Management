import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const sales = await prisma.sale.findMany({
    select: {
      id: true,
      vehicleId: true,
      customerName: true,
      hasBillOfSale: true,
      billOfSaleBase64: true
    }
  });

  console.log('Sales Records Document Status:');
  sales.forEach(s => {
    console.log(`- Sale: ${s.customerName} (${s.id})`);
    console.log(`  vehicleId: ${s.vehicleId}`);
    console.log(`  hasBillOfSale (Boolean field): ${s.hasBillOfSale}`);
    console.log(`  billOfSaleBase64 (Presence): ${!!s.billOfSaleBase64}`);
  });

  const vehicles = await prisma.vehicle.findMany({
    where: { status: 'Sold' },
    include: { sale: true }
  });

  console.log('\nSold Vehicles Status:');
  vehicles.forEach(v => {
    console.log(`- Vehicle: ${v.year} ${v.make} ${v.model} (${v.id})`);
    console.log(`  v.sale.hasBillOfSale: ${v.sale?.hasBillOfSale}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
