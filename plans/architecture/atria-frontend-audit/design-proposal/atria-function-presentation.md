# Atria 全功能界面与交互表现文档

> **性质：讨论输入**。这份文档不是产品合同、冻结设计或实施授权。它把 [前端审计](../index.md) 的 189 个功能组逐项映射到建议的页面、入口、控件、状态与三端表现，配合 [`atria-visual-direction.html`](atria-visual-direction.html)（视觉参考）与 [`atria-frontend-guidelines.md`](atria-frontend-guidelines.md)（设计指导）一起阅读。
>
> 审计中的「接通」只是源码静态证据，所有运行验收都是 **NOT_RUN**。本文沿用审计原有的状态词，不把 mockup、演示交互或任意后端 class 写成已完成的产品能力。凡是改变产品能力或信息架构的内容，都标为 **P-xx 提案**，等用户决定。

## 0. 阅读约定

| 列 | 含义 |
| --- | --- |
| **审计功能 ID** | 来自四份清单：G/L/K/P/Y（[surface](../surface-inventory.md)）、S/A/Q/R（[authoring-runtime](../authoring-runtime-inventory.md)）、O/M/E/X/V/H（[agents-extensions-media](../agents-extensions-media-inventory.md)）、T/U/B/C/D（[settings-storage-diagnostics](../settings-storage-diagnostics-inventory.md)） |
| **当前能力／实现状态** | 原清单的状态词：接通、部分、设计、旧／待清退、UNKNOWN、条件。不升级，不降级 |
| **建议位置** | 用 `›` 表示发现路径，例如 `书库 › 作品 › 详情 › 入口`。域名采用 P-01 的中文标签，英文原名放在括号里 |
| **状态／权限／恢复** | 只写该功能自己领域的状态和合法出路；通用状态的画法见 §4 和 HTML「03 状态协议」 |
| **桌面／手机** | `D` 指 expanded ≥1180，`M` 指 compact ≤719；medium 按 D 的布局叠加抽屉。两端写法可以不同，能做的事必须相同 |
| **HTML** | `01·故事`、`01·书库` 等指 HTML「01 产品演示」里的六个视图；`02·A`–`02·E` 指「02 手机」的五台演示机；`仅文档` 表示 HTML 没有画，**能力照样要实现** |
| **提案** | `—` 表示只是现状能力的新表现；`P-xx` 是需要用户决定的产品／IA 变更；`待确认` 是审计本身标为 UNKNOWN 或需产品讨论的项 |

HTML 只画了代表性样例，不能用来定义产品范围。HTML 里没出现的能力，不构成删除授权。

## 1. 信息架构

### 1.1 建议的页面树

现有五个域和 utility 的划分保持不变，只调整命名、分组和少量入口位置（每一处都在 §7 列出）。

```text
登录（独立页；账户功能开启时）  G07 G09
└─ Atria Shell  ─ 导航轨 / 底栏 G01 G10 · 搜索与命令 G03 · 全局菜单 G04 · 公告 D05
   ├─ 故事 Play                         #/play
   │  ├─ 故事首页：当前阅读 · 最近故事                Y01
   │  └─ 会话                          #/play/session/{sessionId}
   │     ├─ 舞台：默认 / Work text·component·hybrid·full   Y02 Y04 G08
   │     │   └─ 宿主门（作品接管时常驻）：退出作品界面 · 停止 · 保存 · Persona · 诊断 · 重载表现   G08 · P-04
   │     ├─ Composer：Persona · 输入 · 发送/停止 · 插图 · 朗读   Y03 P03 V01 V12
   │     ├─ Inspector：历史与存档 · 上下文 · Prompt 选项 · 健康   Y05–Y11 Y13
   │     └─ 更多：共享会话 · 快速保存 · 载入 · 导出 .atriasave · 重载作品界面   H01–H04 Y06 Y07
   ├─ 书库 Library                      #/library/{child}
   │  ├─ 作品 → 作品详情（版本 · 入口 · 资源与权限 · 管理）   L01–L05 L09
   │  │   └─ 流程层：安装 .atria · 导入 .atriasave · 任务槽位设置 · World/Knowledge 设置   L02 L07 L08 Y07
   │  ├─ 我的故事                                           L06 K10
   │  ├─ World 与 Knowledge → 资源详情 → 修订 / Used By / Binding   K01–K11
   │  ├─ Prompt 预设 → Program · Modules · Generation · Regex · 通用资源   Q01–Q09
   │  └─ Persona                                            P01 P02 (P04 待清退)
   ├─ 工坊 Studio（内部 domain = build）  #/studio/{projectId}/{view}
   │  ├─ 项目列表                                          S01 S22
   │  └─ 项目：资源树（20 视图 + 插件资源） · 编辑器 · Inspector · Project Agent · Activity
   │        S02–S21 A01–A04 Q10 Q11 Q12(设计)
   ├─ 智能体 Agents                      #/agents/{child}
   │  ├─ Memory：概览 · 知识 · 来源 · 维护                   M01–M08
   │  ├─ 目标与反馈：Goals · Feedback · Eval · 发布           E01–E07 · P-03
   │  ├─ 运行观察 Run（现为旧投影 → V3 Host 投影）             O06 O08 O09
   │  ├─ 编排 Plan（V3 目标；旧 Orchestration 待清退）          O02–O05 O08 O09
   │  └─ 诊断与回放                                          O07
   ├─ 运行 Runtime                      #/runtime/{child}
   │  ├─ 就绪 · Routes · Models · Connections · Retrieval · 外部服务 · 诊断（编译预览）
   │  │   R01–R14
   └─ 全局 utility（菜单 + 命令面板都能到）
      ├─ 学习中心 G05 · 扩展（Skills / Plugins） X01–X12
      ├─ 设置（六类） T01–T10 · 账户与备份 U01–U04 B01–B08
      ├─ 存储中心 C01–C10 · P-02
      └─ 诊断 D01–D04 · 公告 D05
```

Agents 域的旧载体（O01–O05 的旧 preset、mode、绑定、Run Panel）是正式确认要清退的合同，见 [组件与架构问题](../component-and-architecture-findings.md) 的四类处置。它们出现在树里，只是因为现在仍在运行，并且要由 V3 原生能力接替后才能删除；新 UI **不**为它们设计长期位置。

### 1.2 导航、搜索、深链与返回

| 机制 | 建议表现 | 约束 |
| --- | --- | --- |
| 五域切换 G01 | D：左侧 72px 导航轨（图标 + 中文标签）；M：底部五域栏。当前域用实心标记与 `aria-current=page` | 离开有未保存稿时由 leave-guard 拦截；异步激活 token 拒绝旧响应 |
| 边缘导航 G10 | 保留 Show/Hide、grip、Left/Right/Bottom 位置与 ArrowLeft/Right/Down。HTML 的导航轨是常驻形态；edge-dock 作为用户可选的沉浸形态 | 不能只靠边缘悬停或长按才发现五域；键盘焦点在导航上时不自动隐藏；软键盘开启时暂时隐藏 |
| 搜索与命令 G03 | `Ctrl/⌘ K`，D 是居中面板，M 是全屏 Sheet。结果按来源分组：命令、作品、故事、项目、World、Knowledge、Prompt。某个来源失败时只在该组显示「重试」 | IME 组合中不选择；Arrow/Home/End/Enter/Escape；Search Tools（X11）是模型工具，不是这个搜索 |
| 深链 | `#/{domain}/{child}/{id}?rev={exact}`；HTML 演示用 `#/app/{domain}` 和 `#/{scene}` | URL 只表示位置，不是授权；打开时由原服务复验权限、revision 和 scope。preset detail、扩展子标签、Inspector 选择目前不可深链（AR16），见 P-05 |
| 返回 | 顶栏 Back 和 Android Back 用同一个层栈（§6.3）：先关临时层，再返回域内子页，再走 Atria 历史 | 一次 Back 只消费一层；焦点归还给触发器；生成中按 Back 不默认取消（P-11） |
| 修复往返 R14/L07 | 从「缺 Route」跳到运行域时带一条修复横幅：「你正在为《雾港十三夜·线索整理》配置模型，完成后返回原操作」 | 回来后重新 preflight，并恢复原草稿和原操作；不把刷新当作修复已提交 |

### 1.3 首次使用和空状态

- **无账户或本地账户**：直接进入「故事」首页。没有作品时显示两个真实入口：「安装 .atria」和「导入存档」，外加学习中心的「从零开始」课程。不生成样例作品或模型（G05）。
- **账户开启**：先进独立登录页（G07）。注册、OAuth 和找回密码只在服务器配置开启时出现（G09）。

## 2. 全局交互规约

这一节是所有功能共用的控件语义。每个功能行只写自己特有的部分。

### 2.1 控件

| 控件 | 用法 | 触发／保存范围 |
| --- | --- | --- |
| 主按钮（金色） | 每屏最多一个，用于当前任务的主意图（保存修订、应用 ChangeSet、批准并提交、开始新故事） | 文案按后果命名，见 HTML 03.3 |
| 次要／幽灵／链接式按钮 | 其它动作；链接式按钮用于跳转到另一个业务页（「去配置」「打开」） | 跳转用真正的 link 语义，支持新标签打开（AR19） |
| 危险按钮 | 描边红色只出现在第一步；实心红只出现在最终的二次确认 | 不可逆操作必须有显式勾选，默认否定（C10） |
| 停止 | 中性按压色，不用红色 | Stop 是请求，不是撤销 |
| 字段 | 标签在上，提示在下；错误写在字段下方并说明原因；必填用 `*` | 草稿标记是左侧青色短竖线，配合「未保存」印记 |
| 只读字段 | 虚线边框，不用灰底禁用态；旁边说明为什么只读和合法出路 | 原件、历史、无权限三种原因分别写 |
| 分段控件 | 互斥视图切换（字段／Source、时间线／图） | 切换不丢草稿 |
| 开关 | 只用于立即生效的偏好（Recall、Reduce motion） | 需要审查的同意一律用复选框 |
| 复选框（同意） | 费用、外发、降级、凭证目的地、永久删除 | **从不预选**；只对当前任务有效；任务或 target 变化后失效 |
| 菜单 | 溢出动作，按键盘 Arrow/Home/End 导航，点外部关闭 | 危险项放在分隔线之后，并用红色字 |
| 对话框 | 有限范围的决定：切换分支、Persona、安装、Review、审批、永久删除 | Tab 圈定；Escape 只关这一层；M 上变成全屏层 |
| Sheet | M 上的 Inspector、命令面板和细节抽屉；三档（低／半屏／全屏） | grip 是 `role=slider`，可拖、可点、可方向键；`pointercancel` 回到最近档位 |
| Inspector | D 上的右侧 Dock（368px），可固定或关闭；没有内容时不显示开关 | 关闭后焦点回到开关；在 Play 里与历史／上下文／选项／健康共用 |
| Toast | 只用于短暂确认与非阻断信息，`role=status`；失败用 `role=alert` | 不能用 toast 承载需要操作的错误；错误放在发生的位置 |
| 横幅 | 区块级状态，必须写「原因 + 合法出路」 | 例：缺 Route → 去配置；原件只读 → Fork |
| 印记／状态片／回执 | 见指导文档 §4 的「账本语法」 | 回执表示已经发生，刷新失败也不撤销 |

### 2.2 快捷键

| 键 | 作用域 | 说明 |
| --- | --- | --- |
| `Ctrl/⌘ K` | 全局 | 搜索与命令 |
| `Enter` / `Ctrl/⌘ Enter` / `Shift Enter` | Composer | 由 T05 的 Send on Enter 决定：auto 或 Control-Enter 模式下普通 Enter 换行，启用 plain Enter 时 Enter 发送。IME 组合中（`isComposing` / keyCode 229）一律不发送 |
| `Ctrl/⌘ S` | Skill 文件编辑器（X04） | **只**在这里；不推广成所有页的通用保存键 |
| `Ctrl/⌘ Z` / `Shift Z` | Mask 画布（V10） | 只撤销遮罩命令；文本框里是浏览器原生撤销 |
| `Escape` | 当前最上层 | IME 组合中不关层；一次只关一层 |
| `↑` `↓` `Enter` `Space` | Sheet grip | 换档 |
| `←` `→` `↓` | 边缘导航 grip（G10） | 换位置和显隐 |
| `Ctrl+Alt+Shift+R` | 全局 | 临时抑制自定义主题 CSS（T04），不删原文 |

建议（未冻结）：Studio 的「审阅变更」可以加一个快捷键，但它只打开 Review，不直接 Apply。

### 2.3 写入的通用顺序

所有写操作都遵守同一个顺序，各领域只替换具体的服务和回执：

1. **编辑**：草稿留在本地，带基线 revision。
2. **审查**：显示要改什么、基于哪个 exact revision、影响哪些消费者。
3. **提交**：busy 防重入，字段锁定。
4. **回执**：以原服务的回执为准，显示新 revision 或 id。
5. **刷新**：刷新失败时只给「重读／打开」，不再给「提交」。
6. **冲突**（409/CAS）：保留草稿，显示新的 revision，对比后重新审查。

Studio（S04）、Library 修订（K03–K07）、Persona（P02）、Prompt（Q08）、Runtime（R01）、Skills（X04）和 Media（V02/V09）都套用这个顺序。

## 3. 功能映射表（189 项）

表头沿用委托说明的格式。「当前能力／实现状态」抄录原清单的状态词。「状态／权限／恢复」只写该功能特有的部分。

### 3.1 全局与认证（G01–G10）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| G01 | 五域导航与当前域标记；接通／保留 | Shell 导航轨：故事、书库、工坊、智能体、运行；Studio 有未审变更时显示一个圆点徽标 | 离开 dirty 页先拦截；child 与主域分开记忆；旧 mount 先释放 | D：左侧导航轨，图标加中文标签；M：底部五域栏，utility 进「更多」 | 01·全部视图 | P-01 中文标签 |
| G02 | 标题、breadcrumb、Back、Inspector 开关；接通／整合 | 每个域的顶栏：面包屑 + 当前对象的印记（rev/实时）+ 域工具栏 + Inspector 开关 | 没有 Inspector 内容时不显示开关；Back 先处理临时层；焦点归还 | D：面包屑完整；M：只显示上一级 + 标题，Inspector 变成三档 Sheet | 01·故事 / 工坊；02·B | — |
| G03 | 搜索／Command，多来源结果；接通／保留 | 导航轨的搜索按钮、全局菜单第一项、`Ctrl/⌘ K` | 来源分组，部分失败的组单独「重试」；无结果给清除 query；IME 保护 | D：居中面板；M：全屏 Sheet，输入框贴在键盘上方 | 01·命令面板 | — |
| G04 | 全局菜单：Learning/Diagnostics/Extensions/Settings/Account；接通／整合 | 导航轨底部的「更多」网格按钮，打开 utility 菜单；菜单项带次要提示（如「可安全清理 1.2 GB」「1 条未读」） | 权限仍由原服务判断；菜单里的数字没有来源时不显示 | D：弹出菜单；M：底栏「更多」打开全屏列表，不能只在桌面出现 | 01·全局菜单 | P-02（新增「存储中心」项） |
| G05 | 学习中心课程、Resume/Back/Next/Skip/Done/Redo；接通／保留 | utility › 学习中心；首次空库页加「从零开始」；空状态卡片可以链接到相关课程 | 课程只带用户去真实页面；browser storage 不可用时课程进度不保存，不阻断产品 | D：右侧引导浮层；M：底部 Sheet，可以收起到一条进度条 | 仅文档（菜单入口有） | — |
| G06 | Loading/empty/error/retry 与未保存离开确认；接通／整合 | 统一状态组件：空、加载、部分失败、错误 + 重试；离开确认对话框写出「未保存：N 处」 | guard 取消后留在原处；refresh 失败不撤销回执；旧响应不覆盖新页 | 两端相同；M 上的离开确认是全屏层 | 03·01–03、07 | — |
| G07 | 登录：账户列表、handle/password、Sign in；接通/条件／保留 | 独立登录页：账户卡片列表 → 密码 → 登录；失败信息写在表单内 | 鉴权失败保留可重试入口；密码永远不进诊断材料；CSRF 或连接失败分开提示 | 单栏居中；M 上账户卡片纵向排列，输入框不被键盘遮挡 | 仅文档 | — |
| G09 | 条件注册、找回密码、OAuth、返回登录；接通/条件／保留 | 登录页次级链接，只在服务器开启时出现 | 注册关闭、discreet login、错误 code、密码不一致、连接失败各自提示；OAuth 提供方以服务器返回为准 | 同 G07 | 仅文档 | — |
| G08 | 作者作品 UI：host surface、drawer/modal、full/hybrid Stage、恢复菜单；接通/条件／保留 | 故事 › 会话 › 舞台。作品可以占据 slot（`app.root` `chat.header` `chat.footer` `composer.before` `composer.after`）或接管整个舞台；宿主门是一个固定在舞台角落的小按钮，展开后是：退出作品界面、停止、保存、Persona、诊断、重载表现 | Work 拿不到 raw Host 写权限；作品界面故障时宿主门依然可用；重载只重挂作品界面，不影响故事、存档和生成任务 | D：舞台右上角；M：顶栏右侧，且不被作品 UI 覆盖；作品界面自己的控件尺寸由作品决定，宿主门固定 44px 触控区 | 01·故事（宿主门菜单）；04·作品边界 | P-04 宿主门形态 |
| G10 | Edge navigation：显隐、grip、拖动/长按、位置菜单、键盘；接通／保留 | 设置 › 阅读与输入 ›「沉浸导航」开启后，导航轨收进屏幕边缘；命令面板里有「显示导航」 | 键盘焦点在导航时不自动隐藏；软键盘开启时暂隐；pointercancel/Escape 有出口 | D：左/右边缘 grip；M：底部 grip，向上拖出五域栏 | 仅文档 | 待确认：默认常驻还是默认边缘 |

