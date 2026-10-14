# 原生 Image Prompt IR / Provider Adapter / Capabilities — D-003 设计模块

- Task: `atria-native-visual-generation-deepening`
- Authority: 本文定义 **Round 3 已冻结的架构分界**，而非 Provider 的最终接口字段；跨模块冻结决策以 [decisions.md](decisions.md) D-003 为准。
- Source baseline: [2026-10-14 静态源码审计](baseline-and-reference.md)。代码实现前重新核对目标 main HEAD、Provider 官方协议与能力声明。
- Status: **架构方向已批准；具体 Schema/API、Provider 顺序及配置/功能范围未定**。Round 4 将在本文件新增最终 Provider 范围与配置决策。

## 1. Frozen architectural separation (D-003; Round 3 方案 C)

统一的不是“所有模型都具有相同 prompt、seed、steps、CFG”，而是**视觉语义、来源归属、生成生命周期、证据、资产版本**：

`Committed Narrative / Manual Source`
→ `VisualIntent (D-002: post-commit)`
→ `Visual Context / Identity / Reference Resolver`
→ `Image Prompt IR (structured semantics / author-entered raw)`
→ `Capability Negotiation (specific model / workflow / endpoint)`
→ `Provider Adapter (validate → compile → submit → observe/cancel → normalize)`
→ `ImageJob / GenerationEvidence`
→ `AssetStore / ImageVersion / Session/Save presentation`.

**Normative architecture:**

1. **Image Prompt IR** is Provider-agnostic, represents scene, participants identified by authoritative actor refs, action/expression, composition, style/constraints, reference asset provenance and generation task intent. Native Revision/Branch source identity is mandatory for illustration bound to narrative; placeholders/schema optional fields not frozen. IR remains meaningful without choosing a model and does not contain arbitrary Provider-specific knobs as universal requirements.
2. **Direct / Raw Prompt remains an explicit authored mode**, distinct from structured IR compilation; manual prompt must not be silently rewritten by a planning LLM. Native storage/evidence can represent both modes without duplicating image asset lifecycle.
3. **Provider Adapter** owns Provider-native API request rendering, authentication boundary, output parsing, cancellation/progress semantics, task IDs, generation/edit modes and provider-specific parameter presets. No generic front end may fabricate capabilities merely from vendor name.
4. **Capability Negotiation** is scoped to actual configured provider connection **plus model or workflow** and its version/configuration. Support for text-to-image, edits, inpaint/masks, reference images, sampler/seed/CFG, character coordinates, LoRA/Vibe/ControlNet, response types, asynchronous jobs and cancellation must be independently expressed when relevant; do not force unsupported control fields on all backends. Reuse appropriate concepts from existing Native capability evidence; do not equate text-generation Route capabilities with image capabilities.
5. **No silent feature loss**. If an IR requirement cannot be represented on the selected backend, execution must fail with actionable explanation or follow an *explicitly approved* fallback/partial-result policy. Unapproved silent conversion (e.g. reference image discarded, target aspect changed without notice) is not allowed.
6. **Request/evidence/version authority** is provider-neutral: immutable non-secret resolved request snapshot, actual provider/model/workflow identity or fingerprint, effective capability evidence, source Revision/Branch, provider-specific reproducibility parameters and image asset hash/versions. A Provider-specific verifier may validate its own wire payload; neutral validation owns source, identity, result and asset invariants. Secrets/tokens/authorization excluded.
7. **One shared ImageJob / Result lifecycle** for hand-authored, assisted and automatic intents (D-001); tasks operate on committed/source-anchored intent (D-002), do not rebind to active HEAD when the user changes branches. Provider-specific asynchronous/polling/WebSocket behavior is hidden behind Adapter, with truthful cancellation, retry, timeout, and progress reports. Provider-side fees or refunds are never assumed from local cancel.
8. **Preserve Atria data ownership**: no mutation of committed text, ref-checked AssetStore, ImageVersion history, SavePoint closure and GC. Rewrite or replace NovelAI-only request validation in a deliberate dev-stage contract transition if needed; avoid needless legacy compatibility scaffolding.

## 2. Static implementation gap (verified at current baseline; not runtime-tested)

