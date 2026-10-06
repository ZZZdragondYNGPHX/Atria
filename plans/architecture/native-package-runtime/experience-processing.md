# Experience、Lifecycle、Tool 与 Processing

本模块拥有 Package 编排、交互和数据处理的阶段边界。领域操作依赖 [authority-script.md](authority-script.md)，模型任务与产物依赖 [context-generation.md](context-generation.md)。

## Experience 与原生能力

Experience Script 组合获准读视图、Command、Task、UI 和 Lifecycle，负责决定下一步工作。能力通过声明和原生宿主/Bridge 提供；便利性不能形成任意正式 State 写入。

扩展现有 Controller、Capability 与 Bridge 的作者表达，按用途提供清晰领域服务。复用现有原生组件、页面/交互定义和消息 Block，不以全局宿主对象、旧函数库或消息 iframe 为中心。

## Lifecycle 与运行编排

Package 定义何时开展工作，Atria 负责受控触发、调度、恢复及与正式提交的关系。

事务内必须强制的游戏规则由 Authority 执行；提交后的正式事实可驱动后续编排。Task / Generation 的运行通知与 UI 挂载、更新和卸载按各自用途消费，不能混同为已经发生的游戏事实。

复用 Scope、工作流、时钟、自动化、持久 Task 意图、重复调用与结果有效性机制。Experience 的事件反应仍是提出后续任务或 Intent，正式变化继续经过领域规则和平台校验。

后续工作与其正式原因、运行范围和资源依据保持可追踪关系。恢复、重复处理、取消及迟到结果不能重复产生未经允许的领域效果；具体事件目录、调度交付和推进策略由技术设计确定。

## Tool 调用与操作路由

模型只能使用获准、声明的工具。工具输入受 Schema 与 Capability 约束；业务写入通过固定 Command / Intent 的领域规则执行，模型不能临时选择 validator、规则实现或任意写补丁。

只读查询、辅助任务和领域操作有各自结果边界。复用现有 Task / Generation 输出约束和 Authority 路径，避免另建工具专属状态写入 Authority。

## Processing 的用途与产物

| 用途 | 产物与归属 |
| --- | --- |
| 生成输出处理 | 整理后的候选消息、结构化数据或领域建议；正式采用走对应 Authority |
| 上下文处理 | 请求使用的历史表示或片段；保留来源、授权和最终请求预算 |
| 呈现处理 | 排版、组件数据和 UI 呈现；保留正式来源与 MessageProjection 一致性 |
| 正式消息编辑 | 显式操作，形成新正式消息版本或 Revision |

处理契约表达阶段、用途、输入输出、固定资源、作用范围、顺序、预算及失败语义。Regex 是文本转换的一种实现；复杂提取与格式化允许受限脚本，模型推理由显式 Task 承载。

可执行逻辑来自正式资源，模型字符串与组件数据保持数据身份。重新渲染不自动编辑历史或推进游戏；流式片段、候选结果和正式采用产物需要可区分。

交互由声明的组件和 Controller / Experience 处理，再提出获准操作。模型提到“获得 100 金币”可以被提取成候选建议；实际金额和入账由固定规则决定，正式掉落卡消费已确认结果。

## 阶段交付

S4 先贯通 Experience 的领域请求、Task / Tool 调度与 Lifecycle；S5 统一处理阶段和原生交互，并完善作者声明与预览。具体宿主接口、事件和 Processor 粒度由阶段设计补入本模块。

## 行为验证

- 事务内规则不依赖 UI 监听是否存在；运行范围结束、恢复与重复投递不重复提交不合法效果。
- Tool、按钮、脚本和自动化使用相同领域规则路径，调用入口不能改变合法性。
- 消息重新呈现保持正式历史与 State 不变；正式编辑产生正确版本关系。
- 输出解析成功不直接授予奖励或写权；未声明组件类型、超界数据和文本内代码不取得执行能力。
- Processor 顺序、作用范围、失败和预算可解释，原生请求与呈现链路真正消费声明的处理结果。

## 起读代码

`src/native/lifecycle-authority.js`、`session-core.js` 的 Lifecycle 与 Task 提交；`public/shared/native-lifecycle-contract.js`、`native-task-contract.js`；`src/native/task-scheduler.js`；`src/native/frontend/bridge.js`；`public/scripts/native/frontend/script.js`、`runtime.js`、`conversation.js`；`public/scripts/extensions/regex/engine.js`；`public/shared/native-message-contract.js`、`native-frontend-host.js`。

