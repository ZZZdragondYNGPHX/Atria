# Atria MCP Capability Expansion — Build / Studio

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 5. Build / Studio observation direction

The current Atria product exposes a substantially richer formal Native Studio authority than the original Plan baseline.

Current authority includes:

- Project listing/detail and exact revision identity;
- source listing/read plus revisioned source write/move/delete fallback operations;
- Project history and diff;
- Resource Graph, references, closure and delete-safety;
- Workspace create/inspect/execute with exact `baseRevision`;
- Project validation, preflight, build and simulation;
- Preview create/list/detail/close;
- Native Frontend v3 Source Graph inspection;
- Source-addressable Frontend diagnostics;
- formal Frontend Workspace evaluation that temporarily applies the reviewed Workspace, validates/builds a Preview and restores Project source;
- format-preserving semantic `frontend.patch` operations over Authoring Source.

MCP should treat **Build** as the stable user-facing semantic namespace while recording **Native Studio** as the owning product authority in each Action Descriptor. There is no need to rename the public semantic domain merely to mirror internal endpoint/service names.

Representative READ action IDs include:

- `build.project.list`;
- `build.project.get`;
- `build.project.revision`;
- `build.source.list`;
- `build.source.read`;
- `build.history`;
- `build.diff`;
- `build.resources`;
- `build.resource.closure`;
- `build.validate`;
- `build.preflight`;
- `build.frontend.inspect`;
- `build.preview.list`;
- `build.preview.get`.

Representative INTERACT/MUTATE flows are defined later in the Build / Studio semantic model.

These remain semantic Action Registry entries, not new top-level `atri_build_*` MCP tools.

Build/Studio tools must wrap the existing Studio authority rather than read Project storage directly.

## 13. Build / Studio semantic model

MCP Build/Studio operations reuse Atria's existing revisioned Studio authority and Native Frontend v3 authoring/Preview paths. MCP must not expose a second direct-edit or second frontend compiler protocol.

### 13.1 Read surface

The accepted READ direction includes semantic actions for:

- Project list/detail/revision;
- source list/read;
- history/diff;
- Resource Graph/references/closure/delete-safety;
- validation/preflight;
- Preview inventory/detail;
- Native Frontend Source Graph/diagnostics/features/permissions/remote origins through `build.frontend.inspect`;
- compiled Preview UI/runtime identity where exposed.

All reads preserve exact Project/revision identity.

### 13.2 Workspace-first mutation

Normal Build mutation uses Atria Authoring Workspace/Operation semantics:

`baseRevision -> operations -> workspace -> inspect/evaluate -> authorization -> executeWorkspace -> ChangeSet/resultingRevision`.

Structured/domain authoring operations are preferred.

Native Frontend v3 adds `frontend.patch` as a formal Workspace operation for semantic Source edits. MCP should use it for Component/Node/Binding/View/style/state/interaction/message edits when applicable.

Low-level `source.write`, `source.move` and `source.delete` remain bounded fallback operation types rather than the primary semantic editing interface.

### 13.3 Prepare / inspect / evaluate / apply

Representative semantic actions:

- `build.change.prepare` — normalize/construct a Workspace proposal;
- `build.change.inspect` — exact before/after fingerprints without persistence;
- `build.change.evaluate` — temporary Studio evaluation and validation, optionally composing formal Frontend Preview and/or simulation, then restoring Project source;
- `build.change.apply` — execute the reviewed Workspace through Studio authority.

Native Frontend-specific convenience actions may include:

- `build.frontend.inspect` — READ Source Graph/diagnostics against an exact base revision and bounded drafts;
- `build.frontend.evaluate` — INTERACT wrapper over the formal Frontend evaluation path;
- `build.preview.get` / `build.preview.close`;
- `build.simulate`.

These are Action Registry entries, not additional top-level MCP tools.

### 13.4 Evaluation-before-apply binding

A successful evaluation remains the preferred safe path before apply.

The MCP evaluation receipt binds product evidence rather than requiring a new durable product receipt format. It should bind at least:

- projectId;
- baseRevision;
- workspaceId;
- normalized operations fingerprint/hash;
- exact change fingerprints;
- validation result;
- Preview identity/runtime descriptor when created;
- simulation evidence when requested.

Apply re-checks the exact current Project base revision and normalized operation set. Existing Studio revision guards remain authoritative. Any drift fails closed and requires re-evaluation.

### 13.5 Preview and simulation

Preview is a first-class verification capability.

Current product authority already supports Preview create/list/detail/close and a compiled Native Frontend v3 Preview produced from the same compiler/renderer semantics as Production.

Preview evidence should compose with browser snapshot/screenshot/resize/diagnostics, while retaining the Project/Workspace/Preview provenance chain defined in section 10.

Simulation is INTERACT by default and carries external-effect metadata if a particular simulation path invokes configured model/provider services.

### 13.6 Validation/preflight are semantically read-only

Validation and preflight remain READ-class even when implemented with POST-shaped product APIs because they do not intentionally mutate Project authority.

Risk classification follows product semantics, not HTTP verbs.

### 13.7 Project history and source delete

Studio Project-local Git history makes source writes/moves/deletes revisioned and recoverable.

Source deletion inside an applied Workspace is normally MUTATE/high-impact rather than automatically DESTRUCTIVE. Deleting the entire Project is DESTRUCTIVE and retains current revision/conflict protection.

### 13.8 MCP-created temporary Projects

MCP may create test/minimal-reproduction Projects under MUTATE authorization.

Receipts identify Projects created by the current MCP instance/workflow so a narrow cleanup lease can safely delete only those Projects.

### 13.9 Build/package artifacts

Building a Project may produce a large `.atria` archive.

MCP returns bounded metadata by default:

- project/revision identity;
- manifest;
- PackageVersion identity;
- preflight result;
- archive size/hash/file name.

Large archive transfer uses an explicit artifact path rather than model-context base64.

### 13.10 External Project Agent remains separate

Atria ProjectAgentService is not the default mutation path for external Claude/Codex using MCP.

External AI normally uses Build/Studio semantic actions directly. Project Agent remains a separate Agent domain invoked only when the user explicitly requests that workflow.

### 13.11 Native Frontend v3 authority consequence

The following product-side work that the original MCP design might otherwise have required is already provided by current `main`:

- formal Source Graph inspection;
- source-level Frontend diagnostics;
- semantic frontend Source patching;
- exact compiled frontend runtime graph/descriptor;
- formal Preview create/get/close;
- temporary frontend evaluation with source restoration;
- versioned Frontend Host Bridge receipts/idempotency/revision guards;
- Experience Epoch stale-handle revocation;
- Script/Media/Frontend recovery boundaries.

MCP should adapt to these authorities. It must not add parallel Main-side frontend debug/mutation protocols merely for MCP.
