# D2 公共研究：Jailbreak / Prompt Injection、模型适配、误拒与创作质量

**研究窗口：2024–2026，2026-10-15 检索。** 只记录公开来源和对 Atria 的可验证启示；学术攻击成功率不代表 Atria 或某 API 当前的真实表现。本文做攻击面/机制研究，不提供可用于绕过第三方安全控制的 payload、后缀、搜索参数或多轮攻击脚本。

## 一、术语区分（实施必须保持）

- **Jailbreak（越狱）**：攻击者通过改变提示词企图使模型违背提供方安全策略。可研究它的失效机制、技术边界和误拒风险，但不以绕过第三方强制防护为 Atria 产品合同。
- **Prompt Injection（外部注入）**：外部网页、World 文本、检索结果、Skill/Tool 输出等不可信数据嵌入控制指令，可能令 Agent 越过真正作者意图。应防止数据提权。
- **Authorial Instruction（作者正式发布指令）**：用户自愿写入与发布的创作规范/写作样例/风格控制。它是合法产品能力；不能与上面两种攻击混为一谈。
- **Over-refusal（过度拒答）**：模型错误拒绝原本允许的良性请求；可以评价、归因并通过清晰语境、正确路由与适配来改进。

## 二、先进研究的机制级映射（不直接复制攻击）

| 公开研究方向 | 大体机制/观察 | Atria 能借鉴 | 不应移植 |
| --- | --- | --- | --- |
| Role / Fiction framing（角色和虚构语境） | 模型可能因角色/任务框架变化而改变应答策略；2026 研究显示存在内部机理影响 | **显式合法小说/RP意图**、Authorial Scope、角色 Voice 与 Narrator Style 独立；评价误拒 | 假冒系统身份、虚构权限或兜售万能突破 |
| Many-shot / long context（长上下文示例饱和） | Anthropic 2024 研究展示大量示例可改变模型拒答行为，但也说明存在缓解手段与成本 | 精炼风格正/反例、Few-shot 选择、source-labeled 示例、Token 与缓存预算 | 海量伪会话用来刷低防护、污染记忆 |
| Multi-turn / gradual persuasion（多轮诱导） | 攻击可利用前后会话的承诺和目标漂移 | 对真实长 RP 维护情节、角色协议和版本一致性，检测写作目标偏移 | 隐藏式劝诱模型忽略上位政策 |
| Automated prompt optimization（如 GCG/AutoDAN/PAIR 的方法族） | 自动搜索/改写暴露 prompt 与模型反应的耦合性；不具跨模型稳定保证 | **GEPA 式质量候选演化**，针对文学/非恶意误拒/成本独立评测、人工审批发布 | 对外部 Provider 的拒答率当优化目标、自动生成越狱攻击后缀 |
| Language / Encoding / Format shifts | 表面格式/语言变化可能引起语义或分类偏差 | 多语种文学评价、Provider lowering/角色格式兼容、显式修订记录 | 编码走私、不可读输出导致审计逃避 |
| Tool / Memory injection | 外部来源可能伪装成高权指令 | 把 Source/Evidence 永远保持 untrusted、权限分层和 Receiver scope | 把 WorldBook/网页文本包装成 system、绕过 Tool/Secret Grant |
| Model-specific adaptation | 各 Provider 支持 role、system、sampling/safety 配置不同 | 根据公开可用的能力显式适配，unsupported 就报错/提示替换 Route | 默默宣称一个“通用破限 Prompt”全模型有效 |

## 三、对“成人虚构 RP 被误伤”的直接证据

- ICML 2025 [OR-Bench](https://proceedings.mlr.press/v267/cui25a.html) 系统测量模型对无害但表面敏感请求的**过度拒答**。启示：正确研究指标是 harmless artistic compliance 与实际用户满意度，并同时避免把真正越界请求判成良性；不能仅用“没有拒答”当创作质量。
- 2026 [AI Fiction in the Wild](https://arxiv.org/abs/2606.22748) 从使用模式确认文学、同人、角色扮演和情色写作是实际 AI 创作用途的一部分。研究不等于任何 Provider 必须支持全部生成。
- 2026 [The Safety Relay in Roleplay Jailbreaks](https://arxiv.org/abs/2608.30585) 揭示角色设定语境与拒答行为可相互影响。该研究讨论的是攻击与防御机制；Atria 只借鉴区分“真实创作环境”与“冒充权限”的设计原则。

## 四、原生 Prompt 演化、Agent 和效率证据

- [GEPA 2025](https://arxiv.org/abs/2507.19457)：以执行轨迹/文字反馈驱动局部候选变更与 Pareto 比较。可结合当前 `PromptCandidateStore`、`Experience/Eval`，让“文笔优美、人物一致、误拒降低、调用成本合理”多目标评价，必须 Review/Publish，不把无害误拒研究变为越狱搜索优化。
- [ACE 2025 / ICLR 2026](https://arxiv.org/abs/2510.04618)：策略与上下文增量维护，避免反复重写导致细节坍塌；适用于长 RP 剧情约束/文风示例库，但 World/Memory 真相由原领域持有。
- [OpenAI Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)：稳定前缀与工具/schema/模型参数的版本会影响缓存复用。可借用原 `compiled-binding` 指纹做真实成本分析，不应让创作性强调无意义地每轮破坏公共前缀。

## 五、官方、社区与 Provider 文件

1. [ACL Findings 2026 – modern jailbreak survey](https://aclanthology.org/2026.findings-acl.929/)：技术层与运营层的分类研究，避免把“越狱词列表”当稳定产品资产。
2. [2026 LLM Safety survey](https://link.springer.com/article/10.1007/s10994-026-07060-8)：讨论 GCG、AutoDAN、PAIR 等攻击优化方法，仅采机制和评价启示。
3. [Anthropic Many-shot jailbreaking](https://www.anthropic.com/research/many-shot-jailbreaking)：大量示例会影响输出，但有专门缓解研究；不能当作普适的创作质量提升法。
4. [SillyTavern Prompt Manager docs](https://github.com/SillyTavern/SillyTavern-Docs/blob/main/Usage/Prompts/prompt-manager.md) 与 [STscript Injection](https://docs.sillytavern.app/usage/st-script/)：用户可操控 role、顺序、in-chat depth、注入；有强灵活性但依靠位置而非 Domain Authority。
5. [Gemini API Safety Settings](https://ai.google.dev/gemini-api/docs/safety-settings)：官方公开可调部分 harm threshold，并存在不可更改的保护规则；配置能力必须逐型号/服务查询、授权、报告，不能一概而论。
6. [Claude Prompt engineering](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview)：明确任务、角色、结构与样例属于正常开发手段，应该在 Native Authoring 中可视可编辑。
7. [OpenAI Prompt Injection](https://openai.com/safety/prompt-injections/)：强调限制不可信第三方内容对 Agent 的行为操控，保持来源边界；与“允许作者创作自由”不矛盾。

## 六、研究结论

最值得融入 Atria 的不是攻击 payload，而是 **有正式作者身份的可编译指令层 + 文学及合法内容误拒的评价闭环 + Provider 能力路由/诊断 + 明确来源信任分层 + 按需 Prompt 自动改进**。这相较 ST depth/absolute 插入是可解释、可复现和跨平台的架构升级。原生安全边界必须是 Host/Domain API 的代码合同，不靠文本说“不要执行”。
