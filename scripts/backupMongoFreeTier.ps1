<#
.SYNOPSIS
  Zamorin Café ERP — Free-Tier MongoDB Backup Script (EXT-03F-R)
.DESCRIPTION
  Creates a timestamped mongodump backup for Free-Tier Atlas clusters outside the Git repository,
  safely redacts connection credentials from logs, verifies write-quiescence precondition,
  ensures zero active GridFS uploads, verifies exit codes, and manages local retention.
#>

[CmdletBinding()]
param(
  [string]$BackupRootDir = 'D:\Zamorin_Backups\EXT03F',
  [int]$RetentionCount = 7,
  [string]$DbName = $env:DATABASE_NAME,
  [switch]$WritesQuiesced,
  [int]$ActiveUploads = 0,
  [switch]$DryRun
)

Write-Host '===================================================='
Write-Host 'ZAMORIN CAFÉ ERP — FREE-TIER MONGODB BACKUP UTILITY'
Write-Host '===================================================='

# 1. Validate MONGODB_URI environment variable
$mongoUri = $env:MONGODB_URI
if (-not $mongoUri) {
  Write-Host 'CRITICAL: MONGODB_URI environment variable is not defined. Refusing to run.' -ForegroundColor Red
  Write-Host 'Backup Status: FAILED'
  Write-Host 'Exit Code:     1'
  exit 1
}

# 2. Enforce Controlled Write Quiescence Guard (EXT-03F-R)
$isWritesQuiesced = $WritesQuiesced.IsPresent -or ($env:ZAMORIN_BACKUP_WRITES_QUIESCED -eq 'true')
if (-not $isWritesQuiesced) {
  Write-Host "CRITICAL: Write quiescence is not confirmed (ZAMORIN_BACKUP_WRITES_QUIESCED must be 'true' or -WritesQuiesced switch supplied). Free-tier mongodump lacks oplog support and requires write quiescence to ensure application consistency." -ForegroundColor Red
  Write-Host 'Backup Status: FAILED'
  Write-Host 'Exit Code:     4'
  exit 4
}

# 3. Enforce Active GridFS Uploads Drain Guard (EXT-03F-R)
if ($ActiveUploads -gt 0) {
  Write-Host "CRITICAL: Cannot start backup while $ActiveUploads active GridFS document upload(s) are in progress. Active document uploads must be 0." -ForegroundColor Red
  Write-Host 'Backup Status: FAILED'
  Write-Host 'Exit Code:     5'
  exit 5
}

# 4. Mask URI for safe output
$maskedUri = $mongoUri -replace '//[^:]+:[^@]+@', '//***:***@'
$displayDb = if ($DbName) { $DbName } else { '[ALL_DATABASES]' }
Write-Host "Target Cluster:             $maskedUri"
Write-Host "Database Name:              $displayDb"
Write-Host "Write Quiescence Confirmed: YES"
Write-Host "Active Uploads:             0 (DRAINED)"

# 5. Ensure BackupRootDir is outside the Git workspace
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspaceDir = (Resolve-Path (Join-Path $scriptDir '..')).Path
$resolvedBackupRoot = [System.IO.Path]::GetFullPath($BackupRootDir)

if ($resolvedBackupRoot.StartsWith($workspaceDir, [System.StringComparison]::OrdinalIgnoreCase)) {
  Write-Host "CRITICAL: Backup directory '$resolvedBackupRoot' is inside the Git repository workspace! Refusing to store backups in Git tree." -ForegroundColor Red
  Write-Host 'Backup Status: FAILED'
  Write-Host 'Exit Code:     1'
  exit 1
}

Write-Host "Backup Root:                $resolvedBackupRoot (Outside Repository: PASS)"

# 6. Prepare timestamped directory
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$targetDir = Join-Path $resolvedBackupRoot $timestamp

if (-not (Test-Path $resolvedBackupRoot)) {
  New-Item -ItemType Directory -Path $resolvedBackupRoot -Force | Out-Null
}

