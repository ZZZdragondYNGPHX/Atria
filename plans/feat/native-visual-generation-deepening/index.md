# Atria 原生视觉生成系统深化 — Plan Index

- **Task ID**: `atria-native-visual-generation-deepening`
- **Primary Workspace**: `main`（Atria 产品源码）；`docs` 仅承载本 Plan
- **Status**: **Draft / 多轮设计中**（2026-10-14，Rounds 1–10 已冻结：C/A/C/B/C/C/C/C/C/C；Round 11 Mask 协议、Provider 能力矩阵、Gallery/GC/导入验收待议）
- **Implementing Branch**: 尚未创建；待整个设计冻结后再创建 `feat/*` 工作分支交付 Codex
- **Verified code baseline (remote only)**: `main@7e1045ab836c22cafbc92c5de056ad701f56e723`
- **Reference**: [damoshen123/st-chatu8](https://github.com/damoshen123/st-chatu8)（读取其公开源码和行为作为研究材料，非 Atria 代码来源）
- **Predecessor**: [已完成的 NovelAI 官方插画 Plan](../novelai-illustration/index.md)。本 Plan 是后续独立深化，不回写其历史冻结范围。
- **Record**: 设计期无产品实施 Record；代码开发正式启动后创建 `records/feat/native-visual-generation-deepening.md` 并持续维护实际结果。

## 1. Goal

将 Atria 已有 Native 插画能力深化为可同时运行**手动创作、半自动辅助和全自动剧情插画**的统一视觉生成系统。扩展多生图后端与引用图/编辑能力，保持角色和画风连续性，使插画在 Session/Revision/Branch/SavePoint 中可追溯、可复现且不污染已提交的剧情正文。

本项目不是复活旧 SillyTavern 插件，也不是复制 st-chatu8；应围绕 Atria 的 Native 运行时、Route、Task Scheduler、AssetStore 与历史存档结构独立实现。

## 2. 已冻结选择、既有系统约束与待议原则

1. **方向：C — 分层混合架构（Round 1 已批准）**。共享一条底层管线和一套版本/资产权威；在上层分别支持手动、半自动、全自动的产品模式，而不是维护三份生成实现。
2. **不改写已提交剧情**。插图属于 Native Session 的呈现及媒体衍生数据；对应原文、版本和分支独立可追溯。模型不得靠生成插图反向改写剧情事实。
3. **以现有 Native 系统为基线重构**：优先演进 `atri_illustrations`、现有绘图提示词 Route、任务调度、密钥与 AssetStore，避免依赖已退役的 SillyTavern SD 扩展/DOM 写入路径。
4. **参考实现与版权边界**：可研究 st-chatu8 的交互/功能/协议行为；不得直接拷贝其 AFPL v9 代码或派生代码进入 Atria，除非另行完成授权、兼容性审查并取得明确决定。
5. **模型决定与用户控制分离**：不把“自动”解释为不可撤销地扣费或覆盖用户选择；手动生图、预览/编辑、取消和版本选择在方案设计中始终保留。实际默认值、自动执行时机与审批规则待后轮冻结。

**确认边界**：Round 1 D-001 = 分层混合；Round 2 D-002 = Post-Commit Visual Director；Round 3 D-003 = 语义 IR + Adapter + Capabilities；Round 4 D-004 = P0/P1/P2 后端及 Connection/Target/Rendering Profile；Round 5 D-005 = 状态驱动的 Visual Identity / Visual State / Visual References 三层权威；Round 6 D-006 = 证据驱动的混合 Visual State 更新、冲突仲裁与按用途参考图筛选；Round 7 D-007 = 分级事件驱动的自动场景价值筛选、预算隔离与持久 ImageJob 原则；Round 8 D-008 = 跨回合 Scene/Shot、可解释的自适应镜头评分、可调自动预算默认与持久作业恢复策略；Round 9 D-009 = 分层 Native Media Studio + 不可变图片衍生 DAG + Regenerate/Img2Img/Inpaint/Upscale/Gallery 功能范围；Round 10 D-010 = **能力感知的可逆 Mask/编辑、跨 Provider 显式执行、历史版本选择、可达 GC/存档闭包、参考晋升原则**。详见 [decisions.md](decisions.md)、[provider-protocol.md](provider-protocol.md) 和 [visual-continuity.md](visual-continuity.md)。第 2～4 条为 Native 基线/合规约束而非额外表决；第 5 条一般的用户控制仍受 D-007/D-008 的产品默认与授权硬边界约束。**Round 8 已确定**评分框架/初始权重、软节奏、用户可调硬额度、云自动付费默认未授权、Job 恢复方向；精确请求/数据库 Schema、Provider 子能力与计费实现、状态/参考图阈值、**Round 11 的 Mask 坐标/草稿持久化、编辑能力矩阵、Gallery UI、GC 宽限/导入验收细节**尚未批准；D-009/D-010 已冻结媒体架构与生命周期原则。

## 3. Plan module map

| 文件 | 权威内容 | 依赖/使用 |
| --- | --- | --- |
| [baseline-and-reference.md](baseline-and-reference.md) | Atria 与 st-chatu8 的静态代码现状、差距、版权边界、证据置信度 | E0/基线定位、所有 Provider 或持久化任务 |
| [decisions.md](decisions.md) | 已冻结且跨模块生效的设计决策；与未决事项严格区分 | 每轮新增跨模块冻结决定时更新 |
| [architecture.md](architecture.md) | 职责分层候选、已冻结的 Post-Commit 触发时序及后续编排待议边界 | 导演/模式/时序，跨模块决策以 decisions 为准 |
| [provider-protocol.md](provider-protocol.md) | 已冻结 D-003 分层及 D-004 Provider P0/P1/P2、三层配置/覆盖；精确 Schema 待议 | Provider/图片编译/请求证据、模型能力、S1/S2 |
| [visual-continuity.md](visual-continuity.md) | D-005 三层视觉权威、D-006 混合证据更新与参考图仲裁原则；实现细节待进一步设计 | 角色视觉关联、参考图/风格、信息披露与 S3；冲突/参考选择相关阶段必读 |
| [visual-director.md](visual-director.md) | D-007 分级 Director + D-008 已冻结 Scene/Shot、评分/节奏/可调预算默认、持久 Job/幂等/恢复 | Visual Director 场景/镜头/预算/Job，S4；实现相关时必读 |
| [media-editing-gallery.md](media-editing-gallery.md) | D-009 分层 Media Studio/DAG/编辑功能 + D-010 可逆 Mask/跨 Provider/版本/GC/Save/参考晋升原则；Round 11 精确协议 A/B/C **未冻结** | Media Core、编辑 UI、Gallery/GC/Save，S5；Round 11 必读 |

后续如确定 Provider、参考图、视觉身份、媒体编辑或缓存等独立大模块，应只新增对应模块，不在 `index.md` 重复详细规格。

## 4. Candidate layers (not yet a frozen interface)

`Native Narrative Snapshot / Project World State`
→ `Visual Intent & Director`
→ `Context / Character / Reference Resolution`
→ `Image Prompt IR & Backend Adapter`
→ `Native Job / Budget / Cancel`
→ `AssetStore / Image Versions / Branch Save`
→ `Display / Review / Edit`.

**已冻结**：正式提交后决策（D-002）；语义 IR + Adapter + Capabilities（D-003）；P0/P1/P2 与 Connection/Target/Rendering Profile（D-004）；**Visual Identity（稳定身份）+ Visual State（时点状态）+ Visual References（用途明确的参考图）分离**，不得跨分支污染叙事或泄露信息（D-005）；混合解析已提交正式状态与有锚点的叙事变化，经硬门禁/冲突审查、参考图用途过滤与 Provider 能力验证（D-006）；分级 Director 发现价值候选、按需调用 LLM、允许跳过、预算分离与持久 ImageJob（D-007）；Scene/Shot 时序、可解释自适应评分、初始频率/额度、云端金额默认不授权及 Job 状态对账/幂等恢复（D-008）。分层 Media Studio、不可变 ImageArtifact/MediaOperation DAG、Regenerate/Img2Img/Inpaint/Upscale 和 Gallery 为统一媒体链路（D-009）；Canonical Mask 草稿与提交资产分离、显式跨 Provider 能力/费用检查、生成结果先入历史、删除分级与引用可达 GC、SavePoint 闭包/显式参考晋升（D-010）。精确 Schema/Provider 实际能力与 Round 11 协议/交互验收另议。

## 5. Tentative stages and reading routes

| 阶段（暂定） | 目标 | 必读 |
| --- | --- | --- |
| E0：冻结方案 + 接口设计 | 确认 scope、契约和验收，非产品开发 | `index.md` → `decisions.md` → 当前议题模块（Round 11: `media-editing-gallery.md` §8；技术依赖按需读 `visual-director.md` / `provider-protocol.md` / `visual-continuity.md`）；涉及源码基线再读 `baseline-and-reference.md` |
| S1：中立协议/资产证据 | 拆除当前图片记录对 NovelAI 渲染的硬绑定，保留版本及存档权威 | `index.md` → `provider-protocol.md`，以及后续确定的资产/持久化模块 |
| S2：多后端适配 | 按 D-004 P0 NovelAI/ComfyUI/OpenAI Images → P1 Gemini/SD/Forge/RunningHub 交付；其他兼容协议为 P2 扩展点 | `index.md` → `provider-protocol.md`，以及后续各 Provider 子模块 |
| S3：角色/世界视觉连续性 | 角色身份、外观、服饰/状态、场景、参考图和出处；不创建第二剧情权威 | `index.md` → `visual-continuity.md`；需调用图片后端时再读 `provider-protocol.md` |
| S4：Visual Director 与触发 | 三种模式共用 D-007/D-008 分级事件调度、跨回合分割、评分/节奏、预算默认、持久作业 | `index.md` → `visual-director.md`；时序及模式约束再读 `architecture.md` |
| S5：编辑/画廊/交互 | D-009/D-010 已确定编辑功能、不可变 DAG/Gallery、Mask/跨 Provider/版本/GC/Save/参考晋升原则；Round 11 精确协议与验收待议 | `index.md` → `media-editing-gallery.md`；实际 Provider 能力再读 `provider-protocol.md` |
| S6：集成与回归 | 存档/分支/资产/成本/任务隔离、跨平台可用性 | `index.md` → 当前被改动模块、对应 Record |

这些只是 **candidate stage routing**：阶段范围、先后和拆分都可随讨论变化，未经最终批准不能当成 Codex 的实施承诺。视频生成、视频素材、独立虚拟助手是否纳入需另行讨论。

## 6. Cross-module constraints

- **叙事权威**：以历史已提交的 Session/Revision/Branch、正式角色/世界状态为事实输入。视觉输出不得把角色“想象事实”写回剧情。缺来源时显式报告不确定，不能跨越其他分支找素材。
- **图片权威**：图片/修改版是带 provenance 的资产与版本，不直接修改文字 Variant；保留原图和派生来源，选中的展示版本可改变。
- **后端能力**：不能假定 NovelAI、SD、ComfyUI、OpenAI-compatible 各支持同样的 seed、负面词、参考图、mask、Vibe、LoRA。需要按每个实际 Provider 声明能力并拒绝不支持参数。
- **隐私与成本**：密钥留在秘密配置系统，快照不得带 secret；自动模式须设计预算、防重复与确认边界；不因为“取消”错误宣称供应商已退款。
- **第三方版权**：具体的 st-chatu8 文件、许可证和行为证据见 [基线](baseline-and-reference.md)；仅以其实现为设计参考，独立开发。
- **迭代兼容**：项目目前是 dev 阶段；迁移策略可按实际产品契约设计，不应默认增加无必要的历史接口兼容层。正式弃用/迁移规则后续冻结。

## 7. Validation / acceptance strategy (draft)

以真实代码和最小相关本地检查为准。后续至少需要：
- Provider fixture/协议测试：参数能力探测、请求快照、图片字节/宽高/类型校验、超时/取消/并发/幂等，真实 API 未执行不算通过。
- 保存/读取测试：每个 Session/Branch/Revision 的视觉资料与图片版本保持归属；SavePoint 恢复/导入/引用 GC 不出现跨分支错配。
- 视觉连续性测试：角色不会串人、失忆、偷看其他分支；可定位图像提示词来源，不保证模型最终图像一定完美。
- UI/E2E：模式切换、半自动批准、生成中状态、编辑和图片切换；目标平台按当前正式范围测试且不得伪称真机证据。
- 安全/预算：数据最小化，端点权限、外部 URL、图像尺寸及上传限制、任务成本和失败回收。

执行与验证规则以 [Governance §8 / §12 / §13.1](../../../README.md) 为准；Plan 不附加人为的调用许可或 CI 阶段停止条件。

## 8. Current design checkpoint

- Round 1: **C 分层混合架构 — 已确认**，见 [decisions.md](decisions.md)。
- Round 2: **A 已提交剧情后决策 — 已确认**；只冻结决策时点，授权/预算/频率仍待议，见 [decisions.md](decisions.md) 与 [architecture.md](architecture.md)。
- Round 3: **C 结构化语义 IR + Provider Adapter + 能力协商 — 已确认**；冻结架构分层而非具体 Schema，见 [provider-protocol.md](provider-protocol.md) 和 [decisions.md](decisions.md)。
- Round 4: **B 跨家族分阶段完整覆盖 + 三层配置架构 — 已确认**，见 [decisions.md](decisions.md) D-004 与 [provider-protocol.md](provider-protocol.md) §5。
- Round 5: **C 状态驱动的分层视觉权威 — 已确认**；区分 Identity / State / References，严格源 Revision/Branch/显示权限和非事实边界，见 [decisions.md](decisions.md) D-005 与 [visual-continuity.md](visual-continuity.md)。
- Round 6: **C 证据驱动的混合视觉更新与冲突仲裁 — 已确认**；冻结证据/硬门禁/参考图筛选与能力检查原则，见 [decisions.md](decisions.md) D-006 与 [visual-continuity.md](visual-continuity.md) §5。
- Round 7: **C 分级事件驱动 + 场景价值筛选 + 隔离预算 + 持久可靠作业 — 已确认**，见 [decisions.md](decisions.md) D-007 与 [visual-director.md](visual-director.md) §6。
- Round 8: **C 场景感知自适应导演 — 已确认**；跨回合 Scene/Shot，默认权重 30/25/20/15/10、75/55 分层，自动默认关闭、平衡节奏、独立可调预算与 Job Ledger 恢复；详见 [decisions.md](decisions.md) D-008 和 [visual-director.md](visual-director.md) §7。
- Round 9: **C 分层 Native Media Studio + 不可变衍生 DAG + Regenerate/Img2Img/Inpaint/Upscale/Gallery — 已确认**，见 [decisions.md](decisions.md) D-009 与 [media-editing-gallery.md](media-editing-gallery.md) §4。
- Round 10: **C 能力感知的可逆 Media Studio — 已确认**；Canonical Mask 草稿/提交隔离、显式跨 Provider 编辑/许可、异步版本默认先入历史、引用安全 GC、SavePoint 可编辑闭包与参考晋升，见 [decisions.md](decisions.md) D-010 与 [media-editing-gallery.md](media-editing-gallery.md) §6。
- Round 11: **Mask 坐标与草稿协议、Provider 编辑能力矩阵、Gallery UI、资产清理与存档导入验收 — 讨论中/未冻结**，候选见 [media-editing-gallery.md](media-editing-gallery.md) §8。
- 尚未定案：精确 Provider/数据库/API Schema、真实报价与能力/远端状态细节、评分权重与阈值的后续实测校准、自动模式 UI 授权交互、视觉状态/参考图/Vibe 的精确阈值和 Provider 差异、媒体编辑 Mask 精确灰度/坐标/持久草稿、Provider 编辑能力矩阵、Gallery UI/版本交互细节、参考晋升审批 UI、批量/缓存/GC 宽限与物理回收协议、存档 Manifest/导入/恢复验收、视频与完整实施验收细项。
- **禁止先行创建产品开发分支**；用户要求讨论完、设计冻结后由本对话创建正式 `feat/*` 分支供 Codex 开工。

## 9. Material routing/design changes

2026-10-14：新建此 Bundle；与旧 NovelAI 插画 Plan 独立，记录第一轮选定方向。

2026-10-14：Round 2 用户批准方案 A，冻结 Post-Commit Visual Director，禁止现阶段将流式候选视为权威来源或提前向图片 Provider 发请求；更新 D-002 与阶段索引。

2026-10-14：Round 3 用户批准方案 C，冻结中立的 Image Prompt IR、Provider Adapter、能力协商及统一证据/资产边界（D-003）；新增 `provider-protocol.md`。

2026-10-14：Round 4 用户批准方案 B，冻结 P0/P1/P2 后端覆盖、交付优先级与 Connection/Target/Rendering 三层配置，及任务 > 标注 > 作品 > 全局的覆盖顺序（D-004）。

2026-10-14：Round 5 用户批准方案 C，冻结 Visual Identity / Visual State / Visual References 三层权威、源 Revision/Branch 隔离、玩家显示授权和不从图片反写剧情事实（D-005）；新增 `visual-continuity.md`。

2026-10-14：Round 6 用户批准方案 C，冻结混合证据更新、时序化视觉投影、硬门禁+冲突审查、用途化参考图选择和 Provider 能力验证原则（D-006）。

2026-10-14：Round 7 用户批准方案 C，冻结事件驱动分级筛选、有条件 Director LLM、可跳过/去重、Planner/Image 双独立预算、用户授权、持久 ImageJob、远端对账、不确定提交不盲目重试与幂等版本发布（D-007）。

2026-10-14：Round 8 用户批准方案 C，冻结跨 Commit Scene/Shot、非线性时点、五因素可解释评分（30/25/20/15/10、75/55 初始阈值）、节制/平衡/沉浸软节奏、自动默认关闭、可调滚动额度、云自动预算默认 0/未授权、Durable Job Ledger 租约/fencing/远端对账/不确定不重发与 ImageVersion CAS/补偿（D-008）。

2026-10-14：Round 9 用户批准方案 C，冻结 Native Media Core/Editing Workflow/Media Studio 分层、不可变多父衍生 DAG、Regenerate/Img2Img/Inpaint/Upscale 操作类别、Gallery、AssetStore/SavePoint/Branch/Reference 引用保护和分期实施边界（D-009）。

2026-10-14：Round 10 用户批准方案 C，冻结能力感知、可逆的 Canonical Mask 编辑工作台，跨 Provider 显式能力及费用检查、异步版本预览/选择隔离、hide/collection/soft_delete/physical_gc 分级引用安全、SavePoint 可展示/可编辑媒体闭包和用户批准的身份/服装/画风/场景参考资产晋升（D-010）。Round 11 讨论 Mask/草稿精确协议、能力矩阵、画廊 UI、GC 与导入验收；设计期不以 Plan 代替实施 Record。
