# Validation and evidence matrix

## Responsibility

本模块描述未来实施验收，不记录虚构通过状态。实际执行、HEAD、命令、失败和设备限制只进入本任务 Record。D0 仅验证文档完整性；既有 HTML 讨论稿的语法/浏览器证据不能代替产品测试。

## Domain acceptance matrix

| ID | 必须证明的行为 | 已存在的针对性入口（不代表已执行或已完整覆盖） |
| --- | --- | --- |
| V00 | 五域/子路由/拥有者深链、Back/Esc/focus、搜索来源级失败/过期与子项 | `tests/atria-shell/{app-shell,command-registry,navigation-authority,back-resolver,workspace-host,product-search,workspace-leave-guard}.test.js`；`tests/e2e/atria-shell/04-navigation.e2e.js` 的 A1 外壳/查询/Back 场景 |
| V01 | 真实认证条件/错误、启动等待/超时、学习进度/重入 | `tests/atria-shell/learning-center.test.js`、`tests/frontend-startup-loader.test.js`；认证现有 E2E 按实际配置选取 |
| V02 | 实际最近会话/作品、继续、空态、缺依赖 | `tests/atria-shell/native-play-controls.test.js`；Native Session 产品 UI E2E |
| V03 | committed/transient 投影、读者位置、流式 stop/失败、IME/发送策略 | `tests/atria-shell/{native-play-product,native-generation-p4}.test.js`、`tests/native/{session-projection,frontend-conversation}.test.js` |
| V04 | history/live、完整可用回合动作、variants/branches/save、生成时禁用 | `tests/atria-shell/{session-history,native-reply-variants,native-play-controls}.test.js`；`tests/native/{session-history-p2,save-system}.test.js` |
| V05 | 四项 exact 依赖、实际文件/密码/损坏/尺寸、冲突、取消/重试、结果打开 | `tests/atria-shell/{save-dependency-recovery,library-import-flow}.test.js`、`tests/native/save-system.test.js`；`tests/e2e/native-session/07-play-redesign.e2e.js` 的 A2 exact/history 与旧版本恢复场景 |
| V06 | 安装权限/版本/重复与并发、旧版本启动、命名冲突、作品/会话删除区别 | `tests/atria-shell/{library-interactions,library-import-flow,package-permissions,session-naming}.test.js`；`tests/e2e/atria-shell/06-library-runtime.e2e.js` |
| V07 | World/Knowledge 编辑规则、全部字段/条目/Source、闭包/缺引用/导入/Fork | `tests/atria-shell/{package-library-resources,knowledge-editor,world-editor,resource-bundle-controls,reference-remediation}.test.js`；`tests/native/library-revisions.test.js` |
| V08 | 4 类完整 Prompt 资源、类别/模块/阶段/Regex、revision/归档/Used By；choices 不改作者资源 | `tests/atria-shell/{prompt-authoring-p6,prompt-preset-receipt,prompt-runtime-controls,prompt-semantics}.test.js`；`tests/native/prompt-presets.test.js` |
| V09 | Secret 不回显、提供商字段/能力、连接实测分类、保存成功读取失败 | `tests/atria-shell/native-runtime-p5.test.js`；`tests/native/{runtime-http,model-prompt-runtime-contracts}.test.js` |
| V10 | 全角色路由/模型发现/能力、exact ref/fallback、缺项修复回原任务 | `tests/atria-shell/{runtime-readiness,runtime-route-picker}.test.js`；`tests/native/model-prompt-runtime-p6.test.js` |
| V11 | Embedding/Rerank 完整配置；编译预算/上下文证据且不发送/解析 Secret/写会话 | `tests/native/{retrieval-runtime,model-prompt-runtime-p4}.test.js`；Runtime diagnostics UI 场景 |
| V12 | 20 视图/完整源码、资源引用/闭包、人工 Apply vs AI Commit、长任务/冲突、真实 preview/simulate/build | `tests/atria-shell/{studio-workspace-a7,studio-actors-editor,studio-authoring,studio-agent-a8,source-editor,asset-editor,project-lifecycle}.test.js`；`tests/native/{studio-service,project-agent,library-build-closure}.test.js`；`tests/e2e/native-session/28-studio-actors.e2e.js`（B1 Actors canonical/Session/Save/中文窄屏） |
| V13 | 四模式专属字段/JSON/工具权限/预算、scope 绑定/清除、预设 CRUD/import/export | `tests/native/agent-settings.test.js`；现有 orchestrator 与 iterstudio 模式测试按本阶段选择 |
| V14 | Run graph/timeline/分页；Memory OS/实体关系/来源/检索/维护；会话范围 reset；Trace replay/live | `tests/atria-shell/memory-native-routing.test.js`；`tests/orchestrator/runtime-trace-export.test.js`；按实际 Memory UI 新增真实场景 |
| V15 | Skills 文件树与 CRUD、来源只读、scope；Plugins 更新禁用、仓库失败、工具配置 | `tests/native/{extensions-foundation,extensions-workspace}.test.js`；`tests/e2e/atria-shell/07-plugins-settings.e2e.js` |
| V16 | canonical anchors、Prompt/图片独立生成与取消、角色/参数、覆盖、历史/过期 | `tests/native/{illustration-core,illustration-prompt,illustration-image,illustration-renderer,illustration-settings}.test.js` |
| V17 | native/hybrid/custom presentation、自有字体/Shadow DOM、恢复可达；共享席位/观察者/过期 | `tests/native/{frontend-heavy,frontend-platform,shared-runtime-p8}.test.js`；`tests/e2e/atria-shell/03-game-surfaces.e2e.js` |
| V18 | 两种语言、真实 font_scale/Custom CSS/Enter、条件账户操作/头像/密码/备份恢复范围 | `tests/atria-shell/{appearance,utility-workspaces,localization,product-localization-coverage}.test.js`；`tests/storage/endpoints/native-backup-roundtrip.test.js` |
| V19 | Guided/Startup/Expert、真实来源/事件、清理范围、复制导出失败 | `tests/logging/{frontend-adapters,startup-store}.test.js`；`tests/e2e/atria-shell/04-navigation.e2e.js` 的 A1 global utilities 场景 |
| V20 | Native Persona 的全部开放门 | A4a/A4b 与 A5 跨域/旧 Session/Save/focus 有本地针对性证据；Shared 描述停用、完整设备/引擎矩阵仍待后续验收；旧 `tests/e2e/personas/` 仅证明 legacy，不能直接冒充 Native 验收 |

