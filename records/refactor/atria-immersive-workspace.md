# Atria Immersive Workspace — Record

- Task ID: `refactor/atria-immersive-workspace`
- Primary Workspace: `main`
- Status: Active — A1 complete; A2 next
- Plan: [Plan index](../../plans/refactor/atria-immersive-workspace/index.md)

## Summary

本任务承接用户的“整理 Atria 前端界面”讨论。经 v0.2–v0.8 多轮交互原型和确认，2026-10-05 整理成新的 Plan Bundle。旧前端重设计与 Native Frontend v3 的已完成历史保持不变。D1 已完成契约核对与范围冻结，A1 已实现浮动外壳与入口并完成本地针对性验证；S00–S20 全矩阵与最终集成验收仍待后续阶段。

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

## Final state

Task ongoing. A1/A2 implemented and locally verified; A3 next. S00–S20 full integration and final release remain pending.
