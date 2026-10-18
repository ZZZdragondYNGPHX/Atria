# 页面树、全局导航、Library 与 Play

基线、状态词和处置含义见 [index](index.md)。下表按实际业务控件组编号；一组中的按钮、字段和菜单均须纳入设计映射。动态模板的逐创建点/handler 另见 [evidence](evidence/)。**“接通”全部是静态结论，运行 NOT_RUN。**

## 当前页面树

```text
Login（独立页面；账户开启时）
└─ Atria Shell
   ├─ Play
   │  ├─ 当前阅读 / Recent stories
   │  ├─ Native Session：Timeline + Composer + Persona
   │  ├─ Inspector：History & saves / Context / Prompt choices / Health
   │  └─ More：Shared session / Quick Save / Load / Back to Play
   ├─ Library
   │  ├─ Works → Work detail → version / entrypoint → Session
   │  ├─ Install .atria / Import .atriasave（流程子路由）
   │  ├─ Worlds & Knowledge → Worlds / Knowledge Bases → exact revision
   │  ├─ Prompt Presets → Program / Modules / Generation / Regex
   │  └─ Personas → exact revision / defaults / archive
   ├─ Studio（内部 domain = build）
   │  └─ Project → 20 个资源视图 + Inspector / AI / Activity
   ├─ Agents → Orchestration / Run / Memory / Agent Diagnostics
   ├─ Runtime → Routes / Models / Connections / Retrieval / Diagnostics
   └─ 全局：Command / Learning / Extensions / Settings / Account / Diagnostics
        ├─ Account → snapshots / Backup & sync / Storage Center
        └─ 条件入口：公告、Runtime repair、错误恢复
```

Work 可在 text/component/hybrid/full 模式增加控件或接管 Play Stage。图中的默认 Play 不是所有作品的唯一布局；必须保留 Host 导航、停止、保存、Persona、诊断与 presentation reload 的恢复路径。作品定义的任意控件由 manifest/Source Graph 决定，不可能用固定页面表穷尽。

## 全局和认证

