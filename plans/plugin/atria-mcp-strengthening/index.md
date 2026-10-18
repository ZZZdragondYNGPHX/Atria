# Atria MCP 补强企划 — Plan Index

- **Task ID**：`plugin/atria-mcp-strengthening`
- **Primary Workspace**：`plugin`（实现位置：`plugin:atria-mcp/`）；设计文档位于 `docs`。
- 真人审批、其它平台与真实付费 Provider 等外部证据仍待验，实际边界见 [唯一 Record](../../../records/plugin/atria-mcp-strengthening.md)。前八轮冻结范围保持；第九轮由 2026-10-14 本次开工指令授权 E0 收口，并非此前单独选择，来源详见 [实施收口](implementation.md)。
- **创建日期**：2026-10-14。
- **审计时源码基线**：`main@7e1045ab836c22cafbc92c5de056ad701f56e723`、`plugin@ee99b2b3d1c65502a971495a6016ccb7c195bf6d`；第三轮提交前 `main@9241325a7290e613e0fdaaa1870409105c161c89`（比旧审计基线新增 9 commits，见 Studio 模块局部差异核查）。
- **既有历史基线**：[旧 MCP Capability Expansion Plan](../atria-mcp-capability-expansion/index.md) / [Implementation Record](../../../records/plugin/atria-mcp-capability-expansion.md)。这是另一项有独立记录的旧任务；

## 1. 定位与目标

把独立 `plugin:atria-mcp/` 补强为 **外部 AI 客户端面向 Atria 原生工程和运行时的可靠控制中心**。它向 Codex、Claude Code 等客户端暴露经审计的观察、诊断、Studio 作者工具、游戏运行时与 Agent 操作，并提供明确的身份/权限/并发/执行回执/恢复语义。

此定位不等于用 MCP 取代客户端自带的代码编辑、Git、终端和通用开发工作流，也不等于把 Atria 本体改造成一个 MCP Server。外部 MCP Server 与 `main:src/native/mcp-service.js` 中的 **内置 MCP 消费端** 是不同职责：后者目前是对外部 MCP 的受限只读消费，不得把两者的权限扩大视为同一需求。

## 2. 第一轮冻结：路线 C（分层完整补强）

1. **先可靠性，后能力扩张**：P0 优先解决统一串行队列的控制面阻塞、状态/取消可达性、并发隔离、审批有效性、未知远端结果与长任务恢复，且不为了吞吐量牺牲安全。
2. **再补齐原生语义能力**：逐域梳理产品真实 authoritative API 与 MCP registry 的差异；补 Studio/Project Agent、游戏/会话/存档、Memory/Goals/Experience/Evolution、模型路由、资源/Package、生成与多媒体、诊断等。逐个确认“已有、部分、缺口、不应暴露”，不是根据目录名推断功能。
3. 服务端已有稳定权威边界时优先服务端，不用页面注入脚本制造第二套权威。浏览器交互范围可重新讨论，但禁止以任意 JS/通用 click/fill 绕过语义权限。
4. 可改良形态，不默许弱化。
5. **长会话和持久化安全优先**：MCP 的临时执行回执不等同于产品写入结果；以产品原有 Session/Studio/RunControl/Store 为真值，不越过 Revision/CAS、不可变资源、Review/Apply、Save/History 的既有边界。写入后确认丢失不得自动重发。
6. **独立分支职责不变**：`plugin` 只存独立工具，`main` 只在核实必要缺失的产品权威接口时经常规任务开发补强，`docs` 保留 Plan/Record；禁止 main merge 到 plugin/docs；不读取或同步未获授权的 reference 分支。
7. **开发阶段可主动调整接口**：不为尚未发布的旧接口保留多余兼容层；
8. 不以其中一层代替另一层。未运行测试不得写“通过”。

**第一轮只冻结补强范围与治理边界；第二轮已冻结 P0 的目标架构与必要不变量**。并发度、持久化实现媒介、恢复保留期和具体 SDK API 使用仍按 [P0 模块](p0-reliability.md) 的待细化项设计、实测，不视为已经实现。

## 3. 模块路由与权威性

