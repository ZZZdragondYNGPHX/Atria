# Atria MCP Capability Expansion — Implementation Record

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

Latest state: the 2026-10-04 integration checkpoint below supersedes the older unmerged-Core checkpoint.

## Phase 1 — MCP Kernel / Repository Observation

Status: **Complete; pushed; stopped at Phase 1 boundary** (2026-09-29).

### Checkpoints and execution boundary

- Start plugin HEAD: `c125b2e7b63ed035a0a253c4036cbdb6bd273225`.
- End / tested plugin HEAD: `8cf6275239860a915d2444d62b05019d8674a6d5`.
- Product main baseline: `c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`.
- Start docs HEAD: `708757c0a15cacac2f94bc648f98bb55d113274c`.
- Rechecked before push; no concurrent changes.
- No live HANDOFF existed; created it for this task. Created this Record when implementation began, then updated it at phase completion.
- Reused clean existing plugin/docs worktrees.
- Implementation changed only `plugin:atria-mcp/`. No product source changes, no `feat/mcp-development-authority`, no main merge into plugin, no Phase 2 implementation. The caller's existing product working tree remained clean and on its existing branch.

### Delivered

- Package version 0.2.0 and exact 18-tool registration; strict input schemas reject unexpected legacy fields. No per-domain public tools or legacy callable aliases.
- `ActionRegistry`: versioned descriptor metadata, input/output JSON schemas, domain/risk/search/detail discovery, immutable descriptor copies and duplicate-ID rejection. No product actions registered yet.
- `PolicyCeiling`: exact action-ID snapshot; future registrations do not inherit a historical grant. Default READ-oriented. This is eligibility representation, not approval.
- Real product mutation remains disabled even with a programmatically broader ceiling.
- Ephemeral, bounded, redacted Receipt Store: MCP instance and receipt identity, TTL, eviction, detached reads and process-close cleanup. No product persistence, lease minting or trusted approval behavior.
- `atri_git`: status, working/staged/base-to-ref diff, log, exact-file show and blame. Fixed subprocess arguments; external diff/textconv disabled; bounded output/time; only regular historical blobs. Status distinguishes Git index/worktree/untracked codes.
- `atri_artifact`: fixed-root list/read/search/image/inspect with node/depth/byte limits.
- Independent `RepositoryAccessPolicy`: tracked/untracked/artifact classification, product/user data and dependency/cache exclusions, sensitive paths, traversal/ADS/symlink/junction protection. Explicit extra dataRoot exclusion;
- Sensitive-content filtering is applied before pagination/truncation. Private keys are denied; ordinary structured/free-text credentials redacted; sensitive multiline content suppressed.
- Consolidated `atri_api` supports Native discovery/detail/GET only. Removed the write switch, model confirmation fields and old browser mutation implementation; Phase 1 browser interaction allows scrolling only.
- Existing browser observation, authenticated GET/reference, images, frames and diagnostics preserved. Diagnostic snapshot explicitly marks later-phase product evidence unavailable.

### Frozen audit conclusions preserved

- Native Frontend Runtime v3 already exists in main; do not create a second frontend or Studio authority.
- Reuse canonical `serverBootId`; the standalone `runtimeBootId` design is cancelled.
- Phase 2 must recheck then-current main for direct current-runtime identity and startup source fingerprint/full revision binding before deciding whether product code is needed.
- Frontend Host Bridge and MCP Browser Capability Bridge are distinct. The latter is later limited to allowlisted Memory / Orchestrator / selected game-runtime APIs without stronger server authority.
- Build remains the semantic action namespace; Native Studio remains owning authority. Reuse Source Graph, diagnostics, frontend.patch, formal evaluation, Preview and Experience Epoch.
- Committed Conversation/Timeline is immutable. GenerationProjection remains ephemeral presentation.
- v0.2.0 public surface remains exactly 18 tools. Semantic expansion belongs in the Registry.

### Limits and next checkpoint

- Phase 1 provides kernel infrastructure; product semantic action registry is empty and all product side effects remain disabled. Trusted approval/Lease behavior belongs to Phase 4.
- Arbitrary unlabelled secrets cannot be identified reliably from free text; use a controlled development checkout. Explicit custom/CLI data roots must be supplied via `--data-root` if not represented in root runtime config. All known sensitive/product-data exclusions remain independent of gitignore.
- Fixed roots and limits are documented in the plugin README.
- No Source ↔ Runtime ↔ Browser match is established yet.
- Approved Plan is unchanged. HANDOFF retains the exact continuation prompt.

## Phase 2 — Runtime Provenance / Fixed Capability Adapters

