# ARCH-DWE-01 · W4 运行时涌现与事实生命周期（讨论草案）

- 关联 [Plan 入口](index.md) / [总体设计](design.md) / [研究](research.md) / [唯一 Record](../../../records/architecture/world-evolution-consistency.md)
- 状态：**Draft / W4-B 方向已获用户确认，完整 Plan 未定稿；未授权开发**。第 6 节为原本候选比较，最终本轮决定见第 8 节。
- 2026-10-17 承接已确认 W1-B（World Model + Source Library）、W2-B（分层混合内容）、W3-B（分级约束 + 涌现世界）。
- 新问题：世界并非只有预设内容。NPC、地点、物品、组织、势力、案件和社会关系可能只在游玩中才出现，它们应该如何从叙事/观察进入**已提交的动态世界**，获得可追溯身份与生命周期？

## 1. 核心边界：世界定义 ≠ 当前世界的成员全集

Library/Studio 规定世界规律、初始实体、可用内容类型与发生约束；**Play 不是静态设定列表的实例副本**。Play 能在事先约束内，通过已提交事件引入新的实体、关系、行为与历史。

将问题拆成四条彼此独立的轴：

1. **Existence / Identity**：这个 NPC/地点/物体在此世界或分支中是否已确立存在？稳定身份和其来源是什么？“第一次遇见”不是“出生”。
2. **Persistence / Relevance**：只是本场景背景、已被玩家/世界引用过的持续性实体、还是需要高精度模拟的核心主体？
3. **Agency / Scheduling**：是被动世界记录、可受事件影响的对象、按时钟/规则自动行动的主体、还是需要昂贵 LLM 决策的活跃 NPC？
4. **Knowledge / Visibility**：客观世界存在、玩家知道、NPC 知道、情报所称、模型猜测等可以不一致；谣言里提到的新 NPC 不能自动确证其真实存在。

不要将这四条轴强制塞进同一个枚举：一座城市可长期存在但无需主动思考；一个短期角色可在当前场景高度活跃；一个未登场的阴谋者可早已真实存在，却尚无人知晓。

## 2. 候选：动态实体接纳（Entity Admission）

```text
Narrative mention / player action / sim job / knowledge observation
    |
    v
Interpretation: background detail? identity? belief/report? durable consequence?
    |
    +--> ephemeral scene detail (no permanent entity, still part of narrative evidence)
    |
    +--> observed/reported candidate (provenance + uncertainty, not automatically truth)
    |
    +--> fact/event candidate + constraints/permissions/identity reconciliation
                 |
                 v
        Existing Native Host/SessionCore commit (branch+revision+receipt)
                 |
                 v
       Session-owned entity/relationship/state projection
                 |
                 +--> current Effective World View & bounded Context
                 +--> histories/provenance
                 +--> HCM/individual observation and belief
                 +--> optional scheduling/lifecycle admission
```

- **同一身份**：每个真正纳入世界的动态实体取得稳定 Session 世界内身份；名称、别名、角色称谓或同名不作为主键。历史分支继承已确立实体，分叉后新生成身份归本分支命名空间/事件来源；跨分支不能靠名字合并。
- **关于“创建”**：NPC 首次出场可能只是玩家第一次认识一个原本存在的人（`introducedAt`）；与 NPC 的实际出生（`bornAt`）、首次提交/登记（`registeredRevision`）应区分。
- **新造地点/物品/组织**同理，首次提到可早已存在或被新建，创建/发现/转移/销毁/关闭各为不同事件类型。
- **来源不足**：模型虚构对话中的隐喻、梦境、据传的某人、未证实传言只产生资料或角色认知，不能以“提到”直接授予世界真相身份。
- **提取/确认边界**：作者编辑期机器抽取仍需审核关键硬设定；Play 中 E1 已获世界规则授权的普通涌现事实可以自动接纳，不要求用户每次点击同意；E2/E3 仍受前置规则/特殊权限约束。

## 3. 候选：持久化与自主性解耦

| 维度 | 等级 | 示例 | 处理 |
| --- | --- | --- | --- |
| 持久性 | P0 场景临时 | 路过的不具名行人、桌上的茶杯 | 可只在短期场景/叙事上下文；不承诺永久数据记录 |
| 持久性 | P1 有出处的见闻 | 路过某人，人物台词或某人传闻 | 留场景/叙述证据；是否实体真实仍须区分 |
| 持久性 | P2 正式世界实体 | 玩家结识“阿洛”并承诺三日后再见、命名旅馆、获得独特道具 | Native 已提交身份、当前属性、所涉关系和历史来源 |
| 持久性 | P3 长期重要 | 核心盟友、关键统治者、主要据点 | 保持高价值可查询历史及精细状态；不自动意味着每回合调用模型 |
| 自主性 | A0 被动 | 墙、遗迹、物品 | 只被查询与事件改变 |
| 自主性 | A1 规则驱动 | 商店营业时间、巡逻班表 | 时钟/有限事件逻辑 |
| 自主性 | A2 低频自主 | 离屏商人改换城市、势力关系变化 | 按需调度/聚合追赶 |
| 自主性 | A3 深度 NPC | 核心角色的目标/计划/社交反应 | 按参与度与预算调度 HCM/Orchestration/LLM 决策 |

