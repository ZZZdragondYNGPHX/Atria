# Live HANDOFF — Atria MCP Capability Expansion

Task ID: `plugin/atria-mcp-capability-expansion`
Primary Workspace: `plugin`
Status: **Phase 2 complete and pushed; stopped before Phase 3**
Plan: `plans/plugin/atria-mcp-capability-expansion.md`
Record: `records/plugin/atria-mcp-capability-expansion.md`

## Actual checkpoints

- Plugin / tested HEAD: `plugin@038f061223684c9e36ad3340dd08d8a295d625bf` (pushed).
- Auxiliary product branch / tested HEAD: `feat/mcp-development-authority@46d717dd177d2825d420ab21d53f13968f645afe` (pushed, retained, not merged).
- Main baseline: `main@c936b0aa4c42cf5711f40ae4a00f5fc3432813dc` (unchanged).
- Docs pre-phase baseline: `5a3c2204b55187ca0f2e04d973eb89f5981006eb`; use actual latest remote docs HEAD on resume.
- Clean existing plugin/docs worktrees reused. Product feature created only after then-current main revalidation confirmed missing direct startup-source-bound runtime identity. No main-to-plugin merge; caller's original product checkout unchanged.

## Completed and verified

Phase 1 remains complete. Phase 2 adds the minimal product diagnostics runtime identity and document boot header, independent plugin source fingerprint protocol, Source/Server comparison, page restart/reload freshness and separate last-observed Experience/Project/Workspace/Preview evidence. Three fixed internal browser adapters exist with schemas, literal dispatch, availability and output filtering; Registry READ population belongs to Phase 3.

- Plugin final HEAD: `npm test` **24/24**, syntax checks, verifier syntax, Git diff checks passed.
- Product: **4 targeted Jest suites / 17 tests**, targeted ESLint and diff checks passed.
- Real disposable Atria + Edge integration at the exact plugin/product HEADs passed: EXACT/CURRENT, tracked source changed after startup, different revision checkout, actual restart with stale page, reload restoring CURRENT. Desktop/mobile screenshots captured; desktop shell/onboarding visually inspected. Source changes restored; owned runtime and temporary data cleaned up.
- Product frontend startup build succeeded after isolated dependency installation repaired missing QuickJS packages. Earlier broken-bundle run is not UI-pass evidence. SPA history false invalidation and transient empty frame URL were fixed and regression-tested.
- GitHub queried at both implementation HEADs: zero check-runs and zero commit statuses; combined pending. **No remote CI pass claimed.** No PR or broad manual CI created this phase.

## Remaining work and frozen boundaries

- **Phase 3 only next:** Full READ semantic actions for Chat/Session, Build/Studio, Library, Package/Work, Memory, Agents, Settings, Connections/Models/Routes, Diagnostics and selected browser-owned runtime projections; high-level diagnostic snapshot and actual READ integration. Do not start Phase 4.
- Registry is intentionally empty at this checkpoint. Internal adapters `memory.schema.scope`, `agents.presets.list`, `game.loaded.identity` are infrastructure, not a generic dispatch tool. Register through the existing exact-risk executor/ceiling; prefer stronger server authority.
- Canonical `serverBootId` only. Startup identity is immutable; status must not recompute it or silently refresh browser-loaded boot identity.
- Keep Source/Server/Browser and Experience/Project/Workspace/Preview separate. Scoped evidence is last-observed, not a current freshness assertion. Missing authoring identities remain unknown. Source EXACT does not prove dependencies/config/user data identity or active Preview correctness.
- Native Frontend v3 / Studio own Source Graph, diagnostics, frontend.patch, evaluation, Preview and Experience Epoch. Build remains the semantic namespace. Frontend Host Bridge and MCP Browser Capability Bridge are distinct.
- Exactly 18 public tools. No legacy aliases, confirm, allow-writes or arbitrary JS/capability dispatch. `atri_api` remains discovered Native GET-only. No trusted approval/Lease or product mutation implemented.
- Committed Conversation/Timeline is immutable; GenerationProjection is ephemeral presentation.
- Real active Session Epoch invalidation, Studio Workspace/evaluation/Preview, Memory/Orchestrator scenarios are not yet verified. These currently have scoped fixture/unit or adapter tests, not real product-flow evidence. No Android or full product-suite pass claimed.
- Reuse the retained product branch/worktree; do not merge it into main until the Plan's integration stage. Do not merge main into plugin.

