@echo off
echo ===============================================
echo CREATING MYSQL APPLICATION USER
echo ===============================================
echo.
echo This script will create the 'trading_app' user
echo.
echo You will be prompted for the MySQL root password
echo.
pause

"C:\Program Files\MySQL\MySQL Server 9.7\bin\mysql.exe" -u root -p -e "CREATE USER IF NOT EXISTS 'trading_app'@'localhost' IDENTIFIED BY 'TradingApp2026!Secure'; GRANT ALL PRIVILEGES ON tradeing_db.* TO 'trading_app'@'localhost'; CREATE DATABASE IF NOT EXISTS tradeing_db; FLUSH PRIVILEGES; SELECT User, Host FROM mysql.user WHERE User = 'trading_app';"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===============================================
    echo SUCCESS! User created successfully
    echo ===============================================
    echo.
    echo Now testing the new user...
    node test-new-user.js
) else (
    echo.
    echo ===============================================
    echo FAILED! Could not create user
    echo ===============================================
    echo.
    echo Please check:
    echo 1. MySQL root password is correct
    echo 2. You have administrator privileges
    echo.
)

pause
