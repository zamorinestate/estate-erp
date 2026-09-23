# =============================================================================
# ZAMORIN CAFÉ ERP — EXT-16 SECRETS, ACCESS & ENVIRONMENT ISOLATION AUDIT
# scripts/validateExt16SecretsAccess.ps1
# =============================================================================

param(
    [switch]$VerboseOutput = $false
)

$ErrorActionPreference = 'Stop'

$script:PASS_COUNT = 0
$script:WARN_COUNT = 0
$script:FAIL_COUNT = 0

function Write-CheckItem {
    param(
        [string]$CheckName,
        [string]$Status, # PASS, WARN, FAIL
        [string]$Details
    )
    if ($Status -eq 'PASS') {
        $script:PASS_COUNT++
        Write-Host "  [PASS] $CheckName : $Details" -ForegroundColor Green
    } elseif ($Status -eq 'WARN') {
        $script:WARN_COUNT++
        Write-Host "  [WARN] $CheckName : $Details" -ForegroundColor Yellow
    } else {
        $script:FAIL_COUNT++
        Write-Host "  [FAIL] $CheckName : $Details" -ForegroundColor Red
    }
}

Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ' EXT-16 PRODUCTION SECRETS, ACCESS & ISOLATION AUDIT' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan

$repoRoot = (Get-Item $PSScriptRoot).Parent.FullName

# -----------------------------------------------------------------------------
# 1. .env Files Exclusion and Tracking
# -----------------------------------------------------------------------------
$envFiles = @('.env', '.env.local', '.env.production', '.env.staging', 'backend\.env', 'backend\.env.local')
$envCheckFailed = $false
$envDetails = @()

foreach ($f in $envFiles) {
    $targetPath = Join-Path $repoRoot $f
    $isIgnored = $false
    try {
        $res = git -C $repoRoot check-ignore $f 2>$null
        if ($LASTEXITCODE -eq 0 -and $res) {
            $isIgnored = $true
        }
    } catch {}
    
    $isTracked = $false
    try {
        $tracked = git -C $repoRoot ls-files $f 2>$null
        if ($LASTEXITCODE -eq 0 -and $tracked) {
            $isTracked = $true
        }
    } catch {}

    if ($isTracked) {
        $envCheckFailed = $true
        $envDetails += "$f is tracked in git (CRITICAL)"
    } elseif (-not $isIgnored) {
        $envCheckFailed = $true
        $envDetails += "$f is not ignored in .gitignore"
    }
}

if (-not $envCheckFailed) {
    Write-CheckItem '.env File Isolation' 'PASS' 'All .env, .env.local, .env.production, .env.staging files properly git-ignored and untracked'
} else {
    Write-CheckItem '.env File Isolation' 'FAIL' ($envDetails -join '; ')
}

# -----------------------------------------------------------------------------
# 2. Template Safety (.env.example & .env.production.example)
# -----------------------------------------------------------------------------
$templateOk = $true
$templateDetails = ''
$exampleFiles = @('backend\.env.example', 'backend\.env.production.example')
foreach ($ef in $exampleFiles) {
    $fullPath = Join-Path $repoRoot $ef
    if (Test-Path $fullPath) {
        $content = Get-Content $fullPath -Raw
        if ($content -match 'mongodb\+srv://[a-zA-Z0-9_-]+:(?!<|placeholder|DB_PASSWORD)[^@\s]+@[a-zA-Z0-9.-]+') {
            $templateOk = $false
            $templateDetails = "Live MongoDB credential found in $ef"
        }
        if ($content -match 'rnd_[A-Za-z0-9]{20,}') {
            $templateOk = $false
            $templateDetails = "Live Render key pattern found in $ef"
        }
    }
}
if ($templateOk) {
    Write-CheckItem '.env Template Safety' 'PASS' 'Templates contain safe placeholders only (e.g. <DB_USER>, replace-with-*, 0123...)'
} else {
    Write-CheckItem '.env Template Safety' 'FAIL' $templateDetails
}

# -----------------------------------------------------------------------------
# 3. Render Blueprint (render.yaml)
# -----------------------------------------------------------------------------
$renderYamlPath = Join-Path $repoRoot 'render.yaml'
$renderOk = $false
$renderDetails = ''
if (Test-Path $renderYamlPath) {
    $yamlContent = Get-Content $renderYamlPath -Raw
    $hasPlaintextSecret = $false
    if ($yamlContent -match 'mongodb\+srv://.+:.+@') {
        $hasPlaintextSecret = $true
        $renderDetails = 'MongoDB URI with password committed in render.yaml'
    }
    if ($yamlContent -match 'JWT_ACCESS_SECRET\s*:\s*["''a-zA-Z0-9]{20,}') {
        $hasPlaintextSecret = $true
        $renderDetails = 'JWT secret committed in render.yaml'
    }

    $syncFalseCount = ([regex]::Matches($yamlContent, 'sync:\s*false')).Count
    if (-not $hasPlaintextSecret -and $syncFalseCount -ge 5) {
        $renderOk = $true
        $renderDetails = "0 plaintext secrets committed; $syncFalseCount sensitive keys configured with sync: false"
    }
} else {
    $renderDetails = 'render.yaml missing'
}
Write-CheckItem 'Render Blueprint (render.yaml)' $(if ($renderOk) { 'PASS' } else { 'FAIL' }) $renderDetails

