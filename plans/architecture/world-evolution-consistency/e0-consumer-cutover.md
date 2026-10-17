# ARCH-DWE-01 · W12 接口级 E0 消费者审计、事务一致性与原生切换策略（讨论草案）

- **任务与路由**：`ARCH-DWE-01` · `docs`；[唯一 Plan](index.md) · [设计主文](design.md) · [W11 类型化身份](subject-contracts-e0.md) · [唯一 Record](../../../records/architecture/world-evolution-consistency.md)。
- **审批状态**：**Draft**。W1-B 至 W12-B 的顶层方向均获用户确认，但**确切接口/Schema、E0 Completion、事件时态契约与开发启动仍未批准**。§7 保留当轮选项对比，正式选择见 §9；静态源码审阅不等于测试或正式 E0 验收。
- **当前问题**：如何把世界成员与动态 NPC 的身份、能力、事件和时态从“设计概念”落到 Atria 现有唯一 Native Session/Host 的实际消费者，既不变成“独立世界引擎 + 并行记忆库”，也不留下旧 Static Actor / ST lorebook 的长久兼容双轨？

## 1. 本轮遵循的已确认不变量

1. **单权威**：世界已发生事实、正式 Subject 身份及关系、事件、有效状态/Receipt 由原生 Native Session/Branch/Revision 持有；HCM/Knowledge/Prompt/Visual 只是经来源许可的证据、表示或派生投影，绝不双写另一套可变 Truth。
2. **固定源 + 活状态**：WorldRevision/Package/ActorProfile 负责作者声明、起始条件与表达模板；Play 只提交此会话的运行事实和认知/能力映射，不回写已固定 Package 或覆盖 Authored Canon。
3. **类型化区分**：Subject 是世界主体；Participant 是正式事件/对话参与者；Perspective/Capability 是视角和权限；ActorProfile 是可选表达来源；HCM Entity 可以仍属谣言/歧义候选。
4. **事件一致性**：只有具备已验证效果且获得 Native 提交证据的强一致事件才成为游戏后果；普通文学修辞/场景细节不强制建模。重大因果结果与发表的故事叙述不能永久相互矛盾。
5. **历史/分支**：已发生游戏事实的有效时间、提交时修订、主体何时获知/如何相信必须区分；Save/Branch 的历史可达性与权限严格限定检索/延迟任务，不能跨分支读“最新值”。
6. **按需成本**：动态涌现对象不意味着每人独立 Agent/Job；游戏时间有界推进与热/温/冷精度，遵循已授权的原生预算和实际性能验收。
7. **Dev 硬切**：可在充分验证后替换旧字段/消费者并清退旧权威，但不为了假设兼容增加长期双轨、双写、兜底链和一堆纯防御测试。不能牺牲 Native 真相、权限或持久化安全。

## 2. Source-of-Truth / Ownership Matrix（逻辑目标，非现存 ABI）

| 数据 / 作用 | 唯一权威与已有可复用持久化 | 允许的消费者/派生内容 | 严禁 |
| --- | --- | --- | --- |
| 作者世界法则/初始设定 | WorldRevision/Package/EntryPoint 固定来源 | 起点实例化、Studio、Context | Play 覆盖原始 Canon |
| Session 当前世界真相/关系/主体 | Native SessionCore/Revision + 正式 world state/事件 | Effective World View、检索索引、任务、UI | HCM 或 Prompt 独立修改 World |
| 正式效果及重复调用 | Native Authority 提交/Receipt/CAS/Session Repo | Timeline、历史、审计、失败解释 | 文字发表即当作 Commit；无 receipt 的直接状态写入 |
| 世界时间/历史 | 现有 canonical clock + Session Revision/History | as-of 有效事实和可见历史视图 | 用聊天楼层/墙钟替代故事时间 |
| 单方认知/意图/情绪 | 合法 Cognition/Information 状态和 Source basis，当前 Session 受控写入 | 角色私有 Context、关系行为 | 私人心理自动变成双方合同 |
| 见闻/来源/HCM Entity | Timeline/HCM Episode/Knowledge Source 及合法来源关联 | RAG、记忆查询、歧义身份候选 | 传闻节点自动升级成正式 Subject |
| 动态 Perspective/Actor 表达 | Native Host 权限解析（目标契约）+ 固定作者表达资料 | 受众限定的对话生成、语音/视觉 | 通过 actorId 模板获得全局 Narrator 记忆 |
| Scene/Media 视觉与声音 | Media/Visual/Speech 自有资产/引用 + Native Source anchors | UI/播放/生成 | 视觉表象反向写世界客观真相 |
| 游戏保存与分叉 | SessionRepo + SavePointRepo 的 branch/revision 锚点 | 正确复原世界/主体/认知/绑定 | 全局 mutable 最新实体状态串档 |

