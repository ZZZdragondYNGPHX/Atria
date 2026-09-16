# Luker Orchestration Engine v2 — 多智能体编排深化重构方案

> 状态：Approved design / 待实现  
> 工作分支：`feat/orchestration-engine-v2`  
> 正式开发基线：`custom-release@5cc185d9b9518efa5c1b06144bcb82584a52c5fd`  
> Runtime 基线：`feat/agent-runtime-v2@5cc185d9b9518efa5c1b06144bcb82584a52c5fd`  
> 前置条件：Agent Runtime v2 Phase 0–8 已完成并已合入 `custom-release`。  
> 目标：在已完成的 Agent Runtime v2 上建立统一 Orchestration Engine，把 Loop / Spec / Agenda / Director 从“活跃兼容策略”逐步收敛为同一套 Plan / Graph / Scheduler / Capability / Arbitration 体系。

---

## 0. 已验证的现实基线

本方案以 2026-09-17 的远端实际代码为准，不再使用“Runtime 可能只在本地完成”的兜底假设。

### 0.1 Git 状态

已验证：

- `custom-release` HEAD：`5cc185d9b9518efa5c1b06144bcb82584a52c5fd`
- `feat/agent-runtime-v2` HEAD：`5cc185d9b9518efa5c1b06144bcb82584a52c5fd`
- Runtime v2 相对最初企划提交增加 11 个实现提交。
- Runtime v2 已正式成为 `custom-release` 的一部分，本阶段直接依赖它，不重新实现 Runtime。

### 0.2 Runtime v2 已经具备的能力

实际代码位于 `public/scripts/lib/agent-runtime/`，当前公开核心包括：

- `AgentRuntime`
- `AgentRegistry`
- `MemoryCheckpointStore`
- `DurableCheckpointStore`
- `openIndexedDBCheckpoints`
- `ParallelExecutor`
- `createRuntimeBranchPort`
- `compileContext` / `compileContextAsync`
- 显式状态机与 Runtime contracts

Runtime 已支持：

- stable `runId / stepId / effectId`；
- Model / Tool / Memory Ports；
- ContextCompiler；
- typed handoff；
- cancel、stale-result rejection；
- checkpoint / resume / reconcile；
- Memory OS freshness guard；
- Runtime Event / UI projection；
- bounded fan-out / join；
- `fail_fast` / `settled` parallel policy；
- branch cancellation与父级取消传播；
- IndexedDB 持久化 checkpoint；
- Legacy workflow 通过 Runtime admission 执行。

当前 `ModelPort` 原生 decision 已有：

```text
complete
continue
tool
tools
handoff
wait
fanout
```

`fanout` 已受 Agent `maxConcurrency` 限制，默认上限为 4；Runtime 自带 `parallel.fanout -> parallel.join` Effect 生命周期。

### 0.3 已验证测试基线

Runtime Phase 8 记录：

- expanded offline regression：216 suites / 2492 tests passed；
- 四个 Edge headless smokes 通过，覆盖 core、mobile projection、recovery、parallel；
- IndexedDB/page destruction 场景验证 receipt recovery、cancellation、child retention 和不重复 tool write；
- `git diff --check` 通过；
- Runtime Phase 0–8 在记录的兼容边界内完成。

这些是本阶段的回归基线，不代表 Android 真机、真实模型或完整人工 RP 已验证。

### 0.4 Runtime 当前仍有意保留的边界

Phase 8 caller audit 已确认以下路径是**活跃兼容策略**，不是可直接删除的死代码：

- Spec worker / review coordinator；
- Agenda planner / text-agent coordinator；
- Loop policy；
- Director 主循环以及 dynamic dispatch / await；
- worker 级 context preparation 与 host `generate-task` assembly；
- simulation / Iter Studio 相关入口；
- historical result popup 行为。

此外：

- lost legacy generator continuation 仍 fail closed；
- 不存在 cross-device/server durable runner；
- Runtime event journal 并非完整跨重启 UI 日志；
- Director dynamic dispatch/await 仍是 compatibility path；
- Android 真机、真实模型与人工 play acceptance 仍是 coverage gap。

**Orchestration Engine v2 的职责是有序替代这些活跃兼容策略，而不是把它们误判为垃圾代码一次性删除。**

---

## 1. 本阶段到底重构什么

Agent Runtime v2 回答：

> 一个 Agent Run 如何可靠执行？

它已经负责状态机、Effect、模型/工具/记忆端口、取消、恢复、幂等、handoff、并行原语与事件。

