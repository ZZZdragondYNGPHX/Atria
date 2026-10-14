# Atria MCP 补强 — P0 可靠性架构（第二轮冻结）

**Task ID** `plugin/atria-mcp-strengthening` · **方案 B 已批准** · 创建/冻结：2026-10-14 · 尚未实现。产品/工具审计基线与现有问题见 [audit-baseline.md](audit-baseline.md)，能力分期见 [capability-matrix.md](capability-matrix.md)。

## 1. 冻结目标与严格非目标

目标：保持既有 MCP ActionRegistry/Policy Ceiling/Lease/Receipt 语义，为长耗时浏览器、Agent、生成、安装流程提供 **始终可达的控制通道、受权威校验的并行能力、明确的操作状态与安全恢复**。支持 MCP SDK v2 迁移与新版协议的可协商能力，同时继续服务旧客户端。

**非目标**：从零构建另一个完整 Agent/workflow runtime、把 MCP Journal 当 Atria 产品数据库、绕过 Native 权威、自动重新发送不确定的外部写入、允许普通模型文本/布尔值充当用户批准、通过泛化 Browser/JS/HTTP/shell 绕过风险分级。原已冻结的 18 顶层工具原则暂时保留；若确需新增控制 action，应先判断放在 `atri_read/atri_interact` 的语义 namespace 或 MCP 扩展，不能未经讨论扩大可执行 surface。

## 2. 分层执行与资源隔离（冻结）

1. **Control Lane**：`status`、`cancel`、`diagnostic`、`reconcile`、`health` 之类查询/控制不通过会等待审批或生成结束的全局 FIFO；控制通道依然经过 owner、operation identity、access、redaction 和速率限制，不能作为写入旁门。控制请求本身应短时有界，可观察慢/超时而不被长期任务排队。取消是 **意图**，不保证已执行的产品写入撤销。
2. **Read Lane**：可并发但有界；区分纯本地只读、产品 HTTP read、可能 network/cost 的“名义 READ”。有外部费用的读取要具备可见成本声明与调用限额，不能隐式合并到零成本快照。
3. **Mutation Lane**：审批等待与产品写事务分离；对同一 `(owner, authority, scope/target)` 序列化冲突写操作，运行时仍在实际 Native endpoint/repo 进行 CAS/版本一致性校验。不同目标允许安全并发，但全局资源预算有上限。局部 MCP 锁不构成跨多个 MCP 进程的一致性证明。
4. **Browser Lane**：同一页导航、作用域变更、截图和交互有独立串行性/epoch；禁止两个任务在同一 page 上并发导航和将彼此的 UI 证据误归属。页面等待不能阻塞 Control Lane；长 UI 验证应有异步句柄。
5. **Execution admission**：资源、用户/目标、系统预算、队列上限和排队超时必须显式拒绝而非无限挂起；默认采用公平/有界调度。不要为“并发”删除当前 `RiskExecutor.#running` 而失去 guard。
6. **双重权威保障**：MCP 锁用于本进程执行编排；最终写入总由 Atria 的原生事务、revision/OCC、Server Boot guard、权限边界决定。多个 stdio MCP 实例无法凭内存全局互斥，不能共享未验证的 approval/lease。

**后续实施参数待细化**：各 lane 并发数、队列上限、CPU/IO 配额、优先级衰减、专用 worker 还是 in-process、是否存在独立 browser context。不得把尚未实测的数字固化为用户验收门槛。

## 3. Operation / Product authority / Receipt 三层身份（冻结）

- **MCP Invocation**：一个客户端请求及风险 action/规范化 input hash，短同步调用可以直接返回；耗时调用返回明确的 `operationId`，不得仅用 tool request id 表示持久作业。
- **Product Operation**：若 Atria 有正式 `operationId`、Project revision/Workspace/ChangeSet、Session revision/commit receipt、Save id、PackageVersion/asset hash 等，建立映射与来源；来源实体及 Native 状态是最终真值。
- **MCP Receipt**：仅报告 `action, target, inputFingerprint, approvedAuthority, before/after, timestamps, source, status` 等有界审计记录。不伪造产品已完成/已回滚；现有 Receipt Store 可继续保留短期响应缓存，不能单独承担当作业恢复来源。
- 对于短只读或无不确定性的纯本地计算，不强制持久作业化。长生成/浏览器等待/付费工作、两阶段变更与远端外部调用需要可查询生命周期与可取消入口。

