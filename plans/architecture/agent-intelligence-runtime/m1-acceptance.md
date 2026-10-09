# M1 — 自动化工程验收与 API 测试执行

- Updated: 2026-10-09
- Status: F1 工程已完成；F2 评价/source 仍待验收，F3 未开始，M1 pending。测试限制按当前 §0 执行；后文旧封包与配额仅为历史。
- 本模块仅管理本轮 M1 工程验收。生产 automatic promotion 的详细权威仍为 [S10](s10-evolution.md)，不改运行时授权或原 human gate。
- 用户授权 agent 完成验证。2026-10-09 最新指令取消额外测试配额、逐轮额度审计与重新许可；生产 automatic promotion 门槛不变。

## 0. 当前 API 测试规则（覆盖全部历史封包）

唯一权威为 [Repository Governance §13.1](../../../README.md#131-api-测试执行规则)：硬限制仅每日 2000 次调用、20 RPM，由发送端统一自动执行。历史累计不是终身额度；token、输出长度、旧预算 breach、每包发送数、Step claim 和旧 stop 不增加调用限制，不要求每轮人工审计或新许可。

在已授权 M1 当前阶段内自主完成必要探测、诊断、修复和复测，保存实际结果后推进。参数/来源版本按实际变化记录，不能将每次记录变成发送前文档审批。工程错误修复后继续；真实验收不达标仍如实报告，production human/price/authority gate 及正式阶段边界保持。

§6–§10.5 仅保留历史结果摘要与稳定链接；旧封包详细事实归 Record，旧执行指令已移除。现行恢复入口为本节与 live HANDOFF。

## 1. 验收语义

M1工程验收采用确定性authority检查、固定独立场景、原实际模型执行与两种模型盲评；不要求用户本人运行tests或提供human labels。报告保留 `humanPreference=not_observed`，不将model observation写入生产human字段。

只评价 ordinary RP / Project 支持矩阵内各一个单目标：RP原character Skill body、Project原user Preset system.style body。原三类目标×双入口的48项 / 历史233项工程authority覆盖保留；两种实测不外推其它目标质量。

每入口三个固定独立promotion场景×三次paired trial，两arm输入、原Route / model / connection / tools / configuration精确固定。提炼只见原公开feedback / diagnosis / declared base，候选在promotion执行前冻结。原固定worker运行Director / Studio / compiler / resolver / provider；每对原blind model judge后，再以不同model identifier的第二连接进行独立shuffle盲评。网关upstream identity未知时仍标unavailable，不将identifier差异称真实厂商独立性证明。

## 2. 自动化工程退出门槛

- 两入口各九对完整独立comparison，无重复槽位 / 混source；evaluator / runner source、actual request / snapshot / usage / charge、originaltarget version与配置固定。
- 两种model observation每对一致且为candidate或tie；每入口至少六对一致candidate胜，其余只能tie；全部重要行为维度非负。invalid / uncertain / 缺失 / disagreement不能补分、伪造、强行通过。
- 原authority / isolation / target_consumed / source与exact配置检查全部通过；所有send均可核对到持久账本；usage 未知如实报告；API 每日 / 速率硬限由发送端执行。
- 用户明确无token要求，trial candidate /baseline tokens仅报告、不作工程通过条件；提炼 / 两种judge / retry / activation 的实际调用全部计入每日调用数并单列统计。价格未确认时currencyCost=unavailable，工程验收说明行为表现并单列token资源统计，不声称货币费用改善或含学习成本后的净收益。若价格取得则另行报告金额，不推断provider价目或隐藏retry。
- 在私有fixture里通过本次用户委托执行明确review publication，保存原intent / receipt；原下一Director / Project request实际消费已选版本并核对exact snapshot / target；再guarded rollback回原base。工程review不是human preference，也不计automatic eligibility；生产用户对象不修改。
- 原production promotionDecision继续拒绝缺human labels / confirmed price等证据的候选。模型盲评工程通过不触发生产自动发布，也不改默认review / 单目标 / scope / guards。

不达标则记录具体failure与partial证据；不缩减cases / repetitions、训练promotion输出、偷偷更换case或追试至通过。M1工程验收达标后才按既定U7集成与最小本地验证；本轮不进入S11 / G，阶段结束停止。远期任务不标完成。

## 3. 历史账目与自动计数

原 S06 账本丢失后采用 historicalCarry 的恢复事实保留在 Record；不伪造逐次旧记录，不删除 settled/unknown。历史 carry、累计 tokens 和旧 breached 字段只作统计，不转为新的 API 硬额度。只有当前日窗口内的实际使用计入每日 2000 次；20 RPM 在发送端统一排队。

沿现有 EvaluationBudget / test-only advisory repository、私有 ledger/quota/rate 持久化端口计数和保存结果，不新增一套账目 authority。unknown usage 可保存估计并明确标注，不因估计或 token 超报停止测试。生产 repository / promotionDecision 继续沿原产品规则。

## 4. 本地持久位置与执行

用户指定 `Document/` 是私有持久目录，凭证、连接、ledger 和报告均由 local Git exclude 排除，不写入公共 Git。保留现有连接与历史结果，不为了继续测试重置账目或覆盖旧报告。

实际入口仍为 `tests/agent-intelligence/m1-live.mjs`，沿原 EvolutionService / evaluator / repository。按当前阶段读取 HANDOFF → index → 本模块 §0 与相关评价契约 → Record 最新状态；历史封包只在定位具体问题时读取。两模型使用已授权测试连接；输出长度、timeout 和必要 retry 依据 Provider 能力及当前问题配置，不以旧 1024/8000/8192 数值作为新增 API 配额。

测试实现如仍要求 maxSends、maxSecondarySends、stepPermission、旧 breach/stop 或 token guard，应沿原测试消费者清理，不能把旧字段当成用户重新审批的理由。source/case/configuration 的实际版本随结果保存；不要求每次请求前提交一份许可文档。

## 5. 继续执行与验证

执行方式统一按 [Governance §12](../../../README.md#12-execution-adapters)：本地开发、验证、提交与清理，远端仅保存提交；Actions 全部停用，不等待 CI。只做最小充分的相关本地检查，优先自动化，不重复未受新变化影响的已通过检查；人工实机仅用于关键且无法自动化替代的明确证据缺口，不是 M1 默认验收门槛。

已授权当前阶段内持续推进必要工程工作。频率不足排队，日额度用尽等待恢复；普通测试/校准失败先修复后复测，临时网络错误按实际情况重试，实际调用统一计数。旧连接失败不形成永久封禁或 Step 次数许可；当前持续不可用时处理真实依赖。

只做触及面相关的本地检查。使用真实结果判断工程与模型验收，不重写有效不利评分、训练独立验收输出或降低门槛；开发诊断后的必要复测保留前后证据。每个正式阶段结束按 Governance 更新同一 Record / HANDOFF 并停止；不把每次调用小批次视为新阶段。M1 未验收仍不集成 main、不进入 S11/G，用户无需手测。

## 6. 2026-10-08 有限优化周期

历史优化周期累计 647 请求 / 2483896 tokens；development 未满足准入，新 promotion 未执行。 详细历史见 [同一 Record](../../../records/refactor/agent-intelligence-runtime.md)；本节不产生当前 API 配额或审批条件。

## 7. 2026-10-09 有限续接

历史续接累计 701 / 2717515；旧 partial 及候选结果保留，M1 未验收。 详细历史见 [同一 Record](../../../records/refactor/agent-intelligence-runtime.md)；本节不产生当前 API 配额或审批条件。

## 8. 2026-10-09 第二模型可用性检查

原 Step 评分形态诊断成功，累计 702 / 2721116；这不是独立质量评分。 详细历史见 [同一 Record](../../../records/refactor/agent-intelligence-runtime.md)；本节不产生当前 API 配额或审批条件。

## 9. 2026-10-09 来源读取修复的有限周期

来源读取修复的 development：每入口三个 pair，双模型至少两项一致 candidate 胜、其它一致 tie、重要维度非负且原 checks 完整才准入 promotion。该周期 RP 一项一致胜且 continuity 负差，Project 三项一致 tie；累计 761 / 2939582，未准入。 详细历史见 [同一 Record](../../../records/refactor/agent-intelligence-runtime.md)；本节不产生当前 API 配额或审批条件。

## 10. 2026-10-09 原链路反馈与评价契约先行

原链路契约与 F1 实现已经完成；物理契约见 feedback §9，F2 source/calibration 当前继续，F3 仍未开始。 详细历史见 [同一 Record](../../../records/refactor/agent-intelligence-runtime.md)；本节不产生当前 API 配额或审批条件。

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
