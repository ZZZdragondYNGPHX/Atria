# Atria 原生视觉生成系统深化 — 架构议题与候选方案

> **状态：Draft；[decisions.md](decisions.md) 的 D-001 / D-002 / D-003 / D-004 已冻结；其余待议。Image Prompt IR、Adapter、Capabilities、已选 Provider 范围/三层配置详见 [provider-protocol.md](provider-protocol.md)。**
>
> 参考阅读：[现有实现与差距](baseline-and-reference.md)。

## 1. Intended separation of responsibilities（候选）

**Narrative Authority**：Atria Native Session/Revision/Branch/SavePoint，现有角色/世界/知识状态。这是叙事事实唯一正式来源。

**Visual Intent / Director**：输入已授权的剧情证据与模式设置，提出一条或多条 `VisualIntent`（谁、在哪里、何种镜头、参考资料、是否该画、优先级）。Director 不直接修改剧情文字，也不直接调用特定 Provider。

**Visual Context Compiler**：只读选定 Revision 的可见角色、状态、场景、时间和视觉档案；锁定角色身份/画风/负面约束，标记不确定来源。

**Image Prompt IR（D-003 已冻结原则）**：与特定 Provider 无关的视觉语义，通过独立的 Capability Negotiation + Provider Adapter 编译成后端请求。用户手填 Raw Prompt 是明确的另一输入形式，不被 AI 静默覆盖。具体结构见 [provider-protocol.md](provider-protocol.md)。

**Image Job + Budget**：以 Native 资源/场景/请求意图作为去重和权限边界，编排 Provider 请求与取消；明确“已计划”“已批准”“已付费发出”“完成/失败”“结果已保存”不同状态。

**Image Asset & Presentation**：存储 bytes、格式、参数证据、外部响应标识、来源图/参考图/编辑衍生，绑定原 Session/Branch/Revision/Annotation，选中展示版本不改变叙事。

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
2. **身份与连续性**：角色固定视觉设定、剧情状态、服装、ReferenceImage/Vibe 的冲突解析优先级，跨 Chapter/Branch 的生命周期。
3. **后端与模型能力**：NovelAI V5、ComfyUI、SD/Forge、图像云 API/RunningHub；何者首批，如何声明可用参数/上传图像/异步进度。
4. **操作自主性**：手动/半自动/全自动的明确控制规则、最低确认/预算限额，以及 Director 如何验证“值得画”。
5. **图像衍生**：原始图、再生、局部编辑、风格迁移、视频的独立资产、原图追溯与版本选择。
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

- **D-001**：分层混合架构；**D-002**：正式剧情 Commit 后 Director 决策；**D-003**：结构化语义 IR + Provider Adapter + Capability Negotiation；**D-004**：跨 Provider 家族按 P0/P1/P2 分期、三层 Profile 及四级覆盖。四项已确认，见 [decisions.md](decisions.md) 和 [provider-protocol.md](provider-protocol.md)。
- **Round 5 待议**：角色视觉身份、图片/风格参考、Vibe、服装与世界状态的权威归属和跨分支连续性。
- 其他未决议题：自动授权与预算、精确 Provider API、编辑/参考图/视频功能矩阵、持久任务恢复。