实际测试位置以最新源码为准，进入实施阶段时更新新增测试路径。每阶段及任务完成时，只在本地执行最小相关验证；不发起或等待远端 CI。本表不能用“已有测试文件”替代未覆盖场景。

## Cross-domain state scenarios

每个改造域至少覆盖加载、空态、无匹配、服务失败、保存失败草稿保留、成功后刷新失败、过期修订、重复提交、权限/历史/生成禁用、来源删除/引用缺失，以及取消/返回/focus。能力不适用的项说明原因；适用但没有产品测试的项补有意义的合约或浏览器场景。

跨域任务至少包含：

- 搜索命中 Knowledge 条目/Save/Persona → exact owner 页面 → 返回原查询；来源失败独立重试。
- 开始故事 → Runtime 缺项修复 → 回到原入口 → 创建真实 Session；指定旧版本不被 latest 替换。
- 导入 Save → 缺版本/权限预检 → 安装匹配版本 → 重查 → 成功打开该存档；冲突不假自动合并。
- Studio Attach/Fork/Update/Detach → review → canonical ChangeSet/Commit → Used By/诊断可定位。
- Agent 未 Commit 提案不修改作者源；冲突和 takeover 后原 task 不继续写。
- Persona 编辑/改默认不改已有 Session；切换保留草稿，只改变后续 message/request 身份；branch/save/retry 遵守 [personas](personas.md)。

## A3 targeted regression entrypoints

A3 新增用例位于既有 `tests/atria-shell/{studio-workspace-a7,studio-agent-a8,workspace-host,workspace-leave-guard,native-runtime-p5}.test.js` 与 `tests/native/extensions-workspace.test.js`，验证真实控制器的草稿、回执、部分失败、迟到响应、独立 Commit 与 Runtime 修复。原四模式的 `tests/native/agent-settings.test.js` 与 `tests/agent-runtime/workspace-agent-editing.test.js` 保留路由/字段契约检查。

浏览器实际 service/FS 入口为 `tests/e2e/native-session/{10-studio-redesign,12-native-agent-routes,20-extensions-ui,21-task-binding-preflight}.e2e.js` 中的 A3 场景：20 view + exact 引用生命周期、确认框等待时切换 Session 拒绝 Memory reset、插图完整配置保存/取消与会话工具真实点击、修复返回原启动且不跟随新默认版本。Runtime 旧场景在 `09-runtime-redesign.e2e.js` 按触及面选取。原 `native/illustration-settings.test.js` 提供 FS/SQLite CAS、作品范围及冻结草稿契约。实际命令、结果与设备限制只见 Record；不因这里列出入口而推定通过。

## Persona-specific fixtures

V20 必须包含：不同账户同名、多个修订/缺头像、归档默认、并发保存/切换/发送、无描述 consumer、预算省略/拒绝、不相关角色任务、原请求 retry、分叉与旧 save、新 save 资源闭包、缺来源仍可读、共享不同席位/观察者、自有 UI Host 入口。

