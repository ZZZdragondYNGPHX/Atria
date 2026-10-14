# Atria Native Media Editing & Gallery — Round 9 design candidates

- Task ID: `atria-native-visual-generation-deepening`
- **Status: Round 9 open, NOT frozen**。本模块用于讨论图片再生成、Img2Img、Inpaint、Upscale、历史画廊与版本化资产。第八轮 D-008 已冻结 Scene/预算/Job/恢复；**第九轮的选择、编辑资产图、具体后端编辑范围仍未批准**。
- Canonical cross-module decisions: [decisions.md](decisions.md) D-001～D-008。
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

## 3. Round 9 architecture options — **NOT approved**

### A — Extend existing Annotation/ImageVersion incrementally

仍以 Annotation→ImageVersion 为唯一主要管理单元，为 regenerate/img2img/inpaint/upscale 单独增加操作入口；在单标注 UI 中管理少量历史版本，画廊主要聚合已有条目。

优势：实现范围最小。风险：多源编辑、长会话全局画廊、参考图晋升、操作链条与跨作品复用缺少正规模型，容易将来被迫重构。

### B — Immutable image lineage graph + versioned gallery

所有新图都是不可变 `ImageArtifact`；`ImageOperation` 在同一来源域记录 parent ImageVersion、可选 Mask/参考源、Prompt IR/Target/Job；生成 DAG，当前注释仅存显示指针。新增跨 Session/Branch/Scene/Actor 的懒加载 Gallery、操作树浏览、显式身份/风格参考晋升、基于 AssetStore 的引用保护。先提供基础手工编辑工具，更多编辑操作按 Provider 能力开放。

优势：长期版本/GC 与跨 Provider 编辑归一性好。风险：需要较完整的媒体数据契约和 UI 管理。

### C — Layered native Media Studio with immutable lineage (recommended direction to discuss)

采用 B 的不可变多源图谱为底座，再将**交互、编辑操作、资产画廊、衍生模板/工作流**作为独立模块；统一“再生成、Img2Img、局部重绘、Upscale、图像变体”到原生 `MediaOperation`。支持多步骤、跨模型、更多编辑选项，但**按实现阶段**逐步交付，不强制一口气具备视频节点、成熟 DCC 图层编辑器或第三方所有高级特性。

优势：最符合 Atria Native RP/AI Game 长期演进和此前 D-003、D-004、D-008 的分层/任务设计。风险：资产可达性、Mask 和编辑 UI、跨 Provider 能力组合、长期 GC/SavePoint 都更复杂；必须保证 Core/Workflow/UI 可分期验收。

## 4. Candidate media data model (illustrative; not frozen schema)

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

## 5. UI & safety decisions to settle

1. **Editing workflow**: Image card → "Regenerate / Img2Img / Inpaint / Upscale" → Preview / adjust prompt or mask → Check effective Provider capabilities, cost and full lineage → user confirms → submit one durable Job → review/select derivative. No hidden remote charges merely for opening an editor.
2. **History/Gallery**: per-Annotation version stack vs work/session/branch/Scene/Actor gallery, lineage view, thumbnails/lazy pagination, filter/compare/select, bulk hide vs actual deletion; no full-size eager load in long sessions.
3. **Masks & editing**: in-browser drawing mask, coordinate transforms and alpha rules, resize/crop/outpaint support, reversible mask edits; invalid geometry/unsupported capabilities must fail explicitly.
4. **Reference promotion**: a well-liked generated picture may be explicitly promoted to approved stable identity/style/outfit reference; ordinary plot-dependent image is not silently promoted and must not leak private/future scene facts.
5. **Deletion & retention**: hide/remove-from-view/soft-delete, lineage cleanup and permanent asset deletion are different operations. The system cannot delete a parent that remains reachable through a child version, SavePoint, Branch or reference library.
6. **Cost & recovery**: all edit jobs reuse D-008 persistent Job Ledger/idempotent publication; explicit regenerations create new generation intent; paid edits require appropriate user authorization and share the global hard cost cap.
7. **Video, full layer editor, third-party proprietary templates, batch operations**: pending separate scope decisions, not implicitly included in options B/C.

## 6. Round 9 question and next step

Choose A, B, or C for **media derivation / gallery architecture**, then update `decisions.md` with D-009 and this same module before entering the next topic. Before exact UI/Provider implementation, validate actual Model/Workflow capability schema and masks/limits. No feature development or branch creation is authorized by this discussion alone.
