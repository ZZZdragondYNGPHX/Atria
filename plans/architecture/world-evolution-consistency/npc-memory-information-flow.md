# ARCH-DWE-01 · NPC 个人记忆、秘密与信息传播

[唯一入口](index.md) · [实现分工](e0-preflight-execution.md) · [同一 Record](../../../records/architecture/world-evolution-consistency.md)。**Draft / Paused**，本次仅整理文档；已确认方向为 **W7-B：动态受众资格、来源驱动信息流**。本模块定义功能与逻辑合同，具体字段按原实现接线；旧源码与历轮讨论仅作背景。

## 1. 目标与非目标

**目标**：让每个有必要维持连续性的 NPC 能够回答“我亲身经历过什么、我现在相信什么、我知道别人可能不知道什么、我可以告诉谁、我目前想做什么”；其他 NPC 只能通过合法观察/通讯得知相应内容。

**非目标**：不能将 HCM 的知识提取结果当成新的世界真相；不能为全部人口持续运行 LLM；不能直接给每个出场 NPC 一个 Package `Actor`；不能为了方便推演让所有 NPC 读取 Narrator 的完整信息。

### 1.1 独立的三个事实维度

- `WorldTruth`：已提交原生状态、规则、事件和社会关系，唯一写入权威是 Native Host/Session。
- `SourceClaim`：某人说过/文献写过/传闻指称的内容，存事实载体与出处，不表示内容真实。
- `ActorBelief/Memory`：某主体什么时候接触并如何理解某条内容。可以不真实、过期、自相矛盾、对不同对象保密；基于合法暴露证据产生。

故事作者的隐藏 Canon 有自己的可信约束，但不意味着角色已经知道它。世界未定义细节是 Unknown，不等于 False；梦境与假设不可自动成为事实。

## 2. 动态主体能力接纳（W4/W5/W6 的关键接线）

运行时出现的 NPC 在 W4-B 下可能先获世界实体 ID，但**获得被授权认知视角需要另一步合法启用**。候选机制名为 `Perspective Admission`（逻辑接口，非正式 API）：

1. Native Entity 已合法提交，仍属于当前 Session/Branch/Revision，类型支持意图/观察；提供复用的稳定 entity identity。绝不根据显示名或 HCM 搜索结果提升身份。
2. 根据已声明的世界规则、场景作用域和 NPC 自主性门槛，选择是否需启用只读本人视角、可存私人认知的视角、或具有限预算 Task 的深度 deliberation；不是每个 P2 都自动拥有 A3。
3. 从当前提交快照和已有 Native Information / Cognition / HCM 暴露合约生成 **目标限定**的 capability/view；动态身份与视角映射由 WP-C 接入原 Host/Information，不另建 NPC 数据库。
4. 允许在作者授权的最低精度下按规则反应，不能宣称拥有内心/完整记忆。

**实体身份与合法视角分别解析，具体 ID 沿原实现决定**；应避免一旦更名、迁徙、死亡或升级模拟精度就失去此前合法身份和历史。

## 3. 记忆层次与生命周期：不等于所有文字永久存入

| 信息层 | 例子 | 候选处理 |
| --- | --- | --- |
| Episodic / 经历 | 阿洛看见米拉与玩家争执 | 绑定确切来源（现场事件/已可见会话/通信），记录观察时刻与主体 |
| Semantic / 相信与理解 | 阿洛认为米拉不可靠 |与世界事实分离，可更正、争议、失效|
| Commitment / 正式义务 | 阿洛答应代玩家保存钥匙 | 产生持续后果需在 Native 世界事件/契约中正式提交；NPC 同时可以记住承诺 |
| Emotion / 短期情绪 | 阿洛今天因失窃焦虑 | 有界状态，不要求每回合永久归档；相关性下降时可淡化 |
| Personality / 稳定倾向 | 阿洛一贯谨慎 | 可以从作者资料或长期经历形成/逐步改变；不得因一条碎片任意反转 |

可以按 W5-B 热/温/冷及上下文预算对个人记忆做摘要、检索和压缩，但不能把“抹除缓存”错误解释成“历史事件被撤销”。被合法撤回的观点也应能够解释曾何时相信什么。

现有 `native-memory-contract.js` 已具 `identity/commitment/relationship/key_event/detail` 角色与 `fadeAfter` 等机制。未来可复用而非创建重叠的记忆生命周期。

## 4. 谣言与秘密：信息传播不是事实复制

候选最小过程，强调可达性和独立判断：

