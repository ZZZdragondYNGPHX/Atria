# ARCH-DWE-01 — Dynamic World Evolution & Consistency Record

- Task ID: ARCH-DWE-01
- Primary Workspace: docs
- Status: Paused · Draft / waiting for queued refactors and user-directed Codex takeover
- Plan: [plans/architecture/world-evolution-consistency/index.md](../../plans/architecture/world-evolution-consistency/index.md)
- Initiated: 2026-10-17

当前仅完成方案整理与静态源码阅读，产品实施仍为 **Draft / Paused**。以下 Stage 保存当时的决策、提交与发现；其中旧 Gate、Preflight、PASS/BLOCKED 及授权状态均为历史记录。当前设计与实施方式以 [Plan 入口](../../plans/architecture/world-evolution-consistency/index.md)为准，原讨论流程已于 Stage 27 清理。

## Stage 1 — 建立方案与首轮广泛调研（2026-10-17）

- Start HEAD: 未在操作前捕获 docs 原 HEAD；不据此推断其他分支进度。
- Document change commits:
  - bca017a98185ec7ae2371ba9b8b07c75cf9c9b60 — 创建 index.md 初始方案。
  - f916aefe4c21503b35f19f41e0293a702a04fbcc — 添加 design.md 方案对照、冲突案例、问题轴与风险。
- Status: 当前讨论稿与调研材料已写入；尚未确认最终架构和实施计划。

### Completed

- 阅读 docs:README.md Governance v1.7，确认 docs 独立工作空间、Plan Bundle / Record 职责。
- 外部广泛研究：SillyTavern Lorebook、Azure Event Sourcing/CQRS、XTDB 双时间、Wikidata 时态修饰、Doyle TMS、PDDL、inkle ink、Versu、Comme il Faut、Generative Agents、Concordia、IJCAI Temporal KG、Unreal GAS。
- 记录候选 A（Prompt Overlay）、B（Native Fact Binding + Effective View）、C（Full Temporal World Graph）；B 是研究建议，**不是用户决策**。
- 指出可能存在的关键断点：自由文本知识的过期事实未与当前原生状态精确绑定；模型叙述与世界状态提交的一致性仍需真实端到端审计。

### Known limitations / unresolved

- 相关文件存在不等于运行时消费者已接线，尤其动态事实声明与 freeform KnowledgeEntry 的失效行为需要后续 E0 审计。
- 没有证据证明全量文本矛盾自动识别可以稳定无误；保留此方案的误判/成本风险。
- Round 1 尚未收到用户对 A/B/C/D 关联模式的选择；无已冻结的设计决定。

## Stage 2 — S2 世界 / 知识原生重构扩域研究与候选方案（2026-10-17）

- Trigger: 用户明确提出「现有 World / Knowledge 仍受 SillyTavern 时代世界书影响，希望趁机进一步重构」。
- Primary Workspace: docs，沿用 ARCH-DWE-01 唯一 Plan/Record，不创建重复企划书。
- Status: **Draft / Discussion**；没有用户批准的最终架构，也未开始产品实现。
- docs document commit sequence:
  - 4552d64bbee8a2fe18e8cbe66e4bdc86236eea28 — design.md 新增 §8 S2 扩域设计、ST 概念去留、World Model / Source Library / Effective View 与轮次选择。
  - 6a669c4a8a8953f22bf85e7af48cd1ca9fb4ecb3 — research.md 新增 §F ST/W3C SHACL/PROV-O/RDF/XTDB/Concordia/inkle/Generative Agents 对照及 Atria main 语义证据。
  - 09876a77b6c5278a4d45653b3cc8e7aa323b92c3 — index.md 调整统一 Plan 的目标、讨论入口和当前状态。

### Evidence and completed work

- 区分“已有原生重构成果”与“仍继承旧条目/触发器心智模型”：前者有原生版本、binding、state/events、权限和上下文；后者仍以 discovery/lifecycle/delivery 字段为重要语义。
- 补充外部原始资料对照；
- 用户此前未就 R1 事实锚点与四层解释模型正式批准任何路线，保持未决。
- 未修改 main、未创建产品分支。

### 当时的未决问题

- 当时待议的是 World 与 Knowledge 主体关系和是否采用 Hybrid Authoring / 精确事实锚点的取舍。
- 外部模型仅为方法论；严禁无证据引入第二世界权威、新 DB 或创建旧数据兼容负担。

## Stage 3 — W1 方向决定与 W2 建模讨论准备（2026-10-17）

- 用户明确同意上一轮推荐的 **B · World Model + Source Library**（W1）：世界模型是创作主语，知识是资料/来源；产品心智模型脱离以 ST Lorebook 的条目激活为中心。
- 此项是**总体设计方向获得认可**，不是整份方案定稿或全部子接口冻结；以 SessionCore/Session/Branch/Revision 为唯一运行时真相的原则与用户所选 B 一致；不创设新可写事实权威，不强迫纯文字作者全面结构化。
- Plan index 已标记 W1 认可与 W2 待议；W2 推荐 B 的混合模型尚未获用户选择，不可提前宣称批准。

## Stage 4 — W2 确认与 W3 法则/事实权限讨论准备（2026-10-17）

- Trigger: 用户回复“认同”，承接上一轮明确推荐的 **W2-B：分层混合结构**。此处记录其对 W2 的认可；不扩张解释为 W3 选项或最终计划获批。
- Decision (confirmed design direction): W1-B World Model + Source Library；W2-B Hybrid Authoring，保留完整自由文本的创作地位，实体身份与影响演化的关键事实按需结构化，辅助 AI 的作者阶段抽取要经确认，Play 事实继续以现有 Native Session/Branch/Revision 的已提交状态为权威。
- Design commit: `a266429d78d55ca75e0281fae95933bc471ad720` — 同一 design.md 增补 §10，记录 W2 决策并编写 W3 法则/起点/动态真相/隐藏 Canon/未知和秘密、AI 提议的影响等级、Native commit、重大法则变更、W3-A/B/C 方案和风险。
- Index commit: `24534fad80eaf97e3344c4c84403b041bd2de75b` — 同一 index.md 路由到 §10，标明 W1/W2 已选而 W3 未选。
- 静态对照 main 的 `src/native/world-knowledge.js`、`public/scripts/native/experience/world/session.js`、`public/scripts/native/experience/logic/runtime.js`、`src/native/simulation-authority.js`。
- Changes: **仅 docs**。未修改 main / 任何产品代码，未创建实现分支，未对 World/Knowledge Schema 或权限 API 做正式实现承诺。

## Stage 5 — W3-B 确认、W4 涌现实体与事实生命周期（2026-10-17）

- Trigger：用户明确选择 **W3-B 分级约束 + 涌现世界**；本工作轮扩展事实事件、持久化、历史与分支设计，补充：**游玩中新出现的 NPC、物品、地点与非预设内容如何真正加入活世界**。
- Decision **已确认的设计方向**：W1-B World Model + Source Library，W2-B 分层混合结构，W3-B 分级约束 + 涌现世界。W3-B 以不变法则守护与现有 Native Session Host 提交为核心；作者留白允许授权范围内的新增事实；重大事件/世界规律更动有专门约束。用户**没有**批准细粒度权限 API、实体类型数据库、W4 选项或实施开工。
- Plan 模块新增：`plans/architecture/world-evolution-consistency/runtime-emergence.md`，仍为**同一 ARCH-DWE-01 Plan Bundle**，没有第二份企划书。它提出 Entity Admission、临时场景/见闻/持久实体/活跃主体的分离、NPC 出场→持续交互→正式登记→时钟演化、事实提交与发表一致性、有效游戏时间/提交修订/角色获知时间和分支隔离，附 W4-A/B/C 三选候选与测试案例。
- `src/native/session-core.js`/ `save-point-repo.js` 管 Session/Branch/Revision/SavePoint；`src/native/state-delta.js` 支持世界状态快照/增量；`src/native/lifetime-authority.js`已有受特定可选策略约束的 `person.enter`, `person.promote`, `person.exit`，并区分出生和介绍时间；`public/shared/native-actor-profile.js`的 authored Actor 仅来自固定 Package/EntryPoint，不应与运行时新增 NPC 混淆；HCM entity extraction 不是 Native 世界真相；Simulation Authority 有有界调度机制。具体所有调用方/端到端功能尚需 E0 审计。
- 本轮 docs 提交：
  - `bf7b77936685566d87c5caa13d2d1ab5c734c666`：新增同一 Plan 的 W4 模块 `runtime-emergence.md`。
  - `1ad46dbe704ed1a4f911fa24553d717048f54bad`：`design.md` §11 记录 W3-B 已确认并关联 W4。
  - `ca5dc676cb0699df3c9f7d725183a6410a151f84`：`index.md` 路由到 W4，明确 W1-B/W2-B/W3-B 已确认、W4 未决。
- 本轮只修改 docs，不修改 main / 产品源码，不创建实现分支。

## Stage 6 — W4-B 确认与 W5 NPC 自主性/离屏演化设计（2026-10-17）

- **用户决定：**对 W4-B「渐进接纳 + 关键交互即时提交」表示“认同”。在此前 W1-B、W2-B、W3-B 的基础上将 W4-B 记为**已经确认的顶层设计方向**，不延伸为对 W5-B 的默认批准。
- **范围：**仍为 Task ARCH-DWE-01 / Primary Workspace docs。同一 Plan Bundle 新增当前阶段子模块 `plans/architecture/world-evolution-consistency/npc-autonomy.md`，不新建平行 Plan/Record、实现分支或 HANDOFF。
- **本轮 docs 提交（依次）：**
  - `122804896457a090eb9c67ee24a6b88da4c2b2e4`：更新 `runtime-emergence.md`，明确 W4-B 已选、具体接口仍待议。
  - `52111e0d5f86286ecbb330262d2b5994e50eec81`：新增 W5 `npc-autonomy.md`，调查自主行为分层、目标/意图与实际提交、游戏时间离屏追赶、认知隔离和预算，提出 W5-A/B/C 供讨论。
  - `0f3d42ac5d50f44bafd003b061393450421b31f9`：在同一 `design.md` 加入 §12，记录 W4-B 与 W5 选型路由，纠正历史章节开头的过期“全部方案未确认”状态。
  - `a2d69e406eb2f75547e8a5a69652aa86b9f43ead`：更新同一 `index.md` 的 W1–W4 状态、W5 当前阶段模块索引。
- **外部参考：**Generative Agents 2023 论文、Google DeepMind Concordia 及其 Engine 文档、Unreal Mass Gameplay Simulation LOD / StateTree 官方文档。借鉴“记忆/目标/行动结算”和“模拟粒度按重要性调整”，不建议直接引入新框架。
- **main 静态审查（非实测）：**`src/native/simulation-authority.js` 已有游戏时钟、scope、hot/warm/cold、界限任务；`public/shared/native-simulation-contract.js` 当前静态约束是 jobs≤16、steps≤16、deliberations≤1，并约束同作用域静态读取——动态 NPC 不能机械地各占一个固定 job；`public/shared/native-information-contract.js` 有 desire/intention/belief 等语义；`src/native/lifetime-authority.js` 有人物进出及重要度；`public/shared/native-actor-profile.js` 从 Package/EntryPoint 才投影 authored Actor；`public/scripts/agents/memory/eligibility.js` 有 requester 权限边界。没有证据证明任意生成的 NPC 已自动具备全套角色视图或认知/Orchestrator 调用权限。
- **W5 推荐但未确认：**W5-B 分层事件驱动自主性：A1 规则/日程、A2 有界反应和效用选择、A3 少数重要 NPC 的有限 LLM 辅助提案，统一由现有 Native Authority 提交；游戏时间推进触发离屏结算，不默认用户离线时继续后台运行。
- **Plan 状态：**Draft。

## Stage 7 — W5-B 确认与 W6 社会认知/关系权限讨论（2026-10-17）

- **用户决定**：回复「认同」，针对上轮明确推荐的 **W5-B 分层事件驱动自主性**。W1-B、W2-B、W3-B、W4-B、W5-B 现为已确认设计方向；并未确认 W6-B，也未批准全案定稿、产品实现或特定调用方契约。
- **任务所有权**：`ARCH-DWE-01`，Primary Workspace 仍为 `docs`，沿用同一 Plan Bundle 与唯一 Record。没有创建第二方案、HANDOFF、实现分支。
- **已完成的文档更新及提交**：
  - `0782c6072edd111cc12e88907c45e9a0e175bff1`：现有 `npc-autonomy.md` 的 §10 记录 W5-B 已获用户选择，明确预算、身份权限和任务承载未定。
  - `9ea059d1ab6f5182d88be228d74ecfc253ff460c`：在同一 Plan Bundle 新增 `npc-social-cognition.md` 作为 W6 当前模块，包含主体认知与真实关系分离、知识传播、动态 NPC 权限接入、案例/风险和 W6-A/B/C 三种待议方案。
  - `a5a17c3b2be58b3d0f796a49d9b21d9d8254a0c4`：更新总设计 `design.md` §13，记录 W5-B 并指向 W6 模块，不复制第二份细节。
  - `832ac899e1587f6b6bfc5cdfa6057eb1e68b412a`：更新入口 `index.md` 路由与 W1–W5 状态；W6 保持未获批准。
- `public/shared/native-information-runtime.js` 提供 exact snapshot/anchor、actor availability/分支隔离、可界定的 Source 投影；`public/scripts/agents/memory/eligibility.js` 严格依据 Information 已授权来源/受众/分支限定取回，`src/native/lifetime-authority.js` 的有因果来源的 bond/家庭关系属于特定可选领域。不能把自由涌现 NPC 直接视为获得全部 authored Actor/认知权限。
- **外部资料对照**：Park et al. (2023) Generative Agents（经历/反思/计划）、Evans & Short (2013/2014) Versu（社会实践为自主角色提供行动机会但不强制执行）、Treanor et al. (2015) Social Play in NPC Dialog（多阶段、可参与的社会互动）。外部机制用于概念比较，未引入依赖或执行对方项目。
- **W6 研究推荐**：W6-B「世界关系事实 + 主体认知 + 来源事件」。双向成立的客观契约/联盟由 Native 提交；私人态度、目标、误信、情绪与其他角色的推测由已授权 Cognition/HCM 视图表达；通过可追溯通信/观察事件传播，防全知、串档和模型无权替玩家决定行动。**推荐不是用户已批准的冻结决策**。
- 未修改产品 main、Package、Plugin、reference、Governance。

