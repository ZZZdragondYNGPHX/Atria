# NEXT: P7 — Product Surface Cleanup

P0-P6 complete. Stop until explicit user continuation.

- Work branch: `refactor/atria-model-prompt-settings`
- Main unchanged: `2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`
- P6 validated/pushed HEAD: `2351be51e8c8cbdadf0966104ec607018e93de6e`
- Evidence: P6-VALIDATION.md; runtime ABI: src/native/model-prompt-runtime/README.md.

## Next-session prompt

Continue Atria Model / Prompt / Runtime Native Refactor P7 only, on the same work
branch. Fetch work branch/main/docs and preserve newer commits. Read main:AGENTS.md,
main:FORK_MAINTENANCE.md, docs:handoff/latest-handoff.md, the refactor overview and
planning pack, P6-VALIDATION.md and current P0-P6/A1/A2/A6/A7/A8 code/tests/guards.
Do not create a new branch, redo P0-P6, merge main or implement P8.

P7 scope from IMPLEMENTATION.md / DESIGN.md:
- Settings retains product preferences, not Model/Prompt/Connection/Runtime authority.
- Native Runtime must not embed ConnectionManager/PresetManager editors.
- Global Search navigates to owning routes only; update labels/localization/docs.
- Confine legacy compatibility to an explicit developer/host island.
- Remove old name-based runtime identity and package.presets runtime authority.
- Residual scans reject non-allowlisted legacy managers, globals and DOM selectors.

Retain primary Build navigation; Studio Project changes go through A1 human
Review/Apply, AI through A8. Retain P6 exact Library refs, read-only Package
originals/Fork, owner-scoped Resource Graph, frozen Package derive closure and
P4 execution isolation/Secret/send/fallback. No automatic migration or dual-write.
Preview remains compile-only with committed exact context; it cannot submit model
requests or persist overrides. No second prompt/resource store.

Frontend changes require real local servers and Playwright desktop/mobile
interaction, screenshots and visual review, fixes and recapture. Do not accept
DOM assertions alone. P6 specifically fixed control contrast, compressed Studio
tree, invisible save errors and lost Runtime Design recommendation selections.

Run focused/adjacent tests, applicable guards, lint/syntax/prebuild and real browser
integration. P6 final Native/game-runtime/orchestrator regression: 209/1830 passed.
The separate storage extension has four failures in three suites reproduced on
unchanged P5 under Windows; do not claim all storage passes or silently weaken tests.
Temporary baseline comparison data is ignored under tests/.e2e-scratch; exclude the
p6-baseline worktree from Jest discovery if present (command in P6-VALIDATION.md).
P6 browser tests stub only optional Horde discovery to avoid unrelated TLS/non-JSON
errors; Native requests remain real. Android/Docker remain opt-in; MySQL/PostgreSQL
services and real external model credentials were not validated.

Update/push work/docs with actual evidence, then stop before P8. Give the user a
copyable P8 continuation prompt only after P7 is genuinely complete.
