# Atria 沉浸体验重构企划书

## 任务信息

- 任务：Immersive Experience Refactor
- 类型：`feat/*`
- 工作分支：`feat/immersive-experience-refactor`
- 基线：`main@fad1dd44c11854861db0a5b2d92335792def8ecc`
- 状态：已实现、已完成 CI 验证，并通过 PR #74 squash 合并到 main
- 产品原则：沉浸模式不是“把酒馆放全屏”，而是建立在现有聊天运行时之上的自适应剧情呈现系统。

## 一、背景与现状

当前 Atria 沉浸模式主要完成以下事情：

- 尝试浏览器 Fullscreen API；
- Android 原生侧隐藏状态栏/导航栏并铺入刘海区域；
- 页面切换 `atria-immersive-mode`；
- 默认隐藏 `#top-bar` / `#top-settings-holder`；
- 调整 `#sheld`、`#chat` 的可用高度；
- 保留退出沉浸按钮；
- 记忆上次沉浸状态；
- 可选保留原版顶部栏。

它仍然沿用普通 SillyTavern/Atria 聊天界面的视觉与交互组织，因此更接近“全屏 + 隐藏顶栏”，没有形成真正独立的沉浸体验。

## 二、产品定义

沉浸模式采用 **自适应沉浸模式**：

1. 没有额外视觉资源时，呈现为高级小说阅读器。
2. 有普通角色头像时，自动升级为头像增强布局。
3. 有明确注册的立绘/场景资源时，升级为视觉叙事布局。
4. 有 LoreState、CardApp 或第三方沉浸 Provider 时，再自然升级为 RP 游戏式 HUD/行动交互。

不要求角色卡专门适配，也不通过图片尺寸等启发式逻辑猜测“这是不是立绘”。

普通模式继续负责完整的 Atria 操作面板；沉浸模式负责剧情消费和轻量交互。

## 三、核心架构原则

### 3.1 沉浸模式是 Presentation Layer，不是新运行时

禁止复制或创建另一套：

- chat 数据；
- message/swipe 数据；
- generation runtime；
- orchestration runtime；
- memory runtime；
- world info runtime；
- LoreState/MVU 状态；
- Regex 生命周期。

沉浸层只消费当前已有运行时与 DOM/事件状态，并提供新的呈现和交互外壳。

现有 Regex、LoreState、MVU、CardApp、TTS、Expressions、Memory OS、Orchestrator、Search Tools、第三方插件继续沿原生命周期执行。

### 3.2 沉浸模式与 Fullscreen 解耦

`setImmersiveMode()` 的产品语义升级为“进入/退出沉浸呈现层”。

Fullscreen API / Android system bars 只是附加能力：

- Fullscreen 请求失败，沉浸模式仍然保持；
- 浏览器、PWA、Android 可根据平台能力获得不同程度的系统级全屏；
- 退出系统 fullscreen 不应无条件摧毁沉浸 UI，除非这是明确的用户退出动作；
- Android 原生沉浸桥继续复用，但不能成为 Web 沉浸模式成立的前提。

## 四、界面分层

沉浸界面按四层组织。

### 4.1 舞台层 Stage

负责：

- 当前聊天背景；
- Provider 提供的场景背景；
- 明确注册的角色立绘；
- 氛围色/accent；
- 安全区、刘海、桌面/移动布局边界。

资源优先级必须可预测，Provider 不允许任意覆盖整个产品 DOM。

### 4.2 正文层 Narrative

聊天正文成为主舞台：

- 不再以传统“聊天气泡 + 常驻操作栏”为视觉中心；
- 当前 AI 回复视觉权重最高；
- 上一轮适度弱化；
- 更早历史默认更弱；
- 用户主动滚动历史时恢复历史内容到正常可读权重；
- 视觉弱化不能影响 DOM 可访问性；
- 默认隐藏楼层号、token、模型、时间戳、编辑/复制/删除按钮等技术信息；
- 点击/长按消息后才出现消息浮动操作。

普通消息数据结构与 swipe 机制保持不变。

### 4.3 HUD 层

HUD 分三层：

#### 常驻摘要

只允许 3～5 个高价值信息点，例如：

