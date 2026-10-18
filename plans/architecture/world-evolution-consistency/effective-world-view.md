# ARCH-DWE-01 · 有效世界、资料适用性与用户操作

[唯一入口](index.md) · [实现分工](e0-preflight-execution.md) · [同一 Record](../../../records/architecture/world-evolution-consistency.md)。**Draft / Paused**，本次仅整理文档；已确认方向为 **W14-B：有效视图优先、Claim/Source-aware Context**。本模块定义功能与逻辑合同，具体字段按原实现接线；旧源码与历轮讨论仅作背景。

## 1. 必须区分“固定作者资料”中的五种语义

| 资料 | 示例 | 语义与权威 |
| --- | --- | --- |
| **Hard Law / 不可违反的法则** | “人类无法随意复活” | 创作者授权的高优先级世界约束；若规则允许 E3 变更，必须经专门权威事件与权限，不可简单以最新状态覆盖 |
| **Initial State / 起点事实** | “开局莱恩担任皇帝” | WorldRevision 在指定 EntryPoint/Session 里的初始事实；可经后续合法世界事件改变 |
| **Current World Fact / 当前状态** | “T12 时莱恩已死，新皇米拉在位” | 当前有效的 Native Session/Branch/Revision/GameTick 提交状态，带可追溯原因 |
| **Historical Fact / 过去事实** | “莱恩 T0–T10 曾任皇帝” | 有效期已结束，仍可用于历史询问、记忆和人物形成行为动机；不能直接注入为“现在的皇帝” |
| **Source Claim / 资料或人物说法** | “旧年鉴写着莱恩永远在位” | Knowledge Source、传闻或文献的原文，证明“资料如此记载”，不是当前必然真实的 World State |

**私人认知第六类**：某 NPC 现在仍误以为莱恩在位是它自己的 Belief，而不是“Source Claim/当前状态”无条件转成所有角色的共同真相。

不要为解决静态与动态冲突，粗暴地把“新的当前状态”赋予高于**真实硬法则**的普遍权限。若出现违反 Hard Law 的正式状态，应当在提交与 E3 权限边界先裁定是否合法；不能让提示词排序“解决”非法提交。

## 2. 有效世界视图的候选输入与输出语义（逻辑契约，非 API）

```text
Pinned PackageVersion / WorldRevision(s) / KnowledgeRevision(s)
  Native Session State/Events/Subject/History at exact Revision
       Canonical game clock / requested asOfGameTick
       Authorized audience/Subject Perspective & Scope
                     |
             Effective World Resolver
          (existing Native Host-owned projection)
                     |
           +---------+--------------+
           |         |              |
       current    historical    laws/constraints
       facts      valid ranges  author permissions
           |         |              |
           +---------+--------------+
                     |
           Source/Claim Applicability
       (unknown, outdated, conditional, false,
        disputed, historical, source-only)
                     |
         Authorized Context/Studio/Play consumers
           +--------------+---------------+
           |              |               |
       Prompt Plan     Effective Preview   Inspector/Diff
```

**候选查询锚点**（不要求全部存成冗余列）：
- `sessionId`、`branchId`、`asOfRevisionId`、`gameTick`、`worldScope`；
- `audience` / `perspective` / `purpose: runtime|display|inspect`，外加真实 Host 可授予的 Source/Scope 许可；
- 只读投影返回 `current facts`、`historical facts`、`laws`、`unresolved/uncertain`、`sourceRefs`、`source authority/status`、`validity` 与 `effective projection anchor`，必要时另携带冲突/过滤原因。具体字段／ID 由对应原服务实现。

**双重视图**：Host 结算用的规则/内部世界状态投影和玩家/NPC 的信息投影必须区别，可共享 Host 事实查询机制，但不能让 `narrator` 全知结果原样作为 NPC/普通玩家可读输出。**asOfGameTick 只是时间过滤，不自带秘密读取授权**。

- `current` 与 `historical` 不能仅靠“哪个文本排名高”划分，必须依据可追溯的已提交事实有效期/更正关系；
- `unknown` 不是 false，`disputed` 是尚待裁决而非模型任选一边；历史里一条错误的传闻可以继续作为**某人曾经相信/散播**的来源存续；
- 不创建新的可写 EffectiveWorldState/TruthDB；这是现有 Native Host 的**读投影**，依据已固定作者资源和确切 Session Revision 可重建。

