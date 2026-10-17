# ARCH-DWE-01 · W22 最终 Gate 0 交接证据、原生 P2 Schema 安全与实施分工（讨论草案）

- **任务**：`ARCH-DWE-01`，Primary Workspace `docs`；唯一 [Plan 入口](index.md)、[累计 Design](design.md)、[W21 P2 优选方向](e0-handoff-evidence-review.md)、[E0-01～09 总表](e0-final-closure.md)、[唯一 Record](../../../records/architecture/world-evolution-consistency.md)。
- **状态：Draft / E0 PARTIAL-BLOCKED**。用户已确认 **W1-B～W22-B** 总体设计与证据收口路线；本文件 §6 的 W22 A/B/C 属讨论历史，最新明确确认见 §8。**完整 Gate 0 PASS、物理 Namespace/ID/Schema、全案 Approved/Final、开发分支与测试通过仍未获批准**。本模块不修改任何产品代码。
- **目标**：将先前二十一轮讨论压缩为可复核的最后一组工程交接前置证据，不再为避免做决策不断引入全新架构概念；特别补齐 **P2 单 SessionRevision 下的受保护身份证明、Source Fact/History 双锚读接口、Typed Effect 的合法入口、跨六个工作包的真实生产消费者/清退计划**。
- **静态源码锚点（2026-10-17，经 Branch GET 再确认）**：
  - `main=c57fada6edeea255b29d857ba2585c1dbc9c098b`；
  - `refactor/atria-native-orchestration-v3=a7cb649d0cd12cdaf7d7e91e96e654ba6261fea9`；
  - `refactor/atria-native-prompt-preset-deepening=760327891149216dffdc1e3fa0c846496007a013`；
  - `feat/native-visual-generation-deepening=ae587be0c64487ba922528bdd0146444bcf5e92e`。
  此为**静态审阅快照，不是未来集成 HEAD**。没有在本轮执行 Node、单测、浏览器、CI、三端实测或完整工作树静态 call graph；不得把代码位置存在当作功能验收通过。

## 1. 已确认方向和本轮唯一核心取舍

W21-B 确认：**P2 优先**——在现有 Native Session/Revision 的 `sessionState` 文档体系里，给 Canonical World Subject 建**一个受保护的最小身份/来源/作用域状态**。这是同一 Session Revision 的组成，不是新的数据库、独立 Entity Truth Service 或新的 World Fact Domain。

原生已验证基础：
- [`session-snapshot.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/session-snapshot.js) 已有 `RESERVED_SESSION_NAMESPACES`、`readSessionSnapshot` 对任意 `revision.stateHeads` 的状态读取与哈希校验；**它尚没有未来 Subject 的业务验证**。
- [`session-core.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/session-core.js) `validateRuntimeStateChanges` 拒绝通用 Patch 覆盖 Reserved Namespaces，`_publishLocked` 在单 Revision 候选内统一检验/写入；某些 `authority-first` 游戏还拒绝未经 Typed Authority 的 World Patch；**其他模式的 P2 写入必须单独审计**。
- [`session-repo.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/repositories/session-repo.js) `commitSnapshot` 将不可变 State Heads 与原生 Revision/Commit Receipt 在一次事务内发布；`loadSnapshot` 通过正式分支祖先可达性验证旧 Revision。
- [`save-system.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/save-system.js) 通过 `revision.stateHeads` 及 ancestry 收集存档，剔除 `NON_PORTABLE_STATE_PATTERNS` 类型缓存；**P2 属正式身份状态，必须 portable 且由导入校验**。
- [`session-repo.js:reachabilitySnapshot`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/repositories/session-repo.js) 从保留的 Revision 标记 State Heads，[`session-maintenance.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/session-maintenance.js) GC `sessionState`；**P2 无需新增资源 kind，但若将身份拆成外部子资源，现有 GC 不会自动知道新增引用**。
- [`state-delta.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/state-delta.js) 目前只为 `atri_world_state` 提供 Snapshot/Delta。P2 的无专用压缩是已知存储劣势，须控制其记录内容为最小身份并在实现期测长会话写放大。
- `SessionCore.updateResources` 可在 Session 中变更 `worldSelection`、重建部分 World Root；P2 独立 Session 身份不会被重建 World JSON 自然抹去，但**解绑 World 后已关联 Subject 的 scope/事实是否合法仍需 Typed Validator 明确裁决**。

