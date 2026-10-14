# 原生前端迁移与兼容替代

本模块描述工程目标、已知耦合和可验证的替代路径。产品范围与冻结取舍只见 [decisions.md](decisions.md)，视觉资产与 tokens 只见 [visual.md](visual.md)，功能范围见 [coverage.md](coverage.md)，检查方法见 [validation.md](validation.md)。

## 1. 现状与迁移方向

历史盘点基线为 `main@9241325a`；本轮实施重新核查 `main@cc5e90eac`，当前变化与验证归 [实施 Record](../../../records/refactor/atria-serene-canvas.md)。产品前端使用浏览器 ES modules、直接 DOM 与 CSS，旧 jQuery、模板和样式仍是部分兼容设施；Node ≥20 / Express 提供服务，Webpack 编译前端库包。已有 CodeMirror 6、Cytoscape、Atria 原生 UI/桥接能力。React 素材只借鉴适合当前架构的设计/交互方法；依赖选择遵循 [decisions.md](decisions.md)，不迁移整体框架。

迁移目标是让默认 Atria UI 直接使用原生的 Generation、Composer、Session、偏好和扩展接口。旧控件是否保留不由其 DOM 存在决定；确有必要的兼容责任要逐项变成原生设施，再收缩旧层。复用现有后端服务、资源/修订模型与持久层，不建立另一套生成调度器、会话状态或数据权威。

源码入口：

- `main:package.json:6-18,67,74,119-166`、`webpack.config.js:24-27,193-220`、`public/index.html:39-66,8760-8772`。
- `main:public/scripts/atria-shell/index.js:65-153`、`app-shell.js`、`navigation-authority.js`、`workspace-host.js`、`workspace-leave-guard.js`。
- `main:public/css/atria-tokens.css`、`atria-components.css`、`public/scripts/atria-shell/primitives.js`。

## 2. 一条已有的原生生成链

当前可见 Conversation/Composer 来自 `public/scripts/native/play-product.js`；它真实实例化 `createHeadlessConversation`，向作品暴露消息、生成状态、Composer 及取消/Persona/诊断等能力。这个 bridge 是既有 runtime 的 adapter，没有另一套 Timeline 或持久状态。

本轮已实施的默认发送链：

```text
Native Composer
  → getContext().generateNative('normal', { input, scope, onInputAccepted })
  → 单操作 Generation controller / scope / AbortSignal
  → runNativePlayGeneration({ runtime, input, signal, host })
  → Native generation-client / Turn / Orchestration
  → submitUser / commitAssistant callbacks
  → NativeSessionRuntime.appendDraft / 原有 runtime command / CAS
  → canonical snapshot / 提交回执 / 兼容投影与事件
```

可直接复用的原生核心：

- `runNativePlayGeneration` 已显式接收 `input`、`signal` 与 Host callbacks；其执行使用 Native generation-client，并处理普通叙述、Package Turn 与 Orchestration，不需要重新实现生成引擎。
- `createHeadlessConversation` 已有 Composer/Session/revision guard 与能力拒绝，仍作为作品和可见组件的稳定语义边界。
- `NativeSessionRuntime` 已处理 canonical snapshot、不可变 Timeline 屏障、排队写入、Draft/Revision、历史只读、停止清理和原生生命周期事件。
- 现有 Context、Prompt/Generation/Route 解析、能力/权限/预算、Operation 与服务端 command validation 保持权威。

事实入口：`main:public/scripts/native/play-product.js:422-480,508-528`、`frontend/conversation.js:4-59`、`play-generation.js:5-103`、`session-runtime.js:331-366,448-485,568-655`、`main:public/script.js:7468-7501`。

## 3. 需要逐项替代的耦合

