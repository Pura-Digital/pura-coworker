export interface ContextTokenUsageInput {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
}

/** Mirrors @mariozechner/pi-coding-agent calculateContextTokens for UI fallbacks. */
export function calculateContextTokensFromUsage(usage: ContextTokenUsageInput): number {
  if (typeof usage.totalTokens === 'number' && usage.totalTokens > 0) {
    return usage.totalTokens;
  }
  return (
    usage.input +
    usage.output +
    (usage.cacheRead ?? 0) +
    (usage.cacheWrite ?? 0)
  );
}