**这两个刻度是供讨论的表达方式，不是已确认 Schema。** 必须区分“是否存在”和“是否积极模拟”；`P2` 才能保证跨场景连续性，但一名 NPC 可以 P2/A0，而临时场景里的互动角色可以 P1/A3（短时推理但未进入永久实体库）。

**何时应立刻 P2？** 当角色被玩家明确交互、命名并发生持续影响（获得承诺、债务、物品转移、好感/伤害、任务与后续约定），应与该事件的效果一并正式登记，**不建议等第二次出现才注册**。普通过场路人则不应因被描述一次就累积无数永久记录。

### NPC 示例：旅馆老板“阿洛”

1. 文本：“玩家走进旅馆，老板阿洛向你招呼”——模型或作者提供一个候选实体，但名字是出场信息，世界注册并非必然。
2. 玩家赊账并约定三天内偿还——事件需要精确对方身份：提交 `PersonIntroduced` / `DebtCreated`（类型均仅示意），身份、债务和约定在**同一个 Native 提交流程**中完成。
3. 过夜后：A1 时钟决定他次日开店；玩家离开时，老板保持持久性 P2，长期间无需每回合模型推理。
4. 三天后：当玩家回来，查询其稳定 ID、既往对话证据、欠账状态、个人可知信息，而不是重新生成“另一个阿洛”。
5. 若阿洛去世/破产，更新状态并产生历史，后续改由继任者经营；原始创作世界资料不需更改。
6. 从第 2 天另开 Save/Branch 后，阿洛在分支 A 的债务不能污染 B；若两个分支共享分叉前的阿洛，身份可共享历史来源但其后事件独立。

## 4. W4 四个关键技术议题（全部待议）

### 4.1 事实提交流程与叙事发表

候选强一致路径：
```text
interpret / propose -> validate permissions & preconditions -> native commit
-> stable receipt & revision -> publish public prose reflecting confirmed outcome
```
- 真相级别事件必须有受约束的 effect + commit，不是“一段叙述说发生就发生”；但不能把所有文学细节都强行变成结构化事务。
- 叙事如果在提交前就对外发布重大后果，提交失败后不能默默当成真相；可拒绝/修正或重新生成匹配的可发表结果。
- 重试、离屏任务和多事件结算复用已有 `expectedRevisionId` + `idempotencyKey`/receipt，避免双提交和未经授权新增多条防御性链。

### 4.2 “出生/发现/被描述/登记”与历史有效期

至少区分：
- `validAt`：游戏世界中发生的时间（可与事件实际发生不同于角色获知时刻）。
- `recordedRevision`：在哪个已提交 Session revision 确立/纠正了事实。
- `observedAt`：某个主体接触到消息的游戏时间，可由 HCM 复用、仅需要时登记。
- `introducedAt`：该实体第一次进入本故事/角色视野的时刻，不代表实体当时才出生/建成。
- `originEvent` / `sourceRef`：出生、登场、创建、发现或被引用的来源与关系。

不要求全部事实持久化每个字段；这些为语义查询问题清单。历史回溯必须以 branch + as-of 游戏时刻/确认修订区分“当时已发生”和“后来才知道”。

### 4.3 存档、分支和身份

- 当前 SavePoint 锚定 branchId + revisionId；分支继承分叉点的有效状态与身份，分叉后的新增事实/自动活动不得反向污染祖先或其他分支。
- 查询必须与确切 Session/Branch/Revision 绑定，不存在跨 Session 的 `global latest NPC status`。
- 当存档回到 P2 注册之前，该分支可以没有该实体的正式身份，尽管另一分支存在同名人物；如何对跨分支实体作稳定显示/引用，待进一步定细节。
- 不应让图索引、HCM 派生缓存或搜索命中成为独立可写“另一份世界真相”。

### 4.4 自主演化如何接纳新对象

- 世界模拟根据已登记的实体与场景/势力范围执行；时间相关 action 受 Native Simulation/Authority 调度；更新只影响其拥有的状态/关系。
- 对大量低关联 NPC 使用聚合人口、地区经济/事件摘要，关键角色按热点提升模拟精度；不让全部 NPC 自动成为每轮 LLM Agent。
- 未预设主线的新人物可以在世界规则允许的场景中由因果事件进入；普通世界作者不必预先填好“所有未来 NPC 名册”。
- 多主体 HCM 记录不同认知和误报；AI 读取到某实体的名字/传闻不意味着其立即成为确定存在的 NPC。

## 5. main 静态源核对（2026-10-17；没有运行测试）

