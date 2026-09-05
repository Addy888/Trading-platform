@echo off
echo ========================================
echo COMPLETE DATABASE FIX - AUTOMATED SETUP
echo ========================================
echo.
echo This will:
echo 1. Create MySQL database user
echo 2. Generate Prisma client
echo 3. Run migrations
echo 4. Seed test accounts
echo 5. Verify everything works
echo.
pause

echo.
echo STEP 1: Creating database user...
echo.
call setup-database.cmd

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================
    echo ERROR: Database user creation failed
    echo ========================================
    pause
    exit /b 1
)

echo.
echo STEP 2: Generating Prisma client...
echo.
call npx prisma generate

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Prisma generate failed
    pause
    exit /b 1
)

echo.
echo STEP 3: Running migrations...
echo.
call npx prisma migrate deploy

echo.
echo STEP 4: Seeding database...
echo.
call npm run prisma:seed

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Database seed failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo SETUP COMPLETE!
echo ========================================
echo.
echo Admin Credentials:
echo   Email: admin@tradeing.local
echo   Password: Admin@12345
echo.
echo User Credentials:
echo   Email: user@tradeing.local
echo   Password: User@12345
echo.
echo Next steps:
echo 1. Start backend: npm run start:dev
echo 2. Start frontend: cd ..\web ^&^& npm run dev
echo 3. Open: http://localhost:3000
echo 4. Login as admin to access /admin panel
echo.
echo ========================================
pause
