# 原生 Image Prompt IR / Provider Adapter / Capabilities — D-003 设计模块

- Task: `atria-native-visual-generation-deepening`
- Authority: 本文定义 **Round 3 已冻结的架构分界**，而非 Provider 的最终接口字段；跨模块冻结决策以 [decisions.md](decisions.md) D-003 为准。
- Source baseline: [2026-10-14 静态源码审计](baseline-and-reference.md)。代码实现前重新核对目标 main HEAD、Provider 官方协议与能力声明。
- Status: **D-003 与 D-004 架构/后端阶段及三层配置已批准；精确 API/Schema、扩展功能矩阵仍未冻结**。Round 5 讨论视觉一致性与参考资产。

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

下列 §5 冻结 Round 4 选定的产品后端家族、优先级与配置关系。具体 API Schema、模型版本标识、动态发现与人工能力覆盖规则仍未冻结；不得把未来扩展选项误写成当前已支持。

## 5. Round 4 冻结：跨家族分阶段完整覆盖（D-004，方案 B）

第四轮用户明确选定方案 B，**P0 是先实施而非其余后端被放弃；P1 是已纳入本企划最终范围而非无期限纯设想。** 优先级代表开发/验收顺序，不代表自动启用、性能或 Provider 能力承诺。

| 优先级 | Provider 与目标范围 | 集成原则 |
| --- | --- | --- |
| **P0** | **NovelAI 官方与明确声明同协议的兼容连接：V3/V4/V4.5/V5** | 原有 V3–V4.5 能力继续深化，V5 以独立版本能力/请求协议适配，不能仅修改模型 ID；实际 V5 具体子版本/参数在实现前核对官方文档 |
| **P0** | **ComfyUI 本地/自托管** | Workflow API JSON、受类型验证的节点参数绑定、工作流 Profile、执行/进度/输出归一化；模型、节点与产物能力以实际安装和工作流为准 |
| **P0** | **OpenAI 官方 Images API** | 将专用图片生成/编辑端点与文字 Chat Completions 严格区分；此阶段首要完成已确认生成协议，编辑、多图等高级能力另按后续决定实施 |
| **P1** | **Gemini 原生图像生成 API（Nano Banana 等当时可用的图像模型）** | 根据官方实际图像请求/返回协议编译；不混同普通 Gemini 文字请求 |
| **P1** | **A1111 / SD WebUI / Forge 兼容 API** | 文生图、声明可用的模型与扩展能力；准确探测实际服务和脚本/扩展支持，不假定不同 WebUI 版本完全互通 |
| **P1** | **RunningHub** | 云端工作流 Profile、任务 ID、远端异步生命周期、凭据与计费预算的独立 Adapter |
| **P2（扩展点）** | **其他有明确图像请求协议的兼容 Provider** | 通过注册 Adapter/能力清单渐进接入；并不承诺“任意宣称兼容的端点都可直接使用”，具体名单须另行批准 |

**冻结边界**：P0/P1 各 Provider 应最终完成经后续确定的 *基础能力契约* 与相关验证；支持某 Provider **不等于**已批准其所有图生图、局部编辑、视频、ControlNet、LoRA、Vibe、角色参考图或无损放大功能，功能矩阵留待后续方案。P2 为未来扩展机制，不要求本次项目穷举所有第三方供应商。所有后端统一走 D-003 协议与 ImageJob/AssetStore，不复制一套图片存档。

### 5.1 三层配置契约（D-004）

