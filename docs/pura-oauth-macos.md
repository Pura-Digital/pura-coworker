# Pura Connect callbacks on macOS

The registered redirect URI stays `com.puradigital.aiden://pura-oauth`. Each application has its own Pura client ID; Mnemo uses a separate client and redirect URI.

On macOS, test this login from the packaged Aiden app:

1. Run `npm run build`.
2. Quit the development Aiden process and any older Aiden instance.
3. Install the generated DMG's Aiden.app in Applications and launch it.
4. Start a fresh Pura Connect login from that app. An old authorization belongs to the process that created its pending PKCE state.

The packaged app declares its URL scheme in Info.plist and registers itself on startup. Unpackaged macOS runs report the protocol unavailable and never register the shared `com.github.Electron` identity. This prevents another project's generic Electron from being selected as the callback handler. Passing a script path to Electron's protocol registration API does not solve this on macOS; those executable arguments apply on Windows.

The renderer and main process share Aiden's registered public OAuth client ID as their default. Official releases therefore work without a development `.env` or CI environment settings. The existing `VITE_PURA_*` settings can override the client ID, API base and redirect URI for separately registered applications; explicit main-process runtime environment values retain priority. Private tokens and client secrets are not embedded by this configuration.
