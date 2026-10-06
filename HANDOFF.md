# Live HANDOFF — Agent Intelligence Runtime

## Task

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`。
- Current product branch / HEAD: `feat/agent-intelligence-runtime@78acfb65da6b1afa1dee1c2f35482af215832c74`；已 commit / push，与 origin 同 HEAD，产品 worktree 干净。
- Stable main / baseline: `main@ed1fd90521a63363e29856601abbf5e908c99d10`；本地 / origin 一致，未合并本任务。
- Auxiliary documentation: `docs`；S03 start docs `379f0d70228491bd71220caa6e30424e4cfbfa60`，期间并发 D3 整合为 `ebdc6f6a5b50964247dd3db7a4e918ede53d711a`。最终 push 前并发 `aa4d2d2fe` 新增独立研究文档，合并保留但未读取 / 修改正文。当前 docs HEAD 以包含本 HANDOFF / Record 的实际提交为准。
- Current stage: **D0 / D1 / D2 / D3 / S01 / S02 / S03 完成；本轮仅 S03 完成后停止；下一正式阶段 S04 未开始**。
- Plan entrypoint: [plans/architecture/agent-intelligence-runtime/index.md](plans/architecture/agent-intelligence-runtime/index.md)。
- S04-required modules: index → [decisions](plans/architecture/agent-intelligence-runtime/decisions.md) → [s02-sources](plans/architecture/agent-intelligence-runtime/s02-sources.md) / [s03-capture](plans/architecture/agent-intelligence-runtime/s03-capture.md) / [m1-evolution](plans/architecture/agent-intelligence-runtime/m1-evolution.md) / [delivery 的 S04](plans/architecture/agent-intelligence-runtime/delivery.md) → [baseline](plans/architecture/agent-intelligence-runtime/baseline.md) 的 Project / authority / storage → Record；先细化 Project task durable schema / attempts / timeline / recovery，仅复核相关代码。
- S03 product entrypoint: `src/native/agent-intelligence/{evidence-repository,host-capture,rp-capture-service}.js` → `src/endpoints/native-generation.js` / `src/native/adapters/generation-host.js`；`public/scripts/agents/orchestrator/evidence-capture.js` / run-state 与 shared trace；`tests/agent-intelligence/capture.test.js` / README。
- S02 entrypoint: `src/native/agent-intelligence/{contracts,source-adapters,evidence-service}.js` / AgentEvidenceService；sources.test.js。
- S01 reference: [s01-baseline](plans/architecture/agent-intelligence-runtime/s01-baseline.md)；产品 `tests/agent-intelligence/` cases / report / runner / adapters / budget 与 README。
- Record: [records/refactor/agent-intelligence-runtime.md](records/refactor/agent-intelligence-runtime.md)。

## Completed

- D0 / D1 / D2：双入口成长、局部自动默认与语义 / Context / Compute / Routing 设计保持；不重复全量研究。
- D3：Reasoning Continuity 已整合；唯一详细权威为 [model-routing §7](plans/architecture/agent-intelligence-runtime/model-routing.md#7-reasoning-continuity执行状态与生命周期)，architecture / behavior-context / compute-policy 引用，delivery 映射 G01–G06。保留完整研究与 D3 Record；本轮未实现 opaque checkpoint 或 probe。
- S01 test-only：12 cases、双入口 scripted runner、strict Trial / Report / sidecar v1、有限 pilot ledger；真实模型缺失，empiricalReady=false。
- S02：严格 EvidenceSet / Evaluation v1、owner / scope / exact refs / hash、生产只读双域 adapter 与有限展开 consumer；普通 chat / Native 分域，原 Artifact grant / Studio authority 保持。
- S03：bounded metadata trace、RP Runtime / Director bridge 与 Native Host run / child / effect / request / attempt / lane 关联；原 StorageEngine 新 additive `atri_agent_evidence`，先保存 marker、prefix / sequence / CAS 校验；authenticated begin / update / inspect / delete consumer。
- Director 输出仅绑定原 chat 已保存且服务端重验的 exact message / floor / variant / content hash。Native Turn 绑定正式 receipt 与 active variant；standalone background / maintenance task 只绑定原 receipt metadata，不展开 operation artifact。capture failure 不重做已正式提交 effect，重启 marker 明确 incomplete。
- 三种 provider parser 保留 stream / nonstream 直接可见 usage；缺失不为零，不推断缺失 total / 费用。浏览器 host_facade 与 Native provider_send scope 区分。
- S03 product commit / push、同一 Record / Plan / live HANDOFF 已刷新，main 未变化。

## Pending

- 下一产品阶段仅 **S04**：现有 ProjectAgentService task / attempts / timeline 持久化、Studio validation / Review / formal changeset 关联、Host / browser restart recovery、stale base conflict、receipt 幂等；先细化 schema / keys / compatibility / migration / failure 后实施。
- S03 capsule-only / 其它未绑定正文模式、legacy 无 source ID 或未保存输出保留 incomplete；不存在完整上游 retry / raw transcript / 行为收益证明。S05 retention / feedback / lesson 级联删除尚未实施。
- S04–S34 / G01–G06 未实施；M1 不完整，不合并 main 或清理本组分支。S06 / S10 比较 / 预算 / 晋升阈值按阶段细化。
- S01 真实模型基线仍缺明确有限 pilot / exact configuration 与 standalone existing-generation bridge。六 readiness slots：无有限参数 budget_blocked，有预算但无 bridge unavailable；empiricalReady=false。
- 补测入口为 `tests/agent-intelligence/README.md` 的 Model pilot and budget：连接既有 RP / Studio preview/count + reservation + response observation，再跑双入口各三次 development trials；S06 比较前补独立 promotion baseline。不能用 scripted / 来源 / metadata 测试代替真实效果门槛。

## Key decisions

RP / Project 并重；Skill / Prompt / 既有编排参数三类候选；逐角色 / Project 开启局部自动，新建默认审阅；共享 owner 有限预算；M1 完整交付后集成 main。用户已确认，勿重问。

D3 U10 / A10–A15 保持：continuation 是可选执行状态，非 Memory / World / Experience payload，详细 lineage / path compatibility / loss 规则见 model-routing §7；研究示例 schema / Provider 支持未冻结，S03 不提前承担 M8 opaque checkpoint。

Evidence hash 固定内容关系，不授予读取 / mutation / publication。Evaluation current 是本次原 authority 读取观察，消费前继续重验；metadata captured 不证明完整 upstream 或真实质量 / 费用达标。S02 source bytes / message scans 预算不覆盖原 authority 全量 storage IO / Artifact dependency scanner；Studio getRevision 可沿原 authority 同步 human edit。

公共 evidence 是可删除 metadata resource，不是第二个 task / World / Project authority。FS 锁仅单 Host writer，跨账户 restore 的嵌入 S02 source owner 需要重新捕获。未知 usage 不为零，scripted success 不是真实效果；研究 / alias / gateway 名称不当作实测能力。

## Validation

- S03：累计 **8 relevant suites / 200 distinct tests passed**；最后最终内容两套 capture / Native P3 复核 **64 passed / 20 skipped**。命令与分组计数详见 Record，不是全量测试。
- 真实临时 FS / SQLite evidence reopen / CAS / corruption / read-only / list / backup / restore / generic roundtrip；实际 Runtime / facade / Director bridge、实际 Host / scheduler / SessionCore 与隔离本地 HTTP / Response；transport failure、save/bind race、正式写入后 capture failure 与幂等重放均覆盖。无生产用户数据与模型请求。
- 首次外部 MySQL / PostgreSQL 测试因本机服务不可用 ECONNREFUSED 失败；最终 20 DB cases 明确 skipped，仅检查 generic registry / key，不声称真实 DB 通过。
- Committed / Tested product HEAD: `78acfb65da6b1afa1dee1c2f35482af215832c74`。触及生产 JS 的 ESLint、product diff / staged diff check 通过；docs 仅本任务本地链接 / anchors / 围栏 / 表格 / 状态 / HEAD / 前序历史 / dirty hash / diff 最小检查。
- S02 历史：3 suites / 60 tests；S01 历史：52 新增 / 79 既有，scripted 12 trials / 24 generation calls / 36 tool calls / 44 deterministic checks；behavior 14 维 not_run，usage missing，external calls=0，empiricalReady=false。本轮不重复 runner。
- D3 历史：9 个文档、59 links / 9 anchors，研究及前序 Record 保留，40 阶段身份 / 依赖保持。本轮只追加 S03，未重复研究。
- 未执行 build、真实 browser / UI、Android / 真机、真实模型 / judge / probe 或远程 CI。捕获状态在 run metadata / API 可检查，未改 panel UI，不声明视觉验证。
- main AGENTS 与 docs README / WEB Adapter / 两模板既有 dirty 未暂存 / 提交；整理记录前后 hash 一致。其它 Experience 草稿 / reference 未读写。最终 refs / status 以实际 Git 为准。

## Next target / Read first

核对真实 Git（main、同一 task branch、docs、dirty）→ 本 HANDOFF → index → decisions / s02-sources / s03-capture / m1-evolution / delivery S04 / baseline Project 与 storage → 同一 Record。
继续 `feat/agent-intelligence-runtime`，仅 S04；先细化 Project task / attempts / timeline durable recovery 与原 Studio receipt 的幂等 / conflict 边界，再实施和本地最小验证。commit / push、更新同一 Record / HANDOFF 后停止，不自动进入 S05，不合并 main。

## Do not repeat

- 不重复全量研究、D2 / D3、已完成 S01–S03，不扫描全部 Plans / Records / Skills，不读写未授权 reference。
- 不覆盖 main AGENTS、docs 治理 / 模板 dirty 或其它 worktree Experience 草稿；不建立第二份 Record / live HANDOFF。
- 不把 S02 current、S03 hash / metadata 或 S01 scripted / budget ledger 当真实模型效果或自动发布授权。
- 不从 client owner、raw model result、自述 success、旧 revision、前端 transcript 或缓存 current 推断 authority；不从 pending marker 自动重做正式写入。
- 不因局部预算参数存在而发现 Secret、选择付费 route、调用模型、改 connection / privacy、production shadow 或安装 local target。

## New-chat bootstrap prompt

读取 `docs:HANDOFF.md`，沿用 `feat/agent-intelligence-runtime@78acfb65da6b1afa1dee1c2f35482af215832c74`，仅执行 S04。先核对真实 Git → HANDOFF → index / decisions → s02-sources / s03-capture / m1-evolution / delivery S04 / baseline Project 与 storage → 同一 Record。D0 / D1 / D2 / D3 / S01 / S02 / S03 完成；main 保持 `ed1fd90521a63363e29856601abbf5e908c99d10`，不重建分支。S03 公共 bounded EvidenceRecord / RP capture / Native receipt 与 authenticated consumer 已交付，累计 200 个不同本地 tests 通过、20 外部 DB cases skipped；不把 metadata 当完整 raw trace / 行为收益。Project task durable recovery 尚未实施，先沿 ProjectAgentService / Studio authority / StorageEngine 细化 schema / attempts / timeline / restart / conflict / receipt 幂等，再实现；不从前端文本重做 commit。S01 empiricalReady=false，真实基线 S06 / S10 前仍须补；D3 opaque continuation 留在 G01–G06。保护既有 dirty 和 Experience 草稿，本地最小相关验证、commit / push、更新同一 Record / HANDOFF 后停止，不提前 S05，不合并 main。
