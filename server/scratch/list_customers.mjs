import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listCustomers() {
  try {
    const sales = await prisma.sale.findMany({
      select: {
        customerName: true
      }
    });

    const customers = [...new Set(sales.map(s => s.customerName))];
    console.log('Current customers in sales records:');
    customers.forEach(c => console.log(`- "${c}"`));

  } catch (error) {
    console.error('Error listing customers:', error);
  } finally {
    await prisma.$disconnect();
  }
}

listCustomers();
