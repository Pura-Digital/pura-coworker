export const SKILLS_MARKETPLACE_BASE_URL = 'https://skills.sh';

function readSkillsApiUrlOverride(): string | undefined {
  try {
    if (typeof process === 'undefined' || !process.env) {
      return undefined;
    }
    const value = process.env.SKILLS_API_URL?.trim();
    return value ? value.replace(/\/$/, '') : undefined;
  } catch {
    return undefined;
  }
}

/** Base URL for skills.sh API (main process may override via SKILLS_API_URL). */
export function resolveSkillsMarketplaceBaseUrl(): string {
  return readSkillsApiUrlOverride() || SKILLS_MARKETPLACE_BASE_URL;
}

export type SkillsMarketplaceSearchSkill = {
  id: string;
  source: string;
  skillId: string;
  name: string;
  installs?: number;
};

export type SkillsMarketplaceSearchResponse = {
  query?: string;
  skills?: SkillsMarketplaceSearchSkill[];
  count?: number;
  error?: string;
};

export type SkillsMarketplaceItem = {
  marketplaceId: string;
  name: string;
  source: string;
  skillId: string;
  installs: number;
  detailUrl: string;
  installRef: string;
};

export type SkillsMarketplaceBrowseRequest = {
  /** User search (skills.sh fuzzy search). Requires at least 2 characters. */
  search?: string;
  limit?: number;
  /** Index into discovery queries for catalog infinite scroll (default 0). */
  discoveryIndex?: number;
};

export type SkillsMarketplaceBrowseResponse = {
  success: boolean;
  items: SkillsMarketplaceItem[];
  query: string;
  hasMore: boolean;
  nextDiscoveryIndex?: number;
  error?: string;
};

/** Broad queries used to page through the catalog (API caps at 100 hits per query). */
export const SKILLS_MARKETPLACE_DISCOVERY_QUERIES = [
  'skill',
  'agent',
  'code',
  'web',
  'api',
  'data',
  'ai',
  'react',
  'python',
  'design',
  'docs',
  'git',
  'test',
  'deploy',
  'security',
  'mobile',
  'cloud',
  'review',
  'video',
  'pdf',
  'excel',
  'stripe',
  'figma',
  'mcp',
  'docker',
  'aws',
  'next',
  'typescript',
  'marketing',
  'seo',
  'legal',
  'finance',
  'support',
  'slack',
  'notion',
  'linear',
  'playwright',
  'remotion',
  'vercel',
  'openai',
  'claude',
] as const;

export type SkillsMarketplaceDownloadFile = {
  path: string;
  contents: string;
};

export type SkillsMarketplaceDownloadResponse = {
  files: SkillsMarketplaceDownloadFile[];
  hash?: string;
};

const DEFAULT_BROWSE_QUERY = 'skill';

export function normalizeMarketplaceBrowseQuery(search?: string): string {
  const trimmed = search?.trim() ?? '';
  if (trimmed.length >= 2) {
    return trimmed;
  }
  return DEFAULT_BROWSE_QUERY;
}

export function searchSkillToMarketplaceItem(skill: SkillsMarketplaceSearchSkill): SkillsMarketplaceItem {
  const marketplaceId = skill.id.trim();
  const detailUrl = `${SKILLS_MARKETPLACE_BASE_URL}/${marketplaceId}`;
  return {
    marketplaceId,
    name: skill.name.trim() || skill.skillId,
    source: skill.source.trim(),
    skillId: skill.skillId.trim(),
    installs: typeof skill.installs === 'number' ? skill.installs : 0,
    detailUrl,
    installRef: marketplaceId,
  };
}

export function scoreMarketplaceItem(item: SkillsMarketplaceItem, query: string): number {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return 0;

  const haystack = [item.name, item.skillId, item.source, item.marketplaceId]
    .join(' ')
    .toLowerCase();

  if (item.marketplaceId.toLowerCase() === normalized) return 1000;
  if (item.skillId.toLowerCase() === normalized) return 900;
  if (item.name.toLowerCase() === normalized) return 850;
  if (haystack.startsWith(normalized)) return 700;
  if (haystack.includes(normalized)) return 400;
  return 0;
}

export function filterMarketplaceItems(
  items: SkillsMarketplaceItem[],
  query: string
): SkillsMarketplaceItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [...items].sort((a, b) => b.installs - a.installs);
  }

  return items
    .map((item) => ({ item, score: scoreMarketplaceItem(item, normalized) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.item.installs - a.item.installs)
    .map(({ item }) => item);
}

export function parseMarketplaceInstallRef(installRef: string): {
  owner: string;
  repo: string;
  skillSlug: string;
} {
  const parts = installRef
    .trim()
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 3) {
    throw new Error(`Invalid skill reference: ${installRef}`);
  }

  const skillSlug = parts.pop();
  const repo = parts.pop();
  const owner = parts.join('/');

  if (!owner || !repo || !skillSlug) {
    throw new Error(`Invalid skill reference: ${installRef}`);
  }

  return { owner, repo, skillSlug };
}

export function marketplaceDownloadUrl(
  owner: string,
  repo: string,
  skillSlug: string,
  baseUrl = SKILLS_MARKETPLACE_BASE_URL
): string {
  return `${baseUrl}/api/download/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(skillSlug)}`;
}
