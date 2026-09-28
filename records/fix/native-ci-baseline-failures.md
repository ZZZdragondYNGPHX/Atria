# Native CI Baseline Failures — Implementation Record

Task ID: `fix/native-ci-baseline-failures`  
Primary Workspace: `fix/native-ci-baseline-failures`  
Status: **Implementation complete — PR CI pending**

## Start state

- `main@c697532c6a4d54530de023cd65e4c1721efe97b2`
- Baseline failures:
  - `Atria PR Checks` Unit Tests: `native/model-prompt-runtime-p4.test.js` failed because the Package Turn fixture used a pre-Memory-bridge Session snapshot without `timeline`;
  - `Native Model Prompt Runtime`: P2 guard rejected the existing `generation-host.js` import of the pure Native Game LLM Runtime under `public/scripts/native/experience/llm/runtime.js`.

These failures were already present on the exact main baseline before this fix.

## Implementation

Branch: `fix/native-ci-baseline-failures`

Current HEAD: `23a2f075a970b03acdd82f808995dead60989e95`

Changes:

- `tests/native/model-prompt-runtime-p4.test.js`
  - updated the Package Turn publication fixture to the current Session snapshot shape with package version, branch, timeline, and states;
  - this lets the new Host Memory recall path evaluate the snapshot and correctly return denied/empty evidence when no Information Runtime memory grant exists.

- `scripts/check-p2-generation-core.mjs`
  - retained the global ban on browser/SillyTavern/direct sender imports;
  - added one path+exact-import exception for `src/native/adapters/generation-host.js` → `createGameLlmRuntime`, matching the existing exact context-compiler bridge pattern;
  - added self-tests proving the exception works only on `generation-host.js` and still rejects the legacy `st-context.js` facade and the same Game LLM import outside the Host adapter.

No Atria product runtime behavior was changed.

## Verification

PR: **#97** — `fix(native): repair baseline CI guards`

CI at this checkpoint:

- `Atria PR Checks` run `36414275752`
  - `Atria Migration Guard`: success
  - `Lint`: in progress
  - `Unit Tests`: in progress
- `Native Model Prompt Runtime` run `36414275833`
  - `integration`: in progress

CI is the only remaining dependency. No test/build result still in progress is claimed as passed.

## Next

When CI completes:

1. inspect both runs;
2. if a new failure appears, fix it on the same branch and rerun;
3. if both required suites succeed, merge PR #97;
4. verify integrated `main`;
5. update this Record to complete;
6. delete `docs:HANDOFF.md` and the completed fix branch.


### Additional stale integration guards

The first fixes allowed the sequential P8 integration suite to advance and reveal four later guard assertions that had not been updated after already-merged product changes. These are guard/test synchronization fixes, not runtime behavior changes:

- `scripts/check-p5-native-runtime-ui.mjs`: requires the current `prompt-presets` Library section while retaining the legacy `generation-profiles` routing alias.
- `scripts/check-p6-native-authoring.mjs`: checks Studio's current `Review Attach exact` Library-resource path rather than the retired row-level `New revision` action.
- `scripts/check-n9-native-product-authority.mjs`: follows the extracted Embedded Knowledge promotion component; Play must mount `mountEmbeddedKnowledgePromotion`, and the component must expose `Save to my Library` through `promoteKnowledge`.
- `scripts/check-n10-native-hard-cutover.mjs`: requires the current four Native Library sections — Works, Worlds & Knowledge, Prompt Presets and Skills — while legacy Characters/Games/WorldInfo authority remains forbidden.

Sequential integration evidence before the latest head:
- after the P5 fix, P0–P5 passed and P6 exposed the next stale assertion;
- after the P6 fix, P0–P7 and A0–A9 passed and N9 exposed the next stale assertion;
- after the N9 fix, P0–P7, A0–A9 and N9 passed and N10 exposed the next stale assertion.

Latest branch HEAD: `c5f477124fc926fc1349ec79cab17ec67509e5f1`.

Latest validation runs:
- `Native Model Prompt Runtime` run `36415682911`: in progress;
- `Atria PR Checks` run `36415683000`: in progress.
- Earlier `Atria PR Checks` run `36414275752` on `b5a7f935...`: **success** — Migration Guard, Lint and Unit Tests all passed, proving the Session snapshot test fix resolved the original full Unit failure.


The N10 Library assertion was refined once more after reading the current source directly: the current Native Library contains three sections — `works`, `worlds-knowledge`, and `prompt-presets`. Skills are no longer a Library section after the Extensions/Skills UI consolidation. The N10 guard now asserts exactly those three Native sections while continuing to reject legacy Library authority adapters.


Native World Info compatibility guards were also brought forward to the current hard-cutover architecture:

- Native `getSortedEntries()` must return no legacy book-shaped candidates while a Native Session is active;
- `getWorldInfoPrompt()` must route Native prompt selection through `nativeSessionRuntime.evaluateKnowledge()`;
- Native Knowledge candidates must retain opaque binding/base/revision/entry identity;
- neither Native Knowledge runtime nor Native Session projection may recreate a World Info numeric `uid`;
- existing N10 state read/write checks still verify SessionRevision state wins over non-Native FloorState.

These changes reflect current runtime behavior already covered by Native Knowledge tests/E2E; they do not change product runtime behavior.
