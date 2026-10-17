# D9 E1 — 当前后端 Gate 与阶段核销

## 当前基线与执行分工

2026-10-17 工程收敛从源码 `75c6a676c` / docs `94272a03a` 开始；已提交源码 `16ce2d1fe`、`18baf306f`。后续真实 Fanout 和 Project 提交消费者仍在实施，工作树并非交接 clean。详细实施与分次验证唯一归[同一 Record](../../../records/refactor/atria-native-orchestration-v3.md)。本表描述当前验收状态，不将历史测试累计为当前版本整套通过。

执行顺序和两次交接条件只引用[实施分工](implementation-plan.md#2-执行分工与两次交接)：Codex 完成 P1–P4 后端 → Claude Code 完成 P5 前端与组装 → Codex 执行 P6 硬切、清退与最终验证。当前不提前前端、P6、合 main 或结束分支。

**P3 端口生产缺口已实现，Gate = VERIFICATION_PENDING；P4 = IN_PROGRESS；后端首次交接与最终产品 Gate 均未通过。** 真实 Fanout 正在补同 Root 并发准入/落账的必要验证与修正，不能在修改途中提前核销。Record 第四十四组已经进入 P4，后续组数不代表全部属于 P3。历史事实保留在 Record，不恢复为当前阻塞。

## P3 — Native Ports & Budgets

依据：D4/C2、D5/F2、D6/S2 及接口合同 §8.2；范围与停止条件归[实施方案 §6](implementation-plan.md#6-p3-收敛边界与结束条件)。每行核销须同时具备生产入口、原权威与银行、真实 receipt/Result 关联、对应源码版本验证；adapter 或注入式测试本身不构成生产支持。

| 闭环 / 原权威 | 当前生产能力与证据入口 | 剩余必需行为 / 当前 Gate |
| --- | --- | --- |
| Source / 原 Session、Project、RP authority | 三域 Source、原银行、原 Context/Hybrid、显式父子 Message Source pins、发送/消费撤权复验及恢复准入已接；[接口 §18](interface-contracts.md#18-工程收敛后的端口合同)，分次四Engine证据见 Record | 已实现；末版共享并发改动后核销相邻闭环，父私密 Memory 不继承 |
| Model / 原 GenerationHost、RouteResolver、原银行 | RP、Session Narrator/Resolver、Project 实际 retry/fallback 与逐候选owned pin、稳定send ordinal、unknown保留已接；Reuse/continuity由原能力承载 | 三域分次FS/SQLite/MySQL/PG通过；真实Fanout暴露同Root CAS竞争，沿原短临界区修正与验证中；VERIFICATION_PENDING |
| Delegate / 原 Scheduler、Source、Context、原银行 | brief-only 和显式双边owned Source、typed Result/Output、reservation关闭、durable return、父接收方重验已接 | 显式Source/Result生产闭环已验证；不强制子检索，不声称全部业务角色组合或任意父流程冷恢复 |
| Tool / 原 Skill、MCP、A2A、Secret/Egress authority | 真实原Session/Skill Source → published Plan/pin → 私有producer → Effect/ToolPort → 原receipt/bank → typed Result；HTTP prepare/dispatch/observe/consume与cold新接收授权已挂载 | FS/SQLite及MySQL/PG实际消费者/HTTP证据已取得；A2A受理保持unknown，无假远端完成；末版相邻验证后核销 |
| 审批 / 原账户、Review Origin、原领域 writer | Review Origin、再认证、一次批准及有限 Project metadata Commit 已接（接口 §17.138） | 保留批准绑定、重放拒绝与原 Port Gate；实际 Browser 和跨端隔离验证归 P5/最终验收，不能因此把后端已实现描述为未实现 |
| 恢复 / Host Ledger + 原 Source/银行/receipt | 原Project Commit ready无claim可同Effect重新准入、当前epoch及新Origin批准；cold Tool Result重新接收授权；dispatching/unknown只观察/reconcile | 有限恢复与原银行/收据四Engine分次通过；不以“完整release”或全部业务流程自动续跑扩展P3 |

## 阶段分账

| 阶段 | 当前能力与尚需核销的边界 |
| --- | --- |
| P1/P2 | Host/Plan/Run/Graph/Effect/审批基础已被真实消费者使用；真实Fanout→Join实际接线和同Root并发修正在执行。只按已证实策略核销，不据all-success推导所有Join策略/整个G2 PASS。 |
| P4 / W06–W07 | RP/Session正式输出、后台Task/Actor appraisal、Project多轮/工具/Review、有限正式Commit、Plan Prompt/原自动evaluation已实现。当前明确关键路径为真实Fanout结果消费，以及原Project声明式叙事修改的Review→批准→Apply。原Eval质量/价格不足必须拒晋升；不能另建质量authority或将NOT_RUN涂绿。完整业务语义不能塞回P3内核。 |
| P5 / W08 | Claude Code 完成真实页面、Graph/List/Inspector、可信批准界面及前后端组装；后端缺口由 Codex 修复。 |
| P6 / W09 | 组装回交后由 Codex 原子硬切并清退旧编排入口/配置/资产/专用测试；不保留兼容路径，不提前删除仍有业务用途的共享服务与未知效果/费用历史。 |
| 最终验证 / P7 → P8 | installed Host+Browser、Windows/Linux/Termux、声明支持的 Engine、必要外部服务/性能/人工质量按原验收取得证据；不是全部倒挂为 P3 端口 Gate。尚未取得的证据保留 NOT_RUN/BLOCKED，完成整体核对后才处理集成收尾。 |

## 验证口径

共享 Port 不变量集中覆盖；不同业务权限/正式 writer 边界保留真实消费者验证。撤权、CAS、并发预约、取消、ACK-loss、unknown、冷恢复和费用保留不可裁减。各 Engine 按其持久化和一致性差异取得证据，不把 FS/SQLite 当作 SQL 通过。

最终核销冻结源码字节并运行与改动相符的闭环矩阵；修改、失败或未解决风险才触发相关重跑。测试数量、任务组数、文档长度和所有假设性组合均不构成 Gate。真实 Provider 未报 usage/价格或 continuation 状态时如实 unknown/miss/reset；不得伪报零费用或实际 cache 命中。测试 API 配置与限流只引用 Governance §13.1，不新增硬上限。