Status: **Complete; pushed; stopped before Phase 3** (2026-09-29).

### Delivered

- Product: one `GET /api/diagnostics/runtime-identity` on the existing private diagnostics mount, with `Cache-Control: private, no-store`. Launcher captures identity once before importing server-main. Requests return detached snapshots and never recompute startup source bytes.
- Product responses carry `X-Atria-Server-Boot-Id` so MCP can bind the actually loaded main document, not merely a subsequent API request. No second boot ID or new Frontend/Studio authority.
- Product and plugin independently implement the wire protocol; MCP never imports or executes configured checkout code. Raw CRLF/LF differences intentionally change identity. Fingerprint is source evidence, not identity of dependencies, runtime config or user data.
- Status can fetch identity without starting a browser.
- Browser open/reload binds document response boot ID to current authenticated runtime identity. Status cannot silently recapture it. Server restart gives `STALE`; reload/open gives `CURRENT`. Also fixed empty transient iframe URL handling found by the new browser fixture.
- Status, browser evidence and screenshot text carry provenance. Native GET responses include their own boot ID/timestamp. Screenshot capture reports scoped identity changes across the capture interval; unmeasured intervals are explicitly labelled. Source match is never a substitute for scoped authoring proof.
- Preview UI observation must match the same Preview and PackageVersion. No arbitrary Host Bridge dispatch or second Preview/evaluation/Source Graph implementation.
- Internal fixed browser adapters: `memory.schema.scope` → `memory-graph.getSchemaScopeInfo`; `agents.presets.list` → `orchestrator.listWorkspacePresets`; `game.loaded.identity` → browser-loaded `game-runtime.getPackageState` projection. No model-provided JS/module/window/property-chain/capability/method dispatch; no vector recall, model calls or mutation.
- Fixed adapters are infrastructure only; Registry remains empty until Phase 3 owns full READ registration. Exactly 18 public tools, GET-only `atri_api`, no legacy aliases/confirm/write switch, no Lease or approval implementation. Committed Timeline and ephemeral GenerationProjection boundary unchanged.

### Failures resolved and limits

- Browser fixture exposed a transient empty iframe URL; it now fails filtering safely rather than throwing.
- This was not accepted as healthy product UI evidence.
- Missing identity, untracked uncertainty, scope Epoch/Preview changes and fixed adapters have fixture/unit coverage.
- No Phase 3 implementation or Phase 4 mutation/approval work begun. Approved Plan v1.1 remains unchanged.

### Remote state / next checkpoint

- Plugin and product feature commits pushed. No remote CI pass claimed. Product workflows do not automatically run on this feature push; no PR or manual broad workflow was created for this phase.
- Product feature is not merged or deleted at this phase boundary. Preserve/reuse it for later task stages.
- Same Record and task-owned live HANDOFF updated. Next stage is **Phase 3 — Full Read Authority**, only on a new explicit continuation. Fetch all real refs before resuming; keep the exact 18-tool surface and preference for stronger server authority.

## Phase 3 — Full Read Authority

Status: **Complete; pushed; stopped before Phase 4** (2026-09-29).

### Actual checkpoints

- Start plugin: `038f061223684c9e36ad3340dd08d8a295d625bf`; end / real-integration-tested plugin: `4d8cbb9da376b3417f47e6f3e23d9eba09b1c1ae`, pushed.
- Start product feature: `46d717dd177d2825d420ab21d53f13968f645afe`; end / real-integration-tested `feat/mcp-development-authority`: `defeaabacd918966f3fda6f3be3dcb2a789deebd`, pushed, retained, not merged.
- Main remains `c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`.
- Docs start: `55690046979aea005391595bb265932a5c3f161d`; use real latest remote docs HEAD on resume.
- Read current AGENTS, full Governance, task-owned HANDOFF, Plan and this Record. Reused worktrees; no main-to-plugin merge, reference access or caller-checkout changes. Re-fetched before push; no concurrent ref changes.

### Delivered and authority decisions