### 3.1 状态与守恒规则

任务状态标准化为 `queued → awaiting_approval → ready → running → reconciling → completed|failed|cancelled|stale|unknown`（具体代码枚举可在实现中细化）；在批准之前任何副作用都不得发生。

- `completed`：有对应产品/拥有方权威的确认，不以收到 HTTP 202 或本地脚本返回值替代正式业务完成。
- `failed`：确知未提交或权威明确拒绝；“连接失败”不自动构成失败。
- `cancelled`：本地调度停止或权威确认取消；若已 dispatch 且远端状态未知必须另行标 `unknown` 或 `cancel_requested/unknown`，不宣称 rollback。
- `stale`：原 scope/version/boot/epoch 不再成立，旧审批不能重新套用。
- `unknown`：写入可能发生而本地无可靠结果；不得自动重放任何有实际副作用的动作。
- 对同一 operation 的多次 status/read 不得引发新的 side effect；在超时、关闭、重启后不能把不确定结果升级为“未执行”。

## 4. 最小持久化 Journal 与恢复（冻结）

采用 **轻量、隐私最小化的 MCP Operation Journal**，不创建第二套 Game/Project/Session 事实数据库。内容最多包含以下经逐字段允许的类型：

- `operationId, actionId, risk, serverBootId, clientInstanceId, mcpInstanceId`、归属 scope/target 的不可敏感 ID、规范化请求摘要/hash、审批审核摘要、作业提交阶段及时间；
- 已知的产品 `operationId/revisionId/commitId/receiptId/previewId/saveId`、外部请求是否已 dispatch、权威响应摘要/status、最近一次核对时间、持久化版本；
- 恢复提示和具体权威查询步骤；不保存 Secret/cookie/session token、完整 Prompt/聊天正文、图像与音频、完整响应正文、私人文件内容。

Journal 必须有原子更新、意外退出不损坏已确认记录、owner 隔离、权限保护与有界 GC；存储目录位于独立 MCP 私有 state 路径，不直接放入产品的 user dataRoot，更不写回产品 Git 版本目录。跨实例访问必须采用可验证的锁/事务或每实例隔离的 ownership；**不同 MCP 客户端产生的执行凭证/Lease 不可互认**。

恢复路径：

1. MCP 重新启动加载 Journal，只恢复 **身份/历史/待核对** 状态，不能自动重放 request。
2. 首先重新认证 product owner 和新的 `serverBootId`，比较持久 target 与权威 Revision/History/Receipt。
3. 对有 Product operation/status 入口的作业，只使用对应权威 read/reconcile；无法核实时保持 `unknown` 并展示下一步只读排查建议。
4. 对无原生 durable-run 能力的任务，MCP 重启不表示恢复计算本身。需先证明目标产品存在安全、权限隔离的恢复能力，才能开放继续运行；否则只允许观察，恢复决策重新审批。
5. 恢复前必须拒绝过期、不同作用域、不同用户、不同 checkout/origin/runtime 和变化的批准绑定；不能用旧 lease 自动执行或授权。
6. 对长期 `unknown`，不得默默从 Journal 删除并伪装成功；提供明显的历史清理/保留期策略，清理与执行恢复应当独立。

具体 WAL/SQLite 或原子文件落盘技术、record TTL、跨实例锁键的编码、可配置私有路径，作为实现期受控工程参数，保留后续按证据选择空间；不允许改变以上恢复语义。

## 5. 授权与成本（冻结）

- 继续精确 ActionRegistry、四风险级、默认只读、Policy Ceiling、用户可信批准、短期 Lease、双重 guard、Receipt 与不确定结果处理。未配置 Policy Ceiling 或客户端不支持可信批准时，保持读权限内的合法操作，写入 **fail-closed**。
- 对长 Agent/批处理：由经审核的确切计划 envelope 限定 action、目标、最大次数、可见的 provider/network/cost 影响、token/工作预算与有效期；子步骤必须落在审批 envelope 与产品权限交集中，逐项重新检查原生 authority。
- 审批前的 guard/fingerprint 与执行前重检必须涵盖 owner/scope、Revision、Server Boot、Experience Epoch/Preview identity（涉及相应范围时）。审批等待中不持有导致 Control Lane 挂起的锁。
- 单独考虑风险边界：无付费/无写入的纯本地分析可以不重复批准；真实成本和不可逆变更不可因为“被 Agent 包含”自动隐去。原先 Legacy form elicitation 不能直接转化成 2026 新版可信审批，不允许模型自行制造签名。
- 非持久 Lease 保持实例独占；持久 Journal 仅保存审批发生过的摘要，不等于可恢复的授权。任务跨重启继续执行必须重新核验/重新授权。

