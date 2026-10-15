# Atria Native Prompt Preset / Behavior 深化企划（唯一入口）

> Task ID: `refactor/atria-native-prompt-preset-deepening`。Primary Workspace: `main`（未来实现）；当前仅在独立 `docs` 长期分支讨论与记录，尚未授权产品实现。仓库治理见 [README](../../../README.md)。本企划是 **一个 Plan Bundle**，全过程更新同一组文件与同一份 [Record](../../../records/refactor/atria-native-prompt-preset-deepening.md)。

- 讨论日期：2026-10-15。
- **D1 已冻结**：方案 **B**（深化原生 Behavior / Expression / Prompt 体系），优先方向 **RP 文笔与 Agent 行为并重**；不另造既有基础设施。
- **额外需求已纳入 D1**：用户高度重视成年人合法虚构 RP 的表达自由，要求保留和加强创作者可控的高强度指令注入、丰富题材及免于不必要说教/误拒的写作体验。第二轮专门研究学术 Jailbreak / Prompt Injection、社区注入法和它们能否安全、可靠地转译为 Native 架构。
- **D2 已冻结（2026-10-15）**：**J2 编译型 Authorial Control + F2 结构化编辑与完整自由文本 + R3 拒答诊断/合法候选/用户控制 Route**。原生创作指令、成年人合法虚构 RP、真实 Provider 限制及先进研究的适用边界已决；物理 Schema/实现尚未批准。**D3 进入讨论，不提前冻结。**
- 代码静态基线：`main@5eb3bc7652cd9837ca8c555cf74976fab078932c`；本轮 docs 起点 `073d03f0f16d2826cf7cb8e5ff2015c168229a70`；并行开发 `refactor/atria-native-orchestration-v3@c04f36925189d4064a63bdd6b9ca345ff2bcf805`。以实际 HEAD 为准，E0 仍需重新完成动态消费者审计。

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
| [narrative-behavior.md](narrative-behavior.md) | **D3 讨论草案**：Narrator 文笔、Character Expression、Agent Behavior、反全知与玩家自主权 | 第三轮 |
| [同一 Record](../../../records/refactor/atria-native-prompt-preset-deepening.md) | 真实文档提交、代码/测试/验证状态与未完成项 | 每轮更新 |

## 后续轮次（D1–D2 冻结，D3 仍为候选）

| 轮次 | 核心议题 |
| --- | --- |
| D1 完成 | 方案 B，RP 文笔与 Agent 行为并重；重构无旧兼容 |
| **D2 已冻结** | **J2 + F2 + R3**；创作控制、Provider 与过度拒答研究边界已定 |
| **D3 正在讨论** | Narrator/Scene/Character Expression、Agent Behavior、叙事节奏、玩家自主权与反全知 |
| D4 | V3 Agent Node 的 Behavior Program 与编译绑定，避免二次编排 |
| D5 | 语义 IR、跨模型 lowering、Role/Stage 冲突检测、缓存及 Token 预算 |
| D6 | Context/Memory/Cognition 按 audience/branch/source/time 的信息消费 |
| D7 | 基于 Experience、OR-Bench 风格误拒评价、文学质量与候选演化 |
| D8 | Native Preset Studio/Play UI、预览、Diff、表达控制与跨端易用性 |
| D9/E0 | 消费者闭包与 V3 最新实现审计、接口/实施 Gate、端侧最小验证 |

## 当前事实

已完成 D1–D2 设计冻结、远端静态源码阅读与公开文献研究；D3 未决定。没有产品改动、Node 测试、Provider API 测试、CI、Windows/Linux/Termux 真机或 UI 验证。不得以文献中的成功率充当 Atria 自身效果。
