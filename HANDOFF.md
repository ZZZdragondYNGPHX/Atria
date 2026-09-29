# Live HANDOFF — Atria MCP Capability Expansion

Task ID: `plugin/atria-mcp-capability-expansion`
Primary Workspace: `plugin`
Status: **Phase 4 complete and pushed; stopped before Phase 5**
Plan: `plans/plugin/atria-mcp-capability-expansion.md`
Record: `records/plugin/atria-mcp-capability-expansion.md`

## Actual checkpoints

- Plugin / final real-integration-tested HEAD: `f420640d299ceb3fda48a9f49c85f2b4c0c6cc0e`, pushed.
- Product / final real-integration-tested HEAD: `feat/mcp-development-authority@da284bc51db1f10cfb82fe7444b2f1087a3a9a6e`, pushed, retained, not merged.
- Main: `c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`, unchanged.
- Docs pre-phase HEAD: `e8bf4dbae3b28dd1d0d150812138d2d5d7bd5c23`; fetch and use actual latest remote docs HEAD.
- Existing plugin/docs and isolated product worktrees reused. Original checkout untouched. No main-to-plugin merge or reference access.

## Completed and verified

Phases 1–4 complete. Registry: **136 actions = 105 READ / 25 MUTATE / 6 INTERACT / 0 DESTRUCTIVE**; exactly 18 public tools. Native authority remains preferred. Phase 3 read authority/high-level snapshot remains intact.

Phase 4 adds exact-action startup Policy Ceiling, trusted MCP form elicitation, server-minted instance/action/payload/target/boot-bound expiring leases, pre/post-approval guards, serialized execution and bounded ephemeral receipts. Missing client elicitation fails closed. Uncertain or partial effects produce indeterminate receipts with no automatic retry. Created-object ownership is server-stamped.

Fixed controlled actions cover Session/branch operations, detached generation, exact Work start, Build Workspace prepare/inspect/evaluate/apply, Preview/simulation, bounded Settings/runtime/config updates, immutable Library revisions and guarded loaded Memory mutations. Build apply consumes evidence from an instance-owned evaluation receipt and checks exact base/Workspace/operations/changes/Preview. Product additions extend existing boot middleware, generation scheduler, config persistence queue and Memory sessions; no parallel authority.

- Plugin full suite **37/37**; final affected authorization suite **8/8**. Full suite not rerun after the final extra test; do not claim 38/38.
- Product **6 suites / 91 tests**; targeted ESLint, 13-module plugin syntax/verifier syntax/diff checks passed.
- Final exact-HEAD disposable Atria + Edge integration passed: 165 routes, Source/Server EXACT, boot mismatch rejection, actual restart STALE/reload CURRENT, Studio Source Graph frontend.patch evaluation/restoration/apply/stale rejection, Session/Work/Settings/Library/Connection operations and preserved READ coverage.
- **14 successful operation receipts**. Trusted test client deterministically accepted MCP form elicitation; this does not prove human approval UX.
- Real browser Memory/Orchestrator/game evidence remains idle/empty. Populated Memory writes have product tests and real Edge fixture coverage, not populated real Atria end-to-end evidence.
- Final ignored evidence: `atria-mcp/.artifacts/atria-1790698052908/`. Disposable runtime/browser/temp data cleaned; shell desktop/narrow captures are not active Preview UI proof.
- Both final implementation HEADs: **0 check-runs / 0 statuses, combined pending**. No CI pass claimed.
- Live paid-provider generation/recall, populated real Memory, executing Agent, active Experience Epoch, rendered Workspace/evaluation/Preview and actual client approval UX remain later verification obligations. No full product suite or Android/device check.

## Next objective and frozen boundaries

Next: **Phase 5 only — High-risk Operations / Package / Agent Delegation**. Do not start Phase 6.

Implement approved narrow/one-shot DESTRUCTIVE authorization, machine-verifiable MCP-created-object cleanup, Package artifact handles and Preflight -> Review -> Install, owning Work/Project/Session/Library destructive flows without force bypass, delegated Agent capability envelopes and parent/child receipts with model/tool/Memory/token/cost evidence. Reuse Phase 4 authority rather than rebuilding it. Phase 5 cannot advance while privilege-escalation or Package destructive-boundary tests fail.

