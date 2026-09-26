# Latest handoff — Native Experience P1 complete

Updated: 2026-09-26. **P1 complete and pushed; stop before P2**.

Work branch: `feat/native-experience-modes-capability-deepening`.
HEAD: `24e75668b9cf739796ea4c679056391702a8973b` (pushed).
Main unchanged: `4dab353ac639d42eae885c79e18245267abd6820`.
Plan: `feat/native-experience-modes-capability-deepening.md`, normative §0 Implementation Baseline v1.0, 32 capabilities, P0–P9 on one branch.
Detailed contract/limits/test record: `handoff/native-experience-modes-capability-deepening.md`.

P1 adds isolated Component v2 UI documents, strict Form/local state/preferences, pure expressions/templates, immutable Package Data, keyed Collection basics, shared Native Composer submission, Action receipts/idempotency/typed compensation, mutation lowering into existing IR, and basic conditional Opening/Wizard. V1 remains on its existing renderer. Component/Hybrid/Full share the same Host. UI state uses existing settings; device scope uses a Host-owned non-secret browser identity. World/receipt facts still commit in one Native SessionRevision. No Package execution or second persistence authority was introduced.

Enabled only implemented P1 feature versions; all P2–P9 requirements still fail closed when unsupported. Formal plan unchanged: no substantive architecture deviation. See detailed handoff for exact schemas, scopes, hard limits and phase boundaries. Opening completion remains mount-local until P4 lifecycle work; durable generic operation recovery belongs to P3.

Passed **187 distinct tests / 19 targeted and adjacent suites**, including FS+SQLite Session Core, install/reopen/HTTP Data, atomic receipts/replay/fork/compensation, v1/v2 UI and Composer. Changed-area ESLint/syntax/whitespace, A0/A3/A4/Experience (52 files) guards and zh-CN/zh-TW localization passed. Real Edge 1440px/390px fixture checks passed; screenshots inspected. No full-repo, Android, Docker, paid inference or required CI run.

