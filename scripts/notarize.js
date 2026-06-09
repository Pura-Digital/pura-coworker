/**
 * afterSign hook for electron-builder.
 *
 * Notarizes the macOS .app bundle so it passes Gatekeeper on end-user machines.
 *
 * Required env vars (set in CI or locally):
 *   APPLE_ID                      – Apple ID email
 *   APPLE_APP_SPECIFIC_PASSWORD   – App-specific password (NOT your Apple ID password)
 *   APPLE_TEAM_ID                 – 10-char team identifier from developer.apple.com
 *
 * If any of the three vars is missing the script silently skips notarization,
 * so local dev builds still work without credentials.
 */
const { notarize } = require('@electron/notarize');

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appId = context.packager.appInfo.id;
  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_ID_PASSWORD, APPLE_TEAM_ID } =
    process.env;
  const appleIdPassword = APPLE_APP_SPECIFIC_PASSWORD || APPLE_ID_PASSWORD;

  if (!APPLE_ID || !appleIdPassword || !APPLE_TEAM_ID) {
    console.log(
      '[notarize] Skipping — set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID to enable.'
    );
    return;
  }

  console.log(`[notarize] Notarizing ${appId} at ${appPath} ...`);

  await notarize({
    appBundleId: appId,
    appPath,
    appleId: APPLE_ID,
    appleIdPassword,
    teamId: APPLE_TEAM_ID,
  });

  console.log('[notarize] Done.');
};