**本轮新增的设计结论**：P2 首先作为**最小受保护身份索引**。游戏规则实际占有金钱/职位/生命/关系等事实继续归所属原 Domain State/Event/History；可追溯 `FactTransition` 只补不能可靠从现有事件/快照/Receipt 推导的有效时间、来源或更正关系，不强制同步复制同一事实值。

## 2. P2 最小物理 Schema 的候选约束与真正需要改动的代码

以下是**待交接时冻结的逻辑字段方向，不是可直接复制运行的 JSON Schema**：

```ts
type SessionSubjectIndex = {
  schemaVersion: number;
  subjects: Array<{
    subjectId: NativeStableId;          // exact ID family/namespace not frozen
    kind: "person" | "group" | "place" | "object" | string;
    originRef: AuthoredDefinitionRef | CommittedAdmissionEventRef;
    worldScopes: WorldScopeRef[];       // Worldless and cross-World legal
    admittedBy: HostVerifiedCommitRef;  // host-issued revision/receipt, never model-signed
  }>;
};

type AuthorizedWorldAsOf = {
  sessionId: SessionId;
  branchId: BranchId;
  asKnownRevisionId: RevisionId;
  asOfGameTick?: CanonicalGameTick;     // only when declared; reject unsupported tick queries
  requestedSubjects?: SubjectRef[];    // selectors do not grant visibility
  purpose: "runtime" | "context" | "display" | "inspect";
  authorityGrant: NativeHostCapability; // precise wire shape to be owned by Host
};
```

在正式 Gate 0 作出文件级决定以前：
- **Namespace 名与 ID family 不冻结**：P2 候选可有类似 `atri_world_subjects`，但不允许仅因为代码示例而无证据新增永久概念。
- **正式 Revision 引用的时间点要可解释**：`SessionCore._publishLocked` 生成 `revisionId` 后可供同一次合法 Domain publication 使用；但正式 Subject admission 必须与有效提交/幂等 Receipt 一起验证，不能让 AI 请求自填已提交 Revision。
- **初始化**：`SessionCore._create/initialWorldState` 与 Studio/EntryPoint 固定 World/Actor Definition 路径，须决定哪些作者已经宣告为正式存在的 Subject 在 Session 开局就接纳，哪些仍是无结构化背景或来源声明；不强迫每个文案名词自动实例化。
- **Generic Patch**：`session-snapshot.js` Reserved List、`session-core.js` 验证、`authority-transaction.js` Typed prepare、`_publishLocked` 校验/commit 必须形成单 Writer；前端 `session-runtime.commitStatePatch`、Game reducer、插件/host bridge 不得拥有直接修改 P2 的非授权出口。
- **Import/branch/GC**：`session-repo.js` `readSessionSnapshot/reachabilitySnapshot`、`save-system` restore/import closure、`session-maintenance`、`updateResources` 对 World scopes 的变更须遵循明确身份与来源的可达性；不得将跨分支同名实体无证据合并。
- **容量/性能**：P2 单文档若随每个小事实变化都重新提交，会放大保存/哈希/GC 开销；Subject identity **只在接纳/合法身份绑定变化时调整**，动态事实继续原 Domain Commit；必要时采用有界存储/分区，但必须证明当前 SessionRepo 存储与维护能处理，不能先引入新结构避免假想瓶颈。

## 3. 原生写入/叙事/编排的最小调用链与还没证明的缺口

