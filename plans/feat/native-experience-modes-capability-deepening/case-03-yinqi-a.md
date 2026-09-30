# Atria Native Experience Modes & Capability Deepening — Case Study 03A — 银麒赎世

> Case 03 is split only to control reading size; original section text is preserved.

## 二十六、案例压力测试 03 — 《银麒赎世》V24.4（大型 SillyTavern / MVU Application）

### 26.1 样本定位

本轮样本为用户上传的：

- `V24.4.json`
- Character：`银麒赎世`
- `chara_card_v3 / spec_version 3.0`
- 版本：`24.4`
- 样本生成日期：2026-09-26
- 卡内说明对应 V24.4 发布：2026-09-13

该样本已经明显超出“角色卡 + 状态栏”。

其真实产品形态包含：

- 16 页 Opening Wizard；
- 主叙事；
- 独立系统面板；
- 独立手机应用壳；
- 任务 / 商城 / 背包 / 战斗 / 据点 / 事件链；
- 私聊 / 群聊 / 朋友圈 / 论坛 / 直播 / 监控；
- 多账号视角；
- 世界动态推演；
- 文生图；
- MVU 双模型；
- 独立长期存储；
- 删楼回滚保护；
- 配置体检 / 存档体检 / Runtime Diagnostics；
- 多个独立模型调用通道。

Card 内当前还包含：

- 182 个 Worldbook entry；
- 29 个 Regex；
- 9 个 Tavern Helper script；
- 手机 UI 与系统面板均已发展为大型 application code。

因此本样本最适合检验：

> **当一个“角色卡”已经自行长出多应用、多模型、多视角、长期持久化与自治世界时，Atria Native Capability Layer 还缺什么。**

本轮仍然只审计产品能力，不设计 SillyTavern / MVU 兼容层。

### 26.2 第一结论：这不是一套 UI，而是多个 Runtime Domain

该卡至少同时维护：

```text
Narrative Domain
Game / World Domain
Task Workflow Domain
Phone / Social Domain
World Dynamics Domain
Battle Activity
Image / Media Domain
Diagnostics / Repair Domain
```

旧实现被迫把这些内容压进：

- MVU；
- chat metadata；
- IndexedDB；
- Worldbook；
- Regex；
- iframe；
- Tavern Helper script；
- 多条独立 API。

Atria 不应复制这种存储与通信结构。

但它证明：

> **Full / Hybrid 的能力上限必须允许一个 Package 拥有多个长期运行的 application domain，而不是只有 World State + 一棵 UI Tree。**

### 26.3 Atria 已有地基：Session State 本身不是新发明

本轮再次复核当前 `main@4dab353a`。

`SessionCore` 已经支持任意非保留的 Native Session State namespace，并且这些 namespace：

- 随 immutable Session Revision 提交；
- 随 Branch 分叉；
- 可以在同一 runtime commit 中与 Timeline append 一起提交；
- portable namespace 会进入 Native Save export/import；
- 历史 Revision 继续保持不可变。

因此《银麒赎世》为了手机消息、论坛、图片索引、任务旗标等自行建立：

- chat metadata；
- IndexedDB；
- 双源同步；
- snapshot ring；

并不意味着 Atria 要再造一个数据库。

真正缺的是：

> **Package-facing Typed Session Application State Contract。**

也就是把当前底层已有的 namespace 存储能力正式提升成 Experience Capability。

### 26.4 新缺口 26 — Epistemic / Actor Perspective Projection

这是本样本最重要的新发现之一。

该卡后期专门实现了：

- 某 NPC 是否在当前场景；
- 某 NPC 是否亲历近期事件；
- 两个 NPC 是否拥有共同经历；
- 圈外人物不能知道主角私密主线；
- 私聊只允许参与者知道；
- 公共事件可以传播；
- 私密系统信息不能传播；
- 同一段对话从不同账号查看仍然一致；
- 冒用账号时，收到消息的人可能形成错误认知；
- 角色可以“相信某件事”，但这件事未必是 World Truth。

