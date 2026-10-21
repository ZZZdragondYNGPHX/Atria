# V3 编排与审批适配

从 [index.md](index.md) 进入。**状态：已交付，双 Backend 原生 Review 验证通过。** 用户已确认接入与提交边界，并选择原生批准后自动续接的 A 方案；跨模块决定见 [decisions.md](decisions.md)，实际证据见 [Record](../../../records/plugin/atria-mcp-main-adaptation.md)。

## 目标与现状

将 MCP 从已移除的 browser Orchestrator 接入当前 Native orchestration 和各域原始业务入口。Plan、Binding、Run、Effect、原生审批和业务持久结果均由产品拥有；MCP Registry、授权 Lease 和 Operation Journal 负责外部调用资格、受控调用和关联观察。

当前已确认：

- `main:src/endpoints/native-orchestration.js` 提供 Plan、依赖、Binding、Run、Tool 和审批 launch；不存在通用 GraphPatch / Effect dispatch 或 approve 路由。
- 编排写入要求 `{schemaVersion:1, commandId, expectedHostBootId, body}` 及 `X-Atria-Host-Boot-Id`。MCP 当前仅有 `serverBootId` 请求守卫，需要保留两个身份的职责。
- `main:src/native/orchestration/review-origin.js` 使用独立 loopback origin、原账户重新认证和独立 Review Session；MCP 客户端同意不能自行产生原生审批。
- Project Agent 的直接提案、managed generation 和部分 commit 流程仍存在；新编排路径需要与这些原始入口建立明确关系。

## 1. 适配后的职责与入口

保持现有顶层工具形态，以精确 semantic actions 对接以下产品能力。动作名在实施前按 Registry 统一命名，以下是职责分组，不是已发布的调用合同。

| 分组 | 原生权威 | MCP 负责 |
| --- | --- | --- |
| Plan 创作 | Native Plan repository / validation / dependency pins | 查询、草稿创建编辑、校验、发布、fork/archive/delete；保留原 draft CAS 与精确 revision |
| Source Binding | 原 RP / Native Session / Project source authority | 查询和精确更新 binding，披露影响范围；执行钉住 `{planId, planRevisionId, definitionHash}` |
| 原域执行 | RP generation、Native Session turn、Project generation / commit、Native Tool 原始入口 | 显式 preflight 与受控业务工作流调用，保留预算、source、route、端点与原始结果关联 |
| Run / Effect 观察 | Native Run observation service | list / observe / details / diagnostics，按原权限和分页展示状态、效果、审批、成本与可用控制 |
| Run 控制 | 原生 cancel / recover / reconcile 及原域 resume | 只调用当前原生投影允许的控制，保留 command 和版本约束 |
| 原生 Review | 原 ApprovalController + ReviewAuthority / ReviewOrigin | 发起短期审阅入口、显示待批状态、读取审批结果，并在有效的原意图内续接 |

外部 AI 可通过现有 Studio / Project Agent 工具直接编辑、提交计划和提案。用户显式委托 Atria 内置模型时才启动原生 generation；沿产品原 Route、预算与 V3 执行机制。MCP 不运行另一套图执行器，不按任意节点名动态调用能力。

旧 `agent.run.start` 及旧 browser Orchestrator 观察 / checkpoint / preset-binding 方法退役；当前 Plan/Binding/Run 能力直接使用服务端权威。旧输入不按相似字段猜测迁移。

### 三类业务执行的接入点

| 域 | 当前原始流程 | Binding 与适配要求 |
| --- | --- | --- |
| Native Session | controlled turn preflight → timeline append → 精确 user-input Commit Receipt → controlled start | 产品优先 exact entryPoint Binding，再 session 级 Binding；无 Binding 时支持原生非 V3 流程。预检明确披露实际执行模式；显式请求 V3 却无有效 Binding 时拒绝，不自动选择 Plan |
| RP Chat | 受控 rp/source binding → rp/preflight → rp/start | 必须有当前 controlId 的 RP Binding；最后一个 floor 必须是 user 输入，精确固定 source prefix、Plan、配置和预算 |
| Project generation | Task generation/preflight → generation/start → 原 Task / operation 状态 | 产品优先 exact task Binding，再 project 级 Binding；无 Binding 时保留产品现有 managed executor。已命中 Binding 时固定其 Plan 与 dependency，失效不回退 |

