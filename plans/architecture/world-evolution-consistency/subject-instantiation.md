# ARCH-DWE-01 · 主体实例化与按需能力绑定

[唯一入口](index.md) · [实现分工](e0-preflight-execution.md) · [同一 Record](../../../records/architecture/world-evolution-consistency.md)。**Draft / Paused**，本次仅整理文档；已确认方向为 **W10-B：固定定义、Session 实例与按需能力分离**。本模块保留功能与逻辑合同；旧源码片段仅为背景，具体字段按原实现接线，不新增审查／测试阶段。历轮比较与确认历史见 Record。

## 1. 四种“实体出现”事件不可混同

| 发生 | 事实含义 | 建议权限/来源 |
| --- | --- | --- |
| Authoring：写入“莱恩是皇帝” | World/Package 固定修订中声明了人物定义与起点属性 | 创作者权威，但尚非某个正在游玩的 Session 实例 |
| Instantiate：新 Session 从已选 WorldRevision 派生“莱恩” | 此游戏分支起点明确存在一个正式 World Subject，绑定起点状态及源修订 | Session 创建/初始化的现有单 Native Host 提交权威 |
| Introduce/Discover：玩家首次认识莱恩/阿洛 | 角色视角第一次知道该对象，或观察/宣称某个候选对象 | Perspective 的合法来源；**首次登场不是出生** |
| Admit/Emerge：玩家承诺向新出现的阿洛还钱 | 持续后果要求世界正式确立一个此前未预设的 Subject 和债务 | W4-B 已选：原生 event/effect、身份绑定和持续影响在单受控事务形成 |

对已有 Subject 关联一份角色卡、生成语音形象、授予某种认知视角、升级 A1→A3，自身都不意味着世界新增了第二个人。区分 `define`、`instantiate`、`admit`、`observe`、`bind`、`speak`。

## 2. 推荐的逻辑关系（W10-B 候选，非 API）

```text
Library / Studio (immutable authored revisions)
   WorldEntityDefinition ---- AuthoredActorProfile? ---- Knowledge sources
                  \            /
                   explicit author binding (if needed)
                              |
             PackageVersion / EntryPoint pinned selection
                              |
       Native Session create / World admission transaction
                              |
          Canonical SubjectRef (stable in Session ancestry)
                  + initial / current Native world facts
                  + origin: WorldRevision.EntityRef OR admitted event
                              |
            allowed typed bindings and capabilities
              +----------------+----------------+
              |                |                |
       Actor expression   Cognition/Memory    Lifecycle/Actions
        source/ref           Perspective        domain record
              |                |                |
       Timeline speaker   actor view/task     rules/simulation
              +----------------+----------------+
                              |
        exact branch/revision + source/permission projection
                              |
         target-safe context, committed events & UI
```

**主体世界身份、角色表达模板、认知许可、自主性等级必须分开**。这是逻辑建模，不要求新建并列实体数据库或把同一个 ID 强迫塞进各类现存字段。

## 3. Authored Entity、Actor Profile 和 Session Instance 的关系

### 3.1 单复用源，不是全局共享动态实例

- 一个 `WorldEntityDefinition` 可在多个 Session 创建不同的 `Subject` 实例。不同游戏会话彼此独立，**不跨 Session 共享动态世界状态**。
- 一个 `AuthoredActorProfile` 是表达/创作资产，不必与 Subject 一对一。它可以被不同 Session 重用，甚至用于同一世界里的两个双胞胎模板（若作者明确如此配置），而这两个角色仍是两个 Subject。
- 一名 Subject 可在剧情中改名、伪装、采用不同对外表达或语音形象；这些是经授权的呈现关系/认知可见性变化，不是换一个真实世界身份。角色卡源文不能被玩法反向覆盖。
- 某个作者已预设的人物即使不参与当前对话/没有独立 Perspective，也可作为已存在的 Subject 被国家统治者、地图、事件或任务引用。
- 可以使用“无世界书/世界选择”的纯叙事起点与多 World Package；此时哪个作用域拥有 Subject Identity 需结合实际主机的 `worldSelection/initialState` E0 审核，不能擅自禁止这一现有入口或凭空增加跨世界全局实例。

### 3.2 初始化与显式绑定

候选流程：`World Revision / Actor Definition` 经 Studio 明确引用和作品发布时固定版本 → 新 Session 创建时选取需要立即成为世界事实的实体 → 由 Native Session 初始化起点状态并产生或稳定分配 Subject ID → 只读投影引用 Authored Origin → 可选授予 actor expression / perspective / domain capability。

**不要求把每条背景文案的名字都实例化**：一份历史文献里的“民间传闻有个黑骑士”，应先是 Source Claim；一条已确定的历史事实如“老皇帝早已逝世”可保留历史主体引用，但不是必需的活跃 NPC；预设的地理/组织/物品也应遵从各自可追踪用途和成本。

具体生成 UUID、稳定索引、origin binding 的协议待 E0 决定，不预设当前 `entity_*` ID 已存在。

## 4. 运行时新 NPC 的能力接纳：严格分离三类动作

**W4-B 先解决“存在”；W7-B 解决“合法受众”；W5-B 决定“是否需要深入推理”**。

1. **World Admission**：仅在可持续交互/后果成立时，确立 Subject 与必要世界事实、来源、版本，受 Native Host 唯一事务约束。
2. **Presentation / Participation Binding**：当此 Subject 需要发言/呈现头像/语音时，确定其合法的表达来源。可以选择已创作 Actor 模板、受控制的运行时风格描述或默认呈现规则，**不修改原始 Package Manifest**。说话者应映射到实际 Subject，不因模板 ActorId 相同而串人。
3. **Perspective / Task Admission**：根据存在事实、角色/作用域权限和证据授予该 Subject 当前合法的 Memory/Cognition/Task 视图与有限行动能力；没有准入就只能按既有公开世界逻辑存在，不能借用 Narrator 全知身份。

