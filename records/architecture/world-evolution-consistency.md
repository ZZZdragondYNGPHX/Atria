# ARCH-DWE-01 — Dynamic World Evolution & Consistency Record

- Task ID: ARCH-DWE-01
- Primary Workspace: docs
- Status: Active · Research/Discussion (not implementation)
- Plan: [plans/architecture/world-evolution-consistency/index.md](../../plans/architecture/world-evolution-consistency/index.md)
- Initiated: 2026-10-17

## Stage 1 — 建立方案与首轮广泛调研（2026-10-17）

- Start HEAD: 未在操作前捕获 docs 原 HEAD；不据此推断其他分支进度。
- Document change commits:
  - bca017a98185ec7ae2371ba9b8b07c75cf9c9b60 — 创建 index.md 初始方案。
  - 40468c295ca0b9909ccce7b5f363c33a7c85de0a — 添加 research.md 外部调研和 main 相关接口核对。
  - f916aefe4c21503b35f19f41e0293a702a04fbcc — 添加 design.md 方案对照、冲突案例、问题轴与风险。
- Status: 当前讨论稿与调研材料已写入；尚未确认最终架构和实施计划。

### Completed

- 阅读 docs:README.md Governance v1.7，确认 docs 独立工作空间、Plan Bundle / Record 职责。
- 初步核对 main 的 World Session/Definition、State Delta、Knowledge Runtime/Selection、Session Knowledge、Context Compiler、Authority/Task/Simulation/History/Hypothetical、Orchestrator Bridge、SavePoint 等相关源文件。
- 外部广泛研究：SillyTavern Lorebook、Azure Event Sourcing/CQRS、XTDB 双时间、Wikidata 时态修饰、Doyle TMS、PDDL、inkle ink、Versu、Comme il Faut、Generative Agents、Concordia、IJCAI Temporal KG、Unreal GAS。
- 记录候选 A（Prompt Overlay）、B（Native Fact Binding + Effective View）、C（Full Temporal World Graph）；B 是研究建议，**不是用户决策**。
- 指出可能存在的关键断点：自由文本知识的过期事实未与当前原生状态精确绑定；模型叙述与世界状态提交的一致性仍需真实端到端审计。

### Verification and evidence

- GitHub connector 已返回上述三次 docs 分支文档提交 SHA，并额外确认 Plan 状态更新及双导航索引提交：abfb8c044c934cecdb09d2b0113c0ae28c303da1、6b7580c5aab60a3b0de5c36dd74ff2417d89da80、b90c5b3fcec20d58373e80fa51f0057252150de6。
- 2026-10-17 再次通过 GitHub fetch_file(ref=docs) 分别验证 index.md、research.md、design.md、唯一 Record、plans/architecture/README.md、records/README.md **6 个文件均存在且可读**。
- 仅静态代码核对 + 外部官方文档/论文阅读；未运行项目、Node 测试、CI、客户端、浏览器或真机。
- 未更改 main/product、未创建开发分支、未合并长期分支。
- Round 1 Plan 入口已标记“外部调研与初步静态核对完成 / 待讨论”。最近一次核验时的 docs 文档 HEAD 为 b90c5b3fcec20d58373e80fa51f0057252150de6（其后本 Record 更新会产生新提交）。

### Known limitations / unresolved

- 相关文件存在不等于运行时消费者已接线，尤其动态事实声明与 freeform KnowledgeEntry 的失效行为需要后续 E0 审计。
- 理论上的“事实锚点、事件语义、有效视图、角色认知”不能未经接口核对就新增第二持久化权威。
- 没有证据证明全量文本矛盾自动识别可以稳定无误；保留此方案的误判/成本风险。
- Round 1 尚未收到用户对 A/B/C/D 关联模式的选择；无已冻结的设计决定。

### Next checkpoint

- 先核对当前 Plan 和同一 Record 的远端版本。
- Round 1 深入讨论「静态设定中哪些是初始事实、哪些是世界法则；如何把自由文本中的可变事实与 Native State 绑定，而不破坏创作自由」。
- 用户做出选择后，于 **下一轮讨论前** 更新同一 Plan/Record，再继续下一议题。
- 全部核心决策获用户明确批准后才定稿；实施由后续独立授权启动。


## Stage 2 — S2 世界 / 知识原生重构扩域研究与候选方案（2026-10-17）

- Trigger: 用户明确提出「现有 World / Knowledge 仍受 SillyTavern 时代世界书影响，希望趁机进一步重构」。
- Primary Workspace: docs，沿用 ARCH-DWE-01 唯一 Plan/Record，不创建重复企划书。
- Status: **Draft / Discussion**；没有用户批准的最终架构，也未开始产品实现。
- docs document commit sequence:
  - 4552d64bbee8a2fe18e8cbe66e4bdc86236eea28 — design.md 新增 §8 S2 扩域设计、ST 概念去留、World Model / Source Library / Effective View 与轮次选择。
  - 6a669c4a8a8953f22bf85e7af48cd1ca9fb4ecb3 — research.md 新增 §F ST/W3C SHACL/PROV-O/RDF/XTDB/Concordia/inkle/Generative Agents 对照及 Atria main 语义证据。
  - 09876a77b6c5278a4d45653b3cc8e7aa323b92c3 — index.md 调整统一 Plan 的目标、讨论入口和当前状态。

### Evidence and completed work

- GitHub connector 静态核对 main 的 src/native/world-knowledge.js、public/scripts/native/knowledge-contracts.js、knowledge-runtime.js、knowledge-selection.js、public/scripts/native/experience/world/session.js、docs/features/native-knowledge.md，以及 Native SessionCore/Simulation/Context 相关实际路径。
- 区分“已有原生重构成果”与“仍继承旧条目/触发器心智模型”：前者有原生版本、binding、state/events、权限和上下文；后者仍以 discovery/lifecycle/delivery 字段为重要语义。未断言所有 ST 残留仍是活跃消费者。
- 补充外部原始资料对照；建立 Candidate A（Semantic Lorebook）、B（World Model + Source Library，研究推荐）、C（Universal World Knowledge Graph）的利弊及 E0 前置验证问题。
- 用户此前未就 R1 事实锚点与四层解释模型正式批准任何路线，保持未决。
- 未修改 main、未创建产品分支、未运行测试/CI/真机/跨端 UI。GitHub 文件提交不等于 Atria 工程验证。