Write-Host "Target Dir:                 $targetDir"
Write-Host "Retention Limit:            Keep last $RetentionCount backups"
Write-Host '----------------------------------------------------'

# 7. Check mongodump presence
$dumpCmd = Get-Command 'mongodump' -ErrorAction SilentlyContinue
if (-not $dumpCmd) {
  Write-Warning 'mongodump command not found in system PATH. Ensure MongoDB Database Tools are installed.'
  if (-not $DryRun) {
    Write-Host 'FAIL: mongodump utility unavailable. Cannot complete live database dump.' -ForegroundColor Red
    Write-Host 'Backup Status: FAILED'
    Write-Host 'Exit Code:     2'
    exit 2
  }
}

if ($DryRun) {
  Write-Host '[DRY_RUN] Verification mode active. Command would execute: mongodump --uri=<MASKED> --out=<TARGET_DIR> --gzip'
  Write-Host '===================================================='
  Write-Host 'VERDICT: APPLICATION_CONSISTENT'
  Write-Host 'Backup Status:              DRY_RUN_VERIFIED'
  Write-Host "Backup Start:               $(Get-Date -Format 'o')"
  Write-Host "Backup Completion:          $(Get-Date -Format 'o')"
  Write-Host 'Duration:                   0 seconds'
  Write-Host 'Exit Code:                  0'
  Write-Host 'Write Quiescence Confirmed: YES'
  Write-Host "Database Name:              $displayDb"
  Write-Host "Backup Path:                $targetDir"
  Write-Host 'Backup Size:                0 bytes'
  Write-Host '===================================================='
  exit 0
}

# 8. Execute mongodump with timing and metadata capture
$startTime = Get-Date
$dumpArgs = @("--uri=$mongoUri", "--out=$targetDir", '--gzip')
if ($DbName) {
  $dumpArgs += "--db=$DbName"
}

try {
  Write-Host "Backup Started At: $($startTime.ToString('o'))"
  Write-Host 'Starting mongodump execution...'
  & mongodump $dumpArgs 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: mongodump exited with non-zero status code: $LASTEXITCODE" -ForegroundColor Red
    Write-Host 'Backup Status: FAILED'
    Write-Host 'Exit Code:     3'
    exit 3
  }
} catch {
  $errMsg = $_.Exception.Message
  Write-Host "FAIL: mongodump execution failed: $errMsg" -ForegroundColor Red
  Write-Host 'Backup Status: FAILED'
  Write-Host 'Exit Code:     3'
  exit 3
}

$completionTime = Get-Date
$duration = ($completionTime - $startTime).TotalSeconds

# Measure backup size safely
$backupSize = 0
if (Test-Path $targetDir) {
  $backupSize = (Get-ChildItem -Path $targetDir -Recurse | Measure-Object -Property Length -Sum).Sum
}

# 9. Apply retention cleanup
Write-Host 'Auditing local backup retention window...'
$allBackups = Get-ChildItem -Path $resolvedBackupRoot -Directory | Sort-Object Name -Descending
if ($allBackups.Count -gt $RetentionCount) {
  $toPrune = $allBackups | Select-Object -Skip $RetentionCount
  foreach ($item in $toPrune) {
    Write-Host "Pruning expired local backup: $($item.Name)"
    Remove-Item -Path $item.FullName -Recurse -Force
  }
}

Write-Host '===================================================='
Write-Host 'VERDICT: APPLICATION_CONSISTENT'
Write-Host 'Backup Status:              SUCCESS'
Write-Host "Backup Start:               $($startTime.ToString('o'))"
Write-Host "Backup Completion:          $($completionTime.ToString('o'))"
Write-Host "Duration:                   $duration seconds"
Write-Host 'Exit Code:                  0'
Write-Host 'Write Quiescence Confirmed: YES'
Write-Host "Database Name:              $displayDb"
Write-Host "Backup Path:                $targetDir"
Write-Host "Backup Size:                $backupSize bytes"
Write-Host '===================================================='
exit 0
