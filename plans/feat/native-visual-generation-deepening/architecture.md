# Atria 原生视觉生成系统深化 — 架构议题与候选方案

> **状态：Draft；[decisions.md](decisions.md) 的 D-001 / D-002 / D-003 / D-004 / D-005 / D-006 / D-007 / D-008 / D-009 已冻结；其余待议。Image Prompt IR/Provider 见 [provider-protocol.md](provider-protocol.md)，视觉身份/时点/参考图权威见 [visual-continuity.md](visual-continuity.md)。**
>
> 参考阅读：[现有实现与差距](baseline-and-reference.md)。

## 1. Intended separation of responsibilities（候选）

**Narrative Authority**：Atria Native Session/Revision/Branch/SavePoint，现有角色/世界/知识状态。这是叙事事实唯一正式来源。

**Visual Intent / Director（D-007/D-008）**：正式 Commit 后分级检测 Scene/Shot，跨回合 Scene 与同回合多镜头分别具有固定时点/来源；按五因素评分、重复度与覆盖度动态调节软节奏，允许跳过。根据三种模式用户许可和双预算提交持久 ImageJob，自动初始关闭。Director 不阻塞剧情、不能直接修改正文，详见 [visual-director.md](visual-director.md) §7。

**Visual Context Compiler（D-005 已冻结权威分层）**：对已提交的源 Revision 解析 Visual Identity（正式 Actor ID 或明确作用域的临时身份）、Visual State（时点服装/伤势/场景）、Visual References（类型化参考图与 Vibe）。不得跨分支借状态或绕过玩家可见性/披露规则；视觉事实不写回叙事。证据驱动的混合状态候选、冲突硬门禁及参考图用途筛选已由 D-006 冻结，详见 [visual-continuity.md](visual-continuity.md) §5；精确阈值另议。

**Image Prompt IR（D-003 已冻结原则）**：与特定 Provider 无关的视觉语义，通过独立的 Capability Negotiation + Provider Adapter 编译成后端请求。用户手填 Raw Prompt 是明确的另一输入形式，不被 AI 静默覆盖。具体结构见 [provider-protocol.md](provider-protocol.md)。

**Image Job + Budget（D-007/D-008）**：按稳定 Intent / ImageJob / Attempt 分层，在可靠账目中预留许可/额度，使用原子 claim、lease 与 fencing 防止并发重复；远端 ID 对账、提交不确定停止盲重试、已到字节幂等发布/失败补偿，保持旧 Branch/SavePoint 与 AssetStore 安全。Planner/Image 分账并具用户可调的滚动初始额度；云端自动付费默认 0/需明确授权。精确存储 Schema 与 Provider 计费协议后续定案，见 [visual-director.md](visual-director.md) §7。

**Image Asset, Native Media Studio & Presentation（D-009）**：不可变 ImageArtifact/MediaOperation 多父 DAG 保存原图、再生成、Img2Img/Inpaint/Mask/Upscale 的有效输入与版本/证据；编辑工作流经过 Provider 能力协商后交给持久 ImageJob，Media Studio/Gallery 负责操作、历史/选中版本、引用资产展示。绑定原 Session/Branch/Revision/Annotation，选中显示版本独立于衍生历史，不修改叙事。详细见 [media-editing-gallery.md](media-editing-gallery.md)。

## 2. Round 2 已冻结：方案 A — Post-Commit Visual Director

用户于 2026-10-14 明确选择**方案 A**，是已批准的 D-002（见 [decisions.md](decisions.md)），不是下方三种方案的开放投票。

**Current binding sequence**：

1. Narrative Runtime 成功提交正文，取得稳定的 Session/Branch/Revision/Variant 与消息身份；流式 token 不属于可生图的正式来源。
2. Director 读取该历史 Revision 的可见剧情、角色/世界状态，提出视觉候选；候选引用其原始 sourceRef。
3. 手动/半自动/全自动模式分别按后续批准的用户控制与预算规则确定是否发送图片请求。**提交剧情不等于无条件自动付费**。
4. Provider 请求、产生的图片和历史资产必须绑定原 sourceRef，切换 HEAD 不应造成跨分支串图。
5. 若提交失败/中断/取消，不能发布基于该未提交正文的正式候选，也不能触发真实生图。

**Not implemented or approved here**：B 的流式 speculative hint 和 C 的未提交即请求图片。将来若重新选择 B 必须单独更新 D-002；不因“未来预留”默认实现流式预测、提前调用 LLM、花费或缓存。

### 保留备选方案的比较记录（仅作历史研究，非当前实施要求）

第 1 轮已经决定有手动、半自动、全自动三种模式；第 2 轮需解决 **模型可能正在流式生成正文、用户随时可能取消/改写/恢复存档时，Visual Director 对什么内容作决定，以及哪些输出可进入真实付费调用**。

### 方案 A — 已提交剧情后决策（保守、优先可靠性）

只有 Native 正文完成 commit、取得 `sessionId / branchId / revisionId` 后，Director 才创建正式视觉候选；手动直接选择来源，半自动审阅后请求，全自动依据用户明确的配置/预算决定执行。流式期间不生成视觉候选/不预调用图片 Provider。

