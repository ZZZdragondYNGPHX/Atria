# Immersive Composer Tools Menu Fix

## Task

Fix the immersive composer tool entrypoints introduced by the immersive experience refactor.

- Working branch: `fix/immersive-composer-tools-menu`
- Base: `main@9767257e3ecce049936c68072d9328c14bab3243`
- Scope: immersive composer tool menu + native extension menu integration
- Status: implemented, CI pending

## User-visible issues

1. Tapping the immersive `+` briefly opened the native tools menu and then immediately closed it.
2. Immersive mode hid `#leftSendForm`, which also hid the native extensions magic-wand button.

## Root cause

The immersive `+` proxied a synthetic click to the hidden native `#options_button`. The native document click-away handler then observed a click that was not considered to be over the native visible trigger and closed the menu immediately. Its Popper instance was also anchored to the hidden native button.

The native extensions entrypoint `#extensionsMenuButton` is injected into `#leftSendForm`; immersive CSS intentionally hides that whole container, so the wand was unavailable.

## Implementation

- Treat `#atriaImmersiveTools` as a valid native tools-menu trigger.
- Use an immersive-specific Popper instance anchored to `#atriaImmersiveTools` while immersive mode is active.
- Add `#atriaImmersiveExtensions` with the existing magic-wand icon to the immersive composer.
- Keep the wand hidden until the native extensions runtime reports usable menu entries.
- Bind the immersive wand directly to the existing `#extensionsMenu`; no duplicate extension menu or extension state is created.
- Re-anchor the extension Popper to whichever native/immersive trigger opened it.
- Include the immersive wand in the native extension click-away allowlist.

## Regression coverage

- Composer test asserts the immersive extension entrypoint exists and uses the magic-wand icon.
- Structure test guards native menu reuse and immersive Popper anchoring.
- Final CI results will be appended after PR validation.
