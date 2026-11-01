'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { fork } = require('node:child_process');
const { validateBundle } = require('./ide');
class DaemonSupervisor {
  constructor(root, onLog = () => {}) { this.root = path.resolve(root); this.registryFile = path.join(this.root, 'registry.json'); this.daemonRoot = path.join(this.root, 'installed'); this.registry = {}; this.children = new Map(); this.onLog = onLog; }
  async initialize() { await fs.mkdir(this.daemonRoot, { recursive: true, mode: 0o700 }); try { this.registry = JSON.parse(await fs.readFile(this.registryFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; this.registry = {}; } }
  async persist() { const tmp = this.registryFile + '.tmp'; await fs.writeFile(tmp, JSON.stringify(this.registry, null, 2), { mode: 0o600 }); await fs.rename(tmp, this.registryFile); }
  async install(bundle, options = {}) {
    validateBundle(bundle);
    if (bundle.manifest.type !== 'daemon') throw new Error('Only Daemon Projects can be registered with the Daemon Supervisor.');
    const id = bundle.manifest.id; const dir = path.join(this.daemonRoot, id);
    await fs.rm(dir, { recursive: true, force: true }); await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    for (const [name, item] of Object.entries(bundle.files)) {
      const target = path.resolve(dir, name);
      if (!target.startsWith(dir + path.sep)) throw new Error('Unsafe daemon package path.');
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await fs.writeFile(target, Buffer.from(item.data, 'base64'), { mode: 0o600, flag: 'wx' });
    }
    this.registry[id] = { id, name: bundle.manifest.name, version: bundle.manifest.version, entrypoint: bundle.manifest.entrypoint, directory: dir, enabled: options.enabled === true, installedAt: new Date().toISOString(), state: 'stopped' };
    await this.persist();
    return this.describe(id);
  }
  describe(id) { const item = this.registry[id]; if (!item) throw new Error('Daemon is not installed.'); return { ...item, state: this.children.has(id) ? 'running' : 'stopped' }; }
  list() { return Object.keys(this.registry).sort().map(id => this.describe(id)); }
  async start(id) {
    const item = this.registry[id]; if (!item) throw new Error('Daemon is not installed.'); if (this.children.has(id)) return this.describe(id);
    const entry = path.resolve(item.directory, item.entrypoint); if (!entry.startsWith(item.directory + path.sep)) throw new Error('Invalid daemon entrypoint.');
    const child = fork(path.join(__dirname, 'daemon-runner.js'), [entry], { cwd: item.directory, env: { PATH: process.env.PATH || '', AETHEROS_DAEMON_ID: id, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const record = { child, started: false, startTimer: null };
    this.children.set(id, record);
    child.stdout.on('data', b => this.onLog(id, b.toString().trim(), 'INFO'));
    child.stderr.on('data', b => this.onLog(id, b.toString().trim(), 'ERROR'));
    child.on('message', m => { if (m?.type === 'started') record.started = true; if (m?.type === 'log') this.onLog(id, m.message, m.level); });
    child.on('error', e => { this.onLog(id, 'Child process error: ' + e.message, 'ERROR'); this.children.delete(id); });
    child.on('exit', (code, signal) => { this.children.delete(id); this.onLog(id, `Process exited (code=${code}, signal=${signal || 'none'}).`, code === 0 ? 'INFO' : 'ERROR'); });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Daemon did not complete startup within 10 seconds.')), 10000);
      const onMessage = m => { if (m?.type === 'started') { clearTimeout(timeout); child.off('message', onMessage); resolve(); } };
      child.on('message', onMessage); child.once('error', e => { clearTimeout(timeout); child.off('message', onMessage); reject(e); }); child.once('exit', code => { clearTimeout(timeout); child.off('message', onMessage); reject(new Error('Daemon exited during startup (code ' + code + ').')); });
    }).catch(async e => { if (this.children.has(id)) { child.kill(); this.children.delete(id); } throw e; });
    return this.describe(id);
  }
  async stop(id) {
    const record = this.children.get(id); if (!record) return this.describe(id);
    const child = record.child;
    await new Promise(resolve => {
      const timeout = setTimeout(() => { if (child.exitCode === null) child.kill(); }, 5000);
      child.once('exit', () => { clearTimeout(timeout); resolve(); });
      try { child.send({ type: 'stop' }); } catch { child.kill(); }
    });
    this.children.delete(id); return this.describe(id);
  }
  async enable(id) { if (!this.registry[id]) throw new Error('Daemon is not installed.'); this.registry[id].enabled = true; await this.persist(); return this.describe(id); }
  async disable(id) { if (!this.registry[id]) throw new Error('Daemon is not installed.'); this.registry[id].enabled = false; await this.persist(); return this.describe(id); }
  async startEnabled() { for (const item of this.list()) if (item.enabled) { try { await this.start(item.id); } catch (e) { this.onLog(item.id, 'Autostart failed: ' + e.message, 'ERROR'); } } }
  async setThrottle(enabled) {
    for (const [id, record] of this.children) {
      if (record.child.connected) {
        try { record.child.send({ type: 'throttle', enabled: !!enabled }); } catch (e) { this.onLog(id, 'Could not update throttle state: ' + e.message, 'WARN'); }
      }
    }
  }
  async memoryPressureRecovery() {
    const running = [...this.children.entries()];
    if (!running.length) return { stopped: [], throttled: [] };
    const usage = [];
    if (process.platform === 'linux') {
      for (const [id, record] of running) {
        try {
          const status = await fs.readFile('/proc/' + record.child.pid + '/status', 'utf8');
          const match = status.match(/^VmRSS:\s+(\d+)\s+kB/m);
          usage.push({ id, bytes: match ? Number(match[1]) * 1024 : 0 });
        } catch { usage.push({ id, bytes: 0 }); }
      }
    }
    // On platforms without a portable child-RSS interface, stop only AetherOS-managed
    // daemons rather than guessing at or killing unrelated host processes.
    const candidates = process.platform === 'linux'
      ? usage.filter(x => x.bytes > 0).sort((a, b) => b.bytes - a.bytes)
      : running.map(([id]) => ({ id, bytes: 0 }));
    const stopped = [];
    const free = os.freemem();
    const target = Math.max(1024 * 1024 * 1024, Math.floor(os.totalmem() * 0.10));
    const deficit = Math.max(0, target - free);
    let estimatedRecovered = 0;
    for (const item of candidates) {
      if (process.platform === 'linux' && stopped.length && estimatedRecovered >= deficit) break;
      try { await this.stop(item.id); stopped.push(item.id); estimatedRecovered += item.bytes || 0; this.onLog(item.id, 'Stopped by host memory-pressure recovery.', 'WARN'); }
      catch (e) { this.onLog(item.id, 'Memory-pressure stop failed: ' + e.message, 'ERROR'); }
    }
    await this.setThrottle(true);
    return { stopped, throttled: [...this.children.keys()] };
  }
  async stopAll() { for (const id of [...this.children.keys()]) await this.stop(id).catch(() => {}); }
}
module.exports = { DaemonSupervisor };
