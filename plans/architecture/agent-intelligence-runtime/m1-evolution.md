# M1：双入口成长与局部自动启用设计

> D1 产品边界与架构执行约束已冻结；S01 详细设计见 [s01-baseline.md](s01-baseline.md)。
> S02 最小来源契约与只读 consumer 已完成，详细权威为 [s02-sources.md](s02-sources.md)；S03 可靠 RP 捕获 / 公共持久层已完成，详细权威为 [s03-capture.md](s03-capture.md)；S04 Project task 持久恢复已完成，详细权威为 [s04-project-recovery.md](s04-project-recovery.md)。
> S05 feedback / diagnosis 的分层、scope / 生命周期与 reflection gate 已交付，详细权威为 [s05-feedback.md](s05-feedback.md)。
> S07 完整 Skill versions / candidates / base CAS / run pin 已交付，详细权威为 [s07-skills.md](s07-skills.md)。
> S08 原 Prompt / Preset body candidates / exact binding 已交付，详细权威为 [s08-prompts.md](s08-prompts.md)。
> S09 原Workspace / pristine Project Task参数候选、exact binding / CAS / rollback已交付，详细权威为 [s09-strategies.md](s09-strategies.md)。
> 用户已确认双入口、三类候选、逐 scope 开启局部自动、统一预算和 M1 完成后集成。
> 后续物理 schema / 数值校准按对应阶段细化；逻辑资源表不表示全部 API 已冻结。
> 长期方向读 architecture；代码事实读 baseline；用户确认的唯一权威是 decisions。

## 1. 完整产品闭环

`一次真实运行 → 正式结果与反馈 → 适用诊断 → 候选版本 → 隔离比较 → 晋升或拒绝 → 下一次运行使用 → 监测与撤回`

RP 示例：纠正角色“替玩家作决定”的输出。提炼局部候选，在独立场景检查行动边界与表达质量；启用后同一角色下一次 run 使用新版本，其他角色保持自己的配置。
Project 示例：Agent 在重复 authoring 中多次错误选择修改入口。结合实际 validation / Review / change set 找到原因，在新 Project 副本验证候选减少同类失败；恢复后不重做已提交操作。

D2 的生成基础方向见 behavior-context / compute-policy / model-routing；M1 只补必要测量与准入语义，不等待 G01–G06，不自动扩张到模型 / routing / connection 自改。

首批已确认接 Skill、Prompt、已有可配置编排策略三类目标；每类走同一晋升语义，使用自身权威的版本 / binding。
每阶段的具体实现和验收仍按 delivery 中 S01–S10 逐项完成并停止。

## 2. 首批范围与责任

| 责任 | 首批实现位置 / 依托 | 约束 |
| --- | --- | --- |
| 运行捕获 | RP Runtime / Director bridge；Project service / Generation Host | 两个 adapter；保留各自执行方式 |
| 证据和评价持久化 | Host repository → 现有 StorageEngine | 注册明确资源契约，不用恢复 checkpoint 代替长期存储 |
| 提炼 / 候选 / 比较 job | bounded job intent → 现有 NativeTaskScheduler | 同一 scheduler；`maintenance` / `background`，无无限自主目标 |
| 隔离环境 | 现有 Session / Studio / run preparation 的私有副本 | 工具只作用于副本或模拟；禁止生产 publication |
| 目标版本与生效 | Skill repository；Prompt resources；Preset / Project 配置 authority | Experience 记录关系，不成为另一套有效配置读取器 |
| 审阅与控制 | 现有 Proposal / Review 和运行检查入口 | diff、依据、费用、active version、停用与撤回均可见 |

普通 RP chat、Native Session 和 Native Project 分别建 source adapter。
Native Session 的 branch / revision 不强加给普通 chat；普通 chat 必须有自身 chat identity、message identity、variant / 内容指纹和来源有效性。
安装的 Package 保持精确不可变资源；候选通过作者副本、用户自有 Preset 或已支持的显式 binding 生效。