| 文件 | 内容范围 | 当前状态 |
| --- | --- | --- |
| [`audit-baseline.md`](audit-baseline.md) | 第一轮 main / plugin 核查范围、观察到的实现、P0/P1 候选缺口、证据限制 ||
| [`p0-reliability.md`](p0-reliability.md) || 第二轮已冻结方向，实施参数待细化 |
| [`capability-matrix.md`](capability-matrix.md) | **能力矩阵权威**：产品 Authority × MCP Registry × 风险 × 覆盖级别 × 候选优先级 | 第二轮已冻结规划分类；具体 action 合同逐域核实 |
| [`studio-project-agent.md`](studio-project-agent.md) | **第三轮权威**：Studio 直接路径、Project Agent Task、外部/内置模型分工、Review/Commit 和原生恢复 | 第三轮方案 B 已冻结方向，具体 Action schema 后续确定 |
| [`memory-goals-experience-evolution.md`](memory-goals-experience-evolution.md) | **第四轮权威**：Memory、Goals、Evidence、Experience、Evolution 的分域语义接口、跨域工作流、预算与来源/恢复/失效边界 | 第四轮方案 B 已冻结方向；精确 Action Schema 待实施核实 |
| [`model-prompt-runtime-provider.md`](model-prompt-runtime-provider.md) | **第五轮权威**：完整 Native Model/Prompt/Runtime/Provider Bridge、Secret/Endpoint 审查、版本化编辑、零副作用 Preview、付费执行与 Fallback/恢复 | 第五轮方案 B 已冻结方向；准确 Action schema/协议联测待实施 |
| [`session-save-generation-lifecycle.md`](session-save-generation-lifecycle.md) | **第六轮权威**：分层 Session、Save/Restore/Branch、旧 fork/retry 合同淘汰、自动存档、长会话、RunControl/Scheduler 回执与 GC | 第六轮方案 B 已冻结方向，具体 Action schema 待实施核实 |
| [`browser-ui-semantic-interaction.md`](browser-ui-semantic-interaction.md) || 第七轮 B 已冻结；UI Action schema/运行测试待实施 |
| [`package-library-media-skills-extensions.md`](package-library-media-skills-extensions.md) | **第八轮权威**：Package/Library/Resource Graph、统一 Binary Asset Lane、Visual/Mask/Gallery/Speech、Skill 版本、Browser Extensions/HostPlugins 权限、预算与恢复 | 第八轮 B 已冻结；|
| [`implementation.md`](implementation.md) | 当期契约差异、实施依赖、E0–E7 路由与来源 | 当前开工授权下收口 |
| [`security.md`](security.md) || E0 收口 |

单条详细规则仅写入一个权威模块。index 只管理全局冻结原则、依赖和讨论/实施路由，不复制域内设计；现有旧 Plan 仅作历史链接，不直接作为本轮新增范围的执行授权。

## 4. 讨论路由（不是实施暂停规则）

| 轮次 | 讨论对象 | 本轮前应读取 |
| --- | --- | --- |
| 第一轮（已冻结） | Atria 与 MCP 代码审计、方案 C | `index.md`、`audit-baseline.md` |
| 第二轮（已冻结） | 能力矩阵；方案 B| `capability-matrix.md`、`p0-reliability.md` |
| 第三轮（已冻结） | 方案 B：Studio 直接 Workspace + Project Agent Task；外部 AI 默认主导；原生模型显式委托；独立 Review/Commit | [`studio-project-agent.md`](studio-project-agent.md) |
| 第四轮（已冻结） | 方案 B：Memory / Goals / Evidence / Experience / Evolution 分域权威，受控跨域工作流，来源、预算、审批与安全恢复 | [`memory-goals-experience-evolution.md`](memory-goals-experience-evolution.md) |
| 第五轮（已冻结） | 方案 B：完整 Native Model/Prompt/Runtime/Provider Bridge、版本化资源、端点/Secret 审查、无副作用 Preview、付费执行及恢复 | [`model-prompt-runtime-provider.md`](model-prompt-runtime-provider.md) |
| 第六轮（已冻结） | 方案 B：完整 Session / Save / Timeline / Branch、旧 fork/retry Action 退役、长会话 Context、分层 Generation、停止/恢复、原生 GC | [`session-save-generation-lifecycle.md`](session-save-generation-lifecycle.md) |
| 第七轮（已冻结） || [`browser-ui-semantic-interaction.md`](browser-ui-semantic-interaction.md) |
| 第八轮（已冻结） | 方案 B：Package/Library/Media/Speech/Skills/Extensions 全域控制、Binary Lane、原生账本/权限与安全恢复 | [`package-library-media-skills-extensions.md`](package-library-media-skills-extensions.md) |
| **第九轮（本次授权收口）** || `index.md` + [`p0-reliability.md`](p0-reliability.md) + [`capability-matrix.md`](capability-matrix.md)；|
| 后续轮次 || 先 `index.md`，再读具体权威模块；仅在用户决策冻结后调整 |

实施依赖与必读模块见 [implementation.md](implementation.md) 的 E0–E7；本表保留讨论路由，不构成逐阶段暂停规则。

## 5. 第二轮已冻结的 P0 与优先顺序