- 地点；
- 日期/时间；
- 当前场景/章节；
- 一个关键角色状态；
- 当前任务/目标。

没有数据时不显示，不从正文猜测。

#### 瞬时事件

状态变化后短暂出现，例如：

- 好感度 +3；
- 获得物品；
- HP/MP 变化；
- 进入新区域；
- 场景变更。

事件淡出后不占常驻面积。

#### 详情面板

完整状态只在用户主动打开时展示。可以容纳：

- 人物状态；
- 关系；
- 装备；
- 任务；
- 世界信息；
- LoreState 自定义字段；
- Provider 专属详情。

第一版只展示“当前状态”，不实现历史楼层 HUD 回放。

### 4.4 交互层

底部交互使用三级状态。

#### 静默状态

只保留轻量输入胶囊：

`说点什么……  ➤`

数秒无操作后降低视觉权重，但不完全消失。

#### 输入状态

聚焦后展开：

- 多行输入；
- 发送/停止；
- 一个 `+` 入口；
- 低频附件、扩展、原版输入工具进入展开菜单；
- Android IME 只触发布局重排，不退出沉浸模式。

#### 生成状态

发送后输入区转为轻量生成状态，例如：

- “角色正在回应…”
- “场景正在继续…”

只暴露一个明确的停止入口。

Search / Orchestrator / Memory / fallback / tool call 等技术阶段默认不直接显示。用户主动展开时只显示人类可理解的粗粒度状态，再进入 Diagnostics 才看真正技术细节。

## 五、角色视觉与多角色规则

### 5.1 纯文本

- 小说阅读布局；
- AI 正文融入页面；
- 角色名轻量署名；
- 用户消息适度区分，不使用强聊天软件气泡；
- 背景承担氛围但不能压正文。

### 5.2 头像增强

有头像时：

- 当前回复可显示较大的头像；
- 连续同角色回复避免重复堆头像；
- 群聊通过头像/名字标识发言者；
- 历史阅读仍保持正文优先。

### 5.3 立绘舞台

仅在 Provider 明确提供 `portrait` 时启用：

- 桌面端可位于正文侧边或舞台前景；
- 手机端以背景/半身浮层为主，不长期挤压正文宽度；
- 当前发言角色增强，非发言角色弱化；
- 群聊限制同时高权重显示的角色数量；
- 动画保持克制，并遵守 Reduced Motion。

## 六、沉浸 Provider API

第一版提供 **最小可用 API**，避免一次性建立过重框架。

概念模型：

```text
Immersive Provider
├─ identity
│  ├─ id/source
│  └─ priority
├─ scene
│  ├─ title
│  ├─ location
│  ├─ time
│  └─ chapter
├─ visual
│  ├─ avatar
│  ├─ portrait
│  ├─ background
│  └─ accent
├─ hud
│  ├─ summary
│  ├─ transient
│  └─ details
├─ actions
│  ├─ send
│  └─ compose
└─ lifecycle
   ├─ sceneChanged
   ├─ stateChanged
   └─ dispose
```

第一版只实现实际被 Atria 本体需要的注册、取消注册、状态刷新、HUD summary/transient/details、visual、actions 与 scene-change 通路。

要求：

- Provider 必须带稳定 id/source；
- 支持优先级；
- HUD 有严格预算；
- Provider 不允许直接接管整个页面；
- Provider 故障不得导致聊天主流程失败；
- 未接入 Provider 的第三方扩展功能仍能从工具面板访问。

## 七、HUD 预算

常驻 HUD 必须有显示预算，建议第一版：

- primary：1；
- secondary：2；
- ambient：2。

超过预算的条目进入详情层。

Atria 不自行理解“好感度”“HP”“魔力”等字段语义，只消费 Provider 已经整理好的显示数据。

## 八、行动选项

行动选项成为标准沉浸组件，但 Atria 不负责自动生成内容。

Provider 可声明两种行为：

- `send`：点击后直接作为用户消息发送；
- `compose`：点击后填入输入框，允许用户继续编辑。

手机端使用适合触控的一列/两列按钮；桌面端可根据宽度横向组织。

该机制应能承接 LoreState、CardApp、Regex 输出或第三方插件提供的行动选项。

