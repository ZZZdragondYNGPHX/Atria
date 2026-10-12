# Atria Agent Intelligence Runtime — S21 续接

2026-10-12 用户明确要求交接提示词，新建对话继续。本轮私有资料精简已完成；交接后暂停开发。整体任务未完成，S21–S34 尚未实施。执行与恢复规则归 [Governance](README.md)，本次暂停不成为下一对话的阶段停止规则。

## 真实工作空间

- Task ID：`agent-intelligence-runtime`。Windows / PowerShell / Asia/Shanghai。
- source：`D:/Dev/Atria-worktrees/tasks/agent-compute-runtime/source`；branch `feat/agent-compute-runtime`，HEAD/origin `96ff4487e2b43384120eb4567636a58e9b994708`，干净。
- docs：`D:/Dev/Atria-worktrees/docs`；branch `docs`，交接前 HEAD/origin `5871804c70525d3692fd4955764fbb7465bd04b2`；本文提交后的 HEAD 以实际 Git 为准。已有未跟踪 `plans/feat/agent-experience-evolution/` 草稿必须保留，不纳入本任务提交。
- main：`D:/Dev/Atria`；HEAD/origin `3ee1332ef113d4c57c65d9577222ba88d5171101`，干净，本轮未合并或部署。
- 没有本轮遗留 API 调用、测试进程、quota 锁、子 agent 或 Codex Goal。其它工作树保留，不清理活跃或用途不明的工作树/分支。

## 恢复顺序与当前任务

先核对真实 Git/status；按需要 fetch 并 ff-only 同步原 feature/docs，保护草稿与无关改动。随后读本文 → [Plan index](plans/architecture/agent-intelligence-runtime/index.md) → [同一 Record 最新 S20 与私有精简两节](records/refactor/agent-intelligence-runtime.md)。旧 S16 交接已过时，不回退进度。

M1/HM1 已集成 main；所选 G06 与 S11–S20 的有限出口已交付，完整 M8/HM2/后续任务不冒称完成。下一 S21 是认知检查、Save/export/rollback 与长期场景/H5：秘密、误会、承诺、关系/遗忘跨回合恢复，原作者/作品授权 inspector 与普通玩家 disclosure 分离，作品可选自主 NPC 只沿原 Simulation/outbox/预算与合法 World Tick。S21 尚无已实施出口，不把清理算作认知验收。

S21 最小设计入口按 [delivery](plans/architecture/agent-intelligence-runtime/delivery.md) 的 S21 / H5 / HM3 路由：

- [architecture](plans/architecture/agent-intelligence-runtime/architecture.md) §6–7（H5 需要时 §5–8）；
- [behavior-context](plans/architecture/agent-intelligence-runtime/behavior-context.md) §2 / §2.1；
- [compute-policy](plans/architecture/agent-intelligence-runtime/compute-policy.md) §2（H5 需要时 §4.1）；
- [baseline](plans/architecture/agent-intelligence-runtime/baseline.md) §4；
- [M3 design](plans/architecture/agent-intelligence-runtime/m3-cognition-design.md)、[S20](plans/architecture/agent-intelligence-runtime/s20-memory-applicability.md)，H5 按需补 [hybrid-memory](plans/architecture/agent-intelligence-runtime/hybrid-memory.md) §5。

先检查原认知、Session/Save、Information 权限、Simulation/Lifecycle 和运行成本持久化实现，定位 S21 当前差距；需要详细 S21 模块时在原 Bundle 补充设计，不建平行 authority。沿原 task branch 与同一 Record 持续实现、最小相关本地验证及必要实际正文验证。已完成且未受变化影响的 M1/HM1/G06/S11–S20 检查不重跑。用户此前已选择“原作者/作品授权”，不重新询问同一权限设计；Session owner/操控 Actor 不自动获得全部 private cognition。

## 私有资料新状态

