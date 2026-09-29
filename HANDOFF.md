# Live HANDOFF — Atria MCP Capability Expansion

Task ID: `plugin/atria-mcp-capability-expansion`
Primary Workspace: `plugin`
Status: **Phase 5 complete and pushed; stopped before Phase 6**
Plan: `plans/plugin/atria-mcp-capability-expansion.md`
Record: `records/plugin/atria-mcp-capability-expansion.md`

## Actual checkpoints

- Plugin / final exact-HEAD integration: `1dfcc35f673f3b4db031355ab061558ca9c1569a`, pushed.
- Product / final exact-HEAD integration: `feat/mcp-development-authority@b2709b5af2664b05f6bd32a05a06097a3e98bd6f`, pushed, retained, not merged.
- Main: `c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`, unchanged.
- Docs pre-phase HEAD: `5dd13e2d1a9e6f657fe6b0b05f098ae37b4a1780`; fetch and use actual latest docs HEAD.
- Reused existing plugin/docs/product worktrees. Original checkout untouched. No main-to-plugin merge or reference access.

## Completed and verified

Phases 1–5 complete. Registry: **152 actions = 109 READ / 27 MUTATE / 8 INTERACT / 8 DESTRUCTIVE**; exactly 18 public tools. Native authority remains preferred. Phase 4 policy/elicitation/lease/receipt and safe mutations remain intact.

Phase 5 adds one-use destructive approval; exact Session/Project/Work/Library revision deletion; guarded Memory node/relation deletion; Session/Project `.owned` cleanup requiring current-instance successful creation receipt, same boot, exact ID and original creation revision. Modified objects require fresh ordinary one-shot deletion. No force bypass, broader destructive lease, Library root delete or PackageVersion physical delete surface.

Package flow: safe artifact capture or Studio build -> inspect -> preflight -> trusted review receipt -> separately approved install. Exact bytes/hash/version/base/grants/preflight binding, 4 handles / 16 MiB each / 15 minutes. Bytes remain internal. Normal Studio HTTP build response bound remains 1 MiB. Product base-version install guard is reused.

Explicit `agent.run.start` supports **delegated-node**, one selected real preset node through existing AgentRuntime and durable checkpoints. Up to eight exact Memory create/edit/relation-upsert/compact operations, once each; Preset ∩ Product ∩ MCP ceiling/parent approval. No destructive/web/arbitrary extension tool/nested Agent delegation or automatic Memory recall. Child actions re-enter the existing risk executor and link run/step/effect receipts to the parent; uncertainty propagates. Step/context/deadline bounds and request cancellation are implemented; these are not a monetary-spend cap. Provider usage/cost are reported when available, otherwise null.

Product changes are limited to transaction-level optional Session/Work delete conflict checks, existing package write queue, `highRiskGuards:1` and the attenuated Orchestrator port adapter. No new compiler/frontend/persistence authority.

- Plugin full suite **43/43**, zero skips; final affected high-risk suite **5/5** after uncertainty propagation. Do not claim the full suite was rerun after that last adjustment.
- Product initial **6 suites / 35 tests**; final affected delegated-run + Memory guarded-session **2 suites / 6 tests**. Targeted ESLint, plugin 15-module syntax, verifier syntax and diff checks passed.
- Final exact-HEAD disposable Atria + Edge integration passed: 165 routes, Source/Server EXACT, restart STALE/reload CURRENT. **23 successful receipts**, including Package build/review/install, stale-review rejection, referenced Work rejection, Library revision deletion, owned Session/Project cleanup and ordinary Session/Work deletion.
- Final ignored evidence: `atria-mcp/.artifacts/atria-1790699829676/`; owned runtime/browser/temp data/config cleaned. Shell desktop/narrow captures are not active Preview UI proof.
- Trusted approvals use deterministic test-client form elicitation, not actual client human approval UX. Agent Runtime uses deterministic injected providers in product tests; browser delegation and populated Memory deletion use real Edge fixtures. Real Atria Memory/Orchestrator/game browser reads remain idle/empty. No paid provider call, full product suite or Android/device check.
- Both final implementation HEADs: **0 check-runs / 0 statuses, combined pending**. No CI pass claimed.

