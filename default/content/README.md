# Atria Bundled Content

`index.json` lists only Atria's initial settings, bundled Native game, and server
error/style resources. Model parameters and native themes use their existing
runtime defaults; no upstream character, world, background, expression set,
workflow, prompt preset, or theme pack is installed for new accounts.

`settings.json` selects Atria's native theme and capability defaults. It does not
duplicate provider settings or bind an account to sample characters or presets.
The Native game and its release information remain in `games/`.

The public avatar, note icon, and notification tone are lightweight Atria assets.
Existing user-created or previously imported content is not deleted on startup.
Third-party provider logos, fonts, tokenizers, and other actively used protocol
assets are product dependencies, not bundled sample content.
