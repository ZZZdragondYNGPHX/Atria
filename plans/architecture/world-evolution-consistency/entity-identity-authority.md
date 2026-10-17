# ARCH-DWE-01 · W9 统一世界身份与跨域引用权威（讨论草案）

- Task ID：`ARCH-DWE-01`；Primary Workspace：`docs`；[Plan index](index.md) / [总设计](design.md) / [W8 记忆连续性](npc-memory-continuity.md) / [唯一 Record](../../../records/architecture/world-evolution-consistency.md)。
- 当前状态：**Draft；W1-B 至 W9-B 已获用户方向性确认；W10 的实例化与能力绑定候选及所有具体接口未批准**。此前 §6 的 W9-A/B/C 为原始选型历史，正式确认见 §11；不修改 `main` 或创建实现分支。
- 当前问题：同一个“人”可能同时出现在 World Definition、Package Actor、运行时 NPC、Lifetime、Native Cognition、HCM Entity、Timeline 以及玩家角色卡中；怎样让它们正确地引用同一名世界主体，避免重复身份、名称冲突、权限泄漏和跨分支污染，同时不把各种不同记录都强制转成一个对象/数据库？

## 1. 必须先区分“主体身份”与“各域的表示”

**一个人 / 世界对象的身份可以稳定，但各领域的身份及表达不是同一个概念。**

| 目前或未来概念 | 回答的问题 | 权威归属与注意 |
| --- | --- | --- |
| World Definition Entity | 作者定义了什么人物/地点/物品/组织？ | 作者固定修订，可跨作品显式引用；不等于 Session 中动态状态本身 |
| Session World Entity / Subject | 此时此分支的正式世界成员是谁？ | Native Session/World 状态/事件接纳；持久实体可在运行时涌现 |
| Authored Actor / Character Profile | 用什么已创作角色资料、说话风格、系统表达？ | 固定 Package/EntryPoint 的创作资产和角色能力；不能因名字相同自动与某主体绑定 |
| Lifetime Person / domain record | 生命周期、职务/家庭/区域领域如何跟踪此人？ | 已存在的有规则作用域的域内记录；不能无条件将 local id 当作全局主体身份 |
| Perspective / Cognition Actor | 谁被允许读取何种私有观察、记忆、计划？ | Native Information/Cognition 授权视图；**主体存在不等于受众授权** |
| HCM Entity / graph node | 证据里提到/推断了谁？其名字、关系和来源是什么？ | 有来源的检索、语义消歧与来源图，不能因图中出现就正式“造人” |
| Timeline speaker / participant | 谁在某段已提交对话中发言或参与？ | 必须能追溯合法说话/参与身份；当前 actorId 的可接受对象受 Package Actor 限制 |

**重要**：不要把“一个世界主体只有一个权威引用”误解为“所有系统必须存同一个 ID 字符串、同一份 JSON 文档”。身份可统一引用，信息的所有者、生命周期和权限必须保持独立。

## 2. main 静态审查的真正身份断点（2026-10-17）

