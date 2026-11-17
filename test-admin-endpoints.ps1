# Test Admin Panel Endpoints After Prisma Fixes
$baseUrl = "http://localhost:3001/api"
Write-Host "Testing Admin Panel Endpoints..." -ForegroundColor Cyan
Write-Host ""

# Test 1: Admin Analytics
Write-Host "1. Testing Analytics Endpoint" -ForegroundColor Yellow
try {
    $uri = "${baseUrl}/api/admin/analytics?timeRange=30d"
    $response = Invoke-WebRequest -Uri $uri -Method GET -UseBasicParsing -ErrorAction Stop
    Write-Host "   Status: $($response.StatusCode)" -ForegroundColor Green
    $data = $response.Content | ConvertFrom-Json
    if ($data.popularPlans) {
        Write-Host "   popularPlans returned successfully" -ForegroundColor Green
        if ($data.popularPlans.Count -gt 0 -and $data.popularPlans[0].accountSize) {
            Write-Host "   accountSize field present (fixed from startingBalance)" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Admin Payouts
Write-Host "2. Testing Payouts Endpoint" -ForegroundColor Yellow
try {
    $uri = "${baseUrl}/api/admin/payouts?page=1`&limit=10"
    $response = Invoke-WebRequest -Uri $uri -Method GET -UseBasicParsing -ErrorAction Stop
    Write-Host "   Status: $($response.StatusCode)" -ForegroundColor Green
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   Total payouts: $($data.meta.total)" -ForegroundColor Green
    Write-Host "   No tradingAccount/reviewer errors" -ForegroundColor Green
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 3: Admin KYC
Write-Host "3. Testing KYC Endpoint" -ForegroundColor Yellow
try {
    $uri = "${baseUrl}/api/admin/kyc?page=1`&limit=10"
    $response = Invoke-WebRequest -Uri $uri -Method GET -UseBasicParsing -ErrorAction Stop
    Write-Host "   Status: $($response.StatusCode)" -ForegroundColor Green
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   Total submissions: $($data.meta.total)" -ForegroundColor Green
    Write-Host "   No reviewer errors" -ForegroundColor Green
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: Payout Stats
Write-Host "4. Testing Payout Stats" -ForegroundColor Yellow
try {
    $uri = "${baseUrl}/api/admin/payouts/stats"
    $response = Invoke-WebRequest -Uri $uri -Method GET -UseBasicParsing -ErrorAction Stop
    Write-Host "   Status: $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 5: KYC Stats
Write-Host "5. Testing KYC Stats" -ForegroundColor Yellow
try {
    $uri = "${baseUrl}/api/admin/kyc/stats"
    $response = Invoke-WebRequest -Uri $uri -Method GET -UseBasicParsing -ErrorAction Stop
    Write-Host "   Status: $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "Testing Complete!" -ForegroundColor Cyan
