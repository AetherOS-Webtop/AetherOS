#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const configPath = path.join(__dirname, '..', 'config.json');
let config = { port: 6969, dataDirectory: 'data' };
try { config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) }; } catch {}
const tokenPath = path.resolve(__dirname, '..', config.dataDirectory || 'data', 'control.token');
const [command, id] = process.argv.slice(2);
const allowed = ['start', 'stop', 'enable', 'disable', 'status', 'list'];
if (!allowed.includes(command)) { console.error('Usage: aetherctl <start|stop|enable|disable|status|list> [daemon-id]'); process.exit(2); }
if (command !== 'list' && !id) { console.error('A daemon ID is required.'); process.exit(2); }
let token; try { token = fs.readFileSync(tokenPath, 'utf8').trim(); } catch { console.error('Cannot read local control token. Is AetherOS initialized?'); process.exit(1); }
const body = JSON.stringify({ id });
const req = http.request({ hostname: '127.0.0.1', port: Number(process.env.AETHEROS_PORT || config.port), path: '/_control/daemons/' + command, method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
  let data = ''; res.setEncoding('utf8'); res.on('data', c => data += c); res.on('end', () => { let result; try { result = JSON.parse(data); } catch { result = { error: data }; } if (res.statusCode >= 400) { console.error(result.error || 'Control request failed.'); process.exitCode = 1; } else console.log(JSON.stringify(result.daemons ?? result.daemon ?? result, null, 2)); });
});
req.on('error', e => { console.error('Cannot reach AetherOS control endpoint: ' + e.message); process.exitCode = 1; }); req.end(body);
