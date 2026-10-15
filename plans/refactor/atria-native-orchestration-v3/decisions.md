# 已冻结决定与待讨论事项

规则：此处**只保存跨模块用户选择的决策**。未经讨论的架构草案、源码推断与候选 API 均不得自动提升为冻结决定；所有产品实施另经后续正式收口。创建：2026-10-15。

## D1 — 已冻结：选择方案 B（2026-10-15）

- **目标：Atria Native Orchestration V3**。不是围绕旧 SillyTavern 模式打补丁，也不是直接引入外部 Agent 框架替代主 Runtime。
- **策略：保留并重用 Atria 现有可靠基础**：纯状态机、Checkpoint/CAS/效果身份、并行、Graph/Result/Capability 和现有 Native 权威接口，经过后续核实后逐步清退旧工作流 adapter。
- **收敛方向：一个统一的编排语义**。Spec/Loop/Agenda/Director/Single 形成可复用模板/策略能力；不得长期维持互相冲突的四套核心状态机。
- **边界：无新增 World/Memory/Session/Project/模型调用收费权威**。Agent 的提案与正式事实严格分离；相应原有计划中的领域契约继续有效。
- **流程：讨论期间先更新并提交 `docs` 的同一份 Bundle，再进入后续轮次；本轮不修改 `main` 产品代码**。
- **当前状态：只批准方向，没有批准 T1/T2/T3、Schema 细节、存储搬迁、旧代码删除范围、具体交付分期**。

## 第二轮待冻结（D2）

- 主 Run 的持久权威归属：Browser、Native Host 还是多执行者租约模型？
- 精确的 Plan/Run/Attempt/Effect/Receipt/Result 层次与复用边界。
- 模式如何成为模板/策略，最终 reply/guidance/Studio 等输出 owner 的类型系统。
- 浏览器断线/Termux 重启与并行子任务中断下的唯一恢复链；何种不确定写入转为人工 review。
- Native TaskScheduler / RunControl / Browser IndexedDB 的职责切割。

## 后续未定（不要提前冻结）

- 图中的动态创建/修改任务与 bounded loop、Judge/Review、分支合并条件。
- Context 与 Hybrid Memory：按来源/Actor/时间/Branch 和精确授权隔离。
- Adaptive Invocation/缓存/模型路由与并发预算 reservation。
- MCP/A2A/Skill/Web/Code 的权限、外部副作用幂等性和审批。
- RP 叙事质量、作者意图/防全知、自动编排粒度与 Eval。
- UX、跨平台客户端、可视化 Editor、诊断与正式验收/实施序列。

## 明确不等价

- 「静态单测有测试案例」不等于「实际已通过」。
- 「浏览器 IndexedDB Checkpoint」不等于「Native 持久 Session/Task Ledger」。
- 「模型调用完成」不等于「正式游戏事件已提交」。
- 「外部 Agent/MCP/A2A 返回成功」不等于「Atria 权威状态已更新」。
- 「选择 B」不等于「确认 T2 或允许现在开始主线实现」。