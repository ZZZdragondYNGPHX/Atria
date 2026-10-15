# Atria Native Orchestration V3 — 设计与实施记录

- Task ID: `refactor/atria-native-orchestration-v3`
- Primary Workspace（未来产品实现）：`main`；当前设计存储：独立 `docs` 工作空间。
- Plan: [index](../../plans/refactor/atria-native-orchestration-v3/index.md) / [decisions](../../plans/refactor/atria-native-orchestration-v3/decisions.md)
- 记录建立：2026-10-15；真实项目进度以 Git/本 Record 与相关 Plan 为准，不凭对话补称测试。

## 2026-10-15 — D1–D3 先前文档历史（从已验证的 Git 提交追溯）

- D1（方案 B）：`docs@8465ee9b5d3ed1cba526352d11f0fe88b9723747`；创建同一 Plan Bundle，静态源审计与研究。无产品代码修改/测试。
- D2（T2 + 旧编排零兼容硬切）：`docs@dad45551b9266e2f8df0b1d254ab62fc84d4ea0b`；更新 Plan 的权威/边界，不保留旧模式或 UI。无产品代码修改/测试。
- D3（G2 有界动态图）：`docs@a23cefda8437f13463400fa83b6e85672bf42211`；新增 graph-control 模块及决策。无产品代码修改/测试。
- 上述为**已有提交的引用**；本 Record 并非在当时创建，不补造当时不存在的测试记录。

## 2026-10-15 — D4 C2 Context/Memory 权限设计冻结

- 起点：`docs@a23cefda8437f13463400fa83b6e85672bf42211`；本阶段只处理 V3 企划，不新建实现分支。
- 用户冻结：C2 Audience-scoped Context；现有 Hybrid Memory 唯一召回；Actor/Source/Time/Branch 先授权再检索、各 Agent 独立编译；Result/SourceRef 重验传播、Narrator/Player Disclosure 独立；长会话压缩带来源、有效性撤销；遵守 HCM-01–08 / D1–D3 / 零兼容硬切。
- 文档变化：[index](../../plans/refactor/atria-native-orchestration-v3/index.md) 路由第五轮，[decisions](../../plans/refactor/atria-native-orchestration-v3/decisions.md) 冻结 D4，[context-sharing](../../plans/refactor/atria-native-orchestration-v3/context-sharing.md) 为 D4 唯一详细模块；D2/D3 文档仅加引用，不重复维护权威细则。
- 同轮代码/验证：未修改 `main` 产品代码，未运行单测、CI、真实模型、UI、真机；仅 GitHub 文档读/更新、变更路径与远端 HEAD 校验。Doc 提交由当前 Git 历史确认为准，不将未执行验证标 PASS。
- 下一阶段：D5 Sparse/Adaptive Invocation、Model Routing、父子并行预算/收费、cache locality 与经有效性证明的 Execution Reuse；仍需讨论选择，暂不冻结。

## 2026-10-15 — D5 F2 自适应计算设计冻结

- 起点：`docs@63dce292937db60e6ea44be8d56d12186f62429e`；本阶段只更新 V3 Plan 与同一永久 Record，未改 `main` 源码。
- 用户冻结 F2：按证据与任务质量选择 Sparse/Adaptive 调用；Native Model Routing 硬约束及合法 Fallback；原 RunControl/Project Compute authority 的父子并行 reservation/charge/settle/unknown 和真实 Attempt 身份；Application Reuse、Provider Prompt Cache、本地推理 KV/Prefix Cache 分离；proof、Reasoning Continuity、质量/延迟/实际成本独立评价。
- 文档变化：`index.md` 新增 D5 模块路由/第六轮入口，`decisions.md` 冻结 D5；新增 `adaptive-compute.md`（D5 的 V3 唯一细则），保留原 Native Compute/Model/Reuse 各自详细权威。
- 本阶段实际检查：阅读 GitHub docs/main 相关源；审查文档路径与引用、创建文档提交并核验远端 Ref 和文件差异。未执行产品 Node 单测、CI、Provider API、用户浏览器、Linux/Windows/Termux 运行。设计达成不构成质量/费用/缓存收益已通过。
- 仍需实施证明：端到端父子并行原子预约、网关未知上游费用边界、Provider/Local Cache 能力、准确 SLO、重启收费恢复等。D6 Tool/Skill/MCP/A2A 权限、审批和危险副作用将在下一轮选择。

## 2026-10-15 — D6 S2 Native Effect Authorization Gate 设计冻结

- Start docs HEAD: `4e209bc9ebd522ab345cf4ccd9375c83602142e9`；`main@2686aa40a00c8bfccdc47c55d2b236b4878b022a` 为本轮静态核对基线（最终重新核实其当前值）；本阶段只改文档。
- 用户明确冻结 S2：Tool/Skill/MCP/A2A discovery 与 Capability Grant 分离，Native Host 基于实际 Effect/风险（R0–R3 逻辑类别）和可信精确审批进行权限准入；Endpoint/SecretRef/Source/Audience/Egress 相互独立保护，Prompt Injection 与 Skill/Plugin 提权被拒；写前 durable EffectIntent、执行结果/未知 EffectReceipt 与原 Native DomainCommit 分层。
- 现有代码/Plan核对：内置 `src/native/mcp-service.js` 主要受限外部读取且进程记录，`a2a-service.js` 具有有限原 RunControl Task identity/reconnect，`skill-invocation.js` 限界文件读取而不赋权；独立 [MCP 补强 Plan](../../plans/plugin/atria-mcp-strengthening/index.md) 负责外部客户端 ActionRegistry/Ceiling/Lease/Journal，不成为 V3 内核或第二业务数据库。
- 更新同一 Plan [index](../../plans/refactor/atria-native-orchestration-v3/index.md) 的 D6 决定/第七轮路由、[decisions](../../plans/refactor/atria-native-orchestration-v3/decisions.md) 的 D6 与新 [effect-authorization](../../plans/refactor/atria-native-orchestration-v3/effect-authorization.md) 详细模块。其余领域合同继续引用原权威，无并行重复维护。
- 实际验证仅 GitHub 静态读、文档结构/链接/差异/refs 核查和远端提交。未更改 `main` 产品代码，也未运行 Node tests/CI、真实付费 Provider 或 MCP/A2A 写调用、可信人工批准、Windows/Linux/Termux 实机/浏览器验收。不存在这些项目已通过的主张。
- Remaining: 具体 schema/风险默认策略的细粒度参数、可信跨端 Approval UI、MCP 新旧协议端侧兼容、沙箱实证及远端 Effect reconciliation 都未实施/实测。下一轮讨论 D7 RP Narrator/Actor/Project Agent/Quality/Creator UX，用户选择前不得冻结。

