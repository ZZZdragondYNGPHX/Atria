# Atria MCP Development Bridge Expansion

**Task ID:** `plugin/atria-mcp-capability-expansion`  
**Primary Workspace:** `plugin`  
**Plan Workspace:** `docs`  
**Status:** Discussion Draft v0.11  
**Current implementation baseline:** `plugin@c125b2e7b63ed035a0a253c4036cbdb6bd273225`  
**Implementation path:** `plugin:atria-mcp/`

## 1. Purpose

Expand Atria MCP from the current source/API/browser development bridge into a high-visibility Atria development authority for AI clients.

The intended role is not to replace Claude Code, Codex, Git, the editor, shell, tests or the normal development workflow. Atria MCP should instead give an AI reliable, Atria-specific visibility into:

- the configured Atria product checkout;
- relevant repository evidence and change impact;
- Atria-owned contracts and Native APIs;
- Build / Studio project state and source files;
- runtime state exposed through Atria authority;
- the real running frontend, including embedded previews;
- browser diagnostics and visual evidence;
- explicitly authorized product interactions needed to reproduce and verify behavior.

The long-term mental model is:

> Atria MCP is the AI's Atria-specific eyes, diagnostic instruments and controlled product-operation bridge. Normal coding tools remain responsible for editing source and running the general development toolchain.

## 2. Existing baseline

The current MCP already provides:

- Native API discovery from the configured tracked product working tree;
- Atria authoring contract/reference access;
- bounded source search/read for tracked `src/**`, `public/**`, `scripts/**`, `tests/**`;
- discovered Native JSON API calls;
- an isolated Playwright browser;
- accessibility snapshots, screenshots, iframe inspection and responsive resizing;
- warning/error, page exception, failed request and HTTP error diagnostics;
- optional confirmed UI interaction and non-GET Native API calls;
- explicit secret/credential endpoint blocking and output redaction.

The current baseline is useful for frontend verification and many runtime bugs, but its repository-read surface is intentionally narrower than the desired end state and its product-operation model is still coarse.

## 3. Agreed product philosophy

### 3.1 Default broad observation

Read/observation capabilities should be broad enough that an AI can understand Atria without guessing from isolated source snippets.

The target includes, subject to safety boundaries:

- Git-tracked repository tree and text files;
- source/config/build/test/workflow evidence;
- Git state and change evidence;
- Atria Native API reads;
- Build / Studio project reads;
- Session/runtime reads exposed by Atria;
- Library / Package / Memory / related product-state reads where Atria exposes an appropriate authority;
- browser structure and screenshots;
- browser/runtime diagnostics.

The goal is close to "anything needed to observe Atria" rather than "only selected source folders".

### 3.2 Product authority remains authoritative

Atria-owned runtime/project/user data must be read through Atria's own authority/API when possible.

MCP must not gain equivalent visibility by bypassing the product and scanning or mutating the underlying user data store directly.

Examples:

- Build project files should be read through Studio/ProjectStore-facing Native APIs.
- Session/chat state should be read through Session/chat authority.
- Library/Package data should be read through their product authority.
- Memory/runtime state should use the owning product surface.

This preserves the distinction between "what Atria believes its state is" and raw storage implementation details, which is essential for diagnosing projection, persistence and runtime bugs.

### 3.3 No generic computer-control escape hatch

Even after capability expansion, Atria MCP should not become a generic remote-control server.

The design should not add general-purpose capabilities such as:

- arbitrary shell execution;
- arbitrary filesystem reads outside the configured Atria scope;
- arbitrary JavaScript evaluation in the page;
- unrestricted SQL/database access;
- unrestricted network tooling.

Atria-specific, semantically named capabilities are preferred.

## 4. Repository observation direction

The current `atri_source_read` / `atri_source_search` scope is limited to selected folders and extensions.

The intended direction is to introduce a repository-level read layer capable of observing the full Git-tracked Atria checkout while retaining explicit exclusions for sensitive or unsuitable content.

Candidate capabilities include:

- `atri_repo_tree`;
- `atri_repo_read`;
- `atri_repo_search`;
- `atri_git_status`;
- `atri_git_diff`;
- `atri_git_log`;
- `atri_git_show`;
- potentially other bounded Git-read evidence where it directly helps impact analysis.

The existing source-oriented tools may remain as convenient semantic shortcuts rather than being forced to represent every repository file as "source".

Sensitive/local data such as `.env*`, credentials, Secret storage, caches, node_modules, arbitrary data roots and paths outside the configured product checkout remain outside the default repository-read authority.

## 5. Build / Studio observation direction

The current Atria product already exposes Native Studio reads including project listing, project metadata, source listing, individual source reads, revisions, history and diffs.

Atria MCP can reach these through generic discovered Native API access today.

The intended design is to consider first-class Build/Studio read tools so an AI can reliably perform common tasks without first rediscovering the generic endpoint sequence.

Candidate semantic tools include:

- `atri_build_projects`;
- `atri_build_project`;
- `atri_build_files`;
- `atri_build_read`;
- `atri_build_history`;
- `atri_build_diff`;
- `atri_build_validation`;
- preview/status-oriented reads where justified.

These tools must wrap the existing Studio authority rather than read project storage directly.

## 6. Authorized product interaction

The MCP is not permanently read-only.

Some debugging and verification workflows require real Atria operations, including chat/message operations.

Examples explicitly required by the product direction include:

- sending a message;
- deleting a message;
- potentially editing or regenerating a message;
- navigating and operating the real UI during verification;
- other bounded product actions that are later approved for specific Atria domains.

