# Atria MCP 补强企划 — Plan Index

- **Task ID**：`plugin/atria-mcp-strengthening`
- **Primary Workspace**：`plugin`（实现位置：`plugin:atria-mcp/`）；设计文档位于 `docs`。
- **状态**：讨论中；第一轮路线 C 已冻结；第二轮能力矩阵与 P0 可靠性细则待讨论/冻结。**未进入实现阶段**。
- **创建日期**：2026-10-14。
- **审计时源码基线**：`main@7e1045ab836c22cafbc92c5de056ad701f56e723`、`plugin@ee99b2b3d1c65502a971495a6016ccb7c195bf6d`。后续执行前必须重新验证实际 HEAD，不能把审计 HEAD 当作未来生产状态。
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

**此处冻结的是补强目标、次序和边界，而不是 P0 的实现细节**。P0 控制面、锁粒度、后台作业和回执持久化等选择由第二轮讨论并在确认后固化。

## 3. 模块路由与权威性

| 文件 | 内容范围 | 当前状态 |
| --- | --- | --- |
| [`audit-baseline.md`](audit-baseline.md) | 第一轮 main / plugin 核查范围、观察到的实现、P0/P1 候选缺口、证据限制 | 已记录，随代码 HEAD 重新验证 |
| `p0-reliability.md` | **待创建**：第二轮可靠性架构、控制/工作面、调度、生命周期、恢复、具体验收 | 待第二轮选定后建立 |
| `capability-matrix.md` | **待创建**：Atria 权威能力 × MCP 暴露 × 风险 × 缺口与阶段 | 第二轮讨论，选定后建立 |
| `domain-*.md` | **按需再建**：Studio/Agent、Session/Memory、UI/Media 等后续域模块 | 尚未设计 |
| `acceptance.md` | **待创建**：最终风险/兼容/实机与客户端验收、已验证与未验证分类 | 尚未设计 |

单条详细规则仅写入一个权威模块。index 只管理全局冻结原则、依赖和讨论/实施路由，不复制域内设计；现有旧 Plan 仅作历史链接，不直接作为本轮新增范围的执行授权。

## 4. 讨论路由（不是实施暂停规则）

| 轮次 | 讨论对象 | 本轮前应读取 |
| --- | --- | --- |
| 第一轮 | Atria 与 MCP 代码审计、选择 C | 产品与工具实际代码；审计记录见 `audit-baseline.md` |
| **第二轮（当前）** | 现状/目标能力矩阵；P0 控制面、调度/并发、Lease/Receipt/恢复、客户端验证与优先级 | 本 `index.md` + `audit-baseline.md`；确认后更新本目录对应模块 |
| 第三轮及以后 | 按用户选择依次深入 Studio / Project Agent / Runtime / Memory / UI / 安全 / 验收 | 先 index，再只读当前议题模块；冻结后更新 |

不能从上表推断最终实现阶段数或工作量；待 P0 的依赖关系确定后在同一 index 固化可交付实施阶段与必要模块。

## 5. P0 待决题（尚未冻结）

- **执行通道**：如何让 `status/cancel/diagnose` 不被长任务/用户审批阻塞？读、控制、变更是否分队列？如何避免并发写竞态？
- **任务模型**：同步短操作、持久异步作业、后台生成与浏览器长等待的边界；`operationId`、状态、取消、重连、超时的真值来源。
- **不确定结果**：MCP 进程重启/网络超时/客户端断开后如何安全恢复并核对外部写入？哪些对象可以幂等去重，哪些绝不可自动重发？
- **授权语义**：长任务、批处理、Agent child action 是否需要独立审批快照、租约、预算/成本上限和有效期？不得把 Policy Ceiling 等同于授权。
- **性能**：Source/Server/Browser 身份与路由发现的快照/缓存应如何分离？哪些缓存失效证据不足时只能返回 `UNVERIFIABLE`？
- **客户端矩阵**：不同客户端是否支持可信 form elicitation；不支持时保持 fail-closed，同时明确只读/观察功能可用。
- **主程序改动阈值**：已有 Product Authority 是否足够？缺口先证实，再考虑安全的专用服务端入口。

## 6. 实施和验证边界

- 当前仅企划；不修改 `main` 或 `plugin`，不启动产品/真机，也不创建开发任务分支。
- 进入实现时，遵守 [Repository Governance](../../../README.md)；与现有旧 Plan/Record 的历史执行事实分开维护本任务的 **同一份**正式 Record，阶段结果需有真实证据。
- 保留其他任务的 `docs:HANDOFF.md`，没有用户专门要求交接就不触碰它。
- 目标客户端/平台支持与测试可行性在后续验收模块明示，不把未经验证的平台承诺写成已完成。
