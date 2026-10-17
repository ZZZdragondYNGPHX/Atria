# ARCH-DWE-01 · W22-B 可执行 Gate 0 Preflight / 条件化开发交接清单

- **归属**：唯一 [Plan 入口](index.md) · [累计 Design](design.md) · [W22-B 确认及技术前提](e0-final-implementation-handoff.md) · [E0 总阻塞](e0-final-closure.md) · [唯一 Record](../../../records/architecture/world-evolution-consistency.md)；仅在 `docs` 分支维护，不是独立 Plan/HANDOFF。
- **状态（2026-10-17）**：`Draft`。已确认 **W1-B～W22-B 总体方向与有界证据收口方法**；**Gate 0 = PARTIAL / BLOCKED**，本文件是一份具名 Preflight 与有证据的待办，不是 E0 PASS、实施 API 最终冻结或全案 Final。没有授权创建代码实现分支、改动 `main`、删文件或发布软件。
- **本次完成的工作**：在固定 GitHub SHA 下对 Native Session/Repo/Save/History/Information、Orchestration V3/Prompt、Frontend/Legacy 相关源码进行针对性静态阅读，按关键名称检索主线消费者，比较未合并分支文件交集；形成以下**实际证据 + 待证明差异 + 所需交付物**。这不能冒充完整本地 `git/rg` 调用图、动态插件运行或 Node/CI/三端测试。
- **禁止的偷换**：`已找到函数` ≠ `完整生产调用图`；`有 CommitReceipt` ≠ `Game World + Narrator 同一事务`；`同一 SessionState` ≠ `已授权写入`；`高权威 Rank` ≠ `语义过期已过滤`；`实施期测试计划` ≠ `已 PASS`。

## P0. 实际审计 HEAD / 分支差异 / 依赖合流基线

| 来源 | 本轮再次确认的 SHA | 可核对的差异事实 |
| --- | --- | --- |
| `main` | `c57fada6edeea255b29d857ba2585c1dbc9c098b` | 当前稳定代码基线；这是 W22 Preflight 静态参照，不自动变成未来实现基线 |
| `refactor/atria-native-orchestration-v3` | `a7cb649d0cd12cdaf7d7e91e96e654ba6261fea9` | 相对 main `ahead=97, behind=0`；新增 `src/native/orchestration/*` Effect/Context/Result/Source/Receipt |
| `refactor/atria-native-prompt-preset-deepening` | `760327891149216dffdc1e3fa0c846496007a013` | 相对 main `ahead=1, behind=10`；Prompt/Provider ABI 不可按旧 main 唯一版本冻结 |
| `feat/native-visual-generation-deepening` | `ae587be0c64487ba922528bdd0146444bcf5e92e` | 相对 main `ahead=6, behind=48`；Compare 返回 300 文件，文件清单可能不完整 |

**新的具体重叠证据**（GitHub Compare 按文件路径求交；不是 Git 三路合并冲突检测）：

- **V3 × Prompt 共同触及 10 个生产文件**：`src/endpoints/native-generation.js`；`src/native/adapters/generation-host.js`；`src/native/agent-intelligence/evaluation/worker-bridge.js`、`worker.js`、`evolution-evaluator.js`、`evolution-service.js`；`src/native/model-prompt-runtime/compiled-binding.js`、`contracts.js`、`execution-utils.js`、`prompt-candidates.js`。**只是同时修改，不等于十处实际文本冲突，但它们确实需要确定最终 API Owner 和合流先后顺序。**
- **V3 × Visual** 的已返回交集包括 `src/native/adapters/generation-host.js`、`src/native/run-control.js` 及 `src/storage/engines/{mysql,postgres}*` 等；**Visual 比较列表接近分页/条数上限，不能当作全面交集**。
- **Prompt × Visual** 有 `src/native/adapters/generation-host.js`、`src/native/model-prompt-runtime/README.md` 等交集，实物合流前仍需校验。

