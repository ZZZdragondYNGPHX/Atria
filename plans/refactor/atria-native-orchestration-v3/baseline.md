# 第一轮代码审计（静态事实）

- Repo：`ZZZdragondYNGPHX/Atria`
- 审计源：`main@2686aa40a00c8bfccdc47c55d2b236b4878b022a`（2026-10-15 远端 HEAD）
- 方法：按智能体编排相关目录定位代码，读取核心源码与相关既有测试；**不是整个仓库逐文件审计，也不是执行结果**。
- 标识：**已确认事实**=被所列源文件的当前实现支持；**推断/待验**=需要进一步执行/设计检查。

## 1. 运行时骨架已存在，不应重造

| 领域 | 主要源码 | 当前实际能力 |
| --- | --- | --- |
| Agent 核心 | `public/scripts/lib/agent-runtime/runtime.js`、`state.js`、`contracts.js` | AgentRuntime 的 effect/decision 状态机、model/tool/memory/handoff/fanout/wait、取消/恢复式消费、Effect 身份和 event |
| Checkpoint | `public/scripts/lib/agent-runtime/durable-checkpoint-store.js`、`indexeddb-checkpoints.js`、`public/scripts/agents/orchestrator/runtime-checkpoints.js` | CAS/flush barrier；当前浏览器账户 scope IndexedDB；终态 checkpoint 按代码进行定时修剪，不等于完整业务历史 |
| 并行 | `public/scripts/lib/agent-runtime/parallel.js` | 子 Run 使用稳定 ID、并发许可、fail_fast/settled、取消与子运行恢复接口 |
| 编排 Graph | `public/scripts/lib/orchestration-engine/contracts.js`、`graph.js`、`scheduler.js`、`policy-controller.js` | node kinds `agent/router/join/judge/synthesize/terminal`；静态 DAG、bounded edges、Agenda task proposal、Judge/consensus/synthesize、结果引用/预算 |
| 输出/权限 | `public/scripts/lib/orchestration-engine/capabilities.js`、`arbitration.js`、`results.js` | 多层 capability 交集、结果来源/身份、仲裁准入，reply 提交人检查 |
| 桥接 | `public/scripts/agents/orchestrator/engine-v2/runtime-bridge.js`、`spec-adapter.js`、`agenda-adapter.js`、`loop-adapter.js`、`director-adapter.js` | 通过新状态机驱动各旧模式业务流程，模式 adapter 仍承担 substantial business semantics |

**判读**：尚未到「没有现代化」的程度；已有相当多可复用基础。下一步主风险是权威收敛和旧 adapter 清退，而非叠加第五个单独的主 Runtime。

## 2. 旧业务模型的残留边界

- `public/scripts/agents/orchestrator/main.js`：通过 World Info finalized、Generation Takeover 等聊天事件启动；非 Director 输出经 `capsule` 注入，Director 直接接管正文编辑。仍依赖历史生成路径与旧事件形态。
- `public/scripts/agents/orchestrator/legacy-workflow-adapter.js`：Generator / transient results 过渡；注释明确跨进程不恢复，`runtime.js` 对 `legacyPolicy` resume 采用 fail-closed。
- `public/scripts/agents/orchestrator/engine-v2/preset-compiler.js`：将 `single/spec/loop/agenda/director` 归一为 `schemaVersion: 1` 图，但是还含 `source.profile`、legacy host settings 与 mode 条件生成拓扑。
- `public/scripts/agents/orchestrator/workspace/host-profile.js`：将原生 Plan 转换回各 mode 的历史 transport 形态；非 Spec 拒绝多结果仲裁；Loop/Director owner 需固定命名；Agenda 需固定 planner/worker 拓扑。**这说明存储 Plan 原生化 ≠ 真实执行完全可组合**。
- `public/scripts/agents/orchestrator/workspace/orchestration/page.js`：已经有 Plan/Agent/权限编辑和图可视化，但高级图编辑仅开放部分能力，部分编辑受 mode 固定条件约束。
- `public/scripts/agents/orchestrator/spec-runtime.js`、`agenda-runtime.js`、`loop-runtime.js`、`director-runtime.js`：默认进入 V2 engine adapter，仍保留 `agentRuntimeV2 === false` 等旧逻辑分支。不能把其删除前的覆盖范围猜成已经无调用者。

