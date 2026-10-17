# ARCH-DWE-01 · W19 Gate 0 消费者收口与最小物理主体/事实/双时间契约（讨论草案）

- **任务与导航**：`ARCH-DWE-01` · Primary Workspace `docs` · [唯一 Plan Index](index.md) · [累计设计](design.md) · [W18 最小 Typed ABI](e0-minimal-contract-cutover.md) · [W17 Domain-first](e0-domain-world-context-contract.md) · [唯一 Record](../../../records/architecture/world-evolution-consistency.md)。
- **审批状态**：**Draft**。**W1-B 至 W18-B** 已被用户认可为总体方向；**W19-A/B/C、物理数据结构、原生写入/查询 API、需要删除的具体生产代码、阶段实施计划均未获批准**。E0-01～09 仍 PARTIAL / BLOCKED；未创建产品实现分支，未运行 Node/CI/真实三端测试。
- **本轮任务**：从抽象 `Subject/Fact/Perspective` 退到真实的存储和调用关系，回答四个可实施问题：谁在现有 Native Session Revision 中为新 NPC 登记身份？长期事实的事实键/游戏时效/提交修订怎样最小落地？旧 History/World Event/Save 是否可被复用构建 `as-of` 查询？进入正式开发前，Gate 0 的 Consumer/Owner/Deletion Map 到什么程度才足够，而哪些验证应该留给实施期？
- **本次来源版本**（由 GitHub Branch API 再次核对）：`main=c57fada6edeea255b29d857ba2585c1dbc9c098b`、`refactor/atria-native-orchestration-v3=a7cb649d0cd12cdaf7d7e91e96e654ba6261fea9`、`refactor/atria-native-prompt-preset-deepening=760327891149216dffdc1e3fa0c846496007a013`、`feat/native-visual-generation-deepening=ae587be0c64487ba922528bdd0146444bcf5e92e`。未来合流后必须以新 HEAD 重验。此次仅 GitHub 远端源码定向读取/搜索，非完整可执行 call graph。

## 1. 现有“能落地”的数据基础及证据边界

