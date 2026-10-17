# ARCH-DWE-01 · W6 NPC 认知、社会关系与信息传播（讨论草案）

- Task ID: `ARCH-DWE-01`; Primary Workspace: `docs`; 唯一入口：[index.md](index.md)；前阶段：[W5 NPC 自主性](npc-autonomy.md)；总设计：[design.md](design.md)；永久记录：[Record](../../../records/architecture/world-evolution-consistency.md)。
- 状态：**Draft / W6-B 总体方向已获用户确认，W7 待讨论**。已确认 W1-B World Model + Source Library、W2-B 分层混合创作、W3-B 分级约束 + 涌现世界、W4-B 渐进接纳 + 关键交互即时提交、W5-B 分层事件驱动自主性、W6-B 世界关系事实 + 主体认知 + 来源事件。本文原 §7 为当轮候选对照，正式选择见 §10；具体 Schema/权限仍未定稿。
- 本轮主题：让已持久存在并可自主行动的 NPC 拥有可信、可演化的个人认知与社会联系，同时不能把「角色以为」「角色想要」直接当作世界客观事实。

## 1. 五类不能混为一谈的信息

| 概念 | 案例：店主阿洛与信使米拉 | 世界权限 / 所有者 |
| --- | --- | --- |
| **客观世界状态** | 两人所在位置；阿洛已经正式发出一封信 | 现有 Native Session/Branch/Revision 及正式事件；权威效果可被依规则观察 |
| **已正式确立的社会关系** | 两人确已签署佣金协议；阿洛欠米拉薪水 | 有明确参与方与成立条件的关系/契约，由原生事件确立；可有秘密的真实关系 |
| **主体单向评价** | 阿洛信任米拉；米拉讨厌阿洛 | 分别属于各自主体的认知/情绪评估，不要求对称，也不自动变成双方已结盟 |
| **知识、记忆、信念** | 米拉听说阿洛破产，但消息可能是假；阿洛知道谁盗走钱箱 | 根据可获得的证据和传播事件进入主体认知；需保留来源、时刻和可信性 |
| **目标、计划、猜测** | 米拉想辞职；阿洛猜米拉会告密 | 个人意图或 Theory-of-Mind 假设；不自动代表辞职/告密已经发生 |

**关系是有方向的**：`阿洛→米拉: 信任` 不代表 `米拉→阿洛: 信任`。对于婚姻、契约、正式结盟和承诺等客观社会事实，应依据游戏授权/参与条件进行有效提交，不能因一方渴望就宣告双方达成。

**情绪与特质不同**：当天愤怒可以过期或被调节；性格稳定性是慢变化的创作/演化偏好。无需给全部 NPC 永久写每一回合的情绪数值，也不应让模型每轮凭空改变核心人格。

## 2. 候选主体心智视图（逻辑层，不代表新增数据库）

```text
Native Entity identity (born/introduced/committed, exact branch)
    |
    +-- Shared World Truth (only Native committed effects)
    |     e.g. obligation, workplace, mutual contract, event receipts
    |
    +-- Private Cognition View for NPC A
    |     observed sources -> beliefs/rumors -> emotion/appraisal -> desires/intentions
    |     shared relation object?  only through evidence/observation
    |
    +-- Private Cognition View for NPC B
    |     different observations, values and unilateral attitude
    |
    +-- Social Event / Communication
          participant/capability/visibility/tick/preconditions
          -> Native commit -> separate admissible observations
```

原则：

- **世界**对已经确立的物理/社会事实有唯一权威，HCM/Information/Cognition 记录特定主体如何认知这些事实；不添加第二个可写的 Truth Graph。
- **作者秘密 Canon**不等于对所有角色开放的信息。Narrator 为了结算可使用受信任内部证据，但投给 NPC 的有效视图不能因 Narrator 知道而自动包含真相。
- **主体认知的保存应被授权且可审计**：来源证据、分支修订、信息到达时间、参与者和受众决定可用内容，不靠提示词中的一句「请不要剧透」保证隔离。
- **角色自由反应**来自其当时被允许获取的观察和记忆；“不知道”是正常状态，不应为了补全模型输入捏造虚假公共知识。
- **模型判断是候选**：情绪或印象也不必全部由 LLM 决定；重大认知和实际行为须按既有 Host/Information 合约建立证据和可用范围。

## 3. 多人互动：从感受至世界后果

建议对社会交互应用事件驱动的三段式思路：

1. **感知 / 事件来源**：米拉听见阿洛与玩家争吵，但隔壁 NPC 未听见；可从真正可见的 Timeline、现场范围、消息/见闻传播得到来源。
2. **各自认知响应**：米拉判断阿洛不可信，阿洛却认为米拉支持自己。两者可同时成立为个人感受；无需强制两个关系方向都被同步修改。
3. **尝试行动与后果**：米拉辞职、泄露消息或组织罢工是不同的后续候选行动；经 Native 条件检查、确切提交后，客观职业/组织/契约关系才发生变化。失败、受阻或推迟也须如实保留。

