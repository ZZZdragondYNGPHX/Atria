# Handoff — Native Experience Modes & Capability Deepening

Updated: 2026-09-26. Status: **P1 complete and pushed; stopped before P2**.

- Repository: `ZZZdragondYNGPHX/Atria`.
- Work branch: `feat/native-experience-modes-capability-deepening`.
- Work HEAD: `24e75668b9cf739796ea4c679056391702a8973b` (pushed).
- P0 predecessor: `349287c166bff9344bb9bbabc812a799b9cb8534`.
- Main remains `4dab353ac639d42eae885c79e18245267abd6820`; no merge or branch deletion.
- Plan: `docs:feat/native-experience-modes-capability-deepening.md`, normative §0 Implementation Baseline v1.0.
- The user explicitly clarified: finish P1, stop, do not continue P2. The same branch remains in use through P9.

## P1 implemented

1. Explicit Component v2 document/compiler/runtime, isolated from the existing v1 renderer. Component/Hybrid/Full activate through the same SurfaceHost; v2 surfaces are owned by document views, so the old top-level `experience.surface` is rejected for v2. Component cannot own `app.root`; Hybrid/Full require exactly one primary view. Full retains Host recovery.
2. Strict, bounded local fields and Form controls; pure Formula-based expressions/templates and selectors. Unknown operations, props, roots, functions and model paths fail closed. No Package JS/HTML/CSS, arbitrary patch, DOM, storage or network handle is exposed. Static quoted property/index access is opt-in for UI/Data expressions; original Formula defaults remain unchanged.
3. Form submit validates fields, links errors, focuses the first invalid input and executes named actions. Constraint statuses are `allowed`, `advisory`, `confirm_required`, `blocked`; confirmation is Host-owned and cancels on disposal. Keyed, bounded Collection pages retain DOM identity and focus.
4. Local UI `mount`/`session` state and `player`/`device` preferences reuse existing account settings. State keys include Package/EntryPoint/stateVersion, plus Session/Branch for session drafts and Host device identity for device preferences. The Host's browser storage contains only `atri_ui_device_id`, a non-secret UUID; preference values stay in account settings. This adapter lives in `native/ui-state-storage.js`, outside Package execution, and creates no Session/World store. UI/preference changes never create World revisions. Branch/restore remounts v2; committed revisions refresh its presentation.
5. Package Data loads through the existing authenticated Session runtime/resource route by declared exact AssetRef, bounded JSON and content hash. Dotted IDs map to nested `data` paths. Data is frozen for UI/selectors and declarative logic; reading it does not add Prompt exposure. Missing/mixed/unknown refs fail. Build/install reject malformed v2 documents and Data.
6. Composer has typed set/append/clear/focus/submit. Manual and declarative submission share the same `getContext().generate('normal')` Native entrypoint. No button-click simulation or second generation pipeline. Empty, busy and historical submission is rejected.
7. Action v2 uses existing typed Command/Event/Reducer and SessionRevision commits. `atri_action_receipts` is a protected namespace in the same atomic revision, containing base/committed revision, branch, event refs, request fingerprint and optional compensator. Replay is idempotent; key conflicts/stale writes fail. Explicit compensation is a new typed transaction and cannot apply twice; it never rewinds an immutable receipt. One action permits at most one authority-write step; combine atomic writes inside one Command. Local/Composer steps can surround it; there is no implicit rollback.
8. Uncertain authority failures retain the exact request for in-mount retry. After authority success, a later failed UI/Composer step resumes from that step instead of repeating the commit. Busy action invocations coalesce. Durable generic operation lifecycle remains P3.
9. Declarative logic `schemaVersion: 2` mutation shorthand lowers at build into the existing executable-free Command/Event/Reducer IR. Fixed assignments, closed args, typed validators and deterministic formulas are required. Imported shorthand is revalidated and compiled through the same path.
10. Basic conditional Opening/Wizard uses local drafts, back/next, field validation and a final named action. Committed setup still uses a typed command or Native Composer. Complete Opening lifecycle/ready barrier/workflow integration remains P4.

The support catalog now enables only `component-model@1/@2`, `local-ui-state@1`, `player-preference-state@1`, `package-data@1`, `composer@1`, `action@2`, `declarative-mutation@1`, and basic `opening@1`. Other P2–P9 feature versions remain reserved/unsupported. Package and Runtime Descriptor schema versions did not change. No substantive architecture deviation required editing the formal plan.

## Concrete authoring contract

Primary executable-free fixture: `tests/native/fixtures/component-v2-opening.json`.

