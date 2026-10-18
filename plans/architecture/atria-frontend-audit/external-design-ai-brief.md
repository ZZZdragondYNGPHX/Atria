# 给外部前端设计 AI 的 Atria 资料与委托

请依据本目录的产品功能盘点，制作**视觉与交互方案讨论输入**。当前不开发 Atria，不改源码，不发布站点，不替用户冻结最终设计。用户会把你的 HTML 和两份文档带回，与开发 AI 多轮讨论后再决定正式前端重构企划。

## 先理解产品

Atria 是原生交互叙事／角色扮演与作品创作平台。玩家安装 Work、选择入口、以 Persona 参与故事，阅读和输入、运行模型、存读档和分支；作者管理 World/Knowledge/Actor/Prompt/Assets/Skills/作品前端，借助可选 Project Agent 准备变更，经人类 Review 后构建作品。高阶用户还管理 Runtime、Memory、Agent 行为、插件、图像/语音、共享会话、备份、恢复和诊断。

它同时需要舒适的长篇阅读、完整的创作表达、复杂数据的可发现性，以及可信的版本/权限/审批/恢复。合法成年虚构 RP 的文体、角色表现、强作者指令和创作自由是产品目标；创作文本并不授予工具、Secret、World 写入或费用权限。

| 用户 | 高频目标 | 代表性工作 |
| --- | --- | --- |
| 玩家／读者 | 进入故事、读写、停止和恢复 | Work → Session → Persona/Composer → History/Save；有条件的共享、朗读、插图 |
| 作者 | 创作资源并交付作品 | Project tree → fields/Source → Review/Apply → Preview/Simulation → Build → Library 安装 |
| 高阶操作者 | 模型/记忆/Agent/扩展与故障管理 | Secret destination/Connection/Model/Route/Prompt；Memory provenance/corrections；Goal/Eval；Storage/Diagnostics |

当前导航是 Play、Library、Studio（内部 `build`）、Agents、Runtime，utility 包含 Learning、Extensions、Settings、Account、Diagnostics、Command。这是现状而非你必须复刻的美术或布局模板。你可以提出信息架构调整，但要给出所有原能力的新位置，并将实质产品变更单列为提案，等待用户决定。

## 应提供给你的材料

1. [index](index.md)：基线、状态词、材料路由和授权边界。
2. 四份功能清单：[Shell/Library/Play](surface-inventory.md)、[Studio/Prompt/Runtime](authoring-runtime-inventory.md)、[Agents/Memory/扩展/媒体](agents-extensions-media-inventory.md)、[Settings/账户/Storage/Diagnostics](settings-storage-diagnostics-inventory.md)。**所有功能 ID 都须在你的完整交互文档中映射。**
3. [interaction-flows](interaction-flows.md)：端到端流程、状态、审批和恢复。
4. [component-and-architecture-findings](component-and-architecture-findings.md) 与 [cross-platform](cross-platform.md)：架构问题、复用、清退与三端需求。
5. 没有代码访问条件时，以功能正文为输入，不要自行猜测缺失实现。

请保持已实现／部分／设计／旧待清退／UNKNOWN 的区分；不要把你的 mockup 或任意后端 class 当作产品已完成。

## 请交付三项成果

### 1. 精致的 HTML 视觉参考文件

建议文件名 `atria-visual-direction.html`，可以直接浏览器打开。你决定审美方向：配色、字体、视觉主题、材质、图标、造型、留白、密度、动效和布局。本资料**没有预先批准这些答案**。

选择少量最能体现整体方向的代表场景，形成连贯、精致、可交互的样例；例如故事阅读/Composer、Library 作品与资源、一个作者工作台或专业审查场景。场景选择由你解释，不要求把所有产品功能塞进 HTML。

应能说明桌面与手机的设计思路，展示核心控件和关键状态；允许适量本地 JS 演示。不要为展示审美而真实发模型请求、外发数据、要求用户 API key、连接第三方服务、操作真实账户或执行危险功能。

### 2. 完整功能的界面与交互表现文档

建议文件名 `atria-function-presentation.md`。这份文档承担**全功能覆盖**，不受 HTML 页面数量限制。

至少包括：

- 页面树、导航/搜索/深链/返回关系，以及每个功能 ID 的展示位置和发现路径。
- 每项按钮、输入、菜单、弹窗、Sheet、Inspector、toolbar、shortcut 如何使用，触发条件、权限、数据来源和保存范围。
- 玩家从安装到故事与存档；作者从编辑到 Review/Build；模型/Prompt 配置；Memory/Skills/插件/媒体；账户备份/清理/诊断的完整链。
- 手机、桌面如何取得同等编辑/审查/审批能力，长文本、软键盘、Android Back、键盘/IME、无障碍与长列表的表现。
- 入口整合、改名、搬迁的映射；任何建议删除应指明正式产品依据，不能用“样稿没画”“使用频率低”删除能力。

