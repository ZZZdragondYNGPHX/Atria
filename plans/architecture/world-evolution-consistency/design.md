# ARCH-DWE-01 · Candidate Design & Discussion Agenda

- 状态：**Draft（W1–W19 的 B 总体方向已获用户确认；W20 受保护主体存储位置、工作包/接口、E0 Gate 0 与正式实施仍未批准）**。旧候选章节保留历史，现行决议以最新章节/入口为准。
- 当前讨论轮次：W20 — Session-owned 受保护身份与 Domain-owned Fact transitions、两段合法历史查询、WP-A～F 生产消费者及 Gate 0 退出条件（见 [e0-gate0-integration-workpackages.md](e0-gate0-integration-workpackages.md)）。
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


---

## 8. Scope Expansion S2 · 从 Lorebook 进一步重构原生 World / Knowledge（2026-10-17，候选）

> 用户提出扩大课题：现有原生 World/Knowledge 已摆脱部分 ST 身份/API，但创作与编译的思维仍受“知识条目 + 触发/注入”影响。本文保留前述 Round 1 候选，不将任何倾向记作批准；本节先定义更大的待议架构。

### 8.1 目标从“冲突修补”升级为“概念重构”

**新的北极星**：创作者定义一个可以运行和演化的世界；知识系统维护有出处、有时态、有受众的世界资料；Play 显示从已提交原生状态生成的当前世界视图。世界不再等于几本可触发的资料书，知识不再等于要塞进 Prompt 的段落。

不赞成把旧 Lorebook 全部改名为 Knowledge 后继续复制 keyword/regex/probability/sticky/insertion 的产品心智模型；也不赞成为它另搭与 SessionCore 竞争的 World Graph 引擎。

### 8.2 概念边界：四个问题、四类不同资产

| 用户的问题 | 候选抽象 | 持久化/权威所有者 | 不承担的责任 |
| --- | --- | --- | --- |
| 这个世界是什么、有哪些规律与存在？ | World Definition：实体、关系、规则、起始值、历史基线、资料绑定 | Library / Studio 的固定修订、游戏启动时已选 Package/World | 不在游玩中擅自覆写原始修订 |
| 这段内容从哪里来，声称什么，对谁有用？ | Knowledge Source / Assertion：自然语言资料、经过确认的关键断言、引用、可见性、适用期 | 可重用作者资料与来源修订；不是当前运行状态所有者 | 不因为检索命中就创造世界事实 |
| 这一分支此刻实际发生了什么？ | Effective State + Event History：世界当前值及其提交缘由 | **现有 Native SessionCore / Session/Branch/Revision**，投影可重建 | 不创建第二个可写世界事实数据库 |
| 谁看见、相信、误解或记住了什么？ | Epistemic View：认知/证据/传播/秘密 | 复用原生 HCM/Information/Memory 与既有消费者 | 不因为一个 NPC 相信而改写共同真相 |

**知识的“权威”至少拆成两个维度**：①这份资料的作者/出处/可信等级；②它的陈述是否是在某个世界分支与时刻正式成立。高可信史书可准确描述过去，但不能自动成为“如今仍然如此”的断言；多个相矛盾的民间传闻也可以合法共存。

### 8.3 三条原生重构路线（本轮请用户取舍）

**A · Semantic Lorebook：** 保留 World + Knowledge 条目和激活框架，补实体标签、时态和当前态过滤。工程小，但“每条记录怎样触发”仍是主语；可能治标不治本。

**B · World Model + Source Library（优先推荐讨论）：** World 成为实体 / 关系 / 法则 / 起始态 / 资料引用的创作主语；Knowledge 变为可复用的文献与事实来源、证据及检索资料库。少数影响实际演化的断言与 Native state key 显式链接，其余自由文本不强制结构化。Context 检索只是 World View 的消费者。与 Native Host/HCM/Orchestration 单向职责对齐。

**C · Universal World Knowledge Graph：** 将几乎所有描述、事件、认知都存成图与规则，从图计算出世界状态。关系推理潜力大，但强迫所有作者建模、重复 Native 权威、读写/性能成本明显，不建议作为默认。

### 8.4 ST 思维清退清单（E0 之后确定具体删改）

| 当前留存概念 | 候选归宿 | 原因 |
| --- | --- | --- |
| keyword / alias / regex activation | 退居全文召回/精确匹配的索引工具；不决定事实真假 | 匹配到“皇帝”不代表应注入当前统治者的过期描述 |
| recursive entry activation | 优先以显式实体/关系/依赖检索替代；保持有界图遍历 | 文本相互提关键词不是语义关联 |
| probability / sticky / cooldown / delay | 从“知识真伪/知识是否存在”剥离；仅可能归于叙事线索/随机遭遇/规则触发 | 世界物理事实不能以抽中条目为准 |
| before / after insertion, priority | 变成内部 Context 编译与预算策略；创作 UI 不以 Prompt 排列为核心 | 用户关心世界内容，而不是 Prompt 拼装技巧 |
| override / augment | 复核为可解释的资源组合/作者明确的修订优先，而非简单文本覆盖 | 多 World/Package 组合需要冲突诊断 |
| stateConditions / target / visibility | 保留有效场景与权限的原生意义，补实体/时态语义 | 现有能力可复用，但条件不能替代明确的事实模型 |
| Content 自由文本 | **必须保留一等公民地位**；增加实体引用、可选事实锚点与有效范围 | 世界构建/人物文学表达不应被迫变成表格 |
| 按关键词浏览“世界书” | Studio/Library 以世界实体、组织、规则、历史、资料等导航；高级检索独立提供 | 从“条目管理器”转向“世界创作器” |

上述是未来重构对象，不是“已证实可以安全删除”的代码清单。E0 必须核对所有消费者、具体路径和归属；Atria dev 阶段不需为旧 ST 卡或旧未发布 API 设置兼容双轨。

### 8.5 混合内容的三段式策略（核心待议）

1. **作者自由写**：完整保留地理、人物、文风、神话、历史等自然语言资料，不要求每句话三元组化。
2. **机器辅助发现**：创作时发现“帝国统治者/人物生死/阵营/领地/关系”等高变化事实，提示作者确认实体身份、类型与 state binding。抽取模型只提出建议；不能自动把推测变成 hard rule。
3. **运行时有效编译**：Current View 先读唯一已提交 Session State/Events，按分支、时刻、角色受众与事实锚点决定当前事实和历史引用。旧自由文本可作为历史/证据阅读，但不能无条件叙述为此刻的权威真相。未知关联的自然语言“当前时态”属于需探讨的失效盲点，不能宣称全自动解决。

**示例**：世界资料写“莱恩身为皇帝，在圣城议政”，若作者明确绑定 Empire.ruler，应在当前视图显示最新合法统治者、原句保存为起始/历史描述；北境将领仍可以根据其已获知信息误信莱恩在位。若原句未绑定，编译器应在可判断时谨慎屏蔽其当前性、暴露 Inspector 警告或要求作者补锚点，而非擅自篡改源文。

### 8.6 创作产品视角：Library / Studio / Play

- **Library / Worlds**：一个“世界”作为容器，可按概览、地理/实体、组织/关系、规则、时间与历史浏览；支持文学段落。
- **Library / Knowledge**：作品内文献、百科、研究笔记、传说/证词、可复用资料，保留引用和原文，不强迫它们成为顶级世界规则。
- **Studio**：围绕世界实体与规则创作游戏初始状态和事件/效果，显示“原始设定 / 当前预演 / 受众有效视图”的差异；作者只需在重要动态事实上选择严格建模。
- **Play**：玩家看自然的叙事、档案和时间线；开发/作者模式可检查某个陈述为什么成立、什么信息被注入、来源及过期原因。不能默认把所有内部状态暴露给普通 NPC/玩家。

**UI 原则**：默认简洁的创作界面 + 按需展开结构化属性/引用/调试；避免把几十个权威/条件字段平铺给普通用户。

### 8.7 必须满足的边界与风险

- 单 Native Host 真相与提交通路；新的 Entity/Assertion 查询视图必须与 Session State/Events 的所有权明确，不能反向写动另一个“真相库”。
- 时间事实区分 author revision、有效 game time、记录 session revision、主体信息到达时刻；事实越复杂，才越需要这些附加维度。
- 发布的 World/Knowledge 修订与绑定精确、Session/SavePoint 分支隔离；Library 头部编辑不偷偷影响已经开始的游戏。
- 保密与故事悬念：作者已设定的秘密、角色认知、玩家能看到的线索、叙事者有权看到的真相应区别；过滤在 Context 编译前生效。
- 重要声明对来源、被撤销的假设、游戏事件 receipt 可审计；“叙述提到了”不足以证明已提交。
- 预算是硬约束：热/温/冷主体调度、局部投影、缓存失效、按需索引；不把每回合全文 LLM 一致性扫描当成基础设计。
- 不预先引入 RDF、Neo4j、XTDB 等重型依赖。借鉴各自声明、时态、出处和约束概念即可。

### 8.8 下一步设计取舍（本轮均未冻结）

**首要决策 W1**：未来的核心创作对象究竟继续是“World + 独立 Knowledge 条目”为双核心，还是 **World Model 作为中心、Knowledge 作为可引用的资料/来源库**？支持高级内容系统使用知识断言，但不要求所有世界文字有结构化身份。

**次要决策 W2**：采用 Hybrid 内容模型、关键事实锚点，还是全文结构化；哪些事实必须由引擎掌握，哪些只要求文本可检索。

**后续序列**：实体与关系建模 → 世界法则与可演化边界 → 实际事件/状态对接 → 认知/资料真伪 → 检索/编译 → 多域 UI → E0 全面消费者审计与实施阶段。用户明确定稿前始终 Draft。


---

## 9. S3 · 已确认架构方向与下一轮建模方案（2026-10-17）

**Decision W1 — 已确认的方向，不等于整份企划最终定稿。** 用户选择上一轮推荐的 **B · World Model + Source Library**。以后世界模型是创作主语，知识是可引用、有来源、可检索的资料/证据；从以 Lorebook 条目激活为中心的产品心智模型转向可定义、演化和查询的世界。原生 Native SessionCore/Session/Branch/Revision 仍为运行时真相与提交的唯一权威，HCM 承担主体认知；不另造第二套可写世界状态。自由文本保持一等创作形式。明确 B 不等于批准任何具体接口、重型图数据库、迁移方案或实现开工。

### 9.1 下一轮 W2：先界定要表达的东西，而不是先决定数据库

**候选：轻量世界语义骨架 + 自由文本源文 + 关键动态断言链接。** 五种逻辑概念不一定要五套资源/数据表：

