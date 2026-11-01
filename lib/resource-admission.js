'use strict';
const { MIB } = require('./host-pressure');
const HOST_RESERVE_MIN = 1536 * MIB;
const SESSION_HEADROOM = 256 * MIB;
const MIN_FREE_FOR_LOGIN = 512 * MIB;

function admissionDecision({ snapshot, activeUsers = [], requestedUser, requestedQuotaBytes, quotaForUser, removeRamCapForUser = () => false }) {
  if (!snapshot || !Number.isFinite(snapshot.totalBytes) || !Number.isFinite(snapshot.freeBytes)) {
    return { allowed: false, reason: 'memory-unavailable' };
  }
  const minFree = Math.max(MIN_FREE_FOR_LOGIN, Math.floor(snapshot.totalBytes * 0.05));
  if (snapshot.freeBytes <= minFree || snapshot.underPressure) {
    return { allowed: false, reason: 'host-memory-pressure', minFreeBytes: minFree };
  }
  const unique = new Set(activeUsers.map(x => String(x).toLowerCase()));
  const requestedKey = String(requestedUser || '').toLowerCase();
  const isAlreadyActive = unique.has(requestedKey);
  let reservedBytes = 0;
  for (const username of unique) {
    if (!removeRamCapForUser(username)) reservedBytes += Math.max(0, Number(quotaForUser(username)) || 0);
  }
  const requestedIsUncapped = removeRamCapForUser(requestedKey);
  const additionalReservation = isAlreadyActive || requestedIsUncapped ? 0 : Math.max(0, Number(requestedQuotaBytes) || 0);
  const hostReserve = Math.max(HOST_RESERVE_MIN, Math.floor(snapshot.totalBytes * 0.20));
  const capacity = Math.max(0, snapshot.totalBytes - hostReserve);
  const projected = reservedBytes + additionalReservation;
  if (projected + SESSION_HEADROOM > capacity) {
    return { allowed: false, reason: 'user-quota-capacity', reservedBytes, additionalReservation, capacityBytes: capacity };
  }
  return { allowed: true, reservedBytes, additionalReservation, capacityBytes: capacity, isAlreadyActive };
}

module.exports = { HOST_RESERVE_MIN, SESSION_HEADROOM, MIN_FREE_FOR_LOGIN, admissionDecision };
