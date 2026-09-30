# Atria MCP Capability Expansion — Implementation & Change Control

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 19. Implementation phase plan

This remains a formal six-stage Plugin task with `plugin` as the Primary Workspace.

The 2026-09-29 revalidation does **not** add another phase. It reduces Phase 2 product work and moves Native Frontend v3 adaptation into the existing read/mutation/integration phases.

Atria product changes are made only where a product-owned authority is genuinely missing. Product implementation uses one temporary `main`-derived feature branch across all product phases that actually require product changes.

The Plugin workspace remains isolated; `main` is never merged into `plugin`. Integration uses an independent product worktree/runtime.

### Phase 1 — MCP Kernel / Repository Observation

**Primary implementation:** `plugin:atria-mcp/`

Goals:

- introduce the Semantic Action Registry kernel;
- introduce four risk executors as inactive/read-only-safe infrastructure;
- introduce Policy Ceiling representation;
- introduce ephemeral Receipt Store infrastructure;
- implement repository-wide tree/read/search;
- implement read-only Git status/diff/log/show/blame evidence;
- implement safe untracked development-file visibility;
- implement bounded development-artifact discovery/read/inspect;
- implement independent RepositoryAccessPolicy and sensitive-path/content filtering.

No real product mutation is enabled. No `main` product change is required.

User-visible outcome: AI can understand the complete Atria development checkout, current working-tree changes and development artifacts rather than only selected source folders.

### Phase 2 — Runtime Provenance / Fixed Capability Adapters

**Implementation:** `plugin:atria-mcp/` plus the product temporary feature branch only for the remaining runtime-identity gap.

This phase is materially smaller than in v1.0.

Product-side goals:

- reuse the existing per-process `serverBootId`; do not invent a parallel `runtimeBootId`;
- expose a direct current runtime identity through the existing version/diagnostics authority;
- bind `serverBootId`, process start, app version, full revision/branch and startup source fingerprint/uncertainty;
- add no new Native Frontend/Studio capability that current `main` already provides.

Plugin-side goals:

- compare configured Product Source with Server Runtime;
- capture Browser-loaded `serverBootId` and detect stale pages after restart;
- implement exact/mismatch/unverifiable states;
- represent Native Frontend Experience Epoch as a separate scoped freshness identity;
- represent Studio Project/Workspace/Preview provenance separately from product checkout provenance;
- implement a fixed schema-validated Browser Capability Bridge only for approved Memory/Orchestrator/selected game-runtime methods with no stronger server authority;
- prohibit arbitrary JavaScript evaluation/dynamic capability dispatch.

User-visible outcome: MCP can prove which product source/server/browser generation it is observing and can also bind frontend/Preview evidence to the exact Session or authoring artifact that produced it.

### Phase 3 — Full Read Authority

**Primary implementation:** `plugin:atria-mcp/`

Goals:

- populate READ semantic actions for Chat/Session;
- Build/Studio, including Frontend Source Graph, diagnostics and Preview identity;
- Library;
- Package/Work;
- Memory;
- Agents;
- Settings;
- Connections/Models/Routes;
- Diagnostics;
- selected game-runtime read projections;
- add the high-level diagnostic snapshot;
- preserve product auth/admin/ownership boundaries;
- keep Secrets opaque;
- prefer stable server authorities over the Browser Capability Bridge whenever both exist.

No persistent product mutation is enabled yet.

User-visible outcome: MCP can inspect nearly every Atria development/product state relevant to diagnosing a bug, including current Native Frontend v3 authoring/runtime evidence, without bypassing product authority.

### Phase 4 — Authorization / Receipts / Safe Mutations

**Implementation:** `plugin:atria-mcp/` plus targeted product authority additions only if a real gap is demonstrated.

Goals:

