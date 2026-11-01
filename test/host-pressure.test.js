'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { snapshot, HostMemoryMonitor, MIB } = require('../lib/host-pressure');

test('host memory snapshot marks low free memory as pressure', () => {
  const memory = { totalmem: () => 16 * 1024 * MIB, freemem: () => 400 * MIB };
  const result = snapshot(memory);
  assert.equal(result.underPressure, true);
  assert.equal(result.recovered, false);
});

test('monitor requires two consecutive low samples before recovery action', async () => {
  let calls = 0;
  const memory = { totalmem: () => 16 * 1024 * MIB, freemem: () => 400 * MIB };
  const monitor = new HostMemoryMonitor({ memory, now: () => 100000, onPressure: async () => { calls++; } });
  await monitor.tick();
  assert.equal(calls, 0);
  await monitor.tick();
  assert.equal(calls, 1);
  assert.equal(monitor.active, true);
});

test('monitor clears pressure only after recovery threshold is reached', async () => {
  let free = 400 * MIB;
  let recovered = 0;
  const memory = { totalmem: () => 16 * 1024 * MIB, freemem: () => free };
  const monitor = new HostMemoryMonitor({ memory, now: () => 100000, onPressure: async () => {}, onRecovery: async () => { recovered++; } });
  await monitor.tick(); await monitor.tick();
  free = 3 * 1024 * MIB;
  await monitor.tick();
  assert.equal(recovered, 1);
  assert.equal(monitor.active, false);
});
