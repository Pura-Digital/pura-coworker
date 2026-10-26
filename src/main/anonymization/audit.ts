import { PLACEHOLDER_PATTERN } from './restore';

/** Aggregate evidence only: never return text, tokens, values, or their hashes. */
export function summarizeProtection(value: unknown, mapping: Map<string, string>) {
  let serialized: string;
  try {
    serialized = JSON.stringify(value) || '';
  } catch {
    return { inspectable: false };
  }
  const references = [...serialized.matchAll(PLACEHOLDER_PATTERN)]
    .map(match => match[0]).filter(token => mapping.has(token));
  const emails = new Set([...mapping]
    .filter(([token]) => /_EMAIL_\d+\]$/.test(token)).map(([, original]) => original));
  return {
    inspectable: true,
    references: references.length,
    emailReferences: references.filter(token => /_EMAIL_\d+\]$/.test(token)).length,
    knownEmailValuesInClear: [...emails].filter(email =>
      serialized.includes(email) || serialized.includes(JSON.stringify(email).slice(1, -1))
    ).length,
  };
}
