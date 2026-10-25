# Contributing to Atria

Atria development is performed locally. The remote stores Atria product/tool source, documentation and game release packages, not game development sources. GitHub Actions are disabled, including automatic/manual tests, APK/Docker builds and branch cleanup.

Read the current workspace `AGENTS.md`; complete governance is available with `git show docs:README.md`. The product development guide is [docs/development/contributing.md](docs/development/contributing.md).

1. Use a semantic task branch for product changes; preserve independent workspace ownership.
2. Inspect the affected architecture and implement the change under Governance §12.1–§12.2.
3. Commit locally and write the task Record in `docs:records/**`.
4. Integrate completed product work into local `main` and push committed results for storage.
5. Clean up completed task branches without removing unrelated local development. Multi-stage tasks update the same Record and continue under Governance §8; hand off only when the user requests interruption.

Implementation, compatibility, minimal validation and runtime check costs follow `docs:README.md` §12.1–§12.2. Preserve existing authorities and unrelated work. Do not commit secrets, user data, local absolute paths, caches or generated build artifacts. Contributions remain subject to the repository's AGPL-3.0 license.
