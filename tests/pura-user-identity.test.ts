import { describe, expect, it } from 'vitest';
import {
  formatPuraConnectedIdentity,
  resolvePuraUserEmail,
} from '../src/shared/pura-user-identity';

describe('resolvePuraUserEmail', () => {
  it('reads email fields from token payload', () => {
    expect(resolvePuraUserEmail({ email: 'user@puradigital.it' })).toBe('user@puradigital.it');
    expect(resolvePuraUserEmail({ user_email: 'other@example.com' })).toBe('other@example.com');
  });

  it('reads email from JWT access token payload', () => {
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({ email: 'jwt@puradigital.it', sub: '6' }));
    const access_token = `${header}.${payload}.sig`;
    expect(resolvePuraUserEmail({ access_token })).toBe('jwt@puradigital.it');
  });
});

describe('formatPuraConnectedIdentity', () => {
  it('prefers email over numeric id', () => {
    expect(formatPuraConnectedIdentity('user@puradigital.it', 6)).toBe('user@puradigital.it');
  });

  it('falls back to numeric id', () => {
    expect(formatPuraConnectedIdentity(null, 6)).toBe('#6');
  });
});
