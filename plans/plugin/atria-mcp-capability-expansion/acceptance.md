# Atria MCP Capability Expansion — Acceptance & Non-goals

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 21. Definition of Done / Acceptance Matrix

The capability expansion is complete only when every required acceptance layer below is satisfied. Passing a lower layer does not substitute for evidence from a higher layer.

### 21.1 Architecture / contract acceptance

The v0.2.0 public surface must contain exactly the 18 approved top-level MCP tools.

Architecture tests must reject accidental public proliferation such as per-domain `atri_chat_*`, `atri_build_*`, `atri_memory_*` or equivalent bypass tools unless a later approved Plan changes the public surface.

Every semantic product action must be registered through the Action Registry and provide the required descriptor metadata:

- stable action id;
- risk;
- owning authority;
- input schema;
- external-effect metadata;
- guards;
- approval/lease policy;
- availability.

Executor/risk mismatches must fail closed:

- READ only through `atri_read`;
- INTERACT only through `atri_interact`;
- MUTATE only through `atri_mutate`;
- DESTRUCTIVE only through `atri_destructive`.

The generic Native API observation surface must not execute product POST/PUT/PATCH/DELETE mutations.

### 21.2 Security / authorization acceptance

Secret values must remain unavailable through all relevant surfaces, including:

- repository reads;
- Git history/diff/show;
- artifacts;
- Settings;
- Connections;
- Diagnostics;
- semantic actions;
- Browser Capability Bridge;
- errors;
- receipts.

Opaque Secret references/labels may remain visible.

Capability Lease tests must prove that:

- the model cannot mint a lease;
- the model cannot alter lease grants/scope/expiry;
- expired leases fail;
- exhausted max-use leases fail;
- target-scope mismatches fail;
- MCP-instance mismatches fail;
- historical broad grants do not silently authorize actions added later.

DESTRUCTIVE authorization defaults to one-shot approval.

Narrow destructive cleanup must verify object provenance through MCP instance/receipt identity rather than names or model claims.

Known high-risk semantic product operations must not be bypassable through generic browser interaction.

### 21.3 Repository / Git acceptance

Verification must prove:

- tracked repository content is readable within policy;
- safe non-ignored untracked development files are readable;
- ignored development artifacts are accessible only through the bounded artifact policy;
- user/product data is not exposed merely because it lives under the checkout;
- traversal and symlink escape are blocked;
- historical Git reads apply sensitive-content policy;
- sensitive content remains blocked/redacted independently of `.gitignore`.


### 21.4 Runtime identity acceptance

Real integration must exercise at least:

- configured Product Source = server startup source = current browser-loaded `serverBootId` -> exact/current;
- tracked Product Source changed after runtime start -> source-changed state;
- configured Product Source and runtime at different revision/content -> different-revision state;
- server restarted while browser remains loaded -> stale-page state by changed `serverBootId`;
- insufficient startup source provenance -> unverifiable;
- Experience Epoch changes while the server process remains the same -> frontend-scoped stale evidence without falsely reporting a server restart;
- Studio Preview evidence bound to exact Project baseRevision + Workspace fingerprint + preview/compiled artifact identity.

`UNVERIFIABLE` must never be silently presented as a match.

Verification reports must distinguish product checkout/runtime provenance from Project/Preview provenance and must not claim a current source/authoring change was runtime/UI verified unless the applicable chain is established.



### 21.5 Chat / Session acceptance

Real product verification must cover representative:

- send;
- regenerate/retry;
- re-enter;
- restart-from;
- branch fork/switch;
- remove-from-active cleanup;
- generation stop;
- save/restore;
- Session deletion.

MCP must not introduce in-place mutation of committed Native Timeline history.

Native Frontend v3 verification must also prove that provisional/streaming GenerationProjection is not treated as a committed Timeline/Conversation message and that branch/restore/reload invalidates stale frontend Experience Epoch state as designed.

Active cleanup may derive/switch branches while preserving historical evidence.



### 21.6 Build / Studio acceptance

Verification must cover representative:

- Project/source/revision reads;
- history/diff;
- Resource Graph/reference/closure reads;
- validation/preflight;
- Workspace prepare/inspect;
- Native Frontend Source Graph inspection and source-addressable diagnostics;
- semantic `frontend.patch` proposal;
- formal frontend evaluation;
- Preview create/detail/close using the production compiler/renderer contract;
- Simulation;
- apply.

Evaluation must restore Project source rather than persist its temporary mutation.

An evaluation receipt reviewed against base revision A must fail closed if the Project changes to B before apply.

A Native Frontend v3 Preview receipt must bind the exact Workspace/change fingerprint and compiled Preview identity; browser evidence from another Preview or stale Experience must not satisfy that receipt.


### 21.7 Library / Package / Work acceptance

Verification must cover representative:

