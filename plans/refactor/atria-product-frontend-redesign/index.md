# Atria Product Frontend Redesign — Plan Index

> 执行规则入口：[Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

- Task ID: `refactor/atria-product-frontend-redesign`
- Primary Workspace: `main`

## Goal

Redesign the full Atria product frontend while preserving product/runtime authority and behavior boundaries.

## Module map

| Module | Authority | Depends on |
| --- | --- | --- |
| `audit.md` | Product topology audit, redesign coverage, protected behavior/architecture boundaries | — |
| `DESIGN.md` | Approved visual and interaction design specification | `audit.md` |

## Stage routing

This task is complete.

For future UI work:
- read `index.md` then `DESIGN.md` for visual-system authority;
- add `audit.md` only when old/new product topology or a protected behavior/runtime boundary matters;

## Material routing/design changes

- **2026-09-30 — Plan Bundle normalization:** the sibling audit file and design directory were normalized behind one `index.md`; phase execution remains in Records.
