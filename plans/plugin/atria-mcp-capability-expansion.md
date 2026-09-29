# Atria MCP Development Bridge Expansion

**Task ID:** `plugin/atria-mcp-capability-expansion`  
**Primary Workspace:** `plugin`  
**Plan Workspace:** `docs`  
**Status:** Discussion Draft v0.5  
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


## 12. Diagnostic workflow target

A successful end-state workflow should allow an AI to move through evidence such as:

`repository/Git change -> impacted source/contracts -> Native API/product state -> real browser/runtime -> screenshot/diagnostics -> source root cause`

For Build/Studio issues the equivalent path should support:

`project -> source/revision/history -> runtime/preview -> browser evidence -> product/source diagnosis`

For chat/generation issues it should support:

`Session/message state -> relevant runtime/config -> authorized test message -> generation/UI result -> diagnostics -> source diagnosis -> authorized cleanup when requested`

## 13. Non-goals currently frozen

This expansion is not intended to:

- embed Atria product source into the `plugin` branch;
- merge `main` into `plugin`;
- replace normal code-editing, Git, test or build tools;
- create a second product persistence authority;
- bypass Native Session, Studio/ProjectStore, Library, Package or other Atria ownership rules;
- grant unattended destructive control over user data.

## 14. Open design topics

The following remain intentionally unresolved and should be settled through further discussion before implementation planning:

- concrete representation/storage of the accepted capability policy and leases;
- detailed action semantics within each accepted product domain;
- the exact threshold for promoting a generic Native API operation into a dedicated semantic MCP tool;
- detailed artifact roots/types and bounded inspection rules;
- edit/regenerate/delete semantics for message history;
- detailed client presentation of generation cost/external-provider side-effect metadata;
- exact enforcement mechanics for semantic-operation precedence over generic browser interaction;
- audit/evidence returned for authorized actions;
- compatibility and migration strategy from the current `--allow-writes` switch.

## 15. Discussion workflow

During the design discussion phase:

1. each round begins by updating this Plan with the conclusions accepted in the previous round;
2. only then does the next design topic begin;
3. the Plan records design intent and boundaries, not implementation history;
4. implementation and permanent verification history will use `records/plugin/**` once implementation starts;
5. the `plugin` implementation remains unchanged until the design is sufficiently frozen or the user explicitly starts implementation.
