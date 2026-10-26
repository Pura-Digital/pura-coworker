import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { anonymizationContext, getAnonymizationGateway } from './gateway';

interface VisionScope {
  chatId: string;
  controller: AbortController;
  run: ReturnType<typeof anonymizationContext.getStore>;
}
const scopes = new Map<string, VisionScope>();
let server: Server | undefined;
let address: Promise<string> | undefined;

function startBroker(): Promise<string> {
  if (address) return address;
  address = new Promise((resolve, reject) => {
    server = createServer(async (request, response) => {
      const token = request.headers.authorization?.replace(/^Bearer /, '');
      const scope = token ? scopes.get(token) : undefined;
      const reply = (status: number, body: object) => {
        if (response.destroyed) return;
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      if (
        request.method !== 'POST' ||
        request.url !== '/vision-consent' ||
        !scope ||
        scope.controller.signal.aborted
      ) {
        reply(403, { allowed: false });
        return;
      }
      try {
        let body = '';
        for await (const chunk of request) {
          body += chunk.toString();
          if (body.length > 8192) {
            reply(413, { allowed: false });
            return;
          }
        }
        const input = JSON.parse(body);
        if (typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint)) {
          reply(400, { allowed: false });
          return;
        }
        const decide = async () => {
          let action;
          do {
            action = await getAnonymizationGateway().complex(
              scope.chatId,
              'Lo strumento di visione richiede di inviare una nuova schermata al provider. Le immagini non sono anonimizzabili in questa versione.',
              scope.controller.signal,
              `vision:${input.fingerprint}`
            );
          } while (action === 'retry');
          return action === 'proceed';
        };
        const allowed = scope.run
          ? await anonymizationContext.run(scope.run, decide)
          : await decide();
        reply(200, { allowed: allowed && !scope.controller.signal.aborted });
      } catch {
        reply(200, { allowed: false });
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const bound = server!.address();
      if (!bound || typeof bound === 'string') {
        reject(new Error('Local consent broker unavailable'));
        return;
      }
      resolve(`http://127.0.0.1:${bound.port}/vision-consent`);
    });
    server.unref();
  });
  return address;
}

/** A short-lived capability binds every screenshot approval to the owning chat/tool call. */
export async function createVisionConsentScope(chatId: string, signal?: AbortSignal) {
  const url = await startBroker();
  const token = randomBytes(24).toString('hex');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  scopes.set(token, { chatId, controller, run: anonymizationContext.getStore() });
  return {
    capability: { url, token },
    dispose: () => {
      controller.abort();
      signal?.removeEventListener('abort', abort);
      scopes.delete(token);
    },
  };
}

export function closeVisionConsentBroker(): void {
  for (const scope of scopes.values()) scope.controller.abort();
  scopes.clear();
  server?.close();
  server = undefined;
  address = undefined;
}
