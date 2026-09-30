# Atria MCP Capability Expansion — Authorization, Security & Provenance

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

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

Native Frontend v3 makes it important to distinguish two related but different provenance chains. MCP must not collapse them.

### 10.1 Product checkout / server / browser-shell provenance

The first chain verifies the Atria product itself:

1. **Configured Product Source Identity**
   - the checkout MCP is reading;
   - full Git HEAD/branch plus a current source-content fingerprint;
   - relevant tracked working-tree state and detectable runtime-relevant untracked uncertainty.

2. **Server Runtime Identity**
   - the currently running Atria server process;
   - canonical boot identity is the existing product `serverBootId`;
   - includes process startup timestamp, app version, full revision/branch and startup source-content identity where available.

3. **Browser-loaded Server Identity**
   - the Server Runtime Identity captured when the MCP-owned page last opened/reloaded;
   - lets MCP detect a browser page that survived a server restart.

MCP must not introduce a second product boot identity named `runtimeBootId` when `serverBootId` already provides the required per-process uniqueness. Client-facing MCP output may describe it generically as a runtime boot identity, but product identity is canonicalized to `serverBootId`.

### 10.2 Product source fingerprint

Git HEAD alone is insufficient because the runtime may have started before uncommitted tracked changes were made.

The source fingerprint should derive from the committed base plus current runtime-relevant tracked content. The intended property is:

- same HEAD + same tracked runtime-relevant content => same fingerprint;
- same HEAD + modified tracked runtime-relevant content => different fingerprint.

Runtime-relevant untracked files must prevent a false `EXACT` claim unless their contents are safely incorporated into identity. A safe fallback is `UNVERIFIABLE` with an explicit reason.

The server must capture its startup source identity once; recomputing the current checkout later cannot prove what bytes the process actually started from.

### 10.3 Existing product authority and remaining product gap

Current product authority already provides:

- `/version` app/Git revision/branch metadata;
- per-process `serverBootId` and process-start timing in the startup diagnostics subsystem;
- persisted/inspectable startup sessions that bind client startup evidence to `serverBootId` and version metadata;
- product diagnostics provenance for extensions/server plugins/external services.

These are reusable and must not be duplicated.

The remaining Phase 2 product addition should be minimal: expose one authenticated/non-secret **current runtime identity** view through an existing product diagnostics/version authority, binding at least:

- `serverBootId`;
- process startup timestamp;
- app version;
- full Git revision and branch where available;
- startup source fingerprint and any uncertainty reason.

The existing diagnostics provenance registry is module/service provenance, not a substitute for checkout/runtime source identity.

### 10.4 Match states

A boolean match is insufficient. Product Source ↔ Server Runtime comparison includes states such as:

- `EXACT`;
- `SOURCE_CHANGED_SINCE_RUNTIME_START`;
- `CONTENT_MATCH_DIFFERENT_WORKSPACE`;
- `DIFFERENT_REVISION`;
- `UNVERIFIABLE`.

Workspace paths are auxiliary evidence only.

### 10.5 Browser freshness

MCP separately reports:

- Product Source ↔ Server Runtime identity;
- Server Runtime ↔ Browser-loaded Server Runtime freshness.

If the server restarts after the MCP browser loaded a page, the page is stale until reload/open captures the new `serverBootId`.

The strongest product-code verification condition remains:

`Product Source = Server Runtime` and `Browser = current Server Runtime`.

### 10.6 Native Frontend v3 Experience provenance

Native Frontend v3 adds a second, nested provenance plane for a running Experience.

An **Experience Epoch** is not a server boot identity. It is a Session/frontend-lifetime identity that changes when operations such as restore, branch switch or reload invalidate scoped frontend handles.

Where relevant, MCP evidence should preserve:

- Session id;
- branch/revision identity;
- exact PackageVersion/package content identity;
- frontend kind/version;
- Experience Epoch;
- compiled Bridge/runtime descriptor digest where exposed.

A stale Experience Epoch must invalidate frontend-scoped evidence even when the server `serverBootId` is unchanged.

### 10.7 Studio Project / Preview provenance

Studio Preview verifies authoring content, not just product checkout source.

For Preview-driven verification MCP should bind:

`Project baseRevision -> Workspace/operations fingerprint -> evaluation -> Preview -> compiled PackageVersion/runtime descriptor -> browser evidence`.

Useful exact evidence includes:

- projectId/baseRevision;
- workspaceId + normalized operations fingerprint;
- validation result;
- previewId;
- exact preview packageVersionId/package content identity where exposed;
- entryPoint/frontend version;
- descriptor/Bridge identity;
- browser surface/viewport evidence.

Native Frontend v3 already supplies most of this authority. MCP should wrap it in evaluation/operation receipts rather than add a parallel product provenance store.

### 10.8 Mismatch behavior and evidence binding

Identity mismatch must not disable ordinary observation.

MCP may still read APIs/messages/screenshots/diagnostics or perform separately authorized actions against a mismatched runtime when that is the user's intent. The restriction is evidentiary: it must not claim that a current source or authoring change was verified against runtime/UI evidence whose applicable provenance chain is mismatched or unverifiable.

Important evidence/receipts should bind the relevant identities separately:

- `serverBootId` for server-process provenance;
- source/runtime revision/fingerprint;
- Session revision/branch;
- Experience Epoch when frontend-scoped;
- Studio Project/Workspace/Preview identities when Preview-scoped;
- timestamp/status.

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
