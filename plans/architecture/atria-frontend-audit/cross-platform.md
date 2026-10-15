# Windows、CachyOS Linux 与 Android Termux 跨端审计

本轮只有仓库源码和 CSS 证据；**Windows 产品浏览器、CachyOS Linux、Android Termux、Android APK、屏幕阅读器和真实设备性能均 NOT_RUN**。在 Windows 上读文件不等于产品的 Windows 验收；静态断点不等于手机功能等价通过。

## 端与运行所有权

| 端 | 当前源码路径／能力 | 需要保留的产品语义 | 尚无证据 |
| --- | --- | --- | --- |
| Windows browser + Node | 通用 Shell/Native endpoints，Start.bat；web download/clipboard/file chooser | 本机 Host 原权威、完整作者/玩家/维护能力；键盘与长文本输入即时 | 浏览器实际 workflow、缩放/高 DPI、文件保存/还原与性能 |
| CachyOS Linux browser + Node | 同一 web client；start.sh、Node native addons；没有据此证明 CachyOS 专属 adapter | 与 Windows 相同 Host/Source/CAS/Run/Approval；Linux 文件名/权限、字体 fallback 和 shell launch 可用 | CachyOS/Wayland/浏览器/SQLite/窗口组合和三端功能对等 |
| Android **Termux + Chrome/Edge** | `docs/development/TERMUX_BROWSER.md`、scripts/termux runner；Node 在 Termux，浏览器通过 loopback | 完整配置、编辑、导入导出、Prompt/Graph/List/Sheet、Review/审批；浏览器关闭不等于 Host cancel | 真机软键盘/Back/触控/内存/WebGPU/下载、OEM 后台存活；不能许诺系统级后台唤醒 |
| Android APK（另一运行形式） | MainActivity/WebView、原生 file chooser/download/blob bridge、auth、BackNavigationPolicy、runtime manager/service、crash export | 能力有相同业务合同，但包装层特有入口须独立设计/验证 | Kotlin/原生 Node 打包、WebView bridge/前台服务/诊断导出的真机实测；不能当 Termux 证据 |
| Electron wrapper | `src/electron/index.js` 启 Node server 再开 BrowserWindow | 产品 UI 仍是同一前端，不新增第二业务 writer | Windows/Linux Electron 特有快捷键、外链、下载和窗口生命周期 |

Termux 文档记有 setup、start/status/logs/doctor/restart/stop/update 与 native SQLite 修复策略；它们是启动/诊断支持，不是本次已执行结果。`localhost/127.0.0.1` 指向当前 Host 所在设备；不能让手机与远端电脑的同名地址在 credential/image target UI 中隐性互换。

## 响应式与操作等价矩阵

当前 Shell 的 compact ≤719、medium 720–1179、expanded ≥1180 来源于 `atria-shell/constants.js`；这是**现有实现事实，非新视觉断点的冻结**。environment 使用 visualViewport、pointer、reducedMotion、focus 和 keyboard gap；compact 底部导航，medium 图标轨，expanded 多栏。最终外观/断点可讨论，业务操作等价不可删。

| 功能／交互 | 当前静态支持 | 全端设计输入／验证要求 | 本轮状态 |
| --- | --- | --- | --- |
| 五域与 utility 发现 | Shell rail/sidebar/bottom nav、menu、Command | 手机仍能进入 Settings/Extensions/Diagnostics/Account/Studio/Runtime；键盘焦点与触控命中不丢 | NOT_RUN |
| Play 阅读/输入 | VisualViewport keyboard detection，composer IME guards；bounded ConversationWindow；Jump latest | 软键盘不遮输入/Stop；旋转不丢稿；中文组合、长段粘贴、选择文本时不误发送/强滚 | 源码已见；真机 NOT_RUN |
| Library/World/Knowledge/Persona | master/detail、搜索/分页、dialog、revision editor | 手机完整新建/修订/引用/原件只读/删除修复；不是 desktop 能编辑、手机只读 | NOT_RUN |
| Studio | MOBILE_VIEWS Project/Editor/Preview/AI/More；Inspector/AI 切换与 activity | 全 20 视图、Source diff/Review/Apply/Assets/Build 都可达；窄屏长 JSON、横向内容、toolbar 不覆盖 focus | 静态路径见 S02；NOT_RUN |
| Prompt D8 | 当前 simple/advanced；正式 D8 单 Draft raw/structured/Effective/Wire/Diff 尚缺 | 手机提供完整全文、结构、Diff、source Inspector；不能只放预设 selector；不丢 byte/作者原文 | BLOCKED/设计；NOT_RUN |
| Agents/V3 Graph | 当前旧 graph/list；未来 V3 D8 为 List/Sheet/Tab 等价方案 | Node/Edge/参数/绑定/Validate/Publish/Approval/Recovery 全部不依赖精确拖拽；图编辑要触控与键盘替代 | 目标合同，完整 UI 未接通 |
| Memory 图/列表 | Cytoscape tap + entity/relation 列表、过滤/Inspector、维护面板 | 选/查/纠错可键盘和触屏完成；图数量上限和列表截断明示；source locator 加载合法时间线 | 部分静态；NOT_RUN |
| Compact Sheet | drag + grip keyboard controls、pointercancel/lostpointercapture、半/全态 | Back/取消/focus restore、嵌套滚动、软件键盘、重复开关和拖动中断正确；不要求具体曲线审美 | NOT_RUN |
| Storage Center drawer | 最新main新增detail dialog；drawer以760px切轴，与Shell断点各自服务实际布局；Tab/Close/Escape、drag cancel、reduce-motion、IME刷新延期 | 手机可完成详情/恢复/预览/二次确认，不仅查看；异步detail与scope切换、前后层focus和scroll须验证；不由本审计批准其视觉 | 源码增量已复核，运行NOT_RUN |
| Annotation/Media | phone long-press selection 说明、canonical range；mask pointers/pinch、矩形坐标替代 | 系统选区 handle 可调、工具条不遮选文；遮罩坐标准确、缩放不误绘、keyboard 也能完成 | NOT_RUN |
| 文件和下载 | browser File/Blob/anchor；APK 额外桥接 | `.atria/.atriasave/ZIP/JSON/Skill JS/Mask` 选择取消、保存位置、大小错误、权限拒绝、失败重试 | NOT_RUN |
| Clipboard/复制 | 多处 copy/fallback/export | 非安全上下文/权限拒绝时给可选文本或下载；不能无反馈假复制成功 | NOT_RUN |
| Browser storage | local/session storage、IDB、CacheStorage、quota 能力探测；browser resources 和 server 分开 | private mode、配额、清 cache 和清正式 Save 的后果必须辨识；一个设备的缓存不是账户全部状态 | NOT_RUN |
| WebGPU retrieval | browser embedding model inventory 与 unavailable error | 不具 WebGPU 可选其他原生 provider，不删 Memory/知识能力；下载/显存与 fallback 状态说明 | NOT_RUN |
| 长任务 | server-owned Media/backup/storage、V3 单 Host 目标；UI polling可 dispose | 切页/关闭/恢复后显示真实 receipt；后台被 OS 杀要 Host restart/reconcile，不制造“仍在执行”假象 | NOT_RUN |

