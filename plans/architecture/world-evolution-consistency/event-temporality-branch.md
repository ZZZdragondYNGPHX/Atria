# ARCH-DWE-01 · W13 世界事件提交、历史有效期与分支一致性（讨论草案）

- Task ID：`ARCH-DWE-01`；Primary Workspace：`docs`；[唯一 Plan 入口](index.md) · [总体设计](design.md) · [W12 原生硬切与 E0](e0-consumer-cutover.md) · [唯一 Record](../../../records/architecture/world-evolution-consistency.md)。
- **状态：Draft，W13-B 顶层方向已获用户确认；W14 与事务/时态的精确 API 尚待讨论**。W1-B～W13-B 已确认；§7 保留当轮选型对照，正式 W13 决议见 §9。不修改 `main`，不开实现分支，不宣称 E0 或跨端测试通过。
- **本轮范围**：一个运行时新 NPC 引发可持续后果时，怎样将身份、事件、状态、参与者、历史修订、分支和可见来源联系起来？事实“何时发生”“何时被正式确认”“某主体何时获知”如何区分？怎样在 Native Host 已有持久化基础上完成，而非重做一套 EventStore？
- **已确认依赖**：W3 分级事实权限、W4 关键交互即时接纳、W5 有界 NPC 事件推演、W6/W7 认知与来源隔离、W8 来源保真记忆、W9/W10 Canonical Subject 实例化、W11 类型化 Participant/Perspective/Host Capabilities、W12 E0 证据驱动的 Native 单源硬切。

## 1. 五类容易混为一谈的“发生”

| 分类 | 示例 | 能否直接改变客观世界？ |
| --- | --- | --- |
| **Action Proposal / 意图** | NPC 阿洛打算借给玩家金币 | **不能**；仍需条件/权限/资源验证 |
| **Committed World Effect / 已提交效果** | 一次已通过交易将金币转移并产生债务 | **能**；仅经 Native Host 正式发布的修订和权威状态 |
| **Narrative Evidence / 叙事证据** | 文本出现“阿洛微微点头” | 不必全部结构化；若声明了持续后果，需与已确认事件一致 |
| **Report / 传闻/证言** | 米拉说“阿洛放弃了债务” | 只确立**米拉曾声称这件事**；不能自动终止债务 |
| **Belief / 个人认知** | 玩家相信自己不再欠钱；阿洛认为玩家会逃跑 | 只能更新合法的私人认识；不自动改写客观债务 |

**重要分离**：对外显示一段模型已生成的叙事文字不等于某个 Effect 已被接受；HCM 从文本抽取了一个实体/事件也不是世界提交凭据；某 NPC 说过一句话可以是证据，其陈述的内容未必真实。作者预先定义的 Hidden Canon 不等于所有角色已知，也不允许普通模型自由 E3 改写。

## 2. 推荐的原生事务边界（候选，不是已存在的 API）

```text
User / NPC / Simulation / Orchestration proposes an intention
  -> resolve current session + branch + expected revision + scope
  -> typed subject/participant capability & provenance check
  -> validate world invariants, existing subjects, causal preconditions,
     clock, inventory/ownership/consent, permissions, budget
  -> prepare candidate effects (subject admission if needed,
     world facts/relations, event journal, optional committed dialogue,
     host-owned receipt) against ONE base revision
  -> Native SessionCore / Repo coherent publish (or reject)
  -> receipt / committed revision becomes authoritative
  -> Effective World and permitted Timeline / Cognition projections
  -> HCM / search / Context derived indexing from committed legal sources
```

**本轮建议的强一致最小单元是 Native Session Revision，而不是新增一个“全局可写 World Event DB”。** 事件日志、当下 World State、Subject admission、正式变化的关系与必要的参与者/叙事提交，能在同一原生 publication 中满足因果和交叉引用约束时就应绑定同一修订/Receipt；只确立一个世界事件、但叙事尚需另外生成时，必须区分已提交效果与待发表文本，不能暗示外部文本和世界状态总能同时提交。

