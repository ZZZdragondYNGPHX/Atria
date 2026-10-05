# Atria Immersive Workspace — Live Handoff

## Task

- Task ID: `refactor/atria-immersive-workspace`
- Primary Workspace: `main`（产品）；docs 为文档辅助空间。
- Product branch / HEAD: `refactor/atria-immersive-workspace` / `f40bca67b56eb42c0b4340d8ca9dfc44f848101a`；已 commit/push，未合并 main。
- Docs branch: `docs`；本轮 Record/HANDOFF 持久化提交以真实 Git HEAD 为准，不自引用 hash。
- Current stage: **B1 EntryPoints display checkpoint complete — stopped before Worlds mapping**。
- Plan entrypoint: [index](plans/refactor/atria-immersive-workspace/index.md)
- Next required modules: delivery、coverage S12/S07 和 baseline 的 Worlds 小节、states、validation；entrypoints-mapping 仅在关联需要时读，不重做 Actors/EntryPoints。
- Record: [record](records/refactor/atria-immersive-workspace.md)，续接重点读 B1 EntryPoints display；历史阶段保留。

## Completed

D1/P01–P06、A1–A5 首轮 checkpoint 和 B1 Actors mapping/display 保持，支持范围冻结。B1 EntryPoints 映射与展示完成：专属身份/名称/三类 exact 引用/可移除 primary/初始 overlay 和 timeline/六类高级 JSON 与 Source 共用原 value editor 草稿；空/非空集合 Source 始终可达，exact entryPointId 选择/修改/排序/树高亮，Review 前拒绝 unknown/legacy/duplicate/悬空引用，409 原文复制与明确丢弃重载、提交禁写和 receipt 只读重试完成。复用原 project.save/项目 revision/human Workspace/ChangeSet/controller，Agent Commit 独立。

真实 FS/HTTP/磁盘项目与 .atria container 的 canonical EntryPoint 往返相同；作者同 packageId 修改不推进已有 installed exact Session 和 Save package/closure。真实 Preview 默认第一入口、scenario 显式入口与 opening 验证；Experience/UI 明示第一入口，chooser 不联动动作。Source 任意 JSON 与 Session object/array/primary/message/protected metadata 消费者分层保持；World-less/单/多 World 启动、原 projection/envelope opening 已有最小本地证据。Shared 描述仍 `shared_scope_unsupported`，没有重新开启。

G01/G04 展示缺口关闭；G02/G03/G05 局部防护和目标/分层提示完成。Project 顶层归一化读损失、直接 API duplicate 接受、有限 project graph 保持；UI 防护不覆盖其它全项目 editor/Agent，不能恢复已丢字段。EntryPoints 没有独立 registry/repository/revision/完整 Used By 图，未建立平行 authority。

## Pending / next target

**已按用户“完成该 checkpoint 后停止”停在 B1 EntryPoints 展示完成处。** 下一独立 checkpoint 先做 B1 Worlds 字段/动作/状态/authority 映射，不自动替换展示。先真实 Git/远端 → 本 HANDOFF → index → delivery/coverage S12/S07 与 Worlds baseline/states/validation → 同一 Record B1 EntryPoints display；只按关联需要读 EntryPoints/Actors 映射。Worlds/Knowledge/B2/F 尚未开始，不自动连跑，不合并 main。

首轮支持范围冻结，不声称 S00–S20 全字段/设备/引擎矩阵通过。外部 MySQL/Postgres、真机/软键盘/中文 IME/WebView/Android、远端模型、完整 native@3 lease/nonce/任意作品故障组合仍未测。没有旧高级 scope/Actor/绑定/注入自动映射、整站迁移或历史批量改写。新表面保留原结构化字段和完整 Source 能力。

## Key decisions / carry forward

D01–D20/P01–P06 不重开。原资源/请求/Session/task authority 保持，exact ref/contentHash 不自动 latest；default/资源编辑不隐式推进 Session，legacy-unbound 不回填；管理备注只在账户库。

FS withTransaction 无整批 rollback。Persona root publishedRevisionIds 保持发布闭包；migration 要 durable preallocated IDs/plan digest/receipt，不用普通 create 重放。部分失败保留已发布成果；回退通过 archive 保持已使用 snapshot。迁移只取认证 Persona namespace 与受限头像目录，保留原文/unknown/未映射 pending，默认独立 CAS/adoption receipt。

