# DATABASE SETUP INSTRUCTIONS

## Current Issue
MySQL root password configured in .env is incorrect, causing:
- P2039: pool timeout
- Access denied for user 'root'@'localhost'

## Solution
Create dedicated database user `trading_app` and update configuration.

## STEP 1: Create Database User

Run this command:
```cmd
cd apps\api
setup-database.cmd
```

This will prompt for MySQL root password and create:
- Database: `tradeing_db`
- User: `trading_app`
- Grant all privileges

## STEP 2: Configuration Already Updated

The .env file has been updated to use:
- DB_USER=trading_app
- DB_PASSWORD=TradingSecure2026!

## STEP 3: Generate Prisma Client

After database user is created:
```cmd
cd apps\api
npx prisma generate
```

## STEP 4: Run Migrations (if database is empty)

If this is first time setup:
```cmd
npx prisma migrate deploy
```

## STEP 5: Seed Database

Create test accounts:
```cmd
npm run prisma:seed
```

This creates:
- **Admin account**: admin@tradeing.local / Admin@12345
- **User account**: user@tradeing.local / User@12345

## STEP 6: Start Backend

```cmd
npm run start:dev
```

Backend will:
- Test database connection on startup
- Fail fast if database unavailable
- Log clear error messages

## STEP 7: Test Login

Use these credentials:
- **Admin**: admin@tradeing.local / Admin@12345
- **User**: user@tradeing.local / User@12345

Admin will be redirected to: `/admin`
User will be redirected to: `/dashboard`

## Verification

All these should work:
- ✓ POST /api/auth/login (admin@tradeing.local)
- ✓ GET /api/auth/me (returns role: ADMIN)
- ✓ GET /api/health (returns database: healthy)
- ✓ GET /api/admin/dashboard
- ✓ Simulated market runs without errors
- ✓ RealtimeService queries work

## Troubleshooting

If setup-database.cmd fails:
1. Verify MySQL Server 9.7 is running
2. Check MySQL root password
3. Manually run SQL:
   ```sql
   CREATE DATABASE IF NOT EXISTS tradeing_db;
   CREATE USER IF NOT EXISTS 'trading_app'@'localhost' IDENTIFIED BY 'TradingSecure2026!';
   GRANT ALL PRIVILEGES ON tradeing_db.* TO 'trading_app'@'localhost';
   FLUSH PRIVILEGES;
   ```
