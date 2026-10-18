# D6 — S2 Native Effect Authorization Gate：能力、审批与外部副作用（已冻结）

> 第六轮于 2026-10-15 选择 **S2**。跨模块决定：[decisions.md](decisions.md) D6。本模块是 **V3 工具执行及跨协议 Effect 许可的唯一详细设计入口**；具体 Tool / MCP / A2A / Skill / Secret / Business Commit 权威仍归各原生领域，而非新造统一超级管理员。D1–D5、HCM-01–08、T2 Host 单写入者和旧 Orchestrator 零兼容硬切仍生效。仅文档冻结，未实施或运行测试。

## 1. 执行链：发现、授权、批准、准入、派发与回执严格分离

1. **Discovery** 仅告诉模型「可供查询的候选能力」，不是有效 tool grant：远端工具名称、JSON schema、description、annotations/hints、A2A card/skill metadata、Skill 指令等均有来源、版本、端点、trust domain，不能依靠它们自称只读/可信。
2. **Capability Grant** 由可信 owner、作品/Project/Session 域、PlanRevision 能力上限、原 Native Tool/MCP/A2A/Skill/Project policy、父子 delegation scope 的**交集**产生，交集不可为空、不能在 Handoff/GraphPatch 中被 LLM 扩大。
4. **Approval** 需要时由真正可信的用户/作者/Project owner 的受限交互通道提供，绑定完整请求与风险；LLM、Tool 响应、Client boolean、Prompt“我已经同意”不能制造或扩充授权。
5. **Effect admission** 同时通过原 D5 预算/Send、D4 source/Disclosure/External Egress、D3 图/Attempt/Cancel/epoch 与本 D6 action permission；先将准入的 EffectIntent 耐久保存后才允许可收费/可能有副作用的发送。
6. **Execution / Result** 从原受限 Native Port 出发；Orchestration Receipt 只说明该 Effect 的已知状态和证据，正式 World/Session/Studio/Package/Memory/Asset 的最终成功仍以**原领域** DomainCommitReceipt / Version 为准。

Authorization Gate 是 Host **逻辑职责**；不新建万能 Tool 权限服务、Shadow Secret Store、World writer、模型发送器或第二 MCP Server。EffectIntent/Approval/Receipt 可以在 V3 RunLedger 保留*最小执行控制元数据*，不复制原业务真相、完整正文/Secret/资产内容。

## 3. 风险分级与最小化可信审批

S2 冻结以**动作的实际后果**分级，而不是由名字、HTTP method、remote annotations、JSON schema 或模型解释分类；以下是逻辑类别，精确 enum、默认 grant/profile 与 UI 由后续实现/体验阶段定稿。

| 风险面 | 典型行为 | 执行和审批原则 |
| --- | --- | --- |
| **R0 纯本地、无副作用、有界读取** | 当前获准的静态 Resource/Task/Source 精确只读 | 在已有可信最小权限和资源预算内可自动准入；若调用会网络、收费、write-on-read、reconcile 就**不能**仅因名称标 READ |
| **R1 External Read / Egress / Cost** | Web Search、将公开/私有证据发往远端搜索/MCP/A2A、可收费探测 | 除 Tool allowlist 外还需准确外发目标、Payload 的 D4 display/egress grant、用户/Project 已授权的服务/费用用途；缺许可则审阅/拒绝 |
| **R2 Mutable / Publish-sensitive** | 修改文件/Project、写外部任务、保存变更、发布受控草稿 | 绑定目标 + 参数/SourceRevision/CAS + 实际 user/author/Project 权限，按原 Domain Review/Apply/Policy 要求获取可信批准；宽泛模式授权不能覆盖未说明的目标变更 |
| **R3 Destructive / Host Code / Irreversible** | 删除大量资产、插件安装/启用、任意代码执行、重要外部发布/交易或不可回滚操作 | 默认无授予；只有实际领域明确支持、精确范围可审查、有可信显式批准及独立原生防线才准入；|

- **审批与 grant 不是同一对象**：已有配置的持久 **Policy Ceiling** 只规定 *最多能做什么*；默认不复用一个批准令牌给另一个节点、另一个用户或另一次变更。
- 预先明确的授权（如项目内受控的窄作用域常规修改）可以免去每次重复弹窗，但仍需满足原生 policy 和实际 scope/参数上限；**高危未覆盖动作**永远不能因为父 Agent 能写或 Planner 认为必须而放行。审批具体默认与平台交互细节留第八轮 UI/实施。
- 可信批准必须从有授权身份与实际交互保证的 Host/客户端通道取得：拒绝单独的 Browser `host.authorize` 标志、模型生成的 `confirm:true`、被篡改的表单结果、已失效 Lease 作为正式批准。审批请求需耐久可恢复/展示，控制通道在等待批准时保持可用且可取消；审批不长期占用写锁。
- 修改后的参数、Revision、Session Branch、owner/Account、Server Boot/Experience epoch、Endpoint/Secret binding 或已过期审批，必须新评估/重审，不拿旧批准继续。
- 可用的合法纯只读能力不因审批通道故障全部不可用。

## 4. Secret / Endpoint / Network / External Egress 最小权限

