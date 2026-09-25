# Latest handoff — Native Prompt Controls complete

Updated: 2026-09-25 (Asia/Shanghai).

## Current state

Repository: ZZZdragondYNGPHX/Atria.
Main HEAD: `aa3a0b0dcfbfc451c696990794ccf16390e7fba3` (pushed and remote verified).
NPC-001–006 and Final Integration are complete. No continuation gate remains.
Remote and local `feat/native-prompt-controls` were deleted after main push.
The permanent `docs` branch is retained.
Formal plan and detailed decisions: `docs:feat/native-prompt-controls.md`.

## Delivered

- NPC-001: boolean and exclusive Prompt runtime choices use existing mutable Runtime Route overrides, exact authored definitions and shared preview/execute compilation diagnostics.
- NPC-002: real Library Prompt Program/Module deletion removes all revisions only when no resource/Runtime Route references remain. Used By blockers, destructive confirmation and protected Package/Project originals are enforced.
- NPC-003/004: compact searchable/filterable/paginated Knowledge overview, explicit single-entry editing, revision-draft enable toggles and retained browsing context. Optional enabled preserves historical hashes; disabled entries cannot activate, retain lifecycle state, expand dependencies or consume output budget. Bundle/Session/save/promotion preserve it.
- NPC-005: permanent nonmodal, localized twelve-lesson Learning center uses real Shell routes and existing AccountStorage. Fresh identity/language continues into learning; skip, close, resume, replay and Back leave product controls usable.
- NPC-006: retired Preset/Scoped Regex ownership and allow flags removed throughout live UI/runtime/persistence. Account rules, read-only registered Plugin and existing Native Package contributions remain. Regex Presets contain valid account rule IDs only. Import cache invalidation, bulk toggles, group reapply/export/delete are verified.

## Validation actually executed

User superseded per-group push/stop and full validation requirements: only affected surfaces and direct dependencies were checked, with a single final integration/push. No CI wait.

- NPC-001: focused unit/integration and two real-host browser cases at 1440px/390px passed; lint, localization and frontend prebuild passed (details in plan).
- Remaining NPCs: initial 12 Jest suites / 100 tests passed. Resource/Session/Prompt and shell direct-dependency checks passed; targeted HTTP deletion plus Knowledge snapshot/promotion checks passed.
- Shell navigation/Back and Regex focused checks: 7 suites / 50 tests; AppShell/group normalization: 2 suites / 8 tests; final execution-plan check: 11 tests passed.
- Browser: desktop and 390px Knowledge draft/toggle/save/reload, deletion blockers and successful deletion, account Regex editor/execution/reload, and usable learning panel passed. Screenshots inspected. Fresh identity + live language + account progress reload + Escape passed separately. Final Regex import/bulk/group/export/delete case passed after fixing omitted-disabled handling.
- Changed-file ESLint, zh-CN/zh-TW coverage, frontend prebuild cache and diff whitespace checks passed.
- Main merge had no conflicts, and its tree matched the verified feature tree exactly; no redundant full test rerun. Main push succeeded and remote refs confirmed feature removal.

## Limits and unrelated baseline findings

An attempted save backend matrix hit six environment failures: unavailable Node 24 SQLite native binary and unconfigured MySQL/PostgreSQL test databases. Related file-backed save/snapshot/promotion paths passed; database matrix is not claimed as passing. No database code changed.

The earlier aggregate A7 Studio string guard already failed at the original main baseline. Per the user's later affected-surface-only instruction, unrelated A7 reconciliation was excluded. No Android device/build, Docker build or paid inference was required.

No automatic migration of retired Regex scope data was added. No new state/storage authority was introduced. Old Knowledge entries default to enabled; editing creates new immutable revisions and does not retarget existing bindings.

## Commits

- Baseline: `d29c2b3170798b136eb41249eaad902a23aab5bd`.
- NPC-001: `2958b9c2bacfebd876a69b12e2dcffb3a30d5779`.
- Remaining NPCs: `fd3dffeb59aff7bae4dc6c540011eef30b1b590c`.
- Main integration: `aa3a0b0dcfbfc451c696990794ccf16390e7fba3`.
