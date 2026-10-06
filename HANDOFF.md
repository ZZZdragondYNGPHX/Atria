# Live HANDOFF — Agent Intelligence Runtime

## Task

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`
- Current product branch / HEAD: `main@ed1fd90521a63363e29856601abbf5e908c99d10`，与本轮 fetch 的 `origin/main` 一致。
- Auxiliary documentation: `docs`；本轮文档由 `feat/agent-intelligence-plan` 准备。以包含本文件的实际 Git 提交核对文档 HEAD。
- Source research docs HEAD: `2e57f83b19d2321260be93f98dbbf5321f4b0b84`
- Current stage: **D0 / D1 完成；下一正式阶段 S01 Ready**。
- Plan entrypoint: [plans/architecture/agent-intelligence-runtime/index.md](plans/architecture/agent-intelligence-runtime/index.md)
- Stage-required modules: index → [decisions](plans/architecture/agent-intelligence-runtime/decisions.md) → [s01-baseline](plans/architecture/agent-intelligence-runtime/s01-baseline.md) → Record；按问题读 m1-evolution / baseline。
- Record: [records/refactor/agent-intelligence-runtime.md](records/refactor/agent-intelligence-runtime.md)

## Completed

- 核对最新 main、原研究和完整治理，完成执行 / 证据 / authority / cognition / 扩展的架构调研。
- 形成七模块讨论稿、7 个交付组与 34 个候选阶段；各阶段有依赖、实际 consumer 与验收。
- 用户确认 RP 与 Project Agent 并重；首批 Skill / Prompt / 编排参数成长闭环包含有预算 / 回滚约束的局部自动启用；M1 完整交付后合并 main，再从最新 main 推进下一组，各正式阶段仍停止。
- 本轮确认逐角色 / Project 开启局部自动、新建默认审阅、共用 owner 有限预算；D1 冻结本组架构执行约束和 S01 具体设计。
- S01 设计包含 12 个 cases 蓝图、报告 / runner / 预算与缺失状态，复用两条真实代码入口；尚未实现。
- 保留另一个 docs 工作树的未提交 `plans/feat/agent-experience-evolution/`；未写入该目录。

## Pending

- S01 实现 cases、双入口 baseline runner、报告 consumer / validator 和针对性验证。
- 真实模型基线在已有 generation 入口与有限预算可用时执行；不可用就标 empiricalReady=false。S06 / S10 前必须补齐真实证据。
- S02–S10 的物理资源 / 迁移、保留策略和评价数值在对应阶段前细化。
- 重新核对 main，再创建 `feat/agent-intelligence-runtime`；当前无产品实现分支。

## Key decisions

已确认与待定的唯一详细记录在 decisions。原研究仍为非约束性研究；旧草稿中的历史自述不是本次对话的批准。
优先复用现有 authority、Memory、Scheduler、Skill / Prompt / Preset 和审阅路径；六个 Plane 仅是逻辑职责。
候选首批顺序是 M1 → M2 → M3；远期阶段按新代码与 provider 证据细化。
用户明确确认完整交付组后集成 main，覆盖治理默认最终统一集成；长期 Task ID / Record / live HANDOFF 持续，不因 M1 集成宣布全部完成。

## Validation / CI

- 一次 Node headless probe 通过，范围见 Record / baseline；没有真实模型、磁盘恢复或 UI 效果结论。
- 所列 targeted test 路径检查存在。
- Jest 依赖缺失；没有运行 Jest、构建、浏览器、Android / 真机或 CI。
- D1 仅复核相关入口和执行设计；没有新增产品测试或模型请求。最新文档验证见 Record。
- 文档验证与提交状态以 Record 和实际 Git 为准。

## Next target / Read first

先检查实际 Git 状态，再读本 HANDOFF → Plan index → decisions / s01-baseline → Record。
下一轮只执行 S01。新建产品分支、实现和验证、push、更新同一 Record / HANDOFF 后停止；此阶段不合并 main。
需要治理敏感变化时读完整 `docs:README.md`，不通过改生命周期绕过阶段停止要求。

## Do not repeat

- 不重新全量扫描所有 Plans、Skills 或研究；只复核变化和当前议题。
- 不读取未获授权的 reference。
- 不覆盖既有未提交 Experience 草稿，不维护第二份相同任务 Record 或 live HANDOFF。
- 不将产品排序回复当作完整 schema、自动发布或实现范围的批准。
- 不重新询问已确认的 M1 范围、局部默认方式和集成安排；按已就绪的 S01 执行。
- 不把字段预留、provider mock 或论文结果当作 Atria 已落地能力。

## New-chat bootstrap prompt

执行 Atria `agent-intelligence-runtime` 的 S01。先核对实际 Git，再读 `docs:HANDOFF.md` → `plans/architecture/agent-intelligence-runtime/index.md` → decisions / s01-baseline → `records/refactor/agent-intelligence-runtime.md`。D0 / D1 完成，M1 产品范围和架构执行约束已冻结；用户确认双入口、三类候选、逐角色 / Project 开启局部自动、新建默认审阅、统一预算和 M1 完成后集成 main。产品仍为 `main@ed1fd90521a63363e29856601abbf5e908c99d10`，尚未创建实现分支。重新核对最新 main 后创建 `feat/agent-intelligence-runtime`，只实现 S01 的 12 cases、双入口 baseline runner、报告与费用 / 缺失状态和针对性验证。复用 Director、Studio Agent / Project authority 与现有测试 harness；真实模型不可用标 empiricalReady=false，不伪造通过。保护未提交 Experience 草稿；本阶段结束 push、更新同一 Record / live HANDOFF 并停止，不合并 main，不自动进入 S02。
