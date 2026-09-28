# Termux Toolbox TTY Input Fix

## Goal

Fix the interactive toolbox when launched with the documented pipeline form:

```bash
curl -fsSL https://raw.githubusercontent.com/ZZZdragondYNGPHX/Atria/main/scripts/termux/atria_toolbox.sh | bash
```

## Root cause

The outer Bash process consumes the downloaded script from standard input. When it execs the interactive runtime, stdin remains the exhausted pipe, so menu `read` calls immediately receive EOF and loop through clear / invalid-option handling.

## Fix

- Rebind the interactive runtime stdin to `/dev/tty` before exec.
- Fail clearly if no controlling TTY exists.
- Add a regression assertion for the TTY handoff.
- Preserve repository-origin and history-cutover behavior from PR #77.

## Validation

- Bash syntax through existing Termux guards.
- Targeted toolbox regression coverage.
- Normal Atria PR Checks.
- No Android or Docker builds.


## Implementation status

- Task branch: `fix/termux-toolbox-tty-input`
- Current task HEAD: `ab233220af82517dfd4ab4268c8a5d7c5db00f97`
- PR: #78
- Toolbox launcher version: v0.3.8
- The interactive runtime now executes with stdin redirected from `/dev/tty`.
- A missing controlling TTY produces a clear terminal error instead of an invalid-option loop.
- Regression coverage asserts the `/dev/tty` handoff.
- PR Checks #742 is queued/pending.


## Completed result

- PR: #78
- Validated task HEAD: `ab233220af82517dfd4ab4268c8a5d7c5db00f97`
- Final validation: Atria PR Checks #742 — success
- Squash merge / current `main`: `1dffedf610e03a51512ec59f12a09cd7b9a23f43`
- Toolbox version: v0.3.8
- The documented `curl ... | bash` path now reconnects the interactive runtime stdin to `/dev/tty`.
- EOF no longer drives the menu into repeated clear / “无效选项” cycles.
- Launch without a controlling TTY fails with an explicit error instead of looping.
- Repository-origin and history-cutover protections from PR #77 are unchanged.
- Android / Docker builds were not run by design for this shell/Node-only fix.