## Stage 8 — W6-B 确认与 W7 私人记忆/信息传播设计（2026-10-17）

- **用户确认**：对上一轮明确推荐的 **W6-B「世界关系事实 + 主体认知 + 来源事件」**回复「认同」。本次决策连同 W1-B/W2-B/W3-B/W4-B/W5-B 成为已确认的总体架构方向。已提交的共同关系与事实归单 Native Host/Session 真相，主观态度、信念、目标与猜测归各主体合法认知；信息靠可追溯观察/传播事件联结。**不表示用户选择了 W7-B、冻结了完整方案或授权代码变更**。
- **Task 与文档边界**：依旧只有 `ARCH-DWE-01` 一个 Primary Workspace `docs`、一份 Plan Bundle 与这一份唯一 Record。W7 新模块位于 `plans/architecture/world-evolution-consistency/npc-memory-information-flow.md`，并非并行新企划；不创建 HANDOFF、产品任务分支。
- **本轮文档提交**：
  - `74c0531258eaa4d8d178d2a4463104d8eaef0083`：新增 W7 `npc-memory-information-flow.md` 草案，包含动态 NPC 受众资格、经历/信念/目标/承诺/情绪的区分、秘密与谣言传播、分支隔离、W7-A/B/C 备选与 E0 未决问题。
  - `eb1c6719a3ad6c47b4cb5ea25b18e59234593d85`：更新原有 W6 `npc-social-cognition.md` 第 10 节，记录 W6-B 为用户确认方向，其余细则 Draft。
  - `15afa035cf8b31af749bc5d41f47eb2afec1a4e8`：更新同一 `design.md` 第 14 节，记录 W6-B、W7 关键边界与模块路由。
  - `91c8bd0392433ee8dba671488c3d2623f3ccde44`：更新同一 Plan `index.md`，明确 W1–W6 状态、W7 为当前阶段而非已批准方向。
- `public/shared/native-information-runtime.js` 未声明 actor 视为 unavailable，快照与 scope anchor、输出预算已具备；`src/native/cognition-authority.js` 与 `src/native/tom-authority.js` 部分目标身份受 `manifest.actors` 约束；`public/scripts/agents/memory/eligibility.js` 由当前授权视图/来源与 branch 限制可取回记忆；`public/shared/native-memory-contract.js` 已有 identity/commitment/relationship/key_event/detail 记忆类别与时效语义。未证实新生 NPC 能自动取得这些权限，不能靠读取 Narrator 全部资料或修改 Package Manifest 绕过。
- **W7 研究建议但未获批准**：W7-B「动态受众资格 + 证据驱动信息流」。NPC 获得稳定世界身份≠自动获得独立思考/隐私读取权限；合法 Perspective 的接纳与源可见性须分别处理。发送/送达/获知/相信/更正为不同事件或主体状态，真正世界后果仍由唯一 Native commit 确立。避免每 NPC 独立常驻 Agent。
- E0 全消费者审计与具体实现阶段尚未完成，完整企划继续保持 Draft。

## Stage 9 — W7-B 确认与 W8 长期记忆/人格连续性讨论（2026-10-17）

- **用户正式确认**：对上一轮推荐的 **W7-B「动态受众资格 + 证据驱动信息流」**回复“认同”。现有 W1-B 至 W7-B 是已获用户选择的总体设计方向；**不应推断 W8-B 已选择，或整份企划已经定稿/获准实施**。
- **工作空间与范围**：沿用 `ARCH-DWE-01`，Primary Workspace 仍为 `docs`；只更新既有 Plan Bundle 和唯一 Record。不改变 `main`、产品代码、其他长期分支、Governance 或用户资产，不创建实现分支/第二 Plan/HANDOFF。
- **本阶段文档提交**：
  - `bd1c4080e92dd26ecc8ed02ad12fa5645b9d0aa6` — 更新 W7 `npc-memory-information-flow.md`，记录 W7-B 已确认及权限/接口未决。
  - `ef0f7f20f3102daf6367c69d38809d066d4c133d` — 同一 Plan 增加 W8 `npc-memory-continuity.md`，讨论客观历史与个人回忆/认知分离、源证据、模糊遗忘、受保护承诺、人格成长、长期成本、分支隔离和 W8-A/B/C 比较。
  - `0d84101b04f70a6c19c87a23450a33361b76c37b` — 总设计 `design.md` §15 记录 W7-B 已确认，路由至 W8。
  - `a5b34a103d6bebb3ccab1f29cc98a81f9b177f2b` — 更新 Plan `index.md`，注明 W1–W7 已确认，W8 仍为待议模块。
- `public/shared/native-cognition-runtime.js` 按合法时间、记忆类别及来源适用性投影模糊/使用意愿；`public/scripts/agents/memory/source-provenance.js`、`temporal-graph.js` 与 `eligibility.js` 提供来源证据、图谱与受众过滤；
- 借鉴检索/预算机制，不将实验结论冒充 Atria 跨端可靠性证据或作为引入新框架的理由。
- **W8 建议，明确未获得用户批准**：W8-B「来源保真 + 分层回忆与人格连续性」。客观历史和持续义务的权威不随个人遗忘消失；HCM 负责合法证据检索/来源链，Native Memory/Cognition 负责在受众资格下解释回忆适用性、主观信念及人格变化；没有足够证据时不得将心理猜测写成事实。

## Stage 10 — W8-B 确认与 W9 跨域身份/权限映射讨论（2026-10-17）

- **明确用户决定**：对上轮唯一推荐 **W8-B「来源保真 + 分层回忆与人格连续性」**回复「认同」。W1-B 至 W8-B 均是当前已确认架构方向；**未授权 W9 选型、具体 ID/Schema、整体定稿或任何代码开发**。
- **工作空间**：继续 `ARCH-DWE-01` / Primary Workspace `docs`；唯一 Plan Bundle 与唯一 Record。只做文档+研究，未创建 HANDOFF、新 Plan、实现分支、其他长期分支合并或 reference 更新。
- **本轮 docs 写入（按提交顺序）**：
  - `09ce982683de3a43c2c6e8e8c536bd50efd16c5c`：在 `npc-memory-continuity.md` §11 记录 W8-B 已选，保留源历史、受众限定记忆与人格演化、不造第二 Memory/World 权威，并明确未定接口。
  - `e26a985a85f024204254801829cc3dee15273cdc`：在同一 Plan Bundle 新增 W9 `entity-identity-authority.md`，详述 World Subject/Actor/Lifetime/HCM/Perspective/Timeline 跨域 identity 的职责、来源映射、同名歧义、秘密身份、Session/Branch、选项 W9-A/B/C、UI 与 E0 审查。
  - `4b871d86762929dde9ad34716bd15a3691ec33ef`：更新同一 `design.md` §16，记录 W8-B 并将 W9 候选模块作为唯一详细设计入口。
  - `0d3501f12b06b28f9d8baee51d11daebe022cf16`：更新同一 `index.md`，明确 W1–W8 已确认、W9 当前讨论与 Draft。
- `public/shared/native-actor-profile.js` 的 Authored Actor 严格来自 manifest/EntryPoint；`src/native/lifetime-authority.js` 的 `life.person.*` 是可选领域局部身份；`public/shared/native-cognition-runtime.js` 的 Actor ID regex/受众限制与世界新 NPC 的标识并不自动相容；`public/scripts/agents/memory/temporal-graph.js` 有独立本地图实体/别名/来源支撑的合并/拆分与 ambiguous/pending 身份；`src/native/repositories/session-repo.js`/SavePoint 持有唯一 Session/Branch/Revision 权威。没有全消费者 E0 证据表明它们已共用统一身份，不能写成现有已完成能力。
- **外部概念对照**：Martin Fowler Identity Map（单一工作单元内保持引用一致，不是全局可写实体表），Microsoft DDD Entities/Aggregates（长期身份与一致性边界），W3C PROV-O（来源、alternate/specialization，不能因关联自动证明同一对象）。仅作方案类比，未引入数据库/框架依赖。
- **待议 W9 推荐，不是用户决定**：W9-B「Canonical World Subject + 受控跨域映射/投影」。已提交世界成员由 Native Session 持有稳定主体身份，不同领域保留自己的 ID/权限/历史引用，通过明确来源、分支、可见范围关联；HCM 未确认的传闻实体不自动变成客观角色；Authored Actor 是表达资产而非必然一对一的物理世界人物。不要把“一个世界人物”误译为“所有模块使用同一个 ID 字符串/存一份万能对象”。

## Stage 11 — W9-B 已确认与 W10 实例化/能力绑定讨论（2026-10-17）

- **用户本轮决定**：对 W9-B「Canonical World Subject + 受控跨域映射与投影」回复“认同”。将 W9-B 记为已确认**顶层架构方向**；连同 W1-B～W8-B 的已确认方向纳入 ARCH-DWE-01。**本轮不是 W10-B 选择、不是完整 Plan 定稿或代码实施授权**。
- **任务和边界**：Primary Workspace 仍为独立的 `docs`；沿用唯一 Plan Bundle `plans/architecture/world-evolution-consistency/` 和此唯一 Record。不创建第二 Plan、HANDOFF、实现分支，不修改 main/其他长期分支、Package 或 Legacy Compatibility。
- **本轮 docs 变更/提交（按顺序）**：
  - `68e4f1ce9e87acbc56fe8ab7ed7449d21f71083f`：更新 W9 模块 `entity-identity-authority.md` §11，记录 W9-B 正式选择、稳定 SubjectRef 与有证据/分支权限的跨域映射原则，明确实现细则仍未定。
  - `0c743a44dca56bd7ecffa320c55e536b924e9df7`：同一 Plan Bundle 新增 W10 当前模块 `subject-instantiation.md`，覆盖 World Definition / Authored Actor → Session Subject 实例化、运行时 NPC 表达/发言/认知/任务能力接纳、同一模板多实例、隐秘身份、HCM 消歧、分支继承、方案 W10-A/B/C。
  - `bdfa6f5a451ee19a3ec4411aae95c1e7df0f2488`：现有 `design.md` §17 冻结**W9-B 方向本身**并将 W10 候选标为未确认，明确 E0 消费者范围。
  - `437fda1c611a2a2064b8f9e0a43e9528482d1523`：现有 `index.md` 确认 W1–W9 选型、路由 W10，继续显示 Draft。
- **代码审查范围与可确定的静态事实**：`src/native/identity.js` 当前列举 actor/world/session/branch 等 ID family，已读列表中未见 World Subject 独立 ID；`public/shared/native-actor-profile.js` 仅读取确切 Package/EntryPoint Authored Actor；`src/native/session-core.js` 的 Timeline `actorId` 当前只接受 `manifest.actors` 成员，Session 初始世界数据有 worldSelection/基线及可选 Worldless 情形；`public/shared/native-information-contract.js` 的 actor/view 声明是有限静态绑定；`public/shared/native-cognition-runtime.js` 的认知 Actor 使用 `actor_*` 身份约束；`src/native/lifetime-authority.js` 具 `life.person.*` 域内对象；HCM `temporal-graph.js` 有来源、歧义待决实体与受证据支持的 merge/split。它们无法仅凭名字自动统一为一个具备所有权限的角色。
- **W10 推荐，明确尚未获批**：W10-B「固定定义 → Session 主体实例化 + 类型化能力绑定」。Native Session/Host 仍独占正式身份与已发生效果，原有作者资源保持固定；表达 Template、Timeline 参与者、Cognition/HCM Perspective、Lifetime/Task 在证据/权限/时间/分支界限内被合法引用。保留同一 Actor 模板复用不同世界人物的合法情形，秘密真身不自动对玩家或其它 NPC 显示。
- **未修改产品代码，完整企划仍 Draft**。

## Stage 12 — W10-B 确认与 W11 类型化身份/能力契约及 E0 准备（2026-10-17）

- **本轮用户选择**：回复「认同」，对应上轮唯一推荐 **W10-B「固定定义 → Session Subject 实例化 + 类型化能力绑定」**。因此 W1-B～W10-B 是用户明确确认的**顶层设计路线**；不是 W11-B 批准、不是具体 ABI/权限接口定稿，不授权产品开发。
- **主要已确认原则**：固定 Authoring World/Package/Actor Profile 只提供来源、起始事实和表达模板；Native Session 创建正式 Subject，运行时新增 NPC 仅在持续后果出现后经 W4-B 原生受控提交接纳；表达模板、对话 Participant、私有 Perspective 和可执行 Task/Simulation 能力均分别鉴权、按事件和分支版本追溯，不通过 Runtime 反向编辑 Package 或将单一 `actorId` 强制兼任所有角色。
- **唯一工作空间/资产**：继续 `ARCH-DWE-01`，Primary Workspace `docs`；沿用一份 Plan Bundle、一份 Record。新子模块 `subject-contracts-e0.md` 在同一 Plan 下，仅处理 W11。本轮未创建第二企划、HANDOFF、实现分支、兼容层或产品文件。
- **本轮 docs 提交顺序**：
  - `4329647fd381694cd2ede7914b1a9e4a908c1ba5`：原 W10 `subject-instantiation.md` §10 正式记录 W10-B 用户确认，保留具体 Schema/API 未决。
  - `8e0c4f1e3b601c7cc7373e8a0001ebf145844f9b`：同一总设计 `design.md` §18 写入 W10-B 方向及 W11 讨论路由。
  - `257df0e3bb1186e230929e1bc414d6848eabf2c3`：同一 `index.md` 更新至 W1–W10 已确认、W11 候选未决，保持 Draft。