All operations with side effects require user authorization.

### 6.1 Risk classes

The authorization model is now frozen at four semantic risk classes:

1. **READ**
   - observation only;
   - available by default within allowed scope;
   - examples: repository/source reads, Build source reads, Session/message reads, screenshots and diagnostics.

2. **INTERACT**
   - UI or product-state interaction that is normally recoverable and is primarily used for navigation/verification;
   - examples: navigation, view switching and bounded UI interaction;
   - requires explicit authorization when the action has side effects.

3. **MUTATE**
   - intentionally changes Atria product state without being primarily destructive;
   - examples: send message, regenerate, edit message, modify a Studio project or trigger other approved product actions;
   - requires explicit authorization.

4. **DESTRUCTIVE**
   - deletes or destructively replaces product/user state;
   - examples: delete message, delete Session, delete Project or destructive Library operations;
   - requires a stronger explicit authorization boundary.

"Sending a message" is MUTATE rather than DESTRUCTIVE. It may trigger paid model generation or other external effects, so it is never treated as a free read operation.

A browser click is not intrinsically low-risk: a click can invoke a destructive product action. Important/high-risk product operations should therefore prefer semantic MCP tools whose annotations reflect their real meaning rather than hiding that meaning behind a generic browser click.

### 6.2 Authorization model

A side-effecting capability is governed by three independent gates:

1. **MCP capability policy**
   - determines which domain/risk class this MCP session is eligible to invoke;
   - replaces the long-term idea of one global `--allow-writes` switch.

2. **AI-client/user approval**
   - the client must obtain actual user approval at the appropriate scope;
   - a model-supplied boolean is not by itself proof of human authorization.

3. **Atria authority**
   - Atria still performs authentication, CSRF, permission, revision/conflict and domain validation;
   - MCP authorization never bypasses product authority.

Supported approval scopes should include:

- **one-shot**: one exact operation/target;
- **session**: a bounded class of operations for the current AI/MCP session;
- **domain-session**: for example Chat=MUTATE while Build=READ;
- **narrow destructive lease**: a tightly scoped temporary permission, such as deleting only messages or temporary Projects created by the current MCP session.

There should be no permanent blanket MUTATE/DESTRUCTIVE grant that silently covers future tools.

DESTRUCTIVE operations default to one-shot approval. A destructive lease is allowed only when its scope is objectively enforceable by MCP/product identity, not merely described in natural language.

### 6.3 Side-effect metadata

Risk class and external side effects are separate dimensions.

Generation-triggering or otherwise externally consequential actions remain MUTATE but should expose metadata such as:

- `externalEffect: generation`;
- `mayIncurCost: true`;
- other bounded external-effect descriptors when useful.

Examples include chat send/regenerate and Agent runs that invoke configured model providers.

### 6.4 Browser interaction is not an authorization escape hatch

Browser observation operations such as open/wait/snapshot/screenshot/resize/scroll remain READ where they only observe state.

Generic browser click/fill/press/select is INTERACT-capable but may activate a product operation whose actual semantics are MUTATE or DESTRUCTIVE. Therefore:

- generic browser interaction must not be used to bypass a semantic tool's stricter authorization;
- when an important product operation has a semantic MCP tool, the semantic tool is preferred;
- broad UI-automation authorization must be explicit and must not silently grant DESTRUCTIVE authority;
- high-risk browser interactions should remain individually approvable unless the user explicitly grants a bounded automation scope.

## 7. Chat / message capability direction

Chat/session operations are a first-class required use case for MCP-assisted debugging.

Candidate semantic tools:

- `atri_chat_list`;
- `atri_chat_read`;
- `atri_chat_send`;
- `atri_chat_edit`;
- `atri_chat_regenerate`;
- `atri_chat_delete`.

The exact set and semantics are not yet frozen.

These operations must go through Atria's Session/message authority rather than editing persisted chat files or databases directly.

For generation-triggering operations, useful result metadata should expose non-secret execution identity/status where the product can provide it, such as session/message/generation identifiers and status. Provider credentials and secrets remain redacted.

## 8. Product-domain coverage and tool architecture

### 8.1 Product-domain coverage

The target MCP is accepted as an Atria-wide development bridge rather than a narrowly scoped source/Build debugger.

Subject to each domain's authority and security boundaries, the intended coverage includes:

| Domain | Default observation target | Authorized operation direction |
| --- | --- | --- |
| Repository / Git | tracked tree, files, search, status, diff, history and commit evidence | no source-code writes through MCP |
| Browser / UI | page structure, screenshots, frames, diagnostics and responsive state | bounded navigation and interaction |
| Chat / Session | sessions, messages, generation/runtime state | send, regenerate, edit, delete, create/switch where supported |
| Build / Studio | projects, sources, revisions, history, diffs, validation and preview state | create/modify/execute/delete through Studio authority |
| Library | resources, revisions, references and closure | attach/fork/update/delete through Library authority |
| Package / Work | manifests, exact versions, dependencies, contributions and permission/status evidence | bounded install/uninstall/activation-style operations through Package authority |
| Memory | entries/graph/search/diagnostic evidence exposed by product authority | approved mutation/cleanup through Memory authority |
| Agents | orchestration/task/run/diagnostic evidence | approved run/cancel/task/config operations |
| Settings | non-secret settings and provider/model metadata | approved ordinary settings mutation |
| Connections | provider/connection existence, capabilities and non-secret status | approved testing/configuration while never returning credential values |
| Diagnostics | product/runtime health, warnings/errors and bounded diagnostic evidence | bounded maintenance actions such as clearing MCP-owned diagnostic buffers |

