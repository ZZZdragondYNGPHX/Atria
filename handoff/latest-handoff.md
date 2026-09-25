# Latest handoff — World and Knowledge workflows repaired

Updated: 2026-09-25 (Asia/Shanghai).
Repository: ZZZdragondYNGPHX/Atria.
Main HEAD: `23bfdc608b5e5ee2b6b863f116d118d529b0bab9` (pushed).
Implementation: `45f0fdbd56dac8dd46e80431b3cd094eb67a34ea`.
Status: complete. Working tree clean; local fix branch removed; it was not pushed remotely. The permanent docs branch remains.

## Current outcome

The user reopened World/Knowledge acceptance after NPC-001–006 because installed Work originals remained hard to copy/edit and Works/Sessions had no resource selection. This follow-up covers existing Sessions as explicitly requested.

- World/Knowledge originals and Library details have a prominent Create editable copy action.
- Library Knowledge offers direct add/edit/delete/enable actions, named parameter summaries and a compact list/detail editor. Changes publish explicit immutable revisions after review/save.
- Work details: Configure Worlds & Knowledge sets defaults for new Sessions from that starting point.
- My Games → Manage → Worlds & Knowledge changes an existing Session's selection, with exact revision selectors and primary World choice.
- The currently open Session reloads immediately after saving. Stop generation before changing its resources.
- Exact unchanged Worlds retain progress; replaced Worlds initialize from their baseline. Timeline/history remain recoverable. Library Knowledge snapshots and World attachments survive save export/import independently of the Library originals.

Detailed record: `docs:fix/world-knowledge-workflows.md`.
Original NPC plan and history: `docs:feat/native-prompt-controls.md`.

## Persistence contracts

No parallel repository or localStorage authority was introduced. Work defaults use existing PackageState plus an integrity token; Session choices use reserved revision-backed atri_world_selection and optional packageBindingIds in KnowledgeBindingSet. Absent fields preserve old behavior. Package originals stay immutable; edits never silently retarget pinned consumers.

Explicit World selection takes precedence in Game World resolution. Resource changes require expected Session HEAD and reset derived Knowledge activation state. Work defaults are scoped to the exact PackageVersion and starting point. Asset deletion checks protect these World snapshots; portable save closure includes their asset bytes.

## Verification

Affected-path tests only; no CI wait or unrelated full suite.

- Knowledge/Product/UI focused tests passed.
- FsEngine Session Core + runtime projection: 29 tests passed.
- HTTP/Library/setup checkpoint: 5 suites / 22 tests passed; final HTTP/Game World: 2 suites / 19 passed.
- Final setup integration passed default isolation, concurrency rejection, exact snapshot independence, state retention, historical reads, reserved-state protection and fresh-directory save restoration including protected World attachments.
- Real-host browser: 1440px and 390px complete copy/entry CRUD/toggle, Work defaults and active Session configuration/reload flows passed. Final screenshots inspected.
- Changed JavaScript lint, localization and whitespace checks passed. Frontend prebuild cache command succeeded.
- Integration fetch found main unchanged; merge had no conflicts and its tree equalled the verified branch exactly. Remote main push succeeded.

## Remaining context

No work remains in this fix. Entry edits still require review/save; use the resource selector to choose the new exact revision for a Work or Session. World replacement resets that replacement's state, rather than attempting schema migration.

Earlier unrelated A7 aggregate string-guard failure and unavailable local database matrix remain historical baseline/environment notes, not failures of this affected-path verification. Android/Docker/paid inference were not run.
