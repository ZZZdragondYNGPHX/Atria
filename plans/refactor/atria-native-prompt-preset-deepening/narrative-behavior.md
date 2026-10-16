# D3 已冻结：Narrator 文笔 / Character Expression / Agent Behavior

> **D3 已冻结：E2 + A2 + K2 + G1（2026-10-15）**。本模块是这四个决定的唯一详细语义定义；候选项保留用于说明为何未选，但不重新开放。冻结的是设计，**不是完成了产品实现/验证**。仍不能建立新的 V3/Memory/World Authority；依赖已有 [V3 D7 N2](../atria-native-orchestration-v3/narrative-project-quality.md)、[V3 D4 C2](../atria-native-orchestration-v3/context-sharing.md)、[V3 原生合同](../atria-native-orchestration-v3/interface-contracts.md) 和 [前沿研究](../../architecture/model-prompt-context-frontier-research.md) §17。

## 1. 五种角色职责，而非五个必定调用的模型

| 域 | 回答什么问题 | 原数据/权限权威 | 文本编译层可做 |
| --- | --- | --- | --- |
| Actor Identity | 角色稳定的人格、价值、经历、背景 | Actor/Package/Project Authoring | 接收正式角色资料，不能改身份 |
| Actor Cognition | 当前记得、相信、想要、怀疑什么；时间/证据范围 | Information/Cognition/Memory/World/Branch | 有来源地表现心理与知识，不自动变更状态 |
| Character Expression | 怎么说话、停顿、措辞和表达已有情绪 | Actor 表达配置/原生 Prompt | 台词风格、言语行为、差异化 voice |
| Narrator/Scene Expression | 作品的叙述人称、焦距、描写密度、节奏和成熟题材氛围 | 作者合法版本/唯一 Narrator | 根据合法事实生成唯一正文 |
| Agent Behavior / Narrative Intent | 这轮 Agent 做哪项任务、要哪些证据、如何产出 | V3 Plan/Node/Run + 有来源的 Intent 提案 | Task/Evidence/Constraints、输出要求；不授予工具权限 |

保留普通 RP 的 Context → 单 Narrator 低成本路径。只有有证据的任务复杂性、信息差、用户主动精修或关键情节，才由 V3 按原预算决定是否进行额外 Planning/Review，禁止默认五模型化。

## 2. 冻结的逻辑合成链（物理 Schema 尚未冻结）

```text
Authorized Author Instructions / Scene & Genre preferences
  + Narrator writing style  + scoped Actor Expression
  + V3 Node Task/Intent  + authorized World/Memory/Cognition
  + current Player Input/Domain receipts
     → existing ContextPlan + Native PromptCompiler + Provider lowering
     → V3 single Narrator result
     → domain disclosure / optional selected Quality review
```

- **文风≠人格**：作者把旁白写得热烈、直白、阴郁，不意味着每个 NPC 的性格、爱意、意图与知识随之改变。
- **知道≠可披露**：原 V3 C2 的 Audience 与 Display Grant 为先；NPC 的 ToM 是角色的推测，不是被推测者的真实内心。文学上可使用受权全知视角，但不能自动把私人信息送给未经授权的角色或玩家。
- **故事推进≠替玩家选择**：NPC/世界可依原规则主动行动；玩家内心、决定、同意、重大承诺及正式 World 写入必须服从原可信输入和实际授权；Narrative Intent 是提案而非已发生 Event。
- **成熟题材≠默认说教**：合法成年人虚构 RP 可强烈、复杂、富于文学表现；不能因主题成熟自动压平文笔，也不能以成熟主题覆写真实角色知识、人物动机或玩家自主权。
- **写作结果≠正式事实**：自由文本含糊暗示与数据面隔离需要分别评价；Prompt/Judge 不能声称对自然语言泄漏给出绝对保证。

## 3. 决策 E：表达资源的层次

| 选项 | 行为 | 判断 |
| --- | --- | --- |
| **E1 双层** | Narrator Style + Character Voice 两类模块，Scene/Genre 主要依附自由文本 | 简明，但冲突分析有限 |
| **E2 分层表达（已选）** | 作者通用风格 → 场景/体裁叠加 → 当前 Narrator/Actor 的有效表达；确定性优先级、scope 和来源记录；完整原始文本仍可编辑 | 与 J2/F2、V3 N2 兼容，未必需要新 Store |
| **E3 每角色独立生成** | 每个角色独立 Agent/model 生成 voice，再由 Narrator 统一 | 成本、信息串知风险增加，不建议默认 |

## 4. 决策 A：玩家代理叙述的边界

| 选项 | 语义 |
| --- | --- |
| **A1 严格玩家控制** | 默认只描述玩家明确输入/正式 Command 的行为和后果，不主动写玩家选择或承诺 |
| **A2 明示可委托（已选）** | 默认 A1；玩家可正式授权少量非关键过渡动作或叙事性省略，授权范围/撤销/重要选择由原 Native Source/Grant/V3 负责；若真实 Host 不支持这种 Grant，则暂停该功能而不是用 Prompt 模拟许可 |
| **A3 Prompt 自行代选** | 由强作者 Prompt 让旁白替玩家做重要决定，不符合 V3 原权威，不推荐 |

