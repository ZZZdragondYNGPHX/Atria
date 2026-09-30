# Atria Native Content & Session Architecture Refactor — Plan Index

- Task ID: `refactor/atria-native-content-session-architecture`
- Primary Workspace: `main`
- Status: Historical completed/integrated architecture. Use current Records/remote state for execution facts.

## Goal

Replace Character Card/chat-file product identity and persistence with Native Package, Project, World/Knowledge, Session, Branch/Timeline, Revision, SavePoint and `.atriasave` authorities.

## Frozen core principles

- Native product identity is not legacy Character/Card/chat-file identity.
- Runtime compatibility is a one-way projection, never persistence authority.
- Package / Session / World / Knowledge identity and revision boundaries are explicit.
- Committed Timeline is immutable within the defined Variant/annotation rules.
- Native Context is bounded and compiled from Native authorities rather than exposing storage wholesale.

## Module map

| Module | Authority | Depends on |
| --- | --- | --- |
| `identity-package-storage.md` | Goal, hard cut, vocabulary, identity, Package, EntryPoint, versions, `.atria`, Project, AssetStore | — |
| `world-knowledge.md` | Native World / Knowledge model | `identity-package-storage.md` |
| `session-runtime.md` | Session, BranchGraph, Timeline, state, revisions, saves, storage, compatibility adapter | `identity-package-storage.md` |
| `immutability-context.md` | Timeline immutability and bounded Native Context | `session-runtime.md`, `world-knowledge.md` |
| `product-sync.md` | Product UX and sync/backup boundary | preceding authority modules |
| `implementation.md` | N0–N10 phase design, verification strategy, workflow, non-goals | routed modules |
| `invariants-next.md` | Architectural invariants and historical next-action section | all authority modules |
| `legacy-implementation-history.md` | Old in-Plan execution notes retained for audit only | — |

## Stage routing

| Stage | Required modules |
| --- | --- |
| N0 — Native Contracts & Identity | `index.md`, `identity-package-storage.md`, `invariants-next.md`, `implementation.md` |
| N1 — Native Storage Foundation | `index.md`, `identity-package-storage.md`, `session-runtime.md`, `implementation.md` |
| N2 — Package / Project / World & Knowledge Composition | `index.md`, `identity-package-storage.md`, `world-knowledge.md`, `implementation.md` |
| N3 — Native Session Core | `index.md`, `session-runtime.md`, `implementation.md` |
| N4 — Native Runtime Projection & Write Barrier | `index.md`, `session-runtime.md`, `immutability-context.md`, `implementation.md` |
| N5 — Native Runtime State & Revision Lifecycle | `index.md`, `session-runtime.md`, `immutability-context.md`, `implementation.md` |
| N6 — Native Knowledge Runtime Integration | `index.md`, `world-knowledge.md`, `session-runtime.md`, `implementation.md` |
| N7 — Native Context Architecture | `index.md`, `immutability-context.md`, `implementation.md` |
| N8 — Save System / `.atriasave` | `index.md`, `session-runtime.md`, `implementation.md` |
| N9 — Product UI Cutover | `index.md`, `product-sync.md`, `implementation.md` |
| N10 — Hard Cutover & Legacy Retirement | `index.md`, `invariants-next.md`, `implementation.md` |

`legacy-implementation-history.md` is not required for ordinary new work; load it only to reconstruct an old checkpoint not sufficiently captured by Records.

## Material routing/design changes

- **2026-09-30 — Plan Bundle migration:** design sections were split by authority domain. Legacy execution notes embedded in the old Plan were isolated as historical material instead of being treated as current Plan design.