## 九、生成、中断、继续与重写

生成过程默认保持剧情语言，不直接暴露技术术语。

中断后显示轻量结果条：

- 继续；
- 重写；
- 保留。

语义：

- 继续：复用现有 Continue 能力；
- 重写：复用原生 swipe/regenerate，创建新的回复版本；
- 保留：接受当前截断回复，不创造额外消息系统。

移动端左右滑 swipe 保持；桌面/触控在消息操作层显示简洁的 `‹ 2 / 4 ›`。

## 十、消息操作

默认不显示常驻操作栏。

点击/长按消息后出现：

- 复制；
- 编辑；
- 重写；
- 更多。

编辑优先采用沉浸式原地编辑；复杂功能仍可从“更多”进入原生工具。

不能重新实现消息保存、删除、swipe 等数据逻辑，必须调用现有能力。

## 十一、错误与 Diagnostics 联动

沉浸模式不自己实现新的错误归因器。

优先消费现有 Logging / Diagnostics 的结构化结果和 ownership attribution：

- Atria；
- SillyTavern upstream；
- third-party extension/plugin；
- network/external provider；
- user configuration；
- local environment；
- unknown。

普通失败先显示：

`回应没有完成 [重试] [查看原因]`

自动 fallback 成功时不打扰用户。

只有最终失败才进入沉浸错误提示；“查看原因”进入现有 Diagnostics Workspace 或其对应 incident/detail。

## 十二、场景事件

Atria 本身不从自然语言正文猜“是否换场”。

Provider/扩展可以发送明确场景变更事件。

收到后沉浸层可以：

- 更新背景；
- 更新 HUD；
- 调整视觉资源；
- 增加轻量章节分隔；
- 执行 Reduced Motion 允许的轻微过渡。

## 十三、沉浸唤醒与界面呼吸

阅读状态下：

- HUD 自动淡化；
- 输入区弱化；
- 消息操作隐藏；
- 桌面端鼠标长时间静止可隐藏指针。

以下动作重新唤醒 UI：

- 鼠标移动；
- 点击/触摸舞台；
- 聚焦输入区；
- 长按消息；
- 打开 HUD/工具面板。

不能让核心输入入口完全不可发现。

## 十四、设置重构

废弃旧的 `immersive_mode_keep_top_bar` 产品思路，不提供“经典/新版/完全沉浸”多套模式。

建议设置：

### 基础

- 记住上次沉浸状态；
- 视觉呈现：自动；
- 当前剧情聚焦：开启；
- HUD：自动隐藏；
- 扩展沉浸组件：开启。

### 高级

视觉：

- 纯文本优先；
- 自动；
- 视觉增强。

HUD：

- 自动；
- 常显；
- 极简。

不新增大量透明度/动画时间/头像尺寸等微调滑块；深度视觉定制继续交给 Custom CSS。

## 十五、桌面与移动 Presentation Profile

不能只靠同一套 CSS 缩放。

### Desktop

- 限制正文最大阅读宽度；
- 舞台资源可利用左右空白；
- 鼠标移动/hover 可唤醒控制层；
- 键盘操作与 Escape 优先级完整支持；
- 多列视觉资源必须服从正文优先。

### Mobile

- 顶部只保留轻量 HUD；
- 中间几乎全部给剧情；
- 底部输入胶囊；
- 立绘不得长期侵占正文宽度；
- 触控目标足够大；
- 长按消息进入操作层；
- Android 使用现有 system-bars / cutout / IME / Back bridge。

## 十六、退出与 Back/Escape 优先级

### Desktop Escape

优先级：

1. 当前弹窗/原地编辑；
2. 正在生成则执行现有停止；
3. 临时沉浸面板/HUD detail；
4. 退出沉浸模式。

### Android Back

优先级：

1. 键盘/当前顶层 UI；
2. 消息交互/沉浸面板；
3. 正在生成；
4. 退出沉浸模式；
5. 原有 WebView 返回/退出 App。

不得因为沉浸模式绕过当前 Atria 已有的 Escape/Back 消费逻辑。

## 十七、性能与 Reduced Motion

不新增独立“低性能模式”。

直接尊重：

- `power_user.reduced_motion`；
- `prefers-reduced-motion: reduce`。

