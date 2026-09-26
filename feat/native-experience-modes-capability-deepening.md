# Atria Native Experience Modes & Capability Deepening 企划书

## 任务信息

- 任务：Native Experience Modes & Capability Deepening
- 类型：`feat/*`
- 文档状态：**讨论中 / 持续修订**
- 当前实现基线：`main@4dab353ac639d42eae885c79e18245267abd6820`
- 计划文档：`docs:feat/native-experience-modes-capability-deepening.md`
- 当前不进入实现阶段；先经过若干轮产品与架构讨论，讨论结论随时回写本文。
- 现有临时分支 `feat/component-form-composer-submit` 目前没有承载实现，不作为已定方案依据。

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

## 四、三个模式的产品定义

### 4.1 Component — Chat Enhancement Mode

Component 不应被理解成“小组件模式”。

定义：

> Atria 保持原生聊天布局与 Conversation / Composer 所有权，Package 可以向明确的语义插槽和消息位置挂载 Native Component。

适合：

- MVU 状态栏卡
- 正文尾状态卡
- 快速回复
- 消息内行动按钮
- 常驻 HUD
- 小型角色信息面板
- Chat header/footer 扩展
- Composer 前后扩展
- Drawer / Modal / Sidebar 辅助 UI

Package **不能重排整个聊天舞台**，但可以深度增强现有 Chat UX。

建议长期支持的 surface 包括：

- `chat.header`
- `chat.footer`
- `composer.before`
- `composer.after`
- `sidebar.left`
- `sidebar.right`
- `drawer`
- `modal`

并新增消息级 surface：

- `message.before`
- `message.after`
- `message.overlay`
- 受限的 `message.presentation`

其中 `message.after` 是承接传统 MVU “正文末尾状态栏”的关键能力。

### 4.2 Hybrid — Chat-based Game Application Mode

定义：

> Package 拥有主 Stage 的布局组合权，但继续复用 Atria 原生 Conversation / Composer，以及 Native generation / message / session runtime。

适合：

- 高阶 MVU 角色卡
- 带自定义开局向导的角色卡
- RPG / 互动小说式角色卡
- 左右侧 HUD + 中间聊天
- 多阶段 Setup → Chat → Game UI
- 复杂角色卡，但交互循环仍以对话为中心

典型布局：

```text
Package Header / HUD
        ↓
Package Sidebar + Native Conversation
        ↓
Status / Actions
        ↓
Native Composer
```

首次启动也可以进入 Setup / Wizard：

```text
Custom Opening Wizard
        ↓
collect local form state
        ↓
build prompt
        ↓
Native Composer
        ↓
submit
        ↓
normal Hybrid layout
```

Hybrid 应成为大量 SillyTavern 高阶角色卡、MVU 卡 Native 化后的主力模式。

### 4.3 Full — Standalone Game/Application Mode

定义：

> Package 拥有整个游戏 Stage，Native Conversation / Composer 只是可选能力，不再是产品中心。

适合：

- 独立文字冒险
- 地图 / 探索 / 战斗 UI
- 经营 / 养成界面
- 完整菜单驱动游戏
- 没有聊天输入框的体验
- 点击 NPC / Command 驱动叙事生成

Full 不应只是“Hybrid 再多藏一点 Atria UI”。

Full 的本质应是：

> Package 可以构建一个完整独立应用，LLM / Conversation 只是其中一种服务。

---

## 五、Shared UI Primitive Layer

当前 Component Model v1 的节点类型明显不足。

候选 Native primitives：

### 基础结构

- `container`
- `stack`
- `grid`
- `scroll`
- `separator`
- `spacer`

### 内容

- `text`
- `rich-text`
- `icon`
- `image`
- `badge`
- `progress`

### 表单

- `input`
- `textarea`
- `select`
- `checkbox`
- `radio`
- `range`
- `form`

### 导航 / 组合

- `tabs`
- `details`
- `stepper`
- `list`
- `modal-trigger`
- `native-slot`

具体首版范围尚未冻结，后续讨论后精简。

---

## 六、Local UI State

这是当前 Component Model 最关键的缺口之一。

需要正式区分：

### Authoritative State

例如：

- World State
- Session State
- Event Journal
- Knowledge
- Session Revision

它们是剧情 / 游戏事实。

### Local UI State

例如：

```json
{
  "wizard": {
    "step": 2,
    "name": "Player",
    "race": "human",
    "origin": "noble"
  },
  "tabs": {
    "active": "inventory"
  }
}
```

Local UI State 的特点：

- 不进入世界事实；
- 不自动进入模型上下文；
- 不需要每次输入都创建 Session Revision；
- 不承担持久游戏状态权威；
- 用于表单、wizard、tab、临时选择、展开状态；
- 在明确提交动作时才转换成 Native Command / Composer / World action。

后续需要讨论 Local UI State 的生命周期：

- mount lifetime
- session lifetime
- package-local persistent preference
- 是否允许 entry-point seed

---

## 七、Expression / Template Layer

当前静态 action args 不足以实现真实表单。

需要安全的声明式动态值能力，例如概念上支持：

```text
{{ui.wizard.name}}
{{world.player.hp}}
{{selector.location}}
{{args.value}}
```

或结构化表达式：

```json
{
  "name": { "$ui": "wizard.name" },
  "hp": { "$world": "player.hp" }
}
```

应继续坚持：

- 不执行任意 JS；
- 表达式有明确作用域；
- 输入可验证；
- blocked prototype/path；
- 有复杂度 / 深度上限；
- 所有 Native 权威写入仍必须经过 Command / Runtime contract。

---

## 八、Action Layer 深化

当前 `click → commandId + static args` 需要升级。

候选 Action：

### UI State

- `ui.set`
- `ui.toggle`
- `ui.patch`
- `ui.reset`
- `wizard.next`
- `wizard.previous`

### Native Game

- `command.dispatch`
- `command.simulate`

### Composer

- `composer.set`
- `composer.append`
- `composer.clear`
- `composer.focus`
- `composer.submit`

### Form

- `form.submit`
- `form.reset`
- `form.validate`

### Surface

- `surface.open`
- `surface.close`

### Message

- `message.compose`
- `message.send`
- `message.action`

其中 `composer.set / composer.submit` 是承接旧 SillyTavern：

```text
/send <text> | /trigger
```

的 Native 替代。

不能简单复制 `triggerSlash()` 作为 Native API。

---

## 九、自定义开局 Wizard

SillyTavern 高阶角色卡常见模式：

```text
HTML Form
  ↓
JS collect values
  ↓
buildOpeningPrompt()
  ↓
/send ...
  ↓
/trigger
```

Native 目标：

```text
Component Form
  ↓
Local UI State
  ↓
Template / Expression
  ↓
composer.set()
  ↓
composer.submit()
```

该能力必须至少可以在 Component / Hybrid 中使用，不能被 Full 独占。

Hybrid 可进一步在开局阶段用 Wizard 取代正常布局，提交后切换到 Chat layout。

---

## 十、Message Projection

当前 Native Play 的 Conversation 本质上仍以 message content string 为主要显示单位，这不足以承接 MVU / Regex 前端生态。

需要新增正式概念：

> **Message Projection = Narrative Content + Structured Blocks + Actions**

概念示例：

```text
assistant narrative
+
status component
+
story options
+
message-local actions
```

典型目标：

旧生态：

```text
AI Text
<status>...</status>
<story_options>...</story_options>
        ↓
Regex
        ↓
HTML + JS
```

Native：

```text
AI Text / structured output
        ↓
Message Projection
        ├─ Narrative
        ├─ Status Component
        └─ Quick Actions Component
```

点击 Quick Action 后：

```text
message action
   ↓
composer.set / submit
```

该层是 Atria 真正吃掉 Regex HTML / MVU 前端的关键。

仍需后续讨论：

- Structured blocks 来自模型结构化输出还是文本标记解析；
- display-only projection 与 prompt content 如何隔离；
- 历史 message projection 如何重放；
- swipe / branch / revision 与 projection 的关系；
- message-local component 是否读取“当前状态”还是“该楼层快照状态”。

---

## 十一、MVU Native 化

### 11.1 Legacy MVU Compatibility

现有 `MagVarUpdate.getMvuData()` / state provider 继续保留，用于读取旧卡状态。

目标：

- 旧卡可以继续显示 MVU 状态；
- Native Component 可以通过安全 provider/selector 读取 MVU；
- 不要求所有旧卡立即重写。

### 11.2 Native Package

新 Native Package 优先使用：

- World schema
- baseline
- authoritative state
- Command
- Reducer
- Rule
- Event Journal
- Session Revision
- State-conditioned Knowledge

而不是继续把 MVU 插件当事实源。

### 11.3 MVU Frontend

旧：

```text
stat_data
 ↓
Regex HTML
 ↓
Status UI
```

新：

```text
Native World State
 ↓
Selector
 ↓
Component / Message Projection
```

---

## 十二、SillyTavern / MVU 能力吸收清单（初稿）

以下清单将在下一轮开始逐项拆解归属和实现方式：

1. 自定义开局 HTML / 多步表单
2. alternate greetings / 开局跳转
3. 正文尾状态栏
4. 正文穿插状态块
5. `story_options` / 快速回复
6. 点击按钮 → 自动填入输入框
7. 点击按钮 → 自动发送
8. MVU `stat_data` 展示
9. MVU 初始化变量
10. MVU 变量更新与 Native State 映射
11. 变量驱动条件显示
12. 变量驱动 Knowledge / World Info 激活
13. 消息局部 display-only 替换
14. prompt-only / display-only 内容隔离
15. modal / drawer / sidebar
16. swipe / alternate message interaction
17. Message-local UI
18. 响应式移动端角色卡前端
19. Regex 前端迁移
20. legacy third-party compatibility bridge

后续可能补充 Tavern Helper / CardApp / LoreState 等生态常见能力。

---

## 十三、不能直接复制的 SillyTavern 机制

本任务目标是吸收能力，而不是复制历史接口。

### 不直接 Native 化 `triggerSlash`

旧：

```text
triggerSlash('/send ...|/trigger')
```

Native：

```text
composer.set / composer.submit
```

### 不直接 Native 化 Regex HTML UI

旧：

```text
Regex → HTML / JS
```

Native：

```text
Message Projection / Component
```

### 不让 MVU 成为新的核心状态系统

旧 MVU 作为兼容 Provider。

新游戏事实由 Native World / Session Runtime 承担。

---

## 十四、运行时边界

深化 Experience 不能制造第二套：

- Conversation 数据
- Composer / send pipeline
- generation runtime
- World State
- Event Journal
- Session persistence
- branch / retry / revision
- Knowledge runtime
- Memory runtime
- Orchestrator runtime

Experience 只是 Native runtime 的声明式 UI / interaction layer。

所有世界事实写入必须继续经过明确 Native authority。

---

## 十五、安全与 Package 权限

后续设计必须延续当前 Package 安全模型：

- 不运行任意 Package JavaScript；
- Component / Formula / Template 都是受限声明式数据；
- UI actions 只能调用允许的 Native capability；
- 自定义 UI 与 runtime command 权限继续显式声明；
- 网络 / clipboard / world write 等能力继续经过 Package permission；
- Message Projection 不允许重新打开任意 HTML script 注入路径。

---

## 十六、与现有 Immersive Mode 的关系

现有 `docs:feat/immersive-experience-refactor.md` 解决的是：

> 普通聊天之上的沉浸 Presentation Layer。

本企划解决的是：

> Native Package 的 Component / Hybrid / Full Experience authoring/runtime capability。

两者不是同一层：

- Immersive Mode：用户侧通用剧情呈现层；
- Native Experience：Package 所拥有的声明式 UI / Game front-end contract。

后续实现必须避免二者互相争夺同一 Stage / DOM ownership，并明确组合规则。

---

## 十七、本轮尚未冻结的问题

以下内容只记录方向，不视为最终设计：

- Component Model v1 增量扩展还是推出 v2；
- Local UI State 的持久化生命周期；
- Message Projection 的数据格式；
- rich-text 是否允许受限 Markdown；
- Component 是否允许 message presentation replacement；
- Message-local state snapshot 语义；
- Hybrid 的 layout route / wizard 切换方式；
- Full 是否必须支持无 Conversation / 无 Composer；
- Form validation contract；
- Action composition / sequence / transaction；
- Template 语法选择；
- Legacy MVU provider 如何映射 selector；
- ST Regex frontend 自动迁移能做到多大程度。

---

## 十八、后续讨论顺序

### Round 2 — SillyTavern + MVU Feature Inventory

逐项审计旧生态能力，明确：

- 用户真正依赖的行为；
- Atria 现状；
- 应落入的 Native 子系统；
- 是否需要兼容层；
- 是否应该淘汰。

### Round 3 — Component Model vNext

定稿：

- primitive
- form
- local UI state
- expression
- action
- composer
- surface

### Round 4 — Message Projection

定稿：

- message block model
- status / quick action
- prompt/display isolation
- history / swipe / revision semantics

### Round 5 — MVU / Legacy Migration

定稿：

- provider bridge
- stat_data mapping
- Native World migration
- Regex frontend migration
- compatibility boundary

### Round 6 — Mode Contract & Authoring UX

定稿：

- Component / Hybrid / Full manifest contract
- Studio editor
- preview
- diagnostics
- migration tooling

全部讨论冻结后，再拆实施阶段和正式工作分支。

---

---

## 十九、Round 2 能力账本（进行中）

本轮开始对照 `vanilla` 与当前 `main`，把“旧生态实际行为”拆成 Native 能力，而不是按旧 API 名称照搬。

### 19.1 开局 / Alternate Greetings

已确认 SillyTavern 的 `first_mes + alternate_greetings` 在聊天运行时中本质上属于**首条 assistant message 的多个 swipe**，而不是多个独立 Session / Entry Point。

因此后续 Native 设计需要区分：

- **Entry Point**：真正不同的游戏初始世界、资源绑定、初始状态或流程入口；
- **Opening Variant**：同一 Entry Point 下的不同首条消息 / 开场版本；
- **Setup Wizard**：需要用户先填写/选择，再提交第一条用户输入的交互式开局。

不能再把所有 `alternate_greetings` 机械转换成 Entry Point。

### 19.2 Quick Reply / 自动动作

SillyTavern Quick Reply 实际能力不只是“按钮发文字”，还包含：

- 手动点击执行；
- 上下文菜单；
- startup；
- user message 后；
- AI message 后；
- chat change；
- new chat；
- before generation；
- group member draft；
- 可阻止自动执行。

Native 不应复制 Quick Reply + Slash Script 体系，而应拆成：

- Message / Composer Action；
- Session / Generation lifecycle trigger；
- declarative action sequence；
- 可选条件；
- 明确 capability / permission。

其中“显示按钮”“自动执行”“生命周期触发”应是三件不同的能力。

### 19.3 Regex

Vanilla Regex 当前表达了至少四个独立维度：

1. **placement**：USER_INPUT / AI_OUTPUT / SLASH_COMMAND 等；
2. **lane**：markdown/display、prompt、普通存储文本；
3. **message depth**：minDepth / maxDepth；
4. **execution policy**：runOnEdit、macro substitution。

Atria 已经拥有 Native Regex scope，并明确 Regex 只负责文本变换，不拥有 Game Runtime / World State / HUD。

后续方向暂定：

- 纯文本清理、兼容旧 Prompt 处理仍由 Regex 负责；
- Regex 生成 HTML/JS 前端的用途迁往 Message Projection / Component；
- display-only 与 prompt-only 的“语义隔离”需要成为 Message Projection / Prompt Pipeline 的一等能力，而不能继续依赖 Regex 技巧完成。

### 19.4 World Info → Native Knowledge 差异

Atria Native Knowledge 当前已原生覆盖：

- enabled；
- keywords / aliases / regex discovery；
- state conditions；
- probability；
- sticky / cooldown / delay；
- required / related / exclusive relation；
- before / after delivery；
- priority；
- narrator / actor / agent / user target。

但 SillyTavern World Info 仍有 Native Knowledge 尚未完整表达的语义：

- primary + secondary key 的 selective logic；
- per-entry scan depth；
- case sensitivity；
- whole-word matching；
- persona / character / scenario / creator-note 等额外 scan source；
- recursion；
- exclude recursion / prevent recursion / delay-until-recursion；
- group / group weight / group override / group scoring；
-更丰富的 prompt insertion position 与 role/depth；
- generation-type triggers；
- automation id；
-部分全局 budget / minimum activation / overflow 语义。

因此不能宣称现有 Native Knowledge 已“完全吃掉 World Info”。Round 5 需要决定这些能力中哪些：
- 应原生吸收；
- 应改写成更通用的 Knowledge contract；
- 应由 Prompt Program / Runtime Rule 承接；
- 属于旧实现细节而不再保留。

### 19.5 Variables / MVU

SillyTavern 本身存在：

- chat-local variables；
- global variables；
- slash-command lexical scope；
- macro side effects（set/add/inc/dec/get）。

Atria Native 已存在更明确的：

- World State；
- Session State namespace；
- Revision / Branch；
- declarative Command / Reducer / Rule。

同时当前 Atria 的 Memory state provider 已能只读读取：
- Native state providers；
- committed MVU `stat_data`；
- LoreState readonly state。

当前 MVU 适配是**只读兼容 Provider**，不是完整 MVU 写入运行时。

因此后续必须明确区分状态 authority，禁止继续把所有内容都叫“变量”。Round 5 的重型案例已经进一步把这套模型拆细为 World State、Session Application State、Activity State、Local UI State、Message-local UI State、Player Preference State；Legacy Provider State 只属于兼容读取，详见 §26.11。

### 19.6 MVU 卡的典型行为已经验证

实际角色卡验证了常见 MVU 前端链路至少包含：

- 当前 `stat_data` 注入；
- 变量定义；
- 变量更新规则；
- 模型输出结构化 `UpdateVariable / JSONPatch`；
- 正文状态标签；
- `story_options`；
- Regex 将结构化标签转成可交互 HTML；
- 点击按钮后将文本发送/触发下一轮。

这说明后续不能只补“状态栏 Component”，还必须同时覆盖：

- state update contract；
- message structured block；
- quick action；
- composer submit；
- message-local rendering；
- prompt/display separation。

### 19.7 Timeline / Swipe / Variant / Branch

SillyTavern 的 swipe 是同一楼层内可切换的可变候选文本，首条 `first_mes + alternate_greetings` 也复用这套机制。

Atria Native 当前刻意采用不同权威模型：

- committed Timeline append-only；
- 每条消息出生时只有一个 immutable Variant；
- Retry 不向旧消息追加 swipe，而是回到前一 user boundary 后派生新 Branch；
- Re-enter / Restart From Here 同样以 Revision / Branch 为权威；
- Historical Revision / Save 继续时也派生新 Branch，不破坏原分支。

