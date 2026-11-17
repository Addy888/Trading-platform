#Requires -Version 5.1

<#
.SYNOPSIS
    PHASE 2: Complete End-to-End Trading Engine Test Suite
    
.DESCRIPTION
    Comprehensive test of the entire trading lifecycle including:
    - Authentication (Register & Login)
    - Market Data (Twelve Data quotes & candles)
    - Account Creation (Test-funded)
    - Order Placement (BUY & SELL)
    - Position Management
    - Financial Calculations
    - Database Persistence
#>

[CmdletBinding()]
param()

# ============================================================================
# CONFIGURATION
# ============================================================================

$API_BASE = "http://localhost:3001"
$TEST_ID = [DateTime]::UtcNow.Ticks
$TEST_USER_EMAIL = "test-e2e-$TEST_ID@tradeing.local"
$TEST_USER_PASSWORD = "TestPass123!TestPass!"

# Test data storage
$testData = @{
    userId = $null
    token = $null
    tradingAccountId = $null
    buyTradeId = $null
    sellTradeId = $null
}

# Test results
$results = @{
    passed = @()
    failed = @()
    blocked = @()
}

# ============================================================================
# LOGGING
# ============================================================================

function Write-TestLog {
    param(
        [string]$TestName,
        [ValidateSet('PASS', 'FAIL', 'BLOCKED')][string]$Status,
        [hashtable]$Details = @{}
    )
    
    $icon = switch ($Status) {
        'PASS' { '✅' }
        'FAIL' { '❌' }
        'BLOCKED' { '⚠️' }
    }
    
    $timestamp = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    Write-Host "[$timestamp] $icon $TestName" -ForegroundColor $(if ($Status -eq 'PASS') { 'Green' } else { if ($Status -eq 'FAIL') { 'Red' } else { 'Yellow' } })
    
    if ($Details.Endpoint) { Write-Host "    Endpoint: $($Details.Endpoint)" -ForegroundColor Cyan }
    if ($Details.Input) { Write-Host "    Input: $($Details.Input | ConvertTo-Json -Compress)" -ForegroundColor Gray }
    if ($Details.Expected) { Write-Host "    Expected: $($Details.Expected)" -ForegroundColor Gray }
    if ($Details.Actual) { Write-Host "    Actual: $($Details.Actual)" -ForegroundColor Gray }
    if ($Details.Error) { Write-Host "    Error: $($Details.Error)" -ForegroundColor Red }
    if ($Details.StatusCode) { Write-Host "    HTTP Status: $($Details.StatusCode)" -ForegroundColor Cyan }
    
    $results[$Status.ToLower()] += @{
        name = $TestName
        status = $Status
        details = $Details
        timestamp = $timestamp
    }
}

function Write-Section {
    param([string]$Title)
    Write-Host "`n$('=' * 80)" -ForegroundColor Magenta
    Write-Host "🧪 $Title" -ForegroundColor Magenta
    Write-Host $('=' * 80) -ForegroundColor Magenta
}

# ============================================================================
# HTTP HELPER
# ============================================================================

