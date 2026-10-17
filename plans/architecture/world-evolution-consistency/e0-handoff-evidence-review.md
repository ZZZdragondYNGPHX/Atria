# ARCH-DWE-01 · W21 最终 Gate 0 交接前审查、P1/P2 决策与执行门槛（讨论稿）

- **所属资产**：同一 Plan Bundle `plans/architecture/world-evolution-consistency/`；[唯一 index](index.md) · [累计 design](design.md) · [W20 已选总体路线](e0-gate0-integration-workpackages.md) · [W19 物理依据](e0-gate0-physical-contracts.md) · [唯一 Record](../../../records/architecture/world-evolution-consistency.md)。
- Task ID `ARCH-DWE-01`；Primary Workspace `docs`。
- **状态：Draft；W1-B～W21-B 的总体路线已确认，W22 最终 Gate 0 交接选型与精确物理 ABI 尚未确认。** §6 是 W21-A/B/C 的历史方案对比；本轮用户确认见 §8。E0-01～09 仍 PARTIAL / BLOCKED；没有获准产品代码修改、实现分支、CI、真实 UI 或三端实测。
- **W21 的任务约束**：到此为止不再无限增加“下一层架构”或重复上一轮抽象选项；要依据可引用的真实源码作出**优先物理落点、真实写入安全、原生历史/GC 闭包、WP-A～F 依赖、Gate 0 开工前证据与实际阻塞**的具体建议，供最后定稿审查与未来 Codex 实施交接。不能把推荐写成已批准 Schema 或声称 E0 PASS。
- **本次固定基线**（2026-10-17 GitHub branch GET 重新确认）：`main=c57fada6edeea255b29d857ba2585c1dbc9c098b`；V3 `refactor/atria-native-orchestration-v3=a7cb649d0cd12cdaf7d7e91e96e654ba6261fea9`；Prompt `refactor/atria-native-prompt-preset-deepening=760327891149216dffdc1e3fa0c846496007a013`；Visual `feat/native-visual-generation-deepening=ae587be0c64487ba922528bdd0146444bcf5e92e`。对未合入分支不能宣称当前主线已具相关 API；后续基线变更必须重新审查。

## 1. P1 与 P2：不是“多一个 namespace 就多一套数据库”

| 物理候选 | 已验证的复用基础 | 真实风险与额外成本 | W21 建议 |
| --- | --- | --- | --- |
| **P1 · `atri_world_state` 中受保护 Subject 子树** | `SessionCore.initialWorldState`、World state snapshot/delta、`world/session.js` 已有游戏世界内容及 reducer | `WorldState` 允许不同 Package/Worldless 形状与 `initialState`；`validateWorldState` 主要核查 World 绑定身份和 slots，原世界数据的合法写入口并非天然将 Subject 子树视为绝对受保护；尤其非 `authority-first` 普通 `commitStatePatch` 仍可写整份 World Root。多 World 容易将 Session 全局主体错误放入某一本世界 | **可行但需证明全模式子树写保护**；如果最终受保护改动范围和兼容硬切明显更小才采用 |
| **P2 · 同一 SessionRevision 的专用受保护 Native State Namespace，仅放必要 Subject 索引/来源链接** | `SessionCore._publishLocked` 多 Namespace heads → `SessionRepo.commitSnapshot` 一次提交；`readSessionSnapshot` 遍历 `revision.stateHeads` 读取不可变资源；`save-system.js` 通过 `revision.stateHeads` 收集可移植 states；`SessionRepo.reachabilitySnapshot` 根据 `stateHeads` 标记引用供 GC；`session-maintenance.js` 清理未可达 `sessionState` | 必须在 `RESERVED_SESSION_NAMESPACES`、`_publishLocked` validator、Session create/restore、Typed Authority Prepare、分支/Scope、Save/GC/容量中显式建立合法写入与校验；独立 namespace 缺 `state-delta.js` 对 WorldState 的专门压缩，可能有存储体积/长会话成本 | **优先候选，但 W21 尚未获批**；仅储存身份最小索引/来源、不要重复复制 World Fact/History 和受众秘密 |

### 1.1 具体源码验证