### 3.2 书库：作品、安装和进度（L01–L09）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| L01 | Works 搜索、Open、Install/Update、Import Save、My Games；接通／保留 | 书库 › 作品：顶部是「继续阅读」卡片（最近 3 个精确 Session），下面是作品书架；工具栏有搜索、「安装 .atria」、「导入存档」 | Works 和 Games 分别加载、分别失败；空库只给安装和导入；缺精确版本的「继续」禁用并写出原因 | D：书架网格 + 右侧详情抽屉；M：单列书架，详情变成全屏页 | 01·书库 | — |
| L02 | `.atria` 选择、权限复选、Details、Install/Update、Review again、Cancel；接通／保留 | 书库 › 作品 › 安装（对话框流程）：选文件 → 预检卡片（包身份、版本、和已安装版本的差异）→ 必需权限复选 → 安装 | 上限 128 MiB；必需权限未全选时「安装」禁用并计数；安装回执和「打开作品」分成两步，打开失败不重装；Cancel 不伪造撤销已完成的安装 | D：宽对话框；M：全屏层，权限列表可滚动，主按钮固定在拇指区 | 01·书库（安装对话框） | — |
| L03 | Work 详情：entrypoint、Session title、Start New、Continue；接通／保留 | 书库 › 作品 › 详情 › 入口区：入口单选卡片、故事标题输入框、「开始新故事」；「继续」在顶部的已有故事列表里 | 作品未 ready 或没有入口时禁用并写出原因；缺任务 Route 时点「开始」先打开任务槽位设置（L07）；已创建的 Session 重试时只打开原 Session | D：右侧详情抽屉；M：全屏详情页，入口卡片纵向排列 | 01·书库 | — |
| L04 | 已安装版本：Details、Start from this version、Create Session on this version；接通／保留 | 书库 › 作品 › 详情 › 已安装版本：每个版本一行，有「从此版本开始…」 | 明确标出「非默认版本」；不切换 Work 的默认版本；创建成功后锁定字段防重复 | 同 L03；M 上版本列表折叠 | 01·书库（版本行） | — |
| L05 | Review dependent Sessions、Delete Work；接通／重组 | 书库 › 作品 › 详情 › 管理（分隔线后的危险区）：「查看依赖的故事」「删除作品…」 | 有 Session 时删除被阻断，并列出精确的 Session 和跳转；建议先导出 .atriasave；删除不是隐式 GC | 两端相同，M 上阻碍列表用全屏层 | 01·书库（阻断提示） | — |
| L06 | My Games：Continue、Manage、Rename、Worlds & Knowledge、Export、Delete；接通／整合 | 书库 › 我的故事：故事卡片列表，每张卡片一个溢出菜单（重命名、World 与 Knowledge、导出 .atriasave、删除…） | 重命名带 expectedDisplayTitle；删除会同时删 SavePoint，单独确认；缺版本时继续和导出按现有条件禁用，依赖详情仍可读 | D：列表 + 右侧详情；M：卡片列表，操作走溢出菜单 | 仅文档（书库标签存在） | — |
| L07 | task model setup：slot→Route、Configure Runtime、Refresh、Save and continue、Cancel；接通／保留 | 由 L03/L04/Y01「开始/继续」触发的对话框：每个 slot 一行（用途、需要的能力、Route 下拉）；「没有合适的 Route？去运行域配置」 | 不跳过缺失能力；保存绑定不等于已生成；从运行域回来时恢复原草稿和原操作，并重新验证 | D：对话框；M：全屏层，「去配置」跳到运行域后顶部有修复横幅 | 01·书库；01·运行（修复横幅） | — |
| L08 | Work/Session 的 World/Knowledge setup：exact selection；接通／保留 | 书库 › 作品 › 详情 › 资源与权限 ›「World 与 Knowledge」；我的故事 › 菜单 › 同名项 | 先说明作用范围（每作品 or 每故事）；作品原件和书库副本分开显示；缺失的引用要修，不自动换成 latest | D：对话框，左侧 scope、右侧 exact 选择器；M：全屏两步流程 | 仅文档 | — |
| L09 | Work 权限/Package resources、Game Regex、知识覆盖；接通/条件／重组 | 书库 › 作品 › 详情 › 资源与权限：权限声明和当前 grant、只读的包内资源、合法的 override | 改表现不扩大 grant；包原件不能直接覆盖；每作品和每故事分开标注 | D：详情抽屉里的分组；M：详情页的折叠分组 | 01·书库（入口行） | — |

### 3.3 书库：World、Knowledge、绑定与修订（K01–K11）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| K01 | 类型切换、名称创建、搜索、Open；接通／保留 | 书库 › World 与 Knowledge：顶部分段（World / Knowledge）、搜索、「新建」 | name 必填；列表刷新失败也保留已创建的结果；World 不是旧 World Info | D：左列表 + 右详情；M：列表 → 详情两页 | 01·书库 | — |
| K02 | Resource bundle 导入、预检、Export、Copy to Library；接通／保留 | 列表工具栏「导入资源包」「导出」；包内资源详情页有「复制到书库」 | 缺依赖和同身份冲突在预检里列出；复制会形成独立身份 | 两端相同，预检在 M 上用全屏层 | 01·书库（工具栏） | — |
| K03 | World：名称、typed 字段、Add/Remove field、Source、Review Changes；接通／保留 | World 详情 › 编辑：分段「字段 / Source」；字段行带类型选择器和移除按钮；底部「审阅变更」 | 禁止危险属性名和重复字段；JSON 或类型错误留在草稿里；新修订不迁移已有消费者 | D：两栏字段表；M：单列，类型选择器用原生 select；Source 用全宽等宽文本框 | 01·书库（World 编辑） | — |
| K04 | Knowledge 条目：搜索/过滤/分页、详情、Add/Edit/Enable/Delete；接通／保留 | Knowledge 详情 › 条目：表格（D）/卡片（M），操作会进入新修订草稿 | 空库和无匹配分开；删除要确认；已有绑定保持原 exact revision | D：虚拟化表格 + 右侧条目编辑；M：卡片列表 → 条目全屏页 | 仅文档 | — |
| K05 | Knowledge 字段：title/content、关键词、状态条件、关系、delivery/budget；接通／保留 | 条目编辑器分组：内容 · 发现 · 条件（all/any + 条件行）· 关系 · 投递与预算；分段「字段 / Source」 | 条件数量与类型校验；提交时整体 validate；提交中表单 inert；失败后原稿还在 | D：分组卡片；M：分组折叠，条件行用纵向小表单 | 仅文档 | — |
| K06 | Binding：exact revision、target/visibility、augment/override、priority、Used By、Attach/Detach Worlds；接通／重组 | Knowledge 详情 › 绑定：列表 + 绑定编辑对话框；World 附加单独走 World 修订 | 绑定、条目编辑、World Truth、Memory 纠错四者分开；被历史 World 引用也不能删；引用行可以跳到 World 或 Studio | D：对话框；M：全屏层 | 仅文档 | — |
| K07 | 修订历史：查看 exact、对比、promote、fork、Used By；接通／保留 | 资源详情 › 修订：时间线列表，当前修订用实心印记，历史用斜纹印记；每行「检视」「对比」「设为当前…」「Fork…」 | promote 只移动 Library head，不改历史内容；失败后重载 | D：右侧时间线；M：修订标签页 | 01·书库（对比、删除、Fork） | — |
| K08 | 名称更新、删除、反向引用修复；接通／保留 | 资源详情 › 溢出菜单 ›「删除…」→ 阻碍对话框，列出消费者和跳转 | 不静默 detach，不级联；确认后服务端再查一次；失败时资源还在 | 两端相同 | 03·10 | — |
| K09 | Package 原件：详情、exact、Fork/Copy、Used By；接通／保留 | 原件详情顶部有一条历史色横幅：「作品包原件，只读」+「Fork 到书库…」 | 只读要写清原因，不能只放一个灰掉的保存；说明复制之后谁会用新副本 | 两端相同 | 03·09 | — |
| K10 | Session embedded knowledge 晋升；接通/条件／重组 | 我的故事 › 菜单 ›「整理故事知识…」；故事 Inspector › 上下文里的条目也可以发起 | 显式晋升；复验当前 Session 和 revision；模型推测不能直接成为世界事实 | D：对话框，左边是选中的数据，右边是目标；M：两步全屏 | 仅文档 | — |
| K11 | 修订详情：Export exact、Delete unused、compare、Create revision from this、fork；接通／保留 | 修订行的溢出菜单 | 只能删除更早且没有引用的修订；current 不能当成 unused 删除；fork 后跳转失败不重建同一身份 | 同 K07 | 01·书库（部分） | — |

### 3.4 Persona（P01–P04）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| P01 | 列表：搜索、创建、查看 archived、Load more、Open；接通／保留 | 书库 › Persona：头像卡片网格；过滤「已归档」 | 无匹配、空库、加载失败三种反馈分开 | D：网格 + 详情；M：两列卡片 → 详情页 | 仅文档 | — |
| P02 | 名称、描述、头像、Save revision、Duplicate、Archive、Default、Used By、删除；接通／保留 | Persona 详情：头像、名称、描述（原文保留的长文本框）；溢出菜单：复制、设为默认、归档、删除… | revision/CAS；默认值只影响新故事，不改写已有 Session；归档不是物理删除；删除前查引用 | D：两栏；M：单列，描述框全宽 | 03·06（保存中示例） | — |
| P03 | Play Persona 对话框：No Persona、搜索、选 exact、snapshot、Cancel、Reload Session；接通／保留 | 故事 › Composer 左侧的 Persona 头像按钮 → 对话框 | 写入带 expectedRevisionId；冲突时要求重载 Session，不把选择套到别的 Session；Tab 圈定，焦点归还 | D：对话框；M：全屏层，列表可搜索 | 01·故事（Persona 对话框）；02·A | — |
| P04 | 旧 persona 迁移 / adopt-default；旧/条件／废弃兼容流程 | **不设计新入口**。原生 Persona 本体保留 | 零 ST 兼容；由真实 consumer 确认后清退 | — | — | 确认废弃（审计） |

### 3.5 故事：阅读、生成、历史与存档（Y01–Y13）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| Y01 | Play 首页 / 最近故事：Browse Library、Import save、Continue、Open Work；接通／保留 | 故事首页：「继续阅读」大卡（最后一次的 exact Session）+ 最近故事列表；空时给「去书库」「导入存档」 | 本地 last-reading 只用于定位，不是会话真相；exact Work 缺失时禁用继续并给修复入口；不自动创建替代故事 | D：大卡 + 列表；M：大卡全宽，列表在下面 | 部分（01·书库的「继续阅读」卡片使用同一组件） | — |
| Y02 | 标题、Work/version、Live/History/Recovery/ended、Timeline；接通／保留 | 故事 › 会话 › 顶栏：面包屑 + 状态片（实时／历史预览／恢复中／已结束）+ 版本印记；舞台是衬线长文 | History 只读，Composer 写明原因；failed 显示「重新加载」；dead 不能输入；找不到状态时不伪装成 live | D：36em 版心居中；M：16px 字号、两侧 20px 边距 | 01·故事；02·A | — |
| Y03 | Composer：文本、Send/Stop、Enter/Ctrl+Enter；接通／保留 | Composer：Persona 头像 · 多行输入 · 插图 · 朗读 · 发送；生成中发送按钮变成「停止」 | busy 防重入；IME 组合中不发送；只恢复**未被接受**的输入，已提交的用户 Turn 不重发；错误给 Runtime 修复链接 | D：浮在舞台底部；M：贴在软键盘上方，停止始终可见 | 01·故事；02·A | — |
| Y04 | Jump to latest、向上阅读、长时间线窗口；接通／保留 | 用户向上阅读时，新内容出现在底部，并显示「回到最新」胶囊 | 不强拉到底；换 Session 或分支时清窗口；过期页丢弃 | 两端相同；M 上胶囊在 Composer 之上 | 01·故事；02·A | — |
| Y05 | Toolbar：History & saves、Context、Prompt choices、Save、More；接通／整合 | 会话顶栏右侧：历史与存档、上下文、Prompt 选项、保存、更多；这几项也是 Inspector 的四个标签 | 保存和切换在 busy、生成中、历史预览、失败、结束时按可写性禁用；离开页面不等于取消服务器任务 | D：顶栏按钮 + 右侧 Dock；M：顶栏只留「保存」和「更多」，Inspector 走 Sheet | 01·故事；02·B | — |
| Y06 | Save、Quick Save、保存名、自动保存 enabled/interval/retain；接通／保留 | Inspector › 历史与存档：主按钮「保存当前进度」+「快速保存」；自动保存设置行（每 N 回合，保留 M 个）；说明自动保存不是账户 ZIP 备份 | 成功后显示回执（rev、T 序号）；失败不显示「已保存」 | D：Dock；M：Sheet 半屏 | 01·故事；02·B | — |
| Y07 | 存档 Load/Export、`.atriasave` 导出与导入（密码、Review）；接通／保留 | 存档行的「载入」「导出」；更多 ›「导出 .atriasave」；书库 ›「导入存档」 | 上限 64 MiB；导入前和导入时各做一次依赖预检；缺 Work 可以按 exact 依赖安装；密码错误时保留文件；导入成功但打开失败时不再导入 | 两端相同，导入流程在 M 上用全屏层 | 01·故事（导出、载入入口） | — |
| Y08 | History：Find branch、Show archived、分页、Explore/All/Current、Rename/Archive；接通／保留 | Inspector › 历史与存档 › 分支：分支线图（当前实心，其它空心）+ 每行「预览」「重命名」；底部「查找分支 · 显示已归档 · 共 N」 | 能看不等于能切；显示 incomplete history；损坏的 exact 目标禁用写操作，当前分支不变 | D：Dock；M：Sheet 全屏 | 01·故事；02·B | — |
| Y09 | Preview/Inspect revision、Switch branch、Return to current；接通/条件／保留原生，废弃旧 swipe | 「预览」进入只读预览（舞台变成历史斜纹、Composer 写明「历史预览为只读」）→ 横幅里有「切换到此分支…」和「返回当前故事」；切换走确认对话框 | Preview 只读；Switch 是真实写入，忙碌、历史、过期时禁用；**不画 swipe/regenerate** | 两端相同 | 01·故事（预览 + 切换对话框）；02·B | — |
| Y10 | Context Inspector：已纳入/排除、预算、来源；接通/部分／保留 | Inspector › 上下文：标题写明「证据来自最近一次真实生成 · T41」；预算条（已纳入、排除、余量）；来源列表 | 没生成过就显示「暂无证据」；不显示 Actor 的私有思维或 Secret；hash 不是授权或缓存命中；未知值写 UNKNOWN | D：Dock；M：Sheet | 01·故事 | — |
| Y11 | Prompt choices：动态字段、Save overrides、Restore defaults；接通／保留 | Inspector › Prompt 选项：按 exact Program 的参数声明渲染字段；底部「保存为本故事选项」「恢复默认」 | 没有 Route、未知选项、缺必填字段时给修复；不写书库 Program，也不算发布新版本（见 HTML 03.3 易混动作） | D：Dock；M：Sheet | 01·故事 | — |
| Y12 | Experience health、Shared session、条件朗读、插图工具；接通/条件／保留 | 健康：Inspector 第四个标签；共享会话：更多菜单；朗读：段落操作和 Composer；插图：段落操作「选文插图」和 Composer「插图」 | 条件不满足时不显示常驻入口；不是每个 Work 都支持语音、共享或插图 | D：段落悬停时显示操作；M：长按段落弹出操作条 | 01·故事 | — |
| Y13 | Experience health：Refresh、Retry、Open Diagnostics、Check Task bindings、Preview/Confirm repair；接通/条件／保留 | Inspector › 健康：能力列表（required 阻断 vs optional 降级）、诊断链接、「预览修复」→ 修复提案 →「确认修复」 | active/revision 复验；source 变化后要重新预览；恢复 Session 不回卷 Player/Realm | D：Dock；M：Sheet 全屏 | 01·故事（健康标签，有计数） | — |

