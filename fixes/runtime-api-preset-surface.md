# Runtime API / Preset Surface Repair

## Task

Repair the post-R7 Runtime settings surface reported from `main@5df59a5c7789219bf96c6574f100209a264db454`.

Working branch: `fix/runtime-api-preset-surface`

## Reported problems

1. Runtime/API settings localization is incomplete.
2. API connection presets can be viewed but not edited from the Runtime surface.
3. The Model / Prompt Presets workspace occupies too much vertical space on mobile.
4. Model / prompt presets are likewise not directly editable from the Runtime surface.
5. Connection and Search are duplicate navigation affordances: both open the same API configuration host and differ only by selecting conversation vs embedding API.

## Product direction

- Reuse the existing native API/preset editors and state authorities; do not create a parallel preset store or connection system.
- Runtime should expose a compact summary surface and open focused editor sub-surfaces/sheets for detailed preset editing.
- Merge duplicate Connection/Search navigation into one API Connections entry with an explicit Conversation / Embedding mode switch inside the focused editor.
- Preserve existing underlying SillyTavern API/preset contracts and persisted data.
- Complete Simplified/Traditional Chinese localization for newly exposed Runtime labels and controls.

## Validation

- Focused unit/lint tests for Runtime shell/navigation/preset bindings.
- Browser smoke covering mobile Runtime opening, compact preset surface, preset edit entry, and Conversation/Embedding switching.
- Full frontend build and normal Atria PR checks as appropriate.
- No Android/Docker build unless implementation reaches native Android code.