- implement Policy Ceiling enforcement;
- implement trusted user approval integration;
- implement server-minted Capability Leases;
- implement unified Operation Receipts;
- implement double guard/preflight/concurrency validation;
- retire model-supplied `confirm=true`;
- enable non-destructive INTERACT/MUTATE actions for approved Chat, Build, Settings, Runtime configuration, Library revision, Work start, Memory and Preview/Simulation operations;
- support Native Frontend v3 `frontend.patch` through normal Studio Workspace semantics;
- bind Build evaluation receipts to exact Project/Workspace/change/Preview evidence;
- preserve Experience Epoch and Session revision guards for frontend-scoped actions.

User-visible outcome: after explicit authorization, AI can reproduce, operate and verify real Atria behavior without a second frontend or persistence authority.

### Phase 5 — High-risk Operations / Package / Agent Delegation

**Implementation:** `plugin:atria-mcp/` plus targeted product authority changes only where current authorities are insufficient.

Goals:

- enable DESTRUCTIVE semantic actions with one-shot/narrow cleanup authorization;
- implement machine-verifiable MCP-created-object cleanup scopes;
- implement Package artifact handles and Preflight -> Review -> Install;
- implement Work/Project/Session/Library destructive flows without force bypass;
- implement delegated Agent capability envelopes;
- bind Agent semantic mutations to parent/child receipts;
- surface model/tool/Memory/token/cost evidence for Agent runs.

User-visible outcome: high-risk product workflows become available without weakening the earlier authority/approval model.

### Phase 6 — Integration / Security / Native Frontend v3 Verification

No new capability scope is added in this phase.

Goals include adversarial verification of:

- stale approvals and state races;
- revision/baseVersion conflicts;
- server restart and stale-browser detection using `serverBootId`;
- tracked/untracked product source identity;
- Native Frontend Experience Epoch revocation;
- Project baseRevision / Workspace / Preview provenance drift;
- Frontend Source Graph/diagnostic/semantic-patch flows;
- formal Preview using the production compiler/renderer contract;
- GenerationProjection versus committed Conversation separation;
- Script/Media/Frontend diagnostics and recovery evidence where exposed;
- Secret/path/history leakage;
- Package update races;
- destructive reference blockers;
- delegated Agent privilege escalation;
- receipt/cleanup ownership;
- browser semantic-action bypass attempts.

Run real Atria integration against disposable development data with the configured product worktree/runtime and real browser evidence, including representative desktop/narrow viewport flows and Native Frontend v3 Studio Preview.

Only after any product-side changes are fully verified should the product feature branch merge into `main`. Plugin integration is then revalidated against the final integrated `main`.

### Multi-stage documentation lifecycle

When implementation begins:

- create and continuously update `docs:records/plugin/atria-mcp-capability-expansion.md`;
- create/refresh the single live `docs:HANDOFF.md` for this task;
- keep the same Plugin Primary Workspace and same product temporary branch through phases that require it;
- after each formal phase: verify, persist/push, update Record/HANDOFF, provide the next-phase handoff prompt, and stop;
- final completion cleans the live HANDOFF after all verification/integration work is complete.

## 20. Migration to MCP v0.2.0 surface

The existing 0.1.0 MCP surface is replaced through a deliberate breaking migration rather than carrying long-lived legacy tool aliases.

### 20.1 Breaking cutover

The public MCP tool surface should cut directly to the consolidated architecture.

Do not keep deprecated public aliases for the old per-function tool names merely for compatibility.

Internal implementation helpers may be reused during migration, but `listTools()` should expose only the current supported surface for that phase/version.

### 20.2 Target fixed tool surface

The accepted target is 18 top-level MCP tools:

1. `atri_status`
2. `atri_capabilities`
3. `atri_reference`
4. `atri_repo`
5. `atri_git`
6. `atri_artifact`
7. `atri_api`
8. `atri_diagnose_snapshot`
9. `atri_browser_open`
10. `atri_browser_observe`
11. `atri_browser_screenshot`
12. `atri_browser_interact`
13. `atri_browser_diagnostics`
14. `atri_browser_close`
15. `atri_read`
16. `atri_interact`
17. `atri_mutate`
18. `atri_destructive`

The exact operation enums/schemas within the grouped tools remain implementation detail governed by the frozen domain design and Action Registry.

### 20.3 Legacy mapping

