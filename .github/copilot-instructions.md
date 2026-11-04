# Atria Agent Entry

Follow the current workspace `AGENTS.md`. Complete repository governance is in the local `Atria-worktrees/docs/README.md`.

Develop on a task branch in an independent local repository under `Atria-worktrees/tasks/`, then integrate into `atria/main`. Only the stable `atria/` repository connects to the Atria remote. GitHub Actions are disabled, and CI or a pull request is not a routine prerequisite.

Protect unrelated changes and continue authorized stages under Governance §8. Implementation and minimal validation follow §12.1–§12.2; historical Plans, Records and Skill examples do not add review gates or runtime checks.

Read or update a reference project only with the corresponding explicit user authorization. Keep Atria product code separate from local `docs/`, `package/`, `package-releases/` and `plugin/`. Repository-agent Skills are local tools.
