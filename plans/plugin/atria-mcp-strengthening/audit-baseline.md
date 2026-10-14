# Atria MCP 补强 — 第一轮代码审计与现状基线

> 本页是 **2026-10-14 静态审计记录**，不是测试/运行验收报告，也不是独立的实施 Record。最新实现以真实仓库/运行时为准；涉及动作设计的全局冻结决策见 [index.md](index.md)。

## 1. 审计范围与可重复定位

- `main@7e1045ab836c22cafbc92c5de056ad701f56e723`：递归取得 `src`、`public`、`tests` 等代码树清单，按 MCP 接口、native authority、Session/Studio、运行时与客户端调用链筛选，读取直接相关实现/契约/测试；**未逐行阅读全文、图片、依赖或所有无关测试**。
- `plugin@ee99b2b3d1c65502a971495a6016ccb7c195bf6d`：`atria-mcp` 目录 33 个常规文件（递归树 37 个条目），重点审阅 `src/*.js`、`README.md`、`package.json` 以及测试和验证脚本。
- 核心定位：`main:src/native/mcp-service.js`、`mcp-http-client.js`、`session-public-work.js`、`task-scheduler.js`、`model-prompt-runtime/contracts.js`、`project-agent.js`、`plugin-platform.js`、`authoring/studio-service.js`；入口 `main:src/endpoints/native-{generation,session,studio,product,extensions}.js`。
- 独立 MCP：`plugin:atria-mcp/src/{server,kernel,read-authority,mutations,memory-mutations,high-risk,agent-delegation,capability-bridge,catalog,browser,repository,policy,provenance,config}.js` 与 `test/`、`scripts/verify-*.js`。
- 先前项目的 `docs:plans/plugin/atria-mcp-capability-expansion/`、`records/plugin/atria-mcp-capability-expansion.md` 用于理解既有验收而非重新实施/改写历史。

## 2. 架构职责：必须分清的三层

| 层 | 所有者 | 审计事实 | 补强边界 |
| --- | --- | --- | --- |
| Atria 内置 MCP Consumer | `main:src/native/mcp-service.js` | 运行于 Native Session 显示数据选取和已有 scheduler/local work 预算下，受精确 tool/resource allowlist 约束；外部结果以 transient provenance 返回，不直接写 World/Memory/Task/Goal | 不把它误认为给外部开发 AI 连接的 MCP Server |
| Atria 原生产品 authority | Session、Studio/Project、Package/Library、Memory/Agent、Generation、Storage | 已具备 authenticated endpoints、revision/identity guards、Project Workspace/Review/Apply、RunControl、Store/Repository 等分层 | MCP 必须调用既有权威接口；无必要不创设并行 persistence |
| 独立 MCP Server | `plugin:atria-mcp/` | Node.js `stdio` 服务端，固定 18 工具；registry 下分语义 action 和四个风险级别；通过固定 HTTP 与受限浏览器桥对接产品 | 此企划主要修改层；必要新增产品端接口应另行核对权限与真实源码 |

内置 Consumer 的客户端固定 MCP 协议 `2025-11-25`、工具/资源精确白名单（各最多 8 项）、受限文本/JSON、请求响应上限、禁重试不确定远端调用。A2A 有独立的 durable remote-task 设计。不要不加区分地复用它们的状态机。

## 3. 独立 MCP 已实现的功能

