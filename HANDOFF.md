# Live HANDOFF — Atria MCP Capability Expansion

Task ID: `plugin/atria-mcp-capability-expansion`  
Primary Workspace: `plugin`  
Status: **Phase 1 complete and pushed; stopped before Phase 2**  
Plan: `plans/plugin/atria-mcp-capability-expansion.md`  
Record: `records/plugin/atria-mcp-capability-expansion.md`

## Actual checkpoints

- Plugin branch / tested HEAD: `plugin@8cf6275239860a915d2444d62b05019d8674a6d5` (pushed).
- Main baseline: `main@c936b0aa4c42cf5711f40ae4a00f5fc3432813dc` (unchanged by this phase).
- Docs pre-phase baseline: `708757c0a15cacac2f94bc648f98bb55d113274c`; this HANDOFF/Record are committed together on docs. Use actual remote docs HEAD on resume.
- No product implementation branch was created. No main-to-plugin merge. No product source was changed.

## Completed / validation

Phase 1 implemented exact 18 tools, Registry/four-risk executor/Policy Ceiling/ephemeral Receipt Store infrastructure, repository-wide tree/read/search including safe untracked, Git status/diff/log/show/blame, bounded artifacts and independent sensitive/product-data policy. Legacy aliases, confirm and write switches removed; API GET-only; browser side effects blocked except observation scrolling.

Passed `npm run check`, final `npm test` **19/19**, verifier syntax and Git whitespace checks. Actual Edge browser fixture passed; initial bundled Chromium absence resolved by selecting installed Edge. No real Atria runtime/product UI/build/Android checks were run. GitHub queried at plugin HEAD: zero check-runs and zero commit statuses (combined state pending); no remote CI pass claimed.

## Outstanding / frozen decisions

- Phase 2: revalidate then-current main for current runtime identity/startup fingerprint/full revision binding; implement only remaining gap and fixed allowlisted adapters according to the Plan.
- Reuse serverBootId; no runtimeBootId. Native Frontend v3/Studio already own their source/diagnostics/patch/evaluation/Preview authorities; Build is the semantic namespace.
- Host Bridge is distinct from MCP Browser Capability Bridge; bridge only APIs without stronger server authority.
- Immutable committed Timeline versus ephemeral GenerationProjection remains mandatory.
- Phase 1 semantic product catalog is intentionally empty; no Lease/trusted approvals/product mutations implemented. Phase 4 owns authorization behavior.
- Artifact inspect currently means bounded byte identity, not product/package validation. Custom runtime dataRoot must be configured for exclusion if not in the standard root config.
- RuntimeSourceMatch remains UNVERIFIABLE. Do not treat fixture screenshots as current-source product verification.

## Resume requirements

Fetch and inspect real main/plugin/docs refs and local dirty state first. Read latest plugin AGENTS, full docs README, this HANDOFF, approved Plan and the same Record. Preserve unrelated changes; reuse suitable existing worktrees. Do not repeat Phase 1, reopen frozen design, start Phase 3, or merge main into plugin.

## Copyable new-conversation prompt

```text
继续 ZZZdragondYNGPHX/Atria 的 Atria MCP Capability Expansion。
Task ID: plugin/atria-mcp-capability-expansion
Primary Workspace: plugin
Approved Plan: docs:plans/plugin/atria-mcp-capability-expansion.md
Status: Approved Implementation Plan v1.1 — Post-Frontend-Refactor Revalidated

Phase 1 已完成并推送，当前只执行 Phase 2 — Runtime Provenance / Fixed Capability Adapters，不开始 Phase 3。
Checkpoint（必须 fetch 后重新核对真实远端 refs）：
plugin@8cf6275239860a915d2444d62b05019d8674a6d5
main@c936b0aa4c42cf5711f40ae4a00f5fc3432813dc
docs 使用真实最新 HEAD。

开始前检查 dirty state，并读取最新 plugin:AGENTS.md、docs:README.md、docs:HANDOFF.md、上述 Plan 和 docs:records/plugin/atria-mcp-capability-expansion.md。
沿用同一 Record 和本任务 live HANDOFF；若 HANDOFF 已属于其它活跃任务，不得覆盖。

先按当时 main 重新核对 direct current-runtime identity、startup source fingerprint/full revision binding 是否仍有缺口。只有确实需要产品变更时，才从当时 main 创建 feat/mcp-development-authority；不要为匹配旧设计而新增产品代码。绝不将 main merge 到 plugin。
复用 canonical serverBootId，禁止新增 runtimeBootId。保留独立的 Source/Server/Browser 与 Experience/Project/Workspace/Preview provenance。
复用 Native Frontend v3 / Studio 正式 authority；Build 保持语义命名空间。不得重建 Source Graph、diagnostics、frontend.patch、evaluation、Preview 或 Experience Epoch。
Frontend Host Bridge 与 MCP Browser Capability Bridge 是不同层；后者仅适配没有更强 server authority 的 allowlisted Memory / Orchestrator / selected game-runtime APIs，不能任意 JS/capability dispatch。
Committed Conversation/Timeline 不可变；GenerationProjection 是 ephemeral presentation。
公开 MCP surface 严格保持 18 tools，不恢复 legacy aliases/confirm/allow-writes，不将 atri_api 变成写入通道，不提前实现 Phase 4 approval/Lease mutation。

Phase 1 验证：19/19 tests、语法和 Git diff 检查通过；真实 Edge fixture 通过。真实 Atria 产品集成尚未执行；远端该 HEAD 没有 check-run/status，不能声称 CI 通过。
Phase 2 完成后按 Governance 验证、commit/push，更新同一 Record/HANDOFF，记录实际 HEAD/baseline/验证与 CI，提供 Phase 3 接手提示词并停止。
```
