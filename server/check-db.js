
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const count = await prisma.documentRegistry.count();
  console.log('DocumentRegistry count:', count);
  const logs = await prisma.documentRegistry.findMany({ take: 5 });
  console.log('Logs sample:', JSON.stringify(logs, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
