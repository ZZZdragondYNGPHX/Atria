# Atria Native Experience Modes & Capability Deepening — Case Study 05 — 肉身布教计划

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 二十八、案例压力测试 05 — 《废材教主的肉身布教计划 ～ 目标是三亿元！》v1.1

### 28.1 样本定位

本轮样本为用户上传的 SillyTavern Character Card v3：

- Character：`废材教主的肉身布教计划 ～ 目标是三亿元！`
- card version：`v1.1`
- Worldbook：`TTK v1.1`
- Character Book entry：38 条
- `extensions.tavern_helper.scripts`：空
- Tavern Helper variables：空

这意味着它与《银麒赎世》那类“脚本全部塞进卡里”的重前端不同。

开场消息本身只是 bootstrap：

```text
<script>
  $('body').load('https://files.yuzuki-rii.xyz/ttk/v1.1.html')
</script>
```

也就是：

> **Card 负责 Model / Prompt protocol，真正的前端 Application 从外部 HTML 加载。**

本次审计环境无法取得该远程 `v1.1.html` 的实际内容，因此本轮只对**卡内可验证的 Prompt / Model Task / lifecycle contract**形成正式结论，不对未读取的远程 DOM/UI 实现作猜测。

这本身也再次验证 #23：

> Native Experience 的 Runtime UI / Asset 必须是 exact Package / Asset Pack dependency，不能依赖会在运行时变化的远程 HTML / script。

### 28.2 这张 Card 本质上是一份“多 Model Task 游戏协议”

Card 使用大量语义 TAG 选择不同 Worldbook 模块。

主要 mode 包括：

```text
MODE_START_GAME
MODE_MORNING
MODE_PLAN
MODE_STORY
MODE_GAL
MODE_SMS_REPLY
MODE_TWITTER
MODE_ITEM
MODE_NIGHT
MODE_COMPRESS_STORY
MODE_COMPRESS_DAY
```

并另有：

- `SYSTEM_BASE`；
- 多个 `ROLE_*`；
- event mode；
- shared world rules。

真正值得吸收的不是：

> “Worldbook 用 TAG 激活”。

而是：

> **同一个 Experience 有一组职责完全不同、输入/输出 schema 不同、生命周期位置不同的 Model Task，并由应用状态决定当前应该调用哪一个。**

这一点继续强验证 #27 Package Model Task。

### 28.3 Card 已经形成完整“游戏日”应用生命周期

从 card-side contract 可以恢复出大致生命周期：

```text
Start Game
→ Morning Report
→ Daily Plan
→ Story / GAL interactive segments
→ in-day SMS / Social interaction
→ Night Phase
→ Story Compression
→ Day Compression
→ next day
```

其中：

#### Start Game

模型根据玩家初始化输入生成一组 typed opening content / rule tree。

#### Morning

模型生成：

- newspaper；
- weather；
- public / official / social mail；
- typed attachments。

#### Plan

模型为多个角色生成：

- daily schedule；
- optional social post；
- optional incident；
- time anchors。

#### Story

交互剧情每轮同时输出：

- narrative；
- title / summary；
- next action suggestions；
- event / shot progress；
- elapsed game time；
- location；
- semantic state proposals。

#### GAL

和 Story 共享大部分游戏语义，但 narrative 表现改成：

- background cue；
- actor show / move / hide；
- dialogue；
- emotion / motion cue。

#### SMS / Social

模型不是只回答“现在回复什么”，还返回：

> **未来哪个游戏时间发送回复。**

#### Night

模型处理：

- end-of-day state；
- evening event plan；
- character room / scene assignment。

#### Compression

先对单 Story 做结构化压缩，再对整 Day 做更高层 rollup，并选择真正值得进入长期 memory 的信息。

这已经不是简单 Quest state machine。

### 28.4 修正 v1.3：简单 Workflow shorthand 与 Experience Workflow Runtime 必须分层

在《银麒赎世》v1.3 中，我们曾冻结：

