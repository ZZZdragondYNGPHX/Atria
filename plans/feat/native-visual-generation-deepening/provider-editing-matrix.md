# Provider 编辑/参考/条件控制矩阵与降级/契约 — D-012（Round 12 C）

- Task: `atria-native-visual-generation-deepening`
- Decision authority：[decisions.md](decisions.md) D-012；协议底座：[provider-protocol.md](provider-protocol.md) D-003/D-004；身份/参考：[visual-continuity.md](visual-continuity.md) D-005/D-006；Mask/编辑资产：[media-precision.md](media-precision.md) D-009～D-011；预算/持久 Job：[visual-director.md](visual-director.md) D-007/D-008。

## 1. 两层能力矩阵：文档层与有效 Target 层（D-012 已冻结）

**A.**B.

- 能力状态：`supported | unsupported | unknown`；
- **文档证据不等于实测通过**；没有足够 Target 证据应标 `unknown`。如果明确协议不支持某操作或组合则 `unsupported`。Workflow 类型在该用户实际节点/模型/版本都满足条件前不能直接声称 `supported`。
- 每个 Target 按操作分别声明：`txt2img`, `img2img`, `inpaint`, `outpaint`, `upscale`, `multi_image`, `identity_reference`, `outfit_reference`, `style/vibe`, `lora`, `controlnet/structure`, `composite/edit`；再独立声明输入/输出 MIME、尺寸/像素/张数、Mask 极性/Alpha、裁剪/上传、扩展节点、进度/远端 Task ID/取消、实际参数范围与额外收费/报价可信度。
- 有效**组合**必须单独协商：一个目标单独支持角色参考与 Vibe，不代表支持它们同次使用。支持某系列不代表其所有子型号/快照都支持；
- 能力、约束、所选参考和降级决定写入 D-003 ImagePromptIR → Provider Adapter 的非秘密请求证据；

### 1.1 P0/P1 的具体家族/协议矩阵（公开材料；未实测）

| 既定优先级和家族 | Img2Img / edit / inpaint | Upscale / multi input | Reference / Vibe / LoRA / ControlNet | 设计时默认处理 |
| --- | --- | --- | --- | --- |
| **P0 NovelAI V3/V4/V4.5/V5** | 官方产品说明有 Image2Image、Inpaint；**按版本和真实 API** 分开 | 官方 Upscale/Enhance 存在，但必须逐版本证实请求协议/付费，不能从网页 UI 推断 API | **Precise Reference 仅官方 V4.5**；角色/风格两种模式，可与 Inpaint 用；**不能与 Vibe Transfer 同用**。Vibe 有单独 encoding/cache/多 Vibe 费用，且非稳定身份强约束。V5 非自动继承 V4.5。 |Precise+Vibe 同次请求为已知冲突，禁止自动丢一项|
| **P0 ComfyUI self-host** | 官方 /upload/image、/upload/mask、/object_info、/prompt、/history、/ws 支持工作流提交/查询；本身不是任意 Workflow 的 Inpaint 保证 | Workflow 可实现多输入/放大，但基于已安装节点与输出节点 |Vibe/身份参考通常需特定模型/节点，不统一命名||
| **P0 OpenAI 官方 Images** | 官方 Images Edits 接受图像、可选透明 PNG Mask，多输入需遵守当前具体模型限制；**Mask 通常是指导，不保证硬像素保留** | 部分模型多图与输出尺寸/格式各异；Upscale 不从 image edits 能力推导为独立 native op | 图像参考/语义风格可通过模型表达；不将 NovelAI Precise/Vibe、LoRA、ControlNet 冒充 OpenAI 图片原生参数 | 将 Images Generation/Edits 与 Responses Image Tool 明确分协议；|
| **P1 Gemini Native Image** | 文本+图片生成/修改、对话式语义区域编辑有文档；**语义编辑 ≠ 精确 Raster Mask Inpaint** | 参考图片数量与尺寸/格式随模型而变；不默认 native Upscale | 可能支持输入图作为身份/风格提示，**无证据不称有 Precise/Vibe/LoRA/ControlNet 原生调用** ||
| **P1 SD WebUI/A1111 / Forge** | A1111 `/sdapi/v1/img2img`、Mask 和 `/sdapi/v1/extra-single-image`；Forge/扩展存在兼容差异 | extra/upscale 能力与安装的模型/插件匹配 | LoRA 由 checkpoint/文件/扩展决定；ControlNet 常由独立扩展通过 `alwayson_scripts` 接入，不保证任意安装实例已有 | 对实际 `/docs` /扩展版本/模型作能力探测，禁止默认为每套 Forge 均兼容所有 API |
| **P1 RunningHub Workflow API** | 可以提交工作流并根据 Task ID 查询结果；编辑能力取决于实际工作流输入 | 放大/多图按该工作流的输入/输出契约判定 | LoRA/ControlNet/Mask/参考图依赖云工作流及绑定的节点和运营环境，不能按“RunningHub”一词推断 | Workflow ID/版本、节点映射、认证/余额与费用、异步状态/查询、上传引用与结果必须逐工作流冻结 |

**矩阵的关键误区**：上述“官方 UI 或 API 有该类工具”是**研究起点**，不是可以据此在 Atria 的实际 Image Target 写 `supported` 的证据。尤其 NovelAI V5 的 Precise、Gemini 的硬 Mask、ComfyUI 未安装节点、Forge 未安装 ControlNet 均不能凭品牌名推导。

### 1.2 非等价视觉条件与组合规则

