# Native product UX — Group 3

Branch: `fix/native-product-ux-audit`; implementation HEAD: `e92ef8303`.

### NUX-012

Agent model profiles now hold optional exact player nativeRouteRef values. The
existing Inspector selects compatible role.orchestrator routes from Runtime,
retains unavailable references visibly and supports load failure/retry. Clearing
selection deliberately uses the existing role primary; no alternate router or
store was introduced. Native callers no longer author API/Prompt names in this
Agent control; compatibility remains isolated for non-Native UI.

References survive saved plan/host adaptation and Spec worker/reviewer, Agenda
planner/worker/finalizer, Loop, Director owner/delegate and arbitration requests.
Inline Director delegates inherit the owner's chosen route. Single/multi-tool
and streaming paths carry the same reference. Runtime metadata projections retain
safe route identity without credentials. Invalid scope/name/extra-field refs fail
validation; authoritative role/exact resource checks remain in the Native host.

Validation: all 113 Orchestrator/Agent Runtime suites passed (1,262 tests).
Eight client/picker tests passed; nine projection cases passed after extending
route metadata assertions. One real Edge 320px scenario passed: duplicate a fixed
preset, independently select Writer/Reviewer routes, save and reopen with exact
refs preserved. Screenshot inspected. The initial browser attempt needed to close
the compact Inspector before selecting the second Agent; the corrected scenario
passed. Changed-file ESLint and diff check passed.

### NUX-013

Memory maintains separate exact player routes for recall, extraction (including
compression/repair), Schema assistance and RAG rewrite in its existing settings.
The existing Memory Maintenance page uses the shared compatible-route picker and
explicit save with retained drafts on failure. Invalid refs are rejected; absent
selections deliberately use role.memory's primary route. Settings writes reuse
the existing persistence and do not copy Secrets or provider state.

All Memory request wrappers preserve nativeRouteRef. Schema assistance now passes
nativeRole=memory through the shared iteration runner instead of accidentally
using its orchestrator default. Native query rewrite no longer requires a legacy
API preset name to enter either the normal or debug path.

Validation: 50 Memory/Schema suites covered 660 tests. Two source-regex checks
initially failed on Windows line endings; restoring the repository's LF source
made their 48-case suites pass. Eight client tests passed for task identity,
role, exact refs, fallback isolation and failed-save retry. Real Edge 390px
Memory Maintenance save passed, including all four task selections; after removing
the browser-default fieldset border, the scenario passed again and its screenshot
was inspected. Changed-file ESLint and diff check passed.

### NUX-014

Player-owned Native Retrieval resources now own embedding/rerank provider,
model, explicit endpoint, typed options and exact Secret references. Immutable
revisions use the existing Native storage engine and Runtime write serialization;
all Native backup/restore paths include the new kind. Runtime → Retrieval reuses
the current editor primitives, compact modal/focus handling and Secret store.
Memory Maintenance saves exact embedding/rerank refs in its existing settings.
Creating a revision does not switch callers. The old automatic inline-settings
to Connection Manager conversion was removed, including its startup path.

RAG and Hybrid execution both resolve Native refs before the compatibility
EmbeddingService path. Server requests accept payloads plus exact refs, reject
provider/credential overrides, and resolve only the referenced Secret. Existing
provider protocols are retained, including local/browser models and Vertex auth
modes. Local pipeline model switches serialize inference. Native vector indexes
are isolated by exact retrieval revision and outside compatibility purge scopes;
Memory reset passes its exact profile through the existing vector adapter.
Connection Manager remains only a non-Native compatibility owner.

Validation: all 50 Memory/Schema suites passed (660 cases). Five vector/retrieval
suites passed (200 cases). Final seven focused suites passed (55 cases), including
actual protocol requests against a simulated provider, FS/SQLite immutable and
concurrent writes, all-kind Native backup/cross-engine round trips, shared client
fallback isolation, local model concurrency and Shell routing. The adjusted
Memory vector adapter suite passed all three cases; after removing the old
automatic conversion, four adjacent suites passed all 61 cases. Two real Edge scenarios
passed: create a Secret and rerank revision; create embedding revisions and pin
Memory at 320px. The latter passed again with Tab/Shift+Tab focus containment and local-only
provider fields hidden. Saving also locks navigation and fields until completion.
Screenshots inspected; changed-file ESLint and diff check passed. Initial browser
attempts exposed the old retrieval-to-connections alias; corrected tests passed.
A newly introduced static script import broke Memory test mocks; removing that
unnecessary dependency restored all 660 tests. No live cloud credentials or GPU
model inference were required or claimed.

### NUX-015

Native Agent authoring, save, restore and import normalize model configuration to
an exact player Runtime Route or the role default. Workspace API/prompt selectors
and their unused provider helpers are removed. Native settings reads/writes discard
obsolete preset selector names without converting old resources or rewriting user
prompt content. Execution projections no longer synthesize empty legacy fields.
Explicit non-Native execution and preset-help islands retain their own contracts.
Memory advanced settings direct users to the existing Maintenance route/retrieval
pickers; task prompts, extraction policy and recall controls remain available.

Validation: 113 Orchestrator/Agent Runtime suites covered 1265 cases and 50
Memory/Schema suites covered 660 cases. Two obsolete assertions requiring empty
legacy selectors were updated; their 18 cases passed. Six new contract cases cover
exact routes, invalid authority, settings cleanup and all four preset modes through
save/restore/import. Six adjacent suites passed 32 cases; three host suites passed
16 cases after unused provider-helper removal. Native Runtime/retrieval regression
passed 10 suites / 166 cases. Real Edge verified Memory routing and advanced controls
at 390px and independent Agent routes at 320px. Screenshot inspected. The first
advanced-settings assertion targeted a collapsed section; corrected browser checks
passed. Changed-file ESLint and diff check passed.


Group 3 final regression: 163 Orchestrator/Agent Runtime/Memory/Schema suites
passed (1925 cases); 10 Native Runtime/retrieval suites passed (166 cases);
six adjacent Shell/route picker/backup/local-model/authoring/projection suites
passed (32 cases). Seven real Edge scenarios passed across the Group 3 and
shared Runtime suites, including 320/390px routing, exact retrieval revisions,
Secret creation, pending-save lock, focus containment, responsive editor, fallback
roles and Chinese layout. No live cloud inference or physical device claimed.
