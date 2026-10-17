# ARCH-DWE-01 · W20 Gate 0 最小原生合同位置、Consumer 工作包与最终交接门槛（讨论稿）

- **任务路由**：`ARCH-DWE-01` / Primary Workspace `docs`；[唯一 Plan 入口](index.md) · [累计设计](design.md) · [W19 已确认 Session/时态方向](e0-gate0-physical-contracts.md) · [W18 消费者矩阵](e0-minimal-contract-cutover.md) · [W15 E0 阻塞](e0-final-closure.md) · [唯一 Record](../../../records/architecture/world-evolution-consistency.md)。
- **状态：Draft / W20-B 总体方向已获用户确认**。W1-B～W20-B 为已确认的设计/收口路线；§6 保留原本的 W20-A/B/C 比较，正式确认见 §8。**P1/P2 物理位置、精确 ID/Schema、实际调用方与最终工程计划未获批准**。E0-01～09 仍 PARTIAL / BLOCKED，未授权产品实现。
- **本轮目标**：避免继续只谈抽象概念，具体追问 **在哪个 Session 资源/原生 Authority 下保存身份、怎样让动态 NPC 的名字与事实真正参与提交和历史查询、哪些实际生产消费者需一次性切线、Gate 0 何时有充足证据交给开发**。
- **版本锚点**：2026-10-17 GitHub Branch GET 再核验：`main=c57fada6edeea255b29d857ba2585c1dbc9c098b`、`refactor/atria-native-orchestration-v3=a7cb649d0cd12cdaf7d7e91e96e654ba6261fea9`、`refactor/atria-native-prompt-preset-deepening=760327891149216dffdc1e3fa0c846496007a013`、`feat/native-visual-generation-deepening=ae587be0c64487ba922528bdd0146444bcf5e92e`。这些是本轮定向审计基线，不是未来集成后的固定产品 HEAD；只读源码/目录/搜索结果，未运行任何产品测试。

## 1. 目前能确定的物理接口：不是“一切都往 atri_world_state 塞”

已读到的 `main` 关键结构：

