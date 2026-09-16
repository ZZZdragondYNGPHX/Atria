# Luker Agent & Memory UI v2 — 最终实施方案

> 状态：Ready for implementation  
> 工作分支：`feat/agent-memory-ui-v2`  
> 正式基线：`custom-release@be3a2f573d54a63182cf47ca8c2f145e2accc973`  
> Engine 实现提交：`64789f790692644dda9e17c362b0f837685434e9`  
> 前置条件：Agent Runtime v2 与 Orchestration Engine v2 均已完成并合入 `custom-release`。  
> 产品方向：Standalone-first；未来目标是可脱离 Luker 的独立类 SillyTavern Agent 应用。

---

## 0. 本方案现在以真实实现为准

本方案不再假设 Engine contracts。

已确认的正式结构：

- Runtime：`public/scripts/lib/agent-runtime/`
- Engine 核心：`public/scripts/lib/orchestration-engine/`
- Luker Engine adapter：`public/scripts/extensions/orchestrator/engine-v2/`
- Runtime projection：`public/scripts/extensions/orchestrator/run-state/`
- 当前 Run Panel：`public/scripts/extensions/orchestrator/run-panel/`
- Memory OS：`public/scripts/extensions/memory-graph/`

Engine 已完成默认 Single/Spec、Loop、Agenda、Director 路径迁移；显式 `agentRuntimeV2 === false` 等 compatibility caller 仍存在，但不是 UI v2 的产品数据模型。

### 0.1 Engine 的稳定产品概念

当前 Plan contract：

- `schemaVersion: 1`
- mode：`single | spec | loop | agenda | director`
- node kinds：`agent | router | join | judge | synthesize | terminal`
- output kinds：`guidance | reply`
- outcomes：`completed | partial | budget_exhausted | failed | cancelled | waiting_user`
- arbitration：`pass-through | merge | synthesize | judge | consensus | best-effort`

稳定身份至少包括：

- `planId`
- `runId`
- `stepId`
- `effectId`
- `nodeId`
- `resultId`
- branch child run ID
- checkpoint version

### 0.2 Capability 已经是代码层权限

正式 Capability：

```text
memory.recall
tool.call
agent.handoff
agent.delegate
graph.inspect
graph.mutate
result.submit
result.judge
reply.read
reply.write
reply.submit
```

UI 只能编辑/展示这些权限，最终授权继续由 Engine/Runtime enforce。

### 0.3 Policy State 已经可恢复

Engine `policyState` 已拥有：

```text
planId / planFingerprint
activeNodeId / activeNodeIds
graphRevision / taskGraph
completedNodeIds
results / resultRefs / attempts
edgeVisits
arbitrationState / outputState
review state
budgets
pending / dispatch / requestFinalize
events
```

因此 Graph、Run、Result、Arbitration UI 不应创建第二套执行状态。

### 0.4 UI 已有正式 Engine events

当前 Observer 已可投影：

```text
graph.compiled
graph.node.started
graph.mutated
result.created
arbitration.started
output.ready
```

并继续接收 Runtime 原生 model/tool/memory/handoff/fanout/join/cancel/resume/context events。

UI v2 应扩展 projection，而不是解析 console log 或 prompt 文本。

---

## 1. 产品目标：Agent & Memory Workspace

把目前分散的：

- 编排设置
- 预设管理
- Run Panel
- Agent 状态
- Memory OS Inspector
- History Build
- Diagnostics / Trace

收敛成一个统一工作台：

```text
Agent & Memory Workspace
├── Presets
├── Live Run
├── Graph
├── Agents
├── Memory
└── Diagnostics
```

这不是把旧面板塞进同一个弹窗，而是使用同一套 Runtime / Engine / Memory 事实源建立相互联动的视图。

---

## 2. Standalone-first 硬规则

未来产品目标不是永久作为 Luker 扩展存在。

因此：

1. 新 UI / schema 优先服务独立 Agent 应用。
2. 不以 Luker 旧 preset、character override、旧 DOM、旧 import/export 格式为长期兼容合同。
3. 默认允许 breaking change。
4. 兼容只有在成本很低、没有双写、没有第二事实源、不会污染新 schema 时才考虑。
5. 旧 caller adapter 可以在开发期短暂存在，验证完成后删除。
6. Luker-specific bridge 必须留在 adapter 层，不能进入通用 Workspace / Preset / Agent / Memory domain model。
7. LoreState / MVU / Chat history 视为 provider/source adapter，不成为 Memory 核心 schema。

