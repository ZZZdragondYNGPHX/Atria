# Atria Immersive Workspace — Live Handoff

## Task

- Task ID: `refactor/atria-immersive-workspace`
- Primary Workspace: `main`（产品）；docs 为文档辅助空间。
- Current branch/workspace: `docs`；产品只读基线 `main @ 783bb6fd30729263a97bb69842befcd1d25c1885`。
- Current HEAD: docs D0 持久化提交（读取当前 Git HEAD，不用文档自引用 hash）。
- Current stage: D0 complete; D1 review / contract audit / freeze next。
- Plan entrypoint: [index](plans/refactor/atria-immersive-workspace/index.md)
- Stage-required modules: decisions、personas、delivery、validation；coverage 按审阅行读取。
- Record: [record](records/refactor/atria-immersive-workspace.md)

## Completed

多轮 v0.2–v0.8 讨论和用户确认已整理为 9 模块 Draft Bundle。覆盖 S00–S20、完整旧字段/动作基线、工作区接线/状态、A/B 分阶段及 Persona 原生能力/迁移开放门。旧完成 Plan 的状态没有改写。

## Pending / next target

D1 审阅建议 P01–P06，补齐 Persona 原生 schema/API/Session state/Context/共享权限/Host/迁移 ledger/备份兼容契约与测试清单，然后冻结整体实施范围。总体 Plan 未批准，产品实现未开始。

## Key decisions

已有 D01–D20 确认，不重复询问：游玩优先、保留浮动/配色；手机阅读顶部导航；Studio Inspector/AI 切换；Runtime 用途就绪；Library 分类默认作品、第四类用户设定；Agents 固定会话默认运行；管理与会话工具分开；搜索分组；安装/导入完整页；资源页引用；首轮完整编辑器/JSON 保留；Persona 会话独立、历史保持。

Native Persona 是确定新增能力，不能只把 legacy Drawer 显示出来。旧整站迁移仍退役。不要建立并行 Prompt/Session/备份 authority。

## Validation / CI

D0 文档内部链接、154 源码/测试路径、21 coverage/acceptance 行、原文基线一致性与 diff whitespace 检查；不代替产品测试。v0.8 原型证据和未测边界在 Record。产品测试/构建/E2E 未运行，无本任务 CI 结果。

## Read first / do not repeat

先读本 HANDOFF → Plan index → D1 指定模块 → Record D0 的限制。按问题加载 baseline 或特定源码，不遍历全部 docs/history。不要重做已确认布局问题、原型演示流程，或把老任务的 Complete 当成新任务验收。

package 不是产品源码；保护其 `dist/`、`node_modules/`、`tests/`。产品 main 原有 `node_modules-shared/` 与 p7 日志未动。不要在 package 实现 UI 或合并 main。

## New-chat bootstrap prompt

继续 Atria 的 `refactor/atria-immersive-workspace`，Primary Workspace main，docs 是辅助文档。先读 docs:HANDOFF.md → plans/refactor/atria-immersive-workspace/index.md，再按 D1 路由读 decisions/personas/delivery/validation 和 records/refactor/atria-immersive-workspace.md。D0 已完成 9 模块 Draft 与 S00–S20 接线/验收矩阵；产品基线 main@783bb6fd3 未改。下一步做 D1 契约核对与整体方案冻结；不要重复询问 D01–D20，不把内存原型当实现，不在 package 改产品。正式阶段结束更新同一 Record/HANDOFF 后停止。