1. **Entity / 实体**：人物、地点、国家、组织、物件、概念等拥有稳定的**身份**（不是名称）。实体 ID 的引用与显示名/别名分离；不要求所有路人、抽象词、小说段落都建立实体。
2. **Relation / 关系**：有主语、关系类型、目标/值、适用范围的表达，可指向其他实体；如「莱恩-亲属-二皇子」「帝国-统治者-莱恩」。关系语义依类型判断静态/动态/主体主观，不能全都一个通用真假布尔。
3. **Assertion / 断言**：某个来源对某段关系或属性的声明，包含出处、时态、语境和确认级别。一个记载可以是真的历史、误报或官方宣传；“资料声称”不同于“Session 当前为真”。
4. **Rule / 法则或约束**：作者规定的世界可行性、恒定条件、变化许可；不能从普通资料文本未经确认地提升为 Runtime 强约束。
5. **Source / 自由内容**：自然语言世界设定、文学说明、百科/史料/传说/证词/参考资料。完整保存原文；可将少量重要片段链接至 Entity/Assertion，也可以完全自由文本。

**运行时 Current State/Event** 不属于 Knowledge 的第五个可写真相库；它已经由 Native Host 持有。新的 Entity/Relation/Assertion 模型只能为这些状态提供语义定义、创作起点与可重建的读取投影。

### 9.2 三类关系/事实的建议治理边界

| 类型 | 例子 | 变更/判真机制 |
| --- | --- | --- |
| 世界定义与历史 | “莱恩在某年登基”；帝国位于某大陆 | 作者修订/历史事件及有效时期；起始事实不自动永真 |
| 运行时可演化关系 | “帝国目前由莱恩统治”；“王国与帝国交战” | **Native committed state/event**，由明确 state path/owner 或 effect 确定当前值；资料不能覆写 |
| 认知/来源陈述 | “将领相信莱恩仍在位”；“史书记载莱恩不死” | HCM 的主体视角/信息传播或 Source 的引述；允许与真相并存，不自动变成真相 |

分类是针对具体**谓词与使用语境**，而不是强规定 Person=动态、Place=静态。相同文字的“统治者”在历史书中是过去断言，在当前世界投影中是动态关系，在谣言中是主观信念。

### 9.3 身份和范围（候选约束，非最终 Schema）

- 对确实建模的实体，稳定 ID + 所属 World/项目身份作为引用基础；同名、改名、外号不是新身份；跨 World 复用必须显式引用/映射，不因同名自动合并。
- 同一 World 的定义版本不可因 Session 游玩回写；打包选择固定修订；分支事实由当前 Session Revision 决定。
- 多来源矛盾可并存：来源可信度、世界事实的提交状态、角色可知性、历史有效期分别判断。没有足够证据时应保留 Unknown，而非假定不存在或为假。
- 关系与事实可能含否定、互斥、集合、多值或时间边界；这些类型是否标准化先核实运行时消费者，不要求所有自定义关系都有复杂约束。
- “世界定义实体 ID”与“Play 动态临时实体”需要未来统一身份方案，尤其 NPC 出生/死亡、城市建造、物品创建和跨分支镜像；本轮只识别为关键设计点。

### 9.4 自由文本与结构化身份的协作（建议）

**作者先写正文 → 低成本索引/可选 AI 辅助标注实体和可变事实 → 作者确认少量对 Runtime 重要的锚点 → Studio 发布固定世界修订 → Play 从已提交 state/event 编译当前事实。**

建议提供三档创作体验（不是三套完全不同的后端）：

- **Freeform：** 纯文字设定直接可用；不会强制转换 JSON/三元组，也不能承诺对全部自由文字做完美语义一致性审计。
- **Assisted：** AI 建议实体、别名、人物/阵营关系、需要追踪的动态事实；人工复核“这是世界真相还是来源主张”。
- **Structured：** 需要确定性玩法的作品显式指定动态属性/关系、状态拥有者、约束、effect 和时间规则，供 Native Runtime 使用。

动态断言在作者确认后可用 **Fact Anchor / State Binding** 连接正确 native state path 或 predicate，不能由模型自作主张认定真相。公开资料可用 EntityRef / SourceRef 描述，而不能碰到同名就合并实体。

### 9.5 查询和语义冲突（示意，不是 API）

```text
Authored World vN:
  Entity[empire], Entity[ryan], Entity[prince]
  Assertion[empire.currentRuler = ryan] @ game_start
  Source[palace-chronicle]: "莱恩身为皇帝..."

Committed Session Branch B / Tick 80:
  EmperorDeath committed -> ruler = vacant
  PrinceCoronation committed -> ruler = prince

Current narrator view:
  Empire ruler: prince
  Ryan: former ruler / deceased
Historical as-of Tick 0:
  Empire ruler: ryan
Northern general belief view:
  "Ryan is still ruler" [belief, observed information may be stale]
```

所有对“当前真相”敏感的资料都应该能被降为历史/来源信息、条件化呈现或由动态值重述；未锚定文本无法证明安全时不做静默全局改写。需要 Inspector 追踪检索来源、事实裁定、受众和排除原因。文本中人物台词、梦境、假设和反事实永远不能仅因关键词“死亡”就变成已提交事件。

### 9.6 W2 待讨论的三种实施取向（尚未获批）

- **W2-A 全量结构化**：所有主要内容进实体/关系/属性，原文做补充。查询精确但作者负担与误判成本高。
- **W2-B 分层混合结构（推荐）**：身份稳定；重要的当前事实与法则结构化；自然语言保持完整；AI 负责给建议而非自动发布，运行时复用唯一状态权威。
- **W2-C 自动抽取为主**：作者全程自然语言、AI 自动转写所有关系/事实；编辑轻，自动错判和长会话成本不可控。

**下一轮目标：** 在 W1 已确认的大方向下，确定 W2 的结构化下限、哪些事实要求强一致、Source 文档如何关联锚点、是否默认启用辅助抽取，再进入 Rule/State/时间/认知/检索/UI 的更深讨论。决策前不修改 main，也不把推荐 W2-B 当成用户选择。


---

## 10. S4 · W2 确认与 W3 世界法则/事实演化权限（2026-10-17）

> **W2 已确认（用户“认同”上轮推荐）：B · 分层混合结构。** 此决定与 W1 一起成为当前讨论的已选方向；整份 Plan 仍为 Draft。此节其余 **W3 候选均未获批准**，不得作为最终 API / 权限契约实施。

### 10.1 已确认的 W2 精确边界

- **World Model + Source Library**：世界定义是创作核心；Knowledge 提供可引用、可检索、具出处的资料和主张。
- **Hybrid Authoring**：自由文本是一等公民；有稳定身份的关键 Entity、影响演化的重要关系/事实/规则可以结构化；AI 只辅助提出待确认的**创作阶段**抽取建议。普通作者无需把每句话转成三元组。
- **Play 真相的唯一发布者**继续是原生 SessionCore / Session/Branch/Revision；衍生索引、实体图、Knowledge 不能取代已提交状态和事件。原始 WorldRevision 不被游玩反向修改。
- 本轮不冻结具体 schema、哪些事实强制挂载、模型抽取策略或 Studio UI；W2 的选择只确定分层混合的总体设计方式。

### 10.2 必须区分：世界法则、初始真相、动态真相、未知与秘密

世界“声明”至少有互相独立的**发生效力 / 时间 / 来源权威 / 主体可知性**维度；不能全部依赖单一 `priority`、`canonical` 布尔值。

| 概念 | 示例 | 建议归属/语义 |
| --- | --- | --- |
| Hard Invariant（硬法则） | “本世界普通生命死亡不可自然复活” | World 定义/已批准规则约束；常规事件不可违背 |
| World Mechanic / Soft Rule（机制或可修订社会规则） | “帝位依血缘继承”；“城内夜间禁行” | 规则/制度，按世界演化事件可能改变；不是所有制度都和物理法则同级 |
| Initial Fact（起点事实） | “开局莱恩在位，帝国与北境和平” | WorldRevision 中的起始快照/事实；只要求 T0 成立 |
| Committed Current Fact（当前事实） | “T80 二皇子在位” | Session/Branch/Revision 的有效状态/事件；随时间改变 |
| Authored Hidden Canon（作者预设的秘密真相） | “二皇子其实是失散的第一继承人” | 作者已固定但角色未知；可以在 World/Package 内容中承载，并遵守可见性；曝光时间不是成立时间 |
| Unknown / Open Detail（留白） | “未指定港口镇长是谁” | 不可凭缺失断言“不存在”；在演化权限允许时可由 AI 合理创造 |
| Report / Belief / Prediction（来源/认知/推测） | “将领听说皇帝活着”；“可能开战” | Source/HCM/候选推演；不是自动可写世界状态 |

**重要区别**：“魔法一直存在但无人知晓” = 新信息被发现，不是新物理法则被创造；“此前绝无魔法，今天世界规律改变” = 真正的 Law Mutation，必须通过更高等级权限和可追溯事件。也要区分作者**未规定**、作者**明确规定不存在**、作者**规定秘密存在**。

### 10.3 AI 在 Play 中应能创造事实，但按影响等级受控

若所有新事实都要求作者/玩家逐条审批，会让自由 RP 失去生成性；若任何文本都变成真实世界状态，则会造成设定漂移。提出按**影响和持久化等级**区分：

| 等级 | 例子 | 候选机制 |
| --- | --- | --- |
| E0 — 局部叙事细节 | 杯子颜色、短暂天气描写、无后效动作 | 可在局部叙事中自由生成；保持近期连贯，不必每个名词都存永久事实 |
| E1 — 普通新增持久事实 | 合理新增客栈老板、街道名称、NPC 关系 | 如不冲突且受世界/场景开放域授权，可走默认 Native event/effect 提交；跨场景继续引用时有身份和出处 |
| E2 — 重大世界状态改变 | 君主死亡、战争爆发、城池归属改变、关键 NPC 身份揭露 | 必须明确效果/前置条件与权限，Native 验证并记录；**不等于每次都弹人工审批**，可由事先授权的游戏规则自主结算 |
| E3 — 世界法则改变 | 死亡突然可逆、魔法从无到有、时间规则重写 | 默认禁止模型自主变更；仅在作者定义的特殊机制、授权场景或显式人类同意时进行；需独立核验与版本化语义 |

**等级不是场景内容审查评级**；只是“谁可以将某种描述升级为游戏事实”的权威/影响划分。用户可在作品级配置开放式/叙事式/规则式体验（具体 UI 下一轮再定）。

### 10.4 推荐的原生演化路径（尚未决定接口）

```text
User / NPC / AI proposes action or new detail
→ classify: transient narration | proposed persistent fact | structural world change | law change
→ resolve stable identities, affected state ownership and authored constraints
→ check game time, branch/revision, preconditions and permissions
→ Native Host single authoritative commit (when persistence required)
→ derived Effective World View / HCM observations / context cache invalidate by scope
→ public narrative reflects confirmed effects; rumors/dreams/proposals remain source/subjective
```

