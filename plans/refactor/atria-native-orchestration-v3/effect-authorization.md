# D6 — S2 Native Effect Authorization Gate：能力、审批与外部副作用（已冻结）

> 第六轮于 2026-10-15 选择 **S2**。跨模块决定：[decisions.md](decisions.md) D6。本模块是 **V3 工具执行及跨协议 Effect 许可的唯一详细设计入口**；具体 Tool / MCP / A2A / Skill / Secret / Business Commit 权威仍归各原生领域，而非新造统一超级管理员。D1–D5、HCM-01–08、T2 Host 单写入者和旧 Orchestrator 零兼容硬切仍生效。仅文档冻结，未实施或运行测试。

## 1. 执行链：发现、授权、批准、准入、派发与回执严格分离

`NodeAttempt 的 Tool/Skill/MCP/A2A proposal → 可信 Capability Descriptor → 原 Authority/Policy Ceiling 交集 → 实际 EffectRequest + Risk/Egress 检查 → Approval（需要时）→ 发出前再次重验 → Durable EffectIntent/预算准入 → 原 Native Port → EffectReceipt / 原 DomainCommitReceipt → 当前 audience 的 Result Consumer`

1. **Discovery** 仅告诉模型「可供查询的候选能力」，不是有效 tool grant：远端工具名称、JSON schema、description、annotations/hints、A2A card/skill metadata、Skill 指令等均有来源、版本、端点、trust domain，不能依靠它们自称只读/可信。
2. **Capability Grant** 由可信 owner、作品/Project/Session 域、PlanRevision 能力上限、原 Native Tool/MCP/A2A/Skill/Project policy、父子 delegation scope 的**交集**产生，交集不可为空、不能在 Handoff/GraphPatch 中被 LLM 扩大。
3. **EffectRequest** 使用**实际工具 ID/operation、参数、目标对象、来源/作用域、可执行结果与潜在衍生效果**独立分类和校验，名称上叫“read/preview/inspect”不保证不会发送、收费、reconcile 或持久写入。
4. **Approval** 需要时由真正可信的用户/作者/Project owner 的受限交互通道提供，绑定完整请求与风险；LLM、Tool 响应、Client boolean、Prompt“我已经同意”不能制造或扩充授权。
5. **Effect admission** 同时通过原 D5 预算/Send、D4 source/Disclosure/External Egress、D3 图/Attempt/Cancel/epoch 与本 D6 action permission；先将准入的 EffectIntent 耐久保存后才允许可收费/可能有副作用的发送。
6. **Execution / Result** 从原受限 Native Port 出发；Orchestration Receipt 只说明该 Effect 的已知状态和证据，正式 World/Session/Studio/Package/Memory/Asset 的最终成功仍以**原领域** DomainCommitReceipt / Version 为准。

Authorization Gate 是 Host **逻辑职责**；不新建万能 Tool 权限服务、Shadow Secret Store、World writer、模型发送器或第二 MCP Server。EffectIntent/Approval/Receipt 可以在 V3 RunLedger 保留*最小执行控制元数据*，不复制原业务真相、完整正文/Secret/资产内容。

## 2. Tool、Skill、MCP、A2A 与 Plugin：严格不同的信任边界

| 对象/入口 | 已确认的 Atria 现状或领域归属 | S2 对 V3 的强约束 |
| --- | --- | --- |
| Native 业务 Tool / Command | SessionCore、World/Command、Studio Project/Task、Library、Media/Resource 等是实际 mutation 领域 | 只使用各自有 scope/CAS/审阅/提交回执的语义 Port；不得映射成任意路径写入或 `set_state(path,value)` 之类宽权限后门 |
| Runtime Skill | `src/native/skill-invocation.js` 有版本化/有界指令与 Skill 文件读取 | **Skill 内容是程序化指导和低信任文本，不是业务权限、脚本运行许可或新的 Agent 授权主体**；读取、选用、安装、启用、执行各有精确权限及版本 |
| 内置 MCP Consumer | `main:src/native/mcp-service.js` 当前以固定 allowlist、原 SessionPublicWork/Display、Native Scheduler 消费外部 MCP 数据；工具名 allowlist 不能证明远程 Tool 无副作用 | 保持当前受限只读使用，不因接入 V3 隐式开放 arbitrary-write；未来若新增变更类 MCP tool，须逐 Action 明确 authority、外发/副作用、审批和恢复，不借“已连接”升级 |
| 内置 A2A Consumer | `main:src/native/a2a-service.js` 通过原 Session/RunControl 保存部分远端 task identity，重连按 get/status，不安全时不重发 SendMessage | 远程 Agent 只取得受限任务/公开 source，taskId/contextId 与未知状态来自原 Port；A2A 成功不是 World/Project 事实或全局批准 |
| 独立 `plugin:atria-mcp` | [MCP 补强企划](../../plugin/atria-mcp-strengthening/index.md) 属长期 `plugin` 工作空间，向 Codex/Claude Code 等外部客户端提供 Atria 受控操作；已有 Action Registry / Policy Ceiling / Approval Lease / MCP Journal 设计 | **不可把独立 MCP Server 变成 V3 内部主运行时/第二产品数据库**。外部 MCP Lease/Journal 只约束该客户端与一次 Action；V3 Host RunLedger 不取代它们，双方仅通过合法 Native 业务 API/operation/receipt refs 互通 |
| Browser Extension / Host Plugin / Package Plugin | 它们是执行代码的不同信任级，不能因为都名为 Plugin 就同权 | 浏览器扩展不是 Host 沙箱；Package 运行脚本与 Host 代码执行边界分别验证。没有实证沙箱/权限时不能把 arbitrary JS/shell/network 当普通 Tool/Skill 操作 |

