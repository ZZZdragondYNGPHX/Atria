# Atria Native Experience Modes & Capability Deepening — Case Study 04 — zhushen-space

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 二十七、案例压力测试 04 — `zhushen-space`（完整 Web AI RPG / Shared Runtime）

### 27.1 样本定位

本轮样本：

- Repository：`1102052563-a11y/zhushen-space`
- 当前审计基线：`master@7af6f3898dc9a25123fc47109cd3f34decc003c6`
- 主应用：`zhushen-space/zhushen-space/`
- 技术形态：Vite + React 18 + TypeScript + Tailwind + Zustand
- 独立联机后端：Cloudflare Worker + Durable Objects
- 当前主应用 `src/` 约 819 个源码文件；
- 仓库还包含多人后端、世界详情工坊、多个 WIKI / 世界知识资源、预设与大规模静态内容。

它已经不是“角色卡”或“重前端卡”。

真实产品形态更接近：

> **一个独立 Web AI RPG + 本地单机 Runtime + 云端共享服务 + 多人房间 Runtime + 玩家社区内容平台。**

因此它对 Atria 的价值，主要不是继续验证 Component / Battle / Inventory / Message UI，而是第一次系统性压力测试：

> **当 Native Experience 离开“一个玩家的一份 Session”以后，Authority / Identity / Revision / Transaction 应该怎样继续成立。**

本轮仍然只吸收产品能力，不复制：

- Zustand / localStorage；
- IndexedDB；
- Cloudflare Durable Object API；
- WebSocket 消息名；
- host snapshot relay；
- generic relay；
- 客户端 pid；
- React / Tailwind 实现。

同时，本仓库部分设计文档已经落后于当前代码。

例如早期联机说明仍描述来宾脱队后在本地独立生成支线，而当前 `MultiplayerPanel.tsx` 已明确改为：

> 分头行动仍由房主统一写进同一份正文，不再各端独立生成，以避免剧情冲突 / 瞬移 / NPC 不同步。

因此本轮继续遵守：

> **当前代码 > 历史设计文档。**

### 27.2 第一结论：29 项此前仍然隐含了“单玩家 / 单 Session”假设

银麒压力测试已经把 Session 内部拆成 World、Session Application、Activity、Local UI、Message Local、Player Preference，并补齐 Perspective、Auxiliary Task、Temporal、Model Task、Add-on、Media。

但这些设计仍默认：

```text
一个玩家
    ↓
一个 Native Session Revision Graph
    ↓
Package Runtime
```

`zhushen-space` 明确出现了两类此前无法干净归类的 authority：

1. **跨多个 Session / 新游戏仍然有效的玩家游戏事实**
   - 账户仓库；
   - 纪念丰碑 / 英灵传承；
   - 公会身份摘要 / perks；
   - 跨存档解锁 / 继承资产。

2. **多个真人共同拥有或参与的共享游戏事实**
   - 联机房间；
   - 公会；
   - 全局交易行；
   - 在线竞技场排行；
   - 公共共享状态 / 回合 / 战斗；
   - late join / reconnect。

它们都不是 Player Preference、Package Data 或 Session Application State。

因此本样本正式新增两个顶层能力域。

### 27.3 新缺口 30 — Player Continuity State / Account Authority Domain

`zhushen-space` 的账户仓库明确设计为：

- 不属于任何单独存档；
- 新游戏不清空；
- 后续存档可以取回；
- 可选云同步 / 跨设备。

纪念丰碑同样允许一局中的主角 / NPC 变成玩家长期传承，后续新存档再物化成 NPC。

公会摘要进一步证明 membership / rank / perk 是跨存档玩家身份，而且会反过来影响当前单机 Session 的机械结算与 Prompt projection。

这已经不是 Preference。

因此新增：

> **Player Continuity State / Account Authority Domain**

它回答：

> **“属于这个玩家、跨多个 Session 持续存在，而且会影响游戏规则的事实存在哪里？”**

候选 contract：

```text
PlayerContinuityDomain
├─ domainId
├─ packageFamilyScope
├─ schema / version
├─ revision
├─ commands
├─ events
├─ reducers
├─ indexes / retention
├─ exposure policy
├─ optional cloud binding
└─ migration policy
```

典型内容：