- “AI 写出了国王死亡”**并不自动**意味着已提交国王死亡。强一致事件应在对外叙事确定前取得有效提交/授权，或通过同一受控事务协调，避免“故事已播、状态没改”。
- 影响未来行为的普通新实体/社会关系可以渐进进入 Session 事实；避免每回合无界地建立数千条 trivially irrelevant 状态字段。
- 文本中的 NPC 台词、宣传、梦境、假设、怀疑，哪怕非常肯定，也默认属于**来源陈述**而非真相提交。
- 规则重写需要区分作者将 Library/WorldRevision 升为新修订，还是游戏分支内的**已授权世界法则变更事件**；不能暗中更新固定 Package 或其它分支。
- LLM 分类/生成只是候选，关键校验必须由已有原生规则、权限、事件/状态权威完成；具体接口与 Atomicity 由后续 E0 消费者审计证明。

### 10.5 W3 候选方案（本轮供用户选择）

**W3-A：封闭型世界**。只有作者预先列举的类型、关系和事件才能持久化；AI 只组织表现。游戏确定性强，但自由 RP 空间不足。

**W3-B：分级约束 + 涌现世界（推荐）**。硬法则默认守护；起点事实可按因果事件演化；作者留白允许 AI 补充；低风险持续性新事实经 Native commit 自动确立；重大变化走明确效果和授权；改写法则需要特殊门槛。综合自由创作与世界一致性。

**W3-C：充分生成型世界**。除极少硬底线外，模型可自由重写实体、历史与规则，主要依赖事后纠错。创作自由最大，但故事因果、长期一致性和 Save/Branch 稳定性风险高。

**建议 W3-B，未冻结。** 更细权限矩阵和“高影响”定义须按实际游戏类型、作者许可、持久化范围与 E0 代码审计再讨论，不凭一次选择直接定死所有默认开关。

### 10.6 本轮必须讨论的难题

1. 当作者没有写“魔法是否存在”，AI 的第一次魔法现象是**发现**、**创造新事实**、还是**被世界禁止**？是否区分 Open World（默认未知）与 Closed World（默认禁止）？
2. 当作者写“帝王绝不会死亡”，这是世界硬法则、人物主观形容还是文学夸饰？机器能否仅从自然语言将其升级为硬约束？（建议必须经作者明确确认。）
3. AI 提出的“玩家眼前新开一家旅馆”何时获得持久身份？是否仅在后续继续引用时才从场景细节晋升成实体，如何防“临时叙事反复改口”？
4. 故事必须发生但违反作者世界法则时，是拒绝、显式授权改变、解释为误传，还是转入非正史分支？
5. 一次重大事件牵涉多实体关系/副作用时，如何确保**只发生一次**并与叙述、分支和有效视图一致？复用现有 Native receipt / state revision，不能另造无限重试/防御性系统。

**S4 时点状态：** 当时 W1/W2 已确认、W3 尚未选择；用户随后选定 W3-B，当前状态见 §11。每轮先更新 Plan 与唯一 Record，最终定稿须由用户明确批准。


---

## 11. S5 · W3 确认与 W4 运行时涌现 / 事件持久化议程（2026-10-17）

### 11.1 已确认 W3-B：分级约束 + 涌现世界

用户明确选定 **W3-B**：世界硬法则保护、初始事实可经因果事件更新、作者未定义的开放区域允许 AI 在授权范围内逐步补完；AI 生成事实的影响和持久性分级，重大变化须经过 Native 验证/事件提交，世界法则改变默认禁止自由执行，仅允许特别授权路径。可发生的剧情事件不要求每一次都弹人类审批。

与 W1-B / W2-B 一起作为已确认的**设计方向**，但 `E0-E3` 等级边界、具体 Schema/审核 UI、权限 API、默认启用范围与实际消费者接线**未定稿**；完整企划继续保持 Draft。

### 11.2 W4 不再局限于已写好的世界/知识

用户指出：如果游戏中出现一名之前没有预设的 NPC、某个新地点、物品、组织或事件，它如何进入**真正可演化的动态世界**？因此 W4 扩展为：

- 从“只管理既有事实”转为管理**事实的创生、揭露、接纳、变更、失效与主体观察**。
- 区分人物/物体在世界中已存在、第一次进入叙事、被权威持久化、是否值得进一步模拟、是否被特定主体知晓；这些维度不能混成一个状态。
- 讨论运行时 Entity Admission：临时细节无需永久建模，重要交互即时创建/关联长期身份，经现有 Native Authority 提交；已建立实体仍可处于低频/休眠/深度自主不同模拟层次。
- 事件提交流程与对外叙事须关联 receipt：事实提议、前置条件、Native commit、事件/状态投影、上下文刷新与 HCM 所知；拒绝或失败不得把未发生事件写成历史。
- 区分游戏事实 valid time、系统记录 revision、人物第一次认识/出生的时间，并保持 SavePoint/Branch 分叉隔离、as-of 查询和历史证据。
- 避免同名合并、把 NPC 传闻当真、每个路人启动 Agent、把 Package manifest Actor 与运行中新 NPC 身份强行等同，以及把 HCM graph 变成另一个世界权威。

**本轮详细 W4 候选设计、NPC 实例、既有代码审查及 W4-A/B/C 见独立模块 [runtime-emergence.md](runtime-emergence.md)**，该文件仍属于同一 ARCH-DWE-01 Plan Bundle，并非新的企划书。

### 11.3 W4 推荐（尚未批准）

推荐 **W4-B · 渐进接纳 + 关键交互即时提交**：无后续影响的临时场景元素保留文本/场景证据；承诺、交易、伤害、社交关系、长期驻留等一旦产生持续性后果，就在单一 Native 事件提交流程中给实体稳定身份，后续可以被世界时间、关系与 NPC 认知继续影响。持久性与自主性分别调度。

下一轮待明确：W4-A 全量立即登记 vs W4-B 渐进登记 vs W4-C 纯记忆按需重建；事实提交与公开叙事的同步门槛；谁决定事实应当持久化；时间化事实与分支隔离的关键契约。尚不创建实现分支或变更产品代码。

---

## 12. S6 · W4-B 确认与 W5 NPC 自主性候选（2026-10-17）

### 12.1 已确认设计方向 W4-B

用户对上一轮明确推荐的 **W4-B · 渐进接纳 + 关键交互即时提交**回复「认同」。该方向现已与 W1-B（World Model + Source Library）、W2-B（分层混合创作）、W3-B（分级约束 + 涌现世界）共同构成已确认方向。

- 只有叙事出现的普通背景细节不强制永久登记；当新对象形成持续影响时通过现有 Native Host 的受控事件/状态提交确立稳定身份。
- 实体身份、记忆认知、行动自主性分别管理；人物持续存在不等于每回合运行 LLM。
- 事件和有效世界状态与 Session/Branch/Revision 同源，HCM 是认知/资料证据而非平行可写世界真相。
- 选择 W4-B **不等于**已经批准确切的身份 Schema、事件 Receipt、持久化阈值、所有客户端实现或新的 NPC 行为引擎。详细已选方向与遗留事项见 [runtime-emergence.md §8](runtime-emergence.md)。

### 12.2 W5 阶段目标

问题从「新 NPC 何时进入世界」提升为「NPC 怎样在游戏时间、有限算力和角色信息范围内自主改变世界」。建议区分：

- **存在/身份**：NPC 是否具备持续身份与合法状态；
- **动机/认知**：它想做、承诺做、相信发生的事情，并不都已经实现；
- **行动资格**：由作者规则、世界条件、位置、资源、同意/交互权限决定；
- **调度级别**：日常作息与低影响事项通过规则，相关人物按事件触发、热点逐级启用有界规划，关键人物才使用 LLM；
- **事件提交**：影响世界的结果返回现有 Native Authority/Session，成功提交后才影响其它实体和后续叙事；
- **离屏时间**：根据游戏时钟与预算做有界追赶；不隐含退出 Atria 后实时后台计算。

**完整候选、原生代码限制、资料与 W5-A/B/C 选择统一写在 [npc-autonomy.md](npc-autonomy.md)，避免在总设计中复制第二份详细规范。**

### 12.3 W5 备选方向（尚未获用户批准）

- W5-A 主要依靠作者预设脚本/日程；
- **W5-B 分层事件驱动自主性（研究推荐）**：大部分日常行为使用规则/游戏时钟；部分关系和目标由有界效用选择响应；极少数重要 NPC 可使用 LLM 提议，最终仍由原生提交确认；
- W5-C 全体正式 NPC 都成为常驻 LLM Agent，成本与一致性风险高。

**当前仍为 Draft。** W5 的调度、模型预算、角色身份/认知接口、时间跳跃和跨分支缓存机制全部未冻结；不修改 main，不创建实现分支。


---

## 13. S7 · W5-B 已确认与 W6 NPC 社会认知/关系边界（2026-10-17）

### 13.1 已确认 W5-B

用户对上一轮推荐的 **W5-B：分层事件驱动自主性**回复「认同」。当前 W1–W5 的 B 方案均属于已确认的设计方向：

- 已登记实体按游戏时钟/规则/有限响应/极少数重要对象的 LLM 提议进行自主性分层；**持久存在≠独立常驻 Agent**。
- 目标和判断不自动成为已发生结果；在授权范围内所有实体/社会关系变更继续由现有 Native Host/Session 的规则和事件确认。
- 离屏演化按游戏内时间与作用域有界结算，不默认设备关机或退出游戏后继续实时后台生成。
- 当前 Native Simulation 的有限静态 jobs、现有 actor/perspective 入口并不能证明开放世界 NPC 已全部接入；具体统一身份和任务预算未冻结。

以上不代表 API、行为默认阈值、配置 UI、E0 审计、真实三端验证或整体 Plan 已定稿。参见 [npc-autonomy.md §10](npc-autonomy.md)。

### 13.2 当前 W6 议题：NPC 如何真正形成社会关系与主观认知？

本轮推荐明确区分 **真实/已提交的社会关系**、**每个主体单向的态度与动机**、**有来源的信念及信息传播**、**尚未实施的计划/行动**：

- 例：阿洛相信米拉会出卖他，米拉实际上尊敬阿洛；这种非对称心理状态完全合法，但不能据此声称他们已经正式结盟、解除雇佣或签订契约。
- NPC 可以听信假情报或不了解事实。有效视图应按 NPC/分支/时间/来源权限限制，HCM 可维护它的经历与误信；单一 Native Session 继续拥有世界真相。
- 一个社交事件只有按因果与行动条件提交后，才可作为双方/其他 NPC 的外部世界变化；每个参与者的获知/接受时间又可能不同。
- 新 NPC 的 Entity ID 与现有静态 Actor/Information actor/ToM perspective 并不天然等价，**E0 必须验证合法身份绑定的完整调用方**。不可简单让新 NPC 获得 Narrator 记忆权限，或反向修改 Package Manifest。

### 13.3 当前讨论入口

