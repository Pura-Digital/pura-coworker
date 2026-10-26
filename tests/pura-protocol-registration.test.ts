import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const registrationPath = path.resolve(
  process.cwd(),
  'src/main/pura/pura-protocol-registration.ts'
);

describe('Aiden custom protocol registration', () => {
  it('registers with resolved app path in dev (not bare Electron)', () => {
    const source = fs.readFileSync(registrationPath, 'utf8');
    expect(source).toContain('path.resolve');
    expect(source).toContain('shouldRegisterProtocolWithAppArg');
    expect(source).toContain('process.defaultApp');
    expect(source).toContain('isElectronBinaryExec');
  });

  it('re-registers on app ready from main index', () => {
    const indexSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/main/index.ts'),
      'utf8'
    );
    expect(indexSource).toContain('ensureAidenCustomProtocolRegistered');
    expect(indexSource).toContain('app.requestSingleInstanceLock()');
  });
});