- [Native Identity](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/identity.js) 的 `NATIVE_ID_FAMILIES` 有 `actor`、`world`、`session`、`branch`、`revision` 等家族，但读取的清单中**未发现独立的 World Entity ID family**。不能在设计讨论中虚构现成的正式 `entity_*` 契约。
- [Actor Profile](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-actor-profile.js) 的 `projectActorDefinition` 仅读取 Package/EntryPoint 指定的 `manifest.actors`，明确不以动态 Session 状态为输入。预设的 Actor 是作者资产/角色表现入口，不应由 Play 直接修改 Package Manifest。
- [SessionCore](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/session-core.js) 的 Timeline entry `actorId` 校验要求 ID 属于确切 PackageVersion 的 `manifest.actors`。这限制运行时新 NPC 直接以同一种 Actor ID 充当 Timeline speaker；未来是否区分 ParticipantRef 与 ActorRef 需端到端 E0。
- [Lifetime Authority](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/lifetime-authority.js) 使用 `life.person.*` 等局部身份，含引入、职业、继承、死亡和地域记录。它是可选游戏领域中的正式记录，却未证明这些 ID 已成为所有 World/HCM/Actor 消费者共享的主体 ID。
- [Native Cognition Contract](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-cognition-runtime.js) 的 `actor`/情感 `target` ID 使用 `actor_[a-f0-9]{32}` 形状，且多个来源以 Package Actor/声明式 Information 约束视角。不能简单将 `life.person.*` 塞入 cognition，亦不能为运行时 NPC 自动开通全局记忆权限。
- [Information Runtime](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-information-runtime.js) 以 `actors/views` 声明、scope 和 exact Session/Branch/Revision 授权；缺失的 actor 返回 unavailable。
- [HCM Temporal Graph](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/temporal-graph.js) 的节点可由记忆来源自动抽取并使用本地图 ID（常见 `crypto.randomUUID()`），还支持候选、别名、证据合并/拆分，`entityPending` 处理歧义。它的 ID **首先代表一份证据图中的身份假设**，不是 Session 世界主体登记。来源发生修订、误记、同名人物时不能直接由 HCM graph 写 World Truth。
- [Session Repo](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/repositories/session-repo.js) 与 [SavePoint](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/repositories/save-point-repo.js) 已经持有 Branch/Revision 的写入与回溯锚点；新 identity binding 的有效性必须随同一权威提交和分支读取，不能另起跨分支共享 mutable latest。
- [World Revision](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/world-knowledge.js) 已有固定版本 World/Knowledge 资源，但不是完整的运行时主体身份模型；要明确 authored entity 与其 Session 投影之间的匹配/实例化。

以上仅说明**已核验的静态代码事实**。并未完成全部消费者引用与实时 UI/存档/跨端测试；“缺少跨域身份”仅可作为待补齐的语义/调用方路径，不表示项目没有任何实体系统。

## 3. 候选架构：Canonical Subject + Typed Views + Evidence Links

**中心建议（待 W9-B 选择）**：每个在一条 Session 世界里真正存在且需要长期追踪的对象，应有一个**可复用、可审计的 Canonical World Subject 身份**，由现有 Native Host 正式承认；不同领域只是指向它的受控投影或有来源的引用，而不是争相创建各自的“同一个人”的世界真相。

```text
Library/Studio World Definition + Authored Actor (fixed revisions)
            |
       explicit origin / instantiation reference
            |
            v
 Native Session Canonical World Subject [world/person/place/object/...]
  identity + admittedAt + branch ancestry + lifecycle effects
            |
       legally scoped read-only projections / mappings
     +------------+-------------+-----------------+
     |            |             |                 |
 AuthoredActor  Lifetime      Perspective       Narrative Participant
 presentation   domain         Cognition/HCM      voice/action receipts
 binding        record refs     legal views        speaker / observer
     |            |             |                 |
     +------------+------ evidence/lineage -------+
                      HCM Entity Mention
               (may remain unresolved/rumor-only)
```

- Canonical **World Subject** 是“游戏世界认定的同一个对象”的稳定引用，不要求所有人物拥有人工智能、每一个名词都要注册。
- 与其说“统一 ID 格式”，更重要的是**统一身份归属与身份关联的审查路径**：新主体通过 W4-B 的事件/状态接纳获取持久身份；所有真正能改变世界的跨域映射必须由有权限的 Native 操作确立，读取投影可重建。
- `AuthoredActorRef → SubjectRef` 可以是一次明确的实例化绑定，也可能只是可重复使用的人物**表达模板**；相同角色卡不意味着一定只有一个世界实例。重用同一个 Actor 说话风格不等于两名 NPC 是同一个人。
- `LifetimePersonRef`、`PerspectiveRef`、`HcmEvidenceEntityRef` 是不同用途的引用；可经过来源审查链接到 SubjectRef，**不将本地 ID 简单替换为同一字符串**。
- **HCM 的未决身份仍可保持为候选/传闻**。如果“城里流传一个叫阿洛的神秘人”，不能只因记忆库里存在 Entity 节点就从 Native World 中自动创建真实阿洛；名词抽取与世界接纳仍是不同动作。
- 身份映射的类型、来源与有效版本须可解释。绝不可通过“显示名等于阿洛”就擅自绑定。自动语义匹配只负责提出候选，不能获得创建/合并官方主体的写入权限。
- 选择 canonical subject **不等于必须新建全局 EntityRegistry 服务、独立数据库或所有对象的万能超类**。先审核能否依附现有 World State/Session Revision 与具体域的身份/关系数据，确有缺口再制定最小 Schema。
- 不统一所有记忆、Profile、Lifetime 与 World State 的所有权。只有世界主体身份/真实效果属于 Native 已提交状态，各领域保留自己的业务规则。

