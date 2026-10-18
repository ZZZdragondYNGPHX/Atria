# Atria Native Prompt Preset / Behavior 深化企划（唯一入口）

> **当前设计状态（2026-10-18）**：D1–D8 原有功能合同和后端实施授权继续有效，E0/三端验收尚未收口。用户已确认在原生 Program/Stage/Module/PromptCompiler/PromptIR 中采用**单一显式顺序、受控 Anchor、请求级 Contribution 与 exact 增量继承**，并确定**双入口、一套资源**：Library 提供无需创建游戏的独立提示词创作；Game Studio 在同一资源权威下精确引用、Fork/Derive；Play 仅按授权选择与覆盖。生图作者可独立创作风格/模板的目标工作流复用原 Native Image Target/Rendering/ImagePromptIR/Job/Asset 权威，**不与文本编译器合并**。编排详见 [D5](semantic-ir-lowering.md)，编辑与作者入口详见 [D8](preset-studio-experience.md)，前端布局仍按[设计建议](../../architecture/atria-frontend-audit/design-proposal/atria-frontend-guidelines.md)继续讨论。现有独立测试与无 Session 的付费试生成尚未证明接通；本轮仅修订设计，不宣称已实施。正式工程状态以 [backend-implementation.md](backend-implementation.md)、[E0](e0-audit.md) 与同一 Record 为准。

> Task ID: `refactor/atria-native-prompt-preset-deepening`。Primary Workspace: `main`；当前产品实现使用同名 `refactor/atria-native-prompt-preset-deepening` 语义分支，文档仍在独立 `docs` 长期分支。仓库治理见 [README](../../../README.md)。全程更新同一个 Plan Bundle 与同一份 [Record](../../../records/refactor/atria-native-prompt-preset-deepening.md)。

- 讨论日期：2026-10-15。
- **D1 已冻结**：方案 **B**（深化原生 Behavior / Expression / Prompt 体系），优先方向 **RP 文笔与 Agent 行为并重**；不另造既有基础设施。
- **创作自由 D1/D2 已冻结**：重视成年人合法虚构 RP 的文体表现、强作者指令和创作自由，避免 Atria 自己对合法成熟题材无端说教或误拒；先进 Jailbreak / Prompt Injection 研究用于机制、创作优化和误拒诊断，不复制攻击载荷，不承诺绕过 Provider 固定限制。
- **D2 已冻结**：**J2 编译型 Authorial Control + F2 结构化控制与完整自由文本 + R3 拒答诊断/合法优化/用户控制 Route**；具体物理 Schema 和实现仍待后续阶段。
- **D3 已冻结（2026-10-15）**：**E2 分层表达 + A2 默认严格且明示有限叙述委托 + K2 来源先行/文学审读 + G1 单 Narrator 优先、条件质量回路**。五种逻辑职责不是五个默认模型；详细合同见 [narrative-behavior.md](narrative-behavior.md)。
- **D4 已冻结（2026-10-15）**：**B2 V3 Node 独立精确 Program/Route 绑定 + I2 原生 parentRef/derive 与 E2 类型化 Overlay + C2 Host NodeAttempt 原 Compiler 编译/证据**。当前 Node/Route/Program 接口未打通，仍为未来真实工程阻塞，详见 [agent-behavior-binding.md](agent-behavior-binding.md)。
- **D5 已冻结（2026-10-15）**：**S2 Typed SemanticBlocks + L2 Capability-aware Provider Lowering + D2 分级可解释诊断 + K2 Stable/Dynamic Scoped Cache + T2 Context/Provider 双阶段 Token/Compute 预算**；详见 [semantic-ir-lowering.md](semantic-ir-lowering.md)。设计冻结不表示物理接口或质量已验收。
- **D6 已冻结（2026-10-15）**：**U2 每消费者 Source-bound Context + E2 类型化认识地位 + H2 来源完整的长会话分层 + V2 Source-aware 定向失效及消费前复验**；仅消费现有 V3 C2 / HCM-01–08，不重建 Memory/Context/Actor/World 权威。详见 [context-memory-consumption.md](context-memory-consumption.md)。
- **D7 已冻结（2026-10-15）**：**Q2 文学/角色/Agent 多维 QualityProfile 与不可抵消硬约束 + F2 原 Experience 来源/根因归属 + O2 合法成熟虚构 RP 过度拒答正反控制 + P2 条件反思候选/独立评价/Review/PlanRevision/PlanBinding CAS 发布**。这是设计取舍，实际来源及 V3 `plan-prompt` 闭环待实施；见 [quality-evolution.md](quality-evolution.md)。
- **D8 已冻结（2026-10-15）**：W2 原生 Library/Studio/Play 三域协作 + R2 单 Draft 结构化/完整原文无损双编辑 + P2 Authored/Effective/Provider Wire 真实预览与精确 Diff + I2 来源驱动质量/故障 Inspector + M2 Windows/CachyOS Linux/Android Termux 全功能交互等价；详见 [preset-studio-experience.md](preset-studio-experience.md)。**仅冻结功能/交互语义；视觉审美完全留待用户后续外部设计参考与多轮讨论，不由本助手决定。** **后续确认的入口细化**：独立预设作者无需建游戏，Game Studio 以引用/派生消费同一资源，视觉作者独立创作入口复用原视觉资源与 Job 权威，均不是新增顶层域或第二存储。 **已确认专业调试方向**：Authored/Effective/Provider Wire 同源观察、来源级 Trace、按需精确 Diff、Host 受权独立测试；付费试读须另外确认，不实时自动试写，实际实现需对照当前 Host 证明。
- **D9/E0 本地续审（NOT_CLOSED）**：已从远端有界首审推进为本地全产品静态索引与核心消费者追踪；物理接口、动态来源消费者和开发前 Gate 仍见唯一 [e0-audit.md](e0-audit.md)，未写为全量通过。
- 前轮前端静态盘点基线：main@695acf3bcad1d42e331459189532a76056278bec、V3@31bef95723885c1547a9c3686200cbaf122799a8；保留其固定索引证据。2026-10-16 后端从同一 main 建语义分支，V3 已并发推进到4e0ce4bad；当前实现与增量只见 E0 §8 / 同一 Record，不把旧静态索引或另一任务工作树混入本任务提交。
- **全产品前端研究已整理**：[Atria 前端功能与交互审计](../../architecture/atria-frontend-audit/index.md) 独立提供页面/控件/状态、端到端操作、组件问题、三端矩阵与处置。外部 [三份设计输入](../../architecture/atria-frontend-audit/design-proposal/atria-function-presentation.md) 已收到，189 个功能组映射无缺漏/重复；它们仍不是第二个功能权威。后端接口见 [实施落点](backend-implementation.md)，交 Claude Code 的实施提示词见 [前端交接](../../architecture/atria-frontend-audit/claude-code-frontend-prompt.md)。

