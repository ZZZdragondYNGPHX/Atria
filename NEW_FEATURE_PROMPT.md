# Atria Feature Task Prompt

Repository: `ZZZdragondYNGPHX/Atria`

1. Verify current `main` and read `main:AGENTS.md`.
2. If resuming an existing task, read `docs:HANDOFF.md` and its named Plan/Record. For a new ordinary feature, load only directly relevant context.
3. Create a fresh `feat/<short-name>` branch from current `main`.
4. Inspect the owning architecture, state/service/API/UI/persistence paths and relevant tests before coding.
5. Reuse existing authorities and services rather than creating parallel systems.
6. Read a `reference/<project>` only when the user explicitly authorizes that reference.
7. Preserve data/config compatibility unless the approved design includes a migration.
8. Run validation appropriate to the touched surface.
9. Create/update a Plan when the feature is complex or staged, and write/update the permanent Record under `docs:records/feat/**`.
10. Integrate verified work into `main`, verify `main`, then delete the task branch and any completed live HANDOFF.

Complete Governance: `docs:README.md`.
