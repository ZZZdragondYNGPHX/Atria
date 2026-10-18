# 原生智慧體方案與執行

从 **Agents → Plans** 创建图，在画布或列表及 Inspector 中编辑节点与强类型端口。保存草稿，由 Host 校验后发布不可变修订。在修订区绑定精确的 Session、Project 任务或对话。绑定不启动运行，也不授予执行权限。

从 **Agents → Runs** 选择来源并观察运行。对话运行必须先预检，再显式启动付费请求。Project 可信提交必须使用当前已审阅任务、精确发布的提交方案，依次准备、打开独立可信审阅窗口、批准并显式执行。审阅哈希由原 Task 权威返回，Browser 不自行复制哈希算法。

时间线和图使用同一 Host 投影。已知费用、未知费用和预留额度分开显示。取消不撤销已发送操作，也不退还未知费用。突变结果未知时，只能使用同一 commandId 和同一内容核对；关闭页面不会取消 Host 操作。

桌面使用画布与 Inspector；手机提供语义等价的节点/连线列表和 Sheet。Memory 保留独立的作用域读取与维护页面。外部工具不能通过 Browser capability registry 注册执行权威。

RP、Game 和 Project 的主圖及委派子圖已實作已發布 Agent、Planner、Review、Judge 任務的組合：DAG 相依、有界回邊、動態增加 owned Agent，以及對純模型 Planner 工作的安全局部 Review 重做。各領域消費者仍檢查實際圖、資源 pin 與權限。儲存或發布圖本身不證明任意組合都能執行。

RP 主圖的獨立 Actor 協作已有 FS、SQLite 和 SQL 執行證據。委派子任務使用 owned Actor pin、獲准 Information 與逐接收方 Result 可見性。三域凍結 Fanout scope 已接入 Judge 到後繼 Agent 的工作。

已發布的 advisory 子方案可沿同一 Host、資源許可和預算樹進一步委派。Review 可對目標任務下游已完成、費用已結清的整個純 Fanout/Join 組建立新嘗試和新屏障，保留舊結果及費用。未執行任務取消和明確 blocked 結果也已接線。這些新增能力只有靜態檢查，執行驗收尚未取得。

唯一 Narrator 輸出邊界，以及 Project 正式工具和人工 Review 要求繼續有效。凍結 scope 仍不允許拓撲變更、內部委派、內部 Review 重做或回環，也不能把已完成 sibling 接入新 Join。未知費用保持 unknown。上述限制和未執行驗收不構成任意圖支援或完整產品驗收通過。

旧 Browser 执行模式、预设设置和 checkpoint 协议已退出，无兼容执行或迁移路径。当前协议外的历史文件保持不可执行；原领域数据、收据和未知费用保留。
