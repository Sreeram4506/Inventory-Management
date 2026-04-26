import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing all data from the database...');

  try {
    // Delete in order to avoid relation issues (though MongoDB handles this differently)
    const result_sale = await prisma.sale.deleteMany({});
    console.log(`Deleted ${result_sale.count} sales`);

    const result_purchase = await prisma.purchase.deleteMany({});
    console.log(`Deleted ${result_purchase.count} purchases`);

    const result_repair = await prisma.repair.deleteMany({});
    console.log(`Deleted ${result_repair.count} repairs`);

    const result_vehicle = await prisma.vehicle.deleteMany({});
    console.log(`Deleted ${result_vehicle.count} vehicles`);

    const result_ad = await prisma.advertisingExpense.deleteMany({});
    console.log(`Deleted ${result_ad.count} advertising expenses`);

    const result_exp = await prisma.businessExpense.deleteMany({});
    console.log(`Deleted ${result_exp.count} business expenses`);

    const result_doc = await prisma.documentRegistry.deleteMany({});
    console.log(`Deleted ${result_doc.count} document records`);

    // Optionally keep Users if the user wants to keep accounts, but "clear all data" usually means everything.
    // However, without a user, the system might be hard to log back into if there's no registration.
    // I will keep the admin user if one exists, or at least one user.
    // But the prompt says "clear all data". I'll delete all users too.
    const result_user = await prisma.user.deleteMany({});
    console.log(`Deleted ${result_user.count} users`);

    console.log('All data cleared successfully.');
  } catch (error) {
    console.error('Error clearing data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
