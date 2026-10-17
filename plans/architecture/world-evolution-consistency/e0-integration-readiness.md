# ARCH-DWE-01 · W16 E0 版本锚定、跨分支真实消费者与实施前置审查（Draft）

- Task ID：`ARCH-DWE-01`；Primary Workspace：`docs`；[唯一 Plan 入口](index.md) · [累计设计](design.md) · [W15 已确认 E0 方法](e0-final-closure.md) · [唯一 Record](../../../records/architecture/world-evolution-consistency.md)。
- **状态**：Draft。**W1-B～W15-B 已确认**（W15-B 是证据收口方法）；本轮 W16 的分支协同/接口优先级选择尚未获批准。E0-01～09 **PARTIAL / BLOCKED**；没有产品代码修改、临时实现分支、CI/测试或 Windows/CachyOS/Termux 实测。
- **本轮新增的真实证据**：相较 W15 的未固定 `main` 检索，本轮使用 GitHub `git/ref` 获取精确 HEAD，然后从上述 SHA 读取文件和 `compare_commits` 分支对比。仍为**选择性静态文件审计**，不是将完整仓库拉到本地的全量 call graph 或端到端 E0；期间远端可能变化，正式实施前必须重新锁定新的真实集成 HEAD。

## 1. 本轮锁定的提交锚点与未合并代码事实（2026-10-17）

| 范围 | 本轮锁定 commit | 与当前 main 的对比 | 对 ARCH-DWE-01 的意义 |
| --- | --- | --- | --- |
| **main** | `c57fada6edeea255b29d857ba2585c1dbc9c098b` | 基线（最新 merge 摘要：test-suite-defensive-cleanup） | 下述已存在产品代码的静态审查锚点，**不是**未来实施时永久使用的 HEAD |
| **docs** | 在本阶段写入前 `90836d4c39258995fb2eab5733650c6d37b5c477` | ARCH-DWE-01 上一轮唯一 Plan/Record | 本次继续只提交 `docs`，之后 HEAD 将因文档提交变化 |
| **refactor/atria-native-orchestration-v3** | `a7cb649d0cd12cdaf7d7e91e96e654ba6261fea9` | `ahead=97, behind=0`；compare 返回 297 个变更文件 | **最高耦合未合并分支**：新增 `src/native/orchestration/*`、`native-orchestration-contracts.js`，改变 Model/Context/Effect/Result/Receipt/Session 输出流；不能仅按 main 旧 narrator/Orchestrator 思考 |
| **refactor/atria-native-prompt-preset-deepening** | `760327891149216dffdc1e3fa0c846496007a013` | `ahead=1, behind=10`；compare 返回 43 个变更文件 | 改 `prompt-compiler.js`、引入 `semantic-blocks.js`、`draft-preview.js` 等；本分支未同 main 完全对齐，需确认有效上下文语义是否由它接手 |
| **feat/native-visual-generation-deepening** | `ae587be0c64487ba922528bdd0146444bcf5e92e` | `ahead=6, behind=48`；compare 返回的文件数达到 300（GitHub Compare 结果上限附近） | 视觉/角色表现消费者需按最终合入状态审查；该比较结果可能不是全部文件，不得据此宣布视觉链路已审完 |
| **feat/agent-intelligence-plan** | `8fb5ad0e14be311558b6011e57b2634e3eed6f2f` | GitHub Compare 报“no common ancestor”，无法按 main 常规 diff | 独立历史/孤立分支不能擅自作为 main 运行时代码依据；先核验其真实用途及是否影响正式实施入口 |

以上只表示**当前存在的未合并分支**，不表示它们全部处于同时活跃开发或已经验收。分支 SHA 在本阶段由 GitHub 只读 API 取得；没有合并或修改它们。

## 2. 关键新事实：Orchestration V3 的 Effect 与 Native World Effect 是不同层级

### 2.1 已经可以确认的接口