发布 Plan 只创建不可变版本，保存 Binding 只选择该版本；两者均不启动执行。MCP 复用产品返回的 definitionHash、validationDigest 和 source / configuration 指纹，不另算一套批准语义。Project 内置模型生成停在 Review，最终正式提交继续独立授权。

## 2. 区分四种“审查”

| 机制 | 证明什么 | 不能代替什么 |
| --- | --- | --- |
| MCP 客户端授权 | 用户允许外部客户端发起该精确 action / 业务意图，在配置 Policy Ceiling 内执行 | 产品自身要求的真人 Review、原生 source / grant / budget |
| preflight / validation / reviewHash | 输入、工作区、Source、Route、配置和预算仍与已检查版本一致 | 用户身份或真人批准 |
| V3 图中的模型 review / judge | 模型质量判断、返工与结果选择等业务控制 | 真人审批 |
| Native Review Origin | 原账户用户审阅并批准这个精确 Effect，绑定 source、input、target、endpoint、egress、budget、Host 和 epoch | 其他效果、后续变更或另一次运行的授权 |

MCP `READ / INTERACT / MUTATE / DESTRUCTIVE` 按工具实际副作用分类；原生 `R0 / R1 / R2 / R3` 是产品效果风险分类，两者不做简单数值映射。原生是否请求真人 Review 以 `requiresApproval` 及其 authority 为准。

### 当前主线实际要求

- Session / RP / Project generation.send 当前为 `R1`、`requiresApproval: false`；用户仍须通过精确 MCP 授权显式启动收费生成。
- Session / RP chat.output 当前为 `R2`、`requiresApproval: false`，由原始输入、grant、预算和结果提交权威约束。
- 新 Project `formal_commit` 为 `R2`、`requiresApproval: true`，需要独立原生 Review。
- Native Tool 中 Skill 为 R0、MCP/A2A 为 R1，当前 descriptor 的 `requiresApproval` 为 false；工具是否联网、收费或写入仍按原端口与 MCP action 的真实效果披露。

因此不会对每个 Run 节点统一增加真人弹窗，也不会把 preflight 的 `approvedReview` 字段当成真人批准。

## 3. 两类 Project 提交的真实边界

### V3 原生 formal_commit

`main:src/native/orchestration/project-commit-contracts.js` 当前只接受：Task 在 review、validation passed、highImpact false、Workspace 恰有一个 `project.save`，且变更仅包含 Project displayName、现有 Actor 的 description/personality/scenario、现有 assistant 开场 content。其余字段和结构必须与原 Source 一致；精确审阅正文还受现有 32768 字符容量限制。

原生流程是 `prepare → waiting_approval → Review Origin 决定 → dispatch → observe / receipt`。prepare 已持久创建 Run / Effect / Approval，并记录本地计算工作，不能标为 READ；批准不会自动等于写入完成。

### 现有直接 Studio / Project Agent 提交

当前产品仍保留直接 Workspace Apply 和 Task commit；它们使用既有 evaluation、reviewHash、sequence、baseRevision、CAS 和业务 Receipt，不以 V3 Review receipt 为前置。MCP 中这些路径仍要求精确客户端授权，涉及 source.delete 时仍是一次性 DESTRUCTIVE。

两类入口按明确工作流暴露。V3 Run 中的 formal_commit 始终使用其原生 Review / dispatch；直接创作工作流复用直接 Studio / Task authority。原生拒绝或 Review 不可用时，不将同一 V3 请求静默切换到直接提交。未被 V3 支持的 Workspace 变更在原生能力声明中明确其范围。

把全部任意 Workspace 变更统一纳入 V3 Review，会要求扩展 Project descriptor、权限、风险和效果验证，属于额外产品能力；不作为本次适配默认前提。

## 4. 用户操作体验

### 4.1 普通定义编辑与显式模型执行