- [`src/native/session-snapshot.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/session-snapshot.js) 的 `RESERVED_SESSION_NAMESPACES` 是**Generic Patch 的禁止列表**，不是“新增命名空间自动受保护”。`readSessionSnapshot` 会加载 `revision.stateHeads`，但仅成功解码/哈希校验**不等于**新增 Subject 的业务合法性验证完成。
- [`src/native/session-core.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/session-core.js) `validateRuntimeStateChanges` 拒绝 Reserved namespace，`applyRuntimeCommit` 在 `authority-first` 特定情形拒绝原始 World patch 的 `native_authority_typed_publication_required`；不能因 P1 的现有 guard 就假设 P2 自动安全，或绕过它令 NPC 自由写实体。
- [`src/native/repositories/session-repo.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/repositories/session-repo.js) `commitSnapshot` 将 SessionRevision 中各 Namespace 作为同一次受保护事务的不可变资源并发布；`reachabilitySnapshot` 针对各 `revision.stateHeads` 标记资源及分支/Save/Timeline 引用，现有 `session-maintenance.js` 处理 `sessionState` GC。P2 不是新资源 `kind` 或独立数据库，也不要求任何持久 Truth 双写。
- [`src/native/save-system.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/save-system.js) `portableNamespace` 排除多类派生索引/Cache；**若 P2 为正式 Subject 根，其命名不可被错误视为 NonPortable Cache**，且 Save/Restore 导入时要重验与 Package/Branch/Revision 的合法性。P2 如果另建内容寻址子记录而非扁平状态，则需额外修改可达性图；优先采用小的有界 SessionState 以复用现成闭包。
- [`src/native/state-delta.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/state-delta.js) 当前只对 `atri_world_state` 专门 snapshot/delta。P2 无同等压缩是需要长期测试/成本预算验证的**真实劣势**，不能只用“独立 namespace 更干净”盖过。
- [`src/native/session-core.js` `updateResources`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/session-core.js) 可以变更 Session 的 WorldSelection/Knowledge 并保留相同 WorldRevision 的旧 State：对 P1 的世界根重置语义尤为敏感；对 P2 则必须证明 Subject 的 `worldScopes` 在 World 解除绑定时合法更新、并且客观历史不会无声跨世界丢失。
- [`src/native/history-authority.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/history-authority.js) 仍需要声明的 History source 和预算；P2 不是再造通用 HCM/Domain History 的替代品。

**本轮倾向 P2，但仍有 Gate 0 决策条件**：完成所有写入模式的 Typed Guard/Restoration/ResourceSelection/Save/GC 与旧消费者差异核对。若 P1 可提供更少修改且同等级全模式写保护/历史闭包，可保留为有证据的替代。这个倾向还不是 W21 用户决定。

## 2. W21 的最小物理接口：将“必需字段”与“可推导数据”分开

```ts
// Future minimal-delta sketch, NOT existing or user-approved ABI.
SessionSubject {
  id: NativeStableSubjectId;        // exact ID family not frozen
  kind: SubjectKind;                // person | group | place | object | ...
  origin: AuthoredWorldDefinitionRef | CommittedAdmissionRef;
  scope: SessionScopeAndWorldAffiliations; // Worldless/multiworld legal
  admittedBy: DomainReceiptOrRevisionRef;  // host-owned, never model-supplied
}

DomainFactLink {                     // when domain source cannot already derive
  owner: SubjectRef | RelationRef;
  factKey: DomainScopedFactKey;
  source: CommittedDomainEventOrHistoryRef;
  validFrom?: DeclaredGameTick;      // not invented if no canonical clock
  validUntil?: DeclaredGameTick;
  replaces?: CommittedCorrectionRef;
}

EffectiveWorldQuery {               // read-only and authorization-bound
  sessionId, branchId, asKnownRevisionId;
  asOfGameTick?: CanonicalGameTick;
  audienceGrant, purpose, worldScope?, subjectFilter?;
}
```

- **正式 Subject Registry 只存身份/来源/合法 scope**，不能复制金币、债务、人物所有私人记忆、Actor Profile 原文或所有 World State；各业务的 Source of Truth 仍由既有 Native Domain State/History/Event/Revision 提供。
- `committedRevisionId` 不能由请求方传入并自证：`_publishLocked` 生成 revision 后，受保护 Typed Writer 的内容必须在同一候选 Revision 中正确关联，复用原原生 Receipt/Revision 幂等与权限。保存/读取证明保留“哪一次提交确立了身份”。
- `DomainFactLink` 可能不需要单独实体：如果原有 Domain History 与原 Event/Receipt 的合法映射已能导出事实转换，只需在 EffectiveRead 中给出来源；只有无法无损恢复的有效区间/更正关系才增加最小物理信息。
- `GameTick` 仅在定义了可验证的 canonical clock 时参与时间裁决；没有时钟的纯文本 RP 仍可根据分支和 Revision 做确定的 as-known 历史顺序。
- `EffectiveWorldQuery` 必须先验证调用者合法 Authority / Perspective / Source Grants，后按 SourceRef/FactKey/时间进行关联检索，绝不能拿请求者输入的 `subjectId` 当作授权凭据。Inspector 的解释信息本身也要受权限控制。

