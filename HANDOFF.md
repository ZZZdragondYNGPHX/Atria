# Atria Immersive Workspace — Live Handoff

## Task

- Task ID: `refactor/atria-immersive-workspace`
- Primary Workspace: `main`（产品）；docs 为文档辅助空间。
- Product branch / HEAD: `refactor/atria-immersive-workspace` / `784bb91a83e205669f14445fa1ef49ed248b9799`；已 commit/push，未合并 main。
- Docs branch: `docs`；本 A5 持久化提交以真实 Git HEAD 为准，不自引用 hash。
- Current stage: **A5 local integration checkpoint complete; B1 Actors mapping next**。本轮停在 A5。
- Plan entrypoint: [index](plans/refactor/atria-immersive-workspace/index.md)
- Next required modules: delivery、coverage S12/S07 和 Actors 对应 baseline 小节、states、validation；冻结决策按实际需要路由。
- Record: [record](records/refactor/atria-immersive-workspace.md)，续接重点读 A5；A4a/A4b authority 与迁移历史保留。

## Completed

D1/P01–P06、A1–A4b 保持。A5 将 S00–S20 首轮支持范围的实际本地证据映射写入同一 Record；验证跨域搜索、Runtime/Save 恢复、20 Studio view、Agents Session 隔离、扩展/插图、native/hybrid/full 呈现、新旧 Session 和 Persona/default/Save 边界。

WorkspaceHost 的 Library/Build/Agents sections/Orchestration/Skill/Utility 原父子两步导航改为既有 Navigation Authority 一次提交完整目标，避免一次 Back 落到中间父页、取消后 child 写到原 owner。Utility 仍属于中立 Play host；没有新 router 或持久化 authority。Persona dialog 按原 Runtime 控件筛选规则补 Tab/Shift+Tab 首尾焦点循环；Esc/Cancel/回执与返回触发焦点保持。

新增 A5 三个真实 FS/HTTP browser 场景：缓存搜索原 Persona exact revision、Knowledge entry、Persona 来源级 retry、Save history/Director 返回查询；启动前已存在旧 Session 不回填、修订/default 不改已有 Session、显式 picker 草稿/旧 revision、Save 同 ID 冲突不改写及清除新建测试 Session 后恢复；中文真实 font_scale=1.5/Fast UI/light/reduced motion、320/719/720/1179/1180 和双向 Tab/Esc/focus。

**共享描述明确停用**：Shared UI 与 Context provider 固定 `shared_scope_unsupported`，无 caller opt-in 或 owner solo 回退。自己席位姓名/头像/选择和 authorized avatar closure 不表示描述被消费；用户没有授权重新启用。

## Pending / next target

A5 首轮本地 checkpoint 完成；下一正式 checkpoint 是 B1 Actors。先真实 Git/远端 → 本 HANDOFF → index → delivery/coverage S12/S07 与 Actors baseline/states/validation → 同一 Record A5。先提交旧字段/动作/所有模式/advanced Source/draft/revision/handler/authority/错误冲突离开/对应测试的映射，再按映射替换展示，复用原 controller/持久化。B1 的 Actors、EntryPoints、Worlds、Knowledge 各为独立 checkpoint，不能自动连跑整组或进入 B2/F。

首轮支持范围冻结，不声称 S00–S20 全部字段/状态/设备组合或 V20 无条件完整通过。MySQL/Postgres 在 Save/run-policy 两 suite 的最初试探均因本地数据库未运行而连接拒绝；明确排除后只验证 FS/SQLite。真实手机/软键盘/中文 IME/WebView/Android、远端模型、完整 native@3 lease/nonce/任意真实作品故障组合未测；保留进入后续验收，不能将 browser 仿真或受控 frontend fixture 记作真机/完整作品证明。

没有旧高级 scope/Actor/绑定/注入自动映射、整站迁移或历史批量改写。新展示必须保留原结构化字段和 Source 全能力。

## Key decisions / carry forward

D01–D20/P01–P06 不重开。原资源/请求/Session/task authority 保持，exact ref/contentHash 不自动 latest；default/资源编辑不隐式推进 Session，legacy-unbound 不回填；管理备注只在账户库。

