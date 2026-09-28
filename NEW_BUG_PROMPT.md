# Atria Bug Task Prompt

Repository: `ZZZdragondYNGPHX/Atria`

1. Verify current `main` and read `main:AGENTS.md`.
2. If resuming an existing task, read `docs:HANDOFF.md` and its named Plan/Record. For a new ordinary bug, do not scan unrelated docs.
3. Create a fresh `fix/<short-name>` branch from current `main`.
4. Reproduce the failure path and identify root cause before editing.
5. Inspect the owning code/tests and preserve existing authority, persistence and compatibility contracts.
6. Read a `reference/<project>` only when the user explicitly authorizes that reference.
7. Implement the smallest coherent fix and run validation appropriate to the touched surface.
8. Write/update the permanent Record under `docs:records/fix/**`.
9. Integrate verified work into `main`, verify `main`, then delete the task branch.
10. Delete any live HANDOFF when the task is complete.

Complete Governance: `docs:README.md`.
