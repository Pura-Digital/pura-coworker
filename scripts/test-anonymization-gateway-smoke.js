'use strict';
const { buildSync } = require('esbuild');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.tmp/anonymization-gateway-smoke.mjs');
buildSync({
  entryPoints: [path.join(root, 'tests/anonymization-gateway-smoke.ts')],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
});
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const result = spawnSync(require('electron'), [output], { cwd: root, env, stdio: 'inherit' });
process.exit(result.status ?? 1);
