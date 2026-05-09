import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- VERIFYING DATA WIPE ---')
  
  const vehicles = await prisma.vehicle.count()
  const sales = await prisma.sale.count()
  const registry = await prisma.documentRegistry.count()

  console.log(`Vehicles: ${vehicles}`)
  console.log(`Sales: ${sales}`)
  console.log(`Registry: ${registry}`)
  
  console.log('--- VERIFICATION COMPLETE ---')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