当前 MCP Consumer 版本或可用 Method、独立 MCP Server SDK / client capability 与 A2A Protocol 都须根据**真实版本、双方协商、合法端点**单独验证。MCP 协议升级不等于为旧 Orchestrator 建兼容层，也不能将独立 plugin 的外部审批默认当作内置 Node Run 的授权。

## 3. 风险分级与最小化可信审批

S2 冻结以**动作的实际后果**分级，而不是由名字、HTTP method、remote annotations、JSON schema 或模型解释分类；以下是逻辑类别，精确 enum、默认 grant/profile 与 UI 由后续实现/体验阶段定稿。

| 风险面 | 典型行为 | 执行和审批原则 |
| --- | --- | --- |
| **R0 纯本地、无副作用、有界读取** | 当前获准的静态 Resource/Task/Source 精确只读 | 在已有可信最小权限和资源预算内可自动准入；若调用会网络、收费、write-on-read、reconcile 就**不能**仅因名称标 READ |
| **R1 External Read / Egress / Cost** | Web Search、将公开/私有证据发往远端搜索/MCP/A2A、可收费探测 | 除 Tool allowlist 外还需准确外发目标、Payload 的 D4 display/egress grant、用户/Project 已授权的服务/费用用途；缺许可则审阅/拒绝 |
| **R2 Mutable / Publish-sensitive** | 修改文件/Project、写外部任务、保存变更、发布受控草稿 | 绑定目标 + 参数/SourceRevision/CAS + 实际 user/author/Project 权限，按原 Domain Review/Apply/Policy 要求获取可信批准；宽泛模式授权不能覆盖未说明的目标变更 |
| **R3 Destructive / Host Code / Irreversible** | 删除大量资产、插件安装/启用、任意代码执行、重要外部发布/交易或不可回滚操作 | 默认无授予；只有实际领域明确支持、精确范围可审查、有可信显式批准及独立原生防线才准入；无可核验沙箱/权限/恢复能力则拒绝，不靠模型自信或“用户似乎同意”放行 |

- **审批与 grant 不是同一对象**：已有配置的持久 **Policy Ceiling** 只规定 *最多能做什么*；一次确认绑定 **谁、在哪个 Scope、哪个 Run/NodeAttempt/Effect、哪一项 Action、精确参数 Hash、预期影响/外发目标、预算 envelope、当前 Domain Revision/Boot/epoch、审批目的和有限期限/一次性 nonce**。默认不复用一个批准令牌给另一个节点、另一个用户或另一次变更。
- 预先明确的授权（如项目内受控的窄作用域常规修改）可以免去每次重复弹窗，但仍需满足原生 policy 和实际 scope/参数上限；**高危未覆盖动作**永远不能因为父 Agent 能写或 Planner 认为必须而放行。审批具体默认与平台交互细节留第八轮 UI/实施。
- 可信批准必须从有授权身份与实际交互保证的 Host/客户端通道取得：拒绝单独的 Browser `host.authorize` 标志、模型生成的 `confirm:true`、被篡改的表单结果、已失效 Lease 作为正式批准。审批请求需耐久可恢复/展示，控制通道在等待批准时保持可用且可取消；审批不长期占用写锁。
- 真正发出 Effect 前在原 authority 锁/CAS 下**重新检查审批输入/目标/来源/权限/预算**；修改后的参数、Revision、Session Branch、owner/Account、Server Boot/Experience epoch、Endpoint/Secret binding 或已过期审批，必须新评估/重审，不拿旧批准继续。
- 在能力不可判、人工审批不可用或真实客户端不支持可信反馈时，对相应有风险的 mutation **fail-closed**；可用的合法纯只读能力不因审批通道故障全部不可用。

