# 40 个候选阶段：交付、依赖与验收

> M1 范围已冻结；S01–S09 与 S10 工程交付完成。S06 真实比较仍 ineligible；M1 的独立真实案例改善与集成前置条件待验收。后续阶段未进入。
> D2 保留 S01–S34，新增 M8 的 G01–G06；不重编号已有阶段。阶段数服务于可独立审阅与验证。
> D4 将 Execution Reuse / Cache Locality / Adaptive Invocation 的 A–F 逻辑顺序映射既有阶段与后续研究池，不新增正式阶段或扩张 M1。

## 1. 建议的交付组

| 交付组 | 阶段 | 用户能获得什么 | 退出门槛 |
| --- | --- | --- | --- |
| M1 — 从真实运行中成长 | S01–S10 | RP 与 Project 都能记录证据、给反馈、验证改进，审阅或按局部规则自动启用并撤回 | 两条入口按m1-acceptance完成自动化工程闭环与独立模型比较；生产局部自动发布仍满足S10原human gate，工程review / 回滚实际可用 |
| M2 — 持续目标 | S11–S14 | 跨 run / 重启保存目标，由证据完成，在允许条件下继续 | 不重做已提交操作；branch / rollback / 暂停行为明确 |
| M3 — 社会认知 | S15–S21 | 角色各有 belief、intention、情绪、关系和对他者的有限假设 | 长对话 / 保存恢复保持角色连续性和知识隔离 |
| M4 — 预测与计算分配 | S22–S26 | 高影响行动预演，简单回合快速执行，预算可解释 | 相同质量底线下有明确决策或质量—成本收益 |
| M5 — 表达 | S27–S29 | 同一认知 / 意图驱动文字、语音、Avatar / 画面 | 每种输出都有可用 consumer、取消和文字降级 |
| M6 — 外部生态 | S30–S32 | Tool、远程 Agent、交互 UI 能接入 Atria | 真实 adapter 测试，scope / revision / authority 没有丢失 |
| M7 — 可学习后端 | S33–S34 | 经许可导出轨迹，接入优化 / 训练并重新评测结果 | 数据与 adapter 有真实消费者；产物重新通过晋升门槛 |
| M8 — 生成与计算基础 | G01–G06 | 创作 / Behavior 与 Context 分层、按预算解析模型 / 网关、稀疏调用与全部费用可检查 | 双入口真实请求消费；迁移与撤回；可用 gateway integration 与质量—成本对照 |

用户已确认先完成 M1，并在首批包含有预算与回滚约束的局部自动启用；首批详细设计见 [m1-evolution.md](m1-evolution.md)。
建议保持 M1 → M2 的产品顺序，再交付 M8，随后 M3 / M4。M8 只依赖 M1，不依赖 M2 的 Goal continuation；M3 开始前要求 G06 完成。M1 不等待 M8。S01–S10 工程链路已交付，S10 的原局部 authority / 有限预算 / 隔离评测 / publication / rollback / 双入口 UI 见 s10-evolution。真实六槽基线与六对比较保留，候选仍 ineligible；本轮假 provider 不证明实际质量 / 成本收益。下一工作补齐 M1 验收证据与集成前置条件；不合并 main、不进入 S11 / G。

可以为 Goal 增加早期只读目标关联，但不把 M2 的自动 continuation 混进第一个学习闭环。

M1先补原反馈/评价契约，再各一个RP/Project试点。补充工作包F0–F3及退出唯一归属 [m1-feedback-evaluation](m1-feedback-evaluation.md)，实际试点门槛归 m1-acceptance §1/§2，测试执行归 Governance §13.1。F0设计及F1最小消费者完成，下一是 F2 来源/校准与必要工程诊断、修复、复测，验收通过后进入 F3。
M5–M7 的具体 provider 和范围在进入对应交付组前重新确定；资料引用不能替代设备、模型或服务可用性。

## 2. D0 / D1

### D0 — 全面调研与讨论稿

- 已核对原研究、最新远端 main、完整治理和当前状态。
- 已审计执行、Native authority、信息投影、memory、两个 Agent 入口、Skill / Prompt / Preset 与扩展路径。
- 已复核研究与协议，明确哪些是代码事实、论文结果或工程推论。
- 交付本 Bundle，保护已有 Experience 草稿，更新同一 Record 后进入讨论。

### D1 — 冻结首批方案

