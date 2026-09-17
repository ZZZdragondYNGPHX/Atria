# AI Handoff Context

The maintained fork is `ZZZdragondYNGPHX/Luker`; `custom-release` is the integration baseline.
Read `AGENTS.md`, `FORK_MAINTENANCE.md`, and the applicable task prompt before new work.
Git history and current code are authoritative; completed implementation plans and phase reports
were removed at the owner's request. Their historical versions remain in Git.

## Current architecture to preserve

- Agent & Memory uses one Unified Preset Library and default/character/conversation ID bindings.
  Do not restore the retired dual preset stores or override writers.
- The shipped Agenda is Atri-agenda (`agenda-defaults.js`). API/prompt profile fields remain
  empty; do not auto-select a prose or internal prompt preset. Existing libraries replace
  the retired `builtin-agenda` in place once, retaining bindings and other preset IDs.
  `planTemplate.metadata.builtinAgendaRevision`
  prevents overwriting subsequent edits. Deleted built-ins are not resurrected. Agenda uses
  injected context only, no extra business tools, and produces guidance rather than RP prose.
  The shared `?` help imports offer Atri-plugin-only and Atri-agenda-agent under the stable
  public URLs `/presets/plugin-only.json` and `/presets/agent-non-director.json`. These are
  opt-in imports, not startup content seeds. Director's separate help preset is unchanged.
- Workspace presentation lives in `public/scripts/extensions/orchestrator/workspace/`.
  Its six views use existing Runtime/Engine/Memory services. Preset edits affect future runs;
  admitted runs retain their own snapshots. Metadata trace exports omit private result bodies.
- Agent Runtime owns model/tool scheduling, typed handoffs, cancellation and bounded parallel work.
  Account-scoped IndexedDB checkpoints use version checks and persistence barriers. Lost legacy
  generator continuations fail closed rather than replaying writes. No automatic whole-scene
  restoration or cross-device runner is promised.
- Engine policies support Spec, Loop, Agenda and Director. Existing legacy selectors and direct
  node APIs remain compatibility callers. Draft-edit permissions do not imply reply submission.
- Memory OS shares the existing memory-graph, FloorState and vector backends. Provenance guards
  bind facts and graph evidence to source revisions. Generic memory supports plain text cards;
  MVU and LoreState are optional read-only state providers. They own their current state.
  Workspace's Enable Memory OS switch persists `memory_graph.memoryOsEnabled`, read at call time.
  It is independent of agent orchestration and the legacy memory automation switches.
- Memory settings and knowledge inspection mount inside Workspace with teardown on view changes.
  Preserve source/scope guards, Worker cancellation and stale-result rejection.
- Execution cache reuse depends on the configuration identity. Partial budget-exhausted results
  are not completed cache entries. Keep configuration fingerprints aligned with runtime inputs.
- Termux launch/toolbox support is integrated; preserve the scripts and shared data storage behavior.

## Verification boundaries

- Agenda Planner catalogs expose only IDs and short purposes, never Worker execution prompts.
  Agenda control requests use per-call non-streaming transport. Planner tool names may be
  normalized only for a single call passing the complete Planner schema; one task-only
  repair is allowed. The host's request-local generation gate blocks prose after Agenda
  failure/cancellation and releases only after guidance or a valid completed cache hit.
  Runtime trace cancellation maps to the existing run-panel `aborted` UI state.
- Memory extraction uses task-only, non-streaming, required-tool requests and stages partial
  calls across bounded EXTRACTING / MEMORY_FACTS_PENDING / DONE_PENDING phases. Only complete,
  schema-valid batches reach graph application. Facts, temporal operations and source bindings
  share one provenance transaction; legacy graph changes are prepared on a clone first.
  Extraction does not inherit the main prose preset/card/worldbook prompt envelope. Selected
  connection/sampling presets still apply. Failed protocol batches remain retryable without
  advancing extraction coverage or blocking ordinary chat. Do not restore whole-batch replay
  merely because the provider split a transaction over several responses.

Browser fixtures and offline tests do not establish Android device or real-model acceptance.
The owner accepts those as coverage gaps and prefers autonomous offline/browser verification.
Do not copy stale test counts or historical startup failures as current facts; rerun relevant checks.
UI layout/localization changes do not require a data migration or version bump.
