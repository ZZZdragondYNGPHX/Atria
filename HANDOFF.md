# Atria Immersive Workspace — Live Handoff

- Task ID: `refactor/atria-immersive-workspace`
- Primary Workspace: `main`（产品），docs 辅助；package 不承载产品实现。
- Product branch / tested HEAD: `refactor/atria-immersive-workspace` / `f0584c157`，已 push，未合并 main。
- Docs branch: `docs`，提交以真实 Git 为准。
- Current stage: B1 四类 mapping/display 完成；正在 B2 Prompt/Runtime/检索 mapping。
- Plan: [index](plans/refactor/atria-immersive-workspace/index.md) → delivery、coverage S07/S12、Knowledge baseline、states、validation → Knowledge mapping。
- Record: [同一 Record](records/refactor/atria-immersive-workspace.md#stage-b1-worlds--display-checkpoint)。历史阶段不重做。

## Authorization and next target

用户明确要求“不需要每隔一个阶段就停下汇报……一直做到彻底完成，推送合并为止”，覆盖默认阶段停止规则。逐类完成映射→实现→本地验证→commit/push→同一 Record/live HANDOFF，简短说明后继续 Knowledge → B2 Prompt/Runtime/检索 → B3 Agents/Memory → B4 UI/Assets/Skills/Plugins/官方插图 → F。最终才合并 main、验证 main、删除短期分支和 live HANDOFF。不发起/等待远端 CI；不可用外部矩阵如实保留限制。

## Completed and carry forward

D1/P01–P06、A1–A5 首轮与 B1 Actors/EntryPoints/Worlds 映射和展示完成。World 专属身份/名称/schema/baseline/metadata/refs 与 Source 同草稿、集合 Source/exact ID 选择/排序/树定位、Review 防丢失/歧义/引用、409 原文复制和明确丢弃重载、catalog 局部失败/dispose 防护完成。Library 裸 content 回归、真实 FS/HTTP/.atria/Simulation/旧 Session/Save 与中文窄屏证据见 Record：8 suites/35 不同 unit、2 Chrome 场景，截图已查看；lint/localization/whitespace 通过。

复用原 project.save→human Workspace inspect/execute ChangeSet，Agent Commit 独立。Library immutable revision/CAS、project-source Git revision、installed immutable snapshot、Session state 分层。exact refs/contentHash 不自动 latest；binding ID 不冒充 immutable binding revision；三种 Fork 差异和有限 graph 保持。不建立平行 authority，不自动迁移 legacy Actor/Persona/席位。

**Shared description 保持 `shared_scope_unsupported`，没有开启、opt-in/solo 回退或 Actor/席位自动映射。** Persona/default 修改不推进已有 Session；legacy-unbound 不回填。FS withTransaction 无整批 rollback、publishedRevisionIds 发布闭包、迁移 durable IDs/receipt/default 独立 CAS、Save v1–v3 与账户备份契约保持，历史只按需要读取。

## Limits and preservation

首轮支持范围冻结。全字段/设备/引擎矩阵、Android/真机/WebView/软键盘/中文 IME、外部 MySQL/Postgres、远端模型和完整 native@3 故障组合未验证，不伪称通过。全产品编辑器保留结构化与 Source，不静默归一化删除 unknown；后端原契约不支持者明确拒绝。

package 与 origin/package 一致；docs/product 原 tracked clean。package dist/node_modules/tests、产品 node_modules-shared 和 p7 旧日志等 untracked 保持，勿提交/删除。不修改 Governance/AGENTS、不 main merge 到独立长期分支，不读取 plugin/skills/reference。

## New-chat bootstrap prompt

继续 Atria refactor/atria-immersive-workspace：先真实 Git/远端 → 此 HANDOFF → Plan index → 当前 B2 模块 → Record 最近 checkpoint。Worlds 已完成，不重做；用户已授权连续剩余 B/F 并最终推送合并，不按阶段停止。先 B2 字段/模式/动作/草稿/authority 映射，再展示与 canonical/状态/browser 验证。原服务/修订/exact refs 与 Shared 描述停用保持；保护 dirty/untracked。逐类 commit/push 和更新同一 Record/HANDOFF，最终 F 后才合并 main、验证和清理。缺环境如实记录，不声称完整矩阵通过。

Knowledge f0584c157 已完成，8 suites/50不同unit、2Chrome场景；真实FS/HTTP/.atria/旧Session/Save、中文窄屏/冲突通过，见Record最新Knowledge小节。勿重做B1；当前B2重点检查Prompt默认改写/模块隐式排序、Runtime完整Source与检索provider切换草稿。