### 2.1 阿洛案例（交易场景）

- T100：模型提出“旅馆老板阿洛借给玩家 100 金币，约定第 103 天归还”。此前阿洛未正式登记为 World Subject。
- **验证阶段**：确认场景、身份/参与者权限、借款与转移规则、玩家是否真的选择/授权交易、金币余额、到期时间及硬法则。AI 不能在没有玩家真实授权时替玩家签署合同。
- **成功路径**：一次 Native Effect 发布中确立阿洛 Subject（如必要）、合法的世界状态/100 金币债务与期限、事件来源/参与者，获得分支 Revision/Receipt；后续的个人记忆/见闻只能从有权限的正式源形成。
- **失败路径**：余额不足、玩家未授权或 CAS 冲突则事务拒绝；可以发表合法的“交易未成”结果或重新生成相符叙事，但不能把借款已经成功的文字作为永久世界事实。
- **断线恢复**：若请求超时、提交状态未知，先按既有 commit/action receipt 和 request fingerprint 核实结果；不能盲目重放同一交易使金币重复转移。查询确认后再恢复呈现和派生索引。
- **HCM**：可以随后索引阿洛、借款与承诺的合法来源；HCM 索引失败不应让已提交的 Native 债务“消失”，恢复时以受权威修订为源重建，不能将索引自身升格成新的写入事务。

**边界未定**：当前真实 `commitStatePatch`、Native Authority Turn、Orchestration V3 的 Narrative/Effect 路径是否都支持在一次原生 publication 内写入这些内容，需要 E0 完整证明；本例是目标语义，不是已实现的功能声明。

## 3. 世界时间、修订时间和观察时间

建议至少能回答以下独立问题（并非所有字段必须复制到每条物理记录）：

| 概念 | 要回答的问题 | 合法来源 |
| --- | --- | --- |
| `validFrom / validUntil` | 这一条**客观事实**在游戏世界哪个时段成立？ | 已提交事件的 canonical game clock / 合法的有效区间；有期限的状态区分成立与失效 |
| `eventAt / occurredAt` | 行动或事件发生在哪个游戏 Tick？ | 原生事件/世界时钟，与现实日期无必然关系 |
| `recordedRevision` | 系统在**哪个正式 Revision** 首次承认/更正此断言？ | Native commit Revision / Receipt |
| `observedAt` | 阿洛、米拉、玩家各在何时见到或得知内容？ | 合法观察/通信的时间、Subject Perspective 证据 |
| `sourceRef / supersedes` | 依据谁的证言、作者既定 Canon 或哪个事件；为什么后来失效/更正？ | 精确的来源/版本/权限与事件引用 |

**两个独立维度必须同时约束历史查询**：`branch + revision` 决定“截至哪个已提交修订，我们知道什么”；`asOfGameTick` 决定“在某个游戏时间，哪个事实有效”。历史可见性还需 `Perspective`，不能让 `asOf` 查询成为读取隐藏世界真相的漏洞。

例如：在 Revision R20 以后确认“皇帝其实 T10 已经死亡”，可回答：
- `Revision R9 / asOf T11`：当时系统尚未接受这条情报，可见信息不等同于后来追认的已知事实；
- `Revision R20 / asOf T11`：按照 R20 已合法确立的事实来源，死亡时间是 T10；但这**不代表 T11 的米拉当时就知道真相**；
- `Perspective 米拉 / observedAt T15`：只有她在 T15 收到合法消息并形成信念，才可在其认知历史中体现。

### 3.1 追溯揭露和真正 Retcon 不是一回事

