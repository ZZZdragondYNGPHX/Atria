# 当前交接 — 斗破苍穹前后端并行准备

- Task ID: `package/doupo-living-world`
- Primary Workspace: `package`；当前变更只有 `docs` 文档。
- Stage: v0.9 Implementation 准备完成，等待用户在新的对话分别开始 BE 开发和 FE 设计。
- Plan entrypoint: [index](plans/package/doupo-living-world/index.md)
- Record: [同一累计记录](records/package/doupo-living-world.md)

## 当前真实状态

- 本轮 docs 起点 `4365619ec`，此前 `4ef50e1b4`、`4365619ec` 是本地提交；`origin/docs` 已包含用户要求的 `5e215cbe`。本轮文档提交用 `git log -1 --format=%H -- plans/package/doupo-living-world/execution-split.md` 定位，未声称远端已保存。
- 上次核实 main 干净且为 `f9a8a83827c8b3662c44e67e95c9ed84118baadd`，与 origin/main 一致；package 工作树干净。接手先重查真实 Git，不以快照回退代码。
- docs 另有其它任务的未提交修改：`plans/architecture/atria-frontend-audit/design-proposal/atria-visual-direction.html`。本任务没有编辑或提交该文件，务必保留。
- 当前没有 `doupo-living-world` 游戏目录、产品修补、可运行 UI、`.atria` 或真实模型/负载验证。C0 是待实现语义约定，不是已挂载接口。

## 用户决定

已正式确认开工（D25）。随后要求正式实现前先拆分任务（D26），在两个新对话中分别由后端 AI 开发、前端 AI 迭代界面；后端完成后由用户决定由哪个 AI 接手前端集成。当前对话只准备资料；后端对话可直接实施，不再申请开工许可。

其余已确认方向见 [decisions](plans/package/doupo-living-world/decisions.md) D01–D24，不重复提问。特别保留 NPC 自主生活、完整世界读档、家庭世代、动态 NPC/可扩展上限/事件平衡，以及三地先深后广。具体容量、事件阈值和拟定美术未逐项冻结，不从旧 doupo-open-world 引入历史确认。

## 后端新对话入口

[index](plans/package/doupo-living-world/index.md) → [decisions](plans/package/doupo-living-world/decisions.md) → [分工](plans/package/doupo-living-world/execution-split.md) → [backend-task](plans/package/doupo-living-world/backend-task.md) → [共用契约](plans/package/doupo-living-world/frontend-contract.md) → [research](plans/package/doupo-living-world/research.md) → [Record](records/package/doupo-living-world.md)。

可复制提示在 [backend-task 的末节](plans/package/doupo-living-world/backend-task.md#可复制到后端新对话)。从 BE0/BE1 验证运行/身份/存档/人口接纳开始，连续完成 BE2–BE6，不以骨架代替完整后端交付。游戏资产归 package；必要框架缺陷在独立源码工作树修补，main 不合入 package。维护实际接口与 Record，不改 FE 的设计目录。

## 前端设计新对话入口

[index](plans/package/doupo-living-world/index.md) → [frontend-ai-brief](plans/package/doupo-living-world/frontend-ai-brief.md) → [分工](plans/package/doupo-living-world/execution-split.md) → [共用契约](plans/package/doupo-living-world/frontend-contract.md) → [presentation](plans/package/doupo-living-world/presentation.md)。

可复制提示在 [frontend-ai-brief 的末节](plans/package/doupo-living-world/frontend-ai-brief.md#9-可复制的新对话提示)。参考前端审计的方法交付 HTML、功能表现、设计指导三项资料，覆盖 F01–F12；不照搬平台视觉/全平台范围。无仓库访问条件可直接提供完整文件，由本地执行者导入 `package:doupo-living-world/design-reference/`。同机并行需隔离工作树；FE 不改后端源、共用契约或 Record，不先行接管正式集成。

## 执行注意

保护其它任务，禁止独立审查代理/多轮交叉审查；由执行者完成必要自查。测试实现/fixture/日志/截图只保留本地。一般工程选择与阶段无需重复批准，真实前端集成的执行者仍由用户选择。

本快照是这次新对话准备的共享恢复入口，不承载另一份玩法规则；两路都已开始后，恢复事实归入同一 Record，按实际需要消费和清理快照，不覆盖其它任务的 HANDOFF。