## 2026-10-15 — D7 N2 分层叙事与条件质量回路设计冻结

- Start docs HEAD：`389730da9bbae4b85d16007007eed2059eddeef9`；本轮核对 main 产品基线为 `2686aa40a00c8bfccdc47c55d2b236b4878b022a`，并未修改任何产品源码。
- 用户选择 N2：原生 RP Narrator/Actor Cognition/Narrative Intent/Character Expression 分层；复杂多角色才按需 Agent 协作；反全知和玩家自主权是优先约束，来源/Display 权限与自然语言质量保证等级分开。Project Agent 保留正式 Task/Workspace/Review/Commit 业务边界，Judge/Review 区分硬正确性与文学质量，并按 D3/F2 做有界局部重做。
- Plan 更新：同一 [index](../../plans/refactor/atria-native-orchestration-v3/index.md) 路由 D8；同一 [decisions](../../plans/refactor/atria-native-orchestration-v3/decisions.md) 冻结 D7；新增 [narrative-project-quality](../../plans/refactor/atria-native-orchestration-v3/narrative-project-quality.md) 管本轮唯一详细设计。
- 实际审计：只读核对当前 main 的 Narrative Contract/旧 Director 选择代码、原 Project Agent 的 human-review-before-formal-commit、docs 的 Behavior/Context、S16 Disclosure、S19 Theory of Mind、M1 Feedback/Evaluation 与 Game Runtime Authority。旧编排清退是未来开发要求，不是本轮已删除。
- 验证范围：仅通过 GitHub 读写/文档静态校验及远端差异/HEAD 核验；没有 Node 测试、CI、真实模型调用、人工盲评、UI 交互或 Windows/Linux/Termux 实机测试，不宣称质量或性能收益。
- 下一步：D8 Graph Editor、Agent/Node/Edge 配置、Run Inspector/Diagnostics、审批与 PC/移动触控/创作体验。D8 未选择前不冻结具体 UI 架构，也不修改 main。

## 2026-10-15 — D8 U2 原生 Graph/Inspector 编辑与 Run UX 设计冻结

- Start docs HEAD：`11592ea33ce8c8e20b29051c679aa39c01b776c2`。本轮只读核对 `main@2686aa40a00c8bfccdc47c55d2b236b4878b022a`；未修改产品代码/没有建立实现分支。
- 用户选择 U2：桌面 Graph Canvas + Inspector 双向编辑同一 PlanDraft，手机 Node/Edge List + Sheet 完整语义等价；强类型 Port/Edge、Draft→Validate→Publish→Run；Host RunProjection、Timeline 默认/Graph 切换、精准 Diagnostics/审批、Serene Canvas 一致性、无障碍与大图/长 Run 性能方向。零旧五模式/兼容路径、T2 单 Host 与 D1–D7/HCM 不变。
- 更新同一 [Plan index](../../plans/refactor/atria-native-orchestration-v3/index.md)、[decisions](../../plans/refactor/atria-native-orchestration-v3/decisions.md)，新增 [graph-editor-experience](../../plans/refactor/atria-native-orchestration-v3/graph-editor-experience.md) 作为 D8 唯一详细设计，并在同一永久 Record 续记。
- 当前代码及既有视觉参考：`main:public/scripts/agents/orchestrator/workspace/orchestration/page.js` 仍耦合历史模式/preset；`public/scripts/lib/agent-workspace/graph-view.js` 为有界 SVG 预览；既有 Atria ESM/DOM/Shell/Primitives/Patterns 与 Cytoscape 依赖并非图编辑 PoC 通过证据。`docs:plans/refactor/atria-serene-canvas/decisions.md` 已冻结温纸工作台、Agents Run Timeline 默认/Graph 切换与手机 Sheet，视觉详细权威仍归原 Serene Canvas。
- 实际验证限 GitHub read、设计/路径/条目核对与远端 docs commit/HEAD/diff；未运行 Node 测试、CI、付费 Provider、真实审批/Browser UI、视觉回归、真实 Windows/Linux/Termux 设备，也未建立正式性能 SLO。
- 后续 D9：E0 接口/消费者审计、彻底清理旧代码、实施分期、故障/权限/质量/性能与三端真实客户端最终收口。D9 尚未冻结、没有执行 main 改动。

## 2026-10-15 — D9 E0 定向审计初步检查点（未冻结）

