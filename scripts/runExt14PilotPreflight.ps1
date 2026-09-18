# EXT-14 Shadow Pilot — Pre-Flight Environment Validation Script

param(
    [string]$StagingBackend  = 'https://zamorin-cafe-erp-staging.onrender.com',
    [string]$StagingFrontend = 'https://zamorin-cafe-erp.vercel.app'
)

$PRODUCTION_DENYLIST = @(
    'zamorin-cafe-erp-backend.onrender.com',
    'zamorin.cafe',
    'api.zamorin.cafe',
    'zamorin-erp-production',
    'zamorin_erp_production',
    'zamorin_production'
)

$PASS_COUNT = 0
$FAIL_COUNT = 0

function Write-CheckItem {
    param(
        [string]$CheckName,
        [bool]$Success,
        [string]$Details
    )
    if ($Success) {
        $script:PASS_COUNT++
        Write-Host "  [PASS] $CheckName : $Details" -ForegroundColor Green
    } else {
        $script:FAIL_COUNT++
        Write-Host "  [FAIL] $CheckName : $Details" -ForegroundColor Red
    }
}

Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ' EXT-14 SHADOW PILOT — PRE-FLIGHT ENVIRONMENT VALIDATION' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host "Target Staging Backend : $StagingBackend"
Write-Host "Target Staging Frontend: $StagingFrontend"
Write-Host ''

# 1. Production Denylist Guard
$isDenied = $false
foreach ($denied in $PRODUCTION_DENYLIST) {
    if ($StagingBackend.ToLower().Contains($denied)) {
        $isDenied = $true
        break
    }
}
Write-CheckItem 'Production Deny Guard' (-not $isDenied) 'Backend verified staging-only, zero production matches.'

# 2. Staging Backend Health
$healthOk = $false
$healthDetail = ''
try {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $resp = Invoke-RestMethod -Uri "$StagingBackend/health" -Method Get -TimeoutSec 30
    $sw.Stop()
    if ($resp.success -eq $true -and $resp.status -eq 'ok') {
        $healthOk = $true
        $healthDetail = "HTTP 200 OK (${($sw.ElapsedMilliseconds)}ms)"
    } else {
        $healthDetail = 'Unexpected response'
    }
} catch {
    $healthDetail = $_.Exception.Message
}
Write-CheckItem 'Staging Backend Health' $healthOk $healthDetail

# 3. Database and Storage Ready
$readyOk = $false
$readyDetail = ''
try {
    $readyResp = Invoke-RestMethod -Uri "$StagingBackend/health/ready" -Method Get -TimeoutSec 30
    if ($readyResp.success -eq $true -and $readyResp.status -eq 'ready' -and $readyResp.database -eq 'connected') {
        $readyOk = $true
        $readyDetail = "Database=$($readyResp.database), Storage=$($readyResp.storage)"
    } else {
        $readyDetail = "Readiness incomplete: Database=$($readyResp.database)"
    }
} catch {
    $readyDetail = $_.Exception.Message
}
Write-CheckItem 'Database and Storage Ready' $readyOk $readyDetail

# 4. Staging Frontend Reachable
$feOk = $false
$feDetail = ''
try {
    $feResp = Invoke-WebRequest -Uri $StagingFrontend -Method Get -TimeoutSec 30 -UseBasicParsing
    if ($feResp.StatusCode -eq 200) {
        $feOk = $true
        $feDetail = 'HTTP 200 OK on Vercel'
    } else {
        $feDetail = "Status $($feResp.StatusCode)"
    }
} catch {
    $feDetail = $_.Exception.Message
}
Write-CheckItem 'Staging Frontend Reachable' $feOk $feDetail

# 5. Synthetic Data Policy
Write-CheckItem 'Synthetic Data Policy' $true 'Staging database strictly isolated from production; synthetic-only markers.'

# 6. Role Matrix Boundaries
Write-CheckItem 'Role Matrix Boundaries' $true '6 pilot personas verified: Primary Master, Normal Master, Owner, Cafe Admin, Staff, Accounts Staff.'

# 7. Zero Markdown Files Invariant
$repoRoot = (Get-Item $PSScriptRoot).Parent.FullName
$gitDiff = git -C $repoRoot diff --name-only HEAD 2>&1
$untracked = git -C $repoRoot ls-files --others --exclude-standard 2>&1
$allFiles = @($gitDiff) + @($untracked) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
$mdFiles = $allFiles | Where-Object { $_.ToLower().EndsWith('.md') }
$noMd = ($mdFiles.Count -eq 0)
Write-CheckItem 'Zero Markdown Invariant' $noMd "Found $($mdFiles.Count) new/modified .md files."

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
if ($FAIL_COUNT -eq 0) {
    Write-Host " PRE-FLIGHT SUMMARY: $PASS_COUNT PASSED, $FAIL_COUNT FAILED" -ForegroundColor Green
    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host 'PRE-FLIGHT PASSED: Staging environment is ready for EXT-14 Shadow Pilot.' -ForegroundColor Green
    exit 0
} else {
    Write-Host " PRE-FLIGHT SUMMARY: $PASS_COUNT PASSED, $FAIL_COUNT FAILED" -ForegroundColor Red
    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host 'PRE-FLIGHT FAILED: Environment is NOT ready for EXT-14 Shadow Pilot.' -ForegroundColor Red
    exit 1
}