Orchestration Engine v2 回答：

> 多个 Agent 为什么执行、谁先执行、谁能做什么、何时委派/交接/并行、结果如何组合、何时结束，以及四种执行模式为什么彼此不同？

因此本阶段**不再重写 Runtime**，而是在 Runtime 之上增加：

```text
Preset / Legacy Preset
        │
        ▼
Preset Compiler
        │
        ▼
OrchestrationPlan / Agent Graph
        │
        ▼
Scheduler / Router
   ┌────┼──────────────┐
   ▼    ▼              ▼
Capability       Result Arbitration
Policy           / Output Contract
   └────┬──────────────┘
        ▼
Agent Runtime v2
        │
        ├─ typed handoff
        ├─ model/tool/memory effects
        ├─ ParallelExecutor fan-out/join
        ├─ checkpoint/resume/cancel
        └─ Runtime events
```

一句话：

> **Engine 决定“编排什么”；Runtime 负责“可靠地执行”。**

---

## 2. 核心 ADR（默认不可随意推翻）

### ADR-1：一个父 Runtime Run 是编排执行事实源

Engine 不建立第二套 Effect 状态机、第二套 checkpoint、第二套 cancel 生命周期。

一个 Orchestration Run 应以一个父 `AgentRuntime` Run 为执行事实源；Engine 的 Scheduler/Graph 状态必须能序列化并随该 Run 持久化。

### ADR-2：复用 Runtime 并行，不再造 Parallel Engine

Agent-as-Worker、固定并行节点、Agenda 并发派工最终都降低为 Runtime 已有的 bounded fan-out/join / branch primitive。

禁止再实现：

- 第二套 Promise pool；
- 第二套 branch ID；
- 第二套 join receipt；
- 第二套 branch cancellation。

### ADR-3：Handoff 与 Delegate 是不同语义

- **Handoff**：控制权转移，降低为 Runtime `agent.handoff`。
- **Delegate / Agent-as-Worker**：调用方保留控制权，降低为一个或多个 Runtime child branches + join。

单个 worker 也可以使用一支 bounded child branch；不需要为了“单子 Agent 调用”再造一套执行器。

### ADR-4：Memory OS 仍是唯一共享长期记忆

Engine 可以定义 memory policy，但不得创建新的 Agent 长期记忆仓库。

- 长期共享记忆：Memory OS；
- 当前编排状态：Runtime checkpoint 中的 policy state / scratch；
- Agent 静态配置：AgentDefinition / preset；
- 子 Agent 临时输出：ResultEnvelope / Runtime branch result。

### ADR-5：Capability 必须落到代码层授权

Prompt 可以解释职责，但不能成为唯一权限边界。

高层 Capability 最终必须编译为 Runtime 可执行的具体约束，例如：

- AgentDefinition `tools`；
- `handoffs` allowlist；
- `maxConcurrency`；
- Scheduler 是否允许 graph mutation / delegate；
- Director reply 工具是否暴露；
- output adapter 是否接受该 Agent 的 submit。

### ADR-6：Preset 是 authoring data，Plan 是 runtime IR

UI/旧预设不直接驱动 Engine。

所有模式先经过 `PresetCompiler`，生成规范化 `OrchestrationPlan`，Engine 只消费 Plan。

### ADR-7：四个主模式保留独特合同，不新增重叠模式

沿用 `EXECUTION_MODE_DESIGN.md`：

- Loop：单 Agent 自主调研；
- Spec：静态 Graph；
- Agenda：动态 Task Graph；
- Director：正文生命周期所有者；
- Single：兼容入口 / 单节点 Spec 快捷模板，不是第五套 Engine。

### ADR-8：Legacy compatibility path 逐模式替换

当前兼容策略仍有真实调用者。只能在对应模式完成 Engine equivalence tests 后删除。

### ADR-9：UI 继续是投影，不是执行事实源

Engine Graph、Scheduler、结果、权限和状态不得依赖 DOM 是否存在。

### ADR-10：不引入第三方 Agent framework Runtime

可以借鉴 LangGraph / AutoGen / OpenAI Agents 等概念，但不把其运行时作为依赖。

---

## 3. 建议代码分层

实际目录可在 Phase 0 ADR 中按当前前端边界微调，但职责必须保持。

### 3.1 通用纯逻辑

```text
public/scripts/lib/orchestration-engine/
├── contracts.js
├── graph.js
├── scheduler.js
├── capabilities.js
├── results.js
├── arbitration.js
├── policy-controller.js
└── index.js
```

