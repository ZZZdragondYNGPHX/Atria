# Atria Immersive Workspace — Live Handoff

## Task

- Task ID: `refactor/atria-immersive-workspace`
- Primary Workspace: `main`（产品）；docs 为文档辅助空间。
- Product branch / HEAD: `refactor/atria-immersive-workspace` / `9991c6ef03941ac6d6c321843d692b77841b7797`；已 commit/push，未合并 main。
- Docs branch: `docs`；本轮 Record/HANDOFF 持久化提交以真实 Git HEAD 为准，不自引用 hash。
- Current stage: **B1 EntryPoints mapping checkpoint complete — stopped before display replacement**。
- Plan entrypoint: [index](plans/refactor/atria-immersive-workspace/index.md)
- Next required modules: entrypoints-mapping、delivery、coverage S12 和 EntryPoints baseline 小节、states、validation；Actors mapping 仅按关联需要读，不重做 Actors。
- Record: [record](records/refactor/atria-immersive-workspace.md)，续接重点读 B1 EntryPoints mapping；Actors display/mapping 与 A5/A4a/A4b 历史保留。

## Completed

D1/P01–P06、A1–A5 首轮 checkpoint 保持，支持范围冻结。B1 Actors mapping 与展示完成：专属名称/自由 role/常用 profile/高级提示词/任意结构与 metadata/Source 共用原 value editor 草稿；空/非空集合 Source、exact actorId 选择、排序后保留身份、Review 前拒绝 unknown/legacy/duplicate/悬空 EntryPoint 引用、冲突复制与明确放弃重载、提交期间禁写及 receipt 只读重试完成。复用原 project.save/Workspace/ChangeSet/controller，Agent Commit 独立。

真实 FS/HTTP UI 往返与 .atria Build 比较 canonical Actor 输出；同 packageId 的作者项目更改不改变已安装 exact Session 与 Save package/closure。Shared 描述仍 `shared_scope_unsupported`，没有重新开启。G01/G04 展示缺口关闭；G02/G03 原后端归一化/Project duplicate IDs/有限 graph 保持，Actors UI 防护不覆盖直接 API、其它全项目 editor 或 Agent，不能恢复读路径已丢字段，也不声称 Used By 完整闭包。

本轮完成 [EntryPoints mapping](plans/refactor/atria-immersive-workspace/entrypoints-mapping.md)：canonical 13 字段、完整结构/Source、引用/primary、集合/exact ID/项目 revision、原 handler/human Workspace/Agent authority、初始状态/消息启动约束、第一入口动作和错误/冲突/离开/测试门。只改 docs，产品 HEAD 保持 `9991c6ef0`，未替换 EntryPoints 展示。G01–G05 与 N01–N08 已列；下一轮需补集合 Source、Review 前 unknown/duplicate/ref 拒绝、exact ID、冲突复制/明确放弃重载和真实动作目标提示。当前无 core.entrypoint registry/graph，不建立平行 authority。

## Pending / next target

**已按用户“完成映射后停止”停在 B1 EntryPoints replacement gate 前。** 下一独立 checkpoint 只实施 EntryPoints 展示与映射中的局部防护。先真实 Git/远端 → 本 HANDOFF → index → entrypoints-mapping → delivery/coverage S12 与 EntryPoints baseline/states/validation → 同一 Record B1 EntryPoints mapping。Actors 已完成，不重复其映射/实现；EntryPoints 展示、Worlds/Knowledge/B2/F 未开始，不自动连跑。保留源 JSON 与运行消费者的分层校验：Project duplicate/归一化/无入口 graph 的后端限制继续如实说明，Preview/Experience/UI 当前第一入口目标不能冒充所选入口；不自动联动或迁移。

首轮支持范围冻结，不声称 S00–S20 全字段/设备/引擎矩阵通过。后续保留外部 MySQL/Postgres、真机/软键盘/中文 IME/WebView/Android、远端模型、完整 native@3 lease/nonce/任意真实作品故障组合。没有旧高级 scope/Actor/绑定/注入自动映射、整站迁移或历史批量改写。新表面保留原结构化字段和 Source 全能力。

## Key decisions / carry forward

D01–D20/P01–P06 不重开。原资源/请求/Session/task authority 保持，exact ref/contentHash 不自动 latest；default/资源编辑不隐式推进 Session，legacy-unbound 不回填；管理备注只在账户库。

FS withTransaction 无整批 rollback。Persona root publishedRevisionIds 保持发布闭包；migration 要 durable preallocated IDs/plan digest/receipt，不用普通 create 重放。部分失败保留已发布成果；回退通过 archive 保持已使用 snapshot。迁移只取认证 Persona namespace 与受限头像目录，保留原文/unknown/未映射 pending，默认独立 CAS/adoption receipt。

