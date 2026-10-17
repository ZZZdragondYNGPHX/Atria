# 原生智慧體方案與執行

从 **Agents → Plans** 创建图，在画布或列表及 Inspector 中编辑节点与强类型端口。保存草稿，由 Host 校验后发布不可变修订。在修订区绑定精确的 Session、Project 任务或对话。绑定不启动运行，也不授予执行权限。

从 **Agents → Runs** 选择来源并观察运行。对话运行必须先预检，再显式启动付费请求。Project 可信提交必须使用当前已审阅任务、精确发布的提交方案，依次准备、打开独立可信审阅窗口、批准并显式执行。审阅哈希由原 Task 权威返回，Browser 不自行复制哈希算法。

时间线和图使用同一 Host 投影。已知费用、未知费用和预留额度分开显示。取消不撤销已发送操作，也不退还未知费用。突变结果未知时，只能使用同一 commandId 和同一内容核对；关闭页面不会取消 Host 操作。

桌面使用画布与 Inspector；手机提供语义等价的节点/连线列表和 Sheet。Memory 保留独立的作用域读取与维护页面。外部工具不能通过 Browser capability registry 注册执行权威。

各原领域消费者检查自己支持的图形。RP 已实现有限 Agent、Planner、Judge、Review、Delegate 与 Fanout/Join Profile；Game、Project 的生产图形更受限。创作通过不代表任意消费者都能执行；不支持的 Profile 在发送前拒绝。角色独立 Audience 的 RP 协作、通用条件 Game/Project 协作尚未完整交付，不能由 RP Profile 测试推导为完成。

旧 Browser 执行模式、预设设置和 checkpoint 协议已退出，无兼容执行或迁移路径。当前协议外的历史文件保持不可执行；原领域数据、收据和未知费用保留。