W6 的完整候选 W6-A「数值统一」、**W6-B「客观社会关系 + 主体认知 + 来源事件」（推荐，未选）**、W6-C「LLM/记忆重建」，以及代码证据、角色间传播场景、分支隔离与风险均只在 [npc-social-cognition.md](npc-social-cognition.md) 中维护。此处只负责已确认方向和路由，避免产生重复权威。

**状态：** Plan 仍 Draft，不修改 main，不创建实现分支；用户确认 W6 前不能将其推荐路线视作最终决定。

---

## 14. S8 · W6-B 确认与 W7 个人记忆/信息传播议程（2026-10-17）

### 14.1 已确认 W6-B

用户对上一轮的推荐回复「认同」：**W6-B「世界关系事实 + 主体认知 + 来源事件」**确认为当前顶层设计方向。共同成立的社会事实归 Native World State/Event，NPC 各自的态度、怀疑、秘密、目标和认知分属有来源、受授权的 Cognition/HCM；事件/传播连接两者，不因一人相信就认定世界真相或第三人已经得知。

因此 W1-B 至 W6-B 的方向均已获得用户认可；**整体仍 Draft，不等于 Schema、持久化策略、权限 API、消费者切换或正式开发方案冻结**。

### 14.2 W7 详细模块与待议路线

当前轮次转入「**新 NPC 如何建立合法私人记忆与受众视图；秘密、谣言怎样从一个主体合法传递到另一主体，并与真正的世界事实、分支、时间保持分离**」。

W7 专属模块：[npc-memory-information-flow.md](npc-memory-information-flow.md)。在那里维护当前研究、代码审查、传播与纠错场景、接纳流程、成本/权限风险以及三个候选路线，避免重复详细规范：

- W7-A：固定 Perspective + 主要依靠公共广播，简单但不适合动态 NPC 与秘密；
- **W7-B：动态受众资格 + 证据驱动信息流（推荐，尚未确认）**；
- W7-C：所有 NPC 独立 LLM 心智和自由信息流，高成本、高泄漏风险。

重要 E0 边界：`InformationRuntime.actors/views` 部分声明静态化；`actorAvailability` 未声明 actor 不可用，`Cognition` / `TheoryOfMind` 部分目标身份强制匹配 Package manifest；记忆检索遵循来源白名单与 branch/revision anchor。不能通过任意开放 Narrator 全视角，或在 Session 游戏时变更 Package Actor 清单来绕过权限。

### 14.3 本轮授权与状态

只在 `docs` 同一 Plan Bundle / 唯一 Record 中持续讨论。W7 的身份绑定、记忆语义、消息传播事件、保密级别、延迟到达、纠错与分支一致性仍未批准；**不修改 main、不创建实现分支、不声称测试/CI/UI 验收**。用户明确确认全案后才允许标记 Approved/最终定稿。


---

## 15. S9 · W7-B 确认与 W8 长期记忆/人格连续性议程（2026-10-17）

### 15.1 W7-B 为已确认的设计方向

用户对上一轮推荐的 **W7-B「动态受众资格 + 证据驱动信息流」**答复「认同」，记录为已确认方向。运行时 NPC 可在合法接纳及授权后获得个人 Perspective；实际发送、送达、听闻、相信与更正必须区分，并由有来源的事件/主体认知实现；接纳世界身份不自动获取他人私密资料或主动思考资格。HCM/Information/Cognition 只维护各自认知与证据，Native Session/Branch/Revision 继续拥有客观事实的唯一发布权。

目前 **W1-B 至 W7-B 均已获得用户方向性确认**；整体企划依旧 **Draft**，具体 Schema、动态受众发放方式、Memory/HCM 读写责任、传播协议和正式实施未批准。

### 15.2 W8 研究的关键边界

新议题：在长期 RP 和游戏时间跳跃中，如何使 NPC 既保持可信的过去与人格成长，又能遗忘细节、不全知、不因记忆压缩篡改客观事件？特别需要明确 **“世界曾发生什么” ≠ “某 NPC 现在记得/相信什么” ≠ “记忆索引目前召回了什么”**。

完整研究、原生代码依据、角色例子与方案对照均集中在同一 Plan 的 [npc-memory-continuity.md](npc-memory-continuity.md)，本节不复制其详细设计。候选方向：

- W8-A：全部正式 NPC 永久完整回忆；
- **W8-B：来源保真 + 分层回忆与人格连续性（研究推荐，尚未批准）**；客观历史与持续义务不可因模糊/压缩消失，个人回忆和态度可在合法证据、时间与相关性下变化；
- W8-C：用单一不断覆盖的 NPC 摘要作为人格和记忆的唯一权威。

### 15.3 既有实现与未解决部分

`public/shared/native-memory-contract.js` 已有受保护 identity/commitment/relationship/key_event 与可淡忘的 detail、`fadeAfter`/clarity/use；`public/shared/native-cognition-runtime.js` 按游戏时间推导部分淡化状态；HCM 已有 Episode 证据、图谱/检索和可选压缩；Information/Cognition 有源权限及 revision/scope 绑定。不能谎称 Atria 缺少所有上述能力或另建第二套记忆数据库。

仍需审计：W7 新 NPC 动态 Perspective 与 `actor_[...]` 的真实消费者、保护记忆与受控遗忘差异、人格变化所需的经验/证据、合法事件/记忆源与 Branch 绑定、Context 编译预算及源失效机制。未运行测试或进行产品实现。

**状态与边界：** W8 所有选择均待用户讨论确认；只修改 `docs`，不更改 `main`，最终定稿需用户另行明确批准。


---

## 16. S10 · W8-B 确认与 W9 身份及跨域引用权威（2026-10-17）

### 16.1 用户已确认 W8-B

用户对上一轮推荐的 **W8-B：来源保真 + 分层回忆与人格连续性**答复「认同」，现记录为已确认的架构方向；因此 W1-B 至 W8-B 的总体选型均已获得明确认可。其含义是：

- 世界事件、正式债务/承诺/关系的客观权威由 Native Session 的历史和状态维持，不因私人遗忘、记忆压缩/检索结果改变；
- HCM 有来源的 Episode、实体/事实/关系检索与 Native Memory/Cognition 对主体的信念、记忆清晰度、适用性、人格倾向按职责复用；不建立独立的 NPC 心智真相数据库；
- 重要人格变化由相关经历、时间及主体视角支撑；普通细节可以随合法的游戏时间推导模糊或难取回，不能因此覆写原始作者设定或秘密权限；
- 原有 Memory Contract 的 `identity/commitment/relationship/key_event/detail`、`fadeAfter/clarity/use` 等是**已存在的机制**，不应被视作尚未实现的设计。

该确认仍属**总体方案方向**，尚未批准 Memory/HCM 存储所有权的精确映射、演化/人格公式、运行时动态 Actor 接入、实际成本阈值或全端实施。

### 16.2 当前 W9：跨域主体身份

此次讨论的核心断点是：一个 World 里的人物可能同时拥有 authored Actor、Native World Session 主体、可选 Lifetime person、HCM evidence Entity、Cognition Perspective 和 Timeline participant，不能让多套本地 ID 变成彼此冲突的多份世界真相，也不应强迫它们变为同一个万能对象。

**W9 详细候选与精确静态代码核对仅在 [entity-identity-authority.md](entity-identity-authority.md) 维护**。当前研究倾向：

- W9-A：所有系统强制共用一个 ID 和实体对象；容易混淆 HCM 假设与 Native 客观身份。
- **W9-B：Canonical World Subject + 受控跨域映射/投影（推荐，尚未获用户批准）**；正式持久世界对象有单一 Native 可审计主体引用，不同领域保留有权限/来源/版本的 LocalRef 和独立业务所有权。
- W9-C：各系统身份保持独立，遇到同名靠 AI/Prompt 临时判断；分支、角色复用和历史误配风险高。

`src/native/identity.js` 当前确有 `actor`/World/Session/Branch 等 ID family，但静态阅读未发现统一 World Entity family；`src/native/session-core.js` 的 Timeline actorId 要求 manifest Actor，`src/native/lifetime-authority.js` 的人名采用 `life.person.*` 域内身份，HCM 图谱有证据支持的独立实体 ID / unresolved/merge/split 能力，而信息与认知接口部分仍依赖已声明 actor。**具体改造前必须完成 E0 消费者审计，不能伪称这些已经统一。**

### 16.3 讨论边界

- 先冻结“同一个世界主体为何能够跨模块统一引用”的权限/来源原则，再考虑 ID 表达和有限 Schema；不通过姓名直接绑定/合并。
- 作者预设 Actor/Profile 与真实 Session 内实例需要区分：一份模板可用于多个角色；读档/分支不同状态绝不回写共享 Package 或跨线泄漏。
- NPC 获得世界身份、合法 Cognition 受众和独立自主权限仍为不同能力，任何映射都不能扩展私人信息访问。
- 保持 W1–W8 确认方向、唯一 Native Host 写入权威与 Draft；未修改 main、未创建实施分支、未运行正式测试。

**W9-B 仅为本轮建议，不因用户选择 W8-B 而自动获批。**


---

## 17. S11 · W9-B 已确认与 W10 定义到运行时主体实例化（2026-10-17）

### 17.1 已确认 W9-B

用户对上一轮推荐的 **W9-B「Canonical World Subject + 受控跨域映射与投影」**回复“认同”；现将 W1-B 至 W9-B 都记为用户已确认的**顶层设计方向**：

- 同一个已提交世界主体拥有稳定可追溯的 Canonical Subject；它可与 Authored Actor/World Definition、Lifetime Person、Cognition Perspective、HCM 证据 Entity 和 Timeline participant 存在**受控、具来源、分支/版本限定、可见性受约束的关联**。
- Authored Profile/World 资源与 Session 主体有不同生命周期，HCM Entity 中的传言/未决人物不得仅因语义匹配而成为真实世界成员；世界主体身份与个人认知/自主行动资格仍须分别验证。
- 跨域一致不意味着所有领域强行共享一个 ID 字符串/万能对象，更不授权新建 Native SessionCore 之外的可写世界真相数据库；分支祖先已存在的主体按历史继承，分叉后的状态/秘密/映射分别有效。
- 该决定**不构成**具体 Entity ID family、绑定 Schema、全部消费者适配、跨平台端到端验证或正式开发授权。Plan 仍是 Draft。

### 17.2 W10 研究问题与当前推荐

进入 W10：固定的 WorldEntityDefinition/ActorProfile 如何实例化为 Session Subject；没有预设角色卡的涌现 NPC 如何在持续互动后获得表达、受限 Cognition/HCM 视角和有界 Task/Simulation 能力；这些关系如何在分支、历史与多人秘密身份中保持真实且不越权。

详细候选、源码核对与验收场景仅在同一 Plan 模块 [subject-instantiation.md](subject-instantiation.md) 维护。候选三选一：

