# Atria Native Experience Modes & Capability Deepening — Case Study 03C — 银麒赎世

> Continuation of Case 03; split only to control reading size.

### 26.34 Cross-domain Receipt 应与单 Revision Commit 对齐

如果 Action 同时改变：

- World State；
- Session Application State；
- Event Journal；

Receipt 必须指向**同一个 committed Revision**。

不能出现：

```text
reward applied
quest still reviewing
```

或：

```text
inventory item removed
phone receipt says purchase active
```

因此 Action Receipt 也是 Experience Diagnostics 的重要证据：

- 玩家看结果；
- Studio 看 Event；
- Runtime 看 Revision；
- Undo 判断是否仍合法。

### 26.35 本轮仍不新增顶层能力

Idempotency / Receipt / Compensation 全部归入第 7 项 Action v2。

它同时被：

- UI button；
- Composer Action；
- Message Action；
- Activity settlement；
- Auxiliary Task result apply；

复用。

所以当前能力主表仍保持 **28 项**。

### 26.36 Model Task 的 Output Contract 不能等同于 Authority

继续拆《银麒赎世》的十个 phoneAPI 通道后，出现一个此前定义不够清楚的问题。

当前第 27 项已经要求每个 Model Task 有：

- input schema；
- Context policy；
- Prompt / Generation refs；
- output contract。

但：

> **output contract 只能说明“返回什么形状的数据”，不能说明“这个结果有资格改变什么”。**

例如该样本中：

- social chat 的结果应该进入某个 scoped conversation thread；
- forum / live 结果属于 Session Application content；
- task evaluation 会影响任务评级，但不应该获得任意 World write；
- outpost sync 是从 narrative 中推断 World change proposal；
- world dynamics 会提出自治世界事件；
- plot task 是任务候选，不是已发生事实；
- image generation 最终产出 Media Attachment / Asset reference。

这些结果即使全部都是合法 JSON，它们的 authority 也完全不同。

因此第 27 项必须增加：

> **Model Task Result Authority / Sink Policy**

### 26.37 Model Task Result Policy

候选：

```text
ModelTaskResultPolicy
├─ resultClass
│  ├─ advisory
│  ├─ turn_context
│  ├─ presentation
│  ├─ session_app_proposal
│  ├─ world_outcome_proposal
│  ├─ activity_proposal
│  └─ media_request
├─ outputSchema
├─ authorityCeiling
├─ resultAdapterRef
├─ commitPolicy
├─ observationPolicy
└─ diagnosticsPolicy
```

关键原则：

#### advisory

例如：

- quest quality score；
- recommendation；
- classification。

结果本身不产生 authority mutation。

调用方可以把结果交给一个 deterministic workflow / typed Command 决定是否采用。

#### turn_context

例如：

- 同步 Turn Processor 的分析结果；
- planner hint；
- recall condensation。

只存在于当前 request / Turn Context。

不能持久化成 World Truth。

#### presentation

例如：

- Message Projection data；
- UI summary；
- generated flavor text。

可以持久化到 presentation-owned domain，但没有 World write authority。

#### session_app_proposal

例如：

- forum post；
- phone message；
- generated quest candidate。

输出先经过对应 Session Application Domain 的 schema 与 typed Command。

不能直接写任意 `atri_*` namespace。

#### world_outcome_proposal

例如：

- outpost sync；
- world dynamics；
- narrative-outcome；
- semantic state interpretation。

合法路径仍然是：

```text
Model Result
→ schema validation
→ semantic proposal
→ domain validator / rule
→ typed Command / Event
→ World Reducer
```

不能得到：

`world.patch`

#### media_request

例如：

- illustration；
- avatar；
- surveillance image；
- live cover。

由 Host-owned Media capability 执行并产出：

- Attachment；
- AssetRef；
- media metadata。

模型结果不携带任意可执行 URL。

### 26.38 Authority Ceiling 必须由 Host 约束，而不是 Package 自报

Package 可以声明：

> “这个 Task 的结果是 `world_outcome_proposal`。”

但这不能等价于：

> “这个 Task 获得 World write 权限。”

Host 必须检查：

- Package 是否存在对应 typed result adapter；
- adapter 是否只映射到已注册 Command；
- output 是否通过 schema；
- 当前 Session / Revision 是否允许应用；
- 当前 Task execution class 是否允许 commit；
- 是否需要用户确认；
- 是否已经应用过；
- 是否违反 domain authority。

因此应形成：

```text
Model Task
→ Result Artifact
→ Result Adapter
→ Typed Authority Surface
→ optional Revision Commit
```

Result Adapter 也不能是 Package JavaScript。

它应该是：

- declarative mapping；
- bounded interpretation mapping；
- registered Host primitive；
- typed Command reference。

这能避免未来出现一种新的“看起来结构化、实际上还是裸 patch”的 API。

### 26.39 Model Task Result 必须带可追踪 provenance

复杂 Experience 有大量模型任务时，单纯保存最终结果不够排障。

每个可持久化 Task result 至少应能追溯：

```text
Task Result Record
├─ taskId / invocationId
├─ task definition revision
├─ execution class
├─ Session / Branch / Revision anchor
├─ ContextPlan snapshot ref/hash
├─ Runtime Route snapshot
├─ Prompt Program / Generation refs
├─ raw/normalized result hash
├─ validation outcome
├─ result class
├─ applied receipt / committedRevisionId
└─ diagnostics
```

Secret 与 provider credential 永远不进入该记录。

这使：

- Experience Diagnostics；
- Studio recorded fixture；
- stale-result analysis；
- duplicate-apply diagnosis；
- regression reproduction；

可以共享同一证据链。

### 26.40 新缺口不另编号：Host Task Scheduling / Backpressure

《银麒赎世》的真实实现还有一套很有价值的工程补丁：

- API pool；
- per-pool max concurrency；
- queue；
- short-window dedupe；
- retry / exponential backoff；
- timeout / abort；
- busy detection；
- 自动生成队列上限；
- 同一角色跨 chat / group / forum / live 的 cooldown / conflict guard。

这些不是某个具体 phone App 的能力。

它们说明：

> **当一个 Experience 拥有多个 Model Task / Auxiliary Task 后，光有“任务生命周期”还不够，还需要 Host-owned execution scheduling。**

当前 `main@4dab353a` 的 Native Generation Host 已有：

- per-route timeout；
- same-route retry；
- complete-route fallback；
- AbortSignal cancellation。

但这些仍是**单次 Generation execution**语义。

当前没有一等的 Experience-level：

- task queue；
- priority/fairness；
- backpressure；
- coalescing；
- supersede；
- global / route / connection concurrency budget。

因此第 24 / 27 项补：

> **Host Task Scheduling / Backpressure Policy**

但不新增第 29 项。

### 26.41 Task Execution Policy

候选：

```text
TaskExecutionPolicy
├─ executionClass
│  ├─ turn_blocking
│  ├─ interactive
│  ├─ background
│  └─ maintenance
├─ concurrencyClass
├─ concurrencyLimitHint
├─ queuePolicy
├─ dedupeKey
├─ coalesceKey
├─ supersedePolicy
├─ expiryPolicy
├─ retryPolicy
├─ cancellationPolicy
├─ costBudgetHint
└─ diagnosticsPolicy
```

#### Host owns the hard limits

Package 只能：

- 声明任务语义；
- 请求更保守的限制；
- 声明可否合并 / 替代。

Package 不能：

- 把自己设为无限最高优先级；
- 关闭全局限流；
- 无限并发；
- 建立自己的 Promise worker pool；
- 自己 sleep/backoff 后绕过 Host。

实际 hard limit 由玩家 / Host 决定：

- per Connection；
- per Model；
- per Provider；
- per Experience；
- total in-flight；
- token / request budget。