This table is directional rather than a claim that every operation already exists in current product APIs.

### 8.2 Two-layer MCP tool architecture

The tool surface is accepted as two complementary layers.

**Generic foundation**

- `atri_api_*`
- `atri_repo_*`
- `atri_git_*`
- `atri_browser_*`

The foundation preserves broad discoverability and prevents MCP from becoming blind whenever Atria adds a new Native endpoint or repository surface.

**Semantic product tools**

- `atri_chat_*`
- `atri_build_*`
- `atri_library_*`
- `atri_package_*`
- `atri_memory_*`
- `atri_agent_*`
- other high-frequency or high-risk domain tools where semantics materially improve correctness or authorization.

Not every Native endpoint should become an individual MCP tool. Dedicated semantic tools are preferred when an operation is frequent, multi-step, easy to misuse through generic APIs, costly, or security/destruction sensitive.

For important destructive or state-changing operations, semantic tools should be preferred over performing the same action through generic browser interaction, because the tool name/schema/annotations can accurately expose the action's risk.

## 9. Security boundaries retained

Capability expansion does not imply access to credentials or unrelated local-machine state.

Continue to block or redact, as applicable:

- passwords;
- cookies;
- CSRF tokens;
- API keys and Secret values;
- Connection credentials;
- Secret-store endpoints;
- personal browser profiles;
- arbitrary paths outside the configured Atria checkout;
- direct unrestricted data-root scanning;
- arbitrary filesystem writes;
- arbitrary shell/JS/database execution.

Browser screenshots, DOM/accessibility text and product free text may themselves contain user content. Development/synthetic data remains the preferred verification environment.



## 10. Runtime/source/browser identity and verification provenance

Atria MCP must not assume that the configured source checkout, the running Atria server and the currently loaded browser page are the same build merely because they share a repository or Git HEAD.

### 10.1 Three identities

MCP should track three independent identities:

1. **Configured Source Identity**
   - the checkout MCP is reading;
   - includes full Git HEAD, branch and current source-content fingerprint;
   - reflects relevant tracked working-tree changes and detectable runtime-relevant untracked uncertainty.

2. **Runtime Identity**
   - the Atria server instance currently serving the configured origin;
   - includes an immutable per-process `runtimeBootId`, startup timestamp, app version, full revision/branch where available, and a startup source fingerprint;
   - should be exposed by Atria as a small non-secret product provenance authority rather than as an MCP-only backdoor.

3. **Browser-loaded Runtime Identity**
   - the runtime identity observed when the MCP-owned browser last opened/reloaded the Atria page;
   - lets MCP detect a stale page after the server restarts or the page otherwise outlives its runtime.

### 10.2 Source fingerprint

Git HEAD alone is insufficient because the runtime may have started before uncommitted tracked changes were made.

The source fingerprint should therefore derive from the committed base plus current runtime-relevant tracked content. The intended property is:

- same HEAD + same tracked runtime-relevant content => same fingerprint;
- same HEAD + modified tracked runtime-relevant content => different fingerprint.

The design should avoid unnecessarily hashing the entire repository when Git identity already covers unchanged tracked content.

Runtime-relevant untracked files must prevent a false `EXACT` claim unless their contents are safely incorporated into identity. A simple safe fallback is `UNVERIFIABLE` with an explicit reason until untracked handling is fully supported.

### 10.3 Match states

A boolean match is insufficient. The accepted direction includes states such as:

- `EXACT` — configured source content matches the runtime startup source identity;
- `SOURCE_CHANGED_SINCE_RUNTIME_START` — same base checkout/revision but current source content has changed since startup;
- `CONTENT_MATCH_DIFFERENT_WORKSPACE` — content identity matches even if filesystem/workspace identity differs;
- `DIFFERENT_REVISION` — configured source and runtime are clearly based on different revisions/content;
- `UNVERIFIABLE` — identity cannot be established strongly enough, including cases with unresolved runtime-relevant untracked files or missing build provenance.

Workspace paths may be used as local auxiliary evidence but are not authoritative identity because equivalent source can live at different paths or machines.

### 10.4 Runtime boot identity

Every Atria server process should have a unique `runtimeBootId`.

This distinguishes a real restart from a runtime that merely reports the same Git revision. It also lets the browser layer determine whether its currently loaded page belongs to the current runtime generation.

### 10.5 Browser freshness

MCP should separately report:

- Source ↔ Runtime identity;
- Runtime ↔ Browser freshness.

If the Atria server restarts after the MCP browser loaded a page, the browser state becomes stale until reload/open establishes the new runtime identity.

The strongest verification condition is:

`Source = Runtime` and `Browser = current Runtime`.

### 10.6 Mismatch behavior

Identity mismatch must not disable ordinary observation.

MCP may still read APIs, messages, screenshots, diagnostics or perform separately authorized product operations against a mismatched/older runtime when that is the user's intent.

The restriction is evidentiary:

- MCP must not claim that the currently configured source change has been runtime/UI verified when source/runtime/browser identity is mismatched or unverifiable;
- prompts such as `atria_verify_change` must surface this limitation explicitly.

### 10.7 Evidence binding

Important semantic operations and verification evidence should attach bounded runtime provenance where practical, for example:

- `runtimeBootId`;
- source/runtime fingerprint or revision identity;
- relevant timestamp/status.

This is especially useful for chat-generation tests, Build validation, Agent runs, screenshots and diagnostic captures.

The current Atria `/version` endpoint already exposes package version and Git revision/branch/commit metadata and can serve as a baseline, but it is not by itself sufficient for exact runtime/source identity.




