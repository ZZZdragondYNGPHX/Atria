# Luker Memory OS 代码级重构方案书

> 分支：`feat/memory-os`
>
> 基线：`custom-release@112baa3b5f2ad1109a0b143bcffa3d39ec8dc470`
>
> 目标：在保留现有 Luker 私有功能、现有记忆能力、多智能体编排，以及普通文字卡、MVU（MagicalAstrogy/MagVarUpdate）和 LoreState（ZZZdragondYNGPHX/LoreState）支持的前提下，将当前记忆系统升级为一套面向长期 RP 的本地优先混合记忆系统。

---

## 0. Codex 执行要求

开始任何代码修改前，必须先从 `custom-release` 读取并遵守：

1. `AGENTS.md`
2. `AI_HANDOFF.md`
3. `FORK_MAINTENANCE.md`
4. `NEW_FEATURE_PROMPT.md`
5. `.github/copilot-instructions.md`

本功能已经从最新 `custom-release` 建立独立分支：

```text
feat/memory-os
```

后续开发必须继续在该分支进行。

禁止：

- 以 `release` 作为新的开发基线；
- 删除或绕开 `custom-release` 中已经存在的私人修复和功能；
- 为了方便重构而直接替换整个聊天、预设、编排或 LoreState 子系统；
- 先做图谱动画，再补底层数据模型；
- 将“向量相似度连线”冒充真正的 Memory Graph；
- 让 AI 抽取结果无证据直接永久写入事实层；
- 因 Graph/Memory 抽取失败而阻断正常正文生成。

第一阶段必须先做代码审计，再实现。

---

# 1. 重构目标

当前记忆能力不应再只是：

```text
当前消息
  ↓
embedding
  ↓
Top-K 相似记忆
  ↓
塞入 prompt
```

目标架构：

```text
                         Luker Memory OS
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
   Working Memory        Episodic Memory        Semantic Memory
     工作记忆                情节记忆                原子事实
        │                      │                      │
        ├───────────────┬──────┴───────┬──────────────┤
                        │              │
                        ▼              ▼
                Temporal Graph     Vector / FTS
                  时序关系图          语义/全文索引
                        │              │
                        └──────┬───────┘
                               ▼
                       Hybrid Retrieval
                               │
                               ▼
                        Context Composer
                               │
             ┌─────────────────┴─────────────────┐
             ▼                                   ▼
           正文模型                         多智能体 Agent

                  可选状态源（MVU / LoreState）
                              │
                              └── 当前状态事实
```

职责划分必须清晰：

```text
Working Memory  = 眼下正在发生什么
Episode         = 当时具体发生过什么
Semantic Fact   = 已确认/推断出的最小事实
Memory Graph    = 世界对象之间如何连接、关系何时有效
Vector/FTS      = 哪些历史内容与当前语义/关键词相关
State Provider  = 可选的当前状态来源；MVU / LoreState 各自拥有状态写入权
普通文字卡      = 不依赖状态 Provider，直接使用正文与记忆链路
```

---

# 2. 第一阶段：现有代码审计

任何大规模编辑前，先产出一份短技术审计结论，至少确认：

- 当前聊天消息数据结构与持久化位置；
- 当前聊天 ID / 消息 ID 是否稳定；
- swipe / regenerate / edit / delete 的真实调用链；
- 当前向量记忆的写入、embedding、索引、检索和 prompt 注入路径；
- 当前是否已有 memory service/store/database；
- 当前是否已有图谱/关系相关依赖；
- 当前多智能体编排如何获取共享上下文；
- 普通文字卡无状态脚本时的完整记忆路径；
- MVU / LoreState 的实际运行上下文、状态提交与正文 / Agent 注入路径；
- Web 与 Android 是否共用前端记忆实现；
- 当前数据库/文件存储方案；
- 当前 import/export、backup 是否包含记忆数据；
- 相关近期 `custom-release` 私有改动。

在此基础上决定最终文件名、类名、数据库实现。本文中的示例路径不是强制现有路径。

---

# 3. 核心原则：原始剧情是根，AI 记忆是派生数据

所有高级记忆必须能追溯到原始消息或原始记忆源。

建议建立依赖链：

```text
Chat Message
    │
    ▼
Episode
    ├── Atomic Fact
    │      └── Relation
    ├── Embedding
    ├── Scene Summary
    └── Other Derived Memory
```

这样当源消息发生：

- swipe
- regenerate
- edit
- delete
- chat rollback

系统可以将所有派生记忆标记为 stale / invalid 并重建，而不会留下幽灵记忆。

---

# 4. Episode Store：情节记忆层

Episode 是长期记忆的证据根。

逻辑模型示例：

```ts
interface MemoryEpisode {
  id: string;
  scopeId: string;
  chatId: string;
  messageIds: string[];

  content: string;
  role?: "user" | "assistant" | "system";

  createdAt: number;
  storyTime?: string;
  locationEntityId?: string;

  sourceRevision: number;
  status: "active" | "superseded" | "deleted" | "stale";
}
```

要求：

- 不直接使用可变消息文本作为唯一标识；
- Episode 必须记录来源消息；
- 源消息修订后可以判断 Episode 是否过期；
- Episode 删除不能自动物理删除全部历史，优先软失效，方便依赖清理。

---

# 5. Semantic Memory：原子事实层

禁止把所有长期记忆只存成大段摘要。

例：

