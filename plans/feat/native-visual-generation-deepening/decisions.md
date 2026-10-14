# Atria 原生视觉生成系统深化 — 冻结决策

> 本文件**只包含已经得到用户批准的跨模块决定**。技术假设与备选提议在 [architecture.md](architecture.md)；代码审计在 [baseline-and-reference.md](baseline-and-reference.md)。未在本文件冻结的内容不得由 Codex 视为用户已批准。

## D-001（2026-10-14，Round 1）— 分层混合架构

- **Decision**：选择方案 **C**。系统底层共享统一的意图、提示词/后端适配、任务管理、图片版本与资产存储能力，上层支持三种用户可选择的使用方式：
  - 手动：由用户指定画面/选段和生成。
  - 半自动：系统提出场景与候选，用户参与审阅/修改/决定执行。
  - 全自动：在用户配置和允许的边界内自动决定何时请求图像。
- **Reason**：同时保留精细创作能力与未来的叙事自动插画，不使三套模式分别形成重复代码或互不兼容的存档。
- **Affected modules**：`architecture.md`；未来 Provider、Director、Prompt、Reference、UI、Scheduler、AssetStore 模块。
- **Scope limit**：触发时点遵循 D-002，协议分层遵循 D-003；模式默认值、自动执行许可/费用、精确数据结构、独立 LLM Route 配置、目标后端仍待后轮定案。不能从“全自动模式存在”推导“任意自动扣费”。

## D-002（2026-10-14，Round 2）— 已提交剧情后决策

- **Decision**：选择 **方案 A**，采用 Post-Commit Visual Director。只有剧情正文已经成功提交、能确认 `sessionId / branchId / revisionId` 及来源文本/Variant 的正式快照之后，才允许 Director 分析该剧情、发布正式的视觉候选意图，并按手动、半自动、全自动模式的后续规则执行。
- **执行时序**：**提交剧情 → 冻结来源身份/可见上下文 → Visual Director 决定画面候选 → 用户选择或自动授权（具体策略待定）→ 提交实际图片 Provider 请求 → 图片/版本绑定原始分支**。手动选段亦只能基于已经提交的正式剧情，不能把尚在流式展示的临时正文作为已确认的图片来源。
- **禁止当前实现**：剧情流式生成过程中，不启动基于该未提交正文的 Visual Director 预判，也不对其调用实际图像 Provider；失败、中断、撤销或未提交的文本不能触发正式 VisualIntent。取消或切换当前会话后，已提交并已授权的任务按其固定历史分支处理，不能悄悄改绑当前 HEAD。
- **Future extension only**：后续可以单独讨论 B（流式轻量预判，提交后再严格复核），但本轮没有批准其实现、费用支出、持久化或上线；不得把“接口预留”解释成先实现 speculative 任务。C（未提交即调用真实生图 Provider）不纳入当前设计。
- **Reason**：防止流式正文反转、梦境揭示、取消/切换分支造成的错配与无效费用；优先维护 Native Revision、SavePoint 和图片资产的一致性。
- **Affected modules**：`architecture.md`、未来 Director/Intent、Context、Job/Cost、UI、Save/Restore 流程。
- **Scope limit**：本轮**只**冻结视觉决策的时序与可信来源；导演触发频率、场景数量、LLM 执行配置、自动扣费许可、预算审批与 UI 默认值仍待后续决定。

## D-003（2026-10-14，Round 3）— 语义统一、能力分离的多后端生图架构