当前目录是 `D:/Dev/Atria-private`，仅 6 个文件 / 3578 bytes：根 `README.md` 阶段摘要，`Document/` 中 `api-primary.json`、`api-secondary.json`、`api-minimax-temporary.json`、`minimax-subscription-key.json` 和 `m1-api-quota.json`。凭证只私下读取；primary 与最新记录的 endpoint/model 一致。不打印、提交或上传 key/config。

本地 Git `atria.s06.connection` / `atria.s06.secondaryconnection` 已指向此 `Document/`，`atria.private.directory` 同路径；旧 ledger/limits/artifacts 映射已移除。不要恢复旧 `Atria-private-state/Document` 或 `hm1-20261010/Document` 路径。

当前 quota 为 schemaVersion1，carry `{requests:148,at:1791815433800}`、admissions 空。旧本机 1659 条均过期；最新 S20 Record 为 1807 条，差额 148 的时间缺失，在本次导入时一次保守计入窗口，按文件时间 24h 后自动失效。**不要重新导入 148、清零窗口或用永久累计推算剩余额度。** 原 `M1ApiQuota` 已自动压缩过期 entries/carry，仍执行每日 2000 次、20 RPM；retry/judge/必要诊断均计数并排队。

后续私有测试用 source `tests/agent-intelligence/private-test-run.js` 的 `withPrivateTestRun(directory, run)`：共享 quota 排他锁，`run.directory` 为临时 fixture/诊断目录，`run.connection()` 私下读配置；发送前 `await run.quota.waitAvailable(signal)`、`run.quota.admit(uniqueAttemptId)`，实际 retries 分别计数。回调要 await 当前所有操作再退出；成功/失败均清理临时目录，阶段结论归同一 Record。详细保留规则只见 Governance §13.1，不新增永久逐次 raw/normalized/费用账本或自动执行已完成 M1 历史脚本。

用户已明确批准删除旧私有原始资料和三个迁移/备份目录；约 2.12 GB / 57796 个文件已移出工作目录，因自动审批策略拒绝永久删除，转入 Windows 回收站，未永久擦除或释放同等磁盘空间。不要为了续接重新解压、恢复回收站或重建历史副本。远端私有仓库/另一设备未修改；本轮不要求清空回收站。

## 证据与验证边界

历史阶段摘要、失败与费用 unknown 保留在 Record；本机没有另一设备 S16–S20 原始文件，旧已删材料不能再宣称可重审。S18 原完整 normalized 缺失、部分下游本地重放限制依旧成立，不补造证据或重跑历史只为恢复文件。当前历史有限出口不升级为绝对无泄漏/普遍质量或独立长期场景通过。

本轮源码 `96ff4487e`：2 targeted Jest suites / 8 distinct tests PASS（滚动日/分钟限流、排队、历史压缩保留有效用量、临时清理成功/失败、锁与白名单）；lint 的两项 conditional-expect 已修复，仅受影响 2 cases 复测 PASS。4 修改文件 ESLint、syntax/diff 检查通过；实际四份本地配置读取成功、carry148 保持、quota 锁已清理。外部 API 0，不跑全仓 test/build、不合并 main。已 push source/docs；交接文档只做路径/diff/Git 同步验证。

当前用户明确授权并鼓励子 agent 并行：在不发生写入冲突、能降低耗时或改善质量的前提下，主动委派独立分析、实现、测试与审查，无需逐次询问。主 agent 明确每个子任务的文件写入归属、依赖和交付结果，统一集成、提交及共享 API quota；同一文件的依赖修改顺序执行，需并行写入不同 Git 状态时使用隔离工作树。不要同时抢占全程锁定的付费测试 helper。按当前环境并发槽位安排；本交接时环境为主 agent 加最多 3 个子 agent，后续以实际工具能力为准。不为短小或强依赖步骤机械拆分。

Codex Goal 的创建按当前工具定义执行，只有用户明确要求建立 Goal 时创建；子 agent 并行授权不需要依赖 Goal。无新建/迁移工作树需要时复用当前 source/docs。继续已授权工程任务，无需逐阶段重新确认；merge/deploy 的实际范围按当前用户指令和 Governance 核对，不从旧历史记录推导新授权。
