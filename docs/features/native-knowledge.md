# Native Knowledge semantics

## Applicability

Knowledge reads the current committed Native Session snapshot. It never writes
scene state or consults compatibility World Info provider baselines.

`applicability.stateConditions` is an optional array of at most 32 predicates:
`{ providerId, path, operator, value }`. The provider must be an `atri_` Native
state namespace (or `atri_event_journal`); path is an array of 1–12 safe string
segments. Operators are `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`.
Values are finite JSON scalars; ordered comparisons require numbers and contains
requires a string. Missing providers/fields and incompatible actual types evaluate
unknown, never true through negation.

`stateConditionsLogic` is `all` (default) or `any`, using tri-state evaluation.
Unknown applicability does not admit the entry. With `any`, one known true
predicate is sufficient; with `all`, every predicate must be true.

`stateActivation` is an optional boolean, default false. True requires a non-empty
condition set. A true evaluation then activates eligible Knowledge without a
keyword match. Target, visibility, authority, dependency, probability and lifecycle
controls still apply. With false, conditions only gate ordinary discovery. Native
compilation records the evidence once; the compatibility delivery adapter does not
re-evaluate against a different provider snapshot.

`stateEvents` is unsupported and rejected on authoring/persistence and compilation.
Native has no one-shot transition-baseline contract for this field. Current committed
journal facts can be observed using `atri_event_journal` conditions such as
`path: ["latestEvent", "type"]`; that is a state predicate, not a one-shot trigger.
No legacy event state or user-data conversion is introduced.

Client and server share `public/scripts/native/knowledge-contracts.js`; invalid
fields identify their `KnowledgeEntry.applicability` path before revision writes.

## Delivery and target selectors

`delivery.position` is exactly `before` (default) or `after`. Unknown values and
legacy aliases fail validation rather than falling back to before.

`KnowledgeBinding.target` and `KnowledgeEntry.delivery.target` share one selector:
a kind string (`narrator`, `actor`, `agent`, `user`), an object `{ kind, id? }`, or a
non-empty array of up to 32 such selectors (OR). An omitted selector matches any
target; an omitted id matches the whole kind. IDs match exactly, never by display
name. Empty strings/arrays, null, unknown keys, type/actorId aliases and nested
arrays are rejected. Runtime compilation takes exactly one target, using the same
kind/id contract. Binding and entry selectors must both match.

The current Studio Knowledge editor uses these same enums for existing fields.
Source edits receive field-path errors before Review and retain their drafts.
Server-side revision validation remains authoritative for every caller.

## Discovery fields

Native supports `keywords`, `aliases` and `regex` arrays. `semanticHints` and
`vectorHints` are unsupported: Studio Source, server revision writes and detached
runtime snapshots reject either field, including empty placeholders. They are not
silently treated as descriptive metadata or forwarded to compatibility retrieval.
Native Memory embedding/rerank resources do not imply a Knowledge retrieval
consumer. No provider, vector index, inference cost or second authority is created
by declaring these fields.

## Entry authoring

Library revisions and Studio project-owned Knowledge use the same semantic editor.
Create, order and delete entries within a detached draft. Entry IDs remain stable
through reorder; required/related entries are selected by their displayed title.
Deleting a referenced entry is blocked until the author explicitly removes its
references. Review validates the whole revision and recomputes its ordered entry
identity list. Library creates a new immutable revision; Studio continues through
ChangeSet Review/Apply. Exact entry/revision IDs remain in Details. Advanced Source
supports opaque metadata and preserves unedited content rather than a second store.

The editor covers content/title, discovery, typed scalar state predicates and
all/any/direct activation, lifecycle, relations and delivery. Probability is a
finite percentage from 0–100. Sticky/cooldown/delay are non-negative integer turn
counts; object-shaped placeholders are rejected. Missing lifecycle values retain
existing defaults. Regex discovery accepts a JavaScript pattern or `/pattern/flags`
with `i`, `m`, `s`, `u`; malformed expressions and stateful flags fail validation.
The temporary delivery adapter preserves these expressions as regexes, never
silently demotes an authored pattern to a keyword.

### Library Binding management

Knowledge detail exposes a Binding manager with explicit exact revision selection,
augment/override mode, target rules, visibility, priority and enabled state. Library
Binding roots remain mutable under their existing authority; updates and deletion
require a captured integrity token. Source kind is Library here: project, packaged
and session-owned bindings remain with their respective owners.