1. **揭露以前已存在的事实**：某 NPC 在 T10 之前就存在，但 T20 才被发现；`bornAt` / `validFrom` 早于 `introducedAt` 和 `recordedRevision` 是合理的。需要来源与合法世界约束，不等于改写旧剧情。
2. **纠正先前记录的错误**：新证据表明之前客观状态认定错误。应有显式来源/更正记录，按版本查询旧观点和新确定事实，并审查受影响的派生后果，不能偷偷从旧版本删掉事实。
3. **真正改变已发生的过去**：作者明确授权改写历史或特殊的时间旅行机制，才可走单独高权限的世界效果/分支/依赖重算策略；普通 E1“自由补完”不能默许这种 Retcon。
4. **世界中真实的后续变化**：皇帝在 T10 死亡，T15 新皇继位，属于合法相继事件；旧皇在 T10 前的历史身份不会因为新皇登基而从资料中被全部删除。

**决定仍待 W13 选择**：针对“后来才有新证据证明之前有效”的通用查询，需要多大程度双时间支持；优先用现有 Revision + Clock + Event/History 计算，确有缺失再补最小有效区间/更正引用。不能为了架构名词引入新的 bitemporal database。

## 4. SavePoint、Branch 和身份证据的一致性

- 当前 SavePoint 锚定已经提交的 `sessionId + branchId + revisionId`；分叉点以前已存在的 Subject 可沿共同祖先继承稳定身份及已合法成立关系。
- 分叉后，A 支线的借款、死亡、情报、发言事件和认知基于 A 的 revision 演进，不得进入 B 的有效世界视图，尽管同一 Subject 的世界身份来自共同祖先。**身份共享祖先，不意味着状态同步**。
- 在 A 支线注册之后才出现的阿洛，不会因在 B 出现同名角色而自动成为 B 的已登记实体。Subject ID 的具体分配方式须在保留唯一 Origin/Revision 语义下确定；避免单纯 `branchId + name` 主键的误配。
- 事件若起源于父分支，读取子分支历史可以通过已确认祖先 Revision 继承，但不应重新“拷贝提交”以导致双重执行；后续事件与本支的 `Branch/Revision` 分离，具体事件 ID/Clock 约束待 E0。
- 已排队的 Task、LLM 提案、通信、HCM 计算结果必须保留捕获时的 `Session/Branch/Revision/Scope Epoch`。读档/切支后返回的旧结果应失效或重新按当前授权验证；不可让一条旧线的信件/秘密通过派生索引进入新的分支。
- 可重建投影和 HCM 索引对`branch, revision, audience` 精确分区/失效，不维护独立的 `global latest subject state`。当前已有 `rebindCognitionBranch`、源权限检查等机制，需 E0 核实其对新动态 Perspective 是否足够。

## 5. 可靠性与失败矩阵（讨论中的 E0/验收要求）

| 失败/并发场景 | 期望结果 |
| --- | --- |
| 同一 NPC 同时给两人出售唯一物品 | 只有一项符合最新前置条件的提交成功；另一项 CAS 冲突或有效业务拒绝，不能出售两次 |
| 通信断开但请求可能已提交 | 按相同 commitId/指纹查询原生 Receipt，再展示结果；避免盲目重试造成重复 Effects |
| 叙事生成已描述后果，但 Native 提交失败 | 禁止把该后果永久发表为已发生事实；返回拒绝/合法分支文本或重新提案 |
| Native 提交成功，但后续 HCM/Context 索引失败 | 世界事实仍然有效；派生索引标记失效并以已授权原生来源恢复，不二次改写真相 |
| 延迟 NPC Task 在读档后才完成 | 基于旧 revision 的候选不得投给新分支；必须重新获得权限/有效目标 |
| 新证据补写一个更早有效的事实 | 保留更正的 recorded revision、source 和此前 as-known 投影，不能默默污染不可达旧分支 |
| 某角色得知秘密，另一角色未得知 | World Truth 能内部结算，但第二角色的 Context/HCM 不能读取秘密；角色可持有未核实传闻 |
| 长跨度游戏时间推演预算用尽 | 未结算的关键后果必须保持待决/解释性状态或明确中断；不能伪造全部 NPC 已完成推演 |

