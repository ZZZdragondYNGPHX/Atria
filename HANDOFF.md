# Atria Immersive Workspace — Live Handoff

## Task

- Task ID: `refactor/atria-immersive-workspace`
- Primary Workspace: `main`（产品）；docs 为文档辅助空间。
- Product branch / HEAD: `refactor/atria-immersive-workspace` / `6bbb69484eabb8e6685bde589af7c8be695306d6`；实现 `6114a597f`，已 commit/push，未合并 main。
- Docs branch: `docs`；本 A4b 持久化提交（以真实 Git HEAD 为准，不自引用 hash）。
- Current stage: **A4b local checkpoint complete; A5 next**。用户已确认本轮执行 A4b 并停在 A4b。
- Plan entrypoint: [index](plans/refactor/atria-immersive-workspace/index.md)
- A5 required modules: delivery、validation；失败项再按其权威模块路由。
- Record: [record](records/refactor/atria-immersive-workspace.md)，续接重点读 A4b；A4a 服务/Save 历史证据保留。

## Completed

D1/P01–P06、A1–A4a 保持。A4b 将 Persona 管理/选择接入现有 Product client/PersonaRepo/Session CAS：Library 第四分类、exact owner 搜索/路由、排序/分页、创建/复制/修订/头像/归档/默认/Used By/无引用删除；草稿离开检查与成功回执，刷新失败不重放。solo picker 保留 Composer 草稿、重验 revision/session/history/generation；消息展示接受时姓名/头像，之后身份变化不改旧消息。来源归档/缺失保留快照并解释。

迁移新增上传 JSON 与认证账户旧设定 preflight/apply/receipt/default-adoption。local source 仅读 Persona namespace 与受限头像目录，包含 namespace/avatar/binding digest，apply 再捕获重验；不接受浏览器路径。16MiB/1000项、未知版本/结构、原文/unknown/宏 diff/pending 处理。durable prepared ID → blob/ref/revision/root → published receipt，断点/部分失败恢复不重复建资源；default 是独立 CAS，加 prepared/adopted 回执恢复。旧 JSON 缺图、未映射 bindings/位置/Lorebook/宏明确 pending，没有旧 Session/history 自动重写。

账户备份继续原 native 选项/manifest/native_resources/nativeBlobs/staging/snapshot/rollback/runner，追加 schema 1 Persona 索引及所有 revision/avatar/receipt/hash/default。probe staging 检查，apply 再验闭包/冲突。按 exact IDs 合入 Persona并保留目标库；merge/overwrite/full 都明示此身份策略，其他 Native 范围保持原逻辑。默认保留目标，显式 CAS adopt 才变更；缺 Persona manifest/归档默认不能 adoption。目标头像闭包在 overwrite 下保留。

Shared 自己席位 UI 经原 authenticated transport 捕获 seat/access/scope/revision anchors；观察者与 pending retry 拒绝，姓名/头像投影授权。**共享描述明确停用**：UI/Context provider 固定 `shared_scope_unsupported`，无 caller opt-in 或 owner solo 回退。Host shared status 为 seat-required；共享席位选择走 Shared controls。solo Host picker 接原白名单/guards；Full presentation root 失效时独立 recovery 入口仍打开真实 picker，作品无个人库 CRUD。

## Pending / next target

A5：首阶段集成与兼容验收。先核对真实 Git/远端与本 HANDOFF → index → delivery/validation → Record A4b，再按实际失败项路由。只执行与当前触及面相称的最小本地验证；不直接全跑矩阵、不发起/等待远端 CI，不提前进入 B/F 或合并 main。

支持范围的管理/solo/Shared 席位显示选择入口已开放；这不是完整 V20/S00–S20/最终集成证明。Shared 描述继续停用，不能把选择/显示/头像当成描述已消费；用户没有授权重新启用。旧高级 scope/Actor/绑定/注入自动映射、整站迁移和历史批量改写不提供。

