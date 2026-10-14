# Atria MCP 补强企划 — Plan Index

- **Task ID**：`plugin/atria-mcp-strengthening`
- **Primary Workspace**：`plugin`（实现位置：`plugin:atria-mcp/`）；设计文档位于 `docs`。
- **状态**：讨论中；第一轮 C、第二轮 B、第三轮 B 已冻结。第四轮 Memory / Goals / Experience / Evolution 深化讨论中。**尚未进入实现阶段**。
- **创建日期**：2026-10-14。
- **审计时源码基线**：`main@7e1045ab836c22cafbc92c5de056ad701f56e723`、`plugin@ee99b2b3d1c65502a971495a6016ccb7c195bf6d`；第三轮提交前 `main@9241325a7290e613e0fdaaa1870409105c161c89`（比旧审计基线新增 9 commits，见 Studio 模块局部差异核查）。每轮执行/实现以当时真实 HEAD 为准，不把静态审计称为实际验收。
- **既有历史基线**：[旧 MCP Capability Expansion Plan](../atria-mcp-capability-expansion/index.md) / [Implementation Record](../../../records/plugin/atria-mcp-capability-expansion.md)。这是另一项有独立记录的旧任务；旧 Phase 6 未闭合的验收事项继续作为未验证证据，不在本企划中伪称完成，也不重复搬迁其历史文本。

## 1. 定位与目标

把独立 `plugin:atria-mcp/` 补强为 **外部 AI 客户端面向 Atria 原生工程和运行时的可靠控制中心**。它向 Codex、Claude Code 等客户端暴露经审计的观察、诊断、Studio 作者工具、游戏运行时与 Agent 操作，并提供明确的身份/权限/并发/执行回执/恢复语义。

此定位不等于用 MCP 取代客户端自带的代码编辑、Git、终端和通用开发工作流，也不等于把 Atria 本体改造成一个 MCP Server。外部 MCP Server 与 `main:src/native/mcp-service.js` 中的 **内置 MCP 消费端** 是不同职责：后者目前是对外部 MCP 的受限只读消费，不得把两者的权限扩大视为同一需求。

## 2. 第一轮冻结：路线 C（分层完整补强）

1. **先可靠性，后能力扩张**：P0 优先解决统一串行队列的控制面阻塞、状态/取消可达性、并发隔离、审批有效性、未知远端结果与长任务恢复，且不为了吞吐量牺牲安全。
2. **再补齐原生语义能力**：逐域梳理产品真实 authoritative API 与 MCP registry 的差异；补 Studio/Project Agent、游戏/会话/存档、Memory/Goals/Experience/Evolution、模型路由、资源/Package、生成与多媒体、诊断等。逐个确认“已有、部分、缺口、不应暴露”，不是根据目录名推断功能。
3. **浏览器只做其擅长的事**：真实 UI/体验证据、Preview、可视回归；服务端已有稳定权威边界时优先服务端，不用页面注入脚本制造第二套权威。浏览器交互范围可重新讨论，但禁止以任意 JS/通用 click/fill 绕过语义权限。
4. **保留核心权限骨架**：Registry 的精确 action/schema/authority，READ/INTERACT/MUTATE/DESTRUCTIVE 分级，Policy Ceiling、可信人工审批、受限 Lease、双重 guard、Receipt、Secret 保护、不可验证/未知结果不伪装成功。可改良形态，不默许弱化。
5. **长会话和持久化安全优先**：MCP 的临时执行回执不等同于产品写入结果；以产品原有 Session/Studio/RunControl/Store 为真值，不越过 Revision/CAS、不可变资源、Review/Apply、Save/History 的既有边界。写入后确认丢失不得自动重发。
6. **独立分支职责不变**：`plugin` 只存独立工具，`main` 只在核实必要缺失的产品权威接口时经常规任务开发补强，`docs` 保留 Plan/Record；禁止 main merge 到 plugin/docs；不读取或同步未获授权的 reference 分支。
7. **开发阶段可主动调整接口**：不为尚未发布的旧接口保留多余兼容层；但 breaking changes 必须在方案冻结后附客户端/测试迁移依据，不能造成隐性权限退化。
8. **证据与验收分层**：静态源码审计、合同/单元测试、真实产品联测、浏览器/人机交互及真实客户端验证分别记录；不以其中一层代替另一层。未运行测试不得写“通过”。

**第一轮只冻结补强范围与治理边界；第二轮已冻结 P0 的目标架构与必要不变量**。并发度、持久化实现媒介、恢复保留期和具体 SDK API 使用仍按 [P0 模块](p0-reliability.md) 的待细化项设计、实测，不视为已经实现。

## 3. 模块路由与权威性

| 文件 | 内容范围 | 当前状态 |
| --- | --- | --- |
| [`audit-baseline.md`](audit-baseline.md) | 第一轮 main / plugin 核查范围、观察到的实现、P0/P1 候选缺口、证据限制 | 已记录，随代码 HEAD 重新验证 |
| [`p0-reliability.md`](p0-reliability.md) | **P0 权威**：四类通道、调度、任务/回执状态与安全恢复、MCP v2 协商、P0 验收 | 第二轮已冻结方向，实施参数待细化 |
| [`capability-matrix.md`](capability-matrix.md) | **能力矩阵权威**：产品 Authority × MCP Registry × 风险 × 覆盖级别 × 候选优先级 | 第二轮已冻结规划分类；具体 action 合同逐域核实 |
| [`studio-project-agent.md`](studio-project-agent.md) | **第三轮权威**：Studio 直接路径、Project Agent Task、外部/内置模型分工、Review/Commit 和原生恢复 | 第三轮方案 B 已冻结方向，具体 Action schema 后续确定 |
| `domain-*.md` | **按需再建**：Memory/Goals/Experience/Evolution、UI/Media 等后续域模块 | 尚未设计 |
| `acceptance.md` | **待创建**：最终风险/兼容/实机与客户端验收、已验证与未验证分类 | 尚未设计 |

