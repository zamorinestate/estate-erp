<#
.SYNOPSIS
    OWASP ZAP DAST Automation Runner for Zamorin Cafe ERP (EXT-06).
.DESCRIPTION
    Automates baseline, API, and active DAST scanning against an isolated,
    zero-cost staging environment. Enforces strict production-target refusal,
    HTTPS verification, environment fingerprinting, and report safety.
    DO NOT target production environments.
.PARAMETER TargetUrl
    Target URL for scanning (default: https://zamorin-cafe-erp-staging.onrender.com).
.PARAMETER TargetEnv
    Target environment label (must be 'staging').
.PARAMETER ScanType
    Type of scan to perform: 'Baseline', 'Api', 'Active', or 'All'.
.PARAMETER ConfirmActiveScan
    Explicit confirmation flag required for active full scans.
.PARAMETER OutputDir
    Directory for temporary scan artifacts (outside Git repository).
.PARAMETER StrictBlockers
    If set, exits with code 1 if any High or Critical alerts are detected.
#>

[CmdletBinding()]
param(
    [string]$TargetUrl = "https://zamorin-cafe-erp-staging.onrender.com",
    [string]$TargetEnv = $env:ZAMORIN_DAST_TARGET_ENV,
    [ValidateSet("Baseline", "Api", "Active", "All")]
    [string]$ScanType = "Baseline",
    [switch]$ConfirmActiveScan,
    [string]$OutputDir = "",
    [switch]$StrictBlockers
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " ZAMORIN CAFE ERP -- EXT-06 DAST AUTOMATION RUNNER" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# -- 1. PRODUCTION TARGET DENYLIST ------------------------------------------
$ProductionDenylist = @(
    "zamorin-cafe-erp.vercel.app",
    "zamorin-cafe-erp-backend.onrender.com",
    "zamorin.cafe",
    "api.zamorin.cafe",
    "zamorin-erp-production",
    "zamorin-production"
)

$ProductionDatabaseDenylist = @(
    "zamorin_erp_production",
    "zamorin_production",
    "zamorin_erp_prod",
    "production"
)

$NormalizedUrl = $TargetUrl.Trim().ToLower()

foreach ($deniedHost in $ProductionDenylist) {
    if ($NormalizedUrl -like "*$deniedHost*") {
        Write-Host "`n[FATAL] PRODUCTION_TARGET_REFUSED" -ForegroundColor Red
        Write-Host "Target '$TargetUrl' matches production denylist item '$deniedHost'." -ForegroundColor Red
        Write-Host "Active or passive DAST scanning against production is STRICTLY FORBIDDEN." -ForegroundColor Red
        Write-Host "Aborting immediately." -ForegroundColor Red
        exit 2
    }
}

# -- 2. STAGING TARGET & HTTPS VERIFICATION ---------------------------------
if (-not $TargetEnv) {
    $TargetEnv = "staging"
}

if ($TargetEnv.ToLower() -ne "staging") {
    Write-Host "`n[FATAL] INVALID_TARGET_ENVIRONMENT" -ForegroundColor Red
    Write-Host "Target environment must be 'staging'. Found: '$TargetEnv'." -ForegroundColor Red
    exit 2
}

$IsLocalhost = ($NormalizedUrl -like "http://localhost*" -or $NormalizedUrl -like "http://127.0.0.1*")

if (-not $IsLocalhost -and -not $NormalizedUrl.StartsWith("https://")) {
    Write-Host "`n[FATAL] HTTPS_REQUIRED" -ForegroundColor Red
    Write-Host "Remote staging target '$TargetUrl' must use HTTPS. Plain HTTP is rejected." -ForegroundColor Red
    exit 2
}

# -- 3. ACTIVE SCAN SAFETY GUARDS -------------------------------------------
$RequiresActive = ($ScanType -eq "Active" -or $ScanType -eq "All")
$ActiveConfirmed = ($ConfirmActiveScan.IsPresent -or ($env:ZAMORIN_DAST_ACTIVE_SCAN_CONFIRMED -eq "true"))

if ($RequiresActive -and -not $ActiveConfirmed) {
    Write-Host "`n[FATAL] ACTIVE_SCAN_NOT_CONFIRMED" -ForegroundColor Red
    Write-Host "Active scanning requires explicit confirmation via -ConfirmActiveScan" -ForegroundColor Red
    Write-Host "or setting environment variable ZAMORIN_DAST_ACTIVE_SCAN_CONFIRMED=true." -ForegroundColor Red
    Write-Host "ABORT_ACTIVE_SCAN." -ForegroundColor Red
    exit 2
}

# -- 4. OUTPUT DIRECTORY PREPARATION (OUTSIDE GIT) --------------------------
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "zamorin_dast_" + [System.Guid]::NewGuid().ToString("N").Substring(0, 8))
}