这些模块应：

- 不读 DOM；
- 不直接读取 preset UI；
- 不调用 provider；
- 不拥有 Memory OS store；
- 可用 Fake Runtime inputs 单测。

### 3.2 Luker orchestrator 适配层

```text
public/scripts/extensions/orchestrator/engine-v2/
├── preset-compiler.js
├── runtime-bridge.js
├── output-adapter.js
├── legacy-preset-adapter.js
├── mode-compilers/
│   ├── loop.js
│   ├── spec.js
│   ├── agenda.js
│   └── director.js
└── trace-projection.js
```

职责：

- 读取现有 preset/profile；
- 编译为 Plan；
- 把高层 capability 映射到真实 Luker tools/handoffs；
- 复用 `AgentRuntime`、`ParallelExecutor`、Memory OS、现有 Director reply 工具；
- 将 Engine output 映射回 guidance capsule 或 reply submit。

---

## 4. 先做一个最小 Runtime 扩展门槛

Runtime 已有一个用于兼容策略的 `policy.advance` Effect，但当前语义仍带有 legacy 特征：

- `legacyPolicy` flag；
- `policy.advance` 目前只允许 `complete / model / tool / handoff`；
- legacy model/tool receipt 会回到 `policy.advance`；
- handoff 也会回到 policy；
- `parallel.join` 当前默认回到 native next model step，而不是 policy；
- policy 本身没有一等的可序列化 controller state contract。

Engine 不应绕开这些限制新建第二套循环。Phase 1 应对 Runtime 做**最小、向后兼容的 policy-controller 泛化**。

### 4.1 目标 contract

建议新增概念：

```js
controlMode: 'model' | 'policy'
policyState: JSON
```

保留 `legacyPolicy` 作为兼容输入/旧 checkpoint 字段，不要求立即重命名旧路径。

`ports.policy.advance()` 至少接收：

```js
{
  runId,
  stepId,
  agent,
  generation,
  receipt,
  policyState,
  runSnapshot,
  signal,
}
```

其中 `runSnapshot` 必须是 JSON-safe read-only copy，不携带 host live objects。

返回统一：

```js
{
  intent,
  policyState,
}
```

`intent` 支持：

```text
complete
model
tool
handoff
fanout
wait
```

必要时可支持显式 `fail`，但不得让 policy 直接执行副作用。

### 4.2 Runtime 持久化规则

每次 policy 决策：

1. validate intent；
2. 持久化新的 `policyState`；
3. 再 schedule 下一 Effect；
4. crash/reload 后从 checkpoint 恢复同一 policy state；
5. policy 不能依赖 closure 中未持久化的 Graph 状态。

Policy mode 下：

- model receipt → `policy.advance`；
- tool receipt → `policy.advance`；
- handoff receipt → `policy.advance`；
- parallel join receipt → `policy.advance`；
- append user input → `policy.advance` 或按明确 contract 恢复；
- cancel / stale / Memory guards 继续由 Runtime 原有机制负责。

### 4.3 兼容要求

- 现有 Legacy adapters 不改变可观察行为；
- 旧 Runtime checkpoint 仍可读取；
- 不自动升级用户 preset；
- 不破坏 native model-driven Runtime；
- Runtime Phase 0–8 测试必须继续通过。

如果实际代码证明可以在不改 Runtime 的前提下满足上述 durable policy controller，Phase 0 ADR 可以保留现状；但必须给出可恢复状态如何持久化的证据。

---

## 5. OrchestrationPlan：统一运行期 IR

建议：

```js
OrchestrationPlan = {
  schemaVersion: 1,
  planId,
  source: {
    presetId,
    presetRevision,
    executionIdentity,
    mode,
  },
  entryNodeId,
  agents,
  nodes,
  edges,
  scheduler,
  capabilities,
  arbitration,
  output,
  budgets,
  compatibility,
}
```

Plan 必须完全 JSON-safe，可用于：

- deterministic tests；
- checkpoint fingerprint；
- trace；
- recovery validation；
- preset diff diagnostics。

Run 开始后若有效 Plan identity 发生变化，不得继续用旧 checkpoint 静默执行。

---

## 6. Agent Graph

### 6.1 Node

```js
GraphNode = {
  nodeId,
  kind, // agent | router | join | judge | synthesize | terminal
  agentId,
  inputPolicy,
  outputPolicy,
  capabilities,
  budget,
  metadata,
}
```

### 6.2 Edge