这个方向应保留，不回退成“可变 swipes 数组”，因为它天然能让 World State、Event Journal、Knowledge lifecycle 与回复版本一起回滚。

但产品层仍需补一个 **Reply Variant / Swipe UX facade**：

```text
用户感知：上一版 / 下一版回复
                 ↓
Native 内部：Branch / Attempt / Revision 切换
```

Package UI 不应直接操作 Branch ID；应调用语义化 Turn/Reply action。

首条开场则单独采用 Opening Variant，不与普通 Retry Branch 混为一谈。

### 19.8 Message mutation

Legacy chat API 允许直接 update/delete message。Native Session 则把 committed Timeline 视为不可变事实。

因此 Native Package 不应获得任意：

- mutate committed message text；
- replace old message in place；
- delete arbitrary middle message while保留后续事实。

应提供语义操作：

- `turn.retry`
- `turn.reenter`
- `turn.undo`
- `timeline.restartFrom`
- `branch.switch`
- `narrative.rewrite`
- `save.create / save.restore`

其中 Edit User Message 的 Native 语义是“从该 user turn 重新进入并产生新 Branch”；Delete From Here 的 Native 语义是“从之前的 Revision 派生新 Branch”。

Legacy `updateMessages/deleteMessages` 继续服务旧聊天与第三方插件，不成为 Native Package 的权威写入 ABI。

### 19.9 Message-local UI 与历史状态

后续 Message Projection 必须明确两类组件：

1. **Live projection**：读取当前 World State，例如常驻 HUD；
2. **Message snapshot projection**：锚定生成该消息时的 Revision / Event range，用于正文尾状态卡、战斗结果、结算信息。

否则用户切 Branch / Retry 后，旧消息下面的状态栏会错误显示“当前状态”。

历史消息上的可执行动作也必须有明确语义：

- active tail：可直接执行；
- historical message：默认只读；
- 若允许执行，应显式变成 “Fork / Restart from this point + action”，不能偷偷把旧楼层动作写到当前世界。

### 19.10 Macro 能力拆分

SillyTavern Macro 同时混合了纯读取、模板控制流、环境判断、随机数和变量副作用。Native 不应复制这种单一宏系统。

Native 对应关系暂定：

- `{{user}}` / `{{char}}` / time / session identity 等纯读取  
  → Expression / Template 的只读 context；
- `{{getvar}}`  
  → 明确 state selector；
- `{{setvar}}` / `addvar` / `incvar` / `decvar` 等副作用  
  → Command / Reducer / explicit state action；
- `{{if}}` / `{{each}}`  
  → Component condition / repeat / template expression；
- `{{isMobile}}`  
  → Responsive condition；
- `{{roll}}` / `{{random}}`  
  → 若影响游戏事实必须走 deterministic Game RNG + Event Journal；纯展示随机可以属于 Local UI，但不得反向成为 World authority；
- 第三方自定义 Macro  
  → 不作为 Native Package 默认依赖。若未来需要，应通过显式声明的 read-only provider/capability 接入。

Template/Expression evaluation 必须保持纯函数，不允许读取模板时产生状态副作用。

### 19.11 Prompt insertion / Author Note / World Info position

Atria Native Prompt Runtime 已经提供语义 Prompt target：

- `system.foundation`
- `system.character`
- `system.world`
- `system.style`
- `system.response`
- `agent.task / evidence / constraints`
- `context.before_history / after_history`
- `context.before_input / after_input`
- `response.post_history`
- `response.prefill`

因此不应把 SillyTavern 数字 position / role / depth 机制原封不动搬进 Experience UI。

原则：

- 稳定提示词 → Prompt Module / Program；
- 动态 lore → Knowledge；
- 游戏事实 → World Observation / Event；
- UI → Component / Message Projection。

仍需在 Round 5 决定 Native Knowledge delivery 是否扩展成更丰富的 **semantic prompt slot**，以承接常用 World Info 插入位置。真正依赖“插入历史第 N 层”的行为需要单独评估，而不是用 legacy 数字位置污染新 contract。

### 19.12 Quick Reply / Automation 应独立成 Runtime Trigger Layer

Vanilla Quick Reply 的自动执行已经验证包含：

- startup；
- user message 后；
- AI message 后；
- chat change；
- new chat；
- group member draft；
- before generation；
- World Info activation 的 `automationId` 联动；
- prevent-auto-execute/reentrancy 保护。

这说明 Quick Reply 不是单纯 UI Button。

Atria 当前 Declarative Rule 主要消费 Game World Event；Native Session 另有：

- `TIMELINE_APPENDED`
- `REVISION_COMMITTED`
- `REVISION_RESTORED`
- `BRANCH_ACTIVATED`
- `SESSION_LOADED`
- `SESSION_CLOSED`
- `DRAFT_ABORTED`

因此需要一个共享的 **Declarative Runtime Trigger / Automation Layer**，而不是把 auto-execute 塞进 Component。

候选 trigger：

- `session.started / loaded / closed`
- `branch.activated`
- `timeline.user_appended`
- `timeline.assistant_appended`
- `generation.before / accepted / stopped`
- `knowledge.activated`
- `world.event_committed`
- `state.changed`

候选 effect：

- dispatch typed Command；
- enqueue Composer action（仅有明确 UI/session 语义时）；
- open/close Experience surface；
- publish transient UI notification；
- set non-authoritative UI state。

必须有：

- reentrancy guard；
- per-turn execution budget；
- cycle detection；
- deterministic ordering；
- clear failure diagnostics。

World Info 的 `automationId` 可迁移为 `knowledge.activated` + tag/id condition，而不是复制同名字段。

### 19.13 Tavern Helper / CardApp 常见动作的 Native 去向

实际卡与 Atria 插件生态暴露了这些常见调用：

| Legacy 行为 | Native 去向 |
| --- | --- |
| 读取 MVU / LoreState | Legacy Provider selector；新包用 World State |
| `triggerSlash('/send ...|/trigger')` | `composer.set / composer.submit` |
| 获取/修改 chat message | Timeline/Turn semantic action；不直接改 committed Native message |
| 切 swipe | Reply Variant / Branch facade |
| 开关 World Info entry | 优先改为 World State 条件驱动 Knowledge；必要时再设计 Session Knowledge override |
| 读取 chat-local structured state | Native Session State；旧插件继续 Chat/Floor State |
| CardApp UI 临时输入 | Local UI State |
| CardApp 跨会话用户偏好 | 后续讨论 Package/Player Preference State |

Atria 现有 Floor State 对旧插件很有价值，但 Native Package 本身已有 Revision / Branch 权威，不应再在 Native Package 内复制一套 Floor State 作为剧情事实源。

### 19.14 Native Knowledge 需要深化，但不照搬 World Info schema

现有 Native Knowledge 已支持 recursive discovery（选中内容会继续参与扫描），但缺少很多 World Info 高阶控制。

建议未来用更通用语义吸收：

- primary/secondary selective logic  
  → `discovery.anyOf / allOf / noneOf`；
- case / whole-word  
  → per matcher options；
- scan depth  
  → `discovery.sources.history.depth`；
- persona/character/scenario 等 scan source  
  → typed discovery source selectors；
- recursion flags  
  → `recursion.receive / emit / minPass / maxPass`；
- group/group weight/override  
  → selection group + strategy；
- generation triggers  
  → applicability turn/request context；
- automation id  
  → knowledge activation event/tag；
- injection position  
  → semantic prompt delivery slot。

具体哪些进入首版、哪些仅 importer compatibility，在 Round 5 冻结。

### 19.15 MVU 状态更新真正的架构缺口

当前 Native Game Runtime 的标准路径是：

```text
User input / UI Command
  ↓
Intent Resolver
  ↓
Typed Command
  ↓
Event + Reducer
  ↓
World State commit
  ↓
Narrator 根据已提交事实写 prose
```

Narrator 被明确禁止自行产生持久状态 patch。

这对确定性游戏是正确的，但**不能完整覆盖传统 MVU**。MVU 常见路径是：

```text
Assistant narrative
  ↓
模型同时/随后给出 UpdateVariable / JSONPatch
  ↓
状态根据本轮叙事结果变化
```

因此“吃掉 MVU”不能只做变量 Schema 和状态栏；必须增加一种 **Narrative Outcome Resolution** 能力。

目前保留四个候选方向，尚未冻结：

1. **Simulation-first only**  
   所有变化必须先解释成 Command/Event，再生成 prose。最干净，但对开放式 RP 迁移成本最高。
2. **Single-call structured turn result**  
   模型一次返回 narrative + typed outcome sidecar，再验证/提交 outcome。效率高，但对 streaming / provider structured-output 能力有要求。
3. **Post-narrative reconciler**  
   先生成 prose，再由专门 resolver 将叙事解释成受限 Command/Event。兼容传统 MVU，但存在 prose 与最终 commit 不一致风险。
4. **Draft → resolve outcome → commit → final prose**  
   先产生剧情草案，解析并提交事实，再由 Narrator 输出与权威事实一致的最终 prose。最稳，但多一轮推理成本。

无论选择哪条路线，模型都不能直接写任意 JSON Patch 到权威 World State。最终写入必须经过：

- schema validation；
- typed Command/Event 或受限 mutation contract；
- World reducer；
- Session Revision；
- Event Journal；
- branch-aware commit。

### 19.16 Round 2 能力分类

#### 已有较强 Native 基础，不应重造

- immutable Session / Revision / Branch；
- Retry / Re-enter / Restart；
- World State + schema；
- Event Journal；
- typed Command / Reducer / Rule；
- deterministic RNG；
- Native Knowledge 基础 discovery/lifecycle/relations；
- Prompt Program semantic targets；
- Native Regex 文本处理 scope；
- legacy Chat/Floor/Character State 给第三方插件使用。

#### 明确需要深化

- Opening Variant；
- Form / Local UI State；
- Expression / dynamic action args；
- Composer actions；
- Message Projection；
- Message snapshot projection；
- Reply Variant / swipe-like UX facade；
- Declarative lifecycle Trigger/Automation；
- Native Knowledge 高阶 discovery/delivery；
- Narrative Outcome Resolution；
- Package/Player preference state（待定）。

#### 只作为 Legacy compatibility bridge

- MVU provider；
- LoreState provider；
- Regex HTML frontend；
- legacy macro variable side effects；
- Slash script orchestration；
- mutable ST swipe/message ABI。

#### Native Package 不应重新开放

- 任意 Package JavaScript；
- 任意 HTML/script 注入；
- 直接 DOM ownership 绕过 Component runtime；
- `triggerSlash` 作为核心 Native API；
- 模板求值时隐式写状态；
- 直接改 committed Timeline；
- 让 UI / Regex 成为 World State 权威。

### 19.17 Round 2 第一轮审计结论

Round 2 的第一轮 capability inventory 已覆盖：

- opening / alternate greetings；
- swipe / retry / branch；
- message mutation；
- Regex；
- Quick Reply；
- Macro / variables；
- World Info；
- Prompt insertion；
- Tavern Helper / CardApp 常见行为；
- MVU read compatibility；
- MVU state update gap。

下一步进入 Round 3 前，最需要讨论并冻结五个产品决策：

1. Opening Variant 是“创建 Session 前选择”还是允许“Session 首楼无损切换”；
2. Reply Variant 是否统一用 Branch facade 对用户伪装成 swipe；
3. Lifecycle Automation 是否作为独立 Package resource；
4. Knowledge 动态启停优先使用 World State condition，还是开放 session-scoped entry override；
5. MVU Narrative Outcome Resolution 采用哪一条主路径。


---

## 二十、Round 3 — Component Model vNext（讨论草案）

### 20.1 版本策略：新增 Component Model v2

当前 v1 是一个刻意收敛的最小声明式模型，节点、binding、action 和 surface 都很少，且 validation fail-closed。

本次能力扩展规模已经涉及：

- Local UI State；
- Form；
- dynamic expression/template；
- 多事件 Action；
- Native Composer；
- 多 Surface / Overlay；
- dynamic list/repeat；
- rich content；
- safe appearance；
- 后续 Message Projection template。

因此建议：

- **保留 Component Model v1 原样兼容**；
- 新增 `componentModelVersion: 2`；
- 不让旧 Package 因新增语义发生行为漂移；
- v1 Package 可在 Studio 中显式升级为 v2，升级是 authoring migration，不是 runtime silent mutation。

### 20.2 v2 不再只是“一棵组件树”

建议 v2 的 UI resource 成为一个 Experience UI Document：

```text
Experience UI Document v2
├─ localState
├─ selectors
├─ theme / styles
├─ views
│  ├─ primary view
│  ├─ drawer/modal views
│  └─ component-mode extra surfaces
└─ templates
   └─ 为 Round 4 Message Projection 预留
```

Manifest 仍只引用一个明确的 package JSON resource；该 resource 内描述该 Experience 的完整声明式 UI。

### 20.3 View / Surface 模型

v1 的单一 `component + surface` 不足以表达真实角色卡。

v2 建议一个 Experience 可以有多个 View。

概念：

```json
{
  "views": [
    {
      "id": "main",
      "surface": "app.root",
      "mount": "always",
      "root": {}
    },
    {
      "id": "details",
      "surface": "drawer",
      "mount": "on-demand",
      "root": {}
    }
  ]
}
```

模式约束：

#### Component

- 不拥有 `app.root`；
- 可同时挂载多个 Atria 语义 surface；
- Conversation / Composer 布局由 Atria 保持；
- 后续允许 message-level projection surface。

#### Hybrid

- 必须有一个 `app.root` primary view；
- 可以在 primary view 中放置 Native Conversation / Composer slots；
- 可附加 modal/drawer 等 view。

#### Full

- 必须有一个 `app.root` primary view；
- Conversation / Composer slot 完全可选；
- 可只使用 Game Command / UI Action 驱动体验。

因此模式差异继续只由 Surface/Native-slot ownership 控制，而不是由组件能力控制。

### 20.4 Primitive 设计原则

不追求 HTML 标签一比一复制，而提供足够覆盖高阶角色卡的语义组件。

#### Layout

首版建议：

- `container`
- `stack`
- `grid`
- `scroll`
- `separator`

#### Content

- `text`
- `rich-text`
- `icon`
- `image`
- `badge`
- `progress`

`rich-text` 默认只允许受限 Markdown / Atria rich-text renderer，不允许 Package HTML/script。

#### Interaction

- `button`
- `details`
- `tabs`

#### Form

- `form`
- `input`
- `textarea`
- `select`
- `checkbox`
- `radio-group`
- `range`

#### Dynamic structure

- `repeat`

`repeat` 用于 inventory、角色列表、技能列表、任务列表等动态集合，不要求作者为每个元素手工创建 selector。

#### Native composition

- `native-slot: conversation`
- `native-slot: composer`

首版不加入 canvas/webview/raw-html 等逃逸节点。

### 20.5 Local UI State Contract

v2 正式引入 Local UI State。

推荐状态域：

#### `mount`

- 默认；
- View/Experience 卸载即丢失；
- 适合 tabs、展开状态、临时输入。

#### `session`

- 跟当前 Native Session 持久化；
- reload 后仍存在；
- **不进入 World State，不自动进入模型上下文**；
- 适合未完成的 setup wizard、用户 UI 偏好、草稿型表单。

首版暂不加入跨 Session 的 `player/account` UI state；如确有需要，后续独立设计 Package Player Preference State，避免和全局设置混淆。

Local UI State 必须：

- 有声明 schema/type；
- 有 default；
- 写入路径必须预先声明；
- 不允许 Component 随意创建未声明字段；
- 不允许作为 World authority；
- Session scope 的 commit 不应自动触发游戏 Event Journal。

### 20.6 Two-way Form Model

表单控件不要求作者手写：

```text
on.input → ui.set
```

每个表单控件可以声明受限的 `model`：

```text
input.value ↔ ui.wizard.name
checkbox.checked ↔ ui.wizard.enabled
select.value ↔ ui.wizard.race
```

`model` 只能写 Local UI State 的已声明路径。

World State 永远不允许 two-way binding。写 World 必须经过 typed Command/Event。

这能让普通开局表单保持简单，同时守住权威边界。

### 20.7 Selector / Expression / Template 分层

三个概念分开：

#### Selector

命名、可复用、可订阅的派生值。

适合：

- HP ratio；
- 当前地点显示；
- 某面板是否可见；
- 复杂重复使用条件。

#### Expression

短小、安全、纯函数。

允许读取的 root 由调用场景限定，候选包括：

- `world`
- `ui`
- `session`（只读安全投影，不是任意 namespace）
- `selectors`
- `env`
- `message`（Round 4）
- `item / index`（repeat）
- `event / form`（action）

需要在现有 Formula 基础上增加：

- string literal；
- string equality；
- 安全字符串拼接或对应函数；
- null/undefined-safe helper；
- 必要的 length/contains 等受限函数。

不加入：

- 任意 property enumeration；
- dynamic eval；
- function definition；
- assignment；
- network；
- randomness side effect。

#### Template

仅用于构造文本，例如 Composer prompt：

```text
姓名：{{ui.wizard.name}}
种族：{{ui.wizard.race}}
开局地点：{{selectors.startLocation}}
```

Template 只能读取 Expression 可见数据，不能执行 Action 或写状态。

### 20.8 Binding 模型

v1 只有 `text/value/hidden → selectorId`。

v2 建议至少支持：

- `text`
- `value`
- `checked`
- `disabled`
- `hidden`
- `progress/value`
- `image/source`
- `ariaLabel`

Binding value 可以来自：

- selector；
- direct safe expression；
- local state path。

为了可预测刷新，编译阶段提取表达式依赖；World/UI/Environment 变化只刷新受影响 binding，而不是重绘整棵 UI。

### 20.9 Action Model v2

Action 采用**有序 Action Sequence**。

事件首版建议：

- `click`
- `input`
- `change`
- `submit`

不急于开放任意 keydown/mouseover 等底层 DOM event。

Action 候选：

#### Local UI

- `ui.set`
- `ui.toggle`
- `ui.reset`

#### Game authority

- `command.dispatch`
- `command.simulate`

#### Composer

- `composer.set`
- `composer.append`
- `composer.clear`
- `composer.focus`
- `composer.submit`

#### Surface

- `surface.open`
- `surface.close`

#### Experience

- `view.activate`（仅在后续确认需要显式 route 时加入）

每个 Action 可有安全 `when` condition 和动态 Value Template。

Action Sequence 默认：

- 按声明顺序执行；
- 遇错误停止；
- 错误进入 Experience diagnostics；
- 不提供隐式 continue-on-error。

世界状态事务不通过“连续多个 command action”实现。需要原子世界更新时，Package 应定义**一个 typed Command，内部产生多个 Event**。