- 起点：`docs@6c371ff24a9309ca76a3e5e740543993c53b38ff`；期间 docs 另有 2 个合法并发提交推进到 `559ddbb8a60ff2da9cc91587a9a014c5673f14b3`，经 GitHub diff 核对**只涉及 Serene Canvas 方案与原型/Record，没有覆盖 V3 Plan/Record**；本次在最新 HEAD 上安全追加、不强推、不回退其他任务。
- 源码只读基线：`main@2686aa40a00c8bfccdc47c55d2b236b4878b022a`。定向搜索核对 `capability-host.js`/`native/play-generation.js`/`native/experience/llm`/`atria-shell/workspace-host.js` 仍使用旧 Orchestrator；`src/storage/repositories/settings-repo.js` 管理旧 `agentWorkspace`；`src/native/agent-intelligence/evolution-targets.js` 仍导入旧 Workspace Preset/Host Profile 且约束旧 Director，清退不能直接全目录删除。公共 Message Takeover 与 Native 业务服务需保护其其他消费者。
- 同一 Plan 新增 [e0-audit](../../plans/refactor/atria-native-orchestration-v3/e0-audit.md) 记录代码/依赖边界、接口阻塞、完整删除旧编排的候选步骤、原生消费者、P1–P8 候选及故障/安全/质量/三端真实验收；该文件明确标为**非冻结审计草案**，D9 选择尚未发生。
- 本检查点执行的是 GitHub 文件/代码搜索与 docs 文档提交/差异核验。未做所有动态 import 的穷尽验证、API/FS/SQLite/运行时故障复测，未运行 Node/E2E/CI/收费模型/真实人工批准/Windows/Linux/Termux 实机；不宣称 E0 已通过或产品分支实现已开始。
- 阻塞：RunLedger/Effect/Approval/Projection 的真实物理合同、Evolution 与 Session 等消费链迁移、新旧代码全部引用闭包、跨 Store 一致性/预算/外部未知 Effect、Serene Canvas/手机端实体验收都需后续用户 D9 设计决定与实施验证；`main` 完全未修改。

## 2026-10-15 — D9 E1 阶段路线与开发前置设计冻结

- Start docs HEAD：`6d0fa4109d045e7ac683b8a4b7de5b868d2106ff`；产品源审计基线此前为 `main@2686aa40a00c8bfccdc47c55d2b236b4878b022a`。此阶段用户明确选择 **E1：Native Host 内核先行、同一产品任务分阶段验证、最终统一旧编排零兼容硬切**；E0 实际审计/运行验证仍未闭合，本次不创建实现分支、不修改 main。
- 文档范围：同一 [Plan index](../../plans/refactor/atria-native-orchestration-v3/index.md)、[decisions](../../plans/refactor/atria-native-orchestration-v3/decisions.md) 冻结 D9/E1。原 [e0-audit](../../plans/refactor/atria-native-orchestration-v3/e0-audit.md) 保留静态代码/跨域消费者证据并标 E0 未通过；新增 [interface-contracts](../../plans/refactor/atria-native-orchestration-v3/interface-contracts.md) 记录 Plan/Run/Effect/Receipt/Result/Projection 逻辑合同及物理阻塞；新增 [implementation-plan](../../plans/refactor/atria-native-orchestration-v3/implementation-plan.md) 为 E0/P1–P8/W01–W09/开发前置唯一权威，新增 [acceptance-matrix](../../plans/refactor/atria-native-orchestration-v3/acceptance-matrix.md) 为 L0–L4 与三端验证唯一目标。
- 需特别保护的跨域依赖：`capability-host.js`、`native/play-generation.js`、`native/experience/llm`、`atria-shell/workspace-host.js`、`settings-repo.js`、`src/native/agent-intelligence/evolution-targets.js`；保留/替换/删除必须基于可核对消费者、真实 Native 权威及合同，而非仅按文件名或测试目录推断。
- D9 的设计出口 **PASS 仅指书面方案已由用户选择**；E0 完整源码引用/物理 Store/预算/审批/未知远端写入/数据清理/Windows+Linux+Termux 真实环境的实施前置当前保持 **BLOCKED/NOT_RUN**。未运行任何本轮新 V3 Node/CI/E2E、真实模型、人工审批、故障注入、第三方工具或实机测试，不伪称它们通过。
- 下一阶段为**正式开发交接审查**：再次读取远端 refs 与各关键源码/已有 Plan，填补依赖缺口和更细的 Source→Sink/Host Store/Schema/权限清单。只有 E0 完成、相关阻塞解除、开发合同可实现并取得用户新的明确开工要求，才可创建实现分支；当前无此许可。

## 2026-10-15 — D9 正式开发就绪复核：Storage/预算/Evolution 新证据（NOT READY）