- SecretRef 永不当作可被 Agent 读取的文本。只有原 Native SecretPort 在受信调用边界解析实际 Secret；精确 `SecretRef→Connection/Endpoint(origin)/transport/owner/permission/用途` 绑定，端点更换、DNS/redirect、代理/gateway 路径变化必须重新审查，不能把原 token 悄然发往攻击者端点。
- HTTP/MCP/A2A 的目标至少受 allowed scheme/origin、重定向/SSRF/回环/内网/metadata target、TLS、Body size、response streaming/timeouts、协议握手/版本/能力协商及授权网络范围保护；无法确认合法目标/路径时拒绝，不能用任意 URL fetch 作为通用 Tool 后门。
- 数据外发许可区别于 **Context Read**。Narrator 或 Planner 内部可以阅读某条私有信息，不意味着可把它放进 MCP Tool args、A2A SendMessage、Web Search 或代码执行日志；
- 付费远程发送同时通过 D5 预算与原 Provider/Protocol attempt；没有可信 usage/价格/上游 attempt evidence 则标 unknown/estimated，不在低风险标签下悄悄支付或声称零费用。
- Secret、原始私有 Context/Tool response、opaque reasoning、授权令牌、完整用户文件/截图/语音/图片不写入默认 RunProjection、MCP Journal、公开审计或 Approval 摘要；
- 审批中远端接收目标或数据授权改变时，旧批准不能覆盖新的 egress；

## 5. Prompt Injection、Tool Poisoning 与 Skill 指令提权的阻断点

- **低信任源**：模型文本、外部网页、搜索结果、MCP Tool Descriptor/Annotations、A2A agent card/response、Skill instruction/支持文件、Package/Plugin 文本、项目源码/Issue/第三方 Git 与用户引用文档等仅为数据或受限工作指导；不能覆盖系统、Plan、Capability Grant、Approval、Tool schema、OutputContract、Source/Display grant。
- Tool 描述可被隐藏地改写或新增高权限误导；实际调用前重新验工具名称、输入字段/长度/路径、目标和外发数据。远端自报 `readOnlyHint`、`destructiveHint` 只能参考，不能取代 Host effect risk classification。
- 输出自然语言指令不能作为新的 Node/system message、GraphPatch 权限或用户批准，也不能被 Agent 摘要“洗白”。
- 高风险代码工具、外部脚本、Host Plugin 与 Browser Extension 只有在真正具备平台支持的执行隔离、受控目录/网络、资源上限、准入与单独授权时才可使用；不声称 Windows、CachyOS Linux 与 Android Termux 有相同操作系统沙箱。无证据时禁用该运行路径。

## 6. Durable EffectIntent / Receipt、未知远端结果与安全恢复

之后再进行真正 Native Effect Port 发送。

| 故障窗口 | 必须保留的行为 |
| --- | --- |
| 已申请但未批准/已拒绝/审批超时 | 不发生目标写入/远端外发；保持可诊断审批状态与拒绝原因，不能伪造 Effect success |
| Approval 已持久，但 Boot/Branch/Revision/Grant 变更 |不能盲恢复执行|
| 外部发送可能已发生，网络失败/响应丢失 | `unknown/reconciling`；若原 Port 有远端 TaskId/OperationId/状态接口先查询，以原业务 receipt 判定，**不得创建另一 EffectId 直接重发非幂等操作** |
| EffectReceipt 已持久/正式 DomainCommit 已完成 | 只复用已有 receipt/读取业务正式状态，不再执行相同副作用；原生 Session/Studio/Package/Memory/Media 真相不被编排替代 |
| A2A 长任务/外部 MCP 工具取消 | `cancel_requested` 不等于 remote rollback/refund；只有收到可靠的远端/业务确认才描述真正撤销，否则保留 unknown |
| Host/客户端重启、Save/Restore/Fork、旧 worker 迟到 |未知写入不自动 replay，子 Run/旧 epoch 不得写进新 Branch 或新 Project revision|

- **Host V3 RunLedger** 管理此 Run 的 graph/effect admission/approval request/Receipt 链接与可恢复 progress；**独立 MCP Plugin Journal** 只属于外部 MCP invocation、客户审批/租约与其最小关联元数据；**原 Native Domain** 管理业务任务、版本、费用、正式提交。三种身份应保持 cross-reference，不复写为一张互相争夺 authority 的数据表。
- 当前 `src/native/a2a-service.js` 具有限定的持久远程 Task 身份与重连能力；`src/native/mcp-service.js` 主要使用进程内 operations 投影。V3 **不得声称其现成支持全部 MCP Tool 的冷恢复或准确一次**，也不能为安全恢复把新旧编排双轨兼容重新带回。
- 外部系统没有可信 operation status/idempotency/reconcile 的情况下，明确停留在 `unknown/blocked/waiting_review`，由可信人工决定后续动作；不能许诺全世界第三方 Tool exactly-once。取消/超时与原实际费用按 D5 保守处理。
- 版本化 Schema、数据保留、物理审批存储、支持的协议版本与实际跨端恢复证据在第八/九轮工程计划及实施时冻结，不凭本轮描述宣称已存在。

## 8. D7 下一轮接口（未冻结）

第七轮将讨论 RP Narrator、多角色 Cognition/ToM/Expression、Knowledge/Player Disclosure、玩家行动归属与反全知、Project Agent 的任务与正式 Review、Judge/Review 的质量评价以及 V3 原生创作体验。**本 D6 只是安全执行前置合同，不替第七轮冻结具体叙事编排、默认 Agent 数量、质量量表、角色自主权或 UI 交互**。