### 3.6 工坊：项目与通用编辑链（S01–S15）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| S01 | 项目列表：name、Create、Search、Open、Delete；接通／保留 | 工坊首页：项目卡片（名称、package 版本、最近修订、未审变更数）；「新建项目」；溢出菜单「删除项目…」→ S22 | 空名校验；空列表、加载失败分别显示并可重试；删除的 exact revision 过期时要重新审查 | D：卡片网格；M：列表 | 01·工坊（项目切换器） | — |
| S02 | Resource tree：Filter、20 视图、Source file、动态插件资源；Compact 五段；接通／重组 | 工坊 › 项目 › 资源树，分四组：项目（概览、体验模式、包元数据）、内容（角色、入口、World、Knowledge、Library 引用）、叙事与运行（Prompt 编排、运行需求、游戏逻辑、Memory、Agents 源、Skills、Plugins）、表现（作品界面 UI、Assets、Source 文件）；每个节点带草稿数和问题数 | 每个视图保留自己的草稿、滚动和选择；支持数据读取失败时节点显示「部分」并可重试 | D：左侧 264px 树；M：「项目」分段 + 顶部过滤框 | 01·工坊；02·C | 视图分组方式未冻结 |
| S03 | 顶部 Validate、Preview、Simulate、Inspector、Build、AI；接通／整合 | 项目顶栏：校验、预览、模拟、构建分成一组；Inspector 和 AI 是面板开关；最右边是主按钮「审阅变更 N」 | 按钮可点不代表项目已通过；执行结果进 Activity | D：顶栏；M：校验、模拟、构建放进「更多」分段，审阅变更是常驻底条 | 01·工坊；02·C | — |
| S04 | Review Changes → Changes → Apply ChangeSet；Cancel；接通／保留 | 「审阅变更」对话框：左边是操作列表（`source.write` / `project.save`…），右边是逐条 diff，底部是校验和模拟摘要，以及「应用 ChangeSet → rev 新」 | inspecting/applying 防重入；校验失败回滚；409 保留冲突草稿；已提交但刷新失败时显示回执，不能再次应用 | D：宽对话框；M：全屏层，diff 逐条折叠 | 01·工坊（Review 对话框）；02·C；03·07–08 | — |
| S05 | Activity：Problems、Output、History、Changes；Reload Latest、Copy draft；接通／保留 | 编辑区底部的可折叠面板，标签：变更、问题、输出、历史；「复制草稿」 | 大输出截断时写明；「重读最新」会重设基线，所以先走 guard；历史不是 Undo | D：底部抽屉；M：「更多」分段里的列表 | 01·工坊 | — |
| S06 | Inspector：resource/graph node、exact refs、dependencies；接通／整合 | 右侧 Inspector：选中资源的 exact 引用、正向依赖、Used By；可以和 Project Agent 面板切换 | 某部分读取失败时显示「部分」，不显示「无依赖」；不另存第二份 Project/World | D：右侧 Dock；M：「更多」→ Inspector 全屏 | 01·工坊 | — |
| S07 | Overview：display name、package name/version、Review；接通／保留 | 资源树 › 概览：表单 | 输入不等于保存；Review 之后还要 Apply；版本格式错误先修 | 两端单列表单 | 仅文档 | — |
| S08 | Experience：text/component/hybrid/full、Frontend source index、Runtime features JSON；接通／保留 | 资源树 › 体验模式：四张模式卡片（说明作品对舞台的所有权），下面是 source index 和 features JSON | 改的是布局所有权，不推导新权限；错误留在草稿 | 两端相同；M 上卡片纵向 | 仅文档（树节点显示 hybrid） | — |
| S09 | Actors：字段/Collection Source、actor selector、身份配置、增删、Review；接通／保留 | 资源树 › 角色：头部有头像、名称和**锁定的稳定 ID**；分段「字段 / Source」；作者描述是原文保留的长文本框；AI 的提议字段带「proposal」印记 | stable ID 和重复检查；切视图前 guard；作者知识 ≠ 角色信念（字段旁注明） | D：两栏表单；M：单列 | 01·工坊；02·C | — |
| S10 | EntryPoints：字段/Source、入口 selector、首场景/启动配置、增删；接通／保留 | 资源树 › 入口：入口列表 + 编辑表单 | 空或重复入口进诊断；选择只用于预览和构建，不改变已安装的 Session | 同 S09 | 仅文档 | — |
| S11 | Worlds/Knowledge 视图：selector、字段/Source、typed/条目编辑；接通／保留 | 资源树 › World / Knowledge：复用书库的编辑器（K03/K05），保存范围变成 Project ChangeSet | 书库和包内原件不直接写；同名不等于同身份；ID 重复或选择丢失时可以回到 Collection Source | 同 K03/K05 | 仅文档 | — |
| S12 | Library references：exact selector、Attach/Fork/Update/Review detach、Used By；接通／保留 | 资源树 › Library 引用：引用列表（exact 印记），每行「更新到…」「Fork」「解除…」；「附加书库资源…」 | detach/update 先查消费者；Fork 是新身份；不能一键全改 latest；只读来源可以跳回原页 | D：列表 + Inspector；M：列表 → 详情 | 仅文档（树节点有「1↑」） | — |
| S13 | Game Logic、Memory、Agents、Plugins、Package Metadata（JSON/typed）；接通/部分／保留有效源，旧编排废弃 | 资源树对应节点：typed source 编辑器（等宽文本 + 校验）；Agents 源节点标「V3」印记，说明旧 orchestration 字段待硬切 | 这些是真实编辑功能，但不是完整的可视化设计器；Agents 源 ≠ Project Agent | 两端：等宽全宽编辑器，M 上带横向滚动保护 | 仅文档（树节点存在） | — |
| S14 | Skills declarations：Available、Add、Remove、Fields/Source、Review；接通／保留 | 资源树 › Skills：左边是可用 Skills（全局 + 项目），右边是已声明列表 | 声明不等于已安装或有执行权限；安装管理在 扩展 › Skills | D：两栏；M：已声明列表 +「添加」全屏选择器 | 仅文档 | — |
| S15 | Plugin resource（动态，只读 inspection）；接通/条件／保留 | 资源树 › Plugins 下的动态节点：只读 JSON 检视，标题处写「插件未提供专用编辑器」 | 不把 JSON 检视画成完整表单 | 两端相同 | 仅文档 | — |

### 3.7 工坊：Source、作品前端、Assets、测试与构建（S16–S22）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| S16 | Source file chooser、textarea、diff、Review Source Change、Reload file；接通／保留 | 资源树 › Source 文件：文件选择器 → 等宽编辑器（行号）→ 与基线的 diff →「审阅 Source 变更」 | 二进制或不可编辑的文件只读；读取失败时显示可复制的旧草稿；diff 截断不影响正式写入；迟到的响应不覆盖新文件 | D：编辑器 + diff 并排；M：分段「编辑 / Diff」 | 01·工坊（角色视图的 Source 分段） | — |
| S17 | UI editor：owner/component/file、属性/JSON 路径、Check source、Review、Preview draft；接通／保留 | 资源树 › 作品界面 UI：组件树 + 属性表单 / Source；「检查 Source」把诊断定位到文件和字符；「预览草稿」 | structured 和 source 草稿冲突时先处理；只读来源禁写；**这个预览不是 Prompt 草稿预览** | D：三栏（组件、属性、预览）；M：分段「组件 / 属性 / 预览」 | 02·C（预览分段的说明） | — |
| S18 | Assets：Import/Replace、logical name、path、media type、metadata、Preview、Used By、Remove；接通／保留 | 资源树 › Assets：网格 + 详情；导入和替换都进入同一个 ChangeSet | 有引用时先清理；导入未 Apply 前不算项目已改；删除不影响已安装的 Work | D：网格 + 侧栏；M：两列网格 → 详情页 | 仅文档 | — |
| S19 | Preview：entrypoint、Reload、Host capabilities；接通／保留 | 顶栏「预览」→ 预览面板：入口选择器、重载、能力清单；顶部写「绑定 rev 8b21」 | compile、权限或 unsupported 失败要显示原因，不能空白；dispose 不写正式游戏 | D：替换编辑区或开新面板；M：「预览」分段 | 02·C | — |
| S20 | Simulation：fixture 文本、Load/Stage fixture、Run；接通／保留 | 顶栏「模拟」→ fixture 编辑 + 运行结果 | JSON 错误和未知入口能定位到行；**模拟 ≠ 真实 Provider 的内容质量**（结果卡片上写明） | D：面板；M：「更多 › 模拟」全屏 | 01·工坊（Review 里的模拟摘要） | — |
| S21 | Build：Preflight、Build `.atria`、下载、输出与问题；接通／保留 | 顶栏「构建」→ 两步：「运行 Preflight」→「构建 .atria」→ 下载；结果卡片提示「下一步：在书库安装」 | Preflight 不生成安装结果；失败结果不能称为可发行 | D：对话框；M：全屏层，下载失败给重试 | 仅文档 | — |
| S22 | Delete Project review：确认对象、Delete permanently、Reload revision；接通／保留 | 项目菜单 ›「删除项目…」→ 审查对话框：列出删除的对象和保留的对象（Work、Session、存档、已导出的构建、独立 Skills） | exact revision guard；409 必须重审；物理删除，不冒称可撤销；需要显式勾选 | 两端相同，M 全屏 | 仅文档（与 03·10 同模式） | — |

### 3.8 工坊：Project Agent（A01–A04）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| A01 | Task chooser、Intent、Create Task、New Task；接通／保留 | 工坊 › AI 面板：标题「Project Agent · 可选」，当前任务卡片 +「新任务」；底部是补充要求输入框 | 切换任务前 dirty guard；创建失败时保留 intent；Task ≠ 聊天记录 | D：右侧面板（和 Inspector 切换）；M：「AI」分段 | 01·工坊；02·C | — |
| A02 | Prepare only、Continue、计划步骤、会话与执行结果；接通／保留 | 任务卡片：阶段轨（规划、执行、评估、审阅、提交）+ 步骤清单 + 底部「仅准备」「继续」；预算行「4.2k / 20k tokens」 | planning、working、evaluating、repair、review、blocked、conflict、completed 各有不同的状态片；可以取消或接管 | 同 A01 | 01·工坊；02·C | — |
| A03 | Inspect changes、Review & Commit / High-impact review、Human Takeover；接通／保留 | 任务卡片里的提议块：「提议 1 个 ChangeSet · 2 个操作」+ 影响说明 +「审阅并提交…」「检视变更」「接管」 | AI 不能提交；已提交但刷新失败时不能再提交；高影响变更显示真实风险；权限仍在 Host | D：面板；M：「审阅并提交」打开全屏 Review | 01·工坊；02·C | — |
| A04 | Task 内 Goals、Experience/Eval/Evolution；部分／保留，受 E0 Gate | 任务卡片的「目标与评估」折叠区：链接到 智能体 › 目标与反馈 的同一条记录 | `source_unready` 显示为阻塞印记；不承诺自动优化通过 | 同 A01 | 01·工坊（「来源未就绪」任务） | — |

