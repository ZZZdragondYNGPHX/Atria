# 一手研究与工程判断

- Reviewed: 2026-10-06
- Scope: 原研究覆盖的六个主要方向及 Character / 社会认知 / 表达 / 协议 / 训练兼容性。
- 这是架构调研，不是论文复现；没有下载 benchmark 数据、训练模型或执行论文实验。

## 1. 可采用的方向与证据边界

| 方向 || 可以支持的判断 | 进入产品前还需要什么 |
| --- | --- | --- | --- |
| Trace → Eval → Improvement | [OpenAI Agent Improvement Loop](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop)；官方流程 / gate 示例 || 将示例中的模拟反馈与真实用户反馈分开；用 Atria outcome 建评价 |
| 多维 Agent Eval | [Anthropic Agent Evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)；定义与 graders 部分 | outcome、transcript、代码、模型与人工评价各有职责 | 针对 RP / Project 固定不同 rubric；隔离工具副作用；多次 trial |
| Prompt evolution | [GEPA v2](https://arxiv.org/abs/2507.19457v2)；论文摘要 / 版本 | 从轨迹反馈生成候选并以评测选择，适合权重训练之前的探索 | 任务分布、候选预算和独立案例；不能将其平均 benchmark 收益直接当产品承诺 |
| Context / playbook 演化 | [ACE v3](https://arxiv.org/html/2510.04618v3)；正文 context collapse 与增量更新 | 整体重写经验库容易损失细节；增量规则及适用范围更可控 ||
| Skill 生命周期 | [MUSE-Autoskill v2](https://arxiv.org/abs/2605.27366v2)；摘要，Under Review | Skill 的创建、复用、经验、管理、评测应统一生命周期 | 复用现有 Skill 发布权威；|
| Persistent Goal | [Using Goals in Codex](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex)；官方完成契约 / 生命周期说明 | 目标可作为持久状态，由证据、预算与控制权管理 | Atria 的目标主体、写入权威、branch 继承和 wake 机制需独立设计 |
| BDI / ToM | [ToM-Agent](https://arxiv.org/abs/2501.15355)；摘要 | 对他者 BDI 的推断、confidence 与预测误差应分开 | Actor 可见证据与限定 ToM 深度；推断不能写成他者的真实心理 |
| 策略假设与反馈 | [Hypothetical Minds](https://arxiv.org/abs/2407.07086v2)；摘要 | 可根据后续行为调整关于他者策略的假设 | 游戏 benchmark 不直接证明开放 RP 长期一致性；要在本地场景测收益 |
| 社会状态模型 | [Social World Models v3](https://arxiv.org/html/2509.00559v3)；表示、社会交互、limitations 部分 | 隐藏心理、观察、行动和社会关系值得显式表示 | parser 可能误读模糊 / 文化语境；需要 provenance、冲突与不确定性 |
| 心理约束与双过程 | [PersonaForge](https://aclanthology.org/2026.findings-acl.386/)；ACL 摘要 | 稳定 traits、动态 state 与选择性重认知是有价值的候选 | 作者 reported 改善不意味着 Atria 同样收益；心理学 schema 应可选而非强制 |
| 推理与训练的角色对齐 | [Psy-CoT / RAPO](https://arxiv.org/abs/2606.27025)；摘要 | 感知 / appraisal / 表达可分离；reward 可能被通用话术投机 | 不要求暴露或保存模型私有思维链；|
| 因果角色经历 | [DREAM](https://arxiv.org/abs/2608.05170)；摘要 | 事件的时间 / 因果关系能成为角色变化依据 | 复用 Memory 事件，不新建事实图；认知变化要有受控采纳路径 |
| 知识边界 | [CHARM v1](https://arxiv.org/html/2609.01352v1)；评价协议、BA/BC 指标及正文 | 识别角色未知与实际约束输出是两个问题 | 主要用 MCQ / abstention，且核心 BA、BC 在独立 runs 测量；不能当作自由文本 firewall 已被证明 |
| Persona memory 的行为应用 | [MREval](https://aclanthology.org/2026.findings-acl.1175/)；ACL 摘要 | Anchoring / Selecting / Bounding / Enacting 需分别评测 | 召回命中并不等于行为正确；为 Atria 加 applicability 和行为用例 |
| 长期社会交互 | [LIFELONG-SOTOPIA](https://arxiv.org/abs/2506.12666)；摘要 | 全量历史或更强 memory 不会自动保证长期社会能力 | 长期目标、关系、连续性与成本分别测量，不只看最终一句回复 |
| 长期陪伴 | [LifeSide](https://arxiv.org/abs/2606.04660)；摘要 | 用户状态、隐私边界、情绪与环境需要跨 session 评测 | entertainment RP 与真实用户模型分域；不能把互动推断自动固化为用户画像 |
| Relationship competence | [CompanionBench v2](https://arxiv.org/abs/2608.02046v2)；摘要 | 沉浸与关系能力不是同一指标；多 judge 与确定性信号互补 | 不能将关系目标简化成分数越高越好或通用增加依赖 |
| Judge 可靠性 | [PersonaEval](https://arxiv.org/abs/2508.10014)；摘要 | 角色识别错误能影响 RP judge；不能只有单一评分器 | 校准、分歧显示、盲评、人工偏好与独立案例 |
| RP 多维评价 | [RPEval](https://arxiv.org/abs/2505.13157)；摘要 | 情绪、决策、角色一致性等指标应分开 | 保留用户自己的文风 / 设定规则，不能套成唯一评分标准 |
| Memory → Tool action | [Mem2ActBench](https://aclanthology.org/2026.acl-long.370/)；ACL 摘要 | Project Agent 也要测记忆如何约束工具选择和参数 | 工具只读 recall 命中不能冒充任务完成；|
| 潜在约束的记忆 | [LoCoMo-Plus](https://aclanthology.org/2026.acl-long.1150/)；ACL 摘要 | 应测试未显式重述的历史约束与当前行为一致性 | 合理更新 / 撤回旧约束，避免检索旧规则后机械应用 |
| Language World Model | [Qwen-AgentWorld](https://arxiv.org/abs/2606.24597)；摘要 | observation + action → predicted dynamics 可作为独立 provider | 任务环境与 RP 世界不同；|
| Visual World Model | [Genie 3](https://deepmind.google/blog/genie-3-a-new-frontier-for-world-models/)；官方能力 / limitations；[WHAM / Muse](https://www.microsoft.com/en-us/research/project/wham/) 项目页 | 视觉 rollout 是后续 provider 方向 | 模型可用性、动作空间和多角色互动仍有限；不能替代确定性世界 authority |
| Speech RP | [VoxRole](https://arxiv.org/abs/2509.03940)；摘要 | 语音角色身份包含韵律和节奏，不只是文字接 TTS | 实际 provider 能力、时序、取消、降级和跨回合 vocal identity |
| Training-ready harness | [Agent Lightning](https://www.microsoft.com/en-us/research/project/agent-lightning/microsoft-research-blog/)；官方项目说明 | 执行与训练可解耦，step 数据可以由不同训练方法消费 | 可导出轨迹不等于可直接训练；缺失、权限、标签、license 与 trainer mapping 要明确 |
| Latent collaboration | [LatentMAS](https://proceedings.mlr.press/v306/zou26k.html)；PMLR 摘要；[StateBridge](https://arxiv.org/abs/2608.13317) 摘要 | 通信表示可以超越 text，但需要底层 hidden-state 支持 | 普通商用 text API 不能凭 opaqueRef 获得此能力；近期仅避免写死表示 |

本表是本轮确实读取的一手内容与接入判断。GEPA 的 HTML 正文抓取失败，因此不声称完成全文审计；原始摘要可用。

## 2. 协议应是 adapter，不能成为内部 authority

| 协议 | 本轮一手来源 | 对 Atria 的用途与边界 |
| --- | --- | --- |
| MCP | [2026-07-28 Specification](https://modelcontextprotocol.io/specification/2026-07-28) | Tool / Data capability；该版本的 stateless request / per-request negotiation 与旧版本不同，实施时固定所支持版本 |
| A2A | [Specification](https://a2a-protocol.org/latest/specification/) | 远程 Agent 的 task、message、artifact、cancel 与版本协商；外部 complete 不能直接满足本地 Goal criteria |
| AG-UI | [Official introduction](https://docs.ag-ui.com/introduction) | UI ↔ Agent 的事件 / 状态流；投影不能带出隐藏认知或 Secret |
| A2UI | [Google introduction](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/) | 以客户端允许组件目录消费声明 UI；复用 Native frontend 权限 / 编译规则 |
| MCP Apps | [Official overview](https://modelcontextprotocol.io/extensions/apps/overview) | 工具带交互式资源；不是远程 arbitrary code 获得本地任意写权限 |

协议迭代已出现实际 schema / transport 变化。内部使用 Atria 自己更严格的 scope、revision、provenance 与 consumption contract，adapter 明确映射缺失或无法表达的字段。

## 3. 对原研究的补充或收窄

1. **六个 Plane 可保留为责任视角。** 当前没有必要先为每个 Plane 新建数据库、调度器或目录。跨层契约应由真实消费者逐步抽取。
2. **Typed artifact 应提前，但只提前必要部分。** 先有 EvidenceSet / Evaluation 的实际读写、失效和展开；不要一口气固定所有未来心理产物。
3. **Experience 优先依然合理，但 Eval 和可靠捕获是它的第一步。** 少量 critic / regenerate 不能自动证明某规则有效；检索经验本身也不构成成长。
4. **Goal 对象与 BDI intention 不是一个生命周期。** 用户执行契约、角色愿望和临时 Planner todo 可关联，写入权限和完成证据必须分别定义。
5. **社会世界的表示需要允许错误。** LLM 解析、confidence、ToM 和关系变化都是可撤回的解释，不是客观心理真相。
6. **Knowledge firewall 有不同保证等级。** 数据 / 工具 / scope / authority 可确定性限制；自由文本的角色知识违规检测通常仍依赖模型与场景评测。
7. **元认知必须测质量—成本的整体收益。** 额外 controller 可能更贵，更多 rollout 可能更错；simple-turn fast path 与 high-impact deep path 都需要数据。
8. **前沿兼容性只保留必要语义。** 不支持 latent / vision / training provider 时，不创建伪运行能力；能力描述应报告 unsupported。

以上是基于论文和最新 main 的工程推论。

## 6. D4：Execution Reuse 来源索引与证据边界

本轮全文读取 [Execution Reuse / Cache Locality / Adaptive Invocation](../execution-reuse-cache-locality-adaptive-invocation-research.md)，来源提交 `aa4d2d2fe`，整合起点 docs `1c2502dae8ac1bcb7a0bb1dfb1e18d9f01b984b8`；两份原研究完整保留。
这次是指定研究的企划归并，没有重新浏览一手网站、复现论文、运行 Provider / gateway probe 或测模型；

| 研究输入 / 章节 | 采纳的有限架构结论 | 唯一详细权威 / 阶段路由 |
| --- | --- | --- |
| §12–20、37–40、57–66、86–92：Tool / Artifact / Plan / validity | 候选匹配不等于有效；模板结构与动态事实分开| [execution-reuse](execution-reuse.md)；G01 / G03 / G06 |
| §7–10、21–24、56、68–71：Segment / compiler / Provider cache | 稳定身份 / canonical bytes 与语义优先的 layout；Provider 字段由 adapter 映射，gateway exact path 保留 unknown | [behavior-context §3–4](behavior-context.md#3-context-选择展开与压缩)、[model-routing §8](model-routing.md#8-cache-capability与cache-locality)；G02 / G04 |
| §41–44、60–63：continuation 与 narrative freshness | 已完成工作和执行接续分域；| execution-reuse §1 / §5；Reasoning Continuity 仅 [model-routing §7](model-routing.md#7-reasoning-continuity执行状态与生命周期) |
| §45–47、50–55、72–81：invocation / locality / eval | 规则按需选择工作，质量 / 硬预算先行；真实 cache observation 与 savings estimate 分开，false reuse 优先 | [compute-policy §1.1](compute-policy.md#11-adaptive-invocation-决策阶梯)、model-routing §8；G03–G06 |
| §25–36、48–49、84–87：Local / HijackKV / hints | 上层信号对接成熟 backend；KV trust isolation、兼容 / 质量 / recompute 需实证；不自建 GPU serving | execution-reuse §6、model-routing §8；[delivery §8.1 / §9](delivery.md#81-execution-reuse实施顺序与既有阶段映射) 后续研究池 |

论文作者数字不写作 Atria SLO。应用依赖复用需源 authority 实际证明，不能把研究中的细粒度版本视为当前代码已有。
保留 D3 / 原研究各自的 A–F 语义；D4 A–F 只作 delivery §8.1 的映射，不复制新正式阶段。研究的 schema 示意、cache mode 名称、Narrative Intent 字段、算法或跨域共享建议仍在正式阶段局部深化。
