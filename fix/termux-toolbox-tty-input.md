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
