# Atria Native Experience Modes & Capability Deepening — Revision Log

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 二十九、修订记录
### 2026-09-26 — Implementation Baseline v1.0

用户结束当前压力测试讨论并授权 Codex Astra 开始实施。将 Discussion Draft v2.3 规范化为顶部 Implementation Baseline：冻结 8 条架构不变量、32 项能力主表、Authority 总图、P0–P9 单分支实施顺序、阶段交接/验证规则与明确非目标。历史 Round/案例章节完整保留为设计证据，但出现冲突时不再覆盖顶部规范基线。正式实现分支为 `feat/native-experience-modes-capability-deepening`，基于 `main@4dab353ac639d42eae885c79e18245267abd6820`。

### 2026-09-26 — Discussion Draft v2.3

完成第五个样本《废材教主的肉身布教计划 ～ 目标是三亿元！》v1.1 的 card-side Runtime 协议审计。确认该卡本体主要充当多 Model Task / Prompt contract，重前端由远程 HTML bootstrap；其 START_GAME → MORNING → PLAN → STORY/GAL → NIGHT → STORY/DAY COMPRESSION 以及定时 SMS/X 证明此前“Workflow 只需 shorthand”的结论过窄。新增 #32 Experience Workflow / Phase Graph Runtime；同时把 STORY/GAL 抽象为 Narrative Presentation Profile + Model Task Variant，把 GAL 字符串命令收敛成 #22 typed Scene Cue IR，并补 Scheduled Interaction、Actionable Message Attachment、runtime-authored typed Session artifact、Hierarchical Narrative Rollup / Open Loop separation。能力主表由 31 项增至 32 项。

### 2026-09-26 — Discussion Draft v2.2

完成第四个大型样本 `1102052563-a11y/zhushen-space@7af6f389` 的架构压力测试。该项目首次把审计边界从“单玩家 / 单 Session 重型应用”推到跨存档玩家连续性与多人/Realm 共享权威：新增 #30 Player Continuity State / Account Authority Domain 与 #31 Shared Session & Realm Runtime / Multi-participant Authority；补 Cross-Authority Transfer Receipt/Saga、multi-participant Turn、one-truth/multi-perspective、Scene Scope、Presence、late-join Snapshot+Cursor、Realm Domain 与 server/host deterministic authority。其余 Advisor/Branch Tree/World scope/Workshop/TTS/Agent 能力压回既有 primitive。能力主表由 29 项增至 31 项。


### 2026-09-26 — Discussion Draft v2.1

对《银麒赎世》V24.4 做第二次“榨干式”全卡审计，不再只看功能清单，而是复查其长期维护中反复出现的 UI、状态、通知、初始化、性能与一致性问题。冻结 Authority/Lifetime 与 Exposure/Information-flow 正交原则；补 Attention Projection / Delivery Receipt、hard/advisory/confirm Constraint Result、Host-owned Collection View Runtime、Feature Degradation Profile、Session Domain Retention/Compaction、Experience Ready Barrier 与 Canonical Entity Identity。明确联系人备注等 player-private Session 数据不能因持久化而自动进入模型 Context。以上全部压回现有能力域，主表仍保持 29 项。

### 2026-09-26 — Discussion Draft v1.7

继续用《银麒赎世》的主生成/任务审核/生图/世界动态/据点同步并行状态压力测试 streaming 与 UI runtime。将 Round 4 的“Draft narrative 可 streaming、authority finalize 后 commit”推广为 Host-owned Scoped Operation State / Operation Projection；明确 busy 必须按 semantic claim/conflict scope 判断，Package UI 可读取 queued/running/streaming/retrying/finalizing/stale 等状态，Presentation/Local UI 可并行而冲突 authority transaction 通过 Revision/CAS 串行。能力总数仍维持 28。

### 2026-09-26 — Discussion Draft v2.0

继续压力测试《银麒赎世》的十通道模型配置，发现第 27 项只定义 Model Task 而未定义玩家如何高效绑定实际模型。新增 Task Binding Slot，并明确区分 Package Task semantic、author-owned Task Program 与 player-owned execution choice；同时指出当前 Runtime Route 把 Model/Connection 与 Prompt/Generation 绑定得过粗，复杂 Package Task 不应被迫一 Task 一 Route。提出可复用 Model Execution Lane / Effective Task Execution Plan，Task Prompt 与玩家 Model binding 独立组合，Package 更新按稳定 slot 复用并重新验证。能力总数仍为 29。

### 2026-09-26 — Discussion Draft v1.9