#### Interactive work should not be starved by background work

例如玩家主动：

- 发送消息；
- 打开需要实时模型响应的 UI；
- 提交任务评价；

不应该因为后台：

- world dynamics；
- forum generation；
- memory condensation；
- auto social；

已经排满队列而长期饿死。

因此需要 Host-defined fairness / priority class。

Package 不能自定义任意数值优先级，只能选择受控 execution class。

#### Coalesce / Supersede

很多后台 Task 不值得全部执行。

例如：

```text
world_dynamics(revision 100)
world_dynamics(revision 101)
world_dynamics(revision 102)
```

如果 100 / 101 尚未开始，而 102 已经覆盖它们：

可以：

> coalesce → 只执行最新有效工作。

同理：

- UI search query；
- preview；
- media preview；
- derived summary；

可以声明 supersede。

但：

- reward settlement；
- committed workflow transition；
- user-confirmed Action；

不能被静默 coalesce。

### 26.42 Cancellation 必须从 Session/Branch 生命周期向下传播

至少需要：

```text
user stop
session switch
branch fork
retry from earlier revision
experience exit
task superseded
dependency invalidated
```

能够取消仍未提交的 Task。

对于已经发出的 provider 请求：

- 尽力 Abort；
- 即使 provider 不合作，晚回结果仍需 anchor/stale 检查；
- cancelled Task 永远不能凭“请求已经完成”恢复写权限。

因此：

> Cancellation 与 stale-result check 是两层保护，不是二选一。

### 26.43 Actor / Channel 冲突不应变成全局 mutex API

《银麒赎世》为了避免：

- 某角色正在直播却同时自动发论坛；
- 某角色明明当面在场却又自动发私聊；
- 同一角色短时间在多个频道给出互相矛盾的内容；

实现了角色 channel lock / cooldown。

真正产品能力值得保留，但 Native 不应开放：

`lockActor("林知意")`

更合理的是：

```text
World / Activity / Session App
        ↓
Actor Availability Projection
        ↓
Task eligibility / Automation condition
        ↓
Host scheduler
```

例如：

```text
ActorAvailability(actorId, "phone.dm")
→ available / unavailable + reason
```

来源可以是：

- 当前 location / scene；
- active Activity；
- capture / death / offline status；
- Session App commitment；
- Package deterministic rule。

它是第 5 项 Data Projection、第 13 项 Automation、第 26 项 Perspective 与第 27 项 Model Task 的组合能力。

不新增单独 Actor Lock authority。

### 26.44 第 24 / 27 项的最终职责边界继续明确

经过本轮：

#### Model Task (#27)

负责：

> **模型要做什么工作、看什么 Context、输出什么 Result Artifact、结果最高拥有哪类 authority。**

#### Auxiliary Task Runtime (#24)

负责：

> **这个异步工作实例从 queued 到 completed/stale/cancelled 的生命周期。**

#### Host Task Scheduler (#24/#27 shared runtime)

负责：

> **现在能不能运行、何时运行、并发多少、是否合并/抢占/取消。**

#### Runtime Automation (#13)

负责：

> **为什么此刻需要创建这项工作。**

因此：

```text
Automation
    ↓ creates
Task Invocation
    ↓ scheduled by
Host Scheduler
    ↓ executes
Model Task
    ↓ produces
Typed Result Artifact
    ↓ authority adapter
Domain Command / Projection / Media
    ↓
Revision / presentation result
```

这条链比旧生态里每个功能自己维护：

- timer；
- queue；
- fetch；
- API key；
- retry；
- localStorage lock；

更适合平台化。

### 26.45 本轮继续不新增第 29 项

本轮发现的是两个**已有 primitive 的关键缺口**：

1. 第 27 项缺少 Result Authority / Sink Policy；
2. 第 24 / 27 项缺少 Host Task Scheduling / Backpressure。

二者都没有理由独立成为新的用户级 capability 编号。

因此能力主表仍保持 **28 项**。

### 26.46 Streaming 需要从“Narrative 特例”推广为 Scoped Operation State

Round 4 已经冻结：

- narrative draft 可以 streaming；
- projection / authoritative outcome 必须 finalize 后生效；
- authoritative outcome 不能在 streaming 中途 commit。

这个原则仍然正确。

但《银麒赎世》说明，重型 Experience 中同时存在：

- 主 Narrator streaming；
- task evaluation；
- image generation；
- world dynamics；
- outpost sync；
- forum / live generation；
- background summary；
- Action commit；
- Activity settlement。

如果 Runtime 只有一个全局：

`isGenerating = true / false`

会产生两个问题：

1. **过度阻塞**
   - 主 Narrator 在生成时，玩家只是打开背包 / 切 Tab / 看论坛，也被一起锁住。

2. **阻塞不足**
   - 某个 world-writing Task 正在 finalizing 时，另一个会修改同一 authority domain 的 Action 仍可能同时提交。

因此需要：

> **Scoped Operation State / Operation Projection**

它不是新的 authority domain，而是 Host 对正在执行工作的只读运行状态。

### 26.47 Operation Handle

候选：

```text
OperationHandle
├─ operationId
├─ kind
│  ├─ turn
│  ├─ action
│  ├─ model_task
│  ├─ auxiliary_task
│  ├─ activity
│  ├─ media
│  └─ world_process
├─ ownerRef
├─ scope / claims
├─ status
│  ├─ queued
│  ├─ running
│  ├─ streaming
│  ├─ retrying
│  ├─ waiting_confirmation
│  ├─ finalizing
│  ├─ completed
│  ├─ failed
│  ├─ cancelled
│  └─ stale
├─ progress
├─ cancellable
├─ startedAt
├─ diagnosticsRef
└─ provisionalPresentation?
```

Operation State 默认：

- Host-owned；
- read-only to Package；
- 不属于 World State；
- 不属于 Player Preference；
- 不因为 UI 关闭而被 Package 随意销毁。

对于必须跨 reload 存活的 Auxiliary Task：

- authoritative Task record 仍存 Session Application State；
- Operation Projection 只是当前 Host execution / presentation view。

### 26.48 Busy 必须按 claim / conflict scope 判断，而不是全局 boolean

Action / Task / Activity 可以声明受控的 semantic claim，例如：

```text
world:player.inventory
world:outpost:<id>
session_app:phone.thread:<id>
activity:battle:<id>
turn:current
actor:<id>
```

但 Package 不直接获得 mutex。

Host 使用这些 claim 判断：

- 是否可以并行；
- 是否需要 queue；
- 哪些 Action 暂时 unavailable；
- disabled reason 是什么。

例如：

#### Narrator streaming

可以并行：

- 切换 UI Tab；
- 查看只读 inventory；
- 修改 Local UI State；
- 调整 device-local preference。

可能不能并行：

- 另一次当前 Turn commit；
- 修改同一 Branch authoritative state 的 Action，若会让当前 Turn 的 Revision anchor 失效。

#### Image generation

通常可以与主 Narrator 并行。

如果图片绑定的是当前尚未 finalized 的 Message Projection：

- 可以生成 provisional media；
- 但最终 attachment link 要等目标 Variant 确认后再绑定。

#### Quest evaluation

可以显示：

`reviewing`

但 reward Action 在 Task result validate + commit 前保持不可用。

### 26.49 Component / Action 应读取 Operation Projection

Component Model v2 的 read-only context 不应只有：

- World；
- Session App；
- Local UI；
- Preference；
- Environment。

还需要 Host-owned：

> **Operation Projection**

例如：

```text
operation("quest-eval:123").status
operationKind("model_task").runningCount
claim("world:player.inventory").busy
action("shop.buy").availability
```

UI 因此可以原生表达：

