# 已确认选择、推荐方案与讨论

> 只在有本任务中的用户确认或后续明确批准时更新“已确认”。外部研究、旧草稿的自述不构成产品权限。

## 1. 本对话已确认

| ID | 选择 | 来源 |
| --- | --- | --- |
| U1 | 查看远端指定研究，重新核对最新 main；全面调研 → 双方讨论 → 确定方案 → 正式执行 | 2026-10-06 发起请求 |
| U2 | 长期目标允许充分拆阶段并逐项推进 | 同一请求 |
| U3 | 角色 RP 与 Project Agent 并重 | 本对话产品优先级问题的用户回复 |
| U4 | 首批先完成双入口成长闭环，再进入持久目标与社会认知 | 本对话首批交付排序问题的用户回复 |
| U5 | 首批就包含有预算与回滚约束的局部自动启用 | 本对话自动化边界问题的用户回复 |
| U6 | 首批纳入 Skill、Prompt、编排参数三类改进对象 | 本对话首批候选面问题的用户回复 |
| U7 | M1 完整交付后合并 main，再从最新 main 推进下一组；每个正式阶段仍记录后停止 | 本对话主线集成安排问题的用户回复 |
| U8 | 按角色 / Project 单独开启局部自动模式，并设置统一预算；新建对象默认审阅 | 2026-10-06 对上一轮默认方式推荐回复“按你推荐的来” |
| U9 | 拉取远端，先读现有 Plan，再读三份研究并综合更新正式架构企划 | 2026-10-06 本轮明确请求；授权企划更新，不授权提前实施后续阶段 |
| U10 | 读取 Reasoning Continuity 研究，将已确认架构结论融入当前企划，沿既有正式术语消除重复概念 | 2026-10-06 本轮明确请求；仅授权企划整合 |
| U11 | 读取 Execution Reuse / Cache Locality / Adaptive Invocation 研究，将已确认架构结论整合进当前企划，并参考 Reasoning Continuity 避免重复定义 | 2026-10-06 本轮明确请求；仅授权企划整合与必要 Record / HANDOFF |
| U13 | 先明确原链路的反馈与评价契约，再用各一个 RP、Project 试点验证 | 2026-10-09 用户明确选择契约先行；不把研究全范围或具体字段冒充逐项批准 |

