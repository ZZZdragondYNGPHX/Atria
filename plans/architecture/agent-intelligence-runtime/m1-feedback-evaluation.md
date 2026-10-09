# M1：原链路反馈与评价契约补充

- Updated：2026-10-09；Task ID：`agent-intelligence-runtime`。
- 状态：**方向、设计边界及F1物理契约冻结；F1最小消费者已实现，验收记录见同一Record；F2准备核对以source_unready停止，独立来源/实际语义校准尚未完成；F3未开始，M1仍pending。**
- 用户确认 U13：先明确原链路反馈与评价契约，再用各一个 RP、Project 试点验证。以下分类、兼容方案和工作包是该方向内的工程细化，不声称用户逐字段确认。
- 来源：[领域扩展研究](../agent-intelligence-m1-domain-evolution-research.md)、[S05](s05-feedback.md)、[S10](s10-evolution.md)、[M1 acceptance](m1-acceptance.md)。核对产品 `a61b249ef71f108d279ec7bd883fb5eeae97a463`；这些设计不计入已有实证。
- 唯一职责：原 Experience / evaluator 的新反馈来源、根因路由、质量与案例来源的补充契约，以及先契约后双域试点的有限工作顺序。既有资源生命周期由 S05、部署/发布由 S10、M1 工程退出门槛与实际发送范围由 m1-acceptance 管理。

## 1. 范围与原 authority

保留 `正式执行 → 原 Evidence / Project Task → 原 Experience → 原 Evolution → 原 evaluator → 原 targets → 原 binding / receipt → 下一 run / rollback`。新增逻辑字段使用原资源的版本化契约，不建立第二套反馈库、有效配置、World/Actor 状态、case runner、账目或后台调度器。

本次最小设计有四组消费者契约：反馈来源及自动分析；诊断归因及干预路由；领域质量/案例来源/评价 envelope；全部工作与成本归属。其他研究建议不自动纳入 M1。

不增加 M1 writer。Prompt/Skill/已有参数仍仅原支持目标；Context、事实状态、runtime、evaluator 修复走工程任务。角色成长、长期记忆 resolver、开放世界规划与跨任务复用按后续路线处理，不能通过新增诊断分类提前实现。

## 2. 反馈契约：事实、意见、观察、分析分别保存

当前 v1 的 `explicit → user`、`observation → client_observation`、`technical → host` 语义保持。新增自动分析必须使用显式版本化类型，不能继续借 explicit 存放代理分析。

| 种类 / 来源 | 允许的数据与证明范围 | 禁止的解释 |
| --- | --- | --- |
| explicit / user | authenticated 用户自己的 correction/prefer/avoid，exact source、原有限 note | 自动模型分析、代理测试意见、所有用户偏好或角色事实 |
| observation / client_observation | regenerate/edit/abandon/accept/review_reject，及新增的 completed 执行观察 | 完成就是高质量；拒绝一定是差评；客户端 trace 是 Host receipt |
| technical / host | 原 service 从 Task validation/Review/正式 receipt 或 Host Evidence 推导的结果，unknown 保持 | 客户端自填 failed；生成文字承诺就是正式提交 |
| assessment / model_assessment | 模型在获准输出上给出的有限缺陷假设，关联固定质量 profile、片段/事件 refs、公开 rationale、反例和 unknown | 用户意见、已证实根因、正式 outcome、人类偏好或事实更新 |
| assessment / host_check | 固定受审 checker 对 exact source、明确 criterion 给出的可重复质量检查与证明 refs | 对开放文学/情绪/用户感受作无证据确定性裁决；格式/引用合法即语义已证实 |

`assessment` 是拟新增 Feedback 子类型，仍存于原 `atri_agent_experience`；两种 origin 由 Host 的不同内部 producer 设置。通用 submit/correct 不能选择 host、model、verification 或可信身份。模型返回不含可写 provenance，Host 绑定实际模型/配置及 charge；checker 只能从固定注册代码选取，不能执行输入中的脚本。用户自由输入的“AI 判断”仍按用户假设保存，不能自行取得 model_assessment 身份。

自动分析的最小逻辑内容：

