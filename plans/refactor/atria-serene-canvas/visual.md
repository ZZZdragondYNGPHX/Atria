# Atria Serene Canvas — Visual Reference and Iteration

## Responsibility

本模块拥有视觉基线、初稿版本、HTML 迭代和实施对照方法。功能是否存在及覆盖程度归 [coverage.md](coverage.md)，基础设施替代归 [migration.md](migration.md)。跨模块范围见 [decisions.md](decisions.md)。

## Accepted reference

当前视觉基线：[accepted-preview-v0.1.html](references/accepted-preview-v0.1.html)。文件是首轮满意初稿的完整快照；桌面以 Studio 三纸工作台展示，手机为分区切换，同时包括 Play、Library 与部分 Agents/Runtime 示意。

当前讨论稿：[discussion-preview-v0.6.html](references/discussion-preview-v0.6.html)。沿用 v0.1 的纸墨、衬线标题、悬浮 Dock 与三张工作纸，Studio 默认展示 Actors；EntryPoints、UI 与 Assets 从资源纸进入。编辑在同一中纸中切换结构化/Source，审查纸先列关键差异，再展开完整基线/当前/草稿证据；手机沿五分区和 Bottom Sheet 展开。

历史讨论稿 [v0.2](references/discussion-preview-v0.2.html) 仅纠正 OpenAI-compatible 样例地址与认证语义；[v0.3](references/discussion-preview-v0.3.html) 展开 Runtime 配置与 Agents 四页；[v0.4](references/discussion-preview-v0.4.html) 展开 Play/Library；[v0.5](references/discussion-preview-v0.5.html) 展开 Library Prompt/Persona 与浅色 Settings。v0.6 沿用这些页面。阅读默认比例仍为桌面20px/740px、手机17px；字号偏好在演示中同步到 Play。各讨论稿均为内存演示，未替换 v0.1 已接受基线。

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

## v0.7 supplement

[v0.7](references/discussion-preview-v0.7.html) 在既定纸墨体系中补充项目首页、Project Agent 状态与人工审查、Source 文件列表、登录、账户、扩展、条件媒体与作品宿主的代表布局。保留 v0.6 链接和嵌入入口，不覆盖已接受快照。所有状态是内存演示；全局工具部分目前只给出代表入口与布局，不能视为完整工作流。

产品登录、项目首页、文件切换、任务状态、账户工具、图库/图片编辑及宿主控制已在既定纸墨体系内实施，并与该补充稿和 v0.1/v0.6 共同对照。没有新增产品能力、自动合并、强制覆盖或撤销已经发出提交。媒体补充仅演示遮罩、局部反馈和批准边界，不模拟真实提交成功。

## Current discussion focus

当前已接受的是 v0.1 的视觉方向与代表工作台效果，已纳入方案的 v0.6 提供完整代表交互。已授权产品重构完成；v0.7 继续作为可阅览的补充讨论稿，未成为新的已接受基线。以后新增能力或实质视觉改向仍需先更新 HTML 并讨论，不能以当前原型覆盖推定全部业务组合。

v0.3 已展开 Runtime 缺项与配置路径、Agents 默认时间线及证据详情。初次配置与运行信息层级按 `decisions.md` §8/§9。

v0.4 已展开 Play 与 Library 的日常代表任务，默认入口按 `decisions.md` §10 回到上次阅读。

v0.5 已展开 Library Prompt/Persona 编辑与浅色 Settings。资源列表继续沿用画廊域，编辑使用共享工作纸/Sheet，专业字段采用分组与逐步展开；长设置页为从账户菜单进入的工具工作纸，不增加一级 Dock 域。所有新页复用现有色彩、文字、控件和动效体系，只模拟已经存在的任务。主题管理与 Custom CSS 保留说明入口，完整兼容流程仍待设计。

v0.6 已展开 Studio Actors、EntryPoints、UI/Assets 的代表编辑。资源纸、编辑纸和 Agent 纸沿已接受构图，UI 与 Assets 各有入口；关键差异先可读，完整原文折入证据，冲突时默认展开三方对照。冲突/失败/保存回执沿同一审查纸，阶段变化归顶，键盘和错误反馈定位状态标题。高频资源/模式切换与文字输入即时响应；复用共享 Sheet，不给 diff 各行加动画。Agent 提议和旧 Prompt 仍是前版示意，不与新的非 Prompt 人工工作区混成权威提交。仍只修改企划与独立 HTML。

## v0.8 Dock supplement

[v0.8](references/discussion-preview-v0.8.html) 在既有温纸、白纸、衬线与胶囊材质中加入边缘隐藏 Dock；规则只见 [dock.md](dock.md)。v0.7 原样保留，v0.1 仍是已接受视觉基线。v0.8 随后获明确接受并授权实装，冻结本项交互的 [accepted-dock-v0.8.html](references/accepted-dock-v0.8.html) 与讨论稿一致。产品实施结果只归 Record。