- 源码基线：`main@2686aa40a00c8bfccdc47c55d2b236b4878b022a`；D9 设计提交：`docs@c35e4e0c57c7cae4ad6d22499360964ddd6fd47b`。D9 E1 仅为路线冻结；此次继续在 docs 写审计证据。
- **纠正文档/代码差异**：`src/storage/README.md` 对 FS 跨原生资源事务和 SQLite `synchronous=NORMAL` 的旧说法不完全符合当前源码。`src/storage/engines/fs-engine.js + fs-native-journal.js` 现使用 Native committed redo journal，`sqlite-engine.js` 明确 WAL + `synchronous=FULL`。这提供可复用基础，但**没有本次 V3 crash/multiprocess 测试，不能称 V3 Run/Effect durable 原子通过**。
- **明确接口缺口**：原 `RuntimeCheckpointStore` 是 Model/Provider 私有 continuation 而非 Orchestration RunLedger；`NATIVE_RESOURCE_KINDS`/`RESOURCE_KEY_SPECS` 控制物理 keys，FS/SQLite/MySQL/Postgres 并存；`RunControl.chargeCompute/settle` 当前依 Session authority，与原 Project Task bank 的父子统一 reservation 尚无完整 E0 证明。
- **清退风险新增证据**：`EvolutionTargets` 的 Workspace Prompt/Strategy/Director 引用贯穿 catalog/capture/prepare/check/write/discard/evaluationSettings 与原发布/回滚机制，替换要沿原 Experience/Eval 权威保护合法来源，不能删除目录导致未定义 import。旧 Native Game/Shell 等仍有引用；测试需要分域迁移。
- [e0-audit](../../plans/refactor/atria-native-orchestration-v3/e0-audit.md) `7 补充以上现状、证据等级及阻塞，未改 D9 决策/已冻结实施路线。
- **交接结论**：E0 仍 BLOCKED，未建立产品工作分支、未修改 main、未运行新 Node/CI/FS/SQLite crash 注入、真实 Tool/Provider/审批/UI 或 Windows/Linux/Termux 端侧验证。正式建分支须完成源→sink 审计、冻结可实施的物理接口与硬切依赖/原收费，具备真实 L1–L4 计划并取得明确新开工授权。

## 2026-10-15 — E0 全面审计第一组：最新 main 消费者与硬切矩阵

- Start docs：`0d37918c662ad7a979686dcbb13279325e4d43d8`（已有无关 Storage 提交领先 origin/docs 1）；未跟踪 `plans/feat/agent-experience-evolution/` 未纳入本任务。fetch 后 main/origin/main 同为 `60aca695726893e298b7d485f300c6efef3b79fd`，产品工作树 clean，未创建分支。
- 实际执行：全仓 tracked 文本扫描（3,949 文件，3,556 选中文本）；本地 Acorn AST 纯解析（2,886 JS/MJS/CJS，0 parse error，11,053 字面本地边，452 根外直达边含测试，1,152 反向闭包文件）；旧四根 manifest 151 文件。扫描索引、原样动态点与路径行号保存在同一 Bundle 两个 evidence 附件，未 import/执行产品模块。
- 新发现：Evaluation adapter/worker/evaluator fingerprint 真正依赖 Director/Run Store/Skill Resolver；Memory Schema Iteration 真正静态导入旧 envelope helper；generate-task 复用 prepared-context；Skills 的 orch-preset 贯穿 Browser/Host/shared scope、优先级、导入导出、rename/cascade。对应 C01–C18 清退/保留/抽离/替代矩阵与数据边界已写入同一 e0-audit。
- 验证状态：L0 scanner/parser 执行完成（不等同运行 closure PASS）；主路径真实启动、第三方动态安装、V3 FS/SQLite/预算/审批/故障、三端和真实外部服务均 `NOT_RUN/BLOCKED`。没有收费调用或产品测试。下一组继续物理合同与存储/预算/领域 authority，不自动进入开发。

## 2026-10-15 — E0 第二组：物理合同 v1 与可靠性审查

- Start docs：`06bd73b7c`；产品只读基线仍 `main@60aca695726893e298b7d485f300c6efef3b79fd`。未执行产品代码或创建实现分支。
- 已冻结工程细节：5 个专用 Native metadata kinds/有序 key、原 canonical hash、Plan/Run/Attempt/Patch/Join/Effect/Receipt/Approval/Result/Output 字段、状态转换、原 Engine 同事务 CAS、command 幂等、精确 source output slot、Host RPC/long-poll projection、审批 binding 与 GC/备份恢复边界。唯一详细来源为 interface-contracts §6–10，不新增业务服务。
- 新事实：三个 SQL Native handlers 已有 insert-if-absent/UPDATE WHERE integrity 的真正单行 CAS，generic fallback 的非原子推断不能套在其上；FS 同 root queue/ALS 与 Native redo journal 仅有进程内串行证据；Windows directory sync 明确 no-op；migration lock 不是 Host lifetime lock。上述区分均有真实源文件定位，未声称实际故障测试通过。
- 预算缺口明确：当前 reserve 是 required headroom，GenerationHost 内部随机 compute attempt 与 V3 stable effect 尚不能贯通；冻结扩展原 RunControl/Project bank 的 reservation tree、admit/observe/settle，而非第二预算账本。普通 rp_chat 的持久 budget 接入仍 BLOCKED。prepared→原 bank→ready→dispatching→原 receipt 的每个崩溃窗口均有保守出口。
- Approval/安全：原 CredentialTargetAuthority/credentialFetch 有可复用 target pin/DNS/redirect 防线，非 V3 action 批准。明确同源任意代码无法靠 CSRF/isTrusted 隔离，缺可信通道/沙箱的高危效果不准入；MCP/A2A unknown 无状态不重发。
- 已执行的文档校验曾发现首组末行 CRLF 被 git diff --check 视为 trailing whitespace；首组推送发生在诊断后，本组统一本任务文档 LF 并重检修正。没有将该失败记录为 PASS。实际运行/崩溃/可信审批/三端/外部服务仍 NOT_RUN/BLOCKED。

## 2026-10-15 — E0 第三组：E1 工作包与真实客户端验收细化

- Start docs：`050d892b8`；期间另一个任务在同一 docs 工作空间提交 `19b8e5df0` Settings/Theme Bundle（位于本轮第一/二组之间），已核对只涉及其 Plan/索引与 Serene Canvas 决策，无 V3 文件覆盖，完整保留。未触碰未跟踪 Evolution 企划。
- E1 增补：P1–P8 依赖图/物理交付/Gate、W01–W09 authority+输入+产物+前置。P2 只用可控 Port，P3 才接原预算/发送；P4 先替换 Eval/Targets 全生命周期，P6 统一硬切且旧客户端失效，P7 后才可正式集成。沿 Governance 的本地相关验证，不新设等待远端 Actions 的要求。
- 验收增补：CL01–CL12 三端操作步骤/失败判据、V01–V10 原测试 harness 对应与新断言、FS/SQLite 和 MySQL/Pg 状态、可信审批/同源代码边界、私密 projection cursor、性能测量和 evidence 字段。所有新 V3 case 当前 NOT_RUN/BLOCKED，没有将旧测试文件存在记 PASS。
- 实际环境只读检查：Windows 11 Pro 10.0.26200 x64、Node v24.18.0；可定位 wsl.exe/ssh.exe，adb 不在 PATH。没有 CachyOS/Termux 连接/设备版本证据，没有实际 Browser/V3 Host 流程；工具存在不等于三端已准备或通过。
- 同期 authority 对齐：Storage Center 的 kinds/ref/回收根/恢复暂停，Settings/Themes 的原设置保存与主题，不复制服务、不恢复旧编排 subtree/scope。D1–D9/HCM/原 Domain 权威保持。
- 本组实际文档校验：18 份 Bundle/Record 文档、162 个相对链接，缺失 0；151 文件 manifest 与 main tracked 四根逐路径一致（missing/extra 均 0），SHA-256 与附件一致；git diff --check 通过。这些只是文档/路径结果。

## 2026-10-15 — E0 第四组：最终接口一致性与开发就绪结论

- Start docs：`98fa478ee`；最终 fetch 再核对 main/origin/main 仍为 `60aca695726893e298b7d485f300c6efef3b79fd`，产品工作树 clean。没有产品测试/模块执行、实现分支或破坏性操作。
- 最终自审修补：第一版5 kinds缺 source→Plan 选择/发布指针，补入第六个 `atri_orchestration_binding`，严格 sourceSelector/PlanBinding CAS、bindings RPC；Evolution 新 plan-prompt/plan-strategy target pin、原 candidate/publication/rollback saga、Eval worker/fingerprint；Context/Model/Tool/Narrative/Project/Evaluation 六类原Domain Ports。普通RP正式输出必须由原ChatRepo consumer的CAS/operation receipt处理，Browser只显示，不与旧commitAssistant双提交。预算authority及输出consumer缺真实实现证据继续BLOCKED。
- 一致性修补：公开Projection使用独立view seq+opaque cursor，内部eventSeq不直接暴露；6 kinds计数同步当前接口/阶段/验收/入口；D1–D9历史语义完整保留，当前工程细节只在interface-contracts维护。前组记录的5 kinds是当时草案结果，本组以最终6 kinds收束，不改写历史。
- 最终就绪审查位于同一 e0-audit §10：D1–D9/HCM约束逐项核对，R01–R08逐项列出剩余证据、拒绝/恢复出口和负责阶段；交接结论 **NOT READY / E0 BLOCKED / implementation NOT_STARTED and NOT_AUTHORIZED**。不新建HANDOFF，不把未完成运行验证包装为已交付产品。
- 尚缺：真实consumer trace；V3 Store/Host排他/恢复/原预算稳定attempt；普通RP/NativeGame/Project/Evolution的真实DomainReceipt；可信审批/Secret/egress/未知远端；图backend/性能；CachyOS/Termux及Windows真实V3客户端；MySQL/Pg服务。无法在docs-only授权下制造这些实证，全部按NOT_RUN/BLOCKED保留。即使日后E0全部解除，仍等待用户新的明确正式开发授权。
- 最终实际文档检查：18份文档、171个相对链接均可解析；6个物理kind唯一且与当前合同一致；git diff --check通过。151文件manifest此前已核对与未变化的main完全一致，本轮未重复执行产品测试。另一个任务新出现的Settings/Themes未跟踪Record与原Evolution草稿均保留，不纳入本任务提交。

## 2026-10-15 — R01–R08 续审第一组：消除E0/授权循环依赖

- Start docs：`0f9d345e8c0ea841504fdbc4fbdb25fb09339f86`；fetch核对main/origin/main仍`60aca695726893e298b7d485f300c6efef3b79fd`。保护已有Storage Record未提交修改、Evolution未跟踪目录及Settings/Themes未跟踪Record；本任务不纳入这些路径。
- 当前用户明确要求将开发前设计与实施后证据分开。本组修正生效的D9/implementation §2、index/acceptance路由：E0_DESIGN只审实现合同与安全出口；DEVELOPMENT_AUTHORIZATION单独NOT_AUTHORIZED；V3代码/运行trace/crash/真实三端/服务证据留P1–P8，不再要求它们先于实现分支产生。
- 同一e0-audit新增§11逐项分账。R01/R06设计已具备责任/边界/验收路线；R08不是技术阻塞。R02/R03/R04/R05/R07仍有具体设计缺口，本轮继续核实，不靠把标签后移就冒称通过。
- 未执行任何产品模块/测试、网络付费或真机操作；仅源码/文档读取和文档编辑。当前不建实现分支、不修改main、不删除/迁移数据，E0设计就绪也不会自动授权开发。

## 2026-10-15 — R项续审第二组：关闭真正的设计缺口

- Start docs：`e694b9a5a`；只读main基线仍`60aca6957`。本组继续只更新同一Plan与Record，没有产品代码/实现分支。
- R02/R07：冻结原Storage实际root identity +固定loopback独占guard（冲突拒绝、禁止换port绕过）、原HostFence/SQL session Owner与所有原writer fencing；SQL事务仅known-rollback重试，COMMIT未知按稳定command/attempt/domain receipt查询，不重跑有不确定结果的closure。三端/SQL真实行为留P1/P7。
- R03：普通RP预算不再只写“缺bank拒绝”，明确扩展原RunControl的`atri_rp_run_control`及原ChatRepo分配controlId，沿原shared compute、GenerationHost/Route/Secret/Context链；reservation子树不二次计费，真实provider sub-send稳定attempt、原bank幂等admit/observe/settle与unknown占用。
- R04：现有ChatRepo `gen_id`去重不足以证明same-ID same-payload，FS chat不在Native redo kind。确定RPControl writing单permit→原ChatRepo正文/marker同资源CAS→原domain receipt补齐的顺序，禁止跨authority事务/队列嵌套；marker缺失且可能写出时unknown不盲重写。Evolution继续原publication/rollback journal/CAS。
- R05：冻结同一Host的独立Review Origin、复用原用户再认证、独立nonce/安全页面/Origin检查；主origin只summary/launch/reject而不可approve，旧拟`/approvals/decide`不实施。明确cookies不按port隔离；无再认证/可信origin时该批准不可用，不能伪造安全。任意代码/R3仍遵守原policy与默认拒绝，不以拒绝占位替代应实现的Studio批准。
- 当前是六个Orchestration metadata kinds；另两个是原Storage/RunControl authority自己的新增控制kind，不另建服务或资金银行。R01动态边界与R06 UI工程出口在interface §16明确，不靠实际V3 trace/PoC先于开发取得。
- 实际补证仅源码只读：ChatRepo.append/rename、FS chat完整写与Native Journal区别、RunControl Session key、GenerationHost source/attempt、users原密码校验、MySQL/Pg withRetry。外部只读查阅Node v24.18.0、MySQL 8.4、Postgres 17及HTML标准，链接已贴在interface对应协议；首次latest-v24 URL不可用，固定v24.18.0 URL成功，未将外部文档当三端或SQL实测证据。
- e0-audit §11.2逐项记录R01–R07设计核销，R08维持NOT_AUTHORIZED。新增实施负例归acceptance §9；产品case全部NOT_RUN，实际环境缺失仍BLOCKED。最终Gate一致性复核继续下一组。

## 2026-10-15 — R项续审第三组：E0设计正式就绪，授权保持独立

- Start docs：`9b553faea15e9da6ec03bb2e60a72161e898aa74`；最终fetch核对main/origin/main仍`60aca695726893e298b7d485f300c6efef3b79fd`，main工作树clean，原151文件静态manifest的源码基线未变，无需无故重跑同一扫描。
- 完成DG01–DG07设计核对，e0-audit §11.2是当前R项权威，§11.3/§11.4给最终状态/未取得证据。R01–R07已知开发前设计阻塞为0：每项都有原authority、可实施合同/失败出口及负责P阶段，**E0_DESIGN=DESIGN_READY**。§1–10及前轮NOT READY/BLOCKED保留为历史时点，不能再作为当前建分支规则。
- Gate定义仅归implementation §2：E0设计READY + 用户新的明确开发授权 + 当时main相关delta设计核对，才可正式开工。D9、index、工作包、acceptance已同步，不再要求新V3实测/真实consumer trace/三端或SQL服务证据先于开发产生。R08 **NOT_AUTHORIZED**，本轮不请求或推定授权。
- 物理一致性复核补齐：六个编排metadata kinds与两个原Storage/RunControl域控制kind分清；RP selector/controlId、SourceBinding/预算/输出使用同一原身份；主origin不再实现approve；SQL Owner连接独立于业务pool，pool容量1不得死锁；原Chat事务与RPControl事务不嵌套；首次P6切换仍须核实不支持新fence的旧Host已停，guard端口空闲不能代替旧writer清退证据。
- 产品实现/验收仍 **NOT_STARTED / NOT_RUN / NOT_READY**；真实环境证据未取得的CachyOS/Termux、SQL服务、外部Provider/Tool及可信批准配置等对应case保持BLOCKED。P1–P8的可靠性/权限/预算/质量/三端与四Engine最终要求没有降低，也没有把默认拒绝当应支持产品能力的永久占位。
- 本轮只改同一docs Plan/Record，无产品模块执行/测试/付费服务/真机操作，无实现分支、main修改、破坏性操作或独立HANDOFF。已有Storage Record修改、未跟踪Evolution和Settings/Themes材料保留。
- 最终实际文档校验：18份Bundle/Record、168个相对链接无缺失，Bundle内部fragment无失效；E1 Gate图9条边无环且明确E0→AUTH→P1，R01–R08当前表8项齐全（前7项DESIGN_CLOSED、R08 NOT_AUTHORIZED），六个编排kind唯一；git diff --check通过。这些是文档一致性检查，不是产品测试或安全/三端通过证据。

## 2026-10-15 — 正式开发授权与P1启动

- 用户本轮明确授权正式开发并按P1–P8连续推进，最终验收通过后才集成main；R08 AUTHORIZED，不再等待同一开发许可。
- fetch核对最新main/origin/main为`5eb3bc765`；对比E0基线的4个Settings/Themes提交、37文件，原存储/收费/领域权威未改变。Shell/Settings接线使用其最新服务，归P4–P6跟进；扫描附件仍标原SHA。
- 同一任务实现分支`refactor/atria-native-orchestration-v3`从origin/main建立，Start HEAD `5eb3bc765`。没有合入独立docs工作空间，也没有修改main。docs原有Storage提交与Evolution未跟踪企划保护不纳入本任务路径。
- P1 IN_PROGRESS：原Native ID/key注册、Storage Host owner和Plan/Run基础开始实现。未完成Gate不称PASS；SQL真实服务/三端/Provider等仍NOT_RUN/BLOCKED。

## 2026-10-15 — P1第一组：Native kinds、Plan事务与Owner原语

- Start/Tested source：`5eb3bc765` → `a4d7b42e1`，已提交推送同一实现分支，main未改。
- 原Native ID新增oplan/oprev/orun/onode/oattempt/oedge/opatch/oeffect/oreceipt/oapproval/oresult/ocmd/rpctl；六编排kind与两个原Storage/RunControl控制kind及封闭recordType注册，沿原四Engine Native handlers/journal/table/dump。新增纯Graph authoring validator、原canonical hash、不可变publish、Draft/Binding CAS、command去重/冲突及写前integrity检查。原authority adapters必须明确注入，不以fake证明产品权限。
- Storage lifetime Owner原语在原Storage目录实现identity/exclusive loopback guard；真实Windows子进程相斥/强杀后重开通过，未接全站writer/fence/SQL Owner，不能称P1完成。
- 实测：V3两文件按精确`--runTestsByPath`运行，FS/SQLite/真实本地MySQL/Postgres合计37/37通过；相关旧N1 foundation四Engine 4/4与FS↔SQLite roundtrip 1/1通过；定向ESLint与git diff --check通过。SQL负例日志是预期ConflictError，不是真实外部Effect证明。
- 失败及修复：原Pg harness默认账号认证失败、第二次缺默认user也失败；只读本机测试容器配置并采用Postgres默认user/db后通过，无凭证写入或输出。一次短Jest筛选误匹配本任务工作树绝对路径导致范围扩大，已终止；改精确文件路径后重测，未将中断测试算PASS。后续只用精确路径。
- P1仍IN_PROGRESS：RunLedger/恢复、全站Owner/fence/SQL commit unknown、RPC/授权/GC等未齐；审批/预算/消费者/UI/旧硬切/三端仍NOT_RUN，未开放新旧可选择产品入口。继续同一分支推进，不等待阶段许可。

## 2026-10-15 — P1第二组：原Storage生命周期、SQL未知与真实Host

- Start/Tested source：`a4d7b42e1` → `1d0e9e220`，同一实现分支已提交推送，main未集成。
- 原Storage启动于user-storage/migration前持data-root guard，再持实际用户root guard；四Engine事务共用持久HostFence，嵌套事务沿同一scope，已结束tx引用不可再写。原SQL Engine用独立session连接持GET_LOCK/pg advisory lock，不占业务pool；关闭先停止准入、drain原事务、关闭Engine后释放Owner。owner失效不可原地换连接继续旧权限。
- SQL原withTransaction改为known-rollback-only；COMMIT ACK丢失返回storage_commit_unknown，不因网络错误重跑closure。原迁移/恢复不复制或清除目标HostFence；新V3元数据沿原备份。
- 实测：Host lifecycle四Engine 20/20（原写事务、scope、丢失Owner回滚、第二Host、不同root同DB、重开generation、poolSize1）；SQL传输故障double 6/6（不冒充真实服务器断网）；installed Windows Host全新临时dataRoot启动/第二HTTP端口拒绝1/1。启动测试原计时器退出警告已修复复测消失。
- 相关回归：Settings endpoint四Engine 68/68，retry14/14，initStorage9/9，Native backup8/8；本组定向ESLint及git diff --check通过。具体case均精确--runTestsByPath执行，没有全量测试或收费Provider。
- 失败诊断：初版wrapper改成同步throw破坏原async拒绝合同，已恢复async并复测；backup fixture推测ID family不支持新key，且原Session子目录未递归rebind/FS暂存跨realm严格比较误报，修复后四条FS/SQLite互转与损坏blob/原闭包保护通过。目标fence不作为用户导入数据。
- 尚未取得：真实SQL连接突然丢失/COMMIT网断的完整故障窗口、Linux/Termux Owner、本地共享/网络文件系统排除、V3 RunLedger/恢复/RPC/GC。P1 IN_PROGRESS；产品审批/预算/Domain消费者/新UI/零兼容硬切仍未完成。继续RunLedger，不以本组通过冒称P1或最终产品通过。

## 2026-10-15 — P1第三组：RunLedger、Attempt与保守恢复

- Start source：`1d0e9e220`。完成RunRoot/事件/command同事务、稳定命令重放/冲突、source digest/不可变Plan引用校验、pending NodeAttempt身份保留与上限、取消CAS/epoch、重开Host后旧boot拒绝与blocked/reconciling恢复。只保存原budget authority引用，无V3资金账本/退款推断；原domain admission仍测试double，未接真实发送。
- 修正Draft工程细节：save允许未完成图，纯Validate报告invalid，Publish不能绕过；严格未知field/policy仍拒绝。PlanRoot/Revision新增严格持久对象校验，Plan/Run命令服从原read-only mode。
- 实测：最新Plan/Run两文件四Engine合计57/57通过；其中FS Native Journal四窗口prepare/publish/install/ack注入验证Root/Event/command不会分裂且重放只创建一个Run（软件异常注入，不冒充真实kill/断电）。12个非FS的FS特有case明确skip/N/A，不是SQL故障通过；SQL真实断网仍NOT_RUN。定向ESLint、git diff --check通过。
- P1仍IN_PROGRESS：HTTP/auth/boot/分页、原依赖解析与引用/GC、真实source admission在对应阶段继续；P2–P8尚未完成，未删除旧生产路径、未发布新旧双执行入口、未集成main。

## 2026-10-15 — P1第四组：Authoring RPC与原依赖删除保护

- Source：第三组结果`0dfa7bfc8`已推送；本组`a1a6e4da7`已提交推送，同一分支/main仍未集成。
- 接入原认证+CSRF后的/api/native/orchestration，只提供真实Plan create/save/get/list/revisions/validate/publish；严格envelope/command/boot header、owner从认证读取、no-store、read-only、无任意方法dispatch或主origin approve。Run/Effect发送未挂生产入口。分页cursor作用域绑定owner/kind/plan，单次limit有界。
- 纯依赖检查复用原VersionedJsonResourceHandler/NativeModelPromptPersistence读取exact Prompt/Route；不调用Provider/Tool/Secret。未接的capability/source/tool authority返回unknown/拒绝publish，不将临时未接线当最终功能完成。原Runtime write authority提取为同一可重入锁供Plan发布和原删除共用；原Prompt/Route/candidate删除读取派生的Plan pins，保留引用，不新建GC服务。原ResourceGraph删除诊断接同一refs adapter。
- 实测：authoring HTTP四Engine16/16；原Prompt presets5/5、candidates20/20；真实Windows installed Host的原CSRF拒绝无token、合法会话获取boot并创建Native Plan、第二Host拒绝复测1/1。定向ESLint/git diff --check通过。主origin未注册approve/effect/graph/runstart路由是当前P1接线范围，不代表P3–P5应支持的能力已完成。
- P1仍IN_PROGRESS：还需批量delete/restore等原Engine管理路径在SQL Owner丢失时完整fence、网络/共享root排除、软件kill与恢复/未知Effect/GC保留根更完整覆盖；P2 graph/effect、P3实际预算/Ports、P4消费者、P5UI、P6硬切及P7三端均未通过。当前只有Windows真实Host+HTTP证据，没有真实Browser Graph、CachyOS/Termux或外部模型/批准证明。

## 2026-10-15 — P1第五组：原批量存储、恢复隔离与实际终止故障

- Source `a1a6e4da7` → `0d4e062d7`，已提交推送。原SQL deleteUser/restoreUser接原Engine同fence管理事务，恢复清空与流导入原子，never重试已消耗stream；目标HostFence保留。失败回滚得到确认时保留仍有效Owner，COMMIT未知继续fail-closed。原cross-mode restore之后退休旧handle generation。
- 修复同boot恢复隐患：RunRoot.hostGeneration与epoch分开保存/比较，恢复同Host也须blocked recovery；原root identity在持有时改变即失效，不换port绕过。Windows DriveInfo/UNC拒绝、Linux/Android本地FS分支已编码，后两端尚未实测，不宣称通过。
- 新实证：MySQL/Pg分别只终止本测试DB持advisory lock的Owner session，旧Host拒写、新Owner读到原已提交记录，2/2；Windows真实进程kill的FS prepare/publish/install/ack与SQLite commit前后，6/6，Root/Event/command完整或全无，恢复不调用admit/send且blocked。不是硬件断电或COMMIT网络ACK丢失证明。
- 本组测试：SQL原批量事务6/6；最新Run/SQL commit double合计38/38（另12项非FS的FS专属case N/A skip）；相关四Engine lifetime/metadata、Native backup、MySQL/Pg各方向roundtrip五文件78/78；定向ESLint/diff check通过。测试只用隔离临时数据，没有付费Provider。
- P1保留完整Gate未过项；预算/发送/审批/Domain收据留P2–P4实现，三端/安全/质量最终证据留P7。已验证Host/Ledger允许继续P2纯控制流子工作，不提前记作完整P1/P2通过；原生产入口硬切仍等P6统一执行。

## 2026-10-15 — P2第一组：Host原子GraphPatch子工作

- 基于`0d4e062d7`继续同一实现分支；P1完整Gate仍未标PASS，仅依赖已验证Host/持久Ledger开展P2安全子工作。没有真实Provider/Tool发送或生产Run入口。
- 新增受信内部control事务、pending Attempt激活、G2整批提案校验/immutable receipt/稳定command去重。Root新增nodeControl及持久edgeVisitCounts；Host身份/authority/原Plan ceiling/output/limits不得改写。禁止向已有Attempt新增输入边，拒绝删除唯一Output路径/能力提升/无证据重复提案，取消pending分支保留原Attempt。
- 最新四Engine GraphPatch20/20；受影响Run及真实FS/SQLite process-crash回归，共三个文件58/58，12项非FS的FS特有case明确N/A skip；定向ESLint/diff check通过。所有授权/模型/预算Port仍是受控test double，不称原Domain集成通过。
- 下一子工作为EffectIntent/Approval/单次dispatch claim/append-only Receipt与unknown恢复，随后继续原Native Ports。完整P2、P3–P8及三端/真实批准/成本质量均未验收，main未集成。

## 2026-10-15 — P2第二组：Effect/Approval持久核心

- 基于`44e468d4f`继续同一分支。实现prepared→原bank引用校验→ready→单次claim、nonce hash/原身份Port决策、批准消费与dispatching同事务、append-only Receipt、unknown不重发、矛盾证据保留、取消与迟到观察、未消费批准失效。没有注册生产Effect/approve/Run执行入口。
- 必填authorizeEffect/verifyBudgetAttempt/verifyObservation/verifyApproval和Review身份Port，未设默认允许；V3不实现资金账本、账号表、Secret服务或业务writer。Intent与Receipt只存原authority引用/指纹。相同Effect claim重放不返回token；已经提交但本地丢失ACK时不得再次发送。
- 四Engine受控Port核心测试最新40/40通过；受影响Run回归32/32通过（另12个非FS的FS专用窗口N/A）。本地遮蔽已提交ACK的测试证明kernel回执重放语义，不冒充真实COMMIT网络断线。定向ESLint/diff check通过。原生预算、Provider/MCP/A2A、真实账户再认证/Review Origin/Browser隔离和实际三端均未由这些double验证。
- P2仍IN_PROGRESS：还需Join/Delegate/Handoff/循环/局部重做、恢复/reconcile以及真实原Scheduler permits；P1仍需核对维护CLI/raw Engine入口和未知SQL proxy/multi-primary配置的拒绝边界，防止把标准直连DB实测推广到未支持拓扑。P3–P8未完成，最终验收NOT_READY，main未集成。