Public legacy mappings are documented rather than kept as callable aliases.

Examples:

- `atri_source_read/search` -> `atri_repo`;
- `atri_api_list/detail` -> `atri_api`;
- Native GET reads -> `atri_api` or semantic `atri_read`;
- Native writes -> semantic risk executors;
- `atri_browser_resize/wait/snapshot` -> `atri_browser_observe`;
- `confirm=true` -> removed in favor of trusted approval/Lease;
- `--allow-writes` -> removed in favor of Policy Ceiling + approval/Lease.

### 20.4 Generic Native API becomes read-oriented

The consolidated `atri_api` remains a Native discovery/detail/read observation tool.

It is not a general POST/PUT/PATCH/DELETE escape hatch.

Important product mutations must execute through registered semantic actions and the matching risk executor.

### 20.5 Browser consolidation

Browser lifecycle remains explicit.

`atri_browser_observe` groups compatible observation operations such as:

- snapshot;
- wait;
- resize.

Navigation/open, screenshot image output, interaction, diagnostics and close remain separate because they have meaningfully different lifecycles/output types.

Browser interaction remains subject to capability policy and cannot bypass a known semantic product action's stronger authorization.

### 20.6 Remove model-supplied confirmation

The v0.2.0 input schemas should not include legacy `confirm` fields.

Unexpected legacy confirmation parameters should fail normal schema validation rather than being silently ignored.

The old `requireWrite(config, confirmed)` model should be retired.

### 20.7 Replace `--allow-writes`

The old `--allow-writes` / `ATRIA_ALLOW_WRITES` switch is removed from the final v0.2.0 design.

The preferred operator policy experience is intentionally simple:

- default/read-only policy;
- development policy that makes approved INTERACT/MUTATE/DESTRUCTIVE actions eligible for user approval but does not auto-grant them;
- optional explicit custom policy file/profile for tighter or specialized deployments.

A development policy is an approval ceiling, not a blanket write grant.

### 20.8 Versioning

The redesigned protocol/tool surface should advance the Plugin package from `0.1.0` to `0.2.0`.

The version change communicates the deliberate breaking MCP API redesign while the tool remains pre-1.0/private development infrastructure.

### 20.9 Prompt/docs/examples migration

The migration must update in the same implementation lifecycle:

- README tool tables and examples;
- Claude/Codex example configuration where needed;
- `atria_verify_change` prompt;
- Guide/resource descriptions;
- all tests and helper fixtures referring to old tool names or legacy write confirmation.

The new verification prompt should require Source ↔ Runtime ↔ Browser identity to be established before claiming a current source change was runtime/UI verified.

### 20.10 Tool-count architecture lock

Tests should enforce the intended compact tool surface.

The target v0.2.0 contract should assert the 18 registered top-level tools and reject accidental proliferation of per-domain public tools such as `atri_chat_*`, `atri_build_*` or `atri_memory_*` unless a later approved Plan explicitly changes the public surface.

Semantic domain growth belongs in the Action Registry by default, not in new top-level MCP tool registrations.

## 22. Implementation kickoff state

Post-Frontend-Refactor revalidation is complete and this document is frozen as **Approved Implementation Plan v1.1**.

Implementation has **not** started.

Revalidated source checkpoints:

- `main@c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`;
- `plugin@c125b2e7b63ed035a0a253c4036cbdb6bd273225`;
- pre-update docs baseline `docs@d540d35b74f5f3cbcc8eee1ea0565e8164b6ff7f`.

Recorded hashes are checkpoints only; implementation must re-check remote refs.

Reserved implementation-history path:

- `docs:records/plugin/atria-mcp-capability-expansion.md`.

The Record is created when Phase 1 implementation actually begins, not retroactively during this design-only revalidation.

At revalidation time there is **no live `docs:HANDOFF.md`**. Phase 1 should re-check this before creating the task's live HANDOFF; if another task has acquired the slot by then, it must not be overwritten.

Primary implementation workspace:

- long-lived `plugin` workspace;
- implementation root: `plugin:atria-mcp/`.

