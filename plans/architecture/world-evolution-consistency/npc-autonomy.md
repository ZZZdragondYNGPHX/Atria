# ARCH-DWE-01 · W5 NPC 自主性、目标与游戏时间调度（讨论草案）

- **Plan**：[唯一入口](index.md) · [W4 动态接纳](runtime-emergence.md) · [Research](research.md) · [Record](../../../records/architecture/world-evolution-consistency.md)
- **状态**：Draft；**W1-B / W2-B / W3-B / W4-B / W5-B 设计方向已获用户确认**；具体 API、预算阈值和消费者接线仍待议，完整 Plan 未定稿。本模块属于同一 Plan Bundle。原 §5 为当时选型比较；正式选择见 §10。
- **范围**：新老 NPC 如何在角色身份确立后获得可受约束的目标、记忆、计划、行为与离屏发展；多 NPC 交互以及有限成本的事件/游戏时钟驱动。
- **边界**：仅讨论、文档提交；不修改 main / 原生接口，不开启运行时长期异步模拟，不凭空宣称端到端测试通过。

## 1. 从“存在”到“活着”：必须拆开的四种能力

**W4-B 解决的是“实体什么时候正式进入世界”，W5 解决的是“存在以后怎样主动影响世界”。**

1. **持久身份（Entity Persistence）**：有稳定引用、有效生存/归属状态和可回溯历史；不意味着随时计算下一步行为。
2. **主体认知（Knowledge / Belief / Memory）**：该 NPC 知道、相信、记住什么，视角限权；HCM/Information 是证据及认知消费者，不能直接把想法当世界真相。
3. **动机/承诺（Motivation / Goal / Intention / Obligation）**：想做什么、为何想做、约定何时做、何时失效。目标是候选意图，不是已经完成的事实。
4. **行动与世界效果（Action / Commit）**：任务/规则/AI 提出行动 → 通过 Native Authority + 当前 branch/revision/clock/权限/预算验证 → 提交受影响的事件与状态 → 更新历史与相关主体可见信息。

**不可混淆：** 一个著名 NPC 可以永久存在但暂时休眠；一个路人可以与玩家短暂激烈对话却不需要成为高频永久 Agent。Package 的 authored Actor 和 runtime emergent NPC 不是一回事；能否以安全受众身份访问现有 HCM / Cognition / Prompt 必须先审计。

## 2. NPC 逻辑模型（候选，不是最终 Schema）

```text
Session-owned NPC identity + world facts (Native State/Event owner)
   |
   +-- Physical/social capabilities: location, occupation, money/items, affiliations
   +-- Available world events: schedules, commitments, relationships, hazards
   +-- Personal cognition: observations, beliefs, memories, desires, intentions
   +-- Active decision policy (if needed): rule / utility / LLM-assisted proposal
   |
   v
Bounded simulation scheduler (single canonical game clock; scope & budget)
   |
   v
Proposed world action --> Native validator/authority --> commit receipt or reject
   |                                                    |
   +-- on accepted: timeline/history and target-scoped HCM observation --------+
```

- **身份与知识分离**：NPC 的实体事实可以客观成立；其愿望、怀疑及未公开计划只有本人/授权消费者可访问。秘密目标不能自动泄露到玩家或其他 NPC。
- **目标与承诺分离**：`goal: 开一家旅馆` 只是愿望；`obligation: 三日内还钱` 是由已经提交的交易/约定所形成的可追踪承诺；两者都不等同完成效果。
- **计划与后果分离**：计划中“去购买木材”不意味着木材已成交。只有可执行事件成功提交才导致资源转移。
- **角色模型不要硬依赖 Package Actor**：固定 Package Profile 是已创作角色的表达/身份入口；动态 NPC 的状态和行为不是通过修改 Manifest 的角色表来实现。是否需要统一 Actor/NPC 投影、对话人格视图与权限，待 E0 消费者审计。
- **不额外存一份通用心智库**：优先复用现有 Native Information/Cognition 的 `desire/intention/belief` 及 HCM，只有真实接口缺失时才建议最小扩展。