- 查询、校验、preflight 和原生无持久副作用的状态观察按 READ 暴露。
- 创建 / 编辑 / 发布 Plan、修改 Binding 按具体 MUTATE / DESTRUCTIVE action 授权；发布不授予执行权限，绑定不自动启动 Run。
- RP source binding 可能创建控制对象和更新 Chat header；即使名称类似查询，也按持久动作处理。
- 显式内置模型启动时，MCP 授权展示精确 source / Plan / Route / 预算与原生允许的 effects；一个受控 Run 内部的既有工作由原生机制执行，保持原预算和 grant，不逐节点重复请求同一授权。

### 4.2 需要原生真人 Review 的业务工作流

提供固定业务工作流，使一次 MCP 客户端授权覆盖已经披露的准备与最终精确 dispatch：

1. 读取当前 Task / Workspace / Plan / Source / 预算等证据，固定业务输入与目标。用户在 MCP 客户端同意这次完整操作。
2. MCP 调原域 prepare，取得原生 runId / effectId / approvalId；创建或获取审阅入口，立即报告“等待原生审批”。
3. 用户在产品独立 Review 页面完成原账户认证、审阅与批准 / 拒绝。MCP 只获取入口和状态，不访问审阅详情中的 nonce、认证会话或密码，不代替用户作决定。
4. **已确认 A 方案**：批准后，在原 MCP 实例、有效授权时限和未变化的业务绑定内，自动续接这一个精确 dispatch；直接复核原生当前状态和守卫，不再对同一已披露步骤增加 MCP 确认。
5. 从原域业务 Receipt 确认实际提交，再观察 Run 的输出发布和费用结算。分别报告等待、批准、已派发、业务已提交 / 输出未完、完成、拒绝或未知。

这要求 MCP 对该固定工作流支持有界、单次最终派发的授权续接；它不继承旧 `agent.run.start` 的任意子 action 委托。Policy Ceiling 仍按精确注册入口限制，审批展示完整业务效果。已授权输入、目标、Plan、Source、Route、预算或 Host 发生变化，或者授权过期 / MCP 重启时，原续接许可失效，需要重新检查和授权。

续接有效期不延长既有五分钟 MCP 授权上限；原生 Review 另受 Run deadline 与原生审批期限约束，执行取全部仍有效的条件。合法的 prepare / approval 状态推进不被误判为业务意图变化，但不会放宽原生当前 state / epoch / claim 守卫。不支持当前可信 MCP 客户端授权通道的连接继续保持写入关闭。

等待用户期间释放调度 lane 与目标锁，保留观察 / 取消可达性；执行阶段重新获取目标锁和核验。MCP 断开不代表原生批准或业务效果被撤销，重新连接先读取原生状态。

### 4.3 Review 可达性与本地限制

当前 Review Origin 使用产品 Host 上的独立 loopback listener，原主站 cookie 不构成 Review 认证；账户需具备原生 Review 可用的密码和状态。主站 `/approvals/launch` 也限制本机请求。

通过短期链接让用户在运行 Atria Host 的设备上打开独立页面；不把 Review 页面塞入仅允许同 origin 的 MCP 证据浏览器。链接只在当次结果中短期展示，Journal 不保存 launchRef / nonce / 密码或 Review 认证状态。

远程 MCP 连接、无密码账户、审批已过期或通道不可用时，返回具体不可用原因和所需用户动作，保留已有 Run 状态。不会关闭、替代或放宽原生认证。

## 5. 身份、结果与恢复

### 身份职责

- `serverBootId` 继续表示 HTTP 产品进程与来源证据；`hostBootId` 表示 Native writer Host fence。
- Run 还持有 hostGeneration、epoch、stateVersion、graphRevision；由原生 authority 检查，MCP 不自行改写。
- MCP Journal 只存 operationId 与原生 commandId / Run / Effect / approvalId / operation / Receipt 的必要关联，补充 owner 与目标摘要，不复制 Plan、Task、业务状态或审批秘密。

### 恢复动作分离

| 动作 | 语义 |
| --- | --- |
| observe / details | 读取原生当前投影，缺失结果继续未知 |
| cancel | 请求停止新工作，已派发效果、已提交结果和费用仍按原生实际状态处理 |
| recover | 将控制恢复到当前 Host fence，旧审批失效；不会自动恢复执行或重发 |
| reconcile | 沿原 Receipt / 原 operation 查询并持久收口，属于有副作用的控制动作，不标 READ |
| 原域 resume | 仅对当前原生 controls 明确支持的未派发效果重新接纳；需要重新核验，formal_commit 需要新原生审批 |

