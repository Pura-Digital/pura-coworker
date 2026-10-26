import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { app } from 'electron';
import type { AnonymizationStatus } from '../../shared/anonymization-types';
import manifest from './model-manifest.json';

export interface PiiEntity {
  label: string;
  start: number;
  end: number;
  score: number;
}
export interface Analysis {
  entities: PiiEntity[];
  /** Legacy worker flag for uncertain candidates; these are still maskable. */
  complex: boolean;
}

export class LocalAnonymizationService extends EventEmitter {
  private process?: ChildProcessWithoutNullStreams;
  private startPromise?: Promise<void>;
  private downloadPromise?: Promise<void>;
  private downloadController?: AbortController;
  private pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private snapshot: AnonymizationStatus = {
    model: 'missing',
    service: 'stopped',
    downloadedBytes: 0,
    totalBytes: manifest.files.reduce((n, f) => n + f.bytes, 0),
  };
  readonly root = path.join(app.getPath('userData'), 'anonymization');
  readonly modelDirectory = path.join(this.root, `rizzo-pii-${manifest.version}`);

  status(): AnonymizationStatus {
    return { ...this.snapshot };
  }
  private update(patch: Partial<AnonymizationStatus>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit('status', this.status());
  }
  async initialize(): Promise<void> {
    if (this.snapshot.model !== 'missing') return;
    try {
      const marker = await fs.readFile(path.join(this.modelDirectory, 'verified.json'), 'utf8');
      if (JSON.parse(marker).revision !== manifest.revision) return;
      for (const file of manifest.files) {
        if ((await fs.stat(path.join(this.modelDirectory, file.name))).size !== file.bytes) return;
      }
      this.update({ model: 'ready' });
    } catch {
      /* A missing or incomplete model is not ready. */
    }
  }
  download(): Promise<void> {
    if (this.downloadPromise) return this.downloadPromise;
    this.downloadPromise = this.downloadModel().finally(() => {
      this.downloadPromise = undefined;
    });
    return this.downloadPromise;
  }
  cancelDownload(): void {
    this.downloadController?.abort();
    if (this.snapshot.model === 'downloading' && this.process) this.stop();
  }
  private async downloadModel(): Promise<void> {
    if (this.snapshot.model === 'ready') return;
    const controller = new AbortController();
    this.downloadController = controller;
    const temporary = `${this.modelDirectory}.partial`;
    this.update({ model: 'downloading', downloadedBytes: 0, error: undefined });
    try {
      await fs.access(this.workerExecutable());
      await fs.rm(temporary, { recursive: true, force: true });
      await fs.mkdir(temporary, { recursive: true, mode: 0o700 });
      let downloaded = 0;
      let lastUpdate = 0;
      for (const file of manifest.files) {
        const response = await fetch(
          `https://huggingface.co/${manifest.repository}/resolve/${manifest.revision}/${file.name}`,
          { signal: controller.signal }
        );
        if (!response.ok || !response.body) throw new Error('Model download failed');
        const handle = await fs.open(path.join(temporary, file.name), 'w', 0o600);
        const hash = createHash('sha256');
        let size = 0;
        try {
          for await (const chunk of Readable.fromWeb(
            response.body as import('node:stream/web').ReadableStream<Uint8Array>
          )) {
            await handle.writeFile(chunk);
            hash.update(chunk);
            size += chunk.length;
            downloaded += chunk.length;
            if (Date.now() - lastUpdate > 150) {
              this.update({ downloadedBytes: downloaded });
              lastUpdate = Date.now();
            }
          }
        } finally {
          await handle.close();
        }
        if (size !== file.bytes || hash.digest('hex') !== file.sha256)
          throw new Error('Model integrity verification failed');
      }
      await fs.writeFile(
        path.join(temporary, 'verified.json'),
        JSON.stringify({ revision: manifest.revision }),
        { mode: 0o600 }
      );
      // Validate actual inference before publishing the downloaded directory.
      await this.startAt(temporary);
      const probe = await this.analyze('Mario Rossi, mario.rossi@example.com', controller.signal);
      if (!probe.entities.length) throw new Error('Local inference verification failed');
      this.stop();
      if (controller.signal.aborted) throw new Error('Download cancelled');
      await fs.rm(this.modelDirectory, { recursive: true, force: true });
      await fs.rename(temporary, this.modelDirectory);
      this.update({ model: 'ready', downloadedBytes: downloaded, error: undefined });
    } catch (error) {
      this.stop();
      await fs.rm(temporary, { recursive: true, force: true });
      this.update({
        model: controller.signal.aborted ? 'missing' : 'error',
        error: controller.signal.aborted
          ? undefined
          : 'Download o verifica del modello non riusciti.',
      });
      if (!controller.signal.aborted) throw error;
    } finally {
      this.downloadController = undefined;
    }
  }
  async start(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new Error('Richiesta annullata.');
    const started = this.ensureStarted();
    if (!signal) return started;
    return new Promise<void>((resolve, reject) => {
      const abort = () => {
        signal.removeEventListener('abort', abort);
        reject(new Error('Richiesta annullata.'));
      };
      signal.addEventListener('abort', abort, { once: true });
      started.then(
        () => {
          signal.removeEventListener('abort', abort);
          resolve();
        },
        (error) => {
          signal.removeEventListener('abort', abort);
          reject(error);
        }
      );
    });
  }
  private async ensureStarted(): Promise<void> {
    if (this.snapshot.service === 'ready' && this.process) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = (async () => {
      if (this.snapshot.model !== 'ready') await this.initialize();
      if (this.snapshot.model !== 'ready')
        throw new Error('Modello di anonimizzazione non scaricato.');
      // Detect tampering/corruption after the initial download as well.
      for (const file of manifest.files) {
        const hash = createHash('sha256');
        try {
          for await (const chunk of createReadStream(path.join(this.modelDirectory, file.name)))
            hash.update(chunk);
        } catch {
          this.update({ model: 'error' });
          throw new Error('File del modello non disponibile: scaricarlo nuovamente.');
        }
        if (hash.digest('hex') !== file.sha256) {
          this.update({ model: 'error' });
          throw new Error('Modello locale danneggiato: scaricarlo nuovamente.');
        }
      }
      await this.startAt(this.modelDirectory);
    })()
      .catch((error) => {
        this.update({
          service: 'error',
          error: 'Servizio locale non pronto. Verifica il modello e riprova.',
        });
        throw error;
      })
      .finally(() => {
        this.startPromise = undefined;
      });
    return this.startPromise;
  }
  private workerExecutable(): string {
    const suffix = process.platform === 'win32' ? '.exe' : '';
    const base = app.isPackaged
      ? path.join(process.resourcesPath, 'anonymization')
      : path.join(
          process.cwd(),
          '.bundle-resources',
          'anonymization',
          `${process.platform}-${process.arch}`
        );
    return path.join(base, 'rizzo-worker', `rizzo-worker${suffix}`);
  }
  private async startAt(directory: string): Promise<void> {
    this.update({ service: 'starting', error: undefined });
    const executable = this.workerExecutable();
    const child = spawn(executable, [directory], {
      stdio: 'pipe',
      windowsHide: true,
      env: {
        ...process.env,
        HF_HUB_OFFLINE: '1',
        TRANSFORMERS_OFFLINE: '1',
        HF_HUB_DISABLE_TELEMETRY: '1',
        // Keep CPU inference from oversubscribing the desktop during long prompts.
        OMP_NUM_THREADS: '2',
        MKL_NUM_THREADS: '2',
      },
    });
    this.process = child;
    child.stderr.resume(); // Never log document content emitted by a library.
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('Avvio servizio scaduto.'));
      }, 120_000);
      const fail = () => {
        clearTimeout(timeout);
        if (this.process === child) {
          this.process = undefined;
          this.update({
            service: 'error',
            error: 'Servizio locale di anonimizzazione non disponibile.',
          });
          for (const request of this.pending.values())
            request.reject(new Error('Servizio locale interrotto.'));
          this.pending.clear();
        }
        reject(new Error('Servizio locale di anonimizzazione non disponibile.'));
      };
      child.on('error', fail);
      child.on('exit', fail);
      createInterface({ input: child.stdout }).on('line', (line) => {
        try {
          const message = JSON.parse(line);
          if (message.ready) {
            clearTimeout(timeout);
            if (this.process !== child) {
              reject(new Error('Avvio annullato.'));
              return;
            }
            this.update({ service: 'ready' });
            resolve();
          } else {
            const request = this.pending.get(message.id);
            this.pending.delete(message.id);
            if (message.error) {
              if (message.kind === 'service') {
                this.stop();
                this.update({
                  service: 'error',
                  error: 'Inferenza locale non riuscita. Riavvia il servizio.',
                });
              }
              request?.reject(new Error('Contenuto non elaborabile interamente in locale.'));
            } else request?.resolve(message.result);
          }
        } catch {
          child.kill();
        }
      });
    });
  }
  private async request<T>(payload: object, signal?: AbortSignal): Promise<T> {
    await this.start(signal);
    if (signal?.aborted) throw new Error('Richiesta annullata.');
    const id = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        this.pending.delete(id);
      };
      const abort = () => {
        cleanup();
        reject(new Error('Richiesta annullata.'));
      };
      const timeout = setTimeout(() => {
        cleanup();
        this.stop();
        this.update({
          service: 'error',
          error: 'Elaborazione locale scaduta. Riavvia il servizio.',
        });
        reject(new Error('Elaborazione locale scaduta.'));
      }, 120_000);
      signal?.addEventListener('abort', abort, { once: true });
      this.pending.set(id, {
        resolve: (value) => {
          cleanup();
          resolve(value as T);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
      });
      this.process!.stdin.write(JSON.stringify({ id, ...payload }) + '\n', (error) => {
        if (error) {
          cleanup();
          reject(new Error('Servizio locale non disponibile.'));
        }
      });
    });
  }
  analyze(text: string, signal?: AbortSignal): Promise<Analysis> {
    return this.request({ method: 'analyze', text }, signal);
  }
  extract(filename: string, signal?: AbortSignal): Promise<{ text: string }> {
    return this.request({ method: 'extract', path: filename }, signal);
  }
  async restart(): Promise<void> {
    this.stop();
    await this.start();
  }
  stop(): void {
    const child = this.process;
    this.process = undefined;
    child?.kill();
    for (const request of this.pending.values()) request.reject(new Error('Servizio riavviato.'));
    this.pending.clear();
    this.update({ service: 'stopped' });
  }
}
