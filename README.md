# Atria

Atria is a **SillyTavern-based modified role-playing product** focused on richer memory, orchestration, authoring/runtime, storage tooling and Atria-specific UX.

## Getting started

Install Node.js 22.2 or newer, then run from the repository root:

```sh
npm ci
npm start
```

Open `http://localhost:8000` after the server starts. See the [getting started guide](docs/guide/getting-started.md), [Android build guide](android-app/README.md) and [product documentation](docs/README.md) for more options.

## Repository and local workspaces

The Atria repository keeps only the stable `main` branch, locally and remotely. In the local `Atria-worktrees/` workspace, `atria/` holds the product, while `docs/`, `package/`, `package-releases/`, `plugin/` and `tasks/` are independent and local-only. Repository governance is maintained in `Atria-worktrees/docs/README.md`.

## Development model

New product work starts from current `main` in an independent local repository under `tasks/`, on a short-lived semantic task branch. Integrate completed work into `atria/main` and record the outcome in the local `docs/` workspace. A specific reference project is read only under explicit reference authorization and updated only under separate explicit update authorization.

Game projects, their latest release artifacts and standalone tools remain in their respective local directories. Only `atria/` connects to the Atria remote.

New Atria-owned modules should prefer concise `atri_*` naming where practical. Implementation and compatibility boundaries follow local Governance §12.1.

## Upstream

- SillyTavern: https://github.com/SillyTavern/SillyTavern

## License

AGPL-3.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE.md) for attribution.
