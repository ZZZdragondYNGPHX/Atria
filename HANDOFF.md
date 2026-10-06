# Live HANDOFF — Agent Intelligence Runtime

## Task

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`。
- Current product branch / HEAD: `feat/agent-intelligence-runtime@172a0c281334c36c56273a24d19922ad4d5e5c35`；已 commit / push，与 origin 同 HEAD，产品 worktree 干净。
- Stable main / baseline: `main@ed1fd90521a63363e29856601abbf5e908c99d10`；本地 / origin 一致，未合并本任务。
- Auxiliary documentation: `docs`；S04 start docs `119f5a720a69a1a86a46605cc6497d1221619aeb`，已包含 D0–D4 / S01–S03；本轮只提交八个任务文档，保护原治理 / 模板 dirty。当前 docs HEAD 以包含本 HANDOFF / Record 的实际提交为准。
- Current stage: **D0 / D1 / D2 / D3 / D4 / S01 / S02 / S03 / S04 完成；本轮仅 S04 实现 / 验证 / 记录后停止；下一正式阶段 S05 未开始**。
- Plan entrypoint: [plans/architecture/agent-intelligence-runtime/index.md](plans/architecture/agent-intelligence-runtime/index.md)。
- S05-required modules: index → [decisions](plans/architecture/agent-intelligence-runtime/decisions.md) → [m1-evolution](plans/architecture/agent-intelligence-runtime/m1-evolution.md) / [s02-sources](plans/architecture/agent-intelligence-runtime/s02-sources.md) / [s03-capture](plans/architecture/agent-intelligence-runtime/s03-capture.md) / [s04-project-recovery](plans/architecture/agent-intelligence-runtime/s04-project-recovery.md) / [delivery 的 S05](plans/architecture/agent-intelligence-runtime/delivery.md) → [baseline](plans/architecture/agent-intelligence-runtime/baseline.md) 的 storage / 相关 source authority → Record；先细化反馈分层、scope、纠正 / 删除 / 导出、retention 与来源失效，仅复核相关代码。
- S04 product entrypoint: `src/native/agent-intelligence/project-task-repository.js` / `src/native/project-agent.js` → `src/native/authoring/studio-service.js` / `src/git/client.js` / `src/native/adapters/generation-host.js` → `src/endpoints/native-studio.js` / `public/scripts/native/studio-agent.js` / `public/shared/project-agent-conversation.js`；`tests/agent-intelligence/project-recovery.test.js` / README。
- S03 product entrypoint: `src/native/agent-intelligence/{evidence-repository,host-capture,rp-capture-service}.js` → `src/endpoints/native-generation.js` / `src/native/adapters/generation-host.js`；`public/scripts/agents/orchestrator/evidence-capture.js` / run-state 与 shared trace；`tests/agent-intelligence/capture.test.js` / README。
- S02 entrypoint: `src/native/agent-intelligence/{contracts,source-adapters,evidence-service}.js` / AgentEvidenceService；sources.test.js。
- S01 reference: [s01-baseline](plans/architecture/agent-intelligence-runtime/s01-baseline.md)；产品 `tests/agent-intelligence/` cases / report / runner / adapters / budget 与 README。
- Record: [records/refactor/agent-intelligence-runtime.md](records/refactor/agent-intelligence-runtime.md)。

## Completed

- D0 / D1 / D2：双入口成长、局部自动默认与语义 / Context / Compute / Routing 设计保持；不重复全量研究。
- D3：Reasoning Continuity 已整合；唯一详细权威为 [model-routing §7](plans/architecture/agent-intelligence-runtime/model-routing.md#7-reasoning-continuity执行状态与生命周期)，architecture / behavior-context / compute-policy 引用，delivery 映射 G01–G06。保留完整研究与 D3 Record；本轮未实现 opaque checkpoint 或 probe。
- D4：全文读取 Execution Reuse 研究并参考 Reasoning Continuity；新增 [execution-reuse](plans/architecture/agent-intelligence-runtime/execution-reuse.md) 管理 validity proof / shared dependencies / Tool / Plan / Trust Domain，behavior-context §3.1 / §4 管理 Segment / canonical compiler，compute-policy §1.1 管理 Invocation 阶梯，model-routing §8 管理 cache capability / locality / observations。§7 详细规则原样保留，A–F 映射既有 G 阶段 / 后续 Local PoC，40 个正式阶段与依赖保持；仅企划，无新产品能力。
- S01 test-only：12 cases、双入口 scripted runner、strict Trial / Report / sidecar v1、有限 pilot ledger；真实模型缺失，empiricalReady=false。
- S02：严格 EvidenceSet / Evaluation v1、owner / scope / exact refs / hash、生产只读双域 adapter 与有限展开 consumer；普通 chat / Native 分域，原 Artifact grant / Studio authority 保持。
- S03：bounded metadata trace、RP Runtime / Director bridge 与 Native Host run / child / effect / request / attempt / lane 关联；原 StorageEngine 新 additive `atri_agent_evidence`，先保存 marker、prefix / sequence / CAS 校验；authenticated begin / update / inspect / delete consumer。
- Director 输出仅绑定原 chat 已保存且服务端重验的 exact message / floor / variant / content hash。Native Turn 绑定正式 receipt 与 active variant；standalone background / maintenance task 只绑定原 receipt metadata，不展开 operation artifact。capture failure 不重做已正式提交 effect，重启 marker 明确 incomplete。
- 三种 provider parser 保留 stream / nonstream 直接可见 usage；缺失不为零，不推断缺失 total / 费用。浏览器 host_facade 与 Native provider_send scope 区分。
- S04：原 ProjectAgentService 保存 durable v1 task / plan / proposals / Workspace / validation / Review / timeline / attempts / public conversation / commit intent；authenticated handle + Project + task key、资源锁 / sequence / integrity CAS，沿原 StorageEngine。新客户端实际 Host request / send / snapshot / direct usage 与 client observation 分开。
- Studio 正式 Git commit 包含 exact Workspace / base / validation receipt，no-op 也有 receipt。task 保存失败、响应丢失或重复 Commit 只 reconcile 同一正式 OID；写入前检查 complete / recovery record 容量，不足恢复 source。无 receipt 回 Review 或 conflict，stale base 不自动重放 / rebase；重启不自动调用模型或 Commit。
- 浏览器恢复公开 conversation / Review / recovery 提示；当前 task authority 驱动显式 Continue，opaque provider state 不入库。completed save failure 后重读正式结果、Project 刷新一次；task / Project HTTP 删除沿原资源路径。S02 异步读取持久 task，完成历史在 human edit 后仍不能当 current。
- S04 commits `ca0769e53` / `172a0c281` 已 push；同一 Record / Plan / live HANDOFF 已更新，前序历史 / dirty 与 main 保留。本轮到 S04 停止。

## Pending

- 下一产品阶段仅 **S05**：显式反馈、弱观察、技术 outcome 与诊断分层；RP / Project / owner scope、纠正 / 撤回 / 删除 / 导出 / retention 与 source invalidation。先冻结资源 schema / keys、兼容、级联与容量策略再实施；regenerate 不自动代表负偏好，reflection 按事件 / 聚合触发。
- S03 capsule-only / 其它未绑定正文模式、legacy 无 source ID 或未保存输出保留 incomplete；不存在完整上游 retry / raw transcript / 行为收益证明。S05 retention / feedback / lesson 级联删除尚未实施。
- S05–S34 / G01–G06 未实施；通用 Reuse Contract consumer、Context cache compiler、Provider cache / prewarm 与 Adaptive Invocation 尚未交付，Local KV / decode 待另定有限 PoC。M1 不完整，不合并 main 或清理本组分支。S06 / S10 比较 / 预算 / 晋升阈值按阶段细化。
- S01 真实模型基线仍缺明确有限 pilot / exact configuration 与 standalone existing-generation bridge。六 readiness slots：无有限参数 budget_blocked，有预算但无 bridge unavailable；empiricalReady=false。
- 补测入口为 `tests/agent-intelligence/README.md` 的 Model pilot and budget：连接既有 RP / Studio preview/count + reservation + response observation，再跑双入口各三次 development trials；S06 比较前补独立 promotion baseline。不能用 scripted / 来源 / metadata 测试代替真实效果门槛。

## Key decisions

RP / Project 并重；Skill / Prompt / 既有编排参数三类候选；逐角色 / Project 开启局部自动，新建默认审阅；共享 owner 有限预算；M1 完整交付后集成 main。用户已确认，勿重问。

D3 U10 / A10–A15 保持：continuation 是可选执行状态，非 Memory / World / Experience payload，详细 lineage / path compatibility / loss 规则见 model-routing §7；研究示例 schema / Provider 支持未冻结，S03 不提前承担 M8 opaque checkpoint。

D4 U11 / A16–A25：Reuse 必须证明当前有效，相似度只找候选；依赖级失效在原 authority 有完整证据时才跨无关 revision 使用；mutation 仍走原 effect / receipt，Plan 模板重绑定动态事实。RP 复用前置 intent 并 fresh-generate 正文；三层 cache capability / locality 先满足硬约束，requested Snapshot 与实际 Observation / estimated savings 分开。Reasoning Continuity 只引用 §7；Trust Domain 优先，默认禁止不受控跨用户 / Package KV。字段 / TTL / 路径矩阵 / 阈值 / prewarm 默认 / 真实收益按阶段细化，研究不授权付费请求或新自动权限。

Evidence hash 固定内容关系，不授予读取 / mutation / publication。Evaluation current 是本次原 authority 读取观察，消费前继续重验；metadata captured 不证明完整 upstream 或真实质量 / 费用达标。S02 source bytes / message scans 预算不覆盖原 authority 全量 storage IO / Artifact dependency scanner；Studio getRevision 可沿原 authority 同步 human edit。

公共 evidence 是可删除 metadata resource，不是第二个 task / World / Project authority。FS 锁仅单 Host writer，跨账户 restore 的嵌入 S02 source owner 需要重新捕获。未知 usage 不为零，scripted success 不是真实效果；研究 / alias / gateway 名称不当作实测能力。

S04 task 技术边界为 2 MiB JSON / 1024 events / 128 attempts / 128 public messages，超限明确拒绝；receipt 查找仅当前 Git 历史 200 条，必须唯一验证完整 proof。Project Git 与 task storage 没有整体事务；失败恢复依靠正式 receipt。旧内存 task 无 backfill、legacy 请求无 Host attempt 关联，旧 Preview 只作历史观察；S05 产品 retention 尚未实施。

## Validation

- S04：累计 **9 relevant suites / 165 distinct tests passed**；recovery 33、sources 43、Project 4、HTTP 4、panel 7、Studio 8、Git 8、bundled skills 7、baseline 51。最后容量修改复核 recovery / Studio / Project **45 passed**，重复执行不累加；命令与证据见 Record / README，不是全量测试。
- 真实临时 FS / SQLite task close / reopen、Review / completed / attempts / conversation、CAS / corruption / read-only / owner / Project / deletion / backup / restore / generic roundtrip；实际 builtin / system Git receipt、no-op、stale base、并发 Commit、正式写入后 save / response 故障、人类后续 edit、写入前容量拒绝。实际 Host 使用 synthetic provider response 检查 send / direct usage，capture failure 不重发；未连接外部 MySQL / PostgreSQL，只做 generic kind / key contract。
- 实际 Chromium 本地隔离 SQLite / Git / HTTP fixture 与真实 panel 通过：桌面 reload 恢复 conversation / Review、completed save failure 后 receipt reconcile / Project 刷新一次、移动端 completed / conflict 无溢出或 page error；**1 Commit / 0 generations**。仅该 panel fixture，不声称全应用 / Android / 真机验证。
- Committed / Tested product HEAD: `172a0c281334c36c56273a24d19922ad4d5e5c35`。触及 11 个生产 JS 的本地 ESLint、最终服务定向复核、product diff / staged diff check 通过；docs 八个任务文档的本地链接 / anchors / 围栏 / 表格 / 40 阶段依赖 / HEAD / 前序 Record / dirty hash / diff 检查通过。
- S03 历史：8 suites / 200 distinct tests；最后 64 passed / 20 external DB skipped，当时本地 DB 不可用，未当作真实 DB 通过。S02 历史：3 suites / 60 tests；S01 structural 历史与 scripted 12 trials / 24 generation calls / 36 tool calls / 44 deterministic checks 保持，behavior not_run、usage missing、empiricalReady=false。
- D3 / D4 历史详见同一 Record，本轮不重做研究；40 阶段身份 / 依赖及完整前序 Record 保留。
- 未执行 build、全量测试、Android / 真机、真实模型 / judge / probe 或远程 CI；没有模型效果或 reuse / cache 收益结论。复用已安装依赖，无 lockfile 变化，无生产用户数据 / Secret 读取。
- main AGENTS 与 docs README / WEB Adapter / 两模板既有 dirty 未暂存 / 提交，五个 hash 保持。其它 Experience 草稿 / reference 未读写。最终 refs / status 以实际 Git 为准。

## Next target / Read first

核对真实 Git（main、同一 task branch、docs、dirty）→ 本 HANDOFF → index → decisions / m1-evolution / s02-sources / s03-capture / s04-project-recovery / delivery S05 / baseline storage 与相关 source authority → 同一 Record。
继续 `feat/agent-intelligence-runtime`，仅 S05；先细化反馈分层 / scope、纠正 / 撤回 / 删除 / 导出 / retention、source invalidation、兼容与失败路径，再实施和本地最小验证。下一轮明确续接后才开始；commit / push、更新同一 Record / HANDOFF 后停止，不自动进入 S06，不合并 main。

## Do not repeat

- 不重复全量研究、D2 / D3、已完成 S01–S04，不扫描全部 Plans / Records / Skills，不读写未授权 reference。
- 不重做 D4；execution-reuse / Context / Invocation / cache locality 按 G 阶段读取，不变成 S05 依赖或已实现能力；Reasoning Continuity 唯一详细来源仍为 model-routing §7。
- 不覆盖 main AGENTS、docs 治理 / 模板 dirty 或其它 worktree Experience 草稿；不建立第二份 Record / live HANDOFF。
- 不把 S02 current、S03 hash / metadata 或 S01 scripted / budget ledger 当真实模型效果或自动发布授权。
- 不从 client owner、raw model result、自述 success、旧 revision、前端 transcript 或缓存 current 推断 authority；不从 pending marker 自动重做正式写入。
- 不因局部预算参数存在而发现 Secret、选择付费 route、调用模型、改 connection / privacy、production shadow 或安装 local target。

## New-chat bootstrap prompt

读取 `docs:HANDOFF.md`，沿用 `feat/agent-intelligence-runtime@172a0c281334c36c56273a24d19922ad4d5e5c35`，仅执行 S05。先核对真实 Git → HANDOFF → index / decisions → m1-evolution / s02-sources / s03-capture / s04-project-recovery / delivery S05 / baseline storage 与相关 source authority → 同一 Record。D0 / D1 / D2 / D3 / D4 / S01 / S02 / S03 / S04 完成；main 保持 `ed1fd90521a63363e29856601abbf5e908c99d10`，不重建分支。S03 公共 EvidenceRecord / bounded RP capture 与 S04 durable Project task / attempts / public conversation / 正式 Studio Git receipt recovery 已交付；缺 receipt 回 Review 或 conflict，不自动 generation / rebase / Commit；技术容量与历史 proof 界限见 s04-project-recovery。S04 累计 9 suites / 165 distinct tests 与真实 Chromium 本地 panel fixture 通过，没有真实模型 / 全应用 / 设备结论。先细化显式反馈、弱观察、技术 outcome、诊断、scope、纠正 / 撤回 / 删除 / 导出、retention 与 source invalidation 的 schema / keys / 兼容 / 失败路径，再实现；regenerate 不自动当负偏好，reflection 按事件 / 聚合触发。D4 仅企划，不读未来 G 模块或重做研究，Reasoning Continuity 仍唯一由 model-routing §7 管理。S01 empiricalReady=false，真实基线 S06 / S10 前仍须补；不发现 Secret 或选择付费 route。保护既有 dirty 和 Experience 草稿，本地最小相关验证、commit / push、更新同一 Record / HANDOFF 后停止，不提前 S06，不合并 main。