- spinner；
- progress；
- queued；
- retrying；
- cancel；
- waiting；
- stale；
- disabled reason。

而不是每个 Package 自己维护：

- `isLoading`
- `isSubmitting`
- `isGenerating`
- `pendingFoo`
- DOM class；
- global variable。

### 26.50 Provisional Presentation 与 Committed Presentation 必须区分

Streaming UI 允许提前看，但不能伪装成已经提交。

建议：

```text
Provisional Presentation
├─ operationId
├─ transient content
├─ replaceable
├─ cancellable
└─ not addressable as committed Timeline / Session fact
```

#### 主 Narrative

```text
stream chunks
→ provisional prose
→ final response complete
→ validate Turn Contract
→ atomic Turn commit
→ committed Variant
```

如果：

- user Stop；
- provider fail；
- outcome invalid；

则 provisional prose 可以：

- discard；
- 或由 Host 提供“未提交草稿”恢复入口；

但不能自动成为正式 Timeline 事实。

#### Model Task

默认：

> 不因为 provider 能 streaming，就自动向 Package 暴露半截 JSON。

只有 Result Policy 明确允许：

- advisory preview；
- presentation text；
- progress text；

时才允许 provisional stream。

以下结果一律 finalize 后才生效：

- World outcome proposal；
- Session App mutation proposal；
- Activity settlement；
- typed quest reward；
- media attachment binding。

### 26.51 Progress Event 不是模型 Authority

对于：

- downloading asset；
- image generation；
- long context compile；
- queue wait；
- provider retry；

Host 可以产生 typed progress event：

```text
OperationProgress
├─ operationId
├─ phase
├─ current?
├─ total?
├─ messageCode?
└─ retryAfter?
```

这只是 execution telemetry / UI projection。

它不能：

- 写 World；
- 写 Session App；
- 进入 narrative truth；
- 被 Package 当成“任务已经完成”。

### 26.52 Stop / Cancel 的作用域必须明确

旧宿主常见：

> 一个 Stop 按钮 = 尽量停掉所有生成。

Native Experience 需要区分：

- stop current Narrator Turn；
- cancel one background Model Task；
- cancel an Activity before settlement；
- cancel queued work；
- cancel all Experience background work；
- exit Experience。

因此 Host action 应操作：

`operationId / operation scope`

而不是 Package 调：

`abortEverything()`

如果 user Stop 当前 Narrator：

- 与该 Turn 绑定的同步 processor 一并取消；
- 是否取消已独立运行的 Auxiliary Task 由它的 dependency policy 决定；
- unrelated media / maintenance 不必自动死亡。

### 26.53 UI 与 Generation 可以并行，但 Authority 必须串行到 Revision

这张卡经常使用“生成中闸门”，是因为旧架构无法保证：

- UI deterministic write；
- 主 AI 变量更新；
- phone API；
- metadata save；

在同一 authority graph 中一致。

Atria 的目标不应是：

> “生成时整个游戏冻结。”

而应是：

> **Presentation / Local interaction 尽量并行；冲突的 authority transaction 通过 Revision/CAS/claims 正确串行。**

因此：

```text
UI read / local state
        ───────────────→ can continue

independent Media Task
        ───────────────→ can continue

World-authoritative write A
        ──┐
          ├─ conflict / Revision CAS
World-authoritative write B
        ──┘
```

如果一个 Action 基于旧 Revision：

- simulate 可以重新执行；
- commit 必须 CAS；
- 冲突后返回 typed stale/conflict；
- 不允许 Package 静默“再写一次”。

### 26.54 当前 main 的实现基线

当前 `main@4dab353a`：

- Native Generation client 已支持 SSE chunk；
- chunk 通过 `onChunk` 给 presentation observer；
- terminal result 才返回完整 snapshot/response；
- Game UI v1 仍主要围绕 World selector 与直接 command dispatch；
- 尚无 Package-facing Operation Projection / scoped busy contract。

因此该能力不是重做 streaming transport。

真正缺口是：

> **把已有 stream transport、未来 Model Task/Auxiliary lifecycle、Action busy 与 Component availability 统一成 Host-owned Scoped Operation model。**

### 26.55 本轮仍不新增第 29 项

Scoped Operation State 是多个现有 primitive 的共同 runtime projection：

- #2 Local UI State：消费 operation 状态，但不拥有它；
- #7 Action v2：用它表达 pending / disabled / receipt；
- #10 Turn Contract：拥有 turn operation；
- #21 Activity：拥有 activity operation；
- #24 Auxiliary Task：提供持久 lifecycle；
- #27 Model Task：提供 generation operation；
- #17 Host：提供 Stop / cancel / progress surface。

因此不应新增：

> “Loading API / Busy API / Streaming API”

三个平行能力。

能力主表继续保持 **28 项**。

### 26.56 新缺口 29 — Temporal Runtime / World Clock

继续拆《银麒赎世》后，出现一个此前被 `Runtime Automation / World Process` 语法掩盖、但实际上还没有被定义的底层能力：

> **Atria 目前没有一等的 Game World Clock / Temporal Model。**

该样本大量玩法依赖：

- 世界日期 / 时刻；
- 末日倒计时；
- 每日任务刷新；
- 跨天据点日结；
- 派遣返回日；
- 事件到期；
- 多日冷却；
- NPC 状态自然回落；
- 最近若干游戏日内的信息可见性；
- 每 N 回合自动生成；
- 现实时间 UI / network timeout；
- retry / review / temporary undo window。

旧实现因此同时维护了多种“时间”：

- MVU 中的世界日期；
- 末日倒计时；
- 自己换算的 story day / D±N；
- message / turn count；
- `Date.now()`；
- `setTimeout / setInterval`；
- 各模块自己的 cooldown / lastDate / dueDay。

这也是该卡历史上反复出现：

- 跨天不触发；
- 返回日显示错误；
- cooldown 字段写方 / 读方尺度不一致；
- 跳过若干天后任务没有补跑；
- 同一状态在不同模块使用不同天尺；

这类 bug 的根本原因之一。

当前 Atria `main@4dab353a`：

- Session / Revision metadata 有现实 epoch timestamp；
- World State 可以由 Package 自己保存任意日期字段；
- Runtime Automation 草案已经提出 `clock / world-time` trigger；
- Studio Test Bench 草案已经提出 clock fixture；

但没有 canonical Temporal Runtime。

因此新增第 29 项：

> **Temporal Runtime / World Clock & Schedule**

### 26.57 必须先区分四种时间

Atria 不应该再让一个 `time` 字段同时承担所有语义。

至少区分：

#### 1. Wall Clock

现实时间。

用于：

- provider timeout；
- UI debounce；
- toast merge；
- network retry backoff；
- diagnostic timestamp。

默认**不能直接改变游戏世界 authority**。

#### 2. Turn / Revision Logical Time

由：

- Timeline sequence；
- Session Revision；
- Turn / Attempt；

天然提供的逻辑顺序。

用于：

- every N turns；
- retry / supersede；
- stale-result；
- recent-turn context。

它不是游戏世界日期。

#### 3. World Time

Package/Game 内的权威虚构时间。

例如：

- 第 12 天；
- 2026-09-29 18:00；
- 甲子年二月廿二日；
- 第 3000 个 simulation tick。

这是 Branch-aware / Revision-aware authority。

#### 4. Activity / Task Elapsed Time

某个局部 Activity / Task 内：

- 回合数；
- countdown；
- animation / interaction elapsed；
- timeout budget。

它通常不能直接当作 World Time，除非 Activity settlement 明确产生 `advance_world_time` outcome。

### 26.58 World Time 不能只是任意字符串

如果 Package 只保存：

`"2026年9月17日晚上"`

