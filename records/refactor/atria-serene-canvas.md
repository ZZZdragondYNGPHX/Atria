# Atria Serene Canvas — Implementation Record

- Task ID: `refactor/atria-serene-canvas`
- Primary Workspace: 产品源码；方案与结果归 `docs`。
- Plan: [index.md](../../plans/refactor/atria-serene-canvas/index.md)
- Status: Completed — 已授权的产品重构集成并同步至 `main@ec51db9a9`；外部服务与真实设备限制见文末。

## I1 — 视觉基础、Shell 与原生设施

- Start HEAD: `cc5e90eac` (`main`)，工作分支 `refactor/atria-serene-canvas`。
- 2026-10-15 实际核对：产品工作区干净；docs 的其他任务修改保持原样，仅按明确路径写入本任务文件。
- 已读产品/docs AGENTS 与完整 Governance 1.5；按本次明确授权修正 Plan 的旧“未授权”状态。
- 重新核查 ES modules / DOM / CSS、Node ≥20 / Express、现有 Shell/Navigation/Environment、原生 Composer/Session 与 Settings 持久入口。
- 对旧盘点 HEAD 的产品差异包含 MCP 凭据目标审查与 frontend bridge/runtime 调整；继续复用当前代码，不回退旧状态。
- 已实际浏览 v0.1、v0.6、原始 desktop/mobile HTML；阅读两份 Markdown 与 mobile-design-notes 图片。v0.6 桌面 Actors 编辑→Review、手机五分区/长编辑页取得原型证据，不能视为产品验收。
- 产品验收已开始，尚未完成全域验收；以下证据与限制持续更新。
- I1 End/Tested HEAD：`7199a614f`，基础实现已完成针对性验证并保存本地阶段提交；任务保持进行中，接续欠覆盖代表 HTML 与各域真实流程。未集成 main，未宣称任务完成。

### 当前动效筛选（find-animation-opportunities）

| Location | Today | Purpose | Frequency | Suggested motion |
| --- | --- | --- | --- | --- |
| Shell Dock / shared buttons | 部分控件仅背景反馈 | Feedback | 高频，轻微 | 指针按压 scale(.97)，160ms cubic-bezier(.23,1,.32,1)，减动取消位移 |
| Context Sheet / account menu | 隐藏切换与单向入场 | Spatial consistency | 偶尔 | transform/opacity，260ms cubic-bezier(.22,1,.36,1)；退出180ms，可反向且只清理当前操作 |

拒绝：核心五域切换、搜索快捷键、编辑输入/Source切换、diff/运行证据行。频率或阅读稳定性不允许装饰入场。

### 当前实施结果

- 单一浅色 tokens：温纸 `#f9f8f6`、白纸、衬线标题/正文、悬浮 Dock、窄幅阅读和 Studio 三纸。沿用原有字号比例与 tokens，不迁移框架。Playfair Display / Plus Jakarta Sans 自托管，包含各自 OFL；简中采用宋体回退。
- 原生 Composer 使用显式输入与指定 Session/Branch/Revision 调用现有生成服务，不再读写隐藏输入框。一个控制器负责重复操作、停止与清理；迟到回调受 Session、分支及加载 epoch 保护。
- 输入和回复直接调用原有 Session `runtime/append` 命令，使用原有持久层和 CAS。已发出的提交按真实回执处理；排队但尚未发出的提交可以取消，不增加撤销已发出提交的能力。隐藏聊天 DOM 仍作为兼容投影保留，默认不可聚焦。
- 有效上次阅读：使用现有账户存储保存 Session 指针，恢复前以真实会话目录核对指定作品版本；找不到有效对象时显示已有恢复/最近阅读入口，不新建故事。“最近阅读”通过原有路由展示，返回阅读保留输入草稿。
- 常用设置使用 DOM 原生控件并写回现有 `power_user` 和防抖保存。系统减动与手动偏好分开；高级主题数据和原有编辑入口保留。实际浏览器检查发现原生 range 设置顺序导致默认字号误显示为 1.5，已修复并测试原始比例和释放后保存。
- Runtime 进入页面就检查真实缺项，仍保留完整编辑。免认证依据提取到共享规则，连接编辑、readiness 与服务合同一致；MCP/A2A/ComfyUI/SD WebUI/Forge 可免认证，文本模型 adapter 仍要求 Secret。
- Agents Run 默认时间线，Graph 保留。
- 英文与简中：补上插图、图库、图片编辑与 Memory OS 的硬编码中文，翻译只针对界面文案，正文、提示词、姓名和 JSON 不自动翻译。“修订”改为“版本”，重写冲突、保存、预算和授权提示；静态检查覆盖中文 fallback、动态占位符、无障碍标签与 Runtime 错误映射。
- Stop 准备期：可见控件读取 Native owner / preparing / cancelling，清理完成前不接受重复发送。草稿恢复依据真正的输入提交回执，不能用 HEAD 变化猜测输入被接受；先前 state-only 保存不丢输入，已经发出的输入提交即使后续刷新失败也不恢复成待发送草稿。
- Studio 字段的辅助标签随语言切换，Source JSON 保留专业字段与原文；修复中文版手机返回文字竖排。补上键盘跳转工作区、图标尺寸、关键字体 preload 与浅色首屏背景；流式正文不逐字向读屏器广播，阶段反馈仅在变化时更新。

