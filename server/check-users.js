import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log("Existing users:", users);

  if (users.length === 0) {
    const passwordHash = await bcrypt.hash('admin123', 10);
    const newAdmin = await prisma.user.create({
      data: {
        email: 'admin@autoprofithub.com',
        password: passwordHash,
        name: 'Admin User',
        role: 'admin'
      }
    });
    console.log("Created default admin user:", newAdmin.email, " / admin123");
  } else {
    // Re-hash password for the first user if it isn't bcrypt hashed
    const firstUser = users[0];
    if (!firstUser.password.startsWith('$2a$') && !firstUser.password.startsWith('$2b$')) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      await prisma.user.update({
        where: { id: firstUser.id },
        data: { password: passwordHash }
      });
      console.log(`Updated password for ${firstUser.email} to 'admin123'`);
    } else {
        console.log(`User ${firstUser.email} already has a hashed password.`);
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