- meta progression；
- account vault；
- unlocked legacy content；
- long-lived achievements；
- inheritable character / entity archive；
- player-owned persistent collection；
- guild membership reference；
- package-family level unlock。

它不是：

- account settings；
- render preference；
- API Key；
- Secret；
- browser localStorage；
- 一个 “global variables” 桶。

### 27.4 Player Continuity 与现有 State 的关系

此前 §26.11 的状态分类需要扩展。

现在至少区分：

1. World State；
2. Session Application State；
3. Activity State；
4. Local UI State；
5. Message-local UI State；
6. Player Preference State；
7. **Player Continuity State**。

Player Preference 回答：

> 玩家喜欢怎样显示 / 操作？

Player Continuity 回答：

> 玩家跨局究竟拥有什么 / 解锁了什么 / 属于什么长期组织？

因此：

> **“跨 Session”不能再自动等于 Preference。**

Player Continuity 可以 local-first。是否登录账号、是否使用云同步，是 Host storage / identity policy，不应成为 Package contract 的前提。

### 27.5 Player Continuity 拥有自己的 Revision，不跟单个 Session Branch 回滚

Player Continuity 不能挂在某一个 Session Revision graph 下面。

更合理的是：

```text
Player Continuity Revision Graph
        │
        ├─ Session A references / transacts
        ├─ Session B references / transacts
        └─ Shared Realm references / transacts
```

每个 Turn / Task 若读取 Player Continuity，应在 Effective Context / provenance 中记录：

- exact player-domain revision；
- exposed projection；
- relevant receipt refs。

这样历史生成仍可解释：

> “当时为什么认为玩家已经拥有这个传承 / perk？”

但恢复某个旧 Session Revision：

> **默认绝不能把 Player Continuity 一起倒回去。**

这是一个独立 authority。

### 27.6 跨 Authority 的资产转移需要 Transaction Receipt / Saga

账户仓库暴露了一个 SessionCore 单 Revision 无法解决的新问题。

例如：

```text
Session Inventory
        ↓
存入 Account Vault
```

这是两个不同 authority domain 之间的 ownership transfer。

如果简单先扣后加，第二步失败会丢物；先加后扣则可能复制；Session Branch 回退还可能让已经存入 Vault 的物品重新出现。

因此 #7 Action v2 的 receipt / compensation 需要扩展为：

> **Cross-Authority Transfer Contract**

概念模型：

```text
TransferIntent
├─ transferId / idempotencyKey
├─ source authority + revision
├─ target authority
├─ entity / asset lineage
├─ payload / quantity
└─ policy

prepare / reserve source
        ↓
apply target
        ↓
finalize source
        ↓
committed TransferReceipt
```

具体实现可以是 two-phase、saga + compensation 或 server transaction，但 Package 不接触底层差异。

冻结规则：

- 同一 entity lineage 不能被重复 claim；
- retry 必须 idempotent；
- partial failure 必须可诊断 / 可补偿；
- Session Branch restore 不能静默复制已经 externalized 的资产；
- restore 时 Host 必须依据 external transfer receipts 做 ownership reconciliation；
- Realm / Player / Session 间的 reward、trade、vault transfer 都复用这套语义。

### 27.7 新缺口 31 — Shared Session & Realm Runtime / Multi-participant Authority

当前 Atria `main@4dab353a` 重新检索后，没有发现 multiplayer room、participant / spectator、shared Session、guild / realm authority、shared ladder / trade runtime。

因此这不是文档遗漏，而是真实缺口。

新增：

> **Shared Session & Realm Runtime / Multi-participant Authority**

它需要覆盖两个 scope。

#### Shared Session

实时 / 短中期共同体验：

- co-op room；
- party；
- raid；
- shared battle；
- shared narrative session。

#### Realm Domain

长期异步共享游戏事实：

- guild；
- marketplace；
- ladder；
- public economy；
- shared base；
- world service。

两者不是同一份数据，但应该共享 identity、ACL、typed Command、Event、Revision / sequence、reconnect、idempotency、server/coordinator validation 与 diagnostics。

候选总模型：

