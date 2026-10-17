# D9 E1 — 当前后端 Gate 与阶段核销

## 当前核销（2026-10-18 独立复核与 P6 checkpoint）

本轮从源码 `94d677c6d` 恢复；历史 `01ef2053b` 的 `PASS / READY_FOR_P5` 仅说明当时有限端口/消费者的交接证据，**不能作为原始 D1–D8 / P1–P4 全量完成证明**。本轮依用户明确要求作独立只读复核，原冻结合同未降低或重写。实际修改、失败、分次验证及最终源码 pin 见[同一 Record](../../../records/refactor/atria-native-orchestration-v3.md)。

**原始 P3/P4 = IN_PROGRESS；已验证的有限 Profile / Port 不变量保留各自证据；P5 六项后端问题已修复并完成相关回归；P6 = IN_PROGRESS（旧执行链已在工作分支移除，测试/文档/完整替代仍在核对）；最终产品 Gate = NOT_READY。**

| 原冻结要求 | 真实实现 | 当前结论与剩余项 |
| --- | --- | --- |
| D2 唯一 Host、Source、Run/Effect/Receipt | 复用原存储/领域权威、CAS/epoch、银行、unknown 收据；非 Browser writer | 已有实现与必要专项证据，不能推导任意业务图均支持 |
| D3 Graph/Planner/Judge/Review | GraphPatch/失效/重做核心存在；RP 已新增非入口/多个及零 Planner 的 Agent DAG、通用 Review/Judge；Project 多 Planner/多目标 Review、实际 Fanout/Join 与三候选 Judge→Review→正式工具已有实际消费证据；其余控制分支仍有固定 Profile | **受限支持**；通用可组合生产图不能核销 PASS，新组和失败核销逐次见 Record |
| D3 Delegate/Join | 原 Scheduler/子预算/Source pins/return、五种 Join/partial/late/fail_fast 已有真实 RP 消费者；Session 纯 Agent 子 DAG 的 Handoff 与显式 Delegate 已有 FS/SQLite 实际消费、冷读与费用证据 | **受限支持**；Session 子图尚不含控制/循环，Project Delegate 未实现；不自动扩展为各业务同等支持 |
| D4 / D7 角色独立 Audience 的 RP 协作 | 正在补原 Session Information/Actor 精确 Context pin、独立 capture/编译/原 Hybrid 与逐接收方 Result 传播；不继承 Narrator-wide history/Skill，无传播证明只返回引用 | **进行中，未核销 PASS**；末版角色/并行/撤权及相关回归归同一 Record，不能由后台 appraisal 或 same-audience DAG 代替 |
| D7 条件 Game/Project 协作 | Game Actor DAG、Planner/实际 GraphPatch、原 Review、多组 Fanout/Join、同 Actor 纯子 DAG Delegate/Handoff 已接原 Session/Model/银行/单 Output；Project 纯 Agent/多 Planner/多目标 Review DAG、Fanout/Join 与 Judge→Review→原工具→人工 Review 已有实际消费证据 | **原合同仍未完整实现**；Game 一般循环/分支 DAG、子图控制，Project Delegate、Fanout scope 内控制及跨控制组合仍待补；不能把有限组合或 RP 控制节点测试跨领域核销 |
| D3/D6 可验证边界恢复 | ready 无 claim Commit 重新准入、cold Result 新授权消费、unknown 查询/reconcile | 有限恢复符合冻结要求；不额外要求所有内存阶段自动恢复 |
| D7 正式 Project 写入 | V3 有限已分类可信 Commit；原完整 Studio 人工审阅/Commit 领域路径保留 | **受限支持**；不得误删原领域能力或伪称所有 V3 修改类型已支持 |
| D5/D7 Evolution/Skill | Native Plan 与原 Project 目标、真实 RP scoped Skill Context/预算/漂移拒绝及真实 Host 消费→原 Output 成功 activation 观察已接；历史评测已迁真实 Native 请求/Plan/恢复 | 原独立质量/价格不足拒晋升；eligible 自动晋升仍 NOT_RUN；宽矩阵与最终定向证据分账归同一 Record，未称末版完整宽矩阵单轮全绿 |

