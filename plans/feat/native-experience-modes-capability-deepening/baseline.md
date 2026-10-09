# Atria Native Experience Modes & Capability Deepening — Baseline

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 任务信息

- 任务：Native Experience Modes & Capability Deepening
- 类型：`feat/*`
- 文档状态：**Implementation Baseline v1.0 / P0–P9 已实施，最终集成验证中**
- 当前实现基线：`main@4dab353ac639d42eae885c79e18245267abd6820`
- 正式工作分支：`feat/native-experience-modes-capability-deepening`
- 分支起点：`main@4dab353ac639d42eae885c79e18245267abd6820`
- 计划文档：`docs:feat/native-experience-modes-capability-deepening.md`
- 任务交接：`docs:handoff/native-experience-modes-capability-deepening.md`
- 最新交接：`docs:handoff/latest-handoff.md`
- 当前能力主表：**32 项**
- 旧空分支 `feat/component-form-composer-submit` 不承载本任务实现，也不作为方案依据。
- 执行流程见 [Governance §8](../../../README.md#8-task-lifecycle)。

## 〇、实施规范基线（Implementation Baseline v1.0）

> 本节自 2026-09-26 起是本任务的**规范性实施入口**。后续“一～二十八”保留为完整讨论、压力测试与设计证据。若历史章节与本节冲突，以本节和之后明确更新的实施决策为准；不要为了维持早期草案一致性而恢复已经被后续样本推翻的设计。

### 0.1 当前冻结目标

Atria 要建立一套共享的 **Native Experience Capability Layer**：

- `Component / Hybrid / Full` 只表示 **layout ownership**，不是功能等级；
- 三种模式共享同一能力层；
- `Component = Chat Enhancement`；
- `Hybrid = Chat-based Game Application`；
- `Full = Standalone Game/Application`；
- Package 不通过升级模式来获得 Form、Action、Composer、Message UI、Activity、Model Task 等基础能力；
- Experience 复用现有 Native Session / World / Revision / Branch / Event Journal / Knowledge / Memory / Model-Prompt Runtime，不建立平行事实源。

### 0.2 规范优先级

实施时按以下优先级解决冲突：

1. 本节“实施规范基线”；
2. 当前代码与测试中的已集成 Native contract；
3. §23–§28 的最终 Gap Analysis 与案例压力测试结论；
4. §19–§22 的早期讨论记录；
5. Legacy SillyTavern / MVU / Tavern Helper / Regex HTML 的历史行为。

Legacy 案例只证明**用户能力需求**，不拥有 Atria API 设计权。

### 0.3 不可违反的架构不变量

1. **Typed authority only**  
   World / Session Application / Player Continuity / Shared Realm 等权威写入必须经受控 Command / Event / Reducer / transaction contract；不开放裸 `patch` / `replaceMvuData` / 任意 state mutation。

2. **Declarative package runtime**  
   Native Package 不执行任意 JS，不注入任意 HTML/script，不获得任意 CSS、DOM、localStorage、database handle、WebSocket 或 arbitrary network API。

3. **Prompt / Display / Authority 分离**  
   Narrative、Projection、Outcome、Diagnostics、Context exposure 不混为一条字符串通道。

4. **Storage does not imply exposure**  
   数据属于哪个 authority/lifetime domain，与 Narrator / Actor / Task / UI 能否读取它正交；Context 必须 allow-by-contract。

5. **One truth, many perspectives**  
   多 POV / 多玩家可以有不同 Perspective / Presentation，但不能产生互相漂移的 World Truth。

6. **Revision first**  
   Session-authoritative 的 World、Session App、committed Activity result、committed Task result 必须与 Revision / Branch 一致；Retry / Restart / Branch 不允许留下“未来状态”。

7. **No remote executable dependency**  
   Package / Add-on / UI / Scene 所需资源必须形成 exact dependency closure；远程可变 HTML / JS 不作为 Native Runtime 依赖。

8. **Host owns execution safety**  
   Task 调度、并发、backpressure、Secret、Connection、Model、provider、cancel、timeout、capability negotiation 与 hard limits 由 Host / Player 控制，Package 只能声明语义需求。

### 0.4 32 项能力主表与实施归属

| # | Capability | 首要实施阶段 |
|---|---|---|
| 1 | Component Model v2 | P1 |
| 2 | Local UI State | P1 |
| 3 | Player Preference State | P1 |
| 4 | Package Data Resource | P0/P1 |
| 5 | Data Projection / bounded query / Scene Projection | P6 |
| 6 | Native Composer Host capability | P1 |
| 7 | Action v2 / Command Surface / receipt / compensation | P1 |
| 8 | Declarative Mutation authoring shorthand | P1 |
| 9 | Message Projection | P2 |
| 10 | Package Turn Contract + bounded synchronous Turn Stage | P3 |
| 11 | Turn Envelope | P2/P3 |
| 12 | `authority-first` + `narrative-outcome` | P3 |
| 13 | Runtime Automation / World Process Recipe | P4 |
| 14 | Opening Phase / Variant / conditional Wizard | P1/P4 |
| 15 | Reply Variant / Branch Graph facade | P2 |
| 16 | Conversation Presentation + Scoped Conversation Thread | P2/P6 |
| 17 | Host advanced presentation/input + capability negotiation | P5/P9 |
| 18 | Safe Appearance / Motion / Media / Speech Presentation | P5 |
| 19 | Studio visual authoring v2 + Scenario Simulation / Test Bench | P9 |
| 20 | Experience Health / Diagnostics / Repair / Migration | P9 |
| 21 | Activity Runtime / Transactional Subscene + Narrative Handoff | P5 |
| 22 | Native Media / Scene Host + typed Scene Cue IR | P5 |
| 23 | Immutable Asset Pack / Heavy Resource Delivery | P5 |
| 24 | Auxiliary Task / Background Model Job Runtime | P3 |
| 25 | Native Add-on / Content Extension + Community Registry contract | P7 |
| 26 | Epistemic / Actor Perspective Projection | P6 |
| 27 | Package Model Task / Task Variant / Binding / Proposal Artifact | P3 |
| 28 | Typed Session Application State + Scope Lifecycle | P4 |
| 29 | Temporal Runtime / World Clock & Schedule | P4 |
| 30 | Player Continuity State / Account Authority Domain | P7 |
| 31 | Shared Session & Realm Runtime / Multi-participant Authority | P8 |
| 32 | Experience Workflow / Phase Graph Runtime | P4 |

“首要实施阶段”只表示首次形成完整 contract 的阶段。后续阶段可以组合使用，但禁止提前实现后续阶段的大块产品能力。

### 0.5 状态 / Authority 总图

```text
Package Immutable
├─ Package Data
├─ Knowledge
└─ Asset / Add-on

Player Local / Non-authoritative
├─ Local UI State
├─ Message-local UI State
└─ Player Preference State

Session Authority
├─ World State
├─ Session Application State
└─ Activity settlement

Player Continuity Authority
└─ cross-Session gameplay facts

Shared Authority
├─ Shared Session
└─ Realm Domain

Host Runtime Projection
├─ Operation
├─ Presence
├─ Environment
└─ Diagnostics
```

与上述 authority 正交：

```text
Exposure / Perspective
Model Tasks
Temporal
Workflow
Presentation
```

### 0.6 P0–P9 实施阶段

#### P0 — Contract Foundation & Regression Fence

目标：

- 把 32 项能力所需的顶层名词、版本边界、资源引用与 capability vocabulary 落到现有 Native contract；
- 明确哪些是新 schema/version，哪些复用现有 contract；
- 建立拒绝 Legacy authority / arbitrary executable / unknown capability 的回归护栏；
- 不做大规模 UI 产品行为。

重点现有地基：

- `src/native/authoring-contracts.js`
- `src/native/runtime-descriptor.js`
- `src/native/session-core.js`
- `public/scripts/native/session-runtime.js`
- `public/scripts/native/experience/index.js`
- `tests/native/authoring-contracts.test.js`
- 现有 A0–A4 hard-cut / runtime guards

阶段完成条件：

- 新 contract 可被 fixture 表达；
- old v1 Package 行为保持；
- 新字段 strict validation；
- 没有第二套 Session / World persistence。

#### P1 — Component v2 / Form / Local State / Action / Opening Foundation

覆盖：

- #1 / #2 / #3 / #4 / #6 / #7 / #8；
- #14 的基础 Opening / Wizard；
- Form validation 的 `allowed / advisory / confirm_required / blocked`；
- Host-owned Collection View 基础；
- Native Composer action。

重点：

- Component Model v2 与 v1 明确版本隔离；
- UI state 不产生 World Revision；
- Form submit / Action 最终仍进入 typed authority；
- 不允许 Expression / Template 产生副作用。

#### P2 — Message Projection / Conversation / Branch Presentation

覆盖：

- #9 / #11 / #15；
- #16 的 presentation/thread 基础；
- Message-local UI；
- Actionable Message Attachment；
- Narrative Presentation Profile；
- Branch Graph / Reply Variant 产品 facade。

重点：

- immutable Variant；
- canonical narrative 与 projection 分离；
- historical action 默认只读或显式 fork；
- render receipt 与 authority / model delivery receipt 分开。

#### P3 — Turn / Model Task / Auxiliary Operation Runtime

覆盖：

- #10 / #12 / #24 / #27；
- Task Variant；
- Task Binding Slot / Model Execution Lane；
- Result Authority / Sink Policy；
- Proposal Artifact；
- Scoped Operation / streaming / retry / stale / cancel；
- Host scheduler / backpressure。

重点：

- Package Task semantic ≠ Runtime role ≠ Model binding；
- Narrator Draft 在 narrative-outcome finalize 前是 provisional；
- Interpreter 只产生 semantic outcome proposal，不能变成变量 patch 模型。

#### P4 — Session Application / Temporal / Automation / Experience Workflow

覆盖：

- #13 / #28 / #29 / #32；
- #14 的完整 lifecycle integration；
- Experience Ready Barrier；
- Scope Lifecycle；
- Scheduled Interaction；
- retention / compaction policy；
- World Process catch-up。

重点：

- `session.loaded != experience.ready`；
- World Clock、logical revision time、wall clock、activity elapsed time分离；
- simple Quest Workflow 仍可编译成 shorthand；
- 跨 Turn 的 Application lifecycle 才使用 Experience Workflow / Phase Graph。

#### P5 — Activity / Media / Scene / Asset / Host Capability

覆盖：

- #17 / #18 / #21 / #22 / #23；
- typed Scene Cue IR；
- Activity Outcome → Narrative Handoff；
- Asset Pack / heavy delivery；
- Speech / Actor Voice；
- Fullscreen / focus / gamepad / responsive capability negotiation。

重点：

- Activity settlement 先 commit facts，再给 Narrator 已提交 Observation；
- Model 不输出 HTML / CSS / JS scene；
- Scene/Media 只引用 exact AssetRef / Attachment。

#### P6 — Data Projection / Perspective / Scoped Information / Narrative Rollup

覆盖：

- #5 / #26；
- #16 的 Context / Perspective 深化；
- bounded graph query；
- Actor availability；
- Hierarchical Narrative Rollup；
- Open Loop 与 Memory 分离。

重点：

- World Truth 与 Actor Belief 分离；
- Perspective 是 projection，不是 NPC World clone；
- Rollup 是 derived recall artifact，不替代 authority；
- player-only / presentation-only 数据不自动进入 Prompt。

#### P7 — Add-on / Community Contract / Player Continuity / Cross-Authority Transfer

覆盖：

- #25 / #30；
- exact Add-on composition；
- typed shareable resource；
- Player Continuity revision graph；
- Cross-Authority Transfer Intent / Receipt / Saga。

重点：

- Session Branch restore 不能复制已 externalize 的资产；
- Add-on 不 patch Base Package source；
- Community payload install 时重新 validate / sanitize；
- Player Continuity 可 local-first，云同步不是 Package 前提。

#### P8 — Shared Session & Realm Runtime

覆盖：

- #31；
- participant identity / ACL；
- shared turn；
- presence；
- late join / reconnect；
- Snapshot + Cursor；
- Scene Scope / split party；
- deterministic shared rule / RNG；
- Realm domain；
- Session / Player / Realm cross-authority transaction。

重点：

- host 是 participant capability role，不是 `publishArbitraryWorldSnapshot` API；
- one truth, many perspectives；
- Package 不直接拥有 WebSocket / auth token / Secret。

P8 实施决策（2026-09-27）：

- v1 使用现有 authenticated local accounts 与单一协调 Host；每 owner/Package family 对应一个独立 Realm revision graph。Shared ACL 使用现有 Native resource engine 持久化，不能随 Session Branch 回滚。
- Shared Turn v1 冻结已声明席位/Scene Scope，采用 all-required、submit-once、显式 Host commit/cancel；规则复用 typed lifecycle Command/Event/Reducer，可声明 Host-owned deterministic dice argument。自动 deadline/AFK skip、替换输入和模型共享裁决不在本次实现 contract 内。
- Snapshot+Cursor 使用 authenticated HTTP pull/heartbeat；Presence 不进入 World/Session authority；变化时返回 bounded granted projection snapshot 和最近 receipt projection，不回放权威副作用。Host 控制刷新，Package 不持有网络或身份凭证。
- Realm 复用 P7 revision repository 和 Transfer Saga 的适配入口，保持独立资源/marker/ledger。跨域矩阵实现 Session↔Player 与 Session↔Realm；Session transfer endpoints 不重叠，不声称直接 Player↔Realm asset exchange 或三 ledger 原子事务。未来直接交换必须另行设计 lineage/reservation adapter，禁止通过共享 authority 绕过已有 ownership 防线。
- Participant Realm Commands 仅限显式授权的 typed Command，记录身份由 Host 派生；Realm/display 数据仍不自动进 Context。多 Scene 使用同一 Session Truth，现有 loader/v2 renderer 承接 Shared Host mount。
- 本决策明确 v1 可执行边界，不把历史案例中的完整公会/市场/竞技场、动态大厅、Host election、分布式协调自动计为已实现。P9 承接 visual authoring、产品绑定与最终验证；详见 `feat/native-experience-p8-completed.md`。

#### P9 — Studio / Health / Productization / Final Integration

覆盖：

- #19 / #20；
- capability negotiation UI；
- visual authoring；
- Scenario Simulation / Test Bench；
- Health / Repair / Migration；
- full Experience diagnostics；
- author preview；
- end-to-end integration of P0–P8。

最终阶段才做：

- 跨阶段 broad regression；
- final docs cleanup；
- `main` merge；
- integrated verification；
- delete temporary branch。

**P9 已实施的具体边界（2026-09-27）：**

- `studio-authoring@2` 与 `experience-health@1` 按实际实现启用。Studio 在同一编辑器中显式区分 v1/v2，沿用既有 ChangeSet Review/Commit；v2 支持视图、组件树、字段/绑定及声明文档编辑，沿用生产编译器与 renderer，不新增作者执行沙箱。
- Author preview 绑定已编译归档的 exact UI，而非后来变化的 Source；可交互 Local UI State，隔离真实 Session/World、私有 Native conversation/composer 与持久化。Scene 在无有效 Session Scope 时显示明确占位，不声称完成真实媒体播放验证。
- Scenario v1 是最多 64 步的封闭 fixture 协议，使用临时 FS Engine、真实 PackageInstaller/SessionCore/SharedAuthority、实际 Command/Task result/SavePoint/Restore。录制或 mock Task 结果走既有事实与 prose 边界；不连接 provider，不引入第二个 scheduler。支持断言与预期失败，失败停止；测试账本与用户 Player/Realm/Save 完全隔离。真实设备、付费模型与长时多机网络不在该证据内。
- Health 只读诊断、能力/Task binding 预检复用现有权威。Repair 仅接受 retention compaction、prepared Player/Realm transfer resume、Session 发布前 cancellation；必须先显示 diff，再显式确认，重新验证 Session/Branch/package/Player/Realm anchors，并调用既有 typed Command/Saga。无 raw state patch 或撤销外部历史。
- Migration 实施为明确审阅、无损的静态 UI v1→v2 ChangeSet。动态 binding/action/appearance/input 的语义迁移需作者显式修改，拒绝隐式转换。Session/Player/Realm schema 继续 exact-version-pinned；没有安全版本化 adapter 时只诊断并拒绝替换，不提供通用自动迁移器。
- P8 产品绑定使用固定席位 Host 面板：共享启用、认证账户连接、成员授权、显式 heartbeat/refresh、Host open/commit/cancel、参与者按声明 schema 提交。角色、all-required/submit-once、ACL/scope epochs、独立 Realm 与两条分离 Saga 保持不变；没有动态大厅、自动超时或 direct Player↔Realm 交换。远程 mount 显式隔离 Native slots，不能回退到本地私有 DOM。
- P0–P8 纳入 broad unit regression，P9 增加真实浏览器桌面/窄屏与 Health/Shared 完整交互；细节与最终集成状态以 `feat/native-experience-p9-completed.md` 为准。

### 0.7 阶段执行与验证规则

本任务验收覆盖 targeted unit / contract / regression、changed-area lint / syntax / guard，必要时增加相邻集成检查；P9 覆盖与最终集成范围相称的回归。通用验证与执行方式见 [Governance §12](../../../README.md#12-execution-adapters)。

### 0.8 明确非目标

本任务不做：

- SillyTavern / MVU 自动迁移体系；
- 让旧卡原样运行的兼容运行时；
- `triggerSlash` Native API；
- arbitrary `world.patch` / `session.patch`；
- Regex HTML UI；
- Package JS / arbitrary iframe / remote executable HTML；
- DOM/localStorage/IndexedDB hack；
- Package-controlled arbitrary network；
- mutable swipe/message authority；
- 为每个 Package Model Task 增加新的平台 runtime role；
- 以 Full 模式作为“解锁高级能力”的方式；
- 未经当前阶段需要主动同步 `vanilla` / `luker`。

### 0.9 实施中的设计变更规则

v2.3 不是不可修改的教条。

Codex 在实施中如果发现：

- 当前 `main` 已有能力可复用；
- contract 与实际代码存在冲突；
- 某项设计会形成第二套 authority / persistence；
- 某阶段拆分导致明显返工；
- 测试证明设计假设错误；

应先以当前代码和不变量为依据修正方案，再继续实现，并把**实质性**变化回写本文件。

禁止为了保持文档表面一致而维护错误架构。

---

## 一、背景与问题

Atria 当前已经存在 `text / component / hybrid / full` Experience contract，并且 Component / Hybrid / Full 共用声明式 Component Model。现有代码已经能够：

- 在语义 surface 挂载 Component；
- 在 Hybrid / Full 中复用 Native Conversation 与 Composer；
- 使用 selector 读取 Native World State；
- 通过声明式 Command / Reducer / Rule 操作 Native Game Runtime；
- 使用 Full Host 接管视觉 Stage；
- 从 MVU/LoreState 等兼容 Provider 读取外部状态。

但当前 Experience UI 能力仍然非常基础。Component Model v1 目前主要只有：

- `container`
- `text`
- `button`
- `input`
- `native-slot`

绑定主要只有：

- `text`
- `value`
- `hidden`

交互动作主要是：

- 点击按钮；
- 向一个 Command 发送静态 JSON args；
- dispatch / simulate。

这导致三个 Experience 模式目前更像不同的“挂载范围”，尚未成为足够完整的角色卡 / 游戏前端平台。

在以 SillyTavern 高阶角色卡作为 Capability Benchmark / Pressure Test 时，问题已经暴露：一个典型的“自定义开局表单 → 收集多个输入 → 组合 Prompt → 写入 Composer → 自动发送”的旧生态交互，当前 Native Component Model 无法直接表达。类似缺口也会继续出现在 MVU 状态栏、消息内快速回复、正文后状态卡、动态表单、分步向导等场景。

因此本任务目标不是迁移或兼容单张角色卡，而是从多个优秀案例中抽象真实产品能力，进一步深化 Atria 的 Experience 模式，并用 Atria 自己的统一 Native contract 实现这些能力。

---

## 二、总目标

建立一套共享的 Native Experience Capability Layer，使：

- **Component / Hybrid / Full 的区别只在“界面布局所有权”**
- 三种模式共享完整的表单、局部 UI 状态、动态表达式、Composer、Message Projection、Action 等基础能力
- SillyTavern / MVU 的常见前端玩法可以被 Native 化，而不是继续依赖 Regex HTML / 任意 JavaScript / Slash Command
- Atria 原生 World State、Event Journal、Command、Reducer、Rule、Knowledge、Session Revision 继续作为权威运行时
- 旧 MVU / LoreState 可以作为兼容 Provider 被读取，但新 Native Package 不再以它们作为核心状态权威

最终不应出现：

> “因为 Component 做不了表单，所以必须升级成 Full。”

也不应出现：

> “为了兼容 SillyTavern 的 /send 和 Regex HTML，在 Atria 再造一层 triggerSlash / HTML Regex。”

---

## 三、核心原则（当前已达成的讨论结论）

### 3.1 模式是布局所有权，不是能力等级

`component < hybrid < full` 不应被理解成能力逐级增加。

三种模式应共享同一套能力层，差异只在 Package 对界面的控制范围。

### 3.2 Shared Capability Layer

Component / Hybrid / Full 应共享：

- UI primitives
- Form
- Local UI State
- Selector / Expression / Template
- Action
- Native Composer
- Message Projection
- Surface / Modal / Drawer
- Responsive behavior
- Accessibility
- Native World / Session State integration

### 3.3 MVU / 重前端案例的 Native 抽象方向

这里的箭头表示“能力抽象”，不是数据迁移或兼容映射。目标是：

```text
MVU stat_data / variables
        ↓
Native World / Session State

Regex HTML / MVU Frontend
        ↓
Native Component / Message Projection
```

MVU Provider 即使存在，也只属于 legacy compatibility bridge；本企划的案例审计不以迁移旧卡为目标，新 Atria Package 不以 MVU / Tavern Helper / Regex HTML 作为核心权威或运行接口。

---
