import path from 'node:path';
import { app } from 'electron';
import { MCP_OAUTH_SCHEME } from '../../shared/mcp-oauth';
import { log, logWarn } from '../utils/logger';

function isElectronBinaryExec(): boolean {
  const execPath = (process.execPath || '').toLowerCase();
  return (
    execPath.includes('/electron.app/contents/macos/electron') ||
    execPath.endsWith('/electron') ||
    execPath.endsWith('\\electron.exe')
  );
}

/** Windows dev registration needs the script path. macOS instead needs a bundle. */
export function shouldRegisterProtocolWithAppArg(): boolean {
  return Boolean(process.defaultApp) || isElectronBinaryExec();
}

export function getProtocolRegistrationArgs(): string[] {
  if (!shouldRegisterProtocolWithAppArg()) {
    return [];
  }
  const fromArgv = process.argv[1];
  if (fromArgv && fromArgv !== process.execPath) {
    return [path.resolve(fromArgv)];
  }
  return [path.resolve('.')];
}

export function registerAidenCustomProtocol(): boolean {
  // On macOS path/args are ignored: registration targets CFBundleIdentifier.
  // Every unpackaged Electron project shares com.github.Electron, so registering
  // here can launch another project's bare Electron and steal the packaged app's
  // handler. Only an Aiden bundle with CFBundleURLTypes can own this scheme.
  if (process.platform === 'darwin' && !app.isPackaged) {
    logWarn(
      '[Protocol] OAuth callbacks on macOS require the packaged Aiden app; leaving the system handler unchanged.'
    );
    return false;
  }
  const args = getProtocolRegistrationArgs();
  let registered: boolean;
  if (args.length > 0) {
    registered = app.setAsDefaultProtocolClient(MCP_OAUTH_SCHEME, process.execPath, args);
    log('[Protocol] setAsDefaultProtocolClient', {
      scheme: MCP_OAUTH_SCHEME,
      execPath: process.execPath,
      args,
      registered,
    });
  } else {
    registered = app.setAsDefaultProtocolClient(MCP_OAUTH_SCHEME);
    log('[Protocol] setAsDefaultProtocolClient (packaged)', {
      scheme: MCP_OAUTH_SCHEME,
      registered,
    });
  }
  if (!registered) {
    logWarn('[Protocol] Failed to register custom URL scheme', MCP_OAUTH_SCHEME);
  }
  return registered;
}

export function isAidenCustomProtocolRegistered(): boolean {
  if (process.platform === 'darwin' && !app.isPackaged) return false;
  const args = getProtocolRegistrationArgs();
  if (args.length > 0) {
    return app.isDefaultProtocolClient(MCP_OAUTH_SCHEME, process.execPath, args);
  }
  return app.isDefaultProtocolClient(MCP_OAUTH_SCHEME);
}