World attachment/detachment publishes a new immutable WorldRevision using the
captured current revision as its compare-and-swap base. Historical World revisions
continue to reference and protect their bindings. Used By lists current/historical
World revisions and Studio dependency references, with navigation to their owners.
Installed Package and Session snapshots are not rewritten by Library edits.

Repository writes serialize related binding/base/world keys in a stable order so
FS commit-last publication cannot race attachment against binding deletion or
exact revision deletion against binding creation.

### World composition

Library and Studio share a World composition editor for nested baseline/schema
fields, Knowledge bindings and assets. Dependency choices come from the existing
Library catalog or the Project's declared resources, never a name-to-latest
resolver. Binding choices expose the pinned KnowledgeRevision; Library assets
expose their exact content hash. Project-owned assets retain source-file ownership.
Missing references remain visible and must be explicitly removed or resolved.
Review includes dependency names and exact references. Library publishes a new
immutable WorldRevision; project-owned Worlds continue through ChangeSet Review
and Apply. Advanced Source preserves metadata and arbitrary structured fields.

### Revision history actions

World and Knowledge history compares authored content with the captured current
revision. Knowledge changes follow stable entry identities and report order changes;
World changes separate baseline/schema and added/removed dependency references.
Authors may create a new revision from historical content, explicitly select an
existing exact revision as Library current, or fork it into a new Library resource.
Head selection compares the captured head and never repins existing dependants.
Fork publishes the new root and revision in the same repository transaction; its
stable destination ID prevents retry duplication. Knowledge forks remap entry IDs
and internal relations. Exact source provenance is retained in revision metadata.
World forks preserve shared dependency bindings rather than silently duplicating
or upgrading them. Missing selected revisions fail explicitly.

### Actionable references

Studio Inspector, Prompt Library and Library deletion blockers share reference rows
with readable owners, exact revisions and navigation through the existing Shell.
Reference requests retain Library/Project/Package scope, including exact package
version. Player Route references navigate to Runtime; packaged originals navigate
to their installed work. Local project references select the corresponding editor.

Studio Library Attach/Fork/Update now prepares operations and enters the same
ChangeSet Review/Apply path as other human edits. Detach removes only the explicit
project dependency, also via Review/Apply. EntryPoint/World consumers block illegal
detach and link to their owning editor. World/Knowledge deletion first presents
reverse-reference blockers; repository checks remain authoritative at write time.

### Promoting session Knowledge

Play Timeline names embedded Knowledge by its content and source session, with entry
counts and readable excerpts. Exact identities live in Details. Save to Library
first resolves the destination, offers naming for a new base (or displays the
existing base name), previews whether the Library head changes, and asks for an
explicit confirmation. The source Session binding remains session-owned.

Promotion checks a captured Library head, compares entry content as well as revision
metadata when exact identity already exists, and accepts a stable target Binding ID
for retry. New Knowledge roots and revisions publish through the existing repository
transaction. Repeating an already-completed request reuses its Library Binding.

## Native selection and prompt delivery

`NativeSessionRuntime.evaluateKnowledge()` consumes `KnowledgePlan` directly.
Stable exact identities and structured discovery, lifecycle, relations, delivery,
priority and provenance remain Native throughout selection. Literal keywords and
aliases, typed regex, recursive discovery and related-entry activation are supported;
required dependency bundles are atomic and may use compact content to fit the Native
Knowledge lane budget. Exact fits are accepted. ContextPlan-selected identities and
caps remain authoritative; legacy World Info settings cannot alter Native selection.

Evaluation is detached. `commitKnowledge()` verifies Session/Branch/Revision and
runtime-state identity, then stages `atri_knowledge_runtime` with the active generation
Draft (or uses an ordinary Native state revision outside a Draft). Stop discards the
staged state. Sticky, subsequent cooldown and initial delay use Native Timeline
length, with independent target-specific buckets and exact entry identities. Restore
and Branch history therefore restore lifecycle state without legacy chat metadata.

The shared prompt assembler temporarily retains its before/after channel names.
`knowledge-prompt-channels.js` adapts only final text channels and exact provenance;
it does not create World Info entries, use book names/UIDs or run the old selector.
Native state condition evaluation lives in `native/state-conditions.js`; legacy callers
retain only re-exported compatibility names. The obsolete N4 entry projection and
`knowledgePlanToWorldInfoEntries()` have been removed.
