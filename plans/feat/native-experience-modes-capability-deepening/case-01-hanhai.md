# Atria Native Experience Modes & Capability Deepening — Case Study 01 — 瀚海

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

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