## 3. 最核心的静动态冲突：莱恩帝位变化

**起点**：World/Knowledge 中作者自由文本写“莱恩是帝国皇帝”。T10 莱恩死亡，T12 米拉继位。

| 消费场景 | 正确语义 | 不应该发生 |
| --- | --- | --- |
| 当前世界事务 | 米拉是 T12 的皇帝；莱恩已故；世界继承硬规则仍有效 | 因 Library 文案仍写“莱恩是皇帝”而恢复莱恩在位 |
| Narrator 生成 T13 场景 | 当前继位事实、合理历史、情境证据 | 把“莱恩是皇帝”当 T13 仍真的当前状态重复注入 |
| 某个偏远 NPC 的 Perspective | 在 T13 尚未收到继位消息，可能仍相信莱恩在位 | 因 Host 全知而强行让其知道米拉即位 |
| 历史查询 T5 | 在 T5 莱恩确实在位 | 只拿当前米拉的状态覆盖 T5 历史 |
| 读取旧编年史 | 正确引用“该文献写到莱恩在位”，标注时间/可信来源 | 把文献文本直接转为全新 World Effect |
| SavePoint T7 另开分支 | 分叉前莱恩在位；后续事件按分支独立演化 | 将另一分支的 T10 死亡或 T12 继位泄漏到新线 |

**自由文本一等支持**：作者不需要手动给每段故事添加字段。模型的未经审核抽取不能自动将任意历史传闻升级为当前 Canon。

## 4. 现有 Atria main 确实已有的功能及缺口（静态审读，非 E0 完成）

### 4.1 Knowledge Runtime 已有来源级排序和有条件过滤

- [Native Knowledge Runtime](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/knowledge-runtime.js) 显式定义来源权威等级：`runtime_mechanics`=900、`current_session_state`=800、`committed_event_journal`=700、`knowledge_override`=600、`package_canonical`=500、library augment=400、session augment=300、memory history evidence=200。
- `compileNativeKnowledgePlan` 对已固定的 Knowledge Binding/Entry 进行 target/visibility、`applicability.stateConditions`、`relations.exclusiveGroup` 的有限判断，命中的条件冲突可给出 `current_state_conflict`。`normalizeMemoryEvidence` 对带显式 `stateClaim` 的相关路径可拒绝与当前 Native State 不一致的记忆证据。
- [State Conditions](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/state-conditions.js) 是纯三态比较（true/false/unknown），未知不自动变真；这些是**已有能力，应该复用**。
- **真实缺口**：已有条件与排他组只对**显式声明条件/组或来源状态 claim** 的有限候选生效；较高 `authorityRank` 不能阻止两段互相矛盾的内容同时出现在 Prompt。

### 4.2 Context Compiler 已有专门的世界、事件、知识、记忆预算

- [Context Compiler](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/context-compiler.js) 定义 `current_state_event`、`knowledge`、`memory`、`narrative_spine`、`commitments` 等 lane 和 economy/balanced/rich 预算；`currentStateItems` 把当前 `atri_world_state` 标注为高权威、`atri_game_runtime.events` 最后 16 个作为事件来源，已有 `sourceRefs`。
- 同一个 compiler 将 Knowledge 选中的原始 `content` 作为 `knowledge` lane 条目，并通过 SourceRef 和 `authorityRank/priority` 预算排序、按受众过滤。**“rank 高于旧资料”属于候选排序而不是语义修订**；只要旧正文仍入选，就可能污染生成效果。
- 当前 `currentStateItems` 可把全部 `atri_world_state` JSON 放进上下文；这不等于未来合理的按 Subject/场景关联裁剪 Effective World View，长会话也不可依赖每轮全量状态注入。
- [Knowledge Selection](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/knowledge-selection.js) 使用关键词、正则、关系和状态激活筛选，会在 Token Budget 下择取正文。保持创作自由度有价值，但词命中不能被误用为“这条资料当前仍为真”。
- **特别注意**已固定、受授权的角色表达文本与已过期的事实须拆开处理，不能仅因为一张 Actor 卡曾经写过旧地位就删掉其整个人格表达或口癖。

### 4.3 原生 World/Knowledge 作者接口与有效视图仍有边界

