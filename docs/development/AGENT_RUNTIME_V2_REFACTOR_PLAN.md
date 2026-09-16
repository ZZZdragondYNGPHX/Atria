# Luker Agent Runtime v2 — 智能体编排代码级重构方案

> 状态：Phase 0–8 已完成；Phase 8 调用审计和无效追踪清理已完成（原生 Runtime 支持恢复与并行；旧策略现场丢失仍安全失败，活跃兼容路径不得误删；证据与边界见对应 PHASE 文档）
> 工作分支：`feat/agent-runtime-v2`  
> 开发基线：`custom-release@cfb95953071d6459c911e3e6a3bed0144e86ba72`  
> 基线提交：`merge: integrate Memory OS into custom-release`  
> 目标：把现有“智能体编排功能”重构为独立、可测试、可恢复、Memory-aware 的 Agent Runtime，同时保持现有私人功能和用户配置兼容。

---

## 0. 开工前规则

1. 必须先读：`AGENTS.md`、`AI_HANDOFF.md`、`FORK_MAINTENANCE.md`、`NEW_FEATURE_PROMPT.md`、`.github/copilot-instructions.md`。
2. 本方案以当前分支代码和 Git 历史为事实源。维护文档可能滞后，例如 `AI_HANDOFF.md` 中曾残留 Memory OS 尚未合并的旧描述；遇到冲突时以当前代码、提交历史和本方案为准。
3. 不从上游 `release` 重建本功能分支，不准备上游 PR；必须保留 `custom-release` 已有私人修复和功能。
4. 本次是基础设施重构，不做无关 UI 美化、全仓清理、依赖升级或配置迁移。
5. 每个 Phase 独立提交、独立测试，禁止一次性“大爆炸重写”。

---

## 1. 为什么要重构

当前编排能力已经能工作，但职责边界仍散落在模型调度、前端工具运行、编排预设、扩展注册、Memory Graph/Memory OS 等多个位置。继续在现有路径上增加 Planner、Reviewer、Supervisor、并行 Agent、恢复/取消等特殊逻辑，会继续扩大：

- prompt 约定与运行时行为耦合；
- Agent 定义、运行状态、UI 状态混合；
- handoff 缺乏统一结构和审计边界；
- tool/model/memory 调用缺乏统一 Effect 生命周期；
- run/step/tool-call 的恢复、取消和幂等难以证明；
- 并行化后竞态和重复副作用风险会成倍增加；
- Memory OS 与 Agent scratch 若无统一边界，容易出现第二套长期记忆。

重构目标不是“增加更多模式”，而是把模式降级为 Runtime 上的拓扑/Policy。

---

## 2. 已确认的现有代码边界

以下是本分支开工前已经确认的事实，Phase 0 必须继续补全完整调用图：

### 2.1 模型调度

- `src/luker-dispatch/` 已是 Luker 的模型/provider 调度基础设施。
- Agent Runtime 必须通过 adapter 复用它。
- **禁止**再造第二套 provider/client/API key/model routing 栈。

### 2.2 工具运行

- `public/scripts/extensions/function-call-runtime.js` 已存在工具/function-call 运行能力。
- 新 Runtime 应通过 `ToolPort/ToolExecutor` 对其现有能力做边界化，而不是复制工具执行协议。

### 2.3 Memory OS

Memory OS 已在当前 `custom-release` 基线中完成并合并。主要事实源包括：

- `docs/development/MEMORY_OS_REFACTOR_PLAN.md`
- `docs/development/MEMORY_OS_PHASE6_STATE_PROVIDERS.md`
- `public/scripts/extensions/memory-graph/`
- `public/scripts/extensions/memory-graph/orchestrator-tools.js`

Phase 6 已将 `memory_recall` 暴露为所有编排模式可用的只读 Layer-2 工具，并明确要求 **agent scratch 与共享长期记忆分离**。

已知旧边界还有一个重要缺陷：`memory-graph/orchestrator-tools.js` 的说明明确指出 orchestrator 传入的 `ctx` 当前是 **per-tool-call context，而不是 per-run context**。Runtime v2 必须建立真正的 `RunContext`，不得继续依赖工具调用对象充当整个 Run 的状态容器。

### 2.4 Phase 0 必须补齐的现状图