```text
SharedAuthorityDomain
├─ domainId
├─ scope
│  ├─ shared_session
│  └─ realm
├─ participants / members
├─ roles / capabilities
├─ schema
├─ revision / event sequence
├─ commands
├─ events
├─ reducers
├─ snapshots + cursor
├─ deterministic RNG policy
├─ retention
└─ transaction hooks
```

### 27.8 Host 可以有协调权限，但不能成为“任意快照真源”

样本当前联机采用“房主权威 + 服务器中继”，RoomDO 允许房主直接 publish world snapshot / combat snapshot。

这是该项目当前工程取舍。

Atria Native 不应照搬成：

```text
host.publishWorldSnapshot(arbitraryJson)
```

Atria 应把“房主”理解成：

> **一种拥有更多 Command capability 的 participant role。**

共享 authority 仍应：

```text
participant intent
→ authenticated typed Command
→ shared validator / rule
→ Event
→ Shared Reducer
→ Shared Revision
→ projections
```

如果运行环境采用 host-authoritative peer mode，Host Runtime 可以执行 validator / reducer，但输出仍是标准 Shared Event / Revision。

若使用 server-authoritative mode，server 执行同一 declarative contract。

因此 Package 不需要知道底层是 Durable Object、LAN Host 还是其它协调器。

### 27.9 Participant Identity 与 Display Identity 必须分开

本样本早期联机后端直接依赖客户端 pid，后续又引入 chatToken / uid / displayUid。

这再次验证 §26.95 的 Canonical Entity Identity。

Shared Runtime 应使用：

```text
PlayerRef
├─ provider / realm scope
└─ opaque player id
```

Display Projection 才包含 nickname、avatar、display number、badge、local alias。

Package：

- 不生成 canonical player id；
- 不读取认证 token；
- 不读取 OAuth / Discord credential；
- 只拿 Host 给出的 scoped PlayerRef 与 capability projection。

可以允许 ephemeral anonymous / LAN identity，但 Host 必须显式标注较低 trust level。

### 27.10 Multi-participant Turn Contract

单玩家 Package Turn Contract 还需要增加多人形式：

```text
Shared Turn Open
        ↓
participant input slots
├─ P1 input
├─ P2 input
├─ P3 input
└─ spectator = read-only
        ↓
ready / timeout / skip policy
        ↓
Shared Resolution
        ↓
one committed Shared Outcome / Revision
        ↓
per-participant Presentation
```

需要声明：

- who may submit；
- required / optional participant；
- ready policy；
- deadline / timeout；
- replace-own-input-before-close；
- AFK / skip；
- host / leader override；
- cancellation；
- ordering；
- turn provenance。

这深化 #10 Package Turn Contract、#11 Turn Envelope、#24 Operation lifecycle 与 #29 Temporal Runtime。

### 27.11 多人多视角必须是“一份 Truth，多份 Perspective / Presentation”

这是本样本非常有价值的一次自我纠错。

旧方案允许来宾脱队后各端用自己的模型独立生成完整支线；当前代码已经把它收窄为同一个共享叙事 / authority 中分别描写，再自然汇合。

Atria 应直接冻结：

> **多人 Experience 可以拥有多个 Narrative / Presentation，但不能因此拥有多个互相漂移的 World Truth。**

推荐：

```text
Participant Inputs
        ↓
Shared semantic resolution
        ↓
Shared authority commit
        ↓
Perspective Projection(player A)
Perspective Projection(player B)
        ↓
Narrative / Message Projection A
Narrative / Message Projection B
```

若使用不同玩家自己的模型：

- 每位玩家可以拥有自己的 Model Execution Lane；
- Host 不共享 Secret；
- secondary POV task 只获得 presentation authority；
- 它不能修改 Shared World / Realm State。

对于开放式 narrative-outcome，先形成共享 semantic outcome / authoritative scaffold，再做 per-participant prose。

### 27.12 Split Party 应是 Scene Scope，不是复制一份 World

长期需要支持队伍分头、平行地点、独立 encounter、再汇合。

但 Native 不应：

```text
clone World A for player 1
clone World B for player 2
later JSON merge
```

候选：

```text
Shared Session
├─ World Authority
└─ Scene Scopes
   ├─ scene:party-a
   ├─ scene:party-b
   └─ scene:solo-c
```

每个 Scene 可以拥有 active participants、local Conversation、Activity、Perspective、local Turn cadence。