```js
GraphEdge = {
  edgeId,
  from,
  to,
  condition,
  priority,
  handoffPolicy,
}
```

### 6.3 Graph validation

编译期至少验证：

- 唯一 node/edge ID；
- entry 存在；
- edge target 存在；
- agent reference 存在；
- capability 引用合法；
- join 输入合法；
- 不允许无预算的隐式循环；
- 静态 Graph 中不可达节点给出诊断；
- dynamic graph mutation 必须受 task/node/step/concurrency budget；
- output terminal 至少一条合法完成路径。

静态 Spec 若需要 review 回跑，必须把回跑表达为**有界循环/重试 policy**，不能通过无上限 cycle 偷渡。

---

## 7. Scheduler / Router

统一决策对象：

```js
ScheduleDecision =
  | { type: 'model', nodeId }
  | { type: 'tool', nodeId, toolName, args }
  | { type: 'handoff', fromNodeId, toNodeId, payload }
  | { type: 'delegate', parentNodeId, branches, joinPolicy }
  | { type: 'wait_user', reason }
  | { type: 'complete', resultRef }
  | { type: 'fail', error };
```

### 7.1 Deterministic scheduler

用于 Spec 和可代码判断的节点：

- edge condition；
- priority；
- bounded retry；
- join readiness；
- completion；
- budget。

显然能由代码判断的流程不得额外调用模型。

### 7.2 Model-assisted scheduler

用于 Agenda 动态规划：

模型只能提出 typed proposal，例如：

```js
{
  addTasks: [],
  cancelTasks: [],
  dispatch: [],
  reprioritize: [],
  requestFinalize: false,
}
```

Engine 校验后才转成真正 ScheduleDecision。

模型没有权力绕过：

- Capability；
- agent allowlist；
- graph mutation budget；
- concurrency cap；
- run cancellation；
- output ownership。

---

## 8. 四种模式如何落入统一 Engine

## 8.1 Loop — 单 Agent 自主调研

合同：

- 单主 Agent；
- 连续上下文内多轮 model/tool/memory；
- 不创建多 Agent Task Graph；
- 不拥有 Planner；
- 完成结果是 guidance capsule；
- budget exhaustion 是 partial / budget_exhausted，不伪装 completed。

优先迁移方式：尽可能直接使用 native AgentRuntime model-driven loop；保留现有 Loop control tools / custom tools / notes / world info 行为。

Loop 不应该变成“小 Agenda”。

## 8.2 Spec — 静态 Graph

合同：

- topology 在 Run 前编译；
- author 定义节点、顺序、固定条件和 review；
- parallel stage 降低为 Runtime fan-out/join；
- review rerun 是 bounded policy；
- 模型不能随意新增整个 Graph 节点；
- 完成结果是 guidance capsule。

Spec 是 Engine 的 static graph reference implementation。

## 8.3 Agenda — 动态 Task Graph

合同：

- Planner 产生 typed task proposals；
- Scheduler 持有真实 Task Graph；
- task 依据 Agent capability / role 分配；
- 可新增、取消、重排任务；
- 每次 mutation 都是结构化事件；
- unresolved task IDs、budget reason、partial result 必须保留；
- finalizer / synthesizer 输出 guidance capsule；
- 不允许 reply submit。

Agenda 是 dynamic task graph，不是“可以改顺序的 Spec”。

## 8.4 Director — Reply Authoring Owner

合同：

- Director 主 Agent 拥有当前回复草稿生命周期；
- 子 Agent 默认是 bounded worker；
- 子 Agent 输出建议/审查/检索结果，不自动取得 reply ownership；
- 只有获得 `reply.read / reply.write / reply.submit` 相应 capability 的节点才能访问对应操作；
- 最终聊天正文只能经过明确 `reply.submit` ownership 检查；
- Director 不生成 capsule 再让另一正文模型重写。

现有 Director dynamic dispatch/await 是 Phase 8 明确保留的活跃兼容路径。必须在 equivalence / cancellation / draft ownership 测试完整后再迁移删除。

## 8.5 Single

Single 不新增 Engine policy：

- 旧字段继续读取/编辑；
- 新建可编译为单节点 Spec；
- 不自动改写旧数据；
- legacy explicit protocol selector 继续兼容，直到迁移证据允许清理。

---

## 9. Capability System

建议高层语义：

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

最终有效权限：

```text
Mode capability
∩ Plan capability
∩ Node/Agent capability
∩ actual tool availability
∩ current Runtime state / ownership
```

