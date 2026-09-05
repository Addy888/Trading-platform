@echo off
echo ========================================
echo DATABASE SETUP FOR TRADING PLATFORM
echo ========================================
echo.
echo This will create the database user and schema.
echo You will be prompted for the MySQL root password.
echo.
pause

set MYSQL_EXE="C:\Program Files\MySQL\MySQL Server 9.7\bin\mysql.exe"

echo.
echo Creating database and user...
echo.

%MYSQL_EXE% -u root -p -e "CREATE DATABASE IF NOT EXISTS tradeing_db; CREATE USER IF NOT EXISTS 'trading_app'@'localhost' IDENTIFIED BY 'TradingSecure2026!'; GRANT ALL PRIVILEGES ON tradeing_db.* TO 'trading_app'@'localhost'; FLUSH PRIVILEGES;"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo SUCCESS! Database setup complete
    echo ========================================
    echo.
    echo Now testing connection...
    cd /d "%~dp0"
    node test-connection.js
    if %ERRORLEVEL% EQU 0 (
        echo.
        echo ========================================
        echo Ready to start! Run: npm run start:dev
        echo ========================================
    )
) else (
    echo.
    echo ========================================
    echo FAILED - Could not create database user
    echo ========================================
    echo.
    echo Please check:
    echo 1. MySQL root password is correct
    echo 2. MySQL Server 9.7 is installed
    echo.
)

pause
