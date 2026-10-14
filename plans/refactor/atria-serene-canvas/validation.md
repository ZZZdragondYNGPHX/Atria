# Atria Serene Canvas — Validation

## Responsibility

本模块定义本任务的验收目标。通用执行方式和 API 测试限制归 [Governance §12 / §13.1](../../../README.md#12-execution-adapters)，不重复增加次数、模型、阶段许可或人工实机门槛。

## Prototype validation boundary

各版已取得的浏览器证据见 [references/README.md](references/README.md)。这些证据只表明设计演示可阅览与操作，不证明实际产品、后端、真实软键盘或设备性能已验收。

## Visual and responsive acceptance

- 实际浏览器对照 `visual.md` 的当前已确认 HTML：布局比例、排版、密度、纸张材质、导航、细节状态与动效连续性。
- 检查 expanded / medium / compact 以及对应边界；最小支持宽度、长中文/英文、文本缩放和横屏下入口可达，无页面级横向溢出。
- safe-area 与 visual viewport 纳入布局；长内容能滚到主要动作，Composer 与 Dock 不叠压，手机 Inspector/详情沿 Bottom Sheet 体系。
- 全屏作品接管、插件空/错状态和全局恢复入口保持可操作。

## Interaction acceptance

覆盖 hover、focus、pressed、disabled、loading、success、error，快速重复操作、中途取消、关闭中重开、跨域/会话变化与迟到响应。

检查键盘、触屏、IME、Tab/Escape/返回顺序、焦点约束和归还、隐藏内容不可进入焦点路径、语义名称和状态通知。检查系统与应用减动偏好，手势与滚动可以中断，正文不会因演示动效延迟可读。

## Behavior and data acceptance

- Play 发送/停止、用户输入接受边界、Draft/Revision 发布、失败恢复与流式正文；历史只读、分支切换、存档导入导出和精确依赖。
- Library 按 [coverage.md](coverage.md) 中实际资源类型验证原件的只读或编辑路径、不可变修订、引用阻碍与缺版本修复；安装权限/依赖预检和条件媒体的原有批准语义。
- Studio 草稿保护、结构化/Source 无损切换、ChangeSet Review/Apply、冲突与失败、AI 提议与人的提交权威、预览/模拟/构建。

Studio 本轮代表流程进一步检查：Actor/EntryPoint 的受支持结构与引用、UI 的 `frontend.patch`/文件 `source.write` 区别，以及 Assets 变更的文件/manifest 联动。Review 的检查信息不等同于完整 Validate 通过；服务验证失败时 `resultingRevision=null`，提交成功但刷新失败时保留新修订回执，锁定新写入并仅重读已提交版本。具体能力事实归 `coverage.md` §5，不从故障演示控件推导新接口。
- Runtime 无认证连接、模型发现与选择、精确 Route 引用、fallback、Compile preview 不发请求。
- Settings/Account/Extensions/backup 的配置与数据兼容、取消/失败回退、现有权限及恢复语义。
- 原生化后使用真实生成、取消、会话和扩展行为验收替代已退出的 selector 假设；旧 DOM 存在与否不作为永久功能契约。

## Performance and evidence

按实际改动先执行针对性静态/单元/集成检查，再检查浏览器完整流程。仅在新改动、失败或明确风险下扩大范围。

在流式生成、密集工作台、长列表和浮层开关场景观察实际动画；发现卡顿再用 trace/性能分析定位布局、绘制、主线程、blur 或状态更新原因，并做相关修复复测。保留没有验证的真实设备或性能缺口，不把桌面模拟结果写成实机证据。

产品实施结果按 Governance 写入同一 Record；本 Plan 不承载逐阶段实施历史。
