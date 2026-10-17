# ARCH-DWE-01 · W15 E0 架构收口审查：权威、消费者、接口、清退与验收（讨论草案）

- **唯一企划**：[index.md](index.md) · [累计设计](design.md) · [W14 已确认 Effective View](effective-world-view.md) · [W12 消费者审查基础](e0-consumer-cutover.md) · [唯一 Record](../../../records/architecture/world-evolution-consistency.md)
- Task ID：`ARCH-DWE-01`；Primary Workspace：`docs`。
- **当前状态**：Draft；**W1-B～W15-B 顶层方向均已获用户确认**，其中 W15-B 确认“证据门槛式 E0 收口 + 可执行交接清单”的**审查方法**，**不是 E0 已完成/Approved**。实际 Contracts、工程实施授权、跨端测试/CI、最终定稿仍待验收；选型历史见 §6，最新用户决议见 §8。
- **本次实际工作**：基于远端 `main` 当前可读取文件的选择性静态审查与 GitHub 代码搜索构造 E0 Consumer/Authority Map 的初始证据。搜索结果有 `topn` 限制、按文件匹配而非完整调用图；多次读取未固定同一个 main commit SHA，因此只能视为**部分 E0 探针**，不能宣称完整仓库遍历、所有活入口已辨认、运行时实测通过。
- **W15 核心问题**：怎样将十四轮方向性选型落实成有明确“原代码位置 → 正确权威 → 最小目标契约 → 真实消费者切线 → 清退旧路径 → 通过证据”的收口 Gate，而不让 E0 变成无边界研究或仓促宣布可以开工？

## 1. W1–W14 共用的不可妥协不变量

1. **唯一世界真相**：已发生客观世界事实、Session Subject、正式关系/效果、Revision/事件在现有 Native Session/Host Authority 中合法提交。Memory/HCM/Knowledge/Prompt 是受众和来源相关的数据/证据/投影，不能写入第二份可变 World Truth。
2. **作者源不可被 Play 覆盖**：World/Knowledge/Actor Profile 固定在明确版本，实例化由 Session Native State 表达；高约束世界法则受独立权限保护，动态可变事实按正式状态演化。
3. **类型而非大一统 Actor**：World Subject、Source/Definition、Actor Profile、合法 Perspective/Capability、实际已发生 Participant/Effect、Lifetime/HCM LocalRef 不混为一谈；正式身份映射基于证据，不靠名字或 LLM 猜测直接写实情。
4. **双时间与分支**：游戏事实的 `validAt/validUntil` 与被接受的 Revision/Receipt、NPC 的 `observedAt` 各自有意义；查询必须受 Session/Branch/Revision/Tick/受众权限限制。
5. **有效视图优先**：W14-B 确定“Effective World View First + Claim/Source-Aware Context”；保留自由文本但禁止未过期校验的作者初始声明或传闻在 Prompt 中冒充当前事实。文本的 source 权威 rank ≠ 语义真假。
6. **成本与最低精度**：不是所有名词都要注册、所有 NPC 每回合都需要 Agent；有界 Simulation/Context/Memory 更新，避免在 Windows/CachyOS/Android Termux 上推理预算失控。
7. **真实 Dev 原生硬切**：现役消费者尽量一次性切换到目标权威；不为尚未发布的旧格式默认保留双轨、Shadow Registry、互相同步的旧/新状态。**但不能在未证实调用方和产品功能状态前批量删除代码或破坏插件/运行时真实接口**。

## 2. E0 Authority / Producer / Consumer / Target / Deletion 矩阵（静态发现，未完整）