因为现有编排并非一个清晰单目录模块，实施者不得凭文件名猜测。必须实际追踪：

`UI/发送入口 → 模式选择 → 预设解析 → Agent/role 选择 → prompt/context 构建 → model dispatch → tool registry/dispatch → handoff/下一步 → 结果写回/UI event → cancel/error`

并形成 `docs/development/AGENT_RUNTIME_V2_CURRENT_MAP.md`，记录每个旧入口的实际文件、函数和调用方向。只有完成这张图后，才能迁移行为。

---

## 3. 目标架构

```text
UI / API / Legacy entrypoints
          │
          ▼
┌───────────────────────────────┐
│       Agent Runtime v2        │
│                               │
│  AgentRegistry                │
│  Runtime State Machine        │
│  ContextCompiler              │
│  HandoffEngine                │
│  ToolExecutor                 │
│  Event/Trace Bus              │
│  CheckpointStore              │
│  Policies                     │
└──────────────┬────────────────┘
               │ Ports
       ┌───────┼─────────┐
       ▼       ▼         ▼
   ModelPort MemoryPort ToolPort
       │       │         │
       ▼       ▼         ▼
 luker-dispatch Memory OS existing tools/plugins
```

建议新模块：

```text
src/luker-agent-runtime/
├── index.js
├── runtime.js
├── state.js
├── events.js
├── registry.js
├── context-compiler.js
├── contracts.js
├── policies/
│   ├── routing.js
│   ├── budget.js
│   ├── retry.js
│   └── memory.js
├── adapters/
│   ├── model-dispatch.js
│   ├── memory-os.js
│   └── tool-executor.js
└── stores/
    └── checkpoint-store.js
```

若现有前端/后端边界证明上述位置不合适，可以在 Phase 0 ADR 中调整目录，但必须保留相同的职责和依赖方向。

---

## 4. 核心架构原则

### 4.1 AgentDefinition 与 AgentRunState 分离

`AgentDefinition` 是可复用配置，不保存一次运行的动态状态：

```js
AgentDefinition = {
  id,
  name,
  instructions,
  modelProfile,
  tools,
  handoffs,
  policies,
  metadata,
}
```

`AgentRunState` 只属于一个 Run：

```js
AgentRunState = {
  runId,
  currentAgentId,
  status,
  stepId,
  scratch,
  handoffStack,
  budget,
  checkpointVersion,
  startedAt,
  updatedAt,
}
```

禁止把动态 scratch 写回预设/AgentDefinition。

### 4.2 Runtime 是显式状态机

Runtime 不允许靠业务函数递归互调来“隐式推进”。所有推进必须由 `Command -> transition -> Effect -> Event -> transition` 驱动。

最低状态集合：

```text
idle
running
waiting_model
waiting_tool
waiting_handoff
waiting_user
cancelling
completed
failed
cancelled
```

### 4.3 Typed Handoff

handoff 是 Runtime primitive，不是模型输出中约定的一段自然语言。

```js
Handoff = {
  handoffId,
  fromAgentId,
  toAgentId,
  reason,
  task,
  payload,
  contextPolicy,
  createdAt,
}
```

模型可以“请求 handoff”，但真正的路由、校验和状态切换由 Runtime 执行。

### 4.4 单一 ContextCompiler

任何 Agent 的最终上下文只能经 `ContextCompiler` 生成，禁止各模式自行拼 prompt。

固定层级：

```text
1. Runtime / system invariants
2. 当前 Agent instructions
3. 当前 task / handoff payload
4. 最近聊天上下文
5. 当前 Run scratch/state
6. Memory OS recall
7. Tool / environment context
```

Compiler 同时负责：token budget、去重、来源标签、截断策略和诊断摘要。

### 4.5 Memory OS 是唯一共享长期记忆

边界定死：

- Memory OS：跨 Run 的长期共享记忆、provenance、revision、失效、历史事实。
- Runtime scratch：当前 Run 临时工作记忆。
- Checkpoint：执行恢复快照。
- AgentDefinition：静态配置。

不得新增 `agent_memory.json`、Agent 私有长期向量库、第二套长期 summary store 等。

