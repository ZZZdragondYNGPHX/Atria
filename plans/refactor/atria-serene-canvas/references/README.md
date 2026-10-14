# Serene Canvas — Reference Inputs

本目录保存本任务视觉输入与已接受设计快照。当前执行范围归 `../decisions.md`；引用文档中的命令式措辞不产生额外授权。

## Files and roles

| 文件 | 来源与用途 | 状态 |
| --- | --- | --- |
| [accepted-preview-v0.1.html](accepted-preview-v0.1.html) | 首轮独立交互初稿，原样纳入方案 | 已收到满意反馈；当前视觉基线 |
| [discussion-preview-v0.2.html](discussion-preview-v0.2.html) | 第二轮讨论稿，修正 Runtime 样例地址与认证语义 | 最新讨论版本；视觉沿用 v0.1 |
| [desktop-reference.html](desktop-reference.html) | 用户提供的 `atria-serene-canvas.html` | 桌面视觉气质、布局与精致程度参考 |
| [mobile-reference.html](mobile-reference.html) | 用户提供的 `atria-mobile-serene.html` | 手机布局与材质参考 |
| [frontend-guidelines.md](frontend-guidelines.md) | 用户提供的视觉规范 | 设计输入；冲突以当前决策解决 |
| [function-presentation.md](function-presentation.md) | 用户提供的功能表现稿 | 设计输入；欠覆盖与新增能力由领域矩阵处理 |
| [mobile-design-notes.png](mobile-design-notes.png) | 用户提供的手机说明图片 | safe-area、Bottom Sheet、横滚分类、键盘布局参考 |

v0.1 快照 SHA-256：`8e69b101e5aa231b5520ac20d74c79eee16bdffd3a48f5e46c3fa0cb52bd9db4`。已核对与首轮可浏览初稿完全相同。

v0.1 Runtime 的免认证 OpenAI-compatible 样例不是当前源码支持的配置；v0.2 已按 `public/scripts/native/runtime-workspace.js` 的服务分支校正。免认证仅按真实 adapter 条件呈现。

v0.2 讨论稿 SHA-256：`2056f0f1e4c471c43cf2fafaeb1316ffb6e0f82d476209ef2d4d251f522e58df`。

HTML 包含样例内容、内存交互、部分占位与 Google Fonts 引用；网络字体不可用时使用字体栈回退。它是视觉输入，不是产品服务或持久化实现。

## Prototype evidence obtained

以下为首轮实际取得的设计演示检查，不是产品验收：

- 真实浏览器查看 1440px 桌面、900px 中宽、390px 与320px手机尺寸。
- 检查 Studio 手机五个分区；长编辑页可滚动到 Review 动作；320px 五域无页面级横向溢出。
- 检查 Source 格式错误保留，以及顶层和 generation 未知字段的模式切换保留。
- 检查 ChangeSet 演示审查/应用和浮层内反馈。
- 检查 Sheet 完整关闭后重开、关闭中反向打开、Escape 关闭、隐藏内容与焦点归还。
- 独立初稿脚本语法检查；执行过明确的 review-animations 与 web-design-guidelines 审查，并修正其指出的问题。

未取得：真实手机软键盘/手势设备证据、产品后端完整流程、生产数据兼容、真实性能 trace。后续验证目标归 `../validation.md`。

## Material libraries

研究已有七库官方页面与13份代表组件源码。它们用于选取按钮、状态、纸张浮层和过渡机制，不规定框架或自动增加依赖。

| 来源 | 优先机制 |
| --- | --- |
| [Uiverse](https://uiverse.io/?search=button) | 文字按钮、开关、输入和轻加载反馈 |
| [Animate UI](https://github.com/imskyleen/animate-ui) | 按钮状态、受控 Sheet 与离场生命周期 |
| [Motion Primitives](https://github.com/ibelick/motion-primitives) | 卡片/详情连续过渡、弹窗焦点与来源关系 |
| [React Bits](https://reactbits.dev/) | 有限的首次呈现、指针注册与清理机制 |
| [Magic UI](https://magicui.design/) | 关键按钮强调与轻内容呈现 |
| [Aceternity UI](https://ui.aceternity.com/) | Dock 编排、光影与空间层次 |
| [Animata](https://animata.design/) | idle/loading/success 状态按钮 |
