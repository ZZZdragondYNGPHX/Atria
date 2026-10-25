# Atria Immersive Workspace — Record

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

- Task ID: `refactor/atria-immersive-workspace`
- Primary Workspace: `main`
- Status: Completed — A1–A5, B1–B4 and F complete within the frozen local support scope; merged and pushed to main `4ac8affbf` on 2026-10-06
- Plan: [Plan index](../../plans/refactor/atria-immersive-workspace/index.md)

## Summary

本任务承接用户的“整理 Atria 前端界面”讨论。经 v0.2–v0.8 多轮交互原型和确认，2026-10-05 整理成新的 Plan Bundle。旧前端重设计与 Native Frontend v3 的已完成历史保持不变。B1–B4 完成逐类映射、完整 Source/高级字段与原 authority 下的草稿和生命周期修复。Shared description 继续 `shared_scope_unsupported`。完整设备/数据库/外部模型矩阵未执行，具体证据与限制见各阶段及末尾 F。

## Stage D0 — Discussion consolidation and Draft Bundle

- Date: 2026-10-05
- Docs start HEAD: `eebb2a87a8936d64dc551df3c8bfae0bf3cace3d`
- Product read baseline / unchanged HEAD: `783bb6fd30729263a97bb69842befcd1d25c1885`
- Package unchanged HEAD: `a13bce997`（仅恢复上下文，不承载产品实现）
- End/Tested docs content: 本 D0 文档提交中的 Bundle；没有对应产品 tested HEAD。
- Status: D0 complete; D1 review/freeze pending

### Completed

- 整理 D01–D20 已定项，P01–P06 实施提议保留 Draft 标记，避免重新询问已确认偏好。
- 复制原任务 `01-screens-and-actions.txt` 的 S00–S19 原文基线，明确其中布局建议由新 Bundle 覆盖；保留完整编辑器与高级 JSON/Source。
- S20 拆为 A4a 原生契约/持久化与 A4b UI/迁移/备份开放；覆盖 account、session、message、request、branch/save、shared seat 和 Host UI。
- 保护 package/main 的原有 untracked 项；未改产品 tracked 文件，未将 main 合并到 package。

### Source evidence and discussion history

原任务：`01a10777-5ad9-76b1-900d-9f53dbb5511a`；续接讨论：`01a107a4-a3f9-7ba3-9adf-47d1d0c2660f`。

