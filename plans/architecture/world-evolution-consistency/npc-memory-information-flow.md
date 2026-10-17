# ARCH-DWE-01 · W7 NPC 个人记忆、秘密与信息传播（讨论草案）

- Task ID: `ARCH-DWE-01`; Primary Workspace: `docs`; [Plan 总入口](index.md) · [总体设计](design.md) · [W6 社会认知](npc-social-cognition.md) · [唯一 Record](../../../records/architecture/world-evolution-consistency.md)。
- Status: **Draft / W7-B 已获用户确认，详细 API 与 W8 仍待讨论**。已确认 W1-B / W2-B / W3-B / W4-B / W5-B / W6-B / W7-B；§8 记录当时的选型比较，正式决定见 §10。完整 Plan 未定稿且未授权实施。
- Current discussion: 在开放式 RP 中，原生新 NPC 和已创作 Actor 应如何拥有持续的个人记忆、秘密、错误情报、有限的信息传播与合法的认知视角，并在游戏时间、存读档和多分支中不泄漏？

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
3. 从当前提交快照和已有 Native Information / Cognition / HCM 暴露合约生成 **目标限定**的 capability/view；精确验证请求者、作用域、源、授权、分支和修订。是否需动态 actor registry 或统一 identity 映射必须由后续 E0 真实消费者审计决定，不能预定新数据库。
4. 如果合法视角尚未具备，保持世界身份与已提交事件，但不得让它借用 narratorial view 或绕过 `manifest.actors` 校验。允许在作者授权的最低精度下按规则反应，不能宣称拥有内心/完整记忆。

**一个实体 ID 与其合法视角 ID 是否相同为待定契约**；应避免一旦更名、迁徙、死亡或升级模拟精度就失去此前合法身份和历史。

## 3. 记忆层次与生命周期：不等于所有文字永久存入

| 信息层 | 例子 | 候选处理 |
| --- | --- | --- |
| Episodic / 经历 | 阿洛看见米拉与玩家争执 | 绑定确切来源（现场事件/已可见会话/通信），记录观察时刻与主体 |
| Semantic / 相信与理解 | 阿洛认为米拉不可靠 | 有证据的主观断言；与世界事实分离，可更正、争议、失效 |
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

必须分别处理 `told`、`sent`、`delivered`、`heard`、`believed`、`disproved`：寄出密信 ≠ 对方已经收到 ≠ 对方相信。对于当面说话，也要检验出席、距离/可听性与场景资格；不允许全世界广播为“所有 NPC 立即知道”。

保密处理是**信息访问规则**，不是只给提示词加一句“请保密”。只有获得特定授权/来源可见性的主体能检索秘密原文；可以谎称知道秘密、猜到部分真相或传播错讯，但必须保留主观性、真实性的不同层级和出处。

- 例：皇帝 T10 已死（WorldTruth）。T11 宫廷说“皇帝仍然健康”（SourceClaim）。T12 北境将领听闻并相信（Belief），T15 得到密报后怀疑。史官知晓真相，却不等于北境将领的有效上下文可以提前读到。
- 传播受 game-time、地点、通信媒介、参与者、身份/权限和事件有效版本约束。全员传播要么是已提交的广播/公告规则及可达范围，要么不能直接推定“全部知情”。
- 一名 NPC 在脑海里想传播谣言并不意味着消息已经发送；收到情报也不意味着已经改变态度/目标。未经提交的意图不是世界效果。

## 5. 多角色回合/隐私的权威边界

- **Author/Host truth**：可以为事件验证和世界因果使用受信任完整真相，但玩家/角色叙事只消费**合法受众投影**。
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
- 旧 revision 的待执行消息/模型结果、因果事件完成后返回的延迟 Task，在新分支接纳前必须按既有 Native Authority 重新验证当前身份/授权/expected revision。

## 7. 当前 main 静态证据与 E0 未解决的消费者

- [Information Contract](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-information-contract.js) 的 `sources/views/actors` 是声明式列表，定义 `belief` 的 `actorField/statusField/channelField`，视图 `audience` 支持 actor/task/narrator 等，当前对未声明 Perspective 不会自动开放。
- [Information Runtime](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-information-runtime.js) 的 `actorAvailability` 对未声明 actor 返回 unavailable；投影 anchor 包含 Session/PackageVersion/Revision/Branch，scope epoch 校验与输出预算，已有严格限制的读取基础。
- [Cognition Authority](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/cognition-authority.js) 验证 cognition 所凭的 exact source refs、合法视图、上下文权限、scope 和版本；[Theory of Mind Authority](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/tom-authority.js) 部分目标 ID 受 `manifest.actors` 限制。动态 NPC Perspective 需审计，而非直接读取所有角色记忆。
- [Memory Eligibility](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/eligibility.js) 由 Host 已选 snapshot、Information 投影和允许来源限定 HCM 读取；不可信源 ID / 用户给的 requester 不能扩大权限。
- [Native Memory Contract](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-memory-contract.js) 已定义受保护记忆角色、生命周期与事实来源 basis；不要再建并行 NPC Memory DB。
- [Native HCM Graph](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/temporal-graph.js) 已支持源证据关联与时间化关系投影，但不能反向赋权给世界事实。
- [SessionCore](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/session-core.js) 与 [SavePointRepo](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/repositories/save-point-repo.js) 提供唯一提交与分支锚点，不能另建跨分支传播日志真相源。

