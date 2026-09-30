# Atria Native Experience Modes & Capability Deepening — Component Model v2

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

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