继续压力测试《银麒赎世》的 MVU 双模型模式，并修正 Round 4 过早冻结的“post-narrative resolver 只作兼容桥”结论。`narrative-outcome` 现在正式支持 inline outcome 与 post-narrative semantic interpretation 两种 Native execution strategy；复用当前 `event_interpreter → Interpretation Mapping → typed Command` 地基，让 Narrator Draft 可由独立低方差结构化模型解释语义 outcome，同时保持 Draft provisional、最终原子提交与 authority ceiling。Legacy 自由文本/Regex/JSONPatch mutation resolver 才继续只作为兼容桥。能力总数仍为 29。

### 2026-09-26 — Discussion Draft v1.8

继续压力测试《银麒赎世》的长期时间系统。确认当前 World State 可自行保存时间字段、Runtime Automation 已引用 world-time、Studio 草案已有 clock fixture，但 `main` 尚无一等 Game World Clock。新增第 29 项 Temporal Runtime / World Clock & Schedule：严格区分 wall clock、Turn/Revision logical time、World Time 与 Activity/Task elapsed time，以 branch-aware canonical WorldInstant/Duration/Schedule 支撑 cooldown、deadline、cross-day process、catch-up、Perspective freshness 与 deterministic Studio tests；时间推进仍必须经 typed Command/Event/Reducer，不形成第二套 authority。

### 2026-09-26 — Discussion Draft v1.6

继续拆解《银麒赎世》的多模型通道与自动生成基础设施。确认 Model Task 的 output schema 不能等同于 authority，给第 27 项增加 Result Authority / Sink Policy、typed result adapter 与可追踪 provenance；同时依据该卡 API pool / queue / dedupe / cooldown，以及当前 Native Generation Host 仅有单请求 retry/fallback/cancel 的实现基线，将 Host Task Scheduling / Backpressure 纳入第 24/27 项共享 runtime。补充 Actor Availability Projection 作为 Data Projection + Automation + Perspective 的组合能力。能力总数仍维持 28。

### 2026-09-26 — Discussion Draft v1.5

继续压力测试《银麒赎世》的撤回/审核取消/战斗重打/防重复入账体验。将第 7 项 Action v2 深化为带 idempotency、transaction receipt 与 typed compensation/undo policy 的 Command Surface；区分 cancel-before-commit、Activity retry、compensating Command 与历史 Branch restore。能力总数仍维持 28。

### 2026-09-26 — Discussion Draft v1.4

继续以《银麒赎世》的开发/测试体系反向压力测试 Studio。确认“Studio visual authoring”定义过窄，将第 19 项深化为 Visual Authoring + Scenario Simulation / Test Bench：以 deterministic fixture、mock/recorded/live Model Task、Action/Activity/WorldProcess/SessionApp/Perspective assertions 和多设备环境模拟验证 Package，并要求 Test Bench 复用生产 Runtime contract。能力总数仍维持 28，不新增第 29 项。

### 2026-09-26 — Discussion Draft v1.3

继续完成《银麒赎世》反向压缩审计。没有继续新增第 29 项：将二级私聊/群聊归入 Conversation Presentation + Scoped Thread，将任务审核/连环任务归入 Session Application State 上的 Workflow shorthand，将关系网/图算法归入 Data Projection 的 bounded graph query；同时确认跨 World / Session App / Journal / Timeline 的逻辑事务必须复用现有 SessionCore 的单 Revision 原子提交，而不是建立多套快照或双源同步。

### 2026-09-26 — Discussion Draft v1.2

完成第三个重型案例压力测试：用户提供的《银麒赎世》V24.4。新增 Epistemic / Actor Perspective Projection、Package Model Task / Generation Task Contract、Typed Session Application State 三个一等候选能力；确认当前 SessionCore 已有 revision-aware 任意 namespace 底座，因此不复制 IndexedDB / snapshot-ring，而将其产品化为 typed Session Application Domain。同步深化 Runtime Automation 为 World Process Recipe、Experience Diagnostics 为 Health / Repair / Migration，并给 Auxiliary Task 增加 Revision anchor / stale result / CAS apply 语义。当前能力主表增至 28 项。

### 2026-09-26 — Discussion Draft v1.1

完成第二个重型前端压力测试：用户提供的 `【TG】天书江湖录` 以及其远程 `bibilabu2026/tswx@b96aab66` 运行资源。确认 Activity Runtime、Opening Wizard、Action v2、Message Projection 等方向，并新增一等 `Native Add-on / Content Extension Layer`；同时将 extra-AI 前置处理归入 Package Turn Contract 的 bounded synchronous Turn Stage，而与异步 Auxiliary Task 分离；补充 Activity Outcome → Narrative Handoff、runtime-authored typed entity 与 Player Action Palette 设计。