## 4. 身份的五种常见“看似一致、实则冲突”情况

### 4.1 同名、别名和改名

玩家遇到两名叫阿洛的商人，他们应是不同的世界主体；一名阿洛改名“苍鹰”，其世界主体身份不变。HCM 只能根据合法证据提出候选别名/合并，显示名称不是主键。出现候选冲突时必须保留 unresolved，不能为了“去重”偷改历史。

### 4.2 假身份与秘密真实身份

公开人物“苍鹰”实际是皇帝本人：Host 可以根据作者已确立秘密真相知道其 Canonical World Subject 关系，但没有获得证据的 NPC 只能持有两个未连通身份的**主观认知节点/猜测**。不应因为全局 identity map 已合并，就把秘密实情无条件反映在玩家可见的知识图或 Memory 检索中。

公开的 **alias**、私密真实身份、假身份/冒名者，必须有不同的认知可见性和身份断言来源，不能只放一个全局 `aliases` 列表来“解决”。

### 4.3 预设 Actor 与运行时 NPC

作者写了一张“莱恩”的角色卡，世界中也有莱恩：Studio/Package 可以显式绑定已创作 Actor Definition 到 World Subject Definition；Session 开始时实例化成实际人物，Play 只改变其 World State/认知，不重写作者 Profile。后来 NPC 莱恩遇害，角色卡文本依然是作者原件，而当前有效视图显示已故莱恩。

创作者若把同一 Actor Profile 用作两个双胞胎的对话模板，二者仍是不同 Canonical Subject。同一个 World Subject 也可能按剧情换公开身份或语气投影，因此不能预设 `ActorRef = SubjectRef` 必须一一对应。

### 4.4 跨分支与跨 Session

- **同一 Session** 分叉点前已正式存在的 NPC，其 Canonical Subject 可沿共同祖先继承；之后不同 Branch 上的位置、关系、死亡、秘密与个人认知各自由对应 Revision 得出。
- **分叉后新增**的 NPC 需要无冲突的身份产生机制和事件归属（候选：非可复用 UUID 或由唯一 origin event 派生；最终方案待定），两条分支中都出现“阿洛”并不能证明他们必为同一实体。
- **不同 Session/不同 Package Version** 的同名角色即使源于同一作者定义，也不自动共享动态状态；可显式保留 Authored Definition 的来源/实例谱系以便展示，但避免 `global latest`。
- SavePoint 锚定 exact `Branch/Revision`。从 NPC 注册前存档启动新分支，该分支不应自动拥有另一分支后续注册的 Subject/Perspective；从注册后分叉可以继承其有效起点及过去合法证据。

### 4.5 角色死亡、缺席、升级模拟能力

实体死去、改名、迁居、离开玩家视角、A1 升到 A3，**都不是新实体身份**。只改变其状态、可用 Perspective/Task 权限、行为精度和有效时间。死亡的 NPC 仍应能在合法历史查询中被引用；不能为避免冗余直接删除身份并导致关系悬空。

## 5. 候选身份/来源绑定格式（只表示语义，不是 Schema/API）

```text
SubjectRef:
    worldScope/sessionId + stableSubjectId
    authoredOrigin? (worldRevision + definitionEntity, when applicable)
    admittedBy? (committed event/receipt + revision)
    entityKind (person, organization, place, object, ...)
    validBranchContext (branch/revision/as-of tick as query parameters)

TypedBinding:
    subjectRef + domain (authored-actor | lifetime-person | cognition-perspective | hcm-evidence | timeline-participant)
    localRef + provenance + scope + visibility + effectiveVersion
    bindingStatus (confirmed | candidate | disputed | revoked)

ProjectedActorView:
    subjectRef + legal perspective + approved source grants
    optional persona/expression template (authored, not world truth)
    private cognition/history bounded by requester
```

