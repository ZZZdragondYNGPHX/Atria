# Live HANDOFF — Agent Intelligence Runtime

- Task ID: `agent-intelligence-runtime`
- Updated: 2026-10-09
- Previous closed checkpoint: **F2授权有限探测以f2_calibration_failed停止；RP校准12/12和3基线完成，Project第4校准解释552>512无效。全部费用结算；headroom未建立、F2未验收，F3未开始，M1 pending。**
- Product / latest paid / local Tested: `feat/agent-intelligence-runtime@eb1664138458ebae073d86792e5a5295ce27dfda` 已push且clean，本轮无源码改动。
- Stable main: `ed1fd90521a63363e29856601abbf5e908c99d10`，未合并。
- Docs: 从origin/docs102d54335隔离detached worktree续接，发送前许可已push42567be30；实际结果在同一Plan/Record更新并push docs，以actual Git为准。旧本机docs工作树五份纯CRLF dirty字节保留。
- Read: actual Git/private账目 → 本HANDOFF → [index](plans/architecture/agent-intelligence-runtime/index.md) → [feedback§12](plans/architecture/agent-intelligence-runtime/m1-feedback-evaluation.md#12-f2有限探测结果校准契约失败停止) / [acceptance§10.4](plans/architecture/agent-intelligence-runtime/m1-acceptance.md#104-f2授权范围实际结果与关闭) → [同一Record末节](records/refactor/agent-intelligence-runtime.md)。

## 当前证据与关闭边界

六development synthetic进入原fixed catalogue/adapter；六promotion由用户允许的独立作者密封，开发侧只读metadata SHA f7858cc57c9b5aa5eeaa1a2102174c83bca7f7eddf0e07330d6ffbeeeaf14505，不读正文/答案。原legacy12/revision不变，独立synthetic不是自然用户来源或人类标签。免费六case各两round的原路径证据保留。

用户明确授权最多60实际send/新Step12/retry0/首失败停；evidence c73ceca38db1993b9c38961d4a9a863107d498a687465834867a10dad37f3725，scope SHA19f270e48390213496df8703fd4a873c6ad36964032a52d9af30746409c73b72。原CLI执行run run-1791523500486-7aee8a69：RP12controls全过、3baseline共6send hard checks通过；semanticScores not_run、headroom not_established，无candidate/judge/human。Project前三controls过，第4个secondary known_violation反序响应552字符超过512上限，严格parser拒绝，首失败停止；其方向/六维符号正确，不能称质量退步。Project剩余controls/baseline未运行。

本轮22请求/140750 tokens，累计783/3080332、514reported/17unknown74948、pending0/lock0/quota783；22实际包/response/owner/shared ledger逐ID/pins/usage匹配，历史账目可逐字重建。RP18次/48133 tokens、Project4次/92617 tokens，各jobs/publications0。九transport窗口/七旧stop保留，旧6of24 claim/epoch不变；新Step claim8/12且failed=f2_calibration_failed已关闭，余下4次不可继续用。retry/提炼/pair/promotion/publication0，现金价格unavailable、人类偏好not_observed。私有paid audit SHA c3c2ccce8b38459640622d2753e154a4a2f75a64a137080295132088683a9bc0。

RP水库文本可能存在未知检修状态的措辞歧义，仅开发证据初阅；不能据此宣告六维失败或headroom成立，不能以hard checks全过宣告饱和。原compare仍source_unready、生产gate保持，F3无资格。

## 下一动作

下一仅F2评价/source工程准备：核对原judge prompt是否明确≤512契约及控制公开轨迹的重复材料；必要修正沿原消费者/版本/验证固定，不截断解释/放宽parser，不由local Prompt writer掩盖，不重跑已关闭封包追分。Project真实baseline/全维证据、RP语义headroom与其余双judge控制未建立。新付费范围须另行固定并取得明确许可，本轮停止，不自动F3/main集成/S11/G。

上包6 relevant suites/44 distinct tests与lint/syntax是代码历史验证；本轮源码未变，只执行授权原CLI与费用/状态审计，未重跑Jest/build/CI/UI/Android/外部DB。用户无需手测。

接手提示词：**先fetch核对product eb1664138、origin/docs与main ed1fd905；保护旧docs五dirty，不从其旧HEAD恢复状态。HANDOFF→index→feedback§12/acceptance§10.4→Record末节，核对私有783/3080332、pending0和关闭的8/12新claim。只续F2评价/source工程准备，密封promotion只读metadata；RP硬检查通过不等于六维/饱和，Project552>512是严格输出契约失败。保留原账本/频率/硬API限额/unknown/旧窗口/旧claim/epoch，不用任何余量。新范围与许可先固定再请求；不追分、不F3、不合并main，不进入S11/G。**

当前发送前状态：用户已明确授权继续，累计1000调用/20RPM硬限，起始783/3080332；产品ac03448795232949a485b88f93305460c1476621已push，3 suites/26 tests通过。新范围最多72/Step18，许可与scope见acceptance§10.5/feedback§13，旧claim关闭保持。下一原CLI只执行F2校准/基线/证据核对并保存实际结果，不F3；本段为最新状态。
