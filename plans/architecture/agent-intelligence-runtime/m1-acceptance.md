# M1 — 自动化工程验收与 API 测试执行

- Updated: 2026-10-09
- Status: F1与F2双模型前置完成；首次F3两域未准入promotion，新校准被530/524中断。工程修复与待验证流程已提交推送；用户暂停换设备，M1未完成。当前结果见同一Record最新节，恢复见[HANDOFF](../../../HANDOFF.md)；测试规则按§0，旧封包与配额仅为历史。
- 本模块仅管理本轮 M1 工程验收。生产 automatic promotion 的详细权威仍为 [S10](s10-evolution.md)，不改运行时授权或原 human gate。

## 0. 当前 API 测试规则（覆盖全部历史封包）

API 测试唯一规则见 [Governance §13.1](../../../README.md#131-api-测试执行规则)。本模块只定义 M1 验收契约；历史结果见后文及同一 Record。

## 1. 验收语义

M1工程验收采用确定性authority检查、固定独立场景、原实际模型执行与两种模型盲评；不要求用户本人运行tests或提供human labels。报告保留 `humanPreference=not_observed`，不将model observation写入生产human字段。

只评价 ordinary RP / Project 支持矩阵内各一个单目标：RP原character Skill body、Project原user Preset system.style body。原三类目标×双入口的48项 / 历史233项工程authority覆盖保留；两种实测不外推其它目标质量。

每入口三个固定独立promotion场景×三次paired trial，两arm输入、原Route / model / connection / tools / configuration精确固定。提炼只见原公开feedback / diagnosis / declared base，候选在promotion执行前冻结。原固定worker运行Director / Studio / compiler / resolver / provider；每对原blind model judge后，再以不同model identifier的第二连接进行独立shuffle盲评。网关upstream identity未知时仍标unavailable，不将identifier差异称真实厂商独立性证明。

## 2. 自动化工程退出门槛

- 两入口各九对完整独立comparison，无重复槽位 / 混source；evaluator / runner source、actual request / snapshot / usage / charge、originaltarget version与配置固定。
- 两种model observation每对一致且为candidate或tie；每入口至少六对一致candidate胜，其余只能tie；全部重要行为维度非负。invalid / uncertain / 缺失 / disagreement不能补分、伪造、强行通过。
- 原authority / isolation / target_consumed / source与exact配置检查全部通过；所有send均可核对到持久账本；usage 未知如实报告；API 每日 / 速率硬限由发送端执行。
- trial candidate /baseline tokens仅报告、不作工程通过条件；提炼 / 两种judge / retry / activation 的实际调用全部计入每日调用数并单列统计。价格未确认时currencyCost=unavailable，工程验收说明行为表现并单列token资源统计，不声称货币费用改善或含学习成本后的净收益。若价格取得则另行报告金额，不推断provider价目或隐藏retry。
- 在私有fixture里执行明确review publication，保存原intent / receipt；原下一Director / Project request实际消费已选版本并核对exact snapshot / target；再guarded rollback回原base。工程review不是human preference，也不计automatic eligibility；生产用户对象不修改。
- 原production promotionDecision继续拒绝缺human labels / confirmed price等证据的候选。模型盲评工程通过不触发生产自动发布，也不改默认review / 单目标 / scope / guards。

不达标则记录具体failure与partial证据；不缩减cases / repetitions、训练promotion输出、偷偷更换case或追试至通过。M1 工程验收达标后集成；S11 / G 仍依赖其产品设计与前置条件，不把远期任务标为完成。

## 3. 历史账目与自动计数

原 S06 账本丢失后采用 historicalCarry 的恢复事实保留在 Record；不伪造逐次旧记录，不删除 settled/unknown。历史 carry、累计 tokens 和旧 breached 字段只作统计，不转为新的 API 硬额度。日窗口与速率计数见 Governance §13.1。

沿现有 EvaluationBudget / test-only advisory repository、私有 ledger/quota/rate 持久化端口计数和保存结果，不新增一套账目 authority。unknown usage 可保存估计并明确标注，不因估计或 token 超报停止测试。生产 repository / promotionDecision 继续沿原产品规则。

## 4. 本地持久位置与执行

`Document/` 是私有持久目录，凭证、连接、ledger 和报告均由 local Git exclude 排除，不写入公共 Git。保留现有连接与历史结果，不为了继续测试重置账目或覆盖旧报告。

实际入口仍为 `tests/agent-intelligence/m1-live.mjs`，沿原 EvolutionService / evaluator / repository。按当前阶段读取 index → 本模块与相关评价契约 → Record 最新状态；历史封包只在定位具体问题时读取。两模型使用现有测试连接；输出长度、timeout 和必要 retry 依据 Provider 能力及当前问题配置。

测试实现如仍要求 maxSends、maxSecondarySends、stepPermission、旧 breach/stop 或 token guard，应沿原测试消费者清理，不能把旧字段当成用户重新审批的理由。source/case/configuration 的实际版本随结果保存；不要求每次请求前提交一份许可文档。

## 5. 继续执行与验证

失败处理与阶段推进见 [Governance §8](../../../README.md#8-task-lifecycle)，通用验证见 [§12](../../../README.md#12-execution-adapters)。本任务的具体验收以 §1 / §2 为准；独立验收输出不回流开发，有效不利评分保留。

## 6. 2026-10-08 有限优化周期

历史优化周期累计 647 请求 / 2483896 tokens；development 未满足准入，新 promotion 未执行。 详细历史见 [同一 Record](../../../records/refactor/agent-intelligence-runtime.md)；本节不产生当前 API 配额或审批条件。

## 7. 2026-10-09 有限续接

历史续接累计 701 / 2717515；旧 partial 及候选结果保留，M1 未验收。 详细历史见 [同一 Record](../../../records/refactor/agent-intelligence-runtime.md)；本节不产生当前 API 配额或审批条件。

## 8. 2026-10-09 第二模型可用性检查

原 Step 评分形态诊断成功，累计 702 / 2721116；这不是独立质量评分。 详细历史见 [同一 Record](../../../records/refactor/agent-intelligence-runtime.md)；本节不产生当前 API 配额或审批条件。

## 9. 2026-10-09 来源读取修复的有限周期

来源读取修复的 development：每入口三个 pair，双模型至少两项一致 candidate 胜、其它一致 tie、重要维度非负且原 checks 完整才准入 promotion。该周期 RP 一项一致胜且 continuity 负差，Project 三项一致 tie；累计 761 / 2939582，未准入。 详细历史见 [同一 Record](../../../records/refactor/agent-intelligence-runtime.md)；本节不产生当前 API 配额或审批条件。

## 10. 2026-10-09 原链路反馈与评价契约先行

当时原链路契约与 F1 实现完成，F2 source/calibration 继续，F3 未开始；物理契约见 feedback §9。此后实际结果见§12/§13。 详细历史见 [同一 Record](../../../records/refactor/agent-intelligence-runtime.md)；本节不产生当前 API 配额或审批条件。

### 10.1 F2准备核对的实际范围与停止状态

当时免费准备确认 source_unready，真实调用为零；详细事实见同一 Record。 详细历史见 [同一 Record](../../../records/refactor/agent-intelligence-runtime.md)；本节不产生当前 API 配额或审批条件。

### 10.2 F2续接已固定的有限范围与新许可边界

当时原 fixed catalogue、独立密封 metadata、准备副本与免费构造路径已固定；旧次数/许可要求现已取消。 详细历史见 [同一 Record](../../../records/refactor/agent-intelligence-runtime.md)；本节不产生当前 API 配额或审批条件。

### 10.3 F2本次新有限许可（发送前记录）

此节保留旧授权记录入口；原次数配额与首失败停测条款已撤销，当前执行无需新次数许可。 详细历史见 [同一 Record](../../../records/refactor/agent-intelligence-runtime.md)；本节不产生当前 API 配额或审批条件。

### 10.4 F2授权范围实际结果与关闭

实际 paid source eb1664138：新增 22 请求 / 140750 tokens，累计 783 / 3080332。RP 12/12 controls 与三个 baseline hard checks 通过；Project 第四次校准解释 552 > parser 512 无效。原 raw/charge/source pins 在 Record 与私有结果保留，工程问题按 §0 修复后必要复测。 详细历史见 [同一 Record](../../../records/refactor/agent-intelligence-runtime.md)；本节不产生当前 API 配额或审批条件。

### 10.5 F2继续授权：累计1000调用与20RPM（发送前）

旧累计 1000、72/Step18 封包和新许可条款已撤销。产品 ac0344879 增加 512 输出契约提示与两 judge 基线证据核对；met/gap 需当前证据的确切 quote，两模型共同 gap 才标 observed_gap，其余为 not_established，不冒充 candidate 比较或 human 标签。当前继续遵循 §0。 详细历史见 [同一 Record](../../../records/refactor/agent-intelligence-runtime.md)；本节不产生当前 API 配额或审批条件。


### 10.6 F2测试续接：最新每日2000调用与20RPM

并行产品工作已 push dd80d858338e92ef340a25d4bbf48e3e267f9595。run-1791524899036-18298dde 新增 21 请求 / 62624 tokens，累计 804 / 3142956、全部 settled；RP 12 controls 与三个 baseline（8 sends）通过。首份 primary 评估原 quote 含换行，在 serialized JSON 中被误拒绝，decoded 原文本逐字存在；修正表示层核对并复用已完成观察，保持 grade/source/quality 不变。旧失败/费用保留，必要后续证据检查沿 §0 继续，不以原 41/12/72/18 封包数字、新 permission 或旧 stop 增加当前额度/审批条件。详细历史见同一 Record，当前实际运行状态以 Git/私有结果为准。


最新并行产品 0479f5bd3e924c6031b09eaa4103e28684bc086a 修复 F2 retry0 误用 timeout/4（75 秒）的问题，改用原 Route 300000ms 完整单次 deadline。一次 transport_failed 未取得 usage，保留 11631 上界；最新记录累计 805 / 3154587、unknown18/86579、pending0，复用原 21 个已完成请求证据。必要修复复测按当前规则继续，旧 claim/首失败撤销不增加次数许可或停测条件。


## 11. F2主模型范围完成与双模型暂缓

用户明确允许第二连接不可用时仅测主模型。本次仅 F2 使用显式 `primary_only` 测试模式，不修改 §1/§2 的 M1 两模型验收、盲评、独立场景、原 gate 或生产权限。来源/配置/rubric/全部必需维度仍固定，单模型结果标 `primary_observed_gap`，`sharedGaps` 为空；第二连接旧观察不能补充为新协议通过。

六条 development 真实基线、六条独立密封来源 metadata、免费原工具可完成路径、主模型 20/20 有效 controls 和两域可改善缺口已核对。RP 缺口为档案场景新增无来源支持的处罚/权限；Project 三场景提案正确，但遗漏明确请求的未提交 Review 状态说明。正例、缺证据及两个没有观察到 gap 的 RP 场景保持原结果，不用 hard checks 替代语义质量。失败、费用、旧判断与不确定性保留。

原第二连接恢复后又返回 404，备用 MiniMax 返回 401；按用户 fallback 暂缓第二模型，主模型测试已完成。本节记录当时仅主模型范围的结果；此后已补齐 F2 双模型前置并完成首次 F3 development，见§12。原双模型 development/promotion 准入不变，不能将此前主模型结果写成 M1 完成。实际 producer HEAD、执行/复用边界、账目与全部 pins 唯一见 [同一 Record](../../../records/refactor/agent-intelligence-runtime.md) 最新节。


## 12. F2双模型复核与 F3 一次试点结果

F2两域controls和六来源的实际双模型观察已补齐，保留原正确基线与密封独立来源；当前事实见[feedback§15](m1-feedback-evaluation.md#15-f2双模型前置复核与-f3-一次双域试点结果)。每域一次F3候选提炼/三development场景已完成，两域一致candidate胜均0，有重要维度负差/分歧和一份无效grader契约响应，未满足原development前置门槛。§1/§2的每域九对独立promotion、六一致胜及私有review/下一消费/rollback未执行，M1仍未验收，不集成main。实际范围、原费用/unknown与producer pins见[同一Record](../../../records/refactor/agent-intelligence-runtime.md)最新节；§11保留此前主模型范围与暂缓第二模型的历史，不作为当前状态。


## 13. F3 工程修复后的继续执行

首次试点不达标后继续诊断和必要工程复测，新增真实比较协议校准及原执行槽位核对见[feedback§16](m1-feedback-evaluation.md#16-f3-工程修复与-m1-持续推进)。不把一次试验退出写成M1完成或交接停止。§1/§2门槛、原不利报告、密封独立来源与全部费用保持；只有完整验收及原publication/下一消费/rollback证据成立后才集成。修复及待验证流程已提交推送，原worker接线检查和真实独立验收闭环未完成；用户明确暂停换设备。用户转移私有Document包后，由接手AI自主恢复源码/docs、依赖及本机路径，恢复见HANDOFF，修复版本的实际结果见同一Record最新节。
