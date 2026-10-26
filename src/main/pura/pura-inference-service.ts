import { net } from 'electron';
import type { PuraInferenceClient, StoredTokens, TokenStore } from '@pura-ai/sdk';
import { getPuraClientConfig } from './pura-oauth-config';
import * as puraTokenStore from './pura-token-store';

const clientBySet = new Map<string, Promise<PuraInferenceClient | null>>();

function createTokenStore(configSetId: string): TokenStore {
  let refreshLock = Promise.resolve();
  return {
    async get() {
      return puraTokenStore.getForSet(configSetId);
    },
    async set(tokens: StoredTokens) {
      puraTokenStore.setForSet(configSetId, tokens);
    },
    async withRefreshLock<T>(operation: () => Promise<T>): Promise<T> {
      const run = refreshLock.then(operation, operation);
      refreshLock = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    },
  };
}

export function resetClientForSet(configSetId: string): void {
  clientBySet.delete(configSetId);
}

puraTokenStore.subscribe(() => {
  clientBySet.clear();
});

export async function getClientForSet(configSetId: string): Promise<PuraInferenceClient | null> {
  if (!puraTokenStore.isConnected(configSetId)) {
    return null;
  }
  let promise = clientBySet.get(configSetId);
  if (!promise) {
    promise = (async () => {
      const { PuraInferenceClient } = await import('@pura-ai/sdk');
      const { clientId, apiBase } = getPuraClientConfig();
      if (!clientId) return null;
      return new PuraInferenceClient({
        apiBase,
        clientId,
        store: createTokenStore(configSetId),
        fetch: net.fetch.bind(net) as typeof fetch,
      });
    })();
    clientBySet.set(configSetId, promise);
  }
  return promise;
}

export async function getAccessTokenForSet(configSetId: string): Promise<string | null> {
  const client = await getClientForSet(configSetId);
  if (!client) return null;
  try {
    await client.capabilities();
  } catch {
    // capabilities may fail; usage is lighter
    try {
      await client.usage();
    } catch {
      return puraTokenStore.getForSet(configSetId)?.access_token ?? null;
    }
  }
  return puraTokenStore.getForSet(configSetId)?.access_token ?? null;
}
