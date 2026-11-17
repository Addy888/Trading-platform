# Test Script: Twelve Data Quote Endpoint
# Tests EUR/USD, GBP/USD, and USD/JPY quotes

$API_BASE = "http://localhost:3001/api"
$TEST_EMAIL = "quote_test_user_$(Get-Random)@test.local"
$TEST_PASSWORD = "Test123456!"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "TWELVE DATA QUOTE ENDPOINT TEST" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Register test user
Write-Host "[1/6] Registering test user..." -ForegroundColor Yellow
$registerBody = @{
    email = $TEST_EMAIL
    password = $TEST_PASSWORD
    firstName = "Quote"
    lastName = "Test"
} | ConvertTo-Json

try {
    $registerResponse = Invoke-RestMethod -Uri "$API_BASE/auth/register" -Method POST -Body $registerBody -ContentType "application/json"
    $userId = $registerResponse.user.id
    $accessToken = $registerResponse.accessToken
    Write-Host "  ✓ User registered: $userId" -ForegroundColor Green
    Write-Host "  ✓ Access token obtained" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Registration failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 2: Test Market Status
Write-Host "[2/6] Testing market status endpoint..." -ForegroundColor Yellow
try {
    $headers = @{
        Authorization = "Bearer $accessToken"
    }
    $statusResponse = Invoke-RestMethod -Uri "$API_BASE/market/status" -Method GET -Headers $headers
    Write-Host "  ✓ Market status: $($statusResponse.primaryProvider)" -ForegroundColor Green
    Write-Host "  ✓ Twelve Data configured: $($statusResponse.configuration.configured)" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Status check failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Step 3: Test EUR/USD Quote (Query Parameter)
Write-Host "[3/6] Testing EUR/USD quote (query parameter)..." -ForegroundColor Yellow
try {
    $headers = @{
        Authorization = "Bearer $accessToken"
    }
    $eurUsdResponse = Invoke-RestMethod -Uri "$API_BASE/market/quote?symbol=EUR/USD" -Method GET -Headers $headers
    Write-Host "  ✓ EUR/USD quote retrieved" -ForegroundColor Green
    Write-Host "    Symbol: $($eurUsdResponse.quote.symbol)" -ForegroundColor Gray
    Write-Host "    Price: $($eurUsdResponse.quote.price)" -ForegroundColor Gray
    Write-Host "    Timestamp: $($eurUsdResponse.quote.timestamp)" -ForegroundColor Gray
    $eurUsdPassed = $true
} catch {
    Write-Host "  ✗ EUR/USD quote failed: $($_.Exception.Message)" -ForegroundColor Red
    $eurUsdPassed = $false
}

Write-Host ""

# Step 4: Test GBP/USD Quote
Write-Host "[4/6] Testing GBP/USD quote..." -ForegroundColor Yellow
try {
    $headers = @{
        Authorization = "Bearer $accessToken"
    }
    $gbpUsdResponse = Invoke-RestMethod -Uri "$API_BASE/market/quote?symbol=GBP/USD" -Method GET -Headers $headers
    Write-Host "  ✓ GBP/USD quote retrieved" -ForegroundColor Green
    Write-Host "    Symbol: $($gbpUsdResponse.quote.symbol)" -ForegroundColor Gray
    Write-Host "    Price: $($gbpUsdResponse.quote.price)" -ForegroundColor Gray
    Write-Host "    Timestamp: $($gbpUsdResponse.quote.timestamp)" -ForegroundColor Gray
    $gbpUsdPassed = $true
} catch {
    Write-Host "  ✗ GBP/USD quote failed: $($_.Exception.Message)" -ForegroundColor Red
    $gbpUsdPassed = $false
}

Write-Host ""

# Step 5: Test USD/JPY Quote
Write-Host "[5/6] Testing USD/JPY quote..." -ForegroundColor Yellow
try {
    $headers = @{
        Authorization = "Bearer $accessToken"
    }
    $usdJpyResponse = Invoke-RestMethod -Uri "$API_BASE/market/quote?symbol=USD/JPY" -Method GET -Headers $headers
    Write-Host "  ✓ USD/JPY quote retrieved" -ForegroundColor Green
    Write-Host "    Symbol: $($usdJpyResponse.quote.symbol)" -ForegroundColor Gray
    Write-Host "    Price: $($usdJpyResponse.quote.price)" -ForegroundColor Gray
    Write-Host "    Timestamp: $($usdJpyResponse.quote.timestamp)" -ForegroundColor Gray
    $usdJpyPassed = $true
} catch {
    Write-Host "  ✗ USD/JPY quote failed: $($_.Exception.Message)" -ForegroundColor Red
    $usdJpyPassed = $false
}

Write-Host ""

# Step 6: Test Historical Candles (Regression)
Write-Host "[6/6] Testing historical candles (regression)..." -ForegroundColor Yellow
try {
    $headers = @{
        Authorization = "Bearer $accessToken"
    }
    $symbol = [System.Web.HttpUtility]::UrlEncode("EUR/USD")
    $candlesUrl = "$API_BASE/market/candles?symbol=$symbol" + '&interval=1h' + '&outputsize=10'
    $candlesResponse = Invoke-RestMethod -Uri $candlesUrl -Method GET -Headers $headers
    $candleCount = $candlesResponse.candles.Count
    Write-Host "  Success: Historical candles retrieved: $candleCount candles" -ForegroundColor Green
    Write-Host "    Data status: $($candlesResponse.metadata.dataStatus)" -ForegroundColor Gray
    Write-Host "    Age (minutes): $($candlesResponse.metadata.ageMinutes)" -ForegroundColor Gray
    $candlesPassed = $true
} catch {
    Write-Host "  Failed: Historical candles: $($_.Exception.Message)" -ForegroundColor Red
    $candlesPassed = $false
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "TEST RESULTS SUMMARY" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

$results = @(
    @{ Test = "EUR/USD Quote"; Result = $eurUsdPassed },
    @{ Test = "GBP/USD Quote"; Result = $gbpUsdPassed },
    @{ Test = "USD/JPY Quote"; Result = $usdJpyPassed },
    @{ Test = "Historical Candles"; Result = $candlesPassed }
)

foreach ($result in $results) {
    $status = if ($result.Result) { "PASS" } else { "FAIL" }
    $color = if ($result.Result) { "Green" } else { "Red" }
    Write-Host "$($result.Test): $status" -ForegroundColor $color
}

$totalPassed = ($results | Where-Object { $_.Result }).Count
$totalTests = $results.Count

Write-Host ""
Write-Host "Final Score: $totalPassed/$totalTests tests passed" -ForegroundColor $(if ($totalPassed -eq $totalTests) { "Green" } else { "Yellow" })
Write-Host ""

if ($totalPassed -eq $totalTests) {
    Write-Host "All tests PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "Some tests FAILED" -ForegroundColor Red
    exit 1
}
