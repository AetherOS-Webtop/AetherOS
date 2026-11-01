'use strict';
const crypto = require('node:crypto');
const { validateBundle, validateManifest } = require('./ide');
const MAX_INSTALLER = 25 * 1024 * 1024;
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function compileInstaller(manifest, config, appBundle) {
  manifest = validateManifest(manifest);
  if (manifest.type !== 'installer') throw new Error('Invalid Installer Project manifest.');
  validateBundle(appBundle);
  if (appBundle.manifest.type === 'installer') throw new Error('Nested installers are not supported.');
  const payload = Buffer.from(JSON.stringify(appBundle));
  const result = {
    format: 'AETHEROS_INSTALLER', formatVersion: 1,
    manifest: { id: manifest.id, name: manifest.name, version: manifest.version, type: 'installer' },
    installer: {
      displayName: String(config.displayName || appBundle.manifest.name).slice(0, 100),
      publisher: String(config.publisher || 'Unknown publisher').slice(0, 100),
      description: String(config.description || '').slice(0, 500),
      installMode: 'default', startAfterInstall: config.startAfterInstall === true
    },
    payload: { encoding: 'base64', data: payload.toString('base64'), size: payload.length, sha256: digest(payload) },
    target: { type: appBundle.manifest.type, id: appBundle.manifest.id, version: appBundle.manifest.version },
    compiledAt: new Date().toISOString()
  };
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_INSTALLER) throw new Error('Installer exceeds 25 MiB.');
  return result;
}
function validateInstaller(pkg) {
  if (!pkg || pkg.format !== 'AETHEROS_INSTALLER' || pkg.formatVersion !== 1 || !pkg.installer || typeof pkg.installer !== 'object' || !pkg.payload || pkg.payload.encoding !== 'base64' || typeof pkg.payload.data !== 'string') throw new Error('Unsupported .aoi installer package.');
  const bytes = Buffer.from(pkg.payload.data || '', 'base64');
  if (bytes.toString('base64') !== pkg.payload.data || bytes.length !== pkg.payload.size || bytes.length > MAX_INSTALLER || digest(bytes) !== pkg.payload.sha256) throw new Error('Installer payload integrity check failed.');
  let bundle; try { bundle = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Installer payload is not valid AOAPP JSON.'); }
  validateBundle(bundle);
  if (pkg.target?.id !== bundle.manifest.id || pkg.target?.type !== bundle.manifest.type || pkg.target?.version !== bundle.manifest.version) throw new Error('Installer target metadata does not match its payload.');
  return { pkg, bundle };
}
module.exports = { compileInstaller, validateInstaller, MAX_INSTALLER };
