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

Current HEAD: `b5a7f9354a89d5e89944994f5a21a2155e0f072b`

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
