# 当前组件与服务复用

当前代码关系详见[源码剖析](../../refactor/atria-native-prompt-preset-deepening/baseline.md)。本文件只定义前端组织与复用方向。

| 组件／服务 | 当前作用 | 改造方式 |
| --- | --- | --- |
| Shell / NavigationAuthority / WorkspaceHost | 五域、工具、搜索、深链、返回和挂载 | 延续原入口与状态，不重建 Shell |
| tokens / primitives / components / Dock / Sheet | 材质、文字、控件、层级和反馈 | 将当前已确认设计与外部适用参考映射到现有 --atri-*；一个组件系统 |
| PromptEditor | Library、Preset、Studio 的原共用字段／JSON 编辑 | 同一组件补正文视图、编辑历史、显式大纲、原文缓冲与错误位置 |
| PlanDraft / GraphView / PlanWorkspace | 一份图草稿的 Canvas/List/Inspector 与历史 | 复用现有实现，补 Node Program；图几何位置继续只影响展示 |
| RunWorkspace / orchestration client | Timeline/Graph、费用、结果和控制 | 接续已挂载的 Host API，显示原结果与相应动作 |
| source / frontend / typed editors | Studio 文件、作品界面与字段编辑 | 保留原 Source 和 ChangeSet，复用适用的编辑能力 |
| resource rows / revision history / Used By | Library、Studio、Storage 的身份与引用 | 共用详情、精确引用、版本导航和返回；具体保存仍由原服务完成 |
| Library / Preset / Studio / Plan clients | 不同资源的保存、Apply、Publish、Binding | 复用客户端；不因表单相似增加通用发布步骤 |
| SessionRuntime / ConversationWindow | 正文、分支、历史窗口与作品 UI | 延续长文与输入流程，复用现有窗口／分页与选区 |
| Memory / Goals / Experience / Eval | 记忆、目标、反馈与可选质量功能 | 迁入对应原生入口，保留查询、来源定位、手动反馈和候选操作 |
| Visual / Media / Speech / Extensions | 图像任务、资产、语音和扩展 | 保留各自原任务与客户端；文本 Prompt 与 ImagePromptIR 各有编译链 |
| Storage / Backup / Recovery | 引用关系、清理、恢复与原任务结果 | 共用表现组件，保留每种操作的对象与结果 |

## 内容与信息层级

普通用户先看到阅读、资源或编辑内容。当前版本、保存状态与必要错误在附近显示；来源、Wire、完整 ID、费用和日志按需展开。长 ID 可复制，主列表优先显示名称和短版本。

原文编辑、字段输入和高频键盘路径即时响应；纸张和浮层动效延续现有组件。进入资源详情后能返回原查询、选中项和滚动位置；修复引用后能回到发起操作的对象。

## 当前需要接通的部分

1. Prompt 的显式顺序、条目身份与原 Host 结果统一。
2. 原编辑器补完整正文与同草稿历史，新资源／跨修订预览和独立样例另接后端。
3. V3 Node Program 选择接原 ModelPort 与各业务准备点。
4. Preset 分享使用完整 exact refs，处理多修订和私人派生升级。
5. Plan Fork/Derive、归档、删除由原 Plan 服务补齐，再挂页面动作。
6. 非 Session 视觉任务及有效 Memory/Goals/Experience 的完整入口按原业务接线。

外部稿的新主题、通知、Secret 管理、密度设置等提案按实际确认范围使用；旧来源中已经消失的容器和接口不再列为现状。