| 现有代码/持久化 | 本轮核实的静态事实 | 可复用的部分 | 不可臆断的能力 |
| --- | --- | --- | --- |
| [SessionCore 初始世界](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/session-core.js) | `initialWorldState` 返回 `primaryWorldId`、`worlds[worldId].{worldRevisionId,state}`；Worldless 可以有 `initialState`；EntryPoint 有多个 World 且有 `primaryWorldId` 要求 | 已固定 World Revision 的物理 World slots 与 Session 自有状态；Worldless/multi-World 不被新 Subject 设计删除 | 未有跨 World/Worldless 统一 Subject 的现成物理结构 |
| [World Event reducer](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/experience/world/session.js) | `atri_game_runtime` 为 `{schemaVersion:1,nextEventSeq,events}`；Event 有 `id='event:'+branchId+':'+seq`、`seq/type/payload/meta?/branchId`；`commitEvents` 经 `commitStatePatch` 组合 WorldState 与 Journal | 已有确定的事件顺序、正式提交的 World 状态快照、分支与前置 Revision | Event 内容本身**不提供通用、受验证的 validAt/validUntil、最终提交 Revision、Subject/Fact 关联**；部分信息可通过 Receipt 推导但非每个 Event 都有统一的可查询索引 |
| [Native Session Publication](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/session-core.js) | `_publishLocked` 创建 Revision、State/Timeline/Knowledge heads 与 Action Receipt 的 `committedRevisionId/branchId/eventRefs`；调用 `SessionRepo.commitSnapshot` | 以 Session Revision 为单 Host Authority 的正式结果锚点，既有幂等/未知提交恢复基础 | 不应据此直接宣称 World reducer 与独立 Narrator Turn 在**同一** Revision 或原子事务中发表 |
| **Typed Authority Publication guard** | `SessionCore.applyRuntimeCommit` 当 `hasAuthorityTransactions(base)` 且 `actionRequest` 或变更 `atri_world_state / atri_game_runtime` 时拒绝 `native_authority_typed_publication_required` | **安全约束需要保留**：不能用通用 `commitStatePatch` 绕过权威事务来修改模拟世界；有条件路径须采用原有合法 Typed Authority Commit | 不是所有世界类型都允许同一条任意原始 StatePatch；要按真实模式和入口分类 |
| [History Authority](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/history-authority.js) | 某些声明了 History/Lifecycle 的 Session 使用 `atri_lifecycle.history` 的 `facts/heads`，每个 Fact 可有 `key/value/tick/eventId/previousId/source provenance`；热温冷历史压缩和索引 | 现有**领域历史**的 `FactKey → previous fact → current head` 结构可作参考/可复用，在合法策略下保留不可变事件来源 | `History` 不是所有游戏的通用世界对象 DB；不能强制 Worldless/无 Lifecycle 的游戏使用它或把私密事实变成 `public` |
| [History Query](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-history-runtime.js) | `queryHistory(snapshot, query)` 允许 `kind/facet/value/id/limit/cursor/memory`，游标锚定 `snapshot.revision.revisionId`；公开/声明来源有限分页扫描 | 在**已选择的精确 Snapshot** 中按证据、ID 或 facet 做有界历史检索；可复用分页/来源思想 | **没有**显式 `asOfTick` 或任意 `asOfRevision` 入参；当前 `heads` 表示 Snapshot 内的最后版本，不能当成自动双时间查询 |
| [Session Snapshots + State Delta](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/session-snapshot.js)、[`state-delta.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/state-delta.js) | Snapshot 有 Session/Revision/Branch graph、父分支 forkRevision 与 Timeline 祖先校验；`atri_world_state` 可以按受控 snapshot/delta 保存且有 delta depth 控制 | 读档和从精确旧 Revision 再投影可降低重新造存储系统的必要；已有持久化依赖闭包可用 | 旧 Revision 的**保留/GC/授权历史选择**要核实；Snapshot Diff 不能替代事件意义上的 valid-time / 更正 / 主体获知时间 |
| [ContextCompiler / Knowledge](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/context-compiler.js) | `currentStateItems` 可能将整份 `atri_world_state` JSON 注入 Context；`knowledgeItems` 把选中 Knowledge 原文另做 lane；SourceRefs 与 Token budget 已存在 | Context source、rank/selection/budget 的已有服务可保留 | 权威 Rank ≠ 静态句子真正失效；W14 Effective View 应先筛事实/来源权限再编译 |
| [V3 ContextPort / Prompt Preset](https://github.com/ZZZdragondYNGPHX/Atria/blob/refactor/atria-native-orchestration-v3/src/native/orchestration/context-port.js) | 分支 V3 核对 SourceBinding/Audience/Grant、异步之后 currentness；Prompt 分支 semanticBlocks/draft preview 是消息/Provider 视图 | EffectiveWorld Read 应在**原有 Host 授权路径内**成为受许可的事实来源；Prompt 使用合法 Context | 两分支目前未合并，不能说最终接口已可调用；Prompt Effective 不等于 World Fact Effective |

以上核验到的是具体函数/数据形状，尚未证明它们在每种 Product/Package 模式下活跃；E0-06 仍不能当作 PASS。

## 2. 物理设计备选：Session-owned Subject + Fact transitions（W19-B 推荐，尚未批准）

建议在现有 Session Revision 的受控 `states` / Domain Event 效果内表示需要长期追踪的主体和事实，但**不建立独立 Session 之外的可写 EntityRegistry/FactDB**。名称仅为逻辑形状，最终放在哪个原生命名空间与现有 World schema 如何衔接，需 Gate 0 验证：

```ts
// Candidate physical semantics, NOT existing API and NOT frozen names.
SubjectRecord = {
  subjectId,                 // stable inside this Session/branch ancestry
  kind,                      // person | place | group | object | ...
  originRef,                 // authored definition OR original admission event
  worldScope,                // session/world-scoped; Worldless legal
  admittedRevisionRef,      // assigned/verified by Native publication
  // name, alive, profession etc belong to typed world facts, not identity key
};

FactTransition = {
  subjectOrRelationRef,
  domainFactKey,             // a typed rule-owned field/relation key
  effectKind,                // establish | change | end | correction ...
  valueOrChange,
  occurredAtGameTick,       // only if clock/source supports it; explicit unknown otherwise
  sourceEventRef,
  committedRevisionRef,     // original Domain publication / receipt linkage
  replacesTransitionRef?,   // correction/supersession if validated
};

// Derived EffectiveRead: not persisted truth table
ViewQuery = {
  sessionId, branchId, asKnownRevision, asOfGameTick,
  worldScope, audienceGrant, purpose, subjectFilter?
};
```

**本轮的重要设计选择是“在哪些数据上要求持久来源”**，不是给全世界每个词创建 Fact：
- 只有需要被世界规则、身份、承诺、关系、生命周期、自动演化或历史查询引用的事实，才形成稳定`domainFactKey`与真正的状态转换；普通背景描写仍可留在自由文本。
- 同一 Subject 可以跨本 Session 的多个 World Scope 活动；Worldless 也能有 Subject；不要简单用 `worldId + name` 作为主键。一个 Authored Definition 在不同 Session 实例化后不是同一个运行对象。
- `subjectId` 可考虑新增最小 Native ID family；但在证明现有 Typed Domain ID 无可重用稳定性之前**不冻结具体前缀**。身亡、改名、头像变化、身份伪装均不产生新 subjectId。
- World baseline 是**起始数据**，动态 Subject/事实是 Session 的**当前有效状态及事件来源**；固定作者 WorldRevision 永不被 Play 回写。可选择在现有 `atri_world_state` 内扩充 Subject/事实的受控区域、或在已存在 Session 状态文档中投影引用，需看真实 schema/跨 World/Worldless 后决定最小物理位置。
- `FactTransition` 只有真正经过 Native Domain 校验并在已提交 Revision 中可达才具备客观权威；旧 KnowledgeEntry、HCM Entity、Narrator 文案中的候选断言不自动创建 Transition。
- 如果当下 Domain History 已提供相应可信的 event/fact/previous 链，可引用它而非重复存储另一份 FactTransition。一个逻辑 Transition 在多个只读查询/Inspector 中可以共享相同来源引用，避免每消费者各自 copy 一个状态副本。
- 没有真实 Game Clock 的 Worldless/纯叙事 Session 不应伪造 Tick。它仍然可以依据 Revision 序列持有已提交顺序；`asOfGameTick` 只有在具体 EntryPoint 声明 canonical clock 并可校验时合法。是否需要正式配置一个通用故事时钟而非强制所有游戏配置 Lifetime Clock，属 E0-03 未决。
- 被作者法则明确禁止的世界后果应在 Effect Prepare 校验拒绝，而不是在 EffectiveRead/Prompt 时才选择性隐藏错误事实。

## 3. `as-known-at` 和 `as-of-world-time` 的查询实际应怎样工作

推荐拆成**两段锚定读取**，不假定旧 `queryHistory` 已经支持：

1. **Revision anchor**：验证 Session/Branch 所请求的 `asKnownRevision` 是否在该分支合法祖先或当前可达修订中，并以原 Session Repo 读取那一刻的真实 Snapshot（不会从其它分支当前 HEAD 获取数据）。
2. **World time filter**：在该 Snapshot/对应受限事件与事实来源内，按 canonical GameTick/有效区间查询事实。当时尚未提交的新证据，在旧 Revision 中不可见；后来被正式追认“实际在早前生效”的事实，只能在追认后 Revision 查询时出现。
3. **Audience proof**：Host 根据请求者的 Source Grants、Perspective、Scope Epoch 与当时可见证据进行合法裁剪；`Host knows` 不代表 NPC/Player 也知道，`asOf` 不可成为读取隐藏真身的后门。
4. **Result classification**：将当前事实、已终止历史、已更正的曾信断言、谣言/Source Claim 和未知分开；未明确的时间有效期不能被假定为“永远持续”。读投影可包含证据/拒绝原因与目标用途。
5. **Cache & replay**：重建投影的缓存键至少区分 `sourceWorldRevision + Session/Branch/Revision + GameTick or None + Audience/GrantDigest/ScopeEpoch`；切档、新事件、补充已知来源或权限撤销后不得复用旧有效视图。

**Retcon/纠错**：后发现事实的 `validFrom` 可能早于它的 `committedRevision`；这并不自动改写旧 Revision 的物理历史。真正的“过去改变”由合法高权威效果或独立分支因果重新协调，不允许仅靠回写固定 WorldRev/删除旧 HCM 文本达成。

**复杂度/GC**：长期 Query 优先从当前或指定 Revision 的可信 heads/索引与有界 transition 链读取，不每次从开局全文重放；旧 Revision 是否长期保留、SavePoint pin 与存储回收策略需独立证据核验，不能根据 `StateDelta` 存在就宣称任意历史永不丢失。

## 4. Gate 0 / E0-06：已定位的生产链及清退证据（未完成完整全仓调用图）

| 生产入口 / 实际已检索路径 | 读写边界与目标变更 | 状态及要求 |
| --- | --- | --- |
| `src/endpoints/native-session.js` → `SessionCore.applyRuntimeCommit` | `/command` 的运行时状态/Timeline append 经 Native Session Authority；须区分 `authority-first` 被禁止的非 Typed World Patch 与合法 Domain Effect | **已定位代码引用 / NEEDS_ENTRYPOINT_VALIDATION**；不允许用通用 Patch 绕过已存在的 `native_authority_typed_publication_required` |
| `public/scripts/native/experience/logic/runtime.js` → `world/session.js.commitEvents` → `session-runtime.js.commitStatePatch` → Native Session command | Game World reducer 负责自己声明的 Domain State/Event；正式 Subject admission/时间/Receipt 必须走同一合法 Host 权威，不能随意扩一条第二写入路径 | **已定位方法调用 / NEEDS_MODE_AND_TXN_CHECK**；与 Narrator finalizeTurn 跨入口关系仍 OPEN |
| `src/native/authority-transaction.js` → 原 Native Publication | `prepareAuthorityPublications` 是不直接拿 DB writer 的 prepare API；`SessionCore._publishLocked` 是最终 Owner。已存在 `world.event/world.command/app.command/clock.advance` 候选效果语义 | **已定位代码路径 / NEEDS_CALLER_FLOW**；不要另发明 `Orchestration Effect = World Event` |
| V3 `src/native/orchestration/context-port.js` → `compileNativeContextPlan` / Information | 已有 SourceBinding/Grant/Epoch/currentness 保障，后续插入 EffectiveWorldRead 必须避免新查询绕过受众鉴权 | **已读精确 V3 SHA / BRANCH_RECHECK**；未合并 V3 及 Prompt 的最终 Context ABI 未固定 |
| `public/scripts/native/context-compiler.js` → `knowledge-runtime.js` / HCM Sources → Prompt | Current State JSON 与 Knowledge 文本分别变成来源项；目标为先合法有效世界投影，再选择有关 Context；旧条目过期仍可在 History/Belief 引用 | **已定位方法 / OPEN**；仍须 Producer/Target/Provider Wire 的完整调用图 |
| `src/native/frontend/host-services.js` → `readWorldView/readChronicle` | `host.world.view` 与 History 目前偏特定领域；要证明真正新读 API 和 Studio/Play/Inspector 如何接入 | **已定位 / OPEN**；不得以现有 `WORLD_QUERY` 直接冒充泛化事实查询 |
| `public/scripts/native/play-product.js` → Manifest Actor name / Speech/Visual | 角色名/实际参与者/可见别名必须分别来源于授权 Subject/Expression，动态 NPC 不得显示成 Narrator 或借用同名角色 | **已定位 / OPEN**，需要实际前端/媒体消费者闭合 |
| `public/scripts/agents/orchestrator/legacy-runtime-adapter.js` + `atri-world-info-*` | 旧 ST WorldInfo/Orchestrator 可能包含真实生产入口、插件 ABI 和过渡输出字段 | **INVESTIGATE，未发现可直接证明 DELETE 的文件**；不能以静态 GitHub 搜索等于全面无引用 |

**查找的能力限制**：GitHub `search` 对默认分支的关键函数名只提供文件级命中，不是 AST 类型解析，不含所有动态 import、反射、插件 API 和未合并分支。已通过 Git Tree 只读确认部分 `src/native`、`public/scripts/native`、`tests/native` 子目录存在和范围；**并未逐一阅读每个调用方或完成完整 repo checkout**。审查矩阵不能标 PASS 或填写确定的 DELETE 列表。

### 4.1 Gate 0 真正的退出门槛（与 Gate 1～4 的实际测试区分）

**正式开发前应完成的 Gate 0**：
- 固定最终整合目标的 `main`/相关活动分支 HEAD；记录跟进的 owner 和最少冲突依赖，不等待无关项目。
- 形成能定位到真实调用方的 `original entrypoint → Domain owner → state/receipt → consumer → target contract → retain/replace/delete/investigate → verification owner`；对暂不能判定删除的代码明确留 `INVESTIGATE` 并列生产入口核查办法，不伪称无调用。
- Subject/Fact/Temporal/Participant/Perspective 与 Worldless/multi-World/没有 Clock 的场景有**足以实施的最小物理数据/权限方案**；保留确切哪些字段待实现期验证/调整。
- 原 Native Authority publication、V3 Effect/Context、Prompt Effective/Wire 的权限和 Domain Receipt 关系已确权；产品活跃旧接口切线和中止旧写入目标明确。
- 为现实测试列好位置：原有 unit/Node/DB/E2E/Studio/Play/三端用例、并发/回档/损坏恢复/隐私/长会话预期；**不将尚未实现功能的运行通过作为“允许开始写代码”的先决条件**。

**只有实施后才能真正获得的 Gate 1～4 证据**：新增 ABI 的 Node 运行测试、跨 Session/Branch 存储迁移与持久化、真实 Provider Wire/Play/Studio 演示、性能压力/GC 和 Windows/CachyOS/Android Termux 真机结果。它们是**正式实施和发布验收门槛**，不能在“仅讨论、不修改产品代码”的阶段凭空填 PASS，也不应把用户锁在永远无法运行新功能测试的前置循环里。

## 5. 最小必要测试（未来，不是已执行）

| 场景 | 通过条件 | 对应消费者/既有测试线索 |
| --- | --- | --- |
| 阿洛在 Worldless/多 World 中因交易正式出现 | 一次 Domain 操作确立稳定 Subject、世界后果、合法事件来源与原收据；不同 Session 不共享变动 | `tests/game-runtime/world-session.test.js`、`tests/native/authority-publication-c3.test.js`、`tests/native/durable-commit.test.js` |
| 两条支线产生不同皇帝 | 查询旧 Revision/游戏 T5 与新 Revision/T13 得到有来源、权限安全且正确的事实 | `tests/native/history-session.test.js`、`tests/native/save-system.test.js` |
| 模型和 Game reducer 分别报告“交易成功” | 仅原领域合法 Receipt 能证明真实效果，过期/双重扣钱不能写入 | `tests/native/authority-publication-c3.test.js`、`tests/game-runtime/world-session.test.js` |
| 阿洛与“苍鹰”的秘密真身 | Host 内部可跟踪同 Subject，米拉/NPC 的 Provider Wire/HCM/Play 没权限时不见真相 | `tests/native/information-runtime-p6.test.js`、`tests/native/cognition-disclosure-s16.test.js` |
| 旧“莱恩是皇帝”KnowledgeEntry | T13 当前身份为米拉，旧来源仅按历史/文献/错误信念进入合法 Context | `tests/native/knowledge-runtime.test.js`、`tests/native/context-compiler.test.js` |
| HCM/媒体/检索/旧异步结果失败 | 已提交世界事实仍正确，重建 Context/索引不可增补真相或跨 Branch 泄密 | `tests/native/long-term-storage.test.js` 和后续真实现役测试 |
| 多回合/大量冷 NPC/三端 | 适用的关键身份与因果不漂移、Token/持久化成本受控；真实日志/截图/环境版本齐全 | 长会话/性能/E2E/Windows/CachyOS/Termux，当前无通过证据 |

优先补强真实业务边界已有测试；拒绝为假设分支兼容写数十个防御性空洞用例。

## 6. W19 三种收口方案（均未获用户选择）

**W19-A · 仅从现有 Snapshot 按文本追溯**：不新增受约束的稳定世界主体/Fact Transition 语义，只读 `atri_world_state`、聊天和 HCM，在请求历史时交由 LLM 推断事实何时成立。开发初期轻量，但 W13/W14 的双时间/身份/秘密裁决不可复现，保留事实错误漂移。

**W19-B · Session 原生最小 Subject + 来源型 Fact Transition / Revision-Tick 双锚查询 + Gate 0 证据收口（推荐）**：利用现有 Session/World State/已提交 Domain Event/Action Receipt/History 的物理基础，必要时增加少量正式 Subject/Fact Transition 合同，提供 `asKnownRevision → asOfGameTick → Authorized Audience` 的只读投影；对于 Worldless/缺 Clock 的游戏保留明确不支持该类 GameTick 查询的合法策略；Gate 0 以可执行 Owner/Caller/Target/Deletion/Tests 和最终集成 HEAD 完成为退出，而不是要求尚未实现的跨端测试已通过。**不建第二 World DB**，并保持 W18-B 的最小差异。

**W19-C · 一次性打造全领域独立 Bitemporal FactStore**：所有历史、NPC 认知、World State、HCM 和 Knowledge 强制写入新的通用数据库，再异步同步 Native Session；查询看似统一，但会造成双权威、GC/事务分叉和大量旧数据适配，与 W12/W17 相冲突。

**研究推荐 W19-B，尚未获用户批准**。本轮讨论聚焦 ① Session-owned 最小物理事实持久化候选，② 原生两段历史查询语义，③ Gate 0 的真正退出和实施后验收分界。若确认 W19-B，下一轮应按约定先写入同一 Plan/唯一 Record，再针对目标 HEAD 明确最小 Schema/接口命名及实际生产消费者的按文件 cutover 工程包，并作完整企划能否最终交接的审计，而不是继续增加任意新架构。