## 4. Secret / Endpoint / Network / External Egress 最小权限

- SecretRef 永不当作可被 Agent 读取的文本。只有原 Native SecretPort 在受信调用边界解析实际 Secret；精确 `SecretRef→Connection/Endpoint(origin)/transport/owner/permission/用途` 绑定，端点更换、DNS/redirect、代理/gateway 路径变化必须重新审查，不能把原 token 悄然发往攻击者端点。
- HTTP/MCP/A2A 的目标至少受 allowed scheme/origin、重定向/SSRF/回环/内网/metadata target、TLS、Body size、response streaming/timeouts、协议握手/版本/能力协商及授权网络范围保护；无法确认合法目标/路径时拒绝，不能用任意 URL fetch 作为通用 Tool 后门。
- 数据外发许可区别于 **Context Read**。Narrator 或 Planner 内部可以阅读某条私有信息，不意味着可把它放进 MCP Tool args、A2A SendMessage、Web Search 或代码执行日志；D4 每个接收者 audience/source/disclosure 和此次服务 egress allowance 都必须单独检查。
- 付费远程发送同时通过 D5 预算与原 Provider/Protocol attempt；没有可信 usage/价格/上游 attempt evidence 则标 unknown/estimated，不在低风险标签下悄悄支付或声称零费用。
- Secret、原始私有 Context/Tool response、opaque reasoning、授权令牌、完整用户文件/截图/语音/图片不写入默认 RunProjection、MCP Journal、公开审计或 Approval 摘要；保留必要哈希/来源/脱敏预览并让授权的专用界面可核查完整动作。
- 审批中远端接收目标或数据授权改变时，旧批准不能覆盖新的 egress；先复核准确路由/参数，否则重新求批。

## 5. Prompt Injection、Tool Poisoning 与 Skill 指令提权的阻断点

- **低信任源**：模型文本、外部网页、搜索结果、MCP Tool Descriptor/Annotations、A2A agent card/response、Skill instruction/支持文件、Package/Plugin 文本、项目源码/Issue/第三方 Git 与用户引用文档等仅为数据或受限工作指导；不能覆盖系统、Plan、Capability Grant、Approval、Tool schema、OutputContract、Source/Display grant。
- Tool 描述可被隐藏地改写或新增高权限误导；discovery result 需固定端点/版本/工具/schema Hash，与可信 allowlist/Policy Ceiling 交叉校验；实际调用前重新验工具名称、输入字段/长度/路径、目标和外发数据。远端自报 `readOnlyHint`、`destructiveHint` 只能参考，不能取代 Host effect risk classification。
- 任何 Tool 结果进入 D4 的受限 ResultEnvelope，以外部/derived/unverified provenance 标记；输出自然语言指令不能作为新的 Node/system message、GraphPatch 权限或用户批准，也不能被 Agent 摘要“洗白”。
- 高风险代码工具、外部脚本、Host Plugin 与 Browser Extension 只有在真正具备平台支持的执行隔离、受控目录/网络、资源上限、准入与单独授权时才可使用；不声称 Windows、CachyOS Linux 与 Android Termux 有相同操作系统沙箱。无证据时禁用该运行路径。
- 编排 Eval/Judge/Review 可以提示可疑越界，却不能替代原生确定性的 tool permission、路径、Secret/Endpoint 或正式 DomainCommit 校验。

## 6. Durable EffectIntent / Receipt、未知远端结果与安全恢复

`EffectIntent` 在派发**前**通过 Host RunLedger 的持久 CAS/epoch/fencing 创建，引用原业务 Operation/Task ID、Action/Target、请求摘要、权限/审批检查身份、D5 reservation、Source/Revision/Context/egress proof；之后再进行真正 Native Effect Port 发送。

