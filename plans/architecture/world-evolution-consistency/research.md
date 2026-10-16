# ARCH-DWE-01 · External Research & Current-State Inventory

- 调研日期：2026-10-17
- 文档状态：Research / Draft；资料结论不等于 Atria 冻结设计
- Plan 入口：[index.md](index.md)；候选接口：[design.md](design.md)
- 范围：事件溯源、时间化知识、信念/真相区隔、生成式模拟、叙事编排、存档、成本约束
- 方法：优先官方产品技术文档、原始论文及实际 GitHub 源文件；未做 Atria 运行、UI、CI 或跨端实测。

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
| 游戏效果边界 | [Unreal GAS][S16] | Action、Effect、Attribute、Tag 分角色，先检查条件后生效 | 状态改变需要明确的作用域与受控 effect，而非模型自由编辑 | Atria 不需要依赖 Unreal 或其完整技能系统 |

## B. 从资料形成的判断（仅作为提议）

1. **事件不等于状态。** 事件记载「发生了什么」，当前状态回答「现在是什么」。投影可以压缩、重建或增量计算；事件未被验证并提交前不能成为事实。
2. **世界知识不只有一个时间。** 至少区分游戏内事实生效时刻（valid game time）、Atria 提交/获知该声明的版本（recorded revision）、角色的接触/相信时刻（actor-observed time，仅在需要时）。
3. **错误情报不是错误世界状态。** 世界真相「莱恩已经死亡」，北境将领「相信莱恩仍在位」可同时存在，并各有来源。
4. **编译优先级不代表语义冲突自动消失。** 给状态更高权重，只能指导排序/提示词；若旧自由文本写「莱恩现在在位」仍被同时注入，模型仍可能矛盾。需要显式状态绑定、局部文本失效/重述或证据层冲突检测。
5. **模拟建议与正式行动之间要有提交流程。** 为避免 AI 一句话生成新的世界法则/皇帝死讯就改变真相，需区分叙述草案、预测、候选事件、可验证 effects 和提交 receipt。
6. **选择性模拟比全世界全量推演更适合长会话。** 根据作用域、重要度、时钟、等待事件和预算调度；冷数据可聚合追赶，而非每轮调用所有 NPC。
7. **不应默认改为全量 Event Sourcing、全图谱或新数据库。** Atria 已有 Native 状态版本、增量、游戏事件、编排和模拟调度；外部研究提供校验维度，不能替代本地接口审查。

## C. Atria main 相关代码与文档初步核对（静态阅读）

以下只证明在 2026-10-17 读取的 main 路径存在相应机制，不证明所有消费者已接线或跨端工作。

| 当前权威/入口 | 可核对的能力 | 与本题的交集 / 待核实缺口 |
| --- | --- | --- |
| [World session][A1]、[World definition][A2] | package baseline/schema + atri_world_state + reducers + 带 branch/revision 的事件及 commitStatePatch | 已有定义/状态分离与事件提交；不应创建平行 WorldState/Journal |
| [State delta][A3]、[SessionRepo][A4] | atri_world_state snapshot/delta、哈希和 Session revision 发布 | 不需另起独立持久化；还要核查真相断言如何映射到实际 state keys |
| [Knowledge runtime][A5]、[Knowledge spec][A6] | 多级权威序、targets、状态条件、knowledge mode、event_journal provider、Memory evidence 冲突过滤 | 对有明确 stateClaim 的 memory 能判冲突，但**普通作者自由文本的事实陈述是否自动失效**尚无完整证据 |
| [Knowledge selection][A7]、[Context compiler][A8] | 关键字/依赖/预算、current-state/knowledge/memory lanes 和来源引用 | 仍需核查「过期 Lore 在当前轮怎样被抑制」与角色受限视图；rank 不能替代语义消歧 |
| [Session knowledge][A9] | KnowledgeBindingSet pinned revision、Session 快照不跟随可变 Library head | 玩家世界状态变更不该反向修改 Package/Library；需确认 Session Override 的长期归属 |
| [Authority transaction][A10]、[Task authority][A11] | 原生 Authority/Task 私有候选计算 + SessionCore 单提交权威 + 预算边界 | 增量演化应复用该通道，不能新增第二个“批准变更”内核 |
| [Simulation authority][A12]、[Simulation contract][A13] | 规范时钟、声明式 job、hot/warm/cold、有限任务思考和 maxSteps | 有受控后台演化雏形；不是空白地新建 simulation engine |
| [History authority][A14]、[Hypothetical authority][A15] | 历史聚合/档案、假设投影与权威提交隔离 | 因果证据应复用历史、预演，避免把历史系统重做 |
| [Orchestrator bridge][A16]、[Game LLM runtime][A17] | guidance 只读世界/事件，记忆作为 historical context，模型不直接提交 | 需要核对非桥接 LLM/叙事渠道是否产生“已讲述未提交”的事实 |
| [SavePoint Repo][A18] | 存档绑定已提交 Session/Branch/Revision | 状态变化需要随分支恢复，不创建可跨分支泄漏的 global latest |

**初步结论：** 与其重构一个新「世界模拟服务」，优先审计/补齐 **Authoring Static Text → 事实语义/适用期 → Native State/Event → Target-specific Context** 这条断点。现有 authority rank、条件筛选、历史与认知隔离已部分具备；不能把「没有看到」当成「不存在」，后续 E0 需逐一核实实际接线。

## D. 关键试验用例（设计审查时复用）

1. **王位继承：** 初始「莱恩是皇帝」→ 皇帝死亡 → 权力真空 → 二皇子继位。普通 Lore 不应恢复莱恩在位，但查询旧年份仍可正确提及。
2. **误传与欺骗：** 皇帝死亡，北境将领被蒙蔽，宫廷史官知道真相。两个 NPC 用不同知识视图，但同一世界状态。
3. **离屏事件：** 玩家离开帝都一年，世界按有限任务追赶并产生可追溯摘要；没有执行的战争不得凭预测自动写成已发生。
4. **历史反转：** 多年后发现「死亡」是替身或误报，既有先前记载与信念保留为当时可得证据，真实世界状态经新事件/复核修正。
5. **分支与时间旅行：** 从刺杀前 SavePoint 另开分支，另一线上的死亡消息、继承与记忆不得污染新分支。
6. **规则变更：** 初始无魔法，剧情「发现了被隐藏的魔法」与「真正改变物理法则」必须走不同授权/验证路径。
7. **非结构化叙事：** 生成文本出现「国王死了」但没有 event receipt；下一轮不能假装状态同步完成。
8. **资源压力：** 十万份历史记录、上百 NPC、多年游戏时间跨度；不允许全量扫描/无界模型调用阻塞回合。

## E. 来源目录（原始资料）

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