### 9.1 编译到具体 Runtime 权限

例如 Planner：

```js
{
  'memory.recall': true,
  'tool.call': true,
  'agent.delegate': true,
  'graph.mutate': true,
  'reply.read': false,
  'reply.write': false,
  'reply.submit': false,
}
```

PresetCompiler 应将其降低为：

- 允许的 `AgentDefinition.tools`；
- 允许的 `handoffs`；
- `maxConcurrency`；
- Engine scheduler actions；
- 实际 Director reply tool exposure。

不得只在 system prompt 中写“你不要写正文”。

### 9.2 输出权限必须二次校验

即使某工具/模型迟到返回一个正文结果，OutputAdapter 在真正写入聊天前仍要校验：

- parent run 未 cancelled/superseded；
- 当前 plan identity 仍有效；
- submitter 持有 `reply.submit`；
- 当前 node 是 reply owner；
- source/memory freshness guard 未失效；
- result status 可提交。

这直接封死“手动中断编排后正文继续放行”的同类问题。

---

## 10. Handoff 与 Agent-as-Worker

### Handoff

```text
A active
  │ agent.handoff
  ▼
B active
```

适用于真正控制权转移。

### Delegate / Worker

```text
Parent
 ├─ child A
 ├─ child B
 └─ child C
      │
      ▼
Runtime fan-out / join
      │
      ▼
Parent resumes
```

- Parent 保留流程所有权；
- branches 使用 Runtime stable child run ID；
- 并发使用 Runtime `maxConcurrency`；
- parent cancel 自动取消 queued/active branches；
- `settled` / `fail_fast` 使用 Runtime 原语；
- 不复制 child scratch 回 Parent，只有 ResultEnvelope/显式数据进入 parent policy state。

---

## 11. ResultEnvelope 与 Arbitration

统一节点结果：

```js
ResultEnvelope = {
  resultId,
  runId,
  nodeId,
  agentId,
  status, // completed | partial | failed | cancelled
  value,
  structured,
  provenance,
  createdAt,
}
```

不要依赖“字符串数组拼接”表达多 Agent 结果。

ArbitrationPolicy 支持：

```text
pass-through
merge
synthesize
judge
consensus
best-effort
```

至少定义：

- 输入 result IDs；
- 允许参与的 status；
- partial 是否接受；
- conflict 行为；
- Judge/Synthesizer agent；
- token/call budget；
- 最终 result owner。

Judge/Synthesizer 本身也是正常 bounded Agent invocation，不拥有额外 provider 通道。

不得实现伪投票：候选必须用稳定 `resultId`，Judge 返回结构化 choice/reason 或 synthesis result，Engine 验证引用合法。

---

## 12. Budget 与完成语义统一

Engine 至少区分：

```text
Run budget
Plan/task budget
Node retry budget
Agent maxConcurrency
Arbitration budget
Director reply-edit budget
```

完成状态：

```text
completed
partial
budget_exhausted
failed
cancelled
waiting_user
```

映射到 Runtime terminal state 时，Engine ResultEnvelope 必须保留更细的 orchestration outcome。

明确规则：

- Loop 用尽预算但有结果 → partial / budget_exhausted；
- Agenda 达到派工上限但 unresolved tasks 尚存 → partial / budget_exhausted；
- Spec 必需节点未完成 → 不得 completed；
- Director 未成功 `reply.submit` → 不得声称正文完成；
- cancel → 后续任何 Agent / branch / submit 都不能把状态重新推进为 completed。

---

## 13. Output Contract：guidance 与 reply 严格分开

统一：

```js
OutputContract = {
  kind: 'guidance' | 'reply',
  ownerNodeId,
  allowPartial,
  submitCapability,
}
```

### guidance

Loop / Spec / Agenda：

```text
Engine result
  -> capsule/output adapter
  -> 后续正文模型
```

### reply

Director：

```text
Engine/Director
  -> draft lifecycle
  -> reply.submit authorization
  -> 当前 assistant message
```

Director 禁止再走 capsule → 第二正文模型。

Plan compiler 必须从一开始就确定 output kind，运行时不能由普通 Agent 用自然语言自行改变。

---

## 14. Preset Compiler 与兼容

### 14.1 Authoring preset

可逐步引入：

```js
OrchestrationPresetV2 = {
  schemaVersion,
  id,
  name,
  mode,
  agents,
  graph,
  capabilities,
  policies,
  budgets,
  arbitration,
  output,
}
```

但第一阶段不要求 UI 立即暴露全部字段。

