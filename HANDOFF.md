# Atria Immersive Workspace — Live Handoff

## Task

- Task ID: `refactor/atria-immersive-workspace`
- Primary Workspace: `main`（产品）；docs 为文档辅助空间。
- Product branch / HEAD: `refactor/atria-immersive-workspace` / `f40bca67b56eb42c0b4340d8ca9dfc44f848101a`；已 commit/push，未合并 main。
- Docs branch: `docs`；本轮 Record/HANDOFF 持久化提交以真实 Git HEAD 为准，不自引用 hash。
- Current stage: **B1 Worlds mapping checkpoint complete — stopped before Worlds display**。
- Plan entrypoint: [index](plans/refactor/atria-immersive-workspace/index.md)
- Next required modules: [worlds-mapping](plans/refactor/atria-immersive-workspace/worlds-mapping.md)、delivery、coverage S12/S07 和 baseline 的 Worlds 小节、states、validation；EntryPoints/Actors 映射仅按关联需要读，不重做。
- Record: [record](records/refactor/atria-immersive-workspace.md#stage-b1-worlds--mapping-checkpoint)，续接重点读 B1 Worlds mapping；历史阶段保留。

## Completed

D1/P01–P06、A1–A5 首轮 checkpoint 和 B1 Actors mapping/display 保持，支持范围冻结。B1 EntryPoints 映射与展示完成：专属身份/名称/三类 exact 引用/可移除 primary/初始 overlay 和 timeline/六类高级 JSON 与 Source 共用原 value editor 草稿；空/非空集合 Source 始终可达，exact entryPointId 选择/修改/排序/树高亮，Review 前拒绝 unknown/legacy/duplicate/悬空引用，409 原文复制与明确丢弃重载、提交禁写和 receipt 只读重试完成。复用原 project.save/项目 revision/human Workspace/ChangeSet/controller，Agent Commit 独立。

真实 FS/HTTP/磁盘项目与 .atria container 的 canonical EntryPoint 往返相同；作者同 packageId 修改不推进已有 installed exact Session 和 Save package/closure。真实 Preview 默认第一入口、scenario 显式入口与 opening 验证；Experience/UI 明示第一入口，chooser 不联动动作。Source 任意 JSON 与 Session object/array/primary/message/protected metadata 消费者分层保持；World-less/单/多 World 启动、原 projection/envelope opening 已有最小本地证据。Shared 描述仍 `shared_scope_unsupported`，没有重新开启。

G01/G04 展示缺口关闭；G02/G03/G05 局部防护和目标/分层提示完成。Project 顶层归一化读损失、直接 API duplicate 接受、有限 project graph 保持；UI 防护不覆盖其它全项目 editor/Agent，不能恢复已丢字段。EntryPoints 没有独立 registry/repository/revision/完整 Used By 图，未建立平行 authority。

**本轮 B1 Worlds 映射完成，未改产品/未替换展示。** 完整 World/root/revision/snapshot 字段与原模式/动作/Source/draft/baseRevision/handler/authority 已映射。World 有 core.world/WorldRepo/graph；项目内 snapshot 为 project-source，Library root/不可变修订/CAS、installed 原版只读、Session 当前 state 分层保持。未知 World 顶层严格拒绝；schema/baseline/metadata 内部任意 JSON 保留。binding ID 不是 immutable binding revision pin；三种 Fork 的依赖复制范围不同，不自动 latest。

Worlds G01–G06（本轮均未修复）：非空集合 Source/身份名称metadata可达性、Fields `||=` 默认改写与 null/root 校验差额、Project duplicate/local-dependency overlap/index 歧义、409 原文复制/明确丢弃重载缺口、catalog 整体失败锁住 Source/无 dispose 防护、有限 graph/binding pin/Fork 区别。下一展示门 N01–N08 在 worlds-mapping，不能称为已通过。

## Pending / next target

**已按用户“映射完成后停止”停在 B1 Worlds mapping。** 下一独立 checkpoint 只实施 Worlds 展示与映射中的局部防护，复用原 editor/controller/project.save/Library 服务，并验证共用 editor 的 Library 裸 revision-content 回归。先真实 Git/远端 → 本 HANDOFF → index → worlds-mapping → delivery/coverage S12/S07 与 Worlds baseline/states/validation → 同一 Record B1 Worlds mapping。Worlds 展示、Knowledge/B2/F 尚未开始，不自动连跑、不合并 main。

首轮支持范围冻结，不声称 S00–S20 全字段/设备/引擎矩阵通过。外部 MySQL/Postgres、真机/软键盘/中文 IME/WebView/Android、远端模型、完整 native@3 lease/nonce/任意作品故障组合仍未测。没有旧高级 scope/Actor/绑定/注入自动映射、整站迁移或历史批量改写。新表面保留原结构化字段和完整 Source 能力。

## Key decisions / carry forward

D01–D20/P01–P06 不重开。原资源/请求/Session/task authority 保持，exact ref/contentHash 不自动 latest；default/资源编辑不隐式推进 Session，legacy-unbound 不回填；管理备注只在账户库。

FS withTransaction 无整批 rollback。Persona root publishedRevisionIds 保持发布闭包；migration 要 durable preallocated IDs/plan digest/receipt，不用普通 create 重放。部分失败保留已发布成果；回退通过 archive 保持已使用 snapshot。迁移只取认证 Persona namespace 与受限头像目录，保留原文/unknown/未映射 pending，默认独立 CAS/adoption receipt。

Save v3 snapshot/session/resume 与旧 v1/v2 保持。跨账户恢复独立快照不自动认领个人库/default。账户 backup schema 1 Persona manifest 保持所有 revision/avatar/receipt/hash，原 native manifest/blob/staging/snapshot/rollback/runner 继续负责。按 exact IDs 合入并保留目标库/头像，冲突 review，不按名字静默合并；默认保留目标，显式 CAS adopt 才改变，缺 manifest/归档默认不能 adoption。

Native AUTO(0)/DISABLED(-1) Enter 换行，Ctrl/Cmd+Enter 发送；ENABLED(1) 直接 Enter；Shift/Alt/IME/229 不发送，legacy AUTO 不改。未接受草稿只恢复原 Session/基准；已接受输入不重发；生成期间 Stop 可用。

Host solo picker 走原白名单/epoch/revision/宿主 guards；Full root 故障时独立恢复可达。作品无个人库 CRUD；Shared Host seat-required，席位选择走 Shared controls，observer/pending retry 拒绝。normal Bridge epoch/nonce authority 未重写。

## Actual local validation

本轮 Worlds mapping：**7 个不同 suites / 26 个不同 unit passed，40 个临时 canonical assertions passed**，命令与范围见 [Record B1 Worlds mapping](records/refactor/atria-immersive-workspace.md#stage-b1-worlds--mapping-checkpoint)。World Fields/Source/refs/catalog retry、World history diff、Attach exact/explicit Update、strict World/Revision/Package contract、FS/SQLite immutable/CAS/并发基准、Workspace detach/离开取消/同草稿与 receipt、Shared accepted lane 局部验证。probe 确认 nested clone/缺失/null/root/unknown/legacy/pin/未声明 refs 与 Project duplicate/overlap 接受、Package duplicate 拒绝等现状；不是展示无损门通过。

docs whitespace/链接锚点/路由/显式源码测试路径检查通过；产品 tracked 文件未改。本轮没有新 browser/全量 tests/build/缓存构建/远端 CI、Android/真机/WebView/软键盘/中文 IME、外部 DB/远端模型。EntryPoints display 历史仍为 10 suites/45 unit、2 Chromium 场景；既有 Session/Save/opening/语言窄屏证据保留，不重跑或累加为本轮结果。完整字段/设备/引擎矩阵未验收。

## Preserve / do not repeat

真实本地工作树没有前轮记录所述 tracked dirty；产品 AGENTS/docs Governance/templates 未改。package 的 dist/node_modules/tests、产品依赖目录与旧日志等原 untracked 保持，不提交/删除。package 与远端一致；docs fast-forward 12 commits，产品独立工作树检出同一远端 task branch。plugin/skills/reference 未改/未读，不 main merge 到独立长期空间。不要重复 A1–A5 或 Actors/EntryPoints/Worlds 映射；不恢复旧共享 global Persona，不重新开启共享描述。

## New-chat bootstrap prompt

按 HANDOFF 继续 Atria 的 refactor/atria-immersive-workspace，先真实 Git/远端 → docs:HANDOFF.md → plans/refactor/atria-immersive-workspace/index.md → worlds-mapping.md → delivery/coverage S12/S07 与 Worlds baseline/states/validation → 同一 Record B1 Worlds mapping。产品 `f40bca67b56eb42c0b4340d8ca9dfc44f848101a` 保持；Actors/EntryPoints 映射展示、Worlds 映射已完成，本轮按用户要求停在映射后。下一 checkpoint 只实施 B1 Worlds 展示与 G01–G06 局部防护，按 N01–N08 最小本地验证，完成后停止，不进入 Knowledge/B2/F。复用原 World editor 单草稿/project.save/human Workspace/ChangeSet 与 Library immutable revision/CAS/persistence；区分项目 snapshot、Library、installed 原版只读、Session state，验证共用 editor 的 Library 裸 content；不新增 authority、不自动 latest、不伪造修订或深复制 binding。Shared description 仍 shared_scope_unsupported，无 opt-in/solo 回退/Actor/席位自动映射。不重做历史，保护原 dirty/untracked；不发起/等待远端 CI，沿用同一分支/Record/live HANDOFF，不合并 main、不删除活跃分支。完整设备/外部数据库/远端模型/字段矩阵仍未验收。