```text
Committed world event / authored hidden canon / explicit source claim
  → sender's legal observation (witnessed / told_by / hearsay / ...)
  → intention to tell or disclose (may be false, deceptive, partial)
  → communication attempt (channel, sender, recipients, place/time, scope)
  → Native event/result: actually delivered? intercepted? overheard?
  → each recipient's eligible observation
  → independent belief update (trust, evidence, uncertainty, denial)
  → optional ensuing decision/behavior via W5-B
```

必须分别处理 `told`、`sent`、`delivered`、`heard`、`believed`、`disproved`：寄出密信 ≠ 对方已经收到 ≠ 对方相信。不允许全世界广播为“所有 NPC 立即知道”。

保密处理是**信息访问规则**，不是只给提示词加一句“请保密”。只有获得特定授权/来源可见性的主体能检索秘密原文；可以谎称知道秘密、猜到部分真相或传播错讯，但必须保留主观性、真实性的不同层级和出处。

- 例：皇帝 T10 已死（WorldTruth）。T11 宫廷说“皇帝仍然健康”（SourceClaim）。T12 北境将领听闻并相信（Belief），T15 得到密报后怀疑。史官知晓真相，却不等于北境将领的有效上下文可以提前读到。
- 传播受 game-time、地点、通信媒介、参与者、身份/权限和事件有效版本约束。全员传播要么是已提交的广播/公告规则及可达范围，要么不能直接推定“全部知情”。
- 一名 NPC 在脑海里想传播谣言并不意味着消息已经发送；收到情报也不意味着已经改变态度/目标。未经提交的意图不是世界效果。

## 5. 多角色回合/隐私的权威边界

- **NPC A perspective**：只读取 A 可感知/获悉/相信和基于本人证据的 ToM 推测；不能直接索取 B 私人想法或 Narrator 的未公开 Canon。
- **NPC B perspective**：相同规则但可能不同来源/时间/情绪；两人可以在同一事件后得出相反结论。
- **Player perspective**：玩家的角色实际经历与用户 UI 所显示的资料需依据游戏视角设定；不能因为 Host 掌握世界因果就误剧透。
- **Task/Orchestration**：只能按已授予的精确 Task/Actor view 提出候选；模型输出不自动授权自身读取其他人的私有记忆。

底层资源的读访问和 Prompt 编译必须同样限制，不能只在展示层打码（已经进入模型上下文就可能泄密）。

## 6. 存读档、时间与撤销/纠错

- Memory/Belief/Source 的有效读取需要绑定 `sessionId + branchId + revisionId + relevant scope epochs`；角色接收时间是游戏内时间，叙述发布时间不是真相生效时间。
- 从 T11（密报到达之前）另开分支，旧分支 T15 知晓秘密不能进入新分支。允许继承分叉点已合法知晓的记忆，但新分支后续经历/推论各自变化。
- 纠错是新的证据/认知修订：T12 相信“皇帝活着”，T15 因新证据更正；不能回写成 T12 也知道真相。历史必须可回答“当时谁知道什么”。
- HCM 搜索缓存/派生图可按照许可重建；它不得成为跨分支唯一“最新事实”，也不因摘要丢掉世界正式提交的债务、职位或死亡状态。

## 7. 原信息与记忆模块的接线位置

- [Information Contract](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-information-contract.js) 的 `sources/views/actors` 是声明式列表，定义 `belief` 的 `actorField/statusField/channelField`，视图 `audience` 支持 actor/task/narrator 等，当前对未声明 Perspective 不会自动开放。
- [Information Runtime](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-information-runtime.js) 的 `actorAvailability` 对未声明 actor 返回 unavailable；
- [Theory of Mind Authority](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/tom-authority.js) 部分目标 ID 受 `manifest.actors` 限制。动态 NPC 接入合法 Perspective，不直接读取所有角色记忆。
- [Memory Eligibility](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/eligibility.js) 由 Host 已选 snapshot、Information 投影和允许来源限定 HCM 读取；不可信源 ID / 用户给的 requester 不能扩大权限。
- [Native Memory Contract](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-memory-contract.js) 已定义受保护记忆角色、生命周期与事实来源 basis；不要再建并行 NPC Memory DB。
- [Native HCM Graph](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/temporal-graph.js) 已支持源证据关联与时间化关系投影，但不能反向赋权给世界事实。
- [SessionCore](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/session-core.js) 与 [SavePointRepo](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/repositories/save-point-repo.js) 提供唯一提交与分支锚点，不能另建跨分支传播日志真相源。

Scope/Task 的静态 Actor 依赖在对应调用方中改为受权 Subject/Perspective，保留原来源与预算服务。