### Limitations and next checkpoint

- 后续每轮依用户要求：**先在 docs 更新 Plan 与唯一 Record、提交并核查，再讨论**。用户最终确认前一直 Draft。
- 下一次需围绕 World 与 Knowledge 主体关系和是否采用 Hybrid Authoring / 精确事实锚点做正式取舍；之后再展开实体/时间/认知/索引/UI/E0。
- 外部模型仅为方法论；严禁无证据引入第二世界权威、新 DB 或创建旧数据兼容负担。


## Stage 3 — W1 方向决定与 W2 建模讨论准备（2026-10-17）

- 用户明确同意上一轮推荐的 **B · World Model + Source Library**（W1）：世界模型是创作主语，知识是资料/来源；产品心智模型脱离以 ST Lorebook 的条目激活为中心。
- 此项是**总体设计方向获得认可**，不是整份方案定稿或全部子接口冻结；以 SessionCore/Session/Branch/Revision 为唯一运行时真相的原则与用户所选 B 一致；不创设新可写事实权威，不强迫纯文字作者全面结构化。
- design.md 已加入 §9：Entity、Relation、Assertion、Rule、Source 候选表达，纯文字/辅助/结构化三种创作体验，动态事实锚点及历史/认知实例、W2 A/B/C 三种取舍。
- Plan index 已标记 W1 认可与 W2 待议；W2 推荐 B 的混合模型尚未获用户选择，不可提前宣称批准。
- 本阶段操作仅修改 docs 分支，未改 main / 产品源码，未创建实现分支、运行任何测试/CI 或真实客户端验证。
- 下一检查点：围绕 World Entity 稳定身份、可变事实与自由文献之间的关系、作者何时确认 AI 候选事实做 W2 讨论；下一轮仍是**先更新同一 Plan/Record，再讨论**。


## Stage 4 — W2 确认与 W3 法则/事实权限讨论准备（2026-10-17）

- Trigger: 用户回复“认同”，承接上一轮明确推荐的 **W2-B：分层混合结构**。此处记录其对 W2 的认可；不扩张解释为 W3 选项或最终计划获批。
- Decision (confirmed design direction): W1-B World Model + Source Library；W2-B Hybrid Authoring，保留完整自由文本的创作地位，实体身份与影响演化的关键事实按需结构化，辅助 AI 的作者阶段抽取要经确认，Play 事实继续以现有 Native Session/Branch/Revision 的已提交状态为权威。
- Design commit: `a266429d78d55ca75e0281fae95933bc471ad720` — 同一 design.md 增补 §10，记录 W2 决策并编写 W3 法则/起点/动态真相/隐藏 Canon/未知和秘密、AI 提议的影响等级、Native commit、重大法则变更、W3-A/B/C 方案和风险。
- Index commit: `24534fad80eaf97e3344c4c84403b041bd2de75b` — 同一 index.md 路由到 §10，标明 W1/W2 已选而 W3 未选。
- Verification scope: 使用 GitHub fetch_file(ref=docs) 核对 docs 文档；静态对照 main 的 `src/native/world-knowledge.js`、`public/scripts/native/experience/world/session.js`、`public/scripts/native/experience/logic/runtime.js`、`src/native/simulation-authority.js`。未进行构建/自动测试/CI/客户端实测。
- Changes: **仅 docs**。未修改 main / 任何产品代码，未创建实现分支，未对 World/Knowledge Schema 或权限 API 做正式实现承诺。
- Next checkpoint: 本轮就 W3 讨论是否采用 **B：分级约束 + 涌现世界**（研究推荐）；具体哪些新事实可由 AI 自动确立、作者未定义与作者硬约束的区别、如何判定持久化时机与改变世界法则的门槛。用户下轮确认后须**先写回同一 Plan / Record 再讨论下一轮**。


## Stage 5 — W3-B 确认、W4 涌现实体与事实生命周期（2026-10-17）

- Trigger：用户明确选择 **W3-B 分级约束 + 涌现世界**，要求先更新 docs 上同一 Plan 及唯一 Record，再讨论事实事件提交、持久化时机、历史有效期、分支一致性；本工作轮补充：**游玩中新出现的 NPC、物品、地点与非预设内容如何真正加入活世界**。
- Decision **已确认的设计方向**：W1-B World Model + Source Library，W2-B 分层混合结构，W3-B 分级约束 + 涌现世界。W3-B 以不变法则守护与现有 Native Session Host 提交为核心；作者留白允许授权范围内的新增事实；重大事件/世界规律更动有专门约束。用户**没有**批准细粒度权限 API、实体类型数据库、W4 选项或实施开工。
- Plan 模块新增：`plans/architecture/world-evolution-consistency/runtime-emergence.md`，仍为**同一 ARCH-DWE-01 Plan Bundle**，没有第二份企划书。它提出 Entity Admission、临时场景/见闻/持久实体/活跃主体的分离、NPC 出场→持续交互→正式登记→时钟演化、事实提交与发表一致性、有效游戏时间/提交修订/角色获知时间和分支隔离，附 W4-A/B/C 三选候选与测试案例。
- 主要发现（仅 main 静态代码核对）：`public/scripts/native/experience/world/session.js` 的 event reducer + `commitStatePatch` + `expectedRevisionId` / receipt 路径已经存在；`src/native/session-core.js`/ `save-point-repo.js` 管 Session/Branch/Revision/SavePoint；`src/native/state-delta.js` 支持世界状态快照/增量；`src/native/lifetime-authority.js`已有受特定可选策略约束的 `person.enter`, `person.promote`, `person.exit`，并区分出生和介绍时间；`public/shared/native-actor-profile.js`的 authored Actor 仅来自固定 Package/EntryPoint，不应与运行时新增 NPC 混淆；HCM entity extraction 不是 Native 世界真相；Simulation Authority 有有界调度机制。具体所有调用方/端到端功能尚需 E0 审计。
- 本轮 docs 提交：
  - `bf7b77936685566d87c5caa13d2d1ab5c734c666`：新增同一 Plan 的 W4 模块 `runtime-emergence.md`。
  - `1ad46dbe704ed1a4f911fa24553d717048f54bad`：`design.md` §11 记录 W3-B 已确认并关联 W4。
  - `ca5dc676cb0699df3c9f7d725183a6410a151f84`：`index.md` 路由到 W4，明确 W1-B/W2-B/W3-B 已确认、W4 未决。
