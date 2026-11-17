# LOCAL SYNTHETIC VALIDATION ONLY. No production connection arguments accepted.
# Reuses a separate loopback PostgreSQL cluster with a known test-only login.
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
$testRoot = Join-Path $workspace 'validation/chapter7-db'
$dataDir = Join-Path $testRoot 'data'
$schema = Join-Path $workspace 'validation/stocktake-db/public-schema.sql'
if (!(Test-Path -LiteralPath $schema)) { throw 'Schema-only test fixture is missing. Do not substitute a production data dump.' }
if (!(Test-Path -LiteralPath $dataDir)) { throw 'Local chapter7 test cluster is missing; initialize it explicitly with smartstock_test login.' }
$testDb = 'smartstock_ch7_' + [DateTime]::UtcNow.ToString('yyyyMMddHHmmss')
$startedHere = $false
$connection = @('-h','127.0.0.1','-p','55440','-U','smartstock_test','-w')
function Invoke-TestSql([string]$File, [string]$LogName) {
  & (Join-Path $pgBin 'psql.exe') @connection -d $testDb -v ON_ERROR_STOP=1 -f $File *> (Join-Path $testRoot $LogName)
  if ($LASTEXITCODE -ne 0) { throw "Local test failed: $LogName (see validation/chapter7-db)." }
}
try {
  & (Join-Path $pgBin 'pg_ctl.exe') -D $dataDir status *> $null
  if ($LASTEXITCODE -ne 0) {
    & (Join-Path $pgBin 'pg_ctl.exe') -D $dataDir -l (Join-Path $testRoot 'server.log') -o '-h 127.0.0.1 -p 55440' -w start
    if ($LASTEXITCODE -ne 0) { throw 'Local test server did not start.' }
    $startedHere = $true
  }
  & (Join-Path $pgBin 'createdb.exe') @connection $testDb
  if ($LASTEXITCODE -ne 0) { throw 'Could not create disposable test database.' }
  Invoke-TestSql (Join-Path $PSScriptRoot 'expo/scripts/stocktake-exact-bootstrap.sql') 'bootstrap.log'
  Invoke-TestSql $schema 'restore-repeat.log'
  Invoke-TestSql (Join-Path $PSScriptRoot 'chapter3-migration.sql') 'chapter3-repeat.log'
  Invoke-TestSql (Join-Path $PSScriptRoot 'expo/scripts/stocktake-exact-seed.sql') 'seed.log'
  Invoke-TestSql (Join-Path $PSScriptRoot 'chapter6-release-preflight.sql') 'preflight-before.log'
  Invoke-TestSql (Join-Path $PSScriptRoot 'chapter6-atomic-stocktake.sql') 'atomic.log'
  Invoke-TestSql (Join-Path $PSScriptRoot 'chapter6-guidance-migration.sql') 'guidance.log'
  Invoke-TestSql (Join-Path $PSScriptRoot 'chapter7-membership-foundation.sql') 'membership-migration.log'
  Invoke-TestSql (Join-Path $PSScriptRoot 'expo/scripts/verify-membership-foundation.sql') 'membership-checks.log'
  Invoke-TestSql (Join-Path $PSScriptRoot 'chapter6-release-preflight.sql') 'preflight-after.log'
  Invoke-TestSql (Join-Path $PSScriptRoot 'chapter7-membership-capacity.sql') 'capacity-migration.log'
  Invoke-TestSql (Join-Path $PSScriptRoot 'expo/scripts/verify-membership-capacity.sql') 'capacity-checks.log'
  & (Join-Path $PSScriptRoot 'verify-capacity-concurrency.ps1') -Database $testDb
  Invoke-TestSql (Join-Path $PSScriptRoot 'chapter7-product-capacity.sql') 'product-capacity-migration.log'
  Invoke-TestSql (Join-Path $PSScriptRoot 'expo/scripts/verify-product-capacity.sql') 'product-capacity-checks.log'
  & (Join-Path $PSScriptRoot 'verify-capacity-concurrency.ps1') -Database $testDb -Resource products
  Invoke-TestSql (Join-Path $PSScriptRoot 'chapter7-role-permissions.sql') 'permissions-migration.log'
  Invoke-TestSql (Join-Path $PSScriptRoot 'expo/scripts/verify-role-permissions.sql') 'permissions-checks.log'
  Invoke-TestSql (Join-Path $PSScriptRoot 'chapter7-owner-bootstrap.sql') 'owner-bootstrap-migration.log'
  Invoke-TestSql (Join-Path $PSScriptRoot 'expo/scripts/verify-owner-bootstrap.sql') 'owner-bootstrap-checks.log'
  Invoke-TestSql (Join-Path $PSScriptRoot 'chapter7-release-preflight.sql') 'chapter7-preflight.log'
  Write-Output "PASS local membership and preflight checks: $testDb. Synthetic database retained for inspection."
} finally {
  if ($startedHere) {
    & (Join-Path $pgBin 'pg_ctl.exe') -D $dataDir -m fast -w stop
    if ($LASTEXITCODE -ne 0) { Write-Warning 'Local test server could not be stopped; inspect port 55440.' }
  }
}