多人事件同样需避免：任一 NPC 直接替玩家决定行为；A 对 B 的谣言自动让 C 全知；A 情绪变差导致 B 的关系属性无证据同步改变。信件传送还需要「发送」与「收件人已经阅读/相信」区分，而不是直接广播事实。

## 4. 认知更新的时态与纠错

- 区分**事件实际发生时间、消息传播/接收时间、主体相信/修正时间、记录所属 SessionRevision**。
- 例：T10 皇帝死亡，T11 米拉听闻仍然在位，T13 得到可靠证据后更正。T11 她相信旧消息可以合法存在；当前世界真相仍然是已提交的死亡。
- 当后续证据反驳旧信念时，保留原先何时持有过错误信念的历史，不覆盖成“她一直知道真相”。注意不要求将每轮轻微情绪写成独立不可变事件。
- 回档/分支分离：分叉后某 NPC 获得了秘密，而另一分支没有。旧分支的个人认知缓存、目标和社交事件不能漏进当前分支。衍生投影可重建，但不能成为跨分支可变最新值。

## 5. 关键 E0：动态 NPC 如何取得合法 Cognition / Memory / Task 的身份？

2026-10-17 对 main 的**静态代码核对**（不是运行或测试）：

- [Information Contract](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-information-contract.js) 已支持 `truth/belief/desire/intention/emotion/relationship/theory_of_mind` 等 source semantic，支持 actor/task/narrator/player/inspector 受众与投影范围，但定义 `actors` 和 `views` 由已声明的 contract 校验，不说明新入世界的 NPC 自动获得 perspective。
- [Information Runtime](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-information-runtime.js) 的 actor availability 和投影按已声明 actor ID / source / scope 选择；提供 branch/revision/scope epoch 的 anchor，投影有条目和字符预算。新 NPC 身份绑定未被证明能够自动建立此入口。
- [Cognition Authority](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/cognition-authority.js) 更新必须基于被允许的 actor/task view、确切信息来源与 anchor；部分 `relationship` 目标明确要求在 `manifest.actors` 中。不能把任意新 NPC 的名字直接塞进旧字段规避边界。
- [Theory-of-Mind Authority](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/tom-authority.js) 的部分 perspective 同样限制在 manifest actor 表，且对来源可见性有约束。
- [HCM Memory Eligibility](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/eligibility.js) 根据 requester、已授权 Information 投影、来源证据与 branch anchor 决定可取回的记忆，不能让“动态 NPC 只要有 ID 就可以读全部历史”。
- [Native Lifetime](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/lifetime-authority.js) 已有相互承认的 `bond.form/change`、职务与历史事件，但属特定 optional domain；`bond` 不是所有社交好感/敌意的通用真相源。
- [Authored Actor Profile](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-actor-profile.js) 源自 Package/EntryPoint 的静态角色，不承载 Play 后诞生角色的统一心智映射。
- [HCM Graph](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/temporal-graph.js) 有有出处的实体、关系、时间化投影/证据，但记忆图谱不是客观关系的独立提交权威。

**必须在 E0 实证审计中解决**：是否可以复用现有 exact identity + scope/access 生成合法动态 `Perspective/Actor` 投影？若确实缺少，最小扩展在哪里，才能保留作者静态 Actor 语义、Source visibility、Session Branch 原子性与 Task 运行预算？不得用“将 NPC 写入 manifest”或“开放 narrator 所有记忆”取巧。

## 6. 候选行为接口原则（非实际 API）

- 动态实体**不一定**具备 Agent 权限；先拥有稳定 World Entity ID，再在获得合规自主性/受众许可时取得可用的 Perspective ID / view（是否单独 ID 待讨论）。
- **一名角色的目标/态度**更新不应自动提交另一名角色的状态。共同社会事实必须通过已授权交互/关系事件触发。
- 涌现 NPC 不直接编辑 Knowledge Library 或其他 NPC 的记忆；传播是具场景/通道/时间/来源的世界事件，可供对方形成自己的独立认知。
- 让模型只看严格按分支、角色、已知事实、现场与时间汇编的 Context；秘密、未知和错觉保持可表示，不因助理/叙事者已经了解真相而泄露。
- 少量关键 NPC 可以参与 W5-B A3 deliberation；大多数认知反应可规则/有界计算，LLM 不被设为默认事实裁定引擎。

## 7. W6 备选方向（本轮选型，全部待批）

