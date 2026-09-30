# Atria MCP Capability Expansion — Plan Index

- Task ID: `plugin/atria-mcp-capability-expansion`
- Primary Workspace: `plugin`
- Status: Approved Implementation Plan v1.1 — Post-Frontend-Refactor Revalidated; Phase 6 acceptance remains open.
- Live state: `docs:HANDOFF.md` and `records/plugin/atria-mcp-capability-expansion.md`.

## Goal

Make Atria MCP the AI-facing Atria-specific observation, diagnosis and controlled product-operation bridge while normal coding tools remain responsible for source editing and the general development toolchain.

## Frozen core principles

- Broad observation; explicit, narrowly authorized mutation.
- Atria product authorities remain authoritative; MCP does not become a second persistence layer.
- No generic computer-control, arbitrary JS, arbitrary Native write, force or confirmation escape hatch.
- Source / Server / Browser / Experience / Project provenance stays explicit and fails closed on ambiguity.
- Mutation follows the frozen Descriptor → policy/guards → approval/lease → execution → Receipt model.
- Generic Native API remains read-oriented.

## Module map

| Module | Authority | Depends on |
| --- | --- | --- |
| `foundation.md` | Purpose, revalidated baseline, product philosophy, repository observation | — |
| `build-studio.md` | Build / Studio observation and semantic model | `foundation.md` |
| `authorization-provenance.md` | Interaction authorization, security, runtime/source/browser identity, repository-access policy | `foundation.md` |
| `chat-session.md` | Chat / Session semantics | `authorization-provenance.md` |
| `library-package.md` | Library / Work / PackageVersion semantics | `authorization-provenance.md` |
| `memory-agents.md` | Memory and delegated Agent semantics | `authorization-provenance.md`, `tool-surface.md` |
| `settings-diagnostics.md` | Settings / Connections / diagnostics | `authorization-provenance.md` |
| `tool-surface.md` | Domain coverage, fixed 18-tool surface, descriptors, ceilings, leases and receipts | `foundation.md` |
| `implementation.md` | Phase plan, v0.2 cutover, kickoff/diagnostic workflow, frozen post-revalidation decisions | all domain modules as routed |
| `acceptance.md` | Definition of Done / acceptance matrix and frozen non-goals | all modules |

## Stage routing

| Stage | Required modules |
| --- | --- |
| Phase 1 — MCP Kernel / Repository Observation | `index.md`, `foundation.md`, `authorization-provenance.md`, `tool-surface.md`, `implementation.md` |
| Phase 2 — Runtime Provenance / Fixed Capability Adapters | `index.md`, `authorization-provenance.md`, `settings-diagnostics.md`, `tool-surface.md`, `implementation.md` |
| Phase 3 — Full Read Authority | `index.md`, `tool-surface.md`, `implementation.md`, plus only the domain modules whose READ actions are being implemented |
| Phase 4 — Authorization / Receipts / Safe Mutations | `index.md`, `authorization-provenance.md`, `tool-surface.md`, `implementation.md`, plus only the mutation-domain modules being enabled |
| Phase 5 — High-risk Operations / Package / Agent Delegation | `index.md`, `authorization-provenance.md`, `library-package.md`, `memory-agents.md`, `tool-surface.md`, `implementation.md` |
| Phase 6 — Integration / Security / Native Frontend v3 Verification | `index.md`, `authorization-provenance.md`, `chat-session.md`, `memory-agents.md`, `settings-diagnostics.md`, `tool-surface.md`, `implementation.md`, `acceptance.md` |

For the current Phase 6 checkpoint, do not load `build-studio.md` or `library-package.md` by default unless new evidence specifically requires them.

## Validation strategy

Normative acceptance criteria live in `acceptance.md`. Actual executed evidence, remaining environment gates and exact HEADs live in the Record/HANDOFF.

## Material routing/design changes

- **2026-09-30 — Plan Bundle migration:** the former monolithic Plan was split by existing top-level authority domains. No approved MCP capability/security decision was intentionally changed.
