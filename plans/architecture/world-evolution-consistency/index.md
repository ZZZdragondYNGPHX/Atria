# Atria Native World / Knowledge Reconstruction & Evolution — 方案入口

- Task ID: `ARCH-DWE-01`
- Primary Workspace: `docs`
- Plan status: **Draft / Discussion (未冻结，未批准实施)**
- Initiated: 2026-10-17
- Scope: **原生世界 / 知识体系深度重构**，涵盖从 ST Lorebook 心智模型脱离、静态/动态一致性、实体/关系/法则/资料/认知/检索/演化/三域交互
- Product changes: **不在本讨论阶段实施**
- Permanent Record: [ARCH-DWE-01 Record](../../../records/architecture/world-evolution-consistency.md)

## 0. 讨论协议与文档路由

本 Plan 是同一主题持续迭代的**唯一入口**。每一轮先更新对应模块和本轮讨论状态、在 `docs` 分支提交并核实，再开展本轮讨论；直到用户明确认可完整方案，才将状态由 Draft 改为 Approved/定稿。不得把助理推荐误写为已获批准的冻结决议，亦不得在讨论阶段直接修改 `main` 产品实现。

- [Research](research.md)：外部资料、机制比较、来源、局限和迁移适用性；讨论中持续补充。
- [Design](design.md)：累计历史讨论 §8–§26；**§27 记录已确认 W19-B 并路由 W20 受保护物理契约与 Gate 0 工程包**。旧选型仅为历史，现行状态以后续用户决议为准。
- [Runtime Emergence & Fact Lifecycle](runtime-emergence.md)：**W4 方向已确认，§8 记录 W4-B**。仅当本轮需要核对实体注册/事件基础时阅读。
- [NPC Autonomy & Scheduling](npc-autonomy.md)：**W5 已确认 B 方向**；§10 明确选型与待收口接口，复核 NPC 调度时按需读取。
- [NPC Social Cognition](npc-social-cognition.md)：**W6 已确认 B 方向**；§10 记录社会关系真相、私人认知及来源事件边界。仅在当前模块需要这些依赖时读取。
- [NPC Memory & Information Flow](npc-memory-information-flow.md)：**W7-B 已确认方向**，§10 记录接纳合法 Perspective 与证据驱动传播；只在需要回溯这项设计时阅读。
- [NPC Memory Continuity](npc-memory-continuity.md)：**W8-B 已确认方向**；§11 记录来源保真与人格连续性、职责划分，按需回查。
- [World Subject Identity & Authority](entity-identity-authority.md)：**W9-B 方向已确认**；§11 记录 Canonical Subject + 受控映射/投影，按需回查。
- [Subject Instantiation & Capabilities](subject-instantiation.md)：**W10-B 已确认方向**；§10 记录从固定定义到 Session Subject 实例化与按需能力绑定。
- [Typed Subject / Capability Contracts & E0](subject-contracts-e0.md)：**W11-B 已确认方向**；§8 记录类型化 Subject/Participant/Perspective 与 Native Host Capability Resolution。
- [E0 Consumer Map & Native Cutover](e0-consumer-cutover.md)：**W12-B 方向已确认**；§9 记录基于真实 E0 消费者审计的 Native 单权威原生硬切，E0 实际完成状态仍阻塞。
- [Event Temporality & Branch Integrity](event-temporality-branch.md)：**W13-B 已确认方向**；§9 记录 Revision 提交、事实有效期与分支受控投影，精确 API 未冻结。
- [Effective World View & Knowledge Context](effective-world-view.md)：**W14-B 已确认方向**；§10 记录有效世界视图优先、Claim/Source-Aware Context 和 Library/Studio/Play 的设计原则；完整 E0 尚未通过。
- [E0 Final Closure / Evidence Gates](e0-final-closure.md)：**W15-B 已确认收口方法**；§8 记录证据门槛式 E0/可执行交接原则，现有 E0-01～09 仍为 PARTIAL / BLOCKED。
- [E0 Integration Readiness](e0-integration-readiness.md)：**W16-B 已确认方向**，§9 记录跨分支固定 HEAD/Native Domain、ContextPort、Receipt/Prompt 权威划分和待解决消费者。
- [E0 Domain → World → Context Contract](e0-domain-world-context-contract.md)：**W17-B 已确认方向**；§8 记录 Domain-first 提交/Authorized Effective World 投影和现有跨接口 E0 缺口。
- [E0 Minimal Typed ABI & Consumer Cutover](e0-minimal-contract-cutover.md)：**W18-B 已确认方向**；§7 记录最小 Typed ABI 和真实消费者验收驱动原生硬切，具体物理字段/实施仍未批准。
- [E0 Gate 0 / Physical Subject & Temporal Fact](e0-gate0-physical-contracts.md)：**W19-B 已确认方向**；§7 记录 Session 原生最小 Subject/Fact、Revision/GameTick 双锚与 Gate 0 审查原则，确切物理合同仍待决定。
- [E0 Gate 0 Integration Work Packages](e0-gate0-integration-workpackages.md)：**W20 当前阶段模块**。原生 Reserved/Typed Subject 物理布局 P1/P2、Domain Fact/两段查询、WP-A～F 生产消费者、Gate 0 与实施 Gate 分工、W20-A/B/C 选型（Draft）。
- [Record](../../../records/architecture/world-evolution-consistency.md)：按工作轮累积可核验的文档提交、调研结果、未完成内容。
- 后续需要规模化时再按主题拆模块，本入口仍为唯一导航。

每轮约定：①核查远端文档与当前轮议题；②先更新 Plan + 同一 Record，并提交 `docs`；③讨论新方案及取舍；④用户决定后于下一轮先写回决策。未决问题保留，不擅自推进至最终定稿。

