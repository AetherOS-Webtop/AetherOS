'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TWO_GIB, FOUR_GIB, isFourGiBEligible, normalizeQuota, policyFor } = require('../lib/runtime-policy');

test('4 GiB eligibility requires strictly more than 8 GiB RAM', () => {
  assert.equal(isFourGiBEligible(8 * 1024 ** 3), false);
  assert.equal(isFourGiBEligible(8 * 1024 ** 3 + 1), true);
});
test('default per-user app memory allocation is 2 GiB', () => {
  assert.equal(normalizeQuota(undefined), TWO_GIB);
  assert.equal(policyFor(TWO_GIB, 16 * 1024 ** 3).allocationGiB, 2);
});
test('4 GiB allocation is accepted only on eligible systems', () => {
  assert.equal(normalizeQuota(4, 16 * 1024 ** 3), FOUR_GIB);
  assert.throws(() => normalizeQuota(4, 8 * 1024 ** 3), /more than 8 GiB/);
});
test('policy clamps existing allocation to the system maximum', () => {
  const policy = policyFor(FOUR_GIB, 8 * 1024 ** 3);
  assert.equal(policy.assignedBytes, TWO_GIB);
  assert.equal(policy.allowedMaxBytes, TWO_GIB);
  assert.equal(policy.hardPerIframeLimit, false);
});
test('unsupported memory allocation values are rejected', () => {
  assert.throws(() => normalizeQuota(3), /must be 2 or 4 GiB/);
});
