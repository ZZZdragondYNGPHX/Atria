# Atria Maintenance

## Product model

Atria is maintained as a SillyTavern-based modified product. The stable product line is `main`; complete repository governance is in the local `Atria-worktrees/docs/README.md`.

## Workspace roles

- `atria/main`: stable product/integration line and the only Atria remote branch.
- `docs/`: local Governance, Plans, Records and optional live `HANDOFF.md`.
- `package/`, `package-releases/` and `plugin/`: independent local game projects, latest releases and standalone tools.
- `tasks/`: independent local task repositories, using short-lived semantic branches.
- Repository-agent Skills and authorized reference projects: local tools and checkouts.

## Normal development flow

1. Read the relevant Plan/Record as needed; use the local `docs/HANDOFF.md` only when resuming a user-requested interruption.
2. Create an independent local task repository and use an appropriate short-lived semantic branch.
3. Implement the isolated task and update the permanent local Record.
4. Integrate completed product work into `atria/main`, push that branch and clean up the completed task.

Development, commits, integration and cleanup happen locally. Only `atria/` connects to the Atria remote. GitHub Actions are disabled; neither CI nor a PR is a routine gate. Preserve other active tasks and their HANDOFF. Workspace naming follows local Governance §3.1.

Implementation, minimal related validation and lightweight runtime checks follow local Governance §12.1–§12.2. Old branch names and historical test lists do not authorize recreation or repeated acceptance workflows.

## Reference branches

Reference and update permission are separate. Read a reference project only when the user explicitly authorizes it, and update it only when the user explicitly authorizes its update. Never blindly merge reference history into `main`.

## Documentation

Plans describe intended design. Records preserve executed history. Local `docs/HANDOFF.md` is the single optional live recovery state. Historical handoffs are Records, not alternate live routes.
