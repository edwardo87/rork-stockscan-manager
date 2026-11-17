# LOCAL ONLY: two connections compete for the last configured seat/product slot.
param([Parameter(Mandatory=$true)][string]$Database,[ValidateSet('members','products')][string]$Resource='members')
$ErrorActionPreference='Stop'
if ($Database -notmatch '^smartstock_ch7_[0-9]{14}$') { throw 'Only disposable Chapter7 database names accepted.' }
$psql='C:/Program Files/PostgreSQL/17/bin/psql.exe'
$connection=@('-h','127.0.0.1','-p','55440','-U','smartstock_test','-w','-d',$Database,'-v','ON_ERROR_STOP=1')
$folder=Join-Path (Split-Path -Parent $PSScriptRoot) 'validation/chapter7-db'
$business='11111111-0000-4000-8000-000000000001'
if ($Resource -eq 'members') {
 $cleanup="DELETE FROM public.business_memberships WHERE business_id='$business' AND user_id IN ('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555');"
 $provision="INSERT INTO public.business_entitlements(business_id,plan_code,member_limit,product_limit) VALUES ('$business','concurrency-test',2,250) ON CONFLICT(business_id) DO UPDATE SET member_limit=2;"
 $firstInsert="INSERT INTO public.business_memberships(business_id,user_id,role) VALUES ('$business','44444444-4444-4444-8444-444444444444','staff');"
 $secondInsert="INSERT INTO public.business_memberships(business_id,user_id,role) VALUES ('$business','55555555-5555-4555-8555-555555555555','staff');"
 $countSql="SELECT count(*) FROM public.business_memberships WHERE business_id='$business' AND status='active'"
 $expectedCount='2'
} else {
 $cleanup="DELETE FROM public.products WHERE id IN ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000005');"
 $provision="INSERT INTO public.business_entitlements(business_id,plan_code,member_limit,product_limit) VALUES ('$business','concurrency-test',2,3) ON CONFLICT(business_id) DO UPDATE SET product_limit=3;"
 $firstInsert="INSERT INTO public.products(id,user_id,business_id,name,barcode,current_stock) VALUES ('00000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','$business','Concurrent one','004',0);"
 $secondInsert="INSERT INTO public.products(id,user_id,business_id,name,barcode,current_stock) VALUES ('00000000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','$business','Concurrent two','005',0);"
 $countSql="SELECT count(*) FROM public.products WHERE business_id='$business'"
 $expectedCount='3'
}
foreach($isolation in @('READ COMMITTED','REPEATABLE READ')) {
 $tag=$Resource+'-'+$isolation.Replace(' ','-').ToLower()
 & $psql @connection -c ($cleanup+$provision) *> $null
 if ($LASTEXITCODE -ne 0) { throw 'Concurrency setup failed' }
 $first=Join-Path $folder "first-$tag.sql"
 "SET application_name='smartstock_capacity_first'; SET request.jwt.claim.role='service_role'; BEGIN; $firstInsert SELECT pg_sleep(3); COMMIT;" | Set-Content -LiteralPath $first
 $process=Start-Process -FilePath $psql -ArgumentList ($connection + @('-f',('"'+$first+'"'))) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $folder "first-$tag.log") -RedirectStandardError (Join-Path $folder "first-$tag.err")
 try {
  $ready=$false
  for($i=0;$i -lt 20;$i++) {
   $status=& $psql @connection -At -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='smartstock_capacity_first' AND wait_event='PgSleep'"
   if ($status -eq '1') {$ready=$true;break}
   Start-Sleep -Milliseconds 100
  }
  if (!$ready) { throw 'First transaction did not reach its locked-capacity checkpoint.' }
  $log=Join-Path $folder "second-$tag.log"
  $secondFile=Join-Path $folder "second-$tag.sql"
  "SET request.jwt.claim.role='service_role'; BEGIN ISOLATION LEVEL $isolation; SET LOCAL lock_timeout='8s'; $countSql; $secondInsert COMMIT;" | Set-Content -LiteralPath $secondFile
  $loser=Start-Process -FilePath $psql -ArgumentList ($connection + @('-v','VERBOSITY=verbose','-f',('"'+$secondFile+'"'))) -WindowStyle Hidden -PassThru -RedirectStandardOutput $log -RedirectStandardError ($log+'.err')
  try {
   if (!$loser.WaitForExit(12000)) { throw 'Second transaction timed out.' }
  } finally { if (!$loser.HasExited) { $loser.Kill(); $loser.WaitForExit() } }
  if (!$process.WaitForExit(10000)) { throw 'First transaction timed out.' }
  if ((Get-Item (Join-Path $folder "first-$tag.err")).Length -ne 0 -or !(Select-String -LiteralPath (Join-Path $folder "first-$tag.log") -Pattern '^COMMIT$' -Quiet)) { throw 'First addition was not committed.' }
  $expected=if($isolation -eq 'READ COMMITTED') {'23514'} else {'40001'}
  if (!(Select-String -LiteralPath ($log+'.err') -SimpleMatch $expected -Quiet) -or (Select-String -LiteralPath $log -Pattern '^COMMIT$' -Quiet)) { throw "Expected rollback $expected for $Resource at $isolation" }
  $count=& $psql @connection -At -c $countSql
  if ($count -ne $expectedCount) { throw 'Concurrent operations exceeded configured capacity.' }
  Write-Output "PASS concurrent $Resource at $isolation; losing transaction rejected ($expected), exactly $expectedCount rows."
 } finally {
  if (!$process.HasExited) { $process.Kill(); $process.WaitForExit() }
 }
}
