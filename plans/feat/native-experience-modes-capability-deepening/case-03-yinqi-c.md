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
