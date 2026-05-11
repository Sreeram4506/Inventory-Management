import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createSuperAdmin() {
  const email = 'superadmin@gmail.com';
  const password = 'superadmin123';
  const name = 'Platform Owner';

  // Check if a dealership exists to link to, or create a "System" dealership
  let systemDealership = await prisma.dealership.findFirst({
    where: { name: 'System Administration' }
  });

  if (!systemDealership) {
    systemDealership = await prisma.dealership.create({
      data: {
        name: 'System Administration',
        slug: 'system-admin'
      }
    });
  }

  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: 'SUPER_ADMIN', dealershipId: systemDealership.id }
    });
    console.log(`Updated existing user ${email} to SUPER_ADMIN`);
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'SUPER_ADMIN',
        dealershipId: systemDealership.id
      }
    });
    console.log(`Created new SUPER_ADMIN user: ${email}`);
  }
}

createSuperAdmin()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