- 在分支 `a7cb649d` 中，[Native Orchestration Contracts](https://github.com/ZZZdragondYNGPHX/Atria/blob/refactor/atria-native-orchestration-v3/public/shared/native-orchestration-contracts.js) 定义 `planRef`、Source Selector、能力预算及 `rp_narration / project_review / result` Output Contract；effect 为可执行编排节点，不直接意味着世界事件已生效。
- [`effect-controller.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/refactor/atria-native-orchestration-v3/src/native/orchestration/effect-controller.js) 可 `prepare → ready → claim → observe`，并区分 `confirmed/failed/not_dispatched/unknown` 及 `original_domain_receipt` 等证据。**编排 Effect Controller 是计划执行/状态观察者，不是世界 Actor/Subject/Fact 的独立事实裁判**。
- [`native-turn-orchestration.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/refactor/atria-native-orchestration-v3/src/native/orchestration/native-turn-orchestration.js) 的 `finalizeNarrator` 使用确切 `expectedRevisionId`、输出/Authority/Knowledge proofs，`#commitSessionOutput` 通过原有 `sessionCore.finalizeTurn` 和 `readSessionTurnOutput` 获取/验证正式 Domain Receipt；若遇 `storage_commit_unknown`，优先读出提交结果，而非盲目重发。Effect 观测在真正 Domain Commit 之后，且由 `original_domain_receipt` 支撑。
- [`context-port.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/refactor/atria-native-orchestration-v3/src/native/orchestration/context-port.js) 持有当前 `compileNativeContextPlan` 与 `informationContext` 的 Host Context 授权入口；它对 Source Binding、Audience、Grant Digest、预算及 `narrator/actor/task/authority_intent` 不同身份有校验，**后续 Effective World View 不得绕过此权限入口另行让 NPC 读取 Host 全知资料**。
- [`native-rp-generation.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/refactor/atria-native-orchestration-v3/src/native/orchestration/native-rp-generation.js) 还区分 `rp_chat` 的 Original Chat Domain Receipt。**rp_chat / native_session / world state 并非自动同一事务的假定**，需要核对实际目标产品走哪一条原生通道。
- E0 必须查清：`original Native Domain Effect / World Commit` 与 `orchestration effect intent / result / receipt` 的精确边界是什么、`SessionCore.finalizeTurn` 是否已可靠合并 W13 所需的 Subject admission、事件、必要 Participant 和 Cognition、以及哪些数据只属后续派生结果。**不能把 Effect Node 的 `confirmed` 直接作为游戏世界真相**。

### 2.2 对 W13/W14 的设计影响

正确的集成方向是：**Orchestration 可以提出行为/整理结果和持有执行证据；世界身份、法则和事实仍由原 Domain Authority 的 Commit/Receipt 确立；ContextPort 必须消费 Host 已授权的 Effective World View/Knowledge Claim/Memory 投影。**

不要在 Orchestration RunLedger 中重新存一套 World Subject 实例表，亦不允许通过 Graph 的 `effect` 节点直接将未授权的 LLM 事实写入 Native World。W16 后续目标契约应尊重 Orchestration V3 已建立的 SourceBinding/Epoch/Result Proof、授权隔离与 idempotency；不能为 W14 新增 `narrator-only` 的过时 Prompt 注入旁路。

## 3. Prompt Preset 分支的新证据：语义预览不等于世界事实有效视图

在 `76032789` 的未合并 Prompt 分支：

- [`prompt-compiler.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/refactor/atria-native-prompt-preset-deepening/src/native/model-prompt-runtime/prompt-compiler.js) 定义 `worldUsePolicy / memoryUsePolicy / narrativeUsePolicy` 等编译解释约束，区分已知事实、来源历史、玩家自主权与角色秘密。这些政策是**编译约束，不是授予事实真相或权限的来源**。
- 新 [`semantic-blocks.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/refactor/atria-native-prompt-preset-deepening/src/native/model-prompt-runtime/semantic-blocks.js) 构造请求拥有的语义消息/来源投影并校验信任；它不创建新资源/世界权限 Store。
- 新 [`draft-preview.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/refactor/atria-native-prompt-preset-deepening/src/native/model-prompt-runtime/draft-preview.js) 可呈现 Authored / Effective / Provider Wire 预览与来源 Hash，但这些是 **Prompt/Provider 的有效编译和传输视图，不自动等价于 W14 的 World Fact 有效时间/受众视图**。

**协同契约候选**：`Native EffectiveWorldView` 是事实与权限意义上的只读 Source Projection → `ContextPort/ContextCompiler` 将其转成合法上下文/Claim 语义 → `PromptCompiler` 编译到作者/有效/Provider Wire，而不是 Prompt 模块反向成为 World Fact Authority。

## 4. 更具体的 Consumer / Owner / Change Map（E0 证据仍不完整）

| 实际消费链 | 此次定位到的当前或分支入口 | 目标 Owner & 接线原则 | 审查状态/优先级 |
| --- | --- | --- | --- |
| Native Session world commit | `src/native/session-core.js` `_publishLocked`、`repositories/session-repo.js` `commitSnapshot`、`public/scripts/native/experience/world/session.js` `commitEvents` | 单 Session Domain Authority 管正式 Subject/State/Event/Receipt/CAS；为 W13 统一时态和参与者签发最小数据来源 | **P0 / OPEN**：所有 Game/Task/Turn 路径的原子出版及 Unknown Commit 恢复尚未实测 |
| Orchestration V3 output | 分支 `native-turn-orchestration.js` / `effect-controller.js` / `native-rp-generation.js` / `session-output-contracts.js` | Orchestration 只提出/执行并记录证据，原 Domain Receipt 确立 World Effect；不能把 Orchestration Receipt 视为 World Truth | **P0 / BRANCH_RECHECK**：正式合入后固定 HEAD 审查真实调用方和授权出口 |
| Perspective and HCM | `native-information-runtime.js`、`native-information-contract.js`、`cognition-authority.js`、`tom-authority.js`、`memory/eligibility.js`，V3 的 `ContextPort` | Host 受控动态 Subject Perspective，受确切 Session/Branch/Revision/Source Grants 限制 | **P0 / OPEN**：静态 Package Actor 限制及新 Subject 能否获合法 Info View 未闭合 |
| Knowledge + Effective source | `knowledge-runtime.js` / `knowledge-selection.js` / `context-compiler.js` / `world-knowledge.js` | World Law + 有效当前 Fact/历史 + Source Claim 分开；自由文本仅是可引用来源，编译前按权威、受众和时态判别适用性 | **P0 / OPEN**：现有权威 Rank/状态条件不等于无条件静态句子的事实失效 |
| Prompt / provider | `src/native/model-prompt-runtime/prompt-compiler.js` + 分支 `semantic-blocks.js` / `draft-preview.js` | Context 首先使用已授权 World/Claim 来源；Prompt 负责语义、位置、Provider Wire 及预览差异，不提供世界写权 | **P0 / BRANCH_RECHECK**：Prompt 分支落后 main 十个提交且与 Orchestration 分支均编辑部分生成/模型入口 |
| Timeline / Play / Speech / Visual | `SessionCore._newEntry`、`session-projection.js`、`native-frontend-host.js`、`play-product.js`、`speech-service.js`、`visual-continuity.js` | 世界 Actor 身份与表达 Profile/Participant/Perspective/媒体表象分开；UI 受众视图按 Subject 与合法别名解析 | **P0–P1 / OPEN**：`actorId` 静态 Manifest 校验及公开 Frontend ABI 的全消费者替换 |
| Authoring and Play surfaces | `world-editor.js`、`studio-worlds-editor.js`、`studio-entrypoints-editor.js`、`studio-workspace.js`、`play-product.js` | Library 固定定义和来源；Studio EntryPoint/Authored→Effective Preview；Play 当前/历史/人物合法显示与 Inspector | **P1 / OPEN**：完整前端交互/授权 UI 尚未设定或真实屏幕验证 |
| ST World Info / Legacy Orchestrator | `atri-world-info-selection.js`、`atri-world-info-prompt.js`、`agents/orchestrator/legacy-runtime-adapter.js`、`capsule-injection.js` 等 | 分类是否 live consumer / plugin/public API / compatibility shell / test-only；真正重复写权和非法注入应硬切 | **P0 / INVESTIGATE**：部分 legacy adapter 有生产 import；`nativeKnowledgePromptChannels` GitHub 搜索仅命中定义/测试，尚需证明动态/运行时引用 |
| Long run & multi-branch | `save-point-repo.js`、`session-snapshot.js`、Simulation/HCM/History 与 V3 Source Binding | 分支 ancestor/canonical game time/源锚与执行结果解耦；旧支线延迟模型结果无权提交当前 Revision | **P0 / OPEN**：无真实长会话、存档/回退/GC、分支权限及三端数据 |

状态含义：`OPEN` = 有真实接口问题未核实闭合；`BRANCH_RECHECK` = 目前锁定来源为未合入分支，集成后须重新核验；`INVESTIGATE` = 静态引用不足判定是否保留/删除。**本轮没有通过状态的全链记录**。

## 5. 旧路径保留/替换/删除：本轮能确定什么？

| 类别 | 可以采取的当前设计结论 | 尚不能做什么 |
| --- | --- | --- |
| **RETAIN** | `SessionCore/Repo` 单 Host 事务、World/Knowledge 固定版本、Information/HCM 的来源校验、Simulation/History/Context 的可用能力；V3 在原 Domain 收据基础上做 Effect/Result 观测的职责划分 | 不表示每个当前消费者已符合目标契约，部分必须升级 |
| **REPLACE TARGET** | 将动态发言者、真实世界主体、合法 Perspective 分开；将静态文本冒充当前事实的 Context Path 接入 W14 Effective World View；Play 的 Manifest-only speaker display 需覆盖涌现 NPC | 未冻结最终字段/代码路径或断言改动量 |
| **INVESTIGATE** | 旧 `worldInfo*` 出口、Legacy Orchestrator / Capsule、已安装第三方扩展可访问的公共 ABI、Orchestration V3 与 main 的切换状态 | **不能依据文件名含 legacy 直接删**；不允许未经权限审计将原旧管线当新双写路径 |
| **DELETE** | 目前**零项有证据可以明确列入删除清单**。正式 cutover 时以固定代码 HEAD 证明旧消费者已移除且无合法生产调用、插件/作者入口才可删除 | 当前不批准任何产品代码删除，不能预先假设“删掉所有 SillyTavern 文件”就是高质量重构 |

这是偏严谨而不是默认兼容：有用的**作者资产和现役产品能力**应保留；确定重叠的**写入权威与兼容双轨**应在实施/验证中清退。

## 6. 建议的可执行交接依赖图（非正式开发许可）

```text
Capture exact main + dependency branches (V3, Prompt, Visual) with SHA
                |
  Complete production entrypoint/caller-to-owner map  [E0-06, E0-09]
                |
   Confirm Native Orchestration domain receipt/Context API owner
                |
    Freeze smallest Subject/Fact/Temporal/Grant and Effective View contracts
                |
   Plan Native Session commit + story publication + branch recovery gates
                |
   Cut over typed Participant/Info/HCM/Context/Prompt/Media consumers
                |
        Library/Studio/Play authoring & Inspector
                |
  Node/DB/E2E/CI + Windows/CachyOS/Android Termux actual acceptance
```

**分支协同规则（研究建议）**：
- 只需锁定**真正与本企划发生接口重叠**的未合入分支，不把所有旁支完成当作没有必要的前置条件；但 V3 Orchestration 与 Prompt Compiler 的核心 Host Context/Effect 出口必须确定稳定 Owner 和最终合入基线。
- 在形成明确的接口/Consumer Map 前不要创建 `feat/world-evolution-*` 并抢先在旧 main 修改 Actor/Prompt/World；否则长期多分支反复冲突。
- 如果其他任务先合并进 main，**以新 main HEAD 重新检查涉及的入口和可用契约**，旧比较结果保留为审查历史，而不是机械复制过期接口。
- W15-B Gate 0 完成后，正式开发若获用户另行授权，应使用**同一个合适的临时实现分支**推进，按实际验证持续完成，不为每个小阶段反复开分支/留长期兼容包装；真正涉及 CI 长时间等待、真实 UI 或三端真机时再依用户规则处理。

## 7. W16 方案选择（均未获得用户确认）

**W16-A · 只按 main 现有 API 冻结全部 World/Knowledge 契约**：忽略未合并的 Orchestration V3、Prompt Preset 的 97+/1 个提交，直接设计并预先指定 `GenerationHost` / `PromptCompiler` 接口。会导致切换后一批直接冲突与双适配。

**W16-B · 跨分支锚定 E0 + 先锁 Host Domain/Context/Receipt 所有权，再冻结最小世界接口（推荐，未获用户批准）**：以本轮精准 SHA 和部分 consumer map 为起点，将 V3 Effect/Source/Output 与原 Native World/Session Domain 的责任、Prompt Effective/Wire 与世界 Effective 的责任先作边界判定；对真正冲突的主线/未合入分支在最新可复核 HEAD 上做全调用图核对，留下 `OPEN/BRANCH_RECHECK` 并明确合入/交接条件；仅在这些权威点稳定之后冻结 Subject/Temporal/Context 新 ABI 和正式工程切线。不是无期限等“所有并行项目全部完成”，也不是迫使用户反复批准微观工程决策。

**W16-C · 为新 World Subject 并行构造一套适配旧、新 Orchestration 与 Prompt 的多层桥接**：短期可能减少接口协商，但将制造大量长存 Compatibility Adapter、双写/隐私边界与 Token 浪费，违背已确认 W12-B。

**推荐 W16-B，但用户本轮仅明确同意 W15-B；不要将 W16-B 标为冻结结果。**

## 8. E0-01～09 的本轮变化与下一次审计任务

- **E0-01 Subject/Fact Contract**：仍 OPEN，已明确必须以单 Session 正式身份/事实/来源/游戏时态为最小核心，不能将 Orchestration Effect node 或 Prompt Semantic Block 直接视为 World Fact。
- **E0-02 Native Publish/Recovery**：OPEN；V3 新证据显示原 Domain Session `finalizeTurn` + `readSessionTurnOutput` 与 Run 的 Effect receipt 分层，必须证明 World Action/Subject admission 也使用受控路径。
- **E0-03 Temporal & Branch**：OPEN；Snapshot/Save/Branch 已有基础，通用 `asOfGameTick/asKnownRevision` 尚未证明。
- **E0-04 Security/Perspective**：OPEN；V3 ContextPort 为真实 Context 授权交叉点，动态主体的合法 `actor` / source grant 与前端/Prompt Disclosure 仍未闭合。
- **E0-05 Claim-aware Context**：OPEN；Prompt 分支已有世界/记忆证据解释政策与有效/Wire 预览，但它们不自动实现 W14 的 SourceClaim/有效时态裁决。
- **E0-06 Full Consumer/Deletion Map**：PARTIAL/OPEN；本轮已新增 branch-aware 具体文件和 source/receipt 关系，但没有完整文件调用图；Legacy WI/Orchestrator 功能需要确认是否 live。
- **E0-07 Library/Studio/Play/Frontend**：OPEN；作者资源与游戏现场上下文目标清晰，但缺失真实 Schema、UI/权限和实际交互。
- **E0-08 Longevity/Persistence**：OPEN；未执行 Node/数据库、长会话、GC、任意三端实验。
- **E0-09 Branch/Dependency Integrations**：取得精确分支 SHAs 与差异状态，仍 **BRANCH_RECHECK**；V3 Orchestration 核心大范围未合入，Prompt/Visual 还与 main 分叉，真正整合后需要重新审查。

**下一阶段建议**：若选择 W16-B，下一轮先将用户批准的选型写回本模块/设计/唯一 Record，再针对 E0-01/02/04/05 中最关键的 **Domain Effect ↔ Participant ↔ EffectiveWorld ↔ Orchestration Context ↔ Prompt Effective/Wire** 交界处形成小规模类型与事务顺序决议，并划出 E0-06 真实删除清单的证据退出条件。仍保持 Draft，尚不创建实现分支。