| Lane | 已观察代码位置及事实 | 正式 Owner 与最小目标语义 | Consumer 改动/旧路径清退待核实 |
| --- | --- | --- | --- |
| 固定 World/Knowledge | `src/native/world-knowledge.js`：WorldRevision `schema/baseline/knowledgeBindingIds`，KnowledgeEntry 包含自由文本与发现/状态条件 | **Authoring World/Knowledge Revision** 为固定创作源，Native Runtime 只引用版本与实例化起点 | `world-editor.js`、Library Workspace、Studio World/Knowledge/EntryPoint、Package build/dependency closure；不可从 Play 覆写作者 Revision |
| Session World & Subject | `src/native/session-core.js` 初始 `atri_world_state`，`public/scripts/native/experience/world/session.js` 的 reducer world/events patch | **SessionCore/Revision** 为正式世界身份、世界状态及事件提交 Owner；候选最小 Canonical Subject/Fact/Origin Ref | 真实 Session Worldless/multi-World/Package Actor 与 State Schema 更新、旧“名字即身份”路径；不能给所有静态文案建实体 |
| 发布/Receipt/一致性 | `src/native/repositories/session-repo.js` `commitSnapshot`：transaction、`expectedRevisionId`、commit Receipt/fingerprint、immutable resources 和 Session root publication | **单 Native Host** 原生提交；有长期后果的 Subject + Effect + 参与者 + 正式可查询事件必须能从同一或合法可协调的 Revision/Receipt 溯源 | `SessionCore._publishLocked`、Authority Turn、Task/Simulation 与 game world reducer 的完整原子发布顺序、失败时叙事撤回/改写，不能用 HCM 文本当 Receipt |
| 历史与 Save/Branch | `save-point-repo.js` 锚定 Branch/Revision，`session-snapshot.js` 验证分叉祖先；`history-authority.js` 有专用 Tick/Fact，`native-chronicle-host.js` 有特定 Lifetime/History | **Session revision ancestry + 原生 game clock/history**；按 `asOfRevision + asOfTick` 及受众派生状态/历史 | 未发现已完成的通用 World Subject 双时间 Fact Query；应先验证可重用数据，必要时最小扩充，不能建第二 Temporal DB |
| Authored Actor 与真实参与者 | `public/shared/native-actor-profile.js` 固定只读 Manifest/EntryPoint；`SessionCore._newEntry` 限定 Timeline `actorId` 属 Manifest | **SubjectRef / ParticipantRef / ExpressionRef** 的逻辑区分，最终具体字段待 E0 | `public/shared/native-frontend-host.js` MESSAGE_SCHEMA、`session-projection.js` committed fingerprint、Play 的 `actorId` 显示名、Speech/Visual 的 template/identity，禁止盲目全局替换所有 `actorId` |
| Information/Perspective | `native-information-contract.js` `assertInformationClosure` actor 属 Manifest；`native-information-runtime.js` 未声明 Actor unavailable；`cognition-authority.js`/ToM 部分限制 manifest Actor | **Host 受控动态 Perspective**，合法 Source/Scope/Revision/Identity grants，主观信念不是客观关系 | Cognition/ToM、Goal、HCM、Task、用户 UI 的信息授权，特别是动态 NPC 和秘密真身；不可用 Narrator 全视角偷渡 |
| HCM/Memory | `public/scripts/agents/memory/eligibility.js` 使用已选 Information 投影与精确时间线源；`temporal-graph.js` 图谱独立 Entity/合并/未决 | **授权的 Episode/证据图/个人回忆**，来源追踪和索引，不是正式 Native Entity 注册 | 将合法事实引用映射到 HCM 节点并处理 branch/source invalidation、HCM pending/disputed；索引失败可恢复，不应撤销已提交世界状态 |
| Knowledge 选择与冲突 | `knowledge-runtime.js` authority ranks 900/800/700/600/500/400/300/200、显式 state conditions/exclusiveGroup；`knowledge-selection.js` 关键词/Regex/relations/tokens | **Knowledge Source + Claim Applicability**；重要可变事实必须经受控 Fact/Subject/Time 对齐 | `knowledge-prompt-channels.js` 当前存在旧 `worldInfo*` 输出字段但检索未证明真实生产消费；旧 WI 选择/拼 Prompt 路径需辨明是否 live、是否仅兼容壳 |
| Context/Model Prompt | `context-compiler.js` `currentStateItems` 直接打包 `atri_world_state` 和近期事件，Knowledge 条目正文与 rank 独立编入 Context；`src/native/model-prompt-runtime/prompt-compiler.js` 有来源使用 policy | **Effective World View** 作为合法事实来源；先 Source/受众/时态裁剪再关联检索与 token 排序 | Native Context、Generation Host、Prompt Compiler、Provider Wire 和旧 worldInfo/Orchestrator capsule 注入顺序；高 rank 不能自动修复有矛盾的自由文本 |
| Runtime Agent/Simulation | `src/native/simulation-authority.js` 原生游戏时钟、有界调度，`goal-contracts.js` 的 actor goal 与 `life.person.*` 均是领域引用 | **有界事件驱动行为 + typed domain bindings**，正式行动效果回 Native Host | Task/Goal/Lifetime/NPC/Orchestration 消费链，不能每新增 NPC 固定开常驻 Agent/Job；与 Native Orchestration V3 当前实际 HEAD、Effect/Receipt 接线需复核 |
| Visual/Speech | `speech-service.js` 验证 `entry.actorId`/expression，`visual-continuity.js` 处理 manifest Actor 和 provisional IDs | **媒体素材/呈现** 属对应 Media owner，现实 Subject 身份通过可见来源映射 | 生成/播放/Inspector 的别名、秘密真身、分支/版本；不能把视觉猜测当作世界状态 |
| Library/Studio/Play/Frontend | `world-editor.js`、`studio-worlds-editor.js`、`studio-entrypoints-editor.js`、`studio-workspace.js`，`play-product.js` 的 Speaker 显示依 Manifest Actor，`native-frontend-host.js` world view 偏 Lifetime | **作者固定资产、装配预览、实际 Session Effective 投影** 三个职责，UI 不拥有世界事实 | Author→Effective Preview、Status/History/Source/Diff Inspector、Play 受众视角、左中右三栏/移动抽屉、UI/Host ABI 调整需先审 Frontend v3 实际使用链 |
| Legacy ST/Orchestrator | `public/scripts/atri-world-info-selection.js`、`atri-world-info-prompt.js`、`agents/orchestrator/capsule-injection.js`、`legacy-runtime-adapter.js` 仍在 main；`knowledge-prompt-channels.js` 返回 `worldInfo*` 字段 | **不是新的 Native Truth Authority**；先判定是否当前活跃生成/编排消费者、插件所需公开 API 或仅过渡/测试入口 | 静态搜索发现 `runLegacySingleRequest` 被部分生产旧编排模块引用；但其他工具函数搜索仅匹配定义+tests，**不能据此证明全部旧模块都活跃，也不能未审就全删**。确定留存产品能力与旧权限双轨边界 |

