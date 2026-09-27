# 边界与回归矩阵

| 面向 | 应显式设计 | 必须保留的边界 |
| --- | --- | --- |
| Information / P6 | 谁能看哪种 projection、向哪个 Task/Actor 暴露哪些字段 | 存储、display、context 独立；Truth、Belief、正文不互相冒充 |
| Rollup / P6 | 来源、覆盖范围、staleness、重新生成条件 | 摘要不能变成原始事实；Open Loop 不等于 Memory |
| Content / P7 | 精确 Base 版本、贡献来源、依赖闭包、portability | Add-on 不覆盖不可变原件；Community proof 不凭文件名或“最新”代替 |
| Player / P7 | grant、lineage、reservation、receipt、容量/字节预算 | Player 独立于 Session；恢复 Session 不回滚 Player |
| Shared / P8 | seat→Actor、scope、projection、principal、ACL epoch | 一份 canonical Session Truth，多视角；Host RNG；all-required submit-once 后 Host commit/cancel |
| Realm / P8 | 独立 revision、typed command、transfer 阶段 | Session↔Realm 与 Session↔Player 是不同 Saga；无直接 Player↔Realm 事务 |

## 设计跨账本流程

读取 `continuity` 或 `shared` 的实际 action schema。用 prepare/resume/cancel 等已提供 typed 通路，并在提案中指出 publication 前后的取消界限。重启从 durable receipt/lineage 恢复；不能通过恢复 Session 快照重置外部余额、reservation 或 ownership。prepared-transfer interlock 不应被 UI 绕过。

## Shared 视角

principal 由认证来源确定，不相信请求正文里的自称身份。变更席位/权限必须按现有 ACL epoch 处理。投影只给授权字段；Private Play conversation/composer 不可搬到远端共享视图。连接与 refresh/presence 是显式行为，不宣称公共发现、分布式共识或 lobby 已实现。

## 测试取舍

为本次修改加入最小 recorded Scenario：权限拒绝、重复输入、过期 revision、部分 transfer 重启、publication 后 cancel 拒绝、恢复 Session 后外部账本不倒退。fixture principal 仅用于本地隔离测试，不能被当作生产认证。复杂声明先读完整 catalog 校验器再写，不复制与本作品无关的大段运行时模板。
