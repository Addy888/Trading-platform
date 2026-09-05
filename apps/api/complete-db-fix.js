/**
 * Complete Database Fix Automation
 * 
 * This script executes all phases after MySQL user is created:
 * 1. Update .env
 * 2. Test connection
 * 3. Validate Prisma
 * 4. Generate Prisma client
 * 5. Report results
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const mysql = require('mysql2/promise');

async function main() {
  console.log('\n========================================');
  console.log('COMPLETE DATABASE FIX - AUTOMATED');
  console.log('========================================\n');

  try {
    // PHASE 2: Update .env
    console.log('PHASE 2: Updating .env configuration...');
    updateEnvFile();
    console.log('✓ .env updated\n');

    // PHASE 2: Test connection
    console.log('PHASE 2: Testing database connection...');
    await testConnection();
    console.log('✓ Connection successful\n');

    // PHASE 4: Prisma validation
    console.log('PHASE 4: Running Prisma validation...');
    execSync('npx prisma validate', { stdio: 'inherit', cwd: __dirname });
    console.log('✓ Prisma validation passed\n');

    // PHASE 4: Prisma generate
    console.log('PHASE 4: Generating Prisma client...');
    execSync('npx prisma generate', { stdio: 'inherit', cwd: __dirname });
    console.log('✓ Prisma client generated\n');

    console.log('\n========================================');
    console.log('✓✓✓ DATABASE FIX COMPLETE ✓✓✓');
    console.log('========================================');
    console.log('\nConfiguration updated successfully!');
    console.log('\nNext steps:');
    console.log('1. I will enhance PrismaService with startup check');
    console.log('2. I will fix health endpoint');
    console.log('3. I will start the backend');
    console.log('4. I will test all endpoints');
    console.log('5. I will verify data preservation');
    console.log('\nReply "Continue" to proceed with code enhancements.');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n✗ ERROR:', error.message);
    console.error('\nFix failed. Please check the error above.');
    process.exit(1);
  }
}

function updateEnvFile() {
  const envPath = path.join(__dirname, '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');

  // Update DATABASE_URL
  envContent = envContent.replace(
    /DATABASE_URL="mysql:\/\/[^:]+:[^@]+@([^"]+)"/,
    'DATABASE_URL="mysql://trading_app:TradingApp2026!Secure@$1"'
  );

  // Update individual DB_ variables
  envContent = envContent.replace(/DB_USER="[^"]*"/, 'DB_USER="trading_app"');
  envContent = envContent.replace(/DB_PASSWORD="[^"]*"/, 'DB_PASSWORD="TradingApp2026!Secure"');

  fs.writeFileSync(envPath, envContent);
}

async function testConnection() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'trading_app',
    password: 'TradingApp2026!Secure',
    database: 'tradeing_db',
  });

  await connection.query('SELECT 1');
  
  const [tables] = await connection.query('SHOW TABLES');
  console.log(`  Tables found: ${tables.length}`);

  const [userCount] = await connection.query('SELECT COUNT(*) as count FROM users');
  console.log(`  Users preserved: ${userCount[0].count}`);

  await connection.end();
}

main();