## 6. MCP v2 / 2026-07-28 协议方向（冻结）

现有 `plugin:atria-mcp/package.json` 使用 `@modelcontextprotocol/sdk@1.30.1`；规划升级 **TypeScript SDK v2 stable 分拆包**，但明确区分两件事：A) **v1 → v2 SDK 迁移**，B) **在 v2 SDK 上选择并协商 2026-07-28 协议**。不能认为装了 v2 就自动使用新版 wire 协议。2026-10-14 官方发布线的 v2 release 为 2.3.x（最新发布页 2026-10-05 v2.3.1，具体锁版在实施时复核）。

- 同一 MCP 逻辑必须兼容已部署的 **2025-11-25** 连接与可协商的 **2026-07-28**。切换以客户端协议/能力协商结果为准，不根据 User-Agent、客户端品牌或声明“支持 v2”推断。
- 2026-07-28 使用无状态 Core 与 Multi Round-Trip Requests（MRTR）；可信审批通过 `resultType: input_required` 和客户端 `inputResponses` 往返。必须强校验 sealed/signed `requestState`、本次 input/target/boot/有效期/nonce，检查拒绝、取消、重放、不同客户端/实例窜用。该 `requestState` 为传回的不可信字符串，不能直接信任。
- 2025 连接继续使用经过验证的 form elicitation，v2 可通过官方 legacy shim 承载两套 handler（是否选择 shim 以实现期真实测试为准），审批语义必须一致；若客户端不支持任何可信渠道，不得退回 `confirm=true`。
- **Tasks 不属于 2026-07-28 核心必备能力**：2025-era experimental Tasks wire 在 SDK v2 中已废弃；新版为可协商的 `io.modelcontextprotocol/tasks` 扩展。只有客户端与稳定扩展实现同时支持时才暴露 tasks/get/update/cancel 等协议级 Task；未协商时仍以固定 ActionRegistry 内的语义 `operationId` + status/cancel/reconcile 提供等价可靠的观察/控制，不假装扩展已协商。
- `main` 的 **内置 MCP Consumer** 与外部 Server 独立升级，不因本企划的 SDK 迁移改变 Native Consumer 的固定 2025-11-25 协议。若以后需联动，必须单独审查其 ReadOnly、budget、allowlist、SSE 与 cancellation invariants。
- `stdio` 保持基线传输；不默认开启 HTTP 暴露服务。是否提供额外 HTTP transport 需独立网络安全评估。

参考源（写入方案以便实施阶段重新确认）：

- 官方 2026 规范公告：https://blog.modelcontextprotocol.io/posts/2026-07-28/
- TypeScript SDK 升级：https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/upgrade-to-v2.md
- 新协议/跨时代适配：https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md
- 最新 SDK 发布核实：https://github.com/modelcontextprotocol/typescript-sdk/releases
- Tasks 扩展（协议独立于 Core）：https://tasks.extensions.modelcontextprotocol.io/specification/draft/tasks

## 7. 大型 Package / 响应容量可靠性（冻结）

目前固定 Authority HTTP 客户端响应上限 **1 MiB**，而 `PackageArtifacts` 可保留 **16 MiB** 包体；正式 `Studio.buildProject` 返回 base64 `.atria` 数据，导致原始压缩包接近 750 KiB 时 JSON 响应即可逼近 1 MiB 上限。此容量裂缝纳入 **P0**，不只是 P2 性能优化。

实施方向：采用有界同源资产传输 + 完整性哈希校验 + 来源/owner/Project/Version/expiry 绑定的中间句柄。优先评估专用产品 artifact read/stream authority、临时 file handle 或分块读取，**不开放任意 URL/目录/path 下载**。传输中不经大段 LLM 文本/Receipt 复制 raw bytes；校验整个 archive 哈希后方可进入 Preflight → Review → Install。分块错误/网络断开不确定时不能安装部分 archive。所有限额以实际 Atria 压缩包场景测试，不简单把全局 1 MiB 上限盲目调到 16 MiB。

