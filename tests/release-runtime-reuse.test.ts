import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'yaml';

const workflow = parse(fs.readFileSync('.github/workflows/release.yml', 'utf8'));
const run = workflow.jobs['lint-and-test'].steps.find(
  (step: { name?: string }) =>
    step.name === 'Verify reusable runtime artifacts match the release commit'
).run as string;
const code = run.match(/node - <<'JS'\n([\s\S]*?)\nJS/)![1];
const targets = ['darwin-arm64', 'darwin-x64', 'win32-x64'];

async function verify(
  options: { commit?: string; failed?: string; expired?: string; id?: string } = {}
) {
  const process = {
    env: {
      RUNTIME_RUN_ID: options.id ?? '123',
      GITHUB_API_URL: 'https://api.github.test',
      GITHUB_REPOSITORY: 'example/app',
      GH_TOKEN: 'test-token',
    },
    exitCode: 0,
  };
  let requests = 0;
  const errors: string[] = [];
  await vm.runInNewContext(code, {
    process,
    console: { log: () => {}, error: (message: string) => errors.push(message) },
    require: (name: string) => {
      if (name !== 'node:child_process') throw new Error(`Unexpected import: ${name}`);
      return { execFileSync: () => 'release-commit\n' };
    },
    fetch: async (url: string) => {
      requests++;
      const value = url.includes('/jobs?')
        ? {
            jobs: targets.map((target) => ({
              name: `PII runtime (${target})`,
              conclusion: options.failed === target ? 'failure' : 'success',
            })),
          }
        : url.includes('/artifacts?')
          ? {
              artifacts: targets.map((target) => ({
                name: `pii-runtime-${target}`,
                expired: options.expired === target,
              })),
            }
          : { head_sha: options.commit ?? 'release-commit' };
      return { ok: true, json: async () => value };
    },
  });
  return { exitCode: process.exitCode, requests, errors };
}

describe('release runtime reuse', () => {
  it('accepts available runtimes successfully built from the exact release commit', async () => {
    expect((await verify()).exitCode).toBe(0);
  });
  it('rejects runtimes from another commit', async () => {
    expect((await verify({ commit: 'another-commit' })).exitCode).toBe(1);
  });
  it('rejects unsuccessful runtime builds', async () => {
    expect((await verify({ failed: 'darwin-arm64' })).exitCode).toBe(1);
  });
  it('rejects expired artifacts', async () => {
    expect((await verify({ expired: 'darwin-x64' })).exitCode).toBe(1);
  });
  it('rejects invalid run IDs before making any request', async () => {
    const result = await verify({ id: '../another-run' });
    expect(result.exitCode).toBe(1);
    expect(result.requests).toBe(0);
  });
});