- 原 source exact refs、用途（ordinary / development / calibration / promotion）、质量 profile revision、producer/checker revision；Host UUID、时间和 owner/scope/subject。
- 受损 dimension、`suspected_failure / verified_failure / no_failure / unknown`、有限证据 claims 与对应输出片段/公开工具事件 refs；原因假设不混入判定事实。
- 模型身份/上游可见性、输入/输出 hash、公开 rationale、反例、成本 charge refs；无私有思维链、Secret、整份聊天复制。
- 语义核查状态。`model_assessment` 不能自行产生 verified_failure；只有固定 Host checker 证明其明确 predicate 才能新建 host_check 的 verified_failure，且引用原分析而不覆盖原结果。一般自由文本语义仍是 suspected/unknown。

每条分析最多四项 claim，引用与 note 使用有限容量；仍受原 256 feedback / 64 diagnoses / 512 KiB、默认 30 天期限和 source 删除规则约束。超量拒绝，不靠新库或淘汰仍有效来源续跑。具体字节/片段表示与 JSON validator 在实现工作包固定，并完成同一资源兼容检查。

原粗粒度 dimension 语义保留；新领域细分使用受审 QualityProfile 中的 dimension ref，校验 domain/profile/revision及对应证据，不能接收任意字符串扩充分类。ordinary/development 的获准分析可进入 Experience；calibration/promotion 分析只留原 evaluator report，不进入可供提炼的反馈批次。用途由 Host 的真实运行/实验上下文设置，客户端不能自报“开发”。评测、发布/消费检查产生的事件不递归唤醒新提炼；未能证明用途隔离时拒绝自动采集。

### 正常执行的零模型反馈供给

Project 在原 Task 状态/validation/Review/receipt 持久化之后，Host 调用原 outcome consumer；按 exact source hash 去重。不可把正常 conflict、取消或 Review 拒绝一概标 failed，需保存正式状态及拒绝原因；无法映射的结果继续 unknown。receipt 成立、用户目标完成与质量评价是三件事。

普通 RP 在原捕获与 exact saved output 绑定之后记录 completed 观察。原 capture 仍为 client_observation 时不能走 Host technical outcome，不能因保存到服务器就升级其来源；无 exact output 时记录采集缺口，不制造完成/质量证据。Native 已支持的 Host receipt 保持自身路径，不扩张本次 ordinary RP 部署范围。

反馈采集不新增模型调用，不阻塞主要正文/Task 正式效果。写入失败显示可检查的采集缺口；后续原 inspect/reconcile 或获准事件按 exact source 有界补收，不重放业务操作、不无限 retry/poll。每批最多 32 个已知 refs，不全量扫描聊天。过期/撤回/删除来源不得被重复完成事件复活；实现必须在原生命周期内证明去重与处理水位，做不到则明确 collection_unavailable，不先引入旁路 journal。

完成/成功记录用于覆盖与抽样，不单独触发每轮 reflection。旧 explicit、technical failure 和三个不同弱事件的触发条件保持；用户显式发起的有限分析可检查指定 development 来源，不自动开启所有历史数据扫描。

### 分析如何进入诊断

单个模型怀疑不能建立确定方向。三个独立 exact source 的同类 model_assessment 可形成待诊断批次，仍只能得到 undetermined；不能把同一次输出的三个 claim 算三个来源。

current、校准有效的 host_check verified_failure 可支持局部干预假设，其证明范围仅 checker 的具体 predicate；原显式反馈/technical failure 同样只支持假设，不证明根因唯一。新增路径使用 versioned reflection/gate，不能扩大现有弱观察权限。模型分析的格式正确、证据片段存在或两个评委同意均不足以取得该资格。

若 RP 的自由文本缺陷没有可用 Host proof 或真实显式反馈，保持 direction undetermined。试点可在用户委托的私有 engineering review 实验中提出一次候选假设，但必须标记 test-only investigation、缺口和来源；此入口仍调用原提炼/targets/evaluator，不改生产触发条件、不伪装 explicit，也不取得 automatic eligibility。没有受审实验支持前应 source_unready，不继续旧 fixture 代理纠正。

## 3. 诊断契约：根因与可写目标分离

原 `direction=skill/prompt/orchestration/undetermined` 继续表示允许的候选类型。新诊断增加有限 `suspectedLocus`、支持状态、证据 refs、反例和 proposedIntervention；不要把 direction 改成另一种权限枚举。