- **102 READ actions**: 76 fixed HTTP and 26 fixed browser adapters. Exactly 18 public tools. Descriptors provide schemas, owning authority, risk, external effects and runtime prerequisites. Exact-ID Policy Ceiling is created after registration. No approval/Lease/mutation implementation.
- Native reads cover Session inventory/detail/snapshot/saves/health/runtime, immutable Timeline/history/branches, generation status; Library inventory/exact/graph/references/Used By/delete-safety/bundle inspection/fork preflight; Work/version/dependencies/resource setup; Generation configuration/resources/presets/retrieval, Connections/Models/Routes, opaque Secret references, scoped Settings, Diagnostics and ProjectAgent task/context.
- Studio source base64 is decoded before filtering; non-UTF-8 output is metadata-only. Bundle inspection/preflight keeps payloads internal and returns references/dependencies/conflicts.
- `connection.probe` resolves an existing ConnectionProfile ID through Native Generation; no model-supplied credentials or arbitrary endpoint. Secret inventory projects only opaque ID/label. Probe/vector/recall declare network/possible-cost effects separately from READ risk; snapshots do not invoke them automatically.
- High-level snapshot composes source/server/browser identity, browser failures, modules/logs/incidents/startup/provenance and independent last-observed Experience/Preview evidence. Missing/permission-denied evidence remains explicit. Reads are not atomic and do not prove current exact scoped identity.
- Fixed browser reads cover Memory scope/schema/nodes/edges/candidates/briefs/expansion/keyword/vector/name/compaction candidates/injection/last projection/observation recall; Orchestrator preset inventory/bindings/run/graph/timeline/model/tool/recall/diagnostics/token/cost/checkpoints; browser-loaded game identity/LLM status/presentation. Persisted preset/binding reads prefer SettingsRepo. LLM status is explicitly not GenerationProjection or committed Conversation.
- Last-observed scoped evidence never becomes a current exact claim. Non-empty Memory reads require an already loaded owning store.

### Minimal product gaps filled on the retained feature

- Legacy Settings `/get` can seed/migrate state. Added authenticated pure `/api/settings/observe` over SettingsRepo: scoped catalog/get/search, no seeding, secret/generation-configuration exclusions, root-dump rejection and path/type-only search.
- Exposed existing Native Library `getExact` through Studio HTTP; no new Library store or resolution logic.
- Exposed existing Orchestrator `workspaceRunView(getCurrentRun())`, rejecting stale requested run IDs; no second run store or execution mechanism.
- Existing Memory write-session/source reconciliation/recall access accounting can persist changes. Added loaded-store read factory/last projection and observation recall through existing lifecycle.
- Canonical `serverBootId` and startup identity are preserved. No new Frontend Host Bridge, Source Graph, diagnostics compiler, frontend.patch, evaluation, Preview or Experience Epoch authority.

### Remote CI, limits and next checkpoint

- Both implementation HEADs pushed.
- Current evidence distinguishes product/unit/fixture coverage from real server READ and idle browser flows.
- Missing older endpoints/capabilities fail without storage fallback. Unlabelled secrets in free text retain the documented best-effort redaction limitation.
- Plan v1.1 unchanged. Same Record/live HANDOFF updated; product feature retained separately from main. Next stage only on explicit continuation: **Phase 4 — Authorization / Receipts / Safe Mutations**, stopping before Phase 5.

## Phase 4 — Authorization / Receipts / Safe Mutations

Status: **Complete; pushed; stopped before Phase 5** (2026-09-30 Asia/Shanghai).

### Actual checkpoints

- Start plugin: `4d8cbb9da376b3417f47e6f3e23d9eba09b1c1ae`; final / real-integration-tested plugin: `f420640d299ceb3fda48a9f49c85f2b4c0c6cc0e`, pushed.
- Plugin implementation commits: `f56ce880d571dbc479c739ac64235642e1b2e1b4`, `b5ba42cccd59500cfd4314ed913bf43f9524b936`, `f420640d299ceb3fda48a9f49c85f2b4c0c6cc0e`.
- Start product: `defeaabacd918966f3fda6f3be3dcb2a789deebd`; final / real-integration-tested `feat/mcp-development-authority@da284bc51db1f10cfb82fe7444b2f1087a3a9a6e`, pushed, retained, not merged.
- Main unchanged: `c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`. Docs start: `e8bf4dbae3b28dd1d0d150812138d2d5d7bd5c23`; use actual latest docs HEAD on resume.
- Read current plugin AGENTS, full Governance, task-owned HANDOFF, frozen Plan v1.1 and this Record. Reused worktrees; no main-to-plugin merge, reference access or original-checkout changes. Final fetch confirmed docs live slot still belongs to this task.

### Authorization, Lease and Receipt

