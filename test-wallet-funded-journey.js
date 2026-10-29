const http = require('http');
const crypto = require('crypto');

const API_BASE = 'http://localhost:3001/api';

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({ status: res.statusCode, data: json, headers: res.headers });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function signWebhook(payloadString, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const dataToSign = `${timestamp}.${payloadString}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(dataToSign);
  const signature = hmac.digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

async function run() {
  console.log('================================================================');
  console.log('🚀 TESTING WALLET-FUNDED TRADING JOURNEY & SECURITY ENFORCEMENT');
  console.log('================================================================\n');

  const randomSuffix = Math.floor(Math.random() * 900000 + 100000);
  const user1Email = `trader_${randomSuffix}@test.com`;
  const user2Email = `intruder_${randomSuffix}@test.com`;
  const password = 'Password123!';

  // 1. Register User 1
  console.log(`[1] Registering User 1: ${user1Email}...`);
  const reg1Res = await request(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    email: user1Email,
    password,
    firstName: 'Alex',
    lastName: 'Trader',
  });

  if (reg1Res.status !== 201) {
    throw new Error(`User 1 registration failed (${reg1Res.status}): ${JSON.stringify(reg1Res.data)}`);
  }
  const token1 = reg1Res.data.accessToken;
  const user1Id = reg1Res.data.user.id;
  console.log(`✅ User 1 registered. UserID: ${user1Id}`);

  // 2. Register User 2 (for authorization check)
  console.log(`[2] Registering User 2 (Intruder): ${user2Email}...`);
  const reg2Res = await request(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    email: user2Email,
    password,
    firstName: 'Eve',
    lastName: 'Intruder',
  });
  const token2 = reg2Res.data.accessToken;
  console.log(`✅ User 2 registered.`);

  // 3. Verify Empty State for User 1 (0 trading accounts)
  console.log(`[3] Checking User 1 trading accounts (expecting 0)...`);
  const accountsRes = await request(`${API_BASE}/trading-accounts`, {
    headers: { Authorization: `Bearer ${token1}` },
  });
  if (accountsRes.status !== 200 || !Array.isArray(accountsRes.data) || accountsRes.data.length !== 0) {
    throw new Error(`Expected 0 accounts for new user, got: ${JSON.stringify(accountsRes.data)}`);
  }
  console.log(`✅ User 1 has 0 accounts. Verified empty state triggers correctly.`);

  // 4. Check Wallet Balance (should be 0.00)
  console.log(`[4] Checking User 1 wallet balance...`);
  const walletRes = await request(`${API_BASE}/payments/wallet`, {
    headers: { Authorization: `Bearer ${token1}` },
  });
  if (walletRes.status !== 200 || parseFloat(walletRes.data.balance) !== 0) {
    throw new Error(`Expected 0 wallet balance, got: ${JSON.stringify(walletRes.data)}`);
  }
  console.log(`✅ User 1 wallet verified: $${walletRes.data.balance}`);

  // 5. Initiate Deposit of $500.00
  console.log(`[5] Initiating $500.00 deposit via Simulation Provider...`);
  const depRes = await request(`${API_BASE}/payments/deposit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token1}`,
      'Content-Type': 'application/json',
    },
  }, {
    amount: '500.00',
    currency: 'USD',
    provider: 'SIMULATION',
  });

  if (depRes.status !== 201) {
    throw new Error(`Deposit initiation failed: ${JSON.stringify(depRes.data)}`);
  }
  const paymentRef = depRes.data.paymentReference;
  const providerRef = depRes.data.providerReference;
  console.log(`✅ Deposit initiated: InternalRef=${paymentRef}, ProviderRef=${providerRef}`);

  // 6. Send HMAC-verified Webhook to credit deposit
  console.log(`[6] Submitting HMAC-SHA256 verified webhook for payment confirmation...`);
  const webhookSecret = 'dev-simulated-webhook-secret-tradeing-platform-2026';
  const webhookPayload = JSON.stringify({
    event: 'payment.succeeded',
    providerReference: providerRef,
    internalReference: paymentRef,
    amount: '500.00',
    currency: 'USD',
    metadata: { test: true },
  });
  const webhookSig = signWebhook(webhookPayload, webhookSecret);

  const webhookRes = await request(`${API_BASE}/payments/webhook/simulation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': webhookSig,
    },
  }, webhookPayload);

  if (webhookRes.status !== 200 || !webhookRes.data.success) {
    throw new Error(`Webhook failed: ${JSON.stringify(webhookRes.data)}`);
  }
  console.log(`✅ Webhook verified and processed. Credited to wallet.`);

  // 7. Verify Idempotency (replay webhook)
  console.log(`[7] Submitting duplicate webhook to verify idempotency (replay attack protection)...`);
  const dupWebhookRes = await request(`${API_BASE}/payments/webhook/simulation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': webhookSig,
    },
  }, webhookPayload);
  if (!dupWebhookRes.data.alreadyProcessed) {
    throw new Error(`Expected alreadyProcessed=true, got: ${JSON.stringify(dupWebhookRes.data)}`);
  }
  console.log(`✅ Duplicate webhook safely ignored (alreadyProcessed=true). No double crediting!`);

  // 8. Verify Wallet Balance is exactly $500.00
  console.log(`[8] Checking wallet balance after deposit...`);
  const walletAfterDep = await request(`${API_BASE}/payments/wallet`, {
    headers: { Authorization: `Bearer ${token1}` },
  });
  if (parseFloat(walletAfterDep.data.balance) !== 500) {
    throw new Error(`Expected $500.00, got: ${walletAfterDep.data.balance}`);
  }
  console.log(`✅ Wallet balance confirmed: $${walletAfterDep.data.balance}`);

  // 9. Create Direct Trading Account with $200.00 Initial Funding from Wallet
  console.log(`[9] Creating direct wallet-funded trading account with $200.00 initial funding...`);
  const createAccRes = await request(`${API_BASE}/trading-accounts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token1}`,
      'Content-Type': 'application/json',
    },
  }, {
    initialFundingAmount: '200.00',
  });

  if (createAccRes.status !== 201) {
    throw new Error(`Create account failed (${createAccRes.status}): ${JSON.stringify(createAccRes.data)}`);
  }
  const account = createAccRes.data;
  console.log(`✅ Trading Account created successfully!`);
  console.log(`   Account Number : ${account.accountNumber}`);
  console.log(`   Status         : ${account.status}`);
  console.log(`   Stage          : ${account.stage}`);
  console.log(`   Execution Mode : ${account.executionMode}`);
  console.log(`   Initial Balance: $${account.initialBalance}`);
  console.log(`   Current Balance: $${account.currentBalance}`);
  console.log(`   Current Equity : $${account.equity}`);

  if (account.status !== 'ACTIVE' || account.executionMode !== 'SIMULATED' || account.stage !== 'FUNDED') {
    throw new Error('Account attributes do not match expected direct funded model!');
  }

  // 10. Verify Wallet Balance debited to $300.00
  console.log(`[10] Verifying wallet balance after $200 initial funding...`);
  const walletAfterAcc = await request(`${API_BASE}/payments/wallet`, {
    headers: { Authorization: `Bearer ${token1}` },
  });
  if (parseFloat(walletAfterAcc.data.balance) !== 300) {
    throw new Error(`Expected $300.00, got: ${walletAfterAcc.data.balance}`);
  }
  console.log(`✅ Wallet balance is now exactly $${walletAfterAcc.data.balance}. Distinct balance preserved!`);

  // 11. Transfer Additional $100.00 from Wallet to Trading Account
  console.log(`[11] Transferring additional $100.00 from Wallet to Trading Account...`);
  const transferRes = await request(`${API_BASE}/payments/transfer-to-trading`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token1}`,
      'Content-Type': 'application/json',
    },
  }, {
    tradingAccountId: account.id,
    amount: '100.00',
  });

  if (transferRes.status !== 201 || !transferRes.data.success) {
    throw new Error(`Transfer failed: ${JSON.stringify(transferRes.data)}`);
  }
  console.log(`✅ Transfer successful!`);
  console.log(`   New Wallet Balance : $${transferRes.data.walletBalance}`);
  console.log(`   New Account Balance: $${transferRes.data.accountBalance}`);
  console.log(`   New Account Equity : $${transferRes.data.accountEquity}`);

  if (parseFloat(transferRes.data.walletBalance) !== 200 || parseFloat(transferRes.data.accountBalance) !== 300) {
    throw new Error('Transfer balance arithmetic failed!');
  }

  // 12. Security Test: User 2 (Intruder) attempts to transfer funds to User 1's Trading Account
  console.log(`[12] Security Test: Intruder (User 2) attempts to transfer funds to User 1's Trading Account...`);
  const intruderTransfer = await request(`${API_BASE}/payments/transfer-to-trading`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token2}`,
      'Content-Type': 'application/json',
    },
  }, {
    tradingAccountId: account.id,
    amount: '50.00',
  });
  if (intruderTransfer.status !== 403) {
    throw new Error(`Expected 403 Forbidden for cross-user transfer, got ${intruderTransfer.status}`);
  }
  console.log(`✅ Intruder transfer blocked with 403 Forbidden! Ownership enforced.`);

  // 13. Security Test: User 2 attempts to fetch User 1's Trading Account
  console.log(`[13] Security Test: Intruder attempts to fetch User 1's Account details...`);
  const intruderFetch = await request(`${API_BASE}/trading-accounts/${account.id}`, {
    headers: { Authorization: `Bearer ${token2}` },
  });
  if (intruderFetch.status !== 403) {
    throw new Error(`Expected 403 Forbidden for cross-user account read, got ${intruderFetch.status}`);
  }
  console.log(`✅ Intruder account view blocked with 403 Forbidden! Ownership enforced.`);

  // 14. Overdraft Prevention Test: Attempt to transfer $9999 from Wallet
  console.log(`[14] Overdraft Test: User 1 attempts to transfer $9,999.00 (wallet only has $200)...`);
  const overdraftRes = await request(`${API_BASE}/payments/transfer-to-trading`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token1}`,
      'Content-Type': 'application/json',
    },
  }, {
    tradingAccountId: account.id,
    amount: '9999.00',
  });
  if (overdraftRes.status !== 400) {
    throw new Error(`Expected 400 Bad Request for overdraft, got ${overdraftRes.status}`);
  }
  console.log(`✅ Overdraft blocked with 400 Bad Request! Wallet balance protected.`);

  // 15. Check Wallet Ledger History
  console.log(`[15] Checking complete Wallet Ledger audit trail for User 1...`);
  const ledgerRes = await request(`${API_BASE}/payments/history`, {
    headers: { Authorization: `Bearer ${token1}` },
  });
  console.log(`✅ Ledger entries recorded: ${ledgerRes.data.data.length}`);
  ledgerRes.data.data.forEach((entry, i) => {
    console.log(`   [${i+1}] ${entry.type} (${entry.direction}): $${entry.amount} | BalBefore: $${entry.balanceBefore} -> BalAfter: $${entry.balanceAfter}`);
  });

  console.log('\n================================================================');
  console.log('🎉 ALL INTEGRATION & SECURITY ASSERTIONS PASSED PERFECTLY!');
  console.log('================================================================');
}

run().catch((err) => {
  console.error('\n❌ TEST FAILED:', err.message);
  process.exit(1);
});