## 0.1 Scope Expansion S2（用户提出的新任务方向，仍属 Draft）

原问题「静态设定和动态演化冲突」仍保留，**但现在必须以原生 World / Knowledge 整体重构为主线**。先明确 World（实体/关系/世界法则/初始基线）与 Knowledge（资料/断言/来源/语境）的真实边界，再设计事实演化、主体认知、有效上下文和 Library/Studio/Play 产品界面。已有 Native SessionCore/State/Event/Simulation/HCM/Context Compiler 是首先审查和复用的权威，不能平行再建一套真相库。

**已确认方向：W1-B 至 W19-B。** 固定 World/Knowledge 源、涌现 NPC/个人认知/事实来源、Canonical Subject、Native Domain 唯一写权、Revision/分支/受众受控双时间投影、Effective World View 与 V3 Context/Prompt、消费者验收驱动最小原生 hard cutover、Session-owned 最小实体及 Fact 转换/两段历史查询。**W20 受保护存储落点、完整旧接口切线与开发 Gate 0 未批准**，见 [e0-gate0-integration-workpackages.md](e0-gate0-integration-workpackages.md)。全案 Draft，E0-01～09 PARTIAL/BLOCKED。

需要回答：创作者的首要对象是若干触发条目，还是可以直接浏览、引用并演化的“世界”；Knowledge 应是同级世界书，还是世界引用的来源与证据？现有 free text 必须继续一等支持；不为未发布旧 ST 数据建立兼容双轨。

## 1. 核心问题（问题定义，不是结论）

传统世界书/知识静态文本可能写着「莱恩是皇帝」，但玩家事件导致莱恩死亡、政权更迭；若原文继续被无条件作为当前事实注入，则与游戏状态、长期记忆和角色所知产生冲突。必须解决：

1. 世界**初始设定**、**不变法则**、**当前事实**、**已发生历史**与**传闻/主观知识**如何区分？
2. 谁能提交世界事实的变更？AI 叙述、模型预测、模拟事件、玩家行动和作者规则的优先权如何决定？
3. 多角色信息不同、时间推进、异地事件、长期运行、存档回退和分支如何保证一致？
4. 怎样控制 token、检索与推演成本，避免全世界每轮全量模拟？
5. 如何与现有 Native Runtime、World/Knowledge、HCM/Memory、Orchestration、Save/Branch、Studio/Play 的**实际接口**融合，不造第二个权威系统？

## 2. 候选思路（待审，不等于决定）

- **世界定义（World Definition）**：作者写入世界法则、历史、初始事实和演化约束；明确区分可变与不变。
- **有效世界状态（Effective World State/View）**：把截至指定分支与游戏时刻的权威状态提供给运行时，区别于作者原文。
- **事件/因果演化（Event/Causal Evolution）**：已确认事件驱动状态变化；设想、概率和未执行提议不等于事实。
- **主体认知（Agent Epistemic View）**：角色的知识、信念、误解、谣言不自动等于世界真相。
- **按需模拟（Selective Simulation）**：对相关 NPC/势力/区域和时间触发做增量演化，其余休眠或聚合结算。
- **分支隔离（Save/Branch Isolation）**：不同游戏时间线互不污染；历史可追溯、投影可重建或验证。

**关键警告**：以上只是研究假设；不能以“四层体系”直接取代现有三域架构或重复实现 HCM、世界书、存读档和编排。

## 3. 外部调研议程

研究事件溯源/CQRS、双时间事实、知识与信念（多主体）、叙事模拟与因果规则、游戏时间推进、LLM agent memory/simulation、存读档分支、失效事实检索，以及性能/代价。对每个资料标记：可借鉴机制、风险、对 Atria 的可用条件。

## 4. 初轮需要讨论的决策轴

- D1：哪些世界声明是绝对不可改，哪些是初始事实，哪些可经授权改写？
- D2：权威事实从哪里产生：原生事件提交、状态变更、还是记忆索引？如何保留出处？
- D3：世界后台推进范围：仅交互触发、时间调度、定向模拟、全局模拟？
- D4：角色认知与事实隔离的粒度/成本。
- D5：世界法则可否被重大剧情改变；需什么作者许可、玩家确认或叙事证据？
- D6：时间线、存读档、分支、回滚、并行事件和冲突如何仲裁？
- D7：需复用哪些当前实现、淘汰哪些旧路径；是否需要 E0 代码审计先于实施计划？

## 5. 状态与下一检查点

- **当前：**S21 已记录用户选择 **W19-B**；进入 W20 [Protected Session Subject、Domain Fact Transition、as-of 查询与 WP-A～F Consumer / Gate 0](e0-gate0-integration-workpackages.md)。研究推荐 **W20-B**，**尚未获用户批准**；E0-01～09 持续 PARTIAL / BLOCKED。
- **已确认设计方向（W1–W19）：** 唯一 Native Host 事实写权、固定作者资源/动态 Session 分离、正式 Subject/Participant/Perspective 与来源记忆、Domain Fact+游戏时间/记录修订、授权有效世界只读投影、适用 Knowledge/Prompt、原生 Session 最小物理持久化及开发前 Gate 0 证据审查。**未冻结 W20 受保护 Namespace/Root 决策、正式查询 API、全量 Consumer/Deletion/三端/CI 证据或实施分支。**
- **未授权：**修改 `main`、创建实现分支、给出实施已经通过的结论。
- **完成标准：**用户在若干轮讨论后明确确认各核心决策及边界，并批准定稿。未经确认，不使用“Final/冻结/全面通过”描述。