### 20.10 Native Composer Contract

Composer Action 不能通过寻找 DOM 节点再模拟 click 实现。

Experience Runtime 应拥有稳定 Host Composer capability：

```text
getDraft
setDraft
appendDraft
clearDraft
focus
submit
```

`composer.submit` 必须走和用户手动发送完全相同的 Native generation pipeline、revision boundary、Knowledge/Prompt resolution 和 diagnostics。

Component / Hybrid / Full 都可调用 Composer capability。

区别只是：

- Component：原生 Composer 一直由 Atria 显示；
- Hybrid：Package 可以把 Native Composer slot 放到自己的布局；
- Full：Package 可以完全不显示 Composer，但仍可通过明确 Action 发起基于用户选择构造的文本 turn。

### 20.11 Form Submit

`form` 是语义组件，不只是 container。

Submit 时 Runtime 提供只读 `form` context，包含当前表单已绑定字段。

典型自定义开局：

```text
form submit
  ↓
validate Local UI State
  ↓
composer.set(template)
  ↓
composer.submit
  ↓
ui.reset / 切换正常布局
```

Field validation 首版候选：

- required；
- min/max；
- minLength/maxLength；
- enum；
- pattern（受限 regex）；
- numeric step。

复杂跨字段验证可使用 Expression condition。

### 20.12 Dynamic Repeat

动态状态栏必须可以消费结构化数组/对象。

建议：

```text
repeat
├─ source: expression/selector
├─ itemName
├─ indexName
├─ key expression
└─ child template
```

运行时限制：

- 单个 repeat 最大 item 数；
- Experience 最大动态 rendered-node 数；
- stable key 必须唯一；
- 超限 fail closed / diagnostics；
- 不允许通过 repeat 绕过静态组件复杂度限制。

对象 map 的迭代是否首版支持，尚待决定；优先支持数组。

### 20.13 Conditional Rendering

不新增大量 `if/switch` DOM 类型。

普通条件通过统一 `when` / visibility expression。

例如：

```text
when: ui.wizard.step == 1
when: world.player.hp <= 0
when: env.device == "mobile"
```

复杂分支可以使用多个互斥 container/view。

这样 condition contract 可与 Prompt/Rule 的安全表达式设计逐步统一。

### 20.14 Responsive / Environment

v1 的 `mobile/tablet/desktop + portrait/landscape` 保留，但 v2 建议把这些作为只读 `env`：

- `env.device`
- `env.orientation`
- `env.reducedMotion`
- `env.pointer`（如确有必要）
- safe-area 类信息不直接暴露数值给 Package，交给 Host layout。

Package 可以用 `when` 控制结构差异。

样式层可以允许 device profile override，但不允许 Package 自己定义任意 viewport media query。

### 20.15 Safe Appearance / Theme

如果没有 Native 样式能力，v2 仍然无法真正替代大量 Regex HTML/CSS 卡。

但也不应该重新开放任意 CSS。

建议两层：

#### Atria semantic appearance

例如：

- surface/panel/card；
- tone: neutral/accent/success/warning/danger；
- density；
- radius；
- elevation；
- typography role；
- spacing token。

默认跟随 Atria theme。

#### Safe style overrides

只允许 allowlist：

- flex/grid layout；
- gap；
- padding/margin；
- width/max-width/min-width；
- height/min/max；
- alignment；
- overflow；
- text align / weight / size / line-height；
- color/background color；
- border/color/radius；
- opacity；
- bounded shadow token。

禁止：

- arbitrary selector；
- `url()`；
- external background；
- `content`；
- animation script-like behavior；
- fixed viewport takeover；
- arbitrary z-index；
- CSS variable injection；
- property values containing unsupported functions。

Image 通过 `image` 组件和 Package Asset contract 提供，而不是 CSS URL。

目标不是让作者写 CSS，而是在安全 declarative layout 下仍有足够角色卡审美空间。

### 20.16 Rich Text

`rich-text` 用于：

- Markdown；
- emphasis；
- lists；
- code / quote；
-安全链接策略（是否首版允许外链待定）。

不允许 raw HTML。

模型正文仍由 Conversation / Message Projection own renderer；Package `rich-text` 主要用于自定义面板、说明和 message block。

### 20.17 Accessibility

v2 contract 必须在 schema 层支持：

- label；
- description；
- ariaLabel；
- semantic role（仅 allowlist）；
- form error association；
- button disabled；
- modal/drawer focus ownership 继续由 Host 管理。

不能让 Package 自己实现 focus trap。

### 20.18 性能与限制

建议继续 fail-closed：

- static component node limit；
- component nesting limit；
- selector count；
- expression length/depth；
- action sequence length；
- repeat item limit；
- total rendered dynamic node limit；
- template output length；
- per-event action execution budget。

v2 的强大来自“更多受控语义”，不是取消限制。

### 20.19 与 Message Projection 的接口预留

Round 3 不直接定 Message Projection schema，但 v2 需要预留 reusable `templates`。

后续一条 Message Block 可以引用：

```text
templateId + block data + message snapshot context
```

而不是动态携带一整份任意 UI tree。

这使：

- 状态栏；
- story options；
- 战斗结算；
- message card

可以复用 Package 已编译验证的 Component template。

### 20.20 Round 3 当前建议冻结项

建议直接冻结：

1. v1 保持兼容，新增 **Component Model v2**。
2. v2 是 Experience UI Document，而不是只有单 tree。
3. 三模式共享所有 primitive/form/action 能力。
4. 模式差异继续只体现为 Surface / Native-slot ownership。
5. Local UI State 首版只有 `mount` 与 `session` scope。
6. Form 控件允许 two-way model，但**只能写 Local UI State**。
7. World State 写入永远经过 typed Command/Event。
8. Expression/Template 必须纯函数、无副作用。
9. Action 采用有序 sequence；世界原子操作由单一 typed Command 承担。
10. Native Composer 成为正式 Host capability，不通过 DOM/Slash 模拟。
11. Dynamic list 使用受限 `repeat`。
12. 不支持 raw HTML / Package JS / arbitrary CSS。
13. v2 增加足够的 safe appearance 能力替代常见卡 CSS。
14. 为 Round 4 Message Projection 预留 reusable component templates。

### 20.21 Round 3 尚需继续商讨的点

下一轮讨论前，仍有几个会直接影响 v2 contract 的问题：

1. **UI State session scope 是否跟 Branch 回滚？**
   - setup wizard 草稿通常不该随剧情 Branch 回滚；
   - 但某些 UI state 可能希望跟随 Revision。
   - 当前倾向：Local UI State 永远非剧情权威，不随 Branch；需要回滚的东西就应该进入 World/Session authoritative state。

2. **safe style 的自由度**
   - 太窄会无法替代精美 HTML 卡；
   - 太宽会重新形成 CSS 沙盒逃逸。
   - 需要在 Studio preview 中验证可表达性。

3. **Expression 是否支持直接字符串拼接**
   - 当前倾向：Formula 负责逻辑/数值，Template 负责字符串组合，避免 `+` 同时承担数字和字符串语义。

4. **对象 repeat**
   - 当前倾向首版只支持数组；对象需要作者通过 selector/projector 转成数组，contract 更简单、顺序更确定。

5. **Full 无 Composer 时的 `composer.submit`**
   - 当前倾向仍允许，因为 Composer capability 是 Host generation service，不要求视觉 Composer slot 存在。

---

## 二十一、重前端 MVU 案例审计：太阁立志前端正则

本轮使用一份约 611 KB 的重前端 MVU Regex 成品作为压力样本。该成品表面上是 AI_OUTPUT Regex HTML，实质上已经是一套完整 Vue/Pinia 单页游戏前端：

- 24 个 Vue Component；
- 自定义开局 Prologue + Setup Form；
- 正文阅读与历史楼层阅读；
- 选项直发 / 回填；
- 人物、势力、个人、世界、地图等多 Panel；
- Town / Store / Trade Drawer & Modal；
- Hex Battle；
- 卡片/称号解锁 UI；
- PC / mobile / handheld 三种布局；
- Fullscreen / pseudo-fullscreen；
- Gamepad focus/navigation；
- LocalStorage 偏好与自动存档；
- MVU `stat_data` 读写；
- AI 输出标签解析；
- 自定义消息生成流水线。

这类案例说明，未来 Atria 不能只以“状态栏”理解 MVU 前端生态。高阶卡已经把 Regex HTML 当成了一个轻量游戏运行容器。

### 21.1 应吸收的精华：四层前端状态

该样本实际存在四种不同状态，不应继续混成一个 `stat_data`：

1. **Authoritative World State**
   - 人物属性；
   - 技能等级；
   - 装备；
   - 金钱 / 物品；
   - 世界时间 / 地点；
   - 势力 / 事件；
   - 战斗最终结果。

2. **Local UI State**
   - 当前 tab；
   - modal / drawer 是否打开；
   - 当前选中地点 / 商店；
   - shopping cart；
   - battle cursor / pending selection；
   - setup form fields；
   - reading mode。

3. **Player Preference State**
   - PC/mobile/handheld display mode；
   - option click 是“直发”还是“回填”；
   - UI zoom / input preference 等。

4. **Message / Projection State**
   - 当前正文；
   - `options`；
   - `BattleStart`；
   - `Awaken`；
   - `Title`；
   - 当前 message-local structured blocks。

因此 v2 设计需要在既有 Local UI State 之外，预留独立的 **Package Player Preference State**。它不属于 World，不随 Branch 回滚，也不应由角色卡写入任意 account settings。

### 21.2 Read-only Package Data Resources

该样本大量内置：

- 技能定义；
- 称号定义；
- 物品 catalog；
- 城镇/设施 catalog；
- 历史事件 timeline；
- 地图节点；
- 地图道路；
- 价格表；
- 战斗地图定义。

这些既不是 World State，也不是 UI State，而是**版本化只读 Package Data**。

因此新增设计结论：

> Component Model v2 / Game Runtime 必须能安全读取 Package-owned JSON Data Resource。

候选：

```text
data.catalog.*
data.table.*
data.graph.*
```

具体资源类型可以后续统一成一个 `data` resource + schema，不必一开始分太细。

Selector / Expression / Command 均可只读访问该资源，但不能运行 Package JS。

### 21.3 Derived State / Projection

该前端大量逻辑不是“写变量”，而是从权威状态派生：

- 称号 bonus → effective stats；
- 当前地点 → 可访问设施；
- 当前持有物 → 可售商品；
- 身份/日期 → 历史事件；
- 位置/道路 → 路径；
- 装备名 → 战斗属性；
- 技能/流派 → 可解锁卡片。

这说明 Selector 不能只做标量公式。

v2 后续需要一个**受限 Data Projection 能力**，至少能覆盖：

- lookup；
- filter；
- map/project；
- sort；
- contains；
- length；
- object/array → stable array projection。

复杂图算法（如 shortest path）不应通过任意 JS 实现；可后续作为经过审计的标准 builtin 能力加入。

### 21.4 Message Projection 已有现实原型

该样本会从 assistant message 中解析：

- narrative container；
- options；
- battle setup JSON；
- unlock/title tags。

然后分别映射到正文、Quick Action、Battle UI、Card UI。

这正是 Round 4 Message Projection 所要 Native 化的现实原型：

```text
Assistant Turn Result
├─ narrative
├─ structured blocks
├─ actions
└─ typed outcome hints
```

不应再靠 Regex 扫 HTML tag + JS DOM。

### 21.5 Host Capability 需求补充

该样本还暴露出 v2 必须考虑的 Host capability：

- Composer prefill / submit；
- Native generation busy state；
- History/Timeline read；
- Save/Restore；
- Fullscreen；
- keyboard focus；
- Gamepad navigation；
- responsive device/orientation；
- modal/drawer focus ownership。

其中：

- Save/Load 应落到 Native SavePoint / Branch；
- Fullscreen 应为显式 Host capability；
- Gamepad / keyboard focus 应由 Host 提供语义 focus navigation，而不是 Package 自己遍历 DOM；
- Package 只声明 focusable/action priority，不自行接管全局 input。

### 21.6 Heavy Frontend 与模式边界

这类前端不代表所有 MVU 卡都应使用 Full。

判断仍看布局 ownership：

- 仅正文尾状态 / Quick Actions → Component；
- 仍以聊天为中心，但有 Setup / Town / Map / Inventory / Battle overlay → Hybrid；
- Package 主界面完全替代聊天，Conversation 只是一个可选服务 → Full。

模式与“前端复杂度”仍然正交。

### 21.7 “额外变量更新 API”分析

如果“额外变量更新 API”指：

> 允许前端像 `Mvu.replaceMvuData()` 一样直接对任意 World State 路径做 patch，

则**不建议引入**。弊大于利。

主要问题：

- 形成 UI 与 Game Runtime 双重事实源；
- 绕过 Command validator / reducer；
- 绕过 Event Journal；
- Branch / Retry / SavePoint 难以正确回滚；
- 很难回答“谁改了这个变量、为什么改”；
- UI mount/refresh 可能产生隐藏副作用；
- 迁移、schema version、权限和 diagnostics 都会恶化；
- Package UI 一旦有任意 patch 权限，声明式安全边界被实质打穿。

但是该样本明确证明另一件事：

> **Atria 必须支持“不调用 LLM，也能由 UI 触发权威状态变化”。**

例如：

- 换装备；
- 购买/出售；
- 增加训练经验；
- 领取称号；
- 战斗结算；
- 初始化住所；
- 应用历史事件；
- 使用道具。

这个能力**利大于弊，而且是重前端游戏卡必需的**。

### 21.8 结论：引入“能力”，不引入“裸 patch API”

建议不新增第二套 `world.patch(path, value)`。

继续以：

```text
UI
 ↓
typed Command
 ↓
validator
 ↓
Event
 ↓
Reducer
 ↓
World State
 ↓
Session Revision / Event Journal
```

作为唯一权威写入路径。

为了避免每个简单变量修改都必须手写 Command + Event + Reducer 三层 boilerplate，可以在 authoring 层增加 **Declarative Mutation shorthand**。

例如概念上：

```json
{
  "id": "equipment.set",
  "argsSchema": {
    "slot": "string",
    "item": "string"
  },
  "when": "catalog/equipment contains args.item",
  "assign": {
    "player.equipment[args.slot]": "args.item"
  },
  "event": "equipment.changed"
}
```

Build 时将其**编译/降低成标准 Command → Event → Reducer**。

因此：

- Runtime 仍只有一个 authority；
- Studio 作者写起来接近 MVU 的“更新变量”；
- importer 也容易把常见 `replaceMvuData` 操作迁移成 Native Mutation；
- 每次变更仍有 Revision / Event / provenance。

### 21.9 Mutation shorthand 的边界

适合：

- 单纯赋值；
- 增减计数；
- array/object add/remove；
- 小规模 deterministic patch；
- 初始化明确缺省字段；
- UI 操作产生的简单状态改变。

不适合：

- 交易事务；
- 战斗结算；
- 多条件技能升级；
- RNG；
- 跨多个复杂对象的原子规则；
- 需要 chained Rule 的逻辑。

这些仍使用正式 typed Command。

建议 Mutation shorthand 必须：

- 声明允许写入的 schema path；
- args 经过 schema 验证；
- expression 纯函数；
- 不能动态构造任意 root path；
- transaction atomic；
- mutation 自动生成/关联 Event；
- 进入 Revision / Journal；
- Branch-aware；
- 有 before/after diagnostics；
- 支持 simulate / preview；
- 不允许从 component render/mount 自动执行，只能由明确 Action 或受控 lifecycle trigger 调用。

### 21.10 初始化与数据迁移单独处理

该样本还会在 UI refresh 时修正旧字段、清理旧物品字段，这在 legacy MVU 中很实用，但 Native 不能让 Component mount 顺手改 World State。

需要单独设计：

- Package / World schema migration；
- Session bootstrap；
- versioned one-shot migration。

它们必须幂等、有版本、有 provenance，并与普通 UI mutation 分离。

### 21.11 Autosave / Load 不使用变量 API

该样本用 LocalStorage 保存：

- floor id；
- MVU snapshot；
- preview；

读档时删除后续 chat floors，再 replace MVU snapshot。

Native 不应复制这个模式。

直接映射为：

- Quick Save → Native SavePoint；
- Load → restore/fork from Revision；
- 历史阅读 → Timeline projection；
- 分支切换 → Branch facade。

### 21.12 Round 3 增补冻结建议

基于该重前端案例，建议新增冻结项：

1. v2 增加 read-only Package Data Resource。
2. Selector 后续增加受限 Data Projection，不只标量公式。
3. 设计 Package Player Preference State，与 Local UI / World State 分离。
4. 增加 Host Fullscreen capability。
5. Host 统一承担 keyboard/gamepad focus navigation。
6. 引入 **Declarative Mutation shorthand**，但 Runtime 仍统一降低到 Command/Event/Reducer。
7. 不提供任意 World State patch API。
8. UI mount/render 不允许隐式修改 World State。
9. 初始化/迁移使用独立 versioned bootstrap/migration contract。
10. Message Projection 需要直接支持 structured block，而不是依赖 Regex HTML tag parser。


---

## 二十二、Round 4 — Message Projection / Turn Envelope

### 22.1 当前缺口

当前 Native Timeline/Variant 已经可以保存：

- immutable `content`；
- arbitrary JSON `metadata`；
- Branch / Revision / active Variant identity。

但 Native Play 当前只把 `entry.content` 当纯文本渲染，完全没有经过验证的一等 Message Presentation contract。

不能简单把未来复杂 UI 塞进 `metadata.atri_xxx`，否则：

- schema 无法验证；
- Studio 无法 authoring / preview；
- Package 输出权限无法限制；
- Save / migration 无法形成稳定契约；
- 模型可能间接生成任意 UI tree。

因此 Message Projection 应成为**一等 Native contract**，而不是 metadata convention。

### 22.2 核心模型：Assistant Turn Envelope

建议所有复杂 Native RP/Game 回复最终统一规范化为一个 **Turn Envelope**。

概念：

```text
Assistant Turn Envelope
├─ narrative
│  └─ canonical prose
├─ projection
│  └─ display-only structured blocks
├─ outcomes
│  └─ authority proposals / committed events
└─ diagnostics/provenance
```

四者必须明确分离。

#### narrative

- 写入 Timeline canonical `content`；
- 参与未来 history；
- 用户可复制/阅读；
- 不包含 Regex HTML、UI JSON 或内部控制标签。

#### projection

- 只负责表现；
- 默认不进入未来 Prompt；
- 通过已验证 Component template 渲染；
- 可以包含 Quick Actions、状态快照、提示卡、结算卡等。

#### outcomes

