#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const archFlag = process.arch === 'arm64' ? '--arm64' : '--x64';

const steps = [
  ['npm', ['run', 'prepare:anonymization']],
  ['npm', ['run', 'download:node']],
  ['npm', ['run', 'prepare:gui-tools']],
  ['npm', ['run', 'prepare:python']],
  ['npm', ['run', 'build:wsl-agent']],
  ['npm', ['run', 'build:lima-agent']],
  ['npm', ['run', 'build:mcp']],
  ['npx', ['tsc']],
  ['npx', ['vite', 'build']],
  ['node', [path.join(__dirname, 'pre-build-check.js')]],
  [
    'npx',
    // `dir` + afterAllArtifactBuild (compress-dmg.js) — avoids dmgbuild size limits.
    ['electron-builder', '--mac', 'dir', archFlag, '--publish', 'never'],
  ],
];

for (const [command, args] of steps) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.status !== 0) process.exit(result.status || 1);
}