执行分工保留[实施方案 §2](implementation-plan.md#2-执行分工与两次交接)。用户已从安全 checkpoint 明确要求继续；唯一 HANDOFF 保留该中断快照，恢复后的进度归同一 Record 与真实 Git，不把历史停止记录恢复为新限制。未合 main、未结束任务分支。

## P3 — 已验证端口子集（非原始阶段全量完成）

以下保留历史有限闭环证据；原始能力未完成项以上表为准，不能被本表的局部PASS覆盖。依据：D4/C2、D5/F2、D6/S2 及接口合同 §8.2；范围与停止条件归[实施方案 §6](implementation-plan.md#6-p3-收敛边界与结束条件)。每行核销须同时具备生产入口、原权威与银行、真实 receipt/Result 关联、对应源码版本验证；adapter 或注入式测试本身不构成生产支持。

| 闭环 / 原权威 | 当前生产能力与证据入口 | 剩余必需行为 / 当前 Gate |
| --- | --- | --- |
| Source / 原 Session、Project、RP authority | 三域 Source、原银行、原 Context/Hybrid、显式父子 Message Source pins、发送/消费撤权复验及恢复准入已接；[接口 §18](interface-contracts.md#18-工程收敛后的端口合同)，分次四Engine证据见 Record | PASS；Source授权/共享并发与SQL Context实际目录/Secret/index接线均有证据，父私密 Memory 不继承 |
| Model / 原 GenerationHost、RouteResolver、原银行 | RP、Session Narrator/Resolver、Project retry/fallback与逐候选owned pin、稳定send ordinal、unknown保留；Reuse/continuity由原能力承载；同Root真并发、明确HTTP拒绝与已解析未消费响应事实均已接 | 三域及新terminal分次四Engine通过；费用closed独立、缺usage仍unknown，transport/timeout/parse/伪造或混合未知链不造明确失败；末版共享验证已通过 |
| Delegate / 原 Scheduler、Source、Context、原银行 | brief-only 和显式双边owned Source、typed Result/Output、reservation关闭、durable return、父接收方重验已接 | 显式Source/Result生产闭环已验证；不强制子检索，不声称全部业务角色组合或任意父流程冷恢复 |
| Tool / 原 Skill、MCP、A2A、Secret/Egress authority | 真实原Session/Skill Source → published Plan/pin → 私有producer → Effect/ToolPort → 原receipt/bank → typed Result；HTTP prepare/dispatch/observe/consume与cold新接收授权已挂载 | FS/SQLite及MySQL/PG实际消费者/HTTP证据已取得；A2A受理保持unknown，无假远端完成；末版相邻验证已通过 |
| 审批 / 原账户、Review Origin、原领域 writer | Review Origin、再认证、一次批准及有限 Project metadata Commit 已接（接口 §17.138） | 保留批准绑定、重放拒绝与原 Port Gate；实际 Browser 和跨端隔离验证归 P5/最终验收，不能因此把后端已实现描述为未实现 |
| 恢复 / Host Ledger + 原 Source/银行/receipt | 原Project Commit ready无claim可同Effect重新准入、当前epoch及新Origin批准；cold Tool Result重新接收授权；dispatching/unknown只观察/reconcile | 有限恢复与原银行/收据四Engine分次通过；不以“完整release”或全部业务流程自动续跑扩展P3 |

## 阶段分账

| 阶段 | 当前能力与尚需核销的边界 |
| --- | --- |
| P1/P2 后端 | Host/Plan/Run/Graph/Effect/审批基础及GraphPatch/Planner/Judge/Review/有界重做、Delegate/Handoff已由真实消费者使用；五种Join与fail_fast同机制接通。末版Join/Fanout SQL36项整轮通过，FS/SQLite36项分次通过；共享控制/输出和原Planner/Judge/Review相邻验证完成。支持范围按原有限profile/owned pins与接口§18，不推导任意嵌套/跨领域图或串行Evolution worker支持Fanout。 |
| P4 / W06–W07 | RP/Session正式输出、后台Task/Actor appraisal、Project多轮/工具/Review、有限正式Commit、Plan Prompt/原自动evaluation已实现。同一已付费Model Task→Review→fresh批准→Commit→真实Package/Session消费已取得四Engine分次证据，原银行/预算不重置。Join early-close/partial/late全集费用、Session已知失败与unknown的原Attempt/Root终结已完成；零Result/World越权、cold不重发有证据。原Eval质量/价格不足必须拒晋升，不另建质量authority；完整业务语义不能塞回P3内核。 |
| P5 / W08 | 已完成并回交（`94d677c6d`）：Agents › Plans（Library、Graph/List/Inspector、Validate/Publish/冲突/未知、固定依赖、Binding）与 Agents › Runs（来源 Run 列表、RP 审阅启动、Timeline/Graph、费用/额度/诊断、取消/恢复/核对、Project commit 写入）、隔离 Review 文档与可信批准；真实 Host（模拟 Provider）桌面与模拟手机视口取证见 Record。本轮六项后端问题均已修复并有相关回归，含原 Task reviewHash 接口与真实准备可信提交 UI。真机、Linux/Termux、真实读屏/输入法、真实 Provider 与大图性能 NOT_RUN。 |
| P6 / W09 | IN_PROGRESS：旧四根、Browser capability/模式入口、旧设置与 Skill scope、专用资产/教程已清退；共享编译 helper、Memory、原数据/unknown 收据保留。完整替代、历史测试迁移与最终宽矩阵仍未核销。 |
| 最终验证 / P7 → P8 | installed Host+Browser、Windows/Linux/Termux、声明支持的 Engine、必要外部服务/性能/人工质量按原验收取得证据；不是全部倒挂为 P3 端口 Gate。尚未取得的证据保留 NOT_RUN/BLOCKED，完成整体核对后才处理集成收尾。 |

## 历史交接与当前剩余项

`01ef2053b` 的首次后端交接及 `94d677c6d` 的 P5 交接保留为历史事实；先前“明确剩余消费者闭环已完成”的概括已被上表限定，不能据此取消原始 D4/D7 能力。P5 修复不是原始全产品 Gate 通过。

本轮组装后 Linux scratch Host+Chromium 与桌面/模拟手机取得相应证据；Windows/Termux 真机、真实输入法/读屏、SQL 末版组装、必要性能/质量等未取证项仍 NOT_RUN。旧协议测试的迁移、宽矩阵失败与中断按 Record 如实记载，不通过删掉有效断言或把失败全归基线来核销。

## 验证口径

共享 Port 不变量集中覆盖；不同业务权限/正式 writer 边界保留真实消费者验证。撤权、CAS、并发预约、取消、ACK-loss、unknown、冷恢复和费用保留不可裁减。各 Engine 按其持久化和一致性差异取得证据，不把 FS/SQLite 当作 SQL 通过。

最终核销冻结源码字节并运行与改动相符的闭环矩阵；修改、失败或未解决风险才触发相关重跑。测试数量、任务组数、文档长度和所有假设性组合均不构成 Gate。真实 Provider 未报 usage/价格或 continuation 状态时如实 unknown/miss/reset；不得伪报零费用或实际 cache 命中。测试 API 配置与限流只引用 Governance §13.1，不新增硬上限。
