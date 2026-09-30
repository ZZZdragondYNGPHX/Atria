# Docs Plan Bundle Normalization — Record

- Task ID: `refactor/docs-plan-bundle-normalization`
- Primary Workspace: `docs`
- Status: Complete
- Plan: none; one-pass governance/document-structure migration
- Reference specification: `ZZZdragondYNGPHX/Standardized-project` `docs@ecbbb9f3d207241e115e2bdbe3db0fff10557374`
- Start docs HEAD: `73e22d1698fd396f5bc52dcb2b0fcc0224e55f72`
- Content migration HEAD: pending finalization

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

See the following record-only finalization commit for the exact content migration HEAD and post-write verification result.
