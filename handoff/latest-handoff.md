# Latest handoff — Native orchestration preset refresh

Updated: 2026-09-25 (Asia/Shanghai).
Implementation: `1a3e891230eb15b65af0772a1879f97cc77db8d7`.
Local main: `3f5b001cd1ef16870816d6ee0ca0e4087bf6cc7a`.
Status: complete locally. User explicitly requested NO PUSH.

Four fixed orchestration presets now use Native World/Session authority and
Runtime Route-aware prompts. Spec/Loop/Agenda remain advisory; Director produces
prose. Fixed preset revision 2 restores automatically without rewriting user
copies, routes or bindings. Director prompts no longer depend on named skills.

37 targeted tests passed across six suites; changed-file ESLint and whitespace
checks passed. Integrated main tree exactly matches the verified implementation.
Temporary task branch deleted locally. No real model inference was performed.

The three static prompt assets under public/presets remain: plugin-only.json,
agent-non-director.json and agent-director.json. No plugin-in was found. Native
Workspace no longer imports/selects these files; it uses Runtime Routes. Old
import-button translations remain. Assets were audited, not removed.

Full record: `docs:fix/native-orchestration-presets.md`.
Both main and docs have local commits that have NOT been pushed.

---
# Previous handoff — Native Regex scopes

Updated: 2026-09-25 (Asia/Shanghai).
Repository: ZZZdragondYNGPHX/Atria.
Baseline main: `6cf383abad35456316ab60ec4925830c6f4053fb`.
Implementation: `c053779e3e16f1953f8c1c4aa65d2d7a38183279` (pushed).
Main HEAD: `df03dedbd46243bdf71e61861b494c7a30a20bd1` (pushed).
Status: complete. Integrated main tree exactly matches the verified implementation.
`feat/native-regex-scopes` was pushed, merged, then deleted locally and remotely.

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

Main was refetched immediately before merge and still matched the baseline. The
merge had no conflicts; tree equality was checked before pushing main. Remote
main HEAD and remote task-branch removal were verified. Working tree is clean.

## Previous completed work

Knowledge originals and preset boundaries: main `6cf383abad35456316ab60ec4925830c6f4053fb`, record `docs:fix/knowledge-originals-preset-boundaries.md`. Its editable Knowledge originals, protected Work Worlds, and isolated preset interiors remain unchanged.
