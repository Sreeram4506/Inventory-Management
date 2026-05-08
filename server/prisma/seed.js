import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const adminPassword = await bcrypt.hash('password123', 10)
  const staffPassword = await bcrypt.hash('password123', 10)
  const managerPassword = await bcrypt.hash('password123', 10)

  console.log('Clearing existing data...')
  await prisma.sale.deleteMany({})
  await prisma.repair.deleteMany({})
  await prisma.purchase.deleteMany({})
  await prisma.advertisingExpense.deleteMany({})
  await prisma.businessExpense.deleteMany({})
  await prisma.vehicle.deleteMany({})

  // Seed Users
  await prisma.user.upsert({
    where: { email: 'admin@gmail.com' },
    update: { password: adminPassword },
    create: {
      email: 'admin@gmail.com',
      password: adminPassword,
      name: 'Admin User',
      role: 'ADMIN',
    },
  })

  await prisma.user.upsert({
    where: { email: 'manager@gmail.com' },
    update: { password: managerPassword },
    create: {
      email: 'manager@gmail.com',
      password: managerPassword,
      name: 'Manager User',
      role: 'MANAGER',
    },
  })

  await prisma.user.upsert({
    where: { email: 'staff@gmail.com' },
    update: { password: staffPassword },
    create: {
      email: 'staff@gmail.com',
      password: staffPassword,
      name: 'Staff User',
      role: 'STAFF',
    },
  })

  console.log('Seeding finished.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