- Verification / limitation：通过 GitHub 读取现有 main 和 docs 资料、文档更新提交反馈；随后验证 docs 上 Plan index、design、runtime-emergence 和此 Record 均可读。本轮没有运行产品构建、测试、CI、真实 UI 或 Windows/CachyOS/Termux；**不对实现可靠性宣称验收通过**。只修改 docs，不修改 main / 产品源码，不创建实现分支。
- Next checkpoint：围绕 **W4-B（研究推荐、尚待用户决定）渐进接纳 + 关键交互即时提交**，具体讨论 NPC 首次出现和首次深度互动何时升级为持久实体、事实与叙述何时一起发表、时间化历史如何保留、回档/分支之后的 UID 与 HCM 如何隔离，以及按需模拟与预算。下轮仍先更新同一 Plan 与唯一 Record 再讨论。只有用户最终明确同意全案才定稿。


## Stage 6 — W4-B 确认与 W5 NPC 自主性/离屏演化设计（2026-10-17）

- **用户决定：**对 W4-B「渐进接纳 + 关键交互即时提交」表示“认同”。在此前 W1-B、W2-B、W3-B 的基础上将 W4-B 记为**已经确认的顶层设计方向**，不延伸为对 W5-B 的默认批准。
- **范围：**仍为 Task ARCH-DWE-01 / Primary Workspace docs。同一 Plan Bundle 新增当前阶段子模块 `plans/architecture/world-evolution-consistency/npc-autonomy.md`，不新建平行 Plan/Record、实现分支或 HANDOFF。
- **本轮 docs 提交（依次）：**
  - `122804896457a090eb9c67ee24a6b88da4c2b2e4`：更新 `runtime-emergence.md`，明确 W4-B 已选、具体接口仍待议。
  - `52111e0d5f86286ecbb330262d2b5994e50eec81`：新增 W5 `npc-autonomy.md`，调查自主行为分层、目标/意图与实际提交、游戏时间离屏追赶、认知隔离和预算，提出 W5-A/B/C 供讨论。
  - `0f3d42ac5d50f44bafd003b061393450421b31f9`：在同一 `design.md` 加入 §12，记录 W4-B 与 W5 选型路由，纠正历史章节开头的过期“全部方案未确认”状态。
  - `a2d69e406eb2f75547e8a5a69652aa86b9f43ead`：更新同一 `index.md` 的 W1–W4 状态、W5 当前阶段模块索引。
- **外部参考：**Generative Agents 2023 论文、Google DeepMind Concordia 及其 Engine 文档、Unreal Mass Gameplay Simulation LOD / StateTree 官方文档。借鉴“记忆/目标/行动结算”和“模拟粒度按重要性调整”，不建议直接引入新框架。
- **main 静态审查（非实测）：**`src/native/simulation-authority.js` 已有游戏时钟、scope、hot/warm/cold、界限任务；`public/shared/native-simulation-contract.js` 当前静态约束是 jobs≤16、steps≤16、deliberations≤1，并约束同作用域静态读取——动态 NPC 不能机械地各占一个固定 job；`public/shared/native-information-contract.js` 有 desire/intention/belief 等语义；`src/native/lifetime-authority.js` 有人物进出及重要度；`public/shared/native-actor-profile.js` 从 Package/EntryPoint 才投影 authored Actor；`src/native/tom-authority.js` 部分主体校验依赖 manifest actors；`public/scripts/agents/memory/eligibility.js` 有 requester 权限边界。没有证据证明任意生成的 NPC 已自动具备全套角色视图或认知/Orchestrator 调用权限。
- **W5 推荐但未确认：**W5-B 分层事件驱动自主性：A1 规则/日程、A2 有界反应和效用选择、A3 少数重要 NPC 的有限 LLM 辅助提案，统一由现有 Native Authority 提交；游戏时间推进触发离屏结算，不默认用户离线时继续后台运行。
- **本轮验证边界：**GitHub docs 文件提交与再读取核验；未运行代码、测试、CI、浏览器、Windows/CachyOS/Termux 真机或 UI，未改变产品行为。没有修改 main、长期分支结构、Governance 或 reference 分支。
- **下一检查点：**用户选择 W5-A/B/C 后，**下一轮先更新同一 Plan 与 Record**，继续分析运行时 NPC 与 Authored Actor 的身份/权限衔接、私有目标/信念与外部行动的所有权、冷态长跨度模拟与多 NPC 事件冲突、实际 Resource/Schema 和 E0 消费者验证。
- **Plan 状态：**Draft。即便 W1–W4 已选，尚未完成 E0/具体 API/阶段化验收/跨端证据，用户未授权实施也未批准最终定稿。


## Stage 7 — W5-B 确认与 W6 社会认知/关系权限讨论（2026-10-17）

- **用户决定**：回复「认同」，针对上轮明确推荐的 **W5-B 分层事件驱动自主性**。W1-B、W2-B、W3-B、W4-B、W5-B 现为已确认设计方向；并未确认 W6-B，也未批准全案定稿、产品实现或特定调用方契约。
- **任务所有权**：`ARCH-DWE-01`，Primary Workspace 仍为 `docs`，沿用同一 Plan Bundle 与唯一 Record。没有创建第二方案、HANDOFF、实现分支。
- **已完成的文档更新及提交**：
  - `0782c6072edd111cc12e88907c45e9a0e175bff1`：现有 `npc-autonomy.md` 的 §10 记录 W5-B 已获用户选择，明确预算、身份权限和任务承载未定。
  - `9ea059d1ab6f5182d88be228d74ecfc253ff460c`：在同一 Plan Bundle 新增 `npc-social-cognition.md` 作为 W6 当前模块，包含主体认知与真实关系分离、知识传播、动态 NPC 权限接入、案例/风险和 W6-A/B/C 三种待议方案。
  - `a5a17c3b2be58b3d0f796a49d9b21d9d8254a0c4`：更新总设计 `design.md` §13，记录 W5-B 并指向 W6 模块，不复制第二份细节。
  - `832ac899e1587f6b6bfc5cdfa6057eb1e68b412a`：更新入口 `index.md` 路由与 W1–W5 状态；W6 保持未获批准。
