import { EventEmitter } from 'node:events';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { safeStorage } from 'electron';
import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  Context,
  AssistantMessage,
  AssistantMessageEvent,
  ThinkingContent,
} from '@mariozechner/pi-ai';
import { createAssistantMessageEventStream, streamSimple } from '@mariozechner/pi-ai';
import type { StreamFn } from '@mariozechner/pi-agent-core';
import type {
  AnonymizationAction,
  AnonymizationDecision,
  AnonymizationEvent,
} from '../../shared/anonymization-types';
import { AnonymizationMappingStore } from './mapping-store';
import { LocalAnonymizationService } from './local-service';
import { requestSystemStorageAccess, restartAppForSystemStorage } from './system-storage';
import {
  mapStringValues,
  PLACEHOLDER_PATTERN,
  TOKEN_LITERAL_PATTERN,
  restoreText,
  UnresolvedAnonymizationReference,
} from './restore';

interface RunContext {
  chatId: string;
  enabled: boolean;
  choices: Map<string, AnonymizationAction>;
}
export const anonymizationContext = new AsyncLocalStorage<RunContext>();
export function withAnonymization<T>(chatId: string, enabled: boolean, fn: () => T): T {
  return anonymizationContext.run({ chatId, enabled, choices: new Map() }, fn);
}

class AnonymizationCancelled extends Error {
  constructor() {
    super('Richiesta annullata durante l’anonimizzazione.');
  }
}

// Only these controlled messages may reach the UI; arbitrary inference errors
// can contain input data and must never be shown or logged here.
class AnonymizationStorageError extends Error {}

function storageUnavailable(): AnonymizationStorageError {
  return new AnonymizationStorageError(
    process.platform === 'darwin'
      ? 'Autorizzazione del Portachiavi macOS non completata: impossibile proteggere la chiave del matching. Usa il pulsante di autorizzazione per aprire la richiesta di macOS. La password viene gestita esclusivamente dal sistema. Se è necessario riavviare Aiden, il pulsante lo indica; la conversazione rimane salvata.'
      : 'Protezione della chiave del matching non disponibile nell’account di sistema corrente. Premi “Riavvia Aiden” per ritentare l’inizializzazione. Su Windows la protezione usa automaticamente DPAPI: non è richiesta una password separata.'
  );
}