**具体应删清单尚未获足够证据**。最终 E0 需要对上表各行增加 `entrypoint → caller → callee → owner → state/resource → tests` 的真实路径与分类：`retain`（合法业务/作者资产）、`replace`（旧权威调用）、`delete`（确定死代码/过时兼容）、`investigate`（尚不能判断）。不能把“找到了含 actorId 的文件”直接视为已完成 cutover map。

## 3. E0 阻塞清单（全部为尚未解决，非通过项）

| ID | 必须拿到的证据 / 合同 | 阻塞原因 |
| --- | --- | --- |
| **E0-01 Subject 与 Fact Contract** | 经真实读取验证的 Subject/Definition/Participant/Perspective/FactKey、scope、Origin/Revision、Clock、业务领域 ID 映射的最小目标类型 | 当前没有通用 Subject+Fact 有效区间的闭合接口证明；只确认概念，未确认具体 Schema |
| **E0-02 Native Publish/Recovery** | 所有入口对 Subject admission、Action/Effect、Timeline 参与者、事务状态/Receipt 及必要叙事的一致化/重试/失败路径调用图 | SessionRepo 核心提交存在，但不能据此证明所有旧路径/异步模型结果与世界效果都原子一致 |
| **E0-03 Temporal & Branch Semantics** | Valid-time、as-recorded、as-known-at、纠错/Retcon、SavePoint/Branch/Replay/GC 的精确读写与前置条件 | 现有特定域有 History/Tick，通用 World Subject 查询和跨域纠错未通过证明 |
| **E0-04 Security/Information Perspective** | 动态 Actor/Subject 的最小 CapabilityGrant、source eligibility、可见身份、HCM/ToM 与 Context 访问控制逐出口测试 | Static Manifest Actor 与动态 NPC 未闭合；Full Narrator、伪装/同名、旧分支索引均可能成为越权通路 |
| **E0-05 Claim-aware Context** | Knowledge Entry/自由 Source 的重要可变事实关联/失效、Context/Prompt Compiler 的 current vs historical/background/rumour 实际行为、Token 必需约束 | 现有 rank/关键词/State Conditions 非任意自由文本语义失效引擎；可能让旧皇帝依旧“在位” |
| **E0-06 Full Consumer + Deletion Map** | 固定 main commit + 所有生产 caller、公开 ABI、测试引用/文档及 old→target→delete 分类；与同时进行的 Orchestration V3 HEAD 比对 | 本轮只做远端单文件读取和有上限的 GitHub 搜索，尚无完整跨文件 call graph 与真实运行 entrypoint |
| **E0-07 Library/Studio/Play/Frontend** | Authored/Eff/Provider context 预览、World Model/Source 创作、Inspector、受众过滤和端上 UI 行为的目标 ABI/场景录屏/验收 | 现有 World JSON/Studio 入口不等于新模型 UI，Play actor 显示仍引用 manifest，不能仅做后端 |
| **E0-08 Longevity/Load/Persistence** | 数千回合、上百冷态 NPC、预算/模拟追赶、Snapshot/Delta/GC、单 Revision Receipt 以及长时间不掉档的可复现压力证据 | 当前仅源审阅；没有跑 Bench、Node tests、DB 持久化损坏/恢复场景 |
| **E0-09 端与跨企划协同** | Windows/CachyOS/Termux、Native Orchestration V3、Prompt Preset/Visual/Media 与独立前端重构的实际当前接口和归属 | 没有全端/当前活动任务 HEAD 证据；不能擅自将其它企划已准备或将被实现的能力当成现有已完成接口 |

