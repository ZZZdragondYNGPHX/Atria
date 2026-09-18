# Atria Development Documents

This branch is the long-lived documentation store for Atria.

Atria is a SillyTavern-based modified product. It is independent from the former Luker product/brand, but intentionally keeps SillyTavern as its upstream foundation.

## Branch model

- `main`: Atria product line.
- `vanilla`: SillyTavern upstream snapshot, updated only when upstream comparison/sync is needed.
- `luker`: former Luker product snapshot, updated only when legacy comparison/migration is needed.
- `docs`: product planning, architecture decisions, handoffs and completed task records.
- `feat/*`: temporary feature branches.
- `fix/*`: temporary bug-fix branches.
- `refactor/*`: temporary refactor branches.
- `chore/*`: temporary engineering/CI/maintenance branches.

Completed temporary branches are documented here, merged into `main`, verified, and then deleted.
