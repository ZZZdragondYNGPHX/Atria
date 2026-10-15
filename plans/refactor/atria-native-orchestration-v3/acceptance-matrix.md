# D9 E1 — 全域验收矩阵、证据分层与三端收口（冻结目标，实施证据分账）

> 2026-10-15 D9/E1 选择后，本文件是 **V3 阶段验收条款与实际证据门槛的唯一详细入口**。实施阶段与依赖见 [implementation-plan.md](implementation-plan.md)；E0 静态审计/当前阻塞见 [e0-audit.md](e0-audit.md)，业务/安全边界继续由 D1–D8 原模块与正式领域 Authority 持有。本文件制定**必须证明什么**，不是“本轮通过”。此处定义验收要求；实施后的真实证据以§8.2、§9.1及同一Record为准，不把设计文字当PASS。

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
| **E0_DESIGN → 开发授权 → P1** | 按 [implementation §2](implementation-plan.md#2-e0-设计门槛开发授权与实施验收三者分离) 完成设计核销；用户另行明确授权才可建实现分支。V3运行/故障/三端证据属于P阶段，不倒挂到E0 | 设计未决则补设计；仅授权缺失则保持NOT_AUTHORIZED；实施证据继续NOT_RUN/BLOCKED，不伪造PASS |
| **P1 → P2** | Host durable Plan/Run/Crash/Source/Version/Checkpoint 合同 L1/L2 可复核 | 修复/复测，不以 UI mock 代替 |
| **P2 → P3** | G2 调度与 S2 Effect/Approval/unknown/crash negative gates L1/L2 | 不接入可变更外部 Tool/真实 Provider |
| **P3 → P4** | 原 Memory/Model/Compute/Port budget、权限/源失效、原领域 Receipt L1/L2 | 不开放 RP/Project 自动原生消费者 |
| **P4 → P5** | Narrator/Studio/Evolution 业务来源/正式提交边界和无旧数据迁移主消费路径通过 | 保留未通过证据，不提前将旧代码作为正式兼容发布 |
| **P5 → P6** | Authoring/Run/Approval/Diagnostics 真实 Desktop/Mobile 功能合同至少 L2 通过，清退的消费替代完整 | 不删除仍有活引用的共享模块 |
| **P6 → P7** | 源码引用闭包/旧模式/旧前端/旧预设/Browser Runner 全清，原共享功能仍正常，产品只存在一条生产编排主路径 | 继续同分支修复，不能声称硬切 |
| **P7 → P8** | L1/L2 本地相关验证、经授权的 L4 真实外部/质量测试、Windows/Linux/Termux L3 和高风险安全矩阵全覆盖且 PASS | 缺设备/账号/安全证据保持 BLOCKED，不进入最终集成 |
| **P8 → Main** | 实际测试 Head、无残留旧代码/重要缺陷、完整 Record、Governance 集成门槛及真实远端 | 不合并或清理未完成的工作 |

**以上是阶段准入要求，局部实测不自动通过整阶段；当前证据见§8.2、§9.1及同一Record**。严重安全错误一律 fail-closed，Unknown 保留证据；质量问题按真实来源迭代，不通过降低硬约束/伪造评委/删除不利日志达成表面绿灯。

## 7. 三端真实客户端可执行方案与当前环境

本节补足 §5 的实际执行顺序。平台版本必须实录；不为满足表格假设已有设备/凭据。2026-10-15 本轮只执行环境只读检查：本地 Windows 11 Pro `10.0.26200` x64、Node `v24.18.0`；`wsl.exe/ssh.exe` 可定位，`adb` 未在 PATH 找到。**这只证明工具/宿主信息，不证明已连接 CachyOS、Termux 或 V3 Browser。** 未启动 Host、未取得三端客户端版本、未执行新 V3 流程。

| 平台/Store 组合 | 执行前真实准备 | 不能接受的替代证据 | 当前状态 |
| --- | --- | --- | --- |
| Windows / FS 与 SQLite 分别 | 独立测试 account/data root、精确产品 build、真实 installed Node+浏览器、原 Credential/Source grants；路径含空格/中文，确认文件锁和 writer 拒绝 | 当前 shell 存在、仅静态测试、桌面截图或 API fixture | 已有隔离Node Host工程实证；完整Browser产品流程NOT_RUN，不能以fixture代替 |
| CachyOS KDE / FS 与 SQLite 分别 | 真实 CachyOS 机器版本、kernel/Node/browser/FS 类型、测试账户与目录权限；使用原产品启动方式 | WSL/容器/其他 Linux 发行版、Windows 跑出的相同测试 | 未获得目标机器连接/版本证据：BLOCKED |
| Android Termux / FS 与 SQLite 分别 | 真实 Android 设备、OS/Termux 来源版本、Node/native addon 架构、移动浏览器、app-private 可写目录与 localhost 连接；原安装流程能加载 SQLite addon | Playwright mobile viewport、桌面 Chrome device emulation、Android 只有截图而无本地 Host | 未取得设备/连接与 V3 artifact：BLOCKED |
| MySQL / Postgres adapters | 可用测试服务/账号，原 Engine migrations 与 new kinds、CAS/tx/backup/ref 行为；不接用户生产库 | generic API 名称相同或 SQLite 测试通过 | Docker隔离MySQL/Pg已取得指定用例实证；未执行的故障/客户端用例仍NOT_RUN，详见同一Record |

每个平台在可用后执行同一组 C01–C12，保留 OS 特有附加结果。CachyOS/Termux 的连接只在真实目标可用时建立，不猜 SSH host、不下载替代发行版、不触碰生产数据。

| 客户端 case | 操作顺序 | 结果与失败判据 |
| --- | --- | --- |
| CL01 Authoring | 新建 Plan→建 Agent/Tool/Join/Output 节点→连 typed ports→Inspector 改字段→List 改边→撤销/重做→save/reload | 三视图同 Draft/version，布局改动不改 definitionHash；非法 port/无出口能定位，Validate 不网络发送 |
| CL02 Publish/CAS | 两窗口同时编辑同 Draft；先后 publish→新 Run 钉旧/新 revision | 后者真实 409，不静默覆盖；Run 不随 draft 编辑改变；旧 preset import/API 明确拒绝 |
| CL03 Observation | start→Timeline 默认→Graph 切换→刷新/离开/断网→重连→重放乱序/重复 delta | 只观察中断，Run 不随网页关闭取消；seq gap/epoch/visibility 变化重取 snapshot，无私密残留 |
| CL04 Approval | 在真实本人会话看操作/目标/参数/egress/budget→批准/拒绝；随后重放 nonce、改参数/Source/Boot | 一次精确有效决定；伪造 boolean/LLM/SDK/跨用户请求拒绝；可信通道不可证明则该动作 blocked，不能以按钮点亮算通过 |
| CL05 Cancel/Control | 模型等待/Tool pending/大图布局/Approval 打开时查询状态和 cancel | 控制可达、持久 cancel 请求阻止后续 dispatch；未知外部效果不显示已撤销/退款；不依赖长请求 close 才释放 |
| CL06 Host restart | 在 prepared、budget 已确认未关联、ready、dispatching、domain commit/receipt 前后分别结束**测试 Host 子进程**，重开同测试 root | 每窗按接口 §8 恢复；无 repeat charge/非幂等 send/双正文。不得杀生产 Host/系统或用整机断电代替受控测试 |
| CL07 Source/Actor | 并行读取后切 branch/variant/Project revision、撤回 source/grant；A知秘/B不知/Narrator宽/玩家拒绝 disclosure | 原输入与 Result/Join/投影重新 guard；过期结果不写新分支；自由文本间接串知作为 L4 质量单独记 |
| CL08 Product | 普通 RP、Native Package Turn/Game logic、Game rewrite、Studio Task review/commit、Evolution candidate/evaluate/publish/rollback | 每类准确 source/receipt；Studio 自动链只到 Review；旧 target/report 无资格，新报告按原 Eval；无 Director/preset runner |
| CL09 Mobile parity | Node/Edge List 完成 CL01/02/04/08 的所有语义；软键盘中文组合、Back、safe-area、滚动和 sheet 焦点 | 无拖拽/hover 必需操作；Back/键盘不丢 Draft、不误批准/提交；键盘和辅助技术可达所有字段/边 |
| CL10 Lifecycle | 切后台/锁屏/浏览器关闭/Android 系统收掉 Termux 后重开 | Host 存活时持续/等待由原 policy 决定；被杀后必须显式重开才能恢复，绝不声称系统自动唤醒或离线设备运行 |
| CL11 Storage/Restore | 新 kinds metadata backup→在独立测试账户恢复→source validity/GC refs 检查；未知效果存在时尝试清理预览 | 恢复停在 paused/reconciling，旧审批无效、原费用 high-water 不回退；引用/未知效果不被 GC；不拿旧数据迁移当测试 |
| CL12 Hard cut / Shell | 干净与含旧配置的隔离测试 root 启动；搜索/commands/detail route/Settings/Skill scope/Evaluation 全部尝试新旧入口 | 新主链唯一，旧配置不读、不迁移、不 fallback；非目标共享能力仍可用；离线旧 browser 发旧协议被原 send/commit guard 拒绝 |

不执行破坏性整机掉电、真实账户清空或真实第三方写入来凑验收。物理掉电安全若没有受控硬件证据维持 BLOCKED，软件进程退出测试只能声明其实际保证级别。L4 外部未知写入只对已明确授权的可控测试目标做；无授权/服务则 BLOCKED，不私自发送。

## 8. 用例与已有测试的精确衔接

以下测试入口是复用资产映射；哪些实际已运行及其范围只以同一Record为准，不由表格中出现文件名推断PASS。

| v1 case group | 现有可复用证据/测试入口 | 必须新增或重接的关键断言 | 阶段 |
| --- | --- | --- | --- |
| V01 Plan/Store/Owner | `tests/storage/harness/contract-harness.js`，`tests/native/durable-commit.test.js`、`helpers/durable-commit-process.mjs` | 6 kinds、PlanRoot/revision/command 同 tx；same-ID different-payload 冲突；第二 Host拒绝；FS 5 fault stages；SQLite busy/commit；SQL 原 conditional CAS | P1 |
| V02 Graph/control | 旧 agent-runtime/kernel/races/parallel/policy-controller 测试的仍有效不变量 | whole patch atomicity、active effect不可改、bounded循环累计、Review依赖闭包、父子持久身份、五种Join与late cutoff | P2 |
| V03 Effect/recovery | durable-commit harness + 新 V3 受控 Port | prepared/charge关联/dispatching/receipt/ACK-loss；取消、stale worker、已有Domain commit，remote未知不能重复发送 | P2/P3 |
| V04 Budget | `tests/native/run-compute-retirement.test.js`、原 compute/Project 测试；不得把旧 evaluation 开发配额当产品限制 | root/child/sibling原子reservation、stable admit/observe、真正每次Provider send/fallback唯一charge；unknown/restore/GC不返额度；普通RP无authority拒绝 | P3 |
| V05 Credentials/Approval | `tests/native/credential-target-review-ui.test.js`、`mcp-credential-targets.test.js`；原 CredentialTargetAuthority/credential-fetch | endpoint/schema/source漂移、nonce/boot/epoch重放、同源恶意扩展边界、跨用户、redirect/DNS、日志/投影secret泄露；真UI独立L3 | P3/P5 |
| V06 Domain/Game | `tests/game-runtime/llm-orchestrator-narrative.test.js` 的原 World/唯一正文断言，新 consumer 替换旧 producer adapter | Package Turn优先支路、free text、普通Native generation、rewrite；跨Run同output slot竞争；旧 client/send fencing | P4/P6 |
| V07 Project/Evolution | `tests/native/project-agent*.test.js`、`tests/agent-intelligence/evolution*.test.js`、`project-recovery.test.js`；frontend/agent-evolution-ui 与 project-agent-recovery smoke | target全生命周期、评测worker无旧imports、新fingerprint、旧report不eligible、原审核和commit unknown；不能删报告出处/原收费后再称通过 | P4/P6 |
| V08 Shared/Skill/Shell | Memory schema iteration、message-takeover、search/memory registry、Skills scopes、tests/atria-shell/workspace-host、原 frontend smoke | envelope/prepared-context抽离不退化；orch-preset全链终止；global/project/package/character Skill保留；Search/Back/导航/setting保存不丢 | P4–P6 |
| V09 GC/Restore | `tests/native/durable-maintenance.test.js`、`session-maintenance.test.js`、原backup/storage-center harness | active/unknown/approval/budget/ref pins；metadata根同代际；恢复只读/暂停不send；Save不克隆Run/额度 | P1/P3/P7 |
| V10 三端/质量 | CL01–CL12 + 原M1 Source/QualityProfile/独立评价 | 真Host/浏览器/OS动作；数据级安全与开放文本quality/真人偏好分开；不使用Model Judge冒充用户批准 | P7 |

测试资产处置采用 C17 与 manifest 中逐文件路径；旧 mode 专项可删除，仍有效安全断言必须先在新 authority 上有替代。SQL服务不可用不得把对应分支 skip 后宣称“四Engine通过”；Android addon 未能加载就是环境缺陷/阻塞，需要先诊断与可用安装方案证据，不把桌面fixture称实机。

### 8.1 性能与图 backend 的阶段出口

不在 E0 无硬件测量时编造帧率/恢复毫秒/千节点 SLO。P5 必须以明示的 Plan size/最长Timeline/并行度/设备内存配置构造小型、常用、配置上限场景，记录输入/布局/Inspector/控制请求的 p50/p95、最长主线程任务和峰值内存。布局/backend 选择先测真实 U2连线、键盘和移动List/Sheet；结果进入同一 Record，冻结该版本适用阈值再宣称 P5/P7性能达标。未配置/未测量阈值状态 NOT_RUN/BLOCKED，不把“支持virtualization”作为性能验收。

### 8.2 结果记录格式与当前真值

每条 evidence 至少：`caseId, productCommit, planCommit, platform, osVersion, nodeVersion, browserVersion, engine, testAccountScope, sourceFixtureId, action, expected, observed, status, failureCode, evidenceDigest, testedAt`。跨端同 case 分开记录，NOT_RUN 不填虚构 observed。公共 Record 只存脱敏摘要/hash/测试名/限制；请求响应、用户文本、nonce/token、原始截图等临时测试资料遵守 Governance §13.1 的清理要求，不为复核已删材料重复付费跑历史测试。

当前：L0 tracked scanner/AST，以及P1/P2/P3的部分L1与真实隔离存储/Host工程证据已取得，精确commit/测试数/故障范围归[同一Record](../../../records/refactor/atria-native-orchestration-v3.md)。包括四Engine authoring/Ledger/Owner、Windows测试Host进程kill、受控Graph/Effect/Join、三域原银行、实际GenerationHost本地HTTP发送、原Audience编译、原Tool协议、恢复保留与父子共享预算/逻辑计数。它们不构成完整V01–V10或任一完整P阶段PASS，更不代表L2所需完整installed Host+Browser流程。P4–P8、CL01–CL12完整客户端、真实外部Provider/Tool部署/费用、可信Review Origin及人工质量仍NOT_RUN；缺设备/账号/可信准入者BLOCKED。P3具体分账见§9.1，未集成main。

## 9. R项设计收口后的新增实施反例

以下是interface §12–16确定协议的必测场景；当前子证据按§8.2和同一Record分账，尚未完整验收，不因部分Owner/SQL故障实测就标整行PASS。增加这些case不会把其完成条件倒挂到E0。未执行部分保持NOT_RUN；设备/服务/可信认证实际缺失时对应case BLOCKED。原G1–G6/S1–S7/V01–V10/CL01–CL12要求保持。

| case细分 | 阶段/原包 | 必须证明的实际行为 |
| --- | --- | --- |
| V01-owner | P1 W02，三端P7 | 两Host同root/路径别名/不同HTTP端口只能一个Native writer；固定guard端口碰撞拒绝而非换端口；进程退出重开、identity半写、guard失效阻断；无任意PID/TTL抢占 |
| V01-sql-owner | P1/P7 W02/W09 | 同SQL DB不同root仍单Owner；专用session不归还pool、不用transaction lock冒充；连接lost/newOwner/fence竞争、旧tx完成次序、同源旧callback不可写新root |
| V03-commit-unknown | P1–P3 W02/W04 | COMMIT ACK丢失不重跑closure；按command/attempt/operationRef查询，read replica/连接不可用不冒充not_committed；无重复charge/send/业务提交 |
| V04-rp-bank | P3 W04 | RPControl初始化与header controlId匹配才send；rename不清bank；duplicate/import/fork/restore暂停；同input根下siblings/reservation再委派不多扣、不超额；usage超上界如实记overrun而非截断 |
| V04-send-identity | P3 W04 | GenerationHost每个真实provider sub-send使用稳定effectId+ordinal；幂等admit不双扣；fallback新ordinal、旧未知仍保留占用；Session/Project/RP三域分别覆盖 |
| V06-rp-output | P4/P6 W06 | 两Run抢同outputKey、相同operation不同payload、writing permit唯一；正文+marker同chat原子写；任一间隙崩溃只读marker补receipt，marker缺失unknown不盲重写；Browser不能双提交/伪marker |
| V05-review-origin | P3负例、P5/P7 W05/W08 | 主app脚本/Runtime SDK不能approve或读nonce；cookie不按port隔离的反例、Origin/CSRF/COOP/frame/opener/CSP、再认证accountVersion变更、nonce复用与boot变更；原用户身份/精确动作合法且三端可完成批准 |
| V05-review-unavailable | P5/P7 W05/W08 | 无受控review origin/无原再认证能力/远端不可信HTTP时精确动作unavailable；R0/既有窄预授权继续；不以强行开放R3或把整个批准功能永久禁用算验收 |
| V09-native-domains | P1/P3/P7 W01/W02/W04 | 六个Orchestration kinds + 原Storage `atri_host_fence` + 原RunControl `atri_rp_run_control`分别注册四Engine、backup/restore/delete/GC/ref；恢复暂停、unknown/已花额度保留，不把原领域扩展误称影子账本 |

Review Origin语义遵守D8完整可审查交互；主app仍显示Timeline/脱敏待办/launch ref，真实决定在受控页面回执后更新。不同origin只是同Host可信输入边界，不是第二Host/账号体系。对于原支持的正式Studio/Native安全操作，不能仅以默认拒绝占位完成产品；其可信通道必须在P5/P7真正通过。

### 9.1 P3后端子工作后的Gate复核

2026-10-16复核：**P3=IN_PROGRESS / Gate=NOT_READY**。第五至第十二组的测试详细列表和失败/变异证据唯一保留于同一Record；此表只给出剩余准入关系。设计与开发授权均已满足，不用尚未取得的产品证据倒挂E0。

| 维度 | 已有实际子证据 | 未完成与准入状态 |
| --- | --- | --- |
| V04银行/发送 | 原三域CAS、稳定Effect+ordinal、local typed ref、retry/fallback、重放拒绝、unknown/late settle；真实隔离MySQL/Pg指定case | Session role/background受信lane组合未实现，当前拒绝；真实费用NOT_RUN。P3/V04未整体PASS。 |
| 父子Run/逻辑界限 | 持久Delegate身份→原reservation→observe/confirm；祖先取消/精确额度/实际活动Attempt/共享逻辑counter、原子回滚与重放反例 | 原Scheduler完整permits、Handoff/child Result消费、实际Plan授权adapter仍IMPLEMENTATION_PENDING，不能宣称完整P2/P3通过。 |
| S2/S4 Context | 原Session Audience plan成为实际HTTP输入，send/consume撤权拒绝 | Project/RP原Audience adapter、Hybrid真实检索/跨Agent Result与Disclosure仍IMPLEMENTATION_PENDING；自由文本泄漏质量NOT_RUN。 |
| W05 Tool/Review | 原Skill/MCP/A2A/CredentialTarget、逐请求复核、持久A2A ownership和R3拒绝 | A2A精确受理回执已接原Effect观察（§17.21），不代表远端task完成；MCP/Skill缺完整原receipt仍unknown。真实Review Origin/再认证/批准尚未实现。真实外部协议部署/高危动作NOT_RUN且安全准入BLOCKED。 |
| V09恢复/GC | 原bank不退费、review_required、Run引用保留、危险overwrite/full/merge提前拒绝；四Engine指定case | 完整可信restore/release/source闭包仍IMPLEMENTATION_PENDING；当前拒绝不是完整恢复PASS。 |
| 产品API/消费者 | Plan authoring HTTP真实挂载；执行服务为内部组合 | Binding/Run/Projection/Approval产品API与P4原业务消费者尚未交付，IMPLEMENTATION_PENDING；不能交给Browser代行。 |
| 旧链与最终验收 | 旧链审计附件和替代计划存在 | P6硬切未执行；P7/P8未开始。完整Windows浏览器NOT_RUN，CachyOS/Termux实机连接/版本未取得为BLOCKED；L4真实费用/质量NOT_RUN。 |

IMPLEMENTATION_PENDING表示已有设计和授权、仍需本任务后续实现的工作，不是假称外部阻塞或再请求开发授权。后端与前端并行整合按[接口交接入口](backend-integration.md)推进，缺失API须先由Host实现；P7通过前不集成main。
