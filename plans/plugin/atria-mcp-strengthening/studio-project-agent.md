# Atria MCP 补强 — Studio / Project Agent 双路径方案（第三轮冻结）

- **Task ID**：`plugin/atria-mcp-strengthening`；**Primary Workspace**：`plugin`，方案在 `docs`。
- **讨论决策**：第三轮选择 **B：双路径、统一原生权威**，2026-10-14 冻结方向；尚未执行代码修改或测试。
- **核对基线**：第三轮源码调研以 `main@7e1045ab836c22cafbc92c5de056ad701f56e723` 和 `plugin@ee99b2b3d1c65502a971495a6016ccb7c195bf6d` 为依据。提交前发现 `main` 已推进至 `9241325a7290e613e0fdaaa1870409105c161c89`（领先 9 commits，主要新增视觉生成功能；比较清单没有 `project-agent.js`、`studio-service.js`、`studio-agent.js` 变更）；接入实现前仍须以当前 HEAD 检查输入输出语义并测试。
- **依赖**：[Plan index](index.md)、[能力矩阵](capability-matrix.md)、[P0 可靠性](p0-reliability.md)。旧 `atria-mcp-capability-expansion` 是已存的历史基线，不是本模块的实现结果。

## 1. 权威关系（冻结）

- 产品 Studio / ProjectStore / Source / Resource Graph、Frontend v3 Source Graph、Workspace/ChangeSet、Preview/Simulation、Project revision 与 Product Agent Task 是唯一业务真值。MCP 不创建第二套 Studio Git 历史、任务计划数据库、持久对话或业务 rollback 实现。
- MCP 的独立 `operationId`、Lease、Review proof、Receipt 和轻量 Journal 只负责**外部控制与关联**，不替代 Product Task `taskId`、`sequence`、`baseRevision`、`workspaceId`、`changeSetId` 或 formal resulting revision。
- Product `ProjectAgentService` 在 `main:src/native/project-agent.js` 已提供 task create/get/context、plan/set、strategy、tool proposal、prepareReview、commit、takeOver、resumeTask、begin/finishGeneration 和正式恢复；`StudioService` 已提供 `inspectWorkspace / evaluateWorkspace / executeWorkspace / inspectWorkspaceReceipt`。
- 现有 `public/scripts/native/studio-agent.js` 组织浏览器端模型迭代与 Skills，模型指令明确“在 Review 停下，人类执行 Commit”；外部 MCP **不能**凭 `review.required = true` 或 `status=review` 推断用户已经批准提交。

## 2. 双路径（本轮冻结）

### 路径 S：直接 Studio Workspace（简单、确定、局部）

适用：用户明确限定的局部 Frontend Patch、资源调整、单一 Source 修正、编译或 Preview 验证，不要求建立多阶段持续 Project Task。

`Project current Revision → 受控 Studio Authoring Operation(s) → Workspace inspect → 临时 evaluate/validate/preview → 独立 Review → 经批准 executeWorkspace → formal ChangeSet/Revision 核验`。

- 继续复用 MCP 现有 `build.change.prepare / inspect / evaluate / apply`、`build.frontend.inspect`、`build.preview.*`，必要时用能力目录补齐语义 DSL，而不直接开放任意 JS 或原始 Studio 文件系统写入。
- Workspace 的 `origin` 与全部 operations 保持一致；必须钉住 `projectId / baseRevision / workspaceId / operationFingerprint`；源码编辑首选结构化 `frontend.patch / project.save / resource.attach|fork|update`，`source.write|move|delete` 仅是显式兜底。
- Evaluate 是**隔离临时评估**，不会构成 Project 正式提交；Preview/Simulation 只是候选运行证据。提交须重新核对源 Revision、operations/changes 指纹、评估结果/Preview 证据与批准绑定；已关闭或版本变更的 Preview 不得冒用。
- 如源/资源已存在原生 Project Agent Task 的相关变更，直接 Studio 修改可能造成 Task baseRevision 过期；不隐式重基、不静默合并，报告具体冲突。

### 路径 A：原生 Project Agent Task（复杂、多步骤、可续接）

适用：涉及多个相关资源/文件、需持续计划、模型辅助修复、跨对话任务、复杂契约编辑与多人接管。

`Task create(pinned Project Revision, intent) → getContext/Plan → semantically typed proposals → Studio prepareReview/evaluate → Repair or Review → 单独获准 Commit → Studio formal ChangeSet → Task completed/reconciled`。

