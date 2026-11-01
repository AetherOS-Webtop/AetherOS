'use strict';
const crypto = require('node:crypto');

const TEMPLATES = [
  {
    id: 'hello-world', title: 'Hello World App', type: 'standard-app', description: 'A simple desktop-style HTML application.',
    files: {
      'aetheros.project.json': { id: 'hello-world', name: 'Hello World', type: 'standard-app', version: '1.0.0', entrypoint: 'index.html', executionModel: 'isolated-client-app', capabilities: [] },
      'index.html': '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hello AetherOS</title><link rel="stylesheet" href="style.css"></head><body><main><h1>Hello, AetherOS.</h1><p>This app runs inside the isolated AetherOS application runtime.</p><button id="hello">Click me</button><p id="output" aria-live="polite"></p></main><script src="app.js"></script></body></html>\n',
      'app.js': "document.getElementById('hello').addEventListener('click',()=>{document.getElementById('output').textContent='Your app is running.';});\n",
      'style.css': 'body{margin:0;background:#101827;color:#e8eef8;font:16px system-ui;display:grid;min-height:100vh;place-items:center}main{max-width:38rem;padding:2rem;border:1px solid #334155;border-radius:1.25rem;background:#182235}button{padding:.7rem 1rem;border:0;border-radius:.7rem;background:#477cf5;color:white;cursor:pointer}\n'
    }
  },
  {
    id: 'quick-notes', title: 'Quick Notes App', type: 'standard-app', description: 'A small notes app using the explicit AetherOS file bridge.',
    files: {
      'aetheros.project.json': { id: 'quick-notes', name: 'Quick Notes', type: 'standard-app', version: '1.0.0', entrypoint: 'index.html', executionModel: 'isolated-client-app', capabilities: ['files.read','files.write'] },
      'index.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quick Notes</title><link rel="stylesheet" href="style.css"></head><body><main><h1>Quick Notes</h1><textarea id="note" placeholder="Write a note..."></textarea><div><button id="save">Save note</button><button id="load">Load note</button></div><p id="status"></p></main><script src="app.js"></script></body></html>\n',
      'app.js': "const path='Documents/quick-note.txt',note=document.getElementById('note'),status=document.getElementById('status');document.getElementById('save').onclick=async()=>{try{await aetheros.request('files.write',{path,content:note.value});status.textContent='Saved on the AetherOS server.';}catch(e){status.textContent=e.message;}};document.getElementById('load').onclick=async()=>{try{const d=await aetheros.request('files.read',{path});note.value=d.content;status.textContent='Loaded.';}catch(e){status.textContent=e.message;}};\n",
      'style.css': 'body{font:16px system-ui;background:#101827;color:#e8eef8;margin:0;padding:2rem}main{max-width:48rem;margin:auto}textarea{box-sizing:border-box;width:100%;height:16rem;background:#0b1220;color:inherit;border:1px solid #334155;border-radius:1rem;padding:1rem}button{margin:.75rem .5rem 0 0;padding:.7rem 1rem;border:0;border-radius:.7rem;background:#477cf5;color:white}\n'
    }
  },
  {
    id: 'heartbeat-daemon', title: 'Heartbeat Daemon', type: 'daemon', description: 'Example supervised background service. Install it and manage its lifecycle with aetherctl.',
    files: {
      'aetheros.project.json': { id: 'heartbeat-daemon', name: 'Heartbeat Daemon', type: 'daemon', version: '1.0.0', entrypoint: 'daemon.js', executionModel: 'supervised-background-service', permissions: ['system.logging'], startup: 'manual' },
      'daemon.js': "'use strict';\n// AetherOS Daemon SDK contract example. Runs in a supervised child process after administrator installation.\nmodule.exports = {\n  async start(context) { context.log('Heartbeat daemon started'); this.timer = context.schedule(() => context.log('heartbeat'), 30000); },\n  async stop(context) { if (this.timer) context.cancel(this.timer); context.log('Heartbeat daemon stopped'); }\n};\n",
      'README.md': '# Heartbeat Daemon\n\nDemonstrates the start/stop lifecycle contract for an AetherOS daemon. Compilation creates a .aoapp package. Installation requires administrator approval; the Daemon Supervisor launches this module as a child process.\n'
    }
  },
  {
    id: 'protocol-layer1', title: 'Layer 1 Protocol Provider', type: 'layer1', description: 'Example system-level protocol provider contract. Requires privileged review and approval.',
    files: {
      'aetheros.project.json': { id: 'protocol-layer1', name: 'Layer 1 Protocol Provider', type: 'layer1', version: '1.0.0', entrypoint: 'layer1.js', executionModel: 'privileged-server-extension', permissions: ['system.protocol.register','system.network.observe'], approvalRequired: true },
      'layer1.js': "'use strict';\n// Layer 1 is a privileged server-side extension contract, NOT a normal Webtop daemon.\n// This example is packaged as source and never executed by the Webtop process.\nmodule.exports = {\n  async initialize(system) {\n    // Proposed trusted SDK surface; available only inside a future isolated Layer 1 host.\n    await system.protocols.register({ name: 'example-control', version: 1, handler: async packet => ({ accepted: true, length: packet.byteLength }) });\n    system.log('Example protocol provider initialized');\n  },\n  async shutdown(system) { await system.protocols.unregister('example-control'); }\n};\n",
      'SECURITY.md': '# Layer 1 security\n\nLayer 1 packages can request system-wide capabilities. They must be reviewed, signed by a trusted publisher, and run in a dedicated privileged extension host with a narrow broker API. This Webtop build only compiles and stores the package; it does not activate Layer 1 code.\n'
    }
  },
  {
    id: 'basic-installer', title: 'Basic Installer', type: 'installer', description: 'Build an installer from an existing .aoapp package path in your server-owned VFS.',
    files: {
      'aetheros.project.json': { id: 'basic-installer', name: 'Basic Installer', type: 'installer', version: '1.0.0', entrypoint: 'installer.json', executionModel: 'server-mediated-installer' },
      'installer.json': { packagePath: 'Applications/hello-world.aoapp', installMode: 'default', startAfterInstall: false, displayName: 'My AetherOS Package', publisher: 'Local developer', description: 'Installs an AetherOS package.' },
      'README.md': '# Installer Project\n\nSet `packagePath` in `installer.json` to an existing `.aoapp` file in your server-owned VFS, then compile. The output is a single `.aoi` installer package.\n'
    }
  }

];