- **局部 main 静态证据**：SessionCore `_newEntry` 仍拒绝不属于 Manifest Actors 的 `draft.actorId`；ActorProfile 取材固定 EntryPoint/Package；`assertInformationClosure` 要求 Info Actors 是 Manifest Actors；Information/Cognition/ToM 及 Goal Contracts 使用 Actor 身份和来源权限；`public/shared/native-frontend-host.js` Message ABI / `public/scripts/native/session-projection.js` committed fingerprint 暴露 actorId；HCM Evidence Entity/Lifetime 局部 ID 不等同于 Subject。以上仅是选择性静态读和搜索，**不是完整 E0 caller census**，也没有自动证明新 NPC 已可合法发言或维护私人记忆。
- **W11 建议（未获用户批准）**：W11-B「Typed Subject / Participant / Perspective + Native Host Capability Resolution」。受控实体与已提交对话/事件分离，表达 Profile 与个人记忆/任务授权单独授予、分支/修订/受众解析；要最小化对现有 Authority 的改动、一次性切换旧 Actor 强耦合真实消费者，而不是新建多套可写 DB、向 Narrator 申请全知或在运行时重写 Package。
- **风险/E0 保留**：Timeline/Context Compiler/Generation Host/Orchestration、HCM/Information/Cognition/ToM、Native Host 前端 ABI、Goal/Lifetime/Task/Simulation、Visual/Speech/Persona、Studio/Library/Play 与 Save/Branch 的**生产调用方、权限、跨分支、版本、预算、UI**尚未全量审查。不能以“发现文件路径”代替运行时接线确认。
- **状态**：完整企划继续 **Draft**，未授权开工。 

## Stage 13 — W11-B 确认与 W12 接口级 E0 / 事务与切换讨论（2026-10-17）

- **用户决定**：明确“认同”上一轮推荐的 **W11-B「Typed Subject / Participant / Perspective + Native Host Capability Resolution」**。当前 W1-B～W11-B 均属于用户已确认的**架构方向**。
- **工作域**：继续使用 `ARCH-DWE-01`，唯一入口 `plans/architecture/world-evolution-consistency/index.md`，唯一累计 Record 即本文件；`docs` 仍为唯一被修改分支，不创建新 Plan/Record、HANDOFF、实现分支或跨长期分支合并。开发尚未授权。
- **本轮 docs 提交及内容**：
  - `475b4541741f065f11cd874fc32053f5944fefd4`：在 W11 `subject-contracts-e0.md` §8 记录 W11-B 为确认方向，明确身份、表达、合法个人视角与正式叙事参与者的类型化边界，不把类型语义自动等同新独立数据库/API。
  - `b3cfa3bcc7d9ffb36433524dff720f6deb46d34d`：新增**同一 Plan Bundle 的 W12 模块** `e0-consumer-cutover.md`，详细列出 Source-of-Truth/Owner 矩阵、真实生产代码路径的部分审计、World/State/Receipt/Timeline 统一发布边界、valid game-time / committed revision / observed time 区分、存读档/权限、Library/Studio/Play 和 W12-A/B/C 候选。
  - `2571ffc478d93be122e4a54c2efb9fdf7dbb51a4`：同一 `design.md` §19 记录 W11-B 已确认，W12 仅为候选路线，并注明 E0/全端仍有阻塞。
  - `14536e43eb2f2c143176099a84c9aa38a41d331d`：更新同一 `index.md` 的 W1–W11 状态、W12 模块路由与 Draft 限制。
- `public/scripts/native/experience/world/session.js` `commitEvents` 可将 `atri_world_state` 与 `atri_game_runtime` journal 随 `commitStatePatch` 提交。**不能推断所有** Narrative/Task/Native Orchestration/World Events/Cognition 的跨域效果都天然处于相同原子 publication。
- **当前静态消费者事实**：`SessionCore._newEntry` Actor ID 限定 Manifest；`assertInformationClosure` 信息受众声明依赖 Manifest；`Native Frontend Host.MESSAGE_SCHEMA`、`session-projection.js` fingerprint、`speech-service.js`/部分 Visual 都消费 Actor ID；`native-chronicle-host.js` 部分 World View 围绕特定 Lifetime 域而非已实现通用实体有效时态查询；`world-editor.js` 当前作者界面主要有 schema/baseline/metadata，后续 World Model UI 不可假设已有；`context-compiler.js` 有 Token lanes、世界/知识/信息来源。
- **W12 研究推荐（用户未确认）**：W12-B「E0 证据驱动的原生硬切 + 单权威提交收口」。先审全量消费者及旧→新实际接口，再最小化在现有 Native Host 做类型化 Subject/Participant/Perspective、事件/权限/时态的可靠提交；W12-A 跳过 E0 直接大改及 W12-C 并行新旧系统均有显著风险。
- **产品代码 main 未修改**。
- 继续 Draft，不创建实现分支。

## Stage 14 — W12-B 已确认与 W13 原生事件/时态/分支讨论（2026-10-17）

- **用户本轮确认**：回复「认同」，明确接受上轮推荐的 **W12-B「E0 证据驱动的原生硬切 + 单权威提交收口」**。W1-B～W12-B 现为已确认的架构及实施方向；**并非** W13-B 已获得批准、全量 E0 已完成、具体 schema/API 已冻结、整体方案定稿或允许改动产品代码。
- **任务所有权/范围**：沿用唯一 `ARCH-DWE-01` Plan Bundle `plans/architecture/world-evolution-consistency/` 与此唯一 Record；工作区仅 `docs`。本轮只进行 GitHub 上源码静态阅读和文档提交，不创建第二 Plan/Record/HANDOFF/实现分支，不更改 main/Package/Plugin/Skills/reference。
- **本轮 docs 提交**：
  - `a56333f152b91defec755cc376e179da40391d40`：在同一 Plan Bundle 创建 W13 `event-temporality-branch.md`，研究“意图/叙事声明 vs 已提交效果”、Native Commit/Receipt/Revision、世界事实 valid time/记录 revision/角色 observed time、历史纠正/Retcon、存档分支和故障矩阵、W13-A/B/C。
  - `6c97b64cf54a12a7947bd6a0fddd366d18b780eb`：在同一 `design.md` §20 记录 W12-B、路由 W13，严格区分静态事实与拟议目标。
  - `1cea3eb6eb1c8cea490a7df60b0b68781eb8e9a1`：在同一 `index.md` 将 W1–W12 标记为已确认、W13 待选，更新路由和 Draft 状态。
- **静态源证据（2026-10-17 main）**：`src/native/repositories/session-repo.js` 的 `commitSnapshot` 在已有事务中处理 Session/Revision、`expectedRevisionId` CAS 与提交指纹/Receipt；`public/scripts/native/experience/world/session.js` 的 `commitEvents` 通过 `commitStatePatch` 同步更新 `atri_world_state` 与 `atri_game_runtime` Journal，事件示例使用 branch+sequence 身份。证据只表示可复用机制存在，**没有**完成 Actor/Task/Narrator/World 全入口的原子性证明。
- **时态与分支证据**：现有 `src/native/history-authority.js`、`public/shared/native-chronicle-host.js` 含特定领域 game tick、事实/来源/历史查询；
- **W13 推荐尚未选定**：W13-B「Native Revision 一致性提交 + 双时间/分支受控投影」。正式 Subject admission/持续性世界效果/事件与参与者在可合法实现的现有 Native publication 边界达成一致；HCM/Context 可恢复派生而非新 World Truth；普通叙事细节不全量入事件表，真正 Retcon 需独立权限与依赖处置。W13-A Snapshot-first 松散摘要及 W13-C 平行 Event Store 为对照。
- **当时拟议的故障与权限行为**：同物品双卖的 CAS/前置条件、未知提交结果先查 receipt 后重试、叙事成功/世界事务拒绝时防错误发布、HCM 索引失败时可从原生已提交来源恢复、旧分支异步结果不得穿越、未公开身份与秘密在历史查询不能泄漏。
- 保持 Draft，不创建开发分支，除非用户另行明确批准整个企划。

## Stage 15 — W13-B 已确认与 W14 Effective World View / 知识创作讨论（2026-10-17）

- **用户已确认**：对上一轮唯一推荐的 **W13-B「Native Revision 一致性提交 + 双时间/分支受控投影」**回复「认同」。W1-B～W13-B 现为已确认的**总体架构路线**；用户没有因此认可 W14-B，尚未批准整个 Plan 定稿、精确 API、实现或 E0 完成声明。
- **资产边界**：继续 `ARCH-DWE-01` / 唯一 Plan Bundle `plans/architecture/world-evolution-consistency/` / 本唯一 Record。Primary Workspace 为 `docs`。无产品代码修改、无实现分支、无第二 Plan/Record/HANDOFF。
- **本轮 docs 提交**：
  - `4534497a66c4c0dcaca81bd160f49261df2cb2e1`：同一 Plan Bundle 创建 `effective-world-view.md` W14 草案：World Law/Initial/Current/Historical/Source Claim/Subjective Belief 分离、按 `Session/Branch/Revision/GameTick/Audience` 生成有效只读视图、Knowledge/Context 来源与时态适用性、Library/Studio/Play/Inspector 和 W14-A/B/C 对照。
  - `af3e55344202831fec4380e5a73eaefe5b02358a`：W13 原模块 `event-temporality-branch.md` §9 明确记录 W13-B 决策、事务及双时间方向；具体 API、通用查询、所有事务入口仍待 E0。
  - `f44563e3ffc12b10d12b469b48c4676da0e11f01`：同一 `design.md` §21 写入 W13-B 确认、W14 讨论路由。
  - `80afb354667d0f1689fbe6b224886bfa4517e516`：同一 `index.md` 调整当前阶段为 W14，W1–W13 方向已选；W14 推荐但未获批。
- **main 静态审查**：`public/scripts/native/knowledge-runtime.js` 有显式来源 authority ranks（`current_session_state` 800，高于 Package canonical 500）以及有条件 stateClaims、Knowledge `applicability.stateConditions`、`exclusiveGroup`、部分 Memory/State 冲突拒绝；**但自然语言原文在没有声明条件/显式冲突关系时，仍可能被 Keyword/Regex 选中，rank 高低不等于语义级当前事实失效。**
- **Context/作者 UI 静态审查**：`context-compiler.js` 已有 current state/event、Knowledge、Memory、Commitments 和 Token Budget lanes，`currentStateItems` 可按 Revision 纳入 `atri_world_state` 完整 JSON 与最近 World Events，Knowledge Entry 原始正文又可进入 Knowledge lane；`knowledge-selection.js` 基于关键词/Regex/关系激活、预算筛选，不能保证未标注自由文本自动与当前世界状态语义一致；`world-knowledge.js` 的 WorldRevision 主要是 Schema/Baseline/Binding/资产；`world-editor.js` / `studio-worlds-editor.js` / `studio-entrypoints-editor.js` 目前主要编辑这些固定资源与 EntryPoint 引用，尚非完整动态实体 Effective/History Inspector。
- **W14 研究推荐，尚未获批**：**W14-B「Effective World View First + Claim/Source-Aware Context」**。在原 Native Host 的只读投影里先确认合法 World Laws、当前/历史事实、有效期及主体权限，再按来源适用性为 Knowledge/HCM/Prompt/Studio/Play 提供不同视图；作者自由文本继续一等支持，重大可变事实须受控关联/失效。不可让低结构化传闻、旧初始状态或任何模糊静态陈述自动重夺当前事实权威，也不能仅用更高 Rank 静默解决真 Native Rule 冲突。W14-A 优先级驱动旧知识注入、W14-C 每轮 LLM 重写世界书仅作比较。
- W13-B 的选择**未证明**这些已经实现。
- 继续 Draft，不授权开发、不创建实现分支。

## Stage 16 — W14-B 确认与 W15 E0 证据收口审查（2026-10-17）

- **用户本轮决定**：对第十四轮唯一推荐的 **W14-B「Effective World View First + Claim/Source-Aware Context」**回复「认同」。**W15-B 目前只是下一轮研究推荐，不是用户已批准事项**。
- **资产和范围**：沿用唯一 `ARCH-DWE-01`、唯一 Plan Bundle `plans/architecture/world-evolution-consistency/` 和本 Record；
- **本轮 docs 提交顺序**：
  - `e88fb347fb23442343109c3635ac957b9dc7898c`：原 W14 `effective-world-view.md` §10 正式记录 W14-B 决议：世界 Hard Law/起点/当前/历史/Claim/Belief 各有来源和适用语境，Native Host-owned 只读 Effective View 先于检索/Token/Prompt，保留自由文本，不伪造全自动自然语言真值判断。
  - `cafa185ec0c48c17f2252de3379c809641e77a38`：同一 Plan Bundle 新增 W15 `e0-final-closure.md`，构建已观察 Production Authority/Consumer/Target/Deletion 部分矩阵、E0-01～09 明确阻塞、Gate 0～4 未来工作包，以及 W15-A/B/C 未批选项。该模块**不是新的平行 Plan 或已完成 E0 报告**。
  - `c8556493f8e10505391a55ac72e0ebd7f7cea443`：更新同一 `design.md` §22，记录 W14-B 已确认与 W15 审查方向，详细内容仍只在当前 W15 子模块维护。
  - `be1faab966b89de6b84d26b3e846d19c2363990a`：更新同一 `index.md` 路由 W15、W1～W14 已确认，Plan 保留 Draft，E0 显示 PARTIAL / BLOCKED。