### 3.9 书库 / 工坊：Prompt 预设与资源编辑（Q01–Q12）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| Q01 | Preset 列表：New、Import、Open、Export、Delete；接通／保留原生 | 书库 › Prompt 预设：独立作者可直接新建/导入、浏览/搜索与管理完整 Preset，无须创建作品 | 导入 JSON 校验；删除前确认，保留 pinned 历史；没有游戏依赖，不提供 ST preset 兼容 | D：列表 + 详情；M：列表 → 详情 | 仅文档（书库标签存在） | — |
| Q02 | Preset detail：Program/Modules/Generation/Regex、Back、菜单；接通／整合 | 独立专业创作视图复用原 Program/Modules/Generation/Regex 编辑器；从游戏工作台深链进入时显示同一个 preset 身份及当前保存归属 | 多个入口不等于多个存储；dirty 时取消返回仍保留编辑 | D：标签页；M：分段 + 内部 Back | 仅文档 | — |
| Q03 | Module category：创建、改名、parent、移动、过滤、删除、影响确认；接通／保留 | Modules 标签：左边是分类树，右边是模块列表；删除时显示受影响对象 | 不能形成循环 parent；不静默改其它 Program；冲突时重载 | D：两栏；M：分类过滤器 + 列表 | 仅文档 | — |
| Q04 | Module：name、exact、target、stages、body、priority、条件/参数/provenance；接通／保留并按 D8 深化 | 模块编辑器：同一草稿的结构化 / 完整原文两种编辑方式；清晰区分正文内联变量与可独立编排的来源贡献，完整保留原作者正文 | 当前字段 / JSON 模式**不等于** D8 无损双视图已实现；任何 target/宏/外部来源均不赋予新 Role/Grant | D：表单 + 原文；M：分段编辑 | 仅文档 | — |
| Q05 | Program：stages、Module picker、Add/Remove、Move up、Response Directive、继承/条件/参数；接通／保留 | Program 标签：按 Stage/target 的唯一有效顺序呈现 Module 与稳定身份 Anchor 的可搜索大纲；精确父版本、继承/替换/禁用/新增差异有明确标识，选中条目在中区编辑并显示来源/条件 | 已选目标为 Stage 显式顺序与同 target 内 Module/受控 Anchor 显式顺序，**只有原生 Program/Compiler 一份顺序权威**；旧 `target → priority → ID` 仍是现有执行规则，不能画成新排序已上线；跨 target 不因拖拽提升权限，实际写入经原校验与版本保存；新增条目须显式选择插入位置、失败保留草稿，不自动追随父级 latest；Anchor 同一 Program 版本化，来源类别/必需性不是权限；物理字段与同位置动态贡献排序细则待定 | D：结构树 + 编辑 + 按需 Inspector；M：列表 → 编辑 / 上移下移 | 仅文档 | — |
| Q06 | Generation：tokens、temperature、topP、streaming、stop、tool choice/name；接通／保留 | Generation 标签：每个字段旁有「默认 / 显式」标记 | 区分缺省和显式；数值和 schema 先校验；adapter 不支持的组合在预览时拒绝；选 named tool 才显示 name 字段 | 两端单列表单 | 03·05（stop JSON 示例） | — |
| Q07 | thinking mode/effort/level/budget；cache key/retention/mode/ttl；接通／保留 | Generation 标签的「Provider 专属」折叠区，带说明 | 不宣称所有模型都支持或都命中缓存；不泄露真实 reasoning；unsupported 要明写 | 同 Q06 | 仅文档 | — |
| Q08 | Save revision、Review/save、Simple/Advanced、错误；接通／保留 | 详情底部主按钮：书库里叫「保存修订」，工坊里叫「加入 ChangeSet」 | pending 防重入；失败保留字段；保存成功 ≠ Route 已改用它（回执上写明） | 两端相同 | 仅文档 | — |
| Q09 | 通用资源库：filter、origin、New/New revision、Archive/Restore、Delete、Used By、Fork/Derive；接通／重组入口 | 书库 › Prompt 预设 › 资源：用统一的资源详情组件（与 World/Knowledge 共用的修订、Used By、Fork 区块） | 包原件只读；有引用的不能删；fork/derive 的闭包按顺序保存；失败后核对已有的部分结果 | 同 K07 | 仅文档 | P-06 统一资源详情 |
| Q10 | Studio Prompt Authoring：resource kind、New/Edit、Attach exact、Fork/Derive、Used By；接通／整合 | 工坊 › 资源树 › Prompt 编排：直接选择 Library 已有 exact Preset/Program；按需 Fork/Derive 再经 Project ChangeSet 修改，编辑组件与 Library 共用 | 无需游戏作者自制提示词；精确引用与派生修改区分，推荐值≠正式绑定，包原件不写 | 同 S09 | 仅文档 | P-06 |
| Q11 | Runtime Design：role、capabilities、推荐 Prompt/Generation、requirements、Inspect closure；接通／保留 | 工坊 › 资源树 › 运行需求：每个任务角色一张卡片，写所需能力和推荐资源 | 推荐 ≠ 玩家的 Route 或 Secret 配置；构建 closure 和运行时 slot 解析分开 | 两端卡片纵向 | 仅文档 | — |
| Q12 | D8 全文无损双编辑、Authored/Effective/Wire 三层 Diff、未发布 Prompt Draft Preview；原审计时为**设计／BLOCKED**，后续实现状态需按 Host/Record 复核 | Library 独立 Prompt 作者与 Studio 项目作者共用 Module/Program 的「编辑 / Authored / Effective / Provider Wire / 对比」，但不重复编译器；按需来源 Trace 解释父/子精确版本、条件、Anchor 纳入/排除、合法来源/位置和 Provider lowering；Diff 先校对 Program/Context/Route/Model/Compiler 身份，Token 计数等级如实标注 | **不能**在 Browser 自行拼 wire 或借 execute 做假预览；无游戏的独立 Host fixture Preview 仍待真正接通；付费试读必须显式 Route/预算/外发许可且不自动 Judge；Host 投影须受众脱敏，区分静态 exact 与本请求动态 Source/Grant 证据，版本/currentness 一致；来源 Contribution 只读不允许拖成指令；未接入时准确标 BLOCKED，不能伪装通用 Pass Trace/Replay 已实现 | D：按需双栏/分层检查；M：完整分段与 Unified Diff | 仅文档；旧 HTML 的 BLOCKED 状态是当时快照 | 设计合同，不画成已接通 |

### 3.10 运行：连接、模型、Route、检索与诊断（R01–R14）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| R01 | 五个 section、搜索、New/Edit、source JSON、Save/Back、Duplicate/Delete；接通／保留 | 运行域子导航：就绪、Routes、Models、Connections、Retrieval、外部服务、诊断；每个子页是列表 + 编辑器，编辑器有「字段 / Source」分段 | shape 校验；表单 busy；删除前查引用；新建模型 ≠ 已有可用 Route | D：子导航 + 列表 + 编辑器；M：子导航变成顶部分段，列表 → 编辑器 | 01·运行 | — |
| R02 | Readiness checklist / 修复跳转；接通／保留 | 运行 › 就绪：每个任务一条「就绪链」：Connection →（条件）Secret → Model → Program → Generation → Route；缺的环节有虚线和「修复」 | **Secret 只在需要时出现**；每个节点点开就是对应的编辑器 | D：横向链；M：纵向链 | 01·运行 | — |
| R03 | Connection：adapter、transport、endpoint、Secret selector、Create/Store Secret、Test；接通/部分／保留 | 运行 › Connections › 编辑器：endpoint 输入框带「不含凭证」提示；Secret 选择器 +「新建 Secret」；「测试连接」结果写在下方 | endpoint 不嵌凭证；测试不授权发送 Secret；保存 Secret 后仍要保存 connection；没有完整的 rotate/delete Secret 页面 | D：表单；M：单列，测试结果在按钮下 | 01·运行 | P-08（Secret 管理页） |
| R04 | Credential destination：Review、exact evidence、allow-local、Allow、Cancel；接通／保留 | 保存后的 connection 上出现一张琥珀色卡片「凭证目的地 · 需要你审查」：目标指纹、本机地址勾选、「允许发送到此目的地」 | 草稿一改，审查就失效；409 要重审；inspect、save、test 都不授权、不发送；不显示 key 原文 | D：卡片；M：全屏审批层 | 01·运行；02·D（同一模式） | — |
| R05 | 图像连接：NovelAI 官方/compatible、capability、forwarding、gateway；接通/条件／保留 | Connections 编辑器：选图像 adapter 后显示「图像能力」分组 | relay 协议未知时不默认等价官方；能力声明不是实测 | 同 R03 | 仅文档 | — |
| R06 | Model：Connection、remote ID、Fetch、选择、Use metadata、limits、tokenizer、overrides；接通／保留 | 运行 › Models › 编辑器：「获取模型」列表 + 手填 ID；metadata 字段旁标出来源（发现 / 手填 override） | 换连接或 ID 时清掉旧发现；版本号拒绝迟到响应；unsupported、unknown、override 三者分开 | D：表单；M：单列，模型列表用全屏选择器 | 仅文档 | — |
| R07 | Route：role、Model、Connection、Preset、exact Program/Generation；接通／保留 | 运行 › Routes › 编辑器：角色 + 模型 + 预设（选完后填入 exact Program 和 Generation 印记） | 原资源的新版本不会自动替换；主 Route 缺失或歧义要修；角色只列明确支持的 | D：表单 + 右侧 exact 摘要；M：单列 | 01·运行 | — |
| R08 | fallback、Add/Remove、Move up、timeout/retry/attempt；接通/部分／保留，E0-01 BLOCKED | Route 编辑器的「后备」区：有序列表，每行有上移和移除，外加超时和重试 | 保存不代表 fallback 可用；不同 Program 的 fallback 可能被拦截（行内写明 E0-01 阻塞） | D：列表；M：同，上移和移除按钮 ≥44px | 01·运行 | — |
| R09 | shared limits、local budget、required reserve、optional lanes；接通／保留 | Route 编辑器的「预算」区：一条分段预算条（必需保留、可选、已用） | 这是产品运行约束；UNKNOWN 经济不显示精确费用；Browser 不发放额度 | 两端相同 | 03·13（同一组件） | — |
| R10 | MCP/A2A connection/tool/auth；接通/条件／保留 | Route 编辑器的「执行策略」区：MCP 和 A2A 连接列表 | 「已配置」≠ 允许所有工具；表单不执行外部 mutation | 同 R07 | 仅文档 | — |
| R11 | Retrieval：revision、embed/rerank、provider、Secret、browser model picker；接通／保留 | 运行 › Retrieval：修订列表 + 编辑器，按 provider 显示对应字段；WebGPU 不可用时提示改用其它 provider | Secret 单独保存；声明修订 ≠ 索引已重建；失败保留原稿 | D：列表 + 编辑器；M：两页 | 仅文档 | — |
| R12 | Runtime Diagnostics：evidence、Route、Session 或 exact Project/revision、Compile preview；接通/部分／保留 | 运行 › 诊断：选一个来源（Session 或 exact Project 修订）+ 消息 →「编译预览 · 不发送生成」→ 证据面板 | 缺上下文、revision 冲突、能力未知、token 超限都定位到修复；**不能预览未发布的 Prompt 草稿** | D：两栏（输入、证据）；M：分段 | 01·运行（编译预览卡片） | — |
| R13 | External services：Public content、Service、Saved remote task、Run/Reconnect/Cancel；接通/条件／保留 | 运行 › 外部服务：任务列表，每行一个状态片 | 历史只读，过期请求拒绝；Cancel 只是请求，不保证远端撤销；结果要关联当前 artifact | D：列表 + 详情；M：列表 → 详情 | 仅文档 | — |
| R14 | 错误修复跳转、Return to model setup；接通／整合 | 运行域顶部的修复横幅：「你正在为 X 配置模型」+「完成并返回」 | 权限或凭证故障不笼统给「重试」；刷新不等于修复已提交 | 两端相同 | 01·运行 | — |

### 3.11 智能体：现状与 V3 的边界（O01–O09）

这一组的关键是**把旧载体和仍有效的原生能力分开**。旧 preset、mode、绑定和 Run Panel 已确认要清退，新 UI 不给它们设计长期位置；只在 V3 接替之前，用一个标注为「旧」的过渡区承载它们。

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| O01 | Agents hub（旧 panel.js，默认 Run）；旧载体重组 | 智能体域的子导航：Memory、目标与反馈、运行观察、编排、诊断与回放。默认进 Memory（真实接通的原生能力），不再默认进旧 Run | 不写成「V3 RunProjection 已上线」 | D：子导航；M：顶部分段 | 01·智能体 | P-03 |
| O02 | Orchestration：preset 列表、mode picker（spec/loop/agenda/director）、Single 模板、Import；**废弃** | 过渡期：智能体 › 编排 › 「旧编排（待清退）」折叠区，只读列表加清退说明；**不设计新的 mode picker** | 没有迁移、兼容或改名模板化 | 两端：折叠区 | 仅文档 | 确认废弃（审计） |
| O03 | Preset Inspector：budget/scheduler、owner、arbitration、node、raw JSON；**旧配置废弃** | 同 O02 的过渡区；新功能按 V3 合同在 O08 设计 | dirty guard 和冲突保留草稿在过渡期照旧 | 同 O02 | 仅文档 | 确认废弃 |
| O04 | Agent Inspector：instructions、route、skills/tools、add/delete；**旧 carrier 废弃，原生能力保留** | 原生的 Agent 行为、Route、Skill、权限在 V3 Node Inspector 里重建（O08）；Route 引用和 Skill 服务不跟旧 UI 一起删 | — | — | 仅文档 | — |
| O05 | preset 绑定：enabled、default/character/chat/session binding；**旧 binding/mode 废弃** | 不设计。原生的 Session/Project/World 本体在各自的域保留 | — | — | 仅文档 | 确认废弃 |
| O06 | Run：Timeline/Graph、节点、事件、指标、Stop Run、Inspect step；保留用户任务，重组为 V3 投影 | 智能体 › 运行观察：时间线和图两个视图是同一个 Host 投影；没有当前 Run 时显示空态；「停止 Run」停止中禁用 | 不复制旧 Run Panel；runId/chatKey 限制照旧 | D：时间线 + 图并排；M：时间线优先，图是可选标签 | 01·智能体（V3 示意，标注「非实现」） | — |
| O07 | Agent Diagnostics：health、context/token、step/tool/recall evidence、Export Trace、Import replay；保留诊断，清退旧 checkpoint | 智能体 › 诊断与回放：回放模式下顶部是历史色横幅「回放 · 只读」，Memory 管理禁用 | 私有节点详情按权限和来源；replay 只读 | D：两栏；M：列表 → 详情 | 仅文档（01·智能体有占位） | — |
| O08 | V3 Plan Draft/Validate/Publish、Graph+Inspector、Node/Edge、Approval/恢复；**设计/部分，受 E0** | 智能体 › 编排：Plan 草稿 → 校验 → 发布；图 + Inspector 双向编辑；运行观察里是 Attempt、Effect、Approval、Receipt、Result 各自的状态 | Plan publish 和 Run admission 分开；不共用一个「Run 失败」；**当前新 UI 未完成** | D：图 + Inspector；M：列表、Sheet、Tab 等价方案，不依赖精确拖拽 | 01·智能体（示意图，明确标注设计目标） | 设计合同 |
| O09 | V3 显式有界回边、条件、visits、transition evidence；**设计/局部控制流** | 编排图里回边用独立的线型（虚线弧 + 次数上限徽标）；Inspector 显示 transition evidence | 去掉回边后必须是 DAG；deadline Join 允许 partial；**不等于调度器或模型已接通** | 同 O08；M 上回边在列表里用「↺ 回到 X（≤3 次）」文字表达 | 仅文档 | 设计合同 |

### 3.12 智能体 › Memory（M01–M08）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| M01 | Overview/Knowledge/Sources/Maintenance、Refresh；接通／保留，重组宿主 | 智能体 › Memory：四个标签；顶部 scope 选择器（当前故事）和「刷新」 | capability 不可用、关闭、失败三种状态分开；过期的快照丢弃 | D：左侧控制 + 中间图 + 右侧 Inspector；M：标签 + 列表优先 | 01·智能体 | — |
| M02 | enabled、Recall、Source writes、Auto extraction、Auto compression；统计与最近 recall；接通／保留 | Memory › 左侧控制栏：开关组 + 统计 + 最近 recall 列表 | 开关异步反馈；来源不可写 ≠ 不能查询；切 scope 重新加载 | D：左栏；M：「概览」标签 | 01·智能体 | — |
| M03 | Knowledge：search、entity type、history、图/列表、Inspector；接通／保留 | Memory › 知识：分段「图 / 列表」，搜索、实体类型过滤；点选实体打开 Inspector | 图有实体和关系上限（250/600），画布角落写明「显示 N / 共 M」；大数据和手机触控未测 | D：图 + 列表并排；M：列表优先，图是可选标签；选、查、纠错都不依赖拖拽 | 01·智能体 | — |
| M04 | Sources：provider snapshots、episodes、manual corrections、source text；接通／保留 | Memory › 来源：来源列表（模型抽取 / 用户纠错 / 导入），每条链到证据 | 列表有 slice 上限，「未显示」≠ 删除；私有或撤销的数据按原受众显示 | D：列表 + 详情；M：两页 | 仅文档 | — |
| M05 | Maintenance：History build/rollback、压缩、Rebuild vectors、Export/Import、高级设置、Reset current chat memory；接通/条件／保留 | Memory › 维护：动作卡片，每张写明影响范围；「重置当前故事的 Memory…」放在危险区 | pending 防重入；失败时不伪造图更新；Reset 要二次确认；部分来源上的可用性待实测 | D：卡片网格；M：列表 | 01·智能体（维护入口） | — |
| M06 | Memory OS graph Inspector：类型/关系/中心/跳数、Fit、Diagnostics、source locate、Legacy node graph、History extraction；部分／重组 | 图工具栏：过滤、跳数、Fit；实体 Inspector 的「定位来源」跳到故事时间线的对应 Turn | **source locate 要改成原生定位**（AR13）：能加载目标窗口才跳，否则写明「来源不在已加载范围，打开该 Turn？」；「Legacy node graph」入口不代表 Memory 整体废弃 | D：图工具栏；M：Inspector Sheet | 01·智能体（Fit） | 待实现：原生定位 |
| M07 | 人工纠错：新建实体/关系、改名/别名、合并/拆分、替换/拒绝关系、拒绝事实/推断、解决冲突、reason/time、Save；接通／保留 | 实体 Inspector › 纠错：推断事实旁有「拒绝」，下方动作有合并、拆分、改名；每次纠错必填理由 | 写原 correction stream；不改故事正文或 World Truth；并发或过期时拒绝；模型推测和用户纠错用不同印记 | D：Inspector；M：Sheet 全屏，表单单列 | 01·智能体（合并、拆分、拒绝推断） | — |
| M08 | History extraction：range/mode/from/to、Start、progress、Cancel、Rollback latest；接通/条件／保留 | 维护 ›「从历史抽取」对话框：范围（楼层）+ 模式 → 进度 → 完成后「回滚上次抽取」 | 取消中 ≠ 已写入；回滚只针对那一次抽取事务，不是 Session Undo（HTML 03.2） | D：对话框；M：全屏层 | 仅文档 | — |