### 14.2 旧 preset

旧 Loop / Spec / Agenda / Director / Single 必须通过 `legacy-preset-adapter` **只读编译**为 Plan：

```text
legacy preset
   ↓ in-memory compile
OrchestrationPlan
```

禁止：

- 后台自动保存成 V2；
- 改写角色覆盖；
- 改写 Agenda chat override；
- 改写 Single 两个旧 prompt 字段。

提供显式“另存/转换为 V2”功能可以后置。

### 14.3 executionIdentity

现有 snapshot reuse 已使用 execution identity。凡是会改变实际执行结果的 Plan 字段必须进入 identity/fingerprint：

- graph topology；
- Agent/model/prompt profile；
- capabilities；
- budgets；
- arbitration；
- output contract；
- relevante tool/memory policy。

旧 snapshot identity 不得错误命中新 Plan。

---

## 15. Trace / Observability

不新建第二 Event Bus。

Engine 事件通过 Runtime event sink / projection 扩展，例如：

```text
plan.compiled
graph.node.ready
graph.node.started
graph.node.completed
graph.mutated
schedule.decided
capability.denied
result.created
result.arbitrated
output.submitted
```

Trace 至少能回答：

- 哪个 preset 编译成哪个 planId？
- 当前 Graph 有哪些 node/edge？
- Scheduler 为什么选择此节点？
- 是 handoff 还是 delegate？
- fan-out 的 parent/children/join 是谁？
- 哪个 capability 拒绝了动作？
- 哪些 ResultEnvelope 参与仲裁？
- 为什么结果是 partial / completed？
- 最终 guidance/reply 由谁拥有？

不要记录 API key、secret 或不必要的完整敏感 prompt。

---

## 16. Recovery / Resume

Engine 的恢复不能依赖 JS closure。

必须持久化在父 Runtime checkpoint 中的 policy state 至少包括：

```js
{
  planId,
  planFingerprint,
  activeNodeId,
  graphRevision,
  taskGraph,
  completedNodeIds,
  resultRefs,
  arbitrationState,
  outputState,
  budgets,
}
```

原则：

- Runtime 仍负责 Effect receipts；
- Runtime 仍负责 child checkpoints；
- Engine 只保存“调度状态”，不复制工具副作用状态；
- Memory refs 继续由 Runtime/Memory OS revalidate；
- resume 时先验证 Plan fingerprint；
- Graph 动态修改必须能从 policy state 重建；
- 已完成 child branch 不重跑；
- cancel 后不允许恢复为活跃状态；
- 当前 Runtime 不提供 cross-device runner，本阶段也不承诺。

在某个旧模式尚未迁移前，继续沿用其已记录的 legacy fail-closed recovery 边界，不伪称已经 durable resume。

---

## 17. Cancellation 与竞态硬规则

1. Parent cancel 立即阻止新的 Scheduler admission。
2. Runtime AbortSignal 继续传给 model/tool/memory/branches。
3. Late branch result 只能产生诊断，不得进入 ResultEnvelope current set。
4. Late Judge/Synthesizer 结果不得覆盖新 generation。
5. OutputAdapter 写正文前再次检查 run generation/status。
6. Director submit 与 cancel 竞争时，以 Runtime 已持久化状态/版本 guard 决定，禁止 DOM 时序决定胜负。
7. Tool side effect 的 reconcile/idempotency 继续交 Runtime，不在 Engine 重做。

---

## 18. 分阶段实施

## Phase 0 — Reality Map / ADR Update

不改行为。

产出：

- `docs/development/ORCHESTRATION_ENGINE_V2_CURRENT_MAP.md`
- Runtime policy-controller gap audit
- 四模式 legacy compatibility caller map
- preset → runtime → output ownership map
- Director reply tool/capability 实际名称清单
- executionIdentity 当前字段清单

必须确认：

- 哪些状态当前只活在 closure/local object；
- 哪些可以直接映射到 Runtime policy state；
- 哪些 legacy loops 是模式语义，哪些只是执行机制；
- simulation / Iter Studio 是否需要独立兼容 adapter。

## Phase 1 — Runtime Policy Controller Generalization

只做 Engine 所需的最小 Runtime 增量：

- durable `policyState`；
- policy receives read-only run snapshot；
- typed policy intents；
- policy fanout/wait；
- parallel.join → policy.advance；
- compatibility mapping for `legacyPolicy`；
- checkpoint/recovery tests。

不得把 Scheduler/Graph 业务塞入 AgentRuntime。