- W10-A：运行时将新 NPC 直接追加/改写 Package Actor Manifest；破坏固定创作资产与 Session 隔离。
- **W10-B：固定定义 → Session 实例化 + 类型化能力绑定（研究推荐，W10 尚未获用户批准）**；Native 只管理正式 Subject/事件，表达模板、个人视角、生命周期记录和 Task 都通过合法绑定/投影引用，保留自由生成 NPC。
- W10-C：只靠 Narrator/HCM 文本猜测动态 NPC 对话与身份；无法保证一致性和私有来源权限。

### 17.3 现有运行时必须审查的断点

`src/native/session-core.js` 的 Timeline `actorId` 当前只接受确切 Package Manifest Actor；`public/shared/native-actor-profile.js` 只用固定 Actor Definition；`public/shared/native-information-contract.js` 的 Perspective 声明和 `src/native/cognition-authority.js` 等仍有 Actor/权限绑定；`src/native/identity.js` 静态已读 Native ID families 不含 World Subject family。不能把新 NPC 的 `SubjectRef` 直接假冒 `actorId` 或将 Source 的名字自动合并成身份。

需要 E0 审计 Timeline、ActorProfile、Host/Orchestration、Cognition/Information/ToM、HCM、Lifetime、Visual/Speech、Session/Save/Branch 的全部真实调用方，确定最小、没有兼容双轨的受控 cutover。不能因设计确认就说这些功能已经实现。

**状态**：W1–W9 方向已选，W10 只为候选；本轮只有 docs 文档修改，未实施代码、测试/CI 或真实三端 UI。所有接口需后续讨论后才能定稿。


---

## 18. S12 · W10-B 确认与 W11 类型化身份/能力接口及 E0 准备（2026-10-17）

### 18.1 W10-B 已确认的方向

用户明确认可 **W10-B「固定 World/Actor 定义 → Session Subject 实例化 + 类型化能力绑定」**。W1-B 至 W10-B 已获得用户对各轮总体路线的认可；当前 Plan 仍 **Draft / 讨论中**，不代表任何具体 ABI、ID family、权限签发机制、E0/CI/三端或正式开发任务通过。

W10-B 关键约束：Native Session/Host 独占正式 Subject/世界事实与事件；固定的 World/Package/Actor Profile 不被 Session 回写；动态 NPC 在持续后果产生时按 W4-B 正式接纳，另经有权限的关联获得**表达、合法认知视角、行为/任务**；角色身份与个人记忆/秘密/发言者身份的授权不同，Save/Branch 锚定所有可达映射。详细决定在 [subject-instantiation.md §10](subject-instantiation.md)。

### 18.2 W11 需要进一步取舍

W11 讨论不再单纯描述“应该统一身份”，而是确定哪些接口有意义：`SubjectRef`（唯一可追溯世界成员）、`ActorProfileRef`（作者表达模板）、`Perspective/CapabilityGrant`（按受众受限的证据/记忆/任务视图）、`Participant/SpeakerRef`（确切已提交对话/事件的实际参与者），与 Lifetime / HCM / Visual / Goal 等领域 LocalRef 的来源关联。**这些是逻辑契约草案，不是已存在或已获批准的代码 API。**

详细源码依据、字段草案、E0 Partial Evidence / 未查全调用方与三方案统一保存在同一 Plan 的 [subject-contracts-e0.md](subject-contracts-e0.md)：

- W11-A：让 `actorId` 兼任全部世界主体身份及权限，不推荐（过度集中且与静态 Manifest 冲突）。
- **W11-B：Typed Subject/Participant/Perspective + Host Capability Resolution（本轮推荐，尚未获用户批准）**；在当前 Native Authority 内对每种能力做明确的有源投影，更新真正依赖 `actorId` 的消费者，不再造平行可写身份服务。
- W11-C：主要让 Narrator 临时演绎新 NPC，保留静态 `actorId` 语义，不推荐（实际发言/心理/事件仍可能漂移）。

### 18.3 E0 现有证据及阻塞

定向静态核对 `src/native/session-core.js` Timeline `actorId` 属于 `manifest.actors`、`public/shared/native-actor-profile.js` 仅作者定义、`public/shared/native-information-contract.js` assertInformationClosure 需要声明 actor 属于 manifest、`src/native/cognition-authority.js` / `tom-authority.js` 的部分权限及身份校验，以及 `public/shared/native-frontend-host.js` Message schema / `src/native/speech-service.js` / `src/native/visual-continuity.js` 仍涉及 `actorId` 或临时视觉身份；`src/native/agent-intelligence/goal-contracts.js` 的 actor Goal 也使用 Native Actor ID。**这些是部分可核验的路径，不构成全量 E0 或 E0 通过证据。**

下一步要完成完整 caller/callee map、允许 Subject→表达/Perspective/Participant 的最小原生契约、版本和保密约束、上下文编译与回档安全、最终 cutover 阶段/验收规则；必须先由用户在讨论后批准设计定稿才能授权产品代码变更。当前只在 `docs` 修改方案和唯一 Record。


---

## 19. S13 · W11-B 确认与 W12 E0 消费者/原生收口议程（2026-10-17）

### 19.1 W11-B 已确认的架构方向

用户对上一轮明确推荐的 **W11-B「Typed Subject / Participant / Perspective + Native Host Capability Resolution」**回复“认同”，故 W1-B 至 W11-B 均为当前已获用户确认的**顶层架构方向**。世界 Subject、表达 Actor Profile、私人受限 Perspective、正式对话/事件 Participant 有不同含义，通过现有单 Native Host 结合 Session/Branch/Revision/受众合法解析；按实际调用方最小重构，不能新建平行可写真相权威、不能将旧 Actor 全域一体化、不能用 Narrator 代演来冒充事实写入。

该确认**不意味着**用户已批准精确字段/ID family、受众动态签发实现、事务边界、UI、E0 全消费者审查结论、任何跨端验收或正式开发。

### 19.2 进入 W12：接口级 E0 与硬切边界

W12 的**唯一详细模块**为 [e0-consumer-cutover.md](e0-consumer-cutover.md)，包括已核对生产源码路径、Source-of-Truth/Consumer Matrix、Native World event / state / Receipt / Timeline 出版事务、游戏时间有效期、Save/Branch/认知隔离、世界/知识创作 UI 以及分阶段 Cutover 的候选 Gate。不要把它写成另一份独立 Plan 或已完成审计。

W12 方案暂列：
- W12-A：不先完成实际 E0 便大范围同时重写所有领域 Schema，消费者漏改和事务一致性风险高；
- **W12-B：E0 证据驱动的原生硬切 + 单权威提交收口（研究推荐，尚待用户选择）**；先实际查清生产调用方和权威来源，必要最小 Native 合约原子接线，最后清退旧双轨；明确时态、分支、受众与端上验收阻塞；
- W12-C：为了老数据长期维持新的 World Subject 与旧 Actor/World/Knowledge 并行的真相或兼容引擎，不适合当前 Dev 项目。

### 19.3 已有证据不是 E0 通过

定向读 `src/native/repositories/session-repo.js`：`commitSnapshot` 的现有资源事务负责 immutable dependencies/commit receipt/expectedRevision/Session root 发布；`public/scripts/native/experience/world/session.js` 的 `commitEvents` 同步 World State 和 Game Runtime Journal 的 state patch。**但所有 Narrative + Task/Authority + World Effects/Cognition 的具体端到端原子性尚未核验**，不能从两处代码直接推断全域一致。当前 `public/shared/native-chronicle-host.js` 的世界视图主要围绕特定 Lifetime 查询，尚非通用可任意游戏规则使用的 World Entity 时态 Inspector；`public/scripts/native/world-editor.js` 仍以 World revision `schema/baseline` 等为主。W12 必须同时考虑 Library/Studio/Play 的实际消费重构，而非只写新的数据类型。

W12 本轮继续**仅更新 docs 同一 Plan 和唯一 Record，保持 Draft，不创建实现分支、不修改 main、未执行 E0 完整审计或跨端测试**。后续用户明确选择 W12 后下一轮才按协议写回已确认方向和讨论更细 Gate。


---

## 20. S14 · W12-B 已确认与 W13 世界事件/时态/分支议程（2026-10-17）

### 20.1 已确认 W12-B

用户对上一轮推荐的 **W12-B「E0 证据驱动的原生硬切 + 单权威提交收口」**回复「认同」。W1-B 至 W12-B 现为已确认的**顶层方向**。这项决策要求在未来正式实施前先对真实生产消费者、写入入口、契约权威和旧路径做完整 E0 审计；开发目标是利用**现有 Native Host/Session/Branch/Revision**受控提交，并在可验证后完成无长期兼容双轨的原生 cutover，而非再建一套可写 World/Actor/Knowledge/Memory DB。

**重要界限**：选择 W12-B 仅批准这种审查与切换方向，**没有**批准任何具体新 ID/Schema、全量 E0 通过、发布/事务范围已经满足目标、改动产品代码或切换实施分支。完整企划仍是 Draft。

### 20.2 W13 需要决议的事实与历史权威

本轮明确把“现实中已经发生什么”扩展为**事件提议、受控 Native Effect/Receipt、已提交 Revision、游戏有效时间、后续合法见闻、不同分支历史**之间的一致性问题：

- 不是每个叙事细节都需要结构化；但产生持续世界后果的 Subject admission/交易/关系/状态变更，必须通过现有 Native Authority 受控确认，叙事文本不能单凭模型说辞冒充事实。
- `validFrom/validUntil`、`eventAt` 表达客观游戏时间；`recordedRevision` 是正式提交版本；`observedAt` 是各角色获知时间；检索需要同时约束 Branch/Revision/GameTick/合法受众，不允许未来确认的秘密泄漏给过去版本的 NPC。
- 改变当前事实、追认早已发生但后来才发现的事实、修订错误认定、真正改写过去（retcon）需不同权限和历史语义，不能通过“回写旧世界设定”隐蔽处理。
- SavePoint 只引用正式可达的 Branch/Revision；分叉前实体身份可继承，分叉后状态/个人认知/事件/异步结果相互隔离；HCM/Context 的索引只从已提交且受权限约束的来源派生。

**详细方案、可靠性矩阵、实际 main 代码证据和 W13-A/B/C 候选唯一放在 [event-temporality-branch.md](event-temporality-branch.md)**，与 ARCH-DWE-01 同一个 Plan Bundle，不单独创建新 Plan 或 Record。

### 20.3 W13 候选（用户尚未选择）

- W13-A：以当前 Snapshot 为主，事件只记松散摘要；成本较低但无法充分支撑历史有效期与多人异步社会推演。
- **W13-B：Native Revision 一致性提交 + 双时间/分支受控投影（研究推荐、未获确认）**：利用 Session/Revision/Receipt 与现有事件/游戏时钟，补齐最小合法事实时态与 as-of 查询，HCM/Context 为可重建投影、不成为真相。
- W13-C：另建平行 Event Store/Temporal DB 并异步对齐 Native；会造成双权威和分支/持久化故障窗口，不适合当前 Dev 原生硬切目标。

