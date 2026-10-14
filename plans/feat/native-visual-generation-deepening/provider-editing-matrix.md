# Round 12 候选：编辑 Adapter、Reference/Vibe/LoRA/ControlNet 组合与真实执行验收

- Task ID: atria-native-visual-generation-deepening
- **Status: Round 12 discussion / NOT frozen**。以下 API 事实源自 2026-10-14 的公开文档检查，仅用于决定架构/验收路径；**未连接用户后端、未运行 Atria、未执行付费 Provider 请求**。
- Frozen foundation: [decisions.md](decisions.md) D-003/D-004（Provider/Profiles），D-005/D-006（身份/视觉参考/时点），D-009/D-010（编辑/不可变 DAG），D-011（Mask/Capability 声明与 Save/GC）。
- Neutral Mask/SCHEMA: [media-precision.md](media-precision.md)；三层配置及 P0/P1 优先级见 [provider-protocol.md](provider-protocol.md)。

## 1. 官方文档证据 vs Atria Target 真实能力

这里的“文档存在”**不等于某个 Atria 已配置目标 verified supported**：后者须再校验 Connection/Model/Workflow、权限、安装插件/节点、输入约束和实际返回格式，尚未接通的统一标注 unknown。

| Provider / family | 官方/源码显示的编辑语义 | 专有参考/控制差异 | 在 Atria 中必须验证 |
| --- | --- | --- | --- |
| P0 NovelAI（V3/V4/V4.5/V5 分版） | Image2Image、Inpaint 及局部编辑工具存在；不同模型限制不同 | **Precise Reference 官方称仅 V4.5**，角色/风格参考；与 Vibe Transfer 当前不兼容；Vibe 有预编码与额外计费 | 每模型的真正支持范围、Mask/上传 API、强度、Upscale、V5 Vibe/Reference、费用和任务可重连，不能复制 V4.5 接口假装 V5 |
| P0 ComfyUI 本地 | /upload/image、/upload/mask、/object_info、/prompt、/history、/ws、/interrupt；以 Workflow API JSON 提交 | LoraLoader、ControlNetApply 等节点/预处理可存在，但**要绑定的节点/已安装模型/Workflow 都通过**才能支持 | 带类型的 node bindings 与 output node、版本/可用节点、输入 Mask 极性/模型依赖、结果/Queue、shared /interrupt 的波及范围 |
| P0 OpenAI 官方 Images | 官方 Image Edits 支持输入图、Mask、多图；Mask 仅作为模型引导，不保证严格按形状限制修改 | 官方 OpenAI 图片接口并不天然等同于 NovelAI Vibe、LoRA/ControlNet 插件；语义参考需要和像素 Mask 分开 | 实际模型/版本和 Image vs Responses Tool API、Mask alpha/尺寸限制、输出/费用、不支持原生 LoRA/ControlNet 时不伪造 |
| P1 Gemini Native Image | 官方 Nano Banana 文档提供文本+图输入和对话式局部修改（semantic masking） | “用自然语言只改某区域”不等于接受 Atria 精确二值/灰度 Mask；参考图输入数量因模型变化 | 检查语义编辑、支持输入格式/参考数与质量；像素 Mask 若无官方精确接口应 unsupported/unknown 而非冒充 native inpaint |
| P1 A1111/Forge compatible | A1111 img2img、Mask/Inpaint、extra-single-image 等 API；实际服务 /docs 为权威 | LoRA 可用性和 ControlNet 通过对应安装/扩展/模型；ControlNet 推荐通过 /sdapi/v1/txt2img/img2img 的扩展脚本参数接入 | 区分 A1111/Forge 版本、插件版本/模型/脚本、Mask 颜色/尺寸、采样器与 extras/cancel 语义 |
| P1 RunningHub | Workflow/Task 提交、查询与节点覆盖 API | 能力依赖云端工作流和任务执行环境，不能推断 Cloud API 一定有某个 LoRA/ControlNet | workflow binding、任务 ID、异步结果/成本、输入上传权限/有效期、Mask 和租用 GPU/余额 |

## 2. 非等价 Reference 类型

- **Identity reference**：角色面容/固定身份一致性；不等于原图衣服/伤势属于当前剧情事实。
- **Outfit/environment/style/composition reference**：不同用途分别来自 D-005/D-006 的授权参考资产；需要应用当前 Revision 的时点/分支门禁。
- **NovelAI Precise Reference、NovelAI Vibe、ComfyUI IP-Adapter/LoRA/ControlNet、Gemini/OpenAI 原生图像编辑**是不同条件控制机制，不共享必然相同的“参考强度”刻度或保持角色身份的保证。
- **Model-compatible adapter** 应将“引用用途与是否必需”传入 Provider Capability Negotiation。不同参考组合可能不同时兼容。参考权重与数目/原生参数只能由所选 Target 的能力声明约束。
- **费用**：若 Provider 会对图片上传、Reference 编码/Vibe 编码、Workflow 步骤收取附加费用，应归入 D-008 可审计的授权与预算；不因“无需再画一张”就假设免费。

