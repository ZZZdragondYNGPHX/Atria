# Phase 3 — ContextCompiler and host ports

## First implementation increment (2026-09-16)

Continuation base: `439e8cfa052320ad48e978c40cba41d9facef961` on `feat/agent-runtime-v2`.
Integration baseline remains `cfb95953071d6459c911e3e6a3bed0144e86ba72`.
This increment is independently tested and committed; Phase 3's global acceptance is **not yet met**.
Do not start Phase 4 or describe every legacy mode as migrated based on this commit.

### Implemented paths

- `legacy-runtime-ports.js` owns Single's ModelPort and ToolPort wire adaptation. Runtime remains the
  only scheduler on this path; the ports contain no round loop, provider client, persistence or retry policy.
- ModelPort retains `requestToolCallsWithRetry -> context.generateTask/generateTaskStream -> existing sender`.
  For chat-completion requests, that sender reaches the existing backend endpoint and `src/luker-dispatch`.
  Other configured sender families remain supported. No server-only module is imported into the browser.
- ToolPort retains `executeLoopTool`, its existing permission/simulation policy and run-scoped context,
  stable effect IDs, provider call IDs, structured errors and transient result references.
- `createMemoryOSPort` wraps the existing `session.recallMemory`. The registered `memory_recall` tool now
  uses this shared adapter across modes without changing its response shape or simulation behavior.
  Only allowed retrieval options cross the boundary; runtime scratch/context is not forwarded to Memory OS.
  Source guards run after recall and again at the consumer boundary. Runtime stores source IDs, not recall text.
- Legacy automatic world-info injection remains explicitly delegated to its existing owner. Single does not
  issue a second automatic recall on top of it. This delegated port is not a source rehydration implementation.
- Sync and async compiler APIs now share one generator implementation. The async path supports host tokenizers,
  includes full message envelopes and tool schemas in accounting, retains layer/role diagnostics, and checks
  cancellation/source freshness before and after each awaited measurement and before publishing/sending.
- Single supplies the host `getTokenCountAsync`; hosts without it use a labeled UTF-8 byte estimate. User messages,
  presets, reasoning fields and tool-call/result pairs are preserved byte-for-byte at the compatibility boundary.
  An explicitly supplied compiler budget fails before dispatch rather than silently trimming legacy messages.

### Budget boundary and remaining work

The compiled count covers task messages and tool schemas only. It is a sum of serialized-envelope measurements,
not an exact provider wire-token total. The selected preset may differ from the host tokenizer's current model.
The host sender still assembles card/world-info/preset context later and retains its existing final budget policy.
Single therefore does not invent a new context limit: its default compiler limit remains unrestricted, while
`context.compiled` records the measurement method and `task-messages-and-tools` scope explicitly.

To close Phase 3, migrate Spec/Agenda/Loop/Director model/tool scheduling incrementally behind compatibility
adapters, with per-mode golden tests, and resolve final-context budget/injection ownership without duplicating
Memory OS. Those legacy loops still exist. Source-guarded rehydration of legacy tool memory also remains pending;
the transient map must never be mistaken for durable memory. Existing parallel features stay legacy; no new
fan-out/join primitive is enabled. Durable crash recovery remains Phase 6 work.

### Executed evidence

- Selected regression: **163 suites / 2000 tests passed** (agent-runtime, orchestrator, memory-graph, floor-state).
- Eight new cases cover compiler parity, schema budget overflow, real host-counter injection, memory source guards,
  private-context exclusion, cancel/source changes during tokenization and source-text exclusion from checkpoints.
- Edge headless offline smoke passed with real ES modules, async counting, Memory OS port adaptation, serial tools,
  legacy output parity and cancellation; zero page errors. Memory/model services are controlled offline fixtures.
- Changed runtime/port/memory-tool modules pass repository ESLint. Spec runtime passes with its pre-existing
  `no-extra-boolean-cast` violation suppressed only for that file; that original statement is unchanged.
- No live model, Android device or real-play acceptance is claimed. These are later coverage gaps, not a request
  for the owner to perform mandatory manual testing now.

Scope gate: up to 14 files / 650 changed lines for this port/compiler increment, including tests and documentation.
No dependency, version, preset, user-data, generated artifact, remote entrypoint or release change.
Rollback: revert this increment. Existing `agentRuntimeV2: false` bypass and old mode paths remain available.
