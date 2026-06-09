import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { username: 'admin' }
  });

  if (!user) {
    console.log('❌ Admin user not found, creating...');
    const passwordHash = await bcrypt.hash('admin', 10);
    const newUser = await prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@orch',
        passwordHash,
        firstName: 'Admin',
        lastName: 'User',
        roles: ['admin'],
        isActive: true,
      }
    });
    console.log('✅ Admin user created:', newUser.username);
  } else {
    console.log('✅ Admin user found:', user.username);
    console.log('   Email:', user.email);
    console.log('   Active:', user.isActive);
    console.log('   Roles:', user.roles);
    
    // Test password
    const testPass = await bcrypt.compare('admin', user.passwordHash);
    console.log('   Password match "admin":', testPass);
    
    if (!testPass) {
      console.log('⚠️ Password mismatch, resetting to "admin"...');
      const newHash = await bcrypt.hash('admin', 10);
      await prisma.user.update({
        where: { username: 'admin' },
        data: { passwordHash: newHash }
      });
      console.log('✅ Password reset complete');
    }
  }
}

main()
  .catch(e => { console.error('❌ Error:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