- **静态代码核对（main，非实测）**：`public/shared/native-information-contract.js` 已支持 truth/belief/desire/intention/emotion/relationship/theory_of_mind 语义与 actor/task/narrator 投影，却对配置 actors/views 做静态引用；`public/shared/native-information-runtime.js` 提供 exact snapshot/anchor、actor availability/分支隔离、可界定的 Source 投影；`src/native/cognition-authority.js` 和 `src/native/tom-authority.js` 的部分 target/perspective 仍显式检查 `manifest.actors`；`public/scripts/agents/memory/eligibility.js` 严格依据 Information 已授权来源/受众/分支限定取回，`src/native/lifetime-authority.js` 的有因果来源的 bond/家庭关系属于特定可选领域。不能把自由涌现 NPC 直接视为获得全部 authored Actor/认知权限。
- **外部资料对照**：Park et al. (2023) Generative Agents（经历/反思/计划）、Evans & Short (2013/2014) Versu（社会实践为自主角色提供行动机会但不强制执行）、Treanor et al. (2015) Social Play in NPC Dialog（多阶段、可参与的社会互动）。外部机制用于概念比较，未引入依赖或执行对方项目。
- **W6 研究推荐**：W6-B「世界关系事实 + 主体认知 + 来源事件」。双向成立的客观契约/联盟由 Native 提交；私人态度、目标、误信、情绪与其他角色的推测由已授权 Cognition/HCM 视图表达；通过可追溯通信/观察事件传播，防全知、串档和模型无权替玩家决定行动。**推荐不是用户已批准的冻结决策**。
- **实际验证**：GitHub 提交完成后再 fetch_file(ref=docs) 核验 `index.md`、`design.md`、`npc-autonomy.md`、`npc-social-cognition.md` 与本 Record。未执行 Node 构建/测试、GitHub CI、模拟回合、浏览器 UI、Windows/CachyOS/Termux 真机验收；未修改产品 main、Package、Plugin、reference、Governance。
- **下一检查点**：用户就 W6-A/B/C 做选择。确认后下一工作轮先更新同一 Plan/Record，再讨论“动态 NPC 的合法 Perspective 身份、知识/秘密传播事件、共同关系的形成条件和 HCM 与 World state 的写入边界”；持续保留 Draft，最终定稿须用户明确确认。


## Stage 8 — W6-B 确认与 W7 私人记忆/信息传播设计（2026-10-17）

- **用户确认**：对上一轮明确推荐的 **W6-B「世界关系事实 + 主体认知 + 来源事件」**回复「认同」。本次决策连同 W1-B/W2-B/W3-B/W4-B/W5-B 成为已确认的总体架构方向。已提交的共同关系与事实归单 Native Host/Session 真相，主观态度、信念、目标与猜测归各主体合法认知；信息靠可追溯观察/传播事件联结。**不表示用户选择了 W7-B、冻结了完整方案或授权代码变更**。
- **Task 与文档边界**：依旧只有 `ARCH-DWE-01` 一个 Primary Workspace `docs`、一份 Plan Bundle 与这一份唯一 Record。W7 新模块位于 `plans/architecture/world-evolution-consistency/npc-memory-information-flow.md`，并非并行新企划；不创建 HANDOFF、产品任务分支。
- **本轮文档提交**：
  - `74c0531258eaa4d8d178d2a4463104d8eaef0083`：新增 W7 `npc-memory-information-flow.md` 草案，包含动态 NPC 受众资格、经历/信念/目标/承诺/情绪的区分、秘密与谣言传播、分支隔离、W7-A/B/C 备选与 E0 未决问题。
  - `eb1c6719a3ad6c47b4cb5ea25b18e59234593d85`：更新原有 W6 `npc-social-cognition.md` 第 10 节，记录 W6-B 为用户确认方向，其余细则 Draft。
  - `15afa035cf8b31af749bc5d41f47eb2afec1a4e8`：更新同一 `design.md` 第 14 节，记录 W6-B、W7 关键边界与模块路由。
  - `91c8bd0392433ee8dba671488c3d2623f3ccde44`：更新同一 Plan `index.md`，明确 W1–W6 状态、W7 为当前阶段而非已批准方向。
- **main 静态代码对照（非运行验证）**：`public/shared/native-information-contract.js` 支持 belief/intentions/relationships 等源语义但 Perspective actor/view 声明式绑定；`public/shared/native-information-runtime.js` 未声明 actor 视为 unavailable，快照与 scope anchor、输出预算已具备；`src/native/cognition-authority.js` 与 `src/native/tom-authority.js` 部分目标身份受 `manifest.actors` 约束；`public/scripts/agents/memory/eligibility.js` 由当前授权视图/来源与 branch 限制可取回记忆；`public/shared/native-memory-contract.js` 已有 identity/commitment/relationship/key_event/detail 记忆类别与时效语义。未证实新生 NPC 能自动取得这些权限，不能靠读取 Narrator 全部资料或修改 Package Manifest 绕过。
- **W7 研究建议但未获批准**：W7-B「动态受众资格 + 证据驱动信息流」。NPC 获得稳定世界身份≠自动获得独立思考/隐私读取权限；合法 Perspective 的接纳与源可见性须分别处理。发送/送达/获知/相信/更正为不同事件或主体状态，真正世界后果仍由唯一 Native commit 确立。避免每 NPC 独立常驻 Agent。
- **验证与真实性**：文档写入通过 GitHub contents API，随后按 `docs` 读取/核验 Plan index、design、W6、W7 与 Record。未运行 Node 单测、CI、模拟回合、真实 UI、Windows/CachyOS/Android Termux；未修改 main、Package、Plugin、reference 或 Governance，未执行任何实现。
- **下一检查点**：用户选择 W7-A/B/C 后，下一轮必须先更新同一 Plan/Record，再深入审查动态 Perspective/Actor 身份映射、受众授权、跨主体信息传播与压缩/纠错、私有记忆与世界提交的事务一致性及分支隔离。E0 全消费者审计与具体实现阶段尚未完成，完整企划继续保持 Draft。


