# Latest handoff — editable Knowledge originals and preset boundaries complete

Updated: 2026-09-25 (Asia/Shanghai).
Repository: ZZZdragondYNGPHX/Atria.
Main HEAD: `6cf383abad35456316ab60ec4925830c6f4053fb` (pushed).
Implementation: `17b443faa`.
Status: complete. Integrated tree equals the verified task tree. Temporary `fix/knowledge-originals-preset-boundaries` removed locally; it was never pushed remotely. Permanent `docs` remains.

## Current outcome

Installed Work World originals stay read-only. Editing World parameters or changing its Knowledge bindings requires creating an editable World copy. World navigation/empty states now have Simplified and Traditional Chinese labels; authored names remain unchanged.

Knowledge originals, including installed Work Knowledge, can be edited directly: add/edit/delete entries and enable/disable them. Saving updates the actual installed package archive via a new current package version, preserving previous immutable archives for history. It is not a personal override. Existing and new sessions use the edited Knowledge for subsequent generation while World snapshots, binding identities/policies and World progress remain unchanged.

Preset interiors expose only their own program/modules/generation configuration. The global Copy existing module picker was removed. Whole-preset import/export is available on the preset list, with Export on each row. Existing-resource migration remains an explicit list-level action.

Accepted boundaries, architecture and full validation record: `docs:fix/knowledge-originals-preset-boundaries.md`. Updated preset plan: `docs:feat/prompt-presets.md`.

## Architecture and compatibility

Package publication uses existing archive installation, package write lock, expected revision checks and storage transaction. Work defaults retain selected World/Knowledge identities. Explicit Knowledge edit ancestry distinguishes direct edits from ordinary author package upgrades.

Existing sessions retain their original package identity and World state. Current load captures edited bound package Knowledge in the existing revision-backed KnowledgeBindingSet, invalidates derived Knowledge runtime state, and publishes a Session revision. Historical reads remain exact. Portable saves embed these snapshots and restore with the original package archive. Ordinary package upgrades and Library Knowledge pinning remain unchanged.

No new persistence authority, generation engine or personal Knowledge overlay was introduced. Active same-package generation must stop before the UI saves Knowledge changes.

## Verification

Affected paths only, per user instruction:

- Package edit/session Knowledge/resource setup: 3 suites, 7 tests passed.
- Package Library/revision history UI: 2 suites, 4 tests passed.
- FsEngine session core/save contracts: 2 suites, 14 tests passed; 45 other-backend tests skipped by filter.
- Real Edge browser: 6 scenarios passed, covering desktop/mobile Knowledge CRUD/toggle, World protection, active Session refresh, Chinese labels, preset workflows/export and absence of foreign preset data/global catalog requests. Rendered screenshots inspected.
- Focused desktop browser rerun after the final empty-state translation: 1 passed.
- Changed JavaScript lint, localization and whitespace checks passed. Frontend prebuild cache succeeded using cached bundles.
- Refetched main matched baseline; merge had no conflicts. Integrated tree exactly matches the tested task tree. Main push succeeded and local task branch was deleted.

No GitHub CI wait, unrelated full suite, Android, Docker or paid inference. No remaining work in this task.

## Prior completed work

Isolated presets: main `7a7b96d898b2c8bc317bd5d3f4642dc291da2ec6`, implementation `416474080`; record `docs:feat/prompt-presets.md`. Its original standalone-module copy UI is superseded by this follow-up.

World/Knowledge workflows and Work/existing Session resource selection: `23bfdc608b5e5ee2b6b863f116d118d529b0bab9`; record `docs:fix/world-knowledge-workflows.md`. Original Knowledge read-only behavior is superseded by this follow-up.

NPC-001–006 and Final Integration were completed earlier; record `docs:feat/native-prompt-controls.md`. Their feature branch was deleted. Earlier unrelated A7 aggregate guard and unavailable local database matrix remain historical baseline/environment notes.
