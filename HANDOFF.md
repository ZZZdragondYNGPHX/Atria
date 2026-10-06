# Live HANDOFF — Agent Intelligence Runtime

## Task

- Task ID: `agent-intelligence-runtime`；Primary Workspace: `main`。
- Product branch / HEAD: `feat/agent-intelligence-runtime@caf662842941d3261dc1840242278f5529db10af`；已 commit / push，origin 同 HEAD，产品 worktree 干净。
- Stable main: `ed1fd90521a63363e29856601abbf5e908c99d10`，本地 / origin 保持；未合并本任务。
- Auxiliary docs: `docs`；S05 start HEAD `a2cf80b1d418d895e2c0ee9565128ab661dba65a`；仅提交本任务九个文档，保护原治理 / 模板 dirty。当前 docs HEAD 以包含本 Record / HANDOFF 的实际提交为准。
- Current stage: **D0–D4 / S01–S05 完成；本轮仅 S05 实现 / 验证 / 记录后停止，下一正式阶段 S06 未开始**。
- Plan entrypoint: [index](plans/architecture/agent-intelligence-runtime/index.md) → [decisions](plans/architecture/agent-intelligence-runtime/decisions.md)。
- S06 read first: [s01-baseline](plans/architecture/agent-intelligence-runtime/s01-baseline.md) / [m1-evolution](plans/architecture/agent-intelligence-runtime/m1-evolution.md) / [s02-sources](plans/architecture/agent-intelligence-runtime/s02-sources.md) / [s03-capture](plans/architecture/agent-intelligence-runtime/s03-capture.md) / [s04-project-recovery](plans/architecture/agent-intelligence-runtime/s04-project-recovery.md) / [s05-feedback](plans/architecture/agent-intelligence-runtime/s05-feedback.md) / [delivery S06](plans/architecture/agent-intelligence-runtime/delivery.md) / [baseline](plans/architecture/agent-intelligence-runtime/baseline.md) 的隔离与相关 authority → 同一 [Record](records/refactor/agent-intelligence-runtime.md)。
- S05 code: `src/native/agent-intelligence/experience-{repository,service}.js` → `src/endpoints/native-generation.js`；原 evidence / task repository 与 ProjectAgentService 删除路径；`tests/agent-intelligence/feedback.test.js` / README。
- S06 code starting points: `tests/agent-intelligence/{cases,runner,adapters,budget,project-fixture}.js` / baseline.mjs，原 Studio Workspace / simulation / preview、Session / Generation Host / TaskScheduler；只复核隔离执行需要的代码。

## Completed

