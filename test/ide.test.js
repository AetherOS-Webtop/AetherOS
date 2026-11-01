'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TEMPLATES, getTemplate, slug, compileBundle, validateBundle } = require('../lib/ide');

test('IDE exposes the four supported project types', () => {
  assert.deepEqual([...new Set(TEMPLATES.map(x => x.type))].sort(), ['daemon','installer','layer1','standard-app']);
});

test('standard app template compiles to a single AOAPP bundle with hashes', () => {
  const t = getTemplate('hello-world');
  const files = Object.fromEntries(Object.entries(t.files).map(([name,value]) => [name, Buffer.from(typeof value === 'object' ? JSON.stringify(value) : value)]));
  const bundle = compileBundle(JSON.parse(files['aetheros.project.json'].toString()), files);
  assert.equal(bundle.format, 'AETHEROS_AOAPP');
  assert.equal(bundle.manifest.type, 'standard-app');
  assert.ok(bundle.files['index.html'].sha256);
  assert.equal(Buffer.from(bundle.files['index.html'].data,'base64').toString(), t.files['index.html']);
});

test('Layer 1 requires explicit administrator approval metadata', () => {
  const t = getTemplate('protocol-layer1');
  const manifest = {...t.files['aetheros.project.json']};
  assert.equal(compileBundle(manifest, {'aetheros.project.json':Buffer.from(JSON.stringify(manifest)), 'layer1.js':Buffer.from(t.files['layer1.js'])}).trust, 'requires-admin-approval');
  assert.throws(() => compileBundle({...manifest,approvalRequired:false},{'aetheros.project.json':Buffer.from('{}'),'layer1.js':Buffer.from('x')}), /approval/);
});

test('project slugs reject traversal and normalize names', () => {
  assert.equal(slug('My New App'), 'my-new-app');
  assert.throws(() => slug('../escape'), /Project name/);
});

test('compiler rejects unsafe paths and oversized files', () => {
  const manifest={id:'test-app',name:'Test App',type:'standard-app',version:'1.0.0',entrypoint:'index.html'};
  assert.throws(() => compileBundle(manifest, {'aetheros.project.json':Buffer.from('{}'),'../oops':Buffer.from('x'),'index.html':Buffer.from('x')}), /Unsafe/);
  assert.throws(() => compileBundle(manifest, {'aetheros.project.json':Buffer.from('{}'),'index.html':Buffer.alloc(2*1024*1024+1)}), /10 MiB|2 MiB/);
});

test('AOAPP integrity validation detects modified package content', () => {
  const t=getTemplate('hello-world');const files=Object.fromEntries(Object.entries(t.files).map(([n,v])=>[n,Buffer.from(typeof v==='object'?JSON.stringify(v):v)]));const bundle=compileBundle(JSON.parse(files['aetheros.project.json'].toString()),files);assert.equal(validateBundle(bundle),bundle);bundle.files['index.html'].data=Buffer.from('tampered').toString('base64');assert.throws(()=>validateBundle(bundle),/integrity/);
});

test('AOAPP rejects a manifest that differs from its embedded project manifest', () => {
  const t=getTemplate('hello-world');const files=Object.fromEntries(Object.entries(t.files).map(([n,v])=>[n,Buffer.from(typeof v==='object'?JSON.stringify(v):v)]));const bundle=compileBundle(JSON.parse(files['aetheros.project.json'].toString()),files);bundle.manifest.name='Impersonated';assert.throws(()=>validateBundle(bundle),/does not match/);
});

test('IDE includes Installer Projects as a first-class project type', () => {
  const t = getTemplate('basic-installer');
  assert.equal(t.type, 'installer');
  assert.equal(t.files['aetheros.project.json'].entrypoint, 'installer.json');
  assert.ok(t.files['installer.json'].packagePath.endsWith('.aoapp'));
});
