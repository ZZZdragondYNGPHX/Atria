# Atria MCP 全面补强实施 Record

- Task ID：`plugin/atria-mcp-strengthening`
- Primary Workspace：`plugin:atria-mcp/`
- Plan：[唯一入口](../../plans/plugin/atria-mcp-strengthening/index.md)
- 状态：工程实现、主线集成、推送与本机可执行分层验收完成；外部待验及受系统策略限制的 Journal 元数据留存见最后一节。历史扩展 Record 保留原状。

## E0 — 2026-10-14 现状与实施收口

- Start/Tested product HEAD：`9241325a7290e613e0fdaaa1870409105c161c89`；plugin start `dc670eddfe7e497aa2bec84a5aea63d6da9b69ab`，同分支 fast-forward 至 `ee99b2b3d1c65502a971495a6016ccb7c195bf6d`；docs start `018832d3274fa8af0cbfab585d08ec68223a6b76`。
- 已检查所有 Git worktree/本地分支/远端 refs 与远端 HEAD（main）；main/plugin 干净，docs 的前端重构与 agent-experience-evolution 未提交修改属于其他任务，不纳入提交。没有 main merge 到长期工具/文档空间。
- 完整阅读治理、适用 AGENTS/CLAUDE、八轮 Plan 模块，读取旧 Plan/Record 作历史证据；三个独占领域子代理进行只读源码审计。
- 新增 implementation/security/acceptance；第九轮来源如实记录为当前开工授权，未虚称此前单独冻结选择。阶段依赖 E0–E7 保留全部已冻结范围。
- 源码差异：全局 FIFO / Executor busy、六个 fork/retry 漂移、多域名义查询隐性写入、Package 大小裂缝、Library delete-safety payload；详见 Plan 契约表。SDK 官方依赖/协议在 E2 按真实版本验证。
- 本地 Node `v24.18.0`、npm `11.16.0`。初次 npm test 因未安装依赖整体失败；随后 npm ci --ignore-scripts 成功（99 packages），未改变锁文件。再次基线测试暴露默认 Chromium 缺失，继续使用本机 Edge 诊断/复测；本阶段不报告 suite 通过。
- 尚未执行真实产品/人工审批/跨平台/付费 Provider 验收。下一依赖：提交 E0，立即开展 E1 调度与最小 Journal，E2/E3 独立模块并行开发，先补纯观察 authority 再扩展域动作。

## E1–E3 基础交付 checkpoint — 2026-10-14

- Plugin 已提交并推送 `c690d26fba1e5a10e759bd4263f79850ec97e0ac`；产品增量在独立 `feat/mcp-native-authority`，起点 `9241325a7290e613e0fdaaa1870409105c161c89`，尚未集成 main，不能说现有 main 已兼容新接口。
- E1：移除全局工具 FIFO / Executor busy；独立有界 Control/Read/Mutation/Browser 调度、审批外等待、资源锁内二次 guard、Lease 原子消耗；operation list/get/cancel/scheduler/reconcile；可选批准后后台执行。Journal 原子私有元数据记录，不持久正文/凭据/Lease，重启只观察 unknown，不重放。
- E2：SDK server/client/core 精确 2.3.1；官方 stdio factory/legacy shim；2025-11-25 与 2026-07-28 实际 wire 协商；MRTR HMAC/nonce/TTL/instance/client/input/target 绑定。Tasks 扩展未宣告，按可选范围提供 semantic operation 控制。依赖迁移后 npm audit 0 vulnerabilities。
- E3：BinaryAssets 固定 authority/purpose/owner/client/scope/revision/操作范围、分块/整包 SHA/容量/TTL；内部字节禁止 JSON 序列化。Package bridge 改 Native staging/metadata/chunks，preflight/install 继续 Native authority，Library delete-safety 扁平参数修复。artifact.capture 因新增原生 staging 正确升 INTERACT。产品 128 MiB archive / 32 MiB Bundle / 16 MiB Mask 限额保持分域。
- E4 提前依赖修复：退役六项不兼容 fork/retry；chat.send 要求 caller-known commitId，丢 ACK 只核对原生 receipt，不重发输入/模型；Save/Restore/Switch、quick save、policy/branch metadata CAS。完整 E4 仍在开发。
- 实际 Plugin 全套 `npm test`：**88/88**，零 skip（Windows Node 24.18.0，`ATRIA_TEST_BROWSER_CHANNEL=msedge`）；`npm run check` 与 diff check 通过。早先默认浏览器缺失不算业务失败；安装依赖后针对本机 Edge 复测取得实证。
- 实际产品针对测试：`mcp-session-observe` FS/SQLite 10/10、`mcp-artifacts` 4/4；Session runtime HTTP 11/11 由子代理执行通过。SQLite 初缺原生 binding，隔离任务依赖并显式执行现有可信 better-sqlite3 install 后复测成功，没有改 main 共享依赖。
- 原生 Binary HTTP 测试跨 1 MiB JSON 限额传输 >2 MiB bytes，真实 PackageContainer/Installer/Repository 安装与旧 baseVersion 409；Studio build 在该测试中注入 fixture，**尚非真实运行 Atria Studio 的全链路证明**。
- 协议 13 项包含实际 stdio 两代服务、raw-wire 篡改/重放、挂起审批时观察与取消、完整 Atria CLI modern surface；自动批准仅为合同证据，不声称真人审批通过。Codex CLI 本机 0.162.1、Claude Code 2.1.296 的真实人类交互、CachyOS/Termux、真实付费 Provider 仍待验。
- 未完成：Journal 更长期保留/GC、真实产品并发与故障联调、Project Agent/Runtime/认知/媒体/技能/扩展及Semantic UI。继续 E4–E7，不将本 checkpoint 当整体完成。