## 11. Repository read and development-artifact policy

Repository visibility is intentionally broad, but it is not defined by a single "read any file" rule.

### 11.1 Canonical tracked repository

All Git-tracked Atria repository content inside the configured product checkout is readable by default unless it matches an explicit sensitive-data prohibition.

This includes, where present:

- root configuration and documentation;
- AGENTS / CLAUDE / maintenance guidance;
- package metadata and lockfiles;
- source, frontend, scripts and tests;
- Android/build tooling;
- workflows and CI configuration;
- Docker/configuration templates;
- checked-in plugins/runtime resources;
- other tracked text/config/code assets.

The current narrow `src/public/scripts/tests` source boundary should not remain the repository-wide visibility boundary.

### 11.2 Safe untracked development files

Safe, non-ignored untracked development files inside the configured Atria checkout should be readable.

This supports the common development sequence:

`create file -> run/test/debug -> stage/commit later`.

Repository/Git tools should clearly distinguish tracked, modified, staged and untracked evidence.

Safe runtime-relevant untracked content may participate in source identity. If it cannot be safely incorporated, the source/runtime match must degrade to `UNVERIFIABLE` rather than incorrectly claim `EXACT`.

### 11.3 Ignored generated/development artifacts

Ignored content is not automatically sensitive and must not be automatically invisible.

Known development/verification artifact areas should be exposed through a bounded artifact layer rather than through unrestricted repository recursion.

Candidate tools include:

- `atri_artifact_list`;
- `atri_artifact_read`;
- `atri_artifact_search`;
- `atri_artifact_image`;
- `atri_artifact_inspect`.

Useful examples include test results, Playwright screenshots, coverage output, Android/logcat/crash evidence and build outputs.

Artifact enumeration/search must remain bounded to avoid recursively scanning large generated trees by default.

### 11.4 Runtime configuration and logs use semantic access

Machine/runtime configuration such as local config files should not be returned wholesale by generic repository tools.

Prefer Atria-aware semantic snapshots that expose useful effective configuration while redacting credentials and sensitive values.

Likewise, product logs should prefer Atria diagnostics/logging authorities over raw logfile scraping when such authorities exist.

Raw artifact/log reads may still be available for known development evidence when appropriately bounded and filtered.

### 11.5 Product/user data is not repository data

User/product state must not become readable merely because its storage happens to live under the repository checkout.

Examples include chat/session data, user settings, Library state, Package state, Memory/vector data, backups and similar runtime-owned data.

These remain visible through their owning Atria semantic authorities:

- Chat/Session through chat/session tools;
- Memory through memory tools;
- Library through library tools;
- Package/Work through package tools;
- Settings through settings tools;
- other domains through their owning product surface.

Direct unrestricted `dataRoot` traversal remains outside repository-read authority.

### 11.6 Sensitive hard-deny layer

Sensitive content remains blocked regardless of whether it is tracked, untracked, ignored, generated or historically committed.

Examples include:

- `.env*`;
- Secret/credential stores;
- passwords, tokens and API keys;
- cookies and CSRF tokens;
- private keys and keystores;
- credential-bearing connection material.

Protection should combine path/category denial with output redaction for structured/free-text content so a benign filename cannot trivially bypass secret handling.

Historical Git reads such as diff/show/blame must apply the same sensitive policy and may report blocked files without returning their sensitive content.

### 11.7 Git-read capability

Atria MCP should support broad read-only Git evidence such as:

- status;
- working/staged/base-vs-head diffs;
- log;
- show;
- blame where useful.

MCP must not absorb the normal development Git write workflow. Operations such as fetch/pull/checkout/reset/clean/add/commit remain the responsibility of the AI client's normal development tools.

### 11.8 Binary and large-artifact handling

Text/code/config uses bounded textual read/search.

Images that are legitimate development artifacts may be returned as MCP image content.

Large binaries/archives should not be dumped into model context as large base64 payloads. Prefer semantic inspection returning identity, hashes, manifest/entry metadata, validation state and other useful bounded evidence.

### 11.9 Independent access policy

`.gitignore` is a version-control signal, not the MCP security policy.

Atria MCP should maintain an explicit repository-access classification such as:

- canonical tracked;
- safe untracked development;
- development artifact;
- product/user data;
- sensitive;
- dependency/cache.

Changes to `.gitignore` must not silently expand sensitive/user-data access.




## 12. Chat / Session semantic model

Chat/Session tools must preserve Atria Native Session authority rather than emulate mutable legacy chat CRUD.

### 12.1 Immutable Timeline is preserved

Committed Native Timeline messages/revisions are append-only and immutable.

MCP must not introduce an in-place committed-message edit/delete path merely to imitate conventional chat APIs.

User-facing intents such as edit, retry, restart and cleanup should map to Native revision/branch semantics.

### 12.2 Read surface

The accepted read direction includes semantic tools such as:

- `atri_session_list`;
- `atri_session_get`;
- `atri_chat_read`;
- `atri_chat_history`;
- `atri_chat_branches`;
- `atri_generation_status`.

Chat reads should expose useful Native identity/provenance where available, including session/message/revision/branch/sequence identity, role/content, attachments, projection and bounded generation/runtime metadata.

### 12.3 Send

`atri_chat_send` is a first-class MUTATE operation.

It should:

- require the target Session and expected current revision identity;
- fail closed on revision conflict rather than silently rebase;
- use the existing Session/generation authority;
- expose generation/cost side-effect metadata;
- return resulting message/revision/branch identity and runtime provenance.

### 12.4 Regenerate / retry

