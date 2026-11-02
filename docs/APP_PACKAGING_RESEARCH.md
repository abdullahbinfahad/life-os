# App packaging research and release gates

Checked 2026-10-31. These notes distinguish verified repository/live-page facts from external release prerequisites. No signing key, password, private account record, or access token belongs in this file.

## Current web app facts

The deployed manifest is available at `https://abdullahbinfahad.github.io/life-os/site.webmanifest`. It currently names the app “Life Circle,” uses relative `start_url` and `scope` (`./`), declares `display: standalone`, and points to `icon-192.png` and `icon-512.png`. The project website is served from `https://abdullahbinfahad.github.io/life-os/`, not from the origin root.

The public origin does not currently serve a readable `https://abdullahbinfahad.github.io/.well-known/assetlinks.json` file. The authenticated GitHub check did not resolve a repository named `abdullahbinfahad/abdullahbinfahad.github.io`; no repository or Pages settings were changed as part of this check.

## Android: Bubblewrap / Trusted Web Activity

A Trusted Web Activity can present an owned website without browser controls only after the browser verifies the relationship between the Android app and website through Digital Asset Links. The statement file must be available at `/.well-known/assetlinks.json` relative to the verified origin. If verification or the signing-certificate match fails, the browser falls back to a Custom Tab, which retains browser UI. The project-site path `/life-os/` cannot host a file at the origin root merely by adding `public/.well-known/assetlinks.json` to this repository; the root file needs a root-site repository or another host/CDN serving the exact root URL. Sources [1] [2].

Bubblewrap generates an Android project from the PWA manifest. Its current CLI documentation requires Node.js 18 or later, can install/configure Java and Android tooling, and builds a signed APK (`app-release-signed.apk`) plus an Android App Bundle. CI can pass keystore/key passwords through environment variables. The same release signing key must be retained securely for updates, and its SHA-256 fingerprint must appear in the site's Digital Asset Links statement. Do not commit the keystore or passwords. Sources [1] [3].

The wrapper still uses the hosted PWA and Supabase. A verified TWA therefore preserves the current UI and web feature source; it does not independently host a second front end. A failed verification falls back to browser chrome rather than changing the website's own UI. No APK or verified TWA has been built or published yet.

## Desktop: Electron

Electron Forge is the selected packaging direction because its official workflow covers platform-specific distributables and GitHub release publishing. The wrapper should load the existing HTTPS site instead of duplicating the React app. That preserves one deployed UI and backend, while requiring network access for uncached resources and retaining only the existing service-worker offline behavior. Sources [4] [5].

Because the app executes remotely hosted code, the wrapper must use HTTPS, disable Node integration, enable context isolation and process sandboxing, restrict navigation and new-window creation, and grant permissions narrowly. External URLs must be validated before opening them in the system browser. The packaged Electron/Chromium runtime must be kept current. Source [5].

The current feature branch adds an Electron main/preload wrapper with Node integration disabled, context isolation and sandbox enabled, HTTPS-origin/navigation checks, external-link handling, a `lifeos://auth/callback` custom protocol, and a narrow system-browser Google OAuth bridge. Its callback validates a one-time 32-byte random app state (10-minute expiry), requires the configured Google authorize endpoint and S256 PKCE, and forwards only the authorization code; bearer-token query/fragment callbacks are rejected. A Linux x64 ZIP was built successfully from this source on 2026-10-31; Windows and macOS builds are configured for CI but have not yet been run here. This is a packaging smoke test, not proof that sign-in works end-to-end.

The tested wrapper uses Electron 45.2.1 and Electron Forge 8.0.1. `npm audit` reports 13 moderate findings in the Forge build-tool dependency tree and no high/critical findings on that line; `npm audit fix` does not resolve them without a major downgrade. Testing Forge 7.11.2 instead produced high and critical dependency findings, so it was not retained. This is a build-time tooling risk that must be reviewed before publishing a release; do not describe this dependency tree as audit-clean.

Google's installed-app guidance uses the system browser and recommends PKCE; avoid starting Google authorization inside an embedded Electron renderer. Supabase `redirectTo` values must be on the project's Auth URL allowlist. For the desktop Google flow, configure `lifeos://auth/callback\?app_state=*` (the escaped `?` matches the literal separator; `*` matches the generated hexadecimal state) and test against the configured Google OAuth client. Email confirmation and password-recovery links intentionally use the hosted HTTPS route and open in the system browser; they do not enter the desktop custom-protocol handler. Sources [6] [7] [8] [9].

## Release gates

Before producing public Android downloads, the owner must choose and freeze the Android application ID, control a long-lived release signing key, and provide a root-origin host for the matching `assetlinks.json`. A verified full-screen TWA cannot be claimed before the exact deployed association statement is fetched successfully and the APK certificate fingerprint matches it. Without that root association, an APK may be buildable but will open as a Custom Tab.

Before a public desktop release, configure and test the state-aware `lifeos://auth/callback\?app_state=*` redirect in Supabase and Google, verify Google sign-in plus hosted email-confirmation/password-recovery behavior, re-test navigation boundaries and the callback regression suite, run the Windows/macOS/Linux CI matrix, review the outstanding moderate Forge dependency advisories, and sign/notarize platform artifacts where required. The repository workflow now builds and uploads temporary CI artifacts only; it does not publish a public release from a tag. Code-signing/notarization credentials are separate platform release requirements and must remain in secure owner-controlled secrets.

## References

[1]: https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2 "Android Developers Trusted Web Activities Quick Start Guide"
[2]: https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages "About GitHub Pages"
[3]: https://github.com/GoogleChromeLabs/bubblewrap/blob/main/packages/cli/README.md "Bubblewrap CLI"
[4]: https://www.electronforge.io/ "Electron Forge"
[5]: https://www.electronjs.org/docs/latest/tutorial/security "Electron Security Recommendations"
[6]: https://developers.google.com/identity/protocols/oauth2/native-app "Google OAuth 2.0 for Desktop Apps"
[7]: https://supabase.com/docs/guides/auth/redirect-urls "Supabase Auth Redirect URLs"
[8]: https://supabase.com/docs/guides/auth/native-mobile-deep-linking "Supabase Native Deep Linking"
[9]: https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app "Electron Launch App from URL"