- `knowledge-selection.js` 基于关键词/Regex/关系/Token 注入文本；`context-compiler.js` `currentStateItems` 含当前原生 World State JSON/近期事件，同时可将选中的 Knowledge 原文直接编入独立 lane。**Rank/条件不能自动证明所有未标注自由文本旧事实已失效**，因此 W14-B 仍有真正的 Source Claim/FactKey/Valid-time 接口缺口。
- **生产消费者搜索结果的严格边界**：`actorId` 横跨 `src/native/session-core.js` / `public/shared/native-information-contract.js` / `public/shared/native-frontend-host.js` / `public/scripts/native/play-product.js` / Speech/Visual/Cognition/Goal；HCM、Lifetime 使用本地证据与生命周期 ID。旧 ST `atri-world-info-selection.js`、`atri-world-info-prompt.js`、旧 Orchestrator `capsule-injection.js`、`legacy-runtime-adapter.js` 等源码仍存在；搜索看到 `runLegacySingleRequest` 在旧编排生产模块里有引用，同时某些 WI/prompt 辅助只在测试里出现。**未证明所有旧文件是活路径，不能直接批量删除或声称只剩 Native**；W15 要在固定 HEAD 的真实入口/调用图中分类 retain/replace/delete/investigate。
- **其它真实基础与未闭合部分**：`SessionRepo.commitSnapshot` 现有单事务/CAS/Receipt/Revision，`world/session.js` 有 World/Event state patch；`native-chronicle-host.js` 的世界界面还偏专用 Lifetime/History；`world-editor.js`、Studio World/EntryPoint 主要围绕 WorldRevision schema/baseline/JSON 和固定引用；Play 显示仍优先从 Manifest Actor 找人名。完整 Subject/Participant/Fact 有效时态、动态 Perspective、当前世界 Host 投影和前端新用法尚未通过 E0。
- **W15 当前推荐、尚未获用户批准**：**W15-B「证据门槛式 E0 收口 + 可执行交接清单」**。
- 没有运行 Node/单测/E2E/CI/前端/Windows/CachyOS/Termux。**E0 当前状态 PARTIAL / BLOCKED；任何已通过的结论都没有证据。**
- 全案是否最终定稿与是否创建实现分支由用户将来明确批准。

## Stage 17 — W15-B 确认与 W16 跨分支 E0 集成前审查（2026-10-17）

- **本轮作业方式**：继续同一 `ARCH-DWE-01` Plan Bundle、此唯一 Record 与 `docs` Primary Workspace；仅从 GitHub 读 main、未合并分支并在 docs 提交文档，没有修改 `main`、建立实现分支、改动 Package/Skills/Plugin/引用分支或交接单例。
- **已锁定的 GitHub SHA**：`main` `c57fada6edeea255b29d857ba2585c1dbc9c098b`；Orchestration V3 `refactor/atria-native-orchestration-v3` `a7cb649d0cd12cdaf7d7e91e96e654ba6261fea9`（ahead 97, behind 0, 比较返回 297 个变更文件）；Prompt Preset `refactor/atria-native-prompt-preset-deepening` `760327891149216dffdc1e3fa0c846496007a013`（ahead 1, behind 10，43 个变更文件）；Visual `feat/native-visual-generation-deepening` `ae587be0c64487ba922528bdd0146444bcf5e92e`（ahead 6, behind 48，Compare 返回 300 项，可能受限）；`feat/agent-intelligence-plan` `8fb5ad0e14be311558b6011e57b2634e3eed6f2f` 与 main 无共同祖先、不能正常差分。
- `effect-controller.js` 用 `prepare/ready/claim/observe` 及 confirmed/unknown/failed 等状态跟踪编排效果；`context-port.js` 持有 Source Binding/Audience/Grant 的 Host 授权和 `compileNativeContextPlan` / Information 接入；**编排 Effect Receipt ≠ 原 World Fact/Subject Domain Commit，也不意味着任意 World State/叙事在一个原子事务中已完成**。
- W14 Native EffectiveWorldView → Orchestration V3 ContextPort → Prompt Compiler/Provider Wire 的来源/权限链需据最终集成 SHA 定义，不能抢先为各方建立重复 authority。
- **Legacy E0 限制**：main 中 `atri-world-info-selection.js`、`atri-world-info-prompt.js`、旧 Orchestrator `legacy-runtime-adapter.js`、`capsule-injection.js` 仍存在；代码搜索表明 `runLegacySingleRequest` 在部分生产旧编排文件内被引用，而 `nativeKnowledgePromptChannels` 只检出声明/测试。GitHub 索引和静态引用不保证完整动态链；**本轮没有任何旧产品文件有充足依据可直接删除**，只能将旧消费者分类保留/替换/待查，正式 hard cutover 要保障原生插件/业务入口。
- **已收敛但未通过的 Source-of-Truth/Consumer Map**：SessionCore/Repo 与 World reducer 仍是目标 World 真相写入域；Orchestration 管 Plan/Run/Effect/Receipt 证据而非平行 World 真相；Information/HCM/Cognition 保持角色知识/来源权限；Knowledge Context 须处理 Source Claim/历史时态；Prompt 的 Effective/Wire 是消息编译层不是世界有效状态；Timeline/Play/Speech/Visual 等 `actorId` 消费者仍受静态 Package 角色边界；Studio/Library 需正式 Authored→Effective/Source Inspector。
- **本阶段 docs 提交**：
  - `59741295eae654054f5b5f667e66b71b18226eea` — 在 W15 `e0-final-closure.md` §8 记录 W15-B 已确认，明确 E0 部分审查与 W16 路由；
  - `54903d9d5a71a9528b24eb6e6cadeee85976e2d7` — 在同一 Plan Bundle 创建 W16 `e0-integration-readiness.md`，记录固定 SHA/分支对比、Domain Receipt↔Orchestration Result、ContextPort/Prompt 分层、实际 Source/Consumer/Deletion 表、W16-A/B/C 和 E0 阻塞；
  - `d4a4ec63cb18eeb0f5e35cf0db326ba605b70769` — 同一 `design.md` §23 记录 W15-B 决议与 W16 消费者/接口路线；
  - `adc51df4d56e188fac9a638bc56a7ddd2e0eaf17` — 更新同一 `index.md`：W1–W15 确认，W16 候选未批准，保持 Draft。
- **W16 当前推荐但未确认**：W16-B「跨分支锚定 E0，先确认 Native Domain/Context/Receipt 所有权，再冻结最小 Subject/Fact/Temporal/EffectiveView 接口」。与 W16-A 仅按旧 main 接口冻结、W16-C 构建旧新平行 Adapter 对比；避免无效双轨，同时不把所有无关分支完工当作前置条件。**本轮只形成推荐，不替用户批准 W16**。
- 全案继续 Draft；不直接创建实现分支或合并产品代码。

## Stage 18 — W16-B 确认与 W17 原生 Domain 接口/有效世界投影审查（2026-10-17）

- **本轮用户确定**：对上一轮明确推荐的 **W16-B「跨分支锚定 E0，先锁 Native Domain/Context/Receipt 所有权，再冻结最小世界接口」**答复「认同」。正式登记为 **W16-B 已确认方向**；已确认 W1-B～W16-B。
- **范围和工作空间**：继续唯一 `ARCH-DWE-01` Plan Bundle `plans/architecture/world-evolution-consistency/` 和本唯一 Record；只在 `docs` 分支修改 Markdown，静态读取 main/Orchestration/Prompt。未修改产品 `main`、未合并或更新其它分支、未创建实现分支/HANDOFF/另一份正式 Record。
  - `main=c57fada6edeea255b29d857ba2585c1dbc9c098b`；
  - `refactor/atria-native-orchestration-v3=a7cb649d0cd12cdaf7d7e91e96e654ba6261fea9`；
  - `refactor/atria-native-prompt-preset-deepening=760327891149216dffdc1e3fa0c846496007a013`；
  - `feat/native-visual-generation-deepening=ae587be0c64487ba922528bdd0146444bcf5e92e`。
  These are static review anchors only. Future execution must rebase audit on the actual integrated branch HEAD; code fetching is selective, not complete repository call graph.
- **本轮 W17 真实函数探针及设计意义**：
  - `_publishLocked` 组织 State、Timeline、Action/Task Receipts、Cognition/History、Revision，交给 `SessionRepo.commitSnapshot`。
  - `public/scripts/native/experience/world/session.js:commitEvents`（main）：World reducer + `atri_game_runtime` journal 在一次 `commitStatePatch(..., expectedRevisionId/actionRequest)` 内提交；**并未证明**它自动与另一个 Narrator Turn/Effect 共享一个原子 SessionRevision。跨入口的 Word Effect/叙事同步是未解决 E0-02。
  - `src/native/orchestration/native-turn-orchestration.js`（V3 branch）：`finalizeNarrator`/ `#commitSessionOutput` 使用原 `sessionCore.finalizeTurn`、`readSessionTurnOutput` 和 `storage_commit_unknown` 原 Domain Receipt 查证；`effect-controller.js` `prepare/ready/claim/observe` 的 Effect Receipt 是编排流程证据，不是另一个 World Truth。
  - 动态 Subject Perspective 仍需原 Native Host 的授权出口。
  - `src/native/model-prompt-runtime/prompt-compiler.js`（Prompt branch）：`worldUsePolicy`/ `memoryUsePolicy`/ `semanticBlocks`、Draft Preview/Authored-Effective-Wire 表达来源，但并不生成 World Fact/permission。不能把 Provider Wire 当世界真相。
- **W17 当前设计建议而非决议**：W17-B「Domain-first Commit + Revision-anchored Authorized Effective Projection」。唯一 Native Domain Session/Revision/Receipt 确立有持续后果的主体/事实/参与者，Orchestration 只提议执行/读取原领域凭据；Host 只读有效世界投影按 Branch/Revision/GameTick/合法 Audience 裁剪后进入 V3 ContextPort/Context Compiler/Prompt。W17-A 把 RunLedger 当 World Truth、W17-C 把 Prompt 文本升格成事实均与已选不变量冲突。**用户尚未确认 W17-B**。
- **本轮 docs 提交**：
  - `4ffe476f4b45a9f9672dd67d80db1db1638ef8b1`：W16 `e0-integration-readiness.md` §9 将 W16-B 记为已确认，并引用 W17。
  - `298010734a439a105fc8f5ee85c96ff50e368146`：在同一 Plan Bundle 新增 W17 `e0-domain-world-context-contract.md`，记录本轮代码证据、五类逻辑契约、World Effect Write Lane 与 Context Read Lane 事务/权限时序、E0-01/02/04/05/06 退出目标和 W17-A/B/C。
  - `4a07ead23a56ad436337c4accd2044570a6af4e0`：同一总设计 `design.md` §24 记录 W16-B 与 W17 路由。
  - `09994f6498fb3fd1fa15590a77282f00a1a51082`：同一入口 `index.md` 将 W1–W16 标记已确认、W17 仍为候选，并保持 Draft。
- **本轮 E0 状态**：`E0-01` WorldSubject/Fact/Participant 合法 Schema、`E0-02` Native 事务及跨入口叙事发表/未知回执恢复、`E0-03` 通用双时间/分支有效查询、`E0-04` 动态 Perspective 与私人 HCM/Context 安全、`E0-05` World Effective 与 Claim-aware Prompt 实际行为、`E0-06` 全生产 caller/旧代码删除、`E0-07` Library/Studio/Play、`E0-08` 长会话/DB/GC、`E0-09` 合并分支依赖，**仍未形成 PASS 证据**。W17 做到的是**具体接口及观察点更清楚**，尚未形成产品实现。

## Stage 19 — W17-B 确认与 W18 最小 ABI/真实消费者硬切讨论（2026-10-17）

- **本轮用户正式确认**：上轮明确推荐 **W17-B「Domain-first Commit + Revision-anchored Authorized Effective Projection」**获得「认同」。ARCH-DWE-01 **W1-B～W17-B 均是已确认顶层设计方向**。但 **W18-B 尚未获用户选择**，没有批准任何物理 ID/ABI/Schema、具体生产路径删除、完整企划 Final 或正式代码实施。
- **唯一工作区/资产**：继续使用 `docs` 上的同一 Plan Bundle `plans/architecture/world-evolution-consistency/` 与本唯一 Record；未修改 `main`、任何未合入开发分支、Package/Skills/Plugin；未新建实现分支/第二 Plan/HANDOFF。
- **本轮 docs 提交（按时间顺序）**：
  - `bb9ac4ce24b648e903c5927945f34c00bbfd3bec`：W17 `e0-domain-world-context-contract.md` §8 记录 W17-B 已确认，世界原 Native Domain 写权 / V3 Run 收据 / Source/Perspective/Prompt 只读分工及未定具体接口。
  - `4132cfb4e4b66679f7c406595298368736debcdc`：`design.md` §25 记录 W17-B 与 W18 新模块及 E0 保留缺口。
  - `1ff01f5c8ecf66e2aec3900e78ca1bb56fe445f8`：`index.md` 记为 W1–W17 已确认、W18 当前待选择、整体继续 Draft。
- main Git tree 在特定 SHA 下审查部分目录树：`src/native` 顶层 117 项、`public/scripts/native` 顶层 116 项、`tests/native` 顶层 260 项；这些仅是目录枚举，不等于逐文件调用图阅读或现役生产引用遍历。
  - `src/native/identity.js` 未列通用 `subject` ID family；动态 Participant/ActorTemplate 分离仍需实际 cutover。
  - `public/shared/native-information-contract.js` 的 `assertInformationClosure` 要求 Info Actor 包含于 Package Manifest，Actor View 要关联该声明，`native-information-runtime.js` 对缺失者报告 undeclared；动态 NPC 不能直接合法得到私人 Memory/Perspective。Cognition target 还有 Manifest 关联约束。
  - `src/native/world-knowledge.js` 的 WorldRevision 主要 `schema/baseline/knowledgeBindingIds`，KnowledgeEntry 主要 `content/discovery/applicability/lifecycle/relations/delivery`，未见通用 FactKey/valid interval。Context 的 rank/静态文本不保证语义有效。
  - `public/shared/native-chronicle-host.js` `WORLD_QUERY` 仅特定 people/identity/regions/... 类别，不能冒充通用 `asOfRevision/asOfTick/audience` 世界历史接口。`public/shared/native-frontend-host.js`、`public/scripts/native/play-product.js`、`src/native/speech-service.js` 和 `visual-continuity.js` 仍消耗 Actor ID 或 provisional identity。
  - Prompt 分支 `prompt-compiler.js` 的 worldUsePolicy/semanticBlocks 不签发世界真相。因此本轮推荐让 EffectiveWorldRead **在 Host 合法受众授权之后、检索/Token/Prompt 之前**形成。
  - `SessionCore.finalizeTurn` 特定 authority-first 路径能 State+Narrator 一起 `_publish`；World Game `commitEvents` 则通过 `commitStatePatch` 更新 World State + Journal；**没有证明这两条不同业务入口的所有场景都在一次事务里**，仍为 E0-02 的关键阻塞。
