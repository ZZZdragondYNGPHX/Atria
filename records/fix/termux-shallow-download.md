# Termux installation download scope

- Date: 2026-10-26
- Task: `fix/termux-shallow-download`
- Primary workspace: product source
- Start: `4e2af884af846e033d0b117147d764f21d4a8a86`
- Implementation: `85b7995a5f120e470b52361ceb1fec9ce05b9f08` (integrated into `main`, pushed)

## Result

Toolbox v0.3.11 installs with `--depth 1 --single-branch --no-tags --branch main` and removes the redundant all-refs fetch. Daily toolbox and `atria-termux update` fetch only the explicit main ref with tags disabled. Updates preserve incremental ancestry for fast-forward validation; they do not repeatedly truncate history to depth one or overwrite divergent local commits.

Tag browsing reads remote names without fetching their objects. Selecting a tag or an unavailable full commit hash downloads only that target at depth one. Recent-commit browsing reads local history without a fetch. Existing downloaded objects and user data are not deleted. No new dependencies or abstraction layer were added; the existing compressed runtime and launcher checksum were updated together.

## Validation

- Bash syntax checks passed for launcher, CLI and the runtime assembled through the launcher's real decompression/injection path.
- Local Git fixture verified shallow main-only installation, multi-commit fast-forward updates, exclusion of unrelated branch objects and tags even with old broad fetch configuration, selected annotated-tag/full-commit downloads, return to main, invalid-target failures, and preservation of divergent commits and dirty files.
- Local file-transport shallow clone of the integrated main contains one reachable commit and 72.73 MiB of packed Git objects. The user's prior full clone reported 305 MiB. This is a local size comparison, not an Android network measurement, and excludes npm dependencies.
- Live GitHub clone measurement was interrupted after transfer stalled; a separate remote-ref query reported an SSL/TLS handshake failure. The local file-transport clone completed successfully. Product push succeeded and the public raw launcher returned v0.3.11.
- `git diff --check` passed. No Android device execution was performed. Test fixtures remain local and are not committed.