首批双入口、三类候选、局部自动启用与 M1 完成交付后集成的安排已由用户确认。
逐角色 / Project 开启局部自动、新建默认审阅、共享 owner 有限预算已确认；scope / publication / 恢复约束与 [S01 执行设计](s01-baseline.md) 本轮冻结。
S01 使用 test-only cases / report / runner，无产品数据迁移；S02–S10 的资源契约在引入能力前细化，其余路线仍为候选。
D1 完成后按依赖从 S01 推进 M1；不把整个 Bundle 自动标为 Approved。

### D2 — 三份研究综合更新

先读现有 Bundle，再全文读取 Prompt / Context、Sparse AI 与 Model / Provider / Routing 三报告；复核同一最新 main 的相关接入点及一手 provider / gateway 文档。
交付 behavior-context、compute-policy、model-routing 三个详细模块，更新现有依赖、测量与验收；保留研究证据、工程推论与用户批准的区别。
本轮设计更新只涉及 docs；不执行 S01 或新增 G 阶段。

### D3 — Reasoning Continuity 架构整合

读取指定研究，把可选执行能力、opaque 状态、精确路径 evidence、adapter 分工、lineage / invalidation 与 loss 观测纳入现有模块；用 model-routing §7 管理详细规则，不复制研究的示例 schema 或另建 Runtime / Eval。实施顺序映射 M8，保持 40 个阶段身份与 M1 范围。此次设计更新只涉及企划与同一 Record；不实施产品代码。

### D4 — Execution Reuse / Cache Locality / Adaptive Invocation 整合

读取新研究并参考 Reasoning Continuity 边界；execution-reuse 管理有效性 / 依赖 / 产物消费，behavior-context 管理 Segment / canonical compiler，compute-policy 管理调用阶梯与预算，model-routing §8 管理 cache capability / locality / observations。保持 §7 唯一 continuation 定义；A–F 映射见 §8.1。本轮仅企划整合、同一 Record / HANDOFF 和本地文档验证，下一产品 checkpoint 仍是 S04。

## 3. M1 — 证据、评价与经验成长

| 阶段 | 依赖 | 实际交付 | 针对性验收 |
| --- | --- | --- | --- |
| S01 — 双场景基线与 Eval cases | D1；s01-baseline | 固定 12 个 RP / Project 案例、报告、baseline runner 与资源记录；复用现有测试 / generation 路径 | scripted / model 分开；区分 final text、正式 state、Review；模型缺失明确标记，晋升前必须补齐 |
| S02 — 来源 / 引用 / 有效性最小契约 | S01 | 两种 source adapter 和首批 EvidenceSet / Evaluation consumer，复用现有 result / artifact | 伪来源、错误 owner / branch / hash、删除或失效源均不可当成当前证据；展开有预算 |
| [S03 — RP 可靠轨迹与持久证据](s03-capture.md) | S02 | 连接 run / child / effect / request / message variant 与 Native outcome；补 Director bridge 的 trace 关联 | 当前投影不变成全文日志；捕获缺失显式显示；root / child / attempt / 后台可归因；取消、重生成、重试不交叉关联 |
| [S04 — Project 持久任务与轨迹](s04-project-recovery.md) | S02、S03 的公共持久层 | 为现有 ProjectAgentService 增加持久任务 / attempts / timeline，并关联 Studio validation / Review / changeset | Host / 浏览器重启后恢复；commit receipt 幂等；过期 baseRevision 进入 conflict，不重复写入 |
| [S05 — 反馈与经验的作用域 / 生命周期](s05-feedback.md) | S03、S04 | 显式反馈、弱观察、技术 outcome、诊断分层；保留 / 删除 / 导出和来源失效路径 | 已交付 exact source / Host subject / CAS、纠正 / 撤回 / 删除 / 导出 / retention；regenerate 保持弱观察，reflection 仅事件 / 聚合 batch，无固定每轮模型调用；5 suites / 137 tests |
| [S06 — 两条入口的隔离执行与比较](s06-comparison.md) | S01、S05 | 在 Workspace / Session 副本重跑 baseline 与 candidate；固定输入、版本、工具模拟和 judge | evaluation 无生产副作用；case / trial / rubric 可追溯；独立案例未用于提炼；现有可用 1-call / cognition / critic / Director ablation 报告质量—成本与缺失 |
| [S07 — Skill 候选与版本固定](s07-skills.md) | S06 | 已交付原 Skill repository 完整 immutable snapshots、正文 candidate / base CAS、RP shared run / Native / Studio exact read pin与历史 | 13 suites / 247 distinct local tests；运行中编辑保留旧pin、旧版本可取回，删除 / corruption不fallback；自动晋升未实施 |
| [S08 — Prompt 候选与精确引用生效](s08-prompts.md) | S06 | 复用现有 immutable Prompt 资源，声明可演化区块、候选 diff 与有效 binding | 不靠 latest fallback；Package 原版保留；候选启用在下一 run 的 exact request snapshot 可见 |
| [S09 — 编排策略候选](s09-strategies.md) | S06 | 已交付原Workspace有限单字段预算候选 / exact binding / rollback，原Project pristine Task maxRepairRounds候选 / task CAS | 8 suites / 105 tests；capability、output owner、必要guard固定；原Director / Agenda预算停止、Project repair上限 / in-flight拒绝；不改连接 / 隐私 / 自动路由 |
| [S10 — 评测晋升、撤回与双入口产品闭环](s10-evolution.md) | S07、S08、S09 | 工程交付完成：原 target diff / 审阅、共享有限预算、隔离评测、局部自动 publication / receipt / next-run evidence、暂停 / rollback | 12 suites / 233 local tests + 共享 pane browser fixture；单一 target / 不叠加独立报告；实际模型改善仍待 M1 验收 |

