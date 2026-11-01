'use strict';
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', 'config.json');
const defaults = { port: 6969, dataDirectory: 'data', sessionDirectory: 'sessions', sessionMaxAgeMs: 86400000 };
function validate(input = {}) {
  const port = Number(input.port ?? defaults.port);
  const sessionMaxAgeMs = Number(input.sessionMaxAgeMs ?? defaults.sessionMaxAgeMs);
  for (const [name, value, min, max] of [['port',port,1024,65535],['sessionMaxAgeMs',sessionMaxAgeMs,60000,2592000000]])
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}.`);
  const safeDir = (value, fallback) => typeof value === 'string' && value.trim() && !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..') ? value : fallback;
  return { port, sessionMaxAgeMs, dataDirectory: safeDir(input.dataDirectory, defaults.dataDirectory), sessionDirectory: safeDir(input.sessionDirectory, defaults.sessionDirectory) };
}
function loadConfig() {
  try { return validate(JSON.parse(fs.readFileSync(file,'utf8'))); }
  catch (e) { if (e.code !== 'ENOENT') console.error('[config] Invalid config; defaults used:',e.message); return {...defaults}; }
}
function saveConfig(value) {
  const config=validate(value), temp=file+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(config,null,2),{mode:0o600}); fs.renameSync(temp,file); return config;
}
module.exports={loadConfig,saveConfig};