Host 就无法可靠：

- 比较先后；
- 算 duration；
- 判断 deadline；
- 做 catch-up；
- 做 deterministic test；
- 做 schedule；
- 做 cooldown；
- 在 custom calendar 与 UI label 之间分离。

因此候选 Native temporal contract：

```text
TemporalProfile
├─ clockId
├─ base unit
├─ calendar projection
│  ├─ gregorian
│  └─ custom declarative calendar
└─ formatting policy

WorldInstant
├─ clockId
└─ tick

WorldDuration
├─ clockId
└─ ticks

WorldSchedule
├─ scheduleId
├─ dueAt
├─ optional recurrence
├─ catchUpPolicy
└─ idempotency key
```

权威比较只使用：

`clockId + tick`

人类可读：

- 日期；
- 星期；
- 时辰；
- D+7；
- 季节；

全部由 Temporal Projection 派生。

这样不会再出现：

> “显示日期是一套、冷却判断又偷偷用另一套 day number。”

### 26.59 World Clock 仍不能成为第二套 mutation authority

Temporal Runtime 不允许：

`clock.set("tomorrow")`

Package-facing 合法路径仍然是：

```text
Action / World Process / Activity Settlement / Model Outcome
        ↓
typed advance-time proposal
        ↓
validate temporal policy
        ↓
World Command
        ↓
time.advanced Event
        ↓
World Reducer / Temporal state
        ↓
one Session Revision
```

因此：

> **Temporal Runtime 提供统一时间语义与计算 primitive，不提供绕过 Command/Event/Reducer 的写口。**

### 26.60 Runtime Automation 依赖 Temporal Runtime，而不是自己发明时间

第 13 项此前已经提出：

```text
trigger:
- turn
- clock
- world-time
- event
- state transition
```

现在应明确：

- `turn` → Session logical sequence；
- `world-time` → Temporal Runtime；
- `clock` 若指 wall clock，必须显式标记 wall-clock policy。

World Process 的：

- deadline；
- recurrence；
- catch-up；
- elapsed duration；

都统一引用 Temporal primitive。

因此第 29 项不是新的 scheduler。

边界是：

- **Temporal Runtime**：时间是什么、如何比较、如何投影；
- **Runtime Automation / World Process**：什么时候因时间触发工作；
- **Host Task Scheduler**：现实计算资源什么时候执行任务。

三者不能合并。

### 26.61 Gameplay authority 默认不能被 wall clock 偷偷推进

为了保持：

- Branch reproducibility；
- Save reproducibility；
- Studio deterministic scenario；
- offline debugging；

默认规则应为：

> **现实时间流逝本身不自动等于 World Time 流逝。**

如果某个游戏确实需要：

- 现实一天 = 游戏一天；
- 离线 8 小时后农场成熟；

也不能让 Package 自己 `Date.now() - lastSeen` 后直接 patch World。

应由 Host：

```text
wall-clock observation
→ persisted external-time observation
→ temporal policy
→ deterministic elapsed proposal
→ World Process catch-up
→ committed Revision
```

这样“现实时间经过多少”也成为可追踪的外部输入，而不是隐藏副作用。

### 26.62 Temporal Runtime 与其它能力的关系

#### Activity

Activity 可以：

- 使用自己的 local turn / elapsed；
- settlement 时提出 world-duration cost。

例如：

`battle took 18 world minutes`

Runtime 再统一 commit。

#### Workflow / Session App

Quest / dispatch / inbox 可以保存：

- createdAtWorld；
- dueAtWorld；
- expiresAtWorld；

但不维护自己的 day parser。

#### Epistemic Perspective

Perspective Record 的：

- witnessedAt；
- toldAt；
- rumor age；

可引用 WorldInstant。

“超过 2 游戏日的信息不再进入当前 Context”也能用同一时间语义完成。

#### Conversation Thread

thread message 可以同时拥有：

- logical order；
- world timestamp；
- wall diagnostic timestamp。

三者不混用。

#### Auxiliary Task

Task freshness 首先看：

- Revision anchor；

必要时再看：

- WorldInstant constraint。

#### Studio Test Bench

必须能：

- freeze World Clock；
- advance duration；
- jump to instant；
- simulate catch-up；
- assert schedule fired exactly once。

### 26.63 Custom Calendar 也必须声明式

Atria 不能只支持现实 Gregorian。

角色游戏常见：

- 修仙历；
- 帝国历；
- 季节轮；
- 自定义时辰；
- 无年月、只有 Day 1 / Day 2；
- 抽象 simulation tick。

因此 Calendar 只是：

> `tick → human-readable fields`

的 declarative projection。

Package 可以定义：

- units；
- cycle lengths；
- names；
- formatting；

但不能上传 JS date parser。

这样《天书江湖录》的传统时辰、《银麒赎世》的末日 D±N、现代日期制，都能在同一个 Temporal Runtime 上表达。

### 26.64 本轮正式新增第 29 项

此前连续几轮都成功把新发现压回已有 primitive，没有继续扩表。

但 Temporal Runtime 不能继续藏在第 13 项里，因为它同时被：

- Action；
- Workflow；
- Activity；
- Automation；
- World Process；
- Conversation；
- Perspective；
- Auxiliary Task；
- Studio Test Bench；

共同依赖。

所以当前能力主表由 28 项增至 **29 项**。

新增：

29. **Temporal Runtime / World Clock & Schedule**。

它不是：

- real-time background scheduler；
- arbitrary timer API；
- `Date.now()` wrapper；
- 第二套 World State。

它是：

> **让整个 Native Experience 对“什么时候发生、过去了多久、何时到期”使用同一种可分支、可重放、可测试的时间语义。**

### 26.65 《银麒赎世》的 MVU 双模型迫使我们修正 Round 4

该卡明确推荐：

> 主 AI 专注写故事，额外模型专门输出变量更新。

如果只看它的实现形式，这当然是：

- MVU；
- JSON Patch-like；
- 额外模型；
- 变量补丁。

这些实现 Atria 不应复制。

但它背后的产品能力不能被一起丢掉：

> **叙事生成与状态解释可以由两个职责不同的模型完成。**

这不是为了兼容旧卡。

对于开放式 RP，它有真实优势：

- Narrator 不需要同时兼顾文学表达与严格 JSON；
- 可以为 Interpreter 选择更擅长结构化输出、低方差的模型；
- prose 可以自然 streaming；
- 复杂 World schema 不必全部压进 Narrator 的输出格式要求；
- Interpreter 可以专门检查“本轮叙事究竟产生了哪些 durable semantic outcomes”。

因此此前：

> “post-narrative reconciler 只作为兼容桥”

的结论过度收窄。

Round 4 已直接修正文案。

### 26.66 当前 main 已经有正确地基，但还没有接成这种 Turn policy

当前 `main@4dab353a` 已有 `event_interpreter`：

- 独立 Runtime role；
- structured output；
- allowed event types；
- confidence threshold；
- 明确禁止：
  - numeric authority calculation；
  - World patch；
  - Event Journal direct write；
- 结果经过 Interpretation Mapping；
- mapping 再进入 typed Command；
- World State / Journal direct mutation 会被 Runtime 检测并拒绝。

这已经比传统 MVU extra-model patch 干净很多。

但当前实现的 `buildEventInterpreterMessages()` 主要输入是：

- authoritative observation；
- committed events；
- command results；
- user input。

它**没有把 Narrator Draft prose 作为本轮 semantic evidence**。

同时当前普通 `completeFreeTextTurn()` 路径仍然是：

```text
Intent Resolver
→ typed Command / World commit
→ Memory recall
→ Narrator
→ Memory finalize
```

也就是强 `authority-first`。

因此缺口不是再写一套 Interpreter。

而是：

