# D9 E1 — 当前后端 Gate 与阶段核销

## 当前基线与执行分工

2026-10-17 工程收敛从源码 `75c6a676c` / docs `94272a03a` 开始；后端源码冻结于 `01ef2053b`。单Host/端口/预算/恢复、正式消费者、五种Join策略、Session失败终结及SQL检索目录缺口均已取得对应版本证据。详细实施、失败与分次验证唯一归[同一 Record](../../../records/refactor/atria-native-orchestration-v3.md)。本表描述当前验收状态，不将历史测试累计为当前版本整套通过。

执行顺序和两次交接条件只引用[实施分工](implementation-plan.md#2-执行分工与两次交接)：Codex 完成 P1–P4 后端 → Claude Code 完成 P5 前端与组装 → Codex 执行 P6 硬切、清退与最终验证。当前不提前前端、P6、合 main 或结束分支。

**P3 Gate = PASS（`01ef2053b`）；P1–P4 后端首次交接 Gate = READY_FOR_P5；最终产品 Gate = NOT_READY。** `581dc9f44` 的共享Result/Source矩阵通过后，实际SQL检索消费者发现目录接线缺陷，已用原Host生命周期修复并补MySQL/PG正常与失败路径；没有靠夹具伪装属性或后移已声明端口需求。五种Join策略与Session失败终结已按P2/P4完成，不据此宣称任意业务图全组合或最终质量合格。Record第44组已进入P4，后续组数不代表全部属于P3。

## P3 — Native Ports & Budgets

依据：D4/C2、D5/F2、D6/S2 及接口合同 §8.2；范围与停止条件归[实施方案 §6](implementation-plan.md#6-p3-收敛边界与结束条件)。每行核销须同时具备生产入口、原权威与银行、真实 receipt/Result 关联、对应源码版本验证；adapter 或注入式测试本身不构成生产支持。

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
| P5 / W08 | Claude Code 完成真实页面、Graph/List/Inspector、可信批准界面及前后端组装；后端缺口由 Codex 修复。 |
| P6 / W09 | 组装回交后由 Codex 原子硬切并清退旧编排入口/配置/资产/专用测试；不保留兼容路径，不提前删除仍有业务用途的共享服务与未知效果/费用历史。 |
| 最终验证 / P7 → P8 | installed Host+Browser、Windows/Linux/Termux、声明支持的 Engine、必要外部服务/性能/人工质量按原验收取得证据；不是全部倒挂为 P3 端口 Gate。尚未取得的证据保留 NOT_RUN/BLOCKED，完成整体核对后才处理集成收尾。 |

## 首次后端交接与停止条件

`01ef2053b` 的已冻结后端范围无已知实施阻塞：每项必需端口有生产入口、原权威/银行、可信receipt/Result和必要验证；明确剩余消费者闭环已完成。当前合理停止后端扩展并进入Claude Code P5，不能再因未声明的理论全组合、新微小边界或测试数量重开阶段。组装若发现真实权限、一致性、冻结合同或消费者缺陷，仍由Codex修复。

P5真实Browser/可信批准展示与组装、P6原子硬切/旧链清退、Windows/Linux/Termux组装后验证、必要性能/人工质量和最终集成仍未完成。原Evolution独立质量来源/真实价格不足时拒晋升，eligible自动晋升仍NOT_RUN；opaque cache/continuation/价格按原证据unknown/miss/reset。它们不伪记通过，也不由前端补造后端权威。R3无独立原生防线仍按冻结D6默认拒绝。

## 验证口径

共享 Port 不变量集中覆盖；不同业务权限/正式 writer 边界保留真实消费者验证。撤权、CAS、并发预约、取消、ACK-loss、unknown、冷恢复和费用保留不可裁减。各 Engine 按其持久化和一致性差异取得证据，不把 FS/SQLite 当作 SQL 通过。

最终核销冻结源码字节并运行与改动相符的闭环矩阵；修改、失败或未解决风险才触发相关重跑。测试数量、任务组数、文档长度和所有假设性组合均不构成 Gate。真实 Provider 未报 usage/价格或 continuation 状态时如实 unknown/miss/reset；不得伪报零费用或实际 cache 命中。测试 API 配置与限流只引用 Governance §13.1，不新增硬上限。
