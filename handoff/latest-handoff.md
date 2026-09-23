# Active checkpoint: Model / Prompt / Runtime — P3 complete, ready for P4

- Repository: ZZZdragondYNGPHX/Atria
- Work branch: refactor/atria-model-prompt-settings
- Main baseline (unchanged): 2d1c3ec9c8039ecc4728ebe712f4a9f14186906f
- P2 validated HEAD: 5d5ab196c37ad7ff25db44d9dd249c0863b94115
- P3 validated/pushed HEAD: 5e51332b34146236fd4d4a6d45c25ef7c37a9e08
- Date: 2026-09-23
- Next: P4 First-party Runtime Cutover, only after explicit continuation.
- Continue the same work branch; do not merge main or redo P0–P3.
- N0–N10/A0–A9 semantics remain frozen. A6/A8 replacement gates unchanged in P3.

## Delivered

PromptCompiler implements the P2 preparePrompt port over the exact resolved resource
closure. Bounded single-parent derive, stable module slots, add/disable/replace/configure,
typed Host/Program/Module/Request Local values, finite condition DSL, declared public
cross-stage artifacts, semantic target/stage ordering, exclusive conflicts, Response
Directive, immutable IR/provenance/preview diagnostics and stage projections.

Task/Studio Context Providers delegate existing host selection. Native Session provider
and host adapter reuse compileNativeContextPlan without a second fact scanner. Selected
facts/history/input and source refs are consumed once; stale revisions and unresolved
reserves fail closed. Final full-request token accounting remains at the P2 Provider Port.

OpenAI-compatible/raw-text transport fixtures now use the P3 renderer. Conservative
Anthropic/Gemini render-only fixtures reject unsupported interleaved system semantics.
Kernel tools/output authority is carried from the host request, never granted by modules.
No persistent prompt side effects, new Store/Library/Graph, or first-party/UI cutover.

## Actually executed locally

- Final P3 focused: 38 tests passed.
- Native + matched adjacent: 49 suites / 385 tests passed with FS/SQLite.
  Existing ATRIA_DISABLE_MYSQL_TESTS=1 / ATRIA_DISABLE_POSTGRES_TESTS=1 switches used.
- Earlier focused/adjacent run: 8 suites / 110 tests, before two additional P3 cases.
- After the broad run, Native adapter settings/snapshot immutability was tightened and
  covered by the existing adapter test; the final 38-test P3 run passed.
- P0/P1/P2/P3 guards, P0 self-test, P2/P3 mutation self-tests passed.
- Frozen A1/A2/A7/A8 guards passed unchanged.
- Root lint; focused source/test lint; JS/MJS syntax; git diff --check passed.
- Frontend webpack prebuild passed with cache outside the repository.

## Boundaries and limitations

No real provider account/Secret request; synthetic fixtures only. No full all-repository
Node regression, MySQL/PostgreSQL service, Android or Docker run. No UI files or production
frontend consumers changed, so no browser/Playwright UI acceptance was performed.
P4 must follow the user's desktop/mobile interaction and screenshot requirements whenever
frontend/UI changes occur. P3 conservative protocol fixtures are not production
Anthropic/Gemini transports; P2 transport tools/output/prefill limitations remain fail-closed.
Native recent raw history preserves existing speaker-labelled TurnGroups as supplied user
history messages; it does not reconstruct individual messages from canonical Timeline.
Host orchestrators must supply declared public artifacts; the compiler never runs stages.

Details: planning/atria-model-prompt-settings/P3-VALIDATION.md.
Next instructions: planning/atria-model-prompt-settings/NEXT.md.