- 不建立万能 SubjectAdapter、平行 EventStore/TruthDB 或长期旧新双写。W18-A “直接冻结全套新 Schema”与 W18-C “万能适配器”仅作为对比。
- 尤其 E0-01 真正 Subject/Fact 物理合同、E0-02跨 World/Narrator 事件事务、E0-03通用双时间查询、E0-04动态 Perspective 许可、E0-05 Claim-aware Prompt、E0-06 真正完整生产 Consumer/Deletion Map、E0-07 Studio/Play/UI、E0-08 长会话持久化、E0-09 分支合入最终代码均无 PASS。

## Stage 20 — W18-B 确认与 W19 Gate 0 物理主体/事实/时态收口（2026-10-17）

- W1-B～W18-B 均已获用户的总体架构方向性确认。**W19-B 是当前研究推荐，用户尚未确认**；具体 ID/Schema/API、完整企划定稿、E0 PASS、产品分支创建或开发仍未获授权。
- **工作空间与操作范围**：沿用 `ARCH-DWE-01` 唯一 Plan Bundle `plans/architecture/world-evolution-consistency/` 和本唯一 Record，仅 `docs` 分支被写入。未修改 `main` 或任何 Orchestration/Prompt/Visual 进行中分支；未创建新的实现分支、独立 Plan/Record/HANDOFF。
- **本轮 docs 提交及内容**：
  - `fc162e52d3c6eb24f5fb56a000854b3be5902a87`：同一 Plan Bundle 新增 W19 `e0-gate0-physical-contracts.md`，具体记录现有 Native State/World Event/Receipt/History/Save/StateDelta 的物理事实、Session-owned Subject/Fact Transition 与 Revision/GameTick 两段授权历史查询候选、Gate 0 开发前审计与实施后 Gate 1～4 真实测试的边界、已定位生产链和 W19-A/B/C 候选。
  - `fc09c34ee4d6232fadc480f256ade9e75ffc7b03`：更新同一总设计 `design.md` §26，确认 W18-B 并路由 W19 原生数据/历史查询议题。
  - `7723a8e85da57edc1c9e0e4e66c57f12f33d18c6`：更新同一 `index.md`，将 W1～W18 标记为已确认 B，W19 当前待选，Plan 仍 Draft。
- **实际代码版本锚点**：此阶段通过 GitHub Branch GET 再确认 `main=c57fada6edeea255b29d857ba2585c1dbc9c098b`，V3 `a7cb649d0cd12cdaf7d7e91e96e654ba6261fea9`，Prompt `760327891149216dffdc1e3fa0c846496007a013`，Visual `ae587be0c64487ba922528bdd0146444bcf5e92e`。不是未来正式实施的最终 HEAD；仍需合流之后重新锁定。
- **本轮新的 Native 物理层静态证据**：
  - `SessionCore.initialWorldState` 将 WorldRevision baseline 放入 Session `atri_world_state.worlds[worldId].{worldRevisionId,state}`，Worldless 用 `initialState`；跨多个 World 的 Subject 身份不能简单等同某一固定 WorldId 或作者 ActorId。
  - `public/scripts/native/experience/world/session.js` 的 `atri_game_runtime.events` 有 `branchId/seq/type/payload/meta?`，World State 与 Journal 可随同一次 `commitStatePatch` 提交；`SessionCore._publishLocked` 的 Action Receipt 可以记录 `committedRevisionId/branchId/eventRefs`。但现存 Event 的字段并未构成通用有效时间/FactKey、完整来源和 recorded revision 的统一公共查询 API。
  - 未来不能为了动态世界绕过 Typed Native Authority，直接开放 generic StatePatch 写权。
  - `src/native/history-authority.js` 对已声明 History 的域有 `facts/heads`、`key/value/tick/eventId/previousId` 和 provenance；`public/shared/native-history-runtime.js.queryHistory` 只接受 `id/kind/facet/value/limit/cursor/memory` 且 cursor 绑定当前 Snapshot Revision，**不是**任意世界对象的 `asOfGameTick + asKnownRevision` 双时间查询。
  - 但旧修订的 GC/Pin、因果有效期与主体得知时间不可仅由 State Delta 自然推断。
  - GitHub 代码搜索找到 `src/endpoints/native-session.js → SessionCore.applyRuntimeCommit`、`experience/logic/runtime.js → world/session.commitEvents → session-runtime.commitStatePatch`、`authority-transaction.js → SessionCore Typed Authority Publication` 等**符号级候选链**；搜索未穷尽所有动态加载/第三方插件和活跃未合入分支调用，因此 **E0-06 仍为 PARTIAL/OPEN**。
- **W19 研究推荐，用户未选择**：**W19-B「Session 原生最小 Subject + 来源型 Fact Transition / Revision-Tick 双锚查询 + Gate 0 证据收口」**，以现有 Native Session State/Events/Receipts/History 为权威，必要时加最小物理 Subject/Fact Transition；不添加平行 EventStore，也不强制无 Game Clock 的 Worldless RP 伪造时间戳。W19-A 依 LLM 从 Snapshot 猜历史及 W19-C 新建独立双时间数据库仅供比较。
- 当时没有新增功能的产品运行结果。
- **E0 状态**：E0-01 Subject/Fact 物理合同、E0-02 Native Domain/跨入口事务、E0-03 通用历史有效期、E0-04 动态私人 Perspective、E0-05 Claim-aware Context、E0-06 全生产消费者和旧路径删除、E0-07 Library/Studio/Play、E0-08 长会话/持久化、E0-09 集成分支依赖，**全部仍有未关闭阻塞，整体 PARTIAL/BLOCKED**。本轮仅 GitHub 文件静态阅读、Tree/Code Search 和 docs 写入；没有 Node/CI/真 UI/三端实测。

## Stage 21 — W19-B 确认与 W20 受保护物理契约及 Gate 0 工作包（2026-10-17）

- **用户已选择的方向**：本轮「认同」明确对应上轮推荐的 **W19-B「Session 原生最小 Subject + 来源型 Fact Transition / Revision-Tick 双锚查询 + Gate 0 证据收口」**。W1-B 至 W19-B 属于已获认可的总体架构/收口路线；**W20-B 仅为本轮研究建议，尚未获得用户批准**。整份 ARCH-DWE-01 仍 Draft，不视为正式 Final、具体 Schema/ABI 已冻结或 E0 PASS。
- **工作域与文档纪律**：沿用 `docs` 这一个 Primary Workspace，同一 Plan Bundle `plans/architecture/world-evolution-consistency/` 与此唯一累计 Record。未创建第二企划/Record/HANDOFF、产品实现分支，不修改 `main`、参考、Orchestration/Prompt/Visual 分支或创作/用户数据。
- **本阶段代码版本锁定**：GitHub Branch API 当前仍返回 `main=c57fada6edeea255b29d857ba2585c1dbc9c098b`、`refactor/atria-native-orchestration-v3=a7cb649d0cd12cdaf7d7e91e96e654ba6261fea9`、`refactor/atria-native-prompt-preset-deepening=760327891149216dffdc1e3fa0c846496007a013`、`feat/native-visual-generation-deepening=ae587be0c64487ba922528bdd0146444bcf5e92e`。源审查仅涵盖锁定版本的定向 GitHub 代码/方法/目录，不是完整本地 checkout 和全调用图，正式集成后需新 HEAD 重审。
- **本阶段 docs 提交（按顺序）**：
  - `05e5cb8e8196ed0641b907425521e2391ae9a2fa`：同一 W19 `e0-gate0-physical-contracts.md` §7 确认 W19-B 方向（Session-owned identity、来源 Fact Transition、Revision/GameTick 两锚、开发前/后 Gate 分离）。
  - `d5467dfcee74b2f1e17d82c4df1afc9c02201b47`：同一 Plan Bundle 新增 W20 `e0-gate0-integration-workpackages.md`，详述受保护 Session 原生物理位置 P1/P2 候选、最小 Subject/Fact/ViewQuery 数据差异、Authority 保护、真实 WP-A～F 消费者、Gate 0 退出和 W20-A/B/C 候选。
  - `f40dea9557606916f02159f10d9b7d0d3ee26830`：同一 `design.md` §27 记录 W19-B 决议及 W20 候选接口/工程依赖。
  - `75d3bdec93b62ca95c9438b655bb58cbb543ffde`：同一 `index.md` 更新为 W1–W19 方向已确认、W20 讨论中、Draft/E0 PARTIAL。
- **其它 Native 静态证据**：`_publishLocked` 可以在同一 Revision 出版多个 states/receipts；`save-system.js` 枚举 `revision.stateHeads`、父修订/分支闭包，`state-delta.js` 对 `atri_world_state` 专用 snapshot/delta；`history-authority.js` 只对已声明 History/Lifecycle 的 Domain 保存 Fact key/previous/tick/provenance，通用 Worldless/多 World 不能随意复用成无来源可写 Ledger；`native-history-runtime.js` 没有通用 `asOfGameTick` 查询。仍必须在 exact Revision 下解释游戏时间、来源/纠错和 Audience。
- **GitHub 搜索定位的部分生产调用方**：`src/endpoints/native-session.js → SessionCore.applyRuntimeCommit`；`experience/logic/runtime.js → world/session.commitEvents → session-runtime.commitStatePatch`；`authority-transaction.js → SessionCore Native Publication`；`frontend/host-services.js → readWorldView/readChronicle`；`context-compiler.js → knowledge-runtime.js`；Play/Frontend/Speech/Visual 仍有 `actorId`。**这是函数名搜索/选择性源码阅读，未涵盖完整动态插件/所有 V3 调用，不能标为 E0-06 PASS 或直接删除具体 Legacy 文件**。
- **W20 推荐未批准**：**W20-B「受保护 Session-owned Identity + Domain-owned Fact transitions / Two-anchor Query + Consumer Work Packages」**。物理选择 P1（现有 `atri_world_state` 根受保护子树）或 P2（同 SessionRevision 下显式 Reserved Native state namespace）应按合法写者、存档/GC 与最小消费者改造成本决定，不能先建数据库再补安全。Domain Fact Owner 保持原合法业务单源，FactRef/转换只增加确有必要的来源和有效期，不为每句背景文本建 State。
- 现阶段只有文件/设计提案，**没有运行 Node/DB/CI/真实浏览器 UI/Windows/CachyOS/Android Termux**，E0-01～09 继续 PARTIAL / BLOCKED。
- 当时区分了设计材料与产品运行结果，尚未开展产品实施。

## Stage 22 — W20-B 确认与 W21 最终 Gate 0 交接前审查（2026-10-17）

- **用户明确批准的方向**：本轮“认同”对应上一轮唯一推荐 **W20-B「受保护 Session-owned Identity + Domain-owned Fact transitions / Two-anchor Query + Consumer Work Packages」**。至此 ARCH-DWE-01 **W1-B～W20-B 的总体架构/收口路线均已获认可**，但 **W21-B、P2 具体物理位置、SubjectID 前缀、Schema/ABI、E0 PASS、Final 和产品开发尚未获批准**。
- **资产纪律**：Primary Workspace `docs`；只继续原有 `plans/architecture/world-evolution-consistency/` Plan Bundle + 当前唯一累计 Record。没有改动产品 `main`、任何 Orchestration/Prompt/Visual 分支、Package/Plugin/Skills，也未创建实现分支、另一份 Plan/Record 或 HANDOFF。
- 这些只是观察版本，开发前仍须重新确认最新集成 HEAD。
- **本轮 docs 提交顺序**：
  - `a06ca67d60aa5908aef9d8490ad2cdd2cc509b36` — `e0-gate0-integration-workpackages.md` §8 正式记录 W20-B 已确认与未冻结 P1/P2、明确 Native protected writer/Domain Fact Owner/History/授权和 Gate 0。
  - `ddd40567e099c1939dab91bc12527b2c71cb6865` — 同一总设计 `design.md` §28 同步 W20-B 确认及 W21 条件性 P2 优选问题。
  - `265d318cf618594916c4672901e3b06cd6129683` — 同一 `index.md` 同步 W1–W20 已确认方向，路由 W21，继续保留 Draft 和 E0 PARTIAL/BLOCKED。
- **P1/P2 新的静态证据**：
  - `authority-first` 保护特定原生世界 Patch，但**不能推断 P1 新子树对所有合法 Game/Worldless 模式已全覆盖**。
  - `SessionRepo.commitSnapshot` 在一个原生 Native Session Revision 中提交多个命名空间；**P2 在同一 Revision 下是一个受保护状态，不是独立真相数据库**。
  - `save-system.js` `portableNamespace` 排除某些缓存 namespace 而收集正式状态；`SessionRepo.reachabilitySnapshot` 从所有保留 Revision 的 `stateHeads` 标记依赖，`session-maintenance.js` GC 以 `sessionState` 资源类型清理无效状态；
  - `state-delta.js` 目前仅对 `atri_world_state` 有专用 Delta/深度压缩，**P2 新 state 缺少同等优化，长会话性能/存储体积是明确代价**。P1 又有 `SessionCore.updateResources` 世界选择重建与普通 Game reducer 写入，Subject 身份被错误重置/覆盖的风险需要真实审查。
  - `src/native/history-authority.js` 的公开/私有 Domain History 受已声明 Source/Policy 管理，不是新的通用历史 TruthDB；`queryHistory` 无通用 as-of tick；`native-information-contract.js`/Timeline/Frontend/Play/Media Actor 引用仍需真实 Typed Consumer cutover。
