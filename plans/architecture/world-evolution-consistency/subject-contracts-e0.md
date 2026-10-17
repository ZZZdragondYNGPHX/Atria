# ARCH-DWE-01 · W11 Subject / Actor / Perspective / Participant 契约与 E0 审查（讨论稿）

- Task ID: `ARCH-DWE-01`; Primary Workspace: `docs`; [Plan Index](index.md) · [总体设计](design.md) · [W9 主体身份](entity-identity-authority.md) · [W10 实例化与能力绑定](subject-instantiation.md) · [唯一 Record](../../../records/architecture/world-evolution-consistency.md)。
- 状态：**Draft / W11-B 顶层路线已获用户确认，W12 候选与精确契约未获批准**。已确认 W1-B 至 W11-B；§6 保留当轮 A/B/C 比较作为历史；正式 W11 决定见 §8。
- 目的：结束只谈名词的阶段，厘清**真实世界主体身份、作者角色表达、可访问的认知视角、已提交的叙事参与者、业务领域记录**之间如何接线；建立可以检验的 E0 消费者矩阵，仍不运行修改/测试/开发分支。

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

`SubjectOrigin/SubjectBinding/Grant` 可能部分可计算、部分复用现有 Host state/record；禁止因为上面的对象名称就额外创建独立可写数据库。真正的字段、ID 家族与 default 值必须经 E0 核对已有 Native Contract/Save/Event 后确定。

**Branch invariant**：独立 `subjectId` 不以 branch 前缀作为唯一身份含义。分叉前已登记的 Subject 可继承相同起源与引用，之后的绑定和状态各自按 Revision 查询；分叉后新生 Subject 不自动“同名即同人”。跨 Session 的相同世界定义可以复用 `DefinitionRef`，但不共享 `SubjectRef` 的动态状态。

## 3. W10-B 生效后的四条职责硬边界（选型已确认，接口未确认）

1. **Subject → 可持续存在**：`Entity Admission` 在重要互动/持续影响时经正式 event/effect 确立身份，支持无角色卡的旅馆老板、组织、建筑和物品；低成本临时环境细节不强制注册。
2. **Subject + ActorProfile → 可表达**：模板只提供表达/风格素材。绑定一个已写好的角色卡不能使 Subject 自动成为该模板原有故事人物；同模板多实例仍身份独立，伪装/替身按可见性展示。
3. **Subject + Perspective/Grant → 可获知及思考**：必须验证目前该主体/角色类型存在、活跃作用域、可见 Source、授权、Branch/Revision 与预算。一个未预先声明在 Package 的 NPC 不能通过 `actorId` 字段冒名或使用 Narrator view 读取全局秘密。
4. **Subject + Participant/Action → 可参与故事**：对话真实参与者的追溯应区别于 `assistant` 输出中的引用文本、叙事者、Player Persona；真正影响世界的交易/消息/动作必须有 committed effect 和 receipt。失败或过期模型结果不能留下“说话已发生但事件未发生”的正式后果。

### 3.1 不可省略的三种身份场景

- **角色卡是模板**：同一 AuthoredActor Profile 可呈现两名孪生 NPC，但它们具有不同 SubjectRef、认识的人、私人记忆和生命周期，不是角色卡复用即同一身份。
- **身份秘密**：Host 确认“苍鹰”=“阿洛”是一个 Subject，角色 A 可能只知道前者，角色 B 知道全部；`ParticipantRef` 对内部需准确但对公开输出只能显示本人所知的 alias，不可越权回传原始绑定。
- **世界无角色卡**：新生成的阿洛在赊账事件中正式登记；即使没有 Actor Profile，也应有可控、可解释的最低表达/行为能力，不要求编辑 Package Revision；若无法合法获得 Cognition Perspective，则不能模拟其内心。

## 4. 当前 main 静态 E0 探针（已看见 ≠ 全面验收）

截至 2026-10-17 的**代码静态核对**，只把确实读到的源文件列为明确证据：

