# Copilot Instructions for ZZZdragondYNGPHX/Atria

Atria is a SillyTavern-based modified product and the successor product line to Atria.

Before editing code:

- read `AGENTS.md` and `FORK_MAINTENANCE.md` from current `main`;
- read `handoff/latest-handoff.md` from the `docs` branch;
- verify the live `main` HEAD.

Branch rules:

- develop from `main`;
- use `feat/*` for features, `fix/*` for bugs, `refactor/*` for refactors, and `chore/*` for maintenance;
- `vanilla` is SillyTavern upstream reference only;
- `atria` is legacy Atria reference only;
- completed tasks are documented on `docs`, merged into `main`, verified, then their temporary branch is deleted.

Engineering rules:

- diagnose/design before editing;
- preserve unrelated Atria behavior and persisted formats;
- reuse current architecture;
- use upstream/reference branches only when materially relevant;
- product identity is `Atria`;
- prefer concise `atri_*` names for new Atria-owned code;
- compatibility-sensitive legacy Atria identifiers may remain until a dedicated migration handles them;
- run and report only checks actually executed.