不为这些场景创建独立的兼容 Saga/事件数据库；要在信任边界和现有 Native publication/recovery 接口上解决已实际发生的风险。

## 6. 2026-10-17 main 静态证据（仅部分 E0，不是端到端验收）

- [SessionRepo](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/repositories/session-repo.js)：`commitSnapshot` 在 `withTransaction` 内校验 `expectedRevisionId`、Commit Receipt/fingerprint 与 immutable Session Revision/State/Timeline 资源；Session root 是最终提交标记，同一请求重放可读取已提交结果。**这是可复用的持久化核心，不意味着所有外部消费者已经接线正确**。
- [SessionCore](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/session-core.js)：`_publishLocked` 可以在同一候选 revision 处理 State/Timeline、actionRequest 生成 receipts、校验 Cognition 与 History，最后调 `commitSnapshot`。实际每条外部入口是否把新 NPC 主体/对话/事实同步交给这条路径仍须逐调用方核验。
- [World Session reducer](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/experience/world/session.js)：当前 World Journal 事件生成的 `id` 以 branch 和 seq 为组成，并有 `branchId` 与 payload；`commitEvents` 通过 `commitStatePatch` 提交 World state + `atri_game_runtime` journal、检查 base revision。**该事件记录并未在本次静态审读中证明自带正式世界 valid-time/recorded-revision 通用查询契约**。
- [Native History](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/history-authority.js) + [Chronicle Host](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-chronicle-host.js)：已有特定 Lifecycle/History 的时间戳、事实转移/旧事实与来源；不能据此认定通用 World Subject 的 bitemporal `asOf` 已实现。
- [SavePointRepo](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/repositories/save-point-repo.js) + [Session Snapshot](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/session-snapshot.js)：存档锚定 committed Branch/Revision，分支图验证 ancestry、forkRevision 与 Timeline 可达性；提供设计复用基础。
- [Cognition Authority](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/cognition-authority.js) / [HCM eligibility](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/eligibility.js)：认知证据/受众及恢复依赖原生 branch/revision；部分 ID 和静态 PackageActor 限制仍需 W11/W12 E0 全消费者审计。
- [Native Simulation](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/simulation-authority.js)：已有规范游戏时钟和有界任务调度；长跨度模拟与历史时态应复用，不能让所有动态 NPC 持续在线处理每个 Tick。

**未完成**：Native Orchestration V3 的当前 Plan/Run/Effect/Receipt/Projection 正式消费路径、SessionCore 生成/叙事与 World reducer 提交时序、所有 Event 入口及存档 branch 切换、新旧时态字段和查询、UI/Studio/Play 与 Windows/CachyOS/Termux 真机的验证。此处的静态代码证据仅为 W13 方案研究，不宣称 E0 已完成。

## 7. W13 三路线（待用户选择）

**W13-A · Snapshot-first + 松散事件记录**：以已提交 Revision 的现有状态快照为主，历史随手追加人类可读摘要而不建立明确的事实/主体/因果有效期语义；开发改动相对小，适合只需要“当前发生了什么”的简单 RP，但难保证已消失关系、离屏事件、历史认知与分支回放的精确可解释性。

**W13-B · Native Revision 一致性提交 + 双时间/分支受控投影（推荐）**：把持续性效果、主体接纳和有权参与者在现有 Native 单 Session 提交边界内结算；事件保留原因/来源与游戏时间，Revision/Receipt 保留录入修订；按 `branch/revision/game tick/audience` 投影当前/历史事实和合法认知。HCM/Context 作为可恢复派生消费者。补充现有接口真正缺失的最小字段/查询，不要求写入第二 Event Store 或所有叙事细节结构化。

