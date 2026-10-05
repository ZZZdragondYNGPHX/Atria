# Atria Immersive Workspace — Record

- Task ID: `refactor/atria-immersive-workspace`
- Primary Workspace: `main`
- Status: Active — A1–A3 complete; A4a next
- Plan: [Plan index](../../plans/refactor/atria-immersive-workspace/index.md)

## Summary

本任务承接用户的“整理 Atria 前端界面”讨论。经 v0.2–v0.8 多轮交互原型和确认，2026-10-05 整理成新的 Plan Bundle。旧前端重设计与 Native Frontend v3 的已完成历史保持不变。D1 已完成契约核对与范围冻结，A1–A3 已实现浮动外壳、游玩/资料库恢复、创作/运行配置/智能体/扩展接线并完成各阶段本地针对性验证；S00–S20 全矩阵与最终集成验收仍待后续阶段。

## Stage D0 — Discussion consolidation and Draft Bundle

- Date: 2026-10-05
- Docs start HEAD: `eebb2a87a8936d64dc551df3c8bfae0bf3cace3d`
- Product read baseline / unchanged HEAD: `783bb6fd30729263a97bb69842befcd1d25c1885`
- Package unchanged HEAD: `a13bce997`（仅恢复上下文，不承载产品实现）
- End/Tested docs content: 本 D0 文档提交中的 Bundle；没有对应产品 tested HEAD。
- Status: D0 complete; D1 review/freeze pending

### Completed

- 新建 9 模块 Bundle：index、决策、工作空间布局、原文能力基线、接线覆盖、共有状态、Native Persona、阶段交付、验证矩阵。
- 整理 D01–D20 用户已确认项，P01–P06 实施提议保留 Draft 标记，避免重新询问已确认偏好。
- S00–S20 映射新归属、源码控制器、结果边界、阶段与 V00–V20 验收责任。
- 复制原任务 `01-screens-and-actions.txt` 的 S00–S19 原文基线，明确其中布局建议由新 Bundle 覆盖；保留完整编辑器与高级 JSON/Source。
- S20 拆为 A4a 原生契约/持久化与 A4b UI/迁移/备份开放；覆盖 account、session、message、request、branch/save、shared seat 和 Host UI。
- 保护 package/main 的原有 untracked 项；未改产品 tracked 文件，未将 main 合并到 package。

### Source evidence and discussion history

原任务：`01a10777-5ad9-76b1-900d-9f53dbb5511a`；续接讨论：`01a107a4-a3f9-7ba3-9adf-47d1d0c2660f`。