详见 `STANDALONE_FIRST_PRODUCT_POLICY.md`。

---

## 3. 统一编排预设库

彻底废除“全局预设定义 / 角色预设定义”双轨。

目标：

```text
Unified Orchestration Preset Library
        │
        ├── Preset A
        ├── Preset B
        └── Preset C

Bindings
├── default -> Preset A
├── character:X -> Preset B
└── conversation:Y -> Preset C (可选)
```

角色和会话只保存 `presetId` 引用，不保存 preset definition 副本。

### 3.1 建议新 authoring schema

不要直接保存 Runtime `policyState`。

建议：

```js
OrchestrationPresetV2 = {
  schemaVersion: 1,
  id,
  name,
  mode,
  planTemplate,
  editorMetadata,
}
```

`planTemplate` 应能编译为当前 `OrchestrationPlan schemaVersion: 1`。

运行链：

```text
Unified Preset
    -> Preset Compiler
    -> validated OrchestrationPlan
    -> Engine Policy Controller
    -> Agent Runtime
```

当前 `compilePreset()` 对 Luker profile 的只读适配继续属于 Host compatibility adapter；新 Workspace 的原生保存路径不应继续以旧 profile shape 为主。

### 3.2 Binding schema 要 host-neutral

优先：

```js
PresetBindings = {
  defaultPresetId,
  entries: [
    { scope: 'character', subjectId, presetId },
    { scope: 'conversation', subjectId, presetId },
  ],
}
```

独立应用可以把 `scope` 扩展为 persona/workspace/project，而无需重写 preset store。

### 3.3 不做旧数据兼容承诺

不把旧 global / character preset 自动迁移列为 DoD。

如果实现时发现一次性 importer 非常便宜，可以作为可删除工具提供；否则直接采用新 schema。

详见 `AGENT_MEMORY_UI_V2_PRESET_UNIFICATION.md`。

---

## 4. Presets / Authoring UI

一级入口直接叫“编排预设”。

页面结构：

```text
编排预设
[搜索] [新建] [复制] [导入] [导出]

当前默认：日常 RP
当前角色：深度剧情

Preset List
- 日常 RP · Agenda
- 固定审稿 · Spec
- 单人调研 · Loop
- 导演模式 · Director
```

不再出现：

- 全局预设库
- 角色预设库
- 正在编辑全局/角色
- “把当前全局复制到角色”这种双轨操作

角色特化使用普通 `Duplicate -> 新 presetId -> Bind`。

### 4.1 四模式仍保持不同 authoring 体验

Loop：

- owner Agent
- max steps
- tools / memory
- completion policy

Spec：

- static graph / stages
- worker/reviewer
- bounded edges / review rerun
- fixed fan-out / join
- output owner

Agenda：

- planner
- worker pool
- max planner rounds / max tasks / max concurrency
- dynamic graph mutate capability
- finalizer

Director：

- owner
- specialist pool
- reply read/write/submit capability
- review / delegation policy
- submit owner

Single 不作为第五套 Engine 编辑器；它是单节点模板/快捷配置。

### 4.2 Graph editor 范围

第一版优先：

- 表单 + 节点列表 + Graph preview
- Spec 支持结构编辑
- Agenda 编辑 planner/pool/policy，不让用户手绘运行时动态 Task Graph
- Loop 保持简单
- Director 展示 owner/specialists/reply ownership

不要为了“高级感”强制所有模式使用拖拽低代码画布。

---

## 5. Run Panel v2

Run Panel 从“执行日志”升级为真正的 Live Run 控制台。

### 5.1 Header

建议：

```text
Agenda · Running · 12.4s
Preset: 深度剧情
Run #xxxx
Step 7 / Budget
Agents 3 active / 5 total
Memory 4 recalls
Tools 6 calls
```

动作：

- Stop Run
- Graph
- Memory
- Diagnostics
- Export Trace
- Close

