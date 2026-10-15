# D3 讨论草案：Narrator 文笔 / Character Expression / Agent Behavior

> **D3 OPEN**（2026-10-15）。已冻结 D1=B、D2=J2+F2+R3，除此之外以下均为待选择的产品方案，不是新的 V3/Memory/World Authority 或实施许可。依赖已有 [V3 D7 N2](../atria-native-orchestration-v3/narrative-project-quality.md)、[V3 D4 C2](../atria-native-orchestration-v3/context-sharing.md)、[V3 原生合同](../atria-native-orchestration-v3/interface-contracts.md) 和 [前沿研究](../../architecture/model-prompt-context-frontier-research.md) §17。

## 1. 五种角色职责，而非五个必定调用的模型

| 域 | 回答什么问题 | 原数据/权限权威 | 文本编译层可做 |
| --- | --- | --- | --- |
| Actor Identity | 角色稳定的人格、价值、经历、背景 | Actor/Package/Project Authoring | 接收正式角色资料，不能改身份 |
| Actor Cognition | 当前记得、相信、想要、怀疑什么；时间/证据范围 | Information/Cognition/Memory/World/Branch | 有来源地表现心理与知识，不自动变更状态 |
| Character Expression | 怎么说话、停顿、措辞和表达已有情绪 | Actor 表达配置/原生 Prompt | 台词风格、言语行为、差异化 voice |
| Narrator/Scene Expression | 作品的叙述人称、焦距、描写密度、节奏和成熟题材氛围 | 作者合法版本/唯一 Narrator | 根据合法事实生成唯一正文 |
| Agent Behavior / Narrative Intent | 这轮 Agent 做哪项任务、要哪些证据、如何产出 | V3 Plan/Node/Run + 有来源的 Intent 提案 | Task/Evidence/Constraints、输出要求；不授予工具权限 |

保留普通 RP 的 Context → 单 Narrator 低成本路径。只有有证据的任务复杂性、信息差、用户主动精修或关键情节，才由 V3 按原预算决定是否进行额外 Planning/Review，禁止默认五模型化。

## 2. 建议语义合成链（物理 Schema 尚未冻结）

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
| **E2 分层表达（推荐）** | 作者通用风格 → 场景/体裁叠加 → 当前 Narrator/Actor 的有效表达；确定性优先级、scope 和来源记录；完整原始文本仍可编辑 | 与 J2/F2、V3 N2 兼容，未必需要新 Store |
| **E3 每角色独立生成** | 每个角色独立 Agent/model 生成 voice，再由 Narrator 统一 | 成本、信息串知风险增加，不建议默认 |

## 4. 决策 A：玩家代理叙述的边界

| 选项 | 语义 |
| --- | --- |
| **A1 严格玩家控制** | 默认只描述玩家明确输入/正式 Command 的行为和后果，不主动写玩家选择或承诺 |
| **A2 明示可委托（推荐）** | 默认 A1；玩家可正式授权少量非关键过渡动作或叙事性省略，授权范围/撤销/重要选择由原 Native Source/Grant/V3 负责；若真实 Host 不支持这种 Grant，则暂停该功能而不是用 Prompt 模拟许可 |
| **A3 Prompt 自行代选** | 由强作者 Prompt 让旁白替玩家做重要决定，不符合 V3 原权威，不推荐 |

## 5. 决策 K：反全知与视角

| 选项 | 语义 |
| --- | --- |
| **K1 只靠写作指令** | 简单但无法保证角色不串知 |
| **K2 来源筛选+表达审读（推荐）** | 原 C2/HCM 在检索/编译前过滤 Actor/Source/Time/Branch/Display；唯一 Narrator 依法定视角写作；对成文间接泄漏、无依据肯定、知识串知做有证据的概率性质量审查 |
| **K3 强制所有作品单人称限知** | 或能减轻部分泄漏，但牺牲合法多视角、悬疑和宽视角叙事创作 |

## 6. 决策 G：Agent 质量回路成本

| 选项 | 语义 |
| --- | --- |
| **G1 稀疏按需（推荐）** | 默认一个 Narrator；源矛盾、高影响抉择、作者要求精修或明确质量缺陷才触发 V3 Review/局部修复，沿原预算计费 |
| **G2 固定 Writer+Critic** | 每回合双模型，可能有帮助但固定增加费用与延迟，并可能引入过度保守 Judge |
| **G3 每角色固定 Agent** | 声线可能更强，但 token、并行 Context 和权限成本难以作为默认 |

## 7. 讨论实例与未来验证建议（均 NOT_RUN）

1. **人物不同声线**：同一场景中寡言 NPC 与热烈 NPC 保留语言差异；总体叙事风格变化不覆盖角色稳定人格。
2. **秘密信息差**：NPC A 知道密信，NPC B 无证据知道；B 可以可观察地怀疑，但不能突然复述秘密；受限的 Narrator/玩家输出尊重 DisplayGrant。
3. **用户自主权**：玩家输入“我看着她”；NPC 可以发起行为、旁白渲染气氛，但不能直接判定玩家接受拥抱、承诺关系或采取未获准行动。
4. **合法成熟题材**：允许深入的成人情绪关系描写与作者风格，不额外强制说教；同时不把主题激烈推断成角色同意或既定事件。
5. **Agent 效率**：正常单模型路径，与疑难回合受控多 Agent 实际 Token/延迟/创作收益比较；所有指标需原 Experience/Eval 证据。

**本轮推荐 E2 + A2 + K2 + G1；尚未冻结。** 用户明确选择后，先在 docs 更新同一 Plan Bundle 与唯一 Record、提交远端，再进入 D4 Agent Node 的 Behavior Program/Prompt binding 讨论。不修改 main，不建立产品实现分支，无 ST/旧接口兼容。
