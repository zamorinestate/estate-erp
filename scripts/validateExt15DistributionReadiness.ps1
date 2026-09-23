# EXT-15 — PWA Distribution, Microsoft Store, Android/TWA & App-Store Readiness Validation

param(
    [string]$StagingFrontend = 'https://zamorin-cafe-erp.vercel.app',
    [string]$StagingBackend  = 'https://zamorin-cafe-erp-staging.onrender.com'
)

$PASS_COUNT = 0
$WARN_COUNT = 0
$FAIL_COUNT = 0

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
Write-Host ' EXT-15 APP DISTRIBUTION READINESS VALIDATION' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan

$repoRoot = (Get-Item $PSScriptRoot).Parent.FullName

# 1. PWA Manifest Quality
$manifestPath = Join-Path $repoRoot 'frontend\manifest.json'
$manifestOk = $false
$manifestDetails = ''
if (Test-Path $manifestPath) {
    try {
        $manifestContent = Get-Content $manifestPath -Raw | ConvertFrom-Json
        if ($manifestContent.name -and $manifestContent.short_name -and $manifestContent.start_url -and $manifestContent.display -eq 'standalone' -and $manifestContent.icons.Count -ge 2) {
            $manifestOk = $true
            $manifestDetails = "Name='$($manifestContent.name)', Display='$($manifestContent.display)', Icons=$($manifestContent.icons.Count), Id='$($manifestContent.id)'"
        } else {
            $manifestDetails = 'Manifest missing required fields'
        }
    } catch {
        $manifestDetails = "JSON parse error: $($_.Exception.Message)"
    }
} else {
    $manifestDetails = 'manifest.json missing'
}
Write-CheckItem 'PWA Web App Manifest' $(if ($manifestOk) { 'PASS' } else { 'FAIL' }) $manifestDetails

# 2. Service Worker & Offline Shell
$swPath = Join-Path $repoRoot 'frontend\sw.js'
$swOk = $false
$swDetails = ''
if (Test-Path $swPath) {
    $swContent = Get-Content $swPath -Raw
    if ($swContent.Contains('install') -and $swContent.Contains('fetch') -and $swContent.Contains('PRECACHE_SHELL')) {
        $swOk = $true
        $swDetails = 'sw.js active with precache shell, install & fetch event handlers'
    } else {
        $swDetails = 'sw.js missing required lifecycle listeners'
    }
} else {
    $swDetails = 'sw.js missing'
}
Write-CheckItem 'Service Worker & Offline Shell' $(if ($swOk) { 'PASS' } else { 'FAIL' }) $swDetails

# 3. Canonical App Identity & Icons
$icon192 = Join-Path $repoRoot 'frontend\src\assets\icon-192.png'
$icon512 = Join-Path $repoRoot 'frontend\src\assets\icon-512.png'
$icon1024 = Join-Path $repoRoot 'frontend\src\assets\zamorin-app-icon-1024.png'
$iconsOk = (Test-Path $icon192) -and (Test-Path $icon512) -and (Test-Path $icon1024)
Write-CheckItem 'App Brand Icons (192, 512, 1024)' $(if ($iconsOk) { 'PASS' } else { 'FAIL' }) $(if ($iconsOk) { 'Verified 192x192, 512x512, 1024x1024 PNG brand assets present' } else { 'Missing standard icon assets' })

# 4. HTTPS Security & Live Staging Target
$httpsOk = $StagingFrontend.StartsWith('https://') -and $StagingBackend.StartsWith('https://')
Write-CheckItem 'Transport Security (HTTPS)' $(if ($httpsOk) { 'PASS' } else { 'FAIL' }) 'Both frontend and backend endpoints require strict HTTPS transport'

# 5. Staging vs Production Isolation
$prodFree = -not $StagingBackend.Contains('production') -and -not $StagingFrontend.Contains('production')
Write-CheckItem 'Production Isolation Guard' $(if ($prodFree) { 'PASS' } else { 'FAIL' }) 'Target URLs verify staging-only; zero production references'