`SessionRepo.commitSnapshot` 的现有同事务发布和 `world/session.js` `commitEvents` 的 state patch 为**可利用的事实基础**；但所有 Story Turn/NPC 自主演化/Task/World/Timeline/Cognition 端到端是否原子发布、通用有效时间和历史更正能否查询依旧是 E0 阻塞。当前**只修改 docs**，未开展实际代码变更、Node/CI/真机测试。用户若认可 W13 方向，下一轮依讨论协议先更新原 Plan/唯一 Record，再进入 World/Knowledge Effective View、Library/Studio/Play 与真正剩余 E0 Gate 的讨论。


---

## 21. S15 · W13-B 已确认与 W14 有效世界/知识及 Context/产品议程（2026-10-17）

### 21.1 W13-B 方向正式确认

用户对上一轮推荐的 **W13-B「Native Revision 一致性提交 + 双时间/分支受控投影」**回复“认同”。据此 W1-B 至 W13-B 为**已获用户认可的总体架构路线**：

- 在已有 Native Session/Branch/Revision/Receipt/CAS 单权威中协调有持续后果的 World Subject/Event/State/关系和必要的 Participant，明确模型提议与真实已提交效果的边界，不引入第二个 EventStore；
- 客观游戏有效时间与事实记录修订/见闻时间分离，合法历史查询需绑定 Session/Branch/Revision/GameTick/Perspective；新证据揭露、更正错误与真正 Retcon 不得混淆；
- 存读档后只继承当前分支的合法祖先状态，HCM/Context 保留来源证明并按授权重建衍生索引，不让另一分支延迟任务或泄漏的秘密污染当前线。

该方向不等于已冻结所有 Event/Fact 字段、证明所有 Narrator/World/Task/Cognition 原子性或全面 E0 通过；Plan 仍 Draft，禁止修改 main。

### 21.2 W14：让 World/Knowledge 成为“活世界的有效资料”而非原样静态提示词

当 WorldRevision 固定文本“莱恩是皇帝”，当前 Native 世界却已提交“莱恩死去、米拉继位”时，不应将两份文本不加时态区分地交给 AI。必须同时区别：

1. 作者高约束**世界法则**（不能因最新叙事轻易覆写）；
2. 初始但可变化的**起点世界事实**；
3. exact Branch/Revision/GameTick 下**当前有效的原生事实**；
4. 已终止的**历史事实**；
5. 有来源但不一定真实的**文献声明/传闻**；
6. 各 NPC **自己的知识、误信与秘密**，取决于合法 Perspective。

详细代码证据、Effective World View 候选机制、Knowledge Source Claim 冲突解释、Context Compiler 排序与 Scene/Token 预算以及 Library/Studio/Play/Inspector 体验统一在 [effective-world-view.md](effective-world-view.md)；本总设计只记录决策路由，避免重复第二份详细规范。

### 21.3 当前 W14 三选一（均未获用户确认）

- W14-A：保留以激活触发与权威 Rank 为主的静态知识注入，尝试通过当前世界状态在提示词里抵消旧文案；缺乏精确语义失效和历史/受众隔离；
- **W14-B：Effective World View First + Claim/Source-Aware Context（研究推荐，尚未获批准）**；在现有 Host 中先得到受众安全的当前/历史/法则/Claim 有效投影，再按用途检索 World/Knowledge/HCM；可变声明的真假/有效期不能靠文本排名决定；
- W14-C：让 LLM 每轮重写新的“最新世界书”作为权威；会篡改作者资料、产生双真相和长会话成本。

当前 `knowledge-runtime.js` 已定义来源权威排序、State Conditions/Exclusive Group 和有限的 memory conflict filtering；`context-compiler.js` 已有 `current_state_event`、`knowledge`、`memory` 等预算 lane，当前部分情况下将完整 `atri_world_state` JSON 和已选知识正文一起纳入 Context。**Rank/priority 并非通用自然语言事实语义验证器**，且 Library/Studio 编辑器仍以 Source/JSON 资源为主。这些静态代码事实为 W14 设计基础，不能冒称当前已有通用、按任意实体时态/角色视角的 Effective World View。

**W14 待用户决定；W15 还需 E0 完整 Source-of-Truth/ABI/Consumer/Deletion/Gate 收口，所有真实客户端与实施仍为阻塞**。仅 docs 同一 Plan Bundle/唯一 Record 被更新，不创建实现分支。


---

## 22. S16 · W14-B 确认与 W15 E0 架构收口审查（2026-10-17）

### 22.1 已确认 W14-B

用户明确认可上一轮推荐的 **W14-B「Effective World View First + Claim/Source-Aware Context」**。目前 **W1-B 至 W14-B 均属于已获用户选择的顶层设计方向**；完整企划仍为 **Draft**，并未批准具体 Projection API、Claim/Fact/Persona Schema、代码实现、E0 完整审计或三端验收。

W14-B 的稳定原则：在现有 Native Host 的受众合法只读投影上先识别固定 Hard Law、初始但可变事实、已提交当前/历史事实、Source Claim 和私人 Belief，再把有关的自由文本/Knowledge/HCM 来源按有效性、来源、时态、场景与权限带入 Context/Library/Studio/Play。Context rank/关键词激活不等于自然语言事实失效；作者原始资料不可被 Play 覆写，真正硬法则不能被低权限事件突破。详细确认见 [effective-world-view.md §10](effective-world-view.md)。

### 22.2 W15 核心目标：使既定方案有可核验的实施边界

此轮不再扩展新的平行世界架构，集中审查 **哪份数据由谁写入、哪些真实生产消费者读取、目标合同如何与现有 Native SessionCore/Knowledge/Information/HCM/Context/Media/Frontend 融合、哪些旧 actorId/world-info/Orchestrator 适配需要根据活入口证据进行清退**，以及开发前/实施期应分别取得什么验收证据。

完整 Source-of-Truth/Owner/Consumer/Contract/Deletion 表、实际 main 静态代码探针、E0-01～09 未解决阻塞和 Gate 0～4 只维护在 [e0-final-closure.md](e0-final-closure.md)，它是同一 Plan Bundle 的 W15 子模块，不创建另一个 Plan 或 Record。

**当前特别明确的代码事实与局限**：
- `knowledge-runtime.js` 既有 rank/部分状态条件；`context-compiler.js` 将当前 `atri_world_state` 与原始知识正文分 lane 输入。这并未证明旧文本被语义级淘汰。
- `SessionCore/SessionRepo` 有 CAS/Receipt/Revision 发布基础，但不能在未审真实调用链前宣称所有 World Effect/Narrative/Participant/Cognition 都处于相同原子提交。
- `actorId` 仍贯穿 Timeline/Information/Frontend/Play/Speech/Visual；HCM/Lifetime 另有本地身份；动态 Subject 的类型化接线须逐个消费者证明，而非盲目字段替换。
- `public/scripts/atri-world-info-*`、`agents/orchestrator/legacy-*` 和 `native/knowledge-prompt-channels.js` 等源码仍存在。静态搜索发现部分 Legacy Orchestrator 生产引用，但**不能因此声称所有旧 World Info/Orchestrator 路径都正活跃**；应按真实 call graph 分类保留/替换/删除，不能为硬切误杀现役插件能力。
- 本次 GitHub 远端代码搜索有条数上限、多文件读取不在同一个固定 `main` commit 快照，且未运行 Node、CI、UI 或 Windows/CachyOS/Android Termux；**E0 是 PARTIAL / BLOCKED，不是 PASS**。

### 22.3 W15 候选路线及审批边界

- W15-A：直接把十四轮方向性决策当作 E0 完成、标记 Final 并创建实现分支，当前缺可靠消费者/事务/权限证据，不推荐。
- **W15-B：以证据门槛 E0 收口并形成可执行交接清单（研究推荐，尚未获用户批准）**。逐项获得完整固定 HEAD 的真实生产调用图、Authority/Contract/Consumer/Deletion 与权限/时态/存档/跨端验收门槛，审明实际阻塞，最后再向用户申请全案定稿与开发授权。
- W15-C：仅继续抽象设计而不建立退出 Gate，会扩大范围并让方案长期无法交接，不推荐。

**重要**：此轮只确认 W14-B。W15-B 仍是助手推荐；E0-01～09 和目标 API、业务归属/清退表/验证计划没有被宣布已通过。下轮讨论 W15 后仍需完整 E0/最终交接审计，才能决定正式实现前置条件。当前只修改 `docs`，不修改 `main`。


---

## 23. S17 · W15-B 确认与 W16 跨分支集成审查（2026-10-17）

### 23.1 W15-B 已确认：审查方法，而非 E0 PASS

用户对上一轮推荐的 **W15-B「证据门槛式 E0 收口 + 可执行交接清单」**回复「认同」，因此 **W1-B 至 W15-B 都属于已获用户选择的设计/收口方向**。W15-B 确认在开发前按真实 HEAD 和生产 Consumer/Owner/Schema/Deletion 形成明确阻塞及交接表，并针对必要的安全、时态、分支和端上证据设置 Gate；它**没有**授权新实现分支、修改产品代码、批准具体 API/Schema、宣布 E0 完成或整份方案 Final。

E0-01～09 依旧 **PARTIAL / BLOCKED**。W15 的完整方法、E0 问题及验收 Gate 见 [e0-final-closure.md §8](e0-final-closure.md)，当前不新建第二 Plan 或 Record。

### 23.2 W16：精确 HEAD 下的真实新接口

本轮利用 GitHub `git/ref` 和 Commit Compare 取得并锁定静态对照：

- `main` = `c57fada6edeea255b29d857ba2585c1dbc9c098b`；
- `refactor/atria-native-orchestration-v3` = `a7cb649d0cd12cdaf7d7e91e96e654ba6261fea9`，**ahead 97 / behind 0**，新增大批 `src/native/orchestration` Context/Effect/Result/Domain Receipt 层；
- `refactor/atria-native-prompt-preset-deepening` = `760327891149216dffdc1e3fa0c846496007a013`，相对 main **ahead 1 / behind 10**，新增 Semantic Blocks、Draft Preview 以及证据/叙事使用政策；
- `feat/native-visual-generation-deepening` = `ae587be0c64487ba922528bdd0146444bcf5e92e`，相对 main **ahead 6 / behind 48**；
- `feat/agent-intelligence-plan` = `8fb5ad0e14be311558b6011e57b2634e3eed6f2f`，对 main Compare 报无共同祖先，**不能作为 main 生产链直接推断**。

**新的关键接口界线**：V3 的 `effect-controller.js` 为编排 Effect 的 prepare/ready/claim/observe 和证据收据；`native-turn-orchestration.js` 把正式 Native Session 输出交给原 `sessionCore.finalizeTurn` 并从 `readSessionTurnOutput` 回查 Domain Receipt。编排 Result/Effect Receipt **不是** World Subject/Fact 的最终写入权威。V3 的 `context-port.js` 直接承载 Context Compiler + Information Audience/Grant 的 Host 许可，W14 Effective World View 必须通过合法的 Source/Scope 入口接线，不能直接把 Narrator 全视图塞给 NPC。

