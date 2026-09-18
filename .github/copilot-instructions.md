# Copilot Instructions for ZZZdragondYNGPHX/Atria

Atria is a SillyTavern-based modified product, independent from the former Luker product line while retaining SillyTavern as its upstream foundation.

Before editing code:

- read `AGENTS.md` and `FORK_MAINTENANCE.md` from current `main`;
- read `handoff/latest-handoff.md` from the `docs` branch;
- verify the live `main` HEAD.

Branch rules:

- develop from `main`;
- use `feat/*` for features, `fix/*` for bugs, `refactor/*` for refactors, and `chore/*` for maintenance;
- `vanilla` is SillyTavern upstream reference only;
- `luker` is legacy Luker reference only;
- completed tasks are documented on `docs`, merged into `main`, verified, then their temporary branch is deleted.

Engineering rules:

- diagnose/design before editing;
- preserve unrelated Atria behavior and persisted formats;
- reuse current architecture;
- use upstream/reference branches only when materially relevant;
- product identity is `Atria`;
- prefer concise `atri_*` names for new Atria-owned code;
- active Atria product code must not reintroduce Luker-owned runtime namespaces; historical reference material remains isolated;
- run and report only checks actually executed.