- `runtime.experience`: `{ mode, componentModelVersion: 2, component: "ui/main.json", selectors? }`.
- UI document: `{ schemaVersion: 2, stateVersion, localState?, preferences?, selectors?, actions?, views, opening? }`.
- Fields: named scalar string/number/integer/boolean definitions, explicit `default`, optional scope/required/min/max/step/minLength/maxLength/enum. Form models address only declared `ui.key`; state actions may address declared `ui.key`/`prefs.key`. Draft validation may be incomplete; preferences must satisfy their constraints.
- Values: literal JSON, `{ expr: "ui.name" }`, or `{ template: "Hello {{ui.name}}" }`; roots `world/ui/prefs/data/selectors/env/item/index/event/form`. No evaluation side effects, dynamic property expressions or RNG in UI.
- Views: `{ id, surface, mount: "always" | "on-demand", root }`; on-demand only modal/drawer. Node fields and props are closed. Host controls include Form/input/textarea/select/checkbox/range and basic text/layout/progress/details/native slots/repeat.
- Actions: `{ steps, constraints?, idempotency?: "request" | "revision", compensation?: commandId }`; operations `ui.set/toggle/reset`, `command.dispatch/simulate`, `action.compensate`, `composer.set/append/clear/focus/submit`, `surface.open/close`, `opening.next/back/confirm`. Command args are value templates; simulation does not create receipts or authority writes.
- Opening: `{ initial, confirmAction, steps: [{ id, view, fields, next: [{ when, to }] }] }`. Navigation preserves mounted drafts. Completion is mount-local in P1, not a new persistent application phase.
- Mutation source: `{ schemaVersion: 2, mutations: [{ id, event, argsSchema, validators?, assign }], commands?, reducers?, rules?, interpretations? }`; `assign` paths are fixed World reducer paths. Lowered archives use ordinary existing IR.
- Hard limits include 16 views, 512 authored nodes/depth 24, 2048 rendered nodes, 128 fields per state family, 32 steps/action, 64 constraints, 32 Opening steps/64 navigation entries, Collection source 10000/page 100, 2 MiB per Data/UI resource, bounded JSON, 2048 revision receipts and 16384 Host preference keys. Reaching a limit fails closed; no silent eviction of authoritative receipts.

## Actual P1 validation

**187 distinct unit tests across 19 targeted/adjacent suites passed**, run in scoped batches with `ATRIA_DISABLE_MYSQL_TESTS=1` / `ATRIA_DISABLE_POSTGRES_TESTS=1`:

- `native/authoring-contracts.test.js` (45)
- `native/runtime-descriptor.test.js` (10)
- `native/package-build-install.test.js` (5)
- `native/session-runtime-http.test.js` (9)
- `native/studio-preview-experience.test.js` (1)
- `native/session-core.contract.test.js` (22, FS + SQLite)
- `native/experience-actions.test.js` (9)
- `native/experience-resources.test.js` (3)
- `native/ui-state-storage.test.js` (1)
- `game-runtime/package-loader.test.js` (10)
- `game-runtime/ui-component-model.test.js` (4)
- `game-runtime/ui-live.test.js` (8)
- `game-runtime/ui-v2.test.js` (23)
- `game-runtime/formula.test.js` (6)
- `game-runtime/declarative.test.js` (8)
- `game-runtime/logic-package.test.js` (3)
- `game-runtime/logic-runtime.test.js` (8)
- `game-runtime/world-session.test.js` (5)
- `atria-shell/native-play-product.test.js` (7)

Command: `npm --prefix tests run test:unit -- --runInBand <selected paths>`. Reruns are not double-counted. New tests cover exact Data HTTP/install rejection, typed mutation lowering, atomic receipt/journal/state, reload/replay/fork, compensation once, malformed documents, Form errors/focus, conditional wizard, cancellation/disposal, busy coalescing, partial failure retry, scoped persistence and all three v2 layouts.

Passed changed-JS ESLint, `node --check tests/frontend/experience-p1.smoke.mjs`, `git diff --check`, A0/A3/A4 guards, Experience contract foundation guard (52 scanned files), and Native product localization guard (zh-CN/zh-TW).

`node tests/frontend/experience-p1.smoke.mjs` passed on real headless Edge at 1440px and 390px. Checked Form focus/error, drafts across forward/back, paged Collection, no horizontal overflow, modal close/reopen/Escape, once-only Composer call, cleanup and no page errors; inspected both screenshots with actual Atria tokens loaded. This is a controlled browser fixture, not a live model/server end-to-end run.

Resolved ordinary failures: jsdom lacks `crypto.randomUUID` for the UI request generator (uses Web Crypto random bytes); tests were updated from old click-based Composer expectations and v2 rejection; a new Host cleanup test used `dispose` instead of existing `unmount`; lint brace/indent fixes; locale editing initially hit Windows default decoding and was retried explicitly as UTF-8. No remaining test/lint failure. No full-repo/Android/Docker/paid-model run or CI polling.