| 生产 Owner / 符号调用链 | 真实已观察行为 | 必须交接给的目标合同与最后 E0 阻塞 |
| --- | --- | --- |
| `src/endpoints/native-session.js` → `SessionCore.applyRuntimeCommit` → `_publishLocked` → `SessionRepo.commitSnapshot` | 原生 Runtime Commands/State Patch 经服务端与 ExpectedRevision、Reserved 检验。特定 Authority-first 会拒绝 raw world patch | **WP-A/B**：增加只有原 Native Typed Domain 能写 Subject 的合法入口/Source Proof；普通 Generic Patch 无写权。E0-01/02 OPEN |
| `experience/logic/runtime.js` → `world/session.commitEvents` → `session-runtime.commitStatePatch` → 原 Native command | Game 模式可以合并当前 World State 与事件 Journal，并且受 Revision/ActionRequest 校验；但与 Narrator Turn 并非天然同一个事务 | **WP-A**：每种正式 Game/Authority Mode 的一次领域效果对应哪些 Session Revision/Receipt；Story 应怎样只发表已经正式确认的效果。E0-02 OPEN |
| `authority-transaction.prepareAuthorityPublications` → `SessionCore._publishLocked` | 现有正式 Authority Prepare 不直接获取存储 writer；`_publishLocked` 是后续统一发表点 | **WP-A/B**：未来 Subject admission/Fact 源的 Typed prepare 应沿正确 Domain owner 发布，确保不被 old Game reducer/Context 旁路。E0-01/02 OPEN |
| `SessionCore.loadSnapshot` / `NativeSessionObservation.history` → `native-history-runtime.queryHistory` | 能读取有合法 Revision anchor 的 History；该 History 的查询类型由声明的 `atri_lifecycle` 限制 | **WP-B**：为 Source Fact 增加真正受授权的通用 `asKnownRevision → asOfGameTick` 读投影而非修改 Chronicle 参数名字就宣布有双时间。E0-03 OPEN |
| `src/native/frontend/host-services.js` → `readWorldView/readChronicle` | Host World/Chronicle 读取当前是有限类别；`native-frontend-host.js` 对 Conversation `actorId` 有 Schema | **WP-B/E/F**：新读请求/Inspector 的真实 Host ABI + SourceGrant/受众权限，Play 不能看到未授权 Subject/aliases。E0-07 OPEN |
| `public/shared/native-information-runtime.js:informationContext/projectInformation` | Actor 视角依 Manifest/静态 Info views，且多处源码有实际消费者 | **WP-C**：动态 NPC Perspective 的由 Native Host 授权的受限 Source View，不能借用 Narrator/静态 Actor。E0-04 OPEN |
| `public/scripts/native/context-compiler.js` + V3 `context-port.js` → Prompt `prompt-compiler.js` | 当前 State JSON 和 Knowledge 文本按不同 lanes 编译，V3 的 SourceBinding/Grant/Currentness 是权限关口，Prompt Effective/Wire 负责语义和 Provider 输出 | **WP-C/D**：有效事实须以 Host 受权读结果入 Context，再按 Source Claim/历史/认知裁剪，替代旧自由文本作为 current 的错误用法。E0-05/09 BRANCH_RECHECK |
| `play-product.js`/Speech/Visual/Extensions/旧 WorldInfo | Actor 显示名与相关表达仍依 Manifest；旧 WorldInfo、旧 Orchestrator 有部分真实生产引用 | **WP-E/F**：Participant 真正身份与 Authored Expression 模板分开；旧通道以最终集成 HEAD + Plugin ABI 确认证据才 RETAIN/REPLACE/DELETE。E0-06/07 OPEN |

### 3.1 本轮新增的直接源码发现（main 基线）

- `SessionRepo.loadSnapshot` 在有 revisionId 的旧视图读取时会核对该 Revision 属于可达祖先，`NativeSessionObservation.history` 通过 `core.observe(handle, sessionId, {revisionId})` 取得选定 Revision 之后调用 `queryHistory`。**这是正确的两锚查询第一段，但第二段 Domain `asOfGameTick`/来源/受众动态 Query 还需要明确定义。**
- `public/shared/native-information-runtime.js` 的 `projectInformation` 已被 Cognition、Appraisal、Expression、Visual、Task、Goal、Shared Authority 和 Context 等多个生产调用方直接使用；动态 Perspective 切换不是一个局部 Schema 调整，WP-C 必须确保各 Consumer 的 Source/Grant 边界一致。
- `src/native/product-service.js` 的 `saveResourceSetup` 最终可能调用 `SessionCore.updateResources`，因此 WorldSelection 的实际 UI/服务变更不只是编辑器内部 JSON；P2 Scope 更新需有显式合法效果与历史来源。
- `public/scripts/agents/orchestrator/main.js` 仍直接处理 WorldInfo 风格字段，GitHub Search `worldInfoBefore` 与 `runLegacySingleRequest` 有生产文件命中；因此目前不能声称旧代码“已确定无现役消费者”或删去整个目录是安全的。
- `public/scripts/native/knowledge-prompt-channels.js` 的 `nativeKnowledgePromptChannels` 默认分支静态索引只命中定义和测试；这是**需要验证动态/运行时加载的清退候选**，而不是足以列为立即 DELETE 的完整证据。