- **Decision**：选择 **方案 C：结构化语义 Image Prompt IR + 独立 Provider Adapter + Capability Negotiation**。全局统一视觉语义、叙事来源、任务/结果/版本/证据；每个图片 Provider 自己实现请求编译、参数与输出解码，不强制模型遵循一张包含 sampler/steps/CFG 的通用参数表。
- **Image Prompt IR**：表达来源 Revision、视觉场景、角色身份、动作、构图、画风、参考素材和约束等独立于 Provider 的概念；保留人工直接编写 Raw Prompt 的操作方式，不允许规划 LLM 静默覆盖用户输入。精确字段、序列化结构、不同画作种类范围仍待专门设计。
- **Adapter boundary**：Provider/Workflow 专有能力、参数、协议、进度/取消、远端任务标识及结果解析由后端 Adapter 管理；既有 `role.illustration_prompt` 文本模型路线与实际图像 Provider 配置是不同职责。
- **Capability Negotiation**：以实际“连接 + 模型版本或工作流”为判定单位，区分已支持、不支持、未知。必需特性不被静默丢弃；执行前显式拒绝或按后续经过批准的降级策略处理。
- **Image Evidence**：每一生成版本保持非秘密的冻结 IR/编译结果指纹、Provider 模型/工作流身份、有效能力/实际参数与来源分支快照，保留历史可追溯性与 AssetStore、SavePoint/分支安全。不能继续在通用图片校验层硬调用 NovelAI 专用渲染器。
- **Reason**：可实现 NovelAI/ComfyUI/SD/云图像 API 的真实能力差异，同时避免角色/世界视觉连续性重复实现、图片历史锁死于某家 Provider。
- **Affected modules**：[provider-protocol.md](provider-protocol.md)（本决定的详细分层约束）；未来 image compiler、provider registry、capability manifest、image-job、asset/evidence、设置 UI。
- **Scope limit**：架构分层与能力/历史不变量已冻结；Provider 范围、顺序与三层配置遵循 D-004。精确 IR/API 字段、默认模型、自动调用许可、图生图/Vibe/视频等细化范围仍待议。

## D-004（2026-10-14，Round 4）— 多后端分期完整覆盖与三层配置

- **Decision**：用户选择 **方案 B：跨家族分阶段完整覆盖**。逐家族实现同一 Image Prompt IR / Capability Negotiation / ImageJob / AssetStore 体系。
- **P0（首批）**：NovelAI 官方及明确协议兼容接口（V3、V4、V4.5、V5；V5 需要独立能力与协议校验）；ComfyUI 自部署 Workflow API；OpenAI 官方 Images API。
- **P1（后续纳入本企划范围）**：Gemini 原生图像生成（含当时可用 Nano Banana 类模型）、SD WebUI / A1111 / Forge 兼容 API、RunningHub Workflow API。
- **P2（可扩展机制，不承诺任意通用兼容）**：后续经过明确协议验证的其他图片 Provider，可复用 Adapter 注册体系增量加入。
- **三层配置**：`Image Connection`（服务连接、Endpoint、Secret）；`Image Target Profile`（具体模型/版本或 Workflow、Provider-native 参数与实际能力清单）；`Image Rendering Profile`（画风/风格约束与默认 Target 策略）。一条 Connection 可关联多个模型/Workflow Target，渲染语义不能与 Provider-native 参数混为一层。
- **配置覆盖顺序**：**单次任务 > 单标注 > 作品 > 全局默认**，缺省逐级继承；用户可显式按作品、标注或任务选目标。提示词 LLM Runtime Route 与图片 Connection/Target 分离。
- **执行边界**：工作流按节点类型校验映射，不能在 JSON 中任意字符串替换；真实请求固定 Target/Connection/参数指纹与非秘密证据。未经后续批准不得静默丢弃必要能力，亦不得因为失败就自动切换收费 Provider。默认模型/预算/fallback 策略未在本轮批准。
- **Reason**：同时覆盖角色插画、工作流本地部署与云端自然语言生图，又不把所有后端强行归一成同一套 steps/sampler 或同一张账号设置表。P0/P1 是交付先后而非永久排除 P1。
- **Affected modules**：[provider-protocol.md](provider-protocol.md) §5；未来 Provider Registry、Target/Rendering 配置与 UI、资产/请求证据和任务调度。
- **Scope limit**：本轮冻结的是 **后端家族、开发优先级与三层配置及覆盖关系**，不等于已完成任何接入，也**不等于**获准一次性实现所有 Provider 特有的图生图/参考图/Vibe/视频/控制插件；这些需后续逐项定案。

## D-005（2026-10-14，Round 5）— 状态驱动的分层视觉权威