function slug(value) {
  const out = String(value || '').toLowerCase().trim().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  if (!/^[a-z0-9][a-z0-9._-]{1,47}$/.test(out)) throw new Error('Project name must contain 2–48 letters, numbers, dots, underscores or hyphens.');
  return out;
}
function getTemplate(id) { const t = TEMPLATES.find(x => x.id === id); if (!t) throw new Error('Unknown project template.'); return t; }
function validateManifest(m) {
  if (!m || typeof m !== 'object' || !['standard-app','daemon','layer1','installer'].includes(m.type)) throw new Error('Invalid AetherOS project manifest or project type.');
  const id = slug(m.id); const name = String(m.name || '').trim(); if (!name || name.length > 80) throw new Error('Manifest name must be 1–80 characters.');
  if (!/^\d+\.\d+\.\d+$/.test(m.version || '')) throw new Error('Manifest version must use semantic version format, e.g. 1.0.0.');
  if (typeof m.entrypoint !== 'string' || !m.entrypoint || m.entrypoint.startsWith('/') || m.entrypoint.includes('\\') || m.entrypoint.includes('\0') || m.entrypoint.includes(':') || m.entrypoint.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid entrypoint.');
  if (m.type === 'installer' && !/\.json$/i.test(m.entrypoint)) throw new Error('Installer entrypoint must be a JSON configuration file.');
  if (m.type === 'standard-app' && !/\.html?$/i.test(m.entrypoint)) throw new Error('Standard App entrypoint must be an HTML file.');
  if (m.type === 'standard-app' && m.capabilities !== undefined && (!Array.isArray(m.capabilities) || m.capabilities.some(x => !['files.read','files.write'].includes(x)))) throw new Error('Standard App declares an unsupported capability.');
  if (m.type === 'daemon' && m.permissions !== undefined && (!Array.isArray(m.permissions) || m.permissions.some(x => typeof x !== 'string' || x.length > 100))) throw new Error('Invalid daemon permissions.');
  if (m.type === 'layer1' && m.permissions !== undefined && (!Array.isArray(m.permissions) || m.permissions.some(x => typeof x !== 'string' || x.length > 100))) throw new Error('Invalid Layer 1 permissions.');
  if (m.type === 'layer1' && m.approvalRequired !== true) throw new Error('Layer 1 projects must explicitly require administrator approval.');
  return { ...m, id, name };
}
function validateBundle(bundle) {
  if (!bundle || bundle.format !== 'AETHEROS_AOAPP' || bundle.formatVersion !== 1 || !bundle.files || typeof bundle.files !== 'object') throw new Error('Unsupported .aoapp package.');
  const manifest = validateManifest(bundle.manifest); const entries = Object.entries(bundle.files); if (!entries.length || entries.length > 200) throw new Error('Invalid .aoapp file count.');
  let total = 0;
  for (const [name, item] of entries) {
    if (!name || name.startsWith('/') || name.includes('\\') || name.includes(':') || name.includes('\0') || name.split('/').some(part => !part || part === '.' || part === '..') || !item || item.encoding !== 'base64' || typeof item.data !== 'string') throw new Error('Invalid .aoapp file entry.');
    const data = Buffer.from(item.data, 'base64'); total += data.length;
    if (data.toString('base64') !== item.data || data.length > 2 * 1024 * 1024 || data.length !== item.size || crypto.createHash('sha256').update(data).digest('hex') !== item.sha256) throw new Error('AOAPP integrity check failed for ' + name + '.');
  }
  if (total > 10 * 1024 * 1024 || !bundle.files[manifest.entrypoint] || !bundle.files['aetheros.project.json']) throw new Error('Invalid .aoapp contents.');
  const embedded = JSON.parse(Buffer.from(bundle.files['aetheros.project.json'].data, 'base64').toString('utf8'));
  const embeddedManifest = validateManifest(embedded);
  const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}' : JSON.stringify(value);
  if (canonical(embeddedManifest) !== canonical(manifest)) throw new Error('AOAPP manifest does not match its project file.');
  return bundle;
}
function compileBundle(manifest, files) {
  const normalized = validateManifest(manifest); const packed = {}; let total = 0;
  for (const [name, content] of Object.entries(files)) {
    if (!name || name.startsWith('/') || name.includes(':') || name.split('/').some(part => !part || part === '.' || part === '..') || name.includes('\\') || name.includes('\0')) throw new Error('Unsafe project file path.');
    const data = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8'); total += data.length;
    if (data.length > 2 * 1024 * 1024 || total > 10 * 1024 * 1024) throw new Error('Project exceeds the 10 MiB package limit or a file exceeds 2 MiB.');
    packed[name] = { encoding: 'base64', data: data.toString('base64'), sha256: crypto.createHash('sha256').update(data).digest('hex'), size: data.length };
  }
  if (!packed['aetheros.project.json']) throw new Error('Project manifest is missing.');
  if (!packed[normalized.entrypoint]) throw new Error('Project entrypoint does not exist.');
  return { format: 'AETHEROS_AOAPP', formatVersion: 1, manifest: normalized, files: packed, compiledAt: new Date().toISOString(), trust: normalized.type === 'standard-app' ? 'sandboxed' : 'requires-admin-approval' };
}
module.exports = { TEMPLATES, getTemplate, slug, validateManifest, compileBundle, validateBundle };