## 4. WP-A～F 的实现依赖和验收边界（未来交接草案）

| 工程包 | 需要修改/核对的核心源码 Owner | 前置依赖与最小可验证产物 | 不可冒称当前通过 |
| --- | --- | --- | --- |
| **WP-A Native Domain Write** | `src/native/session-core.js`、`authority-transaction.js`、`authority-turn.js`、`src/endpoints/native-session.js`、`experience/logic/runtime.js` / `world/session.js`、V3 `native-turn-orchestration.js` | 原 Native Typed admission/action/event/receipt/Story publication 的真正合法顺序、未知提交幂等恢复、不同游戏模式防 raw patch；正式提交结果可追溯 | 仅凭 `commitSnapshot` 存在不能称所有 Narrative/World 效果已同事务 |
| **WP-B Identity/Fact/History/Storage** | `identity.js`、`contracts.js`、`session-snapshot.js`、`session-repo.js`、`save-system.js`、`session-maintenance.js`、`state-delta.js`、`history-authority.js` | P2 最小 Subject root 的校验/初始/导入/Branch/Scope/GC；领域关键事实有效时间的来源/纠错/Revision 锚，合法查询缺 Clock 和不可达 Snapshot 的行为 | 不因现有 `stateHeads` 可扩充就认为 P2 可写/可检索已经实现 |
| **WP-C Perspective/HCM/Permission** | `native-information-contract.js`、`native-information-runtime.js`、`cognition-authority.js`、`tom-authority.js`、`memory/eligibility.js`、V3 `context-port.js` | 动态 Subject 来源/SourceGrant/ScopeEpoch/撤销、同名/HCM 未决/秘密别名、每个真正读消费者的合法目标视角 | 不是“每个存在的 NPC 自动拿到 Narrator Context” |
| **WP-D Effective World / Prompt** | `world-knowledge.js`、`knowledge-runtime.js`、`knowledge-selection.js`、`context-compiler.js`、V3 ContextPort、Prompt semantic / Wire | 来源/事实的 current/history/claim/belief 用途区分，Context 先获合法有效视图才进入 Token/Provider Wire；旧 rank 仅用于排序 | 未实现的自由文本 Fact 失效不能声称 Prompt 当前已自动裁决 |
| **WP-E Participant/Frontend/Media** | `src/native/contracts.js`、`session-core.js`、`native-frontend-host.js`、`session-projection.js`、`play-product.js`、`speech-service.js`、`visual-continuity.js` | 真正游戏 Participant、可选作者表达 Profile、界面当前合法 alias/声音/外形映射到同一 Subject；隐私与分支正确 | 不因 Actor 卡重用就共享两名 NPC 的身份/记忆 |
| **WP-F Library/Studio/Legacy** | `world-editor.js`、`studio-worlds-editor.js`、`studio-knowledge-editor.js`、`studio-entrypoints-editor.js`、旧 `atri-world-info-*` 与 Extension SDK | Fixed Source/World Definition、起点实体和自由文本创作，Studio Authored→Effective Preview，Play Inspector；真实旧消费者 RETAIN/REPLACE/DELETE 分类 | 不能静态 grep 一次就宣称整个旧 World Info 或 Orchestrator 没用 |

**候选顺序（不是正式执行）**：锁定/审完新集成 HEAD 和 Gate 0 → WP-A/B 在同一任务分支建立受保护 Native Subject + Domain writes/History → WP-C/D 经 Host 许可接入 Context/Source → WP-E/F 消费者硬切与产品前端 → 实施期 Gate 1～4 的 Node/DB/权限、长会话/持久化、真实 UI 和 Windows/CachyOS/Termux。某些任务可以按真实依赖并行准备，不强制每个小阶段停下。

