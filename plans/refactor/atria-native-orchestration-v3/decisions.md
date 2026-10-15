# 已冻结决定与待讨论事项

规则：此处**只保存跨模块用户选择的决策**。未经讨论的架构草案、源码推断与候选 API 均不得自动提升为冻结决定；所有产品实施另经后续正式收口。创建：2026-10-15。

## D1 — 已冻结：选择方案 B（2026-10-15）

- **目标：Atria Native Orchestration V3**。不是围绕旧 SillyTavern 模式打补丁，也不是直接引入外部 Agent 框架替代主 Runtime。
- **策略：保留并重用 Atria 现有可靠基础**：纯状态机、Checkpoint/CAS/效果身份、并行、Graph/Result/Capability 和现有 Native 权威接口，经过后续核实后逐步清退旧工作流 adapter。
- **收敛方向**：统一原生执行内核。D1 曾提及“旧模式变为模板”，该部分已被 D2 直接否决：不保留旧模式、模板及兼容路径。
- **边界：无新增 World/Memory/Session/Project/模型调用收费权威**。Agent 的提案与正式事实严格分离；相应原有计划中的领域契约继续有效。
- **流程：讨论期间先更新并提交 `docs` 的同一份 Bundle，再进入后续轮次；本轮不修改 `main` 产品代码**。
- **当前状态**：已确认 D2 T2、Host 权威、零兼容硬切与新前端；D3 算法/Schema/实施仍未确认。

## D2 — 已冻结：T2 Native Host + 旧编排零兼容硬切（2026-10-15）

1. **唯一控制者**：Node Native Host 持有 authoritative Run admission、Graph scheduling、checkpoint、Effect admission/receipt、cancel/resume/output 准入。Browser/桌面/手机 UI 只编辑非权威 Plan 草稿、发送显式命令和展示 Host 投影，不能再运行第二套有写权限的 Agent Runtime/IndexedDB Ledger。
2. **Plan**：作者 Definition 与不可变 PlanRevision/ExecutionSnapshot 固定 Graph、Agent/Tool/Route refs、capabilities、budgets、OutputContract；运行中动态 TaskGraphPatch 属于 Run，不修改已发布 Plan。
3. **Run**：Host-owned Run ID/owner/scope/原 source anchor、PlanRevision、epoch/generation、NodeAttempt、parent/child、GraphRevision、pending effects/approvals、result refs、status 与 durable ledger。并发写受 CAS/epoch/fencing 限制，迟到响应不能覆盖新状态。
4. **Effect**：模型、工具、Skill、MCP/A2A、委派、审批或正式业务命令的动作，在执行前持久注册稳定 EffectIntent，包括权限/source guard、输入摘要、预算 reservation、reconcile 策略；执行交给原 Native Port。
5. **Receipt**：EffectReceipt 只记录 effect 的真实/未知结果、外部 operation ID、来源/provenance、cost 与原 DomainCommitReceipt 引用；**不是 World/Studio/Memory 的正式业务提交本身**。未知已发送写入不可盲重试，不承诺外部系统 exactly-once。
6. **Result/Output**：ResultEnvelope 带 producer/attempt/source/currentness；OutputContract 限定最终输出 owner 与消费者。Judge/Planner/Agent 的建议不直接升级为世界事实，Narrative、Studio、Game Command 均须经原领域 authority 验证与提交。
7. **原生共用权威仍归原所有者**：NativeTaskScheduler 管活跃资源 permits，当前进程内 Map **不是** V3 持久 Run Ledger；SessionCore/RunControl 管 Session/预算/费用、Studio/Project Task 管正式工作、Model Runtime 管路由/Secret/发送、Memory/Actor 管可见性、MCP/A2A/Skill 管授权/外部协议、Experience 管评价。V3 不复制第二套账本或事务。
8. **删除旧编排模式和实现**：Single/Spec/Loop/Agenda/Director 五种产品模式、其运行驱动、mode adapters、legacy Generator/Workflow、旧配置/Presets、旧浏览器 checkpoint、capsule/takeover 作为编排主合同、旧 Workspace/Run Panel 和对应模式逻辑全部列入清退。**不迁移，不兼容，不双读双写，不留 fallback/shim，不把旧模式一一重命名成 V3 模板。** 仅限旧编排专属代码；共用 Native 逻辑先确认真实消费者再复用/抽离。
9. **新 UI**：重新设计 Graph Editor / Node-Agent-Edge Inspector / Capabilities / Route / Output / Run Graph / Timeline / Approval / Diagnostics；不保留旧模式选择器或旧交互入口，PC/移动使用相同 Host Contract。
10. **跨端/恢复**：Windows、CachyOS Linux、Android Termux 共用 Node Host 语义；页面离开不代表取消，Host 进程停止后重开方可 reconcile/恢复，source/branch/revision 与权限失效时停止过期发布；不假设系统唤醒、后台守护、跨设备同步或已做端侧验证。
11. **当前授权**：只是 docs 方案冻结，不授权现在删除产品代码，也不等于物理 Schema、D3 控制流、测试/客户端验收已定案。

## D3 — 待讨论

动态 GraphPatch 与 bounded DAG、Delegate 与 Handoff 的控制权/返回、Fanout/Join 的 all/any/quorum 和部分失败、Planner/Judge/Review 的决策/重做、外部 unknown effect reconcile、Retry/Replan/Resume 与预算/循环上限，均在后续轮次单独冻结。

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
- D2 已确认 T2，但未授权 main 实施、未冻结 D3 细节，也无测试通过声明。