- 可能影响 World State；
- 不能由 Projection 直接写；
- 必须经过 schema + typed outcome/command/event + reducer；
- 最终进入 Revision / Event Journal。

#### diagnostics/provenance

- parser/validator/routing 等运行信息；
- 不作为角色正文；
- 不作为 Package 可任意渲染的隐藏思维通道。

### 22.3 Message Projection 属于 immutable Variant

Projection 应与**消息 Variant**绑定，而不是与“当前 World State”绑定。

原因：

- Retry 会产生新 Branch / Attempt；
- 每个回复版本可能有不同 options/status/battle card；
- 切回复版本时 projection 必须一起切；
- Save / Restore / Branch 必须得到当时准确的 UI。

因此建议未来：

```text
Variant
├─ content
├─ projection
├─ metadata/provenance
└─ createdAt
```

Timeline 只投影当前 Branch 上的 active reply。

不建议让 Message Projection 作为普通 mutable Session UI state 存储。

### 22.4 Projection Flow：支持正文前/后/穿插组件

不能只支持 `message.after`。

传统 MVU 卡存在：

- 正文前提示；
- 正文中穿插状态块；
- 正文尾状态栏；
- 正文尾 options。

因此 projection 需要一个**有序 Flow**。

概念：

```json
{
  "flow": [
    { "kind": "prose", "text": "第一段正文..." },
    { "kind": "block", "type": "scene-status", "data": {} },
    { "kind": "prose", "text": "后续正文..." },
    { "kind": "block", "type": "quick-actions", "data": {} }
  ]
}
```

Runtime 同时计算：

```text
canonical content
= concatenate(all prose segments)
```

并验证 Timeline `content` 与 projection prose 的 canonical result 一致。

这样：

- Prompt history 永远使用纯 narrative；
- 显示层可以任意穿插 Native block；
- 不需要把 `<status>` 标签留在历史正文；
- display/prompt separation 成为数据结构本身，而不是 Regex trick。

### 22.5 模型不能生成 Component Tree

这是安全边界。

模型只允许返回：

```text
block type + block data
```

例如：

```json
{
  "type": "quick-actions",
  "data": {
    "items": [
      { "id": "a", "label": "前往城下町", "text": "前往城下町" }
    ]
  }
}
```

Package 在 Build 时已经声明：

```text
quick-actions
→ templateId
→ dataSchema
→ allowedActions
→ maxInstances
```

真正 UI tree 来自 Package 内经过验证的 reusable Component template。

因此模型不能：

- 创建新的 button command；
- 注入 style；
- 注入 template；
- 注入 HTML；
- 选择未声明 Host capability。

### 22.6 Message Block Template

Component Model v2 的 `templates` 在本轮正式找到用途。

Template render context 建议仅允许：

- `block`：immutable block data；
- `message`：当前 message/variant 的安全 metadata；
- `packageData`：只读 Package Data Resource；
- `preference`：允许的 Player Preference；
- `env`；
- template-local UI state。

默认**不允许直接读取 live `world`**。

原因：历史消息如果直接绑定当前 World State，会发生“第 10 楼的状态栏随着第 50 楼状态变化”的错误。

需要当前实时世界状态的 UI 应放在：

- Component surface HUD；
- Hybrid/Full live panel；

而不是历史 Message Block。

### 22.7 Snapshot Projection

如果一条消息需要显示“当时状态”，Runtime 在 Turn commit 时将需要的 selector 值物化进 block data。

例如：

```text
第 20 楼结束
HP 72 / 100
地点：清洲
金钱：120贯
```

这些是 message snapshot。

Projection 不需要复制整个 World State，只物化 template/data schema 所需字段。

每个 projection 记录：

- source message / variant；
- source Branch / Revision；
- optional Event IDs；
- template type/version；
- data snapshot。

### 22.8 对“太阁立志”标签的 Native 映射

该压力样本当前从 assistant text 中识别：

#### narrative tags

`<taikou>` / `<content>` / `<scene>` / `<story_scene>` / `<正文>`

Native：

> canonical `narrative` / prose flow

#### `<options>`

Native：

> `quick-actions` Message Block

其中按钮行为读取 Player Preference：

- `prefill` → `composer.set`
- `submit` → `composer.submit`

不需要 Package JS。

#### `<BattleStart>{...}</BattleStart>`

不能只作为 UI block。

建议：

```text
validated battle-start outcome
        ↓
battle.started Event / battle state
        ↓
projection shows battle-start card/button
        ↓
surface.open("battle")
```

Battle 数据必须经过 Package schema，不能让模型 JSON 直接成为 Game Runtime authority。

#### `<Awaken>`

Native：

> `skill.unlocked` / `card.unlocked` outcome/event → unlock-card projection

#### `<Title>`

Native：

> `title.unlocked` outcome/event → title-card projection

不能继续由前端扫描标签后直接写 World State。

#### thinking / driver tags

样本会主动删除 thinking / inner_flow / combat_driver / story_driver 一类内部标签。

Native 不把它们当 Message Projection。

如果某些内部 producer 需要这些数据，应通过 Orchestrator / Outcome / diagnostics 的正式通道存在，不进入 committed narrative。

### 22.9 Prompt / Display 隔离规则

默认规则建议直接冻结：

1. `narrative` → 进入 Timeline + Prompt history。
2. `projection blocks` → **display-only**，不进入 Prompt。
3. `outcomes` → 通过 World State / Event Observation 进入未来模型上下文，而不是把 block JSON 塞回聊天。
4. 用户点击 Quick Action 后真正发送的文本 → 成为新的 user Timeline content。
5. 如果 Package 确实需要某段 structured data进入 Prompt，应使用 Prompt Module / Observation / Knowledge，不由 Message Projection 自己声明 prompt injection。

这比 legacy `markdownOnly / promptOnly` 更清晰。

### 22.10 Historical Message Action

Message Block 可能带可交互按钮。

必须区分：

#### UI-only

例如：

- 展开；
- 打开详情；
- 浏览旧战斗结果；
- 复制文本。

历史楼层也可执行。

#### Turn-producing / authority action

例如：

- 发送某个旧 options；
- 从旧战斗卡继续；
- 在旧楼层调用 Command。

默认只能作用于 active tail。

如果用户在历史楼层执行，Host 必须：

```text
确认
 ↓
从该 message/revision Fork
 ↓
切到派生 Branch
 ↓
执行 action
```

Package 不接触 raw Branch ID。

建议 action policy：

- `ui-only`
- `active-tail`
- `fork-from-anchor`

不提供“把历史按钮直接写进当前最新世界”的隐式模式。

### 22.11 Reply Variant 与 Projection

用户看到的 swipe-like UX：

```text
‹ Reply 2 / 4 ›
```

底层仍然是 Attempt/Branch facade。

切换 Reply Variant 时同时切：

- narrative；
- projection；
- World State Revision；
- Event Journal；
- Knowledge runtime state；
- relevant Session state。

因此不会出现 legacy 常见问题：

> 文本已经 swipe 了，但状态栏仍然属于上一版。

### 22.12 输出 Transport 与 Projection Contract 解耦

Turn Envelope 是 canonical contract，但模型供应商的输出方式不能被绑死。

建议支持三类 adapter：

#### A. Native structured-output adapter

Provider 支持 `generation.structured-output` 时，模型返回符合 Package Turn Output Schema 的结构化对象。

优点：

- 最严格；
- schema 校验清晰；
- outcome / block 数据天然分离。

#### B. Native text-envelope adapter

模型仍输出文本，但使用 Atria 受控 envelope / delimited JSON sidecar。

Runtime 解析成同一个 Turn Envelope。

可保留较好的 narrative streaming。

#### C. Legacy tag adapter

只作为 importer / compatibility：

- literal/tag extraction；
- JSON block extraction；
- option-list parser；
- fixed mapping → known block/outcome type。

不执行 HTML，不执行 JS，不执行 Regex replacement UI。

这样可以迁移已有：

- `<options>`
- `<BattleStart>`
- `<status>`
- `<Awaken>`
- `<Title>`

而无需要求旧卡一次性重写模型输出格式。

### 22.13 Legacy Parser 不等于重新开放 Regex UI

兼容 parser 的权限只到：

```text
raw model text
 ↓
safe extractor
 ↓
typed data
 ↓
validated Turn Envelope
```

不能：

```text
raw model text
 ↓
replaceString
 ↓
HTML/JS
```

候选安全 extractor：

- literal tag body；
- JSON object body；
- line list；
- numbered choices；
- delimited prose；
- schema-validated scalar/list/object。

是否允许 arbitrary regex extractor 需谨慎；当前倾向首版只允许有限 parser primitive，复杂 Regex 留在 legacy Regex engine，而不是 Native projection parser。

### 22.14 Streaming

必须避免“为了 structured UI 牺牲所有 streaming”。

建议：

- narrative draft 可持续 streaming；
- projection/outcome 默认在本轮 finalize 时才显示/提交；
- authoritive outcome 永远不能在 streaming 中途 commit；
- Quick Actions / BattleStart / Unlock Card 在 final validation 后出现。

如果采用 text-envelope：

```text
stream narrative
 ↓
sidecar arrives
 ↓
validate projection/outcome
 ↓
finalize Turn
```

如果 provider structured-output 无法安全流 prose，则 adapter 可以选择：

- buffered structured response；
- 或使用后处理 resolver。

具体 provider policy 留到 Runtime 实施阶段。

### 22.15 Atomic Turn Commit

复杂 Turn 必须避免：

```text
正文已保存
→ outcome 校验失败
→ World State 没更新
```

Native 目标：

```text
Draft narrative/projection/outcomes
 ↓
validate all required contracts
 ↓
simulate authoritative outcomes
 ↓
全部成功
 ↓
commit one Turn boundary
   ├─ Timeline Variant
   ├─ Projection
   ├─ World State
   ├─ Event Journal
   └─ Knowledge/runtime state
```

Presentation-only block 失败可以按 Package policy：

- required → 整轮失败；
- optional → block dropped + diagnostics。

Authority outcome 校验失败不能静默忽略后提交 narrative，除非 Package 明确声明该 outcome 是 optional advisory。

### 22.16 Conversation Host 需要 presentation mode

“太阁立志”这类 Hybrid 前端不是普通消息流，而是：

- 主界面显示最新正文；
- 另有 ReadingMode 浏览历史。

不应该逼 Package 自己调用 raw Timeline API 再造消息系统。

建议 Native Conversation Host v2 支持受控 presentation：

- `feed`：正常聊天消息流；
- `latest`：只显示当前 active turn；
- `reader`：只读历史阅读模式。

它们都消费同一 Timeline + Message Projection。

Package 可以决定把哪个 Host view 放在哪，但不拥有 Timeline persistence。

是否把 `reader` 做成 slot mode 还是独立 `timeline-reader` native component，后续实现前再定。

### 22.17 与 Declarative Mutation 的边界

Projection block 自己没有 World write 权限。

例如购物、换装备、战斗按钮：

```text
Message/Surface Component
 ↓
Action
 ↓
Mutation shorthand / typed Command
 ↓
Event/Reducer
 ↓
World State
```

如果某个 Message Block 只是“显示模型建议”，则：

```text
block
 ↓
composer.set / submit
```

这两条路径不能混。

### 22.18 Message-local UI State

Block 内允许少量非权威 Local UI State，例如：

- details open/closed；
- page；
- selected tab；
- hover/focus；
- 当前浏览索引。

默认生命周期：

- mount-only；
- 不写 Session State；
- 不随 Branch 形成权威变化。

如果需要持久化用户偏好，例如“options 点击默认直发”，使用 Player Preference State，而不是 message-local state。

### 22.19 Round 4 建议冻结项

建议冻结：

1. Message Projection 成为一等 Native contract，不塞进 arbitrary metadata convention。
2. Projection 与 immutable Variant 绑定。
3. Turn Envelope 分为 narrative / projection / outcomes / diagnostics。
4. Projection 使用 ordered flow，支持正文前、后和穿插 block。
5. Timeline canonical content 只由 prose segments 构成。
6. 模型只能生成 block type + validated data，不能生成 Component tree。
7. block UI 来自 Package 预编译 template。
8. Message Block 默认 snapshot-only，不直接绑定 live World State。
9. Projection display-only，不能自行注入 Prompt。
10. outcome 通过 World/Event authority 进入未来上下文。
11. Historical authority action 默认 active-tail；旧楼执行必须显式 fork。
12. Reply Variant facade 切换时同时恢复 projection + state。
13. Turn Envelope 与 provider output transport 解耦。
14. legacy tag parser 仅做 typed extraction，不执行 HTML/JS。
15. streaming narrative 可以先显示，但 authoritative outcome 只能 finalize 时 commit。
16. required narrative/projection/outcome 形成 atomic Turn commit。
17. Native Conversation Host 增加 feed/latest/reader 一类 presentation 能力。
18. Message-local UI state 与 World/Player Preference 分离。

### 22.20 Round 4 最终收敛

#### A. 区分 Package Turn Contract、Model Turn Output、Committed Turn Envelope

不把三者混成一个 schema。

**Package Turn Contract** 是作者声明的规则：

- 允许哪些 Message Block；
- 每种 Block 的 data schema；
- 对应哪个 Component template；
- 是否 required；
- 允许哪些 actions；
- 允许哪些 outcome；
- outcome schema 与 command/event mapping；
- transport policy；
- legacy extractor；
- failure policy。

**Model Turn Output** 是模型一次生成允许返回的最小结构。建议 canonical 形态：

```json
{
  "schemaVersion": 1,
  "flow": [
    { "kind": "prose", "text": "..." },
    { "kind": "block", "type": "story-options", "data": {} }
  ],
  "outcomes": [
    { "type": "relationship.changed", "data": {} }
  ]
}
```

模型不生成：

- templateId；
- required/optional；
- action implementation；
- CSS；
- asset URL；
- provenance；
- diagnostics；
- Revision/Branch identity。

这些全部由 Package Contract + Runtime 补齐。

**Committed Turn Envelope** 是验证、解析、authority resolution 后写入 Native Session 的结果：

```text
CommittedTurn
├─ canonicalContent
├─ projection
│  └─ normalized flow + block snapshots
├─ committedOutcomes
│  └─ Event/Command provenance
└─ diagnostics/provenance
```

### 22.21 canonical prose flow 的存储方式

最终采用：

> **Variant.content 为唯一 canonical prose；Projection prose segment 使用 range 引用。**

Runtime 接收 Model Turn Output 后：

1. 按 flow 顺序拼接所有 `prose.text`，不自动增加分隔符；
2. 形成 `Variant.content`；
3. 将每个 prose segment 归一化为 `{ kind: "prose", start, end }`；
4. block 保持在 flow 原位置；
5. 校验所有 prose range 单调、无重叠、完整对应 canonical content。

因此 committed projection 不重复保存整段正文。

概念：

```json
{
  "content": "第一段\n\n第二段",
  "projection": {
    "flow": [
      { "kind": "prose", "start": 0, "end": 5 },
      { "kind": "block", "blockId": "...", "type": "status", "data": {} },
      { "kind": "prose", "start": 5, "end": 8 }
    ]
  }
}
```

range 使用 Runtime 内部字符串 offset；Package / 模型不直接提供 offset。

### 22.22 Block Registry 独立于 UI Document

Block Registry 不放进 Component Model v2 UI Document。

原因：

- Block type 是模型输出 contract 与 runtime validation authority；
- template 是 UI presentation；
- 同一个 block type 未来可能有不同 presentation；
- Text Experience / accessibility fallback 也需要认识 block，不应反向依赖整个 UI tree。

因此建议新增独立 **Package Turn Contract / Message Projection resource**。

它引用：

```text
block type
→ data schema
→ Component v2 templateId
→ text fallback
→ action policy
→ requirement
```

UI Document 只负责声明 template 本身。

### 22.23 Provider Transport 优先级

Atria 当前 Native Model/Prompt Runtime 已有真正的 `outputContract`，并把它作为 `generation.structured-output` requirement；OpenAI-compatible、Anthropic、Gemini Native adapters 都已有 JSON Schema 映射。

因此 Native Package 默认优先级冻结为：

```text
1. structured-output
2. text-envelope
3. legacy extractor（仅兼容/导入）
```

但不是无条件偷偷降级。

Package Turn Contract 声明 policy：

- `structured-required`
- `structured-preferred`
- `text-compatible`
- `legacy-compatible`

其中推荐默认：

> `structured-preferred`

Route 有 `generation.structured-output` 时使用现有 `PromptIR.outputContract`。

没有该能力时，只有 Package 明确允许 text transport 才转入 text-envelope；不能让 GenerationService 的 provider fallback 静默丢掉 output authority。

### 22.24 不默认增加“修复模型调用”

required output 校验失败时，**默认不自动再调用一次模型修复**。

原因：

- 隐式增加延迟；
- 隐式增加 token/费用；
- 行为难解释；
- 用户停止/重试语义复杂；
- structured-output 本来就应该承担 schema 约束。

默认策略：

- structured response schema/required outcome invalid → Turn 失败，不 commit；
- text-envelope required parse invalid → Turn 失败，不 commit；
- optional block invalid → drop block + diagnostics；
- optional non-authority decoration invalid → narrative 仍可 commit；
- authority outcome invalid → 不允许静默丢弃后提交剧情。

未来可提供显式 Package policy：

`repair: none | once`

但 `none` 为默认，并且 Studio 必须显示该行为会额外增加一次 generation。

### 22.25 required/optional 的控制权属于 Package

模型不能自己声明：

```text
"required": false
```

Block/Outcome requirement 固定在 Package Turn Contract。

例如：

- `story-options`：optional 或 required，由卡作者决定；
- `battle-start`：如果该玩法必须进入战斗，可 required；
- `unlock-card`：projection 可 optional，但对应的 `skill.unlocked` outcome 若生成则必须合法；
- authoritive outcome：默认 required-on-presence。

这避免模型通过把错误数据标成 optional 绕过 contract。

### 22.26 Projection 可以引用 Asset，但只能引用 Package Authority

允许 Message template 使用图片/音频等 Package Asset。

但模型不得返回任意 URL。

允许方式：

1. template 静态引用 exact Package `assetId`；
2. block data 使用由 Package Contract 限制的 asset key/enum；
3. Runtime 将 key 解析到当前 pinned PackageVersion 的 exact AssetRef。

禁止：

- model-supplied `https://...`；
- CSS `url()`；
- dynamic arbitrary filesystem path。

现有 AssetRef 已拥有 `assetId + contentHash + mediaType + logicalName`，可直接作为基础。

Session/generated attachment 是另一条 authority，不在 Message Block 首版混入。

### 22.27 Message Template 可读 Context 白名单

冻结为：