**P0 必交付**：冻结正式目标集成 HEAD 的 `git status / rev-parse / merge-base / diff --name-only` 或等效远端证据，验证各接口重叠分支最新 HEAD、当前实际活跃程度、合入目标/先后、Owner 与需复核函数；不要无限等待所有无关分支。若相关分支先合入 main，原 SHA 保留审计史，立刻以新 main 复核。

**P0 状态：`BRANCH_RECHECK`**，还没有一个可宣称为最终可编码输入的合流 HEAD。

## P1. Native P2 物理身份：代码级 Writer / Validator / Save / GC

**已核对的原生权威点**：

- [`src/native/session-core.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/session-core.js)：`_create` 组装 Session 最初的 `states`，`_publishLocked` 生成 Revision/State/Receipt，`applyRuntimeCommit` 使用 `validateRuntimeStateChanges`；现有 `authority-first` 情况拒绝非法 Raw World Patch，`updateResources` 变更 WorldSelection。
- [`src/native/session-snapshot.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/session-snapshot.js)：`RESERVED_SESSION_NAMESPACES` 明示 Generic Patch 拒绝表，`readSessionSnapshot` 通过 `revision.stateHeads` 读取任意 Native State/验证完整性。
- [`src/native/repositories/session-repo.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/repositories/session-repo.js)：`commitSnapshot` 同一资源事务写 immutable states/revision/root 和 Commit Receipt；`reachabilitySnapshot` 遍历留存 Revision 的 `stateHeads` / Timeline/资源引用；`loadSnapshot` 对旧 Revision 做合法可达校验。
- [`src/native/save-system.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/save-system.js)：`portableNamespace` 根据 `NON_PORTABLE_STATE_PATTERNS` 过滤缓存，正式 P2 身份必须 portable，导入时不可绕过业务校验。
- [`src/native/session-maintenance.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/session-maintenance.js)：对普通 `sessionState` 按修订可达性 GC；**不要求再造一个新 GC 服务**。
- [`src/native/state-delta.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/state-delta.js)：专用 Delta 只处理 `atri_world_state`；**P2 身份状态可能存在完整文档写放大成本**。

**P1 必交付**：在最终 HEAD 的实际文件/函数边界写明：
1. 一个由 Native Session Revision 管辖的 Subject State 名称/最小 `schemaVersion, subjectId, kind, origin, scopes, admissionReceiptRef` 语义，限定资料只包含世界身份与授权有效的源证明，**不复制金币、关系、HCM 真相**；
2. 具体谁负责 Session Create 时开局主体实例化，谁接纳新涌现 Subject；`_publishLocked` 的 Revision ID 分配顺序如何保证同一 Domain Receipt 来源可验证、请求方不可伪造 admission；
3. 完整的 `Reserved → Runtime command deny → Typed authority prepare/validate → SessionCore publication → read/restore/import validate → Save/GC` 受保护链，以及 Worldless/multi-World/WorldSelection 修改的来源/退订规则；
4. 具体 ID family 是否真的需要扩充；同一模板多主体、同名/伪装、死亡、Branch ancestors 的稳定引用和幂等；
5. 固定 P2 为优先物理落点；只有提供 **P1 全模式同等级安全 + 更低真实改造与成本** 的证据才可提交回退替代方案，不能双轨上线。

**P1 状态：`DESIGN CONTRACT OPEN`**。现有存储可复用，Subject Validator/Typed Writer 尚不存在；这是正式 Gate 0 必须有**具体实施方案**的事项，其运行测试在 Gate 1。

## P2. Domain Effect、Game reducer 和 Narrator 的真实提交关系

**已证实的不同入口**：

```text
native-session endpoint -> SessionCore.applyRuntimeCommit
                          -> _publishLocked -> SessionRepo.commitSnapshot

experience/logic/runtime.js -> world/session.js.commitEvents
                          -> session-runtime.commitStatePatch
                          -> native-session runtime command

authority-transaction.prepareAuthorityPublications
                          -> SessionCore._publishLocked

V3 native-turn-orchestration.js
                          -> SessionCore.finalizeTurn -> original domain receipt
                          -> V3 EffectController observation
```