## E4–E5 原生领域验证 checkpoint — 2026-10-14

- 当前实际 HEAD 仍为产品任务树 `9241325a7290e613e0fdaaa1870409105c161c89`、工具 `c690d26fba1e5a10e759bd4263f79850ec97e0ac` 加本任务未提交实现；以下是该独立工作树增量的测试证据，尚非已集成 main/不可变提交的最终证明。前端重构文档修改仍由其他任务独立维护。
- Project Agent：无头纯 Task/Context 观察、sequence/Review Hash CAS、typed proposals、独立 Review/Commit、删除提案保持 DESTRUCTIVE、已关闭 Preview 拒绝 Commit；显式内置模型使用共享原生 runner、Scheduler、Route/Provider许可与 Compute 记录，不重复创建 Agent Runtime。未知结果禁止自动模型重试。新 generation FS/SQLite 6/6，加真实 MCP Adapter→Native→loopback Provider→Review→独立 Commit 1/1；ACK 丢失不重复发送。
- Session：纯 snapshot/health/runtime/Continuity、完整 Chronicle/metrics/revision/commit receipt 观察，元数据同 HEAD CAS；维护在原生 runLock 内核 HEAD，保留 Reachability/读租约/Quarantine。新 History FS/SQLite 4/4、现有维护可用 FS/SQLite/GC 子进程 20/20。MySQL 53306/PostgreSQL 55432 不可连接的 18 项未验，不报告全平台通过。Resource setup 的 Session 读取另迁移纯 observe，事务写拦截测试通过。
- Runtime：真正纯 Preview 禁止 Secret/Provider/Checkpoint/自动 Evolution reconcile；credential-target permit 在 Secret 解析和实际发送处核对 Endpoint，公共 URL 采用 public DNS/socket pinning、redirect 拒绝与流式大小/30 秒时限。独立 generation start/status/result/usage/stop 复用 Native Scheduler，结果限额与 owner 检查，不复制运行表。
- Cognition：Goals/Evidence/Experience/Evolution 分域权威、来源/预算/Sequence CAS；human label 不暗中自动发布，自动配置、付费学习、正式 publish/rollback 独立审查。Prompt Candidate 撤销 declaration 后保留现有绑定的 rollback 证据，禁止重新 apply。
- 实际 Runtime/Cognition 6 suites 58/58；Goal S11/S12/S14 36 项、Scheduler 7 项；PromptPreset 5/5、PromptCandidate 20/20、MCP/A2A 6/6。Goal S13 unknown 重试旧断言按“不盲重试”迁移并定向 2/2，相关共享 runner 12 项通过。模型只调用隔离本地测试 Provider，未用真实付费账号。
- 工具统一回归一轮 122/122（Edge）；其后新增 Session/Archive/Resource 等动作继续做针对测试并待最终全套。Skills Native HTTP 4/4、adapter 3/3；Extensions Native 26/26、adapter 4/4。这些不代替完整隔离 Atria 或真实人工审批验收。
- Journal 已补父路径检查、容量/保留策略与无未知重放；5/5 调度/恢复测试通过。E6 继续完成 Bundle、已安装 Package 原字节导出与 Session Archive；E7 正在补生产 Renderer 的 Surface/ScreenshotProof 和真实隔离实例联调。