- exact Library revisions;
- references / Used By;
- resource revision creation;
- Package-original -> Library fork;
- Work exact installed versions;
- Session pinned PackageVersion diagnosis;
- Package preflight and permission/capability diff;
- install/update;
- base-version conflict;
- delete/reference blockers.

MCP must preserve immutable PackageVersion semantics; Work edits derive a new exact PackageVersion rather than altering an old one.

No force-delete path may bypass product blockers.

### 21.8 Memory acceptance

Verification must cover representative:

- schema;
- node/graph inspection;
- keyword/name lookup;
- recall;
- actual last injection projection;
- node create/edit;
- relation upsert/delete;
- compaction;
- node deletion.

A stale targeted Memory edit using an old fingerprint/revision identity must fail instead of silently overwriting a newer mutation.

### 21.9 Agent acceptance

Agent observation must expose the approved runtime evidence surface.

Delegated authority must be proven as:

`Preset capabilities ∩ Product capabilities ∩ MCP Lease`.

A test must demonstrate that a Preset which permits a higher-risk tool cannot use it when the MCP/user lease denies that capability.

Agent receipts must allow tracing a semantic mutation back to the Agent run/step/tool invocation responsible for it.


### 21.10 Settings / Connections / Diagnostics acceptance

Settings writes must use bounded patch/concurrency semantics rather than whole-document replacement for ordinary changes.

Connection probes must use Secret references internally without returning Secret values.

Runtime configuration deletion must preserve reference blockers.

Diagnostics must preserve user/Admin visibility boundaries.

Atria-owned log clearing is DESTRUCTIVE; MCP-owned ephemeral diagnostic-buffer clearing remains distinct.

`atri_diagnose_snapshot` must explicitly represent unavailable/permission-denied/not-applicable evidence rather than silently omitting missing categories.

Runtime identity evidence must reuse the product's canonical `serverBootId`. Existing startup-session/module provenance may be composed into the snapshot, but must not be mislabeled as startup source-content identity unless the exact runtime identity authority supplies that evidence.



### 21.11 Real integration / UX acceptance

The real-product verifier must run against:

- a real Atria process from the configured product checkout;
- fresh/disposable dataRoot/config;
- real product auth/CSRF behavior;
- real Chromium/compatible browser context;
- representative Studio/Session/Memory/Diagnostics paths;
- representative Native Frontend v3 Source Graph/evaluation/Preview path.

Responsive evidence must include at least:

- desktop 1440x1000;
- narrow/mobile 390x844.

The verifier should persist bounded evidence such as:

- summary JSON;
- Product Source/Server/Browser runtime identity evidence;
- Project/Workspace/Preview provenance evidence;
- screenshots;
- diagnostic snapshot;
- representative operation receipts;
- runtime log.

The run must clean up temporary Sessions/Projects/test assets/runtime data/browser state/leases/ephemeral receipts without touching personal developer data.


### 21.12 Client compatibility acceptance

At minimum, the supported Claude Code and Codex MCP configurations must be checked for:

- connection/startup;
- discovery of the exact 18-tool surface;
- `atri_status`;
- capability discovery;
- executor schema consumption;
- screenshot image-content compatibility where supported.

A stochastic end-to-end model benchmark is not a correctness requirement; protocol/tool-schema usability is.

### 21.13 Phase stop gates

Each implementation phase has its own formal stop gate.

A later phase must not begin merely because code for the previous phase exists.

Representative examples:

- Phase 3 cannot advance to mutation work until real READ integration is verified;
- Phase 4 cannot advance to high-risk/destructive work while Lease/authorization bypass tests fail;
- Phase 5 cannot advance to finalization while Agent privilege-escalation or Package destructive-boundary tests fail.

At every phase boundary, persist verified state in the Plugin Record and live HANDOFF before stopping.

### 21.14 Final completion criteria

The task is complete only when all of the following are true:

1. v0.2.0 exact 18-tool public surface is frozen and verified;
2. all planned semantic domains/actions are registered;
3. Policy / Lease / Receipt enforcement is complete;
4. Source / Runtime / Browser identity is complete;
5. Secret-boundary adversarial tests pass;
6. all destructive actions use safety + approval boundaries;
7. Agent delegation cannot escalate privilege;
8. Plugin unit/fixture/integration suites pass;
9. real disposable Atria integration passes;
10. required product-side feature branch changes are integrated into `main`;
11. Plugin is revalidated against the final integrated `main`;
12. README / resources / prompt / examples match the implementation;
13. the permanent Plugin Record is complete;
14. this task's live HANDOFF is deleted at completion;
15. the temporary product development branch is deleted after verified integration.

No completion claim may be made while any required item above remains unresolved.

## 24. Non-goals currently frozen

This expansion is not intended to:

- embed Atria product source into the `plugin` branch;
- merge `main` into `plugin`;
- replace normal code-editing, Git, test or build tools;
- create a second product persistence authority;
- bypass Native Session, Studio/ProjectStore, Library, Package or other Atria ownership rules;
- grant unattended destructive control over user data.