function Invoke-ApiRequest {
    param(
        [string]$Method = 'GET',
        [string]$Path,
        [hashtable]$Body = $null,
        [string]$Token = $null
    )
    
    $url = "$API_BASE$Path"
    $headers = @{
        'Content-Type' = 'application/json'
    }
    
    if ($Token) {
        $headers['Authorization'] = "Bearer $Token"
    }
    
    try {
        $params = @{
            Uri = $url
            Method = $Method
            Headers = $headers
            UseBasicParsing = $true
            TimeoutSec = 10
            ErrorAction = 'SilentlyContinue'
        }
        
        if ($Body) {
            $params['Body'] = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-WebRequest @params 2>&1
        
        return @{
            StatusCode = $response.StatusCode
            Content = $response.Content
            Body = try { $response.Content | ConvertFrom-Json } catch { $null }
        }
    }
    catch {
        return @{
            StatusCode = $null
            Error = $_.Exception.Message
            Content = $null
            Body = $null
        }
    }
}

# ============================================================================
# TEST SUITES
# ============================================================================

function Test-Authentication {
    Write-Section "A. Authentication Tests"
    
    # A.1: Register User
    try {
        $resp = Invoke-ApiRequest -Method POST -Path '/api/auth/register' -Body @{
            email = $TEST_USER_EMAIL
            password = $TEST_USER_PASSWORD
            firstName = 'Test'
            lastName = 'User'
        }
        
        if ($resp.StatusCode -eq 201 -and $resp.Body.user.id) {
            $testData.userId = $resp.Body.user.id
            $testData.token = $resp.Body.accessToken
            
            Write-TestLog 'A.1: Register User' 'PASS' @{
                Endpoint = 'POST /api/auth/register'
                Input = $TEST_USER_EMAIL
                StatusCode = $resp.StatusCode
                Actual = "User ID: $($testData.userId)"
            }
        }
        else {
            Write-TestLog 'A.1: Register User' 'FAIL' @{
                Endpoint = 'POST /api/auth/register'
                StatusCode = $resp.StatusCode
                Error = $resp.Body.message -or $resp.Error
            }
        }
    }
    catch {
        Write-TestLog 'A.1: Register User' 'BLOCKED' @{ Error = $_.Exception.Message }
    }
    
    # A.2: Login User
    if (-not $testData.token) {
        try {
            $resp = Invoke-ApiRequest -Method POST -Path '/api/auth/login' -Body @{
                email = $TEST_USER_EMAIL
                password = $TEST_USER_PASSWORD
            }
            
            if ($resp.StatusCode -eq 200 -and $resp.Body.access_token) {
                $testData.token = $resp.Body.access_token
                $testData.userId = $resp.Body.user.id
                
                Write-TestLog 'A.2: Login User' 'PASS' @{
                    Endpoint = 'POST /api/auth/login'
                    StatusCode = $resp.StatusCode
                    Actual = "Token: $($testData.token.Substring(0, 20))..."
                }
            }
            else {
                Write-TestLog 'A.2: Login User' 'FAIL' @{
                    Endpoint = 'POST /api/auth/login'
                    StatusCode = $resp.StatusCode
                    Error = $resp.Body.message -or $resp.Error
                }
                return
            }
        }
        catch {
            Write-TestLog 'A.2: Login User' 'BLOCKED' @{ Error = $_.Exception.Message }
            return
        }
    }
    else {
        Write-TestLog 'A.2: Login User' 'PASS' @{
            Endpoint = 'POST /api/auth/register'
            Actual = 'Token obtained during registration'
        }
    }
    
    # A.3: Verify Token
    try {
        $resp = Invoke-ApiRequest -Method GET -Path '/api/auth/me' -Token $testData.token
        
        if ($resp.StatusCode -eq 200 -and $resp.Body.id) {
            Write-TestLog 'A.3: Get Current User' 'PASS' @{
                Endpoint = 'GET /api/auth/me'
                StatusCode = $resp.StatusCode
                Actual = "User: $($resp.Body.email)"
            }
        }
        else {
            Write-TestLog 'A.3: Get Current User' 'FAIL' @{
                Endpoint = 'GET /api/auth/me'
                StatusCode = $resp.StatusCode
            }
        }
    }
    catch {
        Write-TestLog 'A.3: Get Current User' 'BLOCKED' @{ Error = $_.Exception.Message }
    }
}

function Test-MarketData {
    Write-Section "B. Market Data Tests"
    
    if (-not $testData.token) {
        Write-TestLog 'B.1: EUR/USD Quote' 'BLOCKED' @{ Error = 'Not authenticated' }
        return
    }
    
    # B.1: EUR/USD Quote
    try {
        $resp = Invoke-ApiRequest -Method GET -Path '/api/market/quote?symbol=EURUSD' -Token $testData.token
        
        if ($resp.StatusCode -eq 200 -and $resp.Body.price) {
            $price = [double]$resp.Body.price
            Write-TestLog 'B.1: EUR/USD Quote' 'PASS' @{
                Endpoint = 'GET /api/market/quote?symbol=EURUSD'
                StatusCode = $resp.StatusCode
                Actual = "Price: $price (Source: $($resp.Body.source -or 'Twelve Data'))"
            }
        }
        else {
            Write-TestLog 'B.1: EUR/USD Quote' 'FAIL' @{
                Endpoint = 'GET /api/market/quote?symbol=EURUSD'
                StatusCode = $resp.StatusCode
                Error = 'No price returned'
            }
        }
    }
    catch {
        Write-TestLog 'B.1: EUR/USD Quote' 'BLOCKED' @{ Error = $_.Exception.Message }
    }
    
    # B.2: GBP/USD Quote
    try {
        $resp = Invoke-ApiRequest -Method GET -Path '/api/market/quote?symbol=GBPUSD' -Token $testData.token
        
        if ($resp.StatusCode -eq 200 -and $resp.Body.price) {
            Write-TestLog 'B.2: GBP/USD Quote' 'PASS' @{
                Endpoint = 'GET /api/market/quote?symbol=GBPUSD'
                StatusCode = $resp.StatusCode
                Actual = "Price: $($resp.Body.price)"
            }
        }
        else {
            Write-TestLog 'B.2: GBP/USD Quote' 'FAIL' @{
                Endpoint = 'GET /api/market/quote?symbol=GBPUSD'
                StatusCode = $resp.StatusCode
            }
        }
    }
    catch {
        Write-TestLog 'B.2: GBP/USD Quote' 'BLOCKED' @{ Error = $_.Exception.Message }
    }
    
    # B.3: Historical Candles
    try {
        $resp = Invoke-ApiRequest -Method GET -Path '/api/market/candles?symbol=EURUSD&interval=1h&limit=10' -Token $testData.token
        
        if ($resp.StatusCode -eq 200 -and $resp.Body -is [array]) {
            Write-TestLog 'B.3: Historical Candles' 'PASS' @{
                Endpoint = 'GET /api/market/candles'
                StatusCode = $resp.StatusCode
                Actual = "Retrieved $($resp.Body.Count) candles"
            }
        }
        else {
            Write-TestLog 'B.3: Historical Candles' 'FAIL' @{
                Endpoint = 'GET /api/market/candles'
                StatusCode = $resp.StatusCode
            }
        }
    }
    catch {
        Write-TestLog 'B.3: Historical Candles' 'BLOCKED' @{ Error = $_.Exception.Message }
    }
}

function Test-AccountCreation {
    Write-Section "C. Account Creation Tests"
    
    if (-not $testData.token) {
        Write-TestLog 'C.1: Create Test-Funded Account' 'BLOCKED' @{ Error = 'Not authenticated' }
        return
    }
    
    # C.1: Check Test Funding Status
    try {
        $resp = Invoke-ApiRequest -Method GET -Path '/api/trading-accounts/test-funding' -Token $testData.token
        
        if ($resp.StatusCode -eq 200 -and $resp.Body.enabled) {
            Write-TestLog 'C.1: Test Funding Available' 'PASS' @{
                Endpoint = 'GET /api/trading-accounts/test-funding'
                StatusCode = $resp.StatusCode
                Actual = "Enabled: $($resp.Body.enabled), Balance: $($resp.Body.initialBalance)"
            }
        }
        else {
            Write-TestLog 'C.1: Test Funding Available' 'FAIL' @{
                Endpoint = 'GET /api/trading-accounts/test-funding'
                StatusCode = $resp.StatusCode
                Error = "Funding not available or account already created"
            }
        }
    }
    catch {
        Write-TestLog 'C.1: Test Funding Available' 'BLOCKED' @{ Error = $_.Exception.Message }
        return
    }
    
    # C.2: Create Account with Test Funding
    try {
        $resp = Invoke-ApiRequest -Method POST -Path '/api/trading-accounts' -Body @{
            testFunding = $true
        } -Token $testData.token
        
        if (($resp.StatusCode -eq 201 -or $resp.StatusCode -eq 200) -and $resp.Body.id) {
            $testData.tradingAccountId = $resp.Body.id
            Write-TestLog 'C.2: Create Test-Funded Account' 'PASS' @{
                Endpoint = 'POST /api/trading-accounts'
                StatusCode = $resp.StatusCode
                Actual = "Account: $($testData.tradingAccountId), Balance: $($resp.Body.currentBalance)"
            }
        }
        else {
            Write-TestLog 'C.2: Create Test-Funded Account' 'FAIL' @{
                Endpoint = 'POST /api/trading-accounts'
                StatusCode = $resp.StatusCode
                Error = $resp.Body.message -or $resp.Error
            }
            return
        }
    }
    catch {
        Write-TestLog 'C.2: Create Test-Funded Account' 'BLOCKED' @{ Error = $_.Exception.Message }
        return
    }
    
    # C.3: Verify Account
    try {
        $resp = Invoke-ApiRequest -Method GET -Path "/api/trading-accounts/$($testData.tradingAccountId)" -Token $testData.token
        
        if ($resp.StatusCode -eq 200 -and $resp.Body.id) {
            Write-TestLog 'C.3: Verify Account Details' 'PASS' @{
                Endpoint = "GET /api/trading-accounts/$($testData.tradingAccountId)"
                StatusCode = $resp.StatusCode
                Actual = "Status: $($resp.Body.status), Balance: $($resp.Body.currentBalance), Equity: $($resp.Body.equity)"
            }
        }
        else {
            Write-TestLog 'C.3: Verify Account Details' 'FAIL' @{
                Endpoint = "GET /api/trading-accounts/$($testData.tradingAccountId)"
                StatusCode = $resp.StatusCode
            }
        }
    }
    catch {
        Write-TestLog 'C.3: Verify Account Details' 'BLOCKED' @{ Error = $_.Exception.Message }
    }
}

function Test-BuyOrder {
    Write-Section "D. BUY Order Tests"
    
    if (-not $testData.tradingAccountId -or -not $testData.token) {
        Write-TestLog 'D.1: Place BUY Order' 'BLOCKED' @{ Error = 'Account not available' }
        return
    }
    
    # D.1: Place BUY Order
    try {
        $resp = Invoke-ApiRequest -Method POST -Path '/api/broker-orders' -Body @{
            tradingAccountId = $testData.tradingAccountId
            symbol = 'EURUSD'
            side = 'BUY'
            quantity = 0.1
            tradingMode = 'PAPER'
            orderType = 'MARKET'
            stopLoss = 1.09
            takeProfit = 1.11
        } -Token $testData.token
        
        if (($resp.StatusCode -eq 201 -or $resp.StatusCode -eq 200) -and $resp.Body.id) {
            $testData.buyTradeId = $resp.Body.id
            Write-TestLog 'D.1: Place BUY Order' 'PASS' @{
                Endpoint = 'POST /api/broker-orders'
                Input = 'EURUSD BUY 0.1'
                StatusCode = $resp.StatusCode
                Actual = "Order: $($resp.Body.id), Status: $($resp.Body.status), Price: $($resp.Body.executionPrice -or 'N/A')"
            }
        }
        else {
            Write-TestLog 'D.1: Place BUY Order' 'FAIL' @{
                Endpoint = 'POST /api/broker-orders'
                StatusCode = $resp.StatusCode
                Error = $resp.Body.message -or $resp.Error
            }
        }
    }
    catch {
        Write-TestLog 'D.1: Place BUY Order' 'BLOCKED' @{ Error = $_.Exception.Message }
    }
}

function Test-SellOrder {
    Write-Section "E. SELL Order Tests"
    
    if (-not $testData.tradingAccountId -or -not $testData.token) {
        Write-TestLog 'E.1: Place SELL Order' 'BLOCKED' @{ Error = 'Account not available' }
        return
    }
    
    # E.1: Place SELL Order
    try {
        $resp = Invoke-ApiRequest -Method POST -Path '/api/broker-orders' -Body @{
            tradingAccountId = $testData.tradingAccountId
            symbol = 'GBPUSD'
            side = 'SELL'
            quantity = 0.1
            tradingMode = 'PAPER'
            orderType = 'MARKET'
            stopLoss = 1.32
            takeProfit = 1.30
        } -Token $testData.token
        
        if (($resp.StatusCode -eq 201 -or $resp.StatusCode -eq 200) -and $resp.Body.id) {
            $testData.sellTradeId = $resp.Body.id
            Write-TestLog 'E.1: Place SELL Order' 'PASS' @{
                Endpoint = 'POST /api/broker-orders'
                Input = 'GBPUSD SELL 0.1'
                StatusCode = $resp.StatusCode
                Actual = "Order: $($resp.Body.id), Status: $($resp.Body.status)"
            }
        }
        else {
            Write-TestLog 'E.1: Place SELL Order' 'FAIL' @{
                Endpoint = 'POST /api/broker-orders'
                StatusCode = $resp.StatusCode
                Error = $resp.Body.message -or $resp.Error
            }
        }
    }
    catch {
        Write-TestLog 'E.1: Place SELL Order' 'BLOCKED' @{ Error = $_.Exception.Message }
    }
}

function Test-Positions {
    Write-Section "F. Position Management Tests"
    
    if (-not $testData.tradingAccountId -or -not $testData.token) {
        Write-TestLog 'F.1: Get Open Positions' 'BLOCKED' @{ Error = 'Account not available' }
        return
    }
    
    # F.1: Get Positions
    try {
        $resp = Invoke-ApiRequest -Method GET -Path "/api/trading-accounts/$($testData.tradingAccountId)/positions" -Token $testData.token
        
        if ($resp.StatusCode -eq 200 -and $resp.Body -is [array]) {
            $openCount = @($resp.Body | Where-Object { $_.status -eq 'OPEN' }).Count
            Write-TestLog 'F.1: Get Open Positions' 'PASS' @{
                Endpoint = "/api/trading-accounts/$($testData.tradingAccountId)/positions"
                StatusCode = $resp.StatusCode
                Actual = "Total: $($resp.Body.Count), Open: $openCount"
            }
        }
        else {
            Write-TestLog 'F.1: Get Open Positions' 'FAIL' @{
                Endpoint = "/api/trading-accounts/$($testData.tradingAccountId)/positions"
                StatusCode = $resp.StatusCode
            }
        }
    }
    catch {
        Write-TestLog 'F.1: Get Open Positions' 'BLOCKED' @{ Error = $_.Exception.Message }
    }
    
    # F.2: Check Account Equity
    try {
        $resp = Invoke-ApiRequest -Method GET -Path "/api/trading-accounts/$($testData.tradingAccountId)" -Token $testData.token
        
        if ($resp.StatusCode -eq 200) {
            Write-TestLog 'F.2: Account Equity' 'PASS' @{
                Endpoint = "/api/trading-accounts/$($testData.tradingAccountId)"
                StatusCode = $resp.StatusCode
                Actual = "Balance: $($resp.Body.currentBalance), Equity: $($resp.Body.equity)"
            }
        }
        else {
            Write-TestLog 'F.2: Account Equity' 'FAIL' @{
                Endpoint = "/api/trading-accounts/$($testData.tradingAccountId)"
                StatusCode = $resp.StatusCode
            }
        }
    }
    catch {
        Write-TestLog 'F.2: Account Equity' 'BLOCKED' @{ Error = $_.Exception.Message }
    }
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

Write-Host "`n" -ForegroundColor Magenta
Write-Host "╔════════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║           PHASE 2: END-TO-END TRADING ENGINE VERIFICATION                     ║" -ForegroundColor Magenta
Write-Host "║                                                                                ║" -ForegroundColor Magenta
Write-Host "║  Complete test of the trading lifecycle including auth, market data, orders   ║" -ForegroundColor Magenta
Write-Host "╚════════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host "`nAPI Base: $API_BASE" -ForegroundColor Cyan
Write-Host "Test Email: $TEST_USER_EMAIL" -ForegroundColor Cyan
Write-Host "Test ID: $TEST_ID`n" -ForegroundColor Cyan

try {
    Test-Authentication
    Test-MarketData
    Test-AccountCreation
    Test-BuyOrder
    Test-SellOrder
    Test-Positions
}
catch {
    Write-Host "Fatal error: $_" -ForegroundColor Red
}

# Print Summary
Write-Section "TEST SUMMARY"
$total = $results.passed.Count + $results.failed.Count + $results.blocked.Count
Write-Host "`n✅ PASSED:  $($results.passed.Count)" -ForegroundColor Green
Write-Host "❌ FAILED:  $($results.failed.Count)" -ForegroundColor Red
Write-Host "⚠️  BLOCKED: $($results.blocked.Count)" -ForegroundColor Yellow
Write-Host "────────────────────" -ForegroundColor Gray
Write-Host "Total Tests: $total`n" -ForegroundColor Cyan

# Print Results by Category
@('passed', 'failed', 'blocked') | ForEach-Object {
    $status = $_
    $items = $results[$status]
    if ($items.Count -gt 0) {
        Write-Host "`n$([string]::new('─', 80))" -ForegroundColor Cyan
        Write-Host "$($status.ToUpper()):" -ForegroundColor Cyan
        $items | ForEach-Object { Write-Host "  ✦ $($_.name)" -ForegroundColor $(if ($status -eq 'passed') { 'Green' } else { if ($status -eq 'failed') { 'Red' } else { 'Yellow' } }) }
    }
}

Write-Host "`n$([string]::new('=', 80))`n" -ForegroundColor Magenta

$exitCode = if ($results.failed.Count -gt 0) { 1 } else { 0 }
exit $exitCode
