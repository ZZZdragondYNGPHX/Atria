# S14：原 Run / Task 的 Goal 工作体验

依赖 S11/S12 与 S13 Project 消费者。创建仍沿 S11 固定结构的用户/作品 API，不增加自由文本自动授权、自动改写判据或另一 Goal 编辑器。此组把已声明 Goal 接入原双入口体验与 current scope context。

## 有限支持

- 原 Studio Project Task 页面与 RP Run Workspace 共享 Goal pane；显示 criteria/progress、blocked/stale/paused/cancelled/completed、声明预算、原 Task 实际 settled/reserved/unknown 费用与下一步。原控制端口执行 pause/resume/cancel，readonly 只读，背景 ack 不假报完成。
- Project 的固定 Goal 只能显式绑定同 exact intent/base 的原 Task；原 Studio/Host 完成后仍等待正式 Review/Commit 与 S12 Source。新唤醒不重建 bank，unresolved wake 不自动重发。
- Native 只读取既有声明 Task/lifecycle 产物的原 context grant。没有该作品 consumer 的 Goal 继续等待原事件。
- 用户执行 Goal context 由原 authenticated owner + Evidence scope 读取；Actor desires 排除，Native 换 branch 投影 stale。原 Agenda/Director 使用当前 Run evidence capture 的冻结 scope，切换 Run 后拒绝该异步结果；active/waiting 内容进 user 数据，paused/blocked/stale/terminal 不进入工作提示。Project 原 continuation 的 Host 请求同样消费这一数据层。

不新造 RP legacy bank，也不把这些工作宣称全部 localWork 计量。Project 自动执行中的 proof 沿原 Task bank；真正 Native Task/Turn 的模型/World 写入仍完全由原 consumer 的授权和预算裁决。应用关闭期间不新增系统唤醒。

## 有限出口

FS/SQLite 的 Ordinary RP 后续保存 Source 与正式 Project Commit 各完成跨次运行 Goal；Native 已有 lifecycle Task 实际 publication + 原 artifact grant 能完成 Goal，而 Goal 不能生产/重放它。
