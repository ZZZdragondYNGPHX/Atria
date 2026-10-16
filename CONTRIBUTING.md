# Contributing to Atria

Atria development is performed locally. The remote stores committed source, assets, documentation and history. GitHub Actions are disabled, including automatic/manual tests, APK/Docker builds and branch cleanup.

Read the current workspace `AGENTS.md`; complete governance is available with `git show docs:README.md`. The product development guide is [docs/development/contributing.md](docs/development/contributing.md).

1. Check local Git status and protect unrelated changes.
2. Use a semantic task branch for product changes; preserve independent workspace ownership.
3. Inspect the affected architecture, implement the change.
4. Commit locally and write the task Record in `docs:records/**`.
5. Integrate completed product work into local `main` and push committed results for storage.
6. Clean up completed local/remote task branches. Multi-stage tasks update the same Record and continue under Governance §8; hand off only when the user requests interruption.

Implementation and compatibility follow `docs:README.md` §12.1. Preserve existing authorities and unrelated work. Do not commit secrets, user data, local absolute paths, caches or generated build artifacts. Contributions remain subject to the repository's AGPL-3.0 license.