Save v3 snapshot/session/resume 与旧 v1/v2 保持。跨账户恢复独立快照不自动认领个人库/default。账户 backup schema 1 Persona manifest 保持所有 revision/avatar/receipt/hash，原 native manifest/blob/staging/snapshot/rollback/runner 继续负责。按 exact IDs 合入并保留目标库/头像，冲突 review，不按名字静默合并；默认保留目标，显式 CAS adopt 才改变，缺 manifest/归档默认不能 adoption。

Native AUTO(0)/DISABLED(-1) Enter 换行，Ctrl/Cmd+Enter 发送；ENABLED(1) 直接 Enter；Shift/Alt/IME/229 不发送，legacy AUTO 不改。未接受草稿只恢复原 Session/基准；已接受输入不重发；生成期间 Stop 可用。

Host solo picker 走原白名单/epoch/revision/宿主 guards；Full root 故障时独立恢复可达。作品无个人库 CRUD；Shared Host seat-required，席位选择走 Shared controls，observer/pending retry 拒绝。normal Bridge epoch/nonce authority 未重写。

## Actual local validation

本轮 B1 EntryPoints mapping：**4 suites / 10 tests passed，19 skipped；26 个边界 assertions passed**（包括已知缺口的现状确认），另有 docs whitespace/链接/模块路由和证据路径检查。命令/首次 probe 缺 assets fixture 修正见 Record。产品未改，未运行 UI/E2E/Build/全量测试/设备/外部 DB/远端 CI；不与历史数量累加，不把文档或通用原测试当 EntryPoints 替换门通过。

B1 Actors display 历史（本轮未重跑）：**10 个不同 suites / 42 个不同 unit passed、90 skipped；2 个不同 Chromium 场景 passed**，另有 2 个临时声音引用 assertions。最后 Actors/value/workspace 3 suites/24 tests 与两个 browser 场景通过；新增身份区截图后中文场景复验通过，重复不累加。其余未受小修影响的相关 suite 有本轮证据，未虚称全部同时重跑。详细命令/初轮问题/修正见 Record B1 display；不与 A5 或 mapping 数量相加。

验证任意 profile/metadata JSON 与双示例键/高级提示词、空/同名/集合增删排序、字段↔Source↔Review↔Cancel、unknown/legacy/duplicate/引用拒绝、非法 Source 复制、真实并发 409/明确放弃重载、receipt 读取失败不重放、原 service rollback/Agent/Back guards、canonical FS/HTTP/.atria Build 与已有 Session/Save 不推进、共享描述停用。English/zh-cn、320 最大 font_scale=1.5/Tab/focus/Fast UI/light/reduced-motion 与 720 截图本地查看；不是 Android/真机/完整设备矩阵。触及 JS ESLint、localization、产品/docs whitespace 与文档链接/路由检查通过；未运行全量 tests/远端 CI/全产品 bundle。

A5 历史 28 suites/181 不同 unit、18 不同 browser 的支持范围只见 Record A5，未在本轮重跑/累加。Shared 描述固定停用，所有未测范围继续保留。

## Preserve / do not repeat

产品 AGENTS.md，以及 docs README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md 原 dirty changes 保持未提交。package/plugin/skills/reference 未改/未读，不 main merge 到独立长期空间。不要重新实施 A1–A5；不恢复旧共享 global Persona，不重新开启共享描述。

## New-chat bootstrap prompt

继续 Atria 的 refactor/atria-immersive-workspace。先核对真实 Git/远端 → docs:HANDOFF.md → plans/refactor/atria-immersive-workspace/index.md → entrypoints-mapping.md 与 delivery/coverage S12/EntryPoints baseline/states/validation → 同一 Record B1 EntryPoints mapping。产品 `9991c6ef03941ac6d6c321843d692b77841b7797` 与远端一致，Actors mapping/display 已完成；EntryPoints 字段/动作/authority 映射已完成，本轮按用户要求停止在展示前。下一轮只实施 B1 EntryPoints 展示与 G01–G05 对应局部防护，复用原 value editor/controller/project.save/Workspace/ChangeSet，保留完整结构/Source/exact ID 和 project revision；无入口独立 registry/repository/revision，不将有限 Inspector 当完整闭包。Project duplicate/顶层归一化读损失仍需明确边界，UI 防护不冒充后端全面修复。初始 overlay/timeline、Package-only experienceContract、第一入口 Preview/Experience/UI 与 scenario exact/default 目标须按映射保留/明示，不自动联动选择或迁移。Shared description 仍 shared_scope_unsupported，无 opt-in/solo 回退/Actor 或席位自动映射。每阶段只做最小本地相关验证，不发起/等待远端 CI，保护原 dirty changes。EntryPoints 展示 checkpoint 实现/验证/commit/push 后更新同一 Record/HANDOFF、给接手提示词并停止；不自动进入 Worlds/Knowledge/B2/F、不合并 main。真机、外部数据库与完整矩阵仍未测。
