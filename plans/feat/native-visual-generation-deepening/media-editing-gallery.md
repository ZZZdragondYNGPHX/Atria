# Atria Native Media Studio、不可变衍生图谱与 Gallery — D-009 / Round 10

- Task ID: `atria-native-visual-generation-deepening`
- **Status: Round 9 用户已批准方案 C（D-009）：分层 Native Media Studio + 不可变媒体衍生 DAG + 版本化 Gallery，含再生成、Img2Img、Inpaint 和 Upscale 作为分期交付的核心编辑操作。** 第十轮将讨论精确 Mask UI、跨 Provider 编辑工作流、版本操作、删除/GC、SavePoint 与参考图晋升；这些具体规则尚未冻结。
- Canonical cross-module decisions: [decisions.md](decisions.md) D-001～D-009。D-009 的细分架构约束由本文负责；其他模块只链接，不重复详细规范。
- Data authority: [provider-protocol.md](provider-protocol.md)（ImagePromptIR、Provider 能力与证据），[visual-continuity.md](visual-continuity.md)（角色/状态/参考权威），[visual-director.md](visual-director.md)（Scene/Shot、Job 和费用）。
- Audited baseline: Atria `main@7e1045ab836c22cafbc92c5de056ad701f56e723` (GitHub 代码静态阅读；**本轮没有运行测试或真实编辑 API**）。

## 1. What Atria already has

- `src/native/illustration-service.js`: `addImageVersion`、`selectImageVersion`、软删除标注；同一 Annotation 的多次生成保留图片历史，并可选择某一版本呈现。
- `public/shared/native-illustration-contract.js`: 目前 `atri_illustrations` state 含 `annotations[]`、`images[]`；`ImageVersion` 主要关联 `annotationId/assetId/prompt/parameters/requestSnapshot`，尚无通用 parent media operation 图谱；RequestSnapshot 验证依赖 NovelAI 实现（未来由 D-003 解除）。
- `src/native/repositories/asset-store.js`: 内容 SHA-256 Blob/AssetRef、按引用保护删除与 GC；现有 Session/SavePoint 插画引用参与可达性。
- `src/native/illustration-image-service.js`: 手动提交 NovelAI 生成、ImageJob、结果存储；尚未发现 Native 一体化 Img2Img、Inpaint、Upscale、Gallery 搜索/编辑面板管线。
- `src/endpoints/novelai.js` 旧端点包含某些 upscale 行为，但不是原生插画操作已打通的证据；不能把旧 ST endpoint 的存在冒充 Native 功能实现。
- `public/scripts/native/official-illustration.js` 已有单标注版本历史选择，但不是跨 Session/Branch/Scene/Actor 的完整媒体画廊。

## 2. Edit operations are different; do not pretend they are identical

| Operation | Semantic contract | Minimum provenance | Constraints |
| --- | --- | --- | --- |
| **Regenerate** | 相同 SourceRef/Shot 的新明确生成意图，可沿用或调整已确认 IR/Target；生成独立新版本 | 旧源 Scene/Annotation，新的 Intent/Job/请求证据 | 必须区分用户明确再生成与 D-008 自动重复重放 |
| **Img2Img** | 使用已有图片像素作为条件产生新图 | 原图资产/版本、强度参数、目标 Provider 和 prompt | 去噪/影响程度是 Provider-specific，不能保证原像素保留 |
| **Inpaint / local edit** | 原图 + Mask + 局部编辑指令生成新图 | 原图、Mask 资产/坐标/尺寸版本、局部 Prompt、编辑结果 | 不同 Provider 的 Mask alpha/尺寸/扩展语义不同；按实际 Capability 转换并检查 |
| **Upscale** | 对原图产生更高分辨率衍生 | 源图版本、算法/Target、目标输出尺寸、内容变化类型 | 区分**确定性重采样**与**生成式超分辨率**；后者可能改脸/服装/细节，不能承诺像素或剧情完全无损 |
| **Select/Review** | 改变当前显示指针而非回写原始叙事 | Branch/Annotation/Session 作用域中的 `selectedImageVersionId` | 不能修改已保存原始 Blob，也不能覆盖其他分支已经选择的版本 |

Provider evidence varies: NovelAI 官方 Inpaint 文档有 Mask Canvas；OpenAI Images Edit API 支持多图和可选 Mask（具体格式/限制按实际模型接口检查）；ComfyUI / RunningHub 可通过已校验的 Workflow 模板承担自定义 Inpaint/Upscale。**支持某 Provider** 不等于该 Provider 的每个图像目标都支持所有编辑操作、相同 Mask 或相同输出画质/费用。

## 3. Round 9 historical options — **C approved** (A/B retained for comparison)

### A — Extend existing Annotation/ImageVersion incrementally

仍以 Annotation→ImageVersion 为唯一主要管理单元，为 regenerate/img2img/inpaint/upscale 单独增加操作入口；在单标注 UI 中管理少量历史版本，画廊主要聚合已有条目。

优势：实现范围最小。风险：多源编辑、长会话全局画廊、参考图晋升、操作链条与跨作品复用缺少正规模型，容易将来被迫重构。

### B — Immutable image lineage graph + versioned gallery

所有新图都是不可变 `ImageArtifact`；`ImageOperation` 在同一来源域记录 parent ImageVersion、可选 Mask/参考源、Prompt IR/Target/Job；生成 DAG，当前注释仅存显示指针。新增跨 Session/Branch/Scene/Actor 的懒加载 Gallery、操作树浏览、显式身份/风格参考晋升、基于 AssetStore 的引用保护。先提供基础手工编辑工具，更多编辑操作按 Provider 能力开放。

优势：长期版本/GC 与跨 Provider 编辑归一性好。风险：需要较完整的媒体数据契约和 UI 管理。

### C — Layered native Media Studio with immutable lineage (D-009 approved)

采用 B 的不可变多源图谱为底座，再将**交互、编辑操作、资产画廊、衍生模板/工作流**作为独立模块；统一“再生成、Img2Img、局部重绘、Upscale、图像变体”到原生 `MediaOperation`。支持多步骤、跨模型、更多编辑选项，但**按实现阶段**逐步交付，不强制一口气具备视频节点、成熟 DCC 图层编辑器或第三方所有高级特性。

**第九轮正式定案：采用 C。** 它包含 B 的不可变血缘/画廊，不采用 A 的单纯标注数组扩展；但不要求立即实现全功能图层编辑器或视频编辑器。风险：资产可达性、Mask 和编辑 UI、跨 Provider 能力组合、长期 GC/SavePoint 都更复杂；必须保证 Core/Workflow/UI 可分期验收。

## 4. D-009 冻结：职责分层与不可变媒体来源

### 4.1 三个正交职责

1. **Native Media Core / immutable lineage**：共享 ImageArtifact、MediaOperation、来源/父子 DAG、Mask/参考输入、原始像素 AssetRef 与非秘密请求证据。版本和父子引用不可变，原图永远不被原位覆盖；用户选择显示版本是另外的分支/标注呈现投影，不更改历史事实。
2. **Editing/Provider Workflow**：Regenerate、Img2Img、Inpaint/局部重绘、Upscale 统一由可追溯 MediaOperation 发起，委托实际 Image Target/Provider 的 Capability Negotiation 与 Adapter 执行。不同模型的去噪、Mask alpha、参考图、放大算法、费用和产物数量不必伪装成统一参数。严格能力不支持时应明确拒绝或走已批准的替代策略，不静默忽略。
3. **Media Studio / Gallery UX**：从剧情插图卡片进入编辑，独立工作台管理预览/Mask/Provider/参数/派生历史；Gallery 支持作品、Session、Branch、Scene/Shot、Actor、Provider、操作血缘与角色/服装/风格参考库的按权限检索，长会话需缩略图、分页、惰性加载，不重写 Chat/Timeline。

### 4.2 核心操作冻结在产品范围内，但分期实现

- **Regenerate**：用户明确的新生成意图、新请求/版本；不能把“用户想再生成一次”当自动触发的幂等重放。可沿用历史 ImagePromptIR/Prompt/Target，也允许用户修改后重新冻结证据。
- **Img2Img**：记录源图内容/版本、选择的 Image Target、编辑语义与该后端实际参数，以新图为独立产物。
- **Inpaint**：原图 + 授权 Mask + 区域编辑指令生成派生图；Mask 本身需要独立可验证身份/坐标/来源，不能将它仅当临时 DOM 手势。具体笔刷操作、坐标转换、Mask 反相等第十轮细化。
- **Upscale**：基于源图生成独立更高分辨率版本，必须区分普通重采样与**生成式超分辨率**（可能修改细节或角色面容），不得声称都是“无损”。
- **History / Gallery**：完整原图和衍生历史可浏览与选择；可受控对跨作品/分支提供共享的**批准标准参考图**，不得把普通剧情图默认为通用视觉事实；资产引用/保存时点保护沿用 Native 数据权威。
- **阶段化开发**：先构建可校验的 Core / DAG / 资产引用 / 基础 Regenerate / Gallery，再逐步实现各 Provider 通过能力检验的 Img2Img、Mask Inpaint、Upscale、编辑交互。最终已批准的操作不得因先后顺序被永久排除，某 Provider 专有能力仍需另定矩阵。

### 4.3 不可越过的跨系统不变量

- **不能修改已提交剧情或另建剧情真相库**。所有图片及编辑版本锚定原 Session/Branch/Revision/Annotation/Scene/Shot（若适用）；用户切换当前 Branch 不可改变原资产归属或偷偷选中晚到的版本。
- **血缘应为不可变无环多父引用结构**。Mask、参考图、派生父图、已批准参考库均参与有效引用与 GC/备份闭包。删除 UI/隐藏操作不能等于直接删 Blob；尚有可达子图、SavePoint、引用库或持久 Job 的资产不可物理删除。
- **共同预算和 Job**：手动编辑仍受配置的全局付费权限及 D-008 持久 ImageJob、请求冻结、远端对账和不确定不盲重试约束。用户确认以前不会因为打开编辑器/画廊而发送可能收费的请求。
- **模型差异真实表达**：不是所有 P0/P1 后端或模型都支持所有四种编辑方式；已冻结的是统一用户功能架构及逐 Provider 可验证能力，不是未经验证的通用 API 成功保证。
- **第三方许可与隐私**：所有素材/Mask/临时预览均受已有 AssetStore 和用户披露/授权限制，不能从用户当前分支泄露另一路未来剧情，也不复制 st-chatu8 的 AFPL 实现。

## 5. Conceptual media contract (fields illustrative, not yet a frozen schema)

```text
ImageArtifact:
  immutableImageVersionId, assetRef, mime, dimensions, hash
  sourceRef/sceneRef/annotationRef?, createdAt
  origin(operationId, generationJobId)

MediaOperation:
  operationId, type: regenerate|img2img|inpaint|upscale|edit
  parentImageVersionIds[]        // DAG parent edges; cannot form cycle
  inputAssetRefs[]               // source pixels, reference pictures
  maskAssetRef? + maskGeometry?  // authoritative coordinates
  chosenTargetRef + frozenCapabilities
  ImagePromptIR/RawPrompt + nativeParams + nonSecretEvidence
  jobId, status, outputImageVersionIds[]

GalleryIndex:
  reconstructible metadata for work/session/branch/scene/actor/target
  selectedImageVersionId scoped to original Annotation/Branch
  userPromotedReferenceRefs and explicit shared-library permissions
```

Invariants: **Blob immutable; an edit creates a derivative**. Selected display version is a separate mutable projection/selection; source text remains immutable. Every asset referenced by reachable ImageVersion, MediaOperation, Mask, active Job, SavePoint or approved reusable reference remains protected; abandoned previews/orphans can be GC'ed only after a safe grace and reference scan.

## 6. Round 10 precise UI and lifecycle decisions — **NOT FROZEN**

1. **Editing workflow**: Image card → "Regenerate / Img2Img / Inpaint / Upscale" → Preview / adjust prompt or mask → Check effective Provider capabilities, cost and full lineage → user confirms → submit one durable Job → review/select derivative. No hidden remote charges merely for opening an editor.
2. **History/Gallery**: per-Annotation version stack vs work/session/branch/Scene/Actor gallery, lineage view, thumbnails/lazy pagination, filter/compare/select, bulk hide vs actual deletion; no full-size eager load in long sessions.
3. **Masks & editing**: in-browser drawing mask, coordinate transforms and alpha rules, resize/crop/outpaint support, reversible mask edits; invalid geometry/unsupported capabilities must fail explicitly.
4. **Reference promotion**: a well-liked generated picture may be explicitly promoted to approved stable identity/style/outfit reference; ordinary plot-dependent image is not silently promoted and must not leak private/future scene facts.
5. **Deletion & retention**: hide/remove-from-view/soft-delete, lineage cleanup and permanent asset deletion are different operations. The system cannot delete a parent that remains reachable through a child version, SavePoint, Branch or reference library.
6. **Cost & recovery**: all edit jobs reuse D-008 persistent Job Ledger/idempotent publication; explicit regenerations create new generation intent; paid edits require appropriate user authorization and share the global hard cost cap.
7. **Video, full layer editor, third-party proprietary templates, batch operations**: pending separate scope decisions, not implicitly included in options B/C.

## 7. Round 10 architecture detail options — **NOT FROZEN**

**方案 A · 简约编辑与手动清理**：基本笔刷 Mask（画/擦、撤销/重做）、每张图一个明确的 Provider 操作，简单线性版本历史；删除仅隐藏，空间清理依靠后台引用扫描。开发简单，但跨 Provider/复杂 Mask/长会话资产治理的解释能力不足。

**方案 B · 强交互编辑与用户管理**：内建 Mask 分层、矩形/套索/笔刷等工具、裁剪/缩放/预览、多 Provider 选择及显式重试；画廊具有 DAG 历史、批量隐藏/删除请求和参考晋升。支持度高，但 UI 与资产规则容易耦合。

**方案 C · 能力感知的可逆编辑工作台 + 引用安全生命周期（推荐候选）**：Native 编辑空间对原图/Mask/参考图与 Provider 原生适配解耦；用户先预览并明确确认成本/目标，再提交 D-008 ImageJob；DAG/多步编辑历史始终无损留存。删除细分取消展示、软删除记录、最终不可达 GC；SavePoint/引用晋升只记录经授权资产和可达性，支持历史版本返回和分支隔离。具体坐标/反相/Mask 校验、编辑 UI、自动放大与重试、清理与导入恢复的边界随后细化。

第十轮冻结前仍需选择 A/B/C 及其取舍；更精确的 UI 默认、GC 删除时机与不同 Provider 的编辑矩阵可按实际产品契约继续深入讨论。**用户目前只批准 D-009，不代表批准此处第十轮任一细化方案。**

## 8. Evidence and validation

本轮仅更改 `docs` 的设计文件。代码审计为远端静态阅读，没有运行 Atria、本地 Provider、Mask 编辑 UI、存档导入或图片生成实测。实施后应针对多父 DAG 校验、CAS/幂等发布、SavePoint/Branch/参考库对 Blob 的保留、Masked image coordinates、图片格式、权限及高并发切换进行最小相关本地验证。
