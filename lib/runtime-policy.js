'use strict';
const os = require('node:os');
const TWO_GIB = 2 * 1024 ** 3;
const FOUR_GIB = 4 * 1024 ** 3;
function systemMemory() { return Number(os.totalmem()); }
function isFourGiBEligible(total = systemMemory()) { return total > 8 * 1024 ** 3; }
function normalizeQuota(value, total = systemMemory()) {
  const requested = value === undefined || value === null ? 2 : Number(value);
  if (requested !== 2 && requested !== 4) throw new Error('Per-user app memory allocation must be 2 or 4 GiB.');
  if (requested === 4 && !isFourGiBEligible(total)) throw new Error('4 GiB allocation requires more than 8 GiB of system RAM.');
  return requested === 4 ? FOUR_GIB : TWO_GIB;
}
function policyFor(allocationBytes = TWO_GIB, total = systemMemory(), removeRamCap = false) {
  const eligible = isFourGiBEligible(total);
  const allowedMaxBytes = eligible ? FOUR_GIB : TWO_GIB;
  const assignedBytes = allocationBytes === FOUR_GIB && eligible ? FOUR_GIB : TWO_GIB;
  return { systemMemoryBytes: total, eligibleFor4GiB: eligible, defaultBytes: TWO_GIB, allowedMaxBytes, assignedBytes: removeRamCap ? null : assignedBytes, effectiveCapBytes: removeRamCap ? null : assignedBytes, removeRamCap: removeRamCap === true, allocationGiB: assignedBytes / 1024 ** 3, enforcement: 'per-user-server-resource-policy', hardPerIframeLimit: false };
}
module.exports = { TWO_GIB, FOUR_GIB, systemMemory, isFourGiBEligible, normalizeQuota, policyFor };