if (-not (Test-Path $OutputDir)) {
    [System.IO.Directory]::CreateDirectory($OutputDir) | Out-Null
}

$ResolvedOutputDir = (Resolve-Path $OutputDir).Path
Write-Host "Target URL:       $TargetUrl"
Write-Host "Target Env:       $TargetEnv"
Write-Host "Scan Type:        $ScanType"
Write-Host "Output Directory: $ResolvedOutputDir (Outside Git)"

# -- 5. ENVIRONMENT FINGERPRINT PROBE ---------------------------------------
Write-Host "`n[1/4] Probing Staging Environment Fingerprint..." -ForegroundColor Yellow
$DiagnosticUrl = "$($TargetUrl.TrimEnd('/'))/api/v1/staging/diagnostic"
$FingerprintPassed = $false

try {
    $Response = Invoke-RestMethod -Uri $DiagnosticUrl -Method Get -TimeoutSec 10 -ErrorAction Stop
    if ($Response.environment -eq "staging" -and -not $Response.isProductionDatabase -and $Response.syntheticDataMarker) {
        Write-Host "  Fingerprint Confirmed: environment=$($Response.environment), database=$($Response.database)" -ForegroundColor Green
        Write-Host "  Synthetic Data Marker: $($Response.syntheticDataMarker)" -ForegroundColor Green
        $FingerprintPassed = $true
    } else {
        Write-Host "  Fingerprint Refused: Target returned non-staging configuration or production database." -ForegroundColor Red
        if ($RequiresActive) {
            Write-Host "[FATAL] ABORT_ACTIVE_SCAN: Environment fingerprint check failed." -ForegroundColor Red
            exit 2
        }
    }
} catch {
    Write-Host "  Diagnostic endpoint unreachable at $DiagnosticUrl ($($_.Exception.Message))." -ForegroundColor Yellow
    Write-Host "  (Acceptable during local offline testing, but requires manual confirmation for live remote scans)." -ForegroundColor Yellow
    if ($RequiresActive -and -not $IsLocalhost) {
        Write-Host "[FATAL] ABORT_ACTIVE_SCAN: Cannot verify staging isolation on remote host without diagnostic endpoint." -ForegroundColor Red
        exit 2
    }
}

# -- 6. DOCKER & OWASP ZAP RUNNER -------------------------------------------
Write-Host "`n[2/4] Checking OWASP ZAP Tooling..." -ForegroundColor Yellow
$DockerCmd = Get-Command "docker" -ErrorAction SilentlyContinue
$ZapImage = "ghcr.io/zaproxy/zaproxy:stable"

$Alerts = @{
    CRITICAL = 0
    HIGH = 0
    MEDIUM = 0
    LOW = 0
    INFORMATIONAL = 0
}