`atri_chat_regenerate` maps to Native retry semantics:

- find the coherent boundary before the current assistant reply;
- derive/fork the appropriate branch/revision;
- generate a new reply;
- preserve the original committed reply in history.

Regenerate is MUTATE with generation/cost side effects.

### 12.5 Re-enter instead of in-place edit

Committed user-message editing should be represented as `atri_chat_reenter`, not as an in-place `chat_edit`.

The semantic meaning is:

- derive from the coherent boundary before the target user turn;
- submit replacement user content on a new/derived branch;
- preserve the original branch/history.

### 12.6 Restart / branch operations

Accepted semantic direction includes:

- `atri_chat_restart_from`;
- `atri_chat_branch_switch`;
- `atri_chat_branch_fork`.

These are MUTATE operations because they change active Session state/branch selection while retaining immutable history.

Branch/history inspection remains READ.

### 12.7 Remove from active conversation

The user requirement to "delete/remove test messages" should be satisfied without physically mutating committed Timeline history.

A semantic operation such as `atri_chat_remove_from_active` should:

- derive or switch to a coherent branch/revision that excludes the target message and subsequent test content from the active Timeline;
- preserve the original historical branch/revisions;
- report where the removed active content remains recoverable.

This is normally MUTATE rather than DESTRUCTIVE because historical data is retained.

True physical deletion of an individual committed Native Timeline message is not part of the target MCP surface.

### 12.8 Session operations

Accepted Session-level semantic direction includes:

- READ: list/get/history/saves;
- MUTATE: rename, create save, restore save;
- DESTRUCTIVE: delete Session.

Restore/save operations preserve Native revision semantics and must not silently overwrite historical authority.

### 12.9 Generation cancellation

Generation initiated through MCP must have a corresponding cancellation/status surface.

The preferred direction is a shared generation authority such as:

- `atri_generation_status`;
- `atri_generation_stop`.

Cancellation is INTERACT-oriented: it stops in-flight work and should not fabricate a committed result.

### 12.10 Operation receipts

Important MUTATE/DESTRUCTIVE semantic tools should return a structured operation receipt where practical.

Useful fields include:

- operation identity/type;
- Session/project/domain identity;
- before/after revision and branch identity;
- objects/messages created by the MCP session;
- generation/operation identity;
- runtimeBootId / runtime provenance;
- whether and how the operation can be reversed or removed from the active state.

Receipts are the preferred basis for narrow cleanup leases such as "remove only test messages/Projects created by this MCP session", rather than heuristic ownership guesses.




## 13. Build / Studio semantic model

MCP Build/Studio operations should reuse Atria's existing revisioned authoring authority rather than expose a second direct-edit protocol.

### 13.1 Read surface

The accepted read direction includes semantic tools such as:

- `atri_build_list`;
- `atri_build_get`;
- `atri_build_revision`;
- `atri_build_files`;
- `atri_build_read`;
- `atri_build_history`;
- `atri_build_diff`;
- `atri_build_resources`;
- `atri_build_resource_closure`;
- `atri_build_validate`;
- `atri_build_preflight`;
- preview inventory/detail reads where useful.

Build/Studio reads must preserve exact Project/revision identity.

### 13.2 Workspace-first mutation

Normal Build mutation should use Atria Authoring Workspace/Operation semantics.

The preferred flow is:

`baseRevision -> operations -> workspace -> inspect/evaluate -> user authorization -> executeWorkspace -> ChangeSet/resultingRevision`.

Structured/domain authoring operations are preferred. Low-level source operations such as `source.write`, `source.move` and `source.delete` remain fallback operation types rather than the primary top-level MCP editing interface.

### 13.3 Prepare / inspect / evaluate / apply

Candidate semantic workflow:

- `atri_build_change_prepare` — construct/normalize an in-memory Workspace proposal;
- `atri_build_change_inspect` — inspect exact before/after change fingerprints without persisting;
- `atri_build_change_evaluate` — use Studio evaluation to temporarily apply, validate, preview and simulate, then restore the Project;
- `atri_build_change_apply` — execute the already-reviewed Workspace through Studio authority and return a ChangeSet/new revision.

Risk classification is semantic rather than HTTP-method based:

- prepare: no persistent side effect;
- inspect: READ;
- evaluate: INTERACT because it creates temporary runtime/preview state but restores Project source;
- apply: MUTATE.

### 13.4 Evaluate-before-apply binding

The preferred safe path requires a successful evaluation receipt before apply.

The evaluation receipt should bind at least:

- projectId;
- baseRevision;
- workspaceId;
- normalized operations fingerprint/hash;
- validation result;
- preview/simulation evidence where applicable.

Apply must re-check that the Project baseRevision and normalized operation set still match the evaluated proposal. Any change fails closed and requires re-evaluation.

This prevents a reviewed/evaluated proposal from drifting before execution.

### 13.5 Preview and simulation

Preview is a first-class MCP verification capability.

Candidate tools:

- `atri_build_preview_create`;
- `atri_build_preview_get`;
- `atri_build_preview_close`;
- `atri_build_simulate`.

Preview results are temporary/non-persisted and should compose with browser snapshot/screenshot/resize/diagnostics tools for real UI verification.

Simulation is INTERACT by default and may carry external-effect metadata if a particular simulation path invokes configured model/provider services.

### 13.6 Validation/preflight are semantically read-only

Operations such as validation and preflight remain READ-class even when implemented as POST endpoints because they do not intentionally mutate Project authority.

MCP risk classification must be based on product semantics, not HTTP verbs.

### 13.7 Project history and source delete