## Stage 9 — W7-B 确认与 W8 长期记忆/人格连续性讨论（2026-10-17）

- **用户正式确认**：对上一轮推荐的 **W7-B「动态受众资格 + 证据驱动信息流」**回复“认同”。现有 W1-B 至 W7-B 是已获用户选择的总体设计方向；**不应推断 W8-B 已选择，或整份企划已经定稿/获准实施**。
- **工作空间与范围**：沿用 `ARCH-DWE-01`，Primary Workspace 仍为 `docs`；只更新既有 Plan Bundle 和唯一 Record。不改变 `main`、产品代码、其他长期分支、Governance 或用户资产，不创建实现分支/第二 Plan/HANDOFF。
- **本阶段文档提交**：
  - `bd1c4080e92dd26ecc8ed02ad12fa5645b9d0aa6` — 更新 W7 `npc-memory-information-flow.md`，记录 W7-B 已确认及权限/接口未决。
  - `ef0f7f20f3102daf6367c69d38809d066d4c133d` — 同一 Plan 增加 W8 `npc-memory-continuity.md`，讨论客观历史与个人回忆/认知分离、源证据、模糊遗忘、受保护承诺、人格成长、长期成本、分支隔离和 W8-A/B/C 比较。
  - `0d84101b04f70a6c19c87a23450a33361b76c37b` — 总设计 `design.md` §15 记录 W7-B 已确认，路由至 W8。
  - `a5b34a103d6bebb3ccab1f29cc98a81f9b177f2b` — 更新 Plan `index.md`，注明 W1–W7 已确认，W8 仍为待议模块。
- **已静态核对的 main 机制**：`public/shared/native-memory-contract.js` 有受保护 `identity/commitment/relationship/key_event`、可淡化的 `detail`、`light/deep`、`fadeAfter`、`clarity/use` 和来源依据；`public/shared/native-cognition-runtime.js` 按合法时间、记忆类别及来源适用性投影模糊/使用意愿；`public/scripts/agents/memory/source-provenance.js`、`temporal-graph.js` 与 `eligibility.js` 提供来源证据、图谱与受众过滤；`public/shared/native-information-runtime.js` 和 `src/native/cognition-authority.js` 已有 branch/revision 及来源校验。不能以本任务名义平行再造“NPC Memory Database”，也不能断言新 NPC 已自动接上这些路径。
- **外部研究核对**：Park et al. 2023《Generative Agents》强调经验记录/反思/计划，Packer et al. 2023《MemGPT》强调分层记忆与有限上下文；借鉴检索/预算机制，不将实验结论冒充 Atria 跨端可靠性证据或作为引入新框架的理由。
- **W8 建议，明确未获得用户批准**：W8-B「来源保真 + 分层回忆与人格连续性」。客观历史和持续义务的权威不随个人遗忘消失；HCM 负责合法证据检索/来源链，Native Memory/Cognition 负责在受众资格下解释回忆适用性、主观信念及人格变化；没有足够证据时不得将心理猜测写成事实。
- **验证边界**：本轮仅 GitHub 文档提交/读取核验 + `main` 源码静态核对 + 公开原始论文阅读。未运行 Node tests、CI、浏览器、Windows/CachyOS/Termux 真机、UI 或端到端游戏模拟，不能声明这些均已通过。
- **下一 checkpoint**：请用户选择 W8-A/B/C。之后下一轮仍须**先更新同一 Plan 和唯一 Record、提交/核验 docs，再讨论**：动态 NPC 与 authored Actor、HCM/N-Memory 权威分工，记忆遗忘保护/人格长期可塑性，历史审计、索引压缩和分支重放，最终 E0 消费者审计及开发实施门槛。直到全部核心方案获用户明确确认才定稿。


## Stage 10 — W8-B 确认与 W9 跨域身份/权限映射讨论（2026-10-17）

- **明确用户决定**：对上轮唯一推荐 **W8-B「来源保真 + 分层回忆与人格连续性」**回复「认同」。W1-B 至 W8-B 均是当前已确认架构方向；**未授权 W9 选型、具体 ID/Schema、整体定稿或任何代码开发**。
- **工作空间**：继续 `ARCH-DWE-01` / Primary Workspace `docs`；唯一 Plan Bundle 与唯一 Record。只做文档+研究，未创建 HANDOFF、新 Plan、实现分支、其他长期分支合并或 reference 更新。
- **本轮 docs 写入（按提交顺序）**：
  - `09ce982683de3a43c2c6e8e8c536bd50efd16c5c`：在 `npc-memory-continuity.md` §11 记录 W8-B 已选，保留源历史、受众限定记忆与人格演化、不造第二 Memory/World 权威，并明确未定接口。
  - `e26a985a85f024204254801829cc3dee15273cdc`：在同一 Plan Bundle 新增 W9 `entity-identity-authority.md`，详述 World Subject/Actor/Lifetime/HCM/Perspective/Timeline 跨域 identity 的职责、来源映射、同名歧义、秘密身份、Session/Branch、选项 W9-A/B/C、UI 与 E0 审查。
  - `4b871d86762929dde9ad34716bd15a3691ec33ef`：更新同一 `design.md` §16，记录 W8-B 并将 W9 候选模块作为唯一详细设计入口。
  - `0d3501f12b06b28f9d8baee51d11daebe022cf16`：更新同一 `index.md`，明确 W1–W8 已确认、W9 当前讨论与 Draft。
