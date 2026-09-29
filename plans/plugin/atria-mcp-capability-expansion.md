# Atria MCP Development Bridge Expansion

**Task ID:** `plugin/atria-mcp-capability-expansion`  
**Primary Workspace:** `plugin`  
**Plan Workspace:** `docs`  
**Status:** Discussion Draft v0.3  
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

## 10. Diagnostic workflow target

A successful end-state workflow should allow an AI to move through evidence such as:

`repository/Git change -> impacted source/contracts -> Native API/product state -> real browser/runtime -> screenshot/diagnostics -> source root cause`

For Build/Studio issues the equivalent path should support:

`project -> source/revision/history -> runtime/preview -> browser evidence -> product/source diagnosis`

For chat/generation issues it should support:

`Session/message state -> relevant runtime/config -> authorized test message -> generation/UI result -> diagnostics -> source diagnosis -> authorized cleanup when requested`

## 11. Non-goals currently frozen

This expansion is not intended to:

- embed Atria product source into the `plugin` branch;
- merge `main` into `plugin`;
- replace normal code-editing, Git, test or build tools;
- create a second product persistence authority;
- bypass Native Session, Studio/ProjectStore, Library, Package or other Atria ownership rules;
- grant unattended destructive control over user data.

## 12. Open design topics

The following remain intentionally unresolved and should be settled through further discussion before implementation planning:

- concrete representation/storage of the accepted capability policy and leases;
- detailed action semantics within each accepted product domain;
- the exact threshold for promoting a generic Native API operation into a dedicated semantic MCP tool;
- exact Git/repository read surface and limits;
- edit/regenerate/delete semantics for message history;
- detailed client presentation of generation cost/external-provider side-effect metadata;
- exact enforcement mechanics for semantic-operation precedence over generic browser interaction;
- audit/evidence returned for authorized actions;
- compatibility and migration strategy from the current `--allow-writes` switch.

## 13. Discussion workflow

During the design discussion phase:

1. each round begins by updating this Plan with the conclusions accepted in the previous round;
2. only then does the next design topic begin;
3. the Plan records design intent and boundaries, not implementation history;
4. implementation and permanent verification history will use `records/plugin/**` once implementation starts;
5. the `plugin` implementation remains unchanged until the design is sufficiently frozen or the user explicitly starts implementation.
