# Agent & Memory UI v2 current map

Baseline: `be3a2f573d54a63182cf47ca8c2f145e2accc973`; plan commit: `0da1c19b52c7ade3735084000b05f64b3f7d62d8`.

## Ownership and callers

- `orchestrator/main.js`: extension settings initialization, effective profile, execution snapshot identity, settings editor and menu mount. Current resolver reads per-mode global/character libraries and Agenda chat overrides.
- `preset-library.js`, `character-overrides.js`, `editor-state.js`, `editor-persist.js`, `preset-character-scope-ui.js`: existing dual definition stores, migration, editing and persistence. Iteration studio and import/export also call this layer. Removing only settings selectors would leave active writers.
- `engine-v2/preset-compiler.js`: read-only legacy profile compiler; accepts validated native `orchestrationPlan`. Spec/Agenda/Loop/Director host adapters still use profile fields for prompt/transport setup; native authoring must supply these through a host adapter, not persist duplicate profiles.
- `lib/orchestration-engine`: sole Plan validation, capability intersection, policy, results, graph and arbitration owner.
- `lib/agent-runtime`: sole effect scheduling, checkpoint/CAS, cancellation and parallel execution owner.
- `run-state/store.js`: immutable presentation snapshots and Runtime event journal. `engine-v2/observer.js` currently emits metadata events but omits graph topology and result envelopes. Extend its safe projection rather than infer graph state from DOM/log strings.
- `run-panel/panel.js`, `render-incremental.js`: lazy panel, one subscription, stop command, running pill and streaming rendering. Replace product mount while preserving runtime caller entry points.
- `memory-graph/main.js`: source lifecycle guarded snapshots, corrections, inspector, diagnostics and history builder. Reuse these services; do not introduce a memory store in Workspace.
- `snapshot-cache.js`, `execution-mode-contract.js`: execution identity guards. Effective preset identity must include native definition, not an unrelated old active ID.

## Intended boundaries

`lib/agent-workspace` owns native preset/binding validation and pure projections. `orchestrator/workspace` owns settings persistence, active host scope, profile adaptation and mount. Only view selection/drafts are UI state. Runtime/Engine policy and Memory ledger remain authoritative.

## Removal audit targets

Dual library migration/definition writers, global/character editor selectors, old active IDs and chat profile overrides; old run rendering where no product callers remain. Iteration-studio and export callers require explicit audit before deleting shared utilities. No old-data migration requirement.

## Verification requirements

Native schema/binding integrity; compiler validation; real effective execution path; privacy-safe graph/results projection; scope guards and lifecycle teardown; Memory reference linkage; 390/1440 px browser checks; existing recovery/cancellation/parallel regressions. Device/model/RP gaps remain nonblocking and must be reported accurately.