Studio Project-local Git history makes source writes/moves/deletes revisioned and recoverable.

Therefore source deletion inside an applied Workspace is normally:

- MUTATE;
- marked high-impact;
- not automatically classified as DESTRUCTIVE.

Deleting the entire Project remains DESTRUCTIVE.

Project deletion must retain current baseRevision/conflict protection.

### 13.8 MCP-created temporary Projects

`atri_build_create` may create test/minimal-reproduction Projects under MUTATE authorization.

Operation receipts should identify Projects created by the current MCP session so a narrow cleanup lease can safely permit deletion of only those Projects without granting permission to delete pre-existing user Projects.

### 13.9 Build/package artifacts

Building a Project may produce a large `.atria` archive.

MCP should not return the entire archive as model-context base64 by default.

A semantic build result should prefer bounded metadata such as:

- project/revision identity;
- manifest;
- PackageVersion identity;
- preflight result;
- archive size/hash/file name.

Actual artifact transfer should use a dedicated artifact/download path only when explicitly needed.

### 13.10 External Project Agent remains a separate domain

Atria's internal ProjectAgentService is not the default mutation path for an external Claude/Codex client using MCP.

External AI should normally use `atri_build_*` directly against Studio authority.

The internal Atria Project Agent remains a separate `atri_agent_*` product domain and should only be driven when the user explicitly wants that agent workflow, avoiding unnecessary AI-inside-AI delegation.




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




## 15. Memory + Agents semantic model

Memory and Agents currently own substantial first-party runtime authority in the browser capability layer rather than through the same backend Native HTTP pattern used by Session/Studio.

MCP should preserve those authorities instead of duplicating their state models.

### 15.1 Fixed Browser Capability Bridge

MCP may bridge selected first-party browser capabilities through a fixed, schema-validated allowlist.

Examples include methods exposed through:

- `Atria.getContext().getCapabilityApi('memory-graph')`;
- `Atria.getContext().getCapabilityApi('orchestrator')`;
- other future first-party capability APIs explicitly admitted by policy.

This bridge is not arbitrary JavaScript evaluation.

MCP must not expose:

- arbitrary `page.evaluate`;
- arbitrary module import;
- arbitrary `window` / DOM object access through JavaScript;
- dynamic function construction;
- arbitrary capability-name/method dispatch.

Every bridged method must have an explicit tool schema, risk class and output filter.

Bridge evidence is browser/runtime-bound and should include runtime/browser provenance where practical.

### 15.2 Memory read surface

Memory read capability should be broad and should reuse the existing Memory Graph read/session APIs.

The semantic direction includes:

- status/scope/store identity;
- schema;
- node and graph inspection;
- candidate/edge/node briefs;
- keyword search and exact-name resolution;
- vector search;
- recall;
- compaction candidates;
- current injection state;
- last recall projection, including the actual core/focus packets injected into generation.

This lets MCP distinguish:

- information absent from Memory;
- information present but not retrieved;
- information retrieved but not injected;
- information injected but ignored by the model.

### 15.3 Memory external-effect reads

Some logically read-only Memory operations may invoke embedding, reranking or query-rewrite providers.

These remain READ-class but carry external-effect metadata such as:

- provider/network activity;
- `mayIncurCost` where applicable.

Risk class and external effect remain separate dimensions.

### 15.4 Memory mutation

Accepted mutation direction includes semantic operations for:

- node create;
- node edit;
- relation upsert;
- compaction/rollup creation.

These are MUTATE operations. Compaction is high-impact because it changes graph hierarchy/projection while preserving its product-defined history/evidence semantics.

Physical node deletion and relation deletion are DESTRUCTIVE.

### 15.5 Memory concurrency/source guards

MCP must preserve Memory Graph's existing source-session/persistence guards.

Where practical, MCP should add optimistic identity/fingerprint checks for targeted node/graph edits so a stale read cannot silently overwrite a more recent Memory mutation.

This follows the same cross-domain pattern as:

- Session `expectedRevisionId`;
- Build `baseRevision`;
- Package `baseVersionId`.

### 15.6 Memory batch mutation

Generic unrestricted mutation batches should not become a normal low-level escape hatch.

If MCP supports multi-operation Memory maintenance, use a review/apply model whose computed risk is the highest risk of any included operation.

A batch containing delete operations is DESTRUCTIVE even if other operations are ordinary MUTATE.

### 15.7 Agent observation

Agent/Orchestrator observation should expose, where available:

- current run and status;
- graph/engine projection;
- execution timeline;
- node/step inspection;
- internal model calls;
- external tool calls;
- Memory recalls;
- token/cost accounting;
- errors/diagnostics;
- durable runtime checkpoints.

These are READ capabilities.

### 15.8 Agent delegated capability envelope

Starting an Agent run must not implicitly grant every capability allowed by the selected Agent preset.

Effective delegated authority is the intersection of:

1. capabilities/tools allowed by the selected Atria Agent/Preset;
2. capabilities allowed by Atria/product state;
3. capabilities authorized for the current MCP/user lease.

Agent delegation can only preserve or reduce current authority; it can never escalate it.

A preset that allows Memory deletion or web access does not grant those powers when the MCP lease denies them.

### 15.9 Agent run operations

The semantic direction includes:

- start Agent/Orchestrator run: MUTATE + generation/network/cost side-effect metadata;
- request live run stop: INTERACT;
- cancel/close durable runtime checkpoint: MUTATE because persistent execution state advances to a terminal cancellation state.

Runs should be bound to an explicit execution envelope containing target scope, preset/mode, delegated capabilities and relevant budgets/limits.

