import { describe, expect, it } from 'vitest';
import {
  applyOAuthFormToServerConfig,
  defaultCustomOAuthFormState,
  validateCustomOAuthForm,
} from '../src/shared/mcp-oauth-form';
import type { McpServerConfig } from '../src/shared/ipc-types';

describe('custom OAuth connector form', () => {
  it('requires remote transport for OAuth', () => {
    const form = defaultCustomOAuthFormState();
    form.authMode = 'oauth';
    expect(validateCustomOAuthForm('stdio', '', form)).toContain('remote');
  });

  it('rejects conflicting client ID and metadata URL strategies', () => {
    const form = defaultCustomOAuthFormState();
    form.authMode = 'oauth';
    form.registrationStrategy = 'client_id';
    form.clientId = 'public-client';
    form.clientMetadataUrl = 'https://example.com/.well-known/oauth-client/aiden.json';
    expect(validateCustomOAuthForm('streamable-http', 'https://mcp.example/mcp', form)).toContain(
      'not both'
    );
  });

  it('validates HTTPS metadata URL with non-root path', () => {
    const form = defaultCustomOAuthFormState();
    form.authMode = 'oauth';
    form.registrationStrategy = 'client_metadata_url';
    form.clientMetadataUrl = 'https://example.com/.well-known/oauth-client/aiden.json';
    expect(validateCustomOAuthForm('sse', 'https://mcp.example/sse', form)).toBeNull();
  });

  it('serializes OAuth public config without client secret fields', () => {
    const base: McpServerConfig = {
      id: 'srv-1',
      name: 'Custom OAuth',
      type: 'streamable-http',
      url: 'https://mcp.example/mcp',
      enabled: true,
    };
    const form = defaultCustomOAuthFormState();
    form.authMode = 'oauth';
    form.scope = 'mcp:tools';
    form.registrationStrategy = 'client_id';
    form.clientId = 'aiden-public';

    const result = applyOAuthFormToServerConfig(base, form);
    expect(result.authType).toBe('oauth');
    expect(result.oauth).toEqual({
      registrationStrategy: 'client_id',
      scope: 'mcp:tools',
      clientId: 'aiden-public',
    });
    expect(result.headers).toBeUndefined();
    expect(result).not.toHaveProperty('client_secret');
  });
});
