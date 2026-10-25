# Native workspace loading and prompt module refresh

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

Date: 2026-09-25. Baseline: main `e42bd5043939af90583b473c22b68c4b57ca0aaf`.
Task branch: `fix/native-workspace-loading`. Implementation: `32f9b539c95f130340725e88e6c840bda3edc3c9`.

## Changes

- Runtime lists render from configuration without waiting for the complete exact-resource inventory. Route editors fetch that inventory when opened;
- Versioned JSON inventory groups revisions from one scan instead of rescanning all revision documents for each root.
- Build list requests metadata summaries.
- Prompt preset mutations repaint from the committed server snapshot concurrently with dependent configuration observers. Moving a module immediately updates category filtering. Per-edit full global search rebuilds were removed; search still refreshes when opened.