[Information Contract](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-information-contract.js) 的 actor/view 定义有静态列表限制。W10 不得宣称动态 NPC 已经能够使用全部这些消费者。最终实施可在消费者审计后考虑**把发言者身份和表达模板引用分开**，但不是先决定具体 `ParticipantRef` Schema。

### 需要接线的使用者

| 消费者 | 当前静态证据/待确认问题 |
| --- | --- |
| SessionCore / Timeline | `actorId` 限定 `manifest.actors`；如何既保持已预设 Actor 的输入权限，又安全支持新 Subject 为剧情参与者？ |
| Native Context Compiler / Generation Host / Orchestrator | 能否在编译时区分“实际发言/行动 Subject”和“可选表达 Profile”，且不由模型提供未授权 Subject？ |
| Information / Cognition / Theory-of-Mind | `actor_*` 身份、声明式 view/scope 与 SourceRef 权限下，动态 Subject 的合法 Perspective 由谁签发？ |
| Native Lifetimes / Task / Simulation | 域内 `life.person.*`、静态任务/作用域能否最小映射到动态主体，是否需要有界批处理而非每 NPC 一个 Job？ |
| HCM memory graph / eligibility | HCM 独立 Entity 是来源证据/候选身份。什么时候能依据确认的 Native Subject 建立绑定，何时保持 Unresolved？ |
| Visual continuity / Speech / Persona / UI | 若动态 Subject 可说话，图像、语音、人物名、角色切换、上下文归属等消费者能否正确识别主体，且分支/版本不串线？ |

相应使用者随身份功能一起接线；保留原业务语义，不增加旧 ST 双轨或长期兼容 wrapper。

## 5. 身份绑定何时成立、可撤销或保密？

- **Binding 的真假**：`AuthoredActorProfileRef → SubjectRef` 是确定性的创作者绑定还是临时拟用模板？`HcmEntityRef → SubjectRef` 是有证据的确定关联还是候选？需要显式类型及 `confirmed/candidate/disputed/revoked` 等审查语义，不把它们写成统一“等于”。
- **来源与 Scope**：有固定作者修订的绑定应引用 `PackageVersion/WorldRevision/ActorRef`；运行时建立的身份映射必须有 Native Receipt/Revision 和相应 Session/Branch/受众。不能以名称近似直接跨 World/Session 合并。
- **秘密与伪装**：Host 可以在内部持有“苍鹰 == 阿洛”的已确认真身绑定；阿洛的敌人若只见到苍鹰，个人 Perspective 不得自动读取阿洛的身份及其私有记忆。身份消歧与事实曝光必须是分开的操作。
- **死亡/离开/改名**：同一 Subject 不需要重新分配身份；角色死亡后保留可回溯历史，仅行为和可访问资源按当前能力规则改变。NPC 归档不会抹掉它参与过的世界事件。
- **关系写入一致性**：如果主体登记与债务/职位/通话行动是同一次产生持续后果的情节，身份的存在、绑定和世界效果应尽可能通过 Native 原子事务发布；失败不能出现公开剧情承认交易却未登记债务/人物的分裂状态。需要复用 CAS / event receipt / idempotency，而非另造第二套 Saga。
- **认知权限不随绑定自动扩大**：给 Subject 换个 Profile 或升级自主性不能绕过 W7-B 信息授权；从同一 Subject 派生的不同输出（Inspector/玩家/NPC）必须各自按合法可见源编译。

## 6. 分支、回档与重播示例

**同一阿洛两个故事线**：

- `T0` 已将阿洛作为 Subject 正式接纳、绑其表达资料，但没欠款。
- `T1` 玩家赊账，提交 Debt。此时 SavePoint-A（早于借款）和 SavePoint-B（借款之后）都可回溯精确 Revision。
- 从 SavePoint-A 分叉：仍可见“阿洛”这个继承的 Subject，但**没有那笔债务**，其认知/行为后果也不能泄漏。
- 从阿洛第一次被正式接纳之前的 SavePoint 分叉：该分支不可引用另一分支才产生的阿洛 Subject；
- Player 只知道“苍鹰”，Host 知道他是阿洛，但不能把秘密映射展示给不知情 NPC。
- `HCM Entity` 在旧分支里曾经把“阿洛”和“苍鹰”合并：新分支若无对应合法证据，**不能**照搬该主观图的确认结果。

所处 Branch/Revision 是否能在当前权威状态回放到？该绑定是否合法/生效且有足够来源？如果无，则返回 unknown/disputed 而不是凭姓名猜测“当然是他”。

## 8. Library / Studio / Play 的自然创作体验（候选）

- **Library**：World 描述人物、地点、组织等静态来源和重要结构；Actor Profile 负责表达、文风与角色预设。所有资产可继续完全自由文本编辑，不强制每次写文案就新建 Entity。
- **Studio**：用户明确绑定“这张角色卡代表世界中的某个人”或“这张卡只是角色表达模板”；预览已配置的首次实例化和潜在同名/秘密映射歧义，确定 EntryPoint 起始成员。
- **Play**：新 NPC 由剧情触发正式接纳后可保持身份、被任务/人物关系系统认识，并按条件获得表达、私人记忆与有限行动能力。玩家默认只看到符合故事知识条件的资料；可授权的 Inspector 能解释绑定来源、版本、权限与分支。
- **不显示系统内部 ID 为主界面**；高阶审查可以查看 `Source / Subject / Actor template / Perspective / event receipts` 的关系与差异。