`MemoryPort.recall()` 返回引用/来源信息；checkpoint 只保存“本次使用了哪些 memory references + 查询参数/guard”，不要复制整份长期记忆成为第二真相。

恢复 Run 时重新验证 Memory OS guard/reference；已删除、stale、撤销的数据不得因 checkpoint 被复活。

### 4.6 所有副作用经 Effect

Runtime 原语：

```text
Command
├── startRun
├── appendUserInput
├── resumeRun
└── cancelRun

Effect
├── model.request
├── memory.recall
├── tool.execute
├── agent.handoff
├── checkpoint.save
├── wait.user
├── run.complete
└── run.fail

Event
├── run.started
├── step.started
├── context.compiled
├── memory.recalled
├── model.started
├── model.completed
├── tool.started
├── tool.completed
├── handoff.started
├── handoff.completed
├── checkpoint.saved
├── run.waiting_user
├── run.completed
├── run.failed
└── run.cancelled
```

UI 只能订阅 Runtime Event，不应成为运行状态事实源。

---

## 5. 身份、幂等与并发

每个可恢复对象必须有稳定身份：

- `runId`
- `stepId`
- `effectId`
- `toolCallId`
- `handoffId`
- `checkpointVersion`

规则：

1. 相同 `effectId` 的副作用不得重复提交。
2. `cancelRun` 是可重入操作；重复取消不能触发第二次写回。
3. model/tool async 返回后必须检查当前 run generation/version，过期结果丢弃。
4. checkpoint 使用单调版本/CAS 或等价 guard，旧运行实例不能覆盖新状态。
5. Tool 的“执行完成”和“结果消费”必须可区分，防止恢复后重复调用真实副作用工具。
6. Phase 7 之前不引入并行 fan-out；先证明串行链路正确。

---

## 6. Ports / Adapters

### ModelPort

职责：把 Runtime 的标准请求映射到 `src/luker-dispatch/`。

```js
ModelPort.request({ runId, stepId, agent, messages, tools, signal, metadata })
```

Runtime 不知道 provider-specific API。

### MemoryPort

职责：读取 Memory OS，不直接知道 memory-graph 内部 store/schema。

```js
MemoryPort.recall({ runId, agentId, query, budget, scope, signal })
```

必须尊重 `recallMemory` / `assertCurrent()` 一类现有 freshness guard。

### ToolPort

职责：统一封装已有 Function Call / extension tool registry。

```js
ToolPort.execute({ runId, stepId, effectId, toolName, args, context, signal })
```

工具结果必须标准化成 `{ ok, value, error, metadata }`。

---

## 7. Trace / 可观测性

Trace 不是 console.log 集合，而是 Runtime Event 的投影。

至少能回答：

- 一个 Run 经历了哪些 Agent？
- 每个 Step 使用了哪个模型配置？
- ContextCompiler 各层占多少 token？
- 调用了哪些 memory/tool？
- 为什么 handoff？
- 哪个 Effect 失败/重试/取消？
- 是否发生 stale async result 丢弃？
- checkpoint 从哪个版本恢复？

默认 trace 不保存 API key/secret；prompt/tool 参数中的敏感字段按现有仓库规则脱敏。

---

## 8. Checkpoint / Resume / Cancel / Crash Recovery

Checkpoint 最少包含：

```js
{
  schemaVersion,
  runId,
  version,
  status,
  activeAgentId,
  step,
  scratch,
  handoffStack,
  completedEffectIds,
  pendingEffect,
  memoryRefs,
  budget,
  updatedAt,
}
```

恢复原则：

- 已确认完成的副作用不重放；
- 未确认的副作用按类型决定 retry/reconcile/fail；
- Memory 引用重新验证；
- UI 可重建自 Runtime Event/State，不依赖旧 DOM 状态；
- crash recovery 和普通 resume 使用同一入口。

初期可先使用可替换的内存 store + 测试 store；持久化方案必须复用 Luker 现有合适存储边界，不另起不受管理的用户数据文件。

---

## 9. 旧编排迁移策略

禁止直接删除旧编排。

新增 `LegacyOrchestrationAdapter`（最终路径由 Phase 0 调用图决定）：

```text
旧 UI / 旧预设
      │
      ▼
LegacyOrchestrationAdapter
      │ normalize
      ▼
Agent Runtime v2
```