## 3. 游戏时间、离屏行为与计算预算

### 3.1 不建议持续实时模拟世界

Atria 的“世界持续演化”推荐语义是：**世界按游戏内的规范时间与已提交事件演化，而不是用户退出应用后依赖云服务器每秒钟跑一堆模型**。当玩家休息、旅行、跳过一段时间或由已授权操作推进时间：

- Native Simulation 在声明的世界时间窗口里处理有截止期的确定性交易/状态变化，控制最高步数、作用域和依赖；
- 对相关热点主体可以提交有限的 LLM deliberation 任务，但其提议必须回到 Native Authority 验证；
- 冷态主体不逐 tick 模拟生活细节。可以使用聚合/规则结算，只有需要跨场景持续效果时留下精确世界状态/事件；
- 时间跨度大不代表无限调用模型；无法在预算内合法结算的关键事件，必须保持明确待决/暂停推进边界，不能伪造“都已经算完”。

“离屏”表示玩家不在附近或不在当前对话焦点，并非默认离线后台常驻执行。用户以后若要真实离线推进，属于独立的产品权限、资源和同步选择，不由本 W5 偷偷启用。

### 3.2 建议的自主性分层（与 W4 的持久性刻度正交）

| Autonomy | 运作方式 | 例子 | 典型成本 |
| --- | --- | --- | --- |
| A0 passive | 仅在外部事件影响时改变 | 普通建筑、尚未聚焦的路人记录 | 不主动推理 |
| A1 scheduled rules | 事件/游戏时钟和预定规则 | 店主每日开店、卫兵换岗、债务到期 | 少量确定性事务 |
| A2 reactive/utility | 遇到事件后按目标、风险、资源与关系权重选择受支持的动作 | 店主发现欠债逾期、商队改道 | 有界规则/效用选择 |
| A3 deliberative | 为重要人物做有约束的认知更新与 LLM 行动提议 | 阵营首领回应政变、盟友商议长期计划 | 有界且可度量的模型任务 |

- 升降级由**相关性、承诺期限、人物重要性、可见性、预算**共同决定。不能因拥有名字、角色关系或长期存档，就保证自动拥有 A3。
- 保留人格连续性但允许成长：目标、信念、关系都可改变；应该有时间、经历、来源支撑，而不是每轮无依据换性格。
- 允许多 NPC/势力群体效果的聚合结算；并非每个社会事件都需要两人各调用一次 LLM。

## 4. 已核对的 Atria main 与真实空缺（静态阅读）

- [Simulation Authority](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/simulation-authority.js)：已有规范时钟、任务与事务类型、`hot/warm/cold` 相关性、作用域、最大步数、离屏追赶与有界任务思考。**不新建另一套定时模拟器**。
- [Simulation Contract](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-simulation-contract.js)：当前有静态 `jobs`、静态同 scope 的显式数据读取与作用域绑定；契约目前限制 jobs ≤16、steps ≤16、deliberations ≤1（这是**所读 main 静态常量，不是推荐未来指标**）。这意味着不能仅通过在静态列表给每个新 NPC 注册一个 job 就实现开放世界：下一步必须审计是否有现成“按动态身份选取同类工作”的适配，或者需要最小演进，而不是直接调高常量。
- [Native Lifetime Authority](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/lifetime-authority.js)：具备 `person.enter/promote/exit`、职业/关系、人口统计、低高 tier 和历史里程碑；这是一个**可选的特定人生领域能力**，不能代表任意 RP NPC 已自动得到智能体。
- [Information Contract](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-information-contract.js)：已有 `desire`、`intention`、`emotion`、`belief`、`relationship` 等信息来源语义、作用域和受众限制；认知契约必须复用/审计，而不并行搭建 “NPC Mind DB”。
- [Actor Profile](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-actor-profile.js)：`projectActorDefinition` 只投影 Manifest / EntryPoint 引用的已创作 Actor；运行时新增 NPC 不会因此自动进入正式 Actor 清单或获得其专有提示词上下文。
- [Theory-of-Mind Authority](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/tom-authority.js)：部分 perspective 身份校验受 `manifest.actors` 限制，证明“新 NPC 接入视角/目标/角色上下文”需要真实消费者审查；不宜只修改 world state 就宣布全域已接通。
- [Memory eligibility](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/eligibility.js)：按请求者种类及 Information 的有效暴露快照决定记忆可取回范围，不能让动态 NPC 任意读取 Narrator 全局真相。
- [Native Task Authority](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/task-authority.js)：Task World 与 Authority 的 effect / events 验证已有路径；NPC 提议不能自行直接修改世界。
- [SessionCore](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/session-core.js) / [SavePoint](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/repositories/save-point-repo.js)：版本化提交、回档、分支历史仍为唯一权威。

