# Atria Native Prompt Preset / Behavior 深化企划（唯一入口）

> Task ID: `refactor/atria-native-prompt-preset-deepening`。Primary Workspace: `main`（未来实现）；当前仅在独立 `docs` 长期分支讨论与记录，尚未授权产品实现。仓库治理见 [README](../../../README.md)。本企划是 **一个 Plan Bundle**，全过程更新同一组文件与同一份 [Record](../../../records/refactor/atria-native-prompt-preset-deepening.md)。

- 讨论日期：2026-10-15。
- **D1 已冻结**：方案 **B**（深化原生 Behavior / Expression / Prompt 体系），优先方向 **RP 文笔与 Agent 行为并重**；不另造既有基础设施。
- **创作自由 D1/D2 已冻结**：重视成年人合法虚构 RP 的文体表现、强作者指令和创作自由，避免 Atria 自己对合法成熟题材无端说教或误拒；先进 Jailbreak / Prompt Injection 研究用于机制、创作优化和误拒诊断，不复制攻击载荷，不承诺绕过 Provider 固定限制。
- **D2 已冻结**：**J2 编译型 Authorial Control + F2 结构化控制与完整自由文本 + R3 拒答诊断/合法优化/用户控制 Route**；具体物理 Schema 和实现仍待后续阶段。
- **D3 已冻结（2026-10-15）**：**E2 分层表达 + A2 默认严格且明示有限叙述委托 + K2 来源先行/文学审读 + G1 单 Narrator 优先、条件质量回路**。五种逻辑职责不是五个默认模型；详细合同见 [narrative-behavior.md](narrative-behavior.md)。
- **D4 正在讨论（OPEN）**：V3 Node 的精确 Behavior/Prompt Program 绑定、继承及 Host 执行期编译接口；方案见 [agent-behavior-binding.md](agent-behavior-binding.md)，尚未获用户选择。
- 静态审查基线：`main@5eb3bc7652cd9837ca8c555cf74976fab078932c`；本轮 docs 起点 `6384cff476975ccb73ef9ef1ea17d539f0eae9be`；并行 V3 `refactor/atria-native-orchestration-v3@c04f36925189d4064a63bdd6b9ca345ff2bcf805`。E0 必须重新核对实时 refs、依赖闭包、消费者和实际测试。

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
| [agent-behavior-binding.md](agent-behavior-binding.md) | **D4 讨论草案**：Agent Node 绑定、Behavior Program/Native Prompt Program、精确继承、Host 编译与失效 | 第四轮 |
| [同一 Record](../../../records/refactor/atria-native-prompt-preset-deepening.md) | 真实文档提交、代码/测试/验证状态与未完成项 | 每轮更新 |

## 后续轮次（D1–D3 冻结，D4 为待选草案）

| 轮次 | 核心议题 |
| --- | --- |
| D1 完成 | 方案 B，RP 文笔与 Agent 行为并重；重构无旧兼容 |
| **D2 已冻结** | **J2 + F2 + R3**；创作控制、Provider 与过度拒答研究边界已定 |
| **D3 已冻结** | **E2 + A2 + K2 + G1**；分层表达、有限委托、来源先行、稀疏质量回路 |
| **D4 正在讨论** | V3 Agent Node 的 Behavior Program/Prompt Program 精确绑定、继承、Host 编译接口与重编译证据 |
| D5 | 语义 IR、跨模型 lowering、Role/Stage 冲突检测、缓存及 Token 预算 |
| D6 | Context/Memory/Cognition 按 audience/branch/source/time 的信息消费 |
| D7 | 基于 Experience、OR-Bench 风格误拒评价、文学质量与候选演化 |
| D8 | Native Preset Studio/Play UI、预览、Diff、表达控制与跨端易用性 |
| D9/E0 | 消费者闭包与 V3 最新实现审计、接口/实施 Gate、端侧最小验证 |

## 当前事实

已完成 D1–D3 设计冻结与 D4 待选草案、相关远端源码的静态核对；没有产品改动、Node/Provider API 测试、CI、Windows/Linux/Termux 真机或 UI 验证。新 V3 分支接口仍在开发，任何“已具备 Node 独立 Prompt Program 执行”的说法都必须以实际代码证明。