但 durable World change 仍提交进同一 Shared Authority graph。

汇合时合并的是 scene participation、observations、Perspective knowledge 与 presentation，而不是 merge 两个 arbitrary world snapshots。

### 27.13 Presence 与 Authority 必须分开

Shared Runtime 还需要 **Presence Projection**：

- online / offline；
- reconnecting；
- typing；
- submitted；
- ready；
- spectating；
- AFK；
- current scene。

默认 Presence：

- transient；
- Host-owned；
- 不进入长期 World；
- 不因为断线就删除 Player Entity。

只有 Package 明确把某类 presence 行为变成 gameplay event 时，才通过 typed policy 转成 authority event。

### 27.14 Late Join / Reconnect 应使用 Snapshot + Cursor

样本已经需要 room state、latest world snapshot、transcript、combat snapshot、player snapshots 与 comment backlog。

Atria 应抽象成：

```text
Shared Domain Snapshot @ Revision N
        +
event / presentation cursor after N
        ↓
late join / reconnect
```

必须：

- idempotent；
- participant identity stable；
- reconnect 不生成第二个角色；
- historical event 不重新执行副作用；
- old Operation progress 不被当成新 Task；
- projection backlog 与 authority replay 分开。

### 27.15 Realm Domain：公会、交易行、竞技场不是“联网 UI”

这些模块共同证明：

> **有些游戏事实不属于任何一个实时房间。**

Guild 包含真实玩家 membership / role / shared chest / tasks / contribution / perks / chronicle / guild war / base。

Trade / Market 包含 listing / offer / escrow / settlement / history。

Arena / Ladder 包含 participant card / rank / challenge / deterministic seed / match result / shared leaderboard。

因此 Shared Runtime 必须支持长期异步 Realm Authority：

- 不因某个 Session 关闭而消失；
- 不因某个玩家 Branch restore 而回滚；
- 可被多个 Session / Player 同时读取和提交；
- 必须有独立 revision / sequence / concurrency policy。

Guild perk 进入单机 Session 时，Session 读取的是 Realm Authority 的受控 projection，不能复制成另一份本地真源。

### 27.16 Shared Deterministic Logic 必须可在 Authority Host 重放

在线竞技场的“战力 + seed → 结果”证明一个正确方向：

> 能确定性计算的 shared rule，不需要用 LLM 当裁判。

Atria 的 Shared Runtime 应复用 declarative Logic / Rule / deterministic RNG。

```text
ruleset version
+ committed inputs
+ RNG seed
        ↓
deterministic evaluator
        ↓
Shared Event
```

这样 server、host-authoritative runtime、Studio 都可以 replay / verify。

Package JS 仍然不是 server logic。

### 27.17 Cross-Authority Matrix

经过本样本后，Atria 的状态/权威图应扩成：

```text
Package Immutable
├─ Package Data
├─ Knowledge
└─ Asset / Add-on

Player Local / Non-authoritative
├─ Local UI
├─ Message-local UI
└─ Player Preference

Session Authority
├─ World State
├─ Session Application State
└─ Activity settlement

Player Continuity Authority
└─ Player / Account gameplay domain

Shared Authority
├─ Shared Session
└─ Realm Domain

Host Runtime Projection
├─ Operation
├─ Presence
├─ Environment
└─ Diagnostics
```

Exposure / Information-flow 继续与这些层正交。

所以：

- Player Continuity 不自动进 Prompt；
- Realm State 不自动对所有 actor 可见；
- Presence 不自动成为 World Truth；
- Shared World 不自动泄漏给每个 POV。

### 27.18 参谋进一步冻结 Model Task 的 Proposal Artifact

`zhushen-space` 的“参谋”值得吸收，但不需要第 32 项。

它的优秀点是：

> **模型可以提出结构化修改建议，但建议本身没有 authority；玩家 Apply 后才重新走正式写入链。**

第 27 项 Model Task 的 `advisory` Result Policy 应正式支持 **Proposal Artifact**：

```text
ProposalArtifact
├─ proposalId
├─ taskId
├─ targetRef
├─ anchorRevision
├─ proposalType / schema
├─ payload
├─ preview
├─ applyActionRef
└─ status
   ├─ draft
   ├─ accepted
   ├─ rejected
   ├─ stale
   └─ applied
```