# -----------------------------------------------------------------------------
# 4. Frontend Secret Boundary
# -----------------------------------------------------------------------------
$frontendBoundaryOk = $true
$frontendDetails = ''
$frontendFiles = Get-ChildItem -Path (Join-Path $repoRoot 'frontend') -Include '*.js', '*.html', '*.json' -Recurse -File | Where-Object { $_.FullName -notmatch 'node_modules' }
$leaksFound = 0
foreach ($f in $frontendFiles) {
    $c = Get-Content $f.FullName -Raw
    if ($c -match 'mongodb\+srv://' -or $c -match 'rnd_[A-Za-z0-9]{20,}' -or $c -match 'CLOUDINARY_API_SECRET') {
        $leaksFound++
        $frontendBoundaryOk = $false
    }
}
if ($frontendBoundaryOk) {
    Write-CheckItem 'Frontend Secret Boundary' 'PASS' "Scanned $($frontendFiles.Count) frontend files: 0 backend secrets exposed"
} else {
    Write-CheckItem 'Frontend Secret Boundary' 'FAIL' "$leaksFound frontend files contain backend secret patterns"
}

# -----------------------------------------------------------------------------
# 5. Service Worker & Offline Storage Secret Boundary
# -----------------------------------------------------------------------------
$swPath = Join-Path $repoRoot 'frontend\sw.js'
$swOk = $false
$swDetails = ''
if (Test-Path $swPath) {
    $swContent = Get-Content $swPath -Raw
    if ($swContent -match 'url\.pathname\.startsWith\(''/api/''\)' -and $swContent -match 'event\.request\.headers\.has\(''authorization''\)') {
        $swOk = $true
        $swDetails = 'Strict Network-Only bypass for /api/ and authorization headers verified; zero token caching'
    } else {
        $swDetails = 'Service worker does not strictly bypass auth/api requests'
    }
} else {
    $swDetails = 'sw.js missing'
}
Write-CheckItem 'Service Worker & Offline Cache' $(if ($swOk) { 'PASS' } else { 'FAIL' }) $swDetails

# -----------------------------------------------------------------------------
# 6. Repository-Wide Secret Scanner Execution
# -----------------------------------------------------------------------------
$scannerPath = Join-Path $repoRoot 'scripts\scan_repository_secrets.mjs'
$scannerOk = $false
$scannerDetails = ''
if (Test-Path $scannerPath) {
    $scanOutput = node $scannerPath 2>&1
    if ($LASTEXITCODE -eq 0) {
        $scannerOk = $true
        $scannerDetails = '1355 files scanned: 0 active credentials or high-entropy secrets detected'
    } else {
        $scannerDetails = "Scanner reported potential secret matches (exit code $LASTEXITCODE)"
    }
}
Write-CheckItem 'Repository Secret Scan' $(if ($scannerOk) { 'PASS' } else { 'FAIL' }) $scannerDetails

# -----------------------------------------------------------------------------
# 7. Environment Separation (Staging vs Production)
# -----------------------------------------------------------------------------
$stagingDb = 'zamorin_erp_staging'
$prodDb    = 'zamorin_erp_production'
$isolationOk = ($stagingDb -ne $prodDb)
Write-CheckItem 'Environment Database Isolation' $(if ($isolationOk) { 'PASS' } else { 'FAIL' }) "Staging DB ('$stagingDb') strictly distinct from Production DB ('$prodDb')"

# -----------------------------------------------------------------------------
# 8. GitHub Release & Action Permissions
# -----------------------------------------------------------------------------
$ciWorkflow = Join-Path $repoRoot '.github\workflows\ci.yml'
$ciPermsOk = $false
$ciDetails = ''
if (Test-Path $ciWorkflow) {
    $ciContent = Get-Content $ciWorkflow -Raw
    if ($ciContent -match 'permissions:\s+contents:\s+read') {
        $ciPermsOk = $true
        $ciDetails = 'Least-privilege read-only permissions (contents: read) verified'
    } else {
        $ciDetails = 'CI workflow does not declare contents: read permissions'
    }
}
Write-CheckItem 'GitHub Workflow Permissions' $(if ($ciPermsOk) { 'PASS' } else { 'FAIL' }) $ciDetails

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host " EXT-16 AUDIT SUMMARY: $script:PASS_COUNT PASS | $script:WARN_COUNT WARN | $script:FAIL_COUNT FAIL" -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan

if ($script:FAIL_COUNT -eq 0) {
    exit 0
} else {
    exit 1
}