若 Runtime 暴露可安全 resume/branch cancel，再显示对应动作；UI 不伪造不存在的能力。

### 5.2 Timeline

统一展示：

```text
Planner                   ✓
  └─ graph mutated r3

Delegate / Fan-out
  ├─ Character Agent      ✓
  ├─ Timeline Agent       ✓
  └─ World Agent          running

Join                      waiting
Judge                     pending
Output Owner              pending
```

Loop / Spec / Agenda / Director 都使用同一时间线语言，但根据模式隐藏无关元素。

### 5.3 Handoff 与 Delegate 必须分开

Handoff：控制权转移。

```text
Planner --handoff--> Specialist
```

Delegate：父级保留控制权，使用 Runtime child branch/fan-out/join。

```text
Director
  ├─ Reviewer
  └─ Continuity
      ↓
    return
```

不能继续都显示成“调用 Agent”。

### 5.4 Agent / Node 卡片

至少显示：

- node kind / nodeId 友好名
- Agent role
- current task
- status
- model profile
- capability 摘要
- memory recall 数量
- tools
- attempts
- result status
- delegated by / handoff source
- elapsed / token metrics（可得时）

展开后显示：

- structured inputs
- result envelope
- provenance IDs
- context diagnostics
- memory refs
- failure/cancel/budget reason
- related Engine/Runtime events

默认不展示完整 raw prompt。

### 5.5 Result / Arbitration

Run Panel 必须认识正式 `ResultEnvelope`：

```text
resultId
nodeId / agentId
attempt
status
value / structured
provenance
```

显示 arbitration 类型：

```text
Pass-through / Merge / Synthesize / Judge / Consensus / Best-effort
```

若 Judge/Synthesizer 运行，展示输入 result IDs 和最终选择/合成 provenance，而不是只显示一段最终字符串。

### 5.6 Output ownership

Guidance：

```text
Output: Guidance
Owner: <node>
Status: completed / partial / budget_exhausted
```

Director：

```text
Output: Reply
Owner: Director
reply.read ✓
reply.write ✓
reply.submit ✓
Submitted ✓
```

最终提交权限直接来自 Plan + Capability；UI 不自己判断。

---

## 6. Graph UI

### 6.1 Preset Graph 与 Run Graph 分开

Preset Graph：保存/编译后的静态 Plan 图。

Run Graph：本轮真实执行视图，包括：

- active/completed nodes
- attempts
- dynamic Agenda taskGraph
- graphRevision
- bounded retries
- result links
- fan-out child branches
- arbitration

Agenda 的动态 `taskGraph` 不应写回 preset。

### 6.2 节点类型直接沿用 Engine

```text
agent
router
join
judge
synthesize
terminal
```

节点状态 UI 可投影为：

```text
pending / queued / running / waiting / completed / partial / failed / cancelled
```

这些是 ViewModel 状态，不修改 Engine contract。

### 6.3 Graph revision

`graph.mutated` 和 `graphRevision` 必须可见。

例如：

```text
Agenda Task Graph · revision 4
+ 新增任务 2
× 取消任务 1
↕ 调整优先级
```

可提供 revision timeline，但不建立第二份 graph persistence。

### 6.4 双向联动

Graph node -> Run card -> Agent -> Memory -> Diagnostics 必须共享 selection key：

```text
runId + nodeId (+ step/resultId)
```

不要用 DOM index 做身份。

---

## 7. Agents UI

明确分成两类信息。

### Definition

来自 Preset / Plan：

- role / instructions
- model profile
- tools
- handoffs
- capabilities
- max concurrency

### Live State

来自 Runtime/Engine：

- current node/task
- status
- attempts
- branch identity
- memory used
- tools called
- result
- output ownership

修改 Definition 只影响后续 Run；不得直接修改当前 checkpoint/policyState。

### Capability Matrix

直接展示 11 个正式 Capability，并显示 effective result。

可区分：

```text
Preset allow
Node allow
Agent allow
Mode allow
Effective
```

最终以 Engine `effectiveCapabilities()` 结果为准。

---

## 8. Memory Workspace v2

不重写 Memory OS store。

统一四个子视图：

### 8.1 This Run

按 Runtime memory events + run/step/agent ID 展示：

