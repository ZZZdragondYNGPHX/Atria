# Reusable New-Bug Handoff Prompt

Copy the text below into a fresh AI chat, then append the new bug symptoms, reproduction steps, screenshots, logs, and any relevant files.

A short chat prompt may simply tell the AI to read `AGENTS.md`, `AI_HANDOFF.md`, `FORK_MAINTENANCE.md`, and this file from `custom-release`; the repository documents contain the persistent workflow.

---

I maintain a personal Luker fork independently and want you to take over a new bug from live repository state rather than relying on prior chat memory.

Repository:

- My fork: `https://github.com/ZZZdragondYNGPHX/Luker`
- Primary development/integration branch: `custom-release`
- Optional upstream/reference repository: `https://github.com/funnycups/Luker`
- Optional upstream-reference/mirror branch in my fork: `release`

Before touching code, first fetch and read these files from **my fork's `custom-release` branch**:

1. `AGENTS.md`
2. `AI_HANDOFF.md`
3. `FORK_MAINTENANCE.md`
4. `NEW_BUG_PROMPT.md`
5. `.github/copilot-instructions.md` if relevant

Treat those repository documents as the persistent handoff contract for this fork. Do not assume this chat contains the newest repository state.

For every new bug, follow this workflow:

1. Fetch the live HEAD of `ZZZdragondYNGPHX/Luker:custom-release` and use that as the normal source baseline.
2. Inspect the relevant current code, recent commits, existing tests, and any private fix/feature behavior in the same subsystem.
3. Create a fresh `fix/<short-bug-name>` branch from the latest `custom-release` HEAD. Do not continue unrelated work from an old `fix/*` or `feat/*` branch.
4. Reproduce or establish the exact failure path and identify the root cause before editing. Pay special attention to async initialization, stale state, scope switching, persistence, lifecycle ordering, race conditions, and desktop Web/mobile Termux differences when relevant.
5. Make the smallest compatible fix while preserving unrelated behavior already present in `custom-release`.
6. Avoid unrelated refactors and preserve existing data/config formats unless a migration is truly required.
7. Inspect the complete diff before committing and keep one independent bug per branch.
8. Run the most relevant available checks for the touched code: targeted tests first, then syntax/lint and desktop/mobile browser checks as appropriate. Do not build APKs unless explicitly requested.
9. If you have write access to my GitHub fork, commit the fix to the new `fix/*` branch. Do not develop directly on `release`.
10. After the fix is understood and sufficiently checked, merge it into `custom-release` when I ask for integration or when the task explicitly includes integration.
11. Update `AI_HANDOFF.md` only if the fix creates durable architectural, behavioral, migration, dependency, or maintenance context that future sessions should know.
12. Do not require upstream synchronization, upstream Android Actions verification, or an upstream PR for ordinary private bug fixing.

## Upstream comparison is optional

Inspect `funnycups/Luker` only when it is useful for the specific bug, such as:

- checking whether upstream already fixed the same issue;
- comparing an inherited code path;
- evaluating compatibility before importing an upstream change;
- preparing an upstream contribution that I explicitly requested.

If upstream is inspected, report what was compared and any relevant conflict or compatibility finding. Do not silently replace fork behavior merely because upstream differs.

## Upstream PR policy

Do not prepare or submit an upstream PR by default.

Only do so when I explicitly request it. If requested, first determine whether the fix can be cleanly separated from private fork dependencies and keep fork-only maintenance documents out of the upstream PR unless the maintainer explicitly asks for them.

At the end of the task, always report:

- `custom-release` baseline SHA used;
- fix branch name;
- root cause;
- changed files;
- tests/checks run and their result;
- resulting commit SHA;
- whether the fix has been merged into `custom-release`;
- whether it depends on or changes existing private fork behavior;
- persistent data/config or migration impact, if any;
- desktop Web/mobile Termux differences, if relevant;
- upstream comparison or PR status only if upstream work was actually requested or performed.

Do not rely on version numbers, timestamps, or old chat memory alone when deciding what is current. Verify `custom-release` live.

New bug:

[Describe symptoms here]

Reproduction steps:

[Add steps here]

Logs / screenshots / files:

[Attach or paste here]

---
