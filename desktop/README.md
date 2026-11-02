# Life OS desktop shell

This Electron Forge project loads the deployed Life OS PWA at `https://abdullahbinfahad.github.io/life-os/`. It does not fork the React UI or duplicate account data; users receive the same hosted features and backend. An internet connection is required for uncached resources.

## Develop and package

From this directory, run `npm ci`, then `npm start` for development or `npm run make` to create a ZIP for the host platform. Run `npm test` to execute the OAuth URL/callback security regression suite. The Forge project pins Electron `45.2.1` and Forge `8.0.1`; keep Electron current and review security advisories before each release.

The shared brand source is `../public/lifeos-mark.svg`; `assets/lifeos.png`, `assets/lifeos.ico`, and `assets/lifeos.icns` are the desktop window and platform package icons. When the mark changes, refresh these checked-in icons together so Linux, Windows, and macOS remain visually consistent.

## Authentication setup required

Google authorization starts in the system browser and returns through the `lifeos://auth/callback` protocol. The renderer generates a 32-byte random `app_state`; the main process accepts the callback only if it matches the pending state, is no older than ten minutes, and contains a PKCE authorization code. The authorization request must target the configured Supabase Google endpoint and use `code_challenge_method=s256`. The state is one-time and stored locally for cold-start callbacks. Bearer-token query parameters and all callback fragments (including implicit access/refresh tokens) are rejected and never forwarded to the hosted renderer.

Before testing desktop Google sign-in, add this state-aware custom-scheme pattern to Supabase Auth → URL Configuration → Redirect URLs:

```text
lifeos://auth/callback\?app_state=*
```

The backslash escapes the literal question mark in Supabase's wildcard syntax; `*` covers only the generated hexadecimal state value. Verify that the configured Supabase project accepts this redirect in an end-to-end test. Email confirmation and password recovery intentionally use the hosted HTTPS application route and open in the system browser; they do not use the custom protocol callback.

The renderer has Node integration disabled, context isolation and sandboxing enabled, and a small preload bridge. Main-process IPC accepts only the configured Supabase Google authorization endpoint with PKCE. External links open only as HTTPS or `mailto:` in the system browser. Web notifications are the only remote-content permission granted. Do not put OAuth client secrets, signing keys, or passwords in this repository.

## Release status

The Linux x64 ZIP has been built locally as a packaging smoke test; it is unsigned and has not been published. The GitHub Actions workflow runs callback security tests and creates temporary platform build artifacts on relevant pull requests/main changes or manual dispatch. It does **not** create a public GitHub release from a version tag. Google OAuth, email confirmation, and password-recovery behavior still require end-to-end checks against the configured Supabase/Google project. Windows/macOS CI builds, code signing/notarization, installer testing, and review of outstanding Forge dependency advisories are separate release gates. ZIP artifacts are unsigned and may trigger operating-system warnings.