S02 已完成最小只读契约，详细边界见 [s02-sources.md](s02-sources.md)：两个域 adapter，RP 内保留 chat / Native 分域；EvidenceSet / Evaluation 是可调用消费者的返回值，无新持久 kind / migration。S03 可靠 RP metadata 捕获与公共持久层已完成，契约 / 不完整输出边界见 [s03-capture.md](s03-capture.md)。S04 Project task 持久恢复、公开对话、正式 receipt 幂等与 conflict 已完成，详细契约见 [s04-project-recovery.md](s04-project-recovery.md)。S05–S10 的实际完成范围见各详细模块；S10 的支持矩阵、保守门槛、原 authority / 下一 run、source invalidation、预算与恢复见 [s10-evolution.md](s10-evolution.md)。S10 工程交付已完成；M1 实际改善未验收，不以结构 / scripted 检查满足独立模型收益门槛。

第一批不能止于日志、规则列表或“AI reflection”。发布改变必须由相同权威读取入口真正消费，并在独立案例评价。
三类候选是已确认的 M1 范围；若出现实质范围变化，明确记录调整，不在阶段结束时悄悄缩水。

## 4. M2 — 持续目标与有界自主性

| 阶段 | 依赖 | 实际交付 | 针对性验收 |
| --- | --- | --- | --- |
| S11 — Goal 主体、契约与持久状态 | M1、M2 设计冻结 | User / Project Goal 与 Actor Goal 分域；criteria / budget / lifecycle / evidence refs | 跨 run / 重启仍存在；Todo / commitment 不自动变成有写权限的自主 Goal |
| S12 — 完成证据、冲突与失效 | S11 | 通过现有 authority / artifact 检查 criteria，处理不足、冲突、过期和撤回 | run complete / 模型自述 / 外部 complete 无法伪造 Goal 成功；fork / rollback 重验 |
| S13 — 事件触发、durable intent 与调度 | S12 | 复用 lifecycle outbox 与 TaskScheduler，补 Project continuation adapter；暂停 / 取消 / takeover | 重启无重复 wake / effect；scope 关闭终止；预算耗尽不会假报完成；公平调度与幂等 |
| S14 — 双入口 Goal 工作体验 | S13 | 可检查 criteria、证据、预算和下一步；将 Goal 接入 Agenda / Director / Project 的现有 context | 两条路径各完成一个跨 run 目标；waiting / blocked / stale / cancelled / resumed 状态有清楚显示与恢复 |

是否支持应用关闭期间按真实时间唤醒，在 M2 设计阶段单独确认。世界 clock、用户事件、Host 存活时调度与系统级唤醒不混为一谈。

## 5. M3 — 持续角色与社会认知

