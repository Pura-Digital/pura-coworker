import { describe, expect, it } from 'vitest';
import { calculateContextTokensFromUsage } from '../src/shared/context-token-usage';

describe('calculateContextTokensFromUsage', () => {
  it('prefers totalTokens when present', () => {
    expect(
      calculateContextTokensFromUsage({
        input: 100,
        output: 50,
        cacheRead: 1000,
        totalTokens: 1200,
      })
    ).toBe(1200);
  });

  it('sums input, output, and cache fields when totalTokens is missing', () => {
    expect(
      calculateContextTokensFromUsage({
        input: 500,
        output: 120,
        cacheRead: 48000,
        cacheWrite: 0,
      })
    ).toBe(48620);
  });
});