> Quest / task workflow 不需要单独 Workflow Engine；用 Session App + Action + Task + Automation 的 authoring shorthand 即可。

这个结论对：

```text
available
→ accepted
→ reviewing
→ rewarded
```

这类**单业务对象状态机**仍然正确。

但本卡证明存在第二种更高层问题：

> **Application-level Phase Orchestration**

它需要跨越：

- Opening；
- Model Task；
- user Action / choice；
- Conversation；
- Temporal wait；
- Activity；
- Session App；
- Memory compaction；
- Runtime Automation。

因此正式新增：

> **#32 Experience Workflow / Phase Graph Runtime**

它不是另一个 authority database。

它是：

> **把多个已有 capability 按可恢复、可分支、可诊断的 phase graph 组合起来。**

### 28.5 #32 候选模型

```text
ExperienceWorkflow
├─ workflowId
├─ scope
│  ├─ session
│  ├─ world
│  ├─ scene
│  └─ activity-parent
├─ state / current nodes
├─ variables / refs
├─ nodes
│  ├─ user_gate
│  ├─ action
│  ├─ model_task
│  ├─ activity
│  ├─ wait_until
│  ├─ automation_gate
│  ├─ projection
│  ├─ rollup
│  └─ subflow
├─ transitions
│  ├─ condition
│  ├─ result mapping
│  └─ guard
├─ retry / cancel / resume policy
├─ branch policy
├─ temporal policy
└─ diagnostics
```

Workflow 自己只保存：

- 当前 phase；
- node instance refs；
- transition receipts；
- durable workflow metadata。

真正的 gameplay authority 仍在：

- World；
- Session Application；
- Activity；
- Player Continuity；
- Shared Realm。

ModelTask result 也仍然受自己的 Authority Ceiling。

所以：

> **Workflow orchestrates authority；Workflow does not become authority bypass。**

### 28.6 #32 与现有 Runtime 的边界

#### Package Turn Contract (#10)

回答：

> 一次 Narrative Turn 内部怎么执行？

例如：

```text
resolve
→ calculate
→ recall
→ narrate
→ commit
```

#### Activity Runtime (#21)

回答：

> 一个 Battle / Craft / Mini-game 子场景怎样事务化运行？

#### Runtime Automation (#13)

回答：

> 某个条件发生后为什么需要启动一个工作？

#### Auxiliary Task (#24)

回答：

> 一个后台 Task invocation 怎样排队、取消、stale、完成？

#### Experience Workflow (#32)

回答：

> **一段跨多个 Turn / Task / Activity / Human Gate 的应用流程现在走到哪里，下一步是什么？**

因此当前 `main` 固定的：

```text
submitted
→ resolving
→ calculating
→ recalling
→ orchestrating
→ narrating
→ finalized
```

是很好的 Turn Transaction phase machine，但不能代替 Package-defined Experience Workflow。

### 28.7 Workflow 必须是 persistent / branch-aware

这张 Card 的“一个游戏日”可能跨：

- 多次用户输入；
- 多个模型请求；
- 多个独立 UI；
- 很长现实时间。

因此 Workflow 不能只保存在：

- React state；
- Promise chain；
- DOM；
- 当前浏览器内存。

候选原则：

```text
Workflow transition
→ typed workflow event / receipt
→ Session Application revision
```

因此：

- reload 可恢复；
- Save / Load 可恢复；
- Branch 可以分叉 workflow；
- Retry 不会把 phase 跳两次；
- World time jump 可以重新判断 wait node；
- Studio 可以从任意 phase fixture 开始测试。

### 28.8 Story 与 GAL 暴露“Presentation Profile”，不是新的 Experience Mode

Card 中 `MODE_STORY` 与 `MODE_GAL` 很重要。

两者共享：

- event progress；
- time pass；
- state proposals；
- title / summary；
- next action。

但 Presentation 不同：

#### Story

输出 prose。

#### GAL

输出类似：

```text
@bg ...
@show ...
@move ...
@hide ...
[actor][emotion][motion] dialogue
```

所以这里不能再使用“模式”一词与：