### 实际验证与诊断

- 真实浏览器（隔离 FsEngine 数据，本地 SSE provider，无外部模型调用）：发送 → 最近阅读 → 保留未发出输入 → 返回阅读 → 快速存档 → 再次生成 → 加载指定存档 → Escape 关闭详情 → 刷新恢复阅读；另一条发送 → 流式草稿 → Stop → 草稿不入历史 → 设置往返 → 再发送。两条均通过。旧夹具缺少新增地址许可、默认叙事 Skills 会保留中间轮输出、旧测试定位退役操作，均以当前 `cc5e90eac` 权威核对后修正夹具，未恢复退役能力。
- 桌面 Studio 实际创建隔离项目并浏览三纸与 Actors Source；Settings 实际英/简中切换、字号显示；Runtime 实际连接与方案页面。尚不表示 Studio 全流程验收完成。
- Studio 真实浏览器：隔离项目 Actors collection Source → Review → Apply → `88dc26ee227b…` → 刷新 → 结构化角色内容恢复；查看1440px英文、900px简中、390px简中。已有20条 Studio 草稿/冲突/提交回执测试在辅助标签变化后复测通过；这一条角色保存不代表全20个编辑视图验收完成。
- 新增浏览器时序：暂停真实提交响应，Stop 准备期保留未发送文字和已发出的状态提交；Stop 输入提交期保留唯一已提交输入、输入框清空；随后再次发送成功。FsEngine 另验证发出输入提交后 Stop + projection failure 仍有真实回执和保存内容。新 controller/product/control 26条通过，相关 FsEngine 5条通过。
- `atria-shell` 全组：首次 69 suites / 354 cases 中 344 通过、10 失败。故障包含 Studio 导航文案/新菜单定位、自动 readiness 新读取、Memory 夹具误用字段、基线已退役 Retry/Fork 的旧预期。核对真实源码后定向复测 33 cases 全部通过；此前已通过项未无理由重复。实际产品修复还包括桌面详情 Escape/焦点和菜单 `aria-current`。
- Native Session FsEngine 与纯投影：30 cases 通过，包括指定版本、草稿、取消、迟到操作、状态提交/丢弃、存档恢复、旧历史不变。完整四引擎初次执行曾失败：SQLite 原生绑定缺失，MySQL/PostgreSQL 不可连接；这些引擎尚未取得通过证据。
- Model/Prompt/Runtime 合同 22 cases 通过；原生偏好 2 cases 通过；上述 Shell 组包含 Studio 草稿、冲突、验证失败与保存后刷新失败的 20 cases，以及 Runtime 25 cases。
- 变更 JS ESLint（修复引号/格式后）无 error；`.mjs` 使用 node env / module parser检查通过。`git diff --check` 与 Native 双语覆盖检查通过。浏览器参数分支和诊断采集循环暂有4个 Playwright lint warning，相关实际断言已执行，未隐藏 warning。
- 最后相关复测：55 cases 通过，覆盖 Native product/controller、Shell、Studio workspace 与全域英文/简中静态覆盖；字段/Source round trip的额外两组共12条也通过。

### 动效与可访问性审查（进行中）

已明确调用 `review-animations` 与 `web-design-guidelines`，读取标准并获取最新官方 Web Interface Guidelines；实际丢帧采样后调用 `animation-performance`。

| Before | After | Why |
| --- | --- | --- |
| 减动下全局 1ms 动画，加载圈仍转动 | 静态加载反馈；保留温和状态反馈，取消按压位移 | 避免高速循环与运动残留 |
| 骨架 background-position 动画 | 仅 opacity 脉冲，减动静止 | 避免逐帧绘制背景位置 |
| 抽屉 CSS 与 WAAPI 都控制 transform | WAAPI 单一展示生命周期，读取当前位置后重定向 | 快速关闭/重开不从初态跳回 |
| 抽屉高度切档直接跳动 | 高度一次布局、transform 补偿与释放速度衔接 | 保持纸面位置连续，不逐帧改变布局 |
| 部分键盘按压也缩放 | `:focus-visible` 无位移，快捷搜索立即切换 | 高频键盘路径不等待动画 |
| 弹层背景仍可被辅助技术访问 | 保存并恢复背景 inert；保留已有弹层/ Escape 次序 | 焦点与辅助技术范围一致 |
| Studio 原生 checkbox 被旧主题样式隐藏 | scoped native appearance，设置 switch 独立 | 在真实浏览器中发现并修复控件不可见 |
| 原生菜单点击仍扫描旧聊天委托 selector | 仅 Shell 自有菜单和触发器阻止无关冒泡；兼容设置事件仍保留 | profiler 确认旧 jQuery 委托匹配造成开关开销 |
| 打开菜单重复读取布局/样式 | 先读触发器，合并定位写入；隐藏弹层不读取当前动画值 | 保留触发点 transform-origin，降低同步布局次数 |
| 手机抓手是22px的模拟按钮 | 44px原生 button，触屏取消恢复内容 inert，键盘/点击可替代 | 避免仅手势操作及过小命中区域 |

