# Atria Native Experience Modes & Capability Deepening — Case Study 03B — 银麒赎世

> Continuation of Case 03; split only to control reading size.

### 26.19 文生图也应走 Model Task / Media capability

本样本大量使用可选 image generation：

- chat image；
- forum image；
- surveillance；
- moment；
- live cover；
- narrative illustration。

产品能力值得保留，但不能变成：

`Package fetch image API`

未来应归入 Model Task / Media capability：

```text
Package emits typed Media Task
→ player-owned media-capable Route / Provider
→ Host executes
→ result stored as Session Attachment / AssetRef
→ Message Projection / Scene Host renders
```

Package 只能接触：

- typed request；
- task result ref；
- media metadata。

不能接触：

- provider credential；
- arbitrary remote URL；
- raw network API。

### 26.20 本样本没有证明需要“任意网络 API”

《银麒赎世》的 phoneAPI 各通道之所以直接保存 URL / Key / Model，是因为旧宿主没有统一 Model Runtime。

Atria 已有：

- Connection；
- Model；
- Runtime Route；
- Secret Store；
- Prompt / Generation exact resource；
- Provider normalization。

因此本轮反而进一步确认：

> **Native Package 不应因为重型卡需要多 AI，就获得 arbitrary network permission 作为默认解法。**

如果某类能力可以通过 Host-owned Model Task 实现，就不应退回 Package 自己发 HTTP。

### 26.21 本样本对能力主表的调整

经过《银麒赎世》压力测试：

- 第 13 项 Runtime Automation → 深化为 Runtime Automation / World Process Recipe；
- 第 20 项 Experience diagnostics → 深化为 Health / Diagnostics / Repair / Migration；
- 第 24 项 Auxiliary Task → 补 Revision anchor / stale-result / CAS apply；
- Host capability negotiation → 增加 player-visible requirement / degraded / remediation；
- Context Compiler → 增加 Task-level Context Source Policy；
- 新增 Epistemic / Actor Perspective Projection；
- 新增 Package Model Task / Generation Task Contract；
- 新增 Typed Session Application State。

因此当前主表由 25 项调整为 **28 项**：

1. Component Model v2；
2. Local UI State；
3. Player Preference State；
4. Package Data Resource；
5. Data Projection；
6. Native Composer Host capability；
7. Action v2 / Command Surface；
8. Declarative Mutation authoring shorthand；
9. Message Projection；
10. Package Turn Contract + bounded synchronous Turn Stage；
11. Turn Envelope；
12. narrative-outcome policy；
13. Runtime Automation / World Process Recipe；
14. Opening Phase / Variant + conditional Wizard；
15. Reply Variant / Branch facade；
16. Conversation feed/latest/reader；
17. Host advanced presentation/input + capability negotiation；
18. Safe Appearance / Motion / Media Presentation；
19. Studio visual authoring v2 deepening；
20. Experience Health / Diagnostics / Repair / Migration；
21. Activity Runtime / Transactional Subscene + Outcome Narrative Handoff；
22. Native Media / Scene Host；
23. Immutable Asset Pack / Heavy Resource Delivery；
24. Auxiliary Task / Background Model Job Runtime；
25. Native Add-on / Content Extension Layer；
26. **Epistemic / Actor Perspective Projection**；
27. **Package Model Task / Generation Task Contract**；
28. **Typed Session Application State / workflow & thread domains**。

这 28 项仍然不是冻结答案。

### 26.22 当前 Capability Layer 的结构开始变得更清楚

三个重型样本之后，Atria Native Experience 不再适合被理解成：

```text
Component Model
+ World State
+ LLM
```

更合理的结构已经变成：

```text
Presentation
├─ Component / View
├─ Message Projection
├─ Scene / Media
└─ Host

Interaction
├─ Composer
├─ Action
└─ Activity

Authority
├─ World State
├─ Session Application State
├─ Event Journal
└─ Revision / Branch

Intelligence
├─ Turn Contract
├─ Model Task
├─ Auxiliary Task
├─ Runtime Automation / World Process
└─ Context Compiler

Information
├─ Knowledge
├─ Memory
├─ Epistemic / Perspective
└─ Data Projection

Distribution
├─ Package
├─ Add-on
└─ Asset Pack

Tooling
├─ Studio
└─ Health / Diagnostics / Repair
```

