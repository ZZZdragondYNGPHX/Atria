# 功能覆盖与界面扩展

本模块定义现有能力如何进入 Serene Canvas，以及下一轮 HTML 需要补齐哪些代表视图。已确认的取舍只见 [decisions.md](decisions.md)，视觉与控件规范只见 [visual.md](visual.md)，技术替代路径见 [migration.md](migration.md)，验收方法见 [validation.md](validation.md)。

## 1. 事实基线与阅读方式

- 源码核查基线：`main`，`9241325a7290e613e0fdaaa1870409105c161c89`（2026-10-14）。本模块以已核实的前端功能盘点为索引，以下源码引用提供可复核的事实入口；实施前以真实 Git 复核变化。
- 满意的视觉基线：[accepted-preview-v0.1.html](references/accepted-preview-v0.1.html)。它是独立演示，未连接产品服务、真实项目、会话、账户或模型请求。
- 当前讨论稿：[discussion-preview-v0.5.html](references/discussion-preview-v0.5.html)。§3/§4 沿用 Play/Library v0.4 并增加 Prompt/Persona，§7 增加 Settings；§6 保留 v0.3 Runtime/Agents 范围，其余领域仍以 v0.1 为盘点。演示流程不等于产品实现。
- [功能呈现文档](references/function-presentation.md)、[设计规范](references/frontend-guidelines.md)与桌面/移动参考均是设计输入，其与当前决定或源码的差异按 [decisions.md](decisions.md)处理。参考稿不包含某个按钮，不代表删除该用户任务；参考稿画出某个入口，也不证明产品已有该能力。
- **交互演示**：对应版本可操作的模拟流程。**代表布局**：已有视觉构图或部分表单/状态，没有完整流程。**入口示意**：仅菜单、描述、简单反馈或占位详情。**待展开**：没有具体界面。下列等级均不表示产品实现或验收完成。

## 2. 全局、登录与引导

| 区域 | 已有产品能力与语义 | v0.1 覆盖 | 下一轮 HTML 补齐 |
| --- | --- | --- | --- |
| Shell 导航 | 五域、Utilities、返回、当前层级、按内容显示 Inspector；Compact/Medium/Expanded | Dock、域切换与移动入口有交互演示 | 返回/层级、上下文动作、Inspector 开合与无内容状态；确认每个移动入口可发现 |
| 搜索与命令 | 页面/资源/命令搜索；来源异步失败、部分结果与重试；键盘选择 | 五域命令、过滤/无结果与关闭有交互演示 | 资源结果、来源/用途说明、载入与部分失败、键盘焦点往返 |
| 公告与全局反馈 | critical 模态、warning 条幅、info 徽标/收件箱；危险确认与成功/失败反馈 | toast 与少数 sheet 有交互演示；公告待展开 | 低干扰公告、关键确认、失败后继续工作的恢复路径 |
| 登录与账户选择 | 可配置多账户、handle/密码、OAuth、开放注册、恢复码 | 待展开；退出仅入口示意 | 独立登录页、账户选择、连接中/失败/重试；条件入口按实际部署显示 |
| Learning center | 恢复课程、章节切换、跳到真实功能、完成/跳过/重做 | 入口示意 | 首次使用引导与返回学习入口；接入 Runtime 和开始作品的真实路径 |

事实入口：`main:public/scripts/atria-shell/constants.js:1-45`、`environment.js:19-50`、`app-shell.js:161-366,631-838`、`workspace-host.js:60-113`、`public/scripts/announcements.js:120-332`、`public/login.html:39-75`、`public/scripts/atria-shell/learning-center.js:5-17,61-135`。

## 3. Play