### 15.10 Agent run evidence

Agent runs should produce rich receipts/evidence including, where available:

- runId;
- preset/mode;
- start/end/status;
- model calls;
- tool calls;
- Memory recalls/mutations;
- tokens/cost;
- delegated capability envelope;
- denied capability/tool attempts;
- final output/error;
- runtime/source/browser provenance.

This evidence should make it possible to attribute a downstream mutation to the exact Agent/step/tool invocation that performed it.

### 15.11 Agent presets and bindings

MCP should allow broad read access to Agent/Orchestration presets and bindings.

User-managed preset/binding create/update is MUTATE. User-managed preset deletion is DESTRUCTIVE.

Atria-owned built-in presets that are automatically restored/repaired by product authority should not be represented as permanently deletable resources.

### 15.12 No automatic AI nesting

External Claude/Codex using MCP should directly use semantic Atria authorities by default.

MCP should invoke Atria's internal Project Agent/Orchestrator only when the user explicitly requests that agent workflow.

Avoid automatic external-AI -> MCP -> internal-AI nesting that adds cost and obscures responsibility without a user requirement.




## 16. Settings + Connections + Diagnostics semantic model

Settings, Runtime Connections and Diagnostics remain separate authorities rather than being collapsed into a generic settings/API dump.

### 16.1 Settings read surface

MCP should provide broad read access to the current user's non-secret settings through semantic, scoped tools such as:

- settings catalog;
- path/scoped settings get;
- settings search.

Avoid a primary `settings_dump` surface that returns the entire settings document by default.

Generation Runtime Connections/Models/Routes remain outside generic settings reads when a dedicated Native authority already owns them.

### 16.2 Settings mutation uses precise patches

MCP should prefer bounded RFC 6902-style settings patch operations rather than whole-document replacement.

A settings mutation should:

- read the targeted current value;
- include conflict/test guards where practical;
- patch only the intended fields;
- fail closed on stale state/conflict.

Ordinary settings patch is MUTATE.

Whole-settings snapshot restore, if ever exposed, is a higher-impact/destructive operation and should not be conflated with normal patching.

### 16.3 Runtime Connection / Model / Route observation

MCP may broadly read non-secret Native generation configuration, including:

- ConnectionProfiles;
- ModelProfiles;
- RuntimeRoutes;
- GenerationProfile / PromptProgram exact references;
- readiness/relationship information;
- Secret references/labels.

ConnectionProfile identity may expose `secretRef` but never the referenced Secret value.

### 16.4 Secret boundary

MCP may list opaque Secret references/labels needed to understand configuration readiness.

MCP must not expose tools that return Secret values, API keys, tokens, passwords or credential payloads.

Do not expose a model-visible `secret_create(value)` tool that requires raw credentials to pass through model context.

Credential entry should remain a user-facing Atria secure UI concern or another mechanism in which the model never receives the credential value.

### 16.5 Connection probe

Connection/provider probing is a first-class diagnostic operation.

The server may consume the referenced Secret internally while MCP receives only non-secret discovery/status/error results.

Probe is READ-class with external-effect metadata such as network activity and, where relevant, possible provider cost.

### 16.6 Runtime configuration mutation

Creating/updating ConnectionProfiles, ModelProfiles and RuntimeRoutes is MUTATE.

Deleting these resources is DESTRUCTIVE.

Existing Atria reference/conflict validation remains authoritative; MCP must not provide force deletion when a profile is still referenced.

### 16.7 Diagnostics read surface

Diagnostics is a first-class MCP domain.

The semantic direction includes:

- overview;
- modules/ownership metadata;
- bounded log query where product authorization permits;
- incidents list/detail/export;
- startup sessions/detail/compare;
- runtime provenance;
- Atria-owned health/diagnostic evidence.

Browser diagnostics remain separate:

- `atri_browser_diagnostics` describes the MCP-owned browser/page;
- `atri_diag_*` describes Atria product-owned diagnostic authority.

MCP should commonly correlate both.

### 16.8 Diagnostic snapshot

A high-level read-only `atri_diagnose_snapshot`-style tool is desirable.

It should compose existing authorities without gaining new privileges, summarizing:

- runtime/source identity and match;
- browser freshness/errors/failed requests;
- recent product diagnostics/incidents/startup state;
- provenance;
- active Session/Project/PackageVersion/revision identity where available.

This provides a fast first diagnostic pass before deeper source/API/domain investigation.

### 16.9 Diagnostic mutation/destruction

Creating an Incident from recent evidence is MUTATE because it creates a persistent diagnostic artifact.

Clearing Atria-owned backend diagnostic logs is DESTRUCTIVE and must preserve the existing product/Admin authorization boundary.

Clearing only MCP-owned ephemeral browser-diagnostic buffers may remain INTERACT/low-risk because it does not destroy Atria's product-owned evidence.

### 16.10 Native generic API boundary remains narrow

The generic `atri_api_*` foundation should remain constrained to the discovered/allowed Native API boundary rather than being broadened to unrestricted `/api/**`.

Legacy/general API areas such as Settings, Chats, Characters and other user-state routes should receive dedicated semantic authorities when needed.

Capability expansion happens by adding controlled authorities, not by removing the generic API boundary.




## 17. MCP tool-surface consolidation

The final MCP surface should not expose one top-level MCP tool per product action.

The preferred design is a compact fixed tool set backed by a typed Semantic Action Registry.

### 17.1 Semantic Action Registry

Atria product actions are registered under stable semantic IDs such as:

