# ARCH-DWE-01 · Subject、Participant、Perspective 与表达契约

[唯一入口](index.md) · [实现分工](e0-preflight-execution.md) · [同一 Record](../../../records/architecture/world-evolution-consistency.md)。**Draft / Paused**，本次仅整理文档；已确认方向为 **W11-B：类型区分、原 Host 能力解析**。本模块保留功能与逻辑合同；旧源码片段仅为背景，具体字段按原实现接线。历轮比较与确认历史见 Record。

## 1. 五种语义各自回答什么问题

| 逻辑类型（非已实现 API） | 问题 | 归属 / 不负责的事 |
| --- | --- | --- |
| **SubjectRef** | 这次游戏世界中究竟是哪一个可追踪对象？ | Native Session/Branch/Revision 的已提交实体身份；不必是人物，也不表示可说话或有独立 Agent |
| **DefinitionRef** | 它源自哪个固定的世界定义/起始事实？ | World/Package/EntryPoint 固定版本；不能被 Session 游玩反向改写；动态 Subject 可以没有定义来源 |
| **ActorProfileRef / ExpressionRef** | 如何描述和表达此角色？ | 预设 Actor 模板或受权限控制的运行时表达资料；不代替世界身份，也不自动提供读心/授权 |
| **PerspectiveRef / CapabilityGrant** | 以这个身份可以知道、记住、推断、做哪些任务？ | Native Information/Cognition/HCM/Task 的受众、来源、预算/作用域授权；有 SubjectRef 不自动获得这些 |
| **ParticipantRef / SpeakerRef** | 在哪个已提交游戏事件/对话中，实际谁说了话、做了事？ | exact Session Timeline / Event + Actor/Subject 身份证明；对话的叙事者 role 和故事内的 NPC 台词必须区分，不能把所有引用中的台词自动变成 NPC 原生发言 |

**DomainLocalRef**（Lifetime person、HCM evidence entity、Visual identity、Goal subject 等）不是第六份世界真相，而是在受控用途下指向 SubjectRef 的源引用，允许候选/歧义/受众限定。

核心目标是一个可信的**subject resolution boundary**，不是创建五套数据库，也不是强制所有标识符字符串相同。任何写入由现有单 Native Host Authority 路径完成，读投影按 `session/branch/revision/world scope/audience` 计算。

## 2. 最小候选接口语义（示意，不是既有代码或已冻结 Schema）

```ts
// Logical types only. No new implementation / storage is asserted.
SubjectRef = {
  sessionId, subjectId, worldScope
};
// SubjectRef existence and lineage are resolved from an exact SessionRevision,
// not from a caller-supplied name or a global mutable table.

SubjectOrigin =
  | { kind: "authored", packageVersionId, worldRevisionId, definitionRef }
  | { kind: "emergent", originEventId, admittedRevisionId };

SubjectBinding = {
  subjectRef, kind: "actor_profile" | "lifetime_person" |
                   "perspective" | "hcm_evidence" | "visual" | "participant",
  localRef, sourceRef, authority, effectiveFrom, visibility,
  status: "confirmed" | "candidate" | "disputed" | "revoked"
};

CapabilityGrant = {
  subjectRef, purpose: "observe" | "remember" | "express" |
                       "deliberate" | "act",
  audience, scopeRef, sourceGrants, budgetPolicy, anchorRevision
};

CommittedParticipant = {
  subjectRef, eventRef, participationKind, expressionRef?,
  sourceEvidence, branchId, revisionId
};
```

`SubjectOrigin/SubjectBinding/Grant` 可能部分可计算、部分复用现有 Host state/record；禁止因为上面的对象名称就额外创建独立可写数据库。

**Branch invariant**：独立 `subjectId` 不以 branch 前缀作为唯一身份含义。分叉前已登记的 Subject 可继承相同起源与引用，之后的绑定和状态各自按 Revision 查询；分叉后新生 Subject 不自动“同名即同人”。跨 Session 的相同世界定义可以复用 `DefinitionRef`，但不共享 `SubjectRef` 的动态状态。

## 3. W10-B 生效后的四条职责硬边界（选型已确认，接口未确认）

1. **Subject → 可持续存在**：`Entity Admission` 在重要互动/持续影响时经正式 event/effect 确立身份，支持无角色卡的旅馆老板、组织、建筑和物品；低成本临时环境细节不强制注册。
2. **Subject + ActorProfile → 可表达**：模板只提供表达/风格素材。绑定一个已写好的角色卡不能使 Subject 自动成为该模板原有故事人物；同模板多实例仍身份独立，伪装/替身按可见性展示。
3. 一个未预先声明在 Package 的 NPC 不能通过 `actorId` 字段冒名或使用 Narrator view 读取全局秘密。
4. **Subject + Participant/Action → 可参与故事**：对话真实参与者的追溯应区别于 `assistant` 输出中的引用文本、叙事者、Player Persona；真正影响世界的交易/消息/动作必须有 committed effect 和 receipt。失败或过期模型结果不能留下“说话已发生但事件未发生”的正式后果。

### 3.1 不可省略的三种身份场景

- **角色卡是模板**：同一 AuthoredActor Profile 可呈现两名孪生 NPC，但它们具有不同 SubjectRef、认识的人、私人记忆和生命周期，不是角色卡复用即同一身份。
- **身份秘密**：Host 确认“苍鹰”=“阿洛”是一个 Subject，角色 A 可能只知道前者，角色 B 知道全部；`ParticipantRef` 对内部需准确但对公开输出只能显示本人所知的 alias，不可越权回传原始绑定。
- **世界无角色卡**：新生成的阿洛在赊账事件中正式登记；即使没有 Actor Profile，也应有可控、可解释的最低表达/行为能力，不要求编辑 Package Revision；若无法合法获得 Cognition Perspective，则不能模拟其内心。

## 4. 分级的接口/能力接纳矩阵（候选权限模型）

| Subject 当前能力 | 可使用的身份和信息 | 禁止越权 |
| --- | --- | --- |
| 仅正式存在 | stable SubjectRef、当前世界状态与可公开事实 | 不授 Cognition/Task 身份，不读取别人记忆 |
| 表达（Presentation） | 可选表达模板或受控运行时描述，受众可见 alias | 不因绑定 ActorProfile 自动获授权 Source/ToM |
| 私人认知 | 有效 Perspective Grant、本人证据、认知状态/记忆 | 不读 Narrator 未披露真相、其它 NPC 的私人目标 |
| 受限规划 | 在 actor-legal 情景中有界 Task / Simulation 输入 | 模型输出不自行提交 World Effect，不越过规则和玩家自主权 |
| 世界行动 | 原 Domain 允许的动作、前置状态、玩家授权与正式提交结果 | 不跳过 Receipt/回档约束，不让过期任务写入新分支 |

可见别名并非 canonical identity 本身；Narrator/内部 Host 能知晓的真实映射不自动出现在玩家的 Participant UI。
