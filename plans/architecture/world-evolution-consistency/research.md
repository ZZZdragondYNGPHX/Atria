# ARCH-DWE-01 · External Research & Current-State Inventory

- 调研日期：2026-10-17
- 文档状态：Research / Draft；资料结论不等于 Atria 冻结设计
- Plan 入口：[index.md](index.md)；架构说明：[design.md](design.md)
- 范围：事件溯源、时间化知识、信念/真相区隔、生成式模拟、叙事编排、存档、成本约束
- 方法：优先官方产品技术文档、原始论文及实际 GitHub 源文件。

## A. 外部案例与可借鉴机制

| 范畴 | 资料 | 观察到的机制 | 对 Atria 的启发 | 不宜直接照搬 |
| --- | --- | --- | --- | --- |
| 传统 Lorebook | [SillyTavern World Info][S1] | 依据关键词/条件选择性注入背景文本；注入并不保证模型遵循 | 静态知识检索不是世界事实提交，更不保证语义一致性 | 不把关键词触发当作状态权威 |
| 事件溯源 | [Azure Event Sourcing][S2]、[CQRS][S3] | 保留发生的领域事件，以投影生成查询视图，使用版本、幂等、快照限制成本 | 事实变更可追溯；状态投影对话前可读取 | 全量事件溯源复杂；不应用于全部静态/低频数据 |
| 双时间模型 | [XTDB Time][S4] | valid time 表示事实实际有效时刻，system time 表示系统知道/记录时间 | 解释「昨天皇帝已死、今天才得到情报」和回溯修正 | 不必因此引入 XTDB 或改造全部持久化 |
| 历史知识 | [Wikidata Qualifiers][S5]、[Ranking][S6] | 给声明加起止时间、来源；区分曾经真实的旧值和本来就错误的值 | 旧皇帝是历史事实，不应一律删除或标错 | Wikidata 的 rank 不等于 Atria 的角色认知/授权模型 |
| 信念维护 | [Doyle Truth Maintenance][S7] | 记录某结论的依据，在支撑依据失效时修正派生信念 | 谣言/推理/间接关系应具备来源和失效链 | 不为每条自然语言句子构造昂贵的全量证明图 |
| 约束行动 | [PDDL Reference][S8] | 行动可行条件与行动执行后的效果分离 | 提案、可行、执行、正式提交是不同阶段；实现可预演 | 叙事不等价于完全可枚举的规划问题 |
| 分支叙事 | [inkle ink][S9] | 全局变量管理剧情状态，故事状态可单独持久化/载入 | 文本叙述和确定状态分离；分支恢复读取同一状态快照 | 作者不可能把开放式 RP 每个事实都手工编码成变量 |
| 社会模拟 | [Versu][S10]、[Comme il Faut][S11] | 自主角色在可重用社会惯例/互动规则内行动 | 世界演化不仅是数值变化，还含关系、地位和潜在后果 | 不用一份全局硬脚本强制每位 NPC 按计划行动 |
| 生成式 NPC | [Generative Agents][S12] | 主体从经历、回忆、反思和计划中形成行为 | 角色所知、所想可以随信息传播与时间而演化 | NPC 的生成式记忆不是客观世界真相 |
| LLM 世界主持人 | [Concordia][S13]、[Concordia GM Components][S14] | Agent 提出行动，Game Master 解析可行性、结算影响并分发观察 | 模型提供叙事建议/候选结果，原生提交器掌握是否发生的决定权 | 不新增与现有 Native SessionCore/Authority 并列的 GM 真相库 |
| 时间知识图谱 | [IJCAI Temporal KG Survey][S15] | 静态关系在时间变化时会导致错误的补全或预测 | 事实最少应具备有效时间/事件/出处/分支，检索支持 as-of | 不等于必须让所有 World/Knowledge 内容图谱化 |
| 游戏效果边界 | [Unreal GAS][S16] | Gameplay Ability 与 Gameplay Effect 分离 | 状态改变需要明确的作用域与受控 effect，而非模型自由编辑 | Atria 不需要依赖 Unreal 或其完整技能系统 |

## B. 从资料形成的判断（仅作为提议）