## Resume requirements

Fetch main/plugin/docs/product-feature refs and inspect dirty state. Read latest plugin AGENTS, complete docs README, this HANDOFF, approved Plan and the same Record. Reuse suitable worktrees and preserve unrelated changes. HANDOFF belongs to this task; never overwrite it if another task has acquired the live slot. Do not repeat Phases 1/2 or reopen frozen design.

## Copyable new-conversation prompt

```text
继续 ZZZdragondYNGPHX/Atria 的 Atria MCP Capability Expansion。
Task ID: plugin/atria-mcp-capability-expansion
Primary Workspace: plugin
Approved Plan: docs:plans/plugin/atria-mcp-capability-expansion.md
Status: Approved Implementation Plan v1.1 — Post-Frontend-Refactor Revalidated

Phase 2 已完成并推送；当前只执行 Phase 3 — Full Read Authority，不开始 Phase 4。
必须先 fetch 并核对真实远端 refs 与 dirty state：
plugin@038f061223684c9e36ad3340dd08d8a295d625bf
feat/mcp-development-authority@46d717dd177d2825d420ab21d53f13968f645afe
main@c936b0aa4c42cf5711f40ae4a00f5fc3432813dc
docs 使用真实最新 HEAD。

读取最新 plugin:AGENTS.md、docs:README.md、docs:HANDOFF.md、上述 Plan 与 docs:records/plugin/atria-mcp-capability-expansion.md。沿用同一 Record/live HANDOFF；若 HANDOFF 已属于其它活跃任务，不得覆盖。

复用现有 plugin/docs 与独立产品工作树。feat/mcp-development-authority 已有必要的只读 current runtime identity/startup fingerprint/full revision binding，保留且未合并；不要新建重复产品 authority，不将 main merge 到 plugin。

Phase 3 实现 Plan 的完整 READ semantic catalog 和 high-level diagnostic snapshot，优先现有 Native server authority；只有没有更强 server authority 的 allowlisted Memory/Orchestrator/selected game-runtime 浏览器 APIs 才使用固定 bridge。现有三个内部 adapters 尚未注册公共 READ actions。

保留 canonical serverBootId，禁止 runtimeBootId。Source/Server/Browser 与 Experience/Project/Workspace/Preview provenance 独立；last-observed scoped evidence 不能冒充当前 exact 验证。
复用 Native Frontend v3/Studio 正式 authority，Build 保持语义命名空间。不重建 Source Graph、diagnostics、frontend.patch、evaluation、Preview、Experience Epoch。Frontend Host Bridge 不等于 MCP Browser Capability Bridge。
Committed Conversation/Timeline 不可变；GenerationProjection 是 ephemeral presentation。
公开 MCP surface 严格 18 tools；不恢复 legacy aliases/confirm/allow-writes；atri_api 只允许 Native GET，不允许任意 JS/capability dispatch；不提前实现 Phase 4 approval/Lease/mutation。

Phase 2 验证：Plugin 24/24；产品定向 4 suites/17 tests；语法/ESLint/Git diff；真实 disposable Atria+Edge 的 source/server/browser EXACT、源码变化、不同 revision、重启 stale、reload current 均通过。真实 active Session Epoch、Studio Preview/Workspace、Memory/Orchestrator 场景未验证。两实施 HEAD 均无 check-run/status，不能声称 CI 通过。

Phase 3 完成后按 Governance 验证、commit/push，更新同一 Record/HANDOFF，记录实际 HEAD/baseline/验证与 CI，提供 Phase 4 接手提示词并停止。
```