| 部分 | 当前代码事实 |
| --- | --- |
| 顶层工具 | `src/server.js`、`kernel.js` 固定 `atri_status/capabilities/reference/repo/git/artifact/api/diagnose_snapshot`、browser 六项、四类风险 executor，合计 18 项 |
| 权限安全 | `ActionRegistry` 精确 schema/authority；`PolicyCeiling` 精确 action-ID；默认 READ；可信客户端 form elicitation；`RiskExecutor` 执行前后 guard；`ReceiptStore` 记录成功、拒绝、不确定 |
| Source/Runtime 证据 | `provenance.js` 对源码原始字节、HEAD、工作区、serverBootId、浏览器加载时间及 Experience/Preview 分层；独立 source fingerprint 不执行产品 checkout 代码 |
| 仓库/产物 | `repository.js` 检索 tracked+安全 untracked 源码、只读 Git 证据、固定开发产物根；路径/配置/敏感内容过滤 |
| 产品数据 READ | `read-authority.js` 静态语义动作列表：Session/Chat、Studio、Library、Work、runtime 配置、Settings、Diagnostics、Project Agent 状态等；`atri_api` 仅 Native GET discovery/read，个别固定 POST 只读动作经受审查 authority bridge |
| 产品变更 | `mutations.js` 包括 Save/Restore、分支/聊天/生成、Build Workspace/Evaluate/Apply、Preview/Simulation、设置、配置、Library revision；`high-risk.js` 单次破坏性操作和 Package 安装等 |
| Browser | Playwright 隔离页面、可访问性快照、截图、日志、重载/响应证据；公开 `atri_browser_interact` 仅 scroll，通用 click/fill/press/select 被拒绝 |
| Browser capabilities | `capability-bridge.js` 是固定允许列表，用于内存图、Orchestrator、部分 game-runtime READ；`memory-mutations.js` 针对已加载 Memory source/branch 做 guarded update |
| Agent delegation | `agent-delegation.js` 允许显式选中 preset node 的 `delegated-node`，最多 8 个精确 Memory action；不等于产品 Project Agent 全流程或任意 Agent graph |
| 包及平台 | `atria-mcp/package.json` 指定 Node >=22、MCP SDK 1.30.1、Playwright 1.63.0；产品 `main:package.json` engines 为 >=20（审计 HEAD），不能只凭表述声称两者都强制 Node 24 LTS |

## 4. 明确的 P0 可靠性问题 / 风险（由代码可定位）

1. **全局串行工具队列**。在 `src/server.js` 的注册函数中，所有工具通过同一个 `queue = Promise.resolve()` 和 `queue.then(...handler)` 执行，包括只读 status、diagnostics、screenshot、用户审批与耗时 mutation。一个长等待能阻挡后续所有工具请求；取消请求若依赖后续 MCP Tool 将被排队。是否真的发生某客户端死锁还需真实端到端复现，不在静态审计中冒充故障已复现。
2. **风险 Executor 的单并发闸**。`src/kernel.js` 内 `RiskExecutor.#running` 遇到并发直接返回 busy；改掉服务器外层队列之后仍需引入按 authority/目标范围的隔离，否则会在单调度和竞争写入之间二选一。**不能删除写侧互斥却没有新的锁/guard。**
3. **回执、授权、MCP 自身状态为进程内临时值**。`ReceiptStore` 默认容量 100、TTL 1 小时；Lease 最长 5 分钟、最多 20 次（破坏性 1 次）；MCP 关闭清除。收到“不确定”结果，现有策略要求人工/语义 read 先核对产品。重启后无法直接用 MCP 内存回执恢复同一条操作链；要决定是否用极小的非敏感 durable intent/operation journal，且不得自动重放写入。
4. **产品生成 scheduler 也有瞬态部分**。`main:src/native/task-scheduler.js` 以进程内 Map/queue/running 管理 operation；某些产品业务如 Session/Studio 的正式持久化状态属于另一 authority。MCP 不可自行推断运行中操作在 Host 重启后已回滚或已成功。
5. **真实客户端信任交互未充分验收**。MCP 有 form elicitation 与 harness 的 deterministic acceptance；`scripts/verify-clients.js` 明确将 humanApproval 标记为未测试。客户端支持 form、展示的字段/可理解性、审批拒绝/取消、断开与复用场景需要区别于 SDK fixture 验证。

这些是 **优先设计/验证的风险**；是否采用独立控制通道、分域 semaphore、持久任务管理器等尚未在第一轮冻结。

## 5. P1/P2 能力差距与风险分类（第二轮深化）

