import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.documentRegistry.count();
  console.log('DocumentRegistry count:', count);
  const logs = await prisma.documentRegistry.findMany({ take: 1 });
  console.log('One log:', JSON.stringify(logs, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
