export function resolvePresetUrl(
  url: string | undefined,
  values: Record<string, string>
): string | undefined {
  if (!url) return undefined;

  let resolved = url;
  for (const [key, value] of Object.entries(values)) {
    const token = value.trim();
    if (!token) continue;
    resolved = resolved.replaceAll(`{${key}}`, encodeURIComponent(token));
  }
  return resolved;
}

export function maskPresetUrl(url: string | undefined): string {
  if (!url) return 'Remote server';
  return url.replace(/\{[^}]+\}/g, '***');
}

export function presetUrlHasUnresolvedPlaceholders(url: string | undefined): boolean {
  return Boolean(url && /\{[^}]+\}/.test(url));
}