- Task 和 Plan 保存在产品已有 `ProjectTaskRepository`，状态机、`sequence`、尝试、提案、评估结果、Review/Commit Intent 均由 Product Authoritative Task 管理。
- MCP 外部 AI 可以按原生 Tool schema 推进 Plan、提议操作、请求复核；不能自行伪造 Product `taskId`、`origin.kind=agent`、`attemptId` 或生成观测，也不能通过泛化工具名执行没有注册/审查的副作用。
- `agent.project.task.* / plan.* / operation.* / strategy.* / review.* / commit / takeover / resume / generate` 是候选**语义 Action 家族**，并非已实现或已最终冻结的准确 API 名称。每项须独立声明风险、真实 HTTP contract、版本/序号、owner、费用和 Result schema；Registry 以完整 Action ID 精确授权。
- MCP 可以提供“读取 Task Context、规划、提案、评估、诊断、局部修复、达到 Review”的自动化执行，但不得把“已到 Review”转换成“允许正式 Commit”。
- `review`、`committing`、`conflict`、`blocked`、`completed`、`taken_over` 等状态应尊重原生 stop/repair/recovery，跨会话从 persisted Task 读取真值，不重放模型对话文本作为执行日志。
- **与 Orchestrator 委托区别**：`agent.run.start(delegated-node)` 属另一个 runtime，保留独立身份和权限模型。共享发现/Receipt 目录，但不把两种 Agent 生命周期或审批合并。

### 2.1 路径选择与切换

- 简单修改默认走 S，复杂修改默认走 A；用户可明确指定其中之一。MCP 不在已有提交后替用户隐式创建另一条 Task 或将相同操作自动双重执行。
- S 路径运行中如需 A 路径继续：基于**当前新 Task + 精确当前 Project Revision**重新形成 Plan，旧 Workspace 的内容只能作为**可验证的参考提案**，不得直接复制已花费授权或正式回执。
- A 路径人工接管后可以通过普通 Studio 修改；原 Task 标记 `taken_over`，不能自动继续旧 Agent 提案。必要时需用户显式新建 Task。
- 独立 MCP 重启恢复只能重新定位 Product Task/Revision/Evaluation/ChangeSet；MCP Journal 不保存另一个 Task state，也不会恢复已经终止的模型计算或自动重发副作用。

## 3. 外部 AI 优先、内置模型显式委托（冻结）

默认由当前 MCP 客户端（如 Codex/Claude Code）负责理解需求、计划、提案及判断是否达到 Review，**不再次自动调用 Atria 自己配置的 Studio 模型**。外部 AI 的推理 token 与 Atria Provider 的收费模型是不同成本来源，不许混淆。

显式用户意图要求“Atria 内置 Studio 模型来完成”时，允许经过授权的委托模式：

- 复用 `NativeGenerationHost` 的 `role.studio`、`RouteRef`、模型/Prompt、Fallback、Skills 加载、Compute Budget、正式 Task generation attempts；不在 MCP 创建平行模型路由或通用 Agent Runtime。
- 注意：`beginGeneration` 仅登记原生 Attempt，**不发起模型调用**；实际 LLM 迭代当前主要在浏览器 `runNativeStudioAgentTask` 中串联 `NativeGeneration`、`executeAgentTool` 与 `finishGeneration`。无头委托需要先证明是否有稳定产品服务端执行入口；若没有，必须设计复用原生 contracts 的受管 executor，而非把一次 `beginGeneration` 错误宣称为运行中。
- 内置模型发起前明确披露 Route、模型网络/成本、预算、任务上限及 stop/recovery；控制面可以在等待模型时查询/取消；实际费用与完成以产品权威记录为准。
- 模型输出是非可信提案，不能充当可信批准或直接正式提交；工具调用须落在原生可用工具 ∩ MCP Policy Ceiling ∩ 原始用户批准 envelope 中。客户侧与内部模型不能相互继承 Lease。

## 4. 授权分层：Plan/Proposals 与正式 Commit 分开（冻结）

1. **任务/提案授权**：Task 创建、Plan 设置、持久提案属于 Product 变更，采用相应 Action risk/权限守卫；可以将同一精确任务中限额内的低影响操作打包为一次可信 envelope。只读 Context/Source/History 不必以“写审批”阻塞；可能 Provider 付费的 READ 仍需标注副作用。
2. **评估授权**：`prepareReview / evaluateWorkspace` 可能临时编辑/编译/模拟，属于 INTERACT 或具明确执行后果的权限；不得归为无效果 READ。评估结果要保留 Validation/Preview/Simulation 身份并与 Task/Workspace 精确绑定。
3. **正式 Commit 独立审批**：即使任务已经有提案权限、Review=true、评估通过，MCP 仍必须获取**新一轮可信用户同意**，绑定 `owner, projectId, taskId`（A 路径）或 Workspace（S 路径）、`baseRevision, sequence, operationsHash, changesHash, validationFingerprint, previewId/packageVersion, serverBootId` 及实际外部效果。不能复用早前 Task/Agent/batch 的通用 Lease。
4. **高影响 Review**：源删除、引用变更、依赖替换与其他被产品标高风险的操作，应在审查界面明确展示更改摘要、影响范围、Source Graph diagnostics、会波及的引用与可能丢失的内容；破坏性效果需映射到 DESTRUCTIVE 一次性授权，而不是因为它在 ChangeSet 内就降低分类。
5. **事务内再校验**：审批后的 MCP guard 仅是第一层，最终必须由 Studio/Project Agent 原生 CAS、Project Git Revision、changeSet/commitIntent、参考依赖/权限/有效状态校验。多 MCP 实例各自已授权也不能并发覆盖。
6. **不可确定写入**：Commit 响应丢失/超时/进程异常，立即保留 `unknown/reconciling`，用 `ProjectAgentService._recover`、`StudioService.inspectWorkspaceReceipt`、正式 Git ChangeSet 或当前 Project Revision 核对；严禁根据客户端重试意图重新发起无身份关联的 Commit。
7. **Review 证据不可混同 UI**：Studio 模型/模拟器的“通过”不是人眼 UI 验证；Playwright 截图必须额外绑定 Preview/Experience Epoch，且人工提交审批又是不同证据层。

