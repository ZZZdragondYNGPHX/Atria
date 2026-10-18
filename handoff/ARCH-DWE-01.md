# ARCH-DWE-01 · Paused World / Knowledge Reconstruction — Codex Handoff

- **状态**：**PAUSED / Draft**（用户 2026-10-17 主动要求暂缓）。**不要自行恢复 Preflight、创建实现分支或修改任何产品代码**。
- **触发恢复的明确条件**：用户完成排队的 **Atria Native Orchestration V3 重构、Prompt Preset 重构及整体前端重构**，再由用户**主动指示 Codex 接手 ARCH-DWE-01**。不以过期分支名称或猜测的 CI 状态判断“已经完成”。没有自动监控、周期通知或后台工作。
- **唯一权威文档**：[Plan Index](../plans/architecture/world-evolution-consistency/index.md) · [累计 Design](../plans/architecture/world-evolution-consistency/design.md) · [Gate 0 Preflight](../plans/architecture/world-evolution-consistency/e0-preflight-execution.md) · [唯一 Record](../records/architecture/world-evolution-consistency.md)。本文件仅为用户明确暂停时的**恢复交接**，不是第二 Plan/Record。
- **仓库**：`https://github.com/ZZZdragondYNGPHX/Atria`；当前工作空间为独立长期 `docs` 分支。

## 当前已完成 / 已获方向性确认

- W1-B～W22-B **总体架构与证据门槛收口方法**已获用户逐轮确认；最后选择为 **W22-B：具名阻塞 + 可执行 Preflight + 条件化开发交接**。此状态**不等于**整份 Plan Final/Approved、开发授权或 ABI 已冻结。
- 从旧 ST World Book 概念转为原生 World Model + Source Library、分层自由文本/结构化事实、事件驱动涌现实体与自主 NPC、客观世界与个人 Cognition/HCM 事实分离、Canonical World Subject + 类型化 Participant/Perspective、Native Domain 独占世界真实提交/History/Branch/Receipt、有效世界只读视图/Claim-aware Context。
- **P2 物理方案优先**：在既有 Native SessionRevision 的受保护 `sessionState` 中存最小正式 Subject 身份/Origin/Scope；原 Domain 继续拥有金币、债务、关系、生命与时态来源。候选 P1 仅在有安全/成本证据时讨论替代，不能两者并行当世界写权。
- WP-A～F 六个工作包的归属/顺序已在 Plan 中拟定：Native Domain、Identity/History/Save、Perspective/HCM、EffectiveWorld/Context/Prompt、Timeline/Media/Play、Library/Studio/Legacy。
- **并未完成全部 Preflight**。

## 本次静态审查的历史 SHA（未来必须刷新）

| 分支 | 暂停前最近核实的 SHA |
| --- | --- |
| `main` | `c57fada6edeea255b29d857ba2585c1dbc9c098b` |
| `refactor/atria-native-orchestration-v3` | `a7cb649d0cd12cdaf7d7e91e96e654ba6261fea9` |
| `refactor/atria-native-prompt-preset-deepening` | `760327891149216dffdc1e3fa0c846496007a013` |
| `feat/native-visual-generation-deepening` | `ae587be0c64487ba922528bdd0146444bcf5e92e` |
| `docs` | 交接创建时持续写入，恢复时应读取 GitHub 的实时 HEAD |

**整体前端重构**当下未确认分支或 HEAD，不得猜测；恢复时读取当前 repo/用户明确指定的对应实现。

## 用户将来明确恢复时，Codex 的接手顺序

1. 读取 `docs` 的 Plan Index、最新 Design、[Preflight](../plans/architecture/world-evolution-consistency/e0-preflight-execution.md) 和唯一 Record，遵守当前仓库级及当前会话开发规范；此次中断之前的静态 SHA 只作历史参照。
2. 核实排队三项重构的**实际完成/集成情况**和目标 HEAD。优先以已经合并后的最新 `main` 为基础；若仍有并行分支，核查真实差异/接口 Owner，避免交叉修改同一编排/Prompt/Frontend 公共契约。
4. 完成 P2 的最小合法 Typed 原生主体持久化设计、Domain Effect/Receipt 与事实/历史双锚读取、非 Manifest NPC Perspective + Context/Prompt 权限、Frontend/Media/Studio/Play 消费者切线；明确哪些问题可在实现中常规决定，哪些仍是真正阻塞。
5. 每阶段审查只更新**同一** Plan Bundle 与**唯一** Record。**最终是否定稿与授权开发应由用户明确决定**。未经授权继续 Draft、不建立实现分支、不修改 `main`。
6. 一旦用户以后明确授权正式实施，按照届时项目 GitHub Governance 在一个合适临时分支推进 WP-A～F，必要时更新 docs/Record，避免旧数据兼容双写；

## 恢复时可复制的英文任务提示词（默认只读）

```text
Resume Atria ARCH-DWE-01 from its PAUSED Draft state in the docs branch.
Read the existing Plan index, cumulative Design, sole Record,
and handoff/ARCH-DWE-01.md. The user has completed the queued Native
Orchestration, Prompt Preset and frontend refactors and is now asking
Codex to take over the remaining Gate 0 preflight.

Refresh actual HEADs and production entrypoints; never rely on old
historical SHAs. Audit P0-P7 from the existing Preflight file with
file/function-level source evidence, paying special attention to P2
protected Session Subject, Native Domain Receipt vs orchestration,
temporal facts, dynamic Perspective, Context/Prompt and real frontend
consumers. Keep unresolved gates explicitly BLOCKED.

Update the SAME docs Plan and sole Record. Do not invent passing tests,
create another Plan, or delete legacy paths without real consumer evidence.
Keep the Plan Draft. Do not modify product code or create an implementation
branch unless the user separately authorizes final approval and execution.
```

**中断声明**：用户目前要先完成排队重构，本任务停止主动审计；不得自动继续或在用户未授权时标记 E0/Final/正式开发成功。