Save v3 snapshot/session/resume 与旧 v1/v2 保持。跨账户恢复独立快照不自动认领个人库/default。账户 backup schema 1 Persona manifest 保持所有 revision/avatar/receipt/hash，原 native manifest/blob/staging/snapshot/rollback/runner 继续负责。按 exact IDs 合入并保留目标库/头像，冲突 review，不按名字静默合并；默认保留目标，显式 CAS adopt 才改变，缺 manifest/归档默认不能 adoption。

Native AUTO(0)/DISABLED(-1) Enter 换行，Ctrl/Cmd+Enter 发送；ENABLED(1) 直接 Enter；Shift/Alt/IME/229 不发送，legacy AUTO 不改。未接受草稿只恢复原 Session/基准；已接受输入不重发；生成期间 Stop 可用。

Host solo picker 走原白名单/epoch/revision/宿主 guards；Full root 故障时独立恢复可达。作品无个人库 CRUD；Shared Host seat-required，席位选择走 Shared controls，observer/pending retry 拒绝。normal Bridge epoch/nonce authority 未重写。

## Actual local validation

本轮 EntryPoints display：**10 个不同 suites / 45 个不同 unit passed、2 个不同 Chromium 场景 passed**，重复复验不累加；具体命令、失败修正、最后局部复验和 gate 范围见 [Record B1 EntryPoints display](records/refactor/atria-immersive-workspace.md#stage-b1-entrypoints--display-checkpoint)。触及 JS ESLint、English/zh-cn localization、产品/docs whitespace/链接/路由/证据路径检查通过。

覆盖完整高级 JSON/Source/canonical、三类 refs/primary、集合增删排序/空及重复修复、exact ID 和显式 ID 提交恢复、Review/Cancel/Apply/非法 Source/409复制与取消确认重载、receipt 不重放、原 human/Agent/service rollback/Shared 阻断。FS 真实 Session world-less/单/多 World overlay/message metadata/default/shape/protected rejection；原 projection/envelope opening 在 FS/SQLite 验证。Chromium English 1440 与中文 320→720、font_scale=1.5/light/Fast UI/reduced-motion/Tab/Shift+Tab、真实 FS/HTTP/项目文件/.atria decrypt、Preview第一入口与 scenario exact opening、旧 Session/Save 不推进；四类截图本地查看。

未执行全量 tests/全产品 bundle/前端缓存 build/远端 CI、Android/真机/WebView/软键盘/中文 IME、外部 DB/远端模型。browser 项目为零 Actor/World/Binding 的叙事作品；依赖/primary 由 unit 与真实 Session 的局部证据验证，不冒充所有真实依赖/Frontend/Game 组合。跨 owner/Back 继续复用原 guard，未声称新完整 UI 矩阵。Actors/A5 历史不与本轮数量累加，也未重跑它们的完整证据。

## Preserve / do not repeat

产品 AGENTS.md，以及 docs README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md 原 dirty changes 保持未提交。package/plugin/skills/reference 未改/未读，不 main merge 到独立长期空间。不要重复 A1–A5 或 Actors/EntryPoints；不恢复旧共享 global Persona，不重新开启共享描述。

## New-chat bootstrap prompt

按 HANDOFF 继续 Atria 的 refactor/atria-immersive-workspace，先核对真实 Git/远端 → docs:HANDOFF.md → plans/refactor/atria-immersive-workspace/index.md → delivery/coverage S12/S07 与 Worlds baseline/states/validation → 同一 Record B1 EntryPoints display。产品 `f40bca67b56eb42c0b4340d8ca9dfc44f848101a` 已 push；Actors/EntryPoints 映射与展示已完成，本轮按用户要求停止。下一 checkpoint 只做 B1 Worlds 字段/动作/模式/Source/draft/revision/handler/authority/错误冲突离开/测试门映射，完成映射后停止，不自动替换或进入 Knowledge/B2/F。复用现有服务与 persistence，EntryPoints 的 project-owned/无独立 registry/归一化/duplicate/有限 graph/分层启动与第一入口默认边界保持；Shared description 仍 shared_scope_unsupported，无 opt-in/solo 回退/Actor 或席位自动映射。每阶段只做最小本地相关验证，不发起/等待远端 CI；保护原 dirty changes。沿用同一分支和 Record/live HANDOFF，不合并 main、不删除活跃分支。完整设备/外部数据库/远端模型/字段矩阵仍未验收。
