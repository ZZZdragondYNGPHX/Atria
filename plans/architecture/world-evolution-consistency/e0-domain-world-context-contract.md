# ARCH-DWE-01 · W17 原生 Domain 提交、主体参与者、有效世界视图及编排/提示词接口（讨论稿）

- Task ID：`ARCH-DWE-01`；Primary Workspace：`docs`；[唯一 Plan 入口](index.md) · [总设计](design.md) · [W16 跨分支锚定](e0-integration-readiness.md) · [W13 事件时态](event-temporality-branch.md) · [W14 Effective World View](effective-world-view.md) · [唯一 Record](../../../records/architecture/world-evolution-consistency.md)。
- **当前状态**：Draft。W1-B 至 **W16-B** 为用户已确认的总体架构/收口方向；本轮 **W17-A/B/C 及所有确切 ID/JSON/ABI/代码切线未获用户选择或批准**。E0 依然 PARTIAL / BLOCKED，不修改 `main`、不创建实现分支，不声称 CI、真实 UI 或三端验收通过。
- **本轮收敛目标**：以固定 SHA 下的真实 Native/Orchestration/Prompt 代码证据给出**最小的读写合同与事务时序**，将“故事里某个此前未定义 NPC 做了重要的事情”一路追溯到原生领域事实、可合法看到的有效世界和模型上下文，避免转向新的并行 EventStore、WorldEntityRegistry 或 Prompt 真相权限层。

## 1. 锁定版本与已有路径（静态代码证据，不是完整消费者验收）

| 对照来源 | commit SHA | 本轮已观察的接口 |
| --- | --- | --- |
| `main` | `c57fada6edeea255b29d857ba2585c1dbc9c098b` | `SessionCore.finalizeTurn` / `_publishLocked`、`SessionRepo.commitSnapshot`、Native World `commitEvents`、`context-compiler.js`、Knowledge/Information 的静态 Actor 约束 |
| `refactor/atria-native-orchestration-v3` | `a7cb649d0cd12cdaf7d7e91e96e654ba6261fea9` | `NativeNarratorOrchestrationAuthority.finalizeNarrator/#commitSessionOutput`、`EffectController`、`ContextPort`、SourceBinding/DomainReceipt 与编排结果 |
| `refactor/atria-native-prompt-preset-deepening` | `760327891149216dffdc1e3fa0c846496007a013` | `PromptCompiler.compile`、语义 `semanticBlocks`、Authored/Effective/Provider Wire Draft Preview |
| `feat/native-visual-generation-deepening` | `ae587be0c64487ba922528bdd0146444bcf5e92e` | 仅在 W16 确认存在差异；本轮无 Visual 全消费证明 |

本轮重新从 GitHub branch GET 确认上述 main/V3/Prompt/Visual HEAD。**版本锚点是审计的时间点，不是未来实现必然应使用的 HEAD；其它分支合并后需要固定最新合成基线重新核对**。

### 1.1 代码明确已存在的事务能力