## 3. 实施交接用 WP-A～F：每项都有具体的前置与验收

| 工作包 | 已定位的 Owner/入口 | 实施前仍需 E0 核对的差异 | 实施期最小可验收 |
| --- | --- | --- | --- |
| **WP-A Native Authority P0** | `src/native/session-core.js`、`authority-transaction.js`、`src/endpoints/native-session.js`、`world/session.js`、V3 `native-turn-orchestration.js` | World reducer vs `authority-first` Typed Path 的**真实适用游戏模式**、NPC admission 的一次 Domain Commit、Narrator/World 不同 Revision 的发表策略、原 Receipt/Unknown Commit 回查 | 一次赊账对应唯一正式 Effect/主体/债务/回执，重复或旧 Revision 不双扣钱；拒绝未经授权写入 Subject |
| **WP-B Identity/Save/History P0** | `identity.js`、`contracts.js`、`session-snapshot.js`、`session-repo.js`、`save-system.js`、`session-maintenance.js`、`state-delta.js`、`history-authority.js` | P1/P2 在所有模式中的根/namespace/Save/GC/Clock/Revision 可达性与新增 ID family 的最小影响 | 同一 Subject 跨父子分支身份不漂移，新分支事实不串档；历史有效期、修订版本、回档后恢复可信 |
| **WP-C Perspective/HCM P0** | `native-information-contract.js`、`native-information-runtime.js`、`cognition-authority.js`、`tom-authority.js`、`memory/eligibility.js` 与 V3 ContextPort | Manifest-only `actorId` 改造为受权限控制的动态 Subject view，Source/ScopeEpoch/撤销、秘密身份与 ActorProfile 分离 | 无预设 Actor 的阿洛只看到有权知道的信息，HCM/Context/Provider Wire/Play 不泄漏其他 NPC 私密事实 |
| **WP-D World/Knowledge Context P0** | `world-knowledge.js`、`knowledge-runtime.js`、`knowledge-selection.js`、`context-compiler.js`，V3 `context-port.js`、Prompt `prompt-compiler.js` | World Source Claim/已失效可变事实的 FactKey/validity 与 token 授权先后关系，Prompt Effective 不被当 World Truth | T13 米拉在位，旧“莱恩在位”仅作历史/谣言；T5 有效查询及未得知者 Belief 均合法 |
| **WP-E Timeline/Play/Media P1** | `contracts.js` `assertTimelineEntry`、`native-frontend-host.js`、`session-projection.js`、`play-product.js`、Speech/Visual | 真正 `ParticipantRef` 与作者表达 `actorId` /Narrator 文本、展示 alias 和语音/视觉 identity、Frontend Host ABI 的真实调用图 | 动态 NPC 作为合法事件参与者且可显示/发声，无 Persona/模板/私密身份串线 |
| **WP-F Library/Studio/Legacy P1** | `world-editor.js`、`studio-worlds-editor.js`、`studio-entrypoints-editor.js`、Knowledge Library、`atri-world-info-*`、Old Orchestrator/插件 SDK | 作者 World Source 编辑/角色与起点绑定、新旧 WorldInfo Prompt 的 live/extension ABI、当前三栏工作区和移动端独立真实 UI 消费 | 作者可创作 World/Knowledge/自由文本，Studio Authored→Effective，Play 实时/历史 Inspector，旧写权清退且不误删现役插件 |

**工程顺序（非强制人工阶段暂停）**：固定真实集成 HEAD / Gate 0 → WP-A+B 的同一 Native Authority/Subject/History 主骨架 → WP-C+D 的受众授权与 Source/Context → WP-E+F 的 Timeline/Media/UI 和旧路径硬切 → 持久化/并发/长会话/三端验收。每个 WP 可依据真实依赖并行局部准备，但不得多条活跃真相写入接口长期共存。未授权创建实现分支。

## 4. Gate 0 目前可成立的发现与不能伪称 PASS 的项目

