/**
 * Shared MCP OAuth constants and types (main + renderer safe).
 */

/** Fixed redirect URI registered with Electron custom scheme handler. */
export const MCP_OAUTH_REDIRECT_URI = 'com.puradigital.aiden://oauth/mcp/callback';

/** Custom URL scheme used for Electron protocol registration. */
export const MCP_OAUTH_SCHEME = 'com.puradigital.aiden';

export type McpOAuthRegistrationStrategy = 'auto' | 'client_id' | 'client_metadata_url';

export interface McpOAuthConfig {
  /** OAuth scopes to request (space-separated string stored as single field). */
  scope?: string;
  /** Public client registration strategy. */
  registrationStrategy?: McpOAuthRegistrationStrategy;
  /** Pre-registered public client ID (when strategy is client_id). */
  clientId?: string;
  /** HTTPS Client ID Metadata Document URL (when strategy is client_metadata_url). */
  clientMetadataUrl?: string;
}

export type McpAuthType = 'oauth';

export type McpConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'failed'
  | 'disabled'
  | 'auth-required'
  | 'authenticating';
