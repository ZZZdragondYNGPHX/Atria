# 全产品前端实施输入

> 执行规则入口：[Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

功能范围归[提示词／前端方案](../../refactor/atria-native-prompt-preset-deepening/index.md)，最新源码关系见[源码剖析](../../refactor/atria-native-prompt-preset-deepening/baseline.md)。本文件定义页面与接线工作，产品实现留在原任务源码分支。

## 产品范围

覆盖 Library、Play、Studio 全 20 视图与 Project Agent、Agents/Memory/Goals/Experience/Eval、World/Knowledge、Prompt、Runtime/Model/Connection、Settings/Account、Skills/Plugins/Search/Regex、Visual Director/Media/Speech、共享会话、存读档、备份／同步、Storage 与 Diagnostics。

189 组旧盘点提供功能定位，新增作者流程和 V3 Plan/Run 一并实现。旧文件的未接通结论按当前源码更新；原有 Source、Assets、作品界面、Simulation、Preview、Build 和下载继续保留。

## 底座与视觉输入

沿现有 native ES modules/DOM/CSS、Shell、NavigationAuthority 与领域客户端实施；复用已有组件、`--atri-*` tokens、图标和本地化。

当前源码已采用 Serene Canvas；后续前端重构以本次重新提供的 [Atrium HTML](design-proposal/atria-visual-direction.html) 与配套[功能表现](design-proposal/atria-function-presentation.md)、[设计指导](design-proposal/atria-frontend-guidelines.md)为视觉和交互输入，在现有组件上演进。保留 Atrium、Nocturne/Folio、暖金色、Stage/Workbench/Ledger 和语义状态系统，不从零重建原型或另起 Shell。Serene Canvas 旧稿保留作历史与既有交互参考；与本轮 Dock/布局方向不同的部分不再覆盖新稿。

外部 HTML 的 `--surface-*` 等 token 映射到原 `--atri-*` 体系；保留两套主题的对应关系，不另建平行主题系统。原型默认夜色不自动改写用户现有主题偏好，固定栏宽也不是实施要求；P-01～P-11 的新增产品能力仍按实际确认范围使用。

日常页面围绕阅读、资源和编辑内容；完整来源、Wire、费用明细与日志由用户展开。一次实际动作给出对应结果，不把每页做成流程状态控制台。

## 本轮视觉与交互方向

| 项目 | 前端重构采用的方向 |
| --- | --- |
| Magnetic Dock | 用悬浮磁吸导航替代固定全局导航轨，只放五个主工作域；支持四边吸附、自动隐藏与鼠标鱼眼，搜索/全局工具/账户独立在顶栏。沿原 `edge-dock.js` 和 NavigationAuthority 改造，完整规则见[设计指导 §3.4](design-proposal/atria-frontend-guidelines.md#34-磁吸导航-dock) |
| Dynamic Island | 顶部居中的可展开 Agent 活动摘要，汇总任务、进度、审批、阻塞与错误并避让碰撞。复用原任务/Run 投影、详情和审批入口，与 Play 作品 HUD 及 Composer 生成状态分开；见[§3.5](design-proposal/atria-frontend-guidelines.md#35-活动灵动岛-dynamic-island) |
| Adaptive Workspaces | Studio/Agents 辅助面板保持可达但可收起/调尺寸，支持专注编辑；Play Inspector 默认关闭。按可用空间用分段/Sheet/覆盖层，不强制三栏；见[§3.6](design-proposal/atria-frontend-guidelines.md#36-可调工作区) |
| Visual Refinement / Polish | 优化留白、文字层级与按需披露，保留信息密度和用户控制；区分 Dock/活动表面与稳定纸面。沿原组件使用克制、可中断的动效，覆盖键盘、触屏、IME 与 reduced-motion，避免通用仪表盘和过量玻璃 |

当前 HTML 在 ≤720px 将 Dock 设为底边常驻并停用换边拖动/鱼眼，活动仍为本地演示，布局偏好仅在本机 `localStorage`。这些限制和[原型变更记录](design-proposal/atria-function-presentation.md#01-当前原型修订)一并交给实施端；不能把演示计时或摘要当成真实调度、审批、后台任务或跨设备同步。保留原型已有交互、功能入口与明确的演示标识；本次资料更新只改原型与文档，应用代码另在原任务源码分支实施。

## 按领域接线

| 页面 | 实现内容 | 既有落点 |
| --- | --- | --- |
| Shell | 磁吸五域 Dock、独立顶栏工具、活动灵动岛、搜索、深链、返回与 Sheet | `atria-shell/app-shell.js`、`edge-dock.js`、`navigation-authority.js`、`workspace-host.js`；活动读取原领域任务投影 |
| Library | Work 安装／启动、Session、World/Knowledge、Persona、预设与专业资源 | `library-workspaces.js`、`prompt-presets.js`、`prompt-authoring.js` 与原资源服务 |
| Play | 长文、输入、生成／停止、历史／存档、参数、作品 UI 与媒体；Inspector 默认关闭 | `play-product.js`、`play-generation.js`、SessionRuntime/ConversationWindow |
| Studio | 20 个视图、人工编辑、Project Agent、Changes/Apply、Source、Assets、预览、Simulation、Build；面板可收起/调尺寸 | `studio-workspace.js` 与各原编辑器／客户端 |
| Agents | 原 Plan Library、Graph/List/Inspector、Binding、Run Timeline/Graph、Memory、Goals/反馈；控制栏/Inspector 按需展开 | `orchestration/agents-v3.js`、PlanDraft、Plan/Run workspace 与原业务组件 |
| Runtime | Route、Model、Connection、Generation、Retrieval、请求预览与实际用量 | `runtime-workspace.js`、`runtime-client.js`、原 Generation 服务 |
| 其他领域 | 设置、账户、扩展、搜索／Regex、语音、媒体、共享、备份与存储 | 原 workspace/client/service；共用导航和表现组件 |

已有客户端各自服务对应领域；组件复用不要求把保存操作合为一个通用 dispatcher。

## 提示词作者的完整流程

| 操作 | 实现结果 |
| --- | --- |
| 独立创建 | Library 从空白／模板创建 Program、Module、Generation，不建游戏 |
| 直接采用 | Studio 选择现成预设 exact 版本，按需 Fork/Derive |
| 编辑 | 共用 Draft 的字段、完整 JSON、Module 正文；Undo/Redo、错误定位、长文本与缓冲保留 |
| 编排 | Stage 与同 target 条目顺序；Module/Anchor 移动、继承与差异；使用 Host 的有效位置 |
| 三层预览 | Authored/Effective/Wire 与跨修订 Diff，实际来源与 Token 方法按需展开 |
| 样例试读 | 原 Host 新作者样例 Context；先预览，用户点击后才走 Compute/Provider 付费请求 |
| 分享升级 | 可编辑 exact 闭包、多修订映射、私人派生三方差异、手动选择消费者采用 |
| 可选反馈 | 原 Profile/Experience/Candidate 结果与局部建议；缺项仅影响对应操作 |
| 独立视觉 | 原 ImagePromptIR/Target/Rendering 与非 Session Job/Asset，独立图片管理 |

详细编辑、预览与发行语义只归[D8](../../refactor/atria-native-prompt-preset-deepening/preset-studio-experience.md)，顺序与 Context 装配归[D5](../../refactor/atria-native-prompt-preset-deepening/semantic-ir-lowering.md)。

## V3 页面接续

现有 V3 已有 Plan/Run 页面和 `/api/native/orchestration` namespace：

| 现有接口组 | 继续使用的能力 |
| --- | --- |
| `/plans/list`、`get`、`revisions`、`revision`、`validate`、`create`、`save`、`publish`、`fork`、`archive`、`delete` | 列表、Draft、修订、发布、复制／派生、归档／恢复及未发布草稿删除 |
| `/dependencies/inspect` | 原资源引用与当前内容身份 |
| `/bindings/get`、`save` | Session、Project/Task、RP 选择已发布 Plan |
| `/runs/list`、`observe`、`details`、`diagnostics`、`cancel`、`recover`、`reconcile` | Host 运行投影和控制 |
| `/tools/prepare`、`dispatch`、`observe`、`consume`；`/approvals/launch` | 原工具操作、结果与相应人工决定入口 |

上表为已挂载的 POST 路径，payload 沿现有 `orchestration/client.js`，不是所有 Source/Plan 组合均可执行的声明。Plan Fork/Derive、归档／恢复和未发布草稿删除均沿原 Plan 服务及命令 envelope；已发布 Plan 保留修订并使用归档。Node 独立 Program 可固定 Library／Project／Package exact refs，执行仍受当前原来源归属约束；按[D4](../../refactor/atria-native-prompt-preset-deepening/agent-behavior-binding.md)接通，不能只加表单。

## Prompt API 接续

- 现有 `POST /api/native/generation/preview/draft` 输入为 `{request,drafts:[{ref,expectedFingerprint,resource}],baselineDrafts?:[]}`；仅是现有 exact-base 资源覆盖。两侧不同根修订、新资源、样例 source 按原流程扩展。
- Preview 展示 `sent:false` 与三层结果；切换草稿后的旧回包不覆盖新稿。独立作者试读沿原 Host/Compute/Provider 返回真实用量。
- `GET /api/native/generation/quality-profiles` 返回实际维度与可用项；没有报告显示未评价。
- 新顺序与条目身份一起更新原保存、导出、Fork、Package freeze 和候选应用；前端大纲和 Host 结果一致。

## 共用交互

加载、空、失败、保存中、成功与冲突在原位置呈现；错误定位到对应对象或字段。保存成功而刷新失败时保留保存结果，只重新读取；切页保留编辑内容和返回位置。

桌面分栏、手机 List/Detail/Tab/Sheet 承载同一功能。图与拖拽有表单／上下移动替代；IME 不误发，软键盘上方可访问输入和 Stop，Back/Escape 每次处理一层并返回焦点。长文选区、滚动锚点、键盘与 reduced-motion 继续使用原组件机制。

旧 ST/Workspace/Director/Loop/Agenda 随原生替代清退。Memory、Goals、Experience、Skills、Visual Director 等有效业务迁到原生入口。按页面和直接依赖推进，实际完成结果记[原 Record](../../../records/refactor/atria-native-prompt-preset-deepening.md)。

## 本次前后端交接

最新断点与源码 HEAD 见 `HANDOFF.md`（仅在对应中断任务存在时读取），已交付与验证事实见原 Record。
前端需接入 `derive` 中的 `stage.configure`／`stage.move`，并补上游 Stage 消失／移动目标冲突；保持同一 Draft 与 Undo/Redo。Inspector 当前 Program 选择器仍只筛 Library，需根据当前原来源呈现 Project／Package 固定引用。

独立视觉沿 `POST /api/native/generation/authoring/images/prepare` 和原 `/illustration-images` 提交／观察／取消；列表与归档使用 `/authoring/images`。完整字段、资源读取和保留语义见源码 `docs/native-visual-generation.md`，无需创建 Session。普通试生成当前是 txt2img，Session Media Studio 的编辑／Mask／引用仍走原流程。