| suspectedLocus | 可核查区别 | proposedIntervention |
| --- | --- | --- |
| prompt | 当前可见信息充分，合法工具可用，候选规则违反或欠明确 | 原 local target；仍由 declaration/allowed fields/base 控制 |
| context | 正式 source 正确，snapshot 遗漏、过期或错误曝光 | 原 compiler/retrieval 工程修复；本轮没有 state writer |
| state | 原保存对象本身错误、更新/branch/事件关系不正确 | 原状态 authority 工程修复，不能通过 Prompt 解释掉错误 |
| runtime | 正确输入/提案未执行、重复、丢失，未消费版本或恢复错误 | 原确定性执行与恢复修复 |
| evaluator | 判定对反例不敏感、来源/任务不可完成、维度歧义或饱和 | 新受审 case/rubric/evaluator revision，旧分数不改 |
| model / unknown | 信息与执行可用，但局部原因不明确或能力不足 | 保持 unknown/unsupported；后续能力路线，不自动换模型 |

支持状态区分 unverified、reproduced、rule_verified；reproduced 不等于唯一因果。允许多个 locus，不用自填数值 confidence 伪装概率。Engineering/none 路由不得伪造可用 direction；weak-only diagnosis 仍 undetermined。

原 Evolution 必须消费这些路由，不能仅存字段：非 local intervention 不提炼候选；根因未知且无获准调查 envelope 则拒绝；源码/状态/评委问题在本轮报告待修工程项，候选收益也不能归功于未执行修复。对应 diagnosis 或源变更继续沿原依赖暂停/失效。

## 4. 评价契约：QualityProfile、case 来源与 report

领域模块只能提供受审的固定 profile、数据/adapter 和证据解释，不能生成发布 gate、写 authority 或动态载入代码。RP 与 Project 共用原 evaluator/worker/compiler/resolver/provider；质量定义由工程控制，非 evolution target。

| 契约 | 最小逻辑要求 | 消费/拒绝语义 |
| --- | --- | --- |
| QualityProfile | domain、profile/dimension/rubric revision、单位/时间尺度、必需维度、证据类型、条件与 unknown/N/A | 原重要维度保留；缺证据拒绝，不事后删除不利维度 |
| Case provenance | 原 episode/task/project ref、source/fixture/input hashes、origin、派生组、split/用途、baseline headroom、保留边界 | source/派生组跨 split 重叠拒绝；无真人来源明确 agent-authored/synthetic |
| Evaluation envelope | source/head/base/target、profile/case/adapter/evaluator、route/model/tools/配置、judge/calibration pins、公平条件、有限范围 | 变化即新 revision/资格；不可复用旧合格报告 |
| Report | 逐 trial 正文/公开轨迹、正式结果、checks、维度证据与 unknown、双模型原判断、全部 charges、缺口 | execution/quality/preference/publication/consumption 分开；偏好不能抵消负 delta |

评分使用原 pair 和重要维度非负要求；新增维度必须纳入 case 行为集合并由两个评委实际评价，不只是附录文字。N/A 在执行前按输入条件固定；必需维度不能 N/A，未观察的长期维度不填零。质量向量与原 preference 均保留，不用文学均分补偿玩家代写/知识边界/正式操作缺陷。

schema/checker controls 先本地验证；实际 judge 必须对预先标注的正确/错误/unknown、反事实变化和顺序反转有合理响应。构造标签标为 engineering_control，不写 human 字段；控制通过只能支持该 rubric 的可判别性，不证明人类审美校准。judge alias 上游未知如实报告，两个 identifier 不等于独立厂商。

提炼只能看 development feedback/diagnosis与声明 base；promotion 数据由原固定 worker 专用读取。按 episode/Project/任务模板的来源和派生关系分组，不能只换姓名/字段名。开发代理不能用共同检索/cache读取独立答案；一旦 promotion 被用于诊断，下一轮转 development/回归，需新独立来源。旧 v1/v2 只留历史，不重跑追分。

新 profile/case 支持须扩展原固定 catalogue/validator、adapter 和 report gate；不新增可上传任意 case JSON 自动取得资格的通道。构造数据可入受审测试 fixture，真实材料和原 raw 报告留私有 storage。只读分析/回归缓存可复用历史，不能当新独立 trial/grade。

