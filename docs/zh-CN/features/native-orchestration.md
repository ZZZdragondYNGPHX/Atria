# 原生智能体方案与运行

从 **Agents → Plans** 创建图，在画布或列表及 Inspector 中编辑节点与强类型端口。保存草稿，由 Host 校验后发布不可变修订。在修订区绑定精确的 Session、Project 任务或对话。绑定不启动运行，也不授予执行权限。

从 **Agents → Runs** 选择来源并观察运行。对话运行必须先预检，再显式启动付费请求。Project 可信提交必须使用当前已审阅任务、精确发布的提交方案，依次准备、打开独立可信审阅窗口、批准并显式执行。审阅哈希由原 Task 权威返回，Browser 不自行复制哈希算法。

时间线和图使用同一 Host 投影。已知费用、未知费用和预留额度分开显示。取消不撤销已发送操作，也不退还未知费用。突变结果未知时，只能使用同一 commandId 和同一内容核对；关闭页面不会取消 Host 操作。

桌面使用画布与 Inspector；手机提供语义等价的节点/连线列表和 Sheet。Memory 保留独立的作用域读取与维护页面。外部工具不能通过 Browser capability registry 注册执行权威。

RP、Game 和 Project 的主图及委派子图已实现已发布 Agent、Planner、Review、Judge 任务的组合：DAG 依赖、有界回边、动态增加 owned Agent，以及对纯模型 Planner 工作的安全局部 Review 重做。各领域消费者仍检查实际图、资源 pin 与权限。保存或发布图本身不证明任意组合都能执行。

RP 主图的独立 Actor 协作已有 FS、SQLite 和 SQL 执行证据。委派子任务使用 owned Actor pin、获准 Information 与逐接收方 Result 可见性。三域冻结 Fanout scope 已接入 Judge 到后继 Agent 的工作。

已发布的 advisory 子方案可沿同一 Host、资源许可和预算树进一步委派。Review 可对目标任务下游已完成、费用已结清的整个纯 Fanout/Join 组建立新尝试和新屏障，保留旧结果及费用。已完成的纯咨询委派也可经 Review 重做，重新申请原预算额度并创建新子 Run；旧 Return 仍只属于旧尝试。未执行任务取消和显式 blocked 结果也已接线。这些新增能力只有静态检查，运行验收尚未取得。

唯一 Narrator 输出边界，以及 Project 正式工具和人工 Review 要求继续有效。Join 前的分支 Review 可重做本分支的非终端前置任务，让尚未执行的冻结终端随后消费新结果，无因果依赖的其它分支保留工作。冻结 scope 仍不允许拓扑变更、内部委派或回环、替换冻结终端，也不能把已完成 sibling 接入新 Join。未知费用保持 unknown。上述限制和未运行验收不构成任意图支持或完整产品验收通过。

旧 Browser 执行模式、预设设置和 checkpoint 协议已退出，无兼容执行或迁移路径。当前协议外的历史文件保持不可执行；原领域数据、收据和未知费用保留。