| 页面/区域 | 已有产品能力与语义 | v0.4 讨论稿覆盖 | 剩余 HTML / 产品验证 |
| --- | --- | --- | --- |
| Play 首页 | 最近 Session/Work、Browse Library、导入存档；缺精确 Work 版本不能 Continue | 最近会话/作品与无会话示例；缺精确版本说明/修复；Dock 默认回阅读 | 真实持久化恢复、最近阅读位置与依赖回执 |
| 阅读与 Composer | 原生 Timeline、输入、Send/Stop、Jump to latest；可写/历史/终局/恢复状态 | 窄幅正文、输入草稿、流式/Stop；主动阅读不抢滚动、Jump；准备/缺配置/恢复失败/Ironman终局示例 | 真实运行与恢复合同、非Ironman终局差异、真实设备键盘/手势 |
| 会话工具 | History & saves、Context、Prompt choices、Save；More 包含健康、共享、Quick Save、Load、返回 | 分组工具、Save/Quick Save、重命名与条件禁用；健康/共享保留示意 | 真实存档与共享/健康完整流程 |
| 历史、分支与存档 | Inspect/Preview 精确修订只读；Switch Branch 恢复目标分支 HEAD；Load SavePoint 从保存修订创建新 derived Branch，旧分支 HEAD 保留；自动保存策略、重命名、导入导出 `.atriasave` | 分支/修订、只读Inspect/返回当前保留草稿、HEAD切换、Load依赖/确认/新分支、自动保存配置、预置导入/导出入口 | 实际文件/密码、自动保存调度与持久回执；全量分支数据 |
| Context / Prompt choices | 上下文纳入/排除摘要与详情；Prompt choices 归当前 Runtime Route、跨会话生效，保存覆盖/恢复作者默认；不属于历史修订或 Session 草稿 | 代表上下文来源、共享Route选项/默认反馈与权限说明 | 未生成、完整来源/排除原因、真实参数合同与费用 |
| Persona | 会话内搜索/选择或无 Persona；不可写时禁止切换 | v0.5 接入 Library 精确身份与新会话默认捕获；既有状态身份保留，管理备注不进快照 | 实际精确资源绑定、生成上下文与权限合同 |
| 作品专属 UI | component/hybrid/full 可复用组件或接管 Stage，Host 保留恢复能力 | 默认阅读视图有演示；接管待展开 | 一处作品自定义呈现，覆盖 Exit/Stop/Save/Persona/Diagnostics/Reload 可达性 |

事实入口：`main:public/scripts/native/play-product.js:86-178,276-480`、`play-controls.js:192-305,331-561`、`session-history.js:46-173`、`persona-ui.js:21-150,198-265`、`prompt-runtime-controls.js:6-87`、`experience/ui/full-host.js:49-145`。

## 4. Library

| 页面/区域 | 已有产品能力与语义 | v0.5 讨论稿覆盖（作品/World/Knowledge 沿用 v0.4） | 剩余 HTML / 产品验证 |
| --- | --- | --- | --- |
| Works / My Games | 搜索、版本/可用性、安装更新 `.atria`、继续 Session；管理导出/重命名/删除 | 原封面/画廊与搜索保留；安装权限示例预检、存档独立预检、删除依赖阻碍 | 真实包/存档/密码、导出/重命名与卸载回执 |
| Work 详情 | 选择起点/会话标题、Start New/Continue、精确版本、World/Knowledge 绑定与用途缺项修复 | 起点/标题、精确版本/依赖、固定Session联动；旧版缺失禁Continue而新故事可用当前版；Runtime缺项禁生成 | 实际安装/修复后返回、真实会话与资源服务 |
| Worlds & Knowledge | 导入/导出、Library 可编辑副本、Package World 原件只读；当前安装版本的 Package Knowledge 有既存编辑路径；不可变修订与精确绑定 | Package World只读→独立World/Knowledge副本；Library新修订/历史/引用；World Source草稿/校验/未知字段保留，删除阻碍 | Package Knowledge原件编辑、实际导入导出与合同/引用查询 |
| Knowledge 条目 | 添加/编辑/启停/删除条目、绑定与来源 | Library条目编辑/启停→草稿→审查→新修订，保留来源metadata与旧引用 | 添加/删除条目、全量搜索/来源定位及实际保存 |
| Prompt Presets | Preset拥有Program/Modules/Generation/Regex；结构化/Source与精确修订。Preset内模块修改/移除会维护当前Program引用；独立Library Module删除按Used By阻碍，旧闭包保持 | Preset 分组、Program阶段/模块引用、Module/Generation代表表单、完整Source、草稿校验/审查/发布；新资源/复制、只读历史、Used By阻碍、Regex代表规则；Module更新当前闭包，旧Route不漂移；过期草稿提示/确认重载 | Preset分类删除/模块移除、Regex全字段、多规则排序、文件导入导出；完整合同/编译与真实持久化 |
| Personas | 新建/另存修订/复制/归档与恢复、设置或清空精确默认；简介允许空，管理备注不进生成；旧默认/Session不随新head漂移，归档不删快照 | 新建/编辑/复制、精确历史/另存、默认/清空、归档/恢复、Used By与永久删除阻碍；名字/UTF-8限额、取消保留草稿、旧默认/会话与最新Library修订分离 | 头像真实上传/移除回执、服务CAS/引用查询、刷新后持久恢复与实际生成上下文 |