- CUA 短轨迹只有约 30ms，有一条 DroppedFrame；不能据此判断持续动效性能。
- 独立 Chromium / 4× CPU 限速覆盖 1440、900、390、320：真实开关与连续反向开关、Escape、背景 inert 验证通过；采集到 348 DrawFrame / 58 DroppedFrame。轨迹同时包含约 100–196ms 的自动化 EvaluateScript 与部分 30–65ms 点击/布局事件，正在隔离自动化采样开销与产品代码，尚未宣称性能通过。
- 修复后上述完整操作与截图矩阵复测通过。完整 trace含自动化/截图，354 DrawFrame / 68 DroppedFrame；此总数仍不作为动画性能结论。
- 另用 CDP 真实点击、无截图/角色查询干扰，4× CPU、同一隔离服务器测量1440/900/390/320。旧点击约30–55ms，修复后约18–25ms；实际开关区间分别29/28/28/28 DrawFrame及2/0/0/1 DroppedFrame。390px另外18条旧帧时间戳均早于首次点击，属于视口切换区间，单独列出。首次桌面还在初始化 Agent 预设，不能将该条当作稳定态性能或声称全设备无丢帧。
- 手机 Context Sheet 真实 Chromium：ArrowUp/ArrowDown/Enter、触屏拖拽→touchCancel→恢复内容、Escape和系统 reduced-motion验证通过；减动只保留 opacity，不包含位移。性能修复只改变展示链和无消费者事件冒泡，没有使用 `will-change` 掩盖问题。
- 物理手机 GPU、真实软键盘与系统 IME 尚无实机证据；已有 IME/Enter/修饰键事件测试属于产品代码验证，不冒充实机验收。

