export const PLACEHOLDER_PATTERN = /\[AIDEN_[a-f0-9]{24}_[A-Z0-9]+_\d+\]/g;
export const TOKEN_LITERAL_PATTERN = /\[?AIDEN_[a-f0-9]{24}_[A-Z0-9]+_\d+\]?/gi;
export class UnresolvedAnonymizationReference extends Error {
  constructor() {
    super('Unresolved anonymization reference');
  }
}

export function restoreText(text: string, mapping: Map<string, string>, final = true): string {
  let safeText = text;
  if (!final) {
    // Withhold a possible token prefix until the following chunk disambiguates it.
    const bracket = safeText.lastIndexOf('[');
    if (bracket >= 0) {
      const tail = safeText.slice(bracket);
      if ('[AIDEN_'.startsWith(tail) || (tail.startsWith('[AIDEN_') && !tail.includes(']'))) {
        safeText = safeText.slice(0, bracket);
      }
    }
    const bare = /(?:A|AI|AID|AIDE|AIDEN|AIDEN_[a-f0-9]*(?:_[A-Z0-9]*(?:_\d*)?)?)$/i.exec(safeText);
    if (bare) safeText = safeText.slice(0, bare.index);
  }
  const remaining = safeText.replace(PLACEHOLDER_PATTERN, '');
  if ((final && /\[AIDEN_/i.test(remaining)) || /AIDEN_[a-f0-9]{24}_/i.test(remaining)) {
    throw new UnresolvedAnonymizationReference();
  }
  return safeText.replace(PLACEHOLDER_PATTERN, (token) => {
    const value = mapping.get(token);
    if (value === undefined) throw new UnresolvedAnonymizationReference();
    return value;
  });
}

export function mapStringValues<T>(
  value: T,
  transform: (text: string) => string,
  restoreKeys = false
): T {
  if (typeof value === 'string') return transform(value) as T;
  if (Array.isArray(value))
    return value.map((item) => mapStringValues(item, transform, restoreKeys)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        restoreKeys ? transform(key) : key,
        mapStringValues(item, transform, restoreKeys),
      ])
    ) as T;
  }
  return value;
}