这已经不是普通 Knowledge activation。

当前 Atria 已有很好的基础：

- Knowledge target / visibility 已支持 `narrator / actor / agent / user`；
- Knowledge 可以 target exact actor id；
- Context Compiler 已经能为 Narrator / Actor / Agent 生成隔离的 ContextPlan。

但当前这些机制主要回答：

> “一份稳定 Knowledge 对谁可见？”

还没有一等回答：

> “运行时发生的一件事，哪些角色亲历、听说、收到、误信、怀疑或完全不知道？”

因此新增：

> **Epistemic / Actor Perspective Projection**

候选数据流：

```text
World Truth / Event Journal
            ↓
Exposure / Communication / Observation
            ↓
Actor Perspective Projection
            ↓
Actor-targeted ContextPlan
```

绝对不要维护：

```text
NPC A World State clone
NPC B World State clone
NPC C World State clone
```

否则必然形成多套事实权威。

候选 Perspective Record：

```text
Perspective Record
├─ actorId
├─ sourceRef
├─ channel
│  ├─ witnessed
│  ├─ direct_message
│  ├─ told_by
│  ├─ public_broadcast
│  ├─ surveillance
│  ├─ rumor
│  └─ inference
├─ observedAtRevision
├─ claim / typed subject
├─ epistemic status
│  ├─ known
│  ├─ believed
│  ├─ suspected
│  └─ disputed
└─ provenance
```

这里必须区分：

- **World Truth**：世界真实发生了什么；
- **Actor Belief / Observation**：某个角色认为发生了什么。

后者可以是错的。

这样才能原生支持：

- 秘密；
- 谣言；
- 误会；
- 身份冒用；
- 监控；
- 分队行动；
- NPC 私聊；
- 多 POV；
- 玩家不在场事件；
- dramatic irony。

Actor Perspective 不修改 World Truth。

它只影响：

- actor-targeted model context；
- limited-POV narrator context；
- 当前视角 UI 的信息投影；
- Knowledge / Memory / Conversation 的可见投影。

### 26.5 Perspective 与 Knowledge / Memory 的边界

冻结建议：

#### Knowledge

回答：

> 世界中有什么稳定知识 / 规则 / 设定？

#### Memory

回答：

> 过去哪些经历值得长期召回？

#### Epistemic Perspective

回答：

> **这个角色现在有资格知道 / 相信什么？**

因此 Epistemic Layer 不替代 Knowledge / Memory。

它是 Context Projection 的一层 runtime evidence / filter：

```text
Knowledge
Memory
Conversation
World Events
Session App Events
        ↓
Perspective Projection(actorId)
        ↓
Context Compiler
```

### 26.6 新缺口 27 — Package Model Task / Generation Task Contract

《银麒赎世》不是只有主 Narrator 与一个变量模型。

它实际允许为不同产品功能分别配置模型通道，例如：

- social chat；
- task evaluation；
- world dynamics；
- forum；
- live；
- surveillance；
- shop evaluation；
- outpost sync；
- plot task；
- image generation。

这揭示了当前 Atria 的真实边界。

当前 `main`：

- Native Generation Host 只接受固定平台 role：
  - `narrator`
  - `intent_resolver`
  - `event_interpreter`
  - `orchestrator`
  - `studio`
  - `memory`
  - `search`
- Game Runtime Role Router 目前只含：
  - `narrator`
  - `intent_resolver`
  - `event_interpreter`
  - `orchestrator`
  - `studio`
- Package `runtime.modelPrompt` 可以声明 namespaced role intent 和 exact Prompt / Generation ref，但 Host 当前没有一等的任意 Package task execution contract。

所以一个复杂游戏目前无法干净声明：