独立讨论资产（非仓库产品输出）：v0.2–v0.8 HTML 原型与各轮状态；最新 `19-personas-v0.8.html`、`20-discussion-state-v0.8.txt`、`21-coverage-gaps-v0.8.txt`、`22-persona-reconstruction-scope-v0.8.txt`。参考材料包括旧 Persona 管理截图和 [官方概念资料](https://docs.sillytavern.app/usage/core-concepts/personas/)。

日志未读到 error。其限制为内存样例，无真实持久化、迁移、图片上传、模型请求、共享席位或完整会话隔离证明。

### Key decisions

当前总体状态 Draft。已定偏好保持；产品实施尚未开始。旧全局 persona 设置不构成 Native 会话/请求身份 authority；原生重构与迁移是新增工作。

旧整站 SillyTavern 迁移退役与本次用户设定数据转换范围区分；旧角色/聊天/连接抽屉不恢复成平行主入口。资产/会话/请求映射不得凭名字猜测。

### Known limitations / next checkpoint

D1 必须核定 Persona schema/API、会话 namespace/CAS、请求 context 类型/过滤/预算证据、Shared/Host scope、旧 save/旧会话兼容、迁移 ledger 原子性与备份闭包。P01–P06 仍为草案建议，完整编辑器改造顺序也是建议。

下一 checkpoint：审阅并冻结整体实施范围；依 Governance 在当前 D0 阶段结束完成交接并停止，不直接跨阶段修改产品。

## Stage D1 — Contract audit and implementation freeze

- Date: 2026-10-05
- Docs start HEAD: `a66f2eb38`（本轮 fetch 后 fast-forward）
- Product baseline / unchanged HEAD: `783bb6fd30729263a97bb69842befcd1d25c1885`
- Product task branch: `refactor/atria-immersive-workspace`
- End/Tested docs content: 本 D1 持久化提交中的 6 个 Plan 模块、同一 Record 与 live HANDOFF；
- Status: D1 complete; A1 next

### Completed and authority

实施沿既有 Bundle 推进，常规问题自主处理；D01–D20 不重开，P01–P06 为冻结的实施选择。B1–B4 沿用方案顺序，各资源类型仍是独立 checkpoint。

拉取远端，main fast-forward 到新语言基线，docs fast-forward 到本任务 Draft；在产品工作树创建同一任务语义分支。产品只有用户原有 AGENTS.md dirty change，没有本阶段产品源码改动。docs 原有 README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md dirty changes 保留且不提交。package/plugin/skills 未改；未读取任何 reference 工作区。

### Contract findings and frozen design

- 新增专用 kinds 经已有 Native Storage 注册，不误用只接收 Prompt 资源的 VersionedJsonResourceHandler；冻结 root/revision/default/receipt、exact ref、CAS、API/错误/内容与头像限制。
- FS withTransaction 不提供跨文件回滚。迁移采用 prepared → 资源发布 → receipt 的逐项恢复账本，source/plan digest、预分配 ID、失败重放与默认独立 CAS；不承诺整批回滚。
- 旧 revision 不回填。
- retryReply 的 post-user fork 与 typed transaction 的 pre-effect + 新建输入路径不同。后一条目前只重建 authority retry metadata，A4a 必须保留原输入身份/快照，Provider retry 则固定已捕获上下文。
- typed task context 当前只有五种来源；Native Context lane/provider/Prompt consumer/host task filter/effective request evidence 都需接线。player persona 显式 opt-in、player_provided authority，不混入世界事实，notes 不发送。
- Shared member/seat/scope/epoch 和 Host 白名单可复用，但无 Persona 功能。冻结主体自行选择、授权头像副本/私密投影与显式 Host picker capability，保留独立宿主恢复。
- Save v1 snapshot/session、v2 resume 继续读取；账户备份复用 native/native_resources/nativeBlobs/现有 manifest，默认恢复独立审阅，不新建备份服务。
- legacy Persona JSON 实际无版本号，仅三个顶级数据项，无图片/聊天绑定。支持该准确来源，未知版本/宏/绑定/缺图明示 pending 并保留原文，不生成假完整恢复。
- Native play 当前 modifier+Enter，旧设置有 -1/0/1 和 legacy AUTO 平台差异。P01 冻结 Native AUTO 保持换行、显式设置生效；A2 加 IME/Shift/modifier 测试，不改旧保存值。

Record 不成为第二份字段定义。

### Limits / next checkpoint

A4 新增契约均待实现；共享跨账户资产与 Save v3 尚无兼容证明。A1 不提前开放 Persona 占位入口，不替换编辑控制器，不运行 A4 测试。

依 Governance 在正式 D1 阶段完成持久化与交接后停止，本轮不跨入 A1。

## Stage A1 — Floating shell, navigation and shared state

- Date: 2026-10-05
- Product start HEAD: `783bb6fd30729263a97bb69842befcd1d25c1885`
- Docs start HEAD: `491393594c462b60edf0fabae4e67d256a7867f7`
- 提交后没有产品修改）。
- Product branch: `refactor/atria-immersive-workspace`；阶段提交已 push。
- Status: A1 complete; A2 next；未合并 main，沿用同一分支。

### Completed and authority

- 复用原 tokens、Environment、appearance、导航与控制器，外壳改为有间隔/圆角/边界的浮动 Rail、顶栏、Focus 和 Dock；compact 安全区域与 44px 顶栏目标保留。新增平台 serif token，正文应用留到 A2。
- compact 实际阅读挂载时隐藏底部五域导航，独立于键盘状态；顶栏菜单保留五域与全局工具。管理页恢复底部导航；Medium Dock/compact Context Sheet 继续使用原焦点与弹层 ownership。
- 搜索结果渐进发布并保持选中 identity；按来源/owner 展示失败与局部重试，保留其他成功结果。过期结果执行失败回到原查询并给可读错误；Back 回原入口恢复查询；搜索 Enter 不抢 IME composing/229。
- URL exact 资源前缀识别 detail 类型；取消保留当前表面与字段，确认离开丢弃；不引入第二套草稿持久化或写入 authority。
- World/Knowledge 观察真实 detached 模型草稿，Studio 接 pending ChangeSet/Agent review。Library/Runtime 在成功写入回执后清除未保存观察，即使后续读取失败也不误报；既有 Review/Apply/Commit 路径保留。
- 原认证/启动条件未改；学习中心、设置、账户和 Guided/Startup/Expert 诊断继续挂载原控制器与服务。没有新增 Persona 占位入口。
- 产品/文档原有 dirty changes 保留；package/plugin/skills 未改，未读取 reference，未提交截图/fixture 用户数据/生成产物。

### Findings and decisions

首轮浏览器 320px 场景发现 `runtime` 可能先命中包含该词的 Skill，而非 Runtime 主域。

直接复用原 controller 不足以保护新增跨域/Back 出口：离开会 dispose 编辑器。A1 把判定放在现有 navigation authority；草稿继续由原编辑器持有。收尾补模型 dirty 标记优先于选择控件值差异，并补 Library/Runtime 成功回执，避免仅换选择控件或已保存但刷新失败时出现错误提示。

没有把原生 confirm 的“取消保留当前表面”描述成跨页面自动保存草稿。控制器内部换页、完整会话阅读/输入、资源分类与恢复流仍在 A2/A3 的原 authority 上实施。

# 7 suites / 38 tests passed（外壳/原工具基线）
# 6 suites / 27 tests passed（草稿接线轮）
# 8 suites / 52 tests passed（排序/成功回执轮）
# 4 suites / 13 tests passed（最终模型标记/Library 回执修改）
# 1 suite / 6 tests passed（补真实 Library 编辑器 save 成功后 refresh 失败的 unit 场景）

上述合计 7 个不同浏览器场景最终通过：Expanded Back/Forward/refresh、320px 深/浅色和菜单焦点、compact 导航/Context Sheet、仿真键盘/visual viewport、Medium Dock、A1 阅读外壳/返回查询/离开草稿、A1 学习/设置/诊断。新增外壳阅读与草稿 fixture 为 DOM 接线场景，不代替真实 Session/编辑器全流程。

本地浏览器截图已查看：`tests/.e2e-scratch/a1-expanded-frame.png`、`a1-compact-navigation.png`、`a1-compact-diagnostics.png`；ignored，仅本地证据，不入库。

本任务源码/文档 diff whitespace、内部链接/源码测试路径与阶段一致性通过。

### Limits and next checkpoint

composition/keyboard 单元事件和 viewport 仿真不构成真机证明；serif 目前仅 token；完整正文、自有 UI/共享恢复与输入策略统一归 A2。

保留所有编辑能力与 exact authority，执行 P01 AUTO/显式发送策略。不重复 D1，不提前开放 A4 Persona。正式 A1 完成持久化与 Record/HANDOFF 后停止。

## Stage A2 — Play, Library, install and recovery

- Date: 2026-10-05
- Product start HEAD: `f56b3d8526507719353d5905b0148eb5d4d1d56a`
- Product End/Tested HEAD: `2d0df2cef1d5580358555f553203a9cf5616700a`；
- Docs start HEAD: `09740ec7631e83d19b8146d18850b6c8f21f1d81`
- Status: A2 complete; A3 next。继续同一 `refactor/atria-immersive-workspace` 分支；未合并 main。

### Completed and authority

- S02：继续和最近作品使用原 product inventory / Session opener；某个 inventory 失败仍保留另一集合，错误与重试就近呈现。缺 exact Package 的会话可审阅/安装匹配文件并重查，不能用 latest 替换。新增 More → 返回游玩首页，调用原 Session.close；未发送输入离开取消保留，确认退出后可继续真实 Session。
- S03/P01：平台叙事 serif、元数据 sans、显示名首字头像回退和消息序号并列；悬浮输入卡片有 no-blur 回退。复用当前 powerUserSettings.send_on_enter：AUTO(0)/DISABLED(-1) Enter 换行，Ctrl/Cmd+Enter 发送；ENABLED(1) 也可直接 Enter，Shift/Alt/composition/229 不发送。未接受的失败输入只恢复到同一 Session/基准 revision；已提交输入不重复发送。pending submit 禁止重复发送，但真实生成期间 Stop 仍可用；不新增聊天/请求 authority。
- S04：历史与存档默认关闭，顶栏明确入口；历史预览接到原 facade 和 Runtime.forkRevision/switchBranch/retry，查看保持只读，恢复当前入口保持。切 Session 关闭旧 drawer。save 使用真实 expectedRevisionId；重命名、嵌入 Knowledge、export、Prompt choices 与共享工具保持原路径。
- S05/S06：Library `install` / `import-save` 为完整流程页，选文件 → 预检 → 权限/exact 依赖/密码 → 写入 → receipt/打开。128MiB Work / 64MiB Save 在读取前拒绝超限，坏文件可重新选择/重试，来源变化与 409 可重新审阅。成功写入后打开失败只能重试打开；不会把成功安装/导入当作失败重放。
- S07/S08：保持 World/Knowledge 原版不同权限、全部字段/Source、immutable revisions、闭包/Fork/Used By 与四类 Prompt 资源、preset categories/modules/stages/Regex。列表/详情及分类往返保留查询；revision/preset 保存成功但读取失败保留 receipt 和只读重试入口。界面状态位不替代 resource/service/persistence authority。
- S17：保留作品 Shadow DOM 与现有宿主边界，serif 仅平台正文；真实 save handler 拒绝历史/生成。Exit/diagnostics/reload 继续原 handler。自有 UI 内容清空不移除独立 recovery；Persona Host chooser 仍归 A4。

### Findings and decisions

首次安装浏览器场景发现 WorkspaceHost 只接受旧 Library section，新 `install` 被当成 Works 首页。修正既有 authority 的域/子路由提交和 flow 路由，未增加 router；首次 history 新场景只 Explore branch，没有选择该分支的具体 Preview revision，因此 Switch 正确禁用；测试改为先预览 exact revision，再 switch 后通过。

补模型 Source 内部 Back 与 preset 上层 Back 后，取消确实保留原编辑器；没有添加跨路由自动存草稿。保存 receipt 必须在刷新前清除 dirty；revision reload 先构造新表面，失败时保留原 receipt，preset read failure 不再次 PUT。防重复发送轮发现 submit 的 busy 位若直接用于禁用发送按钮会禁用正在生成的 Stop；已拆分提交等待/真实生成条件，补 pending Promise + real Stop handler 单测。

这些失败不计为通过。

# 15 suites / 73 tests passed；最终小修改仅下列相关集合
# 2 suites / 9 tests passed，补 inventory 部分失败
# 1 suite / 12 tests passed，补实际 pending submit 期间的 Stop；上述最终 75 个不同 unit 用例均有通过证据

合计 12 个不同 browser 场景最终通过：真实 Session resume / committed timeline、流式 reader position / node identity、Save 与旧 drawer response、320px 输入/仿真键盘/Context Sheet、安装权限/失败重试、World/Knowledge 详情、history inspect/fork/switch/生成禁用/退出草稿、加密 Save exact 旧版本恢复与新版默认保留、Full recovery/focus/Escape、中文/大字/横屏、390px preset module 返回位置/菜单、Regex 归属/portable ownership。没有用内存样例代替存储。

查看过本地阶段 reading/history 与 install-retry 截图；截图/fixture/测试产物仅 ignored 本地证据，不入库。

### Limits and next checkpoint

composition/229 是合成事件，键盘和 safe area 是浏览器仿真。共享 UI/Session authority 保持原实现，权限全矩阵仍归 A4/A5。未另跑后端 Save/SQL parity 全矩阵，实际 FS browser 往返只证明上述 fixture。Avatar 为显示名首字回退，未引入 Actor/Persona 头像资源协议；Persona/第四分类/Host 身份选择未开放。分类查询只在当前 controller 生命周期保留，不是跨账户/跨刷新持久化。

继续同一分支，推进创作/运行配置/智能体/扩展，不提前实施 A4。

## Stage A3 — Authoring runtime agents and extensions

- Date: 2026-10-05
- Product start HEAD: `2d0df2cef1d5580358555f553203a9cf5616700a`
- Product End/Tested HEAD: `57a37bc8ac69ed0274d04ce0a8d1016d96ac4496`；同一 `refactor/atria-immersive-workspace` 分支，已 commit/push，未合并 main。
- Docs start HEAD: `0d05c835ee82b900010030691e2e8e3f7a8be64f`
- Status: A3 complete; A4a next

### Completed and authority

保持原 source/service/persistence，不读取 reference、不引入 Persona 或第四 Library 分类、不开始 A4。

Studio 保留 20 view 和原完整结构/Fields/Source/文件编辑器。World/Knowledge/Assets 的编辑与引用页签保留同一 DOM/草稿。资源 Attach/Update 固定 exact revision；缺失修订仍保留原值并拒绝 prepare，不替换 latest。Fork 保留 Library 来源 provenance、生成独立 project 资源并选择其编辑器。Review detach 查真实 exact 反向引用，并补直接 EntryPoint/World 消费者定位；Used By 仍查原 graph。Asset 资源不可变，不添加原后端未支持的 Update。

人工 Inspect/Review/Apply 与 Project Agent Review/Commit/Takeover 保持不同 authority。人工 draft 或待 Apply 阻止 Agent Commit；New Task 清理旧 Task 审阅。成功写入先记录 receipt，读取失败只提供 Reload Latest/list，不重新 Apply/Commit/create/install。提交中冻结原字段。Preview/Simulation/Build 固定基准与表面，迟到结果不覆盖后来打开的编辑器；registry/graph/resources/library/history 辅助失败独立呈现/重试，不清空已加载项目或当前未保存字段。

Runtime 原全部角色、provider/Secret、模型能力、fallback/exact Prompt/Generation、Embedding/Rerank 和 compile 入口保持；已保存刷新失败保留只读 receipt。修复期间安装新默认版本不改变原旧版本启动。临时返回记录只属于 UI，不成为平行 authority。

Agents 默认 Run，显示固定 Session 范围，过滤旧会话 Run/Stop；Native 合成角色的 avatar 不成为 Character binding，Session binding 仍沿用原 chatKey ABI。spec/loop/agenda/director 的原字段/JSON/工人/专家/工具/权限/预算与路由保持。preset draft 固定范围，scope lost 拒绝原写入并允许 guarded Reload。Session lifecycle 使用正确 `agents:workspace` key 重挂；

Skills/Plugins 文件、scope、manifest、invocation preferences、外部安装/更新禁用逻辑保持。Tab/Cancel/Refresh 离开保留草稿，保存读取失败不重放。官方插图的角色/别名/固定外观/服装、全局/作品覆盖、模板、NovelAI 参数和原两种 task 入口保持；仅查看作品范围不生成修改。会话工具仍由 SDK 清理，在现有外壳内部工具层挂载，只在 Play 会话表面显示，正常点击不被外壳遮挡；管理与配置关闭取消保留草稿。按钮使用现有颜色 tokens 修复深色可读性。

# 11 suites / 94 tests passed；最后两项小修改仅相关 suite
# 1 suite / 8 tests passed，新增 orphan-field 回归：上述集合最终 95 个不同用例
# 1 suite / 7 tests passed，部分失败恢复的最后调整
# 修复本地 ABI 后 1 suite / 4 tests passed（FS + SQLite）；合计 12 suites / 99 个不同用例有通过证据

共 10 个不同 browser 场景有最终通过证据：Studio 320px 原 Review/Source/UI/conflict/Agent；A3 390px 全 20 view/Attach/Update/Fork/detach/Used By/人工 receipt；fallback role/order/exact；Diagnostics 缺 pinned context 不生成；真实 Secret + Rerank；320px Agents 两条不同 exact route；Session 切换 Memory 迟到确认拒绝与 Run/binding；320px Skill 路径/文件脚本保存/启停/导入；390px 官方插图配置保存/草稿取消/作品覆盖/工具点击；390px 修复返回原启动/保留标题/绑定与旧 PackageVersionId。部分 fixture 使用 run-state evidence，无真实模型发送。

复查本地插图管理/会话截图与失败遮挡截图；截图/fixture/产物仅 ignored 本地证据，不入库。

### Limits and next checkpoint

未执行全量 tests/完整 E2E、构建、Android/真机/WebView/真实中文 IME、真实远端模型/图片服务或远端 CI。Prompt/图片 cancel/历史/过期及 Skills 文件树全矩阵沿用原 authority，未本轮全跑；V09–V16 和 S00–S20 的完整集成仍归 A5/B/F。FS/SQLite 插图偏好测试不替代 A4 新 Persona 原生持久化/请求/Save/shared 契约。

保留产品 AGENTS.md，以及 docs README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md 的原有 dirty changes，不提交。package/plugin/skills 未改、reference 未读、未提交本地路径/用户数据/Secret/缓存/原生二进制或生成产物。

先做 Native Persona 资源/资产、Session/message/request 快照、Prompt evidence、branch/save/shared 服务契约与合约测试。A4b 入口开放仍要独立 checkpoint。本轮完成 A3 持久化后停止，不自动进入 A4a，不合并 main。

## Stage A4a — Native Persona resource and Session contracts

- Date: 2026-10-05
- Product start HEAD: `57a37bc8ac69ed0274d04ce0a8d1016d96ac4496`
- Product End/Tested HEAD: `e35e900077b6c2963cd032cdccfc45c24ab90102`；同一工作分支，已 commit/push，未合并 main。
- Docs start HEAD: `cf8fffabf53a2427c4cd525c71f27d5bad612fb2`
- Status: A4a complete; A4b next; Persona product entrances remain closed.

### Implemented authority and decisions

只触及当前任务，无 reference 或 Skill 加载。

新增 persona ID 和四个 Native kinds，FS/SQL 共用既有 native resource key 注册。PersonaRepo 提供 owner 限定 CRUD/exact revision/list/search/pagination/归档/default CAS/Used By/delete/avatar，Native Product POST 家族及原 client adapter 接同一 repo。名字可重名；内容大小按 Unicode code points/UTF-8 拒绝超限；unknown fields/缺 CAS 前提拒绝。revision immutable，root/default 独立 CAS；成功直接返回发布回执，不依赖刷新。

FS 不具 rollback；exact get/revisions 不暴露未发布内容；Persona/Asset 引用锁保护发布，永久删除重查真实 default、所有持久化 Persona state 与 migration target；管理备注中出现 ID 不算引用。引用策略保守保留历史/存储快照，不自动清理迁移 receipt。

头像允许 PNG/JPEG/WebP/AVIF、8 MiB/4096²/像素限制；先读取尺寸再实际解码，拒绝伪 MIME/坏图/超尺寸。现有 Jimp 浏览器 WASM 初始化在 Node fetch 本地 URL 失败，改为从已安装 codec 的本地 WASM 字节初始化；不下载、不新增依赖。Persona published revision、state、migration Avatar ref 纳入删除保护。

SessionCore 捕获 default/explicit/none 到 reserved `atri_player_persona`；资源锁保持至 Session HEAD 发布。与发送竞争仅一方 CAS 发布。匹配现有 Continuity → Session 锁序，避免在 Session 内反向重入资源锁。未开始故事允许专用 persona 操作，但普通 generation/raw write/save 的 pending 禁用仍保持。

统一 `_newEntry` 服务捕获正式 user metadata `atri_player_identity`，覆盖普通输入、typed transaction 和 beginStory；拒绝客户端自造身份，notes 不入 namespace/message/request。旧 revision 读取不补写。非 transaction retry 回准确 post-user fork；显式 fork/restore 仍按原 revision；ironman 不绕过 rewind 限制。

新增 `player_persona` lane / `player_provided` / `context.player-persona`，只读接受的 Session snapshot。Prompt stage `contextConsumers` 显式 opt-in，typed task 还需 context 声明且排除 background/maintenance；普通 role 只准 narrator。管理备注不入请求，维护任务与客户端 prompt.host 伪造拒绝。受控本地 HTTP Provider 捕获了真实参数；修订 Persona 后仍发送原接受快照，preview 无发送/Secret/Session 写入。

有身份的 Save 使用 v3，容器 v1 magic 保留，snapshot/session/ironman resume 三 scope；v1/v2 legacy 读取保持。跨账户 import 仅恢复独立 Session snapshot，不创建个人库或默认。缺头像/旧 schema 装入 Persona evidence 拒绝，历史/存档头像引用阻断删除。

seat selection 记录无明文 handle 的 authorization，projection 仅 status/name/avatar；成员变更清理当前 seat，旧 Branch 的主体/epoch 不匹配时不泄漏旧身份。头像授权复制到 owner AssetStore，delivery 白名单只加当前授权 peer snapshot，不放开个人库。Shared 输入 receipt 捕获席位显示身份。

Host 只增 `host.persona.status/openSelector` 固定白名单；没有 Library 第四分类/Host picker UI/管理入口。Shared 描述消费当前明确 `shared_scope_unsupported`，避免回退 owner solo/global；这是保留给 A4b 开放审阅的显式停用范围。

# 当时 7 suites / 40 tests passed；resources 最后增加 migration target 引用回归 → 不同用例数为 41
# 4 suites / 22 selected tests passed；其余 skipped 不计通过
# 最后 5 suites / 21 tests passed；最后引用 resolver/新增回归仅以下两项
# 2 suites / 12 tests passed，final resources 7 + save/avatar 5

受控本地 HTTP Provider 再次捕获真实发送的接受时 Persona，排除管理备注/后来重命名与无关任务；不是远端模型证明。截图已本地查看，截图/trace/用户 fixture 不提交。

### Failures resolved and limits

首次浏览器发现新建/详情仅换 DOM 而路由未更新，返回同一 list route 仍停编辑器；选择成功但刷新失败时，通用 action finally 曾重启选择按钮；加入 completed 状态保留 receipt并阻止重放。backup probe test 的 multer prefix 被重复注册导致500，修正 fixture；旧泛型所有 kind 试件为 Persona kinds 写入假 schema，改为非 Persona kind generic fixture，实际 Persona 用新 account-backup 契约覆盖。中文测试 init script 每次覆盖 en，改为独立 zh-cn 页面；Shared client 新试件需注入现有 invocationId，避免 jsdom 缺 crypto.randomUUID。上述失败均不计通过。

未执行全量 tests/完整 E2E/构建/Android/真机/软键盘或真实中文 IME/WebView/MySQL/Postgres/远端模型/远端 CI。原 Bridge epoch/nonce authority未重写；共享描述保持停用；高级 legacy 自动 scope/Actor 映射、整站迁移和历史批量改写未提供。全部 S00–S20/完整 V20 与最终集成仍待 A5/B/F。

产品 AGENTS.md 与 docs README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md 原 dirty changes未提交；package/plugin/skills/reference 未触及。本轮产品/docs 持久化后停止，不进入 A5、不合并 main。

## Stage A5 — First-round integration and compatibility

- Date: 2026-10-05
- Primary Workspace / branch: `main` / `refactor/atria-immersive-workspace`
- Start HEAD: `6bbb69484eabb8e6685bde589af7c8be695306d6`
- End / final touched-surface tested HEAD: `784bb91a83e205669f14445fa1ef49ed248b9799`，已 commit/push，未合并 main。先前无关域合约在 Start HEAD 执行，不虚称全部重跑于 End HEAD。

### Implementation and findings

失败按 coverage/states/personas 的 authority 路由；没有重做 A1–A4b、加载 Skill/reference 或进入 B/F。

浏览器发现从 Play 搜索打开 Persona/Knowledge 详情时，WorkspaceHost 先写父域再写子页，导致一次 Back 只回到父页而不回原查询；Library、Build、Agents sections/Orchestration、Skill 和全局 Utility 的同源接线统一调用既有 Navigation Authority 一次提交完整 domain/child，保留 utility 的中立 Play owner 和 breadcrumb。没有新增 router、持久化或编辑 authority。

320px/真实 `font_scale=1.5` 下，原生 Persona dialog 循环 Tab 会让焦点离开弹层。沿用现有 Runtime 的可见/可用控件筛选规则，补 Tab/Shift+Tab 首尾循环；Esc/Cancel、成功回执和返回触发焦点保持原路径。没有重新开启 Shared 描述、库 CRUD 或 caller opt-in。

新增 `tests/e2e/atria-shell/09-immersive-integration.e2e.js` 三个真实 FS/HTTP 场景：缓存搜索命中原 Persona exact revision（后来改名不自动 latest）、Knowledge exact entry、来源级 Personas retry、Save history 与 Director 搜索返回查询；服务启动前真实持久化旧 Session 不回填，新默认/修订不改已有 Session，picker 留住 Composer 草稿和旧 revision，Save 同 ID 冲突不改写、删除测试 Session 后导入恢复而不新建 Persona；中文/light/Fast UI/减少动效/真实最大字号、320/719/720/1179/1180 边界和双向 Tab/Esc/focus。

### S00–S20 first-round evidence map

下表只映射本轮实际相关证据，证明现有外壳接线与支持范围兼容；

| Rows | A5 actual local evidence |
| --- | --- |
| S00 |A5 exact Persona/Knowledge/Save/Director 跨域与 Back；九类取消后 owner 不变|
| S01 | learning-center 与 startup-loader 合约；真实 fresh/default-user 启动与 A1 全局工具重入。多账户登录条件未全测 |
| S02–S03 | Play landing retry/empty/real resume；阅读节点/位置、合成 draft stream/IME；320px/light/safe-area/模拟 visualViewport；Native generation ABI 与受控 HTTP Provider实际请求 |
| S04–S06 |密码重试/安装确切旧版本/保留新默认/导入；Save v1/session 和 v2/resume、Persona v3 及新旧 Session|
| S07–S08 | Studio exact Library Attach/Update/Fork/Detach；Knowledge exact 搜索与原详情；Prompt controls/presets 完整导出闭包、immutable refs、Regex 与作者/玩家 authority 分离 |
| S09–S11 | Runtime readiness/save receipt/Secret/late response、Memory task exact route、Retrieval FS/SQLite revisions 和受控 HTTP/本地 vectors；Persona preview/预算/无关角色过滤 |
| S12 | 真实 20 Studio view 与 exact 引用 lifecycle；review/Source/草稿/人工回执/late Preview 合约。没有逐字段重造编辑器 |
| S13–S14 | 四模式 Agent settings restore/import exact route；真实 Director 搜索；确认期间切换 Session 后拒绝 Memory reset；Memory route/save 与 scoped diagnostics |
| S15–S16 | Extensions CRUD/scope/冲突/迟到响应合约；真实插图全设置 draft/取消/保存和 Session tools；插图 FS/SQLite CAS/冻结草稿 |
| S17 | Component/Hybrid/Full 与失败恢复 1440/390px；真实 solo Host picker/stale revision/独立恢复；Shared 自己席位选择与描述停用。frontend 用受控 fixture，不代表任意作品故障或完整 lease/nonce |
| S18–S19 | appearance/utility-workspaces/logging 合约；A1 学习/设置/Guided/Startup/Expert；真实中文 font_scale/Fast UI；Persona 账户备份 FS↔SQLite。账户头像/密码全条件未重跑 |
| S20 | Session/context/shared-host/save/account-backup/UI 合约与 A4b 四个 browser dependency 场景；A5 新旧 Session/默认/exact search/Save/focus。migration/storage 的其余断点沿用 A4b，不计新执行 |

# 10 suites / 43 passed
# 9 suites passed；save-system 的 13 本地用例通过，MySQL/Postgres 两项连接失败；不能将整条命令记作通过
# FS/SQLite 范围最终 13 passed / 2 skipped；加上前项九个 suite，96 个不同 passed
# 5 suites / 23 passed
# 最后生产修正后 3 suites / 25 passed；leave- 8 已在首项，新增不同用例 17
# v2/resume FS/SQLite 最终 2 passed / 41 非本轮目标 skipped；此前未过滤引擎的同一目标因 DB 缺环境失败
# 7 passed；生产接线修正前，非相同触及面证据不冒充 End HEAD 全部重跑
# 4 passed
# 最后全部生产修正后 8 passed；A1 utilities 已在上项，故本轮不同 Chromium 场景合计 18
# 首次 webpack 编译成功；最终同一 libraries key 94907547ba0121e2 cache hit（不虚称第二次重新编译）
# English source / zh-cn 通过；两处生产 JS 和两处 test ESLint、git diff -- 通过

**4 suites / 10 tests passed，19 skipped**。覆盖原通用草稿/invalid JSON/focus/单次 Review、human origin/exact base/clone operation、exact Runtime EntryPoint identity/Package-only experienceContract，以及 Shared 描述继续拒绝 opt-in。

2. 包括已知缺口的现状确认，不是无损兼容通过。首轮 probe 的 Package fixture 缺 assets 数组，先报 `AtriaPackage.assets must be an array`；

3. 产品 Git HEAD/diff 保持原状态，原 dirty changes 保留。

不与 Actors/A5 历史测试数累加；没有运行 UI/Chromium/E2E、全量 tests、构建、Android/真机/WebView/软键盘/中文 IME、外部数据库/远端模型/CI。

### Persistence, limits and next checkpoint

产品 HEAD 无变动、不新建任务分支；docs 单独 commit/push 本轮映射、index/coverage、同一 Record/live HANDOFF。产品 AGENTS.md 与 docs README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md 原 dirty changes 保留未提交。package/plugin/skills/reference 未读/未改，不 main merge 到独立长期空间。

本轮停在映射 checkpoint，不合并 main、不删除活跃分支。Actors 不重做，不自动进入 Worlds/Knowledge/B2/F。Shared 描述停用与首轮支持范围冻结保持，完整字段/设备/引擎/最终集成仍待后续阶段。

## Stage B1 EntryPoints — Display checkpoint

- Date: 2026-10-05
- Product start HEAD: `9991c6ef03941ac6d6c321843d692b77841b7797`（与远端一致）。
- Product end/tested HEAD: `f40bca67b56eb42c0b4340d8ca9dfc44f848101a`；
- Docs start HEAD: `dc9f9b496d77713e607ebe312b32c837d3b39f41`；
- Status: **EntryPoints display checkpoint complete — stopped before Worlds mapping.**

### Implementation and authority

复用同一产品分支，新增 `public/scripts/native/studio-entrypoints-editor.js` 并挂入原 `studio-workspace.js`；不重做 Actors、不进入其它 B 类型、不加载 Skill/reference。

- 专属身份/名称、三类 exact 引用及可选 primary、初始 overlay/timeline、runtime/recommendations/orchestration/memory 与完整 Source 共用原 `mountStudioValueEditor` 单草稿。便捷字段只 patch 对应键；高级缺失/null/array/primitive/unknown nested 不转换默认值或删改。引用按钮只从项目 snapshot/dependency 声明中添加，顺序保留；本地 World/Knowledge 来源展示确切修订，dependency binding 保持原声明 ID，不声称此处已解析其闭包。
- 单入口修改按 exact entryPointId 克隆全项目，仅替换一个唯一匹配入口；集合 Source 对空/非空始终可达，新增/删除/排序只改 entryPoints；最后一个入口删除拒绝。重复 ID 自动进入集合修复，不根据名字/index 猜 patch。chooser 和资源树高亮按 exact ID，排序/显式 ID 修改提交后保留该身份；ID 修改不重写 scenario/ref/Session。
- Review 前拒绝非空/ID/名称/重复/三类引用/primary/unknown 顶层（含 retired ui/world/legacy）错误与 Package-owned experienceContract。保留非法 Source 原文并就近反馈。
- 人工 Review/Apply 仍使用原 `project.save` / exact project baseRevision / human Workspace / ChangeSet/controller。Cancel 不写、不清草稿；提交/inspect 仍禁写；409 可复制当前原文（含非法 JSON）、手动选中回退，Reload Latest 明确丢弃确认，取消保留表面。成功读取失败保留 resultingRevision receipt，inert 与只读重试不重放 execute。Agent Commit 继续独立 task authority。
- EntryPoints/Experience/UI/Preview 明示第一 committed 入口与排序影响，chooser 不联动执行默认；Preview details 显示实际 immutable entryPointId。Simulation 显示 scenario.entryPointId 或第一入口默认。原动作和 source file/Frontend 编译路径保持，没有新增启动协议或自动迁移。
- Inspector 明示项目修订与有限项目引用，无 `core.entrypoint` registry/repository/独立 revision/完整 Used By graph。World detach 的临时 exact 入口定位继续可达。
- Shared description 保持 `shared_scope_unsupported`，没有 caller opt-in、solo 回退、Actor/席位自动映射或初始消息/runtime 绕路；相关产品代码未改。

G01/G04 的展示缺口关闭；G02/G03/G05 的局部防护和真实目标/分层提示完成。Project 直接 API 的 duplicate 接受、顶层归一化读损失与有限 graph 保持，不能把 UI 防护当成全项目/Agent/后端修复。Session 启动约束不被固化为 Source 新限制；可保存任意 JSON 不等于可启动。

### Gate evidence and limits

- N01/N02/N06：集合 Source、增删排序/最后删除拒绝、同名/exact ID/显式 ID/duplicate 修复、Source 非法与 unknown/legacy 不丢原文，由专属/Workspace unit 和 English 浏览器证明；错误空/duplicate 项目修复为 mock UI 证据，不伪称 ProjectStore 能保存空项目。
- N03/N05：三类数组/缺失/null/顺序/重复/悬空/primary 移除与成员条件、exact dependency 声明、高级六类 JSON 缺失/null/primitive/array/nested 的真实 canonical 往返由专属 unit 证明；browser 实际项目为零 Actor/World/Binding 的叙事作品。
- N04：真实 FS world-less/单 World 回退/多 World primary 与浅 overlay、nested metadata、null/missing 默认、非法 shape/受保护 metadata 启动拒绝；没有改变 Source 的宽 JSON 契约，也不生成或伪造消息/session/revision IDs。
- N07/N08：人工 origin/base/inspect/execute、Cancel/409/失败/receipt retry、原 service rollback、独立 Agent，以及真实 FS/HTTP/.atria/Preview/scenario/Session/Save 和语言/窄屏已覆盖。入口↔集合/chooser/view 的取消由本轮 unit 证明；

未执行 Android/真机/WebView/软键盘/中文 IME、外部 MySQL/Postgres、远端模型、完整 native@3 lease/nonce/任意作品故障组合、全字段/设备/引擎矩阵。首轮支持范围继续冻结，Shared 描述停用。

### Persistence and next checkpoint

产品 AGENTS.md 与 docs README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md 原 dirty changes 保持未提交；package/plugin/skills/reference 未读/未改。

停在 EntryPoints 展示 checkpoint，未合并 main、不删除活跃任务分支，不进入 Worlds/Knowledge/B2/F。下一轮先做 B1 Worlds 字段/动作/authority 映射，再独立决定展示 checkpoint；Actors/EntryPoints 不重做。

## Stage B1 Worlds — Mapping checkpoint

- Date: 2026-10-05
- Product start/end/tested HEAD: `f40bca67b56eb42c0b4340d8ca9dfc44f848101a`；检出并跟踪远端同一 task branch，未修改产品、未合并 main。
- Docs start HEAD: `12a739853`；从本地 `a66f2eb38` fast-forward 12 commits；
- Status: **Worlds mapping complete — stopped before display replacement.**

### Scope and findings

package 与远端一致，实际推进在 docs 和 task branch。新增 [Worlds mapping](../../plans/refactor/atria-immersive-workspace/worlds-mapping.md)，更新 index/coverage 路由。本轮没有产品实现、展示替换、Skill/reference 读取或其它 B 类型工作。

- 完整 World/root/revision/snapshot 字段、exact identity/pin、schema/baseline/metadata arbitrary nested JSON、refs/时间戳/strict keys、模式与原 handler/draft/base revision 已映射。World 有真实 descriptor/repository/graph；项目内 graph authority 是 project-source，不能复制 Actors/EntryPoints 的无独立资源结论。
- 项目 snapshot 使用原 project.save/human Workspace/ChangeSet，Library revision-content 使用原 commitWorldRevision/WorldRepo/immutable/CAS，installed World 原版保持只读；Session 当前 state 与 baseline 分开。
- G01：非空集合 Source 与专属身份/名称/metadata 可达性缺口；G02：Fields 的 `||=` 默认补值与 load 重置初始草稿，UI `?? {}` 接受 null 而 canonical 拒绝；
- G04：Worlds 冲突无复制原文/明确丢弃重载；G06：binding pin/有限项目 graph/三种 Fork 边界。六项均为现状确认，未修复；N01–N08 是下一展示 checkpoint 的要求，不是已通过状态。
- World envelope/root/revision unknown 顶层严格拒绝，与 Actor/EntryPoint 顶层归一化损失不同；metadata/schema/baseline 内部 arbitrary JSON 和根 object 约束分层保持。没有自动迁移旧 WorldInfo/Actor/Persona/席位，Shared description 仍 shared_scope_unsupported。

### Persistence and next checkpoint

只提交 worlds-mapping/index/coverage/同一 Record/live HANDOFF 到 docs；产品 task branch HEAD 与远端不变。实际工作树无 HANDOFF 所述旧 tracked dirty；现有 package 的 dist/node_modules/tests、产品依赖目录与旧日志等 untracked 均保持，不提交、不删除。没有将 main merge 到 package/docs、没有更改 AGENTS/Governance 或删除活跃分支。

本轮停在 Worlds 映射 checkpoint。不自动进入 Knowledge/B2/F。

## Stage B1 Worlds — Display checkpoint

- Date: 2026-10-05
- Product start HEAD: `f40bca67b56eb42c0b4340d8ca9dfc44f848101a`; end/tested HEAD: `9ee9cadba`，已 commit/push。
- Status: Worlds display complete. 用户更新为连续完成剩余 B/F 并最终推送合并，覆盖默认阶段停止规则；Shared 描述继续停用。

### Implementation and evidence

复用原 mountWorldEditor、单草稿、project.save/human Workspace/ChangeSet 与 Library revision service。Fields 展示身份/名称、schema/baseline/metadata 递归结构和两类依赖，打开不补缺省字段。完整集合 Source、exact World 选择/显式 ID 变更/排序/树定位保留邻接 source；Review 前防 snapshot identity/pin、strict root、duplicate/local-dependency overlap、未声明 refs 和悬空 EntryPoint。项目 revision 不伪装 Library 修订，也不推进已安装 Session。409 可复制 malformed Source 原文、明确取消或确认重载。

installed 原 World 只读规则保持。G01/G04/G05 展示缺口关闭、G02/G03 局部防护完成；G06 有限 graph/binding pin/Fork 和后端其它调用方限制保持，未新增平行 authority。

实际 **8 个不同 suites / 35 个不同 unit passed，2 个不同 Chrome 场景 passed**：

浏览器 English 首次通过，Chinese 首次错误期望已有“世界基线”文案，修为实际“世界初始状态”后通过；初次默认 Playwright chromium 缺失，使用已安装 Chrome，无产品失败伪记通过。English 真实 FS/HTTP/disk/build/decrypt canonical、Review Cancel/Apply、增删排序/未知根/重复/缺引用拒绝、Session/Save exact 隔离与 Simulation 新 baseline 通过；中文 320→720、真实最大 font_scale=1.5、light/Fast UI/reduced-motion/Tab/Shift+Tab、并发 source revision 409/复制/焦点/取消/确认重载通过。wide、中文 fields/conflict 截图本地查看。新增 jsdom fixtures 按已有 v8 structuredClone 方式补齐，ESLint formatting 已修正。

touched JS ESLint、Native localization、产品 whitespace 通过。没有执行全量 tests、cache/全产品 build、远端 CI、外部 DB/模型、真机/IME/WebView；首轮冻结范围和完整矩阵限制保持。仅提交指定 source/test，不提交旧日志/依赖或 ignored 浏览器产物。下一 checkpoint 为 Knowledge 映射→展示，随后连续 B2/B3/B4/F。

## Stage B1 Knowledge — Mapping and display checkpoint

- Date: 2026-10-05; start HEAD `9ee9cadba`; end/tested HEAD `f0584c157`，已 push。
- Status: B1 four editor checkpoints complete; continuous B2 next，Shared description 停用。

先提交范围到 [knowledge-mapping](../../plans/refactor/atria-immersive-workspace/knowledge-mapping.md)，随后复用原 Knowledge editor/contracts/browser。打开 Fields 不再隐式创建 discovery/applicability/conditions/lifecycle/relations/delivery，缺省 section 只在显式字段操作时入草稿；同一 section 的多项编辑组合，priority 允许原 canonical 的有限小数。审阅锁整 editor、防双提交，失败保留 Source。Source 不自动覆盖错误 entryIds；Fields 明确增删/移动时同步派生目录。

World/Knowledge 的外层导航复用同一内容编辑路由，各自仍保留原 mount、patch 和服务。Library裸content、installed原Knowledge显式编辑、immutable/CAS/Fork不改；没有新增 Knowledge/Session authority或自动latest。

实际 **8 suites / 50 不同 unit passed，2 Chrome 场景 passed**。Knowledge editor原3、新wrapper5、Workspace20、下面原服务22（不重复累加重跑）。

原world-editor/worlds-wrapper另9tests亦通过，不计入以上Knowledge数。初次通用路由替换出现 identity递归，原Worlds回归发现后修正；首次小数priority被HTML默认step阻止，改step=any；browser首次Edit entry text命中button+summary，改role精确定位，第二次2/2通过。无失败记为通过。真实FS/HTTP/disk/build/decrypt的canonical snapshot和全部邻接保持，取消不写、集合unknown/duplicate/nullmetadata/entry目录错误拒绝、增删排序exact选择、旧installed Session/Save不变；中文320→720/maxfont/light/FastUI/reducedmotion/Tab与并发409复制/取消/确认重载通过，wide/320截图本地查看。

touched JS ESLint、Native localization、diff whitespace通过。未执行全量build/tests/远端CI/外部DB或模型/真机IMEWebView；后端局部调用方与有限graph限制、Shared描述停用、首轮冻结范围保持。产品依赖/旧日志/ignored artifacts不提交。

## Stage B2 — Prompt, Runtime and retrieval checkpoint

沿原 specialized editors 和 services 修复：Prompt 未编辑的 optional 默认与 stage refs 不隐式改写；提交期间禁止重复保存/模式切换；Runtime/检索完整 Source 与 Fields 共用原表单保存，保留 exact identity/schema/scope、模型高级 tokenizer/options/provenance，检索 provider options 切换不丢草稿。Shared 描述仍拒绝。

部分测试命令用 name pattern，不算跳过项）。最后因焦点修复重跑 Prompt authoring 全14通过。真实 Chrome：Runtime/检索 full Source canonical HTTP 与中文320最大font/FastUI/reduced-motion共2场景通过；Generation revision非法JSON/真实保存与旧route pin、fallback顺序角色过滤、exact Project compile preview共3场景通过。旧 Generation Library定位改为exact资源入口；后续preset定位更新到当前实际owner。没有发送外部模型/解析Secret/写preview Session。截图将在 F 对最终实现集中查看，当前不声称已查看B2截图。

产品提交以真实Git为准，已commit/push；B2 mapping完整留存。B3 mapping已创建，继续本阶段；外部完整设备/数据库/模型矩阵仍未测，不扩大结论。

## Stage B3 — Agents, Memory and Trace checkpoint

四模式原 specialized inspectors/权限/预算/工具/Route、plan compiler与settings/library存储复用。Raw Plan JSON原文跨inspector close/reopen保留、dirty/离开可追踪；Memory maintenance pending去重、同步错误和dispose/迟到load/图重绘防护；Trace导入同scope普通redraw仍可完成，Session lifecycle epoch改变不接受旧回放。

实际unit：8suites/54不同测试通过，包括四模式route+Source、owner删除/conditional graph约束、编译预算、旧admitted快照、Trace事件private过滤、Memory route+pending/dispose。真实Chrome四场景：Memory任务路线/原advanced设置、320px多Agent exact route、跨Session reset拒绝、新320px RawPlan JSON malformed/close/Apply/save。新场景最初遗漏重开自动关闭的More菜单，定位已修正并通过。B3截图保存，F集中查看。touched ESLint已修复测试格式并无产品lint错误；局部native@3/真实设备/外部模型矩阵未测，Shared description停用。B3实现commit/push完成，B4 mapping先行并继续。

## Stage B4 — UI, Assets, Skills, Plugins and illustration checkpoint

保留原native source graph/semantic editor、asset manifest/files、Skill Source/tree/CAS、Plugins file/scope/runtime及官方插图任务/历史。UI结构草稿按exact component/node/owner暂存，切换source graph不丢输入、disposed evaluate不stage；显式Reload丢弃当前文件的结构草稿。Skill逐文件Source与原sha随草稿保留、save期间禁止换文件、close前明确放弃、旧read取消；插图完整JSON Source/Fields沿原CAS，全部角色/作品覆盖/模板/NovelAI参数与独立prompt/image cancel/history契约保留；

390官方插图fullSource非法JSON/参数/角色/作品配置/Session工具共3场景通过。最初Skill新browser步骤用筛选前first row定位隐藏行，改定位当前Folder内实际行后3场景全通过。SDK/任务queue/旧Session拒绝与独立prompt/image执行见unit，不声称实测外部NovelAI/远端模型。用户连续授权下继续F，不阶段停止。

B4 end/tested HEAD `4ac8affbf` 已commit/push。Skill全部24测试通过。

## Stage F — Final local integration, merge and cleanup

- Date: 2026-10-06 (Asia/Shanghai).
- Tested implementation / merged main / origin/main: `4ac8affbf01bfb5fb576834bb7eedbeefd03c007`.
- Status: completed within the A5 frozen local support scope. Original authorities and exact refs retained; Shared description remains `shared_scope_unsupported`.

最终相关 unit 为 **11 suites / 93 不同测试通过**：10 suites/91 的集合，再加 UI semantic draft/lifecycle 2；B4 已单独记录 9 suites/120，重跑不重复累计。原 human Workspace inspect/execute ChangeSet、Agent Commit 独立、exact refs/旧 Session/Save、Persona context/shared refusal、FS/SQLite 与 package install/resource closure 均在下面实际执行范围内。最后 active Skill rename 修复另重跑全部24 tests通过，见B4。

真实 Chrome **8 个不同最终集成场景通过**：英文/中文 Runtime 和 retrieval Source、320px Runtime Secret owner、Diagnostics exact project compile preview、320px Studio Source/review/conflict/Agent、390px 全20 Studio views和exact Attach/Update/Fork/Detach、已有Session/Save/default隔离、中文Persona maxfont/键盘与320/719/720/1179/1180布局。没有把失败计作通过。Source最终标签/完整宽度修正后英文/中文2场景再次通过，输出在 `.e2e-scratch/workspace-source-layout`。B4三个真实Chrome场景另见上一节，不重复累计。

B2中文Runtime和wide retrieval、B3 Raw Plan JSON 320px、B4 Skill Source 320px与插图full Source 390px截图已实际查看；touched JS/tests ESLint、Native localization coverage和git diff whitespace通过。`frontend:prebuild-cache` 首次实际webpack 5.106.1构建成功，cache key `d62f033ad687470c`；此命令只证明frontend bundle cache，不冒充全产品/Android构建。

最终fetch确认main无新分叉，任务分支比main超前14 commits；在产品工作树切换main并 `git merge --ff-only refactor/atria-immersive-workspace`，与tested HEAD `git diff --exit-code` 一致后推送。实际 `HEAD/main/origin/main` 同为上述SHA，`git ls-remote`确认远端main。产品工作树保留在main，无关node_modules-shared与p7旧日志保持，不删除工作树。package仍 `a13bce997`，未将main合入package。docs独立记录并删除live HANDOFF，不改旧任务历史。

首轮冻结支持范围、原后端局部调用方/有限graph、FS无整批rollback、publishedRevisionIds闭包与独立CAS等既有边界保持；

## Final state

Task complete within the frozen local support scope. Original authorities/exact refs and disabled Shared description preserved. Task branches and live HANDOFF removed; persistent Plan mappings and this Record retained. External matrix limits are listed above.
