# Windows、CachyOS Linux 与 Android Termux 功能要求

三端使用同一前端与原 Host 业务接口。本文件定义交互与平台差异。

## 运行形式

| 运行形式 | 保留的能力与差异 |
| --- | --- |
| Windows 浏览器 + Node | 完整作者／玩家／维护功能；键盘、长文本、文件选择／下载与剪贴板 |
| CachyOS Linux 浏览器 + Node | 相同功能；沿原启动／文件权限机制和系统字体 fallback，不创建另一套业务 |
| Android Termux + 浏览器 | Host 在 Termux，网页在 Chrome/Edge；完整创建、编辑、导入导出、Review/发布与维护。关闭网页不等于停止 Host；不承诺 OS 杀进程后自动续跑 |
| Android APK | WebView/file/download/Back bridge 属另一运行形式，不把 APK 专属能力用于代替 Termux 浏览器路径 |
| Electron | 仍使用同一产品前端；快捷键、外链、下载和窗口生命周期走原 wrapper |

手机访问远端 Host 时，`localhost/127.0.0.1` 指向各自设备；连接配置、凭证目的地和媒体发送 UI 明确实际目标。

## 桌面与手机的操作方式

| 功能 | 必须实现的操作 |
| --- | --- |
| 导航与搜索 | 磁吸 Dock 承载五域，顶栏保留搜索/工具/账户；手机所有域和 Settings/Extensions/Account/Diagnostics 可达，保留深链与返回上下文；窄屏原型用底边 Dock |
| 活动灵动岛 | 汇总原 Agent 任务/审批/错误，展开后可回原详情；窄屏活动带避开导航、作品 HUD、正文工具和软键盘，不依赖悬停查看必要信息 |
| Play | Inspector 默认关闭且入口可达；软键盘上方保留输入与 Stop；中文 IME 不误发，旋转／切页保留稿；选历史文本时不强制跳最新 |
| Library/World/Knowledge/Persona | 完整新建、编辑、修订、引用、Fork 与删除修复；不能只有桌面能写 |
| Studio / Agents 面板 | Studio 全 20 资源视图、Source、Review/Apply/Assets/Build 可达；控制栏/树/Inspector/AI/Activity 按需收起或调尺寸，窄屏转 Sheet/分段；长 JSON 与工具栏不遮焦点 |
| Prompt | 同 Draft 全文／结构化编辑、排序与继承、Authored/Effective/Wire、Diff、来源、独立样例与手动试读 |
| Graph/Memory | 图操作有列表／表单、上移下移和键盘替代；节点详情、查询和纠错可触控完成 |
| Sheet/Dialog/Review | 内容可滚动，主要动作可达；嵌套层按一次一层关闭并恢复焦点，dirty 内容按原编辑语义处理 |
| Storage/备份 | 详情、引用关系、清理范围、恢复与任务进度可操作；停止不撤销已成功对象 |
| Media/选文/Mask | 保留系统选区；工具条不遮选文，缩放不误绘；精确绘制有坐标输入替代 |
| 文件／剪贴板 | 支持原 `.atria/.atriasave/ZIP/JSON/Skill/Mask` 操作；取消／权限拒绝准确反馈；复制失败提供可选文本或下载 |
| 长任务 | 切页后可重读原任务与回执；Host 重启时按原状态恢复，不能用旧页面计时器冒充仍在运行 |

## 输入、返回与无障碍

- 沿原 Back Resolver 处理软键盘、局部弹层、Sheet、详情与应用历史；只有对应层实际消费时才停止。APK 的 Kotlin bridge 不参与 Termux 普通浏览器。
- IME/composition 和 keyCode229 不触发发送或全局快捷键。文本原生 Undo、编辑草稿 Undo、资源修订恢复与服务器效果分别处理。
- 原生 button/link/label 与清晰命名；焦点不落到隐藏内容；状态变化可读屏，流式正文避免逐 token 播报。
- 不以 hover、颜色、拖拽或 Canvas 作为唯一操作路径；触控目标、缩放、对比度、forced-colors 与 reduced-motion 沿统一组件实现。
- 沿现有分页／Conversation window、Gallery/Logs 等列表机制保留定位、选区和滚动锚点；只针对实际长内容需要改进，不预设性能平台或新增全局缓存。

断点、栏宽与视觉组件以实际统一设计为准。能力缺失列为相应功能的实现项。

Dock、灵动岛和面板的详细规则见[设计指导 §3.4–§3.6](design-proposal/atria-frontend-guidelines.md#34-磁吸导航-dock)。当前 HTML 的窄屏预览、本地活动和布局偏好不等于真实触屏设备、后台任务或跨设备同步已验证。
