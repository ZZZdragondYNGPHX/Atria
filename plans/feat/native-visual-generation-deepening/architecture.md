# Atria 原生视觉生成系统深化 — 架构议题与候选方案

> **状态：Draft；除 [decisions.md](decisions.md) 已冻结的 D-001 外，下述全部是候选设计，不能据此提前开工。**
>
> 参考阅读：[现有实现与差距](baseline-and-reference.md)。

## 1. Intended separation of responsibilities（候选）

**Narrative Authority**：Atria Native Session/Revision/Branch/SavePoint，现有角色/世界/知识状态。这是叙事事实唯一正式来源。

**Visual Intent / Director**：输入已授权的剧情证据与模式设置，提出一条或多条 `VisualIntent`（谁、在哪里、何种镜头、参考资料、是否该画、优先级）。Director 不直接修改剧情文字，也不直接调用特定 Provider。

**Visual Context Compiler**：只读选定 Revision 的可见角色、状态、场景、时间和视觉档案；锁定角色身份/画风/负面约束，标记不确定来源。

**Image Prompt IR**：与特定 Provider 无关的语义意图/视觉约束，经过 `ProviderCapabilities` 和适配器翻译成 NovelAI、ComfyUI 工作流、OpenAI/Cloud 等具体请求。用户手填 prompt 应作为明确输入，不能被 AI 无提示覆盖。

**Image Job + Budget**：以 Native 资源/场景/请求意图作为去重和权限边界，编排 Provider 请求与取消；明确“已计划”“已批准”“已付费发出”“完成/失败”“结果已保存”不同状态。

**Image Asset & Presentation**：存储 bytes、格式、参数证据、外部响应标识、来源图/参考图/编辑衍生，绑定原 Session/Branch/Revision/Annotation，选中展示版本不改变叙事。

## 2. Round 2 decision: 何时生成视觉意图？何时可以真实生图？

第 1 轮已经决定有手动、半自动、全自动三种模式；第 2 轮需解决 **模型可能正在流式生成正文、用户随时可能取消/改写/恢复存档时，Visual Director 对什么内容作决定，以及哪些输出可进入真实付费调用**。

### 方案 A — 已提交剧情后决策（保守、优先可靠性）

只有 Native 正文完成 commit、取得 `sessionId / branchId / revisionId` 后，Director 才创建正式视觉候选；手动直接选择来源，半自动审阅后请求，全自动依据用户明确的配置/预算决定执行。流式期间不生成视觉候选/不预调用图片 Provider。

**优势**：证据清晰、无需撤销“误判场景”，与 SavePoint/分支一致性最容易验证。**代价**：首图延迟较长。

### 方案 B — 流式轻量预判，提交后严格复核（速度/复杂度折中）

允许正文流式期间进行**可丢弃的 speculative hint**（不进入持久化、不预扣外部生图费用）；只有当前剧情成功 commit、候选中的角色/场景与权威快照一致，才发布正式 `VisualIntent` 并按手动/半自动/全自动策略执行。流式取消/改写必须丢弃临时候选。

**优势**：能较早准备构图/角色列表；保留剧情证据和付费发起边界。**代价**：需要更复杂的版本校验和失效治理。是否预调用 *LLM* 自身也要受独立预算管理，不等于免费。

### 方案 C — 与剧情生成全程并行生图（极致速度，风险最高）

Director 可在正文尚未提交时直接调外部生图后端；正文结束后再绑定或抛弃图片。可能产生大量无效费用、错角色/错分支、剧透与无权威来源，尤其不适合长期剧情存档。若选择必须另设临时资产隔离/结算与无效结果 GC。

**第一阶段建议**：方案 **A**，用后续优化路线的接口容纳未来的 B；不要把 C 作为默认。该建议不是已批准的设计。

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

- D-001：已确认，详见 [decisions.md](decisions.md)。
- **Next user choice**：在方案 A/B/C 中选择 Visual Director 的触发时机，或提出调整。
- 本议题冻结后，下一轮优先确认**图片语义意图 / 后端适配协议的隔离粒度**，然后再谈 Model/Provider 优先级。
