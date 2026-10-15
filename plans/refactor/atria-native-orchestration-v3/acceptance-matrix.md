# D9 E1 — 全域验收矩阵、证据分层与三端收口（冻结目标，未测试）

> 2026-10-15 D9/E1 选择后，本文件是 **V3 阶段验收条款与实际证据门槛的唯一详细入口**。实施阶段与依赖见 [implementation-plan.md](implementation-plan.md)；E0 静态审计/当前阻塞见 [e0-audit.md](e0-audit.md)，业务/安全边界继续由 D1–D8 原模块与正式领域 Authority 持有。本文件制定**必须证明什么**，不是“本轮通过”。当前没有执行新 V3 的 Node/CI/Browser/付费外部调用或 Windows/Linux/Termux 实机验收。

## 1. 验证级别与不得等同的证据

| 级别 | 环境和证据 | 可以证明 / 不能替代 |
| --- | --- | --- |
| **L0 定向源码/依赖静态** | 锁定 main HEAD 的 code search、import graph、schema/authority/源码指向及可复核文件链接 | 可发现活消费者与潜在风险；**不能**证明所有运行分支、持久化原子性、UI 交互或 E0 完整 |
| **L1 纯模块/合同** | Type/JSON/强类型 Graph validation、CAS 状态机、Join/GraphPatch/Effect/Output 的 deterministic unit/property/负例测试，完整测试名与 Head | 算法/局部安全不变量；**不能**证明 Native FS/SQLite、Server/浏览器/网络真态 |
| **L2 installed Native Host + Browser** | 实际 Node Host、真实 FS/SQLite/Session/Core/Studio/预算与进程强杀/重开；真实 Chromium/WebView 类浏览器输入、Host RPC、审批与权限可观测结果 | 应用内同机 end-to-end 及 Crash/恢复；**不能**替代用户真实 Windows/Linux/Termux 机器的特性 |
| **L3 实体目标平台客户端** | Windows、CachyOS Linux KDE 和 Android Termux 分别使用实机 Node Host+真实 Browser，设备/OS/Node/commit/动作日志和结果 | 三个平台的启动/存储/触控/IME/Back/真实登录及审批/重连差异；一端通过不代表另两端 |
| **L4 受控外部服务/真人质量** | 仅有准确授权/预算时使用真实 Provider、MCP/A2A/Tool、故意掉线与核对远端 outcome；RP/Project 的有源盲评、真实评价/费用和不利输出 | 真实 Gateway/价格/模型/外部未知副作用与开放文本质量；不能伪称模型评委是人工或 L1 fixture 代表外部服务 |

**状态枚举**：`PASS` 仅限明确的测试用例/Head/环境/原始输出与授权；`FAIL` 保留失败与根因/复测；`BLOCKED` 表示缺服务/设备/可信身份/安全准入或真实前置；`NOT_RUN` 表示尚未执行；`N/A` 必须说明项目不适用的原合同条件，不能用于掩盖硬正确性维度。没有日志/来源时按 NOT_RUN，不能以静态设计填 PASS。

## 2. Graph / Ledger / Effect / Compute 可靠性矩阵

| Gate | 必测场景与反例 | 所需最低层级 |
| --- | --- | --- |
| **G1 Graph/Host** | 无效 port/type、无可达 Output、Dependency cycle、明确 bounded loop、重复 GraphPatch ID、错误 TaskGraphRevision/CAS/epoch、Planner 越权生成/删除已执行节点；join(all/settled/any/quorum/deadline) 并行/迟到/失败/partial | L1 + L2 |
| **G2 Immutable Plan/Host Run** | 同一 Draft Canvas/Inspector/List 编辑、Validated/Published 版本与 Running TaskGraph 分离、双 Host worker 竞争、旧 browser/worker epoch 迟到、Host 冷启动 Ledger 不丢已确认 Receipt；不同 Session/Project revision 不被混同 | L1 + L2 |
| **G3 Effect crash windows** | 写前意图已持久化未派发、可能发出后断电、Receipt 写入但未消费、DomainCommit 成功而响应丢失、重复发送/重试/取消/审批过期、unknown 无远端状态查询时必须 fail-closed | L1 + L2；获准外部写例补 L4 |
| **G4 Compute/Budget** | 多 sibling 同父预算 CAS/预约、超支竞争、取消/重启/Save/Branch 切换不补已花额度；真实模型 send attempt 唯一 charge、fallback/review/embedding/unknown 网关重试、local CPU 可观测成本 | L1 + L2；真实用量 L4 |
| **G5 Reuse/Cache** | 已完成只读 Result source proof、撤回/过期/Actor 变化/Branch Restore、跨 Audience 不能复用秘密；Application vs Provider Prompt vs Local KV 分层，cache-hit 不冒充业务授权或费用零值 | L1 + L2；Provider 实际命中 L4 |
| **G6 Recovery & GC** | Host 重启、写入 torn/partial、旧 checkpoint/任务回执保留、GC 不删正式 World/Project Effect 证据；取消与远端撤销、回滚/退款不同、长期 unknown 有审计出口 | L2 + L3 |

