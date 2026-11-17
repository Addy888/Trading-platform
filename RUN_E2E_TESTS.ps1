$ErrorActionPreference = 'SilentlyContinue'

$API = "http://localhost:3001"
$testId = Get-Random -Minimum 100000 -Maximum 999999
$email = "test-$testId@tradeing.local"
$pass = "TestPass123!TestPass!"

$passed = 0
$failed = 0

Write-Host ""
Write-Host "==== PHASE 2: END-TO-END TRADING ENGINE TESTS ====" -ForegroundColor Cyan
Write-Host "API: $API" -ForegroundColor Cyan
Write-Host "User: $email`n" -ForegroundColor Cyan

# TEST 1: Register
Write-Host "TEST 1: Register User"
$body = @{email=$email; password=$pass; firstName='Test'; lastName='User'} | ConvertTo-Json
$r = Invoke-WebRequest -Uri "$API/api/auth/register" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
if ($r.StatusCode -eq 201) {
    $data = $r.Content | ConvertFrom-Json
    $userId = $data.user.id
    $token = $data.accessToken
    Write-Host "  ✅ PASS - User: $userId`n" -ForegroundColor Green
    $passed++
} else {
    Write-Host "  ❌ FAIL - Status: $($r.StatusCode)`n" -ForegroundColor Red
    $failed++
    exit 1
}

# TEST 2: Get Current User
Write-Host "TEST 2: Get Current User"
$headers = @{"Authorization"="Bearer $token"}
$r = Invoke-WebRequest -Uri "$API/api/auth/me" -Method GET -Headers $headers -UseBasicParsing
if ($r.StatusCode -eq 200) {
    $data = $r.Content | ConvertFrom-Json
    Write-Host "  ✅ PASS - Email: $($data.email)`n" -ForegroundColor Green
    $passed++
} else {
    Write-Host "  ❌ FAIL - Status: $($r.StatusCode)`n" -ForegroundColor Red
    $failed++
}

# TEST 3: EUR/USD Quote
Write-Host "TEST 3: Get EUR/USD Quote (Twelve Data)"
$r = Invoke-WebRequest -Uri "$API/api/market/quote?symbol=EURUSD" -Method GET -Headers $headers -UseBasicParsing
if ($r.StatusCode -eq 200) {
    $data = $r.Content | ConvertFrom-Json
    if ($data.price -gt 0) {
        Write-Host "  ✅ PASS - Price: $($data.price)`n" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "  ❌ FAIL - No price`n" -ForegroundColor Red
        $failed++
    }
} else {
    Write-Host "  ❌ FAIL - Status: $($r.StatusCode)`n" -ForegroundColor Red
    $failed++
}

# TEST 4: GBP/USD Quote
Write-Host "TEST 4: Get GBP/USD Quote (Twelve Data)"
$r = Invoke-WebRequest -Uri "$API/api/market/quote?symbol=GBPUSD" -Method GET -Headers $headers -UseBasicParsing
if ($r.StatusCode -eq 200) {
    $data = $r.Content | ConvertFrom-Json
    if ($data.price -gt 0) {
        Write-Host "  ✅ PASS - Price: $($data.price)`n" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "  ❌ FAIL - No price`n" -ForegroundColor Red
        $failed++
    }
} else {
    Write-Host "  ❌ FAIL - Status: $($r.StatusCode)`n" -ForegroundColor Red
    $failed++
}