不要求每种绑定在物理存储中独立占一条记录，关键是单一原生写入和可重建读投影。特别注意 **分支身份引用的语义应先明确再选 ID 格式**：不能因用分支 ID 前缀而将从共同祖先继承的实体误生成两个不同角色，也不能因重用 `actor_*` 让两种来源碰撞。

## 6. W9 三条路线（本轮待选）

| 方案 | 机制 | 优点 | 核心问题 |
| --- | --- | --- | --- |
| W9-A：强行统一所有原生 ID | World/Actor/Lifetime/HCM 全部直接改成一个实体 ID、一个对象 | 名义上的简单 | 混淆证据和真相、固定资源与 Session 实例；会逼迫 HCM 传闻进入世界、破坏现有权限 |
| **W9-B：统一 Canonical Subject + 受控映射/投影（推荐）** | 已提交世界成员有唯一稳定主体引用；各领域维持自身 record/ref，明确绑定来源、时间、Branch、可见性和权限 | 避免双真相与身份重复，同时尊重不同领域的职责；兼容 W1–W8 已定方向 | 需要 E0 全消费者审计、创作实例化与 Runtime speaker/认知入口的实际最小改动 |
| W9-C：完全独立身份，检索时由 AI 猜测合并 | Actor/NPC/HCM/Lifetime 各自维护 ID 和状态，Prompt 按姓名解析 | 初期改动少 | 同名冲突、历史漂移、角色复用、分支泄漏、长期记忆误绑 |

**推荐 W9-B，但并未获用户选择**。这里的“统一”是**世界主体的引用权威统一**，不是给所有子系统引入一份可写中央大表或一个万能对象。

## 7. UI / Studio / Play 的身份体验（候选）

- **Library**：作者可创建独立 World Entity/Actor Profile/Knowledge Source；能看到“引用了谁”，但不强制把每段自由文案实体化。
- **Studio**：可显式将角色卡关联至世界人物定义，管理相同姓名/重复模板等歧义；可预览起始实例、表达 Profile/世界身份/规则状态分属什么权威，并用 Inspector 审查绑定来源。
- **Play**：新 NPC 在产生持续性影响时获正式 Subject，叙事、物品/任务/关系/回忆与个人身份保持一致；历史分支选择时不沿用另一条线的身份/感知/外部行动。
- **Inspector**：显示有权限的 Authored Origin、Session Subject、绑定 Domain/LocalRef、来源 Revision/Event、关联可信度/歧义、差异与有效时间。**普通玩家不应看见 Host 的隐藏真身映射**，以免剧透。
- **轻量编辑**：默认沿用自由文本写作、AI 推荐实体/别名绑定；高级用户才管理冲突或强约束。不是让作者手动录入大量内部 ID。

## 8. E0 必做的接口与验收审查（未执行）