- **本轮 main 静态核对（非实测）**：`src/native/identity.js` 的正式 Native ID families 已定义 Actor/World/Session/Branch 等，但未发现独立 World Entity family；`public/shared/native-actor-profile.js` 的 Authored Actor 严格来自 manifest/EntryPoint；`src/native/session-core.js` Timeline Actor 校验要求 Package manifest membership；`src/native/lifetime-authority.js` 的 `life.person.*` 是可选领域局部身份；`public/shared/native-cognition-runtime.js` 的 Actor ID regex/受众限制与世界新 NPC 的标识并不自动相容；`public/scripts/agents/memory/temporal-graph.js` 有独立本地图实体/别名/来源支撑的合并/拆分与 ambiguous/pending 身份；`src/native/repositories/session-repo.js`/SavePoint 持有唯一 Session/Branch/Revision 权威。没有全消费者 E0 证据表明它们已共用统一身份，不能写成现有已完成能力。
- **外部概念对照**：Martin Fowler Identity Map（单一工作单元内保持引用一致，不是全局可写实体表），Microsoft DDD Entities/Aggregates（长期身份与一致性边界），W3C PROV-O（来源、alternate/specialization，不能因关联自动证明同一对象）。仅作方案类比，未引入数据库/框架依赖。
- **待议 W9 推荐，不是用户决定**：W9-B「Canonical World Subject + 受控跨域映射/投影」。已提交世界成员由 Native Session 持有稳定主体身份，不同领域保留自己的 ID/权限/历史引用，通过明确来源、分支、可见范围关联；HCM 未确认的传闻实体不自动变成客观角色；Authored Actor 是表达资产而非必然一对一的物理世界人物。不要把“一个世界人物”误译为“所有模块使用同一个 ID 字符串/存一份万能对象”。
- **验证边界**：GitHub docs 文档提交完成后再次 `fetch_file(ref=docs)` 检查 index、design、W8、W9、Record。研究/静态代码阅读均不代表测试；未执行 Node、CI、浏览器 UI、Windows/CachyOS/Android Termux、真实 RP 回合或主仓库 Git 合并。**仅修改 docs**。
- **下一 checkpoint**：用户选择 W9-A/B/C 后，下一轮依约先更新**同一 Plan/唯一 Record** 再讨论具体 authored↔session 身份实例化、证据图候选匹配与权限、动态角色对话/认知合法入口、存档与分支引用、UI 及最终 E0。完整企划继续 Draft，直到用户明确确认全部核心边界与正式定稿。


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
- **E0 阻塞与下一检查点**：Timeline `actorId` / Actor Profile、Context Compiler/Generation Host/Orchestrator、Information/Cognition/ToM/HCM、Lifetimes、Visual/Speech/Persona、SavePoint/Branch 和 Story UI 的真实消费者/权限切换尚未进行全面接口审计。用户确认 W10 候选后，下一轮仍须**先更新此 Plan/Record，提交并验证 docs，再继续讨论精确映射和实现收口**。
- **验证状态**：GitHub Contents API 已提交上述四次 docs 变更，本 Record 随后提交；读取 docs 五份文件作存在性与内容核验。仅静态源码检查，无 Node 测试、CI、浏览器/UI 或 Windows/CachyOS/Android Termux 真机证据。**未修改产品代码，完整企划仍 Draft**。


## Stage 12 — W10-B 确认与 W11 类型化身份/能力契约及 E0 准备（2026-10-17）

- **本轮用户选择**：回复「认同」，对应上轮唯一推荐 **W10-B「固定定义 → Session Subject 实例化 + 类型化能力绑定」**。因此 W1-B～W10-B 是用户明确确认的**顶层设计路线**；不是 W11-B 批准、不是具体 ABI/权限接口定稿，不授权产品开发。
- **主要已确认原则**：固定 Authoring World/Package/Actor Profile 只提供来源、起始事实和表达模板；Native Session 创建正式 Subject，运行时新增 NPC 仅在持续后果出现后经 W4-B 原生受控提交接纳；表达模板、对话 Participant、私有 Perspective 和可执行 Task/Simulation 能力均分别鉴权、按事件和分支版本追溯，不通过 Runtime 反向编辑 Package 或将单一 `actorId` 强制兼任所有角色。
- **唯一工作空间/资产**：继续 `ARCH-DWE-01`，Primary Workspace `docs`；沿用一份 Plan Bundle、一份 Record。新子模块 `subject-contracts-e0.md` 在同一 Plan 下，仅处理 W11。本轮未创建第二企划、HANDOFF、实现分支、兼容层或产品文件。
- **本轮 docs 提交顺序**：
  - `43d6af5f4389b282e1614c451bbd66efe248862d`：新增 W11 子模块 `subject-contracts-e0.md`，包含 Subject/Definition/ActorProfile/Perspective/Participant/DomainLocalRef 逻辑接口、权限矩阵、W11-A/B/C 取舍、真实代码 E0 探针与未核验的调用方列表。
  - `4329647fd381694cd2ede7914b1a9e4a908c1ba5`：原 W10 `subject-instantiation.md` §10 正式记录 W10-B 用户确认，保留具体 Schema/API 未决。
  - `8e0c4f1e3b601c7cc7373e8a0001ebf145844f9b`：同一总设计 `design.md` §18 写入 W10-B 方向及 W11 讨论路由。
  - `257df0e3bb1186e230929e1bc414d6848eabf2c3`：同一 `index.md` 更新至 W1–W10 已确认、W11 候选未决，保持 Draft。