MySQL/Postgres、真实手机/软键盘/中文 IME/WebView/远端模型/完整 native@3 lease/nonce 设备组合未测。A4b Chromium 独立 Host 恢复场景使用真实宿主/服务，故障 root 是测试创建的 Full Host；不能当作任意真实作品 frontend 的崩溃覆盖。正常 Bridge epoch/nonce 原 authority未重写。本轮无构建/Android/全量 tests/完整 E2E/远端 CI。

## Key decisions / carry forward

D01–D20/P01–P06 不重开。原资源/请求/Session/task authority保持，exact ref/contentHash 不自动 latest；default/资源编辑不隐式推进 Session，legacy-unbound 不回填。

FS withTransaction 无整批 rollback。Persona root publishedRevisionIds 保持发布闭包；migration 要 durable preallocated IDs/plan digest/receipt，不用普通 create 重放。部分失败保留已有成果；回退通过 archive 保持已使用 snapshot。管理备注只留账户库，不进 Session/message/request。

Save v3 的 snapshot/session/resume 与旧 v1/v2 保持 A4a；跨账户恢复独立快照不自动认领个人库/default。账户备份新 manifest 才提供完整身份闭包，旧无 Persona kinds 的 Native 备份继续兼容。恢复 Persona 策略保留目标库/默认，冲突要 review，不能按名字静默合并。

Native AUTO(0)/DISABLED(-1) Enter 换行，Ctrl/Cmd+Enter 发送；ENABLED(1) 直接 Enter；Shift/Alt/IME/229 不发送，legacy AUTO 不改。未接受草稿只恢复原 Session/基准，已接受输入不重发，Stop 在生成期间可用。

## Actual local validation

A4b 13 suites / **74 个不同 unit** 有通过证据（重叠复验不累加）：新 migration8/storage4/account-backup4/UI4；resources7/context2/shared-host3/Play13/Library4/Search6/Shared client6/Full Host5/原 Native backup8。FS↔SQLite 真正账户备份、PNG/blob闭包、各 migration断点、default回执恢复、受控本地 HTTP Provider实际发送与 Shared provider停用断言均通过。

Chromium `tests/e2e/atria-shell/08-personas.e2e.js` 最终 **4 场景通过**：390px 管理/草稿/default/JSON重放/账户源预检；solo/Host picker/草稿/focus/独立恢复；zh-cn 管理；真实服务 Shared 自己席位显示选择与描述停用。截图已本地查看；fixture/截图/trace 均 ignored，不提交。

触及生产 JS ESLint、`npm run check:native-localization`（English/zh-cn）、diff whitespace 通过。详细命令/失败修复/最后验证在 Record A4b。A4a/A3 历史证据不转算为本轮新测试；本轮未测范围见 Pending。

## Preserve / do not repeat

产品 AGENTS.md，以及 docs README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md 原 dirty changes保持未提交。package/plugin/skills/reference未改/未读。不得 main merge 到独立长期空间。不要重新实施 A1–A4b，不恢复旧共享 global Persona 或整站迁移。

## New-chat bootstrap prompt

继续 Atria 的 refactor/atria-immersive-workspace，执行 A5。先核对真实 Git/远端 → docs:HANDOFF.md → plans/refactor/atria-immersive-workspace/index.md → delivery/validation → 同一 Record A4b。产品分支 refactor/atria-immersive-workspace@6bbb69484eabb8e6685bde589af7c8be695306d6，A4b 已实现/本地验证/push，支持范围的 Persona 管理/选择入口开放；共享描述明确停用，不能宣称或自动开启消费。复用原 Native/Session/Context/Save/backup/Bridge authority，按实际触及面推进首阶段集成与兼容验收，每阶段只做最小本地相关验证、不发起/等待远端 CI。用户已授权普通问题自行处理；A5 完成实现/验证/commit/push后更新同一 Record/HANDOFF、给接手提示词并停止，不进入 B/F、不提前合并 main；保护原有 dirty changes。
