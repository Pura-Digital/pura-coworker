import {
  MCP_REGISTRY_BASE_URL,
  filterMarketplaceItems,
  type McpMarketplaceItem,
  type McpRegistryListResponse,
  registryEntryToMarketplaceItem,
} from '../../shared/mcp-registry';
import { logError } from '../utils/logger';

export type McpRegistryBrowseResult = {
  items: McpMarketplaceItem[];
  newItems?: McpMarketplaceItem[];
  nextCursor: string | null;
  totalCached: number;
  extended?: boolean;
};

const registryCache = {
  items: [] as McpMarketplaceItem[],
  nextCursor: null as string | null,
  loadedAt: 0,
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const remoteSearchCache = new Map<string, { loadedAt: number; newItems: McpMarketplaceItem[] }>();

function isCacheFresh(): boolean {
  return registryCache.items.length > 0 && Date.now() - registryCache.loadedAt < CACHE_TTL_MS;
}

function mergeRegistryItems(existing: McpMarketplaceItem[], incoming: McpMarketplaceItem[]): McpMarketplaceItem[] {
  const seen = new Set(existing.map((item) => item.registryName));
  const merged = [...existing];
  for (const item of incoming) {
    if (seen.has(item.registryName)) continue;
    seen.add(item.registryName);
    merged.push(item);
  }
  return merged;
}

function parseRegistryPage(payload: McpRegistryListResponse): McpMarketplaceItem[] {
  const pageItems: McpMarketplaceItem[] = [];
  for (const entry of payload.servers ?? []) {
    const item = registryEntryToMarketplaceItem(entry);
    if (!item) continue;
    pageItems.push(item);
  }
  return pageItems;
}

async function fetchRegistryPage(cursor?: string, limit = 60, search?: string): Promise<McpRegistryBrowseResult> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('version', 'latest');
  if (cursor) {
    params.set('cursor', cursor);
  }
  if (search?.trim()) {
    params.set('search', search.trim());
  }

  const url = `${MCP_REGISTRY_BASE_URL}/v0/servers?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`MCP Registry request failed (${response.status})`);
  }

  const payload = (await response.json()) as McpRegistryListResponse;
  const pageItems = parseRegistryPage(payload);

  registryCache.items = mergeRegistryItems(registryCache.items, pageItems);
  registryCache.nextCursor = payload.metadata?.nextCursor ?? null;
  registryCache.loadedAt = Date.now();

  return {
    items: pageItems,
    nextCursor: registryCache.nextCursor,
    totalCached: registryCache.items.length,
  };
}

async function remoteSearchRegistry(query: string, limit = 120): Promise<McpRegistryBrowseResult> {
  const trimmed = query.trim().toLowerCase();
  const cached = remoteSearchCache.get(trimmed);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return {
      items: filterMarketplaceItems(registryCache.items, trimmed).slice(0, limit),
      newItems: cached.newItems,
      nextCursor: registryCache.nextCursor,
      totalCached: registryCache.items.length,
      extended: true,
    };
  }

  const startCount = registryCache.items.length;
  let cursor: string | undefined;
  let pages = 0;

  do {
    const page = await fetchRegistryPage(cursor, 80, trimmed);
    cursor = page.nextCursor ?? undefined;
    pages += 1;
  } while (cursor && pages < 6);

  const newItems = registryCache.items.slice(startCount);
  remoteSearchCache.set(trimmed, { loadedAt: Date.now(), newItems });

  return {
    items: filterMarketplaceItems(registryCache.items, trimmed).slice(0, limit),
    newItems,
    nextCursor: registryCache.nextCursor,
    totalCached: registryCache.items.length,
    extended: true,
  };
}

export async function browseMcpRegistry(options: {
  cursor?: string;
  search?: string;
  limit?: number;
  extendSearch?: boolean;
  remoteSearch?: boolean;
}): Promise<McpRegistryBrowseResult> {
  const search = options.search?.trim() ?? '';
  const limit = options.limit ?? 60;

  try {
    if ((options.extendSearch || options.remoteSearch) && search) {
      return await remoteSearchRegistry(search, limit);
    }

    if (!options.cursor && isCacheFresh()) {
      const items = search
        ? filterMarketplaceItems(registryCache.items, search).slice(0, limit)
        : registryCache.items.slice(0, limit);
      return {
        items,
        nextCursor: registryCache.nextCursor,
        totalCached: registryCache.items.length,
      };
    }

    const page = await fetchRegistryPage(options.cursor, limit);
    const items = options.cursor
      ? page.items
      : search
        ? filterMarketplaceItems(registryCache.items, search).slice(0, limit)
        : registryCache.items.slice(0, limit);

    return {
      items,
      nextCursor: page.nextCursor,
      totalCached: registryCache.items.length,
    };
  } catch (error) {
    logError('[McpRegistryClient] browse failed:', error);
    throw error;
  }
}

export function clearMcpRegistryCache(): void {
  registryCache.items = [];
  registryCache.nextCursor = null;
  registryCache.loadedAt = 0;
  remoteSearchCache.clear();
}
