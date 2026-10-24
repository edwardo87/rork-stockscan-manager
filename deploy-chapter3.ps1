# =============================================================================
# SmartStock - Chapter 3 deployment (backup, migrate, verify)
# =============================================================================
# Reuses the Chapter 2 procedure: PostgreSQL 17 client tools on the Windows PC,
# Supabase session-pooler connection, password typed once and held ONLY in this
# process's memory (never in the script, chat or command line).
#
# SAFE BY DEFAULT: without -Apply this script backs up, verifies and reports,
# and changes NOTHING. The migration runs only when ALL of these hold:
#   1. Chapter 3 is not already deployed,
#   2. you passed -Apply,
#   3. you type DEPLOY at the interactive prompt,
#   4. the backup was created AND verified.
#
# Usage (from the repo root, in PowerShell):
#   .\deploy-chapter3.ps1                      # backup + checks only, no changes
#   .\deploy-chapter3.ps1 -Apply               # also authorise the migration
#
# Connection details come from environment variables if set, otherwise you are
# prompted once (they are never written to disk by this script):
#   SUPABASE_DB_HOST   e.g. aws-0-ap-southeast-2.pooler.supabase.com
#   SUPABASE_DB_USER   e.g. postgres.<project-ref>
#   SUPABASE_DB_PORT   default 5432
#   SUPABASE_DB_NAME   default postgres
# =============================================================================
param(
    [switch]$Apply,
    [string]$PgBin = "C:\Program Files\PostgreSQL\17\bin",
    [string]$BackupDir = "backups",
    [string]$MigrationFile = "chapter3-migration.sql"
)

$ErrorActionPreference = "Stop"
$script:failed = $false

# Resolve the migration file relative to this script when a relative path is given.
if (-not ([System.IO.Path]::IsPathRooted($MigrationFile))) {
    $MigrationFile = Join-Path $PSScriptRoot $MigrationFile
}

function Pass([string]$msg) { Write-Host "  [PASS] $msg" -ForegroundColor Green }
function Fail([string]$msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red; $script:failed = $true }
function Info([string]$msg) { Write-Host "  [$msg]" -ForegroundColor Cyan }
function Section([string]$msg) { Write-Host "`n=== $msg ===" -ForegroundColor White }

# ---- 1. Tooling -------------------------------------------------------------
Section "PostgreSQL 17 client tools"
$psql = Join-Path $PgBin "psql.exe"
$dump = Join-Path $PgBin "pg_dump.exe"
$restore = Join-Path $PgBin "pg_restore.exe"
foreach ($tool in @($psql, $dump, $restore)) {
    if (Test-Path $tool) { Pass "$(Split-Path $tool -Leaf) found" }
    else { Fail "Not found: $tool (adjust -PgBin)"; }
}
if ($script:failed) { Write-Host "`nRESULT: FAIL - client tools missing"; exit 1 }

# ---- 2. Connection (never logs or stores the password) ----------------------
Section "Connection"
$DbHost = $env:SUPABASE_DB_HOST; if (-not $DbHost) { $DbHost = Read-Host "Supabase session-pooler host (aws-0-<region>.pooler.supabase.com)" }
$DbUser = $env:SUPABASE_DB_USER; if (-not $DbUser) { $DbUser = Read-Host "Database user (postgres.<project-ref>)" }
$DbPort = $env:SUPABASE_DB_PORT; if (-not $DbPort) { $DbPort = "5432" }
$DbName = $env:SUPABASE_DB_NAME; if (-not $DbName) { $DbName = "postgres" }