### 3.13 智能体 › 目标与反馈（E01–E07）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| E01 | Persistent goals：criteria/progress/blockers/budget、Check evidence、Pause/Resume/Cancel；接通／保留 | 智能体 › 目标与反馈 › 目标：目标卡片（标准、进度、阻碍、预算）+「检查已保存的证据」 | readOnly 禁止控制；终态不能继续；**这里没有「新建目标」表单**（不从后端能力推出按钮） | D：卡片列表 + 详情；M：卡片 → 详情 | 01·智能体（目标检查入口） | P-03 |
| E02 | Link Task、Continue linked Task、预算与 unresolved execution；接通/条件／保留 | 目标卡片的「关联的工坊任务」行 + 「继续任务」（跳到 工坊 › AI） | 不是系统后台自主唤醒；unknown execution 不自动重发 | 同 E01 | 仅文档 | — |
| E03 | Feedback：signal/note、保存、Collect saved result、Correct、Withdraw/Delete、diagnosis；接通／保留 | 目标与反馈 › 反馈：列表；每条区分「明确偏好」和「推测」；溢出菜单：更正、撤回、删除 | source stale、collection 未确认、unknown 要显式显示；不会因为文字内容变成 World Truth | D：列表 + 详情；M：两页 | 01·智能体（反馈保存提示） | — |
| E04 | retention days、Purge expired、Delete scope feedback、account budget；接通／保留 | 目标与反馈 › 设置：保留天数、清除过期、删除范围内的反馈… | 删除后不再声称旧来源可审计 | 两端单列 | 仅文档 | — |
| E05 | Load targets、route/policy、价格、Declare/enable、Evaluate、Pause/Disable；**部分/BLOCKED** | 目标与反馈 › 评估：目标列表；有效原生 target 正常显示，旧 Workspace/Director target 标「旧 · 待清退」；「评估」在 `source_unready` 时禁用，并显示阻塞印记 | **不能**把可见表单说成文学或误拒优化已可运行 | 同 E03 | 01·工坊（来源未就绪任务）；03·11 | — |
| E06 | Job/candidate/diff/report、A/B paired review、Save review、Publish；部分／保留受审发布 | 候选详情：左右对比（A/B），每个维度的 delta，审阅勾选，「发布…」 | 不能用文学分数抵消权限硬错误；按钮存在 ≠ 独立来源通过；V3 plan-prompt 链 BLOCKED | D：左右对比；M：上下对比 + 分段 | 仅文档 | — |
| E07 | Publication/current/historical binding、observed/awaiting run、Pause and restore previous、retired receipts；接通/部分／保留 | 发布记录：当前绑定（实心印记）与历史（斜纹）；「暂停并恢复上一版本」 | 回滚不抹去已发生的 effect 或 World；有引用时保留历史 | 两端时间线 | 03·02 恢复词汇（文案） | — |

### 3.14 扩展：Skills、外部插件、本地脚本和内置工具（X01–X12）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| X01 | Extensions → Skills/Plugins；Plugins → External/Local/Built-in/Official；接通／整合 | utility › 扩展：一级标签 Skills / Plugins；Plugins 下二级标签：外部、本地脚本、内置、官方 | 切标签前 dirty guard；子页加载失败时保留返回和重试；内部标签要能深链（P-05） | D：标签页；M：分段 + 列表 | 仅文档（菜单入口有） | P-05 |
| X02 | Skills：Installed/Bundled、scope filter、search/folder、Create、Refresh、Import（bundled/file/URL）；接通／保留原生 | Skills：左边是文件夹，右边是列表；scope 过滤器只列 global/project/package；导入时冲突要选 replace 或 skip | 包内 Skill 只读；旧的 preset/orch-preset/character scope 不出现在新 UI（零兼容） | D：两栏；M：文件夹作为过滤器 | 仅文档 | — |
| X03 | Skill item：View/Edit/Move/Rename/Delete、scope picker；接通／保留 | 列表行的溢出菜单 | 移动会改变解析 scope，但不改写名称引用；重命名冲突由服务器拒绝；批量导入如实显示部分成功 | 两端相同 | 仅文档 | — |
| X04 | Skill editor：file tree、Save（`Ctrl/⌘ S`）、新建/改名/删除文件；接通／保留 | Skill 编辑器：文件树 + 等宽编辑器；只有这里绑定 `Ctrl/⌘ S` | expectedSha256 冲突不强写；切文件保留草稿；关闭前先审未保存稿 | D：两栏；M：文件列表 → 编辑器，保存按钮在顶栏 | 仅文档 | — |
| X05 | Skill organization：folder、Narrative/Studio/Agents off/on-demand/always、Save；接通／保留 | Skills › 组织：每个 Skill 在三个场景（叙事、工坊、智能体）各有一个分段（关 / 按需 / 总是） | invocation mode 是调度策略，不授予 Tool 权限（行内写明）；删除文件夹会把 Skill 移到「未分类」 | D：表格；M：每个 Skill 一张卡片 | 仅文档 | — |
| X06 | External plugin：HTTPS URL、Install、Edit、Update、Delete、files disclosure；接通/条件／保留 | Plugins › 外部：安装对话框先**披露文件**，再选 targets（enabled、global、preset、work） | **可信 JS 在页面执行，和 Work 沙箱是不同的信任级**：安装对话框顶部用一条琥珀色横幅说明；安装或更新后默认不启用；外部仓库的运行结果 UNKNOWN | D：对话框；M：全屏层 | 仅文档 | — |
| X07 | Local script：New、Import JS（≤4 MiB）、code、enabled、scope、Save；接通／保留 | Plugins › 本地脚本：列表 + 等宽编辑器 | 未启用就不运行；dirty guard 和 409 时保留草稿；保存成功但刷新失败时不重写 | 同 X04 | 仅文档 | — |
| X08 | Built-in：Regex/Search Tools 启停、Work plugins/permissions；接通/条件／整合 | Plugins › 内置：每个内置工具一张卡片（开关 + 设置）；Work 的插件和权限链接到 书库 › 作品 › 资源与权限 | Regex 不能悄悄改 World 或权限；Search Tools 是模型工具，不是全局搜索 | 两端卡片 | 仅文档 | — |
| X09 | Official illustration：启用、配置、状态；接通/条件／保留 | Plugins › 官方 › 插图：开关、配置入口（→ V05/V06）、状态 | 默认关闭；不是所有故事都有插图按钮 | 两端相同 | 仅文档 | — |
| X10 | Native Regex：New、Import/Export、Enable/Disable、Edit/Delete、Move up/down；接通／保留原生 | 内置 › Regex：规则列表，按 scope（账户 / 预设 / 作品）分组；上移下移按钮 | 删除要确认；顺序影响处理；旧 ST depth/order 注入不复活 | D：表格；M：卡片 + 上下移按钮 | 仅文档 | — |
| X11 | Search Tools：web access、provider、safe search、instance/API key、max results、Stop/status；接通混合／保留原生，重组旧配置 | 内置 › 搜索工具：provider 选择、实例 URL、密钥状态、结果数量；运行中显示「停止」 | 旧的 pre-request research、旧 Agent preset、WI position/depth/role/order 不出现在新 UI；web search/visit 保留 | 两端单列 | 仅文档 | — |
| X12 | Manage stored search entries：select/all、单条/批量删除、Reset all；接通/条件／保留 | 搜索工具 ›「已存的搜索条目」：列表 + 多选栏 | 批量删除和全部重置要确认；**单条删除现在没有确认（AR21）**，建议加确认或可撤销；没有当前故事时给提示 | D：表格 + 多选栏；M：长按进入多选 | 仅文档 | P-09 |

### 3.15 媒体：图像、遮罩与语音（V01–V12）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| V01 | 插图工具：Reading/Illustration mode、选文、Annotate、Gallery、候选、设置；接通/条件／保留 | 故事 › 段落操作「选文插图」；Composer「插图」；插图版本在段落下方以图像卡片出现 | 只有可写来源可以修改；退出面板不自动取消 Host 任务；没有选区时禁止 Annotate | D：选中文本后出现浮动工具条；M：系统选区 + 底部工具条，不遮住选区手柄 | 01·故事（插图卡片、段落操作） | — |
| V02 | Annotation editor：quote、角色、outfit/scene、composition、prompt、preset、Save；接通／保留 | 插图 Sheet › 标注：引用原文（只读）、角色选择、服装和场景、构图、prompt | 409 保留草稿；已删除或只读时禁止写；改绘图角色不改故事的 Actor Truth | D：右侧面板；M：Sheet 全屏 | 仅文档 | — |
| V03 | Compose from sections、Generate prompt、Cancel、prompt history / Use version、request preview；接通／保留 | 标注 › prompt 区：「从分段组合」「生成 prompt」、版本列表；「使用此版本」只把内容放进编辑器，要保存才生效 | prompt 编译预览、文本/图像模型实际生成、保存与付费审批分开；独立作者使用 ImagePromptIR/Visual Job 的无会话任务方案仍待真正实现，任务清单失败不代表没有活动任务 | 同 V02 | 仅文档 | — |
| V04 | Generate image、override、prepare/approval、Cancel、history、Use/Hide、Delete annotation；接通／保留 | 「生成图像」→ 准备 → 审批（V11）→ 提交 → 状态；图像卡片的菜单：使用此版本、隐藏、在 Media Studio 中打开 | 费用分 unknown、free、estimated；取消请求 ≠ 未收费或已回滚；选择显示版本不改剧情；删除标注保留图像历史 | D：面板 + 对话框；M：全屏层 | 01·故事（插图卡片）；02·D | — |
| V05 | Illustration settings：角色、scope、preset、target/style/prompt Route、模板；接通／保留 | 保留扩展 › 官方 › 插图设置和作品覆盖；Library 可另提供独立 Visual Prompt 作者入口管理全局模板、Style/Quality/Negative，而不强制绑定游戏 | 现有全局设置可独立于作品保存；新的 Library 独立创作工作流只是设计，尚无无 Session 图片 Job/历史闭环；恢复模板是草稿变更，要保存，预算/Target 仍归原视觉服务 | D：表单；M：单列 + 角色卡片 | 仅文档 | — |
| V06 | Image target/style：Connection、model、params、Comfy workflow（≤2 MiB）、bindings、output node、budget；接通／保留 | 视觉资源共用 Library 原生 Image Target/Rendering 编辑与版本权威：workflow 文件导入、语义输入绑定、风格、预算；可由独立或作品上下文入口打开 | node、input、output 校验；保存能力 ≠ 实测能力；provider 限制或费用未知要写明 | D：两栏（workflow 节点 / 绑定）；M：绑定列表 | 仅文档 | — |
| V07 | Image candidates（Visual Director）：passage/score/reason、Analyze with model、Review and generate；接通/条件／保留 | 插图 Sheet › 候选：段落 + 分数 + 理由；「用模型分析」默认不自动运行 | **Visual Director 是有效的视觉能力，不是要废弃的旧 Agent Director** | 同 V02 | 仅文档 | — |
| V08 | Gallery：分页、Use version、Compare original、Hide、Open Media Studio、reference、Confirm reference；接通／保留 | 插图卡片 ›「全部版本」→ Gallery 网格（每页 12）；参考图设置在详情里 | 隐藏 ≠ 删除；提升为参考图 ≠ World fact；离开 Media 草稿前先同步或 guard | D：网格 + 详情；M：两列网格 | 01·故事（版本、隐藏、Media Studio 入口） | — |
| V09 | Media Studio：regenerate/img2img/inpaint/upscale、reference、preserve outside mask、Save draft、Preview edit task；接通／保留 | 现有会话图片的全屏编辑器：左工具、中画布、右参数；独立作者的付费试生成/非 Session 资产工作流未来复用原 Media/Asset 服务，不能把会话画廊当独立图库 | 保存中不能提交；409 时保留草稿或另存；upscale 可能改变细节（写明）；任务独立于阅读 | D：三栏；M：画布全屏 + 底部工具条 + 参数 Sheet | 仅文档 | — |
| V10 | Mask Canvas：brush/erase/rect/pan、radius、Undo/Redo/Clear/Fit、坐标表单、pointer/pinch/wheel；接通／保留 | Media Studio 画布工具栏；「坐标」按钮打开矩形坐标表单（x、y、w、h →「添加矩形」） | `Ctrl/⌘ Z` 只撤销遮罩命令；清除是可撤销命令，不删原图；多指和像素映射需真机验证 | D：指针 + 滚轮；M：双指缩放 + 坐标表单作为等价操作 | 仅文档；02 节选对照表 | — |
| V11 | Visual approval：cost limit/currency、unknown-cost consent、asset/mask transfer、degradation consent、Approve/Cancel；接通／保留 | 审批对话框：目标、请求指纹、费用印记、外发素材缩略图、三个同意复选框，全部勾选后「批准并提交」才可用 | **从不预选**；版本或 target 变化要重新准备；只针对这一个任务；模型 prompt 不授予批准 | D：对话框；M：全屏层，主按钮在拇指区 | 01·故事（审批对话框）；02·D | — |
| V12 | 条件朗读：Read aloud、voice、Stop、audio；接通/条件／保留 | 段落操作「朗读」；Composer「朗读」；第一次使用时先选声线 | 来源变化时中止并重置；失败退回文本；不是实时语音聊天 | D：段落操作 + 迷你播放条；M：底部播放条 | 01·故事（入口） | — |

### 3.16 共享会话（H01–H04）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| H01 | Enable sharing、owner/session ID、Connect/Disconnect、Refresh participants；接通/条件／保留 | 故事 › 更多 ›「共享会话」→ 面板：启用、ID、连接状态、参与者 | 只对 live Session；ID 一改立即断开旧连接；**不是邀请链接，也不是云同步** | D：右侧面板；M：Sheet | 01·故事（入口） | — |
| H02 | member handle、seat、role、Apply membership、Choose Persona；接通／保留 | 共享面板 › 成员：席位表（handle、席位、角色） | Host 用 expectedAccessRevisionId 改成员；observer 不能提交，也不能选 Persona；共享 Persona 只改席位显示名 | D：表格；M：卡片 | 仅文档 | — |
| H03 | shared input、submit once、Host commit/cancel Turn；接通/部分／保留 | 共享时 Composer 上方有一条「回合收集」进度：每个席位一个点（已提交 / 未提交）；Host 有「提交回合」「取消回合」 | 所有参与者提交后由 Host 决定正式提交；重连后读真实投影 | 两端相同 | 仅文档 | — |
| H04 | Shared rule selector、argsSchema 参数、Submit；Host Open/Commit/Cancel shared turn；接通/条件／保留 | 回合收集区的「规则」下拉，按 argsSchema 渲染参数 | 只有声明的席位可以用该规则；骰子参数不手填；scope epoch 活跃才能打开；过期不能提交 | 两端相同 | 仅文档 | — |