> **把现有 Event Interpreter / Mapping 能力接入 narrative-outcome 的 Native Turn pipeline。**

### 26.67 Narrative-outcome 的两个 execution strategy

冻结：

#### Strategy 1 — inline

```text
Narrator
→ {
     prose,
     blocks,
     outcomes
   }
→ validate
→ simulate
→ commit
```

优点：

- 一次调用；
- latency / cost 低；
- outcome 与 prose 在同一模型内生成。

缺点：

- 对 structured-output 能力依赖更高；
- Narrator 注意力同时承担 prose 与结构化 contract。

#### Strategy 2 — interpreted

```text
Narrator
→ Draft prose

Draft prose
+ pre-turn observation
+ user input
+ allowed semantic outcome vocabulary
        ↓
Outcome Interpreter
        ↓
semantic proposals
        ↓
Interpretation Mapping
        ↓
simulate typed Commands
        ↓
atomic Turn commit
```

优点：

- Narrator 完全专注叙事；
- Interpreter 可以独立绑定 Runtime Route；
- 更适合不同模型分工；
- 对传统开放式 RP 的自然语言自由度更高。

缺点：

- 至少多一次模型调用；
- latency / token cost 更高；
- 必须处理 Draft prose 与最终 authority 不一致的失败路径。

### 26.68 Interpreter 仍然不能变成“变量模型”

Native Outcome Interpreter 的 authority ceiling 应极低。

它只能回答：

> **“Draft 中发生了什么语义事件？”**

例如：

```text
relationship.changed
item.acquired
location.arrived
character.injured
quest.core_completed
```

它不能回答：

```text
金币 = 1732
HP = 46
好感度 += 7
inventory[3] = ...
```

最终具体数值仍由：

- Command validator；
- Rule；
- Reducer；
- deterministic calculation；

决定。

如果 Package 真的允许模型提出 bounded magnitude：

`small / medium / large`

也只是 semantic parameter。

最终数值映射仍归 Runtime。

### 26.69 Draft prose 在 Interpreter 完成前仍然是 provisional

这与 `26.46–26.55 的 Scoped Operation model 对齐。

```text
Narrator stream
→ provisional Draft prose
→ Narrator terminal result
→ Outcome Interpreter
→ validate / simulate
→ final Turn commit
```

在 Interpreter 完成前：

- Draft 可以显示；
- 不能被当作 committed Timeline fact；
- Message Projection authority action 不生效；
- downstream World Process 不应把它当新事实。

如果 Interpreter：

- timeout；
- output invalid；
- mapping rejected；
- simulation fails；

默认：

> **整个 narrative-outcome Turn 不提交。**

这样不会出现：

> “正文已经成为历史，但变量更新失败。”

### 26.70 No-change 与 Interpreter failure 必须区分

`no_change` 是一个合法 semantic result。

它表示：

> Interpreter 判断本轮没有需要进入 authority 的 durable outcome。

此时可以提交 prose。

但：

- timeout；
- parse failure；
- schema failure；
- confidence policy reject；
- mapping invalid；

不是 `no_change`。

不能为了“让聊天继续”而偷偷降级成：

> prose-only commit。

除非 Package Turn Contract 明确把该 outcome stage 声明为：

- optional；
- advisory-only。

### 26.71 Outcome reject 后是否重写 prose 必须是显式 policy

如果 Draft 写：

> “他成功买下了长剑。”

但 Interpreter proposal 最终被 Rule 拒绝：

> 钱不够。

Runtime 不能：

- 提交原 prose；
- 又让 World 保持没买。

候选 Turn failure policy：

```text
onOutcomeReject:
├─ fail_turn
├─ retry_interpreter
└─ reconcile_prose
```

#### fail_turn

最简单、最可预测。

Draft 作为未提交草稿。

#### retry_interpreter

只适用于：

- transport；
- malformed structured output；
- 可恢复解析问题。

不能用 retry 强迫模型把一个本来非法的 outcome 说成合法。

#### reconcile_prose

显式高一致性策略：

```text
rejected proposal
+ authoritative simulation reason
+ original Draft
→ Narrator rewrite
→ re-interpret if required
→ final commit
```

它就是此前保留的：

`draft → resolve → final prose`

但现在明确：

- opt-in；
- bounded retry；
- diagnostics visible；
- 不能无限自循环。

默认仍不做隐式 repair generation。

### 26.72 双模型不是强制，也不能让 Package 指定私人模型

Package 只能声明：

```text
narrativeOutcome.strategy = inline | interpreted
```

以及 Interpreter 的：

- Model Task semantic；
- Prompt Program；
- Generation Profile intent；
- required structured-output capability。

玩家仍通过 Runtime Route 选择实际：

- Connection；
- Model；
- fallback。

因此作者可以表达：

> “推荐一个低方差结构化 Interpreter。”

但不能表达：

> “必须把变量更新发到作者写死的某个 API / Key。”

### 26.73 这项修正不新增第 30 项

它深化的是：

- #10 Package Turn Contract；
- #12 narrative-outcome policy；
- #27 Package Model Task；
- #11 Turn Envelope；
- #24 Task lifecycle / scheduler；
- #20 Diagnostics。

因此当前能力主表仍为 **29 项**。

真正新增的是一条重要设计原则：

> **Atria 不复制 MVU 的“额外变量更新 API”，但应原生支持 Narrator 与 Outcome Interpreter 分离的双模型 Turn。**

### 26.74 十个 Model Task 不能变成十份 API 配置

《银麒赎世》当前把 social chat、task evaluation、world dynamics、forum、live、surveillance、shop evaluation、outpost sync、plot task、image generation 分成多个独立 phoneAPI 通道。

旧宿主缺少统一 Model Runtime，因此每个通道只能各自保存：

- endpoint；
- key；
- model；
- timeout；
- retry；
- max concurrency。

Atria 已经拥有：

- Connection；
- Model Profile；
- Secret Store；
- Runtime Route；
- exact Prompt / Generation resources。

所以第 27 项如果最后变成：

> “每个 Model Task 都让玩家重新配一条完整 Runtime Route”

本质上只是把十个 phoneAPI 设置页换了名字。

这不是可接受的 Native UX。

### 26.75 必须拆开三种身份

复杂 Experience 中至少存在三个不同概念：

1. **Task semantic identity**
   - `social_chat`；
   - `quest_evaluator`；
   - `world_dynamics`；
   - `outpost_interpreter`。

2. **Author-owned Task Program**
   - Task Prompt；
   - Context policy；
   - output schema；
   - result authority；
   - required capabilities。

3. **Player-owned execution choice**
   - 用哪个 Model；
   - 哪个 Connection；
   - fallback；
   - timeout / retry；
   - cost / quality preference。

不能把三者都编码成一个 Runtime role name。

否则会出现：

```text
role.social_chat
role.forum
role.live
role.task_eval
role.world_dynamics
role.outpost_sync
...
```

然后玩家又被迫为每个 role 配一条 Route。

因此：

> **Package Task semantic 不是 Runtime Route role。**

Runtime role 只应表达少量 Host execution semantics；Package 的业务语义属于 ModelTaskDefinition。

### 26.76 Task Binding Slot

第 27 项增加：

> **Task Binding Slot**

Package 可以把多个 Model Task 分组到少量稳定 slot。

例如：

```text
Model Tasks
├─ phone.dm.generate       → slot: social
├─ phone.group.generate    → slot: social
├─ forum.generate          → slot: social
├─ quest.evaluate          → slot: structured
├─ outpost.interpret       → slot: structured
├─ world.simulate          → slot: world_sim
└─ illustration.generate   → slot: media
```

候选：

```text
TaskBindingSlot
├─ slotId
├─ displayName
├─ requiredCapabilities
├─ requirementScope
│  ├─ entrypoint_required
│  ├─ feature_required
│  └─ optional
├─ executionClass
├─ author recommendation
└─ compatibility policy
```

这样十几个 Task 最终可能只需要玩家处理：

- Narrative；
- Structured；
- Social；
- World Simulation；
- Media；

这几类模型选择。

Package 仍然可以让一个 Task 拥有独立 slot，但不应默认一 Task 一配置。

### 26.77 当前 Runtime Route 的组合粒度对 Package Task 太粗

继续核对 `main@4dab353a` 后发现一个真实结构问题。

当前 Runtime Route 同时绑定：

- Connection / Model；
- exact Generation Profile；
- exact Prompt Program；
- fallback；
- execution policy。

这对固定职责的：

- Narrator；
- Event Interpreter；
- Orchestrator；

非常合理。

但 Package Model Task 会拥有**自己的 Task Prompt Program**。

如果：

- social chat；
- quest evaluation；
- world dynamics；

三个 Task 使用三个不同 Prompt Program，而“玩家想让它们都跑同一个便宜模型”，当前 Route 粒度会迫使玩家复制三条：

```text
same model
same connection
same fallback
same timeout
different prompt
```

这说明未来 Model Task 不能机械套用现有 Runtime Route 一整个对象。

### 26.78 从 Runtime Route 中抽出可复用的 Model Execution Lane

长期更干净的模型是把 Runtime Route 的两部分语义拆开：

```text
Model Execution Lane
├─ player Model / Connection
├─ fallback lane
├─ timeout / retry
├─ capability evidence
└─ player execution policy