事实入口：`main:public/scripts/atria-shell/library-runtime-workspaces.js:23-29,79-122`、`public/scripts/native/library-workspaces.js:40-428`、`prompt-presets.js:192-305`、`prompt-authoring.js:167-320`、`persona-ui.js:21-150`。

v0.4 复核：Package Knowledge 的当前安装版本编辑分支见 `main:public/scripts/native/package-library-resources.js` 中 `editPackageKnowledge` 调用；不能因视觉稿的「只读原件」概括删掉此路径。本次代表原型重点是 Package World 与 Library Knowledge，Package Knowledge 特例仍需完整界面验证。

v0.5 复核：Persona 内容采用严格合同，不加入任意 Source 键；历史可作为另存新修订的编辑来源，保存仍由当前 root CAS 决定。默认保存精确 ref，归档默认影响未来默认捕获的可用性而不改已有 Session。事实入口：`main:public/scripts/native/persona-ui.js:35-133`、`main:src/native/persona-contract.js`。Installed Work Prompt 原件按精确 Package Program/Generation 呈现；演示集合不代表新增 Package Preset 管理 API。

## 5. Build / Atria Studio

| 页面/区域 | 已有产品能力与语义 | v0.1 覆盖 | 下一轮 HTML 补齐 |
| --- | --- | --- | --- |
| 项目首页 | 新建、搜索/打开、删除与依赖处理 | 直接进入项目，首页待展开 | 项目入口、无项目/无匹配、载入失败与重试 |
| 资源树与编辑器 | 20 个视图：Overview、Experience、Prompt Authoring、Runtime Design、Actors、EntryPoints、Worlds、Knowledge、Game Logic、UI、Assets、Memory、Agents、Skills、Plugins、Metadata、Simulation、Preview、Build、Source | 三纸、分组/搜索、Prompt 分区、结构化/Source、移动五面板有交互演示；其它资源多为入口示意 | 以 Actors/EntryPoints 与 UI/Assets 各展示一处真实结构化任务；不要求把所有资源同时放在画面上 |
| 编辑与 ChangeSet | 编辑形成草稿；Review → inspect Workspace → Apply → Validate → resultingRevision；冲突/回滚/保存后刷新失败 | 草稿、校验、diff 与演示 Apply 有交互演示；Source 模式保留未知字段 | 引用/修订冲突、保留/复制草稿、取消审查、验证失败与保存后刷新失败 |
| Project Agent | Intent → Plan → Workspace/Operations → ChangeSet → Validate/Preview/Simulation → Review → 人显式 Commit | 任务/取消、提议与演示 Review & Commit 有交互演示 | Task 状态、计划、操作与证据；冲突/中断恢复，区分 AI 文字与权威修改状态 |
| Preview / Simulation / Build | 预览精确项目修订；仿真、Preflight、生成 `.atria`；活动 Problems/Output/History/Changes | 预览、四类活动、折叠与切换有交互演示；构建仅入口示意 | 校验问题定位、仿真/构建结果、失败后返回资源、关闭预览 |

事实入口：`main:public/scripts/native/studio-workspace.js:38-67,215-262,697-857,1229-1515`、`studio-agent.js:98-114,413-521,579-598`、`main:src/native/authoring/studio-service.js:922-990`、`main:src/native/project-agent.js:1207-1248`。