2026-10-07新增U12：用户不愿本人验证，授权agent代劳，并对保守结转旧预算 / 新有限额度 / 自动检查与模型盲评的确认提问回复“统一”（按上下文同意处理）。M1工程验收改按 [m1-acceptance](m1-acceptance.md)；生产human gate、有限scope / guards与默认review保持。具体数值与恢复schema为该方向内的工程冻结，不冒称用户逐字段批准。
2026-10-09 用户最新明确测试 API 硬限制只有每日 2000 次调用 / 20 RPM，要求彻底清理额外测试限制。覆盖 U12 旧预算、后来累计 1000 次、各轮发送/Step 配额、token 停测、逐轮许可与人工额度审计。唯一详细权威为 [Governance §13.1](../../../README.md#131-api-测试执行规则)，M1 当前执行见 [acceptance §0](m1-acceptance.md#0-当前-api-测试规则覆盖全部历史封包)。生产自动权限与真实质量验收不变。


M1 产品范围、自动模式默认方式与分组集成已确认。S01 工程设计本轮冻结；S02–S10 技术契约在进入对应阶段前细化，M2 以后的认知权限仍待设计。

## 2. 交付建议与确认状态

### R1 — 先交付 M1，再持续演进（排序已确认）

先用 S01–S10 完成两种真实使用的 Experience / Eval / Evolution 闭环；基础设施带实际 consumer。
下一交付组再做可自主 continuation 的持续目标，随后做社会认知、预测和表达。
用户已确认先完成双入口成长闭环。S01 的具体 cases / 报告 / 验收由 [s01-baseline.md](s01-baseline.md) 管理；后续契约按阶段深化。

### R2 — 第一批改进对象（已确认）

用户确认第一批目标覆盖 Skill、Prompt、已可配置的编排策略，三条发布路径分阶段实现。
只演化允许的文本 / 配置；不修改 runtime 源码、权限、Secret、核心 authority 或必要 guard。
已安装 Package 的精确资源继续通过作者副本 / 显式 binding 选择生效，不能原位改写。

### R3 — 首批包含局部自动启用（能力范围已确认）

用户选择首批即包含有预算与回滚约束的局部自动启用，因此它是 M1 的必要交付，不能延期为未来预留。
推荐自动收集必要证据、生成诊断 / 候选、在预算内评测；指定局部范围内通过门槛的版本可自动启用，其他变更沿用审阅。
局部模式必须明确主体、目标 allowlist、独立案例、预算、变更上限、自动停用与撤回。
自动提炼、自动评测、自动发布不是同一个权限。
默认逐 scope 开启、共用 owner 预算已确认；有限 reservation、变更上限、停用 / 撤回是首批设计约束。具体数值在相应阶段用测量数据定稿，不能在未定稿时自动发布。
首批设计由 [m1-evolution.md](m1-evolution.md) 管理。

### R4 — 默认局部适用范围

- Project：authenticated owner + project identity + Agent 配置。
- RP：authenticated owner + Actor / entryPoint + chat / Session 身份；按入口绑定 Package 与 Director / Preset。
- 单条证据使用源域的 exact anchor；Native 包含 session / branch / revision，普通 chat 固定消息 / variant / 内容指纹。trait、emotion、ToM 和用户偏好分域。
- 跨角色、跨项目或全局规则晋升需要新的验证与明确选择，不能自然扩散。

### R5 — 两种认知控制权

用户 / Project Goal 是执行契约；Actor Goal 是角色愿望。关联而不合并权限。
作者固定稳定设定；运行时在已允许范围采纳有证据的动态 cognition。错误 belief 合法，World Truth 仍由现有 authority 决定。
认知状态的可见范围和 user takeover 在 M3 冻结前明确。

### R6 — 交付组完成后集成（已确认）

34 个阶段是长期演进地图，不默认冻结成一次无限任务。
用户确认先以 M1 作为首个有限交付单元；每个正式阶段结束更新同一 Record / HANDOFF 并停止。
本组全部阶段完成和验证后合并 main、验证集成结果、清理本组产品分支，再从新的实际 main 推进下一交付组。
这是用户明确选择的分组集成安排，覆盖治理默认的全任务最终统一集成；不修改 Governance。
长期 Task ID 与同一 Record 保持，live HANDOFF 在长期任务仍活跃时持续更新。M1 集成不表示 34 阶段全部完成。

## 3. 阶段冻结与待深化事项

| 议题 | 推荐起点 | 取舍 |
| --- | --- | --- |
| 第一批产品价值 | 已确认先完成 M1 双入口闭环 | S01 具体设计已冻结；其余阶段按范围推进 |
| 第一批候选面 | 已确认 Skill / Prompt / 现有编排参数全部纳入，分阶段接入 | 三条路径分别有版本、评价、生效与撤回验收 |
| 自动化程度 | 已确认首批局部自动；逐角色 / Project 开启，共用 owner 预算 | source / budget / binding 门槛全部满足；具体校准在相应阶段定稿 |
| 首批案例 | S01 固定六个案例族、12 个 development / promotion cases | scripted / model 分开；真实模型缺失不计通过，晋升前必须补齐 |
| 生命周期 | 已确认 M1 完整交付后集成，再从最新 main 推进下一组 | 长期 Task ID / Record 保持；每阶段仍遵守正式停止条件 |
| 已有 Experience 草稿 | 继续保护；复用其适合的内容，本 Bundle 是本任务入口 | 不改写未提交文件；不维护第二套本任务 Record / live HANDOFF |

不要求本次讨论一次冻结 S15–S34 的所有 schema、心理学模型或服务选择。
先决定首个闭环；阶段到来时核对最新代码和外部能力，局部深化相应模块。

## 4. 批准记录

**D1 完成：M1 产品边界 / 架构执行约束已冻结，S01 Ready。**
用户确认记录为 U1–U8；case / report 字段与有限 pilot 规则是 Agent 在已授权范围内作出的工程选择，不伪装成用户逐字段确认。
下一正式阶段仅执行 s01-baseline；S02–S10 的物理资源契约、迁移、保留期限和晋升阈值按实测逐阶段细化，不自动将整个 34 阶段 Bundle 标为 Approved。
原有未提交草稿提到的历史选择不自动移入本节。

## 5. D2 — 本轮综合更新的架构约束

下列为 U9 授权范围内的工程设计更新，区别于 U1–U8 的直接用户产品选择；不声称用户逐字段批准。

| ID | 纳入正式企划的约束 | 详细权威 |
| --- | --- | --- |
| A1 | Behavior / Creative、Context、Generation、Tool / Output 与 model lowering 分层；Prompt 只控制获准模型行为 | behavior-context |
| A2 | Identity / Cognition / Character Expression / Narration / Scene 分开；确定性编译与候选优化分开 | behavior-context |
| A3 | sparse 默认、ordinary RP 以一次主要 generation 为目标；新 AI 调用有事件 / 依赖与预算，维护离开正文等待链 | compute-policy |
| A4 | 共享获准事件 cognition pass、有限 specialist；所有子调用 / 重试 / 后台 / controller 都计入成本，unknown 不为零 | compute-policy |
| A5 | Connection / Callable Target / Model Identity 分域；Capability / Economics / Health 是有来源与有效性的 evidence | model-routing |
| A6 | 持久 RoutingPolicy + 请求时解析 + exact snapshot；质量选择和 FailurePolicy 分开，恢复保留硬约束 | model-routing |
| A7 | New API / Sub2API / OpenRouter / LiteLLM / opaque / local 是正式场景；只记录可观察路径，不猜上游、收费或重试次数 | model-routing |
| A8 | 新增 M8 的 G01–G06，M1 不依赖它；M3 前交付共享基础，S26 专注数据驱动自适应；保留原 S01–S34 身份 | delivery |
| A9 | 保留数据 / exact binding / Package 兼容，显式迁移；ST 历史 UI / preset 结构不约束新设计 | behavior-context、model-routing |

D2 保留 M1 三类候选、局部自动默认、预算与 M1 后集成选择；S01 仍 Ready，未实施。
未冻结：40 阶段整套实现 API、档位名称、数字 SLO、价格表、provider 能力矩阵、自动路由晋升 / shadow 数据发送权限、local model 安装或 learned router。
M8 的详细设计与独立集成点在进入该交付组前定稿，逐阶段停止规则持续有效。

## 6. D3 — Reasoning Continuity 纳入既有架构

U10 确认将研究的架构结论纳入正式企划；以下为该范围内的工程归并，不把示例字段、厂商支持表或产品默认逐项写成用户批准。详细规则统一由 [model-routing §7](model-routing.md#7-reasoning-continuity执行状态与生命周期) 管理。

| ID | 已纳入的架构边界 | 详细权威 |
| --- | --- | --- |
| A10 | Reasoning Continuity 是现有 Runtime 可选执行能力；adapter 原样承载 opaque state，canonical message / public evidence 分离，不依赖 raw CoT | model-routing §7.1–2 / §7.4 |
| A11 | 用既有 Capability Evidence 判断 exact execution path 与方向性兼容；native-first、gateway-verified，unknown 不能满足连续性硬要求 | model-routing §7.2 |
| A12 | Task / branch / revision / variant lineage 管理 continue / fork / reset / discard；edit / restore / regenerate / goal shift / fallback 都有重验与 loss 证据 | model-routing §7.3–4 |
| A13 | opaque checkpoint 与 Memory / Cognition / Task Artifact / Domain State 生命周期分开；持久成果走显式 artifact 原授权，默认不导出私有状态 | model-routing §7.4；architecture §3 |
| A14 | Planner 目标连续、Narrator 短 horizon、Critic 独立 lineage；Context binding 与 compaction 不绕过 freshness / exposure | model-routing §7.3 / §7.5；behavior-context §2–3 |
| A15 | Runtime contracts → OpenAI Responses → Anthropic native → Gemini native → gateway probes → adaptive / eval 映射既有 G01–G06，不新增正式阶段 | delivery §8 |

D3 仅完成文档整合；M1 范围、三类候选、局部自动默认、预算和集成方式保持。S03 相关未提交实现 / 草稿不在本轮审阅或验收，不能把它们算作完成阶段。
未冻结：具体 API / schema / 资源 key、TTL / 容量、支持模型版本与路径矩阵、默认跨 turn 启用、adaptive 阈值、实际质量—成本收益与运行 checkpoint 导出。M8 进入前局部深化；本次不授权付费请求、probe、隐私 / connection 改动或自动路由晋升。

## 7. D4 — Execution Reuse / Cache Locality / Adaptive Invocation

U11 授权将新研究的架构结论纳入正式企划；下列是该范围内的工程归并，不把示例字段、论文数字、Provider 能力或产品默认逐项标为用户批准。

| ID | 已纳入的架构边界 | 详细权威 |
| --- | --- | --- |
| A16 | Execution Reuse 是既有 Runtime 一级能力，与 cache storage 分离；Reuse Contract 对齐原 artifact / source / authority / provenance，不建立平行任务或依赖系统 | execution-reuse §1–2 |
| A17 | Exact / Structural / Semantic 找候选与 validity proof 分开；相似度 / hash 不代替当前依赖、版本、时间、权限、Authority 与必要路径证明 | execution-reuse §2 |
| A18 | 依赖级 targeted invalidation；branch / restore / edit / variant 隔离，缺可核验细粒度依赖时保守绑定精确源 anchor | execution-reuse §3 |
| A19 | Tool Value 感知 purity / side effects / time / permission；mutation 幂等仍核对原 effect identity / receipt，once / operation grant 不变为 reusable context | execution-reuse §4 |
| A20 | Context Segment / Tool / Skill 使用稳定身份 / version / dependency / volatility，canonical compiler 在语义与权限允许的范围组织稳定 prefix；不加无关 padding 或保留 stale state | behavior-context §3.1 / §4 |
| A21 | Plan / Workflow 优先复用结构化模板并重绑定参数、重验 preconditions；RP 前置 facts / intent 可复用，Final Prose 默认 fresh generation | execution-reuse §5 |
| A22 | Application / Provider Prompt Cache / Inference Backend 能力分层；精确路径 evidence 和 locality 参与既有 Routing 可行项成本，不能覆盖 hard constraints | model-routing §8.1–2 |
| A23 | Adaptive Invocation 依既有 ComputePolicy 选择必要工作 / retrieval / target / effort；规则基线先行，查找 / 校验 / classifier / cache / prewarm 开销沿原预算 | compute-policy §1.1 / §3–4 |
| A24 | ReuseDecision / requested cache 固定在 task / Snapshot，实际 hit / usage 留在 Observation；valid hit / false reuse / saved work 与 cold / warm TTFT / E2E 有来源，unknown 不为零 | execution-reuse §7；model-routing §8.3；compute-policy §5 |
| A25 | Local KV / decode 走成熟 backend capability；Trust Domain 优先，默认禁止不受控 cross-user / cross-package position-independent KV。Reasoning Continuity 只引用 §7；A–F 映射 G 阶段与后续研究池 | execution-reuse §1 / §6；model-routing §7–8；delivery §8.1 |

D4 仅完成文档整合，D3 §7 详细规则保持原样；M1 范围、三类候选、局部自动默认、预算与完整 M1 后集成保持。S01–S03 状态不变，下一产品阶段仍 S04，不因新研究提前实施 G 阶段。
未冻结：物理 API / Schema / key、容量 / TTL、细粒度依赖覆盖、工具 / 模板 / 模型支持矩阵、semantic 阈值、prewarm 默认、数字 SLO、真实收益和 Local backend / 算法选择。进入对应阶段前明确有限 consumer、兼容 / 迁移 / 删除 / 撤回及实际验证。本轮不授权付费请求、probe、prewarm、connection / privacy 改动、GPU engine 或 learned routing 自动发布。

## 8. M1 反馈与评价契约先行（U13）

U13批准先后顺序。原链路补充设计唯一归属 [m1-feedback-evaluation](m1-feedback-evaluation.md)；F0本轮完成，后续F1原消费者实现、F2来源/有限范围固定、F3一次双域试点各包结束停止。这些是当前M1工作包，不增加S/G正式阶段或新authority。

已纳入的工程边界：自动质量分析独立于user explicit、client observation与Host正式outcome；根因与intervention分开，非局部writer问题转工程；versioned quality/profile/case lineage接原固定evaluator，原开发/独立验收与发布门槛保持；每域一个pilot/单target/一次候选周期。新逻辑字段/兼容策略不是已实施schema，具体validator和请求identity在相应工作包、模型发送前固定。

现有761/2939582与失败窗口保持，不恢复旧6/24许可、不重跑合成v1追分，不伪造human。未授权扩大writer、自动改rubric/连接/模型路由、长期状态或跨任务知识库；本轮无付费调用。M1未达标，不合并main、不进入S11/G。