本轮只是 main 静态源核对；没有 Node/CI/UI/Windows/CachyOS/Termux 验证。是否有现成动态 Actor 入口、哪些 Scope/Task 消费者受静态 Actor 限制，需进一步 E0 全调用方审计确认。新方案不扩大或削弱既有安全信任边界。

## 8. W7 候选路线（均未获批准）

| 方案 | 核心模型 | 长处 | 主要风险 |
| --- | --- | --- | --- |
| W7-A · 固定 Perspective 表 + 广播更新 | 人物视角在 Package 预先定义，主要基于公共事件投送信息 | 工程相对简单，适合固定剧本 | 新 NPC 难进入合法视角；秘密/传闻易变成全员可知 |
| **W7-B · 动态受众资格 + 证据驱动信息流（推荐）** | 新 NPC 可以在授权范围获得合法身份限定的视图；消息传播通过可追溯通信/感知链，接受与相信分离；复用已有 HCM/Information/Cognition | 适合涌现式世界、保密、长线一致性与可解释性 | 需要核对静态 Actor 消费者、来源裁剪、动态 Perspective 最小接口 |
| W7-C · 每个 NPC 自有 LLM 私人记忆和自由消息渠道 | 无需精细事件许可，靠模型个人判断保持社会关系 | 表现自由度高 | Token 成本、信息泄漏、分支漂移、双权威与叙事全知风险高 |

**研究建议 W7-B，但用户本轮只确认 W6-B，绝不能把 W7-B 写成已冻结决定。**

## 9. 典型验证情景与继续讨论的分界

**场景**：阿洛在玩家面前承诺保守秘密。米拉通过路人听见错误传言，私下怀疑阿洛；玩家离城三天，阿洛可能写信向米拉撒谎，米拉是否接收/相信取决于通信事件和她的证据/信任；商会秘密在另一个分支中被泄露。必须可以按分支与时刻查询：
- 谁拥有正式的秘密信息、谁只是听到传闻、谁没有消息；
- 客观真相、信件内容、米拉的 belief 三者分别来自什么出处；
- 玩家读档至泄密前，另一条线的消息不能进入这条线；
- 阿洛是运行时新 NPC，是否具有合法的私有视角，不应由名字或访问 Narrator memory 的后门实现；
- 反复传播同一来源在预算/事件约束内处理，不因每轮 LLM 自由重复推送导致无限级联；
- 未提交的谈话计划和未送达的信不能改变对方记忆、已发生的债务和世界政治状态。

**未决接口**：动态 NPC 受众资格/身份 ID 的映射、秘密分级/披露权限、传播延迟与游戏时间、记忆压缩/遗忘的规则、关系与情报联动的最小事件 schema、UI/Inspector 如何展示“NPC 为什么这样认为”。以上待用户决定 W7 大路线以后继续细化。

**Plan 状态**：Draft；只更新 `docs`，不执行产品代码变更、不创建实现分支、不宣称 E0 已通过。


## 10. W7-B 用户确认（2026-10-17）

用户对上一轮推荐的 **W7-B「动态受众资格 + 证据驱动信息流」**回复“认同”。纳入已确认的**顶层设计方向**：

- 新出现的 NPC 只有在世界事实身份经 Native 接纳后，且满足角色/作用域/受众权限时，才能获得独立而合法的 Perspective；**存在资格、认知资格、自主推理资格不混为一谈**。
- 信息以实际感知、交流、投递、获知、采信和更正等有来源的过程流动，不把信息发送、收到和相信等同；既存世界真相仍由单 Native Host/Session 写入。
- NPC 的个人记忆/私有目标、假设和误信基于获授权证据，可持有错误看法；长期 HCM / Information / Cognition 负责相应认知，而非创建第二真相库。
- 受众查询受 Session/Branch/Revision/scope/source 约束，不自动授予叙事者全知，也不在原始 Package Manifest 随意添动态 Actor。

**尚未批准**：动态 Perspective 的确切身份映射及签发接口、记忆条目 Schema、通信的结算原子性、端到端调用方接线、权限 UI、具体传播延迟/衰退参数和实施授权。

**W8 下一轮**：同一 Plan 新模块 [npc-memory-continuity.md](npc-memory-continuity.md)，讨论长期记忆、遗忘/模糊与情境回忆、人格成长、承诺保护、HCM 与 Native Cognition/World 的权限及存储边界。W8 各候选尚未确定，企划仍保持 Draft。
