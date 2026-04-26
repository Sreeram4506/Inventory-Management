import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing all data but keeping/creating admin user...');

  try {
    // Delete all records
    await prisma.sale.deleteMany({});
    await prisma.repair.deleteMany({});
    await prisma.purchase.deleteMany({});
    await prisma.advertisingExpense.deleteMany({});
    await prisma.businessExpense.deleteMany({});
    await prisma.vehicle.deleteMany({});
    await prisma.documentRegistry.deleteMany({});
    await prisma.user.deleteMany({});

    console.log('Database cleared.');

    // Create default admin user
    const adminPassword = await bcrypt.hash('password123', 10);
    await prisma.user.create({
      data: {
        email: 'admin@gmail.com',
        password: adminPassword,
        name: 'Admin User',
        role: 'ADMIN',
      },
    });

    console.log('Admin user created (admin@gmail.com / password123)');
    console.log('Project data is now clean.');
  } catch (error) {
    console.error('Error clearing data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