- `block`：当前 immutable block snapshot data；
- `message`：安全 message presentation metadata；
- `packageData`：只读 pinned Package Data Resource；
- `preference`：Package 声明可读的 Player Preference key；
- `env`：响应式/无障碍环境；
- `local`：该 block mount-local UI state；
- `item/index`：repeat scope；
- `asset`：只读 Package asset resolver；
- `i18n`：Package localization resolver。

明确禁止：

- live `world`；
- arbitrary Session State；
- other messages；
- raw Timeline；
- secrets；
- network；
- plugin globals；
- DOM。

需要实时世界状态的 UI 应移到 Experience View；需要“当时世界状态”的 block 在 commit 时物化到 `block.data`。

### 22.28 Opening Variant 的复用边界

**静态 Opening Variant** 可以复用同一个 Turn/Projection flow。

即一个 opening 可以包含：

- prose；
- 状态卡；
- opening quick actions；
- 图片/说明 block。

在 Opening Phase 被用户选中并确认后，它作为首条 immutable assistant Variant 提交。

但：

> **Setup Wizard 不属于 Message Projection。**

Wizard 是 Experience View，因为它包含未提交表单状态和多步 Local UI State。

Wizard submit 后才产生：

- initial authoritative setup Command/Mutation；
- 或第一条 user turn；
- 然后进入普通 Turn Envelope。

### 22.29 Narrative Outcome Resolution 正式采用“双主路径”

不把所有游戏强迫成一种生成策略。

#### Policy A — `authority-first`

适合确定性游戏：

```text
User/UI Action
→ Intent/Typed Command
→ Event/Reducer
→ World commit
→ Narrator 写 prose
```

沿用当前 Game Runtime 的核心原则。

#### Policy B — `narrative-outcome`

适合 RP / MVU 风格游戏：

```text
Model Turn Output
├─ prose
├─ blocks
└─ semantic outcome proposals
       ↓
schema validation
       ↓
map to typed Command/Event
       ↓
simulate authority result
       ↓
success
       ↓
atomic Turn commit
```

模型提出的是**语义 outcome**，不是任意 World JSON Patch。

例如：

```text
relationship.changed { actor, direction, magnitude }
item.acquired { itemId, quantity }
location.arrived { locationId }
```

真正数值与最终 state 仍由 Command/Reducer 决定。

#### Policy B 的两种 Native 执行策略

经过后续重型 MVU 样本压力测试，`narrative-outcome` 不应只绑定“同一模型一次输出 prose + outcome”。

**B1 — inline outcome**

```text
Narrator
→ prose + declared blocks + semantic outcome sidecar
→ validate / simulate
→ atomic commit
```

优点：

- 单次模型调用；
- 延迟较低；
- prose 与 outcome 同源。

适合：

- provider structured output 足够稳定；
- 模型同时写叙事与结构化 sidecar 的质量可接受。

**B2 — post-narrative semantic interpretation**

```text
Narrator
→ Draft prose
→ dedicated Outcome/Event Interpreter
→ semantic outcome proposals
→ validate / map / simulate
→ atomic commit Draft prose + projection + authority outcome
```

这是一个**原生策略**，不是 Legacy MVU compatibility。

它允许：

- Narrator 专注 prose；
- Interpreter 使用独立 Model / Runtime Route；
- Interpreter 使用低温度 / structured-output；
- narrative 继续 streaming 为 provisional draft；
- authority 仍然只来自 typed Command / Event / Reducer。

真正只保留为兼容桥的是：

> **从任意 Legacy 自由文本 / Regex tag / JSONPatch 中抽取裸 mutation 的 resolver。**

`draft → resolve → final prose`

仍保留为更高一致性的可选 reconciliation pipeline：当 Package 明确需要“authority 结果反向校正 prose”时，可由 Turn policy 选择第二次 prose rewrite，但不作为默认成本。

### 22.30 Narrative-outcome 的一致性规则

为减少“正文说造成 20 伤害，Reducer 实际只造成 7”的冲突：

- Model outcome 应尽量是 semantic intent/result class，不直接声称最终权威数值；
- 若 Package 允许 exact value proposal，该值仍必须通过 validator/rule；
- Runtime 的 committed outcome 是最终 authority；
- Package Prompt 应告诉 Narrator 避免在尚未计算的字段上宣称精确结果；
- 对必须严格一致的玩法使用 `authority-first`。

因此 `narrative-outcome` 的定位不是取代 Game Runtime，而是给开放式 RP 一个安全的 MVU 上位替代。

### 22.31 Round 4 最终冻结项

Round 4 至此冻结：

1. 一等 Message Projection，与 immutable Variant 绑定。
2. Package Turn Contract、Model Turn Output、Committed Turn Envelope 三层分离。
3. Variant.content 是唯一 canonical prose。
4. Projection prose 使用 Runtime 生成的 range，不重复保存正文。
5. Block Registry 使用独立 Turn Contract resource。
6. UI template 留在 Component Model v2 UI Document。
7. 模型只能生成 prose + declared block data + declared outcome data。
8. Provider 优先 `structured-output → text-envelope → legacy extractor`。
9. 默认不做隐式 repair generation。
10. required/optional 由 Package Contract 决定。
11. Projection 默认 display-only。
12. World authority 只来自 Command/Event/Reducer。
13. block 默认 snapshot-only，不读取 live World。
14. Message template context 采用严格白名单。
15. Projection 可以使用 pinned Package Asset，不允许任意 URL。
16. Historical authority action 采用 active-tail / explicit fork policy。
17. Reply Variant facade 恢复 narrative + projection + state 全套 Branch。
18. Streaming 只提前展示 Draft narrative；block/outcome finalize 后生效。
19. Static Opening Variant 可复用 Projection；Setup Wizard 仍属于 Experience View。
20. Narrative Outcome 采用 `authority-first` 与 `narrative-outcome` 两个一等 policy。
21. `narrative-outcome` 同时支持 inline outcome 与 Native post-narrative semantic interpretation；只有 Legacy 自由文本/Regex/JSONPatch mutation resolver 属于兼容桥。
22. 长期目标是 atomic Native Turn Commit Envelope。

Round 4 完成。下一步进入 **Round 5 — MVU / Legacy Migration**。



---

## 二十三、Round 5 — Capability Benchmark Gap Analysis

### 23.1 本任务明确不做 SillyTavern 迁移体系

本企划后续不以“兼容 / 迁移 SillyTavern 角色卡”为目标。

SillyTavern、MVU、Tavern Helper、CardApp、重前端 Regex 卡只作为：

> **能力压力测试与竞品/旧生态行为样本。**

用途是回答：

- 这类玩法能做到什么？
- Atria Native 当前是否能表达？
- 如果不能，Atria 缺的是哪一类通用能力？
- 这个能力是否值得作为独立产品能力加入？

不做：

- SillyTavern importer architecture；
- legacy source-map / migration report；
- `legacy-mvu-patch` 长期 authority adapter；
- `triggerSlash` Native 兼容 API；
- `replaceMvuData` Native 兼容 API；
- arbitrary Regex HTML compatibility runtime；
- Tavern Helper API 复刻；
- 为旧格式保留双重事实源。

角色卡适配可以继续作为人工验证手段，但它不是产品架构目标。

### 23.2 对照原则：吸收能力，不吸收实现

对照示例：

| 旧生态行为 | Atria 应吸收的能力 | 不应复制 |
| --- | --- | --- |
| HTML 自定义开局 | Form + Local UI State + Composer Action | HTML/JS 注入 |
| MVU 状态栏 | World State + Component/Projection | Regex HTML |
| `replaceMvuData` | UI 可触发确定性权威状态变化 | 任意 World patch |
| Quick Reply | Message Action + Runtime Trigger | Slash script |
| swipe | Reply Variant UX | mutable swipe array |
| World Info | Knowledge discovery/delivery | legacy field schema |
| Regex display-only | Message Projection | replacement HTML |
| localStorage UI 偏好 | Player Preference State | Package arbitrary browser storage |
| 前端 save/load | Native SavePoint/Branch | 删除消息 + 恢复变量快照 |
| 前端地图/商店/战斗 | Package Data + View + Command | Vue/Pinia runtime 注入 |

### 23.3 Atria 当前已经明显强于旧生态的基础

后续设计应保护这些优势，不为了追平前端自由度而退化：

- immutable Timeline / Variant；
- Revision / Branch；
- SavePoint；
- World State schema；
- Event Journal；
- typed Command / Reducer / Rule；
- deterministic RNG；
- Native Knowledge state/lifecycle；
- Prompt Program semantic target；
- Package/Version exact identity；
- declarative runtime boundary；
- explicit permission/capability；
- Native Model/Prompt Runtime 的 structured-output capability。

因此本任务是：

> **在不破坏这些 authority 边界的前提下，把前端表达力补到足以覆盖甚至超过高阶 MVU/重前端卡。**

### 23.3.1 当前 `main` 实现基线校正

基于 `main@4dab353ac639d42eae885c79e18245267abd6820` 的实际代码再审计，以下能力不是从零开始，后续设计必须复用现有地基而不是建立平行系统：

- **Component Model v1** 已具备 semantic surfaces、`container / text / button / input / native-slot`、`text / value / hidden` 绑定、World selector、`dispatch / simulate` typed Command，以及 mobile/tablet/desktop + orientation 响应式条件；v2 的缺口是 Form、Local UI State、动态结构、Action Sequence、Composer/Surface/Message action、safe appearance 等更高表达力。
- **Studio** 已有 Component Model v1 的 `design / structure / bindings / source` 编辑、组件树增删/排序、基础属性编辑以及 Native Preview；因此“Studio visual authoring”不是从零建设，而是把现有编辑器深化到 v2 的 state/form/action/data/message-block/diagnostics 可视化 authoring。
- **Game Turn Controller** 已有 Turn Transaction phase、Attempt、retry、switch variant、stop/undo/delete，以及不改变 authoritative fingerprint 的 prose-only `rewriteNarrative`。未来 Turn Envelope 与 Reply Variant facade 必须扩展并整合这套机制，同时落到现有 Session Branch / Revision，而不是再造一套 turn/variant 状态机。
- **Declarative Logic** 已有 declarative Command / Reducer / Rule / Interpretation Mapping，并最终进入现有 typed Command → Event → Reducer authority 链路。未来 Declarative Mutation 只能是更低样板成本的 authoring shorthand，不能形成第二套 mutation authority 或平行 DSL/runtime。
- **Host / Environment** 已有 device、orientation、touch、keyboard、viewport 环境投影，以及 Full Host 的基础 focus/recovery 行为；后续缺口集中在 Browser Fullscreen、semantic focus navigation、gamepad、safe-area、overlay/input policy 等高级 Host capability。
- **Game LLM Runtime** 已有强 `authority-first` 路径，也已有 `Event Interpreter → Interpretation Mapping → typed Command` 的受控语义映射。未来 `narrative-outcome` 的缺口不是“第一次允许模型提出语义状态变化”，而是把 prose + projection + semantic outcomes 纳入统一 Package Turn Contract / Turn Envelope，并提供验证、模拟与原子提交语义。

### 23.4 第一组差距：UI 基础能力

当前明确不足：

- Form；
- textarea/select/checkbox/radio/range；
- Local UI State；
- two-way local model；
- dynamic repeat/list；
- richer conditional rendering；
- dynamic binding；
- safe style / theme；
- reusable UI template；
- multi-view / multi-surface；
- modal/drawer declarative control。

对应方案：

> Component Model v2。

### 23.5 第二组差距：消息级结构化 UI

当前明确不足：

- 正文后状态栏；
- 正文穿插组件；
- story options；
- battle-start card；
- unlock/title card；
- message snapshot；
- historical message action；
- structured assistant output → Native UI。

对应方案：

> Message Projection + Package Turn Contract + Turn Envelope。

### 23.6 第三组差距：UI → Runtime 行为

当前明确不足：

- Composer prefill；
- Composer submit；
- UI 直接触发 typed Command；
- 简单 deterministic state mutation 的低样板成本；
- Action Sequence；
- surface open/close；
- generation busy/disabled 状态。

对应方案：

- Native Composer Host capability；
- Action v2；
- Declarative Mutation shorthand；
- typed Command/Event 仍为唯一 World authority。

### 23.7 第四组差距：Package 数据与派生逻辑

重前端样本暴露：

- item catalog；
- skill definitions；
- map graph；
- shops；
- historical events；
- title rules；
- route data；
- static lookup tables。

当前 UI/selector contract 无法优雅消费这类大型静态数据。

对应方案：

- read-only Package Data Resource；
- Data Projection；
- 受限 builtin algorithms；
- Selector 不局限于标量。

### 23.8 第五组差距：状态分层

Round 5 初始审计先识别出 World / Session / Local UI / Player Preference 四个大类；后续三个重型案例进一步证明这仍然过粗。当前正式分层已扩展为 World State、Session Application State、Activity State、Local UI State、Message-local UI State、Player Preference State，详见 §26.11。

Atria 当前 World 与底层 Session namespace 有较强基础，但 Package-facing Session Application / UI / Preference contract 尚未形成。

必须避免再次把：

- tab；
- modal；
- setup form；
- display mode；
- option send mode；

全部塞进剧情变量。

### 23.9 第六组差距：Turn 产生策略

Atria 当前 Game Runtime 更偏：

`authority-first`

但开放式 RP/MVU 类玩法需要：

`narrative-outcome`

因此两者都应是一等 Native policy：

#### authority-first

适合确定性游戏、战斗、经济、规则系统。

#### narrative-outcome

适合开放式 RP，让模型提出 semantic outcome，再由 typed runtime 验证、模拟和提交。

不是为了兼容 MVU，而是 Atria 本身需要同时支持：

> **规则驱动游戏** 与 **叙事驱动状态游戏**。

### 23.10 第七组差距：Lifecycle Automation

高阶卡常见能力：

- session start；
- turn before/after；
- assistant/user message 后；
- Knowledge activation；
- state changed；
- world event committed。

Atria 当前有底层 lifecycle event 和 Game Rule，但缺少 Package 可声明的统一 Runtime Automation contract。

需要独立设计：

> Declarative Runtime Trigger / Automation。

它不属于 Component。

### 23.11 第八组差距：Opening Experience

Atria 当前 Entry Point 不能等价覆盖：

- first message variants；
- setup wizard；
- custom start；
- preview opening；
- opening confirm。

需要：

- Opening Phase；
- Opening Variant；
- Setup View；
- confirm → first immutable Timeline commit。

这也是 Atria 自己应该有的产品能力，而非“兼容 alternate greetings”。

### 23.12 第九组差距：Reply / Branch UX

底层 Branch/Revision 已经强于 mutable swipe。

缺的是：

- reply previous/next；
- retry；
- variant count；
- branch-aware preview；
- 从旧消息 fork；
- 用户不需要理解 Branch ID。

因此需要：

> Reply Variant / Branch facade。

### 23.13 第十组差距：Conversation Presentation / Scoped Threads

高阶 Hybrid 应能把主 Timeline 以不同方式呈现：

- feed；
- latest；
- reader。

《银麒赎世》进一步证明复杂应用还可能拥有私聊、群聊、终端日志等**二级 Conversation Thread**。这类 thread 不应伪装成主 Timeline，也不应让 Package 自己重新造一套聊天基础设施。

因此该能力应覆盖：

> Native Conversation presentation + Session Application scoped conversation thread。

主 Timeline 仍由 Native Session / Revision 权威拥有；二级 thread 则属于 Typed Session Application State，并复用 participant、message、unread、retry/fork、Context target 等共享 conversation primitive。

### 23.14 第十一组差距：Host UI / Input Capability

从重前端样本还发现：

- Fullscreen；
- responsive device/orientation；
- keyboard focus；
- gamepad navigation；
- modal focus trap；
- safe-area；
- generation busy state。

这些应由 Host 提供，不让 Package 自己抓 DOM/window。

候选：

- Host Fullscreen；
- semantic focus navigation；
- gamepad mapping；
- environment context；
- overlay ownership。

### 23.15 第十二组差距：前端审美自由度

仅禁止 HTML/CSS 并不足够。

若 Native Component 做不出精美重前端，作者仍会寻找逃逸路径。

因此必须提供：

- semantic theme tokens；
- safe layout；
- safe style allowlist；
- Package Asset；
- responsive appearance；
- animation/motion 的受控 Native primitives（后续讨论）；
- Studio preview。

目标：

> 在不开放 arbitrary HTML/JS/CSS 的情况下，仍能做出完整产品级 UI。

### 23.16 第十三组差距：Authoring / Studio

要真正“吃掉重前端生态”，不能只提供 JSON contract。

Studio 后续至少应支持：

- Component tree editor；
- View/Surface editor；
- state/schema browser；
- selector/expression inspector；
- form preview；
- message block template preview；
- Package Data browser；
- Action wiring；
- Turn Contract editor；
- simulated World State；
- responsive preview；
- diagnostics；
- dependency/reference navigation。

否则 Native contract 再强，也只会变成难写的手工 JSON。

### 23.17 第十四组差距：Health / Diagnostics / Repair

复杂卡必须能回答：

- 为什么这个 Component 没显示？
- 哪个 selector 失败？
- Action 为什么被拒绝？
- 哪个 Command validator 失败？
- 哪个 block schema 不合法？
- 本轮 structured output 为什么 rejected？
- 哪个 Runtime Automation 被 cycle guard 阻止？
- 当前 UI 读的是 World / UI / Preference 哪个状态？

因此 Experience Runtime 需要统一 Health / Diagnostics surface，而不是 console-only。后续《银麒赎世》压力测试进一步证明还需要 preflight、typed repair 与 save migration，详见 §26.16。

### 23.18 后续所有样本的使用方法

以后继续拿 SillyTavern/MVU/重前端卡对照时，只做三件事：

1. 提取它展示出来的**用户能力**；
2. 检查 Atria Native 是否已有；
3. 没有则判断是否值得变成通用 Native capability。

不再讨论：

- 如何自动迁移该卡；
- 如何兼容它的旧 API；
- 如何让它原封不动运行。

### 23.19 Round 5 当前结论

当前已经形成的 Atria 能力缺口主表：

1. Component Model v2；
2. Local UI State；
3. Player Preference State；
4. Package Data Resource；
5. Data Projection / bounded data & graph query；
6. Native Composer Host capability（在现有 Native Composer product / generation ABI 之上提供受控 Package action）；
7. Action v2；
8. Declarative Mutation authoring shorthand（复用现有 declarative Command / Event / Reducer 链路）；
9. Message Projection；
10. Package Turn Contract；
11. Turn Envelope（复用现有 Game Turn Controller / Session Revision，不建立平行 turn state machine）；
12. narrative-outcome policy（复用现有 semantic interpretation → typed Command 地基，但形成完整单轮 contract）；
13. Runtime Automation；
14. Opening Phase / Variant；
15. Reply Variant / Branch facade（建立在现有 Attempt / Branch / Revision 能力之上）；
16. Conversation feed/latest/reader + scoped conversation threads；
17. Host advanced presentation/input（Fullscreen / semantic focus / gamepad / safe-area；基础 responsive/focus 已存在）；
18. safe theme/style/motion；
19. Studio visual authoring v2 + Scenario Simulation / Test Bench（v1 Structured UI editor / Native Preview 已存在）；
20. Experience diagnostics。

