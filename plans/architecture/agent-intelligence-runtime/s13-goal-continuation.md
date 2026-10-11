# S13：事件、durable intent与原调度消费者

## 支持矩阵与有限出口

依赖S11/S12。Goal只是固定的用户契约；自动消费者每次走S12当前Source核验，Actor desire不获得用户执行权限。沿原TaskScheduler、Project Task公开conversation/attempt/tool幂等、Native lifecycle outbox与原Host发送/Run-Task charge，不新增sender、账户费用账本或后台timer。

| 路径 | 本组绑定与执行 | 边界 |
| --- | --- | --- |
| Project | 明确绑定同Project、同exact intent/current base的一个原持久Task；原Task存durable wake、claim与结果，固定Goal与预算；原Studio上下文/tools/Skill和Host loop执行；Review交给原人工Commit | 一旦结果/观测不能确定，保留unknown并阻断自动重发；不自动rebase/创建新Task/new bank或commit |
| Native RP | 只接作品已有的声明Task/lifecycle intent与原Run；目标核验/事件触发沿原Lifecycle scope/currentness与TaskScheduler；不凭Goal文本编造Package任务或World写权限 | 无现有获准consumer的Goal仅等待原用户/作品事件，不发隐藏模型；预算继承/旧费用不能证明时拒绝自动续跑 |
| Ordinary RP | 原Agenda/Director作为客户端消费者；durable用户事件与当前Goal投影可在Host/客户端存活时继续，Source adapter仍是唯一证据读取 | 未接Host执行的旧路径不能假称关闭应用期间自主唤醒；不借M1 Evolution额度或新增发送器 |

## 预算、恢复与用户控制

已有Goal声明额度只能收紧原Run/Task bank。允许在原authority持久绑定limits而不伪造send/usage；实际Goal proof/Skill/Context/模型工作仍在工作前准入与cost-only settle。Wake/event identity有界幂等，重启读取原pending/claimed状态；已发但未确认结果不是免费可重试。goal/task/scope暂停、取消、takeover或terminal时停止相关工作；并发claim不能多花额度。不得把metadata状态或Task finished当Goal完成。

只做本组最小FS/SQLite消费者/并发/恢复/取消/预算耗尽及原scheduler/currentness checks；外部API0，loopback只证明执行与账本。S14再交付双入口体验；G06/M8/HM2真实出口保持pending，M3不跳过。

## 当前实施

Project 有限消费者已在 `fdea2011b` 接入并推送：同 Task bank、durable wake/claim、无重复发送、独立 Node claimed 恢复拒绝、排队失效和暂停保留费用。RP 后续显式用户/作者事件及 context 投影见 [S14](s14-goal-experience.md)。Native Goal 只沿既有作品 Task/lifecycle 产物的 context grant 核验，不从目标文本创建隐藏发送、新 Run 或 World 命令；未具备原获准 consumer 时继续等待原事件。Project 自动执行与 RP 手动证据管理的预算边界保持分开，不将后者宣称自动续跑或全部 CPU 计量。
