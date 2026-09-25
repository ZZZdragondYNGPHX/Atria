# Latest handoff — Native Regex scopes

Updated: 2026-09-25 (Asia/Shanghai).
Repository: ZZZdragondYNGPHX/Atria.
Baseline main: `6cf383abad35456316ab60ec4925830c6f4053fb`.
Implementation: `c053779e3e16f1953f8c1c4aa65d2d7a38183279` (pushed).
Status: verified, ready to merge `feat/native-regex-scopes` into main.

## Outcome and contracts

Global → Preset → Game now uses the existing Regex engine with independent persistence ownership. Account settings retain only Global rules and account rule groups. Prompt Preset roots own regexScripts alongside program/module/generation membership; full preset import/export carries all resources and rules. Game rules remain in Package processors.regex and are edited by publishing an immutable archive. Existing related Sessions capture explicit edits in revisioned atri_game_regex snapshots; history and portable saves retain their effective rules without changing unrelated game state.

The primary narrator Runtime Route selects the active preset. Prompt references remain exact; Regex follows the owning preset's current metadata. Preset deletion clears Regex and ownership, archives roots and retains pinned Prompt history. Whole Game deletion retains the existing Session-reference guard. Scoped rules never enter Global settings.

The Regex UI exposes Global, Preset and Game regions. Preset details expose owned Regex editing, bulk toggles, ordering and import/export using the existing editor. Scope/owner identity isolates equal rule IDs, stale editors and imports. Legacy Character/Card/Prompt Manager/Tavern Helper DOM authorities remain absent.

Formal design and full evidence: `docs:feat/native-regex-scopes.md`. Updated preset plan: `docs:feat/prompt-presets.md`; authoritative design extension: `docs:planning/atria-model-prompt-settings/DESIGN.md`.

## Focused verification actually run

- Regex: 7 suites / 47 tests passed; final execution identity check rerun: 4 tests passed.
- Preset persistence / HTTP: 5 passed.
- Package contracts / container: 29 passed.
- Game Regex / Package Knowledge: 2 passed.
- Generation Route focused filter: 3 passed, 26 unrelated tests skipped.
- Edge: three-scope execution/lifecycle/import/switch/bulk/delete scenario passed; existing Regex account import/group/bulk scenario passed.
- Edge: Preset Regex ownership/export/import/delete at 1440px and 390px passed; final mobile file-picker visibility check passed. Desktop/mobile screenshots inspected; checkbox, file input and spacing fixed.
- Changed JavaScript ESLint, zh-CN/zh-TW localization and whitespace checks passed.

No unrelated whole-repository suite, Android, Docker, paid inference or CI wait.

## Previous completed work

Knowledge originals and preset boundaries: main `6cf383abad35456316ab60ec4925830c6f4053fb`, record `docs:fix/knowledge-originals-preset-boundaries.md`. Its editable Knowledge originals, protected Work Worlds, and isolated preset interiors remain unchanged.