迁移顺序：

1. 记录旧模式实际输入/输出契约。
2. 用 adapter 把旧配置映射成 AgentDefinition + Runtime policy。
3. 新旧行为做 golden/fixture 对照。
4. UI 先继续使用旧入口，但底层改走 Runtime。
5. 所有模式完成迁移后，再删除旧执行循环。

保存过的用户预设不能被自动覆盖；需要 schema extension 时采用兼容读取 + 新保存格式，除非本方案后续 ADR 明确授权破坏性迁移。

---

## 10. 执行阶段

### Phase 0 — Inventory + ADR + Contracts（不改行为）

产物：

- `AGENT_RUNTIME_V2_CURRENT_MAP.md`
- Runtime ADR
- contracts/state/event 草案
- 旧模式行为夹具清单

任务：

- 搜索所有编排 UI、模式、预设、Agent/role、tool registry、model dispatch、cancel、结果回写入口。
- 画真实调用图和数据所有权图。
- 明确前端/后端边界后再决定 Runtime 最终目录。

验收：现有编排行为零变化；文档能让新开发者从发送消息追到最终结果。

### Phase 1 — Headless Runtime Kernel

实现纯状态机、contracts、registry、event bus、FakeModel/FakeTool/FakeMemory。

必须先做到：

- start/complete/fail
- 单 Agent 多 Step
- cancel
- typed handoff
- effect idempotency
- stale async rejection

验收：无需 UI、真实模型、Memory OS 即可跑完整单测。

### Phase 2 — Legacy Adapter

把至少一个最简单旧编排模式接入 Runtime，建立兼容层；随后逐模式迁移。

验收：同输入的可观察行为基本等价；旧预设仍可读取；可随时切回 legacy path 进行排障。

### Phase 3 — ContextCompiler + Ports

接入：

- `ModelPort -> src/luker-dispatch/`
- `MemoryPort -> Memory OS`
- `ToolPort -> existing tool/function-call runtime`

统一 token budget、memory injection、tool context。

验收：不存在模式私有的第二套 model/memory/tool 调度循环。

### Phase 4 — Typed Handoff + AgentRegistry + Routing Policy

所有 Agent 跳转改用结构化 handoff；预设只描述 Agent graph/policies，不控制底层执行循环。

验收：handoff 可追踪、可测试、可拒绝非法目标、可控制上下文转交。

### Phase 5 — Event/Trace + UI Projection

UI 改为消费 Runtime State/Event；增加调试 trace 视图或现有调试入口的 Runtime 投影。

验收：刷新 UI 不改变 Runtime 真相；运行日志能重建关键路径。

### Phase 6 — Checkpoint / Resume / Cancel / Crash Recovery

实现可持久化 checkpoint adapter、幂等恢复和统一取消。

验收：在 model/tool/handoff 边界模拟 crash 后恢复，不重复已完成副作用；取消后正文/后续 Agent 不继续放行。

### Phase 7 — Parallel Primitives

最后才实现：

- fan-out
- join
- bounded concurrency
- branch cancellation
- partial failure policy

验收：并行只建立在已有 effect identity/checkpoint/cancel 语义上。

### Phase 8 — Legacy Removal

删除已经没有调用者的旧执行循环、重复 context 拼装和重复状态变量。

验收：全仓搜索证明旧路径无活跃引用；兼容预设仍可加载；文档更新。

---

## 11. 测试策略

### Runtime unit tests

至少覆盖：

- state transition table
- invalid transition
- typed handoff
- retry budget
- cancel race
- stale model result
- stale tool result
- duplicate effect
- checkpoint version conflict
- resume after each Effect boundary
- Memory guard invalidation

### Contract tests

每个 adapter 用 fake runtime contract 测试：

- model-dispatch adapter
- Memory OS adapter
- tool adapter
- checkpoint store

### Legacy equivalence

对现有主要编排模式建立 fixture/golden：

- 同一预设解析结果
- Agent 顺序/可观察结果
- tool availability
- memory availability
- cancel 行为
- error fallback

### Regression

继续运行现有 `orchestrator`、`memory-graph`、`floor-state` 相关测试。Memory OS 合并前已有大规模回归记录，Runtime 重构不能降低其来源失效/provenance/freshness 保证。

