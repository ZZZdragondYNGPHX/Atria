# Existing capability inventory — baseline snapshot

本文件保存原任务的 S00–S19 源码能力清单（2026-10-04）。功能采样基线 `main @ 8cb5be336`，语言清理后核对基线 `main @ 783bb6fd3`。它定义旧能力/字段保留范围；其中的建议布局、手机底栏与“未批准”讨论结论由本 Bundle 的 decisions/experience 覆盖，不是第二份导航 authority。新增 S20 由 personas.md 定义。

原清单保持原文以便逐动作核对；“源码存在”不代表已经实测。实施前按最新源码重验当前挂载能力，不能恢复 legacy 平行主入口或仅删除隐藏 DOM。原型证据和实际验证状态进入 Record。

---
ATRIA 页面、按钮与状态清单
功能基线：main @ 8cb5be336；语言清理后 main @ 783bb6fd3；2026-10-04。
已确认语言范围：仅 English / 简体中文。
依据当前正式挂载路径、关键实现、UI 辅助模块和现有测试入口整理。
“现有操作”代表源码中的能力或入口，并不意味着它们同时出现、在任意环境可用，或已完成浏览器实测。
“建议层级”是供讨论的信息整理，不是批准删除功能。

层级定义
P0：完成该页面核心任务必需，通常直接可见。
P1：常用辅助动作，工具栏、详情或明确的次级入口。
P2：高级、低频或条件性动作，折叠/更多/专用页面。
危险动作：单独处理，不靠降低视觉显著度代替确认和后果说明。
P0/P1/P2 是呈现建议，不是研发优先级或缺陷等级。

全局对象词典
Work：已安装作品及其版本。Session：该作品上的一次游玩与进度。
SavePoint：可恢复的进度点。.atriasave：可导入导出的存档文件。
Project：创作源项目。Revision：不可变版本。Branch：会话历史分支。
World：世界与共享设定/状态。Knowledge：知识库及条目。
Prompt Preset：拥有提示词程序、模块、生成配置和正则规则的预设集合。
Connection：提供商地址与密钥引用。Model：模型档案及能力。
Runtime Route：将模型与确切提示词/生成配置等组成可执行路线。
Task Binding：把作品要求的模型用途绑定到合适路线。
Skill / Plugin：不同类型扩展，统一入口、分别管理。

S00 全局外壳与搜索
现有页面：五大域；全局菜单；搜索/命令弹层；检查器；手机上下文面板。
现有操作：Play / Library / Build / Agents / Runtime；返回；搜索；账户与设置菜单；打开/关闭检查器；关闭命令面板；执行搜索结果；搜索部分失败时重试并查看覆盖范围。
全局工具：学习中心、命令、诊断、扩展、设置、账户。
P0：当前任务标题、主导航与返回。P1：搜索和上下文入口。P2：低频全局工具可集中到菜单。
状态：当前导航项、子页面、加载/挂载失败、空搜索、部分结果不可用、遮罩与焦点、键盘选择结果。
布局：桌面侧栏＋主区＋可选检查器；中屏图标栏＋主区；手机主区＋底部导航，检查器用 sheet。
代码：public/scripts/atria-shell/constants.js、app-shell.js、navigation-authority.js、back-resolver.js、workspace-host.js、product-search.js。

S01 登录、首次进入与启动
现有页面：启动等待/超时重载；选账号；用户名/密码登录；条件性注册；恢复密码；条件性 OAuth；学习中心。
现有操作：重试、登录、忘记密码、创建账户、注册返回、重置密码；按服务器配置显示 GitHub/Discord 登录。
学习：继续学习、选择课程、上一课/下一课、跳过、重新开始当前课、全部课程、收起/展开、关闭、返回课程对应界面。
状态：连接中、无可用账号、输入错误、认证失败、恢复码、密码确认、功能未开放。
建议：学习可跳过、可重入；先帮助用户完成一次真实游玩，不把所有高级编辑器塞进首次引导。
代码：public/login.html；public/scripts/atria-entry-startup.js；atria-shell/learning-center.js；scripts/templates/welcome.html。

S02 游玩首页
现有内容：继续最近最多 5 个会话、最近最多 5 个作品、浏览资料库、导入存档。
P0：继续、浏览资料库。P1：打开作品、导入存档。
条件：缺失匹配作品时不能继续，需要指向恢复路径。
状态：没有会话、没有作品、加载失败、查找中、依赖缺失。
代码：native/play-controls.js 的 renderLanding。

