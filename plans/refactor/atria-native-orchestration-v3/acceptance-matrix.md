# D9 E1 — 当前后端 Gate 与阶段核销

## 当前基线与执行分工

2026-10-17 工程收敛基线：源码 `75c6a676c`，docs `94272a03a`；两工作树 clean，已 fetch。详细实施与分次验证唯一归[同一 Record](../../../records/refactor/atria-native-orchestration-v3.md)。本表描述当前验收状态，不将历史测试累计为当前版本整套通过。

执行顺序和两次交接条件只引用[实施分工](implementation-plan.md#2-执行分工与两次交接)：Codex 完成 P1–P4 后端 → Claude Code 完成 P5 前端与组装 → Codex 执行 P6 硬切、清退与最终验证。当前不提前前端、P6、合 main 或结束分支。

**P3 = IN_PROGRESS / Gate = NOT_READY；P4 = IN_PROGRESS；后端首次交接与最终产品 Gate 均未通过。** Record 第四十四组已经进入 P4，后续组数不代表全部属于 P3。此前基于第五至第三十三组的旧缺口表已由下表替换；历史事实保留在 Record，不恢复为当前阻塞。

## P3 — Native Ports & Budgets

依据：D4/C2、D5/F2、D6/S2 及接口合同 §8.2；范围与停止条件归[实施方案 §6](implementation-plan.md#6-p3-收敛边界与结束条件)。每行核销须同时具备生产入口、原权威与银行、真实 receipt/Result 关联、对应源码版本验证；adapter 或注入式测试本身不构成生产支持。

| 闭环 / 原权威 | 当前生产能力与证据入口 | 剩余必需行为 / 当前 Gate |
| --- | --- | --- |
| Source / 原 Session、Project、RP authority | 三域 Source、原银行、原 Context/Hybrid、Model send 及撤权/当前性复验已接；[接口 §17](interface-contracts.md#17-实施证据)，精确版本见 Record | 与显式子任务授权及恢复重新准入结合核销；IN_PROGRESS |
| Model / 原 GenerationHost、RouteResolver、原银行 | 原真实发送、稳定 ordinal、费用观察、unknown 和多种真实 producer 已接 | 失败 fallback 的生产接线；retry、Reuse、continuity 分项按原能力证明支持或合法 miss/reset/unknown，禁止以统一禁用替代冻结合同；IN_PROGRESS |
| Delegate / 原 Scheduler、Source、Context、原银行 | brief-only 子 Model、typed Result/Output、reservation 关闭、durable return、父接收方重验已接（接口 §17.49–53、§17.137） | 显式获准 SourceRef/ResultRef 传播与合法读取；不复制父 Context/Memory，不强制所有 child 检索；IN_PROGRESS |
| Tool / 原 Skill、MCP、A2A、Secret/Egress authority | ToolPort 原协议 adapter、安全检查、原银行与收据测试存在 | 已承诺受限能力的 Plan/pin 发布 → 可信 producer grant → Effect → ToolPort → 原 receipt/unknown 生产链尚未挂载；IN_PROGRESS |
| 审批 / 原账户、Review Origin、原领域 writer | Review Origin、再认证、一次批准及有限 Project metadata Commit 已接（接口 §17.138） | 保留批准绑定、重放拒绝与原 Port Gate；实际 Browser 和跨端隔离验证归 P5/最终验收，不能因此把后端已实现描述为未实现 |
| 恢复 / Host Ledger + 原 Source/银行/receipt | recover 更新 fence/epoch、失效旧批准，冷观察及部分原领域 reconcile、费用与未知效果保留已接 | 明确无 dispatch claim 的 Effect 在当前 Host 新授权后继续；已有 Result 新接收权限消费；可能发出的操作只观察/reconcile；IN_PROGRESS |

## 阶段分账

| 阶段 | 当前能力与尚需核销的边界 |
| --- | --- |
| P1/P2 | Host/Plan/Run/Graph/Effect/审批基础已被真实消费者使用；不据局部证据宣称全阶段 PASS。恢复状态转换缺口合入 W02/W03，不另造执行器。 |
| P4 / W06–W07 | 有限 RP、Session 正式输出与费用闭包、后台 Task/Actor appraisal、Project 多轮/工具/Review、有限正式 Commit、Plan prompt/有限 evaluation 已实现；完整消费者及原 Eval/晋升等后端要求按已有模块逐项核销，不再写“其它领域/通用组合”作为无限队列。完整业务语义不能塞回 P3 内核。 |
| P5 / W08 | Claude Code 完成真实页面、Graph/List/Inspector、可信批准界面及前后端组装；后端缺口由 Codex 修复。 |
| P6 / W09 | 组装回交后由 Codex 原子硬切并清退旧编排入口/配置/资产/专用测试；不保留兼容路径，不提前删除仍有业务用途的共享服务与未知效果/费用历史。 |
| 最终验证 / P7 → P8 | installed Host+Browser、Windows/Linux/Termux、声明支持的 Engine、必要外部服务/性能/人工质量按原验收取得证据；不是全部倒挂为 P3 端口 Gate。尚未取得的证据保留 NOT_RUN/BLOCKED，完成整体核对后才处理集成收尾。 |

## 验证口径

共享 Port 不变量集中覆盖；不同业务权限/正式 writer 边界保留真实消费者验证。撤权、CAS、并发预约、取消、ACK-loss、unknown、冷恢复和费用保留不可裁减。各 Engine 按其持久化和一致性差异取得证据，不把 FS/SQLite 当作 SQL 通过。

最终核销冻结源码字节并运行与改动相符的闭环矩阵；修改、失败或未解决风险才触发相关重跑。测试数量、任务组数、文档长度和所有假设性组合均不构成 Gate。真实 Provider 未报 usage/价格或 continuation 状态时如实 unknown/miss/reset；不得伪报零费用或实际 cache 命中。测试 API 配置与限流只引用 Governance §13.1，不新增硬上限。
