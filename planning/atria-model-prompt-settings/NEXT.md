# NEXT: P5 — Native Runtime Product UI

P0–P4 complete. Stop until explicit user continuation.

- Work branch: refactor/atria-model-prompt-settings
- Main baseline: 2d1c3ec9c8039ecc4728ebe712f4a9f14186906f
- P4 validated/pushed HEAD: 6cba266814a7ff04666220f1031efdb844ad4e46
- Evidence: P4-VALIDATION.md; runtime ABI/whitelist: src/native/model-prompt-runtime/README.md.

## Next-session prompt

Continue Atria Model / Prompt / Runtime Native Refactor on the same work branch.
Fetch work branch, main and docs; preserve newer remote commits. Do not create a
new branch, redo P0–P4 or merge main. Read main:AGENTS.md, main:FORK_MAINTENANCE.md,
docs:handoff/latest-handoff.md, refactor plan, this planning pack, P4-VALIDATION.md,
current Runtime UI/host endpoints and P0–P4 code/tests/guards before editing.

Execute P5 only as specified in DESIGN.md and IMPLEMENTATION.md:
replace A6 Model/Prompt/Connection compatibility shell with Native Runtime Routes,
Models, Connections, Profiles and Diagnostics. Routes is primary; the editor shows
Model → Connection → Generation → Prompt → Fallback. Capabilities belong inside
Model/Route/Diagnostics rather than a standalone technical page. Reuse P1 storage,
exact Library/Resource Graph and P4 host. Do not create a second Store or resolve
Native configuration from legacy presets/settings.

Connections edits connection data and exact Secret references only. Models shows
remote ID, capabilities/provenance and limits. Profiles edits Generation resources.
Diagnostics shows Effective Request, context budget, prompt provenance and fallback
attempts. Provide actionable missing/ambiguous route errors; never silently choose
an active legacy preset. Native preview must compile without sending or persisting;
the legacy Native Generate dryRun path is intentionally rejected in P4.

P4 supports explicit OpenAI-compatible/raw-text endpoints, bearer Secret IDs,
cl100k_base/o200k_base tokenizers and documented controls. Surface unsupported
controls honestly; P3 render-only fixtures are not transports. Preserve request
isolation, fail-closed capabilities, tools/output authority, cancellation, complete
route fallback, Session identity and Studio human Review/Commit boundaries.

No legacy DOM reparenting as primary or advanced product editor. Mobile must use
full-screen/editor flows rather than compressed desktop panels. Validate loading,
empty, error/configured states, keyboard/focus, search deep links and save failures.
Only after replacement works, evolve A6 Advanced Connection and standalone
Capabilities assertions. Retain Play/search/no-second-storage and other frozen
invariants; preserve A8's P4 seam and human Review gates.

Run focused/adjacent tests, relevant N/A/P0–P5 guards, lint, syntax/build and real
browser integration. Start a local server and use Playwright for desktop/mobile
interactions and screenshots; visually inspect, fix and rerun defects. DOM/unit
checks alone are insufficient. Android/Docker remain opt-in. Use existing test
switches when MySQL/PostgreSQL are unavailable and report exclusions honestly.
Do not depend on CI to discover errors.

Record actual results, update/push work and docs, report P5 completion and stop
before P6 until the user explicitly continues.