## 核心目标与实施边界

1. **创作表达**：Narrator 文笔、风格、叙事节奏、角色台词与人格、成人主题表达/浪漫张力、玩家自主权、避免全知与说教、自由自定义作者指令。
2. **Agent 行为**：Agent Task、Evidence、Constraints、输出契约和可引用的创作控制作为 V3 节点可编译输入；普通 RP 单模型优先，按证据需要增派 Agent。
3. **Prompt 不是事实或权限**：World/Session/Memory/Cognition 的来源选择与真实状态仍由原 Domain Authority；TaskGraph/Run/Effect/Receipt 与 Approval 仍属**唯一 Node Native Host V3**；Tool/Secret/Provider Model/预算/Eval/Experience 沿用原服务。
4. **正式重构零兼容**：不迁移 ST 预设/旧注入 depth/old prompt_order、旧 Agent Workspace/Director/Loop/Agenda 等设置；不保留 ST 旧数据/接口兼容层、双读双写和旧模式转换。但原生 exact refs、Immutable Revisions、CAS/receipt 的正确性不可删。
5. **负责任的“破限”研究**：可研究公开 Jailbreak 攻击机制及局限，并用于防误拒评测、创作者意图编译和调试；不采用偷换 system 权限、恶意数据提权、泄密或绕过外部 Provider 固定限制作为产品能力；不得承诺跨厂商“万能破限”。

## 职责归属 / 只读依赖

- [V3 Native Orchestration](../atria-native-orchestration-v3/index.md)：T2 单 Host、Plan/Run/Effect/Receipt、计划绑定、权限、预算和 UI 主权；本 Plan 不复制这些合同。
- [V3 Narrative Quality](../atria-native-orchestration-v3/narrative-project-quality.md)：Narrative Intent、Actor Cognition、Expression、唯一 Narrator、Judge/Review、玩家自主权等领域行为。
- [V3 Interface Contracts](../atria-native-orchestration-v3/interface-contracts.md)：`plan-prompt` 的 exact PromptModuleRef、Evolution target、PlanBinding 与可靠回执，V3 仍在实现。
- [Native Model/Prompt/Runtime](../atria-model-prompt-settings/index.md)：已实现 Prompt Program/Module、Generation Profile、RouteResolver、PromptCompiler、PromptIR 和 RequestContextPlan。
- [此前大型技术调研](../../architecture/model-prompt-context-frontier-research.md)：2026-10-06 Prompt/Context/RP/优化研究是基线，本 Plan 不复制其完整内容。
- 原 Agent Intelligence/Experience/Eval、Hybrid Memory、Game Runtime、Studio/Package 与 Provider Port 继续保有现存权威。

## 文档路由（先 index，再本轮模块）