- [`src/native/session-core.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/session-core.js)：`finalizeTurn` 在 `authority-first` 情形下用 `authorityTurnProof` 取得已准备 Candidate，将 Native states 与 Narrator entry 交由**一次** `_publish`；而 `narrative-outcome` 情形通过任务解释器准备 patch，再提交 Narrative。此处是**现有路径的具体证据**，不证明所有 World Game 事件使用同一入口。
- 同一文件 `_publishLocked` 将 State、Timeline、Task/Action receipt、Cognition/History 校验组织成候选 SessionRevision 后交给 `SessionRepo.commitSnapshot`；正式 `Action Receipt` 可以携带 `committedRevisionId`、`branchId` 和新事件 `eventRefs`。
- [`world/session.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/experience/world/session.js) 的 `commitEvents` 使用 reducers 在本地投影后，`commitStatePatch({atri_world_state, atri_game_runtime}, {expectedRevisionId, actionRequest})` 统一提交**这次 world patch**；但独立路径的 World 事件与此前/此后的 Narrator Turn 是否能成为**同一修订**必须进一步核验，不得把两次先后成功当作自动原子。
- [`native-turn-orchestration.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/refactor/atria-native-orchestration-v3/src/native/orchestration/native-turn-orchestration.js) 的 `#commitSessionOutput` 经 `sessionCore.finalizeTurn` 及 `readSessionTurnOutput` 验证**原 Native Domain Receipt**；遇到 `storage_commit_unknown` 会读取确切提交而不是盲目再写。
- [`effect-controller.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/refactor/atria-native-orchestration-v3/src/native/orchestration/effect-controller.js) 管编排的 `prepare/ready/claim/observe`，结果可为 `confirmed/failed/not_dispatched/unknown`；因此“编排 Effect 已确认”只说明该 Effect 按**其原领域回执**得到了证实，不能越级发明世界事实。
- [`context-port.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/refactor/atria-native-orchestration-v3/src/native/orchestration/context-port.js) 验证 `sourceBindingDigest`、`grantDigest`、`audience`、`tokenBudget`，异步 Memory/Context 编译后再次检查当前权限与 Source；它在 Native Session 情形使用 `compileNativeContextPlan` 并与 Information Projection 绑定。
- [Prompt Preset `prompt-compiler.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/refactor/atria-native-prompt-preset-deepening/src/native/model-prompt-runtime/prompt-compiler.js) 的 `worldUsePolicy`、`memoryUsePolicy` 与 `semanticBlocks` 负责来源的编译解释，不定义世界事实合法写入权威。

**差距的精确定义**：现有不同合法路径能进行不同程度的“状态 + 叙事”提交，但 W17 不能在缺少所有 caller/SDK/Orchestration 最终集成 HEAD 的情况下声称已经存在开放世界 `SubjectAdmission + Fact/Valid-Time + Participant + Scene + Cognition` 通用“一次写齐”接口。

## 2. Domain Fact 与 Orchestration Effect 的权威划界（W16-B 已确认约束）

```text
              Player / NPC / Task / AI proposal
                          |
            Native domain rules and permissions
            (Session, Subject, Clock, Branch,
             world law, ownership and consent)
                          |
       prepare proposed durable World Effects
         + Subject admission (when warranted)
         + relations/obligations/changes
         + event provenance + participants
                          |
       Native Session coherent publication
       (expectedRevision / receipt / state)
                          |
                    Domain Receipt
                       /         \
       effective world projection  Orchestration Effect observation
              |                               |
   exact audience + source rights      Effect/Result/Run evidence
              |                               |
       ContextPort/Compiler  <--- read-only evidence,
              |
         Prompt semantic / Provider Wire
```

- Orchestration Run 的 `effectRef`、`resultRef`、`receiptRef` 只能证明编排流程中某个执行/投送/观察动作的合法性，**不能替换原 Native Session Domain Receipt 及已提交 World State**。
- 已经存在的 domain-specific `rp_chat`、`native_session`、World reducer 边界不可通过名称相近强行并为同一个数据库事务；只有属于同一 SessionRevision/Namespace publication 的变化，才有凭据谈该段强一致。
- “World 里的阿洛卖给玩家唯一宝物”的正式结果，要经所有权、玩家真实选择/同意、库存和游戏规则合法检查；模型说“成交了”或编排 Effect node `confirmed` 不自动成立世界交易。
- 原生 Game/World Effects 与正式 Narrative 若不能在**同一 Native Revision**发布，须显式设计 staging/receipt 的协调与合法发表门槛，保留事实已提交和文本尚未发表的差异；**不得宣称跨 LLM 外部服务实现数据库事务**。

## 3. W17 最小五类逻辑契约（示意，不是已冻结 API 或必然新表）

| 逻辑契约 | 最少必须证明的属性 | Owner 与读取/写入语义 |
| --- | --- | --- |
| `WorldSubjectRef` | `sessionId + stableSubjectId`、可验证 origin/revision/scope，分支祖先可达；同名不是身份 | Native Session 单权威接纳；ActorProfile/HCM 本地 ID 只能证据绑定 |
| `WorldEffectProposal` | 发起主体/正式受限 participant、作用域、source、确切 `expectedRevisionId`、发生 game tick、待验证效果 | Player/NPC/Orchestration 可**提议**，但不直接向 World/DB 写效果 |
| `NativeDomainReceipt` | domain/operation、原始提交 revision + branch + event refs/commit identity、有效 outcome | 仅原有合法 Domain 事务产生；Orchestration 等消费者只通过回执跟踪 |
| `EffectiveWorldRead` | branch/revision、as-of tick、world scope、purpose、受众证明/Source Grants 与原生事实来源 | Host-owned **只读**；current/historical/law/claim/belief 分类、有效期/纠错依据；不能跨本身权限扩大 |
| `ContextEvidenceBinding` | SourceBinding digest/Grant digest、audience/projection anchor、相关事实/Claim 元数据、完整度/裁剪理由 | V3 ContextPort/Native Context Compiler 以合法来源构造；Prompt 编译只使用被提供的数据，不自行提升 Claim 为 Truth |

语义字段不意味着每条记录必须物理复制完整 SessionId、时间戳与权限对象；尽量从已存在 Session/Revision/Event/Scope Source 引用推导。是否增加新的 `subject_*` ID family、何种 `participant` 字段、`FactKey`、`validAt`/更正引用，必须在目标版本 E0 中证明现有数据不足后才能最终定案。

**真正的原生世界提交不应依赖 Context/Prompt 成功**；反过来，叙事正式发表的持久后果必须以可验证 Domain Receipt 为基础。Model 内容可以是草案或证据输入，不能自动赋权修改世界。

## 4. 事务/投影与缓存的精确顺序（讨论建议）

### 4.1 Write lane：世界效果

1. **Capture**：确切 Session/Branch/Revision、Clock、Scope Epoch、源授权与 Subject/Participant 身份；模型推理时保存这个锚点。
2. **Prepare**：原 Native Authority 验证硬法则、事实来源、玩家自主权、关系/合约成立条件、库存/位置及并发前置条件；如有持续后果才接纳新 Subject。
3. **Commit**：在已有 Native SessionCore/Repo 中使本次**可原子覆盖的** Subject/State/WorldEvent/必要 Participant/Receipt 一致；若不同领域无法同事务，须先明示哪些是事实、哪些是后续消息/素材以及故障协调规则，不能假装所有变化一次成功。
4. **Verify**：取得原 Domain Receipt/Revision；未知提交结果先读确切收据及状态，再决定是否允许重试，不使世界金钱、物品、职位被重复更改。
5. **Expose**：Native 最新有效视图和受众合法观察可按 Revision 重建；HCM/检索/视觉/Prompt 可异步派生，但错误索引不能倒灌成新的 World Fact。

### 4.2 Read lane：Context/Prompt

1. **Resolve authority**：用当前或 as-of 的 `Session/Branch/Revision/Clock/World Scope` 及明示的 purpose/caller，确认是否为 Host 规则、Narrator、NPC、Player 或 Inspector；权限规则先于检索。
2. **Effective World View**：Host 根据 WorldRevision 硬约束、正式 State/Event/History 和有效时间得到“当前/历史/未确认/来源声明”。**不能把未来才知道的事投给过去 NPC**。
3. **Audience filtering**：以动态合法 Perspective / Information Projection + Source Grants 对真实身份、私有 HCM、角色已知信息裁剪。Host 可以内部结算秘密，但不得在任何模型上下文或未授权 UI/Wire 中出现被禁止的数据。
4. **Context compilation**：合法的 EWorld/Knowledge/HCM 源变成 Context Items；旧静态文案中失效的可变声明应转历史/文献、给出明确冲突/拒绝原因或要求补充 Fact 绑定。保留自由文本的来源价值，不能以 rank 假装语义问题已解决。
5. **Prompt compilation**：Prompt Semantic Blocks/编译后 Effective/Provider Wire 仅消费合法 Context 及其 provenance；不存在从 Prompt 倒写世界的环节。
6. **Revalidate**：异步回忆/模型生成以后、提交叙事/Effects 以前，按 V3 已有 `ContextPort` / Session Domain 的 SourceBinding、GrantDigest、Revision 当前性重新检查；若 Anchor 失效，则丢弃或重新生成，不能将旧分支隐私写给新分支。

**统一 Diff/Inspector**：Play UI、Studio Effective Preview、Authored/Provider Wire 三种视图基于**同一来源及合法版本**但职责不同：Studio 预览作者素材与起点，Play 看本支实时或历史事实，Prompt Inspector 看实发给 Provider 的授权文本，不能展示一个只在 Host 内可见的秘密当作玩家可得结果。

## 5. 这次能直接提出的 E0-01/02/04/05 退出条件

| Gate | 目标证据，不是本轮已经 PASS | 当前状态 |
| --- | --- | --- |
| **E0-01** Subject/Fact | 固定最终集成 HEAD：证明 Subject 的合法起点/涌现 admission、与 ActorProfile/Participant/Perspective 的类型映射、FactKey/validity 和确切 Revision 的最小 Schema/读写位置 | **OPEN** |
| **E0-02** Native Publication | 对照 `finalizeTurn`、`_publishLocked`、World `commitEvents`、V3 `#commitSessionOutput` 的真实活跃入口，拿到各场景原 Domain receipt、失败/未知提交恢复和叙事一致性证据 | **OPEN / BRANCH_RECHECK** |
| **E0-04** Perspective | 新 NPC 不在 Manifest 时如何拥有合法视角？V3 ContextPort 调 Source Grants、Information/Cognition/HCM、Inspector/Model Wire 逐出口不越权，特别校验秘密真身与不同 Branch | **OPEN / BRANCH_RECHECK** |
| **E0-05** Knowledge Context | 旧“莱恩是皇帝”在莱恩死亡/继位后不再作为 current fact 注入；仍可在历史/某人的错误信念下合法出现；模型/Provider Wire 与 Inspector 真实检验 | **OPEN / BRANCH_RECHECK** |
| **E0-06** Deletion Map | 完整固定 HEAD 生产入口、动态加载和插件 ABI 的 `RETAIN/REPLACE/DELETE/INVESTIGATE` 清单；一条路径只有真正无消费者或被替换并验证，才可 DELETE | **PARTIAL / OPEN** |

其余 E0-03（通用 as-of 时态）、E0-07（Library/Studio/Play）、E0-08（长会话/持久化）、E0-09（分支合入）全部保持阻塞，不因本轮绘制合同而变绿。

### 5.1 针对现有真实代码的最小验证故事（未来运行目标）

- **赊账原子性**：新生阿洛首次交易，应产生可重查的 Subject/金币/债务/事件/Revision/原领域收据；故障和未知 ACK 不得二次扣钱/重复创建阿洛。
- **双来源提交**：同一场景通过 Game World reducer 与 Native Narrator 输出时，必须说明是同一 Domain Commit、不同合法提交还是出现了不可接受的失配；不能用两个各自 `confirmed` 的回执掩盖重复后果。
- **角色秘密**：Host 可知道“苍鹰”就是阿洛，米拉只知道苍鹰；Prompt Effective/Wire、HCM 查询与 Play UI 都不能因为内部 Subject 合并而暴露真身。
- **历史继位**：莱恩在 T10 去世、米拉在 T12 即位；当前 Narrator 视图显示米拉在位，T5 历史合法显示莱恩在位，边疆 NPC T13 未得知可继续持有旧信念（但不能将信念升为当前世界事实）。
- **切档旧结果**：模型已在 Branch A/T13 编译，用户读档到 Branch B/T7。迟到的 Context/Output/Effect/Memory 既不能越权被发表，也不能把 A 的秘密/经济状态写进 B。
- **世界为空/多世界**：Worldless Session / 多 World 绑定以及复用同一 Authored Actor Profile 的两个不同 Subject，都应维持明确身份/世界范围，而不强制旧 Manifest ID 当全局主键。
- **成本**：数千回合/百余冷 NPC 中只增量查询相关 Subject/Fact，并保留原生硬约束、授权和关键未履行承诺；不要求每回合重新推导全世界的所有自由文本或开全体 NPC 常驻 Agent。

## 6. W17 三路线（本轮待议，均未确认）

| 路线 | 世界业务写入/读投影方案 | 判断 |
| --- | --- | --- |
| W17-A · Orchestration-first Event Ownership | 将世界状态、Subject 和所有新 Fact 直接写进编排 RunLedger/Effect，将原 Session 视为回写缓存 | 会产生与既有原 Domain Receipt 相竞争的写权，与 W12/W16 不变量冲突 |
| **W17-B · Domain-first Commit + Revision-anchored Authorized Effective Projection（推荐）** | 使用唯一原生 Domain Authority/Session Revision 结算持续后果，编排只处理提案与观测，并依据原 DomainReceipt 确认；Host 的有效世界只读投影带 Branch/Revision/GameTick/受众锚点，V3 ContextPort/Compiler 与 Prompt 接收合法来源和有效性；最小扩充真正缺失的 Subject/Fact/Participant/Grant 类型 | 与 W1–W16 已确认路线一致，避免第二写权、时态/秘密漂移；但需要全消费者切线和确切 ABI/事务边界的 E0 证据 |
| W17-C · Prompt-first Semantic Merge | 允许每次 Context/Prompt 依高优先级文本推断最新状态，再把自然语言结论反写 Native/HCM | 缺乏可信提交、事实时态与权限，模型猜测会升格为世界真相 |

**推荐 W17-B**，但用户本轮仅明确批准 **W16-B**，不能提前将 W17-B 写成用户决定。W17-B 不是“接口已实际实现”的声明。

## 7. 下一轮 E0 审查从哪里继续

若用户确认 W17 总路线，下一轮优先收敛**最小目标 ABI / Schema 和明确的 Caller-to-Owner Map**，而非继续抽象列举系统：

1. `SubjectRef/ParticipantRef/ActorProfileRef/PerspectiveGrant` 哪些现有合约可以复用，哪些因 Manifest-only 校验需要原生 hard cutover？
2. `WorldEffectProposal` 哪些必需字段可以从现有 Orchestration V3 SourceBinding/Session Native Action Request/Scope/Receipt 推导，不应重复存储？
3. `FactKey/valid interval/recorded revision` 的最小持久化表述以及 History/Save/Chronicle 的真实通用查询入口；没有的最小新增合约如何做？
4. `EffectiveWorldRead` 怎样插入 V3 `ContextPort` 的权限校验与当前性复核，成为 Knowledge/HCM/Prompt 都能信任的合法来源？
5. 哪些 `worldInfo*`/Old Orchestrator/Actor-only 真实消费者要替换或删除，哪些是合法 Public Plugin API 仍需要支持？以最终合入的固定 HEAD 证明。
6. 工程 Gate 0 的必要 E0 证据和阶段任务依赖/跨端验收，不将需要将来真实跑的测试写成已通过。

如 Orchestration/Prompt 分支在讨论间合入 `main`，必须以**新 `main` HEAD 重核 ABI 与生产调用**。E0 仍 **PARTIAL / BLOCKED**；完整 Plan **Draft**，本轮不修改产品代码。