```text
爱丽丝把月银剑交给罗兰保管，随后独自前往王都。
```

至少可拆成：

```text
F1：月银剑由罗兰保管。
F2：爱丽丝前往王都。
F3：爱丽丝将重要物品托付给罗兰。
```

F3 属于推断，必须和显式事实区分。

逻辑模型：

```ts
interface MemoryFact {
  id: string;
  scopeId: string;

  text: string;
  type: "explicit" | "inferred" | "summary";
  confidence: number;

  episodeIds: string[];

  validFrom?: string | number;
  validUntil?: string | number;

  status: "active" | "superseded" | "disputed" | "stale";

  importance: number;
  accessCount: number;
  lastAccessedAt?: number;
}
```

要求：

- 显式事实和推断事实分开；
- 推断默认不能拥有和显式事实相同的可信等级；
- 每条事实必须带 source/evidence；
- 同义事实应支持合并或强化，而不是无限重复 append。

---

# 6. Memory Graph：真正的时序实体关系图谱

图谱不是 UI 功能，而是长期记忆核心数据结构之一。

目标效果：

```text
                    王都
                     ▲
                     │前往
                     │
                  爱丽丝
                ╱    │     ╲
             信任    │曾拥有   成员
              ╱      ▼       ╲
            罗兰    月银剑    银翼骑士团
              ▲       │
              └─保管──┘
```

## 6.1 Entity

首期支持：

```text
Character
Location
Organization
Item
Event
Quest
Concept
```

逻辑模型：

```ts
interface MemoryEntity {
  id: string;
  scopeId: string;
  type: string;
  canonicalName: string;
  displayName: string;
  aliases: string[];
  summary?: string;
  status: "active" | "merged" | "deleted";
  createdAt: number;
  updatedAt: number;
}
```

稳定 ID 必须与名称分离。

禁止：

```text
id = "爱丽丝"
```

必须支持：

```text
爱丽丝
Alice
爱丽丝小姐
银翼之花
```

解析到同一个实体。

## 6.2 Relation

```ts
interface MemoryRelation {
  id: string;
  scopeId: string;

  sourceEntityId: string;
  targetEntityId: string;

  predicate: string;
  label?: string;

  factId?: string;
  confidence: number;

  validFrom?: string | number;
  validUntil?: string | number;

  status: "active" | "superseded" | "disputed" | "stale";

  createdAt: number;
  updatedAt: number;
}
```

边必须有真正的语义：

```text
爱丽丝 ─member_of→ 银翼骑士团
爱丽丝 ─distrusts→ 鲍勃
爱丽丝 ─owned→ 月银剑
王都政变 ─occurred_at→ 王都
```

禁止将 cosine similarity 当 relation。

---

# 7. Evidence / Provenance：所有事实必须能追根

建议：

```ts
interface MemoryEvidence {
  id: string;
  scopeId: string;

  targetType: "fact" | "relation" | "entity";
  targetId: string;

  sourceType: "chat_message" | "episode" | "memory" | "manual" | "import";
  sourceId: string;

  excerpt?: string;
  confidence: number;
  createdAt: number;
}
```

点击任意关系时应能回答：

```text
这条关系为什么存在？
来源哪一楼？
什么时候抽取？
当前还有效吗？
```

AI 抽错后用户必须能定位并修正。

---

# 8. Temporal Memory：关系与事实具有生命周期

RP 世界中的事实会改变。

例：

```text
Chapter 1：爱丽丝拥有月银剑
Chapter 3：爱丽丝把月银剑交给罗兰
```

不能覆盖删除历史。

应表示为：

```text
爱丽丝 ─owns→ 月银剑
valid: Ch1 → Ch3
status: superseded

罗兰 ─holds→ 月银剑
valid: Ch3 → now
status: active
```

关系类型需要至少支持三类时序策略：

```text
persistent
replace_current
multi_active
```

例如：

- `located_in` 常属于 `replace_current`
- `visited` 常属于 `multi_active` 或历史型
- `member_of` 可能需要起止时间

冲突解析器不得简单删除旧边。

---

# 9. Entity Resolution：实体消歧是图谱成败关键

LLM 提取：

```text
“银翼之花”
```

不能直接新建节点。

推荐流程：

```text
Extracted Name
     │
     ▼
Canonical exact match
     │miss
     ▼
Alias match
     │miss
     ▼
Normalized name match
     │miss
     ▼
Context candidate match
     │
     ├── high confidence → existing entity
     ├── ambiguous → pending merge / resolver
     └── no match → create entity
```

必须提供用户手工：

- 合并实体；
- 新增别名；
- 拆分错误合并；
- 修改 canonical name。

---

# 10. Working Memory：当前场景短期记忆

并非每个当前状态都应该写入长期记忆。

示例：

```text
地点：卧室
时间：23:41
当前人物：爱丽丝、罗兰
当前目标：寻找钥匙
刚刚发生：门外出现脚步声
未解决：门外是谁？钥匙在哪里？
```

逻辑模型可包含：

```ts
interface WorkingMemory {
  scopeId: string;
  chatId: string;
  sceneId: string;

  currentLocation?: string;
  currentTime?: string;
  activeCharacters: string[];
  currentGoals: string[];
  unresolvedThreads: string[];
  recentEvents: string[];
}
```

场景结束后执行 consolidation：

