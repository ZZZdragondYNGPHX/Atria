# ARCH-DWE-01 · W8 长期记忆、遗忘与人格连续性（讨论草案）

- Task ID：`ARCH-DWE-01`；Primary Workspace：`docs`；[唯一 Plan 入口](index.md) / [总体设计](design.md) / [W7 信息流](npc-memory-information-flow.md) / [唯一 Record](../../../records/architecture/world-evolution-consistency.md)。
- 状态：**Draft；W1-B 至 W7-B 已确认，W8 仍是候选选型，不得提前视作已批**。本文件只讨论逻辑机制、事实所有权、证据和成本；不修改 `main`、不新建实现分支或并行记忆系统。
- 本轮问题：玩家经历几千回合或跳跃数年游戏时间后，新增的 NPC 怎样既保持有依据的人格连续性，又能淡忘琐事、改变态度、重新理解过去，并且绝不“遗忘”掉世界已发生的客观事实？

## 1. 区分五种常被混称的“记忆”

| 维度 | 例子 | 设计边界与权威 |
| --- | --- | --- |
| **World Event / 客观发生历史** | 阿洛曾接受玩家 100 金币借款；交易在 T0 成功提交 | 由单 Native Session/State/Event/Save 负责；不是 NPC 的私人记忆，不随“忘记”被删除 |
| **Source / Episode / 证据与经历** | T0 阿洛在旅馆收到金币；T5 米拉告诉他另一个说法 | 原生可用 Timeline/History 或有证据的 HCM Episode；必须区分亲眼所见、他人陈述与推论 |
| **Subjective Memory / 回忆** | 阿洛能想起玩家承诺何时还钱，却记不清那天杯子的颜色 | 按来源、受众、游戏时间、用途检索与投影；内容可模糊、难以取回或被更正 |
| **Cognition / 信念、情绪、目标** | 阿洛逐渐认为玩家可靠，米拉却不信；担忧可能过期 | Native Information/Cognition 已有语义与证据条件；想法不是世界当前真相 |
| **Stable Character / 连续人格** | 阿洛谨慎、怕欠债，后来因玩家多次守信而更乐于赊账 | 作者稳定特质 + 有出处的长期经验/关系变化；人格不是一轮摘要随意重写，也不是永远无法成长 |

**核心原则：** 存储了历史 ≠ NPC 一定想得起来；NPC 现在忘记了 ≠ 世界事件没发生；检索召回了文本 ≠ NPC 获得该来源合法权限；模型总结或“反思”≠ 新的世界事实。

## 2. 当前 Atria main 的已有基础（仅静态代码检查）

- [Native Memory Contract](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-memory-contract.js)：明确 `identity`/`commitment`/`relationship`/`key_event` 受保护角色，`detail` 可采用 `light/deep` 与 `fadeAfter`；支持 `clarity`（clear/blurred/forgotten/reconstructed）和 `use`（willing/reluctant/unavailable）、`applicability` 与证据 `basis`。这是**已有能力**，不能宣称尚需创建一个遗忘引擎。
- [Native Cognition Runtime](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-cognition-runtime.js)：对符合条件的 `detail` 依据当前逻辑游戏时间呈现 blurred/reluctant；受保护类别仍保持 clear/willing。认知适用性还依赖原始证据、目标和来源指纹；不是“隔 N 回合无条件物理删除”。
- [Cognition Authority](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/cognition-authority.js)：认知更新依据明确的 SourceRefs、精确视图/修订/作用域，并在分支切换时对有效证据执行恢复/重绑定；不能让模型靠自由文本改写已提交真相。
- [HCM Source Lifecycle](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/source-provenance.js) / [Temporal Graph](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/temporal-graph.js)：以 Episode 证据关联事实/实体/关系，变更时可失效来源；HCM 更适合来源检索/解释，不能成为世界权威。
- [HCM Eligibility](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/eligibility.js)：按照当前已授权 `Information` 投影、Requester、Branch/Revision 限定可检索信息，避免未经授权读取秘密。
- [HCM Retrieval](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/query-plan.js)：基于合法的查询/场景种子检索而不直接发明新目标或新记忆；[HCM memory graph](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/docs/features/memory-graph.md) 已有图谱与可选压缩能力，但实际默认和消费者仍需 E0 逐一核验。
- [Information Runtime](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-information-runtime.js)：投影绑 Session/PackageVersion/Revision/Branch/Scope，限制受众与输出预算；部分新 NPC 视角仍需要 W7 的动态资格接线。