Author Program
├─ Prompt Program
├─ Context policy
├─ output contract
├─ result authority
└─ generation intent

            ↓ compose

Effective Task Execution Plan
```

这不要求立刻新增一个新的顶层产品域。

实现阶段可以：

- 从现有 Runtime Route 中抽取共享的 execution-lane contract；
- 让普通 Runtime Route 继续表现为：
  - Execution Lane + role Prompt/Generation；
- 让 Package Model Task 表现为：
  - Task Binding Slot → Execution Lane；
  - 再叠加 task-owned Program / Contract。

如果首版为了兼容现有数据结构，暂时允许“从某条 Runtime Route 借用 execution lane”，Host 也必须明确：

> **Package Task 不得意外继承那条 Route 的 Narrator Prompt。**

不能因为玩家把 `social` slot 绑定到 Narrator Route，就把整个 Narrator Prompt Program 拿去生成论坛帖子。

### 26.79 Task Prompt 与 Generation Intent 的所有权

对于 Package Model Task：

#### Prompt

Task 的 Prompt Program 应由 Package exact resource 定义。

原因：

- 它定义输入语义；
- 输出约束；
- Context 使用方式；
- Task contract 本身。

玩家可以：

- 选择模型；
- 选择允许的 typed parameters；
- Fork / Derive 自己的资源后显式替换；

但不能因为换模型而无意间丢掉 Task Prompt。

#### Generation

Generation 比 Prompt 更适合允许分层策略。

候选：

```text
generationPolicy:
- package_exact
- package_recommended
- player_lane_default
```

例如：

- Event / Outcome Interpreter 可以推荐低温度结构化 profile；
- Social chat 可以允许玩家使用自己的 conversational profile；
- image generation 使用 media-specific profile。

无论哪种，都必须：

- 有 exact EffectiveRequestSnapshot；
- 通过 capability validation；
- 不 silent-follow latest。

本轮暂不冻结最终字段名，但冻结：

> **Task Prompt contract 与玩家 Model binding 必须能独立组合。**

### 26.80 Player-owned Experience Task Bindings

建议由玩家拥有：

```text
ExperienceTaskBindings
├─ packageId
├─ slotBindings
│  ├─ social      → executionLaneRef
│  ├─ structured  → executionLaneRef
│  ├─ world_sim   → executionLaneRef
│  └─ media       → executionLaneRef
└─ optional taskOverrides
   └─ quest.evaluate → executionLaneRef
```

它不是：

- Package content；
- World State；
- Session Application State。

它属于：

> **player-owned Runtime configuration。**

因此：

- 不随 Branch 回滚；
- 不允许 Package 写入；
- 不含 Secret value；
- Package update 不能静默覆盖。

### 26.81 Binding resolution 必须确定性

候选解析顺序：

```text
1. explicit player per-task override
2. player slot binding
3. Package-declared compatible built-in inheritance
4. unavailable
```

第 3 项必须显式声明。

例如作者可以声明：

> `structured` slot 可以继承当前 `event_interpreter` execution lane。

但不能因为系统发现“这里有一个模型”就随便拿来用。

如果没有合法 binding：

- required entrypoint slot → Preflight 阻止进入依赖它的 Entry Point；
- feature-required slot → 对应 feature disabled + remediation；
- optional slot → graceful degradation。

不能偷偷 fallback 到 Legacy sender 或任意全局模型。

### 26.82 Package 更新时复用绑定，但必须重新验证

Slot ID 应在 Package family 内保持稳定。

例如：

`social`

从 V1 → V2 仍然可以复用玩家原来的 execution binding。

但新 PackageVersion 可能新增：

- structured output requirement；
- context minimum；
- image capability；
- tool requirement。

因此每次打开 exact PackageVersion 时：

```text
existing player binding
→ validate against new slot requirements
→ compatible   → reuse
→ incompatible → Health / Preflight remediation
```

禁止：

- 因版本更新自动换 Model；
- 自动改 Route；
- 自动启用 provider capability override。

历史 Model Task invocation 已保存自己的 EffectiveRequestSnapshot / provenance，因此玩家后来改 binding 不会改写旧结果。

### 26.83 Play / Runtime UX 应按 Slot 配置，而不是按内部 Task 列表轰炸玩家

Package Health / Runtime Setup 应显示类似：

```text
Story
✓ Narrator             GPT-X

Game intelligence
✓ Structured tasks     Model Y
✓ Social simulation    Model Z
! World simulation     Not configured
○ Media generation     Optional / Off
```

展开后才能看到：

- 哪些 Model Task 共用这个 slot；
- required capabilities；
- author recommendation；
- 当前 route/lane；
- per-task advanced override；
- cost / context warning。

应支持受控的批量操作：

> “对所有兼容的 text slot 使用当前 Narrator model”。

但真正保存前逐 slot 做 capability validation。

这比让普通玩家理解：

- 10 个 API URL；
- 10 个 Key；
- 10 个 Prompt；
- 10 个内部 taskId；

更符合 Atria 的产品定位。

### 26.84 Runtime role 不应随 Package Task 数量无限增长

当前 Native Generation Host 固定平台 roles：

- narrator；
- intent_resolver；
- event_interpreter；
- orchestrator；
- studio；
- memory；
- search。

未来 Package Model Task 不应动态把：

`role.phone.chat`、`role.forum`、`role.shop_eval`

注册成全局 Runtime role。

实现上更合理的是：

- 保留少量 Host-known execution role / class；
- Package Task 用 `taskId + bindingSlotId` 表达业务语义；
- Host 从 Task Binding 得到 exact player execution lane；
- Task Program / Result Policy 决定真正的工作合同。

是否最终需要一个通用 `package_task` Host role，留到实现设计阶段决定。

冻结的是：

> **Task semantic namespace 与平台 Runtime role namespace 必须分离。**

### 26.85 这次仍不新增第 30 项

Task Binding Slot / Model Execution Lane 是第 27 项：

> Package Model Task / Generation Task Contract

缺失的“用户配置与执行绑定”半边。

它同时接入：

- #20 Health / Preflight；
- #24 Auxiliary Task / Scheduler；
- #17 Host capability；
- Player Runtime configuration。

因此能力主表仍保持 **29 项**。

### 26.86 二次深挖：六种状态还缺一条正交维度

继续逐段检查 V24.4 的 9 个 TavernHelper script、29 个 Regex、182 个 Worldbook entry 与长期修复记录后，发现此前 §26.11 的“六种状态”分类仍有一个容易被误解的地方。

六种状态主要回答：

> **这份数据由谁拥有、存活多久、是否随 Revision / Branch 回滚。**

但《银麒赎世》的联系人备注给出了一个非常干净的反例：

- 备注需要持久保存；
- 会显示在联系人列表、会话标题、群聊 sender label；
- 但明确不能进入：
  - canonical storage key；
  - message sender identity；
  - Prompt；
  - avatar identity；
  - 任意模型生成通道。

也就是说：

> **“数据存在哪里”不能决定“哪些模型 / UI / actor 可以看到它”。**

因此从本轮开始，Native Experience 必须把两条维度拆开：

```text
Authority / Lifetime Axis
├─ World State
├─ Session Application State
├─ Activity State
├─ Local UI State
├─ Message-local UI State
└─ Player Preference State

