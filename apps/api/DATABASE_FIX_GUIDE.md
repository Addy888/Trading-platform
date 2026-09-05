# Database Connection Fix Guide

## ✗ Problem Identified

**ROOT CAUSE**: MySQL authentication failure - the password "root" in `.env` is INCORRECT.

```
Error: ER_ACCESS_DENIED_ERROR
Access denied for user 'root'@'localhost' (using password: YES)
```

## ✓ Your MySQL Setup

- **MySQL Version**: 9.7
- **Service Status**: Running (MySQL97)
- **Port**: 3306 (confirmed open and listening)
- **TCP Networking**: Enabled
- **Current .env password**: "root" ❌ INCORRECT

## 🔧 Solutions

### Option 1: Find Your Actual MySQL Root Password (Recommended)

The MySQL root password was set during MySQL installation. You need to:

1. **Check your password manager or installation notes**
2. **Try to remember the password you set during installation**
3. **Test the password using our script**:

```bash
cd apps/api
node test-mysql2-connection.js
```

Once you find the correct password, update `.env`:

```env
DB_PASSWORD="your_actual_password_here"
```

### Option 2: Reset MySQL Root Password

If you don't remember the password, reset it:

1. Stop MySQL service:
   ```cmd
   net stop MySQL97
   ```

2. Start MySQL in safe mode (skip grant tables):
   ```cmd
   mysqld --console --skip-grant-tables --skip-networking
   ```

3. In a NEW command prompt, connect without password:
   ```cmd
   mysql -u root
   ```

4. Reset the password:
   ```sql
   FLUSH PRIVILEGES;
   ALTER USER 'root'@'localhost' IDENTIFIED BY 'new_password_here';
   FLUSH PRIVILEGES;
   EXIT;
   ```

5. Stop safe mode MySQL (Ctrl+C in first window)

6. Start MySQL normally:
   ```cmd
   net start MySQL97
   ```

7. Update `.env`:
   ```env
   DB_PASSWORD="new_password_here"
   ```

### Option 3: Create Dedicated Application User (Best Practice)

Instead of using root, create a dedicated user:

1. Connect to MySQL as root (once you have the correct password):
   ```cmd
   mysql -u root -p
   ```

2. Create the application user:
   ```sql
   CREATE USER 'trading_app'@'localhost' IDENTIFIED BY 'SecurePassword123!';
   GRANT ALL PRIVILEGES ON tradeing_db.* TO 'trading_app'@'localhost';
   CREATE DATABASE IF NOT EXISTS tradeing_db;
   FLUSH PRIVILEGES;
   EXIT;
   ```

3. Update `.env`:
   ```env
   DB_USER="trading_app"
   DB_PASSWORD="SecurePassword123!"
   ```

## 🧪 Verify the Fix

After updating `.env`, test the connection:

```bash
cd apps/api
node test-mysql2-connection.js
```

You should see:
```
✓✓✓ SUCCESS! ✓✓✓
```

## 🚀 Start the Application

Once the database connection is verified:

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Seed the database
npm run seed

# Start the API
npm run start:dev
```

## ✅ Verification Checklist

After starting the backend, verify:

- [ ] No "Access denied" errors in logs
- [ ] No "pool timeout" errors in logs
- [ ] Login endpoint works: `POST http://localhost:3001/api/auth/login`
- [ ] Dashboard loads: `GET http://localhost:3001/api/dashboard`
- [ ] WebSocket connects successfully
- [ ] Market prices update in realtime
- [ ] Trading operations work

## 📝 Architecture Notes

Your application correctly uses:
- ✓ Single PrismaService instance (shared via DI)
- ✓ Prisma 7.9.1 with @prisma/adapter-mariadb
- ✓ Proper connection pool configuration
- ✓ No duplicate PrismaClient instantiations
- ✓ `allowPublicKeyRetrieval: true` for MySQL 8+ authentication

The issue is ONLY the incorrect password - no code changes are needed.

## 🔍 Files Checked

- `apps/api/src/prisma/prisma.service.ts` - ✓ Correct architecture
- `apps/api/.env` - ❌ Wrong password
- `apps/api/prisma/schema.prisma` - ✓ Correct configuration
- `apps/api/src/realtime/realtime.service.ts` - ✓ Uses DI, no issues
- PrismaClient instantiation - ✓ Only in PrismaService + standalone scripts

## 📞 Next Steps

**ACTION REQUIRED**: 
1. Determine the correct MySQL root password
2. Update `DB_PASSWORD` in `.env`
3. Run `node test-mysql2-connection.js` to verify
4. Start the application

Let me know once you've updated the password and I'll help verify everything works!