E0 是**设计交接前的证据与收口门槛**，不是要求现在立即执行产品变更。审查失败须标注 owner/真实缺口/合理后续方案；不能把没有证据的部分简单填为“已完成”。

## 4. 最小接口/数据流契约必须达成什么不变量

```text
Authoring: fixed WorldRevision / KnowledgeRevision / ActorProfile
        |
Runtime: Native Session (branch, revision, clock, scope)
        |
   Subject admission / ActorProfile mapping / Participant event
        |
  Native Authority validation -> candidate World Effect and Receipt
        |
      single coherent Session revision publication
        |
 Host Effective World View (current/historical/law/claim, exact audience)
        |
  +--------------+----------------+-------------------+
  |              |                |                   |
Context/Prompt  Information/HCM  Library/Studio      Play/Media
                private views    authored preview   legal state view
```

- **唯一写入**：Subject/正式关系/State/事件经 Native Authority/Commit；HCM Evidence、Knowledge 文献、Visual 凭据不直接发表新的世界事实。多入口不得把同一件事各自提交。
- **精确读取**：所有参与方都使用当前合法的 Session/Branch/Revision/Clock + Source/Scope/Actor Permission，查询“过去 T10”还需在 Revision 的 as-known 语义内，不得向 NPC 暗透未来秘密。
- **冲突防线**：Hard Law 由正式规则验证；Initial fact 失效靠事件有效期/证据，Source Claim/误信不升级为 Truth；无合法 FactKey 的普通自由文字不能自动声称是当前权威。
- **发表门槛**：叙事可提议、草稿可渲染，但对玩家/世界正式承认持续后果时需以已提交结果为据；失败/未知提交必须可查询 Receipt、按现有事件/版本机制恢复，不暗中“脑补已成功”。
- **复用/删除**：优先用 SessionRepo/SessionCore/Information/Cognition/Memory/Simulation/Context 与现有 Frontend Host；已确定过时的旧 Actor-only/世界书 Prompt 写入按实际消费者硬切，且不丢现役插件功能。
- **无冗余抽象**：不要求给每个实体建独立 Agent、每条文学句子结构化或为假设问题新增层层保护与测试；原生事务、私密信息、持久化和外部副作用边界继续严守。

## 5. 工程工作包与可观察验收门槛（未来计划，不是授权）

| 依赖顺序 | 工作包 | 明确的完成证据 |
| --- | --- | --- |
| **Gate 0** | 固定源码 HEAD，完成真实生产入口、World/Knowledge/Actor/HCM/Native/Orchestration/Prompt/Media/Studio/Play 的 `old owner → consumer → target → delete` 对照；收敛 E0-01～09 | 每个阻塞项有证据链接、明确的解决方案/接口所有者、测试或人工验证计划，不能以“估计已接通”通过 |
| **Gate 1** | Native Subject/Fact/Temporal/Capability **最小契约**与 Session 原子发布/恢复；既有 world/session/runtime 入口正确读写同一 Revision | 真实提交/拒绝/未知结果恢复、时态/分支的关键 Node 单测/持久化验证，保留来源与 CAS |
| **Gate 2** | Consumer hard cutover：Actor/Participant、Information/Cognition/HCM、Knowledge/Context/Orchestration、Goal/Simulation、Visual/Speech/Host ABI，并清退确认多余的旧路径 | 完整生产调用方可按明确的新合同工作；无双写；秘密/分支/人格/Context 输出实测正确 |
| **Gate 3** | Library/Studio/Play 原生 World Model / Claim 绑定与 Effective World View + Inspector；保留自由文本 + 受众限定的 Author→Effective Diff | 真 UI 的创作/游戏两条链可操作，移动/桌面信息密度和实体/事件/历史/角色可见性正确 |
| **Gate 4** | 长会话性能、持久化可靠性、三端权限/显示/推演/存档验收，正式 Record 与清退收尾 | 有版本、平台、运行步骤、测试/CI、真实截图/日志和失效/恢复结果，不口头认定通过 |

工作包按**依赖**分段，不能把每次阶段完成当作强制停止；同一正式任务临时开发分支内完成后再合并，遵守届时项目 GitHub Governance。此刻未创建实现分支，未运行任何 CI 或 UI/真机。

## 6. W15 决策选项（未获得用户确认）

