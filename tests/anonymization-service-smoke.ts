/** Runs in a real Electron main process; intentionally excluded from ordinary Vitest discovery. */
import { app, powerSaveBlocker } from 'electron';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { LocalAnonymizationService } from '../src/main/anonymization/local-service';
import manifest from '../src/main/anonymization/model-manifest.json';

let service: LocalAnonymizationService | undefined;
let temporary: string | undefined;
let blocker: number | undefined;
void app.whenReady().then(async () => {
  // This headless test has no visible window; keep it active during native CPU work.
  blocker = powerSaveBlocker.start('prevent-app-suspension');
  app.dock?.hide();
  temporary = await fs.mkdtemp(path.join(tmpdir(), 'aiden-pii-native-'));
  app.setPath('userData', temporary);
  service = new LocalAnonymizationService();
  const cache = path.resolve(process.env.AIDEN_PII_SMOKE_MODEL_PATH || '.cache/anonymization-model');
  if (process.env.AIDEN_PII_SMOKE_FORCE_DOWNLOAD === '1') {
    await service.download();
  } else {
    await fs.mkdir(service.modelDirectory, { recursive: true });
    for (const file of manifest.files) {
      try { await fs.link(path.join(cache, file.name), path.join(service.modelDirectory, file.name)); }
      catch { await fs.copyFile(path.join(cache, file.name), path.join(service.modelDirectory, file.name)); }
    }
    await fs.writeFile(path.join(service.modelDirectory, 'verified.json'), JSON.stringify({ revision: manifest.revision }));
  }
  await service.initialize();
  assert.equal(service.status().model, 'ready');
  const states: string[] = [];
  service.on('status', status => states.push(status.service));
  console.log('Native smoke: initial inference');
  const detected = await service.analyze('Mi chiamo Mario Rossi e la mia email è mario.rossi@example.com.');
  assert(detected.entities.some(entity => entity.label === 'FULLNAME'));
  assert(detected.entities.some(entity => entity.label === 'EMAIL'));
  assert.equal(detected.complex, false);
  console.log('Native smoke: dense prompt inference');
  const dense = await service.analyze(Array(120).fill('Read configuration https://example.com/tools/long-path-with-many-parts?key=parameter&value=example').join(' '));
  assert(Array.isArray(dense.entities));
  const document = path.join(temporary, 'document.txt');
  console.log('Native smoke: document extraction');
  await fs.writeFile(document, 'Cliente: Mario Rossi');
  assert.equal((await service.extract(document)).text, 'Cliente: Mario Rossi');
  await service.restart();
  assert.equal(service.status().service, 'ready');
  assert(states.includes('starting') && states.includes('ready') && states.includes('stopped'));
  console.log('PASS: verified model, native offline inference, document extraction, service restart');
}).then(async () => {
  service?.stop();
  if (blocker !== undefined) powerSaveBlocker.stop(blocker);
  if (temporary) await fs.rm(temporary, { recursive: true, force: true });
  app.exit(0);
}).catch(async error => {
  service?.stop();
  if (blocker !== undefined) powerSaveBlocker.stop(blocker);
  console.error('Native anonymization smoke test failed:', error instanceof Error ? error.message : String(error));
  if (temporary) await fs.rm(temporary, { recursive: true, force: true });
  app.exit(1);
});