这 20 项是 Round 5 的**初始缺口表**，不是最终列表；后续三个案例已继续拆分/合并，最新主表见 §26.21。


## 二十四、案例压力测试 01 — 《瀚海》独立重型前端

### 24.1 样本身份与审计范围

样本：

- Repository：`Ji-Haitang/char_card_1`
- 审计基线：`main@5cec5f53c3304f5c6d9e2e7e15c15d3823341cfa`
- 最新正式 Release：`1.4.0 / 瀚海-v1.4.0`
- Release 1.4.0 对应实现提交：`b2e4bd645dd305ca5918848c9668d747fa7bc7bb`

该项目已经从 SillyTavern 角色卡演化为可独立浏览器运行并打包 Android APK 的完整 LLM 游戏，因此它不是“如何兼容旧卡”的样本，而是一个很适合检验：

> **Atria 是否真的能够承载脱离聊天壳之后的重型 Native Game/Application。**

本轮重点读取了：

- `ReadMe.md`
- `module/pipeline.js`
- `module/variable-system.js`
- `module/summary-runner.js`
- `module/memory-recall.js`
- `module/scene3d-bridge.js`
- `scene3d/src/*`
- `scene3d/package.json`
- 战斗 / 农场 / 炼丹 / 赌场 / 世界地图子页面
- 3D 整合、历史管理、向量召回、前端改造等开发文档
- 1.0.0–1.4.0 Release 变化

### 24.2 该项目真正展示出的产品能力

去掉具体武侠业务后，值得吸收的能力包括：

1. **完整独立 Application Shell**
   - 浏览器独立运行；
   - Android APK；
   - 横屏 / 沉浸全屏；
   - PC / Mobile 不同布局；
   - 不依赖聊天宿主才能工作。

2. **复杂长期 World/Game State**
   - 玩家属性；
   - NPC 好感与可见性；
   - 装备 / 背包 / 技能；
   - 地点 / 随行角色；
   - 时间 / 季节；
   - 特殊事件；
   - 大量确定性游戏规则。

3. **非 LLM 的本地 Gameplay Loop**
   - 回合战斗；
   - 炼丹；
   - 农场；
   - 赌场；
   - 世界地图选择；
   - 多步本地交互结束后才结算回主游戏。

4. **LLM Turn Pipeline**
   - prompt build；
   - generation；
   - streaming；
   - parse；
   - state apply；
   - commit / rollback；
   - autosave；
   - summary / memory follow-up。

5. **多种辅助 LLM 工作流**
   - 周总结；
   - 事件总结；
   - 地点自动迭代；
   - 悬赏生成；
   - 角色弧光 / 世界事实更新；
   - 部分任务可以在主生成之外异步进行。

6. **长期记忆与检索**
   - 分层 summary；
   - event-level memory；
   - embeddings；
   - lexical + dense；
   - weighted RRF；
   - optional rerank；
   - token budget；
   - character/location-aware filtering。

7. **Rich Media**
   - CG；
   - BGM；
   - SFX；
   - 角色立绘；
   - 战斗动画；
   - 地点背景；
   - 3D 场景。

8. **3D Scene Experience**
   - 11 个地点 3D 化；
   - Three.js scene；
   - camera / controls；
   - NPC scene anchor；
   - 点击 NPC 自动聚焦；
   - 昼夜 / 季节视觉投影；
   - scene 与现有 2D business UI 协同；
   - 失败时退回 2D。

9. **Render Preference / Quality Profile**
   - render scale；
   - MSAA；
   - shadow；
   - atmosphere；
   - bloom；
   - saturation / contrast / gamma / warmth / vignette 等；
   - Native Android 与 Web 默认值不同；
   - preference 不属于剧情 World State。

10. **大型资源发布**
    - APK 已达到约 600MB 级别；
    - 3D 资源独立 build / release / manifest；
    - immutable buildId；
    - resource hash；
    - Web / APK 两套交付；
    - release pointer；
    - old-version retention；
    - lazy scene load / failure fallback。

### 24.3 本样本同时证明：Component Model 不能承担所有运行时职责

如果把这个项目全部理解成“Component Model v2 需要更多组件”，会得到错误架构。

至少要区分：

```text
Component / View
    ↓
普通表单、HUD、面板、列表、Modal

Activity Runtime
    ↓
战斗 / 炼丹 / 农场 / 赌场等局部确定性玩法

Media / Scene Host
    ↓
CG / Audio / 2D Scene / 3D Scene / Camera

Auxiliary Task Runtime
    ↓
后台总结 / 地点迭代 / 辅助模型任务

World / Session Authority
    ↓
最终权威状态与历史
```

因此：

> **“重前端能力”不能被错误地压缩成一棵更强的 UI Tree。**

### 24.4 Atria 已有基础：无需从《瀚海》重造

《瀚海》中的以下机制，Atria 已经有更强或更干净的底层，不新增平行体系：

#### Turn rollback / snapshot

《瀚海》使用：

`turn → session → rollback snapshot`

Atria 已有：

- immutable Session Revision；
- Branch；
- Attempt；
- Turn Transaction；
- SavePoint。

因此该样本只进一步验证：

> Atomic Turn Envelope 必须建立在现有 Revision/Branch 上。

#### World mutation

《瀚海》仍存在大量直接 JS state mutation / sync。

Atria 继续坚持：

`typed Command → Event → Reducer`

不引入任意游戏对象修改 API。

#### Memory / retrieval

《瀚海》的 event summary、vector、lexical、RRF、rerank 很有参考价值，但 Atria 已有 Memory Graph、Hybrid Retrieval、Vector/Rerank 与 token budget 基础。

这不是新的 Experience primitive。

#### Prompt / Worldbook

《瀚海》已经证明独立游戏仍然需要：

- custom prompt；
- worldbook；
- stable/volatile prompt 分层；
- API cache-aware prompt structure。

Atria 已有 Native Prompt Program / Module / Knowledge / Runtime Route，应继续使用这些权威资源，而不是复制该项目的 prompt builder。

### 24.5 新缺口 A — Activity Runtime / Transactional Subscene

《瀚海》的战斗、炼丹、农场、赌场暴露了当前企划此前没有明确拆出的能力：

> **一个玩法可以拥有持续几十秒或数分钟的本地状态机，但它既不应该每一步都污染 World State，也不只是一次性的 Local UI State。**

当前候选 Native 抽象：

```text
Activity Definition
├─ activityId
├─ input schema
├─ activity state schema
├─ view
├─ deterministic actions
├─ local/activity RNG
├─ completion schema
├─ cancel policy
└─ settlement mapping
```

运行方式：

```text
World / Session snapshot
        ↓
start Activity
        ↓
Activity-scoped state
        ↓
many deterministic local actions
        ↓
complete
        ↓
typed settlement result
        ↓
validate / simulate
        ↓
World Command/Event commit
```

重要边界：

- Activity State 不是 World State；
- Activity State 也不同于普通 tab/modal Local UI State；
- cancel 可以丢弃；
- resume/persist 是否允许由 Activity policy 决定；
- settlement 不允许直接 patch World；
- Activity 可以使用 Component View，也可以未来使用 Scene Host；
- 不复制 iframe + `postMessage`。

这使 Atria 能原生承载：

- battle；
- crafting；
- alchemy；
- card game；
- puzzle；
- farming；
- tactical interaction；
- character creation mini-game。

### 24.6 新缺口 B — Native Media / Scene Host

《瀚海》1.4.0 的 3D 场景说明：

> Full Mode 的长期上限不应只是“可以自由排版的 2D App”。

Atria 需要预留一个受控的 Native Media / Scene Host。

它不是：

- arbitrary Canvas JS；
- arbitrary WebGL JS；
- Package Three.js；
- script injection。

候选长期模型：

```text
Scene Document
├─ scene / layer
├─ camera
├─ environment
├─ entity / anchor
├─ sprite / image / model
├─ label / hotspot
├─ animation
├─ audio cue
├─ lighting / time projection
├─ bindings
└─ actions
```

Host 提供 renderer，Package 提供声明式 Scene Data + pinned Asset。

首批能力应优先覆盖：

- image / CG；
- BGM / SFX；
- layered 2D scene；
- camera/focus；
- entity anchor / hotspot；
- transition；
- 受控 3D model scene；
- environment/time binding；
- scene → Action v2。

Scene 状态读取仍遵守：

`World / Package Data / Preference / Environment → Projection → Scene`

而不是 Scene 自己成为剧情权威。

### 24.7 Scene Projection：World 不应该迁就渲染层

《瀚海》当前 3D bridge 的一个很值得吸收的思想是：

> 3D 不重新生成一套游戏事实，而是从当前游戏事实投影视觉状态。

例如：

- World location → sceneId；
- NPC presence → rendered entity；
- day/night/time → lighting；
- season → environment；
- World action → camera / scene feedback。

Atria 应正式把这种关系纳入 Data Projection：

```text
World State
Package Data
Preference
Environment
      ↓
Scene Projection
      ↓
Render State
```

Render State 是派生 presentation，不是 authority。

### 24.8 新缺口 C — Asset Pack / Heavy Resource Delivery

当前 Atria `.atria` Package Container v2 的实现限制为：

- container 最大 128 MiB；
- 单文件最大 32 MiB；
- uncompressed 总量最大 256 MiB。

同时当前 Experience runtime 的 Package resource endpoint 只允许读取安全的 declarative `.json` source resource。

这对于普通角色资产足够，但无法优雅承载《瀚海》这种：

- 大量 CG；
- BGM；
- 3D models / textures；
- 数百 MB 资源；
- Web 与移动端不同资源档位。

因此应新增而不是简单放宽主包：

> **Immutable Asset Pack / Resource Bundle**

候选：

```text
PackageVersion
├─ Core Package
├─ AssetPack: base
├─ AssetPack: audio
├─ AssetPack: hd
└─ AssetPack: scene3d
```

每个 pack：

- exact identity；
- manifest；
- content hashes；
- optional / required；
- platform / quality applicability；
- install state；
- lazy availability；
- offline policy；
- fallback policy。

这样可以保持 Core Package 小而确定，同时允许 Full Application 承载大型内容。

模型和 Package UI 仍不能返回任意网络 URL。

### 24.9 新缺口 D — Auxiliary Task / Background Model Job Runtime

`Runtime Automation` 只回答：

> “什么时候触发？”

《瀚海》的周总结、事件总结、地点迭代等暴露另一个独立问题：

> “一个不阻塞主 Turn 的模型任务如何执行、取消、重试、判定过期，并安全写回结果？”

因此需要：

> **Auxiliary Task Runtime**

候选任务状态：

```text
queued
→ running
→ completed
→ applied

or
→ stale
→ cancelled
→ failed/retryable
```

任务必须绑定：

- Session / Branch / Revision anchor；
- task type；
- Prompt/Generation Route；
- input snapshot；
- result schema；
- apply policy；
- stale-result policy；
- retry policy；
- diagnostics。

后台 LLM 结果不能直接写 World。

合法路径仍是：

```text
Auxiliary Model Output
→ schema validation
→ typed result
→ policy check against current Revision
→ Command / Memory / Knowledge-specific authority
```

这可承载：

- summary；
- memory extraction；
- event condensation；
- location evolution；
- NPC arc extraction；
- optional precomputation。

### 24.10 Runtime Automation 与 Auxiliary Task 必须拆开

冻结建议：

- **Runtime Automation**：声明 trigger / condition / cadence / lifecycle；
- **Auxiliary Task Runtime**：声明异步任务执行与结果生命周期。

Automation 可以触发：

- Command；
- Activity；
- Auxiliary Task；
- Surface Action；

但不应自己包含一整套 background execution engine。

### 24.11 Player Preference State 需要增加 device / render scope

《瀚海》的 3D 设置进一步证明：

`Player Preference State` 不能只被理解为“主题偏好”。

至少需要区分：

- package preference；
- device-local preference；
- accessibility preference；
- rendering preference。

例如：

- 3D enabled；
- render quality；
- render scale；
- anti-aliasing；
- shadow；
- motion；
- BGM/SFX volume；
- handheld layout。

这些不应进入：

- World State；
- Session narrative state；
- Prompt，除非 Package 明确声明某个偏好具有玩法语义。

### 24.12 Environment / Host 需要 capability negotiation

当前 Atria 已有 device / orientation / touch / keyboard / viewport。

重型场景还需要长期考虑 Host 提供安全、抽象的 capability：

- scene2d supported；
- scene3d supported；
- reduced motion；
- audio available；
- fullscreen available；
- pointer / touch；
- orientation；
- safe area；
- render tier / recommended profile。

不要向 Package 暴露任意浏览器 / GPU / DOM 探测 API。

Package 应声明：

```text
preferred capability
+ fallback View
```

例如：

```text
3D available + user enabled
→ scene3d

otherwise
→ native 2D Component View
```

### 24.13 该样本对 Audio / Motion 的结论

此前第 18 项：

`safe theme/style/motion`

过于偏视觉样式。

《瀚海》证明 Full Application 还需要受控的：

- BGM channel；
- SFX channel；
- loop / fade；
- volume/mute preference；
- animation / transition；
- reduced-motion fallback；
- Package Asset authority。

因此长期应把这一能力重新表述成：

> **Safe Appearance / Motion / Media Presentation**

音频不是 arbitrary Web Audio script，而是 Host-owned playback capability。

### 24.14 不吸收《瀚海》的具体历史实现

明确不复制：

- localStorage 作为 Package 任意数据库；
- IndexedDB arbitrary access；
- iframe mini-game runtime；
- `postMessage('*')` settlement；
- 全局 JS variable；
- DOM MutationObserver business bridge；
- mutable gameData ↔ variableSystem 双向同步；
- Package 自带 Three.js / Vite executable bundle；
- arbitrary network asset URL；
- 直接 JS state mutation；
- 运行时脚本注入。

这些是该独立项目自己可接受的工程实现，但不符合 Atria 的平台边界。

### 24.15 更新后的能力缺口主表

经过《瀚海》压力测试，原 20 项调整为 24 项：

1. Component Model v2；
2. Local UI State；
3. Player Preference State（补 device/render/accessibility scope）；
4. Package Data Resource；
5. Data Projection（扩展到 Scene Projection）；
6. Native Composer Host capability；
7. Action v2；
8. Declarative Mutation authoring shorthand；
9. Message Projection；
10. Package Turn Contract；
11. Turn Envelope；
12. narrative-outcome policy；
13. Runtime Automation；
14. Opening Phase / Variant；
15. Reply Variant / Branch facade；
16. Conversation feed/latest/reader；
17. Host advanced presentation/input；
18. Safe Appearance / Motion / Media Presentation；
19. Studio visual authoring v2 + Scenario Simulation / Test Bench；
20. Experience diagnostics；
21. **Activity Runtime / Transactional Subscene**；
22. **Native Media / Scene Host（含长期 2D/3D Scene）**；
23. **Immutable Asset Pack / Heavy Resource Delivery**；
24. **Auxiliary Task / Background Model Job Runtime**；
25. **Native Add-on / Content Extension Layer**。

这 25 项仍然不是最终答案，后续样本可以继续拆分或合并。

### 24.16 《瀚海》压力测试的核心结论

本案例最大的价值不是证明 Atria 需要“更复杂的 Full 页面”，而是证明：

> **真正脱离 SillyTavern 的重型角色体验最终会变成一套小型游戏应用平台。**

因此 Atria 的 Native Experience Capability Layer 不能只覆盖：

`Chat + Form + Component + Message Card`

还必须为以下能力留下干净边界：

```text
Conversation
Component/View
Activity
Scene/Media
World Authority
Turn Runtime
Auxiliary Tasks
Asset Delivery
Preference/Environment
Studio/Diagnostics
```

三种模式依然只是布局所有权：

- Component 可以使用轻量 Media / Activity overlay；
- Hybrid 可以把 Conversation 与 Activity/Scene 组合在游戏布局中；
- Full 可以主要由 View / Activity / Scene 构成。

因此即使加入 3D：

> **也不意味着新增“Super Full Mode”。**

能力仍然属于共享 Capability Layer，模式只决定布局所有权。


## 二十五、案例压力测试 02 — 【TG】天书江湖录（SillyTavern 重型前端卡）

### 25.1 样本身份与真实运行边界

本轮样本为用户提供的：

- `【TG】天书江湖录.json`
- SillyTavern Character Card；
- Worldbook + MVU + Regex HTML + Tavern Helper 多层组合；
- Card 内部只保存 bootstrap / schema / prompt / regex，主体前端和控制逻辑继续从远程资源加载。

Card 本体包含：

- 17 个 Character Book 条目；
- 10 个 Regex script；
- 4 个 Tavern Helper script；
- MVU Zod schema；
- MagVarUpdate bootstrap；
- 远程控制脚本 bootstrap；
- 大型内嵌 SVG / SFX 资源脚本。

同时 Card 通过 jsDelivr 加载：

- `bibilabu2026/tswx:开场ui.txt`
- `日常ui.txt`
- `战斗ui.txt`
- `控制脚本.txt`
- `version.json`

本轮同时审计远程实现：

- Repository：`bibilabu2026/tswx`
- `main@b96aab66451eba1f98b89cec4a8c0a83d377d8a9`

远程资源已经不是零碎 beautify script，而是：

- 开场 UI：约 75K chars；
- 日常 UI：约 240K chars；
- 战斗 UI：约 214K chars；
- 控制脚本：约 270K chars；
- Card 内资源脚本：约 1.55M chars。

因此该样本的真实性质是：

> **借 SillyTavern 消息、Worldbook、MVU 和 iframe/Regex 宿主拼出一个完整 Game Application。**

本轮仍然只抽取 capability，不设计任何兼容层。

### 25.2 这张卡的核心架构实际上已经形成四层

虽然传输格式是历史包袱，但能力边界非常有参考价值。

模型输出被人为切成：

```text
<content>
    narrative
</content>

<w3g>
    player action proposals
</w3g>

<UIUI>
    presentation mount marker
</UIUI>

<UpdateVariable>
    authoritative-state proposal
</UpdateVariable>

<zd>
    deterministic battle handoff
</zd>
```

这再次验证此前的方向：

> narrative / projection / outcome / interaction 不能混成一段 Markdown。