User explicitly authorized P1 then stop, not P2. Next authorized stage needs a new continuation: **P2 — Message Projection / Conversation / Branch Presentation** (#9/#11/#15 and #16 presentation/thread basics), message-local UI, actionable attachments, narrative presentation profile and Branch/Reply Variant facade. Keep Variants immutable, canonical narrative distinct from projection, historical actions read-only or explicit fork, render receipts distinct from authority/model delivery. Reuse P1 seams; do not implement P3 bodies.

Fetch first and preserve newer work-branch commits; read main AGENTS/FORK, formal §0, both handoffs, current code/tests. At P2 completion commit/push same branch, update both handoffs, stop before P3. Do not merge main or delete the branch before P9 final verification.

---

# Previous handoff — Native Experience P0 complete

Updated: 2026-09-26.
Status: **P0 complete and pushed; stopped before P1**.

Main baseline: `4dab353ac639d42eae885c79e18245267abd6820`.
Work branch: `feat/native-experience-modes-capability-deepening`.
Work branch HEAD: `349287c166bff9344bb9bbabc812a799b9cb8534` (pushed).
Plan: `feat/native-experience-modes-capability-deepening.md`.
Plan baseline commit: `6308c36e1a10b4c406f1ef5affcabe2eae545d71`.
Detailed handoff: `handoff/native-experience-modes-capability-deepening.md`.

Discussion Draft v2.3 has been normalized into **Implementation Baseline v1.0**.
The top §0 of the plan is normative and supersedes stale earlier Round wording.
The capability inventory is 32 items and implementation is split into P0–P9
on one persistent work branch.

P0 added optional strict package-level `runtime.experienceContract` v1, shared
32-feature version vocabulary with reserved vs supported versions, exact JSON
AssetRef declarations, Project/Package/Descriptor validation and Host support
checks before browser activation. Existing packages without the field and
Component Model v1 remain unchanged. Only `component-model@1` is currently
supported in the new vocabulary; required future features fail closed. Optional
reserved features are metadata only. No feature bodies or new storage authority
were implemented. EntryPoint cannot override package requirements.

Fixed the A3 guard's obsolete path filter, which previously scanned zero active
Experience files. Added a recursive Experience contract foundation guard and
strict negative fixtures plus build/install/reopen coverage. Formal plan remains
unchanged because P0 found no substantive architecture conflict.

Passed: 138 distinct tests across 10 targeted/adjacent suites (including FS and
SQLite Session Core), changed-JS ESLint, changed-MJS syntax, whitespace, and
A0/A3/A4 plus the new Experience contract foundation guard (47 files). Initial
SQLite binding absence was repaired locally, then all 22 Session Core tests
passed. No binaries/config/lockfile changes committed. Exact suites and resolved
failures are recorded in the detailed task handoff.

Next stage: **P1 — Component v2 / Form / Local State / Action / Opening
Foundation**. Cover #1/#2/#3/#4/#6/#7/#8 and basic #14. Preserve v1, keep UI state
outside World Revisions, use existing typed authority for Form/Action, and enable
only capability versions actually implemented. Do not implement P2+ bodies.

Validation policy: targeted/adjacent checks for touched code, changed-area lint
and relevant guards. No habitual full-repo suite, Android, Docker or paid model
calls. Codex Astra does not need GitHub CI to complete a phase unless CI/workflow
behavior itself changes. Fix normal failures autonomously. At P1 completion,
commit+push, update plan only for substantive design changes, update both handoff
files, stop, and provide the P2 takeover prompt. Do not merge main before P9.

---

# Latest handoff — Collapsible prompt editors

Updated: 2026-09-25 (Asia/Shanghai).
Main: `4dab353ac639d42eae885c79e18245267abd6820` (pushed).
Implementation: `dc10712b791e0d9cc14e39b3b359d6d08e0d3aae`.
Status: integrated tree matches task tree; temporary branch deleted.

Prompt program/module sections and individual stages default collapsed. Native
details support independent expansion; summaries show counts/status. Expansion
survives rerenders/editor mode changes/preset saves. New stages expand; local
semantic validation reveals the corresponding section. Save/Back remain outside
disclosures. Prior stage ordering and insertion-position fixes are retained.

Passed: 15 unit tests, four Edge desktop/mobile scenarios, localization and
whitespace checks. ESLint: no errors, two pre-existing test warnings. Screenshots
inspected. No Android/Docker or inference. Record: `feat/prompt-editor-folds.md`.
User authorized publication. This task and the preceding two tasks were pushed
to main and docs together; remote main HEAD was verified against local main.

---
# Previous handoff — Prompt stage order and insertion position

Updated: 2026-09-25 (Asia/Shanghai).
Main: `19b0aaf6b8be79cb77e0696d957a9e15ae0fabf6` (local, not pushed).
Implementation: `3774921c7c8b20a6a662bcdfd533dd12c6b185d5`.
Status: complete; integrated tree matches verified task tree; task branch deleted.

Stage module lists now share the compiler's existing ordering rule. Adding a
module preserves the picker viewport position and focus instead of jumping to
the stage ID input. User explicitly withdrew global insertion/unique ownership
and cross-stage movement; module stage constraints remain unchanged.

Passed 60 targeted unit tests, two Edge scenarios at 1440/390px, changed-file
ESLint, native localization and whitespace checks. No Android/Docker or inference.
Record: `fix/prompt-stage-order-position.md`. This and preceding loading changes
remain local; no push was performed.

---
# Previous handoff — Native loading and module category refresh

Updated: 2026-09-25 (Asia/Shanghai).
Main: `b3beb59dd1cb0d37e6329b6d669448aba213753c` (local, not pushed).
Implementation: `32f9b539c95f130340725e88e6c840bda3edc3c9`.
Status: complete; integrated tree matches tested task tree; temporary branch deleted.

Runtime lists no longer await the full resource inventory; setup checks load on
expansion and exact choices load on route edit. Revision lists use one grouped
scan. Build summaries avoid per-project Git synchronization. Session listings
share exact package validation per request and count saves in one scan. Module
category moves repaint from the committed snapshot while configuration observers
refresh, without rebuilding global search after each edit.

Validation: 41 Jest tests, five Edge scenarios, ESLint, native localization and
whitespace checks passed. Runtime/Build screenshots inspected. No Android/Docker
or inference. Production-scale latency not benchmarked. Main/docs remain local.
Full record: `fix/native-workspace-loading.md`.

---
# Previous handoff — Prompt module category navigation

Updated: 2026-09-25 (Asia/Shanghai).
Main: `e42bd5043939af90583b473c22b68c4b57ca0aaf` (pushed).
Implementation: `31f91f783e5183eab7d7ad5b4a7d950b957eb5d0`.
Status: complete and pushed; verified task tree equals integrated main tree.
Temporary branch deleted. Working trees clean after handoff commit.

Prompt Modules now uses a hierarchical category filter including descendants.
Top ellipsis creates categories/modules; category ellipsis renames/moves/deletes;
module ellipsis edits/moves/deletes. Returning from an editor preserves category,
scroll position and focus. New modules inherit the selected category. Existing
persistence, export/import and deletion ownership rules remain unchanged.

Validation: 13 Jest tests, 5 Edge scenarios (desktop 1440px and mobile 390px),
plus final desktop regression rerun passed. Screenshots inspected. ESLint,
localization coverage and whitespace checks passed. No Android/Docker/inference.
Full record: `fix/prompt-module-category-navigation.md`.

User subsequently authorized pushing; main and docs were pushed and remote HEADs verified. The prior preset cleanup below was successfully
pushed to main and docs before this task began.

---
# Previous handoff — Native orchestration presets and retired asset cleanup

Updated: 2026-09-25 (Asia/Shanghai).
Main: `5fce29a6b64af519e7d89ee888acedee6de40ba7`.
Prompt implementation: `1a3e891230eb15b65af0772a1879f97cc77db8d7`.
Cleanup implementation: `40dbf651b4cbd2abe4486c30a485cba9c87e0fbf`.
Status: locally integrated and verified; main and docs are being published together.
User explicitly authorized pushing, superseding the earlier no-push hold.

## Outcome

All four fixed orchestration presets use native World/Session authority,
Knowledge/Package references and Runtime Route-aware prompts. Spec/Loop/Agenda
remain advisory; Director writes final prose. Revision 2 restores fixed defaults
without changing user copies or route/session bindings. Director is self-contained
and no longer requires named method skills. Spec no longer bans normal analysis
words or legitimate numeric/structured output.

Deleted unused public/presets/plugin-only.json, agent-non-director.json and
agent-director.json after confirming no runtime consumers. Removed obsolete asset
content tests and import-button translations; corrected the Agenda guide. Native
Workspace uses Runtime Routes. Existing imported personal copies are untouched.

## Verification

Prompt work: 37 targeted tests across six suites passed before cleanup.
Cleanup: 18 targeted tests across three suites passed after removing two obsolete
asset tests. Changed-file ESLint, native localization coverage (zh-CN / zh-TW),
and whitespace checks passed. Integrated main tree matches verified task tree.
Temporary branches deleted locally. No paid inference, Android, Docker or full
repository suite; prompt quality has not been evaluated with real model calls.

## Durable records

- `fix/native-orchestration-presets.md`: four-mode prompt design and first audit.
- `chore/remove-retired-agent-presets.md`: cleanup, authorization and checks.
- `feat/native-regex-scopes.md`: previous Regex integration, main df03dedbd.

No changes to the prior Regex, Knowledge or native Prompt resource contracts.