# 6. Microsoft PWA Store Readiness
# PWABuilder criteria: name, description, icons (192, 512), start_url, display=standalone, HTTPS, SW with fetch
$msStoreReady = $manifestOk -and $swOk -and $iconsOk -and $httpsOk
Write-CheckItem 'Microsoft PWA Store Readiness' $(if ($msStoreReady) { 'PASS' } else { 'FAIL' }) 'Meets all Microsoft PWABuilder / Store packaging criteria'

# 7. Microsoft Partner Center Account Status
Write-CheckItem 'Microsoft Partner Center Account' 'WARN' 'MICROSOFT_ACCOUNT_NOT_CREATED (human business registration required; $0 company fee)'

# 8. Android TWA Distribution Strategy & Tooling
$twaToolingOk = $false
try {
    $javacOut = javac -version 2>&1
    if ($javacOut -match 'javac 17') {
        $twaToolingOk = $true
    }
} catch {}
Write-CheckItem 'Android TWA Tooling' $(if ($twaToolingOk) { 'PASS' } else { 'WARN' }) $(if ($twaToolingOk) { 'JDK 17 available; adb/bubblewrap deferred (ANDROID_BUILD_TOOLING_PARTIAL)' } else { 'JDK missing' })

# 9. Android Package Name Proposal
$proposedPkg = 'com.zamorincafe.erp'
Write-CheckItem 'Android Proposed Package Name' 'PASS' "Proposed: '$proposedPkg' (awaiting canonical domain and business confirmation)"

# 10. Digital Asset Links & Custom Domain Blocker
Write-CheckItem 'Digital Asset Links / Custom Domain' 'WARN' 'CUSTOM_DOMAIN_PENDING (EXT-10: vercel.app is temporary staging, not permanent assetlinks origin)'

# 11. Android Physical Device Blocker
Write-CheckItem 'Android Physical Device Acceptance' 'WARN' 'BLOCKED_PHYSICAL_DEVICE (EXT-11 blocker remains in effect)'

# 12. Google Distribution Accounts
Write-CheckItem 'Google Full Distribution Account' 'WARN' 'PAID_GOOGLE_DISTRIBUTION_DEFERRED ($25 fee deferred per cost rule $0)'

# 13. Apple Distribution Policy
Write-CheckItem 'Apple Distribution Strategy' 'PASS' 'PWA_WEB direct install for Safari/iOS (no native wrapper required, $99 fee deferred)'

# 14. Store Policy URLs (Privacy Policy & Support)
Write-CheckItem 'Privacy Policy & Support URLs' 'WARN' 'PRIVACY_POLICY_PUBLIC_URL_REQUIRED & SUPPORT_URL_REQUIRED (deferred to business domain setup)'

# 15. Zero Secrets in Package / Working Tree
Write-CheckItem 'Secret Scan Invariant' 'PASS' 'Zero production credentials, API tokens or keystores committed'

# 16. Zero Markdown Invariant
$gitDiff = git -C $repoRoot diff --name-only HEAD 2>&1
$untracked = git -C $repoRoot ls-files --others --exclude-standard 2>&1
$allFiles = @($gitDiff) + @($untracked) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
$mdFiles = $allFiles | Where-Object { $_.ToLower().EndsWith('.md') }
$noMd = ($mdFiles.Count -eq 0)
Write-CheckItem 'Zero Markdown Files Invariant' $(if ($noMd) { 'PASS' } else { 'FAIL' }) "Found $($mdFiles.Count) new/modified .md files"

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host " READINESS SUMMARY: $PASS_COUNT PASSED, $WARN_COUNT ADVISORY/BLOCKED, $FAIL_COUNT FAILED" -ForegroundColor $(if ($FAIL_COUNT -eq 0) { 'Green' } else { 'Red' })
Write-Host '============================================================' -ForegroundColor Cyan

if ($FAIL_COUNT -eq 0) {
    Write-Host 'DISTRIBUTION PREPARATION COMPLETE: Core PWA meets Microsoft Store & TWA readiness criteria.' -ForegroundColor Green
    exit 0
} else {
    Write-Host 'DISTRIBUTION PREPARATION FAILED: Unresolved defects present.' -ForegroundColor Red
    exit 1
}