Prompt Preset 分支的 `prompt-compiler.js` `worldUsePolicy / memoryUsePolicy` 与 `semantic-blocks.js`、`draft-preview.js` 提供 Prompt/Provider 语义和 Authored/Effective/Wire 视图，但**Prompt Effective 不自动等于 Native World Fact Effective**。正确顺序候选为 `Original Native Domain World Fact → Host-owned Effective World View → V3 ContextPort/ContextCompiler → Prompt semantic/Wire`，各阶段不得成为新的 World Truth。

以上是**部分静态文件审查**，不是完整实际调用图；具体文件/映射/Source 和分支差异数据在 [e0-integration-readiness.md](e0-integration-readiness.md) 维护。

### 23.3 W16 待选方案及实际阻塞

- W16-A：仅按当前 main 的旧生成链冻结 World/Prompt ABI，忽略并行 V3/Prompt 分支接口；合流冲突大。
- **W16-B：跨分支锚定 E0 + 优先锁定 Native Domain/Context/Receipt 所有权，再冻结世界最小接口（本轮推荐，尚未获用户确认）**。依实际接口冲突重验最新集成 HEAD，先完成 World Subject/Fact/Capability 的单权威与编排/Prompt 的消费边界，形成真实入口/调用/清退表，拒绝并行适配真相；不要求等待全部无关分支完成。
- W16-C：为了同时支持旧 main/新 V3/Prompt 保留长期多层兼容适配，将引入多权威与变更成本。

特别明确：旧 `worldInfo*`、旧 Orchestrator 代码的源码存在不能证明全部模块正活跃；某些旧 Adapter 仍有生产引用，**需要在固定目标集成 HEAD 下核对合法消费者再决定保留/替换/删除**。本轮没有足够证据把任何产品文件标为立即删除。V3/Prompt 也尚未合入 main，不能伪称当前产品已经具有其新增接口。

**本轮工作边界**：只修改 `docs` 的同一 Plan Bundle 和唯一 Record；不开实现分支、不更新产品代码、不运行 CI/Node/E2E/Windows/CachyOS/Termux。若用户后续批准 W16-B，下一阶段应明确最小 Interface/Native Publication/有效视图接线与 E0-06 的全消费者实际审查完成要求，不机械延长抽象选型轮次。全案仍保持 Draft。


---

## 24. S18 · W16-B 确认与 W17 Domain-first 接口收口（2026-10-17）

### 24.1 W16-B 正式确认

用户对上一轮唯一推荐的 **W16-B「跨分支锚定 E0 + 先锁 Host Domain/Context/Receipt 所有权，再冻结最小世界接口」**回复「认同」。W1-B 至 W16-B 均属于**已确认的设计/审查路线**，但整个 ARCH-DWE-01 继续保持 **Draft**；W16-B 不构成 E0-01～09 PASS、精确 Subject/Fact/Temporal/Capability/Context 接口或正式产品实现授权。

W16-B 强调在锁定当前 main、Native Orchestration V3、Prompt Preset、Visual 等真实 HEAD 的前提下，分别确认原 Native Domain 世界状态的写权、V3 Run/Effect/Result 的执行观察权、Host ContextPort 的许可权、Prompt Compiler 的编译/Provider Wire 责任。不采用孤立旧 main 设计所有未来接口，不为两套暂时分支制造永久兼容适配，也不等待所有无关分支完全结束。

### 24.2 W17 原生读写合同：定向静态证据

本轮进一步在明确的 main/V3/Prompt SHA 下读具体函数：
- `SessionCore.finalizeTurn` 的某些 `authority-first` 路径，在已有 Domain Authority Candidate 上准备并将 State 与 Narrator Timeline entry 一起交由 `_publish`；`_publishLocked` 生成 Revision、Action/Task Receipts 并使用 `SessionRepo.commitSnapshot` 发布。
- `public/scripts/native/experience/world/session.js` 的 `commitEvents` 会使用 Native `commitStatePatch` 原子提交 **World State + Game Event Journal 的候选 patch**，但它不是“所有 Narrative/World/Task 自动共享一次提交”的证明。
- V3 `native-turn-orchestration.js` 的 `#commitSessionOutput` 根据 `sessionCore.finalizeTurn` 和原 Domain Receipt 校验正式效果；`effect-controller.js` `prepare/ready/claim/observe` 只是编排流程结果观测。编排 Effect Receipt **≠** World 事实注册。
- V3 `context-port.js` 持有 SourceBinding/Audience/Grant/Token Budget、Memory 授权和异步完成后再验证，当前还会调用 `compileNativeContextPlan`；Prompt Preset `prompt-compiler.js` 有证据/历史使用 policy 和 semanticBlocks，但这些不是事实或可见性授权接口。

**关键设计缺口**：`World Subject admission + World Fact/Epoch + Participant + Cognition + committed narrative` 的完整开局/涌现 NPC 跨业务路径合约尚未在生产代码中被证明闭合；动态 Perspective 仍有 Manifest Actor 限制；通用世界双时间查询与 Source Claim 适用性未实际验证。上述局部静态读取不能声称 E0 完全通过。

### 24.3 W17 的唯一详细模块、候选选择

W17 详细 Source/Owner/Receipt/Read-Projections/Context Binding/候选 ABI、不变量及 E0-01/02/04/05 的退出条件统一维护在 [e0-domain-world-context-contract.md](e0-domain-world-context-contract.md)，不复制另一份独立 Plan。

- W17-A：以 Orchestration RunLedger/Effect 为事实写入中心，与 W12 单 Native Host Authority 相冲突。
- **W17-B「Domain-first Commit + Revision-anchored Authorized Effective Projection」（本轮推荐，用户尚未确认）**：让 World Subject/事实通过现有 Native Domain Session/Revision/Receipt 变更；让 Orchestration Run/Effect 消费原领域收据和执行证据；有效世界只读视图按合法 Branch/Revision/GameTick/Audience 向 V3 ContextPort/Context Compiler/Prompt 分层提供事实/历史/认知/Source Claim；最小补充确实缺失的身份、参与者和时态接口。
- W17-C：从 Prompt/LLM 自由语义判断推断新的 World Fact，违背来源及写入权限。

**W17-B 当前是推荐方案，不是用户已批准决定。** E0-01～09 仍为 PARTIAL / BLOCKED，`main` 及活动分支全部保持原样；本轮只修改 `docs` 同一企划与唯一 Record，不运行 CI/测试/真实 UI/三端验收。


---

## 25. S19 · W17-B 确认与 W18 最小 ABI / 真实消费者硬切讨论（2026-10-17）

### 25.1 W17-B 正式确认

用户对上一轮明确推荐的 **W17-B「Domain-first Commit + Revision-anchored Authorized Effective Projection」**回复「认同」。**W1-B 至 W17-B 均获总体方向确认**，但整体企划仍为 **Draft**，尚未批准物理 ID/Schema、所有 API、生产代码切线、E0 完整验证与开发实施。

确认的硬边界：
- 只有现有 Native Session/Domain Authority 能正式提交 World Subject、Fact/Relation、有效 Event/State 和 Domain Receipt，Orchestration V3 的 Plan/Run/Effect 负责执行与观察凭据，Prompt 的 Effective/Wire 只负责已获授权来源的表达。
- `World Game reducer.commitEvents` 与 `SessionCore.finalizeTurn` 各有现存合法事务，但**跨两条独立调用路径的全局原子提交尚未证明**。具有持续效果的对话/世界事件在正式发表前应以原 Domain Receipt/Revision 为依据，不用模型文本或编排 Effect `confirmed` 冒充世界事实。
- Host-owned Effective World 是受限只读投影，按确切 Session/Branch/Revision/GameTick/Source/Audience/Scope 构建，经 V3 `ContextPort` SourceBinding/Grant/Currentness 校验后传入 Knowledge/HCM/Context Compiler；Prompt 不获得额外秘密权限或写权。
- 最小类型按真正缺口加入，不建立独立 FactStore/EntityRegistry/万能 Adapter；固定作者角色卡仍是资源，不因新 NPC 出现而由 Play 修改 Package Manifest。

### 25.2 W18 已定位的实际 Schema 约束

本轮以同一冻结的 `main=c57fada6edeea255b29d857ba2585c1dbc9c098b` 与 V3/Prompt 分支 SHA 读取更多实际合约：

- `src/native/identity.js` 现在未定义独立 World Subject ID family（已有 Actor/World/Session/Branch/Revision）；如何分配 `SubjectRef` 必须由 E0 确认，不能假称 `subject_*` 已存在。
- `src/native/contracts.js` `assertTimelineEntry` 校验可选 `actorId` 为 `actor_*`；`SessionCore._newEntry` 还约束其必须属于 Package Manifest；`native-frontend-host.js` `MESSAGE_SCHEMA`、`play-product.js`、`speech-service.js` 和 `visual-continuity.js` 均依赖相关身份/表达。需要拆分真实 Participant 与 AuthoredActor Expression，而**不是所有 actorId 全局字符串替换**。
- `native-information-contract.js` `assertInformationClosure` 强制 Actor 属 Manifest，动态 NPC 不会自动合法拥有 Perspective；`native-information-runtime.js` 对未声明 Actor 判 unavailable，Source/Scope Epoch 与受众权限应复用而非跳过。
- `src/native/world-knowledge.js` `WorldRevision` 和 `KnowledgeEntry` 还没有通用 FactKey/valid interval 语义；`native-chronicle-host.js` 的 `WORLD_QUERY` 只是特定 Lifestyle/History/World View 类别，不能宣称已提供任意 Subject 的双时间 as-of 查询。
- V3 `ContextPort` 已明确 `sourceBinding/audience/grantDigest/tokenBudget` 并在 Memory/Context 编译后复核；Prompt 分支的 worldUsePolicy/semanticBlocks 是语义/编译层而非世界事实签发权威。

完整逐代码 old→target/retain/replace/investigate、最小逻辑类型、测试目标与 W18-A/B/C 候选**只在** [e0-minimal-contract-cutover.md](e0-minimal-contract-cutover.md) 维护，避免总设计与专题重复。

### 25.3 W18 方案待选

- W18-A：立即冻结一整套全新 ID/Schema，忽略有界缺口和未合入消费者，易创建冗余模型和后续重构。
- **W18-B：差异最小的 Typed ABI + 实际消费者验收驱动硬切（推荐，尚未获用户确认）**。先定清楚 Subject/Participant/Expression/Perspective/Fact/EffectiveRead 的语义及唯一 Domain Owner，再以最终真实集成 HEAD 定义最少新增字段/合同并逐消费者验证，保留作者自由文本、既有权限/Receipt/History，清退确证的旧权威，不保留旧数据兼容双轨。
- W18-C：为旧/新全部 ID 造万能 SubjectAdapter，长期保持新旧语义混合，与 W12/W16 已确认的单权威冲突。