| 编号 | 本轮静态证据 | 必须完成的**开发前设计/接线检查** | 当前状态 |
| --- | --- | --- | --- |
| **E0-01** | 既有 Session State/Revision 可支撑 P2，P1 权限和 World binding 更复杂 | 确定首选 P1/P2、全模式 Typed Guard 和 `Worldless/multiWorld`、Subject 具体最小 Schema；说明未来代码需改哪些文件 | **OPEN** |
| **E0-02** | SessionCore/Repo 有 Domain Receipt，Game World `commitEvents` 与 Narrator `finalizeTurn` 为不同真实入口 | 明确这些入口在各正式游戏模式的写入 Owner、必要事件/参与者发表顺序、未知提交恢复、Authority-first 防 Raw Patch | **OPEN** |
| **E0-03** | 旧 Revision 的 `SessionRepo.loadSnapshot` 有可达性检查，World Delta/History/Save 有可复用基础 | 确定受众限制的 `asKnownRevision → asOfTick` Query，缺 Clock、纠错/GC/Pinned Save 及不可达历史的清晰行为 | **OPEN** |
| **E0-04/05** | Information/Actor 限定 Manifest，V3 ContextPort 具 SourceBinding/Grant/currentness | 最小动态合法 Perspective + Claim/Fact/Time 的来源限定投影及 Prompt Wire 防泄密 Consumer | **OPEN / BRANCH_RECHECK** |
| **E0-06/09** | 静态定位 WP-A～F 文件，分支 SHAs 锁定但 V3/Prompt/Visual 尚未合入 | 目标集成 HEAD 下完整生产 Caller/Host/Plugin 与 `RETAIN/REPLACE/DELETE/INVESTIGATE` 表及 API owner，避免在旧 main 新建已被 V3 替代的接口 | **PARTIAL / BRANCH_RECHECK** |
| **E0-07/08** | Studio/Play、Media、Save/GC 实际消费路径存在 | 开发前确定界面/来源/权限与性能场景及运行测试入口；**新增功能的 UI、DB/长会话、三端 PASS 留给 Gate 1～4** | **PLAN OPEN / RUNTIME NOT EXECUTED** |

**重要的 Gate 0 判据**：这张表在当前讨论期仍有真实缺口，故不能标记 Gate 0 PASS。允许以后将那些“只能由新增代码运行证明”的测试归入实施期 Gate 1～4，但绝不能把没有完成的 Owner/权限/消费者调查也推迟为无责任人未决事项。某个源码引用被识别、分支 SHA 被固定≠完整生产链核查完成。

## 5. 旧路径怎么删？当前可证明的分类

- `RETAIN`：原生 Session/Revision/Receipt、World/Knowledge 原始作者资源、合法历史/Source/Information/HCM/Context Budget 机制及 Orchestration V3 原 Domain Receipt 验证职责，具体消费者可能需要升级。
- `REPLACE`：已识别的 Manifest-only Runtime Speaker/Actor Perspective、错误地将过期 World/Knowledge 自由文本无条件当 current 的 Prompt 入口、前端只能显示作者 Actor 的逻辑；最终目标必须绑定新的合法 Typed Subject/Effective World 投影。
- `INVESTIGATE`：`atri-world-info-*`、旧 Orchestrator、`native/knowledge-prompt-channels.js` 的 WorldInfo 映射字段、第三方扩展/动态 import/公共 ABI，须有真实现场证据再判断能否清退。
- `DELETE`：**本轮没有一项特定产品文件取得“无现役消费者”完整证据**，不能造一份假删除列表。正式实现时可按固定 HEAD、补齐调用链及测试证据做硬切，不为 Dev 老数据兼容维持平行 Truth。

## 6. W21 最终交接前的三条路线（尚未由用户选择）

**W21-A · 优先 P1 WorldRoot 子树，迅速冻结 Schema 和开工前 Gate 0**：尽量利用现有 `atri_world_state` Delta，但还需跨 Worldless/multi-World、非 Authority-first 模式重新界定 Root 字段写权；若未经全部模式保护证明就直接冻结，可能让 Game reducer/Generic Patch 更改正式 Subject 的身份。

**W21-B · P2 优先，Native Reserved/Typed Session Identity + Domain Fact Owner + 证据门槛式交接（推荐，尚未获批准）**：将**一个** SessionRevision 下受保护的最小 Subject Registry 作为优先物理设计（只存身份与 Origin/Scope/Admission）；各领域继续掌握 World State/关系/经济/History/Memory 的唯一真相，FactTransition 主要是原领域事实变化的受控来源与有效时间索引；沿真实 V3/Prompt/Media/Frontend 消费者梳理 WP-A～F 并列出仍待核验的 P2 Validator/Save/GC/长会话成本，只有 Owner/Caller/Schema/Guard/测试计划就绪才宣称 Gate 0 设计收口。不增第二数据库，不要求尚未实现的三端测试先 PASS。

**W21-C · 继续不选物理位置，全部延后给 Codex 边开发边决定**：短期减少讨论，但最关键的 Host 权威、Protected Namespace、Save/GC 和动态 Permission 的边界仍不清，会使 WP-A/B 与后续 C/D/E/F 产生反复接口调整；不推荐。