| ID | 页面／控件 | 触发与结果／数据来源 | 权限、状态、恢复 | 状态／处置 | 源码依据 |
| --- | --- | --- | --- | --- | --- |
| G01 | 五域导航：Play、Library、Studio、Agents、Runtime；当前域标记 | Navigation Authority 更新 domain/child/URL/history，WorkspaceHost 释放旧 mount 再挂载新域 | child 与主域不同；异步激活 token 拒绝旧响应| 接通／保留；布局可重组 | [SHELL](source-map.md#shell) constants:1、workspace-host:62–116,372 起 |
| G02 | 标题、breadcrumb、Back、Inspector 开关 | 当前 route/context；展开 Dock 或 compact Sheet | 无内容时不可假装有 Inspector；Back 先处理临时层；焦点归还 | 接通／整合 | app-shell:161 起、1050–1152；navigation-authority |
| G03 | 搜索／Command；输入、结果、Arrow/Home/End/Enter/Escape | `Ctrl/Meta+K`；registry 命令 + product-search 的 Work/Session/Project/World/Knowledge/Prompt 等来源 | 搜索来源部分失败要保留其他结果；无结果与重试；IME 不触发选择；compact palette 变 Sheet | 接通／保留 | app-shell:636–895；product-search；workspace-host 的 registry.register |
| G04 | 全局菜单：Learning、Diagnostics、Extensions、Settings、Account | utility child 挂载；菜单键盘导航、外点关闭 | 需要 account/日志权限仍由原服务；不能只在 desktop 出现 | 接通／整合 | constants:9、app-shell:900–944；workspace-host:utility 路由 |
| G05 | Learning：课程、Resume、Back/Next、Skip、Done、Close、Redo、跳真实页面 | learning-center 课程与账户隔离 browser storage；身份/导航/Runtime/Work/Play/知识/Prompt/Save/Settings | 是引导，不创建虚构模型/作品；不可用 storage 不阻断实际产品 | 接通／保留 | [LEARNING](source-map.md#learning) |
| G06 | Loading/empty/error/retry、未保存离开确认 ||refresh 失败不撤销已提交回执；旧响应不得覆盖新页面| 接通／整合 |primitives；各域 sequence/isCurrent|
| G07 | 登录账户列表／handle/password、Sign in、登录恢复；条件 OAuth/注册入口 | `login.html` 及 login handler；server auth 配置决定显示 | 未配置 OAuth/注册不能展示为可用；鉴权失败保留可重试入口；密码不可进入诊断材料 | 接通/条件／保留 | [独立入口](source-map.md#服务器与独立入口) public/login.html；login.js |
| G08 | 作者作品 UI：host surface、drawer/modal、full/hybrid Stage、恢复菜单 | presentation runtime/Host Bridge + Work manifest；slots 包括 app.root/chat.header/chat.footer/composer.before/composer.after | Work 不能取得 raw Host 写权限；presentation 故障有 Exit/Stop/Save/Persona/Diagnostics/Reload | 接通/条件／保留 | [PLATFORM](source-map.md#platform) host-surfaces:43、full-host:49、native/frontend/runtime |
| G09 | 条件注册、Forgot password/Recovery、OAuth、Back to sign in | register name/handle/password/confirm → server register；recovery code/reset；GitHub/Discord OAuth 以 server providers 返回为准 | 注册关闭、discreet login、错误 code、密码不一致、连接失败区分；不是无配置默认可用 | 接通/条件／保留 | public/scripts/login.js:90–130、270–335、367–541；public/login.html |
| G10 | Edge navigation：Show/Hide、grip/handle、拖动/长按、Left/Right/Bottom menu radio、键盘 ArrowLeft/Right/Down、Command Show navigation | edge-dock 是表现组件，AppShell仍拥有 navigation；按 pointer/keyboard 展现，取消手势/失焦时收束 | 键盘焦点在导航时不自动隐藏；软键盘开启暂隐藏；pointercancel/lostcapture/Escape 有出口；位置和动效外观未冻结 | 接通／保留可发现与替代操作，表现可重组 | edge-dock:2–541；app-shell:1234 |

## Library：作品、安装和进度

| ID | 页面／控件 | 操作与保存结果 | 条件、异常、恢复 | 状态／处置 | 源码依据 |
| --- | --- | --- | --- | --- | --- |
| L01 | Works 搜索、Work 卡 Open、Install/Update、Import Save、My Games | client listWorks/listSessions；Open 到 Work detail；筛选保留 browse state | Works 与 Games 可分别失败；空库给安装入口；缺精确版本的 Continue 禁用 | 接通／保留 | [WORKS](source-map.md#works) library-workspaces:163–199 |
| L02 | `.atria` 文件选择、权限复选、Details、Install/Update、Review again、Cancel | 文件 preflight → 显示包身份、版本/更新差异、required permission → installPackage；| 当前上限 128 MiB；必需权限未选不能安装；已安装回执与 Open Work 分开，打开失败不能重装 | 接通／保留 | library-workspaces:41–132；package-permissions |
| L03 | Work 详情：entrypoint、Session title、Start New、Continue | startWork 锁 packageVersionId/entryPointId；已创建 Session 后重试只打开原 Session | 作品未 ready／无入口禁用；task bindings 缺失先配置；精确依赖失败保留作品和进度 | 接通／保留 | library-workspaces:200–239；task-binding-ui |
| L04 | 已安装版本 Details、Start from this version、Create Session on this version、Cancel | 独立选择该 version 的 entrypoint/title 并新建会话；不切默认 Work version | 明示非默认版本；创建成功后锁字段防重复建；缺任务 Route 先 preflight | 接通／保留 | library-workspaces:240–274 |
| L05 | Work 管理：Review dependent Sessions、Delete Work | 查看现有 Session，删除前确认；| 有 Session 不能直接卸载；需先导出有价值进度，再处理依赖；不能把 Delete 画成隐式 GC | 接通／重组 | library-workspaces:276–284；product-client deleteWork |
| L06 | My Games：Continue、Manage、Rename、Worlds & Knowledge、Export `.atriasave`、Delete | Session 操作复用 Play 的身份/保存服务；rename 有 expectedDisplayTitle | Delete 会删除 Session 与 SavePoints，单独确认；缺版本时 Continue/Export 按现有条件禁用，依赖详情可读 | 接通／整合 | library-workspaces:134–160；session-naming |
| L07 | task model setup：slot→Route 下拉、Configure Runtime、Refresh、Save and continue、Cancel | task-bindings/preflight；| 不跳过缺失能力；从 Runtime repair 返回原草稿和原操作；保存绑定不代表已执行生成 | 接通／保留 | task-binding-ui:21–117；workspace-host runtimeRepair |
| L08 | Work／Session 的 World/Knowledge setup：exact selection、保存 | resource-setup 读取当前 scope、entrypoint、合法 exact 资源；保存到原配置服务 | 确认作用范围；原作品资产与 Library 副本不同；缺引用要修复，不能自动替成 latest | 接通／保留 | resource-setup:1–80；product-client get/saveResourceSetup |
| L09 | Work 权限/Package resources、Game Regex、知识覆盖 | 查看声明、当前 grant、只读 package 原件及合法 override | 改 presentation 不扩大 Host grant；Package 原件不直接覆盖；区分每 Work 与每 Session | 接通/条件／重组 | package-permissions；package-library-resources；library-workspaces |

## Library：World、Knowledge、绑定与修订

| ID | 页面／控件 | 操作与数据结果 | 权限／状态／恢复 | 状态／处置 | 源码依据 |
| --- | --- | --- | --- | --- | --- |
| K01 | Worlds/Knowledge 类型切换、名称创建、搜索、Open | Library 原生 identity；空库可先创建首修订 | name required；列表刷新失败保留创建结果；World 不等于旧 World Info | 接通／保留 | [WORKS](source-map.md#works) library-workspaces:286–425 |
| K02 | Resource bundle 文件导入、预检、导入确认；Export、Copy to Library | 用原资源 bundle/closure 服务，包含 exact refs | 缺依赖、同身份冲突需预检；复制形成独立身份，不能覆写 package 原件 | 接通／保留 | resource-bundle-controls:1–85；package-library-resources |
| K03 | World：名称、typed object/array 字段、类型、Add/Remove field、Source、Review Changes | World editor 在同草稿编辑 structured/JSON；Review 后由 revision editor 提交 immutable revision | 禁止危险 property name/重复字段；JSON/类型错误留草稿；新 revision 不迁移消费者 | 接通／保留 | [KNOWLEDGE](source-map.md#knowledge) world-editor:49–193；library-revision-editor |
| K04 | Knowledge entries：搜索／过滤／分页、详情、Add/Edit/Enable/Delete | 从条目操作进入新修订草稿；启停/删除并非直接修改旧 revision | 空项与未匹配不同；删除有确认；现有 binding 保持 exact revision | 接通／保留 | library-workspaces:377–389；knowledge-entry-browser:1–108 |
| K05 | Knowledge 编辑字段：title/content、关键词/发现策略、状态条件、关系、delivery/budget、compact text | 条目顺序、Add/Remove condition、matching all/any、provider/path/operator/typed value、exclusive group；Fields/Source；Review |提交期间 inert，失败原稿还在| 接通／保留 | knowledge-editor:23–164；knowledge-contracts；knowledge-form-controls |
| K06 | Binding：exact Knowledge revision、target/visibility、augment/override、priority、Review、Back/Save、Cancel、Delete、Used By、Attach/Detach Worlds |World attachment 单独 Review/Save World revision，影响未来解析，已安装作品/Session保留快照| 与条目编辑、World Truth、Memory correction 不混同；被历史World引用也禁删；引用可跳World/Studio | 接通／重组 | knowledge-binding-manager:1–108；product-client binding methods |
| K07 | 修订 History：查看 exact、对比／promote／fork 与 Used By | immutable 历史与当前指针分别处理；fork 生成新身份 | promote 不是改历史内容；失败重载| 接通／保留 | library-revision-history:1–107；product-client revision-actions |
| K08 | 名称更新、Delete World/Knowledge、反向引用修复 | 删除前 query references；有消费者先列 blocker 和跳转目标 | 不静默 detach、cascade delete；失败资源仍在| 接通／保留 | library-workspaces:346–376；reference-remediation；resource-reference-rows |
| K09 | Package 原件：详情、exact revision、Fork/Copy、Used By | 包内资源只读；新副本进入 Library/Project 正式 writer | 只读状态不应伪装为 disabled Save 而无解释；可解释复制后谁会使用 | 接通／保留 | package-library-resources；library-workspaces:297–299 |
| K10 | Session embedded knowledge 晋升：选择、目标、Review/保存 | 显式 promote-knowledge 到原 Library 服务 | 不能把生成推测直接写世界事实；| 接通/条件／重组 | embedded-knowledge-promotion:1–62；play-controls；product-client |
| K11 | 修订详情：Export exact、Delete unused revision、Inspect/compare、Create revision from this、Confirm current、Review/Create fork、fork name | 历史内容只读；删除仅 earlier且无引用；promote仅改Library head；Fork形成独立identity，World bindings仍按原合同共享 | 删除确认/服务再查引用；current禁止当unused删除；fork结果导航失败不重建同identity；历史精确引用受保护 | 接通／保留 | library-revision-history:40–107 |

## Personas

| ID | 控件和业务 | 权限、状态、保存／删除行为 | 状态／处置 | 源码依据 |
| --- | --- | --- | --- | --- |
| P01 | Persona 列表：搜索、创建、查看 archived、Load more、Open | 库 identity 和 immutable revision；未匹配、空、加载失败各有反馈 | 接通／保留 | [PERSONA](source-map.md#persona) persona-ui:21–150 |
| P02 | 名称、描述、avatar 导入/移除、Save revision、Duplicate、Archive、Default、Used By、删除（按当前资源条件） |默认选择不重写既有 Session 身份；不能把 archive 当物理删除| 接通／保留 | persona-ui；product-client personas methods |
| P03 | Play Persona dialog：No Persona、搜索／选 exact、snapshot、Cancel、Reload Session | 捕获 Session/revision；写 persona/select 有 expectedRevisionId；冲突要求 reload，不自动把选择应用到另一 Session；Tab trap/cancel/focus return | 接通／保留 | persona-ui:198–269 |
| P04 | 现有 legacy persona 迁移／adopt-default 工具 | 当前源码有 preflight/apply/receipt；是历史数据桥接的现状，正式重构零 ST 兼容，不作为新产品必须保留流程；原生 Persona 本体必须保留 | 旧/条件／废弃兼容流程；保留原生能力 | persona-ui:迁移段；product-client:53 起 |

## Play：阅读、生成、历史与存档

| ID | 页面／控件 | 处理链和数据来源 | 条件、失败、恢复 | 状态／处置 | 源码依据 |
| --- | --- | --- | --- | --- | --- |
| Y01 | Play landing／Recent stories：Browse Library、Import save、Continue、Open Work | 最近会话从 product client；本地 last-reading 只定位，不是会话真相 | exact Work 缺失禁用继续；不能自动创建替代故事；列表失败可重试 | 接通／保留 | [PLAY](source-map.md#play) play-controls:433 起 |
| Y02 | Session title、Work/version、Live/History/Recovery/ended、Timeline | NativeSessionRuntime snapshot/timelineRoot；安全 prose renderer；身份、消息序列、条件头像/媒体 | History 只读；failed 给 Reload；dead 不可继续输入；找不到状态不能伪装 live | 接通／保留 | play-product:86 起、276 起；session-runtime |
| Y03 | Composer 文本、Send/Stop、Enter/Ctrl/Meta+Enter | host.composer/host.conversation → generateNative → runNativePlayGeneration → Session persist / generation / Task Turn | busy 防重入；IME composition 不发送；只恢复“未被接受”的输入，已提交 user Turn 不得重复发送；错误可修 Runtime | 接通／保留 | play-product:430–488；play-generation:1–116；generation-client |
| Y04 | Jump to latest、向上阅读、长时间线窗口、重载范围 || 用户向上阅读不强拉到底；新 Session/branch 清窗口；stale page 丢弃；性能未实测 | 接通／保留 | conversation-window:1–95；play-product |
| Y05 | Toolbar：History & saves、Context、Prompt choices、Save；More | toolbar 复用 Shell Inspector；More 下 Health/Shared/Quick Save/Load/Back | 保存与切换在 busy/generation/history/failed/dead 下按 writable 禁用；离开不是等于取消服务器任务 | 接通／整合 | play-controls:113、192–428、sync |
| Y06 | Save、Quick Save；保存名／自动保存 enabled、interval、retain、Save settings | 原 Session SavePoint 与 autoSavePolicy；当前 revision 受检 | 保存成功有 receipt/反馈；失败不显示 Saved；自动保存不等于账户 ZIP backup | 接通／保留 | play-controls:timeline/save handlers；product-client createSave |
| Y07 | 存档 Load、Export、Session Export `.atriasave`；Import password/Review/Import/Cancel | save/session export；| `.atriasave` 当前上限 64 MiB；缺 Work 可按 exact dependency 安装修复；密码错误保留文件；导入成功但打开失败不再导入 | 接通／保留 | play-controls:192–305；WORKS library-workspaces:41–132；save-dependency-recovery |
| Y08 | History：Find branch、Show archived、分页、Explore/All/Current branch、Rename/Archive | history model 与 branch metadata；25 分支/页、50 revisions 窗口 | 可查看不等于可切；显示 incomplete history；损坏精确目标禁用操作，当前分支不变 | 接通／保留 | [HISTORY](source-map.md#history) session-history:46–176 |
| Y09 | Preview/Inspect revision、Switch branch、Return to current story（及回调允许的分支操作） |switch 恢复 branch head 的叙事和状态| preview 只读；switch 是真实写入，忙/历史/过期禁用；默认 Native conversation 明确不支持旧式 regenerate，不能画成 swipe | 接通/条件／保留原生历史；废弃旧 swipe 合同 | reply-variants:99 起、180 起；session-history:101–128；frontend/conversation |
| Y10 | Context Inspector：已纳入／排除项目、预算、来源明细 | 来自最近真实 Context/Generation evidence；没有生成时显示无证据 | 不显示私有 Actor 思维或 Secret；需标 UNKNOWN| 接通/部分／保留 | play-controls Context；context-derived/context-compiler；runtime-client |
| Y11 | Prompt choices：动态字段、Save overrides、Restore defaults | Route-owned typed parameters；依据 exact Program 的参数声明渲染 | 无 Route／未知选项／required 缺失有 remediation；不写 Library Program，不算发布新版本 | 接通／保留 | [PROMPT](source-map.md#prompt) prompt-runtime-controls:1–89 |
| Y12 | Experience health、Shared session、条件朗读、插图工具 | 各自真实子 panel；完整清单见 [Agents/扩展/媒体](agents-extensions-media-inventory.md) | 条件未满足不伪造常驻入口；并非所有 Work 都支持语音/共享/插图 | 接通/条件／保留 | play-controls；experience-health-ui；shared-session-ui；speech-controls |
| Y13 || health/preview给proposed changes与token，health/apply确认并重新打开Session；Task bindings可preflight |source变动重新preview；required capability blocked与optional degraded区分；恢复Session不rewind Player/Realm| 接通/条件／保留 | experience-health-ui:30–100；task-binding-ui |

原生生成依赖 `generateNative`、SessionRuntime、Host Bridge、既有全局事件和部分隐藏锚点，不能沿用旧盘点“必定把文本填进隐藏 textarea 才能发送”的推断。当前明确输入与防重复提交逻辑在 `play-product.js:430`；零旧兼容的实施依赖见 [架构问题](component-and-architecture-findings.md)。