## 3. 恢复、重复副作用与上下文重点风险

- `AgentRuntime.resumeRun`：提升 generation、对旧 `legacyPolicy` 拒绝续跑，对未确认 Tool Effect 先 `reconcile`；若未知不能证明可重试则停止；旧 memory 引用重验；这是一种正确的安全倾向，不能以「自动重试任何操作」代替。
- `parallel.js`：子 run 要求持续可得的 durable checkpoint 才能恢复；缺失时失败而不是无凭据重跑。
- `loop-adapter.js` 和 `director-adapter.js`：部分 source-guarded tool feedback 仅保存在瞬态 Map；失去后不能一概透明恢复，需要重新定义 source reacquire/reconcile 语义。
- `context-compiler.js` 有原生分层编译，但旧 `legacyMessages` 直接保留 host 预备的消息，并受 adapter 配置驱动；Loop/Director adapter 设置极大 budget 并依赖 host 上游实际限制。**应审计跨节点上下文口径与真实预算，不宣称目前越界已经发生**。
- `indexeddb-checkpoints.js` 的 terminal prune 规则是浏览器运行 checkpoint 生命周期；不能等同 Native Session/Task History、Experience Evidence 或可恢复用户任务生命周期。

## 4. Native 侧并存的任务权威

- `src/native/task-scheduler.js`：已有 `turn_blocking/interactive/background/maintenance` 分类、并发与资源许可、取消、retry、活跃执行；其调度 Map 是进程瞬态投影，本身不等于可重启永久工作流队列。
- `src/native/run-control.js`、`src/native/session-core.js` 和 `src/native/model-prompt-runtime/*`：有原 Session 的 revision/operation/compute 权威、Host 发送与预算/费用身份；复用它们而非创建额外收费账本。
- `src/native/project-agent-executor.js`：Studio 的 Agent 工作流通过正式 Project Task、Review 等既有权限边界，不等于普通 RP 的发布边界。
- `src/native/mcp-service.js`、`a2a-service.js`：外部任务/工具已有自己基于 Native Scheduler 和 Session Public Work 的限权消费者，远程结果被视为 external evidence；不让外部完成状态成为 World 真相。
- `public/scripts/native/experience/llm/orchestrator-bridge.js`、`narrative.js`、`public/scripts/agents/orchestrator/game-runtime-bridge.js`：游戏 Narrator / Director 使用 read-only authoritative turn view，观察/正式事件先于叙述；Bridge 对 World/Journal 做修改检测。须保留更深层正式写入边界，不能把客户端 JSON 比较看作独立安全防线。

## 5. 已存在的测试与未验证范围

可定位的测试：`tests/agent-runtime/engine-kernel.test.js`、`durable-recovery.test.js`、`engine-mode-recovery.test.js`、`policy-controller.test.js`、`races.test.js`、`native-orchestration-prompts.test.js`，以及 `tests/orchestrator/*`、`tests/game-runtime/llm-orchestrator-narrative.test.js`、`tests/native/mcp-delegated-generation.test.js` 等。

源码中已有如下测试**案例声明**：bounded graph、能力交集、Judge 失效、持久边界恢复、未知 Director Submit 不重复发送、缺子存储时拒绝分支重播、取消 race。没有运行测试；不能声称它们现在通过。

**待验证/风险矩阵**：① 普通 RP 与 Native Session 双入口的运行权威；② 宕机后跨 UI/Host 恢复；③ Pending 副作用的 reconcile；④ 分支撤销与源版本失效；⑤ 同预算并发 charge；⑥ Browser/Node/Termux 真实启动及可观测 UI；⑦ 故障/超时/取消下 Final Reply/World 发布正确性；⑧ 动态 DAG+Judge 合成与角色信息隔离；⑨ 旧模式路径可清退范围；⑩ 无高成本固定前置 Agent 的最小普通 RP 路径。

全部测试与工程验收待后续正式实现阶段独立记录；本轮未改 `main`。