这个结构比按“酒馆插件功能”逐个迁移更稳定。

### 26.23 《银麒赎世》的核心启发

这张卡最值得吸收的不是它有：

- 手机；
- 论坛；
- 直播；
- 据点；
- N 个 API。

而是它已经在旧生态里撞到了三个真正的平台问题：

1. **复杂应用需要持久的非 World Application State。**
2. **不同 AI 工作需要不同 Task Contract 和 Context。**
3. **多人 / 多视角世界必须区分 World Truth 与 Actor Knowledge。**

这三项不能只靠“更大的 UI”和“更多 World 变量”解决。

因此本轮新增的 26–28 三项，比增加几十个具体 Widget 更有长期价值。

### 26.24 反向压缩：手机聊天 / Workflow / Social Graph 不再新增第 29 项

继续拆完该卡后，本轮没有继续把能力表膨胀到 29+。

#### 二级私聊 / 群聊

它们不是新的顶层 Runtime。

应扩展第 16 项：

> **Conversation Presentation + Scoped Conversation Thread**

候选 thread contract：

```text
ConversationThread
├─ threadId
├─ domainId
├─ participants
├─ perspective policy
├─ message records
├─ unread / cursor
├─ attachment refs
├─ retry / fork policy
└─ context policy
```

边界：

- 主 Narrative Timeline 仍然只有 Native SessionCore 可以拥有；
- Package 不能把 phone thread 冒充主 Timeline；
- scoped thread 属于 Session Application State；
- thread 内 retry / truncate / regenerate 应形成该 domain 自己的 immutable revisioned command，而不是 mutable array splice；
- Model Task 可以以 `thread + actor perspective` 为 Context target。

这样可以承载：

- phone DM；
- group chat；
- terminal log；
- NPC mail；
- radio channel；
- party chat；
- in-world forum reply thread。

不需要第 29 项。

#### Task / Quest Workflow

该卡的：

`available → accepted → core_complete → reviewing → rewarded / cancelled`

以及：

- cancel review；
- retry；
- reward；
- chain；
- mode lock；

也不需要独立 Workflow Engine。

建议提供：

> **Workflow Definition authoring shorthand**

它编译为：

```text
Session Application State
+ Action v2
+ Auxiliary Task
+ Runtime Automation
+ typed Command/Event
```

Workflow 可以有：

- named states；
- allowed transitions；
- transition guards；
- async gate；
- completion effect；
- timeout/cancel policy。

但最终 authority 仍是 Session Application Domain，不建立第二套 workflow persistence。

#### Relationship / Social Graph

关系网、好友圈、群成员、共同经历、谁认识谁，进一步验证了第 5 项不能只有简单 selector。

Data Projection 应支持一组**有界、确定性的 query primitive**：

- filter；
- sort；
- group；
- lookup；
- join；
- aggregate；
- neighbors；
- bounded traversal；
- reachable；
- shortest-path（有明确上限时）。

输入可来自：

- Package Data；
- World State；
- Session Application State；
- Epistemic records。

不允许：

- arbitrary SQL；
- arbitrary JS predicate；
- unbounded graph traversal。

因此 Social Graph 归入：

> **Data Projection / bounded data & graph query**

也不新增第 29 项。

### 26.25 Cross-domain Atomic Commit 是底层规则，不是新能力编号

《银麒赎世》的任务评价、据点同步、战斗结算等经常需要同时改变：

- World State；
- Session Application State；
- Event Journal；
- Timeline / observation。

如果它们分别 commit，会重新出现旧卡常见的“双源撕裂”。

当前 Atria `SessionCore.applyRuntimeCommit()` 已能在一个 Revision 中同时：

- append Timeline；
- patch 多个 Session namespace；
- CAS against expected Revision。

因此实现阶段应把这项能力提升为共享规则：

> **所有跨 Session-authoritative domain 的一次逻辑事务，必须尽可能在同一个 Native Revision Commit 中原子发布。**

