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
| [discussion-preview-v0.7.html](discussion-preview-v0.7.html) | 入口、Project Agent、Source 文件列表及全局工具代表布局 | 最新补充稿；未替换已接受基线，全局工具仍需完整操作展开 |
| [desktop-reference.html](desktop-reference.html) | 用户提供的 `atria-serene-canvas.html` | 桌面视觉气质、布局与精致程度参考 |
| [mobile-reference.html](mobile-reference.html) | 用户提供的 `atria-mobile-serene.html` | 手机布局与材质参考 |
| [frontend-guidelines.md](frontend-guidelines.md) | 用户提供的视觉规范 | 设计输入；冲突以当前决策解决 |
| [function-presentation.md](function-presentation.md) | 用户提供的功能表现稿 | 设计输入；欠覆盖与新增能力由领域矩阵处理 |
| [mobile-design-notes.png](mobile-design-notes.png) | 用户提供的手机说明图片 | safe-area、Bottom Sheet、横滚分类、键盘布局参考 |

v0.1 快照 SHA-256：`8e69b101e5aa231b5520ac20d74c79eee16bdffd3a48f5e46c3fa0cb52bd9db4`。已核对与首轮可浏览初稿完全相同。

v0.1 Runtime 的免认证 OpenAI-compatible 样例不是当前源码支持的配置；v0.2 已按 `public/scripts/native/runtime-workspace.js` 的服务分支校正。免认证仅按真实 adapter 条件呈现。

v0.2 讨论稿 SHA-256：`2056f0f1e4c471c43cf2fafaeb1316ffb6e0f82d476209ef2d4d251f522e58df`。

v0.3 讨论稿 SHA-256：`0fd21aacc0613263195404077d1bca279cf14bd83f3eac11464c91e5cd04de9b`。

v0.4 讨论稿 SHA-256：`d92552ee518fa4fe48ceeff13a78d745b6283b63625589b7a3b9821e14e4f026`。

v0.5 讨论稿 SHA-256：`aba50a83a243e90ec618e4c0a5f434e0cc10c39b96d409ebacd3bbc1bcfd08b5`。

v0.6 讨论稿 SHA-256：`863ecb76c1072fc3121b84c187dede8eb52c8075296fffeaa7a02a849e9ed981`。

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

### v0.3 actual prototype checks

- 真实 Chromium 查看 Runtime/Agents 的 1440px 桌面与390px手机布局；320px 检查 Runtime 五个 Tab、Agents 四个 Tab 与 Run Graph，未见页面级横向溢出，长页面可滚动。
- 走通 Connection→Fetch models→选择模型/应用元数据→Save Model→Save Route→Compile preview；取得演示精确引用与上下文证据。
- 验证 loading、失败后可重试、取消；测试进行中修改 Endpoint 取消旧反馈；离开脏草稿的「继续编辑」保留输入。
- 验证 Source 格式错误保留、未知字段保留、资源身份改变拒绝、无效 Model capabilities 与 Route role 拒绝；修正后可继续编辑和保存。
- 验证 Retrieval 新修订替换当前列表项，重新打开仍为最新修订，未知字段保留；历史只为内存演示，不是产品持久化验证。
- 验证内置预设复制后空名错误/修正、Native Character 禁用；Timeline 默认、Graph 可切换；Stop 进入停止中并禁重复操作。
- 验证空 live→预置4事件只读 replay→返回仍为空；replay 中 Stop、状态选择与 Memory 管理禁用。
- 验证 Graph 切换的键盘焦点保留；390px Event Sheet 的范围/尺寸与 Escape 关闭后回到原事件。
- 验证手动减动模式下浮层取消入场位移；连续关闭/反向打开不会被旧完成回调隐藏，最终关闭成功。
- 四份独立初稿脚本 `node --check` 通过；上述浏览器检查未出现 console error/warn。明确调用 review-animations 与 web-design-guidelines 静态复审，已报告问题均修复。

v0.3 尚未验证：全量业务合同、所有 adapter/编排模式、真实文件导入导出、后端/凭据请求、真实移动键盘和手势设备、产品级性能。初稿中「示例状态」「演示反馈」是审阅设施，正式 UI 不保留这些模拟开关。Play/Library/Studio 沿用前版，完整剩余功能按 `../coverage.md` 继续讨论。

### v0.4 actual prototype checks

