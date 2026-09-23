# P3 Request Context / Prompt Compiler validation

Date: 2026-09-23. Work branch: `refactor/atria-model-prompt-settings`.
Base: `5d5ab196c37ad7ff25db44d9dd249c0863b94115`.
Validated/pushed implementation: `5e51332b34146236fd4d4a6d45c25ef7c37a9e08`.
Main remains `2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`; no merge.

## Implementation and decisions

- PromptCompiler consumes P2's exact resolved closure, not mutable Library heads.
  It validates identities, flattens bounded single-parent derivation, and freezes output.
- Add/disable/replace/configure operate on stable module slots. Replacement preserves
  the slot ID; configure accepts only typed module parameter values. Duplicate operations,
  incompatible declarations, missing exact resources and exclusive targets fail clearly.
- Stage order is author-defined; target, descending priority and stable ID order modules.
  Request projections select stages without reordering or creating a workflow engine.
- Program parameters and request locals use typed declarations/defaults. Host views are
  typed by the host compiler instance. Artifact definitions identify a producer stage;
  later consumers must declare their dependency and receive explicit host-provided values.
  No hidden reasoning access, expression evaluation, model execution or state writes.
- Finite conditions support comparisons, exists/in/contains, all/any/not, with depth and
  collection bounds. Variable reads reject undeclared scopes and prototype traversal.
- New optional fields remain absent in normalized old resources, preserving old shape
  and content identity. New metadata round-trips P1 exact persistence; no new store.
- Native Session adapter delegates to existing compileNativeContextPlan. Task/Studio
  providers delegate host fact selection. Only selected contents are projected, not both
  included items and renderedWarmContext. Source refs and exact revision are retained.
- Native raw TurnGroups keep existing speaker-labelled rendered text as user history.
  This deliberately avoids a second history/text reconstruction path. Deferred reserves
  must be resolved before generation. Host settings and snapshots are copied/frozen.
- Prompt IR preserves host tools/output authority, context positions, Response Directive,
  prefill and provenance. Preview diagnostics explain included/disabled/conditional modules.
- Provider token accounting covers the complete rendered request once per route attempt;
  Context selection estimates are not added again. Final budget checks remain P2-owned.
- OpenAI-compatible/raw-text fixtures consume the new renderer. Anthropic/Gemini have
  conservative render-only fixtures which refuse unrepresentable interleaved system slots.
- P2 guard gets one exact host-adapter import exception for the existing Native Context
  Compiler. Negative tests prove Core still cannot import it or other browser modules.
  P3 guard rejects scripts, model calls, writes, Secret lookup and duplicate fact scanners.
  A6/A8 replacement gates are unchanged.

## Commands and actual results

1. Focused/adjacent Jest: P3, P2, contracts, persistence, P1, context-compiler,
   library-build-closure and library-authoring: **8 suites / 110 tests passed**.
   This preceded two additional P3 cases.
2. `ATRIA_DISABLE_MYSQL_TESTS=1 ATRIA_DISABLE_POSTGRES_TESTS=1 npm run test:unit
   --prefix tests -- --runInBand native`: **49 suites / 385 tests passed**.
   FS and SQLite ran. The name filter also selected existing adjacent Native UI tests;
   those unit tests are not a claim of visual acceptance.
3. Final `npm run test:unit --prefix tests -- --runInBand
   native/model-prompt-runtime-p3.test.js`: **38 tests passed** after the adapter
   settings/snapshot immutability tightening. Test demonstrates caller settings mutation
   does not alter the copied configuration. No full broad rerun after that narrow change.
4. `node scripts/check-p0-model-prompt-runtime-architecture.mjs` and `--self-test`;
   `check-p1-model-prompt-resource-foundation.mjs`, `check-p2-generation-core.mjs`,
   `check-p3-prompt-compiler.mjs`: passed, including P2/P3 mutation self-tests.
5. `check-a1-native-authoring-backend.mjs`, `check-a2-library-resource-architecture.mjs`,
   `check-a7-studio-authoring-ux.mjs`, `check-a8-project-agent.mjs`: passed unchanged.
6. `npm run lint`: passed. Focused ESLint over model-prompt-runtime, adapters and P3
   tests passed; final adapter/test edits re-linted. `node --check` over core/adapter JS
   and P2/P3 guard MJS passed; `git diff --check` passed.
7. `npm run frontend:prebuild-cache -- --dataRoot <temporary external cache>`:
   webpack succeeded. No generated build output was added to Git.

Initial local failures were fixed before delivery: the secret-material validator needed
an export, and a test attempted to sort an intentionally frozen output array. Focused
test lint also found two trailing commas; corrected. No failed check remains outstanding.

## Limits / next

No first-party or frontend/UI cutover; no actual browser/Playwright visual acceptance.
No real provider/Secret request, MySQL/PostgreSQL service, Android, Docker, or complete
all-repository Node regression. Existing transport fixtures still reject unsupported
tools/output/prefill and provider controls rather than weakening them. No production
Anthropic/Gemini network adapter is claimed. Stage outputs must be supplied by the host;
Prompt Compiler is not an orchestrator. P4 owns first-party integration and needed host
adapters, preserving Native Session, tools/output, fallback and Review/Commit semantics.

P3 is complete; wait for explicit continuation before P4. User desktop/mobile Playwright
and screenshot requirements remain recorded in NEXT.md for every frontend/UI change.
