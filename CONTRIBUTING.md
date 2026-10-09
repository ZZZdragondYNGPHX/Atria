# Contributing to Atria

Atria development is performed locally. The remote stores committed source, assets, documentation and history. GitHub Actions are disabled, including automatic/manual tests, APK/Docker builds and branch cleanup.

Read the current workspace `AGENTS.md`; complete governance is available with `git show docs:README.md`. The product development guide is [docs/development/contributing.md](docs/development/contributing.md).

1. Check local Git status and protect unrelated changes.
2. Use a semantic task branch for product changes; preserve independent workspace ownership.
3. Inspect the affected architecture, implement the change and run the smallest sufficient local checks.
4. Commit locally and write the task Record in `docs:records/**`.
5. Integrate completed product work into local `main`, verify the integration and push committed results for storage.
6. Clean up completed local/remote task branches. Multi-stage tasks instead record and hand off at their approved stage boundary.

Prefer automated tests, browser automation or simulators. Manual device validation is only needed for a specific essential gap that automation cannot cover. Do not repeat passed checks without a relevant new change. Pull requests are optional review aids, not the default execution or merge gate.

Preserve compatibility, existing authorities and unrelated work. Do not commit secrets, user data, local absolute paths, caches or generated build artifacts. Contributions remain subject to the repository's AGPL-3.0 license.