## Phase 2 — Headless Engine Kernel

实现：

- Plan contracts；
- Graph validation；
- deterministic scheduler；
- capability evaluation；
- ResultEnvelope；
- basic arbitration；
- policy-controller adapter。

全部使用 Fake AgentRuntime / ports 测试，不接 UI。

## Phase 3 — Preset Compiler + Single / Spec

先迁移最确定的静态路径：

- legacy Single → single-node Spec Plan；
- Spec stages/nodes → static Graph；
- serial stage；
- Runtime fan-out/join parallel stage；
- bounded review rerun；
- guidance OutputContract；
- executionIdentity 更新。

通过 equivalence fixtures 后，旧 Spec coordinator 才能逐步退出 production path。

## Phase 4 — Loop

将 Loop 收敛为 native single-agent iterative policy：

- 保留工具、custom tools、Notes、world info、Memory OS；
- 保留 budget semantics；
- 明确 partial / budget_exhausted；
- guidance output；
- 证明不需要独立第二执行器。

## Phase 5 — Agenda Dynamic Task Graph

实现：

- typed Planner proposals；
- task graph mutation；
- capability-based agent assignment；
- bounded delegate via Runtime branches；
- unresolved task tracking；
- finalizer / synthesizer；
- partial/budget semantics；
- recovery from serialized dynamic graph state。

## Phase 6 — Director / Reply Ownership

迁移最复杂路径：

- Director main owner；
- bounded subagent workers；
- reply read/write/submit capabilities；
- draft lifecycle；
- dynamic dispatch/await 等价迁移；
- cancellation / submit race；
- 不生成 capsule；
- simulation / Iter Studio compatibility。

只有这一阶段完成对应 equivalence tests 后，才允许删除旧 Director dispatch/await compatibility path。

## Phase 7 — Advanced Arbitration

在基础 merge/pass-through 已稳定后增加：

- synthesize；
- judge；
- consensus；
- best-effort；
- partial result filtering；
- arbitration budget；
- Judge resultId validation。

不得为了“看起来多智能体”默认增加无意义 Judge 调用。

## Phase 8 — Trace / UI Projection / V2 Authoring

- Engine events 投影到现有 Run Panel；
- Graph/Task/Result diagnostics；
- capability denial diagnostics；
- 保留现有 preset UI，按需增加 V2 authoring；
- old preset read-only compile；
- 显式转换入口可选；
- Web/mobile 布局回归。

UI 仍不是状态 owner。

## Phase 9 — Legacy Caller Audit / Removal

逐模式搜索实际 caller：

- legacy Spec coordinator；
- Loop compatibility loop；
- Agenda legacy planner/dispatch；
- Director dynamic dispatch/await；
- duplicate result assembly；
- duplicate scheduler state。

只有满足：

```text
no active callers
+ equivalence tests
+ recovery/cancel tests
+ browser smoke
```

才删除。

不以“代码看起来旧”为理由清理。

---

## 19. 测试矩阵

### Engine unit

- Plan schema/version；
- duplicate node/edge；
- missing target；
- unreachable node；
- unbounded cycle rejection；
- deterministic edge priority；
- join readiness；
- task graph mutation budget；
- invalid Planner proposal；
- capability intersection；
- unauthorized reply.submit；
- ResultEnvelope identity/status；
- arbitration conflict/partial。

### Runtime integration

- policyState durable checkpoint；
- policy model/tool/handoff loop；
- policy fanout/join；
- policy waiting_user/resume；
- parent cancel during fanout；
- late child result；
- stale Judge result；
- Plan fingerprint mismatch on resume；
- Memory guard invalidation；
- tool reconcile/idempotency unchanged。

### Mode equivalence

Single：

- legacy fields；
- one-node Spec compile；
- model/prompt settings；
- output capsule。

Spec：

- serial stages；
- parallel stage ordering；
- review rerun；
- custom tools；
- snapshot reuse；
- cancel。

Loop：

- tool iterations；
- finalize；
- Notes/world info；
- budget exhausted；
- Memory OS。

Agenda：

- planner ops；
- task add/cancel/reprioritize；
- concurrent dispatch；
- unresolved IDs；
- final agent；
- partial/budget reason。

Director：

- subagent dispatch/await；
- draft read/write/patch；
- final submit；
- child cannot submit without capability；
- abort during write；
- cancel vs submit race；
- simulation entry。

### Regression baseline

