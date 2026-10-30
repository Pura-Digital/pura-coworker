import { describe, expect, it } from 'vitest';
import {
  filterMarketplaceItems,
  marketplaceDownloadUrl,
  parseMarketplaceInstallRef,
  searchSkillToMarketplaceItem,
} from '../src/shared/skills-marketplace';

describe('skills-marketplace', () => {
  it('maps search results to marketplace items', () => {
    const item = searchSkillToMarketplaceItem({
      id: 'vercel-labs/agent-skills/vercel-react-best-practices',
      source: 'vercel-labs/agent-skills',
      skillId: 'vercel-react-best-practices',
      name: 'vercel-react-best-practices',
      installs: 123,
    });

    expect(item.marketplaceId).toBe('vercel-labs/agent-skills/vercel-react-best-practices');
    expect(item.detailUrl).toContain('skills.sh/vercel-labs/agent-skills/vercel-react-best-practices');
    expect(item.installRef).toBe(item.marketplaceId);
  });

  it('filters loaded items locally by query', () => {
    const items = [
      searchSkillToMarketplaceItem({
        id: 'acme/tools/pdf',
        source: 'acme/tools',
        skillId: 'pdf',
        name: 'pdf',
        installs: 10,
      }),
      searchSkillToMarketplaceItem({
        id: 'acme/tools/xlsx',
        source: 'acme/tools',
        skillId: 'xlsx',
        name: 'xlsx',
        installs: 20,
      }),
    ];

    const filtered = filterMarketplaceItems(items, 'pdf');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.skillId).toBe('pdf');
  });

  it('builds download URLs from install refs', () => {
    const parts = parseMarketplaceInstallRef('vercel-labs/agent-skills/vercel-react-best-practices');
    expect(parts).toEqual({
      owner: 'vercel-labs',
      repo: 'agent-skills',
      skillSlug: 'vercel-react-best-practices',
    });
    expect(marketplaceDownloadUrl(parts.owner, parts.repo, parts.skillSlug)).toBe(
      'https://skills.sh/api/download/vercel-labs/agent-skills/vercel-react-best-practices'
    );
  });
});
