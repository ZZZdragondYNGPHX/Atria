# Workspace Hub Localization & Navigation Fix

## Goal

Fix the post-R7 main-branch UI defects reported from mobile screenshots without reopening the R7 architecture.

Baseline: `main@5e0f46da9dcd4dce3811e854ad87d694fa2606d7`
Working branch: `fix/workspace-hub-localization`

## Scope

1. Complete Chinese localization for Memory OS / Memory workspace and remaining Shell/Runtime strings visible in the current product surface.
2. Separate Studio Preview semantics from the AI Assistant conversation surface. Preview must describe/render the current project/game artifact rather than look like another assistant chat.
3. Audit and localize remaining mixed Chinese/English copy in Runtime and other touched first-class workspaces.
4. Replace the Agents domain's direct-to-Orchestration landing with an Agents hub:
   - Orchestration
   - Memory OS
   - Agent diagnostics / runtime inspection where already supported
   - future child workspaces can be added without creating another primary domain
5. Preserve the existing R7 Navigation Authority, WorkspaceHost, Agent runtime, Memory runtime, Studio engine, and native controller ownership. No duplicate engines or stores.

## UX decision

The Agents primary domain becomes a lightweight child-workspace hub. Selecting a card changes the existing child route and mounts the corresponding existing workspace through Navigation Authority / WorkspaceHost.

The Studio Preview tab remains part of Studio, but it is a project/game preview surface rather than a duplicate AI-builder chat presentation. The AI Assistant remains the only conversational builder surface.

## Validation

- focused frontend/unit tests for Shell Agents routing, Memory workspace rendering, Studio tab semantics, and i18n
- lint for touched frontend files
- frontend build
- relevant Workspace/R7 browser smoke if available
- no Android/Docker validation unless the implementation touches those layers

## Compatibility

No persistence/schema migration. This is a presentation/navigation/i18n fix only.
