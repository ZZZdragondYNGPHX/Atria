# Agent Intelligence Runtime — Record

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`
- Status: **Active**
- Plan: [正式架构与阶段入口](../../plans/architecture/agent-intelligence-runtime/index.md)
- Updated: 2026-10-06

## Summary

用户要求根据远端 Frontier Agent RP 研究重新核对最新 main，按全面调研、讨论、确定方案、正式执行的顺序长期推进。
本轮完成架构调研与分阶段讨论稿。用户确认 RP 与 Project Agent 并重，首批先完成双入口成长闭环，并包含有预算与回滚约束的局部自动启用。
尚未改动产品源码，尚未创建产品实现分支。D1 已冻结 M1 产品边界，S01 执行设计就绪；D2 综合三份新增研究，更新正式语义 / 计算 / 路由架构及后续依赖，当前仍只准备执行 S01。

## D0 — 最新 main 核对与架构调研

- Start / End / Tested product HEAD: `ed1fd90521a63363e29856601abbf5e908c99d10`
- Source docs HEAD: `2e57f83b19d2321260be93f98dbbf5321f4b0b84`
- Product branch: `main`，两次 fetch 后与 `origin/main` 一致，工作树干净。
- Auxiliary docs branch: `feat/agent-intelligence-plan`，从上述 docs HEAD 创建；本阶段文档对应包含本记录的提交。
- Status: **本轮调研完成；进入 D1 讨论**。

### Completed

- 读取指定远端研究、最新 Repository Governance，并按当前任务定位代码与测试。
- 审计 Runtime / Orchestrator、RP 与 Project 入口、Task Artifact、Session / Studio、Information / Memory、Goal 接入 substrate、Skill / Prompt / Preset、Simulation 和表达扩展路径。
- 核对一手研究与官方协议资料；在 research 模块注明摘要、正文部分、作者结果与工程推论的边界。
- 建立 Plan Bundle，覆盖原研究主题，列出 7 个交付组、34 个候选阶段及实际 consumer / 验收条件；D1 增补 M1 具体讨论模块后共七模块。
- 保留既有 docs 工作树中未提交的 Experience 草稿；未修改、暂存或提交该目录。

### Key findings

- 当前已有结构化 result、可信 Native Task Artifact 和 durable lifecycle intent，优先做来源 adapter 与消费者，不另建执行 / authority 系统。
- RP 有恢复 checkpoint 与消息锚定 snapshot，但完整可靠学习轨迹仍缺关联；Project 任务服务的状态目前在进程 Map 中，需要单独持久化与恢复。
- Actor 已有精确身份、profile 和 belief / perspective 投影；完整 BDI、appraisal、emotion / relationship、ToM 与因果变化尚未闭环。
- Skill 候选、Prompt 精确资源和审阅流程可以复用；仍须补真实证据、隔离评价、所有读取入口的精确版本、生效与撤回。
- 角色的错误 belief 可以是合法认知状态；它不成为 World Truth。自由文本知识违规的模型审计与确定性权限检查分别验收。

### Validation / CI

- Node 24.18.0 headless probe：退出码 0。实际验证 allowed tool → task-only handoff → JSON final、checkpoint / projection 内容边界、未授权工具不执行、请求期间失效 memory 阻断后续工具、structured / provenance result。
- 探针复用 `tests/agent-runtime/fakes.js`；无服务器、真实模型或用户数据。它不证明磁盘恢复、浏览器行为或模型效果。
- 核对 baseline 所列 20 个 targeted test 文件均存在；该检查不代表测试执行。
- 未安装测试依赖。`tests/node_modules/jest/bin/jest.js` 不存在；未执行 Jest、构建、浏览器、Android / 真机或 CI。
- 文档结构检查通过：9 个本轮文档、20 个内部链接、S01–S34 连续且无重复，代码围栏配对；未发现机器专属路径。`git diff --cached --check` 通过；没有产品变更。

### Known limitations

- 论文未复现；多个来源只核对摘要，GEPA HTML 正文抓取失败，具体层级见 research。
- 首批产品范围与分组集成已确认；数据 schema、迁移、具体自动化权限、两种真实案例、资源预算和首阶段执行设计仍需收敛。
- Provider / 协议 / 训练可用性在相应阶段重新核对；空接口或 mock 不作为能力完成。

### Next checkpoint

D1：沿已确认的 M1 范围与局部自动启用设计，收敛 scope / 权限、双场景验收、预算和首阶段执行方案；技术方案确定后才进入 S01。

## D1 — 讨论与首批方案冻结

- Start docs HEAD: `1676b21e19a0bbf97ff57caeb5f520801cf8eb00`。
- End / inspected product HEAD: `ed1fd90521a63363e29856601abbf5e908c99d10`；本轮 fetch 后仍与 origin/main 一致。
- End docs HEAD: 包含本阶段记录的提交。
- Status: **Complete — M1 boundary frozen / S01 Ready**。
- Confirmed: RP 与 Project Agent 并重；首批 Skill / Prompt / 编排参数成长闭环包含有预算 / 回滚约束的局部自动启用；M1 完整交付后合并 main，再从最新 main 推进下一组，各正式阶段仍停止。
- Latest user choice: 按角色 / Project 单独开启局部自动，并设置统一预算；新建对象默认审阅。来自本轮“按你推荐的来”，不重复询问。
- Frozen: [M1 设计](../../plans/architecture/agent-intelligence-runtime/m1-evolution.md) 的 scope、预算必需性、精确版本生效、publish / recovery / rollback 约束；[S01 执行设计](../../plans/architecture/agent-intelligence-runtime/s01-baseline.md) 的 12 个案例蓝图、报告、有限 pilot、验证与退出条件。
- Engineering detail: 默认值以外的 case / report 字段为本轮工程细化；没有声称用户逐字段批准。
- Deferred: S02 资源 / source 契约，S05 retention，S06 / S10 的真实费用和晋升门槛在对应阶段前定稿。缺少参数或证据时不允许自动发布。
- Decision authority: [decisions.md](../../plans/architecture/agent-intelligence-runtime/decisions.md)。
- Validation: 复核 RP Director、Project model loop / authority、测试临时存储入口及当前 lockfile；本阶段仅修改 docs，未执行新的产品测试或真实模型请求。文档结构检查通过：10 文件、24 个内部链接、34 阶段连续、12 个唯一 S01 case ID 且六个 promotion；无机器专属路径、围栏配对。`git diff --cached --check` 通过。
- Compatibility: S01 是 test-only cases / report / runner，无产品数据迁移；保护已有未提交 Experience 草稿。
- Next checkpoint: **S01**。重新核对 main，创建本组短期产品分支，执行 s01-baseline；阶段结束更新同一 Record / live HANDOFF 并停止，不合并 main。
- Implementation: 尚未开始；本阶段不表示 S02–S34 的所有技术细则 Approved。

## D2 — 三份研究综合更新正式企划

- Request: 先拉取远端 → 读现有 Agent Intelligence Runtime Plan → 读三份研究 → 综合更新正式架构企划；每阶段 / 完成只在本地执行最小相关验证。
- Start / source docs HEAD: `40ce08a32`；本轮 docs 工作树 fast-forward 8 提交。main pull 显示已是最新。
- End / inspected product HEAD: `ed1fd90521a63363e29856601abbf5e908c99d10`；没有产品修改。
- Auxiliary branch: `feat/agent-intelligence-architecture-update`，从最新 origin/docs 创建独立 worktree，文档集成目标为 docs，绝不将 docs 合入 main。
- End docs HEAD: 包含本阶段记录的实际提交；与集成后的 origin/docs 对齐。
- Status: **Complete — D2 architecture revised / S01 Ready**。

### Completed / decisions

- 按顺序读取 live HANDOFF、现有 Plan / Record、三份完整研究报告；原研究和 D0 结论按既有模块引用，不重复全量调研。
- 增加 behavior-context、compute-policy、model-routing，分别作为语义 / 编译、稀疏计算 / 预算、部署目标 / 路由 / gateway 的详细权威。
- 普通 RP 以一次主要正文调用为目标；额外 cognition / critic / rollout / specialist 有证据与预算。一次共享事件 pass 分别受控采纳，Memory / Experience 尽量事件 / 批处理。
- 保留现有 Native 实际 send 计数事实，沿 RunControl / Host / Scheduler 补跨入口费用与 reservation，不另建执行 / authority。
- Target 与 Model Identity 分开，价格 / capability / health 是有来源与 freshness 的 evidence；policy 请求时求解，独立 FailurePolicy，exact request 与 response observation 分开。
- New API / Sub2API / OpenRouter / LiteLLM / opaque / local 为正式场景；上游身份、费用与内部 retry 未知时不猜测。别名 / 网关的 audit 可重复性不冒充响应逐字重放。
- 保留 S01–S34 身份，增加 M8 G01–G06，共 40 个候选实施阶段；M1 不依赖新组，M3 前交付共享基础，S25 / S26 普通路径不强制依赖 World Model。
- M1 已确认范围 / 默认 / 集成方式不变；S01 仍为 12 cases / v1 / test-only，测量补充不注册产品资源。
- 明确 U9 授权的企划更新与新增工程判断，不伪装新增 schema、阈值、价格、自动 routing / shadow 权限为用户批准。

### Evidence / validation

- 只读核对相关 Generation / Route / Context / Capability / provider / discovery / Native Host / RunControl / TaskScheduler / request inspector；事实见 baseline §9。
- 在线复核必要的一手 Provider / Gateway / routing 资料，仅作设计证据；层级与局限见 research §5。没有 provider probe、论文复现或网关服务执行。
- 本地文档结构检查通过：13 个任务文档、45 个内部链接；围栏配对、表格列数一致、无机器专属路径；40 个唯一阶段且依赖无环，M1 不依赖新增 G 阶段，保留 12 个 S01 case / 6 个 promotion。`git diff --check` 通过；提交前再检查 staged diff。
- 文档实现 / 集成 Tested HEAD: `6bf7a9ee7`；docs fast-forward 后同一 13 文件 / 45 链接 / 40 阶段检查与 `git diff --check` 再次通过。集成前后原 docs dirty diff 逐字节一致。
- 持久化：上述文档 commit 已 push 短期分支并 fast-forward docs；本完成记录提交后 push origin/docs、删除本轮临时 worktree / 分支，最终 HEAD 以实际 refs 为准。未创建 / 合并产品实现分支。
- 无产品测试、构建、浏览器、Android / 真机或 CI；无实际模型调用。

### Protection / limitations / next checkpoint

- main 的 AGENTS.md 与原 docs 工作树 README / WEB Adapter / 两模板既有 dirty changes 原样保留，未暂存 / 提交；未修改任何 reference 或其它资产工作空间。
- 不覆盖其它工作树的 Experience 草稿，不建立第二份 Record / live HANDOFF。D0 / D1 历史保持。
- 新架构仍需各阶段 schema / 迁移 / provider 支持矩阵与真实质量—成本数据；研究中的统计数字不形成 Atria SLO。
- 本轮文档持久化并集成 / push docs 后停止；下一正式阶段仅 **S01**。实施、局部验证、push、更新同一 Record / HANDOFF 后停止，不合并 main。

## Final state

长期任务仍在进行；D0 / D1 / D2 完成，S01 Ready，产品状态保持在上述已核对 main。