- **局部 main 静态证据**：SessionCore `_newEntry` 仍拒绝不属于 Manifest Actors 的 `draft.actorId`；ActorProfile 取材固定 EntryPoint/Package；`assertInformationClosure` 要求 Info Actors 是 Manifest Actors；Information/Cognition/ToM 及 Goal Contracts 使用 Actor 身份和来源权限；`public/shared/native-frontend-host.js` Message ABI / `public/scripts/native/session-projection.js` committed fingerprint 暴露 actorId；Speech 校验 `Timeline.actorId` 和 Expression Actor，Visual/Goal 有自己的身份路径；HCM Evidence Entity/Lifetime 局部 ID 不等同于 Subject。以上仅是选择性静态读和搜索，**不是完整 E0 caller census**，也没有自动证明新 NPC 已可合法发言或维护私人记忆。
- **W11 建议（未获用户批准）**：W11-B「Typed Subject / Participant / Perspective + Native Host Capability Resolution」。受控实体与已提交对话/事件分离，表达 Profile 与个人记忆/任务授权单独授予、分支/修订/受众解析；要最小化对现有 Authority 的改动、一次性切换旧 Actor 强耦合真实消费者，而不是新建多套可写 DB、向 Narrator 申请全知或在运行时重写 Package。
- **风险/E0 保留**：Timeline/Context Compiler/Generation Host/Orchestration、HCM/Information/Cognition/ToM、Native Host 前端 ABI、Goal/Lifetime/Task/Simulation、Visual/Speech/Persona、Studio/Library/Play 与 Save/Branch 的**生产调用方、权限、跨分支、版本、预算、UI**尚未全量审查。下一阶段须具体列出真实消费者、原契约/目标契约/删除路径和验收矩阵；不能以“发现文件路径”代替运行时接线确认。
- **验证边界**：通过 GitHub connector 对部分 main 文件做静态核对，并在 docs 更新后重新 fetch 验证 `index.md`、`design.md`、W10/W11 模块与 Record 可读。不运行 Node/test、CI、浏览器、真实 UI、Windows/CachyOS/Android Termux，未修改任何产品代码或其它长期分支。
- **下一 checkpoint**：用户明确选择 W11-A/B/C 后，下一轮依约先更新同一 Plan 和唯一 Record，再讨论 W11 目标接口粒度、静态 Actor → 动态 Subject 的真实 caller cutover、权限边界与正式 E0 清单，以及最后设计定稿前剩余必须确认的实现前置条件。
- **状态**：完整企划继续 **Draft**，未授权开工。 


## Stage 13 — W11-B 确认与 W12 接口级 E0 / 事务与切换讨论（2026-10-17）

- **用户决定**：明确“认同”上一轮推荐的 **W11-B「Typed Subject / Participant / Perspective + Native Host Capability Resolution」**。当前 W1-B～W11-B 均属于用户已确认的**架构方向**。**不能据此声称** W12-B、某个 ABI/ID/权限 API、全量 E0 审计、CI/跨端验收或整体方案定稿已获批准。
- **工作域**：继续使用 `ARCH-DWE-01`，唯一入口 `plans/architecture/world-evolution-consistency/index.md`，唯一累计 Record 即本文件；`docs` 仍为唯一被修改分支，不创建新 Plan/Record、HANDOFF、实现分支或跨长期分支合并。开发尚未授权。
- **本轮 docs 提交及内容**：
  - `475b4541741f065f11cd874fc32053f5944fefd4`：在 W11 `subject-contracts-e0.md` §8 记录 W11-B 为确认方向，明确身份、表达、合法个人视角与正式叙事参与者的类型化边界，不把类型语义自动等同新独立数据库/API。
  - `b3cfa3bcc7d9ffb36433524dff720f6deb46d34d`：新增**同一 Plan Bundle 的 W12 模块** `e0-consumer-cutover.md`，详细列出 Source-of-Truth/Owner 矩阵、真实生产代码路径的部分审计、World/State/Receipt/Timeline 统一发布边界、valid game-time / committed revision / observed time 区分、存读档/权限、Library/Studio/Play 和 W12-A/B/C 候选。
  - `2571ffc478d93be122e4a54c2efb9fdf7dbb51a4`：同一 `design.md` §19 记录 W11-B 已确认，W12 仅为候选路线，并注明 E0/全端仍有阻塞。
  - `14536e43eb2f2c143176099a84c9aa38a41d331d`：更新同一 `index.md` 的 W1–W11 状态、W12 模块路由与 Draft 限制。
- **已核对 main 的具体静态发现**：`src/native/repositories/session-repo.js` `commitSnapshot` 当前有资源事务、immutable dependencies、`expectedRevisionId` CAS、`commitReceipt` 与 Session Root final marker；`public/scripts/native/experience/world/session.js` `commitEvents` 可将 `atri_world_state` 与 `atri_game_runtime` journal 随 `commitStatePatch` 提交。**不能推断所有** Narrative/Task/Native Orchestration/World Events/Cognition 的跨域效果都天然处于相同原子 publication。
- **当前静态消费者事实**：`SessionCore._newEntry` Actor ID 限定 Manifest；`assertInformationClosure` 信息受众声明依赖 Manifest；`Native Frontend Host.MESSAGE_SCHEMA`、`session-projection.js` fingerprint、`speech-service.js`/部分 Visual 都消费 Actor ID；`native-chronicle-host.js` 部分 World View 围绕特定 Lifetime 域而非已实现通用实体有效时态查询；`world-editor.js` 当前作者界面主要有 schema/baseline/metadata，后续 World Model UI 不可假设已有；`context-compiler.js` 有 Token lanes、世界/知识/信息来源。已定位路径属于**部分 E0 consumer probe**，尚缺全量生产调用方、Orchestration V3 真实 HEAD、旧分支清退界面和真实运行验证。
- **W12 研究推荐（用户未确认）**：W12-B「E0 证据驱动的原生硬切 + 单权威提交收口」。先审全量消费者及旧→新实际接口，再最小化在现有 Native Host 做类型化 Subject/Participant/Perspective、事件/权限/时态的可靠提交；随后一次性清退旧假权威/Actor-only 绑定和无用兼容双轨，最后 Studio/Play 与 Windows/CachyOS/Termux 验收。W12-A 跳过 E0 直接大改及 W12-C 并行新旧系统均有显著风险。
- **真正未解决的 E0/Gate**：完整 consumer map 与原/目标 Schema/删除清单、Session 主体 Identity ID 决议、叙事文本/世界事件/身份/社会关系在单次 Native Revision 的明确提交或协调策略、game valid-time / commitment/knowledge-time/as-of 查询、Save/Branch、来源权限和 HCM 实际读写归属、Orchestration V3 与 Context Compiler、Library/Studio/Play UI、全端性能/安全验证均尚未完成。现阶段文档里的 E0 是调查清单，**不能标为 E0 已完成或测试通过**。
- **验证范围**：通过 GitHub 连接读取 `docs`、`main` 若干具体源码，提交后再次 `fetch_file(ref=docs)` 确认 index/design/W11/W12/Record 文档存在且有正确确认状态。没有运行 Node 测试、CI、真实浏览器/前端截图、Windows/CachyOS/Android Termux 真机验证。**产品代码 main 未修改**。
- **下一检查点**：用户选择 W12 方向后，下一轮依协议先在同一 Plan/Record 更新 W12 决议，随后重点针对事件/参与者/状态的 Native commit boundary、世界事实有效时间、跨分支重放与 Source Projection，以及 Studio/Play Effective World 的消费者和正式 E0 完成标准细化；继续 Draft，不创建实现分支。


