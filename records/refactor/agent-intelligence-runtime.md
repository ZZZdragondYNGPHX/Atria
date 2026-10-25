# Agent Intelligence Runtime — Record

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

> 本文件保留实际工程与试验历史。旧配额、scope/claim、双模型、首失败停止、单轮/候选与数值门槛不恢复为执行规则；

> 本文旧预算、累计 1000、Step 次数、scope 许可、首失败停止等是历史事实，不能恢复为当前限制；当前交付读本文最新节。

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`
- Status: **M1 complete / H0 preparation complete；后续交付组计划保留**
- Plan: [正式架构与阶段入口](../../plans/architecture/agent-intelligence-runtime/index.md)
- Updated: 2026-10-10

## Summary

Project开发三胜、独立九胜；两域完整费用绑定、native review发布、下一真实请求精确消费和guarded rollback均通过。main `ea75b76be4927e881de2f0be7c304a56301f1f83`；原生产自动发布规则、历史不利结果和unknown费用保留。H0八样本/519来源、隔离调用图和观测清单已准备，B0及H1/H2未运行。

以下按时间保留工程和试验历史；其中旧pending、暂停、许可和数值门槛不是当前执行状态。

## D1 — 讨论与首批方案冻结

- Start docs HEAD: `1676b21e19a0bbf97ff57caeb5f520801cf8eb00`。
- End / inspected product HEAD: `ed1fd90521a63363e29856601abbf5e908c99d10`；本轮 fetch 后仍与 origin/main 一致。
- End docs HEAD: 包含本阶段记录的提交。
- Status: **Complete — M1 boundary frozen / S01 Ready**。
- Confirmed: RP 与 Project Agent 并重；首批 Skill / Prompt / 编排参数成长闭环包含有预算 / 回滚约束的局部自动启用；M1 完整交付后合并 main，再从最新 main 推进下一组，各正式阶段仍停止。
- 局部自动默认方式： 按角色 / Project 单独开启局部自动，并设置统一预算；新建对象默认审阅。
- Frozen: [M1 设计](../../plans/architecture/agent-intelligence-runtime/m1-evolution.md) 的 scope、预算必需性、精确版本生效、publish / recovery / rollback 约束；
- Engineering detail: 默认值以外的 case / report 字段为本轮工程细化；没有声称用户逐字段批准。
- Deferred: S02 资源 / source 契约，S05 retention，S06 / S10 的真实费用和晋升门槛在对应阶段前定稿。缺少参数或证据时不允许自动发布。
- Decision authority: [decisions.md](../../plans/architecture/agent-intelligence-runtime/decisions.md)。
- 无机器专属路径、围栏配对。
- Compatibility: S01 是 test-only cases / report / runner，无产品数据迁移；保护已有未提交 Experience 草稿。
- Next checkpoint: **S01**。阶段结束更新同一 Record / live HANDOFF 并停止，不合并 main。
- Implementation: 尚未开始；本阶段不表示 S02–S34 的所有技术细则 Approved。

## D2 — 三份研究综合更新正式企划

- Request: 先拉取远端 → 读现有 Agent Intelligence Runtime Plan → 读三份研究 → 综合更新正式架构企划；
- Start / source docs HEAD: `40ce08a32`；本轮 docs 工作树 fast-forward 8 提交。main pull 显示已是最新。
- End / inspected product HEAD: `ed1fd90521a63363e29856601abbf5e908c99d10`；没有产品修改。
- Auxiliary branch: `feat/agent-intelligence-architecture-update`，从最新 origin/docs 创建独立 worktree，文档集成目标为 docs，绝不将 docs 合入 main。
- End docs HEAD: 包含本阶段记录的实际提交；与集成后的 origin/docs 对齐。
- Status: **Complete — D2 architecture revised / S01 Ready**。

### Completed / decisions

- 按顺序读取 live HANDOFF、现有 Plan / Record、三份完整研究报告；原研究和 D0 结论按既有模块引用，不重复全量调研。
- 增加 behavior-context、compute-policy、model-routing，分别作为语义 / 编译、稀疏计算 / 预算、部署目标 / 路由 / gateway 的详细权威。
- 普通 RP 以一次主要正文调用为目标；额外 cognition / critic / rollout / specialist 有证据与预算。一次共享事件 pass 分别受控采纳，Memory / Experience 尽量事件 / 批处理。
- 保留现有 Native 实际 send 计数事实，沿 RunControl / Host / Scheduler 补跨入口费用与 reservation，不另建执行 / authority。
- Target 与 Model Identity 分开，价格 / capability / health 是有来源与 freshness 的 evidence；policy 请求时求解，独立 FailurePolicy，exact request 与 response observation 分开。
- New API / Sub2API / OpenRouter / LiteLLM / opaque / local 为正式场景；上游身份、费用与内部 retry 未知时不猜测。别名 / 网关的 audit 可重复性不冒充响应逐字重放。
- 保留 S01–S34 身份，增加 M8 G01–G06，共 40 个候选实施阶段；M1 不依赖新组，M3 前交付共享基础，S25 / S26 普通路径不强制依赖 World Model。
- M1 已确认范围 / 默认 / 集成方式不变；S01 仍为 12 cases / v1 / test-only，测量补充不注册产品资源。
- 明确 U9 授权的企划更新与新增工程判断，不伪装新增 schema、阈值、价格、自动 routing / shadow 权限为用户批准。

### Protection / limitations / next checkpoint

- main 的 AGENTS.md 与原 docs 工作树 README / WEB Adapter / 两模板既有 dirty changes 原样保留，未暂存 / 提交；未修改任何 reference 或其它资产工作空间。
- 不覆盖其它工作树的 Experience 草稿，不建立第二份 Record / live HANDOFF。D0 / D1 历史保持。
- 新架构仍需各阶段 schema / 迁移 / provider 支持矩阵与真实质量—成本数据；研究中的统计数字不形成 Atria SLO。
- 本轮文档持久化并集成 / push docs 后停止；下一正式阶段仅 **S01**。

## S01 — 双入口基线与 Eval cases

- Request: 读取 live HANDOFF，仅执行 S01；
- Start / stable main HEAD: `ed1fd90521a63363e29856601abbf5e908c99d10`；fetch origin/main / docs 后确认未变化。
- Start docs HEAD: `924ca4369dd3cb8405664eaa51e4574638987a4c`。
- Product branch / End HEAD: `feat/agent-intelligence-runtime@0a41023ef6689b8b80ca64ffdd5cda72838897fe`；已 push，origin 同 HEAD。
- End docs HEAD: 包含本阶段记录 / live HANDOFF 的实际提交；只暂存本任务文件并 push origin/docs。
- Status: **Complete — S01 structural/scripted baseline；empiricalReady=false**。允许进入 S02；S06 / S10 前真实证据仍是必需 checkpoint。

### Completed / implementation

- Cases 为虚构固定输入；promotion 与 development 内容不同，extraction consumer 拒绝 promotion。case / report / sidecar 未知 schema、revision 漂移、未知 / 重复 refs、mixed modes / adapter / HEAD / repeated-case config 均拒绝。
- RP 实际走 `runMainAgentLoop` → 当前 Director Engine / AgentRuntime → per-run tools → message takeover。本轮应用的自由文本行为未评分。
- Project 实际走 `runNativeStudioAgentTask` → existing generation / studio clients → 隔离 fetch bridge → `ProjectAgentService` / `StudioService`。model 阶段停在 Review；fixture reviewer 单独 commit。正常 authoring 单一 changeset、重复 commit 拒绝；human revision 冲突保留 human 内容和 pinned base；
- 复用 `makeTempFsEngine`；恢复 fetch / Atria / presentation evidence。没有读取生产对象、聊天、Secret 或 reference。
- 缺失保留分母，未知 usage 不伪装为零 tokens。采集错误保留 failed/incomplete trial，不静默丢弃；serializer / IO 错误明确失败。
- scripted transport 在请求前限制六次；未安装生产 RunControl policy。
- callIndex 不冒充 upstream attempt。target、真实 upstream、root / child / attempt、TTFT、token subdivisions、价格逐项 missing。

### Findings / limitations / next checkpoint

- 本地首轮发现并修正：取消 completion 的 AbortError 应作为案例中的预期终态；跨 VM 普通 JSON 对象须正确识别；采集失败 trial 也必须列出配置缺失。相关新增 tests 最终通过；8 个既有入口 suite 无相关失败。
- 这个环境没有明确有限 live pilot 与 configured standalone existing-generation bridge；model command 是 readiness report，不会因为只有预算参数而发送付费请求。runner 没有新建模型 executor，未发现 / 读取 Secret。补测入口和预算接线说明为 `feat/agent-intelligence-runtime:tests/agent-intelligence/README.md` 的 Model pilot and budget。
- 后续在现有 RP / Studio generation 请求边界连接 preview/count + reservation + response observation，明确有限 pilot / exact configuration，再补 RP agency / Project authoring 各三次 development trials；完整独立 promotion baseline 在 S06 比较前补齐。没有真实 evidence 不满足 S06 / S10 或 M1 完成条件。
- 当前不提供可靠 durable capture / Project task 恢复、自动 publication、Goal / cognition、精确 Skill history 或 G 阶段能力；缺口进入后续既有阶段，不在 S01 提前实现。
- 未创建第二份 Record / HANDOFF。
- 细化最小来源契约后实施，仅当前阶段结束停止。继续同一产品分支，不合并 main；M1 完整交付后再集成。

## S02 — 来源 / 引用 / 有效性最小契约

- Request: 读取 live HANDOFF，沿用现有任务分支，仅执行 S02；
- Start product HEAD: `0a41023ef6689b8b80ca64ffdd5cda72838897fe`；现有 product worktree 干净。
- Stable main HEAD: `ed1fd90521a63363e29856601abbf5e908c99d10`；fetch origin/main / docs / task branch 后确认 refs 一致，未集成本组。
- Start docs HEAD: `65f305ccf45d5500cd6a9d3aa7ded08ec45240dd`。
- Product branch / End / Tested HEAD: `feat/agent-intelligence-runtime@072a15d8d5b51117d0c5442e48e345475a274b66`；已 push，origin 同 HEAD。
- End docs HEAD: 包含本阶段 Record / HANDOFF 的实际提交；仅暂存本任务文档并 push origin/docs。
- Status: **Complete — S02 read-only source contract / consumer**。下一阶段 S03 未执行。

### Completed / implementation

- 局部细化 [s02-sources.md](../../plans/architecture/agent-intelligence-runtime/s02-sources.md)，冻结现有 source key / anchor、严格 EvidenceSet v1、Evaluation 来源有效性结果、error / budget、无迁移边界。同步 index / m1-evolution / delivery 的状态与读取路由；用户既有产品选择不变。
- 测试 README 给出 Host 接入示例。
- Native 从 SessionCore 当前 HEAD 读取 active timeline variant，绑定 packageVersion / branch / revision。
- Review 不被解释为正式 commit；human edit、task update、takeover、删除与重启 Map 缺失均不能当 current，consumer 不改 task 状态。
- 失败保留每个 reference 的状态 / 分母，任一失败不返回整组正文。
- 正文为显式 expand；source IO / corruption 明确 unavailable，缺失为 missing。

### Compatibility / limitations / next checkpoint

- S02 没有新持久 kind / path、registry 修改或数据迁移；EvidenceSet / Evaluation 是生产只读 API 返回值，没有自动 runtime subscriber、HTTP / UI surface。新持久 EvidenceRecord key / 迁移在 S03 接入公共存储时冻结，Project task durable recovery 在 S04；S05 retention 未实施。
- `maxBytes` 计已准备正文，即使失败后不返回；metadata-only 不返回正文。原 authority 全量 chat / Session IO 与 Artifact 自身 dependency scanner 沿既有实现，不宣称被该展开预算限制。Evaluation 的 current 是本次来源读取观察，不能当完整运行轨迹、行为评分或晋升授权。
- Studio getRevision 沿既有 authority 同步 human edit 的历史；本 consumer 没有新的 source / task mutation 路径。撤回仅移除新增调用 / exports，无存储转换；旧运行不变。
- S01 `empiricalReady=false` 与真实模型 / usage 缺失仍保持；S06 / S10 前补有限 live pilot / exact bridge 和独立 promotion baseline，不以本阶段来源测试代替真实效果证据。
- 其它 worktree Experience 草稿未读写。未建第二份 Record / HANDOFF，未读取 reference。
- 下一正式阶段仅 **S03**：Git → HANDOFF → index / decisions → s02-sources / m1-evolution / delivery S03 / baseline RP 与存储接入 → 本 Record；细化可靠轨迹与公共持久层，沿原 result / storage authority 实施。继续同一任务分支，阶段记录后停止，不合并 main，不提前进入 S04。

## D3 — Reasoning Continuity 架构整合

- Request: 读取 `docs:plans/architecture/reasoning-continuity-research.md`，将已确认架构结论整合进当前企划；以既有正式术语消除重复，不整篇复制。
- Start docs HEAD: `2b40f3b943ff1a4f6ef811ce2f842d34f2e3e427`；原 docs 从 `379f0d702` fast-forward 两个研究提交后读取，完整研究保留原样。
- Auxiliary docs branch: `feat/reasoning-continuity-plan`；从 docs 创建隔离工作树，集成目标为 docs，不合并到 main。
- Observed product HEAD: `feat/agent-intelligence-runtime@072a15d8d5b51117d0c5442e48e345475a274b66`；stable main `ed1fd90521a63363e29856601abbf5e908c99d10`。与本轮文档成果分开。
- End docs HEAD: 包含本 D3 记录的实际提交，集成 / push 后以真实 docs refs 为准。
- Status: **Complete — D3 plan integration only**；不是 S03 或 G 阶段实施完成。

### Completed / decisions

- 读取 live HANDOFF → index → 对应架构 / Context / Compute / Routing / delivery / decisions 与同一 Record，再纳入指定研究的架构结论；未重新全量调研或读取 reference。
- model-routing §7 是 Reasoning Continuity 的唯一详细权威：可选执行能力、原生 envelope / canonical message 分离、opaque handle、adapter 原样映射、exact path / 方向性兼容与既有 Capability Evidence。
- Runtime 沿 task / run / attempt / branch / revision / message variant 管理 continue / fork / reset / discard；
- 发出前 Snapshot 与响应 Observation 分开；opaque payload 留在受控 checkpoint，Experience 只消费获准决定 / loss / usage；Memory / Cognition / World Truth 与显式 Task Artifact 不共享其缓存或导出规则。
- Context 提供最终 binding 指纹，压缩 / append-only 不能绕过 freshness / exposure；
- Runtime contracts → OpenAI Responses reference → Anthropic native → Gemini native → gateway probes → adaptive / eval 映射既有 G01–G06，保持 40 个正式阶段和 M1 范围；未新增 Runtime / Routing / Eval authority。
- U10 / A10–A15 记录用户整合请求与工程归并；示例 schema、模型版本 / 路径矩阵、TTL / 阈值、默认启用与实测收益仍按阶段深化。研究数字 / gateway 声明不冒充 Atria 已测支持。

### Next checkpoint

下一产品 checkpoint 仍为 **S03**；S03 不承接 M8 opaque payload 保存；其新增能力在 G01–G06 局部细化 / 交付后才供后续阶段消费。

## S03 — RP 可靠轨迹与持久证据

- Request: 读取 live HANDOFF，沿用现有任务分支，仅执行 S03；
- Start product HEAD: `072a15d8d5b51117d0c5442e48e345475a274b66`；同一任务 worktree 初始干净。
- Stable main HEAD: `ed1fd90521a63363e29856601abbf5e908c99d10`；fetch 后本地 / origin 未变化，未合并本任务。
- Start docs HEAD: `379f0d70228491bd71220caa6e30424e4cfbfa60`；本轮期间并发 D3 文档整合后为 `ebdc6f6a5b50964247dd3db7a4e918ede53d711a`。S03 记录基于该实际 docs HEAD 追加。
- Product branch / End / Tested HEAD: `feat/agent-intelligence-runtime@78acfb65da6b1afa1dee1c2f35482af215832c74`；已 push，origin 同 HEAD。
- End docs HEAD: 包含本 S03 Record / live HANDOFF 的实际提交；仅暂存本任务七个文档并 push docs。
- Status: **Complete — S03 bounded RP capture / shared durable evidence**；停止。下一正式阶段 S04，未开始。

### Completed / implementation

- [s03-capture.md](../../plans/architecture/agent-intelligence-runtime/s03-capture.md) 定稿 EvidenceRecord v1 / key / CAS / migration / failure / exact output 边界；同步 index / m1-evolution / delivery / s02-sources 路由。S02 来源与读取 authority 原样复用。
- marker 先于执行写入，sequence 单调，prefix 不可重写，重复相同 update 幂等。未知 schema / origin / 额外 trusted 字段 / corruption 拒绝。
- 共享 trace 限 512 events / 262144 bytes，只保留 run / child / effect / request / attempt / lane / 状态与直接可见 usage；容量、冲突、缺失、transport 失败明确记录。没有 Prompt、工具参数 / 结果全文、raw model payload、credentials 或 opaque continuation。
- 浏览器 runtime / first-party facade 观察器与 run presentation 分开；source target 在首次异步前冻结，周期保存前缀，旧 run late event 不写新 run。Director bridge 返回 metadata trace 与原 turn anchor。GENERATION_ENDED / bind 顺序竞态已覆盖。
- Native Host 在原 scheduler / provider send / fallback-retry / SessionCore finalization 接入：并发相同请求共享 capture，operationId/effect、原 invocation、独立 root、request / attempt 可归因；后台 / maintenance 与 lifecycle parent 保留。已存在 receipt 的幂等请求不重做执行；失败后新执行保留独立旧 marker。
- standalone task outcome 仅绑定原 receipt metadata，不展开 / 消费 operation artifact，不建立第二条 World authority。正式写入后的 capture 失败返回独立 failed 状态，保留 pending marker，不重放正式 effect。
- authenticated `POST /api/native/generation/evidence/{begin,update,inspect,delete}` 复用原 router / persistence；inspect metadata-only，读中 current 不缓存为长期授权；删除走原资源 transaction。
- OpenAI-compatible / Anthropic / Gemini 的 stream / nonstream 保留 provider 直接报告的最终 usage。未报告为 missing；不将 subdivisions 求和、不推断缺失 total 或费用。浏览器 host_facade 与 Native provider_send 标记分开，不把 facade 重试当 upstream 完整尝试。

### Compatibility / limitations / next checkpoint

- Additive kind，无 backfill、无 SQL DDL / storage version 升级。复用既有 list / migration / backup / restore 和 deleteResource；FS 资源锁仅单 Host writer，不声称跨进程 CAS 原子。record owner 为 key，内嵌 S02 sources.owner 在跨账户恢复后仍须重新捕获。
- capsule-only / 其它未绑定正文模式、legacy 无 source ID 或未保存输出显式 incomplete；Director 完成只绑定同一已保存 variant。metadata captured 不证明完整 upstream retry、效果 / 费用达标或 publication 权限。scope 删除使 currentness 失效；lesson / feedback 级联与 retention 留待 S05。
- Project task durable state / recovery 未实施，仍由 S04 交付；Reasoning Continuity 不透明 payload 留在 M8 / G01–G06。M1 尚未完成，不合并 main、不删除本组任务分支。
- main AGENTS 与 docs README / WEB Adapter / 两模板既有 dirty 未暂存 / 提交；其它工作树 Experience 草稿 / reference 未读写；无第二份 Record / HANDOFF。并发 D3 与前序 Record 逐字保留。
- 下一正式阶段仅 **S04**：Git → HANDOFF → index / decisions → s02-sources / s03-capture / m1-evolution / delivery S04 / baseline Project 与存储 → 本 Record；沿同一分支细化 Project task / attempts / timeline / recovery，复用 Studio authority / receipt。本轮到 S03 记录 / push 停止。

## D4 — Execution Reuse / Cache Locality / Adaptive Invocation 企划整合

- Request: 读取指定 Execution Reuse 研究，整合已确认架构结论；参考 Reasoning Continuity，避免重复定义。
- Start docs HEAD: `1c2502dae8ac1bcb7a0bb1dfb1e18d9f01b984b8`；本轮开始时并发研究上传 / S03 文档整合使 refs 更新，按真实 Git 读取最新研究与 S03 状态，没有回退旧 HANDOFF。
- Source research commit: `aa4d2d2fe`；[Execution Reuse 报告](../../plans/architecture/execution-reuse-cache-locality-adaptive-invocation-research.md) 全文读取，[Reasoning Continuity 报告](../../plans/architecture/reasoning-continuity-research.md) 参考 cache / artifact / freshness 与归并边界；两份正文保留。
- Observed product HEAD: `feat/agent-intelligence-runtime@78acfb65da6b1afa1dee1c2f35482af215832c74`；stable main `ed1fd90521a63363e29856601abbf5e908c99d10`。本轮无产品代码修改。
- Auxiliary docs branch: `feat/execution-reuse-plan`；从上述 docs HEAD 建独立工作树，集成目标为 docs，保护原 docs 治理 / 模板 dirty；不将 main merge 进 docs。
- End docs HEAD: 包含本阶段记录 / live HANDOFF 的实际提交；commit / 集成 / push 后以真实 refs 为准。
- Status: **Complete — D4 plan integration only**；不是 S04 或 G 阶段实施完成。

### Completed / decisions

- 新增 [execution-reuse](../../plans/architecture/agent-intelligence-runtime/execution-reuse.md) 权威模块：Runtime 一级复用、storage 分离，Exact / Structural / Semantic 候选与 validity proof 分开；复用原 source / artifact / authority / grant / provenance，不建立平行状态系统。
- 契约对齐依赖、源域版本 / anchor、时间、权限 / Authority、purity / side effects、必要路径绑定与 Trust Domain；
- Tool / Artifact 保留 once / operation 与 effect / receipt 幂等；Plan / Workflow 复用结构模板并重绑定当前参数 / preconditions，Narrative Intent 是前置可选 artifact 职责，Final RP Prose 默认 fresh generation。
- behavior-context §3.1 / §4 管理稳定 Segment / Resource identity、canonical serialization、受语义与权限约束的 cache-aware layout / schema 按需加载；不为命中添加无关 padding 或保留 stale Context。
- compute-policy §1.1 管理规则 Adaptive Invocation 阶梯，按未满足需求选择 reuse / tool / retrieval / target / effort / fresh narration；
- model-routing §8 管理 Application / Provider / Inference 三层 capability、exact-path cache evidence、hard constraints 后的 locality / 有效成本，以及 Snapshot 的请求决定与 Observation 的实际 hit / usage；estimated savings / unknown 有来源，不猜 gateway upstream。
- model-routing §7 Reasoning Continuity 详细规则原样保留；其它模块只引用 Execution Continuation 边界，未重复定义普通 cache handle / lineage。
- 40 个正式阶段及原依赖保留，M1 / 下一 S04 不增加新研究依赖。
- U11 / A16–A25 与研究覆盖 / 读取路由、同一 Record / live HANDOFF 已更新；研究字段、支持表 / benchmark、阈值与新增自动权限不当作逐项批准。

### Limitations / next checkpoint

API / Schema / key、容量 / TTL、完整依赖覆盖、semantic threshold、有限工具 / 模板 / Provider 矩阵、prewarm 默认与数字 SLO 待相应阶段细化。论文数字与 cache hit 不等于 Atria 收益，S01 empiricalReady=false 保持。
下一产品 checkpoint 仍为 **S04**：读取 HANDOFF → index / decisions → s02-sources / s03-capture / m1-evolution / delivery S04 / baseline Project / storage → 本 Record，继续同一产品分支，细化 Project task / attempts / timeline / recovery 与 Studio receipt 幂等。D4 / G / Local 能力不提前实施；仅下一轮明确续接后开始 S04，本轮文档持久化 / push 后停止，不合并 main。

## S04 — Project 持久任务与轨迹

- Request: 读取 `docs:HANDOFF.md`，仅续接 S04；
- Start product HEAD: `78acfb65da6b1afa1dee1c2f35482af215832c74`；沿用 `feat/agent-intelligence-runtime`，初始 worktree 干净。
- Stable main HEAD: `ed1fd90521a63363e29856601abbf5e908c99d10`；本地 / origin 未变化，未合并本任务。
- Start docs HEAD: `119f5a720a69a1a86a46605cc6497d1221619aeb`；读取当前 HANDOFF / 相关 Plan / 同一 Record / 完整治理，保留 D0–D4 / S01–S03 历史与既有 dirty。
- Product commits: `ca0769e530decbdaf71227d3aca7573e4f4d5ea8` 持久任务 / receipt recovery；
- Product branch / End / Tested HEAD: `feat/agent-intelligence-runtime@172a0c281334c36c56273a24d19922ad4d5e5c35`；已 commit / push，origin 同 HEAD，产品 worktree 干净。
- End docs HEAD: 包含本 S04 Record / live HANDOFF 的实际提交；仅暂存本任务八个文档并 push docs。
- Status: **Complete — S04 durable Project task / attempts / conversation / receipt recovery**；停止。下一正式阶段 S05，未开始。

### Completed / implementation

- [s04-project-recovery.md](../../plans/architecture/agent-intelligence-runtime/s04-project-recovery.md) 定稿 schema / key / CAS、公开对话、Host attempts、容量、receipt / recovery / conflict、删除与兼容；同步 index / delivery / m1-evolution / s02-sources / s03-capture 路由。
- 原 ProjectAgentService 通过 ProjectTaskRepository 将 v1 task 写入新 additive `atri_project_agent_task`，key 为 authenticated handle + projectId + taskId。
- 读取 / mutation / context API 改为异步并沿同一资源锁排序，HTTP / generation context / S02 adapter 一并适配。原 Studio / Git 保持唯一 Project source 写入 authority。
- evaluation / commit 在执行前持久 started marker。新客户端 generation attempt 标为 client_observation；missing usage 为 null，不推断缺失 total / 费用；observation 保存失败返回独立 capture failed，不重发 generation。
- generation 的完整公开 conversation 按前缀保存；system / providerState / opaque state / 未知私有字段拒绝。unfinished round 保留完整旧前缀与已保存 proposals；
- builtin / system Git 可读取完整 commit / parents；resultingRevision 固定正式 receipt OID，不被紧随其后的 human edit 替换。
- 正式写入后 task 保存失败或响应丢失、并发 / 重复 Commit 都返回同一正式结果，无第二次 apply；Git 已提交后异常不 restore 旧 source。缺 receipt 且 base 未变回 Review，base 变化或证据不明确转 conflict，不自动 rebase / replay。
- 单 task 限 2 MiB JSON、1024 events、128 attempts / messages；超限明确失败。容量不足恢复 dry-run source，保留 Review，没有正式 receipt。中断 evaluation 转 repair / blocked，失效 Preview 不当作重开的会话。
- 原 panel 恢复 conversation / Review / recovery 说明；Commit 响应或 task 保存失败后重读 authority，completed 时刷新 Project 一次，回调错误不重复 Commit。task HTTP 路由 no-store；显式 task 删除、Project HTTP 删除及原 deleteUser / dump / restore 路径保持 owner / scope 隔离。

### Compatibility / limitations / next checkpoint

- Additive kind，无 SQL DDL / storage version 升级、无历史 task backfill。旧 Map task 无法凭空恢复，legacy generation 请求没有 Host attempt 关联；旧 opaque continuation 不持久化。task / conversation 只支持技术容量边界，S05 再交付 retention / feedback / lesson 撤回与级联。
- FS 排序只覆盖单 Host writer；Project Git 与 task storage 不声称整体事务。receipt 恢复受当前 Git 历史 200 条与唯一完整 proof 限制；缺证据保守 Review / conflict。missing Project 不释放 task evidence。
- 未合并 main，不删除本组 task branch，不提前实施 S05 / G 阶段、reuse / cache / invocation 或 Local backend。
- 下一正式阶段仅 **S05**：真实 Git → HANDOFF → index / decisions → m1-evolution / s02-sources / s03-capture / s04-project-recovery / delivery S05 / baseline storage 与相关 source authority → 本 Record；本轮到 S04 文档持久化 / push 停止。

## S05 — 反馈、诊断与作用域生命周期

- Request: 读取 `docs:HANDOFF.md`，仅续接 S05；
- Start product HEAD: `172a0c281334c36c56273a24d19922ad4d5e5c35`，同一 `feat/agent-intelligence-runtime` worktree 干净。
- Start docs HEAD: `a2cf80b1d418d895e2c0ee9565128ab661dba65a`；按当前 HANDOFF / index / decisions / M1 / S02–S04 / delivery S05 / baseline 相关 authority 与本 Record 续接，治理以 docs 已提交 README 为准。
- Stable main: `ed1fd90521a63363e29856601abbf5e908c99d10`，本地 / origin 保持；main AGENTS 与 docs 四个治理 / 模板 dirty 保留。
- Product commit / End / Tested HEAD: `caf662842941d3261dc1840242278f5529db10af`，已 push，origin 同 HEAD，产品 worktree 干净。
- End docs HEAD: 以包含本 S05 Record / live HANDOFF 的实际 docs 提交为准；仅暂存本任务九个文档。
- Status: **Complete — S05 scoped feedback / diagnosis lifecycle**；下一正式阶段 S06 未开始，不合并 main。

### Completed / engineering decisions

- 新增 [s05-feedback.md](../../plans/architecture/agent-intelligence-runtime/s05-feedback.md) 冻结 schema / key、subject / provenance、兼容、容量、reflection gate、retention / failure / delete / export；同步现有入口和 S02–S04 生命周期引用。这里的数值与 API 是本阶段工程细化，不伪称用户逐字段选择。
- 每 ledger 512 KiB / 256 feedback / 64 diagnoses，超限明确拒绝；无 DDL、存储版本升级或 backfill。
- 不复制正文、trace、公开 conversation、Workspace、private reasoning 或 provider state。单角色 chat 使用 charDir；group 用 exact message identity，不能凭显示名聚合角色；Native 从仍有效的 timeline actor / receipt entryPoint 解析，过期 Native 来源拒绝新建；Project 绑定 Project identity。
- 显式 correction / prefer / avoid 标为 user；regenerate / edit / abandon / accept / review_reject 标为 client_observation，empty note、不推断偏好；没有客户端提交 Host 结论的入口。
- 显式或 failure 事件可就绪；弱观察至少三个不同 execution source 才聚合，仍不证明独立质量样本、弱观察单独不能定向改进。同 batch diagnosis 去重，无模型请求 / 后台循环；未来调度与预算仍归现有 scheduler / authority。
- authenticated `/api/native/generation/experience/*` 是 RP / Project 共用实际 HTTP consumer，no-store。所有 mutation 需 expectedSequence；correct 固定 source、递增 feedback revision，相关 diagnosis stale；withdraw 停止消费；delete 物理清除相关 diagnosis 内容。diagnosis 也可独立撤回 / 删除，export 仅返回有限公开 note / metadata / applicability。
- 来源不存在时物理清除反馈与诊断；暂时 unavailable 阻止消费但不永久推断来源失效；read-only 用过滤 view、不持久写入。未被观察到的瞬时 source 变化不能从 metadata 推断出来。
- feedback / diagnosis 默认 30 天，可选 1–365 天；缩短收紧既有期限，延长不复活，writable reconcile / purge 清理、read-only 立即过滤。显式 `purgeSources` 按 scope / 1–365 天 / 每批 1–128 项清理旧 evidence 与 terminal completed / cancelled / taken_over tasks；active / Review / pending commit、Project source / 正式 Git receipt 保留。
- evidence / task 原删除路径先清 feedback / diagnosis；Project task 清理删除该 Project ledger。FS 无跨资源整体事务，清理失败阻止 evidence / task 删除；Project HTTP 原 authority 删除先完成，后续清理失败由 missing-source 消费收敛。没有 app-closed timer，source retention 是显式 sweep；native kind 列表 IO 不声称被删除 batch limit 限制。

### Limitations / next checkpoint

- FS 资源锁仅单 Host writer；未引入跨资源原子事务。原 authority / 存储列表可能全量 IO；retention 不在应用关闭时定时运行。新反馈 UI、AI diagnosis、隔离比较、候选 / report / promotion / 自动 mode 控制未提前交付；未来必须消费同一精确依赖与撤回规则。
- 删除 source / feedback 后未来消费者不得沿缓存 current 继续晋升；当前不存在 future lesson / candidate / report kinds，不预注册空资源。group subject 保守绑定单消息，Native stale source 不重新推断历史 actor；跨账户 restore 的 sources.owner 必须重新捕获。
- 下一正式阶段仅 **S06**：真实 Git → HANDOFF → index / decisions → s01-baseline / m1-evolution / s02-sources / s03-capture / s04-project-recovery / s05-feedback / delivery S06 / baseline 隔离与相关 authority → 本 Record；冻结双入口隔离执行 / 比较 envelope、独立 split、原 Workspace / Session 副本与确定性 outcome / usage 缺失路径。真实有限 pilot configuration / bridge 尚缺，不发现 Secret、不选择付费 route、不用 scripted 替代实测门槛。
- 本轮到 S05 commit / push、同一 Record / live HANDOFF 后停止；不开始 S06，不合并 main 或删除本组分支。

## S06 — 双入口隔离比较与有限真实模型接线

- Start product HEAD: `caf662842941d3261dc1840242278f5529db10af`。
- Start docs HEAD: `a6a40f62cf3ca7a9875674d48aeafa404ab4f2c2`。
- End / local tested implementation HEAD: `54c79cb8eea7d6ca5c7e5e4ff262fe0ca6666a64`；同一 `feat/agent-intelligence-runtime`，未合并 main。
- Actual tested HEAD: 最终六槽 pilot 为 `7d7708c1486c5b48b430eb2210e89768f4aabfb0`，完整 promotion comparison 为 `b5df610bdffd05d60ef3bc9bd6e62e7d9a164aa3`；初轮 dirty 实现报告分别 pin当时 HEAD / source bytes，不将未提交代码或后来HEAD混称实测身份。
- Status: **Complete — 隔离 evaluator / 真实基线与独立比较 checkpoint；候选晋升仍拒绝**。
- Plan: [S06](../../plans/architecture/agent-intelligence-runtime/s06-comparison.md)；Task ID / Primary Workspace 保持。

### Implementation / decisions

- `comparison.mjs` 是 test-only 本地 evaluator：原 12 cases / split，显式 split / 1–3 repeats，单一 synthetic RP Prompt / Project Skill / roundLimit target；baseline / candidate 各自私有 chat / Studio Workspace / Project task，不发布配置。原 per-run message editor、Director / Studio model loop、ProjectAgentService / StudioService / Git receipt 完整复用。
- pin 实际源码字节与 HEAD。每次 invocation / trial / request ID 独立，不共享可变状态；模型比较先持久化完整独立 baseline，随后跑 candidate。预算 / 执行失败保留所有槽位与缺失。
- Project 工具仅经 exact Project / task 的有限 GET / POST 接线；Commit / publication / foreign Project / DELETE / 网络和未知路径拒绝。fixture reviewer 只在模型 Review 后向临时副本 Commit / replay；模型不获正式生产写入权。
- RP 生成使用原 Director 与 synthetic task context，fixture 可见历史不是 Memory resolver。
- 原 Native Prompt persistence / immutable library / resolver / compiler / HTTP provider 接专用测试 connection；Project 接原 NativeGenerationHost 与隔离 Studio task。RP 多轮去除 Director presentation / reasoning metadata，保留 public tool pairing；单条 tool 与完整 Studio loop 的原 Host 接线有本地回归。真实 Project 读取结果被误当 task、repair seed 使用错误 tool 字段、显式分段 Skill read 被过窄路由拒绝先暴露失败；修复后 read / bounded Skill read / write / reset / Review 完整原 Host 测试通过。
- `live.mjs` 明确读取 Git 外的私有 connection，输出 / progress / 独立 baseline 新文件；ledger exclusive writer lock 与原子持久化在 send 前生效。`EvaluationBudget` 全流程累计 model / retry / fallback / grader、每 trial 最多六次普通 sends；未知 / 取消 / failed usage 保留预留，restore 不重置、过量实报记账并封锁后续发送。
- 初始建议 120 / 250000 / output 1024，实际 API hard cap 每日2000 / 20 RPM。持久 rate checkpoint / 3.15秒 admission 间隔不超过20RPM。初轮 timeout 60 秒，获知首字慢后改为 300 秒，不重置已发送计数。不提交凭证、headers、原始 provider body、报告或本地配置；私有 key 仅 send boundary 读取。
- Blind pair human observation 有 exact artifact / envelope binding 与每 pair ≤3 judges；分歧 awaiting_review。未运行行为评分不填零或通过；单次 blind model judge 已实现严格 typed observation / confidence / score / 实际共享 grader charge；不改写原 S01 behavior slots，human preference / 多 judge 分歧仍未观测，promotion thresholds 未定稿，不赋予 publication eligibility。可用原 Director scripted graph，仅此；其它等价 ablations unavailable。

### Real observations

测试模型为原配置的 OpenAI-compatible `gemini-3.8-flash`；初期与完成运行使用完整 generation endpoint。随后配置修正为 `/v1` base，最后一个提交只补 evaluator 的一次拼接与两种 base 变体回归；历史模型报告不改写。

| 保留报告（Git外 artifacts目录） | 实際 sends | tokens / 知识边界 | 执行观察 |
| --- | --- | --- | --- |
| `pilot.json` | 6 | 17650，预留上界 | 初轮60秒timeout / 接线失败，六槽失败，不补通过 |
| `pilot-slow-endpoint.json` | 8 | 18664，含未知预留 | 300秒等待，仅一个RP槽通过；其它接线 / transport失败 |
| `promotion-comparison.json` | 11 | 21285，partial / unknown保留 | 首轮比较暴露Project接线错误，全部12槽保留；不作候选合格证据 |
| `pilot-read-tools-fixed.json` | 16 | 44109，provider reported | RP三个 / Project一个通过，另两个Project受bounded Skill read接线限制；修复后重建明确运行 |
| `promotion-comparison-fixed.json` | 42 | 133569，reserved upper bound |取消旧variant仍保留usage预留|
| `model-judgments.json` | 6 | 5629，provider reported | 5 observed / 1 invalid_response（rp_variant），不补分或重发 |
| `pilot-final-code.json` | 18 | 57167，provider reported ||
| `supplementary-haiku-probe.json` | 1 | 1169预留，usage unknown | connect timeout，10547 ms，未收到响应 |
| `supplementary-haiku-probe-connect30.json` | 1 | 53，provider reported | HTTP200，4063 ms，有效编程文本响应；未执行代码 |
| `supplementary-haiku-probe-base.json` | 1 | 1169预留，usage unknown | `/v1` base经原provider发出正确生成路径，HTTP524 / 126139 ms；不再重试 |

全部实际发送 / grader / 取消 / 失败合计 **110 requests / 300464 tokens**，durable ledger `breached=false`；其中unknown按本地预留上界计入，不能把累计数称真实计费或精确provider总量。没有清账或退款。这不是新一轮可自动花费额度或网关实际每日剩余额度。测试回归的fake HTTP与scripted structural输出没有外部调用。

| --- | --- |
| pilot `c03cf7eae138bb770f79830350f3a2e5e238e255e41ba44d1c9938c11fae3577` | tested HEAD `7d7708c1486c5b48b430eb2210e89768f4aabfb0`；adapterRevision `3ee05e084125bb418602fa92900a7ee71c6bb7b4f944f20285988375ec0f97af` |
| comparison `caee10f7ff16c957ff8e3da85fe155042544eed27ad653e19b8886546b5e33dd` | tested HEAD `b5df610bdffd05d60ef3bc9bd6e62e7d9a164aa3`；evaluatorRevision `2cb0f2081886f2bedeac029ddf2b5a5b1cb97aa765ccb2b6b2fe6e07c8ced855` |
| judge `98bb43a7765b4114cfba895a1f7c6d71abb91ce05f034777b2b66901d559c1a9` | evaluatorRevision `57707d2808fc1b42a28e02cde89ef0ead188c1b1fb8e84026e7abfd52c16efc7`；|

真实baseline先于任何candidate完成并独立保存。唯一候选在读取promotion输出前冻结于 `candidate.json`，target=rpPrompt，内容为仅用可见更新facts的简短NPC回复、保留玩家决定、write_message后finalize；Project配置不变，仍独立运行完整六对。每个promotion输入 / side / actualrequest / tools / outcome / usage可追溯，不用development输出代替promotion结果。只做一次repetition，不声称统计稳定性。

Blind grader与被测Gemini相同：rp_agency tie（confidence .9）；rp_memory candidate（.8，promise 4 vs 3）；rp_variant invalid_response，无分数；Project三个tie（confidence 1，intent 4/4、conflict 3/3、repair 4/4）。这是五次model observations；无人类labels、无独立多judge分歧证据，malformed响应需审阅，不能证明稳定改善。原S01 behavior保留not_run；Comparison empiricalReady=false、JudgeReport promotion=ineligible，价格 / costDelta / latencyBenefit不可知。S06完成隔离执行与报告消费，不表示候选晋升、M1整体或自动启用完成。

第二个 `claude-haiku-4-5` 连接作为备用接入，未知RPM采用单请求串行至少10秒间隔、独立配置与receipt，三个探针不混进Gemini trials / scores。连接曾成功，最终base配置请求为524；不承诺站点稳定性或模型工具能力。首个失败保留，第二次用原已安装undici的30秒connect timeout，未安装依赖或改变lockfile；

本地Git config `atria.s06.connection` / `ledger` / `artifacts` / `limits` / `secondaryconnection`仅存Git外位置，不把值写入文档。两份private config mode600，Secret仅本地保留；公开报告不含credentials、headers、原始provider response body，所有输出新文件、共享writer lock已释放，rate checkpoint与账本保留。product / docs staged diff与两条实际key扫描通过。

### Remaining / next checkpoint

- **S06 完成；下一 checkpoint S07，本轮未开始。** 六槽真实基线 / 独立六对执行与 authority通过满足 S06 原入口 evaluator checkpoint；缺评分 / human labels / price保持不可知，Comparison 与 JudgeReport publication / promotion仍 ineligible，不把一次偏好解释为稳定改善。
- 不提前实现 S08–S10，不进 G / Local。本组 M1未完成，不合并 main或删除产品分支。
- 以后真实补测仍恢复同一 durable累计ledger / rate checkpoint，明确budget override；当前私有连接保存 `/v1` base，原 evaluator拼接一次endpoint。
- 本轮产品五个提交已push；docs阶段记录 / Plan / live HANDOFF只提交本任务七文件。docs完成HEAD以包含本段的提交及origin实际refs为准；

## S07 — 原 Skill 候选与完整版本、真实运行读取 pin

- Start product HEAD: `54c79cb8eea7d6ca5c7e5e4ff262fe0ca6666a64`。
- Start docs HEAD: `6adb6902df6671af12b26d4280ec07e7798125b7`。
- End / tested product HEAD: `57f4e814af373b4659ba247f9891edd80652c356`；同一 `feat/agent-intelligence-runtime`，commit / push 完成，main 未合并。
- Initial implementation commit: `375a917c8237cfb393a681db18c17e355fc3bc8e`；
- Status: **Complete — S07 only**；详细契约先冻结于 [s07-skills](../../plans/architecture/agent-intelligence-runtime/s07-skills.md)。未加载 repository-agent Skills、未读写 reference / 其它 Experience 草稿。

### Implementation / decisions

- 原 Skill repository 继续以用户 Skill 文件目录为有效配置 authority；新增`skills/.history/<scope>/<name>`的完整 immutable v1 snapshots 与 candidate v1 metadata，不新增 StorageEngine kind 或独立配置读取器。历史不宣称时间顺序或 revision counter。
- scope 解析和 visible / deny / invocation settings 先行；RP Director / child Agent、Spec nodes、Agenda workers 共享 run 弱引用 pin，Loop 保持单 Agentaccepted 版本；Native narrative 与 Project Studio 保持同一 generation / loop 的 version。always / read / files / search 都消费同一完整 snapshot，下一 preparation 新读 inventory；取消旧五秒全局 cache。缺 version / snapshot、corruption、删除与 identity 变更不 fallback 到 latest。
- Native supporting-file list 仅返回 metadata，不序列化完整 Buffer；available Skill / always 与 read 结果可观察 exact version。Project 显式 Continue 是新 preparation，未声称 task 整个生命周期固守一个 Skill。旧管理 / editor / embed 入口不传 version 继续读取当前文件；malformed / name-mismatch 旧 manifest 不伪造有效 snapshot，也不阻断修复。
- 每 Skill 最多 64snapshots / 64MiB rawsnapshot bytes、64candidates（每份序列化 metadata≤2MiB）；容量不足拒绝新 pin / 写入，不淘汰已接受版本。binary 支持文件完整保存，文本 read 拒绝 binary；重复 / 非 canonicalpayloadpaths 和 symlinks 拒绝。history / candidates 与原 Skill 目录一起走原 sync / 用户目录生命周期，embed / memory inventory 不包含历史。
- Skill 正文 candidate 保持整个 frontmatter 及所有支持文件，保存 base / desired、完整 diff 与确定性 candidateId。候选本身不切当前配置、不宣称关联 S05 诊断或 Evaluationeligibility；S10 仍需 provenance / policy / source-deletion dependency、完整 Review 和自动晋升 consumer。
- file / files / search 追加 versionquery；响应 no-store；候选 save / explicitapply 分别是原用户编辑权限，没有 model job、后台 loop、新 UI 或自动 publication。PackageHTTP 写仍 403，repository 也拒绝 edit / candidate / 不同内容替换；原首次安装与 same-content 幂等安装保留。
- repository 所有读写与不同 instance 共用 dataRoot 单进程排序；apply 原子切换 SKILL.md；desired 仍为 current 时重复显式 apply 返回 alreadyApplied，响应丢失后不重复写。整个内容相同视为同一 version，不能声称检测 ABA；多 Host / 外部 editor 没有共享队列。
- 正常 directory replace 切换失败恢复旧目录；move / scope rename / copy 先复制 history，history copy 失败不先迁移 source。delete / scope 删除清 history / candidate 并撤销 pin，损坏 history 不阻断删除；新同名 install 清未完成删除留下的 orphan history。name rename 改变声明 identity，清旧 history / 新名称新建；scope copy / move 保留 version 但原 candidate scope identity 不可复用。
- 没有 SQL 独立 candidate 迁移；SQL 产品部署仍依托原 Skill FS 目录，不能声称 StorageEngine dump 单独包含 Skillhistory。
- S06 隔离 Projectfixture 改为通过真实 Skill repositoryinstall / pin / exactread，保留原 limitedbridge 路径限制；

### Limitations / next checkpoint

- 单 Host writer 支持；所有 Skill 读写共用一个 root 队列；
- Snapshot / candidate 是原 FS 资源；进程恰好退出于原 directory replace 交换窗口时可能 temporarily unavailable，backup 保留，未引入自动 crash replay；candidate 单文件 apply 与 desired-currentreconcile 已实现，完整 PromotionIntent / scheduler / publishreceipt 归 S10。
- 删除撤销后续 pin 读取；已装入请求的 always 文本不热改。没有自动依照反馈撤回生效版本；futureS10 必须关联同一 S05exact source / withdrawal / retention 依赖和 S06evaluation。
- **下一 checkpoint 仅 S08**：真实 Git → HANDOFF → index / decisions → m1-evolution / deliveryS08 / s07-skills / s06-comparison → 同一 Record；按需 baseline 的 Prompt / resource / Presetauthority。先冻结可演化正文区块、candidate exactref / diff、有效 binding、Package 兼容 / missing-version / conflict，然后实施最小消费者。
- 本轮 S07 commit / push、同一 Record / live HANDOFF 后停止；S08–S10 / G / Local 未开始，M1 未完整，不合并 main、不删除任务分支。S06candidate 仍 ineligible；若未来确需模型，沿旧 durable ledger / rate checkpoint 且不覆盖报告。

## S08 — 原 Prompt 正文候选与 Native / ordinary RP 精确 binding

- Start product HEAD: `57f4e814af373b4659ba247f9891edd80652c356`。
- Start docs HEAD: `63aa429f409a843c13d6afeedb8f048dcdb99177`。
- End / tested product HEAD: `9b5cb5740e2af7cab8b83b9675576ea01c4f4527`；同一 `feat/agent-intelligence-runtime` 已 commit / push，main 仍 `ed1fd90521a63363e29856601abbf5e908c99d10`，未合并。
- Status: **Complete — S08 only**；先冻结 [s08-prompts](../../plans/architecture/agent-intelligence-runtime/s08-prompts.md)，随后按原 authority 实施。未加载 Skill、未读取 / 更新 reference 或其它 Experience 草稿。

### Implementation / decisions

- Native `PromptCandidateStore` 复用 Library immutable revisions、Preset root 和 runtime write queue。根追加有限 `promptEvolution` metadata，新增 candidate 正文及 ancestry Program revisions 继续沿原 kinds；无新 StorageEngine kind、migration 或平行有效配置 authority。
- 默认无 evolvable targets；显式 declaration 绑定 Preset current revision 和 active exact module refs。完整 Preset / declaration fingerprint、whole original Route、base / desired refs、完整 before / after diff 冻结；候选正文各 ≤64 KiB、每 Preset ≤16 candidates / metadata ≤2 MiB。
- owner 来自 authenticated handle。desired complete match 可 reconcile。Preset / declaration 编辑清 pending candidates，删除仍按原 archival history 保留已 pin 定义。Package 须显式 import 为用户 Library 副本，原封装内容 / exact refs 不改。
- 普通 RP 保留 `agentWorkspace` settings / 原 Preset / graph compiler / local binding。可选 `promptVersions` v1 保存 declaration UUID 与完整 base / desired snapshots；≤64 declarations、≤16 candidates / 整个 metadata ≤2 MiB；候选 instructions ≤64 KiB 且非空，避免原 consumer 空值 fallback。
- Workspace apply 只切 character / conversation binding 的 optional `promptVersionId`，冻结整个原 binding table，禁止default / global / `builtin-*`。下一 resolveWorkspaceProfile 使用该 exact definition，profile 与 Plan metadata 携带 version；Director / Loop / Spec / Agenda沿原 transport，已有 run 使用已接受 clone。原 bind 清 pin；Preset save 保留已选历史 snapshot，但base / declaration变化阻止 pending apply；delete 清该 Preset 候选 / declaration / pins，replacement 不携旧 pin。missing version 拒绝。
- 未添加 UI或后台循环。该路径只有原单 browser client 支持，无 cross-tab / Host CAS 或持久 publication intent；S10 自动 publication 须先落实所选 target的部署写入边界，不能把本阶段手动apply当自动晋升资格。

### Limits / next checkpoint

- Native 沿原单 Host write queue，无 cross-process lock；资源 metadata 与 Route commit不声称全局 transaction 或 physical fsync。metadata 失败可留下不可生效 orphan immutable revisions，仍属原 Library history；没有自动retention或crash publication intent，归S10。
- Workspace 沿原单 client settings authority，原 debounced save不保证响应即 disk durable；跨 tab 更新 / server CAS未实现，不能开放未获证明的自动发布。
- Body declaration是用户显式authoring选择；文本行为约束是否退化仍须S06 独立 evaluation 和 S10 Review / policy。手动apply 不与 S05 feedback / diagnosis 绑定、不产生Evaluation eligibility，不改变S06 ineligible 结论。
- 已选旧资源 / 已准备 run遵循原 pin 生命周期；source Preset 编辑阻止新 apply，历史 retain 或显式 unpin不等于已实现feedback 撤回 / 自动rollback。S10 须接同一 source-deletion / retention / policy / evaluation / 预算和完整publication 闭环。
- 按需原 Preset / Project 参数与compiler / policy。
- 本轮 S08 产品 / 文档 commit / push 后停止；S09–S10 / G / Local 未开始，M1 未完整，不合并 main、不删除产品分支。S06 若未来补模型测试仍恢复同一 durable ledger / rate checkpoint且不覆盖报告。

## S09 — 原编排参数候选、局部精确版本与撤回

- Start product HEAD: `9b5cb5740e2af7cab8b83b9675576ea01c4f4527`。
- Start docs HEAD: `25e1e6ceb8705b07c825e4c47fb3a8c6bb5a2355`。
- End / tested product HEAD: `f740e65238d6c46575c1f9972735a1166ca1ec71`；同一 `feat/agent-intelligence-runtime` 已commit / push，main未变化 / 未合并。
- Status: **Complete — S09 only**；先冻结 [s09-strategies](../../plans/architecture/agent-intelligence-runtime/s09-strategies.md)。未加载Skill、未读取 / 更新reference或其它Experience草稿；未读取S06私有config / ledger / reports。

### Implementation / decisions

- ordinary RP复用原Workspace settings library、Plan compiler和host profiles。显式声明仅开放有真实consumer的有限整数：Loop / Director budgets.maxSteps 1–64；Spec / Director / Agenda budgets.maxConcurrency 1–16；Agenda scheduler.maxPlannerRounds 1–32 / maxTotalRuns 1–64。
- 原character / conversation binding选择strategyVersionId，profile / Plan metadata显示same version；下一preparation原compiler读取exact definition，当前run保持accepted clone。≤64declarations / ≤16candidates / metadata≤2MiB；unknown / missing / content tampering / capacity拒绝，不fallback。
- 单目标候选：已选Prompt / strategy pin上的组合prepare拒绝，binding同时有双pin拒绝。原bind清双方pin；Preset save保留已选完整snapshot但whole base变化阻止pending apply / rollback；delete清本identity候选 / declarations / pins。显式rollback在complete desired或base仍匹配时恢复冻结base，可在声明撤销后执行；用户binding / Preset改动冲突，不覆盖。
- 原orchestrator capability API增加inspectStrategyVersions / checkStrategyCandidate / updateStrategyVersions，仍为原单browser client与debounced settings save；无cross-tab / Host CAS、durable publication intent、新UI或后台job。
- 选择最小兼容接入：authenticated owner + Project +尚未执行的单一Task，候选metadata追加到原durable task document；有效配置仍是原task.maxRepairRounds。完整task base仅排除repository sequence与本metadata，冻结project baseRevision、当前server cap与声明；不创建第二套Project配置服务 / 新StorageEngine kind。
- Project只允许planning、无plan / generation attempt / proposal / Workspace的Task declare / prepare / apply / rollback；运行开始后拒绝参数改动，原repair policy / Studio loop消费accepted value。其它Task沿自己的原creation参数，不自动继承；Project revision / Task任意内容 / server cap / declaration漂移拒绝。≤16candidates / metadata≤1MiB，仍受原task≤2MiB约束。
- 重复desired / base匹配reconcile，不重复sequence写入。原Task snapshot / context policy显示active strategyVersionId；原Task无metadata继续兼容。删除 / user backup沿原kind；原Studio router缺失storage_read_only状态映射，本轮修为HTTP503；不新增模型可调用candidate工具。

### Limits / next checkpoint

- 数值范围是本阶段finite工程边界，不是自动晋升阈值或provider token / price证据；可增加有限工作量，但complete guarded config不变。确定性停止 / 隔离tests不证明模型收益。S06仍promotion ineligible；manual apply不绑定feedback / diagnosis / evaluation，不产生自动发布资格。
- Workspace原单client / debounce，不具cross-tab / Host原子publication。Project沿原单Host队列 / task CAS，不声称跨进程锁 / physical fsync；完整Task candidate只适用pristine Task，已运行Task不可rollback policy，其他新Task不自动继承。这是S09有限现有参数authority接入，S10若需要Project-wide配置必须先设计原authority兼容路径，不偷偷将candidate metadata当有效默认配置。
- explicit rollback只在冻结whole base / desired匹配时恢复配置，不撤销既有Project / World effects；来源withdrawal / retention / policy删除的传播、运行后监测和自动rollback仍归S10。
- **下一checkpoint仅S10**：真实Git → HANDOFF → index / decisions → m1-evolution / deliveryS10 / s09-strategies / s08-prompts / s07-skills / s06-comparison / s05-feedback → 同一Record。先冻结source / diagnosis / feedback / policy依赖、owner共享finite预算、原scheduler bounded job、Review / publication intent / receipt / crash恢复与各target写入部署边界，再实施双入口完整消费者。
- 本轮产品 / docs commit / push后停止；不进入S10、不合并main、不删除分支。

## S10 — 有限评测、原局部发布、恢复与双入口消费者

- Start product HEAD: `f740e65238d6c46575c1f9972735a1166ca1ec71`。
- Start docs HEAD: `a5a27f2d8d4c472dcbb1e9da0342759d219c7a2b`。
- End / tested product HEAD: `ed00f4f0cea53be360ed8dfa082bbd0afeec5398`；同一 `feat/agent-intelligence-runtime` 已 commit / push，产品 worktree 干净。main 未变化 / 未合并。
- 未加载 Skill、未委派子 agent、未读取 / 更新 reference 或其它 Experience 草稿；未读取 S06 私有 config / ledger / reports。

### 原 authority / 部署边界

- 原 Skill files / history、Workspace Preset library / binding、Native immutable Program / Preset、Project Task 仍是有效配置权威；没有并行 active config。
- 原 Experience explicit feedback / Host outcome / user hypothesis 分层保持；提炼在原诊断层追加 internal `model_hypothesis` 来源，HTTP 不能伪造此 origin。启动前冻结原 declaration / full base / environment targetPin 与 source refs；配置后用户修改 base 即拒绝，不能让旧授权覆盖新配置。
- RP 仅 ordinary non-group rp_chat、exact subject + `.png` character binding，原用户单 owner bounded Director maxSteps≤6；不支持 Native Session、builtin / global / Package、conversation 强覆盖或其它独立 Skill / Prompt / strategy 叠加。Skill 仅原 visible + always 的唯一局部 Skill body，不改 frontmatter / 支持文件或 invocation 选择。
- 三类目标分别沿双域原 authority：character / project Skill SKILL.md body；Workspace Agent instructions / Project 原用户 Preset system.style；Workspace budgets.maxSteps / 原 pristine planning Task maxRepairRounds。其它 Task 保留原 creation 参数，开始 plan / generation / proposal / Workspace 后不热改。Project Prompt 使用原 role.studio player Route 的 ≤32 项 `projectPromptBindings`，只覆盖指定 Project，保留完整原 Route 的其他 bindings。
- SettingsRepo save / patch / Host update 共用原 queue；Host whole library CAS + `agentWorkspaceRevision`，browser patch 携带 epoch，stale 草稿拒绝。原 RP 下一 preparation 先 Host reconcile / refresh 再接受 profile；当前 run 保留 clone。单 Host writer 支持，不承诺跨进程锁、physical fsync、任意 raw writer 或普通 browser 编辑通用协作合并。
- 同一 owner 的所有 scope 比较物理 authority：已生效 Skill、character binding、Project Prompt 或 Task publication 必须先 rollback，不能在另一 chat 把仍生效派生版本当独立 base 或叠加独立 reports。其它 Task 的不同 physical target 保持独立。

### 有限评测、费用与门槛

- owner ledger ≤2048 attempts / 1 MiB，request 1–2048、tokens 1–10000000、admission 间隔 1000–60000 ms；scope ≤8 jobs / 16 publications / 4 MiB。实际每轮一个候选（schema 上限两个），同 scope 最短 24 小时间隔，一 job 至多一个 publication；容量满拒绝，不删除账本腾额度。
- 原 NativeTaskScheduler background auxiliary task，timeout 一小时、job ≤120 sends / 1000000 tokens、每非 judge trial ≤6 sends。每 actual provider send 之前持久 reservation；提炼 / baseline / candidate / judge / retry / cancel 全记同一 owner，unknown / missing usage 保留 upper bound，reported overage sticky breach。重启不重发 pending model work、不清累计账本。
- production parent 使用原 resolver / compiler / GenerationService / OpenAI-compatible provider 和 owner 选定 exact Library Route，非 streaming、output≤1024；固定子 worker 无 Secret / 用户 stores，私有临时 FS / Studio Git / canary，执行原 Director / Studio。固定 loader 补原 browser library 的 Node import，严格 RPC 只允许 parent model send；没有模型代码执行入口。
- promotion 三个独立场景 ×三次重复 ×两 arms；九次一次性 blind model judge 和九项独立 authenticated human label。提炼只见 feedback / diagnosis / declared base，report pin 固定 case / 场景 / configs / source revision / actual request / snapshot / usage / charge。production 不接受上传 report；S06 report 不能取得 S10 自动资格。
- 每个 judge / trial charge 与 durable ledger 精确对应。unknown price / usage、缺人工观察、同模型 judge 单独偏好、未消耗 target 或超额均 ineligible。
- 价格是 owner 显式确认并绑定 exact Route / model / connection 的有限 metadata，不推断 provider 定价或隐藏 retries。controller 提炼 / judge 单独报告、全计 job / owner；trial 相比不证明包含学习成本的净收益。初始门槛是保守准入规则，尚未以真实独立改善校准。

### Publication / recovery / lifecycle / UI

- 先保存 original candidate，再评价；失败保留 unavailable / review-only report 与费用 refs。没有 Evolution lock 等待 target queue 的锁反转。
- 重复 publish 请求恢复同一 pending intent，scope queue 内拒绝第二个 publication；任务启动也按 frozen batch / policy / target 去重。pause / disable 取消未接受 pending 工作，finalizing 接受的有限 CAS 可完成，不重复付费发送。
- 不 force overwrite、不撤销已提交 Project / World effects。Project original Host snapshot 记录 next-run exact ref / version；RP completed typed trace + saved exact output 记录 client_observation。receipt 历史与 current binding 分开展示，manual binding drift 暂停 automatic policy。
- Workspace refresh 与 Project generation 前沿同一 Experience freshness reconcile；read-only inspect 不持久写。
- 原 Workspace Run / Studio Task 挂同一共享面板，提供反馈与诊断来源、删除 / retention / export、有限预算、target declaration、默认 review / 显式 local auto、candidate diff、盲测场景与九对人工标签、成本 / 状态、exact report review / publish、pause / disable / rollback、current vs historical receipt。Studio 提供 Prepare without running；原默认流程仍立即执行。无无限 polling。

## M1 — 首次真实执行与有限 retry（2026-10-08，继续执行）

- 实际首轮source `1a1deb9f5`：补齐CLI stub的wiPosition与零send prepare，两个入口已准备；原compare每对结果单独保存。首次真实RP提炼与baseline成功，candidate请求HTTP524使固定worker停止；没有完整pair / judge / publication，Project未执行。不将两次成功请求推断成完整authority或收益证据。
- 首轮新增3sends /9498记账tokens：provider报告499与3610，HTTP524未知usage保留5389上界。累计255requests /1009498tokens（含旧carry252 /1000000），当前period breached=false、无pending，不清零 / 覆盖第一次报告。旧breach未知保持。
- 连续三次或最近20次六失败停止该连接，认证 / 配置 / 额度 / 取消不重试。
- 不改runtime promotion gate。source `26f203f60`已commit / push；重试状态持久checkpoint保留停止 / 频率，预算不变；沿同一账本继续实际执行。新提炼仍只见原feedback / diagnosis / base，未把promotion输出送入候选学习；前一失败候选与新候选分报告保留，不拼接source。

### retry途中发现并定位的解析问题

- `26f203f60`实测两个提炼请求HTTP成功但后续抛异常，新增2sends /1267reported tokens；累计257 /1010765，无transport失败。本轮当时未保存raw / stack，不把未知程序失败冒称API不稳定或合格候选。
- `d67a43c38`补私有raw response / charge与error诊断，lint / diff通过并commit / push；沿同一预算再取得两个响应，新增2sends /1711reported tokens，累计259 /1012476。私有证据确认两次皆SyntaxError：返回完整单一json代码块，内含正确value / rationale字段，原JSON.parse拒绝Markdown围栏。没有进入promotion，不把提炼失败计作真实行为回归或收益。
- 说明文字、多个blocks、其它语言与截断JSON拒绝。原extract、固定worker judge与test-only independent parser共用；已有partial / failed报告保持各自原HEAD。source `6c99da07f`已commit / push，三套定向7passed /5skipped（两个原worker RP fenced / Project plain、parser2、工程判定3），七触及文件lint / diff与Node20.20.2固定worker加载通过；另修CLI independent callback局部变量遮蔽：scopeId继续取原job doc，不引用尚未初始化的响应变量。随后沿259 /1012476累计继续实际执行。

- `9e3d9ed57`仅修test-only retry：必须本连接已经观测transport失败才允许该wrapper重试，认证 / 未观测失败仍不重试；包含原真实adapter + fake transport + 两笔durable预算的用例，六项retrytests /两文件lint / diff通过，commit / push。当前已启动进程仍运行且pin `6c99da07f`，模块不热替换；native evaluator / cases / targets与9e相同，不能将9e冒称该付费运行的tested HEAD。

### 本轮实际结果与停止（2026-10-08）

- Actual paid-run Tested HEAD `6c99da07f6b6f17a901ecdccd06f2cbc41b746df`，从累计259 /1012476开始，新增73sends /293240reported tokens；全部在RP：extraction1 /564tokens、baseline34 /148691、candidate30 /137700、primary judge8 /6285。本轮无新的HTTP / transport错误，无实际retry发送；不把fake adapter重试测试称实际provider重试已发生。
- 八对partial主模型结果7candidate /1baseline。完成八对baseline135433tokens、candidate137700，高2267（约1.67%）；报告最后origin=unavailable，第九对未完成，不导入partial取得生产或工程资格。
- 单笔baselineprovider total5586 > upper5550，超36，触发原owner与共享恢复账本sticky breach。原reported input3887 / output171，其total比两项之和多1528，来源不可核实，不推断隐藏reasoning或价格；按保守total记账，不以4058替换5586。后续发送被拒，Project本轮零send，secondary / publication / next-run / guarded rollback未执行。此前Project两次提炼响应只记录解析失败，没有promotion证据。
- 最终累计332requests /1305716记账tokens，含carry252 /1000000；恢复期80sends /305716，其中79provider_reported、1旧HTTP524 unknown保留5389，pending0 /currentPeriodBreached=true。没有清账 / 增额度 / 关闭sticky / 新session绕过。独占lock已释放，全部私有报告保留。
- Native evaluator revision `f8548173b8ffb754052ade6e5bef06dad046d76a01dce3af8c74c06a0c7d752c`与最终product相同；source9e /822仅CLI changes，runner source pin仍实际6c，不把后续修复冒称付费tested HEAD。
- 最终product `8223cd70309661c4639d08e323177b56e4fa265a`已commit / push：新增early sticky preflight。单文件lint /diff通过。main `ed1fd90521a63363e29856601abbf5e908c99d10`未合并，main...product0 /24，产品worktree干净。
- **M1 pending / 不集成。** 已有主模型一对回归与partial token增加，且完整九对 / 两模型 / Project与真实publication闭环尚缺。生产human / price gate不变，human未观测。
- Node20.20.2固定worker加载与触及lint /diff。无full tests /build /新browser /external DB /Android /真机 /CI，不读reference。

## Final state

实时恢复以本Record最新F2节及live HANDOFF为准；以下按发生顺序保留后续周期，旧HEAD/旧接手语句均为其阶段历史。

### 2026-10-09 必要来源读取修复的有限实测周期

真实初始账目702/2721116，main仍ed1fd90521a63363e29856601abbf5e908c99d10，product沿feat/agent-intelligence-runtime；五无关dirty docs保护。不读写reference、不进入S11/G。

本轮公开technical反馈来自97a1实际development及旧RP已保存development弱点，经原Experience correction/reflection/diagnosis与原evaluator/targets生成，agent-authored synthetic diagnosis不冒充human preference。继续局部edits确定性保留base，声明边界/CAS/生产gates不变；相同正文或未改base直接拒绝重测，不以重复评分追分。

Step的显式有限许可由§8原失败评分形态成功诊断与当时的有限范围固定；M1RetryPolicy只对旧404且最近诊断成功的当前key授权最多24 actual independent sends。原stopped值、recent/consecutive、epoch和ledger保持；许可不写入原window schema、不会自动随restart恢复。任何新Step错误/不完整响应撤销许可、无retry，primary原有限retry规则保持。本次六个真实独立评分全部成功，无新API错误/unknown；没有另开epoch或清stop。

evaluator revision `c46a3200099fa2dfa68e816c315a82e423c9404aa521c1b103b5d590f3bc1b6c`，case set保持 `49c56c12126aff08c83465f83412d2acb2aa6417e4183b25d7cbebe59f63b54b`；

| development case | primary | Step | 原维度/事实 |
| --- | --- | --- | --- |
| RP agency | candidate | tie | player_agency +1/0，分歧保留 |
| RP memory | tie | candidate | promise_application 0/0、knowledge_boundary 0/+1，分歧保留 |
| RP variant | candidate | candidate | continuity -1/+2；偏好与负差原样保存，非回归gate拒绝 |
| Project authoring | tie | tie | intent_completion 0/0，两arm completed/review/单changeset |
| Project conflict | tie | tie | conflict_handling 0/0，两arm conflict/原human revision保持 |
| Project repair | tie | tie ||

RP第三case首次在已修免费stale challenge计数的原六paid上限下完整比较，stale_completion/variant_identity保持；不据此补造上一97a1未完成结果。RP双模型一致胜1/3，不一致两项且continuity负差，developmentReadiness=false。Project一致胜0/3、三tie，developmentReadiness=false；没有符合冻结资格的新候选，不运行v2九对、publication/next-run/rollback。当前判断以单独developmentReadiness为准。生产humanPreference=not_observed/price unavailable与原gate保持，不降门槛或改评分解释。

新candidate不再出现97a1避读造成的review失败。conflict两arm都在prepare_review得到project_revision_conflict，未覆盖human revision；repair两arm都reset无效操作、一轮修复并完成review。不能将省token换成行为胜或回头改旧九tie。

| 付费项 | requests | 记账tokens |
| --- | ---: | ---: |
| RP一次提炼 | 1 | 1132 |
| RP baseline/candidate arms | 10 /7 | 43335 /32884 |
| RP primary/Step judges | 3 /3 | 2538 /9542 |
| Project一次提炼 | 1 | 976 |
| Project baseline/candidate arms | 15 /13 | 62443 /51808 |
| Project primary/Step judges | 3 /3 | 4635 /9173 |
| 合计 | 59 | 218466 |

最新同一累计 **761 requests /2939582记账tokens**，carry252/1000000/sticky breach保持，509恢复actual sends、492reported/17unknown74948，没有新增unknown，pending0/lock0。quota carry332+429admissions=761，59个当前owner attempts的id/tokens与shared逐项匹配；minimum3151ms、一分钟峰值11、保守rolling24h峰值761，2000/20硬限通过。token建议超额已即时通知并继续；paired候选RP少10451、Project少10635tokens，只作资源统计，不称费用或净收益。

本地最小4相关suite **24 distinct tests passed**：retry/显式续接11、局部edits4、原worker development选择及免费challenge3、development/engineering gate6；新增许可有限消耗、restart不自动恢复及404/503/incomplete任一新失败无retry撤销经过fake测试。触及syntax/ESLint/diff通过，无无关full/build/CI/UI/Android/外部DB。重复development拒绝step_continuation_already_used_or_failed，五累计文件前后byte SHA不变、lock0。

ledger SHA `2512e563608ec9bf8f2e424e6c080d504a1e8b599de9019a87a1a6d4093cf092`、quota `edc9490521bd5a1934371b714a8f669522c094fdd7b96490b2f9405c1e06fe11`、transport `1492bf982d7598ccfc676897f90686f496a8966217c24dbc2d6ac017855e94ca`、epoch `6f5adb9276065236d896b3f087e7ff327c110c3fb75142843a1d23d23f59c370`。详细真实报告/raw/fixtures/提案与候选均私有固定，凭证/endpoint/本地私有路径不入公共Git。

当前M1仍pending、不集成。新Project候选恢复必要读取并完成review，双模型三tie未证明优于原base；新RP完整三pair/双模型只有一一致胜、两分歧与continuity负差。原权限/隔离/版本消费12arms全部通过，Step本轮六评分可用，旧stop保留。最新761/2939582、pending0/lock0，product a61b249ef已push、main不合并；同一Plan/Record/live HANDOFF更新后停止，不进入S11/G。用户无需手测。

### 同日私有状态迁移与远端清理

用户准备在另一台设备调整方向，先让AI调研再优化，并明确确认删除对象是GitHub私有仓库 `ZZZdragondYNGPHX/Atria-Dev`，不是产品仓库Atria或本机工作区。已备份3914个当前Document文件、五个无关dirty docs原始字节及私有仓库Git bundle；本机包目录仅当前用户访问，凭证只在私有包/Document，不提交Git。接手说明明确bundle中旧Git快照不能替代当前Document/761账目，恢复时用包内最新Document覆盖克隆所得旧Document，local keys/ACL按新设备重绑定，报告/账目/窗口不清零；五dirty草稿保持单独来源。

首次删除因现有GitHub凭证缺delete_repo scope返回403。启动当前账号授权流程，认证完成后权限生效；再次删除exit0，同账号GET该精确repo返回404，产品 `ZZZdragondYNGPHX/Atria` 仍可访问，删除完成。本机私有仓库/迁移包和产品工作区保留。没有额外模型请求，M1仍761/2939582，不合并main、不进入S11/G；

### 2026-10-09 本机来源、行为失败与案例隔离调研（待讨论）

这一阶段先调研并确定方案。

本地Document曾手动删除并由另一设备Document替换。初始本地product907cf1e87/docs994cd6e92落后，Git不存在a61b对象；实际私有账本已为761/2939582。只读远端refs确认product a61b249ef71f108d279ec7bd883fb5eeae97a463、docs eec940273c78db6db2557fb7bc798a71f422fc06和main ed1fd90521a63363e29856601abbf5e908c99d10；五个本地dirty文件建立字节保护基线。

492 provider_reported、17 reserved_upper_bound计74948，全部settled。quota carry332+429 unique admissions=761，所有admission IDs存在原ledger，最小间隔3151ms、滚动一分钟峰值11；保守历史24h峰值761见原审计。ledger/quota/rate/transport/epochs五SHA与source-read-cycle-final-audit逐项一致；lock0、未发现运行中M1 CLI。九个窗口中七个旧stop保持；当前Step8000仍保留404 stop与历史recent，上一有限许可已消耗6/24且development claim固定，不能沿剩余额度自动发新轮。建议token超额历史保持，本轮零新增费用。

实证与改善空间：

- 本轮报告/反馈来自synthetic development，未发现其中有真实用户任务/偏好证据。原Experience outcome只接受原source正式状态，explicit映射origin=user、observation为client_observation，diagnosis可标model_hypothesis；CLI代理在fixture中correct explicit的技术分析有历史说明，不能将它当真实用户意见。原reflection允许explicit/technical失败事件或至少三个弱来源触发，但弱观测不能建立确定改进方向。相关Experience API会wake原Evolution；定向搜索src/public未找到常规RP/Project结束直接提交Experience outcome的调用。需讨论是否优先补齐原authority上的反馈供给，而非继续只调提炼文本。
- Project authoring/conflict/repair本轮两arm均满足目标、版本冲突与repair/review；baseline在当前简单任务已有充分表现，省token不能成为行为胜。97a1跳过必要来源→review失败/-4是具体负例，a61修复消除此回归，尚未证明优于原base。新任务可讨论有真实依赖/保留字段的创作修改、明确诊断的修复及冲突后的可执行说明，但尚未观察这些新失败，不伪称已有用户案例。
- candidate也出现玩家手搭门闩等未给定身体行为。这比泛泛“更自然”更能定义触发与纠正。variant primary偏好candidate却continuity=-1，Step+2，保持全部旧评分，不倒推更正；新rubric应明确当前时间/约定时间、观察/推测/代写行为的区别，缺证据可unknown。
- 三个RP family共享相同场景及visibleMemory，v2主要替换姓名/地点/约定时刻及一两句指令；Project仍是同类rename+注入conflict/invalid proposal。memory exposure仍为fixture直接注入，production memory resolver不在已证明范围。

本轮只采用方法论，不导入外部benchmark或新评测平台。

如无合格真实材料，由agent在隔离副本执行范围内的代表性工作负载，明确标注agent-authored/synthetic。旧v1转为历史回归证据，不再作为收益目标；新case/input/source/rubric revision在候选与付费前固定，并用免费正/负/unknown controls证明可判别且可完成。每入口一个局部target、一次候选提炼与一次development；达标才原三场景×三重复/九对六一致胜、其它一致tie、重要维度非负及原publication/消费/rollback。API8000输出、2000/day/20RPM、全部失败/unknown记账、token建议通知后继续保持；具体send envelope在范围确定后再正式固定，不追加本轮实验。

只恢复目录700/普通文件600，符号链接不跟随；文件内容及五累计状态SHA保持，原Git exclude有效、Document无tracked文件。未读写reference或产品配置内容。

未运行产品tests/build/CI/UI/Android/外部DB，没有人工观察。更新同一Record/live HANDOFF后等待用户讨论，Plan不变，M1仍pending、不合并main。

### 2026-10-09 RP / Project 领域能力扩展研究（待讨论）

本轮仅研究，不改产品。Start docs `6f1c18056d4f461df41e78e5d259c0c19bf55a15`，product `a61b249ef71f108d279ec7bd883fb5eeae97a463`、main `ed1fd90521a63363e29856601abbf5e908c99d10`；

已保存[领域扩展研究](../../plans/architecture/agent-intelligence-m1-domain-evolution-research.md)，不是批准后的Plan或第二份authority。仅定向阅读后续delivery/execution-reuse的边界，不扫描所有Plan或reference。公开一手资料含GEPA论文摘要和DSPy作者方法文档、明确到具体社区项目的RP-Bench、PHASE-Tree、NCP-Bench、NstAgent、ACL Novel Benchmark、judge偏差/人类校准及τ-bench/agent eval实践。GEPA全文网页/下载未取得可读全文，故具体实现解释以作者DSPy文档为依据，不声称已复现或逐页审计该论文；其余长论文按本任务相关方法/实验/限制定向阅读。论文版本、DSPy/RP-Bench正文commit与产品source固定在报告中；外部仓库未安装，benchmark未运行。

八项产出全部覆盖：通用能力已实现/计划/缺口矩阵；RP十三维和Project十一类覆盖/证据/非Prompt依赖；原控制引擎与受审领域模块的职责；十组质量冲突与四层回归设计；来源分级、去重/抽样和新问题发现流程；Prompt/Context/state/runtime/evaluator根因与intervention分离；策略污染、评委偏差/漂移、来源泄漏与rubric不可优化约束；九项版本/来源/兼容契约与延后能力；完整额外调用/缓存/持续优化成本。源码事实、Atria实测、论文实证、作者报告和架构假设分别标C/A/E/R/H，未将外部任务效果外推Atria或真实用户。

待讨论建议：保留M1有界控制闭环，先确认真实outcome/feedback供给及评价可判别性，再扩展有版本的领域质量和因果诊断。系统策略与故事角色成长分开，用户偏好与正式事实分开；Context/state/runtime无现有writer的修复转原authority工程任务，不能都靠Prompt。GEPA搜索valset及互补frontier属于开发证据，独立promotion另留；case按episode/Project/派生关系隔离。角色状态/长期记忆/跨任务复用属于后续路线，不静默扩大M1。测试两judge形态与生产human/price/owner gate分开，全部额外发现/校准/ablation请求都需进入原ledger/envelope；成本算式是形态上界，不是授权额度。

本轮无模型API发送、无新增人工标签、无真实用户聊天扫描/导出、无新候选或评分，仍 **761 requests /2939582记账tokens**、17unknown/74948、pending0/lock0；失败stop/epoch和6/24历史许可不变。五dirty文件加五累计状态文件10/10字节SHA保持，product clean且HEAD/main符合固定值，已批准Plan模块未变。未执行产品tests/build/CI/UI/Android/外部DB，main未合并。研究稿与同一Record/live HANDOFF仅提交docs相关文件，五无关dirty草稿不提交。

确认后才正式冻结Plan与实施。用户无需手测，不能反复重跑已指导修改的合成v1追分或把模型反馈伪装真人，M1仍pending，不进入S11/G。

### 2026-10-09 原链路反馈与评价契约 F0（设计完成）

Start docs `56151bfb8c0eff40e00b4234add851b4bbd82afa`；product `a61b249ef71f108d279ec7bd883fb5eeae97a463` clean，main `ed1fd90521a63363e29856601abbf5e908c99d10`，五无关dirty保护。

本阶段完成四组契约：原Experience中独立assessment provenance与零模型反馈供给；diagnosis根因及intervention路由；原固定evaluator的QualityProfile/case lineage/envelope/report；调用与失败/cost用途。自动分析不写explicit=user，RP client完成观察不升级Host正式outcome；确定性质量proof只覆盖固定predicate；RP无法取得这种proof时仍unknown/undetermined，有限私有engineering调查也须明确test-only且复用原提炼/targets，不放开production gate。校准/promotion内容不回流开发feedback，发布/评测事件不递归优化。

新Experience v2与case/report版本是设计，尚未产品实现；建议原资源内CAS迁移、read-only不写、旧项不洗来源、unknown拒绝、旧依赖失效、generic dump/restore/deleteUser及容量/retention兼容。未注册新资源、不运行真实迁移。F1必须让这些字段被实际consumer使用，不是仅存schema。RP试点收窄为信息边界内叙事回应/character Skill body；Project为关联修改与可核查完成/user style body。不声明全领域或长程能力。

工作包F0契约→F1最小原链路实现→F2来源/校准及实际有限范围→F3一次双域试点，各包保存同一Record/HANDOFF后停止，不新增S/G阶段。缺真实获准来源可用有实际产品用途的agent隔离工作负载但明确synthetic，无headroom或calibration不可判别则停止，不伪造失败/人类标签。416send仅无retry的结构估算，不是本轮许可或新增API硬限；F2任何付费探测前与F3试验前各固定actual pins/范围及原Step窗口处理，不恢复旧6/24许可或清stop。

492reported、17unknown计74948，全settled。quota carry332+429 unique admissions，所有IDs在原ledger，minimum3151ms、滚动一分钟峰值11；九窗口/七stop保持，lock0。未改任何账目。没有模型请求/人工标签、产品测试/build/CI/UI/Android/外部DB或产品修改。

五草稿/五累计状态文件10/10 SHA保持，product clean且HEAD/main固定。仅提交本轮10份相关docs，未提交无关dirty草稿或私有数据。下一仅F1，直接落实最小消费者而不重开已确认方向讨论，不进入F2/F3。M1仍pending、不合并main、不进入S11/G，用户无需手测。

### 2026-10-09 原链路反馈与评价 F1（最小实现完成）

本工作包沿U13/F0顺序实施。Start product `a61b249ef71f108d279ec7bd883fb5eeae97a463`；Start docs `d9732ea292d869e11ac7471139ae71a029cfcdc7`。End / local Tested product `57520d43dd577c13d1eee6df50d3edb4a3379a1e`，沿同一feat/agent-intelligence-runtime提交推送；main `ed1fd90521a63363e29856601abbf5e908c99d10`未合并。没有读写reference或加载非指定Skill。

实现复用原Experience/evaluator/targets及authority，没有新resource kind或旁路系统。strict Experience v2增加有限assessment、attribution及原资源内collections；v1只在writable CAS修改时升v2、旧项来源不洗，迁移即使feedback字节未变也暂停/失效旧job/report。normal RP首次exact saved completion写client_observation，不冒充Host；隔离evaluation副本默认关闭collector；完成/成功不独自触发reflection。失败metadata不重放generation/正式Task效果，面板明确来源/分析claims、未确认采集和一次指定source的补收拒绝/重试。

跨feedback过期/撤回/删除保留无正文水位。达到有限容量不能旁路续跑。自动model分析由内部port绑定实际模型/config/request/snapshot及原owner同scope settled charge，普通HTTP不能选择该来源；三个同类profile/dimension疑似失败按真正exact refs聚合；同一输出重复capture、多claim或混合问题不凑独立来源，仍保持弱批次/undetermined。

新local只支持prompt locus。Evolution拒绝缺归因/旧legacy、unknown及context/state/runtime/evaluator等engineering/none，不把无writer问题交给提炼。原隐式提炼仍只在原explicit/technical失败或受审Host proof支持的条件下提出局部假设，不变为已证实原因。固定8个QualityProfiles与Report v2 envelope接原compare/worker和生产、工程gate；required dimension/case/split/profile/revision缺失或伪改provenance拒绝。旧case catalogue及case set内容不变，明确historical_synthetic/not_established，新pilot没有来源时在worker/provider前source_unready。旧报告/评分/费用保留，只读历史不变成新资格；旧fixture代理explicit CLI不作为新试点入口。

物理字段、兼容/回退和支持边界冻结在原 [m1-feedback-evaluation §9](../../plans/architecture/agent-intelligence-runtime/m1-feedback-evaluation.md)，原S05生命周期/S10部署与production human/price/owner gate保持。

覆盖source/provenance/用途、零模型normal hooks、去重/非复活/第二轮失败、v1 readonly/migration pause、CAS/失效/容量/损坏、reopen/dump/restore/deleteUser、engineer-root拒绝、真实compiler/provider的fake-charge绑定、Report质量拒绝及fixed worker消费。所有fake调用/fixture标签只属工程控制，不是本轮真实反馈、独立质量胜或真人观察。

一次在回归运行中编辑受pin源码，使SQLite Project Prompt finalizing被原evaluator_revision变化gate拒绝；固定代码后该项定向重跑通过，最后101项在固定源码一次全部通过，没有放宽gate。重复运行不累计distinct数量。ESLint初轮brace-style/测试indent/conditional-expect均已修正，最终16触及JS/mjs通过。真实Chromium390px执行同一个production pane在RP/Project的来源、collect/unavailable、escaped assessment、预算、默认review、finite job/pause/delete；

Document累计仍 **761 requests /2939582记账tokens**：carry252/1000000+509 entries1939582；492reported/17unknown74948，全settled/pending0。quota carry332+429 unique admissions均在ledger；九transport窗口/七旧stop、rate与epoch、6of24历史claim不变，lock0。五累计状态文件与五无关dirty文件10/10 SHA保持，private Document无tracked文件且本轮未迁移其Experience/Task数据。没有真实API发送、新候选、人工标签、重评分、publication或新run消费/rollback；paid source仍a61b249ef。

包末停止，M1仍pending、不合并main、不进入S11/G。下一仅F2：取得获准的实际来源/明确synthetic代表性工作负载、可完成路径与baseline headroom、按episode/Project/派生组隔离development/promotion，固定case/profile/rubric/calibration/evaluator与实际有限范围；缺来源/饱和/校准不可判别是有效停止结果。用户无需手测。

产品HEAD与origin/feat一致，main仍固定；五无关dirty文件和五累计文件10/10 SHA保持，仅暂存九份相关docs，未提交草稿或私有数据。

## 2026-10-09 F2续接 — 独立密封与原窗口、有限scope准备完成，等待新Step许可

用户继续原F2范围并明确回复允许专职子代理生成密封来源。开始product57520d43d、docs a91f45e40；fetch未发现其它设备新push。沿同一工作分支commit/push f8f6c0d7a→最终/Tested `eb1664138458ebae073d86792e5a5295ce27dfda`，main ed1fd905不变、paid source仍a61b249ef；没有F3提炼/paired development/promotion/publication。原五无关CRLF dirty文档仍在旧本机docs工作树，全部字节保护，文档通过同一临时detached docs worktree更新。

独立作者单独生成3RP/3Project synthetic，接收通用schema/家族排除/公开窗口，未读取development内容、未调用付费模型或写Git。开发侧只读metadata（SHA f7858cc57c9b5aa5eeaa1a2102174c83bca7f7eddf0e07330d6ffbeeeaf14505），未读密封fixture/control/答案。作者完成schema/ranges、Node canonical parity与语义家族排除；RP字节和ProjectSetup/Edits在窗口修订中保持。

原legacy12内容/revision不变。Project最初尝试在Review后再次prepare被原review锁拒绝；同时新增fixture误读Task snapshot.proposals，修正为operations。没有改原Task状态机或重放授权。fresh Task已有真实missing-binding诊断，原public loop读/reset/save/review修复。免费构造六case各2round，Project各8tool calls、failed→passed、旧conflict不rebase/新Review未提交、human source与其它字段/resources/permissions及隔离canary保持。

原evaluator内部baseline-only probe只选新development/一次，复用原worker/compiler/provider/owner reserve/settle；host_source_probe报告保留completeness且candidate/judge/human为空，promotionDecision拒绝。原pilot compare仍source_unready，生产准入不变。原M1 CLI的F2模式只读取固定scope/controls，最多36baseline+24calibration、Step12、retry/extraction/promotion/publication皆0，首个校准或transport失败即停；

12份校准材料是known violation/counterfactual/missing evidence×两顺序×两域，拟双judge24次；原parser本包8映射、4缺证据拒绝，实际模型语义校准未运行。控制positive说明是明确的engineering_control，不是baseline观察或human标签。新funded-path fake test证明一个校准失败保留原settle记录且停止、不启动baseline/candidate；unknown不强制零/正式grade。

真实CLI prepare两域0send，但重复新建Project随机Preset引用使configuration/settings/target pins不稳定。新增原restore的baseline-only分支要求exact doc/target/实际pin、jobs/publications空；保持原publication restore默认行为。付费模式缺新许可时在ledger lock前f2_step_permission_required。五累计状态及五dirty文档10/10字节保持。当前stepPermission=null，新claim未建立，原九窗口七stop、旧6of24及epoch完全保持。

随后因新restore变更增加F2 restore1以及完整m1-resume4，合计6 relevant suites/44 distinct tests。相关变更后重跑scope/失败settle2项通过；触及10个JS/MJS ESLint、M1 CLI syntax与diff通过。fake providers/原funded worker与工具控制不是实际模型校准、配对质量胜或CI；未运行full/build/UI/Android/外部DB。准备Python一处GBK读取和一处按分号截JSON失败均在本地修正，没有账目/模型写入；

新source scope SHA 355269bd804e4d069d1a98ac5f7352ec4690a2f86536c02253896bee4e243b0d；calibration 9081a5246dfa4c753a146a6b89cf09282da921a09b48fb9dcf8851e0748f3018；constructive evidence 71e631cc33f9381548893aa7b59d640b19e716da60b9fb7485c123f7c094e646；free readiness 12c3ddd111a6bb8dff751b67eaf7f69bf0621ec20057ebbd0303b6f59ae13c23；case/rubric/evaluator/Quality pins归feedback§11。私有scope/配置/正文与原raw reports不提交，公开仅metadata与受审构造fixtures；restricted ACL保持。原ledger761/2939582、492reported/17unknown74948、pending0/lock0、quota761不变。

当前只独立作者授权，没有新有限次数许可。可审阅源码/来源/范围已准备并push。当时拟定F2最多60send（Step新12次），新故障即撤销，无retry；该节是历史准备状态，不构成当前发送限制。M1 pending，不合并main，不进入S11/G，用户无需手测。

## 2026-10-09 F2授权执行 — 发送前固定

当时F2执行范围为§10.2：总最多60send/Step新最多12/retry0/首失败即停，不F3。起始docs102d54335/product eb1664138，与远端一致且工作树clean，无其它设备push；账目761/2939582及五dirty字节保持。许可evidence `c73ceca38db1993b9c38961d4a9a863107d498a687465834867a10dad37f3725`，scope文件SHA `19f270e48390213496df8703fd4a873c6ad36964032a52d9af30746409c73b72`；所有原source/config/runner/pins保持，仅写新显式权限。原实际Step key唯一旧窗口符合404 stop、consecutive0/最近成功；model-only只读定位首次命中两个历史窗口并停止，改用原m1TransportKey定位，不清stop或换epoch。旧6of24 SHA锁定，准备副本沿原restore。无请求或账目写入。

## 2026-10-09 F2授权执行 — 校准失败停止与全部结算

发送前固定记录已commit/push至docs42567be30，随后原M1 CLI沿固定scope执行run `run-1791523500486-7aee8a69`；product/paid source `eb1664138458ebae073d86792e5a5295ce27dfda`无新改动。Project前三校准通过，第4个Step known_violation/flipped=true的解释552字符超过原512限制，虽然左右偏好/六维符号正确，原严格grade无效，runner以f2_calibration_failed/exit1首失败停止；不截断/放宽/重试。Project剩余controls及baseline未运行，F3未启动。

全部22实际请求/140750 tokens已settle；累计783/3080332，514reported/17unknown74948、pending0/lock0/quota783。RP owner18次/48133 tokens，Project4次/92617 tokens，jobs/publications0。22 pre-funded实际rendered/request/snapshot包与22 response/owner funding/shared ledger/quota逐身份/usage匹配；原ledger/quota通过去除22新记录恢复旧总数后逐字重建；历史carry/breach/unknown保持。新准入最小3154ms/滚动分钟峰值7，原20RPM/2000/day保持。现金价格unavailable，人类偏好not_observed。

新Step claim8/12在runner退出后按首失败规则标failed=f2_calibration_failed关闭，不使用余下4次；旧6of24/epoch与五无关dirty docs字节保持，九窗口七旧stop不清，无transport/incomplete新故障。scope授权后SHA保持19f270e48390213496df8703fd4a873c6ad36964032a52d9af30746409c73b72；raw summary SHA f3e02e4bd5352a6f7d5af225df1b071b112277bfe9cbd60f376164df368fdc46，paid audit SHA c3c2ccce8b38459640622d2753e154a4a2f75a64a137080295132088683a9bc0。

RP文本的“检修没落定”与未见确认后的保守说明存在可能knowledge_boundary歧义，仅developer证据初阅，不冒充正式模型/人类反馈或headroom成立。密封promotion正文/答案未读。不修local Prompt writer、不降parser/准入、不自动新付费发送。本封包停止，M1 pending、main ed1fd905未合并、不进入F3/S11/G。

审计初次因缺globalAtria导入失败，改空上下文/禁网络后通过，无额外send。沿用上一包6相关suites/44 distinct tests作为代码历史证据，本轮源码未变，没有重跑Jest/lint/build/CI/UI/Android/外部DB。同一Record/HANDOFF更新后停止，用户无需手测。

## 2026-10-09 F2表示层修复与已完成证据续接 — 发送前

调用限额为每天2000次/20RPM，原quota已恢复，累计1000 cap已移除。上一新run新增21/62624、累计804/3142956，RP12/12校准与3baseline8send完成；首个评估原文含换行导致serialized JSON substring误拒绝，decoded原文精确存在。修复解析表示层并只读复用该21请求证据，不重跑已完成校准/基线；product commit/push dd80d858338e92ef340a25d4bbf48e3e267f9595。

变更后f2-sources14/m1-quota4共18 tests通过，触及lint/diff通过；pending0，九窗口七stop不清。私有只读诊断首次Python默认GBK读取及直接JSON解析带围栏失败，改原parseEvaluationJson定位，无额外模型send。本轮未full/build/CI/UI/Android/外部DB。发送前本节push，继续仅F2，不F3/main/S11/G。

F2续接修正（发送前）：v3首个Step证据请求transport_failed，usage未取得，按原11631上界保守settle；累计805/3154587，unknown18/86579、pending0，claim1/18自动closed，失败历史保留。原F2 retry0却沿用三重试的timeoutMs/4=75秒；现使用原Route300000ms完整单次deadline，非F2路径不改。沿用户测试续接授权，允许修正后的单次有界恢复，旧404 stop/consecutive1/recent/epoch不清；不把旧claim余量搬入新claim，任何新失败仍立即撤销。product/Tested0479f5bd3e924c6031b09eaa4103e28684bc086a，retry12 tests及触及lint/diff通过。原21已完成RP请求证据继续复用，剩余测试不变，只F2。每天2000/20RPM是最新API硬限，累计1000取消；完整实际结果在结束后保存。

F2续接修正（发送前）：v3首个Step证据请求transport_failed，usage未取得，按原11631上界保守settle；累计805/3154587，unknown18/86579、pending0，claim1/18自动closed，失败历史保留。原F2 retry0却沿用三重试的timeoutMs/4=75秒；现使用原Route300000ms完整单次deadline，非F2路径不改。沿用户测试续接授权，允许修正后的单次有界恢复，旧404 stop/consecutive1/recent/epoch不清；不把旧claim余量搬入新claim，任何新失败仍立即撤销。product/Tested0479f5bd3e924c6031b09eaa4103e28684bc086a，retry12 tests及触及lint/diff通过。原21已完成RP请求证据继续复用，剩余测试不变，只F2。每天2000/20RPM是最新API硬限，累计1000取消；完整实际结果在结束后保存。

## 2026-10-09 F2 新来源、隔离与校准 — 主模型范围完成

当时仅推进 F2，失败继续诊断、检索、修复与复测，不进入 F3；API 硬限仍唯一归 Governance §13.1。备用连接为 MiniMax，不可用时暂缓第二连接、只测主模型。结果从 docs@8a274e090 的隔离结果工作树更新，不以旧 HANDOFF 的失败 checkpoint 恢复停止条件。

全部 `sharedGaps=[]`，单模型观察只写 `primaryGaps/primary_observed_gap`。原 M1 两 model identifiers、盲评、development/promotion 准入与生产权限不变；

### 来源与实际结果

六个 development 来源为 agent-authored synthetic，保留独立原始 root/template groups，旧十二 case catalogue 不改。RP 使用自然多轮 episode、修订承诺与未知当前事实；Project 使用关联字段修改、真实旧 Task conflict、人工修订上的 fresh Task 与具体缺失 binding diagnostic。免费原工具控制先证明可完成性；Project 的 test-only 窗口固定为 12 个逻辑模型 rounds / 2 repair rounds，RP 保持原声明窗口，生产默认六 rounds 不改。

六个独立 promotion 来源仍由获授权独立作者生成和密封，开发仅读取 metadata。Project 只更新技术窗口，目标、原 source、操作、答案与 RP bytes 保持。未读取密封正文/控制答案，未把 development 输出回流独立作者。

| Development case | 实际原执行 | 主模型六维观察 |
| --- | --- | --- |
| RP archive return | 2 请求；| knowledge_boundary gap：新增处罚/权限缺少 exposed support；其他五维 met |
| RP reservoir signal | 2 请求；| 六维 met；保留正确结果 |
| RP theatre variant | 2 请求；| 六维 met；保留正确结果 |
| Project entrypoint dependencies | 8 成功请求；| status_accuracy gap：缺少明确未提交 Review 说明；其他五维 met |
| Project binding repair | 10 成功请求；| status_accuracy gap；其他五维 met |
| Project dependency conflict | 7 成功请求；| status_accuracy gap；其他五维 met |

RP 真实基线 producer `22d32db191def2760884a1771f57ee9670bc3bbc` / `run-1791531237544-ac19ca9b`，共 6 请求；Project producer `ef8ddd9e208c682434b5cfe938d39691d8dbc6c7` / `run-1791538547140-1fc60cd9`，共 27 实际请求，其中 25 成功、2 次 524 后 retry。原 source-probe 的 charges 列表保留 25 个成功响应，两个 retry 前失败的 request/snapshot/上界费用另由原共享账目、prefunded packets、HTTP 原错误与 final audit funding manifest 保留；不能用该 report.charges 长度冒充全部发送数。后续只复用 exact 配置/输入/来源的完整基线，不重新付费生成正确基线，不把缓存称新独立 trial。

### 失败诊断、检索与原消费者修复

原免费/实际控制分开。每域保留 known violation、counterfactual、missing evidence 和左右顺序反转；单样本控制保留 positive/known violation/missing evidence，并新增 RP `unsupported_rule` 和 Project `communication_omission`。最终主模型有效控制 20/20（12 比较 + 8 单样本），包括精确复用的既有结果，不是 20 个新请求；固定 case/rubric/六个必需维度不删减。

改为按字段是否实际观察区分 unknown/absent，零 writes 同样不能由缺字段推断。两评委随后都曾引用 Host Task status，把正确 Host 状态当模型已完成说明；该旧结果完整保留。status met 的 literal quote 必须来自模型声明。完整窗口遗漏明确请求的说明与根本缺证据分开，正确提案不因此被判失败。新增 omission 控制证明五个提案维度 met、说明 gap 的区分有效。

RP 逐句审核曾因复合句前半段有支持，把新增处罚也判 supported，原 all-met 判断保留。原 quote catalogue 进一步按子句分割，完整原文与位置不改；新增同类控制先通过，真实档案输出再观察到知识边界 gap；水库/剧场仍 met。Project 的状态/必要沟通分开参考 [τ²-bench 官方评价契约](https://github.com/sierra-research/tau2-bench/blob/main/docs/evaluation.md)。这些研究用于评价方法，不充当 RP 世界事实。

同时沿原 M1 funded sender 修复 streamed quote refs/decoded literal 表示、Project 重复历史投影、grader output profile 与 primary low reasoning 的实际生成身份、RP right-minus-left 符号说明，以及当前 hard 401/404 不因历史 transient 被 wrapper 重试。原账目、旧 stop/epoch/不利判断保留，不修改历史费用或分数；原 Provider/Director/Studio/target authority 继续使用。未运行提炼、candidate、promotion 或 publication。

第二连接恢复后确实完成 Project 响应，但 `run-1791538547140-1fc60cd9` 第 982 请求又返回 nginx 404；随后试现有 MiniMax，第 983 请求返回 401 invalid api key。没有重复询问密钥或把 secret 写入聊天。按已授权 fallback 完成主模型测试；旧第二模型观察不冒充新协议的双模型通过。

## 2026-10-09 F3 设备迁移 — 私有快照与接续

F3 设备迁移时保存唯一 live HANDOFF 与私有快照，当前 Plan 状态同步。产品冻结 f495267023ca4475d15ba1c61b66702624c4938e 已推送；

本地私有换机包复用既有 manifest/restore 机制，更新 API 私有配置、账本/quota/rate/transport 历史、全部 raw reports/原 native fixtures、development 材料、独立密封来源、最终配置/controls/resume/audit，并携带最新产品/docs/main 与原独立资产工作空间的 Git bundle。不将隐私包或凭证提交公开 Git。保留原私有快照的无关工作树备份，更新工作树移除的旧 patch 另存历史副本；本机无关 dirty/untracked 不变。

累计仍为1008 requests /5132946 accounted tokens，pending0/lock0；原时间戳和旧错误不重置。新设备恢复不发送模型请求，重新指向当地 Document 路径；历史机器路径与原报告身份保留，旧辅助脚本不得未经迁移直接调用。

修复恢复器的 Windows ACL 继承处理，私有包根目录仅当前用户访问；新 bundle 包含源码与文档完整历史。

## 2026-10-09 新设备恢复与 F3 私有调查入口

解压私有换机包、读取唯一 live HANDOFF 并继续 F3；本轮恢复到新的私有目录，原本地工作树的无关 AGENTS 修改未被覆盖。恢复没有模型请求，没有修改原密封字节或历史账目。真实 upstream refs 与包内产品/docs/main checkpoints 一致；依源码及 tests 各自锁文件执行 npm ci，Node 24.21.0。

F3 实验沿反馈模块 §2 已批准的 delegated private engineering investigation：模型来源观察不能取得生产自动触发方向。旧 fixture 的 explicit proxy correction 沿原 withdraw API 撤回；不把模型意见或调查 envelope 写成用户反馈，不建立生产 diagnosis/触发资格。

原隔离 worker 在 candidate settings 下执行三条单臂观察，parent 明确记账 candidate。六条正确 F2 baseline 保留原 trial/charge identity，以显式 baselineReuse 引用，不重跑、不给旧发送创建新账目、不称新独立 trial。单模型、缺失校准、源/输入/目标变化、重复槽位、无效评价、分歧、负维度和费用身份不符拒绝准入；无效 grader 观察保存，不修补分数或重试有效负面结果。production promotionDecision 与 human/price/owner gates保持。

没有 full suite/build/CI/UI/Android/外部 DB。

产品上述三个工程提交已推送到同一任务分支；main 未集成。本地辅助脚本使用恢复后的路径，原 Windows 辅助脚本、配置和 raw evidence 原件未改写。

第二模型连通性诊断两次确实取得响应，但首轮双模型续接在第三条 Project 来源返回 nginx 404；原失败 HTML、缺失 usage 上界及 funded packets 保留。下一续接完整补齐 Project 两模型 20 项 controls 与三条来源观察，三个来源的共同 status_accuracy gap 成立。RP 比较校准完成后，第二模型判原工程 positive 中“这是两页目录，不能混装”为无公开依据的约束；这是工程控制误标，不是冻结真实基线不利结果。新的私有 control 版本只将该普通动作描述改为“两页我分开摆，免得看错”，涉及两个 comparison messages / 两个 source-control outputs，case/rubric/负例/真实来源和原文件不改；用户曾明确暂缓第二模型，随后立即报告“第二模型已恢复”；当前按最新指示补齐双模型，不把单模型观察授予 promotion 资格。

原默认 Step 推理配置的 run `run-1791546448988-6c06e6ff` 两域比较/source controls 已有效，但 RP 首条真实来源响应只有 usage，没有最终 assistant JSON：provider reported prompt5097 / completion16384 / total21481，其中 reasoning_tokens16383；原 funded sender 保留该不完整响应后 retry，retry 又发生 generation_provider_timeout，按原上界结算。此 run 结束累计1039 /5494867，RP真实语义尚未完成。依据 [Step 官方 Chat Completions 参数](https://platform.stepfun.com/docs/zh/api-reference/chat/chat-completion-create) 的 low reasoning_effort，在新的私有 scope 显式设置 secondary low，保留原 16384 output ceiling。此设置沿现有 f2JudgeTransport/adapter，不修改生产默认、模型 identifier、case/rubric 或基线配置；新 actual packet 已确认 reasoning_effort=low 与 max_completion_tokens=16384，取得有效 JSON。原主模型 exact 输入/配置控制、六基线仍复用。

F3 免费盲评 sizing 暴露真实工程缺陷：两个完整 Project arms 的 source/工具历史重复投影超过原 context budget，GenerationService 在 provider 前拒绝 generation_context_budget_exceeded。没有为此发送或收取模型费用。新增 exact sharedEvidence subtree aliases，按固定原内容去重，全部字段、原 source、public modelStatements、authority/evidence 与差异均可逐字段重建；不裁剪 arm，不丢弃不利信息，不提高 context/output limit，不改原 production compiler。保留原标记冲突拒绝和 blind right-minus-left 语义。提交 `71c162b1`，新增完整不同 arms round-trip 与模型伪造引用冲突拒绝两项，F3 15/15、触及 ESLint/syntax/diff 通过。

三个 Project baseline-alias 免费 sizing 的 inputTokens 为 8875/8853/8847；只用于 sizing 的不同临时 IDs 与新增公开状态说明 variant 为12674/12519/12732，均保留全部原 user evidence，原 output16384不变，未进行语义评分或称为真实 candidate。正在执行的 F2 producer 仍 pin 启动时 `078fae40`/旧 runner bytes；上述仅 F3 test-side 变动不反写其身份，后续 F3 scope 冻结新的 tested HEAD / runner。

继续诊断发现原 Route timeout 可先于 parent funded send 真正结束；旧 domain finally 提前复制/清理 fixture 并释放共享 lock，parent 的迟到 settlement 可随后写回旧 accounting snapshot。新提交 `11756061ed74dc298ab99f0701b1d7e7c1c0a607` 在每域 fixture snapshot/cleanup 和全局 lock release 前 drain 完整 funded send/retry 链（含 backoff）；不建立新账本、改费用或触碰生产 GenerationService。最小 `m1-retry`18/18、触及 ESLint/syntax/diff 通过，覆盖 timeout 后晚到 reported/unknown settlement 及 retry backoff 期间不得释放锁。

保留该实际 console 作为 provenance，不据此伪造 provider usage。原 fixture 不覆盖，另存含 settlement 的私有副本与审计；

低推理 F2 producer `run-1791547582231-8c85a3d2` /启动HEAD078fae40：两域40项比较/source controls均通过，Project三来源共享status_accuracy gap；RP档案共享knowledge_boundary gap、水库无共享gap。最后剧场来源第二模型请求又 nginx404（原http-error1065保留），因此此 producer 不是完整双模型通过。复用全部有效控制、五条真实双模型来源和原六基线，沿11756061新清理消费者仅补余下一条。此次audit累计1065/5783300，769 reported+44 unknown+252carry；unknown上界636117，pending0/lock0。

RP档案两模型 knowledge_boundary gap，水库两模型六维met；剧场主模型knowledge met、第二模型knowledge gap（保留分歧，不人为改成共享gap），其他维度两模型met。Project三来源两模型status_accuracy gap，其他五维met。两域都有实际共同缺口，可推进本次F3；F2scope `f7864d44577a8ee21c3506f21a145a49e52a9b86a9ec19451e8637aaf2064f65`，runner `45a7e6cecb9bb35fafac058681ede06b596f435447363916c4170053114d0243`；累计1066/5798528，770reported+44unknown+252carry，unknown636117，pending0/lock0，301个 distinct prefunded packets一致。

首次F3执行在免费准备阶段被生产configure的agent_evolution_source_required拒绝，两域未发送/提炼/生成candidate，费用仍1066/5798528。因为调查主动withdraw原proxy correction后不具备生产反馈来源，这项拒绝符合边界；不重新造用户纠正或放宽生产gate。生产configure/start不调用、不改，仍拒绝缺反馈。

此前零请求工程拒绝不计一个候选周期。实际结果在下文续记。

### F3 实际 RP development

一次提炼产生324字符原character Skill body候选，实际 hypothesis 是避免NPC以未暴露的程序/机构处罚/世界规则作为既定权威；候选在执行前冻结，未据后续评分修订。candidate实际成功调用为档案4、水库2、剧场2（原F2基线各2保留，不重跑）；本域实际新增15请求=1提炼+8候选+3主judge+3独立judge，不将缓存baseline计为新发送。

| Development | 主模型 | 第二模型 | 第二模型负差 / 正差 | 一致candidate胜 |
| --- | --- | --- | --- | --- |
| rp_variant_rp_dev_archive_return | tie | baseline | promise_application=-1, knowledge_boundary=-1, narrative_response=-1 | 否 |
| rp_variant_rp_dev_reservoir_signal | tie | baseline | player_agency=-1, knowledge_boundary=-1, narrative_response=-1 | 否 |
| rp_variant_rp_dev_theatre_variant | tie | candidate | promise_application=+1, continuity=+1 | 否 |

RP正式developmentReadiness=false，wins0；三个case两模型均分歧，前两条出现重要行为负差，未满足至少两次一致胜/其余tie/全部非负。原不利判断、全部六个grade/raw/charges保留，不改分、不重提炼、不追试。新report origin=m1_f3_development，baselineReuse明确cached_F2_development_observation；production promotionDecision仍拒绝，未进行RP promotion/review publication/下一消费/rollback。

### F3 实际 Project development 与本轮退出

一次原user Preset system.style提炼产生188字符候选，hypothesis要求公开说明未提交Review及fresh Task/旧conflicted Task区别；候选在执行前冻结，不见密封promotion答案。成功provider调用分别9/7/8，另一个HTTP524重试前失败按13937上界保守结算。实际本域新增32请求=1提炼+24成功候选+1失败retry+3主judge+3独立judge；失败retry保留在原owner/shared ledger与prefunded packets，不以report.charges的成功响应列表冒充全费用。

| Development | 主模型 | 第二模型 | 不利/无效观察 | 一致candidate胜 |
| --- | --- | --- | --- | --- |
| project_repair_project_dev_entrypoint_dependencies | baseline | tie | primary status_accuracy=-1 | 否 |
| project_repair_project_dev_binding_repair | tie | baseline | secondary conflict_handling=-1, repair_quality=-1, status_accuracy=-1 | 否 |
| project_repair_project_dev_dependency_conflict | tie | uncertain | secondary invalid：rationale超512契约，保留原raw | 否 |

Project正式developmentReadiness=false，wins0；前两条有有效分歧/重要维度负差。第三条独立模型原JSON选择tie/全0，但rationale超过512字符契约，原parser拒绝；按预定规则存status=invalid/preference=uncertain/deltas={}，完整raw与费用保留，不截断解释、修补分数或重试至通过。故本轮保存12次blind grade，11份契约有效、1份无效，不声称12份均为有效改善判断。

本轮F3 run `run-1791549607555-d38e4ef9`，`f3Completed=true`仅表示两域各一次提炼/三development场景及完整观察保存完成；`promotionReady=false`、`accepted=false`。两域一致candidate wins均0，原门槛保持。未读取密封正文指导开发，未执行独立promotion、私有review publication、下一run消费或rollback，不集成main、不进入S11/G；两个候选只留在私有隔离fixture，原生产promotionDecision仍拒绝。

| F3 Pin | Value |
| --- | --- |
| Product / local Tested HEAD | `cebd14154b371f59a7b44dbac9726e2f9db18a4c`（已推送） |
| Evaluator | `912ff32a31111f9d162f337239758ce81470ad841ba23c3a2651765321fe162a` |
| Runner | `09d901aab692f82a32d6e02415f67cfd8ad1f8522378875fcc6e8909c94c8042` |
| Scope | `546fbd3f9403c3827bee241638fabbd2aa545c6f169999953eaae316bbaea7d4` |

本轮F3新增47请求/436781记账tokens=2提炼+32成功candidate发送+1失败retry+12judges，缓存六基线费用不重算。恢复后总新增105请求/1102363记账tokens（含F2补齐、诊断、失败与必要复测），完整历史不清。最终累计1113 requests /6235309 accounted tokens：816reported+45unknown+252carry；unknown650054按原上界结算，不作现金费或真实模型usage。pending0/lock0，348个distinct prefunded request/snapshot packets与原共享账目身份/上界/settlement一致；

免费两域资金/校准/target pins与Project不同IDs双臂完整context sizing通过；实际原worker/两模型结果与mock工程tests分别记录。主模型identifier gemini-3.8-flash，第二模型step-5-preview，两模型grader各16384 output/low reasoning；不将grader配置当baseline配置，upstream identity/currencyCost unavailable，humanPreference not_observed。

本轮已更新同一Record、Plan当前状态与当时的live HANDOFF。下一工作应基于本次原不利证据讨论归因/干预适用性及必要范围变化；

原本地Atria-core无关AGENTS dirty仍保留；产品任务工作树clean，恢复的main checkpoint未变化。文档保存与远端同步沿独立docs分支，不把private Document或migration根分支推送公开。

## 2026-10-09 M1 继续：F3 评价协议与可执行干预修复

用户指出没有要求在本次试点结束时停工，并要求继续完成 M1。此前将 F3 一次 development 结束当成整个阶段停止点的判断撤销；后续按 Governance §8 持续诊断和修复，同候选无新变化不重跑追分。原工作包的一次提炼是每个已固定试验版本的一次观察，不能把失败试验退出作为整体 M1 交付。当前修复沿原两域/单目标/三development/九promotion门槛，不增加领域或生产权限。

免费诊断确认：旧 RP 候选仍推断未暴露当前时间/水位，且把 NPC 的交接条件扩展为玩家只能等；这是真实不利输出，非评分符号修补。Project 的候选 body188确实在实际 system message 内；公开 assistant 内容均为空，model-authored plan 未满足请求的状态解释。原 Studio loop 在 prepare_review 返回 review 后直接 finish/return；原 Host 也拒绝已停止 Task 的 generation。原候选“总结时说明”没有定位到可用执行位置，不能为补说明擅自开启停在 Review 后的 writer/模型循环。

修复提交 `d1c793b38f4caf0eeddc9bb64c2fc00b86c3cfd8`：控制与实际双臂消息共用同一 system/证据编码，保留全部反事实/缺证据/左右翻转输入；两模型各域六个 exact controls必须在提炼前通过，费用沿原 repository reserve/settle。F2已有来源判断与原基线保持历史 exact pins，不声称新增 F3 校准等于 M1通过。

不给模型新的工具/写入权限、不把代理分析伪造 explicit/diagnosis，不手写或评分后修订候选。RP仍需公开知识边界、玩家选择与可推进角色行动共同满足；Project必须在原公开槽位解释有界提案、fresh/prior conflict区别及未提交 Review 边界。

二十四个 F3 exact control messages 的原 compiler/provider免费 sizing确认完整 user证据未裁剪，output16384不变；Project controls input696–6054，RP676–1575，全部原context可容纳。该 scope 的后续实际结果见下节；新协议校准被连接错误中断，没有产生新候选。

## 2026-10-09 设备迁移 checkpoint — M1 未完成

任务停在设备迁移 checkpoint。唯一 live HANDOFF 保存恢复状态。

此前新协议 run `run-1791552826778-8fccb497` / testedHEAD `d1c793b38f4caf0eeddc9bb64c2fc00b86c3cfd8` 已结束：每域仅取得一个有效主模型 F3 比较控制，第二连接返回 HTTP530（Cloudflare Tunnel error），主连接多次 HTTP524，原 funded retry 保留。新增11请求/187157记账tokens，没有提炼新候选、没有执行新 development/promotion。两份通过的控制和原 owner/shared receipts 保存，只有 exact messages/transport/费用身份一致才可复用。

产品提交 `4fc2871f8b7cc9971efc064dc8bb94cc3c175377` 将原 worker 的独立来源读取和 paired observation 接入显式工程端口：只有固定 worker 按 pin/SHA读取三条密封来源，双臂各三次独立执行，公开场景由 worker 提供；生产 compare/source_unready 与自动 promotion gate保持。密封正文不输入提炼器、不作候选开发参考。临时 `fix/m1-promotion-worker@6eb9cdfe` 的同等提交已 cherry-pick到当前任务分支，临时工作树没有必要恢复运行。

交付已简化；原四个 tracked 修改和两个新文件已统一 checkpoint 提交并推送至 `feat/agent-intelligence-runtime@88e5b34d30bc04d4011271f354c21b46627a6283`：m1-f2.js、m1-f3.js、m1-f3.test.js、m1-live.mjs，以及新 m1-f3-promotion.js/.test.js。保持六维非负/双模型一致/九对至少六胜、完整费用和原 authority gate，不伪造 human/price。不能直接重跑旧已冻结 scope。

随后实际原 worker/mock transport的免费 sealed paired 接线 smoke先因 mock sender配置失败，修正私有 mock helper后被用户中断，没有最终成功结果；

暂停时累计1124 requests /6422466 accounted tokens：818provider_reported +54reserved_upper_bound +252carry，unknown上界829478；pending0/lock0，本任务进程已停止。旧 breached 位/配额/transport epochs/全部不完整响应和不利评分保持，当前硬限仍以 Governance §13.1为准。原F2完整双模型 sourceRun `run-1791549210360-d320b572`、六正确基线和旧F3候选/评分完整保存；

本次换机交付：源码与文档推送各自 Git 分支，私有文件仅打包 `Document/`，包名 `Atria-Document-private-20261009.zip`。该目录保留配置、报告、native fixtures、账本和密封材料；私有文件不推送 Git。该包的恢复入口为 docs/HANDOFF.md；拉取两分支、保护已有工作、恢复依赖、发现私有目录及适配本机路径由接手 AI 自主完成，再按 HANDOFF → Plan → 本 Record 推进。此前拟采用的离线 bundle/manifest/restore 和未提交 patch 恢复流程不再用于此次交付。

私有包权限600。文档当前入口已移除过时的未推送/未提交及复杂恢复操作，永久历史事实与 M1 正式门槛保留。

## 2026-10-09 取消双模型准入与主模型继续实测

Git最早记录为 `aabdf8c75`，2026-10-07 21:06:53 +08:00，author字段 `ZZZdragondYNGPHX`；该版本详细规则被写为工程冻结而非用户逐条指定，不能把Git署名或泛化历史确认解释为用户亲自规定。生产human/price gate、独立场景、冻结、维度、authority和生命周期要求保持。

产品 `bfe49f3d0fc40e878096ea00adccdd4749b9862a` 已push：F3 primary_only不加载/seed/send第二配置；development与promotion均允许主模型资格，仍要求实际已付费控制、三development至少两胜其余tie、九对独立promotion至少六胜其余tie及非负维度。未声明模型观察为human labels。旧无mode/dual报告保持原兼容契约。

实际 `run-1791558682146-034cb583` 固定bfe49f3d0、scope `f23c6c4fdd13f35901cdc7de2667bd1e3b05850a57114a444f62e8567c478437`。原六正确基线不重跑，恢复此前完整owner ledger并复用每域原exact主控制。RP六主比较controls有效，提炼一个新候选并运行三development，结果一candidate/一tie/一baseline，actor_voice/narrative_response/player_agency及knowledge_boundary负差，未准入promotion；archive的candidate偏好与分数符号/理由冲突，仍保留原响应且不能修分冒充改善。Project两个known_violation顺序控制有效，counterfactual返回uncertain，未产生Project候选。新增17请求均有provider reported usage，累计1147 requests /6607254 accounted tokens；unknown仍60项上界950546、carry252，pending0/lock0，accepted=false。

有依据修复提交 `57640f93362ddce6eb1fe666c94db79e1e2cecb4` 已push。Project synthetic counterfactual的observedAuthority包裹完整Task/公共window，原F3 codec却从外层取status/modelStatements，误制造缺失；现先展开完整authority进入原codec，保留synthetic声明与真实facts。新比较协议明确right-minus-left正负号并要求自检，矛盾偏好/分数保持invalid，不自动重试或改分。新增冻结的原development反馈输入，提炼同时保护上轮实际voice/agency退化；F3 32项与promotion13项通过，触及ESLint/diff通过；没有扩展full suite/build/CI/UI/Android。

继续实测scope `2c77dd9bad217d60dc516fae6975e78376fc84e972c1c4a21ef98904b1581da6`，固定57640f933及原密封来源。只提取已有comparison控制引用。旧失败候选、原reports和真实账本不动。新的exact协议需要重新校准，旧消息不同的控制不得复用。正在运行 `run-1791559398792-4af198ac`；当前结果不计M1完成，完成时再记录实际结论。

主模型repair run `run-1791559398792-4af198ac` 已结束。两域六个exact主controls均有效，Project counterfactual codec实测修复成立；RP新提炼候选三development为一baseline偏好/两tie，未准入。Project提炼返回before等于完整短base、after包含原文加新增段，原applyEvolutionProposal守卫正确拒绝whole-base anchor；原raw响应保留，不将其自动转换为append或新候选。新增23请求/86604 reported tokens，累计1170 requests /6693858 accounted tokens，858reported/60unknown/252carry，unknown950546，pending0/lock0。

有依据修复 `81c201d9ef77e89a0371eb45f592bb980a0d29d8` 已push：明确empty-before追加只能包含新增文字、不能锚定完整base，after/rationale边界也向模型明确；维持原whole-base拒绝保护。主模型八控制仍使用同一grade协议；旧六个exact已付费可复用，新增两个必须实测。未修改原F2 source controls、已判分结果或promotion sources。要求具体执行前审查而不只笼统禁止，保留NPC动作/语气及玩家所有权。ESLint/diff通过。

继续focused scope `fcdabed72608e5eeee754b181a812d88a06ac12f385a2014fe584e693b786cc8` 固定81c201d9e；再次基于实际根因推进，不对同一候选无变化复试；M1待当前实测结果及独立生命周期证据。

focused run `run-1791559992820-9deff358` 新增3请求/14889 reported tokens，累计1173/6708747；RP遗漏处罚条款并给knowledge_boundary=0，Project正序focused通过但翻转漏报四必需维度，未提炼新候选。实际失败证明此前宽泛比较控制不足；不删除费用、不改分、不将未校准评委用于准入。

逐维度协议修复 `8f442509772b48146e17f48a15ce2242321d8c0d` 要求两arm每必需维度met/gap/unknown、原文引用和有限理由再给差值；拒绝漏维、gap/met对比方向不一致、原文不存在的quote和winning-margin符号错误，记录时左右翻转恢复baseline/candidate标记。ESLint/diff通过。assessment scope `70a2e213cd182c7e738010d37f98ea8ef7b2fd51f209e581bcd439d40b15bc10` 的实际run `run-1791560307861-e0bc819d` 新增8请求/21515 reported tokens，累计1181/6730262，869reported/60unknown/252carry、pending0/lock0。RP原六宽控制有效，focused依然漏处罚；没有新候选或promotion。

明确合规单句不能抵消后半句无依据规则/处罚。为证据表明low思考遗漏知识边界，新增F3 comparison/extraction单独reasoning pin，用同一个主模型high，原F2 source low已付费资格及generation trial配置不变；新comparison transport/协议须完整重校准，不复用low控制。

当前high scope `ed38e054ba959e762afb8d2c9efaccf59989daa45c174a3d7ee1f1085859700a` 固定25e1aef0f；私有owner-history snapshot `run-1791560546546-c05b199d` 逐字节保留最近真实owner费用。当前实际run `run-1791560552323-d562d77e` 正在校准；不调用第二模型、不宣称M1完成或恢复暂停。

## 2026-10-10 M1 中断恢复与 H0 只读准备

feature未合入main。保护正式docs无关未跟踪Experience目录；没有根据旧HANDOFF回退源码或恢复双模型门槛。

原high run已不在运行，summary停留在RP结束时，后续Project产物和真实owner/全局账本仍在。静态只读取development和账目，独立promotion正文没有输入开发过程。两域各八个主模型controls有效；RP development两candidate胜/一baseline，第三场景knowledge_boundary与continuity各-1，原有效负面结果保留，未准入。已完成四对promotion、八个trial，未评分，随后中断。

实际恢复前累计1295 requests /8044031 accounted tokens，存在一笔reserved请求 `6697c036-f763-4aaa-9e0c-07009cf43e8a`，upper bound18931；旧lock PID42520已不存在。无该请求持久响应。私有恢复snapshot `run-1791605500731-930d53c8` 保留原fixture、旧lock及ledger-before，以原repository settle及EvaluationBudget将该笔标unknown上界，requests/tokens均不变，pending0。旧scope结果、sealed材料、失败和carry保持。

test-only产品提交 `20e2c2d8c7f1cf60b405cf53f68a94b5947f7c1a` 新增严格未发布fixture恢复与冻结候选promotion续接入口；只接受完整development资格和exact候选/config/target，复用原worker、发送端及review→消费→rollback消费者，不扩展生产权限。原worker无安全partial-slot重放端口，因此保留旧四对未评分产物，用新job完整执行九对，不选择有利槽位、不重新提炼Project候选。两套针对性测试18/18通过（lifecycle5/promotion13），ESLint/syntax/diff通过。

首次续接 `run-1791605697254-3a5c3474` 在发送前被原budget配置拒绝：恢复的实际费用高于旧699536建议值，repository正确禁止丢弃费用。该次新增模型调用为零。修复提交 `e88ad3ace513135bfa78b0f6d76f72a764753ef0` 在promotion续接保持原owner预算配置；普通测试配置也不降低已有requests/tokens，advisory测试额度和每日2000/20RPM权威保持。

M1仍pending，main未集成。

H0只读准备新增 [h0-baseline](../../plans/architecture/agent-intelligence-runtime/h0-baseline.md)：固定main/原Memory基线，定位ordinary RP/Game/Package Turn调用图和anchors、旧LLM/RAG字段及UI/preview/sync消费者、memoryOsEnabled混合职责、原生source与派生存储边界，固定八项自建中文样本规格与B0/CPU观测准备。只定位相关测试入口，未读取用户会话或运行H0产品/模型/检索/时延基准；未把只读准备当Hybrid实现或质量/性能收益。

`f9eff283a` 改为从持久attempts长度及tokens求和，修正普通续接配置的历史保护计算，ESLint/syntax/diff通过。当前Project进程仍执行其已加载的e88ad3ace源字节，未修改已固定的候选、grader协议或原worker。提交 `94cac93ac2714a837c1a7bfb9845950e7d399b3b` 根据已公开RP development第三场景的真实根因，向提炼器增加所有描述性名词/角色职业的来源审查与unknown保持，不复制case答案；允许单入口development续接，以免重提炼已冻结的另一入口。私有RP准备snapshot `run-1791606126356-37258aec` 只携带原RP owner费用与八项exact已付费controls，scope `73a4e95b748571464c604fd0c48bacfb7f1d0582429738c3d703433d9aa2dc0e`，尚未发送；共享真实账本由当前Project进程持有，后续串行发送。

提交 `ebcfc97a549e01dc59c45b651b243d00c4859ed2` 将单入口运行的domainCompleted/domainAccepted与双域M1 accepted分开，避免已完成单域被写成整体通过；基于该源码重新固定未发送RP scope `41099d83355473068705ebae11f8120516fd9e1646f045b6210554656d424010`，准备snapshot `run-1791606411922-37258aec`；此前准备输入保留历史，本次仍未新增RP模型请求。

H0物化八项自建中文逻辑样本，共519条来源，其中长篇压力输入500轮。未执行Memory或模型。这是逻辑规格，未接产品source adapter；

仅improvement_threshold_not_met，未准入、未发布。新增131请求/1997965 reported tokens。

不扩大原capacity/生产权限。共享ledger及owner字节/身份不变，原run/错误未覆盖。

RP实测 `run-1791608183475-a249755e` 固定ebcfc97a5及scope `41099d83355473068705ebae11f8120516fd9e1646f045b6210554656d424010`；原八项exact控制和正确F2基线复用。无promotion/publication。新增11请求/96707 reported tokens，含一次不完整grader响应及原funded retry，原响应/费用保留。

两域只读最终审计重算原准入、完整报告/原job拒绝绑定与费用：Project九对/十八trial IDs、139个报告+已付费校准receipts与原owner/shared ledger一致；RP development原baseline/候选/费用与readiness一致。累计1437 requests /10138703 accounted tokens，pending0/lock0；未清旧unknown/carry/breached；当前advisory token超界不等于每日API硬限被取消。humanPreference not_observed、currencyCost unavailable，M1 accepted=false，main未集成。

与本次一胜/两tie吻合。不能声称全领域饱和，也不对同一冻结材料追分。来源更新按 [feedback §17](../../plans/architecture/agent-intelligence-runtime/m1-feedback-evaluation.md#17-来源更新与结果复用) 更新有限来源包并启用独立作者。独立作者只读取公共格式/领域契约，写六个新promotion来源与metadata，不接收旧候选、development输出或promotion评分；开发侧不读新密封正文。H1/H2未开始，没有新HANDOFF。

## 2026-10-10 M1 有限新材料包接线与资格观察

独立作者完成六个新密封promotion来源，每域三条独立root/template；origin均为agent_authored_synthetic，不伪造真人来源。没有因此取得模型headroom或语义准入。

源码 `e722a22705be79f85b0630d4b31b9cf5a72ef724` 已提交推送，显式注册第二材料版本 `68a948b78e3968ad05cd2788330d7dbfa863284a1bce0810a7a80856734962fa`，保留原默认catalogue和全部旧来源。新scope在提炼前要求至少两条实际可改善gap。每域三个development、一个候选、三独立case各三次、原六维与两胜/六胜退出条件保持。

没有丢弃原始观察、改分、扩容或放开生产auto gate。中间旧未显式版本调用兼容及新RP合成测试参数缺失导致的失败已定位修复，未作为实际模型质量证据。触及ESLint/diff通过；未执行full suite/build/CI/UI或H0基准。

每域十条原F2 primary比较/source校准仅在exact协议与transport同一时复用，旧baseline不作为新来源结果。实际资格run `run-1791609911641-83c05a69` 固定上述源码/新版本，起账1437 requests /10138703 accounted tokens；目前进行新baseline采集与source assessment，尚无新候选或promotion。M1 accepted=false，main未集成；H0仍为已准备的逻辑样本/清单，H1/H2未实施。

上述首次新材料run结束：新增28请求/262325 reported tokens，累计1465 requests /10401028 accounted tokens，pending0/lock0。全部原评分保持。第三条尚未执行，没有完整source资格报告。没有新候选、promotion或publication。

只读诊断定位两项具体问题：Project新development文字要求同步“primary binding”，但原source实际只有有序knowledgeBindingIds，没有该字段；模型随后查API并转向不适用的Frontend工具。后者先作为资格判别盲点待核查，不手工改成gap，也不按最终收益取舍来源。

有依据修复 `4b436972b` 已提交推送：保留原新包字节，新增来源契约修正版 `661f990e145ad5c3f089f3f0becfb80d11d3c63f58eff8ce047ceb47a4363df4`，只将两条Project指令澄清为实际有序绑定字段，保留derivedFrom及原root/template；RP文字和六个独立密封来源不变。原资格提示补明未见对象的存在性/种类/材质、描述性名词与未提供玩家姿态同样需要支持；新增referent_existence免费构造控制，在真实来源观察前实测，RP source观察使用单独固定的high reasoning。原F2比较配置和Project资格协议不变；

有错误的第二条禁止复用。没有重复生成不变且已通过的baseline，没有修改旧报告或丢弃失败费用。新组合报告显式保存原trial与baselineReuse来源/原producer引用，不宣称复用证据是fresh paired trial。

零发送准备snapshot `run-1791610928002-b9a74591`，新资格scope `a73d6ae8ec50acedb59158b4c673e180fd5493271387c82302811e8a38568320` 固定上述修复与来源版本，目前开始实际RP source控制及原baseline语义观察，再完成两条修正Project baseline和三条资格观察。旧scope/评分/错误不覆盖；

该资格run `run-1791610936546-f5f21758` 新增五请求/88523 reported tokens，累计1470 requests /10489551 accounted tokens，pending0/lock0。RP正确、已知错误、缺证据及unsupported_rule四控制通过；新增referent_existence响应识别未观察内容为gap，但knowledgeReview仅返回该违规片段，遗漏其余正文片段，原parser按完整覆盖契约拒绝为invalid_f2_source_assessment。没有新来源语义观察、候选或promotion；不将方向正确的无效响应算作通过。

修复 `4bf78ff7748937eb233fc12e2fa40509a1ef348d` 已提交推送：RP source提示显式枚举全部必需output quoteRef与行数，要求包含supported/nonbinding片段；原parser及评分规则不变，禁止补写模型判断。因真实提示改变，五个RP source控制均需重新实测，原四个已通过结果只保留历史；原F2比较、Project source协议及已付费完整baseline不变。

零发送准备snapshot `run-1791611623393-682bc073` 保留最新完整owner费用及原三RP/一Project baseline，资格scope `d5a33de98a299d854750d798dbbf76fa6fb8700520c587dd1a10c810abcb0b7a` 固定4bf78ff77，开始上述实际重测。M1仍pending，main未集成；H0样本/清单准备身份与H1/H2前置保持。

第二项known_violation请求无持久响应，generation_execution_failed未提供可确认的具体原因。新增两请求/29647 accounted tokens，其中10404为reported，19243为unknown上界；累计1472 requests /10519198 accounted tokens，pending0/lock0。这不是有效负面评分，不重写为已报告usage。继续同一协议的零发送snapshot `run-1791614074514-682bc073` 携带完整费用和原baseline，scope `4ab2ecdbc0e55ca4d198e407942a78006a6103d854c2d67966b266605fc6b47f`；实际run `run-1791614087966-32f919e6` 复用exact已通过positive控制，续接四项未完成控制与后续来源资格，没有重提炼或更换密封材料。

## 2026-10-10 设备迁移快照

F2批次退出、费用全部settle和原fixture保存后停在设备迁移 checkpoint；不再启动候选提炼、F3或其它模型请求。恢复状态保存于`HANDOFF`（历史恢复快照已消费清理）。

最终run `run-1791614087966-32f919e6` 固定 `4bf78ff7748937eb233fc12e2fa40509a1ef348d`、scope `4ab2ecdbc0e55ca4d198e407942a78006a6103d854c2d67966b266605fc6b47f`、修正版caseSet `661f990e145ad5c3f089f3f0becfb80d11d3c63f58eff8ce047ceb47a4363df4`。新增25请求/331435 accounted tokens，其中318348 reported、13087 unknown上界；全部失败与retry保留。累计1497 requests /10850633 accounted tokens，1182 reported requests /63 unknown /252 carry，pending0/lock0，M1进程与worker已退出。

RP五source控制全部通过，六原比较控制exact复用；新的high主观察：d1 knowledge_boundary gap，d2六维met，d3 knowledge_boundary与player_agency gap，其余维度met。不是新候选改善或M1通过。原low零gap及不完整控制评分保持历史。

Project六比较/四source控制保持exact旧协议结果；随后第一条source assessment在原请求编译阶段被generation_context_budget_exceeded拒绝，没有该语义评估的付费请求，没有Project source assessments/headroom结论。不能把此错误说成第三条baseline失败；证据编码/原context预算问题留待续接定位，不缩减维度、裁掉证据或读取promotion指导修复。

没有重跑不相关full suite/build/CI/UI或H0基准。

下一仍先修复Project source assessment上下文问题并取得资格，再按正式有限包完成每域一个候选及原development→promotion→review→下一消费→rollback。本次未实施新的分阶段接线，未为获得通过扩大限制。源分支已push，main仍 `6ab12ba43c5b18bfec6df75c16456a4cb4497d3f`，未合入。

H0只读调用图、旧LLM/RAG删除/保留清单及八项中文逻辑样本保持已准备；未执行产品adapter、H0 B0/性能/检索基准，H0完整出口、H1/H2未完成。docs无关未跟踪目录plans/feat/agent-experience-evolution/原状保留，未加入提交或本任务迁移包。

包名Atria-Document-private-20261010.zip，未加密，仅保存在本地私有目录，不进入Git。不覆盖原冻结材料或清账。

## 2026-10-10 新设备恢复与 Project 来源评估预算修复

实际本地 source/docs 从 88e5b34d3/e5be06079 无冲突快进至迁移 manifest 的 4bf78ff77/5a0225542；main 保持 6ab12ba43。源码/tests 锁文件分别与现有依赖安装源一致，依赖链接可用，未无故重装或变更锁文件；凭证与私有路径未写入 Git。

本地零发送经原 FrozenEvaluationBridge 复现 Project 三条完整 source assessment 的 generation_context_budget_exceeded。原输出 reservation 16384 与完整输入（分别 18455 / 16093 / 18163 tokens）超过配置的 32000 context。保留原 f2SourceEvidence/f2SourceMessages、全部六维、quote/parser、baseline 与密封字节；没有增加 context/model 能力声明、裁掉必需证据或修改未知判断。

test-only 提交 ce8486888eb011b33375213575e51dc5007e95c7 增加按用途的 sourceOutputTokens，F2 发送与 F3 来源准入共用相同 transport 身份计算；默认、RP source high、F2/F3 comparison 和原 baseline 配置不变。未做 full suite/build/UI/CI。

原 owner 持有 request/snapshot pins；改变 transport 的 Project 四项 source controls 必须重测，未复用成新协议通过。实际资格续接已启动，结果待落盘；无新候选或 publication，M1仍未通过。

资格续接 run-1791617711441-ae498ed7 已完成：新增7请求/104900 reported tokens，累计1504 requests /10955533 accounted tokens、pending0/lock0。Project四控制有效，三个source assessment均发现status_accuracy gap，其余维度met；RP五控制/三原high观察及全部baseline exact复用，原两个gap保持；新组合观察显式携带caseId引用，不冒充新发送。两域均通过原F3 source gate；这不是候选质量或M1通过。

test-only 提交 b3832f8424b58be56ef20903dfda676596b52f9c 接入显式 separatePromotionJob：development通过后以同一冻结candidate启动新native promotion job，原development job、完整报告及owner费用保留；原4 MiB scope和publication最多120 reservationIds不变，不能以接线代替实测通过。不是模型或真实发布证据。触及ESLint/diff通过。

已启动两域各一个新候选及原development→独立promotion→review→下一消费→rollback流程，结果尚未形成。

定位readOnly只约束来源账本、retrieveMemory仍同步向量索引，固定隔离临时source/graph与本地检索服务要求；为八样本及三实际消费者列出原fixture/authority适配和观察字段，禁止adapter提前补H1/H2算法或把逻辑audience/validTicks当产品授权。未运行H0 B0/产品adapter/检索/性能/正文基准，H0完整出口、H1/H2保持未完成。

原development gate通过，同一冻结候选经 separatePromotionJob 进入新native job，原三case各三次独立 paired trial；完整promotion、review/真实下一消费/rollback尚待结果。Project新候选尚未提炼；不将单入口development通过改写为整体M1完成。

RP独立promotion已完成九对/十八trials/九个有效主模型盲评：四candidate胜、两tie、三baseline胜。knowledge_boundary、narrative_response、actor_voice分别有一对-1，原gate返回model_regression_uncertainty_or_disagreement / behavior_regression_or_ungraded / improvement_threshold_not_met。未发布，完整不利评分保持，不从密封正文或评分解释回灌提炼。原development job m1-f3-0c0b7cf2-2bf4-4c43-ae2e-76d577a10641 与新promotion job m1-f3-promotion-5d4f49f5-fb3d-4c71-aa24-fe907be72358分别保留；RP本轮新增55请求/481489 reported tokens，阶段累计1559 requests /11437022 accounted tokens；公开冻结RP候选已覆盖未见内容、玩家动作及voice/continuity规则，但规则写入不证明独立稳定执行；此有效失败不是上下文编译故障。

原job m1-f3-219dc8c3-2c73-41bb-b04f-570ee147d551。第一条主模型比较有效candidate胜，conflict_handling/status_accuracy各+1、其余非负。第二条首次请求unknown，28236 tokens按原预留上界settle；付费retry实际返回38298 reported tokens，但外层原生执行以generation_provider_timeout退出，未形成有效评分。第三条未评分。未提炼第二个候选、未进入promotion/publication。

原run自然退出及pending drain后，只读最终审计重算RP两阶段门槛/报告绑定、两域owner与共享ledger逐receipt一致；全部三条Project候选trial、原baseline及首评分保持。累计1587 requests /11807509 accounted tokens、pending0/lock0，1271 reported/64 unknown/252 historical carry；新增83请求/851976 accounted tokens（其中一次unknown上界28236），原raw retry和超时证据未删除，不将晚到响应声称为已完成原生评分。

保留已完成评分（包括有效负面或invalid），只执行judge=null的槽位；未进入报告的失败/晚到grader receipts一并纳入新完整报告，旧partial与fixture不覆盖。

真实私有fixture零发送预检到达第二条缺失评分的原FrozenEvaluationBridge发送边界，原doc/owner/三候选trial及首评分字节不变，modelSends=0；预检snapshot run-1791621507982-41638f9d；实际run-1791621637584-9004f4ab已启动，仅补两条Project评分，原密封正文仍不进入开发侧，候选/门槛/容量/生产gate不变。

Project续接已补齐两条有效主比较，新增2请求/72612 reported tokens；三个development均为candidate胜、六维非负，原完整费用/权限准入通过。development完成时累计1589 requests /11880121 accounted tokens；同一冻结Project候选进入独立promotion新native job，九对及真实review→消费→rollback仍待完整结果。

原generation收费为74 baseline+66 candidate，共140 reported receipts，单此部分已超过publication的120条上限。九个盲评继续完成，完整语义准入尚待最终结果。原native publish将所属job的全部owner attempt IDs绑定publication，原schema拒绝超过120；此容量障碍独立于最终评分，全部140条实际收费保留。

没有读取密封输入或评分解释。指导出现在实际请求不证明模型稳定遵循，不能据此撤销四胜/两tie/三负的独立结论，或重复提炼当前有限包追分。

原promotion job m1-f3-promotion-7bf5ee46-f7f4-409f-a9d7-a9da471eba49共有149 reported receipts（74 baseline、66 candidate、9 judge）；原native publish绑定全部149 IDs，在原120上限处抛出TypeError: Invalid publication state。原scope937866 bytes，未超过4 MiB；这是publication receipt容量拒绝，不是语义未达标或journal总容量不足。没有publication、下一实际消费或rollback，M1整体仍accepted=false，main未集成。

续接run-1791621637584-9004f4ab新增151请求/2088618 reported tokens，包含两条补齐development评分及完整promotion；原两条中断收费仍在development报告中。全轮F3两producer合计新增234请求/2940594 accounted tokens，其中一次unknown28236；连同本设备F2恢复新增7请求/104900 reported tokens，总新增241请求/3045494 accounted tokens。最终累计1738 requests /13896127 accounted tokens，1422 reported/64 unknown/252 historical carry，pending0/lock0；旧unknown/carry/不利结果未清理，humanPreference not_observed、currencyCost unavailable、生产auto gate保持。

最终最小只读审计重算三胜development及九胜promotion、原owner/shared ledger逐receipt、完整归档和149条报告/owner收费集合相等；重开真实私有fixture确认publication=0、actual=base、原targetPin不变。三项源码修复已提交推送（ce8486888、b3832f842、da8b9e0a0）；

### Project发布凭据容量修复与完整生命周期

没有遗漏收费或转移归属，原生产自动job的120次 admission预算、4 MiB journal与human/price自动门保持。未重复全套。

原owner/shared全部费用逐条相等。新代码与原代码src/public唯一变化是repository容量修复，旧producer保持、没有重新标成新语义运行。零发送预检run-1791628218857-24a9e36a确认真实fixture可完整绑定149条并回滚。

实际run-1791628254014-548d8408在source 8f5989882/evaluator 5e61ec97d6b26050998b0ad5984984c24af65552632f63d49a8a2a9fe34975f5完成同一promotion job的native显式review、下一真实Project请求消费及guarded rollback：nextRunConsumed=true、nextConfigurationMatchesCandidate=true、baseRestored=true，全部149 IDs精确保留。原report d0c253b780c37b3a913e0396ba7ba4b3ce09ea14019d7b74c71561407e896046/stored57978e0d6a474af68193f5514cf485079eda10765143eac566cf64eb610969e8保持；下一snapshot b9e18a1dd35f90a5dfc0f6c3d282a93ca56b9470ac31a20d77f6dd15173b341f。仅新增1 reported请求/464 tokens，累计1739/13896591；pending0/lock0。Project域完整出口通过，RP旧四胜/两tie/三负保持且仍未通过，M1整体未完成、main未集成。随后推进隔离新RP材料，独立作者只接公共契约。

## M1完整交付与H0准备

Project开发三胜、独立九胜；两域完整费用绑定、native review发布、下一真实请求精确消费和guarded rollback均通过。main `ea75b76be4927e881de2f0be7c304a56301f1f83`；原生产自动发布规则、历史不利结果和unknown费用保留。H0八样本/519来源、隔离调用图和观测清单已准备，B0及H1/H2未运行。

最后候选 `97c489d8ad9ce77a146e5f859f5a1ba5b714377b64d71806c0a2a4f7415cd667` 的原生成run-1791635587931-03e12aa6完成三条原worker试验；第三条来源审阅返回47条完整行，却缺失六项status，保持原始响应与费用，不从理由推断评分。提交 `ffca4dcfecc9f4c178d64918a9991602f1f19426` 续接assessment=null的缺失公开审阅；提交 `99575717bd22222aeddde5212084c7b50b3fd7a5` 保留无效grade尝试及原费用，只补这条不完整评价；

最终 `run-1791637497806-f6febf72` 仅补一条独立评价和执行下一实际消费，新增5请求/44175 reported tokens；独立材料正文、输出和评分理由未进入开发。development report `967a99f7d53bd8ccba7a5ef0fcb8632f43b9f5d80ecd2c72659729864b4e60ba`，promotion report `d84b0328bec12d2281463758d24ae089041b0d16ca363eec28ae8e0bc5e596d9`；evaluator `cded22e0fdc13b15d3b23dedd898ee5a10c931b7ad7fb844015bbfb732252423`，runner `b9ad6235ff6a7d18e55a71aa9408b3f1c825615aab25dc5e5686614aaff7bb40`。Project保留原语义producer `da8b9e0a0aec61e3d701bea0ad860828766a40f5` 与report `d0c253b780c37b3a913e0396ba7ba4b3ce09ea14019d7b74c71561407e896046`，新生命周期producer `8f5989882e7014cf5a9e28e004b7a2af52844efe`，未将旧语义结果标成新运行。两域publication分别完整绑定149和16条原receipt，真实nextRunConsumed、configuration match与baseRestored均true。

最终费用统计 `{"requests":1894,"accountedTokens":15671701,"reportedRequests":1578,"unknownRequests":64,"historicalCarryRequests":252}`，pending0/lock0。unknown和historical carry保持，humanPreference not_observed、currencyCost unavailable；主模型工程观察不声称人工偏好、双模型共识或生产自动发布收益。所有历史有效不利结果、格式失败及费用保留。

集成main前merge-tree无冲突；H0样本SHA `ef9a584cfde78f5bc60e43914e1eb676d3530df4398e903f56afabb0631e6eeb`保持；准备仅含样本、隔离fixture/服务方案与观察入口，完整H0尚未运行。中断HANDOFF在交付后删除，已合并临时任务工作树/分支清理。

## H0 / HM1换设备恢复资料

M1交付后的main `ea75b76be4927e881de2f0be7c304a56301f1f83`与docs均干净且已推送；本次按换设备需求建立当前HANDOFF和完整私有迁移包`Atria-Document-private-H0-20261010.zip`。下一有限交付组为HM1（H0→H1→H2），H0仍只有准备，B0及产品adapter未运行。无新模型请求。旧M1任务分支/工作树已清理，新设备从最新main继续，不恢复旧分支或重跑M1。

## HM1 / H0 实际基线与恢复

从最新 `main@ea75b76be4927e881de2f0be7c304a56301f1f83` 建立 `feat/agent-hybrid-memory`；现有旧任务工作树与 docs 未跟踪 Experience 草稿保留。原 ledger、quota/rate/transport、scope/report/receipt 与密封材料字节保留，未重跑 M1、未读取密封正文。

test-only adapter 保存未过滤原 sources，并经原 captureEpisodes / applyFactOperations、temporal graph、createSourceLifecycle、Information projection 与 Context compiler 形成 fixture。1000 条 Episode/Fact 的长篇投影（500 原 source）、两个具体时间关系与合法桥边关系均来自合成原文。存储为每 fixture 独立临时文件；受控检索服务只监听 loopback，以固定字符重合排序观察真实 HTTP / 索引读写，属于合成 backend，不能冒充真实 Embedding 质量或 Provider费用。

私有证据 `hm1-h0-b0-repaired.json` 保留完整18个 query/lane 观察；`hm1-h0-b0-graph-atomic.json` 补充实际 temporal graph / atomic预算 / Actor权限观察；`hm1-h0-b0-attempt3.json` 保留 source编辑/删除/branch/variant拒绝、rerank故障、取消与保存失败及 Game / Package结果；`hm1-h0-b0-ordinary-repaired.json` 保存 ordinary RP 原 after-WI→唯一lorebook注入。所有失败适配尝试保留，依赖与fixture错误修复后只复测相关项。未运行真实模型，正文、Provider tokens、价格/TTFT保持未测/unknown，UTF-8字节估算不称真实tokens。

B0实际不利结果：H0-ZH-01的同名他Actor来源、04的秘密动机来源、05的他Actor私人约定，在 lexical/graph 与受控vector两 lane 均入选；02只覆盖belief而漏掉hearsay。03历史/current来源分别命中；08遥远承诺命中。源编辑、删除、换branch与variant修改使旧snapshot抛AbortError；原metadata保存失败保持原来源；atomic chain仍无完整组协议。该泄露表述只指合成fixture检索结果，不声称真实用户数据或最终NPC自由文本已泄露。

原source-lifecycle / temporal-graph / hybrid-retrieval三suites共51项通过。没有全量test/build/UI/CI或模型发送。原累计1894 requests /15671701 accounted tokens、unknown64/carry252、pending0/lock0保持；API quota恢复原admissions，不以历史累计当终身限制。H0观测完成，继续H1→H2，尚未宣称HM1整体或真实质量收益完成。

## HM1 / H1 唯一召回与前置合法域

source `b8c2a85e6` 将自动/手动 recallMemory 与 ordinary RP/Game/Package 统一到 Hybrid。旧 LLM/RAG 执行、模式 UI、router/rewrite prompts/routes 与独立 retriever 删除；单向设置清理保留来源写入许可及 extraction/schema 合法路由。来源写入与召回读取独立，关闭写入仍能消费合法历史；待写 ticket 关闭写入时拒绝。原 source/World/Timeline/Journal 不迁移或删除。维护重建同走授权路径。

原 Information authority 在任何 corpus/index/query/rerank 前确定 Actor/task/narrator 完整来源域，application summary/reference 不授权未暴露整段 source。Package 对混合合法/非法引用拒绝整段正文。`hm1-h1-b1-attempt1.json` 保存18组B1双lane配对与两实际 Native消费者；禁止来源未入 corpus/insert/rerank/结果，02仍只命中1/2目标，H2尚未增强。`hm1-h1-ordinary.json` 保存实际ordinary单packet消费。

初始失败和修复日志保留。仅相关ESLint/diff；无新增模型发送，无全量build/test；H1已冻结B1，继续H2中文query与packing及真实正文配对。

## HM1 / H2 中文种子、完整来源组与正文配对

H0 `722f1d698` → H1 `b8c2a85e6` → H2 `3ee1332ef113d4c57c65d9577222ba88d5171101` 从 M1 完成后的最新 main 连续交付；M1 未重跑，原报告、未知费用、quota/admissions、carry 与密封正文保持；私有路径与依赖自主恢复，无新增审批。

负面“没有新增承诺”不作为承诺种子；歧义保留 unknown。超预算或跨时点缺成员拒整组。cause 无来源保持 unknown。未添加 cognition/forgetting writer、新事实图、PPR、LLM rewrite、候选缓存或 delta 索引。

复用唯一 `informationSourceMessageIds` 与原 Information authority，允许 exact application source text，摘要不能放大授权。真实 memory item 与预算整组拒绝现在通过。无 ledger、关闭写入时，原合法 Native Timeline 可在内存只读重建 Episode 投影，原 bytes 不写回；pinned snapshot 遇 live revision 前进即 AbortError。无证明旧图仍保留存储，不自动获得叙事授权。

`hm1-h2-b2b3-final.json` 保存 36 组 B2/B3 × lexical/graph 与 synthetic-loopback vector 的同输入/权限/预算（2400 UTF-8 bytes estimate）配对：每个目标来源均命中，禁止来源均零，候选与 Context 不截断 atomic链。`hm1-h2-ordinary.json` 记录实际 after-WI 唯一packet；Game / Package 与 formal atomic组分别走原实际 Context。

只用冻结公开合成样本，不读 M1 密封正文；B1/B2 已测相同输入原样复用，B3 header 修正后 fresh-generate，算法标签隐藏的主模型盲评有9组有效观察。仅 lexical/graph 正文真实发送；vector 是本地合成服务，不能称真实 Embedding 或 Provider 检索效果。500来源是长篇固定检索 fixture，不是500轮连续正文实验；

每维最大18分：

| 算法 | 来源边界 | 目标应用 | 未知/冲突 | 玩家自主权 | 角色声音 | 自然度 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| B1 | 17 | 16 | 17 | 18 | 14 | 13 |
| B2 | 18 | 18 | 17 | 18 | 15 | 14 |
| B3 | 17 | 18 | 17 | 18 | 17 | 17 |

B3 六维总分均不低于 B1，目标、声音与自然度改善；不声称每个案例无退化。H03过去的时态/未知、H07“依记录来看”等元话语仍有1分不足。原 v1 header 对 current 来源警告过强，导致无依据 uncertainty 和正文退化，已依证据修正并完整保留 v1。原输出及原配对评分保留，单独标 observed invalid_unproven_present_recollection。按 hybrid-memory §7 对该观察做一次有界修正发送与本地来源审查，修正保留过去借书/未履约，当前是否记得与心思未知、不控制玩家；该修正仅评测内触发，不冒充产品全局自由文本保证或新H5认知能力。

失败/修复完整保留：非法request ID、grader超Context预算均发送前失败无费用；首个成功请求随后结果读取接口错误，已记reported total1336但公开正文丢失，不能声称该次raw输出已保留。随后在解析前保存response clone与normalized结果；一份grader尾部非法JSON保留并计费，不修评分。

read/write/external API 3suites100项通过；模板测试隔离shell dependency ports，不声称启动完整Atria浏览器应用；无全量test/build/CI。

本轮模型/评审/修正合计新增 **58 requests /62749 accounted tokens**，reported58、unknown0，含不利正文、无效grader和丢失正文那次的已报告费用。原 M1 `1894/15671701` 字节账本保持；合计观察1952 requests/15734450 accounted tokens，原unknown64/historical carry252不改。货币费用 unavailable，不记零。原quota历史admissions1562与carry332保留，本轮58次均有admission；发送点滚动60秒最大11、完成时近期24h805，遵守每日2000/20RPM，未另加累计终身限额。原费用账本和quota carry是各自authority，不混淆统计。

真实9组模型正文E2E（包含provider发送与等待，不是TTFT/检索latency）B1 median6868ms、范围3573–23472；B2 median6386、2955–18329；B3 median7547、3763–11730。时点不同且小样本，不宣称加速或节省费用；Provider TTFT未观测。产品提交不包含私有连接、费用正文、机器路径或cache。

HM1 本有限组完成，继续工作的授权不被阶段边界或失败暂停。Plan 已更新当前状态，H3/H4/H5 保持未交付。main依赖以lockfile重新安装恢复；只同步本组main/docs提交，保护现有Experience草稿和旧无关工作树；本组工作树/分支及已消费live HANDOFF交付后清理。

## M8 / G01 基础 checkpoint 与继续

用户在 HM1 交付后要求继续。实际 main/origin main均`3ee1332ef`、docs`894d84c04`；保护原Experience未跟踪草稿及旧任务树。从最新main建`feat/agent-compute-runtime`，不恢复或重跑M1/HM1。HM2 H3/H4的G依赖未实施，先推进M8，未跳依赖或宣布HM2完成。

source `c62ecc937b66e2125e35621483f186d6debadce3` 扩展原 CapabilityDecision/RuntimeRoute：optional v1 path binding与有限executionPolicy；原profile/route/library authority及资源keys不变。advanced cache/reasoning/continuation 的字段可构造只计unknown，unsupported优先。现有Snapshot固定target/policy/evidence与三层cache、价格/上游unknown，不发Secret、不provision配置。配置改名可保留原exact观测。原Route兼容、精确refs和fallback authority保留，待G03继续强化；continuation仅none，其它模式明确unavailable而非空壳通过。

新增10项全部经修复通过，包含FS实际profile消费、SQLite原registry dump/restore、policy target拒绝、path/account/expiry、编译期间晚过期及不可伪造发布。首轮冻结port测试误改只读方法、错误code未登记导致generic错误，已修并针对性复测。SQLite初缺native binding，npm rebuild被本机allowScripts跳过；原fail log与repaired/publication log保留；未测MySQL/Postgres，Docker daemon不可用，不把它写成SQL通过。相关ESLint/diff通过，无全量build/CI、无API发送、费用/quota未改变。

继续G02编译、G03复用/失败策略、G04原生执行观察、G05共享准入与G06双入口对照，再推进HM2对应包。新live HANDOFF未创建，阶段与环境失败不暂停工作。

## M8 / G02 确定性编译与实际消费 checkpoint

source `37273d4ca` 在原 native repository canonical authority 导出 serializer，HTTP count/send 共用同一 bytes。原 PromptModule targets、stage/module priority、raw instruction 和 history/tool arrays 顺序保留。compiler 增加 stable identity 与 exact source/content segment 元数据；Snapshot 固定最终 compiledBinding，包含 compiler/canonical/layout、source/provenance/native selection、path、exact resources、generation、tools/output/history/prefix/content/rendered 指纹。request ID/transport 时间不进入语义绑定，版本和权限不被删去追求 prefix 稳定。字段只标 candidate，不宣称 cache hit。

原P3 46项初44通过、2失败：G01诊断把旧注入resolver的缺失path/evidence作为undefined写入JSON。先只补compiledBinding null未修根因，原失败及两次recheck日志保留；改原executionPlan缺证据为null/空列表后两项针对性通过。新增suite因source binding完善再跑4项通过；相关6产品文件ESLint/diff通过。未跑全量build/CI，无付费API/额度变更。

这是G02上层编译checkpoint，native envelope/compaction、通用复用、共享预算、产品状态与收益尚待后续。继续G03，RP正文仍fresh generation，未以稳定bytes冒充provider hit或完整M8/HM2完成。

## M8 / G03 Artifact 与 Plan authority checkpoint

2026-10-11 source `c6979abda`。没有提前返回 Task 执行或绕开 scheduler currentness/RunControl；once adoption/正式effect仍走原authority，未伪造send、usage或receipt。

Project 原 TaskRepository/工具入口增加受限plan structure复用：同Project、同exact intent/currentbase，目标尚无plan/operation/workspace；failure plan随Snapshot固定，unknown economics保持unknown。旧无policy Route保持原适配路径。

首轮Project测试误用不存在commitTask，按实际commit修正后复测通过；lint brace格式修复。5产品文件ESLint/diff通过，无全仓tests/build，无API/费用/quota变化。首批allowlist见substrate；

## M8 / G04 原生私有 envelope 与 Host retry checkpoint

2026-10-11 source `47575e344`。Anthropic/Gemini 原 provider 接入 Responses 使用的同一个 Runtime checkpoint/lease authority，不另建 store。公有 response/preview 仅保留 private checkpoint 引用，原始 thinking/signature/parts 不进入公开 snapshot；实际发送从原私有 state 回传完整内容。API缺 direct usage/cache counter 时仍 absent/null；canonical upstream/hidden attempts unknown。

shared lease 与原生迁移相关的 Responses/native matrix 63 项通过；随后新增 Native Host 两格式各7项（实际两轮消费、path/source/history/tools/forged、Secret）共14项通过。四产品文件 ESLint/diff 通过；日志分别为 m8-g04-private-native-initial、m8-g04-native-host、m8-g04-native-retry。无新 API/费用/quota变化。继续原 RunControl/send 与 Project Task 的共享准入/记账及 gateway/G06，未写 HANDOFF，未集成 main。

## M8 / G05 原发送 authority 共享记账 checkpoint

2026-10-11 source `9599dad35`。首批明确上限和作用域见 compute-policy §3.1。原 Route 可选 computeBudget，旧配置不自动增加限制；沿原 Host/RunControl operation及Project Task锁/CAS准入与charged，合法usage settle，未知/partial按上界占用，原Package旧计数同mutation，不重复扣两筆发送。请求ID变化不重建父operation/Task allowance，内部发送ID不同。Core保留正文/Secret拒绝和不完整stream已取得的数值usage，只有计数进入原ledger；无新发送器或预算registry。数值未知与货币费用unknown边界保留。

原Core35项中34项先通过；旧budget的not-due/previews、retries/reopen和period/restore6项通过。

随后内部ledger未进公有Task投影，补入计数投影，两次repaired日志保留。所有m8-g05日志保存在私有Document。API新增0，原M1/HM1 ledger/quota未变；

## M8 / G04 真实 gateway 与 Studio lineage 消费

2026-10-11，gateway producer `acd2d563f`，后续实际client修复 `9369f3b0a`。沿原配置主模型gemini-3.8-flash、同SecretRef account冻结四格式/endpoint后实际观察：Responses/Anthropic 404原响应保留，Gemini native/原chat-compatible 200且normalize。reportedModel仅alias，cached counter缺失null，canonical upstream/hidden attempts/价格unknown。直接total分别135/122，大于visible input/output之和，保持provider原total，不把差额抹零。

随后原Native Project Host + 原只读get_project工具跑Gemini signed round-trip。v1实际第一发送成功/186 tokens，但私有runner错误只传callId没传原started attemptId，工具authority拒绝project_agent_attempt_conflict；原失败/账不删除。诊断后v2调用beginGeneration取得原attemptId再执行只读工具，2发送/203+608 tokens，完整签名parts原序回传，公开response/preview无opaque，正确Project名/无后续calls/原revision保持/完成后replay拒绝8项通过。只证明该exact frozen path/current execution，不声明其它模型/通道或持久restore。7新增API共5个直接total/1254 tokens，2个404费用未知保留各自prepared upper占用，货币unavailable；原quota累计append并排队，2000/24h和20/min持续生效，M1/HM1原账本不改。

未覆盖两个false记录，未为此重发API。

真实Studio入口另发现generation-client每轮新requestId，直接Host重复ID不能替代产品证据。修复后原Host将Project Task映为其现有task source，绑定原Task语义及非generation authority epoch；request/attempt identity仍逐轮独立，owner/path/prefix/history/provenance均保留。不接收caller Task proof。Task语义变化时client从公开工具观察重算，Host拒绝不同Task、变化/晚到变化及同内容restore旧epoch，取消/失败discard。8相关产品文件ESLint/diff通过。source与实际producer分别保留，不扩张为当前HEAD已重跑全部真实API；继续Sparse/G06/HM2，无HANDOFF，无阶段停工。

## M8 / G05 规则触发与 rerank 原预算消费

2026-10-11 source `ad21a1379`。有限支持唯一规则见 compute-policy §3.1。原 Hybrid 不再因配置存在而每次 rerank，普通/无因果证据/单一来源/缺预算上下文均 skip，仅多份独立因果来源请求排序，原 recall trace 收消费决定。Native rerank 省略 computeContext 也拒绝，未留未计账发送旁路。原 exact retrieval profile/Secret、Run operation/Project Task mutex/CAS 与 provider fetch 实际消费共享 send ledger；usage/null、取消、坏 output、上界估计均沿原规则，不新建执行器。

无效响应保留直接17 total/partial counts、缺上下文/过期锚点/坏输入不发送1项；Project原Task收费/晚变更拒绝1项；实际Hybrid→NativeRetrievalService→middleware→provider HTTP触发、耗尽退回合法source和拒绝后source撤回1项；实际发送取消unknown与65条超限输入无charge1项；纯规则去重/不造事实1项；原ordinary检索不调用配置rerank1项；旧三种rerank/远程embedding协议沿明确原Session预算调用1项。日志保留 initial/consumers/terminal 三份。

新增API0，M1/HM1冻结基线和quota/费用未变化。只证明有限规则与已发送费用语义，不计作真实rerank算法收益、金额硬上限、Embedding/CPU全覆盖或G05/G06/HM2完成。不写HANDOFF，不集成main。

## M8 / G05 工作量观测与 H4 source currentness 热点

2026-10-11，work metrics source `528735d2b`，private identity `ab9dd69b8`，对应 transaction receipt修复 `bd51fd94c`。费用unknown与not_requested分开，未宣称硬CPU/金额预算。不扩大为全suite。

H4原算法基线在实际loopback Native FS向量存储完成：有效SourceLifecycle conversation Episodes 100/1000/10000，各cold3/warm5，共24样本；明确fixture vectors、真实Embedding0、外部API0。10000cold网络request body约4.50–4.66MB，warm642 bytes request/165310 bytes response，均是实测HTTP body数据，不含TLS/header。data metrics另标service_data_json_utf8，不能混作相同口径。基线p50/p90ms分别100 cold91.11/94.08 warm47.42/49.01、1000 cold618.64/626.38 warm350.44/367.21、10000 cold17735.54/18328.92 warm10086.85/10678.36。

热点证据支持沿原authority优化：私有cache复制以隔离公开输出，只在ledger内容改变时换identity；10000暖态新p50/p90为2971.63/3056.04ms（有限样本下降70.54%，不是SLO），cold7499.28/7511.54ms；随后发现await transaction返回后取最新cache token有借用后写identity的窗口，改为transaction内部receipt；该fix不是改写原ab9 producer测量。7 distinct针对性反例通过，包含未通知edit/chat切换/flag/concurrent write/access、readonly、manual stale/persistenceboundary、公开copy不别名、观察ABA以及queued transaction；新增queuefixture初未处理optional corrections导致TypeError，修正fixture后定向通过，日志保留。产品lint/diff通过。

私有脚本失败证据全部保留：首次Node24 crypto只读setter、次未设默认config均发生在测量前；v1/v2把insert纯文本OK当JSON，0样本失败。原sealed M1材料不读、不重跑，quota原账不改。

继续原任务，不写HANDOFF，不集成main。

## M8 / G06 共享额度产品消费与关闭反例

2026-10-11 source `90c0dd72d`。原 Route fields editor 新增可选发送次数1–32及正整数 Token 上界，保存/撤回保留其它 policy；诊断展示当次实际 charge receipts、有效父 limits、unknown currency 与 Provider observations，Studio 沿原 Task.compute 显示累计记录。发现关闭 Route 配置可绕过已有 compute ledger，修复为原 Run lock/Task CAS 内优先复用已存在 limits；放宽配置也只取实际 receipt 的收紧值。没有并行预算 authority，未将当次 attempts 称作父剩余额度。

Package 原后台 allowance 仍有余额时关闭 compute 仍拒绝发送，FS/SQLite共2项；字段编辑 bounds/保留 policy/提交后重新读取再关闭1项。改了 receipt 后仅重测已报告/partial usage2项和 FS/SQLite后台 unknown/restore2项，共4项相关回归通过。初 Jest 路径错误及 UI fixture缺 fallbackRouteRefs/精确 resources array、保存后测试旧 detached form 的失败日志原样保留；补齐 fixture 并按产品重新打开后定向通过。

真实 Edge browser 沿原全应用/隔离 Native Session 完成1440px/390px两项：invalid33浏览器拦截、2/64000保存再读取、关闭保存再读取、Escape恢复 list focus，无 pageerror/外部模型发送。沿用现有tokens/布局。外部API0，原quota/两冻结ledger未改；

## M8 / G06 主模型有限配对：不利结果、裁判局限与工具边界修复

2026-10-11 paid producer `90c0dd72d`；新私有 run-m8-g06-paired.mjs 使用原 primary-only config（openai-compatible/gemini-3.8-flash），沿原 Host Session/Project、真实隔离 FS Session/Task 和原 shared charge，固定四个自写冻结场景、recompute/reuse两臂。Project目标Task从原复用工具取得fresh pending plan，通过现有buildNativeProjectAgentSystemPrompt进入实际请求。不跑M1/HM1原模型基线，不改两个冻结ledger。

ordinary为旧承诺/指代；hard为寄信人未知动机；high-impact是玩家自主权负例及source exposure边界（新增要求代玩家前往/宣告见面，不执行实际高影响mutation）；long是500源检索域、只将选中6源送入有限Host Context，不是500轮live历史。实际估计Input与Provider reportedInput分列，长Session实际reportedInput1688、Project1628 tokens。原合法Information过滤先于检索，生成Session将选中来源转换到正式Timeline IDs/Context refs；actual consumer Task/anchor/path/response/charge与原request bytes均在私有证据保存，不向正文输入opaque CoT。

24次实际HTTP200（16生成+8同主模型盲评），全部直接reported total共35334 tokens：recompute 8次12913、reuse 8次15182、judge 8次7239。currency/upstream/cache identity仍unknown。mixed Host E2E n8每臂p50/p90分别4864/13608和5678/13876ms，不是每层分布/SLO；non-streaming TTFT unavailable。long两入口复用均更慢且total更高，原不利结果保留，不能称Provider减费或总体加速。四对检索elapsed仅一次为0.54→0.42、1.12→0.62、0.60→0.95、73.73→70.92ms；有效corpus hit只说明少做对应投影，不保证生成费用下降。H4较大语料n5 IO收益仍只归原独立scale audit。

**完整qualityPass=false，未通过G06/HM2。** high-impact Project/reuse没有final prose，返回未声明的atri_agent_prepare_review调用；原报告judge六维0保留，工具未执行。long Session/recompute写“我确实记得”，reuse写“如今…书确实还在我这里”，前者无当前cognition source，后者无当前custody source；judge却给来源/unknown全2，实际漏判，不以平均分宣称满足底线。另judge仅看selectedSources，漏看合法原Native World中的harbor及渲染packet中的fact:H0-ZH-08-f39，误称该地点/ID捏造。零API audit比对保存的request/snapshot确认上述两个false criticism，保留原grades不覆写/补刷分。现有表达仍fresh generation，自由文本source/当前状态不能靠检索过滤保证；这些观察沿G06正文/原Narrative policy消费者继续处理，不把HM3 cognition当已实施。

具体工具失败修复沿原GenerationService：response.toolCalls必须属于冻结PromptIR.tools，正文提到工具名称不能授权response call；拒绝仍finally结算已取得direct usage，并discard失败native envelope。2新实际loopback反例（声明的只读工具合法、未声明prepare_review拒绝且20total结算、Task无operations）和受影响真实Studio client/native signed loop 1项通过；改成实观prepare_review形状后仅相关false项重测。原Memory手动debug trace补齐plan/invocation/reuse；checkbox tick改用原Atria text token后仅390px浏览器受影响项重测通过并查看截图。2相关产品JS ESLint/diff通过。

preflight失败原样保存：v1 lanePlan没有原executionResources，v2/v3 Context ref误用message而非timeline，均零HTTP/零quota；临时本地debug插桩诊断后撤掉，v4/v5的16个preview完成（v5加入正式Project prompt及真实scope解释）。live-v1的Windows冒号证据文件名在fetch前失败，quota admission1/actualHTTP0分开；保留该准入，不称上游已收费。v2修证据文件名并在失败时保存原Run/Task ledger，完成原有24上限。两冻结raw pins、carry均匹配；新quota append共25admissions，其中实际HTTP24。

本有限真实对照结束，不无限重评、不新增服务/算法以挑选有利样本。H3语义rerank/真实Embedding缺可用已配置服务，维持基础检索及明确skip/unavailable；继续当前具体源码/consumer失败及原依赖下可推进部分，不集成main、不写HANDOFF。

### G06 原生工具回传观察的有限消费者

2026-10-11 source `89760af6b`。只解决 native observation 缺少当次决定的问题：成功 lowering/normalization 后，沿原 private envelope 的 binding/sequence 输出 protocol、mandatory_tool_exchange、request/task绑定 scope、process_only、已回传 checkpoint 数、首次/继续工具协议以及响应 capture/discard。三个 adapter 共用原 envelope 模块的呈现函数，无新 checkpoint/storage authority；不输出 signature/opaque body，不把回传数称上游已复用或缓存收益。原 Runtime 请求诊断 Provider观察可直接读取；真实 Studio client/routers/Host 两轮 HTTP 返回确实带 task scope，但仍仅当前 mandatory 工具循环，未实现跨turn task policy。

这是有限不支持矩阵，不能用识别字段或工具round-trip宣称续接策略完成。3产品文件ESLint/diff通过。

原质量失败继续阻挡完整G06/HM2；H3新服务/算法及HM3 writer不扩张；

### G06 预载长 Timeline 的真实 Turn 消费边界

随后沿原 executeTurn、scheduler、Information、authority-first candidate、GenerationService、local HTTP与finalization完成一轮。已构造的合法memory候选引用旧Timeline message/current revision；旧revision反例在HTTP之前拒绝。实际wire8354 UTF-8 bytes，携带获准历史promise及正式public note，私有read sentinel和超出view的末尾raw历史不进入请求。原生产anchor的Run receipt在finalization之前观察为1次settled/direct120total；finalization进新anchor，不能把新anchor剪裁后的operations当同一账本。旧source在最终revision仍可exact读取，原action trace与新narration一同发布，历史前缀不变。

m8-g06-long-turn-v4.log 单项通过（source `7d21baa91`），外部API0。v1逐条1000次持久化准备约3分钟时poll还无结论，曾执行本地终止；因此v1有local消费证据而无整项通过结论，不能按早期poll写成零发送；原log保留，不计性能分布。改为原publication合法批量预载后v2同样只计narration而漏authority action trace失败；v3误把原Run operations object当array失败；修正fixture期望及在产生anchor读取正式receipt后，仅该单项定向重测通过。未改生产存储/预算规则、不扩成全局性能组。

### G06 Memory 呈现修复后的两条长篇 Session 局部复测

目标仅核查此前两条长篇的当前记忆/持有越界，停止条件固定为2次fresh生成及2次原主模型完整合法Context旧/新盲评，总上限4请求，无retry/fallback/重评。producer `0cd35d851`（packing行为producer仍`5595e0840`），沿原primary account/config、Host Session/Project grade、原Run/Task charge及24h2000/20RPM append gate。两生成和两grade请求先本地preview，grader估计input12056/12074；preflight API0。私有builder初误用+字符串失败，配额摘要初GBK读UTF8失败；原M1/HM1及原paid矩阵都不重跑/覆写。

4次actual HTTP200/direct totals28331：generation5002（recompute2903/reuse2099），critics23329（11819/11510）；gateway reported total不等于input+output时仍保留直接值，不推算reasoning/货币价格。currency/upstream/cache unknown。该audit时rolling24h693、last60s0，原限额2000/20未变，无reset/refund。M8累计actual35次、direct reported64919，原2次unknown上界17515及1次fetch前失败的quota admission仍单列。

必须收窄前节与原runner的long标签：500是原始source fixture总数，**两份paid report的实际合法检索corpusSize均为256 documents**，并非全部500来源都在合法域，更不是500轮持续生成。原paid selected6/new selected5，仍覆盖required s08-020；新header/authority/epistemic字段增加固定2400 UTF8估计预算占用，使1条distractor不再入选。不是严格同输入消融，不能宣称修复因果或reuse收益。n1每臂generation E2E11933/5454ms，对原2033/13876ms有涨有降，无分布/SLO/节费结论。

同模型盲评当前两例六维全部2，同时将原两例来源/unknown降为1。但**完整quality仍false**：new reuse仍写“这件事确实尚未履行”“而它至今还没办妥”。原normalized Context确认当前World只hp/location，无当前履行字段；完整Context提高了可见证据，仍是同模型观察而非独立事实真值；两旧错误被局部避免不等于两例完整source-boundary合格。

不覆写v1或原reports。该有限paid组结束，不为提高分数追加生成/评价。下一具体根因是原packing已计算的时点适用性是否真正进入每个Context evidence group；

### G06 检索时点适用性进入实际 Context

source `e1b3de862`。ranked把普通active Fact/Relation标题写成Current facts/relations且缺authority/epistemic；其实际Native evidence仅取doc.text。复用packing唯一record呈现，两个packing及ranked原生evidence均携原authority/epistemic与temporalApplicability的requested at及supported/outside/not_established三态。只呈现既有判断，不根据turn文字、source active或承诺推算当前cognition/持有/履行；requested time可为历史，未建立适用性不等于来源无效。provider current/conflict/history仍各持原epistemic，不加source未知时点来降级正式当前字段。头部规则共用，不新增writer、案例语言过滤或第二时间权威。

1项新增真实provider conflict双来源呈现；long仍500原始sources、256实际合法documents，不升级为500轮持续生成。

改为识别原recalled metadata及读取已有relation false判断，未改Corpus权威。provider和long分别定向通过。v1/v2失败及各通过log均保留，不计重复为distinct。

该呈现组已结束；下一正式依赖是G06实际质量出口：只对前次已明确失败的reuse输出做必要新producer有限消费及零API来源判定，不追加同模型评分或刷原配对矩阵；H3无已配置真实辅助服务仍保留简单路径，H4已有有限本地收益不外推。main未集成，无HANDOFF。

### G06 时点呈现后的单次实际正文：仍失败

限定组仅1次新producer `e1b3de862` 长fixture Session/reuse，maxNewRequests/原Run maxRequests=1、retry/fallback=0，无model grader；preview API0后沿原primary target/account和原2000/20 append gate实际HTTP200。generation direct reported input1219/output68/total2981，原Run attempt settled且usage与raw/normalized一致；E2E15.033s只为n1，无SLO或收益。M8累计actual36次、direct reported67900；两旧unknown上界17515及一fetch前quota admission仍单列，不推算currency/upstream/cache。

正式当前World只有hp/location。raw历史也含原第二十轮过去“未履行”，不产生当前completion/cognition/custody权威。信息呈现工程通过不能当正文质量通过；不再增加同例生成或盲评，也不叠加案例prompt/regex/writer。

m8-g06-temporal-consumer-live-v1/raw/normalized及audit-v1均append-only保留；500仍原始fixture sources，实际合法corpus256；预算内selected3（此前5/原6），required s08-020保留，reported input改变，不能推断严格同输入因果改善或reuse收益。该具体paid组结束；原矩阵qualityPass及完整G06/HM2仍false，main不变。

下一可独立正式依赖为G06长入口的实际Memory检索消费：此前500轮预载Turn只消费构造的合法候选。有限本地补其原SourceLifecycle→Information eligibility→retrieveMemory→同anchor原Turn路径，不再加外部API、不扩writer或H3算法；它只补工程消费者，不能洗掉本节真实正文失败。无HANDOFF。

### G06 长 Native Timeline 的实际 Memory→Turn 工程消费者

source `4b1ece967`，单项m8-g06-long-memory-turn-v1.log通过，外部API0。经原Session publication合法批量预载500对user/assistant后，原projectNativeSession→SourceLifecycle readOnly snapshot→Information narrator授权→eligibleMemorySnapshot→retrieveMemory确实读取旧promise；未构造检索正文、未持久写派生/cognition/source。Memory结果由fixture映射为既有hostMemoryEvidence入参，再走原executeTurn/scheduler/authority-first action/finalization，不证明UI自动Memory bridge或500来源全部可见。

Timeline1004→1006，原view有界授权下实际Corpus63 Episode documents，选2sources，Memory估计UTF8计数1574≤2400；1次真实loopback HTTP，wire9229bytes，原Run在finalization前settled/direct synthetic120total。旧revision反例在HTTP前拒绝；原历史前缀不变、旧source在最终revision可exact读取。最终revision之后held eligibility拒绝，撤回memory grant后新eligibility拒绝；

当前真实正文completion失败仍保留，完整G06/HM2未通过、main不变。真实失败、费用及unknown不改。无HANDOFF。

### H4 只读 ledger 观察撤销原 currentness proof

source `5fa2f7dc9`。先实测5新反例均失败：另一正式writer持久改ledger、ledger删除、read ok=false、未知version后，原只读快照仍assertCurrent成功；冷启动完整ledger只读也未建立原proof。复用SourceLifecycle原private cache/token修复：只读合法raw读取即同步替换/撤销旧身份，只有已存储的完整normalized ledger可成为token；缺失、不可用、transport rejection、未知version撤销。reconciliation只撤旧token，cache仍保存其raw ledger，不发布未持久projection，原snapshot输出clone/freeze及WeakMap证明规则不变；source/provider改变被只读观察后，同字节恢复也不复活旧token。无新authority、epoch/缓存账本、source writer或持久副作用。

补一个具体边界初测也FAIL：raw replacement已返回，但后续provider projection抛错前旧proof仍活。将raw观察处的token撤销前移到provider读取/任何awaited projection之前，并在同步source/provider reconciliation观察改变后先撤旧token；单项后测及受影响group通过。撤销不以projection成功为条件，恢复原ledger字节仍须新身份；不宣称未被任何读/源事件观察到的外部修改会同步自动发现。

初五fail、projection fail以及各修复pass logs均保留；

它是实际读链的工作量和正确性，不是新的latency/Embedding/费用收益；此前100/1000/10000数值只归其原producer，未重复基准。缺失ledger的Native只读重建仍无派生reuse proof，原长Memory消费者不据此宣称全部可缓存。

最终producer `5fa2f7dc9`补h4-readonly-ledger-final-compatibility.log，仅early-revocation移动后受影响的4旧项，全部通过，仍不计新distinct；与boundary-v2的9新+queued旧1构成最终9新/5旧证据。无model/API0，无ATRIA_HM_REPORT，不写原B0/HM1结果或重跑M1。

停止后不扩规模/算法/paid模型，n3不成为SLO；旧数值/raw报告不改。

### H4 当前只读 proof 开销后的有限净工作量 / elapsed

source `5fa2f7dc9`；m8-h4-readonly-current-net-v1及零API audit-v1完成，无新产品改动。仅10000-document一个配置，真实Native FS vector index/loopback与原SourceLifecycle，source provenance为完整in-memory fixture ledger。先分别记录index准备7461.24ms/159local requests、corpus准备3111.93ms/2local requests，再固定3对交替AB/BA/AB测量；准备不混入warm样本或抹掉。两臂测量都index-warm，每次snapshot计入总elapsed；不是Native source-store IO/Information权限收益，也不重跑旧100/1000/10000全矩阵。

full recompute p50/p90=3039.49/3073.40ms；valid corpus reuse=696.04/728.98ms，均n3有限同机配置，无统计推广或SLO。6测量及2准备的完整evidence SHA相同a667e67d开头、同selected3sources、原2400预算内、readOnly persistence/access writes0。保存工作归source-valid corpus/fingerprint，不归正文/工具完成状态。

测量两臂均2local service requests/query、642request bytes/165310response bytes，内部query embedding intent=1但固定[1,0] vectors绕过实际推理，real Embedding/model/API0。故无远端请求、Embedding或货币节省结论；currency/upstream/cache保持原unknown。prepare161+measure12=173local requests真实保留；该有界组结束，不增加样本或分位数；

### G06 Native Memory 原文的请求优先级

source `632ca314a`；按 behavior-context §3.2，剧情 / Memory 原文是低信任来源数据。此前保存的真实请求也有历史Memory record进入system。这是产品数据边界缺陷，不把它推定为此前自由正文失败的唯一原因。

复用既有context.history/user数据通道，完整Memory record、sourceRefs/provenance与预算保留；current_state_event、正式World与runtime_system继续原路径，无新IR种类、writer、案例prompt或正文过滤。1次loopback请求，非新外部模型/质量样本。公开工具allowlist/outputContract没有由Memory引文扩张；该本地组关闭，外部API0。

已有授权G06目标仍需新producer真实正文质量与双入口消费证据，旧失败/费用原样保留，不能凭本地修复宣布通过。配置gateway的Responses/Anthropic实际404，真实Embedding/rerank服务及货币账单证据未配置/不可得，明确unavailable/unknown而非零成本；这是服务证据边界，不是新增审批。task/adaptive及H5新cognition/writer没有当前已实施消费者，H5正式依赖M2/M3/G06，不绕过阶段前置。不新增服务、学习路由或H5 writer。后续仅在当前授权和有限支持矩阵内推进有依据的消费/质量出口。

### G06 请求优先级修复后的有界真实正文配对

producer `632ca314a`，m8-g06-data-role-pair preflight/live/audit-v1是新append-only组。只同primary account/endpoint/model，long Session的recompute/reuse两臂，max2、retry/fallback0、无模型grader；非原矩阵重跑。preflight无发送，live恰好2HTTP200、原Run2settled，direct totals2890/2192，合计5082；M8累计actual38/direct reported72982，此前2unknown/upper17515与1admitted但fetch0仍单列。

两臂完整actual request JSON与request SHA相同、同reported input1226、同selected3sources/required s08-020，actual legal corpus256/raw fixture500；均实际Memory user、currentWorld system，正式状态仅hp/location。E2E15373/8486ms各n1，不能称SLO或reuse性能/费用收益；相同请求只比较新鲜正文，未隔离before/after修复因果。

quality仍FAIL：recompute“这项承诺至今尚未履行”“那件事目前确实还没有完成”；reuse“那件事确实一直未曾履行”。历史source只建立旧turn未履行，record historical_source及requested-time未建立，原当前provider无completion/cognition/custody。这是有来源的自由正文审查，未以自动regex/盲评高分洗掉失败；audit时rolling24h696/2000、last60s1/20，后续不原样刷新本组或新增critic。完整G06/M8/HM2未通过、main未集成。fetch确认最新main仍3ee1332ef，任务分支ahead24/behind0，无M1/HM1重跑或无关改动。

### H3 可选 rerank 异常返回的基础路径保留

source `8a89b028f`，外部API0。现有合法候选先送rerank，再按响应index/score排序；Memory consumer此前接受空结果、负/越界索引、null score转0、重复索引或混合坏项后仍标completed。按hybrid-memory §7 / delivery H3的服务异常出口复现6项修改前FAIL，非新增算法/服务。

6新反例及2旧normal rerank/ordinary skip通过（hm2-rerank-invalid-before/after-v1.log），product ESLint/diff通过。没有新rank cache、H5 writer或正文过滤，实际模型quality FAIL与所有旧报告保持；

当前收口：source 8a89b028f已push，main仍3ee1332ef；只修复实际定位的低信任lowering/只读proof/异常service结果。下一真实G06质量证据需外部主模型发送，不能用本地合成结果完成；监督任务通知其追加发送协调请求被自动审查拒绝（目的地/载荷/用量授权不足），本轮2actual请求在通知前已完成，之后外部发送0。该通知不是模型拒绝/配额耗尽，配额仍有余量；不绕路发送、不新增本任务审批。缺真实Embedding/rerank/账单是服务证据边界，H5缺M2/M3/G06前置是阶段边界，分别保留。没有可确认的其它本地根因就不编造功能、改案例prompt或循环采样；不标完整交付、不集成main、无HANDOFF。

### 正式剩余依赖审计与 G05 scoped Embedding 发送消费者

继续实际Plan审计发现前节“没有其它确认本地根因”不能当正式剩余功能已完成。model-routing §7.4要求Runtime checkpoint经原StorageEngine/recovery持久化，当前private Map/process_only并未做到；task/adaptive及fork/restore/compaction unavailable只是checkpoint事实，没有冻结矩阵永久排除它们。compute-policy §3–4还要求Embedding/检索/CPU/索引及后台开销预算；现有Native `/insert/query/query-multi` payload不接受computeContext，原adapter没有发送charge，这同样是可本地推进的工程缺口。真正服务/账单证据与H5阶段前置分别保留，外部拒绝不阻挡这些工程项。先冻结g01-substrate中的一个有限G05组，再继续checkpoint恢复消费者。

补充准确边界：前节rerank异常描述归因过宽。8a89b028f修复的是它仍允许的空array，以及Memory通用service consumer的二次边界。6本地坏项不能都冒称实际Native HTTP穿透，仅空返回有该原生路径缺口。原失败日志/真实正文/费用不改。

source `de29eaee2`：原Native Memory已有Information Session anchor，现将computeContext沿insert/query转发，Native middleware接受insert/query/query-multi的同一原Session/Project Task上下文。首批实际发送budget consumer沿原OpenAI-compatible Embedding adapter family，目的指纹retrieval.embedding；每HTTP batch从原Run lock/Task CAS charge，独立private per-send WeakMap ticket对应同一次settle，不增加账本/预算authority/target。rerank沿同一ticket接口保留原直接usage/unknown语义。已报告usage在vector shape拒绝前保留，失败/取消无total保留unknown上界。

同时复现两臂Session/Project在移除Route预算后Embedding会变unbounded的中途回归，before均FAIL；修复为每次send仍调用原chargeCompute/chargeGeneration，由原authority继承持久limits。原从未有额度的OpenAI-family旧scope仍无compute receipt、不自动生allowance。没有computeContext的旧profile/manual调用仍原行为，本组不宣称account-wide硬额度。其它scoped provider暂未实现该budget映射，推理/发送前明确unavailable；scoped browser WebLLM在client inference前拒绝，不耗GPU后再假称零-cost。未scoped旧资源/协议读取和实际请求保持，本组不称所有Embedding/local CPU已实施。

Native budget refusal此前由vector error handler吞成generic500，改为原429/error code且不触发清空/重建；未完成Embedding批次cancel原Vectra update，既存index保持，已发送前批仍收费。

product ESLint/diff通过，source已push，外部API0/没有新primary正文或critic；旧M8 actual38/direct72982及失败/unknown保持，main仍3ee1332ef。无HANDOFF。

### Runtime private checkpoint / 原StorageEngine恢复与有限Responses Task消费

source `0a3f98d10`，补充配置删除ABA修复 `d62cb73c4`，均已push，外部API0。依model-routing §7.2–7.4先冻结g01-substrate物理契约，再复用既有Native storage kind/owner key/`withRuntimeWrite`与原account recovery。`atri_runtime_checkpoint` key为handle+随机checkpointId；没有public CRUD、新服务、domain/Memory/Package字段或H5 writer；实际portable snapshot/full-Session Save导出均无opaque resource。

工厂仅Host根据真实projectTaskEvidence绑定private store；原public conversation不接受providerState，Studio重新进入只送完整保存的public history；server据当前Task history自动重建private引用，并在count/render/send重读存储。历史编辑/Task ABA不复用旧opaque；任务final response也可在此scope保留checkpoint，fresh/transferred观察只说明本地lowering，不代表上游复用或收益。FS/SQLite各一次独立Node进程实际Host→loopback恢复通过，另原account snapshotUser/restoreFromSnapshot各一次通过。

一个实际Studio前置根因：原normalizeToolCalls/assistantToolMessage重写Responses arguments JSON，合法原生checkpoint因此被拒绝。新真实Studio/routers/Host两轮whitespace/键序反例before FAIL；保留raw.function.arguments、工具执行仍用parsed args后PASS。opaque只留private store，public response/snapshot/Task conversation与Studio revision均无原生private sentinel。

同毫秒编辑ABA反例HTTP0通过；随后发现同毫秒delete/recreate可真实复活旧in-flight authority（before FAIL），修复为原record `doc:null`保存删除版本metadata，profile get/list仍不存在，重建沿原metadata单调递增，无影子kind或版本服务。

async发布反例before-v1取消/timeout均真实FAIL；Host task policy等待原worker结束，after-v2只重跑取消PASS；所有返回失败均等待private discard，已经实际报告的usage20仍沿原Task账本settled，没有扣除已经发送成本或假报0；失败日志全部保留。

ESLint/diff通过。各原始log均在private Document，关键顺序为g04-responses-arguments-before/after-v1，runtime-store-after-v1 / runtime-recovery-after-v1，consumer-after-v1(3 fixture FAIL、5 PASS)/after-v2(只重跑3 PASS)，studio-recovery-after-v1(fetch bridge fixture FAIL)/after-v2(3 PASS)，async-before/after-v1/after-v2，settlement-after-v1，authority-store-after-v1(8)/authority-consumer-after-v1(9)，cold-process-after-v1(2)，protocol-compatibility-v1(4含new arguments)/native-messages-compatibility-v1(1)，config-clock-after-v1(1)，final-timeout-after-v1(1)，delete-aba-before/after-v1、delete-aba-sqlite-after-v1、delete-recovery-after-v1(5含3 old)。fixture失败未冒称产品缺陷，producer只归本组实现，不转移此前paid质量通过。

原M8 actual38/direct72982、旧unknown2/17515 upper/admission fetch0、M1/HM1 ledger pins与所有不利正文不改。剩余adaptive/其他品牌与Session Task消费者、安全fork/restore扩展/compaction、G05 CPU/index/background预算按正式依赖继续；H5仍有M2/M3/G06前置，外部追加primary/Embedding/rerank/critic/probe继续暂停。此为实施Record，不是HANDOFF。

### Runtime continuation准入与原Task费用边界补验

source `2a282ed73` 已push，外部API0。增强原同毫秒反例before-v1真实FAIL，出现1条unknown send attempt。复用同一私有lease的非消费inspect，在原Host Task freshness之后、compute charge之前await adapter currentness；之后4个相关反例通过：同毫秒编辑、FS/SQLite删除重建均HTTP0/Task attempts0，已有checkpoint的Secret期间删除只保留原1实际发送；合法FS Task两轮与旧Responses none两轮各1通过，原发送/usage不变。product ESLint/diff通过，before/after/valid-v1 append-only，distinct仍原34/7不重复加数。后续若charge之后竞态或真实HTTP发生，继续原保守unknown/settle规则，不声称跨store/charge/HTTP原子，也不虚构费用退款。

### 有限Responses/原Studio Task adaptive生命周期

source `dcf69fe29` 已push，外部API0，未集成main。没有新classifier请求、默认learned router、opaque域字段或H5 writer。实际Snapshot在HTTP前固定requestedPolicy/effectiveScope/action/reason/sourceCheckpointIds/loss，response observation追加同一决定，gateway内部复用仍unknown。

修正此前有限task消费者的范围：旧source在history编辑/Task ABA后有public fresh路径，但没有证明task policy允许reset。现在task policy只在完整且唯一的合法checkpoint上继续，已保存assistant历史缺失/不匹配时HTTP前拒绝；首次Task可start。adaptive才允许reset，且必须匹配原Task保存history的既有`projectAgentResumeMessages`获准public projection。Studio每run只允许一次本地重新编译，原failed generation attempt记录保留，未发模型HTTP/未占发送额度不消耗model round；重新推理仍沿原Task预算。历史伪造、缺task能力或非Task source不能借adaptive重算越权。投影reset之后cold history若不再匹配compiled prefix会再次明确reset，不冒称所有跨turn/品牌的恢复完成。

关键失败/修正：adaptive preview及Context token拒绝在countTokens中提前discard合法checkpoint，before-v1两项真实FAIL；原Task charge拒绝仍被GenerationService finally无条件清状态，charge-before-v1真实FAIL；Host仅在原预算尚未准入、无send/reset时保留，已准入失败仍discard。fixture改setHeader后retry-after-v2 PASS，最后admission-final-v1两项PASS。Task计数保留原1实际调用，未准入的第二次无新attempt；已经尝试的429仍第2次/unknown、不退款。其余studio-after-v1(8含3 old)、gate-async-v1(5含2 old)、old-protocol-ui-v1(3)、old-task-v1(2)均保留在private Document。最后ESLint单独运行PASS，此前同调用后置diff覆盖退出码但stdout显示58条indent失败的日志仍保留，只修新函数缩进，未将其写为lint PASS。

M8 actual38/direct72982、unknown2/17515 upper及M1/HM1 pins/不利基线保持；没有外部primary/Embedding/rerank/critic/probe，main3ee1332ef与H5前置不变。

### 有限 G05 Native insert 本地索引工作与最终发布

source `304d0d199f50f335a8bbcca466af10dec8e4d10c` 已push，外部API0，未集成main。先在g01-substrate冻结完成条件，再扩展原RuntimeRoute.computeBudget与原Run operation/Project Task的同一个compute ledger：可选localWork记录显式job/输入项/输入字节限额，实际model attempts/token/usage独立，不用默认1 token模拟CPU、不加shadow owner或默认allowance。原chargeGeneration/Embedding继续保留localWork limits，放宽/移除Route、原account snapshotUser/restoreFromSnapshot及close/reopen engine+新RunControl不能恢复余额。中断的已charged工作继续占输入上界；本组不是所有foreground restore/fork或历史费用保存保证。

实际Native router insert→原Vectra在有界临时副本完成，原owner/profile/collection路径单Host写permit涵盖排队、更新、发布、清理/settle；Native delete/purge也同路径串行，但其成本准入仍未完成。工作准入先于Embedding与index IO，拒绝HTTP0且原index不变。候选vector数值/完整输入/旧与新index有明确有限上界，数值仅在g01维护；16MiB同步原子替换会阻塞server事件循环，CPU/延迟是实际观察而非硬时长cap。每项保留process.cpuUsage user/system微秒、wallMs、cpuScope=process与completed/failed/cancelled；并发process CPU不冒称单job独占，实际没有模型send不记provider attempt或造usage0。

真实发布竞态已留before：初实现await currentness之后还有mkdir/异步atomic write，最终mkdir期间取消/原Task setPlan，两项均真实FAIL（仍resolved并发布）。两项反例及受影响7项consumer通过。FS/SQLite普通Session实际insert均通过，不能把监督期间的风险推测写成产品缺陷。索引与账本仍无跨域原子性；写失败旧bytes保持，publish后settle不可写仍按charged上界保守占用，不退款已发生Embedding费用。

输入项/字节拒绝2；实际Task在Embedding后改变+移除Route继承1；取消/第二次upsert失败保留旧index2；等待permit取消不charge1；最终mkdir取消/Task改变2；原子rename失败1；FS/SQLite未settle charged经account recovery各1（模拟中断窗口，不冒称新Node杀进程）；实际Narrator charge保留另一lane1；超大旧index/返回vector拒绝并保留usage1；原Route editor保存已有localWork1。15旧distinct通过：12原Embedding/Memory/Run/Task/Route移除/rerank消费者，2旧真实vector IO/purge及多protocol exact模型/Secret，1原Route预算editor。product ESLint独立PASS、diff PASS。

原日志append-only在private Document：g05-local-index-after-v1（6 fixture FAIL/2 PASS，route误用roleId与null status helper）、after-v2（修fixture只重跑6 PASS）；publication-before-v1（2真实FAIL）、publication-after-v1（7相关PASS）；recovery-after-v1（4 PASS）；budget-editor-v1（2，含1 old）；old-consumers-v1（12）；old-protocols-v1（2）；lint-v1 PASS。fixture修正不归产品因果，原OOM/FAIL保留；API/货币质量报告没有新producer。

M8仍actual38/direct72982，unknown2/17515 upper/admission fetch0、M1/HM1 pins与不利正文/评价均不变。

### 有限 G05 Native query/query-multi 的索引读取与排序

source `1ccc6194a9934f621a5739a6118da402687db7ef` 已push，外部API0。先冻结g01完成条件，再沿原Native query/query-multi→Vectra LocalIndex真实读取/排序接入原Run/Task compute.localWork，种类index_query；没有新rank算法/缓存、owner ledger或默认额度。一次single/multi为1 job，输入项是collection数量，字节是冻结请求数据，不冒称扫描vector数/CPU时长。Embedding每实际send沿同一原父model限额另charge/settle，cost CPU/wall仍process范围观察。FS/SQLite实际insert+single/multi并发同父限制、移除Route、account recovery及close/reopen engine+新RunControl后额度仍有效。

多index按规范物理路径排序拿同一单Host permit，与insert/delete/purge串行，工作准入在读取和Embedding之前。query/collection/topK与读取候选/vector/总字节上界只在g01维护；坏/超界index拒绝，不清空/重建。空/缺index返回空候选，不创建文件，也不发送Embedding或记usage0；仍保留实际localWork。permit的read mode不误用assertWritable，旧unscoped readonly query兼容；有预算的durable写账继续服从原写权限。如果变化发生于cost settle后，已完成工作的outcome=completed仍如实保留，最终consumer失败另由原错误码反映，不能把成本completed当请求成功。

Windows真实反例：不同大小写collection名字原来被当两个paths，实际scan同一个物理文件，before-v1返回200而预期503，1项真实FAIL。不新增跨进程/多writer保证；原scope/物理读/账本/网络响应无跨域原子性。

13新distinct通过：FS/SQLite各1混合insert/query/multi并发+Route移除/recovery；空index no-send/no-file1；readonly旧路径1；坏index保持/有实际CPU但HTTP0/无fake model usage1；输入collection/查询bytes/topK准入边界1；实际Task在Embedding期间变化并保留usage1；结算后取消/Task变化拒绝但completed成本不退款2；反向multi路径并发避免deadlock/重复charge1；排队取消不启动work或provider1；物理候选/单vector/总vector扫描上界1；Windows casealias1。4旧distinct通过：原query-multi剩余model额度并发、Memory实际client anchor转发与真实vector IO/purge3，加上一组原insert排队取消1。重复不计新增。

没有重复OOM/全仓测试/真实API或新的primary/critic/Embedding/rerank/probe；M8仍actual38/direct72982，unknown2/17515 upper与M1/HM1 pins、不利质量和main3ee1332ef保持。

### 有限 G04 Native Anthropic/Gemini 原Studio Task持久恢复与ordered payload

source `d0f0bfeede0829b55c374a42192c12eb1c401911` 已push，外部API0、未集成main。先冻结g01合同，再沿原native-messages-provider + private envelope/lease/RuntimeCheckpointStore/原Studio Task，支持有限task/adaptive；能力仅在本地synthetic fixture发布，不更新真实路径。原Task public history/current executionFingerprint、配置mutation anchor、Tool/Output/Policy不绕过；

完整Anthropic thinking/redacted/signature和Gemini parts/thoughtSignature只留private Runtime，public Snapshot/Task无opaque，独立Node通过原FS/SQLite恢复。Anthropic只有reported input/output、没有total时仍unknown/保守上界，没有相加伪造total或金额；Gemini direct total按原Task settle。旧none/active direct count/render继续同步兼容，新durable路径Promise由原GenerationService await；

一个有依据的private存储根因：原native content以对象存入JSON资源，归一化对象键序的本地codec模拟可改写回传键序，两项before真实FAIL；对象toEqual不能证明顺序，实际Host/冷Node opaque数组改为JSON.stringify比较。最小修复仅在原private store：内部doc codec v2把opaque content保存为有序contentWire JSON字符串，读取解码回数组；

v1 object-only private checkpoint明确失效，不重构或无损迁移opaque。原public handle仍schema1。原Studio adaptive在保存的public history遇v1失效时只做一次获准public observation projection reset，Snapshot/observations记opaque_not_restored loss；不伪装继续旧state。portable/domain/Memory/Package不加opaque字段。真实cancel publication两brand等待原worker清理，已发生Gemini total20仍settled、Anthropic partial12/8仍unknown，不退款。

两brand×实际Studio cold public history/编辑历史拒绝/adaptive missing reset/adaptive legacy reset共8；private publication取消2；object-normalizing codec模拟2。20受影响旧distinct通过：8原store cold/owner/tamper/prefix/backup/TTL/readonly/大小计数/portable/通用replay，3原Responses cold Node/Studio restore/adaptive missing，9原native stream valid/missing terminal/nonstream signature/private replay（各两brand）与Studio Gemini active。重复不计新增，未做全仓复测。

append-only日志在private Document：g04-native-task-after-v1（12 PASS/2 fixture错误码FAIL，预期credential_echo而产品正确返回contains_secret）、safety-after-v2（仅修fixture重跑2 PASS）；studio-after-v1（8 new PASS）；store-compat-v1（4 old PASS/2 fixture内部doc.content期望FAIL）、store-compat-v2（4 PASS=2 fixture修复+2旧cold）；legacy-v1（6 new PASS）；old-protocols-v1（9 old PASS）；lint-v1独立PASS、diff PASS。store fixture修为私有doc.contentWire解析后的期望，原read.content接口不变；两类fixture失败不冒称产品修复。所有原FAIL/OOM/付费正文与费用保持，未重跑早先OOM或M1/HM1/API评价。

M8仍actual38/direct72982，unknown2/17515 upper/admission fetch0、M1/HM1 pins与main3ee1332ef不变，G06真实质量仍FAIL。
### G05 — 原 Native query-by-vector 本地工作与有界读取

2026-10-11 source `1d1bf3f7906dc7c08b13c6ba13e00b8213ae5e5b`，沿原task分支push，main `3ee1332ef`不变。先在G01冻结一个有限其它read消费者，后台模型已有原window/period/reopen/restore准入，未重做或冒称后台全部成本已完成。原query-by-vector allowlist不接受computeContext，before-v1三项400：这是新合同尚未支持的入口，不证明合法scoped请求已绕过预算或坏向量已准入。

原Native供给向量沿queryNativeIndexes，不增sender/store/预算authority，单index_query job沿原Run operation/Project Task localWork。严格有限数值/维度/topK、冻结输入字节/队列前向量副本，保持原index文件/候选/向量扫描边界；legacy map(Number)移到非Native分支，Native不先对未限长输入分配转换数组。无候选不创建文件、不调用Embedding、不伪造usage；实际CPU/wall记在原lane。异常index保持原样，不自动regenerate。

10新distinct通过：FS/SQLite实际mixed insert/供给向量并发/Route移除/account recovery/冷RunControl2；非法供给向量/65537维度/topK/threshold1；空index1；输入字节限额前index IO0一项；旧无scope readonly与scoped browser profile不触发推理1；实际query期间cancel/原Task变更2；等待physical permit输入冻结/取消无准入1；坏index保持与已观察工作1。8旧受影响通过：原query空index/输入边界/Task变动3，query-multi逐send1，unsupported scoped Embedding1，后批拒绝保持原index及旧供给向量读取1，原real vector IO1，browser scoped推理拒绝1。

append-only private Document日志：g05-supplied-vector-before-v1（三项400 FAIL）、after-v1（3 PASS）；old-consumers-v1（8旧PASS）；lint-v1独立PASS、source/docs diff PASS。不运行大内存/OOM测试。没有把fixture错误声称产品修复。累计10新/8旧，不把重复计算为新增。

本组外部API0，保留M8 actual38/direct72982、unknown2/17515 upper及admission fetch0，M1/HM1 ledgers与全部原FAIL不变。
### G05 — 原 RunControl HEAD变化、后台退出与terminal期间晚到费用

2026-10-11 source `f1a04c041a81da680835f12bd3e8ded978b73eeb`，原分支已push，main 3ee1332ef未变。实际Native Embedding/index在provider HTTP等待时append Session HEAD，FS/SQLite两项before-v1都丢原operation/model+local成本；readRunControl原HEAD裁剪在settle之前删除receipt是根因。不是只因新增摘要字段缺失而宣称破坏：原旧scope operation已消失、两个settle入口均无原receipt可写，已有HTTP和未发布index保持的事实也保留。

最小修复仍在同一RunControl/control资源：current scope与charged pending原operation保持；旧scope所有成本settled/unknown后累积retiredCompute并删旧selection/fingerprint/details。正常已完成历史不制造128回合终身cap。摘要只是累计观测，model/send与local job不合并，unknown保存数量/上界与已报告input/output，不推算total、金额或新allowance。local输入项/字节、实际process CPU/wall及completed/failed/cancelled/unknown计数分别保留。Native新HEAD仍按原turn原准入，无旧anchor generation或index发布权。

已有receipt的settle-only通过status access，dead/terminal允许结算并仍受readonly；新charge/Session/world写入继续原拒绝。真实terminal额外FAIL发现SessionRepo清理明确operations={}，现在同一retire helper保留charged后清原世界/Save状态；成本记录不作为恢复world/铁人复活依据。原ironman terminal两次cleanup路径均保留原receipt，最终settle后压缩。resume沿同一control可选摘要导出/导入，public portable无opaque，不新建费用owner/外部日志。

16新distinct PASS：两engine实际HEAD变动保留model/local2；实际fork/历史Save restore期间原Native HTTP2；两engine admitted interruption/account recovery/HEAD失效/保守partial unknown2（模拟准入中断，非杀进程/真实发送）；ordinary/ironman真实声明authority death后late成本与readonly/新工作拒绝2；两engine原resume export/fresh import/同店import保留累计unknown2；两engine×actual后台intent completed/withdrawn、原window charge/unknown上界4；reportedInput/Output只累计已报告值，不代表缺项0或完整总计；process观察可重叠，不是独占工作或全进程精确总CPU。

21受影响旧distinct PASS：两engine stale exact-delete、ironman death cleanup、部分delete/marker中断、terminal取消原scheduler、failed turn selection/原resume消费共10；两engine已有background failed bounds/reopen/restore、unrelatedHEAD pending、防not-due/stale免费preview、跨窗口period cap共8；两engine Native insert并发原limit/Route/account恢复2；原closed portable continuation1。独立lint-v1/v2/v3与source/docs diff通过，失败不以之后git命令退出0遮蔽。

append-only private Document日志：g05-retired-work-before-v1（2真实FAIL）、after-v1（2 PASS）；recovery-v1（6 PASS/1 fixture FAIL，restore保存并立刻恢复当前HEAD是原no-op，实际HEAD不变，未为它改product epoch）；run-resume-v1（2resume PASS/2真实death/readonly FAIL）；terminal-restore-v2（实际历史restore fixture及death/readonly修复3 PASS）；background-v1（4 PASS）；final-v1（写账schema/capacity保护之后15 PASS，130 actual scopes28.294s整组选定耗时）；observation-bounds-v1（1新增摘要合法性PASS）；old-consumers-v1（21 PASS）。新增duplicate不重复计数，M1/HM1/G06 paid/原FAIL/OOM全部未重跑/修改。

压缩后的settled/unknown没有逐receipt identity，不支持额外late/repeated reconcile；原worker未完成的charged继续保留，不猜unknown退款。旧版本已经裁剪的成本无法重建；真实G06质量仍FAIL、Embedding/rerank语义及金额收益缺证据。本组外部0，累计M8 actual38/direct72982、unknown2/17515 upper/admission fetch0与M1/HM1 pins保持，无HANDOFF。
### G05 — Native Memory 原索引枚举成本

2026-10-11 source `77820a6d2b98ad470f051517fe27a7304414de22`已push，main3ee1332ef保持。旧allowlist不接受computeContext，FS/SQLite before-v1均[400,400]，是新scoped合同未支持，不声称已复现合法scoped预算绕过。

不实例化Vectra做额外ranking/Embedding，不缓存枚举、不建空index。localWork扩index_list类别，每次1 collection/冻结输入字节；沿原Run operation/Project Task共用job额度、原account/Route limits。坏/超界index保持原样。Hybrid现存与retired派生namespace枚举转发已有computeContext；delete/purge仍原串行但成本尚未接入，源Timeline/Information/World不变。

10新/加强distinct PASS：两engine实际并发list与insert共享额度、Route移除/account恢复2；空/坏/超界/readonly读取4；加强原Memory consumer为两配置，maxJobs3实际list→insert→query三工作/两模型发送，maxJobs1仅list准入、Embedding0并合法基础检索降级2。11受影响旧PASS：Native原query空/输入边界/Task变化3、query-multi1、供给向量非法边界1、real vector IO/配置边界2；Hybrid vector可选失败及late source硬拒绝/content-addressed index/forged grants/pinned Information live revision4。

append-only private Document：g05-local-list-before-v1（2 FAIL400）、after-v1（2 PASS）；safety-consumer-v1（8 PASS）；old-native-v1（7 PASS）、old-hybrid-v1（4 PASS）；lint-v1五相关product文件独立PASS，source/docs diff PASS。实际cost观察依旧process切片，已完成工作不等于consumer可接受；纯list没有provider usage0或金额推断。原paid/失败/OOM/原始文件与费用保持，本组外部0，M8actual38/direct72982、unknown2/17515 upper/admission fetch0不变。

### 2026-10-11 有限 G05：原 Native 单文件派生索引 purge 成本

原source de9f3bb2d，合同docs531f6f139先冻结；产品f07553645d9e0779c91b391029ff5e93c4ddd568，根目录拒绝修复4818ff76d9d213393a27527df1c38ed195d2c698均push。冻结段日期原误写10-12，按本机git实际提交10-11纠正。只接原Native /purge与原client purgeCollection computeContext；index_purge仍为同一Run operation/Task localWork，原physical permit和publication lock，未添owner或源writer。只有隔离可重建fixture，没有任何真实资料purge或legacy purge-all改动。

18新distinct PASS：FS/SQLite insert+purge共享两job与Route移除/account恢复2；helper受控cancel/Task变化/Session HEAD变化/unlink故障4；坏JSON/未知sidecar/metadataFile/16MiB越界/10001项5；namespace/parent/root junction3；missing+unscoped+源Timeline保持1；readonly/bytequota before-IO/queuedcancel/static越界无charge1；提交后settlement中断charged保留并原receipt恢复1；actual Native client exactref/anchor→HTTP实物清理无inventory/infer1。运行FS/SQLite，不声称PG/MySQL、真实服务或进程kill。

私有Document追加日志 g05-local-purge-*：before-v1 1FAIL400旧computeContext未支持，不冒称预算绕过；after-v1两engine2PASS；safety-v1 13PASS；cancel-v3同一项PASS；old-v1 9PASS。root-before-v1 1真实FAIL（root junction此前HTTP200，fixture index已被unlink）；root-after-v1 9PASS含1新root+7受影响新+1旧，不重复计数。source/docs diff PASS。

提交前拒绝保留原文件；CPU仍原process切片/输入观察，非CPU硬期限/价格。外部API0，M8 actual38/direct72982、unknown2/17515 upper/admission fetch0及原付费FAIL不变；其它CPU/cache/local inference/后台、Session Task/fork-compaction与H5前置继续，无HANDOFF。
### 2026-10-11 有限 G04：原 Session Skill loop 的 exact public tool arguments

合同docs323c91643先冻结；source f48e90323d51e389ad2776a0ccdbb40eb8fdd1bc已push。只改原runNarrativeSkillLoop的公开tool call arguments：优先已有normalized call.raw.function.arguments字符串，id/type/name仍原公开字段，无raw port则保留旧JSON.stringify。无opaque/public writer/Project Task伪装、新store或默认policy。

7新distinct PASS：FS/SQLite原Session Narrator+实际Host→GenerationService→Native Responses→只读Skill→第二model的none/active四路径，原参数空白/键序和完整reasoning/function_call items逐项相等；原Run两reported model20+20/four local jobs、源Timeline不变、对外只final prose/无opaque。三个cancel-read/HEAD改动/local job耗尽反例实际first HTTP1后无second HTTP/无正文，reported20/two local jobs保留。10旧PASS：原narrative loop选择/pin/fallback无raw及停止4、Anthropic/Gemini none/active实际两轮工具4、原Responses none/active完整items公开隔离2；未跑无关整套，不宣称真实协议签名/跨调用或永久Session支持矩阵完成。

私有Document g04-session-skill-*：before-v1为fixture extensions.settings缺失；before-v3/after-v1 active两FAIL和diagnose-v1 firstHTTP0/nojobs，原因capability拼写误用policy下划线，均fixture准备错误，不是arguments缺陷。修fixture直接import正式activeExecutionCapability（连字符），保持原旧loop负控制再跑before-valid-v4 FS none/active2真实FAIL：第一HTTP1/first count-render completed/第二count failed continuation_unavailable；finally恢复修复代码，after-valid-v2 fourPASS。safety-v1 threePASS，old-v1 tenPASS，产品及新fixture lint-v1 PASS/source/docs diff PASS。暂时诊断打印仅synthetic phase/cost，已从测试移除，原失败日志保留。

本组同invocation公开工具历史与协议回传成立，但未据此宣称跨调用Session task/restart、safe fork/compaction或行为收益；继续原Task消费者/公开历史/owner边界依赖，不借Studio身份或自动reset。外部模型0，M8累计actual38/direct72982、unknown2/17515 upper/admission fetch0及原M1/HM1/G06 paid ledger/质量FAIL不变；
### 2026-10-11 有限 G04：active request scope 的原 source 清理隔离

合同docs727bbe837先冻结，source b83281a387e82a09ff91db814907a45d43455bf6已push。原Task scope完全不变，不新建owner/store/shared checkpoint/源history，不扩大fork继承或automatic reset。

4新distinct PASS：FS/SQLite none/active，均同owner/target/requestId的两个真实Core Session分别先取合法public handle；一方第二HTTP实际取消并await原adapter cleanup、原ledger settled+unknown且estimated上界非零，另一方沿自己原HEAD与公开tool transcript仍第二HTTP完成reported20+20，两Timeline不写。24旧PASS=上组7 Session Skill +17 Native旧protocol（Responses source/path/history3、cancel2、Project none/active2；Anthropic/Gemini各two-round2/source/path/history3共10）。没有再次跑Task-private、purge或paid组。

私有Document g04-source-scope-before-v1 SyntaxError/零tests是新增fixture括号准备错误；before-v2一真实FAIL：两个Session先取tool state、取消一方并等cleanup，另一方continuation_unavailable，是requestId-only批清理造成跨source误撤回。after-v1四PASS（仅四新）/old-v1二十四PASS；产品及修改fixture lint-v1 PASS、source/docs diff PASS。

外部0与全部原baseline/付费结果/FAIL/费用保持，M8 actual38/direct72982、unknown2/17515 upper/admission fetch0不变。原Session Task的跨调用公开历史消费者、安全fork/compaction、剩余CPU/cache/local inference与H5前置继续，无HANDOFF。
### 2026-10-11 有限 G05：原 Narrator 按需 Skill read 同预算

合同docs4fa3110cb先冻结；source05f526fa8d9db173d0b6373c27c23c1ca10534ce已push。skill_read每call1 job，输入公开parsed name/args+原inventory指纹，ledger只有指纹/有界数量字节/CPU观察，没有Skill正文或opaque。旧无local限额不发明账本，默认未改。

cancel/head反例从two增强three job/read已执行，quota two jobs时read 0/second HTTP0，已报告first model20保持。
6真正新增case PASS：file_list实际repository port调用、read_failure failed费用、262144字符公开args在131072字节预算前拒绝read/list0、old_unbounded旧路径两send无local账本、read结算后HEAD变化three completed留存/second HTTP0、实际accepted fallback保留failed primary unknown+随后two settled/three HTTP/seven local jobs，Skill一次且仅同一原ledger，skillRounds显示真正fallback与原route。Skill repository port为synthetic pinned fixture，Core Session/Host/GenerationService/HTTP/账本为实际实现；不冒称真实资料文件IO已经跑。
16旧PASS：Shared narrative loop4、FS/SQLite两lane原count/render恢复4、无local-limit失败count原owner不变4、此前两个真实Session source清理隔离4。未再跑purge/paid/不相关协议全集。

私有Document g05-skill-read-*：before-v1 1真实FAIL（原账本仅four jobs，实际Skill工作无row；不是冒称模型quota绕过）；after-v1 seven增强PASS；compat-v2仅同一修helpercase1PASS；fallback-v1 1新增PASS；old-v1 sixteenPASS；lint-v1相关产品/fixture与lint-v2改动fixturePASS，source/docs diff PASS。

局部计量包含实际按需read/files、Scope/settlement费用观察；未启用classifier/prewarm/local inference等不会为了泛化成本而新建平台。SessionTask持久公开历史/safe fork/compaction与真实G06待证据是当前具体缺口，H5仍依M2/M3/G06前置；全部原baseline/paid FAIL/费用不改，external0，M8actual38/direct72982、unknown2/17515 upper/admission fetch0不变，main不变，无HANDOFF。
### 2026-10-11 G04 — 原 Session 声明 Task 的工具轮次先决消费者

source `23e95b69546931c91791511fb0b0a5adda68a7ae` 已提交/push，main保持 `3ee1332ef`。合同先冻结于 docs `c1fbcec5d`，当前有限剩余清单在 `4d3f744ae` 收敛。native binding使用 `session_task`、invocation、Session source、role与该fingerprint，不借Studio Project Task。普通Session caller不附store，仍不能获得task/adaptive consumer。三个原native port共享store接点；本组实际Session协议新增证据只有Responses，FS/SQLite、task/adaptive各实际两HTTP与完整reasoning/function_call/function_call_output保留原wire顺序/arguments；其他两个品牌的既有Studio结果仍只记其原消费者。

11个真正新增case：4个FS/SQLite×task/adaptive真实声明Package Task轮次，4个cancel_read/read_failure/head_change/work_quota，1个同invocation另一个实际Session的scope独立，1个缺公开history的private-only不完整恢复拒绝，1个普通Session拒绝。实际Scope同时有原branch/revision与Task/input fingerprint；最终Task结果沿原recordTaskResult持久与重复invocation缓存，重复调用不新增HTTP。每次完成2 model attempts，各20 direct tokens与5 local jobs（count/render/read/count/render），公共结果/Timeline无private正文；隔离case两个实际Session各40 direct tokens、各工具+最终2个private checkpoint，不把最终checkpoint漏计。

修复 `_executeTask` 的task/adaptive外层等待原taskWorker结算/清理，`cancel-v2` 同case PASS，成本3个local jobs/20 direct tokens、read cancelled、private0。read失败/HEAD变化同样await清理并保留已发成本；work_quota在下一count准入前拒绝、保留已有private1/3jobs/20tokens。临时恢复原Project-only attachment的 `negative-v1` 1预期FAIL证明原Task consumer缺口，finally还原产品；它不证明public冷恢复。`isolation-v1` 是fixture把最终checkpoint漏计导致1FAIL，产品无改动；`isolation-legacy-v2` 同隔离case PASS。private-only恢复case仅手工重放隔离fixture刚保存的完整原private row，第二call在HTTP前拒绝；未杀进程、未完成cold public history恢复。

22个既有cases最终通过：`old-v1` 的21PASS，涵盖原Studio Task quota/恢复/取消publication、原Session scope清理和Task结果/receipt幂等；另1个旧P3 borrowed-route mock曾失败，`legacy-baseline-v1` 在原source `05f526fa8`也FAIL，诊断为缺`chargeLocalWork`/`chargeCompute`旧mock端口，补两个null-return ports后 `legacy-v3` PASS，不改实际预算authority。生产3文件+新增test ESLint `lint-v3` PASS；旧P3 test lint基线/当前均0。所有日志append-only保存在私有Document，不提交夹具、secret或机器路径；Skill repository是synthetic read port，不宣称OS文件IO实物计量。

外部发送0，M8实际累计38/direct72982、unknown2/17515 upper、原admission fetch0及原质量FAIL不改。private保存/当前工具轮次不等于Session Task持久公开history或冷恢复；未启用classifier/Local KV/预热不扩为本轮必做；
### 2026-10-11 G04/G05 — 原 Session Task 公开工具历史与新进程恢复

source `fafdb8608cc354342cc0469da63ac56c0ce01790` 已提交/push，合同先冻结 docs `14c6c4c93`，main仍 `3ee1332ef`。可选原RunControl operation.taskHistories沿原invocation、Task/input/Session anchor fingerprint与Skill inventory pin读取/append-only prefix CAS；8项/operation、54消息/Task、6工具轮、64KiB/项与原control整体131072 bytes上限，拒绝容量不淘汰原history。只有公共assistant text/tool_calls与tool结果，严格字段拒绝providerState/opaque及生产effect工具；runtime CPP仍唯一private kind/contentWire。只沿原foreground声明Narrator Task，原background budgetContext拒绝本组task history，不挪用后台/其它用途额度。

每条工具assistant在读取前保存，每条公共工具结果在下一round前保存。新增task_history读/写与pending Skill read沿同一原Run localWork、所有model发送沿原charge；无local cap不新造默认额度。cold自动选择只来自该原history，完整原native prefix/Task scope/config authority/pin必须匹配；Session adaptive不借Studio public projection自动fresh/reset。正式Task结果及重复invocation缓存仍沿原结果/receipt CAS。

`cold-v1` 1PASS；`safety-v1` 11新PASS。

真实进程证据范围：一个fresh Node实际执行原安装Package/Session Task/Host/loopback，在第二generation_count的原charge已返回后 `process.exit(73)`，第二个fresh Node读同原FS/SQLite完成；公共assistant/tool已有2条、原CPP1与原count charged保留。完成仅原2 HTTP，各20 direct tokens，read累计仅第一进程1/第二0；local jobs总10，保留1个因进程退出未settle的charged count，不虚构CPU完成/零成本。正式结果原state只1条，第三fresh Node返回同record不增HTTP。pending_read进程退出时只有公共assistant与旧skill_read charged，新进程只重读尚缺只读结果1次；原charged与新settled分别保留。此为受控process exit夹具，不是服务kill、真实gateway或所有崩溃位置证明。

完整结果已保存的缺CPP、public prefix编辑、pin改变不重读；原model/history quota拒绝private1保留，取消pending清理private0；7反例均仅第一HTTP/20 direct tokens、原charged工作1保留且正式结果0。capacity/prefix/byte反例调用原RunControl方法，只证明原authority port bounds，不冒充每项都走完整生成。

另上述两原Session scope/plain consumer，合25，不将old-v1写成全绿。原Narrator单次fresh计数/输出、原Session 4工具路径/4scope、Studio Responses/Anthropic/Gemini恢复/预算有限消费者保留。临时只禁用原公共history消费的 `negative-v1` cold真实FAIL于generation_continuation_unavailable，原history/private数据确已保存，finally还原产品；不篡改已保存wire或真实path evidence。

外部发送0；M8累计38/direct72982、unknown2/17515 upper、admission fetch0、原G06质量FAIL与费用/限额历史保持。Skill repository仍synthetic port，原SessionCore/Package、StorageEngine、Task scheduler、Host/GenerationService及本地HTTP真实执行；实际协议新增只有Responses。未启用研究选项不扩为本轮必做。
### 2026-10-11 G04/G05 — 真实 Session fork/历史 restore 的新 Task scope

本组合同 docs `f77588619`，source `804b088ae6b93ee9dce0150ada558e27eb40deb8` 为test-only新增6cases，已本地提交；未改产品，未重复已通过cold/pin/配额组。`g04-session-task-branch-after-v1.log` 6PASS，FS/SQLite各真实fork、historical_restore、same-HEAD restore；无新外部HTTP、未push新增提交。

真实派生场景：原fresh Node在原second count charge后退出，forkBranch生成新的branch/revision；historical_restore先把未来user text提交到新revision、在此未来source运行原Task/保存CPP与公共工具history，然后restore较早的实际Save，确实生成新branch/revision并保留旧branch HEAD。旧Task revision请求在新HTTP前拒绝。新Task source fingerprint/Run operation不同，实际只发送一次fresh final请求，wire没有旧reasoning/function_call/function_call_output、原工具结果或未来文本；结果与旧初始Timeline相同，重复正式Task record不新增HTTP。

原old operation.compute深比较保持，原20 direct tokens/7local jobs/1charged count未退款或改写；新scope另外20direct tokens/3local jobs进入原retiredCompute，原Run可查两份费用。这证明成本不丢/新scope隔离，不扩大为任意branch child共享父额度或Provider原生安全复制。same-HEAD restore则只有frontend epoch失效，revision/graph不变，同一Task冷恢复合法、实际总2HTTP/40tokens/10jobs+1charged，第三cold调用返回原record不重发。

Provider ancestor safe-copy/reset loss、compaction与其它实际消费者仍继续。opaque只在原Runtime kind，fixture Skill port非OS实物IO、loopback非真实gateway。当前HANDOFF.md在docs HEAD不存在，仅模板，不伪造交接；按实际Git/Plan/Record继续。M8原实际38/direct72982、unknown2/17515 upper/admission fetch0与G06 quality FAIL不改，main不变；调用硬上限仅每日2000次、20RPM，助手旧固定次数/token限制不生效。新远端动作尚待核实/报告，当前仅本地提交。

### 2026-10-11 G02/G04/G05 — 原 Session Task 有界公开摘要及一次 adaptive reset

合同 docs `7aca2e1d4`，产品 source `3cebec8f7e143d58d54d7dddd9d46fcef88694f5`。此前 source `804b088ae` / docs `7aca2e1d4` 已push，`ls-remote`确认两条指定分支与本地一致；其前节“未push”保留当时快照。当前组仅原 foreground Narrator声明Task + Responses/FS/SQLite，未支持Provider native compaction/copy、不发送其字段。详细合同唯一见 [G01](../../plans/architecture/agent-intelligence-runtime/g01-substrate.md#已交付有限-g02g04g05原-session-task-的公开摘要与一次-adaptive-reset)。

后两项没有执行完整Host，不将20全部称为完整生成反例。`g04-session-task-summary-after-v7.log` 20PASS；`regression-v1.log` 71既有distinct PASS（实际执行三个suite的受影响子集，不宣称整个suite全跑）：Session Task/history/branch34、原Skill selection/loop及原Runtime消费者其余37。MySQL/Postgres未跑，外部HTTP0。

原source/Input/Task fingerprint/Run bank不变；摘要是有界user data lane（2个截断excerpt各≤512 UTF-8 bytes、总≤8192），首次epoch1 wire无旧reasoning/function_call/function_call_output，HTTP前Snapshot明确reset/bounded_public_task_summary/opaque_not_restored与旧IDs。第三HTTP final仍同原额度，总60 direct tokens/15 settled local jobs，正式结果CAS一次；重复Task请求不再发送。原公开历史不含providerState/opaque，最终CPP只epoch1一项。受控fresh Node在摘要发布完成、reset job尚未settle时exit73，后fresh Node不重读Skill并完成；原charged reset保留，总60 tokens/16jobs/1charged，第三fresh Node只读正式结果。

原始失败均保留私有Document日志：`before-v1`真实第三count失败于factory局部lastRendered未赋值；改用本轮完整count之后的请求，`after-v1`仍FAIL，修复reset构造binding时缺requestId，`after-v2` 1PASS。`after-v3` fixture在Runtime写锁内saveModelProfile重入同锁hang，明确停止仅该test进程；外层随后超时结束日志为11FAIL/5PASS，不能标为通过；将变更移至原reset charge返回后/Runtime锁前，不绕过生产锁。`after-v4` 14PASS/2FAIL：取消实际原Scheduler错误operation_cancelled，预期修正；FS withTransaction没有SQL rollback，Run发布失败后CPP已删。先补锁内有限compensation，`after-v5` storage fault PASS而取消仍FAIL于对immutable history赋值；复制为可变工作对象后`after-v6` 16PASS。`faults-v1`另外3PASS：SQLite真实rollback、FS发布已写后抛错和第一CPP删除后抛错，事务/补偿边界均旧history无摘要且旧CPP2，随后Host失败cleanup最终CPP0；不把两时点混成总保留。FS补偿只证明同进程捕获异常恢复，不证明delete→public publication间突然退出的跨文件原子性；cold仅发布完成后的受控退出。

严格task超窗与localWork12上限拒绝均2HTTP/40direct tokens/12jobs、合法CPP2保留；model maxRequests2在摘要发布后拒绝第三HTTP，40tokens/15jobs、摘要保留/CPP0。配置/CPP/HEAD失效、取消/发布异常均不发第三HTTP，不退款原40tokens和12或13已准入工作；新HEAD保持retiredCompute，取消按原Scheduler operation_cancelled保真。原6总工具轮、54总消息（含sourceMessages）、64KiB Task history及131072 Run上限跨epoch保持；

累计真实模型38/direct72982、unknown2/17515 upper、admission fetch0及G06质量FAIL不变；本地loopback tokens不是gateway账单，实际价格/cache/可靠收益无新证据。已交付组不重做，继续其它已选Task消费者和已启用Context/初始Skill/reuse准入，再沿实际有意义质量修复进入获准G06。main不变，不创建HANDOFF、不新设审批/固定调用次数或token门槛。

2026-10-11 设备迁移停在已推送 source `3cebec8f7` / docs `96ccf204b` 安全 checkpoint 停止并保存 `HANDOFF.md`（仅在对应中断任务存在时读取）。下一 Context/Skill 组仅只读定位，无产品改动/新测试/外部发送；

具体本地路径/manifest/排除范围见HANDOFF。原含凭据ZIP与私有原件保留，无上传、未运行恢复或paid脚本。迁移包不是全部机器备份，原额度ledger延续不重置。

### 2026-10-11 G05 — 换设备恢复及原 Context build / Prompt compile 准入

从真实 source `3cebec8f7`、docs `69c14b440`、main `3ee1332ef` 恢复；独立20261011无凭据manifest未取得，不能声称其18,585项已逐条比对。原Git/Node24.18与source/tests锁文件依赖恢复，本机映射和私有副本仅本机保存。原quota实现在06:28:29 UTC只读复算：1659 admissions保留，carry332过期，24h519/60s0，剩余1481；这是当时窗口而非gateway余额，发送前重新计算，无写入/新请求。M1/HM1不重跑。

产品 source `bf0ac797d9fbc4efca5f7ca2cb9e131129441dba` 沿原Host两个注入端口接 `context_build` / `prompt_compile`。GenerationService先形成accepted effective policy，再在工作前原Run/Task charge；Context冻结输入/Prompt exact closure以实际JSON UTF-8 bytes和各1item/job估计，随后原currentness/settle。新request/fallback/工具轮/摘要epoch不重建额度，无localWork旧路径/readonly preview不造ledger。取消、编译错误、HEAD/Task变动保留已花成本，fallback不能借candidate更宽声明绕过accepted/持久限额；原背景lane/period按原anchor消费。Context包住原task_history/恢复read，process CPU/wall可能嵌套重叠，不解释为独占硬CPU时限/金额。初始Skill inventory/pin/always-load、开端snapshot/package/config读取及已启用reuse/corpus工作仍pending。

`g05-context-prompt-regression-v1.log`三个suite实际受影响子集69PASS，其中背景maxJobs1/2/3/4的新增4项，其余65为受影响既有；Session summary/独立Node cold/fork/restore/Skill loop均计新实际工作，不靠修改产品maxJobs32上限。该次runner默认还纳入本机未启动MySQL/Postgres的8项，全部ECONNREFUSED，不声明它们通过；以后用已有disable flags仅跑本组FS/SQLite，不为此建立DB矩阵或重复69项。

lintText对比原/新完整message相同、新增0，不修改无关旧用例。原失败日志均保留。工作成功路径各4个Context/Prompt/count/render jobs；实际accepted fallback共享4/8-job原bank，失败primary的unknown send保留；后台拒绝1/2/3 jobs均HTTP0，合法4jobs只有1HTTP/原period1。所有新HTTP均loopback，外部请求0；继续初始Skill及已启用reuse/corpus准入，随后按正式依赖推进。

### 2026-10-11 G05 — 原 Native Narrator 初始 Skill 工作准入

main保持。唯一合同见G01当前组。将原Host localWork函数提到Skill准备之前复用，render失败仍传原provider discard回调，没有新budget/lease registry；prepareNarrativeSkills的可选work端口在原inventory+scope/mode选择、每个immutable pin、每个always-load file读前分别charge `skill_inventory`/`skill_pin`/`skill_load`。首个冻结Route声明提供原accepted限额，准备fingerprint只代表其非秘密输入，不假称已解析gateway path；正式candidate后续照常消费accepted policy。原其它caller默认直读保持；

`g05-initial-skill-after-v1.log` 26PASS/1FAIL（14新增中的13PASS及13原受影响PASS）：首次inputBytes拒绝已成功阻断list/pin/read，Run未创建，fixture helper直接读null.operations失败；可选读原Run后`g05-initial-skill-input-quota-after-v2.log`仅该项1PASS，没重复26项。`g05-initial-skill-regression-v1.log`26受影响既有PASS，三个suite实际子集：summary实际/cold、Task exact/cold/pending-read/失败、原count/render/stale清理及两个无新work端口的Skill消费者。总14新+39受影响既有=53 distinct PASS，未运行MySQL/Postgres及未重跑不受影响前组。ESLint5改动文件PASS；

实际always-load fixture FS/SQLite各7 jobs（inventory/pin/load/context/prompt/count/render）、1loopback HTTP；关闭Route budget后同Run下一request仍在list前拒绝并保留原bank，不重建额度。1/2/3 jobs分别在pin/load/context前拒绝；inputBytes1在list前拒绝且无Run。inventory/pin/load错误各保留1/2/3失败工作，取消/HEAD变化保留3工作并HTTP0。On-demand工具2HTTP的原bank现在11jobs，fallback15jobs；输入项/字节仅实际repository请求描述，inventory物理scan和响应bytes不是CPU/金额硬cap。Settings及初始source/package/config读取、其它Skill入口和已启用corpus/reuse工作准确pending；下一继续原Hybrid corpus/reuse准入。

外部HTTP0，原quota/费用/失败与G06真实quality FAIL保持；代码/合成测试/文档沿既定两个分支保存；不合并main、不部署、不上传私有文件。

### 2026-10-11 G05 — 原 scoped Hybrid corpus/reuse 工作前准入

无Secret/profile/inference解析，无新bank/registry或模型发送器。1job/item代表一次corpus请求，inputBytes为已存在snapshot key/state/chat/providers/eligibility/at JSON UTF-8 bytes，限16MiB，不假充实际文档scan数。原Source/Information品牌proof未换成JSON许可；

客户端CPU/elapsed不是server process usage，工作前charge后原settle(null)记unknown，input/item上界仍占用、不退款；client未开始/取消/失败也不虚构completed/0CPU。cost写失败保留charged，currentness后拒绝不让client开始。scoped无local cap/readonly旧路径不造ledger，原metered scope关闭Route仍继承limits。这里local-purpose配置仅用于原cost fingerprint/兼容无local cap语义，不是一个新可调用Retrieval Profile或gateway proof。

实际26 distinct PASS（13新/13受影响既有）：`g05-corpus-admission-after-v1.log`17PASS/1FAIL，10新FS/SQLite Session/Project Task实际cold/warm原memo与account snapshot恢复/Route去budget拒绝；bytes/readonly/HEAD/late-source/取消/settle失败；7原rerank bad-output/成功消费者通过。client header测试没设原mock，undefined失败，不是产品凭据或network配置问题；未重复17个已通过项。

原bank只2个unknown corpus rows/0model attempts；恢复后第3 warm在原bank前拒绝，旧成本保持。actual list完整路径现在4 jobs（corpus/list/insert/query），不足2仍基础合法来源；复制JSON仍不能获得原source currentness proof；其它成功客户端trace只作client观察，未知currency/CPU不提升。

MySQL/Postgres未运行。原真实G06 FAIL、38/direct72982、unknown2/17515 upper/admission fetch0与原quota保留，未宣称M8/HM2完成或cache/金额收益；按正式依赖继续。

### 2026-10-11 G05 — Studio原Project Task Skill准备与工具消费

沿原Host.skillRepository/ExtensionsStore、原Skill resolve/pin/read及prepareRetrievalCompute→原Task localWork接有限skill-work适配；普通Skill editor REST不改，不建Task/bank/registry。Studio已有Task的list/scope-mode选择、pin、always-load、supporting read/files均工作前charge，实际server process CPU/wall settle；cached catalog先unknown占用，再client总结，不假充server CPU。失败不是空inventory或成功工具结果。

真实active Task readonly/no cap owner完整不变；无cap takeover仍在repo前拒绝。背景/legacy其它无当前原Run/Task consumer入口、开端source/config读取保持pending，不能将本组称全部CPU硬cap。

19 distinct PASS（13新/6受影响既有）：`g05-studio-skill-after-v1.log`11新增，FS/SQLite实际repository list→pin→always-load→supporting read→files→cached catalog→原Host/loopback。live ref.md编辑后仍读原immutable pin字节；共10jobs（5Skill server settled +1client catalog unknown +4Context/Prompt/count/render），1model/20直接fixture tokens，移除Route budget后list在repo前拒绝、同Task原bank保持。其余bytes/pin quota/pin conflict/接管/读中变化/settle后变化/no-cap接管/no-cap readonly/cancel有真实结果；取消保留1settled cancelled server job/HTTP0。`g05-studio-skill-regression-v1.log`只6既有：Studio实际工具loop/原权威提示变更/reset/path偏好/off拒绝4，原Narrator初始Skill FS/SQLite两项。`g05-studio-skill-client-denial-v1.log`新增2：initial预算拒绝不变空inventory/不发送，Task closed read不产生成功tool result或下一round。

首轮11PASS/exit0仍有worker force-exit warning；定位Supertest(app)在abort时可能跳过end callback中的隐式server.close，fixture改为显式owned apiServer并cleanup所有连接。原日志保留，不抹为完全无warning。相关7文件ESLint首轮5无报错、两新错误为迁移后unused requestHeaders和brace-style；未运行MySQL/Postgres、全仓或M1/HM1；

不恢复助手次数/token限制，不上传私有文件，不合并main/部署。

### 2026-10-11 G05 — 原RouteResolver准入与有限工程出口

source `272e6f716f0c0a4e20c12323eb48b6d59c34919c`，原resolver.resolve仍是唯一exact closure authority。Host仅在真实GenerationService candidate前沿现有localWork加route_resolve；首Route冻结policy/已有bank在读取前准入，后续accepted policy由原GenerationService形成。每candidate1job/item，描述为真实首Route/request JSON bytes，不虚称全部文件IO/未来结果大小。preview/preflight/no local cap不造ledger；失败、取消、HEAD/Task变化保留已准入成本，下一round/fallback/摘要重建再次计真实闭包。

84 distinct PASS（7新增/77受影响既有）：g05-resolver-after-v1.log 38 PASS（5新/33旧），新增quota在原port读取前拒绝及failure/cancel/head_change/task_change；g05-resolver-child-after-v1.log 2新PASS，实际Session/Project搜索child role沿同原10-job父bank，child声明32不扩额度，每次5jobs/20 loopback direct tokens，第三call拒绝保持成本；g05-resolver-regression-v1.log仅4相关suite子集44既有PASS，含initial Skill、Task公开history、summary/reset/cold epoch、Studio真实Skill和background quota1–5。normal发送5jobs/fallback10；cold摘要32jobs正好原product上限，未升maxJobs32。

本组无测试失败。6改动文件ESLint g05-resolver-lint-v1.log PASS；generation-budget-p2原HEAD/当前都2条既存no-conditional-expect，规范化message相同、新增0，不改无关case。未跑MySQL/Postgres/全仓/M1/HM1；全部HTTP本地loopback。此前失败日志保留，不重写为全绿历史。

原Run/Task共享原子准入、retry/fallback、所选child/background、continuation/summary/reset/reopen/restore成本及当前Native Skill/reuse/local工作已覆盖；bootstrap source/owner/首Route/budget读取仍未计量，legacy无该Run/Task consumer的Skill/reuse仍pending；未启用classifier/prewarm/Local KV与原生safe-copy/compaction不凭字段计能力。

本轮外部发送0；原真实38/direct72982、unknown2/17515 upper、admission fetch0、原G06质量FAIL、费用及quota完整保持，main仍3ee1332ef，未合并/部署。

### 2026-10-11 G06 — 最终Package Play Recall权限拒绝保持

source `5e5ca1ebdf03cc9e2a1c3df7a3ae9e38feb2afc7`，本组沿原Play→recallNativePackageTurnMemory→原Memory API接线，发现最外catch把已传播的权限/Run currentness/readonly拒绝抹为unavailable，继而markProvisional并调用Turn。只import并使用已有NATIVE_RETRIEVAL_SCOPE_ERRORS，不新增权限authority；普通optional service failure和budget exhaustion仍合法空Recall基础路径，取消/返回后assertCurrent不改。

10 distinct PASS（5新增/5原）：g06-package-scope-before-v1.log 3新反例真实FAIL，revision_conflict/run_terminal/storage_read_only均被吞；g06-package-scope-after-v1.log全10 PASS。原Play函数及Information grant实际执行；服务拒绝是注入的原非秘密code，不冒称本组重新走外部/实际server权限裁决（下层真实server证据仍归原G05）。另2新增保持optional service与budget fallback。5旧覆盖可见source准入/hidden/stale/foreign反例、memory:false gate/Host拒绝和正式Timeline事件幂等。生产1文件/test1文件ESLint、diff PASS，没有UI设计变更/浏览器/全仓/DB/M1/HM1或外部发送。原40/direct77955、2unknown/17515 upper、admission fetch0和真实质量边界保持。

用户已明确最终范围为全部剩余S/G阶段。继续原正式依赖，有限G05边界不升全覆盖；M2只依M1，可在原实现/文档分支准备S11有限契约及实现，不等待M8；所有推进保持唯一写入者、不建审批/线程/子agent/Goal工具、不合并main或部署。

### 2026-10-11 S11 — 产品持续目标主体与持久控制

用户已明确全部剩余S/G，M2只依已完成M1；沿原authenticated handle、Evidence scope/selector和StorageEngine新增单一atri_agent_goal kind，不另建发送/事实/预算registry。User/Project execution goal与精确Session/Actor desire分域，Actor不借执行budget；Todo/commitment/Task completed不自动转Goal。HTTP create/list/get/control挂现有Native generation router，用户只pause/resume/cancel，不接受owner/成功状态/整doc热改。

16 distinct本地PASS（14新增/2既有）：s11-goals-after-v1.log 首8项4PASS/4FAIL，四失败均fixture按message精确比对却遗漏原ConflictError的storage conflict前缀；产品确已阻断Terminal/CAS，未改authority放行。s11-goals-api-definition-v3.log仅2原CAS/2原HTTP增强后的4PASS（定义budget扩展拒绝、anonymous401、409原code），不重复计数。s11-goals-owner-scope-v4.log新增4PASS：FS/SQLite实际第二handle的分离目录/数据库不能枚举或读取原Goal；实际不存在Actor/非法scope不发布；原SessionCore.forkBranch真实换branch后resume拒绝、旧paused doc保持。s11-goals-storage-regression-v1.log原N1 FS/SQLite全authority round-trip各1、共2PASS，注册新kind不破坏原keys。没有全仓/DB/M1/HM1重跑。

Cold证据为两个真实fresh Node读取刚由真实Project/Task服务创建的Goal metadata，原doc完全一致；控制后原Task及bank完整不变。Native user/Actor与ordinary Chat实际原Scope读取，Actor不能借执行budget。FS备份是独立目录实际文件复制→fresh engine，不是调用no-op dumpUser或端到端ZIP恢复；SQLite真实dumpUser→新engine restoreUser，Goal状态与budget未重置。只证明本组metadata持久；不宣称S13已续跑、Scope完整portable重绑定或M2完成。

所有6改动文件ESLint初/修后PASS，新增owner/scope test后仅该文件lint-v3 PASS，diff PASS。实际shell保存原test/lint LASTEXITCODE后读日志并据原值退出，首轮被Get-Content覆盖的shell exit0不当tests通过。所有原失败日志保留。外部API0，原quota1661条、M8 actual40/direct77955、2unknown/upper17515及admitted fetch0完整保持，main仍3ee1332ef，未合并/部署。继续S12完成证据/冲突/失效；G06真实分层双入口质量/风格、合法continuation/reuse/invocation对照、完整成本/cache/可靠延迟和未知路径的出口仍pending，M3前置不取消。

### 2026-10-11 S12 — 原source完成证据、冲突与失效

沿原AgentEvidenceService capture/evaluate/current double-read与Scope/selector处理固定path/equality；注册受限project_field到原Project adapter，原Studio source及revision双读，不新建事实/判断registry。只限authoring source的既有根与安全固定path，不读取Runtime Profile/Secret；Task仍原正式state/receipt/currentrevision。Goal最多32唯一source共用coherent EvidenceSet，progress/refs严格结构与metadata64KiB；

26 distinct本地PASS（14新增/12既有）：s12-goals-after-v1.log 6PASS/2FAIL，两个RP fixture把原sourceContent当纯文本，实际原序列化含speaker/role/variant；仅修expected调用原sourceContent，不改数据或判据，s12-goals-rp-v2.log同2PASS。原6含真实Project属性/model generation attempt完成自述不能满足、正式authoring可满足/撤回、真实fork发生precheck后capture前、invariant与pause/cancel保持。s12-goals-http-failures-v3.log新增4PASS：实际router evaluate+原Task计划/提案/Review（仍waiting）→正式Commit receipt与当前属性组合completed；extra status字段400；原Source denied/unavailable/missing分类及private IO details不回显。s12-goals-publication-v4.log新增2PASS：在原Goal repo已保存observed proof后真实fork，最终返回和随后get都stale，不把新branch当旧Goal完成。

12受影响既有：s12-goals-source-regression-v1.log仅原5Project Source cases与strict source contract1共6PASS（Review/Commit区分、人类revision、task更新/takeover、wrong project/delete、读中变化与schema/extra/duplicates）；s12-goals-controls-regression-v1.log仅S11 cold Node/原CAS/认证HTTP两backend共6PASS。没有全仓/DB/M1/HM1重跑。原源码/新增test6文件ESLint首轮5无错误，service3新brace-style修正后局部v2、最终全6v3 PASS；新增发布竞态后仅service/test v4 PASS，diff PASS。原失败日志append-only保留。

证据范围：generation attempt由真实begin/finish接口保存合成完成自述，无外部模型；新正文物理输出匹配只证明该精确输出，不证明World/Actor真相。Actor没有新的认知完成权限。raw repository completed只记录带anchor的observed proof，服务读时重新确认；readonly失效只返回stale投影、原doc保留，显式evaluate才CAS写新状态。最终发布竞态中原doc可保留旧observed completed，但API返回/后续消费都拒绝current完成；

外部API0；原quota1661条、M8 actual40/direct77955、unknown2/17515 upper及admitted fetch0不变。S14 UI待做，整个M2未完成。G06/M8/HM2真实分层双入口质量/风格、合法continuation/reuse/invocation、成本/cache/可靠延迟/unknown出口保留，M3前置不绕过，main未合并/部署。继续S13。

### 2026-10-11 S13 — Project durable wake、同 Task bank 与恢复

恢复聊天时 source 原未提交十文件与 docs 原 S13 设计继续保留；实际 Git 优先于迁移前 HANDOFF。原 Task 持久 Goal binding、32 个有界事件与 pending/running/done/unknown/cancelled 状态，原 TaskScheduler 执行并传原 operationId；原 Studio loop 通过可注入原 client/Skill/Host 端口共用公开 history、正式 tool 幂等与原 bank。Goal 固定额度仅收紧原 Task，运行/重启不新开账本或自动 commit，完成仍由 S12 当前 source 判定。

23 distinct 本地 PASS（12 新/11 受影响既有）：前聊天 `s13-goals-after-v3.log` 两原 FS/SQLite 正向消费、`queued-source-v4` 两排队变更反例、`pause-v6` 两暂停实际 HTTP 保留 unknown 成本；两次正向唤醒各 20 loopback reported tokens、第三因同原额度拒绝，重复事件不发送。并发两个 scheduler 只一 claim/一发送；独立 Node 重新打开真实 engine/Project/Task，保留旧 running wake 与 compute limits/attempts，返回 unknown 不发送。HTTP ack 不等待 background Promise，已观察 rejection；Host 原一次 provider retry 的两笔 unknown 占用都保留，后续 pump 不新增 HTTP。原 Studio 子集 `studio-regression-v1` 六 PASS（前聊天），本聊天 `scheduler-regression-v10` 五 PASS，原 ready/stale/scope 与 queued retry，未全仓重跑。

失败历史完整保留：after-v1 两 binding projection 失败，补公开 snapshot goalBinding；recovery-v7 两失败误期待一笔发送，原 Host policy 合法 retry 实际两笔 unknown；Goal proof 的 localWork 是保守 unknown，不宣称实际 CPU 已完成。

所有十改动文件 `s13-goals-lint-v9.log` ESLint PASS，diff PASS。未运行 MySQL/Postgres、M1/HM1、全仓或外部API；原 quota/真实费用/G06 FAIL 不变。Native/Ordinary RP 原事件消费者及 context 投影仍待接，不能将 Project 有限组标为全部 S13/M2 完成；继续 RP 与 S14，再处理 G06/M8 的剩余真实出口。main 仍 `3ee1332ef`，未 merge/deploy，私有日志和账本未上传。

### 2026-10-11 S14 — scoped RP 事件、原 Goal context 与共享工作体验

RP 显式用户/作者事件只走 S12 原 Source capture/current evaluate，不生产模型请求、Run 或 World 操作。Native 有声明 Task/lifecycle 产物时只能消费其原 context grant；未具备 consumer 时等待原用户/作品事件。Project 仍用 S13 原 bank 和 durable claim，正式 Commit 前不完成。

原 Studio Task 与 RP Workspace Run 共享 pane，展示判据、进度、声明预算、原 Task 实际 settled/reserved/unknown 占用和下一步，接原 pause/resume/cancel/bind/wake/inspect；创建仍沿 S11 用户/作品结构化 API，没有自由文本自动授权/新 Goal 编辑器。readonly 禁用写控件；loading/错误恢复和键盘焦点保持，内容 textContent 转义。用户 Goal context 按 authenticated owner/精确 Evidence scope 从原 metadata 读取，Actor desires 排除、Native branch 变化投影 stale；Agenda 使用原冻结 Run scope、Director 的相同 loadRunGoalContext + 原 user message builder、Project 真实 Host 请求消费原 criteria 数据，不提升为 system/事实/工具 grant。运行切换后的异步 context 拒绝使用。

25 distinct Jest PASS（13新/12受影响既有）与 1 独立真实 Edge smoke PASS：`s14-goals-after-v1.log` 8新（FS/SQLite RP 后续真实 ChatRepo.save 才 completed、重复 event 与新 service 恢复、Native Actor 排除/真实 fork stale、readonly/pause/resume/cancel；Project loopback user 数据→原 authoring Plan/Review→正式 Commit→Goal completed，共2单项正向各20 reported tokens）。`consumers-v3` 1新实际 Agenda worker 提示与3旧相关 consumer（Goal API 只作为 fixture port，实际 frame/runtime 分支执行）。`native-artifact-v6` 1新实际 Native lifecycle outbox→原 Host scheduler→Session Task publication→原 artifact grant→恢复后 Goal completed，重复事件不重写、producer outbox 不重放；该单项模型输出/精确 refs 是 fixture stub，不是 HTTP/真实费用或模型质量证明。`bank-regression-v8` 仅2旧完整两次原 Studio/第三额度拒绝，新增 Goal 数据未重建 bank。

截图本地 private 保存并实际查看，沿 Atria tokens 统一控件/边框与宽度。ui-v1 只因迁移后 Playwright bundled Chromium 缺失未启动，改用已有 msedge 后 ui-v2 PASS；

保留失败：lint-v1 新 pane 2 brace-style，修后 lint-v2/最终16改动 JS/test文件 lint-v7 PASS；native-artifact-v4 fixture 复用旧 Package origin 与新 PackageVersion 不匹配，修真实 fixture envelope 后 v5 因旧模型stub精确 prompt/generation refs 缺失拒绝。未运行全仓、MySQL/Postgres、M1/HM1；外部API0，原quota1661/M8 actual40/direct77955/unknown2与17515 upper/admission fetch0和原真实G06 FAIL完整保持。

有限 S13/S14 用户/作品事件消费者已交付，RP Goal 没有额外 Task/World 执行权限；原 Goal metadata管理/legacy context读取不冒称全部 localWork 已计量，Project 自动 proof 才计同原Task bank。Actor desire completion仍依赖S17。继续 G06 的真实叙事质量、分层对照、费用/cache/延迟证据，M3 不跳过此前置。main仍3ee1332ef，未merge/deploy，旧HANDOFF不自动刷新。

### 2026-10-11 G05 — 原 Transformers 本地推理与原 bank 准入

source `24dcb551faec74d5265348a5f3e79e80fd1183f4` 已 push。设计入口 [g05-transformers-embedding](../../plans/architecture/agent-intelligence-runtime/g05-transformers-embedding.md)；只开放已有服务端 Transformers 的 scoped embed 路径，复用原 singleton pipeline 串行队列、middleware、Run/Task bank 与索引发布。每实际 text 先准入一 `embedding_local` job/item/UTF-8 bytes，再模型载入与推理；已发生失败/取消工作保留进程 CPU/wall/outcome，不因新模型 profile 另开账本。无法中断的 ONNX 工作返回后拒绝发布。旧无预算 helper 保持，WebLLM 等其它 scoped provider 仍 unavailable。

产品实际额度拒绝为429，HEAD变更已将原成本退休保存。四正向为 FS/SQLite × Session/Project 实际两条插入+查询，五local jobs（三推理/两索引）、下一查询无 pipeline；两耗尽 before load、两载入中 HEAD 变更保留 retired 两 failed jobs。取消单项实际推理中取消保留一 cancelled job，另一个排队取消无 pipeline；`regression-v1` 仅原 unbounded/unsupported 与两 backend actual source 变化共三 PASS。四生产文件 lint-v1 PASS；新增 test 两 valid-expect 问题修后 test-lint-v3 PASS，diff PASS。未运行全仓、UI、MySQL/Postgres、M1/HM1。

真实 local neural port `g05-transformers-real-h0-v1.json`：既有 Transformers.js/ONNX 模型 `Xenova/paraphrase-multilingual-MiniLM-L12-v2`，真实 FS engine/Session、authenticated Native middleware与原索引，三条原 H0-ZH-08 合法选中历史来源，不用 mock vector。实际插入 HTTP200/23683.50ms，查询 HTTP200/192.49ms、189.33ms；384维，原承诺 s08-020 排首位 score0.365723，其余 s08-002/001 为0.217025/0.209507。保留五实际推理 job与三索引 job，全部 settled/completed、model attempts零；首调用包含下载/模型载入，其它暖推理 wall约63–104ms；进程CPU与外层索引区间重叠，不能相加成净CPU节省，下载字节/电费/货币仍unknown。

私有脚本首launch只因 Windows static ESM路径不合法退出，v1失败日志保留，未开始 provider/生成；修 file URL 后 v2日志与实际report完成。模型缓存及原raw仅存private、不提交。继续真实原Hybrid消费者与可知成本对照。

### 2026-10-11 G05/G06 — 完整 H0 本地批次与实际 Hybrid 消费

source `69ab3bd6e6f0116dad2a0b849adeb32af2a6c3bf` 已 push。真实完整 H0 消费暴露每 text 一 job 与原 localWork maxJobs32 不相容；不扩大生产 ledger/schema。原 Transformers 单条/原本地 insert 批次各一 job，所有文本逐条计 items/UTF-8 bytes，原 singleton 模型锁覆盖整批并共享一次初始化；原 getBatchVector 对 Transformers 不再沿远端十条拆分，其它 provider 不变。局部出错保留整批工作量与实际 process CPU，不发布部分向量。不是引入 KV cache、并行推理或降低语义准入。

batch-after-v1 九 PASS；batch-regression-v3 新12条实际insert/query跨旧十条界限，只两次load、13次inference、四local jobs；旧失败后模型切换一项PASS。三个改动文件batch-lint-v2 PASS；

失败严格保留：完整原H0第一次沿此前三来源fixture的32 jobs/128 items/1MiB bank，corpus/rank两次unknown占用734559 input bytes后pack拒绝，before index/inference；另一次预声明512-job完整实验配置被原schema native_generation_budget_invalid拒绝，无work/模型，不修改schema放行。改为原允许32-job、4096 items/16MiB的独立作者实验，原小bank不扩展/退款；十条分块时full-h0-v2仍在第四次insert因32jobs耗尽，不能把fallback结果计作语义成功，实际失败推理/成本保存在该report.finalRun。模型/API均零，原failed private reports/logs不覆盖。

批次修复后 full-h0-v3 成功：同原冻结H0-ZH-08 raw500/实际合法corpus256，真实 SourceLifecycle/Native Information eligibility、原 retrieveMemory、authenticated corpus admission/Native middleware/FS index与真实 ONNX模型，全程同一个Run/32-job bank。首次cold index+query 28702.50ms，后续warm有效复用1121.26ms；与无vector baseline选中020/001/002不同的两条filler不是质量晋升。atomic_evidence_unavailable仍报告，未猜测域外完整组；rerank未配置/额外生成零。

两条n1 cold/warm不能当独立recompute/reuse分布，也不能把建索引/加载差值都算派生reuse收益或合算重叠process CPU。价格、client CPU、权重下载bytes与钱款仍unknown；整体G06质量/收益与M3前置仍pending；

### 2026-10-11 G06 — 真实 neural packet 的受影响双入口正文

原失败、v3时延与账本不覆盖；v4新隔离Run仍32 jobs，实际全corpus索引+一次warm的26jobs/258texts保持，全部raw/typed packet在private。它是必要消费者材料捕获，非新的独立H0来源或晋升分布。

新private opt-in neural-packet-prose runner默认preflight，两Native Host Snapshot/原Source映射通过、HTTP0后才显式live。Project原Task只读审阅/空tools。既有小bank失败与client admission unknown不因此转settled；该诊断读保存packet后另用各生成域的原bank，不宣称同Run端到端retrieval/generation计量。

live两HTTP200、原各Run/Task两笔settled报数：Session input6317/output37/total7126，Project input1447/output78/total2028，合direct9154。完整正文人工非盲读：Session“借书那天…曾说过…如今是否还记得，尚无从知晓”，无轮次编号、新场景、角色行动或玩家决定；Project历史借书/承诺此前未履行在过去语境，当前认知未知。Project审阅“第二十轮”不当成Narrator风格退化，也不从无记录推断现时一直未还。有限时间/自主权项通过；n1/domain、不证明独立总体、全部四分层自然度/收益或全产品G06。

原quota1688→1690连续append，carry保留；M8累计actual68/direct154731，原unknown2/upper17515与admitted fetch0仍在。金额按用户决定仍unknown，reasoning/cache/upstream/hiddenAttempts不由差值补造；main仍3ee1332ef，不merge/deploy。仅private受限probe，不把fixture capability自动发布到用户路径或跳过M3 gate。

### 2026-10-11 G04/G06 — 真实 Gemini Task 冷恢复、公共历史与 Project 时间修复

三个独立原H0-ZH-08/同gcli/gemini-3.8-flash有限组均默认preflight HTTP0，再显式live：task-cold-v1 两HTTP200、两不同实际Node、同一持久Task/原bank、签名parts键序完全相同、continue/supplied_checkpoint/loss none、最终第二checkpoint保存、无Project revision变化；reported330+857=1187、十local jobs settled。仅手动公开消息历史，不能把该项当Studio保存恢复。

studio-task-cold-v1 走原runNativeStudioAgentTask、原Skill/repository/compute port、真实begin/tool/finish与StorageEngine，第一轮存公开tool-call/result，cold Node只传Task身份/dirs，读取原conversation继续，saved_task_checkpoint/loss none、两签名wire相同、最终public conversation四messages/两private checkpoints，十二local jobs settled，reported1368+1935=3303。协议项PASS，但完整正文“该承诺尚未履行”缺明确历史时点，保留时间语义不利，不能用后面当前记忆未知抵消；

根因是原Memory compiler policy只接typed Memory lane，普通Project Task的历史作品/用户引用没有相同解释规则。先在g01-substrate冻结有限修复；source `dfa4ccce39eb3787f1b53281ca5cdf2227ad4fb2`已push，新增原PromptCompiler精确task Source+role.studio条件，直接复用不变的memoryUsePolicy时间原则并区分当前Project/Task authoring state与World已发生事实；稳定segment/provenance native.project-source-use-policy.v1进入原binding/cache指纹。Narrator原policy文字/条件不变，不将用户引用提升system或新增状态writer/输出改写器/判断模型。

runtime-v1仅两FS/SQLite Gemini Task真正Host续接。最初regex未选Studio项，未计为已运行；studio-v2两实际失败均native_skill_execution_failed，旧fixture Host缺Skill repository/Extensions端口，补接同engine/owned目录后仅两v3 PASS（Studio saved restore/adaptive missing）。生产compiler lint PASS，P3整test lint两旧conditional-expect与HEAD完全相同；Runtime整test24旧conditional-expect保留（HEAD另含一旧indent，改动构造器修indent后不再报），没有假称整文件lint PASS。未全仓/其它数据库/UI/M1/HM1重跑。

实际wire含固定Project policy。reported1681+2302=3983，同Task十二local jobs/二model attempts settled，签名/冷恢复/公共历史全部保持。新完整正文明确“且当时该承诺未履行”，当前记忆/持有/意愿保持未知，有限时间项PASS；原不利结果不覆盖，n1不声明自由文本绝对保证或整体G06。

本组三组共六actual/direct8473；currency/cache/upstream/hiddenAttempts按用户答复unknown，不从total差值推reasoning。实际Task consumer证据成立，不宣称所有会话Task/所有provider。完整G06/G05/HM2与M3前置仍pending，main未merge/deploy。

### 2026-10-11 G06 — 原 adaptive 显式loss与流式时延观察

source dfa4ccce的原Gemini/Studio adaptive流程新preflight HTTP0，再两真实HTTP200：第一轮原readonly tool/public conversation保存后，私有fixture用原RuntimeCheckpointStore丢弃该Task checkpoint；cold Node只从原Task身份恢复。第一次准备出现reset_required，没有HTTP/model attempt，原loop一次投影重编译后才第二发送。只一次reset事件、effectiveScope none/reason public_observation_projection/loss opaque_not_restored，transferredCheckpoints0、旧signature不在新wire，没有自动重复只读tool或authoring effect。原同Task保留三generation lifecycle attempts completed/failed/completed、两model attempts settled、十六local jobs（十五completed/一failed），不退款/清bank。新正文明确“该承诺当时未履行”、当前记忆未知，有限人工非盲时间项PASS；reported1619+3257=4876。

三组原H0-ZH-08 streaming first/repeat，Session None policy、不变style-v2/真实neural packet/实际500预载轮。default preflight三个独立Run各两Snapshot通过/API0，显式live六HTTP200/SSE、各原Run两settled。每pair actual request SHA完全相同；原quota1698→1704连续append，direct42230。首次是观测顺序，不假称Provider cold/warm、prefix/cache hit。raw clone异步观察、不预缓冲原Response，原Host onChunk首次公开内容另计，reasoning字段不作为正文首token或输入。

n3/arm实测分布：wire首正文chunk first p50/p90 9155/12818ms，repeat 8581/9604ms；Host公开首chunk 10322/13924 vs9787/10665ms；含原executionResources/Host工作的E2E 10764/14292 vs10049/11094ms。一个pair重复E2E反而变慢，保留全部六值；小样本不能声明稳定SLO或归因缓存加速。完整六正文人工读过，历史借书/承诺限过去、当前记忆未知，无轮次编号、新动作或玩家决定；

发现六raw SSE均报告gemini-3.8-flash，而原parser丢掉model，normalized误显示null。source `55ad73d9d6c2b0616489fe81c99d19c94d045fe7`已push，只保留SSE一致的reported alias，冲突/缺失仍null；upstream/cache/hiddenAttempts仍各自unknown，不把alias当canonical mapping。

累计M8 actual82/direct210310，原unknown2/upper17515与admission fetch0保持；currency、上游映射、cache hit、hidden attempts、controller/instrumentation CPU仍unknown；net savings/完整G06/HM2不宣布通过，M3前置保留。source/docs仍原分支、main不merge/deploy。下一有限项补检索与generation同原Run bank端到端，不将前面的分离诊断冒称已覆盖。

### 2026-10-11 G06 — 完整语义检索与Narrator同Run bank

source `55ad73d9d6c2b0616489fe81c99d19c94d045fe7`；新shared-bank runner默认preflight，完整实际local NN/256合法H0 corpus后Host只preview，生成HTTP0、原private M1/HM1/quota不变。显式live重新建立同样隔离Source：原三选中历史真实发布/映射，500预载双消息轮/1005 Timeline，固定不变style-v2。先实际SourceLifecycle/Information合法fixture corpus与原Native middleware/索引，随后原Host沿实际该Session refs编译Memory并生成一次；

最终原Run只有一个有compute的operation，原同一32jobs/4096items/16MiB bank先十七检索jobs再五Host jobs，总22。四index_insert/三index_list/一index_query/五embedding_local及route_resolve/context_build/prompt_compile/generation_count/generation_render各一，十八server jobs settled。五embedding批次覆盖256corpus+一次query，非fixture vector。generation model attempt只有一笔settled/input6309/output36/total7519，HTTP200；没有新开或拆分检索/模型bank、预算清零、额外retry/fallback/grader，也没有模型输出写World/Timeline。

n1不足以声明总体或全生命周期Actor保证。请求数量并非此前分离packet诊断的两域pair。atomic_evidence_unavailable保留。

实际完整检索332637.34ms；用户计价/上游/cache仍unknown，controller CPU也非免费。

M8累计actual83/direct217829，原unknown2/upper17515与admission fetch0仍单列。source/docs当前入口同步实际有限交付，main仍3ee1332ef、未merge/deploy，私有包/模型缓存/raw均未提交。

### 2026-10-11 G04/G06 — 原 Session 声明 Task 的消息协议冷恢复与冗余工作修复

Start HEAD `55ad73d9d6c2b0616489fe81c99d19c94d045fe7`；End/Tested product HEAD `84fca4a73e0a0b2ef2af74aa0dea7e5bd0c87fe1`。不为压低上轮332637ms移除这些守卫，不把裸Scope数据替代长历史结果。本组转向当前清单的原 Session declared Task 原生消息协议矩阵；

沿既有 session-task-continuation fixture / restart worker 增加 Anthropic/Gemini format，公开协议仍原 RunControl history、private opaque 仍原 ordered codec。八项新增FS/SQLite × 两brand × task/adaptive独立Node冷恢复，首轮已保存只读工具结果、第二count charge后exit73，新进程不重读，原签名精确wire回传；公开history不含opaque，原23jobs/1charged保留，最终结果CAS及第三次独立Node重复调用HTTP不增。四项新增missing-checkpoint反例实际确认Session两种policy都拒绝、没有额外模型attempt/结果或自动reset；既有Session预算触发public summary reset仍独立通过。

最初Jest入口错误（root node_modules没有Jest）未运行任何测试，改用原tests/node_modules；private预检v1因未读回规范化ModelProfile、messageFormat为undefined失败，HTTP0；修复预检v2完成、原quota不变。实际probe仍只H0-ZH-08/s08-020原承诺与原query，original /v1beta Gemini消息adapter、原readonly Skill loop和foreground Narrator声明Task；不是500轮自由正文，也未迁移用户资料或升级真实capability。

真实v1两实际HTTP admissions，原raw分别reported total658和1404（direct2062）；first summary有HTTP200，第二HTTP status已随summary丢失，保留缺失而不补造header状态。第一Skill成功并保存公开结果，冷请求精确回传其签名，但模型再次请求同一guide/ref.md，cold child未完成。原两-send budget没有扩大，quota只有这两笔admissions。parent的generic session_cold_child_failed覆盖了child更具体错误与第二summary row，最终bank随隔离fixture cleanup不可核查，不能事后声称掌握准确失败ledger。原报告不重写，不造最终bank或以之后PASS覆盖此不利结果。新runner随后保留child报告/错误及最终bank再cleanup。

产品最小修复只在compiler复用nativeExecutionScope识别的Narrator Session Task追加固定directive/stable provenance/segment `native.session-task-use-policy.v1`：保存assistant/tool history是同Task先前已完成工作，恢复不重启初始指令；已有结果满足需求就使用，明确缺口才追加不同文件/分页读取。结果仍数据、输出contract/玩家权限不变。无正文改写、重复调用硬删除、缓存返回伪造或自动reset；原工具、history/CAS、quota及scope authority保持。stable body进入原IR语义指纹，旧checkpoint不绕过绑定。

修复后v3预检HTTP0，实际v2仍原输入/工具/两-send/32jobs bank，两独立Node两HTTP200：第一次reported input547/output26/total689，冷续接input723/output72/total1130，direct1819。最终同一原operation两settled model attempts与23local jobs（22settled completed，退出时第二count1charged）；没有补余额或清零旧工作。saved_session_task_checkpoint / effective task / continue / loss none，exact raw signed parts回传；

完整可见structured结果“第二十轮…当时该承诺尚未履行…不能证明她现在是否还记得、是否仍持有书或愿意归还”，有限人工历史/当前unknown与无玩家行动项通过。保留“记录显示/第二十轮”的说明式文本：本Task探针不是此前style-v2普通Narrator，不能计为风格、角色声音、独立盲评或总体质量改善。n1随机输出/隔离fixture身份不同，不声称强因果保证；任何模型未来仍可重复工具，原限额继续裁决。

旧四Responses冷恢复、一个原public summary、一个Project policy、work_quota和plain Session无Task权限各一。P3文件两处旧jest/no-conditional-expect与HEAD相同，无新增lint问题，不冒称整文件lint PASS。未运行全仓库/新M1/HM1/浏览器回归，未生成测试基础设施或提交私有raw/keys/cache。

本组新增四实际generations/direct3881；累计M8 actual87/direct221710。原unknown2/upper17515及admission fetch0保持单列；金额、上游映射、provider cache和收益继续unknown，用户已确认保留unknown，不重复询问计价。Anthropic真实路径、Session missing-checkpoint reset、Provider native compaction/copy仍没有本组实际支持证据；完整G06/M8/HM2与M3前置保持。source/docs按原授权push，main不merge/deploy，后续真实质量/费用支持矩阵与既有依赖不能由有限协议PASS替代。

### 2026-10-12 G05/G06 — 同 bank 重复召回争用复现与基础覆盖 Invocation

沿既有Transformers/local-work测试fixture，实际Native corpus准入、middleware/Vectra与Host，原合成H0-ZH-08/256合法corpus、受控ONNX输出与生成响应，外部API零。首次before-v1因fixture默认100KiB JSON上限拒绝corpus，改原fixture请求上限为2MiB后before-v2真实复现：冷检索17local jobs+第一Host5=22，暖检索9=31，第二Host只准入route_resolve到32，context_build被原bank拒绝；第二模型attempt未发生，第一笔settled及原成本保持。这将此前跨报告推算收敛为一个有限本地故障，不称已在真实ONNX/真实第二外部生成中复现。

最小修复只扩原memoryInvocationDecision的vector lane：已有原localWork准入、memoryCorpusReuse精确source authority valid_hit时，重新执行已准入的lexical/typed基础排序和实际token装包；承诺提示复用原memorySemanticHints，位置/持有按原typed predicate；因果请求不以此宣称覆盖。冷/失效/无证明、装包后无所需证据、显式rebuild和未计量旧路径保持原可选路径及authority拒绝。原rerank决策、来源/Information/Actor/时点/Branch守卫和后续Host currentness不删；没有缓存正文/查询排名、伪造向量或新budget。该决定进入原recall trace；原rank/pack成本保守unknown继续占用。没有扩大32-job schema、重置/拆bank或规定固定reserve；此有限规则也不保证任意连续请求必有额度。

修复后Session/Project各沿同一原bank两次生成到30jobs：原17+5完整保留，第二召回3必要client jobs+第二Host5；无新pipeline/inference，所需s08-020仍入选。来源编辑后返回proof拒绝；第三召回只准入到32即在必要pack前拒绝，不能凭复用挪走旧成本。after-v1/v2的单Session出口通过；

改动的两个production模块、两个test文件lint通过；所有before/after/scope/graph日志仅private保存。

### 2026-10-12 G06 — 原 H0 双入口基础/有效复用/规则三臂实际配对与换设备停止

私有新runner `run-g06-base-reuse-invocation-h0.mjs` 默认preflight，append-only report已存在则拒绝；只读历史runner未执行。首次launch在模块导入前未设置config而退出，外部HTTP零，失败日志保留；live显式opt-in随后沿原gcli.ggchan.dev/v1/gemini-3.8-flash生成六次，producer为干净source `5a80e156`。

仅原H0-ZH-08、原query、原source-valid/Information合法投影，三选中来源s08-020/001/002映射真实Native Timeline；Session沿未改style-v2精确system.style，Project沿原Task只读frame/tools=[]，三臂均fresh生成。每个入口的三臂共用一个原bank，初始声明maxRequests3/maxTokens64000、localWork32/4096/16MiB，不修改已存在原bank。base完整重算；invocation配置原Transformers profile但合法基础覆盖满足而不启动vector工作。最终Session与Project各27local jobs（12client unknown、15server settled）、3settled模型attempt，逐臂累计8/19/27；无免费预热、旧账删除、额外retry/fallback/grader或跨入口借额度。跨入口是原Session与原Task各自owner，不将它们伪称一个bank。

真实六HTTP200/direct reported11877：Session三臂1732/1730/1739，Project2332/2080/2264。Session三臂input1682、Project三臂input1721；reported total与input/output差异原样保存，不硬推reasoning/cache。逐臂elapsed约4.06–10.23s、检索约0.48–1.21s，reuse准备工作包含在外层elapsed/原bank中；n1/同H0/同model/顺序运行和controller未计量不能证明可靠延迟或净金额收益。

Project三条历史/当前unknown有限项通过。Session reuse与invocation两条仍添加“港口的风平浪静”；Session base有限事实项通过。没有独立盲评/总体质量晋升；旧所有不利输出保留。不预先认定必须全局禁止创作或用正文后处理制造PASS。

本组新增实际generations6/direct11877；M8累计actual93/direct233587，原unknown2/upper17515与admission fetch0单列。金额、上游/cache/隐含重试及净收益仍unknown；用户已确认暂无价格，不重复询问、不填零。

2026-10-12用户明确要求在合适边界停止并换设备。停止新增工程/API，补当前Record、Plan入口与唯一HANDOFF并推送docs。私有根 `E:/Dev/Atria-Private/hm1-20261010` 的新增runner、Document原raw/reports/logs/quota必须一并迁移，旧ZIP不含这些新增事实；不上传private/keys/cache。本次停止只因用户换设备要求。

### 2026-10-12 G06 — 六维观察、World 解释 authority 与原四案例收尾

source `87a769860d6181422fa2fbfb75e01c9768a336f2` / `35e903a4c82dd674a36c0a32cef435b15dc1e1b6` 已沿原任务分支 push，main 仍 `3ee1332ef`，没有 merge/deploy。前一有限风格组结束不是任务完成；收到继续指令后沿 G06 原依赖推进，未重跑已通过协议组、M1/HM1、全仓或浏览器，也无子 agent/new chat/Goal。

沿原 JUDGE_RULE 与 rp.m1.information 六维给已保存的七个 H0-ZH-08 输出作同主模型匿名观察：公开合法 Memory、当前 World 和作者 frame 完整提供，不把合法 harbor/fact ID 当幻觉；只去掉隔离 fixture 的随机 fact ID，所有事实正文、authority、source/time 保持精确相等。首 preflight-v1 因误将随机 fact ID 当事实差异退出，修对比边界后 v2 七准备/HTTP0。live-v2 七 HTTP200/direct11236 却全为 fenced JSON，严格 JSON.parse 七格式失败、原 Task settled 成本保持。使用已有真实 outputContract→wire response_format.json_schema，v3 七准备后七 HTTP200/direct16890/七有效，未用字符串修补或覆盖失败。

七有效观察的六组无负差，hard 在 knowledge_boundary/narrative_response 各-1；理由仅批评“记载”的审阅视角，与knowledge扣分不完全一致，原评分及理由均保留，不替评价者改分。只修改 hard 作者 resource 到style-v4，新增一句让旁白留在故事内而非介绍资料保存。首hard输出 HTTP200/direct2700 却把未定义 World.hp=8 写成“体力尚余八点”，保留无依据标签失败，不补造World或后处理正文。

最小生产 PromptCompiler World policy 仅消费 session Source 中真实 `state:atri_world_state` / context.fact / native.context provenance，位置不能推天气/他者在场/动作/心理；没有定义或明确适用事实，缩写/数值不擅加标签、单位或派生属性。其它provider/quoted history未获得此authority，不新建source/writer/预算。补原合法端口后v3仅失败actualHost+旧long两PASS，另五已在v2PASS。产品/新test相关lint与diff通过，所有失败日志保留。

source87a干净producer+原style-v4/同hardframe一必要preflight后一HTTP200/direct3161，实际World policy消费、原Memory/Source/Timeline保持。新正文历史未交还只限当时，现时持有/记忆/愿意与后续归还未知，无hp标签或场景补造。与原已保存style-v2 hard的一次匿名六维观察HTTP200/direct2305，全维持平；非独立来源/模型或全质量晋升。

原首G06四不同案例为H0-ZH-01/04/05/08，不把后续同H0-ZH-08多frame替代其它受影响案例。只补原01/04/05 Session各base/reuse两fresh生成、Project原01/05坏reuse各一次，共八HTTP200/direct15973；原Project通过base/04不重发。Project实际沿原atri_agent_reuse_plan重绑定原结构、清工具请求，不把plan命中当effect。05首两preflight因遗漏原runner的非readonly来源协调，返回authority_proof_unavailable；补原SourceLifecycle步骤后各v2通过，未改生产proof守卫或伪造valid hit。

五组匿名质量观察HTTP200/direct11219：01/04 Session持平，两个Project corrected reuse相对原保留的passed base无负差；Project repair/related不存在时0=absent两侧同判，不声称工具/正式Commit成功。05 Session reuse的“旁白不能…”出戏说明出现六维负差，原grader多维扣分的理由集中于风格，事实守卫单独保留，不修改原评分。

source35e补World固定解释：缺事件证据时，发生与未发生都保持未知。下一同style-v5一次HTTP200/direct2080仍写“脚步尚未迈出…都还没发生”，产品规则不冒称自由文本硬保证；再沿精确作者style-v6补自然留白语义，一HTTP200/direct2605没有越权事件，却将已知约处混写“在何处会面…抉择”。必要匿名观察HTTP200/direct2706，knowledge_boundary/actor_voice各-1，保留不利结果；

截至上述stage，新增34 admissions/34 HTTP200/direct72962（其中7评分格式失败与所有坏正文均计入），原quota1724→1758连续append/carry332不变。加前恢复v3组，包恢复后共43 admissions/41HTTP200/direct95209、2 TLS unknown/upper46348；M8 reported actual134/direct328796，原unknown2/upper17515/admission fetch0另列。不是独立语义评价。

高影响质量负差未闭合之前，完整G06/M8/HM2仍pending，M3前置保持。

M3入口已准备具体可审阅设计；用户明确选择“采用原作者/作品授权”，普通玩家按显式disclosure，不默认新增操控Actor全部私有认知读写。R5边界和 [M3入口设计](../../plans/architecture/agent-intelligence-runtime/m3-cognition-design.md)据此更新，S15–S21尚未实施。

后续位置归属诊断：style-v7 H0-ZH-05 reuse HTTP200/direct1916虽回到第三人称，却称“阿岚眼下仍在港口”；World只有场景location，无Actor/player归属。source `4160851ca` 最小固定解释禁止无明示定义/适用事实将World场景/地点分配给Actor或玩家；raw与旧评分完全保留，新的完整正文审读修正的是scope/解释结论，不是改写历史输出。style-v8的一次preflight未发送；下一泛化作者style-v9只沿原表达资源澄清第三人称/已知事实/未知事件/无人物位置归属，原Source/32-job bank不改，受影响五组共九必要generation正在继续。

位置归属修复的五组preflight均零外部API，泛化style-v9九必要generation共九HTTP200/direct25521：H0-ZH-08同bank三臂7988、ordinary frame2604、高影响frame4971，H0-ZH-01 pair4978、H0-ZH-05 pair4980。原query/Source与packet/evidence保持；同bank三臂仍8/19/27jobs，01/05 pairs各8/19。完整九正文审读未见将无归属World地点分给Actor/player、天气、hp标签或未知事件发生/未发生；不把高影响当前World场景值本身判成幻觉。此前所有明确人物位置语句与模糊“人仍在港口”作为不利材料保留，原基线六维的漏判也保留，未反向改写原报告。

既有JUDGE_RULE/六维、完整World未给Actor/player归属的实际事实明确后，七匿名观察七HTTP200/direct16746：三臂base相对旧v3不利正文改进；Invocation相对同版本base持平；01/05同版本pairs及ordinary08/high08原frame对照无负差。reuse对同版本base仅actor_voice-1，理由为“借书那天，阿岚借走”同词复出；原事实守卫维度全4，但不删除风格不利。未修改输出、做grader偏好提示或增加全局系统文风限制。

与初恢复组累计60 admissions/58HTTP200/direct139392及2TLS unknown/upper46348；M8 reported actual151/direct372979，旧unknown2/upper17515/admission fetch0另列。无价格/cache/upstream或controller金额补造。完整G06继续以最后同bank风格出口和所选matrix归档判断，未跳过M3前置。

最后同bank prose仍按原模型有限观察修正而不循环重发已通过案例。style-v10三generation/direct9032，base/reuse/Invocation使用完全相同新author frame与原bank，8/19/27 jobs；reuse六维对base持平，Invocation因正文将具体蓝封面书/履约背景缩为泛指借书而continuity/voice/narrative各-1。两评分/direct5787及所有reported成本保留，知识/玩家守卫均全4，没有把其它守卫PASS抵消此表达退步。只补作者资源要求保留来源已有的对象识别细节/履约时机，style-v11同bank受影响配对准备中；不补事实、输出后处理或指导grader评分。v4离线audit归档累计56新发送/direct131964、原quota1724→1780；含初恢复共65 admissions/63HTTP200/direct154211，M8 actual156/direct387798，原两组unknown与上界完整保持。

style-v11保持来源已有对象特征与履约时机，最后同bank三HTTP200/direct9113，base/reuse/Invocation完整正文均明确蓝封面书、下次询问时归还与当前记忆未知，没有人物位置/新增事件，逐臂8/19/27jobs、三settled model attempts、原packet/evidence保持。两必要匿名观察/direct5455均六维持平；不是独立来源或普遍叙事保证。`g06-continuation-audit-v5.json`零API通过，归档此前61新实际发送/direct146532、quota1724→1785/carry332与M1/HM1 pins不变。加初恢复组累计70 admissions/68HTTP200/direct168779/2TLS unknown upper46348；M8 reported actual161/direct402366，旧unknown2/upper17515/admission fetch0另列。所有七格式失败、World/hp/位置/事件否定失败、旧评分与软表达负差均留在分母，不退款或后处理。

未测连接、native compaction/cache/货币净收益、controller/bootstrap未计量边界与不利NN长Timeline不升级为成功；unknown不是0，也不阻断其它技术消费者。没有新设胜场、绝对自然语言保证或要求所有品牌支持。source4160851ca/docs原分支，main未merge/deploy，完整M8/HM2集成仍单列。

G06的S15前置和已明确的M3可见范围/接管满足，读取具体S15契约后开始原Actor/profile/Context consumer实现。S15文档在be4a5a2f3已push，首次push因TLS eof失败、必要重试成功；

### S15：精确 Actor 身份/profile 的实际消费者

source `1fb00fa5a` 沿原 Actor/PackageVersion/EntryPoint新增共享纯投影，原 Session projection保持全部旧字段/null回落，附精确公开 identity/source；未知 profile JSON 完整保留，不猜测认知迁移。legacy高级字段投影副本可编辑，不回写作者定义。原 Context only public actorId/displayName/role+source，required current-state进入原预算及 Source freshness。Information candidate replacement后只沿实际context view显式绑定且available的Actor；无grant/未绑定/未选择/不可用不补身份。没有 narrator voice/profile private字段、动态cognition、writer、新Task/API授权或模型请求。

初Host夹具使用不存在request ID kind失败，改为原request string后仅重跑失败项及实际变化项；其余通过不重复。改动文件lint/diff PASS；无外部API、整仓测试、build或浏览器。代码仍原feature分支，main未集成；完整cognition writer和自由文本审计留S16–S21。阶段出口通过，继续S16。

### S16进行中：独立Disclosure与Information cognition

source `4ddfcef68` 实施原Information v1可选narration（B默认separate/A限知绑定Actor/C作者选定view）、原Narrator context与player display独立grant，Actor/Task不继承旁白知识。旧schema无字段不迁移，原Memory/Hybrid资格与writer/CAS保持；required认知解释与Disclosure投影同原预算/Source。source `634b2494b` 后续补Information source/时态解释，未变World值或view权限。

受影响8 distinct本地PASS（FS/SQLite旧Host与PackageTask、旧Skill context、新S15 bound Actor和原Context私有原文排除）；初fixture修改display sources时原Graph closure拒绝，移除本案例未使用graph后通过；Task preview夹具补原PackageInstaller后通过。第一次误跑已不可用MySQL/Postgres，各两项ECONNREFUSED不冒称PASS；最小消费者只用当前本地FS/SQLite，不启动额外DB或全仓。改动文件lint/diff PASS。

私有主模型runner三模式预检零API；首预检因preview无Run bank而读取null失败，修正null诊断后通过，无HTTP。第一实际三HTTP200/direct5976，认知/Disclosure边界合规，但无source动作/纸张特征/微风均保留不利。原raw/Provider usage/settled bank均保留。source原feature分支，main未merge/deploy，S17可独立准备但不跳过S16出口。

### 2026-10-12 S16：恢复后逐记录 Disclosure 绑定与有限正文出口

读取原 HANDOFF → index → S16 → 最新 Record。没有重解压私有包、重跑已通过组、重问 M3、创建子 agent/Goal 或 merge/deploy main。source `d74de3efc4f55d01469b21d15c74800f6f50b31d` 从 `634b2494b` 修复实际 Exposure 传播：Information context 的每个原投影记录绑定独立 displayGrant，原 display 无此记录为 null；对应记录只准 display 已选字段/epistemic qualifiers，不由相似公共话题、context 阅读、rollup 或自然语言请求扩权。原 projection 和定义不改，Actor/Task/旧 schema 不加 marker；预算仍沿原 context count/render。宽 context 保持原 A/B/C 来源，未以减少 narrator context、更改 display 或输出后处理制造通过。

首 empty/truncated 测试编辑冻结manifest失败，其余4已PASS不重跑；改测试副本后只重跑两失败项。不再执行无变化产品组。日志与夹具/lint失败私有保留。

私有新runner `run-s16-disclosure-v4.mjs` 保持上一批精确作者正文，append-only `s16-cognition-preflight-v5.json` 三模式准备/HTTP0通过后，`s16-cognition-live-v4.json` 三HTTP200/direct7135（B2300/A2426/C2409），原raw request/response/normalized与settled成本保持。三条完整正文由repo agent非盲审读：未转述收到信/未署名/私有Exposure或沈墨被跟踪的belief；林舟只作为阿岚传闻，A/B未公开沈墨真相，C仅旁白揭示原获准沈墨真相；没有追加动作、物件外观、天气、位置或玩家行动。B“真实身份尚不明朗”沿公开传闻语境的未确证表达审读，不作为World真相未知或Actor私有不知的持久更新。不是独立质量评审或绝对泄漏保证；原9条 Disclosure FAIL 和scene/action FAIL不覆盖，S16有限出口据此完成，继续S17原依赖。

quota1794→1797连续append/carry332与M1/HM1 pins不变。S16累计12 admissions/12HTTP200/direct25112；自本设备恢复累计82 admissions/80HTTP200/direct193891及2TLS unknown upper46348。原M8组reported161/direct402366、旧unknown2/upper17515/admission fetch0另列；价格/cache/upstream维持unknown，所有失败计入费用。本组私有材料保留在当前完整private根，不提交Git。source/docs原分支同步状态以真实refs为准，main仍3ee1332ef。

### 2026-10-12 S17：Desire / Intention、原 Goal / commitment 关联阶段完成

依用户“继续进行，一直到达阶段完成”为当前出口推进S17；start source `d74de3efc`。具体契约归 [S17](../../plans/architecture/agent-intelligence-runtime/s17-desire-intention.md)，source实现 `76447056b`、限定取消语义 `d8f0d57e4`、Task writer scope收尾 `186c449fa`（当前）已沿原feature push；main3ee1332ef未merge/deploy。没有子agent/Codex Goal或重复M3审批。

不迁移旧profile/source，不新增状态表、Goal authority或World writer。commitment须为同Actor获准的原open_loop且在basis里。纯作者暂停/取消/放弃可保留原值撤回过期依据的计划；

认知annotation留在原maxItems/maxCharacters内。撤回/源改写/branch/epoch失效标stale，逻辑期限到达标expired，持久原值保持；同Actor同非空conflictKey的active current计划以priority有限竞争，最高并列保留conflict而不凭ID挑赢家，其余deferred。状态只是计划/解释，不执行动作。原Native Context/声明Task沿原Information源和独立displayGrant消费，policy明确单计划取消不否定所有未知计划、Goal/commitment引用不授权effect或成功、玩家自主权不替代。

私有context view不因Session owner而获准。读中source或Goal变更拒绝，readonly可查；原用户/Project Goal context、预算和续跑路径不变，Actor Goal完成仍 `actor_goal_completion_unavailable`。此阶段是关联与认知状态出口，不把认知满意/计划完成当用户执行成功；S18共享appraisal及S20/S21后续能力不冒称交付。

同时发现四schema反例初始夹具无效导致测试不可靠，补合法正例后全相关18项v2通过。后新增边界和变化仅跑对应失败/受影响项，22是distinct而非把重复次数计入成功数。改动文件lint/diff PASS；所有日志 `s17-local-v1..v6` / `s17-lint-v1..v4` 私有保留。

原受影响suite最小7distinct PASS（旧belief投影/输出截断/closed loop、FS/SQLite publication及原Goal Actor blocked/物理输出）。过滤不够精确误带入MySQL/Postgres各1 ECONNREFUSED，`s17-affected-v1.log`完整保留，不冒称PASS或启动额外DB，也不重跑已PASS的7项。未跑全仓、build、浏览器、M1/HM1、G06或S16三正文。没有额外隐藏模型调用或新bank，也不宣称每一原author/publication metadata CPU都有独立测量。

私有新runner原v1/v2及后续v3/v4均保留。`s17-intention-preflight-v1` active/cancelled两准备、v2 cancelled一准备、v3 active一准备均HTTP0；精确状态/displayGrant被真实Host消费。live-v1 source76447056b两HTTP200/direct6322（3284/3038）：active计划/愿望边界项成立，但用了未给性别的代词；cancelled另把单个计划取消泛化为“眼下并没有确定的执行计划”。两原输出按完整审读保留不利，未改World/授权或输出。作者frame增加姓名/省略主语避免补定性别。先只复测cancelled live-v2/direct3152，正文仅表示这一特定计划不再决定执行，愿望/原承诺保持；再只针对首active的代词项复测live-v3（current186c449fa）/direct3288，来源内的未履约承诺、持久愿望、未证实传闻与未来计划分域，未新增动作/性别/私有经历/他者认知。repo agent非盲完整审读的有限两状态出口通过，不宣称独立六维质量或绝对自然语言保证。

`s17-semantic-audit-v1.json`保存不利与最终范围；原S16九Disclosure FAIL及此前全部不利/unknown仍保留在private根，不提交Git。

自本设备恢复累计86 admissions/84HTTP200/direct206653及2TLS unknown upper46348；原M8组reported161/direct402366、旧unknown2/upper17515/admission fetch0另列，price/cache/upstream保持unknown。失败不退款、不把unknown当0。本阶段有限出口已完成；当前用户指定到阶段完成，下一阶段S18尚未开始，整体agent-intelligence-runtime仍未完成。正常进度仅归Plan/Record，不刷新旧HANDOFF。

### 2026-10-12 S18：共享事件 appraisal 实施与本地出口

依用户继续至阶段完成，从source `186c449fa`沿 [S18具体契约](../../plans/architecture/agent-intelligence-runtime/s18-event-appraisal.md)实施，当前producer `f62fcace0`、作者Prompt package refs夹具修正 `a8ca155cc`，尚待真实模型有限出口。原M3作者/作品授权不重问，main3ee1332ef未merge/deploy；没有子agent或Codex Goal。

原declared_app_command Task增加固定cognition.appraise binding，复用原workflow/outbox/NativeGenerationHost/TaskScheduler、Run后台窗口及原compute/localWork bank。target不由模型选domain，source和direction按Actor-bound Task view裁决，允许负向关系/情绪下降，不强制亲近或依赖。低重要性无send，缺证据或预算返回pending。在途source/取消/HEAD变化拒绝采纳，实际费用不退款。模型/Prompt/Generation/profile及旧值provenance由原Host opaque能力封存，caller JSON不可伪造；原author可以沿授权写入和纯撤回。普通turn只读state，不增加poll/timer/默认每NPC调用。

Information增加原application emotion/relationship语义，不迁移旧sources；raw状态保留在原domain/Revision，撤回/失效与Save恢复只改变读取解释。动态情绪和方向关系不当World Truth、他者真心、stable traits或实际行动；独立displayGrant可仅给text，level/rationale/model证据不自动公开。

最小新增本地14distinct PASS：真实FS/SQLite installed Host一次共享pass分别采纳负delta与负关系、sealed provenance/原bank/原定义World/Timeline保持、新service重读；低信息/读取不排Task，逐组件拒绝私有来源/自身target/过大delta且坏首组件不阻挡后续同target合法组件；source/Actor/旧state调用前失效，epoch/profile/branch/Package/missing proof与declared closure反例，伪造Host/作者冒称模型，在途source/取消与Save恢复费用，no-change/缺预算/耗尽pending，撤回/恢复原值stale，坏structured输出结算后重启沿同bank拒绝新增额度。没有全仓/build/browser、不可用DB、已通过M1/HM1/G06或S16/S17正文复发。

所有`s18-local-v1..v10`、`s18-lint-v1..v3`、`s18-affected-v1..v3`私有保留。早期夹具共享view数组导致duplicate来源、localWork新增kind未纳入原枚举、短synthetic secret撞上公开fixture字符串、采纳后Run账本已归档却按当前operations查找、后台budget夹具缺authority/原Logic v3/必需Transaction逐项修正，失败不冒称PASS。旧受影响首次命令遗漏Jest config导致import期process.exit(1)，第二最小命令2项PASS/后台名称过滤未匹配，第三仅两后台项PASS。14/4为distinct而非执行次数。源码改动文件lint/diff PASS。

私有runner预检v1零API因Prompt module package refs缺ID失败，修正夹具后v2实际Host精确Task Prompt/来源准备通过、零API。连续2000/20RPM sender保持原quota1801起append与carry332，M1/HM1 pins未改；

emotion worry delta-15采纳为25，relationship trust delta+10采纳为10，两个receipts分别applied，原World/Timeline/definitions保持，原后台bank1settled modelattempt与8settled local jobs归档。候选明确为阿岚的有限解释，未写沈墨真实心理、私有经历、新行为或强制依赖；

同runner原计划继续正文时，私有lanePlan只给budgetContext、遗漏原executionResources捕获的routes，在发送前Cannot convert undefined or null to object；错误与原已付费appraisal均保留。runner finally已清理临时Session，未保留其完整package archive/portable Run，不能冒称原Session可无损续跑。新Actor/Session/branch/source anchor、replay model provenance明确区分，不给原primary provenance假装迁移。重放raw usage仅作原response字段，不计新的外部发送或新增direct费用；原实际primary成本仍唯一计入连续账本。

保留失败，修正私有fixture Actor registry后v3原Host重放采纳及精确正文Context/policy/独立text-only grant准备通过、外部零send。source无变化，不重跑产品已PASS组；下一只真实调用后续正文。

后续正文第一次live（`s18-prose-live-v1`）仍零API：原Host公开execute会再进Scheduler，私有runner给的budgetContext未传入新captured lane，原native_generation_budget_lane_denied正确拒绝。下一仅修正私有composition，沿原TaskScheduler明确父lane、executionResources、fresh与原Run bank，不修改生产预算守卫；preflight-v4零外部API通过，live-v2一次HTTP200/direct5007，真实正文完整审读只表达获准的澄清/阿岚听到、已公开的担忧缓解及方向信任；没有数值/delta/rationale/profile、private memory/他者内心、新行动/台词/性别/天气/位置/玩家选择。原public-emotions/public-relations两个text-only displayGrant current active，raw emotions/relations marker的item仍null；状态、World/Timeline/definition保持。`s18-semantic-audit-v1.json`为repo agent非盲有限审读，不是独立评分或绝对自然语言保证。

后续runner normalized采用report名称+request ID并拒绝覆盖；当前最后replay文件另以明确名称保留。audit-v2因原quota字段为id而非attemptId失败；audit-v3因原marker为displayGrant.item null而非outer null失败；所有私有报告、失败和raw未提交Git。

S18累计2真实admissions/2HTTP200/direct7236（2229 appraisal +5007 prose），所有local response replay/preflight均零外部API、原usage字段不重复加入direct。quota1801→1803连续append/carry332和M1/HM1 pins保持；自本设备恢复累计88admissions/86HTTP200/direct213889及2TLS unknown/upper46348。原M8组reported161/direct402366、旧unknown2/upper17515/admission fetch0另列；price/cache/upstream仍unknown，失败不退款/不按input+output猜total。当前source `a8ca155cc9614a75b10c2289ea8e902113886465`的有限S18产品出口完成，原Session两primary端到端消费及完整portable认知/费用恢复没有冒称通过，S21仍后续阶段。

用户当前明确到阶段完成，故在S18出口收尾；S19–S34未实施，整体agent-intelligence-runtime未宣称完成。正常进度仅写同一Plan/Record，不刷新旧HANDOFF，不merge/deploy main3ee1332ef。

纯撤回原值仍沿作者授权。仅新增真实publication foreign-target负例1项PASS（`s18-local-v11.log`），两改动文件lint/diff PASS，不重复原15项之外的已通过组、完整primary样本或重放。S18最终15新增distinct/4受影响本地PASS；

### 2026-10-12 S19：一阶先行、有界二阶ToM实施与本地出口

按index→architecture §6–7/compute-policy §2/behavior-context/baseline/M3/S18及最新Record继续，新增 [S19具体契约](../../plans/architecture/agent-intelligence-runtime/s19-theory-of-mind.md)。M3不重问，不建子agent/Codex Goal，不merge/deploy main3ee1332ef。

沿原cognition.appraise可选theory target，旧S18 input/output严格闭合不变。只有作品明确声明时同一共享pass追加最多8个flat hypothesis候选；原Information新增theory_of_mind source、inline policy id/revision、原canonical lifecycle domain/command。主体是观察Actor A，perspective[B]或[B,C]分别是一阶/二阶的A自身推断，C可为A；不读/写B/C私有mind，不创建递归node/引用展开、第二facts graph、新Task/timer/每回合调用。policy depth1..2、每Actor当前domain全量nodes1..16、每事件updates1..8；撤回节点占容量、重复key及换subject拒绝，旧值保留原Revision。

原Host opaque model/Profile/Prompt/Generation provenance、event/Actor/package/branch/epoch/旧state pin与Run后台窗口/compute/localWork bank继续裁决；confidence只是相对且未校准的表达。

可选prediction指向原作品声明的truth application行为item，target/observed/outcome字段须在当前consumer可见且有类型/枚举；观测true/同target/不匹配expected时仅有界读projection标contradicted，并对已授权confidence字段应用min(旧confidence,作者反例值)，原raw不变，不追加API，也不推导target真正相信相反内容。隐藏/未知/不同target不计match或反驳；撤回/stale不再当当前解释。独立text-only display不会自动公开confidence、perspective、prediction或rationale。首次没有任何hypothesis的Task也获得required语义和作者上限，避免凭空绕过解释；正式读工作沿原Context/localWork消费者。

本地新增14distinct PASS：FS/SQLite实际installed一阶Host/封存来源/独立display/原bank/新service重读；一阶明确拒绝二阶/私有来源/另一hypothesis，之后二阶在同pass与一阶/情绪/关系分别采纳，Context/实际HTTP stub无B私有mind；node/update容量、未知/匹配/已观察反例、不公开行为隔离、声明closure反例、作者foreign/self/model冒称/policy/subject变更及合法更新、撤回节点容量/Save raw与旧branch stale/费用、behavior排队前/在途变更、空state必需Context/预算和非法预测枚举/peer、自身foreign/duplicate。1受影响旧S18 FS共享pass PASS；已通过S16/S17/S18完整组、paid组、DB/全仓/build/browser没有重跑。

`s19-local-v1..v5`全部保留：v1一阶三PASS；`s19-lint-v1/v2`的catch brace与暂未使用的未来测试helper imports保留，补实际消费者后v3改动文件lint/diff PASS；distinct计数不累加重复执行。真实原连接有限出口尚待下面结果追加。原S18完整normalized缺失和下游重放限制保持，不用新阶段消除旧证据缺口。

S19 producer `9c393143d91c35a18b12b0cb590dccc20f0e9b28` 本地完整实现提交。私有runner v1的Task/正文preflight零API通过，唯一命名且exclusive-write的完整normalized、原package archive及before/after原Save都在private根。第一live Task实际HTTP400/上游INVALID_ARGUMENT，无normalized正文或采纳；原quota1803→1804与Run bank背景attempt1/usage unknown/upper6261完整保留，不当0费用或成功。实际具体schema拒绝原因未确证；[Gemini官方structured output文档](https://ai.google.dev/gemini-api/docs/structured-output)说明复杂schema可能被拒绝，此为尝试减少wire约束的依据，不把推断升级为本gateway具体根因。

producer `e39a425a9` 沿原HTTP adapter增加显式connection.options.responseSchemaMode=shape-only，仅从wire JSON schema副本去掉长度/数量/数值边界，types/enums/required/closed object及tools保持；默认full与原PromptIR outputContract完全不改。strict:true/未知mode/raw-text明确拒绝，未把output authority改成prompt文字或自动silent fallback。新增5distinct PASS（4实际provider render/strict/raw/invalid mode、1真实Host坏confidence101即使wire不含maximum仍原typed Task拒绝/settled费用/不写state），原真实HTTP工具+strict结构化协议1受影响PASS。阶段累计19新增/2受影响distinct本地PASS，不重跑未受变化的ToM已通过组。

`s19-local-v6`六PASS，source/新ToM测试lint-v5 PASS；该文件只关闭既有这一条规则后的静态lint通过（`s19-lint-provider-matrix-v1`）；保留完整规则失败，不冒称完整配置全文件lintPASS。源码diff PASS，不新增lint suppression或修改产品权限。

私有runner v2从v1真实保存的exact package/after Save沿原installer/import恢复相同Session/revision，并以原RunControl持久port恢复其原完整external control；此为私有测试恢复composition，未把普通Save自动跨设备携带费用作为已交付生产能力。preflight-v2 Task/正文原Host准备通过、零API；当前只复测失败Task然后在同Session消费正式行为反例的正文，不是重放或新建model allowance。原S18快照缺失依旧保留。

`run-s19-tom-v2` live-v2 sourcee39a425a9在同一原Session/revision/原bank恢复后必要重试成功：Task一次HTTP200/direct3055，原same background operation累计2attempts（首HTTP400 unknown6261和本次settled3055）均保留，分别采纳一阶share-next/二阶view-of-aran，55/45相对confidence仅在内部；hypotheses只引用events:contact，Actor主体/perspective、author-tom/v1、原模型/Prompt/Generation/profile/old state metadata封存。原beliefs（含B私有mind）/Actor definitions/World/Timeline保持，没有把A解释写入B真心。

随后原作者正式behavior app.command发布observed=true/同B target/action=withhold的有限行为反例；原hypothesis raw不变，A读投影首预测contradicted/已授权confidence0、第二条active，player只获得原公开text/status。不增加一次认知调用。原TaskScheduler/current Source/冻结lane/原foreground Run bank的一次真实Narrator HTTP200/direct5538在同Session消费这一current projection：正文只表达A的未证实猜测与获准观察不符，明确不能反推B相反信念，二阶仍属A推测且未确证；没有confidence/itemId/expected/perspective数组、private memory/他者真实mind或新行动/台词/性别/天气/位置/物件特征/玩家选择。完整输出由repo agent非盲审读，`s19-semantic-audit-v1.json`保留有限结论；不是独立六维评分、概率校准或绝对泄漏保证。

测试用原持久port恢复external control的实际成功不升级为普通Save自动恢复全部费用的产品能力；S21仍后续阶段。

S19阶段累计3真实admissions：1HTTP400/unknown upper6261、2HTTP200/direct8593（3055+5538），没有删掉首失败/退款或将unknown当0。quota1803→1806连续append/carry332与M1/HM1 ledger pins保持；自本设备恢复累计91admissions/88HTTP200/direct222482，3unknown（原2TLS与本HTTP400）upper52609。原M8组reported161/direct402366、其旧unknown2/upper17515/admission fetch0仍另列，price/cache/upstream保持unknown，不按input+output猜total。

S19有限阶段出口完成，source `9c393143d`、`e39a425a9`沿原feature保存；19新增/2受影响distinct本地PASS，所有local/lint/Provider400及私有证据保留。当前用户明确继续“下一阶段”，本轮收尾到S19；S20–S34未实施，整体任务未宣称完成。

### 2026-10-12 S20：因果轨迹、Memory applicability 与遗忘有限出口

用户继续下一阶段；沿最新index/architecture §6.1–7/Hybrid Memory/M3/delivery及同一Record推进 [S20](../../plans/architecture/agent-intelligence-runtime/s20-memory-applicability.md)，不刷新旧HANDOFF，不重问原作者/作品授权，不建子agent/Codex Goal，不merge/deploy main `3ee1332ef`。

producer `6de1328c4` 在原Information source、canonical生命周期domain、原command/Session CAS增加作品opt-in memoryPolicy与truth application causalBasis。Memory actor/text/status/recordedAt/role/clarity/use/basis/applicability由作者或原精确Task grant发布；Memory role由作品分类、记录内role和历史时点不可改；mode缺省light，只派生非关键detail blurred/reluctant，identity/commitment/relationship/key_event仍clear/willing。作品明确deep时才接受有源forgotten/reconstructed/unavailable detail；不自动生成错误重构文字、删除World真相或把原检索/索引/summary压缩当角色失忆。旧Memory/Chronicle不迁移。

Desire/Intention可引用自己获准且当前的Memory/appraisal；正式行为沿原truth app.command保存basis，不新建事实图/另一个graph store/timer/Task/每turn认知调用。最大依赖深度4、拒绝环/foreign Actor/隐藏、失效、未选意向；原意向竞争结算后再次传播解释失效。源事件改写后appraisal→intention→action explanation逐级stale，已发生动作的原raw和旧Revision保留；不会推导动作未发生、强制续行动、履约或Goal完成。appraisal原sealed Host provenance与非认知来源限制没有扩大。

没有当前关联/隐藏证明为unknown，不是角色没有目标，不授予原外部Goal执行权。Memory only-text alias不自动附带私有clarity/use/条件；current派生qualifiers与raw历史字段明确分开。post-retrieval由原Package Memory bridge、Host Turn intake与Context compiler共用准入：每条timeline ref须由该consumer当前可用的managed Memory basis覆盖，撤回/过期/unavailable/不可见use拒绝；旧无policy作品保留原可见来源/branch/revision消费者。检索packet独立displayGrant null，正式公开历史仍从原Information display grant消费，packet不扩权。必需Context解释不把检索当新记起/愿意/信念变化，角色遗忘与World历史/索引删除分别裁决。

12新增distinct本地PASS：FS/SQLite真实发布事件→作者appraisal→intention→正式action/CAS与新service重读；事件修订只失效解释/保留已发生动作及未履约承诺；轻度模糊/四关键类别保护/纯读与only-text私有隔离；显式deep有源遗忘/重构/withdraw与旧Revision；Clock/Goal关联/例外/缺关联；原bridge→compiler共享post-retrieval/Context/private packet、withdraw拒绝；foreign/hidden/self/multi-node cycle/保护及future time原publication原子拒绝；alias policy closure/legacy兼容；Memory支持意向/withdraw和竞争使动作解释失效；深度4与隐藏来源；actual Host原Turn在发送前拒绝withdrawn Memory/fetch0；partial Memory grant隐蔽use不能支持新意向。2受影响distinct PASS：S17原竞争/Actor分离/撤回/保留desire消费者，以及G3原memory:true/精确可见provenance桥接消费者。

`s20-local-v1..v7`全留：v1 fixture async默认参数错误、0执行；v2链路PASS/light负例因原Authority封装错误文本与测试预期不符FAIL，修改为实际公开错误后v3七PASS。v4新增两PASS和旧S17 PASS；新Host缺intent_resolver route、旧G3 synthetic entryPoint缺actorIds两FAIL，补测试路由与原fixture必要actorIds后v5两PASS，不改产品fallback。`s20-lint-v1`缩进/fixture解析错误保留，v2/v3改动全文件静态PASS；最终 `9736eabd5` 要求Memory use明确获准为willing/reluctant，v7仅新增实际部分字段grant负例PASS；标准完整grant路径不受影响，未重跑已通过组/正文。

私有runner `run-s20-memory-v1/v2` 与所有package/archive/native Save/原external Run bank、raw请求响应/完整normalized/实际Context/PromptIR都留在原private目录。v1零API preflight因自定义lanePlan缺Host完整routes capture失败；v2沿原executionResources捕获后零API预检通过，不修改产品。live-v2 source6de1328c4一次原连接HTTP200，direct reported total5955（input4840/output71/total5955原样，不能按input+output推导total）。同原Session实际消费作者来源appraisal/意向/确认行为、protected commitment以及自然blurred detail；Memory recall是受控本地adapter返回正式timeline源，再经过原Package bridge和actual Host/compiler/PromptIR，不冒称真实长程检索排名质量或新paid model cognition pass。最终raw state/World/Timeline/manifest完全相同，原foreground bank一个settled attempt及5原localWork均保留；没有新认知调用、response replay或退款。

零API audit v1/v2分别因normalized context.history外层对象及role/content wrapper形状误判失败，原failure JSON/script/log保留；不为audit失败重复API。

S20累计1实际admission/1HTTP200/direct5955，无新增unknown；quota1806→1807连续append/carry332与原M1/HM1 ledger pins保持。自本设备恢复累计92admissions/89HTTP200/direct228437，原3unknown upper52609（2TLS+S19HTTP400）保持；原M8组reported161/direct402366、其旧unknown2/upper17515/admission fetch0另列，price/cache/upstream仍unknown。S18完整normalized缺失及下游本地重放限制保持，没有用S20冒称修复历史证据。

S20有限阶段出口完成，source `6de1328c4`/`9736eabd5` 与docs沿原分支push仅存储。12新增/2受影响distinct本地PASS、1HTTP200/direct5955、私有证据/全部失败/连续费用均保留；S21–S34及完整任务未宣称完成。

### 2026-10-12 开发私有资料精简与本地恢复

用户批准“当前 API 配置 + 极小限流状态 + 阶段摘要”，并明确将三个旧迁移/备份目录纳入清理。源码先 ff-only 同步至 `9736eabd5`，docs 至 `1042680aa`；main `3ee1332ef` 不变，原 docs 未跟踪 `agent-experience-evolution` 草稿保护。旧 HANDOFF 的 S16 缺口已被最新 index/Record 的 S20 出口取代；恢复后移除旧快照，不新建交接。

两套私有目录中四份当前 API 配置逐字节一致，primary endpoint/model 与最新阶段记录一致；保留原配置与凭证，不上传公共 Git。三个旧迁移补丁只含已由当前治理取代的规则文字，没有独有产品实现补丁。将旧私有测试根及三个迁移/备份目录移出工作目录，共 57796 个文件 / 2120568172 逻辑字节；批量永久删除遭工具自动审批策略拒绝（仅返回 blocked by policy），改用 Windows 回收站，未永久擦除或宣称释放同等磁盘空间。当前私有根仅四份配置、一份 quota 与一份本地阶段摘要。仅清理开发资料，不触碰产品用户数据/Session/Save 或生产费用持久化；远端私有仓库和另一设备数据未修改。

本机私有包只有 1659 条旧 admissions，均在当前滚动窗口外；另一设备最新 S20 Record 为 1807 条。缺失差额 148 的准确时间不可得，本次导入将差额一次保守计入当前 carry，24 小时后过期；不把缺失时间当 0 用量、不伪造恢复原始调用证据。生产费用 authority 不变。

源码本次提交 `96ff4487e` 沿原 `M1ApiQuota` 清除过期 admissions/carry，保留有效滚动 24h 与 20 RPM 原 authority/排队；恢复时即持久化压缩状态，不只在下次付费调用后清理。`withPrivateTestRun` 复用同一 quota，用排他锁串行共享连接测试，在系统临时目录容纳当前 fixture/诊断，成功或失败均清理；API 配置只通过白名单读取，不另建产品持久层。已完成的旧 M1 runner 不自动重跑。详细保留规则只在 Governance §13.1 定义，旧私有路径相关本地 Git 配置已修正，失效 ledger/limits/artifacts 映射移除。

实际四份本地凭证由新 helper 私下读取成功，carry148 保留，结束无临时锁/fixture；四个清理目标均不存在于原路径。外部 API 0，不重复旧已通过产品组，无全仓 test/build 或 main 集成。
### 2026-10-13 S23：只读预测工程消费者与外部证据边界

直接原用户消息 `01a1309e-28de-7b01-808e-311741b4d044` 要求继续 S21–S34、长期场景与子代理并行；本线程入口直接用户消息要求续接原聊天。监管提示新增 S21/S23 合成素材的外传范围需核实；在本线程可见直接消息中尚未取得单独明确新增素材外传的证据。已有 S21 实际结果/费用仍如实保留；恢复后没有新增 producer/judge/诊断发送，S23 真实 provider 出口 pending。此边界不替代本地工程推进，不把 Plan/Record/助手文字作为发送许可。

新增 PredictionService 消费原 interactive advisory Task、server WeakMap capture 与 exact player observation/action，原 Host 私有 narrow lane 继续 RouteResolver/PromptCompiler/token/provider/RunControl/TaskScheduler。内部 capture 必须匹配 Host 与 authenticated handle，不能复制/跨 principal；关闭 Memory/Knowledge/Skill/tools，返回 typed hypothetical prediction，不提交 Task result、World、Clock、Memory/outbox 或正式 action。current 只证明 source freshness，不是模型真实性或发布能力；support refs 白名单与 uncalibrated confidence 保持。实际 provider/profile/model/generation 字段经白名单投影，endpoint/options/private diagnostics 不公开。

原 Host local quota/readonly preview 2受影响 cases PASS。consumer 6 distinct PASS。HTTP 首次3 cases失败于 shared fixture 直接写 derived public_notes；错误始终保留，不放宽产品 derived 写权限。不当发送失败或费用0。

移除 S21 runner 机器专属私有目录，改读本地 Git 配置并兼容 root/Document；实际零API preflight PASS，static/syntax PASS，carry不重导入/清零。S23 runner只准备同一临时 helper preflight，不自动发送。capture准备的本地CPU计量仍在接原 localWork，最终工程版本/结果待后续补记，当前不宣称 S23 完成。
S23 工程 checkpoint `defc95b55bc7e98e639dfdbde23120b75cc5ddc2` 已push原feature。最终17新增distinct本地PASS（Host7/consumer7/HTTP3）及原2受影响PASS；全部9修改文件 ESLint、syntax/diff通过，当前runner实际preflight apiRequests0/attempts0/localJobs0，原全状态与费用保持。准备层的rehearsal/projection/source fingerprints工作沿原context_build计量，估计items/bytes含pinned源、assets、Timeline及domain records，finally结算真实process CPU/wall；失败和取消保留，maxJobs耗尽拒绝后续准备。匿名预测不进入World/Task结果，真实provider出口仍pending，本地fake transport成功不升级实际能力/收益。

沿现有合法后台Task/outbox/RunControl处理普通slow工作，不启用新classifier或默认额外认知调用。
### 2026-10-13 S25/S26：普通异步后台与可选计算留额工程出口

原operation有已发生发送但无可信采纳receipt时保持pending `native_task_outcome_unknown`，不因Host重启或原Scheduler失败重跑获得新发送；仅普通lane禁自动retry，不改Simulation/appraisal既有retry。旧无generationBudget作品保持旧消费者，不把本组扩大为全部legacy后台恢复保证。

22新增distinct FS/SQLite Host tests PASS：普通/declared app-command真实采纳、window/period/local限额、forged/changed输入及scope拒绝、实际Engine reopen pending/charged/unknown、无默认binding、晚到/取消费用、跨Host同intent并发一次send、取消worker未结束permit保持。原Simulation queued-batch retry两引擎与原Memory fast规则1项受影响PASS。回归第一次pattern误匹配MySQL/Pg，两数据库本地端口未启动而ECONNREFUSED；

Project原S13 durable wake/unknown/取消/费用/Review证据复用，未重跑未变化完整组。审查发现pending wake后来进入Review时pump仍submit，虽claim会拒绝正式工作但调度不应启动；同一stoppedTask谓词接wake/pump及Scheduler fresh。真实FS/SQLite两新增cases修前FAIL、修后PASS，包含已pending/已排队进入Review、恢复仍stopped、原pending历史/费用/Project revision保持；原S13 queued-source invariant两受影响cases PASS。S25累计24新增/5受影响distinct PASS，4归属文件ESLint/diff PASS。实际低延迟/难例quality-cost收益仍pending，不把fake transport与工程恢复当实测收益。

未知上界返回`native_generation_required_budget_unknown`，留额不足为`native_generation_required_budget_reserved`，必要工作自身耗尽仍原budget_exhausted。reserve不是新ledger、不写成更小durable限额，必要Host/Task仍可用原额度。缺policy固定规则不变，Embed/necessary corpus不套可选留额；client自报policy/余额拒绝。shared safe compute codes让真实HTTP/原invocation stop能区分原因，不泄露private diagnostics。

10新增original Session/Project ledger tests及2新增真实HTTP拒绝投影PASS；并发、unknown/token上界、必要工作可用、fixed回退、客户端伪造和必要corpus/local admission保留。原contracts/retrieval 146-case回归首次145PASS/1FAIL：旧local index+Narrator fixture maxJobs1已被index耗尽却期望Narrator继续发出，与当前必要Host localWork计量矛盾。原全文件ESLint20诊断均在其它既有行，经HEAD baseline/current源码诊断逐项比对相同；修改旧case未增加lint诊断，不冒称该旧文件完整lintPASS。其余10修改文件ESLint及diff PASS。

两source提交均已push原feature。S25普通/有限S26工程出口完成；不把工程checkpoint作为大阶段换聊出口。新增外部发送0，不merge/deploy、无新HANDOFF。
### 2026-10-13 S24：双域候选建议、正式receipt与恢复保护

Native服务器有界比较最多8声明action/16已有公开typed目标，固定目标满足数与公开delta规则，全部目标满足才返回proposal，否则abstain。服务器绑定exact源、原Route/policy、owner和storage authority；缺routeRef仍解析真实默认Narrator预算，不能绕过原localWork。Clock反馈及自由文本模型误差保持不可机械测量。可选预测沿S23原消费者，不接caller自报prediction/receipt。

只接可恢复source/project/frontend操作，拒绝Library资源修改。真实outcome经原completed Task和Studio Git changeSet receipt；

故障审查发现原Studio恢复失败后普通Task结算会触发源同步，把临时candidate当作用户编辑提交。持续失败记录Git marker及原Task服务器source identity。双marker写失败仍经原Task durable proof阻止fresh Studio同步；Task持久化也失败则明确recovery_persistence_failed，已charge费用不伪作settled。精确原HEAD/源恢复后只清活动proof，blocked/历史/费用保持，原takeOver可执行。Preview清理失败不再跳过恢复或覆盖恢复失败。原ProjectStore拒绝.git大小写变体，避免Windows路径alias访问恢复metadata。

Project17 distinct（FS16/SQLite1）已PASS，root最新整合Project17+HTTP2均PASS。Git metadata路径1项PASS。初次Studio改动lint发现brace-style/no-unsafe-finally，已改helper收尾；

恢复后新增外部发送0，原S21实际结果与费用保留。不merge/deploy、不创建新聊天、不生成阶段HANDOFF。
S24最终source `886aa3566`。最终33新增distinct PASS：Native12、Project18（FS17/SQLite1）、HTTP2、Git metadata1。新增Project跨engine同owner/跨owner隔离PASS；
### 2026-10-13 S27：公开表达计划的原文字消费者

按delivery精确依赖S18/S25推进M5有限本地范围，不以M4真实provider/收益pending自动停止全部S/G，也不冒称M4完成。source `4fe3a172a`：作品可选原Information narration.expression绑定已有Actor、五类communicative intent及context/display共同选择的1–8源；原manifest closure继续核实Actor。无配置保持旧路径；缺获准公开依据typed文字fallback，不从private context补齐。原compile prose/contextProvider实际消费同一plan，原Actor表达/Narration模块及World/玩家权限不变，不新增state writer或默认调用。表达准备/重投影仍原Host localWork，原authority4096 scan callback累计，超限不吞为fallback。

新增shared10与真实installed FS/SQLite Host6 distinct PASS；原S16三种installed/strict7/legacy1及G02角色表达模块1共12受影响distinct PASS。Host走本地loopback实际HTTP adapter一send，reported17tokens原bank，返回文字且Session只读；在途源改拒旧结果、费用转原retiredCompute保留，cancel后unknown attempt不退款。公开emotion仅text/derived限定、不取private等级/rationale，原Memory必须current/applicable/usable。6文件ESLint/diff PASS。loopback不是实际模型语义/风格收益证据，新外部发送0。

S28只读盘点后真实静默本地试合成：Windows SAPI现有中文voice、plain text/Rate2/Volume80，RIFF/WAVE118896bytes、非零PCM118850bytes，22050Hz/16bit/mono，音频时长2.695s、单次合成47.534ms。临时测试句/文件已清理、未播放、网络0；仅证明文件输出可用，不宣称prosody、精确phoneme timing、取消、质量或完整Task消费者。机器voice exact id不写进产品默认/代码；待原预算/Scheduler/AssetStore接线。M4外部证据pending保持、整体未完成，不创建新主聊天、不merge/deploy。
### 2026-10-13 S28：原辅助任务与本地SAPI真实音频

source `43a1505e2`已push。独立隐藏Windows PowerShell helper、stdin JSON而非拼命令、纯text Speak flags16与exact现有voice；文本2048字符/Rate/Volume范围及WAV16MiB上限、PCM解析。取消/timeout实际kill并等待close才清临时目录，非Windows明确unavailable，不自动播放。provider只声明plain text、rate、volume；prosody/phonemeTiming=false，总duration不是词/音素时间轴。实际单次WAV118896bytes、2695ms，helper synthesis15.410ms/含子进程377.183ms仅本次环境观察，不推广性能SLO。

SpeechService只消费原S27选中且独立display授权的该Actor原Timeline assistant content/actorId，核实原message/variant/源当前，不接受caller任意text/audioartifact。原TaskScheduler辅助interactive任务、RunControl context_build/speech_synthesis/speech_publish本地费用、AssetStore exactaudio与认证HTTP voices/start/status/cancel；无新Session/World/Memory writer、无durable speech registry。原Route真实预算缺失fallback，耗尽不会synthesize；同voice/当前源有界10min transient cache可复用，但不凭客户端重建producer身份。parent process CPU与实际本地wall计量，不声称完整child CPU或付费模型费用。新外部发送0，原私有helper/carry148保持。

新增18 distinct PASS：provider6=2真实（WAV/unknownvoice与spawn→kill→close→settled实际取消）、4模拟/输入边界；取消忽略abort worker仍占Schedulerpermit至实际settle；source/Route变更拒采纳；跨owner/engine隔离；finalize结算失败清未采纳asset而原charged费用保留。原Information contract2和Scheduler最终采纳/timeout2受影响PASS。

初轮consumer6全部FAIL发现原canonical Timeline白名单允许actorId，却先经lowercase Task identifier拒绝，修原字段authority允许仅Timeline canonical actorId；下一6仍FAIL为fixture错误声明禁止的Timeline actorField，按原schema移除而非放宽权限，随后6PASS。审查另修并发duplicate覆盖record造成artifact丢失/漏清资产，共享4096scan限额与native_speech typed error投影；TTL清理只保留原AssetStore已正式引用ref，不锁死全部Speech；不同注入Scheduler不混读producer。9JS文件ESLint及diff PASS；

继续S29原renderer实际画面与fallback；M4真实provider/双域quality-costpending不改写，main/无关草稿保持，未merge/deploy/换主聊天。
### 2026-10-13 S29：原Frontend公开表达、真实画面与解码故障

source功能`05a18e6d4`及末尾规范化`293653079`已push。当前InformationContext与ExpressionPlan累计4096扫描，失效/截断/无配置安全fallback。PNG由本机Chromium对确定性code-native SVG光栅化生成，临时装原Package，未提交机器cache/二进制；素材选择只表示作者公开表达建议，不是实际心理或动作。

新增backend4 distinct PASS，原Conversation7受影响PASS；初轮新fixture错误按原schema修复后通过，不把fixture失败当产品成功。source Actor授权撤回、scope suspended触发真实app.command及bridge revision刷新，图片隐藏/文字常驻、全部原Session/state/费用只读、browser外部请求0。inform/reassure来自两份真实installed Package，不直接改frozenmanifest冒称动态authority；ask未映射/他者ready/legacy不配置均文字fallback。

实际截图发现exact损坏PNG decode失败但原dataset.mediaStatus仍available。最小修复原runtime img状态：resolve后loading，真实load/naturalWidth才available；作者CSS visibility隐藏破损图并保留空间，文字/键盘操作始终可用，不扩大asset/host权限。damagedPNG→新真实validPackage恢复、dispose后旧image late events及当前validimg lateerror不覆盖可用状态full390 PASS，原frontend platform required media decode/local boundary1 PASS。root实际view最新390broken/恢复以及先前390/1440ready截图，无异常溢出，已移除raw ready/reason技术码。截图是临时QA材料，不是新产品source或长期用户数据档案。

6归属JS文件ESLint PASS。原失败/缺口保留。有限S27–S29工程消费者已完成；真实模型语义/风格/长期收益、M4实际provider/双域quality-cost仍pending，不声明完整M5退出、不创建新主聊天/阶段HANDOFF。接下来按正式依赖冻结S30有限本地READ protocol scope，已核实原plugin SDK版本、独立temp精确依赖，不启动用户数据server或外传新素材。
### 2026-10-13 用户要求M5工程换聊：停稳与S30准备保留

当前用户经可信监管转述明确要求M5有限工程自然边界换对话；通知到达时S30配置子代理已开始原contracts可选mcp修改，未启动adapter/provider/SDK Server。让现有命令自然结束，不取消、覆盖或丢弃；全部三个子代理结束，报告无本人启动的受控子进程、请求或测试仍运行。root不再开启S30实现，按Governance §7刷新唯一HANDOFF，不建历史副本。

S30范围与精确SDK准备保留：固定2025-11-25 JSON响应的loopback READ、原ConnectionProfile/Route allowlist及RunControl/Scheduler方向，真正client准入/协议/工具与资源出口未实施。SDK1.30.1来自明确public npm registry，独立temp安装禁scripts/audit/fund、不改repo lock/userconfig；仅公开协议资料/registry读取，无新素材producer/judge/诊断外发或MCP工具请求。退出前没有Server启动。无关Experience草稿保持，main仍`3ee1332ef`，没有merge/deploy、新主聊天、Goal或永久调用正文/私有账本。

### 2026-10-13 S30：真实有限本地MCP READ消费者

新主按实际Git/status恢复唯一工程交接：source a82723153、docs5580e6621，与原远端一致；无关Experience草稿保留。已恢复快照事实归本Record，删除不再需要的live HANDOFF，未创建历史副本或再次换主。M1/HM1和S27–S29未重做，M4/M5真实质量收益仍pending。

原Route可选mcp声明和owner ConnectionProfile只在显式start消费；provider.mcp/transport.http、字面127.0.0.1/[::1] HTTP、无redirect/userinfo，auth none或原exact SecretRef。服务器从当前player/display view选exact item text/content；private view、caller正文/endpoint/header/secret/未allowlist项拒绝。真实discovery必须包含选中工具/resource。固定2025-11-25 initialize/initialized及JSON单响应子模式；SSE/callback/未知版本/HTML/file/resource link执行unsupported，完整Streamable HTTP通用兼容未宣称。连接session token仅内部保留，外部结果白名单投影与profile/protocol/source/input/output fingerprints不获World/Memory/Task/Goal写权限。

每请求壁钟/当前进程CPU计量不等于远端CPU/费用或硬上限。失败、取消、耗尽和late result不退款、不自动重发；已dispatched远端结果未知明确unknown，Cancel通知只是建议，initialized不发送非法initialize取消。取消cleanup通知仍fresh/预算且有独立5s上限，不能发送时unconfirmed。临时operation/外部artifact没有持久远端恢复保证。

新增43 distinct PASS：adapter27（其中真实SDK1.30.1统计计算/临时公开resource；原Scheduler finalizing/timeout permit两项受影响PASS。fixture改正确stateful生命周期后原22PASS，最终5项新边界与原取消受影响共6项PASS，非新变化旧已过项未继续机械重跑。Jest默认sandbox tmpdir EPERM与初次错误runner路径MODULE_NOT_FOUND保留为环境/命令失败，不当产品通过；

真实fixture只绑定loopback、计算公开合成文字和读取临时公开文件；全部服务/worker/临时材料正常finally关闭清理，无音频播放、新模型/业务服务调用或用户数据外发。远程MCP/OAuth/SSE/Apps、M4实际provider/双域quality-cost、M5模型语义/风格/音质/长期收益仍pending，不声明完整M6或任务完成。继续S31固定A2A协议与独立S33本地元数据/离线consumer；S32实际UI与S34训练后端仍需真实证据，不merge/deploy或改main。

### 2026-10-13 用户换设备：S31/S33 WIP停稳保存

用户明确要求交接提示词及隐私文件打包。source WIP `dc2b2c2b9b986618ec580b263c03bd29835dcaff` 已commit/push/ls-remote一致、工作区干净；main3ee1332ef干净未改。

不冒称真实协议出口通过。新A2aService/SessionPublicWork/12消费者tests及MCP复用静态4文件PASS，实际消费者12/MCP14均未跑。原contracts strict a2a配置已写、root ESLint PASS但针对性测试未写/跑；公共a2a_protocol kind、Scheduler native_a2a_投影和认证HTTP入口尚缺。

S33 source三文件包含exportLearning、strict metadata轨迹/真实文件分析函数与tests；root最终ESLint PASS。两次Jest启动EPERM无测试执行，未执行的审批请求被中断；

唯一HANDOFF按用户要求重建，记录上述缺口与恢复次序。隐私迁移只打包当前四配置、原最小滚动quota和README阶段摘要；不恢复旧备份/raw账本/cache，不打印凭据，不在Git保存隐私archive。carry148不重加/不清零，素材producer/judge/诊断外发暂停、夜间不播放、无merge/deploy/main修改保持。

### 2026-10-13 续接 S31–S34 与真实出口补齐（进行中）

恢复实际 source `dc2b2c2b9` / docs `920a73c9c`，main `3ee1332ef`；source 初始干净，docs 无关未跟踪 Experience 草稿保留。沿当前用户“持续推进到任务结束”接续；用户换设备快照已消费，后续进度只写本 Record，不刷新阶段 HANDOFF。S31、S33 并行补齐，S32 复用原 frontend compiler/bridge，S34 选择原 Prompt optimizer 后端；具体修改和最终 tested commit 在本节后续追加。

按现有 Governance §8/§13.1 和当前任务授权恢复必要的公开合成模型测试；不把该历史推断当新增审批条件。原始失败和当时未执行事实保持。仅使用当前连接与原 private-test-run 限流/临时清理，不新增费用/正文账本、不重置 carry148。

S23 原 `s23-live.mjs --live` 当前实际 1 请求 HTTP200：typed prediction、公开 support refs、原 Host/Task/RunControl 费用与不发布均 PASS。返回 totalTokens **1272**（provider 子项 input694/output130 与总数不相等，按原报告保留，不伪造 token 对账），knownAttempts1/unknown0/localJobs6；Session revision/World/Clock/Memory/Timeline/outbox/Task results 不变，旧成本保留。临时材料 finally 清理，仅此元数据结果保存。该有限真实 provider 出口不等于 M4 双域质量—成本收益、真实 outcome 或置信度校准。

交接前真实loopback失败本轮未复现，旧失败不抹去。最终结果待本节后续。

S33 当前38新增/增强 distinct PASS（trajectory22、CLI16），原认证 HTTP 新2/受影响旧2 PASS，FS/SQLite双域实际导出与冷CLI已执行。

#### S31–S34 工程提交与独立审查

工程 source `40ce8f8d33f449783a8e5e5a2fc5a82d993f670a` 已 commit/push，ls-remote一致。main未改。

S31 最终本组 **138 distinct PASS**（上述93 + 新secret相关10 + 原GenerationCore35）。独立真实loopback复现A2A text/嵌套JSON/task ID回显密钥；修复复用原Generation的containsSecret，在原localWork结算前拒绝整个响应，禁止identity和公开artifact进入后续消费者，并保留已发生失败费用。MCP同一修复通过真实SDK text/JSON/resource回显案例；旧loopback失败当前31全套含真实HTTP通过，未倒改历史原因。

S32 **24新增/65受影响 distinct PASS**；原Source Index `.a2ui.json`→正式compiler→原Native v3 IR/安装/Bridge/runtime。固定官方A2UI v0.9.1消息/原v0_9 catalog身份，公开Text/Column/Button及作者另行声明event→binding。root实际读取最终390截图，确认公开备注与失败状态、无溢出。截图只作临时QA，不提交。初次局部CSS无法覆盖子组件按钮，按既有global styles机制修正后QA；一次lint brace修正通过。online AG-UI/A2UI stream、远端action envelope回发、MCP Apps/OAuth未冒称完成。

S33 **42 distinct PASS**（38学习/CLI + HTTP新2旧2）；CLI冷进程无服务启动，文件上限/UTF8/目录/错误脱敏、同源family切分与不可撤回限制已验。

S34 **14新增/4原Prompt生命周期 distinct PASS**。独立审查复现普通Job被dedup冒认学习Job，已改精确pin冲突且双存储复现回归通过；HTTP实际queued后在提炼前本地停止、fetch0/费用0/失败状态持久化，不把此测试算真实模型出口。原candidate/evaluator/人审publish/rollback及source失效权威保持；测试里的合成评价不声明质量提升。所有归属工程文件targeted ESLint已执行通过。

S34真实首轮另有2HTTP200：RP提炼length失败total4111，Project提炼total1355后隔离评价路由拒绝；尚未作为通过，继续诊断与补测。M4/S27实际有限对照也继续推进，不以工程提交暂停任务。

没有绕过，保留公开npm依赖；目录含SDK1.30.1、不含私有测试正文或凭据，不在Git。

#### 后续实际对照与评价修复

S24 `tests/agent-intelligence/m4-live.js --local` 双域实际对照 PASS：Session两臂原authority transaction均committed且同一公开时间目标达标，直接方案2处公开改动、比较方案1处，并由正式receipt取得exactMatch；两臂同源/同配置，比较额外localJobs分别2/3，provider请求0。固定比较器本就最小化改动，预先声明的宽改动baseline不是独立Agent决策，不声明模型/一般高影响决策或时延收益。过程CPU/壁钟仅观察，非所有原authority工作均有localWork细项。失败summary保留已发生正式receipt与原成本。

S34真实Project隔离评价失败定位到Studio已改用准确 `/api/native/generation/skill-work`，原isolated adapter未接该入口。真实冻结worker沿原Route预算。新增2项及原Project来源3项、原production project-prompt worker1项共6 distinct PASS，相关静态通过。后续实际复测费用和结果另记，不覆盖首轮5466tokens。

保留截图目录且未换工具绕过；同上述SDK均不在Git，也不含私有模型正文或凭据。

S34修复后真实pilot已完成并释放quota：RP11 HTTP200/47875tokens，Project10 HTTP200/36609tokens，共21/84484；连首次2请求失败累计23 HTTP200/89950tokens。每域原host_evaluator各1个development pair；RP player_agency delta0、Project intent_completion delta0，模型偏好均tie。human均null、Job awaiting_review、eligible=false、未发布且有效base保持。全部API费用已知，unknownAttempts0，货币价和上游retry未知。真实live只证明原Skill-work通道实际执行。临时材料finally清理。

用户随后说明将提供向量模型，并允许需要时暂停等待。当前仅发现聊天连接配置，真实rerank后端尚未确认；尚未向服务发起模型列表/能力探测。不创建新HANDOFF，不把外部证据缺失宣称任务整体完成。

上述在途S27现正常结束：3HTTP200，共6703tokens（旧路径1988、ExpressionPlan2252、blind judge2463），unknown0，原localJobs共15。双臂同原foundation Prompt/问题，公开plan/未声明旧路径、零发送preview、state不变和费用保留均PASS。表达组7维模型观察全部true；旧路径公开来源/传闻/私密隔离/玩家自主/中文通过，actorVoice与communicativeIntentAppropriate未通过。只作为一个合成配对样本的模型观察，不宣称统计质量提升或人工偏好；未播放声音。脚本syntax/ESLint PASS，临时正文已清理。

随后用户已提供新的Embedding与rerank连接，恢复任务。配置只保存本机Git外私有目录，不在此记录endpoint/key。未新建限流或费用账本。S25先沿原主模型，S26随后沿所给向量/重排模型串行推进。

source `c5447144afff7a3585e9f51628f5c6a22f97a0fb` 已提交推送并ls-remote一致（11文件）。main仍未变化。

S25有限真实对照完成：同一已安装Package、公开路线约束、原Narrator Prompt/model/budget，fast原executeTurn；slow先原lifecycle background Task→declared app writer→completed outbox，再由原projection将建议实际发送给同Narrator。两臂5/5预定事实/文本底线通过，实际正式Turn receipt已验，fast保持pending outbox且无后台发送。3次HTTP200 stop，总5343tokens：fast1886tokens/1attempt/5localJobs/约9927ms，slow3457/2/10/约17542ms。差额+1请求/+1571tokens/+5localJobs/+7615ms，qualityGain=false；未发现额外slow收益，默认fast不变。没有unknown费用或failed localWork。本地fixture契约修复在API前完成，未产生失败请求。

继续只补该连接，不把500预载视为500实际生成，不扩展未选研究池或重跑已过恢复矩阵。

S26真实对照完成：8实际请求/12751tokens，模型unknown0；3rerank各345tokens，Embedding61，3正文3147/3264/3450，judge1794。紧fixed重排完成后原正文budget_exhausted且零发送；紧reserve拒绝可选重排并保留全部合法来源，正文通过。充分fixed为3609tokens、充分reserve3795（+186），不宣称成本改善；三份实际正文5维模型观察均通过。37localJobs含12unknown，原退休账localUnknownJobs投影漏报经独立审查修正，未清零未知成本。原World/认知/WorldClock不变，正式Turn仅正常publication logicalTime+1及Timeline发表。原Embedding adapter3个输入返回768维有效向量、61tokens/约10.33s，仅可用性证据。货币价/上游retry未知。

S26四臂零发送preflight及8次本地loopback通路通过；最终syntax/ESLint通过；live后只加强local fake server异常清理，未重跑已过模型。真实私有临时目录正常清理；

用户随后明确账户额度将尽，要求不再派发子代理、等待现有任务完成后及时暂停并准备交接。根立即停止新派发，只有已经开始的S21连续场景run安全收尾；交接快照将按本次用户明确要求建立。

S21新增连续场景最终PASS：6真实正式executeTurn均applied并有authorityReceipt/Task capture completed，每轮相同invocation重放不再发送。第3回合FS manualSave/exportSnapshot→SQLite importSave，timeline/cognition及18645tokens/15jobs精确保留，后3回合继续原提交。HTTP200共7，正文4497/6556/7592/7743/8388/8985=43761tokens，独立整体观察3723，共47484；模型unknown0，distinct localJobs35（source15已包含于restored30，不重复相加）。六段各7维观察及restoredContinuity全true。只证明作者事件沿原writer推进的6回合场景：传闻澄清、未完成→正式归还、light记忆模糊、公开边界/玩家自主/声音/恢复连续性，不称500实际生成、自主appraisal或一般长期收益。local全链、syntax/ESLint通过，未弱化产品契约。

root再次实查shared quota lock不存在。source最终 `f4815c7277adc02d36860f45dcf12f43f64453e2` 已commit/push/ls-remote一致，含S25 a5c42f537及S26/S21脚本，工作区干净。main3ee1332ef干净未改，用户要求的暂停优先于原集成流程。新HANDOFF仅因本次用户明确要求建立；实际请求本轮共45/163503tokens，历史失败和未知成本边界保持。私有新增向量连接仅在原Git外目录，无凭据进Git；无关Experience草稿未动。

2026-10-13 用户明确要求将上述5个公开测试临时目录移入回收站。未永久删除或清空回收站。交接清理状态已同步，任务继续保持暂停。

### 2026-10-13 基本完成补齐（进行中）

用户指出若干阶段只有有限实现，随后明确要求继续推进到基本完成、再合并与推送。原上一节完成的是有限代码集成/清理，不能代表完整企划；本轮从实际 main `f4815c727` 创建 `feat/agent-runtime-completion`，仍沿同一 Task ID/Record。未创建子代理/Goal/HANDOFF。main/docs初始干净，fetch未出现新远端提交，其它工作树与私有资料保持。

协议补齐开发中：MCP增加保存配置HTTPS、增量SSE/GET cursor恢复；A2A增加HTTPS并将获准任务身份接入原RunControl bank，冷恢复设计不自动重发。正确Node runner55PASS/1原SDK可选skip，新增5项Jest PASS（实际HTTP SSE/恢复、session/每次网络hook、UTF8分片/关闭、大小/截断/错id）。

#### 基本版协议、恢复与在线 UI（source `877564dfa`）

补齐保存配置的 HTTPS MCP/A2A，HTTP 只保留字面 loopback；MCP接受JSON/SSE，增量UTF8/CRLF/有界读取，响应id精确匹配；通知只作数据，server request仍拒绝。断流仅使用原cursor的GET恢复，不重发POST；每个恢复请求走原publicWork/RunControl费用与freshness，session header、retry/取消/timeout和失效保持。不声称取得第三方业务服务证据。

7天默认有界保留，冷Engine+新Scheduler恢复仅显示interrupted并允许显式GetTask/CancelTask；保留已发生费用，不把remote完成当本地Goal/World完成；原portable continuation schema接受有界外部证据，跨scope仍由exact引用拒绝。

S32解析器迁入shared，原compiler兼容导入；Host运行实例消费真实JSONL Body，支持有界component替换与公开data子路径；staged DOM更新、保留焦点/最后有效视图，epoch/revision/取消/关闭拒晚到更新。点击只走原Bridge，成功后可由Host回传标准v0.9.1 action envelope，公开context不读Native/private状态。没有自动取得remote endpoint或脚本/目录权限。

新增protocol6PASS（含真实SSE恢复/证书TLS）、原MCP consumer14PASS、A2A原19+新增FS/SQLite冷恢复2共21PASS；S32原24PASS、新stream4PASS。source已本地提交，main未改，继续表达/计算/学习闭环，不将本checkpoint当任务结束。

#### 基本版表达、规则计算与日常使用入口（source `507ece8f7`）

新增本地eSpeak NG provider及平台选择，公开文字经stdin、实际voice枚举与exact voiceId、超时/取消等待close、有界WAV及临时清理。当前CachyOS在用户级隔离缓存构建eSpeak NG 1.52.0并提供用户级命令，未改系统软件包数据库、未提交二进制/机器路径；发行使用已安装CLI或服务端环境配置。真实中文WAV首个诊断127854bytes/2898.19ms，非零PCM/22050Hz/16bit/mono；

原SpeechService新增只返回公开Timeline引用的describe；Play消息在作者ExpressionPlan/Disclosure存在时提供选声/生成/原AssetStore音频控件/停止；生成后不自动播放，同Actor沿用户选声复用；陈旧revision、取消和退出清除音频并保留正文。

S26可选留额从rerank推广至作者明确配置的model_task及Native background，缺roles兼容原rerank规则；必要narrator不能列为可选。拒绝准入不消耗模型请求/不丢合法checkpoint，准备CPU仍保留。原GenerationError/Core现在只透传统一白名单预算代码，不暴露raw原因；evaluator source pin补原RunControl、compute budget、execution utils直接依赖，旧报告失效。学习后端仍走原双Prompt target/current trajectory/独立评价/review/publish/rollback，不新增权重训练或无审阅晋升。

新增原SessionPublicWork的公开服务清单与已获A2A引用投影，capture复用相同可用性判定；Context-only/private/失效来源不列入可发送项。Runtime诊断提供公开内容/所选MCP工具资源或A2A技能调用、结果文字、安全重新查询/取消以及从原bank恢复任务引用；连接/路由编辑器可配置MCP/A2A、明确工具/资源/技能与认证、本地工作额度、required reserve和可选角色。协议连接可无SecretRef，模型连接仍要求原Secret；选择Secret认证而未绑定Secret在capture前拒绝。协议连接从普通模型选项排除。输出为非正式外部数据，保持原World/Goal/认知权限。

S26原10、新schema1及双writer2、原S23 7与新增已知/unknown留额2逐项通过；新model admission有零发送及随后必要请求实际消费。学习/隔离Skill-work/Project异步/原HTTP reserve相关4suites20PASS；evaluator identity最终5PASS。未因此跑全仓build/test/lint。

真实Chromium1280/390链路最终通过：实际WAV解码（headless静音）、无自动播放、播放/停止、Actor选声复用、旧revision清除；真实MCP统计、A2A新任务/原bank引用重新查询/取消、结果不执行HTML，外网0。另390连接/路由编辑器通过原认证API保存无认证MCP并精确保存可选计算/外部服务策略。原S32桌面/窄屏在线更新/原Bridge/焦点与降级已通过，后续stream替换隐藏/恢复controls新增1项PASS。SSE最后固定原initialize session、接受空event-id取消resume及有界retry，相关最终protocol6/schema29共35PASS。

失败保持：镜像403/404/timeout后改用上游源码本地依赖构建；不把这些失败隐藏或当模型收益。最后源码字节以 `507ece8f7` 为准；本轮API模型请求为0、原unknown费用/不利结果保持，无新增配额/子代理/Goal/HANDOFF。

#### 最终基本版集成与交付

source最终 `73c7913b22daae98b6348fad0f3eee1cfce1f080` 包含上述两工程提交与英/中文产品配置指南；共3提交、53文件、1544增/274删。main已push与origin/main一致，不等待Actions/PR，不部署。docs同一Record/Plan更新后同步；本轮临时分支/worktree按已集成状态清理，保留其它活跃任务、长期工作空间与私有资料。

本轮完成的是基本产品闭环；原S34两域tie/未晋升、S25额外成本无质量收益、S26充分预算无成本改善继续保持；

交付清理已实际完成：main `73c7913b2` 与origin/main精确一致且干净；本轮source只有两个ignored依赖软链接，只unlink链接后正常移除worktree/空任务目录并用 `git branch -d` 删除已合入本地分支。该临时分支本轮未单独push，远端无需删除；其它活跃task、docs/package/plugin/skills和原私有资料保留。没有阶段HANDOFF或部署。