### 3.17 设置（T01–T10）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | 六类设置、搜索、结果定位、Back、related links；接通／保留并可重组 | utility › 设置：左侧六类（外观与主题、阅读与输入、通用与语言、通知与声音、无障碍与性能、隐私与媒体）+ 顶部搜索（中英别名） | 搜索结果定位后展开并聚焦该项；无匹配要解释；每类记住自己的滚动位置 | D：两栏；M：类别列表 → 设置页 | 仅文档（菜单入口有） | — |
| T02 | Appearance light/dark/system、主题画廊、预览、Use theme、Cancel preview；接通／保留 | 外观与主题：模式三选一；昼/夜主题画廊，每张主题卡片有「预览」和「使用」 | 离开页面即取消预览；busy 或 migrationPending 时禁止冲突操作；主题缺失时显示 fallback 并提示修复 | D：画廊网格；M：两列 | 04 + 演示控制（夜/昼切换） | 夜 Nocturne / 昼 Folio 只是视觉提案 |
| T03 | theme name、colors/accent、建议恢复、contrast note；接通／保留 | 主题详情 › 自定义：编辑内置主题会生成自定义副本；颜色字段旁实时显示对比度（复用 04.1 的计算） | 对比度检查只给说明，不强制拒绝；保存失败要提示 | D：表单 + 实时预览；M：单列 + 底部预览条 | 04·色彩（对比度实时计算） | 建议：显示对比度数值 |
| T04 | 主题 CSS、Export/Import、Delete custom、original export、Retry upgrade；接通；旧迁移桥接待清退 | 主题详情 › 高级：「启用主题 CSS」开关 + 等宽编辑器；导入后不自动应用；横幅写明恢复快捷键 `Ctrl+Alt+Shift+R` 和 `atriaNoThemeCss=1` | 自定义 CSS 出故障时可以临时抑制，原文不删；旧主题迁移不等于未来继续兼容 ST | D：编辑器；M：全宽编辑器 | 仅文档 | — |
| T05 | Interface size slider、Send on Enter；接通／保留 | 阅读与输入：界面大小滑块（松手后保存）、Send on Enter（auto / Control-Enter / plain Enter） | saving、error、重试保存；IME 下不发送；缩放影响整个界面 | 两端单列 | 02·A（Composer 的按键提示） | — |
| T06 | Language en/zh-cn、Confirm before leaving；接通／保留 | 通用与语言：语言（切换后重新加载，说明只对这个浏览器生效）、离开确认（smart / always / off） | 语言保存在浏览器本地，不写成跨设备同步；保存失败保留值并可重试 | 两端单列 | 仅文档 | — |
| T07 | Reduce motion、Reduce blur；接通／保留 | 无障碍与性能：两个开关；说明系统的 prefers-reduced-motion 同样生效 | 子 UI 是否都遵守要运行验证 | 两端单列 | 演示控制（减动、减模糊） | — |
| T08 | Notifications & sound（现为说明 + Open Diagnostics）；部分／重组 | 通知与声音：保留说明页；**不画**能用的完成通知或声音开关 | 旧的通知、声音、keepalive 偏好没接到 Native Session 生命周期 | 两端单列 | 仅文档 | P-07（是否新增真实通知） |
| T09 | Privacy & media（说明 + Open Library）；部分／重组 | 隐私与媒体：说明「外部媒体权限按每个作品或每个故事授予」+ 链接到 书库 › 作品 › 资源与权限 | 不是账户级的「一键允许所有外部媒体」 | 两端单列 | 仅文档 | — |
| T10 | 相关入口：Account & backups、Extensions、Diagnostics、Storage、Learning；接通／整合 | 每类设置底部的「相关」链接行 | 可以整合，但不能删掉低频的数据恢复入口 | 两端相同 | 仅文档 | — |

### 3.18 账户与身份（U01–U05）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| U01 | avatar、display name、handle/role、created/password 状态；接通／保留 | utility › 账户与备份 › 资料：头像、显示名、handle、角色、创建时间；导航轨底部的头像也是入口 | 账户功能关闭时显示本地账户说明；账户头像和名字 ≠ Persona（写明）；失败可重试 | D：两栏；M：单列 | 01（导航轨头像） | — |
| U02 | Change password、Sign out；接通/条件／保留 | 资料页底部：「修改密码」「退出登录」 | 只在账户功能开启时显示；退出后回到登录页并设置 noauto；本轮未实测 | 两端相同 | 仅文档 | — |
| U03 | Settings snapshots：list/refresh、create、view、restore；接通／保留 | 账户与备份 › 设置快照：列表 + 「创建快照」；行操作「查看内容」「恢复…」 | 恢复要单独确认；快照**只含设置**，不是业务数据；和 ZIP 备份、Native Save、回收站三者分开说明 | D：列表；M：卡片 | 03·02（恢复词汇） | — |
| U04 | Backup & sync、Storage management、Reset settings、Reset everything；接通／保留 | 账户与备份 › 危险区（默认折叠）：「重置设置…」「重置全部…」；备份和存储中心是独立的入口卡片 | 破坏性操作二次确认；不能拿 reset 修普通配置问题；没有管理权限时不显示也不执行 | 两端：危险区折叠 | 仅文档 | — |
| U05 | Admin（旧面板已移除）；未提供当前页面 | **不设计入口**。如需新的管理界面，另列产品提案 | 后端 admin endpoints 不等于有新 Admin 页面 | — | — | 不复活 |

### 3.19 备份、同步与 LAN（B01–B08）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| B01 | Automatic backups：保留策略、Cleanup now、Restore defaults、history；接通混合／保留原生，废弃旧兼容项 | 账户与备份 › 自动备份：保留策略表单 + 备份历史搜索；说明「这是保留策略，不是定时创建完整 ZIP」 | 旧 chat/character/group 的保留项不在新 UI 出现；原生快照和备份保留 | D：表单 + 历史；M：两段 | 仅文档 | — |
| B02 | Archives：scope、Select all/recommended/none、Create & download；接通／保留并重组 | 账户与备份 › 归档：原生类别复选（作品、故事、书库、Runtime、项目源码、所需 blob）；Secrets 单独一组，带敏感提示 | Secret 是敏感选择，不是自动外发；不复刻旧 ST 类别 | D：两列复选；M：单列 | 仅文档 | — |
| B03 | Choose ZIP、merge/overwrite/full、Preflight、Start restore；接通／保留 | 账户与备份 › 恢复：选 ZIP → 模式 → 预检报告（类别、冲突、engine、需要的凭证）→「开始恢复」 | 没有预检就不写入；结果未知时查回执，不直接重发 | D：分步对话框；M：全屏分步 | 仅文档 | — |
| B04 | Cancel and roll back、progress、recovery points、restore previous state；接通／保留 | 恢复进度视图：阶段（读取、写入、验证、回滚）+「取消并回滚」；恢复点列表 | 网络断开、没有完成回执时显示「结果未确认」（HTML 03·16）；Cancel 后等真实回滚；从恢复点再恢复之前也先保存当前状态 | 两端相同；M 上进度页不能被 Back 意外关闭（先确认） | 03·16 | — |
| B05 | Device sync → LAN Sync：device/server、scope、冲突、progress/cancel/recovery；部分证据／保留 | 账户与备份 › 设备同步 › LAN：对端列表 + 「配对新设备」 | 完整的 LAN 配对、双端传输和恢复 **UNKNOWN/NOT_RUN**；不是公网云同步 | D：列表 + 详情；M：两页 | 仅文档 | — |
| B06 | Cloud sync provider 列表/说明（占位）；设计/占位 | 设备同步 › 云：说明「暂无可用的云服务」，**不画已连接状态** | 新 provider 是产品提案 | 两端说明 | 仅文档 | 待确认 |
| B07 | LAN pairing：label、categories、Generate/Copy link、Accept link、basic auth；接通/静态／保留 | 配对对话框：两个标签「生成链接」/「接受链接」；类别复选；链接自动填表单；用户确认 scope 后连接 | 剪贴板失败时给手动复制；配对不是共享故事邀请；实际双端 NOT_RUN | D：对话框；M：全屏两步 | 仅文档 | — |
| B08 | Peer list：Sync now、Undo last sync、Forget、Clear credentials；每文件 ours/theirs、Apply；接通/静态／保留 | 对端详情：「立即同步」「撤销上次同步（**仅本机**）」「忘记此设备」；冲突列表每行 ours/theirs 分段 | 冲突没解决不显示完成；取消冲突处理 ≠ 回滚已完成的同步；忘记只删本机记录 | D：表格；M：每个冲突一张卡片 | 03·18、03·02 | — |

### 3.20 存储中心（C01–C10）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| C01 | Scope（服务器账户 / 当前浏览器）、五个分区、Refresh/Close；接通／保留 | utility › 存储中心（全页）：顶部 scope 分段，左侧分区：概览、清理、备份与回收站、操作历史、高级 | 测量失败不显示假 0；切 scope 清空选择；关闭停止浏览器任务，服务器任务在后台持续 | D：两栏全页；M：分区变成顶部分段 | 01·存储 | P-02（全页） |
| C02 | 分类卡：故事与存档、作品与项目、World 与 Knowledge、媒体、身份、智能体资料、设置、恢复与缓存、离线；接通／保留 | 概览：用量环 + 分类卡片（字节数、数量、状态）；受保护的条目跳到对应业务页 | 「高级 / 旧 / 未识别」≠ 可以安全删除 | D：卡片网格；M：单列 | 01·存储 | — |
| C03 | list search/sort/paging（50）、select、Details、Open business workspace；接通／保留 | 清理列表：搜索、排序、多选；只有带 managed target 的条目可选，其它的复选框禁用并写明原因 | IME 中不刷新；阻碍在详情抽屉里检查；迟到的详情不覆盖另一 scope | D：表格 + 多选栏；M：卡片 + 底部多选栏 | 01·存储 | — |
| C04 | 回收/永久删除预览、safe cleanup、review task、Execute/Cancel；接通／保留 | 多选栏：「预览移入回收站」与「预览永久删除…」两个按钮，语气和颜色不同 | 预览绑定固定对象；过期就重新预览；拒绝被引用、运行中、保留的对象 | 两端相同 | 01·存储；03·03.3 | — |
| C05 | 回收站 View & restore、恢复原身份、purge、interrupted repair、Review local Git publication；接通／保留 | 备份与回收站：回收站列表 → 详情抽屉（原身份、依赖）→「恢复原身份」 | 身份冲突不覆盖；依赖缺失先修；本地 Git 审查不运行模型，也不自动 push | D：列表 + 抽屉；M：列表 → 纵向 Sheet | 01·存储（入口） | — |
| C06 | Operation history、统计、progress、Stop after current、Review remaining、Refresh；接通／保留 | 操作历史：任务列表；任务详情有进度（已完成 / 失败 / 剩余）+「在当前对象后停止」「重审剩余」 | **已完成的对象保持有效，不整批回滚**；partial、interrupted、paused、blocked、unknown 分开显示；浏览器任务要保持页面打开 | 两端相同 | 03·17 | — |
| C07 | Advanced inspector：breadcrumb、drill、View/Edit/Create/Delete raw record；接通/条件／重组入口 | 高级：默认折叠，进入时有横幅「原始记录检视，可能绕过业务保护」 | 原生受保护的数据不能绕过业务 writer；能力缺失、配额、隐私模式分开显示；不是给所有用户的默认编辑器 | D：面包屑 + 表格；M：逐级列表 | 01·存储（入口） | 待确认：是否只对高级用户显示 |
| C08 | 资源变化后的业务 UI 刷新/失效；接通/部分／保留 | 没有独立入口。删除或恢复之后，打开着的业务页显示横幅「此资源已被移动或删除」 | 旧页不能继续编辑已删除的实体；失效事件不能替代授权复验 | 两端相同 | 仅文档 | — |
| C09 | Detail/recovery drawer：Close、Escape、拖动关闭、移动端 Sheet、Tab 边界、focus return；接通／保留 | 详情抽屉（D 右侧、M 纵向 Sheet，760px 切换） | pointercancel、resize、减动切换都要收束；后台刷新在抽屉打开或输入中时延后，不打断 IME | 见左 | 01·存储；02·B（同一 Sheet 模式） | — |
| C10 | 永久删除/清理的二次确认：说明、复选、Permanently delete/Back to preview；接通／保留 | 二次确认对话框：不可恢复说明 + 已审列表 + 一个**未预选**的勾选 +「永久删除」（实心红）/「返回预览」 | 不勾选就不提交；返回预览时保留审查结果；不扩大范围 | D：对话框；M：全屏层 | 01·存储（永久删除对话框） | — |

### 3.21 诊断与公告（D01–D05）

| 审计功能 ID | 当前能力／实现状态 | 建议页面／入口／控件 | 状态／权限／恢复 | 桌面／手机 | HTML | 提案 |
| --- | --- | --- | --- | --- | --- | --- |
| D01 | Global Diagnostics：Guided、Startup、Expert、My problem just happened、Refresh；接通／保留 | utility › 诊断：三个标签 + 醒目按钮「我的问题刚刚发生」；菜单项上有未读事件计数；故事宿主门和健康标签都能直达 | 只用最近的安全证据，不自动上传私人内容；空、读取失败、部分证据分开显示 | D：标签页；M：分段 | 仅文档（菜单入口和计数） | — |
| D02 | Guided：module health、incident list/detail、Copy summary/full context；接通／保留 | 引导：模块健康列表 → 事件列表 → 详情；「复制摘要」「复制完整上下文」 | 剪贴板失败要明确提示并给可选文本；完整上下文不授权泄露 Secret 或私有内容 | D：两栏；M：列表 → 详情，带 Back | 仅文档 | — |
| D03 | Startup analysis：启动报告、模块证据、重试；接通/条件／保留 | 启动：报告；没有报告时写「本次启动未捕获」 | 启动证据不是静态的健康绿灯 | 两端相同 | 仅文档 | — |
| D04 | Expert：frontend/backend、module、level、search、auto refresh、clear、raw detail；接通／保留 | 专家：过滤栏 + 虚拟化日志列表 + 详情；「清除当前来源」要确认 | 账户关闭或管理员才能看服务器日志（服务端判断，不靠隐藏按钮）；清除只清 capture logs，事件保留 | D：表格；M：卡片 + 过滤 Sheet | 仅文档 | — |
| D05 | Announcement：critical modal、warning banner、info badge/inbox、mark read/dismiss；接通／保留 | critical 用模态；warning 用 Shell 顶部横幅；info 在全局菜单「公告」里显示未读计数 | 优先级不等于系统权限；获取失败可诊断 | 两端相同 | 01·全局菜单（公告入口） | — |

## 4. 状态协议落到哪些功能

HTML「03 状态协议」给出每种状态的画法：用户看到什么、能做什么、不可以怎样画。下表说明每种状态主要落在哪些功能上，按审计原文的状态和协议，不新增 Store 或 API。

