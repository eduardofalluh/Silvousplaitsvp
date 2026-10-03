const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const toml = fs.readFileSync(path.join(__dirname, '..', 'netlify.toml'), 'utf8');
const csp = toml.match(/Content-Security-Policy = "([^"]+)"/)[1];
const directive = (name) => (csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' ')) || '').split(/\s+/);

test('CSP lets the Meta pixel reach Meta and its Conversions API Gateway', () => {
  const connect = directive('connect-src');
  for (const host of [
    'https://www.facebook.com',
    'https://sl-11a463aaedf44600a99367660fd6fa70.ecs.us-east-1.on.aws',
    'https://bded8a3c6ae-1-1053047382554.us-central1.run.app',
  ]) assert.ok(connect.includes(host), `connect-src is missing ${host}`);
  assert.ok(directive('script-src').includes('https://connect.facebook.net'));
  assert.ok(!connect.some((h) => /\*\.(on\.aws|run\.app)$/.test(h)), 'gateway hosts must stay exact, not wildcards');
});