## 8. P0 最小验收原则（待实际执行）

| 验收层 | 必须实证的行为 | 禁止的误判 |
| --- | --- | --- |
| 并发隔离 | 启动一个未结束的长任务或挂起审批，另一个客户端工具请求仍可查询、取消/诊断；不依赖长请求完成才出结果 | “调用已排队”当成“状态可查询” |
| 同目标写入 / 多进程 | 同 Session/Project 的竞态按原生 OCC 拒绝/序列化；不同目标可有界并行；两份 stdio 进程不会跨权威提交冲突 | 只有 MCP 内存锁即视为全局锁 |
| 异常恢复 / 重启 | 注入断网、断电模拟、MCP restart、Server boot 改变、HTTP 响应丢失；查询原生业务结果/回执，unknown 不自动重发 | HTTP timeout/202 直接判业务成功或失败 |
| 可信审批 | 旧表单、新版 MRTR 分别测试允许/拒绝/超时/重放/跨 scope、nonce/requestState tampering、过期 Lease、成本 envelope 越界；无可信渠道写入拒绝 | 模型 bool/伪造 inputResponses 算人工批准 |
| 客户端兼容 | SDK harness + 真实 Codex/Claude Code（各自软件版本与实际协商能力）；分别标识 2025/2026 通道以及 Tasks extension 是否启用 | SDK fixture 成功冒充人工审批 UI 通过 |
| 容量/资源完整性 | 小于与大于 1 MiB 的 Studio/Package 传输，hash、权限、preflight、断块/过期句柄、Review/Install 绑定 | 只比较文件名、局部数据或输出 truncated JSON |
| 身份/私密数据 | 当前 Product Source/Server/Browser/Experience/Preview 的逐级独立身份校验；日志/回执/journal 无 Secret | Source EXACT 自动证明 UI/产品提交已验收 |

**验收数据只在执行时产生**。该表是质量行为要求，未预设任意非产品安全规格的固定吞吐/胜场/模型次数门槛；按仓库 Governance 选最小相关验证。人类交互 UX 只能由真实客户端与用户操作观察证明，纯自动模拟不得冒充人工同意。

## 9. 实施次序与尚需细化

建议按照 **P0-A 控制通道和有界调度 → P0-B 操作回执/Journal 与权威 reconcile → P0-C SDK v2/2026 协商和可信审批 → P0-D 大资产传输/多客户端验收** 分为工程子块；依赖交叉时可调整，只要保留冻结的最终性质。允许未来在 P1 域实现前完成核心 P0 基础，不能为了临时“加工具”先绕过审批或资源身份。

**实施细节尚待证实/决定**：Lane 默认并发数与队列优先级、具体 Journal 引擎/GC 保留期、跨进程锁/幂等键格式、是否启用 Tasks 扩展、SDK 固定小版本与真实客户端支持、Asset 传输 API 形状、Worker 隔离方式。若实测与该设计目标冲突，更新同一 Plan 模块解释原因后再实现，不另建并行权威方案。

### 当前实施参数（2026-10-14）

Control/Read/Mutation/Browser 默认并发为 8/4/4/1，队列按 lane 有界，排队上限 30 秒；审批在资源锁外等待，正式执行在目标锁内重核。原生 OCC/事务仍处理跨 MCP 进程竞态，MCP 锁不冒充产品全局锁。

Journal 使用私有目录的原子 JSON 元数据，Windows ACL 或 Unix 0700/0600；拒绝父路径 symlink/junction、源码与产品数据Root。已确认结束记录七天后可回收，unknown 不自动删除或重放；每 owner 最多 1,000 条记录、128 个保留实例目录，超限 fail-closed。活进程标记只用于保守阻止 GC，不证明原生业务正在运行。操作正文、Secret、Lease、审批 continuation 和资产字节不进入 Journal。

SDK server/client/core 精确 2.3.1；实际 wire 测试覆盖两代 stdio。Tasks 扩展保持未宣告，以固定 operation Actions 提供状态与取消；真实客户端人类审批、平台支持必须另有证据。Binary Lane 固定用途与元数据/分块端口取代扩大普通 JSON 响应上限。