- 发起 Agent / Node
- recall query（若安全投影可得）
- references
- token budget
- 是否进入最终 compiled context
- source/freshness 状态

Memory 内容不复制进 Runtime checkpoint；详情按 reference 从 Memory OS guarded snapshot 读取。

### 8.2 Knowledge

整合现有 Inspector 能力：

- Entities
- Relations
- Facts
- temporal history
- provenance / Episode
- pending
- manual corrections

### 8.3 Sources

统一展示：

- Chat source
- Memory OS Episodes
- LoreState Provider
- MVU Provider
- Manual correction

明确 owner、read-only/writeable、revision/freshness。

### 8.4 Build & Maintenance

收拢：

- Historical Build
- progress/cancel
- rollback
- pending review
- repair/correction
- diagnostics

高风险维护动作进入二级区。

---

## 9. Agent × Memory 联动

这是 UI v2 的核心价值之一。

Agent/Node 卡：

```text
Memory: 6 refs
```

点击：Memory tab 自动过滤当前 `runId/nodeId/stepId`。

Memory Fact/Relation/Episode detail：

```text
Used this run by
- Planner · node planner
- Character Analyst · worker:character
```

只根据 trace/reference 证据显示，不推测。

---

## 10. Context 可解释性

Runtime 已有 `context.compiled` event。

UI 应展示实际 diagnostics 能稳定提供的层级，不解析 prompt 字符串。

目标体验：

```text
System / Runtime
Agent Instructions
Task
Recent Chat
Scratch
Memory
Tools / Environment
Total / Budget
```

如果当前 diagnostics 不足，新增 privacy-safe projection metadata；不要把完整 raw messages 持久化到 UI journal。

---

## 11. Diagnostics / Trace

普通模式：

- status
- failure
- retry / rerun
- budget exhausted
- cancel
- stale result discarded
- resume
- graph mutation
- arbitration

Developer mode：

- run/step/effect/node/result IDs
- checkpoint version
- planId / fingerprint
- graphRevision
- branch IDs
- policyState 摘要
- Runtime/Engine event JSON
- memory ref IDs
- provider/model metadata
- latency/token metrics

Trace export 继续脱敏，不输出 secret/API key。

---

## 12. UI 状态架构

严格：

```text
Runtime + Engine
    -> Projection/ViewModel
    -> UI
```

```text
Memory OS guarded snapshot
    -> Memory ViewModel
    -> UI
```

```text
Unified Preset Store
    -> Preset ViewModel
    -> Authoring UI
```

禁止：

- DOM 反推 Run 状态
- UI 保存第二份 policyState
- UI 保存第二份 Memory
- UI 自己决定 capability
- UI 自己执行 scheduler

建议通用 UI 目录最终可抽离：

```text
public/scripts/lib/agent-workspace/
  view-models/
  models/
  selectors/
```

Luker mount/persistence/provider glue 留在：

```text
public/scripts/extensions/orchestrator/workspace/
```

具体目录 Phase 0 可调整，但 domain/view projection 与 host adapter 必须分层。

---

## 13. Desktop / Mobile

### Desktop

- 可停靠右侧 Workspace
- Run + Graph 双栏
- detail secondary pane
- Memory large graph 可全屏

### Mobile / Android

- full-height drawer/sheet
- 固定一级 tabs
- Run 纵向 cards
- Graph 默认 timeline/list，可手动切 visual graph
- detail drill-down
- Stop 固定可达
- running pill 保留
- 不依赖 hover

自动 viewport 基线至少覆盖 390px 与 1440px，并延续 Engine smoke 的无 overflow 标准。

---

## 14. 性能与生命周期

- lazy mount
- inactive tab 不做高成本 graph layout
- event 增量 projection
- large graph bounded projection
- long trace 虚拟化/分页
- Memory detail 按需加载
- chat/character/workspace switch teardown
- page destroy/reopen 不重复订阅
- async projection 做 generation/scope guard

---

## 15. 实施阶段

### Phase 0 — Final UI Current Map

必须先建立：

`docs/development/AGENT_MEMORY_UI_V2_CURRENT_MAP.md`

扫描：