- [WorldRevision](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/world-knowledge.js) 主要有 `schema`、`baseline`、`knowledgeBindingIds`、资产引用及版本；`World State` 与 `WorldRevision` 已分离，但这不等于 Studio 已有世界实体/关系/法律的完整可视化作者界面。
- [World Editor](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/world-editor.js) / [Studio World Editor](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/studio-worlds-editor.js) 当前主要是世界资源/JSON/源编辑；[Studio EntryPoint](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/studio-entrypoints-editor.js) 已可以固定 World IDs、知识 Binding、初始 overlay。
- [Information Runtime](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-information-runtime.js) 提供 Exact Session/Branch/Revision/Scope 的 actor/task 受众投影和 source reads，但部分 actor 仍依固定 Package 声明；动态 Subject 的合法受众由 WP-C 接入原 Host/Information。
- [Native Chronicle Host](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-chronicle-host.js) 的已有 World Query 仍偏特定 Lifetime/History 域，不能伪称其已支持通用 `EffectiveWorldView(subject, asOfTick)`。
- [World Game Session](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/experience/world/session.js) 依托 Native Runtime/World Revision/Reducer 和受控 revision commit，提供状态/事件来源；不能把它直接视为“全域 World Fact graph”已完成。

## 5. W14-B 候选：有效视图优先、可溯源 Source Claim 结合的 Context

### 5.1 推荐的有效上下文编译顺序

1. **固定身份与作用域**：选择当前 Session/Branch/Revision（或历史查询的指定 Revision）、规范游戏时钟、World(s)/Worldless、明确的目标受众/用途；不能从未知请求随意读取全知 Narrator。
2. **加载规则与确切世界事实**：由固定作者规则/已批准 E3 变化及 Native State/Event/History 构建当前有效事实和必要的 `as-of` 历史。
3. **做主体与场景范围筛选**：使用正式 Subject identity、位置/关系/最近事件/承诺/任务来控制关联范围，生成简洁而充分的世界事实，而不是永远将所有 Snapshot JSON 原样注入。
4. **权限裁剪先于文字检索**：根据 Host source grants/角色 Perspective 先限制其可见事实、消息、HCM Episode/Knowledge Source；保证角色不能因关联检索而间接读到未公开身份与秘密。
5. **Knowledge 的事实适用性判定**：知识来源按用途分为背景/创作规则、当前状态候选、历史记录、传闻或未核实说法。对关联了已知 Subject/FactKey/有效条件的可变声明，判定 current/historical/superseded/disputed/unknown，明确重定位或排除“已过期状态”的当前事实用法。对无结构化声明的自由正文，不臆测其客观真相，保留源作为**标注语境/出处的参考**，遇到关键当前事实潜在冲突时优先要求补充绑定或以 background/source-only 语义送入而不无条件宣布为当前世界。
6. **合法 HCM/认知回忆**：NPC 对同一事件可拥有不同相信程度；事实变化不会自动全员得知，记忆来源需支撑 actor-specific view，跨分支/过期证据不得进入 Context。
7. **预算与失败报告**：按已有 Context lanes 分配必需的世界当前状态/未履行契约及相关历史；所有入选/被拒项携带来源与理由，若硬约束/关键必要事实因预算或源不足不可用，要明确错误/降级边界，不用 LLM 补造真相。仍遵循单 Host 与有效的 token budget。

### 5.2 原文冲突处置不等于“大范围自动删改资料”

| Source 声明情况 | 建议如何传给模型 | Inspector 显示 |
| --- | --- | --- |
| 作者固定硬法则，当前无高权限修订 | 保留明确规则（经受众授权），不能被动态普通叙事覆盖 | `hard_rule_current` 与来源 |
| 作者起始“莱恩在位”，当前有已提交继位结果 | 当前状态只用“米拉在位”；旧原文可以在历史/世界开局资料引用 | `superseded_as_current`；T0–T10 历史 |
| 旧编年史“莱恩是皇帝”（无明确时间） | 当作文献来源/时间未明 claim，不能作为 T12 当前在位证据 | `source_claim_unresolved`，提示作者可选绑定 |
| NPC 从别人处听闻“莱恩仍在位” | 在该 NPC 的已授权 belief/rumour 用途内表述为“听说/认为” | `actor_belief` 与传播链 |
| 未被世界定义的地名/普通场景细节 | 可作为创作背景文本，必要时再走 W4-B 持续后果正式接纳 | `background_only`，非已确认事实 |
| 两个正式相互矛盾的 Native Effects |不能任凭 Context rank 选一个| `authority_conflict`（阻塞） |

