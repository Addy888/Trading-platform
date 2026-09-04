# Test Accounts Documentation

## Overview

Two test accounts have been created for local development and testing of the Tradeing platform.

⚠️ **IMPORTANT**: These accounts are for **DEVELOPMENT/TESTING ONLY**. Never use these credentials in production!

---

## Test Accounts

### 1. ADMIN Test Account

```
Email:    admin@tradeing.local
Password: Admin@12345
Role:     ADMIN
```

**Capabilities:**
- Full access to admin dashboard (`/admin`)
- Can manage all users
- Can view analytics and audit logs
- Has elevated permissions across the platform

**Expected Behavior:**
- After login, should redirect to `/admin`
- Can access all `/admin/*` API endpoints
- Token includes `role: "ADMIN"`

---

### 2. USER Test Account

```
Email:    user@tradeing.local
Password: User@12345
Role:     USER
```

**Capabilities:**
- Standard user access
- Access to user dashboard (`/dashboard`)
- Standard trading features
- Cannot access admin endpoints

**Expected Behavior:**
- After login, should redirect to `/dashboard`
- Receives `403 Forbidden` on `/admin/*` endpoints
- Token includes `role: "USER"`

---

## How These Were Created

### Database Seeding

The accounts were created using Prisma's seeding system:

```bash
npm run prisma:seed
```

The seed script (`prisma/seed.ts`):
- ✅ Uses bcrypt to hash passwords (10 rounds)
- ✅ Checks for existing accounts before creating
- ✅ Sets `isActive: true` and `isEmailVerified: true`
- ✅ Creates audit log entries
- ✅ Never stores plain-text passwords

### Verification

To verify the accounts exist:

```bash
npx ts-node scripts/verify-accounts.ts
```

This script checks:
- Accounts exist in database
- Passwords are properly hashed (bcrypt)
- Roles are correctly assigned
- Email verification and active status

---

## Testing Login & Authorization

### Prerequisites

1. Start the API server:
   ```bash
   npm run start:dev
   ```

2. Ensure MySQL is running and `tradeing_db` exists

### Run Tests

```bash
npx ts-node scripts/test-accounts.ts
```

This script tests:
1. ✅ ADMIN can login
2. ✅ ADMIN can access `/admin/dashboard`
3. ✅ USER can login
4. ✅ USER receives 403 on `/admin/dashboard`

### Manual Testing with curl

**Login as ADMIN:**
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@tradeing.local",
    "password": "Admin@12345"
  }'
```

**Login as USER:**
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@tradeing.local",
    "password": "User@12345"
  }'
```

**Test Admin Endpoint (replace TOKEN):**
```bash
curl http://localhost:3000/admin/dashboard \
  -H "Authorization: Bearer TOKEN"
```

---

## Frontend Integration

The web app should implement redirection based on the user's role:

```typescript
// After successful login
if (response.user.role === 'ADMIN') {
  router.push('/admin');
} else {
  router.push('/dashboard');
}
```

The JWT includes the user's role, which is validated by the `RolesGuard` on protected routes.

---

## Security Notes

### ✅ What's Secure

- Passwords are hashed with bcrypt (10 rounds)
- No plain-text passwords in database
- Role-based access control enforced by guards
- JWT tokens include role information
- Audit logs track all account activity

### ❌ What to NEVER Do

- **DO NOT** create a public API endpoint for admin registration
- **DO NOT** commit these passwords to version control
- **DO NOT** use these accounts in production
- **DO NOT** expose the seed script in production builds

### Production Setup

For production admin accounts:
1. Use strong, unique passwords
2. Enable 2FA (if implemented)
3. Use environment variables for credentials
4. Rotate passwords regularly
5. Monitor audit logs for suspicious activity

---

## Re-seeding

To recreate the accounts (will skip if they already exist):

```bash
npm run prisma:seed
```

To completely reset and re-seed:

```bash
npx prisma migrate reset  # ⚠️ DESTRUCTIVE: Drops all data
npm run prisma:seed
```

---

## Database Schema

The `User` model includes:

```prisma
model User {
  id               String   @id @default(uuid())
  email            String   @unique
  passwordHash     String   // bcrypt hashed
  firstName        String
  lastName         String
  role             Role     @default(USER)  // ADMIN or USER
  isEmailVerified  Boolean  @default(false)
  isActive         Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  // ... relations
}

enum Role {
  ADMIN
  USER
}
```

---

## Troubleshooting

### Can't login?

1. Verify accounts exist:
   ```bash
   npx ts-node scripts/verify-accounts.ts
   ```

2. Check API server is running:
   ```bash
   curl http://localhost:3000/auth/login
   ```

3. Check database connection in `.env`:
   ```
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=tradeing_db
   ```

### ADMIN can't access admin routes?

1. Check JWT includes role:
   - Decode the access token at https://jwt.io
   - Verify `sub` (user ID) is present

2. Verify `RolesGuard` is applied:
   ```typescript
   @UseGuards(JwtAuthGuard, RolesGuard)
   @Roles(Role.ADMIN)
   ```

3. Check user's role in database matches `ADMIN`

---

## Files Modified/Created

- `prisma/seed.ts` - Updated to create both test accounts
- `scripts/verify-accounts.ts` - Verification script
- `scripts/test-accounts.ts` - Automated testing script
- `TEST_ACCOUNTS.md` - This documentation

---

**Last Updated:** August 23, 2026