Product-side temporary branch, if still required when Phase 2 reaches the remaining runtime-identity gap:

- `feat/mcp-development-authority`.

Do not create that product branch during Phase 1. Phase 1 remains Plugin-only.

Phase 2 should first verify that the current-runtime identity gap still exists at its then-current `main`; if current product authority has filled it by then, do not create product code merely to match this historical checkpoint.

## 23. Diagnostic workflow target

A successful end-state workflow should allow an AI to move through evidence such as:

`repository/Git change -> impacted source/contracts -> Native API/product state -> real browser/runtime -> screenshot/diagnostics -> source root cause`

For Build/Studio issues the equivalent path should support:

`project -> source/revision/history -> runtime/preview -> browser evidence -> product/source diagnosis`

For chat/generation issues it should support:

`Session/message state -> relevant runtime/config -> authorized test message -> generation/UI result -> diagnostics -> source diagnosis -> authorized cleanup when requested`

## 25. Post-revalidation frozen decisions

The 2026-09-29 audit freezes these clarifications:

- the six implementation phases are retained; no seventh migration/adaptation phase is added;
- Phase 2 is reduced because `serverBootId`, Native Frontend v3 Host Bridge, Studio Frontend inspection/evaluation/Preview, Experience Epoch and frontend diagnostics already exist;
- `serverBootId` is the canonical product process-boot identity; MCP does not require a duplicate `runtimeBootId` field;
- one minimal product runtime-identity addition remains planned unless the then-current product has already supplied direct startup source fingerprint/full revision binding;
- the MCP Browser Capability Bridge is limited to explicitly allowlisted first-party browser capability APIs without a stronger server authority;
- Native Frontend v3 Frontend Host Bridge is a distinct product protocol and is not treated as the MCP Browser Capability Bridge;
- Build remains the semantic action namespace while Native Studio remains the owning authority;
- Native Frontend Source Graph/diagnostics/`frontend.patch`/evaluation/Preview are reused directly rather than reimplemented for MCP;
- committed Conversation/Timeline remains immutable; GenerationProjection remains ephemeral and separate;
- the public v0.2.0 surface remains exactly 18 top-level MCP tools;
- Action Descriptor / Policy Ceiling / Capability Lease / Operation Receipt remain the authorization architecture;
- Studio evaluation receipts are MCP receipts that bind existing exact Studio evidence; a duplicate durable product receipt subsystem is not required;
- implementation details such as internal policy-file serialization, client-specific elicitation UX and artifact root tables may be resolved during their owning phase without reopening these architectural boundaries.

Any later material change to these decisions requires another explicit Plan update.

## 26. Discussion / change-control workflow

During the design discussion phase:

1. each round begins by updating this Plan with the conclusions accepted in the previous round;
2. only then does the next design topic begin;
3. the Plan records design intent and boundaries, not implementation history;
4. implementation and permanent verification history will use `records/plugin/**` once implementation starts;
5. the `plugin` implementation remains unchanged until the design is sufficiently frozen or the user explicitly starts implementation.

## Appendix A — Phase 1 implementation kickoff prompt

The following prompt is the post-revalidation draft for starting Phase 1 in a fresh implementation conversation/client. Re-check all remote refs before acting; recorded hashes are checkpoints, not authority.