**事实限制：** 即使当前已具 `fadeAfter` 与角色语义，尚无证据显示任意新生 NPC 自动拥有这些数据流或其记忆能跨长时间、所有分支正确维护。W8 是明确语义和扩展边界，不重写现有 Memory 2.0/Host 系统。

## 3. 建议的“留痕 + 可回忆性”双视图（不是双数据库）

```text
Committed Native World Event / Timeline / authorized external source
                    |
                    v
          Provenance / Episode Evidence
                    |
        exact session/branch/revision
                    |
                    v
       Authorized NPC Memory Projection
        |             |              |
  current belief   retrieve score   protected identity / obligation
        |             |              |
   cognition view   bounded prompt  stable personal continuity
                    |
                    v
              NPC deliberation
                    |
               proposed action
                    |
            Native Authority commit
```

- **不可变事件证据**或合法来源中记录事实发生；允许按需要检索，不意味着要求每次写入一份 NPC 私人重复文本。
- **个人回忆的可用性**由主体合法可见范围、关联目标、来源可信度、重要程度、相隔游戏时间、情感权重和现实场景共同决定。以上是候选排序维度，不能将重要性打分误当可靠性或真实性。 
- **遗忘属于角色认知的变化**，包括提取困难、细节模糊、失去主观确信、改变解释框架；默认不擦除已提交世界事件、债务、身份、真正共享的社会关系。
- **重构或误记**可以作为带来源和状态的主体信念出现；不得将 LLM 的推测回填为原始 Episode、秘密真相或公共世界事实。
- **压缩与摘要只改变索引/检索表现**，不能让一段可变 summary 取代唯一权威事件与原始证据；应保留追溯引用及更新/失效语义。
- **保密是硬门槛**：先作受众资格与来源过滤，再排序检索/摘要。即使来源是关键人生事件，也不等于任一 NPC 均可读取。

## 4. 人格持续与成长（候选）

**人格连续性不等于永久人格锁定。** 建议区分：

1. **Authored Core**：作者确认的人物身份、长期偏好、表达习惯和硬边界；原始 Package/World 修订不因游戏进行而被覆盖。
2. **Evolving Dispositions**：由持续经历形成的信任、警惕、价值偏向、关系倾向等；这是有依据的当前人格投影，而不是随机生成“新性格”。
3. **Current Internal State**：当下的恐惧、愤怒、疲劳、疑虑，允许依事件/时间恢复或变化，不必每轮留永久条目。
4. **Beliefs & Plans**：主体对世界的理解和未完成意图，受所知证据、时态与任务截止期影响；计划不等于实际效果。

**角色发展示例**：阿洛原本不愿赊账；玩家数次守约，阿洛才变得更信任玩家。这一成长不应强迫修改“阿洛谨慎”这一稳定特质；他可以仍很谨慎，却认为“对这个人赊账风险低”。如果以后受骗，信任也可以有根据地下调。

为防机器编造人格变化，关键调整应至少能解释：由哪些已获授权的体验推动、发生在什么分支/游戏时间、改动哪个主体的哪种认知、是否影响已存在的关系/目标。辅助 AI 只提出改变候选，受控认知提交不自动更改其他人的意愿。

## 5. 受保护信息不应被普通“遗忘”抹掉

- 真实法律/游戏义务（债务、承诺、组织职责、物品所有权）属于世界或关系状态，仍在有效期内便必须可被 Native 系统执行；NPC 主观上可能忘记还款日，但债务不能因此自动消失。
- 人物身份、关系里程碑、重要历史可提高记忆连续性优先级；不过**永远记得全部细节**也可能缺乏合理性。建议区分“核心意义不可凭缓存消失”与“当事人的主观细节可以变模糊”。
- 如果世界允许真正的失忆、魔法抹除记忆、虚假记忆植入，需要正式受控认知变化事件与作者规则，而不是单纯降低检索排名；也不能逆向删去已发生历史。
- 保护世界真相不能被误用为逼迫 NPC 在每轮回忆时都说出秘密。即使一项信息属于身份或重大事件，仍须通过该 NPC 自己的合法 Perspective 与个人证据准入。

## 6. 长会话成本和压缩边界

- **Hot / Warm / Cold 作为检索及计算预算策略，而不是世界真相的分层**；不会因为一个事实“冷”就代表事实失效。
- 日常无后果细节不必全部强制结构化入库；精确事件及持续性关系及时交给 Native；大量 Episode 由 HCM 按合法来源索引、聚合和检索。
- 可选来源保真摘要：保留影响身份、承诺、关系和重大选择的源引用、时间与受众资格；忽略大量仅装饰性信息。摘要合成需要可识别其派生身份和失效基础。
- 按游戏内时间推进的遗忘/检索状态不意味着每 tick 都修改磁盘或运行 LLM。可根据当前时钟和已存的 `recordedAt` 等值派生可回忆状态，只在确有重要认知改变时经原生事务发布。
- **推理费用需要上限**：优先规则/轻量索引筛选，核心 NPC 才做有限反思或检索增强；禁止每个 NPC 每一回合全量回忆与人格重估。