S03 游玩正文与输入区
现有内容：会话标题、作品名/版本、Live/History/Recovery 状态、角色与叙述正文、结构化消息块、临时流式文本、插图挂载区、输入区。
P0：输入、发送；生成中变为停止。P1：跳到最新、会话工具。
现有规则：Enter 换行；Ctrl/Cmd+Enter 发送；中文输入法组词时不发送；生成中输入禁用；历史与失败会话不可写。
状态：尚无消息、正在生成、失败需重载、历史只读、回到当前故事、运行配置错误并跳至对应设置。
建议：正文为视觉主角；不要把模型内部状态、所有工具按钮铺满每条消息。
代码：native/play-product.js；native/frontend/conversation.js；native/play-generation.js；native/generation-client.js。

S04 会话操作、时间线与存档
当前可见工具：Timeline、Context、Prompt choices、Save、More。
More 内：体验健康、共享会话、重试回复、重新输入回合、从此处重开、快速保存、读取。
时间线与存档：读取某存档、导出某存档；逐条“从此处重开”；适用用户回合“重新输入”；嵌入知识提升入口；修订与分支浏览。
历史浏览：刷新、全部/当前分支、探索分支、翻页、预览/检查修订；回复变体上一条/下一条；按挂载方提供的能力显示切换分支、重试、从修订分叉。
重要：当前 Play 时间线的 mountSessionHistory 主要传入 onInspect；不要把辅助模块存在的全部回调认定为该面板中全部常驻按钮。
P0：保存入口、读取入口可发现。P1：历史与重试。P2：上下文详情、分支细节、体验健康。
状态：不能写历史、生成中不能修改进度、无可重试回复、没有适合重新输入的用户回合、空存档、修订不完整、操作失败与重试。
建议：可以把多个通往同一时间线的入口合并，但保留各操作的明确语义。
代码：native/play-controls.js；session-history.js；reply-variants.js；session-runtime.js；session-lifecycle.js。

S05 存档导入与依赖恢复
现有操作：选择 .atriasave、检查、输入存档密码、导入并打开；重查已安装依赖、检查现有作品、选择匹配作品、安装匹配作品。
状态：正确依赖、缺失确切版本、错误文件/密码、冲突、安装检查中。
已有冲突文案要求用独立账户保留两份冲突数据；不得画一个并不存在的“自动合并存档”按钮。
代码：native/save-dependency-recovery.js；play-controls.js；library-workspaces.js。

S06 作品库与作品详情
现有页面：Works 集合；作品详情；作品的会话列表和版本信息。
P0：打开作品、继续、选择入口后 Start New；安装/更新 .atria。
P1：导入存档、配置世界与知识、查看作品描述与版本、查看已有会话。
P2：能力与确切依赖详情、从指定版本开始并审阅、查看依赖会话、管理作品。
会话管理：改名、名称冲突时重新载入当前名称、配置资源、导出 .atriasave、删除会话。
作品管理：删除作品，必须呈现依赖影响；不要与删除某次游玩混淆。
安装：选文件—预检查—权限/版本审阅—确认安装/更新—结果。
开始：选择可游玩入口—检查模型用途—配置缺项—创建会话。
状态：列表空、安装中、无效包、权限声明、无法开始、旧版本、依赖缺失。
代码：native/library-workspaces.js；session-naming.js；package-permissions.js；task-binding-ui.js。

S07 世界与知识资源
现有页面：Worlds / Knowledge；独立 Library 资源；作品携带的原始资源；资源详情与版本。
P0：打开、创建世界/知识库、知识条目搜索/浏览。
P1：新增条目、编辑知识、创建新修订、查看历史与引用、导入/导出资源包。
P2：改名、删除、生成可编辑副本、Fork、查看确切来源、包资源原始版本。
边界：不是所有“原始资源”编辑规则相同。package-library-resources.js 对世界显示只读来源，对知识提供编辑原始知识的独立路径；请显示对象实际允许的动作，不能统一画成全都只读或全都随意编辑。
资源包：选文件—预检查—冲突与闭包详情—导入—打开导入资源。
知识编辑字段：标题、内容、启用；发现关键词/别名/正则；适用范围和状态条件；概率/持续/冷却/延迟；关系；插入位置/优先级/目标；预算等级和压缩内容；源 JSON。
现有操作：条目新增/删除/上下移动、返回列表、字段/源码切换、Review Changes。
世界编辑：字段/源码切换、添加/删除字段、引用选择、移除失效引用、审阅变更。
状态：无资源/条目、无搜索结果、草稿修改、只读或可编辑、被引用无法删除、过期修订冲突、缺失引用。
代码：native/library-workspaces.js；package-library-resources.js；knowledge-entry-browser.js；knowledge-editor.js；world-editor.js；library-revision-editor.js；library-revision-history.js；resource-bundle-controls.js；reference-remediation.js。

