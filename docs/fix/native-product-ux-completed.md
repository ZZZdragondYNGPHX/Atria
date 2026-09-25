# Native product UX completed work

Task branch: `fix/native-product-ux-audit`.
Baseline: `main@ad15c1e0c3e15e625ba163e284a300c00811f10d`.
Workspace `AGENTS.md` and `FORK_MAINTENANCE.md` take precedence over the obsolete remote copies.

## Group 1 — User Data Safety

### NUX-001

Commit: `426017c8e`.
Registered Native resources, Studio projects and asset blob directories centrally.
ProjectStore, AssetStore and FS resource reads/writes consume the shared contract.
Existing physical paths remain unchanged. The FS harness uses the real registry.
Focused validation: four suites / 13 tests; changed-file ESLint and diff check.

### NUX-002

Native backup is a single selectable closure: all Native resource kinds, Studio
source projects and Native asset/package blobs. Secrets remain a separate choice.
SQL downloadable dumps now filter selected tables; recovery snapshots remain full.
Assets-only backup/restore excludes and preserves the Native blob subtree.

MigrationRunner copies all registered Native kinds through the existing engine
transaction contract, retaining exact IDs, documents, integrity and timestamps.
Restore staging rebinds only the user storage key for FS and SQLite sources.
Native restores validate required blob hashes and lengths before replacing data.
Overwrite rejects archives without a declared Native closure. Recovery checks
engine compatibility before deleting anything and closes SQLite handles before
replacing files on Windows.

Backup uses the existing migration lock and read-only gate while archiving.
Migration write bypass is async-local, preventing unrelated concurrent requests
from bypassing the gate. ProjectStore writes honor the same gate.
The existing backup UI exposes the Native option with English, zh-CN and zh-TW
copy, existing checkbox styling and keyboard behavior.

Group regression executed:

- 23 offline suites: 203 passed, four database-service cases skipped. Includes
  migration, snapshots, rollback, selection, read-only concurrency, Native layout,
  project composition/build and HTTP backup/restore.
- Eight Native HTTP scenarios cover FS → FS, FS → SQLite, SQLite → FS,
  SQLite → SQLite, missing-blob rollback and assets-only isolation.
- All 22 registered Native storage kinds are included in the HTTP round trips.
- One real Edge browser scenario passed at 320px: utilities error/recovery,
  Native backup selection, keyboard toggle, recommended selection and overflow.
  Inspected its backup screenshot. Existing visual language retained.
- Changed-file ESLint and `git diff --check` passed. The CLI file's single engine
  injection line was syntax checked; its pre-existing unrelated lint errors were
  not rewritten.

Limits: local MySQL/Postgres test ports 53306/55432 are unavailable. Their live
integration is not claimed. No Docker/Android build or physical-device validation.
Playwright bundled Chromium installation stalled during extraction; browser
validation used installed Edge through an untracked local test configuration.
Pre-existing workspace rule edits and old test artifacts remain excluded.

## Group 2 — Native Runtime / Provider Foundation

### NUX-003

Production registers four Native adapters. All use the existing exact Runtime
Route, configuration, PromptIR, capability and Secret-at-send boundaries.

| Adapter | Tools / structured output | Reasoning | Explicit cache |
| --- | --- | --- | --- |
| OpenAI-compatible messages | Function tools, JSON Schema | effort | key, in-memory / 24h retention |
| Anthropic Messages | Function tools, JSON Schema | adaptive effort or enabled token budget | automatic ephemeral, 5m / 1h |
| Gemini GenerateContent | Function tools, JSON Schema | budget or level | unsupported |
| Raw text completions | unsupported | unsupported | unsupported |

All support streaming. Protocol capability evidence does not override known
unsupported model capabilities. Unknown fields/combinations fail before Secret
resolution. Anthropic/Gemini preserve leading system authority and reject
interleaved system slots that cannot retain their original position. Unsupported
modalities fail rather than disappearing. Signed provider tool content survives
the Studio loop and remains bound to the connection, model and original message.
Their local budget check uses a conservative UTF-8 byte bound, not an inaccurate
OpenAI tokenizer. Gemini external cached contexts are rejected because their
unavailable contents cannot participate in Native context accounting.