**W13-C · 平行 Event Sourcing 引擎 + 最终异步同步**：建立独立世界 EventStore/Temporal DB，把它和 Native Session 当前状态通过异步同步对齐；可以提供丰富查询和通用日志，但生成平行权威、事务二写、回档同步/GC/故障窗口和多端资源成本，不符合已确认 W12-B。

**当前仅推荐 W13-B，用户尚未选择。** W13-B 的“强一致”不能理解为跨任意外部服务、视觉文件、HCM 检索索引和所有模型调用一起实现数据库事务：这些外部产物可有派生/恢复阶段，但不能在正式世界效果与叙事事实之间留下无法解释的矛盾。

## 8. 下一步与正式 E0 Gate 的衔接

- W13 选型确认后，再细化 **Native Event Envelope / State Effect / Subject admission / Participant receipt** 的最小契约，明确哪个调用点必须通过现有 `SessionCore._publishLocked` 或等价权威发布。
- 明确通常“玩家回档+支线历史”和非常规“追溯纠错/时空穿越”的语义差别、历史事实的终止/继承，以及 `as-known-at` 的信息可见性。
- 逐个证明合法的目标上下文与 UI 能够基于同一受控 `branch/revision/tick/audience` 获取事实，World 原始设定不应在历史失效后仍当当前状态自动注入。
- 随后转向 Library / Studio / Play **原生 World/Knowledge Effective View 与 Inspector 的产品交互**，以及最终 E0 全消费者硬切、阶段门槛和真实三端验收计划。当前仍无全量代码审计或实现授权。
- 此轮只修改 `docs` 的同一 Plan Bundle / 唯一 Record；完整 ARCH-DWE-01 企划保持 Draft，等待用户明确选择 W13 方向。

## 9. W13-B 用户确认（2026-10-17）

用户对上一轮明确推荐的 **W13-B「Native Revision 一致性提交 + 双时间/分支受控投影」**回复「认同」，将此方案**顶层架构方向**纳入已确认 W1-B～W13-B。其关键语义为：

- 长期有效的 Subject 接纳、正式世界效果/关系/事件、确需一致的参与者身份优先在现有单 Native Session/Revision 的受控发布/Receipt/CAS 边界协调，不新建平行的可写 EventStore 或 Temporal DB；`HCM`/Context 派生可以后续构建，但不构成第二份世界真相。
- 区分**客观生效的游戏时间及其有效区间**、**正式写入的 Revision/提交证据**、**各主体的合法观察/认知时间**；按 `Session/Branch/Revision/GameTick/Audience` 获得合法当前、历史及 as-known 视图。历史揭露、事实纠错和真正改写过去分别受规则/来源与权限约束。
- 分叉点前正式存在的主体及已提交事实可沿合法祖先继承，分叉后的状态、认知/秘密和事件/延迟模型结果独立；旧 revision 结果不能在切档后以最新状态名义提交。
- 事件候选和描述性文本不是已发生世界效果；Model/Orchestration 只能提案，必须以受控 Native 结果为准。对“成功与否未知”的提交应优先查已有 Receipt，而不是盲目重放副作用。
- **强一致的边界不覆盖任意外部媒体/LLM/检索服务的数据库事务**；外部 HCM/索引或视觉资源可以是可恢复的派生内容，但成功提交的世界后果与其实际叙事承认不可长期矛盾。

**尚未获批准**：Event/Fact 的确切 Schema/ID/valid-time 字段、所有 Narrator/Task/World/Cognition 的端到端单修订发布范围、统一历史查询 API、历史纠错事务/Retcon 依赖、真实 E0 全消费者验收、跨平台实测和产品实现启动。

**W14 下一轮**：详见同一 Plan Bundle 的 [effective-world-view.md](effective-world-view.md)，深入讨论固定 World/Knowledge 与当前 Native 世界事实的**有效视图、Source Claim 的适用性、Context Compiler 的冲突过滤和 Library/Studio/Play 交互**。本阶段推荐 W14-B，仅为候选、**尚未获用户确认**。完整 Plan 保持 Draft。