迁移试件：空数据、损坏 JSON、未知版本/字段、重名/ID冲突、图片丢失/损坏、多旧绑定、无法映射 Lorebook/位置、`{{user}}`/多 Actor `{{char}}`/未知宏、重复导入、失败后重试、默认变更、备份闭包与恢复冲突。确认原始配置可恢复且不丢未知项；管理备注不在请求 evidence 中。

## D1 frozen C20 contract map — phase-scoped implementation

下表保留 D1 冻结目标。A4a 已创建 persona-resources/session/context/shared-host/save-backup 五个真实服务合约文件；storage 的 CAS/root crash 验证在 resources/Session suites，A4b 已新增 migration/storage/account-backup/picker/UI 与产品 E2E，并按实际改动本地执行；完整设备/引擎矩阵仍未验收。不要把文件存在或部分断言通过当作整行开放门全部通过；实际命令与限制只见 Record A4a。

| ID | 冻结契约 / 阶段 | 待新增测试与关键断言 |
| --- | --- | --- |
| C20.1 | Resource/owner/CAS/Asset / A4a | `tests/native/persona-resources.test.js`：同名跨账户隔离、unknown fields/边界大小、immutable hash、新修订不改旧 ref、default CAS/归档不可选、Used By 删除阻断、伪 MIME/损坏/超大像素与缺头像 |
| C20.2 | Session/input/retry / A4a | `tests/native/persona-session.test.js`：显式 none/默认捕获、旧 revision 只读不回填、switch/send 竞争、生成中禁用、草稿保留；typed turn/retryReply 两条路径、begin/Provider retry/fork/restore、ironman 限制及旧 metadata fingerprint 不变 |
| C20.3 | Context/evidence / A4a | `tests/native/persona-context.test.js`：player_provided 与 world 分离、opt-in/未消费/empty/预算遗漏原因、notes 不入请求、准确 ref/stage/budget、客户端伪造拒绝、Studio/维护/记忆过滤；受控 Provider 捕获实际发送参数，preview 无发送/Secret/写入 |
| C20.4 | Shared/Host / A4a–A4b | `tests/native/persona-shared-host.test.js`：不同席位独立、principal/seat/access epoch/revision 重验、observer/host 越权拒绝、投影不泄漏描述/账户库、授权头像闭包、Host 白名单/epoch/picker/宿主恢复 |
| C20.5 | FS commit-last/SQL parity / A4a–A4b | `tests/native/persona-storage.test.js`：并发写/default/delete 引用重查、prepared/revision/root/receipt 每个断点重放不重复、不暴露半成品；FS/SQLite 本地引擎往返，MySQL/Postgres 本地可用时验证，缺环境明确未测不声称 parity |
| C20.6 | Migration / A4b | `tests/native/persona-migration.test.js`：无版本旧 JSON/未知显式版本、损坏/空/超限/未知字段、planDigest 变化、名称/ID冲突、缺图/坏图/旧位置/Lorebook/宏/多绑定 pending、逐项失败/重复/重试、默认独立 CAS、保留原文与历史 |
| C20.7 | Save/backup/GC / A4a–A4b | `tests/native/persona-save-backup.test.js`：Save v1/v2 legacy-unbound、v3 三种 scope/header/hash/头像闭包、跨账户 snapshot 不自动入库、旧读端拒绝新版本；现有账户 native 备份往返/默认审阅/缺 manifest/冲突及 FS↔SQL 恢复、所有历史引用阻断 Asset GC |
| C20.8 | Product wiring / A4b | `tests/atria-shell/native-personas.test.js` 与 `tests/e2e/atria-shell/08-personas.e2e.js`：Library CRUD/分页/搜索/归档/默认、会话切换草稿/刷新失败、真实服务迁移预检/apply/恢复与 Host 入口，390px/focus/语言；入口开放前逐项满足 V20 |

A2 的 P01 接线在现有 `tests/atria-shell/native-play-product.test.js` 添加 AUTO/ENABLED/DISABLED、Shift/modifier/IME/229 场景；legacy shouldSendOnEnter 行为保持。A1 只使用 V00/V01/V18/V19 中与实际变动相关的集合，不提前执行 C20 或打开占位 Persona 入口。

## Browser / platform matrix

| 维度 | 需要验证的组合 |
| --- | --- |
| 尺寸 | expanded、medium、compact；至少 320px 无横溢出、390px 阅读/管理/弹层；边界 719/720、1179/1180 |
| 外观 | dark/light、Fast UI/无 blur、减少动效、现有主题切换 |
| 字体/语言 | English/简体中文长标签、实际最大字号、平台 serif、作品自有字体 |
| 输入 | 中文 IME、Enter/Ctrl/Cmd+Enter、软键盘/旋转/visual viewport、安全区域、长草稿 |
| 可访问性 | Tab 顺序、focus trap、Esc/Back、返回焦点、可见/可读名称、disabled 原因、44px 触控 |
| 呈现模式 | native/hybrid/custom UI 与挂载失败；宿主恢复入口独立存活 |
| 数据上下文 | fresh/现有账户、旧资源、旧会话/存档、缺引用、共享权限和多 scope |

