# Workspace experience and navigation

## Responsibility

本模块拥有视觉与信息架构；数据输出及控制器接线在 [coverage.md](coverage.md)，通用操作状态在 [states.md](states.md)。

## Foundations

沿用 `public/css/atria-tokens.css` 的 `--atri-*` 语义 tokens、`atria-shell/appearance.js` 外观 authority、现有 icon 和 primitive。浅/深色使用已有偏好，不引入第二套主题存储。轻质浮动面板、安静分隔、蓝紫主操作与玻璃输入区建立层次；正文周围保留呼吸空间。材质需支持无 blur / Fast UI 回退。

系统控制使用既有 sans 栈；增加仅平台叙事正文的 serif token（中英均有系统回退，不要求远程字体）。字号服从真实 font_scale，长内容不靠固定高度裁切。元数据使用 sans，头像、角色/叙述者和回合在同一区域平行展示，不能隐藏到 hover。

保留 Environment 的 compact ≤719、medium ≤1179 分界与 visual viewport / safe area。手机点击区域至少 44px、输入字体至少 16px。减少动效设置与系统偏好均生效。

## Navigation contract

| 所属域 | 默认页 | 子任务 | 进入与返回 |
| --- | --- | --- | --- |
| Play | 继续故事/最近作品 | 阅读、历史与存档、上下文、会话工具 | 继续到确切 Session；退出返回游玩首页 |
| Library | 作品 | 世界与知识、提示词预设、用户设定；详情、安装、导入 | 分类与查询保留；详情返回原集合 |
| Build | 项目列表 | 20 类工作台视图、审阅、预览、模拟、构建 | 资源树指向确切对象；跨域回到拥有者 |
| Agents | 当前会话运行 | 编排、记忆、诊断 | 范围栏固定；回放明确区别于 live |
| Runtime | 用途路线与就绪情况 | 连接、模型、路线、检索、编译诊断 | 缺项修复保留启动来源，成功后可继续 |
| 全局工具 | 从导航辅助入口进入 | 学习、搜索、扩展、诊断、设置、账户 | 保持统一返回栈与当前任务上下文 |

保留现有 route identity、导航 authority 和 Back/Esc 顺序。文案、视觉顺序可变，业务 ID 不因新中文标签改变。深链、刷新、跨域拥有者跳转须恢复到具体对象，不只打开域首页。查询过期/删除/无权限时给有范围的恢复入口。

## Reading and tools

桌面正文是中心，输入区悬浮于底部；“历史与存档”默认关闭，点击顶栏入口展开。上下文、Prompt choices、共享和插图进入各自会话工具，呈现其真实能力和范围。保存/读取入口须能发现，不要求常驻完整工具面板。

手机阅读始终隐藏五域底栏，顶栏保留可见的全局导航入口；它与软键盘是否打开无关。输入区使用可视视口高度，长草稿和键盘不会遮挡发送/停止。身份入口紧邻输入区。管理类页面沿用 compact 全局导航，不强行复制阅读排版。

历史/恢复页明确只读与当前故事的差别，并提供返回当前；生成、停止、恢复、共享回合状态遵守实际控制器，不能因输入区外观可编辑就绕过禁用。

## Workspaces

Library 使用四类 scope 切换，各类自己的列表与详情；世界与知识保持不同实际编辑权限。安装/存档导入为完整流程页：文件与预检、权限/依赖审阅、结果与打开入口。详情标出确切版本，长 ID/hash 放详情披露。

Studio 为资源树、主编辑区、右侧工具、活动区。右侧检查器与 AI 互斥，切换保留各自任务状态。世界/知识/资产主编辑页中的“资料库引用”负责 Attach/Fork/Update/Review detach/Used By；完整字段及 Source 仍在同一资源页可达。手机按 Project / Editor / Preview / AI / More 单任务切换。

Runtime 首屏按模型用途解释缺少哪项，以及修复后如何继续；高级提供商参数、备用路线、Embedding/Rerank 和编译证据各在其所属页面。连接测试和编译预览使用不同动作与结果语义。

Agents 顶部固定会话范围，默认 Run；编排、记忆、诊断切换不暗中重绑定会话。Extensions 中 Skills、Plugins、官方插图负责管理；选文标注、插图卡片与共享提交在会话工具中。设置/账户沿用现有子控制器。

## Search and custom presentation

搜索为按所属工作区分组的快速面板，显示范围、加载和来源失败；键盘上下、Enter、Esc 与焦点返回可用。实体及子项结果由拥有者解析，携带确切对象和必要修订。部分失败只重试对应来源，不清空其他结果。

作品的原生/混合/自有内容区分别遵守 Native Frontend v3 的呈现所有权。平台 serif 和外壳 CSS 不渗透作品 Shadow DOM 或覆盖自有字体。宿主恢复入口独立于作品内容区：退出、停止、保存、诊断、重载按实际 capability 提供；作品内容崩溃不能同时丢失该入口。

用户设定选择在自有界面中通过 Host 控制入口可达，不能要求游戏包访问旧 persona 全局。具体读写 scope 和共享权限由 [personas.md](personas.md) 定义。