Exposure / Information-flow Axis
├─ player_only
├─ presentation_only
├─ narrator
├─ actor:<id>
├─ task:<id>
├─ diagnostics
└─ explicitly shared semantic projection
```

这里的字段名只是概念示例，不冻结最终 schema。

这项修正意味着：

- Session Application State **不会因为是持久状态就自动进入模型上下文**；
- Player Preference 默认也不是 Prompt source；
- Diagnostics 默认只能进入诊断面；
- Actor Perspective 决定 actor 有资格知道什么，但不等于“所有 Session 数据都先经过 Perspective 再自动可见”；
- Model Task 只能读取自己 Context Source Policy 明确允许的 projection；
- Component 可以显示 player-only projection，而不需要复制一份假状态。

因此第 26 项 Epistemic Perspective 与第 27 项 Task Context 需要共享一个底层原则：

> **Context exposure 必须 allow-by-contract，而不是 allow-by-storage。**

这不新增第 30 项，而是把 #5 Data Projection、#26 Perspective、#27 Model Task、#28 Session Application State 的边界补完整。

### 26.87 Player Preference、Session Interaction Policy 与 Player-private Annotation 必须再分开

《银麒赎世》同时存在三种很容易被统称为“设置”的东西：

1. **设备 / 玩家偏好**
   - 动效强度；
   - toast 档位；
   - render / display 偏好；
   - 不应随剧情 Branch 回滚。

2. **当前存档的交互 / 模拟策略**
   - 事件密度；
   - 每日任务刷新倾向；
   - 某个玩法在本存档里的运行策略；
   - 会影响当前 Session 的后续行为。

3. **玩家私有 Annotation**
   - 联系人备注；
   - 自己的标签 / 标记；
   - 只改变玩家看到的 presentation。

因此不能把三者全部塞进 Player Preference。

建议边界：

- #3 Player Preference State：
  - device / player-package scope；
  - 不属于游戏存档 authority；
  - 默认跨 Session。
- #28 Session Application State：
  - 保存会影响本局应用行为的 Session policy；
  - Branch-aware 时必须跟 Revision 一起回滚。
- player-private annotation：
  - 可以物理属于 Session Application State；
  - 但使用 `player_only / presentation_only` exposure；
  - 不进入 Narrator / Actor / Model Task Context。

这使“存档内设置”与“跨游戏偏好”不再混成一个大桶。

### 26.88 新横切能力：Attention Projection / Delivery Receipt

《银麒赎世》长期迭代里反复出现：

- toast；
- 红点；
- unread；
- 事件页；
- 待处理计数；
- 系统提示回看；
- 一次性倒计时 / 感染提示；
- “低 / 中 / 高”通知密度；
- 自动系统信息降噪；
- 同一提示短时间去重。

这些表面上是 UI 细节，但背后其实是同一个平台问题：

> **同一个 Runtime fact 应该以什么强度、通过什么渠道、在什么时候送达用户或模型。**

不能把“发生了一件事”与“弹一个 toast”绑在一起。

建议形成共享的 **Attention Projection**，但不新增顶层能力编号：

```text
World / Session Event
Operation result
Health finding
        ↓
Attention Projection
        ↓
