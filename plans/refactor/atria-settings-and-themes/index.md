# Atria 设置界面与原生主题重构 — Plan Index

> 执行规则入口：[Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

- Task ID: `refactor/atria-settings-and-themes`
- Primary Workspace: `main`；本 Bundle 属于独立 `docs` 工作空间。
- Design status: **Approved**。
- Implementation status: **Completed (I1—I4)**；
- Design date: 2026-10-15。
- Source baseline: `main@60aca695726893e298b7d485f300c6efef3b79fd`。
- Implementation Record: [atria-settings-and-themes.md](../../../records/refactor/atria-settings-and-themes.md)，记录真实实现 HEAD、阶段结果、失败修复与交付状态。

## 目标

将设置从“原生常用偏好 + 旧主题 DOM 适配”的过渡界面，重构为符合现有 Serene Canvas 设计语言的完整设置工作区；恢复五个旧主题在新前端中的实际配色能力，并支持浅色、深色、跟随系统及可取消预览。

本任务同时处理界面组织、主题呈现、真实保存反馈与用户资产兼容。切换下拉值成功、旧数据仍存在，均不能单独证明主题或设置有效。

## 设计边界与权威

| 范围 | 已确定方向 | 详细权威 |
| --- | --- | --- |
| 页面结构 | 桌面分类侧栏与内容工作纸两列；手机分类列表进入子页；继承 Serene Canvas 的纸墨、字体与空间层级 | [settings-ui.md](settings-ui.md) |
| 明暗与主题 | 日间、夜间分别选主题；保留五个旧主题名称和配色气质，适配新组件；Serene Canvas 为日间默认 | [themes.md](themes.md) |
| 定制与交互 | 配色与主题附带高级 CSS；一次临时预览、明确确认或取消；个人行为与辅助偏好独立于主题 | [themes.md](themes.md) |
| 用户兼容 | 首次升级保留现观感与个人配置；新用户默认跟随系统；旧格式转换、CSS 启用状态和重名另存有明确规则 | [migration.md](migration.md) |
| 旧设置 | 按当前 Native 职责归位；旧聊天专属项退出主设置并保留兼容数据 | [settings-ui.md](settings-ui.md) |

本轮不新增背景图或透明度的可视化控制，不恢复旧聊天布局，不迁移技术栈，不建设主题市场。显示模式与主题槽不是作品、会话或工作区的多级偏好系统。

基础组件、Shell 导航、Environment、settings 服务、NamedDocRepo、语言和各域运行权威继续复用；不另建主题仓库、路由器或配置持久层。

## 与已有方案的关系

- [Serene Canvas](../atria-serene-canvas/index.md) 继续拥有全产品的既定视觉气质；其首轮“只做浅色”范围不再限制本任务的主题扩展。
- 本任务对设置、主题、相应升级与导入流程提供后续详细权威，不重开五域、Dock 或整个产品的信息架构。
- 本轮接受的是文字构图、交互与范围，没有新制作或接受独立高保真 HTML。不得宣称已有新像素稿。
- 同期的资源清理、账户、Runtime、Agents 等独立任务继续拥有各自职责。本页只提供相关入口，不接管其服务或重新实现其功能。

## 模块图

| 模块 | 唯一详细职责 | 依赖 |
| --- | --- | --- |
| [audit-and-research.md](audit-and-research.md) || — |
| [settings-ui.md](settings-ui.md) | 构图、分类、设置搜索、普通偏好反馈、旧条目归属 | 当前 Shell / Native authority |
| [themes.md](themes.md) | 主题模型语义、颜色覆盖、CSS、模式与日夜槽、预览编辑状态 | 当前 tokens / settings 服务 |
| [migration.md](migration.md) | 首次升级、默认值、旧资产保留、原生与旧格式导入导出、冲突处理 | `themes.md` |

## 实施阶段与按需阅读

### I2 — 原生主题与用户资产

完成主题解析、日夜选择、系统模式、五款深色配色、Serene Canvas、语义 tokens 与兼容桥接；接通升级、导入导出和真实保存。先保证资产与状态正确，再由界面调用这些权威。

### I3 — 设置呈现与交互

实现桌面分类、手机子页、搜索定位、原生控件、配色/CSS 编辑及可取消预览；完成有真实 Native 对应的偏好迁移与保存反馈，保留其余兼容数据。

## 当前范围之外

- 为五个旧主题各自再制作浅色衍生版。
- 独立阅读字号、阅读宽度等尚无 Native 持久化对应的新偏好能力；当前全局缩放应准确命名。
- 背景图库、透明度/模糊强度编辑器、皮肤布局编辑器、跨主题全局个人 CSS 叠加层。
- 为旧气泡、Waifu、MovingUI、swipe、旧消息编辑等重新建立产品入口。
- 仅因旧 key 或旧 handler 尚存在而恢复功能，或把旧媒体开关当成 Native 作品权限。

以上范围若需实质变化，更新对应设计；现有范围内的正常工程选择不另设审批。
