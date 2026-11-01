'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { admissionDecision, SESSION_HEADROOM } = require('../lib/resource-admission');
const GiB = 1024 ** 3;

test('login admission rejects a host already below the memory floor', () => {
  const result = admissionDecision({ snapshot: { totalBytes: 16*GiB, freeBytes: 400*1024**2, underPressure: true }, requestedUser: 'alice', requestedQuotaBytes: 2*GiB });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'host-memory-pressure');
});

test('capped users reserve their per-user quota before another account can log in', () => {
  const result = admissionDecision({ snapshot: { totalBytes: 8*GiB, freeBytes: 3*GiB, underPressure: false }, activeUsers: ['alice','bob','dave'], requestedUser: 'carol', requestedQuotaBytes: 2*GiB, quotaForUser: () => 2*GiB });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'user-quota-capacity');
});

test('multiple clients for one existing account do not reserve its quota twice', () => {
  const result = admissionDecision({ snapshot: { totalBytes: 8*GiB, freeBytes: 3*GiB, underPressure: false }, activeUsers: ['alice','alice'], requestedUser: 'alice', requestedQuotaBytes: 2*GiB, quotaForUser: () => 2*GiB });
  assert.equal(result.allowed, true);
  assert.equal(result.additionalReservation, 0);
});

test('Remove RAM Cap bypasses the per-user reservation but not host free-memory admission', () => {
  const result = admissionDecision({ snapshot: { totalBytes: 8*GiB, freeBytes: 2*GiB, underPressure: false }, requestedUser: 'rooted', requestedQuotaBytes: 0, removeRamCapForUser: name => name === 'rooted' });
  assert.equal(result.allowed, true);
  assert.equal(result.additionalReservation, 0);
  const blocked = admissionDecision({ snapshot: { totalBytes: 8*GiB, freeBytes: 200*1024**2, underPressure: true }, requestedUser: 'rooted', requestedQuotaBytes: 0, removeRamCapForUser: () => true });
  assert.equal(blocked.allowed, false);
});
