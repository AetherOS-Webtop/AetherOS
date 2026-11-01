'use strict';
const path = require('node:path');
const entry = path.resolve(process.argv[2] || '');
let service;
const timers = new Map(); let timerId = 0; let throttled = false;
const context = {
  daemonId: process.env.AETHEROS_DAEMON_ID || 'unknown',
  log(message, level = 'INFO') { if (process.send) process.send({ type: 'log', level: String(level).slice(0, 12), message: String(message).slice(0, 2000) }); },
  schedule(callback, ms) { const id = ++timerId; const base = Math.max(1000, Math.min(Number(ms) || 1000, 86400000)); const run = () => { try { callback(); } catch (e) { context.log(e.message, 'ERROR'); } }; const timer = { callback: run, base, handle: null }; timer.handle = setInterval(run, base * (throttled ? 4 : 1)); timers.set(id, timer); return id; },
  get throttled() { return throttled; },
  cancel(id) { const timer = timers.get(id); if (timer) { clearInterval(timer.handle); timers.delete(id); } }
};
async function shutdown() {
  try { if (service && typeof service.stop === 'function') await service.stop(context); }
  catch (e) { context.log('Stop hook failed: ' + e.message, 'ERROR'); }
  for (const timer of timers.values()) clearInterval(timer.handle);
  timers.clear();
  if (process.send) process.send({ type: 'stopped' });
  process.exit(0);
}
process.on('message', message => { if (message?.type === 'stop') shutdown(); if (message?.type === 'throttle') { throttled = !!message.enabled; for (const timer of timers.values()) { clearInterval(timer.handle); timer.handle = setInterval(timer.callback, timer.base * (throttled ? 4 : 1)); } context.log(throttled ? 'Host pressure throttle enabled (4x scheduled intervals).' : 'Host pressure throttle cleared.'); } });
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('uncaughtException', e => { context.log('Uncaught exception: ' + e.message, 'FATAL'); process.exit(1); });
process.on('unhandledRejection', e => { context.log('Unhandled rejection: ' + String(e), 'FATAL'); process.exit(1); });
(async () => {
  if (!entry || !entry.startsWith(path.resolve(process.cwd()) + path.sep)) throw new Error('Daemon entrypoint escaped its installation directory.');
  service = require(entry);
  if (!service || typeof service.start !== 'function') throw new Error('Daemon module must export start(context).');
  await service.start(context);
  if (process.send) process.send({ type: 'started' });
})().catch(e => { context.log('Startup failed: ' + e.message, 'ERROR'); process.exit(1); });