## 7. W8 路线选择（待用户决定）

| 路线 | 内容 | 优点 | 缺点 |
| --- | --- | --- | --- |
| W8-A：永久完整回忆 | 所有有名字的 NPC 记录并永远可完整回忆每条有效经历 | 简单直观，一致性表面上强 | 长会话膨胀，缺少遗忘/误记等合理人性，隐私披露风险 |
| **W8-B：来源保真 + 分层回忆与人格连续性（推荐）** | 世界历史/义务永不由忘记决定；HCM 提供合法来源与历史检索；Native Cognition 管主体视图/长期倾向/认知适用性，普通细节可随时态模糊，关系与角色发展由经历驱动 | 复用既有能力，来源可审计，叙事有成长且兼顾性能 | 原生与 HCM 的 owner 边界、动态 NPC 身份与失效语义需要 E0 核实 |
| W8-C：单一角色摘要权威 | 为每个 NPC 维护一个不断覆盖的“人物概况”，其余旧来源由模型按需想象 | 存储和 Prompt 表面简洁 | 容易丢事件、角色重写、编造细节、秘密泄漏，分支回退错误 |

推荐 W8-B，但**当前用户只批准至 W7-B，不可将 W8-B 写为已选**。

## 8. 候选验收场景（不是已执行测试）

1. 玩家欠阿洛 100 金币，一年后阿洛可能不清楚借款现场颜色，但 Native 债务仍可查询；阿洛对还款的印象允许依证据变化，不能改变欠款权威金额。
2. 阿洛初时极度谨慎，经多次守约更信任玩家；原始人物描述仍保持完整，他的长期信任变化能追溯数次已提交经历，而非 LLM 一句话反转人格。
3. 米拉只听说皇帝活着并深信，后来获得证明皇帝已死的密报：旧信念可解释为什么曾经持有，但不能污染现在的世界状态。
4. 不同分支中阿洛的信任和已知秘密不同；从 T0 SavePoint 分叉后，T20 的学习不会从 HCM 缓存跨线泄漏。
5. 外来 NPC 尚未获得合法 Perspective 时，不能擅自使用其他 NPC 的个人记忆或读 Narrator 全部真相。
6. 记忆被允许淡忘的场景无需全量史料扫描/每 tick LLM，重要承诺与事件可通过 Native 查询追踪。
7. 某回合阅读“十年前的一封信”触发一次有出处的回忆或认知更新，不自动篡改十年前客观世界历史。
8. 角色死亡、离开或长期休眠后仍可按历史版本查其过去经历，当前活跃上下文与计算成本受约束。

## 9. 外部研究类比（不引入新框架）

- [Park et al., Generative Agents, UIST 2023](https://doi.org/10.1145/3586183.3606763)：经历、反思、规划与相关记忆检索可用于可信社会行为，但这是受限研究环境，不构成开放世界无界推理的可行性证明。
- [Packer et al., MemGPT, arXiv 2023](https://arxiv.org/abs/2310.08560)：分层记忆和有限上下文的虚拟管理可指导“哪些内容放入当前 Prompt”，不能作为删除不可变事件或授予隐私读取权限的理由。

## 10. 仍待决定的精确边界

- 动态 Perspective 与已有 `actor_[...]` Identity、`memoryStateSchema` 及 HCM graph source ID 的合法映射（是否需最小 authority 扩充由 E0 决定）。
- 受保护记忆与 `forgetting`、`withdrawn` 的区别；是否允许魔法失忆/受控虚假记忆，如何显式验证。
- 人格变化的跨时间证据门槛；“角色性格”与可变“对某人态度”应如何在 Studio/Play 展示与纠错。
- HCM 搜索/压缩、Native Memory/Cognition、World History 三者的确切 owner 和复用路径；不建立重复持久化 authority。
- 各游戏类型的自然语言自由度、分支、成本预算、隐私与上下文编译缺口；具体实现阶段与跨端验收仍需正式 E0。

**结论状态：** W1–W7 已确认方向，W8 未确认；整体 Plan 仍 Draft。继续逐轮先更新 docs 原 Plan/唯一 Record 后再讨论。
