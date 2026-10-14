# Atria Serene Canvas — Visual Reference and Iteration

## Responsibility

本模块拥有视觉基线、初稿版本、HTML 迭代和实施对照方法。功能是否存在及覆盖程度归 [coverage.md](coverage.md)，基础设施替代归 [migration.md](migration.md)。跨模块范围见 [decisions.md](decisions.md)。

## Accepted reference

当前视觉基线：[accepted-preview-v0.1.html](references/accepted-preview-v0.1.html)。文件是首轮满意初稿的完整快照；桌面以 Studio 三纸工作台展示，手机为分区切换，同时包括 Play、Library 与部分 Agents/Runtime 示意。

当前讨论稿：[discussion-preview-v0.2.html](references/discussion-preview-v0.2.html)。v0.2 仅修正 Runtime 的 OpenAI-compatible 样例：完整 `/v1/chat/completions` 地址与 Stored Secret 引用，避免把该 adapter 演示为免认证；构图、配色与工作台布局保持 v0.1 基线。配置字段是演示数据，不冻结为产品支持范围。

原始 [桌面稿](references/desktop-reference.html)、[手机稿](references/mobile-reference.html) 和 [手机设计说明](references/mobile-design-notes.png) 继续提供视觉气质与布局依据。原始 Markdown 是待核实设计输入，其中 React/Vue 重写、选文重生成等内容的处置由当前决策决定。

## Design character

| 领域 | 基线表达 | 后续展开方式 |
| --- | --- | --- |
| 环境 | `#F9F8F6` 温纸底板、微弱顶部光感 | 沿用画布，避免把全局页切成厚重导航条和密集边框 |
| 纸张 | 实白工作纸、轻高光边、柔阴影、24px 主纸圆角 | 按角色区分内容纸、工具纸和暂态纸，密度变化保持材质一致 |
| 文字 | 深灰墨色；衬线标题/叙事、sans 工具、mono 技术内容 | 中文宋/明体与英文 serif 配对；保留字体缩放和可读的次要文字 |
| 点缀 | 小面积朱红与蓝色 | 用于重点、草稿和状态；语义同时通过文字与图标表达 |
| 导航 | 桌面左侧悬浮 Dock；手机底部胶囊与小点选中态 | 五域均有可发现路径，手机高级域/工具可通过账户菜单与搜索抵达 |
| 阅读 | 窄幅正文、无聊天气泡、轻角色与时间信息、悬浮 Composer | 长内容、流式文本、只读/恢复与条件媒体沿同一阅读体系展开 |
| 创作 | 资源纸 + 编辑纸 + 可收起 Agent 纸，活动区按需展开 | 高密度表单、代码与证据保留清晰分组；不因留白删除专业能力 |
| 手机 | 20px 基础边距、safe-area、Bottom Sheet、横滚分类、分区切换 | keyboard 与 visual viewport 决定 Dock/Composer 安置；不能只缩小桌面三栏 |

原型 token 是可浏览设计输入。产品实现将语义映射到既有 `--atri-*` token/组件入口，避免新旧主题系统并行。颜色、字号、间距、图标、层级和状态补充均由同一系统管理。

## Interaction and motion

- 按压、文字变色、Tab 标记、禁用与请求反馈必须清晰；未完成的演示状态不能被写成产品现成功能。
- 纸张浮层保留柔和归位、轻遮罩和静态材质。打开、关闭、反向、拖动与取消从当前可见状态继续，完成回调只清理自己的操作。
- 卡片到详情保持封面与纸张的空间连续性；正文保持阅读稳定。高频键盘路径即时响应，触屏不依赖 hover。
- reduced-motion 改变位移与弹性，保留纸色、阴影与状态反馈；透明度偏好单独处理。
- 具体实现按任务读取已安装 Skills：视觉使用 frontend-design / emil-design-eng；控件使用 microinteractions；逐页动效机会使用 find-animation-opportunities；实现使用 animate / motion；手势使用 apple-design；实际卡顿使用 animation-performance；完成后明确调用 review-animations 和 web-design-guidelines。
- 素材研究对应 [references/README.md](references/README.md) 的七库链接。抽取适合的机制，统一 tokens 与动效；直接复用源码时核对对应文件的许可，不能假设各库许可相同。

## HTML iteration and implementation comparison

1. 每个讨论回合先读取当前已接受稿与当前领域需求，继续维护同一份可浏览讨论稿。
2. 有实质视觉/功能呈现变化时产生新讨论版本，记录此次改了什么、哪些页仍未展开。已接受快照不被未讨论稿覆盖。
3. 新版本获得接受后保存新快照，并更新本模块的当前基线路由；旧版保留以比较变化。
4. 正式实施将浏览器结果与对应已确认稿比较：构图、纸张比例、字体层级、密度、材质、导航、工具与状态的位置关系都需要一致。
5. 常规实现细节可在确定的系统内完善；新能力或实质视觉改向按 `decisions.md` 的边界处理。

初稿中的内存演示、模拟生成、固定验证结果和占位页是设计演示设施。正式产品逻辑继续连接真实服务，不复制这些演示实现作为业务权威。

## Current discussion focus

当前已接受的是视觉方向与代表工作台的效果。下一步按 `coverage.md` 补全 Runtime/Agents、登录引导、全局工具与异常/只读/恢复状态的 HTML；具体内容需讨论，不能声称 v0.1 已覆盖完整产品。
