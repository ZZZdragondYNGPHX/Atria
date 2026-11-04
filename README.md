# Atria

Atria is a **SillyTavern-based modified role-playing product** focused on richer memory, orchestration, authoring/runtime, storage tooling and Atria-specific UX.

## Getting started

Install Node.js 22.2 or newer, then run from the repository root:

```sh
npm ci
npm start
```

Open `http://localhost:8000` after the server starts. See the [getting started guide](docs/guide/getting-started.md), [Android build guide](android-app/README.md) and [product documentation](docs/README.md) for more options.

## Branch model

- `main` — stable Atria product/source line.
- `docs` — independent Repository Governance, Plans, Records and optional live `HANDOFF.md`.
- `plugin` — independent long-lived standalone tools.
- Game / Package projects — local-only source, assets and generated release packages; no long-lived Atria remote branch.
- `reference/vanilla` — SillyTavern upstream/reference history.
- `reference/luker` — legacy Luker reference history.
- `feat/*`, `fix/*`, `refactor/*` and other justified semantic prefixes — short-lived product task branches.

Complete repository governance is authoritative at `docs:README.md`.

## Development model

New product work starts from current `main` on a short-lived semantic task branch. A specific `reference/<project>` is read only under explicit reference authorization and updated only under separate explicit update authorization.

`docs` and `plugin` are isolated long-lived workspaces; do not merge `main` into them for convenience. Game / Package development and generated release packages stay in local worktrees and are not synced to Atria remote branches.

New Atria-owned modules should prefer concise `atri_*` naming where practical. Implementation and compatibility boundaries follow `docs:README.md` §12.1.

## Upstream

- SillyTavern: https://github.com/SillyTavern/SillyTavern
- Legacy migration source: https://github.com/ZZZdragondYNGPHX/Luker

## License

AGPL-3.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE.md) for attribution.
