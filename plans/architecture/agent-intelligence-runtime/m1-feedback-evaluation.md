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

原累计沿 `761 requests /2939582` 与全部 settled/unknown/失败窗口。API 仅 2000/day、20RPM 硬限，每次输出最多 8000；tokens/历史测试预算是建议，超额通知后按授权继续。所有发现/分析/控制/提炼/执行/judge/retry/消费都沿原 ledger/quota/rate 计账，unknown 保留上界。生产 owner/job 硬预算与 human/price gate保持，不把 test-only 调整偷渡到生产。

以下只是**一次双域试点的形态估算**，不是本轮发送许可或追加硬 API 限额：

| 工作 | 双域最多模型请求的结构估算 | 使用边界 |
| --- | ---: | --- |
| 来源/headroom 探测 | 6 场景 ×6 send =36 | 保存正式输出；不能冒充后续独立 paired baseline |
| 有限缺陷分析 | 6 来源 ×1 =6 | 能用固定 checks 时无需这些调用；不得无限逐轮 critic |
| judge controls | 2域 ×3组 ×2顺序 ×2judge =24 | 正确/错误/unknown，构造素材不另调用生成 |
| 候选与 development | 2提炼 +12 arms ×6 +12 grades =86 | 各一候选/三pair，原双模型 ≥2一致胜/其它tie/非负才准入 |
| 独立 promotion | 36 arms ×6 +36 grades =252 | 达development才各九对/六一致胜等原门槛 |
| 下一 run 消费 | 2域 ×6 =12 | 仅达标后在私有 fixture review；原 rollback 零模型 |
| 合计 | 416，另列实际必要的 retry/诊断 | 无 retry 的形态上界；不是实际必需调用数或承诺费用 |

实际 source/case/input/rubric/calibration/worker/request identity、逐步 send 范围和 timeout 必须在来源就绪后、第一次试点发送前写入 m1-acceptance 的新实验范围；只按一次有效结果推进，不恢复旧6/24许可、不清stop/换epoch。当前 Step8000 旧404 stop仍在，历史六次成功不自动解除；未来若需要诊断/显式有限许可，要在该范围内单独记录依据、次数和撤销条件，不能沿旧剩余额度调用。

测试范围的结束/取消、来源失效和频繁失败仍停止实验，不以 token 建议为停止理由。production 单 job120send与测试双评委最坏127send形态不同，试点仍按原 test-only override 记录；不改 production 限额。现金价格未知如实 unavailable，不声称节约或回本。

## 8. 有限工作顺序与每包退出

这是当前 M1 的补充工作包，不新增正式 S/G 阶段，不将全领域研究变成 M1无限退出要求。每包结束按 Governance 保存同一 Record/HANDOFF 并停止。

| 工作包 | 范围 | 最小验证 / 退出 | 本轮状态 |
| --- | --- | --- | --- |
| F0 契约 | 本模块、原权威路由、U13和恢复状态 | 文档一致/链接有效；原账目与草稿不变；不发模型请求 | 设计完成 |
| F1 原链路最小实现 | 原 Experience v2/自动分析来源、零模型采集、诊断路由；固定 quality/case/report consumer与隔离；必要原panel来源/拒绝提示 | targeted source/provenance、去重/CAS/read-only/失效、FS/SQLite兼容及worker/split/critical dims/consumer checks；fake控制仅工程证据 | 最小消费者已实现；物理契约见§9，实际验证见Record |
| F2 来源与有限范围固定 | 两域development/独立来源包、baseline缺口/可完成性、校准素材、exact revisions、原失败窗口处理 | 免费controls/独立性和可完成路径先通过；有模型探测须先冻结其有限范围；最终请求前保存新acceptance范围 | 本次授权探测以f2_calibration_failed停止；RP校准12/12、3基线完成，Project第4校准输出契约无效，headroom未建立；见§12 |
| F3 一次双域试点 | 一次提炼/development；通过才一次独立promotion及原review→消费→rollback | 原development准入与M1退出门槛；全费用/partial/unknown保留；不追分 | 未开始 |

F1 不实现 GEPA 种群、自动修改 rubric、长期状态存储或跨任务推荐；只使上述契约有实际消费者。F2 中source_unready、calibration_failed、unsupported_locus或baseline_saturated是有效停止结果，不伪造失败/人类标签来凑闭环。

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