Delivery Record
├─ audience
├─ severity / importance
├─ channel
│  ├─ toast
│  ├─ badge
│  ├─ inbox / event center
│  ├─ modal
│  ├─ next-turn observation
│  └─ diagnostics
├─ dedupeKey
├─ ack / read state
├─ replay policy
└─ preference policy
```

关键规则：

1. **Authority Event 不因为通知被隐藏而消失。**
2. toast / badge / inbox 只是 projection，不是新的 World fact。
3. UI preview 不能把“下一轮必须送给 Narrator 的 Observation”提前消费掉。
4. 一次性 delivery 应有 typed receipt：
   - pending；
   - delivered；
   - acknowledged / consumed。
5. 用户可以降低非关键通知密度，但不能把：
   - required confirmation；
   - error；
   - authority conflict；
   - save corruption；
   静默吞掉。
6. 自动事件与玩家主动 Action 应保留 origin / provenance，Attention policy 可以因此使用不同默认等级。

它主要深化：

- #5 Data Projection；
- #13 Runtime Automation；
- #20 Health / Diagnostics；
- #28 Session Application State；
- #3 Player Preference。

其中 `next-turn observation` 继续进入明确的 Prompt / Context semantic lane，不允许 Presentation 自己向 Prompt 塞字符串。

### 26.89 Render 不是 Delivery Commit

《银麒赎世》曾出现一种非常典型的旧架构故障：

> 一次性系统提示在 UI 渲染阶段已经被标记“消费”，但主 Narrator 实际还没有收到它。

Native 必须明确：

```text
event exists
→ delivery pending
→ target channel actually accepts it
→ delivery receipt committed
```

而不是：

```text
rendered once
→ assume delivered everywhere
```

因此：

- Message Projection render；
- Event Center render；
- Diagnostics preview；
- Studio preview；

都不能自动改变 Narrator / Actor Context delivery receipt。

反过来也一样：

- 某条 Observation 已进入 Narrator Context；
- 不代表用户一定已经在 UI 中 read / acknowledge。

**Human attention state 与 Model context delivery state 必须分开记录。**

这条规则可以消灭一大类“UI 看过一次 → AI 永远收不到”或“AI 已处理 → UI 还反复提示”的旧生态错误。

### 26.90 Action / Form Constraint 不能只有 enabled / disabled

本卡后期把一部分“身份不符”从硬禁止改成：

> **不推荐，但仍允许玩家强行选择。**

同时另一些条件继续保持硬门槛。

这说明 Action v2 / Form Validation 的结果不能只有 Boolean。

建议统一成 typed Constraint Result：

```text
ConstraintResult
├─ status
│  ├─ allowed
│  ├─ advisory
│  ├─ confirm_required
│  └─ blocked
├─ reasonCode
├─ playerMessage
├─ optional semantic context
└─ remediation?
```

用途：

- `blocked`：感染、资源不足、authority 冲突等不能执行；
- `advisory`：身份错位、非推荐路线，但玩家可继续；
- `confirm_required`：危险或不可逆操作，需要确认；
- `allowed`：直接执行。

重要边界：

- advisory 不是偷偷改变 Rule；
- UI 不应把所有 warn 都渲染成 disabled；
- 若 advisory 需要影响下一次 Narrative，应通过显式 observation / action provenance 进入 Turn Context，而不是按钮文字被模型“看见”。

它深化 #1 Form、#7 Action v2、#20 Diagnostics，不新增顶层能力。

### 26.91 Dynamic Repeat 需要升级为 Host-owned Collection View Runtime

《银麒赎世》的任务库扩展到数百条后，真实出现了：

- 一次构建全部子页；
- 隐藏元素仍然占 DOM；
- 每次刷新重建上万节点；
- 手机端点击丢失；
- 输入框正在编辑时刷新清空内容。

后来不得不自行实现：

- 子页 lazy materialization；
- 真分页；
- 首屏 item limit；
- 卡片按需展开；
- incremental refresh；
- dirty state；
- focus / input preservation。

这说明 §20.12 的 `repeat + item limit` 还不够。

Component Model v2 应提供 Host-owned collection semantics，例如概念上：

```text
CollectionView
├─ source projection
├─ stable key
├─ ordering
├─ paging / window policy
├─ initial materialization limit
├─ load-more / cursor
├─ selection key
├─ empty / loading state
└─ item template
```

Host 负责：

- keyed diff；
- lazy materialization；
- 大列表 windowing / virtualization（具体实现可按平台决定）；
- focus preservation；
- active form draft preservation；
- scroll anchor preservation；
- rendered-node budget。

Package 不应该为了性能重新获得 DOM diff / MutationObserver / manual cache API。

因此：

> **Dynamic Repeat 是 authoring primitive；Collection Runtime 是 Host 的执行语义。**

仍归 #1 Component Model v2 + #5 Data Projection。

### 26.92 Capability Negotiation 必须声明“怎么降级”，不能只声明“缺什么”

此前 §26.17 已冻结：

`ready / degraded / unavailable`

但银麒的真实 fallback 说明还差一半。

复杂功能通常需要明确：

```text
preferred path
→ supported degraded path A
→ supported degraded path B
→ unavailable
```

例如能力层面：

- 长程 Memory Provider 不可用：
  - 可以回退到扩大 Native Conversation Context；
- Media generation 不可用：
  - 可以保留 text-only experience；
- 高阶 Scene renderer 不可用：
  - 可以使用 2D presentation；
- optional Model Task 未绑定：
  - 可以关闭该 feature；
  - 或使用 Package 明确声明的 deterministic fallback。

因此 #17 Host Capability Negotiation 增加：

> **Feature Degradation Profile**

候选：

```text
FeatureCapabilityProfile
├─ required capabilities
├─ preferred capabilities
├─ declared degraded modes
├─ unavailable behavior
├─ user-visible consequence
└─ remediation
```

严格禁止：

- Host 猜一个“差不多的模型”；
- 偷偷回到 Legacy sender；
- 自动换 API；
- 自动启用 Plugin；
- Package 自己在失败后随意联网。

所有降级都必须：

- Package 预声明；
- Host 验证；
- Diagnostics 可解释；
- 玩家看得见当前 effective mode。

### 26.93 Session Application Domain 的 Retention Policy 不能只是一个字段名

本卡长期运行后主动增加了：

- task pool cap；
- forum post cap；
- social graph cap；
- history cap；
- diagnostics ring buffer；
- 过期事件清理；
- 长期不活跃 NPC 归档；
- 大数据分桶；
- snapshot / backup 裁剪。

这说明 #28 的 `retention policy` 必须成为正式语义，而不是实现备注。

候选：

```text
RetentionPolicy
├─ maxItems?
├─ maxLogicalBytes?
├─ terminalTtl?
├─ archiveAfterWorldDuration?
├─ keepPinned / keepReferenced
├─ compaction policy
├─ summary policy
└─ orphan cleanup policy
```

规则：

- 使用 #29 Temporal Runtime 的 WorldDuration 时必须可重放；
- 使用 wall-clock TTL 时必须明确这是 external-time policy；
- Branch restore 必须恢复到该 Revision 对应的 domain view；
- compaction 不能破坏仍被：
  - Timeline；
  - Perspective；
  - Thread；
  - Event；
  - Asset；
  引用的记录；
- Package 不能取得数据库句柄自己做 GC；
- Host 可以物理 chunk / index / content-address，但 Package 仍只看到 typed collection/domain。

这把《银麒赎世》自己维护的几十种 `slice(-N)` 与清理 timer 收敛为 Native 平台能力。

### 26.94 Runtime Automation 必须有 Experience Ready Barrier

银麒多次踩到：

> UI / daily engine / outpost engine 已经开始初始化，但核心变量或大数据存储尚未恢复完成。

结果只能自己加：

- ready promise；
- init polling；
- 250ms / 2s 等待；
- 最长超时；
- “变量已就绪再跑”。

Atria Native 不应让每个 Package 重写这套启动竞态处理。

Session load 的候选 lifecycle 应明确：

```text
restore Session Revision
→ restore Session Application domains
→ run schema migration / health check
→ resolve Package / Add-on / Asset dependencies
→ validate capability / Task bindings
→ initialize projections
→ Experience Ready
→ start startup automations / world processes
```

默认：

- `session.loaded` 不等于 `experience.ready`；
- 需要完整数据的 Automation 可以绑定 `experience.ready`；
- 如果某 optional domain 未准备好但有合法 degradation path，可以以 degraded-ready 进入；
- timeout / failure 进入 Health，而不是把空值当 0 / false 后继续初始化 authority。

这深化 #13 Runtime Automation、#20 Health、#24 Task lifecycle、#28 Session App。

### 26.95 Canonical Entity Identity 必须压过显示名 / 别名

银麒大量长期 bug 来自：

- 地点简称 / 全名；
- 玩家改名；
- NPC 昵称 / 真名；
- 联系人备注；
- 同一社交关系从不同账号观察；
- 空格脏 key；
- 旧名称漂移。

旧实现只能不断加 alias table / normalize helper / trim guard。

Native 设计应明确：

> **持久 authority / relationship / thread / action target 一律用 typed EntityRef；显示名与 alias 只是 Projection / Search metadata。**

例如：

```text
EntityRef
├─ kind
└─ id

DisplayIdentity
├─ primaryLabel
├─ aliases
├─ playerPrivateLabel?
└─ locale projection
```

这样：

- 联系人备注不改变 canonical identity；
- 改名不会拆成两个角色；
- Thread participant 不以当前显示名作 key；
- 地图节点不靠自然语言字符串 join；
- Perspective / Social Graph 都引用同一 EntityRef。

运行时模型新建 entity 时仍走此前的 runtime-authored typed entity contract，不允许模型直接选择持久字符串主键。

### 26.96 二次深挖后的压缩结论：仍然是 29 项

这一轮没有发现必须新增第 30 项的独立平台域。

真正补出的，是此前 29 项之间缺失的**横切语义**：

1. Authority / Lifetime 与 Exposure / Information Flow 正交；
2. Attention Projection + Delivery Receipt；
3. Action/Form 的 hard / advisory / confirm constraint；
4. Host-owned Collection View Runtime；
5. Feature Degradation Profile；
6. Session Domain Retention / Compaction；
7. Experience Ready Barrier；
8. Canonical Entity Identity。

它们分别压回：

- #1 Component Model v2；
- #3 Player Preference；
- #5 Data Projection；
- #7 Action v2；
- #13 Runtime Automation；
- #17 Host capability negotiation；
- #20 Health / Diagnostics；
- #26 Epistemic Perspective；
- #27 Model Task Context；
- #28 Session Application State；
- #29 Temporal Runtime。

因此当前判断：

> **《银麒赎世》V24.4 的平台级精华已经基本抽完。**

下一张样本继续优先寻找：

- 是否存在这 29 项无法解释的新 Runtime Domain；
- 是否出现比上述横切模型更好的状态 / 信息 / 交互边界；
- 是否有新的高阶 authoring 或 player UX，而不是继续为同类功能新增名词。
