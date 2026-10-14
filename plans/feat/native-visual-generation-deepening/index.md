# Atria 原生视觉生成系统深化 — Plan Index

- **Task ID**: `atria-native-visual-generation-deepening`
- **Primary Workspace**: `main`（Atria 产品源码）；`docs` 仅承载本 Plan
- **Status**: **正式实施中**（2026-10-14，用户授权连续实施 S0～S6；D-001～D-013 和 E0 保持冻结）。
- **Implementing Branch**: `feat/native-visual-generation-deepening`；独立任务 source worktree，产品不与 docs 合并。
- **Verified code baseline (remote only)**: `main@7e1045ab836c22cafbc92c5de056ad701f56e723`
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

**确认边界**：Round 1 D-001 = 分层混合；Round 2 D-002 = Post-Commit Visual Director；Round 3 D-003 = 语义 IR + Adapter + Capabilities；Round 4 D-004 = P0/P1/P2 后端及 Connection/Target/Rendering Profile；Round 5 D-005 = 状态驱动的 Visual Identity / Visual State / Visual References 三层权威；Round 6 D-006 = 证据驱动的混合 Visual State 更新、冲突仲裁与按用途参考图筛选；Round 7 D-007 = 分级事件驱动的自动场景价值筛选、预算隔离与持久 ImageJob 原则；Round 8 D-008 = 跨回合 Scene/Shot、可解释的自适应镜头评分、可调自动预算默认与持久作业恢复策略；Round 9 D-009 = 分层 Native Media Studio + 不可变图片衍生 DAG + Regenerate/Img2Img/Inpaint/Upscale/Gallery 功能范围；Round 10 D-010 = 能力感知的可逆 Mask/编辑、跨 Provider 显式执行、历史版本选择、可达 GC/存档闭包、参考晋升原则；Round 11 D-011 = Canonical Mask/草稿恢复、模型级编辑能力声明、分层 Gallery、双扫描 GC 和 SavePoint 编辑闭包及导入验收；Round 12 D-012 = P0/P1 的协议家族/有效 Target 双层能力矩阵、Required/Preferred/Optional 显式降级授权、L1/L2/L3 三级验收责任；Round 13 D-013 = **统一 Native 逻辑 API/数据权威、三层设置与三端响应式 UI、7 阶段/25 子阶段 Core-first/垂直切片交付及最终验收方向**。详见 [decisions.md](decisions.md)、[provider-protocol.md](provider-protocol.md) 和 [visual-continuity.md](visual-continuity.md)。第 2～4 条为 Native 基线/合规约束而非额外表决；第 5 条一般的用户控制仍受 D-007/D-008 的产品默认与授权硬边界约束。**Round 8 已确定**评分框架/初始权重、软节奏、用户可调硬额度、云自动付费默认未授权、Job 恢复方向；精确请求/数据库 Schema、Provider 子能力与计费实现、状态/参考图阈值、**D-011 已冻结**上述 Mask/草稿/Gallery/GC/SavePoint 的中立协议及可调默认；**D-012 已冻结能力矩阵的表达、已知差异、约束降级原则和验收分层**；实际连接/模型/Workflow 的支持状态不能从文档推定，需逐 Target 验证，部分真实联测依赖用户授权。**D-013 已冻结** API/Schema 领域与读写边界、三层配置/跨端 UX 和 S0～S6/25 子阶段的规划方向；精确字段/路由/DB 事务、Live Provider 证据与可能阻塞设计交接须由随后 E0 审计列明。

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
| [media-precision.md](media-precision.md) | **D-011 已冻结** Mask 8-bit 语义/像素坐标、命令+Checkpoint 草稿、模型/Workflow 能力声明、Gallery 默认、两阶段 GC/30/7 日宽限、完整 SavePoint/导入验收 | 媒体协议/存档/GC、Round 12 依赖、S5/S6 |
| [provider-editing-matrix.md](provider-editing-matrix.md) | **D-012 已冻结** P0/P1 文档矩阵/Target 实际能力分离、操作与组合三态、Required/Preferred/Optional 显式降级及 L1/L2/L3 分层验收 | Provider Adapter/模型能力/预算/测试，S2/S6；实施时必读 |
| [native-contracts-ui-delivery.md](native-contracts-ui-delivery.md) | **D-013 已冻结** Native 统一资源与 API 职责域、Connection/Target/Rendering UI、Windows/CachyOS/Termux、S0～S6/25 子阶段及 L1/L2/L3 验收 | 后续 S0 与各阶段实现/验收路由；精确字段依 E0 分类 |
| [e0-closure-audit.md](e0-closure-audit.md) | **E0 静态审计已完成**：D-001～D-013 逐项核对、真实代码差距、E0-01～15 未决接口/外部证据、风险、S0～S6 依赖及正式 Codex 交接条件 | **正式实施前必读**；它是设计审计而非 Record/HANDOFF |