- `chat.send`;
- `chat.regenerate`;
- `build.source.read`;
- `build.change.evaluate`;
- `build.change.apply`;
- `library.revision.create`;
- `library.revision.delete`;
- `package.install.preflight`;
- `package.install`;
- `memory.node.edit`;
- `memory.node.delete`;
- `agent.run.start`;
- `agent.run.stop`;
- `settings.patch`;
- `connection.probe`;
- `diagnostics.incident.create`.

Every registered action has explicit metadata including domain, semantic risk, owning authority, schemas, side effects, availability and applicable safety/concurrency requirements.

This remains a strongly typed semantic product layer. It is not equivalent to arbitrary endpoint dispatch.

### 17.2 Four risk executors

Semantic product actions are invoked through four fixed MCP tools:

- `atri_read`;
- `atri_interact`;
- `atri_mutate`;
- `atri_destructive`.

The selected executor must match the registered action risk class.

Examples:

- `atri_read(action="build.source.read", ...)`;
- `atri_mutate(action="chat.send", ...)`;
- `atri_destructive(action="session.delete", ...)`.

A lower-risk executor cannot invoke a higher-risk action, and a destructive action cannot be hidden inside `atri_mutate`.

The executor tools can therefore expose accurate MCP read-only/destructive annotations while the Action Registry carries the finer Atria-specific policy.

### 17.3 Capability discovery

`atri_capabilities` is the semantic discovery surface.

It should support:

- full-text/action-ID search;
- domain filtering;
- risk filtering;
- exact action detail/schema lookup;
- availability/reason reporting.

The model should discover relevant actions on demand rather than receiving the entire product action catalog in every prompt.

### 17.4 Development/browser tools remain first-class

Not every capability belongs in the semantic executors.

Repository/Git/artifact/API observation and browser instrumentation remain dedicated MCP tools because they have distinct execution/input/output models.

The target fixed surface is approximately:

- `atri_status`;
- `atri_capabilities`;
- `atri_reference`;
- repository/Git/artifact/native-API observation tools;
- `atri_diagnose_snapshot`;
- focused browser lifecycle/observation/interaction tools;
- four semantic risk executors.

The exact final count may vary, but the target is roughly the high teens rather than dozens of per-action MCP tools.

### 17.5 Repository and API consolidation

Source read/search should evolve toward a repository-oriented tool surface capable of tree/read/search rather than preserving the historical narrow source-only vocabulary as the only entry point.

The generic Native API foundation should support discovery/detail/read-oriented requests, but it should not remain a generic state-changing escape hatch once semantic actions exist.

Important product writes must flow through the Semantic Action Registry so authorization/risk/receipt rules cannot be bypassed through arbitrary POST/PUT/DELETE endpoint calls.

### 17.6 Browser stays separate

Browser navigation, observation, screenshots and interaction remain dedicated `atri_browser_*` instrumentation rather than being folded into semantic product executors.

Browser is an observation/verification device with Playwright-specific concerns such as selectors, frames, viewport, image output and navigation lifecycle.

It must still obey the previously frozen rule that generic UI interaction cannot bypass stricter semantic authorization for recognized product operations.

### 17.7 Registry as policy center

The Action Registry is not merely a tool-count optimization.

It becomes the shared source of truth for:

- action identity and schema;
- risk classification;
- authorization requirements;
- side-effect/cost metadata;
- product authority ownership;
- concurrency/evaluation/reference-safety requirements;
- capability-lease checks;
- delegated Agent authority;
- operation-receipt metadata/audit.

This keeps authorization behavior consistent across domains rather than duplicating custom policy in dozens of independent MCP tools.


## 18. Diagnostic workflow target

A successful end-state workflow should allow an AI to move through evidence such as:

`repository/Git change -> impacted source/contracts -> Native API/product state -> real browser/runtime -> screenshot/diagnostics -> source root cause`

For Build/Studio issues the equivalent path should support:

`project -> source/revision/history -> runtime/preview -> browser evidence -> product/source diagnosis`

For chat/generation issues it should support:

`Session/message state -> relevant runtime/config -> authorized test message -> generation/UI result -> diagnostics -> source diagnosis -> authorized cleanup when requested`

## 19. Non-goals currently frozen

This expansion is not intended to:

- embed Atria product source into the `plugin` branch;
- merge `main` into `plugin`;
- replace normal code-editing, Git, test or build tools;
- create a second product persistence authority;
- bypass Native Session, Studio/ProjectStore, Library, Package or other Atria ownership rules;
- grant unattended destructive control over user data.

## 20. Open design topics

The following remain intentionally unresolved and should be settled through further discussion before implementation planning:

- concrete representation/storage of the accepted capability policy and leases;
- concrete Semantic Action Descriptor schema, capability-lease representation and operation-receipt format;
- the exact threshold for promoting a generic Native API operation into a dedicated semantic MCP tool;
- detailed artifact roots/types and bounded inspection rules;
- detailed client UX/naming for branch-derived message cleanup and re-entry;
- detailed client presentation of generation cost/external-provider side-effect metadata;
- exact enforcement mechanics for semantic-operation precedence over generic browser interaction;
- audit/evidence returned for authorized actions;
- compatibility and migration strategy from the current `--allow-writes` switch.

## 21. Discussion workflow

During the design discussion phase:

1. each round begins by updating this Plan with the conclusions accepted in the previous round;
2. only then does the next design topic begin;
3. the Plan records design intent and boundaries, not implementation history;
4. implementation and permanent verification history will use `records/plugin/**` once implementation starts;
5. the `plugin` implementation remains unchanged until the design is sufficiently frozen or the user explicitly starts implementation.
