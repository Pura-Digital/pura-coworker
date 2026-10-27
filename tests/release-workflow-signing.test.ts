import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';

const workflow = parse(fs.readFileSync('.github/workflows/release.yml', 'utf8'));
const prepare = workflow.jobs['build-macos'].steps.find(
  (step: { name?: string }) => step.name === 'Prepare macOS signing keychain'
).run;
const roots: string[] = [];
afterEach(() =>
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }))
);

function prepareWithMockSecurity(failImport = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pura-signing-test-'));
  roots.push(root);
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const log = path.join(root, 'security-log');
  const githubEnv = path.join(root, 'github-env');
  fs.writeFileSync(githubEnv, '');
  fs.writeFileSync(
    path.join(bin, 'security'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PURA_SECURITY_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'list-keychains' && !args.includes('-s')) console.log(JSON.stringify('/Users/runner/Library/Keychains/login.keychain-db'));
if (args[0] === 'create-keychain') fs.writeFileSync(args.at(-1), 'test-keychain');
if (args[0] === 'delete-keychain') fs.rmSync(args.at(-1), { force: true });
if (args[0] === 'import') {
  if (fs.readFileSync(args[1], 'utf8') !== 'test-p12') process.exit(41);
  if (process.env.PURA_FAIL_IMPORT === '1') process.exit(9);
}
if (args[0] === 'find-identity') console.log('1) AABBCCDDEEFF "Developer ID Application: Test"');
`,
    { mode: 0o755 }
  );
  fs.writeFileSync(path.join(bin, 'codesign'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const result = spawnSync('bash', ['-c', prepare], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      RUNNER_TEMP: root,
      GITHUB_RUN_ID: 'test',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_ENV: githubEnv,
      CSC_LINK: Buffer.from('test-p12').toString('base64'),
      CSC_KEY_PASSWORD: 'certificate-export-password',
      PURA_SECURITY_LOG: log,
      PURA_FAIL_IMPORT: failImport ? '1' : '0',
    },
  });
  const calls = fs
    .readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as string[]);
  return { root, githubEnv, result, calls };
}

describe('release signing keychain', () => {
  it('uses the keychain password for unlocking and ACLs, and the certificate password for importing', () => {
    const { root, githubEnv, result, calls } = prepareWithMockSecurity();
    expect(result.status, result.stderr).toBe(0);
    const create = calls.find((args) => args[0] === 'create-keychain')!;
    const password = create[create.indexOf('-p') + 1];
    expect(password).not.toBe('certificate-export-password');
    expect(password).not.toBe('');
    for (const [command, flag] of [
      ['unlock-keychain', '-p'],
      ['set-key-partition-list', '-k'],
    ]) {
      const call = calls.find((args) => args[0] === command)!;
      expect(call[call.indexOf(flag) + 1]).toBe(password);
    }
    const imported = calls.find((args) => args[0] === 'import')!;
    expect(imported[imported.indexOf('-P') + 1]).toBe('certificate-export-password');
    expect(fs.existsSync(imported[1])).toBe(false);
    const keychain = path.join(root, 'pura-signing-test-1.keychain-db');
    expect(fs.readFileSync(githubEnv, 'utf8')).toBe(`CSC_KEYCHAIN=${keychain}\n`);
    expect(fs.existsSync(keychain)).toBe(true);
    const search = calls.find((args) => args[0] === 'list-keychains' && args.includes('-s'))!;
    expect(search.slice(4)).toEqual([keychain, '/Users/runner/Library/Keychains/login.keychain-db']);
  });

  it('removes the certificate and partial keychain if importing fails', () => {
    const { root, githubEnv, result, calls } = prepareWithMockSecurity(true);
    expect(result.status).not.toBe(0);
    expect(calls.some((args) => args[0] === 'delete-keychain')).toBe(true);
    expect(fs.readdirSync(root).filter((name) => name.startsWith('pura-signing-'))).toEqual([]);
    expect(fs.readFileSync(githubEnv, 'utf8')).toBe('');
  });
});