**E0-01～09 仍 PARTIAL / BLOCKED**。以上均为 GitHub 静态代码审查及 docs 文档调整，没有运行 CI、Node、浏览器或 Windows/CachyOS/Termux 实测，未修改 `main` 或开发分支。若用户后续选择 W18-B，下一阶段应转为真正的 Gate 0 最终消费者/字段 cutover 审计与通用有效期合约验证，不无限延长抽象架构讨论。


---

## 26. S20 · W18-B 确认与 W19 Gate 0 最小物理/历史查询收口（2026-10-17）

### 26.1 用户确认 W18-B（总体架构方向，非物理 API 冻结）

用户对上一轮推荐 **W18-B「差异最小的 Typed ABI + 实际消费者验收驱动硬切」**明确回复「认同」。因此 W1-B～W18-B 为已确认总体方向，重点是：**Subject/Participant/Expression/Perspective/DurableFact/EffectiveRead 的语义分离 + 原生单 Domain Authority + 以实际消费接口差异和可信验收为依据的硬切**。不因架构概念数量而增加同等数量的数据库、服务或 ID family；只有对照现有版本证明缺口才能添加。

W18-B 不是批准具体 `subject_*`、`participantRef`、FactKey/valid-time 字段、Command 或 Host ABI、旧生产代码删除，也不代表 E0-01～09、三端真实验收或正式开发已获批准。

### 26.2 W19：对原生物理数据和通用 as-of 查询的更具体核对

本轮冻结的 `main=c57fada6edeea255b29d857ba2585c1dbc9c098b` 与 Orchestration V3/Prompt/Visual 分支 HEAD 未改变；定向源码审读新增了：

- `SessionCore.initialWorldState` 支持 `worlds[worldId].{worldRevisionId,state}`、多 World/可选 primary 和 Worldless `initialState`。正式动态主体不可天然等同某一书籍的名称或作者 Actor 模板。
- `atri_game_runtime.events` 当前 Event 具有 branch/sequence/type/payload 和可选 meta，`commitEvents` 将其与 World State 一起提交；`_publishLocked` 的 Action Receipt 在合格情形下记录 `committedRevisionId/branchId/eventRefs`。**Event payload 并未证明已经有通用 FactKey、游戏有效期、最终修订和来源的可查询联接**。
- 在 `authority-first` 环境，`SessionCore.applyRuntimeCommit` 明确阻止对 `atri_world_state / atri_game_runtime` 的不合法 Raw Patch，抛出 `native_authority_typed_publication_required`。**该权限边界应保留**；不能以“补一个开放世界写 API”为名绕过原生领域准备/提交。
- `atri_lifecycle.history.facts/heads` 现有特定领域 `key/value/tick/eventId/previousId` 的结构与来源，`queryHistory` 仅接受 `kind/facet/value/id/limit/cursor/memory`，并将 Cursor 锚定当前 Snapshot Revision。不能声称已提供任意 `asOfGameTick/asKnownRevision` 的通用查询；应先查询准确旧 Revision，再在合法的 Domain facts/transitions 上按 GameTick 判有效。
- `state-delta.js` 已经为 `atri_world_state` 提供 Snapshot/Delta 与深度控制。其存在不等于旧 Revision 永久保留，也不能仅靠二进制差分猜测某条事实的客观有效期或某 NPC 何时得知。
- `src/endpoints/native-session.js → SessionCore.applyRuntimeCommit`、`experience/logic/runtime.js → world/session.commitEvents → session-runtime.commitStatePatch`、`authority-transaction.js → SessionCore publication` 等实际生产符号路径已定位，但由于尚未穷尽动态插件/集成分支的完整调用图，**E0-06 仍是 PARTIAL/OPEN**。

W19 的物理候选、查询算法轮廓、真实调用边界、Gate 0 和实施后 Gate 1～4 的区别均只在 [e0-gate0-physical-contracts.md](e0-gate0-physical-contracts.md) 维护。特别注意**开发前 Gate 0 要求可实施的 ABI/Owner/Consumer/删除及测试计划，而尚未编写的新功能的 Node/CI/三端实测只能在正式实施后完成**；不能陷入“要求先实测未实现功能才可写代码”的逻辑循环。

### 26.3 W19 待议方向

- W19-A：依赖 Snapshot/聊天/HCM 与 LLM 自然语言追忆全部历史，不保留足够稳定的 Fact/Subject 转换；便宜但无法可靠给出 W13 双时间和 W14 事实适用性。
- **W19-B：Session 原生最小 Subject + 来源型 Fact Transition / Revision-Tick 双锚查询 + Gate 0 证据收口（本轮推荐，尚未获用户批准）**：有条件复用已有 Session State/Events/Receipts/History，必要时仅补稳定主体/事实转换记录，以 `asKnownRevision → asOfGameTick → AuthorizedAudience` 计算有效投影；旧 History 不承担未经声明的万能数据库职责。
- W19-C：另建完整通用 Bitemporal EventStore，与 Native Session 双写异步协调，不符合单权威/轻量 Dev 原生硬切。

W19 仍为用户待选方案；本阶段未修改 `main` 或其它代码分支，未运行测试/CI/Windows/CachyOS/Android Termux，E0-01～09 仍 PARTIAL / BLOCKED。用户若选择 W19 后，下一轮应评估 Gate 0 是否已具备可执行交接条件，以及最终物理字段/Owner/Consumer 的剩余最小阻塞，不继续平行扩建架构。


---

## 27. S21 · W19-B 确认与 W20 受保护物理契约及 Gate 0 工程分包（2026-10-17）

### 27.1 W19-B 正式确认

用户对第十九轮明确推荐的 **W19-B「Session 原生最小 Subject + 来源型 Fact Transition / Revision-Tick 双锚查询 + Gate 0 证据收口」**回复「认同」。现在 W1-B 至 W19-B 均是用户已确认的**架构方向**，并不代表具体物理字段/历史 API、E0 完整验收、Schema/工程实现和全案定稿已批准。

- 已确立持续世界后果的主体身份由现有 Native Session/Domain Authority 拥有；关键事实应有可追溯 Event/Fact transition 与正确的有效时间，已有 Domain State、Native Event/Action Receipt、History/Clock/Revision 应尽可能复用，不建平行可写 EventStore/FactStore。
- 查询先核对合法 `Session/Branch/asKnownRevision` 和 Snapshot 保留/祖先，再按具体 Domain 声明的 `asOfGameTick`/有效期投影事实，最后按真正的 Perspective/Source Grant 输出；没有 GameClock 的纯叙事不可伪造 Tick。
- 开发前 Gate 0 应冻结实际调用图/接口 Owner/旧路径切换和测试计划，实施后 Gate 1～4 才实际运行新增功能的 Node/DB/UI/三端/长会话验证，避免“尚未实现先实测”的循环。
- 物理 Namespace/ID family/查询 Schema 及开发分支**仍未获批准**，整体 Plan 继续 Draft。

### 27.2 W20 新的必要安全发现（main 固定 SHA 静态审查）

本轮仍以 `main=c57fada6edeea255b29d857ba2585c1dbc9c098b` 及 V3/Prompt/Visual 未合入 SHA 对照，额外查看：

- `src/native/session-snapshot.js` 明确枚举 `RESERVED_SESSION_NAMESPACES`，`SessionCore.applyRuntimeCommit` 以 `validateRuntimeStateChanges` 阻止直接覆写这些命名空间。**若新增 Session `atri_world_subjects` 等物理区，必须同时纳入全模式 Reserved/Typed Authority validation 和 Save/Restore/GC/Domain publication 的可信链**，否则建立新 Raw Patch 后门。若在 `atri_world_state` 根加受保护子树，也需要审查现有 Game reducer/普通 State Patch 路径的权限，而不是默认已有 `authority-first` guard 就保护一切模式。
- `SessionCore._publishLocked` 与 `SessionRepo.commitSnapshot` 把多个 Session State namespace 的 Heads 一起写进单 Revision，提供强一致基础；`save-system.js` 遍历 `revision.stateHeads` 及 Branch/Revision ancestry，`state-delta.js` 只为 World State 提供专用压缩。选择不同物理布局会影响 Save/Restore/GC 和长会话成本。
- `history-authority.js` `validateHistory` 对声明域、可见性、大小/来源做严格检查，不宜让所有 Worldless/NPC 强行写入 `atri_lifecycle.history`；`native-history-runtime.js.queryHistory` 无通用 `asOfGameTick`，已确认要在 exact Revision 读取后再进行受 Domain 约束的时间投影。
- GitHub 默认分支搜索定位了 `src/endpoints/native-session.js → SessionCore.applyRuntimeCommit`、`experience/logic/runtime.js → WorldSession.commitEvents → Runtime.commitStatePatch`、`authority-transaction.js` 的 Typed Prepare 与 SessionCore Publish、`frontend/host-services.js → readWorldView/readChronicle`、Play/Context/Knowledge 的真实**符号级**消费者；但未做动态插件/未合并分支完整 AST/运行时审计，E0-06 仍 OPEN。

### 27.3 W20 讨论的具体物理选型与推荐路线

同一 Plan 的 [e0-gate0-integration-workpackages.md](e0-gate0-integration-workpackages.md) 是 W20 **唯一详细模块**：列出 P1（`atri_world_state` 下受保护子树）/P2（单 Session Revision 下独立但原生 Reserved/Typed namespace）的候选与安全/成本差异、最小 `Subject/FactRef/EffectiveWorldQuery` 草案、真实生产入口的 WP-A～F 分包、开发前 Gate 0 与实施期测试区分。

- W20-A：立即新建单独 Namespace 并冻结全领域 Subject/Fact 结构，对 Generic Patch 保护、Source/GC/消费者风险考虑不足。
- **W20-B「受保护 Session-owned Identity + Domain-owned Fact transitions / Two-anchor Query + Consumer Work Packages」（本轮研究推荐，未获用户确认）**：World Subject 的原生写入与保护同步设计、现有 Domain Fact 仍各有业务 Owner、最小持久转换/Revision+Tick 历史读投影、逐真实生产消费者原生 hard cutover，开发前关闭适当的 Gate 0 设计证据。
- W20-C：全世界预先转大型写时 Graph/双时间服务，增加重复写入和来源冲突，不适合已确认的最小架构方向。

**当前 W20-B 仅是建议，不得视为用户决定。** E0-01～09 仍 PARTIAL / BLOCKED；所有 CI/真实 UI/Windows/CachyOS/Android Termux 证据未运行。若确认下一步应直接开展**最后的 Gate 0 执行前置审计/交接清单**，不继续无限拆概念；整个 `ARCH-DWE-01` 仍为 Draft，未授权修改产品代码。