| 领域 | main 权威能力 | MCP 当前覆盖 | 第二轮核实/决策 |
| --- | --- | --- | --- |
| Project Agent | `native-studio.js` 含 Task create/get/context、tool、strategy、generation、Review/Commit/Resume/Takeover 等 | Project task 读取 + 另一 Orchestrator delegated-node | **P1**：完整 Project Agent 语义矩阵与审批，避免把两套 Agent 混成一个 |
| Goals/Experience/Evolution | `native-generation.js` 对外有目标/证据/经验/演化分组 | 主要是运行观察和部分 Agent delegated-run | **P1**：区分只读/付费评估/模型侧变更/永久知识晋升 |
| Session/History/Save | Product/Session 持久 Revision、Branch、Save/Load/Timeline/RunControl | 常见流程覆盖较好 | **P1**：补充历史诊断、回执查询、恢复及明确写入语义 |
| Memory | 内存图 read/write factory、加载状态、Native session source | READ 丰富、guarded mutation 依赖页面 | **P1**：无头运行能力、来源一致性与成本声明 |
| Generation/Provider | 模型 Route/Connection、Prompt、Context、task scheduler、Speech/Illustration/Prediction/Comparison | 基本配置、聊天生成与任务停止 | **P1**：能力目录及长任务状态/预算，防止请求与回执混淆 |
| Studio/Resource/Package | 工程源码、Resource Graph、Preview、ChangeSet/Apply、Bundle、Package | 主流程已有 | **P1**：面向 AI 的分步作者体验、合同生成/自检与跨版本可追溯 |
| UI 操作 | Frontend Host Bridge、Experience Epoch、真实 UI surface | 实证观察完善；任意 click/fill 不开放 | **P1**：只开放不可绕过语义权限的明确 UI 行为或隔离受控验证 |
| Performance/Discovery | 产品 API/源可不断进化 | `catalog.js` 以静态 Acorn 推导路由，`provenance.js` 周期性扫描/哈希源码；`read-authority.js` 固定 action | **P2**：路由发现质量与变更预警、增量/缓存身份校验、响应分页一致性 |

## 6. 审计中看到的安全不变量

- **产品是真值**：`main:src/native/authoring/studio-service.js` 的 Project Git 修订、Workspace evaluate/execute 与原有 Validation/Preview；`main:src/native/session-core.js` 的不可变会话、版本与连续性；`main:src/storage/` 的 Repository/Engine 层不允许 MCP 另行直写用户文件。
- **只读 GET 与固定 POST-shaped READ 分开**：`atri_api` 不能借 discovery 取得任意写入路径；语义 Action ID 的作用域和风险分级不允许模型提供任意 method/url/JS。
- **权限与证据不互相替代**：Source `EXACT` 只证明相关源码身份，不替代 Experience Epoch、Project base revision、Preview、运行配置或人类批准；`UNVERIFIABLE` 不能描述为“通过”。
- **不确定提交不可重试**：正式写入前后应保持精确目标、预条件、rev/fingerprint；HTTP 断开或 MCP restart 不证明 rollback；必须先查原权威回执/状态。
- **旧 MCP 企划优先作为已实现历史**：保留已有 18-tool Registry 宪制；是否扩顶层 surface 需要后续说明模型收益、安全风险、客户端迁移与测试，不因单领域新增就复制工具。

## 7. 目前未得到的证据

- 本轮没有实际启动产品、MCP stdio server、浏览器或真实 Codex/Claude Code；没有运行 `npm test`、`npm run check`、`npm run test:atria`、真机/UI 验证。
- 现有仓库测试脚本和历史 Record 说明已有既往测试**记录**，不构成本轮 HEAD 自动通过，也不足以证明真人 form UX、跨平台行为或并发进程重启恢复。
- 未对每个 Agent/Memory/Illustration/Goal endpoint 做输入字段级逐一校验；补强矩阵应对每项 action 再核验当期请求/响应契约、错误码及产品 authority。
- 敏感自由文本输出过滤是有限规则，并非保密形式证明；大规模诊断和外部模型上下文需要单独审查数据脱敏、最小披露与审计成本。

本页可随新 HEAD 添加“审计差异”小节，但正式设计决策和验收以本任务对应的 Plan 模块/后续实施 Record 为准。
