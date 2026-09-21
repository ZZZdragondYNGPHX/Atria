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
5. Fix global command/search routing: selecting a result owned by another domain must navigate to that domain/child route before its workspace renders. Global utilities must present as their own utility route rather than visually inheriting the caller's A-page identity.
6. Preserve the existing R7 Navigation Authority, WorkspaceHost, Agent runtime, Memory runtime, Studio engine, and native controller ownership. No duplicate engines or stores.

## UX decision

The Agents primary domain becomes a lightweight child-workspace hub. Selecting a card changes the existing child route and mounts the corresponding existing workspace through Navigation Authority / WorkspaceHost.

The Studio Preview tab remains part of Studio, but it is a project/game preview surface rather than a duplicate AI-builder chat presentation. The AI Assistant remains the only conversational builder surface.

Global search is a locator, not an embedding mechanism: result execution must resolve the canonical owning route, then WorkspaceHost renders only that route.

## Validation

- focused frontend/unit tests for Shell Agents routing, Memory workspace rendering, Studio tab semantics, and i18n
- lint for touched frontend files
- frontend build
- relevant Workspace/R7 browser smoke if available
- no Android/Docker validation unless the implementation touches those layers

## Compatibility

No persistence/schema migration. This is a presentation/navigation/i18n fix only.


## Completion record

Implementation branch: `fix/workspace-hub-localization`
Final validated branch HEAD: `9e178b8bce4301412d3995c9f0afe0ce9432c735`
Pull request: #82 — `fix: repair workspace routing, preview, and localization`
Merged main commit: `2c1c171136cb6f35f3f4fff7c62b148b7200485a`

### Implemented

- Completed Memory workspace Simplified/Traditional Chinese coverage for the visible Memory OS surface.
- Localized Runtime overview status strings that were still rendered in English.
- Changed the Agents primary route into a hub with routed child workspaces:
  - Orchestration
  - Run
  - Memory
  - Diagnostics
- Added canonical command/search routing so a result opens its owning primary domain / child route instead of rendering foreign content inside the caller domain.
- Canonicalized global utilities (Diagnostics / Plugins / Settings / Account) under a neutral Play-hosted utility route so they do not inherit the caller domain identity.
- Replaced Studio mobile Preview's previous host-chat passthrough with a dedicated project-preview surface.
- Fixed a Diagnostics trace-import redraw race discovered by CI: a selected trace now completes replay even if the original file-input node is replaced while `file.text()` is pending.

### Validation

- Atria PR Checks #762 — run `35619796768`: success
  - Atria Migration Guard: success
  - Unit Tests: success
  - ESLint: success
- Workspace UI #182 — run `35619796719`: success
  - Workspace information-architecture guard: success
  - Workspace projection smoke: success
  - Workspace UI smoke: success
  - remaining Workspace workflow checks: success

No Android or Docker validation was required because this task changed browser/frontend workspace, routing, i18n, Studio presentation, and frontend diagnostics behavior only.

### Data / compatibility impact

No persistence or schema migration. Existing Navigation Authority, WorkspaceHost, Orchestrator, Memory OS, Studio, Runtime, and native controller authorities remain authoritative.


### Integration

- PR #82 squash-merged into `main`.
- Integrated main: `2c1c171136cb6f35f3f4fff7c62b148b7200485a`.
- Validated branch tree and merged-main tree are identical: `5e30f53bf9d97706997ef1e7b5ae24de03be8f29`.
- Cleanup workflow: **Cleanup merged task branches #79**, run `35620850710`: success.
- Temporary branch `fix/workspace-hub-localization` deleted; a direct GitHub branch lookup now returns 404.
