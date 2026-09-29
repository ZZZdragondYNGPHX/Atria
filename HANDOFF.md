# Live HANDOFF — Atria MCP Capability Expansion

Task ID: `plugin/atria-mcp-capability-expansion`
Primary Workspace: `plugin`
Status: **Phase 3 complete and pushed; stopped before Phase 4**
Plan: `plans/plugin/atria-mcp-capability-expansion.md`
Record: `records/plugin/atria-mcp-capability-expansion.md`

## Actual checkpoints

- Plugin / real-integration-tested HEAD: `4d8cbb9da376b3417f47e6f3e23d9eba09b1c1ae`, pushed.
- Product / real-integration-tested HEAD: `feat/mcp-development-authority@defeaabacd918966f3fda6f3be3dcb2a789deebd`, pushed, retained, not merged.
- Main baseline: `c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`, unchanged.
- Docs pre-phase baseline: `55690046979aea005391595bb265932a5c3f161d`; use actual latest remote docs HEAD on resume.
- Existing plugin/docs/product worktrees reused; caller's original checkout unchanged. No main-to-plugin merge or reference access.

## Completed and verified

Phases 1–3 complete. Registry has **102 READ actions** (76 fixed HTTP / 26 fixed browser); exactly 18 public tools. High-level snapshot composes independent evidence with explicit missing/permission results. `atri_api` remains Native GET-only; reviewed POST reads are private adapters with CSRF/auth/ownership/admin checks. No mutation, trusted approval or Lease enabled.

Minimal product additions reuse existing authority: pure scoped SettingsRepo observation (legacy `/get` can seed data), Library getExact route, Orchestrator workspace run projection, loaded Memory read factory/last projection and non-persisting observation recall. No second frontend, Memory, agent or provenance store.

- Plugin full suite **30/30**, final affected suites **12/12**, 11-module syntax/verifier syntax/diff passed.
- Product **5 targeted suites / 124 tests**, targeted ESLint/diff passed.
- Real final-HEAD disposable Atria + Edge passed EXACT, stale/reload, Studio source/revision/validation/preflight/Source Graph/stale-base rejection/Preview API, Session/Timeline/history/branches/saves/runtime and exact PackageVersion/Library reads. Separate fixture setup wrote only owned temporary data; MCP only read, preserving Project revision.
- Eight real browser READ adapters succeeded for Memory scope/injection/last recall, Orchestrator presets/idle run/checkpoints and game identity/LLM status. These are **idle/empty** results, not populated Memory or executing Agent evidence.
- Desktop/narrow shell captures exist; no rendered active Preview/Experience UI pass. Paid-provider probe/vector/recall, populated Memory, executing Agent traces, active Epoch changes and Workspace/evaluation/Preview UI remain later integration obligations.
- Both implementation HEADs: zero GitHub check-runs/statuses, combined pending. **No CI pass claimed.** No full product suite or Android/device check.
- Owned runtime/browser/temp data cleaned up; ignored evidence remains in `atria-mcp/.artifacts/atria-1790694878994/`.

## Next objective and frozen boundaries

Next: **Phase 4 only — Authorization / Receipts / Safe Mutations**. Do not begin Phase 5.

Implement trusted authorization, server-minted leases, exact policy/risk/target guards, receipts and approved non-destructive operations. Reuse registered authorities and the same feature. Recheck guards after approval. A model-provided confirm value is not approval. No legacy aliases, confirm/allow-writes, arbitrary JS/capability dispatch or generic Native write escape hatch.

Canonical `serverBootId` only. Source/Server/Browser and Experience/Project/Workspace/Preview are independent; last-observed scope evidence does not prove current exact identity. Preserve Native Frontend v3/Studio Source Graph, diagnostics, frontend.patch, formal evaluation, Preview and Experience Epoch. Build stays the semantic namespace. Frontend Host Bridge differs from MCP Browser Capability Bridge. Committed Conversation/Timeline is immutable; GenerationProjection is ephemeral. Product feature stays separate from main until the final integration gate.

Fetch/check refs and dirty state first. Read latest plugin AGENTS, full docs README, this HANDOFF, Plan and same Record. Do not repeat Phases 1–3. Refresh this same Record/HANDOFF only while its live slot belongs to this task. After Phase 4 validation/commit/push/CI reporting and docs, provide Phase 5 handoff and stop.

## Copyable new-conversation prompt

```text
继续 ZZZdragondYNGPHX/Atria 的 Atria MCP Capability Expansion。
Task ID: plugin/atria-mcp-capability-expansion
Primary Workspace: plugin
Approved Plan: docs:plans/plugin/atria-mcp-capability-expansion.md
Status: Approved Implementation Plan v1.1 — Post-Frontend-Refactor Revalidated

Phase 3 已完成并推送；当前只执行 Phase 4 — Authorization / Receipts / Safe Mutations，不开始 Phase 5。
先 fetch 并核对真实远端 refs 与 dirty state：
plugin@4d8cbb9da376b3417f47e6f3e23d9eba09b1c1ae
feat/mcp-development-authority@defeaabacd918966f3fda6f3be3dcb2a789deebd
main@c936b0aa4c42cf5711f40ae4a00f5fc3432813dc
docs 使用真实最新 HEAD。

读取最新 plugin:AGENTS.md、docs:README.md、docs:HANDOFF.md、上述 Plan 与 docs:records/plugin/atria-mcp-capability-expansion.md。沿用同一 Record/live HANDOFF；若 HANDOFF 属于其它任务，不得覆盖。复用现有 plugin/docs 与独立产品工作树，不将 main merge 到 plugin，不提前合并产品 feature。

Phase 3 已有 102 READ actions（76 HTTP / 26 browser）与 high-level snapshot。优先 Native server authority；fixed bridge 只用于 Memory/Orchestrator/selected browser-owned game-runtime。产品已有 pure scoped Settings observation、既有 Library exact route、Orchestrator 工作台 projection、Memory loaded read factory 与不持久化的 observation recall。不要重复实现。

严格保留 18 public tools、canonical serverBootId；禁止 runtimeBootId、legacy aliases/confirm/allow-writes、任意 JS/capability dispatch。atri_api 仍只允许 Native GET。按 Plan 实现可信审批、Lease、Receipt、审批前后双重 guards 和受控非破坏性操作。
Source/Server/Browser 与 Experience/Project/Workspace/Preview provenance 独立；last-observed 不能冒充当前 exact。复用 Native Frontend v3/Studio 正式 Source Graph、diagnostics、frontend.patch、evaluation、Preview、Experience Epoch；Build 保持语义命名空间；Frontend Host Bridge 不等于 MCP Browser Capability Bridge。
Committed Conversation/Timeline 不可变；GenerationProjection 是 ephemeral presentation。

验证：Plugin 30/30、最终定向 12/12；产品 5 suites/124 tests；语法/ESLint/diff；最终 HEAD 真实 disposable Atria+Edge READ 集成通过。Memory/Orchestrator browser 证据仅 idle/empty；付费 provider、非空 Memory、执行中 Agent、active Epoch、Workspace/evaluation/Preview UI 仍未真体验证。两实施 HEAD 无 check-run/status，不能声称 CI 通过。

Phase 4 完成后按 Governance 验证、commit/push、记录真实 HEAD/baseline/CI，更新同一 Record/HANDOFF，给 Phase 5 接手提示词并停止。
```
