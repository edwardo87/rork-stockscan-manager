import assert from 'node:assert/strict';
import { parseBusinessAccess, readBusinessAccess } from '../utils/businessAccess';
const u='11111111-1111-4111-8111-111111111111', b='11111111-0000-4000-8000-000000000001';
const membership={business_id:b,user_id:u,role:'owner',status:'active'};
const plan={business_id:b,plan_code:'starter-proposal',member_limit:1,product_limit:250};
const rows={memberships:[membership],plans:[plan]};
assert.deepEqual(parseBusinessAccess(rows,u),{available:true,memberships:[{businessId:b,userId:u,role:'owner',active:true}],plans:[{businessId:b,code:'starter-proposal',memberLimit:1,productLimit:250}]});
for(const change of [{user_id:'other'},{role:'superuser'},{status:'revoked'},{business_id:'bad'}])
 assert.throws(()=>parseBusinessAccess({...rows,memberships:[{...membership,...change}]},u),/access/);
assert.throws(()=>parseBusinessAccess({...rows,memberships:[membership,membership]},u),/access/);
for(const change of [{member_limit:0},{product_limit:-1},{product_limit:undefined},{business_id:'other'}])
 assert.throws(()=>parseBusinessAccess({...rows,plans:[{...plan,...change}]},u),/plan/);
assert.deepEqual(parseBusinessAccess({memberships:[membership],plans:[]},u),{available:true,memberships:[{businessId:b,userId:u,role:'owner',active:true}],plans:[]});
const signal=new AbortController().signal;
assert.deepEqual(await readBusinessAccess(u,signal,{currentUser:async()=>u,read:async()=>null}),{available:false});
let actor=u;
await assert.rejects(readBusinessAccess(u,signal,{currentUser:async()=>actor,read:async()=>{actor='other';return rows;}}),/account changed/);
let reads=0;
await assert.rejects(readBusinessAccess(u,signal,{currentUser:async()=>null,read:async()=>{reads++;return rows;}}),/account changed/);
assert.equal(reads,0);
const controller=new AbortController();controller.abort();
await assert.rejects(readBusinessAccess(u,controller.signal,{currentUser:async()=>u,read:async()=>rows}),/cancelled/);
console.log('PASS business access: strict roles/limits, membership isolation, missing plan/schema, account switch and cancellation');// Cancellation during either auth lookup must not start a read or return stale access.
for (const abortAt of [1, 2]) {
 const c = new AbortController(); let authCalls = 0, rowReads = 0;
 await assert.rejects(readBusinessAccess(u,c.signal,{
  currentUser:async()=>{if (++authCalls === abortAt) c.abort(); return u;},
  read:async()=>{rowReads++;return rows;},
 }),/cancelled/);
 assert.equal(rowReads,abortAt === 1 ? 0 : 1);
}
console.log('PASS cancellation during account verification');