# TEST 5: Check Test Funding
Write-Host "TEST 5: Check Test Funding Status"
$r = Invoke-WebRequest -Uri "$API/api/trading-accounts/test-funding" -Method GET -Headers $headers -UseBasicParsing
if ($r.StatusCode -eq 200) {
    $data = $r.Content | ConvertFrom-Json
    if ($data.enabled) {
        Write-Host "  ✅ PASS - Enabled: $($data.enabled), Balance: $($data.initialBalance)`n" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "  ⚠️  SKIP - Test funding disabled or account already created`n" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ❌ FAIL - Status: $($r.StatusCode)`n" -ForegroundColor Red
    $failed++
}

# TEST 6: Create Test-Funded Account
Write-Host "TEST 6: Create Test-Funded Trading Account"
$body = @{testFunding=$true} | ConvertTo-Json
$r = Invoke-WebRequest -Uri "$API/api/trading-accounts" -Method POST -Headers $headers -Body $body -ContentType "application/json" -UseBasicParsing
if ($r.StatusCode -eq 201 -or $r.StatusCode -eq 200) {
    $data = $r.Content | ConvertFrom-Json
    $accountId = $data.id
    Write-Host "  ✅ PASS - Account: $accountId, Balance: $($data.currentBalance)`n" -ForegroundColor Green
    $passed++
} else {
    Write-Host "  ❌ FAIL - Status: $($r.StatusCode) - $($r.Content)`n" -ForegroundColor Red
    $failed++
    exit 1
}

# TEST 7: Verify Account
Write-Host "TEST 7: Verify Account Details"
$r = Invoke-WebRequest -Uri "$API/api/trading-accounts/$accountId" -Method GET -Headers $headers -UseBasicParsing
if ($r.StatusCode -eq 200) {
    $data = $r.Content | ConvertFrom-Json
    Write-Host "  ✅ PASS - Status: $($data.status), Balance: $($data.currentBalance), Equity: $($data.equity)`n" -ForegroundColor Green
    $passed++
} else {
    Write-Host "  ❌ FAIL - Status: $($r.StatusCode)`n" -ForegroundColor Red
    $failed++
}

# TEST 8: Place BUY Order
Write-Host "TEST 8: Place BUY Order (EURUSD, 0.1 lot)"
$body = @{
    tradingAccountId = $accountId
    symbol = 'EURUSD'
    side = 'BUY'
    quantity = 0.1
    tradingMode = 'PAPER'
    orderType = 'MARKET'
    stopLoss = 1.09
    takeProfit = 1.11
} | ConvertTo-Json
$r = Invoke-WebRequest -Uri "$API/api/broker-orders" -Method POST -Headers $headers -Body $body -ContentType "application/json" -UseBasicParsing
if ($r.StatusCode -eq 201 -or $r.StatusCode -eq 200) {
    $data = $r.Content | ConvertFrom-Json
    if ($data.id) {
        $buyOrderId = $data.id
        Write-Host "  ✅ PASS - Order: $buyOrderId, Status: $($data.status), Price: $($data.executionPrice -or 'N/A')`n" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "  ❌ FAIL - No order ID`n" -ForegroundColor Red
        $failed++
    }
} else {
    Write-Host "  ❌ FAIL - Status: $($r.StatusCode)`n" -ForegroundColor Red
    $failed++
}

# TEST 9: Place SELL Order
Write-Host "TEST 9: Place SELL Order (GBPUSD, 0.1 lot)"
$body = @{
    tradingAccountId = $accountId
    symbol = 'GBPUSD'
    side = 'SELL'
    quantity = 0.1
    tradingMode = 'PAPER'
    orderType = 'MARKET'
    stopLoss = 1.32
    takeProfit = 1.30
} | ConvertTo-Json
$r = Invoke-WebRequest -Uri "$API/api/broker-orders" -Method POST -Headers $headers -Body $body -ContentType "application/json" -UseBasicParsing
if ($r.StatusCode -eq 201 -or $r.StatusCode -eq 200) {
    $data = $r.Content | ConvertFrom-Json
    if ($data.id) {
        $sellOrderId = $data.id
        Write-Host "  ✅ PASS - Order: $sellOrderId, Status: $($data.status)`n" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "  ❌ FAIL - No order ID`n" -ForegroundColor Red
        $failed++
    }
} else {
    Write-Host "  ❌ FAIL - Status: $($r.StatusCode)`n" -ForegroundColor Red
    $failed++
}

# TEST 10: Get Open Positions
Write-Host "TEST 10: Get Open Positions"
$r = Invoke-WebRequest -Uri "$API/api/trading-accounts/$accountId/positions" -Method GET -Headers $headers -UseBasicParsing
if ($r.StatusCode -eq 200) {
    $data = $r.Content | ConvertFrom-Json
    $open = @($data | Where-Object { $_.status -eq 'OPEN' }).Count
    Write-Host "  ✅ PASS - Total: $($data.Count), Open: $open`n" -ForegroundColor Green
    $passed++
} else {
    Write-Host "  ❌ FAIL - Status: $($r.StatusCode)`n" -ForegroundColor Red
    $failed++
}

# SUMMARY
Write-Host ""
Write-Host "==== TEST SUMMARY ====" -ForegroundColor Cyan
Write-Host "Passed:  $passed" -ForegroundColor Green
Write-Host "Failed:  $failed" -ForegroundColor Red
Write-Host "======================`n" -ForegroundColor Cyan

exit $(if ($failed -gt 0) { 1 } else { 0 })
