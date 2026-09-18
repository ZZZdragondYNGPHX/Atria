# Atria Feature Task Prompt

Use this as a reusable handoff for a new Atria feature.

Repository: `ZZZdragondYNGPHX/Atria`

1. Read current `main:AGENTS.md` and `main:FORK_MAINTENANCE.md`.
2. Read `docs:handoff/latest-handoff.md`.
3. Verify the live `main` HEAD and create a fresh `feat/<short-name>` branch.
4. Inspect the owning module, state/service/API/UI/persistence path, relevant tests, and existing Atria-specific behavior before coding.
5. Reuse existing architecture rather than creating duplicate subsystems.
6. Consult `vanilla` only when SillyTavern upstream behavior is relevant; consult `luker` only for legacy/migration context.
7. New Atria-owned modules should prefer concise `atri_*` naming where practical.
8. Preserve existing data/config compatibility unless a migration is deliberately designed.
9. Run targeted checks followed by lint/unit/build/regression checks appropriate to the feature.
10. Record the completed implementation and durable decisions in the `docs` branch.
11. Merge the verified branch into `main`, verify integration, then delete the temporary branch.

Final report should include baseline SHA, feature branch, architecture owner, implementation summary, changed areas, checks actually run, result/PR/commit, persistence/migration impact, compatibility decisions, and follow-up.