至少重跑受影响的 Runtime / orchestrator / Memory OS / floor-state / generation tests，并记录与 Runtime Phase 8 的 216 suites / 2492 tests 基线差异。

浏览器 smoke 至少覆盖：

- core run；
- run panel/mobile projection；
- recovery；
- parallel；
- 新增 Engine static graph；
- Agenda dynamic graph；
- Director cancellation / output ownership。

Android 真机与真实模型若环境不可用，明确记录 coverage gap，不得写“已通过”。

---

## 20. 禁止事项

- 不再实现第二套 Agent Runtime。
- 不再实现第二套 parallel executor。
- 不再实现第二套 checkpoint store。
- 不再实现第二套 model/provider dispatch。
- 不再实现第二套共享长期 memory。
- 不让 UI/DOM 成为 Graph 状态 owner。
- 不靠自然语言字符串作为唯一 Handoff/Planner/Graph 协议。
- 不让 Planner/普通 Agent 仅靠 prompt 自觉避免写正文。
- 不自动覆盖旧用户 preset。
- 不默认把所有模式串联起来。
- 不在迁移证明前删除活跃 compatibility policy。
- 不把 Engine policy state 藏在不可恢复 closure 中。
- 不将 Runtime Phase 8 已明确的 coverage gap 描述为解决。
- 不做无关 Memory OS/LoreState/MVU/provider/UI 大改。

---

## 21. Definition of Done

满足以下全部条件才算 Orchestration Engine v2 完成：

1. 一个统一 `OrchestrationPlan` 能表达四个主模式。
2. Single 只是单节点 Spec compatibility/template。
3. Spec 通过 static Graph 执行。
4. Loop 通过 single-agent iterative policy 执行。
5. Agenda 通过 durable dynamic Task Graph + Scheduler 执行。
6. Director 通过 explicit reply ownership/capabilities 执行。
7. Handoff 与 Delegate 语义分离。
8. Delegate/fan-out 复用 Runtime `ParallelExecutor`。
9. Capability 在代码层授权，Planner 无权 reply.submit。
10. ResultEnvelope / Arbitration 代替隐式字符串拼装。
11. guidance 与 reply OutputContract 明确分离。
12. Engine policy state 可 checkpoint/resume，不依赖 closure。
13. cancel 后迟到 Agent/branch/Judge/reply submit 全部失效。
14. Memory OS 仍是唯一共享长期记忆。
15. 模型调用仍走现有生成链 / `luker-dispatch`。
16. 旧 preset 无静默迁移或覆盖。
17. 现有 executionIdentity/snapshot reuse 对新 Plan 正确失效/命中。
18. Runtime Phase 0–8 核心回归保持通过。
19. 四模式 equivalence / cancel / recovery 测试通过。
20. Legacy coordinator 仅在 caller audit 证明无调用后删除。
21. Android/真实模型等未执行项如实记录。

---

## 22. Codex 实施规则

1. 开工时以当前 `feat/orchestration-engine-v2` 为工作分支，并再次 fetch `custom-release`；若 baseline 已前进，先评估是否需要把最新 `custom-release` 整合进 feature branch，不能退回 `release`。
2. 先读：
   - `AGENTS.md`
   - `AI_HANDOFF.md`
   - `FORK_MAINTENANCE.md`
   - `NEW_FEATURE_PROMPT.md`
   - `.github/copilot-instructions.md`
   - `docs/development/AGENT_RUNTIME_V2_REFACTOR_PLAN.md`
   - `docs/development/AGENT_RUNTIME_V2_CURRENT_MAP.md`
   - `docs/development/AGENT_RUNTIME_V2_PHASE6.md`
   - `docs/development/AGENT_RUNTIME_V2_PHASE7.md`
   - `docs/development/AGENT_RUNTIME_V2_PHASE8.md`
   - `EXECUTION_MODE_DESIGN.md`
   - 本文件。
3. Phase 0 必须基于当前实际代码重新画 Engine 迁移图，不能照抄旧企划假设。
4. 每个 Phase 独立 commit；提交前运行对应测试并记录实际结果。
5. 若方案与代码冲突：以当前代码/测试/Git 历史为事实源；若推翻 ADR，记录原因、替代方案、兼容风险和验证策略。
6. 不等人工逐 Phase 确认；在测试可自动验证且无新的产品决策冲突时，按阶段连续推进。
7. 不自动合并回 `custom-release`，除非用户明确要求集成。

本方案的重点不是“再造一个更大的 Agent Runtime”，而是终于把 Luker 的多智能体**编排语义本身**统一起来。