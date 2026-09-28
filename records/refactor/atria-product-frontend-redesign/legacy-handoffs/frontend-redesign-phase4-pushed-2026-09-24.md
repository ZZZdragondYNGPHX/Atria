# Frontend redesign — Phase 4 pushed; await Phase 5 authorization

- Date: 2026-09-24
- Repository: `ZZZdragondYNGPHX/Atria`
- Main: `402b53a98a823573591db4e9fd015f98e6effbdb` (Phase 1 integrated)
- Current branch: `refactor/atria-product-frontend-redesign`
- Pushed HEAD: `1ee087510c39926616ccc8cfad22cb435e63de36`
- Completed: Phases 1–4. Outstanding: Phases 5–8.
- **Stop at this checkpoint.** Continue only when the user says continue.
- Keep this branch. Do not recreate it from main, merge or delete it at individual
  phase checkpoints. Phases 2–4 are intentionally unmerged.

## Authority and records

1. `planning/atria-product-frontend-redesign/DESIGN.md` — formal visual and
   interaction authority, including Phase 4 decisions in section 11.
2. `planning/atria-product-frontend-redesign/PHASE-4.md` — delivered scope,
   implementation HEAD, decisions, validation, review corrections and screenshots.
3. `PHASE-1.md`, `PHASE-2.md`, `PHASE-3.md` — complete; do not redo.
4. `refactor/atria-product-frontend-redesign.md` — original architecture/scope audit,
   not a competing visual design.
5. Main `AGENTS.md` / `FORK_MAINTENANCE.md` — repository rules. The user explicitly
   requires retaining the redesign branch and stopping after each phase, overriding
   the usual per-task merge/delete lifecycle.

## Completed in Phase 4

Library Works/poster search, package/save review and permission retry, Work hero,
progress, versions and exact dependencies; World/Knowledge grouped resources,
revision details and readable prose; origin-filtered Prompt Programs/Modules/
Generation Profiles with immutable structured editing; Skills inventory, native
keyboard controls, collection import and file editor conflict feedback.

Medium/compact use a full-width accessible Library picker through WorkspaceHost.
Focus returns after confirmation cancellation; errors preserve input, exact
references remain pinned, and late responses cannot replace newer workspaces.
Package originals remain read-only and Fork/Derive retain their dependency closure.
Skills uses the original controller/scope/expectedSha256 authority. The misleading
per-item bundled button was removed because its endpoint installs the collection.

No backend changes or new router, persistence, configuration or runtime state.
Navigation, Native Session/generation ABI, Game Stage/transient/recovery, Studio
ChangeSet/human review, exact Library resources and plugin ownership remain.

**User decision:** SillyTavern migration is retired. Do not restore its UI or
endpoints. Atria backup restore, storage-engine migration and existing upstream
Native ABI remain; no broad upstream removal is authorized.

## Executed acceptance

- Jest: **48 suites / 558 tests** in Shell, Skills UI and Skills backend.
- Post-polish regression: **35 suites / 337 tests**, then **4 suites / 32 tests**
  after the final focused review adjustments.
- Full lint and all changed JS/test targeted lint passed.
- P8 aggregate architecture/residual guard passed (P0–P7, A0–A9, N9/N10).
- Two cold frontend builds passed with isolated scratch data roots.
- Playwright: **8 Phase 4 cases + 12 existing cross-domain cases passed**,
  including real installation, permission/error/retry, start/resume, deletion
  protection, immutable resources, package Fork, Program/Profile editing,
  Skills creation/save/hash conflicts, navigation history and Native ABI identity.
- Actual screenshots inspected at 1440px desktop, 900px medium and 320px compact;
  dark/light, Chinese, larger text, dialog/error/retry, no horizontal overflow.
  Additional 320px Library form checked with a simulated 420px visual keyboard.
- Selected evidence: `planning/atria-product-frontend-redesign/phase-4-images/`.

No physical Android/Termux, real-device IME, live model service, Docker/Android
build or SQL backend matrix was run. Device keyboard/safe areas are simulated;
this record does not claim physical-device validation. No known unfinished
Phase 4 implementation item remains.

## Next after continuation

**Phase 5 — Runtime:** Routes, Models, Connections, Profiles and Diagnostics,
using the approved grouped forms and compact editor direction. Preserve exact
model/connection/route/generation/prompt authority, Secret ownership and the
existing controller/persistence path. Do not redo Library or start Phase 6–8.

At next startup: fetch, read this handoff and the current main rules, verify the
retained branch HEAD, inspect current Runtime code/tests, and continue from this
branch. Follow any actual later main movement deliberately; do not reset the
unmerged Phases 2–4 back to Phase 1.
