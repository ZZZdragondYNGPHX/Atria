# Records

## Directory map

| Category | Records |
| --- | --- |
| Features | [Features](feat/README.md) |
| Fixes | [Fixes](fix/README.md) |
| Refactors | [Refactors](refactor/README.md) |
| Architecture | [Native Package Runtime](architecture/native-package-runtime.md); [Dynamic World Evolution & Consistency](architecture/world-evolution-consistency.md) (WP-A–F 已集成) |
| Packages | [Packages](package/README.md) |
| Tools | [Plugins](plugin/README.md) |

These files record what happened. Current work uses actual Git state and the relevant [Plan](../plans/README.md); user-requested interruption snapshots follow [Governance §7](../README.md#7-handoff). Historical phase instructions are not current rules.

历史测试数量、完整验收、hash 记录、跨环境实验、复审和旧对话指令仅说明当时发生过什么，不是可复制执行的清单。后续工作只遵循 [Governance §12.2](../README.md#122-minimal-validation-and-runtime-checks)。记录中的旧分支、标签和 `package:<源码路径>` 可能已撤销；当前远端范围见 [Governance §2](../README.md#2-branch-model)，源码路径仅作本地历史定位。

Records are permanent implementation history.

Use task-ownership categories such as `feat/`, `fix/`, `refactor/`, `package/`, and `plugin/`.

- A completed formal task has one Record.
- Small one-pass work may write it once at completion.
- Multi-stage work updates the same Record after every completed stage; do not reconstruct early stages from memory.
- Final completion may normalize the accumulated Record, but must not discard useful stage history.

Existing `legacy-handoffs/` directories are retained only as pre-Governance-1.1 historical evidence. Do not create new archived handoff files. Live recovery state belongs only in root `HANDOFF.md`; durable facts belong in the task Record.
