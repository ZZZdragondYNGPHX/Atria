# ARCH-DWE-01 · Candidate Design & Discussion Agenda

- 状态：**Draft，全部方案均待用户讨论**
- 当前讨论轮次：Round 1 — 「什么是世界的权威事实，静态设定如何失效？」
- 入口：[index.md](index.md)；材料：[research.md](research.md)

## 1. 问题的正确切分

同一句「莱恩是皇帝」可能表示：

1. **作者宣告的初始事实**：新游戏 T0 时，莱恩为皇帝。
2. **作者设定的不可变法则**：帝位只能通过血统继承（除非特定例外）。
3. **游戏当前真相**：在分支 B、游戏时间 T10，二皇子已继位。
4. **历史真相**：在 T0 至 T6，莱恩曾是皇帝。
5. **角色信念**：北境将领在 T10 仍相信莱恩在位。
6. **叙事文本的修辞/虚构**：梦境、谎言、角色台词或作者文风不等于新世界事实。
7. **推演候选**：「可能爆发内战」尚未发生。

因此不应只给所有来源排序：**权限、有效时间、主体可见性、断言状态、出处**是独立维度。最终编译给每个 target 的是有界的有效视图，而不是把所有原文串接成“大上下文”。

## 2. 三套备选路线

| 方案 | 机制 | 优点 | 主要缺陷 | 初步倾向 |
| --- | --- | --- | --- | --- |
| A. Prompt Overlay | 原始 Lore 不变，只在上下文前置最新状态并标注优先级 | 最少工程改动 | 自由文本冲突仍存在；模型长线可靠性不够 | 可作为起步缓解，不能独立作为最终一致性方案 |
| B. Native Fact Binding + Effective View | 保留创作者原文；仅将会变化的关键事实挂到已有 State/Event 身份；编译时判断时刻、来源、目标身份并去除或重述失效表达 | 复用现有原生权威，可渐进支持纯文本创作；长会话负担可控 | 需要处理文本分段、未绑定事实、冲突 Inspector 和作者体验 | **研究推荐，未冻结** |
| C. Full Temporal World Graph | 全部世界关系转时序知识图谱、每轮统一推理和图更新 | 精细查询、多跳、复杂社会模拟上限高 | 巨大建模负担、双重权威风险、运行成本高，与现有 Runtime 容易重叠 | 暂不推荐默认；可用于特定作品的可选能力 |

研究结论支持的是「状态更新可追溯 + 时间有效性 + 主体隔离」，而不是「必须新建四个存储系统」。

## 3. 推荐验证的最小数据语义（结构示意，**不是最终 API**）

### 3.1 声明的类型

- **world_law**：原始法则/不变量（可配置是否允许受指定特殊事件修订）。
- **initial_fact**：只保证起始时间为真，不保证永远为真。
- **historical_fact**：已确认历史事实，必须带历史时期/证据。
- **current_fact**：对应有明确所有者的 Session 原生当前状态。
- **belief_or_report**：主体信念、听闻、推测、谎言；不能无依据升级为 current_fact。
- **prediction**：候选推演/可能性，不可作为已发生事件。
- **narrative_style**：作者写作指导，不作为世界真相断言。

一段 KnowledgeEntry 可以同时包含风格、背景事实、变动事实，不能粗暴给整篇贴「current」或完全自动重写。可先让关键事实存在少量**作者确认的结构化锚点/片段**，自由文本部分保留原貌与来源；机器提取只做建议，不自动确立强约束。

### 3.2 一个事实需要回答的查询维度

- subject / predicate / value：哪个主体的什么事实
- branchId + revisionId：哪个已提交分支/状态版本
- validFromTick / validUntilTick：游戏世界中实际有效的期间
- sourceRef + originEventId：为什么认为是真的，何事件改变了它
- assertionStatus：已提交、候选、推测、已撤销、无从证实等（需再定边界）
- observer/visibility：谁能查询/知道，部分事实仅 Narrator/Internal 可见
- discoveredAtTick（可选）：角色何时获悉，而非事实何时发生
- lawEpoch/version（仅重大规则修订可能需要）：避免隐式改写世界物理规则

并非所有字段都要持久化；先核对现有 SessionRevision、Authority、History、Information/Memory 的字段如何提供等价语义，避免重复元数据。

### 3.3 写入与读取建议链路

**写入：** 玩家/AI/定时任务提出意图 → 模型可生成候选事件 → 原生预演/约束验证 → 单一 Native SessionCore 提交 state + journal + event provenance + receipt → 派生索引/投影更新（可重建）。

**读取：** 固定 Session/Branch/Revision + Game Tick + target/audience → 编译静态设定与相关动态证据 → 抑制过期“当前时态”声明、保留必要历史信息 → 独立投影角色可知/误信事实 → 限预算输出 Effective World Context。

**硬边界：** Memory/HCM、World/Knowledge、Simulation、Orchestrator、Hypothetical、History 不得各自成为独立可写「世界真相」，重用现有已有单 Native Host 发布通道；模型不会因为叙述段落提及某事件而直接获得 world effect 权限。

## 4. 关键冲突处理示例

初始 Knowledge：
- 「莱恩是帝国皇帝，坐镇圣城。」标记为 initial_fact，或在作者确认后绑定 Empire.ruler = Ryan。
- 「莱恩在 T0 登基」永远是可查询历史，不会因 T10 死亡失效。

