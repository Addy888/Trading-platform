/**
 * Apply database fix - Update .env with new credentials
 * This will be executed after user creates the database user
 */

const fs = require('fs');
const path = require('path');

function updateEnv() {
  const envPath = path.join(__dirname, '.env');
  
  console.log('Updating .env file...\n');
  
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
  
  console.log('✓ Updated DATABASE_URL');
  console.log('✓ Updated DB_USER=trading_app');
  console.log('✓ Updated DB_PASSWORD');
  console.log('\n.env file updated successfully!\n');
}

updateEnv();