## 6. Agents 与 Runtime

| 页面/区域 | 已有产品能力与语义 | v0.3 讨论稿覆盖 | 剩余 HTML / 产品验证 |
| --- | --- | --- | --- |
| Agents Orchestration | Loop/Spec/Agenda/Director/Single Agent、模板/复制、编辑/Save/Validate、工具权限、图/Source、范围绑定 | 内置只读→复制编辑→空名校验→确认提交；模式/权限与 Session/Default 范围；Source 只读示意 | 各模式完整定义编辑、真实合同校验/保存；Native 无角色卡绑定时 Character 禁用，不新增 Work binding |
| Agents Run | Graph/Timeline、节点 Inspector、指标/工具/记忆证据、Stop Run | Timeline 默认、Graph 两端可达；事件纸/Sheet；运行中、停止中、已停止、失败、无运行示例 | 真实事件与工具证据、停止完成/失败；无独立 Start/Pause/Resume |
| Agents Memory | Overview/Knowledge/Sources/Maintenance；开关、来源、检索、重建/Reset current chat memory | 五开关、知识搜索/分类、来源引用、维护入口、RESET 确认；当前 Session 范围 | 真实维护任务/进度/失败与来源跳转 |
| Agent Diagnostics | 健康/检查点/上下文 Token/事件；Export Trace/Import replay/Return to live | 上下文/健康/检查点状态，Trace 入口与预置只读 replay；返回原 live 状态 | 真实元数据 JSONL 文件导入导出；检查点仅显示，不增加恢复动作 |
| Runtime 就绪引导 | 依实际用途检查 Connection/Model/精确 Prompt/Generation/Route；部分 adapter 允许免认证 | 空/部分/就绪状态；下一缺项进入完整编辑，完成编译可返回作品 | 各用途缺项/歧义、跨 Library 修复与原任务恢复；真实 readiness 的认证过滤修正 |
| Connections | Provider/Endpoint/Secret、测试；MCP/A2A 与图片服务同属此区；认证按 adapter | 服务分支与完整 Endpoint、Secret 演示引用、测试/取消/失败/保存；改输入使进行中结果失效 | 真实连接/Secret 服务与各 adapter 合同、删除依赖保护 |
| Models | Connection、模型 ID、Fetch models、发现元数据、限额与能力覆盖 | 发现→选择→确认元数据→保存；失败/取消/手填；更改 ID 清除旧发现数据 | 真实 provider discovery、显式覆盖来源与能力冲突 |
| Routes | 用途/角色、Model 与精确 Prompt/Generation、fallback 顺序、重试/超时/额度、Source | 用途、精确资源、同角色 fallback/排序、策略与额度、Source 编辑 | 删除引用阻碍、真实引用缺失/冲突、服务校验 |
| Retrieval | 创建检索资源/新修订、Embedding/Rerank 配置与 Source；旧绑定不自动切换 | 创建/新修订、Embedding/Rerank 与 Source；旧演示修订保留，新项可再次打开 | 真实修订与 Memory 绑定；不补画此页尚未有的测试、测速、删除操作 |
| Runtime Diagnostics | 精确 Route + 项目/Session 上下文、Compile preview、Prompt choices、请求证据；预览不发送请求 | Route/上下文选择、编译/取消/失败、精确引用和请求元数据、费用未知状态 | 实际编译合同、来源定位、上下文过期与刷新恢复 |

事实入口：`main:public/scripts/agents/orchestrator/workspace/shell.js:3-114`、`orchestration/page.js:497-713`、`panel.js:181-280,336-391`、`memory/page.js:5-10,75-110,253-487`、`diagnostics/page.js:37-184`；`main:public/scripts/native/runtime-readiness.js:2-19`、`runtime-workspace.js:128-162,231-549,608-713`。

### Runtime 参考差异与 v0.2 纠正