- 真实 Chromium 查看1440px阅读、390px Work Sheet、320px资源/历史 Sheet及900px重排；检查320px Play阅读/首页和Library四类列表，无页面级横向溢出。正文保留桌面20px/740px、手机17px，三张Gallery封面DOM与前版一致；320px Composer与Dock之间有12px间隔。
- Inspect精确修订只读→返回当前恢复输入，未发送草稿保留；Load缺精确版本禁确认，满足后创建单条新分支，重复确认被锁定、旧main HEAD保持。
- 长正文的流式示例中向上阅读停用跟随，位置保持、Jump latest可达；Stop后未提交回复丢弃、再次发送与停止可操作。准备/缺配置/恢复失败/Ironman终局输入均锁定。
- 最近会话首页可达，Dock重进回阅读；同Work StartNew之后Continue仍进入原Session ID与精确版本，非Florence示例使用对应作品正文；Runtime缺项仍可读、输入禁止生成。
- World原件只读→独立副本→Source错误保持原文→退出后恢复草稿→审查/新修订，未知metadata保留；Knowledge空标题校验、修正保存、旧r8仍可读取，旧引用不迁移。
- World A/B共享Knowledge K，删除A后B仍阻碍删除K；重复删除只生效一次，原有Knowledge保留。`.atria`示例预检需要权限授予，`.atriasave`缺精确依赖禁确认，两个入口分开。
- 实际键盘检查History/Saves与branch Arrow导航、焦点保留、Escape关闭。浏览器发现多分支手机Grid撑宽，修正后320px四分支时弹层宽/scrollWidth均320px，仅272px路线列表横滚，滚动条沿视觉体系隐藏。
- 新模块及合并脚本语法检查通过；相关浏览器流程无console error/warn。明确调用review-animations与web-design-guidelines静态审查，已报问题修复；最后的Grid修复另以浏览器复测。

v0.4 尚未验证：真实Session/模型/资源服务、持久化/版本修复回执、真实文件/密码/权限合同、全量上下文与参数、Package Knowledge编辑、真实手机软键盘/手势和性能trace。Studio/Agents/Runtime沿前版，剩余页面只见 `../coverage.md`。

### v0.5 actual prototype checks

- 真实 Chromium 查看1440px Settings双列纸张与右侧阅读样例、390px/320px单列与Bottom Sheet；检查900px重排、320px Prompt Source/Persona详情/Settings及1.5倍阅读样例，无页面级横向溢出。手机顺序为Appearance→阅读样例→其余分组；长页返回动作可滚到Dock上方，页面ID无重复。
- Prompt空Source→模式切换拒绝→关闭重开保留空原文；修正后Review→重复Publish仅生成一条新修订，嵌套未知metadata保留；Inspect旧修订仍是原数据，Route仍固定旧精确引用。Generation模式切换保留缺省stop与嵌套未知属性。
- Module发布更新当前Preset中的Program精确引用并产生Program新修订；旧Program/Route闭包保持。未改Program缓存自动刷新，脏旧稿保留原文/提示过期/禁发布，取消重载仍保留，明确舍弃后读取当前基线。
- Installed Work Prompt原件表单使用disabled fieldset，历史/Source只读，复制可形成可恢复的新资源草稿；独立Module被引用时禁止删除。Regex代表规则关闭后草稿保留；此稿不展开全量Regex管理或新增测试能力。
- Persona编辑取消保留输入，空名字校验并定位；空描述可保存，已有账户默认/Session仍保持旧精确修订。新Persona选择进入Play后，Library识别已提交Session身份并禁永久删除；公开DTO/snapshot不含管理备注。归档默认不会改已有快照，新会话不捕获已归档来源。名字/UTF-8限额及重复保存/删除由实际原型函数定向检查。
- Settings字号合法值同步样例与Play，2.0越界保留原偏好并标错；减少模糊使Dock的backdrop-filter为none。Enter设置进入Play并用实际键盘发送；输入样例验证Ctrl/Cmd、Shift/Alt和IME边界，自动跟随偏好可读取。语言只更新样例并显示产品刷新语义。
- 浏览器中以测试用matchMedia模拟系统false→true→false：manual=false恢复false，manual=true仍为true；系统强制时勾选且禁切换。减动Sheet取消位移。测试注入未写入HTML，最终浏览页面已恢复无测试hook。
- 实际键盘Tab约束、Escape关闭、Prompt/Persona资源焦点归还；只读fieldset的后代不进入显式焦点列表。五域与Settings切换仅显示一个scene，Settings返回原场景；Prompt/Persona搜索无结果有说明及创建入口。
- 合并独立脚本`node --check`通过；最后相关浏览器流程读取console无error/warn。明确调用review-animations与web-design-guidelines，并对实际函数作独立只读复审；本轮动效审查结论Approve，已报问题闭环。

| Before | After | Why |
| --- | --- | --- |
| Prompt每次输入重绘Library触发器 | 编辑期间保留原节点，关闭后按资源ID恢复焦点 | 避免键盘关闭后丢失工作位置 |
| Program缓存可能落后于Module发布 | 未改稿刷新，脏稿保留并确认重载 | 当前闭包与未提交内容都有清楚来源 |
| OS减动写入手动偏好 | 手动值独立，effective值叠加系统要求 | 系统恢复后保留用户原选择 |
| Ctrl/Cmd路径可绕过Shift/Alt | 统一外层修饰键与IME检查 | 设置样例和Play沿真实Native键盘语义 |

v0.5 尚未验证：真实资源/偏好服务、持久化与完整合同、全量Preset删除/Regex/参数、头像及文件上传、语言真实刷新、高级主题/Custom CSS兼容、真实软键盘/触屏手势设备、性能trace。当前仅是D2设计讨论；没有产品重构实施，也没有新增依赖。Studio/Agents/Runtime沿前版，剩余界面按 `../coverage.md` 继续。

