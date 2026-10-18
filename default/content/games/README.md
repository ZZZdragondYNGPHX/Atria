# Bundled initial game

`foglight-inn-1.0.0-rc.4.atria` is the exact published candidate from
`package:foglight-inn/releases/`, commit `d2e464b5c`.
The authoring source, original artwork, audio sources and historical releases stay
in the separate Package workspace. The archive includes its media credits.

The existing per-user default-content flow installs it through PackageInstaller
and AssetStore. New users see it in Library and Play without importing a file.
Existing installations of this work are preserved, including their chosen version.
The content log prevents repeated installation or resurrecting a deleted work.
No Session, API configuration, credential or generation request is created.
Players still select their own Persona and Runtime routes before playing.

 Never rebuild or
replace an existing release under the same name.
