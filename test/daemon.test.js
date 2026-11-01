'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { getTemplate, compileBundle } = require('../lib/ide');
const { DaemonSupervisor } = require('../lib/daemon-supervisor');
function daemonBundle() {
  const t = getTemplate('heartbeat-daemon');
  const files = Object.fromEntries(Object.entries(t.files).map(([name, value]) => [name, Buffer.from(typeof value === 'object' ? JSON.stringify(value) : value)]));
  return compileBundle(JSON.parse(files['aetheros.project.json'].toString()), files);
}
test('daemon supervisor installs, starts, stops, enables and disables daemons', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aether-daemon-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const supervisor = new DaemonSupervisor(root);
  await supervisor.initialize();
  const bundle = daemonBundle();
  await supervisor.install(bundle);
  assert.equal(supervisor.describe('heartbeat-daemon').state, 'stopped');
  assert.equal((await supervisor.enable('heartbeat-daemon')).enabled, true);
  assert.equal((await supervisor.start('heartbeat-daemon')).state, 'running');
  assert.equal((await supervisor.stop('heartbeat-daemon')).state, 'stopped');
  assert.equal((await supervisor.disable('heartbeat-daemon')).enabled, false);
});