规则：

- 生成 proposal ≠ 修改 state；
- Apply 时重新 validate target / revision；
- stale proposal 不静默套到新状态；
- 用户可 edit / reject；
- Apply 最终仍调用 typed Action / Command；
- 历史 proposal 不应继续作为“已发生事实”进入 Model Context；
- Context 应读取 committed current state。

可复用于 AI Quest / Skill 设计、Health repair suggestion、Studio assistant、Craft recommendation 与 Add-on conflict resolution。

### 27.19 Branch facade 应升级成 Branch Graph / Timeline Explorer

样本把 regenerate 弃稿、rollback 弃线、manual bookmark 全部保留成可恢复时间线，并提供 origin、pin、note、preview、visual graph、orphan branch。

Atria 底层 Revision / Branch 已比“整存档复制”更适合。

所以 #15 深化成：

> **Reply Variant / Branch Graph facade**

长期 UX 应支持：

- graph / timeline；
- branch origin；
- named / pinned；
- preview digest；
- current branch；
- abandoned attempt；
- orphan / detached lineage；
- jump / fork；
- branch delete / archive policy。

UI 构图只读 Branch metadata，不需要为了画树加载每个完整 Revision snapshot。

对于已经 externalize 到 Player Continuity / Realm 的 side effect，Branch Graph 必须显示 external-effect marker / receipt；Restore 不得伪装成它也能把外部 authority 一起撤销。

### 27.20 World / Scene Scope 应成为 Session Domain 的正式 lifecycle

该项目必须自己实现离开世界 freeze、重入 thaw、跨世界记录、world-only 记录与旧记录兜底。

这说明 #28 Typed Session Application State 还需要 **Scope Lifecycle**：

```text
ScopeRef
├─ session
├─ world:<WorldRef>
└─ scene:<SceneRef>

Scoped Record
├─ scopeRef
├─ lifecycle
│  ├─ active
│  ├─ suspended
│  └─ archived
└─ retention policy
```

Package 不应为了“离开世界后看不到任务”而物理搬数组。

Host / Data Projection 应让所有 query 自动遵守 scope，避免多个读取点各自记 filter。

### 27.21 社区创意工坊深化 #25，但不是 Shared Gameplay Authority

样本 Workshop 允许分享 Skill、Talent、Title、Equipment、NPC、Character Card、Skill Tree、Creation Template、Loadout、Craft Process、Worldbook。

下载后本地会重建 ID、复用正式 install action，并对某些内容重新 sanitize；社区内容不能绕过本机规则。

因此 #25 Native Add-on / Content Extension Layer 增补：

- Community Content Registry；
- exact content hash；
- version；
- contribution kind；
- publisher identity / provenance；
- local compatibility validation；
- import-time sanitizer；
- local identity remap；
- optional moderation / trust metadata。

下载内容后，它变成玩家本地明确安装的 exact Resource / Add-on revision。

不能：

- 远端修改后本地静默变化；
- 社区 payload 直接成为 World authority；
- 社区资源携带 executable JS；
- 绕过 Base Package extension point / balance validator。

单独一件 Skill / Template 也不必强行包装成完整 Add-on，可作为 typed shareable Resource。

### 27.22 TTS / Actor Voice 继续归入 Media

样本支持 Web Speech / Edge TTS、多角色音色、NPC voice preference、rate、playback。

因此 #18 / #22 的 Audio 应明确包含 **Speech / Actor Voice Projection**：

```text
SpeechRequest
├─ text / MessageRef
├─ actorRef?
├─ voice intent / binding
├─ locale
├─ rate / accessibility preference
└─ cache policy
```

实际 provider / engine 仍由 Host / Player 配置。

Package 不直接调任意 TTS HTTP、不读取 key、不上传脚本语音引擎。

Speech 仍是 presentation，不是 World authority。

### 27.23 Agent 正文模式不新增 Experience Runtime

该项目还有完整 Agent workspace、tool loop、read-before-edit、commit barrier、reviewer、sub-agent、skill package、mid-run guidance。

这些本身很有价值，但 Atria 当前已经有一等 Agents / Orchestrator / Project Agent / Workspace / Review boundary。

因此不重复新增 Agent Mode。

