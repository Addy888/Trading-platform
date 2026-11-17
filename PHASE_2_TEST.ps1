param()

$API = "http://localhost:3001"
$testId = Get-Random -Minimum 100000 -Maximum 999999
$email = "test-$testId@tradeing.local"
$pass = "TestPass123!TestPass!"

$passed = 0
$failed = 0

function Test {
    param([string]$name, [scriptblock]$test)
    try {
        $result = & $test
        if ($result) {
            Write-Host "✅ $name" -ForegroundColor Green
            $passed++
            return $true
        } else {
            Write-Host "❌ $name" -ForegroundColor Red
            $failed++
            return $false
        }
    } catch {
        Write-Host "⚠️ $name - $($_.Exception.Message)" -ForegroundColor Yellow
        $failed++
        return $false
    }
}

Write-Host "`n==== PHASE 2: END-TO-END TRADING ENGINE TEST ====" -ForegroundColor Cyan
Write-Host "API: $API`nUser: $email`n" -ForegroundColor Cyan

# Test 1: Register
$userId = $null
$token = $null

Test "Register User" {
    $body = @{email=$email; password=$pass; firstName='Test'; lastName='User'} | ConvertTo-Json
    $r = Invoke-WebRequest -Uri "$API/api/auth/register" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -ErrorAction SilentlyContinue
    if ($r.StatusCode -eq 201) {
        $data = $r.Content | ConvertFrom-Json
        $userId = $data.user.id
        $token = $data.accessToken
        Write-Host "    User: $userId"
        return $true
    }
    return $false
} | Out-Null

if (-not $token) {
    Write-Host "Cannot continue without authentication" -ForegroundColor Red
    exit 1
}

# Test 2: Get Current User
Test "Get Current User" {
    $headers = @{"Authorization"="Bearer $token"}
    $r = Invoke-WebRequest -Uri "$API/api/auth/me" -Method GET -Headers $headers -UseBasicParsing -ErrorAction SilentlyContinue
    return $r.StatusCode -eq 200
}

# Test 3: EUR/USD Quote
Test "Get EUR/USD Quote" {
    $headers = @{"Authorization"="Bearer $token"}
    $r = Invoke-WebRequest -Uri "$API/api/market/quote?symbol=EURUSD" -Method GET -Headers $headers -UseBasicParsing -ErrorAction SilentlyContinue
    if ($r.StatusCode -eq 200) {
        $data = $r.Content | ConvertFrom-Json
        Write-Host "    Price: $($data.price)"
        return $data.price -gt 0
    }
    return $false
}

# Test 4: GBP/USD Quote
Test "Get GBP/USD Quote" {
    $headers = @{"Authorization"="Bearer $token"}
    $r = Invoke-WebRequest -Uri "$API/api/market/quote?symbol=GBPUSD" -Method GET -Headers $headers -UseBasicParsing -ErrorAction SilentlyContinue
    if ($r.StatusCode -eq 200) {
        $data = $r.Content | ConvertFrom-Json
        Write-Host "    Price: $($data.price)"
        return $data.price -gt 0
    }
    return $false
}

# Test 5: Check Test Funding
$canCreateAccount = $false
Test "Check Test Funding" {
    $headers = @{"Authorization"="Bearer $token"}
    $r = Invoke-WebRequest -Uri "$API/api/trading-accounts/test-funding" -Method GET -Headers $headers -UseBasicParsing -ErrorAction SilentlyContinue
    if ($r.StatusCode -eq 200) {
        $data = $r.Content | ConvertFrom-Json
        $canCreateAccount = $data.enabled
        Write-Host "    Enabled: $($data.enabled), Balance: $($data.initialBalance)"
        return $data.enabled
    }
    return $false
}

# Test 6: Create Test-Funded Account
$accountId = $null
if ($canCreateAccount) {
    Test "Create Test-Funded Account" {
        $headers = @{"Authorization"="Bearer $token"}
        $body = @{testFunding=$true} | ConvertTo-Json
        $r = Invoke-WebRequest -Uri "$API/api/trading-accounts" -Method POST -Headers $headers -Body $body -ContentType "application/json" -UseBasicParsing -ErrorAction SilentlyContinue
        if ($r.StatusCode -eq 201 -or $r.StatusCode -eq 200) {
            $data = $r.Content | ConvertFrom-Json
            $accountId = $data.id
            Write-Host "    Account: $accountId, Balance: $($data.currentBalance)"
            return $true
        }
        return $false
    } | Out-Null
}

# Test 7: Verify Account
if ($accountId) {
    Test "Verify Account Details" {
        $headers = @{"Authorization"="Bearer $token"}
        $r = Invoke-WebRequest -Uri "$API/api/trading-accounts/$accountId" -Method GET -Headers $headers -UseBasicParsing -ErrorAction SilentlyContinue
        if ($r.StatusCode -eq 200) {
            $data = $r.Content | ConvertFrom-Json
            Write-Host "    Status: $($data.status), Balance: $($data.currentBalance), Equity: $($data.equity)"
            return $true
        }
        return $false
    } | Out-Null

    # Test 8: Place BUY Order
    Test "Place BUY Order (EURUSD)" {
        $headers = @{"Authorization"="Bearer $token"}
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
        $r = Invoke-WebRequest -Uri "$API/api/broker-orders" -Method POST -Headers $headers -Body $body -ContentType "application/json" -UseBasicParsing -ErrorAction SilentlyContinue
        if ($r.StatusCode -eq 201 -or $r.StatusCode -eq 200) {
            $data = $r.Content | ConvertFrom-Json
            Write-Host "    Order: $($data.id), Status: $($data.status)"
            return $true
        }
        Write-Host "    Error: $($r.StatusCode) - $($r.Content)"
        return $false
    } | Out-Null

    # Test 9: Place SELL Order
    Test "Place SELL Order (GBPUSD)" {
        $headers = @{"Authorization"="Bearer $token"}
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
        $r = Invoke-WebRequest -Uri "$API/api/broker-orders" -Method POST -Headers $headers -Body $body -ContentType "application/json" -UseBasicParsing -ErrorAction SilentlyContinue
        if ($r.StatusCode -eq 201 -or $r.StatusCode -eq 200) {
            $data = $r.Content | ConvertFrom-Json
            Write-Host "    Order: $($data.id), Status: $($data.status)"
            return $true
        }
        return $false
    } | Out-Null

    # Test 10: Get Open Positions
    Test "Get Open Positions" {
        $headers = @{"Authorization"="Bearer $token"}
        $r = Invoke-WebRequest -Uri "$API/api/trading-accounts/$accountId/positions" -Method GET -Headers $headers -UseBasicParsing -ErrorAction SilentlyContinue
        if ($r.StatusCode -eq 200) {
            $data = $r.Content | ConvertFrom-Json
            $open = @($data | Where-Object { $_.status -eq 'OPEN' }).Count
            Write-Host "    Total: $($data.Count), Open: $open"
            return $true
        }
        return $false
    } | Out-Null
}

# Summary
Write-Host "`n===== TEST SUMMARY =====" -ForegroundColor Cyan
Write-Host "Passed:  $passed" -ForegroundColor Green
Write-Host "Failed:  $failed" -ForegroundColor Red
Write-Host "========================`n" -ForegroundColor Cyan

exit $(if ($failed -gt 0) { 1 } else { 0 })