## Scope boundary / P2 target

P1 is complete. No P2–P9 feature body was implemented. P1 limits are intentional: scalar declared fields, basic keyed pagination (no general query engine or nested Collection), one authority write per action, mount-local wizard completion, no persistent generic operation scheduler or receipt compaction. P3/P4 own operation lifecycle and retention/ready-barrier deepening; P5/P9 own advanced presentation and visual Studio authoring.

Next: **P2 — Message Projection / Conversation / Branch Presentation**. Implement #9/#11/#15 and #16 presentation/thread foundation: message-local UI, actionable message attachments, narrative presentation profile and Branch Graph/Reply Variant facade. Preserve immutable Variants, separate canonical narrative from projection, default historical actions to read-only or explicit fork, and keep render receipts separate from authority/model-delivery receipts. Reuse P1 Component/Form/Action seams rather than creating another renderer or persistence authority. Do not implement P3 bodies.

Fetch first; read main AGENTS/FORK, formal §0, both handoffs and relevant current code/tests. Preserve newer remote commits. Finish P2 on this same branch, commit/push, update both handoffs, update the plan only for substantive design changes, stop before P3 and provide a P3 takeover prompt. Do not merge main before P9.

---

# Historical handoff — P0

Updated: 2026-09-26.
Status: **P0 complete and pushed; stopped before P1**.

## Repository / branches

- Repository: `ZZZdragondYNGPHX/Atria`
- Main / original baseline: `4dab353ac639d42eae885c79e18245267abd6820` (unchanged).
- Work branch: `feat/native-experience-modes-capability-deepening`
- Work branch HEAD: `349287c166bff9344bb9bbabc812a799b9cb8534` (pushed).
- Plan: `docs:feat/native-experience-modes-capability-deepening.md`
- Plan baseline: **Implementation Baseline v1.0**, 32 capabilities, P0–P9.
- No substantive design change; the formal plan was not mechanically edited.
- Continue this one branch through P9. Do not merge main or delete the branch before final verification.

## Read before P1

Fetch origin first. Read current `main:AGENTS.md`, `main:FORK_MAINTENANCE.md`, the formal plan's normative §0, this handoff and `handoff/latest-handoff.md`, then relevant current code/tests/guards. Preserve a newer remote work-branch HEAD; never reset to this document's hash. Do not reopen the completed heavy-card audits or redesign the full architecture.

## P0 implemented

1. `public/shared/native-experience-contract.js` is the shared strict contract/vocabulary boundary, exported through `src/native/authoring-contracts.js` and `src/native/index.js`.
2. Optional package-level `runtime.experienceContract` has its own `schemaVersion: 1`. Project Source validates shape; Package Manifest validates shape plus exact AssetRef closure; Runtime Descriptor compilation revalidates closure and required Host support. Browser package loading also checks strict shape and required support before activation.
3. The descriptor carries `experienceContract` separately from layout-only `experience`. Existing packages without the field retain their existing output and behavior; Package schema v2, Runtime Descriptor schema v1 and Component Model v1 remain unchanged.
4. The 32 frozen capability names have exact reserved versions, distinct from implemented Host support. Only `component-model@1` is currently marked supported in this new vocabulary. Required unsupported features fail closed; optional known reserved features remain metadata only. Unknown capabilities/versions fail even when optional. This is not a permission grant or a second package capability system: existing coarse Package capabilities/permissions are unchanged; these are versioned Experience feature requirements.
5. Package Data refs reuse immutable JSON AssetRefs already carried by PackageVersion. No data loader, selector/query, exposure, storage or executable behavior was added.
6. A3 guard's obsolete `/game-runtime/` file filter was repaired to scan active `/native/experience/` files and reject an empty scan. New `scripts/check-native-experience-contract-foundation.mjs` recursively scans all current and future browser Experience modules plus shared contract/descriptor for retired authority, executable primitives and parallel persistence. Existing A0/A3/A4 guards remain in force.
7. Added fixture `tests/native/fixtures/experience-contract-v1.json`, negative contract regressions, mode-independent descriptor checks, browser rejection checks, and Project -> build -> install -> reopen -> descriptor round-trip coverage through existing storage.

## Exact declaration seam

```json
{
  "schemaVersion": 1,
  "capabilities": [
    { "id": "component-model", "version": 1, "required": true },
    { "id": "package-data", "version": 1, "required": false }
  ],
  "dataResources": [
    {
      "resourceId": "catalog.items",
      "assetId": "asset_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "contentHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  ]
}
```