### 2026-09-26 — Discussion Draft v1.0

完成首个独立重型前端压力测试：`Ji-Haitang/char_card_1` / 《瀚海》1.4.0。确认现有 Component/Turn/World/Memory/Prompt 基础仍成立，但新增四个重要候选能力域：Activity Runtime、Native Media/Scene Host、Immutable Asset Pack / Heavy Resource Delivery、Auxiliary Task Runtime；同时强化 Player Preference 的 device/render scope、Host capability negotiation，以及 safe media/audio presentation。明确不复制 iframe/postMessage/localStorage/Package Three.js 等项目实现。

### 2026-09-26 — Discussion Draft v0.9

完成当前 `main@4dab353a` 的实现基线复核：确认 Component Model v1 / responsive surfaces、Studio Structured UI + Preview、Game Turn Controller Attempt/Retry/Switch、Declarative Logic、Host Environment/focus 与 semantic interpretation mapping 已存在。相应校正能力缺口措辞，冻结 Turn Envelope、Reply Variant、Mutation shorthand、Composer capability 与 Studio v2 必须建立在现有 Native runtime 上深化，不另建平行体系。

### 2026-09-26 — Discussion Draft v0.8

纠正 Round 5 方向：本任务不设计 SillyTavern/MVU 迁移与兼容体系。旧卡只作为 capability benchmark / pressure test。新增 Atria Native 能力缺口主表，并明确后续只吸收用户能力、不复制 legacy API/运行时。

### 2026-09-26 — Discussion Draft v0.7

完成 Round 4 收敛：正式区分 Package Turn Contract / Model Turn Output / Committed Turn Envelope；确定 canonical prose range projection、独立 Block Registry、structured-output 优先级、无隐式 repair、Package Asset 与 template context 白名单、Opening Variant 复用边界，并冻结 authority-first / narrative-outcome 双主路径。

### 2026-09-26 — Discussion Draft v0.6

进入 Round 4：设计一等 Message Projection / Assistant Turn Envelope。确定 narrative、projection、outcomes、diagnostics 四通道，projection 绑定 immutable Variant，使用有序 flow 支持正文穿插 Block；模型只能输出预声明 block type + data，历史动作采用 active-tail/fork policy，兼容旧标签仅做 typed extraction，并提出 atomic Turn commit 与 Conversation feed/latest/reader presentation。

### 2026-09-26 — Discussion Draft v0.5

加入重前端 MVU 压力样本审计：提炼 Package Data Resource、Data Projection、Player Preference State、Host Fullscreen/Gamepad、Message Projection 现实原型，并对“额外变量更新 API”形成结论——需要非 LLM 的权威状态更新能力，但不开放裸 World patch；通过 Declarative Mutation shorthand 编译为标准 Command/Event/Reducer。

### 2026-09-26 — Discussion Draft v0.4

进入 Round 3，提出 Component Model v2：Experience UI Document、多 View/Surface、Local UI State、two-way Form model、Selector/Expression/Template 分层、Action Sequence、Native Composer Host capability、repeat、safe appearance、responsive/environment 与 Message Projection template 预留。当前仍为讨论草案，尚未实现。

### 2026-09-26 — Discussion Draft v0.3

完成 Round 2 第一轮能力审计：补充 Native Branch/Reply Variant、Message snapshot projection、Macro 拆分、Prompt semantic targets、Declarative lifecycle automation、Tavern Helper/CardApp Native 去向，以及传统 MVU Narrative Outcome Resolution 的核心缺口与四种候选路径。

### 2026-09-26 — Discussion Draft v0.2

补充 Round 2 进行中的能力账本：开局/Opening Variant、Quick Reply 生命周期、Regex 语义、World Info 与 Native Knowledge 差异、四层状态模型，以及实际 MVU 前端链路。

### 2026-09-26 — Discussion Draft v0.1

首次建立企划，记录当前已经达成的核心共识：

1. Component / Hybrid / Full 是布局所有权模式，不是能力等级。
2. 三种模式共享完整 Capability Layer。
3. Component 定位 Chat Enhancement。
4. Hybrid 定位 Chat-based Game Application。
5. Full 定位 Standalone Game/Application。
6. 增加 Local UI State、Form、Expression、Composer Action。
7. Message Projection 作为承接正文状态栏 / 快速回复 / Regex HTML 的核心能力。
8. MVU Native 化目标为 Native World State + Native Component。
9. Legacy MVU 保留 compatibility provider，不作为新 Package 核心事实源。
10. 下一轮优先做 SillyTavern + MVU feature inventory，而不是立即实现。