> “我有一个 social-chat model task、一个 quest-evaluator、一个 world-dynamics task，它们不是 Narrator，也不是 Event Interpreter。”

因此新增：

> **Package Model Task / Generation Task Contract**

候选：

```text
ModelTaskDefinition
├─ taskId
├─ semantic role
├─ bindingSlotId
├─ execution class
│  ├─ turn-stage
│  ├─ auxiliary
│  └─ interactive
├─ input schema
├─ context target
│  ├─ narrator
│  ├─ actor:<id>
│  ├─ agent
│  └─ explicit projection
├─ context policy
│  ├─ allowed lanes
│  ├─ required lanes
│  └─ budget hints
├─ task promptProgramRef
├─ generation intent / recommendation
├─ required capabilities
├─ output contract
└─ diagnostics policy
```

重要：

> Model Task 定义“这个模型工作是什么”，不是“什么时候运行”。

执行时机仍然分别属于：

- Package Turn Contract / synchronous stage；
- Auxiliary Task Runtime；
- Runtime Automation；
- UI Action。

因此：

```text
Model Task Definition
        ×
Execution Runtime
```

二者正交。

### 26.7 Package Model Task 不能携带玩家私有 API 配置

即使增加 Package Model Task，也不能复制 phoneAPI 的：

```text
Package
→ URL
→ API Key
→ model name
```

Package 只能声明：

- task semantic；
- required capability；
- Prompt / Generation author intent；
- output contract。

玩家仍然通过：

- Connection；
- Model；
- Runtime Route；
- Secret Store；

决定实际请求发给哪里。

因此：

```text
Package Model Task
        ↓
player-owned Runtime Route binding
        ↓
Connection / Model / Secret
```

Package 永远不能读取 Secret。

### 26.8 Model Task 必须支持 Actor-targeted Context

《银麒赎世》的 NPC 私聊与群聊暴露了关键要求：

一个 `social_chat` task 不能默认拿当前主聊天的完整 Context。

它应声明：

```text
task = social_chat
participants = [A, B]
target = actor perspective / conversation scope
```

Runtime 再通过：

- Epistemic Projection；
- Actor Knowledge；
- shared Conversation；
- shared Memory；
- public World observations；

编译该 Task 自己的 ContextPlan。

因此 Package Model Task 与第 26 项 Epistemic Layer 是直接互补关系。

### 26.9 Context Source Budget 应进入 Model Task contract

该卡的“AI 感知”允许分别控制：

- social；
- forum；
- live；
- memory；
- world dynamics；

各自注入量。

Atria 当前 Context Compiler 已有 lane cap / minimum guarantee 等预算地基。

所以不新增“AI 感知 API”。

应把它 Native 化为：

> **Task-level Context Source Policy**

Package 可以声明：

- 哪些 Context lane 与该 Task 有意义；
- required / optional；
- suggested max budget。

Player Preference 可以控制：

- 某些 optional source 是否启用；
- detail level。

最终 token safety 仍由 Host Context Compiler 决定。

### 26.10 新缺口 28 — Typed Session Application State

《银麒赎世》的手机系统说明，存在大量：

> 必须长期保存、必须随 Branch / Revision 回滚，但并不是 World Truth 的数据。

例如：

- private message threads；
- group threads；
- forum posts；
- social graph derived records；
- generated-media index；
- task workflow state；
- async task status；
- application inbox / unread；
- world-dynamics feed；
- UI-visible operation history。

它们不应进入 World State。

也不能进入 Local UI State，因为关闭 UI 后不能消失。

也不属于 Player Preference。

因此正式定义：

> **Session Application State**

它是现有 Native Session State namespace 的 Package-facing typed contract。

候选：

```text
Session Application Domain
├─ domainId / namespace
├─ schema
├─ storage shape
├─ indexes / query projections
├─ commands
├─ events
├─ reducers
├─ migration version
└─ retention policy
```

权威写入仍然不能是：

