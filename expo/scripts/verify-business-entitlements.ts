import assert from 'node:assert/strict';
import { checkPlanCapacity, membershipForBusiness, BusinessMembership } from '../utils/businessEntitlements';
assert.equal(checkPlanCapacity(4,1,5),'allowed');
assert.equal(checkPlanCapacity(5,1,5),'limit_reached');
assert.equal(checkPlanCapacity(8,0,5),'limit_reached');
assert.equal(checkPlanCapacity(8,1,null),'allowed');
for (const n of [-1,NaN,Infinity,1.5]) assert.equal(checkPlanCapacity(n,1,5),'invalid_configuration');
assert.equal(checkPlanCapacity(1,1,undefined as any),'invalid_configuration');
assert.equal(checkPlanCapacity(Number.MAX_SAFE_INTEGER,1,null),'invalid_configuration');
const rows: BusinessMembership[] = [
 {userId:'u',businessId:'a',role:'owner',active:true},
 {userId:'u',businessId:'b',role:'staff',active:true},
 {userId:'other',businessId:'c',role:'owner',active:true},
];
assert.equal(membershipForBusiness(rows,'u','b')?.role,'staff');
assert.equal(membershipForBusiness(rows,'u','c'),null);
assert.equal(membershipForBusiness([{...rows[0],active:false}],'u','a'),null);
assert.equal(membershipForBusiness([rows[0],rows[0]],'u','a'),null);
console.log('PASS tier framework: capacity boundaries, invalid limits, multi-business roles and membership isolation');