```text
继续 ZZZdragondYNGPHX/Atria 的 Atria MCP Capability Expansion。

Task ID：
plugin/atria-mcp-capability-expansion

Primary Workspace：
plugin

Approved Plan：
docs:plans/plugin/atria-mcp-capability-expansion.md
Status：Approved Implementation Plan v1.1 — Post-Frontend-Refactor Revalidated

审计完成时 checkpoint（开始前必须重新核对真实远端 refs）：
main@c936b0aa4c42cf5711f40ae4a00f5fc3432813dc
plugin@c125b2e7b63ed035a0a253c4036cbdb6bd273225

当前只执行：
Phase 1 — MCP Kernel / Repository Observation

不要开始 Phase 2。
不要修改 Atria main 产品源码。
不要创建 feat/mcp-development-authority。
不要提前实现 Native Frontend v3 / Runtime Provenance / Browser Capability Bridge。
不要把 main merge 到 plugin。

开始前：
1. fetch / 核对真实远端 main、plugin、docs HEAD；
2. 读取最新 plugin:AGENTS.md；
3. 读取最新 docs:README.md；
4. 读取最新 docs:plans/plugin/atria-mcp-capability-expansion.md；
5. 检查 docs:HANDOFF.md：
   - 若不存在，按 Governance 为本多阶段任务创建 live HANDOFF；
   - 若已属于其他活跃任务，不得覆盖、替换或删除，记录该治理阻塞并只完成当前可完成工作；
6. Phase 1 真正开始实现时创建并持续更新：
   docs:records/plugin/atria-mcp-capability-expansion.md

已完成的前置审计结论必须保留：
- Native Frontend Runtime v3 已进入 main，不要为 MCP 重建第二套 Frontend/Studio authority；
- 产品已有 canonical serverBootId；
- Phase 2 只剩“直接 current runtime identity + startup source fingerprint/full revision binding”等必要缺口，且必须到 Phase 2 再按当时 main 复核；
- Frontend Host Bridge 与 MCP Browser Capability Bridge 是不同层；
- Browser Capability Bridge 后续只用于没有更强 server authority 的 allowlisted Memory / Orchestrator / selected game-runtime browser APIs；
- Build 继续作为 semantic action namespace，Native Studio 是 owning authority；
- v0.2.0 顶层 MCP surface 仍固定为 18 tools。

Phase 1 只做 Plugin：
plugin:atria-mcp/

Phase 1 目标：
- Semantic Action Registry kernel；
- 四级 risk executor 基础骨架，但本阶段不开放真实产品 mutation；
- Policy Ceiling 表示；
- ephemeral Receipt Store 基础设施；
- repository-wide tree/read/search；
- Git status/diff/log/show/blame 只读证据；
- safe non-ignored untracked development file 可读；
- bounded development artifact list/read/search/image/inspect；
- 独立 RepositoryAccessPolicy；
- Sensitive path/content policy；
- 保持 Secret、用户数据、dataRoot、symlink/traversal 边界。

v0.2.0 最终公开工具面冻结为 18 个：
atri_status
atri_capabilities
atri_reference
atri_repo
atri_git
atri_artifact
atri_api
atri_diagnose_snapshot
atri_browser_open
atri_browser_observe
atri_browser_screenshot
atri_browser_interact
atri_browser_diagnostics
atri_browser_close
atri_read
atri_interact
atri_mutate
atri_destructive

Phase 1 可以按阶段迁移内部实现，但不得私自增加 per-domain 顶层 MCP tools。

Breaking cutover 约束：
- 不长期保留 atri_source_read / atri_source_search 等 legacy aliases；
- confirm=true 最终删除；
- --allow-writes / ATRIA_ALLOW_WRITES 最终删除；
- atri_api 最终只做 Native discovery/detail/read，不可成为产品写入逃生通道；
- Phase 1 不提前实现 Phase 4 的可信审批/Lease mutation 行为。

Phase 1 验证至少覆盖：
- exact 18-tool registration architecture 可以逐步落位但不得出现意外 per-domain public tools；
- tracked repository tree/read/search；
- safe untracked file read；
- Git status/diff/log/show/blame；
- bounded artifact policy；
- sensitive path/content denial + redaction；
- traversal/symlink escape denial；
- product/user data 与 repository evidence 边界；
- legacy source-tool migration相关测试；
- Plugin 自身 lint/test/type/schema checks（按仓库实际提供的脚本执行）。

Phase 1 完成后：
- commit/push plugin；
- 更新同一份 docs Record；
- 更新本任务 live HANDOFF；
- 记录 plugin HEAD、main baseline、实际验证/CI；
- 给出 Phase 2 接手提示词；
- 停止，不自动开始 Phase 2。

不要声称未实际执行的测试、构建、CI、浏览器或 UI 验证通过。
```
