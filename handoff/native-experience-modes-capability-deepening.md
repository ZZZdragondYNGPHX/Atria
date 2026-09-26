# Handoff — Native Experience Modes & Capability Deepening

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
