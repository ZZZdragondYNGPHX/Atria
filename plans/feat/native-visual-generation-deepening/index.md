# Atria 原生视觉生成系统深化 — Plan Index

> 执行规则入口：[Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

- **Task ID**: `atria-native-visual-generation-deepening`
- **Primary Workspace**: `main`（Atria 产品源码）；`docs` 仅承载本 Plan
- **Status**: **已完成**（2026-10-14，S0～S6；
- **Product integration**: `feat/native-visual-generation-deepening` 已快进集成到 `main@9241325a7290e613e0fdaaa1870409105c161c89`；产品与 docs 保持独立。
- **Initial code baseline**: `main@7e1045ab836c22cafbc92c5de056ad701f56e723`
- **Reference**: [damoshen123/st-chatu8](https://github.com/damoshen123/st-chatu8)（读取其公开源码和行为作为研究材料，非 Atria 代码来源）
- **Predecessor**: [已完成的 NovelAI 官方插画 Plan](../novelai-illustration/index.md)。本 Plan 是后续独立深化，不回写其历史冻结范围。
- **Record**: [正式实施记录](../../../records/feat/native-visual-generation-deepening.md)。设计期未实施的说明是历史审计事实，不覆盖当前授权。

## 1. Goal

将 Atria 已有 Native 插画能力深化为可同时运行**手动创作、半自动辅助和全自动剧情插画**的统一视觉生成系统。扩展多生图后端与引用图/编辑能力，保持角色和画风连续性，使插画在 Session/Revision/Branch/SavePoint 中可追溯、可复现且不污染已提交的剧情正文。

本项目不是复活旧 SillyTavern 插件，也不是复制 st-chatu8；应围绕 Atria 的 Native 运行时、Route、Task Scheduler、AssetStore 与历史存档结构独立实现。

## 2. 已冻结选择、既有系统约束与待议原则

1. **方向：C — 分层混合架构（Round 1 已批准）**。共享一条底层管线和一套版本/资产权威；在上层分别支持手动、半自动、全自动的产品模式，而不是维护三份生成实现。
2. **不改写已提交剧情**。插图属于 Native Session 的呈现及媒体衍生数据；对应原文、版本和分支独立可追溯。模型不得靠生成插图反向改写剧情事实。
3. **以现有 Native 系统为基线重构**：优先演进 `atri_illustrations`、现有绘图提示词 Route、任务调度、密钥与 AssetStore，避免依赖已退役的 SillyTavern SD 扩展/DOM 写入路径。
4. **参考实现与版权边界**：可研究 st-chatu8 的交互/功能/协议行为；不得直接拷贝其 AFPL v9 代码或派生代码进入 Atria，除非另行完成授权、兼容性审查并取得明确决定。
5. **模型决定与用户控制分离**：D-002 已冻结 Commit 后判断；D-007/D-008 已冻结自动默认关闭、可调额度/审批/预算硬门禁，D-012 已冻结分级降级及明确授权；手动/半自动/自动仍保留预览、取消、编辑与版本选择。不得把“自动”解释成无限额扣费。

**确认边界**：Round 1 D-001 = 分层混合；Round 2 D-002 = Post-Commit Visual Director；Round 3 D-003 = 语义 IR + Adapter + Capabilities；Round 4 D-004 = P0/P1/P2 后端及 Connection/Target/Rendering Profile；Round 5 D-005 = 状态驱动的 Visual Identity / Visual State / Visual References 三层权威；Round 6 D-006 = 证据驱动的混合 Visual State 更新、冲突仲裁与按用途参考图筛选；Round 7 D-007 = 分级事件驱动的自动场景价值筛选、预算隔离与持久 ImageJob 原则；Round 8 D-008 = 跨回合 Scene/Shot、可解释的自适应镜头评分、可调自动预算默认与持久作业恢复策略；Round 9 D-009 = 分层 Native Media Studio + 不可变图片衍生 DAG + Regenerate/Img2Img/Inpaint/Upscale/Gallery 功能范围；Round 10 D-010 = 能力感知的可逆 Mask/编辑、跨 Provider 显式执行、历史版本选择、可达 GC/存档闭包、参考晋升原则；详见 [decisions.md](decisions.md)、[provider-protocol.md](provider-protocol.md) 和 [visual-continuity.md](visual-continuity.md)。第 2～4 条为 Native 基线/合规约束而非额外表决；第 5 条一般的用户控制仍受 D-007/D-008 的产品默认与授权硬边界约束。**Round 8 已确定**评分框架/初始权重、软节奏、用户可调硬额度、云自动付费默认未授权、Job 恢复方向；精确请求/数据库 Schema、Provider 子能力与计费实现、状态/参考图阈值、**D-011 已冻结**上述 Mask/草稿/Gallery/GC/SavePoint 的中立协议及可调默认；**D-013 已冻结** API/Schema 领域与读写边界、三层配置/跨端 UX 和 S0～S6/25 子阶段的规划方向；精确字段/路由/DB 事务、Live Provider 证据与可能阻塞设计交接须由随后 E0 审计列明。

## 3. Plan module map

| 文件 | 权威内容 | 依赖/使用 |
| --- | --- | --- |
| [baseline-and-reference.md](baseline-and-reference.md) | Atria 与 st-chatu8 的静态代码现状、差距、版权边界、证据置信度 | E0/基线定位、所有 Provider 或持久化任务 |
| [decisions.md](decisions.md) | 已冻结且跨模块生效的设计决策；与未决事项严格区分 | 每轮新增跨模块冻结决定时更新 |
| [architecture.md](architecture.md) | 职责分层候选、已冻结的 Post-Commit 触发时序及后续编排待议边界 | 导演/模式/时序，跨模块决策以 decisions 为准 |
| [provider-protocol.md](provider-protocol.md) | 已冻结 D-003 分层及 D-004 Provider P0/P1/P2、三层配置/覆盖；精确 Schema 待议 | Provider/图片编译/请求证据、模型能力、S1/S2 |
| [visual-continuity.md](visual-continuity.md) | D-005 三层视觉权威、D-006 混合证据更新与参考图仲裁原则；实现细节待进一步设计 | 角色视觉关联、参考图/风格、信息披露与 S3；冲突/参考选择相关阶段必读 |
| [visual-director.md](visual-director.md) | D-007 分级 Director + D-008 已冻结 Scene/Shot、评分/节奏/可调预算默认、持久 Job/幂等/恢复 | Visual Director 场景/镜头/预算/Job，S4；实现相关时必读 |
| [media-editing-gallery.md](media-editing-gallery.md) | D-009 分层 Media Studio/DAG/编辑类别 + D-010 可逆编辑/引用生命周期，历史候选留存 | 媒体架构、S5 |
| [media-precision.md](media-precision.md) || 媒体协议/存档/GC、Round 12 依赖、S5/S6 |
| [provider-editing-matrix.md](provider-editing-matrix.md) || Provider Adapter/模型能力/预算/测试，S2/S6；实施时必读 |
| [native-contracts-ui-delivery.md](native-contracts-ui-delivery.md) ||精确字段依 E0 分类|
| [e0-closure-audit.md](e0-closure-audit.md) || **正式实施前必读**；它是设计审计而非 Record/HANDOFF |

后续如确定 Provider、参考图、视觉身份、媒体编辑或缓存等独立大模块，应只新增对应模块，不在 `index.md` 重复详细规格。

## 4. Candidate layers (not yet a frozen interface)

`Native Narrative Snapshot / Project World State`
→ `Visual Intent & Director`
→ `Context / Character / Reference Resolution`
→ `Image Prompt IR & Backend Adapter`
→ `Native Job / Budget / Cancel`
→ `AssetStore / Image Versions / Branch Save`
→ `Display / Review / Edit`.

**已冻结**：正式提交后决策（D-002）；语义 IR + Adapter + Capabilities（D-003）；P0/P1/P2 与 Connection/Target/Rendering Profile（D-004）；**Visual Identity（稳定身份）+ Visual State（时点状态）+ Visual References（用途明确的参考图）分离**，不得跨分支污染叙事或泄露信息（D-005）；分级 Director 发现价值候选、按需调用 LLM、允许跳过、预算分离与持久 ImageJob（D-007）；Scene/Shot 时序、可解释自适应评分、初始频率/额度、云端金额默认不授权及 Job 状态对账/幂等恢复（D-008）。分层 Media Studio、不可变 ImageArtifact/MediaOperation DAG、Regenerate/Img2Img/Inpaint/Upscale 和 Gallery 为统一媒体链路（D-009）；D-013 已冻结统一 Native 资源/API 职责、三层设置、三端 UI 和七阶段交付方式。具体 JSON/SQL/HTTP 字段、权限事务与真实 Provider 证据在 E0 审计中标注未决；没有运行 L3 的 Target 仍不得称为可用。

## 5. D-013 已冻结的七阶段/25 子阶段与阅读路由

详细子阶段见 [native-contracts-ui-delivery.md](native-contracts-ui-delivery.md) §5。

| 阶段（子阶段数） | 已定案目标 | 必读 Plan 模块 |
| --- | --- | --- |
| **E0 设计审计（已完成；非开发阶段）** | D-001～D-013 与真实 `main` 基线交叉核查、15 个精确接口/外部证据缺口、交接与最晚阶段 | `index.md` → `decisions.md` → `native-contracts-ui-delivery.md` → [e0-closure-audit.md](e0-closure-audit.md) |
| **S0 契约与 hard cutover（3）** | SourceRef/IR/身份、Native 资源与 API 权威、单一协议替换旧 NovelAI 中立硬耦合 | `native-contracts-ui-delivery.md` → `provider-protocol.md` / `architecture.md` |
| **S1 Job/Media 中立内核（4）** | Connection/Target/Rendering、持久 ImageJob/预算、Media DAG/AssetStore、SavePoint/GC 安全 | `provider-protocol.md` → `visual-director.md` → `media-precision.md` |
| **S2 P0 后端（3）** | NovelAI 垂直薄切片，然后 ComfyUI、OpenAI Images 的生成/编辑/Workflow 能力 | `provider-editing-matrix.md` → `provider-protocol.md` → `native-contracts-ui-delivery.md` |
| **S3 视觉连续性/导演（4）** | Actor/VisualState/References、Scene/Shot、导演评分/三种模式、审批/频率/预算 | `visual-continuity.md` → `visual-director.md` |
| **S4 Media Studio/Gallery（4）** | Mask Checkpoint、四类编辑操作、Gallery/晋升、GC/可编辑 SavePoint | `media-editing-gallery.md` → `media-precision.md` → `provider-editing-matrix.md` |
| **S5 P1 后端（3）** | Gemini Native Image、SD WebUI/Forge、RunningHub 与 P2 Adapter 扩展机制 | `provider-protocol.md` → `provider-editing-matrix.md` |

产品功能/Provider 范围受既有 D-004/D-009 限制，P1 不得成为未兑现的“可选未来”。视频、完整 DCC/视频剪辑及额外发行平台仍未纳入批准的当前实施范围。

## 6. Cross-module constraints

- **叙事权威**：以历史已提交的 Session/Revision/Branch、正式角色/世界状态为事实输入。视觉输出不得把角色“想象事实”写回剧情。缺来源时显式报告不确定，不能跨越其他分支找素材。
- **图片权威**：图片/修改版是带 provenance 的资产与版本，不直接修改文字 Variant；保留原图和派生来源，选中的展示版本可改变。
- **后端能力**：不能假定 NovelAI、SD、ComfyUI、OpenAI-compatible 各支持同样的 seed、负面词、参考图、mask、Vibe、LoRA。需要按每个实际 Provider 声明能力并拒绝不支持参数。
- **隐私与成本**：密钥留在秘密配置系统，快照不得带 secret；自动模式须设计预算、防重复与确认边界；不因为“取消”错误宣称供应商已退款。
- **第三方版权**：具体的 st-chatu8 文件、许可证和行为证据见 [基线](baseline-and-reference.md)；仅以其实现为设计参考，独立开发。
- **迭代兼容**：项目目前是 dev 阶段；迁移策略可按实际产品契约设计，不应默认增加无必要的历史接口兼容层。正式弃用/迁移规则后续冻结。

## 8. Historical design checkpoint

- Round 1: **C 分层混合架构 — 已确认**，见 [decisions.md](decisions.md)。
- Round 2: **A 已提交剧情后决策 — 已确认**；只冻结决策时点，授权/预算/频率仍待议，见 [decisions.md](decisions.md) 与 [architecture.md](architecture.md)。
- Round 3: **C 结构化语义 IR + Provider Adapter + 能力协商 — 已确认**；冻结架构分层而非具体 Schema，见 [provider-protocol.md](provider-protocol.md) 和 [decisions.md](decisions.md)。
- Round 4: **B 跨家族分阶段完整覆盖 + 三层配置架构 — 已确认**，见 [decisions.md](decisions.md) D-004 与 [provider-protocol.md](provider-protocol.md) §5。
- Round 5: **C 状态驱动的分层视觉权威 — 已确认**；区分 Identity / State / References，严格源 Revision/Branch/显示权限和非事实边界，见 [decisions.md](decisions.md) D-005 与 [visual-continuity.md](visual-continuity.md)。
- Round 6: **C 证据驱动的混合视觉更新与冲突仲裁 — 已确认**；
- Round 7: **C 分级事件驱动 + 场景价值筛选 + 隔离预算 + 持久可靠作业 — 已确认**，见 [decisions.md](decisions.md) D-007 与 [visual-director.md](visual-director.md) §6。
- Round 8: **C 场景感知自适应导演 — 已确认**；跨回合 Scene/Shot，默认权重 30/25/20/15/10、75/55 分层，自动默认关闭、平衡节奏、独立可调预算与 Job Ledger 恢复；详见 [decisions.md](decisions.md) D-008 和 [visual-director.md](visual-director.md) §7。
- Round 9: **C 分层 Native Media Studio + 不可变衍生 DAG + Regenerate/Img2Img/Inpaint/Upscale/Gallery — 已确认**，见 [decisions.md](decisions.md) D-009 与 [media-editing-gallery.md](media-editing-gallery.md) §4。
- Round 10: **C 能力感知的可逆 Media Studio — 已确认**；Canonical Mask 草稿/提交隔离、显式跨 Provider 编辑/许可、异步版本默认先入历史、引用安全 GC、SavePoint 可编辑闭包与参考晋升，见 [decisions.md](decisions.md) D-010 与 [media-editing-gallery.md](media-editing-gallery.md) §6。
- 见 [decisions.md](decisions.md) D-011 与 [media-precision.md](media-precision.md)。
- **E0 收口审计**：当时 D-001～D-013 无架构方向级矛盾，15 项接口与外部证据缺口登记在 [e0-closure-audit.md](e0-closure-audit.md)；E0 阶段未创建 feat。后来用户授权实施，S0～S6 已在既有 feat 完成并合入 main，实际结果见 [Record](../../../records/feat/native-visual-generation-deepening.md)。L3 与真机证据按实际环境仍列 `not_run`。

## 9. Material routing/design changes

2026-10-14：新建此 Bundle；与旧 NovelAI 插画 Plan 独立，记录第一轮选定方向。

2026-10-14：Round 2 用户批准方案 A，冻结 Post-Commit Visual Director，禁止现阶段将流式候选视为权威来源或提前向图片 Provider 发请求；更新 D-002 与阶段索引。

2026-10-14：Round 3 用户批准方案 C，冻结中立的 Image Prompt IR、Provider Adapter、能力协商及统一证据/资产边界（D-003）；新增 `provider-protocol.md`。

2026-10-14：Round 4 用户批准方案 B，冻结 P0/P1/P2 后端覆盖、交付优先级与 Connection/Target/Rendering 三层配置，及任务 > 标注 > 作品 > 全局的覆盖顺序（D-004）。

2026-10-14：Round 5 用户批准方案 C，冻结 Visual Identity / Visual State / Visual References 三层权威、源 Revision/Branch 隔离、玩家显示授权和不从图片反写剧情事实（D-005）；新增 `visual-continuity.md`。

2026-10-14：Round 7 用户批准方案 C，冻结事件驱动分级筛选、有条件 Director LLM、可跳过/去重、Planner/Image 双独立预算、用户授权、持久 ImageJob、远端对账、不确定提交不盲目重试与幂等版本发布（D-007）。

2026-10-14：Round 8 用户批准方案 C，冻结跨 Commit Scene/Shot、非线性时点、五因素可解释评分（30/25/20/15/10、75/55 初始阈值）、节制/平衡/沉浸软节奏、自动默认关闭、可调滚动额度、云自动预算默认 0/未授权、Durable Job Ledger 租约/fencing/远端对账/不确定不重发与 ImageVersion CAS/补偿（D-008）。

2026-10-14：Round 9 用户批准方案 C，冻结 Native Media Core/Editing Workflow/Media Studio 分层、不可变多父衍生 DAG、Regenerate/Img2Img/Inpaint/Upscale 操作类别、Gallery、AssetStore/SavePoint/Branch/Reference 引用保护和分期实施边界（D-009）。

新增 [media-precision.md](media-precision.md)。

更新 [provider-editing-matrix.md](provider-editing-matrix.md)，严格标记没有执行真实模型/Workflow/端点联测。

修正旧轮次状态标签和模块路由；**未创建 feat、未修改 main、未运行产品或付费图像 API**。工程合同仍须按 S0/S1～S6 阶段完成，不能把审计当实现。设计期不以 Plan 代替实施 Record。
