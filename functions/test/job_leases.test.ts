import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canClaimLease,leaseMatches,nextCivilBoundary} from '../src/jobs/leases.js';

test('duplicate dispatch cannot claim an active lease and expired leases can recover',()=>{
  const now=new Date('2026-10-04T00:00:00Z');
  assert.equal(canClaimLease({status:'pending',nextRunAt:now,leaseExpiresAt:null},now),true);
  assert.equal(canClaimLease({status:'pending',nextRunAt:new Date(now.getTime()+1),leaseExpiresAt:null},now),false);
  assert.equal(canClaimLease({status:'leased',nextRunAt:now,leaseExpiresAt:new Date(now.getTime()+1)},now),false);
  assert.equal(canClaimLease({status:'leased',nextRunAt:now,leaseExpiresAt:now},now),true);
  assert.equal(leaseMatches({status:'leased',leaseToken:'new',generation:2,leaseGeneration:2},'old'),false);
  assert.equal(leaseMatches({status:'leased',leaseToken:'new',generation:3,leaseGeneration:2},'new'),false);
});
test('next day refresh respects timezone offsets and DST day lengths',()=>{
  assert.equal(nextCivilBoundary('Asia/Manila',new Date('2026-10-04T00:01:00Z')).toISOString(),'2026-10-04T16:00:00.000Z');
  assert.equal(nextCivilBoundary('America/New_York',new Date('2026-03-08T05:00:00Z')).toISOString(),'2026-03-09T04:00:00.000Z');
  assert.equal(nextCivilBoundary('America/New_York',new Date('2026-11-01T04:00:00Z')).toISOString(),'2026-11-02T05:00:00.000Z');
});