| 故障窗口 | 必须保留的行为 |
| --- | --- |
| 已申请但未批准/已拒绝/审批超时 | 不发生目标写入/远端外发；保持可诊断审批状态与拒绝原因，不能伪造 Effect success |
| Approval 已持久，但 Boot/Branch/Revision/Grant 变更 | 旧批准失效，重新认证/原 Domain guard 与必要人类批准；不能盲恢复执行 |
| EffectIntent 已落盘，确认未派发 | 重新核验全部 scope/预算/审批及参数后可安全派发同一合法意图 |
| 外部发送可能已发生，网络失败/响应丢失 | `unknown/reconciling`；若原 Port 有远端 TaskId/OperationId/状态接口先查询，以原业务 receipt 判定，**不得创建另一 EffectId 直接重发非幂等操作** |
| EffectReceipt 已持久/正式 DomainCommit 已完成 | 只复用已有 receipt/读取业务正式状态，不再执行相同副作用；原生 Session/Studio/Package/Memory/Media 真相不被编排替代 |
| A2A 长任务/外部 MCP 工具取消 | `cancel_requested` 不等于 remote rollback/refund；只有收到可靠的远端/业务确认才描述真正撤销，否则保留 unknown |
| Host/客户端重启、Save/Restore/Fork、旧 worker 迟到 | 从原权限、Run Ledger 与领域任务锚恢复并重新 guard；未知写入不自动 replay，子 Run/旧 epoch 不得写进新 Branch 或新 Project revision |

- **Host V3 RunLedger** 管理此 Run 的 graph/effect admission/approval request/Receipt 链接与可恢复 progress；**独立 MCP Plugin Journal** 只属于外部 MCP invocation、客户审批/租约与其最小关联元数据；**原 Native Domain** 管理业务任务、版本、费用、正式提交。三种身份应保持 cross-reference，不复写为一张互相争夺 authority 的数据表。
- 当前 `src/native/a2a-service.js` 具有限定的持久远程 Task 身份与重连能力；`src/native/mcp-service.js` 主要使用进程内 operations 投影。V3 **不得声称其现成支持全部 MCP Tool 的冷恢复或准确一次**，也不能为安全恢复把新旧编排双轨兼容重新带回。
- 外部系统没有可信 operation status/idempotency/reconcile 的情况下，明确停留在 `unknown/blocked/waiting_review`，由可信人工决定后续动作；不能许诺全世界第三方 Tool exactly-once。取消/超时与原实际费用按 D5 保守处理。
- 版本化 Schema、数据保留、物理审批存储、支持的协议版本与实际跨端恢复证据在第八/九轮工程计划及实施时冻结，不凭本轮描述宣称已存在。

## 7. 未来验收矩阵（未执行）

| 领域 | 必须覆盖的反例/真实边界 |
| --- | --- |
| Discovery / grant | 远端 Tool 改名/schema 漂移、伪造只读 annotation、父子/Handoff 提权、未授权 Resource/Skill 尝试使用、过期 PlanRevision |
| Authorization / Approval | 原 owner/author/project 权限收紧、无可信 UI、伪批准/重放/过期 Lease、不同 target/参数/版本、等待审批时取消与控制面可达 |
| Egress / Secrets | Private Actor/Narrator context 经 MCP/A2A/Web 外发、SecretRef 指向新恶意 Endpoint、redirect/SSRF/非 TLS、长敏感输入/返回与日志/回执泄露 |
| Injection / isolation | 恶意 Skill、Agent Card、Tool metadata、网页/Issue 指令提权、无沙箱代码执行、Host Plugin/Browser Extension 与 Package 权限混淆 |
| Effect/Receipt/Recovery | Write-ahead 后崩溃、收到远端结果前断线、外部未知写入、已有原 DomainCommit、A2A 有 task id/无 task id、MCP 冷重启、cancel 不撤销、不退款、旧 epoch/Branch 迟到 |
| Workflow/Cost | G2 图重规划/并行 Join、C2 隔离、F2 原预算、Step budget 耗尽不能绕过独立 Approval；无关只读不因此中止，Project Review 不自动获得 Commit 权限 |
| Client/Platforms | Windows/CachyOS Linux/Termux 的 Host 行为与权限一致性；真实 Browser/mobile 审批与恢复、MCP/A2A 客户端/协议协商/外部 Provider 能力分别给出可复核实测，不以 fixture 或截图冒称其他层通过 |

安全底线不随质量/Token/吞吐收益放宽；只在原授信路径对真实 Action 作针对性最小验证。当前没有修改 main 产品代码、没有执行真实 MCP/A2A 写调用或人工审批测试。

## 8. D7 下一轮接口（未冻结）

第七轮将讨论 RP Narrator、多角色 Cognition/ToM/Expression、Knowledge/Player Disclosure、玩家行动归属与反全知、Project Agent 的任务与正式 Review、Judge/Review 的质量评价以及 V3 原生创作体验。**本 D6 只是安全执行前置合同，不替第七轮冻结具体叙事编排、默认 Agent 数量、质量量表、角色自主权或 UI 交互**。
