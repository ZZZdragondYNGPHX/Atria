# Atria MCP Capability Expansion — Library / Package / Work

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 14. Library + Package / Work semantic model

Library and Package/Work remain distinct authorities.

Library owns editable resources and immutable resource revisions. Package/Work owns installed Works and immutable exact PackageVersions. MCP must not collapse them into one generic file/resource store.

### 14.1 Library read surface

The accepted Library read direction includes semantic capabilities such as:

- `atri_library_list`;
- `atri_library_get`;
- `atri_library_get_exact`;
- `atri_library_search`;
- revision/history reads;
- `atri_library_references`;
- `atri_library_used_by`;
- graph/dependency reads;
- `atri_library_delete_safety`;
- bundle/fork preflight reads.

Exact identity must remain explicit: resourceType + resourceId + revision/content identity + authority.

MCP must not imply that a Project referencing an exact Library revision automatically follows the resource's current/latest revision.

### 14.2 Library mutation creates new revisions

Library content edits should preserve immutable revision semantics.

Preferred semantic direction includes:

- create resource root;
- rename mutable resource root metadata where supported;
- create a new immutable resource revision.

Avoid a generic `library_edit` abstraction that implies mutation of an existing immutable revision.

### 14.3 Library destructive operations

Deleting an immutable Library revision or an entire Library resource root is DESTRUCTIVE.

Before asking the user to approve deletion, MCP must call the owning delete-safety/reference authority and surface blockers.

If references make deletion invalid, MCP should fail closed without offering a force-delete bypass.

There is no MCP-level force delete.

### 14.4 Library versus Build ownership

Library tools answer "what is this resource/revision and what references it?"

Project attachment/fork/update remains a Build/Studio concern and should normally be expressed through Build Workspace operations such as:

- `resource.attach`;
- `resource.fork`;
- `resource.update`.

This avoids duplicate mutation authorities.

### 14.5 Package original -> Library fork

Package originals remain immutable exact resources.

When editable ownership is needed, MCP should support an explicit review/apply flow that copies the exact dependency closure into independent Library ownership.

Candidate semantic flow:

- fork review/preflight;
- show exact closure, destination refs and conflicts;
- apply import/copy after authorization.

Large bundle payloads should remain internal/artifact-backed rather than being dumped into model context.

### 14.6 Work and PackageVersion identity

A Work is the user-facing installed product root. A PackageVersion is an immutable exact installed version.

MCP must keep these identities distinct.

Useful Work/PackageVersion reads include:

- Work list/detail;
- installed versions;
- exact PackageVersion detail;
- manifest;
- permissions;
- capabilities;
- Work plugins/runtime contributions;
- dependent/pinned Sessions;
- resource setup.

A Session's exact `packageVersionId` must remain visible so MCP can diagnose cases where Work currentVersion and a Session's pinned exact version differ.

### 14.7 Start Work

Starting a Work is MUTATE because it creates a Session.

The semantic operation should optionally accept an exact PackageVersion and EntryPoint, otherwise defaulting through normal Atria Work authority.

Receipts should record the exact PackageVersion/EntryPoint/Session identities and whether the Session was created by the current MCP session.

### 14.8 Package install/update

Package installation/update must use an explicit:

`artifact inspect -> package preflight -> review -> install`

flow.

Preflight/review evidence should expose at least:

- packageId / exact packageVersionId;
- archive/content hash;
- previous/current version identity;
- required permissions;
- added/removed/changed permissions;
- added/removed capabilities;
- Sessions pinned to older versions;
- other product-provided compatibility blockers.

Installation is MUTATE and may carry permission/external-effect metadata.

The user authorization is for the reviewed exact PackageVersion plus the displayed permission grants, not merely for a generic "install Package" action.

### 14.9 Install receipt and conflict binding

The install authorization/receipt should bind:

- artifact hash;
- packageId;
- packageVersionId;
- base/current PackageVersion identity;
- granted permissions;
- normalized preflight result/fingerprint.

Apply must fail closed if the current installed base changed after review.

### 14.10 Work edits derive PackageVersions

User-facing Work Knowledge/Regex editing may remain available as semantic convenience, but MCP must represent the real architecture:

- the prior PackageVersion is not modified;
- a new resource revision and/or PackageVersion is derived;
- current Work identity may then advance to that new exact version.

Receipts should expose previous and derived PackageVersion identities.

### 14.11 Work deletion

Deleting an installed Work is DESTRUCTIVE.

MCP should first surface dependent Sessions/references. If the product authority blocks deletion while Sessions still depend on the Work, MCP must not create a force path.

Dependent Sessions must be resolved through their own explicit destructive authority.

### 14.12 PackageVersion physical deletion is not exposed

MCP should not invent an exact PackageVersion physical-delete tool unless Atria later introduces a formal reference/deletion-safety authority for that lifecycle.

### 14.13 Cross-domain immutable-version principle

Atria MCP adopts a cross-domain rule:

> Prefer deriving a new immutable identity over mutating an existing immutable identity.

Examples:

- Chat -> Revision / Branch;
- Build -> Project Revision / ChangeSet;
- Library -> Resource Revision;
- Package / Work -> PackageVersion.

For destructive operations, MCP should inspect product-owned dependency/reference safety before requesting user authorization and should not provide force bypasses.