- **本轮工程候选与建议，未获用户认可**：W21-B「**P2 作为首选**、显式 Reserved/Typed Session Subject 最小身份索引 + 各原 Domain 事实/时态 + 证据门槛式最终交接」。若 Gate 0 发现 P1 完整保护更简单，可以基于实际证据重新比较。W21-A 立即 P1 优先和 W21-C 全部物理位置延后均为对照。
- **WP-A～F 交接目标**：WP-A Native Domain typed submission + 原 Domain Receipt、WP-B Subject/History/Save/GC、WP-C Information/Cognition/HCM/ContextPort 动态 Perspective、WP-D EffectiveWorld/Knowledge/Prompt、WP-E Timeline/Media/Play/Frontend ABI、WP-F Library/Studio/Legacy 切换。
- 当时 E0 标记为 PARTIAL / BLOCKED，尚未开始产品实施。
- 没有本地完整 repository call graph，未运行 Node/CI/浏览器、UI 截图、长会话基准或三端客户端，也没有创建/修改产品代码文件。

## Stage 23 — W21-B 确认与 W22 Gate 0 最终交接 Preflight 审查（2026-10-17）

- **用户本轮明确选择**：对 W21 唯一推荐 **W21-B「P2 优先、Native Reserved/Typed Session Identity + Domain Fact Owner + 证据门槛式交接」**回复「认同」。W1-B～W21-B 由此成为已确认的总体设计方向，**仅 P2 优先/单 Native Revision 受保护身份 + 各原 Domain 真相和 Gate 0 证据收口方向**获认可。**未**确认 W22-B、具体 Namespace/Native ID/Schema、E0/CI/真实客户端 PASS、整份 Plan Final、创建实现分支或修改产品代码。
- **唯一文档纪律**：Primary Workspace 仍 `docs`，沿用同一 `plans/architecture/world-evolution-consistency/` Plan Bundle + 本唯一 Record。没有创建平行方案、第二 Record 或新的 HANDOFF；未修改 `main`、Orchestration/Prompt/Visual/其它长期或临时开发分支。
- 这是局部静态源码对照基线，不是全仓完整调用图，也不是未来合流后的最终实施 HEAD。
- **本轮 docs 提交顺序**：
  - `bea6e345bfe9b91bd6f4861a60d5b9f84e7c0c56`：原 W21 `e0-handoff-evidence-review.md` §8 确认 W21-B，限制 P2 优先、保留 P1 有证据回退、Typed Authority/Save/GC 与事实单权威边界。
  - `a2ba8249c78bd4b28f031390fbaa17e7104c768c`：`design.md` §29 写入 W21-B 确认和 W22 最终 Gate 0 交接前技术审查目标。
  - `5a0b7f9a79f04be28ad8a67b372d70d0dc20fd00`：`index.md` 记录 W1–W21 已确认，路由 W22，明确 Plan Draft 与 E0 PARTIAL/BLOCKED。
- **静态源码新发现与 P2 的关键优势/约束**：
  - `NativeSaveSystem` 对可移植 Namespace 的 Revision State Heads 构造依赖闭包；P2 是复用这些机制，不需要新数据库，但仍要确保新身份状态被合法初始化、导出/导入、恢复、转存和 GC，没有引入未标记的额外子资源。
  - `state-delta.js` 仅为 `atri_world_state` 做专用增量压缩；
  - `SessionCore.updateResources` 被 `ProductService.saveResourceSetup` 实际消费。它能切换 WorldSelection；需要为 P2 Subject/worldScope 解绑或变化定义合法行为，不得因更新 World Root 而丢失人物历史，也不得保留无权限/不存在的 World 引用。
  - `NativeSessionObservation.history` 从指定可达 Revision 读 `queryHistory`，为 `asKnownRevision` 提供部分基础；通用 `asOfGameTick` Fact/Source、动态 Perspective/私密 Inspector 仍没有完整 ABI。
  - `projectInformation` 在 Cognition/SharedAuthority/Expression/Visual/Task/Goal/Context 多个主线生产调用方中使用；`actorAvailability` 静态 Manifest 限制仍存在。
  - `worldInfoBefore` 等旧 WI 字段在一些真实生产源码中仍出现；**没有足够证据宣布全部 Legacy 模块都无现役消费者，也没有凭据列出任一明确可立刻删除的产品文件**。
- **W22 当前推荐尚未获用户确认**：**W22-B「具名阻塞 + 可执行 Preflight + 条件化开发交接」**。W22-A 未充分审查即 Final/开工、W22-C 继续无限新设计均不推荐。
- **E0 当前状态和现实限制**：`E0-01～09` 仍 PARTIAL / BLOCKED，Gate 0 **没有 PASS**。
- 当时 HEAD/调用链/关键权限材料尚不充分，方案维持 Draft，未创建开发分支。

## Stage 24 — W22-B 确认与有界 Gate 0 Preflight 执行清单（2026-10-17）

- **用户确认的唯一决策**：对上一轮明确推荐的 **W22-B「具名阻塞 + 可执行 Preflight + 条件化开发交接」**回复「认同」。W1-B～W22-B 均为已确认的**总体方案及收口方法**；用户没有因此批准全案 Final/Approved、E0-01～09 PASS、具体物理 ABI/Schema、创建实现分支或开始修改产品代码。
- **唯一资产纪律**：任务继续是 `ARCH-DWE-01`；Primary Workspace `docs`，继续同一 Plan Bundle `plans/architecture/world-evolution-consistency/` 和本唯一 Record。没有创建新顶层 Plan/新 Record/HANDOFF，未修改 `main`、V3/Prompt/Visual 分支或产品代码。
- **本阶段 GitHub 审计锚点**（Branch GET 重新核实，未变）：
  - `main=c57fada6edeea255b29d857ba2585c1dbc9c098b`;
  - `refactor/atria-native-orchestration-v3=a7cb649d0cd12cdaf7d7e91e96e654ba6261fea9`;
  - `refactor/atria-native-prompt-preset-deepening=760327891149216dffdc1e3fa0c846496007a013`;
  - `feat/native-visual-generation-deepening=ae587be0c64487ba922528bdd0146444bcf5e92e`。
  这些只代表本轮静态审查，**不是**最终合流实现 SHA，后续实际交接必须重新锁定。
- **本轮 docs 提交顺序**：
  - `fa977769385db1c65523db5e1e45aeddcb41956d`：原 W22 `e0-final-implementation-handoff.md` §8 记录用户确认 W22-B，强调“有界 Gate 0 / 条件化交接”与保持 Draft。
  - `51b0a87b8b25375fb87f8004cbd82324d7df689d`：同一 Plan Bundle 新增 `e0-preflight-execution.md`，将 P0–P7 具名 Preflight、源代码证据、E0 阻塞、Owner/消费者、真正退出材料、实施测试 Gate 与可复制的只读 Codex 审查指令收束为可执行清单，**不作为第二 Plan 或产品开发授权**。
  - `59d10351188b204ff69dde6eadb33d59ab58c27a`：同一 `design.md` §30 汇总 W22-B 用户确认、实际静态发现、Preflight 门槛及完整 Draft 状态。
  - `d44770de9f4e5cd57f89f37a331e39aeb3c61860`：更新同一 `index.md` 路由 Preflight，宣布 W1～W22 已确认、Gate 0 尚未完成、不再无限开新抽象架构轮次。
- **新静态审查事实**：
  - GitHub Compare 发现 **Orchestration V3 × Prompt Preset 共同修改 10 个生产文件**：`src/endpoints/native-generation.js`、`src/native/adapters/generation-host.js`、Agent Intelligence 的 worker/evaluation/evolution 四个文件、`src/native/model-prompt-runtime/{compiled-binding,contracts,execution-utils,prompt-candidates}.js`。共同修改**不等于十处实际 Git merge conflict**，但这些核心 API Owner 和合流顺序需实审；
  - `SessionCore._create/_publishLocked/applyRuntimeCommit/updateResources`、`session-snapshot.js` `RESERVED_SESSION_NAMESPACES/readSessionSnapshot`、`SessionRepo.commitSnapshot/loadSnapshot/reachabilitySnapshot`、`save-system.portableNamespace`、`session-maintenance` 和 `state-delta` 是 P2 的已核实**代码所有者/接口位置**。
  - 主线 GitHub 代码搜索 `projectInformation(` 命中 39 个文件，其中 17 个生产文件，包括 Cognition/Shared Authority/Expression/Visual/Task/Goal/Context 等；`actorAvailability(` 的生产依赖也存在。数字是**文件级搜索结果**，不是完整生产调用图的已完成项。
  - 旧 `worldInfoBefore` 符号有 13 个主线生产文件匹配，含 `st-context.js`、`PromptManager.js`、旧 Orchestrator/Capsule；`nativeKnowledgePromptChannels` 仅有定义/测试的静态匹配，仍不能证明插件/动态入口不用，**目前没有充分证据批准删除某个产品文件**。
  - `SessionRepo.loadSnapshot` / `NativeSessionObservation.history` 提供按已可达 exact Revision 读取既有 History 的入口，但 `native-history-runtime.queryHistory` 没有正式通用 Subject Fact 的 `asOfGameTick`。Game World reducer 和 Authority/Narrator 各自有正式提交入口，未证明在所有游戏模式下统一原子发布或一致叙事发表。
- **Gate 0 当前具名阻塞**：
  - P2/E0-02：原 Native Domain Effect/Receipt 对 Game Reducer、Authority Turn、Narrator 的实际事务/发表/失败恢复合同未闭合。
  - P3/E0-03：Revision+GameTick 两锚下的 Domain Fact 有效期/纠错/无 Clock/不可达历史的正式 API 未闭合。
  - P4/E0-04/05：动态 Perspective/Source Grants、V3 ContextPort/ContextCompiler/Prompt 的 Context 与秘密隔离消费者未闭合。
  - P5/E0-06/07：Host/Frontend/Play/Media/Studio/Legacy 插件实际 ABI 和 `retain/replace/delete/investigate` 的生产调用图未闭合。
- **可执行而未授权实施的 Preflight**：`e0-preflight-execution.md` 末附一个只读英文 Codex Preflight 指令，要求不建开发分支、不修改产品代码、只更新原 docs Plan 和唯一 Record；对每项 E0 输出固定 SHA、Owner、Caller、Target、Disposition、静态退出证据和 `OPEN/BRANCH_RECHECK/DESIGN_READY/IMPLEMENTATION_GATE` 状态。
- 当时尚未取得实施授权，未创建实现分支，也没有新增功能的运行结果。

## Stage 25 — 用户明确暂缓，等待编排/提示词/整体前端完成后由 Codex 接手（2026-10-17）

- **用户当前明确指令**：`ARCH-DWE-01` 暂时搁置。用户先完成**排队的 Native Orchestration 重构、Prompt Preset 重构与整体前端重构**；三者完成之后，由用户本人再让 **Codex** 正式介入。停止当前持续 Gate 0 Preflight 及新的世界架构讨论；**不是**批准全案 Final、授权产品实现或创建开发分支。
- **暂停后的唯一状态**：Plan **Draft / Paused**，W1-B～W22-B 的总体方向及收口原则保持已确认；E0-01～09、Gate 0 **PARTIAL / BLOCKED**，未解决的 P2 Typed Writer/Subject Schema、Domain Receipt/World+Narrator 写入、Fact as-of/历史纠错、动态 Perspective/Context/Prompt 和前端/Legacy 真实消费者完整审查均被保留，不能冒称通过。
- V3 `a7cb649d0cd12cdaf7d7e91e96e654ba6261fea9`；Prompt `760327891149216dffdc1e3fa0c846496007a013`；Visual `ae587be0c64487ba922528bdd0146444bcf5e92e`。整体前端的最终分支/HEAD 尚未确定。Codex 恢复时必须以新集成 HEAD 重新调查。
- **本次用户暂停的 docs 操作**（仅文件/方案，按顺序）：
  - `270df7399f70741fc65a13069b95cff6e3183c99`：更新同一累计 `design.md` §31，正式记录暂停、等待依赖及严格恢复/开发授权边界；
  - `606d313ddcc8aeae2cbfb5d6feec744fac71c4e3`：将同一 Plan 的 `e0-preflight-execution.md` 显式标记暂停执行，清单保留但不得自动运行；
  - `6756e4b308e23af05a6063e71ee8df3d817a2c89`：根据用户此次**明确中断**，在 `docs` 创建唯一任务恢复文件 `handoff/ARCH-DWE-01.md`，记录冻结 HEAD、已确认设计、全部 E0 阻塞、触发条件、Codex 只读 Preflight 和后续授权界限；它不是第二份 Plan/Record。
  - 此唯一 Record 随后增量记录 Stage 25，仍保留 `## Final state` 之下的 `Not yet applicable`。
- **完成与未完成**：W1–W22 总体方向已讨论完成，Gate 0 Preflight **仅有限静态代码审查完成**，并非完整调用图或设计退出；Node/CI/Play/Studio/长会话及 Windows/CachyOS/Termux 都没有执行。无产品代码修改，没有新建/合并任何实施分支，没有自动化提醒/后台巡检。
- **暂停事实**：用户要求等排队重构完成后，再主动指示 Codex 接手。当前恢复状态和功能分工见同一 Plan 入口及 `handoff/ARCH-DWE-01.md`。

## Stage 26 — 聚焦功能实现，整理两案衔接（2026-10-18，仅文档）