## E6 与 E7 自动化 checkpoint — 2026-10-14

- 产品 authority 已本地提交 `03ded8188e9958cf5d94bddcbce5be9993d57615`（临时任务分支，未集成 main）；Plugin 领域桥接已推送 `436a8d010`，其后容量与审计修复增量尚待提交。
- E6：统一固定用途 Binary Lane 覆盖 Package、32 MiB Resource Bundle、Session Archive、图像/缩略图/音频/Mask。已安装 Package 原字节导出复用原 `PackageInstaller.open` 校验及 Asset Blob lease，不重建替换 Hash。Bundle 全映射 Hash/计数与 <=64 条分页审查支持 512 项长 Ref 极限，独立 Review/Import；unknown 仅同一 Token/映射、原 indeterminate receipt 的显式审批续接。
- Session Archive 加密能力已补完专用 `atri_save_password` SecretManager key 与既有 UI 标签；MCP 只传 immutable opaque SecretRef，最终效果前按 owner/专用用途解析。预检零 Secret、空库存零创建；Provider Secret 不能替代密码，密码不能进入通用 Provider 库存/发送。FS/SQLite 及真实跨工作空间 MCP 加密导出/分块/预检/独立导入 5/5；磁盘 Journal/审批/Receipt 未含密码明文或可离线猜测的密码 SHA。
- E7：compiled local Surface set/toggle、纯原生 Session Epoch 与小型 Preview identity；截图前后核 Native、document/source/viewport/region。注册 Surface 区域裁剪，Proof 元数据短期有界，原图不写 Journal。MCP Browser 阻止用户 Extension code 路径及跨 Origin 子资源，避免同页第三方代码伪造本地语义回调；这不是任意网页执行沙箱。active wait 支持分段取消，Control 可达，取消后下一页面任务独立运行，真实 Edge fixture 通过。
- Project generation 最终审计补首次 Task sequence 与 resume 锁内 CAS，竞争 Native attempt 不被中断或冒认；9/9 通过。Project Commit guard 改用 Preview `/identity`，Session 删除 guard 改纯 `/observe`，避免大响应与观察写入。
- 在产品提交 `03ded8188` 上执行 MCP 原生集合 **21 suites / 141 tests 全通过**，包含真正的 FS/SQLite、Native Router、跨工作空间 Adapter 与本地 Provider；现有 `mcp-http-client-s30` 为 node:test，单独正确 runner **25 pass / 1 skip**，未用 Jest empty-suite 失败冒称业务回归。第一次集合的跨 VM Binary binding 失败已修并用普通跨 realm/恶意原型测试及真实 Bundle Adapter 重验。
- 当前工具完整回归 **134/134**（Windows Edge），check 覆盖全部 58 个 JS；产品本次所有修改的 src/public 源码 ESLint 通过。旧 `project-agent.test.js` 中 10 条原有 conditional-expect lint 提示未作无关重构；本次新测试及生产源码另验。
- 真实隔离 Atria 联调已启动；第一轮运行中正好提交产品源码，原生 provenance 二次核验正确拒绝不同 HEAD，未执行该次写入。已固定提交并重启全链路验证，不将首次故障当验收完成。继续大于 2 MiB 实际 Studio 包、生产 Preview Proof、客户端和 main 集成。
- 按原冻结边界，SavePoint 物理单删无原生 RunControl/CAS 安全端口、HostPlugin 无生产实例/运维 authority，明确 unsupported，不包装底层 Repo.delete 或伪造 active 状态。真实真人审批与 CachyOS/Termux 仍待实际设备/操作证据。

## E7 真实联调缺口修复 checkpoint — 2026-10-14

