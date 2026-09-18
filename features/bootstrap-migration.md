# Bootstrap Migration

## Goal

Establish Atria as the successor product line to Luker while retaining SillyTavern as the upstream base.

## Planned migration result

- Preserve the current Luker production implementation as the initial Atria code baseline.
- Preserve a `luker` legacy reference branch.
- Preserve a `vanilla` SillyTavern upstream reference branch.
- Introduce the permanent `docs` branch.
- Rebrand user-facing/product metadata to Atria on `feat/atria-bootstrap`.
- Keep legacy internal names temporarily where changing them would risk compatibility.
