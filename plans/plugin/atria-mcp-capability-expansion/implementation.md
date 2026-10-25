# Atria MCP Capability Expansion — Implementation & Change Control

> 执行规则入口：[Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 19. Implementation phase plan

This remains a formal six-stage Plugin task with `plugin` as the Primary Workspace.

 It reduces Phase 2 product work and moves Native Frontend v3 adaptation into the existing read/mutation/integration phases.

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
- represent Native Frontend Experience Epoch as a separate scoped freshness identity;
- represent Studio Project/Workspace/Preview provenance separately from product checkout provenance;
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
- retire model-supplied `confirm=true`;
- enable non-destructive INTERACT/MUTATE actions for approved Chat, Build, Settings, Runtime configuration, Library revision, Work start, Memory and Preview/Simulation operations;
- support Native Frontend v3 `frontend.patch` through normal Studio Workspace semantics;
- bind Build evaluation receipts to exact Project/Workspace/change/Preview evidence;

### Phase 5 — High-risk Operations / Package / Agent Delegation

**Implementation:** `plugin:atria-mcp/` plus targeted product authority changes only where current authorities are insufficient.

Goals:

- enable DESTRUCTIVE semantic actions with one-shot/narrow cleanup authorization;
- implement Package artifact handles and Preflight -> Review -> Install;
- implement Work/Project/Session/Library destructive flows without force bypass;
- implement delegated Agent capability envelopes;
- bind Agent semantic mutations to parent/child receipts;
- surface model/tool/Memory/token/cost evidence for Agent runs.

User-visible outcome: high-risk product workflows become available without weakening the earlier authority/approval model.

### Multi-stage documentation lifecycle

When implementation begins:

- create and continuously update `docs:records/plugin/atria-mcp-capability-expansion.md`;
- create/refresh the single live `docs:HANDOFF.md` for this task;
- keep the same Plugin Primary Workspace and same product temporary branch through phases that require it;

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
- Guide/resource descriptions;
- all tests and helper fixtures referring to old tool names or legacy write confirmation.

### 20.10 Tool-count architecture lock

Tests should enforce the intended compact tool surface.

Semantic domain growth belongs in the Action Registry by default, not in new top-level MCP tool registrations.

## 22. Implementation kickoff state

Implementation has **not** started.

- `main@c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`;
- `plugin@c125b2e7b63ed035a0a253c4036cbdb6bd273225`;
- pre-update docs baseline `docs@d540d35b74f5f3cbcc8eee1ea0565e8164b6ff7f`.

Reserved implementation-history path:

- `docs:records/plugin/atria-mcp-capability-expansion.md`.

Primary implementation workspace:

- long-lived `plugin` workspace;
- implementation root: `plugin:atria-mcp/`.

Product-side temporary branch, if still required when Phase 2 reaches the remaining runtime-identity gap:

- `feat/mcp-development-authority`.

Do not create that product branch during Phase 1. Phase 1 remains Plugin-only.

## 23. Diagnostic workflow target

A successful end-state workflow should allow an AI to move through evidence such as:

`repository/Git change -> impacted source/contracts -> Native API/product state -> real browser/runtime -> screenshot/diagnostics -> source root cause`

For Build/Studio issues the equivalent path should support:

`project -> source/revision/history -> runtime/preview -> browser evidence -> product/source diagnosis`

For chat/generation issues it should support:

`Session/message state -> relevant runtime/config -> authorized test message -> generation/UI result -> diagnostics -> source diagnosis -> authorized cleanup when requested`

## 26. Discussion / change-control workflow

During the design discussion phase:

1. each round begins by updating this Plan with the conclusions accepted in the previous round;
2. only then does the next design topic begin;
3. the Plan records design intent and boundaries, not implementation history;
5. the `plugin` implementation remains unchanged until the design is sufficiently frozen or the user explicitly starts implementation.
