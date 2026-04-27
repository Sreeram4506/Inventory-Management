import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const yarisId = '69ee61f54b6b1fd877787cb0';
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: yarisId },
    include: { purchase: true, sale: true }
  });

  console.log(`Vehicle ID: ${vehicle.id}`);
  console.log(`Sale exists: ${!!vehicle.sale}`);
  if (vehicle.sale) {
    console.log(`Sale ID: ${vehicle.sale.id}`);
    console.log(`hasBillOfSale flag: ${vehicle.sale.hasBillOfSale}`);
    console.log(`billOfSaleBase64 length: ${vehicle.sale.billOfSaleBase64?.length || 0}`);
    console.log(`billOfSaleBase64 starts with: ${vehicle.sale.billOfSaleBase64?.substring(0, 50)}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