## 5. Gate 0 的**可交接与不可交接**证据标准（本轮关键）

### 5.1 能在当前 docs 讨论阶段产生、必须有负责人和内容的证据

- **E0-01 P2 可信写入合同**：明确一个实际 Native `sessionState` Protected Root 的设计和完整的 `initializer → typed validator/prepare → publication → snapshot restore → save portability → GC reachability` 修改点；`subjectId/origin/worldScope` 的最少字段、Domain Receipt anchor 以及合法 Worldless/multi-World/resource selection 规则。
- **E0-02 事务/发表**：为 `authority-first` vs 普通 Game World reducer vs Narrator `finalizeTurn` 列真正活入口和业务 Owner，解释“已提交效果/已发表文本/未决执行”的状态协调与原 Domain Receipt/幂等/旧分支重试。**不得将两个独立 Native Revision 宣称成同一原子提交**。
- **E0-03 时间/存档**：确定 `asKnownRevision` 的合法历史读取入口、声明 GameClock 与 Tick 查询来源、有效区间/纠错的实际存放策略、GC 后不可达结果、不自动泄密的 Audience filter；没有合法 Game Clock 则仅 Revision-order。
- **E0-04/05 信息/生成**：动态 Perspective 的授权 Owner 与最小 grant 撤销、V3 ContextPort/Prompt 最终输入合同、何时把旧作者起点事实转为历史/Source Claim；不能把作者自由文本或 HCM 名称猜测直接提升为 Truth。
- **E0-06/09 Consumer/Branch Integration**：锁定**实际作为工程输入的 HEAD**，涵盖编排 V3/Prompt/Visual 等发生接口重叠的未合入分支；检查生产 import/call/dynamic plugin/公开 API，并给 WP-A～F 行项填 `RETAIN/REPLACE/DELETE/INVESTIGATE + owner + file/entrypoint + planned test`。**DELETE=0（当前无证据）不是最终必须保留所有旧文件**。
- **E0-07/08 体验/规模计划**：说明 Library/Studio/Play 信息架构和 Inspector 显示权限、现有性能/保存/恢复用例在何处增强，明确三端真实验收由实施期 Gate 执行，不将测试计划伪装成当前实测。

### 5.2 不能在当前 Draft 或仅远端静态读取中假装已通过的事项

- 最新合流代码真正的完整生产调用图、动态扩展入口检查和 ABI 冲突解决；
- 新 P2 Typed Validator/State/Import/GC 的 Node/DB 实测、真实 Subject admission 与跨分支 Replay；
- 新双时间 Fact/Query、动态 Perspective/个人记忆、Source Claim 与 Provider Wire 的实际生产行为；
- Web/桌面/移动 Native Play/Studio/Inspector 真 UI、长会话内存/存储和 Windows/CachyOS/Android Termux。

**证据边界说明**：这不是要求尚未实现的新功能在 Gate 0 “先通过”，而是需要一个**可实施且对现有代码负责的开发前方案**。但现在仍有 Gate 0 设计层的实质性问题（最终跨分支 HEAD、P2 精确 Typed Guard/Actor 消费者改造），所以不得标记 Gate 0 PASS，也不得把产品实现申请写成已经批准。

## 6. W22 的三条决策候选（未获得用户选择）

**W22-A · 现在直接把方案标记 Final/Approved 并开实现分支**：顶层路线已明确，但最后 Gate 0 的确切 P2 Validator/受众授权/跨分支调用图和业务入口所有权仍缺完整证据。跳过它们会让 WP-A/B 设计错误而使之后消费者反复改动，不推荐。

**W22-B · 收束为一份“具名阻塞 + 可执行 preflight + 条件化开发交接”的最终工作包（本轮推荐，尚未获用户批准）**：停止增加抽象架构轮次，把已经明确的 W1～W21 方向汇总为**唯一 Native P2 + Domain Fact/Context/Frontend 依赖和工作包**，将剩余 E0-01～09 具名赋予确切 Owner/文件、最小契约、验证目标和应收集的 HEAD/callgraph 证据。对尚未完全查清的实施 ABI 设置明确的 Gate 0 preflight 阻塞与退出条件，允许未来 Codex 在获授权后自行核实和作有证据的常规工程决策，禁止因普通测试/代码问题反复停下。**在 Gate 0/preflight 合同和全案最终批准之前仍保持 Draft，不创建实现分支**。