- 用户要求仔细检查两案并明确不要验证／测试主导企划。本轮只整理文档，世界任务仍为 **Draft / Paused**；未恢复产品开发，未将全案改为 Approved/Final。
- 入口与旧 E0/Preflight 路径改为功能职责：WP-A 主体／正式效果，WP-B 历史／Save/Branch，WP-C 动态 Perspective／NPC／记忆与行为，WP-D Effective World／Claim-aware Context，WP-E Timeline/Play/媒体，WP-F 世界创作／装配／预览与旧入口替换。具体字段与接线由相应原 owner 落实，不为普通工程选择重开多轮审查。
- 保留 W1-B～W22-B 的单 Native 权威、P2 优先最小身份、原领域事实、自由文本、按游戏事件／时间的有限自主性、合法个人认知及分支／历史设计。删除重复候选／下一轮要求，旧讨论留作背景；旧 Gate／完整调用图／取证／测试清单不再成为当前实施工作包。
- 明确提示词／统一前端先完成，不等待本暂停企划；世界恢复后复用原 Context/Information/Compiler 与同一前端组件。正式债务按领域持续，记忆遗忘／检索缺失不使其消失；无 Clock 不伪造 Tick，跨领域不暗定统一时钟。
- 这次仅整理文档，旧历史运行状态未被改写；恢复方式按当前功能入口与用户实际实施授权。

## Stage 27 — 清理重复关卡与阶段停顿指令（2026-10-19，仅文档）

- 用户要求仔细检查动态世界文档，去掉无意义的测试／验证要求和阶段停下汇报的内容。
- 逐篇整理同一 Plan Bundle：`design.md` 从累计讨论改为当前架构，保留已确认的世界／资料分工、自由创作、演化权限、身份与能力、P2 存储、正式效果、历史／分支、NPC／记忆及完整 UI 功能；旧选项与提交历史继续保存在本 Record。
- 删除设计正文与暂停交接中的 Gate／Preflight 工作队列、重复未测试声明、反复确认与旧只读审查提示词。Record 删除过期的下一轮 checkpoint 指令与重复未执行工具清单，保留各阶段的决策、提交、静态发现与当时状态。
- Plan 入口统一说明：WP-A～F 只表达功能依赖；恢复并授权实施后持续推进到整体完成，记录随实际工作更新，交付时集中说明结果。普通实现选择由执行者处理，必要自查限于实际改动与直接使用者。
- 本次修改仅限上述文档与本任务交接，产品实施仍为 **Draft / Paused**。

## Stage 38 — 产品实施启动（2026-10-19）

- 当前任务正式进入产品实施，使用独立语义分支 `feat/dynamic-world`，起点 `main@d6657d68b`；主线与其它活跃任务工作树保持。
- 正在落实 WP-A：在原 SessionState 接入受保护 Subject 身份、固定作者定义及 Authority Transaction 的运行时接纳，并由原 publication 填写提交来源。业务值仍由原领域持有，不新增 Store。
- 实现提交 `c4769459`（误删前本地提交为 `27838292b`，后按保留源码重建）：WorldRevision／EntryPoint 可声明主体；固定 Authority Transaction 可按原 localRef／显式 Subject 复用身份或随效果接纳。`subjects.<binding>` 仅作为私有事务上下文进入领域效果，不自动进入安全回执。声明有条件且无实际效果时拒绝接纳。Host 同次填入正式 admission Branch／Revision，Generic Patch／删除均禁止主体区域。
- 原修订 stateHeads 已自然纳入主体状态，真实 Turn 的主体／世界值／Receipt 原子提交、重复 finalize、回到接纳前 SavePoint、旧分支晚到结果拒绝、FS／SQLite 重载与完整 .atriasave 导出导入已验证。来源引用依原 Revision 图保留，无新增 Store／GC 服务。
- 资源更新保留同 World 已发生状态和 Worldless overlay，并以所选 schema 核对；暂不支持的 live World 删除明确拒绝，避免丢失世界状态，后续仍需原领域 scope 转换。
- 实际执行：7 项本地 Node 测试通过；9 个改动 JS 文件 ESLint、`git diff --check` 通过。测试与 fixture 仅在本地忽略目录，未提交。无真实模型／浏览器／设备证据。
- 后续继续 WP-B 的有权历史读取与 WP-C～F 接线；上述结果不代表纯文字动态提案、NPC 行动或整体功能已完成。

## Stage 39 — 事实时间读取与本地仓库恢复（2026-10-19）

- 源码提交 `58f9a850`：原 History 前值链在变值时关闭旧值有效区间；原 queryHistory／Frontend Host 可按领域键、Clock 与 Tick 读取固定修订中的值，每页最多跟随 128 条链。游标固定 Revision／key／Tick，私有当前来源不披露旧记录；无 Clock／未来 Tick／错 Clock 不伪造历史。没有增加 Fact Store 或重放机制。
- 历史本地验证 5 项通过，覆盖有效区间、固定修订、权限与游标、有界分页、原 Host 呈现及原 prepareHistory 不改旧快照。3 个改动 JS 的 ESLint 通过。WP-B 的纠错、其它领域时间／个人受众接线仍未整体完成。
- 主仓库被用户误删后，按用户授权重新拉取，恢复误删前全部 13 个既有工作树的原分支／HEAD 注册（连同本任务现为 14 个），不覆盖其文件；共享依赖及 SQLite 原生二进制已恢复。源码重建提交与历史提交已推送 `origin/feat/dynamic-world`。旧文档误带原有内容的提交已撤回，所有设计草稿仍保留为未提交内容。
- 重装依赖后动态世界 7 项与当时历史 4 项合跑通过；新增 Domain 历史验证后，历史 5 项通过。测试仅本地保留，不声称已完成真实模型／浏览器证据或 main 集成。

## Stage 40 — 动态视角、事件响应与个人获知（2026-10-19）

- `1f4f21a0`：固定 Information View 可声明 Subject 模板，由受保护主体接纳绑定为个人视角；普通主体存在、Actor 表达模板及 Perspective 授权分别处理。原 Information/Cognition/ToM 接受已登记的个人主体，原 Context 使用同一受众及可选表达素材；模板本身不可直接执行，也不自动进入前端全部视图。
- `89ed3a1f`：原 Simulation 支持同 Tick 的相关输入变化，保存入队身份及输入摘要，与事项完成分开。相同输入／已有 pending 不重复接纳；取消后的后来游戏时间可重新处理。Task 结果在原私有 publication 内完成自身队列项后，只允许唤醒其它相关 job，不立即重启自己的模型任务；规则结算和入队沿同一预算，未增加后台循环。
- `9aaf3ed1`：个人计划可用所属领域 Clock／Tick 表达 deadline，既有 expiresAt 仍按 publication logicalTime；两种过期不混用，不删除正式领域义务。
- `e2b4b387`：原 Memory schema 可持有 Host 接纳的 received 修订／Clock／Tick。获知仍在原 Memory 记录中，复用原正文、披露来源和字段版本，不复制完整事件、不新增 Store。首次接纳先核对真实受众证据；客户端不能伪造接收凭据、改写已获正文或删除凭据。原件变化或原场景关闭后，当前个人授权仍可回忆已获内容；分支继承保持原披露版本，角色可按原规则调整使用／清晰度。实际 Context 正文包含已获内容的用途说明，不能当作现任事实或新送达。
- 本地验证：动态世界 8 项（含真实 Turn、存档往返、FS／SQLite）、个人视角／Context／获知 8 项、Simulation 4 项各自通过；改动文件 ESLint、diff check 通过。此前历史 5 项保持原结果，未无故重跑。测试仍仅本地保存；未声称真实模型、手机或整条 NPC 行动链已完成。
- 保留另一个已获用户授权任务同步的启动修复 `d27f0a5e`／`5fca2e3d` 与模型列表修复 `e18649ba`，未覆盖其改动。后续继续作者资源闭包、有效 World／Knowledge、参与者及完整用户界面。

## Stage 41 — 固定作者依赖闭包（2026-10-19）

- 源码 `6c04ad05`：原 WorldRevision 捕获完整 Binding 配置及精确 KnowledgeRevision；普通正文编辑沿用父修订固定配置，显式选择新快照才更新。标题固定于作者修订，Library 当前改名不改变旧来源内容。新增 World 自有正文存储，不另建文档服务。
- 原 Project 装配、ResourceGraph、Package 合同及 Resource Bundle 导出／导入改读固定闭包。相同 Binding ID 的不同配置、同一资料的不同修订明确报冲突；Package 不可用相同 ID 遮蔽 World 固定配置。可编辑 Binding 删除后仍可导出和重装配旧世界；原 Knowledge 删除／GC 纳入固定 World 引用。
- 本地作者闭包 6 项通过，覆盖 FS／SQLite、改名／改指／删除、GC、显式更新、版本冲突、原 Bundle 映射往返及 Package 遮蔽拒绝。11 个改动 JS 的 ESLint、diff check 通过。随后补齐 Project 自有固定来源不读 Library 的消费路径，共 7 项通过。

## Stage 42 — 实际模型正文中的来源用途与受众（2026-10-19）

- `38e25c05`：World 正文、KnowledgeEntry 来源语境及可选局部标注保存在原不可变修订；标注含精确位置／引文，作者改字后不猜测旧位置。原 Context／Knowledge 选择把作者背景、当前说法、历史记载、来源说法、个人信念和文字法则的用途写入实际入选正文，连同来源／时间说明计入原预算。
- 局部当前声明按原 stateConditions 的可读字段处理：已失效用途降为历史，证据不可读时只作为未确立的来源说法；不披露 Host 私有替代值，也不剪除原文字造成新断言。未绑定文字继续作为作者背景，不声称已自动识别全部过期句子。历史／Belief 记忆不再因全知现值不同而直接删除；显式 current 用途仍按原比较处理。
- Information View 可显式授权 World 正文，正文自身沿原 delivery 受众条件处理。角色无个人视角授权时不能回退至原始 World。知识适用条件只读本次 Information 的公开字段，不以私有世界状态决定角色候选。无新增事实库、模型裁判或后台扫描。
- 实际 Context 本地验证 4 项通过；与已有个人视角／获知验证合跑 12 项通过，包含权限、秘密不泄露、原文与归属保留及真实预算。新字段集成后主体与作者闭包 14 项通过；改动 JS ESLint、diff check 通过。

## Stage 43 — 正文编辑、选段标注与真实保存（2026-10-19）

- `643d2181`：Library／Studio World 编辑以自有正文为入口，Knowledge 共用可选选段标注控件；可设置用途、归属与时间，不要求手工身份或空 Binding。改字只解除当前草稿中不再精确匹配的标注，保留旧修订内容并就地提示。固定 Binding 可继续编辑正文，明确选择后才采用 Library 新配置。
- Library／Studio 的保存与比较保留正文、主体和完整依赖；详情页展示作者正文。修复真实浏览器发现的保存后临时容器闭包失效、资源通知残留及 compact 编辑器误被隐藏，旧修订仍独立保留。保留其它授权任务同步的 Credential 目的地独立授权移除提交 `e556c830`。
- 在本任务源码启动隔离 `127.0.0.1:8017` 服务及独立本地测试数据，前端 webpack 成功；真实浏览器完成 World 创建、选段／归属／时间、保存、重开、修改后解除旧标注与第二次保存。API 回读确认旧修订原标注保留、新修订未错绑。
- 1440px 与模拟 390px 页面无横向溢出；模拟窄屏正文可见、键盘 focus-visible 有焦点环，reduced-motion 下沿原组件。浏览器合成 composition／Enter 事件确认不重挂输入框、不丢焦点或误提交；不当作真实手机／输入法证据。执行文件 ESLint、diff check 通过。此处未运行真实模型生成，完整 NPC 行动、参与者／媒体、资源更新与历史纠错仍需继续接线。

## Stage 44 — 显式资源采用与固定依赖的 Session 接线（2026-10-19）

- `b6945b18`：移除普通 Session load 自动采纳 Package Knowledge 编辑并发布新修订的路径。原资源选择页面按需展示编辑后的精确资料及受影响 World，勾选后才经原 updateResources 创建 SessionRevision；来源已再更新时，旧选择明确拒绝并保留当前故事。
- 已安装作品的明确资料编辑生成新的 PackageVersion 及相关 WorldRevision，保存固定 Binding 新配置与 World 来源祖先；旧作品修订和 Session 不变。原新游戏默认选择随该作者操作捕获同一组派生修订，World 参数仍原样保留。连续多次编辑保留世界来源链，不能借同一 ID 覆盖旧闭包。
- 新选入 Library World 的固定资料沿原 Session Knowledge 快照自动接入，不再要求作者另建空绑定；可编辑 Binding 已删除仍读取精确资料。原 publication 在发布前核对 selected World 的固定配置，拒绝同 ID 隐藏覆写。同 World 升级保留业务状态，新增 World 才实例化其作者主体，Worldless 原状态保留；尚无领域 scope 转换时仍拒绝移除 live World。
- 原 Context 改读 Session 实际所选 World 正文，避免继续使用初始 Package 正文。publication 返回的 Manifest 同步表达此次已捕获 Knowledge，普通重载、指定旧修订与存档往返保持各自原来源。未新增 Store、迁移引擎或后台模型。
- 本地资源更新验证 5 项通过：FS／SQLite、普通读取无新增修订、显式采用、原状态／身份保留、旧修订与 SavePoint、携带新版资料的 .atriasave 往返、删除可编辑 Binding 后的 Library World、新 World 主体只实例化一次、连续两次编辑与旧选择拒绝。受影响的主体／个人获知／Simulation 合跑 20 项通过；相关 JS ESLint、diff check 通过。
- 隔离真实服务／浏览器完成测试作品安装与开局、作者资料编辑、My stories→Manage→Worlds & Knowledge 展示受影响对象、勾选采用并保存；API 回读确认勾选前修订不变，保存后世界／资料同时切换且可用更新消失。未触发真实模型请求。正文控件首次成功标注后收起重复新手说明；microinteractions 的 8 项诊断自检为 10/10，无新增动效。
- 保留用户授权的并行模型参数改动 `31f706cf`、`80618f17`、`b4c27af6`、`70e0993b`、`312a6e14`：不恢复 minimumOutputTokens 或重复的生成参数权威。后续继续参与者／表达模板、NPC 行动及完整 Play 读取；整体尚未合入 main。