- 原 World reducer 的 `commitEvents` 会把 `atri_world_state` 与 `atri_game_runtime.events` 组成同一 `commitStatePatch`；但不能将其与独立 `finalizeTurn` 的所有场景视为一个原子事务。
- `SessionCore.applyRuntimeCommit` 在 `hasAuthorityTransactions` 情况防止未经 Typed Authority Publication 的 World Raw Patch；新 Subject 必须继承这个核心信任边界。
- V3 EffectController 的 `confirmed` 需要原 Domain Receipt 才能说明对应执行已证明；`Run/EffectReceipt` 不能作为第二份 World Event/Fact Truth。
- 实际业务上必须区分 **proposed / committed / narrated**，并对请求超时但可能已提交的状态优先回查 `idempotencyKey/CommitReceipt`，不能再扣一次钱或让另一个分支承认失败效果。

**P2 必交付**：基于最后合流 HEAD 给出各产品模式（World Game、Authority-first、纯叙事/Worldless、原生 NPC 自主 Task）的完整入口/Domain Owner/Typed request/Precondition/Receipt/Revision/Narrator publication 真实调用图；明确“阿洛第一次赊账”的一次且仅一次正式 Effect 与 Story 发表顺序、分支切换后旧任务失效与未知 Commit 恢复。不需现在运行尚未实现的交易，但必须有实施可测试的合同。

**P2 状态：`OPEN / BRANCH_RECHECK`**。

## P3. Fact 的双锚历史读取与合法受众

