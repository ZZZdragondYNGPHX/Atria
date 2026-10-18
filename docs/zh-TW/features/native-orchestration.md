# 原生智慧體方案與執行

从 **Agents → Plans** 创建图，在画布或列表及 Inspector 中编辑节点与强类型端口。保存草稿，由 Host 校验后发布不可变修订。在修订区绑定精确的 Session、Project 任务或对话。绑定不启动运行，也不授予执行权限。

从 **Agents → Runs** 选择来源并观察运行。对话运行必须先预检，再显式启动付费请求。Project 可信提交必须使用当前已审阅任务、精确发布的提交方案，依次准备、打开独立可信审阅窗口、批准并显式执行。审阅哈希由原 Task 权威返回，Browser 不自行复制哈希算法。

时间线和图使用同一 Host 投影。已知费用、未知费用和预留额度分开显示。取消不撤销已发送操作，也不退还未知费用。突变结果未知时，只能使用同一 commandId 和同一内容核对；关闭页面不会取消 Host 操作。

桌面使用画布与 Inspector；手机提供语义等价的节点/连线列表和 Sheet。Memory 保留独立的作用域读取与维护页面。外部工具不能通过 Browser capability registry 注册执行权威。

RP、Game 和 Project 的主圖及委派子圖已實作已發布 Agent、Planner、Review、Judge 任務的組合：DAG 相依、有界回邊、動態增加 owned Agent，以及對純模型 Planner 工作的安全局部 Review 重做。各領域消費者仍檢查實際圖、資源 pin 與權限。儲存或發布圖本身不證明任意組合都能執行。

RP 主圖的獨立 Actor 協作已有 FS、SQLite 和 SQL 執行證據。委派子任務現已接入 owned Actor pin、獲准 Information 與逐接收方 Result 可見性；這部分新接線目前只有靜態證據，尚未執行。凍結 Fanout scope 內 Judge 接後繼 Agent 的工作也在整合：Game、Project 已接線，RP 尚在實作。不能把這些新增接線記作執行 PASS。

唯一 Narrator 輸出邊界，以及 Project 正式工具和人工 Review 要求仍然保留。跨已完成 Fanout/Join 的 Review 重做、scope 拓撲變更及巢狀委派仍受限。三域對尚未執行任務的取消和明確 blocked 結果仍在補齊。原預算與已知／未知費用帳仍是權威，不據此宣稱任意圖支援或產品完整驗收通過。

旧 Browser 执行模式、预设设置和 checkpoint 协议已退出，无兼容执行或迁移路径。当前协议外的历史文件保持不可执行；原领域数据、收据和未知费用保留。
