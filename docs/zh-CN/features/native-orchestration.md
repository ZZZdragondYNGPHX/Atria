# 原生智能体方案与运行

从 **Agents → Plans** 创建图，在画布或列表及 Inspector 中编辑节点与强类型端口。保存草稿，由 Host 校验后发布不可变修订。在修订区绑定精确的 Session、Project 任务或对话。绑定不启动运行，也不授予执行权限。

从 **Agents → Runs** 选择来源并观察运行。对话运行必须先预检，再显式启动付费请求。Project 可信提交必须使用当前已审阅任务、精确发布的提交方案，依次准备、打开独立可信审阅窗口、批准并显式执行。审阅哈希由原 Task 权威返回，Browser 不自行复制哈希算法。

时间线和图使用同一 Host 投影。已知费用、未知费用和预留额度分开显示。取消不撤销已发送操作，也不退还未知费用。突变结果未知时，只能使用同一 commandId 和同一内容核对；关闭页面不会取消 Host 操作。

桌面使用画布与 Inspector；手机提供语义等价的节点/连线列表和 Sheet。Memory 保留独立的作用域读取与维护页面。外部工具不能通过 Browser capability registry 注册执行权威。

RP、Game 和 Project 的主图及委派子图已实现已发布 Agent、Planner、Review、Judge 任务的组合：DAG 依赖、有界回边、动态增加 owned Agent，以及对纯模型 Planner 工作的安全局部 Review 重做。各领域消费者仍检查实际图、资源 pin 与权限。保存或发布图本身不证明任意组合都能执行。

RP 主图的独立 Actor 协作已有 FS、SQLite 和 SQL 执行证据。委派子任务现已接入 owned Actor pin、获准 Information 与逐接收方 Result 可见性；这部分新接线目前只有静态证据，尚未运行。冻结 Fanout scope 内 Judge 接后继 Agent 的工作也在整合：Game、Project 已接线，RP 尚在实施。不能把这些新增接线记作运行 PASS。

唯一 Narrator 输出边界，以及 Project 正式工具和人工 Review 要求仍然保留。跨已完成 Fanout/Join 的 Review 重做、scope 拓扑变更及嵌套委派仍受限。三域对尚未执行任务的取消和显式 blocked 结果仍在补齐。原预算与已知／未知费用账仍是权威，不据此宣称任意图支持或产品完整验收通过。

旧 Browser 执行模式、预设设置和 checkpoint 协议已退出，无兼容执行或迁移路径。当前协议外的历史文件保持不可执行；原领域数据、收据和未知费用保留。
