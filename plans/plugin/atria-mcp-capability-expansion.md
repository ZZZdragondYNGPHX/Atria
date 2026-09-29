# Atria MCP Development Bridge Expansion

**Task ID:** `plugin/atria-mcp-capability-expansion`  
**Primary Workspace:** `plugin`  
**Plan Workspace:** `docs`  
**Status:** Discussion Draft v0.1  
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

The design should distinguish at least:

1. **READ**
   - observation only;
   - available by default within allowed scope.

2. **INTERACTIVE_WRITE**
   - intentional product actions with side effects but not primarily destructive;
   - examples: send message, regenerate, form interaction, create a disposable verification preview;
   - requires explicit authorization.

3. **DESTRUCTIVE_WRITE**
   - deletes or destructively replaces user/product state;
   - examples: delete message, delete Session, delete Project, destructive Library operations;
   - requires a stronger explicit authorization boundary.

"Sending a message" should not be classified as destructive merely because it is a write. It may nevertheless trigger paid model generation or other external effects, so it must never be treated as a free read operation.

### 6.2 Two-gate authorization

A side-effecting capability should require both:

- server/session-level enablement for the relevant capability class/domain; and
- explicit per-operation approval represented in the actual tool call.

The existing broad `--allow-writes + confirm=true` pattern is directionally correct, but the final design should consider capability-scoped enablement rather than making one switch implicitly authorize every writable Atria domain.

Possible capability groups for later discussion include chat actions, Studio actions, Library actions and destructive actions.

A successful operation must still pass Atria's own authentication, CSRF, permission, revision/conflict and domain validation. MCP authorization never bypasses Atria authority.

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

## 8. Security boundaries retained

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

## 9. Diagnostic workflow target

A successful end-state workflow should allow an AI to move through evidence such as:

`repository/Git change -> impacted source/contracts -> Native API/product state -> real browser/runtime -> screenshot/diagnostics -> source root cause`

For Build/Studio issues the equivalent path should support:

`project -> source/revision/history -> runtime/preview -> browser evidence -> product/source diagnosis`

For chat/generation issues it should support:

`Session/message state -> relevant runtime/config -> authorized test message -> generation/UI result -> diagnostics -> source diagnosis -> authorized cleanup when requested`

## 10. Non-goals currently frozen

This expansion is not intended to:

- embed Atria product source into the `plugin` branch;
- merge `main` into `plugin`;
- replace normal code-editing, Git, test or build tools;
- create a second product persistence authority;
- bypass Native Session, Studio/ProjectStore, Library, Package or other Atria ownership rules;
- grant unattended destructive control over user data.

## 11. Open design topics

The following remain intentionally unresolved and should be settled through further discussion before implementation planning:

- the complete domain/action matrix: Chat, Session, Build/Studio, Library, Package, Memory, Agents, Settings and other Native domains;
- exact capability-group and authorization UX;
- which actions deserve dedicated semantic MCP tools versus generic discovered Native API access;
- exact Git/repository read surface and limits;
- edit/regenerate/delete semantics for message history;
- handling of generation cost/external-provider side effects;
- whether browser interaction should share the same capability groups as semantic product actions;
- audit/evidence returned for authorized actions;
- compatibility and migration strategy from the current `--allow-writes` switch.

## 12. Discussion workflow

During the design discussion phase:

1. each round begins by updating this Plan with the conclusions accepted in the previous round;
2. only then does the next design topic begin;
3. the Plan records design intent and boundaries, not implementation history;
4. implementation and permanent verification history will use `records/plugin/**` once implementation starts;
5. the `plugin` implementation remains unchanged until the design is sufficiently frozen or the user explicitly starts implementation.