### v0.6 actual prototype checks

- 真实 Chromium / Codex 内置浏览器查看 Studio 1440px 桌面三纸、900px 两栏、390px 编辑与320px EntryPoints/UI/Assets/冲突纸。上述尺寸无页面级横向溢出；320px Sheet宽320px，正文clientWidth/scrollWidth均268px。审查先显示具体差异，完整原文折叠，冲突默认展开。
- 连续编辑 Actor→EntryPoint→UI节点文本→Asset名称，四份草稿进入同一Review；旧嵌套Profile、mes_example和metadata保持。Actor空Source切Form拒绝、跨资源重开仍为空；本地检查阻止提交。Assets Source=[]独立审查被范围校验拒绝，不能借原文编辑隐式删除manifest。
- 模拟另处修改后，基线/当前/草稿可比较，Apply禁用；取消重载保持姓名输入，明确确认才舍弃草稿并读当前项目。源代码中的正常拖拽/reduced拖拽各发一次关闭意图，回弹/取消不发，由实际函数定向检查。
- 浏览器验证本地准备等待期间关闭，重开后基线未变、草稿保留；验证失败没有resultingRevision。四域同批提交的refresh-failed保留单条新修订，模式/Preview禁用；刷新只读取已保存版，恢复编辑且未再次Apply。此取消只发生在本地准备，已发出的Execute不提供撤销。
- 实际键盘Escape回到Review触发器，Ctrl Enter打开错误纸时焦点定位状态标题；阶段更新的Sheet正文与面板scrollTop均0。Body、Mode与手机Preview入口的锁定/解锁跨Prompt切换由实际函数检查；重绘selector/file/Add后焦点恢复已定向复核。
- 独立模块与最终合并脚本`node --check`通过。初始示例source通过实际`assertAtriaProjectSource`；UI patch的contentHash由基线文件实际SHA-256产生，Source写入用utf8。单一store定向检查覆盖坏null/[null]、Assets空/重复ID、提交前写入失败、重复Apply、关闭后的晚回执、刷新不重提交及未知提交结果持续阻挡。以上合同/状态检查不等于完整Native Validate或Frontend Graph通过。
- 最后相关浏览器流程日志无error/warn。明确调用find-animation-opportunities、review-animations及web-design-guidelines并独立只读复审，结论Approve。微交互诊断为9/10（7/8项）：长期熟练使用的提示收敛未展开；正式设计可将重复说明保留在可展开资料，不据此新增持久化能力。当前没有产品重构或新增依赖。

| Before | After | Why |
| --- | --- | --- |
| 正常滑动关闭绕过准备取消通知 | 关闭意图统一覆盖，反弹不通知 | 防止关闭中发出迟到提交 |
| Preview入口可绕过锁、Mode禁用残留 | 所有入口同一守卫，disabled/inert随状态恢复 | 提交/刷新期间的编辑边界一致 |
| 坏Source污染其他资源、Asset数组可隐式增删 | 展示用安全投影，原文仍校验；固定完整唯一ID集 | 保留输入与本轮metadata范围 |
| 重绘丢焦点、结果留在旧滚动位置 | 控件焦点恢复，阶段归顶并定位状态 | 键盘和错误恢复可连续操作 |
| 改稿可绕过未知提交结果阻挡 | 核实前持续阻挡；失败Reload不解除 | 防止重复提交 |

v0.6 尚未验证：真实Inspect/Execute/文件事务与持久恢复、全量资源/引用合同、完整UI Source Graph/Native Preview、Project Agent提交链、真实手机软键盘/触屏手势、性能trace。指针/拖拽生命周期的函数证据不是实机手势证据；未取得产品级性能结论。旧Prompt/Agent示例及其它域沿前版，剩余范围见 `../coverage.md`。

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

### v0.7 actual prototype checks

- 独立脚本语法检查通过。真实 Chromium 检查 18 个页面/语言/尺寸组合：英文 1440px 八页、简中 900px Agent/Files、简中 320px 八页；无页面级或纸内横向溢出，没有 pageerror。
- 演示 Task 创建→继续→审查取消→人工提交回执；Source 关闭保留原文，冲突禁应用；均通过。手机文件名用省略号保留扩展名阅读，中宽纸面不保留空占位高度。
- 浮层读取当前可见值后取消旧动画，键盘即时、减动仅透明度；原生 dialog 约束焦点并归还入口。
- 这些是原型证据。账户、扩展、媒体与宿主目前只有代表布局，完整文件、权限、恢复与业务合同未由这份原型证明。Agent/Files 的样例状态不能复制到正式产品。
- 后续备份补充：英文1440、简中900/320px各四分组，共12个布局检查通过，无页面溢出或 pageerror；范围/恢复模式在预检后保留，运行锁定、取消、完成回执、失败禁止恢复四类内存流程通过。实际查看截图发现 checkbox 被通用输入宽度拉开，修复为44px命中行与墨色原生 checkbox 后相关12布局与流程复测通过。此处不读取、上传或恢复任何文件；产品真实 ZIP 验证单独记在 Record。