**W15-A · 方向已足够，立即 Final 与实施**：把 W1～W14 的路线选择等同实际 E0 已完成，直接编排开发并以测试查漏。风险：公开 ABI/Native Orchestration/Token 来源链和权限、事务时态及 Studio/Play 的真实调用尚缺证据；容易留旧双轨和重大持久化故障。

**W15-B · 证据门槛式 E0 收口 + 可执行交接清单（推荐，尚待批准）**：将全部剩余 E0-01～09 视为需要明确证据的关卡，不凭空填写完成。下一步先对锁定的 `main` 与相关活动分支全量真实消费者审查，完成 Owner/Contract/Consumer/Deletion 表和必要的接口决策；再把方案收敛为有依赖、强验收、无旧数据兼容双轨的实施计划。仅在用户明确批准整份方案后才标记 Approved/启动代码分支。此路线**不要求用户每阶段重复回答已解决的普通工程决策**。

**W15-C · 延续纯抽象讨论，不设置明确 E0 退出门槛**：可以继续细化概念，但无法知道何时可以开始且会不断扩展 Plan；不推荐。

**推荐 W15-B，但用户本轮只批准了 W14-B，不能提前把 W15-B 写为已确认**。E0 当前状态必须维持 **PARTIAL / BLOCKED**，这与未来拟采用 E0 收口方法并不冲突。

## 7. 当前可交付与下一步

- 可交付：W1–W14 已确认的架构路线、部分 main 静态文件和搜索证据、目标 Owner/Consumer/Deletion 审查矩阵、E0-01～09 明确阻塞与 Gates 0～4 的未来验收轮廓。
- 仍缺：锁定完整 HEAD 下的全量调用图、Native Orchestration V3 实际活跃路径及变化、所有合法动态 Perspective 与 Actor/Talk/media 消费者的最终接口、通用事实/时态与 Source Claim 绑定的可执行合同、E0 功能/性能/安全/三端证据，以及用户对最终企划定稿的明确授权。
- 若用户确认 W15-B，下一轮应继续先更新同一 Plan + Record，然后按 E0-01～09 优先级逐项完成**正式开发交接前的真实代码审计和最后 API/阶段计划冻结**；若外部代码现状在审查时已经变化，需重新核实，而非机械沿用本轮 main 静态摘录。
- 整体仍 Draft，未来才能标记 Approved；只修改 `docs`，不修改产品实现。


## 8. W15-B 用户确认（2026-10-17）

用户对上一轮明确推荐的 **W15-B「证据门槛式 E0 收口 + 可执行交接清单」**回复“认同”。因此 W15-B 已获用户确认，属于 ARCH-DWE-01 的**收口方法与工作目标**；并未代表 E0-01～09 任何一个阻塞自动通过。

- 完整 E0 将以**固定代码 SHA**下的真实现役生产调用图为依据，逐项明确 `Owner / Producer / Consumer / Source / Target / Replace / Delete / Tests`；对保留兼容或插件接口必须有真实使用证据，不因名称包含 `legacy` 就一概删除。
- 对旧 Actor/Knowledge/World Info、Native Host Session、Orchestration V3、Prompt Preset、Visual/Speech、HCM/Simulation/Studio/Play 的**活跃分支**必须检查，不能以旧 `main` 的消费图替代未合并分支即将引入的真实接口。
- 只在**已核实的 Authority**内确定最小 Subject/Fact/Temporal/Capability/Effective View 合同；新合约要符合单 Host/Session 提交、来源/受众控制及无长期双轨的已选设计，不能提前虚构存在接口或证明通过。
- 审查结果应形成**可执行交接前置清单**，阻塞项标记 `OPEN / NEEDS_HEAD_RECHECK / REQUIRES_RUNTIME_EVIDENCE` 等清楚状态，只有证据符合退出门槛时才允许填写通过。
- 未授权新建产品实现分支、修改 `main` 或启动开发；继续在 `docs` 同一份方案和唯一 Record 累积 Stage。
- E0 仍然 **PARTIAL / BLOCKED**，没有任何 CI、真实 UI、Windows/CachyOS/Android Termux 端到端验证被本轮执行。

**下一阶段 W16**：详见同一 Plan 的 [e0-integration-readiness.md](e0-integration-readiness.md)；以已锁定的 `main` 和活动分支 SHA 核实 Orchestration V3/Prompt Preset 与 World/Knowledge 的接口耦合和合并依赖，列缺失的生产消费者、按能力归属的目标契约、删除/保留判据与正式创建开发分支前置门槛。当前 W16 的路线选项尚未获用户批准，完整 Plan 仍 **Draft**。