```text
Working Memory
      ↓
Scene Consolidation
      ↓
Episode / Facts / Relations / Summary
```

不是所有内容都进入长期层。

---

# 11. Hierarchical Summary：层级摘要而非单层记忆

建议层级：

```text
Raw Message
   ↓
Episode
   ↓
Scene Summary
   ↓
Chapter Summary
   ↓
Arc Summary
```

这样查询：

```text
“爱丽丝和罗兰为什么关系恶化？”
```

可以先命中：

```text
Arc → Chapter → Scene → Episode
```

而不是始终在所有聊天消息中平铺 Top-K。

层级摘要必须记录 children/source IDs，支持源内容失效后的重建。

---

# 12. Memory Evolution：记忆不是 append-only

新 Episode 到来后：

```text
新 Episode
    │
    ▼
Fact Extraction
    │
    ▼
查找已有相关 Facts / Relations
    │
    ├── create
    ├── reinforce
    ├── merge
    ├── revise
    ├── dispute
    └── supersede
```

例如：

```text
旧：爱丽丝不信任罗兰
新：爱丽丝已经原谅罗兰
```

系统必须更新时序状态，而不是把两个互相冲突的“当前事实”都塞给模型。

---

# 13. Memory Decay：只衰减召回优先级，不随便删除真相

长期事实不能因为旧就变假。

例如：

```text
“爱丽丝是罗兰的妹妹”
```

即使三千楼之前建立，也不能因 recency 低而消失。

Memory Decay 主要用于候选排序：

```text
retrievalScore =
    semanticSimilarity
  + entityRelevance
  + graphRelevance
  + importance
  + confidence
  + recency
  + accessReinforcement
```

具体权重后续通过真实测试调整，首期不要把 magic number 散落在业务代码中，集中配置。

---

# 14. Retrieval：重构为 Query Planning + Hybrid Retrieval

不能再只有：

```text
embed(query) → Top-K vectors
```

目标：

```text
                   User Message
                        │
                        ▼
                  Query Analyzer
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
  Entity Detection    Intent         Time Scope
        │               │                │
        └───────────────┼────────────────┘
                        ▼
                 Retrieval Planner
                        │
      ┌─────────────────┼───────────────────┐
      ▼                 ▼                   ▼
 Vector Search       FTS/BM25          Graph Search
      │                 │                   │
      ├─────────────────┼───────────────────┤
      │                 ▼                   │
      │            Episode Search           │
      └─────────────────┼───────────────────┘
                        ▼
                  Candidate Fusion
                        │
                        ▼
                      Rerank
                        │
                        ▼
                 Context Budgeter
                        │
                        ▼
                  Context Composer
```

## 14.1 Query Planner 示例

用户：

```text
爱丽丝在哪里？
```

优先：

```text
Optional current-state provider + latest location relation
```

用户：

```text
爱丽丝为什么讨厌罗兰？
```

优先：

```text
Graph + Episode + Scene Summary
```

用户：

```text
那把她以前用过的剑呢？
```

优先：

```text
Entity resolution
→ 爱丽丝
→ owned/used relation
→ Item
→ supporting episode
```

用户：

```text
之前在酒馆里发生了什么？
```

优先：

```text
Location entity + episodic search + time range
```

---

# 15. Graph Retrieval

默认只取局部子图。

推荐默认：

```text
maxDepth = 2
maxEntities = 20
maxRelations = 30
```

原则：

```text
1-hop > 2-hop
active > historical
high confidence > low confidence
explicit > inferred
```

只有历史问题才主动提升 inactive/superseded 关系。

禁止把全世界图谱一次性塞入 prompt。

---

# 16. Context Composer：最终上下文必须压缩、结构化

不要输出：

```text
Memory #1
Memory #2
Memory #3
...
```

建议最终结构：

```text
【当前状态】
时间：...
地点：...

【相关人物】
爱丽丝：
- 当前位于王都
- 银翼骑士团成员
- 与罗兰关系已缓和

【相关关系】
- 月银剑曾属于爱丽丝
- 当前由罗兰保管

【相关往事】
1. Chapter 12：爱丽丝将月银剑交给罗兰。
2. Chapter 17：两人因王都事件决裂。

【未解决剧情】
- 月银剑后续去向仍存在疑点
```

Context Composer 必须接受 token budget，而不是无限填充。

---

# 17. 通用角色卡与可选状态源集成

> 2026-09-16 用户方向修订：Memory OS 必须通用，支持普通文字卡、MVU 状态卡（MagicalAstrogy/MagVarUpdate）和 LoreState（ZZZdragondYNGPHX/LoreState）。本节修订原方案的状态适配范围，不重建 Memory OS，也不改变既有阶段顺序。下述内容是适配约束；当前实现与验证范围见 Phase 6 执行记录。

## 17.1 三类输入，共享记忆核心

| 使用方式 | 当前状态权属 | Memory OS 行为 |
| --- | --- | --- |
| 普通文字卡，无状态框架 | 没有外部结构化状态权威；正文有来源证据 | 独立执行 Episode、Fact、关系演化、混合检索与注入，不要求安装 MVU 或 LoreState，不自动补造变量表 |
| MVU 状态卡 | MagVarUpdate 及卡自身 schema / 更新规则管理已提交状态 | 通过可选适配读取有效状态及有来源的变化；保持原变量更新、校验、显示与持久化路径 |
| LoreState 状态卡 | 指定 LoreState 运行版本管理已提交状态 | 通过可选适配读取有效状态及有来源的变化；保持其解析、回放、快照和展示路径 |

