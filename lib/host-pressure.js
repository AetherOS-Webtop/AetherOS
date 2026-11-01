'use strict';
const os = require('node:os');

const MIB = 1024 ** 2;
function snapshot(memory = os) {
  const totalBytes = Number(memory.totalmem());
  const freeBytes = Number(memory.freemem());
  const thresholdBytes = Math.max(512 * MIB, Math.floor(totalBytes * 0.05));
  const recoveryBytes = Math.max(1024 * MIB, Math.floor(totalBytes * 0.10));
  return {
    totalBytes,
    freeBytes,
    usedBytes: Math.max(0, totalBytes - freeBytes),
    pressureThresholdBytes: thresholdBytes,
    recoveryThresholdBytes: recoveryBytes,
    underPressure: freeBytes <= thresholdBytes,
    recovered: freeBytes >= recoveryBytes
  };
}

class HostMemoryMonitor {
  constructor({ onPressure, onRecovery, intervalMs = 5000, memory = os, now = Date.now } = {}) {
    this.onPressure = onPressure || (async () => {});
    this.onRecovery = onRecovery || (async () => {});
    this.intervalMs = intervalMs;
    this.memory = memory;
    this.now = now;
    this.timer = null;
    this.lowSamples = 0;
    this.active = false;
    this.lastActionAt = 0;
    this.busy = false;
  }
  sample() { return snapshot(this.memory); }
  async tick() {
    if (this.busy) return;
    const current = this.sample();
    if (!this.active) {
      this.lowSamples = current.underPressure ? this.lowSamples + 1 : 0;
      if (this.lowSamples >= 2 && this.now() - this.lastActionAt >= 60000) {
        this.busy = true;
        try {
          this.active = true;
          this.lastActionAt = this.now();
          await this.onPressure(current);
        } catch (error) { this.active = false; this.lowSamples = 0; this.lastActionAt = this.now(); throw error; } finally { this.busy = false; }
      }
    } else if (current.recovered) {
      this.busy = true;
      try {
        await this.onRecovery(current);
        this.active = false;
        this.lowSamples = 0;
        this.lastActionAt = this.now();
      } finally { this.busy = false; }
    }
  }
  start() { if (this.timer) return; this.timer = setInterval(() => this.tick().catch(() => {}), this.intervalMs); if (this.timer.unref) this.timer.unref(); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.active = false; this.lowSamples = 0; }
}
module.exports = { MIB, snapshot, HostMemoryMonitor };
