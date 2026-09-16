# Phase 3 — ContextCompiler and host ports

## Completed execution boundary (2026-09-16)

Continuation base: `af5ee205bc4039b26d74fc181ff700d7e7b8957b`, branch `feat/agent-runtime-v2`.
This section supersedes the historical increment below. Phase 3's production execution gate is now met;
Phase 4 graph/routing migration, Phase 5 UI projection and Phase 6 durable recovery have not been claimed.

| Path | Execution owner | Preserved compatibility policy |
| --- | --- | --- |
| Single | AgentRuntime serial batches + existing Single ports | Final-output priority, provider IDs, notes and structured errors |
| Spec worker/review | AgentRuntime via legacy workflow adapter | Worker output schemas, review/rerun rules, preset resolution |
| Agenda planner/text agents | Same Runtime and adapter | Planner schema, dispatch context, result terminator, per-dispatch notes |
| Loop | Same Runtime and adapter | Round/time/streak budgets, finalize and natural-text fallback |
| Director main | Same Runtime and adapter | Stream/retry policy, draft tools, takeover commit, await/cancel |
| Director subagents/inline | Same Runtime and adapter | Child cancellation, stream/cache barrier, plugin regex and notifications |
| Simulation entrypoints | Above exported routines | Existing synthetic payloads and write protections |

Legacy mode code is now an async-generator **policy adapter**: it yields model/tool intents instead of executing
those operations. `policy.advance` is an explicit effect in the existing pure state machine; it is not another
executor. Only Runtime's ModelPort/ToolPort starts the yielded work. Original retry/termination policies remain
reviewable in place. No parallel primitive was introduced; existing Director/Spec/Agenda concurrency is retained.
The `agentRuntimeV2: false` request still selects Single's legacy protocol path, now also scheduled by Runtime;
it no longer means bypassing Runtime execution entirely. Rollback of this phase is by commit revert.

All requests keep the existing transport chain, including `generateTask`/stream, sender-specific conversion and
`src/luker-dispatch`. Tool registry, simulation and custom-tool resolution remain the existing owners. Run/step/effect
IDs are assigned by Runtime, including internal Director tools. HTTP/LAN hosts without `crypto.randomUUID` have a
run-ID fallback. Provider tool-call IDs remain separate from effect IDs. Late chunks/usage cannot publish after cancel.

`runtimeContext` is an internal, non-wire request hook, forwarded through the shared tool-calling transport.
Both generateTask paths invoke ContextCompiler after card, world-info, macro and preset assembly, before sending.
One shared budget resolver reads the named OpenAI preset's context minus response allowance; other supported
families use the host's existing shared context/output settings. Missing host limits/tokenizer are reported explicitly.
Known limits with a host tokenizer reject overflow before dispatch, preserving whole messages and tool pairs.
Counts are labeled host-tokenizer estimates: provider framing and selected remote tokenizer may differ. Neither
user presets nor messages are silently rewritten. Ordinary authoring/editor requests do not opt in and are unchanged.

Memory OS remains the sole fact/retrieval owner. No second automatic recall is added beside legacy world-info
injection. Its registered recall tool uses MemoryPort; a returned source guard is retained in a run-local set and
checked before subsequent models, during asynchronous counting, and at final prepared-context admission.
The guard set/result map is cleared at exit. No raw memory/tool result enters policy receipts: they hold transient
references only. Lost legacy generator continuations fail closed on resume instead of replaying any effect.
Durable continuation reconstruction/reconciliation is still explicitly Phase 6 work.

Two intentional differences have regression tests: cancellation before the first tool prevents that write (the old
Loop let it through), and later trace appends no longer mutate an already-sent subagent message array. The latter
restores a previously `test.failing` fixture to an ordinary passing test.

### Verification and remaining coverage

- Final phase selection: **212 suites / 2429 tests passed**, including Runtime, all orchestration modes, Memory OS,
  floor-state, generate-task and the existing backend dispatch/provider fixtures.
- Real Edge headless/offline: ES-module loading, policy execution, async counters, MemoryPort, serial tool history,
  cancellation and final assembled-budget rejection passed; zero page errors. Model/storage inputs are fixtures.
- Full unit inventory was run in four shards after restoring the existing better-sqlite3 local binary. The first
  monolithic attempt exceeded Node's heap; sharding removed that limitation without changing repository tests.
- Offline full inventory: **552 suites passed, 7 failed, 7 skipped; 7080 tests passed, 18 failed, 92 skipped**.
  External MySQL/PostgreSQL services are unavailable; the repository's `LUKER_DISABLE_MYSQL_TESTS=1` and
  `LUKER_DISABLE_POSTGRES_TESTS=1` flags were used. Parameterized DB cases omitted by those flags are not all
  included in Jest's skipped count. No Docker/database installation or production configuration was performed.
- All 18 remaining failures reproduced on detached pre-change `af5ee205b`: snapshot-engine-dump (2),
  sqlite-close-handle (1), auto-rollback-engine (1), chat-read-parity (2), sync/categories (1), CPA session-store (9),
  ws-delivery-fetch-proxy (2). These source/test paths were not changed. Thus full-repository green is not claimed.
- Changed modules pass ESLint except pre-existing findings in spec-runtime (no-extra-boolean-cast) and generate-task
  (quotes, brace-style, unused `_`). Those statements remain unchanged; file-local checks suppress only those rules.
- No real-provider, Android-device or live-play acceptance is claimed or required of the owner for this phase.

Full-phase scope budget: up to 26 files / 1400 changed lines including adapter/state/transport, tests and docs.
No version, dependency declaration, user preset/data, generated distribution file or remote entrypoint changes.
No push, integration merge or release. Next permitted phase: Phase 4 typed graph/routing and handoff policies.

## Historical first increment (af5ee205b, 2026-09-16)

Continuation base: `439e8cfa052320ad48e978c40cba41d9facef961` on `feat/agent-runtime-v2`.
Integration baseline remains `cfb95953071d6459c911e3e6a3bed0144e86ba72`.
At that first increment, Phase 3's global acceptance was **not yet met**.
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
