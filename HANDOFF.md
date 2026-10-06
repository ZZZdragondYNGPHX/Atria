# Live HANDOFF — Agent Intelligence Runtime

## Task

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`
- Current product branch / HEAD: `main@ed1fd90521a63363e29856601abbf5e908c99d10`，与本轮 fetch 的 `origin/main` 一致。
- Auxiliary documentation: `docs`；本轮文档由 `feat/agent-intelligence-plan` 准备。以包含本文件的实际 Git 提交核对文档 HEAD。
- Source research docs HEAD: `2e57f83b19d2321260be93f98dbbf5321f4b0b84`
- Current stage: **D0 本轮调研完成；D1 讨论中**。
- Plan entrypoint: [plans/architecture/agent-intelligence-runtime/index.md](plans/architecture/agent-intelligence-runtime/index.md)
- Stage-required modules: index → [decisions](plans/architecture/agent-intelligence-runtime/decisions.md) → [delivery](plans/architecture/agent-intelligence-runtime/delivery.md) → [m1-evolution](plans/architecture/agent-intelligence-runtime/m1-evolution.md)；事实需要时读 baseline / 对应 research 资料。
- Record: [records/refactor/agent-intelligence-runtime.md](records/refactor/agent-intelligence-runtime.md)

## Completed

- 核对最新 main、原研究和完整治理，完成执行 / 证据 / authority / cognition / 扩展的架构调研。
- 形成七模块讨论稿、7 个交付组与 34 个候选阶段；各阶段有依赖、实际 consumer 与验收。
- 用户确认 RP 与 Project Agent 并重；首批 Skill / Prompt / 编排参数成长闭环包含有预算 / 回滚约束的局部自动启用；M1 完整交付后合并 main，再从最新 main 推进下一组，各正式阶段仍停止。
- 保留另一个 docs 工作树的未提交 `plans/feat/agent-experience-evolution/`；未写入该目录。

## Pending

- 自动模式默认值及具体门槛、适用 scope / 权限、真实场景、预算和首阶段执行设计。
- 首批 schema、source adapters、存储 / 迁移、失败 / 删除 / 回滚与针对性验收设计。
- D1 冻结后重新核对 main，再创建短期产品分支进入 S01；当前无产品实现分支。

## Key decisions

已确认与待定的唯一详细记录在 decisions。原研究仍为非约束性研究；旧草稿中的历史自述不是本次对话的批准。
优先复用现有 authority、Memory、Scheduler、Skill / Prompt / Preset 和审阅路径；六个 Plane 仅是逻辑职责。
候选首批顺序是 M1 → M2 → M3；远期阶段按新代码与 provider 证据细化。
用户明确确认完整交付组后集成 main，覆盖治理默认最终统一集成；长期 Task ID / Record / live HANDOFF 持续，不因 M1 集成宣布全部完成。

## Validation / CI

- 一次 Node headless probe 通过，范围见 Record / baseline；没有真实模型、磁盘恢复或 UI 效果结论。
- 所列 targeted test 路径检查存在。
- Jest 依赖缺失；没有运行 Jest、构建、浏览器、Android / 真机或 CI。
- 文档验证与提交状态以 Record 和实际 Git 为准。

## Next target / Read first

先检查实际 Git 状态，再读本 HANDOFF → Plan index → decisions / delivery → Record 的 D0 / D1。
接续 D1 讨论，收敛首批详细设计；方案冻结前继续准备研究和可审阅设计。
需要治理敏感变化时读完整 `docs:README.md`，不通过改生命周期绕过阶段停止要求。

## Do not repeat

- 不重新全量扫描所有 Plans、Skills 或研究；只复核变化和当前议题。
- 不读取未获授权的 reference。
- 不覆盖既有未提交 Experience 草稿，不维护第二份相同任务 Record 或 live HANDOFF。
- 不将产品排序回复当作完整 schema、自动发布或实现范围的批准。
- 不把字段预留、provider mock 或论文结果当作 Atria 已落地能力。

## New-chat bootstrap prompt

继续 Atria 的 `agent-intelligence-runtime`。先核对实际 Git，再读 `docs:HANDOFF.md` → `plans/architecture/agent-intelligence-runtime/index.md` → decisions / delivery / m1-evolution → `records/refactor/agent-intelligence-runtime.md`。已在 `main@ed1fd90521a63363e29856601abbf5e908c99d10` 完成本轮架构调研，形成 34 个候选阶段，产品源码未改。用户确认 RP 与 Project Agent 并重、首批 Skill / Prompt / 编排参数成长闭环含受预算 / 回滚约束的局部自动启用、M1 完整交付后合并 main 再从最新 main 推进下一组。当前 D1 技术细则待收敛，继续确定自动模式默认值 / 门槛、scope / 权限、双场景验收、预算与首阶段执行设计；补齐后再冻结方案。一次 Node headless probe 通过，文档检查通过，Jest / 浏览器 / 真机未运行。保护既有未提交 Experience 草稿；保持同一长期 Record / live HANDOFF，不重复全量调研，不自动越过正式阶段边界。
