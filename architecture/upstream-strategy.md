# Upstream Strategy

1. Keep SillyTavern-compatible project structure wherever practical.
2. Keep Atria-specific functionality clearly separated from upstream code when new modules are introduced.
3. Do not blindly merge `vanilla` or `luker` into `main`.
4. Upstream updates are first inspected against `vanilla`, then adapted on a temporary `chore/*` or `feat/*` branch.
5. Legacy Luker names/protocols may remain temporarily as compatibility surfaces. New Atria-owned code should prefer the `atri_*` namespace.
