# Atria 原生视觉生成系统深化 — 冻结决策

> 本文件**只包含已经得到用户批准的跨模块决定**。技术假设与备选提议在 [architecture.md](architecture.md)；代码审计在 [baseline-and-reference.md](baseline-and-reference.md)。未在本文件冻结的内容不得由 Codex 视为用户已批准。

## D-001（2026-10-14，Round 1）— 分层混合架构

- **Decision**：选择方案 **C**。系统底层共享统一的意图、提示词/后端适配、任务管理、图片版本与资产存储能力，上层支持三种用户可选择的使用方式：
  - 手动：由用户指定画面/选段和生成。
  - 半自动：系统提出场景与候选，用户参与审阅/修改/决定执行。
  - 全自动：在用户配置和允许的边界内自动决定何时请求图像。
- **Reason**：同时保留精细创作能力与未来的叙事自动插画，不使三套模式分别形成重复代码或互不兼容的存档。
- **Affected modules**：`architecture.md`；未来 Provider、Director、Prompt、Reference、UI、Scheduler、AssetStore 模块。
- **Scope limit**：触发时点遵循 D-002；模式的默认值、自动执行许可/付费阈值、数据结构、独立 LLM Route、目标后端尚未定案；不能从“全自动模式存在”推导“任意自动扣费”。

## D-002（2026-10-14，Round 2）— 已提交剧情后决策

- **Decision**：选择 **方案 A**，采用 Post-Commit Visual Director。只有剧情正文已经成功提交、能确认 `sessionId / branchId / revisionId` 及来源文本/Variant 的正式快照之后，才允许 Director 分析该剧情、发布正式的视觉候选意图，并按手动、半自动、全自动模式的后续规则执行。
- **执行时序**：**提交剧情 → 冻结来源身份/可见上下文 → Visual Director 决定画面候选 → 用户选择或自动授权（具体策略待定）→ 提交实际图片 Provider 请求 → 图片/版本绑定原始分支**。手动选段亦只能基于已经提交的正式剧情，不能把尚在流式展示的临时正文作为已确认的图片来源。
- **禁止当前实现**：剧情流式生成过程中，不启动基于该未提交正文的 Visual Director 预判，也不对其调用实际图像 Provider；失败、中断、撤销或未提交的文本不能触发正式 VisualIntent。取消或切换当前会话后，已提交并已授权的任务按其固定历史分支处理，不能悄悄改绑当前 HEAD。
- **Future extension only**：后续可以单独讨论 B（流式轻量预判，提交后再严格复核），但本轮没有批准其实现、费用支出、持久化或上线；不得把“接口预留”解释成先实现 speculative 任务。C（未提交即调用真实生图 Provider）不纳入当前设计。
- **Reason**：防止流式正文反转、梦境揭示、取消/切换分支造成的错配与无效费用；优先维护 Native Revision、SavePoint 和图片资产的一致性。
- **Affected modules**：`architecture.md`、未来 Director/Intent、Context、Job/Cost、UI、Save/Restore 流程。
- **Scope limit**：本轮**只**冻结视觉决策的时序与可信来源；导演触发频率、场景数量、LLM 执行配置、自动扣费许可、预算审批与 UI 默认值仍待后续决定。

## 基线与合规约束（非单独由用户冻结的架构方案）

- Atria 当前 Native Session、插画呈现、AssetStore、Task Scheduler 是应审查并优先复用的已存在实现；“完全恢复旧 SD 插件作为主体系”并不是已选择的开发方向。
- st-chatu8 以 AFPL v9 分发，不得未经许可直接复制代码、预设与素材进入 Atria；可独立借鉴需求/交互。见 [静态审计](baseline-and-reference.md)。
- 这些是现有事实、工程约束与版权边界，**不等于 Round 1 用户另行批准了一个 D-002 架构提案**。改造范围、Provider 抽象及产品边界留待后续轮次明确批准。

## Unresolved; **not** decisions

- Round 2 的触发时机已由 D-002 冻结；Visual Director 的**决策策略、频率、默认模式、自动请求授权/审批边界**仍待定。
- 视觉角色/世界状态的权威与跨分支视觉连续性。
- Image Provider Adapter 的通用请求/响应/审计契约。
- NovelAI V5、ComfyUI、SD、RunningHub、Cloud Image API 的支持优先级与范围。
- 图生图、局部重绘、Vibe、参考图、视频、批量生成的进入阶段与默认行为。
- 自动预算、任务持久化/续接、缓存键、失败处理及删除/GC 策略。