$sec = Read-Host "Database password (input hidden)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
# Strip CRLF from connection inputs.
$DbHost = ($DbHost -split "`r?`n")[0].Trim(); $DbUser = ($DbUser -split "`r?`n")[0].Trim()
$conn = "host=$DbHost port=$DbPort user=$DbUser dbname=$DbName sslmode=require"
$psqlArgs = @($conn, "-X", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|")

Info "Testing connection..."
$ver = & $psql @psqlArgs -c "select version();" 2>$null
if ($LASTEXITCODE -eq 0 -and $ver) { Pass "Connected to Supabase ($($ver[0].Split(',')[0]))" }
else { Fail "Could not connect - check host/user/password (password never leaves this session)"; Write-Host "`nRESULT: FAIL"; exit 1 }

# ---- 3. Deployment state + pre-migration counts ------------------------------
Section "Pre-flight state"
$ch3 = & $psql @psqlArgs -c "select count(*) from information_schema.columns where table_schema='public' and table_name='products' and column_name='supplier_code';"
$ch3items = & $psql @psqlArgs -c "select count(*) from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='line_total';"
$alreadyDeployed = ($ch3 -ge 1 -and $ch3items -ge 1)

$countQuery = @"
select 'products' t, count(*) from public.products
union all select 'purchase_orders', count(*) from public.purchase_orders
union all select 'order_items', count(*) from public.order_items
union all select 'stocktakes', count(*) from public.stocktakes
union all select 'stocktake_items', count(*) from public.stocktake_items
union all select 'reorder_log', count(*) from public.reorder_log
union all select 'businesses', count(*) from public.businesses
union all select 'suppliers', count(*) from public.suppliers
order by t;
"@
$countsBefore = @(& $psql @psqlArgs -c $countQuery)
if ($LASTEXITCODE -ne 0) { Fail "Could not read table counts"; Write-Host "`nRESULT: FAIL"; exit 1 }
$countsBefore | ForEach-Object { Info "row count: $_" }
# Chapter 2 compatibility: ownership triggers must still be in place.
$triggers = & $psql @psqlArgs -c "select count(distinct tgrelid::regclass::text) from pg_trigger where tgname like '%business%' and not tgisinternal;"
if ($triggers -ge 1) { Pass "Chapter 2 business-ownership triggers present ($triggers table(s) guarded)" }
else { Fail "Chapter 2 business-ownership triggers NOT found - STOP: resolve Chapter 2 first" }

# ---- 4. Backup ---------------------------------------------------------------
Section "Backup (timestamped, never overwrites)"
if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $BackupDir "smartstock-pre-chapter3-$stamp.dump"
if (Test-Path $backup) { Fail "Backup file already exists: $backup - refusing to overwrite"; Write-Host "`nRESULT: FAIL"; exit 1 }

Info "Running pg_dump (this may take a minute)..."
& $dump $conn --format=custom --file=$backup 2>$null
if ($LASTEXITCODE -ne 0) { Fail "pg_dump exited with an error"; Write-Host "`nRESULT: FAIL"; exit 1 }

$size = (Get-Item $backup).Length
if ($size -gt 1KB) { Pass "Backup created: $backup ($([math]::Round($size/1KB,1)) KB)" }
else { Fail "Backup file suspiciously small ($size bytes)"; Write-Host "`nRESULT: FAIL"; exit 1 }

# ---- 5. Backup verification --------------------------------------------------
Section "Backup verification"
$expectedTables = @("products", "purchase_orders", "order_items", "stocktakes", "stocktake_items", "reorder_log", "businesses", "suppliers", "users")
$list = & $restore --list $backup 2>$null
if ($LASTEXITCODE -ne 0) { Fail "pg_restore could not read the dump - backup is NOT restorable"; Write-Host "`nRESULT: FAIL"; exit 1 }
$missing = @()
foreach ($t in $expectedTables) {
    if ($list -match "TABLE\s+$t\b") { Pass "dump contains table: $t" }
    else { $missing += $t }
}
if ($missing.Count -gt 0) { Fail "dump missing expected tables: $($missing -join ', ')"; Write-Host "`nRESULT: FAIL"; exit 1 }
Pass "Backup verified: readable and complete (pg_restore --list)"

# ---- 6. Migration ------------------------------------------------------------
Section "Chapter 3 migration"
$ran = $false
if ($alreadyDeployed) {
    Pass "Chapter 3 columns already exist - migration SKIPPED (idempotent state)"
}
elseif (-not $Apply) {
    Info "PENDING - Chapter 3 is not deployed yet. Re-run with -Apply to authorise it."
    Info "Nothing was changed; the verified backup is at: $backup"
    Write-Host "`nRESULT: PASS (no changes made - migration pending authorisation)"
    exit 0
}
else {
    Write-Host "You have authorised the Chapter 3 migration with -Apply." -ForegroundColor Yellow
    Write-Host "The verified backup at '$backup' will restore the database if anything goes wrong." -ForegroundColor Yellow
    $confirm = Read-Host "Type DEPLOY to run the migration now (anything else cancels)"
    if ($confirm -cne "DEPLOY") {
        Info "Cancelled by user. No changes made. Backup kept at: $backup"
        Write-Host "`nRESULT: PASS (no changes made - cancelled)"
        exit 0
    }
    Info "Applying $MigrationFile (single transaction, idempotent)..."
    & $psql @psqlArgs -f $MigrationFile
    if ($LASTEXITCODE -ne 0) { Fail "Migration FAILED and rolled back - database unchanged. Restore if needed: pg_restore --clean --dbname=<scratch> $backup"; Write-Host "`nRESULT: FAIL"; exit 1 }
    $ran = $true
    Pass "Migration applied"
}

# ---- 7. Post-migration integrity checks --------------------------------------
Section "Chapter 3 database integrity checks"
function Check([string]$name, [string]$sql, [scriptblock]$test) {
    $val = & $psql @psqlArgs -c $sql
    if ($LASTEXITCODE -ne 0) { Fail "$name (query error)"; return }
    if (& $test $val) { Pass "$name (got: $val)" } else { Fail "$name (got: $val)" }
}
Check "every product has a price-basis unit" `
    "select count(*) from public.products where price_basis_unit = '';" `
    { param($v) $v -eq "0" }
Check "pack quantity positive everywhere" `
    "select count(*) from public.products where units_per_order_unit is null or units_per_order_unit <= 0;" `
    { param($v) $v -eq "0" }
Check "no pack-size string became a stock/price-basis unit" `
    "select count(*) from public.products where stock_unit ~ '[0-9]' or price_basis_unit ~ '[0-9]';" `
    { param($v) $v -eq "0" }
Check "historical order items untouched (no snapshots backfilled)" `
    "select count(*) from public.order_items where order_quantity is not null;" `
    { param($v) $v -eq "0" }
Check "Chapter 3 columns present on order_items" `
    "select count(*) from information_schema.columns where table_schema='public' and table_name='order_items' and column_name in ('supplier_code','order_unit','units_per_order_unit','order_quantity','unit_price','price_basis_quantity','price_basis_unit','line_total');" `
    { param($v) $v -eq "8" }
Check "Chapter 3 columns present on products" `
    "select count(*) from information_schema.columns where table_schema='public' and table_name='products' and column_name in ('supplier_code','stock_unit','order_unit','units_per_order_unit','purchase_price','price_basis_quantity','price_basis_unit');" `
    { param($v) $v -eq "7" }

# ---- 8. Record-count preservation --------------------------------------------
Section "Existing data preserved"
$countsAfter = @(& $psql @psqlArgs -c $countQuery)
$preserveOk = $true
foreach ($line in $countsBefore) {
    $parts = $line -split '\|', 2
    $table = $parts[0]; $before = $parts[1]
    $afterLine = $countsAfter | Where-Object { $_ -like "$table*" } | Select-Object -First 1
    $after = ($afterLine -split '\|', 2)[1]
    if ($before -eq $after) { Pass "$table preserved ($before rows)" }
    else { Fail "$table changed: $before -> $after"; $preserveOk = $false }
}
$countsAfter | ForEach-Object { Info "row count after: $_" }

# ---- 9. Report ----------------------------------------------------------------
Section "RESULT"
if ($script:failed) {
    Write-Host "FAIL - review the [FAIL] lines above. Backup (verified): $backup" -ForegroundColor Red
    exit 1
}
else {
    Write-Host "PASS - backup verified" -ForegroundColor Green
    if ($ran) { Write-Host "PASS - Chapter 3 migration applied and integrity-checked" -ForegroundColor Green }
    elseif ($alreadyDeployed) { Write-Host "PASS - Chapter 3 was already deployed; integrity re-checked" -ForegroundColor Green }
    Write-Host "PASS - existing data counts preserved; Chapter 2 structures intact" -ForegroundColor Green
    Write-Host "`nBackup file: $backup" -ForegroundColor Cyan
    exit 0
}
