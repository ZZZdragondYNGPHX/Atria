# Live HANDOFF — Agent Intelligence Runtime

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`
- Updated: 2026-10-09
- Checkpoint: 一次有限M1优化周期结束；新Project8000提炼成功但未验证，新RP有development回归且缺独立观察，M1 pending，不集成。
- Product: `feat/agent-intelligence-runtime@f6ac0ff7e79c55674e3fe226d8a122c4af9acad4`，commit/push完成；接手核对actual refs。
- Stable main: `ed1fd90521a63363e29856601abbf5e908c99d10`，未合并。不进入S11/G。
- Docs: `docs`，本轮沿同一Plan/Record更新；执行前核对actual docs HEAD。
- Plan: [index](plans/architecture/agent-intelligence-runtime/index.md) → [M1 acceptance](plans/architecture/agent-intelligence-runtime/m1-acceptance.md) / [S10](plans/architecture/agent-intelligence-runtime/s10-evolution.md)。
- Record: [同一阶段记录](records/refactor/agent-intelligence-runtime.md)，阅读本轮2026-10-08—09段与Final state，不重复扫描旧结果。

## Current evidence

S01–S10工程交付保持；原Experience、owner budget/scheduler、原六类target、固定worker、原CAS/intent/receipt/recovery/rollback和共享面板仍为authority。单目标/支持矩阵/production human/price/budget gate保持，model observation不冒充humanPreference，currencyCost仍unavailable。原完整比较cf28、Project消费恢复c0f8、Step18观察907cf分别固定来源：RP双模型一致候选胜3/9，Project9tie，行为门槛未通过。原36arm检查及私有发布→实际下一run消费→rollback已完成，不能借给新候选。

本轮最小修复反馈→诊断→提炼指令，Project评分补原计划/状态/公开说明/工具/修复冲突轨迹，维度/解释/门槛不变。旧development证实RP臆测时钟/玩家心理，Project候选不有效且conflict回归；不是仅凭全平局调整解释。原Experience correction会pause，通过原configure重验同一target后提炼，未绕gate。

新RP只一次提炼，保留base后补时间/修订及玩家pause中立，body hash `e9ad8939cf49737ccd0c23ff7b4585bb45e02221a424fa033ee0f57757698fe1`。三development primary为candidate/baseline/candidate，variant continuity=-1，与偏好不一致照录；前两pair37e/第三9f分来源，6arm checks全部true，不拼同源host报告。Step新观察零有效，一次404。9f旧summary status误development_observed，实际incomplete，已在Record更正，原报告不覆盖。

新Project1024三次JSON截断按原频繁错误规则停止。用户明确提高输出最大8000后，Plan追加仅unfinished extraction补测；原compiler/provider/owner/shared账，持久8000输出窗口只针对实际配置变更，同配置restart不另开epoch。f6ac一次成功，finish_reason=stop，reported total1673，无retry。提案value hash `40744a932718465fbb10cb3f81625771c78ca4faa2aabb36e156d47b029924aa`，仅proposed/not_validated，base原文本未完整保留须进一步检查。当前comparison1024窗口与Step404仍stopped，没有新Project development/独立观察、没有新九对v2验收或新候选发布/消费/rollback，不冻结合格候选。

同一Plan已经正式隔离synthetic:v2 promotion与v1 development，同六场景家族/每入口三×三九对、至少六一致胜/其余一致tie/重要维度非负及原全部checks/闭环。已指导修改的development材料不能再当未见验收；v2本轮未发送，不降低门槛、不删失败案例、不追试有效负面/tie/uncertain。

## Accounting / execution

- 最新同一累计账：**647 requests /2483896记账tokens**，本轮新增92/356805；carry252/1000000与sticky breached历史保留。395 actual恢复sends，379reported/16unknown65117，pending0；失败与未知usage照实计账。
- Quota carry332+315admissions=647，minimum3151ms、一分钟峰值10、保守rolling24h647，2000/20硬限通过；92个本轮owner attempts与shared id/tokens一致，无reserved/lock0。建议预算超过已通知并继续。
- 当前primary comparison窗口连续3不完整/最近20中4失败stop；Step当前窗口一次404立即配置stop。旧Haiku500、Step503/1024截断、MiniMax国际401窗口全部保留。默认第二模型仍step-5-preview，MiniMax仅临时候补。不得清账/清窗口/自动换epoch或重试404追分。
- 私有migration目录已拉取并恢复当前Document，2700项内容hash核对。凭证/private state仅Git排除目录与当前用户ACL，local Git key指向现实际位置；无密钥、endpoint或私有机器路径入公共Git。完整restore/分支verify不冒称通过；详细audit/source/report在private Document，不覆旧文件。不读写reference。
- 提炼raw length意味着达到请求输出上限，HTTP200仍可能内容不完整；本次1024失败无完整reasoning breakdown，不推断内部usage分项。Step404未保存body，只确定HTTP404，未确定具体model/channel/gateway原因。
- test CLI `tests/agent-intelligence/m1-live.mjs`；本轮partial/来源manifest与未验证Project提案均独立保存。后续请求遵守用户最大8000，旧8192独立评分只作历史。production/native comparison1024未扩大；新envelope须先正式Plan冻结配置/source，不借输出变更解锁404。

## Validation / next checkpoint

最小相关本地7suite64 distinct tests按source通过，包含原consumer/acceptance/evolution/retry、body timeout、unfinished development selection与8000原provider资金结算/窗口保持。触及lint/syntax/diff通过；6c零send prepare仅证明快照准备合法，四累计文件hash不变。不运行full tests/build/CI、新UI/Android/真机，不让用户手测。五项无关dirty文档hash保持，不提交无关修改。

本轮停止，M1未达标不合并main，不进入S11/G。下一需在新明确有限周期处理Step404真实诊断与comparison停止配置，保留已有效不利development评分；核对两个提案的base保留及可信收益/回归后才冻结新候选，再完整每入口九对/双模型/闭环。不重复旧结果取得资格。

接手提示词：**先核对Git，再读docs:HANDOFF→同一M1 acceptance/S10→同一Record最新周期；沿647/2483896累计账、quota/rate/失败窗口。保留新RP一次候选及有效development评分、新Project8000未验证提案和全部失败来源；先定位Step404实际配置/错误body及comparison停止问题，不清窗口、不自动换epoch、不追分。新请求最大8000；若改实验envelope先正式更新同一Plan，development与新独立九对严格隔离，原权限/消费/发布/回滚与行为门槛不变。只做最小相关本地验证，不要求用户手测，不进入S11/G。**