Atria 不复制这些 tag，也不通过 Regex 替换 HTML。

对应 Native 设计仍应是：

```text
Turn Envelope
├─ narrative
├─ projection
├─ outcomes
└─ diagnostics

+

Action / Activity handoff
```

### 25.3 开场 UI 对 Opening Phase 的进一步压力测试

该卡的开场不是简单“角色名 + 开始”。

真实能力包括：

- 多页 Wizard；
- 背景介绍页；
- 路径分支：
  - 创建新角色；
  - 魂穿既有角色；
- 性别；
- 外貌；
- 性格；
- 自定义开局；
- 属性 / 基本功点数分配；
- 初始武学选择；
- 初始装备派生；
- HP / MP / 属性计算；
- 开场确认；
- 条件校验；
- 提交后自动准备第一条玩家输入；
- 开场 BGM；
- 粒子 / transition；
- setup 过程中可前后翻页。

旧实现还会：

- 直接改 message 0 的 MVU；
- 动态修改 Worldbook；
- 为玩家外貌 / 性格创建常驻 Worldbook 条目；
- 直接操作 ST composer。

Atria Native 不应该复制这些行为。

因此 Opening Phase 应补充：

#### Opening Setup State

Opening Wizard 在确认前使用：

> `Opening Draft State`

不是 World State，也不是 Session Revision。

Confirm 时执行一次：

```text
Opening Draft
→ schema validation
→ derived setup calculation
→ typed setup commands
→ Session / World initial commit
→ first immutable Timeline entry
```

#### Conditional Wizard Graph

Opening View 不能只有线性 previous / next。

需要支持：

- conditional next；
- branch；
- skip；
- required field；
- validation message；
- derived preview。

例如：

```text
choose path
├─ transmigrate → transmigrate setup
└─ create_new   → player setup → opening → stat setup
```

#### Session Prompt Projection

“玩家外貌 / 性格 / 本局背景”不应通过动态创建 Knowledge 条目来实现。

应允许：

```text
Session-authoritative setup facts
        ↓
Prompt Projection
        ↓
declared Prompt semantic target
```

Knowledge 继续保持知识资源身份，不能因为开局填写表单就被当作运行时变量仓库。

### 25.4 日常 UI 证明 Hybrid 可以已经近似完整 RPG 前端

该卡的日常 UI 同时提供：

- 正文阅读；
- story options；
- 当前世界时间；
- 金钱；
- 队伍；
- 玩家 / 队友人物卡；
- NPC 交集与详情；
- 属性；
- 基本功；
- 装备；
- 背包；
- 武功；
- 学习 / 遗忘武功；
- 使用物品；
- 装备 / 卸下；
- 踢出队友；
- 日常武功使用；
- 快捷行动；
- 每日机缘；
- 心魔挑战；
- 抽奖；
- 自创武功；
- BGM；
- action option mode；
- 版本提示。

这再次证明：

> **Hybrid = Chat-based Game Application，不是“聊天页多几个按钮”。**

但这些也不能全部成为 Component type。

正确拆分仍然是：

- View / Component：展示与普通输入；
- Action v2：确定性操作入口；
- World Command：权威变化；
- Activity：复杂局部玩法；
- Player Preference：本地偏好；
- Media Host：声音 / 动画；
- Data Projection：派生展示。

### 25.5 Action v2 必须从“click dispatch”升级成产品级 Command Surface

该卡控制脚本实际暴露了一整组产品动作：

- `GET_STATE`
- Equip / Unequip；
- Learn / Forget Kungfu；
- Set Main Kungfu；
- Use Kungfu；
- Meditate；
- Lottery；
- Modify Gold；
- Kick Ally；
- Item Use / Drop；
- Stat Allocation；
- Custom Kungfu growth。

这说明 Atria Action v2 至少必须具备：

```text
Action
├─ action id
├─ availability
├─ disabled reason
├─ args / form binding
├─ confirm policy
├─ idempotency policy
├─ simulate
├─ dispatch
├─ busy state
├─ typed result
├─ transaction receipt
├─ optional compensation / undo policy
├─ user-facing failure
└─ diagnostics
```

UI 不应该自己计算“能不能装备 / 能不能学习”然后裸写 state。

推荐调用：

```text
UI
→ action availability projection
→ user trigger
→ typed Command validate/simulate
→ optional confirmation
→ commit
→ typed result
→ UI refresh / feedback
```

这比当前 Component v1 的静态 `click → dispatch/simulate` 明显更高一层。

### 25.6 Player-customizable Action Palette

“江湖事迹”不是简单 Quick Reply。

它允许玩家：

- 使用 Package 默认快捷动作；
- 删除默认项；
- 编辑默认项；
- 新增自己的动作；
- 为动作设置标题和发送文本；
- 根据地点类型呈现不同默认动作。

这暴露一个很有产品价值的能力：

> **Package-defined Action Palette + Player Overlay**

Atria 可以把它纳入：

- Native Composer Host；
- Action v2；
- Player Preference State。

例如：

```text
Package Action Presets
        +
Player Action Overlay
        ↓
Effective Action Palette
```

Player Overlay 可保存：

- hidden；
- rename；
- reorder；
- custom composer preset。

它不是 World State。

但若动作本身触发权威 Command，则自定义项只能引用 Package 已允许的 Action / Composer capability，不能携带脚本。

### 25.7 “悟道”暴露 Runtime-authored Typed Entity

该卡允许玩家在运行过程中自创武功，并配置：

- 名称；
- 类别；
- 基础效果；
- 伤害浮动；
- 属性附加；
- MP 消耗；
- 命中率；
- 冷却；
- 作用范围；
- 状态效果；
- 状态概率；
- 状态持续时间；
- 后续成长。

这是一个重要压力点：

> Package Data Resource 是 immutable definition，但游戏中仍可能需要玩家创建新的“规则数据实例”。

因此需要正式允许：

> **Runtime-authored Typed Entity Instance**

示例：

```text
Package declares AbilityTemplate
├─ schema
├─ allowed effect vocabulary
├─ bounds
└─ interpreter id

World / Session creates AbilityInstance
├─ name
├─ parameters
├─ effect descriptors
└─ progression
```

真正的执行逻辑仍是 Package 预声明的 generic interpreter / typed Command。

不允许：

- 玩家写 JS；
- 玩家写 arbitrary formula source；
- 运行时新增 Reducer code；
- 修改 immutable Package Data。

因此该能力目前不单独新增主表 primitive，可作为：

> World State + Package Data + typed Command 的“runtime-authored record”模式。

### 25.8 《天书江湖录》的战斗 UI 强力验证 Activity Runtime

这张卡的战斗已经是完整独立 Gameplay Loop：

- ATB；
- player / ally / enemy；
- target selection；
- normal attack；
- defend；
- item；
- flee；
- skill；
- 内功；
- 状态；
- 控制；
- AI；
- auto battle；
- speed multiplier；
- Canvas FX；
- SFX；
- battle log；
- XP；
- level up；
- loot；
- HP / MP；
- settlement choice；
- retry。

因此上一轮由《瀚海》提出的：

> **Activity Runtime / Transactional Subscene**

得到第二个、而且来自 SillyTavern 重前端生态的独立验证。

该能力应继续保留。

### 25.9 Activity 需要新增 Outcome Narrative Handoff

该卡战斗结束后的处理非常值得抽象。

旧实现流程：

```text
battle frontend
→ deterministic settlement
→ write MVU
→ build BATTLE_RECORD
→ put BATTLE_RECORD into Composer
→ next LLM reply narrates what already happened
→ prompt explicitly forbids LLM updating battle state again
```

这里真正需要的 Native capability 是：

> **Activity Outcome → Narrative Handoff**

Native 版应为：

```text
Activity complete
→ Activity Outcome Envelope
→ validate settlement
→ typed Command/Event commit
→ new authoritative Revision
→ Observation from committed Events
→ optional narrator continuation
```

Narrator 获得的是：

- battle result；
- participants；
- important events；
- injuries；
- settlement choice；
- committed Event facts。

而不是一串 `BATTLE_RECORD:` 文本。

Narrative follow-up 的 authority 必须标记为：

> **facts already committed**

若 narrative-outcome 模型再次提出相同战斗 mutation，Runtime 应拒绝重复应用。

这项能力归入：

- Activity Runtime；
- Turn Envelope；
- Event Journal / Observation；
- Narrative Coordinator。

不新增第二套状态同步机制。

### 25.10 Deterministic UI Action 也必须可进入叙事观察

该卡有一个“后台操作记录”概念：

玩家通过前端：

- 学武功；
- 换装备；
- 使用物品；
- 分配属性；

这些操作已经确定性修改变量，但作者又希望下一次正文自然知道“刚刚发生了什么”。

这说明：

> **非 LLM 的权威动作需要成为下一轮 narrative 可观察的 Event，而不是偷偷改完 state。**

Atria 已有 Event Journal / Observation Projector，方向正确。

后续 Action v2 / Activity settlement 必须保证：

```text
UI Command
→ Event Journal
→ Observation Projection
→ Prompt
```

而不是只改 World snapshot。

这也是 Atria 相比 MVU 裸变量更新应保留的结构优势。

### 25.11 “真实世界引擎”暴露同步 Turn Processor，而不是 Background Task

该卡的可选额外 AI 会：

1. 在主生成前拦截当前用户输入；
2. 读取最近若干 AI 历史；
3. 读取 Mod 安装的元素索引；
4. 调用另一条模型配置；
5. 输出元素筛选 / 运势；
6. 把筛选结果注入本轮主输入；
7. 再进入普通主生成。

这不是上一轮定义的 Auxiliary Task。

Auxiliary Task 是：

> 主 Turn 可以继续，任务在后台完成。

这里则是：

> 主 Turn 必须等待前置处理完成。

因此 Package Turn Contract 需要补：

> **Bounded Synchronous Turn Stage**

建议直接复用现有 Game Turn Controller phase，不开放 arbitrary middleware。

候选 Host slot：

```text
submitted
→ pre_resolve processors
→ resolving
→ calculating
→ recalling
→ pre_narrate processors
→ orchestrating
→ narrating
→ finalized
```

每个 Processor：

- declarative processor id；
- typed input；
- typed output；
- optional model role / route requirement；
- timeout；
- cancellation；
- fail-open / fail-closed policy；
- diagnostics；
- 不可直接写 World State。

输出只能进入显式命名的 Turn Context field / semantic target。

因此：

> **Synchronous Turn Processor 属于 Package Turn Contract；Auxiliary Task Runtime 仍只负责异步后台任务。**

### 25.12 创意工坊暴露新的主能力缺口：Native Add-on / Content Extension Layer

这是该样本最重要的新发现。

卡内“创意工坊”可以：

- 浏览可用 Mod；
- 查看说明；
- 安装；
- 查看已安装；
- 删除；
- 检测更新；
- 更新；
- 下载多个 Worldbook；
- 安装 disabled index Worldbook；
- 缓存 Prompt preset；
- 声明是否使用额外 AI；
- 关闭原有 Worldbook 条目；
- 增加 MVU mod namespace；
- 激活对应额外模型处理逻辑。

这不是普通 Plugin，也不是简单 Knowledge override。

它代表一种产品需求：

> **一个已发布游戏允许第三方/作者后续发布“面向该游戏”的内容扩展包。**

Atria 当前 Package / Project / Plugin / Resource Graph 已提供大量地基，但当前 `main` 没有一等的 Package-to-Package Game Add-on composition。

因此新增：

> **Native Add-on / Content Extension Layer**

### 25.13 Add-on 与 Plugin 必须区分

#### Plugin

更接近：

- 平台能力；
- 工具；
- Runtime integration；
- 可跨多个 Work 使用。

#### Add-on

更接近：

- DLC；
- Mod；
- fan expansion；
- scenario pack；
- quest pack；
- character pack；
- skill pack；
- Knowledge expansion；
- optional Activity / View / Asset content。

其 owner 是：

> 某个具体 Package / Game family。

因此不要为了 Mod 而恢复 arbitrary Plugin script。

### 25.14 Native Add-on 的候选模型

```text
AddOnPackage
├─ addonId
├─ version
├─ targetPackageId
├─ compatibility declaration
├─ contributions
│  ├─ Knowledge
│  ├─ Package Data
│  ├─ Prompt Module / Program extension
│  ├─ UI View / Block template
│  ├─ Activity definition
│  ├─ declarative Logic fragment
│  └─ Asset / Asset Pack
├─ permissions
├─ conflicts
└─ migration metadata
```

安装不修改原 Package。

Session 启动时解析：

```text
Base PackageVersion
      +
enabled AddOnVersions
      ↓
Resolved Experience Content Set
```

最终 Session 必须 pin：

- exact Base PackageVersion；
- exact Add-on versions；
- exact dependency graph。

这样才能保证：

- Save 可重现；
- Branch 可重现；
- Debug 可重现；
- 更新后旧 Session 不偷偷变化。

### 25.15 Add-on composition 的安全边界

Add-on 不允许：

- arbitrary JS；
- patch Base Package source；
- 覆盖 typed authority；
- 任意删除 Package command；
- 改写现有 Reducer code；
- 动态 eval；
- 远程 latest-following runtime。

Add-on 可以：

- 新增独立 Knowledge；
- 新增 Package Data；
- 新增资源；
- 新增允许组合的 declarative definitions；
- 通过明确 extension point 扩充 Action / Activity / View；
- 使用 Base Package 声明的 extension namespace。

Base Package 可声明：

```text
Extension Point
├─ id
├─ accepted contribution kinds
├─ schema
├─ conflict policy
└─ visibility / ordering
```

例如：

- `knowledge.fan-lore`
- `activity.quest`
- `catalog.skill`
- `view.sidebar.card`

这比 Worldbook 前缀 + MVU `$mod` 干净得多。

### 25.16 Add-on 与用户魔改 / Fork 的关系

需要区分三件事：

1. **Fork / Derive**
   - 用户复制原资源后自行魔改；
   - 得到自己的新 revision / resource。

2. **Add-on**
   - 不改 Base；
   - 以可卸载方式叠加内容。

3. **Player runtime state**
   - 当前存档里的游戏进度；
   - 不是资源修改。

这也正好解决此前提出过的：

> 用户既想魔改作者 Knowledge，又想再安装额外同人 Knowledge。

它们不应该混成一个操作。

### 25.17 Remote code / hot update 只吸收产品能力，不吸收实现

该卡为了摆脱 Character Card 尺寸和发布限制，会：

- fetch latest remote UI；
- localStorage cache；
- eval remote control script；
- version.json 检测；
- GitHub 内容作为 Mod registry。

产品价值是：

- 大型前端资源独立发布；
- 内容扩展；
- 更新检测；
- optional download；
- version management。

但 Atria Native 不能使用：

- remote eval；
- CDN latest；
- unpinned code；
- localStorage code cache。

对应 Native 方案已经由：

- PackageVersion；
- Asset Pack；
- Add-on exact version；
- Resource Graph；
- install/update transaction；

承接。

### 25.18 MVU 的楼层快照 / 重演能力再次验证 Revision facade

Card 中 MagVarUpdate 暴露：

- 快照楼层；
- 重演楼层；
- 清除旧楼层变量；
- 重新处理变量；
- 重试额外模型解析。

这些功能本质上是在补：

> Message 与对应 state snapshot 必须能够一致地回滚 / 重演。

Atria 当前的：

- Revision；
- Branch；
- Attempt；
- retry；
- re-enter turn；
- SavePoint；

比“楼层变量快照”拥有更好的底层。

因此不增加 MVU snapshot compatibility API。

需要做的是：

> Reply / Branch facade 与历史阅读 UX 必须把这些能力变得普通玩家可用。

### 25.19 文生图标签对 Message Projection 的补充

该卡还有一组 Regex 专门处理：

- `<image>`
- 正文与 image block 的显示关系。

这继续验证：

> Message Projection Block Registry 必须允许 Media Block。

未来可以区分：

- Package Asset image；
- Session Attachment；
- Model-produced Media Request 的结果。

若未来允许模型请求生成图片，也应是 typed：

```text
media_request
→ host capability / provider
→ AssetRef / Attachment
→ Message Projection
```

而不是模型输出 HTML / URL。

本轮暂不新增独立 primitive。

### 25.20 本样本对原能力主表的调整

经过《天书江湖录》压力测试：

- Activity Runtime：由《瀚海》的独立小游戏得到首次验证，本卡的完整战斗再次强验证；
- Opening Phase：从简单 setup 升级为 conditional multi-stage Wizard；
- Action v2：必须升级为带 availability / result / diagnostics 的 Command Surface；
- Player Preference：补充 Player Action Palette overlay；
- World/Session：补 runtime-authored typed entity instance；
- Package Turn Contract：补 bounded synchronous Turn Processor；
- Turn/Activity：补 Activity Outcome → Narrative Handoff；
- Event Journal：明确承担 deterministic UI action → narrative observation；
- Message Projection：补 Media Block；
- 新增 Native Add-on / Content Extension Layer。

因此当前主表由 24 项调整为 **25 项**：

1. Component Model v2；
2. Local UI State；
3. Player Preference State；
4. Package Data Resource；
5. Data Projection；
6. Native Composer Host capability；
7. Action v2 / Command Surface + idempotency / transaction receipt；
8. Declarative Mutation authoring shorthand；
9. Message Projection；
10. Package Turn Contract + bounded synchronous Turn Stage；
11. Turn Envelope；
12. narrative-outcome policy；
13. Runtime Automation；
14. Opening Phase / Variant + conditional Wizard；
15. Reply Variant / Branch facade；
16. Conversation feed/latest/reader；
17. Host advanced presentation/input；
18. Safe Appearance / Motion / Media Presentation；
19. Studio visual authoring v2 deepening；
20. Experience diagnostics；
21. Activity Runtime / Transactional Subscene + Outcome Narrative Handoff；
22. Native Media / Scene Host；
23. Immutable Asset Pack / Heavy Resource Delivery；
24. Auxiliary Task / Background Model Job Runtime；
25. **Native Add-on / Content Extension Layer**。

仍然不是最终冻结答案。

### 25.21 本轮最关键的架构结论

《瀚海》告诉我们：

> 重型体验最终会长成独立 Game Application。

《天书江湖录》进一步告诉我们：

> 即使仍被困在 SillyTavern 里，优秀作者也会自行发明 Application Runtime、Activity、Command API、Setup Wizard、Mod Manager 和额外模型流水线。

因此 Atria 真正应该吸收的是这些产品层 primitive，而不是：

- Regex；
- iframe；
- Worldbook mutation；
- MVU patch；
- Tavern Helper；
- remote eval；
- localStorage；
- DOM hack。

这张卡最大的价值，是证明 Atria 的目标不能只是：

> “比 SillyTavern 更好写角色卡”。

