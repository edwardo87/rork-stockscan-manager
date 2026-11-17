import assert from 'node:assert/strict';
import { businessCapacity } from '../utils/businessCapacity';
import type { BusinessAccess } from '../utils/businessAccess';
const access: BusinessAccess = { available: true, memberships: [
  {userId:'u',businessId:'a',role:'owner',active:true},
  {userId:'u',businessId:'b',role:'staff',active:true},
], plans:[
  {businessId:'a',code:'entry-proposal',memberLimit:1,productLimit:250},
  {businessId:'b',code:'next-proposal',memberLimit:2,productLimit:500},
] };
assert.equal(businessCapacity(access,'u','a','products',249,1),'allowed');
assert.equal(businessCapacity(access,'u','a','products',249,2),'limit_reached');
assert.equal(businessCapacity(access,'u','a','members',1,1),'limit_reached');
assert.equal(businessCapacity(access,'u','b','members',1,1),'allowed');
assert.equal(businessCapacity(access,'u','b','products',499,1),'allowed');
assert.equal(businessCapacity(access,'u','b','products',500,1),'limit_reached');
assert.equal(businessCapacity(access,'outsider','b','products',0,1),'no_membership');
assert.equal(businessCapacity(access,'u','unknown','products',0,1),'no_membership');
assert.equal(businessCapacity({available:false},'u','a','products',0,1),'unavailable');
assert.equal(businessCapacity({...access,plans:[]},'u','a','products',0,1),'plan_unconfigured');
assert.equal(businessCapacity({...access,plans:[access.plans[0],access.plans[0]]},'u','a','products',0,1),'invalid_configuration');
assert.equal(businessCapacity(access,'u','a','products',-1,1),'invalid_configuration');
assert.equal(businessCapacity(access,'u','a','products',250,0),'allowed');
assert.equal(businessCapacity({...access,memberships:access.memberships.map(m=>({...m,active:false}))},'u','a','products',0,1),'no_membership');
assert.equal(businessCapacity({...access,plans:[{...access.plans[0],productLimit:null}]},'u','a','products',50000,1),'allowed');
console.log('PASS SME capacity: 1/250 and 2/500 boundaries, batch additions, explicit unlimited, missing plans, revoked/foreign membership');