| HTML 卡 | 状态 | 主要功能 ID | 关键表现 |
| --- | --- | --- | --- |
| 01 | 空 · 首次 · 无匹配 | L01 K01 P01 S01 Q01 R01 X02 M03 C03 D04 | 空库只给真实入口；无匹配只清 query |
| 02 | 加载中 | 全部列表；Y04 窗口读取；M01 快照 | 点名正在读的对象；保留定位；异步 token 丢弃旧响应 |
| 03 | 部分来源失败 | G03 搜索；L01 Works/Games；S02 支持数据；S06 Inspector；C01 测量 | 只重试失败的那个来源；缺数据不画成 0 |
| 04 | 交互态与禁用原因 | 全部；重点是 L03 开始按钮、Y05 写操作、R04 允许、V11 批准 | 禁用原因就近可读，手机不靠 hover |
| 05 | 草稿 · 校验 · 解析错误 | K03 K05 S04 S09–S17 Q04–Q08 R01 X04 X07 T04 | 原稿保留，定位到字段或行列 |
| 06 | 保存中 · 防重入 | P02 Q08 S04 R01 X04 V02 V09 Y06 | busy，字段锁定，只认原服务回执 |
| 07 | 已提交但刷新失败 | S04 A03 L02 Y07 K07 R01 X07 | 回执 + 重读，不再给提交 |
| 08 | CAS 冲突 · 来源变化 | S04 S16 P02 P03 R04 V02 V09 X04 K06 | 复制草稿、对比、重审；不默认强制覆盖 |
| 09 | 历史 · 原件 · 无权限 | Y02 Y09 K09 K07 X02 X03 S15 D04 | 合法投影 + 原因 + Fork/复制/授权出路 |
| 10 | 被引用 · 运行中 · 保留 | L05 K08 K11 P02 S12 S18 S22 C04 C05 | 列出精确消费者并能跳过去 |
| 11 | 依赖缺失 · source_unready | L03 L06 L08 Y01 Y07 E05 E06 A04 | 指出缺的 exact 资源；阻塞印记 |
| 12 | 不支持 · 未知 · 授权被拒 | R03 R04 R06 R08 Q06 Q07 R12 | 三者分开，各有修复链接 |
| 13 | 预算 · 配额 · 费用未知 | R09 E04 A02 V04 V06 V11 C01 C02 | 三种约束分开；没有来源就不显示金额 |
| 14 | 审批：待定 · 过期 · 拒绝 | R04 V04 V11 X06（安装披露）O08（V3 目标） | 写明审什么；变化即重审；从不预选 |
| 15 | 生成中 · 取消中 · 迟到结果 | Y03 Y09 V03 V04 V12 M08 R13 O06 | 随时可停；旧 scope 的结果不污染新页 |
| 16 | 未知派发 · 断线 | Y03（流无结果）B03 B04 R13 O08 | 查回执或状态，不直接重发 |
| 17 | 部分完成 · 中断 · 停止 | C06 B04 X03（批量导入）M08 | 列出已完成、失败、剩余；只重审剩余 |
| 18 | 撤销与恢复先说对象 | V10 Y09 C05 B08 E03 M08 E07 U03 | 每个「撤销」写出对象和范围（HTML 03.2 词汇表） |

## 5. 完整操作链

委托说明里的六个代表任务逐个走通。每一步写**位置 → 控件 → 状态**；方括号里是功能 ID。

### 5.1 新用户装作品，发现缺 Route，配好模型后回到原流程（F01–F04, F13）

1. **进入**：没有账户时直接进「故事」首页，空状态卡片给「去书库安装作品」[Y01 G06]。
2. **安装**：书库 › 作品 ›「安装 .atria」→ 选文件 → 预检卡片显示包身份、版本、必需权限（2 项，未勾选）→ 勾选后「安装」→ 回执「已安装 v1.4.2」+ 单独的「打开作品」[L01 L02 L09]。
3. **启动**：作品详情 › 入口区，选「第三夜：自由探索」，填故事标题 →「开始新故事」[L03]。
4. **缺 Route**：弹出任务槽位对话框，「线索整理」这一行显示**缺失**印记和「没有合适的 Route？去运行域配置」[L07]。
5. **配置**：跳到运行 › 就绪，顶部是修复横幅「你正在为《雾港十三夜·线索整理》配置模型」；就绪链中 Route 节点为虚线 [R02 R14]。
   - Connection：新建 → adapter、endpoint → 若 adapter 需要 Secret，就新建 Secret 并保存 connection [R03]。
   - 凭证目的地卡片出现（琥珀色）→ 审查目标指纹 →「允许发送到此目的地」（不预选，草稿变化即失效）[R04]。
   - Model：获取模型 → 选一个 → 用 metadata [R06]。
   - Route：角色「线索整理」+ 模型 + 预设（填入 exact Program 和 Generation 印记）→ 保存 [R07]。
   - 可选：运行 › 诊断 › 选这个作品的 exact 项目修订 →「编译预览 · 不发送生成」查证据 [R12]。
6. **返回**：横幅上的「完成并返回」→ 回到第 4 步的对话框，Route 下拉里有了新 Route → 重新 preflight →「保存并继续」→ 第 3 步的原操作继续执行 [L07 R14]。
7. **异常**：会话已创建但打开失败时，重试只打开原 Session，不新建 [L03]。

### 5.2 玩家：长篇阅读、软键盘输入、停止、切 Persona、存档、看历史并切分支（F04–F06）

1. **读**：故事 › 会话，衬线长文，36em 版心；向上读时新内容不拉动视图，出现「回到最新」[Y02 Y04]。
2. **输入**：手机上点 Composer → 软键盘弹出，Composer 和发送按钮贴在键盘上方；拼音组合中的 Enter 不发送 [Y03 T05]。
3. **停止**：发送后按钮变成「停止」，状态行写「你的输入已被接受 · 停止不会撤销它」→ 按停止 → toast「已请求停止」；已生成的部分保留为本回合结果 [Y03]。
4. **切 Persona**：点 Composer 左侧头像 → Persona 对话框 → 搜索并选 exact Persona →「应用到本故事」；如果期间 Session 被别处修改，提示重载，不把选择套到别的 Session [P03]。
5. **存档**：Inspector › 历史与存档 →「保存当前进度」→ 回执（T41 · rev 41d0）；自动保存行写明「每 10 回合 · 保留 20 个」，并说明它不是账户 ZIP 备份 [Y06]。
6. **看历史**：分支列表 →「先去巡捕房」的「预览」→ 舞台进入历史色调，Composer 写「历史预览为只读」；横幅里有「切换到此分支…」和「返回当前故事」[Y08 Y09]。
7. **切分支**：「切换到此分支…」→ 确认对话框写明「当前分支指针将移到 rev 2a71；原主线完整保留」→ 确认。忙碌、历史预览或过期时，这个按钮禁用并写明原因 [Y09]。
8. **手机**：第 5–7 步都在三档 Sheet 里完成；Back 先收起 Sheet，再退出预览 [§6.3]。

### 5.3 作者：书库资源 fork/attach 到项目，结构化/Source 修改，处理冲突，Review/Apply/Preview/Build（F07–F12）

1. **找资源**：书库 › World 与 Knowledge › Knowledge「渡口船队」→ 修订 r4（当前印记）→「Used By」看到已有两个作品使用 [K01 K07]。
2. **带进项目**：工坊 › 项目 › 资源树 › Library 引用 →「附加书库资源…」→ 选 exact r4 → 加入 ChangeSet。想改内容就「Fork」，形成独立身份 [S12]。
3. **编辑**：角色 › 柳絮：字段视图里改「说话风格」（青色草稿竖线 + 未保存印记）；切到 Source 分段可以看到同一份草稿的原文 [S09 S16]。
4. **AI 协助（可选）**：AI 面板 › 新任务，填写意图 → 规划、执行、评估 → 提议 1 个 ChangeSet → 人类「审阅并提交…」[A01–A03]。
5. **审阅**：顶栏「审阅变更 3」→ 对话框列出 3 个 exact 操作和逐条 diff，以及「校验通过 · 模拟 3/3（只证明 fixture 可运行）」→「应用 ChangeSet → rev 8b22」[S04 S20]。
6. **冲突**：如果有人先把项目改到 rev 8b23，应用返回 409 → 横幅「别处已更新为 rev 8b23」+「复制我的草稿」「对比后重审」；草稿留在变更列表里 [S04 S05]。
7. **刷新失败**：应用成功但刷新失败 → 回执「已应用 · rev 8b22 · 刷新失败」+「重读」；不再显示「应用」[S04]。
8. **预览与构建**：「预览」（绑定 rev 8b22，不写正式游戏）→「构建」→「运行 Preflight」→「构建 .atria」→ 下载 → 结果卡片提示「下一步：在书库安装」[S19 S21 L02]。

### 5.4 高阶用户：查 Memory 来源并纠错，看真实 Eval/source_unready，检查受权 candidate diff（F14, F15）

1. **Memory**：智能体 › Memory › 知识 → 搜索「柳絮」→ 实体 Inspector：事实列表里，模型推断的事实带「推断」印记 [M01 M03]。
2. **查来源**：事实旁「来源」→ 来源标签里定位到 episode → 「定位到故事」跳到时间线的对应 Turn；如果该 Turn 不在已加载窗口，就提示「打开该 Turn？」[M04 M06]。
3. **纠错**：「拒绝推断」→ 必填理由 → 保存 → 来源列表多一条「用户纠错」；故事正文和 World Truth 不变 [M07]。
4. **Eval**：目标与反馈 › 评估：「文风一致性」target 显示 `source_unready` 阻塞印记，「评估」禁用并写「受审来源未就绪」；旧 Workspace/Director target 标「旧 · 待清退」[E05]。
5. **候选 diff**：已有的候选详情 → A/B 对比 + 各维度 delta → 审阅勾选；「发布」受原 target authority 和 server gate 约束，V3 plan-prompt 链 BLOCKED 时写明 [E06]。

### 5.5 插图：选文 → 标注 → prompt → 图像审批 → Gallery → Mask 编辑（F17）

1. **前提**：扩展 › 官方 › 插图已启用；插图设置里已配置目标和风格 [X09 V05 V06]。
2. **选文**：故事里选中一段（手机长按，调整系统选区手柄）→ 工具条「标注」[V01]。
3. **标注**：插图 Sheet › 标注：角色（柳絮）、服装、场景、构图 → 保存（409 时保留草稿）[V02]。
4. **prompt**：「生成 prompt」→ 新版本出现在列表 →「使用此版本」把内容放进编辑器 → 保存后才生效 [V03]。
5. **图像**：「生成图像」→ 准备 → 审批对话框：目标 Comfy 本机、费用**未知**（上限 ¥0.80）、两个素材外发、一项降级；三个复选框都未预选 → 全部勾选 →「批准并提交」[V04 V11]。
6. **取消**：生成中可以「取消」；取消后显示宿主回报的真实终态，「取消请求 ≠ 未收费」[V04]。
7. **Gallery**：段落下的插图卡片 →「全部版本」→ 选择显示版本（只改展示，不改剧情）；「隐藏」可以在 Gallery 恢复 [V08]。
8. **Mask**：「在 Media Studio 中打开」→ 局部重绘 → 画笔或「坐标」表单画遮罩 → `Ctrl/⌘ Z` 撤销笔画 →「保存草稿」→ 准备编辑任务 → 再次审批 [V09 V10 V11]。

### 5.6 维护：资源被引用、清理 partial/interrupted、回收站恢复原身份、备份中断、诊断（F19, F20）

1. **被引用**：书库 › World「雾港城 1926」→「删除…」→ 阻碍对话框列出 Session「第三夜」引用 r6、项目「续篇」附加 r6、恢复点保留，每行能跳过去 [K08]。
2. **清理**：utility › 存储中心 › 清理 → 多选 →「预览移入回收站」→ 执行 → 操作历史显示「已完成 12 · 失败 1 · 剩余 7」→「在当前对象后停止」→「重审剩余 7 项」[C03 C04 C06]。
3. **中断**：浏览器关闭导致任务中断 → 再打开时任务状态是「中断」，有「修复中断的恢复」[C05 C06]。
4. **永久删除**：「预览永久删除…」→ 二次确认对话框：不可恢复说明 + 未预选的勾选 →「永久删除」[C10]。
5. **回收站**：备份与回收站 › 回收站 → 详情抽屉（原身份、依赖）→「恢复原身份」；身份冲突时不覆盖 [C05]。
6. **备份中断**：账户与备份 › 恢复 → 选 ZIP → 预检 →「开始恢复」→ 写入阶段网络断开 → 横幅「结果未确认」+「查询回执」「查看恢复点」，**没有「重试」**[B03 B04]。
7. **诊断**：utility › 诊断 →「我的问题刚刚发生」→ 生成事件（最近的安全证据）→「复制摘要」；剪贴板失败时给可选文本 [D01 D02]。

### 5.7 其它完整链（简述）

| 链 | 路径 | 关键状态 | ID |
| --- | --- | --- | --- |
| Skills 安装与调用 | 扩展 › Skills › 导入（冲突时选 replace/skip）→ 编辑（`Ctrl/⌘ S`，expectedSha256）→ 组织：叙事/工坊/智能体 三个场景的调用模式 → 工坊项目 › Skills 声明 → Review/Apply | 包内 Skill 只读；调用模式 ≠ 工具权限 | X02–X05 S14 |
| 外部插件 | 扩展 › Plugins › 外部 › URL → 文件披露 + 信任横幅 → 安装（默认不启用）→ 编辑 targets → 启用 | 可信 JS ≠ Work 沙箱；外部运行结果 UNKNOWN | X06 X07 |
| 共享会话 | 故事 › 更多 › 共享 → 启用 → 成员与席位 → 回合收集 → Host 提交或取消 | observer 不能提交；不是邀请链接 | H01–H04 |
| 设置快照 | 账户与备份 › 设置快照 → 创建 → 查看 → 恢复（单独确认） | 只含设置 | U03 |
| LAN 同步 | 设备同步 › LAN › 配对（生成或接受链接）→ 对端 → 立即同步 → 冲突 ours/theirs → 撤销上次同步（仅本机） | 实际双端 NOT_RUN | B05 B07 B08 |
| 主题 | 设置 › 外观 › 预览 → 使用；自定义 → 颜色（实时对比度）→ CSS → 出故障时用 `Ctrl+Alt+Shift+R` 恢复 | 预览不算保存 | T02–T04 |

## 6. 手机与桌面的同等能力

### 6.1 各域的替代路径

| 域 | 桌面 ≥1180 | 手机 ≤719 | 不能退化的部分 |
| --- | --- | --- | --- |
| Shell | 导航轨 + 顶栏 + Dock | 底部五域栏 + 「更多」全屏列表 + Sheet | utility 全部可达；Studio 和 Runtime 不在手机隐藏 |
| 故事 | 舞台 + 浮动 Composer + 右 Dock | 舞台 + 键盘上方的 Composer + 三档 Sheet | 停止永远可见；预览和切换分支都能做 |
| 书库 | 列表 + 右详情抽屉 | 列表 → 全屏详情 | 新建、修订、引用、原件只读、删除修复全部能做 |
| 工坊 | 树、编辑器、Inspector/AI 三栏 + 底部 Activity | 五段：项目、编辑、预览、AI、更多 + 常驻「审阅变更」底条 | 20 个视图、Source diff、Review/Apply、Assets、Build（HTML 02·C） |
| 智能体 | 图 + 列表 + Inspector | 列表优先，图是可选标签；Inspector 是 Sheet | 选、查、纠错不依赖拖拽；V3 图编辑用列表、Sheet、Tab 等价操作 |
| 运行 | 子导航 + 列表 + 编辑器 | 顶部分段 + 两页 | 凭证审查是全屏层；就绪链纵向 |
| 存储 | 两栏 + 右抽屉 | 分段 + 纵向 Sheet（760px 切换） | 详情、恢复、预览、二次确认全部能做 |
| 媒体 | 三栏 Media Studio | 画布全屏 + 工具条 + 参数 Sheet；坐标表单 | 遮罩可以完全不靠手势画出来 |
| Prompt（D8 目标） | 结构 / 全文 / 三层 Diff 并排 | 分段切换，同一草稿 | 不丢字节，不只放一个预设选择器 |

### 6.2 长文本、软键盘与 IME