**W22-C · 暂不设最终审查退出点，继续无限讨论 P2/事件/权限新架构**：已重复 W15～W21 的收口结论，会放大文档和决策成本，不推荐。

**推荐 W22-B。** 其含义是**关闭新的设计主题发散，转向可执行的 E0 preflight**，而不是宣称 E0 已完成或下一条用户“认同”自动授权代码开发。用户后续仍需明确整份 Plan Final/实施授权；本轮只讨论和提交 docs。

## 7. 本轮交接状态（不是测试结果）

- 已具备：二十一轮选定的方向、P2 优先且与 Native Revision/State Heads/Save/GC 复用的静态技术理由、WP-A～F 的可能所有者和产物、明确 Gate 0 与实施 Gate 1～4 的职责分界。
- 仍缺 Gate 0 的关键证据：**最终实际集成 HEAD / 全活跃生产入口、正式 P2 Schema/Typed Publish、World reducer 与 Narrator Domain 收据协调、动态 Perspective 的合法创建及全消费者切线**。部分只能由未来最终集成分支与可执行审计核实，不能假设当前静态锚点永久有效。
- 真实运行 E2E/CI/三端、长会话持久化/GC 与 Provider Wire 都留待获授权实现之后。本轮没执行，不能写 PASS。
- 只有用户明确批准完整企划、满足真正的开发前 Gate 0 后，才可创建任务实现分支；本轮仍是 **Draft**，`main`、V3、Prompt、Visual 均未更改。


## 8. W22-B 用户确认：停止无限设计，形成可执行 Preflight（2026-10-17）

用户对上一轮唯一推荐的 **W22-B「具名阻塞 + 可执行 Preflight + 条件化开发交接」**回复「认同」。正式记录为 ARCH-DWE-01 第 22 轮已确认的**方案收口与下一步工作方式**。当前 W1-B～W22-B 均已得到方向性认可；**本次确认不是全案定稿、Gate 0 PASS、具体接口冻结或实施授权**。

W22-B 已确认的操作边界：

- **不再扩张抽象新架构轮次**。剩余讨论必须落到可执行 preflight：固定当前 Git HEAD、受保护 P2 Session Subject 的 Type/Validator/Writer/Save/GC、原 Domain Fact/Receipt/两段历史查询、非 Manifest NPC 的 Perspective/Participant、Knowledge/Prompt 的合法 Context 及 Legacy/插件消费者清退。
- **具名阻塞**。每项未闭合 E0-01～09 都指定实际目标 Owner、生产入口/依赖、可交付证据、退出条件以及是否必须在开发前解决；不能只列概念或凭静态 grep 将其标 PASS。
- **条件化交接**。在代码基线与接口所有权可确认、P2 安全与消费链方案具有可实施合同、Gate 0 的开发前责任已闭合后，才提出全案 Final/正式开发授权；若缺少证据，明确最小阻塞，保持 Draft，不能代用户创建 `feat/*`。
- **Gate 0 与实施期分离**。尚未实现功能的 Node/数据库/真实 UI/CI/Windows/CachyOS/Termux 验收属于实施后的 Gate 1～4；不能凭空填写 PASS，也不应把“先通过未实现功能的 E2E”设为开工门槛。
- **单 Native Host/原生硬切**。不添加独立 World Truth/EventStore、通用 SubjectAdapter 或永久 ST 双轨；仅对真实现役 Legacy/Plugin 接口在当前集成 HEAD 下判断 RETAIN/REPLACE/DELETE/INVESTIGATE。

**本轮 Preflight 执行记录与具名交接清单**见同一 Plan Bundle 的 [e0-preflight-execution.md](e0-preflight-execution.md)；该文件不是第二份 Plan，也不是用户已经授权实施的 HANDOFF。W22-B 确认本身**不自动批准** Preflight 中新增的具体 ABI/Owner 实施方案，整份 Plan 仍 **Draft**。