Runtime editors reuse existing fields, focus, responsive sheets and translations.
Gemini accepts an API base URL; other transports accept the generation endpoint.
Provider model discovery and connection health remain NUX-005, next after NUX-004.

Validation: seven focused/adjacent suites, 120 tests passed; final changed tests
rechecked (15 passed). Real local HTTP covers both new protocols, streaming and
nonstreaming authentication. Real Edge narrow/light profile editing and exact
revision preservation passed; inspected the 320px provider-controls screenshot.
Changed-file ESLint and diff checks passed. Live paid provider accounts were not
used; protocol behavior is tested against controlled HTTP servers.

Protocol references: [OpenAI Chat](https://developers.openai.com/api/reference/resources/chat),
[Anthropic Messages](https://platform.claude.com/docs/en/api/typescript/messages),
[Anthropic thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking),
[Anthropic caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching),
[Gemini generation](https://ai.google.dev/api/generate-content),
[Gemini thinking](https://ai.google.dev/gemini-api/docs/thinking).

### NUX-004

Connection setup now selects labeled exact Secret references or creates a Secret
inline. The authenticated Native inventory returns IDs/labels only, independent
of secret exposure preferences. Creation reuses SecretManager and its atomic
file store under an Atria key; it does not rotate active credentials. The Native
backup write gate applies. Connections never receive the key value.

The existing editor handles empty/loading/retry, failed creation, double clicks,
stale inventory responses, cancellation and clearing sensitive inputs after
success/cancel. Secret selection and create fields use existing form primitives
and Chinese translations. Creating a Secret and saving a connection remain
explicit separate actions.

Validation: three suites / 35 tests passed, covering real authenticated Secret
HTTP, metadata-only output, ownership rejection, write gate, exact selection,
creation retry and existing generation contracts. Two real Edge 390px scenarios
passed including Secret creation, connection save failure/retry and configuration
loading recovery. Inspected the connection screenshot. Changed-file ESLint and
diff check passed. Only synthetic credentials were used.

### NUX-005

Connection Test and Model Fetch use a non-generating authenticated model-list
probe over the explicitly selected Native connection. Protocol endpoint mapping,
authentication, bounded pagination, timeout, redirect rejection and response
validation are explicit. Unsupported custom endpoints retain manual model entry.
No probe saves configuration or silently selects a model.

Model selection edits only the draft ID. Applying discovered metadata is separate
and explicit. Anthropic/Gemini documented capabilities and limits retain provider
discovery provenance; OpenAI model lists do not invent absent metadata. Optional
ModelProfile.limitProvenance records each budget source in the existing resource.
Manual budget edits become user overrides; capability overrides survive metadata
application. Changing model/connection removes old discovery provenance.

Validation: five focused/adjacent suites, 64 tests passed, then 21 changed tests
passed including malformed/credential-echo/pagination-loop cases. One real Edge
320px discovery scenario passed, repeated after reusing existing field-group
spacing; final screenshot inspected. Changed-file ESLint and diff checks passed.
HTTP protocol tests use local servers; browser discovery uses a controlled
response and the real configuration persistence endpoint.

Model-list references: [OpenAI](https://developers.openai.com/api/reference/resources/models/methods/list),
[Anthropic](https://platform.claude.com/docs/en/api/models/list),
[Gemini](https://ai.google.dev/api/models).

### NUX-006

Runtime Connections, Models and Routes can be duplicated into an unsaved new
identity and deleted when unreferenced. Deletion reports Used By blockers for
model/connection ownership and fallback routes. Persistence serializes writes
and deletion checks across instances in the server process, following the Native
Session pattern required by FS transaction semantics. Referencing saves recheck
target existence; fallback fixtures now create dependencies before callers.

Library Prompt/Generation resources intentionally retain immutable revisions.
Archive/restore changes only root-list metadata, never exact content. Active and
Archived filters expose recovery; a new revision does not silently unarchive.
Existing Runtime routes and Resource Graph references still resolve archived
content. Library Used By combines existing Graph results with exact Runtime route
references. Package originals do not expose archive or revision writes.

Validation: six relevant suites covering 84 cases; the final frontend changes
were rechecked with 17 passing cases. Includes delete blockers, cross-instance
concurrent delete/save, immutable archive/restore, backup gate, duplicate identity
and neighboring generation/authoring regressions. One real Edge 320px scenario
passed: blocked deletion, duplicate/delete, Library Used By, archive and restore.
Both screenshots inspected. Changed-file ESLint and diff check passed.

### NUX-007

Library → Generation Profiles is the canonical authoring home. Runtime's Profiles
navigation and editor are removed, as is PUT configuration/profiles. Runtime
Routes link to Library while retaining exact selected revisions. Existing
programmatic profile navigation redirects to that same Library owner.

Before removing the Runtime editor, all sampling/output/streaming/stop/tool and
provider reasoning/cache controls were moved into the existing Library/Studio
Generation editor. Simple/Advanced round trips preserve settings, unsupported
retained values remain visible, numeric/JSON validation keeps drafts, and omitted
streaming remains omitted. Studio continues its Review/Apply write path; Library
uses the immutable resource endpoint. Archive and exact revision behavior remain.

Validation: four suites / 45 tests passed, followed by eight passing editor cases
including the new control round trip. One real Edge light 320px Library scenario
passed: invalid JSON recovery, provider controls, immutable save, unchanged route
revision and canonical owner link. Screenshot inspected. ESLint passed with only
three pre-existing conditional-test warnings in the older Runtime E2E file;
diff check passed.

### NUX-008

Fallback choices now include only other same-role routes and exclude already
selected entries. Role changes remove incompatible draft fallbacks with explicit
feedback. Backend persistence rejects both outgoing role mismatches and changes
that would invalidate incoming fallback references; the HTTP boundary returns an
actionable role-conflict code.

Validation: three backend suites / 63 tests passed, plus the adjacent Runtime
client suite / 10 tests. A pre-existing concurrency fixture now detaches the
fallback before assigning a different role. One real Edge fallback scenario
passed: wrong-role option absent, role-change cleanup, valid selection and exact
route identity preserved. Changed-file ESLint and diff check passed.

### NUX-009

Diagnostics now reads Build's Project inventory and selects its current exact
revision. Raw IDs are confined to Advanced context details. Refresh preserves an
unchanged pin and requires explicit reselection when Build has changed; failed,
empty, overlapping and disposed inventory loads cannot submit an unverified
context. Native Session remains the context owner when active. Historical Project
execution is not introduced: the existing host accepts the current exact revision.

Validation: Runtime client suite / 12 tests passed, including stale-pin refresh,
exact request payload and failed/overlapping inventory recovery. Two real Edge
Diagnostics scenarios passed, including creating a real Build Project and compiling
its exact revision at 320px. Screenshot inspected; ESLint and diff check passed.

### NUX-010

Runtime lists now share a dependency-ordered setup disclosure computed from the
existing Secret metadata, Runtime configuration and exact resource catalogs.
The next missing dependency links to its canonical Runtime or Library owner.
Readiness verifies linked Connection/Model/Route references and exact resource
revisions rather than just counting records. Archived resources continue to
satisfy existing pins. Refresh and recoverable inventory errors are supported;
no setup state or duplicate configuration authority is persisted. Linked status
explicitly directs users to Diagnostics before generation.

Validation: two adjacent suites / 15 tests and the new readiness suite / 3 tests
passed. One real Edge 320px scenario verified the six-step checklist, missing
Secret and canonical Connection navigation; screenshot inspected. ESLint and
diff check passed.

### NUX-011

Product HTTP and UI now share a bounded, allowlisted error-detail contract.
Field and exact reference blockers survive client and Library boundaries; raw
exception messages, arbitrary payloads and sensitive fields are excluded.
Known dependency, permission, encrypted-save, immutable revision, write-conflict
and read-only errors provide corrective action, with safe status-based fallbacks.
World/Knowledge name validation and archive validation carry field context.
All existing caller feedback uses text nodes and retains focus/error behavior.

Validation: five focused/adjacent suites / 18 tests passed. All eight real Edge
Library scenarios passed, covering installation retry with retained input,
referenced Work deletion with the exact blocking Session, World/Knowledge editing,
resource revision retry, Skills and compact Chinese layouts. Reference-error
screenshot inspected. Changed-file ESLint and diff check passed.

### Group 2 regression

All 22 selected Native Runtime/provider/Secret/resource/Product and client suites
passed: 214 tests, no skips. Real Edge regression passed all 24 scenarios across
Runtime redesign (10), Library redesign (8), Runtime edit/preview/recovery (4)
and Library/Studio authoring (2). Viewports covered 320, 390, 900 and 1440px,
light/dark and Chinese surfaces. Existing optional Stable Diffusion discovery in
the older fixtures logged localhost:7860 connection failures; all six Runtime/
authoring tests still passed with no page errors. No external paid-provider,
physical-device, Docker or Android-build validation is claimed.

Next: Group 3 / NUX-012, following the active backlog order.


## Group 3 — Agents / Memory Native Routing

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

## Group 4 — Native Knowledge Semantics

### NUX-016

Native Knowledge now shares a typed applicability contract between persistence and
compilation: bounded safe state predicates, all/any tri-state logic, and explicit
boolean direct activation. Successful direct activation bypasses keyword discovery,
while retaining target/authority/lifecycle controls. Compiled delivery no longer
re-evaluates applicability through compatibility providers. Unsupported stateEvents
fail with the field path before writes instead of remaining inert metadata; current
Native Event Journal facts remain available through state predicates. Semantics and
limits are documented in `docs/features/native-knowledge.md`.

Validation: four focused suites passed 64 cases, covering invalid fields and Native
Session/Package compilation. Three adjacent Library/Package/Studio suites passed 11
cases. FS/SQLite storage foundation passed two cases. MySQL/Postgres contract cases
could not run against the unavailable local services and were excluded from the
offline rerun; no external database validation claimed. Changed-file lint and diff
check passed. An initial test used the wrong entry-ID prefix; corrected fixture
passed. No UI surface was added in this contract/runtime issue.

### NUX-017

Knowledge delivery position and target selectors now share typed definitions across
server contracts, Native compilation and the current Studio editor. Positions are
before/after; targets are explicit kind strings or kind/id objects, optionally a
bounded OR list. Unknown aliases, empty selectors and arbitrary fields fail instead
of falling back or silently mismatching. Existing Studio fields use matching enums;
Source validation retains drafts before Review. Field errors expand the containing
section, focus the control and provide aria-invalid/describedby feedback. Package,
Binding and revision writes use the same validation.

Validation: five focused suites passed 90 cases, followed by 47 cases including the
new Binding persistence assertion and eight final editor cases including recovery
from invalid primitive types. Six adjacent Context/Library/Package/Studio suites
passed 30 cases. Real Edge 390px Studio typed editing, invalid Source rejection,
draft retention and corrected ChangeSet Review passed; screenshot inspected. The
first browser fixture reused the category name for its resource; giving the fixture
a distinct name removed the ambiguous test locator. Changed-file lint/diff passed.

### NUX-018

Native Knowledge discovery accepts only its supported keywords/aliases/regex
contract. semanticHints and vectorHints, even empty placeholders, now produce
field-path errors in Studio, server persistence and detached Native compilation.
They cannot imply retrieval behavior, invoke compatibility providers or silently
survive as inert authoring options. Native Memory retrieval remains its own
established responsibility; no speculative Knowledge retrieval service was added.

Validation: five focused suites passed 98 cases. Real Edge 390px Studio rejected
both unsupported hint fields while retaining the draft, and accepted a corrected
ChangeSet for Review. Changed-file lint and diff check passed.


Group 4 final regression covered 86 Native/Shell suites: 668 passed cases and
66 skipped cases (external database-engine cases excluded). The broad run found
two stale Group 3 fixtures: missing retrievalProfile in the frozen ID list and
a Memory routing service mock lacking retrieval ports/selecting the first form.
Both were corrected; their two suites / 27 cases passed. The other 84 suites
passed in the broad run. Real Edge 390px Knowledge editing, validation/draft
recovery and ChangeSet Review passed. No live external database validation claimed.

## Group 5 — World / Knowledge Authoring

### NUX-019

Library World/Knowledge details now create first and subsequent immutable revisions
through the existing Native Product client/service and WorldRepo/KnowledgeRepo.
The current structured editor, Source escape hatch and review primitives are reused;
saves show exact identity in history and preserve existing exact bindings. The server
assigns new revision IDs and validates content before repository writes. An explicit
editing base is compared inside ordered repository writes, including across service
instances. FS has no transaction isolation, so repository resource writes now use the
same per-resource serialization pattern as existing Native publication authorities.
Rename integrity checks prevent stale names from restoring an obsolete head.

Validation: eight focused/adjacent suites passed 29 cases, including FS/SQLite
concurrent commits, immutable originals, pinned binding preservation, malformed
content, missing owners, HTTP routes, Resource Graph, Project composition and
Package build. Real Edge 390px created two revisions of both resource types,
recovered from a failed Knowledge save, and verified the original content remained
unchanged. Screenshot inspected. Changed-file ESLint has no errors (deterministic
browser matrix branches retain Playwright conditional-style warnings); diff check
passed. The initial FS concurrency test exposed missing isolation and passed after
repository serialization. An HTTP test initially used the wrong router mount path;
the corrected seven-case suite passed.

### NUX-020

One semantic Knowledge editor now serves Library revision drafts and project-owned
Studio Knowledge. It covers content/title, discovery, typed scalar state conditions,
all/any/direct activation, lifecycle, required/related entry selection, exclusive
groups, target rules, visibility, position/priority and compact-content/budget hints.
Entries can be added, deleted and reordered while preserving IDs. Referenced entries
cannot be deleted until their references are explicitly removed; deletion uses the
existing confirmation. Source remains an advanced escape hatch with retained drafts
and whole-revision validation. Library revision Review and Studio ChangeSet Apply
remain the only commit paths.

Lifecycle turn fields now require non-negative integers instead of inert arbitrary
JSON. Regex discovery validates syntax/flags and preserves regex semantics through
the temporary downstream adapter. User metadata and unedited content remain intact;
exact identities are exposed in Details. Existing Library tokens/controls style the
editor, including 320px layouts and Chinese labels.

Validation: seven focused/adjacent suites passed 108 cases, covering typed fields,
Source errors/retry, stable identity/reordering, reference blockers, immutable writes
and Studio integration. Three real Edge scenarios passed: 390px Studio validation,
World/Knowledge immutable revision creation and retry, and 320px semantic authoring
without Source including conditions, relations, lifecycle, reorder and confirmed
delete. Screenshot inspected. Three editor cases passed again after adding the
compact-content/budget controls. Changed-file ESLint has no errors; existing browser
matrix conditional-style warnings remain. Diff check passed.

### NUX-021

Library Binding management now supports create/edit/delete, explicit exact Knowledge
revision selection, enabled/mode/target/visibility/priority, Used By navigation and
World attach/detach review. Updates/deletes compare captured integrity tokens; World
attachment writes compare the captured World head and publish immutable revisions.
Historical references remain protected. Related repository writes share ordered
locks so FS publication cannot race attachment/deletion or exact source removal.

Validation: seven focused/adjacent suites passed 46 cases, including FS/SQLite races,
Project/historical World blockers, HTTP delegation and retained failed-save drafts.
One real Edge 390px scenario passed explicit old-revision selection, save retry,
World attach/detach and historical deletion protection; screenshot inspected.
Changed-file ESLint had no errors; the existing browser matrix retained 15 style
warnings. Commit: 224bf3c55.

### NUX-022

Library and Studio now share a World composition editor for typed nested baseline
and schema fields, named Knowledge bindings and assets. Dependency previews expose
exact Knowledge revisions and asset hashes; missing references remain explicit and
block review. Source drafts remain available. Library publishes immutable revisions;
Studio continues through ChangeSet Review/Apply. Dependency-load failures can retry.

Browser regression exposed an existing Resource Graph collision when a World used a
Library Binding already present in the graph. World traversal now reuses canonical
exact Binding resolution instead of independently constructing a conflicting node.

Validation: eight focused/adjacent suites passed 18 cases, including schema/baseline
composition, exact assets, failed loading/Source preservation, Studio ownership,
Library closure and multiple World revisions sharing one canonical Binding node.

Four real Edge scenarios passed after the graph fix, covering 390px World composition,
Binding lifecycle, Studio validation, immutable revision creation/retry and 320px
Knowledge semantic authoring. World composition screenshot inspected. The initial
combined run exposed the graph collision and was interrupted after diagnosis;
its corrected complete rerun passed. Changed-file lint and diff checks passed.

### NUX-023

World/Knowledge history now exposes semantic comparison, new revisions copied from
historical content, explicit current-head selection and independent Library forks.
Diffs follow stable Knowledge entry IDs and separate ordering/dependency changes.
Head changes compare the captured head and retain existing exact pins. Forks publish
new roots/revisions atomically, retain provenance and use stable destination IDs
for safe retry. Knowledge forks remap entry identities and internal relationships.
World revision deletion/GC now shares head-write serialization. Missing explicitly
selected Knowledge revisions return not-found instead of an empty draft.

Validation: seven focused/adjacent suites passed 24 cases, followed by five service
cases after the explicit missing-revision guard. A real Edge 390px scenario passed
historical diff, recreation, promotion and fork, verifying original history and
independent fork identity/content. Screenshot inspected. Changed-file lint and
diff checks passed.

### NUX-024

Shared reference rows now serve Studio Inspector, Prompt Library and Library deletion
blockers, showing readable owners, exact versions and existing Shell navigation.
Reference HTTP requests now preserve Project/Library/Package ownership scope.
Resource Graph supplies owner names and human Knowledge entry/Binding labels.
Runtime Route references navigate to the player-owned Runtime authority.

Studio Library Attach/Fork/Update prepares operations for ChangeSet Review/Apply;
it no longer commits directly from the relationship button. Explicit dependency
detach follows the same review path. EntryPoint/World consumers block illegal detach
and navigate to the owner. World/Knowledge deletion shows reverse references before
requesting destructive confirmation; backend write-time protections remain intact.

Validation: nine focused/adjacent suites passed 56 cases across reference routing,
scoped HTTP queries, read-only preparation, consumer blockers, graph consistency,
Studio/Prompt ownership and Native Runtime generation/lifecycle. A real Edge 390px
scenario passed deletion blockers, owner navigation and Update/Fork/Detach with
assertions that no project mutation occurs before Apply. Screenshot inspected.
Changed-file lint and diff checks passed.

### NUX-025

Play Timeline now presents embedded Knowledge by human name, source story, entry
count and content excerpts; opaque identities stay in Details. Save to Library
previews a new or existing destination, provides naming, explains head behavior and
requires explicit confirmation. Failed saves retain the review draft. Success links
to the Library resource while leaving Session ownership unchanged.

Promotion validates the captured Library head and compares exact entry content,
not only revision metadata. New roots/revisions publish atomically through Knowledge
repository creation, and a stable target Binding identity prevents duplicate retries.

Validation: four focused/adjacent suites passed 26 cases (two optional external DB
cases skipped), covering save/import parity, content collisions, retry identity,
UI review and unchanged Session bindings. A real Edge 390px flow passed source and
destination preview, naming, confirmed promotion and Library navigation. Screenshot
inspected; one UI case reran after removing the duplicate review action and fixing
singular count text. Changed-file lint and diff checks passed.

### NUX-026

Native Knowledge now selects directly from KnowledgePlan, preserving exact identity,
discovery/regex, recursive and related activation, atomic required dependencies,
priority tiers, compact budget variants, typed delivery and provenance. Native lane
caps replace legacy World Info settings. The old entry adapter and unused N4
projection are removed; only final before/after text-channel adaptation remains at
the shared generation boundary. Pure state condition evaluation is Native-owned,
with compatibility re-exports for old callers.

Sticky/cooldown/delay state is Native Session state, scoped by target and exact entry
identity. Preview is detached; accepted generation stages lifecycle state with its
Draft. Stop clears it, and stale Session/Branch/Revision/state evaluations fail closed.

Validation: four focused Native suites passed 71 cases (36 optional external DB cases
skipped); three adjacent World Info suites passed 41 cases. A real Edge scenario
passed prompt-channel delivery with legacy budget disabled, exact ContextPlan filtering,
absence of book-shaped candidates, Draft-local commit and Stop rollback. Changed-file
lint and diff checks passed.

Group 5 regression: 96 Native/Shell suites covered 707 passing cases and 68 optional
external database skips. Two obsolete UI assertions were updated for named Binding
management and reviewed Library writes; their suite passed on rerun. Nine World Info
suites passed 70 cases and two adjacent orchestration suites passed nine cases. All
eight real Edge Knowledge/World/Studio/Play scenarios passed at 320/390px, including
Native prompt evaluation, promotion, references, historical revisions, bindings,
composition and semantic authoring. The current composition screenshot was inspected.

## Group 6 — Studio / Skills / Prompt Authoring

### NUX-027

Skill Manager now groups Native global/project/exact PackageVersion scopes, resolves
human owner names, and preserves exact scope identity for filtering, collision checks
and API URLs. Package rows identify read-only originals and offer View only; editor
entry and all public mutation endpoints reject Package writes, including scope-level
operations, moves and import destinations. Advanced compatibility scopes remain
collapsed. Project editing keeps existing SkillRepository/file-hash concurrency;
project destinations are picked from the current Native project catalog. Moves
require confirmation explaining visibility changes and unchanged name references.

Validation: ten focused/adjacent suites covered 211 passing cases after correcting
an unnecessary async yield in the optional owner-catalog path; the 14-case interactive
scope-picker suite passed on rerun. A real Edge 390px scenario passed project name,
Package read-only controls, compatibility disclosure, project edit/save and confirmed
move to global. Current Skills UI screenshot inspected; lint/diff checks passed.

### NUX-028

Studio uses domain editors for World composition, Knowledge semantics and now Skill
declarations. The Skill editor selects from the current project/global catalog,
explains unavailable declarations, adds/removes/edits IDs and preserves extension
fields through Source. Edits remain detached until existing ChangeSet Review/Apply.
Shared declaration validation rejects malformed, duplicate and conflicting IDs both
in authoring and Native Package/Runtime compilation. Loading failure retains the draft
and offers Retry. Native scope badges now preserve the kind label at narrow widths.

Validation: seven focused/adjacent suites passed 51 cases. The extended Runtime
Descriptor and localization suites passed 12 cases. Two real Edge 390px scenarios
passed semantic Skill declaration Review/Apply and adjacent Skill Manager ownership,
editing and movement. Both rendered screens were inspected. Lint and diff checks
passed; Source preserves unknown fields and Package originals remain unchanged.

### NUX-029

Build project cards and project detail now expose destructive deletion with explicit
source/history versus retained artifact explanations. Deletion uses Studio's existing
revision-protected authority. Concurrent edits remove the stale confirmation and require
reload plus renewed confirmation. Success refreshes Build and search; cancellation and
recoverable failure preserve the project and allow retry.

Validation: five focused suites passed 16 cases; extended HTTP/localization checks passed
nine cases. A real Edge 390px scenario passed concurrent edit rejection, revision reload,
renewed confirmation, deletion and return to the project list while installed Works remain.
The conflict screenshot was inspected. Changed-file lint and diff checks passed.

### NUX-030

Studio Assets now provides safe image/audio/video and inert text previews, media details,
name/path/metadata edits, explicit replacement and case-insensitive path collision feedback.
Moves, replacement bytes and manifest updates remain one reviewed revision-pinned workspace;
asset identity is retained. Used By resolves scoped Resource Graph consumers before removal,
blocks referenced assets and fails closed when lookup fails. Deletion requires confirmation
and rechecks dependencies before staging. Installed Package originals remain unchanged.

Validation: five focused/adjacent suites passed 19 cases, followed by the extended six-case
StudioService suite including atomic move/replace/manifest behavior. A real Edge 390px scenario
passed import, text preview, collision refusal, rename plus replacement, stable identity,
reference inspection and reviewed removal. Rendered editor inspected; lint/diff checks passed.

### NUX-031

Source now identifies file types, validates JSON/JSON Lines/YAML/XML and invokes the
existing component compiler for declared structured UI sources. Binary, non-UTF-8 and
oversized files remain read-only. A bounded inert textual diff shows changed line ranges
before review without truncating writes. Invalid drafts and per-file edits survive failures
and file switching. Explicit reload returns to committed content. Writes retain Studio's
revision-pinned Review/Apply boundary.

Validation: three focused/adjacent suites passed 11 cases and localization passed four.
A real Edge 390px scenario passed invalid JSON retention, live textual diff, binary write
protection, restored draft and successful reviewed write. Screenshot inspected; lint and
diff checks passed.

### NUX-032

Prompt Module and Program stage conditions now use nested comparison/all/any/not controls.
Typed parameter definitions distinguish absent defaults from explicit values; shared resource
validation rejects default-type mismatches and names runtime binding cannot consume. Program
parent and add/disable/replace/configure controls preserve exact references; configuration
uses the selected module's typed declarations. Unknown overrides remain visible and require
explicit correction. Advanced JSON remains available but cannot alter system provenance.
Stage rerenders preserve condition drafts. Controls reuse existing Atria fields and hierarchy.

Validation: five focused/adjacent suites covered 101 passing cases, including Native Prompt
compiler and resource contracts. Source/localization regression passed nine cases. A real Edge
390px scenario passed typed defaults, stage condition, exact parent/configure authoring and
immutable revision save. The final control screenshot was inspected after correcting inherited
checkbox styling. Lint/diff checks passed.

Group 6 regression: 125 Native/Shell/Skills/Skills UI/Skills endpoint suites passed
1210 cases with 68 optional external DB skips. All 11 real Edge Studio/authoring
scenarios passed, covering 1440/900/320px, Chinese/large-text/safe-area/reduced-motion/
virtual-keyboard simulation, errors/retry, Project Agent, Skills, deletion, Assets,
Source and Prompt semantics. Current narrow-screen screenshots were inspected.
All Group 6 changed JavaScript passed ESLint; diff checks and frontend cache compilation
passed. No live cloud provider or physical-device validation is claimed.

## Group 7

### NUX-033

Resource Bundle v1 exports a root plus verified exact closure from Library, Project
or installed Package resources. Shared preflight rejects missing/cyclic/unreachable
or corrupted dependencies and player configuration. Reviewed imports create independent
identities through existing repositories, rewrite references and retain provenance.
Interrupted writes report completed copies and resume with the same review identity.
Trusted Resource Registry adapters extend this format to additional resource types.
Prompt/Generation and World/Knowledge surfaces expose export and reviewed import,
including historical World/Knowledge revisions. No new store or Project write path.
Contract: [Resource Bundle](resource-bundle-contract.md).

Validation: six Native suites passed 21 cases; four Shell suites passed 15 cases;
final file-picker/localization checks passed six. Real Edge at 390px passed actual
export, read-only review, interruption, same-token retry, independent identity and
navigation. The final screenshot was inspected after adding a keyboard-accessible
file selection button. Changed product JavaScript passed ESLint and diff checks.

### NUX-034

World and Knowledge Library lists now include exact originals from every installed
PackageVersion. Read-only detail shows the owning Work/version, exact identity and
content, Used By, export and reviewed Fork to Library. Fork copies the verified
complete closure through Resource Bundle rather than retaining mutable shared bindings.
The existing Resource Graph now represents Package Worlds, Knowledge, Bindings and
Assets, including EntryPoint usage. Reference rows navigate directly to supported
Package originals. Failed Package discovery has local retry and preserves Library content.

Validation: six Native/Shell/localization suites passed 23 cases; two additional UI
cases covered discovery retry and inert read-only content. Real Edge at 390px passed
World/Knowledge original browsing, exact Used By and a three-resource independent
Fork. Screenshot inspected; changed JavaScript ESLint and diff checks passed.

### NUX-035

Installed Work version rows resolve the selected hash-verified PackageVersion and
its own EntryPoints before explicit Session creation. Current/default and non-default
versions are explained; neither the Work default nor existing Session pins changes.
The primary Start New action also sends the displayed exact version. Retrying an
open failure after successful version-specific creation reuses that created Session.

Validation: Native product service/HTTP passed 15 cases and adjacent Shell/localization
passed ten. Real Edge at 390px installed a second version with a different EntryPoint,
started the original exact version and verified the newer default stayed unchanged.
Screenshot inspected; changed JavaScript lint and diff checks passed.

Next: NUX-036 in Group 7.