- [World Session](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/experience/world/session.js)：`projectEvents` 通过 reducers 产生候选状态，`commitEvents` 调用 `nativeRuntime.commitStatePatch` 连同 `atri_world_state` 和 `atri_game_runtime` journal 发布，带 `expectedRevisionId`。存在 action receipts/idempotency 路径；需要 E0 验证具体消费者是否都经单通路。
- [Session Core](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/session-core.js) + [SavePoint Repo](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/repositories/save-point-repo.js)：Session/Branch/Revision、state publish、存档锚定，以及 runtime update 的 CAS 已存在；不要平行造第二持久化/分支系统。
- [Native Lifetimes](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/lifetime-authority.js) + [Lifetime Contract](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-lifetime-contract.js)：**已有**受限动态人物生命周期原型：`person.enter`（要求已有因果证据）、`person.promote`、退出、归来、职业、健康和关系，保留 introduction 与 birth 区别，以及 A/B 相关性层级；但它是可选、具体规则域的系统，**不能据此宣称一般叙事 NPC 都已经自动接入**。
- [Authored Actor Profile](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-actor-profile.js)：`projectActorDefinition` 读取 Package manifest 中被 EntryPoint 引用的演员/角色资料，明确不使用动态 Session 状态；**不要把它与运行时新 NPC 混为一体**。是否需要动态 NPC“获得完整演员表达/对话能力”，是未来 consumer/audience 设计问题，而不是偷改 manifest。
- [Native Simulation Authority](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/simulation-authority.js)：已有声明式任务、时间、热温冷筛选与预算，适合复用，不能额外启动无限 LLM NPC 循环。
- [HCM history entities](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/history-build.js)：已有从历史抽取实体/关系及来源的路径，但它属于记忆证据而非 Session 真相注册器；需要定义同一角色在 HCM 证据与 Native EntityRegistry 投影中的身份映射，避免两个独立权威。

## 6. W4 选择题：怎样接纳并管理游玩中出现的新对象？

**W4-A · 全量立即登记**：只要叙事里出现角色、物体、地点，都立即创建世界实体和变化事件。保证追踪完整，但冗余指数增长，误把传闻/幻觉注册成真相，长期成本不可控。

**W4-B · 渐进接纳 + 关键交互即时提交（推荐）**：普通场景细节保持轻量；一旦新对象承担跨回合承诺、交易、角色关系或影响规则系统，随该事件即时取得稳定身份；随后再根据热度决定需要多少模拟深度。能兼顾活世界、自由写作、长会话成本，但要设计“首次互动已经重要”的触发判断与遗漏修正。

**W4-C · 纯记忆驱动按需重建**：常规只保存生成的剧情与 HCM 记录，再次需要时从文本推断实体及状态。工程轻但身份重复、时间矛盾、跨分支误配与真相权威不稳定。

该三选一表保留最初讨论历史。**用户已在后续轮次确认 W4-B**；具体 API、持久化阈值与 E0 检验尚未冻结，见第 8 节。

## 7. 验收案例（未来 E0/正式实现时核实，当前未测试）

1. NPC 在一轮只被提及不触发永久注册；谣言中不存在的人不能冒充权威真相。
2. 玩家遇到阿洛、欠债、存档、重新进入城市：同一 ID、债务和认知都正确，且无需每回合推理。
3. 从欠债前 SavePoint 分叉；一条分支已欠债，另一条没有；跨分支 HCM 检索与索引绝不混淆。
4. 一个长期真实存在的 NPC 在后来首次登场：`bornAt` 和 `introducedAt` 不混同。
5. 多实体事件一次提交：交接店铺、收钱、关系变化、NPC 离开按同一权威 revision/receipt 成功或失败。
6. 大量 NPC 的低频模拟和压缩：可回溯重大历史，无全量 Agent 推理或无界 Token 上涨。
7. 用用户已经确认的规则重写例外变更世界法则；普通生成剧情不得暗自触发 E3。

**当前尚未决议：** W4 方案选择、注册下限、正式 Entity ID 归属、exact API/Schema、以何事件/状态为事实权威、AI 长期角色精度与预算阈值。最终方案须经过 E0 真正消费者审计后才可规划实现。


## 8. W4 决议（2026-10-17）

**已确认 W4-B：渐进接纳 + 关键交互即时提交。** 普通临时细节不强制永久存储；当运行时新增 NPC、地点、组织、物品等与游戏世界形成持续后果（承诺、交易、关系、归属、伤害、任务、定时影响）时，应在现有 Native Host 的一次受控提交流程中取得稳定身份并绑定关键事实、关联事件与分支修订。可持久查询与可自主行动是不同维度；无需给全部实体启动 Agent。用户在明确选择 W4-B 后进入下一轮 W5（NPC 自主性、目标、日程、行为调度），模块 [npc-autonomy.md](npc-autonomy.md)。

**仍未确认：** 具体 Entity ID/ownership/schema、是否某些类型需提早登记、首次提及的叙事回写策略、事务结果与公开文本的原子发布边界、game-time 双时间与分支查询接口、跨域实例化和 NPC 智能调度机制。旧第 6 节是选型比较，不恢复为本轮未决。Plan 继续 Draft；不修改产品代码。
