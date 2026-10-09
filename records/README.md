# Records

## Directory map

| Category | Records |
| --- | --- |
| Features | [Features](feat/README.md) |
| Fixes | [Fixes](fix/README.md) |
| Refactors | [Refactors](refactor/README.md) |
| Architecture | [Native Package Runtime](architecture/native-package-runtime.md) |
| Packages | [Packages](package/README.md) |
| Tools | [Plugins](plugin/README.md) |

These files record what happened. Current work uses actual Git state and the relevant [Plan](../plans/README.md); user-requested interruption snapshots follow [Governance §7](../README.md#7-handoff). Historical phase instructions are not current rules.


Records are permanent implementation history.

Use task-ownership categories such as `feat/`, `fix/`, `refactor/`, `package/`, and `plugin/`.

- A completed formal task has one Record.
- Small one-pass work may write it once at completion.
- Multi-stage work updates the same Record after every completed stage; do not reconstruct early stages from memory.
- Stage entries normally preserve start/end HEADs, completed work, key decisions, actual validation/CI, known limitations and the next trusted checkpoint.
- Final completion may normalize the accumulated Record, but must not discard useful stage history.

Existing `legacy-handoffs/` directories are retained only as pre-Governance-1.1 historical evidence. Do not create new archived handoff files. Live recovery state belongs only in root `HANDOFF.md`; durable facts belong in the task Record.