Reduced Motion 下：

- 无消息位移动画；
- 无立绘切换动画；
- HUD 直接显隐；
- 场景转换简化；
- 回复落定只更新状态。

移动性能要求：

- 控制 backdrop-filter 数量；
- 限制同时活跃的大图/立绘；
- 延迟非必要大图解码；
- 避免为沉浸模式复制整份历史消息 DOM；
- 对 offscreen 历史内容保持当前已有优化能力；
- 不引入持续高频 layout/scroll observer。

## 十八、无障碍

必须作为首版验收内容：

- 使用真实 button/input；
- 提供 `aria-label` / `aria-expanded`；
- HUD transient 仅对重要文本使用 `aria-live="polite"`；
- 背景/立绘变化不做噪声播报；
- 历史视觉弱化不使用 `aria-hidden`；
- 顶层详情/工具面板有正确 focus trap；
- 关闭后焦点返回触发点；
- 键盘可完成进入、退出、消息操作、发送、中断。

## 十九、第三方扩展兼容策略

第一版采用“运行时保持 + 呈现降级”：

- 不删除第三方插件原 DOM；
- 沉浸模式可以隐藏普通模式的低优先级 UI；
- 未接入 Provider 的插件功能从统一工具/更多入口访问；
- Provider 是增强而非使用沉浸模式的前置条件；
- 第三方异常不得阻止退出沉浸或发送普通聊天消息。

## 二十、建议代码结构

正式实现前必须再次检查当前代码，不机械照此创建文件；但建议把沉浸逻辑从 `script.js` 中拆出，避免继续膨胀核心文件。

建议目标结构：

```text
public/scripts/immersive/
├─ controller.js
├─ providers.js
├─ presentation.js
├─ hud.js
├─ composer.js
├─ message-actions.js
├─ visuals.js
└─ accessibility.js

public/css/
└─ immersive.css
```

现有 `script.js` 保持薄集成：

- 初始化沉浸 controller；
- 转接现有 generation/message/swipe/action 能力；
- 保留必要向后 API 导出。

Android `MainActivity.kt` 只处理系统级窗口能力和 Back/IME 桥，不承担 Web UI 业务。

## 二十一、实施阶段

### Phase 1 — Controller 与布局基础

- 拆出沉浸 controller；
- Fullscreen 与 immersive state 解耦；
- 建立 desktop/mobile presentation profile；
- 保留 Android bridge；
- 重做进入/退出/恢复；
- 删除 keep-top-bar 旧产品路径。

### Phase 2 — Narrative + Composer

- 新正文视觉；
- 当前剧情聚焦；
- 消息操作按需浮现；
- 输入三级状态；
- 生成状态；
- swipe/regenerate/continue/abort 复用。

### Phase 3 — Provider + HUD

- 最小 Provider registry；
- HUD budget；
- summary/transient/details；
- scene/visual/action 接口；
- Provider 隔离失败。

### Phase 4 — Visual Adaptation

- avatar enhancement；
- portrait/background；
- 多角色视觉规则；
- scene transition；
- Reduced Motion。

### Phase 5 — Diagnostics / Extension Integration

- 结构化生成状态；
- Diagnostics ownership 消费；
- 第三方工具入口；
- LoreState/CardApp 接入点与示例。

### Phase 6 — Accessibility / Regression / Polish

- keyboard/focus/aria；
- mobile safe-area/IME；
- performance audit；
- browser E2E；
- Android bridge JVM tests（仅当 Kotlin 有实际改动时）。

## 二十二、主要验收标准

1. 进入沉浸模式后，不再只是隐藏顶栏，而出现完整独立剧情呈现层。
2. Fullscreen API 失败不导致沉浸模式失败。
3. 普通纯文本角色卡无需适配即可获得完整沉浸体验。
4. 有头像时自动增强；只有明确 Provider 资源才启用立绘。
5. LoreState/CardApp/第三方可通过 Provider 提供 HUD、视觉和行动选项。
6. HUD 常驻内容严格受预算限制。
7. 普通聊天数据、swipe、generation、Regex、World Info、Memory、Orchestrator 生命周期不复制、不分叉。
8. 中断后的继续/重写/保留可用。
9. 自动 fallback 成功不打扰；最终失败可进入现有 Diagnostics。
10. Desktop 与 Mobile 是不同 presentation profile，而不是简单缩放。
11. Android 原生 system-bars/cutout/IME/Back 能力继续正常。
12. Reduced Motion 生效。
13. 键盘与屏幕阅读器核心路径可用。
14. 未接入 Provider 的第三方插件不因进入沉浸模式而失去功能。
15. 退出沉浸后普通 UI、滚动位置、聊天状态和运行状态恢复正确。