## 5. 版本、迁移与生命周期

Feedback/Diagnosis 新类型建议在同一 Experience 资源内用 v2；原 v1 读取及字段语义保持，未知版本拒绝。更新过的 service/repository/Evolution/HTTP/export/panel 必须共同理解 v2，不能只放开一个 validator。

v1 仅在明确 writable mutation 时以原 CAS 转换，read-only inspect/export 不写；旧项保留 id、revision、origin、source、期限和顺序。旧 direction 不推断根因，迁移为 unknown/未归因；旧记录 origin 不被“洗成”新的真实 provenance。迁移会改变依赖 hash，旧 pending job/report 必须先暂停/失效，不重发、不自动继承新资格；历史 receipts 与累计费用保留。

已知旧fixture代理生成的explicit与旧模型判断只作为注明性质的历史证据，不能因其v1 origin写作user就参与新的真人校准；不改旧账目/分数，也不伪造迁移后的人工身份。无法核实的历史来源标不可用于新用途，而非推断为真实偏好。

新字段不能放在 strict v1 的 extra/note 中绕校验。旧客户端对 v2 的处理必须明确拒绝不兼容 mutation，不能降级丢字段覆盖；正常业务生成不因 Experience 不支持而失效。实现前固定支持矩阵和 rollback 边界：旧二进制不能直接写 v2，回退时暂停新功能，不能毁掉新来源语义。FS/SQLite reopen、dump/restore/deleteUser、source 删除/纠正/撤回、容量与损坏拒绝均走原 storage contract。

EvalCase/Report 使用原资源内版本/内容 hash，不能静默改 v1；保留旧 catalogue/report 的只读历史识别，旧 gate 不被新 profile 覆盖。实际 physical schema、key/validator 变更与兼容映射由实现工作包在发请求之前锁定；本模块逻辑设计不等于迁移已执行。

## 6. 两个试点：验证原链路，而非全部领域

每域一个试点、一个局部 target、一个候选提炼周期；每试点仍有三个 development 场景及三个独立 promotion 场景，各有不同来源。没有合格来源/headroom 时 source_unready，而不是加大提示强度或降低门槛。

| 试点 | 核心任务 / 失败观察 | 评价与原 target | 范围之外 |
| --- | --- | --- | --- |
| RP：信息边界内的叙事回应 | 已发生/已修订信息与未知当前事实分开；NPC 有角色声音与可推进回应，玩家行动仍由玩家决定 | 原 character Skill body；保留 agency、promise_application、knowledge_boundary、continuity 和原 variant/owner/exposure checks；增加局部角色声音与有效叙事回应维度，防止变成僵硬免责声明 | 跨 episode 成长、生产 memory resolver、全题材文学与长期用户偏好 |
| Project：关联修改与可核查完成 | 用户要求涉及多个相关 artifact/约束；必须取得必要来源、保留无关数据，合法处理 validation/Review/conflict并准确说明状态 | 原 user Preset system.style body；保留 intent_completion/conflict_handling/repair_quality 和原 authority checks；增加关联目标完成、无关内容保留与状态说明证据 | 自动修改产品源码、部署、安全认证、全局知识库或 Project writer 扩权 |

RP development 的三个任务类型：局部 NPC 回应/玩家未决选择；已明确修订的承诺与当前时间未知；同一角色可见/不可见信息及当前 variant 冲突。各取独立 episode/场景语义，不把旧门口场景换名字当新来源。文学维度只测这一场景/短公开窗口，关键知识与行动边界和文风共同测，不声称长程提升。

Project development 的三个任务类型：真正有关联依赖的 authoring；有明确诊断信息的一轮修复；发生版本冲突后的无覆盖与可执行说明。不能只是 rename 加故障计数；先确认原工具/schema支持实际操作、原六 send/round有可完成路径。promotion 用独立 Project/任务派生组，局部 target 在隔离副本中显式映射，记录原 ref 与 fixture ref，不把克隆配置冒充原对象权限。

现有公开报告只能证明旧 RP 时间/玩家行为问题和旧 Project 避读回归；这些用于选题，不证明新增工作负载已经有失败。来源优先现有明确获准的执行 refs；未获准的真人聊天不批量读取。缺材料时由 agent 在隔离副本运行有实际产品用途的工作负载，标 agent-authored/synthetic 和 task purpose；用户无需手测，这也不会生成 human preference。

