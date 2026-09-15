# Reusable New-Bug Handoff Prompt

Copy the text below into a fresh AI chat, then append the new bug symptoms, reproduction steps, screenshots, logs, and any relevant files.

---

I maintain a personal fork of Luker and want you to take over a new bug from repository state rather than relying on prior chat memory.

Repositories:

- Upstream: `https://github.com/funnycups/Luker`
- My fork: `https://github.com/ZZZdragondYNGPHX/Luker`
- Upstream/fork mirror branch: `release`
- Personal integration branch: `custom-release`

Before touching code, first fetch and read these files from **my fork's `custom-release` branch**:

1. `AGENTS.md`
2. `AI_HANDOFF.md`
3. `FORK_MAINTENANCE.md`
4. `.github/copilot-instructions.md` if relevant

Treat those repository documents as the persistent handoff contract for this fork. Do not assume this chat contains the newest repository state.

For every new bug, follow this workflow:

1. Check the live HEAD of `funnycups/Luker:release`.
2. Check the latest relevant successful official `Build Android APK` GitHub Actions run and its `head_sha`.
3. Compare those values and explain any mismatch before selecting a source baseline.
4. Check whether `ZZZdragondYNGPHX/Luker:release` matches the authoritative upstream baseline.
5. Keep my fork's `release` as a clean upstream mirror. Never put private fixes or AI-maintenance files into `release`.
6. For an unrelated new bug, create a fresh `fix/<short-bug-name>` branch from the latest synchronized `release`. Do not continue from an old fix branch and do not use `custom-release` as the base unless this bug explicitly depends on a private patch.
7. Reproduce or establish the exact failure path and identify the root cause before editing. Pay special attention to async initialization, stale state, scope switching, persistence, lifecycle ordering, race conditions, and Android/Web differences when relevant.
8. Make the smallest compatible fix. Avoid unrelated refactors and preserve existing data/config formats unless a migration is truly required.
9. Inspect the complete diff before committing and keep one bug/feature per branch and per PR.
10. Run the most relevant available checks for the touched code: targeted tests first, then syntax/lint/build checks as appropriate.
11. If you have write access to my GitHub fork, commit the fix to the new `fix/*` branch. Do not modify `release` directly.
12. If the change is suitable for upstream, prepare a clean upstream PR from the isolated `fix/*` branch. Do not include `AGENTS.md`, `AI_HANDOFF.md`, `FORK_MAINTENANCE.md`, `NEW_BUG_PROMPT.md`, or `.github/copilot-instructions.md` in the upstream PR unless the maintainer explicitly requests them.
13. Do not integrate the new fix into `custom-release` until the fix is understood and verified. After verification, integrate it as a traceable private change and record its state in `AI_HANDOFF.md`.
14. If upstream later implements the same fix, mark/remove the redundant private patch during the next custom-release refresh rather than maintaining duplicate logic forever.

At the end of the task, always report:

- upstream baseline SHA used;
- latest checked official Android build SHA;
- fix branch name;
- root cause;
- changed files;
- tests/checks run and their result;
- resulting commit SHA;
- whether the fix is cleanly upstream-compatible;
- whether an upstream PR was created/prepared;
- whether the fix has been integrated into `custom-release`;
- whether any older private patch has become obsolete or conflicting.

Do not rely on version numbers, branch timestamps, or old chat memory alone when deciding what is latest. Verify the repository and Actions state live.

New bug:

[Describe symptoms here]

Reproduction steps:

[Add steps here]

Logs / screenshots / files:

[Attach or paste here]

---