1. **Image Connection — 服务连接**：复用 Atria 既有 Connections/Secret 身份与安全管理；Provider Adapter/类型、规范化 Endpoint、SecretRef、网络/代理策略等属于连接，不将明文密钥塞入作品/图片版本/渲染预设。
2. **Image Target Profile — 具体模型或工作流**：指向一条 Image Connection，选择模型 ID 和版本，或 ComfyUI/RunningHub 的已版本化 Workflow / 绑定清单；管理实际 Provider 原生参数（sampler/steps/CFG/LoRA、节点映射等）及经过校验的 Capability Manifest。**一条 Connection 可以拥有多个 Target Profile**；Target 的确切内容和能力指纹随生成请求冻结，后续编辑配置不篡改旧请求证据。
3. **Image Rendering Profile — 绘图语义/风格与目标选择策略**：包含画风、画质偏好、角色参考/视觉约束、默认 Image Target 的选择，可全局定义、按作品覆盖；通用语义与 Provider-native 参数分别归 Image Prompt IR 和 Target，不能把后端专有 JSON 强塞为所有作品的统一视觉描述。

**Effective Image Target / Rendering selection**：按 **单次任务 > 单标注 > 作品 > 全局默认** 的优先级解析；同一层可对 Rendering Profile、Target Profile 分别覆盖，缺项继承上级。提示词 LLM 使用已有独立的 `role.illustration_prompt` 文本 Runtime Route，而不是图片 Provider。手动生图可显式选单次模型；半自动与全自动应按后续预算/授权策略选择，**禁止因失败就未经许可自行换到其他收费 Provider**。目标不可用或能力不满足时显示原因并遵循后续批准的 fallback 策略，不默默选择非等价后端。

**用户配置体验目标**：在 Runtime/视觉设置中管理连接、Target（模型/工作流）与 Rendering Profile；ComfyUI Workflow 应能导入 API JSON 并可视化地验证/映射节点输入，不要求普通玩家手写原始替换字符串。视觉 UI 的具体布局、自动探测手段、模板导入/导出与失败通知在后续 UI 轮次决定。

### 5.2 与 Atria main 的已知改造位置（静态证据）

- `public/scripts/native/runtime-workspace.js` 当前的 `connections` 编辑器只有 NovelAI/NovelAI-compatible 的原生图片选项；LLM Models/Routes 则单独创建。
- `public/scripts/native/illustration-settings-ui.js` 当前按全局/作品选择 `imageConnectionId` 与 `role.illustration_prompt`，还把参数输入标为“NovelAI 参数”。新三层体系应替换强绑定而非在 UI 中堆叠一套独立重复 Secret 配置。
- `public/shared/illustration-plugin-contract.js` 当前 `works` 有作品级 `imageConnectionId`、`promptRouteId` 和预设。新契约须体现 Target Profile 与 Rendering Profile 的不同归属；Atria 仍为 dev，可按必要程度进行明确的破坏式 schema 变更，避免为旧实现留下永久双通道。

## 6. Consequence for tests (candidate acceptance, not execution evidence)

- Same semantic scene and actor references compile through multiple mock adapters; provider-specific native payloads differ while source IR provenance remains stable.
- Explicit unsupported/unknown required capabilities produce a clear block (or tested approved fallback) and do not burn generation budget silently.
- Request snapshots reproduce the effective provider/model/workflow/parameter values even after user edits a preset; source Revision remains fixed through session switch or SavePoint resume.
- Raw authoring bypasses LLM rewriting and still emits valid jobs/evidence.
- Adapters validate image format/dimensions and hostile payload limits, HTTPS/local endpoint boundaries, SSRF/secret handling, cancellation and retry logic for their actual transport.
- No external API/real image/UI testing has yet been performed in this design round.

## 7. Next design checkpoint: Round 5 (not frozen)

下一轮重点：**视觉身份权威、角色参考图、Vibe Transfer、服装/伤痕/场景与世界状态同步**。需要明确角色卡/Actor 固定外观与会话剧情状态的冲突优先级、跨分支图像参考是否可复用、Reference/Vibe 是可选风格还是必须精确的角色一致性约束、视觉素材的生命周期。此轮不会预先冻结方案。

随后仍需分别完成 Provider 精确 Schema、Capabilities 探测、Cost/Fallback 策略、视觉 UI 与执行验收等议题；D-004 不替代这些后续决定。
