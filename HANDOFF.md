# Atria Immersive Workspace — Live Handoff

## Task

- Task ID: `refactor/atria-immersive-workspace`
- Primary Workspace: `main`（产品）；docs 为文档辅助空间。
- Current product branch: `refactor/atria-immersive-workspace`
- Product HEAD / tested content: `57a37bc8ac69ed0274d04ce0a8d1016d96ac4496`；已 push，未合并 main。
- Current docs branch / HEAD: `docs`；本 A3 持久化提交（读取真实 Git HEAD，不自引用 hash）。
- Current stage: A3 complete; A4a next。
- Plan entrypoint: [index](plans/refactor/atria-immersive-workspace/index.md)
- A4a required modules: personas、states、validation；保持 Persona 入口关闭。
- Record: [record](records/refactor/atria-immersive-workspace.md)，续接重点读 A3。

## Completed

D1/P01–P06 冻结与 A1/A2 行为保持。A3 完成 Studio 原 20 view/全部原编辑器与 Source、资源编辑/引用页签共享草稿、exact Attach/Fork/Update/Review detach/Used By；人工 Apply 与 Agent Commit 保持独立。保存回执、部分失败重试、内部离开与迟到 Preview/Simulation/Build 补齐，成功后的读取失败不会重放写入。

Runtime 保留全角色/provider/Secret/模型能力/fallback/exact Prompt/Generation、Embedding/Rerank、compile；修复返回原启动控制器与输入/选择/旧 PackageVersionId，返回后重新 preflight。Agents 默认 Run，固定 Session/绑定，Native 合成角色不作为 Character；四模式原专属字段/JSON/权限/预算保持。Session 切换的旧 workspace key 导致空白已修正；Memory reset 确认后与删除前重验 scope/revision，迟到确认不写新 Session。

扩展 Skills/Plugins 原文件/scope/manifest/调用偏好与更新禁用保持。官方插图完整角色/全局/作品覆盖/模板/参数与原 Prompt/图片 task 保持；草稿关闭取消、保存后重绘观察清理补齐。会话工具仍由 SDK 清理，挂到原外壳工具层，只在 Play 表面显示；深色按钮使用原 tokens。用户已授权分阶段开工与普通问题自主处理，本轮完成 A3 持久化后停止。

## Pending / next target

A4a：Native Persona 资源/头像资产、账户 owner/exact revision/default/CAS、Session/message/request 捕获快照、Prompt consumer 与预算 evidence、retry/branch/save/shared/host 服务契约。按冻结 personas 模块实施 meaningful contracts，不能用旧全局 name1 或 legacy Persona tests 替代。A4b 是后续独立 UI/迁移/备份/入口开放阶段；A4a 仍不开放第四 Library 分类或 Host 身份 picker。

每阶段只做本地最小相关验证；实现/验证/commit/push 后更新同一 Record 与 live HANDOFF，并给接手提示词后停止。不自动跨阶段，不提前合并 main。S00–S20 全矩阵、真实设备/provider 与最终集成仍待 A5/B/F。

## Key decisions / carry forward

D01–D20/P01–P06 不重开。Native AUTO(0)/DISABLED(-1) Enter 换行，Ctrl/Cmd+Enter 发送；ENABLED(1) 也可直接 Enter；Shift/Alt/IME/229 不发送，legacy AUTO 不改。未接受草稿只恢复同 Session/基准 revision；已提交输入不重发。Stop 在实际生成期间保持可用。

原资源/请求/Session/task authority 保持；没有跨路由自动草稿持久化。observer 只看原字段/模型标记，脱离 editor 的旧字段及时清理；compact Runtime 编辑层仍参与原离开 guard。Asset 引用按 immutable contentHash，不添加无后端契约的 Update。Library/Save exact 依赖恢复仍保留新版默认，历史动作需先 Preview exact revision。

Native chatKey ABI 保留，Session binding 不能重写为另一套 namespace。Runtime repair 只是临时 UI 控制器/DOM 返回记录，不能变成新的持久化任务/配置 authority。S16 只把官方工具接到现有 Shell 层，原 SDK 清理与 Prompt/图片 task ID/cancel 语义不改。

A4 注意：FS 不支持整批 rollback；逐项迁移账本、source/plan digest/default 独立 CAS 按 personas 冻结设计。retryReply 有 post-user fork 与 typed transaction pre-effect + 新输入两条路径，后者需保留原输入身份；旧 revision 不回填，旧 JSON 限制与 Save v3/backup 闭包按 personas 执行。Persona 不是世界事实；notes 不发送，consumer 显式 opt-in。旧整站迁移保持退役。

## Validation

A3 最终 12 suites/99 个不同 unit 用例有通过证据：最后 11 suites/94 tests，再针对最后小修改复验 guard 8 tests（新增 1）、Studio 7 tests，插图 FS/SQLite 4 tests。计数重叠不相加。SQLite 最初本地原生模块 ABI 不匹配，执行已安装 better-sqlite3 的 install script 后实际内存 SQLite 与该 suite 复验通过；未改 lockfile/提交二进制。

10 个不同 Chromium 场景最终通过：Studio 原 320px Source/UI/review/conflict/Agent；390px 20 view/exact 引用流程/receipt；fallback/diagnostics；真实 Secret/Rerank；320px Agents exact route；Session 切换 Memory 迟到确认拒绝/Run/binding；320px Skills/scripts 保存启停导入；390px 官方插图管理/作品覆盖/关闭取消与工具真实点击；390px 修复返回原标题/选择/旧版本启动。初始失败、修正与命令见 Record A3。ESLint/本地语言覆盖/diff whitespace 通过，阶段截图仅本地 ignored 证据。

未执行全量测试/完整 E2E/构建/Android/真机/WebView/真实中文 IME、真实模型/图片服务或远端 CI。20 view 可达与源码复用不冒充每个字段/设备逐项往返；Prompt/图片任务/取消/历史完整矩阵未本轮全跑。插图 FS/SQLite 偏好测试不替代 A4 Persona 持久化/请求/Save/shared 开放门。

## Read first / preserve / do not repeat

核对真实 Git/远端 → 本 HANDOFF → index → personas/states/validation → Record A3。不要全量扫描 Plans/Records/Skills/reference，不重复 D1/A1–A3，不把局部验证当 S00–S20 集成完成。原 Source、高级字段和 provider/role 不得简化。

保留产品 AGENTS.md 与 docs README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md 原有 dirty changes；提交仅任务文件。package/plugin/skills 未改，reference 未读。不要将 main merge 进独立长期工作空间。

## New-chat bootstrap prompt

继续 Atria 的 refactor/atria-immersive-workspace，执行 A4a。先核对真实 Git 状态，读 docs:HANDOFF.md → plans/refactor/atria-immersive-workspace/index.md → personas/states/validation，再读同一 Record 的 A3。产品分支 refactor/atria-immersive-workspace@57a37bc8ac69ed0274d04ce0a8d1016d96ac4496，A3 已实现/本地验证/push，用户已授权普通问题自行处理。推进 Native Persona 资源/资产、Session/message/request 快照、Prompt evidence 与 retry/branch/save/shared/host 服务契约，遵守冻结 schema/API/迁移与兼容设计；先完成合约，保持 A4b UI/第四分类/Host picker 未开放。每阶段只做本地最小相关验证；完成实现/验证/push 后更新同一 Record/HANDOFF，给接手提示词并停止。