- Registry now has **136 actions: 105 READ / 25 MUTATE / 6 INTERACT / 0 DESTRUCTIVE**. Exactly 18 public tools remain. Three new READ helpers prepare/inspect Build changes and inspect the loaded Memory mutation target.
- Startup `--policy` accepts only versioned exact action IDs. Default remains READ.
- Trusted approval uses MCP form elicitation, presenting exact normalized input, target, authority, risk, effects and provenance. Model-provided input is never approval. No legacy aliases/confirm/allow-writes, arbitrary JS/capability dispatch or generic Native write escape hatch; `atri_api` remains Native GET-only.
- Private server-minted leases bind MCP instance, exact action/risk/payload/target/serverBootId, expire after five minutes and have explicit 1–20 uses. Invalid/expired/exhausted leases fail rather than silently reapprove.
- Ephemeral bounded/redacted receipts record succeeded/rejected/indeterminate outcomes, before/after evidence, effects and recovery. Uncertain transport/partial composite execution is not automatically retried or rolled back. Server-owned receipt/created-object identity cannot be supplied by the model. Receipt retention is one hour / at most 100 entries.
- Source/Server/Browser evidence stays independent from scoped Experience/Project/Workspace/Preview evidence. Last-observed is explicitly not current exact proof.

### Controlled operations and owning authority

- Session rename/save/restore and Chat branch fork/switch/restart/remove-active use existing revision/branch authority and retain historical committed Timeline. Send uses the owning detached turn scheduler; regenerate/reenter compose a branch boundary and generation, reporting partial completion as indeterminate. GenerationProjection remains ephemeral.
- Work start binds exact version/entrypoint and resource setup. Build prepare/inspect accepts a fixed Workspace operation schema; evaluate/frontend.evaluate reuse formal Native Studio evaluation and its temporary-change restoration.
- Build apply requires this MCP instance's successful evaluation receipt, matching baseRevision, Workspace, normalized operations, inspected changes, current Preview/version and boot. No ad-hoc compiler, Source Graph, frontend.patch or Preview authority was introduced. Preview create/close and isolated recorded/mock simulation use existing services.
- Settings patch is restricted to eight ordinary scalar keys with test/replace concurrency. Runtime parameters use existing prompt-controls; Connection/Model/Route updates use fixed config authority, opaque Secret references and expected fingerprints. Library World/Knowledge create immutable revisions, including the nullable initial revision.
- Memory node create/edit, relation upsert and compact use literal fixed browser calls and the already loaded owning graph. Native relation directions are outgoing/incoming/bidirectional. No Frontend Host Bridge handle or arbitrary browser code is exposed.
- Existing callers remain compatible. Native server remains preferred; no parallel storage/authority was created.

### Final exact-HEAD real integration

- Fourteen successful MCP operation receipts: build.frontend.evaluate, build.change.apply, build.preview.close, build.simulate, session.rename, session.save, chat.branch.fork, session.restore, work.start, settings.patch, two library.world.revision.create and two connection.update.
- Real Source Graph-selected frontend.patch evaluation restored the original source; apply changed the exact intended text; stale apply and mismatched server boot were rejected.
- This proves protocol execution, **not human approval UX in Codex/Claude Code**. Connection configuration used a non-contacted example.invalid endpoint and an opaque reference; no paid provider call.
- Eight browser READs succeeded for Memory scope/injection/last recall, Orchestrator presets/idle run/checkpoints and game identity/status. These remain **idle/empty** evidence. Populated Memory mutation is covered by product tests and a real-browser fixture, not a populated real Atria end-to-end flow.
- Source fingerprint `5dd6413fc5c5420439c3e2de3d2a4d7c00341883915fc74a41c4669891f0084e`; actual server restart changed boot `bc0d5d6d-d21a-4e37-9993-0453a8771596` to `8946112b-45fd-41cc-8f81-459d5e9c7891`; retained page became STALE, reload CURRENT. Historical evidence only.
- Desktop 1440×1000 and narrow 390×844 shell captures retained under ignored `atria-mcp/.artifacts/atria-1790698052908/`. Owned runtime/browser/temp data/config were cleaned up. No test data, logs, screenshots or generated binaries committed. Expected restart websocket failures/startup timing aborts remain; no zero-error UI claim.

### CI, limits and next checkpoint

- API/fixture/unit evidence must not be upgraded to these claims.
- Approved Plan v1.1 unchanged. Same Record and task-owned live HANDOFF refreshed. Product feature stays separate. Phase 5 has not begun.

## Phase 5 — High-risk Operations / Package / Agent Delegation

Status: **Complete; pushed; stopped before Phase 6** (2026-09-30 Asia/Shanghai).

### Actual checkpoints

