# Atria Android app

This directory contains the Android app and its local build scripts. The app can
run the bundled Atria server through Node.js Mobile and display it in a WebView;
it also supports connecting to a configured remote endpoint.

For the local runtime, the app prepares its Node project, starts the server and
opens its loopback address after it is ready. It starts probing at port `8000`
and can select another available port.

## Build locally

Install the Android SDK, NDK and a compatible JDK, then run from the repository
root:

```bash
bash android-app/scripts/build-android-apk.sh debug
```

The script installs production Node dependencies, fetches Node.js Mobile and
invokes the Gradle wrapper. The debug APK is written to
`android-app/app/build/outputs/apk/debug/app-debug.apk`. Set
`INSTALL_RUNTIME_DEPS=0` or `FETCH_NODEJS_MOBILE=0` only when the corresponding
dependencies have already been prepared locally.

The runtime fetcher defaults to the `funnycups/nodejs-mobile` `v1.0.1` Android
archive and enforces Node major version 24 or newer. Its available
`NODEJS_MOBILE_*` overrides are defined in
[`scripts/fetch-nodejs-mobile.mjs`](scripts/fetch-nodejs-mobile.mjs).

For a signed release, set `ANDROID_KEYSTORE_FILE`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`,
then run:

```bash
bash android-app/scripts/build-android-apk.sh release
```

Builds are run locally; this repository does not have an automatic APK build or
release workflow.

## Data and updates

The preferred data root is `Android/data/com.atria.app/files/atria-data`; the
app falls back to its internal files directory if external app storage is not
available. Server plugins and global third-party extensions reside under that
root in `plugins/` and `extensions/third-party/`. App updates do not implement
automatic APK downloads. Keep a separate backup of data before changing builds
or uninstalling the app.
