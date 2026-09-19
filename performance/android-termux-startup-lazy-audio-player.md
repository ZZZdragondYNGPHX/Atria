# Android / Termux startup: lazy audio player

## Task

- Goal: remove the custom audio-player implementation from ordinary text-chat startup.
- Task branch: `perf/lazy-audio-player`
- Final baseline: `main@f64f2fefb74fbd3ab98f6c68191914fcec23aeaf`
- Validated task head: `eca65e059f67e688869c412d74174eac7ba852b3`
- PR: #54
- Squash merge / resulting main: `f690c015b1c6c0c33ab152ceec2561715f52cd72`

## Implementation

- Removed the static `AudioPlayer` import from `public/script.js`.
- Added a memoized, retryable dynamic import for `public/scripts/audio-player.js`.
- The player module is now loaded only when an audio attachment is actually rendered.
- Module readiness is folded into the existing media readiness promise set.
- A failed module load remains non-fatal and clears the memoized promise so a later audio message can retry.
- Added `tests/frontend-lazy-audio-player.test.js` to pin the lazy-loading boundary.

## Compatibility

- Text/image/video attachment behavior is unchanged.
- Audio rendering still waits for player initialization before the media readiness set resolves.
- No user data, settings, protocol, storage, Android package, or Docker behavior changed.

## Validation

Final rebased task head passed:

- Atria PR Checks #644.
- Worldbook Performance Foundation #305, including the real-host Chromium path.

Android JVM/APK and Docker validation were intentionally not run because this was a browser JavaScript startup-path change and those validations are opt-in.

## Performance interpretation

This change removes roughly 19 KB of audio-player source from the initial static application module graph for sessions that do not render audio attachments. No real-device startup-time improvement is claimed until a later full startup log is collected.