- D0–D2：RP / Project 并重、Skill / Prompt / 原编排参数、逐 scope 局部自动与 owner 有限预算、新建默认审阅、M1 完整后集成已确认。
- D3：Reasoning Continuity 唯一详细权威是 [model-routing §7](plans/architecture/agent-intelligence-runtime/model-routing.md#7-reasoning-continuity执行状态与生命周期)，opaque execution 非 Memory / Experience payload；G01–G06 未实施。
- D4：Execution Reuse validity proof / 原 authority / Trust Domain；Segment / canonical compiler、Adaptive Invocation、三层 cache capability / locality 已整合企划，A–F 映射既有 G 阶段 / 后续 Local PoC，40 阶段身份 / 依赖保持。只企划，不读作 S06 新依赖。
- S01：12 cases、scripted runner、strict Report / sidecar / 有限 pilot ledger；真实模型 bridge / exact configuration 缺失，empiricalReady=false。
- S02：双域只读 adapter、严格 owner / scope / exact refs / hash、有限 EvidenceSet / Evaluation；current 仅本次原 authority 观察，消费继续重验。
- S03：bounded RP metadata、Director exact saved output binding、Native request / attempt / receipt、StorageEngine `atri_agent_evidence` marker / CAS；capture failure 不重做已正式写入 effect。legacy / capsule-only / 未绑定正文明确 incomplete，usage missing 不为零。
- S04：durable Project task / attempts / public conversation / Review，Studio Git exact Workspace / base / validation receipt。保存或响应失败 reconcile 同一 OID；缺 receipt 回 Review / conflict，不自动 generation / rebase / Commit；正式写入前检查 completed / recovery 容量。
- S05：StorageEngine additive `atri_agent_experience`，authenticated owner + hash(scope, Host subject) ledger；explicit / client observation / Host technical outcome / user hypothesis 分层。target 返回原 authority hash / subject，regenerate 不推断负偏好；correct / withdraw / delete 与独立 diagnosis 撤回 / 删除、metadata export、source invalidation、retention 均有实际 HTTP consumer。
- S05 feedback / diagnosis 默认 30 天，可选 1–365 天，缩短收紧期限、延长不复活；消费过滤 / writable reconcile，read-only 不持久写。显式 bounded source sweep 清旧 evidence / terminal task，保留 active / Review / pending commit、原 Project source / Git receipt。来源失效后阻止消费、删除清相关内容，跨资源失败按当前 authority 重新核验。
- Reflection 只返回事件 / 聚合 batch 与 exact dependency；一个 regenerate 或同 source 重复不就绪，弱观察不能确定改进方向；相同 batch diagnosis 去重，modelCalls=0。没有新后台循环、AI diagnosis、publication 或新自动权限。

## Pending

- 下一正式阶段仅 **S06**：双入口隔离执行与 baseline / candidate 比较。先冻结 case / split / fixture revision、exact execution envelope、原 Workspace / Session 副本 authority、工具模拟与 production effect 禁止、确定性 outcome / judge 分歧 / usage 缺失与有限预算，再实施。
- S01 真实模型基线仍缺有限 pilot configuration / exact route 与 standalone existing-generation bridge；六 readiness slots 按 budget_blocked / unavailable 区分，empiricalReady=false。S06 / S10 晋升前补独立 baseline，不能用结构 / metadata / scripted success 替代实测。
- 既有 README Model pilot and budget：复用原 preview/count、reservation、response observation；双入口 development pilot 各三次，独立 promotion split 不用于提炼。未获 exact configuration 不能发现 Secret、选择付费 route 或调用模型。
- S06–S34 / G01–G06 未实施；M1 尚不完整，不合并 main、不删除本组分支。新反馈 UI、AI job / candidate / report / promotion、自动 policy 与回滚消费由后续阶段交付，不注册未来空资源。

## Key decisions / limits

- 用户已确认 RP / Project 并重、三类候选、逐 scope 局部自动、新建默认审阅、共享 owner 有限预算与 M1 完整后集成；勿重问。
- 当前 source hash 不授予读取 / mutation / publication；technical completion 不证明行为质量；unknown usage 不计零。D3 / D4 研究不授权付费 probe / prewarm、connection / privacy 或新自动权限。
- S05 ledger：512 KiB / 256 feedback / 64 diagnoses；超限拒绝。group subject 保守按 exact message 隔离，Native subject 只能从仍可核验的 output / receipt 解析；跨账户 restore 的 sources.owner 须重新捕获。
- Source retention 是显式 scope sweep（1–365 天、每批 1–128 项），未完成 task / Review / pending Commit 保留；没有 app-closed timer。原 storage 可能先全量加载 native kind 列表，batch limit 不保证扫描 IO 上限。
- FS 锁仅单 Host writer，没有跨资源事务；evidence / task cleanup failure 阻止后续删除，Project HTTP 原 authority 删除先完成，后续清理失败由 missing-source 消费收敛。暂时 unavailable 不永久推断失效；已观察并持久 stale 的来源恢复旧内容不会复活。未观察的瞬时修改无法从 hash 推断。
- S04 task：2 MiB / 1024 events / 128 attempts / messages；正式 receipt 查找仅当前 Git 历史 200 条、完整 proof 必须唯一。Git 与 task storage 无整体事务；旧 Map task 无 backfill，opaque provider state 不持久化。

## Validation

- S05 **5 relevant suites / 137 distinct tests passed**：feedback 33、capture 24、recovery 33、sources 43、Project HTTP 4。组合首轮 feedback 新 retention fixture 的规范化字段断言失败，修正后仅定向复核 feedback 最终 33 passed；重复不累加。
- FS / SQLite physical reopen、CAS / capacity / corrupt / unknown schema、owner / subject / Project、纠正 / 撤回 / 删除 / 独立 diagnosis 操作、read-only / retention、source cleanup failure、恢复旧 variant 不复活、dump / restore / generic roundtrip。MySQL / PostgreSQL 只做 kind / key contract，没有连接外部 DB。
- RP / Project 实际 authenticated HTTP target / submit / export、no-store / forgery / 409 / 503；Project 实际 Studio / Agent / Git validation、human revision / terminal cleanup 与 Review 保留；source sweep 注入并发新 update 后旧 integrity 删除拒绝。Native actor / branch / failure feedback 是 synthetic snapshot port，完整真实 authority 证据沿复核的原 suites，不宣称本轮新增真实 Native 端到端。
- 7 个触及生产 JS 与新测试 ESLint、product diff / staged diff check 通过。docs 九个任务文档 / 82 个链接 / 8 个 anchors、围栏 / 表格 / 40 阶段依赖 / HEAD / Record 历史 / dirty hash 与 diff 检查通过。
- S04 历史 9 suites / 165 distinct tests、Chromium isolated panel fixture 1 Commit / 0 generations；S03 历史 8 suites / 200 distinct tests；本轮不重跑 browser。S01 scripted / 实测边界保持。
- 无 UI 代码改动，未执行 build、全量测试、browser / Android / 真机、远程 CI、真实模型 / judge / probe；没有质量或费用收益结论。复用已安装依赖，无 lockfile 变更，无用户数据 / Secret 读取。
- main AGENTS 与 docs README / WEB Adapter / 两模板既有 dirty 未暂存 / 提交，五个 hash 保持。其它 Experience 草稿 / reference 未读写，最终 refs / status 以真实 Git 为准。

## Next target / Do not repeat

真实 Git → 本 HANDOFF → index / decisions → S06-required modules → 同一 Record；沿用原分支，仅执行 S06。先冻结双入口隔离 / 比较契约与缺失路径，再实施和本地最小验证。
不重复全量研究、D0–D4 / S01–S05，不扫描全部 Plans / Records / Skills，不读写 reference 或其它 Experience 草稿；G / Local 模块不提前成为依赖。不凭旧 transcript、缓存 current、模型自述 success 或 pending marker 重做正式 mutation，不把 feedback / diagnosis 当配置 authority。
本轮完成 S05 后停止；下一轮明确续接才开始 S06。后续也按阶段 commit / push、更新同一 Record / HANDOFF 后停止，不提前合并 main。

## New-chat bootstrap prompt

读取 `docs:HANDOFF.md`，沿用 `feat/agent-intelligence-runtime@caf662842941d3261dc1840242278f5529db10af`，仅续接 S06。核对真实 Git → HANDOFF → index / decisions → s01-baseline / m1-evolution / s02-sources / s03-capture / s04-project-recovery / s05-feedback / delivery S06 / baseline 隔离与相关 authority → 同一 Record。D0–D4 / S01–S05 完成，main 保持 `ed1fd90521a63363e29856601abbf5e908c99d10`；S05 已交付 exact source / Host subject 的分层 feedback / technical outcome / diagnosis、纠正 / 撤回 / 删除 / 导出 / retention 与 reflection batch gate，5 suites / 137 distinct tests 通过，无模型调用或 UI 改动。先冻结 RP / Project 副本隔离、case split、exact execution envelope、工具模拟与 outcome / usage 缺失 / budget 契约；S01 empiricalReady=false，有限 pilot exact configuration / existing-generation bridge 尚缺，不发现 Secret、不选择付费 route、不用 scripted 替代实测。S04 receipt 恢复不自动 generation / rebase / Commit；D3 / D4 只企划，不重做研究或读未来 G 模块。保护既有 dirty 与 Experience 草稿，每阶段只在本地执行最小相关验证；commit / push、同一 Record / HANDOFF 后停止，不进入 S07，不合并 main。
