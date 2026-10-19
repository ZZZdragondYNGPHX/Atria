# ARCH-DWE-01 · NPC 认知、社会关系与信息传播

[唯一入口](index.md) · [实现分工](e0-preflight-execution.md) · [同一 Record](../../../records/architecture/world-evolution-consistency.md)。**Draft / Paused**，本次仅整理文档；已确认方向为 **W6-B：世界关系事实、主体认知与来源事件**。本模块保留功能与逻辑合同；旧源码片段仅为背景，具体字段按原实现接线。历轮比较与确认历史见 Record。

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
3. **尝试行动与后果**：米拉辞职、泄露消息或组织罢工是不同的后续候选行动；失败、受阻或推迟也须如实保留。

多人事件同样需避免：任一 NPC 直接替玩家决定行为；A 对 B 的谣言自动让 C 全知；A 情绪变差导致 B 的关系属性无证据同步改变。信件传送还需要「发送」与「收件人已经阅读/相信」区分，而不是直接广播事实。

## 4. 认知更新的时态与纠错

- 区分**事件实际发生时间、消息传播/接收时间、主体相信/修正时间、记录所属 SessionRevision**。
- 例：T10 皇帝死亡，T11 米拉听闻仍然在位，T13 得到可靠证据后更正。T11 她相信旧消息可以合法存在；当前世界真相仍然是已提交的死亡。
- 当后续证据反驳旧信念时，保留原先何时持有过错误信念的历史，不覆盖成“她一直知道真相”。注意不要求将每轮轻微情绪写成独立不可变事件。
- 回档/分支分离：分叉后某 NPC 获得了秘密，而另一分支没有。旧分支的个人认知缓存、目标和社交事件不能漏进当前分支。衍生投影可重建，但不能成为跨分支可变最新值。

## 5. 动态 NPC 接入原认知、记忆与任务

- [Information Runtime](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-information-runtime.js) 的 actor availability 和投影按已声明 actor ID / source / scope 选择；提供 branch/revision/scope epoch 的 anchor，投影有条目和字符预算。新 NPC 身份绑定未被证明能够自动建立此入口。
- [Cognition Authority](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/cognition-authority.js) 更新必须基于被允许的 actor/task view、确切信息来源与 anchor；部分 `relationship` 目标明确要求在 `manifest.actors` 中。不能把任意新 NPC 的名字直接塞进旧字段规避边界。
- [Theory-of-Mind Authority](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/tom-authority.js) 的部分 perspective 同样限制在 manifest actor 表，且对来源可见性有约束。
- [HCM Memory Eligibility](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/eligibility.js) 根据 requester、已授权 Information 投影、来源证据与 branch anchor 决定可取回的记忆，不能让“动态 NPC 只要有 ID 就可以读全部历史”。
- [Native Lifetime](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/lifetime-authority.js) 已有相互承认的 `bond.form/change`、职务与历史事件，但属特定 optional domain；`bond` 不是所有社交好感/敌意的通用真相源。
- [Authored Actor Profile](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-actor-profile.js) 源自 Package/EntryPoint 的静态角色，不承载 Play 后诞生角色的统一心智映射。
- [HCM Graph](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/temporal-graph.js) 有有出处的实体、关系、时间化投影/证据，但记忆图谱不是客观关系的独立提交权威。

由 WP-C 在原 Host/Information 中接入动态 Perspective，复用 exact identity、scope/access 与原 Task 预算；补齐实际缺失字段与调用方，不修改固定 Manifest，也不开放 Narrator 全部记忆。

## 6. 候选行为接口原则（非实际 API）

- 动态实体**不一定**具备 Agent 权限；先拥有稳定 World Entity ID，再在获得合规自主性/受众许可时取得可用的 Perspective ID / view（标识符按原实现决定）。
- **一名角色的目标/态度**更新不应自动提交另一名角色的状态。共同社会事实必须通过已授权交互/关系事件触发。
- 涌现 NPC 不直接编辑 Knowledge Library 或其他 NPC 的记忆；传播是具场景/通道/时间/来源的世界事件，可供对方形成自己的独立认知。
- 让模型只看严格按分支、角色、已知事实、现场与时间汇编的 Context；秘密、未知和错觉保持可表示，不因助理/叙事者已经了解真相而泄露。
- 少量关键 NPC 可以参与 W5-B A3 deliberation；大多数认知反应可规则/有界计算，LLM 不被设为默认事实裁定引擎。

## 7. 外部参照（用于模型取舍，不是直接选用这些框架）

- [Park et al., Generative Agents, UIST 2023](https://doi.org/10.1145/3586183.3606763)：观察、经历、反思与规划可以产生社会互动，但模拟的是受限实验环境，不证明可无限扩到开放世界。
- [Evans & Short, Versu—A Simulationist Storytelling System](https://ieeexplore.ieee.org/document/6648395/)：社会惯例为角色提供可选择的社交行动机会，并不替角色强制决定；规则辅助与个人自主可并行。
- [Treanor et al., Social Play in Non-Player Character Dialog (AIIDE 2015)](https://ojs.aaai.org/index.php/AIIDE/article/view/12838)：分阶段可交互的社会实践优于将一次社交交换直接简化成一条固定对话结果。
