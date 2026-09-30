# Atria MCP Capability Expansion — Memory & Agents

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 15. Memory + Agents semantic model

Memory and Agents currently own substantial first-party runtime authority in the browser capability layer rather than through the same backend Native HTTP pattern used by Session/Studio.

MCP should preserve those authorities instead of duplicating their state models.


### 15.1 Fixed Browser Capability Bridge

A fixed Browser Capability Bridge remains necessary, but its scope is narrower after Native Frontend v3.

It may bridge selected first-party browser capability methods that do not have an equivalent stable server authority, including explicitly allowlisted methods from:

- `Atria.getContext().getCapabilityApi('memory-graph')`;
- `Atria.getContext().getCapabilityApi('orchestrator')`;
- selected `Atria.getContext().getCapabilityApi('game-runtime')` methods where browser/runtime ownership is real and no stronger server authority exists.

Server-owned Native Session, Studio, Library/Package, Diagnostics and Native Frontend v3 endpoints are preferred whenever they already express the required authority.

The Native Frontend v3 **Frontend Host Bridge** and this MCP **Browser Capability Bridge** are different layers:

- Frontend Host Bridge is Package Frontend ↔ Host typed product authority;
- Browser Capability Bridge is MCP ↔ selected first-party browser capability API adaptation.

MCP must not expose arbitrary Frontend Host Bridge binding dispatch as a generic product-operation escape hatch. It may inspect/verify the formal bridge/runtime where useful, while product mutations continue through the most direct owning authority and MCP Action Registry.

This bridge is not arbitrary JavaScript evaluation.

MCP must not expose:

- arbitrary `page.evaluate`;
- arbitrary module import;
- arbitrary `window` / DOM object access through JavaScript;
- dynamic function construction;
- arbitrary capability-name/method dispatch.

Every bridged method has an explicit schema, risk class, availability rule and output filter.

Bridge evidence is browser/runtime-bound and should include `serverBootId` plus applicable Session/Experience provenance where practical.


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
