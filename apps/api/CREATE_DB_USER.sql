-- ==================================================
-- CREATE DEDICATED APPLICATION DATABASE USER
-- ==================================================
-- This script creates a dedicated MySQL user for the trading application
-- Run this as MySQL root user or administrator

-- Create the application user
CREATE USER 'trading_app'@'localhost' IDENTIFIED BY 'TradingApp2026!Secure';

-- Grant all privileges on the trading database
GRANT ALL PRIVILEGES ON tradeing_db.* TO 'trading_app'@'localhost';

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS tradeing_db;

-- Apply privilege changes
FLUSH PRIVILEGES;

-- Verify the user was created
SELECT User, Host FROM mysql.user WHERE User = 'trading_app';

-- Verify grants
SHOW GRANTS FOR 'trading_app'@'localhost';
