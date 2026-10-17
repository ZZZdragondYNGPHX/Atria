# ARCH-DWE-01 · W18 最小 ABI/Schema 与真实消费者硬切收口（讨论草案）

- Task ID：`ARCH-DWE-01`；Primary Workspace：`docs`；[唯一 Plan 入口](index.md) / [累计设计](design.md) / [W17 Domain-first](e0-domain-world-context-contract.md) / [E0 总阻塞](e0-final-closure.md) / [唯一 Record](../../../records/architecture/world-evolution-consistency.md)。
- **状态：Draft**。用户已确认 **W1-B 至 W18-B** 的顶层设计/收口方向；此前 §6 为 W18 方案历史比较，正式选择记录于 §7。**具体物理 ID/字段、Native Host ABI、消费者实施与 E0 验收仍未获批准**；下一轮 W19 的 Gate 0/时态物理表示选择尚待讨论。不修改 `main`、不创建实现分支或覆盖作者资源。
- **本轮目标**：把“一个世界主体通过哪些原生数据结构和合法权限，成为真正对话参与者与有效世界事实来源”落到可审查的 **old → target → owner → consumer → removal → test** 表；同时明确哪些现有类型不必新建、哪些真正需要最小增补，避免未经审计的全量 Schema 改写。
- **静态版本依据**：`main=c57fada6edeea255b29d857ba2585c1dbc9c098b`；`refactor/atria-native-orchestration-v3=a7cb649d0cd12cdaf7d7e91e96e654ba6261fea9`；`refactor/atria-native-prompt-preset-deepening=760327891149216dffdc1e3fa0c846496007a013`；`feat/native-visual-generation-deepening=ae587be0c64487ba922528bdd0146444bcf5e92e`。这些分支 HEAD 在本轮再次由 GitHub API 核查，审计不是未来整合后的固定基线。
- **可靠性范围**：本轮只读已有文件及 git tree/已知调用片段；不是全仓库语义 call graph、Node/DB/CI、浏览器或三端真实测试。所有“目标”均非现存 API 声明。

## 1. 已证实的真实合同障碍（逐源码）