例如：

```text
Quest Evaluation Result
→ validate
→ {
     World: reward +100
     SessionApp: quest = completed
     Journal: quest.completed
     Observation: reward summary
   }
→ one Revision commit
```

这不是新的裸 patch API。

Package 仍然只调用 typed Action / Command / Task result apply；Runtime 负责组装 transaction。

### 26.26 当前反向压缩后的结论

经过继续审计，本样本最终只新增 3 个顶层候选：

- 26 Epistemic / Actor Perspective Projection；
- 27 Package Model Task / Generation Task Contract；
- 28 Typed Session Application State。

其余复杂能力都可以合理吸收到已有 primitive：

- 二级聊天 → 16 + 28；
- Workflow → 7 + 13 + 24 + 28；
- Social Graph → 5 + 26 + 28；
- World Dynamics → 13 + 24 + 27；
- 文生图 → 18 + 22 + 27；
- 配置体检 → 20；
- 删楼 / swipe 防重复结算 → Revision / Branch + atomic commit；
- 多账号 → 26 + 28。

这说明当前能力表开始出现可组合性，而不是“每来一个新玩法就新增一个平台 API”。

### 26.27 作者侧压力测试：Studio 不能只做可视化编辑

《银麒赎世》的开发过程本身也是一个重要 benchmark。

该项目已经建立：

- 大量单元测试；
- build artifact 正向 / 负向 marker；
- 编译门禁；
- prompt payload 拦截；
- 多轮实机 smoke；
- schema / hot-update / conflict guard；
- 多种设备与运行配置检查。

这说明复杂 Native Experience 的作者真正需要的不是：

> “拖几个组件出来看看”。

而是：

> **在发布前可重复验证整个 Experience contract。**

当前 Atria `main` 已有：

- Studio Structured UI editor / Native Preview；
- Prompt `/preview`；
- Effective Request Snapshot；
- ContextPlan / token / capability diagnostics；
- Command `simulate`；
- Build validation。

这些是很好的地基，但还没有一等的 Package-level scenario test workflow。

因此第 19 项应正式扩展为：

> **Studio Visual Authoring + Scenario Simulation / Test Bench**

候选测试用例：

```text
ExperienceScenario
├─ scenarioId
├─ package revision
├─ entry point
├─ initial World / Session fixtures
├─ opening selections
├─ environment fixture
│  ├─ viewport
│  ├─ touch / keyboard / gamepad
│  ├─ reduced motion
│  └─ host capabilities
├─ deterministic RNG seed
├─ clock / world-time fixture
├─ scripted actions / user inputs
├─ model task mode
│  ├─ mock
│  ├─ recorded
│  └─ live preview
├─ expected assertions
└─ capture policy
```

Studio 应能逐步执行并检查：

- Opening Wizard 分支是否可达；
- Action availability / disabled reason；
- Command simulation；
- Activity start / cancel / settlement；
- Session Application workflow transition；
- World Process tick / catch-up；
- Auxiliary Task stale policy；
- Epistemic actor context；
- Message Projection schema；
- Conversation thread；
- responsive / host capability fallback；
- exact Prompt / ContextPlan；
- token budget；
- Health / Diagnostics。

### 26.28 测试必须复用生产 Runtime，而不是 Studio 特制解释器

冻结原则：

> **Preview / Test Bench 与真实 Play 必须走同一套 compiler / validator / reducer / projection contract。**

允许 mock：

- Model Task output；
- wall clock；
- RNG；
- Host environment；
- external capability availability。

不允许 mock 成另一套语义：

- Studio-only selector；
- Studio-only Action；
- Studio-only reducer；
- Studio-only Message Projection parser。

否则会重新出现：

> “Studio 预览能跑，安装后的 Package 不能跑”。

### 26.29 Experience Assertions 应是声明式的

Package / Studio scenario 可以声明：

```text
after action "equip"
expect:
- world.player.equipment.main == "sword-01"
- event "equipment.changed" emitted once
- sessionApp.inventoryView.selection unchanged
- no unauthorized namespace write
```

常见 assertion primitive：

