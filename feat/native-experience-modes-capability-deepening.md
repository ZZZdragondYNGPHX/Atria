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

#### 不作为首选主路径

`post-narrative reconciler`

仅用于 Legacy MVU/自由文本迁移，因为它需要第二次解释，而且可能出现 prose 与 authority 不一致。

`draft → resolve → final prose`

保留为高一致性高级 pipeline，将来可由 Orchestrator/Role policy 选择，但不作为本轮基础 Runtime 的强制成本。

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
21. Legacy post-narrative resolver 只作为兼容桥。
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

高阶前端需要至少：

1. World State；
2. Session-authoritative State；
3. Local UI State；
4. Player Preference State。

Atria 当前前两层有较强基础，但 UI/Preference 层尚未形成 Native Package contract。

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

### 23.13 第十组差距：Conversation Presentation

高阶 Hybrid 应能把同一 Timeline 以不同方式呈现：

- feed；
- latest；
- reader。

而不是 Package 自己重新读 Timeline、重新造聊天系统。

需要：

> Native Conversation presentation mode。

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

### 23.17 第十四组差距：Diagnostics

复杂卡必须能回答：

- 为什么这个 Component 没显示？
- 哪个 selector 失败？
- Action 为什么被拒绝？
- 哪个 Command validator 失败？
- 哪个 block schema 不合法？
- 本轮 structured output 为什么 rejected？
- 哪个 Runtime Automation 被 cycle guard 阻止？
- 当前 UI 读的是 World / UI / Preference 哪个状态？

因此 Experience Runtime 需要统一 diagnostics surface，而不是 console-only。

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
5. Data Projection；
6. Native Composer Host；
7. Action v2；
8. Declarative Mutation shorthand；
9. Message Projection；
10. Package Turn Contract；
11. Turn Envelope；
12. narrative-outcome policy；
13. Runtime Automation；
14. Opening Phase / Variant；
15. Reply Variant / Branch facade；
16. Conversation feed/latest/reader；
17. Host Fullscreen / focus / gamepad；
18. safe theme/style/motion；
19. Studio visual authoring；
20. Experience diagnostics。

这些才是后续深化目标。


## 二十四、修订记录

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