**优势**：证据清晰、无需撤销“误判场景”，与 SavePoint/分支一致性最容易验证。**代价**：首图延迟较长。

### 方案 B — 流式轻量预判，提交后严格复核（速度/复杂度折中）

允许正文流式期间进行**可丢弃的 speculative hint**（不进入持久化、不预扣外部生图费用）；只有当前剧情成功 commit、候选中的角色/场景与权威快照一致，才发布正式 `VisualIntent` 并按手动/半自动/全自动策略执行。流式取消/改写必须丢弃临时候选。

**优势**：能较早准备构图/角色列表；保留剧情证据和付费发起边界。**代价**：需要更复杂的版本校验和失效治理。是否预调用 *LLM* 自身也要受独立预算管理，不等于免费。

### 方案 C — 与剧情生成全程并行生图（极致速度，风险最高）

Director 可在正文尚未提交时直接调外部生图后端；正文结束后再绑定或抛弃图片。可能产生大量无效费用、错角色/错分支、剧透与无权威来源，尤其不适合长期剧情存档。若选择必须另设临时资产隔离/结算与无效结果 GC。

**定案说明**：采用上文 D-002 方案 A；方案 B/C 的文本仅记录审议时权衡，不构成实施授权。

## 3. Cross-cutting choices to resolve later

1. **视觉单位**：文本选段标注、完整 Scene、自动镜头卡、角色肖像是否拥有相同或不同的 VisualIntent 类型；与 Annotation 的引用方向。
2. **身份与连续性**：三层权威与 Branch/Revision 隔离由 D-005 冻结；混合证据更新、硬门禁/冲突审查及按用途筛选由 D-006 冻结；**待议**的是具体视觉事件模型、判定阈值、参考权重/强度及跨 Chapter 生命周期，参见 [visual-continuity.md](visual-continuity.md)。
3. **后端与模型能力**：NovelAI V5、ComfyUI、SD/Forge、图像云 API/RunningHub；何者首批，如何声明可用参数/上传图像/异步进度。
4. **操作自主性**：D-007/D-008 已确认分级判断、评分、默认关闭的自动模式、初始可调预算和待审批费用门禁；**待议**的是用户实际 UI 的审阅/取消/暂停/费用展示交互和 Provider 特殊结算行为。
5. **图像衍生**：D-009 已冻结分层 Media Studio、不可变衍生 DAG、再生成/Img2Img/Inpaint/Upscale/Gallery 为分期功能范围；**Round 10 待议** Mask UI、跨 Provider 编辑执行、版本操作与引用安全删除/GC、存档闭包和参考图晋升；视频是否纳入仍未定。
6. **性能可靠性**：长会话图片加载、缓存失效、Provider 重试、幂等费用和恢复历史的一致性。

## 4. Candidate contracts (illustrative only)

```text
VisualSourceRef:
  sessionId, branchId, revisionId, optional messageId/variantId/span
VisualIntent:
  intentId, sourceRef, origin(manual|suggested|automatic),
  sceneAndCharacterRefs, draftVisualBrief, validationEvidence
VisualJob:
  jobId, intentId, providerRef, effectiveCapabilities,
  nonSecretRequestSnapshot, budgetAndApproval, lifecycleStatus
VisualOutput:
  assetId, imageVersionId, imageMetadata, sourceJob, derivatives
```

这些概念可用于比较方案，不是数据 schema 定案。新的契约不能削弱现有 Native 图片来源校验、跨分支保护和 AssetStore 不可变/引用保护。

## 5. Decision checkpoint

- **D-001 ～ D-009** 已确认：混合模式、Commit 后生成、语义 IR/Adapter/能力协商、跨家族分期与三层 Profile、Identity/State/References 分层视觉权威、证据驱动混合状态更新与参考图仲裁、分级场景价值筛选与隔离预算/可靠 ImageJob、跨回合 Scene/Shot 和自适应评分/预算默认/恢复精细策略、**分层 Media Studio + 不可变衍生 DAG/编辑/画廊**。权威摘要在 [decisions.md](decisions.md)，实现约束分别在 [provider-protocol.md](provider-protocol.md) 和 [visual-continuity.md](visual-continuity.md)。
- **Round 10 待议**：D-009 已确认图像衍生操作与 Media Studio 架构，现进一步讨论 Mask 编辑器、跨 Provider 编辑流程、图像版本隐藏/软删/GC、SavePoint 闭包和参考图晋升；候选见 [media-editing-gallery.md](media-editing-gallery.md) §7。D-008 精确调度见 [visual-director.md](visual-director.md) §7；精确视觉冲突阈值与参考图强度另议。
- 其他未决议题：自动模式的具体 UI/授权表单、Provider 实际报价与模型编辑能力/Mask 协议、参考图/Vibe 实参、视频功能矩阵、媒体与 Job 的确切数据库表/迁移、SavePoint/GC 和 Provider 对账接口。