- Start plugin: `f420640d299ceb3fda48a9f49c85f2b4c0c6cc0e`; end plugin: `1dfcc35f673f3b4db031355ab061558ca9c1569a`, pushed.
- Start product: `da284bc51db1f10cfb82fe7444b2f1087a3a9a6e`; end `feat/mcp-development-authority`: `b2709b5af2664b05f6bd32a05a06097a3e98bd6f`, pushed, retained, not merged.
- Main remains `c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`. Docs start: `5dd13e2d1a9e6f657fe6b0b05f098ae37b4a1780`.
- Reused all existing worktrees; no reference reads, main-to-plugin merge or original checkout edits. Re-fetch before push confirmed unchanged docs live slot and base refs.

### Destructive authorization and cleanup

- Registry: **152 actions = 109 READ / 27 MUTATE / 8 INTERACT / 8 DESTRUCTIVE**. Exactly 18 public tools; canonical `serverBootId`, Native GET-only `atri_api`, fixed browser calls and default READ ceiling retained.
- DESTRUCTIVE approvals have exactly one use. Receipt deletion evidence is now populated. There is no broader repeatable destructive lease or natural-language cleanup predicate.
- Work reference blockers remain enforced by the owning transaction; no force or separate PackageVersion physical-delete action.
- Session/Project `.owned` cleanup additionally requires a successful current-instance creating receipt, same server boot, exact object ID and original creation revision. Creation receipts now record that revision. Changed objects use ordinary one-shot deletion with fresh review; old receipts lacking the creation revision cannot authorize owned cleanup.
- Memory node/relation deletion uses the existing loaded graph fingerprint/source-guarded write session and DESTRUCTIVE executor. No generic Memory mutation batch or arbitrary capability method dispatch.
- Work service uses the existing package write queue. Runtime identity declares `highRiskGuards:1`. Existing callers remain compatible.

### Package artifacts and install

- Instance-owned `.atria` handles capture only safe development artifact roots or a formal Studio build result. Bytes remain internal, at most four handles / 16 MiB each / 15-minute TTL; no filesystem or archive payload is exposed through model-selected generic writes. Studio build retains the ordinary 1 MiB HTTP response bound.
- Review produces a trusted, instance-owned receipt. Install independently requests approval, rereads preflight and requires the same review and base. Product install already rechecks baseVersion within the owning package write queue; reused unchanged. Wrong/expired handles, forged reviews, permission mismatch and base/preflight drift fail before effects.
- PackageVersion immutable semantics and existing product authorization/CSRF boundaries remain intact.

### Explicit Agent delegation

- `agent.delegation.inspect` / `agent.run.start` expose the bounded **delegated-node** mode: one explicitly selected node from a real Workspace preset, through existing `compileWorkspacePreset`, capability intersection, `AgentRegistry`, `AgentRuntime`, Native generation and Orchestrator durable checkpoint store. This does not implicitly execute the full preset graph.
- Envelope contains exact task/preset/node/scope, at most eight fixed Memory create/edit/relation-upsert/compact inputs, step/context/deadline limits. Each operation is usable once. Preset tools and node/product capabilities intersect with exact MCP Policy Ceiling and the parent trusted approval. No deletion, web, arbitrary extension tool, substituted tool arguments or nested Agent authority.
- Internal browser callback is instance/run-nonce/main-frame/document/boot bound. It accepts only an operation index; actual action/input comes from the approved envelope. Child uncertainty makes the parent indeterminate and is never automatically retried.
- Parent/child receipt IDs bind run/step/effect attribution. Evidence includes model calls, tool results, Memory effects, provider usage per call and cost when available; unavailable accounting is null. Automatic Memory recall is disabled. Existing durable checkpoints remain product-owned; no parallel execution/persistence engine.
- Bounds are 1–8 steps, 256–16000 context budget and 1–60 seconds. MCP request cancellation invokes live Runtime stop.

### CI, limits and next checkpoint

- Both final implementation HEADs pushed.
- Phase 5 adds narrowly scoped destructive flows, not every potential destructive action described directionally in the Plan. Library root deletion, arbitrary Agent tools/full-preset graph execution and blanket destructive leases are not exposed; the implemented flows retain owning safety boundaries.
- Existing shell captures and deterministic tests must not be upgraded to those claims.
- Discovered 165 routes; all 23 operation receipts succeeded. Source/Server EXACT; actual restart STALE; reload CURRENT. Final ignored evidence: `atria-mcp/.artifacts/atria-1790699829676/`. Owned runtime/browser/disposable data/config were cleaned. Source-change/different-checkout opt-ins were not repeated.
- Desktop 1440×1000 and narrow 390×844 captures remain shell evidence, not active Preview UI proof. The eight real browser Memory/Orchestrator/game READs remain idle/empty.
- Approved Plan v1.1 unchanged. Same Record/live HANDOFF refreshed with final integration evidence and the Phase 6 continuation prompt. Stopped before Phase 6.