这些原因代码仅是**候选语义标签**，没有声称 Atria 目前已有对应的结构或 UI。普通文学描写与不可随意解释的结构化世界事实应采用不同治理路径。

## 6. Library / Studio / Play：3 面板工作区里的合理产品体验（候选）

**信息架构建议**（未来整体前端重构不受当前 HTML 草案强行约束）：

- **Library：作者资产与资料**。World 定义编辑应突出实体/关系/法则/起始场景与可复用来源，Knowledge Library 管来源资料、文献、自由文本/引文及可变声明的证据/目标绑定。普通创作以自由文本和轻量字段优先，不要求每条世界设定都建人工 ID；高级使用者可打开 World Graph/Source Inspector。
- **Studio：作品装配与预览**。明确 `WorldRevision / Actor Profile / Knowledge Binding / EntryPoint` 的固定依赖，设置世界起点、哪些人物在开局已存在、哪些只是传闻/资料。重点新增 **Authored → Effective Preview**（开局有效世界、知识候选及受众），以及“该条源会在何种条件下失效/从当前改为历史”的 Diff Inspector；预览须严格标注它不是 Play 的 Live 分支结果。
- **Play：活世界和实时可见性**。当前玩家视角可查人、地点、关系、任务、事件及其可见变化；切 Save/Branch 即切到合法的当前 Revision。重要 NPC 的身份延续、死亡/迁移/改名和过去历史可追溯；玩家只能看到允许获知的资料，内部 Host 的秘密真身映射不会泄露。
- **三栏工作区概念**：左侧世界/来源/人物导航，中间场景与世界工作区，右侧按选中对象展示 Inspector/Effective/History/Diff。移动端改为单主工作区与按需抽屉/浮层，不能堆三栏缩窄卡片；这是**信息组织原则**，不是本项目最终 UI 动画/像素稿，不与未来前端统一重构抢权威。
- **Inspector 应答“为什么？”**：为什么它当下在位、何时失效、从哪个 WorldRevision/事件/Knowledge 来源得出、是否只是 NPC 认为、某条 entry 为什么被接受/拒绝、哪个有效 Revision/游戏 Tick/受众过滤了内容。界面只读投影，不能暗中编辑 Play 的世界事实。

## 7. 功能接线的具体工作

1. **Fact identity/effective time**：现有 World State/Event、History/Lifetimes、Memory、Knowledge Baseline 如何表示统一的 `Subject + FactKey/Relation + valid interval`？哪些需要真实的最小 Native 扩充？不能虚构已存在的通用 Semantic Fact Registry。
2. **Source Binding**：自由文本与重要可变声明怎样关联既有 Subject/Fact，而不要求 LLM 每轮重新理解全套历史？旧 Knowledge Source `stateConditions` 能复用多少，哪部分需要更明确的 `claim`/effect applicability 语义？
3. **Compiler input**：目前 `currentStateItems` 直接包含 World JSON、`knowledgeItems` 包含已选原始正文，是否需要把源正文使用目的与事实真值严格区分？怎样保证旧 World/Knowledge 文本不比有效事实“更能被语言模型采信”？
4. **Perspective security**：权限裁剪是否发生在 Source retrieval 与 token selection 前？涉及 Narrator 的 Host 真实有效视图是否需要专门的公开/角色披露投影？
5. **Studio/Play**：WP-E/F 接通 World/Knowledge/EntryPoint 编辑、起点预览、Play 档案／历史、Frontend Host 与按需 Inspector；各操作使用同一合法投影。
6. **多 World/Worldless 与不同玩法**：World 不选、一次引用多个 World、Package Actor 只做说话模板、运行时新增对象不依附特定书籍的情况，怎样保留明确 `scope` 与实例化/有效规则？
8. **效率**：数千回合、上百冷态 Subject、有限 Context token；重要当前约束不可因挑选随机知识项和长段文本挤出，且不需要每轮重写世界图或调用 LLM 裁判真假。
9. **实际调用方**：目标 API/Schema、旧路径替换、提交／叙事与时间接线随各 WP 完成；三端采用统一前端功能，不另设全量审计或实测阶段。