- 产品任务分支新增 `36d6e0dfe840f106bae689e108f7d901da8b88c8` 与 `482d3770b867856141add6388fba962be3693af1`。前者修正共享 Document kind 下 Runtime Library 扫描混入 Memory/Extension 记录，按既有 storage key 的 resourceType 与文档身份限制；真实联调的 Connection guard 500 有定向重现，4 suites / 18 项回归通过。后者修正 StudioService 返回完整 ProjectRevision 而 MCP build-artifact 错按字符串比较的问题；新增真实 StudioService / ProjectStore、>2 MiB 随机资产与真实 PackageContainer 字节/Hash 核对，5/5 及 ESLint 通过。
- 工具进一步区分 last-observed Frontend Epoch 与 Memory 自身 loaded source ticket/branch：不把心跳时间或延迟 Frontend 投影误当 Memory 换源；真正 Memory source/branch 变化仍拒绝。对应 READ/授权/UI 组合 15/15 通过。直接 Workspace 含 source.delete 的正式 Apply 必须走独立 `build.change.apply.destructive`。
- 已获得真实 Codex 0.162.1 app-server 的 18 tools/schema/status/discovery/READ/JPEG 实测；实际协商 `2025-06-18`，已加入 legacy form 支持并通过 14/14 协议测试，不能记作客户端协商了 2026。Claude Code 2.1.296 的真实 `mcp get` 报 Connected，仅证明启动/连接；未冒称其工具调用或真人审批通过。临时 Codex/Claude 配置隔离，未调用付费 Provider。
- 隔离真实 Atria 已取得生产 Session ScreenshotProof `EXACT_CURRENT`、compiled Preview 本地语义计数操作 succeeded、桌面/窄屏 Preview Proof `EXACT_CURRENT`、编辑器 Preview；这些是实际浏览器证据。全链路此前分别被源码变更、Runtime Library、Memory scope、Studio build 契约错误中断，失败如实保留于本摘要，不能以部分画面通过代替全链路完成；当前在固定 `482d3770b` 重跑。
- 最终安全审计继续收口聊天 Turn 与旧 Orchestrator Delegation 的原生费用预检/每次发送配置核对，使用第二个独立临时产品工作树 `feat/mcp-turn-authority`，复用现有 Native runner，不在联调中修改 source。Skills 大型候选 before/after 合法文本合并响应可越过 1 MiB，已交独占子代理补 metadata/完整差异分页与小型 Hash guard，不以提高全局 JSON 限额规避。
- 测试环境变动：子代理执行 Playwright 安装使共享缓存新增 Chromium 1243，并由其安装器清除旧 headless 1194；本任务验证仍指定现有 Microsoft Edge。未将环境变化隐去，也未更改产品依赖锁。
- 当前仍实施中：等待上述缺口修复、最终全链路、提交/推送、产品 main 集成与任务临时资料清理。人工审批 UI、CachyOS/Termux、真实付费 Provider 尚无实证。

## E7 隔离真实产品通过 — 2026-10-15

- `npm run test:atria` 在干净产品任务 HEAD `482d3770b867856141add6388fba962be3693af1` 运行完成，376 个原生路由发现、READ 与 28 次明确配置的确定性测试审批通过。实际 Studio 产物 **4,200,900 bytes**，经固定 Native metadata/chunks、Hash、preflight、独立 Review/Install，stale 再安装拒绝；未把普通 JSON 上限放大。
- Studio ChangeSet/Preview/Apply、Save/Restore/新 Branch、Branch metadata、Library revision、Connection CAS 与受审一次性删除完成。启动 Source/Runtime 身份为 EXACT；另工作树为 DIFFERENT_REVISION；Host 重启后原页面 STALE，显式重载后 CURRENT。此次未运行修改源码 fingerprint 的可选实验，不宣称该项新证据。
- 实际生产 Renderer/Editor 由隔离测试页面挂载，Session 与桌面/窄屏 Preview 的 Proof 均核验 EXACT_CURRENT；本地语义操作成功且未写 Session revision。浏览器测试还验证 Memory 节点/边/编辑/compact/reload 与真实换支。此处不是全应用 Shell 导航或真人审批 UI 验收。收尾已删除测试 Session，所以最后空页面的 `memory.schema.scope/injection/recall.last` 明确 unavailable，未用这个结果声称有 loaded Memory。
- 同轮真实 Codex app-server 工具/READ/JPEG 与 Claude CLI 连接证据成功；人类确认、真实付费 Provider、CachyOS/Termux 仍待验。正在继续最终 Turn/Delegation 与 Skills 容量安全补丁、针对回归和主线集成，尚不记整体完成。