## 5. MCP 行为域与候选 Action 映射（待逐项实现）

| 域/候选 | Product owner | 预期风险 | 主线守卫与结果 |
| --- | --- | --- | --- |
| Studio Project/Source/Revision/Graph READ | `StudioService` / `ResourceGraph` | READ | owner/project/baseRevision，bounded/paged results，源文件/二进制严格过滤 |
| Studio workspace prepare/inspect | `StudioService.inspectWorkspace` | READ（无 lasting mutation 时） | 操作规范化，Workspace + changes fingerprint |
| Studio evaluate/preview/simulate | `StudioService.evaluateWorkspace` | INTERACT | pinned Revision，临时源恢复证明，Validation/Preview/version，模型成本另行声明 |
| Studio approved apply | `StudioService.executeWorkspace` | MUTATE；包含实体删除时核实 DESTRUCTIVE 分级 | 精确独立 Commit approval + formal ChangeSet Receipt |
| Project Task create/plan/proposals | `ProjectAgentService` | MUTATE | taskId/sequence/Task state/allowed schema、尝试去重 |
| Project Task context/inspect/recovery READ | `ProjectAgentService` | READ | Product durable snapshot, 不能凭浏览器对话重放 |
| Project Task prepare review | `ProjectAgentService._prepareReview` | INTERACT | Workspace/changes/validation/Preview/simulation、stale/repair |
| Project Task formal commit | `ProjectAgentService._commit` | MUTATE（按潜在内容升到更强审批） | 独立审批；resultingRevision/ChangeSet，unknown reconcile |
| Project Task takeover/resume | `ProjectAgentService.takeOver/resumeTask` | MUTATE（更新 Task 控制状态），不等于自动运行模型 | 当前 Task sequence/状态；禁止旧 Agent 异步继续 |
| 内置 Studio 模型显式委托 | `NativeGenerationHost` + Product Project Task | INTERACT（Provider 网络/费用） | exact Route/预算、Attempt/Tool Calls/结果；自有可信审批 |
| Project Task delete | `ProjectAgentService.deleteTask` | DESTRUCTIVE | 源作用域/当前关联、正式删除风险单次审查 |

**细则暂不冻结**：每个 action 的准确名称和 Zod schema；Evaluation/Preview 的自动回收、MCP 允许批量提案上限、各类高影响混合 ChangeSet 的拆包策略、委托模型无头 executor 是否需产品新增 endpoint、和 UI 审批展示形式。这些不影响本轮已批准的方向，第四轮焦点先转入 Memory/Goal/Experience/Evolution。

## 6. 安全与验收（规划，尚未执行）

- **S 路径**：简单 Frontend Patch → 检查 → evaluate/Preview → 专门批准 → ChangeSet，成功且仅提交一次；并发修改导致 409/stale；未知 Commit 只核对不盲重试。
- **A 路径**：跨文件任务 Plan/Proposals/Review/Repair/Commit/Takeover/Resume；Atria Task 持久化重启恢复；只读取已存 Task state 还原执行状态。
- **权限**：无 Policy Ceiling/可信审批时不能落地修改；为 evaluation 预批的 Lease 不可用于正式 Commit；模型提示文字与 Stage 状态不等于 human approval。
- **多进程**：两个 MCP stdio 实例同时写入同一 Project 时最终由 Native CAS 拒绝冲突；普通 Workspace 路径与 Project Agent 路径互相影响 Revision 时不得静默覆盖。
- **委托模式**：默认外部 AI 执行不触发 Atria 付费 Provider；显式内置模型才产生独立预算化生成操作，不能以“登记 Attempt”为模型已运行证据。
- **UI**：真实编译 Preview、前端 Epoch 与源文件身份分层；未执行人工 UI 检查不报告人为体验认证。

以上是 Plan 冻结的**预期行为**，静态代码引用不代表已经执行测试、浏览器验证或真实客户端审批。