S08 提示词预设与运行时选择
现有页面：预设列表；预设详情；Prompt Programs / Prompt Modules / Generation Profiles / Preset Regex。
P0：创建/打开预设、编辑并保存。P1：导入/导出、分类和模块管理。
模块：按分类筛选、创建/改名/移动/删除分类；新建模块、查看/编辑参数、移动/删除模块。
程序：阶段列表、添加/移除/上移阶段、添加/移除模块引用。
生成配置：模型输出与采样等参数编辑；详细字段沿用数据契约。
高级资源：新修订、查看 Used By、归档/恢复、支持类型的删除、Fork/Derive、打开所属项目。
预设正则：规则管理、作用域及运行行为；不能混成全局正则。
运行时 Prompt choices：切换作者提供的开关/互斥项、Override default、保存选择、恢复默认。
重要：Prompt choices 是运行时覆盖，不创建提示词资源新修订；编辑预设则是另一条路径。
状态：没有预设/模块、分类空、无效配置、引用影响、冲突、保存中、预览编译失败。
代码：native/prompt-presets.js；prompt-authoring.js；prompt-runtime-controls.js；regex-authoring.js；prompt-semantics.js。

S09 运行配置：连接
P0：创建/编辑连接、选传输类型、填完整 endpoint、选已存密钥、保存。
P1：测试连接；创建/存储 Secret；取消。P2：复制、删除、高级网关兼容设置。
传输类型含文本生成提供商适配器，以及官方/兼容 NovelAI 图片接口。
字段：名称、提供商传输、完整 URL、Secret；工具 schema 兼容、响应模式、输出预算；第三方图片能力声明。
状态：未配置、Secret 列表加载失败、测试中、未保存、保存成功但刷新失败、提供商拒绝、删除被引用。
注意：真实 API key 仅作为输入；列表和演示不得回显凭据。
代码：native/runtime-workspace.js connections 分支。

S10 运行配置：模型、路由与用途
模型 P0：新建/编辑、选择连接、远端模型 ID、上下文和输出上限、保存。
模型 P1：获取提供商模型列表、选择模型、使用发现的元数据。
模型 P2：tokenizer、能力覆盖、复制/删除。
路由 P0：新建/编辑、用途角色、模型、确切 Generation/Profile 与 Prompt/Program、保存。
路由 P1：通过预设选择资源；前往模型/预设管理；fallback 路线添加/移除/上移。
路由 P2：超时/要求等高级参数、复制/删除、依赖信息。
配置引导现有路径：连接—模型—提示词资源—路线；缺哪项应给对应的继续入口。
作品模型用途：逐用途选路线；满足条件时一条路线用于所有用途；刷新路线；保存并继续；取消；失败重试。
状态：能力不匹配、引用失效、没有候选、无法继续、正在保存、会话保留但体验需要恢复。
建议：向普通玩家说明“还缺什么、点哪里修复”，而不是只暴露 routeId。
代码：native/runtime-workspace.js；runtime-readiness.js；runtime-route-picker.js；task-binding-ui.js。

S11 运行配置：检索与诊断
检索：新建资源、创建修订；Embedding / Rerank；提供商、模型、地址、凭据、浏览浏览器模型；高级尺寸和提供商选项。
诊断：选路线、会话/项目及确切上下文、输入预览内容、编译预览；刷新项目、打开 Build、提示词选择。
边界：Runtime 编译预览不真实发送、不解析 Secret、不写会话；不要用“测试成功”暗示已实测提供商。
P0：编译预览与明确反馈。P1：配置选择。P2：编译结果和失败详情。
状态：未选路线、上下文过期/缺失、无项目、资源不完整、编译错误。
代码：native/retrieval-workspace.js；retrieval-picker.js；runtime-workspace.js renderDiagnostics。