## 二十三、验证要求

按 touched surface 选择并实际执行：

- ESLint；
- 相关 Node unit/regression tests；
- 新增 immersive controller/provider/HUD 单测；
- 浏览器 Chromium E2E：桌面进入/退出、生成、abort、swipe、edit；
- Mobile Chromium：安全区、输入、长按、HUD、历史滚动；
- Reduced Motion 回归；
- Provider 故障隔离回归；
- Diagnostics error handoff 回归；
- Atria Migration Guard；
- frontend build / 必要的静态资源构建。

如实际修改 Android/Kotlin：

- Android JVM tests。

除非用户另外要求，不构建 APK，不执行 Docker build。

## 二十四、非目标

第一版不做：

- 历史楼层 HUD 状态回放；
- AI 自动从正文推断场景、时间、地点；
- 独立 immersive chat/runtime；
- 重新实现 LoreState/MVU；
- 重新实现 generation/swipe/message persistence；
- 强制视觉小说布局；
- 对所有第三方插件提供定制适配；
- 大量视觉微调设置；
- 重型 3D/粒子/视频舞台系统。

## 二十五、关键风险

### DOM 兼容

沉浸呈现不能通过大规模搬移/销毁原聊天节点破坏第三方委托事件或上游选择器。

优先采用稳定容器、CSS presentation、受控 wrapper/portal；若必须调整 DOM，需要真实浏览器回归。

### Mobile WebView

注意当前 Atria 已有 transformed/fixed containing-block、`--doc-height`、safe-area、IME 等历史问题。沉浸层不能重新引入 0 高度、键盘遮挡或 top-layer 被盖住的问题。

### 性能

不能为视觉效果复制整份 chat DOM、持续读取大规模 layout、同时解码多张高分辨率立绘。

### Provider 滥用

Provider 必须受到预算、优先级、隔离和 dispose 生命周期约束，不能让插件重新把沉浸 HUD 变成控制面板。

## 二十六、最终目标

最终体验应达到：

> 用户进入沉浸模式后，感知到的是“进入当前聊天世界”，而不是“把 Atria 的普通界面按 F11 放大”。

纯文本卡像小说；有视觉资源时像视觉叙事；有 LoreState/CardApp 时像轻量 RP 游戏。所有复杂 AI、Memory、Orchestrator、Search、插件和 Diagnostics 能力仍在后台工作，但不会无理由打断剧情。


## 二十七、最终实现记录（2026-09-20）

### 实现结果

本任务已按定稿方案完成 Phase 1～6，工作分支最终验证 HEAD：

`feat/immersive-experience-refactor@76a8b894281c0e05b90b5210b385cfa5fb310876`

对应 PR：

- #74 `feat: immersive experience refactor` — 已合并
- main 合并提交：`9767257e3ecce049936c68072d9328c14bab3243`

最终代码保持“Presentation Layer over existing runtime”的边界，没有创建第二套 chat/message/swipe/generation/World Info/Memory/Orchestrator/LoreState 运行时。

实际落地的沉浸模块为：

```text
public/scripts/immersive/
├─ controller.js
├─ providers.js
├─ presentation.js
├─ hud.js
├─ composer.js
├─ message-actions.js
├─ visuals.js
├─ accessibility.js
├─ breathing.js
└─ diagnostics.js

public/css/
└─ immersive.css
```

相较最初建议结构，实际增加 `breathing.js` 与 `diagnostics.js`，分别隔离界面呼吸逻辑和最终失败/Diagnostics handoff，避免继续膨胀 controller。

Android 侧实际新增：

- `BackNavigationPolicy.kt`
- `BackNavigationPolicyTest.kt`

