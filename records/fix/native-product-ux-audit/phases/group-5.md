# Native product UX — Group 5

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../../../README.md#122-minimal-validation-and-runtime-checks)。

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
saves show exact identity in history and preserve existing exact bindings. An explicit
editing base is compared inside ordered repository writes, including across service
instances. FS has no transaction isolation, so repository resource writes now use the
same per-resource serialization pattern as existing Native publication authorities.

 Screenshot inspected. The initial FS concurrency test exposed missing isolation and passed after
repository serialization. An HTTP test initially used the wrong router mount path;
the corrected seven-case suite passed.

### NUX-020

One semantic Knowledge editor now serves Library revision drafts and project-owned
Studio Knowledge. It covers content/title, discovery, typed scalar state conditions,
all/any/direct activation, lifecycle, required/related entry selection, exclusive
groups, target rules, visibility, position/priority and compact-content/budget hints.
Entries can be added, deleted and reordered while preserving IDs. Referenced entries
cannot be deleted until their references are explicitly removed; deletion uses the
existing confirmation. Library revision Review and Studio ChangeSet Apply
remain the only commit paths.

Lifecycle turn fields now require non-negative integers instead of inert arbitrary
JSON. User metadata and unedited content remain intact;
exact identities are exposed in Details. Existing Library tokens/controls style the
editor, including 320px layouts and Chinese labels.

 Screenshot inspected. Three editor cases passed again after adding the
compact-content/budget controls. Changed-file ESLint has no errors; existing browser
matrix conditional-style warnings remain.

### NUX-021

Library Binding management now supports create/edit/delete, explicit exact Knowledge
revision selection, enabled/mode/target/visibility/priority, Used By navigation and
World attach/detach review. World
attachment writes compare the captured World head and publish immutable revisions.
Historical references remain protected. Related repository writes share ordered
locks so FS publication cannot race attachment/deletion or exact source removal.

One real Edge 390px scenario passed explicit old-revision selection, save retry,
World attach/detach and historical deletion protection; screenshot inspected.
Changed-file ESLint had no errors; the existing browser matrix retained 15 style
warnings. Commit: 224bf3c55.

### NUX-022

Library and Studio now share a World composition editor for typed nested baseline
and schema fields, named Knowledge bindings and assets. Source drafts remain available. Library publishes immutable revisions;
Studio continues through ChangeSet Review/Apply. Dependency-load failures can retry.

Browser regression exposed an existing Resource Graph collision when a World used a
Library Binding already present in the graph. World traversal now reuses canonical
exact Binding resolution instead of independently constructing a conflicting node.

 World composition screenshot inspected. The initial
combined run exposed the graph collision and was interrupted after diagnosis;
its corrected complete rerun passed.

### NUX-023

World/Knowledge history now exposes semantic comparison, new revisions copied from
historical content, explicit current-head selection and independent Library forks.
Diffs follow stable Knowledge entry IDs and separate ordering/dependency changes.
Head changes compare the captured head and retain existing exact pins. Forks publish
new roots/revisions atomically, retain provenance and use stable destination IDs
for safe retry. Knowledge forks remap entry identities and internal relationships.
World revision deletion/GC now shares head-write serialization. Missing explicitly
selected Knowledge revisions return not-found instead of an empty draft.

 Screenshot inspected.

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

 Screenshot inspected.

### NUX-025

Play Timeline now presents embedded Knowledge by human name, source story, entry
count and content excerpts; opaque identities stay in Details. Save to Library
previews a new or existing destination, provides naming, explains head behavior and
requires explicit confirmation. Failed saves retain the review draft. Success links
to the Library resource while leaving Session ownership unchanged.

 New roots/revisions publish atomically through Knowledge
repository creation, and a stable target Binding identity prevents duplicate retries.

 A real Edge 390px flow passed source and
destination preview, naming, confirmed promotion and Library navigation. Screenshot
inspected; one UI case reran after removing the duplicate review action and fixing
singular count text.

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
Draft.

 A real Edge scenario
passed prompt-channel delivery with legacy budget disabled, exact ContextPlan filtering,
absence of book-shaped candidates, Draft-local commit and Stop rollback.

Group 5 regression: 96 Native/Shell suites covered 707 passing cases and 68 optional
external database skips. Nine World Info
suites passed 70 cases and two adjacent orchestration suites passed nine cases. All
eight real Edge Knowledge/World/Studio/Play scenarios passed at 320/390px, including
Native prompt evaluation, promotion, references, historical revisions, bindings,
composition and semantic authoring. The current composition screenshot was inspected.

Next: NUX-027, following the active backlog order.