这一表说明**责任边界**，不是要求为每个格子新建 DB。若现存消费者对状态持有其它变更入口，E0 需列出并指定删除/迁移原则；不能只靠给旧接口套包装证明单权威。

## 3. 已定位的 E0 消费者证据（2026-10-17 main 静态阅读/搜索）

**此表是部分 Consumer Inventory，不能宣称所有调用方已列完或测试通过。**

| Lane | 可核验路径 | 静态事实与接线任务 |
| --- | --- | --- |
| Native ID / Schema | [`src/native/identity.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/identity.js)、[`src/native/contracts.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/contracts.js) | 存在 Actor/World/Session/Branch ID family；尚未确认独立 World Subject 合同；审计 Package/EntryPoint/Timeline 的所有 identity guard 与 ResourceKey |
| Session state publication | [`src/native/session-core.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/session-core.js)、[`src/native/repositories/session-repo.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/repositories/session-repo.js) | Session publication 使用版本校验；`commitSnapshot` 在资源事务内校验 expectedRevisionId/commitReceipt，先写 immutable dependencies 再以 Session root 作为 final marker。候选 Subject/Event/Timeline/Cognition 一致性应评估是否复用该单一发布路径 |
| Game world events | [`public/scripts/native/experience/world/session.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/experience/world/session.js)、[`src/native/task-authority.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/task-authority.js) | World reducer `commitEvents` 在当前模式中将 `atri_world_state` 与 `atri_game_runtime` journal 经 `commitStatePatch`、expectedRevisionId 提交；现成 action receipt/idempotency 路径但不证明所有叙事/Task 永远处于同一个原子提交 |
| Conversation / speaker | [`src/native/session-core.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/session-core.js)、[`public/shared/native-frontend-host.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-frontend-host.js)、[`public/scripts/native/session-projection.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/session-projection.js) | Timeline `actorId` 受 `manifest.actors` 限制，前端 MESSAGE_SCHEMA / committed fingerprint 同时消费此字段。要核对目标 Participant 真正表示“发言事件的主体”还是“表达模板”，以及作者声线/模型输出如何映射 |
| Information closure | [`public/shared/native-information-contract.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-information-contract.js)、[`public/shared/native-information-runtime.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-information-runtime.js) | `assertInformationClosure` 将 `informationRuntime.actors` 绑定到 Manifest Actor；未声明 actor 不可用。动态 Perspective 必须在 Host 权威中获得受限 Source grants，不得简单运行时更改固定 manifest |
| Cognition/Memory/HCM | [`src/native/cognition-authority.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/cognition-authority.js)、[`src/native/tom-authority.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/tom-authority.js)、[`public/scripts/agents/memory/eligibility.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/eligibility.js) | 部分 `relationship` 与 Perspective 目标要求 manifest Actor，HCM 来源权限沿精确 branch/revision/view 过滤。E0 需要证明合法动态 Subject 的个人 Memory/ToM/Task 不会越权 |
| Context / Native Orchestration | [`public/scripts/native/context-compiler.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/context-compiler.js)、[`src/native/adapters/generation-host.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/adapters/generation-host.js)、[`src/native/authority-turn.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/authority-turn.js) | Context Compiler 定义 budget lanes 且读取 Actor Profile/World/Information；Native turn authority/Task/Receipt 的实际入口需要按当前 Orchestration V3 Plan/Run/Effect/Receipt/Projection 进一步逐一核对，不能复用过时的旧 Orchestrator 说明 |
| Game clock / historical views | [`src/native/simulation-authority.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/simulation-authority.js)、[`public/shared/native-chronicle-host.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-chronicle-host.js)、[`src/native/state-delta.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/state-delta.js) | 原生 simulation 有 canonical clock/step/budget；Chronicle 能查询某些现有事实/事件并显示时间，World State 有 snapshot/delta。尚未证明**通用** Subject Fact 的 valid-time/as-of 双时态查询已支持，不能写成已实现 |
| Save/Branch/Retention | [`src/native/repositories/save-point-repo.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/repositories/save-point-repo.js)、[`src/native/repositories/session-repo.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/repositories/session-repo.js) | SavePoint 锚定已提交 Branch/Revision；历史祖先/restore 的真实映射与主角知情 Source 权限需作为 W12 E0 验收问题 |
| Lifetime/Goals | [`src/native/lifetime-authority.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/lifetime-authority.js)、[`src/native/agent-intelligence/goal-contracts.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/agent-intelligence/goal-contracts.js) | 当前 Lifetime 使用 `life.person.*` 域内身份，Goals actor 主体使用 Native Actor ID。确立 Subject→LocalRef 的类型化映射，不直接复写领域标识 |
| Visual/Speech/Presentation | [`src/native/visual-continuity.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/visual-continuity.js)、[`src/native/speech-service.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/speech-service.js) | Speech 验证 entry.actorId 与 Expression Actor 一致；Visual 兼有 manifest Actor 与 provisional identity。需控制表象 ID 与世界身份归一、秘密 alias、分支可达性和受众显示 |
| Library/Studio authors | [`public/scripts/native/world-editor.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/world-editor.js)、[`public/scripts/native/studio-worlds-editor.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/studio-worlds-editor.js)、[`public/scripts/native/studio-entrypoints-editor.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/studio-entrypoints-editor.js) | World 编辑器目前有 `schema/baseline/knowledgeBindingIds/assetIds/metadata` 编辑与 Studio World Source 约束；重构后的 World Entity / Actor Binding、自由文本与有效预览须与作者工作流协调，不要仅做后台 Schema 后逼用户手工写 ID |
| Native Frontend/Play | [`public/shared/native-frontend-host.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-frontend-host.js)、[`src/native/frontend/host-services.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/frontend/host-services.js) | `host.world.view` 当前输入是有限的 `people/identity/regions/institutions/places/...` 分类，且 [ChronicleHost](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-chronicle-host.js) 的部分世界视图依 Lifetime；不能假定它已经是通用 Effective World View 或动态实体检视面板 |

**E0 未验证**：上列每条路径的所有调用方、依赖方向、代码存在但未接线/已停用的入口、正确测试与 UI 行为、三端实测及正在重构的其它企划实际 HEAD；只作 source-census 起点，不能标记审查完成。

## 4. 事实提交、发表与修订一致性（W12 候选约束）

一个涉及动态 NPC 的持续事件，例如“玩家向阿洛赊账，阿洛承诺七日内不收利息”：

```text
User/AI/NPC proposes story action
   -> Native Host interprets typed intention
   -> validate Subject existence/admission, actor/participant grants,
      branch & expectedRevision, game time, item/currency/contract rules
   -> prepare (subject admission? + debt facts + relation + event + receipt)
   -> native coherent publication
   -> effective world view / narrator text / authorized actor observations
   -> HCM indexing and context cache refresh from legal committed sources
```

- 应优先复用 `SessionRepo.commitSnapshot` 已有 immutable dependencies → expectedRevision CAS → final Session root commit marker + idempotency/receipt 路径，而不是为每个新事实另造全局记账 DB。
- `public/scripts/native/experience/world/session.js` 存在单次 World State + Game Runtime journal state patch；但 **Action-specific commit、Authority Task prepare 和 Narrative publication 的真实原子路径仍需 E0 验证**，不把“看到了 `commitStatePatch`”等同“所有跨域后果已经原子化”。
- 描述性文本可以不逐句结构化。会影响未来可演化状态的事实必须在发表为已发生重大后果前获得受控提交或以合法任务候选明确“尚未发生”；若提交失败，不应隐蔽留存世界已经改变的假叙事。
- 多个主体的债务/位置/任务变更应保证同一次正式提交的前置条件完整；模型输出只能提出需要审查的 `Effect`，不能直接改动 private memory 或 World State。
- 延迟任务/离屏模拟必须基于 `Session/Branch/Revision` 锚点和既有 idempotency/receipt，防旧分支返写新分支；不要增加多层无证据的重试、fallback 或防御性包装。

## 5. 有效时间/记录时间与历史可查性：显式阻塞

| 询问 | 所需时间概念 | 不可替代为 |
| --- | --- | --- |
| T10 皇帝实际何时死去？ | `validAt` / game-time 或区间 `[from, until)` | `Revision` 的墙钟提交时间 |
| T12 米拉何时首次得知？ | `observedAt`，参与人合法可见来源 | `validAt`（事实发生时间） |
| Atria 何时正式确立/纠错？ | `committedRevisionId` + receipt / provenance | “这次 AI 文本里说过” |
| 某分支在 T11 当时认为怎样？ | exact Branch/Revision + valid/knowledge time | `global current state` |
| 玩家回档前的 Subject 是否已经存在？ | 祖先 Revision 是否已完成 admission | 某条别的分支后来存在的同名 NPC |

不是要求每条私有记忆都物理冗余存三个时间戳。可以基于原生 event/clock/revision 与 HCM SourceRef 求出所需视图；但必须经过 E0 证明确切生效/纠错语义与查询边界。如果后补了一个“过去实际发生”的新事实，须区分作者修订、信息揭露和真正的**追溯生效改写**，不能偷偷重写其它分支或自动欺骗历史查询。

## 6. 分阶段 Cutover 顺序（候选实施计划，不代表已授权开发）

建议按**权威/消费者依赖**而非按屏幕分类推进，并在同一临时任务分支分阶段完成，最终才合并 main：

1. **E0 完整消费者审计/契约冻结（Gate 0）**：静态源码 HEAD、真实运行入口、old→target field matrix、单权威读写、schema、隐私/时间/分支测试目标、跨端必测路径。任何实际未核实接口明确阻塞。
2. **Native identity/commit（Gate 1）**：确定 Subject/Participant/Capability 的最小身份与事件/回档规则，Native Host single commit；在入口确定真正的已完成事件，避免建立第二可写 Registry。
3. **生产消费者一次性换线（Gate 2）**：Timeline/Frontend/Context/Information/Cognition/HCM/Goals/Lifetime/Orchestration，调整它们的输入到受控身份投影；清退无现役用途旧 Actor-only assumptions、ST 兼容分叉和双投影写入。不能将语音/视觉或模型上下文留在旧身份暗线。
4. **Library/Studio/Play（Gate 3）**：更新世界/知识结构、角色绑定、动态 NPC inspector、场景状态与秘密权限、端上视图；保留自由文本一等创作和可解释的来源/状态/有效投影差异。
5. **性能/安全/三端（Gate 4）**：跨 Save/Branch、数千回合、百余冷 NPC 与少量热 NPC、模型预算、身份/保密/来源攻击、Windows/CachyOS/Termux 真实客户端；每层建立可验证的证据，无运行证据不得宣布全端通过。

上述是**依赖与验收顺序**，不是让 AI 在每阶段默认停止工作的硬指令。正式开发应遵守届时 GitHub Governance 和用户当前操作要求，不因每次常规测试失败就转交用户处理。

## 7. W12 决策候选（未获用户选择）

**W12-A · 一次性全域 Schema 大改**：无需完整 E0 consumer census，直接改所有 Actor/World/Memory/Timeline 等旧数据类型，再借测试修补。虽然节省规划步骤，实际风险是旧读写链漏改、跨域未授权信息暴露、真实客户端崩溃且难定位原因。

**W12-B · E0 证据驱动的原生硬切 + 单权威提交收口（推荐）**：先完成实际生产消费/权威来源矩阵与最小目标接口约束，再在原 Native Host 中逐级实施；最终对旧 Actor-only World/Knowledge 消费者硬切和清退，不长期保留双轨；将事实有效期、分支一致性和主体访问权限作为工程 Gate。当前已完成的只是部分静态探针，仍有阻塞，不可借“选择 B”宣布 E0 通过。

**W12-C · 并行新旧世界/身份引擎 + 逐步兼容**：新 World Subject、记忆和事件通过 adapters 与旧 Actor/Lorebook 并行运行；适合必须维护已发售产品/老存档的情况，但与 Atria Dev 阶段无旧格式兼容包袱、强调单 Host 真相的约束相违背。

**研究推荐 W12-B，尚未获得用户批准。** 本轮仅冻结方向性问题：实施前是否把完整消费者审查视为阻塞，以及目标应为 Native Host 内的单源硬切而非并行适配；实际详细 API、工程阶段、权限和跨端 Gate 需后续逐轮讨论与最终审计。

## 8. 下一轮仍需确认的细则

- Native Event / State / Receipt / Participant / Subject admission 哪些可在同一原子 Session revision 一起发布？Narrator 最终文本和外部效果的失败协调路径如何与当前 Native Orchestration V3 对齐？
- 一条 World Fact 的 `valid time`、当前状态失效/取代、`recorded revision` 与主观 `observed time` 是哪些已有数据可推得，哪些需要最小补充字段？
- 原生 World/Knowledge 创作 UI 是否以 World Entity/法则/Source Library 为中心，旧 ST 激活、手动 entry 触发与新的动态事实上下文如何替换？
- 具体 ABI 中是否需要 `participantRef` / `expressionRef` 新字段，哪些现有 `actorId` 字段语义仍是合法的作者模板 ID、不能盲目全局搜索替换？
- 所有真实消费者、API、测试和跨端缺口如何定义 E0 完成标准及退出 gate，尤其产品主线正在演化时要重新读取最新 HEAD。

**保持 Draft；只更新 `docs`，不创建实现分支、不修改产品代码、不宣称 E0/CI/全端已通过。**

## 9. W12-B 用户确认（2026-10-17）

用户对上一轮推荐的 **W12-B「E0 证据驱动的原生硬切 + 单权威提交收口」**回复「认同」。此轮将它记录为**已确认的顶层架构/执行原则**，不是“E0 已完成”。

- **实施策略**：全面核对当前产品 `main` / 当时相关进行中分支的实际生产调用链和数据权威，再决定最小 Native ID/事件/身份/时态契约和需要清退的旧 Actor-only/World/Knowledge 路径；实现时依赖顺序分阶段验证，最后完成单权威原生 hard cutover，不维持未经产品需要证明的旧数据兼容双轨。
- **单 Native 权威**：正式 Subject、世界关系、已发生事件与事实有效状态仍通过 Session/Branch/Revision 的验证与发布进行；HCM/Knowledge、Prompt 和 Visual/Media 提供证据或呈现，不能自行成为第二个可写 World Truth。
- **安全与长会话**：授权来源、Branch/Revision、并发提交/CAS/Receipt、游戏时间/历史一致性、有限预算、三端真实客户端是必须检查的门槛；不会为了避免“防御代码”删掉真正的信任/一致性边界。
- **现状限制**：当前有 `SessionRepo.commitSnapshot` 统一发布机制、World reducer state patch 与部分 History/Chronicle 能力，但**尚未实际穷尽 E0 Consumer Map**，也没有确认 Narrator/Task/World Effect/Participant/Cognition 端到端原子出版、通用双时间视图或跨端通过。选择 W12-B 不等于 API 冻结或代码实施授权。

**W13 下一轮**：同一 Plan 的 [event-temporality-branch.md](event-temporality-branch.md) 将深入讨论“事件提议 vs 已提交后果”、Native 一次 Revision 中的身份/事实/参与者/事件收口，`valid game time` 与 `recorded revision` / `observed time` 的差异，历史纠错、Save/Branch 继承、缓存/索引失效和故障/重试。**W13 方案尚未由用户选择**。整体继续 Draft，仅修改 docs。
