# 当前换设备交接

- Date：2026-10-22
- Task ID：`package/doupo-living-world`
- Primary Workspace：`package`
- 阶段：方案 v0.16；世界自主运转深化 W0 身体/伤势基础正在实现，未验收。
- Plan entrypoint：[index](plans/package/doupo-living-world/index.md)
- 当前必读：[implementation-readiness](plans/package/doupo-living-world/implementation-readiness.md)、[character-condition](plans/package/doupo-living-world/character-condition.md)、[backend-task](plans/package/doupo-living-world/backend-task.md)、[frontend-contract](plans/package/doupo-living-world/frontend-contract.md)；需要跨模块决定时读 decisions 的 D28–D34。
- Record：[累计记录](records/package/doupo-living-world.md)，最新“换设备交接”段。

## 实际分支与快照

| 工作空间 | 分支 | 本轮快照 / 基线 | 说明 |
| --- | --- | --- | --- |
| Package | `package` | `09eec362e` | 保存七个 W0 身体/伤势相关实现文件；非完成交付 |
| Docs | `docs` | 本 HANDOFF 所在提交（起点 `5345bdc80`） | v0.16 方案、Record 与换设备快照 |
| FE 设计 | `feat/doupo-living-world-design-reference` | `a850f9f88` | 两份设计文档；未合并 package，引用的 HTML 原型缺失 |
| 产品源码 | `main` | `a9a914c66141daaf7ab9ae26119a506444d73698` | 本轮无产品源码修改 |

本轮推送以上 Package、Docs 与 FE 分支；恢复时先 fetch 并核实真实远端 refs。远端只保存 Git 提交，本机运行数据、凭证及本地测试未迁移。旧的 detached 运行工作树在产品基线，无未提交实现，不需作为独立分支恢复。

## 已完成与验证边界

- 已有 be.2/C2 后端和 v0.16 方案继续有效，具体历史看 Record。
- 保存的 W0 代码涉及持续伤势/缺肢、治疗与能力限制、schema、观察投影和 NPC 行为限制；尚未证明状态、规则、个人认知、详情、恢复全部贯通。
- 七个修改文件通过 Node 语法检查，空白检查通过；使用上述 main 构建成功（60185 bytes），未输出新发布件。
- 没有新增运行测试、存档恢复、真实宿主、模型或浏览器验证。package 版本仍为 `0.1.0-be.2`，不得将快照重新打包覆盖已有 release；正式发布前调整版本并完成直接必要验证。
- FE 两份文档以旧 v0.9 设计基线编写，`doupo-visual-direction.html` 缺失，不能宣称三项设计交付完整或前端已接线。
- docs 中其它任务 `plans/architecture/atria-frontend-audit/design-proposal/atria-visual-direction.html` 的本地改动未提交，未包含在本任务远端快照。

## 下一行动

1. 新设备获取三个远端分支，分别恢复资产、文档和 FE 设计工作空间，核对 HEAD 和 dirty 状态；不要将 main 合入 package，也不要直接用旧 FE 分支覆盖当前包源。
2. 按 Plan index 路由读取当前 W0 模块，检查 `09eec362e` 的实际代码与缺口，进行直接必要的规则/schema/恢复验证，再继续 W0–W5。保持既有授权，不重复请求开工或逐阶段审批。
3. 世界整体自主运转、连续因果、全角色图谱和 NPC 自主成长/后台冲突仍是主目标；完整玩家战斗按 D33 后续独立实施。后端读口与正式前端接线分别报告。
4. 恢复后将快照事实归入同一 Record，在不再需要时移除本 HANDOFF；未完成实现和缺失 HTML 不因同步完成而视为交付。

## 可复制的接手提示

继续 Atria《斗破苍穹》开放沙盒项目，Task ID：`package/doupo-living-world`。先 fetch 并核对 `docs`、`package`、`feat/doupo-living-world-design-reference`，读取 `docs:HANDOFF.md`、Plan index 及其 W0 路由和同一 Record。package 的 `09eec362e` 是尚未验收的身体/伤势实现快照；FE 的 `a850f9f88` 只有两份设计文档，引用的 HTML 缺失。以真实 Git 为准，完成直接必要自查和验证后按既有授权继续 W0–W5；不引入独立审查或额外阶段审批，不把打包成功当运行验收，不覆盖 be.2 历史归档。