v0.1 的 `OpenAI compatible + localhost:1234/v1 + 无需认证` 是说明性示意，不是基线产品支持的组合。当前 UI 要求 OpenAI-compatible 使用完整 `/v1/chat/completions` URL，并要求 Secret；MCP/A2A、ComfyUI、SD WebUI、Forge 等 adapter 可选择无认证。v0.2 已将该示例改为完整 `/v1/chat/completions` 与 Stored Secret 引用，并移除 OpenAI 默认免认证表述；v0.1 原样保留作为已接受的视觉基线。后续展开按真实服务分支呈现。当前 `runtimeReadiness` 将所有 Connection 按 Secret 存在性过滤，仍需依据真实用途与 adapter 纠正，避免免认证服务被错误判为未就绪。

事实入口：`main:public/scripts/native/runtime-workspace.js:259-266`、`runtime-readiness.js:3-18`、`retrieval-workspace.js:14-75`。独立 Secret 轮换/删除页面目前不是可见产品能力，不能作为现有功能补画。Run 不增加独立 Start/Pause/Resume，Trace replay 保持只读；检查点只呈现已有状态与版本，不增加一键恢复动作。

## 7. 全局工具与条件能力

| 区域 | 已有产品能力与语义 | 当前讨论稿覆盖（Settings 为 v0.5，其余沿前版） | 剩余 HTML / 产品验证 |
| --- | --- | --- | --- |
| Settings | Appearance/Language/Interface/Accessibility；主题、字号、输入/滚动、减动；高级颜色/Custom CSS 与主题导入导出 | 独立分组工作纸、字号/阅读样例、语言样例、输入/滚动与离开确认样例、系统/手动减动、减少模糊；字号/Enter/跟随同步Play；设置即时演示并保留返回原场景 | 全部真实偏好/持久保存，语言刷新、旧主题数据/导入/导出和高级颜色/Custom CSS兼容流程；仍仅浅色设计 |
| Account | 身份/头像/名称/密码、Settings snapshot、Backup/Storage、Danger Zone；现新页缺可见 Logout | Account 菜单与退出入口示意，非真实登录退出 | Profile、多账户退出/返回选择、存储、明确的重置确认 |
| Backup & sync | 手动 ZIP 归档、预检、合并/覆盖/恢复、取消回退/恢复点、LAN；旧备份与快照清理策略 | 入口示意 | 一次导入预检→选择→确认，失败/取消与恢复；云 Provider 仅占位 |
| Extensions | Skills 安装/导入/编辑、scope；Plugins 安装/启停/代码/配置，Package 原件只读 | 入口示意 | Skills/Plugins 分类、详情、scope、官方设置与草稿保护 |
| 全局 Diagnostics | Guided/Startup/Expert、报告/事件、刷新/重试，进阶日志与权限 | 入口示意 | 引导排错、报告、无日志/无权限、重试与恢复入口 |
| 插图生成 | 官方插件默认关闭；启用且 Work 支持后，Play 插图工具可标注选文/生成/取消/采用或隐藏版本 | 待展开 | 一处已启用的条件工具与生成状态；图片服务配置仍归 Runtime |
| Gallery / Visual Director / Media Studio | 插图流程子界面；版本比较/采用、镜头审查、遮罩/Img2Img/Inpaint/Upscale/预览批准 | 待展开 | 插图子流程中一处候选比较、一处编辑/批准；不增加新一级域 |
| Shared session | Work 声明共享规则后，Host/参与者、Session ID/seat、连接/轮次与共享输入 | More 中入口示意 | 条件启用、ID/seat 连接、Host 控制与断连；不暗示已存在邀请链接 |
| 消息朗读 | 声明 narration expression 的 assistant 消息才挂载声线、准备、播放/停止 | 待展开 | 一条符合条件的消息、声线选择、准备/失败/停止；不扩成全局语音聊天 |

事实入口：`main:public/scripts/atria-shell/utility-workspaces.js:102-334`、`public/scripts/templates/userProfile.html:1-40`、`public/scripts/user.js:589-627`、`public/scripts/backup-sync-center.js:630-1007`、`public/scripts/native/extensions-workspace.js:23-192`、`public/scripts/logging/workspace.js:117-314`、`public/scripts/native/official-illustration.js:68-300`、`visual-gallery-ui.js:5-32`、`visual-director-ui.js:4-25`、`media-studio-ui.js:7-87`、`shared-session-ui.js:21-134`、`speech-controls.js:8-72`。