| 阶段 | 依赖 | 实际交付 | 针对性验收 |
| --- | --- | --- | --- |
| S15 — 角色身份与 profile projection | S02、S11、G06、M3 设计冻结 | 在既有 Actor 精确身份下分离稳定设定、风格与动态 state；保留旧文本 profile、表达 / Narration 分域 | 旧角色 / Package 可读；作者设定不被一次互动改写；更换模型保持身份 |
| S16 — Belief 与可见知识边界 | S15 | 扩展已有 Information 投影的 cognition consumer；工具 / context disclosure 检查及自然语言 audit | 不同 Actor 不共享隐藏信息；belief 可错但不写为 Truth；自由文本 audit 的保证等级明确 |
| S17 — Desire / Intention 与 Goal 关联 | S11–S12、S16 | 持续愿望、当前意图、有限竞争 / 冲突，与 Goal / commitment 显式关联 | 用户执行目标与角色愿望权限不同；事件导致有依据更新；局部意图有取消和过期 |
| S18 — Emotion / Relationship appraisal | S16、S17 | 以获准事件的共享 cognition pass 采纳动态情绪 / 关系变化，可选择认知 profile | 一次事件不重写全部 traits；变化可解释 / 撤回；不强制对玩家公开数值；不追求单调加深依赖；普通 turn 读 state，事件 gate 与费用可验收 |
| S19 — 有界一阶 / 二阶 ToM | S18 | Actor 自己关于他者的假设、预测和 confidence 更新 | 不写成他者真心；hidden state 不泄露；嵌套 / 节点 / 展开 / 模型调用有界；真实行为可反驳假设 |
| S20 — 因果角色轨迹与 Memory applicability | S19 | 事件 → appraisal → state change → action 的来源链；检索后的适用判断 | 避免第二事实图；旧证据修订能失效下游；检索旧记忆不机械强制行为 |
| S21 — 认知检查、保存恢复与长期场景 | S20 | 用户 / 作者允许的 cognition inspector；save / export / rollback 接入；多角色持续场景 | 秘密、误会、承诺、关系变化跨多回合可恢复；权限视图分离；评价连续性、费用和用户偏好 |

RP 是本组主要产品 consumer。Project Agent 只消费与其真实任务相关的用户约束 / 意图假设，不强行使用 NPC 情绪或娱乐关系系统。
“并重”意味着基础设施与验收都有两条路径，不意味着每种角色心理能力都必须复制到 Project UI。

## 6. M4 — 未来预测与资源自我调节

| 阶段 | 依赖 | 实际交付 | 针对性验收 |
| --- | --- | --- | --- |
| S22 — exact snapshot 的确定性预演 | S02、S12、G06、M4 设计冻结 | 对已有 Simulation / Studio 操作构造私有 hypothetical candidate | 不 publication、不执行真实副作用、不触发真实 Memory；base revision 变更使预演失效 |
| S23 — 文本 / 结构化 World Model provider | S22 | 一个实际可用 provider 的 observation / action → prediction；assumptions / uncertainty | 与确定性预演区分；能力不支持时显式失败；prediction 不进入 World Truth |
| S24 — 候选行动比较与预测反馈 | S23、S19 | 仅在触发证据与额度内有限 rollout、比较、选中 action proposal、真实 outcome / prediction error 关联 | 未选未来不会污染世界或经验标签；RP 决策和 Project 高影响方案各有独立收益证据 |
| S25 — Fast / Slow cognition 与失效处理 | S13、G05、G06；涉及预测时另依赖 S24 | 深化 G05 的规则基线，高影响节点 slow path；异步结果受现有 scheduler / revision 管理 | slow result 不覆盖新回合；必要 guard 保持；低延迟与重决策都可恢复 / 取消 |
| S26 — Metacognitive budget policy | S25、G06、S10 的评价数据；预测策略另需 S24 | 基于共享预算与 policy resolver 深化计算分配，含 reasoning / recall / target / branch / critic；先规则后有证据的 classifier / learned candidate | controller 开销计入总成本；同质量底线比较；难例不能因 fast-path 回归；可回退固定策略 |

硬预算、普通路径和 telemetry 从 M1 / M8 开始，不能到 S26 才补。S25 / S26 不必等待 World Model 才优化普通路径；使用预测的策略单独依赖 S24。初期先固定预算做对照，再增加动态策略。没有预测质量证据时，更多 rollout 不能算成功。

## 7. M5 / M6 / M7 — 后续可替换能力

