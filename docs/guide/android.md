# Android app

The Atria Android app can run the bundled server locally or connect to a configured remote endpoint. In local mode it starts the server and opens the interface in a WebView.

An APK may be built locally from this repository. See the [Android build guide](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/android-app/README.md) for requirements, signing and output paths. Availability of a published APK depends on whether a release has been provided.

The preferred data root is `Android/data/com.atria.app/files/atria-data`; the app uses internal storage if external app storage is unavailable. Keep a separate [backup](/guide/migration) before changing builds or uninstalling the app.