具体 performance、成本上界、最长恢复时间、重试阈值和 physical WAL/SQLite/FS schema 必须在 E0/实施与真实基线确认；不能把工作表示例当生产硬限。

## 3. Permission / Secret / Injection / Quality / Domain 矩阵

| Gate | 必测授权与拒绝用例 | 所需最低层级 |
| --- | --- | --- |
| **S1 Capability/Approval** | Tool Descriptor 伪 readOnly、GraphPatch/Handoff 权限扩大、Tool 名称白名单但参数含写入、未经授权数据外发、模型/Browser boolean “已批准”、Approval nonce 重放/参数/Revision/Boot/Endpoint 改变、等待审批 Cancel/Status 可达 | L1 + L2；PC/Mobile 可信 UI L3 |
| **S2 Secret/Endpoint/Egress** | SecretRef 改绑恶意 origin、redirect/SSRF/本地网络/Proxy、私有 NPC Context 作为 MCP/A2A Tool 参数泄漏、Source revoke 后旧 Prompt/Tool/Result 仍外发，浏览器错误和 Trace 泄露 Secret | L1 + L2；可控外部 Endpoint L4 |
| **S3 Prompt injection/Code** | 恶意 Tool/Skill/Agent Card/Issue/Package 文本提出新授权或执行脚本、跨 TrustDomain、缺沙箱 Host Plugin/Extension/代码执行，模型审稿不能替代确定性准入 | L1 + L2；目标 OS 执行隔离 L3 |
| **S4 Actor/Memory/Disclosure** | A 知秘、B 不知、Narrator 有宽权限而玩家 display 拒绝；ToM A 关于 B 的推测不变成 B mind；跨 Source/Time/Branch/World Tick/Save/Restored variant 查询与 Runtime Join 都重新证明 audience | L1 + L2；自由文本间接串知真实评价 L4 |
| **S5 RP Narrator/Player** | 每回合唯一合法 Final Prose、不擅自更改 World/玩家动作、不得用内心戏替玩家承诺、按 F2 普通 RP 不固定多 Agent，复杂剧情合理升级 | L1 + L2；质量/自主权文本评价 L4 |
| **S6 Project/Studio/Evolution** | Project Task→Workspace→ChangeSet→Validate/Review，真正 Author/Project Approval + Native Apply/Commit，旧 Evolution Director/Workspace 目标消除依赖/新目标仍合法，删除旧代码不破坏体验/QualityProfile | L1 + L2；真实 Studio/RP/Eval 操作 L3/L4 按实际可用性 |
| **S7 Old Hard Cut** | 可达入口/动态 import/设置/Graph/Generator/Takover/Browser Checkpoint/旧模式/Prompt 埋点/专有 CSS/测试/用户交互全部没有旧五模式生产路径；共享 Message Takeover、Studio/World、Memory、媒体等其他消费者仍可运行 | L0 完整源→sink + L1 + L2 + L3 对应主路径 |

**硬正确性维度不可被平均文学评分抵消**。Host/Domain proof、open-ended Model Judge、真人偏好与实际 World/Project 效果分别记录，质量测试须引用原 Experience/Eval QualityProfile/Case provenance/实验预算，不得把模型自评伪装成人工同意。

## 4. U2 Graph/Timeline/Approval 与长会话性能验收

- **桌面**：PlanDraft Graph Canvas+Inspector/List 双向编辑同一语义、端口与边非法连接错误定位、Undo/Redo、Version CAS、发布/运行分离；Run Timeline 默认与 Graph 切换读取同一授权 Host Projection；审批/错误/Unknown/费用有可见来源。
- **移动**：无需桌面 Drag & Drop，Node/Edge List+Sheet 完成**完全相同的语义操作**（增改删节点/边、Agent/Route/Source/Tool/预算、Validate、Publish、Run 观察、Approval、Error Recovery）。触控手势/软键盘/IME/Back/safe-area 与 Serene Canvas Dock/Bottom Navigation 不冲突。
- **性能**：图形布局/缩放/局部焦点/虚拟化和长 Run Timeline 分页不修改 Host 图语义，不阻塞控制/审批路径；Node/Edge 虚拟过滤不会让隐藏节点从 Validate/Run 消失。延迟/帧时间/内存/节点数阈值须在目标硬件测量后在本 Record 固定，不能现在凭空设 SLO。
- **可访问性**：键盘可创建/编辑连线、可见焦点、Node/Edge 列表替代、触控目标、屏幕阅读器语义、状态描述不只靠颜色、reduced-motion、软键盘、输入法组合/Back 行为；真实机器/浏览器辅助技术记录环境与结果。
- **私有诊断**：Editor/Run Inspector 展示的 Sources、Result/Effect/Cost/Approval、Trace 导出和 Log 受 D4/S2 权限/脱敏约束，不得因 Admin/Debug 图视图越过原源权限。

