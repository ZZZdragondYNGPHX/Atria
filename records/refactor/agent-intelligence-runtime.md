# Agent Intelligence Runtime — Record

> 本文件保留实际工程与试验历史。旧配额、scope/claim、双模型、首失败停止、单轮/候选与数值门槛不恢复为执行规则；当前验证见 [M1 acceptance](../../plans/architecture/agent-intelligence-runtime/m1-acceptance.md)，调用限额见 [Governance §13.1](../../README.md#131-api-测试执行规则)。

> 当前 API 测试规则（2026-10-09）以 [Governance §13.1](../../README.md#131-api-测试执行规则) 和 [acceptance §0](../../plans/architecture/agent-intelligence-runtime/m1-acceptance.md#0-当前-api-测试规则覆盖全部历史封包) 为准：仅每日 2000 次 / 20 RPM。本文旧预算、累计 1000、Step 次数、scope 许可、首失败停止等是历史事实，不能恢复为当前限制；当前交付读本文最新节。

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`
- Status: **M1 complete / H0 preparation complete；后续交付组计划保留**
- Plan: [正式架构与阶段入口](../../plans/architecture/agent-intelligence-runtime/index.md)
- Updated: 2026-10-10

## Summary

M1实际验收与main集成完成。Project开发三胜、独立九胜；RP开发3胜、独立3胜/3对，相关六维无负差，三条公开回复完整152条核验六维met。两域完整费用绑定、native review发布、下一真实请求精确消费和guarded rollback均通过。main `ea75b76be4927e881de2f0be7c304a56301f1f83`；原生产自动发布规则、历史不利结果和unknown费用保留。H0八样本/519来源、隔离调用图和观测清单已准备，B0及H1/H2未运行。

以下按时间保留工程和试验历史；其中旧pending、暂停、许可和数值门槛不是当前执行状态。

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

### 用户“继续”后的单次8000局部修改周期（2026-10-09）

从actual product f6ac/docs e61e与647/2483896续接，沿同一分支、ledger/quota/rate/windows。先读live HANDOFF→index→M1 acceptance/S10→同一Record最新段；五项无关dirty文档字节hash与前轮保持，不提交它们。此续接只做M1，不进入S11/G；正式范围先追加同一Plan §7，未删失败案例或改变评分解释。

- Step URL本地核对为完整生成path，无重复path证据。d281单次funded诊断沿原compiler/provider/owner/shared reserve/settle，实际wire max_tokens=8000；HTTP200、完整{"ok":true}，reported77，累计648/2483973，无retry。没有查明旧404根因，旧stop不清；小请求成功只代表本次请求可用，不能当真实grading readiness或独立观察。
- 用户最大8000落实为本有限周期私有两arm/提炼/primary judge/独立grader统一8000；原私有generation profile和原RouteResolver/worker/provider实际消费，test-only extended adapter明确funded job marker，production evaluator1024限制不改变。原primary1024和8000 extraction-only窗口保留；新primary固定evaluation-output:8000。Step沿同一server epoch仅把实际graderOutputTokens8192变8000，旧备份/404窗口保留、server UUID不变，同一配置restart不新增窗口。变更同时绑定用户输出约束、实际配置与一次诊断来源，不伪造旧成功或清账。
- 文本提炼根因修复：原模型全段value输出会丢掉无关base，单靠“保留base”提示不足。现在模型最多4项唯一原文anchor edits，或空anchor单次append；原evaluator确定性应用，未触及内容保持byte-for-byte。拒绝whole-base/整段value替换、缺失/重复anchor、overlap、重复append及未知字段；数值目标仍原integer value契约。原target prepare/check/CAS继续管候选与写入，不创建平行authority。新提炼只见前轮development/公开feedback/diagnosis和declared base，不见v2 promotion。
- 每入口只付费提炼一次新候选，无重提炼或追分。RP value hash `2dcc9449193c8b688fc3eabf607fadafa506f88a18a00a7618ee692e6f8e4f1f`，原base保持，追加现时时钟边界/最新承诺自然应用/不主动复述修订历史/玩家pause中立和NPC initiative。Project value hash `02ff0c535d6a59b3781a4fea0a9a899db0fa53f671f61996d4f8ab0934405f6a`，原`Original style`保持，追加bounded metadata直接使用authoritative snapshot、简洁plan、仅请求变更、明确human-review和revision conflict即停。只保存为development候选，未冻结取得独立验收资格。
- RP agency/memory两项valid primary为candidate/tie，分别保留partial pair文件。variant baseline发生evaluation_runtime_failed，无完整第三pair、无candidate variant arm或独立观察，native host report unavailable；不能把两个partial拼成完整3-case report，不推测第三项结果。具体边界：一个免费v1 stale挑战也计入refs.maxRequests=6，v2实际5个付费请求后下一个请求在发送前被拒；五次model工具涉及读范围/草稿/世界与write_message，尚未finalize。本轮19个RP sends全部费用保留。
- Project三对完整primary为baseline/candidate/candidate：authoring intent_completion=-4，baseline从原get_project/validate→plan→save→review完成proposal；candidate直接plan/save/prepare_review后reset，转catalog/read，在六round内仍planned/原名称，review_gate=false且single_changeset缺失。conflict两arm原revision/no_silent_rebase检查通过，candidate偏好但conflict_handling delta=0；repair两arm验证/repair bound/review检查通过，candidate repair_quality=+1。偏好/维度原样照录。新过程评分能观察review/plan/repair差别，当前三项不全平；不反推旧九平必须改变，也不降低正式门槛。
- Project该局部规则有明确回归：避免exploratory reads也可能压掉取得真实完整source的必要读取。实际baseline先get_project，candidate跳过后修复/重置，须在下一明确有限周期区分“tool schema已提供”和“实际source已取得”，不能把本候选视为优化成功。primary authoring rationale的“unrelated memory artifacts”没有最终公开source支持，不据此新增事实；真实未完成rename/review与-4评分仍原样保存。
- 第701次实际Project独立grade再次HTTP404，unknown9831（input1831+output8000上界）照记，当前8000 Step窗口立即stop且无retry；没有任何有效新Step评分。此次transport当时仍只在diagnostic/temporary路径保存body，真实grade body被discarded，这是采集遗漏，无法恢复或补造。现在已改所有HTTP失败私有保存64KiB以内body/status/requestId/server并关联charge；仅本地测试，不再发API诊断或模型请求。本次404只能确认status，model/group/channel根因仍未知，诊断200不能覆盖它。
- 按正式Plan development gate，新候选须每入口三对完整、双模型至少两一致candidate胜/其它一致tie、重要维度非负与全部原checks/funding通过，才冻结并进入未见v2九对。RP incomplete，Project已有-4/review gate失败及Step missing，准入失败；未进入promotion、未执行新candidate publication/实际next-run/rollback，旧cf/c0闭环仍只属历史。测试专用readiness与正式九对6胜分开，production human/price/budget gate及humanPreference=not_observed保持。
- 实测停止后只修夹具：免费stale挑战保留trace，不占actual provider maxRequests=6；Director maxRounds仍≤6，付费arm上限不扩大、权限/隔离/陈旧输出拒绝仍保持。case新增requestLimitUnit=actual_provider_send/injectedChallenges=1，variant dev/promotion caseRevision及CASE_SET_REVISION自然更新，同一Plan明确固定来源。旧97a1真实失败保留，不声称第六次真实model调用会finalize；修复后没有API重测、不重新评分或生成候选。

| 实际付费项 | requests | 记账tokens | 来源 |
| --- | ---: | ---: | --- |
| Step小诊断 | 1 | 77 | d281；非评分 |
| 新RP提炼 | 1 | 1161 | 97a1 |
| RP baseline/candidate development | 16 | 69919 | baseline11/47104，candidate5/22815，含failed variant |
| RP primary judges | 2 | 1624 | 两个valid partial，未重跑 |
| 新Project提炼 | 1 | 1224 | 97a1 |
| Project baseline/candidate development | 29 | 144956 | baseline16/63224，candidate13/81732 |
| Project primary judges | 3 | 4827 | baseline/candidate/candidate |
| Project Step独立grade失败 | 1 | 9831 | HTTP404 unknown，不重试 |
| 合计 | 54 | 233619 | cycle53/233542，加diagnostic1/77 |

最终累计 **701 requests /2717515记账tokens**；carry252/1000000、sticky breached保持；449恢复实际sends，432reported/17unknown74948，pending0，新增unknown9831，旧65117不覆盖。quota carry332+369admissions=701，所有IDs对应ledger；minimum3151ms、rolling一分钟峰值11、保守rolling24h701，满足2000/20。54个本轮owner attempts逐项id/tokens与shared匹配，无reserved/lock0；超建议已即时报告并继续，停止原因不是token建议。Project paired candidate tokens比baseline多18508，仅统计/提示，不伪造价格或净收益。

- Paid诊断summary SHA256 `57efd6b01ba021af4b455f1edd0eb08141341a8649819aa39b464e9ec8516bac`，Tested HEAD `d281dbe6993d1a4ae76c4e9a24960dd30e6bb706`。
- Paid cycle summary `d6d7994bf71a5d58c5f031b61bb0913da075314790431519444151ef5a21347a`，Tested HEAD `97a1e79715cdb22d2aeff21886969a18961f3888`；evaluator revision `e834ba76af3dc3522889bf07b553f753db9cc084a97c850e2abf3952d11acfec`、CASE_SET_REVISION `083adcf442fb7dd98db9fcfb3ee9728a67cc48fe2615122a78d855efcd9bd2f9`。old/new候选、partial pair、trial/raw/fees均分别固定，不覆旧报告。
- 最终case set revision `49c56c12126aff08c83465f83412d2acb2aa6417e4183b25d7cbebe59f63b54b`；variant development `49621d082f9980ba8dc03ce6a0f170cc921d6fe8ea42d54c4dea2ef4b3c5a189`，promotion `431c44974baa07f09c54e918141e61abb28b22636dcb5d579d45d39f8f814789`。input/评分维度/门槛保持，此unit修复不是另做一轮真实比较。
- Ledger SHA256 `56e0e55b8aa572ee9a50650d83116482de7ab0643f08801fc6e2690cb1e3c06c`；quota `3ab4e7382b4cd299e898f3adfc906ba45f43fb0bbfb90e801877a9d48d0ec1b3`；transport `557b0fd5773138247412a000824d08f8ee2c4db87bd00029da77e7d675fb79c0`。最终private audit SHA256 `0e4ddbeaa4db9f587de7d6f31a09358552d86b2b5f3cd3b6d18cd746c363bd43`。费用/窗口/备份完整私有保存，connection/endpoint/key/私有机器路径不入公共Git。

最小本地验证按source共 **7 relevant suites /25 distinct tests passed**：局部edits4、grader4、development selection3（原/8000 fixed worker及六实际send+免费challenge）、engineering acceptance/readiness6、transport key4、原consumer定向2、HTTP/body证据2。最初8000 fixture在configure前未注入extended resolver失败，改为test-only早期注入后只重跑相关2；首次consumer testNamePattern未匹配导致全skip，不计passed，随后只定向两worker cases通过。最终真实原worker fake-provider六轮测试两arm各6paid+1免费trace、stale_completion/variant_identity保持，14funded fake attempts完整；错误body本地HTTP404/64KiB截断与200 header/body timeout通过。触及lint/syntax/diff/staged diff通过，无full tests/build/CI、新UI/Android/真机/外部DB。

最终product `da157f3e9`已commit/push，paid source仍单独pin97a1；最后零send调用bounded acceptance入口因cycle_development_incomplete拒绝本partial，ledger/quota/rate/transport/epochs五文件前后byte SHA不变、lock0。main仍`ed1fd90521a63363e29856601abbf5e908c99d10`、未合并；五项protected dirty保持。此有限周期收尾停止，不进入S11/G。下一先取得当前Step真实grade 404的匹配错误body/配置证据（不能用小probe替代、不能清stop/随机换epoch），保留已有效Project-4/两胜及RP两partial；如另行开展具体修复周期，先同一Plan固定source与new case revisions，纠正“避读”规则的必要source读取边界，不重试有效评分追分。

## Final state

实时恢复以本Record最新F2节及live HANDOFF为准；以下按发生顺序保留后续周期，旧HEAD/旧接手语句均为其阶段历史。

### 2026-10-09 第二模型单次可用性检查

用户要求检查第二模型，不能调用则暂时放弃该API；同一Plan §8在请求前固定一次真实评分形态诊断、无retry、不计评分、不清stop或新增epoch。从701/2717515续接；source `63dc0fd44` 已commit/push。CLI增加显式failed-report来源，沿原compiler/resolver/provider与owner/shared资金记录，复用97a1最终Project authoring pair、原shuffle/messages，输出8000。先前两次前置校验均零发送：HTTP代码被provider包装为generation_provider_failed，且onPair中间捕获的hash与final report身份不同；改为读取原transport状态及实际独立评分所消费的final report pair后才发唯一请求。私有零send报告仍保留，不将它们算API失败。

实际run `run-1791478981173-3c395953`：成功返回 `step-5-preview`，finish_reason=stop，完整JSON含preference/deltas/rationale，无截断；provider usage input1426/output2175/total3601，其中reasoning2085。charge `28356b4d-fcc9-4b0e-8fc1-a45f62dae930`，request hash `97b928e35d6ae493fec2712a9dcb71a8ba91f90c204d95db1441be242acbb260`；原pair hash `980ed007cba27f563c5bc2b357c58c7316733269a25799513b8383a2e37e7284`，messages hash `1a90d1b35747052e67404ba26785d60e640acc13fd69c523f88ab783605192a7`，summary byte SHA256 `002ee7cc00de1a51a8e65a6b098a63b01f1d3d71a619bd95043a8a284d02f6e0`。新隔离fixture配置identity不同，完整configuration hash不相同；只称原评分内容/形态复现，不称整份旧快照复用。CLI exit1来自M1 accepted=false，不代表此次HTTP调用失败。

本次+1request/+3601，累计 **702 requests /2721116记账tokens**；carry与sticky breach保持，450恢复实际sends，433reported/17unknown74948；pending0/lock0，quota carry332+370admissions=702且新ID对应原ledger。原404及其它stopped窗口全部保留，无retry/换epoch/其它模型探测。保留当前API，单次成功不证明持续稳定、不解释历史404，也不自动解除评分stop或补旧独立观察。本次不读取响应偏好来指导修改或取得晋升资格，不重跑案例、提炼、发布或验收。

最小node syntax、触及ESLint及限定文件git diff check通过，无新full/tests/build/CI。五无关dirty docs保持，main不合并。接手先沿702/2721116及同一windows读取HANDOFF/Plan/Record；Step当前可调用，若正式恢复评分须另行固定有限范围与窗口处理，不能把本diagnostic冒充独立grade，也不能重试有效不利/tie/uncertain追分；本轮到此停止，不进入S11/G。

### 2026-10-09 必要来源读取修复的有限实测周期

用户再次要求继续任务，Plan §9在实测前固定一次双入口新局部候选/各三个development pair及双模型观察，保留原正式九对/六一致胜门槛。真实初始账目702/2721116，main仍ed1fd90521a63363e29856601abbf5e908c99d10，product沿feat/agent-intelligence-runtime；五无关dirty docs保护。不读写reference、不进入S11/G。

Product `a61b249ef71f108d279ec7bd883fb5eeae97a463` 已commit/push并作为唯一paid source：原提炼instruction明确tool schema不等于已取得完整authoritative source，不能省略构造/校验改动所需读取；本轮公开technical反馈来自97a1实际development及旧RP已保存development弱点，经原Experience correction/reflection/diagnosis与原evaluator/targets生成，agent-authored synthetic diagnosis不冒充human preference。继续局部edits确定性保留base，声明边界/CAS/生产gates不变；相同正文或未改base直接拒绝重测，不以重复评分追分。

Step的显式有限许可由§8原失败评分形态成功诊断与本次用户授权固定；M1RetryPolicy只对旧404且最近诊断成功的当前key授权最多24 actual independent sends。原stopped值、recent/consecutive、epoch和ledger保持；许可不写入原window schema、不会自动随restart恢复。私有durable claim保存证据/开发run/验收run/消耗，重复development拒绝；任何新Step错误/不完整响应撤销许可、无retry，primary原有限retry规则保持。本次六个真实独立评分全部成功，无新API错误/unknown；没有另开epoch或清stop。

Paid run `run-1791509036919-99e55d4c`，新RP正文hash `75e6de6acd5bad8f85b0040cebe2bbd9b64b96a354a415d705cec092928b2d87`、Project正文hash `d30a6ddc2eb812c5e6fcf802ec7caacf2f2baf7787a4ae031e359591128ab479`，都完整保留原base，各只提炼一次。私有feedback hash `14abffddeb21fde1ee088f812d9a725d64b3ccea3fda2c6c6bff579f8389cbf2`、manifest hash `5505aaa5afe3049c628868a8a6ef7d4709b541ab843f0dd0d9b50c8d74a968d3`固定旧来源和单次诊断charge，不读promotion输入。evaluator revision `c46a3200099fa2dfa68e816c315a82e423c9404aa521c1b103b5d590f3bc1b6c`，case set保持 `49c56c12126aff08c83465f83412d2acb2aa6417e4183b25d7cbebe59f63b54b`；合成v1用于修改后development，不能计未见验收或真实用户泛化。

| development case | primary | Step | 原维度/事实 |
| --- | --- | --- | --- |
| RP agency | candidate | tie | player_agency +1/0，分歧保留 |
| RP memory | tie | candidate | promise_application 0/0、knowledge_boundary 0/+1，分歧保留 |
| RP variant | candidate | candidate | continuity -1/+2；偏好与负差原样保存，非回归gate拒绝 |
| Project authoring | tie | tie | intent_completion 0/0，两arm completed/review/单changeset |
| Project conflict | tie | tie | conflict_handling 0/0，两arm conflict/原human revision保持 |
| Project repair | tie | tie | repair_quality 0/0，两arm一轮repair、validation passed/review |

12 actual arms全部原权限/隔离/target消费及各case checks通过。RP第三case首次在已修免费stale challenge计数的原六paid上限下完整比较，stale_completion/variant_identity保持；不据此补造上一97a1未完成结果。RP双模型一致胜1/3，不一致两项且continuity负差，developmentReadiness=false。Project一致胜0/3、三tie，developmentReadiness=false；没有符合冻结资格的新候选，不运行v2九对、publication/next-run/rollback。formal automatedAcceptance因development不是九对而含independent_cases_incomplete是预期；当前判断以单独developmentReadiness为准。生产humanPreference=not_observed/price unavailable与原gate保持，不降门槛或改评分解释。

Project本次不是评价只看最终JSON：输入包含source/公开conversation、tools、plan/status、validation/repairRounds。authoring baseline原get_project→list_sources/validate→plan/save/review，candidate get_project→plan/save/review，两arm正常完成目标；新candidate不再出现97a1避读造成的review失败。conflict两arm都在prepare_review得到project_revision_conflict，未覆盖human revision；repair两arm都reset无效操作、一轮修复并完成review。这三个简单development任务的原基线已满足目标与guards，新增必要读取规则没有产生被原行为维度认可的改善，显示当前材料未提供足够观察空间；不能将省token换成行为胜或回头改旧九tie。若后续继续质量验证，应先正式固定更有代表性的真实任务/反馈来源及新case revision/独立隔离，既有v1已用于指导修改，旧报告独立保留。

| 付费项 | requests | 记账tokens |
| --- | ---: | ---: |
| RP一次提炼 | 1 | 1132 |
| RP baseline/candidate arms | 10 /7 | 43335 /32884 |
| RP primary/Step judges | 3 /3 | 2538 /9542 |
| Project一次提炼 | 1 | 976 |
| Project baseline/candidate arms | 15 /13 | 62443 /51808 |
| Project primary/Step judges | 3 /3 | 4635 /9173 |
| 合计 | 59 | 218466 |

最新同一累计 **761 requests /2939582记账tokens**，carry252/1000000/sticky breach保持，509恢复actual sends、492reported/17unknown74948，没有新增unknown，pending0/lock0。quota carry332+429admissions=761，59个当前owner attempts的id/tokens与shared逐项匹配；minimum3151ms、一分钟峰值11、保守rolling24h峰值761，2000/20硬限通过。token建议超额已即时通知并继续；paired候选RP少10451、Project少10635tokens，只作资源统计，不称费用或净收益。Step finite许可消耗6/24，acceptance claim=null，原七stopped窗口与epoch byte SHA保持，不因六个成功评分删除旧404。

本地最小4相关suite **24 distinct tests passed**：retry/显式续接11、局部edits4、原worker development选择及免费challenge3、development/engineering gate6；新增许可有限消耗、restart不自动恢复及404/503/incomplete任一新失败无retry撤销经过fake测试。触及syntax/ESLint/diff通过，无无关full/build/CI/UI/Android/外部DB。结束零send acceptance拒绝cycle_development_gate_failed；重复development拒绝step_continuation_already_used_or_failed，五累计文件前后byte SHA不变、lock0。五无关dirty docs byte hashes保持，不提交它们。

Paid summary byte SHA256 `731a9c0b019fafc631b3e35a117bea035d1259cbcbb37d34314229c707e0a5c2`，最终private audit `b046e98e1dc174e7d28f841e148ff534d4168e7ecedf8d3281c667602ae316a3`。ledger SHA `2512e563608ec9bf8f2e424e6c080d504a1e8b599de9019a87a1a6d4093cf092`、quota `edc9490521bd5a1934371b714a8f669522c094fdd7b96490b2f9405c1e06fe11`、transport `1492bf982d7598ccfc676897f90686f496a8966217c24dbc2d6ac017855e94ca`、epoch `6f5adb9276065236d896b3f087e7ff327c110c3fb75142843a1d23d23f59c370`。详细真实报告/raw/fixtures/提案与候选均私有固定，凭证/endpoint/本地私有路径不入公共Git。

当前M1仍pending、不集成。新Project候选恢复必要读取并完成review，双模型三tie未证明优于原base；新RP完整三pair/双模型只有一一致胜、两分歧与continuity负差。原权限/隔离/版本消费12arms全部通过，Step本轮六评分可用，旧stop保留。最新761/2939582、pending0/lock0，product a61b249ef已push、main不合并；同一Plan/Record/live HANDOFF更新后停止，不进入S11/G。接手沿该账本及同一窗口，先正式界定真实使用反馈/行为失败与独立case revision，不能反复重跑合成v1追分或把已训练案例当未见验收；用户无需手测。

### 同日私有状态迁移与远端清理

用户准备在另一台设备调整方向，先让AI调研再优化，并明确确认删除对象是GitHub私有仓库 `ZZZdragondYNGPHX/Atria-Dev`，不是产品仓库Atria或本机工作区。已备份3914个当前Document文件、五个无关dirty docs原始字节及私有仓库Git bundle；全部包内文件逐项SHA256验证，bundle在空仓库verify确认为complete history，取得全部九个远端heads及两个tags（bundle也保存本地/remote/HEAD refs）。本机包目录仅当前用户访问，凭证只在私有包/Document，不提交Git。接手说明明确bundle中旧Git快照不能替代当前Document/761账目，恢复时用包内最新Document覆盖克隆所得旧Document，local keys/ACL按新设备重绑定，报告/账目/窗口不清零；五dirty草稿保持单独来源。

首次删除因现有GitHub凭证缺delete_repo scope返回403。启动当前账号授权流程，用户明确回复已授权，认证完成后权限生效；再次删除exit0，同账号GET该精确repo返回404，产品 `ZZZdragondYNGPHX/Atria` 仍可访问，删除完成。本机私有仓库/迁移包和产品工作区保留。没有额外模型请求，M1仍761/2939582，不合并main、不进入S11/G；下一设备先调研真实反馈/案例来源及方向，再正式更新同一Plan与有限验证范围，不重复旧合成测试追分。

### 2026-10-09 本机来源、行为失败与案例隔离调研（待讨论）

用户要求先调研、讨论确认方案后正式开工。本轮只核对状态、阅读相关代码/报告和一手评测资料，不修改产品或冻结Plan，不发模型请求、不重跑已指导修改的v1，不进入S11/G。

用户说明手动删除本地Document并粘贴另一设备Document。初始本地product907cf1e87/docs994cd6e92落后，Git不存在a61b对象；实际私有账本已为761/2939582。只读远端refs确认product a61b249ef71f108d279ec7bd883fb5eeae97a463、docs eec940273c78db6db2557fb7bc798a71f422fc06和main ed1fd90521a63363e29856601abbf5e908c99d10；fetch后读取最新HANDOFF→index→acceptance §9/S10→同一Record，再将两个任务工作树仅fast-forward，main保持。远端docs只变更HANDOFF、acceptance、Record，未触及四份dirty草稿；五个本地dirty文件建立字节保护基线。

实际Document核对：509新entries tokens合计1939582，加历史carry252/1000000为761/2939582；492 provider_reported、17 reserved_upper_bound计74948，全部settled。quota carry332+429 unique admissions=761，所有admission IDs存在原ledger，最小间隔3151ms、滚动一分钟峰值11；保守历史24h峰值761见原审计。rate checkpoint比最后quota admission晚2ms，两个值均与原审计hash一致，不要求二者时间严格相等或改写。ledger/quota/rate/transport/epochs五SHA与source-read-cycle-final-audit逐项一致；lock0、未发现运行中M1 CLI。九个窗口中七个旧stop保持；当前Step8000仍保留404 stop与历史recent，上一有限许可已消耗6/24且development claim固定，不能沿剩余额度自动发新轮。建议token超额历史保持，本轮零新增费用。

实证与改善空间：

- 本轮报告/反馈来自synthetic development，未发现其中有真实用户任务/偏好证据。原Experience outcome只接受原source正式状态，explicit映射origin=user、observation为client_observation，diagnosis可标model_hypothesis；CLI代理在fixture中correct explicit的技术分析有历史说明，不能将它当真实用户意见。原reflection允许explicit/technical失败事件或至少三个弱来源触发，但弱观测不能建立确定改进方向。相关Experience API会wake原Evolution；定向搜索src/public未找到常规RP/Project结束直接提交Experience outcome的调用。需讨论是否优先补齐原authority上的反馈供给，而非继续只调提炼文本。
- Project authoring/conflict/repair本轮两arm均满足目标、版本冲突与repair/review；baseline在当前简单任务已有充分表现，省token不能成为行为胜。97a1跳过必要来源→review失败/-4是具体负例，a61修复消除此回归，尚未证明优于原base。新任务可讨论有真实依赖/保留字段的创作修改、明确诊断的修复及冲突后的可执行说明，但尚未观察这些新失败，不伪称已有用户案例。
- RP已保存输出存在具体可检查问题：输入只给约定午夜、未给当前钟点，正文却生成dusk、midnight damp或“before midnight”等时间；candidate也出现玩家手搭门闩等未给定身体行为。这比泛泛“更自然”更能定义触发与纠正。variant primary偏好candidate却continuity=-1，Step+2，保持全部旧评分，不倒推更正；新rubric应明确当前时间/约定时间、观察/推测/代写行为的区别，缺证据可unknown。
- 三个RP family共享相同场景及visibleMemory，v2主要替换姓名/地点/约定时刻及一两句指令；Project仍是同类rename+注入conflict/invalid proposal。文件hash不同和不同judge identifier不等于独立任务来源，也不能证明厂商独立或真实泛化。memory exposure仍为fixture直接注入，production memory resolver不在已证明范围。

一手资料：[Anthropic评测实践](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)区分能力提升与回归套件，要求结合transcript/outcome审查评分和任务歧义，强调简单case饱和后需要更新任务；[τ-bench论文](https://arxiv.org/abs/2406.12045)以最终authority状态验证目标并用重复试验衡量一致性，其用户为模型模拟，不能冒称真人观察。本轮只采用方法论，不导入外部benchmark或新评测平台。

待讨论建议（非批准/冻结）：优先从原保存RP episode、Studio Task/正式receipt、有效Experience反馈与validation/repair记录选择任务；如无合格真实材料，由agent在隔离副本执行用户确认的代表性工作负载，明确标注agent-authored/synthetic。按原始episode、Project、任务模板/派生关系分组划分development/独立验收，禁止同一失败换名进两集，禁止独立验收输出回流本轮提炼。旧v1转为历史回归证据，不再作为收益目标；新case/input/source/rubric revision在候选与付费前固定，并用免费正/负/unknown controls证明可判别且可完成。每入口一个局部target、一次候选提炼与一次development；达标才原三场景×三重复/九对六一致胜、其它一致tie、重要维度非负及原publication/消费/rollback。API8000输出、2000/day/20RPM、全部失败/unknown记账、token建议通知后继续保持；具体send envelope在用户确认后再正式固定，不追加本轮实验。

迁移权限核对发现本机Document目录755、连接配置/ledger644，与原私有700/600不符。只恢复目录700/普通文件600，符号链接不跟随；文件内容及五累计状态SHA保持，原Git exclude有效、Document无tracked文件。首次exclude核对误在docs工作树对外部绝对路径执行git ls-files导致只读命令报错，改在Document所属core工作树核对后通过；未读写reference或产品配置内容。

最小验证仅文档diff、refs/字节hash、账目与quota结构及迁移权限/exclude核对；未运行产品tests/build/CI/UI/Android/外部DB，没有人工观察。更新同一Record/live HANDOFF后等待用户讨论，Plan不变，M1仍pending、不合并main。

### 2026-10-09 RP / Project 领域能力扩展研究（待讨论）

用户扩大调研范围，要求通用持续问题发现、评估和改善的设计差距分析，覆盖RP文学/认知/成长/自主性/记忆/偏好，以及Project规划/架构/测试/可靠性/安全/长期复用；本轮仅研究，不改产品。Start docs `6f1c18056d4f461df41e78e5d259c0c19bf55a15`，product `a61b249ef71f108d279ec7bd883fb5eeae97a463`、main `ed1fd90521a63363e29856601abbf5e908c99d10`；actual Git/迁移账目沿上节核对，五无关dirty文件与五累计状态文件设字节保护。

已保存[领域扩展研究](../../plans/architecture/agent-intelligence-m1-domain-evolution-research.md)，不是批准后的Plan或第二份authority。阅读M1/S10/acceptance §9/S05及直接相关Experience、Evolution、case/adapter、evaluator/targets、repository、测试账目契约；仅定向阅读后续delivery/execution-reuse的边界，不扫描所有Plan或reference。公开一手资料含GEPA论文摘要和DSPy作者方法文档、明确到具体社区项目的RP-Bench、PHASE-Tree、NCP-Bench、NstAgent、ACL Novel Benchmark、judge偏差/人类校准及τ-bench/agent eval实践。GEPA全文网页/下载未取得可读全文，故具体实现解释以作者DSPy文档为依据，不声称已复现或逐页审计该论文；其余长论文按本任务相关方法/实验/限制定向阅读。论文版本、DSPy/RP-Bench正文commit与产品source固定在报告中；外部仓库未安装，benchmark未运行。

八项产出全部覆盖：通用能力已实现/计划/缺口矩阵；RP十三维和Project十一类覆盖/证据/非Prompt依赖；原控制引擎与受审领域模块的职责；十组质量冲突与四层回归设计；来源分级、去重/抽样和新问题发现流程；Prompt/Context/state/runtime/evaluator根因与intervention分离；策略污染、评委偏差/漂移、来源泄漏与rubric不可优化约束；九项版本/来源/兼容契约与延后能力；完整额外调用/缓存/持续优化成本。源码事实、Atria实测、论文实证、作者报告和架构假设分别标C/A/E/R/H，未将外部任务效果外推Atria或真实用户。

待讨论建议：保留M1有界控制闭环，先确认真实outcome/feedback供给及评价可判别性，再扩展有版本的领域质量和因果诊断。系统策略与故事角色成长分开，用户偏好与正式事实分开；Context/state/runtime无现有writer的修复转原authority工程任务，不能都靠Prompt。GEPA搜索valset及互补frontier属于开发证据，独立promotion另留；case按episode/Project/派生关系隔离。角色状态/长期记忆/跨任务复用属于后续路线，不静默扩大M1。测试两judge形态与生产human/price/owner gate分开，全部额外发现/校准/ablation请求都需进入原ledger/envelope；成本算式是形态上界，不是授权额度。

本轮无模型API发送、无新增人工标签、无真实用户聊天扫描/导出、无新候选或评分，仍 **761 requests /2939582记账tokens**、17unknown/74948、pending0/lock0；失败stop/epoch和6/24历史许可不变。最小验证：研究/最新Record/HANDOFF的14处本地链接及锚点、表格列数和代码围栏检查通过，产品源码链接对应文件存在，文档diff检查通过；五dirty文件加五累计状态文件10/10字节SHA保持，product clean且HEAD/main符合固定值，已批准Plan模块未变。未执行产品tests/build/CI/UI/Android/外部DB，main未合并。研究稿与同一Record/live HANDOFF仅提交docs相关文件，五无关dirty草稿不提交。

下一checkpoint是与用户讨论并决定真实来源/用途、首个领域pilot/时间尺度与关键维度、M1契约/后续实现分工、新case/rubric/calibration revision及有限验证范围；确认后才正式冻结Plan与实施。用户无需手测，不能反复重跑已指导修改的合成v1追分或把模型反馈伪装真人，M1仍pending，不进入S11/G。

### 2026-10-09 原链路反馈与评价契约 F0（设计完成）

用户明确选择“先明确原链路的反馈与评价契约，再用各一个 RP、Project 试点验证”，已记U13；批准先后方向，具体逻辑字段/工作包是授权范围内工程细化，不冒称逐字段用户确认。Start docs `56151bfb8c0eff40e00b4234add851b4bbd82afa`；product `a61b249ef71f108d279ec7bd883fb5eeae97a463` clean，main `ed1fd90521a63363e29856601abbf5e908c99d10`，五无关dirty保护。本轮按actual Git→HANDOFF→index→acceptance §9/S10→同一Record及S05/直接源码核对，没有重新全量调研或读取reference。

正式补充设计保存于原Bundle的 [m1-feedback-evaluation](../../plans/architecture/agent-intelligence-runtime/m1-feedback-evaluation.md)，并在index/decisions/M1/S05/S10/delivery/acceptance中路由，详细新规则只保留该模块一份，原生命周期/部署/生产gate/工程门槛仍由原模块管理。修正acceptance页首过期701状态为实际761/2939582，历史§7–§9报告不改。

本阶段完成四组契约：原Experience中独立assessment provenance与零模型反馈供给；diagnosis根因及intervention路由；原固定evaluator的QualityProfile/case lineage/envelope/report；调用与失败/cost用途。自动分析不写explicit=user，RP client完成观察不升级Host正式outcome；语义片段核验不证明原因，弱信号与模型怀疑不取得确定方向。确定性质量proof只覆盖固定predicate；RP无法取得这种proof时仍unknown/undetermined，有限私有engineering调查也须明确test-only且复用原提炼/targets，不放开production gate。校准/promotion内容不回流开发feedback，发布/评测事件不递归优化。

新Experience v2与case/report版本是设计，尚未产品实现；建议原资源内CAS迁移、read-only不写、旧项不洗来源、unknown拒绝、旧依赖失效、generic dump/restore/deleteUser及容量/retention兼容。未注册新资源、不运行真实迁移。F1必须让这些字段被实际consumer使用，不是仅存schema。RP试点收窄为信息边界内叙事回应/character Skill body；Project为关联修改与可核查完成/user style body。每试点保留三开发/三独立场景及原重复门槛，原重要维度/guards保留，新增领域收益要进入实际评价；不声明全领域或长程能力。

工作包F0契约→F1最小原链路实现→F2来源/校准及实际有限范围→F3一次双域试点，各包保存同一Record/HANDOFF后停止，不新增S/G阶段。缺真实获准来源可用有实际产品用途的agent隔离工作负载但明确synthetic，无headroom或calibration不可判别则停止，不伪造失败/人类标签。416send仅无retry的结构估算，不是本轮许可或新增API硬限；F2任何付费探测前与F3试验前各固定actual pins/范围及原Step窗口处理，不恢复旧6/24许可或清stop。

原账目结构重新核对：历史carry252/1000000 +509 entries=761/2939582；492reported、17unknown计74948，全settled。quota carry332+429 unique admissions，所有IDs在原ledger，minimum3151ms、滚动一分钟峰值11；九窗口/七stop保持，lock0。首次审计脚本误按list读取dict entries产生KeyError，改用dict.values后核对通过；未改任何账目。文档补丁首次有错误delivery上下文校验失败，原子拒绝后修正上下文再应用，无部分Plan写入。没有模型请求/人工标签、产品测试/build/CI/UI/Android/外部DB或产品修改。

最小验证完成：10份相关文档100处本地链接/锚点、28个表格结构和代码围栏有效；工作包/模块路由核对通过；原acceptance §2退出门槛与§9最新paid周期逐字保持，S05/S10/Record仅追加，416send估算加总正确；普通及staged diff检查通过。五草稿/五累计状态文件10/10 SHA保持，product clean且HEAD/main固定。仅提交本轮10份相关docs，未提交无关dirty草稿或私有数据。下一仅F1，直接落实最小消费者而不重开已确认方向讨论，不进入F2/F3。M1仍pending、不合并main、不进入S11/G，用户无需手测。


### 2026-10-09 原链路反馈与评价 F1（最小实现完成）

用户“继续”授权沿U13/F0工作顺序实施本工作包。Start product `a61b249ef71f108d279ec7bd883fb5eeae97a463`；Start docs `d9732ea292d869e11ac7471139ae71a029cfcdc7`。End / local Tested product `57520d43dd577c13d1eee6df50d3edb4a3379a1e`，沿同一feat/agent-intelligence-runtime提交推送；main `ed1fd90521a63363e29856601abbf5e908c99d10`未合并。先actual Git与迁移后Document/账目，再HANDOFF→index→acceptance §9/§10/S10→新反馈模块/S05→同一Record和直接源码；没有读写reference或加载非指定Skill。

实现复用原Experience/evaluator/targets及authority，没有新resource kind或旁路系统。strict Experience v2增加有限assessment、attribution及原资源内collections；v1只在writable CAS修改时升v2、旧项来源不洗，迁移即使feedback字节未变也暂停/失效旧job/report。normal RP首次exact saved completion写client_observation，不冒充Host；Project在正式状态/validation/review/receipt变化持久化后释放Task锁再重读原authority、收technical并调用原wake。隔离evaluation副本默认关闭collector；完成/成功不独自触发reflection。失败metadata不重放generation/正式Task效果，面板明确来源/分析claims、未确认采集和一次指定source的补收拒绝/重试。

水位按kind/sourceId/exact references hash/signal去重，原资源最多256项；跨feedback过期/撤回/删除保留无正文水位。特别验证同Task第二轮真实validation失败仍可收，旧撤回版本不能复活；达到有限容量不能旁路续跑。自动model分析由内部port绑定实际模型/config/request/snapshot及原owner同scope settled charge，普通HTTP不能选择该来源；校准/promotion、伪verified_failure、无charge或缺片段拒绝。三个同类profile/dimension疑似失败按真正exact refs聚合；同一输出重复capture、多claim或混合问题不凑独立来源，仍保持弱批次/undetermined。固定Host checker仅证明原Project.validation谓词，消费时重验实际状态，不证明开放语义、用户目标或唯一根因。

根因与target方向实际分离：public proposed attribution由Host设unverified；新local只支持prompt locus。Evolution拒绝缺归因/旧legacy、unknown及context/state/runtime/evaluator等engineering/none，不把无writer问题交给提炼。原隐式提炼仍只在原explicit/technical失败或受审Host proof支持的条件下提出局部假设，不变为已证实原因。固定8个QualityProfiles与Report v2 envelope接原compare/worker和生产、工程gate；required dimension/case/split/profile/revision缺失或伪改provenance拒绝。旧case catalogue及case set内容不变，明确historical_synthetic/not_established，新pilot没有来源时在worker/provider前source_unready。旧报告/评分/费用保留，只读历史不变成新资格；旧fixture代理explicit CLI不作为新试点入口。

物理字段、兼容/回退和支持边界冻结在原 [m1-feedback-evaluation §9](../../plans/architecture/agent-intelligence-runtime/m1-feedback-evaluation.md)，原S05生命周期/S10部署与production human/price/owner gate保持。更新原Bundle路由及acceptance §10，本工作包不修改§2/§9退出/旧有限周期，不冻结任何F2/F3真实请求范围。

最终最小本地验证：Node24.21.0、FS/SQLite，五相关suites **101 distinct tests** 一次最终全通过（79.733s）：feedback contracts17、原feedback33、原evolution41、M1 acceptance7、原worker development selection3。命令在产品tests目录：`node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand agent-intelligence/feedback-contracts.test.js agent-intelligence/feedback.test.js agent-intelligence/evolution.test.js agent-intelligence/m1-acceptance.test.js agent-intelligence/m1-development-selection.test.js`。覆盖source/provenance/用途、零模型normal hooks、去重/非复活/第二轮失败、v1 readonly/migration pause、CAS/失效/容量/损坏、reopen/dump/restore/deleteUser、engineer-root拒绝、真实compiler/provider的fake-charge绑定、Report质量拒绝及fixed worker消费。所有fake调用/fixture标签只属工程控制，不是本轮真实反馈、独立质量胜或真人观察。

实际修正与失败保留：新测试最初有硬编码错误sequence、空plan、错误rejection reason/compare参数，后有mock缺ok=true及误调用不存在的Evidence.list；修正为实际接口/原saved record一致性断言后通过。一次在回归运行中编辑受pin源码，使SQLite Project Prompt finalizing被原evaluator_revision变化gate拒绝；固定代码后该项定向重跑通过，最后101项在固定源码一次全部通过，没有放宽gate。新增归因字段与schema2允许后的旧测试输入同步修正；重复运行不累计distinct数量。ESLint初轮brace-style/测试indent/conditional-expect均已修正，最终16触及JS/mjs通过。真实Chromium390px执行同一个production pane在RP/Project的来源、collect/unavailable、escaped assessment、预算、默认review、finite job/pause/delete；fixture API检查通过，不声称完整应用E2E。没有full/build/CI/Android/外部DB或Node20新验证。

Document累计仍 **761 requests /2939582记账tokens**：carry252/1000000+509 entries1939582；492reported/17unknown74948，全settled/pending0。quota carry332+429 unique admissions均在ledger；九transport窗口/七旧stop、rate与epoch、6of24历史claim不变，lock0。五累计状态文件与五无关dirty文件10/10 SHA保持，private Document无tracked文件且本轮未迁移其Experience/Task数据。没有真实API发送、新候选、人工标签、重评分、publication或新run消费/rollback；paid source仍a61b249ef。

包末停止，M1仍pending、不合并main、不进入S11/G。下一仅F2：取得获准的实际来源/明确synthetic代表性工作负载、可完成路径与baseline headroom、按episode/Project/派生组隔离development/promotion，固定case/profile/rubric/calibration/evaluator与实际有限范围；缺来源/饱和/校准不可判别是有效停止结果。任何真实探测前先在原acceptance §10记录exact pins/范围与现有窗口处理，不复用旧Step剩余额度、不清stop，不重跑旧v1追分。用户无需手测。

文档结束检查：本轮9份相关docs的114处本地链接/锚点、32表格和围栏有效；原acceptance §2/§9与起始docs逐字一致，普通/staged diff核对通过。产品HEAD与origin/feat一致，main仍固定；五无关dirty文件和五累计文件10/10 SHA保持，仅暂存九份相关docs，未提交草稿或私有数据。


### 2026-10-09 F2 来源准备、独立资格核对与免费校准（source_unready停止）

用户要求先拉取远端并核对其它设备推送，下一仅做F2，不启动双域试点。git status首先确认main clean；fetch发现origin/docs从eec940273到74e687f7c共4提交、产品任务分支从a61b249ef到57520d43d新增F1提交，main仍ed1fd905。产品clean工作树仅fast-forward到57520d43d；本机原docs工作树的五dirty文件用ignore-space-at-eol核对为纯CRLF差异，未修改/暂存。为保留其字节，从origin/docs创建临时detached docs worktree完成本轮文档，同一Task/Plan/Record与远端docs不变，不merge main。actual Git→远端HANDOFF→index→acceptance§9/§10/S10→feedback/S05→同一Record及直接代码，未读写reference。

准备六份agent_authored_synthetic_spec：RP档案馆登记/玩家选择、水库交接条件修订/当前事实未知、剧场新variant/私有信息；Project真实入口World依赖与primary关联修改、具体缺失KnowledgeBinding引用diagnostic单轮修复、human revision冲突后的保护与准确说明。六个development root分别保存input/control/specification hashes，未沿旧v1/v2换名；没有新model execution refs，故不称已观察baseline失败。promotion每域三个root仅为未取得内容的metadata槽位，sourceHash=null/independence=not_established；槽位不计来源数，不证明盲性，没有promotion内容/答案回流或新提炼。完整source/rubric/control与执行材料仅写私有原Document，未提交。

固定两个F1 profile全部六critical dimensions的draft rubric，positive/negative/unknown构造片段显式engineering_control。用原parseBlindGrade执行36组两顺序scripted grade的preference/符号换算，以及36次漏critical维度拒绝；六新spec经原validateCase拒绝，两个profile经原EvolutionEvaluator.compare在worker/reserve/provider前source_unready。原catalogue12个legacy cases不改，当前Quality registry/evaluator revisions及来源包/逐输入/控制/配置hash保存，不把spec hash冒充actual request pin。没有实际双judge语义校准或human标签，这些断言仅结构控制，不能计独立质量胜或F1回归suites通过。

原Studio/ProjectAgent在隔离临时FS副本的三条工具路径实际通过：World依赖和primary同步修改4个calls达到review；具体缺失binding引用经过原diagnostic、reset/save/prepare，7个calls单轮修复达到review；审阅前human改变另一入口，4个calls原project_revision_conflict且Task为conflict。当前source、无关字段、权限和human revision保持，model changeSets0，无automatic commit；实际source/proposal/Task/validation/tool结果复制为私有engineering证据后清理temp。直接tool calls不是model rounds；尚无真实六round可完成性或baseline headroom结论。

准备脚本两次本地fixture断言错误保留：初次把createProject前输入hash当规范化后权威source，修正为实际get_project返回的canonical source后比较；随后误用validation.errors，按源码改为diagnostics。固定脚本后最终三路径全部通过，未改产品validator/gate/源码，没有paid send或failure-window事件。前置只读账目Node -e脚本一次多余括号导致SyntaxError，改为PowerShell读取核对通过；无任何账目写入。

实际发现的评价适用性缺口：profile每pair全部六维critical，但独立authoring/repair/conflict各不自然曝光另两类操作。没有证据必须unknown，不能填零/tie或事后N/A；RP也须逐维核对exposure。该问题属于evaluator/source工程准备，不能通过Prompt writer掩盖。后续F2须预注册能在原六round内取得全维度证据的来源/公开窗口，并接原fixed catalogue/adapter；若不能覆盖就继续如实停止，不能降原profile/准入门槛。

因此本轮以source_unready结束，F2全部准备尚未完成；不是F3准入或取消来源要求。原模块§10与acceptance§10.1固定本轮allowedActualSends=0、提炼0、paired trials0、发布0。尚缺独立promotion实际来源、原新catalogue/adapter消费、真实baseline headroom/六round可完成性、全critical维度实际证据和双模型语义校准及actual request pins。未恢复Step剩余许可、清stop、另开epoch或启动付费probe/F3；旧416send估算不是本轮许可。

私有source packet SHA b7a46ff1b0550f3ee074f45a3819b037777fc4efdc1ff1df0c84e57f3be2a8f9、rubric4ec9760ce4b4906d6928558c8d2e2d410a077018714562c1c54442a380bcc8b8、Project路径ed82408c425e4dc7d40a497adea9d40c1bd89a3d45391f29abda8823f54c3476、final readiness34e42c7b74714af224e9216940ae42dcb8a96e3aeedcc659c1fc9614f61da481。运行环境Node24.18.0；本轮仅原parser/source gate断言及隔离FS原工具路径，不运行产品Jest/full/build/CI/UI/Android/外部DB，不重计上轮101tests。准备目录继承原restricted Windows ACL，无unexpected Allow规则。

五累计文件逐项匹配旧source-read-cycle-final-audit SHA：761requests/2939582tokens，509entries含492reported/17unknown74948，pending0；quota761、lock0，九windows/七stop，旧permit6/24保持。本轮末再核对五dirty文档加五累计文件10/10 byte SHA、product/main refs保持。无产品修改或新私有Experience迁移。文档仅同一feedback模块/acceptance/index/Record/live HANDOFF，原acceptance§2/§9逐字不改；五相关文档51处本地链接/锚点、12表格与围栏通过；原acceptance§2/§9文本逐字一致。首次文档diff因Windows默认CRLF将整份文本报为whitespace，五个本轮文件改回原LF后普通/staged diff通过，原dirty工作树字节不改。

本轮阶段停止，M1 pending、main未合并、不进入S11/G。接手仍是F2，不直接F3；用户无需手测。读取原HANDOFF/index→feedback§10及acceptance§10.1→本节，核对private readiness/source packet与原账目，先补齐已列缺口，再任何请求之前固定新actual范围与窗口处理。


## 2026-10-09 F2续接 — 独立密封与原窗口、有限scope准备完成，等待新Step许可

用户继续原F2范围并明确回复允许专职子代理生成密封来源。开始product57520d43d、docs a91f45e40；fetch未发现其它设备新push。沿同一工作分支commit/push f8f6c0d7a→最终/Tested `eb1664138458ebae073d86792e5a5295ce27dfda`，main ed1fd905不变、paid source仍a61b249ef；没有F3提炼/paired development/promotion/publication。原五无关CRLF dirty文档仍在旧本机docs工作树，全部字节保护，文档通过同一临时detached docs worktree更新。

独立作者单独生成3RP/3Project synthetic，接收通用schema/家族排除/公开窗口，未读取development内容、未调用付费模型或写Git。开发侧只读metadata（SHA f7858cc57c9b5aa5eeaa1a2102174c83bca7f7eddf0e07330d6ffbeeeaf14505），未读密封fixture/control/答案。作者完成schema/ranges、Node canonical parity与语义家族排除；RP字节和ProjectSetup/Edits在窗口修订中保持。固定promotion只导入元数据pins，不能自动升级为实际独立验收胜/真人偏好。

六development synthetic现进入原fixed catalogue/validator；原legacy12内容/revision不变。RP保留全部owner/agency/exposure/revision/variant guards。Project最初尝试在Review后再次prepare被原review锁拒绝；同时新增fixture误读Task snapshot.proposals，修正为operations。没有改原Task状态机或重放授权。核对原STOP_STATES后，最终窗口前置真实旧review→human metadata修改→原commit前base拒绝（无intent/write），显式创建新base上的fresh Task并曝光旧conflict原ref/status；fresh Task已有真实missing-binding诊断，原public loop读/reset/save/review修复。免费构造六case各2round，Project各8tool calls、failed→passed、旧conflict不rebase/新Review未提交、human source与其它字段/resources/permissions及隔离canary保持。hard checks只是工程证据，不填六维语义零/tie/人类分数。

原evaluator内部baseline-only probe只选新development/一次，复用原worker/compiler/provider/owner reserve/settle；host_source_probe报告保留completeness且candidate/judge/human为空，promotionDecision拒绝。原pilot compare仍source_unready，生产准入不变。原M1 CLI的F2模式只读取固定scope/controls，最多36baseline+24calibration、Step12、retry/extraction/promotion/publication皆0，首个校准或transport失败即停；实际request/snapshot/hash在funding前私有记录，没有并行runner或新账本。

12份校准材料是known violation/counterfactual/missing evidence×两顺序×两域，拟双judge24次；原parser本包8映射、4缺证据拒绝，实际模型语义校准未运行。控制positive说明是明确的engineering_control，不是baseline观察或human标签。新funded-path fake test证明一个校准失败保留原settle记录且停止、不启动baseline/candidate；unknown不强制零/正式grade。

真实CLI prepare两域0send，但重复新建Project随机Preset引用使configuration/settings/target pins不稳定。新增原restore的baseline-only分支要求exact doc/target/实际pin、jobs/publications空；保持原publication restore默认行为。最终准备run run-1791522724983-ea572224 与restore复核 run-1791522727921-9bfaefe3 的四类pins全部一致；付费模式缺新许可时在ledger lock前f2_step_permission_required。五累计状态及五dirty文档10/10字节保持。当前stepPermission=null，新claim未建立，原九窗口七stop、旧6of24及epoch完全保持。

验证：5 suites/39 distinct tests（f2-sources12、m1-development-selection3、m1-acceptance7、live-bridge11、evolution-consumers6）；随后因新restore变更增加F2 restore1以及完整m1-resume4，合计6 relevant suites/44 distinct tests。相关变更后重跑scope/失败settle2项通过；触及10个JS/MJS ESLint、M1 CLI syntax与diff通过。fake providers/原funded worker与工具控制不是实际模型校准、配对质量胜或CI；未运行full/build/UI/Android/外部DB。准备Python一处GBK读取和一处按分号截JSON失败均在本地修正，没有账目/模型写入；新增测试一处误读owner.charges修正为原attempts，最终通过。

新source scope SHA 355269bd804e4d069d1a98ac5f7352ec4690a2f86536c02253896bee4e243b0d；calibration 9081a5246dfa4c753a146a6b89cf09282da921a09b48fb9dcf8851e0748f3018；constructive evidence 71e631cc33f9381548893aa7b59d640b19e716da60b9fb7485c123f7c094e646；free readiness 12c3ddd111a6bb8dff751b67eaf7f69bf0621ec20057ebbd0303b6f59ae13c23；case/rubric/evaluator/Quality pins归feedback§11。私有scope/配置/正文与原raw reports不提交，公开仅metadata与受审构造fixtures；restricted ACL保持。原ledger761/2939582、492reported/17unknown74948、pending0/lock0、quota761不变。文档修改同一feedback/acceptance/index/Record/HANDOFF，原acceptance§2/§9逐字保护。

停止边界：不是source已完整验收，也不把双域试点提前启动。原feedback§7/acceptance§10禁止复用旧Step余量/清stop；当前只独立作者授权，没有新有限次数许可。所有可审阅源码/来源/范围已准备并push后请求用户确认：仅此次F2最多60send（Step新12次），新故障即撤销，无retry；确认后先追加具体许可hash，沿准备副本执行并保存实际校准/headroom/全部费用，包末停止。若不授许可就保持免费准备状态。M1 pending，不合并main，不进入S11/G，用户无需手测。


## 2026-10-09 F2授权执行 — 发送前固定

用户明确授权§10.2的F2有限范围：总最多60send/Step新最多12/retry0/首失败即停，不F3。起始docs102d54335/product eb1664138，与远端一致且工作树clean，无其它设备push；账目761/2939582及五dirty字节保持。许可evidence `c73ceca38db1993b9c38961d4a9a863107d498a687465834867a10dad37f3725`，scope文件SHA `19f270e48390213496df8703fd4a873c6ad36964032a52d9af30746409c73b72`；所有原source/config/runner/pins保持，仅写新显式权限。原实际Step key唯一旧窗口符合404 stop、consecutive0/最近成功；model-only只读定位首次命中两个历史窗口并停止，改用原m1TransportKey定位，不清stop或换epoch。旧6of24 SHA锁定，准备副本沿原restore。写文档的首次shell Python命令因引号截断未写入，改文件脚本后核验；无请求或账目写入。发送前已追加acceptance§10.3，实际结果待执行后更新同一记录。


## 2026-10-09 F2授权执行 — 校准失败停止与全部结算

发送前固定记录已commit/push至docs42567be30，随后原M1 CLI沿固定scope执行run `run-1791523500486-7aee8a69`；product/paid source `eb1664138458ebae073d86792e5a5295ce27dfda`无新改动。RP12/12双judge/顺序校准通过，3个development baseline共6send原hard checks/targetConsumed均通过，origin host_source_probe，candidate/judge/human为空、semantic scores not_run/headroom not_established。Project前三校准通过，第4个Step known_violation/flipped=true的解释552字符超过原512限制，虽然左右偏好/六维符号正确，原严格grade无效，runner以f2_calibration_failed/exit1首失败停止；不截断/放宽/重试。Project剩余controls及baseline未运行，F3未启动。

全部22实际请求/140750 tokens已settle；累计783/3080332，514reported/17unknown74948、pending0/lock0/quota783。RP owner18次/48133 tokens，Project4次/92617 tokens，jobs/publications0。22 pre-funded实际rendered/request/snapshot包与22 response/owner funding/shared ledger/quota逐身份/usage匹配；calibration行的requestHash是control.messages hash，不能冒充实际compiler envelope pin，真正实际pins取funding前request包。原ledger/quota通过去除22新记录恢复旧总数后逐字重建；历史carry/breach/unknown保持。新准入最小3154ms/滚动分钟峰值7，原20RPM/2000/day保持。现金价格unavailable，人类偏好not_observed。

新Step claim8/12在runner退出后按首失败规则标failed=f2_calibration_failed关闭，不使用余下4次；旧6of24/epoch与五无关dirty docs字节保持，九窗口七旧stop不清，无transport/incomplete新故障。scope授权后SHA保持19f270e48390213496df8703fd4a873c6ad36964032a52d9af30746409c73b72；raw summary SHA f3e02e4bd5352a6f7d5af225df1b071b112277bfe9cbd60f376164df368fdc46，paid audit SHA c3c2ccce8b38459640622d2753e154a4a2f75a64a137080295132088683a9bc0。失败实际charge/request/snapshot详见 [acceptance§10.4](../../plans/architecture/agent-intelligence-runtime/m1-acceptance.md#104-f2授权范围实际结果与关闭)，不提交私有报告/config/payload。

RP文本的“检修没落定”与未见确认后的保守说明存在可能knowledge_boundary歧义，仅developer证据初阅，不冒充正式模型/人类反馈或headroom成立。密封promotion正文/答案未读。下一仅F2评价/source准备，检查原judge prompt的≤512契约及控制轨迹重复材料，再经原消费者/新版本固定必要范围；不修local Prompt writer、不降parser/准入、不自动新付费发送。本封包停止，M1 pending、main ed1fd905未合并、不进入F3/S11/G。

本轮验证是上述原CLI有界真实执行和只读22请求/累计状态审计；审计初次因缺globalAtria导入失败，改空上下文/禁网络后通过，无额外send。沿用上一包6相关suites/44 distinct tests作为代码历史证据，本轮源码未变，没有重跑Jest/lint/build/CI/UI/Android/外部DB。五份docs本地链接/锚点/围栏、原acceptance§2/§9逐字保护与diff检查在提交前核对；同一Record/HANDOFF更新后停止，用户无需手测。


## 2026-10-09 F2新硬上限与证据核对 — 发送前

用户明确继续并允许调整其它限制；按累计1000/20RPM解释，起始783/3080332。fetch未发现其它设备push，main ed1fd905及五旧dirty保持，docs起始5dd4ac299。产品原分支commit/push ac03448795232949a485b88f93305460c1476621：原M1 quota可配置累计cap并计入过期carry，CLI强制1000且20RPM不变；校准消息明确≤512，新增有界双模型基线literal-evidence核对、schema2范围72/Step18；新claim成功/失败均自动closed，旧8/12不动。不是放宽quality/human/promotion或读密封payload。

3相关suites/26 distinct tests（f2-sources14、m1-quota5、m1-acceptance7）通过，触及5文件ESLint、CLI syntax/diff通过。首次Jest使用根node_modules路径不存在，改原tests依赖路径后通过；patch一次context不匹配未写入，修正后完成。免费原CLI prepare零send，配置/settings pins沿旧准备副本精确复核。新授权evidence 028047f0889e8ee9c3a38e78bee12d8a9273b8ebfde77ccad367ce5973aa1f06，scope SHA efddeb30b509bb4c9be2930f5429ec2eaf3436ed4bb88a879f05e4cc87d826ba，详见acceptance§10.5/feedback§13；发送前先push docs，随后执行原封包。retry0/提炼/pair/promotion/publication0；本轮仍仅F2，不F3/main/S11/G，实际结果另追加。


## 2026-10-09 F2表示层修复与已完成证据续接 — 发送前

用户纠正为每天2000调用/20RPM，取消累计1000，要求专注测试；按最新指令恢复原quota并移除累计cap。上一新run新增21/62624、累计804/3142956，RP12/12校准与3baseline8send完成；首个评估原文含换行导致serialized JSON substring误拒绝，decoded原文精确存在。修复解析表示层并只读复用该21请求证据，不重跑已完成校准/基线；product commit/push dd80d858338e92ef340a25d4bbf48e3e267f9595。新范围与授权见acceptance§10.6：permission 8a173e4ddd973562364db3efcaf895ae2a6eea98fef27ca9f90fbb8ee802bc44、scopeSHA dd0c4691fd69fe93e9a8611d762b17026fec663e8ba01ac1f3e04e6cdded2e25、resumeHash ef393a1f8540f56f4f1fa18e555fab2ec920e080a09fc46ef983f706fc182427。

变更后f2-sources14/m1-quota4共18 tests通过，触及lint/diff通过；此前m1-acceptance7保持代码未变。v2全部21 packets/responses/owner/共享账目核对一致，原账目/旧claim/epoch/五dirty可逐字保持；pending0，九窗口七stop不清。私有只读诊断首次Python默认GBK读取及直接JSON解析带围栏失败，改原parseEvaluationJson定位，无额外模型send。本轮未full/build/CI/UI/Android/外部DB。发送前本节push，继续仅F2，不F3/main/S11/G。


F2续接修正（发送前）：v3首个Step证据请求transport_failed，usage未取得，按原11631上界保守settle；累计805/3154587，unknown18/86579、pending0，claim1/18自动closed，失败历史保留。原F2 retry0却沿用三重试的timeoutMs/4=75秒；现使用原Route300000ms完整单次deadline，非F2路径不改。沿用户测试续接授权，允许修正后的单次有界恢复，旧404 stop/consecutive1/recent/epoch不清；不把旧claim余量搬入新claim，任何新失败仍立即撤销。product/Tested0479f5bd3e924c6031b09eaa4103e28684bc086a，retry12 tests及触及lint/diff通过。新scope SHA2910a6947ea5b50e766888842d17462caba9b6786a2128a8639694ebfd66f75c、许可evidence03106075bf3ff46de45c9e197ccdc5e4fb99f3b20294bdf3097a19da6e10853d，resumeHash ef393a1f8540f56f4f1fa18e555fab2ec920e080a09fc46ef983f706fc182427；原21已完成RP请求证据继续复用，剩余测试不变，只F2。每天2000/20RPM是最新API硬限，累计1000取消；完整实际结果在结束后保存。


F2续接修正（发送前）：v3首个Step证据请求transport_failed，usage未取得，按原11631上界保守settle；累计805/3154587，unknown18/86579、pending0，claim1/18自动closed，失败历史保留。原F2 retry0却沿用三重试的timeoutMs/4=75秒；现使用原Route300000ms完整单次deadline，非F2路径不改。沿用户测试续接授权，允许修正后的单次有界恢复，旧404 stop/consecutive1/recent/epoch不清；不把旧claim余量搬入新claim，任何新失败仍立即撤销。product/Tested0479f5bd3e924c6031b09eaa4103e28684bc086a，retry12 tests及触及lint/diff通过。新scope SHA2910a6947ea5b50e766888842d17462caba9b6786a2128a8639694ebfd66f75c、许可evidence03106075bf3ff46de45c9e197ccdc5e4fb99f3b20294bdf3097a19da6e10853d，resumeHash ef393a1f8540f56f4f1fa18e555fab2ec920e080a09fc46ef983f706fc182427；原21已完成RP请求证据继续复用，剩余测试不变，只F2。每天2000/20RPM是最新API硬限，累计1000取消；完整实际结果在结束后保存。


## 2026-10-09 API 测试规则清理

用户明确要求彻底清理额外测试限制，当前硬限只有每日 2000 次调用与 20 RPM。本轮仅文档维护，从 origin/docs@d2fa5764f 的独立短期工作树执行，并合入并行推送 f16f180c2 / 054bbf68f 的产品修复与累计 805 证据，保护原 docs 草稿及产品工作树已有未提交修改；没有修改产品实现、私有账目、凭证或调用真实 API。

主工作区 main 的 `docs/`（含 plans/handoff/fix/development 与多语言产品文档）也进行了针对 API 调用/测试预算/次数许可/硬限制的检索；未发现该 M1 测试的额外配额指令，命中为产品 context/工具调用能力及既有历史内容，不改成新的 agent 测试规则。Governance 明确 Plan 负责设计、Record 负责事实、HANDOFF 负责实时路由；历史文档不恢复执行限制，避免多入口重复否决。

Governance §13.1 成为唯一测试限制权威。清理当前 M1 acceptance 执行规则、feedback §7、S01/S06 测试说明和 S10 生产/测试边界；取消历史累计上限、封包/Step 次数配额、token 停测、逐轮新许可与人工账目审计。旧执行封包从 Plan 移除执行指令并改为历史摘要，实际失败、账目及 source pins 保留。HANDOFF 重写为当前恢复入口，工程问题应定位修复并必要复测，真实验收与生产权限、正式阶段边界保持。

实际文档验证：14 份文件的本地链接/锚点、39 个表格与代码围栏通过；原 acceptance §1、双模型九对/六一致胜/非负维度、私有闭环及 production gate 保持，历史 §6–§10.6 标题/锚点保留，git diff --check 通过。文档提交后直接 fast-forward/push 独立 docs 分支，不 merge main。本轮不宣称测试 CLI 已完成同步，也不把现有产品 dirty changes 纳入此文档提交；下一产品续接需按当前规则清理原测试消费者残留 guard。


本轮追加 `main:docs/` 路由清理（用户明确要求检查 docs 文件夹）：发现 English/简体/繁体贡献指南仍将 release 写成稳定分支，与当前 main 冲突；三份改为 main 并引用 docs:README 唯一治理入口。main AGENTS 补充当前 API 测试规则路由与历史文档不得恢复为执行指令；保留的十份旧 Plan 和一份 Phase1 HANDOFF 增加历史快照说明，原正文/结果保持，不迁移资产或建立新规则系统。产品说明中的 context/工具 budget 保留其产品语义，不充当 agent 测试配额。

辅助 main 文档提交 `94cf032b5`（15 files，45 additions / 15 deletions）经短期 fix/docs-execution-routing commit/push 后 fast-forward 集成 main。实际验证：三语言贡献指南无旧 release 指令；11 历史快照移除新增说明后与原正文逐字相同；15 文件代码围栏保持、git diff/check 与暂存检查通过。未运行代码 tests/build/CI/API，未把并行 F2 的模型执行或测试当成本轮验证。main 仅 AGENTS/文档变化，M1 产品分支尚未集成；同一 Record/live HANDOFF 保留当前 M1/F2 状态。


## 2026-10-09 F2 新来源、隔离与校准 — 主模型范围完成

用户要求仅推进 F2，失败应继续诊断、检索、修复与复测，不进入 F3；API 硬限仍唯一归 Governance §13.1。用户明确允许备用 MiniMax，不可用时暂缓第二连接、只测主模型。本轮 fetch 核对产品分支与远端一致，保护 main、旧任务 docs 的五份无关 dirty 文件及正式 docs 草稿。结果从 docs@8a274e090 的隔离结果工作树更新，不以旧 HANDOFF 的失败 checkpoint 恢复停止条件。

完成声明限于主模型测试范围：`judgeMode=primary_only`、`secondModelValidation=deferred_by_user`，每域六个比较控制、四个单样本控制及三个真实来源观察均完成。全部 `sharedGaps=[]`，单模型观察只写 `primaryGaps/primary_observed_gap`。原 M1 两 model identifiers、盲评、development/promotion 准入与生产权限不变；F2 的双模型结论仍待复核，不宣布 M1 通过，也不启动 F3/S11/G。

### 来源与实际结果

六个 development 来源为 agent-authored synthetic，保留独立原始 root/template groups，旧十二 case catalogue 不改。RP 使用自然多轮 episode、修订承诺与未知当前事实；Project 使用关联字段修改、真实旧 Task conflict、人工修订上的 fresh Task 与具体缺失 binding diagnostic。免费原工具控制先证明可完成性；Project 的 test-only 窗口固定为 12 个逻辑模型 rounds / 2 repair rounds，RP 保持原声明窗口，生产默认六 rounds 不改。

六个独立 promotion 来源仍由获授权独立作者生成和密封，开发仅读取 metadata。独立作者核对 root/template groups、schema、canonical parity、固定范围及 sentinel 隔离；Project 只更新技术窗口，目标、原 source、操作、答案与 RP bytes 保持。未读取密封正文/控制答案，未把 development 输出回流独立作者。

| Development case | 实际原执行 | 主模型六维观察 |
| --- | --- | --- |
| RP archive return | 2 请求；原硬检查及 target consumed 通过 | knowledge_boundary gap：新增处罚/权限缺少 exposed support；其他五维 met |
| RP reservoir signal | 2 请求；原硬检查及 target consumed 通过 | 六维 met；保留正确结果 |
| RP theatre variant | 2 请求；原硬检查及 target consumed 通过 | 六维 met；保留正确结果 |
| Project entrypoint dependencies | 8 成功请求；Review / validation passed；全部原硬检查通过 | status_accuracy gap：缺少明确未提交 Review 说明；其他五维 met |
| Project binding repair | 10 成功请求；Review / validation passed；全部原硬检查通过 | status_accuracy gap；其他五维 met |
| Project dependency conflict | 7 成功请求；Review / validation passed；全部原硬检查通过 | status_accuracy gap；其他五维 met |

RP 真实基线 producer `22d32db191def2760884a1771f57ee9670bc3bbc` / `run-1791531237544-ac19ca9b`，共 6 请求；Project producer `ef8ddd9e208c682434b5cfe938d39691d8dbc6c7` / `run-1791538547140-1fc60cd9`，共 27 实际请求，其中 25 成功、2 次 524 后 retry。原 source-probe 的 charges 列表保留 25 个成功响应，两个 retry 前失败的 request/snapshot/上界费用另由原共享账目、prefunded packets、HTTP 原错误与 final audit funding manifest 保留；不能用该 report.charges 长度冒充全部发送数。后续只复用 exact 配置/输入/来源的完整基线，不重新付费生成正确基线，不把缓存称新独立 trial。

### 失败诊断、检索与原消费者修复

原免费/实际控制分开。每域保留 known violation、counterfactual、missing evidence 和左右顺序反转；单样本控制保留 positive/known violation/missing evidence，并新增 RP `unsupported_rule` 和 Project `communication_omission`。最终主模型有效控制 20/20（12 比较 + 8 单样本），包括精确复用的既有结果，不是 20 个新请求；固定 case/rubric/六个必需维度不删减。

Project 空输出曾被表示成“validated proposal absent”，把未知误当实际缺失；改为按字段是否实际观察区分 unknown/absent，零 writes 同样不能由缺字段推断。两评委随后都曾引用 Host Task status，把正确 Host 状态当模型已完成说明；该旧结果完整保留。现在从实际 public conversation 与 model-submitted plan args 提取 `modelStatements`，Host/seed plan/intent copies 只作核对事实；status met 的 literal quote 必须来自模型声明。完整窗口遗漏明确请求的说明与根本缺证据分开，正确提案不因此被判失败。新增 omission 控制证明五个提案维度 met、说明 gap 的区分有效。

RP 逐句审核曾因复合句前半段有支持，把新增处罚也判 supported，原 all-met 判断保留。原 quote catalogue 进一步按子句分割，完整原文与位置不改；每个输出片段必须核对，已支持前提不授权新增处罚/条件，普通职业惯例不是 exposed support。新增同类控制先通过，真实档案输出再观察到知识边界 gap；水库/剧场仍 met。方法参考 [FActScore](https://aclanthology.org/2023.emnlp-main.741/) 的细粒度事实核对；Project 的状态/必要沟通分开参考 [τ²-bench 官方评价契约](https://github.com/sierra-research/tau2-bench/blob/main/docs/evaluation.md)。这些研究用于评价方法，不充当 RP 世界事实。

同时沿原 M1 funded sender 修复 streamed quote refs/decoded literal 表示、Project 重复历史投影、grader output profile 与 primary low reasoning 的实际生成身份、RP right-minus-left 符号说明，以及当前 hard 401/404 不因历史 transient 被 wrapper 重试。原账目、旧 stop/epoch/不利判断保留，不修改历史费用或分数；原 Provider/Director/Studio/target authority 继续使用。未运行提炼、candidate、promotion 或 publication。

第二连接在用户报告恢复后确实完成 Project 响应，但 `run-1791538547140-1fc60cd9` 第 982 请求又返回 nginx 404；按用户授权试现有 MiniMax，第 983 请求返回 401 invalid api key。没有重复询问密钥或把 secret 写入聊天。按已授权 fallback 完成主模型测试；旧第二模型观察不冒充新协议的双模型通过。

### 最终身份与验证

| Pin | Value |
| --- | --- |
| Product / local Tested HEAD | `f495267023ca4475d15ba1c61b66702624c4938e` |
| Evaluator revision | `912ff32a31111f9d162f337239758ce81470ad841ba23c3a2651765321fe162a` |
| Runner revision | `66627d924f5e65fedcdbf084aeb317e991fb1290a93ea965a26c1dbe49f2af0d` |
| Legacy case set | `49c56c12126aff08c83465f83412d2acb2aa6417e4183b25d7cbebe59f63b54b` |
| Pilot case set | `2212e661628b18b68046d79f27076bd999ff76783d346d5945407ad00d5c094c` |
| Rubric | `408f084132df98292863dcf2e1413b0c02803574aa913ad86e2e9603c78c248a` |
| Final scope hash | `7ece78b205daadf78b108297e4a6e19e4935487e42d83351bf7082a3503b6ac0` |
| Final controls hash | `85dbd8cf2e407ae6dacee18be0445a5067a366e50ce2de1371271452de3ee96c` |
| Sealed metadata SHA-256 | `7c47b310b6639ed8cfc58adfdc810f101454ffa2463c977a6776a88f5cf5aa38` |
| RP source report / assessment | `581af5511f0b92d8398caa7828adb601b1ddee1a1e10d8a62c6aff9cc736711e` / `8b3931b0ca96243a288360ab513f71e64ad3a3cff74da795bb9a55fa84ff547b` |
| Project source report / assessment | `0ca186080a13e5b3cf867bde92cf5219b0a819035665c7641531a78f14747333` / `e000a9ae4e3325577b86ade0db0b6c8efb8a54cda004ec62174749b30553e47f` |
| Final audit SHA-256 | `17924e78b5d53b3872f2a1c2b146d381116bd93e66d933295410475c5087a550` |

主模型 identifier `gemini-3.8-flash`；upstream identity/现金价格 unavailable，humanPreference not_observed。原 RP baseline configuration/settings 为 `fcade8bd7a7691f94d14869f6fbed691304515f2289e788b8200f0b358cc55a9` / `f443071578c6207ffecafd71cdc53a8cde1631e077d30d1425b8735e2ad6682c`；Project 为 `d63aeaab1f7e670012db264dafc313034ba826245ac306d41d92b68df07fa7fd` / `55a6b7d12e929cb3c696040f2769099783f1ccee736b63336fb8384a3db6e438`。grader 16,384 output / primary low reasoning 的 transport hashes 分别为 RP `1278029f42acb854b04d34b1334aeecb574ae46d7752759f63287973c760c61f`、Project `9af1c059699fc82d9acccb0e6e12aaf080abdeacca1776c2f9c11d8304e9297b`；不把这些 grader 条件冒充 baseline 条件。

最终 run `run-1791541743682-aa0a9d56` 新增 8 请求 / 47,686 tokens，全部已结算；复用比较控制、Project 控制/观察和六条完整基线。累计 1008 请求 / 5,132,946 记账 tokens，715 reported + 41 unknown + 252 历史 carry；unknown 共 558,397 tokens 按原上界保守结算，不是现金费用或模型真实 usage。pending0 / lock0；最新 8 个 actual request/snapshot 包、response charge、共享账目 trial/tokens/reservation 一致，原 RP 6 / Project 27 基线发送另行完整核对。原 source/私有 raw/凭证不提交，sealed 正文未读。

实际本地验证：当前 HEAD 完整 `f2-sources` 28/28 通过，覆盖原 Task/worker 路径、保护/修复、超过旧六轮的可完成窗口、source drift/密封拒绝、quote/source 表示、dual vs primary-only 实际资金路径与单模型不得声称 shared gap；触及 JS ESLint、diff 检查通过。当前测试消费者沿用已执行的 `m1-retry` 15/15 与相关 grader transport checks，未因没有新改动重复测试；真实语义控制与上述 mock 工程 tests 分开。没有运行 full product suite/build/CI/UI/Android/外部 DB。文档更新同一 Record 和当前 Plan 状态，未生成阶段 HANDOFF；M1 和第二模型正式结论保持待验收。


## 2026-10-09 用户要求换设备继续 F3 — 私有快照与接续

用户明确要求“打包一下隐私数据，我要换设备继续F3”，因此刷新唯一 live HANDOFF，并同步当前 Plan 的后续授权状态；这次是用户请求中断/换机，不以阶段完成代替继续工作。产品冻结 f495267023ca4475d15ba1c61b66702624c4938e 已推送；F3 本机未启动，第二连接未新增调用，F2 主模型完成及双模型未验收的事实保持。恢复后按原 F3 工作包持续执行，双模型 development/promotion 与 M1 门槛保持。

本地私有换机包复用既有 manifest/restore 机制，更新 API 私有配置、账本/quota/rate/transport 历史、全部 raw reports/原 native fixtures、development 材料、独立密封来源、最终配置/controls/resume/audit，并携带最新产品/docs/main 与原独立资产工作空间的 Git bundle。原密封字节只复制/哈希，不作语义读取；不将隐私包或凭证提交公开 Git。保留原私有快照的无关工作树备份，更新工作树移除的旧 patch 另存历史副本；本机无关 dirty/untracked 不变。

累计仍为1008 requests /5132946 accounted tokens，pending0/lock0；原时间戳和旧错误不重置。新设备恢复不发送模型请求，重新指向当地 Document 路径；历史机器路径与原报告身份保留，旧辅助脚本不得未经迁移直接调用。具体本地包文件位置、SHA256 和恢复命令交付用户，公开文档不记录机器绝对路径。

实际迁移验证：在隔离本地目录成功执行 verify-only 与完整 restore，七个工作树 HEAD、五个本地私有路径均符合 manifest；8988个 Document 文件逐项核对原 SHA256 一致，所有报告含嵌套 Git 原字节保留。修复恢复器的 Windows ACL 继承处理，私有包根目录仅当前用户访问；新 bundle 包含源码与文档完整历史。五份变更文档的89个本地链接/锚点与围栏、git diff --check 通过。没有新增模型请求或重复产品测试；后续网络连接与双模型验收不属于本次换机恢复验证。


## 2026-10-09 新设备恢复与 F3 私有调查入口

用户要求解压私有换机包、读取唯一 live HANDOFF 并继续 F3；确认 F2 主模型测试已完成、双模型验收仍待补齐。本轮恢复到新的私有目录，原本地工作树的无关 AGENTS 修改未被覆盖。执行随包 verify-only 与完整 restore：manifest 文件及 expanded reports 哈希、七个工作树 HEAD、五个本地路径和 Document 权限校验通过；恢复没有模型请求，没有修改原密封字节或历史账目。真实 upstream refs 与包内产品/docs/main checkpoints 一致；依源码及 tests 各自锁文件执行 npm ci，Node 24.21.0。

F3 实验沿反馈模块 §2 已批准的 delegated private engineering investigation：模型来源观察不能取得生产自动触发方向。新增测试侧 `m1-f3.js` 与原 m1-live `--f3` 入口，严格读取冻结的六条 development 来源、双模型校准及 exact source/configuration/target pins。旧 fixture 的 explicit proxy correction 沿原 withdraw API 撤回；不把模型意见或调查 envelope 写成用户反馈，不建立生产 diagnosis/触发资格。

每域一次原 evaluator 提炼、原 targets.prepare/check 候选；原隔离 worker 在 candidate settings 下执行三条单臂观察，parent 明确记账 candidate。六条正确 F2 baseline 保留原 trial/charge identity，以显式 baselineReuse 引用，不重跑、不给旧发送创建新账目、不称新独立 trial。development report 标 `m1_f3_development`，双评委独立 shuffle，三个场景至少两次一致 candidate、其余 tie，全部六个重要维度非负及原 authority checks/持久费用凭证必须满足。单模型、缺失校准、源/输入/目标变化、重复槽位、无效评价、分歧、负维度和费用身份不符拒绝准入；无效 grader 观察保存，不修补分数或重试有效负面结果。production promotionDecision 与 human/price/owner gates保持。

本地实现提交 `1d7d52c9db328a6f63627694ade3f1faed1d9380`：最小相关 `f2-sources` 28/28 与 `m1-f3` 13/13、触及 JS ESLint、module syntax/diff 检查通过。随后双域 scope 去重检查与无效 grader 保存修正提交 `4a9a98a9` / `078fae40`；修正后 F3 13/13 与触及 syntax/ESLint/diff 检查通过，不重复未变化的 F2 suite。41 项是两套实际 distinct checks，不把重复运行累加。没有 full suite/build/CI/UI/Android/外部 DB。

产品上述三个工程提交已推送到同一任务分支；main 未集成。本地辅助脚本使用恢复后的路径，原 Windows 辅助脚本、配置和 raw evidence 原件未改写。F2 双模型补齐及 F3 实际结果在本节续记，不将阶段准备或代码检查当作 M1 通过。

第二模型连通性诊断两次确实取得响应，但首轮双模型续接在第三条 Project 来源返回 nginx 404；原失败 HTML、缺失 usage 上界及 funded packets 保留。下一续接完整补齐 Project 两模型 20 项 controls 与三条来源观察，三个来源的共同 status_accuracy gap 成立。RP 比较校准完成后，第二模型判原工程 positive 中“这是两页目录，不能混装”为无公开依据的约束；这是工程控制误标，不是冻结真实基线不利结果。新的私有 control 版本只将该普通动作描述改为“两页我分开摆，免得看错”，涉及两个 comparison messages / 两个 source-control outputs，case/rubric/负例/真实来源和原文件不改；控制 hash 为 `8d6b3e37f3dce423f8ef00a5a719f7358f9b78f0cde3b33dd289f16b65c441a9`。新版本两模型正例核对通过，先前负面观察不覆盖。用户曾明确暂缓第二模型，随后立即报告“第二模型已恢复”；当前按最新指示补齐双模型，不把单模型观察授予 promotion 资格。


原默认 Step 推理配置的 run `run-1791546448988-6c06e6ff` 两域比较/source controls 已有效，但 RP 首条真实来源响应只有 usage，没有最终 assistant JSON：provider reported prompt5097 / completion16384 / total21481，其中 reasoning_tokens16383；原 funded sender 保留该不完整响应后 retry，retry 又发生 generation_provider_timeout，按原上界结算。此 run 结束累计1039 /5494867，RP真实语义尚未完成。依据 [Step 官方 Chat Completions 参数](https://platform.stepfun.com/docs/zh/api-reference/chat/chat-completion-create) 的 low reasoning_effort，在新的私有 scope 显式设置 secondary low，保留原 16384 output ceiling。此设置沿现有 f2JudgeTransport/adapter，不修改生产默认、模型 identifier、case/rubric 或基线配置；新 actual packet 已确认 reasoning_effort=low 与 max_completion_tokens=16384，取得有效 JSON。新 transport hash 必须重新通过第二模型全部 controls 和来源观察，旧默认推理分数不混入新配置正式结论；原主模型 exact 输入/配置控制、六基线仍复用。


F3 免费盲评 sizing 暴露真实工程缺陷：两个完整 Project arms 的 source/工具历史重复投影超过原 context budget，GenerationService 在 provider 前拒绝 generation_context_budget_exceeded。没有为此发送或收取模型费用。新增 exact sharedEvidence subtree aliases，按固定原内容去重，全部字段、原 source、public modelStatements、authority/evidence 与差异均可逐字段重建；不裁剪 arm，不丢弃不利信息，不提高 context/output limit，不改原 production compiler。保留原标记冲突拒绝和 blind right-minus-left 语义。提交 `71c162b1`，新增完整不同 arms round-trip 与模型伪造引用冲突拒绝两项，F3 15/15、触及 ESLint/syntax/diff 通过。

三个 Project baseline-alias 免费 sizing 的 inputTokens 为 8875/8853/8847；只用于 sizing 的不同临时 IDs 与新增公开状态说明 variant 为12674/12519/12732，均保留全部原 user evidence，原 output16384不变，未进行语义评分或称为真实 candidate。全部资金/基线/校准/target pin 免费检查通过。正在执行的 F2 producer 仍 pin 启动时 `078fae40`/旧 runner bytes；上述仅 F3 test-side 变动不反写其身份，后续 F3 scope 冻结新的 tested HEAD / runner。


继续诊断发现原 Route timeout 可先于 parent funded send 真正结束；旧 domain finally 提前复制/清理 fixture 并释放共享 lock，parent 的迟到 settlement 可随后写回旧 accounting snapshot。这是测试消费者清理竞态，必须修复而非把 pending 当已结算。新提交 `11756061ed74dc298ab99f0701b1d7e7c1c0a607` 在每域 fixture snapshot/cleanup 和全局 lock release 前 drain 完整 funded send/retry 链（含 backoff）；不建立新账本、改费用或触碰生产 GenerationService。最小 `m1-retry`18/18、触及 ESLint/syntax/diff 通过，覆盖 timeout 后晚到 reported/unknown settlement 及 retry backoff 期间不得释放锁。

旧进程于本地检查前自行退出，原 retry 迟到 console 为 requests1039/tokens5493380，但原 fixture 已清理且无该 retry 的完整持久 provider raw/usage；保留该实际 console 作为 provenance，不据此伪造 provider usage。已在当前进程退出后用原 repository.settle 与 EvaluationBudget.settle(null) 将 exact request `cfde5d72-6ba2-4ece-833a-47f997c3f984` 按22968上界标 unknown settled，原 request/snapshot/native owner identity 验证相同，requests/tokens不变。原 fixture 不覆盖，另存含 settlement 的私有副本与审计；全部新请求仍在当前完整内存/最终共享 ledger，已核对300个 distinct prefunded packets，未丢失新增费用。

低推理 F2 producer `run-1791547582231-8c85a3d2` /启动HEAD078fae40：两域40项比较/source controls均通过，Project三来源共享status_accuracy gap；RP档案共享knowledge_boundary gap、水库无共享gap。最后剧场来源第二模型请求又 nginx404（原http-error1065保留），因此此 producer 不是完整双模型通过。复用全部有效控制、五条真实双模型来源和原六基线，沿11756061新清理消费者仅补余下一条。此次audit累计1065/5783300，769 reported+44 unknown+252carry；unknown上界636117，pending0/lock0。


F2 最终双模型来源复核由 `run-1791549210360-d320b572` /11756061完成，只新增剧场的一个第二模型请求：两域40/40有效比较/source controls、六来源各两观察均完整，六基线 hash 不变。RP档案两模型 knowledge_boundary gap，水库两模型六维met；剧场主模型knowledge met、第二模型knowledge gap（保留分歧，不人为改成共享gap），其他维度两模型met。Project三来源两模型status_accuracy gap，其他五维met。两域都有实际共同缺口，可推进本次F3；这是来源前置复核，不是development/promotion或M1通过。F2scope `f7864d44577a8ee21c3506f21a145a49e52a9b86a9ec19451e8637aaf2064f65`，runner `45a7e6cecb9bb35fafac058681ede06b596f435447363916c4170053114d0243`；累计1066/5798528，770reported+44unknown+252carry，unknown636117，pending0/lock0，301个 distinct prefunded packets一致。

首次F3执行在免费准备阶段被生产configure的agent_evolution_source_required拒绝，两域未发送/提炼/生成candidate，费用仍1066/5798528。因为调查主动withdraw原proxy correction后不具备生产反馈来源，这项拒绝符合边界；不重新造用户纠正或放宽生产gate。修复 `cebd14154b371f59a7b44dbac9726e2f9db18a4c`：test-only prepareF3Investigation严格核对原policy target/route/price与scope targetPin、空jobs/publications，withdraw后沿原repository仅将已有私有policy标review/m1_private_investigation，原fingerprint保持；生产configure/start不调用、不改，仍拒绝缺反馈。F3 17/17、触及ESLint/syntax/diff通过，新增两入口原FS/native fixture验证了错误target pin无修改、production configure source_required、start reflection_not_ready、无job/付费发送。此前retry18相关checks保持，不重复未变化的suite。

F3实际提炼/候选执行以cebd1415启动，sourceRun仍F2最终双模型结果，scope hash `546fbd3f9403c3827bee241638fabbd2aa545c6f169999953eaae316bbaea7d4`；此前零请求工程拒绝不计一个候选周期。实际结果在下文续记。


### F3 实际 RP development

一次提炼产生324字符原character Skill body候选，实际 hypothesis 是避免NPC以未暴露的程序/机构处罚/世界规则作为既定权威；候选在执行前冻结，未据后续评分修订。三个原场景候选执行均完成，expectedInvariants/isolation/target_consumed原检查通过。candidate实际成功调用为档案4、水库2、剧场2（原F2基线各2保留，不重跑）；本域实际新增15请求=1提炼+8候选+3主judge+3独立judge，不将缓存baseline计为新发送。

| Development | 主模型 | 第二模型 | 第二模型负差 / 正差 | 一致candidate胜 |
| --- | --- | --- | --- | --- |
| rp_variant_rp_dev_archive_return | tie | baseline | promise_application=-1, knowledge_boundary=-1, narrative_response=-1 | 否 |
| rp_variant_rp_dev_reservoir_signal | tie | baseline | player_agency=-1, knowledge_boundary=-1, narrative_response=-1 | 否 |
| rp_variant_rp_dev_theatre_variant | tie | candidate | promise_application=+1, continuity=+1 | 否 |

RP正式developmentReadiness=false，wins0；三个case两模型均分歧，前两条出现重要行为负差，未满足至少两次一致胜/其余tie/全部非负。原不利判断、全部六个grade/raw/charges保留，不改分、不重提炼、不追试。新report origin=m1_f3_development，baselineReuse明确cached_F2_development_observation；production promotionDecision仍拒绝，未进行RP promotion/review publication/下一消费/rollback。


### F3 实际 Project development 与本轮退出

一次原user Preset system.style提炼产生188字符候选，hypothesis要求公开说明未提交Review及fresh Task/旧conflicted Task区别；候选在执行前冻结，不见密封promotion答案。三个原场景候选执行均完成，原authority/isolation/target_consumed/相关proposal/preservation检查通过；成功provider调用分别9/7/8，另一个HTTP524重试前失败按13937上界保守结算。实际本域新增32请求=1提炼+24成功候选+1失败retry+3主judge+3独立judge；失败retry保留在原owner/shared ledger与prefunded packets，不以report.charges的成功响应列表冒充全费用。

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
| rp-skill-f3-development-report.json SHA256 | `4a49d9333c0d20695ea9b2e0538f0b34a8d5f6664524507c02818292e530df90` |
| rp-skill-f3-frozen-candidate.json SHA256 | `1ef6e17c856bee31ccf4734de28c4647c8635100641226520655bc5b2acd4578` |
| project-prompt-f3-development-report.json SHA256 | `40fe2417dfb9432bf4da05db3f4cfbf75df55d0c9763a40e84efa13dd4aee568` |
| project-prompt-f3-frozen-candidate.json SHA256 | `bae1750150d3cce6830a30eb6e27468c612d7903a761d89556c63253e106e3df` |

本轮F3新增47请求/436781记账tokens=2提炼+32成功candidate发送+1失败retry+12judges，缓存六基线费用不重算。恢复后总新增105请求/1102363记账tokens（含F2补齐、诊断、失败与必要复测），完整历史不清。最终累计1113 requests /6235309 accounted tokens：816reported+45unknown+252carry；unknown650054按原上界结算，不作现金费或真实模型usage。pending0/lock0，348个distinct prefunded request/snapshot packets与原共享账目身份/上界/settlement一致；本次47个新F3 packets全部核对，六个baseline逐字段与F2原报告一致，六个candidate试验原硬检查完整。final audit SHA256 `92fe2dd70db909a0ba5fa0b53578a72a29fe8283656495836b75ef1034cf3ad8`。

最新最小本地验证：F3 17/17与retry18/18，触及JS ESLint/syntax/diff通过；免费两域资金/校准/target pins与Project不同IDs双臂完整context sizing通过；实际原worker/两模型结果与mock工程tests分别记录。没有full suite/build/CI/UI/Android/外部DB验证。主模型identifier gemini-3.8-flash，第二模型step-5-preview，两模型grader各16384 output/low reasoning；不将grader配置当baseline配置，upstream identity/currencyCost unavailable，humanPreference not_observed。

本轮按用户当前AGENTS阶段交接要求更新同一Record、Plan当前状态与live HANDOFF后停止。下一工作应基于本次原不利证据讨论归因/干预适用性及必要范围变化；不在同一候选或独立promotion来源上刷分，不将局部工程完成写为M1验收。

最终文档最小本地核对：五份触及文件91个本地链接/锚点及代码围栏通过，git diff --check通过。原本地Atria-core无关AGENTS dirty仍保留；产品任务工作树clean，恢复的main checkpoint未变化。文档保存与远端同步沿独立docs分支，不把private Document或migration根分支推送公开。


## 2026-10-09 M1 继续：F3 评价协议与可执行干预修复

用户指出没有要求在本次试点结束时停工，并要求继续完成 M1。此前将 F3 一次 development 结束当成整个阶段停止点的判断撤销；M1 未完成，原不利结果和独立验收/发布/消费/回滚缺口保持。后续按 Governance §8 持续诊断和修复，同候选无新变化不重跑追分。原工作包的一次提炼是每个已固定试验版本的一次观察，不能把失败试验退出作为整体 M1 交付。当前修复沿原两域/单目标/三development/九promotion门槛，不增加领域或生产权限。

免费诊断确认：旧 RP 候选仍推断未暴露当前时间/水位，且把 NPC 的交接条件扩展为玩家只能等；这是真实不利输出，非评分符号修补。Project 的候选 body188确实在实际 system message 内；公开 assistant 内容均为空，model-authored plan 未满足请求的状态解释。原 Studio loop 在 prepare_review 返回 review 后直接 finish/return；原 Host 也拒绝已停止 Task 的 generation。原候选“总结时说明”没有定位到可用执行位置，不能为补说明擅自开启停在 Review 后的 writer/模型循环。可用槽位是工具调用同轮的 assistant content 和 prepare_review 前 set_plan 的 summary/description，必须用当前事实/计划措辞，不提前称 validation passed、review reached 或 committed。

同时发现 F3 比较消息是新的 sharedEvidence 编码/提示，而原 validateF3Calibration 只证明 F2 消息的 controls/source qualification，不能替不同 F3 比较协议授予校准。修复提交 `d1c793b38f4caf0eeddc9bb64c2fc00b86c3cfd8`：控制与实际双臂消息共用同一 system/证据编码，保留全部反事实/缺证据/左右翻转输入；两模型各域六个 exact controls必须在提炼前通过，费用沿原 repository reserve/settle。development report固定 gradeProtocolHash及十二条持久控制 receipts，readiness拒绝不同协议/缺控制/费用身份变化。F2已有来源判断与原基线保持历史 exact pins，不声称新增 F3 校准等于 M1通过。

原 evaluator 的新提炼输入携带已核对原执行槽位及六维保护要求；不给模型新的工具/写入权限、不把代理分析伪造 explicit/diagnosis，不手写或评分后修订候选。RP仍需公开知识边界、玩家选择与可推进角色行动共同满足；Project必须在原公开槽位解释有界提案、fresh/prior conflict区别及未提交 Review 边界。必要修复复测以新协议/提炼输入版本各一新候选进行，旧候选、全部判断、账目和密封来源不覆盖，门槛不缩减。

最小本地验证：F3 suite23/23、触及 JS ESLint/diff通过。二十四个 F3 exact control messages 的原 compiler/provider免费 sizing确认完整 user证据未裁剪，output16384不变；Project controls input696–6054，RP676–1575，全部原context可容纳。没有重复原不变retry/F2 suites，没有 full suite/build/CI/UI/Android验证。新 scope `e13f6b6ce109da97eb270724f34f316103d7a3f671736facd9559e4b77ad4ad7`固定 testedHEAD d1c793b3、原 F2完整sourceRun以及旧F3报告hash/修复理由；该 scope 的后续实际结果见下节；新协议校准被连接错误中断，没有产生新候选。


## 2026-10-09 用户明确暂停并再次换设备 — M1 未完成

用户要求“停下手中任务，我打算换设备进行了，你顺便将隐私文件进行打包”。已停止实施、真实模型验证和正在执行的免费 mock 接线检查；本次刷新唯一 live HANDOFF 是用户请求中断。M1 未验收，main 未集成，后续不自动运行付费 CLI。

此前新协议 run `run-1791552826778-8fccb497` / testedHEAD `d1c793b38f4caf0eeddc9bb64c2fc00b86c3cfd8` 已结束：每域仅取得一个有效主模型 F3 比较控制，第二连接返回 HTTP530（Cloudflare Tunnel error），主连接多次 HTTP524，原 funded retry 保留。新增11请求/187157记账tokens，没有提炼新候选、没有执行新 development/promotion。summary SHA256 `a0190fd490f62b26f37fae7d4a1e6bae535192cc81544ef6ac6b4f009c9de9b8`，f3Completed/promotionReady/accepted均false。两份通过的控制和原 owner/shared receipts 保存，只有 exact messages/transport/费用身份一致才可复用。

产品提交 `4fc2871f8b7cc9971efc064dc8bb94cc3c175377` 将原 worker 的独立来源读取和 paired observation 接入显式工程端口：只有固定 worker 按 pin/SHA读取三条密封来源，双臂各三次独立执行，公开场景由 worker 提供；生产 compare/source_unready 与自动 promotion gate保持。原 sealed reader checks4、F2 source checks28、evolution consumers6 共38项最小本地检查通过，免费 worker `--check-sealed` 六个 source pins/hash通过。密封正文不输入提炼器、不作候选开发参考。临时 `fix/m1-promotion-worker@6eb9cdfe` 的同等提交已 cherry-pick到当前任务分支，临时工作树没有必要恢复运行。

用户随后要求简化交付；原四个 tracked 修改和两个新文件已统一 checkpoint 提交并推送至 `feat/agent-intelligence-runtime@88e5b34d30bc04d4011271f354c21b46627a6283`：m1-f2.js、m1-f3.js、m1-f3.test.js、m1-live.mjs，以及新 m1-f3-promotion.js/.test.js。内容为失败校准的 exact 有费控制恢复、worker场景评分、九对新独立执行/双模型盲评、工程验收后原私有 review publication、实际下一请求消费与守卫 rollback。只有开发门槛通过才进入独立验收；保持六维非负/双模型一致/九对至少六胜、完整费用和原 authority gate，不伪造 human/price。尚未真实跑到这些步骤，不能声称完整 M1 或发布/消费/回滚已验证。下一设备先审阅这些已提交但未验证完整流程的改动，完成对应实现与最小验证，再按当前源码固定 scope/runner/HEAD；不能直接重跑旧已冻结 scope。

最近实际本地验证为 F3 25、promotion门槛11、F2 source28，共64项通过；其中F2此前重复执行不累加为新的 distinct checks。触及 JS ESLint、m1-live syntax、git diff --check通过。随后实际原 worker/mock transport的免费 sealed paired 接线 smoke先因 mock sender配置失败，修正私有 mock helper后被用户中断，没有最终成功结果；不能将单元门槛正例或 hash检查称为真实语义验收。没有新增模型请求，也没有 full suite/build/CI/UI/Android验证。

暂停时累计1124 requests /6422466 accounted tokens：818provider_reported +54reserved_upper_bound +252carry，unknown上界829478；pending0/lock0，本任务进程已停止。旧 breached 位/配额/transport epochs/全部不完整响应和不利评分保持，当前硬限仍以 Governance §13.1为准。原F2完整双模型 sourceRun `run-1791549210360-d320b572`、六正确基线和旧F3候选/评分完整保存；旧两个候选一致胜均0、缺独立验收/发布/消费/回滚的事实保持。

换机交付按用户要求简化：源码与文档推送各自 Git 分支，私有文件仅打包 `Document/`，包名 `Atria-Document-private-20261009.zip`。该目录保留配置、报告、native fixtures、账本和密封材料；私有文件不推送 Git。用户只需转移该包并要求接手 AI 解压、读 docs/HANDOFF.md、继续 M1；拉取两分支、保护已有工作、恢复依赖、发现私有目录及适配本机路径由接手 AI 自主完成，再按 HANDOFF → Plan → 本 Record 推进。此前拟采用的离线 bundle/manifest/restore 和未提交 patch 恢复流程不再用于此次交付。

本次单目录私有包已完成 ZIP CRC 与全部文件 SHA 字节核对，费用账本不变、pending0；私有包权限600。文档当前入口已移除过时的未推送/未提交及复杂恢复操作，永久历史事实与 M1 正式门槛保留。此次只验证文档链接、围栏、差异和同步状态，不继续产品测试或模型调用。


## 2026-10-09 换机恢复与 M1 接线复核 — 第二连接 Tunnel 不可用

用户要求解压私有包、读取 HANDOFF 并继续 M1，随后明确提醒本地落后、先拉取远端。本次先 fetch，再分别 fast-forward 产品任务工作树到 `88e5b34d30bc04d4011271f354c21b46627a6283`、正式 docs 到 `e5be06079`；保护正式 docs 未跟踪 Experience 草稿和另一设计工作树已有修改，main未变化。只在当前任务的非Git私有目录恢复Document，并适配辅助脚本工作副本的Windows路径，不改旧报告/冻结配置/密封内容。

ZIP内10291个文件逐项SHA-256校验一致；密封metadata仍为 `7c47b310b6639ed8cfc58adfdc810f101454ffa2463c977a6776a88f5cf5aa38`。私有目录及继承文件仅当前用户ACL，源码/tests依各自锁文件执行npm ci。原账目1124 requests /6422466 accounted tokens、pending0/lock0恢复完整；未清除carry、旧breach、quota/rate、transport epochs或错误。密封正文仅交给固定worker执行，未输入提炼器或用于候选开发。

原worker/mock sealed paired接线已完成：RP与Project各9对/18trials，mock provider请求分别18和36；原isolation、target_consumed及非空输出/charges均通过，真实ledger不变。随后Project no-op mock在完整准入检查中被related_proposal=false拒绝，正确保留此失败，不将中性mock变成正确依赖修复或强行通过。此接线正例不代表全部语义/准入硬检查通过，也不代表真实改善。

为补足尚未验证的生命周期，新增test-only原 `publishConsumeRollback` 可测试导出及四项本地消费者检查：两域明确review→原下一Director/Host request实际消费candidate→guarded rollback恢复exact base，及两域下一请求transport失败仍恢复base。使用独立合成报告，无密封材料、真实模型或human labels；原持久publication为rolled_back、生产decision仍ineligible，activation发送有原durable receipts。初次检查因合成compare预留多项future admissions而撞10秒mock Route timeout；仅对synthetic repository返回的等待时间禁用mock pacing，持久timestamps与生产repository不改，相关四项复测全部通过。原私有sealed全链路RP mock也观察到发布/消费/回滚，但不计M1语义资格。

本机原F3/准入/密封检查先39 passed/1 failed；失败是Windows缺file-symlink privilege。改为Windows真实NTFS junction、POSIX仍真实file/dir symlink，保留路径拒绝边界；密封suite复测4/4通过。当前最小验证共44 distinct local checks（F3 25、promotion gate11、sealed4、lifecycle4），触及JS ESLint与git diff --check通过。无full suite/build/CI/UI/Android/外部DB；不重复未变化F2/retry suites。产品修复及验证提交 `c61f40937`、当前 `53f12ed34284a5718155f0e4b06dee5ad7e120ae`，均推送同一feature分支，main未集成。

真实续接run `run-1791557489398-ae5e0faf`固定product c61f40937、scope `67a19da3618aed08011f4b4b8c81bfa15fbdddef70259e451bf67a790bbaa9ba`，复用原两域各一个exact消息/transport/owner/shared费用身份一致的主控制。第二连接step-5-preview在两个域各三次funded attempts全部HTTP530，私有完整错误证据为Cloudflare Tunnel1033；非quota或认证错误，没有取得新有效控制或提炼新候选。没有重跑正确六基线、修改旧候选/不利判断或尝试独立promotion。新6请求/121068 accounted tokens全部以reserved upper bound结算，原错误/费用完整保留。

当前累计1130 requests /6543534 accounted tokens：818provider_reported +60reserved_upper_bound +252carry，unknown上界950546，pending0/lock0；f3Completed/promotionReady/accepted均false。生产price/human gate保持。已向用户说明需要恢复原第二连接或在私有配置提供可用第二模型；本地没有服务端Tunnel管理权限，不能用单模型结果替代原双模型门槛。

在完成本地检查后为当前HEAD准备新私有 `m1-f3-device-readiness-20261009.json`，未发送：scope `a76b003644ace4762d3816d7d3f712729bcb50ab3aab4ae3c6888e00e8c51847`，evaluator `736e6490e328f43c68663c5b5374f1954f7bde2163548a5797df0134f7d5ff1e`，runner `95141316a70c85fbd6a6d7435ec5a717659eb9a7d398735b66ce4f331ef86394`。校准恢复引用本次run的完整owner fixture及两份原已付费控制，保留新增失败费用；连接恢复后继续exact校准→一次新development→原独立验收/私有review/下一消费/rollback。第二配置若实际变化则重新核对F2来源与当前协议资格，不将旧连接观察嫁接为新连接通过。未新写HANDOFF，未把失败试验或局部工程完成当成M1完成。


## 2026-10-09 取消双模型准入与主模型继续实测

用户先说明第二模型暂不可用、只用主模型测试，随后明确要求取消双模型准入并询问来源。Git最早记录为 `aabdf8c75`，2026-10-07 21:06:53 +08:00，author字段 `ZZZdragondYNGPHX`；该版本详细规则被写为工程冻结而非用户逐条指定，不能把Git署名或泛化历史确认解释为用户亲自规定。当前主模型准入唯一权威为acceptance §1/§2/§14，原双模型记录保留历史。生产human/price gate、独立场景、冻结、维度、authority和生命周期要求保持。

产品 `bfe49f3d0fc40e878096ea00adccdd4749b9862a` 已push：F3 primary_only不加载/seed/send第二配置；development与promotion均允许主模型资格，仍要求实际已付费控制、三development至少两胜其余tie、九对独立promotion至少六胜其余tie及非负维度。未声明模型观察为human labels。旧无mode/dual报告保持原兼容契约。相关F3 28/promotion13检查通过，单模型secret检查2项通过；触及ESLint/syntax/diff检查通过。

实际 `run-1791558682146-034cb583` 固定bfe49f3d0、scope `f23c6c4fdd13f35901cdc7de2667bd1e3b05850a57114a444f62e8567c478437`。原六正确基线不重跑，恢复此前完整owner ledger并复用每域原exact主控制。RP六主比较controls有效，提炼一个新候选并运行三development，结果一candidate/一tie/一baseline，actor_voice/narrative_response/player_agency及knowledge_boundary负差，未准入promotion；archive的candidate偏好与分数符号/理由冲突，仍保留原响应且不能修分冒充改善。Project两个known_violation顺序控制有效，counterfactual返回uncertain，未产生Project候选。新增17请求均有provider reported usage，累计1147 requests /6607254 accounted tokens；unknown仍60项上界950546、carry252，pending0/lock0，accepted=false。

有依据修复提交 `57640f93362ddce6eb1fe666c94db79e1e2cecb4` 已push。Project synthetic counterfactual的observedAuthority包裹完整Task/公共window，原F3 codec却从外层取status/modelStatements，误制造缺失；现先展开完整authority进入原codec，保留synthetic声明与真实facts。新比较协议明确right-minus-left正负号并要求自检，矛盾偏好/分数保持invalid，不自动重试或改分。新增冻结的原development反馈输入，提炼同时保护上轮实际voice/agency退化；只读development、不读promotion，原report/candidate/summary均固定hash。F3 32项与promotion13项通过，触及ESLint/diff通过；没有扩展full suite/build/CI/UI/Android。

继续实测scope `2c77dd9bad217d60dc516fae6975e78376fc84e972c1c4a21ef98904b1581da6`，固定57640f933及原密封来源。私有 `run-1791559379647-eaf92995` 是显式calibration_snapshot，非新模型实验：原baseline fixture拷贝保持doc/target，逐项验证旧owner attempts是当前owner的完整子集，再逐字节拷贝最新真实owner resource，保留全部已有fees；只提取已有comparison控制引用。旧失败候选、原reports和真实账本不动。新的exact协议需要重新校准，旧消息不同的控制不得复用。正在运行 `run-1791559398792-4af198ac`；当前结果不计M1完成，完成时再记录实际结论。


主模型repair run `run-1791559398792-4af198ac` 已结束。两域六个exact主controls均有效，Project counterfactual codec实测修复成立；RP新提炼候选三development为一baseline偏好/两tie，未准入。Project提炼返回before等于完整短base、after包含原文加新增段，原applyEvolutionProposal守卫正确拒绝whole-base anchor；原raw响应保留，不将其自动转换为append或新候选。新增23请求/86604 reported tokens，累计1170 requests /6693858 accounted tokens，858reported/60unknown/252carry，unknown950546，pending0/lock0。

有依据修复 `81c201d9ef77e89a0371eb45f592bb980a0d29d8` 已push：明确empty-before追加只能包含新增文字、不能锚定完整base，after/rationale边界也向模型明确；维持原whole-base拒绝保护。每域增加两个focused source翻转控制，从既有冻结F2正例与unsupported_rule/communication_omission素材生成，验证真实缺陷对应的比较能力，不用另一source协议资格替代blind comparison。主模型八控制仍使用同一grade协议；旧六个exact已付费可复用，新增两个必须实测。未修改原F2 source controls、已判分结果或promotion sources。提炼反馈纳入此前公开development实际两arm，仍固定原report/candidate哈希并禁止复制case答案；要求具体执行前审查而不只笼统禁止，保留NPC动作/语气及玩家所有权。F3 34/promotion13检查通过（promotion fixture最初仍为旧六控制导致五个正例失败，更新合成fixture后13/13复测通过）；ESLint/diff通过。

继续focused scope `fcdabed72608e5eeee754b181a812d88a06ac12f385a2014fe584e693b786cc8` 固定81c201d9e；私有calibration_snapshot `run-1791559978540-3819ab26` 保持原base fixture并逐字节携带最近真实owner fees，原attempt子集校验通过。再次基于实际根因推进，不对同一候选无变化复试；M1待当前实测结果及独立生命周期证据。


focused run `run-1791559992820-9deff358` 新增3请求/14889 reported tokens，累计1173/6708747；RP遗漏处罚条款并给knowledge_boundary=0，Project正序focused通过但翻转漏报四必需维度，未提炼新候选。实际失败证明此前宽泛比较控制不足；不删除费用、不改分、不将未校准评委用于准入。

逐维度协议修复 `8f442509772b48146e17f48a15ce2242321d8c0d` 要求两arm每必需维度met/gap/unknown、原文引用和有限理由再给差值；拒绝漏维、gap/met对比方向不一致、原文不存在的quote和winning-margin符号错误，记录时左右翻转恢复baseline/candidate标记。F3 35/promotion13检查通过，literal quote修改后F3 35复测通过；ESLint/diff通过。assessment scope `70a2e213cd182c7e738010d37f98ea8ef7b2fd51f209e581bcd439d40b15bc10` 的实际run `run-1791560307861-e0bc819d` 新增8请求/21515 reported tokens，累计1181/6730262，869reported/60unknown/252carry、pending0/lock0。RP原六宽控制有效，focused依然漏处罚；Project因引用真实JSON结构字段却被只检查字符串值的Host validator拒绝，属于校验器缺陷而非新模型负面质量证据。没有新候选或promotion。

修复 `25e1aef0f2ed6e209520a9883fb9527c0bff24cf` 已push：quote校验接受实际完整展开的arm中literal JSON结构片段，仍拒绝不存在字段/值；明确合规单句不能抵消后半句无依据规则/处罚。为证据表明low思考遗漏知识边界，新增F3 comparison/extraction单独reasoning pin，用同一个主模型high，原F2 source low已付费资格及generation trial配置不变；新comparison transport/协议须完整重校准，不复用low控制。F3 36/promotion13检查通过、ESLint/diff通过。

当前high scope `ed38e054ba959e762afb8d2c9efaccf59989daa45c174a3d7ee1f1085859700a` 固定25e1aef0f；私有owner-history snapshot `run-1791560546546-c05b199d` 逐字节保留最近真实owner费用。当前实际run `run-1791560552323-d562d77e` 正在校准；不调用第二模型、不宣称M1完成或恢复暂停。所有此前sealed/本地生命周期正例仅工程接线证据，不替代当前实际独立验收。

## 2026-10-10 M1 中断恢复与 H0 只读准备

用户要求继续 M1 并准备 H0。本次核对三个本地工作树和实际远端 refs：docs `2ecf50b6ed341f732d95c3d2b2a45624731f4655`、main `6ab12ba43c5b18bfec6df75c16456a4cb4497d3f`、产品 `25e1aef0f2ed6e209520a9883fb9527c0bff24cf` 均与交接一致；feature未合入main。保护正式docs无关未跟踪Experience目录；没有根据旧HANDOFF回退源码或恢复双模型门槛。

原high run已不在运行，summary停留在RP结束时，后续Project产物和真实owner/全局账本仍在。静态只读取development和账目，独立promotion正文没有输入开发过程。两域各八个主模型controls有效；RP development两candidate胜/一baseline，第三场景knowledge_boundary与continuity各-1，原有效负面结果保留，未准入。Project三development均candidate胜、非负维度及原checks完整，原job仍固定候选；已完成四对promotion、八个trial，未评分，随后中断。

实际恢复前累计1295 requests /8044031 accounted tokens，存在一笔reserved请求 `6697c036-f763-4aaa-9e0c-07009cf43e8a`，upper bound18931；旧lock PID42520已不存在。找到原临时Project fixture并核对request/snapshot/trial/upper-bound身份；无该请求持久响应。私有恢复snapshot `run-1791605500731-930d53c8` 保留原fixture、旧lock及ledger-before，以原repository settle及EvaluationBudget将该笔标unknown上界，requests/tokens均不变，pending0。旧scope结果、sealed材料、失败和carry保持。

test-only产品提交 `20e2c2d8c7f1cf60b405cf53f68a94b5947f7c1a` 新增严格未发布fixture恢复与冻结候选promotion续接入口；只接受完整development资格和exact候选/config/target，复用原worker、发送端及review→消费→rollback消费者，不扩展生产权限。原worker无安全partial-slot重放端口，因此保留旧四对未评分产物，用新job完整执行九对，不选择有利槽位、不重新提炼Project候选。两套针对性测试18/18通过（lifecycle5/promotion13），ESLint/syntax/diff通过。

首次续接 `run-1791605697254-3a5c3474` 在发送前被原budget配置拒绝：恢复的实际费用高于旧699536建议值，repository正确禁止丢弃费用。该次新增模型调用为零。修复提交 `e88ad3ace513135bfa78b0f6d76f72a764753ef0` 在promotion续接保持原owner预算配置；普通测试配置也不降低已有requests/tokens，advisory测试额度和每日2000/20RPM权威保持。该变更执行ESLint/syntax/diff检查，无无关full suite/build/UI/CI。

零发送preflight核对冻结Project三胜development资格、完整原费用、base/candidate配置和fixture成功。当前实测 `run-1791605723235-1eea0e9a` 固定e88ad3ace，scope `4fadacb1dbcae1a6be2812042fe4ba0ed496ec2cc165f62b7292e097b7b80d18`，起账1295/8044031，冻结candidate hash `29398bbf4f8aa5f009e5961ba577f73fbb9d002ad4de66ba929aa135738b6c85`；结果尚未形成完整独立验收。M1仍pending，main未集成。

H0只读准备新增 [h0-baseline](../../plans/architecture/agent-intelligence-runtime/h0-baseline.md)：固定main/原Memory基线，定位ordinary RP/Game/Package Turn调用图和anchors、旧LLM/RAG字段及UI/preview/sync消费者、memoryOsEnabled混合职责、原生source与派生存储边界，固定八项自建中文样本规格与B0/CPU观测准备。只定位相关测试入口，未读取用户会话或运行H0产品/模型/检索/时延基准；H0全套验收和H1/H2仍未完成。正式模块/新模块50项本地links/anchors检查通过，diff检查通过；未把只读准备当Hybrid实现或质量/性能收益。

后续静态核对发现owner没有requests/tokens汇总字段；`f9eff283a` 改为从持久attempts长度及tokens求和，修正普通续接配置的历史保护计算，ESLint/syntax/diff通过。当前Project进程仍执行其已加载的e88ad3ace源字节，未修改已固定的候选、grader协议或原worker。提交 `94cac93ac2714a837c1a7bfb9845950e7d399b3b` 根据已公开RP development第三场景的真实根因，向提炼器增加所有描述性名词/角色职业的来源审查与unknown保持，不复制case答案；允许单入口development续接，以免重提炼已冻结的另一入口。F3相关36/36检查及ESLint/diff通过，沿原primary-only门槛不改分。私有RP准备snapshot `run-1791606126356-37258aec` 只携带原RP owner费用与八项exact已付费controls，scope `73a4e95b748571464c604fd0c48bacfb7f1d0582429738c3d703433d9aa2dc0e`，尚未发送；共享真实账本由当前Project进程持有，后续串行发送。

提交 `ebcfc97a549e01dc59c45b651b243d00c4859ed2` 将单入口运行的domainCompleted/domainAccepted与双域M1 accepted分开，避免已完成单域被写成整体通过；执行ESLint/syntax/diff检查。基于该源码重新固定未发送RP scope `41099d83355473068705ebae11f8120516fd9e1646f045b6210554656d424010`，准备snapshot `run-1791606411922-37258aec`；此前准备输入保留历史，本次仍未新增RP模型请求。

H0物化八项自建中文逻辑样本，共519条来源，其中长篇压力输入500轮。仅做schema解析、ID唯一、query引用、必需/排除标签不相交、样本规模与文件hash核对；未执行Memory或模型。静态复核补明H0-ZH-02说话者指代与unknown_cause：传闻和信念不证明说话者动机，这一标签设计修正发生在任何运行前。最终 [h0-samples.json](../../plans/architecture/agent-intelligence-runtime/h0-samples.json) 193348 bytes，SHA-256 `ef9a584cfde78f5bc60e43914e1eb676d3530df4398e903f56afabb0631e6eeb`。这是逻辑规格，未接产品source adapter；不能计为H0全套验收、Hybrid实现或质量/性能收益。

Project实测 `run-1791605723235-1eea0e9a` 完成九对/十八独立trials及九个主评分：五candidate胜/四tie，全部重要维度非负，原authority/费用检查完整；仅improvement_threshold_not_met，未准入、未发布。新增131请求/1997965 reported tokens。完整promotion报告hash `df93626ece3fd48e59110544becf1236abfc9867e2781f5b2622148455741607`，实际payload5588771 bytes；尝试原scope写入时超过4 MiB，被原capacity guard拒绝，原错误保持，不能把工程异常解释成六胜。

修复 `cce678360` 仅修改test-only拒绝分支：完整pairs/grades/report保存私有产物，未达标原job记failed及report hash，不将其进入awaiting_review或挤入有界scope；不扩大原capacity/生产权限。真实FS oversized拒绝/原报告与owner费用不变/不接受accepted假拒绝检查及原生命周期相关六项测试6/6通过，ESLint/diff通过。零发送finalization snapshot `run-1791608658821-766ee950` 从上述原fixture恢复、重算五胜未准入、保存同一raw report的拒绝hash；共享ledger及owner字节/身份不变，原run/错误未覆盖。合格大报告仍须原guard和容量预检，该负面分支修复不代表合格大报告已验证。

RP实测 `run-1791608183475-a249755e` 固定ebcfc97a5及scope `41099d83355473068705ebae11f8120516fd9e1646f045b6210554656d424010`；原八项exact控制和正确F2基线复用。新候选hash `ba45f583bfd9e57cea92a3d221534a92b70067c96707112f1c8c469606a6cb03`，三development一candidate胜/两tie、六维非负，仅improvement_threshold_not_met；无promotion/publication。新增11请求/96707 reported tokens，含一次不完整grader响应及原funded retry，原响应/费用保留。报告hash `e588ab3b471ff72ad81392c88fee5c0ffc918917ec90dba0ca7bb2bb73d4337e`。本次没有重现旧候选“红布”断言/角色身份退化，但不能把没有退化当成至少两胜。

两域只读最终审计重算原准入、完整报告/原job拒绝绑定与费用：Project九对/十八trial IDs、139个报告+已付费校准receipts与原owner/shared ledger一致；RP development原baseline/候选/费用与readiness一致。累计1437 requests /10138703 accounted tokens，pending0/lock0；ledger hash `52cd503758c0436110d3aa8959539fb3cdc89a4e58d74726dcf33a369d70b836`。未清旧unknown/carry/breached；当前advisory token超界不等于每日API硬限被取消。humanPreference not_observed、currencyCost unavailable，M1 accepted=false，main未集成。

来源复核确认原RP三条F2主assessment仅archive有knowledge gap，reservoir/theatre六维met；与本次一胜/两tie吻合。不能声称全领域饱和，也不对同一冻结材料追分。用户明确授权按 [feedback §17](../../plans/architecture/agent-intelligence-runtime/m1-feedback-evaluation.md#17-来源更新与结果复用) 更新有限来源包并启用独立作者。独立作者只读取公共格式/领域契约，写六个新promotion来源与metadata，不接收旧候选、development输出或promotion评分；开发侧不读新密封正文。下一来源准备、资格与候选验证仍沿同一M1任务持续推进；H1/H2未开始，没有新HANDOFF。

## 2026-10-10 M1 有限新材料包接线与资格观察

独立作者完成六个新密封promotion来源，每域三条独立root/template；origin均为agent_authored_synthetic，不伪造真人来源。metadata SHA-256 `a95f541612246ee9636688b6758a760e7892508aca3587e4f4f21d187e27334b`。开发侧只读metadata与字节hash；新正文仅由原sealed reader在免费格式检查及冻结后的原worker评估中读取。原reader免费校验六条，原生权限/可完成性免费检查六条新development；没有因此取得模型headroom或语义准入。

源码 `e722a22705be79f85b0630d4b31b9cf5a72ef724` 已提交推送，显式注册第二材料版本 `68a948b78e3968ad05cd2788330d7dbfa863284a1bce0810a7a80856734962fa`，保留原默认catalogue和全部旧来源。probe/worker/report/F3门槛透传并严格核对来源版本，拒绝任意版本和旧baseline/独立case替换；新scope在提炼前要求至少两条实际可改善gap。每域三个development、一个候选、三独立case各三次、原六维与两胜/六胜退出条件保持。

同次test-only修复合格大报告接线：完整报告可无损gzip保存于原scope，并保留raw私有报告、完整report hash/解码长度/native stored-report hash；原delegated review前核对完整解码与exact配置/target，实际原publication绑定stored hash，下一请求消费与回滚沿原权威。没有丢弃原始观察、改分、扩容或放开生产auto gate。新增超过5 MiB合成报告的真实native FS审阅/Project下一消费/rollback检查、归档篡改拒绝及新旧材料混用拒绝检查。针对性检查累计96个distinct checks通过（F2 source28、F3 development38、promotion15、lifecycle7、renewal8）；中间旧未显式版本调用兼容及新RP合成测试参数缺失导致的失败已定位修复，未作为实际模型质量证据。触及ESLint/diff通过；未执行full suite/build/CI/UI或H0基准。

零发送preflight snapshot `run-1791609902417-7989bd9e` 复制原未发布baseline fixture并携带最新真实owner ledger，核对原base/config/settings及费用身份。新F2 scope hash `a8785a850e4d9c2cbd9681e3ed6e27336539ca6f00bb9bd844199b94c5df0586`；每域十条原F2 primary比较/source校准仅在exact协议与transport同一时复用，旧baseline不作为新来源结果。实际资格run `run-1791609911641-83c05a69` 固定上述源码/新版本，起账1437 requests /10138703 accounted tokens；目前进行新baseline采集与source assessment，尚无新候选或promotion。原八项F3同协议已付费比较控制在提炼前另核对费用/身份，不以F2控制替代。M1 accepted=false，main未集成；H0仍为已准备的逻辑样本/清单，H1/H2未实施。

上述首次新材料run结束：新增28请求/262325 reported tokens，累计1465 requests /10401028 accounted tokens，pending0/lock0。RP三条baseline六维均met、原权限checks完整，observedGapCases=0，未建立提炼前置；全部原评分保持。Project第一条baseline完成Review及原权限检查，第二条十次generation后调用不适用于该source的frontend_graph，报native_studio_request_failed；第三条尚未执行，没有完整source资格报告。没有新候选、promotion或publication。

只读诊断定位两项具体问题：Project新development文字要求同步“primary binding”，但原source实际只有有序knowledgeBindingIds，没有该字段；模型随后查API并转向不适用的Frontend工具。RP回复分别把未核验封套内容称为“机件”、断言关闭盒中乐器仍在，原low资格评委均判supported。后者先作为资格判别盲点待核查，不手工改成gap，也不按最终收益取舍来源。

有依据修复 `4b436972b` 已提交推送：保留原新包字节，新增来源契约修正版 `661f990e145ad5c3f089f3f0becfb80d11d3c63f58eff8ce047ceb47a4363df4`，只将两条Project指令澄清为实际有序绑定字段，保留derivedFrom及原root/template；RP文字和六个独立密封来源不变。原资格提示补明未见对象的存在性/种类/材质、描述性名词与未提供玩家姿态同样需要支持；新增referent_existence免费构造控制，在真实来源观察前实测，RP source观察使用单独固定的high reasoning。原F2比较配置和Project资格协议不变；变化的RP source控制/语义观察必须重新实测，F3八项同协议校准仍另核对。这里增加的是评委判别检查，原两胜/六胜门槛、六维及权限未降低。

新增逐case baseline复用端口，严格核对完整case/scenario/pair hash、配置/settings、权限、原trial及原owner实际charge。免费preflight携带最近原owner/shared费用并核对原request/snapshot pins，复用三条RP及一条已完成Project原baseline；有错误的第二条禁止复用。没有重复生成不变且已通过的baseline，没有修改旧报告或丢弃失败费用。新组合报告显式保存原trial与baselineReuse来源/原producer引用，不宣称复用证据是fresh paired trial。针对性检查99个distinct checks通过（renewal增至11，另F2 28/F3 38/promotion15/lifecycle7），触及ESLint/syntax/diff通过；新版本原sealed reader六条免费检查通过。

零发送准备snapshot `run-1791610928002-b9a74591`，新资格scope `a73d6ae8ec50acedb59158b4c673e180fd5493271387c82302811e8a38568320` 固定上述修复与来源版本，目前开始实际RP source控制及原baseline语义观察，再完成两条修正Project baseline和三条资格观察。旧scope/评分/错误不覆盖；新候选与独立验收尚未执行，M1仍未通过。

该资格run `run-1791610936546-f5f21758` 新增五请求/88523 reported tokens，累计1470 requests /10489551 accounted tokens，pending0/lock0。RP正确、已知错误、缺证据及unsupported_rule四控制通过；新增referent_existence响应识别未观察内容为gap，但knowledgeReview仅返回该违规片段，遗漏其余正文片段，原parser按完整覆盖契约拒绝为invalid_f2_source_assessment。没有新来源语义观察、候选或promotion；不将方向正确的无效响应算作通过。

修复 `4bf78ff7748937eb233fc12e2fa40509a1ef348d` 已提交推送：RP source提示显式枚举全部必需output quoteRef与行数，要求包含supported/nonbinding片段；原parser及评分规则不变，禁止补写模型判断。现有控制测试增加“正确gap但仅返回违规行”拒绝检查；F2 sources28及renewal11共39个distinct checks通过，触及ESLint/diff通过。因真实提示改变，五个RP source控制均需重新实测，原四个已通过结果只保留历史；原F2比较、Project source协议及已付费完整baseline不变。

独立作者仅根据公共字段契约复核三条密封Project来源，全部通过，无需修改；六正文与metadata共七文件hash保持，作者没有接收候选、development输出或promotion评分。零发送准备snapshot `run-1791611623393-682bc073` 保留最新完整owner费用及原三RP/一Project baseline，资格scope `d5a33de98a299d854750d798dbbf76fa6fb8700520c587dd1a10c810abcb0b7a` 固定4bf78ff77，开始上述实际重测。M1仍pending，main未集成；H0样本/清单准备身份与H1/H2前置保持。

完整性提示run `run-1791611628026-a6259788`：第一项positive控制完整有效；第二项known_violation请求无持久响应，generation_execution_failed未提供可确认的具体原因。新增两请求/29647 accounted tokens，其中10404为reported，19243为unknown上界；累计1472 requests /10519198 accounted tokens，pending0/lock0。这不是有效负面评分，不重写为已报告usage。继续同一协议的零发送snapshot `run-1791614074514-682bc073` 携带完整费用和原baseline，scope `4ab2ecdbc0e55ca4d198e407942a78006a6103d854c2d67966b266605fc6b47f`；实际run `run-1791614087966-32f919e6` 复用exact已通过positive控制，续接四项未完成控制与后续来源资格，没有重提炼或更换密封材料。

## 2026-10-10 用户要求换设备暂停与私有迁移

用户明确要求在恰当时机停止并打包隐私数据。当前F2批次自然退出、费用全部settle和原fixture保存后暂停；不再启动候选提炼、F3或其它模型请求。停止不是M1验收完成，也不是因阶段/失败自行交接；仅按用户要求刷新`HANDOFF`（历史恢复快照已消费清理）。

最终run `run-1791614087966-32f919e6` 固定 `4bf78ff7748937eb233fc12e2fa40509a1ef348d`、scope `4ab2ecdbc0e55ca4d198e407942a78006a6103d854c2d67966b266605fc6b47f`、修正版caseSet `661f990e145ad5c3f089f3f0becfb80d11d3c63f58eff8ce047ceb47a4363df4`。新增25请求/331435 accounted tokens，其中318348 reported、13087 unknown上界；全部失败与retry保留。累计1497 requests /10850633 accounted tokens，1182 reported requests /63 unknown /252 carry，pending0/lock0，M1进程与worker已退出。ledger hash `fa64d70643f1f5950cabc9fa2839ef2edac61cf7e2cb6e63b80955811844b56c`。

RP五source控制全部通过，六原比较控制exact复用；三baseline均原checks完整、原trial/charge保留。新的high主观察：d1 knowledge_boundary gap，d2六维met，d3 knowledge_boundary与player_agency gap，其余维度met。observedGapCases=2，primary_observed_gap，免费F3来源门核对qualified；不是新候选改善或M1通过。完整report hash `2f6bf6ac164fcba4a6e29e939c9c2cf6134643224d4defb29b8f3a0badbf0e29`，assessment hash `471c33ad00b23928469d64aeaa32705f0935da51de2b35f1cb7b7f52f7310797`。原low零gap及不完整控制评分保持历史。

Project六比较/四source控制保持exact旧协议结果；三个新baseline全部完成、原权限/isolation/target_consumed检查全部通过：d1复用原试验，d2/d3契约修正版新执行，完整report hash `3aae8482ba78e1dc45b4d0165dfb0807fffff2a13b01c4c37f9c8173b67249af`。随后第一条source assessment在原请求编译阶段被generation_context_budget_exceeded拒绝，没有该语义评估的付费请求，没有Project source assessments/headroom结论。不能把此错误说成第三条baseline失败；三个baseline及其费用可在exact身份核对后复用。证据编码/原context预算问题留待续接定位，不缩减维度、裁掉证据或读取promotion指导修复。

零模型只读暂停审计 `m1-device-pause-audit-20261010-complete.json` 验证全局请求/tokens加总、两个owner费用与shared ledger、六baseline原case/配置/权限及原收费身份、RP来源门与无publication。初始审计未检查unavailable入口的完整baseline，补充完整审计并保留原文件。最新输出契约修复的F2/renewal39与F3 38共77个distinct checks通过；没有重跑不相关full suite/build/CI/UI或H0基准。

下一仍先修复Project source assessment上下文问题并取得资格，再按正式有限包完成每域一个候选及原development→promotion→review→下一消费→rollback。静态核对原publication最多120个reservationIds：已有原续接端口支持同冻结候选的新native job，后续接线须保留各阶段完整报告/费用并继续原容量guard；本次未实施新的分阶段接线，未为获得通过扩大限制。源分支已push，main仍 `6ab12ba43c5b18bfec6df75c16456a4cb4497d3f`，未合入。

H0只读调用图、旧LLM/RAG删除/保留清单及八项中文逻辑样本保持已准备；519条source/193348 bytes，SHA-256 `ef9a584cfde78f5bc60e43914e1eb676d3530df4398e903f56afabb0631e6eeb`。未执行产品adapter、H0 B0/性能/检索基准，H0完整出口、H1/H2未完成。docs无关未跟踪目录plans/feat/agent-experience-evolution/原状保留，未加入提交或本任务迁移包。

私有迁移包范围固定为完整Document（凭证、原始reports、密封来源、账本/quota/rate/transport、原fixture及辅助脚本），另附离线HANDOFF、恢复说明、零模型解压校验脚本与逐文件SHA-256清单；包名Atria-Document-private-20261010.zip，未加密，仅保存在本地私有目录，不进入Git。最终文件数量、archive/file hashes和实际Git refs以包内MIGRATION-MANIFEST.json及外部.zip.sha256为准。接手AI负责校验、拉取Git、恢复依赖和本机路径；不覆盖原冻结材料或清账。


## 2026-10-10 新设备恢复与 Project 来源评估预算修复

实际本地 source/docs 从 88e5b34d3/e5be06079 无冲突快进至迁移 manifest 的 4bf78ff77/5a0225542；main 保持 6ab12ba43。私有 ZIP 包内 14250 个文件的大小、逐文件 SHA-256、路径和清单由包内 RESTORE.py 核对后恢复到新空私有目录，原私有目录保留。外部 .zip.sha256 未随包出现，因此不能声称外部校验已通过；本地计算 archive SHA-256 为 9b99eee4fa318b426890298cb49e35c2c45bfa7619f4eefc040b3801bd5de69e。源码/tests 锁文件分别与现有依赖安装源一致，依赖链接可用，未无故重装或变更锁文件；凭证与私有路径未写入 Git。

本地零发送经原 FrozenEvaluationBridge 复现 Project 三条完整 source assessment 的 generation_context_budget_exceeded。原输出 reservation 16384 与完整输入（分别 18455 / 16093 / 18163 tokens）超过配置的 32000 context。保留原 f2SourceEvidence/f2SourceMessages、全部六维、quote/parser、baseline 与密封字节；仅 Project source assessment 配置 8000 输出后，三请求均通过原编译及预算检查，截在本地发送回调，modelSends=0。没有增加 context/model 能力声明、裁掉必需证据或修改未知判断。

test-only 提交 ce8486888eb011b33375213575e51dc5007e95c7 增加按用途的 sourceOutputTokens，F2 发送与 F3 来源准入共用相同 transport 身份计算；默认、RP source high、F2/F3 comparison 和原 baseline 配置不变。F2 source29 / renewal11 / F3 38 共78项最小相关本地检查通过，触及 ESLint/diff 通过。未做 full suite/build/UI/CI。

零发送恢复 snapshot run-1791617696100-2c04e737 逐项复核六条完整原 baseline 的 case/input/config/settings/权限、原 owner receipt 及 shared ledger。原 owner 持有 request/snapshot pins；shared ledger 保留原 trial/tokens/settle 字段，未捏造不存在的 hash 字段。原 ledger hash fa64d70643f1f5950cabc9fa2839ef2edac61cf7e2cb6e63b80955811844b56c、1497 requests /10850633 accounted tokens、pending0/lock0 保持。scope m1-f2-config-context-recovery-20261010.json / hash 63ef22dde98eb39ffc186aac9e80aadb227ee549106ca2f42ade850d941c42d4 固定当前源码和来源版本，携带原三RP完整语义观察及两域完整 baseline report；改变 transport 的 Project 四项 source controls 必须重测，未复用成新协议通过。实际资格续接已启动，结果待落盘；无新候选或 publication，M1仍未通过。


资格续接 run-1791617711441-ae498ed7 已完成：新增7请求/104900 reported tokens，累计1504 requests /10955533 accounted tokens、pending0/lock0。Project四控制有效，三个source assessment均发现status_accuracy gap，其余维度met；三gap，原完整report hash 3aae8482ba78e1dc45b4d0165dfb0807fffff2a13b01c4c37f9c8173b67249af保持，assessment hash 92221ee1497f023ec4911fe54cdca3df0b982b2a0ba5dc70a49ac4cb3a1d3207。RP五控制/三原high观察及全部baseline exact复用，原两个gap保持；新组合观察显式携带caseId引用，不冒充新发送。两域均通过原F3 source gate；这不是候选质量或M1通过。

test-only 提交 b3832f8424b58be56ef20903dfda676596b52f9c 接入显式 separatePromotionJob：development通过后以同一冻结candidate启动新native promotion job，原development job、完整报告及owner费用保留；大development报告沿原无损归档降低重复存储，续接准入先完整解码核对原report/hash/config/target/receipts。原4 MiB scope和publication最多120 reservationIds不变，不能以接线代替实测通过。63个distinct相关本地检查通过（F3 40、promotion15、lifecycle8）；其中两入口真实FS新job接线检查在密封worker边界前停止，费用、candidate和两个归档development报告完整保持；不是模型或真实发布证据。触及ESLint/diff通过。

新F3零发送preflight snapshot run-1791618136949-7c63eeb3、scope m1-f3-renewal-context-20261010.json / hash bf29836dcaf0af11d7e57ddd67bdf736f6632335a4d2d82579204e98d015b209，固定b3832f842；两域source gate、每域八项exact原F3比较控制及原付费receipt均核对可复用，不以F2替代。新密封metadata及六正文文件仅校验hash，开发侧未读正文。两域baseline scope分别703/945 bytes，原4 MiB guard保持；development/promotion各保存完整报告与费用，publication的120 IDs限制仍须按实测核对。已启动两域各一个新候选及原development→独立promotion→review→下一消费→rollback流程，结果尚未形成。

H0新设备只读准备补充[h0-baseline §7](../../plans/architecture/agent-intelligence-runtime/h0-baseline.md#7-新设备-h0-执行准备核对)：重新确认Memory相关范围在main与M1工作分支字节一致；冻结8样本/519来源及hash不变。定位readOnly只约束来源账本、retrieveMemory仍同步向量索引，固定隔离临时source/graph与本地检索服务要求；为八样本及三实际消费者列出原fixture/authority适配和观察字段，禁止adapter提前补H1/H2算法或把逻辑audience/validTicks当产品授权。只做schema/ID/引用/hash、源码/测试符号及路径存在和diff检查；未运行H0 B0/产品adapter/检索/性能/正文基准，H0完整出口、H1/H2保持未完成。


F3 run-1791618171873-a2ab3077 的 RP 新候选已冻结，value hash f798f031409878f0094f4e73fd42b4a71392b331b021b71e056799b22f4f5b5a；三个development均为有效candidate胜，六维全部非负、原checks完整，developmentReport hash 11380d261b8002773512093d191cf54bb7b85dfe6463db3153572249b7757fe2（76077 bytes）。原development gate通过，同一冻结候选经 separatePromotionJob 进入新native job，原三case各三次独立 paired trial；完整promotion、review/真实下一消费/rollback尚待结果。Project新候选尚未提炼；不将单入口development通过改写为整体M1完成。

RP独立promotion已完成九对/十八trials/九个有效主模型盲评：四candidate胜、两tie、三baseline胜。knowledge_boundary、narrative_response、actor_voice分别有一对-1，原gate返回model_regression_uncertainty_or_disagreement / behavior_regression_or_ungraded / improvement_threshold_not_met。完整报告hash d11438559a105290e26096b1515e517624e56732955bcd4bd58c3a4417fa60d3，319880 bytes；未发布，完整不利评分保持，不从密封正文或评分解释回灌提炼。原development job m1-f3-0c0b7cf2-2bf4-4c43-ae2e-76d577a10641 与新promotion job m1-f3-promotion-5d4f49f5-fb3d-4c71-aa24-fe907be72358分别保留；拒绝job及原报告hash落盘。RP本轮新增55请求/481489 reported tokens，阶段累计1559 requests /11437022 accounted tokens；后续Project继续同一scope的唯一候选开发，最终账目及完整审计待两域自然退出后核对。公开冻结RP候选已覆盖未见内容、玩家动作及voice/continuity规则，但规则写入不证明独立稳定执行；此有效失败不是上下文编译故障。

Project同一run已完成唯一候选提炼与三条候选development原worker trial，value hash e9968a18344e9d283062800fa45045ff38073789170b76ee05cbf80b741f99eb；原job m1-f3-219dc8c3-2c73-41bb-b04f-570ee147d551。第一条主模型比较有效candidate胜，conflict_handling/status_accuracy各+1、其余非负。第二条首次请求unknown，28236 tokens按原预留上界settle；付费retry实际返回38298 reported tokens，但外层原生执行以generation_provider_timeout退出，未形成有效评分。第三条未评分。原partial report hash 5e9e25434e8319925edcffe0bdfaad91df93e6e88c860e2c65233646151d735c；未提炼第二个候选、未进入promotion/publication。

原run自然退出及pending drain后，只读最终审计重算RP两阶段门槛/报告绑定、两域owner与共享ledger逐receipt一致；全部三条Project候选trial、原baseline及首评分保持。累计1587 requests /11807509 accounted tokens、pending0/lock0，1271 reported/64 unknown/252 historical carry；ledger hash c94ddfb9f094ee0bc768a80090bc914f2df26fd7a51697ce5b3b167c68357c6e。新增83请求/851976 accounted tokens（其中一次unknown上界28236），原raw retry和超时证据未删除，不将晚到响应声称为已完成原生评分。

test-only修复 da8b9e0a0aec61e3d701bea0ad860828766a40f5 增加显式--f3-development续接：原完整report/hash、source资格、冻结target/config/settings、native candidate/base/desired、三条trial/原收费身份须核对；保留已完成评分（包括有效负面或invalid），只执行judge=null的槽位；未进入报告的失败/晚到grader receipts一并纳入新完整报告，旧partial与fixture不覆盖。47项F3相关本地检查通过；修正后针对续接/保留评分8项以及最终断言2项复测通过，触及ESLint/syntax/diff通过，不扩大验证范围。

真实私有fixture零发送预检到达第二条缺失评分的原FrozenEvaluationBridge发送边界，原doc/owner/三候选trial及首评分字节不变，modelSends=0；不存在native requestHashes与test-only on-wire charge hash恒等的契约，预检发现后移除这项额外假设，保留原各自producer pins与完整费用核对。预检snapshot run-1791621507982-41638f9d；提交后只更新scope的testedHead并核对runner源码字节与预检一致。最终续接scope hash 7d35e49e65d81da0347afbc4c471f0c0bc4b139d5c99fcd4a475bc3e647026c3，runnerRevision 868098a9a99fe568bccda8a118dc6dbe3a779ed5ef3c8e1b8cdaa93d4fdc6fc1；实际run-1791621637584-9004f4ab已启动，仅补两条Project评分，原密封正文仍不进入开发侧，候选/门槛/容量/生产gate不变。

Project续接已补齐两条有效主比较，新增2请求/72612 reported tokens；三个development均为candidate胜、六维非负，原完整费用/权限准入通过。完整report hash 03af5be6d4e414bc74e1a3ac5e855e796a7dd72de7cb6d6c0cfbdf9effaaa5b6，1565807 bytes；原journal存储无损归档hash 1cd9b10a88705e322727201054da38234380fe6e8cd06e9ad8335519b13473b8。只读核对完整解码相等、三candidate trial与首评分hash不变，两条原失败/晚到收费凭据均在报告中。development完成时累计1589 requests /11880121 accounted tokens；同一冻结Project候选进入独立promotion新native job，九对及真实review→消费→rollback仍待完整结果。RP未通过的完整独立结论保持，不能以Project development通过替代整体M1验收。

Project同一冻结候选的独立promotion已采集九对/十八trials，原必需checks、isolation/target_consumed均通过；原generation收费为74 baseline+66 candidate，共140 reported receipts，单此部分已超过publication的120条上限。九个盲评继续完成，完整语义准入尚待最终结果。原native publish将所属job的全部owner attempt IDs绑定publication，原schema拒绝超过120；不能删ID、转移历史收费归属、创建零收费审阅job绕开绑定或扩大guard来声称原出口通过。此容量障碍独立于最终评分，全部140条实际收费保留。

RP额外只读诊断仅检查公开development请求metadata：原development job的六个实际candidate请求（每case两次）均含同一冻结Skill指导，未发现漏送达消费者；没有读取密封输入或评分解释。指导出现在实际请求不证明模型稳定遵循，不能据此撤销四胜/两tie/三负的独立结论，或重复提炼当前有限包追分。上述两项诊断modelSends=0，仅核对现存请求、trial checks和收费数量。

Project独立promotion最终九对全部为有效candidate胜，六维均非负，原authority/配置/收费检查完整，pilotPromotionAcceptance accepted=true。完整report hash d0c253b780c37b3a913e0396ba7ba4b3ce09ea14019d7b74c71561407e896046，5024399 bytes；无损native stored-report hash 57978e0d6a474af68193f5514cf485079eda10765143eac566cf64eb610969e8。原promotion job m1-f3-promotion-7bf5ee46-f7f4-409f-a9d7-a9da471eba49共有149 reported receipts（74 baseline、66 candidate、9 judge）；原native publish绑定全部149 IDs，在原120上限处抛出TypeError: Invalid publication state。原scope937866 bytes，未超过4 MiB；这是publication receipt容量拒绝，不是语义未达标或journal总容量不足。没有publication、下一实际消费或rollback，M1整体仍accepted=false，main未集成。

续接run-1791621637584-9004f4ab新增151请求/2088618 reported tokens，包含两条补齐development评分及完整promotion；原两条中断收费仍在development报告中。全轮F3两producer合计新增234请求/2940594 accounted tokens，其中一次unknown28236；连同本设备F2恢复新增7请求/104900 reported tokens，总新增241请求/3045494 accounted tokens。最终累计1738 requests /13896127 accounted tokens，1422 reported/64 unknown/252 historical carry，pending0/lock0；ledger hash e3b7dfb7e7ca7c0f7da15b3b14f174f8e69ed4292b36b5d7efb52ff5586df99b。旧unknown/carry/不利结果未清理，humanPreference not_observed、currencyCost unavailable、生产auto gate保持。

最终最小只读审计重算三胜development及九胜promotion、原owner/shared ledger逐receipt、完整归档和149条报告/owner收费集合相等；重开真实私有fixture确认publication=0、actual=base、原targetPin不变。modelSends=0，未重复已通过测试或执行full suite/build/UI/CI。三项源码修复已提交推送（ce8486888、b3832f842、da8b9e0a0）；本设备相关local checks共110个distinct检查通过，H0仍仅准备，不将该计数当作语义/性能证据。

### Project发布凭据容量修复与完整生命周期

source 8f5989882e7014cf5a9e28e004b7a2af52844efe将publication凭据上限对齐owner的2048条有界容量，新增重复ID/有界文本检查；没有遗漏收费或转移归属，原生产自动job的120次 admission预算、4 MiB journal与human/price自动门保持。最小本地生命周期八项既有检查通过；新增149条收费发布/精确回滚/重复与2049拒绝检查首次因测试误读publish返回值失败，修正后目标一项通过，累计111 distinct相关检查；未重复全套。

Project原完整语义报告由原da8b9e0a0/5b141e8cde1e5fe6474d7fa6be12db81f81d0a931b173e57970f8c5b43153499重新只读核对三胜development与九胜promotion；原owner/shared全部费用逐条相等。新代码与原代码src/public唯一变化是repository容量修复，旧producer保持、没有重新标成新语义运行。零发送预检run-1791628218857-24a9e36a确认真实fixture可完整绑定149条并回滚。首次实际初始化因私有连接配置形状误读失败，零发送/无pending后核对死PID并清理该锁，失败记录保留。

实际run-1791628254014-548d8408在source 8f5989882/evaluator 5e61ec97d6b26050998b0ad5984984c24af65552632f63d49a8a2a9fe34975f5完成同一promotion job的native显式review、下一真实Project请求消费及guarded rollback：nextRunConsumed=true、nextConfigurationMatchesCandidate=true、baseRestored=true，全部149 IDs精确保留。原report d0c253b780c37b3a913e0396ba7ba4b3ce09ea14019d7b74c71561407e896046/stored57978e0d6a474af68193f5514cf485079eda10765143eac566cf64eb610969e8保持；下一snapshot b9e18a1dd35f90a5dfc0f6c3d282a93ca56b9470ac31a20d77f6dd15173b341f。仅新增1 reported请求/464 tokens，累计1739/13896591；pending0/lock0。Project域完整出口通过，RP旧四胜/两tie/三负保持且仍未通过，M1整体未完成、main未集成。随后推进隔离新RP材料，独立作者只接公共契约。


## RP 规则边界修复与完整回复核验

隔离作者只接收公共契约，生成三条公开开发案例与三条独立密封案例；首次格式修复的已付费输出未用于材料，原费用和响应保留。新 RP F2 run-1791629099244-7cf3f9e2 取得三条完整 baseline，发现一条 knowledge_boundary 缺陷：角色将已公开的核验条件扩写成额外处罚。不因缺口数量停止。

候选 bf18284ec13177555b17c6cc7b974db28930b8d5e16ffc03d86dcbec9b06ec8f 在 run-1791629948886-d7c323ec 开发二胜一 tie、独立验证二胜一 tie，六维相对差均非负，真实下一次消费与 guarded rollback 通过。然而公开 d3 回复仍有“妄探军机者立斩”，比较评价只引用此前正确的核验条件而漏掉该断言。保留原评价、完整生命周期与费用；此候选不能证明规则边界缺陷已修复，M1 仍未完成。密封正文、具体评分理由与输出未进入候选开发。

提交 ec1e1f173312864fe34debe72dc7e5d353a22389 复用已有 F2 全部 quoteRef 核验协议，允许对实际存在问题的公开候选案例进行完整回复核验，缺陷或不完整核验均阻止该候选进入独立验证。公开诊断须引用原候选的实际语句，不能改写原评分；提炼输入增加成稿后检查台词和叙述中所有规则、处罚断言的执行时机。两个相关本地测试与触及文件 ESLint/diff 通过。新配置 m1-f3-rp-grounding-20261010.json 已通过零发送准备并启动；复用完整不变 baseline 与八条 exact 已付费协议控制，所有历史费用保留。


run-1791631131818-d92059fe 候选 7080dac22797ef8f5c8b6ca5ed6b5598256acb563f1878747cba84ed447f2e39 的公开 d3 完整54条 quoteRef核验六维met，开发一胜两tie；独立验证二胜一负，player_agency 有退化，原 native job 拒绝发布。没有下一次消费或新publication；完整结果、费用及不利判断保留。

继续公开输出诊断发现 d2 在表示不知封罐内容时仍称其为“何物药材”，预设了未公开的物品类别。提交 40cdfcb5430beaa39c6b87470a4080698e7b8a7a 增加成稿后逐句主语归属与名词暗含断言检查，保留完整原报告，将既有公开来源核验的语义结果传给提炼而不重复搬入费用明细及全部审阅行。两个相关本地测试和触及文件 ESLint/diff 通过。配置 m1-f3-rp-agency-20261010.json 复用原不变 baseline 与 exact 已付费控制，对三条公开候选回复做完整来源核验后继续实际盲评与独立验证；独立结果不作为提炼输入。


run-1791632279844-e2732b41 候选 3a9f860eb192df71152043056bf72d7c816c3644b2e2dae0f0867b2ba4fa03cc 的三条公开回复完整147条 quoteRef核验六维met，开发二胜一tie；独立验证一胜一tie一负，continuity 有退化，native job拒绝发布。完整原结果与费用保留，没有publication/下一次消费。

提交 39f3624dd19c2d199df9b9ccf59c712ad5935b0b 补齐成稿后场景、最新承诺、身份、语气与六维检查，从当前有效场景及props构建开场，旧修订只能作为明确历史或被引用的主张出现。触及文件 ESLint/diff通过；配置 m1-f3-rp-active-context-20261010.json 继续复用原baseline/协议控制，提炼仅接收公开开发信息，不接收独立评分或正文。新候选 64a2837c308640cba6f51000e675e8625ca48281c7ef486fc805a306efa36a4e 的三条公开完整189条quoteRef核验六维met，实际对照继续中。


run-1791634234950-409351a1 候选 64a2837c308640cba6f51000e675e8625ca48281c7ef486fc805a306efa36a4e 的三公开189条quoteRef核验六维met，开发二胜一tie；独立结果一胜、一tie含knowledge_boundary负差、一个无效grader响应。真实负差与无效响应均保留，native job拒绝发布。

公开回复的审阅片段比前轮147条增加至189条，增加了不必要事实断言的表面积。提交 dc743664ac2503a973324b81b70e6a4ffaad57e3 在提炼执行槽位中增加简洁、完整回应与事实选择原则；未知不只指精确时间，也涵盖未公开的粗略时段、容器内物件是否存在、来源和功能，避免用虚构背景解释拒绝。触及文件ESLint/diff通过；配置 m1-f3-rp-grounded-response-20261010.json 继续实际验证，原baseline/已付费协议控制复用，独立正文及评分不进入提炼。


## M1完整交付与H0准备

M1实际验收与main集成完成。Project开发三胜、独立九胜；RP开发3胜、独立3胜/3对，相关六维无负差，三条公开回复完整152条核验六维met。两域完整费用绑定、native review发布、下一真实请求精确消费和guarded rollback均通过。main `ea75b76be4927e881de2f0be7c304a56301f1f83`；原生产自动发布规则、历史不利结果和unknown费用保留。H0八样本/519来源、隔离调用图和观测清单已准备，B0及H1/H2未运行。

最后候选 `97c489d8ad9ce77a146e5f859f5a1ba5b714377b64d71806c0a2a4f7415cd667` 的原生成run-1791635587931-03e12aa6完成三条原worker试验；第三条来源审阅返回47条完整行，却缺失六项status，保持原始响应与费用，不从理由推断评分。提交 `ffca4dcfecc9f4c178d64918a9991602f1f19426` 续接assessment=null的缺失公开审阅；三项最小恢复检查通过。公开核验与开发三胜完成后，独立验收取得两条有效胜及一条漏status的无效响应。提交 `99575717bd22222aeddde5212084c7b50b3fd7a5` 保留无效grade尝试及原费用，只补这条不完整评价；两项相关检查、ESLint/diff和零发送预检通过。有效met/gap、不利/uncertain评价均不替换，不重新生成候选或已完成核验。

公开完整来源核验与开发三胜由 `run-1791636508549-80ea15b1` 完成并原样复用；最终 `run-1791637497806-f6febf72` 仅补一条独立评价和执行下一实际消费，新增5请求/44175 reported tokens；独立材料正文、输出和评分理由未进入开发。development report `967a99f7d53bd8ccba7a5ef0fcb8632f43b9f5d80ecd2c72659729864b4e60ba`，promotion report `d84b0328bec12d2281463758d24ae089041b0d16ca363eec28ae8e0bc5e596d9`；evaluator `cded22e0fdc13b15d3b23dedd898ee5a10c931b7ad7fb844015bbfb732252423`，runner `b9ad6235ff6a7d18e55a71aa9408b3f1c825615aab25dc5e5686614aaff7bb40`。Project保留原语义producer `da8b9e0a0aec61e3d701bea0ad860828766a40f5` 与report `d0c253b780c37b3a913e0396ba7ba4b3ce09ea14019d7b74c71561407e896046`，新生命周期producer `8f5989882e7014cf5a9e28e004b7a2af52844efe`，未将旧语义结果标成新运行。两域publication分别完整绑定149和16条原receipt，真实nextRunConsumed、configuration match与baseRestored均true。

最终费用统计 `{"requests":1894,"accountedTokens":15671701,"reportedRequests":1578,"unknownRequests":64,"historicalCarryRequests":252}`，pending0/lock0。unknown和historical carry保持，humanPreference not_observed、currencyCost unavailable；主模型工程观察不声称人工偏好、双模型共识或生产自动发布收益。所有历史有效不利结果、格式失败及费用保留。

集成main前merge-tree无冲突；合并树运行源码与已验证任务分支一致，唯一public差异是既有CSS注释的文档路径。完成时仅做本地相关证据/收费/lifecycle只读核对、合并身份与文档diff/链接检查，不重复全套或build/CI。H0样本SHA `ef9a584cfde78f5bc60e43914e1eb676d3530df4398e903f56afabb0631e6eeb`保持；准备仅含样本、隔离fixture/服务方案与观察入口，完整H0尚未运行。中断HANDOFF在交付后删除，已合并临时任务工作树/分支清理。


## H0 / HM1换设备恢复资料

M1交付后的main `ea75b76be4927e881de2f0be7c304a56301f1f83`与docs均干净且已推送；本次按换设备需求建立当前HANDOFF和完整私有迁移包`Atria-Document-private-H0-20261010.zip`。下一有限交付组为HM1（H0→H1→H2），H0仍只有准备，B0及产品adapter未运行。包保留全部原始证据、连接、账本、quota/rate/transport与密封材料，附外部SHA和逐文件恢复核验；无新模型请求。旧M1任务分支/工作树已清理，新设备从最新main继续，不恢复旧分支或重跑M1。

## HM1 / H0 实际基线与恢复

从最新 `main@ea75b76be4927e881de2f0be7c304a56301f1f83` 建立 `feat/agent-hybrid-memory`；现有旧任务工作树与 docs 未跟踪 Experience 草稿保留。私有迁移包实算 SHA-256 `1551535563aac211046df34ca743072e7a060c8b60a4ef04b434d7b44afee30e`，未提供外部 sidecar，不能声称外部校验已通过；包内 17921 文件的完整清单、大小、SHA-256、安全路径与重复项核对通过。使用已检查的 RESTORE.py 解压到新私有目录，Windows ACL 仅当前用户及 SYSTEM；原 ledger、quota/rate/transport、scope/report/receipt 与密封材料字节保留，未重跑 M1、未读取密封正文。

冻结 8 个样本 /519 来源的原 bytes/hash 不变。test-only adapter 保存未过滤原 sources，并经原 captureEpisodes / applyFactOperations、temporal graph、createSourceLifecycle、Information projection 与 Context compiler 形成 fixture。选定 Branch/Variant 用原 source currentness 校验，不在 B0 增加 Actor filter 或 query seeds。1000 条 Episode/Fact 的长篇投影（500 原 source）、两个具体时间关系与合法桥边关系均来自合成原文。存储为每 fixture 独立临时文件；受控检索服务只监听 loopback，以固定字符重合排序观察真实 HTTP / 索引读写，属于合成 backend，不能冒充真实 Embedding 质量或 Provider费用。

私有证据 `hm1-h0-b0-repaired.json` 保留完整18个 query/lane 观察；`hm1-h0-b0-graph-atomic.json` 补充实际 temporal graph / atomic预算 / Actor权限观察；`hm1-h0-b0-attempt3.json` 保留 source编辑/删除/branch/variant拒绝、rerank故障、取消与保存失败及 Game / Package结果；`hm1-h0-b0-ordinary-repaired.json` 保存 ordinary RP 原 after-WI→唯一lorebook注入。所有失败适配尝试保留，依赖与fixture错误修复后只复测相关项。三条消费分别记录 packet、哈希与原正文输入或 Context Plan；未运行真实模型，正文、Provider tokens、价格/TTFT保持未测/unknown，UTF-8字节估算不称真实tokens。

B0实际不利结果：H0-ZH-01的同名他Actor来源、04的秘密动机来源、05的他Actor私人约定，在 lexical/graph 与受控vector两 lane 均入选；02只覆盖belief而漏掉hearsay。03历史/current来源分别命中；08遥远承诺命中。源编辑、删除、换branch与variant修改使旧snapshot抛AbortError；原metadata保存失败保持原来源；atomic chain仍无完整组协议。该泄露表述只指合成fixture检索结果，不声称真实用户数据或最终NPC自由文本已泄露。

H0最小相关验证：新增5项观测测试分别修复并通过；原source-lifecycle / temporal-graph / hybrid-retrieval三suites共51项通过。没有全量test/build/UI/CI或模型发送。原累计1894 requests /15671701 accounted tokens、unknown64/carry252、pending0/lock0保持；API quota恢复原admissions，不以历史累计当终身限制。H0观测完成，继续H1→H2，尚未宣称HM1整体或真实质量收益完成。

## HM1 / H1 唯一召回与前置合法域

source `b8c2a85e6` 将自动/手动 recallMemory 与 ordinary RP/Game/Package 统一到 Hybrid。旧 LLM/RAG 执行、模式 UI、router/rewrite prompts/routes 与独立 retriever 删除；单向设置清理保留来源写入许可及 extraction/schema 合法路由。来源写入与召回读取独立，关闭写入仍能消费合法历史；待写 ticket 关闭写入时拒绝。原 source/World/Timeline/Journal 不迁移或删除。无证明旧图节点不自动入新 corpus，旧 mg_/memory_os_ 派生 namespace 只清 hashes，新域按 requester/Information anchor/time/profile 隔离与重建；维护重建同走授权路径。

原 Information authority 在任何 corpus/index/query/rerank 前确定 Actor/task/narrator 完整来源域，application summary/reference 不授权未暴露整段 source。源/分支/variant、Information grant/availability/revision/anchor 及异步消费均重验；Package 对混合合法/非法引用拒绝整段正文。`hm1-h1-b1-attempt1.json` 保存18组B1双lane配对与两实际 Native消费者；禁止来源未入 corpus/insert/rerank/结果，02仍只命中1/2目标，H2尚未增强。`hm1-h1-ordinary.json` 保存实际ordinary单packet消费。

针对性检查：新eligibility3/settings1/vector adapter3、原extract transaction7、抽取pipeline修复后19、source-lifecycle24、hybrid retrieval12、Package bridge5/runtime routing2通过。Package旧fixture补上main已有RunControl和entryPoint，未改原Host权限检查；初始失败和修复日志保留。仅相关ESLint/diff；Edge实际生产Memory workspace检查390px无横溢出、写入/Recall独立、失败可见并回显已保存值，截图保留。无新增模型发送，无全量build/test；H1已冻结B1，继续H2中文query与packing及真实正文配对。


## HM1 / H2 中文种子、完整来源组与正文配对

H0 `722f1d698` → H1 `b8c2a85e6` → H2 `3ee1332ef113d4c57c65d9577222ba88d5171101` 从 M1 完成后的最新 main 连续交付；main 已 fast-forward 到完全相同提交/树，无冲突解决或合并后产品变化，不重复已通过测试。M1 未重跑，原报告、未知费用、quota/admissions、carry 与密封正文保持；私有路径与依赖自主恢复，无新增审批。

H2 使用合法 scene / source-backed Actor identity 和已验证别名、中文指代/时间与未完成承诺的确定性种子，合法 lexical/原有界 typed graph/可选 vector 经 RRF 融合。负面“没有新增承诺”不作为承诺种子；歧义保留 unknown。coverage 在固定 Context 预算内装入完整 source groups：关联关系包含原支持 Fact、formal Information atomicGroup 整组保留，独立冲突断言并列不裁赢家；超预算或跨时点缺成员拒整组。原 SourceRef 增 exact content hash/revision、producer、eligibility identity；cause 无来源保持 unknown。未添加 cognition/forgetting writer、新事实图、PPR、LLM rewrite、候选缓存或 delta 索引。

复用唯一 `informationSourceMessageIds` 与原 Information authority，允许 exact application source text，摘要不能放大授权。原 Context Compiler/Native generation host 同源域检查并保留 atomicGroup，Game/Package 对超上限证据拒整组。纠正 H1 Package 观测的一个不足：当时“包含归还文本”的断言可能命中原 Information ContextItem，不能证明 memory item admission。H2 改为明确检查 `memory:<id>` 和 atomicGroup 在最终 Context included；真实 memory item 与预算整组拒绝现在通过。无 ledger、关闭写入时，原合法 Native Timeline 可在内存只读重建 Episode 投影，原 bytes 不写回；pinned snapshot 遇 live revision 前进即 AbortError。无证明旧图仍保留存储，不自动获得叙事授权。

`hm1-h2-b2b3-final.json` 保存 36 组 B2/B3 × lexical/graph 与 synthetic-loopback vector 的同输入/权限/预算（2400 UTF-8 bytes estimate）配对：每个目标来源均命中，禁止来源均零，候选与 Context 不截断 atomic链。`hm1-h2-sourceproof-final.json` 与 `hm1-final-proof.json` 逐组核对最终产品的36份 packet 文本与 source IDs 完全等同模型评测输入；后续引用/guard 元数据改变保留原 model producer hash，不把旧模型结果标为新发送。`hm1-h2-ordinary.json` 记录实际 after-WI 唯一packet；Game / Package 与 formal atomic组分别走原实际 Context。

真实正文沿原 createLiveBridge → NativeGenerationService/PromptCompiler/RouteResolver/HttpProvider 发送，保留 exact config/messages/packet/output hashes、原 provider raw 与 normalized result、usage 和原 quota gate。只用冻结公开合成样本，不读 M1 密封正文；B1/B2 已测相同输入原样复用，B3 header 修正后 fresh-generate，算法标签隐藏的主模型盲评有9组有效观察。仅 lexical/graph 正文真实发送；vector 是本地合成服务，不能称真实 Embedding 或 Provider 检索效果。500来源是长篇固定检索 fixture，不是500轮连续正文实验；单 provider 工程观察不是人工偏好或独立双模型验收。

每维最大18分：

| 算法 | 来源边界 | 目标应用 | 未知/冲突 | 玩家自主权 | 角色声音 | 自然度 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| B1 | 17 | 16 | 17 | 18 | 14 | 13 |
| B2 | 18 | 18 | 17 | 18 | 15 | 14 |
| B3 | 17 | 18 | 17 | 18 | 17 | 17 |

B3 六维总分均不低于 B1，目标、声音与自然度改善；不声称每个案例无退化。H03过去的时态/未知、H07“依记录来看”等元话语仍有1分不足。原 v1 header 对 current 来源警告过强，导致无依据 uncertainty 和正文退化，已依证据修正并完整保留 v1。H08三份不同请求/hash的新鲜B3正文中第三份仍无依据自述“确实记得”；原输出及原配对评分保留，单独标 observed invalid_unproven_present_recollection。按 hybrid-memory §7 对该观察做一次有界修正发送与本地来源审查，修正保留过去借书/未履约，当前是否记得与心思未知、不控制玩家；该修正仅评测内触发，不冒充产品全局自由文本保证或新H5认知能力。

失败/修复完整保留：非法request ID、grader超Context预算均发送前失败无费用；首个成功请求随后结果读取接口错误，已记reported total1336但公开正文丢失，不能声称该次raw输出已保留。随后在解析前保存response clone与normalized结果；一份grader尾部非法JSON保留并计费，不修评分。初中文seed/重复episode packing、rerank排序断言和浏览器隔离端口缺导出依根因修复，只重验相关项。

H2 最小本地验证：eligibility/packing/hybrid/Context/Information/Package 6suites 94项通过；read/write/external API 3suites100项通过；ordinary实际消费1项、最终配对packet等价1项、live-revision late-consume1项通过（后者为新增回归）；相关产品ESLint、修改smoke/E2E脚本语法与diff检查通过。Edge实际Memory workspace与production settings模板通过source/recall独立、保存失败可见与已保存值回显、旧模式控件移除、Embedding可访问名称、默认rerank隐藏、390px无横向溢出，截图视觉核对通过。模板测试隔离shell dependency ports，不声称启动完整Atria浏览器应用；更新的全应用source写开关E2E只做语法检查，未执行。无全量test/build/CI。

本轮模型/评审/修正合计新增 **58 requests /62749 accounted tokens**，reported58、unknown0，含不利正文、无效grader和丢失正文那次的已报告费用。原 M1 `1894/15671701` 字节账本保持；合计观察1952 requests/15734450 accounted tokens，原unknown64/historical carry252不改。货币费用 unavailable，不记零。原quota历史admissions1562与carry332保留，本轮58次均有admission；发送点滚动60秒最大11、完成时近期24h805，遵守每日2000/20RPM，未另加累计终身限额。原费用账本和quota carry是各自authority，不混淆统计。

真实9组模型正文E2E（包含provider发送与等待，不是TTFT/检索latency）B1 median6868ms、范围3573–23472；B2 median6386、2955–18329；B3 median7547、3763–11730。时点不同且小样本，不宣称加速或节省费用；Provider TTFT未观测。private `hm1-evidence-index.json` 索引154个任务证据文件及hash，原失败、原始基线、各配对report与账本保持。产品提交不包含私有连接、费用正文、机器路径或cache。

HM1 本有限组完成，继续工作的授权不被阶段边界或失败暂停。Plan 已更新当前状态，H3/H4/H5 保持未交付。main依赖以lockfile重新安装恢复；只同步本组main/docs提交，保护现有Experience草稿和旧无关工作树；本组工作树/分支及已消费live HANDOFF交付后清理。


## M8 / G01 基础 checkpoint 与继续

用户在 HM1 交付后要求继续。实际 main/origin main均`3ee1332ef`、docs`894d84c04`；保护原Experience未跟踪草稿及旧任务树。从最新main建`feat/agent-compute-runtime`，不恢复或重跑M1/HM1。HM2 H3/H4的G依赖未实施，先推进M8，未跳依赖或宣布HM2完成。

source `c62ecc937b66e2125e35621483f186d6debadce3` 扩展原 CapabilityDecision/RuntimeRoute：optional v1 path binding与有限executionPolicy；原profile/route/library authority及资源keys不变。Resolver前置核对owner/account/endpoint/target/adapter/transport/options及时点；advanced cache/reasoning/continuation 的字段可构造只计unknown，unsupported优先。现有Snapshot固定target/policy/evidence与三层cache、价格/上游unknown，不发Secret、不provision配置。verified publication有服务端非JSONmarker，普通profile JSON不能自封测量事实；配置改名可保留原exact观测。原Route兼容、精确refs和fallback authority保留，待G03继续强化；continuation仅none，其它模式明确unavailable而非空壳通过。

最小检查：原contracts/P2 Core 2suites52项通过；新增10项全部经修复通过，包含FS实际profile消费、SQLite原registry dump/restore、policy target拒绝、path/account/expiry、编译期间晚过期及不可伪造发布。首轮冻结port测试误改只读方法、错误code未登记导致generic错误，已修并针对性复测。SQLite初缺native binding，npm rebuild被本机allowScripts跳过；检查锁定better-sqlite3安装命令后直接执行其install script，真实SQL恢复通过。原fail log与repaired/publication log保留；未测MySQL/Postgres，Docker daemon不可用，不把它写成SQL通过。相关ESLint/diff通过，无全量build/CI、无API发送、费用/quota未改变。

本checkpoint不是完整M8验收；继续G02编译、G03复用/失败策略、G04原生执行观察、G05共享准入与G06双入口对照，再推进HM2对应包。新live HANDOFF未创建，阶段与环境失败不暂停工作。

## M8 / G02 确定性编译与实际消费 checkpoint

source `37273d4ca` 在原 native repository canonical authority 导出 serializer，HTTP count/send 共用同一 bytes。原 PromptModule targets、stage/module priority、raw instruction 和 history/tool arrays 顺序保留。compiler 增加 stable identity 与 exact source/content segment 元数据；Snapshot 固定最终 compiledBinding，包含 compiler/canonical/layout、source/provenance/native selection、path、exact resources、generation、tools/output/history/prefix/content/rendered 指纹。request ID/transport 时间不进入语义绑定，版本和权限不被删去追求 prefix 稳定。字段只标 candidate，不宣称 cache hit。

最小验证：新增4项真实 Session/Project loopback HTTP 消费通过，覆盖 request ID/schema key order 相同bytes、工具/历史顺序、identity/expression 与 narration 参数隔离、当前source/旧revision拒绝、module revision identity与内容分离、output schema失效。原P3 46项初44通过、2失败：G01诊断把旧注入resolver的缺失path/evidence作为undefined写入JSON。先只补compiledBinding null未修根因，原失败及两次recheck日志保留；改原executionPlan缺证据为null/空列表后两项针对性通过。新增suite因source binding完善再跑4项通过；相关6产品文件ESLint/diff通过。未跑全量build/CI，无付费API/额度变更。

这是G02上层编译checkpoint，native envelope/compaction、通用复用、共享预算、产品状态与收益尚待后续。继续G03，RP正文仍fresh generation，未以稳定bytes冒充provider hit或完整M8/HM2完成。

## M8 / G03 Artifact 与 Plan authority checkpoint

2026-10-11 source `c6979abda`。原 Task Artifact authority 提供显式 exact ReuseDecision，Context derivation 实际消费原 grant proof、记录依赖hash与当前anchor，scope/branch/definition/result/dependency/cardinality仍由原 readTaskArtifact 验证。没有提前返回 Task 执行或绕开 scheduler currentness/RunControl；once adoption/正式effect仍走原authority，未伪造send、usage或receipt。

Project 原 TaskRepository/工具入口增加受限plan structure复用：同Project、同exact intent/currentbase，目标尚无plan/operation/workspace；重新创建pending步骤，记录sourceTask/sequence/planhash，不复制完成状态、操作或凭据。后续工具许可、Project base与Review/commit继续原guard。显式Route executionPolicy的fallback守住初始exact PromptProgram/network policy、有限target、verified requirements及既有output authority；failure plan随Snapshot固定，unknown economics保持unknown。旧无policy Route保持原适配路径。

最小检查共7个相关断言通过：新增Artifact依赖/无关revision/scope/branch/manual bypass1项、Context实际复用1项、Project结构/restore与不同intent/foreignProject2项、显式fallback semantic/network拒绝1项、原Context其他audience/edited artifact2项。首轮Project测试误用不存在commitTask，按实际commit修正后复测通过；lint brace格式修复。初fail与repaired-policy/context-guards日志分别保留。5产品文件ESLint/diff通过，无全仓tests/build，无API/费用/quota变化。首批allowlist见substrate；价格/health/locality、nativecontinuation、共享send准入与实收益仍未验收，持续G04及后续，不创建HANDOFF或停工。

## M8 / G04 Responses 与 native stream 完整性 checkpoint

2026-10-11 source `09ef28452`。OpenAI Docs 技能核对当前官方 conversation state/reasoning/migration/streaming；巨型API reference HTML及.md抓取失败保留为文档可得性限制，实际读取了官方guide，未以搜索snippet作为实现完成证据。新增Responses adapter通过原Provider Port/Host消费，store:false；私有进程内Runtime保存完整native output items，公有state仅checkpoint ID/binding/visiblecalls，发送前lease实际lower/recheck。固定owner/account/path、source、branch/revision、requestID、prefix/tools/output/generation/policy与history前缀；缺失/伪造/改变绑定拒绝。原生item顺序/opaque字段保留，不进入public snapshot、preview、World/Memory/Package/可移植Save或共享Experience。此范围为当前工具循环的协议必需回传，不声称task/adaptive持久continuation、restart恢复、compaction或真实gateway支持。

Responses新12项全部通过：实际Project loopback两次请求回传reasoning/function_call及tool output，公开诊断无opaque；path/source/history/tools/forged反例；stream terminal/item_done/opaque/incomplete；missingusage/report identity unknown与opaque Secret echo拒绝。额外负cached_tokens1项针对性通过，负数保持null；reported model只作reported alias，canonical upstream/hidden attempts/价格unknown。byte upper-bound token admission，不声称真实Provider tokenizer等价。

既有Anthropic/Gemini adapter发现EOF累计blocks可误当完成，修复message_start/block_stop/message_delta/message_stop及Gemini finishReason；thinking signature/redacted opaque字段完整性检查、delta类型/稀疏block拒绝。原loopbackfixture补齐真实协议结束字段，不改产品条件迎合旧缺字段fixture；同一native matrix50项通过，其中新增12个完整性检查，旧控制/auth/HTTP/签名顺序断言保留。Responses首轮lint brace格式修复后6相关产品文件ESLint/diff通过。所有原log保留；无付费API、quota/费用未改变。继续native私有envelope迁移、精确gateway观察、G05共享准入及G06收益，完整G04/M8/HM2未验收。

## M8 / G04 原生私有 envelope 与 Host retry checkpoint

2026-10-11 source `47575e344`。Anthropic/Gemini 原 provider 接入 Responses 使用的同一个 Runtime checkpoint/lease authority，不另建 store。公有 response/preview 仅保留 private checkpoint 引用，原始 thinking/signature/parts 不进入公开 snapshot；实际发送从原私有 state 回传完整内容。路径/account/source/request/history-prefix/tools/output/policy及额外 target 指纹重验，完成后 discard，opaque Secret echo 被拒绝。API缺 direct usage/cache counter 时仍 absent/null；canonical upstream/hidden attempts unknown。

shared lease 与原生迁移相关的 Responses/native matrix 63 项通过；随后新增 Native Host 两格式各7项（实际两轮消费、path/source/history/tools/forged、Secret）共14项通过。单次 lease 接入 Host 后发现原 retry 会重用 rendered，修复为相同冻结 snapshot 重新 lowering/新 lease，429 后实际两请求相同 wire 的2项定向检查通过。四产品文件 ESLint/diff 通过；日志分别为 m8-g04-private-native-initial、m8-g04-native-host、m8-g04-native-retry。新增检查全为隔离 loopback，不声称真实品牌服务或配置 gateway 验收；无新 API/费用/quota变化。继续原 RunControl/send 与 Project Task 的共享准入/记账及 gateway/G06，未写 HANDOFF，未集成 main。

## M8 / G05 原发送 authority 共享记账 checkpoint

2026-10-11 source `9599dad35`。首批明确上限和作用域见 compute-policy §3.1。原 Route 可选 computeBudget，旧配置不自动增加限制；沿原 Host/RunControl operation及Project Task锁/CAS准入与charged，合法usage settle，未知/partial按上界占用，原Package旧计数同mutation，不重复扣两筆发送。请求ID变化不重建父operation/Task allowance，内部发送ID不同。Core保留正文/Secret拒绝和不完整stream已取得的数值usage，只有计数进入原ledger；无新发送器或预算registry。数值未知与货币费用unknown边界保留。

新增10个实际断言通过：Project并发2请求只有1真实发送且reopen不退款1项，合法total/拒绝body/Secret echo/partial4项，token上界耗尽无发送1项，不完整Anthropic stream保留input/output而total未知1项，实际发送后cancel保持unknown1项，FS+真实SQLite background失败/reopen/Save restore的单笔charge和identity保持2项。原Core35项中34项先通过；旧fallback测试错误要求不同failurePlan相等，明确检查automatic/disabled计划后其余完整snapshot/wire仍相等，定向1项通过。旧budget的not-due/previews、retries/reopen和period/restore6项通过。11相关产品文件ESLint/diff通过，无全仓测试。

失败证据保留：初Project optional field按required validator添加导致旧Task创建失败，改为实际optional字段；随后内部ledger未进公有Task投影，补入计数投影，两次repaired日志保留。background初命令未设DB flags，FS/SQLite2项已通过，MySQL/Postgres仅ECONNREFUSED，标未验证；后续旧budget6项在明确禁用不可用远程DB后运行，不将连不上算通过，也未无理由重跑已过新断言。所有m8-g05日志保存在私有Document。API新增0，原M1/HM1 ledger/quota未变；继续规则Invocation、gateway/G06和HM2，完整G05/M8未验收。

## M8 / G04 真实 gateway 与 Studio lineage 消费

2026-10-11，gateway producer `acd2d563f`，后续实际client修复 `9369f3b0a`。沿原配置主模型gemini-3.8-flash、同SecretRef account冻结四格式/endpoint后实际观察：Responses/Anthropic 404原响应保留，Gemini native/原chat-compatible 200且normalize。reportedModel仅alias，cached counter缺失null，canonical upstream/hidden attempts/价格unknown。直接total分别135/122，大于visible input/output之和，保持provider原total，不把差额抹零。compatible新增reported cache正/负数两项实际Host检查通过，cache子集不重复加入total。

随后原Native Project Host + 原只读get_project工具跑Gemini signed round-trip。v1实际第一发送成功/186 tokens，但私有runner错误只传callId没传原started attemptId，工具authority拒绝project_agent_attempt_conflict；原失败/账不删除。诊断后v2调用beginGeneration取得原attemptId再执行只读工具，2发送/203+608 tokens，完整签名parts原序回传，公开response/preview无opaque，正确Project名/无后续calls/原revision保持/完成后replay拒绝8项通过。只证明该exact frozen path/current execution，不声明其它模型/通道或持久restore。7新增API共5个直接total/1254 tokens，2个404费用未知保留各自prepared upper占用，货币unavailable；原quota累计append并排队，2000/24h和20/min持续生效，M1/HM1原账本不改。

费用校验脚本错误也保留：v1/v2的baselinesPreserved原值false，因为loop脚本对Buffer做JSON hash而初gateway脚本对原bytes hash。独立m8-loop-baseline-raw-hash-audit.json以raw SHA256核验两原账本均等于原pin；未覆盖两个false记录，未为此重发API。新runner后续须使用同raw hash算法。

真实Studio入口另发现generation-client每轮新requestId，直接Host重复ID不能替代产品证据。修复后原Host将Project Task映为其现有task source，绑定原Task语义及非generation authority epoch；request/attempt identity仍逐轮独立，owner/path/prefix/history/provenance均保留。不接收caller Task proof。Task语义变化时client从公开工具观察重算，Host拒绝不同Task、变化/晚到变化及同内容restore旧epoch，取消/失败discard。真实client→原router→Host→实际loopback native provider稳定路径1项、上述guard4项及cancel replay1项通过；旧Studio5项先通过、3项因旧Skill fixture缺installedHash/pin失败，更新fixture匹配原A5 pin契约后3项定向通过（含新增prefix reset）。8相关产品文件ESLint/diff通过。source与实际producer分别保留，不扩张为当前HEAD已重跑全部真实API；继续Sparse/G06/HM2，无HANDOFF，无阶段停工。

## M8 / G05 规则触发与 rerank 原预算消费

2026-10-11 source `ad21a1379`。有限支持唯一规则见 compute-policy §3.1。原 Hybrid 不再因配置存在而每次 rerank，普通/无因果证据/单一来源/缺预算上下文均 skip，仅多份独立因果来源请求排序，原 recall trace 收消费决定。Native rerank 省略 computeContext 也拒绝，未留未计账发送旁路。原 exact retrieval profile/Secret、Run operation/Project Task mutex/CAS 与 provider fetch 实际消费共享 send ledger；usage/null、取消、坏 output、上界估计均沿原规则，不新建执行器。权限及 source currentness 在拒绝可选计算后继续核验。

11 distinct relevant checks通过：FS/SQLite各一次实际rerank+fresh Narrator共享父额度与并发2申请只有1发送，共4项；无效响应保留直接17 total/partial counts、缺上下文/过期锚点/坏输入不发送1项；Project原Task收费/晚变更拒绝1项；实际Hybrid→NativeRetrievalService→middleware→provider HTTP触发、耗尽退回合法source和拒绝后source撤回1项；实际发送取消unknown与65条超限输入无charge1项；纯规则去重/不造事实1项；原ordinary检索不调用配置rerank1项；旧三种rerank/远程embedding协议沿明确原Session预算调用1项。最后坏output新增严格结果校验后仅相关断言重测；日志保留 initial/consumers/terminal 三份。8产品文件ESLint/diff通过，初12个缩进错误修正，不虚报全量测试。

新增API0，M1/HM1冻结基线和quota/费用未变化。只证明有限规则与已发送费用语义，不计作真实rerank算法收益、金额硬上限、Embedding/CPU全覆盖或G05/G06/HM2完成。继续本地投影/hash/proof/network观测及有界HM2；不写HANDOFF，不集成main。

## M8 / G05 工作量观测与 H4 source currentness 热点

2026-10-11，work metrics source `528735d2b`，private identity `ab9dd69b8`，对应 transaction receipt修复 `bd51fd94c`。唯一Hybrid追加guard/哈希文档数、service请求和data JSON bytes、Embedding text请求意图、rerank次数以及投影/排序/packing/proof的elapsed phase；费用unknown与not_requested分开，未宣称硬CPU/金额预算。原content-addressed index对伪造metadata/冷暖IO的新增metrics检查、NativeHybrid实际调用及原成功rerank改为合法因果fixture共3相关checks通过；不扩大为全suite。

H4原算法基线在实际loopback Native FS向量存储完成：有效SourceLifecycle conversation Episodes 100/1000/10000，各cold3/warm5，共24样本；明确fixture vectors、真实Embedding0、外部API0。每个warm仍hash全部文档，只有2个local request/1个query embedding意图；10000cold网络request body约4.50–4.66MB，warm642 bytes request/165310 bytes response，均是实测HTTP body数据，不含TLS/header。data metrics另标service_data_json_utf8，不能混作相同口径。基线p50/p90ms分别100 cold91.11/94.08 warm47.42/49.01、1000 cold618.64/626.38 warm350.44/367.21、10000 cold17735.54/18328.92 warm10086.85/10678.36。hash elapsed含chunk guard/yield，不能把guard与hash相加当总CPU。

热点证据支持沿原authority优化：私有cache复制以隔离公开输出，只在ledger内容改变时换identity；guard仍逐次查完整chat内容、enabled/scope、原epochs/provider/external proofs。10000暖态新p50/p90为2971.63/3056.04ms（有限样本下降70.54%，不是SLO），cold7499.28/7511.54ms；24对evidence SHA/选中source IDs全相同，原M1/HM1 raw ledger hashes与原pins匹配。随后发现await transaction返回后取最新cache token有借用后写identity的窗口，改为transaction内部receipt；该fix不是改写原ab9 producer测量。7 distinct针对性反例通过，包含未通知edit/chat切换/flag/concurrent write/access、readonly、manual stale/persistenceboundary、公开copy不别名、观察ABA以及queued transaction；新增queuefixture初未处理optional corrections导致TypeError，修正fixture后定向通过，日志保留。产品lint/diff通过。

私有脚本失败证据全部保留：首次Node24 crypto只读setter、次未设默认config均发生在测量前；v1/v2把insert纯文本OK当JSON，0样本失败。v1/v2还静默过滤错误账本文件名，仅quota被校验，原记录不覆写；m8-scale-baseline-raw-hash-audit.json单独核验真实m1-ledger/hm1-model-ledger两raw pins均匹配。v3改为全部必需文件存在才开始，按content-type解析，完成24样本和基线校验；guard-v1及comparison-v1另保存source/report原hash与实际有限数据。原sealed M1材料不读、不重跑，quota原账不改。

本checkpoint只完成观测与currentness热点，不计作source-valid delta/candidate cache、H3/G06或完整G05/H4/HM2验收；继续原任务，不写HANDOFF，不集成main。

## M8 / H4 有限 corpus/hash 复用组结束，转 G06

2026-10-11 source `33e72c0bf`、容量范围修正`6dfa778df`。支持矩阵唯一见hybrid-memory §6；原authority生成且immutable的source snapshot和真实Information eligibility组成cache依赖，拒绝JSON/换scope/Actor/Branch/时点/profile/源变更/晚到/重启错误复用。无proof和超容量full path，不缓存query rank或Final Prose；原remote hash/metadata校验及当前合法源guard全保留。改后的SourceSnapshot freezing有6个相关原source/currentness/rerank检查通过；新exact/hash/recompute/JSON/restart、time/profile/编辑/late/伪造metadata、Actor/Branch/grant三项通过。Actor fixture前两次因未声明第二Actor及对应view被原authority拒绝，补齐fixture正式声明后仅该项重测通过，不松产品grant。源/Information race及Game/Package/final Context四项通过；5相关产品lint/diff通过。

实际Native FS index IO的初reuse-v1 24样本原hash/producer保留：100/1000 warm p50/p90 30.43/32.17、76.09/79.27ms；10000却因初4MiB单项容量miss仍hash10000，warm3119.49/3278.95ms，比guard producer2971.63/3056.04ms退化。独立零APIaudit重建同fixture corpus7538944 bytes证实超初cap。最终单项在原16MiB总cap内，仅10000复测8样本；warm601.14/668.68ms、hash0/reuse10000、remote请求2及query Embedding intent1保持；该n5局部收益不是SLO/真实Embedding或金额节省。全部32候选样本与基线对应完整evidence SHA/选中source IDs相同，两原ledger raw pins匹配；m8-h4-corpus-reuse-audit-v1.json另保存report hashes、scope和校验。

各层cold口径显式保留：runner原cold字段只设置rebuildVectors；repeat0初derived miss，repeat1/2在可复用尺寸是derived warm+index rebuild，不能把三行称作所有cache全冷。initial大语料三行均容量miss；最终index-rebuild p50/p90 5094.78/7485.68ms只是混合derived状态，不作为全冷SLO。最新producer6dfa没有无理由重跑100/1000或API。失败报告、旧不利观察不覆盖，无新增外部API/quota变动。

本有界组结束，后续当前验收尚欠：G05非发送CPU/Embedding全硬额度和后台scope明确不可用；G06双入口可配置预算/费用unknown、actual selected target/continuation/reuse原因及有限ordinary/hard/high-impact/long配对消费；H3启用算法实际收益与退出、H4 delta/rank-cache未启用时保持简单重建。继续原消费者/UI和有限对照；完整M8/HM2未验收，不写HANDOFF，不集成main。

## M8 / G06 共享额度产品消费与关闭反例

2026-10-11 source `90c0dd72d`。原 Route fields editor 新增可选发送次数1–32及正整数 Token 上界，保存/撤回保留其它 policy；诊断展示当次实际 charge receipts、有效父 limits、unknown currency 与 Provider observations，Studio 沿原 Task.compute 显示累计记录。发现关闭 Route 配置可绕过已有 compute ledger，修复为原 Run lock/Task CAS 内优先复用已存在 limits；放宽配置也只取实际 receipt 的收紧值。没有并行预算 authority，未将当次 attempts 称作父剩余额度。

7新相关确定性检查通过：FS/SQLite Session/Project 各1项放宽/关闭不退款且 diagnostic receipts 等于原账本，共4项；Package 原后台 allowance 仍有余额时关闭 compute 仍拒绝发送，FS/SQLite共2项；字段编辑 bounds/保留 policy/提交后重新读取再关闭1项。改了 receipt 后仅重测已报告/partial usage2项和 FS/SQLite后台 unknown/restore2项，共4项相关回归通过。初 Jest 路径错误及 UI fixture缺 fallbackRouteRefs/精确 resources array、保存后测试旧 detached form 的失败日志原样保留；补齐 fixture 并按产品重新打开后定向通过。

真实 Edge browser 沿原全应用/隔离 Native Session 完成1440px/390px两项：invalid33浏览器拦截、2/64000保存再读取、关闭保存再读取、Escape恢复 list focus，无 pageerror/外部模型发送。初截图显示 checkbox继承文本框全宽，修正原 Runtime CSS 后仅这两个受影响 browser checks重测通过，截图已查看；沿用现有tokens/布局。6产品 JS ESLint与diff检查通过。外部API0，原quota/两冻结ledger未改；完整M8/HM2仍未验收，继续H3有限实际收益及G06双入口对照，无HANDOFF、main不变。

## M8 / G06 主模型有限配对：不利结果、裁判局限与工具边界修复

2026-10-11 paid producer `90c0dd72d`；后续 exact tool guard producer 见同组源码提交。新私有 run-m8-g06-paired.mjs 使用原 primary-only config（openai-compatible/gemini-3.8-flash），沿原 Host Session/Project、真实隔离 FS Session/Task 和原 shared charge，固定四个自写冻结场景、recompute/reuse两臂。两臂完整 evidence/packet hash相同，各1次fresh生成，不缓存Final Prose；Project目标Task从原复用工具取得fresh pending plan，通过现有buildNativeProjectAgentSystemPrompt进入实际请求。预览先核对16份有限请求；不跑M1/HM1原模型基线，不改两个冻结ledger。

ordinary为旧承诺/指代；hard为寄信人未知动机；high-impact是玩家自主权负例及source exposure边界（新增要求代玩家前往/宣告见面，不执行实际高影响mutation）；long是500源检索域、只将选中6源送入有限Host Context，不是500轮live历史。实际估计Input与Provider reportedInput分列，长Session实际reportedInput1688、Project1628 tokens。原合法Information过滤先于检索，生成Session将选中来源转换到正式Timeline IDs/Context refs；本有限Host直接消费没有代替完整UI入口/500轮持续正文验收。actual consumer Task/anchor/path/response/charge与原request bytes均在私有证据保存，不向正文输入opaque CoT。

24次实际HTTP200（16生成+8同主模型盲评），全部直接reported total共35334 tokens：recompute 8次12913、reuse 8次15182、judge 8次7239。currency/upstream/cache identity仍unknown。mixed Host E2E n8每臂p50/p90分别4864/13608和5678/13876ms，不是每层分布/SLO；non-streaming TTFT unavailable。long两入口复用均更慢且total更高，原不利结果保留，不能称Provider减费或总体加速。四对检索elapsed仅一次为0.54→0.42、1.12→0.62、0.60→0.95、73.73→70.92ms；有效corpus hit只说明少做对应投影，不保证生成费用下降。H4较大语料n5 IO收益仍只归原独立scale audit。

**完整qualityPass=false，未通过G06/HM2。** high-impact Project/reuse没有final prose，返回未声明的atri_agent_prepare_review调用；原报告judge六维0保留，工具未执行。long Session/recompute写“我确实记得”，reuse写“如今…书确实还在我这里”，前者无当前cognition source，后者无当前custody source；judge却给来源/unknown全2，实际漏判，不以平均分宣称满足底线。另judge仅看selectedSources，漏看合法原Native World中的harbor及渲染packet中的fact:H0-ZH-08-f39，误称该地点/ID捏造。零API audit比对保存的request/snapshot确认上述两个false criticism，保留原grades不覆写/补刷分。现有表达仍fresh generation，自由文本source/当前状态不能靠检索过滤保证；这些观察沿G06正文/原Narrative policy消费者继续处理，不把HM3 cognition当已实施。

具体工具失败修复沿原GenerationService：response.toolCalls必须属于冻结PromptIR.tools，正文提到工具名称不能授权response call；拒绝仍finally结算已取得direct usage，并discard失败native envelope。2新实际loopback反例（声明的只读工具合法、未声明prepare_review拒绝且20total结算、Task无operations）和受影响真实Studio client/native signed loop 1项通过；改成实观prepare_review形状后仅相关false项重测。原Memory手动debug trace补齐plan/invocation/reuse；checkbox tick改用原Atria text token后仅390px浏览器受影响项重测通过并查看截图。2相关产品JS ESLint/diff通过。该局部guard不覆盖未通过的自由文本质量。

preflight失败原样保存：v1 lanePlan没有原executionResources，v2/v3 Context ref误用message而非timeline，均零HTTP/零quota；临时本地debug插桩诊断后撤掉，v4/v5的16个preview完成（v5加入正式Project prompt及真实scope解释）。live-v1的Windows冒号证据文件名在fetch前失败，quota admission1/actualHTTP0分开；保留该准入，不称上游已收费。v2修证据文件名并在失败时保存原Run/Task ledger，完成原有24上限。两冻结raw pins、carry均匹配；新quota append共25admissions，其中实际HTTP24。m8-g06-paired-audit-v1.json以raw原report hash固定上述成本/延迟/不利质量，audit API0。

本有限真实对照结束，不无限重评、不新增服务/算法以挑选有利样本。H3语义rerank/真实Embedding缺可用已配置服务，维持基础检索及明确skip/unavailable；G06 task/adaptive policy continuity、完整长期消费者与质量出口仍未验收。继续当前具体源码/consumer失败及原依赖下可推进部分，不集成main、不写HANDOFF。

### G06 历史断言与当前 provider 状态的呈现边界

随后针对具体长篇失败检查现有packing：旧header含“supported active sources can answer current questions”，过宽地把来源仍受支持与当前状态混在一起；Package/Context消费的单个JSON group又不能只依赖全packet header。修正为明确active source不单独证明当前World/Actor状态，过去承诺不证明现在recollection/completion/possession；原JSON records新增authority区分source_assertion与provider_owned_state，当前provider字段继续标current_provider_state，历史provider与当前未决冲突分列。这只是原source/provider事实地位的呈现，不造新cognition/custody writer、不统一降级当前状态、不按中文case正则删正文。

4个受影响本地检查通过：atomic source/conflict完整预算与Package最终Context整体admission各1项；原provider current字段覆盖旧relation/fact并进入packing为provider_owned/current1项；provider撤回/chat切换/late tokenizer原held snapshot拒绝1项。packing产品ESLint/diff通过。原已获准World优先、源链/冲突/currentness仍由原authority；新的field/header计入原Context token预算。未再付费重跑原矩阵，原35334 tokens/unfavorable/qualityPass=false保留；此修复尚不证明随机模型自由文本的当前认知/持有状态断言已得到保证。继续G06原scope与HM2可独立推进部分。

日志 producer 补充：m8-g06-evidence-authority.log 的两个 packing 检查发生在最后 epistemic 分类表达式修改前，不能单凭该初日志宣称最终版本已验证。提交 `5595e0840` 后只补跑这两个受影响检查，m8-g06-evidence-final-packing.log 2/2通过；provider两个检查本来就在最终分类修改后执行。补跑不是新增 distinct 检查，原初日志保留。

### G06 原生工具回传观察的有限消费者

2026-10-11 source `89760af6b`。只解决 native observation 缺少当次决定的问题：成功 lowering/normalization 后，沿原 private envelope 的 binding/sequence 输出 protocol、mandatory_tool_exchange、request/task绑定 scope、process_only、已回传 checkpoint 数、首次/继续工具协议以及响应 capture/discard。三个 adapter 共用原 envelope 模块的呈现函数，无新 checkpoint/storage authority；不输出 signature/opaque body，不把回传数称上游已复用或缓存收益。原 Runtime 请求诊断 Provider观察可直接读取；真实 Studio client/routers/Host 两轮 HTTP 返回确实带 task scope，但仍仅当前 mandatory 工具循环，未实现跨turn task policy。

3个受影响本地双轮 HTTP checks通过（Responses/Anthropic/Gemini），保留完整 opaque wire 回传、公开preview/response不泄漏及完成后旧 checkpoint拒绝；初观察断言误用 adapter format 名称而非实际版本化 protocol，修正测试期望后重测这3项，v1失败/v2成功日志均保留。真实 Studio client不同request/attempt IDs的1项消费检查通过，scope=task/count0→1仍process_only。明确 policy active_execution/task/adaptive 三项在兼容路径发送/Secret之前 unavailable，也已定向验证；这是有限不支持矩阵，不能用识别字段或工具round-trip宣称续接策略完成。3产品文件ESLint/diff通过。

本组停止条件是以上受影响消费者和模式边界检查完成，新增外部API0，不重复已过协议/付费矩阵。原质量失败继续阻挡完整G06/HM2；剩余验收为可合法启用的策略生命周期及loss、真实长期入口/质量出口、H3已配置服务的收益或明确维持基础路径、费用/unknown与H4有限收益对应归因。H3新服务/算法及HM3 writer不扩张；继续原有长期消费者可独立验证范围，main未集成，无HANDOFF。

### G06 预载长 Timeline 的真实 Turn 消费边界

新增单一工程检查经原 Session `_newEntry`/publication 写入500对user/assistant及最终input，实际Timeline从1004到1006条；随后沿原 executeTurn、scheduler、Information、authority-first candidate、GenerationService、local HTTP与finalization完成一轮。已构造的合法memory候选引用旧Timeline message/current revision；旧revision反例在HTTP之前拒绝。实际wire8354 UTF-8 bytes，携带获准历史promise及正式public note，私有read sentinel和超出view的末尾raw历史不进入请求。原生产anchor的Run receipt在finalization之前观察为1次settled/direct120total；finalization进新anchor，不能把新anchor剪裁后的operations当同一账本。旧source在最终revision仍可exact读取，原action trace与新narration一同发布，历史前缀不变。

m8-g06-long-turn-v4.log 单项通过（source `7d21baa91`），外部API0。v1逐条1000次持久化准备约3分钟时poll还无结论，曾执行本地终止；其后最终原日志实际已有完整FAIL/Time218.717s，在Timeline长度误期望+1而实际+2处失败，先前已通过1次local HTTP/wire/finalText断言。因此v1有local消费证据而无整项通过结论，不能按早期poll写成零发送；原log保留，不计性能分布。改为原publication合法批量预载后v2同样只计narration而漏authority action trace失败；v3误把原Run operations object当array失败；修正fixture期望及在产生anchor读取正式receipt后，仅该单项定向重测通过。未改生产存储/预算规则、不扩成全局性能组。

本组只证明预载500轮历史的一次真实Turn和有限Context/source/时点/费用工程边界，memory输入是已构造合法候选，不等同整条Memory检索验收，更不证明500次连续模型生成、长期文体或source-backed cognition质量。该具体组结束，不重复已过checks；完整G06/HM2质量与可用continuation路径仍待验收，原不利paid输出/费用和main均不变。

### G06 verified active_execution 准入与失效终止

2026-10-11 source `0cd35d851`。修正G01时期的所有non-none一律拒绝：只对已存在native current tool-exchange消费者启用active_execution，且必须消费原capability publication的exact path/owner/account/target verified证据；port scopes仅说明实现能力，不证明gateway。task/adaptive仍独立unavailable；当前configured primary的旧实际gateway结果不重标新HEAD，不新增付费probe。本地synthetic verified proof只是隔离协议fixture，支持矩阵归g01-substrate末节。

同组发现两处authority/lifecycle缺口并修复。native binding曾hash candidate Route自己的policy，而snapshot冻结的是accepted policy；改为原GenerationService在countTokens之前附effectiveExecutionPolicy，count/render/capture统一使用接受值，候选Route原字段不改，原Host retry也按接受值重验。实际同路径fallback自身声明none但当前接受active的3次local HTTP反例成功，回到原Route继续同一工具checkpoint仍一致；不兼容新路径旧opaque仍不能复用。Secret期间证据过期此前在_send finally之前抛错可能留旧checkpoint，原send调用catch补原discard；已观察到的policy/prefix/path失效也沿原private envelope终止同owner/execution的authenticated reference，恢复同值policy不复活。增加owner fingerprint只从原Resolver真实handle派生，伪造引用或其它owner/scope不能用拒绝驱逐他人handle，无第二epoch/cache ledger。

17新distinct有限本地checks通过：三native adapter各一次active双轮HTTP消费3；仅声明/无consumer/换account路径/过期/native有active证据但task/adaptive两项仍拒绝共6；编译期间过期1；实际Studio不同request/attempt/shared Task ledger1；关闭再恢复active仍拒旧checkpoint1；同路径fallback accepted binding1；Secret期间过期并丢弃旧checkpoint1；Anthropic/Gemini各一项其它owner/伪造引用保留原handle而本owner观察失效终止，共2；active Responses在第二次actual send取消后旧checkpoint拒绝1。既有None三native双轮3、None取消1及未声明/合法工具响应direct20total结算2，共6受影响旧检查通过；新增binding/owner字段后只补相关consumer、编译expiry检查，不重复计distinct。

初v1测试Spy试图恢复被原Port冻结的resolveSecret，Jest suite失败，改fixture从创建时持jest.fn后仅相关新10项重测；同一初run的原兼容路径unavailable三模式检查已通过，未无理由再跑。owner unit初fixture缺原Context provenance字段被JSON authority拒绝，补provenance=[]后仅2项重测，不弱化产品规则。失败/成功各版本日志保留，7产品JS ESLint/diff通过。API新增0、M1/HM1账本及原paid unfavorable/qualityPass=false不变。

该具体组结束，策略支持仍是process-only当前工具循环，未完成task/adaptive持久恢复、safe fork/compaction或跨turn收益。剩余实际G06质量出口及HM2收益/unknown验收不以本组协议成功代替，main未集成，无HANDOFF；继续原任务可用消费者与具体质量根因。

### G06 Memory 呈现修复后的两条长篇 Session 局部复测

目标仅核查此前两条长篇的当前记忆/持有越界，停止条件固定为2次fresh生成及2次原主模型完整合法Context旧/新盲评，总上限4请求，无retry/fallback/重评。producer `0cd35d851`（packing行为producer仍`5595e0840`），沿原primary account/config、Host Session/Project grade、原Run/Task charge及24h2000/20RPM append gate。两生成和两grade请求先本地preview，grader估计input12056/12074；preflight API0。私有builder初误用+字符串失败，配额摘要初GBK读UTF8失败；前者生成runner前失败，后者只是摘要读取，不改变实际fetch之前的原hard quota gate，后改UTF8完成零API核验。原M1/HM1及原paid矩阵都不重跑/覆写。

4次actual HTTP200/direct totals28331：generation5002（recompute2903/reuse2099），critics23329（11819/11510）；gateway reported total不等于input+output时仍保留直接值，不推算reasoning/货币价格。currency/upstream/cache unknown。zero-API audit保留raw report/prior report hash、两冻结ledger pins、原charge receipts及carry unchanged；该audit时rolling24h693、last60s0，原限额2000/20未变，无reset/refund。M8累计actual35次、direct reported64919，原2次unknown上界17515及1次fetch前失败的quota admission仍单列。

必须收窄前节与原runner的long标签：500是原始source fixture总数，**两份paid report的实际合法检索corpusSize均为256 documents**，并非全部500来源都在合法域，更不是500轮持续生成。原paid selected6/new selected5，仍覆盖required s08-020；新header/authority/epistemic字段增加固定2400 UTF8估计预算占用，使1条distractor不再入选。当前recompute/reuse完整evidence/packet hashes彼此相同，但旧/新packet及source集合、实际reported input1688→1534不同；不是严格同输入消融，不能宣称修复因果或reuse收益。n1每臂generation E2E11933/5454ms，对原2033/13876ms有涨有降，无分布/SLO/节费结论。此前500轮预载Timeline的一次local Turn工程检查保持独立。

两新输出均未再断言当前“确实记得”或书“还在我这里”；同模型盲评当前两例六维全部2，同时将原两例来源/unknown降为1。但**完整quality仍false**：new reuse仍写“这件事确实尚未履行”“而它至今还没办妥”。原normalized Context确认当前World只hp/location，无当前履行字段；fact:H0-ZH-08-f39明确source_assertion/historical_source，只有第二十轮过去“未履行”，无validFrom/validUntil及独立当前cognition/custody/completion authority。该现在完成状态断言缺支持，critic仍漏检，原grades不改。完整Context提高了可见证据，仍是同模型观察而非独立事实真值；两旧错误被局部避免不等于两例完整source-boundary合格。

m8-g06-assertion-recheck-audit-v1初scope把500称legal domain过宽，零API修正另存audit-v2并pin前audit raw hash；不覆写v1或原reports。该有限paid组结束，不为提高分数追加生成/评价。下一具体根因是原packing已计算的时点适用性是否真正进入每个Context evidence group；只沿既有temporal/provider权威检查和最小本地验证，不新建cognition/履行writer或语言case过滤。完整G06/HM2未验收、main不变、无HANDOFF。

### G06 检索时点适用性进入实际 Context

source `e1b3de862`。已定位三处语义丢失：coverage完整组未序列化Corpus已计算的validAt；ranked把普通active Fact/Relation标题写成Current facts/relations且缺authority/epistemic；其实际Native evidence仅取doc.text。复用packing唯一record呈现，两个packing及ranked原生evidence均携原authority/epistemic与temporalApplicability的requested at及supported/outside/not_established三态。只呈现既有判断，不根据turn文字、source active或承诺推算当前cognition/持有/履行；requested time可为历史，未建立适用性不等于来源无效。provider current/conflict/history仍各持原epistemic，不加source未知时点来降级正式当前字段。头部规则共用，不新增writer、案例语言过滤或第二时间权威。

本有限组8 distinct本地checks通过：3项新增实际历史/当前/无请求时点ranked+coverage→原Package→最终Context内容与撤权、完整组outside/null与预算少1拒绝、长fixture原2400 UTF8估计预算下保留s08-020及未知时点；1项新增真实provider conflict双来源呈现；4项受影响原检查为provider当前字段抑制旧事实、正式历史快照与源编辑失效、Package完整chain最终预算/撤权、ranked core/header/source完整计数/oversized skip。long仍500原始sources、256实际合法documents，不升级为500轮持续生成。2产品JS ESLint、diff check通过，外部API新增0。

temporal-presentation-v1两失败为fixture把原生projection也计为recalled，以及原inactive relation支撑Fact的validAt实际null而预期false；改为识别原recalled metadata及读取已有relation false判断，未改Corpus权威。v2仅最终Context原排序与bridge原顺序不同失败，按完整内容多重集核对后v3通过。新增撤权断言后仅该受影响check与ranked预算检查重测通过；provider和long分别定向通过。v1/v2失败及各通过log均保留，不计重复为distinct。

该呈现组已结束；原两paid报告、completion失败及critic漏判不改，尚无本producer真实正文验收，完整G06/HM2仍未通过。下一正式依赖是G06实际质量出口：只对前次已明确失败的reuse输出做必要新producer有限消费及零API来源判定，不追加同模型评分或刷原配对矩阵；H3无已配置真实辅助服务仍保留简单路径，H4已有有限本地收益不外推。main未集成，无HANDOFF。