### 局部模式的产品设置（已确认默认方式）

新建角色 / Project 默认审阅；用户逐 scope 开启局部自动模式。角色配置下更细的会话 / Preset 范围不得自动扩大。
自动范围使用 authenticated owner + 稳定 subject ID + 目标 / 配置指纹，并配置 allowed fields；不能以显示名称或 client 声明的 owner 代替。
所有 scope 共享 owner 级有限 request / token 预算，局部预算不能突破该总额。未设置有限总预算时，自动模型 job 为 budget_blocked；没有通过发布门槛时仍可审阅候选。
自动发布只影响指定 scope 的下一 run；当前 run 继续精确版本。首次校准与数值门槛在 S06 / S10 定稿。
关闭模式阻止新 job 与新发布；取消 pending work；已生效版本可以保留或通过明确操作回到上一版本。

## 3. 数据模型：只实现 M1 的消费者需要的内容

以下是逻辑资源，允许共享 repository / 表。S02 冻结既有来源的 key / anchor 与无持久化的 EvidenceSet / Evaluation v1；EvidenceRecord v1 的 kind / key / 校验 / 迁移与失败处理已由 [s03-capture.md](s03-capture.md) 冻结并交付；原 Project task 的 durable v1 / attempts / receipt / recovery 已由 [s04-project-recovery.md](s04-project-recovery.md) 冻结并交付；S05 feedback / diagnosis ledger 的物理契约由 [s05-feedback.md](s05-feedback.md) 管理；其它新资源仍按各阶段冻结，不提前注册整张表。

| 资源 | 必要内容 | 不承担的职责 |
| --- | --- | --- |
| EvidenceRecord | schema、owner、source domain / anchor、event / request / effect identity、内容 ref / hash、捕获完整性、outcome refs、cost | 不宣布来源 current，不给 mutation 权限 |
| FeedbackRecord | 对应 evidence / variant、显式 preference 或弱观察、来源、维度、scope、撤回关系 | 不把 regenerate / 失败一律解释为用户不喜欢 |
| Lesson / Diagnosis | evidence refs、适用条件、反例、候选方向、版本、失效 / 容量策略 | 不成为 World fact 或强制行为规则 |
| EvalCase / EvalReport | exact fixture 与版本、rubric、case split、trial、baseline / candidate、工具日志、outcome、费用、judge 分歧 | 不把一个模型分数当成完整验收 |
| CandidateRecord | base exact ref、target / allowed paths、candidate exact ref、diff、来源、evaluation refs | 不替代目标 repository 的版本权威 |
| EvolutionPolicy / Job | 精确 scope / target allowlist、policy fingerprint、budget reservation、attempt / state、cancel / freshness | 不扩权、不产生长期 Goal |
| PromotionReceipt | policy / eval / target fingerprints、前后 binding、publish intent、commit / recovery / rollback 结果 | 不逆转已完成的 World / Project 写入 |

可信 owner、生产 anchor、host receipt 和成本来源由 Host 设置。Client / LLM 上报的轨迹是带来源标签的 observation，不能自行声明可信字段。
旧 trace 缺失、provider usage 不可用、原始正文已删或序列化失败，分别标明 missing / unavailable；有缺口时不能宣称证据完整。
证据内容与 metadata-only UI projection 分开读取，展开受 owner、scope、用途与预算限制。

首批不保存模型私有思维链；Secret 与 transport credential 不入库。需要文本诊断时使用模型可公开输出的有限 rationale。

## 4. 状态与触发

推荐 job 状态：

`queued → collecting → proposing → evaluating → eligible → publishing → committed → observing`

显式分支：`rejected / awaiting_review / budget_blocked / stale / failed / cancelled / paused / rolled_back`。
界面区分“生成成功”“评价合格”“binding 已提交”“下一 run 已消费”，不能只显示笼统 success。