1. **事件不等于状态。** 事件记载「发生了什么」，当前状态回答「现在是什么」。投影可以压缩、重建或增量计算；
2. **世界知识不只有一个时间。** 至少区分游戏内事实生效时刻（valid game time）、Atria 提交/获知该声明的版本（recorded revision）、角色的接触/相信时刻（actor-observed time，仅在需要时）。
3. **错误情报不是错误世界状态。** 世界真相「莱恩已经死亡」，北境将领「相信莱恩仍在位」可同时存在，并各有来源。
4. **编译优先级不代表语义冲突自动消失。** 给状态更高权重，只能指导排序/提示词；若旧自由文本写「莱恩现在在位」仍被同时注入，模型仍可能矛盾。需要显式状态绑定、局部文本失效/重述或证据层冲突检测。
5. **选择性模拟比全世界全量推演更适合长会话。** 根据作用域、重要度、时钟、等待事件和预算调度；冷数据可聚合追赶，而非每轮调用所有 NPC。
6. **不应默认改为全量 Event Sourcing、全图谱或新数据库。** Atria 已有 Native 状态版本、增量、游戏事件、编排和模拟调度；

## C. 功能场景说明

1. **王位继承：** 初始「莱恩是皇帝」→ 皇帝死亡 → 权力真空 → 二皇子继位。普通 Lore 不应恢复莱恩在位，但查询旧年份仍可正确提及。
2. **误传与欺骗：** 皇帝死亡，北境将领被蒙蔽，宫廷史官知道真相。两个 NPC 用不同知识视图，但同一世界状态。
3. **离屏事件：** 玩家离开帝都一年，世界按有限任务追赶并产生可追溯摘要；没有执行的战争不得凭预测自动写成已发生。
4. **分支与时间旅行：** 从刺杀前 SavePoint 另开分支，另一线上的死亡消息、继承与记忆不得污染新分支。
5. **非结构化叙事：** 生成文本出现「国王死了」但没有 event receipt；后续游戏回合不能假装状态同步完成。
6. **长会话：** 历史和冷态 NPC 增长时仍按关联范围读取、按游戏时间有限结算。

## D. 来源目录（原始资料）

[S1]: https://github.com/SillyTavern/SillyTavern-Docs/blob/main/Usage/worldinfo.md
[S2]: https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing
[S3]: https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs
[S4]: https://docs.xtdb.com/about/time-in-xtdb.html
[S5]: https://www.wikidata.org/wiki/Help:Qualifiers
[S6]: https://www.wikidata.org/wiki/Help:Ranking
[S7]: https://dspace.mit.edu/entities/publication/5377b306-4ecc-4687-b1f5-78cbb4a0543a
[S8]: https://github.com/jan-dolejsi/pddl-reference/blob/master/docs/reference/PDDL/domain.md
[S9]: https://github.com/inkle/ink/blob/master/Documentation/RunningYourInk.md
[S10]: https://ieeexplore.ieee.org/document/6648395/
[S11]: https://ojs.aaai.org/index.php/AIIDE/article/view/12454
[S12]: https://doi.org/10.1145/3586183.3606763
[S13]: https://github.com/google-deepmind/concordia
[S14]: https://github.com/google-deepmind/concordia/blob/main/concordia/components/README.md
[S15]: https://www.ijcai.org/proceedings/2023/734
[S16]: https://dev.epicgames.com/documentation/en-us/unreal-engine/understanding-the-unreal-engine-gameplay-ability-system

[A1]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/experience/world/session.js
[A2]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/experience/world/package.js
[A3]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/state-delta.js
[A4]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/repositories/session-repo.js
[A5]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/knowledge-runtime.js
[A6]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/docs/features/native-knowledge.md
[A7]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/knowledge-selection.js
[A8]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/context-compiler.js
[A9]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/session-knowledge.js
[A10]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/authority-transaction.js
[A11]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/task-authority.js
[A12]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/simulation-authority.js
[A13]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-simulation-contract.js
[A14]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/history-authority.js
[A15]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/hypothetical-authority.js
[A16]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/experience/llm/orchestrator-bridge.js
[A17]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/experience/llm/runtime.js
[A18]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/repositories/save-point-repo.js

---

## E. S2 扩域补充研究：从 ST Lorebook 到 Native World Model（2026-10-17）

> 本节是“要不要彻底改变世界/知识创作模型”的新增调研，不替代前述事实。

### E.1 外部系统对比