**E0 阻塞**：动态身份能否作为 Information actor/audience、Task actor、HCM requester、Orchestrator 接收方、Simulation work owner，目前没有全调用方和端到端证据；不得提前宣布支持所有新 NPC 全自主。

## 5. 方案对照 W5（待用户确认）

### W5-A · 脚本/日程型

全部 NPC 主要使用作者编写的作息、阈值触发、反应表，不为其提供自由目标规划。成本和回放稳定，适合规则游戏，但高自由度角色成长与社会涌现有限。

### W5-B · 分层事件驱动自主性（**推荐，未获批**）

世界真实存在的 NPC 获得身份与可选认知；大部分走确定性游戏时钟与规则，只有与玩家/世界主要变化强相关时做短期效用选择，极少数重要主体允许有界 LLM 辅助规划。所有动作都是提议，仍须经 Native commit，允许主动造访、交易、迁徙、传播消息与关系变动，支持降级/休眠/聚合。

### W5-C · 全角色常驻 LLM 自主运行

每个正式 NPC 常驻独立 Agent，持续规划、做决定并在离屏期间交互。理论表现上限高，但模型/调度成本、爆炸式社会互动、长期因果一致性和设备性能风险严重；不适合作为 Atria 默认。

## 6. 关键案例：旅馆老板阿洛与玩家的约定

- **T0 登记**：玩家向新认识的阿洛赊账，实体身份 + 债务关系随同一 Native revision 正式提交（已选 W4-B）；他获得约定付款的到期 Tick。
- **T1 玩家离开城市**：阿洛不消失。A1 可照营业规则处理店务；没有必要持续向 LLM 请求“今天阿洛在想什么”。
- **T2 债务临近到期**：一个合法的时钟/规则事件可以把到期承诺放入可结算队列；若欠债仍未还，阿洛可以根据既定规则/意愿（A2）准备催款动作；没有真实出行/通信能力或可交付渠道时不能直接声称玩家收到了信。
- **T3 NPC 决定催债**：他的`desire`或`intention`是私有意图；发送催款、委托跑腿、公开追债须分别满足物理/社交/权限约束与因果来源，提交后变成世界事件。
- **T4 玩家回城**：检索阿洛当下状态、合法的见闻、债务与交互史；如果模型负责生成新的话语，应遵从其真实得知的信息和已经提交的结果。
- **分叉**：若从债务建立前存档恢复，另一分支没有这笔债务与随之产生的催账、个人意图和消息传播；延迟执行的旧分支任务不能误投当前分支。

## 7. 风险与需要收口的细节

1. **目标与承诺不可混为一谈**：NPC 期望不应自动推动玩家行动或世界改变；提交才产生后果。
2. **开放世界 NPC 动态调度**：静态 max 16 jobs + 明确 scope 的现有契约无法直接等同无限 NPC；探索“事件归属批处理 + 动态身份索引”是否可由现有 Native Authority 简洁承载。
3. **长期人格漂移**：区分稳定偏好、由经历改变的观点、短期情绪与误传；目标到期和修订须有依据。
4. **信息与保密**：多主体选择何时能收到消息，不能直接把全局 Session 真相塞给任意角色。
5. **互动冲突**：多 NPC 同时抢同一职位/物品、一个角色已经死亡却收到后续任务；在 Native branch+revision 上验证条件并保持可解释结果。
6. **玩家自主权**：任何 NPC 行动建议都不能把“玩家已经做了某事”擅自提交；玩家行动需要真实输入/明确委托授权。
7. **成本与可恢复性**：休眠期间按游戏时间追赶和必要事务结算，不要求用户挂机持续生成；长时间跳跃应有预算边界、可验证存档和精确会话版本。
8. **事件与叙事**：模型可以提出 NPC 行动，但外部世界变化与最终叙事必须以成功提交状态为依据。

