import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const result = await prisma.vehicle.updateMany({
    data: { make: 'DELETED_BY_ANTIGRAVITY' }
  })
  console.log('Update result:', result)
}
main().catch(console.error).finally(() => prisma.$disconnect())