**推荐 W21-B。** 该推荐**不意味着 P2 的具体 Namespace 名、ID family、Schema/API 已经获得用户选择，且不意味着 Gate 0 已 PASS**。若用户同意 W21-B，下一轮建议只处理一次正式交接前最后的**未决契约/最小工作包合并/阻塞闭合计划审计**；能够闭合后再请求用户明确批准整份企划定稿与正式开发，未闭合则给出准确阻塞而非再发散抽象 W22、W23。

## 7. 本轮审查局限与最终交接要求

- 本轮通过 GitHub Branch API、固定源码文件和选择性调用/依赖阅读核实 P1/P2 的技术差异；没有将仓库完整本地克隆成可执行代码树，也没有真实运行入口、Provider、前端/CI、Windows/CachyOS/Termux 证据。P2 更适合在本轮的**静态判断**，不是性能/正确性实测的胜出方案。
- 未合入的 Orchestration V3、Prompt Preset 与 Visual 可能改变最终接口/调用方；**不能用本轮锁定的旧 main 永久指定未来文件和 Namespace 修改细节**。
- 用户此前只授权持续 `docs` Draft 方案讨论。无论 W21 后续选择怎样，**没有用户明确全案 Final/开发启动授权时，不创建 `feat/*`、不修改 `main`**；本轮没有任何产品文件写入或删除。


## 8. W21-B 用户确认（2026-10-17）

用户对上一轮明确推荐的 **W21-B「P2 优先、Native Reserved/Typed Session Identity + Domain Fact Owner + 证据门槛式交接」**回复「认同」。记录为 `ARCH-DWE-01` **已确认的总体架构与优先实施路径**；因此 W1-B 至 W21-B 的方向已获确认。**这不代表全案 Approved/Final、P2 的具体 ID/Namespace/Schema 已冻结，或 Gate 0 已通过**。

**选择所明确的边界：**
- **P2 优先**：一个由现有 Native Session/Revision 管理的**受保护 Native SessionState** 存储最小 Canonical Subject identity/origin/scope/admission。正式身份不依附某一本 WorldRevision/Actor Profile；无需创建额外存储引擎、独立 EventStore 或通用 Entity Truth 数据库。
- **Typed-only authority**：该状态须由 Native Session/Domain Authority 的专门 Validator/Prepare/Publish 写入，并在所有适用运行模式下拒绝普通 Runtime/插件 Generic State Patch；加入 Reserved Namespaces（若采用独立 Namespace）、Snapshot 验证、Save/Restore/GC/可达性、资源绑定变更和权限/预算审计。不能把新增 JSON 对象误写成天然受原生信任边界保护。
- **业务事实归属不变**：经济、位置、社会关系、Lifetime、HCM/Cognition 和 Game Clock 各自按合法原 Domain authority 管理；仅为不能无损推导的事实变化补最小 `FactTransition` 的来源/时间/更正引用。不允许 SubjectRegistry 内再复制业务价值，出现双权威。
- **P1 有条件回退**：P1 `atri_world_state` 受保护子树**不是并行上线的第二选择**。只有在 Gate 0 的具体 HEAD 审查中证明它对**所有游戏模式的完整写入保护、Worldless/multi-World、WorldSelection 切换、Source/Save/GC**都同等安全且实际消费者/性能差异显著更小，才允许将替代依据写回同一 Plan 供最终审查。不能因“已确认 P2 优先”就暗称已永久锁定具体 Schema。
- **消费者/测试**：WP-A～F 的生产链、正确 Typed Subject/Participant/Perspective/Effective View 接口、V3 Domain Receipt vs Orchestration Effect 收据、Prompt Context 权限及旧 WorldInfo/Plugin 的 `retain/replace/delete/investigate`，均依固定最终集成 HEAD 获得可执行清单。新增 ABI 的 Node/DB/CI/真实 UI/三端验收属于开发后的 Gate 1～4，不在仅讨论的 Gate 0 虚构 PASS。
- **未批准**：新的 ID family、具体命名空间名、持久字段及权限接口、`asOfRevision/asOfTick` 查询 API、删除产品文件或建立实现分支、所有 E0-01～09 通过、整体企划 Approved/Final。

**下一轮 W22**：同一 Plan 中的 [e0-final-implementation-handoff.md](e0-final-implementation-handoff.md) 汇总 **Gate 0 可交接/不得交接证据、P2 必须改动的确切原生 Owner/Caller、最少物理记录设计与两段历史读链、WP-A～F 具体交接接口和清退审核**，明确短名单阻塞及可核验的最终退出门槛。W22 研究路线仍待用户选择，整个 Plan 保持 **Draft**，不修改产品代码。