## 8. 外部研究（参考机制，不是直接依赖）

| 资料 | 观察 | 对 Atria 的建议 |
| --- | --- | --- |
| [Generative Agents (2023)](https://doi.org/10.1145/3586183.3606763) | 记忆、反思、规划帮助模拟社会行为；展示 25 个 Agent 的研究场景 | HCM + 有界认知提案适用于少量关键 NPC，不照搬每个人全时思考 |
| [Concordia](https://github.com/google-deepmind/concordia) | Entity/Component/Engine 组合，行动提出后由环境/GM 解析并结算 | 复用 Atria Native Host、Simulation 与 Authority，不为它再造第二 GM 真相源 |
| [Concordia Environment](https://github.com/google-deepmind/concordia/blob/main/concordia/environment/README.md) | 观察、调度、动作解析与终止是明确的模拟环节 | NPC 意图 → 调度 → 可行性 → 状态提交；模型不是世界事件执行者 |
| [Unreal Mass Gameplay / LOD](https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-mass-gameplay-in-unreal-engine) | 使用实体重要性对模拟频率和表现粒度分层 | 借鉴“计算精度随重要性调整”，不要引入 Unreal / ECS 依赖 |
| [Unreal StateTree](https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-state-tree-in-unreal-engine) | 状态机/任务/转换与可组合规则 | 日常行为和确定性动作使用规则/状态机更廉价、可解释，不需要无限 LLM |

资料均用于架构类比；没有外部框架已安装或 Atria 新功能已实现的证据。

## 9. 原 W5 候选选型与下一步（历史讨论记录）

- 是否选择 W5-A / W5-B / W5-C；推荐 W5-B。
- 之后再冻结 NPC 角色身份投影、目标/承诺与 HCM 绑定方式、离屏结算粒度、真实的模拟批调度接口、互动权威和资源预算等具体契约。
- W4-B 的“持久身份即接纳”已确定方向，但“会不会自动获得 AI Agent”未决定且不应默认为是。
- 当前仍为 Draft；本阶段只更新 docs 的同一 Plan 和唯一 Record，不触及 main、不开实现分支。

## 10. W5-B 用户确认（2026-10-17）

用户回复「认同」，明确承接上一轮推荐的 **W5-B · 分层事件驱动自主性**，记录为已确认**设计方向**：

- 大多数 NPC 按游戏时钟、规则、日程和事件驱动；相关 NPC 在已知信息、目标、资源与关系下有界响应；少数关键主体使用有预算的 LLM 辅助判断。
- 持久存在/激活模拟/拥有私有目标/实际提交世界效果是不同维度，离屏运行由**游戏内时间跳跃**触发，不默认离线持续计算。
- NPC 自行提出的意图、行动和社会互动必须通过现有 Native Authority 约束验证和 Session/Branch/Revision 提交；未提交的计划不等于事实。
- 保持现有 Simulation/Information/HCM/Lifetime/Task 权威，避免第二套 GM / Actor 库，优先补动态身份接入现有消费者的真正缺口。

**尚未批准**：具体每级自主性阈值、是否/如何支持动态 perspective Actor、NPC 心智数据 schema、调度任务配额、所有动态 NPC 的真实端到端实现、用户权限与提交细则。

**当前下一轮 W6**：NPC 主体的私人认知、记忆与情绪，单方好感 vs 共同社会关系、信息传播、多人互动、秘密与分支隔离。参见同一 Plan 的 [npc-social-cognition.md](npc-social-cognition.md)。方案继续 Draft，不修改产品代码。
