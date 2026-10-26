import { app, BrowserWindow } from 'electron';
import {
  drainPendingPuraOAuthCallbacks,
  enqueuePuraOAuthCallback,
  extractPuraOAuthCallbackFromArgv,
  isPuraOAuthCallbackUrl,
} from '../../shared/pura-connect';
import { isMcpOAuthCallbackUrl } from '../mcp/mcp-oauth-deep-link';
import {
  captureSecondInstanceMcpOAuthCallback,
  captureStartupMcpOAuthCallback,
  processMcpOAuthCallbacks,
} from '../mcp/mcp-oauth-lifecycle';
import { log, logWarn } from '../utils/logger';
import * as puraOAuthManager from './pura-oauth-manager';
import {
  isAidenCustomProtocolRegistered,
  registerAidenCustomProtocol,
} from './pura-protocol-registration';

let puraHandlersRegistered = false;

function focusAppWindows(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
}

function notifyPuraConnectionChanged(configSetId: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send('pura-connection-changed', { configSetId });
  }
}

export async function processPuraOAuthCallbacks(): Promise<void> {
  const urls = drainPendingPuraOAuthCallbacks();
  for (const url of urls) {
    if (!isPuraOAuthCallbackUrl(url)) {
      continue;
    }
    try {
      const result = await puraOAuthManager.completeFromDeepLink(url);
      if (result.handled) {
        notifyPuraConnectionChanged(result.configSetId);
      }
    } catch (err) {
      logWarn('[PuraOAuth] Callback processing failed', err);
    }
  }
}

export function registerPuraConnectProtocolHandlers(): void {
  if (puraHandlersRegistered) {
    return;
  }
  puraHandlersRegistered = true;

  registerAidenCustomProtocol();

  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (isMcpOAuthCallbackUrl(url)) {
      log('[DeepLink] MCP OAuth open-url');
      captureStartupMcpOAuthCallback([url]);
      void processMcpOAuthCallbacks();
      return;
    }
    if (isPuraOAuthCallbackUrl(url)) {
      log('[DeepLink] Pura Connect open-url');
      enqueuePuraOAuthCallback(url);
      focusAppWindows();
      void processPuraOAuthCallbacks();
    }
  });
}

/** Re-register after ready so dev picks up the correct execPath + entry (over stale handlers). */
export function ensureAidenCustomProtocolRegistered(): void {
  registerAidenCustomProtocol();
}

export function captureStartupDeepLinks(argv: string[] = process.argv): void {
  captureStartupMcpOAuthCallback(argv);
  const puraUrl = extractPuraOAuthCallbackFromArgv(argv);
  if (puraUrl) {
    log('[PuraOAuth] Queued startup OAuth callback');
    enqueuePuraOAuthCallback(puraUrl);
  }
}

export function captureSecondInstanceDeepLinks(argv: string[]): void {
  captureSecondInstanceMcpOAuthCallback(argv);
  const puraUrl = extractPuraOAuthCallbackFromArgv(argv);
  if (puraUrl) {
    log('[PuraOAuth] Queued second-instance OAuth callback');
    enqueuePuraOAuthCallback(puraUrl);
    void processPuraOAuthCallbacks();
  }
}

export function isPuraProtocolRegistered(): boolean {
  return isAidenCustomProtocolRegistered();
}