| 当前合同 | 已核查的实际约束 | 对 W18 的直接含义 |
| --- | --- | --- |
| [`src/native/identity.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/identity.js) | `NATIVE_ID_FAMILIES` 有 `actor`、`world`、`session`、`branch`、`revision` 等；未看到通用 `subject` 身份家族 | 需 E0 判断是否最小加一个 Session Subject ID 或复用已有可证明稳定的领域 ID，**不可假称 subject_* 已存在** |
| [`src/native/contracts.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/contracts.js) `assertTimelineEntry` | `actorId` 是可选字段，但一旦存在就校验 `actor_*`，Timeline 还绑定 `sessionId/branchId/sequence/role`；`SessionRevision` 为 State/Timeline/Knowledge 的 committed heads | 要区分“谁是实际世界 Participant”与“使用哪个 authored Actor 模板表达”，**不能直接替换所有 actorId 为 subjectId**，也不能强制每句叙事都伪装 NPC 发言 |
| [`src/native/session-core.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/session-core.js) `_newEntry` | 仍将正式 `actorId` 限定在 exact Package Manifest actors；`finalizeTurn` 特定 authority-first 路径能状态+正式 Narrator entry 同发布，World reducer 的另一 `commitStatePatch` 路径不自动共享提交 | 正式动态 NPC 的 Speaker/Timeline 和 World Event 必须解决 Manifest-only 约束，并为两条不同写入路径明确因果/Receipt/重复提交处理 |
| [`native-information-contract.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/public/shared/native-information-contract.js) | `informationRuntime.actors/views` 为作者声明集合；`assertInformationClosure` 限定 Actor 属 Package Manifest；Actor View 要求已声明 Actor 与合法 source/exposure | 动态 Subject 世界存在**不会**自动得到 Cognition/ToM/私密 HCM 的 `Perspective`；若扩充，应在 Native Host 的合法权限/时态投影层，而不是偷改固定 Package Manifest |
| [`native-information-runtime.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/public/shared/native-information-runtime.js) | 未声明的 Actor 返回 `unavailable/undeclared`；`projectInformation` 只接受明确 view、source、scope/epoch、Branch/Revision | 需要完整检查候选动态 View 如何来源可追溯、被撤销、再次授权和不泄密；不能让所有 Subject 继承 Narrator/Inspector 权限 |
| [`src/native/world-knowledge.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/world-knowledge.js) | `WorldRevision` 的作者资源为 `schema/baseline/knowledgeBindingIds/metadata`；KnowledgeEntry 的内容、discovery、applicability 等没有通用 FactKey/valid interval 强制声明 | 不能视现有 Source 为精确的 World Fact temporal store；重要可变事实需要小范围语义绑定，普通作者自由文本继续合法 |
| [`native-chronicle-host.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/public/shared/native-chronicle-host.js) | `WORLD_QUERY` 目前仅限定 people/identity/delegation/regions/institutions/places/orientation/travel；`CHRONICLE_QUERY` 有特定 event/fact/history 查询 | 不能把旧 `host.world.view` 当通用 Fact `validAt/recordedRevision/asKnownAt` 引擎；需要审查扩展还是更小的授权只读投影接口 |
| [`native-frontend-host.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/public/shared/native-frontend-host.js) + [Play](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/public/scripts/native/play-product.js) | `MESSAGE_SCHEMA` 暴露 `actorId`；Play 根据 manifest Actor `actorId` 查显示名；Speech 用 Timeline/表达 plan `actorId`，Visual 存在临时 `provisionalId` | 新 Participant 必须覆盖 Host ABI、显示、语音、视觉与分支可达的 identity 解释，不能只改后端业务 Schema |
| [V3 `ContextPort`](https://github.com/ZZZdragondYNGPHX/Atria/blob/a7cb649d0cd12cdaf7d7e91e96e654ba6261fea9/src/native/orchestration/context-port.js) | 其请求验证 `sourceBinding/audience/grantDigest/tokenBudget` 并在编译后复核 Authority，随后调用 `compileNativeContextPlan`；NPC 的合法 source grant 仍依 Native 来源 | Effective World 的调用必须接入这个既有权威边界，不能靠手填 audience/query 跳过 ContextPort 再补 UI 权限 |
| [Prompt 分支编译器](https://github.com/ZZZdragondYNGPHX/Atria/blob/760327891149216dffdc1e3fa0c846496007a013/src/native/model-prompt-runtime/prompt-compiler.js) | worldUsePolicy/semanticBlocks/Provider Wire 编译只对已提供的 Source 解释，非 WorldFact 写入 | W14 有效世界视图必须先在 Host 解决适用性与秘密来源，Prompt 不被要求 LLM 推断硬法则或替换历史 |

**已经可以得出的工程结论**：有必要把“世界正式 Subject”、“事件/发言参与者”、“作者模板”和“合法认知视角”的合同至少在**语义**上区分；**是否每一种都要新建持久资源/ID family，仍是 E0 决策，不提前冻死。**

## 2. 推荐 W18-B：最小类型差异，不是万能新实体表

目标的五类语义可用 **logical contracts** 表达；它们是示意数据形状，绝不表示代码里现在存在：

```ts
// Draft semantics: fields and names can be collapsed into existing Native resources.
type Subject = { 
  sessionId: SessionId;       // Worldless and multi-World are legal
  subjectId: StableId;        // stable across common branch ancestry
  origin: AuthoredDefinitionRef | CommittedAdmissionEventRef;
  scope: WorldScopeOrSession;
};
type Participation = {
  eventRef: NativeEventOrTimelineRef;
  subjectRef: SubjectRef;    // actual person/party, when a character truly acts
  participationKind: "speaker" | "actor" | "observer" | "party";
  expressionSource?: ActorProfileRef; // optional template, NOT identity authority
};
type DurableFact = {
  subjectOrRelationRef: SubjectRef | RelationRef;
  factKey: DomainOwnedFactKey;    // typed claim/effect slot, not free text string guess
  validity: ValidGameTimeRange;   // derivable from committed event/clock when possible
  provenance: NativeCommittedEventOrRevisionRef;
  supersession?: CommittedCorrectionOrEndRef;
};
type PerspectiveAccess = {
  audience: SubjectOrAuthorizedRequester;
  scopeAndSourceGrants: HostAuthorizedSourceGrants;
  anchor: ExactSessionBranchRevisionEpoch;
  purpose: "context" | "display" | "inspect";
};
type EffectiveRead = {
  source: NativeSessionSnapshotOrAsOfRef;
  asOfTick: GameTick;
  subjectScope?: SubjectRef[];
  purpose: ReadPurpose;
  // caller-supplied subject names/IDs are NOT self-authorizing.
  authority: OriginalHostGrant;
};
```

**不变量**：

1. `AuthoredActorProfile.actorId` 继续只指向可复用**表达资产**，绝不等价于每个 Play NPC 的正式 World Subject。是否给 Timeline 原字段重命名为 `expressionActorId` / 增加 `participantRef`，必须先追踪所有合法阅读方，不能在单个文件盲替。
2. `SubjectRef` 的稳定作用域至少有 Session；多 World/Worldless、存档父分支共同祖先与不同 Session 实例的同一作者定义均要合法。死亡/改名/切换模板不变 Subject；分叉之后才创建的同名 NPC 不自动指向同一 Subject。
3. `Participant` 应当表示**已发生行动的正式参与者**，不是让 Narrator 引用的每句话都必须变成独立 NPC 自主行动。文字引用不直接创造世界事实。
4. `FactKey` 不要求所有场景文学细节结构化。只有要被条件、任务、因果演化、历史和冲突裁决追踪的持续事实才获得稳定形式；其物理权威首选现有 Domain State/Event/History/Revision，不是新的可写 FactStore。
5. `PerspectiveAccess` 由 Native Authorizer 授权，不能把表达模板、视觉身份/HCM Alias 或 Permission 的字符串变成实际授权；`unknown` 不是 `false`，Narrator Host 内部证据也不自动等于玩家/NPC 可得事实。
6. `EffectiveRead` **只读、源可追溯、版本/分支/游戏时间精确、受众过滤先于检索/预算**，返回当前/历史/作者法则/Source Claim 的合法视图。缓存键至少区分 Source Revision、Session Branch/Revision、有效 Tick/Scope、Audience/Grant Epoch；不建立独立可写真相的 `EffectiveWorldState`。
7. `NativeDomainReceipt` 依旧使用原 Native Domain 提交证明；RunLedger 的 Orchestration EffectReceipt、Prompt Wire 和 HCM Index **不能替换**该证明。

## 3. 静态 Actor-only → 目标类型语义 Consumer Cutover Matrix（候选）

| 原始读写方（当前基线） | 旧语义 / 已证实的阻塞 | W18-B 目标消费者变化 | 保留/清退结论（需 E0） |
| --- | --- | --- | --- |
| `src/native/identity.js` | 尚无通用 World Subject ID family | 证明新 Session Subject 需新 ID family 还是可复用现有类型；不采用显示名/ActorId 混搭 | **REVIEW / OPEN**，必要时最小增加真实身份 |
| `src/native/contracts.js` + `session-core.js` | Timeline `actorId` 是 Manifest-bound Author Actor | 正式发言/事件参与者绑定合法 Subject/Role，独立可选 ExpressionRef；`finalizeTurn` 与 World reducer 原提交协同 | **REPLACE TARGET / OPEN**；字段决定依赖全消费者 |
| `public/shared/native-information-contract.js` / `native-information-runtime.js` | Actor 受 Manifest Declaration 和 Scope/View 限定 | Native Host 对 Session 新 Subject 做合法 Scope/Source/Grant 派生，保留 Info/Cognition 的严密来源校验 | **REPLACE TARGET / OPEN**；不能改 Package |
| `src/native/cognition-authority.js` / `tom-authority.js` | actor/target 多处按 `actor_*` 或 Manifest Actor | 受权限的 Subject/PerspectiveRef，独立 beliefs/memory、关系标记，不借别人 Actor 身份 | **REPLACE TARGET / OPEN** |
| `public/scripts/agents/memory/*` | HCM Entity 是来源假设，本地图谱和名字，检索按授权 Source | 必要时建立证据型 `HcmEntityRef → SubjectRef` 映射，unknown 保持未决；不新建官方主体 | **RETAIN SOURCE / REVIEW BINDING** |
| `public/scripts/native/experience/world/session.js` | World patch 的 `commitEvents` 与 Narrator finalize 并非天然同修订 | 与 Native Session Publish/Event/ActionReceipt 的因果接线、未知提交核验与时间效力 | **RETAIN DOMAIN / REPLACE CROSS-ENTRY** |
| `src/native/history-authority.js`、`native-chronicle-host.js` | 有特定生命周期/History，不是任意 Subject 双时间 Fact 查询 | 证明通用 `asOfRevision/asOfGameTick/Correction/Source` 的最小查询/索引合同 | **EXTEND ONLY IF GAP PROVED / OPEN** |
| `public/scripts/native/knowledge-runtime.js`、`knowledge-selection.js` | rank、关键词、状态条件不保证旧自由文本语义失效 | 可变 Claim 依据 Source/Subject/Fact/validity 分类；历史/谣言可引用但不冒充 current | **REPLACE CURRENT-FALSE-PATH / RETAIN TEXT** |
| `public/scripts/native/context-compiler.js` + V3 `ContextPort` | State JSON 和 Knowledge 正文按 lane 编译；V3 有权限/来源/当前性校验 | 从 Host Effective World 的可读投影先获合法当前/历史事实，后按场景/Token 选取，再到 Prompt | **REPLACE PROJECTION SOURCE / RETAIN BUDGET** |
| Prompt 分支 `prompt-compiler.js` / `semantic-blocks.js` | 编译器带来源 policy/语义块，但无法确立世界事实 | 接收已授权/已裁决的有效来源及完整 provenance，Authored/Effective/Wire 只反映输入而不变事实 | **RETAIN PROMPT OWNER / REVIEW ABI** |
| `native-frontend-host.js` / `session-projection.js` / `play-product.js` | 消息契约和显示名依赖 `actorId`/Manifest | 事件 Participant / Expression 模板 / 玩家已知可见别名分开，Host 输出不能泄密 | **REPLACE TARGET / OPEN** |
| Speech/Visual/Illustrations | Speech 审 Timeline actor/表达一致；Visual 有 Manifest/provisional identity | 按正式 Subject 的可见表达绑定资源/派生资产，不让视觉猜测变真身/跨分支身份 | **REVIEW/REPLACE / OPEN** |
| Library/Studio World/Knowledge/EntryPoint | 固定 WorldRevision schema/baseline 与 JSON/引用编辑，缺通用 World Subject 作者体验 | Creator 的 Source/Initial/Entity/HardLaw/Claim 轻量绑定；Studio Authored→Effective，Play 历史/Inspector | **RETAIN AUTHORING OWNER / UX GATE** |
| 旧 `atri-world-info-*` / Orchestrator adapters | 源码仍存；静态部分在 production import，部分仅 tests 命中 | 固定目标集成 SHA 查真实 runtime public ABI，分类 retain/replace/delete；确保不成为第二 Truth/Prompt 权限旁路 | **INVESTIGATE；当前 DELETE=0 已证明项** |

**警告**：该表不构成完整生产调用图；确切字段修改、目标 owner、能删的代码、第三方插件入口仍有待 E0-06。保留有用创作/插件功能与清退旧双写并不矛盾；Dev 版本不为未发布旧数据保持长期兼容。

## 4. 事务与历史：最小执行差异，不新增 EventStore

### 4.1 正式世界效果
```text
Actor/Player/Simulation/Orchestration proposes (not authoritative)
  -> capture Session/Branch/ExpectedRevision/Clock/WorldScope/RequestGrant
  -> resolve known Subject or prepare admitted Subject (if persistent)
  -> validate domain laws / money / consent / event participants / causality
  -> Native SessionCore publication, signed by original Domain Receipt
     (coherent state/events/source/necessary participant if SAME revision)
  -> effective authorized world read + narration/Index/Visual consumers
```
**严格禁止**用两个不同的 `confirmed`（World reducer + Orchestration Result）掩盖分叉/重复扣款。若 Narrator 与 World Effects 位于不同 Native 提交，必须在产品语义中区分 Pending/Committed/Published，并给出失败/未知结果恢复与故事发表门槛，不要自动说“全事务原子”。
### 4.2 历史与来源
- 事件发生游戏时间 `validAt`、正式被接受的 `recordedRevision`、NPC 听闻/认知的 `observedAt` 是不同事实，尽量复用 clock/Domain history/Revision/sourceRefs 推导，确实无法复原时才考虑物理存储。
- 同一 Subject 在父分支接纳后可以被子分支继承，后续事实按对应 Revision 生效；父分支不存在的动态 NPC 不自动穿越来自另一条线。
- 历史“莱恩曾任皇帝”可用于 T5 查询；已提交 T10 死亡与 T12 继位后不能把旧自由文案继续当作当前帝位；某 NPC 未收到消息可以相信莱恩仍在位，但需要 Perspective 权限，不改变世界真相。
- E0-03 必须证明 `query(world, asOfRevision, asOfTick, audience)` 的可重建、修订/纠错、秘密隔离行为，不能用 Chronicle 特定 Lifetime “年份显示”代替。

## 5. 实际 E0 验证与删除退出标准（未来，未执行）

**审计 Gate 0 (E0-06)**：在**最终目标 HEAD** 克隆整个真实生产仓库或获得可验证的完整代码目录，追踪每个新/旧接口 `entrypoint → consumer → owner → storage`，为每个 `actorId/worldInfo*/Knowledge/Context/Orchestration/Frontend` 写出确切保留、替换、删除依据；跨分支合并后再次核对。明确 Native V3 的 ContextPort/DomainReceipt 新生产入口与 Prompt Preset 当前编译器的 ABI；预设 Actor、动态 Subject、Worldless/多 World 的消费场景均应覆盖。

**Gate 1 (E0-01/02/03)**：验证 Subject/Fact/Time/Participant 最小合同和单 Domain Commit/recovery。已有测试文件线索（测试存在≠已通过）：`tests/native/contracts.test.js`、`tests/native/actor-identity-s15.test.js`、`tests/native/authority-publication-c3.test.js`、`tests/native/durable-commit.test.js`、`tests/native/history-session.test.js`、`tests/native/save-system.test.js`、`tests/game-runtime/world-session.test.js`。对未知 commit 收据恢复、跨旧/新支线、双卖等设关键实测。

**Gate 2 (E0-04/05/06)**：验证有来源的动态 Perspective、Context 受众/回收、Knowledge 过期 claim、Narrator vs Actor disclosure 和 Provider Wire 正确性。可扩展的现有测试线索：`tests/native/information-runtime-p6.test.js`、`tests/native/cognition-disclosure-s16.test.js`、`tests/native/knowledge-runtime.test.js`、`tests/native/context-compiler.test.js`、`tests/native/frontend-bridge.test.js`。**不为不存在的接口制造空洞的防御性 test 文件**，优先增强真实消费者契约测试。

**Gate 3–4 (E0-07/08/09)**：Studio/Play 真 UI、事件来源与授权 Inspector、跨分支用户操作、长会话预算/GC/持久化与 Windows/CachyOS/Termux 的真实体验。只有具体运行日志/截图/测试 CI 成功和明确环境版本才可宣称通过；本轮无此证据。

## 6. W18 三方案（未获用户选择）

| 方案 | 行动 | 主要问题 |
| --- | --- | --- |
| W18-A · 立即冻结全套新 ID 和 Schema | 无视消费者/未合并 V3/Prompt 的最新集成状况，先新建所有 `subject_*`、FactDB、Participant/Grant 与各类 Adapter | 看似确定，但会制造重复类型、并行 Truth 与大量改动 |
| **W18-B · 差异最小的 Typed ABI + 实际消费者验收驱动硬切（推荐）** | 只正式要求 Subject/Participation/Perspective/Fact/EffectiveRead 的**语义类型与责任**，先在锁定集成 HEAD 下对旧字段/现有 owner 做 smallest viable delta；真缺什么才添加，不把既有 Receipt/Scope/Clock 冗余复制；消费者成批迁到单 Native 权威并用真实测试/端验确认 | 与 W9–W17 一致，接口工期可能受 Orchestration/Prompt 分支集成制约；需要真实 Gate 0 代码与任务计划 |
| W18-C · 万能 SubjectAdapter 统一全部读写 | 使用一层运行时 Adapter 把 Actor/Knowledge/HCM/World/Prompt/Visual 的所有 ID/来源自动互转 | 容易造成隐式身份合并、信息泄漏与不明确写入权限、长久兼容屎山 |

**当前仅推荐 W18-B**；用户认可 W17-B 并不等于批准 W18-B，不能标记本节为已选。该轮讨论如选 B，下一轮应真正进入**E0-06 全消费者 cutover 清单 + E0-01/03 最小物理数据表示与 Gate 0 退出门槛**，不继续单纯重复抽象原则；随后检查是否已具备整份计划定稿前的充分证据。全过程保持 Draft，仅改 docs。


## 7. W18-B 用户确认（2026-10-17）

用户对上一轮明确推荐的 **W18-B「差异最小的 Typed ABI + 实际消费者验收驱动硬切」**答复「认同」。正式记录为 ARCH-DWE-01 已确认的**总体架构/工程收口路线**，故 W1-B 至 W18-B 的顶层方向均已获得明确认可。

**本次确认实际包含**：
- **最小差异**：WorldSubject、Participation/ActorProfile、Perspective、DurableFact、EffectiveRead 必须在**语义**上各司其职；物理 ID、字段、Schema 和存储方式须基于最终集成 HEAD 的实际缺口决定。复用 Native Session/Revision/Action Receipt、现有 Game Clock、Source References、Information/HCM/History，不创建第二份可写实体/事实/事件真相表。
- **消费者驱动**：对 Manifest-only `actorId`、Timeline/Frontend/Play、Cognition/Information、Visual/Speech、Knowledge/Context/V3/Prompt 等真实活跃调用方建立 `old → target → retain/replace/delete/investigate → verification`；禁止仅替换字段名、动态修改固定 Package Manifest 或以万能 `SubjectAdapter` 长期桥接旧新语义。
- **数据与权限**：Subject 的存在、表达模板、真正参与者和私人认知授权分别确认；Event/Fact 的历史有效时间与记录 Revision 必须可溯源；有效世界视图先基于合法 Host 受众/来源权限构造，再供 Context/Prompt/Library/Studio/Play 读取。
- **硬切而非伪兼容**：项目仍为 Dev，可以对确定过时的生产入口实现原生 hard cutover；但需先审查现役插件或仍合法的接口，不能只因目录名为 `legacy` 就误删有效业务功能。
- **不等于实现通过**：`subject_*` ID family、`participantRef` ABI、FactKey/valid interval 的物理持久化、通用 `asOfRevision/asOfGameTick` 查询、动态 Perspective Grant、E0-01～09 完整消费者与三端实测均**没有**因本轮选择而获批或通过。

**下一轮 W19**：推进同一 Plan 的 [e0-gate0-physical-contracts.md](e0-gate0-physical-contracts.md)——用锁定 Git SHA 的实际生产函数、资源所有权及 caller 路径收敛 **E0-06 Gate 0 消费者地图**与 **E0-01/03 的最小物理主体/事实/时态查询机制**，明确可复用与必须新增/删除的合同、验证证据和退出阻塞。W19 候选未获用户选择，完整企划仍 **Draft**，仅修改 `docs`。
