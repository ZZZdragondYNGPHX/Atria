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