| 方案 | 设计 | 优点 | 风险 |
| --- | --- | --- | --- |
| **W6-A：统一关系数值** | 所有社交状态由好感、信任等双人/单人标量驱动，事件更新分数 | 规则与 UI 简单、计算廉价 | 偷偷把单方面信念当共同事实；角色人格容易变成数值机器 |
| **W6-B：世界关系事实 + 主体认知 + 来源事件（推荐）** | 已确立关系归 Native World；单方态度、私人目标、认知与误解归已授权 HCM/Information；事件/传播连接两者 | 维持真实社会因果、信息不对称，避免双真相与玩家强制受控 | 新 NPC perspective 身份接线、事件传播与必要的状态/认知协调有复杂度 |
| **W6-C：全部社交内容交由 LLM/记忆重建** | 保留自由文本和长期对话，每次互动重新估计关系与想法 | 创作限制较少 | 历史漂移、隐私与可见性泄漏、社交事件反复变更、成本高 |

**推荐 W6-B，仅为下一轮讨论建议，不是 W6 已获批准。** 不是要求每个细微情绪都结构化入库；动态化的对象是会影响行为的一致性、相互承认的社会后果及相关证据。

## 8. 验收故事与待决问题

**小故事：** 玩家将秘密告诉阿洛；阿洛私下怀疑米拉会泄密，但米拉实际上从未见过玩家。后来米拉收到第三人的谣言，误信玩家偷钱；阿洛与米拉签署雇佣合同，阿洛却仍不信任她。合同属于客观可证实的社会关系；私人不信任和谣言属于各自主体认知；最终“米拉告诉警卫”要按通道和已提交事件才能使警卫得到消息。玩家读档到传播前，所有分支外情报不可越界。

验收矩阵须包含：单向好感/双向正式契约；谣言/谎言/秘密信息传播；同一事件引起不同角色相反反应；主体对第三方的猜测与后续证据修正；动态 NPC 本人的授权视角；多人抢同一资源的提交冲突；长时间游戏进度与有限模型预算；分支回退认知不泄漏；不代表玩家擅自签合同或行动。

**后续仍须讨论**：动态 NPC 认知视图究竟何时晋升、哪些关系需要双方同意、秘密信息的具体权限模型、HCM 与现有 Cognition 的存储边界、不同社会关系的持久化粒度、UI 是否展示情绪/关系刻度，以及 W6 的最终选型。**Draft 未定稿；未执行任何产品代码更改/测试。**

## 9. 外部参照（用于模型取舍，不是直接选用这些框架）

- [Park et al., Generative Agents, UIST 2023](https://doi.org/10.1145/3586183.3606763)：观察、经历、反思与规划可以产生社会互动，但模拟的是受限实验环境，不证明可无限扩到开放世界。
- [Evans & Short, Versu—A Simulationist Storytelling System](https://ieeexplore.ieee.org/document/6648395/)：社会惯例为角色提供可选择的社交行动机会，并不替角色强制决定；规则辅助与个人自主可并行。
- [Treanor et al., Social Play in Non-Player Character Dialog (AIIDE 2015)](https://ojs.aaai.org/index.php/AIIDE/article/view/12838)：分阶段可交互的社会实践优于将一次社交交换直接简化成一条固定对话结果。

## 10. W6-B 确认（2026-10-17）

用户对上一轮明确推荐的 **W6-B · 世界关系事实 + 主体认知 + 来源事件** 回复「认同」，因此纳入同一 Plan 的**已确认顶层设计方向**。

- 已成立、具持续效力的共同社会事实（合同、亲属、正式联盟、债务、职务等）由现有 Native Host/Session 的受控效果与事件成为客观状态；不能由其中一方的个人信念/好感直接确立。
- 主体单方面的信任、敌意、情绪、怀疑、个人目标与他人心智猜测归有来源、有受众授权的 Cognition/HCM 语义；关系方向允许不对称，主观理解允许错误和后续纠正。
- 信息传播必须由合法感知、通信和可追溯来源驱动，实际发送、送达、获知、相信各不相同；无授权消费者不可通过完整 Narrator 真相间接读到秘密。
- 动态 NPC 能否取得合法 Perspective/Task/Memory 资格是实现前必须核查的 E0 阻塞，不因“角色获得 World Entity ID”就自动通过；原生 World State/Session 仍是唯一客观真相权威。
- 选择 W6-B 不意味着用户已确定传播协议、记忆存储结构、证据判定粒度、具体信息权限 API 或实施阶段；整体 Plan 继续 Draft，不修改产品代码。

**W7 下一轮**：参见同一 Plan 的 [npc-memory-information-flow.md](npc-memory-information-flow.md)。重点讨论动态 NPC 受众资格、个人记忆与认知生命周期、秘密/错误情报的传播和长期分支隔离，推荐 W7-B「动态受众资格 + 证据驱动信息流」，但当前**尚未获用户批准**。