1. **身份/资源契约**：原生 `NativeId` families 与 `WorldRevision`/Package/EntryPoint/Session` 的身份边界、何时需要新的稳定 Subject ID、哪项现有数据已经承担等价责任。
2. **输入/输出消费者**：SessionCore Timeline `actorId`、Actor Profile、Native Context Compiler、generation host/Orchestrator、Visual/Speech 等能否合法引用动态 Participant，而不在 `manifest.actors` 之上做覆盖式兼容。
3. **个人权限**：Information actors/views、Cognition/ToM `actor_*`、Memory/HCM requester 与来源证明，审查动态主体映射是否打开任何跨角色读取、秘密暴露或模型效果写入。
4. **Domain 记录**：Lifetime 人口、家庭关系与 `life.person.*` 等局部域数据，有无既有可复用的跨域身份锚点；拒绝简单重写局部 ID 导致旧历史悬空。
5. **HCM 消歧/同名冲突**：`entityPending`、手动 merge/split、source invalidation、graph evidence 合法性与 Native Subject 正式绑定的 API，防模型自行“合并真实人物”。
6. **Save/Branch**：创生 Revision、分叉祖先身份、事件去重/receipt、分支后映射修订和回档，保证同一 Subject 实体在每条时间线中有符合历史的状态。
7. **不同对象类型**：人、组织、地点、物品的确切 identity/lifecycle 归属；别让可说话角色专用 `actorId` 契约成为所有 World Entity 的错误通用类型。
8. **性能与三端**：动态上百/上千低精度实体时检索、状态增量、存档回放与 UI 的成本，尤其 Windows、CachyOS、Android Termux 的真实证据。当前未运行构建/测试/UI/跨端验收。

## 9. 额外研究参考（仅概念参考）

- [Martin Fowler — Identity Map](https://martinfowler.com/eaaCatalog/identityMap.html)：避免一次工作单元把同一已持久对象加载成多个相互冲突的内存副本；这是**事务级内存身份管理模式**，不是 Atria 现成的跨域全局 ID 系统。可以借鉴“单一对象身份带来一致引用”，但不能据此建立世界真相二写。
- [Microsoft DDD — Entities, Value Objects, Aggregates](https://learn.microsoft.com/en-us/azure/architecture/microservices/model/tactical-ddd)：需要跨时间跟踪身份时才将对象提升为实体；基于一致性边界的受控写入比跨模块直接互改重要。
- [W3C PROV-O](https://www.w3.org/TR/prov-o/)：来源、派生、修订和 `alternateOf/specializationOf` 可以帮助区分“同一对象的不同描述版本”与“不一定同一的记录”；不要求使用 RDF 或把来源关系自动升格为世界真相。

## 10. 下一轮讨论的决策焦点

本轮选择 W9-A/B/C。重点应确定：**世界身份的稳定范围、World Definition ↔ Session Instance 的实例化关系、Authored Actor ↔ Runtime NPC 的语义映射、HCM 证据消歧与跨分支身份继承**。确认总体路线以后再决定是否需要最小新增 ID family、受控的 Binding/Projection 类型、Timeline/Information 消费者的实施计划和验收。

**状态仍为 Draft**。用户未明确批准 W9 选择、整份方案最终定稿或代码实施；此阶段禁止改动 `main` 和其他长期工作空间。

## 11. W9-B 已确认（2026-10-17）

用户对上一轮明确推荐的 **W9-B：Canonical World Subject + 受控跨域映射与投影**回复「认同」。纳入 `ARCH-DWE-01` 已确认的**总体设计方向**：

- 已由 Native Host 正式接纳的世界对象拥有稳定、可追溯的世界主体引用。不同领域继续维护其本地职责：Authored Actor 是创作/表达资产、Lifetime 是业务域记录、Cognition/Perspective 是授权主体视角、HCM Entity 是有证据的语义指称。
- 映射不是通过同名自动合并，须有明确来源、版本、权限与受众界限。可保留候选、歧义与不同主体对身份的误解；Host 内部知道同一真身不自动向角色/玩家泄露。
- 存档分叉继承分叉点前已存在的主体与绑定，分叉后的状态、秘密和新增实体按各自分支隔离。固定 World/Actor Profile 不随 Play 写回。
- 统一的是世界对象的 **identity reference authority**，并不意味着所有领域使用同一 ID 字符串、同一张表，或创建独立于 Native SessionCore 的第二个可写实体数据库。
- 本决定**不等于** W9 相关 ID family、绑定 Schema、动态 Speaker/ToM/Memory/Visual/Speech 的 API、实施阶段或 E0 验收已获批准。

**下一轮 W10** 专门讨论定义到实例的实体创建/复用和运行时功能准入：`World/Actor Definition → Session Subject`、角色表达资源绑定、NPC 对话参与者与合法 Cognition/Task 权限、HCM 证据节点是否/怎样受控映射、分支恢复的跨域一致性。候选见同一 Plan 的 [subject-instantiation.md](subject-instantiation.md)。W10 尚未获用户选择，完整企划继续 Draft。