而应该是：

> **让作者不再需要通过劫持聊天宿主，才能做出完整的 LLM Game/Application。**


## 二十六、案例压力测试 03 — 《银麒赎世》V24.4（大型 SillyTavern / MVU Application）

### 26.1 样本定位

本轮样本为用户上传的：

- `V24.4.json`
- Character：`银麒赎世`
- `chara_card_v3 / spec_version 3.0`
- 版本：`24.4`
- 样本生成日期：2026-09-26
- 卡内说明对应 V24.4 发布：2026-09-13

该样本已经明显超出“角色卡 + 状态栏”。

其真实产品形态包含：

- 16 页 Opening Wizard；
- 主叙事；
- 独立系统面板；
- 独立手机应用壳；
- 任务 / 商城 / 背包 / 战斗 / 据点 / 事件链；
- 私聊 / 群聊 / 朋友圈 / 论坛 / 直播 / 监控；
- 多账号视角；
- 世界动态推演；
- 文生图；
- MVU 双模型；
- 独立长期存储；
- 删楼回滚保护；
- 配置体检 / 存档体检 / Runtime Diagnostics；
- 多个独立模型调用通道。

Card 内当前还包含：

- 182 个 Worldbook entry；
- 29 个 Regex；
- 9 个 Tavern Helper script；
- 手机 UI 与系统面板均已发展为大型 application code。

因此本样本最适合检验：

> **当一个“角色卡”已经自行长出多应用、多模型、多视角、长期持久化与自治世界时，Atria Native Capability Layer 还缺什么。**

本轮仍然只审计产品能力，不设计 SillyTavern / MVU 兼容层。

### 26.2 第一结论：这不是一套 UI，而是多个 Runtime Domain

该卡至少同时维护：

```text
Narrative Domain
Game / World Domain
Task Workflow Domain
Phone / Social Domain
World Dynamics Domain
Battle Activity
Image / Media Domain
Diagnostics / Repair Domain
```

旧实现被迫把这些内容压进：

- MVU；
- chat metadata；
- IndexedDB；
- Worldbook；
- Regex；
- iframe；
- Tavern Helper script；
- 多条独立 API。

Atria 不应复制这种存储与通信结构。

但它证明：

> **Full / Hybrid 的能力上限必须允许一个 Package 拥有多个长期运行的 application domain，而不是只有 World State + 一棵 UI Tree。**

### 26.3 Atria 已有地基：Session State 本身不是新发明

本轮再次复核当前 `main@4dab353a`。

`SessionCore` 已经支持任意非保留的 Native Session State namespace，并且这些 namespace：

- 随 immutable Session Revision 提交；
- 随 Branch 分叉；
- 可以在同一 runtime commit 中与 Timeline append 一起提交；
- portable namespace 会进入 Native Save export/import；
- 历史 Revision 继续保持不可变。

因此《银麒赎世》为了手机消息、论坛、图片索引、任务旗标等自行建立：

- chat metadata；
- IndexedDB；
- 双源同步；
- snapshot ring；

并不意味着 Atria 要再造一个数据库。

真正缺的是：

> **Package-facing Typed Session Application State Contract。**

也就是把当前底层已有的 namespace 存储能力正式提升成 Experience Capability。

### 26.4 新缺口 26 — Epistemic / Actor Perspective Projection

这是本样本最重要的新发现之一。

该卡后期专门实现了：

- 某 NPC 是否在当前场景；
- 某 NPC 是否亲历近期事件；
- 两个 NPC 是否拥有共同经历；
- 圈外人物不能知道主角私密主线；
- 私聊只允许参与者知道；
- 公共事件可以传播；
- 私密系统信息不能传播；
- 同一段对话从不同账号查看仍然一致；
- 冒用账号时，收到消息的人可能形成错误认知；
- 角色可以“相信某件事”，但这件事未必是 World Truth。

这已经不是普通 Knowledge activation。

当前 Atria 已有很好的基础：

- Knowledge target / visibility 已支持 `narrator / actor / agent / user`；
- Knowledge 可以 target exact actor id；
- Context Compiler 已经能为 Narrator / Actor / Agent 生成隔离的 ContextPlan。

但当前这些机制主要回答：

> “一份稳定 Knowledge 对谁可见？”

还没有一等回答：

> “运行时发生的一件事，哪些角色亲历、听说、收到、误信、怀疑或完全不知道？”

因此新增：

> **Epistemic / Actor Perspective Projection**

候选数据流：

```text
World Truth / Event Journal
            ↓
Exposure / Communication / Observation
            ↓
Actor Perspective Projection
            ↓
Actor-targeted ContextPlan
```

绝对不要维护：

```text
NPC A World State clone
NPC B World State clone
NPC C World State clone
```

否则必然形成多套事实权威。

候选 Perspective Record：

```text
Perspective Record
├─ actorId
├─ sourceRef
├─ channel
│  ├─ witnessed
│  ├─ direct_message
│  ├─ told_by
│  ├─ public_broadcast
│  ├─ surveillance
│  ├─ rumor
│  └─ inference
├─ observedAtRevision
├─ claim / typed subject
├─ epistemic status
│  ├─ known
│  ├─ believed
│  ├─ suspected
│  └─ disputed
└─ provenance
```

这里必须区分：

- **World Truth**：世界真实发生了什么；
- **Actor Belief / Observation**：某个角色认为发生了什么。

后者可以是错的。

这样才能原生支持：

- 秘密；
- 谣言；
- 误会；
- 身份冒用；
- 监控；
- 分队行动；
- NPC 私聊；
- 多 POV；
- 玩家不在场事件；
- dramatic irony。

Actor Perspective 不修改 World Truth。

它只影响：

- actor-targeted model context；
- limited-POV narrator context；
- 当前视角 UI 的信息投影；
- Knowledge / Memory / Conversation 的可见投影。

### 26.5 Perspective 与 Knowledge / Memory 的边界

冻结建议：

#### Knowledge

回答：

> 世界中有什么稳定知识 / 规则 / 设定？

#### Memory

回答：

> 过去哪些经历值得长期召回？

#### Epistemic Perspective

回答：

> **这个角色现在有资格知道 / 相信什么？**

因此 Epistemic Layer 不替代 Knowledge / Memory。

它是 Context Projection 的一层 runtime evidence / filter：

```text
Knowledge
Memory
Conversation
World Events
Session App Events
        ↓
Perspective Projection(actorId)
        ↓
Context Compiler
```

### 26.6 新缺口 27 — Package Model Task / Generation Task Contract

《银麒赎世》不是只有主 Narrator 与一个变量模型。

它实际允许为不同产品功能分别配置模型通道，例如：

- social chat；
- task evaluation；
- world dynamics；
- forum；
- live；
- surveillance；
- shop evaluation；
- outpost sync；
- plot task；
- image generation。

这揭示了当前 Atria 的真实边界。

当前 `main`：

- Native Generation Host 只接受固定平台 role：
  - `narrator`
  - `intent_resolver`
  - `event_interpreter`
  - `orchestrator`
  - `studio`
  - `memory`
  - `search`
- Game Runtime Role Router 目前只含：
  - `narrator`
  - `intent_resolver`
  - `event_interpreter`
  - `orchestrator`
  - `studio`
- Package `runtime.modelPrompt` 可以声明 namespaced role intent 和 exact Prompt / Generation ref，但 Host 当前没有一等的任意 Package task execution contract。

所以一个复杂游戏目前无法干净声明：

> “我有一个 social-chat model task、一个 quest-evaluator、一个 world-dynamics task，它们不是 Narrator，也不是 Event Interpreter。”

因此新增：

> **Package Model Task / Generation Task Contract**

候选：

```text
ModelTaskDefinition
├─ taskId
├─ semantic role
├─ bindingSlotId
├─ execution class
│  ├─ turn-stage
│  ├─ auxiliary
│  └─ interactive
├─ input schema
├─ context target
│  ├─ narrator
│  ├─ actor:<id>
│  ├─ agent
│  └─ explicit projection
├─ context policy
│  ├─ allowed lanes
│  ├─ required lanes
│  └─ budget hints
├─ task promptProgramRef
├─ generation intent / recommendation
├─ required capabilities
├─ output contract
└─ diagnostics policy
```

重要：

> Model Task 定义“这个模型工作是什么”，不是“什么时候运行”。

执行时机仍然分别属于：

- Package Turn Contract / synchronous stage；
- Auxiliary Task Runtime；
- Runtime Automation；
- UI Action。

因此：

```text
Model Task Definition
        ×
Execution Runtime
```

二者正交。

### 26.7 Package Model Task 不能携带玩家私有 API 配置

即使增加 Package Model Task，也不能复制 phoneAPI 的：

```text
Package
→ URL
→ API Key
→ model name
```

Package 只能声明：

- task semantic；
- required capability；
- Prompt / Generation author intent；
- output contract。

玩家仍然通过：

- Connection；
- Model；
- Runtime Route；
- Secret Store；

决定实际请求发给哪里。

因此：

```text
Package Model Task
        ↓
player-owned Runtime Route binding
        ↓
Connection / Model / Secret
```

Package 永远不能读取 Secret。

### 26.8 Model Task 必须支持 Actor-targeted Context

《银麒赎世》的 NPC 私聊与群聊暴露了关键要求：

一个 `social_chat` task 不能默认拿当前主聊天的完整 Context。

它应声明：

```text
task = social_chat
participants = [A, B]
target = actor perspective / conversation scope
```

Runtime 再通过：

- Epistemic Projection；
- Actor Knowledge；
- shared Conversation；
- shared Memory；
- public World observations；

编译该 Task 自己的 ContextPlan。

因此 Package Model Task 与第 26 项 Epistemic Layer 是直接互补关系。

### 26.9 Context Source Budget 应进入 Model Task contract

该卡的“AI 感知”允许分别控制：

- social；
- forum；
- live；
- memory；
- world dynamics；

各自注入量。

Atria 当前 Context Compiler 已有 lane cap / minimum guarantee 等预算地基。

所以不新增“AI 感知 API”。

应把它 Native 化为：

> **Task-level Context Source Policy**

Package 可以声明：

- 哪些 Context lane 与该 Task 有意义；
- required / optional；
- suggested max budget。

Player Preference 可以控制：

- 某些 optional source 是否启用；
- detail level。

最终 token safety 仍由 Host Context Compiler 决定。

### 26.10 新缺口 28 — Typed Session Application State

《银麒赎世》的手机系统说明，存在大量：

> 必须长期保存、必须随 Branch / Revision 回滚，但并不是 World Truth 的数据。

例如：

- private message threads；
- group threads；
- forum posts；
- social graph derived records；
- generated-media index；
- task workflow state；
- async task status；
- application inbox / unread；
- world-dynamics feed；
- UI-visible operation history。

它们不应进入 World State。

也不能进入 Local UI State，因为关闭 UI 后不能消失。

也不属于 Player Preference。

因此正式定义：

> **Session Application State**

它是现有 Native Session State namespace 的 Package-facing typed contract。

候选：

```text
Session Application Domain
├─ domainId / namespace
├─ schema
├─ storage shape
├─ indexes / query projections
├─ commands
├─ events
├─ reducers
├─ migration version
└─ retention policy
```

权威写入仍然不能是：

`session.patch("phone.messages", ...)`

而应为：

```text
Session App Command
→ validate
→ Event
→ Reducer
→ new Session namespace state
→ immutable Revision
```

World State 的冻结原则不变：

```text
World Command
→ Event
→ World Reducer
```

二者共享 typed authority 思想，但 authority domain 不同。

### 26.11 六种状态必须正式分开

经过三个重型样本，当前 Native 设计应明确区分：

1. **World State**
   - 游戏 / 剧情真实事实；
   - Branch-aware；
   - typed Command / Event / Reducer。

2. **Session Application State**
   - 当前存档的应用域持久数据；
   - Branch-aware；
   - phone / forum / workflow / derived feed 等；
   - typed Session App Command / Event / Reducer。

3. **Activity State**
   - 某个 Activity 内部的临时事务状态；
   - 完成后 settlement；
   - 可按 policy 决定是否支持 resume。

4. **Local UI State**
   - tab / form / open state；
   - 非剧情权威。

5. **Message-local UI State**
   - 单条 Projection block 的临时交互状态。

6. **Player Preference State**
   - 跨 Session；
   - 不随 Branch 回滚。

Legacy MVU / LoreState Provider 不算新的 Native authority，只是兼容读取。

### 26.12 大型 Session App 数据不能物理实现成一个巨型 JSON

《银麒赎世》最后不得不：

- chat metadata + IndexedDB 双存储；
- 大 key 单独存；
- cache；
- backup；
- snapshot；
- merge；
- 去重。

Atria 虽已有 Session namespace 底层，但未来 Session Application State 仍要避免：

> 每发一条手机消息就复制整个百万级 social state。

因此实现阶段应允许 Host-owned 的：

- chunked collection；
- keyed record；
- immutable page/chunk；
- index projection；
- content-addressed payload。

但对 Package 仍暴露统一 typed domain contract。

也就是说：

> **逻辑上是一个 Session Application Domain；物理上不要求是一个单体 JSON document。**

这是 persistence implementation concern，不开放数据库句柄给 Package。

### 26.13 Branch / Retry 必须覆盖所有 Session-authoritative Domain

该卡需要 snapshot ring，根因是：

- MVU；
- phone metadata；
- IndexedDB；
- root metadata；

分散在多个权威来源。

Atria 不应复制 snapshot ring。

应冻结：

> **凡属于 Session-authoritative 的状态，都必须随同一 Revision graph 分支 / 回滚。**

包括：

- World State；
- Session Application State；
- Event Journal；
- Activity settlement result；
- committed Auxiliary Task result。

不包括：

- Player Preference；
- device rendering preference；
- immutable Package Data。

这使：

- Retry；
- Restart From Here；
- Branch；
- SavePoint；

天然不会产生：

> “剧情回去了，手机 / 任务 / 论坛还留在未来”。

### 26.14 Auxiliary Task Runtime 得到第三次强化

该卡的 task evaluation、world dynamics、forum/live 等链路暴露大量真实工程问题：

- 请求很慢；
- rate limit；
- 用户取消；
- 切 Session 后旧结果回来；
- 同一 Task 并发两次；
- late result 写入新 Revision；
- API 返回成功但无有效结果；
- fallback；
- pending UI；
- retry。

因此第 24 项进一步冻结：

Auxiliary Task 必须绑定：

```text
Session
Branch
Revision anchor
Model Task Definition
ContextPlan snapshot
Runtime Route snapshot
```

完成时：

```text
result
→ anchor check
→ stale?
→ validate output
→ authority-specific apply
→ CAS commit
```

若 Session / Branch / Revision 已变化且 policy 不允许 rebase：

> 结果进入 `stale`，绝不偷偷写入当前状态。

### 26.15 Runtime Automation 深化为 World Process Recipe，但不新增第 29 项

该卡有：

- 每日刷新；
- 据点日结；
- 派遣返回；
- NPC 据点发展；
- 末日阶段规则；
- 周期性世界动态；
- 事件生成；
- 自动社交。

Atria 当前 Package manifest 虽已有 `world-simulation` capability 名称，但 `main` 中它目前主要还是 capability vocabulary，并不存在独立的 World Simulation runtime。

本轮不新增一个新的平行 scheduler。

第 13 项 Runtime Automation 应深化为：

> **Runtime Automation / World Process Recipe**

候选：

```text
WorldProcess
├─ processId
├─ trigger
│  ├─ turn
│  ├─ clock
│  ├─ world-time
│  ├─ event
│  └─ state transition
├─ condition
├─ idempotency key
├─ steps
│  ├─ deterministic Command
│  ├─ Rule evaluation
│  ├─ Auxiliary Model Task
│  └─ observation publication
├─ catch-up policy
├─ failure policy
└─ diagnostics
```

例如跨过 7 个游戏日时：

- 不能靠 UI `setInterval`；
- 不能要求模型脑补“七次日结”；
- Runtime 根据 catch-up policy：
  - exact；
  - bounded；
  - aggregate；
- 产生确定性事件 / Task；
- 最终提交 Session Revision。

因此：

> Runtime Automation 决定“什么时候跑”；World Process Recipe 决定“一次自治流程由哪些受控步骤组成”。

仍不允许 Package 定时执行 arbitrary JS。

### 26.16 Experience Diagnostics 升级为 Health / Diagnostics / Repair / Migration

本样本的“配置体检 / 存档体检 / 运行诊断”不是边角功能。

当 Experience 依赖：

- Model Task；
- Runtime Route；
- Add-on；
- Asset Pack；
- optional capability；
- Session schema；
- background job；

玩家必须能知道：

> “为什么这一块没有工作？”

因此第 20 项正式扩展为：

> **Experience Health / Diagnostics / Repair / Migration**

至少包括：

#### Preflight

- Package requirements；
- optional capability；
- Model Task route binding；
- Asset Pack availability；
- Add-on compatibility；
- Host capability。

#### Runtime Diagnostics

- Turn / Task trace；
- ContextPlan；
- selected Runtime Route；
- token budget；
- Action validation；
- World Process；
- Auxiliary Task；
- stale / retry / cancellation；
- Projection error。

#### Save Health

- Session domain schema version；
- impossible references；
- missing assets；
- orphan records；
- migration status。

#### Repair

必须：

- preview diff；
- explicit player confirmation；
- typed remediation；
- undo / Revision when it mutates Session authority。

Package 不得：

- 任意修改玩家全局设置；
- 自动启用 Plugin；
- 自动改 Secret；
- 删除其它 Package 内容。

需要宿主设置变化时，只能生成：

> Host-owned remediation suggestion / action。

### 26.17 Capability Negotiation 必须玩家可见

此前 Host capability negotiation 更偏运行时：

`scene3d available?`

本样本说明它还必须可解释：

```text
Feature: World Dynamics

required:
- task route configured
- model.text supported

optional:
- long context >= suggested budget

status:
- ready
- degraded
- unavailable

remediation:
- configure route
```

所以 capability negotiation 不能只是日志里的 Boolean。

Studio 与 Player Runtime 都需要展示：

- requirements；
- effective capabilities；
- degradation path；
- remediation。

### 26.18 多模型 ≠ MVU 双模型专用 API

本样本推荐：

> Narrator 写故事 + 另一个模型写变量补丁。

Atria 当前已经有更干净的：

- narrator；
- event_interpreter；
- narrative-outcome；
- typed Command / Event authority。

因此不要增加：

- “MVU extra model”；
- “变量模型 API”。

真正应该吸收的是：

> **一个 Experience 可以拥有多个职责明确、输出 contract 不同、可分别绑定 Runtime Route 的 Model Task。**

变量解释只是其中一种 Task。

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


## 二十七、修订记录

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
