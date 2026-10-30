type TokenLike = {
  access_token?: unknown;
  pura_user_id?: unknown;
  email?: unknown;
  user_email?: unknown;
  pura_user_email?: unknown;
  preferred_username?: unknown;
};

const EMAIL_KEYS = ['email', 'user_email', 'pura_user_email', 'preferred_username'] as const;

function isEmail(value: unknown): value is string {
  return typeof value === 'string' && value.includes('@');
}

function readEmailFromJwtPayload(accessToken: string): string | null {
  const parts = accessToken.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    for (const key of EMAIL_KEYS) {
      if (isEmail(payload[key])) {
        return payload[key].trim();
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Resolve a human-readable Pura account label from OAuth token fields. */
export function resolvePuraUserEmail(tokens: TokenLike | null | undefined): string | null {
  if (!tokens) {
    return null;
  }
  for (const key of EMAIL_KEYS) {
    if (isEmail(tokens[key])) {
      return tokens[key].trim();
    }
  }
  if (typeof tokens.access_token === 'string') {
    return readEmailFromJwtPayload(tokens.access_token);
  }
  return null;
}

export function formatPuraConnectedIdentity(
  email: string | null | undefined,
  puraUserId: number | null | undefined
): string {
  if (email?.trim()) {
    return email.trim();
  }
  if (puraUserId != null && Number.isFinite(puraUserId)) {
    return `#${puraUserId}`;
  }
  return '';
}