`session.patch("phone.messages", ...)`

而应为：

```text
Session App Command
→ validate
→ Event
→ Reducer
→ new Session namespace state
→ immutable Revision
```

World State 的冻结原则不变：

```text
World Command
→ Event
→ World Reducer
```

二者共享 typed authority 思想，但 authority domain 不同。

### 26.11 六种状态必须正式分开

经过三个重型样本，当前 Native 设计应明确区分：

1. **World State**
   - 游戏 / 剧情真实事实；
   - Branch-aware；
   - typed Command / Event / Reducer。

2. **Session Application State**
   - 当前存档的应用域持久数据；
   - Branch-aware；
   - phone / forum / workflow / derived feed 等；
   - typed Session App Command / Event / Reducer。

3. **Activity State**
   - 某个 Activity 内部的临时事务状态；
   - 完成后 settlement；
   - 可按 policy 决定是否支持 resume。

4. **Local UI State**
   - tab / form / open state；
   - 非剧情权威。

5. **Message-local UI State**
   - 单条 Projection block 的临时交互状态。

6. **Player Preference State**
   - 跨 Session；
   - 不随 Branch 回滚。

Legacy MVU / LoreState Provider 不算新的 Native authority，只是兼容读取。

### 26.12 大型 Session App 数据不能物理实现成一个巨型 JSON

《银麒赎世》最后不得不：

- chat metadata + IndexedDB 双存储；
- 大 key 单独存；
- cache；
- backup；
- snapshot；
- merge；
- 去重。

Atria 虽已有 Session namespace 底层，但未来 Session Application State 仍要避免：

> 每发一条手机消息就复制整个百万级 social state。

因此实现阶段应允许 Host-owned 的：

- chunked collection；
- keyed record；
- immutable page/chunk；
- index projection；
- content-addressed payload。

但对 Package 仍暴露统一 typed domain contract。

也就是说：

> **逻辑上是一个 Session Application Domain；物理上不要求是一个单体 JSON document。**

这是 persistence implementation concern，不开放数据库句柄给 Package。

### 26.13 Branch / Retry 必须覆盖所有 Session-authoritative Domain

该卡需要 snapshot ring，根因是：

- MVU；
- phone metadata；
- IndexedDB；
- root metadata；

分散在多个权威来源。

Atria 不应复制 snapshot ring。

应冻结：

> **凡属于 Session-authoritative 的状态，都必须随同一 Revision graph 分支 / 回滚。**

包括：

- World State；
- Session Application State；
- Event Journal；
- Activity settlement result；
- committed Auxiliary Task result。

不包括：

- Player Preference；
- device rendering preference；
- immutable Package Data。

这使：

- Retry；
- Restart From Here；
- Branch；
- SavePoint；

天然不会产生：

> “剧情回去了，手机 / 任务 / 论坛还留在未来”。

### 26.14 Auxiliary Task Runtime 得到第三次强化

该卡的 task evaluation、world dynamics、forum/live 等链路暴露大量真实工程问题：

- 请求很慢；
- rate limit；
- 用户取消；
- 切 Session 后旧结果回来；
- 同一 Task 并发两次；
- late result 写入新 Revision；
- API 返回成功但无有效结果；
- fallback；
- pending UI；
- retry。

因此第 24 项进一步冻结：

Auxiliary Task 必须绑定：

```text
Session
Branch
Revision anchor
Model Task Definition
ContextPlan snapshot
Runtime Route snapshot
```

完成时：

```text
result
→ anchor check
→ stale?
→ validate output
→ authority-specific apply
→ CAS commit
```

若 Session / Branch / Revision 已变化且 policy 不允许 rebase：

> 结果进入 `stale`，绝不偷偷写入当前状态。

### 26.15 Runtime Automation 深化为 World Process Recipe，但不新增第 29 项

该卡有：

