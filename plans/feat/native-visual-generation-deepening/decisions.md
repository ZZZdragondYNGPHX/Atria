# Atria 原生视觉生成系统深化 — 冻结决策

> 本文件**只包含已经得到用户批准的跨模块决定**。技术假设与备选提议在 [architecture.md](architecture.md)；代码审计在 [baseline-and-reference.md](baseline-and-reference.md)。未在本文件冻结的内容不得由 Codex 视为用户已批准。

## D-001（2026-10-14，Round 1）— 分层混合架构

- **Decision**：选择方案 **C**。系统底层共享统一的意图、提示词/后端适配、任务管理、图片版本与资产存储能力，上层支持三种用户可选择的使用方式：
  - 手动：由用户指定画面/选段和生成。
  - 半自动：系统提出场景与候选，用户参与审阅/修改/决定执行。
  - 全自动：在用户配置和允许的边界内自动决定何时请求图像。
- **Reason**：同时保留精细创作能力与未来的叙事自动插画，不使三套模式分别形成重复代码或互不兼容的存档。
- **Affected modules**：`architecture.md`；未来 Provider、Director、Prompt、Reference、UI、Scheduler、AssetStore 模块。
- **Scope limit**：模式的默认值、自动执行许可/付费阈值、触发时点、数据结构、独立 LLM Route、目标后端尚未定案；不能从“全自动模式存在”推导“任意自动扣费”。

## D-002（2026-10-14，Round 1 约束）— Native 产品独立实现

- **Decision**：在 Atria 当前 Native Session / 插画呈现 / AssetStore / Task Scheduler 基线之上深化；不恢复旧 ST SD 插件作为主执行体系，也不直接搬运 st-chatu8 的 AFPL 代码。
- **Reason**：避免重复存储与旧插件耦合，并遵守第三方代码的分发许可限制。
- **Affected modules**：所有产品实现模块、Provider 适配与用户界面。
- **Scope limit**：具体怎样重构现有合同和哪些旧模块淘汰，仍需技术方案确认。

## Unresolved; **not** decisions

- Round 2：Visual Director 的触发时机、是否允许流式预判及内容审定权。
- 视觉角色/世界状态的权威与跨分支视觉连续性。
- Image Provider Adapter 的通用请求/响应/审计契约。
- NovelAI V5、ComfyUI、SD、RunningHub、Cloud Image API 的支持优先级与范围。
- 图生图、局部重绘、Vibe、参考图、视频、批量生成的进入阶段与默认行为。
- 自动预算、任务持久化/续接、缓存键、失败处理及删除/GC 策略。