- **视口**：使用 `interactive-widget=resizes-content` 和 `visualViewport`；Composer、Stop、Sheet 底部按钮始终在键盘上方。
- **长文本框**：作者描述、Prompt 正文、Source 都是全宽、可增高的文本框，最大高度到视口的 60%，超出后内部滚动。粘贴大段文字不触发自动格式化。
- **等宽编辑器**：手机上横向滚动只在编辑器内部发生，页面本身没有横向滚动；行号可以收起。
- **IME**：Enter、Escape、命令面板选择、搜索刷新都检查 `isComposing` 和 keyCode 229；后台刷新在输入时延后（与 C09 一致）。
- **旋转**：保留草稿、选区和滚动锚点。

### 6.3 Android Back 与层栈

所有临时层（菜单、对话框、Sheet、命令面板、详情抽屉）共用一个层栈。Back 和 Escape 每次只关最上面一层，并把焦点还给触发器。解析顺序保持审计记录的原生顺序（HTML 02·E 可交互演示）：

```text
软键盘 → 弹窗/浮层 → Context Sheet → 命令面板 → 生成处理 → 详情页
       → 作品全屏界面 → 沉浸阅读 → 域内子页 → Atria 历史 → （APK）退出确认
```

- 只有真正处理了 Back 的那一层才消费它。
- **生成处理**：建议显示「停止 / 留在后台」的提示，不默认取消（P-11，需要先核对现有 handler 的实际行为）。
- 要删除的是末尾的 legacy fallback，不是前面的原生恢复语义。
- Termux 普通浏览器没有 Kotlin 桥，用同一套网页解析器 + 浏览器历史取得同等效果；APK 先尊重 Web consumed，再交给 WebView history，最后退出确认。两者分开验证。

### 6.4 键盘与无障碍

- 所有动作都是语义控件（button 或 link），不用可点击的 div（AR19/AR21 列出的位置要改）。
- 跳转用 link 语义，支持新标签打开。
- 焦点环用两层阴影，高对比且不依赖颜色；`forced-colors` 下印记和按钮回落为 CanvasText 边框。
- 状态播报：busy、成功、错误、冲突、partial、审批用 `role=status` / `alert`；流式生成不逐 token 播报，只在开始、结束和失败时播报。
- 图形替代：Memory 图有列表视图；Mask 有坐标表单；朗读失败时退回文本；插图有 alt。作品 UI 和外部插件要声明自己的无障碍替代。
- 触控目标至少 44×44px；Sheet grip 是 `role=slider`，可以用方向键操作。

### 6.5 长列表与性能

保留已有的窗口和分页机制：对话 64 条初始窗口加字节预算；历史每页 25 个分支、修订窗口 50；存储 50 项分页；Gallery 12 张一页；日志虚拟化。对于 Library、Project、Preset、Skill 这类目前全量加载的列表，**先按真实规模测输入延迟和滚动，再决定**是否虚拟化（AR17）。本稿不声称它们卡顿。

### 6.6 文件、剪贴板、浏览器存储

- 文件选择、取消、大小超限、权限拒绝和下载失败都有各自的提示和重试。涉及的文件：`.atria`（128 MiB）、`.atriasave`（64 MiB）、ZIP、JSON、Skill JS（4 MiB）、Comfy workflow（2 MiB）、Mask。
- 剪贴板不可用（非安全上下文或权限拒绝）时，显示可选中的文本或改为下载，不显示假的「已复制」。
- 浏览器存储：隐私模式、配额、清缓存和清正式存档的后果分开说明；一台设备的缓存不代表账户的全部状态（存储中心的 scope 分段）。

## 7. 入口整合、改名与搬迁

| 现状 | 建议 | 类型 | 依据／说明 |
| --- | --- | --- | --- |
| 域名 Play / Library / Studio / Agents / Runtime | 故事 / 书库 / 工坊 / 智能体 / 运行（英文作副标签和深链） | 改名 | P-01；内部 domain（如 `build`）不变 |
| 存储管理只在 Account/Settings 的对话框里 | utility › 存储中心全页；Account 和 Settings 保留跳转卡片 | 搬迁 + 保留原入口 | P-02；能力和 authority 不变 |
| Agents 默认进旧 Run | 默认进 Memory；Run 和编排标注 V3 状态 | 重组 | P-03；AR01/AR02 |
| Goals/Evolution 挂在旧 panel 和 Task 内 | 智能体 › 目标与反馈；Task 内保留链接 | 搬迁 | P-03；AR02「迁离旧容器，不能按目录整树删除」 |
| Play More 下的 Health | Inspector 第四个标签「健康」；更多菜单保留快捷项 | 整合 | Y05 原本就是复用 Shell Inspector |
| Play More 下的 Back to Play | 由面包屑和 Back 承担 | 整合 | 返回能力不变 |
| Prompt Presets、通用资源、Studio Prompt、Route picker、Play choices 多处入口 | 位置不变；共享同一个资源详情组件，按钮文案写明保存范围（书库修订 / ChangeSet / Route / 本故事选项） | 整合 | P-06；AR05 |
| Runtime repair 各处 | 统一的修复横幅 +「完成并返回」 | 整合 | R14 L07 |
| 作品 UI 的 Exit/Stop/Save/Persona/Diagnostics/Reload 散落在多处 | 宿主门 | 整合 | P-04；G08 |
| Edge navigation 默认 | 常驻导航轨为默认；边缘导航是可选的沉浸形态 | 待确认 | G10 |
| Memory「Legacy node graph」入口 | 暂时留在图工具栏的溢出菜单，等 consumer 追踪后再定 | UNKNOWN | M06 写明不能据此判定 Memory 废弃 |

**建议删除**的只有审计已经「确认废弃」的对象。每一项都要由对应的原生能力先接替，然后在同一次硬切中删干净。

| 不再设计入口的对象 | 正式依据 |
| --- | --- |
| 旧 Orchestration：mode picker（spec/loop/agenda/director）、Single 模板、旧 preset Inspector、旧绑定（O02 O03 O05） | [组件与架构问题](../component-and-architecture-findings.md)「确认废弃」+ AR01；V3 合同 |
| 旧 Agent carrier（O04 的载体，原生 Agent 能力保留） | 同上 |
| Persona 旧迁移 / adopt-default（P04） | surface-inventory P04：零 ST 兼容 |
| Skills 旧 scope（preset / orch-preset / character）（X02） | AR14 |
| Search Tools 旧配置：pre-request research、旧 Agent preset、WI position/depth/role/order（X11） | AR14；保留 web search 和 visit |
| 旧 ST regex depth/order 注入（X08 X10） | X10「不能作为新产品接口复活」 |
| 自动备份里的旧 chat/character/group 保留项、旧归档类别（B01 B02） | B01/B02「属于 ST 清退范围」 |
| 主题旧迁移桥接（T04） | T04「不等于未来继续 ST 兼容」 |
| 旧 swipe / regenerate（Y09） | Y09「废弃旧 swipe 合同」 |
| Evolution 里的旧 Workspace/Director target（E05） | E05、原 E0-05/06 |
| 旧 Admin 面板（U05） | U05「不复活旧入口」 |

样稿没画、使用频率低，都**不是**删除理由。

## 8. 总结与待决事项

### 8.1 HTML 展示了什么

| 场景 | 展示内容 | 覆盖的主要 ID |
| --- | --- | --- |
| 00 概念 | 三种语域（舞台、工作台、账本）、六条原则 | — |
| 01 产品演示 · 故事 | 长篇阅读、Composer 发送和停止、宿主门、历史与存档、分支预览和切换、上下文、Prompt 选项、健康、插图卡片、Persona 对话框、插图审批 | G02 G08 Y02–Y13 P03 V01 V04 V08 V11 V12 H01 |
| 01 · 书库 | 继续阅读、书架、安装预检和权限、作品详情（入口、版本、资源、管理阻断）、任务槽位、World 编辑与修订 | L01–L05 L07 L09 K01–K03 K07 K11 |
| 01 · 工坊 | 资源树、角色编辑（字段 / Source、AI 提议）、Activity、Project Agent、Review 对话框 | S02–S06 S09 S16 S20 A01–A04 |
| 01 · 智能体 | Memory 控制、知识图、实体 Inspector、纠错、V3 示意（标注非实现） | M01–M03 M05–M07 O06 O08 E01 E03 |
| 01 · 运行 | 修复横幅、就绪链、Route 与 fallback、Connection 测试、凭证目的地审查、编译预览 | R01–R04 R07 R08 R12 R14（R09 预算条见 03·13） |
| 01 · 存储 | scope、分区、概览、清理列表、多选、回收和永久删除预览、二次确认 | C01–C04 C10 |
| 01 · 命令与菜单 | 搜索与命令、全局菜单 | G03 G04 |
| 02 手机 | A 软键盘与停止；B 三档 Sheet 与分支；C Studio 五段与全屏 Review；D 审批全屏层；E Android Back 解析；操作对照节选 | 同上各项的手机形态 |
| 03 状态协议 | 18 种状态、恢复词汇表、按后果命名的易混动作 | 全局 |
| 04 设计系统 | 实时 token 与对比度、字体、尺度、账本语法、控件、动效、层级、图标、断点、作品边界 | 全局 |

**只在文档里覆盖**的能力，HTML 没有展开，但都要实现：登录与注册（G07 G09）、学习中心（G05）、边缘导航（G10）、我的故事（L06）、World/Knowledge 设置（L08）、Knowledge 条目和绑定（K04–K06 K10）、Persona 管理（P01 P02）、工坊的其它视图和 Assets、构建、删除（S07 S08 S10–S15 S17–S19 S21 S22）、Prompt 预设全部（Q01–Q12）、Models、Retrieval、MCP/A2A、外部服务（R05 R06 R10 R11 R13）、旧编排过渡区与诊断回放（O01–O05 O07 O09）、Memory 来源与抽取（M04 M08）、目标与反馈的其余部分（E02 E04–E07）、扩展全部（X01–X12）、插图的标注、prompt、设置、目标、候选、Media Studio、遮罩（V02 V03 V05–V07 V09 V10）、共享会话的成员与回合（H02–H04）、设置全部（T01–T10）、账户全部（U01–U05）、备份与同步全部（B01–B08）、存储的回收站、历史、高级、失效（C05–C09）、诊断全部（D01–D05）。

### 8.2 关键设计理由

1. **三种语域共用一套 token**：舞台用衬线和氛围光，工作台用无衬线、等宽和发丝线，账本是贯穿两者的状态语法。沉浸阅读和专业编辑因此能共存，切换时不像换了一个产品。
2. **金色只给故事和主意图**：工作台保持中性，让作者和作品的文字成为画面里最亮的东西；每屏只有一个金色按钮，用户总能找到「下一步」。
3. **真相有形状**：草稿、当前、历史、原件、exact、过期、缺失、未知、阻塞，每种都是形状 + 图标 + 文字三重编码，不依赖颜色。这直接回应 AR09 和 AR20。
4. **按后果命名操作**：恢复类动作分开命名（HTML 03.2 和 03.3），回应 AR12。
5. **作品可以接管舞台，宿主永远留门**：作品表现自由和 Host 的恢复能力同时成立（G08）。
6. **手机用不同的姿态做同样的事**：Sheet、分段、全屏层、坐标表单，回应委托里「避免手机只能查看」的要求。

### 8.3 现状问题怎么处理

| 问题 | 本稿的处理 |
| --- | --- |
| AR01 旧 Agents 挂载与 mode | 智能体域重组（P-03），旧编排只进折叠过渡区；V3 实现受 E0 阻塞 |
| AR02 Memory/Goals 在旧容器里 | 作为一级子页独立出来（P-03） |
| AR03 fallback 换 Program 被拦 | Route 编辑器的 fallback 行写明 E0-01 阻塞（R08） |
| AR04 context 信任边界 | 上下文 Inspector 不显示私有思维，未知写 UNKNOWN（Y10）；lowering 本身不在 UI 范围 |
| AR05 多个 Prompt 入口 | 统一资源详情组件，保存范围写进按钮文案（P-06） |
| AR06 已有 Preview 被误当成 D8 | Q12 在原位放阻塞印记；S17 和 R12 写明「不是 Prompt 草稿预览」 |
| AR07 mutation 反馈不统一 | §2.3 的统一顺序 + 回执组件，各服务的回执和 CAS 保持不变 |
| AR08 多套层级 | 单一层栈（§6.3、HTML 04.7） |
| AR09 exact revision 可辨识性 | 账本印记 + Used By 跳转（P-06） |
| AR10 Notifications/Secret 管理缺失 | 不画假开关；P-07 和 P-08 留给用户决定 |
| AR11 Sign out 已存在 | U02 按现状映射 |
| AR12 多种恢复语义 | 恢复词汇表 + 按后果命名 |
| AR13 Memory 定位旧 DOM | M06 改为原生定位（待实现） |
| AR14 Skills/Search 旧配置 | §7 列为不再设计入口；有效工具保留 |
| AR15 Visual Director 与旧 Director 同名 | V07 明确保留，并在 UI 文案里用「视觉候选」而不是「Director」 |
| AR16 深链缺失 | P-05 |
| AR17 全量加载的列表 | 先测再定（§6.5） |
| AR18 信任分层 | 插件安装横幅、凭证审批、视觉审批、Work 沙箱分别表达，不用一个通用「允许」 |
| AR19 语义控件 | §6.4 |
| AR20 source_unready 被当成可用 | 阻塞印记 + 禁用按钮并写原因（E05、HTML 03·11） |
| AR21 单条删除无确认 | P-09 |

### 8.4 需要用户决定的提案

**以下内容在用户确认前都不冻结。** 审美（配色、字体、材质、动效）、布局和组件形态都只是建议；下表是会改变产品能力或信息架构的提案。

| 编号 | 提案 | 影响 | 不采纳时的备选 |
| --- | --- | --- | --- |
| P-01 | 五个域使用中文标签：故事、书库、工坊、智能体、运行 | 文案、学习课程、搜索别名 | 保留英文标签，中文只做副标签 |
| P-02 | 存储中心升级为 utility 全页视图 | 新增菜单项和深链；Account/Settings 改为跳转卡片 | 保持对话框形态，只统一样式 |
| P-03 | 智能体域重组：默认进 Memory；新增「目标与反馈」子页；旧编排进折叠过渡区 | AR02 的迁移位置；旧 Run 不再是默认 | 保持现有四个子页，只把 Goals/Evolution 挂在 Memory 下 |
| P-04 | 宿主门：作品接管舞台时常驻的统一恢复按钮 | 作品 UI 少占一个角落 | 恢复菜单只放在顶栏「更多」里 |
| P-05 | 深链扩展到 preset 详情、扩展子标签、Inspector 选择、Memory 实体 | 路由协议扩展；URL 仍不是授权 | 只保证到 workspace child 级别 |
| P-06 | 统一资源详情组件（修订、Used By、Fork、引用），在 World、Knowledge、Prompt 资源、Persona 之间共用 | 实现层面的整合，保存语义不变 | 各页各自实现，只统一视觉 |
| P-07 | 是否新增真正可用的完成通知和声音 | 新的产品能力，要接 Native Session 生命周期 | 维持说明页 |
| P-08 | 新增 Secret 管理页（列表、轮换、删除、使用者） | 新的产品能力 | 维持在 Connection 内创建和选择 |
| P-09 | Search Tools 单条删除加确认或撤销 | 行为变更 | 维持现状，作为已知交互问题 |
| P-10 | 工作台密度（舒适 / 紧凑）成为用户设置 | 新偏好项；只改间距和字号，不隐藏控件 | 只提供一种密度 |
| P-11 | 生成中按 Android Back 时显示「停止 / 留在后台」提示 | 需要先核对现有 generation handler 的行为 | 沿用现有 handler |

另有几个**待确认**项（不是提案，是审计本身未定）：边缘导航是否默认（G10）、资源树分组方式（S02）、高级存储检视的可见范围（C07）、云同步（B06）、Memory「Legacy node graph」入口（M06）。