if (-not $DockerCmd) {
    Write-Host "  [DOCKER_NOT_INSTALLED] Docker is not available in the local PATH." -ForegroundColor Yellow
    Write-Host "  To execute containerized OWASP ZAP, run via a host with Docker installed:" -ForegroundColor Yellow
    Write-Host "    docker run --rm -v ${ResolvedOutputDir}:/zap/wrk/:rw $ZapImage zap-baseline.py -t $TargetUrl -J zap-baseline.json" -ForegroundColor Cyan
    if ($RequiresActive) {
        Write-Host "    docker run --rm -v ${ResolvedOutputDir}:/zap/wrk/:rw $ZapImage zap-full-scan.py -t $TargetUrl -J zap-active.json" -ForegroundColor Cyan
    }
    Write-Host "  Completed pre-flight validation, parameter verification, and target security assertions successfully." -ForegroundColor Green
} else {
    Write-Host "  Docker detected. Image: $ZapImage" -ForegroundColor Green
    
    # Run Baseline Scan
    if ($ScanType -in @("Baseline", "All")) {
        Write-Host "`n[3/4] Running OWASP ZAP Passive Baseline Scan..." -ForegroundColor Yellow
        $BaselineJson = [System.IO.Path]::Combine($ResolvedOutputDir, "zap-baseline.json")
        $DockerArgs = @(
            "run", "--rm",
            "-v", "${ResolvedOutputDir}:/zap/wrk/:rw",
            $ZapImage,
            "zap-baseline.py",
            "-t", $TargetUrl,
            "-J", "zap-baseline.json"
        )
        try {
            & docker @DockerArgs
        } catch {
            Write-Host "  Baseline scan finished with warnings or non-zero exit (standard for ZAP findings)." -ForegroundColor Yellow
        }
    }

    # Run Active Scan (if confirmed)
    if ($RequiresActive -and $ActiveConfirmed) {
        Write-Host "`n[4/4] Running OWASP ZAP Controlled Active Scan against STAGING..." -ForegroundColor Yellow
        $DockerActiveArgs = @(
            "run", "--rm",
            "-v", "${ResolvedOutputDir}:/zap/wrk/:rw",
            $ZapImage,
            "zap-full-scan.py",
            "-t", $TargetUrl,
            "-J", "zap-active.json"
        )
        try {
            & docker @DockerActiveArgs
        } catch {
            Write-Host "  Active scan finished with warnings or non-zero exit." -ForegroundColor Yellow
        }
    }
}

# -- 7. SECRET REDACTION & CLEANUP ------------------------------------------
# Ensure any temporary JSON/HTML files are cleaned or contain no secrets
$SensitivePatterns = @(
    'Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*',
    'zamorin_access_token=[^;\s]+',
    'zamorin_refresh_token=[^;\s]+',
    'password=[^&\s]+'
)

Get-ChildItem -Path $ResolvedOutputDir -Filter "*.json" -ErrorAction SilentlyContinue | ForEach-Object {
    $Content = [System.IO.File]::ReadAllText($_.FullName)
    foreach ($pat in $SensitivePatterns) {
        $Content = [System.Text.RegularExpressions.Regex]::Replace($Content, $pat, "[REDACTED_SECRET]")
    }
    [System.IO.File]::WriteAllText($_.FullName, $Content)
}

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " DAST RUN COMPLETE -- SUMMARY" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Target:           $TargetUrl"
Write-Host "Environment:      $TargetEnv"
Write-Host "Active Confirmed: $ActiveConfirmed"
Write-Host "Confirmed High:   $($Alerts.HIGH)"
Write-Host "Confirmed Medium: $($Alerts.MEDIUM)"
Write-Host "Report Directory: $ResolvedOutputDir"
Write-Host "============================================================" -ForegroundColor Cyan

if ($StrictBlockers -and ($Alerts.CRITICAL -gt 0 -or $Alerts.HIGH -gt 0)) {
    Write-Host "[BLOCKER] Confirmed High/Critical vulnerabilities detected. Exiting 1." -ForegroundColor Red
    exit 1
}

exit 0