| 案例 | 经原始文档确认的核心机制 | 可借鉴部分 | 不宜照搬 |
| --- | --- | --- | --- |
| [ST World Info][S1] | 默认以 keys/regex/递归/排序/预算动态注入知识文本，World Info 是 Prompt 引导工具；即使注入也不保证模型表现 | 全文召回、编辑自由度和 token 预算 | 触发次数/位置/概率不是事实真伪、实体或时态模型 |
| [W3C SHACL][S17] | 以 Shape 表达数据约束 | 显式规则、关键实体/关系 schema、错误路径清晰 | 不要求 Atria 采用 RDF 或全图化 |
| [W3C PROV-O][S18] | 区分 entity/activity/agent，提供“来源、派生、失效、责任归属”等出处关系 | 一个事实为何成立、从哪个事件/文件/修订而来 | 不复制 PROV-O 全套本体到 Runtime |
| [W3C RDF datasets][S19] | 允许默认图和命名图，但多图语义需要明确选择 | 认知/世界/来源范围不能靠简单拼在一起解决 | named graph 不会自动决定谁对谁可见或谁是真理 |
| [XTDB valid/system time][S4] | valid time 是事实生效期，system time 是何时记录/改变该声明 | 区分历史事实、后来发现、修订与 as-of 查询 | 不直接引入 XTDB 或要求所有属性都有双时间列 |
| [Concordia components][S20] | agents 含记忆/观察/计划；GM 有 event resolution、world state、make observation | 行动意图、环境结算、感知传播的职责边界 | Atria 已有 Native Authority / HCM，不应再造 GM 实体持有第二真相 |
| [inkle ink variables][S21] | 剧情逻辑能引用明确世界变量，并可让文本条件分支 | 自由叙事和确定状态连接，关键 facts 可以 anchor | 开放 RP 无法将所有叙事写成固定变量 |
| [Generative Agents][S12] | 记录经历、从记忆提炼反思并形成计划 | HCM 主体记忆与行动推演 | 不将主体观察自动变成世界全局真相 |

### E.2 Atria 原生契约的精确静态事实

- main:src/native/world-knowledge.js 的 WorldRevision 当前含 worldRevisionId/worldId/schema/baseline/knowledgeBindingIds/assetIds/metadata；KnowledgeEntry 含 content/discovery/applicability/lifecycle/relations/delivery/metadata，且显式禁止旧 ST 身份字段。这说明**现有确是原生资源模型**，不是简单复用 ST JSON 记录，但知识语义仍以条目为中心。[A19]
- main:public/scripts/native/knowledge-contracts.js 中 discovery 可用 keywords/aliases/regex，lifecycle 包含 probability/sticky/cooldown/delay，delivery 包含 before/after 和 target，state applicability 支持 typed scalar predicates；World Info conditions 的操作符常量仍被引用。[A20]
- main:public/scripts/native/knowledge-runtime.js 中 currentState、eventJournal、knowledgeOverride、packageCanonical、libraryAugment、sessionAugment、memoryEvidence 有明确权威阶梯；排序不自动解析自由文本的语义矛盾。[A5]
- 不是缺少状态/事件的空白系统。[A1]
- main:docs/features/native-knowledge.md 已明确 Native Knowledge 读取 committed snapshot、拒绝 legacy World Info baselines，并具有 Library/Studio revision 编辑、Binding manager、Session Knowledge 提升、语义 editor。[A6]
- main:public/scripts/native/knowledge-selection.js 可见关键词/regex 的选择流程；此类检索逻辑可被新检索器取代或降为召回层，相应替换随实际功能接线完成。[A7]

**综合判断：** 应重点改革“World / Knowledge 的语义边界、实体识别、可变事实锚点、来源、检索、作者心智模型、有效视图与 UI”；原生 Session authority、Save/Branch、Simulation、HCM 是复用对象，不是拟重建的对手。

### E.3 进一步研究的反证/成本

1. **仅新增关系图**不保证模型输出永不矛盾：不可信自由文本、缓存、受众隔离与未提交叙事仍需要治理。
2. **仅给知识打“高优先级”**不能解决历史片段在当前时间的语义失效。
3. **全自动事实抽取**有同名人物、隐喻、反事实、梦境、谎言导致的误判；默认不能静默发布为事实。
4. **每回合语义全检**成本可能线性随文本量增加，尤其长篇 RP；应讨论发布时离线构建锚点与增量受影响查询。
5. **全图谱/本体技术**会明显增加作者录入和 schema 协作成本。

[S17]: https://www.w3.org/TR/shacl/
[S18]: https://www.w3.org/TR/prov-o/
[S19]: https://www.w3.org/TR/rdf11-datasets/
[S20]: https://github.com/google-deepmind/concordia/blob/main/concordia/components/README.md
[S21]: https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md

[A19]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/world-knowledge.js
[A20]: https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/knowledge-contracts.js