请采用类似映射表：

| 审计功能 ID | 当前能力/实现状态 | 建议页面/入口/控件 | 状态/权限/恢复 | 桌面/手机 | HTML 展示或仅文档 | 新提案/待确认 |
| --- | --- | --- | --- | --- | --- | --- |
| 从清单逐项填入 | 保持静态/部分/设计区分 | 明确到用户可找到的位置 | 不写万能错误和撤销 | 写替代操作路径 | 允许仅文档 | 不偷换成已批准 |

### 3. 整体前端设计指导文档

建议文件名 `atria-frontend-guidelines.md`。请提出统一的视觉语言、页面布局、组件体系、表单与数据密度、响应式、中文/英文、主题/自定义、动效/减动与设计一致性规则，作为将来讨论和实现的输入。

请说明怎样让沉浸式 Play 与专业编辑/维护互相协调，怎样容纳 Work 自定义 UI、插件与错误恢复，怎样避免手机仅能查看而无法操作。可提供 token/组件示例和设计理由；这些仍是建议，最终用户确认后才成为正式实施依据。

## 必须保留的能力与技术约束

| 约束 | 设计含义 |
| --- | --- |
| **完整功能清单和正式产品合同优先，HTML 只是代表性样例** | 某项只出现在文档中仍要实现；样稿遗漏不构成删除授权；不得反过来用参考 HTML 定义产品范围 |
| 原生单权威 | World/Memory/Cognition/Session/Project/Runtime/Host 各有原服务；界面不能创造第二 writer、授权库、预算或候选发布系统 |
| immutable revisions/exact refs/CAS/receipt | 能分辨原件/副本、草稿/正式、当前/历史、来源/引用；保存冲突不吞稿；成功后刷新失败不重复提交 |
| D8 三域协作 | Library 管资源，Studio 管创作与 review，Play 管获准的运行选项；不要强迫普通 RP 学 Graph，也不把所有 Prompt 合并成一个万能页 |
| 原文表达与可信预览 | 作者自由文本不能被表单静默改写；Authored/Effective/Wire 有不同语义和权限；未发布 Prompt Draft Preview 当前 BLOCKED，不能借 execute 绕过 |
| V3 单 Native Host | 新 Graph/Node/Run/Effect/Approval/Result 是正式目标，当前新 UI 未完成；Browser 是编辑草稿和投影，不是执行/费用/世界状态主机 |
| Source/Audience/Actor/Branch/Grant | Inspector 仅显示合法受众的来源；检索/模型 Judge/角色信念不等于 World Truth；|
| 原生创作和演化 | Memory、Goals、Experience、Eval、Skills、Visual Director 等有效能力不能随旧 Workspace 容器误删；`source_unready` 不得画成通过 |
| 零旧 ST／Workspace 兼容 | 不复活旧 preset depth/order、旧 mode picker、旧 Agent Director/Loop/Agenda/Workspace/checkpoint/migration/shim/双轨；按真实消费链硬切，保留仍有效 Atria 原生功能 |
| 作者作品表现自由 | Work 可以增补 surface 或在 full/hybrid 接管 Stage，仍需 Host escape/Stop/Save/Persona/Diagnostics/Reload；不能用统一壳吞掉作品能力 |
| 扩展信任分层 | trusted frontend JS 与 Work sandbox、MCP/A2A、Secret destination、visual transfer/cost consent 各自不同；不能用一个泛化“允许”代替 |
| Windows/CachyOS/Android Termux 功能等价 | 不要求同布局，要求同等完整操作；Termux browser 与 APK 分开；不要承诺 OS 后台不杀进程或现成云同步 |
| 当前技术事实 | 当前前端主要为原生 ES modules/DOM/CSS 与既有 jQuery/模板，Node Host/HTTP/流式事件/Host Bridge；不是已存在的 React 组件库。后续技术换栈需另行讨论，不由视觉稿强行决定 |

## 建议在说明文档中走通的代表任务

- 新用户安装作品，发现缺 Route，配置模型和精确 Prompt 后回到原故事启动流程。
- 玩家阅读长篇、软键盘输入、停止生成、切 Persona、存档、查看历史并明确切分支。
- 作者从 Library exact resource fork/attach 到 Project，结构化/Source 修改，处理冲突，再 Review/Apply/Preview/Build。
- 插图从选文到 annotation/prompt/image approval，再到 Gallery/Mask edit，明确费用、外发和取消终态。
- 用户处理资源被引用、清理 partial/interrupted、回收站 identity restore、备份网络中断和 Diagnostics。

这些是帮助展示复杂性的任务，不是新增固定样本数或审批规则。最终请说明：HTML 展示范围、仅文档覆盖的能力、关键设计理由、对现状问题的处理，以及所有需要用户决定的新提案。用户未确认前，不将任何审美、布局或新产品能力标为冻结。