export class AnonymizationGateway extends EventEmitter {
  readonly service = new LocalAnonymizationService();
  private store?: AnonymizationMappingStore;
  private storageAccessGranted = false;
  private storageAccessPromise?: Promise<void>;
  private keySensitivity = new Map<string, boolean>();
  private signedThinking = new Map<string, ThinkingContent>();
  private pending = new Map<
    string,
    {
      decision: AnonymizationDecision;
      resolve: (action: AnonymizationAction) => void;
      controller: AbortController;
    }
  >();
  constructor() {
    super();
    this.service.on('status', (status) => this.publish({ type: 'status', status }));
  }
  private publish(event: AnonymizationEvent): void {
    this.emit('event', event);
  }
  private async authorizeStorage(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new AnonymizationCancelled();
    if (this.store || this.storageAccessGranted) return;
    if (!this.storageAccessPromise) {
      this.storageAccessPromise = requestSystemStorageAccess(signal)
        .then(() => {
          this.storageAccessGranted = true;
        })
        .catch(() => {
          throw storageUnavailable();
        })
        .finally(() => {
          this.storageAccessPromise = undefined;
        });
    }
    await this.storageAccessPromise;
    if (signal?.aborted) throw new AnonymizationCancelled();
  }
  private mappingStore(): AnonymizationMappingStore {
    if (this.store) return this.store;
    if (!safeStorage.isEncryptionAvailable()) throw storageUnavailable();
    if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
      throw storageUnavailable();
    fs.mkdirSync(this.service.root, { recursive: true, mode: 0o700 });
    const keyFile = path.join(this.service.root, 'mapping-key.enc');
    let key: Buffer;
    if (fs.existsSync(keyFile)) {
      try {
        key = Buffer.from(safeStorage.decryptString(fs.readFileSync(keyFile)), 'hex');
      } catch {
        throw new AnonymizationStorageError(
          'Impossibile aprire la chiave del matching nel portachiavi del sistema. Usa il pulsante di autorizzazione e riavvio per ritentare dall’app. La chiave e il database esistenti sono stati conservati.'
        );
      }
    } else {
      if (fs.existsSync(path.join(this.service.root, 'matching.sqlite')))
        throw new AnonymizationStorageError('Chiave del matching non disponibile.');
      key = randomBytes(32);
      let encrypted: Buffer;
      try {
        encrypted = safeStorage.encryptString(key.toString('hex'));
      } catch {
        throw storageUnavailable();
      }
      fs.writeFileSync(keyFile, encrypted, {
        mode: 0o600,
        flag: 'wx',
      });
    }
    return this.openMappingStore(key);
  }
  private openMappingStore(key: Buffer): AnonymizationMappingStore {
    const candidate = new AnonymizationMappingStore(
      path.join(this.service.root, 'matching.sqlite'),
      key
    );
    try {
      candidate.validateKey();
    } catch {
      candidate.close();
      throw new AnonymizationStorageError('Chiave del matching non valida.');
    }
    this.store = candidate;
    return this.store;
  }
  decisions(): AnonymizationDecision[] {
    return [...this.pending.values()].map((p) => ({ ...p.decision }));
  }
  private existingMapping(chatId: string): Map<string, string> {
    try {
      return this.store?.entries(chatId) || new Map();
    } catch {
      return new Map();
    }
  }
  private async ask(
    chatId: string,
    kind: 'complex' | 'service',
    reason: string,
    signal?: AbortSignal,
    recovery?: 'system-storage'
  ): Promise<AnonymizationAction> {
    if (signal?.aborted) throw new AnonymizationCancelled();
    const decision: AnonymizationDecision = {
      id: randomUUID(),
      chatId,
      kind,
      reason,
      actions:
        kind === 'service'
          ? ['proceed', 'cancel', 'restart']
          : ['retry', 'exclude', 'cancel', 'proceed'],
      state: 'waiting',
      ...(recovery ? { recovery } : {}),
      ...(recovery ? { restartApp: true } : {}),
    };
    return new Promise((resolve) => {
      const controller = new AbortController();
      const finish = (action: AnonymizationAction) => {
        controller.abort();
        signal?.removeEventListener('abort', abort);
        this.pending.delete(decision.id);
        this.publish({ type: 'resolved', id: decision.id });
        resolve(action);
      };
      const abort = () => finish('cancel');
      signal?.addEventListener('abort', abort, { once: true });
      this.pending.set(decision.id, { decision, resolve: finish, controller });
      this.publish({ type: 'decision', decision });
    });
  }
  async decide(id: string, action: AnonymizationAction): Promise<void> {
    const item = this.pending.get(id);
    if (!item || !item.decision.actions.includes(action))
      throw new Error('Decisione non più disponibile.');
    if (item.decision.state === 'restarting' && action !== 'cancel') return;
    if (action !== 'restart') {
      item.resolve(action);
      return;
    }
    item.decision = { ...item.decision, state: 'restarting' };
    this.publish({ type: 'decision', decision: item.decision });
    try {
      if (item.decision.recovery === 'system-storage') {
        if (item.decision.restartApp) {
          try {
            await requestSystemStorageAccess(item.controller.signal);
          } catch {
            throw storageUnavailable();
          }
          if (!this.pending.has(id)) return;
          item.resolve('cancel');
          restartAppForSystemStorage();
          return;
        }
        this.storageAccessGranted = false;
      }
      await this.authorizeStorage(item.controller.signal);
      if (!this.pending.has(id)) return;
      this.mappingStore();
      await this.service.restart();
      if (this.pending.has(id)) item.resolve('retry');
    } catch (error) {
      if (!this.pending.has(id)) return;
      item.decision = {
        ...item.decision,
        state: 'waiting',
        reason:
          error instanceof AnonymizationStorageError
            ? error.message
            : 'Riavvio non riuscito. Puoi riprovare, annullare o inviare senza anonimizzazione.',
      };
      this.publish({ type: 'decision', decision: item.decision });
    }
  }
  async complex(
    chatId: string,
    reason: string,
    signal?: AbortSignal,
    fingerprint?: string
  ): Promise<AnonymizationAction> {
    const run = anonymizationContext.getStore();
    const key = fingerprint && createHash('sha256').update(fingerprint).digest('hex');
    const existing = key && run?.chatId === chatId ? run.choices.get(key) : undefined;
    if (existing) return existing;
    const action = await this.ask(chatId, 'complex', reason, signal);
    if (action === 'cancel') throw new AnonymizationCancelled();
    if (key && run?.chatId === chatId && action !== 'retry') run.choices.set(key, action);
    return action;
  }
  async document(
    chatId: string,
    filename: string,
    signal?: AbortSignal
  ): Promise<{ text?: string; excluded: boolean }> {
    for (;;) {
      if (signal?.aborted) throw new AnonymizationCancelled();
      try {
        const result = await this.service.extract(filename, signal);
        if (!result.text.trim()) throw new Error('Empty extraction');
        return { text: result.text, excluded: false };
      } catch {
        if (signal?.aborted) throw new AnonymizationCancelled();
        const kind = this.service.status().service === 'ready' ? 'complex' : 'service';
        const action =
          kind === 'complex'
            ? await this.complex(
                chatId,
                'Allegato senza testo estraibile, protetto, non supportato o con contenuti visivi. Nessun OCR o trascrizione è disponibile.',
                signal,
                `document:${filename}`
              )
            : await this.ask(
                chatId,
                'service',
                'Il servizio locale non ha potuto elaborare l’allegato.',
                signal
              );
        if (action === 'cancel') throw new AnonymizationCancelled();
        if (action === 'retry') continue;
        return { excluded: action === 'exclude' };
      }
    }
  }
  async prepare(
    chatId: string,
    context: Context,
    signal?: AbortSignal
  ): Promise<{ context: Context; mapping: Map<string, string>; bypass: boolean }> {
    for (;;) {
      if (signal?.aborted) throw new AnonymizationCancelled();
      try {
        await this.authorizeStorage(signal);
        this.mappingStore();
        await this.service.start(signal);
        const copy = structuredClone(context);
        const mask = (text: string) => this.mask(chatId, text, signal);
        if (copy.systemPrompt) copy.systemPrompt = await mask(copy.systemPrompt);
        for (const message of copy.messages) {
          if (typeof message.content === 'string') {
            message.content = await mask(message.content);
            continue;
          }
          const kept = [];
          for (const block of message.content) {
            if (block.type === 'image') {
              let action: AnonymizationAction;
              do {
                action = await this.complex(
                  chatId,
                  'Immagine o contenuto visivo non anonimizzabile nella prima versione.',
                  signal,
                  `image:${block.data}`
                );
              } while (action === 'retry');
              if (action === 'proceed') kept.push(block);
            } else {
              if (block.type === 'text') block.text = await mask(block.text);
              if (block.type === 'thinking') {
                const saved = this.signedThinking.get(
                  `${chatId}:${message.timestamp}:${createHash('sha256').update(block.thinking).digest('hex')}`
                );
                if (saved) Object.assign(block, saved);
                if (
                  block.redacted ||
                  (block.thinkingSignature &&
                    (!saved || !(await this.isSafeSignedThinking(chatId, block, signal))))
                ) {
                  let action: AnonymizationAction;
                  do {
                    action = await this.complex(
                      chatId,
                      'Blocco di ragionamento firmato: non può essere modificato mantenendo la firma del provider.',
                      signal,
                      JSON.stringify(block)
                    );
                  } while (action === 'retry');
                  if (action === 'exclude') continue;
                  if (!block.thinkingSignature) {
                    delete block.redacted;
                    block.thinking = 'Opaque reasoning omitted.';
                  }
                } else if (!block.thinkingSignature) block.thinking = await mask(block.thinking);
              }
              if (block.type === 'toolCall')
                block.arguments = await this.maskValues(chatId, block.arguments, signal);
              kept.push(block);
            }
          }
          // Context message arrays have a discriminated union of block types.
          Object.assign(message, { content: kept });
        }
        const lastUser = [...copy.messages].reverse().find((message) => message.role === 'user');
        if (
          lastUser &&
          (typeof lastUser.content === 'string'
            ? !lastUser.content.trim()
            : !lastUser.content.some(
                (block) => block.type === 'image' || (block.type === 'text' && block.text.trim())
              ))
        ) {
          throw new AnonymizationCancelled();
        }
        for (const tool of copy.tools || []) {
          tool.description = await mask(tool.description);
          tool.parameters = await this.maskSchema(chatId, tool.parameters, signal);
        }
        copy.systemPrompt = `${copy.systemPrompt || ''}\n\nPreserve opaque AIDEN anonymization tokens exactly in prose and tool argument string values. Never rename, renumber, expand, or guess their hidden values. Do not use these tokens as JSON keys, tool names, or numeric values. Use local tools for computations that require hidden values.`;
        return { context: copy, mapping: this.mappingStore().entries(chatId), bypass: false };
      } catch (error) {
        if (error instanceof AnonymizationCancelled || signal?.aborted) throw error;
        const action = await this.ask(
          chatId,
          'service',
          error instanceof AnonymizationStorageError
            ? error.message
            : 'Il gateway locale non è disponibile o non ha completato la protezione della richiesta.',
          signal,
          error instanceof AnonymizationStorageError ? 'system-storage' : undefined
        );
        if (action === 'cancel') throw new AnonymizationCancelled();
        if (action === 'proceed')
          return { context, mapping: this.existingMapping(chatId), bypass: true };
      }
    }
  }
  private async isSafeSignedThinking(
    chatId: string,
    block: ThinkingContent,
    signal?: AbortSignal
  ): Promise<boolean> {
    if (block.redacted) return false;
    const known = this.mappingStore().entries(chatId);
    const spans = [...block.thinking.matchAll(PLACEHOLDER_PATTERN)]
      .filter((match) => known.has(match[0]))
      .map((match) => ({
        start: Array.from(block.thinking.slice(0, match.index)).length,
        end: Array.from(block.thinking.slice(0, match.index)).length + Array.from(match[0]).length,
      }));
    const analysis = await this.service.analyze(block.thinking, signal);
    return analysis.entities.every((entity) =>
      spans.some((span) => entity.start >= span.start && entity.end <= span.end)
    );
  }
  private async excludeSensitiveKeys(
    chatId: string,
    value: unknown,
    signal?: AbortSignal
  ): Promise<boolean> {
    const keys = new Set<string>();
    const collect = (item: unknown) => {
      if (Array.isArray(item)) {
        item.forEach(collect);
        return;
      }
      if (!item || typeof item !== 'object') return;
      for (const [key, child] of Object.entries(item)) {
        keys.add(key);
        collect(child);
      }
    };
    collect(value);
    if (!keys.size) return false;
    const text = [...keys].sort().join('\n');
    const hash = createHash('sha256').update(text).digest('hex');
    let sensitive = this.keySensitivity.get(hash);
    if (sensitive === undefined) {
      const analysis = await this.service.analyze(text, signal);
      sensitive = analysis.entities.length > 0;
      if (this.keySensitivity.size >= 256)
        this.keySensitivity.delete(this.keySensitivity.keys().next().value!);
      this.keySensitivity.set(hash, sensitive);
    }
    if (!sensitive) return false;
    let action: AnonymizationAction;
    do {
      action = await this.complex(
        chatId,
        'Questo contenuto strutturato usa dati personali nelle chiavi. Le chiavi devono restare stabili: Procedi comunque le lascia in chiaro; Escludi rimuove questo contenuto.',
        signal,
        `keys:${hash}`
      );
    } while (action === 'retry');
    return action === 'exclude';
  }
  private async maskSchema<T>(
    chatId: string,
    schema: T,
    signal?: AbortSignal,
    keysChecked = false
  ): Promise<T> {
    if (!keysChecked && (await this.excludeSensitiveKeys(chatId, schema, signal))) return {} as T;
    if (Array.isArray(schema))
      return (await Promise.all(
        schema.map((value) => this.maskSchema(chatId, value, signal, true))
      )) as T;
    if (!schema || typeof schema !== 'object') return schema;
    const entries = [];
    for (const [key, value] of Object.entries(schema)) {
      entries.push([
        key,
        ['description', 'title', 'default', 'examples', 'enum', 'const'].includes(key)
          ? await this.maskValues(chatId, value, signal)
          : await this.maskSchema(chatId, value, signal, true),
      ]);
    }
    return Object.fromEntries(entries) as T;
  }
  /** Inspect only data introduced by provider-payload hooks; unchanged wire fields are already protected. */
  private async guardPayload(
    chatId: string,
    value: unknown,
    before: unknown,
    mapping: Map<string, string>,
    signal?: AbortSignal,
    path: string[] = []
  ): Promise<unknown> {
    if (typeof value === 'string') {
      if (value === before) return value;
      const key = path.at(-1) || '';
      if (
        !path.includes('metadata') &&
        !path.includes('values') &&
        [
          'model',
          'role',
          'type',
          'name',
          'id',
          'call_id',
          'tool_call_id',
          'mimeType',
          'mime_type',
          'signature',
          'encrypted_content',
        ].includes(key)
      )
        return value;
      if (key === 'arguments') {
        try {
          return JSON.stringify(
            await this.guardPayload(
              chatId,
              JSON.parse(value),
              before && typeof before === 'string' ? JSON.parse(before) : undefined,
              mapping,
              signal,
              [...path, 'values']
            )
          );
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
        }
      }
      let result = '',
        cursor = 0;
      for (const match of value.matchAll(PLACEHOLDER_PATTERN)) {
        if (!mapping.has(match[0])) continue;
        result += await this.mask(chatId, value.slice(cursor, match.index), signal);
        result += match[0];
        cursor = match.index + match[0].length;
      }
      return result + (await this.mask(chatId, value.slice(cursor), signal));
    }
    if (Array.isArray(value)) {
      const previous = Array.isArray(before) ? before : [];
      const result = [];
      for (const [index, item] of value.entries()) {
        const guarded = await this.guardPayload(chatId, item, previous[index], mapping, signal, [
          ...path,
          String(index),
        ]);
        if (guarded !== undefined) result.push(guarded);
      }
      return result;
    }
    if (!value || typeof value !== 'object') return value;
    if (
      (path.includes('metadata') || path.at(-1) === 'values') &&
      (await this.excludeSensitiveKeys(chatId, value, signal))
    )
      return undefined;
    const object = value as Record<string, unknown>;
    const previous =
      before && typeof before === 'object' ? (before as Record<string, unknown>) : {};
    if (JSON.stringify(object) === JSON.stringify(previous)) return value;
    if (
      [
        'image',
        'image_url',
        'input_image',
        'input_audio',
        'input_file',
        'file',
        'document',
        'thinking',
        'redacted_thinking',
        'reasoning',
      ].includes(String(object.type)) ||
      object.inlineData
    ) {
      let action: AnonymizationAction;
      do {
        action = await this.complex(
          chatId,
          'Un’estensione ha aggiunto un contenuto visivo, un file o un blocco firmato che non può essere anonimizzato completamente.',
          signal,
          `payload:${JSON.stringify(object)}`
        );
      } while (action === 'retry');
      return action === 'exclude' ? undefined : value;
    }
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(object)) {
      const guarded = await this.guardPayload(chatId, item, previous[key], mapping, signal, [
        ...path,
        ...(key === 'input' && object.type === 'tool_use' ? ['values'] : [key]),
      ]);
      if (guarded !== undefined) result[key] = guarded;
    }
    return result;
  }
  private async maskValues<T>(
    chatId: string,
    value: T,
    signal?: AbortSignal,
    keysChecked = false
  ): Promise<T> {
    if (!keysChecked && (await this.excludeSensitiveKeys(chatId, value, signal)))
      return (Array.isArray(value) ? [] : {}) as T;
    if (typeof value === 'string') return (await this.mask(chatId, value, signal)) as T;
    if (Array.isArray(value))
      return (await Promise.all(value.map((v) => this.maskValues(chatId, v, signal, true)))) as T;
    if (value && typeof value === 'object') {
      const entries = [];
      for (const [key, v] of Object.entries(value))
        entries.push([key, await this.maskValues(chatId, v, signal, true)]);
      return Object.fromEntries(entries) as T;
    }
    return value;
  }
  private async mask(chatId: string, text: string, signal?: AbortSignal): Promise<string> {
    if (!text) return text;
    for (;;) {
      let analysis;
      try {
        analysis = await this.service.analyze(text, signal);
      } catch (error) {
        if (signal?.aborted) throw new AnonymizationCancelled();
        if (this.service.status().service !== 'ready') throw error;
        const action = await this.complex(
          chatId,
          'Questo testo non può essere elaborato completamente in locale.',
          signal,
          `text:${text}`
        );
        if (action === 'retry') continue;
        return action === 'exclude' ? '' : text;
      }
      if (analysis.complex) {
        const action = await this.complex(
          chatId,
          'Il rilevamento locale contiene entità a bassa confidenza.',
          signal,
          `text:${text}`
        );
        if (action === 'retry') continue;
        if (action === 'exclude') return '';
        return text;
      }
      const chars = Array.from(text); // Python reports Unicode code-point offsets.
      const entities = analysis.entities.slice();
      // Escape literal placeholder-like strings, preserving their exact original value.
      for (const match of text.matchAll(TOKEN_LITERAL_PATTERN)) {
        const start = Array.from(text.slice(0, match.index)).length;
        entities.push({
          label: 'LITERAL',
          start,
          end: start + Array.from(match[0]).length,
          score: 1,
        });
      }
      entities.sort((a, b) => a.start - b.start || b.end - a.end);
      let cursor = 0;
      const selected = entities.filter((entity) => {
        if (entity.start < cursor) return false;
        if (entity.start < 0 || entity.end > chars.length || entity.start >= entity.end)
          throw new Error('Invalid local inference offsets');
        cursor = entity.end;
        return true;
      });
      const tokens = this.mappingStore().rememberMany(
        chatId,
        selected.map((entity) => ({
          label: entity.label,
          value: chars.slice(entity.start, entity.end).join(''),
        }))
      );
      let result = '';
      cursor = 0;
      for (const [index, entity] of selected.entries()) {
        result += chars.slice(cursor, entity.start).join('') + tokens[index];
        cursor = entity.end;
      }
      return result + chars.slice(cursor).join('');
    }
  }
  restoreMessage(
    message: AssistantMessage,
    mapping: Map<string, string>,
    final = true,
    chatId?: string
  ): AssistantMessage {
    const copy = structuredClone(message);
    for (const block of copy.content) {
      if (block.type === 'text') block.text = restoreText(block.text, mapping, final);
      else if (block.type === 'thinking') {
        block.thinking = restoreText(block.thinking, mapping, final);
        if (final && chatId && block.thinkingSignature) {
          const raw = message.content.find(
            (item) => item.type === 'thinking' && item.thinkingSignature === block.thinkingSignature
          ) as ThinkingContent;
          if (this.signedThinking.size >= 1000)
            this.signedThinking.delete(this.signedThinking.keys().next().value!);
          this.signedThinking.set(
            `${chatId}:${message.timestamp}:${createHash('sha256').update(block.thinking).digest('hex')}`,
            structuredClone(raw)
          );
        }
        if (final) delete block.thinkingSignature;
      } else if (block.type === 'toolCall')
        block.arguments = mapStringValues(
          block.arguments,
          (text) => restoreText(text, mapping, final),
          true
        );
    }
    if (copy.errorMessage) copy.errorMessage = restoreText(copy.errorMessage, mapping, final);
    return copy;
  }
  stream(chatId: string, original: StreamFn = streamSimple): StreamFn {
    return (model, context, options) => {
      const output = createAssistantMessageEventStream();
      void (async () => {
        try {
          const prepared = await this.prepare(chatId, context, options?.signal);
          let nextContext = prepared.context;
          let bypass = prepared.bypass;
          let mapping = prepared.mapping;
          for (;;) {
            let payloadCancelled = false;
            const upstream = await original(model, nextContext, {
              ...options,
              onPayload: async (payload, modelArg) => {
                const baseline = structuredClone(payload);
                const changed = (await options?.onPayload?.(payload, modelArg)) ?? payload;
                if (bypass || !options?.onPayload) return changed;
                for (;;) {
                  try {
                    const guarded = await this.guardPayload(
                      chatId,
                      changed,
                      baseline,
                      mapping,
                      options?.signal
                    );
                    for (const [token, value] of this.mappingStore().entries(chatId))
                      mapping.set(token, value);
                    return guarded ?? baseline;
                  } catch (error) {
                    if (error instanceof AnonymizationCancelled || options?.signal?.aborted) {
                      payloadCancelled = true;
                      throw error;
                    }
                    const action = await this.ask(
                      chatId,
                      'service',
                      'Il gateway non ha completato la protezione dei dati aggiunti prima dell’invio.',
                      options?.signal
                    );
                    if (action === 'cancel') {
                      payloadCancelled = true;
                      throw new AnonymizationCancelled();
                    }
                    if (action === 'proceed') return changed;
                    await this.service.start(options?.signal);
                  }
                }
              },
            });
            let lastPartial: AssistantMessage | undefined;
            const emitted = new Map<number, string>();
            try {
              for await (const event of upstream) {
                lastPartial =
                  event.type === 'done'
                    ? event.message
                    : event.type === 'error'
                      ? event.error
                      : event.partial;
                if (event.type === 'done' || event.type === 'error') {
                  if (event.type === 'done')
                    output.push({
                      ...event,
                      message: this.restoreMessage(event.message, mapping, true, chatId),
                    });
                  else
                    output.push({
                      ...event,
                      reason: payloadCancelled ? 'aborted' : event.reason,
                      error: {
                        ...this.restoreMessage(event.error, mapping),
                        ...(payloadCancelled ? { stopReason: 'aborted' as const } : {}),
                      },
                    });
                  continue;
                }
                const partial = this.restoreMessage(event.partial, mapping, false);
                if (event.type === 'text_delta' || event.type === 'thinking_delta') {
                  const block = partial.content[event.contentIndex];
                  const text =
                    block?.type === 'text'
                      ? block.text
                      : block?.type === 'thinking'
                        ? block.thinking
                        : '';
                  const previous = emitted.get(event.contentIndex) || '';
                  const delta = text.slice(previous.length);
                  emitted.set(event.contentIndex, text);
                  if (delta) output.push({ ...event, partial, delta } as AssistantMessageEvent);
                } else if (event.type === 'toolcall_delta') {
                  // Tool argument fragments are only released when the JSON is complete.
                  continue;
                } else if (event.type === 'text_end' || event.type === 'thinking_end') {
                  output.push({
                    ...event,
                    partial,
                    content: restoreText(event.content, mapping),
                  } as AssistantMessageEvent);
                } else if (event.type === 'toolcall_end') {
                  output.push({
                    ...event,
                    partial,
                    toolCall: {
                      ...event.toolCall,
                      arguments: mapStringValues(
                        event.toolCall.arguments,
                        (text) => restoreText(text, mapping),
                        true
                      ),
                    },
                  });
                } else output.push({ ...event, partial } as AssistantMessageEvent);
              }
              return;
            } catch (error) {
              if (!(error instanceof UnresolvedAnonymizationReference)) throw error;
              const action = await this.complex(
                chatId,
                'La risposta contiene riferimenti non ripristinabili. Riprova rigenera la risposta protetta; Procedi comunque ripete questa chiamata inviando il contesto in chiaro. Escludi scarta i riferimenti problematici e impedisce l’esecuzione degli strumenti della risposta.',
                options?.signal
              );
              if (action === 'exclude' && lastPartial) {
                const discard = (text: string) =>
                  text.replace(/\[AIDEN_[^\]\n]*(?:\]|$)/gi, (token) => mapping.get(token) || '');
                const safe = structuredClone(lastPartial);
                safe.content = safe.content.filter((block) => block.type !== 'toolCall');
                for (const block of safe.content) {
                  if (block.type === 'text') block.text = discard(block.text);
                  if (block.type === 'thinking') {
                    block.thinking = discard(block.thinking);
                    delete block.thinkingSignature;
                  }
                }
                safe.stopReason = 'stop';
                delete safe.errorMessage;
                output.push({ type: 'done', reason: 'stop', message: safe });
                return;
              }
              nextContext = action === 'proceed' ? context : prepared.context;
              bypass = action === 'proceed' || prepared.bypass;
              mapping = this.existingMapping(chatId);
            }
          }
        } catch (error) {
          const message: AssistantMessage = {
            role: 'assistant',
            content: [],
            api: model.api,
            provider: model.provider,
            model: model.id,
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason:
              options?.signal?.aborted || error instanceof AnonymizationCancelled
                ? 'aborted'
                : 'error',
            errorMessage:
              error instanceof AnonymizationCancelled
                ? error.message
                : 'Elaborazione protetta non riuscita. Nessuna esecuzione degli strumenti è stata autorizzata da questa risposta.',
            timestamp: Date.now(),
          };
          output.push({
            type: 'error',
            reason: message.stopReason as 'error' | 'aborted',
            error: message,
          });
        }
      })();
      return output;
    };
  }
  cancelChat(chatId: string): void {
    for (const item of this.pending.values())
      if (item.decision.chatId === chatId) item.resolve('cancel');
  }
  deleteChat(chatId: string): void {
    this.cancelChat(chatId);
    for (const key of this.signedThinking.keys())
      if (key.startsWith(`${chatId}:`)) this.signedThinking.delete(key);
    if (this.store) this.store.deleteChat(chatId);
    else {
      const filename = path.join(this.service.root, 'matching.sqlite');
      if (fs.existsSync(filename)) {
        // Deletion of encrypted rows does not require decrypting their values.
        const temporary = new AnonymizationMappingStore(filename, randomBytes(32));
        try {
          temporary.deleteChat(chatId);
        } finally {
          temporary.close();
        }
      }
    }
  }
  dispose(): void {
    for (const item of this.pending.values()) item.resolve('cancel');
    this.service.cancelDownload();
    this.service.stop();
    this.store?.close();
    this.store = undefined;
    this.signedThinking.clear();
    this.keySensitivity.clear();
  }
}

let instance: AnonymizationGateway | undefined;
export function getAnonymizationGateway(): AnonymizationGateway {
  return (instance ||= new AnonymizationGateway());
}
