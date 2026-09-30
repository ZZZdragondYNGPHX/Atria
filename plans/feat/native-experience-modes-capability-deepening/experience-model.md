# Atria Native Experience Modes & Capability Deepening — Experience Model

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

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
