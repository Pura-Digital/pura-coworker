'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

if (process.platform !== 'darwin') process.exit(0);
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'resources/anonymization/keychain-access.m');
const target = path.join(root, '.bundle-resources/anonymization', `darwin-${process.arch}`);
const bundle = path.join(target, 'Aiden Keychain Access.app');
const executable = path.join(bundle, 'Contents/MacOS/aiden-keychain-access');
const plist = path.join(root, 'resources/anonymization/keychain-access.plist');
const marker = path.join(target, 'keychain-fingerprint');
const fingerprint = createHash('sha256')
  .update(fs.readFileSync(source))
  .update(fs.readFileSync(plist))
  .update(fs.readFileSync(__filename))
  .digest('hex');
if (
  fs.existsSync(executable) &&
  fs.existsSync(marker) &&
  fs.readFileSync(marker, 'utf8') === fingerprint
)
  process.exit(0);
fs.mkdirSync(path.dirname(executable), { recursive: true });
fs.copyFileSync(plist, path.join(bundle, 'Contents/Info.plist'));
const result = spawnSync(
  'xcrun',
  [
    'clang',
    '-Os',
    '-fblocks',
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
const signed = spawnSync('codesign', ['--force', '--sign', '-', bundle], { stdio: 'inherit' });
if (signed.status !== 0) process.exit(signed.status || 1);
fs.writeFileSync(marker, fingerprint);
console.log('Built native macOS Keychain authorization helper.');
