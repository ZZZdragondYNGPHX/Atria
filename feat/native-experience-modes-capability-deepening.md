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

在实际迁移 SillyTavern 高阶角色卡时，问题已经暴露：一个典型的“自定义开局表单 → 收集多个输入 → 组合 Prompt → 写入 Composer → 自动发送”的酒馆卡交互，当前 Native Component Model 无法直接表达。类似问题也会继续出现在 MVU 状态栏、消息内快速回复、正文后状态卡、动态表单、分步向导等场景。

因此本任务目标不是给单张角色卡打补丁，而是进一步深化 Atria 的 Experience 模式，使其系统性承接 SillyTavern 基础交互能力与 MVU 前端能力。

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

### 3.3 MVU Native 化方向

目标是：

```text
MVU stat_data / variables
        ↓
Native World / Session State

Regex HTML / MVU Frontend
        ↓
Native Component / Message Projection
```

MVU Provider 保留为 legacy compatibility bridge，而不是新 Atria Package 的首选权威状态系统。

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

因此后续需要明确四种状态层，禁止混用：

1. **World State**：剧情/游戏权威事实；
2. **Session State**：会话运行时持久状态；
3. **Local UI State**：表单、tab、wizard 等临时前端状态；
4. **Legacy Provider State**：MVU / LoreState 等兼容读取。

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


## 二十、修订记录

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
