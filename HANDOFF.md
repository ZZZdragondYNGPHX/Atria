# Live HANDOFF — Agent Intelligence Runtime

- Task ID: `agent-intelligence-runtime`
- Updated: 2026-10-09
- Checkpoint: 必要来源读取修复的有限周期保持结束；RP / Project 全领域扩展研究与差距分析完成，等待用户讨论确认方向，未冻结新Plan或开始优化。M1 pending，不集成，不进入S11/G。
- Product: `feat/agent-intelligence-runtime@a61b249ef71f108d279ec7bd883fb5eeae97a463`，实现及paid source已commit/push。
- Stable main: `ed1fd90521a63363e29856601abbf5e908c99d10`，未合并。
- Docs: 沿同一Plan/Record，执行前核对actual HEAD；五无关dirty docs保持，不提交它们。
- Read: 实际Git → [index](plans/architecture/agent-intelligence-runtime/index.md) → [M1 acceptance §9](plans/architecture/agent-intelligence-runtime/m1-acceptance.md) / [S10](plans/architecture/agent-intelligence-runtime/s10-evolution.md) → [同一Record最新周期/Final state](records/refactor/agent-intelligence-runtime.md)。不读写reference。
- 讨论材料：[RP / Project 领域扩展研究](plans/architecture/agent-intelligence-m1-domain-evolution-research.md)。该文是研究建议，不是新增authority或批准后的Plan模块。

## 当前研究 checkpoint

2026-10-09 领域扩展研究沿product a61b249ef、起始docs 6f1c18056完成。核对M1/S10/acceptance §9、S05及直接相关源码，再阅读GEPA/DSPy、RP-Bench、PHASE-Tree、NCP-Bench、Narrative State Tracking Agent、Novel Benchmark、judge偏差/校准与agent eval一手资料。报告包含已实现/计划/缺失矩阵、RP十三维与Project十一类质量、通用控制/领域模块职责、交叉冲突与回归、真实问题发现、根因路由、隔离与版本契约、成本/缓存方案；每项区分源码事实、Atria有限实测、论文实证、作者报告和待验证架构建议，并注明研究设置边界。

建议讨论方向：复用原Experience/evaluator/targets与authority；系统策略、角色成长、用户偏好与正式事实分别管理；先确认真实outcome/feedback供给、问题来源与评价可判别性，再决定领域pilot。Prompt/Context/state/runtime/evaluator根因与可写target分开，无M1 writer的修复转工程任务。GEPA搜索集合/Pareto成绩不能授予独立验收资格；新case按原episode/Project/派生任务分组隔离，不靠换名恢复盲性。文学、连续性与实际运行必须各有证据，不能用单轮文风/模型一致证明长期体验。

九项契约是供正式Plan讨论的预留建议，不已实施，也不自动扩大M1退出范围；M2/M3/G、训练/自由多目标搜索与额外writer延后。待用户确认真实来源及用途、首个pilot的时间尺度/关键维度、M1最小契约与后续分工、新case/rubric/calibration revision及有限发送范围，才正式开工。本轮零模型发送，761/2939582与原窗口保持，产品和批准后的Plan均未修改；文档最小检查及受保护字节核对见同一Record最新节。用户无需手测。

## 本周期实际结果

本机续接调研（2026-10-09）：用户说明手动以另一设备Document替换本地Document。初始本地product907cf/docs994c落后，远端只读核对为product a61b249ef/docs eec940273；fetch后仅fast-forward这两个任务工作树，未合并main。五无关dirty文件字节保护；迁移账本/quota/rate/transport/epoch均与最新private audit的SHA一致，761/2939582、492reported/17unknown74948、pending0/lock0保持。复制后目录755/配置644已仅恢复700/600，原Git exclude有效、无tracked私有文件、内容hash不变。本轮零模型请求。

调研待讨论：现有三个RP family使用相同场景/可见记忆，synthetic v2主要换姓名/场所/时间及少量指令，不足以支持新的真实任务泛化结论。Project简单rename/conflict/repair基线已成功；旧避读回归修复不等于优于基线。RP候选仍出现未给定当前时间/玩家身体细节；continuity偏好与delta冲突原样保留。Experience已有host outcome入口、feedback/diagnosis唤醒及弱观测方向约束；定向代码检索未找到常规运行结束自动提交Experience outcome的调用，需讨论真实反馈供给的范围，不能将fixture代理写入的explicit反馈外推真人意见。建议先固定任务来源/可观察失败，按原始episode/Project分组隔离development与未见验收，沿原Experience/evaluator/targets；具体范围、case revision和预算等待用户确认。研究依据及讨论选项见同一Record末节；旧v1不重跑追分，原门槛保持。

原Experience、owner/scheduler、evaluator/targets、compiler/resolver/provider、CAS/intent/receipt及原消费/rollback仍为authority，无新有效配置authority。提炼继续局部edits，明确tool schema不等于已取得完整authoritative source，不能压掉必要来源读取。公开technical反馈/诊断由agent依据已保存的synthetic development生成，不冒充真实用户反馈或human preference。