Plan commands 的 commandId 绑定原 operation/body；Run control 对版本前置和幂等重放有自己的正规规则。MCP 使用各自当前合同处理 unknown，不建立统一重试器，不以新 commandId 重发意图。Run controls 的重放也不能被概括成 wire body 必须逐字相同。

Run observation cursor 有原生 Host / 可见性 / epoch 和有效期约束，并可能一次性消费；失效或 resync 时按原协议获取新 snapshot，不混接旧 delta。原生投影省略的 Result 正文不通过底层仓库读取补齐，正文继续由原 recipient / audience authority 获取。

当前通用 `runs/reconcile` 覆盖 RP 输出、Session 输出和部分 Project 工具回执，不覆盖 formal Project commit。后者用原域 `commit/observe` 判定已提交状态；只对原生明确支持的 ready / 未 claim 效果使用 `commit/resume`，不把未知 dispatch 当作可恢复 ready。RP / Session 也没有通用的“恢复后重发模型”HTTP 入口。

收费发送响应丢失、正式写入 ACK 丢失、Storage commit unknown 时先观察和 reconcile；没有原生证据不得报告成功。业务已提交但输出或费用仍未收口时保留分层状态，避免再次写入。

## 6. 当前所需产品侧接缝

优先复用现有 endpoint。候选小改动是为 MCP 暴露原 authority 计算的可用性 / 精确提交描述 / 副作用预检或受限 workflow observation，避免工具复制原生规则或为了发现不可用而先创建持久工作。

另一明确候选是 owner-scoped、只返回受控 command outcome 的只读查询：当前没有公开 command-get，Plan create 等 ACK 丢失只能显式重用原 commandId / 原 payload 取得已存 outcome。查询接口应沿原 Command repository 和原 source 可见性授权，不允许查询任意 owner、泄露请求正文或发起执行。是否增补按实际恢复链路确认。

是否确有接口缺口及精确 shape 在实施合同核实时确认。不会新增主站 approve API、公开私有 execution permit，或将 Review Origin 的认证材料交给 MCP。

## 7. 验证目标

实施阶段针对实际变更验证：Plan CAS 与发布绑定；Source 变更拒绝；server / Host fence 分离；精确预算；普通生成不额外请求 Native Review；formal_commit 的 pending/approve/reject/expire；同一有效业务授权续接一次；并发源变化；MCP / Host 重启；ACK 丢失后的 observation / reconcile；cancel 不冒称回滚；直接创作和 V3 Run 入口职责明确。

真人 Review、真实客户端、真实 Provider 与本地模拟验证分别记录证据。当前仍只有源码调查，没有这些动态验证结果。

## 8. 第二轮确认状态

本模块接入与提交边界、分层审批和 A 方案已由用户确认。具体 API schema、必要小接口与实施参数沿上述边界核实；影响已确认职责和授权范围的实质变化仍需讨论。整体方案尚未取得正式开工授权。

## 代码依据

- `main:src/endpoints/native-orchestration.js`：请求封装、Host header、Plan/Binding/Run/Tool 及本机审批 launch。
- `main:src/native/orchestration/review-origin.js`、`review-authority.js`、`approval-controller.js`：独立认证、精确审批绑定、nonce 与单次消费。
- `main:src/native/orchestration/native-project-commit-authority.js`、`project-commit-contracts.js`：formal_commit 支持范围、prepare/dispatch/resume/observe 与原业务 Receipt。
- `main:src/native/orchestration/native-turn-orchestration.js`、`native-rp-generation.js`、`native-project-orchestration.js`：generation / chat.output 的风险及 requiresApproval。
- `main:src/native/orchestration/native-tool-contracts.js`、`native-tool-orchestration.js`：原生 Tool descriptor、准备和执行。
- `main:src/native/orchestration/plan-repository.js`、`run-repository.js`、`run-observation-service.js`：命令幂等、版本、控制与投影。
- `plugin:atria-mcp/src/kernel.js`、`protocol.js`、`operations.js`：现有精确 Lease、可信客户端授权、调度与 Journal；固定业务续接是待实施增量。