| 阶段 | 依赖 | 实际交付 | 针对性验收 |
| --- | --- | --- | --- |
| S27 — Communicative intent / ExpressionPlan 与文字 | S18、S25、M5 冻结 | 先由当前 prose / message projection 消费同一表达意图，保留文本 fallback | 不泄露私有 cognition；语义与文风一致；旧文字路径可用 |
| S28 — Speech provider 与时序 | S27、选定可用 provider | 文本 / 情绪 / 节奏等 provider 实际支持能力；task、缓存、取消和声音配置 | 真实音频输出、延迟与取消；不支持 prosody 时有说明；跨回合 voice identity |
| S29 — Avatar / visual embodiment | S27、选定可用 renderer | 接入现有 Native frontend / extension / illustration 的表情、动作或场景 consumer | 有实际画面、responsive / accessibility 状态；fallback；无新平行 plugin authority |
| S30 — MCP Tool / Data / Apps adapter | S02、S13、M6 冻结 | 按固定协议版本发现和调用一个真实工具 / 资源，必要时消费交互资源 | 认证、权限、取消、预算、外部 provenance；工具资源不能越过本地权限 |
| S31 — A2A remote Agent adapter | S30、S12 | 远程 task / message / artifact / cancel 映射到现有运行入口 | 远端状态重连、失败、版本协商；远程 complete 仍由本地 evidence 判定 |
| S32 — AG-UI / A2UI event 与 UI adapter | S30、实际 UI 用例 | 现有事件投影与受允许组件目录映射，复用 Native frontend contract | 隐藏状态不外泄；未知组件被拒绝；真实交互回传；旧客户端降级 |
| S33 — 可导出的学习轨迹与数据规则 | S03–S06、S10、M7 冻结 | observation / action / outcome / receipt / preference / reward 的版本化 export；至少一个离线 consumer | 导出权限、删除、来源、缺失、数据切分和 labels；不能将 inference 伪装成人工真值 |
| S34 — 优化 / 训练 adapter 与回归晋升 | S33、实际后端可用 | 接入选定 prompt optimizer / model selection / training backend，执行受限 pilot，评测候选产物 | 使用独立验收；配置或模型可撤回；不经评价直接在线自改；无法取得后端时保持该阶段未完成 |

S28 / S29 / S34 需要在各自阶段设计时落实真实 provider、预算和环境证据。预留 contract、写 README 或返回 mock 不能满足其交付条件。

## 8. M8 — 生成与计算基础（新增有限交付组）