每入口只提炼一个新候选，保留原base；RP正文hash `75e6de6acd5bad8f85b0040cebe2bbd9b64b96a354a415d705cec092928b2d87`、Project `d30a6ddc2eb812c5e6fcf802ec7caacf2f2baf7787a4ae031e359591128ab479`。Paid run `run-1791509036919-99e55d4c`：每入口三个development pair、双模型观察完整，12 actual arms全部权限/隔离/版本消费及原case checks通过。

- RP primary candidate/tie/candidate，Step tie/candidate/candidate；一致候选胜1/3，两分歧，variant primary continuity=-1/Step+2。偏好/负差原样保留，developmentReadiness=false，不重试追分。
- Project双模型三tie/各维度0，developmentReadiness=false。authoring两arm完成修改/review，candidate原get_project→plan/save/review，避读回归此次未再出现；conflict两arm保留原human revision conflict；repair两arm一轮修复并review。原基线在三个简单目标已满足要求，新增必要读取规则未显示被行为维度认可的收益。评价已包含公开tools/plan/status/source/validation/repair，不能把省token换成行为胜或改旧九tie解释。
- Step六次真实独立评分成功。显式有限许可由上一评分形态成功诊断及用户继续授权固定，消耗6/24；原七stopped窗口/全部recent、consecutive/epoch与费用保留，不清stop、不自动restart。任何新Step错误/incomplete撤销许可且无retry；重复development已拒绝。Production human/price/budget gates、humanPreference=not_observed及price unavailable保持。
- 未取得候选冻结资格，不运行新v2各九对、publication/next-run/rollback。正式每入口九对/至少六一致candidate胜/其它tie/重要维度非负及原闭环门槛保持。原cf九对/Step18/cf-c0闭环只保留历史；旧RP3/9一致胜、Project9tie仍M1不通过。

## 账目与来源

同一累计 **761 requests /2939582记账tokens**，本次+59/+218466；carry252/1000000与sticky breach保持。509恢复actual sends，492reported/17unknown74948，无新增unknown，pending0/lock0。quota carry332+429=761，59 owner attempts逐项匹配shared；minimum3151ms、一分钟峰值11、保守rolling24h峰值761，2000/20硬限通过。token建议超额已通知并继续，不是停止原因。

Paid evaluator revision `c46a3200099fa2dfa68e816c315a82e423c9404aa521c1b103b5d590f3bc1b6c`；case set `49c56c12126aff08c83465f83412d2acb2aa6417e4183b25d7cbebe59f63b54b`。v1已经用于诊断和修改，不可冒充未见验收；v2未输入提炼且本轮未执行。合成case只证明有限工程实验，不声明真实用户泛化或持续自迭代已验收。旧报告/候选/partial/负差均独立保留，private Document/凭证仍Git exclude，私有路径/endpoint/key不入公共Git。

Summary byte SHA256 `731a9c0b019fafc631b3e35a117bea035d1259cbcbb37d34314229c707e0a5c2`，private audit `b046e98e1dc174e7d28f841e148ff534d4168e7ecedf8d3281c667602ae316a3`。详细charges/raw/提案/fixtures和文件hash见同一Record/私有audit。

## 最小验证与接手

4 relevant suites/24 distinct tests通过：retry/有限续接11、局部edits4、原worker development选择/免费challenge3、development/engineering gates6；触及syntax/ESLint/diff通过。结束零send acceptance拒绝cycle_development_gate_failed，重复development拒绝step_continuation_already_used_or_failed，五累计文件byte SHA不变、lock0。五无关dirty docs hashes保持，无full/build/CI/UI/Android/外部DB。

用户准备在另一台设备先调整方向、让AI调研再优化。下一先界定真实任务/反馈和行为失败，再正式固定新的代表性case revision、development/独立验收隔离与有限范围；不要反复重跑已用synthetic:v1，不降原门槛，不伪造人工观察。M1仍pending，main不合并，不进入S11/G，用户无需手测。

私有迁移包已逐文件SHA核验并包含3914个当前Document文件、五dirty docs原件和Atria-Dev完整Git历史bundle；bundle旧Document不能代替当前761账目，恢复时以包内最新Document覆盖旧Git快照的Document，新设备重绑local Git keys/ACL。用户明确指定的GitHub ZZZdragondYNGPHX/Atria-Dev已在账户授权后删除（delete exit0/同账号GET404），产品仓库Atria仍可访问，本机私有副本和包保留；详见同一Record/包内PORTABLE-HANDOFF。无新增模型请求。

接手提示词：**先核对actual Git与迁移后的私有Document/账本，再读docs:HANDOFF→M1 acceptance §9/S10→同一Record及链接的领域扩展研究，沿761/2939582 ledger/quota/rate/windows。产品a61b249ef，main未合并。RP一致胜1/3且分歧/continuity负差，Project三一致tie但原目标/guards完整，Step六真实grade成功，旧stop保留；本有限周期已结束。RP/Project全领域研究已完成，先与用户讨论来源、首个pilot/根因路由、M1契约与后续分工、新case/独立隔离及有限范围，确认后再正式更新Plan和开工；不要重复调研或自动实施研究建议，不把合成v1当真实用户或未见验收。保持原Experience/evaluator/targets与authority、每入口九对六一致胜/其它tie/重要维度非负及原消费/发布/回滚门槛，最大输出8000，API仅2000/day和20RPM硬限，所有失败/未知usage照记；token建议超额通知后继续，只最小相关本地验证，不要求用户手测、不进入S11/G。**