并调整 `MainActivity.kt`，使 Web/沉浸层优先消费 Android Back，再回退到 WebView history / App exit；同时把原生 fullscreen state 与故事沉浸 state 解耦。

### 主要落地能力

已完成：

- immersive state 与浏览器/Android fullscreen 解耦；
- desktop/mobile 独立 presentation profile；
- Narrative 当前剧情聚焦与历史阅读恢复；
- 复用原始 chat DOM，不复制历史消息；
- 纯文本 / 头像 / Provider 明确 portrait 三档自适应；
- 原生 textarea 驱动的静默 / 输入 / 生成三级 composer；
- 中断后的 Continue / Rewrite / Keep；
- 点击、键盘和移动长按触发的消息操作层；
- Provider registry、priority、refresh、dispose 与故障隔离；
- HUD 预算：primary 1、secondary 2、ambient 2，溢出进入 Details；
- Provider scene/background/portrait/accent/action；
- Reduced Motion 与 idle breathing；
- 最终生成失败进入轻量提示，并转交既有 Diagnostics Workspace；
- 第三方 DOM/运行时保持，不要求 Provider 才能继续运行；
- Provider API 文档：`docs/development/extension-api/immersive-provider.md`；
- 简体中文 / 繁体中文沉浸控件本地化；
- Android Back：输入/IME → 顶层 UI → 沉浸 transient/HUD → generation → 退出沉浸 → WebView history/退出；
- 移动端 safe-area、`--doc-height` 与触控目标尺寸硬化。

### 实施过程中发现并修复的问题

CI/真实浏览器验证实际暴露并修复了以下问题：

1. `controller.js` 一处 ESLint trailing-comma 错误。
2. 初版沉浸初始化错误调用 tagged-template `t(value)`，导致真实前端启动失败。
3. 改用 `translate()` 后进一步暴露循环 ESM TDZ：`trackMissingDynamicTranslate` 尚未初始化。
4. 将沉浸动态 UI 改为启动期安全 fallback + `data-i18n` locale pass，避免 i18n 循环依赖阻塞启动。
5. 随后真实 runtime smoke 又暴露 `power_user` TDZ；最终移除 Controller 构造阶段对宿主设置的读取，仅在实际 enable/restore 时安全读取。
6. Mobile Chromium smoke 初版缺少 viewport meta，导致 390px context 被浏览器按 desktop layout viewport 解释；已修测试夹具，不修改产品 profile 判定。
7. Worldbook runtime smoke 增加 startup timeout 时的 `pageerror` 与 server log 输出，使前端启动类回归能够直接定位真实异常。
8. Android Back 对沉浸 HUD dialog 与输入焦点的消费顺序进一步修正。

### 最终验证结果

最终验证 HEAD：

`76a8b894281c0e05b90b5210b385cfa5fb310876`

全部通过：

- Immersive Experience — run `35512227222` — **success**
- Android JVM Tests — run `35512227176` — **success**
- Atria PR Checks — run `35512227165` — **success**
- Worldbook Performance Foundation — run `35512227196` — **success**

其中覆盖：

- ESLint；
- Node unit/regression；
- immersive controller/provider/HUD/visuals/diagnostics/breathing tests；
- Desktop + Mobile Chromium immersive smoke；
- frontend build；
- Atria Migration Guard；
- Worldbook / Performance runtime smoke；
- Android JVM Back policy tests。

本任务没有构建 APK，也没有构建 Docker image。

### 结论

PR #74 已通过 squash merge 合入 `main@9767257e3ecce049936c68072d9328c14bab3243`，并已验证主线可读取沉浸 controller/provider/CSS 与 Android Back policy 等关键文件。

首版“真正的沉浸模式”已从原来的“隐藏顶栏 + fullscreen”升级为独立剧情呈现层，同时保持现有 Atria 运行时为唯一事实源。

纯文本聊天表现为小说阅读器；普通头像自动进入头像增强；只有显式 Provider portrait 才进入立绘叙事；Provider 可进一步提供 HUD、场景与行动能力。Fullscreen、Android system bars、Diagnostics、World Info、generation、swipe、第三方扩展仍复用现有能力，没有形成第二套运行时。