- Component；
- Hybrid；
- Full；

混在一起。

更准确的 Native 概念是：

> **Narrative Presentation Profile / Turn Presentation Strategy**

候选：

```text
TurnPresentationProfile
├─ profileId
├─ presentation kind
│  ├─ prose
│  ├─ visual_novel
│  ├─ screenplay
│  └─ other registered native profile
├─ Model Task variant / output contract
├─ Scene / Message projection binding
└─ player/package selection policy
```

切换 Presentation Profile：

- 不提高功能等级；
- 不换 World authority；
- 不创建第二份剧情状态；
- 不复制 Command / Reducer。

### 28.9 GAL 字符串 DSL 应 Native 化为 typed Scene Cue IR

这张卡的 GAL schema 给了一个非常现实的 Scene Host pressure test。

旧实现需要模型输出字符串：

```text
@bg
@show
@move
@hide
```

Native 版不应照搬这个 parser。

#22 Native Media / Scene Host 应正式增加：

> **Scene Cue IR**

候选：

```text
SceneCue
├─ set_background
│  └─ assetRef
├─ actor_enter
│  ├─ actorRef
│  ├─ slot
│  └─ expression / pose ref
├─ actor_move
├─ actor_exit
├─ dialogue
│  ├─ speakerRef
│  ├─ displayAlias?
│  ├─ text
│  └─ expression?
├─ motion
│  └─ safe registered motion preset
└─ media / audio cue
```

模型只能：

- 选择 Package 预声明 actor / asset / expression / motion id；
- 输出 typed data。

模型不能：

- 输出 HTML；
- 输出 CSS；
- 输出 JS；
- 自定义动画代码；
- 任意 URL。

Scene Host 再把同一个 Scene Cue 投影到：

- PC；
- Mobile；
- handheld；
- accessibility / reduced-motion 环境。

### 28.10 Model Task Variant 必须与 Task semantic 分开

`STORY` / `GAL` 进一步强化第 27 项：

一个业务 Task semantic 可以拥有多个 Variant。

例如：

```text
task: narrative.turn
variants:
- prose
- visual_novel
```

两者可以拥有不同：

- Prompt Program；
- structured-output schema；
- required capability；
- presentation adapter；

但共享：

- Context target；
- authority policy；
- semantic outcome contract；
- player execution binding。

因此不能为了 GAL 再创建：

```text
runtime role = gal
runtime role = story
```

Task semantic、Task Variant、Execution Lane 必须继续分离。

### 28.11 SMS / X 暴露 Scheduled Interaction Intent

SMS reply 与 social reply 都要求模型返回：

- reply content；
- `replyAt` game day / time。

这不是普通 Model Task result。

它真正表达的是：

> **模型提出一个未来要发生的交互意图。**

Native 应将其解释成：

```text
Model Task
→ Deferred / Scheduled Interaction Proposal
→ validate
→ Temporal Schedule
→ Session App record
→ at WorldInstant:
     Runtime Automation
     → Conversation Message / Attention delivery
```

候选：

```text
ScheduledInteraction
├─ interactionId
├─ target thread / channel
├─ actorRef
├─ content artifact
├─ scheduledWorldInstant
├─ anchorRevision / provenance
├─ cancellation policy
└─ status
   ├─ scheduled
   ├─ delivered
   ├─ cancelled
   └─ stale
```

这主要深化：

- #13 Automation；
- #16 Scoped Conversation；
- #26 Perspective；
- #27 Model Task；
- #29 Temporal Runtime；
- Attention Projection / Delivery Receipt。

它不允许模型自己：

- `setTimeout`；
- 写 timer；
- 到时间自行 HTTP 回调。

### 28.12 Scheduled result 的 Branch 语义必须明确

例如：

```text
Revision 100
→ NPC 计划 Day 3 18:20 回复
→ 玩家从 Revision 90 开新 Branch
```

未来回复不能因为浏览器里留着一个 timer，就跑进新 Branch。

所以 ScheduledInteraction 必须拥有：