详细职责分别见 behavior-context、compute-policy、model-routing 与 [execution-reuse](execution-reuse.md)；Reasoning Continuity 的唯一详细规则见 [model-routing §7](model-routing.md#7-reasoning-continuity执行状态与生命周期)。本表只管理顺序与交付；两份研究的 A–F 都是映射，不增列正式阶段，也不混成同一能力生命周期。

| 阶段 | 依赖 | 实际交付 | 针对性验收 |
| --- | --- | --- | --- |
| G01 — 语义 / Target / Evidence 契约与迁移设计 | M1；本组设计冻结 | 沿现有资源管理注册必要 profile / policy / evidence 契约，旧 Route 固定策略 adapter；request preparation 实际消费新 evidence；对齐 Reuse Contract、identity / scope / provenance / dependency / purity 与三层 cache capability | Schema / owner / freshness、旧 exact 读取、未知版本、FS / SQL registry 与 dump / restore / 删除；consumer 无调用即能诊断不可行需求与无效 reuse candidate；包含 continuation capability / handle / lineage 与 checkpoint 边界的严格校验 / 删除 / 恢复设计；不新增平行 dependency authority |
| G02 — Behavior / Creative 与 Context 编译 | G01 | RP writer / Project 接入语义控制、受限 context lanes、progressive disclosure、精确 overlay 与确定性 lowering；稳定 Segment / Resource identity、canonical serialization 与 cache-aware layout；压缩有来源，adapter 原生 envelope 与可见 message 分离，向 Runtime 提交最终 binding 指纹 | 身份 / 旁白 / 角色表达互不污染、工具许可与 source current、预算不足；固定输入可重建，压缩 continuation；动态输入不污染稳定渲染，schema / tool order / effort / history 变化会重验 binding；原生 item / signature / tool 顺序不丢失；无隐藏优化调用或无关 padding |
| G03 — Policy Resolver 与 FailurePolicy | G01、G02 | 有限候选、hard filter / task-specific score / freeze；价格 / health / locality evidence consumer、固定模型模式、独立恢复计划；先 Tool / Artifact proof consumer，再结构化 Plan / Workflow 重绑定与 Narrative Intent 前置复用；continuation scope 与 continue / fork / reset / discard 决策实际被消费 | unknown capability / price / cache 不伪装可用或免费；隐私 / 地区 / 合约 / 预算不随 fallback 降低；Context 重编译有界，policy 不热改请求；依赖 / 时间 / 实体 / 权限变化、mutation receipt、branch / restore / edit / regenerate、路径切换均验有效性与 loss；旧正文不当 semantic hit |
| G04 — Gateway / Local 执行观察 | G03 | Direct、gateway pool / alias / mapping / opaque 与 local 的真实 adapter 接入，attempt snapshot / observation，nested retry 与 affinity；按冻结矩阵依次验证 OpenAI Responses reference → Anthropic native → Gemini native → gateway continuation probes；同路径验证 Provider cache controls / telemetry 与 cold / warm observations | 本地 HTTP 矩阵与至少可用真实 gateway 的有限 integration，其他品牌未测注明；stream usage 缺失、reported identity、取消 / retry amplification 不造事实；native cursor / opaque replay / signed blocks、prefix / 方向性兼容、stream 完整性与 fallback loss 有 round-trip 证据；区分请求 cache mode、实际 reported hit 与 unknown，不宣称 Local KV / decode 已落地 |
| G05 — Sparse 准入与共享预算 | G03、G04；M1 持久 job | RP / Project 共用沿 RunControl / send boundary 的 reservation / charge；纯规则 Adaptive Invocation 阶梯、按需 retrieval、事件 gate 与 background / maintenance，支持获准 reuse / progress hints | 并发不可重复花额度；retry / child / judge / background 全量计入；恢复 / save restore 不重置；普通低信息 turn 无固定额外生成，必要 guard 保留；续接、重置、compaction / summary、probe、reuse lookup / validation / classifier、cache 开销、获准 prewarm 与 fallback 同额度，unknown 不为零；no-call 不伪造 send |
| G06 — 双入口产品闭环与计算收益 | G02–G05 | 可检查创作意图、selected target、unknown upstream、升级原因与费用；why reuse / miss、cache observation / estimated savings；有限模型 / 路径 ablation、旧 Route / binding 迁移与撤回；显示 continuation 决定 / loss，完成合法的 none / active_execution / task / adaptive 与 recompute / reuse / invocation 对照 | RP / Project 实际消费 exact request，普通 / 难例 / 高影响 / 长 session 分层质量—成本 / 延迟对照；cold / warm / hit / miss 的 TTFT / E2E 分布、valid hit / false reuse 与 saved work 有来源；费用缺失不冒充达标，真实浏览器只验所改状态；Planner 工具收益、Narrator fresh generation / 重复 / 标签锚定 / 机械化分开评价，raw CoT 不作为输入 |

本组以用户可使用的生成 / 路由 / 预算工作流为完整交付单位；开始前细化有限支持矩阵、实测目标、schema / 迁移与集成 checkpoint。不默认要求接入所有品牌或学习型路由。Native adapter 顺序是本组验证路线，具体模型版本 / transport / gateway 路径进入前冻结；缺实际协议 / 有限预算的项目明确未测 / unavailable，不计作实现。G06 在已验证固定策略上评价 adaptive lifecycle；跨模型 learned routing 仍不由此获授权。
G 阶段按依赖与验收推进；本组实现分支与完整交付后的集成安排在进入 M8 时明确，不能沿用 M1 分支假称已开始。

### 8.1 Execution Reuse实施顺序与既有阶段映射

| 逻辑顺序 | 现有阶段 / 范围 | 消费者与退出证据 |
| --- | --- | --- |
| A — Reuse semantics | G01 | 既有 request / artifact consumer 校验 identity、scope、dependency、validity、purity、provenance 与 ReuseDecision；无证明不能复用 |
| B — Cache-aware context | G02；原生协议 / telemetry 在 G04 验证 | RP / Project 实际消费稳定 Segment、canonical serializer、受控 layout；Provider cache capability 在精确路径成立，不用渲染相同证明 hit |
| C — Tool / Artifact reuse | G03 先完成 C；observations 由 G04 关联 | 原 Tool / Artifact grant consumer 证明依赖级命中 / 失效、time / permission / Authority、branch isolation 与 side-effect receipt；关闭复用仍有原执行路径 |
| D — Plan / Workflow reuse | G03 在 C 之后 | 结构化模板、当前参数重绑定、preconditions / tools / 权限重验；RP 前置 Narrative Intent 可复用，Narrator 正文仍 fresh |
| E — Adaptive invocation | G05；G06 验收，S25 / S26 后续深化 | 规则阶梯实际选择必要工作、retrieval 与 target / effort；共享预算 / hints、false reuse 与质量—成本对照成立才深化策略 |
| F — Local inference optimization | 后续研究池，具备 backend / 预算后另定有限 PoC | 成熟 backend 的 Prefix / Segment / 非 prefix KV、workflow retention / prefetch / offload / compression、decode acceleration；验证兼容 / 质量 / Trust Domain 后才接入 |

A → B → C → D → E → F 是能力依赖与建议演进顺序，不是六个新增正式阶段。B 的上层结构先交付，其具体 Provider cache 支持在 G04 延续验证；C / D 的应用产物复用不依赖 Local KV。G04 是普通 local target / 可观测能力接入，不能算 F 或把所有品牌 / 算法列为 M8 必做。
进入 M8 前冻结有限对象 / 工具 / 模板 allowlist、支持路径、物理 schema / migration、实际 consumer 与退出阈值；当前只采纳架构顺序，未授权 prewarm、付费 probe、connection / privacy 改动或 learned routing 发布。

## 9. 后续研究池

- society-scale autonomous NPC：在单 Actor、Goal、cognition 和成本成立后再定义规模、运行频率与玩家控制。
- visual world model：选定可用 observation / action 空间后对接，不替代 World authority。
- latent / KV / hidden-state communication：只有模型后端暴露且允许这些表示时才开展 PoC；近期不承诺通用闭源 API 可用。
- Local inference reuse / decode：对接成熟 serving backend，Prefix / Segment / non-prefix KV、workflow-aware eviction / progress hints、speculative / multi-head decoding 与安全重算分别证明能力；不自建 GPU engine，不默认开放 cross-user / cross-package KV。

这些方向没有被静默删除，但当前证据不足以冻结为必做产品阶段。

## 10. 每阶段的完整结束条件

阶段必须同时交付：实际消费者、针对性验证、兼容 / 删除 / 失效 / 撤回、当前用户可检查的结果，以及实际运行证据。
只检查受影响模块；已通过且没有新变化的检查不重复运行。

通用执行与交付流程见 [Governance §8](../../../README.md#8-task-lifecycle)。
按用户明确确认，M1 全部阶段完成后集成 / 验证 main 并清理该组产品分支，再从最新 main 推进下一组；这是本任务对治理默认最终统一集成的明确安排。
同一长期 Task ID / Record 持续，live HANDOFF 在任务活跃期间保持，不能因 M1 集成而把远期阶段标为完成。

## 11. 最小阶段阅读集合

| 阶段 | 必读 | 按需 |
| --- | --- | --- |
| D0 / D1 | index、decisions、delivery；首批收敛时读 m1-evolution | baseline；research 对应资料组 |
| S01 | index、decisions、s01-baseline、Record | 仅对应代码 / test helpers；baseline / m1-evolution 的有关段落 |
| S01–S06 | index、decisions、m1-evolution、architecture §2–4、baseline §1–3 / §7、当前阶段详细设计 | research §1 的评价 / memory 应用 |
| S07–S10 | index、m1-evolution、architecture §4、baseline §5、当前阶段详细设计 | research 的 GEPA / ACE / MUSE |
| S11–S14 | index、architecture §5、baseline §2–4、当前阶段详细设计 | Goal 官方资料 |
| S15–S21 | index、architecture §6–7、behavior-context §2、compute-policy §2、baseline §4、当前阶段详细设计 | 对应 ToM / relationship / memory / RP eval 资料 |
| S22–S26 | index、architecture §8、compute-policy、model-routing §3–4、baseline §1 / §3、当前阶段详细设计 | World Model / dual-process 资料 |
| G01–G04 | index、decisions、execution-reuse、behavior-context、model-routing（含 §7 / §8）、baseline §9、当前阶段详细设计 | research §5 / §6；两份研究对应 validity / adapter / probe 章节；仅对应 provider / gateway 资料 |
| G05–G06 | index、compute-policy、execution-reuse §7、model-routing、当前阶段详细设计 | behavior-context / execution-reuse 对应消费者；research §5 / §6 |
| S27–S34 | index、architecture §9、当前阶段详细设计 | 仅对应 provider / protocol / training 的官方资料 |

当前阶段详细设计在进入交付组之前补齐；远期模块未冻结时不虚构“实施指南已经完整”。

## 12. 原研究覆盖映射

| 原研究主题 / 章节 | 本路线归属 |
| --- | --- |
| 基线、能力缺口、边界、重复建设（§2–3、§14–16） | baseline、architecture；所有阶段的约束 |
| Experience / Evolution / Eval（§4–5、§29、§33） | S01–S10、S33–S34 |
| Persistent Goal / prospective memory（§6） | S11–S14 |
| Cognitive / BDI / ToM / identity（§7、§17、§21–23） | S15–S21；Goal 的主体边界 |
| Counterfactual / World Model（§8、§31） | S22–S24；visual 后续研究池 |
| Metacognition / fast–slow（§9、§27） | S25–S26 |
| Typed Blackboard / Artifact Bus / representations（§10、§30、§35） | S02 起逐步消费；S30–S34；latent 后续研究池 |
| Knowledge / Memory cognition / relationship（§24–26） | S16、S18–S21；双场景 evaluation |
| Expression / multimodal（§28） | S27–S29 |
| Interop（§32） | S30–S32 |
| 长期架构与原则（§1、§11–13、§18–20、§34、§36–37） | index、architecture、decisions 和交付组图 |

资料索引 §19 为 research 的来源输入；不作为另一个需要独立实现的功能。

## 13. 新增研究覆盖映射

| 研究输入 | 详细模块 | 有消费者的阶段 |
| --- | --- | --- |
| Prompt / Context §1–11、16、18–20、22–26、29–33 | behavior-context；compute-policy | S06 / S08–S09 测量与现有候选；G01–G03 / G06 语义、Context、overlay / 压缩 |
| Prompt / Context §12–17、21、28、34–36 | behavior-context、architecture | S15–S21 身份 / 动态认知；S27–S29 表达；S34 learned backend / 研究池 |
| Sparse AI §1–18、21–26 | compute-policy；model-routing | S03–S06 捕获 / 批处理 / ablation；G03–G06 pre-route / 准入；S18–S19 共享 pass、S24–S26 有界预测 / 自适应 |
| Sparse AI §19–20、27–31 | compute-policy、research | G04 local target / 未可用状态；G06 真实对照、S26 学习型策略；数字 SLO 待测 |
| Model / Provider §1–16、18–22、26–30、33、37–39、41–43 | model-routing | G01 / G03–G05 对象 / evidence / policy / snapshot / observations / 全链路可知边界 |
| Model / Provider §17、23–25、31–32、35–36、40、44–47 | model-routing、compute-policy | G04 gateway / local / affinity、G06 UI / task-class eval、S26 联合分配 |
| Model / Provider §34 shadow、Prompt §21 vector / LoRA、Sparse §21 learned router | 各模块实验边界；后续研究池 | 非默认 M1 / M8 自动权限；满足 backend / 数据许可 / 预算后再立有限实验 |
| Reasoning Continuity §10–22、28–33 | model-routing §7 唯一管理；architecture / behavior-context / compute-policy 引用 | G01 契约、G02 envelope / binding、G03 生命周期 / loss；不提前扩张 M1 |
| Reasoning Continuity §23–27、34–36 | model-routing §7、delivery §8 | G04 按 native reference → Anthropic → Gemini → gateway 顺序验证，G05 同预算，G06 adaptive / 双入口对照；provider 资料只作输入 |
| Execution Reuse §12–20、37–44、57–66、86–92 | execution-reuse；Reasoning Continuity 仅引用 model-routing §7 | G01 契约；G03 Tool / Artifact proof、dependency invalidation、Plan / Workflow / Narrative Intent；G06 false reuse / fresh prose 对照 |
| Execution Reuse §7–10、21–24、56、68–71 | behavior-context §3–4、model-routing §8 | G02 Segment / Resource identity、canonical compiler / layout；G04 exact-path cache capability / controls / telemetry；不冻结研究示例字段 |
| Execution Reuse §45–47、50–55、72–81、85 | compute-policy §1.1 / §3–5、model-routing §8、delivery §8.1 | G03 locality / cost evidence；G05 规则 invocation / retrieval / budget，G06 hit / miss / TTFT / E2E / savings 对照；S26 后续策略 |
| Execution Reuse §25–36、48–49、84–87 | execution-reuse §6、model-routing §8、后续研究池 | Provider / Local 分层、Trust Domain / HijackKV 与 workflow / progress hints；Local KV / speculative decode 为 F，需另定有限 PoC |

报告中的资料索引与后续读取提示用于来源核对，不重复建立功能阶段。

## 2026-10-07 M1 当前验收路由

用户批准的新工程验收 / 丢失账本保守结转以 [m1-acceptance](m1-acceptance.md) 为唯一详细权威，生产自动发布仍沿S10原门槛。M1工程达标后才按U7集成 / 最小本地验证；本轮仍仅M1，不进入S11 / G。历史pending与S06ineligible记录保留，不能因新方案批准先行宣称结果通过。