## 5. Windows / CachyOS Linux / Android Termux 真客户端最终验收

| 平台 | 必须完整走通的真实路径 | 必测环境风险 |
| --- | --- | --- |
| **Windows + Node Host + 浏览器** | Native Plan Draft→Validate→Publish→Run/Cancel→Approval/Result/Resume；Studio Project Review/Commit 独立，Native Game/RP 正文和 Source 权限正常 | FS/SQLite 文件锁/进程崩溃恢复、不同浏览器/权限/Path、窗口刷新、系统重启与批准真身份 |
| **CachyOS KDE Linux + Node Host + 浏览器** | 与 Windows 同一合同，真实 Run/Effect/Receipt、U2 Graph/Timeline、真实浏览器/项目源权限及 Keyboards | 进程信号/FS 权限/SQLite WAL/Browser 文件隔离、Serene Canvas 实际视觉、Linux 设备内存/长会话 |
| **Android 手机 Termux + Node Host + 移动浏览器** | 列表+Sheet 完整节点/边/验证/发布/审批、Timeline/Graph 视图、原 Source/Actor、Run 中切后台/锁屏/页面断联后复核恢复 | Android Back/IME/soft keyboard/safe-area/触控、Termux 进程被杀/后台限制、文件路径/Port/Secrets、避免宣称系统会自动唤醒 |

- 三端**分别实际通过**才能宣布三端交付。只有 Chromium 桌面模拟移动 viewport 不构成 Termux 实机验收；Linux 通过不等于 Windows FS/浏览器平台可用；Termux 没有受控长驻/唤醒证明时不承诺 App 关闭仍能运行。
- 各端保存 exact `product commit`、`docs plan revision`、OS/Node/浏览器/Termux 版本、平台设备、测试账号/权限和工件 hash、诊断日志/截图/失败与 Unknown outcome；私有 payload 不进入公共 docs Record。
- 缺真实 Windows/Android 设备、Secret/测试账号或外部 service 时对应门槛 `BLOCKED` 而非 PASS；项目可以继续非破坏性其它验证，但不得凭不足证据称“全端完成”。

## 6. 正式阶段 Gate 与失败策略

| Stage Gate | 必须成立 | 不成立时 |
| --- | --- | --- |
| **E0 → 建开发分支** | 实际最新源/消费者闭包、物理 Owner/Schema/RPC/Store/Budget/安全/硬切顺序、跨域复用与真实验收计划具备可核对证据；用户明确允许正式实施 | 记录 BLOCKED，继续 docs 审计/澄清，不建分支 |
| **P1 → P2** | Host durable Plan/Run/Crash/Source/Version/Checkpoint 合同 L1/L2 可复核 | 修复/复测，不以 UI mock 代替 |
| **P2 → P3** | G2 调度与 S2 Effect/Approval/unknown/crash negative gates L1/L2 | 不接入可变更外部 Tool/真实 Provider |
| **P3 → P4** | 原 Memory/Model/Compute/Port budget、权限/源失效、原领域 Receipt L1/L2 | 不开放 RP/Project 自动原生消费者 |
| **P4 → P5** | Narrator/Studio/Evolution 业务来源/正式提交边界和无旧数据迁移主消费路径通过 | 保留未通过证据，不提前将旧代码作为正式兼容发布 |
| **P5 → P6** | Authoring/Run/Approval/Diagnostics 真实 Desktop/Mobile 功能合同至少 L2 通过，清退的消费替代完整 | 不删除仍有活引用的共享模块 |
| **P6 → P7** | 源码引用闭包/旧模式/旧前端/旧预设/Browser Runner 全清，原共享功能仍正常，产品只存在一条生产编排主路径 | 继续同分支修复，不能声称硬切 |
| **P7 → P8** | L1/L2/CI、经授权的 L4 真实外部/质量测试、Windows/Linux/Termux L3 和高风险安全矩阵全覆盖且 PASS | 缺设备/账号/安全证据保持 BLOCKED，不进入最终集成 |
| **P8 → Main** | 实际测试 Head、无残留旧代码/重要缺陷、完整 Record、Governance 集成门槛及真实远端 | 不合并或清理未完成的工作 |

**不在本轮执行任何测试**；以上 “PASS” 是将来应当填入真实 Record 的状态，并非 D9 已通过的宣告。严重安全错误一律 fail-closed，Unknown 保留证据；质量问题按真实来源迭代，不通过降低硬约束/伪造评委/删除不利日志达成表面绿灯。