- Session；
- Branch；
- anchor；
- WorldInstant；
- cancellation / rebase policy。

Branch / Retry / Save restore 时由 Runtime 决定：

- keep；
- fork；
- cancel；
- stale。

### 28.13 Morning Mail 验证 Actionable Message Attachment

Morning Task 的 mail schema允许消息携带：

- resource claim；
- payment request；
- item attachment。

这说明 Message / Conversation UI 的“附件”不能只等于图片。

#9 / #16 / #7 应共同支持：

> **Actionable Message Attachment**

例如：

```text
MessageAttachment
├─ media
├─ asset
├─ claim
├─ payment_request
├─ item_offer
└─ action_ref
```

点击：

```text
attachment Action
→ Action v2
→ typed Command
→ transaction receipt
→ updated attachment projection
```

而不是：

> 点邮件里的按钮 → 直接改 money / inventory。

重复点击必须由 receipt / idempotency 防重。

### 28.14 Start Game 验证 Runtime-authored Typed Session Content

`MODE_START_GAME` 不是只让模型写开场 prose。

它会根据玩家初始化输入生成一组结构化“方向 + 节点”内容，随后成为本局长期使用的规则 / narrative configuration。

这再次验证：

> Package Data 不能承担所有内容；一部分 typed content 必须允许在 Runtime 中生成。

但它仍不需要新的顶层 authority。

这类内容应进入：

> **Session Application State 中的 runtime-authored typed artifact**

要求：

- schema 固定；
- id 由 Host 生成；
- creation provenance；
- immutable creation receipt；
- 后续修改仍走 typed Command；
- 不反写原 Package Data；
- Branch-aware。

### 28.15 两级 Compression 验证 Hierarchical Narrative Rollup

Card 不是简单“每 N 轮总结”。

它定义：

#### Story compression

提取：

- entities；
- events；
- hooks；
- state delta；
- open loops；
- evidence；
- summary。

#### Day compression

进一步提取：

- rules / numbers；
- state snapshot；
- long-term memory candidates；
- open loops；
- whole-day summary。

这说明长周期 Experience 的 Memory / Conversation 需要：

> **Hierarchical Narrative Rollup**

候选：

```text
raw Turn / Message
      ↓
Story Rollup
      ↓
Day / Chapter Rollup
      ↓
Long-term Memory candidate
```

但必须冻结：

> **Rollup 是 derived recall artifact，不是 authority replacement。**

它不能替代：

- World State；
- Event Journal；
- Session App State；
- Transaction receipt。

每一级 rollup 应保存：

- source refs / source range；
- source revision；
- provenance；
- open-loop refs；
- compression task / route snapshot；
- coverage diagnostics。

Atria 当前 Memory Graph 已存在 compression / archive 地基，因此这里不新增 #33。

### 28.16 Open Loop 应与长期 Memory 分开

Card 的 compression schema明确区分：

- memory；
- openLoops。

这个边界值得保留。

#### Memory

已经发生、长期值得召回的事实。

#### Open Loop

还未解决、未来可能触发的：

- promise；
- pending plan；
- unresolved question；
- foreshadowing；
- debt / obligation；
- scheduled intention。

Open Loop 不应该因为“压缩了”就变成已经发生的事实。

Atria 现有 Orchestrator open-note / Memory Graph 已有良好地基。

Experience-facing Context Compiler 未来应能把：

```text
Memory evidence
+
Open Loop projection
```

作为不同 lane 注入。

### 28.17 self_check 不应成为新的 Chain-of-Thought contract

多个 Model Task schema都要求：

- `thinking`；
- `self_check / critique`。

真正值得吸收的是：

> **作者希望模型在提交前做结构化质量检查。**

Native 不应要求或保存模型私有推理过程。

更干净的两种做法：

1. Model Task 输出 bounded diagnostics / checklist result；
2. 需要更高可靠性时使用独立 Reviewer / Validator Model Task。

最终：

```text
narrative
outcomes
projection
diagnostics
```

继续分离。

Diagnostics：