后续如确定 Provider、参考图、视觉身份、媒体编辑或缓存等独立大模块，应只新增对应模块，不在 `index.md` 重复详细规格。

## 4. Candidate layers (not yet a frozen interface)

`Native Narrative Snapshot / Project World State`
→ `Visual Intent & Director`
→ `Context / Character / Reference Resolution`
→ `Image Prompt IR & Backend Adapter`
→ `Native Job / Budget / Cancel`
→ `AssetStore / Image Versions / Branch Save`
→ `Display / Review / Edit`.

**已冻结**：正式提交后决策（D-002）；语义 IR + Adapter + Capabilities（D-003）；P0/P1/P2 与 Connection/Target/Rendering Profile（D-004）；**Visual Identity（稳定身份）+ Visual State（时点状态）+ Visual References（用途明确的参考图）分离**，不得跨分支污染叙事或泄露信息（D-005）；混合解析已提交正式状态与有锚点的叙事变化，经硬门禁/冲突审查、参考图用途过滤与 Provider 能力验证（D-006）；分级 Director 发现价值候选、按需调用 LLM、允许跳过、预算分离与持久 ImageJob（D-007）；Scene/Shot 时序、可解释自适应评分、初始频率/额度、云端金额默认不授权及 Job 状态对账/幂等恢复（D-008）。分层 Media Studio、不可变 ImageArtifact/MediaOperation DAG、Regenerate/Img2Img/Inpaint/Upscale 和 Gallery 为统一媒体链路（D-009）；Canonical Mask 草稿与提交资产分离、显式跨 Provider 能力/费用检查、生成结果先入历史、删除分级与引用可达 GC、SavePoint 闭包/显式参考晋升（D-010）。Canonical Mask、混合草稿恢复、能力声明规范、默认 Gallery、GC 与 SavePoint/导入验收（D-011）。模型/Workflow 的能力矩阵与约束分级、L1/L2/L3 验收合同由 D-012 冻结；D-013 已冻结统一 Native 资源/API 职责、三层设置、三端 UI 和七阶段交付方式。具体 JSON/SQL/HTTP 字段、权限事务与真实 Provider 证据在 E0 审计中标注未决；没有运行 L3 的 Target 仍不得称为可用。

## 5. D-013 已冻结的七阶段/25 子阶段与阅读路由

E0 是**设计收口审计**而非产品 S 阶段：已通过 [e0-closure-audit.md](e0-closure-audit.md) 核查 D-001～D-013、记录 15 项接口/外部验证缺口，**此次未创建 feat**。下一次用户明确授权实施时才按 Governance 使用同一临时 feat 工作分支开展 S0～S6；详细子阶段见 [native-contracts-ui-delivery.md](native-contracts-ui-delivery.md) §5。

| 阶段（子阶段数） | 已定案目标 | 必读 Plan 模块 |
| --- | --- | --- |
| **E0 设计审计（已完成；非开发阶段）** | D-001～D-013 与真实 `main` 基线交叉核查、15 个精确接口/外部证据缺口、交接与最晚阶段 | `index.md` → `decisions.md` → `native-contracts-ui-delivery.md` → [e0-closure-audit.md](e0-closure-audit.md) |
| **S0 契约与 hard cutover（3）** | SourceRef/IR/身份、Native 资源与 API 权威、单一协议替换旧 NovelAI 中立硬耦合 | `native-contracts-ui-delivery.md` → `provider-protocol.md` / `architecture.md` |
| **S1 Job/Media 中立内核（4）** | Connection/Target/Rendering、持久 ImageJob/预算、Media DAG/AssetStore、SavePoint/GC 安全 | `provider-protocol.md` → `visual-director.md` → `media-precision.md` |
| **S2 P0 后端（3）** | NovelAI 垂直薄切片，然后 ComfyUI、OpenAI Images 的生成/编辑/Workflow 能力 | `provider-editing-matrix.md` → `provider-protocol.md` → `native-contracts-ui-delivery.md` |
| **S3 视觉连续性/导演（4）** | Actor/VisualState/References、Scene/Shot、导演评分/三种模式、审批/频率/预算 | `visual-continuity.md` → `visual-director.md` |
| **S4 Media Studio/Gallery（4）** | Mask Checkpoint、四类编辑操作、Gallery/晋升、GC/可编辑 SavePoint | `media-editing-gallery.md` → `media-precision.md` → `provider-editing-matrix.md` |
| **S5 P1 后端（3）** | Gemini Native Image、SD WebUI/Forge、RunningHub 与 P2 Adapter 扩展机制 | `provider-protocol.md` → `provider-editing-matrix.md` |
| **S6 三端与最终验收（4）** | Windows、CachyOS/KDE、Android Termux/手机浏览器，性能/安全/CI/文档交付 | `native-contracts-ui-delivery.md` → `media-precision.md` → 各被改动模块 |