- 每日刷新；
- 据点日结；
- 派遣返回；
- NPC 据点发展；
- 末日阶段规则；
- 周期性世界动态；
- 事件生成；
- 自动社交。

Atria 当前 Package manifest 虽已有 `world-simulation` capability 名称，但 `main` 中它目前主要还是 capability vocabulary，并不存在独立的 World Simulation runtime。

本轮不新增一个新的平行 scheduler。

第 13 项 Runtime Automation 应深化为：

> **Runtime Automation / World Process Recipe**

候选：

```text
WorldProcess
├─ processId
├─ trigger
│  ├─ turn
│  ├─ clock
│  ├─ world-time
│  ├─ event
│  └─ state transition
├─ condition
├─ idempotency key
├─ steps
│  ├─ deterministic Command
│  ├─ Rule evaluation
│  ├─ Auxiliary Model Task
│  └─ observation publication
├─ catch-up policy
├─ failure policy
└─ diagnostics
```

例如跨过 7 个游戏日时：

- 不能靠 UI `setInterval`；
- 不能要求模型脑补“七次日结”；
- Runtime 根据 catch-up policy：
  - exact；
  - bounded；
  - aggregate；
- 产生确定性事件 / Task；
- 最终提交 Session Revision。

因此：

> Runtime Automation 决定“什么时候跑”；World Process Recipe 决定“一次自治流程由哪些受控步骤组成”。

仍不允许 Package 定时执行 arbitrary JS。

### 26.16 Experience Diagnostics 升级为 Health / Diagnostics / Repair / Migration

本样本的“配置体检 / 存档体检 / 运行诊断”不是边角功能。

当 Experience 依赖：

- Model Task；
- Runtime Route；
- Add-on；
- Asset Pack；
- optional capability；
- Session schema；
- background job；

玩家必须能知道：

> “为什么这一块没有工作？”

因此第 20 项正式扩展为：

> **Experience Health / Diagnostics / Repair / Migration**

至少包括：

#### Preflight

- Package requirements；
- optional capability；
- Model Task route binding；
- Asset Pack availability；
- Add-on compatibility；
- Host capability。

#### Runtime Diagnostics

- Turn / Task trace；
- ContextPlan；
- selected Runtime Route；
- token budget；
- Action validation；
- World Process；
- Auxiliary Task；
- stale / retry / cancellation；
- Projection error。

#### Save Health

- Session domain schema version；
- impossible references；
- missing assets；
- orphan records；
- migration status。

#### Repair

必须：

- preview diff；
- explicit player confirmation；
- typed remediation；
- undo / Revision when it mutates Session authority。

Package 不得：

- 任意修改玩家全局设置；
- 自动启用 Plugin；
- 自动改 Secret；
- 删除其它 Package 内容。

需要宿主设置变化时，只能生成：

> Host-owned remediation suggestion / action。

### 26.17 Capability Negotiation 必须玩家可见

此前 Host capability negotiation 更偏运行时：

`scene3d available?`

本样本说明它还必须可解释：

```text
Feature: World Dynamics

required:
- task route configured
- model.text supported

optional:
- long context >= suggested budget

status:
- ready
- degraded
- unavailable

remediation:
- configure route
```

所以 capability negotiation 不能只是日志里的 Boolean。

Studio 与 Player Runtime 都需要展示：

- requirements；
- effective capabilities；
- degradation path；
- remediation。

### 26.18 多模型 ≠ MVU 双模型专用 API

本样本推荐：

> Narrator 写故事 + 另一个模型写变量补丁。

Atria 当前已经有更干净的：

- narrator；
- event_interpreter；
- narrative-outcome；
- typed Command / Event authority。

因此不要增加：

- “MVU extra model”；
- “变量模型 API”。

真正应该吸收的是：

> **一个 Experience 可以拥有多个职责明确、输出 contract 不同、可分别绑定 Runtime Route 的 Model Task。**

变量解释只是其中一种 Task。
