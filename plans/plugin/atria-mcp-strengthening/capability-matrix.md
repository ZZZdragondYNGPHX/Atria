# Atria MCP 补强 — 第二轮能力矩阵（冻结规划分类）

- **归属**：本文件是补强任务的覆盖矩阵与优先级权威。架构全局原则见 [index.md](index.md)，具体 P0 状态/并发/授权见 [p0-reliability.md](p0-reliability.md)。
- **规划基线**：2026-10-14 静态源码审计，`main@7e1045ab836c22cafbc92c5de056ad701f56e723`、`plugin@ee99b2b3d1c65502a971495a6016ccb7c195bf6d`。此矩阵的“现有”仅表示源码中观察到接口/Action，**不是**当前 HEAD 的执行测试或真实客户端验证。
- **冻结选择**：第二轮方案 B；先 P0 可靠性，再逐域补强、验收，不采用全量另起工作流引擎，也不止停留在轻量串行队列修补。

## 1. 能力归类与风险规则

- **已有**：产品中有明确权威入口且 MCP 存在对应固定 Action 或工具；需要重新核实字段、revision、错误码和验收证据。
- **部分**：工具只实现主要场景、只读投影、或者需要已加载浏览器；不可称为完整控制。
- **缺口**：产品有明确能力而 MCP 未提供相应的语义 Action；先核实是否需要暴露。
- **不应暴露**：绕过产品权限的任意 SQL / shell / JS、原始用户数据文件读写、无条件删除、任意 HTTP method/path 调用、不透明授权等。

风险定义以 **实际效果** 为准：`READ` 是被动、有界读取（若可能网络/付费须标明 externalEffects）；`INTERACT` 仅允许有明确、可核对效果的交互/评估，不能把真实成本/状态副作用假装无害；`MUTATE` 为经原生权威保存的非破坏变更；`DESTRUCTIVE` 为不可逆或实体/数据删除，逐次审查。长期异步启动和接收回执是两个不同 action/operation，停止不等同于远端回滚。

## 2. 12 域能力目标矩阵

| 域 | 产品侧权威线索（main） | 独立 MCP 静态覆盖 | 第二轮目标分类 | 风险轮廓 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| Source / Git / Artifacts | 产品源码与 Git checkout；运行期日志/构建产物由对应来源拥有 | `atri_repo`、`atri_git`、`atri_artifact` 较完整 | 搜索分页一致性、诊断证据重用、工作树作用域安全；不替代客户端的 Git write/shell | READ；敏感路径过滤必须保持 | P2 |
| Runtime identity / Diagnostics | `src/endpoints/diagnostics.js`、`src/logging/runtime-identity.js`、Native scheduler | `atri_status`、`atri_diagnose_snapshot`、`atri_read(diagnostics.*)` 较完整 | 操作链追踪、分布式客户端任务引用、故障/跨重启结果核对 | READ/Control；日志可能敏感 | **P0 + P1** |
| Studio / Build / Frontend | `src/endpoints/native-studio.js`、`src/native/authoring/studio-service.js`、Resource Graph/Frontend | `build.project.*`、Source/Workspace、Validate/Preflight/Evaluate/Apply、Preview、Build、Simulation：主要流程存在 | 精确语义源操作与步骤编排；合同发现、Source Graph、评估/Review/Apply、Preview/UI 证据闭环，不创建第二套工程存储 | READ / INTERACT / MUTATE / DESTRUCTIVE | **P1（第三轮）** |
| Project Agent / Authoring tasks | `src/native/project-agent.js`、`src/endpoints/native-studio.js` 的 task create/tool/context/strategy/commit/takeover/resume/generation | Task GET/list/context；另有 `agent.run.start` 为不同 Orchestrator 单节点委托 | 为 Project Agent 建独立的任务/计划/草稿/Review/人工交接/提交 action；不得混同 delegated-node | READ / INTERACT / MUTATE；高风险人工 Review | **P1（第三轮）** |
| Session / Conversation / Save | `src/native/session-core.js`、`src/native/save-system.js`、`src/endpoints/native-{session,product,generation}.js` | Session/Timeline/History/Branch、Save/Load、chat.send/regenerate、generation.status/stop：部分较完整 | 持久结果核对、提交回执、分支/Save/长会话恢复、各阶段不可变 Snapshot | READ / INTERACT / MUTATE / DESTRUCTIVE | **P0 可靠性 + P1** |
| Memory Graph | `public/scripts/agents/memory/`、Native session-scoped 状态/检索 | memory.* READ 丰富、guarded write 依赖浏览器加载态 | 保留来源/图/branch guard；评估服务端稳态语义读写，无头能力与成本分层；不直接覆写底层数据库 | READ（检索可能付费）/ MUTATE / DESTRUCTIVE | **P1** |
| Goals / Evidence / Experience / Evolution | `src/endpoints/native-generation.js` 的 `goals`、`evidence`、`experience`、`evolution` 各类业务 handler | MCP 主要提供 orchestrator 运行观察；无完整原生行为矩阵 | 按来源/生命周期/预算区分 READ、模型付费评估、反馈写入、晋升/回滚、删除；优先观测 | READ / INTERACT（网络成本）/ MUTATE / DESTRUCTIVE | **P1** |
| Model / Prompt / Route / Retrieval | `src/native/model-prompt-runtime/`、`src/endpoints/native-generation.js` | Connection/Model/Route、Prompt controls、部分 preset/retrieval 读取与配置更新 | 完整 Preview/Evaluate、精确版本、Fallback、Provider 故障/费用证据、权限；不提供明文凭据 | READ（probe 可能付费）/ INTERACT / MUTATE | **P1** |
| Package / Library / Resource | `src/native/package-*.js`、`resource-bundle.js`、`src/endpoints/native-{studio,product}.js` | Work/Package list、Library 精确读/Graph、Build、预检、安装 review、受控删除 | 大型产物无损传输、依赖闭包、版本/权限审阅、资产晋升与回滚；复用 Product 权威 | READ / INTERACT / MUTATE / DESTRUCTIVE | **P0 容量 + P1** |
| Visual generation / Speech / Media | `src/native/illustration-*.js`、`speech-service.js`、`src/endpoints/native-generation.js` | 基本通用运行/Browser 观察，无对应完整语义控制面 | 图像请求/状态/历史/预算及语音任务连接；与正在讨论的独立生图企划保持边界，不抢先冻结媒体资产规格 | READ / INTERACT（付费）/ MUTATE / DESTRUCTIVE | P2 |
| Skills / Extensions / Host plugins | `src/endpoints/skills.js`、`native-extensions.js`、`src/native/plugin-platform.js` | authoring reference、原生 GET discovery、部分间接状态观察 | 明确技能与插件资源生命周期、权限/贡献/引用检查；产品内部插件与独立 `plugin` 工作空间不混同 | READ / MUTATE / DESTRUCTIVE | P2 |
| Browser / Frontend UX | `public/scripts/native/`、Frontend Host Bridge、Experience Epoch 和 Studio Preview UI | 独立 Playwright 浏览器、ARIA、截图/日志；交互只有 scroll | 实际 UI 回归、响应式、跨 epoch 证据；若开放交互必须语义化/受控且不绕过 Action ceiling；不能把“显示完成”当“正式提交” | READ / INTERACT，经同等审批 | **P1** |

