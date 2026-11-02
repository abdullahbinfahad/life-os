# Android TWA release preparation

The Android wrapper should be a Trusted Web Activity pointing at the existing PWA manifest: `https://abdullahbinfahad.github.io/life-os/site.webmanifest`. This keeps the web UI and Supabase behavior shared with the deployed site rather than maintaining a second app implementation.

## Current release blockers

No APK is being represented as release-ready yet. The current GitHub Pages site is hosted below `/life-os/`, while Android's Digital Asset Links verification requires `https://abdullahbinfahad.github.io/.well-known/assetlinks.json` at the origin root. This repository can publish only beneath `/life-os/`; placing a file in its `public/.well-known` folder would not satisfy the required root URL.

The Android application ID and long-lived signing key must be finalized before a public release. The signing certificate's SHA-256 fingerprint must match the root-hosted asset-links statement. The current build environment has Java but no Android SDK or `sdkmanager` installed.

## When prerequisites are ready

1. Confirm the permanent Android application ID and set up owner-controlled release signing; never commit the keystore or its passwords.
2. Provide an origin-root host that serves the matching `assetlinks.json` over HTTPS. Verify the exact URL returns the correct package name and release-certificate fingerprint.
3. Install Android SDK/Gradle prerequisites and initialize Bubblewrap from the hosted PWA manifest.
4. Build and install a test APK, verify the TWA opens full-screen (not Custom Tab fallback), and exercise sign-in, reminders, offline cache, and file/image upload paths before publishing.

If Digital Asset Links verification fails, Chrome falls back to a browser-controlled Custom Tab. That is useful for a preview build but does not meet the requested no-compromise app appearance.
