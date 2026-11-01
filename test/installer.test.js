'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getTemplate, compileBundle } = require('../lib/ide');
const { compileInstaller, validateInstaller } = require('../lib/installer');
function bundleFor(templateId) {
  const t = getTemplate(templateId);
  const files = Object.fromEntries(Object.entries(t.files).map(([name, value]) => [name, Buffer.from(typeof value === 'object' ? JSON.stringify(value) : value)]));
  const manifest = JSON.parse(files['aetheros.project.json'].toString('utf8'));
  return compileBundle(manifest, files);
}
test('installer compiles an AOAPP payload and validates its digest and target', () => {
  const app = bundleFor('hello-world');
  const template = getTemplate('basic-installer');
  const manifest = { ...template.files['aetheros.project.json'] };
  const installer = compileInstaller(manifest, { ...template.files['installer.json'], displayName: 'Hello Installer' }, app);
  const checked = validateInstaller(installer);
  assert.equal(checked.bundle.manifest.id, 'hello-world');
  assert.equal(installer.format, 'AETHEROS_INSTALLER');
  installer.payload.data = Buffer.from('tampered').toString('base64');
  assert.throws(() => validateInstaller(installer), /integrity/);
});
test('installer refuses nested installer payloads', () => {
  const template = getTemplate('basic-installer');
  const manifest = { ...template.files['aetheros.project.json'] };
  const files = { 'aetheros.project.json': Buffer.from(JSON.stringify({ id:'inner-installer', name:'Inner Installer', type:'installer', version:'1.0.0', entrypoint:'installer.json' })), 'installer.json': Buffer.from('{}') };
  const inner = compileBundle(JSON.parse(files['aetheros.project.json'].toString()), files);
  assert.throws(() => compileInstaller(manifest, template.files['installer.json'], inner), /Nested/);
});
test('installer supports daemon and Layer 1 AOAPP targets', () => {
  for (const [templateId, expectedType] of [['heartbeat-daemon','daemon'], ['protocol-layer1','layer1']]) {
    const app = bundleFor(templateId);
    const template = getTemplate('basic-installer');
    const installer = compileInstaller({ ...template.files['aetheros.project.json'] }, template.files['installer.json'], app);
    assert.equal(validateInstaller(installer).bundle.manifest.type, expectedType);
    assert.equal(installer.target.type, expectedType);
  }
});
test('installer compiler rejects invalid project manifest metadata', () => {
  const app = bundleFor('hello-world');
  assert.throws(() => compileInstaller({ id:'bad', name:'Bad', type:'installer', version:'not-semver', entrypoint:'installer.json' }, {}, app), /semantic version/);
});