玩家刺杀后：
- 获批准并提交的 event EmperorDied(T6) 导致 Ryan.alive=false、Empire.ruler=vacant；记录出处和时刻。
- T8 又提交 SecondPrinceCoronated，当前皇帝改为二皇子。
- T10 narrator/current view：二皇子在位；莱恩为已故前皇帝；必要时按「莱恩曾经」提供背景，**不再作为当前真相注入「莱恩现在在位」**。
- T10 NorthernGeneral view：若只有 T4 情报，仍可相信莱恩在位，但输出需明示或内隐区别 belief 与 world truth；不会透露不该知道的刺杀细节。
- T10 模拟预测「可能内战」：未提交战争事件前，不可写入已开战。

处理重点：针对具体失效片段/动态锚点，不删除整个 KnowledgeEntry，也不自动更改 Library、Package、原始创作文稿。

## 5. 主要尚未决议的设计选择

### R1 — 静态事实如何与动态状态关联（本轮主议题）

- **R1-A 全文结构化**：全部事实转原生实体/关系；一致性最好，但创作成本、旧自由文本体验损失严重。
- **R1-B 关键动态事实显式绑定（推荐讨论）**：保留完整自由文本，仅重点可变断言（职位、阵营、关系、生死、地理归属等）带字段/事实锚点；由编译器以当前状态重述。
- **R1-C 完全自动语义矛盾检测**：LLM 每轮扫描/改写冲突段落；编辑负担低，但稳定性、真实性和推演成本不受控。
- **R1-D 纯状态提示词覆盖**：工程最轻，不保证模型理解；仅可作为临时缓解。

**建议初议 R1-B 作为默认，允许作品选择更多/更少结构化约束，但不预设唯一答案。**

### R2 — 谁可改变世界规则

探索：默认法则不可由普通事件修改；允许作者声明的高级事件/审批路径主动改变法则。应区分「发现过去未知的规则」与「规则本身发生改变」，并核查当前 Authority contract 是否支持前者/后者。还需确定作品作者、玩家、游戏内部 Agent 各自授权上限。

### R3 — 角色认知与秘密

是否利用已有 Information/Memory/History 体系生成 target-specific view；对信念、听闻、见证、机密和错觉采取何种字段/来源模型。审计需确认 NPC 的 private view 不被 Narrator 当前事实泄漏。

### R4 — 动态推进

现有 simulationRuntime 已具备统一 clock、有限 job/step、hot/warm/cold 和可选 Task 思考。待讨论是否默认在时间前进时按需推进政治/社会事件，是否准许陌生区域在「冷态」汇总结算。不能假设系统仍缺一个后台模拟引擎。

### R5 — 事实与叙事一致提交

解决「AI 文本声称国王已死，但 WorldState 未变」：可选在正式叙述前由解释器先做候选事实提取/准许提交，然后输出；或叙述草稿与事件 effect 原子发布。必须定义拒绝/低置信度行为，且避免把 NPC 谎言误认事实。

### R6 — 时序、存档和分支

明确 valid game time vs recorded revision vs observer discovery；已提交保存，分支继承历史锚点后隔离新事件，不把全部历史变成一个跨分支 mutable latest；修正过去认知不等于修改过去物理事实。

### R7 — 预算与验证

区分 L0 静态合约检查、L1 原生纯逻辑/状态提交校验、L2 浏览器/模拟回合、L3 Windows/CachyOS/Termux 真实客户端。后两项在正式实施阶段按必要证据完成；本轮没有运行任何测试。预算受现有 Simulation、Authority、Context 编译器约束，具体扩充须基于 E0 实测。

## 6. 风险清单

| 风险 | 失效方式 | 应验证的措施 |
| --- | --- | --- |
| 双真相源 | WorldState 与新图谱互相写入竞争 | Native SessionCore 唯一发布；只读衍生投影 |
| 语义失效盲点 | 静态文本包含不受 stateConditions 控制的「仍在位」 | 关键动态事实锚点与条目冲突 Inspector |
| 角色全知 | NPC 读取 narrator-only 当前状态 | target-specific projection / source filtering |
| 非正式叙述冒充提交 | 模型自由写死某人，但无 receipt | 原生事件提案与提交边界；检测不一致 |
| 历史回溯污染 | 用 T10 事实回答 T0 问题 | 分支 + valid interval + source revision |
| 计划当事实 | 未确认战争作为已发生 | proposal/prediction 与 committed 分离 |
| 无限推演 | 每 NPC 每 tick 推理，成本暴涨 | scope/relevance/time window/预算上限 |
| 规则任意漂移 | AI 突然生成新物理法则 | 作者可声明法则和例外，特级事件授权 |
| 过度结构化 | 普通 RP 作者被迫录入大量字段 | 自由文本第一，关键可变事实按需绑定 |
| 恢复不一致 | Save/Branch 切换后历史和认知泄漏 | revision anchor + branch scope；无跨分支 latest |

## 7. 今后的讨论顺序（仅路线建议，尚未获准冻结）

1. **Round 1:** 世界事实类型与静态/动态内容关联方式（R1）。
2. Round 2: 事实权威、事件提交与因果约束（R5）。
3. Round 3: 时间化知识、旧事实历史化、误报/回溯修正（R6）。
4. Round 4: NPC 主观认知、情报传播、记忆和防全知（R3）。
5. Round 5: 离屏世界模拟、范围、预算、时间跳跃（R4）。
6. Round 6: 世界法则/元规则变动和作者权限（R2）。
7. Round 7: Studio/Library/Play UI、上下文有效视图与调试 Inspector。
8. Round 8: 与当前架构的 E0 全调用方审计、最小实现边界、分阶段验收，用户批准后定稿。

真正的轮次数量可以根据讨论修改；任何一轮都不能自动宣布最终方案已定。