## 5. 决策 K：反全知与视角

| 选项 | 语义 |
| --- | --- |
| **K1 只靠写作指令** | 简单但无法保证角色不串知 |
| **K2 来源筛选+表达审读（已选）** | 原 C2/HCM 在检索/编译前过滤 Actor/Source/Time/Branch/Display；唯一 Narrator 依法定视角写作；对成文间接泄漏、无依据肯定、知识串知做有证据的概率性质量审查 |
| **K3 强制所有作品单人称限知** | 或能减轻部分泄漏，但牺牲合法多视角、悬疑和宽视角叙事创作 |

## 6. 决策 G：Agent 质量回路成本

| 选项 | 语义 |
| --- | --- |
| **G1 稀疏按需（已选）** | 默认一个 Narrator；源矛盾、高影响抉择、作者要求精修或明确质量缺陷才触发 V3 Review/局部修复，沿原预算计费 |
| **G2 固定 Writer+Critic** | 每回合双模型，可能有帮助但固定增加费用与延迟，并可能引入过度保守 Judge |
| **G3 每角色固定 Agent** | 声线可能更强，但 token、并行 Context 和权限成本难以作为默认 |

## 7. 已冻结语义的边界细化（不新增 Native Authority）

### E2 — 三层表达组合与真实角色分工

- 作者作品全局表达默认值由正式版本化创作资源提供；场景/Genre 叠加是当前受权作品/Session 所指的表达上下文，不是擅自更新 World 或改写角色设定的运行状态。
- Narrator（正文人称/焦距/文字密度/文学节奏）与 Actor Expression（个体台词/停顿/语域/动作风格）必须独立消费同一场景；不能让“更热烈的旁白”自动修改每个 NPC 的人格、关系与信念。
- 优先用已有 Native Program/Module/derive 与精准 SourceRefs 表达 E2；冲突检测至少区分 **表达配置冲突** 与 **违反角色知识、世界事实、玩家权限**，后者不允许靠“更高 Prompt Priority”覆盖。

### A2 — 可委托的仅是经证明的有限叙事范围

- 严格默认：未得到可信玩家输入/原领域授权，不得代替玩家接受、拒绝、进行重大行动、许诺、确认同意或重写核心心理。可自由写 NPC 可授权的行为、可观察世界后果与氛围，不必因此强行静止剧情。
- 有限委托：允许玩家通过受信 UI/业务动作授予非关键的镜头过渡、已获准日常连接动作的叙述范围，并可撤销；**授权的拥有者、范围、有效性以及实际可否转成正式状态归原 Player/Source/Session Authority**，本 Plan 不得自造 Prompt grant。
- 真正是否已有这类 Host grant 接口必须在 E0 中核实；不存在时将授权委托功能标为未实现/blocked，保留严格默认而不是暗中让模型自评“玩家已授权”。已提交正式事件永远由原 Domain receipts 定义。

### K2 — 文学视角与事实/Disclosure 双重边界

- Context 中原 C2/HCM 按 Audience/Actor/Source/Time/Branch/Display 授权筛选为前置门槛；第三人称宽视角、非线性叙事、艺术性间接描写只在**有权可读且允许披露**的材料范围内表达。
- NPC 不因 Narrator 知道而获得知识；角色猜测和 ToM 必须保持“该角色的推测”而不是被推测角色的事实。即使 Artist Intent 强调亲密/悬疑/心理描写，也不能将没有来源的角色同意、知晓秘密或完成事件写成事实。
- Writer/Reviewer 对自由文本的含蓄泄漏、玩家代写、违反知识边界作**概率性质量审查**，只有源隔离/Domain 写入检查的确定性结论可以被称为硬保证；不能承诺任何模型审稿能百分之百检测隐含泄漏。

### G1 — 默认低成本，条件审稿与可恢复局部重做

- 默认 Context → 单一 Narrator → 合法最终 Output；不按角色个数扩张模型次数。Planner/Reviewer/Judge 的调用需有用户要求、高影响/缺口证据或原 V3 调度许可，并受原 RunControl/Compute 真实预算、Scope 和 Result/Receipt 约束。
- 文笔、语气、叙事节奏、人物声音、合法成熟题材误拒等**创作质量维度**分别评价；Source/World/Display/玩家自主权等**硬约束**不可被文学评分平均抵消。
- Reviewer 只能提出局部改写候选，不能隐性降低作者文学强度、擅自改变正式 World/Player 决策、重复副作用或借改写越过 Provider 的真实限制。

## 8. 讨论实例

1. **人物不同声线**：同一场景中寡言 NPC 与热烈 NPC 保留语言差异；总体叙事风格变化不覆盖角色稳定人格。
2. **秘密信息差**：NPC A 知道密信，NPC B 无证据知道；B 可以可观察地怀疑，但不能突然复述秘密；受限的 Narrator/玩家输出尊重 DisplayGrant。
3. **用户自主权**：玩家输入“我看着她”；NPC 可以发起行为、旁白渲染气氛，但不能直接判定玩家接受拥抱、承诺关系或采取未获准行动。
4. **合法成熟题材**：允许深入的成人情绪关系描写与作者风格，不额外强制说教；同时不把主题激烈推断成角色同意或既定事件。