- 不自动进入 World；
- 不自动进入下一轮 Narrator Context；
- 可以进入 Studio / Health / trace。

### 28.18 Remote HTML bootstrap 再次强化 Dependency Closure

该 Card 当前通过远程 URL加载整个 Application。

这在 SillyTavern 生态里很实用，但 Native Atria 不应复制。

Package install 后应有：

> **Runtime Dependency Closure**

即 Experience 所需：

- UI definitions；
- assets；
- prompts；
- schemas；
- Add-ons；
- heavy resource refs；

都应在 install / preflight 时解析成 exact dependency set。

运行途中不能因为：

`v1.1.html`

远端内容被作者替换，就让同一 PackageVersion 行为变化。

允许的联网内容只能通过明确 Host capability，例如：

- Model provider；
- community registry；
- optional cloud / shared realm；
- approved external content source；

而不是 remote executable frontend。

### 28.19 本样本正式新增第 32 项

本轮没有因为：

- GAL；
- SMS；
- Morning；
- Compression；
- Item generation；

分别新增顶层能力。

真正无法继续藏在现有 31 项中的，是：

32. **Experience Workflow / Phase Graph Runtime**

因为它同时编排：

- Opening；
- Turn；
- Model Task；
- Auxiliary Task；
- Automation；
- Temporal；
- Conversation；
- Activity；
- Session Application；
- Memory Rollup。

与 Temporal Runtime 类似，它已经成为多个能力共同依赖的横切 Runtime。

因此当前能力主表调整为 **32 项**：

1. Component Model v2；
2. Local UI State；
3. Player Preference State；
4. Package Data Resource；
5. Data Projection / bounded data & graph query / Scene Projection；
6. Native Composer Host capability；
7. Action v2 / Command Surface + idempotency / receipt / compensation；
8. Declarative Mutation authoring shorthand；
9. Message Projection；
10. Package Turn Contract + bounded synchronous Turn Stage；
11. Turn Envelope；
12. narrative-outcome policy；
13. Runtime Automation / World Process Recipe；
14. Opening Phase / Variant + conditional Wizard；
15. Reply Variant / Branch Graph facade；
16. Conversation Presentation + Scoped Conversation Thread；
17. Host advanced presentation/input + capability negotiation；
18. Safe Appearance / Motion / Media / Speech Presentation；
19. Studio visual authoring v2 + Scenario Simulation / Test Bench；
20. Experience Health / Diagnostics / Repair / Migration；
21. Activity Runtime / Transactional Subscene + Outcome Narrative Handoff；
22. Native Media / Scene Host + typed Scene Cue IR；
23. Immutable Asset Pack / Heavy Resource Delivery；
24. Auxiliary Task / Background Model Job Runtime；
25. Native Add-on / Content Extension + Community Registry；
26. Epistemic / Actor Perspective Projection；
27. Package Model Task / Generation Task Contract + Proposal Artifact / Task Variant；
28. Typed Session Application State / workflow & thread domains + Scope Lifecycle；
29. Temporal Runtime / World Clock & Schedule；
30. Player Continuity State / Account Authority Domain；
31. Shared Session & Realm Runtime / Multi-participant Authority；
32. **Experience Workflow / Phase Graph Runtime**。

### 28.20 本样本的核心启发

这张 Card 最值得吸收的不是：

> 它能切 STORY / GAL / SMS / X。

真正的平台启发是：

> **大型 LLM Game 不只有“一个 Turn pipeline”，还会有一条跨 Turn 的 Application pipeline。**

当前 Atria 已经开始拥有：

- typed Turn；
- Activity；
- Session App；
- Model Task；
- Temporal；
- Automation。

下一步必须确保作者可以把这些 primitive 组合成：

> **可恢复、可分支、可测试的长期 Experience Workflow。**

否则作者最终仍会在 Package 外自己重写：

- phase flag；
- Promise chain；
- timer；
- DOM router；
- localStorage；
- “今天已经跑到哪一步”的私有状态机。

这正是本轮应该从重前端旧生态里吸收、而不是照搬的精华。
