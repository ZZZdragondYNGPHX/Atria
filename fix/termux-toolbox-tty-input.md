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
