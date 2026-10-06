# S01 — 双入口基线与 Eval cases 执行设计

- Status: **Structural / scripted complete；empiricalReady=false**；实际实施与验证见 [Record 的 S01](../../../records/refactor/agent-intelligence-runtime.md#s01--双入口基线与-eval-cases)。
- Task ID: `agent-intelligence-runtime`
- Product baseline: `ed1fd90521a63363e29856601abbf5e908c99d10`
- Basis: 用户已确认 M1 范围、三类候选、局部自动启用、逐 scope 开启和分组集成；本模块是该已授权任务的首阶段工程细化。
- Scope: 有可执行消费者的 cases、报告契约与基线 runner；S01 不发布改进版本。

## 1. 有限交付与读取路由

交付 RP / Director 与 Native Project 的可重复案例、结构化结果报告、失败 / 缺失状态和费用记录；后续 S02 / S06 实际消费这些案例与结果。
先读 index → decisions → 本模块 → Record；只在对应问题出现时读 m1-evolution 或 baseline 的相关段落。
后续 schema / 资源路径在引入对应能力的阶段细化，不把全部 34 阶段字段先冻结。

S01 沿用 M1 产品分支 `feat/agent-intelligence-runtime`，从重新核对的最新 main 开始；S01 已在该分支完成 test-only 交付并 push，尚未合并 main。
案例只能使用版本化的虚构数据和隔离 Project / Session，报告不含用户聊天、Secret 或机器目录。

## 2. 可复用的入口

| 入口 | 实际消费者 | 现有定位依据 |
| --- | --- | --- |
| RP / Director | `runMainAgentLoop`、message takeover、per-run registry；Runtime permission / freshness 底线 | `tests/orchestrator/director/{integration,abort,content-payload}.test.js`；`tests/agent-runtime/{kernel,durable-recovery}.test.js` |
| Project model loop | `runNativeStudioAgentTask`，保持现有 generation / tool 路径 | `tests/atria-shell/studio-agent-a8.test.js`；`public/scripts/native/studio-agent.js` |
| Project authority | `ProjectAgentService` → `StudioService` → 私有 Workspace / Review / changeset | `tests/native/{project-agent,project-agent-http}.test.js`；`tests/storage/harness/fs-harness.js` |

提取必要的 test-only fixture helpers，复用同一代码路径；不建立第二个 Project planner / model executor，也不把现有脚本化断言包装成真实模型收益。
允许为 runner 增加必要观察接口，但不改变生产决策、权限或读取版本规则。
Project 模型只到 Review；测试用明确的 fixture reviewer 调用 commit，分别记录模型阶段和正式结果。

## 3. 案例集 v1

每条路径三个 development 场景，以及三个内容不同、行为维度相同的 promotion 场景；独立固定输入和 revision。共 12 个案例。
promotion 输入可以由隔离 evaluator 读取；提炼端不读取其答案或逐条评测文本。

| 案例族 | development / promotion ID | 场景与观测 |
| --- | --- | --- |
| RP 玩家行动边界 | `rp_agency_d1` / `rp_agency_p1` | NPC 面对玩家选择，只表达自己的行动和反应；结构输出 owner 检查与自由文本行为评价分开 |
| RP 历史约束适用 | `rp_memory_d1` / `rp_memory_p1` | 回合中出现已知承诺、后续修订和另一角色不可见的线索；检查实际 request 中的引用、exposure 与本轮应用 |
| RP 取消 / variant | `rp_variant_d1` / `rp_variant_p1` | 请求或工具等待时取消、再生成另一 variant；检查旧 completion 不写新消息、run / request 不串联 |
| Project 正常 authoring | `project_authoring_d1` / `project_authoring_p1` | 修改虚构 Project 名称 / 元数据，建立 plan、proposal、validation、Review；fixture reviewer 后检查单一 changeset |
| Project 版本冲突 | `project_conflict_d1` / `project_conflict_p1` | 计划后由 fixture human 修改 baseRevision；旧 Agent proposal 进入 conflict，原 human revision 保留 |
| Project 有界修复 | `project_repair_d1` / `project_repair_p1` | proposal 存在实际 validation 错误；检查修复、repair 上限、Review / blocked 与正式写入次数 |

基线测量当前行为，case 的期望不倒逼提前实现 S03 / S04 / M3。当前捕获或恢复能力不足时记录 gap / unavailable，不伪造 trace、持久任务或认知状态。
production cases 的真实随机模型结果允许失败；失败是基线观测，runner 健壮性和 deterministic invariants 是 S01 验收对象。

## 4. 报告契约 v1

所有资源 JSON-safe；版本与 schema 不匹配时显式拒绝，不通过 latest / 空字符串补齐。

### Case

- `schemaVersion: 1`、`caseId`、`caseRevision`、`entrance: rp | project`、`split: development | promotion | regression`。
- `fixtureRef / fixtureHash`、`inputHash`、`rubricRevision`、`requiredCapabilities`、`limits`。
- `expectedInvariants` 固定权限 / ownership / revision 等底线；`behaviorDimensions` 固定观测目标，不把脚本模型的台词设为真实模型唯一标准答案。
- `caseRevision` 由规范 JSON / fixture 内容求稳定 hash；文本、rubric 或环境假设变化会产生新 revision。

### Trial

- case identity、`trialId`、`executionMode: scripted | model`、`adapterId / revision`、tested product HEAD。
- 接受的 input / Prompt / Skill / Preset 指纹；没有精确引用支持时标明 `pinningStatus: unavailable`。
- run / request / effect / task / message variant 的对应 refs；仅实际取得的字段入库。
- `executionStatus`、`finalTextStatus`、`authorityStatus`、`reviewStatus` 分开；状态为 `passed | failed | not_run | unavailable | budget_blocked | cancelled`。
- 各检查为 `{status, evidenceRefs, reasonCode}`；`completeness` 列出缺失内容。缺失不计 passed，也不从分母静默删除。
- `usage` 分 `provider_reported / reserved_upper_bound / unavailable`；model calls、tool calls、retry、latency 和修复次数分别记录。
- 行为维度使用 `0=违背 / 1=部分满足 / 2=满足`，保留 judge 来源、分歧和人工 preference；未执行 grader 时为 `not_run`。

### Report

- report schema / case-set revision、所有 trial refs、环境模式、实际执行计数、质量 / 费用汇总和 `empiricalReady`。
- `empiricalReady=true` 仅在真实模型 trial、精确配置和费用记录满足所要求覆盖时成立；所有 scripted 结果也通过时仍为 false。
- 确定性检查与行为分数分别聚合；报告中没有单一“Agent 已变聪明”的总分。
- 未知 trial / case refs、重复 trialId、混用配置、计数不符、缺失 usage 冒充零值均拒绝。

建议 test-only 模块放于 `tests/agent-intelligence/`，供 Jest 与 baseline command 共用；不向生产资源 registry 注册 S02 尚未引入的资源。
本阶段输出只使用现有测试临时目录 / 明确的报告目标。永久 Record 保存可公开汇总和 tested HEAD，不提交私人响应、缓存或生成报告目录。

## 5. 运行与预算

Scripted 模式：全部 12 cases 各执行一次，实际调用 Runtime / Director / Project authority；费用明确为无外部 provider 调用。不能用于自动晋升的行为收益证据。
Model 模式：先取一个 RP 和一个 Project development 案例，各三次 trial；复用当前已配置的 generation 入口。原调用路径不支持某能力时标 unavailable。
promotion 场景的完整 baseline 在进入 S06 比较前补齐，不能用这六个 development trials 代替独立晋升案例。

S01 live pilot 必须提供有限 `maxRequests` 与 `maxTotalTokens`；不默认读取 Secret、选择付费 route 或发起模型请求。
每条路径每 trial 最多六次 model 请求，pilot 最多 36 次模型请求；如果增加独立 model judge，总上限最多 42 次。retry、fallback 与 grader 都计入上限。
输出预算沿用当前明确 generation 配置；请求前按 input token count + reserved output 做 reservation。总预算不足就不发送下一请求；不缩小案例覆盖后声称完成。
实际 token 上限由现有请求 preview / count 与有限 pilot 配置给出；没有该配置就报告 `budget_blocked`，先交付 scripted runner，不把无上限预算作为默认值。
取消 / usage 缺失时保留 reservation 上界，避免重试重复开销被漏算。

## 6. 验证与失败处理

新增验证须对真实问题有效：错误 ownership、variant 混用、伪造 report 成功、忽略缺失 usage、重复提交、stale revision、case revision 漂移、split 泄露。
targeted suites 先覆盖新增契约 / runner，再覆盖上述 RP / Project 既有入口；只有出现相关失败或改动才扩大。
测试依赖按既有 lockfile 安装；不以下载最新 Jest 或绕开现有配置改变基线。

没有 UI 改动时无需为文档截图；如果 real-model 基线经过真实浏览器，则只称已实际走通的路径通过，并记录版本与环境。
fixture 运行必须对隔离产物做前后校验，确认生产对象未发生修改；临时数据清理只操作该 runner 创建并核对的根目录。
采集 / 序列化失败必须产生明确失败或 incomplete 记录；绝不沿用 trace exporter 的静默丢弃策略。

## 7. D2 补充测量边界

保留本模块 12 cases、Case / Trial / Report v1 和有限 pilot 上限，不增加生产 schema 或提前实现 G01–G06。已有真实入口能提供的 target、adapter、已观察 upstream、root / child / attempt、foreground / background、TTFT、input / cached / output / reasoning 等计数作为报告测量依据；拿不到就记录既有 completeness / unavailable。
新增可选测量在 test-only 版本化 sidecar 中关联 trialId；消费端未知 schema 明确拒绝，不把额外字段强塞进严格 v1。S02 / G01 注册新产品契约前单独细化。

先记录当前 Director / Project 调用图；一次正文是后续 ablation 的对照目标，不因测量而删除 Package 必需 resolver、工具 / authority guard 或改变测试期望。S06 / G06 再运行可用对照。价格、上游 snapshot 与 usage 可知程度分别注明；scripted 零外部调用不能当真实模型低成本证据。

## 8. S01 结束条件

必须交付：12 cases、可执行双入口 scripted runner、报告 consumer / validator、缺失和预算状态、针对性 tests、实际 baseline 记录。
当前模型 / route 可用并有有限 pilot 配置时运行真实模型基线；不可用时明确 `empiricalReady=false`、原因与补测入口。
允许在结构交付完成后进入 S02，因为来源契约不依赖某模型表现；在 S06 比较和 S10 自动启用前，真实模型证据必须补齐。M1 未满足完整行为验证时不能完成。
不把 future capture、Goal、BDI、Skill immutable history 或自动发布纳入本阶段实现。

按治理在 S01 实现 / 验证 / push 后更新同一 Record、live HANDOFF、给出接手提示词并停止；此时不合并 main。
