# Day 29 Test Execution Guide

## Quick Start

### 1. Install Dependencies (if not already done)
```bash
npm install
```

### 2. Run All Day 29 Tests
```bash
npm run test:day29
```

### 3. Run Individual Test Suites

**Boundary Tests:**
```bash
npm run test:boundary
```

**Concurrency Tests:**
```bash
npm run test:concurrency
```

**Invariant Tests:**
```bash
npm run test:invariant
```

---

## Test Configuration

### Test Database

**Option 1: Use existing database** (⚠️ Will modify data)
- Tests will use `DATABASE_URL` from `.env`
- Recommended for development only

**Option 2: Use separate test database** (✅ Recommended)

1. Create test database:
   ```sql
   CREATE DATABASE trading_test;
   ```

2. Add to `.env`:
   ```
   TEST_DATABASE_URL="mysql://user:password@localhost:3306/trading_test"
   ```

3. Run migrations:
   ```bash
   npx prisma migrate deploy
   ```

---

## Expected Output

### Successful Test Run

```
 PASS  test/day29-boundary-tests.integration.spec.ts (15.234 s)
  Day 29: Boundary Value Tests
    1.1 Daily Loss Boundaries
      ✓ DL-001: Should NOT breach at 2 cents below limit (123 ms)
      ✓ DL-002: Should NOT breach at 1 cent below limit (98 ms)
      ✓ DL-003: Should BREACH at exact limit (145 ms)
      ✓ DL-004: Should BREACH at 1 cent above limit (112 ms)
      ✓ DL-005: Should BREACH at 2 cents above limit (89 ms)
    ... (20 more tests)

 PASS  test/day29-concurrency-tests.integration.spec.ts (8.567 s)
  Day 29: Concurrency Tests
    2.1 Simultaneous Trade Closes Causing Breach
      ✓ should handle simultaneous trade closes without duplicate breach events (456 ms)
    ... (7 more tests)

 PASS  test/day29-invariant-tests.integration.spec.ts (6.123 s)
  Day 29: Invariant Property Tests
    6.1 Financial Invariants
      ✓ INV-001: equity = balance + unrealizedPnl (always) (234 ms)
      ✓ INV-002: highWaterMark >= equity (always) (189 ms)
    ... (12 more tests)

Test Suites: 3 passed, 3 total
Tests:       47 passed, 47 total
Snapshots:   0 total
Time:        29.924 s
```

---

## Troubleshooting

### Issue: Module not found errors

**Solution:** Install missing dependencies
```bash
npm install
```

### Issue: Database connection errors

**Solution:** Check database is running and `.env` is configured
```bash
# Test database connection
npx prisma db pull
```

### Issue: Service initialization errors

**Possible causes:**
1. Missing service exports
2. Circular dependencies
3. Missing providers in test module

**Solution:** Check error message and add missing services to test module providers

### Issue: Tests timeout

**Solution:** Increase timeout in `jest.config.js`
```javascript
testTimeout: 60000, // 60 seconds
```

---

## Test Coverage

### Generate Coverage Report
```bash
npm run test:cov
```

**Output location:** `coverage/lcov-report/index.html`

Open in browser to see detailed coverage.

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Day 29 Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm install
      working-directory: apps/api
    
    - name: Run Day 29 tests
      run: npm run test:day29
      working-directory: apps/api
      env:
        DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
```

---

## Test Results Documentation

After running tests, document results in:

**Primary Report:**
`docs/TRADING_RISK_ENGINE_DAY29_TEST_REPORT.md`

**Update sections:**
1. Test Execution Results
2. Failures Found & Fixes
3. Performance Observations

---

## Next Steps After Test Execution

1. Review test output for any failures
2. Document actual vs expected results
3. Fix critical failures
4. Update test report with results
5. Commit test results to repository

---

## Support

For detailed test specifications, see:
- `docs/TRADING_RISK_ENGINE_DAY29_TEST_REPORT.md`
- `docs/TRADING_RISK_ENGINE_DAY29_TEST_IMPLEMENTATION.md`
- `docs/TRADING_RISK_ENGINE_DAY29_FINAL_SUMMARY.md`