三者共用已实现的 provenance ledger、Fact、Temporal Graph、Hybrid Retrieval 和 Context Composer。核心不得 import、启动或要求安装特定状态框架。普通文字卡是完整的一等使用方式，不是故障降级模式。按运行能力探测，不按卡名、某个文本标签或是否有状态栏猜测框架；MVU / LoreState 都可缺席，也可能同时存在。

Memory OS 管理历史、事件、关系演化、来源证据与召回；可选状态源管理其声明字段的当前值。Memory OS 不回写外部变量，不执行更新标签，不接管状态解析器，不另存一份可独立修改的实时状态真相。基于快照建立的历史记录属于派生记忆，必须可追溯和失效。

## 17.2 最小适配边界（内部设计约束，不是外部 API 声明）

- 能力状态区分 absent、initializing、ready、error；缺席不阻止正文记忆，初始化中不得冒充空状态，错误不得继续把最后快照称为当前状态。
- 读取返回带 Provider 身份与版本、当前角色 / 聊天 scope、消息及 swipe / 来源版本、状态 revision 或内容指纹的只读快照。映射保留外部字段路径、原值与外部实体身份；字段名由卡定义，不能硬编码“角色.好感度”“当前地点”等路径。
- 按已验证语义配置或 schema 映射选择字段；未知字段可保留来源标签的状态文本，不强行生成 located_in、owns 等关系。不要把 display_data、HTML 或渲染结果当作状态存储真相。
- 在实际提交 / 持久化完成后读取。框架的更新事件不自动等于提交完成；同一轮正文与额外状态模型完成顺序必须核验。没有可靠提交通知时使用经过验证的读取及指纹复核，不猜事件。
- Provider 在脚本 iframe / EJS 上下文可用，不证明宿主扩展能直接调用。必要桥接必须验证来源、scope、版本、请求关联与清理；不读取私有 DOM，不依赖未经承诺的内部 runtime slot。
- 正文不变而变量修改、手动修正、回档或状态重算时，Provider 依赖也必须失效。Phase 2 的正文 sourceContent 检查不能替代 Provider revision 检查。删除 / 编辑 / swipe / 切换聊天、关闭或卸载 Provider 后拒绝晚到结果并撤销旧投影。
- 状态快照不是剧情 Episode 的伪造原文。不把“读取状态”伪装成聊天原文引用。长期记忆化需要独立、可验证的 Provider 证据引用，并与现有依赖失效体系连接。
- 同 revision 不重复建 Fact；正文与状态描述同一事件时合并来源而非多算事件。数值小幅波动不默认永久记忆化；只记录有意义且可追溯的变化。
- 各 Provider 的安装、更新、schema、初始化及数据持久化仍归原框架 / 卡作者负责，Memory OS 不自动安装或迁移它们。

## 17.3 当前状态、历史与冲突

同一 scope、同一字段、已经确认提交且仍有效的 Provider 当前值，优先于 Memory OS 的旧历史推断；未覆盖字段继续由有来源的正文记忆提供。过去发生的地点 / 装备变化仍可作为历史召回，不能改写成“现在”。

没有外部 Provider 时，使用 Phase 3–5 已有事实 / 时序关系及置信度规则。不能因为缺少结构化字段就宣称它为 false、空值或已删除。

MVU 与 LoreState 同时存在时，按明确字段权属或用户选择确定当前来源；没有配置且双方冲突则标记冲突，不设固定 LoreState > MVU 顺序，也不拿两个不同时间坐标的时间戳猜胜者。后续 correction 仍写回其所属框架，Memory OS 只消费结果。

在统一 Composer 汇合当前状态与历史，沿用总 token 预算；识别原框架已有注入，按字段 / 来源避免重复。不能全量再注入状态表，也不能为了去重关闭原框架的更新规则、schema 或提示词。Agent 和正文看到一致的共享世界状态，私有 scratch 不提升为事实。

## 17.4 本次回源证据与实施前核验

以下是设计参考的固定源码快照，不代表用户已安装的版本，也不代表已验证跨 iframe 调用或真实提交时机：

