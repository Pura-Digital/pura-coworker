'use strict';
const { buildSync } = require('esbuild');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.tmp/anonymization-service-smoke.cjs');
buildSync({
  entryPoints: [path.join(root, 'tests/anonymization-service-smoke.ts')],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
});
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
if (process.argv.includes('--download')) env.AIDEN_PII_SMOKE_FORCE_DOWNLOAD = '1';
const result = spawnSync(require('electron'), [output], { cwd: root, env, stdio: 'inherit' });
process.exit(result.status ?? 1);