采集由确定性 adapter 完成；reflection / consolidation / eval 按证据聚合、事件或显式请求触发，尽量 background / maintenance，不在每条正文后固定增加一轮模型调用。gate / retention 已由 [s05-feedback.md](s05-feedback.md) 冻结，consumer 不增加模型调用；job 调度与预算仍在后续正式阶段接入。

触发来源限于：显式纠正 / preference、允许的技术失败、完成 run 后聚合的观察。弱观察只触发诊断，不单独证明改进方向。
同一 scope / feedback batch / base version 去重与 debounce；评测和发布不会递归触发新的提炼 job。
Job 在 Host 保存 bounded intent，再交给已有 scheduler；恢复时重验 source、policy、base version、budget 和 pending effects。
首批不承担应用关闭期间的系统级定时唤醒。

### Project 恢复的具体要求

持久化 task、plan、proposal、Workspace ref、validation / Review、changeset receipt 和 timeline，并用 authenticated handle / projectId / taskId 定位。
浏览器 transcript 与 Host 操作状态分别恢复。重启后不凭旧前端文本执行 commit，也不凭 `_tasks` Map 是否存在判断操作是否完成。
一次操作提交成功但 task 更新失败时，通过 origin / operation / changeset 证据 reconcile；无法唯一判定就显示 conflict / awaiting_review。
历史未持久化任务不能被“迁移恢复”凭空找回；来源不完整时明确提示重新建立任务。

上述 Project 边界已由 S04 实施：原 Studio Git 正式 commit 保存 exact Workspace / base / validation receipt，task 容量在正式写入前检查；唯一 receipt 可恢复 completed，缺失回 Review 或 conflict，不自动重放。公开 transcript 按完整 round 保存，Host request / send / usage 与 client observation 分开；旧 opaque provider state 不入库，显式 Continue 读取当前 task authority。S05 retention / feedback / diagnosis 生命周期已交付，详见 [s05-feedback.md](s05-feedback.md)。

## 5. 评价与适用性

Cases 分为 development、独立 promotion、后续 regression；提炼只访问获准 development 内容。
评价报告返回聚合指标和必要失败类别；不得通过反复泄露独立答案来把 promotion 集变为训练集。
后续从真实失败创建新 case 时记录来源和 split 变化，旧 report 仍绑定旧 case revision。

Baseline 与 candidate 使用同一输入、route / model / tools / resources / rubric；记录随机性并做 paired trials。
换模型、改变输入结构或同时更改多个目标时，需要新的 evaluation envelope，不能沿用旧合格状态。记录 observable target、alias / gateway 透明度、adapter / overlay 与 usage 缺失；无法证明同一上游条件时不能宣称严格同模型对照，按时段与来源标记、补验证或转审阅。

S06 对现有可配置路径做一次正文、shared cognition、critic / Director 的可用 ablation；不支持则明确 unavailable。费用按全部 root / child / retry / judge / background 汇总，包含 controller 开销；报告质量—成本 / 延迟，不以更长回答奖励更贵路径。完整实验与新资源交付在 G06。

| 维度 | RP | Project |
| --- | --- | --- |
| 确定性底线 | source exposure、Actor / variant 隔离、工具权限、输出 owner、exact version | baseRevision、允许操作、compiler / validation、Review、正式 commit receipt |
| 行为收益 | 不代替玩家决定、设定 / 文风约束、记忆应用与连续性 | 正确工具 / 参数、修复轮数、任务 outcome、authoring 质量 |
| 偏好与不确定性 | blind paired judgment、用户 preference、judge 分歧 | Review 接受 / 拒绝、同等复杂度结果比较 |
| 资源 | 全部模型调用 / retrieval / controller / latency | 生成、检查、repair、Preview / simulation 和 latency |

隔离模型执行与真实 authority outcome 分开测。Fixture 测试可以证明拒绝了错误操作，但不能证明新 Prompt 更适合用户。
自由文本的知识 / 文风检查属于场景评价；权限 / exposure 检查有确定性结果，报告分别标明保证层级。

## 6. 局部自动启用门槛

