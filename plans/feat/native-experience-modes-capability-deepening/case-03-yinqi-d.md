# Atria Native Experience Modes & Capability Deepening — Case Study 03D — 银麒赎世

> Continuation of Case 03; split only to control reading size. Original section text is preserved.

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