- **第二轮选择方案 B**：分层调度 + 精确资源隔离 + 安全恢复 + MCP v2/2026-07-28 能力协商，详见 [`p0-reliability.md`](p0-reliability.md)。
- P1 继续：Studio/Project Agent、Session/Memory/Goals/Experience/Evolution、Model/Prompt/Runtime、Package/Library 与 UI 语义能力按矩阵推进。
- P2：深度图像/语音/技能扩展以及仓库性能/Discovery 迭代，仍须兼顾新接口不会退化 P0。
- 2026-07-28 协议的 MRTR 为新版核心能力，**Tasks 为独立扩展**，不可将 Tasks 可用性或客户端支持视为必然；SDK v2 迁移与启用新版协议是两个不同步骤。优先适配 2025 旧连接，2026 新连接只在协商确认后使用；

## 5.1 第三轮已冻结的 Studio / Project Agent

- **第三轮选 B：双路径、统一原生权威**，详见 [`studio-project-agent.md`](studio-project-agent.md)。简单编辑直接 Studio Workspace；复杂、长周期创作进入 Project Agent Task；最终统一通过 Native Studio/ChangeSet 权威。
- **外部 AI 默认主导**，不因具备 MCP 就重复调用 Atria Studio 模型；用户明确要求内置模型时才显式委托，并使用原生模型路由/预算和任务证据。
- **Review/Commit 两道不同授权**：任务内计划/提案/评估可在精确 envelope 内推进到 Review；
- **恢复只靠原生权威**：Product Project Agent Task、Studio ChangeSet/Git revision、Commit Receipt 作为真值；MCP Journal 只关联，不再持久化另一份业务任务。错失回复时先 reconcile，不盲重发。
- 原 `agent.run.start(delegated-node)` 属不同 Orchestrator Runtime；不要与 Project Agent 生命周期混淆。

## 5.2 第四轮已冻结的认知与学习边界

- **第四轮选择 B：分域权威 + 受控跨域工作流**，详见 [`memory-goals-experience-evolution.md`](memory-goals-experience-evolution.md)。Memory、Goals、Evidence、Experience、Evolution 保留不同的原生 Store/Scope/Sequence/Source/Publication 权威。
- 允许明确授权的 Goal → Evidence/Experience → Evolution 多阶段编排，但不创建“万能记忆库”和跨域假事务；每一步以原生持久对象/回执与实际 source validity 为准。
- Memory Graph 无头 Native Adapter 是拟实施能力；不得绕过 loaded source ticket/branch 与持久事务，也不能通过修改原始用户数据文件冒充完成。
- 一次反馈或目标 Wake 可能连锁触发自动学习/模型费用；MCP 必须预先披露 Policy/预算/连锁效果，审批未覆盖时拒绝或经产品正规专用接口抑制额外触发。
- 默认不由 MCP 开启 Evolution Auto，Human label/publish 不能由模型布尔值替代；正式发布/回滚依原生 Target Store 的 exact binding、Publication Intent、CAS 与安全恢复。
- `Evolution.inspect` 当前可能产生 reconcile 副作用；MCP 应分离纯观察和受控 reconcile，不能标注为无副作用 READ。
- 来源变更/Session 读档换支/删除/Retention 到期需沿已有依赖标失效、暂停或冲突；MCP Operation Journal 只存跨域步骤关联，不重复保存认知状态。

## 5.3 第五轮已冻结的 Native Model/Prompt/Runtime/Provider Bridge

- **第五轮选择 B：完整原生 Runtime Bridge**，详见 [`model-prompt-runtime-provider.md`](model-prompt-runtime-provider.md)。MCP 不另建模型网关、Provider SecretStore、Prompt 版本库或费用总账；只通过原生 Runtime Authority 完成全部语义能力。
- **版本化资源**：Connection/Model/Route 经精确 owner 与 fingerprint CAS；PromptModule/PromptProgram/GenerationProfile 的 Library Revision 不可变；
- **Endpoint 与 SecretRef 双重风险**：即使明文不外泄，也必须防止变更网络目标而继续复用旧 SecretRef 造成间接泄露；
- **无副作用 Preview 是目标必达契约**：不得发送 Provider、解析 Secret、占用付费预算或由 `prepareEvolutionProject → reconcile` 间接写持久态；当前 `/preview` 未证明纯 READ，不提前误分类。
- **显式付费执行**：仅用户明确要求时由 Native 执行模型；继续沿用 Role/Route/Context、Fallback disabled/automatic/confirm、原生 Compute/Ledger、Usage 观测与独立审批；成本无法实证时标 unknown。
- 未知远端结果不自动在 MCP 重发，Stop 不等于上游撤销或持久结果回滚。