- `identity_reference` 约束身份，`outfit` 当前时点衣着，`style/vibe` 风格/迁移，`lora` 模型权重，`controlnet` 结构/姿态。由 D-005/D-006 的 Actor/Visual State 与授权素材决定语义和用途，Provider Adapter 只能编译，不得把图片中偶然旧衣物/伤痕写回世界事实。
- 各 Provider 的 strength/CFG/denoise/character weight/ControlNet guidance 值**没有统一物理意义**，应在 Target 原生配置而不是错误地强行映射到 ImagePromptIR 的同一个数值滑杆。
- 组合判定依赖目标、模型/Workflow 版本、引用图张数/上传格式/布局、精确 Mask 支持、费用/延迟。NovelAI V4.5 Precise 与 Vibe 是能力示例，不是所有改动都要重跑的 fixture。
- Vibe 预编码/缓存、Precise Reference 每参考图的额外费用、RunningHub 远端工作流费用、云图片输入计费均进入 D-008 Budget/Job 证据；未取得可合理约束的费用上界时，云端自动生图遵守默认不授权原则。

## 2. D-012 已冻结：Required / Preferred / Optional 分级降级协商

**执行顺序**：Narrative/Branch/Disclosure/Actor/Source hard gates → Image Prompt IR 语义约束和 Reference 证据 → Capability/Combination Negotiation → 显示拟生效转换与成本 → 用户先前授权/本次明确确认 → D-008 预算 CAS 预留 → Immutable Provider request/Job → Media DAG 发布与审计。

| Tier | 典型例子 | 不满足或 unknown 时 |
| --- | --- | --- |
| **required** | 正式来源与身份/披露许可、明确要求的严格 Mask/源图、不跨分支、全局费用上限，以及用户明确指定绝不可替换的角色参考/目标 |展示缺口和可供用户手动修改的 Target/要求。即便换 Provider 也不能由自动执行器悄悄放宽。若用户自己重新定义要求，是**明确新授权/新 Intent**，不是对旧 required 的静默降级|
| **preferred** | 用户希望保持某画风/Vibe、希望使用特定可替代风格来源或某种非关键参数 | 只在用户**明确批准的具体转换/范围/目标/费用界限**内降级。超出预授权或损失可能影响身份与剧情事实时必须停止；记录原要求、有效结果、失真提示、决策人/授权版本 |
| **optional** | 不改变身份/剧情或编辑目标的辅助装饰、可选构图改善 | 可以按照该任务明确的 optional 策略省略，必须保留 omitted 原因、实际输出证据；不得省略硬权限或隐式收费 |

**绝对不变原则**：

1. **角色真实身份、Source Revision/Branch/时序、玩家显示权限/素材许可、明确 required 的精确 Mask/输入引用、不可变历史及费用硬上限**，不因 Preferred/Optional 权重被突破。
2. 原本要求 `strict_inpaint_mask` 的场景不能悄悄改为 `semantic_image_edit`；除非用户明确**修改这次任务的 Required 需求**并重新确认风险和可能费用，否则必须拒绝。
3. 不进行**未经授权的跨 Provider 付费迁移**、付费探测未知能力或自动重画整个场景。手动编辑、半自动和全自动共用此协议，费用按 D-008 双独立账本和全局授权保护。
4. 应提供 `no_degradation` 默认行为，并允许用户在**具体作品或任务**设置明确的 preferred 降级许可及最大代价；拒绝一次性的笼统“所有不支持的功能均可自动忽略”，尤其不能隐性影响后续历史重现。
5. 发送的不可变请求证据需保留 `originalConstraints`、`effectiveConstraints`、`omittedOptional`、`capabilityEvidence`、`approvalRef`、`providerCostScope`、`maskTransform` 与错误/重试状态（以上为逻辑槽位，不是第十三轮已冻结的 DB 字段名）。

### 2.1 需要覆盖的协商样例

- **NovelAI V4.5 Precise Reference + Vibe**：在同个请求下不兼容。若两者 required，阻止；若画风 Vibe preferred 且用户明确许可省略/改 Target，预检展示后再继续；不能偷偷取消角色身份要求。
- 用户明确改为非精确编辑后才可能提交新任务。
- 任一插件/版本缺失或不匹配即不能据品牌名乐观放行。
- **SD WebUI/Forge**：ControlNet 扩展未安装/不可用时不能因为普通 img2img 成功就宣称姿势控制通过；经授权仅可更换目标/弱化非必须结构参考。
- **Cloud fee unknown**：缺用户确认的正数预算与可审计成本边界不自动向远端试探，即使文本 LLM 觉得镜头很重要。

## 4. A/B/C 方案的历史选择（D-012 已定案 C）

- **A 严格无降级**：最保守，连用户允许的 preferred 也需手工修正；本轮未选。
- **B 积极自动适配**：可在未授权时丢失重要参考/Mask、绕过成本，违反既有 D-003/D-006/D-008；本轮未选。

## 6. Round 13 已定案 C；E0 审计跟踪接口精度

D-012 不会提前替第十三轮冻结字段名、路由 URL、默认 UI 布局、版本迁移步骤或工程完成日期。

## Implementation protocol finding (S2, 2026-10-14)

The [official NovelAI OpenAPI](https://image.novelai.net/docs/doc.json) generation
endpoint requires human initiation. The Adapter must reject unattended automatic
sends for this provider; manual and human-approved semi-automatic jobs remain
within the unified pipeline. D-007/D-008 automated Director and scheduler remain
available for Targets whose service terms permit them. No live test was run.
