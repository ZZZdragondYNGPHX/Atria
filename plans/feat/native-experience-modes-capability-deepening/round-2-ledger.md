# Atria Native Experience Modes & Capability Deepening — Round 2 Capability Ledger

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

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