2026-10-09用户限定本轮只做F2的新来源、独立隔离、校准和有限范围固定，不启动双域试点。核对远端docs `74e687f7c`、product `57520d43dd577c13d1eee6df50d3edb4a3379a1e` 后，本轮准备核对结束于 **source_unready**。这不是F2全部完成，也没有取得F3资格。实际发送范围唯一归 [acceptance §10.1](m1-acceptance.md#101-f2准备核对的实际范围与停止状态)。

### 来源规格与独立资格

没有从未获准的真人聊天取得新来源。六份新development规格标为`agent_authored_synthetic_spec`，用途是代表性产品工作负载设计；尚无新模型执行ref，不能把它们称为已经观察的baseline失败。其完整输入、控制片段与pins留私有原Document，公开只记元数据。

| development root group | 产品用途 | 原权限/可完成路径 |
| --- | --- | --- |
| rp_dev_archive_return | 档案馆归还登记、NPC询问与玩家未决选择 | 原Director/character Skill；短公开场景，不代写玩家 |
| rp_dev_reservoir_signal | 修订交接条件、未知当前潮位/时间 | 显式可见修订与角色声音；不把预约时间推成现在 |
| rp_dev_theatre_variant | 当前布景variant、迟到旧输出与另一角色私有信息 | 原variant/owner/exposure checks；私有sentinel不得曝光 |
| project_dev_entrypoint_dependencies | Beta入口切换World依赖并同步primary选择，保留其它入口/资源 | 原get_project→plan→project_save→prepare_review |
| project_dev_binding_repair | 原validator具体缺失binding引用诊断后的单轮修复 | 原source/diagnostic→reset staged operations→save→review |
| project_dev_dependency_conflict | 关联修改审阅前出现human revision，保留human source并说明下一步 | 原staged proposal与conflict，不silent rebase/commit |

每份规格独立root，派生关系为空；没有复用旧门口场景、rename-only任务或旧v1/v2换名资格。development与promotion按原episode/Project及派生家族隔离，不按文件hash/姓名划分。promotion仅预留每域三个root的元数据槽位，`origin=not_acquired/sourceHash=null/independence=not_established`；槽位不计来源数，也不证明盲性。没有读promotion内容/答案、共享其cache或把控制材料送入提炼。后续须取得独立内容并证明来源家族不重叠，development仅可见用途/元数据；不能将本轮作者知道的开发内容改名入promotion。

### 校准与重要维度

两个F1 profile全部六个critical dimensions保持，逐维draft rubric冻结如下。判定只覆盖所给短场景/公开Task证据；缺证据为unknown，不能填零/tie，也不能事后N/A。

| profile dimension | 有限判定依据 |
| --- | --- |
| player_agency | NPC可推进自己的行动；玩家动作/选择/感觉/心理须已有明确输入 |
| promise_application | 应用当前正式修订，约定时刻不等于当前时刻 |
| knowledge_boundary | 仅用实际exposure，猜测与事实分开，私有或未给定内容unknown |
| continuity | 当前variant/场景事实优先，迟到旧completion不能覆盖 |
| actor_voice | 当前短场景中可观察的角色措辞与回应，不证明长期审美 |
| narrative_response | 回应实际玩家输入并留下可行的场内下一步，保留玩家决定 |
| intent_completion | exact proposed/current source与Task正式状态证明所要求目标 |
| conflict_handling | 实际conflict时human source/旧base保留，说明可执行恢复动作 |
| repair_quality | 原diagnostic及实际修正满足repair bound，不删无关内容掩盖问题 |
| related_completion | 指定的依赖refs与primary选择等关联字段一致 |
| preservation | 未授权字段、resource内容与权限经exact比较保持 |
| status_accuracy | 说明符合正式validation/Review/receipt，不能虚构commit |

六组positive/negative/unknown片段是`engineering_control`，不是人类标签或真实baseline失败。原`parseBlindGrade`在两种顺序的36组scripted JSON中保持preference/符号，36次遗漏critical dimension拒绝；这证明结构/换算，不证明模型能辨别这些文字。实际两个judge校准未运行，人类审美未观察。

发现一个真实的适用性缺口：当前profile在每个pair上要求全部六维，而单独authoring/repair/conflict任务不各自曝光其它两类操作的实际证据。RP单场景也须逐维确认足够exposure。不能给未发生的冲突/修复填零或用假轨迹凑维度。后续F2先预注册能在原六round内覆盖所需维度的来源/公开窗口；若无法覆盖，明确evaluator/source_unready并停止，不能临时删除critical维度。此为评价/来源工程问题，不交local Prompt writer解决。

### 已证实与未证实的可完成性

在临时隔离FS副本直接执行原Studio/ProjectAgent工具，实际World依赖及KnowledgeBinding引用均由原authority创建/校验：关联修改4个tool calls达到review；含具体缺失引用diagnostic的单轮修复7个tool calls达到review；human revision冲突4个tool calls达到conflict。每项未自动commit、当前source/无关字段保持；临时副本清理，正文/精确source/Task与tool结果复制为私有engineering证据。工具可批次执行，但tool calls不等于model rounds；没有证明真实模型可在六round内完成，也没有证明baseline缺口。

固定来源consumer仍只接受原12个legacy cases；六份新规格经原validateCase拒绝，两个pilot经原compare在创建worker/reserve/provider之前返回source_unready。这是实际消费者证据，不注册旁路case runner或绕开gate。新fixed catalogue/adapter、独立promotion来源、baseline headroom、逐维实际证据覆盖、双judge语义校准和实际request envelope仍未就绪。

### 本轮exact pins与保留边界

私有来源包SHA256 `b7a46ff1b0550f3ee074f45a3819b037777fc4efdc1ff1df0c84e57f3be2a8f9`；draft rubric `4ec9760ce4b4906d6928558c8d2e2d410a077018714562c1c54442a380bcc8b8`；原工具路径报告 `ed82408c425e4dc7d40a497adea9d40c1bd89a3d45391f29abda8823f54c3476`；最终readiness `34e42c7b74714af224e9216940ae42dcb8a96e3aeedcc659c1fc9614f61da481`。来源包内逐规格保存input/control/specification hashes及profile exact refs；原Quality registry revision `2a3313cdec0280729bae2cf2401090c131682bc50d8bb33707a4d50b1320e370`，evaluator revision `8f4b4fbfd402a3825d714e76d8a84c3d0c4ad67b6b6ac5053d3cd483bc892180`。当前primary/secondary无key配置hash仅留私有报告，未产生实际request pins，不把规格hash冒充已发送快照。

本轮零真实发送、零提炼/paired trial/发布；累计761/2939582及五状态SHA、九窗口七stop、6of24旧claim保持。M1 pending、main未合并；包末保存同一Record/HANDOFF后停止。下一如获继续仍是补齐F2，不直接进入F3。


## 11. F2续接：独立密封来源、原窗口与有限范围已准备

2026-10-09用户继续F2，并明确允许专职独立作者生成密封来源。本包product/Tested HEAD `eb1664138458ebae073d86792e5a5295ce27dfda`，从docs `a91f45e40e638b4f813d298250d2a4b393b10f57` 续接。新source/原adapter、免费构造路径、控制材料和付费前范围已固定；**实际headroom与双judge语义校准未运行，等待新Step有限许可**。F2未全部验收，F3未启动；原§10记录保留为上包历史。实际范围归 [acceptance §10.2](m1-acceptance.md#102-f2续接已固定的有限范围与新许可边界)。

### 来源与原消费者

原六个development用途现已成为受审fixed synthetic fixtures，保留明确origin/purpose、不同episode/Project root与template家族和空derivedFrom。开发内容属于构造产品工作负载，不是已经发生的真实baseline失败。原12个legacy catalogue及其revision `49c56c12126aff08c83465f83412d2acb2aa6417e4183b25d7cbebe59f63b54b` 逐字不变；新12项（6 development、6 promotion metadata pins）另有固定case revision。没有任意上传case自动取得资格的入口。

独立作者在未读取development正文/controls的条件下生成每域3个不同来源家族；仅收到通用schema、排除家族与公共窗口约束。开发侧只读取metadata，不读取密封内容/答案；固定目录只import promotion metadata/hash，不import payload。作者完成schema/ranges、Node canonical parity与家族语义排除核对；private ACL保持。metadata SHA `f7858cc57c9b5aa5eeaa1a2102174c83bca7f7eddf0e07330d6ffbeeeaf14505`。这些是独立agent-authored synthetic，不是自然用户来源、人类标签或已经运行的独立promotion。

RP窗口同时保留当前可见承诺/scene修订、unknown当前事实与角色声音；原owner/player/exposure/revision/variant/stale completion checks全部使用原消费者。Project原public loop在Review/conflict即停止，不能在工具返回后补造模型冲突说明。因此最终固定为一个有界公开窗口内的两个真实原Task：旧有效待审Task经过human metadata修改，原commit前base检查真实拒绝，未建commit intent/写入；旧Task继续保留conflict/旧base。Host随后显式在human revision创建fresh Task，并暴露旧Task的实际公开ref/status/validation及新Task具体缺失binding诊断。模型只读最新source/diagnostic、reset错误staging、修正关联依赖并到Review；不commit、不rebase旧Task。这样模型在生成时能看到实际冲突并说明fresh Task与未提交状态，原停止规则不变。

六个免费scripted构造路径各在两次原public generation rounds内通过；Project每个8个tool calls（含预置诊断，工具批次不等于round），原validation failed→passed、旧conflict保持/fresh Review、human source/无关字段/resources/permissions保持，model effects 0，隔离canary保持。只证明可完成路径和实际证据曝光，不证明真实模型能力、headroom或六维语义得分。preservation只恢复授权修改的具体字段再比较整份source，不能以整条entry恢复掩盖未授权字段变化。

### 校准、probe与有限封包

两个profile全部六critical dimensions保持，逐维rubric要求实际公开证据，缺证据unknown，不能补零/tie或事后N/A。控制材料共12份：2域×known violation/counterfactual/missing evidence×两顺序，拟供两judge共24次。构造positive/negative与说明均标engineering_control/humanPreference=not_observed；不是观察到的baseline缺陷。原parser本包验证8次方向/符号映射、4次缺证据empty deltas拒绝；这不证明两个模型会正确判别。有效控制要求顺序一致、重要维度非负且至少一个正delta；unknown必须uncertain/empty deltas，不可取得正式grade资格。首个无效/不可判别结果即结束，不追分。

原EvolutionEvaluator新增内部baseline-only source probe，沿同一fixed worker/compiler/provider与owner reserve/settle；每域仅development、一次、每case最多6 sends。报告origin=host_source_probe，candidate/judge/human为空，保留原checks、正式输出、completeness、request/snapshot与charge身份，不能成为comparison或promotion资格。原compare两个pilot仍source_unready，production gate没有放开。原M1 local CLI增加F2显式scope模式，复用原ledger/quota/rate/transport，不调用runEvolution/提炼/发布；每次实际请求的rendered/hash/snapshot在funding前写私有记录，未知usage仍按原上界settle。

Project prepare首次创建的Preset引用不稳定，已通过原restore的baseline-only检查恢复准备副本，要求精确doc/target/pin、jobs/publications皆空；两次原CLI prepare证明primary/secondary/settings/target pins稳定。准备run `run-1791522724983-ea572224` 与restore复核 `run-1791522727921-9bfaefe3` 均0 send。未授权paid模式实际在ledger lock/provider之前f2_step_permission_required；没有新Step claim/清stop/epoch。

固定物理pins：Quality registry `2a3313cdec0280729bae2cf2401090c131682bc50d8bb33707a4d50b1320e370`；pilot case set `ff7409f24c7c7b5bb030a5f0052144ad3946c6459af1894ddbb225ed6b1211c3`；rubric `408f084132df98292863dcf2e1413b0c02803574aa913ad86e2e9603c78c248a`；evaluator `c5d6d2daf812a881955fc79c296b7174cfcef13f5a95f5a10a31c04cd76bd433`。私有scope文件SHA `355269bd804e4d069d1a98ac5f7352ec4690a2f86536c02253896bee4e243b0d`；calibration `9081a5246dfa4c753a146a6b89cf09282da921a09b48fb9dcf8851e0748f3018`；constructive evidence `71e631cc33f9381548893aa7b59d640b19e716da60b9fb7485c123f7c094e646`；free readiness `12c3ddd111a6bb8dff751b67eaf7f69bf0621ec20057ebbd0303b6f59ae13c23`。逐source/input/case/provenance和无key configuration/settings/runner hashes在scope/metadata中固定；尚无实际发送snapshot，不能用规格hash代替。

本包6 relevant suites /44 distinct local tests、触及JS/MJS ESLint和syntax/diff通过；fake funded failure一次settle后停止、baseline worker无candidate、restore原publication路径等见Record。真实账目仍761/2939582，五累计状态与五无关dirty文档字节10/10一致；九窗口/七stop和旧6/24 claim保持，真实send0。main未合并、M1 pending。下一只执行经新许可的F2有限校准/基线探测并核对headroom，成功也须包末保存Record/HANDOFF停止，不自动F3。


## 12. F2有限探测结果：校准契约失败停止

2026-10-09用户明确授权后，按 [acceptance §10.3/§10.4](m1-acceptance.md#104-f2授权范围实际结果与关闭) 的新最多60send/Step12/retry0范围执行；paid source eb1664138，实际新增22send/140750 tokens。RP的12个双judge/两顺序控制均通过，包括4个missing evidence的uncertain/empty deltas；3个baseline共6send全部hard checks通过。Project前三控制通过，第4个Step known_violation反序响应解释552>512，原严格parser拒绝，立即停止。方向/六维符号正确并不能免除输出契约；Project剩余校准与baseline未运行。

RP baseline六维semantic scores未运行，headroom未建立；没有开发pair、独立promotion或人类偏好。开发证据初阅发现水库场景“检修没落定”可能把未知检修状态说成事实，后续文字又按未见确认保守处理；这仅是语义歧义线索，不是正式dimension failure/评分或已确立的可干预缺口。不得以hard checks全过声称饱和，也不得将developer分析冒充model_assessment或人类标签。

本次新增Step claim8/12并已关闭，原旧claim/epoch/stop保留；全部22费用settle，累计783/3080332、pending0，逐请求包/owner/共享账目一致。完整raw与metadata audit只在私有Document，密封promotion正文/答案没有被开发侧读取。具体hash/费用与权限归acceptance§10.4；本次不改生产gate、cases/rubric/parser/source pins。

下一仅做F2工程准备：核对原评价prompt是否明确≤512字符契约，并检查控制公开轨迹是否存在可去除的重复上下文；如有修正，必须经原evaluator/source消费、版本与必要验证重新固定，不能把问题交给local Prompt writer、放宽原判定或重跑同一封包追分。Project实际baseline可完成性/全维证据、RP语义headroom和其余双judge控制仍未建立。新付费范围须另行固定与取得明确许可；本轮封包结束，F3/main集成/S11/G不启动。


## 13. F2继续：输出契约对齐与基线缺口证据评估

用户允许调整其它限制并以累计1000调用/20RPM为硬上限，实际新范围与许可归 [acceptance§10.5](m1-acceptance.md#105-f2继续授权累计1000调用与20rpm发送前)。根因是原校准prompt仅要求concise而未说明parser512字符；本次沿原funded bridge追加明确输出契约，不改变原严格grade。新schema2最多72send/Step18包含两judge对六基线的有限证据核对；仅model_source_assessment，不写human反馈/候选/正式quality score，不grant promotion。

六维status met/gap/unknown的quote须为当前所给原文的确切substring，met/gap无可引用证据则无效；quote/rationale各≤512。两judge同case同维度共同gap才为observed_gap，其余headroom not_established。共同met只说明这个短窗口，不声称全领域饱和；unknown不补零/NA。首无效停止；全部真实请求及旧失败保留。独立promotion payload仍密封只读metadata，case/rubric/生产gate不变，F3不开始。

§13继续执行时出现quote表示层错误：实际文本换行在serialized JSON中转义。现以原证据及其decoded文本逐字核对，复用已经完成的RP校准/基线/首个评估；不是改判语义或模糊匹配。用户最新硬限为每天2000/20RPM，累计1000取消，续接详见acceptance§10.6。
