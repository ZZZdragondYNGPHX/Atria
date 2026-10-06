# Live HANDOFF — Agent Intelligence Runtime

## Task

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`。
- Current product branch / HEAD: `feat/agent-intelligence-runtime@072a15d8d5b51117d0c5442e48e345475a274b66`；已 push，与本地 origin ref 同 HEAD；实际工作树存在 S03 相关未提交改动，本轮不读写或验收，接续先核对 Git。
- Stable main / baseline: `main@ed1fd90521a63363e29856601abbf5e908c99d10`；S02 核对时与 origin/main 一致，没有合并本任务。
- Auxiliary documentation: `docs`；S02 start docs HEAD `65f305ccf45d5500cd6a9d3aa7ded08ec45240dd`；当前 docs HEAD 以包含本 HANDOFF / Record 的实际提交为准。
- Current stage: **D0 / D1 / D2 / D3 / S01 / S02 完成；本轮 D3 文档整合后停止；下一产品 checkpoint S03 尚未正式完成**。
- Plan entrypoint: [plans/architecture/agent-intelligence-runtime/index.md](plans/architecture/agent-intelligence-runtime/index.md)。
- S03-required modules: index → [decisions](plans/architecture/agent-intelligence-runtime/decisions.md) → [s02-sources](plans/architecture/agent-intelligence-runtime/s02-sources.md) / [m1-evolution](plans/architecture/agent-intelligence-runtime/m1-evolution.md) / [delivery 的 S03](plans/architecture/agent-intelligence-runtime/delivery.md) → [baseline](plans/architecture/agent-intelligence-runtime/baseline.md) 的 RP / authority / storage 接入 → Record；进入前细化可靠捕获与公共持久层，仅复核相关代码。
- S01 reference: [s01-baseline](plans/architecture/agent-intelligence-runtime/s01-baseline.md)；产品分支 `tests/agent-intelligence/` 的 cases / report / runner / adapters / budget 与 README。
- S02 product entrypoint: `src/native/agent-intelligence/{contracts,source-adapters,evidence-service}.js` → `src/native/index.js` 的 AgentEvidenceService export；`tests/agent-intelligence/sources.test.js` 与 README 接入示例。
- Record: [records/refactor/agent-intelligence-runtime.md](records/refactor/agent-intelligence-runtime.md)。

## Completed

- D3：指定 Reasoning Continuity 研究已整合到当前企划；唯一详细权威为 [model-routing §7](plans/architecture/agent-intelligence-runtime/model-routing.md#7-reasoning-continuity执行状态与生命周期)，architecture / behavior-context / compute-policy 引用，delivery 映射 G01–G06。研究原文保留；未实施代码或发起 probe。

- D0 / D1 / D2 的双入口成长、局部自动默认与语义 / 计算 / routing 设计保持；未重复全量研究。
- S01 test-only：12 cases、双入口 scripted runner、strict Trial / Report / measurement sidecar v1、有限 pilot ledger；结构 / authority / Review 与行为 / usage 分开。真实模型缺失，empiricalReady=false。
- S02：严格最小 EvidenceSet v1（owner / scope / exact source refs / hash）；生产只读 AgentEvidenceService capture / evaluate；Evaluation v1 逐源状态与有限展开预算。
- RP adapter 保留普通 chat / Native 分域：ChatRepo + 既有 Memory source identity / content；SessionCore 当前 HEAD 的 branch / revision / active variant；Task Artifact 仅走原 reusable context grant，依赖 / epoch 检查不变，不消费 operation artifact。
- Project adapter 复用 Studio revision / ProjectAgentService task；绑定完整 task hash、base / current revision，区分 Review 与 formal changeset receipt。human edit、takeover、删除、重启 Map 缺失均拒绝旧证据。
- 同 scope 单快照同步解析，再整组重验；owner / expected scope 独立核对；伪 source / anchor / hash、未知 schema、重复 identity、读中变更与预算不足均不能释放整组正文。
- 产品 commit / push 完成；main 未变化。S02 contract / Plan 状态、同一 Record / live HANDOFF 已刷新。

## Pending

- 接续产品仅 **S03**：先核对已有未提交代码与 docs 的 s03-capture 草稿；本轮没有读写其内容或完成验收。RP 可靠轨迹与持久证据，连接 run / child / effect / request / message variant 与 Native outcome；补 Director bridge trace 关联；先细化公共持久 schema / key / validation / migration / failure 处理，复用原 StorageEngine。
- S02 是可调用只读 consumer，没有自动 runtime subscriber、持久 evidence registry kind、HTTP / UI surface 或数据迁移；不计作 S03 可靠捕获或 S04 Project task 恢复。
- S04 Project durable task / recovery、S05 retention / feedback 删除、S06 / S10 比较 / 预算 / 晋升阈值按阶段细化。S03 尚未完成正式交付；S04–S34 / G01–G06 未实施。
- S01 真实模型基线仍缺明确有限 pilot / exact generation 配置与 standalone existing-generation bridge。model readiness 六 slots：无有限参数为 budget_blocked，有预算但无 bridge 为 unavailable；empiricalReady=false。
- 补测入口为 `tests/agent-intelligence/README.md` 的 Model pilot and budget。连接既有 RP / Studio 请求 preview/count + reservation + response observation，再跑 RP agency / Project authoring 各三次 development trials；独立 promotion baseline 在 S06 比较前补齐。不可用 scripted / 来源有效性测试代替真实效果门槛。

## Key decisions

D3 的 U10 / A10–A15 已记录；continuation 是可选执行状态，非 Memory / World / Experience payload，详细 lineage / 路径兼容 / loss 规则见 model-routing §7。原研究示例 schema / Provider 支持并未冻结；M1 既有范围和 S03 证据持久层不提前承担 M8 opaque checkpoint。

RP / Project 并重；Skill / Prompt / 现有编排参数三类候选；逐角色 / Project 开启局部自动，新建默认审阅；共享 owner 有限预算；M1 完整交付后集成 main。用户已确认，勿重问。
EvidenceSet 的 hash 只固定内容关系，不授予读取 / mutation / publication。Evaluation 的 current 是本次原 authority 读取观察，后续使用重验，不证明完整轨迹或行为收益。
展开预算为 UTF-8 JSON bytes / message scans；原 authority 全量 storage IO 与 Artifact dependency scanner 保持既有边界，不声称受该预算完全约束。Studio getRevision 可沿原 authority 同步 human edit 到历史。
未知 usage 不为零；scripted success 不是真实效果。D2 六 Plane / Context / Compute / Routing 的唯一详细权威保持，研究 / alias / gateway 名称不当成实测能力。

## Validation

- D3 仅本地文档检查：9 个触及文件、59 个本地链接 / 9 个 anchors、围栏 / 表格、40 阶段身份与原依赖、研究及前序 Record 保留、本任务 diff 均通过；未运行产品验证。原 docs / main 的既有 dirty 核对保留，产品有进行中的未提交工作，本轮不声明其工作树干净。

- S02 最终本地 **3 suites / 60 tests passed**：新增 sources.test.js 43 项；既有 task-artifact-consumption 13 项、project-agent 4 项。实际命令见 Record。
- 真实临时 FS / SQLite ChatRepo 与 Native Session；真实 FS / Git Studio Review / commit / human edit；明确 isolated Native Artifact authority fixture。无生产用户数据和模型请求。
- Committed / Tested product HEAD: `072a15d8d5b51117d0c5442e48e345475a274b66`。触及的生产文件 eslint 与 product staged diff check 通过；docs 仅本任务结构 / 本地链接 / 状态 / HEAD / staged diff 的最小检查。
- S01 历史保持：52 新增 / 79 既有 tests；scripted 12 trials、24 generation calls、36 tool calls、44 deterministic checks passed；行为 14 维 not_run，usage missing，external calls=0，empiricalReady=false。本阶段未重复该 runner。
- 未执行 build、browser / UI、Android / 真机、真实模型 / judge、外部 MySQL / Postgres 或远程 CI；不把未执行检查称为通过。
- main AGENTS 与 docs README / WEB Adapter / 两模板既有 dirty diff hash 原样保留；其它工作树 Experience 草稿未读写。最终 push / docs HEAD 核对真实 Git。

## Next target / Read first

核对真实 Git（main、同一 task branch、docs、dirty）→ 本 HANDOFF → index → decisions / s02-sources / m1-evolution / delivery S03 / baseline RP 与 storage 接入 → 同一 Record。
继续 `feat/agent-intelligence-runtime`，仅 S03；先衔接已有未提交代码 / 草稿，不覆盖或重复实现。细化并实施、本地最小验证、commit / push、更新同一 Record / HANDOFF 后停止；不自动进入 S04，不合并 main。

## Do not repeat

- 不重复全量研究或 D2 / D3；不扫描全部 Plans / Records / Skills，不读写未授权 reference。
- 不覆盖 main AGENTS、docs 治理 / 模板 dirty 或其它 worktree Experience 草稿；不建立第二份 Record / live HANDOFF。
- 不把 S02 API / metadata / hash 或 S01 scripted / budget ledger 当完整 production capture、模型效果或自动发布。
- 不从 client owner、raw model result、自述 success、旧历史 revision 或缓存 current 推断 authority；来源重验保持原写入权威与范围。
- 不因局部预算参数存在而发现 Secret、选择付费 route、调用模型、改 connection / privacy、production shadow 或安装 local model。

## New-chat bootstrap prompt

读取 `docs:HANDOFF.md`，沿用 `feat/agent-intelligence-runtime@072a15d8d5b51117d0c5442e48e345475a274b66`，仅执行 S03。先核对真实 Git → HANDOFF → index / decisions → s02-sources / m1-evolution / delivery S03 / baseline RP 与 storage 接入 → 同一 Record。D0 / D1 / D2 / D3 / S01 / S02 完成；main 保持 `ed1fd90521a63363e29856601abbf5e908c99d10`，不重建分支。S02 双域只读 adapter / EvidenceSet / Evaluation v1 已实现，60 项本地 tests 通过；尚无可靠 runtime 自动捕获、持久 evidence kind 或 Project durable task。S01 真实模型缺失、empiricalReady=false，S06 / S10 前必须补。D3 已将 Reasoning Continuity 归入 model-routing §7 与 G01–G06，不提前实现。真实工作树有 S03 相关未提交代码 / docs 草稿，先核对并衔接，不覆盖或重复实现。仅细化并实现 S03 可靠 RP 轨迹 / 公共持久层，复用原 result / artifact / storage / authority，保护既有 dirty 和 Experience 草稿；本地最小相关验证、push、更新同一 Record / HANDOFF 后停止，不提前 S04，不合并 main。
