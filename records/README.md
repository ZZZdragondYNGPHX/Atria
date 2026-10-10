# Records

> 本分支保存设计编辑副本；正式执行、验证、配额与恢复只归 `docs` 分支，不从本分支历史内容恢复许可或停止要求。

These files record historical facts. Current execution rules belong to [Governance](https://github.com/ZZZdragondYNGPHX/Atria/blob/docs/README.md).

Records are permanent implementation history.

Use task-ownership categories such as `feat/`, `fix/`, `refactor/`, `package/`, and `plugin/`.

- A completed formal task has one Record.
- Small one-pass work may write it once at completion.
- Multi-stage work updates the same Record after every completed stage; do not reconstruct early stages from memory.
- Stage entries normally preserve start/end HEADs, completed work, key decisions, actual validation/CI, known limitations and the next trusted checkpoint.
- Final completion may normalize the accumulated Record, but must not discard useful stage history.

Existing `legacy-handoffs/` directories are retained only as pre-Governance-1.1 historical evidence. Do not create new archived handoff files. Live recovery state belongs only in root `HANDOFF.md`; durable facts belong in the task Record.
