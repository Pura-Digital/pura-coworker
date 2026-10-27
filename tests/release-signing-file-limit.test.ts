import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';

const workflow = parse(fs.readFileSync('.github/workflows/release.yml', 'utf8'));
const run = workflow.jobs['build-macos'].steps.find(
  (step: { name?: string }) => step.name === 'Electron Builder (signed + notarized)'
).run as string;
const writer = run.match(/node - <<'JS'\n([\s\S]*?)\nJS/)![1];
const roots: string[] = [];
afterEach(() =>
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }))
);

function scan(preload: boolean) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pura-signing-fd-test-'));
  roots.push(root);
  const input = path.join(root, 'runtime');
  fs.mkdirSync(input);
  for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(input, `${i}.h`), 'void inference();\n');
  fs.writeFileSync(path.join(input, 'runtime.node'), Buffer.from([0, 255, 0, 255]));
  const prepared = spawnSync(process.execPath, ['-e', writer], {
    env: { ...process.env, RUNNER_TEMP: root },
    encoding: 'utf8',
  });
  expect(prepared.status, prepared.stderr).toBe(0);
  const probe = path.join(root, 'scan.cjs');
  fs.writeFileSync(
    probe,
    `
    const { walkAsync } = require(${JSON.stringify(require.resolve('@electron/osx-sign'))});
    walkAsync(process.argv[2]).then(files => {
      if (!files.some(file => file.endsWith('runtime.node'))) throw new Error('Native binary omitted');
      console.log('runtime scan complete');
    }).catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
  `
  );
  const args = preload ? ['--require', path.join(root, 'pura-build-fs.cjs')] : [];
  return spawnSync(
    'bash',
    ['-c', 'ulimit -n 64\nexec "$@"', 'scan', process.execPath, ...args, probe, input],
    {
      encoding: 'utf8',
      timeout: 10000,
    }
  );
}

describe.skipIf(process.platform === 'win32')(
  'release signing under a low file descriptor limit',
  () => {
    it('reproduces the upstream scanner error without the build preload', () => {
      const result = scan(false);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('EMFILE');
    }, 15000);

    it('scans the full runtime and retains native binaries with the build preload', () => {
      const result = scan(true);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('runtime scan complete');
    }, 15000);
  }
);