独立讨论资产（非仓库产品输出）：v0.2–v0.8 HTML 原型与各轮状态；最新 `19-personas-v0.8.html`、`20-discussion-state-v0.8.txt`、`21-coverage-gaps-v0.8.txt`、`22-persona-reconstruction-scope-v0.8.txt`。用户提供了旧 Persona 管理截图和 [官方概念资料](https://docs.sillytavern.app/usage/core-concepts/personas/)。

v0.8 前轮实际证据包括组装/JS 语法检查、真实 IAB 的管理/身份选择、保存失败草稿/重试、历史身份保持、新会话默认捕获、迁移样例与原配置详情、归档恢复、390×844 布局和深色 picker；日志未读到 error。其限制为内存样例，无真实持久化、迁移、图片上传、模型请求、共享席位或完整会话隔离证明。D0 未重新执行上述原型测试，不把其结果算作产品验收。

### Validation actually executed in D0

- 检查 docs/package/main Git 状态；docs 初始 clean，main/package untracked 用户资产保留。
- 全文读取 repository Governance 和 docs 本地 AGENTS；按模板新建 Bundle。
- 核对旧正式设计 index/设计文件、原能力清单、Native 请求契约/Session snapshot/AssetStore 与测试执行配置。
- 文档检查脚本核验 9 模块、内部链接、源码/测试路径展开、21 coverage 行和 21 validation 行、原清单原文复制一致性。首轮发现 S13 两个错误目录，已更正后复验。
- `git diff --check` 检查新增文档空白问题。
- **未执行产品测试、lint、构建、模型实发或产品浏览器 E2E。**

### Key decisions

当前总体状态 Draft。用户已确认的偏好被保留，但没有把“继续整理”当作产品实施批准。旧全局 persona 设置不构成 Native 会话/请求身份 authority；原生重构与迁移是新增工作。

旧整站 SillyTavern 迁移退役与本次用户设定数据转换范围区分；旧角色/聊天/连接抽屉不恢复成平行主入口。资产/会话/请求映射不得凭名字猜测。

### Known limitations / next checkpoint

D1 必须核定 Persona schema/API、会话 namespace/CAS、请求 context 类型/过滤/预算证据、Shared/Host scope、旧 save/旧会话兼容、迁移 ledger 原子性与备份闭包。P01–P06 仍为草案建议，完整编辑器改造顺序也是建议。不能依据文档链接/路径检查认定产品能力成立。

下一 checkpoint：审阅并冻结整体实施范围；先补 D1 的具体契约/测试设计，再按批准阶段进入 A1。依 Governance 在当前 D0 阶段结束完成交接并停止，不直接跨阶段修改产品。

## Stage D1 — Contract audit and implementation freeze

- Date: 2026-10-05
- Docs start HEAD: `a66f2eb38`（本轮 fetch 后 fast-forward）
- Product baseline / unchanged HEAD: `783bb6fd30729263a97bb69842befcd1d25c1885`
- Product task branch: `refactor/atria-immersive-workspace`
- End/Tested docs content: 本 D1 持久化提交中的 6 个 Plan 模块、同一 Record 与 live HANDOFF；不自引用 commit hash。
- Status: D1 complete; A1 next

### Completed and authority

用户明确要求“拉取远端……准备开工”，随后要求遇到问题自行处理并简要说明。以此作为既有 Bundle 分阶段实施授权；D01–D20 不重开。P01–P06 作为实施选择冻结，不伪称用户逐项答复。B1–B4 沿用方案顺序，各资源类型仍是独立 checkpoint。

拉取远端，main fast-forward 到新语言基线，docs fast-forward 到本任务 Draft；在产品工作树创建同一任务语义分支。产品只有用户原有 AGENTS.md dirty change，没有本阶段产品源码改动。docs 原有 README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md dirty changes 保留且不提交。package/plugin/skills 未改；未读取任何 reference 工作区。

### Contract findings and frozen design

- Persona 尚无 Native ID/kind/validator。新增专用 kinds 经已有 Native Storage 注册，不误用只接收 Prompt 资源的 VersionedJsonResourceHandler；冻结 root/revision/default/receipt、exact ref、CAS、API/错误/内容与头像限制。
- FS withTransaction 不提供跨文件回滚。迁移采用 prepared → 资源发布 → receipt 的逐项恢复账本，source/plan digest、预分配 ID、失败重放与默认独立 CAS；不承诺整批回滚。
- Session namespace/revision/Timeline authority 可复用，需新增 protected atri_player_persona、服务捕获输入身份和并发重验；旧 revision 不回填。
- retryReply 的 post-user fork 与 typed transaction 的 pre-effect + 新建输入路径不同。后一条目前只重建 authority retry metadata，A4a 必须保留原输入身份/快照，Provider retry 则固定已捕获上下文。
- typed task context 当前只有五种来源；Native Context lane/provider/Prompt consumer/host task filter/effective request evidence 都需接线。player persona 显式 opt-in、player_provided authority，不混入世界事实，notes 不发送。
- Shared member/seat/scope/epoch 和 Host 白名单可复用，但无 Persona 功能。冻结主体自行选择、授权头像副本/私密投影与显式 Host picker capability，保留独立宿主恢复。
- Save v1 snapshot/session、v2 resume 继续读取；有 Persona 的新 Save 使用 v3 并补头像闭包/容器校验。账户备份复用 native/native_resources/nativeBlobs/现有 manifest，默认恢复独立审阅，不新建备份服务。
- legacy Persona JSON 实际无版本号，仅三个顶级数据项，无图片/聊天绑定。支持该准确来源，未知版本/宏/绑定/缺图明示 pending 并保留原文，不生成假完整恢复。
- Native play 当前 modifier+Enter，旧设置有 -1/0/1 和 legacy AUTO 平台差异。P01 冻结 Native AUTO 保持换行、显式设置生效；A2 加 IME/Shift/modifier 测试，不改旧保存值。

schema/API 与测试责任在 personas/validation 权威模块中维护；Record 不成为第二份字段定义。新增 C20.1–C20.8 是未来测试目标，没有测试文件或通过证据。

### Validation actually executed in D1

仅本地最小相关验证：核对上述直接相关源码的实现/函数/注册，检查变更文档内部链接、源码证据路径、21 coverage/21 acceptance 行、P01–P06 与 C20.1–C20.8、Plan/HANDOFF 阶段一致性，并执行仅针对本任务文件的 git diff --check。检查覆盖当前 D1 文档内容，不验证新契约可运行性。

未运行产品 unit/E2E/lint/build、真机/IME、模型实发或远端 CI。用户要求每阶段及任务完成时仅本地最小相关验证；validation 已按此更新，不发起/等待远端 CI。

### Limits / next checkpoint

A4 新增契约均待实现；MySQL/Postgres 注册路径仅静态核对，未运行引擎；共享跨账户资产与 Save v3 尚无兼容证明。A1 不提前开放 Persona 占位入口，不替换编辑控制器，不运行 A4 测试。下一 checkpoint 按 index 路由读取 experience/states、coverage S00/S01/S18/S19 和 validation，实施外壳、导航/搜索、认证/学习、设置/全局诊断。

依 Governance 在正式 D1 阶段完成持久化与交接后停止，本轮不跨入 A1。

## Stage A1 — Floating shell, navigation and shared state

- Date: 2026-10-05
- Product start HEAD: `783bb6fd30729263a97bb69842befcd1d25c1885`
- Docs start HEAD: `491393594c462b60edf0fabae4e67d256a7867f7`
- Product End/Tested HEAD: `f56b3d8526507719353d5905b0148eb5d4d1d56a`（验证的最终源码内容与提交一致；提交后没有产品修改）。
- Product branch: `refactor/atria-immersive-workspace`；阶段提交已 push。
- Docs End/Tested content: 本 A1 提交的 index/coverage/states/validation、同一 Record 和 live HANDOFF。
- Status: A1 complete; A2 next；未合并 main，沿用同一分支。

### Completed and authority

- 复用原 tokens、Environment、appearance、导航与控制器，外壳改为有间隔/圆角/边界的浮动 Rail、顶栏、Focus 和 Dock；compact 安全区域与 44px 顶栏目标保留。新增平台 serif token，正文应用留到 A2。
- compact 实际阅读挂载时隐藏底部五域导航，独立于键盘状态；顶栏菜单保留五域与全局工具。管理页恢复底部导航；Medium Dock/compact Context Sheet 继续使用原焦点与弹层 ownership。
- 搜索结果渐进发布并保持选中 identity；按来源/owner 展示失败与局部重试，保留其他成功结果。过期结果执行失败回到原查询并给可读错误；Back 回原入口恢复查询；搜索 Enter 不抢 IME composing/229。
- URL exact 资源前缀识别 detail 类型；旧 navigation authority 新增统一离开 guard，跨域、子路由与 browser Back 在 dispose 前检查草稿。取消保留当前表面与字段，确认离开丢弃；不引入第二套草稿持久化或写入 authority。
- World/Knowledge 观察真实 detached 模型草稿，Studio 接 pending ChangeSet/Agent review。Library/Runtime 在成功写入回执后清除未保存观察，即使后续读取失败也不误报；既有 Review/Apply/Commit 路径保留。
- 原认证/启动条件未改；学习中心、设置、账户和 Guided/Startup/Expert 诊断继续挂载原控制器与服务。没有新增 Persona 占位入口。
- 产品/文档原有 dirty changes 保留；package/plugin/skills 未改，未读取 reference，未提交截图/fixture 用户数据/生成产物。

### Findings and decisions

首轮浏览器 320px 场景发现 `runtime` 可能先命中包含该词的 Skill，而非 Runtime 主域。修正 exact `navigate.<query>` 的排序优先级，加针对性测试并复验失败场景。

直接复用原 controller 不足以保护新增跨域/Back 出口：离开会 dispose 编辑器。A1 把判定放在现有 navigation authority；草稿继续由原编辑器持有。收尾补模型 dirty 标记优先于选择控件值差异，并补 Library/Runtime 成功回执，避免仅换选择控件或已保存但刷新失败时出现错误提示。

没有把原生 confirm 的“取消保留当前表面”描述成跨页面自动保存草稿。控制器内部换页、完整会话阅读/输入、资源分类与恢复流仍在 A2/A3 的原 authority 上实施。

### Local validation actually executed

仅本地最小相关集合；分轮按修改触及面执行，下列计数有重叠，不能相加为独立测试总数。

在产品仓库 `tests` 目录执行 unit：

```bash
npm run test:unit -- --runInBand --runTestsByPath atria-shell/app-shell.test.js atria-shell/navigation-authority.test.js atria-shell/product-search.test.js atria-shell/workspace-host.test.js atria-shell/utility-workspaces.test.js atria-shell/learning-center.test.js atria-shell/appearance.test.js
# 7 suites / 38 tests passed（外壳/原工具基线）
npm run test:unit -- --runInBand --runTestsByPath atria-shell/app-shell.test.js atria-shell/product-search.test.js atria-shell/workspace-leave-guard.test.js atria-shell/knowledge-editor.test.js atria-shell/world-editor.test.js atria-shell/studio-workspace-a7.test.js
# 6 suites / 27 tests passed（草稿接线轮）
npm run test:unit -- --runInBand --runTestsByPath atria-shell/app-shell.test.js atria-shell/command-registry.test.js atria-shell/navigation-authority.test.js atria-shell/product-search.test.js atria-shell/workspace-leave-guard.test.js atria-shell/native-runtime-p5.test.js atria-shell/world-editor.test.js atria-shell/knowledge-editor.test.js
# 8 suites / 52 tests passed（排序/成功回执轮）
npm run test:unit -- --runInBand --runTestsByPath atria-shell/workspace-leave-guard.test.js atria-shell/knowledge-editor.test.js atria-shell/world-editor.test.js atria-shell/package-library-resources.test.js
# 4 suites / 13 tests passed（最终模型标记/Library 回执修改）
npm run test:unit -- --runInBand --runTestsByPath atria-shell/workspace-leave-guard.test.js
# 1 suite / 6 tests passed（补真实 Library 编辑器 save 成功后 refresh 失败的 unit 场景）
```

同目录 Chromium fixture-server E2E：

```bash
npm run test:e2e -- e2e/atria-shell/04-navigation.e2e.js --workers=1 --grep 'A1 floating|Expanded Rail|320|Compact Bottom Navigation|Compact keyboard'
# 首轮 4 passed / 1 failed：runtime 查询排序问题；已修复
npm run test:e2e -- e2e/atria-shell/04-navigation.e2e.js --workers=1 --grep 'A1 floating|320px|Medium keeps'
# 3 passed，含失败的 320px 场景复验
npm run test:e2e -- e2e/atria-shell/04-navigation.e2e.js --workers=1 --grep 'A1 global utilities'
# 1 passed
npm run test:e2e -- e2e/atria-shell/04-navigation.e2e.js --workers=1 --grep 'A1 floating'
# 1 passed，最终 guard 修改后复验
```

上述合计 7 个不同浏览器场景最终通过：Expanded Back/Forward/refresh、320px 深/浅色和菜单焦点、compact 导航/Context Sheet、仿真键盘/visual viewport、Medium Dock、A1 阅读外壳/返回查询/离开草稿、A1 学习/设置/诊断。新增诊断场景调用真实 fixture incident/export 服务，强制 clipboard 拒绝后验证失败反馈，并验证 frontend 当前来源清理审阅可取消。新增外壳阅读与草稿 fixture 为 DOM 接线场景，不代替真实 Session/编辑器全流程。

本地浏览器截图已查看：`tests/.e2e-scratch/a1-expanded-frame.png`、`a1-compact-navigation.png`、`a1-compact-diagnostics.png`；ignored，仅本地证据，不入库。

触及的生产 JS 通过针对性 ESLint（收尾再次检查 workspace-leave-guard、library-revision-editor、knowledge-editor）。根目录 `npm run check:native-localization` 通过；本任务源码/文档 diff whitespace、内部链接/源码测试路径与阶段一致性通过。

### Limits and next checkpoint

未执行完整 E2E、全量测试、构建、实际手机/WebView/软键盘/中文 IME、真实模型实发或远端 CI。composition/keyboard 单元事件和 viewport 仿真不构成真机证明；认证全部配置、账户备份/密码/头像及所有诊断来源未重新验收。serif 目前仅 token；完整正文、自有 UI/共享恢复与输入策略统一归 A2。

A2 从真实 HEAD 继续同一分支，按 index 阅读 experience/states、coverage S02–S08/S17 与 validation；保留所有编辑能力与 exact authority，执行 P01 AUTO/显式发送策略。不重复 D1，不提前开放 A4 Persona。正式 A1 完成持久化与 Record/HANDOFF 后停止。

## Stage A2 — Play, Library, install and recovery

- Date: 2026-10-05
- Product start HEAD: `f56b3d8526507719353d5905b0148eb5d4d1d56a`
- Product End/Tested HEAD: `2d0df2cef1d5580358555f553203a9cf5616700a`；源码内容与最后分触及面的本地验证一致，已 push。
- Docs start HEAD: `09740ec7631e83d19b8146d18850b6c8f21f1d81`
- Docs End/Tested content: 本 A2 提交的 index/coverage/states/validation、同一 Record 和 live HANDOFF（实际 hash 从 Git 读取）。
- Status: A2 complete; A3 next。继续同一 `refactor/atria-immersive-workspace` 分支；未合并 main。

### Completed and authority

- S02：继续和最近作品使用原 product inventory / Session opener；某个 inventory 失败仍保留另一集合，错误与重试就近呈现。缺 exact Package 的会话可审阅/安装匹配文件并重查，不能用 latest 替换。新增 More → 返回游玩首页，调用原 Session.close；未发送输入离开取消保留，确认退出后可继续真实 Session。
- S03/P01：平台叙事 serif、元数据 sans、显示名首字头像回退和消息序号并列；悬浮输入卡片有 no-blur 回退。复用当前 powerUserSettings.send_on_enter：AUTO(0)/DISABLED(-1) Enter 换行，Ctrl/Cmd+Enter 发送；ENABLED(1) 也可直接 Enter，Shift/Alt/composition/229 不发送。未接受的失败输入只恢复到同一 Session/基准 revision；已提交输入不重复发送。pending submit 禁止重复发送，但真实生成期间 Stop 仍可用；不新增聊天/请求 authority。
- S04：历史与存档默认关闭，顶栏明确入口；历史预览接到原 facade 和 Runtime.forkRevision/switchBranch/retry，查看保持只读，恢复当前入口保持。旧 drawer 回合/Load 动作在生成、历史、失败或基准过期时禁用且 handler 重验；切 Session 关闭旧 drawer。save 使用真实 expectedRevisionId；重命名、嵌入 Knowledge、export、Prompt choices 与共享工具保持原路径。
- S05/S06：Library `install` / `import-save` 为完整流程页，选文件 → 预检 → 权限/exact 依赖/密码 → 写入 → receipt/打开。128MiB Work / 64MiB Save 在读取前拒绝超限，坏文件可重新选择/重试，来源变化与 409 可重新审阅。成功写入后打开失败只能重试打开；不会把成功安装/导入当作失败重放。匹配依赖安装固定 packageId/packageVersionId/version/contentHash，并保留当前默认版本；实际 import 前再预检且服务侧继续重验。
- S07/S08：保持 World/Knowledge 原版不同权限、全部字段/Source、immutable revisions、闭包/Fork/Used By 与四类 Prompt 资源、preset categories/modules/stages/Regex。列表/详情及分类往返保留查询；内部 Back 检查模型草稿，保存失败保留。revision/preset 保存成功但读取失败保留 receipt 和只读重试入口。界面状态位不替代 resource/service/persistence authority。
- S17：保留作品 Shadow DOM 与现有宿主边界，serif 仅平台正文；独立 Full recovery 的 save/stop 根据原 Runtime capability 更新/点击重验，防重复保存，结束后重查状态；真实 save handler 拒绝历史/生成。Exit/diagnostics/reload 继续原 handler。自有 UI 内容清空不移除独立 recovery；Persona Host chooser 仍归 A4。

### Findings and decisions

首次安装浏览器场景发现 WorkspaceHost 只接受旧 Library section，新 `install` 被当成 Works 首页。修正既有 authority 的域/子路由提交和 flow 路由，未增加 router；复验通过。首次 history 新场景只 Explore branch，没有选择该分支的具体 Preview revision，因此 Switch 正确禁用；测试改为先预览 exact revision，再 switch 后通过。

补模型 Source 内部 Back 与 preset 上层 Back 后，取消确实保留原编辑器；没有添加跨路由自动存草稿。保存 receipt 必须在刷新前清除 dirty；revision reload 先构造新表面，失败时保留原 receipt，preset read failure 不再次 PUT。防重复发送轮发现 submit 的 busy 位若直接用于禁用发送按钮会禁用正在生成的 Stop；已拆分提交等待/真实生成条件，补 pending Promise + real Stop handler 单测。

早期 unit 失败还包含旧 Timeline 标签与新增 Library 编辑器测试使用了 Studio 的保存标签，均修正对应实际入口；这些失败不计为通过。一次验证命令使用错误 cwd，文件编辑未执行，已在正确产品目录重做并复验。

### Local validation actually executed

仅本地、分触及面的最小集合；没有发起或等待远端 CI。多轮计数重叠，不相加为不同场景。

在产品 `tests` 目录：

```bash
npm run test:unit -- --runInBand --runTestsByPath atria-shell/native-play-product.test.js atria-shell/native-play-controls.test.js atria-shell/library-import-flow.test.js atria-shell/library-interactions.test.js atria-shell/save-dependency-recovery.test.js atria-shell/prompt-authoring-p6.test.js atria-shell/prompt-preset-receipt.test.js atria-shell/workspace-leave-guard.test.js atria-shell/navigation-authority.test.js atria-shell/workspace-host.test.js atria-shell/session-history.test.js atria-shell/package-library-resources.test.js atria-shell/library-runtime-workspaces.test.js atria-shell/library-revision-history.test.js game-runtime/ui-full-host.test.js
# 15 suites / 73 tests passed；最终小修改仅复验下列相关集合
npm run test:unit -- --runInBand --runTestsByPath atria-shell/library-interactions.test.js atria-shell/library-import-flow.test.js
# 2 suites / 9 tests passed，补 inventory 部分失败
npm run test:unit -- --runInBand --runTestsByPath atria-shell/native-play-product.test.js
# 1 suite / 12 tests passed，补实际 pending submit 期间的 Stop；上述最终 75 个不同 unit 用例均有通过证据
```

Chromium fixture-server E2E：

```bash
npm run test:e2e -- e2e/native-session/07-play-redesign.e2e.js e2e/native-session/08-library-redesign.e2e.js --workers=1 --grep 'landing has|reading preserves|save, inspector|320px light|Works retry|World and Knowledge'
# 首轮 4 passed / 1 failed / 1 skipped；Work flow 路由失败已修复
npm run test:e2e -- e2e/native-session/07-play-redesign.e2e.js --workers=1 --grep 'A2 exact|A2 save recovery'
# 首轮 history preview 定位 1 failed / 1 skipped；修正场景后复验
npm run test:e2e -- e2e/native-session/07-play-redesign.e2e.js e2e/native-session/08-library-redesign.e2e.js --workers=1 --grep 'A2 exact|A2 save recovery|Works retry|World and Knowledge'
# 4 passed，含两项失败场景的复验
npm run test:e2e -- e2e/native-session/07-play-redesign.e2e.js e2e/native-session/16-prompt-presets.e2e.js --workers=1 --grep 'A2 exact|Full Game recovery|Chinese landing|module filtering.*390|Preset Regex.*390'
# 5 passed，含 history capability 修改后的复验
npm run test:e2e -- e2e/native-session/07-play-redesign.e2e.js e2e/native-session/08-library-redesign.e2e.js --workers=1 --grep 'A2 exact|Works retry'
# 2 passed，含退出草稿取消/确认/继续与 Library 部分失败最终修改后的复验
```

合计 12 个不同 browser 场景最终通过：真实 Session resume / committed timeline、流式 reader position / node identity、Save 与旧 drawer response、320px 输入/仿真键盘/Context Sheet、安装权限/失败重试、World/Knowledge 详情、history inspect/fork/switch/生成禁用/退出草稿、加密 Save exact 旧版本恢复与新版默认保留、Full recovery/focus/Escape、中文/大字/横屏、390px preset module 返回位置/菜单、Regex 归属/portable ownership。Save recovery 场景调用实际 FS 后端安装/导出/删除/导入，断言实际 Session.packageVersionId 与 Work.currentVersionId；没有用内存样例代替存储。

触及的生产 JS ESLint、根目录 `npm run check:native-localization`（English/简体中文）和 `git diff --check` 通过。查看过本地阶段 reading/history 与 install-retry 截图；截图/fixture/测试产物仅 ignored 本地证据，不入库。最后 sender 元数据去重复与 Stop 条件由 native-play-product 针对性 unit 复验。

### Limits and next checkpoint

未执行全量测试/完整 E2E/构建/真机/WebView/真实中文 IME/真实模型发送/远端 CI；composition/229 是合成事件，键盘和 safe area 是浏览器仿真。Full recovery 浏览器为宿主 fixture，不能冒充完整自有作品崩溃、字体或共享席位验收；共享 UI/Session authority 保持原实现，权限全矩阵仍归 A4/A5。未另跑后端 Save/SQL parity 全矩阵，实际 FS browser 往返只证明上述 fixture。Avatar 为显示名首字回退，未引入 Actor/Persona 头像资源协议；Persona/第四分类/Host 身份选择未开放。分类查询只在当前 controller 生命周期保留，不是跨账户/跨刷新持久化。

A3 按 index 路由读取 states、coverage S09–S16、delivery 的完整编辑保留清单、validation，再核对本 Record A2 与实际 Git；继续同一分支，推进创作/运行配置/智能体/扩展，不提前实施 A4。



## Stage A3 — Authoring runtime agents and extensions

- Date: 2026-10-05
- Product start HEAD: `2d0df2cef1d5580358555f553203a9cf5616700a`
- Product End/Tested HEAD: `57a37bc8ac69ed0274d04ce0a8d1016d96ac4496`；同一 `refactor/atria-immersive-workspace` 分支，已 commit/push，未合并 main。
- Docs start HEAD: `0d05c835ee82b900010030691e2e8e3f7a8be64f`
- Docs End/Tested content: 本 A3 提交中的 index/states/coverage/delivery/validation、同一 Record 与 live HANDOFF；不自引用提交 hash。
- Status: A3 complete; A4a next

### Completed and authority

按 HANDOFF 读取指定 A3 模块和 A2 Record，再核对实际 controller/call graph。保持原 source/service/persistence，不读取 reference、不引入 Persona 或第四 Library 分类、不开始 A4。

Studio 保留 20 view 和原完整结构/Fields/Source/文件编辑器。World/Knowledge/Assets 的编辑与引用页签保留同一 DOM/草稿。资源 Attach/Update 固定 exact revision；缺失修订仍保留原值并拒绝 prepare，不替换 latest。Fork 保留 Library 来源 provenance、生成独立 project 资源并选择其编辑器。Review detach 查真实 exact 反向引用，并补直接 EntryPoint/World 消费者定位；Used By 仍查原 graph。Asset 资源不可变，不添加原后端未支持的 Update。

人工 Inspect/Review/Apply 与 Project Agent Review/Commit/Takeover 保持不同 authority。人工 draft 或待 Apply 阻止 Agent Commit；New Task 清理旧 Task 审阅。成功写入先记录 receipt，读取失败只提供 Reload Latest/list，不重新 Apply/Commit/create/install。提交中冻结原字段。Preview/Simulation/Build 固定基准与表面，迟到结果不覆盖后来打开的编辑器；Source per-file 草稿、未知结构字段与格式校验保留。registry/graph/resources/library/history 辅助失败独立呈现/重试，不清空已加载项目或当前未保存字段。

Runtime 原全部角色、provider/Secret、模型能力、fallback/exact Prompt/Generation、Embedding/Rerank 和 compile 入口保持；内部 Back/复制与 compact portaled 编辑层接相同离开 guard。已保存刷新失败保留只读 receipt。缺项修复通过现有 navigation authority 暂停原启动控制器/DOM，返回时重验 draft bindings，并继续原标题/选择/PackageVersionId；修复期间安装新默认版本不改变原旧版本启动。临时返回记录只属于 UI，不成为平行 authority。

Agents 默认 Run，显示固定 Session 范围，过滤旧会话 Run/Stop；Native 合成角色的 avatar 不成为 Character binding，Session binding 仍沿用原 chatKey ABI。spec/loop/agenda/director 的原字段/JSON/工人/专家/工具/权限/预算与路由保持。preset draft 固定范围，scope lost 拒绝原写入并允许 guarded Reload。Session lifecycle 使用正确 `agents:workspace` key 重挂；Memory reset 在确认后、停止任务后和删除前重验 Session/branch/revision，迟到确认不写新会话。

Skills/Plugins 文件、scope、manifest、invocation preferences、外部安装/更新禁用逻辑保持。Tab/Cancel/Refresh 离开保留草稿，保存读取失败不重放。官方插图的角色/别名/固定外观/服装、全局/作品覆盖、模板、NovelAI 参数和原两种 task 入口保持；仅查看作品范围不生成修改。会话工具仍由 SDK 清理，在现有外壳内部工具层挂载，只在 Play 会话表面显示，正常点击不被外壳遮挡；管理与配置关闭取消保留草稿。按钮使用现有颜色 tokens 修复深色可读性。

### Findings resolved during local verification

真实 Fork 返回 Library 来源元数据，初始测试误期待空 metadata，按真实契约修正。Studio receipt 实现曾先清 pending 再读取 Fork operation，已改为提交前捕获。检索测试的 response helper 第二参数为布尔 ok，初始误传 HTTP status；disabled fieldset 的控件也应按 `:disabled` 检查，均已修正。

切换 Session 后旧 Agents 面板被销毁但未重挂，根因是 lifecycle 使用了不存在的 `agents` workspace key；改为实际 key 并让 Host 负责刷新。Memory 原确认后才读取当前目标，存在删除新 Session 的风险，已固定确认前目标与上述重验。浏览器在确认框等待时切换 Session，实际 mutation 计数为零。

插图保存后 guard 仍提示未保存：重绘移除了旧字段，但观察器仍保存旧字段条目；已清理脱离 editor 的观察，模型标记继续保留实际隐藏文件草稿。官方工具旧挂载在 body，z-index 低于浮动外壳，真实点击被导航/正文遮挡；移入外壳工具层并接 route 可见性，复验成功。初始测试也需从 utility 返回真正 Play 阅读表面，而不是只调用底层 openNativeSession。

初期测试命令有不存在的名称/错误 cwd，不计为通过；最终明确使用现有路径。新增 Agent panel unit 补 jsdom structuredClone fixture，并按真实产品错误渲染断言。SQLite 首轮因本地 better-sqlite3 为旧 Node ABI 失败；直接执行该已安装依赖的 install script 后验证实际内存 SQLite，再复验该 suite 通过。没有修改锁文件或提交原生二进制。

### Local validation actually executed

仅本地最小相关集合；多轮复验重叠，不累加为不同场景。以下命令在产品根执行。

```bash
npm --prefix tests run test:unit -- --runInBand --runTestsByPath atria-shell/studio-workspace-a7.test.js atria-shell/studio-agent-a8.test.js atria-shell/studio-value-editor.test.js atria-shell/source-editor.test.js atria-shell/native-runtime-p5.test.js atria-shell/workspace-host.test.js atria-shell/workspace-leave-guard.test.js native/extensions-workspace.test.js orchestrator/snapshot-cache-hits-invalidates.test.js agent-runtime/workspace-agent-editing.test.js native/agent-settings.test.js
# 11 suites / 94 tests passed；最后两项小修改仅复验相关 suite
npm --prefix tests run test:unit -- --runInBand --runTestsByPath atria-shell/workspace-leave-guard.test.js
# 1 suite / 8 tests passed，新增 orphan-field 回归：上述集合最终 95 个不同用例
npm --prefix tests run test:unit -- --runInBand --runTestsByPath atria-shell/studio-workspace-a7.test.js
# 1 suite / 7 tests passed，部分失败恢复的最后调整
npm --prefix tests run test:unit -- --runInBand --runTestsByPath native/illustration-settings.test.js
# 修复本地 ABI 后 1 suite / 4 tests passed（FS + SQLite）；合计 12 suites / 99 个不同用例有通过证据
```

Chromium fixture-server E2E 的最终通过集合：

```bash
npm --prefix tests run test:e2e -- e2e/native-session/10-studio-redesign.e2e.js --workers=1
# 原 Studio review/source/UI/conflict/Agent 320px 通过；新增 A3 390px 初次 Fork 断言失败，后按真实 provenance 修正
npm --prefix tests run test:e2e -- e2e/native-session/09-runtime-redesign.e2e.js e2e/native-session/12-native-agent-routes.e2e.js e2e/native-session/20-extensions-ui.e2e.js --workers=1 --grep 'Fallback edits|Diagnostics reports|Retrieval creates a stored|Agents saves distinct|A3 Agents|Extensions script.*320'
# 原 5 场景通过；A3 Session 重挂问题修复后单独复验
npm --prefix tests run test:e2e -- e2e/native-session/10-studio-redesign.e2e.js e2e/native-session/12-native-agent-routes.e2e.js e2e/native-session/21-task-binding-preflight.e2e.js --workers=1 --grep 'A3'
# A3 Studio 全 20 view + exact 引用 lifecycle 通过；后两项按实际生命周期/启动前标题捕获修正后复验
npm --prefix tests run test:e2e -- e2e/native-session/12-native-agent-routes.e2e.js e2e/native-session/20-extensions-ui.e2e.js e2e/native-session/21-task-binding-preflight.e2e.js --workers=1 --grep 'A3'
# Agents Session / Memory reset 和 Runtime 原旧版本启动 2 场景通过；插图 guard/挂载层失败已修复
npm --prefix tests run test:e2e -- e2e/native-session/20-extensions-ui.e2e.js --workers=1 --grep 'A3'
# 修复后的插图完整配置 + Session 工具 1 场景通过；最后按钮颜色调整后同一场景再通过
```

共 10 个不同 browser 场景有最终通过证据：Studio 320px 原 Review/Source/UI/conflict/Agent；A3 390px 全 20 view/Attach/Update/Fork/detach/Used By/人工 receipt；fallback role/order/exact；Diagnostics 缺 pinned context 不生成；真实 Secret + Rerank；320px Agents 两条不同 exact route；Session 切换 Memory 迟到确认拒绝与 Run/binding；320px Skill 路径/文件脚本保存/启停/导入；390px 官方插图配置保存/草稿取消/作品覆盖/工具点击；390px 修复返回原启动/保留标题/绑定与旧 PackageVersionId。部分 fixture 使用 run-state evidence，无真实模型发送。

触及生产 JS ESLint、`npm run check:native-localization` 与 `git diff --check` 通过。复查本地插图管理/会话截图与失败遮挡截图；截图/fixture/产物仅 ignored 本地证据，不入库。

### Limits and next checkpoint

未执行全量 tests/完整 E2E、构建、Android/真机/WebView/真实中文 IME、真实远端模型/图片服务或远端 CI。20 view 遍历证明实际挂载可达，原字段保留基于源码复用和上述针对性断言，不冒充所有字段/设备逐项往返。Prompt/图片 cancel/历史/过期及 Skills 文件树全矩阵沿用原 authority，未本轮全跑；V09–V16 和 S00–S20 的完整集成仍归 A5/B/F。FS/SQLite 插图偏好测试不替代 A4 新 Persona 原生持久化/请求/Save/shared 契约。

保留产品 AGENTS.md，以及 docs README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md 的原有 dirty changes，不提交。package/plugin/skills 未改、reference 未读、未提交本地路径/用户数据/Secret/缓存/原生二进制或生成产物。

下一阶段 A4a：按 HANDOFF → index → personas/states/validation → 本 Record A3，继续同一产品分支；先做 Native Persona 资源/资产、Session/message/request 快照、Prompt evidence、branch/save/shared 服务契约与合约测试。A4b 入口开放仍要独立 checkpoint。本轮完成 A3 持久化后停止，不自动进入 A4a，不合并 main。

## Stage A4a — Native Persona resource and Session contracts

- Date: 2026-10-05
- Product start HEAD: `57a37bc8ac69ed0274d04ce0a8d1016d96ac4496`
- Product End/Tested HEAD: `e35e900077b6c2963cd032cdccfc45c24ab90102`；同一工作分支，已 commit/push，未合并 main。
- Docs start HEAD: `cf8fffabf53a2427c4cd525c71f27d5bad612fb2`
- Docs End/Tested content: 本 A4a 提交中的 index/personas/validation、同一 Record 与 live HANDOFF；不自引用 hash。
- Status: A4a complete; A4b next; Persona product entrances remain closed.

### Implemented authority and decisions

核对真实 Git/远端 refs，按 HANDOFF → index → personas/states/validation → Record A3 路由；只触及当前任务，无 reference 或 Skill 加载。

新增 persona ID 和四个 Native kinds，FS/SQL 共用既有 native resource key 注册。PersonaRepo 提供 owner 限定 CRUD/exact revision/list/search/pagination/归档/default CAS/Used By/delete/avatar，Native Product POST 家族及原 client adapter 接同一 repo。名字可重名；内容大小按 Unicode code points/UTF-8 拒绝超限；unknown fields/缺 CAS 前提拒绝。revision immutable，root/default 独立 CAS；成功直接返回发布回执，不依赖刷新。

FS 不具 rollback；本轮实现核对发现，仅 currentRevisionId 无法区分已发布旧修订与失败后孤立修订，因此 root 同步 CAS `publishedRevisionIds`。exact get/revisions 不暴露未发布内容；崩溃试件实际留下 orphan revision，已验证 root 与历史保持旧值。Persona/Asset 引用锁保护发布，永久删除重查真实 default、所有持久化 Persona state 与 migration target；管理备注中出现 ID 不算引用。引用策略保守保留历史/存储快照，不自动清理迁移 receipt。

头像允许 PNG/JPEG/WebP/AVIF、8 MiB/4096²/像素限制；先读取尺寸再实际解码，拒绝伪 MIME/坏图/超尺寸。现有 Jimp 浏览器 WASM 初始化在 Node fetch 本地 URL 失败，改为从已安装 codec 的本地 WASM 字节初始化；不下载、不新增依赖。PNG 复用 pngjs CRC 检查；四种格式的真实小图片均走服务验证。原 AssetStore immutable ref/hash/blob、正式 delivery 与 GC 路径保持；Persona published revision、state、migration Avatar ref 纳入删除保护。

SessionCore 捕获 default/explicit/none 到 reserved `atri_player_persona`；资源锁保持至 Session HEAD 发布。solo select 重验 exact/归档/头像、HEAD、run/lifecycle、原 task scheduler（含取消后未 settle 的 worker）；与发送竞争仅一方 CAS 发布。匹配现有 Continuity → Session 锁序，避免在 Session 内反向重入资源锁。未开始故事允许专用 persona 操作，但普通 generation/raw write/save 的 pending 禁用仍保持。

统一 `_newEntry` 服务捕获正式 user metadata `atri_player_identity`，覆盖普通输入、typed transaction 和 beginStory；拒绝客户端自造身份，notes 不入 namespace/message/request。旧 revision 读取不补写。非 transaction retry 回准确 post-user fork；transaction retry 从 pre-effect state 重建输入，并核对原 identity 一致，保留原 ref/display/hash 与上下文。显式 fork/restore 仍按原 revision；ironman 不绕过 rewind 限制。

新增 `player_persona` lane / `player_provided` / `context.player-persona`，只读接受的 Session snapshot。Prompt stage `contextConsumers` 显式 opt-in，typed task 还需 context 声明且排除 background/maintenance；普通 role 只准 narrator。预算选择与真实 Effective Request Snapshot 记录 exact ref、snapshotHash、token/omission 和 consumerStages，编译保留 stage 条件、选中阶段和 Package freeze。none/empty/legacy/not_consumed/lane_cap 有实际断言；管理备注不入请求，维护任务与客户端 prompt.host 伪造拒绝。受控本地 HTTP Provider 捕获了真实参数；修订 Persona 后仍发送原接受快照，preview 无发送/Secret/Session 写入。

有身份的 Save 使用 v3，容器 v1 magic 保留，snapshot/session/ironman resume 三 scope；v1/v2 legacy 读取保持。身份 state/hash/message display 及 exact avatar assetRefs/attachments/bytes 校验形成闭包；跨账户 import 仅恢复独立 Session snapshot，不创建个人库或默认。缺头像/旧 schema 装入 Persona evidence 拒绝，历史/存档头像引用阻断删除。

Shared 服务按 access → 排序账户 Persona → 原 Continuity/Session 锁操作，认证 member 自己账户取 exact selection，observer/其他 seat/Host 代选拒绝，重验 ACL/Session revision 与 access/scope epoch。seat selection 记录无明文 handle 的 authorization，projection 仅 status/name/avatar；成员变更清理当前 seat，旧 Branch 的主体/epoch 不匹配时不泄漏旧身份。头像授权复制到 owner AssetStore，delivery 白名单只加当前授权 peer snapshot，不放开个人库。Shared 输入 receipt 捕获席位显示身份。

Host 只增 `host.persona.status/openSelector` 固定白名单；status 无描述/账户库，selector 复用原 epoch/revision/宿主 guard，缺 picker 明确 unavailable。没有 Library 第四分类/Host picker UI/管理入口。Shared 描述消费当前明确 `shared_scope_unsupported`，避免回退 owner solo/global；这是保留给 A4b 开放审阅的显式停用范围。

### Actual minimal local validation

新增 5 suites 最终 22 个不同用例（resources 7、session 5、context 2、shared-host 3、save-backup 5）。连同原 history 10 / Prompt freeze 9，以及按名字选择的 22 个 Save/Shared/run/typed frontend 回归，本轮共 **11 suites / 63 个不同用例**有最终通过证据。复验重叠不累加。

```bash
npm --prefix tests run test:unit -- --runInBand --runTestsByPath native/persona-resources.test.js native/persona-session.test.js native/persona-context.test.js native/persona-shared-host.test.js native/persona-save-backup.test.js native/session-history-p2.test.js native/model-prompt-runtime-p6.test.js
# 当时 7 suites / 40 tests passed；resources 最后增加 migration target 引用回归 → 不同用例数为 41
npm --prefix tests run test:unit -- --runInBand --runTestsByPath native/save-system.test.js native/shared-runtime-p8.test.js native/run-policy-p2.test.js native/authority-frontend-c3.test.js --testNamePattern '^(?!.*(?:MysqlEngine|PgEngine)).*(logical snapshot|snapshot export/import|full-session export/import|ACL cannot be forged|shared inputs settle|concurrent submissions|guest cannot commit|pending runs block|validated multi-domain begin|ironman exports only|ironman rollback denied|fixed binding uses|typed Branch Retry)'
# 4 suites / 22 selected tests passed；其余 skipped 不计通过
npm --prefix tests run test:unit -- --runInBand --runTestsByPath native/persona-resources.test.js native/persona-session.test.js native/persona-context.test.js native/persona-shared-host.test.js native/persona-save-backup.test.js
# 最后 5 suites / 21 tests passed；最后引用 resolver/新增回归仅复验以下两项
npm --prefix tests run test:unit -- --runInBand --runTestsByPath native/persona-resources.test.js native/persona-save-backup.test.js
# 2 suites / 12 tests passed，final resources 7 + save/avatar 5
```

所有触及生产 JS 的 ESLint 与 git diff --check 通过；新 index/repository exports 也 lint 验证。PNG/JPEG/WebP/AVIF 真实解码，Shared 两账户 FS/SQLite 与头像 HTTP 授权/拒绝，typed retry/begin/ironman v3，Save 独立恢复均为本地真实服务入口；没有显著 UI 修改，未运行浏览器或截图。

首次测试出现夹具单账户限制、误用不存在的 export()、未传 Context budget 和重复构建 ZIP hash 不同，均按真实接口/原 archive/双账户目录修正并复验。较早不带过滤的 Save/Shared 集合因本地 MySQL 53306 / Postgres 55432 未启而 ECONNREFUSED；没有归因为产品回归，后续只运行 FS/SQLite 的相关选择。ImageMagick 的 AVIF encoder 未安装，试件改由本地已安装 AVIF WASM 编码生成；没有加入二进制或下载产物。

### Limits and next checkpoint

A4a 未执行迁移 preflight/apply/receipt API/逐项 replay、账户 native backup Persona manifest/default adoption/跨引擎 restore、真实 Host picker/Library Persona/UI 草稿流程、真实设备/模型服务、全量 tests/构建/远端 CI。新 persona-save-backup suite 当前只证明 Save/avatar 闭包，不能冒充账户备份。C20.5 migration prepared/root/receipt 每断点恢复留 A4b；现有 registered migration kind/引用读取不等于已实施迁移服务。

Shared 描述停用仍需 A4b 明示产品状态并决定有权限 consumer 的接线/证据；当前选择/展示/头像不表示共享描述已发送。Host picker 未开放，完整 epoch/nonce/恢复入口浏览器证据仍待 A4b；C20/V20/S00–S20 的完整开放与集成不因本轮合约通过而自动关闭。

保留产品 AGENTS.md 与 docs README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md 的原有 dirty changes，不提交；package/plugin/skills/reference 未改/未读。产品新分支不合并 main。下一阶段 A4b；本轮完成实现、本地验证、commit/push 与 Record/HANDOFF 后停止。

## Stage A4b — Persona management migration backup and product selectors

- Date: 2026-10-05
- Product start HEAD: `e35e900077b6c2963cd032cdccfc45c24ab90102`
- Product End/Tested content HEAD: `6bbb69484`；实现 `6114a597f`，另加归档默认恢复拒绝断言；同一工作分支，已 commit/push，未合并 main。
- Docs start HEAD: `ef8cf221cd8e75c921425619f7b622c631f82eb9`
- Docs End/Tested content: 本次 index/personas/coverage/validation、同一 Record 与 live HANDOFF；不自引用 hash。
- Status: A4b local checkpoint complete; A5 next. 支持范围入口开放，Shared 描述明确停用。

### Implementation and scope

按 HANDOFF → index → personas/coverage S20/validation → Record A4a 路由，保护原有 dirty changes。用户确认“A4a 是已有停点，本轮执行 A4b 并停在 A4b”。没有加载 Skill/reference、没有跨正式阶段或合并 main。

Persona 管理与 solo picker 接既有 authenticated Product client/PersonaRepo/Session CAS。Library 第四分类、exact owner 搜索路由、排序/分页、姓名/描述/管理备注、头像上传/移除/预览、创建/复制/新修订/归档/恢复/default/Used By/无引用删除均保留 authority。编辑失败保留草稿；成功保留 immutable receipt，刷新失败不重放。内部取消和原外壳 route guard 保留草稿；状态切换不更改 Composer 未发送内容。历史输入读取正式 Timeline identity，当前设定重命名不追随；头像失败显示回退。

迁移有上传 JSON 与认证账户旧 Persona settings 两个 preflight/apply 入口。preflight 全量只读，16MiB/1000项、显式未知版本/坏结构/超限/坏上传拒绝；原文、unknown fields、宏转换 diff 与 pending 保留，复制同名而不覆盖。local source 只捕获 Persona settings namespace/受限头像目录，来源追加 namespace/avatar/binding digest，拒绝路径遍历/符号链接；apply 重新捕获来源且必须匹配 review digest。旧 bindings/位置/Lorebook/未知宏明确 pending，不自动改旧会话或历史。

账本先 durable prepared（persona/revision/asset IDs）→ blob/ref → immutable revision/root → published receipt；任何断点重试核对 exact 预分配目标，root 已发布但 receipt 未完成只补回执。部分失败保留失败项与已有发布，UI 明示重预检重试。default adoption 是独立 CAS，另有 prepared/adopted receipt，default 已发布后 receipt 中断可恢复而不再发布默认。来源/映射与备份引用保护删除/GC，回退通过归档资源保持历史，没有批量重署名。

现有账户 backup/native 选项追加 schema 1 Persona manifest（all records/hash/avatar/default/receipt）；下载前闭包校验，probe 真正 staging 检查，restore 在任何 live 写入前再验。缺 manifest、改 hash、缺图、ID 冲突拒绝；旧无 Persona kinds 的 Native archive 仍兼容。按 exact IDs 合入 Persona并保留目标库，原 overwrite/full 其他 Native 范围保持；UI 明示策略。默认保留目标，显式 adopt 才 CAS，归档 source default 拒绝新 adoption；目标 Persona 头像即便 Native overwrite 也保持。复用原 snapshot/rollback/runner/native blobs，无并行备份服务。

Shared 自己席位选择经原 authenticated transport 捕获 seat/access/scope/revision anchors，observer/未结输入重试拒绝；UI 展示授权姓名/头像。描述在 UI 和 Context provider 固定停用 `shared_scope_unsupported`，无 opt-in 或 owner solo fallback；Host shared status 也不投影 owner solo。solo Host picker 接原 headless/白名单/Session guards，作品无个人库读写。Full Host 独立 recovery picker 在 presentation root 失效时仍工作。

### Actual minimal local validation

本轮 13 suites / 74 个不同 unit 用例具有最终通过证据（重试与交叉集合不累加）：新 migration 8 / storage 4 / account-backup 4 / UI 4；resources 7 / context 2 / shared-host 3 / Play 13 / Library routing 4 / Search 6 / Shared client 6 / Full Host 5 / 原 Native backup 8。其中 Save/session 的其余 A4a 证据沿用历史，不转算成新执行。

```bash
npm --prefix tests run test:unit -- --runInBand --runTestsByPath native/persona-migration.test.js native/persona-storage.test.js native/persona-account-backup.test.js --silent
# 3 suites / 16 tests passed，含 local source、avatar 断点与 default receipt 回放
npm --prefix tests run test:unit -- --runInBand --runTestsByPath native/persona-migration.test.js native/persona-storage.test.js native/persona-context.test.js native/persona-account-backup.test.js atria-shell/native-personas.test.js --silent
# 5 suites / 22 passed，最后 Shared provider 停用修正后复验
npm --prefix tests run test:unit -- --runInBand --runTestsByPath atria-shell/native-personas.test.js atria-shell/native-play-product.test.js native/persona-shared-host.test.js native/persona-account-backup.test.js --silent
# 4 suites / 24 passed
npm --prefix tests run test:unit -- --runInBand --runTestsByPath native/persona-resources.test.js native/persona-migration.test.js atria-shell/native-personas.test.js atria-shell/native-play-product.test.js --silent
# 当时 4 suites / 30 passed；后来 Play 追加身份显示断言并在上项通过
npm --prefix tests run test:unit -- --runInBand --runTestsByPath atria-shell/native-personas.test.js atria-shell/library-runtime-workspaces.test.js atria-shell/product-search.test.js native/persona-shared-host.test.js --silent
# 4 suites / 17 passed
npm --prefix tests run test:unit -- --runInBand --runTestsByPath game-runtime/shared-host-p8.test.js --silent
# 1 suite / 6 passed；Full Host 5 在相关三 suite 命令通过，早期 Shared UUID 试件失败已修正
npm --prefix tests run test:unit -- --runInBand --runTestsByPath native/persona-migration.test.js storage/endpoints/native-backup-roundtrip.test.js
# 当时 2 suites / 15 passed（migration 当时 7，原 backup 8）
npm --prefix tests run test:unit -- --runInBand --runTestsByPath native/persona-account-backup.test.js --silent
# 最后追加 archived default adoption 拒绝，1 suite / 4 passed
npm --prefix tests run test:e2e -- e2e/atria-shell/08-personas.e2e.js --workers=1
# 最终 Chromium 4 场景通过；390px/English/zh-cn/真实 FS HTTP
npm run check:native-localization
# English source / zh-cn 通过；所有触及生产 JS 的 ESLint、git diff --check 通过
```

实际 FS/SQLite 双向账户备份、真实 PNG 字节和目标保留头像、迁移断点与并发发布均有断言。受控本地 HTTP Provider 再次捕获真实发送的接受时 Persona，排除管理备注/后来重命名与无关任务；不是远端模型证明。Chromium 四场景验证真实服务的管理、default、JSON replay/local preflight、solo picker/草稿/focus、Host stale guard/独立恢复、中文与 Shared own-seat；截图已本地查看，截图/trace/用户 fixture 不提交。

### Failures resolved and limits

首次浏览器发现新建/详情仅换 DOM 而路由未更新，返回同一 list route 仍停编辑器；改为原 WorkspaceHost persona:new/exact route 后复验。选择成功但刷新失败时，通用 action finally 曾重启选择按钮；加入 completed 状态保留 receipt并阻止重放。backup probe test 的 multer prefix 被重复注册导致500，修正 fixture；旧泛型所有 kind 试件为 Persona kinds 写入假 schema，改为非 Persona kind generic fixture，实际 Persona 用新 account-backup 契约覆盖。中文测试 init script 每次覆盖 en，改为独立 zh-cn 页面；Shared client 新试件需注入现有 invocationId，避免 jsdom 缺 crypto.randomUUID。上述失败均不计通过。

未执行全量 tests/完整 E2E/构建/Android/真机/软键盘或真实中文 IME/WebView/MySQL/Postgres/远端模型/远端 CI。原 Bridge epoch/nonce authority未重写；本轮浏览器证明 picker 实际 Host调用、stale revision、focus和独立恢复，并未把所有 native@3 lease/nonce/设备组合重新验收。共享描述保持停用；高级 legacy 自动 scope/Actor 映射、整站迁移和历史批量改写未提供。全部 S00–S20/完整 V20 与最终集成仍待 A5/B/F。

产品 AGENTS.md 与 docs README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md 原 dirty changes未提交；package/plugin/skills/reference 未触及。本轮产品/docs 持久化后停止，不进入 A5、不合并 main。

## Stage A5 — First-round integration and compatibility

- Date: 2026-10-05
- Primary Workspace / branch: `main` / `refactor/atria-immersive-workspace`
- Start HEAD: `6bbb69484eabb8e6685bde589af7c8be695306d6`
- End / final touched-surface tested HEAD: `784bb91a83e205669f14445fa1ef49ed248b9799`，已 commit/push，未合并 main。最后相关检查在相同文件内容的 pre-commit 工作树执行；先前无关域合约在 Start HEAD 执行，不虚称全部重跑于 End HEAD。
- Status: **A5 local integration checkpoint complete; B1 Actors mapping next.** 首轮支持范围冻结，设备/外部引擎/完整字段与 Bridge 组合未验收；Shared 描述继续停用。

### Implementation and findings

按真实 Git/远端 → HANDOFF → index → delivery/validation → Record A4b 恢复。失败按 coverage/states/personas 的 authority 路由；没有重做 A1–A4b、加载 Skill/reference 或进入 B/F。

浏览器发现从 Play 搜索打开 Persona/Knowledge 详情时，WorkspaceHost 先写父域再写子页，导致一次 Back 只回到父页而不回原查询；若第一步被离开 guard 拒绝，第二步仍可能把目标 child 写到原 owner。Library、Build、Agents sections/Orchestration、Skill 和全局 Utility 的同源接线统一调用既有 Navigation Authority 一次提交完整 domain/child，保留 utility 的中立 Play owner 和 breadcrumb。没有新增 router、持久化或编辑 authority。新增回归覆盖九种目标的单 history entry、一次拒绝判定及拒绝后 owner 不变。

320px/真实 `font_scale=1.5` 下，原生 Persona dialog 循环 Tab 会让焦点离开弹层。沿用现有 Runtime 的可见/可用控件筛选规则，补 Tab/Shift+Tab 首尾循环；Esc/Cancel、成功回执和返回触发焦点保持原路径。没有重新开启 Shared 描述、库 CRUD 或 caller opt-in。

新增 `tests/e2e/atria-shell/09-immersive-integration.e2e.js` 三个真实 FS/HTTP 场景：缓存搜索命中原 Persona exact revision（后来改名不自动 latest）、Knowledge exact entry、来源级 Personas retry、Save history 与 Director 搜索返回查询；服务启动前真实持久化旧 Session 不回填，新默认/修订不改已有 Session，picker 留住 Composer 草稿和旧 revision，Save 同 ID 冲突不改写、删除测试 Session 后导入恢复而不新建 Persona；中文/light/Fast UI/减少动效/真实最大字号、320/719/720/1179/1180 边界和双向 Tab/Esc/focus。

### S00–S20 first-round evidence map

下表只映射本轮实际相关证据，证明现有外壳接线与支持范围兼容；不把控制器保留、视图可达或历史证据冒充逐字段/逐设备验收。

| Rows | A5 actual local evidence |
| --- | --- |
| S00 | WorkspaceHost/leave-guard/Search 合约；A5 exact Persona/Knowledge/Save/Director 跨域与 Back；九类取消后 owner 不变 |
| S01 | learning-center 与 startup-loader 合约；真实 fresh/default-user 启动与 A1 全局工具重入。多账户登录条件未全测 |
| S02–S03 | Play landing retry/empty/real resume；阅读节点/位置、合成 draft stream/IME；320px/light/safe-area/模拟 visualViewport；Native generation ABI 与受控 HTTP Provider实际请求 |
| S04–S06 | A2 exact history/fork/switch/只读与 busy guard；密码重试/安装确切旧版本/保留新默认/导入；Save v1/session 和 v2/resume、Persona v3 及新旧 Session |
| S07–S08 | Studio exact Library Attach/Update/Fork/Detach；Knowledge exact 搜索与原详情；Prompt controls/presets 完整导出闭包、immutable refs、Regex 与作者/玩家 authority 分离 |
| S09–S11 | Runtime readiness/save receipt/Secret/late response、Memory task exact route、Retrieval FS/SQLite revisions 和受控 HTTP/本地 vectors；Persona preview/预算/无关角色过滤 |
| S12 | 真实 20 Studio view 与 exact 引用 lifecycle；review/Source/草稿/人工回执/late Preview 合约。没有逐字段重造编辑器 |
| S13–S14 | 四模式 Agent settings restore/import exact route；真实 Director 搜索；确认期间切换 Session 后拒绝 Memory reset；Memory route/save 与 scoped diagnostics |
| S15–S16 | Extensions CRUD/scope/冲突/迟到响应合约；真实插图全设置 draft/取消/保存和 Session tools；插图 FS/SQLite CAS/冻结草稿 |
| S17 | Component/Hybrid/Full 与失败恢复 1440/390px；真实 solo Host picker/stale revision/独立恢复；Shared 自己席位选择与描述停用。frontend 用受控 fixture，不代表任意作品故障或完整 lease/nonce |
| S18–S19 | appearance/utility-workspaces/logging 合约；A1 学习/设置/Guided/Startup/Expert；真实中文 font_scale/Fast UI；Persona 账户备份 FS↔SQLite。账户头像/密码全条件未重跑 |
| S20 | Session/context/shared-host/save/account-backup/UI 合约与 A4b 四个 browser dependency 场景；A5 新旧 Session/默认/exact search/Save/focus。migration/storage 的其余断点沿用 A4b，不计新执行 |

### Actual minimal local validation

本轮 **28 suites / 181 个不同 unit** 和 **18 个不同 Chromium 场景**有最终通过证据；重叠复验不累加。仅在本地运行下列与 A5 接线/兼容相关的集合，不执行完整矩阵或远端 CI。

```bash
npm --prefix tests run test:unit -- --runInBand --runTestsByPath native/persona-session.test.js native/persona-save-backup.test.js native/persona-context.test.js native/persona-shared-host.test.js atria-shell/product-search.test.js atria-shell/workspace-leave-guard.test.js atria-shell/runtime-readiness.test.js atria-shell/save-dependency-recovery.test.js atria-shell/studio-workspace-a7.test.js atria-shell/memory-native-routing.test.js --silent
# 10 suites / 43 passed
npm --prefix tests run test:unit -- --runInBand --runTestsByPath atria-shell/learning-center.test.js atria-shell/prompt-runtime-controls.test.js atria-shell/native-runtime-p5.test.js native/retrieval-runtime.test.js native/agent-settings.test.js native/extensions-workspace.test.js atria-shell/appearance.test.js atria-shell/utility-workspaces.test.js logging/frontend-adapters.test.js native/save-system.test.js --silent
# 9 suites passed；save-system 的 13 本地用例通过，MySQL/Postgres 两项连接失败；不能将整条命令记作通过
npm --prefix tests run test:unit -- --runInBand --runTestsByPath native/save-system.test.js --testNamePattern '^(?!.*(MysqlEngine|PgEngine)).*$' --silent
# FS/SQLite 范围最终 13 passed / 2 skipped；加上前项九个 suite，96 个不同 passed
npm --prefix tests run test:unit -- --runInBand --runTestsByPath atria-shell/native-generation-p4.test.js frontend-startup-loader.test.js native/prompt-presets.test.js native/illustration-settings.test.js native/persona-account-backup.test.js --silent
# 5 suites / 23 passed
npm --prefix tests run test:unit -- --runInBand --runTestsByPath atria-shell/workspace-host.test.js atria-shell/workspace-leave-guard.test.js atria-shell/native-personas.test.js --silent
# 最后生产修正后 3 suites / 25 passed；leave-guard 8 已在首项，新增不同用例 17
ATRIA_DISABLE_MYSQL_TESTS=1 ATRIA_DISABLE_POSTGRES_TESTS=1 npm --prefix tests run test:unit -- --runInBand --runTestsByPath native/run-policy-p2.test.js --testNamePattern 'ironman exports only current resume closure' --silent
# v2/resume FS/SQLite 最终 2 passed / 41 非本轮目标 skipped；此前未过滤引擎的同一目标因 DB 缺环境失败
npm --prefix tests run test:e2e -- e2e/atria-shell/03-game-surfaces.e2e.js e2e/native-session/07-play-redesign.e2e.js e2e/native-session/10-studio-redesign.e2e.js e2e/native-session/12-native-agent-routes.e2e.js e2e/native-session/20-extensions-ui.e2e.js --grep 'Native Component|A2 |A3 ' --workers=1
# 7 passed；生产接线修正前，非相同触及面证据不冒充 End HEAD 全部重跑
npm --prefix tests run test:e2e -- e2e/native-session/07-play-redesign.e2e.js e2e/atria-shell/04-navigation.e2e.js --grep 'landing has retry|reading preserves position|320px light|A1 global utilities' --workers=1 --output=.e2e-scratch/a5-shell-compat-results
# 4 passed
npm --prefix tests run test:e2e -- e2e/atria-shell/09-immersive-integration.e2e.js e2e/atria-shell/08-personas.e2e.js e2e/atria-shell/04-navigation.e2e.js --grep 'A5 |A4b |A1 global utilities' --workers=1 --output=.e2e-scratch/a5-final-results
# 最后全部生产修正后 8 passed；A1 utilities 已在上项，故本轮不同 Chromium 场景合计 18
npm run frontend:prebuild-cache -- --dataRoot tests/.e2e-scratch/a5-build-cache
# 首次 webpack 编译成功；最终同一 libraries key 94907547ba0121e2 cache hit（不虚称第二次重新编译）
npm run check:native-localization
# English source / zh-cn 通过；两处生产 JS 和两处 test ESLint、git diff --check 通过
```

已本地查看最终中文320最大字号 Persona picker、390 Save history/search 和 Shared seat display 截图。截图/trace/dataRoot/前端缓存均 ignored，不提交。Viewport/visualViewport/IME 为浏览器仿真或合成事件；Provider 是受控本地 HTTP，不是远端模型证明。

### Resolved test failures and remaining limits

除上述真实路由与焦点 bug 外，新试件初稿误用不存在的 browser identity module、Knowledge header/row selector、Retry 的可读名称、revision 作为 content、未从 Library 切回 Play；逐项按真实接口/DOM 修正。首次 Save 同账户同 ID import 正确拒绝，改为显式断言冲突不改数据后删除新建测试 Session再恢复。两次主动终止已知不正确/缺 serial dependency 的浏览器选择集合，不计通过；最终 A4b 全四场景保留串行管理/迁移先建资源的依赖。没有为迁就测试关闭校验或绕过权限。

Save 与 run-policy 的 MySQL/Postgres 试探均连接拒绝（本地服务未运行），明确排除这两引擎后仅验 FS/SQLite；不能宣称 SQL 全 parity。Android/真实手机/软键盘/中文 IME/WebView、远端模型、全量 tests/完整 E2E、全部 native@3 lease/nonce/任意作品崩溃组合未测。首轮证据映射覆盖 S00–S20，但不是全部字段、状态、设备和 V20 全矩阵的无条件通过；这些限制继续进入 B/F。共享描述明确停用，显示/头像/选择不等于消费。

原产品 AGENTS.md 和 docs README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md dirty changes 保持未提交；package/plugin/skills/reference 未读/未改。A5 持久化后停止，不进入 B/F、不合并 main。下一 checkpoint 为 B1 Actors：先旧字段/动作/模式/advanced Source/draft/revision/authority 映射，再逐类替换展示；不把整个 B1 组当一次自动连跑阶段。

## Final state

Task ongoing. A1–A5 local checkpoints complete; B1 Actors mapping next. 支持范围首轮结果冻结，Shared 描述明确停用。完整设备/引擎/字段矩阵和最终集成仍未完成；本轮未合并 main。
