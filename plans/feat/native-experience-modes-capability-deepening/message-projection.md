# Atria Native Experience Modes & Capability Deepening — Message Projection / Turn Envelope

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

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