- [`src/native/session-observation.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/c57fada6edeea255b29d857ba2585c1dbc9c098b/src/native/session-observation.js) 的 `history(handle,{sessionId,revisionId,query})` 先 `core.observe(...revisionId)`，再调用现有 `queryHistory(snapshot, query)`，是确切 Revision 溯源的可复用读边界。
- `native-history-runtime.queryHistory` 以所选 Snapshot 的声明 History/来源/有限 Cursor 检索事实，但尚无通用所有 World Subject 的 `asOfGameTick`。
- World/Knowledge/Actor 作者源与提交的原生 Fact/DomainEvent/History 需要区分硬法则/起点/当前/历史/Source Claim/私人 Belief；`FactKey` 只给需要因果和规则追踪的事实，未声明 GameClock 时不能伪造 Tick。
- 先验证 `asKnownRevision` 合法且可达，再根据领域声明的合法时间/有效区间得 `asOfGameTick`，最后按 Native Host `Audience/SourceGrant` 输出，不允许 `subjectId` 参数自动授权查询隐藏真身。

**P3 必交付**：定义最小 `Subject/FactTransition/Correction` 的**实际业务 Owner**、合法 `revision/tick` 含义、可持续有效期/结束规则、缺 Clock/GC 丢失历史响应、权限过滤顺序与缓存失效条件；选择复用领域既有 History 或最小新增 `FactLink`，不能在 P2 身份状态里另写一份金币、债务/关系业务真相。

**P3 状态：`OPEN`**。

## P4. 信息权限、Context 与 Prompt 的真实消费/泄露审计

**实际生产命中（GitHub 默认分支按文件级搜索，非完整动态调用图）**：

- `projectInformation(`：39 个匹配文件，其中 **17 个生产文件**，包括 `src/native/cognition-inspection.js`、`context-computation.js`、`session-public-work.js`、`appraisal-authority.js`、`cognition-authority.js`、`information-authority.js`、`task-artifact-authority.js`、`visual-continuity.js`、`shared-authority.js`、`agent-intelligence/goal-service.js`，以及 `public/shared/native-expression-runtime.js`、`native-information-runtime.js`、`public/scripts/native/lifecycle-client.js` 等。这是文件数/符号命中数，**不是 17 条完整已审调用链**。
- `actorAvailability(`：除自身定义外，`src/native/shared-authority.js`、`public/shared/native-expression-runtime.js` 和 `public/scripts/native/lifecycle-client.js` 有生产符号命中；未注册在 Package Manifest 的 Actor 当前仍可能得到 `undeclared`。
- V3 分支 `src/native/orchestration/context-port.js` 对 `SourceBinding/GrantDigest/Audience` 和异步完成后的 currentness 有验证；`context-compiler.js` 已会拼接 `atri_world_state` 与 Knowledge 原文，其 authority Rank 不代表自由文字的“莱恩仍是皇帝”已自动失效。
- Prompt Preset 分支的 `semantic-blocks` / Authored-Effective-Provider Wire 是编译/展示层，不拥有 World Truth 或动态 Perspective 授权。

**P4 必交付**：对上述真实生产消费者以“读者/所需 Source/合法 Scope/旧 Actor 绑定/目标 Subject grant/撤销/退出验证”建完整视图表；明确新 NPC 何时可以存在但不能私有推理、如何获得独立 Context、同名/HCM 未决实体及秘密别名如何不经 Inspector/Prompt Wire 泄露。对 Claim 的适用性和旧自由文本错误当前事实建立可运行的目标验证用例。

**P4 状态：`OPEN / BRANCH_RECHECK`**。

## P5. Frontend/Media/Studio/Legacy 的可删证据和验收范围

- `src/native/frontend/host-services.js` 真实暴露 `host.world.view`（当前非通用 Subject Fact 双时间接口）与 `host.history.query`，`native-frontend-host.js` 的 `MESSAGE_SCHEMA` 仍携 `actorId`，`play-product.js`、Speech/Visual 仍存在 Manifest Actor/Provisional identity 概念；目标是**真实参与者、可选表达模板、受众知道的名字/外观**分离。
- `ProductService.saveResourceSetup` 在已经存在的 Session 上调用 `SessionCore.updateResources`，所以必须把 Library/Studio WorldSelection 改动和 P2 Subject scopes 历史放在同一兼容性审查，不可静默丢失已接纳 NPC。
- 旧 `worldInfoBefore`：本轮代码检索发现 **13 个生产文件**的同名符号命中，涉及 `public/scripts/st-context.js`、`PromptManager.js`、`agents/orchestrator/main.js`、`capsule-injection.js`、`world-info.js` 等；不能依靠名字“legacy”批量删除。
- `nativeKnowledgePromptChannels`：默认分支 GitHub 搜索只检出定义/测试（无外部生产文件命中）；可列 `INVESTIGATE`，但可能通过动态调用/插件 ABI 使用，**当前 DELETE=0 项已获得可删证据**。

**P5 必交付**：对所有 Host/Frontend/Play/Speech/Visual/Studio/Library 消费者列字段 `caller → owner → target ABI → audience/source authority → retain/replace/delete/investigate → planned evidence`；真实插件扩展入口若必须保留，只保留其合法产品/作者接口而非平行 Truth/Orchestration Compat Writer。最低可验收场景：动态无角色卡 NPC 合法发言/展示、分支秘密与别名、旧知识历史化、Worldless/多 World、Studio Authored→Effective Preview。

**P5 状态：`PARTIAL / INVESTIGATE`**。

## P6. Preflight 证据交付模板和开发/测试 Gate 划界

每个真正 Gate 0 行项必须具备以下字段。内容缺失则保持 `OPEN`，不准写 PASS：

| 字段 | 期望 |
| --- | --- |
| `check_id` | E0-01～09 或下面的 P0～P5 |
| `source_head` | 当前可验证的完整 SHA、实际代码文件/函数/入口 |
| `domain_owner` | 唯一 Native 事实 Owner 或明确只读消费/媒体/作者资产 Owner |
| `old_path` | 已定位的调用方和旧合同 |
| `target_path` | 最小新合同、Typed Publisher/authorized reader、何时生效 |
| `disposition` | `RETAIN/REPLACE/DELETE/INVESTIGATE` 及真实代码依据 |
| `exit_evidence` | 确切静态证据/实施测试目标；不把未执行测试标为成功 |
| `status` | `OPEN/BRANCH_RECHECK/DESIGN_READY/IMPLEMENTATION_GATE/VERIFIED`，不得因写了计划而改为 VERIFIED |

**Gate 0 READY 的严格含义**：选择一个实际将用于实施的集成基线，明确 P2 的具体受保护 Publisher/Validator/Portability、安全 Subject 类型与身份来源、World Game/Narrator 原领域提交协调策略、动态 Perspective 与 EffectiveWorld/Context 权限 Owner、WP-A～F 的真实生产迁移表，并列确切需实施的测试和旧路径清退依据。已具有可执行设计和生产入口所有权的条目可记 `DESIGN_READY`；需编写后运行的测试应分配到 `IMPLEMENTATION_GATE`。**当前 Gate 0 仍 PARTIAL / BLOCKED**。

**Gate 1–4（仅实施后）**：Node/DB/Save/Branch/GC、SourceGrant/双时间/Provider Wire、Studio/Play UI/性能、Windows/CachyOS/Android Termux 真实体验和 CI。只在证据真实发生之后填 `VERIFIED`。

## P7. Codex 可直接执行的只读 Preflight 指令（英文，待明确任务授权）

> This is an audit prompt included in the Draft Plan, not authorization to start product implementation.

```text
Perform a READ-ONLY Gate 0 preflight for Atria ARCH-DWE-01.
Read the existing docs Plan and its sole Record. Do not create an implementation
branch, modify main, refactor product code, or mark the Plan Final.

Capture current full SHAs for main and overlapping Orchestration V3, Prompt,
Visual branches. Check the actual integration target and production call graph,
including dynamic/extension entrypoints. Do not treat filenames or grep hits as
proof of dead code.

For E0-01..09, deliver a file-and-function-level owner/caller/target/disposition
matrix, minimum P2 protected Session Subject ABI/Typed Writer and Save/GC closure,
Domain Receipt vs Narrator/World commit boundary, revision-and-game-time read
contract, dynamic Perspective authorization, and Effective World/Prompt consumers.
Separate Gate 0 DESIGN_READY from post-implementation test gates. Keep BLOCKED
items explicit and evidence-linked.

Continue to update only the SAME docs Plan bundle and the SAME cumulative Record
as a Draft. No separate Plan/HANDOFF, no simulated test results or blanket legacy
deletion. Return the exact remaining blockers and whether Gate 0 is design-ready.
```

**批准界线**：本轮用户只认可 W22-B 的收口方法，**没有授权执行上面 Preflight 后再自动转为产品开发**。在最终完整 Plan 获得明确 Final 与实施授权、Gate 0 静态设计证据具备之前，不允许创建 `feat/*`、改 `main` 或合并任何分支。

## 本轮静态结论与下一决策点

- **已完成**：W22-B 确认、当前 HEAD 再检、V3/Prompt/Visual 重叠文件与部分实际生产符号命中、P2 Writer/Save/GC 的真实源码 Owner、各 E0-01～09 对应具名 preflight 工作/退出材料。
- **仍阻塞 Gate 0**：最终作为开发输入的**实际集成 HEAD/全生产 call graph**，P2 的业务身份 Schema/Typed Authority 全模式验证落点，跨 World/Game/Narrator Effect 的因果/回执一致性合同，动态 Perspective 的 Host grant/源权限接线及旧 Legacy/Plugin 的确定清退表。
- **下一阶段**：只有上述设计证据按要求完成后才能建议用户正式批准 ARCH-DWE-01 Final 并授权实施。本次不额外创建一个 W23 世界机制讨论，不虚称 Gate 0 PASS。保持 `Draft`。