## 3. P0 关键必修缺口（正式范围）

1. **控制通道可达性**：`src/server.js` 全局 queue 串行调用；`src/kernel.js` 单个 Executor busy。分 lane 不等于无约束并发，要求 status/cancel/diagnostic 不受长任务/审批阻塞；详见 P0 模块。
2. **任务与权威结果身份分离**：MCP invocation、Product operation、durable Session/Project revision/receipt 分别建身份映射；持久日志只保存有限的可恢复元数据，确认失败不得直接重发。
3. **可信审批与协议适配**：现有 2025-era form elicitation 不可直接推断新版 MRTR 或真 Codex/Claude 支持；做能力协商和真实客户端矩阵。
4. **大资产与响应大小矛盾**：`read-authority.js` 请求上限 1 MiB，`high-risk.js` Package handle 上限 16 MiB，`buildProject` 返回 base64 `.atria`；设计同源、有界、Hash 审核的受控传输，不放宽任意下载。
5. **重启/多客户端**：多个 stdio MCP 进程的内存锁相互独立；MCP 不可越过 Atria authority 的 revision/OCC/事务。任务完成、取消、unknown 需要可验证的来源与作用域。

## 4. P1 第三轮先讨论 Studio / Project Agent

**面向 AI 的 Studio 控制** 应坚持 `Studio Source -> pinned ProjectRevision -> Workspace.operations -> Inspect/Validate/Preview -> Review -> Commit`，不得在未授权时修改 Package 原件。严禁直接把 preview/evaluate 当永久写入。

**Project Agent** 应区分 `ProjectAgent Task`（持久项目任务、工作区/正式 Review/Commit/Resume）与 `Orchestrator delegated-node`（客户端选定节点与受限子工具集合）。可共享 ActionRegistry 发现/Receipt，但不合并生命周期、审批或 Task identity。

**第三轮已经批准 B**，双路径/独立 Review-Commit/恢复见 [`studio-project-agent.md`](studio-project-agent.md)。**第四轮已经批准 B**，Memory/Goals/Evidence/Experience/Evolution 的分域权限、跨域工作流、来源/预算/连锁自动触发/回滚的权威细则见 [`memory-goals-experience-evolution.md`](memory-goals-experience-evolution.md)；本矩阵仍只负责域优先级，精确 Action Schema 不在本表假设已经实现。第五轮转向 Model/Prompt/Runtime/Provider。

## 5. 验证要求（规划、未执行）

- 每个 action 标注：产品 API/语义权威、scope/owner、revision guard、请求/结果 schema、输出大小、风险/付费/网络效果、完成/撤销语义、对应测试级别。
- 变更前逐项对照实际 Product HEAD、现有 MCP ActionRegistry，不能将“有路由”当作“可用”。
- 不能泄露 Secret、用户持久化原始文件、未经授权的真机/浏览器数据。
- 真实测试用例按 P0/各域具体变更确定最小范围，记录实际运行结果，不将历史成功冒充本轮通过。