## Android Back 与导航

源码 [back-resolver](source-map.md#platform) 的顺序为：keyboard → modal/popover → context Sheet → Command → generation handler → detail → full-game → immersive → workspace child → Atria history → 当前 legacy fallback。每步只有实际 handler 返回 consumed 才结束。APK 的 `BackNavigationPolicy.kt` 先尊重 Web consumed，未消费才 WebView history，最后退出确认。

Termux 普通浏览器不运行 Kotlin MainActivity；必须通过浏览器 history/Navigation Authority 和网页局部 Back 取得同等效果。未来删除 legacy fallback 时要保留原生 transient/dirty/recovery 语义，而非把 Back 直接映射成退出应用。上述顺序/软键盘消费没有本轮真机证据。

## 无障碍与输入要求

| 检查项 | 已见代码／未确认项 | 后续需要证明 |
| --- | --- | --- |
| 语义控件/标签 | 原生 editors 多用 label/button/aria-label；部分旧 Search Tools 仍有可点击 div，旧图/icon需检查 | 键盘可操作、命名和角色正确；不能只靠 hover、颜色、图形/拖拽 |
| Focus | modal/Persona trap、menu Arrow、Sheet grip、路由 heading focus、restoreFocus 有实现 | 所有弹窗/二次确认关闭后归原触发器；虚拟列表/切页不让焦点落到隐藏内容；tab 顺序 |
| Live feedback | 多处 role=status/alert/output；busy 和 failed 各自实现 | 请求中、成功、错误、冲突、partial 和审批都可被读屏感知，避免流式每 token 过度播报 |
| 长文本/中文/IME | composer 和 Shell 主要快捷键有 isComposing/keyCode229；Source/editor 普通文本 | 各子 editor/第三方 panel 不能假定全部覆盖；粘贴、大纲定位、输入撤销和选区保持 |
| Reduced motion / contrast / zoom | CSS/Environment 有相关规则；主题有 contrast note；App/Work environment传递偏好 | 新 UI 对系统与账户设置一致响应；放大/forced-colors不丢功能；本研究不确定审美曲线和字体 |
| 图形/媒体替代 | Memory 可列表、Mask 可坐标输入、Speech失败可读原文、图片有 alt路径 | 作品自定义 UI 和外部插件也要声明可访问替代；不能把 raw Canvas 当天然无障碍 |

## 长列表和性能事实

| 区域 | 已有策略 | 仍需实测的实际问题 |
| --- | --- | --- |
| Conversation | 64 条初始窗口、字节预算、cancellable range、height cache、pressure shrink | 超长单条 prose/媒体、读历史和新流并行、滚动锚点/选区、手机内存 |
| History | branch 25/页、revision 50 窗口 | 深分支、破损 lineage、筛选保持位置；窗口只是 UI 不代表后端全量开销有界 |
| Storage / Gallery / Run / Logs | 50 项分页、12 图分页、Run paged、logs virtual rows | 数据大时 query/measure/parse成本、图片解码、任务轮询、UI 切换响应 |
| Library / Project / Preset / Skill | 部分本地全量搜索、DOM list 和后端返回集合 | 资源和长文本规模下的输入延迟、内存、GC、可达性；按测量决定分页/窗口/Worker，不预先宣称卡顿 |

静态 `transition`、`blur`、DOM 数量和 `will-change` 只能提示检查点；本轮没有 FPS、帧时、input latency 或设备内存测量，不能声称完成 performance audit PASS。