| Lane / 核对来源 | 已核对的真实约束 | W11 后续 E0 必答 |
| --- | --- | --- |
| [Native ID families](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/identity.js) | `NATIVE_ID_FAMILIES` 包含 Actor/World/Session/Branch；已读清单没有通用 World Subject 类型 | 是否应最小增加 Subject ID family，如何防跨 session/branch 异常绑定 |
| [SessionCore Timeline](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/session-core.js) | `_newEntry` 验证 `draft.actorId` 必须属于 `base.manifest.actors` | 真实参与者身份和 Actor 表达模板能否安全区分，改哪里才不破坏 committed Timeline |
| [Actor Profile projector](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-actor-profile.js) | 只投影 EntryPoint/Package 声明的 Actor，明确不从 Session 动态读取 | 动态 Subject 的表达/外形/身份预览应在哪里生成受控只读投影 |
| [Information Contract / Closure](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-information-contract.js) | `actors/views` 声明式，`assertInformationClosure` 要求 actors 属于 manifest actors，Actor View 需已声明 ID | 能否在不改 Package 的情况下由 Host 在当前 Revision 内授权动态 Perspective |
| [Information/Cognition/ToM](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-information-runtime.js) / [Cognition](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/cognition-authority.js) / [ToM](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/tom-authority.js) | 有来源/受众与 anchor；部分目标使用 `actor_*` / manifest 受限校验 | 如何扩展最小动态授权而不扩大其他主体对私密信息的读取 |
| [Native Frontend Host ABI](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-frontend-host.js) | `MESSAGE_SCHEMA`/projectConversation 公开 `actorId`；UI/Host 真实消费链需要核实 | 新参与者字段、legacy role 与新语义怎样一次性切换调用方（不保留双轨） |
| [Session Projection / Context Compiler](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/session-projection.js) / [Compiler](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/context-compiler.js) | actor identity 参与 committed fingerprint 与上下文 Actor Profile 编译 | 如何保证已提交文本、人格表达、角色已知信息的同一版本和防串人 |
| [Speech / Visual](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/speech-service.js) / [Visual](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/visual-continuity.js) | Speech 校验 Timeline `actorId` / expression Actor；Visual 当前兼有 manifest actor 与 provisional identity 逻辑 | 定义的 SubjectRef/ParticipantRef 如何接入语音、视觉连续性而不泄密、误合并或覆盖旧素材 |
| [Agent Intelligence Goal](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/agent-intelligence/goal-contracts.js) | `subject.kind === actor` 时要求 Native `actor` ID 且受 rp_session scope 限制 | Goal/Intention 是否对应 World Subject 还是 Perspective/Task Agent，改动范围与预算如何界定 |
| [Lifetime / HCM](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/lifetime-authority.js) / [HCM Graph](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/temporal-graph.js) | life.person 是域内局部 ID；HCM Entity 可依据来源候选、合并、分拆、待决 | 何时可以与官方 Subject 映射？HCM 相似姓名/未确认记录不可变真相 |

### 4.1 E0 未完成清单

- 以上是**部分定位和静态证据**，不表示枚举了全部调用方、API、构建系统和 UI 入口；尤其 Native Orchestration/V3 Plan/Run/Effect/Receipt/Projection 等消费者及迁移状态需独立核实。
- 逐个定位真实读写调用方、字段形状/校验链、单 Host 写入入口、跨端消费者，以及各自应更新/清退的旧契约；不能靠改一份 Schema 就称全链通过。
- 检验隐私模型：Role/Subject/Capability 的伪造、同名 HCM 合并、跨 Session/Branch/Save、作者秘密 Canon、模型响应日志和 Visual/Speech 的读权限。
- 核查版本固定与 idempotency/receipt 的真实原子出版行为；接受与拒绝事实时 Timeline/世界事件/个人认知不得分裂。
- 真实验收包括纯文本 RP、无 World 入口、多 World、作者预设与无 Profile 新 NPC、两人同名、秘密别名、死亡/改名、长会话预算、跨 Save/Branch、Windows/CachyOS/Android Termux。此处未执行任意构建、测试/CI/真机。

## 5. 分级的接口/能力接纳矩阵（候选权限模型）

| Subject 当前能力 | 可使用的身份和信息 | 禁止越权 |
| --- | --- | --- |
| 仅正式存在 | stable SubjectRef、当前世界状态与可公开事实 | 不授 Cognition/Task 身份，不读取别人记忆 |
| 表达（Presentation） | 可选表达模板或受控运行时描述，受众可见 alias | 不因绑定 ActorProfile 自动获授权 Source/ToM |
| 私人认知 | 有效 Perspective Grant、本人证据、认知状态/记忆 | 不读 Narrator 未披露真相、其它 NPC 的私人目标 |
| 受限规划 | 在 actor-legal 情景中有界 Task / Simulation 输入 | 模型输出不自行提交 World Effect，不越过规则和玩家自主权 |
| 世界行动 | 通过合法 Native transaction + Branch/Revision 校验产生结果 | 不跳过 Receipt/回档约束，不让过期任务写入新分支 |

可见别名并非 canonical identity 本身；Narrator/内部 Host 能知晓的真实映射不自动出现在玩家的 Participant UI。

## 6. W11 选型（均未获用户批准）

**W11-A · Actor 全域一体化**：将所有世界人物和其它实体接入 `actorId` 与 static Actor Contract，所有玩家、NPC、现实物件也尽量通过 Actor 入口使用。表面字段统一，但混合了世界存在、表达模板、私有认知与社会权限，且 Static Manifest 被迫承载无穷涌现对象，原则上不推荐。

