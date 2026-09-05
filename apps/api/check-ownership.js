const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkOwnership() {
  console.log('=== CHECKING ACCOUNT OWNERSHIP ===\n');
  
  // Check user
  const user = await prisma.user.findUnique({
    where: { email: 'user@tradeing.local' },
    select: { id: true, email: true, role: true, firstName: true, lastName: true }
  });
  
  console.log('Logged-in User:');
  console.log(JSON.stringify(user, null, 2));
  console.log('');
  
  // Check account
  const accountId = '5c88b828-cc11-4db6-9b74-7b908e081275';
  const account = await prisma.tradingAccount.findUnique({
    where: { id: accountId },
    select: { 
      id: true, 
      userId: true, 
      accountNumber: true, 
      status: true,
      initialBalance: true,
      balance: true,
      equity: true 
    }
  });
  
  console.log(`Trading Account (${accountId}):`);
  console.log(JSON.stringify(account, null, 2));
  console.log('');
  
  // Check ownership
  if (user && account) {
    const ownsAccount = user.id === account.userId;
    console.log('=== OWNERSHIP CHECK ===');
    console.log(`User ID: ${user.id}`);
    console.log(`Account Owner ID: ${account.userId}`);
    console.log(`Match: ${ownsAccount ? '✅ YES' : '❌ NO'}`);
    
    if (!ownsAccount) {
      console.log('\n⚠️  OWNERSHIP MISMATCH DETECTED!');
      console.log('This is why you see "Access denied" errors.');
      console.log('\nFinding accounts owned by this user...\n');
      
      const userAccounts = await prisma.tradingAccount.findMany({
        where: { userId: user.id },
        select: { 
          id: true, 
          accountNumber: true, 
          status: true, 
          balance: true 
        }
      });
      
      console.log(`Found ${userAccounts.length} account(s) for this user:`);
      userAccounts.forEach((acc, i) => {
        console.log(`\n${i + 1}. Account: ${acc.accountNumber}`);
        console.log(`   ID: ${acc.id}`);
        console.log(`   Status: ${acc.status}`);
        console.log(`   Balance: $${acc.balance}`);
        console.log(`   URL: http://localhost:3000/dashboard/trading/${acc.id}`);
      });
    } else {
      console.log('\n✅ Ownership is correct!');
      console.log('The user should be able to access this account.');
      console.log('\nIf still seeing errors:');
      console.log('1. Logout and login again (to get new JWT token)');
      console.log('2. Clear browser cache');
      console.log('3. Refresh the page');
    }
  }
  
  await prisma.$disconnect();
}

checkOwnership().catch(console.error);