## Stage 14 — W12-B 已确认与 W13 原生事件/时态/分支讨论（2026-10-17）

- **用户本轮确认**：回复「认同」，明确接受上轮推荐的 **W12-B「E0 证据驱动的原生硬切 + 单权威提交收口」**。W1-B～W12-B 现为已确认的架构及实施方向；**并非** W13-B 已获得批准、全量 E0 已完成、具体 schema/API 已冻结、整体方案定稿或允许改动产品代码。
- **任务所有权/范围**：沿用唯一 `ARCH-DWE-01` Plan Bundle `plans/architecture/world-evolution-consistency/` 与此唯一 Record；工作区仅 `docs`。本轮只进行 GitHub 上源码静态阅读和文档提交，不创建第二 Plan/Record/HANDOFF/实现分支，不更改 main/Package/Plugin/Skills/reference。
- **本轮 docs 提交**：
  - `667ae0eb7412f0fa8313736ad096c032002e581c`：现有 `e0-consumer-cutover.md` 第 9 节写入 W12-B 用户确认和 E0 未验收的阻塞声明。
  - `a56333f152b91defec755cc376e179da40391d40`：在同一 Plan Bundle 创建 W13 `event-temporality-branch.md`，研究“意图/叙事声明 vs 已提交效果”、Native Commit/Receipt/Revision、世界事实 valid time/记录 revision/角色 observed time、历史纠正/Retcon、存档分支和故障矩阵、W13-A/B/C。
  - `6c97b64cf54a12a7947bd6a0fddd366d18b780eb`：在同一 `design.md` §20 记录 W12-B、路由 W13，严格区分静态事实与拟议目标。
  - `1cea3eb6eb1c8cea490a7df60b0b68781eb8e9a1`：在同一 `index.md` 将 W1–W12 标记为已确认、W13 待选，更新路由和 Draft 状态。
- **静态源证据（2026-10-17 main，无代码测试）**：`src/native/repositories/session-repo.js` 的 `commitSnapshot` 在已有事务中处理 Session/Revision、`expectedRevisionId` CAS 与提交指纹/Receipt；`src/native/session-core.js` 的 `_publishLocked` 可处理候选 States/Timeline、`actionRequest` receipt、Cognition/History 验证并将结果交给 SessionRepo；`public/scripts/native/experience/world/session.js` 的 `commitEvents` 通过 `commitStatePatch` 同步更新 `atri_world_state` 与 `atri_game_runtime` Journal，事件示例使用 branch+sequence 身份。证据只表示可复用机制存在，**没有**完成 Actor/Task/Narrator/World 全入口的原子性证明。
- **时态与分支证据**：现有 `src/native/history-authority.js`、`public/shared/native-chronicle-host.js` 含特定领域 game tick、事实/来源/历史查询；`src/native/repositories/save-point-repo.js` 的 SavePoint 锚定已提交 Branch/Revision，`src/native/session-snapshot.js` 验证 forkRevision / 祖先及 Timeline 可达性；`src/native/cognition-authority.js` 有分支修订重绑定与来源指纹校验。这些**不能**证明已具通用 World Subject 的双时间 as-of 查询、新动态 Perspective 完全受支持或 HCM 跨所有分支都验收通过。
- **W13 推荐尚未选定**：W13-B「Native Revision 一致性提交 + 双时间/分支受控投影」。正式 Subject admission/持续性世界效果/事件与参与者在可合法实现的现有 Native publication 边界达成一致；`validAt / recordedRevision / observedAt` 分离，按 Session/Branch/Revision/GameTick/Audience 合法查询；HCM/Context 可恢复派生而非新 World Truth；普通叙事细节不全量入事件表，真正 Retcon 需独立权限与依赖处置。W13-A Snapshot-first 松散摘要及 W13-C 平行 Event Store 为对照。
- **故障与权限门槛（拟议，未测试）**：同物品双卖的 CAS/前置条件、未知提交结果先查 receipt 后重试、叙事成功/世界事务拒绝时防错误发布、HCM 索引失败时可从原生已提交来源恢复、旧分支异步结果不得穿越、未公开身份与秘密在历史查询不能泄漏。当前只是文档中的未来验收案例，不产生已测试的承诺。
- **E0/实际验收状态**：本阶段仅部分 `main` 静态代码核对 + GitHub Contents API 文档读写；提交完成后再 `fetch_file(ref="docs")` 核验 `index.md`、`design.md`、W12、W13 与此 Record。**仍缺完整 production consumer census、Orchestration V3 真实执行路径核验、通用历史查询、Library/Studio/Play 实际交互、Node/tests/CI 和 Windows/CachyOS/Android Termux 真机。**
- **下一检查点**：用户选择 W13-A/B/C 后，下一轮按约定**先更新同一 Plan 与唯一 Record、提交并核验 `docs`**，再深入 World/Knowledge Effective View 与 Context/Library/Studio/Play 的来源选择、时态和可见性/Inspector 交互，以及最终 E0/正式开发前置门槛。保持 Draft，不创建开发分支，除非用户另行明确批准整个企划。

## Final state

Not yet applicable. Discussion in progress.
