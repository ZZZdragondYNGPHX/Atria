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

## Final state

Not yet applicable. Discussion in progress.
