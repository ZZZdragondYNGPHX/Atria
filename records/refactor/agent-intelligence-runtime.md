# Agent Intelligence Runtime — Record

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`
- Status: **Active**
- Plan: [正式架构与阶段入口](../../plans/architecture/agent-intelligence-runtime/index.md)
- Updated: 2026-10-06

## Summary

长期任务沿同一产品分支实施；D0–D4 / S01–S09 与 S10 工程交付完成。S10 将 S05 feedback / diagnosis、原六类局部 target、共享 finite budget、原 scheduler、隔离 evaluator、publication / recovery / rollback / next-run evidence 与双入口共享面板接为可用消费者。12 relevant suites / 233 distinct local tests 与真实 Chromium shared-pane fixture 通过。产品 HEAD `ed00f4f0cea53be360ed8dfa082bbd0afeec5398` 已 commit / push，main 仍 `ed1fd90521a63363e29856601abbf5e908c99d10`，未合并。
S06 真实执行与 model observations 保留，候选仍 ineligible；本轮无新真实模型请求。S10 的结构 / 假 provider 证据不证明稳定质量 / 成本收益；M1 的真实改善与集成前置条件待验收。本轮只续接 S10，下一只复核 M1 验收，不进入 S11 / G。

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

## S03 — RP 可靠轨迹与持久证据

- Request: 读取 live HANDOFF，沿用现有任务分支，仅执行 S03；每阶段及完成只做本地最小相关验证，记录后停止。
- Start product HEAD: `072a15d8d5b51117d0c5442e48e345475a274b66`；同一任务 worktree 初始干净。
- Stable main HEAD: `ed1fd90521a63363e29856601abbf5e908c99d10`；fetch 后本地 / origin 未变化，未合并本任务。
- Start docs HEAD: `379f0d70228491bd71220caa6e30424e4cfbfa60`；本轮期间并发 D3 文档整合后为 `ebdc6f6a5b50964247dd3db7a4e918ede53d711a`。核对更新并保留 D3 决策、研究和前序 Record；S03 记录基于该实际 docs HEAD 追加。 最终 push 前远端又新增 `aa4d2d2fe` 独立研究提交，仅核对提交路径后并入保留，未读取 / 修改其研究正文。
- Product branch / End / Tested HEAD: `feat/agent-intelligence-runtime@78acfb65da6b1afa1dee1c2f35482af215832c74`；已 push，origin 同 HEAD。
- End docs HEAD: 包含本 S03 Record / live HANDOFF 的实际提交；仅暂存本任务七个文档并 push docs。
- Status: **Complete — S03 bounded RP capture / shared durable evidence**；停止。下一正式阶段 S04，未开始。

### Completed / implementation

- [s03-capture.md](../../plans/architecture/agent-intelligence-runtime/s03-capture.md) 定稿 EvidenceRecord v1 / key / CAS / migration / failure / exact output 边界；同步 index / m1-evolution / delivery / s02-sources 路由。S02 来源与读取 authority 原样复用。
- `atri_agent_evidence` 使用 authenticated handle + scope/root hash，沿既有 StorageEngine / native_resources registry / repository 资源锁与 integrity CAS；marker 先于执行写入，sequence 单调，prefix 不可重写，重复相同 update 幂等。未知 schema / origin / 额外 trusted 字段 / corruption 拒绝。
- 共享 trace 限 512 events / 262144 bytes，只保留 run / child / effect / request / attempt / lane / 状态与直接可见 usage；容量、冲突、缺失、transport 失败明确记录。没有 Prompt、工具参数 / 结果全文、raw model payload、credentials 或 opaque continuation。
- 浏览器 runtime / first-party facade 观察器与 run presentation 分开；source target 在首次异步前冻结，周期保存前缀，旧 run late event 不写新 run。Director bridge 返回 metadata trace 与原 turn anchor。Director output 在原 chat save 后由 server 重新读取 exact message / floor / variant / source hash，独立 outputRef 不能借用 input；GENERATION_ENDED / bind 顺序竞态已覆盖。
- Native Host 在原 scheduler / provider send / fallback-retry / SessionCore finalization 接入：并发相同请求共享 capture，operationId/effect、原 invocation、独立 root、request / attempt 可归因；后台 / maintenance 与 lifecycle parent 保留。已存在 receipt 的幂等请求不重做执行；失败后新执行保留独立旧 marker。
- Turn outcome 绑定正式 receipt hash、branch / revision / active message variant；standalone task outcome 仅绑定原 receipt metadata，不展开 / 消费 operation artifact，不建立第二条 World authority。正式写入后的 capture 失败返回独立 failed 状态，保留 pending marker，不重放正式 effect。
- authenticated `POST /api/native/generation/evidence/{begin,update,inspect,delete}` 复用原 router / persistence；client 不能声明 owner / host outcome，source / output 必须服务端重验。inspect metadata-only，读中 current 不缓存为长期授权；删除走原资源 transaction。
- OpenAI-compatible / Anthropic / Gemini 的 stream / nonstream 保留 provider 直接报告的最终 usage。未报告为 missing；不将 subdivisions 求和、不推断缺失 total 或费用。浏览器 host_facade 与 Native provider_send 标记分开，不把 facade 重试当 upstream 完整尝试。

### Minimal local validation

- 累计 **8 relevant suites / 200 个不同 tests passed**，不是全量测试；最后变更只复核 capture 与 Native P3 两个 suite：**64 passed / 20 skipped**。新增 capture suite **24 tests**；新增真实 Native background / capture-failure cases 在 FS / SQLite 各执行一次。
- 八套命令：`node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand tests/agent-intelligence/capture.test.js tests/agent-intelligence/sources.test.js tests/native/task-runtime-p3.test.js tests/native/native-provider-matrix.test.js tests/agent-runtime/prepared-context.test.js tests/agent-runtime/kernel.test.js tests/orchestrator/director/integration.test.js tests/game-runtime/llm-orchestrator-narrative.test.js --testNamePattern='^(?!.*(?:MysqlEngine|PgEngine)).*$'`。该轮 194 passed / 20 skipped；随后新增六个 parser cases，capture suite 24 passed；最后相同最终内容复核 `capture.test.js task-runtime-p3.test.js`，64 passed / 20 skipped。合计 200 distinct tests，未把重复执行累加。
- 真实临时 FS / SQLite durable marker / reopen、CAS、owner / schema forgery、read-only / corruption、source deletion / regeneration、list / backup / restore、FS→SQLite→FS generic roundtrip。MySQL / PostgreSQL 仅 registry / generic key contract；不声称实际数据库验证。
- RP 使用实际 Runtime / first-party facade 与 Director bridge 的 isolated fixtures：retry / child / parent / effect / request / attempt、旧观察器隔离、transport 失败、已保存输出绑定与 save/bind 竞态。Native 使用实际 Host / scheduler / SessionCore 与本地 isolated HTTP / synthetic Response：正式 Turn、后台 task receipt、取消 / stale / interpreter failure、formal write 后注入 evidence storage failure 并重放原 receipt，无第二次 effect。三协议实际 parser stream / nonstream usage 已核对。
- 首次未过滤 native suite 尝试连接本机 MySQL / PostgreSQL，因服务不可用（127.0.0.1:53306 / :55432 ECONNREFUSED）失败；随后仅执行 FS / SQLite 与纯 contract cases，20 外部 DB cases 明确 skipped。没有将初次失败或未运行检查称为通过。
- 所有触及生产 JS 的本地 ESLint、product diff / staged diff check 通过。复用已安装依赖，无安装 / lockfile 改动。docs 本任务最小检查通过：7 个文档 / 48 个本地链接 / 4 个 anchors、围栏 / 表格、40 个正式阶段与原依赖、状态 / HEAD、前序 Record 逐字保留、dirty hash 与 staged diff。
- 未执行 build、真实浏览器 / UI、Android / 真机、远程 CI、真实模型 / judge / provider probe；只有本地隔离 fixture 请求，不读取生产数据或 Secret。没有行为收益结论；S01 empiricalReady=false 保持。

### Compatibility / limitations / next checkpoint

- Additive kind，无 backfill、无 SQL DDL / storage version 升级。复用既有 list / migration / backup / restore 和 deleteResource；FS 资源锁仅单 Host writer，不声称跨进程 CAS 原子。record owner 为 key，内嵌 S02 sources.owner 在跨账户恢复后仍须重新捕获。
- 中断留下的 capturing marker 可重启检查 incomplete，不自动恢复模型执行或 authority 写入。capsule-only / 其它未绑定正文模式、legacy 无 source ID 或未保存输出显式 incomplete；Director 完成只绑定同一已保存 variant。metadata captured 不证明完整 upstream retry、效果 / 费用达标或 publication 权限。scope 删除使 currentness 失效；lesson / feedback 级联与 retention 留待 S05。
- Project task durable state / recovery 未实施，仍由 S04 交付；Reasoning Continuity 不透明 payload 留在 M8 / G01–G06。M1 尚未完成，不合并 main、不删除本组任务分支。
- main AGENTS 与 docs README / WEB Adapter / 两模板既有 dirty 未暂存 / 提交；整理记录前后文件 hash 一致。其它工作树 Experience 草稿 / reference 未读写；无第二份 Record / HANDOFF。并发 D3 与前序 Record 逐字保留。
- 下一正式阶段仅 **S04**：Git → HANDOFF → index / decisions → s02-sources / s03-capture / m1-evolution / delivery S04 / baseline Project 与存储 → 本 Record；沿同一分支细化 Project task / attempts / timeline / recovery，复用 Studio authority / receipt。仅下一阶段用户明确续接后开始；本轮到 S03 记录 / push 停止。

## D4 — Execution Reuse / Cache Locality / Adaptive Invocation 企划整合

- Request: 读取指定 Execution Reuse 研究，整合已确认架构结论；参考 Reasoning Continuity，避免重复定义。每阶段及完成仅本地最小相关验证。
- Start docs HEAD: `1c2502dae8ac1bcb7a0bb1dfb1e18d9f01b984b8`；本轮开始时并发研究上传 / S03 文档整合使 refs 更新，按真实 Git 读取最新研究与 S03 状态，没有回退旧 HANDOFF。
- Source research commit: `aa4d2d2fe`；[Execution Reuse 报告](../../plans/architecture/execution-reuse-cache-locality-adaptive-invocation-research.md) 全文读取，[Reasoning Continuity 报告](../../plans/architecture/reasoning-continuity-research.md) 参考 cache / artifact / freshness 与归并边界；两份正文保留。
- Observed product HEAD: `feat/agent-intelligence-runtime@78acfb65da6b1afa1dee1c2f35482af215832c74`；stable main `ed1fd90521a63363e29856601abbf5e908c99d10`。本轮无产品代码修改。
- Auxiliary docs branch: `feat/execution-reuse-plan`；从上述 docs HEAD 建独立工作树，集成目标为 docs，保护原 docs 治理 / 模板 dirty；不将 main merge 进 docs。
- End docs HEAD: 包含本阶段记录 / live HANDOFF 的实际提交；commit / 集成 / push 后以真实 refs 为准。
- Status: **Complete — D4 plan integration only**；不是 S04 或 G 阶段实施完成。

### Completed / decisions

- 新增 [execution-reuse](../../plans/architecture/agent-intelligence-runtime/execution-reuse.md) 权威模块：Runtime 一级复用、storage 分离，Exact / Structural / Semantic 候选与 validity proof 分开；复用原 source / artifact / authority / grant / provenance，不建立平行状态系统。
- 契约对齐依赖、源域版本 / anchor、时间、权限 / Authority、purity / side effects、必要路径绑定与 Trust Domain；targeted invalidation 保留无关对象，缺可核验细粒度依赖时保守拒绝相关 revision 变化。
- Tool / Artifact 保留 once / operation 与 effect / receipt 幂等；Plan / Workflow 复用结构模板并重绑定当前参数 / preconditions，Narrative Intent 是前置可选 artifact 职责，Final RP Prose 默认 fresh generation。
- behavior-context §3.1 / §4 管理稳定 Segment / Resource identity、canonical serialization、受语义与权限约束的 cache-aware layout / schema 按需加载；不为命中添加无关 padding 或保留 stale Context。
- compute-policy §1.1 管理规则 Adaptive Invocation 阶梯，按未满足需求选择 reuse / tool / retrieval / target / effort / fresh narration；lookup / validation / classifier / cache / 获准 prewarm 与进度 hints 沿原 budget / scheduler。
- model-routing §8 管理 Application / Provider / Inference 三层 capability、exact-path cache evidence、hard constraints 后的 locality / 有效成本，以及 Snapshot 的请求决定与 Observation 的实际 hit / usage；estimated savings / unknown 有来源，不猜 gateway upstream。
- model-routing §7 Reasoning Continuity 详细规则原样保留；其它模块只引用 Execution Continuation 边界，未重复定义普通 cache handle / lineage。
- A–F 依次映射 G01 semantics、G02 context、G03 Tool / Artifact → Plan / Workflow、G04 原生路径验证、G05 / G06 invocation / eval，F Local KV / decode 在后续有限 PoC。40 个正式阶段及原依赖保留，M1 / 下一 S04 不增加新研究依赖。
- U11 / A16–A25 与研究覆盖 / 读取路由、同一 Record / live HANDOFF 已更新；研究字段、支持表 / benchmark、阈值与新增自动权限不当作逐项批准。

### Minimal local validation / protection

- 本地文档检查通过：11 个触及文档、108 个本地链接 / 29 个章节锚点、围栏 / 表格 / 无机器路径；40 个正式阶段及原依赖保持，D3 model-routing §7 与前序 D0–S03 Record 内容保留，两份研究逐字节保留，5 个原 docs / main dirty 文件 hash 一致。`git diff --check` / staged diff check 通过；验证记录与审阅修订仅复核受影响文档。
- 检查中修正一处章节链接锚点；阶段计数限定交付表，排除阅读集合中的阶段范围，确认没有新增 / 重编号正式阶段。
- 无产品 tests、build、browser / UI、Android / 真机、远程 CI、真实模型 / judge / probe / prewarm 或 Secret 读取；未重新浏览一手来源或复现论文。本轮无存储 kind / registry / migration，实现 / 效果状态不因文档更新提升。
- main AGENTS 与原 docs README / WEB Adapter / 两模板的既有 dirty 未暂存 / 提交；其它 Experience 草稿 / reference 未读写。只使用同一长期 Task ID / Record / live HANDOFF。

### Limitations / next checkpoint

API / Schema / key、容量 / TTL、完整依赖覆盖、semantic threshold、有限工具 / 模板 / Provider 矩阵、prewarm 默认与数字 SLO 待相应阶段细化。Cloud 字段与 Local backend / 算法需要精确路径 / 兼容 / 质量 / Trust Domain 验证；论文数字与 cache hit 不等于 Atria 收益，S01 empiricalReady=false 保持。
下一产品 checkpoint 仍为 **S04**：读取 HANDOFF → index / decisions → s02-sources / s03-capture / m1-evolution / delivery S04 / baseline Project / storage → 本 Record，继续同一产品分支，细化 Project task / attempts / timeline / recovery 与 Studio receipt 幂等。D4 / G / Local 能力不提前实施；仅下一轮明确续接后开始 S04，本轮文档持久化 / push 后停止，不合并 main。

## S04 — Project 持久任务与轨迹

- Request: 读取 `docs:HANDOFF.md`，仅续接 S04；每阶段及完成只执行本地最小相关验证，更新同一 Record / live HANDOFF 后停止。
- Start product HEAD: `78acfb65da6b1afa1dee1c2f35482af215832c74`；沿用 `feat/agent-intelligence-runtime`，初始 worktree 干净。
- Stable main HEAD: `ed1fd90521a63363e29856601abbf5e908c99d10`；本地 / origin 未变化，未合并本任务。
- Start docs HEAD: `119f5a720a69a1a86a46605cc6497d1221619aeb`；读取当前 HANDOFF / 相关 Plan / 同一 Record / 完整治理，保留 D0–D4 / S01–S03 历史与既有 dirty。
- Product commits: `ca0769e530decbdaf71227d3aca7573e4f4d5ea8` 持久任务 / receipt recovery；`172a0c281334c36c56273a24d19922ad4d5e5c35` 正式提交前的 receipt 容量检查。
- Product branch / End / Tested HEAD: `feat/agent-intelligence-runtime@172a0c281334c36c56273a24d19922ad4d5e5c35`；已 commit / push，origin 同 HEAD，产品 worktree 干净。
- End docs HEAD: 包含本 S04 Record / live HANDOFF 的实际提交；仅暂存本任务八个文档并 push docs。
- Status: **Complete — S04 durable Project task / attempts / conversation / receipt recovery**；停止。下一正式阶段 S05，未开始。

### Completed / implementation

- [s04-project-recovery.md](../../plans/architecture/agent-intelligence-runtime/s04-project-recovery.md) 定稿 schema / key / CAS、公开对话、Host attempts、容量、receipt / recovery / conflict、删除与兼容；同步 index / delivery / m1-evolution / s02-sources / s03-capture 路由。
- 原 ProjectAgentService 通过 ProjectTaskRepository 将 v1 task 写入新 additive `atri_project_agent_task`，key 为 authenticated handle + projectId + taskId。保存 plan / proposals / Workspace / inspection / validation / Preview / simulation / Review / changesets / timeline / attempts / conversation / commit intent；未知 schema、额外字段、identity / origin / Workspace mismatch、corruption 与旧 sequence / integrity CAS 拒绝。
- 读取 / mutation / context API 改为异步并沿同一资源锁排序，HTTP / generation context / S02 adapter 一并适配。跨 service 实例的内存快照只作末次同步 freshness 核验，持久 task 是 authority；原 Studio / Git 保持唯一 Project source 写入 authority。
- evaluation / commit 在执行前持久 started marker。新客户端 generation attempt 标为 client_observation；实际 Generation Host 内部关联 requestId、最终 snapshot hash、可见 provider send / retry 和直接报告 usage，无客户端伪造 Host observation 入口。missing usage 为 null，不推断缺失 total / 费用；observation 保存失败返回独立 capture failed，不重发 generation。
- generation 的完整公开 conversation 按前缀保存；system / providerState / opaque state / 未知私有字段拒绝。reload 使用公开 tool observation 文本与当前 task plan / proposals / validation 恢复模型上下文，live loop 保留原 providerState。unfinished round 保留完整旧前缀与已保存 proposals；tool call identity + args hash 防止重复 mutation，Continue 必须显式触发。
- commit intent 固定 exact Workspace hash 与 Host 生成 changeSetId；Studio 正式 Git commit message 同时保存 base / validation / Workspace hash receipt，no-op 也保留正式 commit。builtin / system Git 可读取完整 commit / parents；resultingRevision 固定正式 receipt OID，不被紧随其后的 human edit 替换。
- receipt 查询最多 200 条原 Studio 历史，唯一匹配 / Workspace / base / parent / validation 校验后才 reconcile completed。正式写入后 task 保存失败或响应丢失、并发 / 重复 Commit 都返回同一正式结果，无第二次 apply；Git 已提交后异常不 restore 旧 source。缺 receipt 且 base 未变回 Review，base 变化或证据不明确转 conflict，不自动 rebase / replay。
- 单 task 限 2 MiB JSON、1024 events、128 attempts / messages；超限明确失败。收尾发现 receipt 增大后的容量边界，补 Studio 正式 Git 写入前的完整 completed / recovery record 校验；容量不足恢复 dry-run source，保留 Review，没有正式 receipt。中断 evaluation 转 repair / blocked，失效 Preview 不当作重开的会话。
- 原 panel 恢复 conversation / Review / recovery 说明；Commit 响应或 task 保存失败后重读 authority，completed 时刷新 Project 一次，回调错误不重复 Commit。task HTTP 路由 no-store；显式 task 删除、Project HTTP 删除及原 deleteUser / dump / restore 路径保持 owner / scope 隔离。read-only 禁止 mutation / recovery 写入，允许只读检查恢复状态。

### Minimal local validation

- 累计 **9 relevant suites / 165 个不同 tests passed**；分组计数为 recovery **33**、sources **43**、Project authority **4**、Project HTTP **4**、panel **7**、Studio **8**、Git **8**、bundled authoring skills **7**、baseline **51**。重复执行不累加，不是全量测试。
- 九个 suite：`tests/agent-intelligence/{project-recovery,sources,baseline}.test.js`、`tests/native/{project-agent,project-agent-http,studio-service,bundled-authoring-skills}.test.js`、`tests/atria-shell/studio-agent-a8.test.js`、`tests/git-client.test.js`。执行入口沿 README 的本地 Jest 命令；最后容量修改只复核 recovery / Studio / Project 三套 **45 passed**：`node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand tests/agent-intelligence/project-recovery.test.js tests/native/studio-service.test.js tests/native/project-agent.test.js`。
- 真实临时 FS / SQLite 物理 close / reopen，Review / completed / attempts / conversation、CAS / unknown schema / corruption、owner / Project 隔离、read-only、删除、backup / restore 与 FS→SQLite→FS generic roundtrip；MySQL / PostgreSQL 只验证 generic kind / key 注册，没有连接外部 DB。
- 使用实际 Studio 与 builtin / system Git，覆盖 no-op receipt、过期 base、并发 Commit、marker 写失败、正式写入后 task 保存 / response 故障、人类后续修改、不可验证 receipt、提交前容量拒绝与 source 恢复。实际 Generation Host 使用本地 synthetic provider response，核验 send / retry / 直接 usage；capture failure 不重发。HTTP 与浏览器 runner 均为本地隔离 fixture。
- 实际 Chromium 命令 `node tests/frontend/project-agent-recovery.smoke.mjs` 通过，最后容量修改后再次通过：隔离 SQLite / Git / HTTP fixture 加真实 panel，桌面 reload 恢复 conversation / Review；注入 completed save failure 后恢复 receipt 并刷新 Project 一次；移动端 completed / conflict 状态无溢出、无 page error。**1 Commit / 0 generations**。这是相关 panel 验收，没有全应用 / Android / 真机结论；截图只留临时目录。
- 触及的 11 个生产 JS 本地 ESLint 通过；最后两处服务修改再做 ESLint、product diff / staged diff check。首轮相关测试暴露 async fixture / 输入字段、persist 后 attempt 引用、旧 conflict / baseline fixture 兼容问题，均修正并定向复核；容量用例先定位到过早越界的 fixture，改为有效的 near-capacity Review 后通过。复用已安装依赖，无 install / lockfile 变更。
- docs 本任务八个文档 / 70 个本地链接、1 个触及文档 anchor 检查通过，7 个未变的其它模块 anchors 保留；围栏 / 表格、40 个正式阶段与原依赖、HEAD / 当前状态、前序 Record 逐字保留、五个既有 dirty hash、diff / staged paths 检查通过。未为验证重读远期模块或研究，未扫描全部 Plans / Records / Skills，未读写 reference 或其它 Experience 草稿。
- 未执行 build、全量测试、Android / 真机、真实模型 / judge / provider probe 或远程 CI。S01 scripted baseline 继续 12 trials / 24 generation calls / 36 tool calls / 44 deterministic checks，empiricalReady=false；本阶段不证明模型质量、真实费用收益或 publication 能力。

### Compatibility / limitations / next checkpoint

- Additive kind，无 SQL DDL / storage version 升级、无历史 task backfill。旧 Map task 无法凭空恢复，legacy generation 请求没有 Host attempt 关联；旧 opaque continuation 不持久化。task / conversation 只支持技术容量边界，S05 再交付 retention / feedback / lesson 撤回与级联。
- FS 排序只覆盖单 Host writer；Project Git 与 task storage 不声称整体事务。receipt 恢复受当前 Git 历史 200 条与唯一完整 proof 限制；缺证据保守 Review / conflict。completed 历史可检查，human edit 后 S02 currentness 继续失效；missing Project 不释放 task evidence。
- main AGENTS 与 docs README / WEB Adapter / 两模板既有 dirty 未暂存 / 提交，hash 保持。未合并 main，不删除本组 task branch，不提前实施 S05 / G 阶段、reuse / cache / invocation 或 Local backend。
- 下一正式阶段仅 **S05**：真实 Git → HANDOFF → index / decisions → m1-evolution / s02-sources / s03-capture / s04-project-recovery / delivery S05 / baseline storage 与相关 source authority → 本 Record；沿同一分支先细化 feedback 分层、作用域、纠正 / 删除 / 导出、retention 与 source invalidation，再实现。本轮到 S04 文档持久化 / push 停止。

## S05 — 反馈、诊断与作用域生命周期

- Request: 读取 `docs:HANDOFF.md`，仅续接 S05；每阶段及完成只执行本地最小相关验证。
- Start product HEAD: `172a0c281334c36c56273a24d19922ad4d5e5c35`，同一 `feat/agent-intelligence-runtime` worktree 干净。
- Start docs HEAD: `a2cf80b1d418d895e2c0ee9565128ab661dba65a`；按当前 HANDOFF / index / decisions / M1 / S02–S04 / delivery S05 / baseline 相关 authority 与本 Record 续接，治理以 docs 已提交 README 为准。
- Stable main: `ed1fd90521a63363e29856601abbf5e908c99d10`，本地 / origin 保持；main AGENTS 与 docs 四个治理 / 模板 dirty 保留。
- Product commit / End / Tested HEAD: `caf662842941d3261dc1840242278f5529db10af`，已 push，origin 同 HEAD，产品 worktree 干净。
- End docs HEAD: 以包含本 S05 Record / live HANDOFF 的实际 docs 提交为准；仅暂存本任务九个文档。
- Status: **Complete — S05 scoped feedback / diagnosis lifecycle**；下一正式阶段 S06 未开始，不合并 main。

### Completed / engineering decisions

- 新增 [s05-feedback.md](../../plans/architecture/agent-intelligence-runtime/s05-feedback.md) 冻结 schema / key、subject / provenance、兼容、容量、reflection gate、retention / failure / delete / export；同步现有入口和 S02–S04 生命周期引用。这里的数值与 API 是本阶段工程细化，不伪称用户逐字段选择。
- 原 StorageEngine additive `atri_agent_experience`，key 为 authenticated handle + SHA-256(scope, Host subject)；v1 ledger、sequence / integrity CAS、同 Host 资源锁。每 ledger 512 KiB / 256 feedback / 64 diagnoses，超限明确拒绝；无 DDL、存储版本升级或 backfill。
- Host `target` consumer 直接从原 EvidenceRecord / Project task 返回 exact hash、subject 与 current observation，提交后继续重验；不复制正文、trace、公开 conversation、Workspace、private reasoning 或 provider state。单角色 chat 使用 charDir；group 用 exact message identity，不能凭显示名聚合角色；Native 从仍有效的 timeline actor / receipt entryPoint 解析，过期 Native 来源拒绝新建；Project 绑定 Project identity。
- 显式 correction / prefer / avoid 标为 user；regenerate / edit / abandon / accept / review_reject 标为 client_observation，empty note、不推断偏好；technical 只允许 Host 从保存的 validation / changeset / Native outcome 解析，unknown 明确保留，相同 exact source 去重。没有客户端提交 Host 结论的入口。
- diagnosis 是有限公开 user_hypothesis，保存 rationale / conditions / counterexamples / direction 与 exact feedback revision / hash。显式或 failure 事件可就绪；弱观察至少三个不同 execution source 才聚合，仍不证明独立质量样本、弱观察单独不能定向改进。同 batch diagnosis 去重，无模型请求 / 后台循环；未来调度与预算仍归现有 scheduler / authority。
- authenticated `/api/native/generation/experience/*` 是 RP / Project 共用实际 HTTP consumer，no-store。所有 mutation 需 expectedSequence；correct 固定 source、递增 feedback revision，相关 diagnosis stale；withdraw 停止消费；delete 物理清除相关 diagnosis 内容。diagnosis 也可独立撤回 / 删除，export 仅返回有限公开 note / metadata / applicability。
- inspect / export / reflection / diagnose 每次重验原 source。来源不存在时物理清除反馈与诊断；hash / variant / branch / revision / owner 变化时标 stale，writable 保存后即使恢复旧内容也不会复活。暂时 unavailable 阻止消费但不永久推断来源失效；read-only 用过滤 view、不持久写入。未被观察到的瞬时 source 变化不能从 metadata 推断出来。
- feedback / diagnosis 默认 30 天，可选 1–365 天；缩短收紧既有期限，延长不复活，writable reconcile / purge 清理、read-only 立即过滤。显式 `purgeSources` 按 scope / 1–365 天 / 每批 1–128 项清理旧 evidence 与 terminal completed / cancelled / taken_over tasks；expectedIntegrity 防止并发 source 更新被删除；active / Review / pending commit、Project source / 正式 Git receipt 保留。
- evidence / task 原删除路径先清 feedback / diagnosis；Project task 清理删除该 Project ledger。FS 无跨资源整体事务，清理失败阻止 evidence / task 删除；Project HTTP 原 authority 删除先完成，后续清理失败由 missing-source 消费收敛。没有 app-closed timer，source retention 是显式 sweep；native kind 列表 IO 不声称被删除 batch limit 限制。

### Minimal local validation

- **5 relevant suites / 137 个不同 tests passed**：新增 feedback **33**，capture **24**，project-recovery **33**，sources **43**，project-agent-http **4**；重复执行不累加。
- 相关命令：`node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand tests/agent-intelligence/feedback.test.js tests/agent-intelligence/capture.test.js tests/agent-intelligence/project-recovery.test.js tests/agent-intelligence/sources.test.js tests/native/project-agent-http.test.js`。组合首轮的后四套通过，feedback 新增 source-retention fixture 两例因 Studio 规范化字段断言失败；改为比较真实清理前 / 后快照，之后只定向复核 feedback 最终 **33 passed**。初版测试误用不存在的 storage injection exports 在执行案例前失败，改用既有 initStorage；不计作通过。
- 真实临时 FS / SQLite physical close / reopen、CAS / 并发 mutation、corruption / unknown schema / capacity、read-only / expiry、纠正 / 撤回 / 删除 / 独立 diagnosis 撤回、source deletion cleanup failure、variant / 内容 edit 后不可复活、dump / restore、FS→SQLite→FS generic roundtrip 与 MySQL / Pg kind / key 注册；没有连接外部 DB。
- 双入口实际 HTTP target / submit / export、认证、owner 字段拒绝、no-store / 409 / read-only 503；Project 用实际 Studio / ProjectAgentService / Git，验证原 validation outcome、task 删除 / Project 清理、人类 revision 失效、terminal task 清理不改 Project source，Review 被保留。Native actor / branch / failure feedback 使用 synthetic snapshot port 验证 source adapter 与 Host consumer，不能当完整真实 Session 端到端；复核的既有 sources / recovery suites 保留其真实 authority fixtures。
- Source sweep 注入新 evidence update 后旧 integrity 删除被拒绝并报告 conflict；后续显式 sweep 才清理。Reflection 单 regenerate、同 source 重复、不同 execution source 聚合、弱证据 direction 拒绝与 exact batch 去重均通过，modelCalls=0。
- 7 个触及生产 JS 与新测试的本地 ESLint、product diff / staged diff check 通过；README 补实际 API / targeted run / 证据界限。复用已安装依赖，无安装 / lockfile / 用户数据 / Secret 读取。
- 文档最小检查通过：九个任务文档 / 82 个本地链接 / 8 个 anchors，围栏 / 表格、40 阶段原依赖、S05 HEAD / S06 路由、前序 Record 逐字保留、五个 dirty hash 与 diff / staged paths。首版 anchor checker 未去除中文标点，修正 checker 后既有链接通过，未改写原章节。没有重读远期研究或 reference。
- 无 UI 代码变化，未执行 browser / 全应用 / build / Android / 真机 / 远程 CI / 真实模型 / judge / probe。S01 empiricalReady=false；这些结构 / 生命周期结果不证明模型收益、费用收益或 candidate publication。

### Limitations / next checkpoint

- FS 资源锁仅单 Host writer；未引入跨资源原子事务。原 authority / 存储列表可能全量 IO；retention 不在应用关闭时定时运行。新反馈 UI、AI diagnosis、隔离比较、候选 / report / promotion / 自动 mode 控制未提前交付；未来必须消费同一精确依赖与撤回规则。
- 删除 source / feedback 后未来消费者不得沿缓存 current 继续晋升；当前不存在 future lesson / candidate / report kinds，不预注册空资源。group subject 保守绑定单消息，Native stale source 不重新推断历史 actor；跨账户 restore 的 sources.owner 必须重新捕获。
- 下一正式阶段仅 **S06**：真实 Git → HANDOFF → index / decisions → s01-baseline / m1-evolution / s02-sources / s03-capture / s04-project-recovery / s05-feedback / delivery S06 / baseline 隔离与相关 authority → 本 Record；冻结双入口隔离执行 / 比较 envelope、独立 split、原 Workspace / Session 副本与确定性 outcome / usage 缺失路径。真实有限 pilot configuration / bridge 尚缺，不发现 Secret、不选择付费 route、不用 scripted 替代实测门槛。
- 本轮到 S05 commit / push、同一 Record / live HANDOFF 后停止；不开始 S06，不合并 main 或删除本组分支。

## S06 — 双入口隔离比较与有限真实模型接线

- Start product HEAD: `caf662842941d3261dc1840242278f5529db10af`。
- Start docs HEAD: `a6a40f62cf3ca7a9875674d48aeafa404ab4f2c2`。
- End / local tested implementation HEAD: `54c79cb8eea7d6ca5c7e5e4ff262fe0ca6666a64`；同一 `feat/agent-intelligence-runtime`，未合并 main。
- Actual tested HEAD: 最终六槽 pilot 为 `7d7708c1486c5b48b430eb2210e89768f4aabfb0`，完整 promotion comparison 为 `b5df610bdffd05d60ef3bc9bd6e62e7d9a164aa3`；grader 执行于 `7d7708c1486c5b48b430eb2210e89768f4aabfb0` 的实现，JudgeReport另 pin 实际源码 byte hash而无HEAD字段。初轮 dirty 实现报告分别 pin当时 HEAD / source bytes，不将未提交代码或后来HEAD混称实测身份。最终HEAD仅新增CLI / URL接线和相应本地回归。
- Status: **Complete — 隔离 evaluator / 真实基线与独立比较 checkpoint；候选晋升仍拒绝**。
- Plan: [S06](../../plans/architecture/agent-intelligence-runtime/s06-comparison.md)；Task ID / Primary Workspace 保持。

### Implementation / decisions

- `comparison.mjs` 是 test-only 本地 evaluator：原 12 cases / split，显式 split / 1–3 repeats，单一 synthetic RP Prompt / Project Skill / roundLimit target；baseline / candidate 各自私有 chat / Studio Workspace / Project task，不发布配置。原 per-run message editor、Director / Studio model loop、ProjectAgentService / StudioService / Git receipt 完整复用。
- Comparison v1 严格容量 / schema / coverage / refs / fixture / input / rubric / settings / source / request / outcome / summary 校验；pin 实际源码字节与 HEAD。每次 invocation / trial / request ID 独立，不共享可变状态；模型比较先持久化完整独立 baseline，随后跑 candidate。预算 / 执行失败保留所有槽位与缺失。
- Project 工具仅经 exact Project / task 的有限 GET / POST 接线；Commit / publication / foreign Project / DELETE / 网络和未知路径拒绝。fixture reviewer 只在模型 Review 后向临时副本 Commit / replay；无关 Project canary 前后 hash 相同。模型不获正式生产写入权。
- NativeSaveSystem exportSession、原已安装 Package exact archive、importSave 与 SessionCore 校验同 revision 的两个独立副本，candidate append / stale CAS 与来源 / baseline 不变。这是副本隔离验证，未接生产 Session generation replay。RP 生成使用原 Director 与 synthetic task context，fixture 可见历史不是 Memory resolver。
- 原 Native Prompt persistence / immutable library / resolver / compiler / HTTP provider 接用户明确测试 connection；Project 接原 NativeGenerationHost 与隔离 Studio task。RP 多轮去除 Director presentation / reasoning metadata，保留 public tool pairing；单条 tool 与完整 Studio loop 的原 Host 接线有本地回归。真实 Project 读取结果被误当 task、repair seed 使用错误 tool 字段、显式分段 Skill read 被过窄路由拒绝先暴露失败；修复后 read / bounded Skill read / write / reset / Review 完整原 Host 测试通过。
- `live.mjs` 明确读取 Git 外的私有 connection，输出 / progress / 独立 baseline 新文件；ledger exclusive writer lock 与原子持久化在 send 前生效。`EvaluationBudget` 全流程累计 model / retry / fallback / grader、每 trial 最多六次普通 sends；未知 / 取消 / failed usage 保留预留，restore 不重置、过量实报记账并封锁后续发送。
- 初始建议 120 / 250000 / output 1024，后用户明确 API hard cap 每日2000 / 20 RPM。显式 budget override 保留旧账、当前 finite guard 252 / 1000000、output1024；持久 rate checkpoint / 3.15秒 admission 间隔不超过20RPM。初轮 timeout 60 秒，获知首字慢后改为 300 秒，不重置已发送计数。不提交凭证、headers、原始 provider body、报告或本地配置；私有 key 仅 send boundary 读取。local tokenizer / context guard 不宣称 Gemini 精确能力。
- Blind pair human observation 有 exact artifact / envelope binding 与每 pair ≤3 judges；分歧 awaiting_review。未运行行为评分不填零或通过；单次 blind model judge 已实现严格 typed observation / confidence / score / 实际共享 grader charge；不改写原 S01 behavior slots，human preference / 多 judge 分歧仍未观测，promotion thresholds 未定稿，不赋予 publication eligibility。可用原 Director scripted graph，仅此；其它等价 ablations unavailable。

### Minimal local validation

- 当前累计最小相关验证：comparison 34、baseline 51、live-bridge 11、runner-failure 1、judge 4，共 **5 relevant suites / 101 distinct tests passed**；97-test 组合通过后，partial counter 修补只定向复核 live-bridge / judge 13 passed，不累加重复。用户纠正 URL 后增加 `/v1` / `/v1/` 两个参数化用例，最终仅定向 live-bridge / judge **15 passed**；首条校验命令使用不存在的 .js config未启动测试，随后使用原 .json config通过。新增 live tests 用 injected HTTP response 经过真实 compiler / provider / Host，不称真实模型质量通过。
- strict mutation / mixed source / same-arm refs / outcome / usage / summary / publication、低 roundLimit 真实失败、有限共享预算所有槽位、取消 / 迟到 completion、Session copy revision / CAS、Studio publication / Commit / foreign / method / network 拒绝、恢复 pending reservation / breach不能复位、真实 Host 完整 Studio loop 至 Review / fixture Commit。
- 初始 comparison 故障暴露取消等待卡住、undefined observation 与重复构建 Package archive hash 不同；修复取消 wait race、显式 null 和 exact installed archive 后仅做相关复核。真实 RP 第二轮暴露 Director metadata 被传入 Native renderer；public-message lowering 后已有真实多轮完成。
- scripted CLI 生成 / strict validate / model missing-config 保留槽位 / exclusive overwrite 拒绝；最终 live pilot / paired comparison / JudgeReport strict validate。触及 JS / mjs ESLint、product diff 通过；docs链接 / fence / 40阶段依赖 / 前序 Record / dirty hash 与 staged paths 在收尾检查。
- 没有生产 source / UI / schema / lockfile 变更，未执行 build、全量测试、browser、Android / 真机、远程 CI 或外部 DB。仅已授权测试 endpoint 有实际模型请求；未读写 reference 或其它 Experience 草稿。

### Real observations

测试模型为用户明确提供的 OpenAI-compatible `gemini-3.8-flash`；初期与完成运行使用完整 generation endpoint。后用户纠正为 `/v1` base，最后一个提交只补 evaluator 的一次拼接与两种 base 变体回归；历史模型报告不改写。Gemini final pilot / 完整比较 / judge 在最终实现上重新 strict validate通过，以下 hashes 为完整报告 canonical hashes，不是文件字节 hash。

| 保留报告（Git外 artifacts目录） | 实際 sends | tokens / 知识边界 | 执行观察 |
| --- | --- | --- | --- |
| `pilot.json` | 6 | 17650，预留上界 | 初轮60秒timeout / 接线失败，六槽失败，不补通过 |
| `pilot-slow-endpoint.json` | 8 | 18664，含未知预留 | 300秒等待，仅一个RP槽通过；其它接线 / transport失败 |
| `promotion-comparison.json` | 11 | 21285，partial / unknown保留 | 首轮比较暴露Project接线错误，全部12槽保留；不作候选合格证据 |
| `pilot-read-tools-fixed.json` | 16 | 44109，provider reported | RP三个 / Project一个通过，另两个Project受bounded Skill read接线限制；修复后重建明确运行 |
| `promotion-comparison-fixed.json` | 42 | 133569，reserved upper bound | 六对共12 trials execution / authority全部 passed，44 tools / 44 deterministic checks passed；取消旧variant仍保留usage预留 |
| `model-judgments.json` | 6 | 5629，provider reported | 5 observed / 1 invalid_response（rp_variant），不补分或重发 |
| `pilot-final-code.json` | 18 | 57167，provider reported | development六槽全部 execution / authority passed，18 tools / 21 deterministic checks passed，S01 empiricalReady=true |
| `supplementary-haiku-probe.json` | 1 | 1169预留，usage unknown | connect timeout，10547 ms，未收到响应 |
| `supplementary-haiku-probe-connect30.json` | 1 | 53，provider reported | HTTP200，4063 ms，有效编程文本响应；未执行代码 |
| `supplementary-haiku-probe-base.json` | 1 | 1169预留，usage unknown | `/v1` base经原provider发出正确生成路径，HTTP524 / 126139 ms；不再重试 |

全部实际发送 / grader / 取消 / 失败合计 **110 requests / 300464 tokens**，durable ledger `breached=false`；其中unknown按本地预留上界计入，不能把累计数称真实计费或精确provider总量。没有清账或退款。当前252 requests / 1000000 tokens有限guard内剩余142次 / 699536记账tokens；这不是新一轮可自动花费额度或网关实际每日剩余额度。测试回归的fake HTTP与scripted structural输出没有外部调用。

| 完整报告 canonical hash | 实际 source / tested identity |
| --- | --- |
| pilot `c03cf7eae138bb770f79830350f3a2e5e238e255e41ba44d1c9938c11fae3577` | tested HEAD `7d7708c1486c5b48b430eb2210e89768f4aabfb0`；adapterRevision `3ee05e084125bb418602fa92900a7ee71c6bb7b4f944f20285988375ec0f97af` |
| comparison `caee10f7ff16c957ff8e3da85fe155042544eed27ad653e19b8886546b5e33dd` | tested HEAD `b5df610bdffd05d60ef3bc9bd6e62e7d9a164aa3`；evaluatorRevision `2cb0f2081886f2bedeac029ddf2b5a5b1cb97aa765ccb2b6b2fe6e07c8ced855` |
| judge `98bb43a7765b4114cfba895a1f7c6d71abb91ce05f034777b2b66901d559c1a9` | evaluatorRevision `57707d2808fc1b42a28e02cde89ef0ead188c1b1fb8e84026e7abfd52c16efc7`；报告无HEAD字段，不凭source hash补造 |

`independent-baseline-fixed.json`与comparison baselineHash绑定；真实baseline先于任何candidate完成并独立保存。唯一候选在读取promotion输出前冻结于 `candidate.json`，target=rpPrompt，内容为仅用可见更新facts的简短NPC回复、保留玩家决定、write_message后finalize；Project配置不变，仍独立运行完整六对。每个promotion输入 / side / actualrequest / tools / outcome / usage可追溯，不用development输出代替promotion结果。只做一次repetition，不声称统计稳定性。

Blind grader与被测Gemini相同：rp_agency tie（confidence .9）；rp_memory candidate（.8，promise 4 vs 3）；rp_variant invalid_response，无分数；Project三个tie（confidence 1，intent 4/4、conflict 3/3、repair 4/4）。这是五次model observations；无人类labels、无独立多judge分歧证据，malformed响应需审阅，不能证明稳定改善。原S01 behavior保留not_run；Comparison empiricalReady=false、JudgeReport promotion=ineligible，价格 / costDelta / latencyBenefit不可知。S06完成隔离执行与报告消费，不表示候选晋升、M1整体或自动启用完成。

第二个 `claude-haiku-4-5` 连接由用户明确补充，未知RPM采用单请求串行至少10秒间隔、独立配置与receipt，三个探针不混进Gemini trials / scores。连接曾成功，最终base配置请求为524；不承诺站点稳定性或模型工具能力。首个失败保留，第二次用原已安装undici的30秒connect timeout，未安装依赖或改变lockfile；第三次只核对用户纠正的base接线，停止附加重试。

本地Git config `atria.s06.connection` / `ledger` / `artifacts` / `limits` / `secondaryconnection`仅存Git外位置，不把值写入文档。两份private config mode600，Secret仅本地保留；公开报告不含credentials、headers、原始provider response body，所有输出新文件、共享writer lock已释放，rate checkpoint与账本保留。最终docs检查覆盖本任务七文件、82个内部links / 两个锚点、40阶段依赖与D0–S05原Record文本不变、五份既有dirty hashes不变；product / docs staged diff与两条实际key扫描通过。

### Remaining / next checkpoint

- **S06 完成；下一 checkpoint S07，本轮未开始。** 六槽真实基线 / 独立六对执行与 authority通过满足 S06 原入口 evaluator checkpoint；缺评分 / human labels / price保持不可知，Comparison 与 JudgeReport publication / promotion仍 ineligible，不把一次偏好解释为稳定改善。
- S07 沿原 Skill repository 冻结 candidate版本、exact读取pin、发布冲突与历史，再实施局部消费者 / 兼容 / 失败检查；不提前实现 S08–S10，不进 G / Local。本组 M1未完成，不合并 main或删除产品分支。
- 以后真实补测仍恢复同一 durable累计ledger / rate checkpoint，明确budget override；当前私有连接按用户纠正保存 `/v1` base，原 evaluator拼接一次endpoint。配置identity与早先完整URL报告不同，历史实测/hash不得改写或覆盖。
- 本轮产品五个提交已push；docs阶段记录 / Plan / live HANDOFF只提交本任务七文件。docs完成HEAD以包含本段的提交及origin实际refs为准；既有dirty不暂存，前序Record / 40阶段依赖 / protectedhash按收尾检查保持。

## S07 — 原 Skill 候选与完整版本、真实运行读取 pin

- Start product HEAD: `54c79cb8eea7d6ca5c7e5e4ff262fe0ca6666a64`。
- Start docs HEAD: `6adb6902df6671af12b26d4280ec07e7798125b7`。
- End / tested product HEAD: `57f4e814af373b4659ba247f9891edd80652c356`；同一 `feat/agent-intelligence-runtime`，commit / push 完成，main 未合并。
- Initial implementation commit: `375a917c8237cfb393a681db18c17e355fc3bc8e`；最终 `57f4e814af373b4659ba247f9891edd80652c356` 仅补内部 staging 路径 guard 与同一测试的拒绝覆盖。
- Status: **Complete — S07 only**；详细契约先冻结于 [s07-skills](../../plans/architecture/agent-intelligence-runtime/s07-skills.md)。未加载 repository-agent Skills、未读写 reference / 其它 Experience 草稿。

### Implementation / decisions

- 原 Skill repository 继续以用户 Skill 文件目录为有效配置 authority；新增`skills/.history/<scope>/<name>`的完整 immutable v1 snapshots 与 candidate v1 metadata，不新增 StorageEngine kind 或独立配置读取器。version 复用完整 installedHash 算法，内容 / path / file hash / aggregate hash 每次读取重验；历史不宣称时间顺序或 revision counter。
- scope 解析和 visible / deny / invocation settings 先行；accepted pin 核对 actual 完整 hash。RP Director / child Agent、Spec nodes、Agenda workers 共享 run 弱引用 pin，Loop 保持单 Agentaccepted 版本；Native narrative 与 Project Studio 保持同一 generation / loop 的 version。always / read / files / search 都消费同一完整 snapshot，下一 preparation 新读 inventory；取消旧五秒全局 cache。缺 version / snapshot、corruption、删除与 identity 变更不 fallback 到 latest。
- Native supporting-file list 仅返回 metadata，不序列化完整 Buffer；available Skill / always 与 read 结果可观察 exact version。Project 显式 Continue 是新 preparation，未声称 task 整个生命周期固守一个 Skill。旧管理 / editor / embed 入口不传 version 继续读取当前文件；malformed / name-mismatch 旧 manifest 不伪造有效 snapshot，也不阻断修复。
- 每 Skill 最多 64snapshots / 64MiB rawsnapshot bytes、64candidates（每份序列化 metadata≤2MiB）；容量不足拒绝新 pin / 写入，不淘汰已接受版本。binary 支持文件完整保存，文本 read 拒绝 binary；重复 / 非 canonicalpayloadpaths 和 symlinks 拒绝。history / candidates 与原 Skill 目录一起走原 sync / 用户目录生命周期，embed / memory inventory 不包含历史。
- Skill 正文 candidate 保持整个 frontmatter 及所有支持文件，保存 base / desired、完整 diff 与确定性 candidateId。check 除 schema / hash / scope / diff 外重验支持文件与声明不变，即使 sync 导入 hash-valid 扩权 candidate 也拒绝。候选本身不切当前配置、不宣称关联 S05 诊断或 Evaluationeligibility；S10 仍需 provenance / policy / source-deletion dependency、完整 Review 和自动晋升 consumer。
- `POST /api/skills/:scope/:name/pin`需要 expectedHash；history / candidates / check / explicitapply 沿现有 authenticated per-user repository。file / files / search 追加 versionquery；响应 no-store；候选 save / explicitapply 分别是原用户编辑权限，没有 model job、后台 loop、新 UI 或自动 publication。PackageHTTP 写仍 403，repository 也拒绝 edit / candidate / 不同内容替换；原首次安装与 same-content 幂等安装保留。
- repository 所有读写与不同 instance 共用 dataRoot 单进程排序；install 可选 expectedInstalledHash，candidate apply 必需 expectedBaseVersion 并重验完整当前内容。apply 原子切换 SKILL.md；desired 仍为 current 时重复显式 apply 返回 alreadyApplied，响应丢失后不重复写。整个内容相同视为同一 version，不能声称检测 ABA；多 Host / 外部 editor 没有共享队列。
- 原 file write / edit 清临时文件，crash 遗留 UUID staging 不会混入 installedHash。正常 directory replace 切换失败恢复旧目录；move / scope rename / copy 先复制 history，history copy 失败不先迁移 source。delete / scope 删除清 history / candidate 并撤销 pin，损坏 history 不阻断删除；新同名 install 清未完成删除留下的 orphan history。name rename 改变声明 identity，清旧 history / 新名称新建；scope copy / move 保留 version 但原 candidate scope identity 不可复用。
- 原 global read-only guard 适用于全部 Skill mutations；已有 snapshot 可 pin / read、candidate check 不持久写，缺 snapshot 不能创建，HTTP503。没有 SQL 独立 candidate 迁移；SQL 产品部署仍依托原 Skill FS 目录，不能声称 StorageEngine dump 单独包含 Skillhistory。
- S06 隔离 Projectfixture 改为通过真实 Skill repositoryinstall / pin / exactread，保留原 limitedbridge 路径限制；header+fixture 正文随实际请求绑定，不改写历史模型报告 / 哈希或 S06 promotion 状态。

### Minimal local validation

- **13 relevant suites / 247 distinct tests passed**：versions23、run-pins4、repository72、api-rest46、browser api16、embed14、native invocation10、RP tools14、resolver23、precedence8、Native / multi-visible3、runtime plumbing3、live-bridge 11。重复不累加。
- 12-suite 组合 174 passed；最后增加 malformed legacy repair，并定向 versions / repository / api-rest **3 suites / 141 passed**。最终 staging 路径 guard 仅定向 versions / repository **2 suites / 95 passed**，不重复累计。命令沿原 `node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand <对应 tests>`；README 提供 S07 最小两套入口。首轮定位 Package 首次安装误阻断与缺 pin 旧 fixture、S06 restricted fixture 未接新 version、Native always 预期缺 version；修复后相关定向通过，没有降低 production pin 要求。
- 真实临时 FS restart、全 Skill 旧版本 / 支持文件 / binary、并发两 repositoryCAS、一文件或 full-install 冲突、candidateimmutable / declaration 与 support 限制、未知 schema / hash corruption / history 容量、write / snapshot / directory rename 失败、delete / 同名重装 / rename / copy / move、read-only / 503、malformed 旧 manifest 修复。
- 实际 RP Director 主 Agent 与派发 Agent 跨原 runtime / tools / repository 执行：model stub 在 accepted 之后修改 liveSKILL.md 及 reference，两个 Agent 仍 read 同一旧 version 与旧正文，正式 fixturemessage 完成；另测 always / search / next-run fresh。原 NativeprepareNarrativeSkills 验证 always / read / metadata files / deletion，无新真实模型。
- 实际 HTTProuter / injected per-owner roots、body 伪 owner / scope 不改变 authority、pin409 / missing404 / no-store、candidate / explicitapply / idempotentreconcile、exact file / files / search。Browsertransport 验证 versionquery 与 pinCSRF。原 sync snapshot / reconcile round-trip 恢复 history 及 candidate，历史不混入 embeddedfiles；hash-valid 同步候选夹带支持文件改动被拒绝。
- 原 Stage S06 live-bridge 11 通过，含真实 Studio / GenerationHost / limitedfixturebridge 的 read / boundedSkillread / write / reset / Review 与 fixtureCommit；provider 是注入 HTTP response，**不是新增真实 model 质量证据**。runtime plumbing 覆盖 Loop / Spec / Agenda 现有调用接线。
- 触及 22 个 JS 文件 ESLint、product / staged diff 检查通过；文档 links / fences / stage 依赖 / 前序 Record 与五个 dirtyhash 按收尾检查保持。复用已安装依赖，不改 lockfile、不读取连接 / Secret / ledger、不发模型请求。
- 未执行全量测试、build、browser / UI、Android / 真机、外部 DB、远程 CI。没有生产用户 Skill、Package 或其它对象写入；所有运行 / HTTP / sync 样例为临时 fixture。S06 预算 / 私有配置与报告不读写，已知累计仍 110requests / 300464 记账 tokens，不把它当本轮实测。

### Limitations / next checkpoint

- 单 Host writer 支持；外部文件修改在 acceptance 时 hash 不符则 conflict，不提供跨进程锁或 revision counter。所有 Skill 读写共用一个 root 队列；历史容量检查有有限文件 IO，不声称零开销。
- Snapshot / candidate 是原 FS 资源；正常失败路径与 repository reopen 已验证，不宣称 physical fsync 或跨资源事务。进程恰好退出于原 directory replace 交换窗口时可能 temporarily unavailable，backup 保留，未引入自动 crash replay；candidate 单文件 apply 与 desired-currentreconcile 已实现，完整 PromotionIntent / scheduler / publishreceipt 归 S10。
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
- 默认无 evolvable targets；显式 declaration 绑定 Preset current revision 和 active exact module refs。一个 candidate 只改一个模块 `body`，保留整个模块声明、其他模块 / guard、Generation、Regex、工具 / 权限、Connection 与 runtime。完整 Preset / declaration fingerprint、whole original Route、base / desired refs、完整 before / after diff 冻结；候选正文各 ≤64 KiB、每 Preset ≤16 candidates / metadata ≤2 MiB。
- body 插值复用原 parser / readVariable 校验声明与 forbidden paths；实际参数 / artifacts / host 值仍在每次原 compiler 内验证。check 重建预期完整资源闭包、逐 exact revision 核对内容，unknown schema / corruption / missing / declaration / base 漂移拒绝，不靠 latest fallback。
- authenticated `POST /presets/:id/prompt-candidates/{inspect,declare,prepare,check,apply}` 沿原 Native Generation router，响应 private / no-store；owner 来自 authenticated handle。apply 在同一 runtime queue 内核对 complete original / desired Route，沿原 storage `putMutable(expectedIntegrity)` 原子切单一 player Route 的 `promptProgramRef`，Generation exact ref 不变；desired complete match 可 reconcile。Preset / declaration 编辑清 pending candidates，删除仍按原 archival history 保留已 pin 定义。Package 须显式 import 为用户 Library 副本，原封装内容 / exact refs 不改。
- 普通 RP 保留 `agentWorkspace` settings / 原 Preset / graph compiler / local binding。可选 `promptVersions` v1 保存 declaration UUID 与完整 base / desired snapshots；candidateId用已安装 frontend `sha256` 对 canonical 完整 candidate 内容寻址。normalizer 重建单一 Agent `instructions`变化并验内容 hash，防止同 version 改正文 / tools / budgets / topology。≤64 declarations、≤16 candidates / 整个 metadata ≤2 MiB；候选 instructions ≤64 KiB 且非空，避免原 consumer 空值 fallback。
- Workspace apply 只切 character / conversation binding 的 optional `promptVersionId`，冻结整个原 binding table，禁止default / global / `builtin-*`。下一 resolveWorkspaceProfile 使用该 exact definition，profile 与 Plan metadata 携带 version；Director / Loop / Spec / Agenda沿原 transport，已有 run 使用已接受 clone。原 bind 清 pin；Preset save 保留已选历史 snapshot，但base / declaration变化阻止 pending apply；delete 清该 Preset 候选 / declaration / pins，replacement 不携旧 pin。missing version 拒绝。
- 原 orchestrator capability API 暴露 inspect / check / update，保存复用原 settings / debounce；未添加 UI或后台循环。该路径只有原单 browser client 支持，无 cross-tab / Host CAS 或持久 publication intent；S10 自动 publication 须先落实所选 target的部署写入边界，不能把本阶段手动apply当自动晋升资格。

### Minimal local validation

- **7 relevant suites / 68 distinct tests passed**：native candidate 19、Workspace candidate 14、Prompt Preset 5、runtime persistence 7、Workspace Preset 4、Native orchestration prompts 9、Workspace authoring help 10；重复不累加。最小新增入口见产品README。
- 最初Native candidate 15 测中定位 fixture Secret与模型公开文字同名造成原 Secret guard 拒绝、FS transaction port 故障注入位置不符、单 handle harness foreign owner 错误类型；改为独立 synthetic Secret、真实 transaction port / multi-owner FS，未降低生产guard。补原 atomic storage Route CAS后验证metadata 失败和 committed response loss；失败后重复 apply 仅 reconcile，不重写。
- 真实临时FS / SQLite 候选 reopen / dedup、两 repository 并发 CAS、whole Route 用户编辑、Preset Regex 编辑 / 删除 / redeclare、容量、body-only / Package refs、unknown schema / missing / corrupted / protected content拒绝；新增继承 chain 沿原 schema 保留非空 stage，所有Program / 模块 refs 保持正确。Native单套最终19 passed。
- 原SQLite binary dump→close / per-user directory removal→restore恢复完整 candidate / immutable versions / active binding。`engine.deleteUser`本身只 close DB，实际删除沿原user目录清理；不声称只调用该方法会 purge files。Package exact envelopes 经原 Preset import 生成隔离 Library copy，原 resources 前后 JSON 不变。
- 实际HTTP owner 隔离 / 401 / 404 / spoof body / no-store / read-only 503；Native inspect / check 在 read-only 可用。实际GenerationService narrator 与 studio snapshot / rendered request显示candidate / unchanged guard，old preview 保留旧 body；实际Project Generation Host task 经原 scheduler / compiler / provider stub发出candidate。不是新增真实模型、完整 Native Session turn 或 Production Project 修改。
- Workspace 四 mode exact profile / Plan metadata、原SettingsRepo FS / SQLite reload、whole definition / binding / declarations conflict、hash-valid shape 但同 ID 改 body拒绝、missing version / unknown schema / factory / global / 容量 / delete / unpin。实际RP Director stub在首轮清后续 pin，当前两轮 request 仍同 candidate instructions并写正式 fixture message；下一 preparation 回原版本。
- hash facade 引入后定向 Workspace 相关三套 27 passed；jsdom authoring help 的原 fflate browser export 不符合 Node ESM，局部 harness 改用 Node package export conditions（保留真实 sha256）后该单套 10 passed。未修改dependency / lockfile / bundler；未进行browser UI验证。
- 10 触及 JS的ESLint、product / staged diff通过。已通过无新变化的原Preset / persistence检查未重复；最后只复查新增故障面和sha256接线。docs links / fences / 40 stage 依赖与前序 Record、五个既有 dirty hash按收尾检查。
- 未执行全量 tests、build、browser / UI、Android / 真机、external DB或remote CI；未读取Secret / S06 连接 / ledger / 私有报告，无新真实 model request。main AGENTS 与 docs README / WEB Adapter / 两模板既有 dirty未暂存 / 提交，reference 与其它草稿未读写。

### Limits / next checkpoint

- Native 沿原单 Host write queue，无 cross-process lock；资源 metadata 与 Route commit不声称全局 transaction 或 physical fsync。metadata 失败可留下不可生效 orphan immutable revisions，仍属原 Library history；没有自动retention或crash publication intent，归S10。
- Workspace 沿原单 client settings authority，原 debounced save不保证响应即 disk durable；跨 tab 更新 / server CAS未实现，不能开放未获证明的自动发布。完整 snapshot compare 和 SHA-256 identity防止合法入口中的stale apply / version 正文替换，不提供外部任意raw settings writer安全边界。
- Body declaration是用户显式authoring选择；必要runtime guards / builtin 原版不随 candidate 改变。文本行为约束是否退化仍须S06 独立 evaluation 和 S10 Review / policy。手动apply 不与 S05 feedback / diagnosis 绑定、不产生Evaluation eligibility，不改变S06 ineligible 结论。
- 已选旧资源 / 已准备 run遵循原 pin 生命周期；source Preset 编辑阻止新 apply，历史 retain 或显式 unpin不等于已实现feedback 撤回 / 自动rollback。S10 须接同一 source-deletion / retention / policy / evaluation / 预算和完整publication 闭环。
- **下一 checkpoint 仅 S09**：核对真实 Git → HANDOFF → index / decisions → m1-evolution / delivery S09 / s08-prompts / s07-skills / s06-comparison → 同一 Record；按需原 Preset / Project 参数与compiler / policy。先冻结有限 allowed fields / whole base / exact binding / conflict，不改变capability / output owner / guards / connection / 隐私或自动Routing。
- 本轮 S08 产品 / 文档 commit / push 后停止；S09–S10 / G / Local 未开始，M1 未完整，不合并 main、不删除产品分支。S06 若未来补模型测试仍恢复同一 durable ledger / rate checkpoint且不覆盖报告。

## S09 — 原编排参数候选、局部精确版本与撤回

- Start product HEAD: `9b5cb5740e2af7cab8b83b9675576ea01c4f4527`。
- Start docs HEAD: `25e1e6ceb8705b07c825e4c47fb3a8c6bb5a2355`。
- End / tested product HEAD: `f740e65238d6c46575c1f9972735a1166ca1ec71`；同一 `feat/agent-intelligence-runtime` 已commit / push，main未变化 / 未合并。
- Status: **Complete — S09 only**；先冻结 [s09-strategies](../../plans/architecture/agent-intelligence-runtime/s09-strategies.md)。未加载Skill、未读取 / 更新reference或其它Experience草稿；未读取S06私有config / ledger / reports。

### Implementation / decisions

- ordinary RP复用原Workspace settings library、Plan compiler和host profiles。显式声明仅开放有真实consumer的有限整数：Loop / Director budgets.maxSteps 1–64；Spec / Director / Agenda budgets.maxConcurrency 1–16；Agenda scheduler.maxPlannerRounds 1–32 / maxTotalRuns 1–64。原任意其它预算 / policy / capability / tools / output owner / guard / topology / Prompt / model / Connection / privacy字段固定。
- 新增optional strategyVersions v1：完整base / desired、单字段diff、声明UUID、完整base binding table、local subject和SHA-256candidate identity。原character / conversation binding选择strategyVersionId，profile / Plan metadata显示same version；下一preparation原compiler读取exact definition，当前run保持accepted clone。≤64declarations / ≤16candidates / metadata≤2MiB；unknown / missing / content tampering / capacity拒绝，不fallback。
- 单目标候选：已选Prompt / strategy pin上的组合prepare拒绝，binding同时有双pin拒绝。原bind清双方pin；Preset save保留已选完整snapshot但whole base变化阻止pending apply / rollback；delete清本identity候选 / declarations / pins。显式rollback在complete desired或base仍匹配时恢复冻结base，可在声明撤销后执行；用户binding / Preset改动冲突，不覆盖。
- 原orchestrator capability API增加inspectStrategyVersions / checkStrategyCandidate / updateStrategyVersions，仍为原单browser client与debounced settings save；无cross-tab / Host CAS、durable publication intent、新UI或后台job。
- Project authority核对发现maxRepairRounds是原Task creation参数，并无现有Project-wide Agent默认配置。选择最小兼容接入：authenticated owner + Project +尚未执行的单一Task，候选metadata追加到原durable task document；有效配置仍是原task.maxRepairRounds。完整task base仅排除repository sequence与本metadata，冻结project baseRevision、当前server cap与声明；不创建第二套Project配置服务 / 新StorageEngine kind。
- Project只允许planning、无plan / generation attempt / proposal / Workspace的Task declare / prepare / apply / rollback；运行开始后拒绝参数改动，原repair policy / Studio loop消费accepted value。其它Task沿自己的原creation参数，不自动继承；Project revision / Task任意内容 / server cap / declaration漂移拒绝。≤16candidates / metadata≤1MiB，仍受原task≤2MiB约束。
- 原Project task queue / integrity CAS将candidate与active参数写入同一document；重复desired / base匹配reconcile，不重复sequence写入。原Task snapshot / context policy显示active strategyVersionId；原Task无metadata继续兼容。删除 / user backup沿原kind；check / inspect在read-only可用，writes拒绝。原Studio router缺失storage_read_only状态映射，本轮修为HTTP503；不新增模型可调用candidate工具。

### Minimal local validation

- **8 relevant suites / 105 distinct tests passed**：Workspace strategy21、Project strategy16、Project recovery33、Project authority4、Project HTTP4、Workspace Prompt14、Workspace Presets4、Native orchestration prompts9。新增37tests；既有相关68tests。初始Workspace19后补实际Agenda两项，最终仅定向Workspace21；Project两次失败后的修复只定向相关7suite84，重复不累加。
- 新增Workspace tests证明四mode有效host / Plan字段、original Preset不改、scope隔离 / current clone、whole base / binding / declaration冲突、capability / output / guard完整保护、unknown schema / rewritten same-ID / missing / capacity、default / builtin / ignored fields / Prompt组合拒绝、declare撤销后rollback与user edit conflict、delete / original bind。
- 实际Director stub在candidate maxRounds=1时只发一轮，send中rollback仅影响下一preparation，已接受profile保持1。实际Agenda Engine分别在plannerMaxRounds=1 / maxTotalRuns=1后只执行一次planner、一次worker和必要finalizer，budgetReason与exact plan fingerprint可核对。原Engine policy实际将concurrency限为1，并在step budget耗尽时不再admit work。
- 新增Project tests使用真实临时FS / SQLite、原ProjectStore / Studio builtin Git / ProjectAgentService / TaskRepository。原context tools / humanReviewRequired / silentRebase固定；candidate limit=1在首轮invalid source后进入blocked，Commit与in-flight rollback拒绝，Project revision未变。原Studio loop provider stub读取exact task strategy，generation开始后rollback拒绝。
- 原FS / SQLite SettingsRepo reload、Task repository reopen / service重新实例化；SQLite原dump→删除task resource→restore恢复完整candidate / selected参数。该测试不声称Project FS source包含在SQLdump或deleteUser仅close就purge所有files；原Project source / 用户清理由既有authority负责。
- 两repository调用与声明supersede的whole task CAS / queue、wrong owner / Task deletion、project human edit / cap / plan / attempt / takeover漂移、save前失败与已commit响应丢失→原authority reload / once reconcile、候选容量与server cap / expectedSequence、schema / protected / content identity / missing version拒绝。
- 首次Project新增测试定位optional字段被原strict fields误要求为必填；修为只有存在strategyVersions时才进入optional schema，旧Task保留必填集合。另修async方法的synchronous rejection与原HTTP readonly500映射；未放宽guard。HTTP真实401 / foreign404 / spoof字段400 / no-store / read-only check200与writes503。
- **11触及JS ESLint、product / staged diff通过**；无全量tests / build / browserUI / Android / 真机 / externalDB / CI或real model。无依赖 / lockfile变动，model请求为stub，不计S06真实预算。docs本地检查：6份任务文档 / 105个local links / fences通过，40个stage身份与依赖不变，D0–S08 Record内容及五个既有dirty hash保持。
- main AGENTS与docs README / WEB Adapter / 两模板既有dirty未暂存 / 提交。五hash与开轮一致：AGENTS `8f01833fdba7d46bd6dfa33e259585e2486ddf11a3076997a0830cde331d265f`；README `8d1fe754dd5f5a8255375b8ae8aed29a9196b764a54c65970c7a188ba93416b1`；WEB `a9ea6de6d9bbc3f5a5a50e508231fb9286f0ef6e798268b2901cbe38db7a4686`；HANDOFF模板 `22c8d9aead58bced3b96a265a0cf7f0b18f13e9346e5d118194b7558f5d66c06`；Record模板 `adf27c43f4318970782387069b3beb88d21cf6a7b97217702ed6b9b170e06c77`。

### Limits / next checkpoint

- 数值范围是本阶段finite工程边界，不是自动晋升阈值或provider token / price证据；可增加有限工作量，但complete guarded config不变。确定性停止 / 隔离tests不证明模型收益。S06仍promotion ineligible；manual apply不绑定feedback / diagnosis / evaluation，不产生自动发布资格。
- Workspace原单client / debounce，不具cross-tab / Host原子publication。Project沿原单Host队列 / task CAS，不声称跨进程锁 / physical fsync；完整Task candidate只适用pristine Task，已运行Task不可rollback policy，其他新Task不自动继承。这是S09有限现有参数authority接入，S10若需要Project-wide配置必须先设计原authority兼容路径，不偷偷将candidate metadata当有效默认配置。
- explicit rollback只在冻结whole base / desired匹配时恢复配置，不撤销既有Project / World effects；来源withdrawal / retention / policy删除的传播、运行后监测和自动rollback仍归S10。
- **下一checkpoint仅S10**：真实Git → HANDOFF → index / decisions → m1-evolution / deliveryS10 / s09-strategies / s08-prompts / s07-skills / s06-comparison / s05-feedback → 同一Record。先冻结source / diagnosis / feedback / policy依赖、owner共享finite预算、原scheduler bounded job、Review / publication intent / receipt / crash恢复与各target写入部署边界，再实施双入口完整消费者。
- 本轮产品 / docs commit / push后停止；不进入S10、不合并main、不删除分支。若确需模型验证，恢复同一S06ledger / rate checkpoint，不读取未知Secret、不清零预算 / 覆盖报告。

## S10 — 有限评测、原局部发布、恢复与双入口消费者

- Start product HEAD: `f740e65238d6c46575c1f9972735a1166ca1ec71`。
- Start docs HEAD: `a5a27f2d8d4c472dcbb1e9da0342759d219c7a2b`。
- End / tested product HEAD: `ed00f4f0cea53be360ed8dfa082bbd0afeec5398`；同一 `feat/agent-intelligence-runtime` 已 commit / push，产品 worktree 干净。main 未变化 / 未合并。
- Status: **S10 engineering complete — S10 only；M1 empirical acceptance pending**。先冻结 [s10-evolution](../../plans/architecture/agent-intelligence-runtime/s10-evolution.md)，保守实现 finite policy / target / budget / promotion / publication / rollback；没有默认扩大三类目标或运行权限。
- 未加载 Skill、未委派子 agent、未读取 / 更新 reference 或其它 Experience 草稿；未读取 S06 私有 config / ledger / reports。

### 原 authority / 部署边界

- `AgentEvolutionRepository` 新增 registry kinds `atri_agent_evolution_owner` [handle] 与 `atri_agent_evolution` [handle, scopeId hash]，只保存有限预算、policy、job、report、intent / receipt。原 Skill files / history、Workspace Preset library / binding、Native immutable Program / Preset、Project Task 仍是有效配置权威；没有并行 active config。
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
- gate 要求全部 original authority / isolation / target_consumed 检查通过，九个人工 observation 非负且无分歧，至少六对 candidate 胜、其余 candidate / tie，行为维度非负，paired candidate token / 可核对费用≤baseline；每个 judge / trial charge 与 durable ledger 精确对应。unknown price / usage、缺人工观察、同模型 judge 单独偏好、未消耗 target 或超额均 ineligible。
- 价格是 owner 显式确认并绑定 exact Route / model / connection 的有限 metadata，不推断 provider 定价或隐藏 retries。controller 提炼 / judge 单独报告、全计 job / owner；trial 相比不证明包含学习成本的净收益。初始门槛是保守准入规则，尚未以真实独立改善校准。

### Publication / recovery / lifecycle / UI

- 先保存 original candidate，再评价；失败保留 unavailable / review-only report 与费用 refs。policy / source / target / config / report / budget 全重验后写 durable intent，original target queue 内接受 finalizing gate，执行 original CAS，另写 receipt；没有 Evolution lock 等待 target queue 的锁反转。
- commit 前后 response loss / restart 用 actual base / desired / third-state 分别重验、补 receipt、conflict。重复 publish 请求恢复同一 pending intent，scope queue 内拒绝第二个 publication；任务启动也按 frozen batch / policy / target 去重。pause / disable 取消未接受 pending 工作，finalizing 接受的有限 CAS 可完成，不重复付费发送。
- rollback 校验 previous exact 版本与 complete original actual binding，用户改 binding、运行过 Task 或 missing authority 保持冲突；不 force overwrite、不撤销已提交 Project / World effects。Project original Host snapshot 记录 next-run exact ref / version；RP completed typed trace + saved exact output 记录 client_observation。receipt 历史与 current binding 分开展示，manual binding drift 暂停 automatic policy。
- 原 source / feedback / diagnosis correction、withdraw / delete / retention 先 durable invalidation / pause，再取消 scheduler、异步 rollback、清 report / derived diff / hypothesis 和未选原 candidate history。仍由用户选择的版本或缺原 authority 明确 garbage / conflict，清理仅留 hash receipts 与预算。Workspace refresh 与 Project generation 前沿同一 Experience freshness reconcile；read-only inspect 不持久写。
- 原 Workspace Run / Studio Task 挂同一共享面板，提供反馈与诊断来源、删除 / retention / export、有限预算、target declaration、默认 review / 显式 local auto、candidate diff、盲测场景与九对人工标签、成本 / 状态、exact report review / publish、pause / disable / rollback、current vs historical receipt。Studio 提供 Prepare without running；原默认流程仍立即执行。无无限 polling。

### Minimal local validation / failures accounted

- **12 relevant suites / 233 distinct local tests passed**。新 S10 三套 48：`evolution.test.js` 41、`evolution-consumers.test.js` 6、`evolution-http.test.js` 1；既有九套 185：Native Prompt candidates19、Workspace Prompt14、Workspace strategy21、Experience feedback33、capture24、Project strategy16、Skill versions23、Skill resolution23、SettingsRepo FS / SQLite12。重复运行不累加。
- 新三套组合先 44 passed；最后增加请求重试恢复并修复 pending intent / queue 幂等性，仅定向 service / repository suite **41 passed**（其余 consumer6 / HTTP1 无相关改动，保留已通过证据）。发布 / 测试代码以最终上述 product HEAD 归档；最终 host-profile 仅删除 EOF 空白，不改变逻辑。
- 主要命令：`NODE_OPTIONS=--experimental-vm-modules npx --no-install jest --config tests/jest.config.json --runInBand tests/agent-intelligence/evolution.test.js tests/agent-intelligence/evolution-http.test.js tests/agent-intelligence/evolution-consumers.test.js`；原九套用相同 runner。最后 SettingsRepo 加 `--testNamePattern='FsEngine|SqliteEngine'`。
- FS / SQLite 六类 target feedback → hypothesis → candidate → comparison → nine labels → auto original CAS → rollback；共享 scope budget / unknown / restore / breach、pause / cancel、before / after target commit 故障、restart / repeated request once recovery、stale settings、manual drift、跨 chat stacking 拒绝、source withdrawal / retention、inactive original history cleanup、generic SQL dump / restore / deleteUser 与 FS directory backup / restore / deleteUser、HTTP auth / foreign / spoof / no-store / read-only。
- 两个真实固定 fork worker 用 fake provider，分别运行 RP Skill / Project Prompt 的原 Director / Studio / compiler / resolver / GenerationService，28 个 fake sends / 27 paired + judge charges，target_consumed / 隔离 guards 可核对；同模型 tie 仍 ineligible。fixture stores / source / canary 隔离，未写 production Project。原下一 Project Prompt Host snapshot、其它 Project default、下一 Task Studio prompt 参数 / version / activation、RP completed trace、browser stale draft 与 fresh profile 分别直接验证。
- 首轮原九套 183 passed / 14 failed：12 项是未启动的本地 MySQL / Postgres；2 项是 feedback HTTP fixture 缺 library engine 的兼容接线，修为原 persistence engine fallback 后 feedback **33 passed**。SettingsRepo 最后 FS / SQLite **12 passed / 外部 12 skipped**；其它七套无变化，未重复。计数排除未通过外部 12 项。
- `node tests/frontend/agent-evolution-ui.smoke.mjs`：真实 Chromium 390px / 共享 production pane，原 RP / Studio 两个 mount 入口；fixture API 的 feedback、有限 budget、默认 review、start / pause / delete、escaping / dispose 通过。不是完整 app E2E，也未验证真实 app 的整个配置或网络工作流。
- `node --experimental-loader ./src/native/agent-intelligence/evaluation/loader.js src/native/agent-intelligence/evaluation/worker.js --check` 加载原模块通过。当前 Node 24 本地验证；Node 20 未实测，固定 loader 不用仅新 Node 才有的 registerHooks。
- **44 个其它触及 JS / mjs 的 ESLint 通过**；`src/endpoints/settings.js` 在只禁用 `atria/no-raw-fs-in-endpoint` 后通过。该 rule 的四处原 raw FS 错误（138 / 399 / 430 / 468）在 `git show HEAD:src/endpoints/settings.js` 的 S09 baseline 中也存在，不以未通过全规则 lint 冒充通过，不改无关 FS 治理。最终 product / staged diff 检查通过。
- 无新增真实模型请求；不读写 S06 private configuration / ledger / reports，旧累计仍 **110 requests / 300464 记账 tokens，breached=false**（含 unknown 保留预留，不是精确实际总量）。没有 full tests / build / full app UI / Android / 真机 / 外部 DB / remote CI 验证。
- 本阶段 docs 仅 index / delivery / m1-evolution / 新 s10-evolution / 同一 Record / live HANDOFF 六文件；本地六文档 / 89 local links / fences 通过，40 stages 身份与依赖、D0–S09 Record 正文与五个既有 dirty hashes保持。未改依赖 / lockfile / governance / 长期分支结构。

### Preservation / M1 acceptance checkpoint

- main AGENTS 与 docs README / WEB Adapter / 两模板既有 dirty 未暂存 / 提交，hash 保持：AGENTS `8f01833fdba7d46bd6dfa33e259585e2486ddf11a3076997a0830cde331d265f`；README `8d1fe754dd5f5a8255375b8ae8aed29a9196b764a54c65970c7a188ba93416b1`；WEB `a9ea6de6d9bbc3f5a5a50e508231fb9286f0ef6e798268b2901cbe38db7a4686`；HANDOFF 模板 `22c8d9aead58bced3b96a265a0cf7f0b18f13e9346e5d118194b7558f5d66c06`；Record 模板 `adf27c43f4318970782387069b3beb88d21cf6a7b97217702ed6b9b170e06c77`。
- S10 工程消费者已交付，**M1 独立真实质量 / 成本改善仍待验收**。S06 原 ineligible 未重解释，fake report positive-flow 只测试 authority gate；manual review 可明确提交所审版本，不将它计作 automatic eligibility。
- 下一只复核 M1 验收与集成前置条件，先核对真实 Git → HANDOFF → index / s10-evolution → m1-evolution / delivery M1 → 同一 Record。需要真实验证则先冻结双入口有限范围、人工观察与累计预算；恢复已授权的同一 S06 ledger / rate checkpoint，不清零 / 覆盖，不扫描 Secret。
- 本轮 S10 product / docs commit / push、同一 Record / live HANDOFF后停止。不合并 main、不删除任务分支、不进入 S11 / G / Local；不因 S01–S10 工程完成自动宣称完整 M1 验收通过。

## M1 — 验收与集成前置条件复核（2026-10-06）

- Scope：仅复核 M1；未执行补测或集成，未进入 S11 / G / Local。产品 HEAD 保持 `ed00f4f0cea53be360ed8dfa082bbd0afeec5398`，main 保持 `ed1fd90521a63363e29856601abbf5e908c99d10`；docs 复核起点 `ee2d530003f6c378e97f10d936a13a7edf5fd455`。
- 路由：actual Git → 最新 origin/docs HANDOFF → index → s10-evolution / m1-evolution / delivery M1 → 同一 Record S06 / S10。读取完整 Governance 以核对结束 / 集成条件；只对当前 evaluator gate / cases、package runtime 声明和相关 CI workflow 做源码复核，未扫描其它研究或 reference。
- **验收结论：pending，不能集成 main。** 工程 S01–S10 完成维持原记录；原 tests / fake provider / shared-pane fixture 不转为真实改善证据。S06 的旧 report / source pins 不等于最终 S10 实测；一次重复、无人类标签、一个 malformed judge、价格 / costDelta / latencyBenefit 不可知，原 promotion ineligible 保持。

### 验收缺口与有限实测前置

| 项目 | 复核结果 / 所需证据 |
| --- | --- |
| 支持范围 | 三类目标 × RP / Project 的工程 authority 覆盖已记载；实际模型收益尚无合格证据。补测先选两入口各一个支持矩阵内单目标，固定完整 base / target / policy / evaluator / Route / model / connection；不叠加独立报告，不外推未实测目标 |
| 独立比较 | 每入口三个独立 promotion 场景，每场景三次 paired trial；候选只见允许的 development / feedback / diagnosis。原 S06 一次 repetition 不能替代；S10 不接受导入旧报告取得资格 |
| 人工与收益 | 每入口九项独立 authenticated human labels 与 exact pairHash；人工和 model preference 无分歧、至少六对 candidate 胜、其余 tie / candidate、重要维度均非负；缺项 / uncertain / malformed 保持 ineligible |
| 成本 / 配置 | 确认 exact Route / model / connection 的有限价格，逐 actual send 核对 usage / request / snapshot / ledger charge；trial token 与费用不高于 baseline。controller 提炼 / judge / retry 全计 owner / job，额外列出，不把 trial 合格称为净收益 |
| 真实闭环 | 两入口都需原 binding publication / receipt、下一 run exact target 消费、监测与 guarded rollback 的可核对真实证据；三类原工程覆盖不等于全部真实模型收益。RP trace 保持 client_observation，Project snapshot 保持 Host 来源 |
| 累计预算 | 原记录110 requests / 300464记账tokens，guard252 / 1000000，历史差额142 / 699536；本轮未读取 actual ledger，不认定当前可用。恢复前核对进程、writer lock、rate checkpoint、ledger、remaining，并冻结整个补测含多轮 / retry / unknown 的总 send / token 上界 |
| 两种 ledger | S10 product owner ledger 与 S06 CLI ledger 是各自 authority；未证明跨两者累计限额自动联通。不能直接在新 owner ledger 重获额度，不能以换 session / suffix / split 清账；先明确仍遵守原累计额度的执行 / 记账路径 |

工程 gate 的源码与 s10-evolution 门槛一致；上述是原门槛的待验收事项，不新建阶段或修改 Plan。两入口各一轮包含18 trial arms +9 judge，最低54 evaluation sends，尚未含提炼、多轮和重试；不能据最低数宣布剩余预算足够，必须先冻结有限上界。若尝试六个目标各自完整轮次，evaluation 最低162 sends，已高于历史142差额；不能默认全部补测可完成或缩减场景 / repetitions。

### 实际执行的前置检查与限制

- `git status --short --branch`：main 干净；已有 docs-task worktree 干净，fast-forward 到 origin/docs 后仅编辑本任务两文件。旧 docs worktree 的未跟踪 Experience 草稿保持未读写。
- `git fetch origin` 后实际 product / main pins 与 HANDOFF 一致；`git rev-list --left-right --count origin/main...origin/feat/agent-intelligence-runtime` 返回 `0 16`，任务分支完整包含 main；`git diff --check` 通过。未合并，未声称合并后运行验证。
- product 相对 main 的 package.json / package-lock.json / AGENTS.md / CLAUDE.md / .github/workflows 差异为空。声明 Node >=20，S10 仅实测 Node24；最低支持版本的 worker / loader 与相关 consumer 兼容证据仍缺失。
- `gh run list --branch feat/agent-intelligence-runtime --limit 10 --json ...` 与 `gh pr list --head feat/agent-intelligence-runtime --state all --json ...` 均返回空；本轮未创建 PR或dispatch CI。PR Checks 通过 pull_request 触发，包含全 lint、带真实 MySQL / Postgres 的 unit tests、frontend libraries build 与 migration guard；Native Model Prompt workflow 在 main / 对 main PR触发，旧 A8 workflow只匹配旧任务分支或 dispatch。push 本任务分支不自动证明上述检查已运行。集成前应取得 exact HEAD 对应必要 CI / 验证结果，原 lint baseline错误按事实归因，不能屏蔽后冒称完整通过。
- 本轮未读取 S06 private config / ledger / reports、未发模型请求、未重跑任何已通过tests。full test / build / full app UI / Android / 真机 / external DB 与 Node20 均未新增证据；没有产品改动或新依赖。
- 仅提交 / push同一 Record与live HANDOFF。下一 checkpoint仍为M1验收：先冻结有限双入口实测、人工观察、价格与累计预算，再取得合格真实闭环 / 改善和必要集成验证；条件不足明确pending。保留产品分支与main，不进入S11 / G。

## M1 — 验收与集成前置条件再次复核（2026-10-07）

- Scope：仅复核已有 M1 验收与集成前置条件；不执行真实模型补测、产品修改或集成，不进入 S11 / G / Local。
- Actual refs：远端 `docs` 已为 `c4fb8ddeee96bae11b3f6091c4e7b6dbb4fd03a8`，比本地 `ee2d530003f6c378e97f10d936a13a7edf5fd455` 多一个 M1 复核提交；定向 fetch 后读取最新 HANDOFF / Record。docs 工作树 fast-forward，既有四份治理 / 模板 dirty 保留。产品 / main 的本地与远端 HEAD 仍分别为 `ed00f4f0cea53be360ed8dfa082bbd0afeec5398` / `ed1fd90521a63363e29856601abbf5e908c99d10`。
- **结论维持 M1 pending / 不集成。** S06 一次 repetition、五项同模型观察 / 一项 invalid_response、无人类 labels / 可核对价格仍不满足 S10 gate；原 reports pin 较早 source，不能替代最终 S10 实测。S10 的 233 tests / fake worker / shared-pane fixture 只保留为历史工程证据，本轮没有重跑或新增模型证据。
- 补测前置不变：冻结两入口支持矩阵内单目标及 exact base / policy / Route / model / connection / evaluator source、独立 split；每入口三个场景各三次 paired trial、九项独立 authenticated human labels，至少六胜、全部 nonregression / 行为维度非负、judge 无分歧；source / authority / isolation / target_consumed / exact config 全通过，trial tokens 与可核对费用不高于 baseline。提炼 / judge / retry 全记账并单列，不把 trial 达标称作净收益；原 binding publication / 下一 run exact 消费 / guarded rollback 的真实闭环仍待证据。
- 预算没有实时复核：110 requests / 300464 记账 tokens 与历史差额142 / 699536仅来自原 Record。未读取 private config / ledger / reports；执行前仍须核对原进程 / lock / rate checkpoint / actual ledger，并证明 S10 owner 与 S06 CLI 两种账本沿同一累计额度执行，不通过新账本重获额度。两入口最低54 evaluation sends不含提炼 / 多轮 / retry，不证明额度足够；有限上界不足就停止，不缩减验收门槛。
- 最小本地 Git 检查：product worktree 干净；main...product 为 `0 / 16`，merge-base 正是当前 main，具备快进拓扑；product 相对 main 的 `git diff --check` 通过，package / lockfile / AGENTS / CLAUDE / workflows 无差异。未合并，未声称集成后验证通过。当前 main 的 AGENTS.md 为既有 dirty，其 hash 与 S10 保护值一致；2026-10-06 的 main 干净观察不代表本轮状态。
- 按用户当前要求，每阶段与结束只做本地最小相关验证；不将前轮远程 CI 待取得项继续作为本轮门槛，不查询 / 触发 CI，不要求 full test / build。未来集成前仍需与触及面相称的本地检查、声明 Node >=20 对应的最低版本兼容证据，以及上述双入口真实闭环；已有 Node24 / FS / SQLite 证据保留，Node20 / external DB / full app UI 未实测不计通过。集成后只在 main 做最小相关验证。
- 本轮仅刷新同一 Record / live HANDOFF，执行两文档链接 / fences、前序 Record 保留、五个 protected hashes、diff / staged paths 的本地检查后 commit / push docs。没有读取 reference 或其它草稿、没有产品 / Plan 改动。main 与产品分支保留；下一 checkpoint仍只限 M1 验收，条件不足保持 pending。

## M1 — 代劳自动验证与原账本缺失检查（2026-10-07）

- 用户授权继续代劳 M1 验证，不要求用户本人执行测试；仍限 M1，不进入 S11 / G / Local，不放宽独立人工观察或 automatic promotion gate。Start / tested product HEAD 保持 `ed00f4f0cea53be360ed8dfa082bbd0afeec5398`，main 保持 `ed1fd90521a63363e29856601abbf5e908c99d10`，docs 起点 `f7fc8e23023d96903afda350f99971f21976a6dc`。

### 已完成的最小本地验证

- 补齐 **Node v20.20.2** 的相关工程证据：固定 evaluator loader / worker `--check` 通过；S10 核心三套共 **48 distinct tests 最终全部有通过证据**（repository / service41、consumers6、HTTP1）。这是本轮对新 runtime 的验证，不加到原 S10 233 项计数中。
- 首轮原三套为 **32 passed / 16 failed**；16 项均在 SQLite 初始化处失败，原共享 `better-sqlite3@12.10.0` 二进制为 Node24 ABI137，Node20 要求 ABI115。FS 六类原 target publication / guarded rollback、隔离消费者 / 原 compiler / fake provider、下一 run exact snapshots、stale browser draft、owner auth / read-only 等32项已通过。
- 在 repository 外临时目录安装 **相同版本 better-sqlite3@12.10.0 的 Node20 依赖**；实际 Node20 memory DB 可打开，SQLite `3.53.1`。临时 Jest config 完整保留原 mapper / setup / tests，仅将 better-sqlite3 指向该临时依赖；不修改共享 Node24 binary、package / lockfile 或源码。
- 只重跑失败的 SQLite 分组 / generic dump-restore：**16 passed / 25 skipped**；25项为上一轮已通过的核心用例，没有重复跑。加上已通过consumer6 / HTTP1，三套48项均已在 Node20.20.2 实际验证。未宣称任意 Node20 patch 或全产品最低版本兼容通过。
- 实际命令：`npm exec --yes --package=node@20 -- node --experimental-loader ./src/native/agent-intelligence/evaluation/loader.js src/native/agent-intelligence/evaluation/worker.js --check`；`npm exec --yes --package=node@20 -- node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand tests/agent-intelligence/evolution.test.js tests/agent-intelligence/evolution-consumers.test.js tests/agent-intelligence/evolution-http.test.js`。修正环境后，仅以临时等效config重跑 `tests/agent-intelligence/evolution.test.js --testNamePattern=SQLite`。
- 两个 production fork worker 仍使用 fake HTTP provider；原自动 publication 用例中的human labels仍为合成fixture。它们证明工程行为与兼容，不是实际模型改善或独立人工验收。没有 full test / build / 新browser / full app / external DB / Android / 真机 / CI。

### 真实比较的实际阻碍

- 仅按已有 local Git keys 定位原 S06 private files；主 / 次 connection 存在、mode600、凭证存在，仅检查结构及有限配置，不输出Secret / endpoint / 路径。**原 ledger、limits 与 artifacts目录均不存在**；均位于临时存储，ledger / limits父目录也不存在。原 `.lock` / `.rate.json` 同样不存在，检查时无匹配live evaluator进程。未扫描用户目录或任意其它位置。
- 用户答复 **“无迁移”**。这确认没有用户提供的新位置；不据此声称已查明删除原因或无法从其它备份恢复。
- Record 的110 requests / 300464记账tokens / breached=false仍仅是历史观察；原逐次entries / pending reservation / rate checkpoint与reports现在无法核对。连接文件自身120 requests / 250000 tokens低于历史累计tokens，不能当作旧252 / 1000000 guard的恢复替代。
- 因缺原账本 / 限额与reports，**未发起任何真实模型请求**，未改Git私有keys、未新建 / 重置预算、未用S10 owner ledger绕过原累计额度；没有伪造旧逐次charges或从历史总数还原账本。需要先明确原累计账目恢复处理与可核对有限验证预算；再冻结双入口单目标、配置 / case split / 价格 / sends / tokens。独立人工labels、真实改善与真实publication / next-run / rollback仍待验收，用户不愿自行验证不等于允许模型冒充human。

### 收尾 / next checkpoint

- product worktree 干净；main...product仍 `0 / 16`，product diff check通过。main AGENTS及docs四份治理 / 模板的五个hash与S10保护值一致，既有dirty未暂存 / 提交；没有产品 / 依赖 / Plan边界改动。
- 用户询问后续API存储并指定主目录Document；已创建本地私有 `Document/`（目录700、说明文档600），通过 local Git exclude排除整个目录，检查有效。已有两份connection无需重发，未复制 / 替换凭证或更改私有keys；后续用户提供的API信息保存为该目录的600私有文档。目录用于持久保存后续资料，创建本身不恢复旧账目或重置预算。
- 仅更新 S10 的runtime验证状态、同一Record与live HANDOFF，做三文档本地链接 / fences、前序Record保留、protected hashes与diff / staged paths检查后commit / push docs。S10支持矩阵、M1改善门槛与单Host部署边界不变。
- **M1自动本地验证已由agent执行；真实模型补测因原累计账本缺失未启动，M1仍pending / 不集成。** 下一checkpoint仍仅M1：先处理账本 / reports可核对来源及有限预算，再代劳真实比较；不要求用户运行tests，不进入S11 / G / Local，main与产品分支保留。

## M1 — 已批准自动化验收 / 保守预算恢复（2026-10-07，执行准备）

- 用户不愿自己验证并授权agent继续，对上一轮具体调整方向回复“统一”，按上下文同意处理。Plan新增m1-acceptance，更新index / decisions / m1-evolution / delivery / S10入口；工程验收改为自动authority / 双model盲评，生产human / price gate保持原样，不伪造标签、不以工程通过取得automatic eligibility。
- Start product `ed00f4f0cea53be360ed8dfa082bbd0afeec5398`；本轮test-only source `2c5499bb6`已commit / push。沿同一产品分支，main不变。六个test-only files接入原EvaluationBudget / EvolutionService / fixed worker / 原targets，不修改production Runtime权限或有效配置authority。
- 恢复设计按旧guard整段252requests /1000000tokens保守结转，`historicalCarry`绑定旧Record hash；旧entries / reports缺失与历史breach不可核实保持明确。新增allowance最多260sends /699536tokens，含carry累计512 /1699536；3150ms串行 /20RPM /2000dailycap /output1024 /单send300秒 /overall两小时；旧snapshot兼容。原job120发送 /一小时保持，额外independent / activation只分job标签，仍共享同一累计账本，不重获预算。
- 用户指定Document中的API两个mode600文件由旧连接复制，local Git connection / secondaryconnection / ledger / limits / artifacts五个keys已迁移；migration说明保存旧映射与evidenceHash，旧文件不覆盖。ledger独占初始化为carry +零新entries，未知 / pending保留upper，rate持久；用户root Document保持700并排除Git。未输出credential / endpoint / 私有路径到Git，未扫描用户目录。
- 自动工程验收仍各入口三个独立promotion cases×三次paired trials、至少六对两模型一致candidate胜、全部非回归 / source / exact config / target_consumed /实际usage通过，trial tokens不高于baseline；货币费用未确认则unavailable，只作token资源评价、不宣称净收益。人类偏好not_observed。私有fixture内委托review / 下一原Director或Project实际请求 / guarded rollback，不改生产对象。
- **五套61 distinct local tests通过**：recovery-budget4、m1-acceptance4、evolution41、live-bridge11、runner-failure1。初始相关三套16passed（含recovery4），最终三套49passed（含同四项），重复不累加。六文件ESLint / node syntax / product diff通过；新增验证aggregate不能减少 / oldsnapshot兼容 / durable pending / sticky breach、独立模型 / shuffle / usage拒绝与human gate保持、显式connection / review seed不发送。未执行full tests / build / browser / external DB / CI；Node24本轮，上一轮Node20.20.2证据仍为对应原source。
- 本段为正式有限执行前冻结，不代表实际模型改善。下一在已commit的source上运行m1-live，原固定worker / provider真实比较与第二模型盲评全部纳入此账本；partial / failed报告新文件保存，不覆盖历史、不追试至通过。实际结果将在同一Record后续追加，结束刷新HANDOFF后停止，仅M1，不进入S11 / G。

## M1 — 首次真实执行与有限 retry（2026-10-08，继续执行）

- 实际首轮source `1a1deb9f5`：补齐CLI stub的wiPosition与零send prepare，两个入口已准备；原compare每对结果单独保存。首次真实RP提炼与baseline成功，candidate请求HTTP524使固定worker停止；没有完整pair / judge / publication，Project未执行。不将两次成功请求推断成完整authority或收益证据。
- 首轮新增3sends /9498记账tokens：provider报告499与3610，HTTP524未知usage保留5389上界。累计255requests /1009498tokens（含旧carry252 /1000000），当前period breached=false、无pending，不清零 / 覆盖第一次报告。旧breach未知保持。
- 用户答复“继续尝试，除非报错频繁，否则可以认为是偶发情况”，随后明确“retry”。有限retry按m1-acceptance更新：HTTP5xx / transport最多追加两次，至少10秒；连续三次或最近20次六失败停止该连接，认证 / 配置 / 额度 / 取消不重试。每次调用原send并重新durable reserve，两种账本保留unknown，不增加512 /1699536累计guard。
- 原固定worker新增只读trial事件，原evaluator可选onTrial默认空操作，CLI保存每个完成 / 失败arm，避免后一arm失败丢失前一arm检查；不改runtime promotion gate。source `26f203f60`已commit / push；原consumers6 / partial worker1与retry5共12项通过，六文件lint / fixed-loader check / diff通过。重试状态持久checkpoint保留停止 / 频率，预算不变；沿同一账本继续实际执行。新提炼仍只见原feedback / diagnosis / base，未把promotion输出送入候选学习；前一失败候选与新候选分报告保留，不拼接source。

### retry途中发现并定位的解析问题

- `26f203f60`实测两个提炼请求HTTP成功但后续抛异常，新增2sends /1267reported tokens；累计257 /1010765，无transport失败。本轮当时未保存raw / stack，不把未知程序失败冒称API不稳定或合格候选。
- `d67a43c38`补私有raw response / charge与error诊断，lint / diff通过并commit / push；沿同一预算再取得两个响应，新增2sends /1711reported tokens，累计259 /1012476。私有证据确认两次皆SyntaxError：返回完整单一json代码块，内含正确value / rationale字段，原JSON.parse拒绝Markdown围栏。没有进入promotion，不把提炼失败计作真实行为回归或收益。
- 针对已确认根因增加evaluation内共享严格JSON parser：仅完整JSON或单一完整json / 未标语言代码块，仍由原字段 / target / grade checks审核；说明文字、多个blocks、其它语言与截断JSON拒绝。原extract、固定worker judge与test-only independent parser共用；source hash纳入parser，不修改promotion门槛或伪造旧证据。已有partial / failed报告保持各自原HEAD。source `6c99da07f`已commit / push，三套定向7passed /5skipped（两个原worker RP fenced / Project plain、parser2、工程判定3），七触及文件lint / diff与Node20.20.2固定worker加载通过；未重跑其余已通过consumer / guard，也未称全部Node20新代码通过。另修CLI independent callback局部变量遮蔽：scopeId继续取原job doc，不引用尚未初始化的响应变量。随后沿259 /1012476累计继续实际执行。

- 在实测等待期间定向检查发现原HTTP adapter会把fetch异常包装为ProviderFailure(kind=transport)，CLI retry仅识别code会漏掉该路径。`9e3d9ed57`仅修test-only retry：必须本连接已经观测transport失败才允许该wrapper重试，认证 / 未观测失败仍不重试；包含原真实adapter + fake transport + 两笔durable预算的用例，六项retrytests /两文件lint / diff通过，commit / push。当前已启动进程仍运行且pin `6c99da07f`，模块不热替换；native evaluator / cases / targets与9e相同，不能将9e冒称该付费运行的tested HEAD。

### 本轮实际结果与停止（2026-10-08）

- Actual paid-run Tested HEAD `6c99da07f6b6f17a901ecdccd06f2cbc41b746df`，从累计259 /1012476开始，新增73sends /293240reported tokens；全部在RP：extraction1 /564tokens、baseline34 /148691、candidate30 /137700、primary judge8 /6285。本轮无新的HTTP / transport错误，无实际retry发送；不把fake adapter重试测试称实际provider重试已发生。
- 固定worker保存17个trial事件，其中16完整arm原authority / isolation / target_consumed checks全通过，最后baseline中断；八对partial主模型结果7candidate /1baseline。完成八对baseline135433tokens、candidate137700，高2267（约1.67%）；无独立第二模型观察，不给缺失项补分，不将主模型七胜称完整验收通过。报告最后origin=unavailable，第九对未完成，不导入partial取得生产或工程资格。
- 单笔baselineprovider total5586 > upper5550，超36，触发原owner与共享恢复账本sticky breach。原reported input3887 / output171，其total比两项之和多1528，来源不可核实，不推断隐藏reasoning或价格；按保守total记账，不以4058替换5586。后续发送被拒，Project本轮零send，secondary / publication / next-run / guarded rollback未执行。此前Project两次提炼响应只记录解析失败，没有promotion证据。
- 最终累计332requests /1305716记账tokens，含carry252 /1000000；恢复期80sends /305716，其中79provider_reported、1旧HTTP524 unknown保留5389，pending0 /currentPeriodBreached=true。总额仍低于guard512 /1699536，账面剩余180 /393820不赋予发送资格；没有清账 / 增额度 / 关闭sticky / 新session绕过。独占lock已释放，全部私有报告保留。
- 实际summary SHA256 `109b1bed3af688ee3d2278fadd0233bb1d202a86c043ef7034465ea3bbeb9633`，累计ledger SHA256 `d81f350ad12de02a0a6c68b9d99fc100fba1c80efbacd85d300ae3ab91ecf963`。Native evaluator revision `f8548173b8ffb754052ade6e5bef06dad046d76a01dce3af8c74c06a0c7d752c`与最终product相同；source9e /822仅CLI changes，runner source pin仍实际6c，不把后续修复冒称付费tested HEAD。
- 最终product `8223cd70309661c4639d08e323177b56e4fa265a`已commit / push：新增early sticky preflight。实际breached账本最小检查exit1 /m1_cumulative_breach_requires_review /零新send，ledger SHA与rate字节不变、lock释放；单文件lint /diff通过。main `ed1fd90521a63363e29856601abbf5e908c99d10`未合并，main...product0 /24，产品worktree干净。
- **M1 pending / 不集成。** 已有主模型一对回归与partial token增加，且完整九对 / 两模型 / Project与真实publication闭环尚缺。用户无需自行验证 / 重发API来解释本轮中断；恢复前先核对provider usage / output limit与保守reservation口径，保留所有charges及sticky，需明确预算复核规则，不能自动清除保护继续付费。生产human / price gate不变，human未观测。
- 本轮只做相关本地checks：原consumers6 /partial1、retry最终6、parser2及相关工程helper定向；Node20.20.2固定worker加载与触及lint /diff。无full tests /build /新browser /external DB /Android /真机 /CI，不读reference。五个protected dirty hashes保持，未暂存治理 /模板；本轮更新同一Record /live HANDOFF与m1-acceptance状态、最小文档检查后commit /push docs并停止，不进入S11 /G。

## M1 — 用户明确仅API调用硬限 /继续验证（2026-10-08）

- 用户明确无token要求，真实测试API仅每日2000次 /20RPM硬限，其它建议预算超出立即通知且继续。此授权覆盖前轮sticky token超报的停止规则，保留332 /1305716所有旧entries /carry /breached与5389unknown，不清账、不下调报告用量；token增加不再作为M1工程验收失败条件，行为 /authority /双模型门槛保持，生产原预算 /human /price gate不改。
- Test-only EvaluationBudget显式advisory模式保留默认strict行为；私有fixture subclass沿原owner queue /schema /storage做真实reserve /settle，不建立新production authority。原repo源码不改，旧私有owner不清breach；新测试owner按新无token硬限语义记录费用。shared CLI quota覆盖两连接与全部sends、最少3150ms，滚动一分钟20与滚动24小时2000硬限、request IDs /timestamps持久；初始化单一332 aggregate carry，不伪造旧timestamps。
- RP复用原source6c真实付费、冻结proposal：核对original value /rationale /target /base与原公开feedback，报告原source charge provenance，不新增提炼费，不输入promotion输出。重新完整九对，不导入前轮八对拼资格；Project仍独立原feedback提炼。四套19tests passed（quota4 /recovery4 /engineering5 /retry6）、七文件lint /diff通过；source `c997086bd49c2f8a9c875cded65e6ad529f93442`已commit /push。两个入口零send prepare通过、原332 /1305716与breached保持、quota持久初始化；随后沿同一账本继续真实执行，超建议只通知、不停止。

### advisory实测与不完整响应重试

- sourcec997实测新增26sends /110784记账tokens，累计358 /1416500；RP前两对主模型一baseline /一candidate，第三对candidate遇没有正文 /tool_calls的provider响应，原Director拒绝；Project提炼返回finish_reason=length的截断JSON。没有token预算停止。shared账中一次偶发transport failure保留5217unknown，追加发送实际成功；原HTTP524的5389也保持，不以重试抹账。
- 两次实际单笔超建议分别5669>5573（+96）与6133>5572（+561），收到即通知用户，继续发送；所有原reported totals照录。两个连接共用API quota与至少3150ms，未突破daily /RPM，旧breached保持历史标记。
- 为继续偶发响应失败，sourcecf新增test-only completeness filter：raw response原样保存，空tool响应 /不完整JSON /不完整tool arguments允许最多两追加funded sends；不修内容、不重试有效baseline /tie /uncertain评分。一次response只计一个失败观察，header成功再改为body不完整，不重复统计；已确认最后两不完整响应重新分类为失败，持久最近20三失败 /连续2，原charges与quota不变，保留migration说明。
- 九项相关本地tests通过（retry7 /response2），五文件lint /diff通过；source `cf28cc3de`已commit /push，继续同一冻结RP proposal与原累计账本。native evaluator /case /生产预算gate不改；历史失败报告保留，新的完整结果仍待取得。


### 完整比较、连接失败与闭环补证（2026-10-08，最终实测）

- 完整comparison Tested HEAD `cf28cc3de0e8e11a57441f100d1f5e5034af72f8`；native evaluator revision仍为 `f8548173b8ffb754052ade6e5bef06dad046d76a01dce3af8c74c06a0c7d752c`。新增170sends /647103记账tokens，累计528 /2063603。两入口各三个原promotion场景×三次，九对 /18arm完整；共36arm的原authority /isolation /target_consumed checks全部通过，不导入旧partial拼资格。
- RP主模型：3candidate /4baseline /1tie /1uncertain；Project主模型：9tie。两入口均没有达到至少六对双模型一致candidate改善的工程门槛，RP明确存在回归 /不确定；没有为有效不利评分重试、缩减场景、改输出或将promotion输出输入候选学习。RP继续原付费冻结proposal，Project本轮独立提炼966tokens。
- 第二模型在RP独立盲评第一次槽位连续三次HTTP500，三笔unknown各1661 /共4983保留；按原频繁错误规则持久停止该连接。两入口均无成功独立评分，Project尝试与后续恢复在reserve前拒绝，没有隐藏发送 /洗掉stopped状态。主模型Project一次偶发transport失败保留4953unknown，追加funded send成功，后续完成全部九对；本轮其它主模型没有新失败。
- 超原累计1699536token建议时已即时通知用户并继续；累计513超过512次建议时也即时通知继续。含旧carry /未完成请求预留的首次token提示为1700347，后续按实际provider usage结算；不将该提示当作精确实际总量。API硬限没有触发，token建议没有阻止发送。
- RP已在cf实际完成私有fixture委托review publication /原下一Director四次真实send /exact target消费 /guarded rollback，`nextRunConsumed=true`、`baseRestored=true`；RP activation provenance保持client_observation。Project同source已完成review publication，但原下一Host请求未指定Route，而夹具同时保存两个模型的Studio Routes，报`native_generation_route_ambiguous`，当时没有activation send /rollback；这是本地执行配置缺口，不计作provider不稳定。
- test-only恢复入口只重开保存的Project夹具：原report /candidate /current publication核对，比较源与恢复源分pin，旧summary /charges /reports不修改，不重跑提炼、trials或primary grading，不重新发布。显式选择原Route；publication会增加Project binding metadata，因此核对exact已消费Prompt、model /connection /generation /resources与冻结trial配置，并用原publicationCurrent保护真实binding。模型 /Prompt漂移拒绝，不以忽略binding绕过authority。
- 7bb恢复先在配置检查处零send停止；57与4c恢复同为零send，私有边界诊断确认原GenerationService冻结secretPort后测试wrapper试图改写resolveSecret。最终c0使用稳定port与闭包选择已配置模型凭证，不改原生产Secret /gate。原三个失败恢复报告保留，累计528 /2063603未变；没有API错误频率重分类或额外付费比较。
- 最终Project lifecycle Tested HEAD `c0f8ce6b010677ba7c66e58aa7bede5816ee74af`，原cf comparison provenance独立保存；只新增1个实际Host activation request /204reported tokens。原Host记录exact snapshot /Prompt program和host activation，`nextConfigurationMatchesCandidate=true`、`nextRunConsumed=true`，guarded rollback后baseline settings hash复原。两入口真实私有闭环补齐，生产对象未修改，`automaticPromotion=false`，humanPreference仍not_observed /price unavailable。

| 本轮实际付费项 | requests | 记账tokens | 说明 |
| --- | ---: | ---: | --- |
| RP baseline trials | 34 | 153578 | 九对全部原多步发送 |
| RP candidate trials | 30 | 136067 | 九对全部原多步发送 |
| RP primary judge | 9 | 7101 | 有效不利 /uncertain照录 |
| RP secondary judge | 3 | 4983 | 三个HTTP500 unknown上界 |
| RP next Director | 4 | 18403 | 原真实消费 |
| Project extraction | 1 | 966 | 新冻结候选 |
| Project baseline trials | 40 | 159396 | 原完整九对 |
| Project candidate trials与一次失败重试 | 40 | 158421 | 成功report153468，另失败unknown4953；失败与追加均有独立charge |
| Project primary judge | 9 | 8188 | 九个tie |
| Project next Host补证 | 1 | 204 | c0恢复，原cf trials不重跑 |
| 合计 | 171 | 647307 | cf170 /647103，加c0 lifecycle1 /204；不宣称货币或净收益 |

### 最终预算、最小本地检查与集成结论

- 最终累计 **529requests /2063807记账tokens**，包含丢失旧guard historicalCarry252 /1000000；恢复期277sends，其中271provider_reported、6unknown共20542上界，pending0，旧breached=true历史标记保持。前轮HTTP524 unknown5389与c997 transport unknown5217未覆盖。用户最新授权期从332开始新增197sends /758091，超建议仅通知继续。
- shared quota aggregate carry332 +197实际admissions=529，所有新request IDs与同一账本一一对应；最短admission间隔3151ms、滚动一分钟峰值10、滚动24小时含保守carry峰值529，均满足2000 /20硬限。carry不是伪造旧timestamps或精确当天实际调用统计。两个owner所有attempts与共享账本id /tokens一致、无reserved；独占lock已释放。
- 私有comparison summary SHA256 `9df6bf648b7775e5c9a7ca2c9a417d168128d6cca7972c7c73bf4365ddcbb3e2`；最终Project lifecycle summary `25b2e01281521719dc3879f6c4954a742bf16eea36f9fc9e928eb07ce9d57b39`；累计ledger `50ee44cbde864fc03cf5e556f98018d2e6c048086c7803ed9d06fef271fbdab1`；quota `837f31d47ba55dea281c81badbbaded4328e78132c7c7f4e2afdb31d49f1a1c6`。详细audit私有保存，不提交connection /endpoint /credential /私有路径。
- 恢复相关最终 **2 distinct local tests passed**：冻结Secret port选模型 /unknown拒绝；保存Project重开、report tamper拒绝、双Route歧义零send、原funded evaluator /Host真实fake send、exact Prompt /model漂移拒绝、Host activation与rollback。最初funded fake测试遇fixture集中reserve的未来timestamps /10秒timeout，测试仅推进mock时钟后通过；实际账本 /rate时间未改。此前九项retry /response与19项budget /quota等证据保持各自source，不重复累加。全部本次触及文件ESLint /diff通过；没有full tests /build /新UI /Android /真机 /external DB /CI，不读reference。
- Product最终c0已commit /push，main `ed1fd90521a63363e29856601abbf5e908c99d10`未合并；集成仅核对本地actual refs /拓扑 /diff与identity files，产品完整包含main。Node20历史48tests /原worker loader对应原source，不能外推本次所有CLI helpers已Node20测试。五个protected dirty hashes与前序Record保留，未提交无关治理 /模板。
- **M1 pending /不集成。** 剩余是实际行为改善与可用独立第二模型观察；token超建议、用户不手测、闭环执行缺口均不再是本轮停止理由。不能通过重复有效负面 /tie评分取得资格，也不能把manual fixture publication计作automatic eligibility。下一仍仅M1，先复核候选设计与development /promotion隔离，以及第二模型连续500的连接问题；本阶段更新同一Record /live HANDOFF并停止，不进入S11 /G。


### 第二模型配置、诊断与临时候补补测（2026-10-08）

- 用户先将第二模型改为 `step-5-preview`，原URL /Key保留。test-only grade-only恢复原cf九对，只补独立评分；4项本地恢复tests通过，source `16b00c23167b032ee15ceb2eec1bbf418c35d69a` 新增三次HTTP503，每次unknown1656，共4968，累计532 /2068775。旧报告当时status误标independently_graded，实际零有效独立观察；后续 `ccfd4bbc1` 修正status判定，旧summary保留并在此更正解释，不能计为成功。
- 用户提供完整生成URL；核对旧 `/v1` 配置经原normalizer生成的actual endpoint已经一致，没有填错地址或重复path。私有配置保存显式完整URL，原model /Key不变。source `dcde7fdb4c0aa3f2e20bc7899c1a70093de9381f` 按用户请求执行一次独立funded diagnostic，无retry，不清stopped；HTTP503 body error code `model_not_found` 明确为Key所在group没有该model可用channel，不是由状态码猜原因。私有body /request ID保留，group /URL /Key不入Git；unknown1147保留，累计533 /2069922。旧Step连接四次503仍stopped。
- 用户更改server group并授权重试。source `119dfc32e82e9d2fecd024e6a19d8351c58626d5` 使用持久user-reported配置epoch，新窗口单独记录，旧Haiku500与Step503窗口保留；2项相关本地tests通过。新增三次均HTTP200，却finish_reason=length、content为空；provider每次报告prompt491 /completion1024 /total1515且reasoning_tokens1024。合计4545，累计536 /2074467；三次不完整正文停止该窗口，Project在reserve前拒绝。HTTP503问题已随实际group变化消失，独立grade仍未取得；未知费用没有改为零。
- source `907cf1e877e86988bdd1941f955e0741b89af769` 仅扩展私有independent grader为有限8192输出，沿原owner reserve /settle、compiler /resolver /provider与同一CLI累计账本 /quota，native evaluator /primary comparison /生产1024边界不变。付费报告pin新runner source，旧cf native revision保持。新增本地2个grader cases覆盖8192实际wire、发送前durable reservation、reported /unknown结算、非法arm /篡改max_tokens零send拒绝、原native仍拒绝8192；原epoch两项加output-fingerprint一项，共2 suites /5 distinct tests passed。首次fake response遗漏ok字段致成功case失败，补全fake HTTP contract后定向复核通过；5个触及文件ESLint /diff /staged diff通过，没有full test /build /CI。
- 用户提供MiniMax订阅Key，并明确只能作为临时候补，不可用就继续原第二模型。Key与独立临时配置仅私有600保存，默认Step URL /Key /model未被替换；CLI显式temporary-secondary只可配合grade-only。依据[MiniMax官方OpenAI文档](https://platform.minimax.io/docs/api-reference/text-openai-api)选择订阅模型 `MiniMax-M3.1-Flash-Preview` 与官方国际OpenAI兼容接口，不将厂商建议上下文 /tokenizer等冒称已验证。原配置context /tokenizer仍为显式有限测试设置。
- 临时MiniMax只发送一次实际独立judge；HTTP401 body `invalid api key (2049)`，认证立即停止且不重试，Project在reserve前拒绝该连接，无有效grade。仅证实此次国际接口认证失败，不推断Key在所有区域无效。unknown8830完整预留，累计537 /2083297；私有原报告与错误body保留。按用户指令立即回到Step，不自动探测其它区域或更换永久第二模型。
- Step沿原同一URL /Key /model，仅将独立grader output1024改8192，私有旧配置备份；actual配置window追加output fingerprint且持久化，旧三个reasoning截断失败不清除。同一新配置restart复用同一window。只补原cf各九对独立评分，原有效primary不利 /tie /uncertain未重试，未再发布或生成候选。



### 独立评分完成与本轮最终结论（2026-10-08）

- `907cf1e877e86988bdd1941f955e0741b89af769` 的Step补测新增18次send /43794reported tokens：RP九项27058、Project九项16736，全部HTTP200 /完整评分，无新retry或接口错误。RP第二模型4candidate /3baseline /2tie，与冻结primary一致candidate仅3对；Project第二模型9tie，与primary9tie一致但candidate胜0对。两入口均independently_graded，独立观察缺口已补齐；RP仍回归 /dimension负值或分歧，Project仅平局，M1行为门槛仍未通过。
- 最近529→555累计新增26次 /63284tokens：四个Step503 unknown6115、三个reasoning截断4545reported、一个临时MiniMax401 unknown8830、18个有效Step grade43794reported。原HTTP500 /其它旧失败未知费用均保留，不用成功report覆盖失败，建议超额提示已通知并按授权继续，没有模型货币成本或净收益声明。
- 最终累计 **555requests /2127091记账tokens**，含historicalCarry252 /1000000；恢复期303实际sends，其中292provider_reported、11unknown共35487预留上界，pending0，历史breached=true保留。quota carry332+223admissions=555，所有id与共享ledger一一对应；minimum3151ms、rolling一分钟峰值10、保守rolling24h峰值555，满足2000 /20硬限。实际两owner的独立grade chargeId /requestHash /snapshotHash /tokens均与共享账一致，无reserved，独占lock释放。
- 最终Step summary SHA256 `268a887448ad67d4fca54a30d809222659a67050920d0b90adc9dfaf666386c1`；临时MiniMax summary `5a0f74e4c1f670e56d6553457f45d1ba81033b54ccbe9bbf03fb3a1b33a2166b`；group更改后1024截断summary `df0d240fdf45b6243c80e05bedef8dd2c65291fc71749157071ff8b5578ebb84`；此前Step503 summary `ad22e8e29329ea035759cb8d625943fbd75b25cbc1d6a395d5276c5ba3352731`与单请求诊断 `6c134ac1e5b63e960334488477d10d18466278bdb90bbb76cc38e287f6c2132a`保持。
- 最终ledger SHA256 `1d383c311e34c0b10186cc311d6c9107e3cdf55887bbd32fc540d558307e9c70`；quota `67804494ee460c3f0e4cdf071a5e6679bad9ca49b6bf27ea05dee87c839b757e`。原cf summary `9df6bf648b7775e5c9a7ca2c9a417d168128d6cca7972c7c73bf4365ddcbb3e2`、两个candidate.report exact hash与native evaluator revision均不变，没有human字段或原primary observation改写。私有累计audit与历史audit分别保存，旧529 /532 /533记录不覆盖。
- Product `907cf1e87` 已commit /push且clean。本地核对main `ed1fd90521a63363e29856601abbf5e908c99d10`为产品祖先，main...product为0 /35；没有集成，因为M1行为门槛失败。阶段最小检查为上述5tests /触及lint /diff，以及既有grade-only恢复4tests；不将历史suite的通过外推新CLI完整覆盖。文档只更新同一Record /Plan /live HANDOFF，五个protected dirty SHA256与前序完全一致，未读写reference，未运行full test /build /CI /UI /Android /真机。
- **M1 pending，仅余行为改善门槛；不合并main、不进入S11 /G。** 第二模型已可用且完整独立评分，不再把API故障或用户不手测列作当前阻塞。后续若继续，只在既定development /feedback范围复核候选设计、保留promotion隔离，不重复当前有效不利 /tie评分追分；任何新候选按正式M1比较计划另行冻结和记账。本轮到此停止。


### 有限 M1 优化周期与授权8000提炼补测（2026-10-08—09）

本轮只执行一次优化周期，M1未通过；不合并main、不进入S11/G。初始actual product907cf /docs994cd与555/2127091相符。原九对/36arm、Step18项观察、cf/c0私有发布→实际消费→rollback保持历史来源，不借给新候选。本轮实测仅development与一次尚未完成的Project提炼补测，没有新的九对独立验收或新候选闭环。

- 用户指定的新私有目录已拉取`Atria-Dev`的`migration/private-state`，只恢复当前任务需要的Document内容；42顶层与2658展开文件逐项hash验证，共2700文件。未执行会创建其它长期工作空间的完整restore；分支verify脚本曾遇本地权限/读错误，不称完整verify通过。原排除Git的凭证、报告与累计账本映射到本地private目录，Windows ACL限制当前用户并正确继承；不输出/提交密钥，不读写reference。产品沿原feat/agent-intelligence-runtime，docs沿原计划工作树，五项无关dirty文档保持字节hash，稳定main未改。
- 根因材料来自development和公开feedback：旧RP候选把承诺时间当现时、在未建立时钟时声称midnight并与before midnight矛盾，把玩家pause解释为心理犹豫。旧Project候选只重述authority，authoring计划缺明确human-review说明；conflict候选多次catalog/api_read后仍planning，没有完成原revision冲突路径。反馈过于概括，诊断此前不能给出具体触发/行为修正；本轮通过原Experience correction→reflection→diagnose，再经原configure重验同一target（correction会原样pause）送入提炼，未建立平行authority。
- 最小产品修复：提炼指令要求具体失败/触发/最小修正、保留无关base、反例和收益依据，不把反馈或私有事实当authority。Project原评分仅看最终source JSON，过程改善空间被遗漏；现在同时暴露原task计划、状态、验证、repairRounds及公开assistant/tool/error轨迹，维度仍为intent_completion/conflict_handling/repair_quality、解释与门槛保持。development实测显示旧候选确实无效且有回归，不能把全部旧平局单一归因于评分缺少空间。
- 同一Plan正式冻结synthetic:v2 promotion，六场景家族/三场景×三次/每入口九对、双模型至少六一致候选胜、其余一致tie、重要维度无回归及所有authority/消费/闭环门槛不变。development保持v1，并永不计未见验收；尚未发送v2。旧报告source/revision/hash完整保留。
- 新RP只付费提炼一次，原base保留，仅补承诺时间与现时区分/最新可见修订、玩家pause中立与不臆测心理两段，exact body hash `e9ad8939cf49737ccd0c23ff7b4585bb45e02221a424fa033ee0f57757698fe1`。新development agency主模型candidate，memory主模型baseline；variant主模型candidate但continuity delta=-1，偏好与维度不一致照录、不修解释、不追试。三项6arm原checks全部true，配置各arm跨来源相同；只有前两pair在37e、variant在9f，分别列case来源，不伪造同源完整host report。新RP没有有效Step观察，不能称可信双模型改善或冻结合格。
- 第一次baseline RP三对双模型完整，但一致候选胜仅1/3，memory第二模型判baseline/-2 knowledge boundary。Project-only续接只补尚无有效pair的Project：authoring/conflict两对主模型均baseline，conflict原checks也失败；repair无有效pair，Project无有效第二模型观察。两partial只用于诊断，不计完整baseline/验收，不重跑旧候选或已有效评分。
- bounded恢复修复Windows loader file URL、HTTP200 header后body timeout的单次失败归因、DOMException numeric code包装，以及只续接unfinished development slots。每attempt仍原Route四分之一/最多80秒、最多两追加funded sends/10秒backoff；原300秒Route不改。transport checkpoint从555原始私有snapshot按79实际ledger/raw responses精确重放，替代两次此前无request-ID的歧义手动重分类，旧state/手动备份/重放audit全部另存。失败、unknown、费用和历史stopped窗口不清除；当前连接停止检查不被旧临时候补窗口误挡。
- 9f的新Project提炼连续三次HTTP200但`finish_reason=length`且JSON截断，均请求1024，provider每次prompt644/completion39—41/total1664。每次完整记账1664，不用小分项覆盖total，不修复或接受截断value；差值1024吻合输出限，但本次无reasoning breakdown，不能断言隐藏部分确切组成。三次不完整按原规则停止primary。Step一次HTTP404，unknown8741保留，配置错误立即停止；未保存error body，只能确认404，不能把旧group诊断套用于此次，也不能声称已验证model/channel根因。
- 用户随后明确将截断响应输出上限提高至8000；同一Plan追加单次Project extraction-only补测。test-only沿原compiler/resolver/provider与原owner reserve/settle，冻结提炼快照和wire max_tokens=8000；新持久extraction-output:8000窗口只代表实际输出配置变化，旧1024 stop和Step404窗口保留，同配置restart不换窗口。production/native comparison1024边界不改，没有重试旧有效评分或Step404。该补测f6ac一次成功，finish_reason=stop、JSON完整，usage prompt641/completion139/total1673，按total照录，无retry。
- 新Project提案针对直接使用已提供contract、明确review状态、只stage请求变更、revision conflict即停且不silent rebase，包含缺contract/schema错误时允许targeted lookup的反例。value hash `40744a932718465fbb10cb3f81625771c78ca4faa2aabb36e156d47b029924aa`。目前只保存为proposed/not_validated；提案没有原`Original style.`文本，必须在下一明确有限周期检查base保留与development回归，不能冒称最小局部修复已验证。原comparison窗口和Step仍stopped，本轮不送新trials或promotion、不借旧闭环给新提案；该summary unavailable/evaluation_unavailable表示未完成比较，不表示这次提炼失败。
- 9f immutable summary的RP status误为development_observed，实际Step观察unavailable；在此更正为development_incomplete，旧summary不覆盖。最终helper6c以后按有效charge/preference判断status。零send prepare在6c两入口prepared，仅说明准备快照合法，ledger/quota/rate/transport四文件字节hash前后不变，不表示API可用。

| 本轮来源 | 实际requests | 记账tokens | 范围 |
| --- | ---: | ---: | --- |
| 2b59d768c | 34 | 133958 | baseline RP与Project未完成起始 |
| 77e0ea388 | 26 | 104961 | 仅Project旧候选development partial |
| 37e068fcd | 19 | 72622 | 一次RP提炼及两项有效development |
| 9f3d8d097 | 12 | 43591 | 仅缺失RP variant、Step404、Project三截断 |
| f6ac0ff7e | 1 | 1673 | 授权8000，Project提炼成功、未验证 |
| 合计 | 92 | 356805 | 所有失败/retry/unknown原样入账 |

最终同一账本 **647 requests /2483896记账tokens**，旧carry252/1000000与breached=true保持；395恢复实际sends，379reported/16unknown65117，pending0。新增unknown五笔29630（567/589/615/634/643），旧unknown35487保留。quota carry332+315admissions=647，IDs一一对应，minimum3151ms、rolling一分钟峰值10、保守rolling24h峰值647，满足2000/20硬限；本轮92个owner attempts与共享ledger id/tokens全部一致，无reserved，lock0。建议超额已即时告知并继续，未拿建议预算当停止理由。货币费用仍unavailable，未声称净收益，humanPreference=not_observed，production human/price/budget gates保持。

本轮各immutable summary SHA256依次：

- 2b59 `4a986c2632e487568f6948f0519faaba759fb11653d5374fa4744e2e3eb66fe8`；77e `959c335793f8da9f30112e096a8ce6f49edfe0869d13b5f64628672e373605f3`。
- 37e `b38d18e4be444769bc692e67f3709e5306be795f1870bb06a0910ee39db2b8b1`；9f `5a0c71de6673c7146fe8556fea553bb80b508b241b85e199c74a07862523b900`。
- f6ac `c85f96dfdcb3be674a79d323f8cf01aa74b49f2db2c92b93259f41f3fbd4d235`。最后ledger `39015979c99867b47c953d2afeb0429d91327938916e865a186ec11cf4a80c96`；quota `342996d457fab361eb2d81f43bc7068a055ef7766a5b75ff9fd2c775da3d800a`；transport `7adbd28e2cc72b46ca79d385a417095e828df1bf042cc6d1ede7b2a54192bbcd`。详细92-send owner/quota/rate及全部source audit私有另存。
- 原cf `9df6bf648b7775e5c9a7ca2c9a417d168128d6cca7972c7c73bf4365ddcbb3e2`与Step18 `268a887448ad67d4fca54a30d809222659a67050920d0b90adc9dfaf666386c1`summary hash保持，旧report/source与replay备份不覆盖。

最小本地验证按source：consumer6项、acceptance5项、evolution41项（FS25/SQLite16）、retry7项、body-timeout1项、development selection1项，共前六suite61 distinct tests通过；本次输出改动grader suite3项通过（原2项资金结算、新1项原提炼wire8000/旧stopped保留/配置不变），本周期共7suite64 distinct tests。首次缺SQLite native binding、Windows loader错误、fake fixture旧名称及DOM wrapper问题均保留失败经过，必要局部修复/实际rebuild后只重跑相关部分，不称初次全通过。触及ESLint、node syntax、diff/staged diff通过。没有full tests/build/CI、新浏览器UI、Android/真机或外部DB验收。产品最终`f6ac0ff7e79c55674e3fe226d8a122c4af9acad4`已commit/push，main仍`ed1fd90521a63363e29856601abbf5e908c99d10`；保持任务分支，不集成。

本轮到此停止。下一接手先核对actual refs、同一647/2483896 ledger/quota/windows与新提案来源；当前primary comparison1024三截断stop、Step404需要真实配置/诊断证据，不能清window、自动换epoch或靠output变更重试404。输出最大8000的用户约束适用于后续新请求，旧8192评分仍保留历史source；如后续改变比较envelope，先正式更新同一Plan并重固定source/configuration，保留已有效不利development评分，不冒充新验收或追分。仍仅M1，不进入S11/G。

## Final state

一次有限优化周期收尾，M1仍pending。具体development失败已定位，原反馈→诊断→候选链路与Project公开过程评分面最小修复已推送；新RP有主模型回归/评分不一致且独立观察缺失，新Project8000提炼成功但未验证。没有新的完整九对验收、冻结合格候选或新闭环。原九对/36arm/双模型和cf/c0闭环保持其独立历史来源；原M1行为门槛未通过，main未合并。累计647/2483896、unknown16/65117、pending0、lock0，原API硬限audit通过；用户无需手测。最终product f6ac，同一Record/Plan/live HANDOFF更新，保留两实际停止连接和一成功8000提炼窗口，下一仍仅M1。
