# Atria MCP Capability Expansion — Tool Surface & Action Contracts

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

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

## 17. MCP tool-surface consolidation

The final MCP surface should not expose one top-level MCP tool per product action.

The preferred design is a compact fixed tool set backed by a typed Semantic Action Registry.

### 17.1 Semantic Action Registry

Atria product actions are registered under stable semantic IDs such as:

- `chat.send`;
- `chat.regenerate`;
- `build.source.read`;
- `build.frontend.inspect`;
- `build.frontend.evaluate`;
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

The final v0.2.0 public count is frozen at the 18 tools listed in section 20. Semantic-domain growth belongs in the Action Registry rather than new per-domain top-level tools unless a later approved Plan changes that contract.

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

## 18. Semantic action contracts: Descriptor, Lease and Receipt

The Semantic Action Registry is governed by three explicit contracts:

- Action Descriptor — what an action is and how it may execute;
- Capability Lease — what the user has authorized for this MCP instance/session;
- Operation Receipt — what actually happened.

These replace the current coarse `--allow-writes + confirm=true` model.

### 18.1 Action Descriptor

Every registered semantic action must have a versioned descriptor containing at least:

- stable action id;
- domain/title;
- semantic risk class;
- owning authority/adapter;
- input/output schema;
- external-effect metadata;
- required guards;
- approval/lease characteristics;
- availability requirements.

The action id determines its authority. The model cannot choose or override the implementation authority.

Example authorities include:

- Native Session;
- Native Studio;
- Native Library/Product;
- fixed Browser Capability Bridge for Memory/Orchestrator.

### 18.2 Guard metadata

Descriptors should declare execution guards rather than relying on ad-hoc per-tool behavior.

Guard classes include, where applicable:

- optimistic concurrency / expected revision;
- preflight;
- prior evaluation receipt;
- reference/delete safety;
- exact artifact/content identity;
- product Source ↔ Server Runtime identity requirements;
- Browser-loaded `serverBootId` freshness;
- Session revision/branch and Native Frontend Experience Epoch where applicable;
- Studio Project/Workspace/Preview compiled-artifact identity where applicable.

Examples:

- Chat send requires expected Session revision;
- Build apply requires base revision + matching evaluation receipt;
- Package install requires reviewed artifact/preflight + base PackageVersion;
- Library destructive actions require delete/reference safety;
- Memory targeted edits should use stale-state/fingerprint protection where practical.

If a product guard already proves an action invalid, MCP should fail before asking the user for approval.

### 18.3 Policy Ceiling

The MCP server has a maximum capability policy for the lifetime of that server instance.

The Policy Ceiling determines which actions/scopes are ever eligible to execute and replaces the long-term role of one global `--allow-writes` switch.

Default policy is READ-oriented.

A future explicit policy file/profile may define allowed action sets by risk/domain/scope, but newly added actions must not silently inherit broad historical grants.

### 18.4 Capability Lease

A Capability Lease is server-minted, opaque authorization state produced from a real user approval path.

A lease may bind:

- exact action IDs;
- target/object scope such as Session/Project IDs;
- maximum uses;
- issuance/expiry;
- MCP instance identity;
- narrow machine-verifiable ownership conditions such as objects created by specific receipts.

Leases are not model-authored policy documents.

The model may carry a `leaseId`, but cannot modify the lease's grants/scope/expiry.

Domain shortcuts, if supported in UX, must expand to a fixed current action-ID set at lease issuance so future actions do not silently inherit old authorization.

### 18.5 Approval channel

The preferred user-approval mechanism is a trusted MCP/client round-trip approval/elicitation mechanism when available.

The current model-supplied `confirm=true` pattern is not considered proof of human approval and should be retired.

When a trusted round-trip approval channel is unavailable:

- use the server Policy Ceiling plus the client's own tool-approval mechanism for one-shot execution where appropriate;
- do not mint broader session/domain leases from an untrusted model boolean;
- do not fall back to pretending `confirm=true` is equivalent to human consent.

### 18.6 Destructive leases

DESTRUCTIVE operations default to one-shot approval.

Broader destructive leases are allowed only for objectively enforceable narrow cleanup scopes, for example:

- Sessions created by this MCP instance;
- Projects created by specific MCP receipts;
- other objects whose origin can be cryptographically/structurally tied to MCP receipts.

Natural-language-only scopes such as "delete test things" are insufficient for destructive authority.

### 18.7 Operation Receipt

INTERACT, MUTATE and DESTRUCTIVE semantic actions should emit a versioned Operation Receipt where practical.

A common receipt shape should support:

- receipt id/version;
- action id/risk/status;
- start/end timestamps;
- target identity;
- before/after authority identity;
- created/changed/deleted objects;
- external effects;
- product source/server/browser provenance, using canonical `serverBootId`;
- Session/branch/revision and Experience Epoch where applicable;
- Project/Workspace/Preview/compiled-artifact provenance where applicable;
- recovery/reversibility information;
- parent/child receipt linkage.

Sensitive credentials/Secrets must never enter receipts.

### 18.8 Receipt ownership and cleanup

Receipts should identify MCP provenance more strongly than a simple boolean.

Useful origin fields include:

- MCP instance id;
- parent receipt id;
- creating receipt id for created objects.

This enables narrow cleanup leases to verify exactly which objects were created by the current MCP workflow.

### 18.9 Agent receipt composition

Agent-run receipts may reference child receipt IDs for semantic actions performed by the Agent.

This enables traceability from:

`Agent Run -> step/tool call -> semantic mutation receipt -> exact changed object`

without duplicating all child details into the parent receipt.

### 18.10 Receipt lifetime

Receipts and leases are ephemeral MCP-instance state by default.

When the stdio MCP process ends:

- active leases expire;
- ephemeral receipts/evaluation handles expire unless explicitly persisted by a future design.

Persistent product evidence should be promoted deliberately into Atria-owned diagnostic/Incident authority rather than automatically writing every MCP operation into product data.

### 18.11 Unified executor sequence

Semantic executors should follow a common fail-closed sequence:

1. resolve Action Descriptor;
2. require executor risk to match descriptor risk;
3. check action availability;
4. enforce server Policy Ceiling;
5. validate input schema;
6. perform product guard/preflight/concurrency checks;
7. resolve a valid Capability Lease;
8. if absent, request trusted user approval where supported;
9. re-check guards after approval;
10. execute only through the owning authority;
11. redact/filter output;
12. mint Operation Receipt;
13. return result + receipt.

Guard state must be checked again after approval because product state may have changed while waiting for the user.
