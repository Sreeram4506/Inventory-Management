import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const v = await prisma.vehicle.findMany({
    select: { id: true, make: true, model: true, vin: true, status: true }
  })
  console.log('ALL VEHICLES:', JSON.stringify(v, null, 2))
}
main().catch(console.error).finally(() => prisma.$disconnect())