开发流程按 [Governance](../../../README.md) 维护**同一份**正式 `records/feat/native-visual-generation-deepening.md`，每阶段记录真实 HEAD、自动/CI/外部验收与未运行项，不在阶段间反复创建/删除 feat 分支或要求人为重复批准。产品功能/Provider 范围受既有 D-004/D-009 限制，P1 不得成为未兑现的“可选未来”。视频、完整 DCC/视频剪辑及额外发行平台仍未纳入批准的当前实施范围。

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
- Round 11: **C Canonical Raster Mask + 混合草稿检查点 + 安全媒体闭包 — 已确认**；0 保留/255 编辑、原图像素空间、默认空闲 2 秒/50 命令 Checkpoint、目标级能力声明、当前分支 Gallery、30/7 天可调 GC 宽限、SavePoint 完整可编辑和安全导入验收。见 [decisions.md](decisions.md) D-011 与 [media-precision.md](media-precision.md)。
- Round 12: **C 分级约束协商 + 显式降级 + L1/L2/L3 验收 — 已确认**；P0/P1 文档家族矩阵与 Target 三态分离，真实可用性按连接/型号或 Workflow 验证，见 [decisions.md](decisions.md) D-012 与 [provider-editing-matrix.md](provider-editing-matrix.md)。
- Round 13: **C Core-first 强契约/端到端切片/七阶段完整交付 — 已确认**，冻结统一 API/数据领域、三层配置、三端响应式 UI、7 个大阶段/25 子阶段及 L1/L2/L3/跨端验收原则，见 [decisions.md](decisions.md) D-013 与 [native-contracts-ui-delivery.md](native-contracts-ui-delivery.md)。
- **E0 收口审计：已完成（静态/条件就绪）**。详见 [e0-closure-audit.md](e0-closure-audit.md)：D-001～D-013 没有架构方向级矛盾；精确 API/数据库/持久化、真实 Provider/设备证据等缺口已列 E0-01～15。**本次未创建 feat，用户未授权开始产品开发**。合约字段随 S0 受冻结原则约束地固化；外部 L3 只在获得权限时执行或标 not_run。
- **E0 已登记但尚未完成的实施合同**：IR/资源/数据库/HTTP SDK 字段、跨 Worker Job/预算/源提交事务、Reference/第三方上传授权、Provider 费用/能力/L3、三端 UI 细节/真机证据、SavePoint 容量/GC 与数据 hard cutover；每项有最晚 S 阶段与 Codex/外部责任，见 [e0-closure-audit.md](e0-closure-audit.md) §3。D-013 的阶段路线与安全约束已冻结，未批准的视频/成熟多层编辑/新平台**不属于**本工程。
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

2026-10-14：Round 10 用户批准方案 C，冻结能力感知、可逆的 Canonical Mask 编辑工作台，跨 Provider 显式能力及费用检查、异步版本预览/选择隔离、hide/collection/soft_delete/physical_gc 分级引用安全、SavePoint 可展示/可编辑媒体闭包和用户批准的身份/服装/画风/场景参考资产晋升（D-010）。

2026-10-14：Round 11 用户批准方案 C，冻结 8-bit 0 保留/255 编辑的原图像素 Mask、2 秒/50 命令混合草稿、模型/Workflow 级三态编辑能力及组合门禁、分层 Gallery/版本 CAS、30/7 天双扫描 GC、正式 SavePoint 完整可编辑闭包与 .atriasave 安全导入验收（D-011）。新增 [media-precision.md](media-precision.md)。

2026-10-14：Round 12 用户批准方案 C，冻结 P0/P1 的文档协议家族/真实 Target 两层矩阵、操作/组合能力三态、Required/Preferred/Optional 明确授权降级、费用/身份硬门禁与 L1/L2/L3 独立执行验收（D-012）。更新 [provider-editing-matrix.md](provider-editing-matrix.md)，严格标记没有执行真实模型/Workflow/端点联测。

2026-10-14：Round 13 用户批准方案 C，冻结 Native Resource/API 领域与不可变/可变/CAS/可重建投影分层、Connection/Target/Rendering 三层设置与三端响应式 UI、S0～S6 七阶段/25 子阶段、P0 首个垂直切片和 L1/L2/L3/FS+SQLite/三端验收（D-013）。

2026-10-14：**E0 静态收口审计完成**：建立 [e0-closure-audit.md](e0-closure-audit.md)，逐项复核 D-001～D-013 和 `main@7e1045ab836c22cafbc92c5de056ad701f56e723`，登记 E0-01～15 接口/阶段/真实外部证据缺口、风险与 Codex 交接门槛。修正旧轮次状态标签和模块路由；**未创建 feat、未修改 main、未运行产品或付费图像 API**。工程合同仍须按 S0/S1～S6 阶段完成，不能把审计当实现。设计期不以 Plan 代替实施 Record。
