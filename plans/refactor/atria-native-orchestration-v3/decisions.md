# 已冻结决定与待讨论事项

规则：此处**只保存跨模块用户选择的决策**。未经讨论的架构草案、源码推断与候选 API 均不得自动提升为冻结决定；所有产品实施另经后续正式收口。创建：2026-10-15。

## D1 — 已冻结：选择方案 B（2026-10-15）

- **目标：Atria Native Orchestration V3**。不是围绕旧 SillyTavern 模式打补丁，也不是直接引入外部 Agent 框架替代主 Runtime。
- **策略：保留并重用 Atria 现有可靠基础**：纯状态机、Checkpoint/CAS/效果身份、并行、Graph/Result/Capability 和现有 Native 权威接口，经过后续核实后逐步清退旧工作流 adapter。
- **收敛方向**：统一原生执行内核。D1 曾提及“旧模式变为模板”，该部分已被 D2 直接否决：不保留旧模式、模板及兼容路径。
- **边界：无新增 World/Memory/Session/Project/模型调用收费权威**。Agent 的提案与正式事实严格分离；相应原有计划中的领域契约继续有效。
- **流程：讨论期间先更新并提交 `docs` 的同一份 Bundle，再进入后续轮次；本轮不修改 `main` 产品代码**。
- **当前状态**：D1=B、D2=T2+零兼容硬切、D3=G2 有界动态图已冻结；第四轮 Context/Memory/Actor 信息共享、物理 Schema 与实施尚未冻结。

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

## D3 — 已冻结：G2 有界动态图与控制流（2026-10-15）

1. **Graph 两层**：冻结的作者 §PlanRevision§ 是不可变能力/结构/资源/输出约束；Host Run 保存可版本化 §TaskGraph§。§GraphPatch§ 只修改本 Run 的可变任务图，不能变更已冻结 Plan、原 Native 来源事实或扩大 capability。
2. **受控动态 Patch**：Planner/Agent 只能提出**结构化候选**（新增合法任务/依赖、合法优先级调整、取消尚未执行任务、标记阻塞或请求结束等）。Host 对 GraphRevision 的 CAS、任务身份、依赖无环/显式 bounded cycle、可达终点、权限/作用域、额度和已在运行的 Effect 做**整补丁原子校验后提交或拒绝**，绝不允许模型直接写入图表；具体字段待实施冻结。
3. **Delegate/Handoff 分离**：Delegate 建立有来源、有子 Run/Attempt 的受限工作，父保留控制/结果所有权；Handoff 则在指定范围内转移当前工作阶段控制，必须声明入口/返回条件与输出权威。两者都不转移 Host Run authority；权限取交集而非扩权，子结果受 source/visibility 验证。
4. **并行与 Join**：Fan-out 子任务身份和预算从父 Run 衍生，结果/取消/超时独立持久。§Join§ 属于确定性 Host 屏障，而不是必须调用模型；支持 all-success、all-settled、any-success、count-quorum、deadline/best-effort 的**显式策略语义**，缺失、失败与 partial 不得冒充 complete。一次 Join 的成员/阈值与结算结果固定为 receipt；晚到结果不能改写已结算的 Join 或已发布正文。
5. **Planner/Judge/Review**：Planner 返回结构化 GraphPatch 请求；Judge 在合法证据/Result 引用范围作裁判而不是事实认证；Review 返回批准或指向具体受影响节点的重做请求。Host 验证重做目标和依赖失效闭包；每次重做产生新的 NodeAttempt/EffectId，旧 receipt 保留，不重播无关有效步骤，已提交 World/Studio 操作不可因 Review 自动回滚。
6. **失败/恢复**：Run/GraphPatch/Effect/Join 在可恢复的耐久状态边界推进。可重试须证明未发出、幂等或由原 authority reconcile；已发送但结果未知不得盲重放，应记录 unknown/waiting_review/blocked 等可诊断出口。取消/版本失效/旧 epoch 与晚到结果均 fail-closed；重启重验 Session/Project/Actor/Source 和原预算，不能虚构跨外部系统 exactly-once。
7. **有界循环**：允许受控迭代/回环，但需显式 loop/edge visit 与任务/节点尝试/GraphPatch/replan/review/handoff/depth/并发/模型与本地计算/时间等上界，费用与授权复用原 Native Compute/RunControl。Host 防止无进展的相同提案无限循环；耗尽时区分 partial/blocked/budget_exhausted，不能假装达成最终目标。具体数值不在 D3 擅自固定。
8. **成本与 UX 方向**：普通 RP 在必要证据充分时保持确定性最小路径，不因 G2 自动插入 Planner、多个 Agent 和 Judge；复杂任务才按来源缺口与预算升级。全新 Graph Editor/Run Inspector 对 GraphRevision、Attempt、Join/Effect/Review、失败与权限只读投影，**不复活旧模式或旧前端**。
9. **权威不变**：继续遵守 D2 Host 单写入者，World/Session/Studio/Model/Memory/Skill/MCP/A2A 的已有领域 authority、权限、收费与正式事务不转移给编排。D3 只冻结语义边界与方向，物理表名/枚举/API 与端侧验收在实施阶段明确。

D3 各操作的详细方向、不变量与需要测试的失败窗口只由 [graph-control.md](graph-control.md) 管理，不在其他模块复制。

## D4 — 第四轮待冻结

Context 读取/组装的唯一入口，Hybrid Memory 检索依原 Source/Actor/Time/Branch 的许可域，单 Agent 专属与父子共享/公共证据的传播边界，Reasoning 与 Memory 的分层，跨 Agent 最小信息披露、证据引用/失效、并行隔离、上下文预算/复用及防全知规则。D4 尚未获得用户选择，不得提前冻结。

## 后续未定（不要提前冻结）

- D3 已冻结的动态 Graph/Join/Review 方向见 [graph-control.md](graph-control.md)；物理字段、模型质量/真实成本收益和工程验收仍未确定。
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