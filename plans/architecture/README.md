# architecture

> 执行规则入口：[Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

Repository-level architecture and migration Plans. Keep compact designs single-file; use a routed Plan Bundle when stage-specific loading becomes necessary.

## Current entrypoints

- [Dynamic World Evolution & Consistency](world-evolution-consistency/index.md) — WP-A–F 已集成 main；后续设计和未提交扩展按实际本地状态判断，不恢复旧暂停交接。
- [Repository migration](repository-standardization-migration.md) — 已完成的历史迁移，不重建已删除分支。
