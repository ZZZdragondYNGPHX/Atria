# Atria Serene Canvas — Implementation Record

- Task ID: `refactor/atria-serene-canvas`
- Primary Workspace: 产品源码；方案与结果归 `docs`。
- Plan: [index.md](../../plans/refactor/atria-serene-canvas/index.md)
- Status: In progress

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