Settings 沿用既存事件和即时应用/防抖保存，不新建统一 Apply 流程。原界面无独立字体 family 选择器；字号范围为0.5–1.5，滑条释放后应用。Enter行为保留AUTO/DISABLED/ENABLED及Ctrl/Cmd、Shift/Alt和IME边界。原生化仍连接现有偏好权威；初稿的语言回执和输入/离开样例是审阅设施。具体事实见 `main:public/scripts/atria-shell/utility-workspaces.js:219-223` 与 `power-user.js`。

## 8. 全流程状态覆盖

状态是用户任务的一部分，不要求把所有组合铺成独立首页。下一稿用可切换的演示数据呈现主要差异，产品验收以 [validation.md](validation.md)为准。

| 维度 | 必须呈现的状态/操作 | v0.1 实际范围与剩余工作 |
| --- | --- | --- |
| 控件 | hover、focus、pressed、disabled、loading、success、error | 已有按钮反馈、焦点、禁用、输入错误、部分演示成功；完整加载/错误状态需按真实控件扩展 |
| 数据 | 首次使用、空列表、无结果、载入、部分结果、失败/重试 | 有 Library/资源搜索无结果；服务加载/部分失败、首次使用待展开 |
| 权限/依赖 | 未登录、无权限、精确版本缺失、Secret/Model/Route 缺项、被引用、Package 只读 | 除少数说明外待展开；解释原因并提供修复去向 |
| 编辑安全 | 未应用草稿、模式切换无数据丢失、离开确认、Review/取消/Apply、冲突、回滚/刷新失败 | Studio 有草稿/Source/Review 演示；离开/冲突/回滚/刷新失败待展开 |
| Play 生命周期 | 准备、生成、停止中、只读历史、故事结束、恢复失败；取消后再发送 | 有模拟生成/取消；真实生命周期差异和恢复待展开 |
| 重复/中断 | 快速点击、二次提交防护、连续开关、取消后重试、异步结果过期 | 有部分模拟防护与可中断 Sheet；资源/Route/Task 全流程待展开 |
| 输入方式 | 鼠标/触摸/键盘、中文 IME、长文本、焦点归还、键盘导航 | 有代表性键盘/触屏演示；专业列表/树/Inspector/组合面板需扩展 |
| 布局/辅助功能 | 三类视口、横竖屏、大字、safe-area、软键盘、reduced-motion | v0.1 有桌面/中宽/移动重排与减动；新增视图逐项纳入 |
| 扩展/作品呈现 | 注入区为空/不可用/失败/自有视觉，Stage 接管与 Host 恢复 | 待展开，完整范围依 [migration.md](migration.md)中的兼容替代契约 |

## 9. 下一轮 HTML 的展开顺序

v0.3 已展开 Runtime/Agents，v0.4 已展开 Play/Library 日常代表路径。当前 v0.5 按 §4/§7 展开 Prompt、Persona 和浅色设置页；各讨论稿仍等待反馈，不自动替换已接受视觉基线。下面是其余后续视图的建议顺序。

建议按能验证视觉系统承载复杂度的代表任务展开，而非一口气增加全部占位页面：

1. 按反馈调整v0.4/v0.5 Play/Library；继续Package Knowledge原件编辑与Prompt剩余专业流程。
2. Runtime 的复杂依赖修复、删除阻碍和原任务返回；v0.3 已有的配置主路径按反馈调整。
3. Studio 非 Prompt 资源编辑、ChangeSet 冲突/验证失败；Agents 各编排模式的完整编辑与维护任务细节，沿 v0.3 四页继续完善。
4. 登录/引导、Account/Backup/Extensions/Diagnostics；Settings剩余高级兼容流程；一处作品接管与一处条件媒体流程。

此顺序是设计工作建议，不是冻结实施阶段。旧控件、潜在新能力、已确认边界与用户待讨论取舍只归 [decisions.md](decisions.md)，不由旧 DOM 或参考稿自动推导。
