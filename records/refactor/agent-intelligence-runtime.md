# Agent Intelligence Runtime — Record

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`
- Status: **Active**
- Plan: [正式架构与阶段入口](../../plans/architecture/agent-intelligence-runtime/index.md)
- Updated: 2026-10-06

## Summary

用户要求根据远端 Frontier Agent RP 研究重新核对最新 main，按全面调研、讨论、确定方案、正式执行的顺序长期推进。
本轮完成架构调研与分阶段讨论稿。用户确认 RP 与 Project Agent 并重，首批先完成双入口成长闭环，并包含有预算与回滚约束的局部自动启用。
D1 已冻结 M1 产品边界；D2 综合三份新增研究。S01 已完成 test-only 双入口基线；S02 已完成生产只读来源 adapter / EvidenceSet / Evaluation consumer 与本地最小验证。产品工作分支为 `feat/agent-intelligence-runtime@072a15d8d5b51117d0c5442e48e345475a274b66`，已 push，main 未变化。无真实模型效果结论，下一正式阶段为 S03，尚未执行。

## D0 — 最新 main 核对与架构调研

- Start / End / Tested product HEAD: `ed1fd90521a63363e29856601abbf5e908c99d10`
- Source docs HEAD: `2e57f83b19d2321260be93f98dbbf5321f4b0b84`
- Product branch: `main`，两次 fetch 后与 `origin/main` 一致，工作树干净。
- Auxiliary docs branch: `feat/agent-intelligence-plan`，从上述 docs HEAD 创建；本阶段文档对应包含本记录的提交。
- Status: **本轮调研完成；进入 D1 讨论**。

### Completed

- 读取指定远端研究、最新 Repository Governance，并按当前任务定位代码与测试。
- 审计 Runtime / Orchestrator、RP 与 Project 入口、Task Artifact、Session / Studio、Information / Memory、Goal 接入 substrate、Skill / Prompt / Preset、Simulation 和表达扩展路径。
- 核对一手研究与官方协议资料；在 research 模块注明摘要、正文部分、作者结果与工程推论的边界。
- 建立 Plan Bundle，覆盖原研究主题，列出 7 个交付组、34 个候选阶段及实际 consumer / 验收条件；D1 增补 M1 具体讨论模块后共七模块。
- 保留既有 docs 工作树中未提交的 Experience 草稿；未修改、暂存或提交该目录。

### Key findings

- 当前已有结构化 result、可信 Native Task Artifact 和 durable lifecycle intent，优先做来源 adapter 与消费者，不另建执行 / authority 系统。
- RP 有恢复 checkpoint 与消息锚定 snapshot，但完整可靠学习轨迹仍缺关联；Project 任务服务的状态目前在进程 Map 中，需要单独持久化与恢复。
- Actor 已有精确身份、profile 和 belief / perspective 投影；完整 BDI、appraisal、emotion / relationship、ToM 与因果变化尚未闭环。
- Skill 候选、Prompt 精确资源和审阅流程可以复用；仍须补真实证据、隔离评价、所有读取入口的精确版本、生效与撤回。
- 角色的错误 belief 可以是合法认知状态；它不成为 World Truth。自由文本知识违规的模型审计与确定性权限检查分别验收。

### Validation / CI

- Node 24.18.0 headless probe：退出码 0。实际验证 allowed tool → task-only handoff → JSON final、checkpoint / projection 内容边界、未授权工具不执行、请求期间失效 memory 阻断后续工具、structured / provenance result。
- 探针复用 `tests/agent-runtime/fakes.js`；无服务器、真实模型或用户数据。它不证明磁盘恢复、浏览器行为或模型效果。
- 核对 baseline 所列 20 个 targeted test 文件均存在；该检查不代表测试执行。
- 未安装测试依赖。`tests/node_modules/jest/bin/jest.js` 不存在；未执行 Jest、构建、浏览器、Android / 真机或 CI。
- 文档结构检查通过：9 个本轮文档、20 个内部链接、S01–S34 连续且无重复，代码围栏配对；未发现机器专属路径。`git diff --cached --check` 通过；没有产品变更。

### Known limitations

- 论文未复现；多个来源只核对摘要，GEPA HTML 正文抓取失败，具体层级见 research。
- 首批产品范围与分组集成已确认；数据 schema、迁移、具体自动化权限、两种真实案例、资源预算和首阶段执行设计仍需收敛。
- Provider / 协议 / 训练可用性在相应阶段重新核对；空接口或 mock 不作为能力完成。

### Next checkpoint

D1：沿已确认的 M1 范围与局部自动启用设计，收敛 scope / 权限、双场景验收、预算和首阶段执行方案；技术方案确定后才进入 S01。

## D1 — 讨论与首批方案冻结

- Start docs HEAD: `1676b21e19a0bbf97ff57caeb5f520801cf8eb00`。
- End / inspected product HEAD: `ed1fd90521a63363e29856601abbf5e908c99d10`；本轮 fetch 后仍与 origin/main 一致。
- End docs HEAD: 包含本阶段记录的提交。
- Status: **Complete — M1 boundary frozen / S01 Ready**。
- Confirmed: RP 与 Project Agent 并重；首批 Skill / Prompt / 编排参数成长闭环包含有预算 / 回滚约束的局部自动启用；M1 完整交付后合并 main，再从最新 main 推进下一组，各正式阶段仍停止。
- Latest user choice: 按角色 / Project 单独开启局部自动，并设置统一预算；新建对象默认审阅。来自本轮“按你推荐的来”，不重复询问。
- Frozen: [M1 设计](../../plans/architecture/agent-intelligence-runtime/m1-evolution.md) 的 scope、预算必需性、精确版本生效、publish / recovery / rollback 约束；[S01 执行设计](../../plans/architecture/agent-intelligence-runtime/s01-baseline.md) 的 12 个案例蓝图、报告、有限 pilot、验证与退出条件。
- Engineering detail: 默认值以外的 case / report 字段为本轮工程细化；没有声称用户逐字段批准。
- Deferred: S02 资源 / source 契约，S05 retention，S06 / S10 的真实费用和晋升门槛在对应阶段前定稿。缺少参数或证据时不允许自动发布。
- Decision authority: [decisions.md](../../plans/architecture/agent-intelligence-runtime/decisions.md)。
- Validation: 复核 RP Director、Project model loop / authority、测试临时存储入口及当前 lockfile；本阶段仅修改 docs，未执行新的产品测试或真实模型请求。文档结构检查通过：10 文件、24 个内部链接、34 阶段连续、12 个唯一 S01 case ID 且六个 promotion；无机器专属路径、围栏配对。`git diff --cached --check` 通过。
- Compatibility: S01 是 test-only cases / report / runner，无产品数据迁移；保护已有未提交 Experience 草稿。
- Next checkpoint: **S01**。重新核对 main，创建本组短期产品分支，执行 s01-baseline；阶段结束更新同一 Record / live HANDOFF 并停止，不合并 main。
- Implementation: 尚未开始；本阶段不表示 S02–S34 的所有技术细则 Approved。

## D2 — 三份研究综合更新正式企划

- Request: 先拉取远端 → 读现有 Agent Intelligence Runtime Plan → 读三份研究 → 综合更新正式架构企划；每阶段 / 完成只在本地执行最小相关验证。
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

### Evidence / validation

- 只读核对相关 Generation / Route / Context / Capability / provider / discovery / Native Host / RunControl / TaskScheduler / request inspector；事实见 baseline §9。
- 在线复核必要的一手 Provider / Gateway / routing 资料，仅作设计证据；层级与局限见 research §5。没有 provider probe、论文复现或网关服务执行。
- 本地文档结构检查通过：13 个任务文档、45 个内部链接；围栏配对、表格列数一致、无机器专属路径；40 个唯一阶段且依赖无环，M1 不依赖新增 G 阶段，保留 12 个 S01 case / 6 个 promotion。`git diff --check` 通过；提交前再检查 staged diff。
- 文档实现 / 集成 Tested HEAD: `6bf7a9ee7`；docs fast-forward 后同一 13 文件 / 45 链接 / 40 阶段检查与 `git diff --check` 再次通过。集成前后原 docs dirty diff 逐字节一致。
- 持久化：上述文档 commit 已 push 短期分支并 fast-forward docs；本完成记录提交后 push origin/docs、删除本轮临时 worktree / 分支，最终 HEAD 以实际 refs 为准。未创建 / 合并产品实现分支。
- 无产品测试、构建、浏览器、Android / 真机或 CI；无实际模型调用。

### Protection / limitations / next checkpoint

- main 的 AGENTS.md 与原 docs 工作树 README / WEB Adapter / 两模板既有 dirty changes 原样保留，未暂存 / 提交；未修改任何 reference 或其它资产工作空间。
- 不覆盖其它工作树的 Experience 草稿，不建立第二份 Record / live HANDOFF。D0 / D1 历史保持。
- 新架构仍需各阶段 schema / 迁移 / provider 支持矩阵与真实质量—成本数据；研究中的统计数字不形成 Atria SLO。
- 本轮文档持久化并集成 / push docs 后停止；下一正式阶段仅 **S01**。实施、局部验证、push、更新同一 Record / HANDOFF 后停止，不合并 main。

## S01 — 双入口基线与 Eval cases

- Request: 读取 live HANDOFF，仅执行 S01；每阶段 / 完成只在本地执行最小相关验证，记录后停止。
- Start / stable main HEAD: `ed1fd90521a63363e29856601abbf5e908c99d10`；fetch origin/main / docs 后确认未变化。
- Start docs HEAD: `924ca4369dd3cb8405664eaa51e4574638987a4c`。
- Product branch / End HEAD: `feat/agent-intelligence-runtime@0a41023ef6689b8b80ca64ffdd5cda72838897fe`；已 push，origin 同 HEAD。
- End docs HEAD: 包含本阶段记录 / live HANDOFF 的实际提交；只暂存本任务文件并 push origin/docs。
- Status: **Complete — S01 structural/scripted baseline；empiricalReady=false**。允许进入 S02；S06 / S10 前真实证据仍是必需 checkpoint。

### Completed / implementation

- 新增 `feat/agent-intelligence-runtime:tests/agent-intelligence/` 九个 test-only 文件：12 个 Case v1（六 development / 六 promotion）、fixture / input / rubric / 环境 hash、case-set revision、双入口 runner、严格 Trial / Report consumer、有限 pilot ledger、测量 sidecar v1、两份针对性测试与运行说明。
- Cases 为虚构固定输入；promotion 与 development 内容不同，extraction consumer 拒绝 promotion。case / report / sidecar 未知 schema、revision 漂移、未知 / 重复 refs、mixed modes / adapter / HEAD / repeated-case config 均拒绝。
- RP 实际走 `runMainAgentLoop` → 当前 Director Engine / AgentRuntime → per-run tools → message takeover。检查玩家消息不改、实际请求含可见承诺修订且无 fixture private clue、取消 v1 后再生成 v2、旧 completion / handle 不能写新 variant。没有把 fixture 的 history 过滤当生产 Memory resolver 验证；本轮应用的自由文本行为未评分。
- Project 实际走 `runNativeStudioAgentTask` → existing generation / studio clients → 隔离 fetch bridge → `ProjectAgentService` / `StudioService`。model 阶段停在 Review；fixture reviewer 单独 commit。正常 authoring 单一 changeset、重复 commit 拒绝；human revision 冲突保留 human 内容和 pinned base；真实 validation 错误分别达到 repair limit / 修复后 Review。
- 复用 `makeTempFsEngine`；每个 Project 的相邻无关虚构 Project 前后树 hash 一致，服务仅获得临时目录、bridge 拒绝未识别请求 / model commit、验证 foreign task owner。RP 比较玩家内容 hash。清理只操作已核对根目录 / marker；恢复 fetch / Atria / presentation evidence。没有读取生产对象、聊天、Secret 或 reference。
- execution / final text / authority / Review、deterministic checks、behavior grading、usage 与 completeness 分开；缺失保留分母，未知 usage 不伪装为零 tokens。采集错误保留 failed/incomplete trial，不静默丢弃；serializer / IO 错误明确失败。
- `PilotBudget` test-only ledger 验证有限 maxRequests / maxTotalTokens、input count + reserved output、six ordinary calls per trial、共享 36 / 含独立 judge 最多 42 上限、retry / fallback / grader 同额、未知 / cancelled usage 保留 reservation、重复 request / settlement 拒绝。scripted transport 在请求前限制六次；未安装生产 RunControl policy。
- 可选 sidecar 只记录 scripted 请求顺序 / 入口 / foreground，绑定 report hash / trialId；callIndex 不冒充 upstream attempt。target、真实 upstream、root / child / attempt、TTFT、token subdivisions、价格逐项 missing。没有修改 Package resolver、必要 guard 或生产 generation 决策。

### Actual baseline / minimal local validation

- 最终代码内容：新增 2 个 Jest suites / **52 tests passed**；既有 8 个 relevant suites / **79 tests passed**。合计 10 suites / 131 tests，分两组执行；不是全量测试。
- 新增：`tests/agent-intelligence/{baseline,runner-failure}.test.js`；覆盖错误 ownership、variant 混用、伪造 success / aggregate、usage 缺失、重复提交、stale revision、case drift、promotion split、有限预算、采集失败与 globals 恢复。
- 既有：`tests/orchestrator/director/{integration,abort,content-payload}.test.js`、`tests/agent-runtime/{kernel,durable-recovery}.test.js`、`tests/native/{project-agent,project-agent-http}.test.js`、`tests/atria-shell/studio-agent-a8.test.js`。
- Jest 使用现有已安装的 repository / tests dependencies 和 `tests/jest.config.json`，没有安装 latest Jest、修改 lockfile 或绕开配置。新增 suite 最后一轮在提交前相同最终内容通过；提交后只运行报告所需的 baseline / consumer。
- **Committed / baseline Tested HEAD: `0a41023ef6689b8b80ca64ffdd5cda72838897fe`**。运行 `node tests/agent-intelligence/baseline.mjs --output <new-report> --measurements <new-sidecar>`，随后 `--validate <report> --measurements <sidecar>` 成功。临时产物在本机 out-of-tree 目录，未提交生成报告。
- scripted：**12 / 12 trials executed；24 scripted generation calls；36 tool calls；44 deterministic checks passed / 0 failed**。自由文本 behavior 14 个维度全部 `not_run`；12 trials usage missing / totalTokensStatus unavailable；external provider calls = **0**，不构成真实低成本证据；`empiricalReady=false`。
- model readiness command：`--mode model` 保留 **6** pilot slots，均 `executionStatus=budget_blocked` / `finite_pilot_missing`，0 executed / 0 external calls；consumer 校验成功。有限参数但无 configured bridge 的 `unavailable` 状态由 targeted test 实际验证。
- `git diff --cached --check` 通过，最终产品工作树干净，工作分支与 origin 同 HEAD。文档最小检查通过：5 个触及文件 / 30 个本地链接、围栏配对、阶段 / HEAD / 前序历史与路径检查；本任务 diff check 通过。没有手工发起远程 CI。
- 未执行构建、浏览器、Android / 真机、provider / gateway probe、真实模型或 model judge；UI / runtime schema / storage registry 未修改，无迁移。

### Findings / limitations / next checkpoint

- 本地首轮发现并修正：取消 completion 的 AbortError 应作为案例中的预期终态；既有 util config API 不能 unset null，专用测试进程初始无 config 时保留仓库 default；跨 VM 普通 JSON 对象须正确识别；采集失败 trial 也必须列出配置缺失。相关新增 tests 最终通过；8 个既有入口 suite 无相关失败。
- 这个环境没有明确有限 live pilot 与 configured standalone existing-generation bridge；model command 是 readiness report，不会因为只有预算参数而发送付费请求。runner 没有新建模型 executor，未发现 / 读取 Secret。补测入口和预算接线说明为 `feat/agent-intelligence-runtime:tests/agent-intelligence/README.md` 的 Model pilot and budget。
- 后续在现有 RP / Studio generation 请求边界连接 preview/count + reservation + response observation，明确有限 pilot / exact configuration，再补 RP agency / Project authoring 各三次 development trials；完整独立 promotion baseline 在 S06 比较前补齐。没有真实 evidence 不满足 S06 / S10 或 M1 完成条件。
- 当前不提供可靠 durable capture / Project task 恢复、自动 publication、Goal / cognition、精确 Skill history 或 G 阶段能力；缺口进入后续既有阶段，不在 S01 提前实现。
- main 的 AGENTS.md、docs 的 README / WEB Adapter / 两模板 dirty changes 原样保留（本轮前后 diff hash 相同），其它工作树 Experience 草稿未读写；未创建第二份 Record / HANDOFF。
- 下一正式阶段 **S02**：先复核 Git → HANDOFF → index / decisions → m1-evolution / delivery 的 S02 与来源 / 有效性相关 baseline → 本 Record；细化最小来源契约后实施，仅当前阶段结束停止。继续同一产品分支，不合并 main；M1 完整交付后再集成。

## S02 — 来源 / 引用 / 有效性最小契约

- Request: 读取 live HANDOFF，沿用现有任务分支，仅执行 S02；每阶段 / 完成只在本地执行最小相关验证，记录后停止。
- Start product HEAD: `0a41023ef6689b8b80ca64ffdd5cda72838897fe`；现有 product worktree 干净。
- Stable main HEAD: `ed1fd90521a63363e29856601abbf5e908c99d10`；fetch origin/main / docs / task branch 后确认 refs 一致，未集成本组。
- Start docs HEAD: `65f305ccf45d5500cd6a9d3aa7ded08ec45240dd`。
- Product branch / End / Tested HEAD: `feat/agent-intelligence-runtime@072a15d8d5b51117d0c5442e48e345475a274b66`；已 push，origin 同 HEAD。
- End docs HEAD: 包含本阶段 Record / HANDOFF 的实际提交；仅暂存本任务文档并 push origin/docs。
- Status: **Complete — S02 read-only source contract / consumer**。下一阶段 S03 未执行。

### Completed / implementation

- 局部细化 [s02-sources.md](../../plans/architecture/agent-intelligence-runtime/s02-sources.md)，冻结现有 source key / anchor、严格 EvidenceSet v1、Evaluation 来源有效性结果、error / budget、无迁移边界。同步 index / m1-evolution / delivery 的状态与读取路由；用户既有产品选择不变。
- 新增 `src/native/agent-intelligence/{contracts,source-adapters,evidence-service}.js`，通过原 `src/native/index.js` 导出可调用的 `AgentEvidenceService` / strict set validator / source error；测试 README 给出 Host 接入示例。
- RP adapter：普通 chat 从 authenticated handle 的 ChatRepo 重读，复用 Memory sourceMessageId / sourceContent，固定 floor / swipe / 内容 SHA-256，拒绝重复 ID、legacy 无 ID 和镜像 Native 消息；Native 从 SessionCore 当前 HEAD 读取 active timeline variant，绑定 packageVersion / branch / revision。Artifact 仅走原 readTaskArtifact 的 reusable context grant，保留 definition / dependency / scope epoch 检查，不消费 once / operation grant，不写 World。
- Project adapter：使用原 Studio revision 与 ProjectAgentService task，绑定 base / current revision、完整 task hash；仅返回 status / validation / Review / repair / 精简 changeset receipts。Review 不被解释为正式 commit；completed 核对 resultingRevision。human edit、task update、takeover、删除与重启 Map 缺失均不能当 current，consumer 不改 task 状态。
- EvidenceSet 只保存 selector / 派生 anchor / contentHash 与 canonical integrity；hash 不代替授权。evaluate 在读取前核对独立 owner / expected scope，重读原 authority 并重验整组；同 scope 在单快照内同步解析，最后检查与返回间无 await。失败保留每个 reference 的状态 / 分母，任一失败不返回整组正文。
- 有限 `maxSources` / UTF-8 JSON `maxBytes` / `maxScanMessages` 包含重验，无静默截断；unknown schema、额外 trusted/current/raw body 字段、duplicate selectors、伪 source / anchor / hash 拒绝。正文为显式 expand；source IO / corruption 明确 unavailable，缺失为 missing。

### Minimal local validation

- 最终相同代码内容执行 3 suites / **60 tests passed**：新增 `tests/agent-intelligence/sources.test.js` 的 **43 tests**；既有 `tests/native/task-artifact-consumption.test.js` 的 **13 tests**、`tests/native/project-agent.test.js` 的 **4 tests**。不是全量测试。
- 命令：`node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand tests/agent-intelligence/sources.test.js tests/native/task-artifact-consumption.test.js tests/native/project-agent.test.js`。复用已安装 dependencies，无 lockfile / 依赖安装。
- 真实临时 FS / SQLite ChatRepo 与 SessionCore：JSON transport、正文 / variant / floor 失效、删除、group identity、重复来源、owner / scope、预算、branch fork、原 Native variant integrity corruption；无生产对象读取。
- 真实临时 FS / Git Studio / ProjectAgentService：Review → formal commit、旧 ref 失效与新 receipt、human revision conflict、task plan 变更、takeover / restart、错误 project task、Project 删除、多 task 读中更新。Artifact adapter 使用明确 isolated authority fixture，实际调用原 readTaskArtifact；不冒称此 fixture 是持久生产捕获。
- `node_modules/.bin/eslint src/native/agent-intelligence/*.js src/native/index.js` 通过；product `git diff --cached --check` 通过。文档最小检查通过：6 个触及文件 / 35 个本地链接、围栏 / 表格 / HEAD / 前序阶段逐字保留 / dirty hash 一致性；staged diff check 通过。
- 首轮发现两处测试 API 假设错误（Studio 正式入口是 saveProjectSource；删除要求 expectedRevision），已沿原 authority 修正。复核改进多源一致性：统一 scope snapshot / 整组重验，并新增 Project task 在 revision await 间变更的测试；最终检查全部通过。
- 未执行 build、browser / UI、Android / 真机、真实模型 / judge、外部 MySQL / Postgres 或远程 CI；没有模型请求和 Secret 读取。

### Compatibility / limitations / next checkpoint

- S02 没有新持久 kind / path、registry 修改或数据迁移；EvidenceSet / Evaluation 是生产只读 API 返回值，没有自动 runtime subscriber、HTTP / UI surface。新持久 EvidenceRecord key / 迁移在 S03 接入公共存储时冻结，Project task durable recovery 在 S04；S05 retention 未实施。
- `maxBytes` 计已准备正文，即使失败后不返回；metadata-only 不返回正文。原 authority 全量 chat / Session IO 与 Artifact 自身 dependency scanner 沿既有实现，不宣称被该展开预算限制。Evaluation 的 current 是本次来源读取观察，不能当完整运行轨迹、行为评分或晋升授权。
- Studio getRevision 沿既有 authority 同步 human edit 的历史；本 consumer 没有新的 source / task mutation 路径。撤回仅移除新增调用 / exports，无存储转换；旧运行不变。
- S01 `empiricalReady=false` 与真实模型 / usage 缺失仍保持；S06 / S10 前补有限 live pilot / exact bridge 和独立 promotion baseline，不以本阶段来源测试代替真实效果证据。
- main AGENTS.md 与 docs README / WEB Adapter / 两模板既有 dirty diff hash 前后相同，均未暂存 / 提交；其它 worktree Experience 草稿未读写。未建第二份 Record / HANDOFF，未读取 reference。
- 下一正式阶段仅 **S03**：Git → HANDOFF → index / decisions → s02-sources / m1-evolution / delivery S03 / baseline RP 与存储接入 → 本 Record；细化可靠轨迹与公共持久层，沿原 result / storage authority 实施。继续同一任务分支，阶段记录后停止，不合并 main，不提前进入 S04。

## D3 — Reasoning Continuity 架构整合

- Request: 读取 `docs:plans/architecture/reasoning-continuity-research.md`，将已确认架构结论整合进当前企划；以既有正式术语消除重复，不整篇复制。仅本地最小相关验证。
- Start docs HEAD: `2b40f3b943ff1a4f6ef811ce2f842d34f2e3e427`；原 docs 从 `379f0d702` fast-forward 两个研究提交后读取，完整研究保留原样。
- Auxiliary docs branch: `feat/reasoning-continuity-plan`；从 docs 创建隔离工作树，集成目标为 docs，不合并到 main。
- Observed product HEAD: `feat/agent-intelligence-runtime@072a15d8d5b51117d0c5442e48e345475a274b66`；stable main `ed1fd90521a63363e29856601abbf5e908c99d10`。真实工作树有 S03 相关未提交代码 / docs 草稿，未读写、暂存、提交或验收；与本轮文档成果分开。
- End docs HEAD: 包含本 D3 记录的实际提交，集成 / push 后以真实 docs refs 为准。
- Status: **Complete — D3 plan integration only**；不是 S03 或 G 阶段实施完成。

### Completed / decisions

- 读取 live HANDOFF → index → 对应架构 / Context / Compute / Routing / delivery / decisions 与同一 Record，再纳入指定研究的架构结论；未重新全量调研或读取 reference。
- model-routing §7 是 Reasoning Continuity 的唯一详细权威：可选执行能力、原生 envelope / canonical message 分离、opaque handle、adapter 原样映射、exact path / 方向性兼容与既有 Capability Evidence。
- Runtime 沿 task / run / attempt / branch / revision / message variant 管理 continue / fork / reset / discard；edit、regenerate、restore、goal shift、prefix / tool / history 变化、fallback 均重验并记录 loss。
- 发出前 Snapshot 与响应 Observation 分开；opaque payload 留在受控 checkpoint，Experience 只消费获准决定 / loss / usage；Memory / Cognition / World Truth 与显式 Task Artifact 不共享其缓存或导出规则。
- Context 提供最终 binding 指纹，压缩 / append-only 不能绕过 freshness / exposure；Planner 与 Narrator 的连续目标 / 短 horizon、独立 Critic lineage 和同预算对照进入验收。
- Runtime contracts → OpenAI Responses reference → Anthropic native → Gemini native → gateway probes → adaptive / eval 映射既有 G01–G06，保持 40 个正式阶段和 M1 范围；未新增 Runtime / Routing / Eval authority。
- U10 / A10–A15 记录用户整合请求与工程归并；示例 schema、模型版本 / 路径矩阵、TTL / 阈值、默认启用与实测收益仍按阶段深化。研究数字 / gateway 声明不冒充 Atria 已测支持。

### Minimal local validation / protection

- 本地检查通过：9 个触及文档、59 个本地链接 / 9 个章节锚点；围栏配对、表格列数一致、40 个阶段身份 / 原依赖保持；研究与前序 Record 逐字节保留，6 个 docs / main 既有 dirty 文件 hash 一致；`git diff --check` / staged diff check 通过。
- 原 docs README / WEB Adapter / 两模板与未提交 s03-capture 草稿按文件 hash 核对原样保留；main AGENTS 同样保留。产品工作树存在外部进行中的改动，本轮没有执行任何产品 mutation 或验证，不声称其全树冻结。
- 无产品 tests、build、browser / UI、Android / 真机、远程 CI、provider / gateway probe、实际模型或 Secret 读取。本轮没有新增存储资源或迁移。
- 文档提交 / push / 集成 docs 后停止；原研究继续保存完整 Provider 资料，正式企划只保存归并后的规则与阶段路由。

### Next checkpoint

下一产品 checkpoint 仍为 **S03**；先核对实际 Git 和未提交工作，沿同一任务分支读取 HANDOFF → index / decisions → s02-sources / m1-evolution / delivery S03 / baseline RP 与 storage → 同一 Record，衔接已有工作，不覆盖或重复实现。S03 不承接 M8 opaque payload 保存；其新增能力在 G01–G06 局部细化 / 交付后才供后续阶段消费。阶段验证 / 持久化后更新同一 Record / HANDOFF 并停止，不提前 S04，不合并 main。

## Final state

长期任务仍在进行；D0 / D1 / D2 / D3 / S01 / S02 完成。产品已提交 / push HEAD 仍为 S02，main 未变化；S03 有未提交工作，未在本轮验收为正式交付。D3 只更新文档并完成本地最小验证、Record / HANDOFF 与 docs 持久化后停止。
