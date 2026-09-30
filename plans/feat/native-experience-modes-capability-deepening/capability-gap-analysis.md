# Atria Native Experience Modes & Capability Deepening — Capability Benchmark Gap Analysis

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

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
