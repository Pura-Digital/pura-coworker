import { describe, expect, it, vi } from 'vitest';
import { browseSkillsMarketplace } from '../src/main/skills/skills-marketplace-client';

describe('browseSkillsMarketplace', () => {
  it('loads skills from skills.sh search API', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        query: 'react',
        count: 1,
        skills: [
          {
            id: 'vercel-labs/agent-skills/vercel-react-best-practices',
            source: 'vercel-labs/agent-skills',
            skillId: 'vercel-react-best-practices',
            name: 'vercel-react-best-practices',
            installs: 100,
          },
        ],
      }),
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const result = await browseSkillsMarketplace({ search: 'react', limit: 10 });
      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.items[0]?.marketplaceId).toBe(
        'vercel-labs/agent-skills/vercel-react-best-practices'
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('q=react'),
        expect.any(Object)
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('pages catalog browse via discovery query index', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const query = new URL(url).searchParams.get('q');
      return {
        ok: true,
        json: async () => ({
          query,
          skills:
            query === 'skill'
              ? [
                  {
                    id: 'acme/pkg/a',
                    source: 'acme/pkg',
                    skillId: 'a',
                    name: 'a',
                    installs: 1,
                  },
                ]
              : [
                  {
                    id: 'acme/pkg/b',
                    source: 'acme/pkg',
                    skillId: 'b',
                    name: 'b',
                    installs: 2,
                  },
                ],
        }),
      };
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const first = await browseSkillsMarketplace({ discoveryIndex: 0, limit: 100 });
      expect(first.success).toBe(true);
      expect(first.items[0]?.skillId).toBe('a');
      expect(first.hasMore).toBe(true);
      expect(first.nextDiscoveryIndex).toBe(1);

      const second = await browseSkillsMarketplace({ discoveryIndex: 1, limit: 100 });
      expect(second.items[0]?.skillId).toBe('b');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
