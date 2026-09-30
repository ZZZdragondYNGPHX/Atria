# Atria Native Experience Modes & Capability Deepening — Case Study 02 — 天书江湖录

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

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