- state path equals / matches schema；
- Event emitted / not emitted；
- Action available / denied；
- Revision advanced exactly once；
- Projection block valid；
- Model Task output accepted / rejected；
- token budget under threshold；
- expected capability fallback selected；
- diagnostic code present / absent。

不能让 Package test fixture 执行 arbitrary JS assertion。

### 26.30 Golden UI 只做辅助证据

重前端当然需要：

- PC；
- Mobile；
- Handheld；
- light/dark；
- safe-area；
- reduced-motion；

的视觉预览。

但 screenshot/golden 不应成为唯一测试。

优先级应为：

1. typed structural assertion；
2. runtime semantic assertion；
3. accessibility/layout diagnostics；
4. screenshot / visual review。

这样 Studio 测试才不依赖“像不像某张旧卡”。

### 26.31 Authoring Test Bench 与 Experience Health 共用诊断语言

测试失败和玩家运行失败应使用同一 diagnostics vocabulary。

例如：

```text
action.command.validation_failed
model_task.route_missing
context.budget.hard_reserve_overflow
activity.settlement.rejected
session_app.schema_mismatch
perspective.source_stale
asset_pack.required_missing
host.scene3d.unavailable
```

Studio 可以：

- 在测试里 assert diagnostic；
- 跳到对应 authoring owner；
- 给出修复位置。

Player Runtime 则：

- 显示用户可理解状态；
- 提供 Host-owned remediation。

这样第 19 与第 20 项不会成为两套工具链。

### 26.32 本轮仍不新增第 29 项

Scenario Test Bench 是 Authoring / Studio 的深化，不是新的 Runtime authority。

因此最新主表仍保持 28 项，只将第 19 项更新为：

> **Studio visual authoring v2 + Scenario Simulation / Test Bench**

这也是本轮对《银麒赎世》作者侧能力的主要吸收结果。

### 26.33 Action v2 继续深化：Idempotency / Transaction Receipt / Compensation

《银麒赎世》还有一类反复出现的体验：

- 批量购买后短时间撤回；
- 任务审核中取消；
- 已应用结果需要安全回滚；
- 战斗重打返还本场消耗；
- 用户双击不能重复扣费；
- 网络 retry 不能重复发奖；
- swipe / retry 不能重复入账。

这说明 Action v2 不能只回答：

> “按钮能不能点？”

还必须回答：

> “这次动作是不是已经执行过、执行了什么、还能不能撤销？”

因此 Action v2 增加：

```text
Action Request
├─ actionId
├─ args
├─ expectedRevisionId
└─ idempotencyKey

        ↓

Action Receipt
├─ receiptId
├─ actionId
├─ status
├─ baseRevisionId
├─ committedRevisionId
├─ eventRefs
├─ result
├─ idempotencyKey
└─ undo capability
```

#### Idempotency

Host 必须能阻止：

- double tap；
- retry after timeout；
- repeated callback；
- same auxiliary result applied twice。

Package 可以声明 idempotency scope，例如：

- request；
- revision；
- semantic key。

但 Package 不能自己维护全局 `alreadyProcessedIds` localStorage 集合。

#### Undo / Compensation

“撤销”不能等于开放 arbitrary rollback。

应区分：

1. **cancel-before-commit**
   - 例如 Auxiliary Task 还在审核；
   - 直接取消任务，不产生 authority mutation。

2. **retry-from-pre-activity**
   - 例如战斗重打；
   - Activity 自己持有 transaction boundary；
   - settlement 未接受前可 discard/restart。

3. **compensating command**
   - 已经提交购买/奖励；
   - 通过预声明 typed compensator 产生反向业务事件；
   - 例如 `shop.refund_purchase(receiptId)`。

4. **historical branch / restore**
   - 属于 Session / Save / Branch UX；
   - 不伪装成普通 Action undo。

推荐：

```text
purchase
→ commit
→ receipt(undoable=true)

undo(receipt)
→ validate receipt still compensatable
→ typed compensation Command
→ Event
→ Reducer
→ new Revision
```

这样历史仍不可变。

撤销不是删除旧 Event，而是产生新的补偿事实。