## 3. Round 12 的三种待选 fallback/验收方向

### A. Strict matrix / No degraded execution

每个 Target 按实际能力映射；任何 required/preferred 特性不满足都拒绝执行，必须手动选择支持完整能力的模型。验收最简单，可能使自然语言编辑服务无法参加较宽松任务。

### B. Best-effort automatic adaptation

Adapter 在参数不支持时自动将参考图/Mask/ControlNet 等转换成文字描述或省略，并允许跨可用 Provider 自动重试。表面成功率高，**有静默丢失角色一致性、隐藏收费及跨分支素材泄露的严重风险**，与 D-003/D-006/D-008 的硬门禁存在直接冲突；不建议。

### C. Typed constraint negotiation + explicit fallback + three-stage verification (**candidate recommendation**)

- 每次编辑将要求区分 **required（不可降级）**、**preferred（需用户预先明确许可降级范围）**、**optional（可在明确结果证据中略过）**。身份/分支/披露/Mask 严格局部编辑/全局预算等不得用软评分代替；目标能力不满足 required/unknown 则阻止自动发费。
- 先运行**静态矩阵、节点/Schema/上传限制验证**，再用本地/Mock Provider Fixture 测试编码转换/模型特性冲突；最后通过**用户自带已授权目标的 opt-in 实际 API**做真实图像与成本/超时/取消/远端对账验证。第三步没有凭据或费用授权时明确标注“未做 Live”，不能把 Fixture 合格写作“真实服务通过”。
- 用户已经审阅的 fallback 可以在特定任务内启用，例如 “无强角色参考时改用文本描述/降低风格约束” 等仅改变 **preferred/optional** 层；必须在提交前展示画质/失真/费用差异，冻结原本希望值、最终执行值与用户的许可。**不能跨 Provider 自动付费迁移、不能静默将精准 Mask 改成 semantic edit、不能削弱身份/剧情/版权的硬约束**。
- Provider 特有输入输出的具体支持事实和测试结果分开记录（documented / fixture-verified / live-verified）；Target/Workflow 改变要使 Live 证明失效。未知成本按 D-008 规则 fail-closed。

## 4. Round 12 必须讨论的验收工作项（NOT FROZEN）

1. **P0 NovelAI**：实际 V3/V4/V4.5/V5 Img2Img/Inpaint/Reference/Vibe 的接口/模型矩阵、Mask/参考输入、计费/Vibe 缓存及冲突拒绝。
2. **P0 ComfyUI**：基于 API JSON 和实际 /object_info/Workflow 的 LoRA/ControlNet/Mask/输出节点绑定、节点名称版本化、结果校验/断连恢复、共享服务器安全取消。
3. **P0 OpenAI Images**：编辑/多图/alpha Mask、模型参数、费用与“Mask 不保证严格边界”的用户提示；区分 Image API 和 Responses Tool。
4. **P1 Gemini / A1111/Forge / RunningHub**：对话编辑 vs 精确像素 Mask、安装扩展检测、远端 Task ID/Workflow、模型差异与编译/上传验证；不得用 P0 的通过代替 P1。
5. **组合能力与退化**：身份参考 + Vibe + 服装 + Mask + LoRA/ControlNet 是否可同时实现，何时提示切模型/显式放宽约束、如何避免“参考图导致旧衣服”。
6. **执行安全**：不得在无用户 Secret/余额许可时偷偷调用付费 API，不能由 NetworkMock 冒充 Live 结果；验证结果冻结 PromptIR/Mask/Workflow/参数证据与图片 DAG，失败/重试/不确定提交/GC/SavePoint 仍遵循 D-008/D-011。

## 5. Public source references (for research; not runtime-proof)

- NovelAI Precise Reference: https://docs.novelai.net/en/image/precisereference/
- NovelAI Vibe Transfer: https://docs.novelai.net/en/image/vibetransfer/
- NovelAI Inpaint: https://docs.novelai.net/en/image/inpaint/
- ComfyUI built-in routes: https://docs.comfy.org/development/comfyui-server/comms_routes
- ComfyUI LoRA loader node: https://github.com/Comfy-Org/docs/blob/main/built-in-nodes/LoraLoader.mdx
- OpenAI Image Generation/Edits: https://developers.openai.com/api/docs/guides/image-generation
- Google Gemini Image API: https://ai.google.dev/gemini-api/docs/image-generation
- AUTOMATIC1111 WebUI API: https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/API
- ControlNet extension Web API: https://github.com/Mikubill/sd-webui-controlnet/wiki/API
- RunningHub Workflow API guide: https://www.runninghub.ai/runninghub-api-doc-en/doc-8287463

以上 A/B/C 及每个 Provider 的未来操作均为 **Round 12 讨论候选，不是 D-012 已批准**。设计全部完成前不创建 feat 分支。
