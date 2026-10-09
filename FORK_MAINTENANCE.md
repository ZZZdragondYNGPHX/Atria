# Atria Maintenance

## Product model

Atria is maintained as a SillyTavern-based modified product. The stable product line is `main`; complete repository governance is authoritative at `docs:README.md`.

## Branch roles

- `main`: stable Atria product/integration line.
- `docs`: independent Governance, Plans, Records and optional live `HANDOFF.md`.
- `package`: independent game/Atria Package assets.
- `plugin`: independent standalone development tools.
- `skills`: independent repository-agent Skills.
- `reference/vanilla`: SillyTavern upstream/reference history.
- `reference/luker`: legacy Luker reference history.
- `feat/*`, `fix/*`, `refactor/*` and other justified semantic prefixes: temporary product task branches.

## Normal development flow

1. Verify current `main` and read the active workspace `AGENTS.md`.
2. For a resumed/multi-stage task, read `docs:HANDOFF.md` and its named Plan/Record.
3. Create/use the appropriate short-lived semantic branch.
4. Implement the isolated task and run minimal relevant local validation.
5. Write/update the permanent Record under `docs:records/**`.
6. Integrate verified product work into `main`.
7. Verify integrated `main`.
8. Delete the completed temporary branch and live HANDOFF when the task is complete.

Development, validation, commits, integration and cleanup happen locally. Push committed results to the remote for storage. GitHub Actions are disabled; neither CI nor a PR is a routine gate. Preserve other active tasks and their HANDOFF. Workspace naming follows `docs:README.md` §3.1.

## Reference branches

Reference and update permission are separate. Read a `reference/<project>` only when the user explicitly authorizes reference to that project, and update it only when the user explicitly authorizes its update. Never blindly merge reference history into `main`.

## Verification

Run the smallest sufficient local checks for the touched surface and report only checks actually executed. Prefer automation and simulators; manual device checks require a specific essential gap. Do not repeat passed checks without a relevant new change. Android/device, Docker, paid-provider and real-UI validation are not implied by ordinary source validation.

## Documentation

Plans describe intended design. Records preserve executed history. `docs:HANDOFF.md` is the single optional live recovery state. Historical handoffs are Records, not alternate live routes.