以下全部成立才 eligible：

1. 精确 authenticated scope、target、allowed fields 和 policy fingerprint 已固定；来源和 base version 仍有效。
2. 候选通过对应 compiler / schema、权限 / guard、source isolation、恢复和版本完整性检查。
3. 独立评价达到该 scope 的改善门槛，重要维度无回归；成本符合策略；judge 分歧或数据不足时转审阅。
4. 费用可核对，预算已预留；旧版本可读取，回滚路径已验证；目标 binding 仍等于评价时的 base binding。
5. 用户未暂停、撤回相关反馈或修改 policy；该 candidate 未被 supersede。

推荐先支持单目标自动发布。Skill / Prompt / 策略各自可自动晋升；同时改变多个目标的组合须有新的组合回归，不能叠加三个独立合格报告。
不可自动改变 capability、工具 allowlist、output authority、必要 guard、connection / Secret、核心源码、全局默认配置或 Package 原版。
RP / Project 的局部改进不会自动扩散到其他角色、会话或项目；跨 scope 晋升另行选择与验证。

### 可讨论的初始上限

- 每 scope 每 24 小时最多一轮自动 job；一轮最多生成两个候选，最多发布一个单目标版本。
- 首个 promotion 集每入口至少包含三个独立场景，每场景至少三次 paired trial；这是最小试运行规模，不是统计可靠性的保证。
- 每轮与每 owner 都必须有有限的 request / token 总预算；包括 baseline、candidate、judge、retry 和提炼开销，不通过新增 scope 逃避总预算。
- 先在 S01 测代表案例的实际开销，再冻结 token 上限和改善 / 回归容忍阈值。预算不足就停止并报告，不偷偷缩小验收集。

上述频率和数量仍是建议；没有把它们当成本对话已批准值。取消 / 未知 usage 的请求按已预留上界记账或暂停自动模式，不能计零成本。reasoning / cached input 的 provider 子项不与 total token 重复相加；estimated user cost 与 settled charge 分开。Gateway 内部重试不可观测时不能承诺真实上游调用硬上限。

## 7. 精确版本与真实读取

Skill（S07已交付，详细契约见 [s07-skills.md](s07-skills.md)）：候选和历史版本由现有 Skill authority 管理；全部实际调用入口读取 accepted version / content hash。安装目录、文件编辑与版本指针必须一起接入，不能只有 Evolution worker 使用新规则。
Prompt（S08已交付，详细契约见 [s08-prompts.md](s08-prompts.md)）：Native 使用现有 immutable resource revision 和 exact Route binding；普通 RP 在原 Workspace Preset settings authority 保存完整 immutable候选、SHA-256 identity，沿原角色 / 会话 binding 与 compiler 固定 run 内容，不要求整个入口迁入 Native generation。
策略（S09已交付，见 [s09-strategies.md](s09-strategies.md)）：原Workspace用户Preset有限整数预算字段，原compiler / scoped binding固定下一run；Project仅原pristine Task creation参数maxRepairRounds，沿原task CAS，不创建Project-wide默认配置。完整base / diff / 单目标、scope / conflict / explicit rollback已落地；正在运行的graph / policy state不热改。

发布后首先在下一 run 的 exact input / request snapshot 中验证引用与内容，再评价行为结果。
当前 run 继续使用已接受版本；任何 latest 更新、名字相同或 UI 显示新版本都不能证明实际生效。

## 8. 发布、恢复与撤回

采用 commit-last、可核对 intent 的顺序：

1. 保存候选的不可变版本、评价和 policy fingerprint。
2. 持久化 publish intent，记录 expected base binding、desired exact binding、上一版本和预算 reservation。
3. 在 target authority 内按现有写排序 / conflict 检查切换 binding；这一步是唯一生效点。
4. 写 PromotionReceipt 并开始观察；下一 run 消费 exact version 后记录 activation evidence。