## 5.4 第六轮已冻结的 Session / Save / Generation 生命周期

- **第六轮方案 B：完整分层会话生命周期**，详情以 [`session-save-generation-lifecycle.md`](session-save-generation-lifecycle.md) 为唯一权威。Session/immutable Revision/Timeline/Branch/SavePoint 是业务真值，RunControl 是持久执行/预算管控，NativeScheduler 是 Host 内存队列，MCP Journal 仅最小关联。
- **退役错误契约**：独立 MCP `mutations.js` 的 `chat.branch.fork`、`chat.retry.prepare`、`chat.regenerate/reenter`、`chat.restart.from/remove.from.active` 仍发送原 Native Router 未实现的 `fork/retry`；实现时移除该执行实现/过期宣告，仅映射真实 Save/Restore/Switch/正确原生 Reply authority，缺少语义等价接口则明确 unsupported。不得恢复旧 Swipe/Delete/Hide 对楼层的物理改写。
- **存档与长会话**：SavePoint 仅锚定已提交 HEAD；Restore 新建 Branch、保留历史；AutoSave 只在已提交 Turn 后由原生策略决定；Context 编译与 History Checkpoint 是输入/派生摘要，不替代无损 Timeline。
- **分层回执与停止**：区分 input commit、Scheduler admission、Provider send/stream、Usage settle 与 Native finalization/CommitReceipt。Stop 不撤销已提交结果；MCP/Host 重启后的 unknown 不自动重发。
- **纯 READ 与 GC**：`SessionCore.load`/RunControl status 的某些路径有持久协调行为，必须分离真正只读快照；历史 GC 仅由原生 Reachability、读租约、Mark/Quarantine/Sweep 和依赖保护处理。

## 5.5 第七轮已冻结的 Browser/UI 与截图证据链

- **第七轮选 B：Browser Evidence Lane + Semantic UI Lane**。
- Browser Evidence 专司 ARIA/截图/布局/诊断和有界观察；Semantic UI 仅允许登记的 Surface/Component/Control/Action。**通用 CSS/XPath/DOM click/fill/press/select/脚本与输入凭据不开放**，不能以页面行为绕过 Registry/Policy Ceiling。
- 任何真实 Session/Studio/Package/Memory/Media 持久操作都走原生 Semantic Authority、可信审批及 CAS/Receipt；Frontend Host Bridge `host.authorize` **不是** MCP 用户授权。
- 旧 last-observed 证据不替代当前性。
- 当前历史脚本只有部分自动化证据。

## 5.6 第八轮已冻结的 Package / Library / Media / Skills / Extensions

- **第八轮选 B：分域完整控制 + 统一安全 Binary Asset Lane**，见 [`package-library-media-skills-extensions.md`](package-library-media-skills-extensions.md)。第二轮 P0 的传输基础和可靠作业原则仍由 [`p0-reliability.md`](p0-reliability.md) 统一定义。
- Studio Build、Preflight、独立 Package Permission Review、Install 和正式 Version Receipt；不替代原生 PackageRepo/InstalledVersion。
- 共享字节流转能力，但 Package Install、Image Provider Send、Skill Import、Extension Enable 分别审批。
- **Media/Visual/Speech**：复用 VisualStore 持久 Image Job/Lease/Reservation/Remote Reconcile；Director Scan/Prepare 可能写状态/收费不可假称 READ；Mask/CAS、Gallery/Reference/GC 完整调用原生 authority；Speech 进程内 Task 不伪造跨重启恢复。
- **Skills 与运行代码不同信任级**：Skill 为不可信指令资料，可版本化管理但不带工具授权；Browser Extension 是页面内执行的非沙箱 JS，安装默认 disabled、启用需另审；HostPluginBoundary 不是服务端代码隔离沙箱，禁止给 MCP 任意 `import/eval/shell`；Package Runtime Plugin 不得获得 Host 权限。
- **预算/回执**：Image/Speech/Native Model/Package/Skill/Plugin 分别保留自己的预算/版本与恢复权威；MCP Journal 只做有限关联，不复制资产仓库。默认不开启自动生图、自动安装或第三方代码更新。

## 5.7 第九轮在本次开工授权下收口

- 两代 MCP 协议和 Client 实际 Capability：2025 Form、2026 MRTR、可选 Tasks；Codex/Claude Code 真实版本的审批、状态、取消、图片/二进制接入、跨平台变化与降级方式。
- Prompt Injection、SecretRef→恶意 Endpoint、第三方 Git/Plugin/Skill/Archive/URL、跨 Owner/Scope、stale Revision/Epoch、持久 Journal/unknown 与回执篡改等威胁的可复现阻断和恢复测试。
