# M1 — 自动化工程验收与 API 测试执行

- Status: **M1实际双域工程验收完成并集成main**。实际结果及版本见同一Record最新节；历史结果保留，执行规则按§0。
- 本模块仅管理本轮 M1 工程验收。生产 automatic promotion 的详细权威仍为 [S10](s10-evolution.md)，不改运行时授权或原 human gate。

## 0. 当前 API 测试规则（覆盖全部历史封包）

API 测试唯一规则见 [Governance §13.1](../../../README.md#131-api-测试执行规则)。本模块只定义 M1 验收契约；历史结果见后文及同一 Record。

## 1. 验收语义

M1 验证 ordinary RP / Project 的实际执行、候选效果与审阅发布→下一请求消费→回滚。每阶段及完成时只在本地执行最小相关验证；测试调用仅遵循 Governance §13.1。

按具体改动选择相关案例、重复次数和控制。使用现有主模型连接即可；第二模型、固定三/九对、两/六胜、八项控制、至少两条 gap 和单轮/单候选均不作为工程准入或继续执行条件。历史试验中的这些数字保留为观测结果。

基线与候选的输入、工具、配置和来源应可比较；记录实际版本，评测前固定被测候选。开发材料与独立验收材料隔离。协议、来源或实现有变化时按受影响部分验证，不把旧结果冒充新试验，也不重复运行未受影响的已通过检查。

## 2. 结果与交付

- 核对相关来源、权限、实际目标消费和配置；缺失、不确定、失败与行为退化如实记录，修复后继续必要复测。没有质量改善证据就不宣称改善。
- 保存实际请求、结果和调用计数；token/费用只作统计，未知 usage 明确标注，价格未知记为 unavailable。不要求每轮人工核对全部历史账目或 hash。
- 在私有 fixture 检查相关 review publication、下一请求实际消费与 guarded rollback；不修改生产用户对象。模型观察不冒充 human preference，工程验证不触发生产自动发布。
- 已有产品行为、数据保护与生产发布权限按实际产品契约验证；S10 的生产自动预算/human/price gate 不作为测试 API 配额或停工条件。

相关问题解决且最小验证通过后按交付路线集成。普通失败、材料不足或容量错误继续诊断、修复和补充相关测试，不新建用户审批。

## 3. 历史账目与自动计数

原 S06 账本丢失后采用 historicalCarry 的恢复事实保留在 Record；不伪造逐次旧记录，不删除 settled/unknown。历史 carry、累计 tokens 和旧 breached 字段只作统计，不转为新的 API 硬额度。日窗口与速率计数见 Governance §13.1。

沿现有 EvaluationBudget / test-only advisory repository、私有 ledger/quota/rate 持久化端口计数和保存结果，不新增一套账目 authority。unknown usage 可保存估计并明确标注，不因估计或 token 超报停止测试。生产 repository / promotionDecision 继续沿原产品规则。

## 4. 本地持久位置与执行

`Document/` 是私有持久目录，凭证、连接、ledger 和报告均由 local Git exclude 排除，不写入公共 Git。保留现有连接与历史结果，不为了继续测试重置账目或覆盖旧报告。

实际入口仍为 `tests/agent-intelligence/m1-live.mjs`，沿原 EvolutionService / evaluator / repository。按当前阶段读取 index → 本模块与相关评价契约 → Record 最新状态；历史封包只在定位具体问题时读取。主模型使用现有测试连接，缺少第二连接不阻止执行；输出长度、timeout 和必要 retry 依据 Provider 能力及当前问题配置。

测试实现如仍要求 maxSends、maxSecondarySends、stepPermission、旧 breach/stop 或 token guard，应沿原测试消费者清理，不能把旧字段当成用户重新审批的理由。source/case/configuration 的实际版本随结果保存；不要求每次请求前提交一份许可文档。

## 5. 继续执行与验证

失败处理与阶段推进见 [Governance §8](../../../README.md#8-task-lifecycle)，通用验证见 [§12](../../../README.md#12-execution-adapters)。本任务的具体验收以 §1 / §2 为准；独立验收输出不回流开发，有效不利评分保留。

> 以下 §6–§13 保存历史过程，不定义当前配额、许可、模型数量或数值验收门槛。

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

用户明确允许第二连接不可用时仅测主模型。本次仅 F2 使用显式 `primary_only` 测试模式，当时不修改旧 M1 两模型验收、盲评、独立场景、原 gate 或生产权限。来源/配置/rubric/全部必需维度仍固定，单模型结果标 `primary_observed_gap`，`sharedGaps` 为空；第二连接旧观察不能补充为新协议通过。

六条 development 真实基线、六条独立密封来源 metadata、免费原工具可完成路径、主模型 20/20 有效 controls 和两域可改善缺口已核对。RP 缺口为档案场景新增无来源支持的处罚/权限；Project 三场景提案正确，但遗漏明确请求的未提交 Review 状态说明。正例、缺证据及两个没有观察到 gap 的 RP 场景保持原结果，不用 hard checks 替代语义质量。失败、费用、旧判断与不确定性保留。

原第二连接恢复后又返回 404，备用 MiniMax 返回 401；按用户 fallback 暂缓第二模型，主模型测试已完成。本节记录当时仅主模型范围的结果；此后已补齐 F2 双模型前置并完成首次 F3 development，见§12。当时仍按旧双模型 development/promotion 准入，不能将此前主模型结果写成 M1 完成。实际 producer HEAD、执行/复用边界、账目与全部 pins 唯一见 [同一 Record](../../../records/refactor/agent-intelligence-runtime.md) 最新节。


## 12. F2双模型复核与 F3 一次试点结果

F2两域controls和六来源的实际双模型观察已补齐，保留原正确基线与密封独立来源；当前事实见[feedback§15](m1-feedback-evaluation.md#15-f2双模型前置复核与-f3-一次双域试点结果)。每域一次F3候选提炼/三development场景已完成，两域一致candidate胜均0，有重要维度负差/分歧和一份无效grader契约响应，未满足原development前置门槛。当时方案的每域九对独立promotion、六一致胜及私有review/下一消费/rollback未执行，M1仍未验收，不集成main。实际范围、原费用/unknown与producer pins见[同一Record](../../../records/refactor/agent-intelligence-runtime.md)最新节；§11保留此前主模型范围与暂缓第二模型的历史，不作为当前状态。


## 13. F3 工程修复后的继续执行

首次试点不达标后继续诊断和必要工程复测，新增真实比较协议校准及原执行槽位核对见[feedback§16](m1-feedback-evaluation.md#16-f3-工程修复与-m1-持续推进)。不把一次试验退出写成M1完成或交接停止。§1/§2门槛、原不利报告、密封独立来源与全部费用保持；只有完整验收及原publication/下一消费/rollback证据成立后才集成。私有恢复、实际独立验收与两域原生命周期现已完成；实际版本和结果见同一Record最新节。


## 14. 当前主模型验证

当前工程验证使用现有主模型，按 §1 / §2 选择最小相关检查。同协议已完成且未受影响的结果可复用，保留来源与费用身份；变化的部分做必要复测。旧双模型准入及固定控制/胜场/候选数量不构成测试许可或工程硬门槛。生产自动发布仍归 S10。

双模型规则最早进入Git为 `aabdf8c75`（2026-10-07 21:06:53 +08:00，Git author `ZZZdragondYNGPHX`）。该提交将不同model identifier第二连接shuffle盲评写入验收；同版本决策说明详细门槛属于工程冻结，并非用户逐条指定。Git author仅是提交署名，不能证明用户亲自制定该规则；历史泛化确认不覆盖本次明确取消。

实际交付：M1实际验收与main集成完成。Project开发三胜、独立九胜；RP开发3胜、独立3胜/3对，相关六维无负差，三条公开回复完整152条核验六维met。两域完整费用绑定、native review发布、下一真实请求精确消费和guarded rollback均通过。main `ea75b76be4927e881de2f0be7c304a56301f1f83`；原生产自动发布规则、历史不利结果和unknown费用保留。H0八样本/519来源、隔离调用图和观测清单已准备，B0及H1/H2未运行。