S12 创作项目列表与工作台
项目列表：新建项目、项目名、打开项目；删除项目为危险管理动作。
工作台结构：项目资源导航/树、主体编辑区、检查器、活动区、AI 面板、诊断与差异审阅。
现有 20 类视图：Overview、Experience、Prompt Authoring、Runtime Design、Actors、EntryPoints、Worlds、Knowledge、Game Logic、UI、Assets、Memory、Agents、Skills、Plugins、Package Metadata、Test/Simulation、Preview、Build、Source。
P0：当前编辑、Review Changes、Cancel / Apply ChangeSet、必要的 Validate。
P1：Preview、Simulate、Inspector、AI、Build、活动记录。P2：源代码/高级 JSON/确切闭包。
资源操作：Attach、Fork、Update、Review detach、Used By；必须保留确切版本选择。
UI 编辑：选择原生界面文件、结构化或源码编辑、Check source、Review source changes、Preview draft、Reload file、定位编译诊断。
资产：媒体文件编辑与源文件维护；与 manifest 一并进入变更审阅。
测试：加载/暂存 scenario fixture、Run Simulation。构建：Run Preflight、Build .atria。
冲突：显示 revision 变化，Reload Latest；不能静默覆盖用户草稿。
AI：输入项目任务、模型路线配置、执行状态、生成的变更提案审阅；不能把 AI 生成内容自动当成已应用源代码。
手机：Project / Editor / Preview / AI / More 的次级切换，不能同时挤出资源树、编辑器和检查器三栏。
代码：native/studio-workspace.js；studio-authoring.js；studio-agent.js；studio-frontend-editor.js；studio-preview-ui.js；source-editor.js；asset-editor.js；project-lifecycle.js。

S13 智能体：编排
现有页面：Agents 入口、Orchestration、Run、Memory、Diagnostics。
编排：预设选择、新建、添加/恢复原生预设、Single Agent 模板、保存、校验、复制、导出、删除。
支持 spec / loop / agenda / director 模式，编辑器会因模式变化。
内部编辑：预设设置、工人阶段/专家、智能体详情、提示词、工具/权限、模型路线；可把 JSON 应用到草稿。
绑定：按现有上下文选绑定目标、绑定/清除、前往 Runtime Routes。
建议：不要把编排预设与提示词预设混成同一个“预设”列表。
状态：没有预设、无效配置、脏草稿、缺少路线、不同模式能力限制。
代码：agents/orchestrator/workspace/orchestration/page.js；host-presets.js；agent-editing.js；native/agent-settings.js。

S14 智能体：运行、记忆与诊断
运行：运行摘要、Graph / Timeline 切换、选择节点、步骤检查、分页、清除选择；按当前运行显示状态。
记忆：Overview / Knowledge / Sources / Maintenance；Memory OS / Memory / Recall / 自动抽取 / 自动压缩开关；检索配置；搜索与类型筛选、历史显示、实体/关系/事实检查器、来源证据、维护与刷新。
危险动作：重置当前会话记忆。不要画成全局无差别清空。
智能体诊断：Trace 导出、导入回放（依实现提供的文件入口）、返回 live run、事件/调用/召回统计、步骤详情。
状态：没有当前会话/运行、插件不可用、记忆加载失败、图无数据、回放与 live 的区分。
代码：agents/orchestrator/workspace/panel.js；memory/page.js；diagnostics/page.js；agents/memory/native-routing-ui.js。

S15 扩展：Skills 与 Plugins
顶层 Skills / Plugins。
Skills：已安装/内置浏览；搜索与分类/作用域；新建、从内置/文件/URL 导入、刷新；查看/编辑、移动、改名、删除；文件树、新文件、文件改名/删除、保存。只读资源隐藏不允许的编辑动作。
Plugins：外部插件、本地脚本、内置工具、官方插件。
外部插件：HTTPS 仓库 URL 安装、刷新、编辑、更新、删除；更新后需重新启用。
本地脚本：新建、导入 JavaScript、代码编辑、保存/取消。
扩展编辑：名称、启用、运行作用域（全局、选定预设、选定作品）；显示运行中/当前上下文未激活/错误。
内置工具：Regex、Search Tools 开关与配置；作品携带插件的来源、依赖、权限及拥有者入口沿现有挂载条件呈现。
状态：空分类、保存失败、更新冲突且保留草稿、需重载、权限与信任说明、当前作用域不匹配。
代码：native/extensions-workspace.js；atria-shell/utility-workspaces.js；skills/skill-manager-panel.js；skills/skill-editor.js。

