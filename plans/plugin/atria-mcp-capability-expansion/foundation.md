# Atria MCP Capability Expansion — Foundation

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

**Task ID:** `plugin/atria-mcp-capability-expansion`  
**Primary Workspace:** `plugin`  
**Plan Workspace:** `docs`  
**Status:** Approved Implementation Plan v1.1 — Post-Frontend-Refactor Revalidated  
**Current implementation baseline:** `plugin@c125b2e7b63ed035a0a253c4036cbdb6bd273225`  
**Product revalidation baseline:** `main@c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`  
**Revalidation source docs baseline:** `docs@d540d35b74f5f3cbcc8eee1ea0565e8164b6ff7f`  
**Implementation path:** `plugin:atria-mcp/`  
**Design state:** Frozen for implementation after 2026-09-29 revalidation; material changes require explicit user approval and Plan update.

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

The Plugin implementation baseline remains `plugin@c125b2e7b63ed035a0a253c4036cbdb6bd273225`. No MCP implementation work has occurred since the original design freeze.

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

### 2.1 Post-Frontend-Refactor revalidation baseline

This Plan was revalidated on 2026-09-29 against:

- `main@c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`;
- `plugin@c125b2e7b63ed035a0a253c4036cbdb6bd273225`;
- pre-update `docs@d540d35b74f5f3cbcc8eee1ea0565e8164b6ff7f`;
- completed Native Frontend Runtime v3 Plan/Record.

The product baseline has materially advanced since the prior MCP design baseline `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`.

Native Frontend Runtime v3 is now the formal non-Text frontend path and provides:

- Source-only Studio authoring with a compiled exact Runtime Graph;
- Preview and Production on the same compiler/renderer semantics;
- a versioned Frontend Host Bridge with typed Reads / Actions / Operations;
- exact binding schemas/digests, revision guards, idempotency and Bridge receipts;
- fixed Host Conversation / Session / Media / Presentation / External services;
- separate committed Conversation and ephemeral GenerationProjection semantics;
- Experience Epoch revocation for stale handles/cursors/async completion;
- Native Frontend Source Graph inspection, source-addressable diagnostics and semantic `frontend.patch` authoring;
- formal Studio evaluation/Preview paths that restore Project source after temporary evaluation;
- Script Sandbox / Canvas / Media / recovery diagnostics under Host-owned authority.

The broader product also already has a per-process `serverBootId` in the existing startup diagnostics authority. This satisfies the unique process-boot identity requirement in substance. MCP must reuse that canonical identity instead of adding a second synonymous `runtimeBootId`.

Important remaining provenance gap: the product does not yet expose one direct current-runtime identity document that binds `serverBootId` to a full Git revision plus a startup-time source-content fingerprint. Existing `/version`, startup sessions and diagnostics provenance are useful evidence but are not by themselves sufficient to prove Source ↔ Runtime exactness after the checkout changes.

The revalidation therefore changes the amount and placement of work, but not the core MCP philosophy:

- Phase 2 product work is reduced;
- Native Frontend v3 / Studio authorities should be reused rather than duplicated;
- the fixed Browser Capability Bridge remains necessary only for first-party browser capability APIs that do not have an equivalent stable server authority;
- the fixed 18-tool MCP surface and Descriptor / Policy Ceiling / Lease / Receipt model remain appropriate.

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
