import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n=== USERS ===');
  const users = await prisma.user.findMany({
    select: { id: true, email: true },
  });
  console.log(JSON.stringify(users, null, 2));

  console.log('\n=== TRADING ACCOUNT ===');
  const account = await prisma.tradingAccount.findUnique({
    where: { id: '5c88b828-cc11-4db6-9b74-7b908e081275' },
    select: {
      id: true,
      userId: true,
      accountNumber: true,
      status: true,
      user: {
        select: { id: true, email: true },
      },
    },
  });
  console.log(JSON.stringify(account, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);