Keep exactly 18 tools and canonical `serverBootId`; no runtimeBootId, legacy aliases/confirm/allow-writes, arbitrary JS/capability dispatch or generic writes via `atri_api`. Source/Server/Browser and Experience/Project/Workspace/Preview remain independent. Last-observed is not current exact. Reuse Native Frontend v3/Studio formal Source Graph, diagnostics, frontend.patch, evaluation, Preview and Experience Epoch. Build is the semantic namespace; Frontend Host Bridge is not MCP Browser Capability Bridge. Committed Conversation/Timeline is immutable; GenerationProjection is ephemeral.

Fetch refs/dirty state first. Read current plugin AGENTS, full docs README, this HANDOFF, Plan and same Record. Do not repeat Phases 1–4 or merge product feature early. Refresh this same Record/HANDOFF only while the slot belongs to this task. Complete Phase 5 verification, commit/push and actual CI reporting; then provide Phase 6 prompt and stop.

## Copyable new-conversation prompt

```text
继续 ZZZdragondYNGPHX/Atria 的 Atria MCP Capability Expansion。
Task ID: plugin/atria-mcp-capability-expansion
Primary Workspace: plugin
Approved Plan: docs:plans/plugin/atria-mcp-capability-expansion.md
Status: Approved Implementation Plan v1.1 — Post-Frontend-Refactor Revalidated

Phase 4 已完成并推送；当前只执行 Phase 5 — High-risk Operations / Package / Agent Delegation，不开始 Phase 6。
先 fetch 并核对真实远端 refs 与 dirty state：
plugin@f420640d299ceb3fda48a9f49c85f2b4c0c6cc0e
feat/mcp-development-authority@da284bc51db1f10cfb82fe7444b2f1087a3a9a6e
main@c936b0aa4c42cf5711f40ae4a00f5fc3432813dc
docs 使用真实最新 HEAD。

读取最新 plugin:AGENTS.md、docs:README.md、docs:HANDOFF.md、上述 Plan 与 docs:records/plugin/atria-mcp-capability-expansion.md。
沿用同一 Record/live HANDOFF；若 live slot 属于其它任务不得覆盖。复用现有 plugin/docs 与独立产品工作树，不将 main merge 到 plugin，不提前合并产品 feature。

Phases 1–4 已有 136 actions（105 READ / 25 MUTATE / 6 INTERACT）、trusted MCP form elicitation、exact Policy Ceiling、server-minted Lease、Receipt、审批前后 guards 与固定安全写适配器。优先 Native authority，复用现有实现，不重做。
按 Plan 实现 Phase 5 的 narrow/one-shot destructive authorization、MCP-created cleanup ownership、Package artifact handles + Preflight/Review/Install、正式 destructive flows、Agent capability envelopes/parent-child receipts/evidence。禁止 force bypass 或权限升级。

严格保留 18 public tools、canonical serverBootId；禁止 runtimeBootId、legacy aliases/confirm/allow-writes、任意 JS/capability dispatch；atri_api 仍为 Native GET-only。
Source/Server/Browser 与 Experience/Project/Workspace/Preview 独立，last-observed 不冒充 current exact。复用正式 Native Frontend v3/Studio authorities；Build 为语义命名空间；Frontend Host Bridge 不等于 MCP Browser Capability Bridge。
Committed Conversation/Timeline 不可变，GenerationProjection 为 ephemeral presentation。

Phase 4 实际验证：Plugin full 37/37、最终 affected 8/8；产品 6 suites/91 tests；语法/ESLint/diff；最终两 HEAD 的 disposable Atria+Edge 集成通过，有 14 条成功操作回执。
审批采用 deterministic trusted test-client，不是实际客户端人工审批 UX。Memory/Orchestrator 真产品 browser 证据仅 idle/empty；populated Memory mutation 仅产品测试+真实浏览器 fixture。付费 provider、执行中 Agent、active Epoch、Workspace/evaluation/Preview UI 仍未真体验证。
两实施 HEAD 均无 check-runs/statuses，不能声称 CI 通过。

Phase 5 完成后按 Governance 验证、commit/push、记录真实 HEAD/baseline/CI，更新同一 Record/HANDOFF，给 Phase 6 接手提示词并停止。
```
