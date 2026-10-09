# Documentation Organization

- Task ID: `docs-organization`
- Primary Workspace: `docs`
- Status: complete
- Date: 2026-10-09
- Docs start: `0e08f95f9`
- Main start: `94cf032b5`
- Main implementation / verified: `a0753e6ae` → `f40824a93`, fast-forward integrated and pushed to main.

## Result

The user requested deletion of the 11 main-workspace historical copies and a broader cleanup of documentation structure. Product usage/developer documentation stays in `main:docs/`; Plans, implementation Records and the live HANDOFF stay in the independent `docs` workspace.

- Removed 15 obsolete or duplicate main Markdown files: ten old Plans, one old HANDOFF, the completed UX backlog/summary, the duplicate extension-retirement inventory and the unreferenced standalone-product policy that conflicted with current governance. Source history remains in Git; current task results already exist in Records.
- Moved the useful Resource Bundle/localization contracts from the miscellaneous `docs/fix/` directory into `docs/development/`. Added developer navigation and a short [main directory map](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/docs/README.md). No parallel governance or new approval process was introduced.
- Removed 118 images not referenced by published documentation. Preserved the 78 published image files byte-for-byte. Consolidated `_screenshots/` into `screenshots/`, moved 33 selected screenshots, updated all three languages and screenshot-writer paths. New non-published QA captures are ignored rather than accumulated in versioned docs.
- Re-homed nine existing UX phase reports under their actual task, `records/fix/native-product-ux-audit/phases/`, with one [Record entrypoint](../fix/native-product-ux-audit.md). Stage results remain unchanged apart from corrected reference destinations; no new archived HANDOFF copies were created.
- Repaired 14 missing site paths/assets and 10 broken relative references in the docs workspace. Existing Plans/Records indexes now provide category navigation and route active work only through the root HANDOFF.

## Validation actually executed

- Main documentation: 1369 local path references checked, no missing targets; all 78 retained published images matched the original Git bytes.
- Built VitePress pages: 297 image/diagram references checked with no missing built files; 56 diagrams rendered. `npm exec -- vitepress build` from docs passed, and the final site/navigation version passed `npm exec --prefix docs -- vitepress build docs`.
- Changed screenshot writers: 18 files passed `node --check`; byte comparisons proved the only source edits were `_screenshots` → `screenshots` path replacements.
- Independent docs workspace: all existing Markdown relative targets and 75 local anchor links passed; nine moved phase reports matched their old content after the three intended link substitutions.
- Ordinary/staged `git diff --check` passed. Temporary root-level diagram cache from the root-cwd build was removed only after confirming its files matched the build output and were not tracked.

No model API test, application browser E2E, Android/device, full product test suite or product build was executed for this documentation-only change. Generated site assets and dependency caches were not committed. Untracked `plans/feat/agent-experience-evolution/` and the older docs worktree's five unrelated CRLF changes remain untouched. The active Agent Intelligence F2 task/branch, private accounting and its phase boundary are unchanged; its root HANDOFF only receives the new stable main documentation HEAD.
