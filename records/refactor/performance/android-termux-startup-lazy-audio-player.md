# Android / Termux startup: lazy audio player

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)。

## Task

- Goal: remove the custom audio-player implementation from ordinary text-chat startup.
- Task branch: `perf/lazy-audio-player`
- Final baseline: `main@f64f2fefb74fbd3ab98f6c68191914fcec23aeaf`
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

## Performance interpretation

This change removes roughly 19 KB of audio-player source from the initial static application module graph for sessions that do not render audio attachments. No real-device startup-time improvement is claimed until a later full startup log is collected.
