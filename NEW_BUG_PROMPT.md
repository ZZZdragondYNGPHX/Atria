# Atria Bug Task Prompt

Use this as a reusable handoff for a new Atria bug.

Repository: `ZZZdragondYNGPHX/Atria`

1. Read current `main:AGENTS.md` and `main:FORK_MAINTENANCE.md`.
2. Read `docs:handoff/latest-handoff.md`.
3. Verify the live `main` HEAD and create a fresh `fix/<short-name>` branch from it.
4. Reproduce or establish the failure path and identify root cause before editing.
5. Inspect existing Atria behavior and tests in the affected subsystem.
6. Consult `vanilla` only if SillyTavern upstream comparison is useful; consult `luker` only for legacy/migration context.
7. Make the smallest compatible fix, preserving unrelated behavior and persisted formats.
8. Run relevant targeted checks and broader lint/unit/build checks appropriate to the change.
9. Record the completed fix in the `docs` branch.
10. Merge the verified fix into `main`, verify integration, then delete the temporary branch.

Final report should include baseline SHA, branch, root cause, changed areas, checks actually run, result/PR/commit, compatibility or migration impact, and any follow-up.
