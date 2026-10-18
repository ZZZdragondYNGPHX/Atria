# Serene Canvas — Reference Inputs

本目录保存本任务视觉输入与已接受设计快照。当前执行范围归 `../decisions.md`；引用文档中的命令式措辞不产生额外授权。

## Files and roles

| 文件 | 来源与用途 | 状态 |
| --- | --- | --- |
| [accepted-preview-v0.1.html](accepted-preview-v0.1.html) | 首轮独立交互初稿，原样纳入方案 | 已收到满意反馈；当前视觉基线 |
| [discussion-preview-v0.2.html](discussion-preview-v0.2.html) | 第二轮早期讨论稿，修正 Runtime 样例地址与认证语义 | 历史讨论版本；视觉沿用 v0.1 |
| [discussion-preview-v0.3.html](discussion-preview-v0.3.html) | Runtime 配置路径与 Agents 四页的交互初稿 | 历史讨论版本；未替换已接受基线 |
| [discussion-preview-v0.4.html](discussion-preview-v0.4.html) | Play 会话/历史/存档与 Library 详情/资源编辑的交互初稿 | 历史讨论版本；未替换已接受基线 |
| [discussion-preview-v0.5.html](discussion-preview-v0.5.html) | Library Prompt/Persona 与浅色 Settings 的交互初稿 | 历史讨论版本；未替换已接受基线 |
| [discussion-preview-v0.6.html](discussion-preview-v0.6.html) | Studio Actors、EntryPoints、UI/Assets 编辑与 ChangeSet 冲突/失败恢复 | 完整前版；未替换已接受基线 |
| [discussion-preview-v0.7.html](discussion-preview-v0.7.html) | 入口、Project Agent、Source 文件列表及全局工具代表布局 | 页面补充稿；未替换已接受基线，全局工具仍需完整操作展开 |
| [discussion-preview-v0.8.html](discussion-preview-v0.8.html) | 边缘隐藏 Dock、桌面唤出、触屏把手与长按换边；继承 v0.7 页面 | 已接受的 Dock 讨论稿；产品证据单独归 Record |
| [accepted-dock-v0.8.html](accepted-dock-v0.8.html) | 与 v0.8 字节一致的已接受 Dock 交互快照 | 本项 Dock 实施依据；不覆盖整体 v0.1 视觉方向 |
| [desktop-reference.html](desktop-reference.html) | 用户提供的 `atria-serene-canvas.html` | 桌面视觉气质、布局与精致程度参考 |
| [mobile-reference.html](mobile-reference.html) | 用户提供的 `atria-mobile-serene.html` | 手机布局与材质参考 |
| [frontend-guidelines.md](frontend-guidelines.md) | 用户提供的视觉规范 | 设计输入；冲突以当前决策解决 |
| [function-presentation.md](function-presentation.md) | 用户提供的功能表现稿 | 设计输入；欠覆盖与新增能力由领域矩阵处理 |
| [mobile-design-notes.png](mobile-design-notes.png) | 用户提供的手机说明图片 | safe-area、Bottom Sheet、横滚分类、键盘布局参考 |

v0.1 Runtime 的免认证 OpenAI-compatible 样例不是当前源码支持的配置；v0.2 已按 `public/scripts/native/runtime-workspace.js` 的服务分支校正。免认证仅按真实 adapter 条件呈现。

HTML 包含样例内容、内存交互、部分占位与 Google Fonts 引用；网络字体不可用时使用字体栈回退。它是视觉输入，不是产品服务或持久化实现。

## Prototype evidence obtained

- 真实浏览器查看 1440px 桌面、900px 中宽、390px 与320px手机尺寸。
- 长编辑页可滚动到 Review 动作；320px 五域无页面级横向溢出。
- 执行过明确的 review-animations 与 web-design-guidelines 审查，并修正其指出的问题。

未取得：真实手机软键盘/手势设备证据、产品后端完整流程、生产数据兼容、真实性能 trace。

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

v0.6补充读取[Motion Primitives Dialog源码](https://github.com/ibelick/motion-primitives/blob/main/components/core/dialog.tsx)、[Animate UI AlertDialog](https://animate-ui.com/docs/primitives/radix/alert-dialog)及[Radix异步受控示例](https://www.radix-ui.com/primitives/docs/components/alert-dialog#close-after-asynchronous-form-submission)：采用关闭意图→退出→native close的生命周期，以及异步提交由状态决定关闭的机制。Motion Primitives该示例未提供完整trigger焦点保存，继续沿Atria已有焦点归还；不照搬默认变体或添加React依赖。高频树/Source/差异行不增加入场动画。