- All three fields are explicit; arrays are bounded to 256 items and reject duplicate capability IDs / data resource IDs.
- Refs must match an existing same-PackageVersion AssetRef by Native asset ID + SHA-256, with `mediaType: application/json`. The example digest must be replaced with the actual asset digest.
- The enclosing PackageVersion supplies ownership; no new resource store, source URL, follow-latest resolution or Package execution path exists.
- Requirements belong to Package runtime. EntryPoint overrides are rejected, so a selected entry cannot weaken package requirements.
- There is no generic config/extensions/persistence/context passthrough in this declaration. Storage does not imply exposure.
- Reserved versions are API seams, not implemented feature bodies. Component v2 rendering remains rejected by the existing v1 contract until P1 deliberately implements its isolated schema.

## Architecture retained / not implemented

SessionCore, Session Runtime, Experience index and Component Model renderer were inspected and intentionally left unchanged. World / timeline / runtime state continue to commit and restore through existing Native SessionRevision and Branch authority. P0 adds no persistence family or new authority write surface.

No P1–P9 product capability was implemented: no Component v2 UI, Form, local/preference state runtime, Composer actions, Message Projection, Task scheduler, Temporal/Workflow, Activity/Scene, Add-on, Player Continuity, Shared Realm or Studio redesign. Package Data consumption and content/query validation belong to P1; P0 validates declarations and exact asset identity, not a future data schema.

## Actual validation

**138 distinct tests passed across 10 suites**, using targeted/adjacent runs:

- `tests/native/authoring-contracts.test.js`
- `tests/native/contracts.test.js`
- `tests/native/runtime-descriptor.test.js`
- `tests/native/package-build-install.test.js`
- `tests/game-runtime/package-loader.test.js`
- `tests/game-runtime/ui-component-model.test.js`
- `tests/native/session-runtime-http.test.js`
- `tests/native/studio-preview-experience.test.js`
- `tests/game-runtime/world-session.test.js`
- `tests/native/session-core.contract.test.js` (22 tests across FS + SQLite)

Commands: `npm --prefix tests run test:unit -- --runInBand <selected suite paths>` with `ATRIA_DISABLE_MYSQL_TESTS=1` and `ATRIA_DISABLE_POSTGRES_TESTS=1`. First six suites: 101 tests; adjacent HTTP/preview/World: 15; Session Core: 22. Authoring tests were rerun after a lint-only test correction and are not double-counted.

Changed `.js` files passed ESLint without warnings; both touched `.mjs` scripts passed `node --check`. Repo ESLint defaults do not parse `.mjs` as modules, so those scripts used syntax checks instead. `git diff --check` passed.

Passed guards:

- `node scripts/check-a0-native-authoring-hard-cutover.mjs`
- `node scripts/check-a3-native-game-runtime-cutover.mjs`
- `node scripts/check-a4-experience-runtime.mjs`
- `node scripts/check-native-experience-contract-foundation.mjs` (47 files)

Failures resolved during work: shared plain-object validation initially rejected cross-realm structuredClone objects in Jest; corrected without relaxing field/version validation. Conditional-expect lint was corrected. SQLite initially lacked its native binding; ordinary npm rebuild was suppressed by local install-script policy, then the installed better-sqlite3 prebuild installer restored the local binding and all 22 Session Core tests passed. No generated binary/config/lockfile changes were committed.

No full-repo tests, Android, Docker, live/paid inference or GitHub CI polling. No UI behavior changed, so no browser visual QA was needed in P0.

## Next stage: P1 only

**Component v2 / Form / Local State / Action / Opening Foundation**:

- Capabilities #1 / #2 / #3 / #4 / #6 / #7 / #8 and #14's basic Opening/Wizard.
- Implement explicit Component v2 version separation while preserving v1.
- Local UI / player preference state, immutable Package Data consumption, declarative Form validation (`allowed`, `advisory`, `confirm_required`, `blocked`), Host-owned Collection View basics, Composer actions and typed Action v2 / mutation shorthand.
- UI state must not create World Revisions. Form/Action authority writes must enter existing typed Command/Event/Reducer and SessionRevision paths. Expressions/templates cannot have side effects.
- Update only actually implemented capability versions in the shared support catalog. Do not mark all reserved capabilities supported or infer support from layout mode.
- Respect plan §0 and relevant final design sections; do not implement P2+ bodies.
- Run targeted/adjacent tests, changed-area lint/syntax and relevant guards. Fix ordinary failures autonomously.
- On P1 completion: commit and push this same branch, update both handoffs, update formal plan only for substantive design changes, stop before P2 and provide the P2 takeover prompt. Do not merge main.
