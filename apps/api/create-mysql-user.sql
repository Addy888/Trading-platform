CREATE DATABASE IF NOT EXISTS tradeing_db;

CREATE USER IF NOT EXISTS 'trading_app'@'localhost' IDENTIFIED BY 'TradingSecure2026!';
CREATE USER IF NOT EXISTS 'trading_app'@'127.0.0.1' IDENTIFIED BY 'TradingSecure2026!';

GRANT ALL PRIVILEGES ON tradeing_db.* TO 'trading_app'@'localhost';
GRANT ALL PRIVILEGES ON tradeing_db.* TO 'trading_app'@'127.0.0.1';

FLUSH PRIVILEGES;

SELECT User, Host FROM mysql.user WHERE User = 'trading_app';