本样本只进一步验证：

- provisional artifact 与 committed artifact 必须分开；
- Tool / Model result 没有 commit 就不成为 Timeline fact；
- user guidance 属于 Operation input，而不是直接改 committed output。

这些已被 Turn Contract、Scoped Operation、Model Task 与现有 Agents 覆盖。

### 27.24 本样本正式新增第 30 / 31 项

经过完整压缩，本样本只有两个能力不能被此前 29 项解释：

30. **Player Continuity State / Account Authority Domain**  
31. **Shared Session & Realm Runtime / Multi-participant Authority**

其余新发现均为现有能力深化：

- Advisor → #27 Proposal Artifact + #7 typed Apply；
- Branch Tree → #15 Branch Graph facade；
- World freeze/thaw → #28 Scope Lifecycle；
- Workshop → #25 Community Content Registry；
- TTS → #18/#22 Speech Projection；
- Multiplayer POV → #26 Perspective + #9 Projection；
- Shared turn → #10/#11；
- deterministic online arbitration → existing Logic/Rule + #31；
- Agent workspace → existing Agents / Scoped Operation。

因此最新能力主表调整为 **31 项**：

1. Component Model v2；
2. Local UI State；
3. Player Preference State；
4. Package Data Resource；
5. Data Projection / bounded data & graph query / Scene Projection；
6. Native Composer Host capability；
7. Action v2 / Command Surface + idempotency / receipt / compensation；
8. Declarative Mutation authoring shorthand；
9. Message Projection；
10. Package Turn Contract + bounded synchronous Turn Stage；
11. Turn Envelope；
12. narrative-outcome policy；
13. Runtime Automation / World Process Recipe；
14. Opening Phase / Variant + conditional Wizard；
15. Reply Variant / Branch Graph facade；
16. Conversation Presentation + Scoped Conversation Thread；
17. Host advanced presentation/input + capability negotiation；
18. Safe Appearance / Motion / Media / Speech Presentation；
19. Studio visual authoring v2 + Scenario Simulation / Test Bench；
20. Experience Health / Diagnostics / Repair / Migration；
21. Activity Runtime / Transactional Subscene + Outcome Narrative Handoff；
22. Native Media / Scene Host；
23. Immutable Asset Pack / Heavy Resource Delivery；
24. Auxiliary Task / Background Model Job Runtime；
25. Native Add-on / Content Extension + Community Registry；
26. Epistemic / Actor Perspective Projection；
27. Package Model Task / Generation Task Contract + Proposal Artifact；
28. Typed Session Application State / workflow & thread domains + Scope Lifecycle；
29. Temporal Runtime / World Clock & Schedule；
30. **Player Continuity State / Account Authority Domain**；
31. **Shared Session & Realm Runtime / Multi-participant Authority**。

仍然不是最终冻结答案。

### 27.25 `zhushen-space` 最重要的架构启发

《瀚海》证明 Native Experience 会成长成独立 Game Application。

《天书江湖录》证明 Package 需要 Activity / Command / Add-on，而不是更大的 Regex UI。

《银麒赎世》证明一个单玩家 Game Application 内部必须拆开多 State Domain、多 Model Task、多 Perspective 与长期 Runtime。

而 `zhushen-space` 进一步把边界推到：

> **一个成熟的 AI RPG 不一定只属于一份存档，也不一定只属于一个玩家。**

因此 Atria 的长期 Native 架构不能永远假设：

```text
Player == Session owner
World == one local runtime
Branch == all authority in existence
```

更完整的图已经变成：

```text
Package / Add-on / Assets
          ↓
Player Continuity Authority
          ↓
Session / World Authority
          ↓
Shared Session Authority
          ↓
Realm Authority

+ orthogonal:
  Perspective / Exposure
  Model Tasks
  Operations
  Temporal
  Presentation
```

但这不意味着所有游戏都必须联网。

- #30 可以完全 local-first；
- #31 只有声明 multiplayer / realm feature 的 Package 才需要；
- 普通单机 Package 不承担任何网络复杂度。

真正冻结的原则是：

> **当 Package 选择进入跨局或多人能力时，Atria 必须提供正式 authority contract，而不是迫使作者重新发明 localStorage、WebSocket、host snapshot 和对账脚本。**