浏览器、真实模型和 Android 若当前环境不可用，必须明确记为 coverage gap，但不能伪称通过。

---

## 12. 明确禁止事项

- 不引入 LangGraph / AutoGen / OpenAI Agents SDK 作为 Runtime 依赖。
- 不重写 `src/luker-dispatch/` 为新 provider 层。
- 不创建第二套长期 Agent Memory。
- 不让 UI/DOM 成为运行状态事实源。
- 不用自然语言字符串作为 handoff 唯一协议。
- 不在 Phase 1 就做并行多 Agent。
- 不一次性删除 legacy 路径。
- 不自动覆盖用户已保存编排预设。
- 不因重构顺手修改无关配置、备份、角色卡、Memory OS schema。
- 不吞掉 Abort/cancel；取消必须贯穿 model/memory/tool adapter。

---

## 13. 外部架构参考（借鉴思想，不引入依赖）

### OpenAI Agents SDK

借鉴：少量核心 primitive、handoff、sessions/working context、built-in tracing，以及把 model/tool/handoff 都纳入一个 Runner 生命周期。

- https://openai.github.io/openai-agents-python/
- https://openai.github.io/openai-agents-python/handoffs/
- https://openai.github.io/openai-agents-python/tracing/

### Microsoft AutoGen

借鉴：Agent 与 Runtime/消息执行环境分离，Agent 不自行拥有整个调度生命周期。

- https://microsoft.github.io/autogen/

### LangGraph

借鉴：显式 state、checkpoint、durable execution、interrupt/resume 思路。

- https://docs.langchain.com/oss/python/langgraph/persistence

这些框架只作为架构研究样本。Luker 已有自己的 dispatch、工具、扩展和 Memory OS，因此本阶段不应引入另一套完整 Agent 框架制造双重基础设施。

---

## 14. ADR 预设决策

除非 Phase 0 找到明确代码证据需要推翻，否则默认采用：

1. **ADR-001**：Runtime v2 自研轻量内核，不引入第三方 Agent framework。
2. **ADR-002**：Memory OS 是唯一共享长期记忆。
3. **ADR-003**：`luker-dispatch` 是唯一模型调度端口。
4. **ADR-004**：handoff 是 typed runtime effect。
5. **ADR-005**：UI 是 state projection，不是 state owner。
6. **ADR-006**：checkpoint 与 Memory OS 分离。
7. **ADR-007**：并行能力最后实施。
8. **ADR-008**：Legacy Adapter 迁移，不做 big-bang rewrite。

推翻任一项必须在 ADR 中记录：代码证据、替代方案、兼容风险和测试策略。

---

## 15. Definition of Done

本重构只有同时满足以下条件才算完成：

- 所有主要旧编排模式都经 Agent Runtime v2 执行；
- AgentDefinition / RunState / checkpoint / Memory OS 所有权清晰；
- 模型只经 `luker-dispatch` adapter；
- 工具只经统一 ToolPort；
- 长期记忆只经 MemoryPort/Memory OS；
- handoff 全部结构化；
- run/step/effect 有稳定 ID；
- cancel/resume/crash recovery 有自动化测试；
- 重复副作用有幂等保护；
- UI 只消费 Runtime state/event；
- 并行分支具备 bounded concurrency + join + cancellation；
- legacy 执行循环无活跃调用者后才删除；
- 现有用户预设/私人功能未被无意破坏；
- Memory OS provenance/freshness 语义保持；
- 相关 unit/contract/regression tests 通过；
- 不可执行的 Android/真实模型测试明确记录 gap。

---

## 16. Codex 推荐执行顺序

接手后不要先改 UI。

```text
读协议与本方案
  ↓
Phase 0：扫描真实入口 + CURRENT_MAP + ADR
  ↓
Phase 1：headless kernel + fake ports + tests
  ↓
Phase 2：只迁一个最简单 legacy mode，证明 adapter 路径
  ↓
Phase 3：接 luker-dispatch / Memory OS / ToolPort
  ↓
再逐步扩展 handoff、trace、checkpoint、并行
```

第一批代码提交应尽量小：**contracts/state/events/runtime kernel + tests**。在它稳定之前，不要同时大改 UI、预设 schema 和 Memory OS。
