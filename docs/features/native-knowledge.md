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