单条详细规则仅写入一个权威模块。index 只管理全局冻结原则、依赖和讨论/实施路由，不复制域内设计；现有旧 Plan 仅作历史链接，不直接作为本轮新增范围的执行授权。

## 4. 讨论路由（不是实施暂停规则）

| 轮次 | 讨论对象 | 本轮前应读取 |
| --- | --- | --- |
| 第一轮（已冻结） | Atria 与 MCP 代码审计、方案 C | `index.md`、`audit-baseline.md` |
| 第二轮（已冻结） | 能力矩阵；分层调度、任务/回执恢复、MCP v2 兼容方向、P0 验收；方案 B | `capability-matrix.md`、`p0-reliability.md` |
| 第三轮（已冻结） | 方案 B：Studio 直接 Workspace + Project Agent Task；外部 AI 默认主导；原生模型显式委托；独立 Review/Commit | [`studio-project-agent.md`](studio-project-agent.md) |
| **第四轮（当前讨论）** | Memory / Goals / Experience / Evolution 的语义接口、来源权威、预算、持久化/删除/恢复边界 | `index.md` + `capability-matrix.md` 中四域行；按需读取当前 `main` 原生 Memory、Goals、Experience、Evolution 与 `plugin:atria-mcp` 对接源码 |
| 后续轮次 | Session / Runtime / UI / Media、跨域验收、实施分期 | 先 `index.md`，再按议题读取相关已建模块；冻结后增量更新 |

不能从上表推断最终实现阶段数或工作量；待 P0 的依赖关系确定后在同一 index 固化可交付实施阶段与必要模块。

## 5. 第二轮已冻结的 P0 与优先顺序

- **第二轮选择方案 B**：分层调度 + 精确资源隔离 + 安全恢复 + MCP v2/2026-07-28 能力协商，详见 [`p0-reliability.md`](p0-reliability.md)。
- P0 先实现：控制面不被长任务或审批阻塞、源权威并发防线、可查询的操作/回执与不确定结果核对、可信审批与跨客户端协议适配、大型 Package 传输容量闭环。
- P1 继续：Studio/Project Agent、Session/Memory/Goals/Experience/Evolution、Model/Prompt/Runtime、Package/Library 与 UI 语义能力按矩阵推进。
- P2：深度图像/语音/技能扩展以及仓库性能/Discovery 迭代，仍须兼顾新接口不会退化 P0。
- 2026-07-28 协议的 MRTR 为新版核心能力，**Tasks 为独立扩展**，不可将 Tasks 可用性或客户端支持视为必然；SDK v2 迁移与启用新版协议是两个不同步骤。优先适配 2025 旧连接，2026 新连接只在协商确认后使用；无可信审批通道时写操作 fail-closed。

## 5.1 第三轮已冻结的 Studio / Project Agent

- **第三轮选 B：双路径、统一原生权威**，详见 [`studio-project-agent.md`](studio-project-agent.md)。简单编辑直接 Studio Workspace；复杂、长周期创作进入 Project Agent Task；最终统一通过 Native Studio/ChangeSet 权威。
- **外部 AI 默认主导**，不因具备 MCP 就重复调用 Atria Studio 模型；用户明确要求内置模型时才显式委托，并使用原生模型路由/预算和任务证据。
- **Review/Commit 两道不同授权**：任务内计划/提案/评估可在精确 envelope 内推进到 Review；正式 Commit 必须额外可信用户批准，绑定具体 Workspace/Task、Revision、变更指纹与 Preview/Validation 证据。
- **恢复只靠原生权威**：Product Project Agent Task、Studio ChangeSet/Git revision、Commit Receipt 作为真值；MCP Journal 只关联，不再持久化另一份业务任务。错失回复时先 reconcile，不盲重发。
- 原 `agent.run.start(delegated-node)` 属不同 Orchestrator Runtime；不要与 Project Agent 生命周期混淆。

## 5.2 第四轮待讨论（尚未冻结）

- Memory Graph 已加载浏览器范围与原生 Session-owned 记忆，以及 Goals/Experience/Evolution 之间是否共享或相互晋升；避免将其直接扁平化为“一个记忆数据库”。
- 四个系统各自 READ / 可能付费读取 / MUTATE / DESTRUCTIVE 的精确语义 Action 与产品 Authority。
- 持久来源、证据过期、分支/快照回退、压缩/删除、目标/能力演化发布和回滚的事务边界。
- 外部 AI 直接观察及管理 vs 用户显式授权内置 Agent 自动学习/演化的预算、审批和恢复。
- 跨重启稳定持久对象（Node/Goal/Feedback/Skill policy）与临时推理投影/缓存/候选及 MCP Operation Journal 之间的区分。

## 6. 实施和验证边界

- 当前仅企划；不修改 `main` 或 `plugin`，不启动产品/真机，也不创建开发任务分支。
- 进入实现时，遵守 [Repository Governance](../../../README.md)；与现有旧 Plan/Record 的历史执行事实分开维护本任务的 **同一份**正式 Record，阶段结果需有真实证据。
- 保留其他任务的 `docs:HANDOFF.md`，没有用户专门要求交接就不触碰它。
- 目标客户端/平台支持与测试可行性在后续验收模块明示，不把未经验证的平台承诺写成已完成。