**W11-B · Typed Subject / Participant / Perspective + Host Capability Resolution（推荐）**：保留 W9/W10 已选的 Canonical Subject、Authored Definition 和模板边界；以少量有类型的“主体身份、正式参与者、合法认知视角、可选表达模板”引用，均由**现有** Native Session Host 结合确切 Revision 和受众权限解析/授权。底层只增加实际缺失的最小合同与调用方字段，保留现有能复用的 Memory/Cognition/Simulation/Authority。隐私与语义最清楚，但需要一次性审查并改造与旧 `actorId` 深度耦合的真实消费者。

**W11-C · Narrator 代演 + 角色上下文适配**：世界主体存在于 World State，但 Timeline、表达和个人认知多数维持原 `actorId`；Narrator 使用 Prompt/映射表临时转换为人物声音。改动少，仍会导致身份/权限两套心智模型，难保证已提交参与者、社会事件和私人认知一贯一致。

**推荐 W11-B（尚未获用户选择）**。设计继续把确切 ID 家族、ABI 字段、Owner、Capability grant 的持久化/撤销、E0 cutover 顺序列为待决；不要提前从推荐推断已批准正式实现。

## 7. 交付前置与下一轮收口问题

1. **身份与实例化**：Subject ID 在 Session 里是全局稳定还是 World-scope + Session 稳定？Worldless/Multiworld/同一 Profile 多实例时怎样确定约束？
2. **Conversation**：`Timeline.actorId` 是作者模板身份、真实叙事参与者，还是两者已混用？目标 ABI 是否需要 `participant` 与 `expressionSource` 分开；哪里才是正式说话/参与事件边界？
3. **Perspective**：能否在冻结 Package `informationRuntime.actors/views` 前提下生成合法动态受众视图？若不能，应该在何种**受 Host 控制的动态授权投影**做最小修改，而非写死新的高优先级权限表。
4. **Bindings**：如何将 HCM Pending Entity、Lifetime Person、Visual identity 及 Goal actor 安全映射而不误改变业务所有权或暴露秘密；证据不充分的映射要能保持 unresolved。
5. **事务与身份**：如果一个新的 NPC 参与会改变世界的对话、签订合同、借款、移动位置，在什么 Native transaction 边界内一并登记其 Subject、Participant、实际 Event 与 Receipt，失败和回档怎样处理？
6. **E0 Gate**：列全受影响生产调用方与 tests/文档/Studio/Play 实际界面，不把当前部分静态审查称为 E0 已完成；界定阶段验收条件和 cutover 无兼容双轨路线。

下一轮讨论后可继续扩展 E0 Consumer Map、Source-of-Truth Matrix、Safety/Correctness Gates，但只有用户明确批准方案定稿与开发启动后才执行实现。整个 ARCH-DWE-01 **始终保持 Draft**。


## 8. W11-B 方向确认（2026-10-17）

用户对上一轮明确推荐的 **W11-B：Typed Subject / Participant / Perspective + Native Host Capability Resolution** 答复「认同」。将其纳入 ARCH-DWE-01 已确认的**顶层设计方向**（W1-B 至 W11-B）。

确认的具体**设计原则**：
- 正式存在的 World Subject、作者 Actor/Profile 表达资源、合法的个人 Perspective/Capability、已提交对话/事件的 Participant 是有类型的不同语义，必须通过既有单 Native Session Host 的受控读/写边界关联。
- 不能让 `actorId` 同时充当所有世界对象、作者资产、玩家权限与私人认知的单一万能身份，不能靠临时 Narrator 代演冒充已提交 NPC 状态。
- 权限必须绑定当前 Session/Branch/Revision、作用域、来源、主体与受众；表达模板绑定、Person/Lifetime/HCM 证据映射或模拟精度升级均不得自行授权他人秘密、写入世界真相或替玩家行动。
- 正式实施时需对与 `actorId` 耦合的真实消费者逐一改造与清退；避免在 Dev 项目中长期保留旧/新双写或 Shadow World/Actor Registry，不应因选择 W11-B 就预设需要若干新服务。
- 准备 E0 的局部代码审查不能视为**完整 E0 已通过**：具体 ID family、ABI 字段、Capability grant 生命周期、Event/Receipt 原子出版、Game-time 时态与 cutover 验收仍未冻结；本轮不修改产品代码。

**下一轮 W12** 转入同一 Plan Bundle 的 [e0-consumer-cutover.md](e0-consumer-cutover.md)：对现有 Actor/World/Knowledge/Simulation/Cognition/HCM/Prompt/Visual/Speech/Save/Branch/Library/Studio/Play 建立 Source-of-Truth/Consumer/Write-path 审计矩阵，讨论如何以 E0 阻塞为入口、最小契约、一条 Native commit 权威和硬切消费者推进，研究推荐 W12-B、**尚未由用户选择**。整份 Plan 保持 Draft。
