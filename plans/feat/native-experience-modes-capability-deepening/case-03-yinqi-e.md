# Atria Native Experience Modes & Capability Deepening — Case Study 03E — 银麒赎世

> Continuation of Case 03; split only to control reading size. Original section text is preserved.

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