## 最终安全收口、主线集成与交付 — 2026-10-15

- **最终产品 `main` / `origin/main`：`cc5e90eac9e2f9f7f162a7f96aaf41063e128e92`**。必要产品改动先在独立临时任务分支实现、验证，经 fast-forward 集成并推送；没有 main merge 到 plugin/docs。最终 Plugin / origin/plugin 为 **`ce3b558b2bddf5908d626d4a78964d8c97606865`**（主要安全修复 `648043255`、临时测试状态隔离 `c533aec2e`、Runtime/Cognition 全文分页 `ce3b558b2`）。
- 受控聊天：Native pure Turn preflight 固定 Session HEAD、Package contract、已选/候选 Route、slot binding、目标/许可/预算；精确父 Commit Receipt 和唯一用户输入锚定后，复用原 Turn runner。每次发送前重核配置/许可，禁止未知 retry/fallback，抑制未经批准的 VisualWake、Simulation、自动学习。原持久 Evidence 以稳定 commit/invocation claim 阻止 unknown、取消、Host 及独立 Node 重启后重投；不建第二个执行 Store。
- 旧 Orchestrator Delegation：保留原 Browser AgentRuntime，固定 MCP model callback 经原 Native reviewed execute；最初 source/route/config/budget/credential permit 逐次复核，调用/时限/单 effect 边界与原 Compute bank 结算保持。取消只作用于本次原生 operation；未知与丢 ACK 保留 request/operation ID，不自动重发。普通 UI 调用方式保持。
- Skills/Extension：共享 Native staging 增固定 purpose 与 metadata Hash，Package/Archive 消费端拒绝混用。Extension 精确 4 MiB UTF-8、独立 Prepare/Review/禁用 Install；Skills 100 文件、每文件 4 MiB、每 Skill 16 MiB、SKILL.md 512 KiB，合法 16 MiB decoded 内容经约 22 MiB encoded binary transport 后正式安装。候选 metadata/hash、小型 identity guards、完整 inventory/files/diff 分页；正式写入仍原队列 CAS，staged escaped candidate 保留 supporting files，unknown import 不重放。
- 最终容量/隐私修复：超长连续字符串不再触发脱敏 O(n²)；源码审批使用专用有界摘要但 Lease/MRTR 绑定完整输入。JSON metadata fragment 共用 `hex-utf16le` 编码，先整份去敏再分页，任意 secret/placeholder/Unicode surrogate 边界可无损重组。Skill fixed byte observation 无 staging 写入，由 Native 先执行域容量限制；MCP 内部取全有界文件/候选/metadata 后再去敏，原始 Hash 与安全呈现 Hash 分开。Runtime/Cognition 的大型生成结果、资源、Context Preview 和认知单文档也支持完整只读分页，分页参数不进入 Native strict payload。
- 凭据目标产品入口：普通 Connection 编辑器新增独立查看/允许/取消，复用同一 Native CredentialTargetAuthority，Save/Probe 不静默 mint。仅已保存且未变更的配置可授权，绑定三项原生 Fingerprint；本地目标需单独确认，草稿/服务端配置变化使审查失效。权限错误指向该入口，未增加另一套 Secret 或 Provider Runtime。
- **最终组合验证**：在已集成相同代码的独立产品任务树执行 6 suites **37/37**，覆盖实际 StudioService/Package、staging、受控 Turn、原 Delegation、Extension 与 Skills 的真实 HTTP/FS/SQLite/本地 Provider；其中 Turn 8、Delegation 5、Skills 12。组合执行出现测试临时 Session teardown 后的异步 maintenance 告警，未将告警隐去或改成不存在；断言全部通过。另有 ordinary C3 FS/SQLite 24/24、Generation P4 39/39、generic generation 2/2；普通 Connection UI 在真实 Edge 挂载完整 Workspace 与组件/原 Router **4/4**，既有 Runtime P5 **25/25**、凭据权威 **4/4**。
- 回归中的旧 C3 `retryReply` fixture 已迁为 Save→Restore；P5 的旧 Completions endpoint selector 经 Git 基线核实后迁为当前 Service endpoint 标签。两处测试契约漂移均先定位再复测通过，没有恢复已退役 API 或修改产品以迎合过期测试。
- **最终工具验证**：完整 Plugin suite **146/146**（Windows Edge）通过；之后仅 Runtime/Cognition 只读分页增加，相关 **13/13**、共享 JSON 边界 **1/1**、stdio 18-tool/schema **1/1** 单独通过。最终 `npm run check` 检查 64 个 JS，diff check 通过；没有把后续仅针对测试说成又执行了一轮完整 suite。产品本次生产源码和新增文件的 ESLint 已通过；旧 Project Agent 测试 lint 历史问题见前节。
- **最终正式 main 真实隔离联调通过**：`npm run test:atria` 在干净 `D:/Dev/Atria`、HEAD `cc5e90eac` 执行，390 原生路由、READ、28 次确定性测试审批；真正 Studio 大包 **4,200,898 bytes** 经分块/Hash/预检/独立 Review/Install，stale 复用拒绝。生产 Renderer/Editor 在隔离测试页面挂载，Session 与桌面/窄屏 Preview Proof 均 EXACT_CURRENT；本地 semantic 交互、Memory 流程、Save/Restore、Studio/Library/CAS/受审清理通过。Source/Runtime 为 EXACT，重启 STALE、重载 CURRENT；本轮没有执行可选源码改写/另一 revision 实验，先前不同 revision 的证据单独保留，不挪作本轮证据。
- **真实客户端证据范围**：同一 main 联调中 Codex 0.162.1 app-server 实际启动/18 tools/schema/status/discovery/READ/JPEG 通过，协商 2025-06-18；Claude Code 2.1.296 真实 CLI Connected。没有声称 Codex/Claude 真人 Allow/Reject/超时体验、Claude 实际工具/取消、真实付费 Provider 或完整应用 Shell 导航通过。SDK 自动审批、wire/MRTR 和 local Provider 不代替这些外部证据。
- **保留的验收限制**：CachyOS/Termux 无对应设备；MySQL 53306/PostgreSQL 55432 服务不可连接的原生矩阵项未验。旧 Skills 回归 140/141，唯一失败为 Windows 创建文件 symlink 的 EPERM、相关代码断言未执行；新增真实目录 junction 拒绝测试已通过，但不冒充文件 symlink 用例通过。SavePoint 物理单删、HostPlugin 运维激活按冻结的“无安全原生入口不开放”规则维持明确 unsupported；Tasks 扩展可选且未宣告，以 semantic operation 控制替代。
- **资料与工作空间收尾**：本任务 8 个目录的 65 份原始请求/响应、截图、日志，以及两份临时 lint 报告已清理；测试 scratch/dataRoot/临时客户端配置由 finally 清理，后续 smoke Journal 亦已改在 scratch 下。原始材料已不存在，不能再声称可审计或给出失效截图链接；永久证据为本 Record 的真实统计/失败/限制与已提交可复现测试。两个产品临时 worktree、其独立依赖/junction 和本地任务分支已删除；原 turn 分支所有提交经 `git cherry main` 确认 patch-equivalent 已集成。没有清理其它任务的工作树、依赖或 HANDOFF。
- **系统审核限制**：删除用户目录中 5 个旧 smoke Journal namespace 的命令被自动审批审查拒绝，返回仅“blocked by policy”；没有改用回收站规避。该少量记录仅含 Hash/状态/关联 ID，无正文/凭据/资产，继续依现有有界保留/GC 策略留存；不宣称已删除。工作区批量清理亦曾被拒，随后缩小为明确列出的单文件路径、保留正常审核后完成；未关闭或绕过审核。
- **并行协作边界**：main 集成并推送后，前端对话已将产品工作区切至 `refactor/atria-serene-canvas`，并开始修改 app-shell/appearance；其起点包含本次 main 提交。本任务没有切回、覆盖或提交这些修改。docs 的并行 Package/前端/Agent Plan/Record 同样保留，最终只提交本任务 Plan Bundle 与唯一 Record。