真实浏览器查看显著 UI 修改，并保存关键截图和失败原因。自动 viewport 仿真只能证明布局，不能替代真实手机软键盘/IME 或 WebView。缺少设备时如实记录为未验证，不声称通过。

## Execution entrypoints

当前仓库 root `package.json` 和 `tests/package.json` 提供以下入口。命令是未来参考，D0 未执行产品测试。

```powershell
# 产品仓库根目录：语言覆盖与实际前端缓存构建
npm run check:native-localization
npm run frontend:prebuild-cache

# tests 目录：按当前改动选取实际测试文件
npm run test:unit -- --runInBand --runTestsByPath atria-shell/app-shell.test.js atria-shell/navigation-authority.test.js
npm run test:e2e -- e2e/atria-shell/04-navigation.e2e.js
```

按阶段触及面选择最小相关检查：D1 只检查文档与源码证据路径；产品阶段选择对应 lint/合约或浏览器场景，显著 UI 修改保留本地浏览器证据。A5/F 选择集成触及面的最小相关集合与必要构建，不重复全量无关检查。不要盲目套用不存在的 root `npm test` / `npm run build`。E2E 配置由各 spec 提供独立 fixture server；legacy browser integration 需要额外环境，不能把其跳过结果标为 E2E 通过。

## Evidence gate

每个 checkpoint 记录实际 tested HEAD、执行命令、pass/fail、浏览器/设备范围、新旧数据验证与剩余限制。首次开放 Persona 必须有持久化及服务端请求 evidence；没有真实模型实发则限定验证结论。最终集成前验证对应实现提交，并记录实际 Git 状态，不借用历史任务的“Complete”。


## A4b actual targeted entrypoints

新增 `tests/native/persona-{migration,storage,account-backup}.test.js`、`tests/atria-shell/native-personas.test.js` 与 `tests/e2e/atria-shell/08-personas.e2e.js`；Save suite 仍只证明 Save/avatar，账户备份证据由 account-backup 和原 storage Native roundtrip 提供。迁移验证 prepared/blob/ref/revision/root/receipt、并发同源及 default prepared receipt 恢复；账户验证 FS↔SQLite、缺 manifest/hash/avatar、ID 冲突、默认 CAS/归档拒绝与保留目标头像。

Context suite 扩展 Shared 停用且不回退 solo 的断言，并复验受控 HTTP Provider 真正发送；Play suite 增加接受时姓名/头像与后来选择分离。Shared Host suite 验证 seat/access/scope/CAS anchors 与 observer/pending 拒绝。Chromium 390px 的四个产品场景包括管理/迁移重放/局部源预检、solo/Host/独立恢复及草稿/focus、中文管理、真实服务 Shared 自己席位选择与描述停用。实际数量/命令/失败修复/截图限制见 Record。

没有执行全量 tests/构建/Android/真实手机IME/WebView/MySQL/Postgres/远端模型/远端 CI；完整矩阵继续归 A5/B/F。支持范围入口已开放，Shared 描述仍为停用；不能把有权限的 Shared 显示/选择误记为描述已消费。

## A5 first-round local integration checkpoint

新增 `tests/e2e/atria-shell/09-immersive-integration.e2e.js`：Persona/Knowledge/Save/Director exact owner 搜索与查询返回、Persona 来源级失败重试、服务启动前已有旧 Session、修订/default 与现有 Session 隔离、picker 草稿和旧 revision、Save 同 ID 冲突与恢复、真实最大 font_scale/Fast UI、中文/light/减少动效、320px 与 719/720/1179/1180 边界、双向 Tab/Esc/focus。WorkspaceHost suite 补九种目标原子导航及拒绝后 owner 保持。

A5 首轮支持范围已冻结；实际 S00–S20 证据映射、最终相关 tested HEAD、28 suites/181 不同 unit 与18 不同 Chromium 场景、初始失败和未测范围只见 Record A5。缓存构建首次实际编译、最后 libraries key 命中，不能误报全产品打包。共享描述仍为 `shared_scope_unsupported`，无启用授权。后续 B1–B4 每类仍须字段/动作/状态/authority 映射与最小本地验证；真实设备、MySQL/Postgres、远端模型和完整 Bridge/字段矩阵未关闭，不能因 A5 本地 checkpoint 完成改写为最终验收通过。