| 当前责任与耦合 | 原生替代方向 | 必须保留的行为/验证证据 |
| --- | --- | --- |
| Composer 将文本写入 hidden textarea；Generate 再读取 selector 或 `pendingUserInputText` | 显式 `input + exact Session/revision + generation type + signal` 调用；Composer 草稿只由当前原生组件持有，bridge submit 直接进入原生 controller | 空输入/只读/准备未完成不可发；中文 IME；接受前失败恢复草稿；已提交输入不重复发送 |
| Generate Native adapter 持有旧全局 AbortController、started/ended callbacks 和 Context façade | 抽出原生 Generation controller，复用 `runNativePlayGeneration`；每次 operation 的 abort 与当前 Session/revision/epoch 关联；旧 `generate` 名称只作为受控兼容 adapter | 快速 Send/Stop/Send、取消准备/流式/收尾，旧结果不能覆盖新 Session 或新操作；不另建 retry/并发调度器 |
| `submitUser` 调用 `sendMessageAsUser`，创建旧 chat message、渲染 hidden message，再 persist | 显式创建原生 user Draft/command，沿现有服务与 runtime 权威提交；Persona、输入处理与兼容事件由明确 adapter 提供 | 用户回合先形成 exact post-user Revision；既有 regex/变量/Persona 语义核对；事件在提交成功后触发，扩展不能造成重复写入 |
| `commitAssistant` 调用 `saveReply` 修改旧 chat；persist 从 host.messages() 推导意图 | 原生 assistant Draft 与已接受结果通过既有 command/Operation 边界发布；旧 chat 退为 canonical snapshot 的兼容投影 | 不变更已提交消息；流式暂态不成为持久 Timeline；Continue/Turn 保持各自语义；状态补丁与文本发布一致 |
| Stop/UI locks 依赖旧 send/stop 元素、`is_send_press` 和 body datasets | controller/state 投影驱动按钮、状态与取消；旧 selector/body 标记由兼容 adapter 派生，不再反向决定 Native 状态 | Stop 结束当前 Draft；空结果与临时 state 不生成额外 Revision；停止清理完成后允许下一次发送；全屏作品也可停止 |
| `#sheld/#chat/#form_sheld/#send_form/#send_textarea` 唯一层级、`#message_template`、旧角色/metadata 投影 | 迁移内部消费者到原生接口；将仍有调用方的旧节点与数据投影收缩为明确兼容岛；默认 Native UI 最终不靠 hidden chat DOM 运转 | 作品组件借用/恢复、插件 hooks、事件次序、用户数据与故障恢复路径；删除节点前证明无必要消费者 |
| Settings 搬运旧 preference 控件与 handlers/persistence；主题明暗由 SmartTheme 投影 | 原生偏好控件与 adapter 调用同一设置权威；主题入口映射至 Atria tokens，同时保留存储值/导入导出/Custom CSS 的兼容解释 | 旧主题与字体、语言、输入/滚动、减动值不丢失；控件挂载/卸载不重复绑定；无第二套 appearance 持久设置 |
| Extensions 搬运既有设置注入 roots，scope/资源由现有服务管理 | 给官方与第三方设置明确原生挂载/卸载/状态接口；官方逐项迁移，旧注入根保持有限适配直至可替代 | scope、启停、只读 Package 原件、未保存草稿、权限、异步挂载过期和卸载恢复 |

事实入口：

- Composer：`main:public/scripts/native/play-product.js:422-446`；Native façade：`main:public/script.js:7468-7501`。
- 用户提交与事件顺序：`main:public/script.js:10019-10080`；assistant compatibility：`11076-11319`。
- 停止与 UI 状态：`main:public/script.js:9656-9694,9768-9811,11590-11594`。
- 唯一旧节点与层级：`main:public/scripts/atria-shell/native-play-host.js:5-101,214-243`；Session 投影：`main:public/script.js:22255-22320`。
- 偏好：`main:public/scripts/atria-shell/utility-workspaces.js:217-302`；appearance：`appearance.js:4-8,96-156`。
- 插件设置根：`main:public/scripts/atria-shell/utility-workspaces.js:140-214`、`public/scripts/native/extensions-workspace.js:23-192`。

表中保留迁移前耦合作为责任清单。默认 Composer、单操作 controller、直接 Draft 提交、原生常用偏好和 Native busy 投影已实施；全部残留消费者的替代尚未完成。具体真实浏览器与合同证据归实施 Record，不能以接口存在推定全域验收。

## 4. 原生化必须守住的权威

### Session、生成与状态

1. 唯一 canonical Session snapshot、server command/Operation 与精确 revision 决定已提交历史；UI 的段落、草稿、spinner 和动画均为投影。
2. 用户输入与 assistant 结果遵守既有 Draft/Revision 边界。取消前已提交的用户输入保留；没有有效 assistant 内容时丢弃未接受 Draft 和 generation-local state，不能发布多余的 state-only Revision。
3. 旧 `chat`/character/metadata 投影可为兼容消费者提供视图，但不能成为另一条写入权威。替代 persist 时先明确现有 statePatch、Persona、regex、memory、Operation 与事件责任，避免绕过 validation。
4. exact Session/branch/revision/epoch 与 abort 保护贯穿准备、生成、接受结果和页面切换。过期响应、取消后的 callback、重复 submit 不改变新状态。
5. 不为旧 regenerate/swipe 行为破坏 immutable Timeline；相关范围边界见 [decisions.md](decisions.md)。

事实入口：`main:public/scripts/native/session-runtime.js:448-485,568-655`、`public/scripts/native/play-generation.js:9-19,23-30,86-103`、`public/scripts/native/frontend/conversation.js:9-13,43-55`。