## Next objective and frozen boundaries

Next only on explicit continuation: **Phase 6 — Integration / Security / Native Frontend v3 Verification**.

Read current refs/dirty state first, then current plugin AGENTS, full docs README, this HANDOFF, Plan and same Record. Do not repeat Phases 1–5. Keep the same Record/live HANDOFF slot. Confirm any remaining acceptance coverage against actual implementation rather than treating directional candidate actions as already exposed.

Phase 6 must address real client protocol/approval usability and security coverage, live/populated product scenarios where available, Native Frontend v3 Experience Epoch and rendered Workspace/evaluation/Preview provenance, end-to-end Agent/model/Memory evidence and documented limits. Paid-provider/authentication/device-only evidence must be reported honestly; fixtures do not substitute for it. Agent privilege-escalation and Package boundary tests already pass and must stay passing.

Keep exactly 18 tools and canonical `serverBootId`; no legacy aliases/confirm/allow-writes, arbitrary JS/capability dispatch or generic writes via `atri_api`. Source/Server/Browser and Experience/Project/Workspace/Preview remain independent. Last-observed is not current exact. Reuse Native Frontend v3/Studio Source Graph, frontend.patch, evaluation, Preview and Experience Epoch. Build is semantic namespace; Frontend Host Bridge is not MCP Browser Capability Bridge. Committed Conversation/Timeline is immutable; GenerationProjection is ephemeral.

Product feature stays separate until Phase 6's final integration criteria are satisfied. Then follow the approved final merge/revalidation/cleanup lifecycle; do not merge main into plugin/docs. This Phase 5 round stops here.

## Copyable new-conversation prompt

```text
继续 Atria MCP Capability Expansion。
Task ID: plugin/atria-mcp-capability-expansion
Primary Workspace: plugin
只执行 Phase 6 — Integration / Security / Native Frontend v3 Verification。

先 fetch 核对 refs/dirty state，读取最新 plugin:AGENTS.md、docs:README.md、docs:HANDOFF.md、
docs:plans/plugin/atria-mcp-capability-expansion.md 和同一 docs:records/plugin/atria-mcp-capability-expansion.md。
当前 checkpoint：
plugin@1dfcc35f673f3b4db031355ab061558ca9c1569a
feat/mcp-development-authority@b2709b5af2664b05f6bd32a05a06097a3e98bd6f
main@c936b0aa4c42cf5711f40ae4a00f5fc3432813dc
docs 使用真实最新 HEAD。
复用工作树和同一 Record/HANDOFF，不重做 Phases 1–5，不访问未授权 reference。

Phase 5 已推送：152 actions（109 READ / 27 MUTATE / 8 INTERACT / 8 DESTRUCTIVE），18 public tools；one-shot destructive、原始创建 revision 绑定 owned cleanup、Package artifact/preflight/review/install、选定 preset 节点的受限 Agent delegation 和 parent/child receipts。
Agent 仅 delegated-node + 最多八个精确 Memory 非破坏操作；没有自动 full-preset/nested Agent/web/删除授权。
Plugin full 43/43，最终 affected 5/5；产品初始6 suites/35 tests，最终affected 2 suites/6 tests。
最终两 HEAD 真实 Atria+Edge 集成通过，23条成功回执；0 check-runs/0 statuses，不能称 CI 通过。
审批是 deterministic trusted test-client，Agent provider 是注入测试，真实 Memory/Orchestrator browser 仍 idle/empty。付费 provider、实际客户端人工审批、populated Memory、active Epoch、渲染的 Workspace/evaluation/Preview 仍须真实验证或明确记录环境限制。

保持既有 authority、严格权限交集、exact serverBootId 与独立 provenance，generic Native GET-only；没有 force/legacy/任意JS逃生通道。
先按 Plan/Record 核对并完成 Phase 6 acceptance，再执行最终产品集成与验证、同一 Record 完结和 HANDOFF/临时产品分支清理；不能提前宣称整项任务完成。
```
