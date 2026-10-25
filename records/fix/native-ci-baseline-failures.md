# Native CI Baseline Failures — Implementation Record

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

Task ID: `fix/native-ci-baseline-failures`  
Primary Workspace: `fix/native-ci-baseline-failures`  
Status: **Complete**

## Start state

- `main@c697532c6a4d54530de023cd65e4c1721efe97b2`
- Baseline failures:

These failures were already present on the exact main baseline before this fix.

## Implementation

Branch: `fix/native-ci-baseline-failures`

Current HEAD: `72ca0c9157b13b4fb2b251e79706992f766ab4e4`

Changes:

- `tests/native/model-prompt-runtime-p4.test.js`
  - updated the Package Turn publication fixture to the current Session snapshot shape with package version, branch, timeline, and states;
  - this lets the new Host Memory recall path evaluate the snapshot and correctly return denied/empty evidence when no Information Runtime memory grant exists.

  - retained the global ban on browser/SillyTavern/direct sender imports;
  - added one path+exact-import exception for `src/native/adapters/generation-host.js` → `createGameLlmRuntime`, matching the existing exact context-compiler bridge pattern;
  - added self-tests proving the exception works only on `generation-host.js` and still rejects the legacy `st-context.js` facade and the same Game LLM import outside the Host adapter.

No Atria product runtime behavior was changed.

## Next

When CI completes:

1. inspect both runs;
2. if a new failure appears, fix it on the same branch and rerun;
3. if both required suites succeed, merge PR #97;
5. update this Record to complete;
6. delete `docs:HANDOFF.md` and the completed fix branch.

### P8 final freeze correction

After N10 passed completely, the final P8 freeze exposed one more stale assumption: it scanned every file under `src/native/model-prompt-runtime/**` except `persistence.js` as request-time read-only Core. The later `PromptPresetStore` authoring module intentionally lives in that directory and publishes exact Library resource revisions.

The current remote HEAD `7b486249550ed0ebfff135e6bcda49acf8199790` corrects that boundary without broadening request-time authority:

- `persistence.js` and `presets.js` are the only excluded write-capable boundaries;
- `presets.js` is separately required to be `PromptPresetStore`, use `withRuntimeWrite`, `putImmutable`, and `putMutable`;
- it is still forbidden from Runtime Route / Model / Connection provisioning, direct Library commit, or browser storage.

Latest CI for this real remote HEAD:

- `Native Model Prompt Runtime` run `36416576425`: in progress;
- Lint and Unit Tests in progress.

## Final completion

- final `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`;
- main push `Native Model Prompt Runtime` run `36420802932`: **success**;
- PR-head `Native Model Prompt Runtime` run `36419697797`: **success**;
- merged task branch cleanup run `36420803105`: **success**;
- completed `fix/native-ci-baseline-failures` branch removed;
- remote branch set returned to the intended seven long-lived branches.

The original baseline failures are therefore resolved on main.

The live `docs:HANDOFF.md` is deleted as the final task-lifecycle cleanup step. This Record is the permanent recovery history.

**Task `fix/native-ci-baseline-failures` is complete.**