- `src/native/illustration-image-service.js` resolves NovelAI image capability and directly calls `createNovelaiImageProvider()` / `renderNovelaiIllustration()`.
- `public/shared/native-illustration-contract.js` calls `renderNovelaiIllustration()` to validate `requestSnapshot`; neutral Evidence abstraction must remove this cross-layer dependency.
- `public/shared/illustration-plugin-contract.js` has shared preset fields with NovelAI-specific params: width, height, steps, scale, seed, sampler, noiseSchedule, sm, smDyn.
- Existing `role.illustration_prompt` is a **text** LLM route for composing prompt semantics; it must not be conflated with an image-generation Provider connection. Code audit: `src/native/illustration-prompt-service.js`.

## 3. Candidate representation (example, *not an approved schema*)

```text
VisualSourceRef:
  sessionId, branchId, revisionId, optional messageId/variantId/span

ImagePromptIR:
  sourceRef
  intentRef
  taskKind                     // txt2img, img2img, inpaint, etc. if supported
  authoringKind                // structured, raw
  scene, characters[actorRef,...], composition, visualConstraints
  styleRef, referenceAssetRefs[]
  userAuthoredRawPrompt?       // never silently overwritten
  requiredCapabilities?        // semantic requirements, not vendor parameters

ResolvedImageRequest:
  providerConnectionRef, modelOrWorkflowRef, frozenCapabilities
  nativeParameters              // bounded and validated by selected adapter
  compiledPayloadFingerprint
  sourceIRFingerprint
  idempotencyAndCostEvidence

ImageResult:
  sourceJobRef, assetRefs[], mediaMetadata, providerEvidence, status
```

Tasks/fields are illustrative only. In particular, **scope of non-narrative image creation** (standalone character portrait, project asset, sprite, etc.), multi-image return, editor workflow, video and cloud model differences require later approval; do not bake these illustrations into irreversible exact schema.

## 4. Provider/Workflow capability examples (for negotiation, not promises)

| Connection / mode | Examples of native-only controls | Architectural requirement |
| --- | --- | --- |
| NovelAI model/version | character prompting, Vibe/Precise Reference, sampler/noise schedule/NAI-specific flags | Model version separately identified and capability checked; V3/V4/V4.5/V5 not treated as interchangeable |
| ComfyUI workflow | node IDs, node types, placeholders, KSampler/LoRA/ControlNet/ref assets, output node, image/video | Validate typed node binding and discovered workflow manifest; do not naïvely string-replace arbitrary serialized JSON |
| A1111 / Forge compatible | txt2img/img2img, scripts/extensions, samplers, checkpoints/LoRA | Declare version/extension capability; service identity is insufficient |
| Image cloud providers | text/image edit variants, MIME, multi-image references, output size/quality, asynchronous result | Endpoint type is explicit; do not assume chat completions can serve image generation |
| RunningHub | workflow identifier, exposed input node mapping, queue/task ID, cloud budget | Task lifecycle and remote status/cancel semantics provider specific |

Products/roadmap, actual API schema, exact vendors/models, priority, probing vs manual capability overrides are **Round 4 open decisions**.

## 5. Consequence for tests (candidate acceptance, not execution evidence)

- Same semantic scene and actor references compile through multiple mock adapters; provider-specific native payloads differ while source IR provenance remains stable.
- Explicit unsupported/unknown required capabilities produce a clear block (or tested approved fallback) and do not burn generation budget silently.
- Request snapshots reproduce the effective provider/model/workflow/parameter values even after user edits a preset; source Revision remains fixed through session switch or SavePoint resume.
- Raw authoring bypasses LLM rewriting and still emits valid jobs/evidence.
- Adapters validate image format/dimensions and hostile payload limits, HTTPS/local endpoint boundaries, SSRF/secret handling, cancellation and retry logic for their actual transport.
- No external API/real image/UI testing has yet been performed in this design round.

## 6. Next design checkpoint: Round 4 (not frozen)

Resolve: **which Providers and modes are first-class**, staged priority, provider/model/workflow selection location and defaults, ability to switch providers per work/annotation/task, local/offline vs cloud behavior, compatibility APIs, credential handling, unsupported model capability fallback and configuration profile binding. Confirm these before detailed request/preset schemas or feature scope.
