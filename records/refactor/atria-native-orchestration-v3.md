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
