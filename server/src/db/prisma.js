import { PrismaClient } from '@prisma/client';

const isProduction = process.env.NODE_ENV === 'production';

const prisma = new PrismaClient({
  log: isProduction ? ['warn', 'error'] : ['query', 'warn', 'error'],
});

export default prisma;