构造一条已知坏输出只能校准 checker，不算 baseline 实际失败。候选前先确认开发基线有可观察且可改善的缺口；无缺口则该试点饱和/不适用，保留原报告并结束。promotion 来源在候选前锁定，开发只知元数据/用途，不得读其内容来选有利任务。

## 7. 成本、调用范围与失败处理

API 测试按 [Governance §13.1](../../../README.md#131-api-测试执行规则) / [acceptance §0](m1-acceptance.md#0-当前-api-测试规则覆盖全部历史封包) 执行：仅每日 2000 次、20 RPM；发送端统一计数/等待。token、输出长度、旧累计、Step claim 和封包估算不阻止必要测试；结果与 usage 沿现有私有账目保存，生产 gate 保持。

以下只是**一次双域试点的形态估算**，不是调用上限或需要逐轮申请的许可：

| 工作 | 双域最多模型请求的结构估算 | 使用边界 |
| --- | ---: | --- |
| 来源/headroom 探测 | 6 场景 ×6 send =36 | 保存正式输出；不能冒充后续独立 paired baseline |
| 有限缺陷分析 | 6 来源 ×1 =6 | 能用固定 checks 时无需这些调用；不得无限逐轮 critic |
| judge controls | 2域 ×3组 ×2顺序 ×2judge =24 | 正确/错误/unknown，构造素材不另调用生成 |
| 候选与 development | 2提炼 +12 arms ×6 +12 grades =86 | 各一候选/三pair，原双模型 ≥2一致胜/其它tie/非负才准入 |
| 独立 promotion | 36 arms ×6 +36 grades =252 | 达development才各九对/六一致胜等原门槛 |
| 下一 run 消费 | 2域 ×6 =12 | 仅达标后在私有 fixture review；原 rollback 零模型 |
| 合计 | 416，另列实际必要的 retry/诊断 | 无 retry 的形态上界；不是实际必需调用数或承诺费用 |

source/case/input/rubric/calibration/worker/request identity 随实际版本与结果记录。已授权当前阶段内的必要诊断、修复和复测自主进行，不另建 Step 次数许可，不以旧 stop/epoch 记录要求审批；实际配置变化按真实内容标识，不抹除旧结果。

普通校准、输出格式和 source 工程问题先修复再验证，不以首个失败结束交接。真实来源不适用或基线无改善空间时如实记录并判断工作方向，不伪造资格。现金价格未知仍 unavailable，不声称节约或回本。

## 8. 有限工作顺序与每包退出

这是当前 M1 的补充工作包，不新增正式 S/G 阶段，不将全领域研究变成 M1无限退出要求。每包结束按 Governance 保存同一 Record/HANDOFF 并停止。

| 工作包 | 范围 | 最小验证 / 退出 | 本轮状态 |
| --- | --- | --- | --- |
| F0 契约 | 本模块、原权威路由、U13和恢复状态 | 文档一致/链接有效；原账目与草稿不变；不发模型请求 | 设计完成 |
| F1 原链路最小实现 | 原 Experience v2/自动分析来源、零模型采集、诊断路由；固定 quality/case/report consumer与隔离；必要原panel来源/拒绝提示 | targeted source/provenance、去重/CAS/read-only/失效、FS/SQLite兼容及worker/split/critical dims/consumer checks；fake控制仅工程证据 | 最小消费者已实现；物理契约见§9，实际验证见Record |
| F2 来源与有限范围固定 | 两域development/独立来源包、baseline缺口/可完成性、校准素材、exact revisions、原失败窗口处理 | 免费 controls/独立性和可完成路径先检查；必要模型探测、诊断与修复复测沿当前规则自动执行，保存实际 source/config/result pins | 本次授权探测以f2_calibration_failed停止；RP校准12/12、3基线完成，Project第4校准输出契约无效，headroom未建立；见§12 |
| F3 一次双域试点 | 一次提炼/development；通过才一次独立promotion及原review→消费→rollback | 原development准入与M1退出门槛；全费用/partial/unknown保留；不追分 | 未开始 |

F1 不实现 GEPA 种群、自动修改 rubric、长期状态存储或跨任务推荐；只使上述契约有实际消费者。F2 的 source_unready、calibration_failed、unsupported_locus 或 baseline_saturated 如实记录；可修复工程问题处理后继续，真实不适用或缺改善空间不伪造失败/人类标签来凑闭环。

M1 成功只能按原验收宣布；F0 文档冻结、F1本地通过或F3单一维度提升都不等于M1达标。未达标不合并main、不进入S11/G。后续是否扩展第二类领域问题依据真实证据另议，本轮不自动推进。

## 9. F1 物理契约与支持边界

以下是§2–§5在原资源和消费者上的最小实现，不是新的authority。产品实现/验证HEAD和实际检查唯一记入同一Record；本轮没有运行私有Document迁移或真实模型请求。

| 原消费者 | 本次物理表示 / 行为 | 拒绝与适用边界 |
| --- | --- | --- |
| Experience repository | 原`atri_agent_experience` key不变；支持strict v1/v2。v2新增`collections`与diagnosis的`attribution`；assessment仍在原feedback数组 | 未知版本/字段、跨domain、损坏、超容量拒绝；没有第二个resource kind或storage registry |
| assessment | `assessment={profile:{profileId,revision},purpose,claims,producer}`；claims最多4项，每项`dimension/sourceHash/quote`，quote非空且最多512字符，note沿原4096限制 | ordinary/development才可写入；calibration/promotion拒绝。current exact ref及原bounded expansion中确有片段才接受；片段存在不等于语义/根因证明 |
| model producer | 原evaluator的`quality_assessment`分支调用同一compiler/resolver/provider及owner reserve/settle，Host绑定`modelId/configurationHash/requestHash/snapshotHash/chargeId` | 公共HTTP无assessModel入口；通用submit不接受assessment/可信origin。消费端要求同owner/Experience scope的settled extraction/judge charge及对应hash；unknown usage不改成reported。model不得写verified_failure |
| 固定checker | 当前仅注册`project.validation`，revision为固定谓词代码的内容hash；从原Task validation状态生成repair_quality claim，passed→no_failure，failed→verified_failure，其余unknown | 不接受脚本、客户端verdict或文学checker。inspect重新核查actual predicate；与正式状态不符或source变更时不可用。该proof只证明validation状态，未证明用户目标完成或唯一原因 |
| 根因路由 | `attribution={loci,support,intervention,legacy}`；loci最多3个；公共proposed attribution仅传loci/intervention，Host设unverified/legacy=false | 新local_target仅prompt locus且direction确定；engineering/none必须undetermined。Evolution拒绝缺归因、legacy、非local或context/state/runtime/evaluator/model/unknown，不仅存字段。旧项迁移unknown/unverified/legacy=true，不洗来源 |
| 零模型采集 | normal RP capture首次completed且exact output已绑定后写client completed；normal Project仅正式status/validation/review/receipt变化后，在Task锁外重读原authority、写原technical并唤醒原Evolution | evaluation副本默认关闭采集；校准/晋升不回流。success/completed不独自触发reflection，conflict和无法证明的结果不伪写失败。正文/Task正式效果不因metadata失败被重放或撤销 |
| 有界处理水位 | `collections`最多256项，每项`{id,kind,sourceId,sourceHash,signal,createdAt}`；id内容hash覆盖kind/sourceId/exact ref hash/signal | 同一版本重复事件拒绝重收；水位跨feedback过期/撤回/删除保留且不含原正文。不同Task正式版本的新失败仍可收。容量达到上限明确unavailable，不淘汰有效水位或开sidecar续跑 |
| 原reflection | 原explicit/technical failure和三个弱观察事件触发保持；新model疑似失败按profile/dimension和exact refs分组，至少三个不同来源才形成弱批次 | 一条输出的多claim、重复capture/charge或混合不相关维度不能凑三来源；弱批次仍不能取得local direction。completed/no_failure用于覆盖，不是优化资格 |
| fixed QualityProfile | 原evaluator目录内固定8个profile：六legacy与两个pilot；identity包含domain/unit、全部critical dimensions、unknown/N/A规则及内容revision | 两个pilot的六维均critical，无可事后N/A的必需维度；这是受审类型registry，不是已校准的文学rubric/独立案例。后者只在F2固定 |
| report consumer | 原compare输出Report v2的`quality` envelope，固定registry revision/domain/split、case/profile revision及provenance派生组；原逐pair、charge、人类字段、原gate保留 | critical dimension漏评、case/split/profile变化或伪改来源资格拒绝；现有case只标historical_synthetic/not_established，新报告source_unready。旧v1历史仍可只读识别且受原revision/gate约束，不回填旧评分 |

两个pilot profile ID是`rp.m1.information`与`project.m1.related`，维度分别对应§6。F1封包时没有给它们注册新source/fixture/adapter或promotion答案；F2续接现状见§11。原compare收到该profile请求会在worker/provider前返回source_unready。F1本地fake worker只核验工程report消费，不能自动取得F2材料或F3资格。原fixed catalogue的旧case内容/revision不改，也不继续用它们追分。

v1 writable mutation沿原CAS升v2，即使旧feedback hash未变也先失效旧Evolution job/report并暂停policy；read-only inspect/export不写。旧feedback id/revision/origin/source/期限和累计账目保留；新诊断须显式根因/干预，旧有向diagnose请求不兼容时拒绝，而非猜测归因。FS/SQLite依旧走generic reopen/dump/restore/deleteUser；回退旧二进制时必须暂停新功能，旧validator不能写v2。旧试验CLI的fixture代理explicit历史入口不改写为真人来源，也不作为新试点执行入口；F2只适配已冻结的新来源和内部分析port。

采集失败由RP返回collection_unavailable、Project保留正式Task并提示metadata缺口；原共享panel展示origin、quality claims、未确认采集和Collect saved result的拒绝/重试信息。补收一次只处理当前指定ref，通过原CAS；没有全量历史扫描、无限retry/poll或每轮自动critic。只有已有明确auto policy可由原wake安排原有界job，review/default权限不扩张。

尚未完成：真正的development/promotion来源包、独立性与headroom、可判别的文学/关联修改rubric、judge/calibration/实际request pins、有限真实发送范围和双域试点效果。这些仍按F2→F3处理；本模块物理契约不声称通用持续进化或长期领域质量已验收。


## 10. F2 来源准备、校准控制与本轮停止状态

当时六 development 规格未接原消费者，两个 pilot 返回 source_unready；免费 parser / Project 工具路径仅证明构造控制与可完成性，不是模型 headroom。详细历史见同一 Record。

## 11. F2续接：独立密封来源、原窗口与有限范围已准备

原 catalogue/adapter 已接六 development synthetic；六 promotion 由独立作者密封，开发侧只读 metadata。免费原消费者六 case 各两 rounds；Project 暴露旧 Task 实际 conflict 和 fresh Task diagnostic，无自动 commit。原 baseline-only probe 沿 compiler/provider/owner 路径保存 source/config/request/charge 身份，不产生 candidate/promotion/human 资格。实际 case/rubric/evaluator/config pins 与来源证据在同一 Record、私有结果保留。旧 Step 许可、封包次数与首失败停止要求已移除。

## 12. F2有限探测结果：校准契约失败停止

paid source eb1664138 新增 22 请求 / 140750 tokens，累计 783 / 3080332。RP 12/12 controls 与三个 baseline hard checks 通过；Project 第四控制方向/六维符号正确，但解释 552 超 parser 512 无效。语义 headroom 未建立，密封 promotion 未读；失败保留，按 §7 修复实际输出契约问题并必要复测。

## 13. F2继续：输出契约对齐与基线缺口证据评估

产品 ac0344879 已沿 funded bridge 明确 parser 512 输出提示并新增 model_source_assessment。六维 met/gap/unknown 的 quote 必须是当前证据确切 substring；met/gap 无证据无效，unknown 不能补零/NA。两 judge 在同 case 同维度共同 gap 才标 observed_gap，否则 not_established；共同 met 不证明全领域饱和，也不写 human 标签或 grant promotion。旧累计 1000、72/Step18 与 scope 许可取消，必要测试遵循 §7 / acceptance §0。


并行工程补充（product dd80d8583）：quote 原文中的换行在 serialized JSON 中被转义，已改为核对完整证据及 decoded 文本的确切原文；不模糊匹配、不改语义结论。复用已完成的 RP 校准/基线/首份有效 primary 观察，避免重复调用。实际结果见 acceptance §10.6 / Record；后续执行仍归 §7，不恢复旧封包许可。
