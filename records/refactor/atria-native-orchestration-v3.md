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
