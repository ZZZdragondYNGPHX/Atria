# Docs Plan Bundle Normalization — Record

- Task ID: `refactor/docs-plan-bundle-normalization`
- Primary Workspace: `docs`
- Status: Complete
- Plan: none; one-pass governance/document-structure migration
- Reference specification: `ZZZdragondYNGPHX/Standardized-project` `docs@ecbbb9f3d207241e115e2bdbe3db0fff10557374`
- Start docs HEAD: `73e22d1698fd396f5bc52dcb2b0fcc0224e55f72`
- Content migration HEAD: `c7c6a8569b8304e5f9e89a3873fbedad3285e603`
- Bundle sizing refinement: `8d98bd006c65d033cc4f4a907f4b0a7dd692539d`
- Post-write verification baseline: `8d98bd006c65d033cc4f4a907f4b0a7dd692539d`

## Summary

Normalized the remaining large/legacy Atria Plans to Governance 1.1 Plan Bundle routing while preserving the already-migrated active game Bundle and the live MCP task state.

## Completed

- Converted the remaining oversized monolithic Plans into `<project>/index.md + domain modules`.
- Normalized the existing Model/Prompt and Product Frontend half-Bundles behind a single `index.md`.
- Preserved detailed source text inside domain/history modules instead of deleting design evidence.
- Isolated old implementation notes embedded in the Native Content/Session Plan as historical material; new execution history remains a Record responsibility.
- Updated the live MCP HANDOFF and permanent Records that pointed at moved Plan paths.
- Added Plan/Record category routers and a Records policy index; retained old `legacy-handoffs/` only as historical evidence.
- Left the concurrently migrated `plans/package/original-occult-western-fantasy-game/` Bundle untouched.
- Did not modify product/package/plugin/skills/reference workspaces and did not merge `main` into `docs`.

## Validation

- The migration is produced from the actual remote docs HEAD and committed as one tree change.
- Old converted monolithic Plan files are removed in the same tree that creates their Bundle entrypoints/modules.
- No product test/build, Android/Termux, device or UI validation is claimed for this docs-only migration.
- Exact post-write tree/path verification is recorded in the finalization commit.

## Final state

Post-write verification passed against `8d98bd006c65d033cc4f4a907f4b0a7dd692539d`:

- all eight routed Plan Bundle entrypoints are present, including the concurrently migrated active Western-fantasy game Bundle;
- all seven replaced monolithic Plan paths are absent;
- Native Experience Case 03 is further split into A–E to keep stage reads bounded;
- the live MCP HANDOFF points to the new Plan entrypoint and exact Phase 6 module set;
- MCP and Native Frontend permanent Record Plan pointers resolve to the new entrypoints;
- `records/README.md` and category routers are present;
- the active MCP HANDOFF was preserved rather than repurposed/deleted;
- no product/package/plugin/skills/reference content was modified by this migration;
- no product test/build, Android/Termux, physical-device or UI validation is claimed.