- current Run Panel / RunStateStore
- Engine Observer / policyState events
- Memory Inspector / History UI / diagnostics
- preset-library / character-overrides / current persistence
- executionIdentity/snapshot cache
- mobile layout

输出准确 caller map 和待删除旧 UI/storage 清单。

### Phase 1 — Native Preset Store + Binding

- 新统一 preset library
- stable preset ID
- default/character/conversation binding
- native authoring schema
- compile to validated Plan
- import/export 新 schema
- 删除新的产品路径对 global/character 双库的依赖

无需实现旧数据无损迁移；低成本 importer 可选。

### Phase 2 — Workspace Shell + ViewModels

- shell/tabs/navigation
- host-neutral view models
- desktop/mobile layout
- shared selection model
- 不改变 Runtime scheduling

### Phase 3 — Run Panel v2

- Engine timeline
- Agent/node cards
- handoff/delegate
- fan-out/join
- result/arbitration
- output ownership
- stop/export/replay

### Phase 4 — Graph + Agents

- Preset Graph
- Run Graph
- Agenda dynamic graph revisions
- Capability matrix
- Definition vs Live State

### Phase 5 — Memory Workspace

- This Run recalls
- Agent-memory linkage
- Knowledge/Source/Maintenance
- provenance
- existing correction/history reuse

### Phase 6 — Authoring UI

- four-mode editors
- native graph-aware plan authoring
- unified preset UX
- binding UX
- remove global/character dual editing semantics

### Phase 7 — Diagnostics + Trace

- context diagnostics
- Runtime/Engine/Memory trace
- checkpoint/recovery state
- privacy-safe export

### Phase 8 — Mobile / Performance / Accessibility

- 390px + wide desktop
- touch / keyboard
- graph list fallback
- long memory/trace
- teardown / reopen

### Phase 9 — Legacy UI / Storage Caller Audit

Standalone-first：

- 删除证明不再需要的旧 preset dual-store/UI
- 删除 duplicate rendering
- 旧 compatibility shim 仅在仍有真实产品 caller 时保留
- 不为了 Luker 旧数据反向污染新 schema

---

## 16. 自动测试策略

优先由 Codex 自行完成，不要求用户逐 Phase 真机验收。

必须尽量覆盖：

- preset store/bindings
- graph/view-model projections
- capability rendering
- Run Panel lifecycle
- handoff/delegate
- fan-out/join
- Agenda graph mutation
- result/arbitration
- output owner
- cancel/stale
- checkpoint/resume projection
- Agent <-> Memory linkage
- Memory guard invalidation
- desktop/mobile
- duplicate subscriptions
- page destruction/reopen
- import/export new schema

优先运行：

- unit/regression
- fake Runtime/Engine/Memory fixtures
- Edge/Chromium headless
- viewport simulation
- screenshot/DOM assertion
- IndexedDB/page destruction

Android 真机、真实 provider/model、长期人工 RP 无法自动完成时记录为 coverage gap，不阻塞开发；用户后续实际游玩再验。

---

## 17. Definition of Done

- 一个统一 Agent & Memory Workspace
- 一个统一编排 preset library
- 角色不再拥有独立 preset definition store
- preset bindings 只保存稳定 ID 引用
- 新 authoring 数据可编译成正式 OrchestrationPlan
- Run Panel 能理解 Engine nodes/results/arbitration/output ownership
- Handoff 与 Delegate 可视觉区分
- fan-out/join 可视化
- Preset Graph 与 Run Graph 分开
- Agenda graphRevision/taskGraph 可追踪
- Agent Definition 与 Live State 分开
- 11 个 Capability 可解释且实际由 Engine enforce
- 本轮 Memory recall 可追到 Agent/Node/Step
- Memory 记录可反查本轮使用者
- Context diagnostics 可解释
- Desktop/Mobile 均可用
- UI 不成为 Runtime/Engine/Memory 事实源
- 不新增第二套 provider/runtime/checkpoint/memory
- 默认不承担 Luker 旧数据兼容
- 无必要 legacy UI/storage/caller 在审计后删除
- 自动测试完成能代理的全部范围
- 真机/真实模型 gap 如实记录

完成后停留在 `feat/agent-memory-ui-v2`，不要自动合并回 `custom-release`，等待用户决定。