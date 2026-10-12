'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

if (process.platform !== 'darwin') process.exit(0);
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'resources/anonymization/keychain-access.m');
const target = path.join(root, '.bundle-resources/anonymization', `darwin-${process.arch}`);
const executable = path.join(target, 'aiden-keychain-access');
const marker = path.join(target, 'keychain-fingerprint');
const fingerprint = createHash('sha256').update(fs.readFileSync(source)).digest('hex');
if (
  fs.existsSync(executable) &&
  fs.existsSync(marker) &&
  fs.readFileSync(marker, 'utf8') === fingerprint
)
  process.exit(0);
fs.mkdirSync(target, { recursive: true });
const result = spawnSync(
  'xcrun',
  [
    'clang',
    '-Os',
    '-Wno-deprecated-declarations',
    '-framework',
    'Security',
    '-framework',
    'AppKit',
    source,
    '-o',
    executable,
  ],
  { stdio: 'inherit' }
);
if (result.status !== 0) process.exit(result.status || 1);
fs.writeFileSync(marker, fingerprint);
console.log('Built native macOS Keychain authorization helper.');