FS withTransaction 无整批 rollback。Persona root publishedRevisionIds 保持发布闭包；migration 要 durable preallocated IDs/plan digest/receipt，不用普通 create 重放。部分失败保留已发布成果；回退通过 archive 保持已使用 snapshot。迁移只取认证 Persona namespace 与受限头像目录，保留原文/unknown/未映射 pending，默认独立 CAS/adoption receipt。

Save v3 snapshot/session/resume 与旧 v1/v2 保持。跨账户恢复独立快照不自动认领个人库/default。账户 backup schema 1 Persona manifest 保持所有 revision/avatar/receipt/hash，原 native manifest/blob/staging/snapshot/rollback/runner 继续负责。按 exact IDs 合入并保留目标库/头像，冲突 review，不按名字静默合并；默认保留目标，显式 CAS adopt 才改变，缺 manifest/归档默认不能 adoption。

Native AUTO(0)/DISABLED(-1) Enter 换行，Ctrl/Cmd+Enter 发送；ENABLED(1) 直接 Enter；Shift/Alt/IME/229 不发送，legacy AUTO 不改。未接受草稿只恢复原 Session/基准；已接受输入不重发；生成期间 Stop 可用。

Host solo picker 走原白名单/epoch/revision/宿主 guards；Full root 故障时独立恢复可达。作品无个人库 CRUD；Shared Host seat-required，席位选择走 Shared controls，observer/pending retry 拒绝。normal Bridge epoch/nonce authority 未重写。

## Actual local validation

A5 **28 suites / 181 个不同 unit；18 个不同 Chromium 场景**有最终通过证据，重叠复验不累加。最终触及面 3 suites/25 unit 和 8 browser 全通过；其他未受修正影响的相关域测试在 Start HEAD 执行，不能虚称全都于 End HEAD 重跑。详细命令、数量、S00–S20 映射、试件失败修正与缺环境在 Record A5。

FS/SQLite Session/context/shared/avatar/Save v3、Save v1、v2 ironman resume、账户备份双向闭包/默认/冲突通过；受控本地 HTTP Provider 真实发送和 Shared 停用断言通过，非远端模型。20 Studio view/exact 引用、旧版本安装/密码重试/恢复、Agents Session 隔离、插图 settings、呈现/failure recovery 等均在相关 browser 选择集合执行。

最后 A5/依赖 A4b/A1 utilities 的 8 个 Chromium 场景全通过，关键中文320最大字号 picker、390 Save history/search 和 Shared seat display 截图已本地查看。截图/trace/dataRoot/缓存均 ignored。IME/visualViewport/safe-area 仅合成/仿真。

触及生产/test JS ESLint、English/zh-cn localization、diff whitespace 通过。前端缓存首次 webpack 真编译通过，最后同一 libraries key cache hit；不虚称全产品 bundle/Android 构建。没有全量 tests/完整 E2E/远端 CI。

## Preserve / do not repeat

产品 AGENTS.md，以及 docs README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md 原 dirty changes 保持未提交。package/plugin/skills/reference 未改/未读，不 main merge 到独立长期空间。不要重新实施 A1–A5；不恢复旧共享 global Persona，不重新开启共享描述。

## New-chat bootstrap prompt

继续 Atria 的 refactor/atria-immersive-workspace，执行 B1 Actors checkpoint。先核对真实 Git/远端 → docs:HANDOFF.md → plans/refactor/atria-immersive-workspace/index.md → delivery/coverage S12/S07 与 Actors baseline/states/validation → 同一 Record A5。产品分支 refactor/atria-immersive-workspace@784bb91a83e205669f14445fa1ef49ed248b9799，A5 已实现/本地验收/commit/push，首轮支持范围冻结；共享描述明确停用，没有重启授权。先做 Actors 完整字段/动作/模式/Source/draft/revision/authority/状态/测试映射，再改展示；复用原 Native/Session/Context/Save/backup/Bridge authority。每阶段只做最小本地相关验证，不发起/等待远端 CI；保护原 dirty changes。Actors checkpoint 完成实现/验证/commit/push 后更新同一 Record/HANDOFF、给接手提示词并停止，不自动进入 EntryPoints/Worlds/Knowledge/B2/F、不合并 main。真实设备、外部数据库和完整矩阵未测范围继续如实保留。
