# Live HANDOFF — Agent Intelligence Runtime

## Task

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`。
- Current product branch / HEAD: `feat/agent-intelligence-runtime@0a41023ef6689b8b80ca64ffdd5cda72838897fe`；已 push，与 origin 同 HEAD；工作树干净。
- Stable main / baseline: `main@ed1fd90521a63363e29856601abbf5e908c99d10`；本轮 fetch 后与 origin/main 一致，没有合并本任务。
- Auxiliary documentation: `docs`；S01 start docs HEAD `924ca4369dd3cb8405664eaa51e4574638987a4c`；当前 docs HEAD 以包含本 HANDOFF / Record 的实际提交为准。
- Current stage: **D0 / D1 / D2 / S01 完成；本轮停止；下一正式阶段 S02 尚未执行**。
- Plan entrypoint: [plans/architecture/agent-intelligence-runtime/index.md](plans/architecture/agent-intelligence-runtime/index.md)。
- S02-required modules: index → [decisions](plans/architecture/agent-intelligence-runtime/decisions.md) → [m1-evolution](plans/architecture/agent-intelligence-runtime/m1-evolution.md) / [delivery 的 S02](plans/architecture/agent-intelligence-runtime/delivery.md) → [baseline](plans/architecture/agent-intelligence-runtime/baseline.md) 的来源 / authority 接入 → Record；先细化最小来源契约，只复核相关代码。
- S01 contract / consumer reference: [s01-baseline](plans/architecture/agent-intelligence-runtime/s01-baseline.md)；产品分支 `tests/agent-intelligence/{cases,report,runner,adapters,budget}.js` 和 README。
- Record: [records/refactor/agent-intelligence-runtime.md](records/refactor/agent-intelligence-runtime.md)。

## Completed

- D0 / D1 / D2 的调研、双入口成长边界、局部自动默认与语义 / 计算 / routing 设计保持；未重新做全量研究。
- S01 新增九个 test-only 文件：12 个虚构固定 cases、开发 / 独立晋升 split、fixture / input / rubric hash 与 revision、可执行双入口 scripted runner、strict Trial / Report v1 consumer、预算 / 缺失状态、独立 measurement sidecar v1、52 项新增 tests 和运行说明。
- RP 实际调用 Director Engine / Runtime / takeover；检查玩家 ownership、实际 request 的 fixture 可见承诺修订、取消 / stale completion / variant 关联。生产 Memory resolver 与自由文本应用未验证，明确 completeness / not_run。
- Project 实际调用 Studio Agent model loop、既有 generation / tool clients、隔离 bridge 与 ProjectAgentService / StudioService authority；真实 validation / Review、明确 fixture reviewer commit、重复 commit 拒绝、human revision conflict 与 repair 上限 / 修复成功。
- 隔离临时目录 / 相邻无关虚构 Project 前后 hash、foreign ownership、cleanup 根目录 / marker、拒绝模型 commit 与外部网络；采集失败保留全部 trials / incomplete，报告不静默丢弃。
- product commit / push 完成；main 未变化，M1 完整交付后再集成。

## Pending

- 下一轮仅 **S02**：来源 / 引用 / 有效性最小契约、双域 source adapter 与首批 EvidenceSet / Evaluation consumer，复用现有 result / artifact / storage authority；进入前局部细化实际 schema / 生命周期，不能把整套远期字段提前注册。
- S01 真实模型基线仍缺明确有限 pilot / exact generation 配置与 standalone existing-generation bridge。model command 保留六 trial slots；无有限参数为 budget_blocked，有预算但无 bridge 为 unavailable；`empiricalReady=false`。
- 补测位置是当前产品分支 `tests/agent-intelligence/README.md` 的 Model pilot and budget。沿现有 RP / Studio 请求 preview/count + reservation + response observation 接线，再跑 RP agency / Project authoring 各三次 development trials；独立 promotion 基线 S06 比较前补齐。不得用 scripted success 绕过 S06 / S10 实证门槛。
- S03 / S04 补可靠捕获 / durable task；S05 retention、S06 / S10 费用与晋升阈值按阶段细化。S02–S34 / G01–G06 均未实施。

## Key decisions

RP / Project 并重；三类候选；逐角色 / Project 开启局部自动，新建默认审阅；共享 owner 有限预算；M1 完成交付后集成 main。用户已确认，勿重问。
S01 是 test-only，不新增生产资源、迁移、模型执行器、RunControl authority、自动发布或 cognition。PilotBudget 为验证过的测试 reservation ledger，未安装生产 policy。
报告区分结构 / authority / Review / final text、行为 grader、usage 与缺失；未知不能当零值，scripted 零外部调用不能当真实模型低成本证据。测量 callIndex 不是 upstream attempt。
D2 六 Plane / Context / Compute / Routing 的唯一详细权威保持；研究数字、alias / gateway 字符串不成为实测能力。

## Validation

- 本地新增 2 suites / **52 tests passed**；既有 8 related suites / **79 tests passed**，分组执行，共 131 tests；实际命令 / 文件见 Record。
- Committed baseline Tested HEAD: `0a41023ef6689b8b80ca64ffdd5cda72838897fe`。CLI scripted runner → report JSON → strict consumer / sidecar 校验成功：**12 executed trials、24 scripted generation calls、36 tool calls、44 deterministic checks passed / 0 failed**。
- 14 behavior dimensions 均 not_run；12 usage missing；external provider calls=0；empiricalReady=false。model readiness CLI → consumer 通过：6 slots 全 budget_blocked / 0 executed / 0 external calls。
- 产品 staged diff check 通过；生成报告仅本地临时产物，未提交。docs 只做最小结构 / 链接 / diff 与记录一致性检查；本阶段所有验证均本地执行。
- 未执行构建、浏览器、Android / 真机、真实模型 / model judge、gateway probe；未手工发起远程 CI，不把任何未执行检查称为通过。
- main AGENTS 与 docs README / WEB Adapter / 两模板已有 dirty diff 保留；其它工作树 Experience 草稿未读写。具体 push 与 docs 最终 HEAD 核对真实 Git。

## Next target / Read first

核对实际 Git（main、工作分支、docs、dirty）→ 本 HANDOFF → Plan index → decisions / m1-evolution / delivery S02 / baseline 相关部分 → 同一 Record。
沿用 `feat/agent-intelligence-runtime`，不重新从 main 建重复分支。只执行 S02，完成本地最小验证、commit / push、同一 Record / live HANDOFF 后停止；不自动进入 S03，不合并 main。

## Do not repeat

- 不重做全量研究或 D2；不扫描全部 Plans / Records / Skills；不读写未授权 reference。
- 不覆盖 main AGENTS、docs 治理 / 模板 dirty、其它工作树 Experience 草稿；不创建第二份 Record / live HANDOFF。
- 不重复执行 S01 scripted 并当成新阶段模型效果；consumer / cases 可直接作为后续来源契约的测试基础。
- 不把 fixture privacy 过滤、mock generation、field reservation、预算 ledger 或 readiness report 当真实 production 能力。
- 不因局部预算参数存在而默认发现 Secret、选择付费 route、调用模型、改 connection / privacy、production shadow 或安装 local model。

## New-chat bootstrap prompt

执行 Atria `agent-intelligence-runtime` 的 S02。先核对真实 Git，再读 `docs:HANDOFF.md` → Plan index → decisions / m1-evolution / delivery S02 / baseline 来源与 authority 相关部分 → 同一 Record。D0 / D1 / D2 / S01 完成；工作分支 `feat/agent-intelligence-runtime@0a41023ef6689b8b80ca64ffdd5cda72838897fe` 已 push，main 保持 `ed1fd90521a63363e29856601abbf5e908c99d10`，不要重建分支。S01 test-only 已交付 12 cases、双入口 runner、strict v1 consumer / sidecar、有限预算与缺失状态；52 新增 / 79 既有 tests 通过，44 deterministic checks passed。真实模型与行为评分未执行，empiricalReady=false，S06 / S10 前补齐真实证据。沿用现有 result / artifact / storage / authority，先局部细化最小 source / reference / validity 契约，仅实施 S02；保护既有 dirty 与 Experience 草稿，不提前做 S03 或 G 阶段。阶段结束仅本地最小相关验证、push、更新同一 Record / HANDOFF 后停止，不合并 main。
