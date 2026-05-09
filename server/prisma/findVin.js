import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const v = await prisma.vehicle.findUnique({ where: { vin: 'EH608226' } })
  console.log('VEHICLE EH608226:', v)
}
main().catch(console.error).finally(() => prisma.$disconnect())