| 文件 | 唯一职责 | 何时阅读 |
| --- | --- | --- |
| [decisions.md](decisions.md) | 用户明确冻结的选择 + 未决点 | **每轮** |
| [baseline.md](baseline.md) | 源码证据、旧注入与新 Native 能力、实证待查 | 第二轮/E0 |
| [research.md](research.md) | 外部 2024–2026 来源与“破限方法”机制/适用性矩阵 | 第二轮/证据更新 |
| [creative-injection.md](creative-injection.md) | **D2 唯一冻结模块**：J2/F2/R3、正式作者指令、成年人虚构 RP、Provider/拒答边界与验收 | D2 及后续相关实现 |
| [narrative-behavior.md](narrative-behavior.md) | **D3 已冻结**：E2/A2/K2/G1，Narrator/Character/Agent、反全知、玩家自主权与按需质量回路 | D3 及后续表达与质量实现 |
| [agent-behavior-binding.md](agent-behavior-binding.md) | **D4 已冻结**：B2/I2/C2 Node Exact Program/Route、精确父级继承/显式差异、NodeAttempt 快照；明确接口缺口 | D4 / D5 / 最终 E0 |
| [semantic-ir-lowering.md](semantic-ir-lowering.md) | **D5 已冻结**：S2/L2/D2/K2/T2、Role/Context 信任边界、Fallback、缓存与预算；原生语义位置、来源贡献与正文宏的职责边界 | D5 / E0 / 提示词编排讨论 |
| [context-memory-consumption.md](context-memory-consumption.md) | **D6 已冻结**：U2/E2/H2/V2 的受众 Context 投影、认识地位、长会话证据、请求级装配与 Source-aware 失效/复验 | D6 和实施相关接口 |
| [quality-evolution.md](quality-evolution.md) | **D7 已冻结**：Q2/F2/O2/P2；受审文学/Agent 质量、来源归因、合法误拒、精确候选与受控发布 | D7 / E0 / 质量实施 |
| [preset-studio-experience.md](preset-studio-experience.md) | **D8 功能与交互已冻结**：W2/R2/P2/I2/M2；原生创作大纲、受信三层预览、来源 Trace/按需 Diff、独立作者受控测试；具体视觉未冻结 | D8 / 前端讨论与实现 |
| [e0-audit.md](e0-audit.md) | **D9/E0 未收口**：真实消费者静态台账、跨合同缺口、实施依赖与分支前置 Gate | 第九轮/开发交接 |
| [全产品前端研究](../../architecture/atria-frontend-audit/index.md) | **独立研究输入，非最终设计**：页面/组件/交互/跨端/来源与外部设计AI委托；详细状态仍归E0/Record | 外部设计前；后续HTML与双文档覆盖核对 |
| [同一 Record](../../../records/refactor/atria-native-prompt-preset-deepening.md) | 真实文档提交、代码/测试/验证状态与未完成项 | 每轮更新 |

## 后续轮次（D1–D8 功能语义已冻结，D9/E0 未收口）

| 轮次 | 核心议题 |
| --- | --- |
| D1 完成 | 方案 B，RP 文笔与 Agent 行为并重；重构无旧兼容 |
| **D2 已冻结** | **J2 + F2 + R3**；创作控制、Provider 与过度拒答研究边界已定 |
| **D3 已冻结** | **E2 + A2 + K2 + G1**；分层表达、有限委托、来源先行、稀疏质量回路 |
| **D4 已冻结** | **B2 + I2 + C2**；V3 精确绑定/原 Native 继承/Host Attempt 编译及接口缺口 |
| **D5 已冻结** | **S2 + L2 + D2 + K2 + T2**：语义 IR、Lowering、诊断、缓存及双阶段预算 |
| **D6 已冻结** | **U2 + E2 + H2 + V2**：合法受众投影、信息地位、长会话保真与定向失效 |
| **D7 已冻结** | **Q2 + F2 + O2 + P2**；文学/Agent 评价、真实归因、合法误拒、精确候选/评审发布 |
| **D8 已冻结（仅功能/交互）** | W2 + R2 + P2 + I2 + M2；最终视觉审美与实际 HTML 参考尚未决定 |
| **D9/E0 审计中** | 全量消费者闭包、跨合同缺口、实施依赖、开发授权前置 Gate；尚未收口 |

## 当前事实

D1–D8 功能/交互语义保持，视觉未由本后端任务冻结。用户已授权正式实施；后端 `760327891` 已提交到同名语义分支，未合 main。受信 Host Program/fallback、Typed trust/lowering、无损 literal/表达范围、来源消费前复验、未发布 Draft 三层预览/Diff、浏览器私密诊断边界和质量元数据/协议拒答分类已有针对性本地证据，详见 [E0 §8](e0-audit.md#8-2026-10-16-后端实施增量与真实剩余-gate) 与同一 Record。**整体 E0 仍 NOT_CLOSED**：V3 实际 Node/Plan-prompt/发布组合、旧消费者同切、真实受审独立质量来源、长会话质量与前端/三端仍未完成。外部三文件是实施参考，HTML 漏项不能减少完整功能。
