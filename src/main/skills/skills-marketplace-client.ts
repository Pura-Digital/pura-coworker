import {
  normalizeMarketplaceBrowseQuery,
  resolveSkillsMarketplaceBaseUrl,
  searchSkillToMarketplaceItem,
  SKILLS_MARKETPLACE_DISCOVERY_QUERIES,
  type SkillsMarketplaceBrowseRequest,
  type SkillsMarketplaceBrowseResponse,
  type SkillsMarketplaceItem,
  type SkillsMarketplaceSearchResponse,
} from '../../shared/skills-marketplace';
import { logError } from '../utils/logger';

const MAX_LIMIT = 100;

async function fetchSearchPage(query: string, limit: number): Promise<SkillsMarketplaceItem[]> {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('limit', String(Math.min(Math.max(limit, 1), MAX_LIMIT)));

  const url = `${resolveSkillsMarketplaceBaseUrl()}/api/search?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Skills marketplace request failed (${response.status})`);
  }

  const payload = (await response.json()) as SkillsMarketplaceSearchResponse;
  if (payload.error) {
    throw new Error(payload.error);
  }

  return (payload.skills ?? []).map(searchSkillToMarketplaceItem);
}

export async function browseSkillsMarketplace(
  request: SkillsMarketplaceBrowseRequest = {}
): Promise<SkillsMarketplaceBrowseResponse> {
  const limit = Math.min(request.limit ?? MAX_LIMIT, MAX_LIMIT);
  const userSearch = request.search?.trim() ?? '';

  try {
    if (userSearch.length >= 2) {
      const items = await fetchSearchPage(userSearch, limit);
      return {
        success: true,
        items,
        query: userSearch,
        hasMore: false,
      };
    }

    const startIndex = Math.max(0, request.discoveryIndex ?? 0);
    let index = startIndex;
    let items: SkillsMarketplaceItem[] = [];

    while (index < SKILLS_MARKETPLACE_DISCOVERY_QUERIES.length && items.length === 0) {
      const query = SKILLS_MARKETPLACE_DISCOVERY_QUERIES[index];
      items = await fetchSearchPage(query, limit);
      if (items.length === 0) {
        index += 1;
      }
    }

    if (index >= SKILLS_MARKETPLACE_DISCOVERY_QUERIES.length) {
      return {
        success: true,
        items: [],
        query: normalizeMarketplaceBrowseQuery(),
        hasMore: false,
        nextDiscoveryIndex: index,
      };
    }

    const query = SKILLS_MARKETPLACE_DISCOVERY_QUERIES[index];
    const nextDiscoveryIndex = index + 1;
    const hasMore = nextDiscoveryIndex < SKILLS_MARKETPLACE_DISCOVERY_QUERIES.length;

    return {
      success: true,
      items,
      query,
      hasMore,
      nextDiscoveryIndex,
    };
  } catch (error) {
    logError('[SkillsMarketplace] browse failed:', error);
    return {
      success: false,
      items: [],
      query: userSearch.length >= 2 ? userSearch : normalizeMarketplaceBrowseQuery(),
      hasMore: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