- MVU：`MagicalAstrogy/MagVarUpdate` 的 beta HEAD `4a3645f19705e9e73bb4df3a8e731d5ff994ce80`。已核对 [README](https://github.com/MagicalAstrogy/MagVarUpdate/blob/4a3645f19705e9e73bb4df3a8e731d5ff994ce80/README.md)、[变量与事件定义](https://github.com/MagicalAstrogy/MagVarUpdate/blob/4a3645f19705e9e73bb4df3a8e731d5ff994ce80/src/variable_def.ts)、[外部事件处理](https://github.com/MagicalAstrogy/MagVarUpdate/blob/4a3645f19705e9e73bb4df3a8e731d5ff994ce80/src/function/exported_events.ts)。实现时按实际交付版本核验读取入口和提交边界，不将 beta 分支名当版本契约。
- LoreState：main HEAD `97273a5476b81744b83e111cf5517fdbe92724e1`。已核对 [README](https://github.com/ZZZdragondYNGPHX/LoreState/blob/97273a5476b81744b83e111cf5517fdbe92724e1/README.md)、[当前 runtime](https://github.com/ZZZdragondYNGPHX/LoreState/blob/97273a5476b81744b83e111cf5517fdbe92724e1/prototype/runtime.js)、[EJS 桥接](https://github.com/ZZZdragondYNGPHX/LoreState/blob/97273a5476b81744b83e111cf5517fdbe92724e1/prototype/ejs-bridge.js)。README 指明维护线为 Tavern Helper 脚本、稳定版为 0.13.1；根目录旧原生扩展不作为适配入口。EJS 命名空间不自动构成宿主扩展公共 API。
- 指南路由：tavern-card-builder，库快照 2026-08-18；本次实际读取 ST-A0 工程约束与 ST-B1 变量规则相关片段，外部精确能力仍以固定源码和实际运行时为准。未采用路由中的无关设计候选。

## 17.5 Phase 6 验收矩阵

1. 无任何状态脚本：普通文字卡正常提取、检索、注入；不尝试访问 Mvu / LoreState 全局。
2. MVU-only 与 LoreState-only：各自初始化、状态提交、额外模型迟到、手工改值、回档及卸载均不泄漏旧当前值。
3. 两者共存：非冲突字段可以组合；冲突字段可解释且不静默覆盖。
4. 任意作者字段名 / 不同 schema：无固定角色名或变量路径依赖；缺失字段与显式空值有区别。
5. 正文未改、状态改变：旧状态派生 Fact、关系、向量命中和缓存失效；晚到读写被 scope/revision guard 拒绝。
6. 正文与 Provider 对同一变化重复描述：保留证据，避免重复事件；历史查询不被当前值覆盖。
7. 预算与原状态注入：合计受预算控制，无重复状态正文，无丢失原更新规则；共享 Agent 上下文与私有 scratch 保持分离。
8. 自动化优先，覆盖 Web / Android 共用模块；真实外部脚本、模型和 Android 未执行的检查如实记录，不要求用户补测才能继续开发。

---

# 18. 多智能体编排集成

推荐：

```text
                     Shared World Memory
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
         Director        Agent A        Agent B
             │              │              │
             └──────────────┼──────────────┘
                            │
                    Agent Private Scratch
```

世界事实、角色关系、事件与可选状态源（MVU / LoreState）的只读投影应由统一 Memory Context Builder 提供；普通文字卡不依赖状态源。

不要让每个 Agent 独立维护一套长期世界图谱。

若现有编排具有：

- global scope
- character scope
- chat scope

Memory OS 必须复用当前作用域设计，不另造互相冲突的 scope 系统。

---

# 19. 酒馆必须重点解决：Swipe / Regenerate / Edit / Delete

这是本功能的硬验收项。

## 19.1 Swipe / Regenerate

```text
Message revision A
   ↓
Episode A
   ↓
Fact / Relation / Embedding

用户 Swipe
   ↓
Message revision B
```

A 的派生内容必须：

```text
invalidate / stale
```

然后根据 B 重新构建。

## 19.2 Edit

编辑旧楼层：

```text
source revision++
      ↓
Dependency Tracker
      ↓
标记 descendants stale
      ↓
Rebuild
```

## 19.3 Delete / Rollback

删除源消息时：

```text
Message delete
   ↓
Episode invalidate
   ↓
Facts invalidate
   ↓
Relations invalidate
   ↓
Embeddings remove/disable
   ↓
Summaries dirty
```

禁止删除楼层以后图谱仍保留旧事实。

---

# 20. Dependency / Provenance DAG

为了支持上面的失效机制，建议引入轻量依赖记录：

```text
memory_dependency
────────────────
parent_type
parent_id
child_type
child_id
revision
created_at
```

用途：

```text
Message → Episode
Episode → Fact
Fact → Relation
Episode → Embedding
Episodes → Scene Summary
Scenes → Chapter Summary
```

不要求实现通用图数据库，只要能稳定查 descendants。

---

# 21. 低置信度与待确认机制

低置信度推断不能直接污染 active graph。

建议状态：

```text
pending
active
rejected
disputed
superseded
```

用户可在 UI 中：

```text
接受
修改
拒绝
```

阈值集中配置，不写死在多个组件。

---

# 22. 数据库建议

必须优先复用当前项目已经存在的本地持久化方案。

若当前适合 SQL/SQLite，建议逻辑表：

```text
memory_episode
memory_fact
memory_entity
memory_entity_alias
memory_relation
memory_evidence
memory_summary
memory_embedding_ref
memory_dependency
memory_pending
```

索引至少考虑：

```text
entity(scope_id, canonical_name)
alias(scope_id, alias)
relation(source_entity_id)
relation(target_entity_id)
relation(predicate)
relation(status)
evidence(target_id)
evidence(source_id)
episode(chat_id)
dependency(parent_id)
dependency(child_id)
```

首期不要引入 Neo4j/ArangoDB/JanusGraph 等服务型图数据库，除非审计发现当前架构存在非常明确的必要性。

1~3 hop 的本地图遍历使用当前数据库即可。

---

# 23. Embedding / Vector Store

保留现有向量能力，并用 Adapter 包起来。

目标接口类似：

```ts
interface MemoryVectorStore {
  upsert(record: MemoryVectorRecord): Promise<void>;
  removeBySource(sourceId: string): Promise<void>;
  search(query: number[], options: SearchOptions): Promise<SearchHit[]>;
}
```

Memory OS 不应绑定某一个 embedding provider。

后续更换：

- 本地 embedding
- OpenAI compatible embedding
- 其他 provider

不应重写 retrieval 核心。

---

# 24. 服务边界建议

最终根据现有项目结构调整，但职责建议明确拆开：

```text
memory/
├── core/
│   ├── MemoryEngine
│   ├── MemoryRepository
│   ├── MemoryScope
│   └── types
│
├── ingestion/
│   ├── EpisodeBuilder
│   ├── FactExtractor
│   ├── EntityExtractor
│   ├── EntityResolver
│   ├── RelationExtractor
│   └── ConflictResolver
│
├── storage/
│   ├── EpisodeStore
│   ├── FactStore
│   ├── GraphStore
│   ├── SummaryStore
│   └── VectorStoreAdapter
│
├── retrieval/
│   ├── QueryAnalyzer
│   ├── RetrievalPlanner
│   ├── VectorRetriever
│   ├── KeywordRetriever
│   ├── GraphRetriever
│   ├── EpisodeRetriever
│   ├── FusionRanker
│   └── ContextBudgeter
│
├── lifecycle/
│   ├── Consolidator
│   ├── Invalidator
│   ├── Rebuilder
│   ├── MemoryDecay
│   └── DependencyTracker
│
├── integration/
│   ├── OptionalStateAdapters（MVU / LoreState；无状态源也可运行）
│   ├── OrchestratorAdapter
│   └── ChatLifecycleAdapter
│
└── ui/
    ├── MemoryBrowser
    ├── GlobalGraph
    ├── LocalGraph
    ├── EpisodeInspector
    └── MemoryDebugger
```

不要为了匹配这张目录图而强行破坏现有项目分层；审计后映射到现有 architecture。

---

# 25. Obsidian 式 Graph UI

底层完成后再做 UI。

必须提供两类图：

## 25.1 Global Graph

展示整个当前作用域世界图谱。

支持：

- 缩放；
- 平移；
- 拖动；
- 搜索；
- 类型过滤；
- 关系过滤；
- active/history 切换；
- 点击节点；
- 点击边。

## 25.2 Local Graph

选择一个实体后显示：

```text
1 hop
2 hops
3 hops
```

默认 1 hop。

示例：

```text
                       王都
                        │
                     located
                        │
月银剑 ─owned_by─ 爱丽丝 ─member_of─ 银翼骑士团
                        │
                     distrusts
                        │
                        ▼
                       鲍勃
```

图谱节点和边必须对应真实 Entity/Relation 数据，而不是 UI 自行生成的相似度线。

---

# 26. Node / Edge Inspector

点击节点：

```text
爱丽丝
────────────
类型：Character
Aliases：Alice、银翼之花

当前关系：
→ 银翼骑士团 / member_of
→ 鲍勃 / distrusts
→ 月银剑 / formerly_owned

来源：
Episode ...
Message ...
```

点击边：

```text
爱丽丝 → 鲍勃
────────────
关系：distrusts
状态：active
confidence：0.91
validFrom：...
validUntil：...
证据：...
```

支持跳转原始来源消息（如果现有 UI 架构允许）。

---

# 27. 手工纠错

必须允许用户：

- 新建实体；
- 修改实体；
- 添加/删除 alias；
- 合并实体；
- 新建关系；
- 修改关系；
- 使关系失效；
- 删除错误推断；
- 接受/拒绝 pending relation。

AI 没有最终事实裁决权，用户拥有最终控制权。

---

# 28. Entity Merge

合并必须安全处理：

```text
Alice + 爱丽丝 → 爱丽丝
```

同时：

- 重定向 incoming/outgoing relations；
- 合并 evidence；
- 合并 aliases；
- 去重重复 relation；
- 更新 embedding/search alias；
- 保留 merge audit 信息，至少足以调试。

---

# 29. 历史迁移

旧用户升级：

```text
现有记忆继续可用
Memory Graph 初始可为空
```

禁止启动时自动扫描全历史。

提供用户主动操作：

```text
从历史记忆构建 Memory OS

范围：
- 最近 50 条
- 最近 100 条
- 最近 500 条
- 全部
- 自定义
```

处理流程：

```text
History
  ↓
Chunk
  ↓
Episode Import
  ↓
Fact Extraction
  ↓
Entity Resolution
  ↓
Relation Extraction
  ↓
Deduplicate
  ↓
Persist
```

必须提供进度、可取消和错误统计（如果现有任务框架支持）。

---

# 30. Scope 设计

必须先审计现有 Luker 作用域，再决定 Memory OS scope。

至少考虑：

- global/user scope
- character scope
- chat scope
- group chat scope

原则：

- 不重复造作用域概念；
- 不让不同角色卡的世界事实无意串线；
- 明确什么可以跨 chat 继承；
- import/export 后作用域仍稳定。

---

# 31. 性能与异步要求

必须保证：

- Memory Graph 抽取失败不阻断正文；
- 记忆 consolidation 不应长时间占用主线程；
- Graph UI 大图渲染不能冻结 Android WebView；
- 图谱查询必须有 depth/node/relation 上限；
- embedding 和 extraction 支持队列化；
- teardown/chat switch 时不得把旧 scope 任务写入新 scope；
- 同一消息重复事件不得造成重复写入；
- reload/hydration 后数据一致。

重点测试 race condition。

---

# 32. 降级策略

任一子模块失败：

```text
Graph extraction failed
→ vector memory still works
→ plain text / MVU / LoreState paths still work
→ chat generation still works
```

```text
Embedding unavailable
→ Graph + FTS + recent episode fallback
```

```text
Graph disabled
→ current legacy/vector path continues
```

重构初期推荐 feature flag，确保新旧路径可对比。

---

# 33. 配置建议

示例：

```text
Memory OS
────────────
[✓] 启用 Memory OS
[✓] 保留向量记忆
[✓] 启用实体关系图谱
[✓] 将图谱加入检索

自动抽取：开启
最低自动接受置信度：0.75
低置信度：进入待确认

Graph retrieval depth：2
最大节点：20
最大关系：30

Context budget：可配置
```

具体设置布局必须遵循现有 Luker UI 习惯。

---

# 34. 开发阶段

## Phase 1 — Audit & Adapter

执行记录（2026-09-16）：审计及适配实现见 [MEMORY_OS_PHASE1_AUDIT.md](MEMORY_OS_PHASE1_AUDIT.md)。实际系统已有 graph/FloorState/Agent API，后续按该映射接续，保留本方案的阶段顺序。

- 审计当前记忆实现；
- 找到唯一主调用链；
- 为现有 vector memory 做 adapter；
- 建立 feature flag；
- 不改变用户行为。

## Phase 2 — Provenance / Episode

执行记录：[MEMORY_OS_PHASE2_PROVENANCE.md](MEMORY_OS_PHASE2_PROVENANCE.md)。已实现来源/Episode/失效链并完成可用环境的测试。依用户 2026-09-16 最新指示，保留未覆盖的真机/模型项目，继续后续阶段，不要求用户先手动验收。

- Episode Store；
- Source revision；
- Dependency Tracker；
- swipe/edit/delete 失效链。

这一阶段通过后再继续。

## Phase 3 — Atomic Facts

执行记录：[MEMORY_OS_PHASE3_ATOMIC_FACTS.md](MEMORY_OS_PHASE3_ATOMIC_FACTS.md)。

- Fact extraction；
- explicit/inferred 区分；
- evidence；
- merge/reinforce/supersede。

## Phase 4 — Temporal Graph

执行记录：[MEMORY_OS_PHASE4_TEMPORAL_GRAPH.md](MEMORY_OS_PHASE4_TEMPORAL_GRAPH.md)。用户已明确允许不兼容旧数据，后续不增加旧数据迁移前置条件。

- Entity；
- Alias；
- Entity Resolution；
- Relation；
- Temporal validity；
- Conflict Resolver；
- Merge。

## Phase 5 — Hybrid Retrieval

执行记录：[MEMORY_OS_PHASE5_HYBRID_RETRIEVAL.md](MEMORY_OS_PHASE5_HYBRID_RETRIEVAL.md)。统一检索已接入实际记忆注入路径；精确数值时间通过 `at` 指定，后续自然语言解析与大图调优不作为本阶段的虚假完成项。

- Query Analyzer；
- Retrieval Planner；
- Vector Retriever；
- Keyword/FTS Retriever；
- Graph Retriever；
- Episode Retriever；
- Fusion/Rerank；
- Context Budget。

## Phase 6 — Generic State Providers / Orchestrator Integration

执行记录：[MEMORY_OS_PHASE6_STATE_PROVIDERS.md](MEMORY_OS_PHASE6_STATE_PROVIDERS.md)。可选状态适配、版本证据、当前字段融合和 Orchestrator 共享召回已实现；外部框架完整运行、字段映射与注入去重的验证范围以执行记录为准。

按第 17 节修订实施，保留 Phase 1–5 的通用核心：

- 先验证普通文字卡无 Provider 的完整路径；
- 核验 MVU 与当前 LoreState 脚本的真实能力，建立可选、只读、可清理的状态适配；
- 接入 Provider 证据、revision 失效和当前状态 / 历史融合，而非只检查正文变化；
- 覆盖第 17.5 节三类卡与共存、缺席、迟到、冲突验收；
- 统一世界记忆；agent 私有 scratch 与共享长期记忆分离。

## Phase 7 — Graph UI

已实现；当前代码映射、用户纠错来源和验证范围见 [Phase 7 执行记录](MEMORY_OS_PHASE7_GRAPH_UI.md)。

- Global Graph；
- Local Graph；
- Inspector；
- Filters；
- Pending review；
- Manual correction。

## Phase 8 — Migration / Rebuild

- 历史记忆构建；
- 进度；
- 取消；
- 去重；
- 回滚/重建。

## Phase 9 — Optimization

- 大图性能；
- retrieval 调权；
- extraction 准确率；
- Android 回归；
- memory debug tools。

---

# 35. 必测场景

## A. 基本事实

输入：

```text
爱丽丝加入银翼骑士团。
```

结果：

```text
Entity: 爱丽丝
Entity: 银翼骑士团
Relation: member_of
Evidence: 对应原始消息
```

## B. Alias

已有：

```text
银翼之花 = 爱丽丝
```

新文本：

```text
银翼之花拔出了剑。
```

不得创建第二个爱丽丝。

## C. Relation Evolution

```text
爱丽丝信任鲍勃。
```

之后：

```text
爱丽丝发现鲍勃欺骗她，不再信任鲍勃。
```

旧关系进入 superseded/history，新关系 active。

## D. Evidence

任意 relation 必须可以找到原始来源。

## E. Swipe

生成 A 后记忆 A 写入；用户 swipe 到 B。

A 的所有派生记忆必须 stale/invalid，不得继续参与 active retrieval。

## F. Edit old message

编辑旧楼层后，派生 facts/relations/summaries 必须正确重建或标 stale。

## G. Delete / rollback

删除消息后不得残留幽灵 relation。

## H. Graph Retrieval

当前 prompt 未直接写“月银剑”，但通过：

```text
爱丽丝 → formerly_owned → 月银剑
```

可以召回。

## I. Optional State Provider Priority

历史 memory 说角色在王都，当前有效且拥有该字段的 MVU 或 LoreState 快照明确在黑森林。

最终 current context 不得仍声称角色当前在王都。

## J. Multi-agent

多个 agent 看到同一份共享世界事实，不各自产生独立事实副本。

## K. 大图

至少构造：

```text
1000 entities
3000 relations
```

检查局部查询与 UI 性能。

---

# 36. 回归测试范围

必须关注：

- 普通聊天；
- regenerate；
- swipe；
- edit；
- delete；
- chat rollback；
- character switch；
- chat switch；
- group chat（如当前支持）；
- 多智能体编排；
- LoreState；
- 当前 vector memory；
- import/export；
- backup/restore；
- Web；
- Android。

---

# 37. 首期明确不做

首期禁止范围膨胀到：

- 3D 图谱；
- VR；
- PageRank 剧情推荐；
- 自动派系发现；
- 复杂社区算法；
- 时间动画；
- 云端图数据库；
- 自动永久删除旧真相；
- 启动时全量重建全部历史。

先把底层正确性做稳。

---

# 38. 最重要的工程优先级

必须按：

```text
1. Source Provenance
2. Entity Identity
3. Relation Semantics
4. Temporal Validity
5. Invalidation / Rebuild
6. Retrieval
7. Context Composition
8. UI
```

而不是：

```text
1. 漂亮的蜘蛛网
2. 动画
3. 节点颜色
4. 最后才考虑事实如何存
```

---

# 39. 验收标准

## 数据层

- [ ] Episode 有稳定来源
- [ ] Fact 有 evidence
- [ ] Entity 使用稳定 ID
- [ ] Alias 可解析
- [ ] Relation 可持久化
- [ ] Temporal validity 可工作
- [ ] active/history 可区分
- [ ] Dependency 可追踪
- [ ] Entity merge 可用

## 生命周期

- [ ] Swipe 不留下旧记忆
- [ ] Regenerate 不留下旧记忆
- [ ] Edit 会使派生记忆失效/重建
- [ ] Delete/Rollback 不留下幽灵记忆
- [ ] Chat/character switch 无跨 scope 写入

## Retrieval

- [ ] Vector retrieval 正常
- [ ] FTS/keyword retrieval 正常
- [ ] Graph retrieval 正常
- [ ] Episode retrieval 正常
- [ ] Query planning 生效
- [ ] Fusion/rerank 生效
- [ ] Context budget 生效
- [ ] 普通文字卡无 Provider 可完整运行；MVU / LoreState 当前字段权属、冲突与历史优先级正确

## 多智能体

- [ ] Shared world memory 唯一
- [ ] agent private scratch 不污染长期事实
- [ ] 编排主链路正常

## UI

- [ ] Global Graph
- [ ] Local Graph
- [ ] 1/2/3 hop
- [ ] Node inspector
- [ ] Edge inspector
- [ ] Evidence 查看
- [ ] Pending review
- [ ] Manual correction
- [ ] Entity merge

## 稳定性

- [ ] Memory OS 故障不阻断正文生成
- [ ] 旧数据兼容
- [ ] migration 可控
- [ ] Web 正常
- [ ] Android 正常

---

# 40. Codex 每阶段交付要求

每个 Phase 完成后都要说明：

1. 当前 `custom-release` 基线 SHA；
2. 当前工作分支；
3. 审计或设计结论；
4. 实际修改文件；
5. 数据格式/数据库迁移；
6. 复用了哪些现有基础设施；
7. Web/Android 差异；
8. 实际运行了哪些测试；
9. 未运行哪些测试；
10. 当前 commit SHA；
11. 已知问题；
12. 下一阶段入口。

如果实现产生长期架构、迁移或维护负担，再按仓库协议更新 `AI_HANDOFF.md`。

不要仅提交代码而不留下可继续接手的架构说明。

---

# 41. 最终目标

重构前：

```text
Memory #1
Memory #2
Memory #3
Memory #4
```

重构后：

```text
                         王都
                          │
                       occurred_at
                          │
            月银剑 ─── 王都政变 ─── 鲍勃
               │            │          │
          formerly_owned  participated  leader_of
               │            │          │
               └──────── 爱丽丝 ─── 银翼骑士团
                            │
                         distrusts
                            │
                            ▼
                           鲍勃
```

并且每一个节点、事实和关系都能回答：

```text
它是谁/是什么？
它与谁有关？
为什么建立这条关系？
来源哪一条剧情？
什么时候有效？
现在是否仍有效？
如果原始消息被重写，应该如何失效和重建？
当前问题是否真的需要召回它？
```

最终目标不是做一个“像 Obsidian 的图”，而是把 Luker 从“相似文本记忆”升级为真正可演化、可纠错、可追溯、可时序查询、可参与多智能体 RP 推理的 Memory OS。
