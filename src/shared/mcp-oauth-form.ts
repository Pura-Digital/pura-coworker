import type { McpOAuthConfig, McpOAuthRegistrationStrategy } from './mcp-oauth';
import type { McpServerConfig } from './ipc-types';

export interface CustomOAuthFormState {
  authMode: 'manual' | 'oauth';
  scope: string;
  registrationStrategy: McpOAuthRegistrationStrategy;
  clientId: string;
  clientMetadataUrl: string;
}

export function defaultCustomOAuthFormState(
  server?: Pick<McpServerConfig, 'authType' | 'oauth'>
): CustomOAuthFormState {
  const oauth = server?.oauth;
  return {
    authMode: server?.authType === 'oauth' ? 'oauth' : 'manual',
    scope: oauth?.scope ?? '',
    registrationStrategy: oauth?.registrationStrategy ?? 'auto',
    clientId: oauth?.clientId ?? '',
    clientMetadataUrl: oauth?.clientMetadataUrl ?? '',
  };
}

export function isValidHttpsMetadataUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' && parsed.pathname !== '/' && parsed.pathname.length > 1;
  } catch {
    return false;
  }
}

export function validateCustomOAuthForm(
  type: McpServerConfig['type'],
  url: string,
  form: CustomOAuthFormState
): string | null {
  if (form.authMode !== 'oauth') {
    return null;
  }

  if (type === 'stdio') {
    return 'OAuth is only supported for remote SSE or Streamable HTTP connectors';
  }

  if (!url.trim()) {
    return 'MCP endpoint URL is required for OAuth connectors';
  }

  try {
    new URL(url.trim());
  } catch {
    return 'MCP endpoint URL is invalid';
  }

  const hasClientId = form.clientId.trim().length > 0;
  const hasMetadataUrl = form.clientMetadataUrl.trim().length > 0;

  if (hasClientId && hasMetadataUrl) {
    return 'Use either a public client ID or a client metadata URL, not both';
  }

  if (form.registrationStrategy === 'client_id' && !hasClientId) {
    return 'Public client ID is required for this registration strategy';
  }

  if (form.registrationStrategy === 'client_metadata_url') {
    if (!hasMetadataUrl) {
      return 'Client metadata URL is required for this registration strategy';
    }
    if (!isValidHttpsMetadataUrl(form.clientMetadataUrl)) {
      return 'Client metadata URL must be HTTPS with a non-root path';
    }
  }

  return null;
}

export function buildOAuthConfigFromForm(form: CustomOAuthFormState): McpOAuthConfig | undefined {
  if (form.authMode !== 'oauth') {
    return undefined;
  }

  const config: McpOAuthConfig = {
    registrationStrategy: form.registrationStrategy,
  };

  const scope = form.scope.trim();
  if (scope) {
    config.scope = scope;
  }

  if (form.registrationStrategy === 'client_id') {
    config.clientId = form.clientId.trim();
  } else if (form.registrationStrategy === 'client_metadata_url') {
    config.clientMetadataUrl = form.clientMetadataUrl.trim();
  }

  return config;
}

export function applyOAuthFormToServerConfig(
  config: McpServerConfig,
  form: CustomOAuthFormState
): McpServerConfig {
  if (form.authMode !== 'oauth') {
    const rest = { ...config };
    delete rest.authType;
    delete rest.oauth;
    return rest;
  }

  return {
    ...config,
    authType: 'oauth',
    oauth: buildOAuthConfigFromForm(form),
    headers: undefined,
  };
}

export function mcpStatusLabelKey(
  status: string
): 'mcp.connected' | 'mcp.failed' | 'mcp.connecting' | 'mcp.disabled' | 'mcp.authRequired' | 'mcp.authenticating' {
  switch (status) {
    case 'connected':
      return 'mcp.connected';
    case 'failed':
      return 'mcp.failed';
    case 'auth-required':
      return 'mcp.authRequired';
    case 'authenticating':
      return 'mcp.authenticating';
    case 'disabled':
      return 'mcp.disabled';
    default:
      return 'mcp.connecting';
  }
}
