# Quick Start: Test Accounts

## ✅ Test Accounts Created

Two development test accounts have been successfully created in your MySQL database:

### 🔑 Credentials

| Role  | Email                   | Password      | Access Level |
|-------|-------------------------|---------------|--------------|
| ADMIN | admin@tradeing.local    | Admin@12345   | Full Admin   |
| USER  | user@tradeing.local     | User@12345    | Standard     |

---

## 🚀 Quick Commands

### Run the seed (creates accounts if they don't exist):
```bash
cd apps/api
npm run prisma:seed
```

### Verify accounts exist:
```bash
cd apps/api
npx ts-node scripts/verify-accounts.ts
```

### Test login & authorization:
```bash
cd apps/api
npm run start:dev  # Start API first
npx ts-node scripts/test-accounts.ts  # In another terminal
```

---

## 🧪 What Was Done

✅ Updated `prisma/seed.ts` with both test accounts  
✅ Passwords are bcrypt-hashed (never stored as plain text)  
✅ Accounts are active with verified emails  
✅ ADMIN role = access to `/admin/*` endpoints  
✅ USER role = standard access, 403 on admin routes  
✅ Duplicate prevention (won't recreate if already exists)  
✅ Audit logs track account creation  

---

## 📝 Implementation Details

**Seed Script:** `apps/api/prisma/seed.ts`
- Uses MariaDB adapter (matching your existing setup)
- Hashes passwords with bcrypt (10 rounds)
- Creates audit log entries
- Idempotent (safe to run multiple times)

**Verification Script:** `apps/api/scripts/verify-accounts.ts`
- Shows account details from database
- Confirms password hashing
- Displays account metadata

**Test Script:** `apps/api/scripts/test-accounts.ts`
- Tests ADMIN login → expects access to admin endpoints
- Tests USER login → expects 403 on admin endpoints
- Validates role-based authorization

---

## 🔐 Security

✅ **What's Secure:**
- Passwords hashed with bcrypt
- Role-based access control via `RolesGuard`
- JWT tokens include role
- No public ADMIN registration endpoint
- Audit logs track activity

⚠️ **For Production:**
- Change these passwords
- Use environment variables
- Enable 2FA (if available)
- Never commit credentials to git

---

## 🎯 Next Steps

1. **Start the API:**
   ```bash
   cd apps/api
   npm run start:dev
   ```

2. **Test Login:**
   ```bash
   curl -X POST http://localhost:3000/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@tradeing.local","password":"Admin@12345"}'
   ```

3. **Frontend Redirect Logic:**
   ```typescript
   if (user.role === 'ADMIN') {
     router.push('/admin');
   } else {
     router.push('/dashboard');
   }
   ```

---

📚 **Full Documentation:** See `TEST_ACCOUNTS.md` for complete details.
