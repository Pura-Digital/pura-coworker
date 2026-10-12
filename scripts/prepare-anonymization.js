'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const target = path.join(
  root,
  '.bundle-resources/anonymization',
  `${process.platform}-${process.arch}`
);
const executable = path.join(
  target,
  'rizzo-worker',
  process.platform === 'win32' ? 'rizzo-worker.exe' : 'rizzo-worker'
);
const sources = [
  'resources/anonymization/worker.py',
  'resources/anonymization/requirements.txt',
  'resources/anonymization/vendor/inference.py',
  'resources/anonymization/vendor/detectors.py',
  'scripts/prepare-anonymization.py',
];
const hash = crypto.createHash('sha256');
for (const source of sources) hash.update(fs.readFileSync(path.join(root, source)));
const fingerprint = hash.digest('hex');
const marker = path.join(target, 'build-fingerprint');
if (
  fs.existsSync(executable) &&
  fs.existsSync(marker) &&
  fs.readFileSync(marker, 'utf8') === fingerprint
) {
  console.log('Local anonymization runtime is up to date.');
  process.exit(0);
}
const candidates =
  process.platform === 'win32'
    ? [['py', '-3.11'], ['python'], ['python3']]
    : [['python3.11'], ['python3']];
for (const [command, ...prefix] of candidates) {
  const probe = spawnSync(command, [
    ...prefix,
    '-c',
    'import sys; sys.exit(0 if (3,11) <= sys.version_info[:2] <= (3,12) else 1)',
  ]);
  if (probe.status !== 0) continue;
  const result = spawnSync(
    command,
    [...prefix, path.join(root, 'scripts/prepare-anonymization.py')],
    { cwd: root, stdio: 'inherit' }
  );
  if (result.status !== 0) process.exit(result.status || 1);
  fs.writeFileSync(marker, fingerprint);
  process.exit(0);
}
console.error(
  'Building Aiden requires Python 3.11 or 3.12 for the bundled PII runtime. End users do not need Python.'
);
process.exit(1);
