# Atria MCP 补强 — Browser / UI 受控交互与证据链（第七轮冻结）

- **Task ID**：`plugin/atria-mcp-strengthening`；Primary Workspace 为长期独立 `plugin` 分支中的 `atria-mcp/`，本 Plan Bundle 位于 `docs`。
- **冻结日期与路线**：2026-10-14，第七轮选择 **B：Browser Evidence Lane + 受控 Semantic UI Lane + 完整截图/身份证据链**。
- **源码审阅基线**：`main@9241325a7290e613e0fdaaa1870409105c161c89`，`plugin@ee99b2b3d1c65502a971495a6016ccb7c195bf6d`。本文件定义尚未实现的行为；
- **依赖**：[Plan Index](index.md)、[P0 可靠性](p0-reliability.md)、[Studio/Project Agent](studio-project-agent.md)、[Session/Generation](session-save-generation-lifecycle.md)、[能力矩阵](capability-matrix.md)。Browser 的业务写操作应阅读其原生权威域模块，不能从本模块独立获得写许可。

## 1. 两条 Browser Lane 与原生写入层（冻结）

它不意味着任意页面导航均无副作用；会触发应用事件/懒加载/外部网络的动作应在 Effect Catalog 中说明或拒绝。

**Semantic UI Lane** 仅执行在代码审计中**显式注册**的 Surface/Component/Control/Action 组合，例如切换已登记的标签页、选择只读结果、临时编辑不带业务写入的草稿。它不暴露任何由调用者任意指定的 `CSS selector / XPath / DOM property chain / script / mouse x,y click / keyboard macro / browser evaluate`。Interaction 需要受控 Action Registry、Policy Ceiling、当前 owner/epoch/identity，且所有潜在副作用声明准确；即使是 UI-local 变化也不能宣称纯 READ。

**Native Semantic Action Layer** 是持久业务变更的唯一入口，包括 Session Save/Restore、生成、Studio Evaluate/Apply、Project Agent Review/Commit、Memory/Goals/Experience/Evolution、Model/Route/Secret、Package Install/Delete 和 Media Draft/Freeze/Submit。UI 按钮绝不能代替相应原生 Action 的独立审批或事务、CAS、正式 Receipt。

- 继续保留 `atri_browser_open/observe/screenshot/interact/diagnostics/close` 的稳定顶层职责；新的语义动作优先通过 Registry 中的固定 namespace 注册，勿把 `atri_browser_interact` 升级成万能定位器。
- 强化权限时不保留旧产品尚未公开发布的无效工具外壳或脆弱兼容开关；
- `host.authorize`、Frontend Component 的 compiled binding/epoch 仅说明产品组件有权使用哪项 Host 服务，**不等于** MCP 可信客户端表单/MRTR 上真实用户批准。模型传来的 `confirm=true` 一律不是授权。

## 2. 第七轮静态审计依据

| 当前能力 | 已观察实现 | 本轮补强含义 |
| --- | --- | --- |
| Playwright 页面 | `plugin:atria-mcp/src/browser.js`：单个 `context/page`、跨 Origin 主导航拒绝、popup 关闭、Dialog 自动 dismiss、日志脱敏、截图 3 MiB、全页最高 12000px | 当前较适合证据采集。单页面需要 Scope/任务隔离；Document 外的第三方子资源尚非完整 Egress Sandbox |
| Browser 交互 | `AtriaBrowser.act` 严格只接受 `scroll`；即使 `atri_browser_interact` Schema 列举 `click/fill/press/select`，也会调用 denyMutation | 除滚动外的通用 UI 自动化**当前不可用**；新语义 Action 不得默默开放通用点击 |
| Browser Capability Bridge || 只复用第一方固定能力，不允许调用者传 Capability/Method/任意 JS |
| Source / Runtime / Scoped Proof | `src/provenance.js` 区分工作树源码指纹、Server Boot、浏览器 Document、Experience Epoch、Preview ID，Scope 证据为 **last observed** | Screenshot 必须主动核实截图前后身份；静态源码 EXACT 不能替代体验/Preview freshness |
| Product Frontend Host Bridge | `main:src/native/frontend/host-bridge.js` 及 `public/scripts/native/frontend/bridge.js`：Compiled Component/Binding、Schema、Epoch/Revision、idempotencyKey、operation status、分页/引用 | 语义 UI 权限设计优先借鉴或复用此权威；不要将它变成任意 Host 服务总线 |
| Studio Preview | `main:src/native/studio-preview.js`、`public/scripts/native/frontend/preview-bridge.js`：临时 Preview，Bridge 默认只读投影 | Preview 不拥有 Session 持久业务 Writer，不能凭页面 UI 的“保存”图标视为正式 ChangeSet |
| 测试 || 区分脚本自动化、Product UI E2E 与真实 Codex/Claude 客户端交互；不能相互冒充 |

## 3. Surface Manifest 与受控 UI Interaction（冻结）

每一个可调用 UI Action 必须是预先注册的语义对象 `(surfaceId, componentId, controlId, actionId, allowedInputSchema, effects, risk, ownerScope)`，其可发现描述应从当前已加载 **compiled Source/Native UI/Preview** 与明确审核的宿主 Shell 控件来源获得，而非由模型从截图或任意 CSS 猜控件。

建议初期按最小有用集合支持：