### Studio、Library、Runtime

- Studio 人工编辑继续经 Workspace/ChangeSet inspection、Apply、validation、resultingRevision；Project Agent 提议与人 Commit 分开。Preview/Simulation 使用精确修订，界面不能把聊天文字或当前选中资源当权威保存。
- Library 不可变资源修订、精确绑定、引用阻碍与各资源的原件权限继续生效；具体只读/可编辑分支只见 [coverage.md](coverage.md)。表单重排不改变用户数据引用与已安装 Work/Session 的版本。
- Runtime 继续使用现有 Connection/Model/Route/Prompt/Generation/Retrieval 权威；Secret 不进入共享页面、源码、截图或方案。就绪性与修复导航依据实际 adapter 和用途，而不是原型上的示例组合。
- Account 操作由现有 user authority 处理；将可见退出/切换补回原生入口，不复制身份状态或另造登录接口。
- 工作区路由、Command Registry、搜索来源、Inspector、草稿保护和错误恢复继续复用现有壳能力，视觉导航改变不删掉相应用户任务。

具体用户路径与现状缺口只在 [coverage.md](coverage.md)维护；产品数据/权限约束不能被样稿中的演示成功状态替代。

## 5. 旧 UI 价值与数据兼容分开处理

| 处置对象 | 本方案的处理方式 |
| --- | --- |
| 旧角色卡/群聊抽屉、厚重顶栏、旧逐条操作按钮 | 不按旧 DOM 逐项重画。用户价值和默认界面范围由 [decisions.md](decisions.md)决定 |
| 当前 UI 不使用的旧消息按钮/handlers | 找出调用方，必要功能迁移到原生接口；确认无使用后删除，不让隐藏按钮永久充当产品 API |
| 角色卡/聊天/主题/用户资料/存档格式与既有数据 | 保留导入、兼容解释、持久格式与恢复能力；删除外观不删除用户资产 |
| 附件、旧消息变体等底层已有但 Native UI 未提供的能力 | 不自动恢复为按钮。若有明确产品需求，另行定义完整原生流程；本次覆盖盘点不扩张需求 |
| Shell 启动失败或显式 legacy recovery | 替换默认前端期间维持可诊断恢复路径；何时收缩恢复岛依据兼容消费者与可靠性证据决定 |
| 作品 full/hybrid/component UI | 保留独立呈现空间与原生组件/Host services 语义；全局可达性与恢复工具的视觉规范见 [visual.md](visual.md) |

事实入口：`main:public/scripts/atria-shell/index.js:15-153`、`native-play-host.js:117-211`、`public/scripts/native/experience/ui/host-surfaces.js:43-124`、`full-host.js:49-145`。

## 6. 建议的替代顺序与交付证据

此顺序用于安排依赖和控制变更面，不另建阶段审批或执行许可。

| 替代序列 | 输入与产物 | 可审阅的完成证据 |
| --- | --- | --- |
| 1. 责任与消费者盘点 | 定位默认 Play、full/component Work、官方插件、第三方扩展、恢复态对 textarea/chat/events/locks 的真实使用 | 旧责任→原生接口→兼容 adapter 清单；删除候选均有调用证据 |
| 2. 直接输入与取消 | 抽出原生 controller；Composer/bridge 传 input 与 exact scope；复用 `runNativePlayGeneration` | 原生发送不读写 hidden textarea；准备/流式/停止/再次发送与历史只读检查 |
| 3. Draft/Revision 原生发布 | 逐项替代 submitUser/commitAssistant、host.messages 依赖与 UI locks；兼容投影从 canonical snapshot 派生 | 用户边界、assistant 发布、取消丢弃、statePatch/事件与 exact revision 保持；无重复写入或第二持久层 |
| 4. 偏好与设置根替代 | 原生 preference 控件、官方插件设置挂载、有限第三方适配 | 旧值/主题导入/Custom CSS/语言兼容；scope/权限/草稿保护、卸载恢复 |
| 5. 旧 UI 与兼容岛收缩 | 删除已替代 DOM/handlers，保留必要数据格式与明确恢复能力 | 默认原生界面不依赖旧节点；残留兼容项范围明确、相关流程通过 |

- 先核对现有 tests 的**行为契约**与**实现假设**。历史测试要求旧 ABI 节点唯一只证明当时实现；退出旧 ABI 时以 Session/生成/取消/扩展/恢复语义替代 selector 假设。
- 复用现有 `tests/native`、`tests/e2e/atria-shell`、`tests/e2e/native-session` 与相关界面测试；检查选择与真实浏览器证据归 [validation.md](validation.md)。
