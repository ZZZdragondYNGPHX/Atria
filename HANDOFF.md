# Live HANDOFF — Agent Intelligence Runtime

## Task

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`
- Current product branch / HEAD: `main@ed1fd90521a63363e29856601abbf5e908c99d10`，本轮 fetch / pull 后与 `origin/main` 一致。
- Auxiliary documentation: `docs`；D2 由 `feat/agent-intelligence-architecture-update` 隔离准备并集成 docs，文档 HEAD 以包含本文件的实际提交为准。
- D2 source docs HEAD: `40ce08a32`；D0 原研究 HEAD: `2e57f83b19d2321260be93f98dbbf5321f4b0b84`。
- Current stage: **D0 / D1 / D2 完成；下一正式阶段 S01 Ready**。
- Plan entrypoint: [plans/architecture/agent-intelligence-runtime/index.md](plans/architecture/agent-intelligence-runtime/index.md)
- S01-required modules: index → [decisions](plans/architecture/agent-intelligence-runtime/decisions.md) → [s01-baseline](plans/architecture/agent-intelligence-runtime/s01-baseline.md) → Record；按问题读取 m1-evolution / baseline §9。
- Record: [records/refactor/agent-intelligence-runtime.md](records/refactor/agent-intelligence-runtime.md)

## Completed

- D0 / D1 已完成代码调研、双入口成长闭环、局部自动默认方式与首批执行设计。
- D2 先拉取远端、读取现有 Plan，再全文读取三份研究；复核同一 main 的 Generation / Context / Scheduler / RunControl / discovery / provider / inspector 接入及一手来源。
- 更新正式架构；新增 behavior-context、compute-policy、model-routing 三个详细模块，职责、计算准入、target / identity / gateway 与恢复规则有唯一权威。
- 保留 S01–S34，新增 M8 的 G01–G06：M1 不等待它，社会认知前交付生成与预算基础，S26 深化自适应。
- S01 仍为 12 cases / v1 / test-only；补现有调用图 / usage 缺失的测量说明，不提前实现动态路由、cognition 或新增产品资源。
- 保留已确认 RP / Project 并重、三类候选、逐角色 / Project 局部自动、新建默认审阅、统一成长预算与 M1 完成后集成 main。

## Pending

- 下一轮只执行 S01：cases、双入口 runner、报告 consumer / validator、预算 / 缺失状态和针对性验证。
- 真实模型基线只有在既有 generation 入口与明确有限 pilot 可用时执行；否则 `empiricalReady=false`。S06 / S10 前补齐真实证据。
- S02–S10 具体资源、迁移、retention、费用与晋升阈值按对应阶段细化。
- M8 未开始：进入前细化 schema / 支持矩阵、实际 gateway 证据与有限目标 / 集成 checkpoint；不把研究数字或名称当已冻结要求。
- 重新核对最新 main，再创建 `feat/agent-intelligence-runtime`；当前无本任务产品实现分支。

## Key decisions

用户确认与 D2 工程设计来源由 decisions 分开记录；研究仍非约束性，未实测效果不能宣布已有能力。
六 Plane 是职责，语义层不是固定调用层；ordinary RP 一次主要 generation 是方向，不是已测 SLO。新 cognition / rollout / specialist 共享有触发证据的准入、路由和费用。
当前 Native 已在实际 send 前计数；新增预算沿原 RunControl / Host authority 演进，不另建模型执行器。gateway 上游 / 内部 retry 不可知时如实标 unknown，不承诺无法控制的硬上限。
长期 Task ID / Record 持续；每个正式阶段停止，M1 后集成不宣布全任务完成。

## Validation

- D2 仅本地文档结构、链接、阶段依赖 / 身份与差异检查；具体结果见 Record。
- D0 Node headless probe 通过的历史范围保持；D2 没有重跑，不作为新阶段产品效果证据。
- 本轮未执行产品测试、构建、浏览器、Android / 真机或 CI；未发起模型调用 / gateway probe。
- 真实提交 / 集成 / push 状态由 Record 与 Git 核对。

## Next target / Read first

先检查实际 Git 状态，再读本 HANDOFF → Plan index → decisions / s01-baseline → Record。
下一轮只执行 S01，按本地最小相关验证；阶段结束持久化 / push、更新同一 Record / live HANDOFF、给出接手提示词并停止，不合并 main、不进入 S02。

## Do not repeat

- 不重新全文加载全部研究 / Bundle；D2 三份研究综合已完成，新信息仅复核受影响模块。
- 不读取或更新未授权 reference；不加载未要求的 repository-agent Skills。
- 不覆盖本地未提交 AGENTS / docs 治理与模板修改，或其它工作树的 Experience 草稿；不维护第二套 Record / live HANDOFF。
- 不重新询问已确认 M1 范围、局部默认方式和集成安排。
- 不把 field reservation、fixture / mock、模型字符串或论文结果当真实能力 / 上游身份。
- 不把 U9 的企划更新扩展为实施 G 阶段、production shadow、自动改 connection / privacy 或安装 local model 的权限。

## New-chat bootstrap prompt

执行 Atria `agent-intelligence-runtime` 的 S01。先核对实际 Git，再读 `docs:HANDOFF.md` → `plans/architecture/agent-intelligence-runtime/index.md` → decisions / s01-baseline → `records/refactor/agent-intelligence-runtime.md`。D0 / D1 / D2 完成，M1 范围已冻结；D2 已吸收 Prompt / Context、Sparse AI 与 Model / Provider / Routing 三研究，保留 S01–S34 并新增后续 G01–G06，不要重做全量研究或提前实施生成基础组。产品仍为 `main@ed1fd90521a63363e29856601abbf5e908c99d10`，尚无本任务实现分支。重新核对最新 main 后创建 `feat/agent-intelligence-runtime`，只实现 S01 的 12 cases、双入口 baseline runner、v1 报告和 test-only 可选测量、费用 / 缺失状态与最小相关验证。复用 Director、Studio Agent / Project authority 与现有 harness；真实模型只有既有入口与有限 pilot 配置可用时运行，缺失标 `empiricalReady=false`。保留用户已有 dirty changes 与 Experience 草稿；阶段结束 push、更新同一 Record / live HANDOFF 并停止，不合并 main、不自动进入 S02。
