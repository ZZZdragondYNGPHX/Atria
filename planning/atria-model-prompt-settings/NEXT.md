# NEXT: P8 — Hard Cut / Integration / Freeze

P0-P7 complete. Stop until explicit user continuation.

- Work branch: `refactor/atria-model-prompt-settings`
- Main unchanged: `2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`
- P7 validated/pushed HEAD: `bde2fbc1ed58bc8f9a915dc7c2e72c210917c245`
- Read P7-VALIDATION.md and prior P2-P6 evidence before final integration.

## Next-session prompt

Continue Atria Model / Prompt / Runtime Native Refactor P8 only, on the existing
work branch. Fetch work branch/main/docs and preserve newer work. Read current
main:AGENTS.md, main:FORK_MAINTENANCE.md, docs:handoff/latest-handoff.md, refactor
outline, planning DESIGN/IMPLEMENTATION and P7-VALIDATION.md. Do not redo P0-P7 or
create another task branch. Diagnose current code and history, not stale docs.

P8 scope per IMPLEMENTATION.md:
- Final architecture/first-party residual guard, exact dependency graph,
  no dual-write and no hidden fallback verification.
- Audit/remove bridges that existed only for migration; update API/runtime docs.
- Full relevant unit/regression, root lint, frontend build, applicable A0-A9 / N0-N10
  guards and complete P0-P8 guards; real-host browser acceptance.
- Review branch diff, PR and merge readiness. Integrate main only after P8 acceptance
  and according to the repository lifecycle; do not call readiness a completed merge.

Allowed explicit host islands remain mature provider sender/tokenizer, existing
Secret Store adapter, non-Native ST chat, third-party compatibility and shell/bootstrap.
The objective is to remove legacy authority from Native Core, not to delete every
SillyTavern implementation. Retain primary Build and A1/A2/A7/A8 human authority.

P7 specifics to preserve:
- Settings uses a preference whitelist, not a reparented unfiltered User Settings
  drawer. Original controls/events/persistence restore on unmount.
- Studio Package Metadata does not promote package.presets; persisted old source
  fields are preserved rather than implicitly migrated or dual-written.
- Search commands carry exact scope/ID/revision, refresh on Command open and focus
  the Library-owned resource; missing revision never follows latest.
- Legacy preset UI reads live only in generation-compat and are disabled for a
  Native Session OR mounted Native Shell (including an empty Shell). Execution's
  explicit non-Native compatibility path remains separate.
- P5/P6 localization translates UI chrome, never resource names/IDs/JSON.
- P6 Package freeze/scoped Graph and P4 Secret/send/fallback/request isolation remain.

Frontend changes require local servers and actual Playwright desktop/mobile
interaction, screenshots, visual review, fixes and recapture. P7 fixed same-section
exact deep links, internal preference labels and Chinese stage labels. Test commands
and actual counts are in P7-VALIDATION.md: final regression 210/1837, P4-P7 combined
browser 12 passed, final P4/P7 follow-up 6 passed (overlapping).

Android/Docker remain opt-in. MySQL/PostgreSQL services, external model credentials
and real mobile hardware were not tested. The separate P6 storage extension has
four Windows SQLite failures reproduced on unchanged P5, not fixed or rerun in P7.
Temporary ignored P5 baseline worktree may remain under tests/.e2e-scratch/p6-baseline;
exclude it from Jest discovery (exact command in P7-VALIDATION.md). P6/P7 browser
fixtures stub optional Horde discovery only; Native endpoints stay real. No cold
frontend compile was claimed for P7's prebuild-cache hit.

Update/push docs with actual final evidence, commit/PR/integration status, limitations
and the next handoff. Never mark P8/integration complete until all required work is done.