研究来源：官方 [Motion Primitives dialog 源码](https://raw.githubusercontent.com/ibelick/motion-primitives/main/components/core/dialog.tsx)、[Animate UI Sheet](https://animate-ui.com/docs/primitives/radix/sheet)、[MDN Animation.reverse](https://developer.mozilla.org/en-US/docs/Web/API/Animation/reverse)、[Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)。仅提炼 lifecycle/材质/状态方法，没有复制 React 运行栈或演示业务逻辑。

### I1 review checkpoint

`review-animations`：上述 Findings table 已逐项修复。对本轮 Shell paper/菜单/抓手/按压/减动的代码与浏览器行为给出 **Approve**：260ms进入、180ms退出，transform/opacity，反向开关读取实时位置，拖拽使用释放速度，键盘路径立即切换，系统与手动减动均生效。此结论不涵盖后续未展开页面，也不宣称实机GPU全通过。

`web-design-guidelines`（2026-10-15 fresh source）已修复的具体位置：`public/scripts/atria-shell/app-shell.js` 的跳转主区、标志尺寸、原生抓手；`public/scripts/native/studio-actors-editor.js` / `studio-entrypoints-editor.js` / `studio-value-editor.js` 的双语标签与 locale-independent focus selector；`public/index.html` 的浅色首屏/字体 preload；`public/scripts/native/play-product.js` 的状态播报。尚需按后续模块复核长列表和所有条件媒体流程。

microinteractions 本轮控件诊断：

| Question | Result |
| --- | --- |
| Trigger discoverable | Send/Stop、菜单、详情抓手均有可见控件 |
| Trigger reflects state | disabled / busy / aria-pressed / expanded / focus |
| Predictable rules | 复用现有操作与提交权威，准备和已提交输入分开 |
| Immediate feedback | 准备、停止、审查阶段立即反馈 |
| Proportionate feedback | 内联状态，阅读与键盘不加装饰入场 |
| Evolves over time | 仍需后续引导/专业页面检查重复提示；未计通过 |
| Modes clear | 历史只读、Source/字段、停止中明确显示 |
| First-use understandable | 缺配置修复路径与真实空页方向可达 |

Score：`round(7 / 8 × 10) = 9/10`，仅限本轮已验证控件。

## I2 / I3 — 入口、Studio 文件与任务反馈（2026-10-15，持续实施）

- 登录页接入与产品相同的英文/简中选择，仅加载纯文案表；静态标签、动态失败与等待反馈均双语，用户姓名和输入不翻译。入口采用自托管字体、温纸与白纸，移除仅为登录加载的旧聊天样式。
- 项目首页改为一张工作纸，名称与搜索纵向排布，删除折入管理；空名称/空白名称定位错误，创建中锁定表单。Agent 状态采用自然的任务描述，原始状态枚举继续保留在证据中。
- Source 文件路径进入资源纸，选择复用原有编辑器和各文件草稿；迟到读取丢弃，读取失败保留可复制的只读草稿，恢复后才允许审查。未新增并行服务、自动合并或覆盖。
- 会话提交返回后再次核对投影身份与 epoch。旧输入及状态提交保留真实回执，拒绝覆盖后来载入的版本；旧请求失败不会把新投影标为失败。已发出的提交不撤销、不重放。
- 主按钮统一墨色 hover/pressed，鼠标按压有克制缩放，键盘 focus 保持位置；Studio 旧 primary hover 白字浅底问题已修复。

实际验证：登录英文四条与简中一条流程通过，移除旧样式后相关五条复测通过；入口/Agent/双语 17 条通过；Source/Studio/Agent/双语 42 条通过。Studio 的真实 Source→Review→Apply、Preview、并发写冲突→Reload、Agent 失败保留草稿、Preflight 在 1440/900/320px 三条流程通过；新增手机文件切换精确草稿保持一条通过。项目首页加载失败/重试/搜索/新建一条通过。Source 缓存只读修正后 27 条相关测试通过。

提交范围检查：FsEngine/纯投影首次 32 条通过；扩大到四类状态保存和旧请求失败后，新增测试因来源夹具和重读拦截错误有两条超时，修正后五条通过，其余已通过项不重复。Native generation/controller/product/control 26 条复测通过；真实浏览器 Stop 准备期与输入提交期回执流程复测一条通过，未调用外部模型。

实际主按钮检查：hover 墨色白字，pressed 更深墨色，键盘有实线 focus 且无位移。新增 JS ESLint 错误已修正，双语覆盖与 diff 空白检查通过。v0.7 的 18 个布局及内存流程证据归 references/README.md，与上述产品验收分开。SQLite/MySQL/PostgreSQL、真实移动软键盘、完整 Project Agent 成功提交及剩余工具尚无本轮通过证据，继续实施。

## I2 / I4 — Library、账户与全局工具（2026-10-15）

产品提交 `ea58f615e`。Library 分类在手机保留可滚动导航；Prompt 编辑采用白纸和墨色保存按钮，保存回执挂到重新渲染后的纸面，保留真实完整版本标识。账户分为资料/数据两纸，快照改为原生展开列表，读取失败可单独重试。备份、存储、LAN 与共享弹窗补全英文/自然简中，系统日期只按应用的两种语言显示；文件名、用户键值、资源内容不翻译。

备份保留策略对保存/清理/重置统一等待保护，提交成功后若读取失败保留回执，只提供重读；无效新 ZIP 会清空旧预检目标。原生 tabs 的角色、键盘移动、焦点归还和隐藏内容恢复，账号操作防重复与失败恢复均沿原有服务。旧 Enter 代理跳过原生控件、IME、修饰键和已处理事件；通用 a11y 不覆盖明确 tab/menuitem 角色。首次 Skills 初始化由按用户目录共享的等待屏障保护，全部 `/api/skills` 首请求等待完成后才进入路由，修复 Windows staging rename 竞争，不覆盖已有用户 Skills。

实际验证：Library 八条相关浏览器流程通过，编辑纸样式改变后两条 Preset 流程复测通过；Package Knowledge 原件编辑/World只读两尺寸及 Preset 隔离三条通过。账户/备份/存储/快照/真实 ZIP/退出八条通过（1440英文、900/320简中，浏览器系统故意为ja-JP）；新增 IME/退出一条复测通过。原生发送、阅读返回、精确保存与刷新一条通过，使用本地 SSE，未调用外部模型。旧备份六条流程通过，其中部分服务响应为隔离故障模拟；真实 ZIP 流程读取真实服务流后原样转发以保留刷新前回执，不能据此宣称实时流动画全通过。

扩展桌面流程一条通过，手机首次因初始化竞争失败；根因修复后320px Skills/脚本与390px官方插图完整设置两条复测通过。Skills真实文件系统与仓库80条通过，包括并发请求必须等待同一次安装。相关UI状态23条、键盘/双语/Play/回执12条通过。双语静态覆盖扩至上述共享工具与 popup，通过；改动 JS ESLint 无错误（原有备份测试 conditional 一条警告），diff空白检查通过。

`review-animations` 范围复审：本批保留原有可中断纸面生命周期，新增原生details仅转动chevron，不让表单/树/回执入场；按压只影响指针、键盘无位移、reduced-motion取消过渡，结论 **Approve（本批范围）**。`web-design-guidelines` 复审发现并修复角色覆盖、重复Enter、手机分类入口缺失和 hidden 按钮被全局display覆盖。控件有可见触发、busy/disabled、即时状态、错误恢复、明确模式与首次缺项路径；常用说明折入details，七项及长期提示收敛均在本批代表控件满足，microinteractions **8/8，10/10（代表范围）**。这不是所有条件页面或实机性能结论。

v0.7备份12布局与内存演示证据只归 references/README.md。Runtime/Agents、完整 Project Agent 成功提交及条件能力仍在继续验收；数据库引擎和真实手机限制沿前述记录，不以阶段提交表示整体完成。

## I3 / I4 — 精确配置与完整人工提交链（2026-10-15）

产品提交 `0c6ea1a97`。Shell、Runtime、密钥表单、作品浮层等自有快捷键跳过 IME/229/已处理事件。兼容工具栏在正式 Shell 中 inert/aria-hidden，恢复旧界面时还原。中文“原生预设”改为“内置预设”，执行计划/引擎状态等按实际用户任务表达。Project Agent 人工提交等待立即显示保存状态。仿真页运行当前场景不再触发离开草稿确认，跨页草稿和提交锁仍检查。

Runtime 12条浏览器任务累计通过：Source高级字段/坏JSON、缺项自动展开、引用阻碍/复制/删除、模型发现及来源、719px跨档/键盘视口/IME/离开取消、能力覆盖、Preset精确成对绑定且保存不重新绑定Route、fallback、三个诊断/大字/简中流程。旧测试曾收起自动展开面板、访问已退出的独立Generation页、假定共享夹具的Route从未变化；分别按现有合同修正，失败相关流程复测通过。没有恢复旧页面或降低精确绑定合同。

Agents七条累计通过，包括两种实际Memory任务路由、Plan坏Source/关闭再开保留、精确角色路由、会话切换后拒绝过期重置；旧四种Memory任务假设及将Locator当字符串的测试错误已修正。Studio桌面/手机两条完整人工提交与390px二十视图/Attach/Update/Fork/Detach/保存后刷新失败通过：Task由UI创建，提议由真实Task工具和Studio服务验证/预览，提交前项目版本不变，双击只发一次人工Commit，刷新恢复Completed。没有外部模型，不能据此宣称模型规划质量。

Studio仿真与真实Native@3预览1440/320px两条在修复场景草稿阻碍后通过；Play健康修复/共享固定座位一条通过。主题CRUD/导入导出失败恢复/刷新/双语一条通过，更新为原生Language控件及明确打开兼容分组。相关Runtime/Shell单元34条、Shell/Play/FullHost19条、兼容可访问性9条、Studio/Agent30条通过。静态双语覆盖与改动JS lint无错误、diff检查通过。

条件媒体：新增图库/Media Studio隔离模块浏览器验证1440英文、900/320简中三条通过，真实FS/图片服务/遮罩草稿/请求批准服务；图片输出由本地供应端夹具产生，预览后取消，没有发出外部图片请求。现有speech-completion浏览器脚本在1280/390px通过实际WAV解码、无自动播放、停止、声线保留、过期音频清除、MCP控制、A2A重连和Runtime编辑，外部请求0。这些模块证据与完整Shell和真实第三方服务验收分开。

`find-animation-opportunities` 本轮筛选：配置字段、Source、计划行和执行证据均保持即时；不为密集编辑增加入场。`review-animations`/`web-design-guidelines` 本轮范围复核维持纸面交互方案，修复IME、辅助树和稿件离开边界；尚需条件媒体布局与完整宿主对照。前一批microinteractions长期提示虽已折叠，但没有长期使用证据，分数校正为7/8、9/10；本批不扩大评分范围。

## I4 — 媒体、作品宿主与综合验收（2026-10-15）

产品提交 `4baa98e0b`，补充权限文案提交 `9eebc6c19`。图库与图片编辑统一白纸、衬线层级、墨色确认按钮和44px控件；原始操作枚举继续保存，显示为自然的操作名称。图库丢弃迟到读取及旧失败，页尾禁用状态在等待结束后仍准确；读取失败可直接刷新。官方插图按当前面板类型处理任务轮询，完成结果不能把正在编辑的图库替换回标注卡；关闭或卸载后的异步编辑器会释放资源。

作品 Host 保存有立即等待反馈、busy/disabled和成功状态，失败仅在错误状态使用危险色；完整宿主、嵌套原生界面的加载/恢复/外部图片许可均双语。遮罩坐标改为可读字段名，IME不误触快捷键。Prompt模块保存回列表时补偿保存回执造成的54.5px位移，恢复位置产生的旧滚动事件不再立刻关闭新菜单。无效存档头返回明确400和可恢复文案，密码/解密错误语义保留。

Regex启动独立于打开设置，打开会话及开始生成等待对应作用域；新读取取代旧读取时，调用方继续等最新作用域，旧失败不能清空新规则。首次Skills并发等待之外，对真实Windows瞬时EPERM/EBUSY只重试同一次目录rename，最多五次/375ms，不删除或强制替换竞争目标；未把文件锁原因臆断为某个具体进程。

简中继续全面检查产品界面的可见/辅助文案，最后一批额外优化67条：exact按场景表达为指定版本、对应版本或标识；姓名通用标签改为名称，Host/投影/回执按用户任务表达。应用仅有英文和简中，两者的占位符与语言目录检查通过；用户名称、文件路径、代码、Package内容与错误证据不翻译。静态检查补入嵌套宿主及浏览器confirm/alert/prompt，修复外部图片必选许可的英文遗漏。

### 实际执行的相关验证

- 图库/遮罩/批准在1440英文、900/320简中三条真实FS模块浏览器流程通过；最后改用仅本地HTTP图片供应端后四条通过，新增390px批准→双击只提交一次→真实服务完成→模型结果和合成版独立保存→刷新与重载。预览/取消阶段请求数为0，批准后本地供应端请求1次；外部请求0。1px图片为协议夹具，不是视觉素材或真实模型质量验收。
- 真实构建安装的Native@3 full Work在1440英文与320简中通过Save/Persona/Reload/IME/Exit，两条在集成最新main后复测通过。Host按钮按真实可写能力禁用，不将故事内容或作品自定义视觉当应用翻译对象。
- Actors/EntryPoints/Worlds/Knowledge集合累计八条浏览器流程通过，包含真实文件、未知JSON字段、Source/Review/Apply、手机大字、版本冲突、复制和明确放弃草稿。旧姓名/修订/审阅选择器按当前自然文案修正。
- Prompt分类/阶段/Regex编辑/导入导出等七条已通过；模块筛选和保存后返回位置两尺寸初次失败54.5px，修复后两条通过。Regex作用域旧入口及重载顺序诊断后，最后一条Global→Preset→Game/所有者/导入/重载流程通过。新增作用域等待/迟到失败/重试三条与Regex引擎四条通过。
- Play存档三条深流程中两条先通过；最后历史流程改用现有Save→Load建立新分支，验证旧分支保留、只读Inspect、Preview/Switch和真实busy保护后通过。Native Play本地SSE生成/停止/再次操作1440/390两条通过；夹具显式批准的仅是测试自有loopback凭据目标。停止准备期与已发出输入提交的真实回执一条通过。
- Utilities/Agents综合流程1440/900/320三条通过；账户等待/503恢复、备份键盘与存储、诊断失败/重试、扩展读取故障恢复及简中大字/键盘两条通过。旧测试的隐藏聊天按钮、插件旧路由、Agents旧首页等实现假设被替换为当前实际入口，没有恢复退役产品能力。
- 最后390px活动Run默认时间线、键盘切Graph/回时间线及清理后空态一条通过，测试提交`ec51db9a9`。使用实际临时Run store构造界面状态，没有模型调用；证明视图选择与可达性，不证明真实Agent推理或Engine图质量。
- 本批Gallery迟到读取/迟到失败/页尾禁用/初读失败重试四条通过；Host/语言等18条相关单元通过；插图两条相关等待/提交状态复测通过；Skills瞬时rename与初始化顺序13条通过。存档FS/头解析相关24条通过；同次四引擎尝试仍有SQLite原生绑定缺失、MySQL53306/PostgreSQL53307不可连接三条环境失败，另三条SQLite样例跳过，不宣称全组通过。
- 合入同时推进的main音频、任务结果、设置持久化与恢复栏提交后，Host/Task bindings/Frontend presentation共52条通过；audio/scope disposal/public task history五条Node测试通过；权限文案与媒体平台29条通过。相关JS lint无error，语言覆盖及diff检查通过。未默认运行无关全量测试或构建。

### 完成后动效与交互审查

已明确调用 `review-animations` 和 `web-design-guidelines`，沿最新官方规范检查本批产品结果；`find-animation-opportunities`拒绝图库分页、Source输入、执行证据和日常字段的装饰入场，批准按钮仅提供指针反馈。

| Before | After | Why |
| --- | --- | --- |
| 媒体按压/释放同为140ms默认曲线 | transform按压160ms、释放100ms，使用既有强ease-out；键盘无位移 | 即时状态与克制、可中断的反馈 |
| primary hover盖过pressed墨色 | hover排除active，按压更深墨色 | 鼠标按住时反馈可见 |
| hover只检查hover能力 | 同时检查pointer:fine；系统/手动减动取消位移 | 触屏和减动不遗留运动 |
| 图库加载失败缺直接恢复入口、旧任务重绘别的面板 | 真实Refresh、aria-busy/alert、请求序号和当前面板守卫 | 错误能恢复，迟到结果不夺取工作位置 |

**Approve（本任务已验证范围）**：纸面生命周期、抽屉可中断/反向、指针按压、键盘即时路径、减动及反馈层次符合本次标准。I1已有4倍CPU真实trace与丢帧范围记录；本批仅transform按压，没有新逐帧布局动效，不扩大为所有实机GPU性能结论。microinteractions保持7/8、9/10，长期熟练使用提示的证据仍不计通过。

### 交付与明确限制

所有实施阶段继续推进至本次已授权范围完成，没有阶段停工或HANDOFF。重新核对实际Git后，保留并合入另一任务的`main@493ed814b`，自动合并重叠文件后检查实际组合并执行上述相关复测；产品实现`9eebc6c19`加最后Run测试后，最终`main@ec51db9a9`包含两项任务内容，已核对远端同提交。产品与docs保持独立，不合入package/plugin/skills工作空间；其他任务的未跟踪企划保留。main已在另一独立产品工作树签出，本任务产品目录保留相同提交的detached签出，清理自己的临时语义分支，不移动或移除其他工作树。

v0.7仅补充代表布局与内存演示，未获得新视觉基线接受；v0.1视觉与已纳入方案的v0.6继续决定方向。真实手机软键盘/触屏硬件、真实第三方模型规划/图片质量/费用、未提供的数据库环境没有通过证据；这些不由原型、测试夹具或浏览器尺寸模拟冒充。没有新增选文重生成、框架迁移、自动合并、强制覆盖或撤销已发出提交。

## D2 — Dock 边缘交互 HTML（2026-10-15）

本轮仅授权补充 HTML，让用户先体验后讨论。开始时重新核对实际Git：产品工作区为干净的 detached `ec51db9a9`；文档为 `docs@88eb5c1c4`，另一任务未跟踪的 `plans/feat/agent-experience-evolution/` 保留。全部修改位于docs语义分支，没有修改产品代码或主分支。

新增独立 [v0.8 HTML](../../plans/refactor/atria-serene-canvas/references/discussion-preview-v0.8.html)，保留v0.7原样；[dock.md](../../plans/refactor/atria-serene-canvas/dock.md)作为本项详细交互权威，更新Plan路由与已确定取舍。桌面完全隐藏后边缘唤出、触屏把手和明确收起、不以滚动唤出、长按换边均可实际试玩；其余说明与参数只见该模块。

实际执行：内联模块语法、Git diff检查；1440px三边唤出/收起、鼠标/键盘/菜单/取消/输入保持；390/320px触摸长按/短滑/取消/选择后收起/滚动不唤出/减动快速重复；900px构图与320px双语；高级域原型入口、快速反向、IME。失败均定位并修复后复测，具体原型证据与动效审查表只归 [references/README.md](../../plans/refactor/atria-serene-canvas/references/README.md#v08-dock-actual-prototype-checks)。本次没有产品API调用，pageerror为0；本机4倍CPU采样100帧间隔的p95为16.8ms，不能代替真机/完整trace。

明确调用review-animations，结论Approve仅限v0.8新增范围；web-design-guidelines修复高级域入口、菜单单选语义与跳到正文路径。当前仅设计稿交付，等待交互反馈；产品接入、位置持久化、最终键盘入口和真实手机系统手势尚未验收。此前I4已完成产品结果保持，不把新原型当作产品新增功能验收。

D2最终复查补充：修复旧稿iframe在字体等待期间未绑定Dock事件，以及触屏唤出后点击穿透到iframe引发的焦点误收起。桌面嵌入内容移动、手机唤出/点内容收起与减动快速重复已复测；详细证据仍归references/README.md。新增稿件混合换行在最终暂存检查中修正，v0.7保持原样。

## I5 — 已接受 Dock 的产品接入（2026-10-15）

明确接受v0.8并授权实装后，重新核对实际Git：产品为干净的detached `ec51db9a9`，当前主线已到 `2686aa40a`；从真实main建立 `feat/edge-dock`，没有以旧聊天状态替代源码核查。docs从 `559ddbb8a` 继续，其他任务未跟踪企划保留。

接入现有Navigation Authority、命令注册表、账户菜单、环境和减动偏好；只新增Dock呈现控制，不迁移框架或引入依赖。键盘入口、同次使用的位置记忆和软键盘边界只归Plan的dock.md。产品草稿和提交权威没有替换。当前范围正在完成验证与主线集成，最终证据见本节后续记录。

### I5 完成结果与实际验证

End/Tested HEAD：`60aca6957`。产品接入 `public/scripts/atria-shell/edge-dock.js`，样式归 `public/css/atria-edge-dock.css` 并由正式入口加载；AppShell 继续拥有导航、菜单与命令状态。抓手/把手只是呈现状态，正文与真实项目输入节点不重建；五域、搜索和工具沿已有权威。两种语言沿原有翻译表，新增简中使用“展开导航”“导航位置”“已取消移动”等直接表达。没有引入新的依赖、服务、持久层或业务能力。

- 真实 Chromium 的新增四条产品流程通过：1440px 左/右/底边隐藏与唤出、延迟/反向、真实项目草稿内容和节点身份/位置保持、菜单隔离、键盘/Home/End/Esc；900px鼠标拖动/吸附/取消；390px与320px触摸点按/长按/短滑/取消/选页收起/滚动不唤出/减动快速重复。WAAPI改动后四条相关流程复测通过。
- 最后补入的搜索“展开导航”流程随桌面流程复测通过，搜索关闭后焦点留在Dock；新增单元发现并修复先前延后聚焦回调在搜索关闭后仍抢焦点，相关单元复测通过。
- 既有Foundation桌面与手机两条真实Host/Command流程通过。旧手机测试假定Runtime有两个按钮，实际手机一直从菜单进入；改为验证URL与当前菜单项后该失败流程复测通过。首轮新测试未展开产品中默认收起的新建表单，主动结束该无效等待，按真实入口修正后继续验证，没有因此结束任务。
- 独立浏览器补查：系统locale为ja-JP、应用为简中的导航/菜单；模拟visualViewport键盘弹出隐藏Dock/把手并保留真实项目输入；跨390→900→320布局和当前模式位置保留，无页面横向溢出。系统减动在转向中开启后，根位移和子元素转向动画均结束。人工查看桌面、中宽、手机的产品截图，并与已接受HTML对照；页面错误为0，未调用外部模型。
- 相关单元累计39条通过：AppShell 11、WorkspaceHost 13、NativePlayHost 6、Back Resolver 4、PaperTransition 2、Environment 3；最后AppShell/WorkspaceHost 24条在焦点修复后复测通过。没有默认运行无关全量测试。
- 修改JS及测试ESLint无error/warn；真实手势/收起期限测试中的等待有逐处说明，不把任意等待当就绪条件。英文/简中覆盖检查、CSS解析、内联与模块语法检查、最终暂存空白检查通过。

### I5 性能诊断与完成后审查

初次4倍CPU采样时，JS rAF间隔p95为50ms，7/120间隔超过34ms、最长233.3ms，trace内10次布局；这提示初始化工作繁忙时逐帧JS位移会受阻，不能以快机器的正常体验作结论。Dock唤出/归位改为采样相同临界阻尼弹簧的WAAPI transform/opacity，手势仍直接跟手；中断读取当前呈现并续接速度，完成回调按当前Animation身份守卫。移除常驻will-change。

修复后真实Chromium采样：4倍CPU限制，主动阻塞主线程243ms期间仍收到13帧画面、12个不同图像；该次trace记录59个DrawFrame、0个DroppedFrame、0次Layout。此为本机隔离产品实例的一次有界证据，不代表所有GPU/实机或所有页面初始化任务都没有丢帧；原始trace只在临时诊断中处理，永久记录保留这些实际指标。

本轮按任务使用apple-design、animate、motion、microinteractions、frontend-design/emil-design-eng；find-animation-opportunities仅选择Dock空间连续性、跟手和吸附，拒绝正文、字段与高频列表入场。发现实际主线程阻塞后调用animation-performance定位并修复。完成后明确调用review-animations与web-design-guidelines，后者按[本轮读取的官方规范](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)检查新增范围。

| Before | After | Why |
| --- | --- | --- |
| Dock逐帧JS位移受初始化阻塞 | 相同弹簧采样由WAAPI执行，打断时读当前姿态和速度 | 保留已接受手感并让合成线程推进位移 |
| 原菜单只从左侧/底部固定出现 | 三边锚定、180ms既有strong ease-out；键盘即时 | 菜单空间关系与Dock位置一致 |
| 搜索中的无路由动作会重新打开搜索，旧微任务可抢焦点 | 展开导航命令结束搜索，微任务核对当前打开/销毁状态 | 快速操作后焦点属于实际目的控件 |
| 拖动为唯一换边方式、隐藏导航不可聚焦 | 同一菜单三边单选、抓手方向键、聚焦时的展开入口/搜索命令 | 键盘和触屏都有可达替代路径 |
| 减动切换可能保留转向尾部动画 | 环境与手动偏好均终止位移/转向，系统中途切换实测通过 | 系统/应用减动偏好即时生效 |

**Approve（I5新增Dock范围）**：只为直接操纵和空间连续性运动，主位移transform/opacity、转向FLIP、既有材质/tokens；可反向、可取消、晚到完成守卫、键盘即时和减动均覆盖。弹簧尾部允许超过300ms以保持物理归位，菜单保持180ms。静态复核位置：`edge-dock.js`的采样/中断/销毁与偏好处理，`app-shell.js`的搜索/菜单/键盘隔离，`atria-edge-dock.css`的安全区/fine-pointer/减动及命中范围。没有残留本轮阻断项。

microinteractions：触发状态、规则、立即反馈、反馈适度、模式与首次可操作6项具代表证据；桌面边缘触发完全隐藏是已确定取舍，虽有键盘/搜索替代但不计完整可发现性通过，长期提示学习仍无证据，保持6/8、8/10，不声称全局10/10。

### I5 集成与限制

已核对独立main工作树干净且远端无新增提交，fast-forward集成产品并推送 `main@60aca6957`，本地/远端HEAD一致。docs独立保存方案、接受快照与本Record，未合入main；其他任务未跟踪企划保持。位置按本次Shell使用分别记忆，未加入未经讨论的跨会话持久化。真实iOS/Android边缘返回/Home手势、硬件软键盘、安全区硬件与不同GPU仍没有实机证据；模拟视口与浏览器触摸不能冒充这些。原型证据只证明设计演示，本节产品证据来自实际产品模块和服务；没有扩大为全量业务或真实模型质量验收。
