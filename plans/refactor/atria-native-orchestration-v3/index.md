# Atria Native Orchestration V3 — 智能体编排补强企划

> **唯一入口**。Task ID：`refactor/atria-native-orchestration-v3`。Primary Workspace：`main`（未来实现）；本轮仅更新长期 `docs` 工作空间。规则只引用 [Repository Governance](../../../README.md)，不在本 Plan 复制执行规则。

- 创建/调研日期：2026-10-15。
- 第一轮状态：**D1 已定案：方案 B（原生 Orchestration V3）**。
- 第二轮状态：待讨论「统一编排内核与执行权威归属」；未冻结具体部署拓扑、API、物理 Schema 和实施阶段。
- 代码审计基线：`main@2686aa40a00c8bfccdc47c55d2b236b4878b022a`，基于远端相关源码与现有测试的静态审计；**没有运行代码、单测、CI、真机或 UI 测试**。
- 文档性质：设计讨论阶段；本轮不创建实现分支、不改 `main`、不自动执行实现。
- 外部技术参照核对日期：2026-10-15；只对比模式和契约，不宣称框架直接兼容 Atria。

## 目标与现状

Atria 已具有 `public/scripts/lib/agent-runtime`（效果/状态机/Checkpoint/并行等）、`public/scripts/lib/orchestration-engine`（Graph/Controller/Judge/Synthesize）、`public/scripts/agents/orchestrator/engine-v2`（旧模式到新运行时的适配）和 `src/native`（原生 Session / RunControl / TaskScheduler / Resource / MCP / A2A 等）。问题不是从零发明 Agent，而是浏览器侧编排与 Native Authority 的职责交错、历史模式适配尚未退出、恢复/预算/写入/可组合性跨链路不一致。详情以 [代码基线](baseline.md) 为准。

**D1 选择的总体方向**：建设一套 Atria 原生 Plan → Scheduler/Effects → Result/Receipt → Consumer 语义，保留已证实的纯状态机与权威契约，逐步移除仅服务旧 SillyTavern 执行模式的适配层。Spec/Agenda/Loop/Director 等转为可复用的工作流模板或策略，而不是四套互相竞争的主内核。不以直接整体替换成 LangGraph/OpenAI Agents SDK/Mastra 为目标。

## 方案的业务边界

- 游戏世界的真实变更只交给已有 Native Session/World/Command/Authority；智能体的建议、推演、草稿不能直接成为正式事实。
- Session、Studio Project、普通 RP、Actor Cognition 与外部 Tool 有各自事实与权限域；编排必须用原权威的 source/branch/revision/receipts 复核，不自建第二套世界/记忆/模型收费权威。
- `Memory`、`Model Route`、`Skill`、`MCP/A2A`、`Experience/Eval` 作为受控 Port/Consumer 接入；权限不能仅靠 Prompt 声明。
- 普通 RP 保持稀疏计算目标：没有必要不强制启用多个模型 Agent；高价值任务允许在共享预算下按需升级。
- 跨 Windows、Linux、手机 Termux 的工作保持同一应用契约；具体 Host 部署归属在第二轮讨论，不预先宣称实际三端已验证。
- 重构期不为保留已废弃的 SillyTavern 内部数据结构和执行模式付出永久双轨成本；精确切换/数据处理范围在实施前另定。

## 文档模块图（同一份 Plan Bundle）

| 模块 | 唯一职责 | 阅读时机 |
| --- | --- | --- |
| [baseline.md](baseline.md) | `main` 相关源码入口、测试证据、风险与事实/推断区分 | 首轮/代码变更前核对 |
| [research.md](research.md) | 官方 Agent 框架/模式来源、适用性与不适用性 | 技术取舍变化时 |
| [architecture.md](architecture.md) | **第二轮候选设计**：权威归属、执行拓扑、统一对象草案（尚未冻结） | 第二轮主读 |
| [decisions.md](decisions.md) | 仅跨模块的用户冻结决定、明确未定项 | 每轮先读、选择后更新 |

已存在的其他方案只是依赖，不复制详细契约：
- [Agent Intelligence Runtime](../../architecture/agent-intelligence-runtime/index.md)：Memory/Cognition、Experience/Eval/Evolution、Sparse Compute、Execution Reuse、Model Routing 的领域契约。
- [Game Runtime Architecture](../game-runtime-architecture/index.md)：World/Command 的唯一事实与写入边界。
- MCP 补强或 Native Visual 等若影响实际 Tool Port，仅作为后续依赖接口，不在本 Plan 重建插件或媒体权威。

## 轮次路线（建议，非提前冻结）

| 轮次 | 待讨论 | 预期产物 |
| --- | --- | --- |
| **1 已完成** | 代码基线、网络调研、A/B/C 方向 | D1 = B |
| **2 当前** | 编排内核归属、Host/Browser 角色、Plan/Run/Effect/Receipt、执行拓扑 | 架构权威选择与接口边界 |
| 3 | 图语义、状态转移、动态 Planner、Delegate/Handoff/Join、故障路由 | 可组合工作流语义 |
| 4 | Context/Memory/Actor/Source 可见性、分级信息共享 | 上下文与隔离契约 |
| 5 | Sparse/Adaptive 调用、模型路由、缓存/复用、并行/预算 | 计算调度契约 |
| 6 | Tool/Skill/MCP/A2A、审批、安全、未知副作用与跨协议恢复 | Effect/权限契约 |
| 7 | RP 叙事/反全知/多角色、Narrator 与批评回路、Project Agent | 产品使用模式与质量保障 |
| 8 | 图形化编辑、预设、可解释 Run/Diagnostics、跨平台交互 | UX/Observability |
| 9 | 代码清退、分阶段切换、验证矩阵/用户验收 | 实施清单与验收入口 |

每轮先更新本 Bundle 中**对应模块**并提交 `docs`，再进行当轮新问题的讨论。下一轮确认前不得把[architecture.md](architecture.md)候选当已批准接口。

## 第二轮阅读与切入

必读本 `index.md`、[decisions.md](decisions.md)、[architecture.md](architecture.md)；必要时回查 [baseline.md](baseline.md) 中对应实现证据和外部来源；不扫描所有既有 Plan/Record。第二轮的核心选择是 **谁持有持久 Run 及 effect admission 权威**，然后才确定 Plan 模型、Tool 权限与 Host 交互的物理接口。