| 动作 | 预期风险 | 可接受条件 |
| --- | --- | --- |
| 当前 Atria 内部标签页、只读分组、对话历史视图展开 | INTERACT（UI-local） | 固定 Surface/Component ID、无产品写入副作用、可逆、当前 Document/epoch 有效 |
| 只读列表筛选、已知对象选择与焦点移动 | INTERACT（UI-local） | 白名单字段、值的 schema/长度限制；不能因此调用 Provider 或持久化 Preferences |
| 有界滚动、Viewport 切换、等待 | READ/INTERACT 依真实 effects 分类 | 触发懒加载/自动任务时须标明；页面控制不能阻塞 P0 Control Lane |
| Studio 本地未提交草稿录入 | INTERACT；若 UI 自动保存则 MUTATE | 精确 Project/baseRevision/editorDraftId、只允许已审结构化值、修改前后标 Dirty；不得直接触发 `stageOperations` 以外的未授权提交 |
| Studio Evaluate、Preview、Apply | 经正式 Studio Action 分别授权 | UI 只能调用原生 Workflow；Evaluate/Preview 和正式 Apply 是不同 Receipt / 审批 |
| Session Save/Restore、Generation、模型设置、Memory 节点修改 | 原生域的 MUTATE/INTERACT/DESTRUCTIVE | 不准通过 UI-local 命令绕开 Native Authority |
| 登录、输入密码/API Key、任意文件上传下载、DevTools、任意 JS | **不开放** | 原有 Headed Browser 人工登录；若需要凭据由用户/产品安全 UI 自己处理，模型不接触明文 |
| Mask Canvas、Media Studio 笔画/擦除/Undo/Checkpoint | 由 Media 原生草稿 Revision 决定，非通用 UI-local | 画笔事件可能自动写 Mask Draft；须专用语义 Command + Draft revision/Checkpoint，媒体域另行规划 |

如 UI-only 控件内部注册了全局事件/自动保存/网络调用，除非可以**经产品可靠地抑制或显式授权**该副作用，否则不能作为 UI-local 动作暴露。失去预设控件/编译绑定则返回 `UNSUPPORTED` 或 `STALE`，不能根据临时可访问性标签盲点类似按钮。

## 6. Studio Preview 与真实 Session UI 的分离（冻结）

- Studio Preview 是独立、不持久的 Product Preview ID/PackageVersion/Source/Evaluation artifact，`previewBridgeTransport` 默认对业务写入执行 `bridge_preview_readonly`；它不是 Session、不是当前游戏分支、不是正式用户存档。
- 外部 UI 不可创建业务上不存在的 session `commit` 身份。
- Studio 修改完整流程沿第三轮：Source→Workspace→Evaluate→Preview 真实浏览器观察→ScreenshotProof/ARIA/Diagnostics→独立可信 Review/Apply→正式 ChangeSet/Revision→**必要时对新发布版本再拍 UI Proof**。

## 7. 隐私、网络与不可信页面文本（冻结）

- 登录必须由真人在 Headed Browser 或产品安全认证流程中完成；由用户提供的 `storageState` 是敏感凭据，若配置支持，文件仅本机私有、不可被任意 `atri_repo/atri_artifact` 读取，不写入 Repository、Receipt 或上传测试产物。
- 页面文本、ARIA 内容、Console/Error、HTTP Response、Screenshot OCR、用户游戏数据均为**不可信材料**，不能作为提升 Policy Ceiling、触发执行或改变 system instruction 的指令来源；不要把 UI 页面文本自动解释成用户批准。
- 当前 Browser 的跨 Origin **主导航**被拒绝，但代码注释表明第三方子资源仍可能请求外网，因此 **不能宣称已有完整 egress sandbox**。引入交互前评估 BrowserContext 的非导航请求/下载/Service Worker/Popup/iframe/redirect 与带身份 Cookie 的泄露风险；远程 Host 必须 HTTPS 并遵守已配 allow-remote。
- 屏幕截图可能包含私人角色、会话、Agent 计划、钥匙标签或其他个人内容；
- 脱敏正则只是 best-effort，不等同于形式化 Secret 防护。测试优先使用一次性假数据/隔离产品环境；生产用户授权应有可见的目标与风险范围，导出/上传属于独立授权。

## 8. 与原生 Registry / Host Bridge 的权限关系（冻结）

1. MCP 的 Registry 是 **对外 AI 工具准入**；原生 Frontend Host Bridge 是 **产品组件—Host Binding** 的权限。两个体系互补但不互相替代；能点击或能调用 `host.authorize` 都不能绕开 MCP Approval。
2. UI-local 行为以已知 stable `surface/component/control/action` 注册且带输出 Schema；没有审核的 UI 操作一律 blocked。页面 DOM 变化、控件同名或任意 CSS/XPath 不能推翻 action/target binding。
4. 无论 UI 效果结果如何，业务变更和 Result receipt 只能由 Native owning Authority 给出。浏览器视图断开后绝不能因没有看到 UI 提示而盲重发原生操作。
5. 比较 UI 调用前后的 Source/Runtime/Browser 身份只回答证据有效性，不会自动追加写入权限，也不意味着客户端有安装 Package 或提权到特权管理员的能力。

## 10. 本轮不冻结的实施参数与第八轮边界

尚须在实现中按真实证据决定：初始 Surface 白名单条目清单、是否为每个 Task 开独立 BrowserContext、Viewport 上限/设备模拟、截图图像物理缓存与 GC 策略、UI-local draft 组件类型/Dirty tracking、具体ScreenshotProof JSON schema、隐私自动遮盖规则。**安全不变量不因此保持可选。**

第八轮将讨论 Package/Library/Resource Graph、Studio Build→Review→Install/Export；Media/Visual/Speech（含生图与 Mask/Gallery），以及 Skills/Extensions/Host Plugins 的完整语义控制、分支资产边界、预算/Secret/二进制传输和依赖管理。按需从原生已有代码核实，**不得从本 Browser 方案推导媒体编辑或 Package 发布的写入权限**。