## S4 实施：固定编排接点（2026-10-06）

沿用 Frontend Bridge action / operation、Controller 和 Authority-first Turn。新增固定 `target.lifecycle`，仅接受 workflow.transition（固定 workflowId / transitionId）、workflow.cancel（固定 workflowId）、clock.advance（固定 commandId，输入 ticks 1..maxTicks）与 interaction.schedule（固定 interactionId，输入 proposalId）。编译时解析真实声明并固定 digest，调用者不能提供路由字段、StatePatch 或规则。所有动作进入原 SessionCore Lifecycle CAS；模型 Tool 继续原固定 Transaction catalog / resolver / Authority 路径，Task 继续原 scheduler。

新增 outbox 项在发布时保存 cause 的真实 Revision / Branch / invocation；Task 保存从 durable outbox 派生 lifecycleCause / Scope epoch / Workflow，忽略外来同名数据。旧 outbox 无 cause 仍可恢复；不建立事件事实缓存。工作流推进保持显式 gate，不把 Task 通知当作业务事实，取消与迟到采用继续由原 anchor / Scope 检查拒绝。

S4 没有新增任意事件订阅、跨 Session 事务或自动重放 Controller 写入。既有 ready / clocks / logical.interval / workflows / durable Task intents 承载编排，Processing 与作者工作流在 S5 完成。

## S5 实施：有界 Processing（2026-10-06）

ExperienceContract 新增 required `processing@1` 与 `processingRuntime: { schemaVersion: 1, processors }`，必须同时声明。按列表顺序执行，每项固定 id / stage / kind；最多 32 项，声明最多 256 KiB。kind 为 trim、字面 replace（非空 find / replacement），或固定 JS/TS script source。Script 沿用 Package 闭包编译与 QuickJS 的同步 `default.transform({ text, stage, source, seed })`；只返回文本，不获得 State、Task、Bridge、I/O 或提交句柄。Presentation 只接受数据式 trim / replace。单文本最多 65536 字符、每 pipeline 累计最多 262144 字符；上下文编译另限制历史输入和输出总量。VM 既有 128 KiB 消息、CPU / heap 限制继续生效。失败拒绝候选，保留安全 Processor / stage 定位。

- output：原 Native Turn narrator 的候选正文，在 Interpreter / 正式 finalize 前处理；正式消息与领域效果仍由原 Authority / SessionCore 同次 CAS 采用。结构化 Task artifact 保持真实生产身份，不暗中改写 payload 或赋予 uses。已有 MessageProjection 的 prose 必须仍等于新正文；不匹配就拒绝，不能静默丢弃 Blocks。流式片段仍是 provisional。
- context：现有 ContextCompiler 已通过 visibility 的 recent_raw TurnGroups 在计数/选择前处理，清除旧 tokenEstimate，保留 sourceRefs 和处理证据；实际展开文本进入同一预算与 Provider 最终请求检查。Information 视图替代 raw history 时，不为了执行 Processor 重新读取 Timeline；Persona / 当前事实与私有 projections 不进入这个文本处理接点。Knowledge 仍走 S3 的固定 derive / selector。
- presentation：临时 `displayContent` 来自正式正文，原 `content` 和 MessageProjection / Timeline 保持不变。新增 host.conversation.presentation 读取与原生 Play 消费共享派生；旧 messages 的 Schema / digests 不变。字符串仍由 safe prose 渲染，不取得执行能力；超预算显示明确错误并保留原消息和控制项。

既有 Regex lane / package regex 编辑继续兼容，没有把未验证的其它处理层声称为新的正式 Authority。处理证据保存阶段、Processor ID、输入/输出 hash、固定 Script source / resourceHash；不保存另一份私有输入事实库。

Studio Runtime Design 可编辑同一 ExperienceContract，校验后经原 Review / ChangeSet 保存；Processor 可添加、移除、排序和选择类型。Source 与结构化草稿共享，非法 Source / 冲突留在本地。saved revision 的 Processing preview 使用当前精确项目源码、显式 sample text 与 stage，不读取正式 State、不发送模型请求、不提交或采用结果；拒绝过期 Revision 和调用者指定源码。