崩溃在第 3 / 4 步之间：重启读取真实 binding；等于 desired 则补回执，仍是 base 则重验后继续，已变为其他版本则 conflict，不覆盖用户修改。
FS 跨资源无整体 rollback；SQL 有事务也不能覆盖外部 Skill 文件。每个存储模式都测试上述崩溃点，不把 `withTransaction` 当成全局事务。
FS 初期按单 Host writer 的支持边界设计；无法保证冲突检测 / 写排序的部署保持该 scope 审阅模式，并明确显示原因。

自动回滚触发：确定性底线破坏、来源失效、不可恢复的版本问题，或达到冻结的线上回归门槛。
先暂停 scope 自动发布，比较当前 binding 是否仍等于该 candidate；只有匹配才切回已验证的上一 exact version。
用户已经改成其他版本时保留其选择并显示 conflict；上一版本不存在时停用候选并要求选择有效版本，不冒用 latest。
回滚影响后续 run 的配置选择；已经正式提交的 Project / World changeset 通过自身 authority 的撤回能力处理。

## 9. 兼容、删除与存储覆盖

采用 additive schema / 新资源契约；没有历史证据的旧 run 保持可用，不自动伪造迁移数据。
未知 schema / representation 不作为合格证据；旧客户端可继续原运行，但不能声称已采集完整成长闭环。
删除 evidence / feedback 时沿 source refs 失效 lesson、candidate 和 report；阻止尚未提交的晋升，暂停相关自动模式。
已发布版本的来源撤回与内容删除分开记录；保留 / 清除最小 receipt 及撤回选择在数据策略中说明。

新增资源纳入既有 FS / SQLite / MySQL / Postgres key / list / dump / restore / deleteUser、迁移与备份路径；不能只证明一份本地 JSON 能写入。
优先验证 FS 与 SQLite 的持久与恢复；触及公用资源 registry 或跨模式格式时，补相应 targeted contract checks，真实外部 DB 证据按阶段记录。
项目删除、用户删除、read-only mode 与 scope 关闭均有明确处理；S02 展开预算、S03 trace 与 S04 task 的技术容量已有边界，S05 产品保留期限 / 级联删除已定稿并交付；未来 candidate / report / promotion 消费同一 exact dependency，尚未注册未来资源。

## 10. 已冻结范围与后续深化

第一批三类候选均纳入、分阶段发布，以及 M1 完成后集成 main 再推进下一组，已由用户确认。
首批使用仓库可复现 RP / Native authoring fixture 建代表案例，再在已配置的真实模型上验证；用户指定案例可替换对应 case revision。

S01 cases / report / 运行界限见 s01-baseline。产品 scope、版本生效、共享预算、发布 / 恢复 / 回滚流程作为本组执行约束。
S02 source adapter / 既有来源 storage key / error contract 已由 s02-sources 定稿；S03 新 key / 校验 / 迁移已由 s03-capture 定稿；S04 Project task 持久 / 恢复已由 s04-project-recovery 定稿并交付；S05 已定稿并交付 feedback / diagnosis 作用域、retention / 纠正 / 删除 / 导出，[S06](s06-comparison.md) 已交付显式 live bridge / 共享预算、真实六槽基线与六对独立比较；原 authority 检查通过、judge五个有效观察 / 一个无效响应。S06 evaluator checkpoint完成，候选晋升仍拒绝；费用 / 稳定行为收益、人工偏好与晋升 / 回归阈值未合格，后续 S10 必须据真实证据校准并验证，不能因可执行比较而自动批准。
S07已交付原Skillrepository完整快照与真实读取pin，手动candidate/apply不产生Evaluationeligibility；S08已交付原Promptauthority正文候选与Native / ordinary RP精确binding；S09已交付原Workspace参数exact versions / rollback与Project pristine Task repair参数候选 / CAS；下一仅S10负责完整审阅 / provenance / policy / 自动发布闭环。
参数缺失、证据不足、旧版本不可取回或配置冲突时不能自动发布；后续不得用预留接口代替 M1 必需的局部自动能力。