## Stage 45 — 正式发言参与者、语音来源与固定 Host 合同（2026-10-19）

- `1b407699`：原 Authority transaction 增加有界 `timeline.speech` 效果，Subject 接纳、业务效果、公开通信回执及发言在同一次 publication 提交；失败、过期或重复 finalize 不留下额外发言。私有读取不能直接成为公开发言，Simulation 不借此冒充现场通信。
- Timeline 保留实际 Subject 与当时可选表达模板，公共投影只输出当次公开别名和逐消息不透明 handle；不暴露真身、别名等价映射或强制角色卡。Play 明确区分发言者与叙事者，原 Speech 管线可按已提交文字播放动态人物发言，并保留版本及分支新鲜度检查。
- 固定 Package Bridge 对 schema 做精确匹配；保留原 conversation messages、presentation 与 history.query 合同，分别添加只读 conversation.participants 与 history.at 能力，均读取原 Timeline／Chronicle。内置雾灯旅舍 preflight 及隔离真实服务作品列表恢复 ready，generation/resources 返回 200。
- 修复 Native Session 活跃或旧角色卡请求尚未返回时，getCharacters 用角色卡列表覆盖 Native 临时投影而反复弹出“活动角色不可用”的问题。浏览器显式调用后 Session／Revision 与投影保持不变。
- 本地历史 5 项、正式发言 2 项验证通过，包含伪造 Draft 拒绝、原领域原子提交、重复 finalize、公共投影与别名篡改、Speech capture、存档往返与恢复前状态。相关 JS ESLint 与 diff check 通过。真实 Play 已确认独立 Speaker／公开别名与原叙事消息；模拟 390px 触摸／reduced-motion 无横向溢出。未生成真实音频、调用真实模型或验证物理设备。
- 下一步继续原 Visual 的合法参与者接入及动态 NPC 行动；整体仍在实施，尚未合入 main。

## Stage 46 — 有来源的媒体参与者与分支读取（2026-10-20）

- `f6c26d0b`：原插图标注卡可明确添加选中文字所属的正式发言者，不要求 ActorProfile；公开别名和逐消息 Participant handle 随原 draft／Visual IR／Gallery 保存，外观初始空白，可在本标注中填写。Visual 与 Prompt preparation 核对精确消息、别名及 handle，不从后台 Subject／表达模板复制外观或建立秘密别名等价关系。
- 原插图 Context 保留实际公开发言者及合法历史，进入原 Prompt 预算；独立图片提供方仍消费原结构化协议。原 Visual state change／媒体引用沿 Participant handle 处理，仍不写 World。
- 回归发现原提交顺序 parentRevisionId 不等于分支叙事祖先：SavePoint restore／branch switch 可使媒体读取误入另一条线。保持原 CAS／提交链合同，由原 SessionRepo 的既有 BranchGraph prior HEAD／forkRevisionId 读取正确上一故事修订；Visual source、原插图 ancestry 与 earliest context 共用该读取。
- 本地相关合跑 23 项通过；扩展后的正式发言测试再次通过，验证媒体 IR 无 Subject 泄漏、错误别名／错误消息拒绝、保存恢复、旧线仍可读、新线不能引用撤销发言、切回旧线正确承接其 HEAD。相关 ESLint、diff check 通过。全量本地化检查报告原有其它页面 18 条缺译，新增按钮已补中文。
- 隔离真实服务／浏览器完成选文→标注→添加发言者→填写外观→保存，模拟手机重开后数据持久、卡宽 356px／页面宽 390px 无横向溢出，annotation 中无 canonical Subject。未执行付费图片生成、模型请求或真实设备测试。后续继续动态 NPC 与世界读取；整体尚未合入 main。

## Stage 47 — 单人可用性与动态事项目标（2026-10-20）

- `0d6ec2d2`：Subject Perspective 模板可声明原 Domain 的必填 boolean 作为单个主体的可用性；本人的 localRef 必须属于该 Domain。停用／终止本人记录会关闭此人的个人 Context 与正式发言，不影响同模板其他主体，也不删除身份、原业务记录或历史。
- `167ea491`：原 Simulation job 可从固定事项读取已登记 Subject，Host 解析其既有个人 Perspective 与原 Domain recordId；确定性 Transaction 的动态 read/write 只能直接转发该绑定，不接受任意路径或模型选择目标。执行阶段再次验证身份、原域、视角、作用域与个人可用性，仍沿原 Authority／CAS 提交，无额外 Store、常驻 NPC 或人口行为扫描。
- 身份／记录查找计入原 Authority 工作上限。未知／不可用主体不消费原事项；同一规则可依事项处理不同动态 NPC。原进度上限拒绝未推进事项的重复执行，全部候选效果撤回。Subject 模型 Task 绑定尚未接入，不能把此步骤当完整自主行为。
- 本地 18 项相关测试通过（个人视角／获知 9、动态事项 5、事件反应 4），覆盖两人共用规则、恢复可用性、未知／终止／停域目标、错误 Domain／非直接转发拒绝、执行重验、整体回滚与工作上限。相关 ESLint、diff check 通过。整体继续实施，尚未合入 main。

## Stage 48 — 动态个人 Task 提案与原命令接纳（2026-10-20）

- `ab3dda9f`：原 Simulation 的 Subject 绑定可选择有预算的 FIFO background Task。原 outbox 固定本次 Subject／本人 recordId／实际 Perspective／个人投影摘要；Task 结果绑定只能指向同一 Subject 原 Domain 的既定 Command，模型不能在结果中选择目标。固定事项的 Host 私有读取只用于选择／判断事项，不能直接模板展开进模型 input。
- 原 ContextPort 从真实 Task capture 取得个人受众，原 Compiler／Memory 沿本人 Perspective 读取，并在发送／消费和 Memory proof 中保持同一身份。Task request 仍用原 Task grant；模型实际 Context 选择保留本人身份和原 cognition/disclosure policy，不回落到 Narrator、raw World 或他人视角。原命令回执与 V3 Task delivery 核对捕获的本人 recordId。
- 个人投影变化与目标变化使旧提案失效；同 Tick 新个人证据或另一相关人可重新接纳，纯他人信息变化不唤醒。规则按需读取本人原记录的声明字段，且同 Tick 可在原步数上限内处理多个不同目标。模型返回意图与实际执行分开：原 Command 先保存选择，再由原确定性事务执行效果；暂缓／取消不把事项当已完成。
- 原 Cognition publication 增加实际 Task invocation 锚点：个人认知更新只认原 pending outbox 绑定的个人视角，不能凭 Task ID 借用他人视角；原获取、来源、时间、状态与因果检查继续执行。未扩展动态 appraisal 模型或新增常驻 NPC Agent。
- 本地个人视角／获取／Task 认知 10 项通过，动态事项／模型输入和命令接纳 13 项通过；与原主体、正式发言／媒体、事件反应相关合跑 27 项通过。相关 ESLint、diff check 通过。Context 测试执行原 Compiler、RequestContext provider 与 Task selection；采用测试提案数据，未请求真实模型，完整真实 Provider／Orchestration 端到端尚无该阶段证据。继续历史纠错及 Play／作者读取，整体尚未合入 main。

## Stage 49 — 原领域的有效时间与局部历史更正（2026-10-20）

- `20397dd0`：原 History fact source 可选声明同一 Domain 记录的有效起止 Tick、被更正 fact ID 与说明字段。值、时间与更正引用均来自原领域实际提交，不接受独立历史 Patch，不另建 correction Store；既有 `tick` 仍是本次接受记录的时刻，旧 Revision 继续保存原记载。
- 原 fact previous 链同时保留有效区间：晚录入的后续变化可从实际起点生效；局部更正必须引用同 key 的既有事实并落在其有效区间，不能越过后续替代、借旧目标覆盖新事实。冲突的回填要求明确更正引用，未知／跨来源／超范围／未来时刻拒绝。纯说明或日期更正即使值相同也保留新记录。原 Domain 负责该动作的权限、依据和业务因果，History 不裁判自然语言、不重跑既有行动或删除旧经历。
- `history.at` 仍按选定 Revision、Clock 与 half-open 区间分页，返回接受 Tick、有效期与局部更正引用；原 Chronicle 行 schema 不改，来源详情展示两种时间和更正说明。Host 对 temporal continuation 绑定 owner／Session／Branch／Revision／query，防止伪造游标跳过较新的更正；进程重启后旧分页重新读取，未新增持久密钥或世界状态。
- 同 key 读取／较早区间修复最多沿 128 个相关链接，常规当前变化在命中其前值后结束，180 次连续变化测试保持可执行；所有处理仍受原 source／durable／byte 预算。大行的普通分页明确拒绝，避免返回原游标造成无限翻页。
- 历史新增 7 项、原历史 5 项与原主体／正式发言回归合跑 22 项通过；相关 ESLint、diff check 通过。测试确认旧修订、区间外状态、已完成领域记录与 Timeline 不变，错误引用／私有来源／分页篡改拒绝。未宣称通用双时间数据库或自动因果重算；继续 Play 读取与作者交互，整体尚未合入 main。

## Stage 50 — Play 世界档案与按时历史查询（2026-10-20）

- `7c7bbe8b`：沿原 Play More／Session inspector 增加“世界档案”，按需展开公开发言者、玩家已知世界与历史。仅投影 `audience: player` 的明确 display grant，拒绝 Actor／Narrator／Inspector 视角；复用原 Information／Chronicle／Participant 读取，无新状态库或后台刷新。
- 发言者保留每条正式发言的公开称呼与 per-message handle，同名或换名不合并真身映射。12 条逐页展开，长发言指回原时间线。已知状态保留作者选定字段、事实／信念等语义及来源详情；多视图分别按需打开，单次 DOM 展示有界。
- 历史沿原公开 fact source／Game clock 查询指定 Tick，保留原有效区间、局部更正、来源与分页；没有时钟或信息声明的纯文字作品不捏造档案或时间。选定 Revision 变化即停用旧查询并提示刷新，刷新后焦点返回首个可展开项，历史修订只读。
- 新增 4 项权限／别名／原历史分页／纯文字测试，与历史更正、个人视角、正式发言合跑 23 项通过；后续惰性读取调整重跑相关 4 项通过。3 个业务 JS ESLint 通过；修改的 localization.js 与 HEAD 比较均为 215 项既有诊断，新增 0 项。全局本地化脚本仍报告原 18 项其他页面缺失，新文案已补中文，diff check 通过。
- 浏览器实测原会话 More→世界档案→正式公开发言；同一真实浏览器中使用合成档案夹具验证授权字段、Tick 查询、140 链的继续分页、Enter 提交、过期／历史修订刷新及焦点。1440×1000 桌面和 390×844 touch／reduced-motion 模拟视口无横向溢出；修正窄屏底部导航遮挡来源末项。未测试物理移动设备或真实模型服务。按 Web Interface Guidelines 自检并修正标签／name、焦点恢复、末尾可达性；microinteractions 8 项诊断通过（10/10），无失败项；未新增动画。
- Play 基础读取已接线；完整作者执行关联／起点预览、真实 Task／Orchestration 端到端与最终 main 集成仍待实施，整体任务继续。

## Stage 51 — 正文片段的原状态条件表单与 baseline 预览（2026-10-20）

- `603dd204`：World／Knowledge 正文的当前说法可在片段中展开状态绑定，复用原 applicability 的 provider、精确 path、类型化值、比较与 all／any，不再要求普通绑定只能编辑 Source。Knowledge Entry 与片段共用同一个条件表单，未新增判定器或规则存储；打开空表单不创建默认绑定。
- World 表单按实际 World identity 枚举本草稿 baseline 的至多 128 个标量字段，作者可选择字段建立 exact state condition。Library 传入资源 identity，Studio 使用其现有 World snapshot identity；不靠显示名绑定。精确 provider／path 在来源详情中展开，未知字段可沿原手动条件编辑；新条件仍在 Review 时经过原共享 contract 校验。
- 按需 baseline 预览复用原 `evaluateStateConditions` 与正文用途判定：当前匹配、历史用途、不可确认的来源说法明确区分。它只查看此 World baseline，不宣称已经计算 EntryPoint overlay、完整玩法或真实受众；修改输入立即清除旧预览。条件不执行动作、不修改起始值，法则文本没有因此自动获得可执行性。
- 相关 6 个 JS ESLint、diff check 通过；原有效 Context 与作者资源闭包 11 项测试通过。localization.js 对 HEAD 的 215 项既有诊断新增 0 项，新增文案已补中文；全局本地化仍有既有其他页面缺失。
- 真实浏览器中，合成编辑夹具验证匹配／不匹配预览、旧预览清除、正文 textarea identity／焦点与合成 IME 连续、条件进入 Review；实际隔离服务 Library 流程完成新 World→新修订→选择 baseline 字段→预览→Review→保存→重载重开，读回原修订精确绑定且 body／baseline 未被条件编辑改变。390×844 touch／reduced-motion 模拟视口无横向溢出，保存重开后技术引用默认折叠，布尔类型编辑可用。未宣称物理设备或完整游戏起点／受众预览；后者及执行关联、Task/V3 端到端继续实施。

## Current state

产品实施进行中，主体／时间读取、动态个人视角与获知、作者固定依赖、正文编辑、有效 Context 及显式资源采用已有接线；完整 NPC 行动、参与者／媒体与 Play 功能继续实施。当前功能设计、代码差距与待决问题见 [Plan 入口](../../plans/architecture/world-evolution-consistency/index.md)。