1. **原生 Revision 根**：[`src/native/session-core.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/session-core.js) `_publishLocked` 汇总 `states`、Timeline/Knowledge Heads、原 Action/Task Receipts，生成 `revisionId`，交给 `SessionRepo.commitSnapshot`。Session 状态的多个 Namespace 可以在同一 Revision 一起发布，但**并非跨外部服务的一次数据库事务**。
2. **World State 特定布局**：`initialWorldState` 的 `atri_world_state` 根下有 `primaryWorldId/worlds[worldId].{worldRevisionId,state}`，Worldless 可有 `initialState`；World/Package baseline 本身被固定为作者资产。**不能把人物身份直接定义成“worldId + 姓名”或强迫所有游戏选 World**。
3. **History 受特定合同支配**：`atri_lifecycle.history` 对已声明的 Domain 保存有 Source 的 `fact.key/tick/previousId` 等，但 `validateHistory` 会校验声明、预算和来源，未声明的 Session 不可“借用”其可写历史。`queryHistory` 仅支持 `kind/facet/id` 和当前 Snapshot 的受限查询。**不能把它当通用公开 World FactStore**。
4. **通用 State Patch 并不代表通用授权**：`SessionCore.applyRuntimeCommit` 在特定 `authority-first` 模式会拒绝对 `atri_world_state/atri_game_runtime` 的非 Typed Publication，并经 `_publishLocked` 验证。本轮额外审读 [`src/native/session-snapshot.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/session-snapshot.js) 的 `RESERVED_SESSION_NAMESPACES`，明确枚举 Session Core、Timeline、Knowledge、Action Receipts、Lifecycle 等禁止 Generic Patch 的命名空间。**若未来 Subject/Fact 放进新增 Namespace，必须同步纳入全模式的 Reserved/Typed 保护与原生验证，绝不可仅建一个可被普通 `statePatch` 修改的 `atri_world_subjects`**。即便直接挂在 `atri_world_state` 根，也必须对 Game World reducer 和 Generic Runtime 的写入权限分界做同样的类型化校验。
5. **原生写者确有不同入口**：[`world/session.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/public/scripts/native/experience/world/session.js) `commitEvents` → `session-runtime.js.commitStatePatch` → `SessionCore.applyRuntimeCommit`；`authority-transaction.js` 的 `prepareAuthorityPublications` 则不持有存储 writer，由 SessionCore 发布。两条业务模式不可直接互相假冒，也未完成跨入口原子性验证。
6. **存档/修订闭包**：`save-system.js` 以 `revision.stateHeads` 枚举可迁移 Namespace，沿 `core.parentRevisionId` / Branch forks 收集依赖；`state-delta.js` 仅对 `atri_world_state` 做专用 snapshot/delta。**新增受保护 Namespace 会增加存档/导入/GC/重量和 State budget 的实际消费者**，不能只在 `_publishLocked` 加一个 Map 就称持久化闭合。

### 1.1 候选物理位置（本轮 B 路线下仍需 Gate 0 最终决议）

| 物理方案 | 优点 | 必须防止的具体问题 |
| --- | --- | --- |
| **方案 P1：在受保护的 Session-owned world root 扩充最小 Subject identity / Fact source refs** | 与 `atri_world_state` 的 World/Worldless、多 World 和现有 `state-delta` 读写关联较近，减少新增 State Namespace | 对 World schema、前端 `statePatch`、Game reducer 来说可能仍可被旧通用写入口覆盖；需真正做到**Typed Authority-only** 的受保护子树及合法事件合并 |
| **方案 P2：一个原生 SessionState 专用、显式 Reserved 的 Subject/Fact compact state namespace** | 独立于 World 定义书自身的形状，跨 World/Worldless 作用域更清晰；可由同一 `SessionRevision.stateHeads` 在一次 Native Commit 发表，不是新数据库 | 必须新增 Reserved/Gate、业务 validator/Domain Commit、Save/Restore/GC/History/Context/Frontend 消费者；否则新的 Namespace 成为匿名 Raw Patch 后门和重复事实副本 |
| **方案 P3：直接将所有 Subject 写成 Package Actor 或 Lifecycle History facts** | 表面复用既有 Actor/History | 会破坏不可变作者资产、无 Lifecycle/Worldless 模式以及 Cognition/HCM 权限语义；不推荐 |

**本轮建议优先按 P1/P2 的安全和最小真实消费成本选一，不以 Namespace 数量决定架构好坏。** 无论选择哪种，`Subject` 唯一身份及事件来源应只在 Native Domain 有写权；`Fact` 可以由**同一次领域提交中经过验证的原 State/History/Event/Receipt** 推导，不必在 Subject namespace 中再复制所有业务字段/余额/职位。最终物理布局要通过 Gate 0 源码审计确认。

## 2. 尽量少的持久字段（候选最小 Schema，不是已实现接口）

```ts
// Draft logical *physical delta*; many refs can be derived, not persisted twice.
SessionSubject {
  subjectId: OpaqueStableNativeId;        // may need a small new ID family
  kind: "person" | "place" | "group" | "object" | ...;
  originRef: AuthoredDefinitionRef | NativeAdmittedEventRef;
  worldScopes: SessionOrWorldScopeRefs;   // empty World selection remains valid
  admittedAt: NativeDomainRevisionRef;    // filled by original Domain commit
}

CausalFactRef {
  owner: SubjectRef | RelationRef;
  slot: TypedDomainOwnedFactKey;          // not a text-extracted key
  changeRef: CommittedDomainEventRef;
  validFrom?: CanonicalGameTick;         // omitted/unknown when no clock
  validUntil?: CanonicalGameTick;        // asserted only by authoritative transition
  supersedes?: CommittedFactRef;         // legally proven correction/expiration
  // values are held in original Domain State / History when already authoritative
}

EffectiveWorldQuery {
  sessionId, branchId, asKnownRevisionId,
  asOfGameTick?: CanonicalGameTick,
  audience, purpose, sourceGrantDigest,
  worldScope?, subjectFilter?
}
```

**关键约束**：
- `subjectId` 不能被 Character Card/Template `actorId`、HCM Entity ID 或名字替代，也不能因改名、死亡、切 Game Tick 或换分支重复生成。不同 Session 的相同 Authored Definition 可以合法有不同 Subject 实例。
- 持久的 `admittedAt`、`committedRevision` 或 `eventRef` 需结合 `_publishLocked` 已分配 Revision ID 的正确顺序和内容哈希/幂等恢复决定是否可推导；不能让客户端传入伪造的正式修订或作用域证明。
- Fact 仅包含领域规则能解释和未来规则/历史/承诺需要持久化的有因果字段；`freeform paragraph` 是 Knowledge Source/Claim，不自动生成事实/Subject。
- `validUntil` 不是简单“后一条事件必然终止”，因为每种 Domain 规则的持续性不同；事实未记录时间不意味着永远成立。不同 Clock 的时间单位和跨 World Scope 的时间不可随意比较。
- 所有 Projection 必须能以 exact Revision/Branch/Source/Scope/合法 Audience 重建，不创建第二个可写 `EffectiveWorld`、Actor registry 或独立 EventStore。

## 3. 有效历史读取：先确保旧 Revision 可达，再按已承认的游戏时间查询

**候选读取顺序**：
1. **Revision 溯源**：Host 加载请求者被授权的 exact Session/Branch/Revision，核对祖先可达和必要 SavePoint/资源保留；若 Revision 已被 GC 不可访问，返回明确 `unavailable`，不能从当前世界“猜回去”。
2. **领域当前/历史事实**：从该 Revision 所属 State/受限 Domain History/正式事件引用读取有事实键和起止规则的状态链；按已声明 Clock 查询 `asOfGameTick`。没有 clock 的纯叙事游戏只支持准确的 Revision-order / sourced history，`asOfGameTick` 不得凭空出现。
3. **来源与可见性**：根据 Audience/Source Grant/Epoch 和对应世界时间过滤 Subject/身份/事实/传闻；不允许查询 secret identity 的 ID、统计聚合、错误解释或 SourceRef 自身泄漏真相。
4. **结果解释**：区分 `current / historical / superseded / disputed / source_claim / actor_belief / unknown`；确切 Fact 需要来源 Event、时间、Revision，`unknown` 与 `not occurred` 是不同结论。
5. **缓存与分页**：按 `Session/Branch/Revision/ClockId/Tick/World Scope/Audience/GrantDigest/epoch` 锚定读投影和游标，缓存失效不得依赖全局 mutable HEAD；长会话优先使用已提交 State Heads 与有界索引，不每轮重播全部 JSON/HCM。
6. **普通玩家/Inspector**：普通玩家只能看到已知世界，人设秘密也不可经 Inspector 原始 Source 旁路泄漏；有正式作者权限的 Studio Inspect 可以看完整作者法则，但它的 Authored Preview 不代表 Play 的未来动态历史。

### 3.1 T10 死亡、R30 才得知：具体演算

- R10/T10，莱恩已死亡却尚未被 Player 的合法视角获悉（Host 在 R10 是否确立死亡取决于正式事件与世界证据；**不能笼统假设未来 R30 的证据会逆写 R10**）。
- R30 后证据追认死亡在 T10 生效；`asKnownRevision=R30, asOfGameTick=T11` 可以查出死亡，带 source/provenance/validity。
- `asKnownRevision=R10, asOfGameTick=T11` 必须按 R10 当时已正式确立的知识及其角色权限查询，不可照搬 R30 的未来追认。
- T13 的偏远 NPC 尚未收到死亡消息，Private Perspective 可以保留旧信念，而不把“莱恩仍在位”重新升格为 World Truth。
- 从 R10 之前的 SavePoint 分叉后，R30 在另一线发生的追认不得污染当前分支；同源 Subject 可继承身份、不同线的状态/认知独立。

## 4. 更接近交接的实际 Caller/Consumer 分包（但仍非完整动态运行证据）

本轮调用了 GitHub 默认分支代码搜索和固定 main SHA 下文件读取；搜索结果只代表**符号命中的候选生产文件**，特别无法完整覆盖动态插件与未合并分支。请勿把下面的生产文件数量当成完整真调用次数。

| 工作包与优先级 | 当前已定位的生产入口/消费者 | 必须确认的 Owner / old → target 和禁止双轨 |
| --- | --- | --- |
| **WP-A · P0 原生世界写入/主机路由** | `src/endpoints/native-session.js` (`applyRuntimeCommit`、`finalizeTurn`)、`src/native/session-core.js`、`authority-transaction.js`、`public/scripts/native/experience/logic/runtime.js`、`experience/world/session.js`、`public/scripts/native/session-runtime.js` | Domain Typed Action/State/Receipt 的真实入口；保护 World/Subject 原生写入，旧 Generic Patch 的 Authority-first guard 不得被绕过。对一次交易如何避免 World reducer 与 Narrator 两处提交同一效果提供可运行验证 |
| **WP-B · P0 主体/历史/存读档** | `identity.js`、`contracts.js`、`session-snapshot.js`、`repositories/session-repo.js`、`save-system.js`、`state-delta.js`、`history-authority.js`、`native-history-runtime.js` | Subject 身份/FactRef 的最小物理落点、Snapshot/Delta/GC/Save 的完整闭包；官方 as-of 读 API 和早期历史检索的 Source 许可 |
| **WP-C · P0 Cognition/Perspective 授权** | `native-information-contract.js`、`native-information-runtime.js`、`cognition-authority.js`、`tom-authority.js`、`memory/eligibility.js`、V3 `context-port.js` | 从 Manifest-only Actor 声明切换到 Native 动态 Subject 的合法 Scope/Source/Grant；不通过角色卡、HCM 相同姓名或外部查询得到私人权限 |
| **WP-D · P0 Prompt/Context 有效世界** | `knowledge-runtime.js`、`knowledge-selection.js`、`context-compiler.js`、V3 ContextPort、Prompt 分支 `prompt-compiler.js/semantic-blocks.js/draft-preview.js` | Author Law/Initial/Current/Historical/Source Claim/Private Belief 按受众与有效时间裁剪，合法 Context 来源先于 Token/Provider Wire；现有 `rank` 不是自然语言冲突判定器 |
| **WP-E · P1 Timeline/Host/Media/Play** | `native-frontend-host.js`、`frontend/host-services.js`、`play-product.js`、`session-projection.js`、Speech/Visual/Illustration | Participant 与表达 ActorProfile/显示别名分离，Host 方法公开 Schema 先于 UI，不能因主体真实关联而泄漏可见身份 |
| **WP-F · P1 Library/Studio 与 Legacy 删除收口** | `world-knowledge.js`、`world-editor.js`、`studio-worlds-editor.js`、`studio-knowledge-editor.js`、`studio-entrypoints-editor.js`、`atri-world-info-*`、旧 Orchestrator adapters、插件/Extension SDK | 作者资源稳定/自由文本一等、Studio Effective Preview/Inspector；旧组件逐个查 `retain/replace/delete/investigate` 和插件 API，不是批量抹掉 Legacy 目录 |

**真正的 Gate 0 退出需要**将 WP-A～F 的关键每一条生产链补充为 `entrypoint / caller / state owner / source / target / public ABI / deletion decision / planned verification`，记录被锁定的**最终整合 HEAD**。本轮只提高“候选调用链与物理约束的明确度”，**E0-06 仍 OPEN**。

## 5. Gate 0 与正式实施 Gate：怎样避免“永远达不到开工门槛”

**Gate 0 (开发前必须做够的证据)**：
- 固定实际开始开发时的 main+有接口重叠的分支 HEAD（V3/Prompt/Visual）；特别验证独立进行中的项目合并是否改变 `ContextPort`、`finalizeTurn`、`Prompt Compiler` API。
- `Subject/Fact/Time/Participation/Perspective` 物理最小语义和 Owner/Native write guard 有可实施的具体选型，特别在 P1/P2 中决定原生保护路径；明示 Worldless/多 World/无 GameClock 的行为。
- 每个生产职责有可定位的文件/调用链以及 `retain/replace/investigate/delete` 证据。**没有证明可删除的文件就不能列 DELETE；但可以把“验证后清退旧权威路径”明确列进工程包，不为旧数据保持永久兼容。**
- 确定跨 Domain Commit/Run Receipt/Context/Prompt 的授权与事务依赖、主要失败/回滚/旧分支重试边界、开发实际阶段排序和测试计划。
- E0 尚缺的实现期证据明确归入 Gate 1～4，**不要求当前未实现的功能提前实测通过**。Gate 0 可以在有关闭方案/责任人/实现路径的前提下进入正式开发申请；只有用户最终批准整份 Plan 后才能创建产品分支。

**Gate 1～4 (开发后才可真实验收)**：Schema/Node/DB/持久化/Save/Branch、来源/认知权限与上下文 Provider Wire、Studio/Play UI、长会话与 Windows/CachyOS/Termux 真实三端。现阶段无任何已运行证据。

## 6. W20 路线选择（均未获用户批准）

| 方案 | 做法 | 主要风险 |
| --- | --- | --- |
| **W20-A · 直接指定新 `atri_world_subjects` 并发布完整正式 Schema** | 把所有实体、事实、历史、知情与权限统一写进新的 Session namespace，再用 Common Adapter 对旧 World/Info 对接 | 新 namespace 若未同步 Reserved/Typed guard 会形成 Raw Patch 后门；叠加已存在 World State/History/Cognition 则多份 Truth，具体调用方仍缺证据 |
| **W20-B · 受保护 Session-owned Identity + Domain-owned Fact transitions / Two-anchor Query + Consumer Work Packages（推荐）** | 明确 Session Subject 身份必须受 **Typed Native Publication** 保护；事实由原 Domain State/History/Event/Receipt 负责、按缺口补少量 Transition metadata；先选 P1/P2 最小安全物理位置再确定具体字段；以 WP-A～F 及最终集成 HEAD 验收 Legacy 断点和开工前 Gate 0 | 需要完成新 Protected namespace/root 的合法写入和 Save/GC 全调用审查、Story 与 Game World 的跨入口一致性方案；当前不能声称 Gate 0 通过 |
| **W20-C · 先把所有 World/Knowledge 内容转换成永久三元组和大型全域历史 Graph** | 将过去的作者资料、HCM 知识、动态状态全部提前转换并逐轮写入全域可变 Graph | 创作负担高、历史漂移、双写/权限冲突、Token 与 GC 负担，不符合 W2/W8/W12/W18 |

**W20-B 是当前研究推荐，尚未获用户确认。** 它进一步解决 W19-B 的真正安全遗漏——**新 Subject 物理位置必须和原生权限/Domain Publish/Save/GC 一起设计，不能因 SessionRevision.stateHeads 可以存任意 namespace 就默认任何写路径合法**。

## 7. 剩余阻塞及 W21 是否应转向最终企划交接

本轮保留的最小 E0 Gate 0 决策不是十七轮的新架构补充，而是：
- **E0-01**：P1 vs P2 的受保护物理布局、稳定 SubjectID 实例化、兼容 Worldless/multi-World 的 Domain Fact owner；
- **E0-02**：Native World reducer/Authority Turn/Orchestration Result 的正常与未知提交路径到底如何协调 Domain Receipt、正式 Participant 与发表；
- **E0-03**：无 Game Clock 时的有效时间降级；通用两个锚点下的来源/纠错查询如何由现有 Snapshot/History/Event 有界实现；
- **E0-04/05**：动态 Perspective 的最小合法授权与 Source-Claim Context 筛选，怎样在 V3 ContextPort 当前接口里安全接入；
- **E0-06/09**：WP-A～F 最新目标集成 HEAD 的每个生产入口/消费者/插件依赖以及可证清退路径；
- **E0-07/08**：真实 UI 与长会话/三端执行验证列入 Gate 1～4，不伪称目前已通过。

如果用户确认 W20-B，下一轮应进行**正式交接收口审查**：将 P1/P2 选择所需的准确代码位置、每个 WP 的 Owner、技术前置与 Gate 0 未解决项压成一份具体、可让 Codex 执行的阶段计划，并判断是否达到最终企划定稿申请条件。**此前一切依然 Draft，未经用户明确授权不得创建 feat 分支或修改产品代码。**


## 8. W20-B 用户确认（2026-10-17）

用户对上一轮明确推荐的 **W20-B「受保护 Session-owned Identity + Domain-owned Fact transitions / Two-anchor Query + Consumer Work Packages」**回复「认同」，将其记录为 ARCH-DWE-01 已确认的**总体架构/工程收口方向**。因此 W1-B～W20-B 已获用户认可。

本次真正确认的是：
- **受保护身份**：新涌现 NPC 的正式 Subject 在现有 Native Session/Revision 权威内持久化，具合法来源与固定分支祖先；无论物理选择 P1（受保护 World Root）或 P2（受保护 Session State Namespace），**必须同时保证 Typed Authority Writer / 校验 / 统一发布 / Save/Restore/GC / 限制 Generic Patch**。不能让普通模型、插件或其他 Runtime 因数据放入 Session 就获得世界写权。
- **领域事实分工**：交易、职位、关系、日程、生命周期等事实继续归实际 Domain Owner；需要长时间保留因果时，只补来源型 Fact Transition、Revision/GameTick 与必要索引。不要在 SubjectStore 再存各域权威真相、建立第二 EventStore 或平行 Temporal DB。
- **授权查询**：明确 `asKnownRevision → asOfGameTick(若有合法 Clock) → legal Perspective/Source Grants`，不为 Worldless / 纯叙事模式伪造精确游戏时间；来源/身份秘密不能在时间查询或 Inspector 泄露。
- **执行与清退**：WP-A～F 按 Native Authority / History/Save / Information/HCM / Context/Prompt / Timeline/Media/Play / Library/Studio/Legacy 分工，采取实际 Consumer 证据驱动的原生硬切，不按名字盲目删除 legacy 文件、不给 Dev 项目建立长期数据兼容双写。
- **Gate 区分**：开发前 Gate 0 需要足以开工的 Owner、接口物理落点、真实主线/相关分支 HEAD、写入保护与 Consumer/Deletion 计划；实施期 Gate 1～4 才取得新增功能的 Node/CI/数据库、Play/Studio、长会话及 Windows/CachyOS/Termux 真实结果。

**未批准、不能冒称已完成**：P1/P2 的实际选型、任何 `subject_*` Native ID family、正式 Typed Subject/Fact/Host ABI/有效时态算法、完整实际调用图和产品文件删除、V3/Prompt/Visual 的最终整合 HEAD、E0-01～09 PASS、整份企划定稿或创建实现分支。

**W21 下一轮**进入同一 Plan Bundle 的 [e0-final-handoff-readiness.md](e0-final-handoff-readiness.md)，对 P1/P2 安全和存储闭包、关键生产链/所有者、WP-A～F 依赖、Gate 0 的明确可交接/不可交接条件开展正式开发交接前的最终收口审查。W21 的路线仍是候选，**尚未获得用户选择**；整个 Plan **Draft**。