S16 官方插图
配置：启用；提示词路线、图片连接、角色库及作品关联；风格词、质量词、负面提示词、NovelAI 参数；整理模板；作品覆盖；恢复默认/官方模板、保存。
游玩工具：正文/生图模式、选文建立标注、标注与历史、插图配置。
卡片：添加/移除角色、外观/服装及提示词分块、保存卡片、生成提示词、取消提示词任务、生成图片、取消图片任务。
高级：按分块组合、显式应用最新角色/预设、请求预览、应用某提示词版本、删除标注。
图片历史：展示某版本、暂不展示图片。关闭卡片/配置。
状态：无选文、历史只读、生成中、取消中、失败、无可用连接、版本过期、标注删除、图片占位。
建议：图片配置留在扩展/作品范围；游玩中只显示与当前选择相关的操作。生成提示词和生成图片各自有状态。
代码：native/official-illustration.js；illustration-settings-ui.js；illustration-surfaces.js；illustration-renderer.js。

S17 共享体验与作品界面
共享面板：启用共享、连接、刷新参与者、应用成员设置、断开；共享规则；提交输入；按角色/回合状态显示开启、提交和取消共享回合。
观察者不获得玩家提交能力；收集中、参与者未齐、回合过期等状态要可辨认。
作品呈现：原生组件、混合、自有内容区界面；游戏包的业务页无法由平台代码穷举，需定义宿主容器、主题边界与扩展槽规则。
宿主恢复工具：退出体验、停止生成、保存、诊断、重载呈现（按回调能力显示）。
代码：native/shared-session-ui.js；native/frontend/*；native/experience/ui/full-host.js、surfaces.js、host-surfaces.js。

S18 设置与账户
设置四组：外观（主题、颜色、高级外观、Custom CSS、字体缩放）；语言；界面行为（发送/自动滚动/自动保存编辑/删除确认/离开确认）；辅助功能（减少动态、快速 UI）。
设置相关入口：学习中心、Runtime Routes、Prompt Programs、存储与隐私、诊断。
账户：头像设置/删除、显示名称、修改密码、设置快照、备份与同步、存储管理、重置设置、全部重置；实际可用项受账户配置限制。
备份/同步/存储沿用现有控制器和子对话框，不推定为已提供公共云同步服务。
注意：Settings 中存在“Send on Enter”选项，但当前新 Play composer 明确采用 Ctrl/Cmd+Enter，设计稿应列为待统一行为，不承诺该选项已控制新 composer。
代码：atria-shell/utility-workspaces.js；atria-shell/appearance.js；scripts/user.js；scripts/templates/userProfile.html、userLanSync.html、userReset.html。

S19 全局诊断
现有视图：Guided、Startup、Expert；来源/事件列表、详情；报告当前问题、刷新；复制诊断摘要/完整上下文；清理当前来源。
与 Runtime 编译诊断、Agents Trace 诊断不同：可以在统一诊断入口中分组，但不得丢失范围。
状态：没有事件、正在获取、来源变化、选中事件、导出/复制失败、清理确认。
建议：普通用户先得到“哪里出错、下一步去哪”，专家再看完整 trace 和数据。
代码：scripts/logging/workspace.js。

通用状态与控件约束
G01 加载：保留标题和导航，说明正在加载哪个对象；不得永久空白。
G02 空态：区分“尚未创建”“搜索无结果”“当前上下文不适用”。
G03 错误：给就近原因、重试或准确修复入口；保留输入草稿。
G04 禁用：显示不可操作的原因；历史、生成中、权限和缺依赖分别表达。
G05 保存：草稿、提交中、成功、失败、成功但列表刷新失败分别表达。
G06 冲突：提示对象已更新，允许重新载入并明确草稿处理，不自动覆盖。
G07 删除/重置：展示对象与影响范围、取消和确认；重点动作不设为普通主 CTA。
G08 版本：区分原始资源、独立副本、修订、预览、live，长 ID 放详情。
G09 移动端：一个主任务、可返回次级页、弹层不挡输入区、滚动容器职责清楚。
G10 可访问性：可见标签、focus、Esc、焦点归还、足够点击范围、减少动效、多语言长文案。

建议整理结论（未批准）
1. 玩家主链只强调“继续/开始—读—输入—保存/恢复”，高级机制放上下文。
2. 创建与管理按对象归位；避免一个资源的编辑入口分散但命名不一致。
3. 将加载、空态、错误、反馈、审阅、版本提示统一为共享组件。
4. 保留五域语义；设计 AI 可提新导航方案，但必须提供 S00–S19 功能映射。
5. 正式界面不恢复旧角色卡、旧聊天管理、旧世界书和旧连接抽屉作为平行主入口。
6. 不把已隐藏的 DOM 视作可删除代码：它们仍可能承担事件、数据和插件兼容职责。
