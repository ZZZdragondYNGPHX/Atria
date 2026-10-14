# Atria MCP 全面补强实施 Record

- Task ID：`plugin/atria-mcp-strengthening`
- Primary Workspace：`plugin:atria-mcp/`
- Plan：[唯一入口](../../plans/plugin/atria-mcp-strengthening/index.md)
- 状态：实施中；当前开工指令授权 E0 后连续开发至整体完成。历史扩展 Record 保留原状。

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
