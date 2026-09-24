# Native product UX — Group 5

Branch: `fix/native-product-ux-audit`; pushed HEAD: `6041641a2`.
Main baseline remains `ad15c1e0c3e15e625ba163e284a300c00811f10d`.

Independent issue commits:
019 `6c3bddb5f`; 020 `b6922f2a0`; 021 `224bf3c55`; 022 `b60b0052d`;
023 `861617071`; 024 `42a6c4143`; 025 `e97f0bc8e`; 026 `129a65e09`.
Regression fixture alignment: `dacff2b72`.

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

Next: NUX-027, following the active backlog order.
