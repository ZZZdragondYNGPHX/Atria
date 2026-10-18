# Documentation Organization

- Task ID: `docs-organization`
- Primary Workspace: `docs`
- Status: complete
- Date: 2026-10-09
- Docs start: `0e08f95f9`
- Main start: `94cf032b5`

## Result

The user requested deletion of the 11 main-workspace historical copies and a broader cleanup of documentation structure. Product usage/developer documentation stays in `main:docs/`; Plans, implementation Records and the live HANDOFF stay in the independent `docs` workspace.

- Removed 15 obsolete or duplicate main Markdown files: ten old Plans, one old HANDOFF, the completed UX backlog/summary, the duplicate extension-retirement inventory and the unreferenced standalone-product policy that conflicted with current governance. Source history remains in Git; current task results already exist in Records.
- Moved the useful Resource Bundle/localization contracts from the miscellaneous `docs/fix/` directory into `docs/development/`. Added developer navigation and a short [main directory map](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/docs/README.md). No parallel governance or new approval process was introduced.
- Removed 118 images not referenced by published documentation. Preserved the 78 published image files byte-for-byte. Consolidated `_screenshots/` into `screenshots/`, moved 33 selected screenshots, updated all three languages and screenshot-writer paths. New non-published QA captures are ignored rather than accumulated in versioned docs.
- Re-homed nine existing UX phase reports under their actual task, `records/fix/native-product-ux-audit/phases/`, with one [Record entrypoint](../fix/native-product-ux-audit.md). Stage results remain unchanged apart from corrected reference destinations; no new archived HANDOFF copies were created.
- Repaired 14 missing site paths/assets and 10 broken relative references in the docs workspace. Existing Plans/Records indexes now provide category navigation and route active work only through the root HANDOFF.