- **Decision**：用户选择 **方案 C：状态驱动的分层视觉权威**。明确区分三层：
  1. **Visual Identity**：角色是谁；正式 Package Actor 采用精确 `actorId` 绑定角色身份/基础外观/经批准的标准参考。自由 RP 和尚无正式 Actor 的临时角色必须有明确的作用域与稳定身份，不能靠同名字符串全局合并。
  2. **Visual State**：角色在该剧情时点的服装、发型、伤痕、装备及场景变化；由**已提交、相应 Revision/Branch 中的正式世界/剧情事实及许可投影**导出，不创建与 Session/World 竞争的第二套剧情真相数据库。
  3. **Visual References**：角色身份参考、服装参考、场景参考、画风/Vibe、构图参考各自具有用途、来源和权限；它们是呈现条件，不是剧情事实。
- **时点与分支隔离**：视觉请求必须固定源 `sessionId/branchId/revisionId`（必要时含具体 Variant/选文）；同一角色跨分支可受控复用基础身份/用户批准的标准参考，但**不得复用不匹配的动态服装、伤势、场景事实或直接将另一分支图片当当前事实**。
- **视觉事实边界**：生成的图像或参考图内的偶然元素（凭空出现的戒指、旧衣服或伤势）不自动写回 Actor/World/Memory/正式叙事。若需要更新世界状态，必须走 Atria 原有权威写入途径。
- **可见性与防剧透**：从正式信息中可读取，不意味着允许画进玩家可见图像。Visual Director/IR 编译须遵守源 Revision 的 Information Runtime / disclosure 规则，避免用 NPC 私密认知、未公开事件、另一分支未来状态泄露信息；不能把整个世界目录作为无约束视觉上下文。
- **参考条件一致性**：身份参考可以辅助保脸，不能因为参考图旧服装或旧伤痕而覆盖目标时点的事实；各 Provider 只能在其经能力验证的支持边界内编译，必要约束无法满足时不能静默丢弃。
- **Reason**：保证长期 RP 的人物身份持续、剧情中的外观变化正确，以及 SavePoint/Branch/玩家显示权限的一致性；不让视觉子系统形成“第二剧情内核”。
- **Affected modules**：[visual-continuity.md](visual-continuity.md)（本轮详细权威）；`architecture.md`、`provider-protocol.md`，以及未来角色/世界信息投影、IR、参考图资产、Renderer 和保存/恢复模块。
- **Scope limit**：本轮冻结的是**三层分工、身份与时点来源、分支/隐私与事实边界**；视觉状态如何自动抽取与更新、固定/动态状态冲突时的精确优先级、参考图/Vibe 的强度和自动选择算法、具体 Provider 功能与费用策略**均留到第六轮及以后**，不能把候选规则当成已批准实现。

## 基线与合规约束（非单独由用户冻结的架构方案）

- Atria 当前 Native Session、插画呈现、AssetStore、Task Scheduler 是应审查并优先复用的已存在实现；“完全恢复旧 SD 插件作为主体系”并不是已选择的开发方向。
- st-chatu8 以 AFPL v9 分发，不得未经许可直接复制代码、预设与素材进入 Atria；可独立借鉴需求/交互。见 [静态审计](baseline-and-reference.md)。
- 这些是现有事实、工程约束与版权边界，**不等于用户额外批准了某项架构提案**。D-003/D-004 确定 Provider 抽象、范围和配置骨架；D-005 确定角色身份—时点状态—参考图的三层权威，但具体 API、子功能与精细仲裁算法仍待议。

## Unresolved; **not** decisions

- Round 2 的触发时机已由 D-002 冻结；Visual Director 的**决策策略、频率、默认模式、自动请求授权/审批边界**仍待定。
- D-005 已冻结视觉身份/时点状态/参考用途分层、分支隔离、防剧透和图片非事实边界；**Round 6 待定**：状态自动更新/生效、固定与动态外观冲突仲裁、参考图/Vibe 自动选择顺序和强度、来源冲突时的处理策略。
- D-003 已冻结语义统一/Adapter/能力协商的分层原则；**实际请求/响应 Schema、能力配置及降级策略尚未冻结**。
- Round 4 后端家族、P0/P1/P2 优先级、三层配置与四级选择覆盖已由 D-004 冻结；**具体模型 IDs、协议参数、能力探测与默认生图 Profile** 未冻结。
- 图生图、局部重绘、Vibe、参考图、视频、批量生成的进入阶段与默认行为。
- 自动预算、任务持久化/续接、缓存键、失败处理及删除/GC 策略。
