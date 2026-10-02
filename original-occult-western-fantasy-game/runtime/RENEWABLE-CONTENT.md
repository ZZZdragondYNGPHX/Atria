# Phase 4 — Renewable World Content

Development: 2.0.0-phase4. **Implementation candidate; not yet a passed Phase 4 gate.**
Final release remains 2.0.0; the retained 1.0.0 archive is unchanged.

## Ownership and declarations

The Package adds tools/renewal-compile.mjs after lifetime compilation. Curated
structural grammars and initial geography are policy, not a Package evaluator.
Native Lifetime preparation owns atri_lifecycle.lifetimes.renewal in the existing
private candidate; History, Clock, CAS publication, Retry and SaveSystem are reused.
Core candidate: feat/native-renewable-world@6e2611a0a (runtime unchanged from 0fced2b79; additional checkpoint/restore tests).
A compatible Core must include native-renewal-contract.js / renewal-authority.js;
80376ec9f by itself is the Phase 3 baseline, not sufficient for this candidate.

No wealth accounts, delegation, complete identity rotation, region simulation,
Era/macro evolution, final UI or v1 save migration are added.

## Typed actions

opening.wait retains its existing lifetime envelope:

- matter.open: grammarId (empty permits selection), hookId (empty for contemporary work).
- matter.act: id, action, presentation. Actions must follow the selected authored
  evidence path, then settle or record. Unknown fields and arbitrary outcomes fail.
- world.change: id, operation, otherId, sourceId, name. A resolved canonical Matter
  supplies the durable cause. Founding/building use an empty id and allocate Native
  world-scoped identities. Building/business creation names an existing district.

The Core shared contracts define exact accepted values. presentation is at most
320 characters of attributed, unverified testimony; it never writes structural
truth. renewalView exposes bounded current work and the allowed next actions,
without hidden truth or secret kinship. It is a backend projection, not final UI.

## Generation and repetition

Selection uses current active adults, public kinship, active institutions,
current geography, surviving artifacts and eligible dormant Hooks. Generation
examines at most 64 candidates. Its deterministic input is the Package seed and
persisted content state, not chronology.sequence. A failed selection refuses the
whole candidate rather than bypassing novelty checks.

The rolling 64-entry audit excludes names and grammar IDs. Subject/role classes
come from real bindings; path is the actual executed action sequence, not a
random cosmetic label. Hidden truth, anomaly, stakes, resolution, institutional
role and historical role supply other structural dimensions. Near matches within
90 days are rejected, as are exact structures still in the rolling window.

An evidence action changes the authoritative investigation record. A conclusion
changes local pressure and closes the live Matter; ordinary details can compact
through the existing history tiers. Explicit recording, historical reopening,
or an unattended deadline promotes a durable case record and exact ledger facts.

A 30-day authored response deadline escalates an unattended Matter once, at its
actual due tick, through the existing interval preparation. It does not enumerate
intervening days or freeze time. Departed witnesses supply explicitly attributed
archival evidence, not new live testimony from a dead/retired person.

## Historical and institutional continuity

Opening a historical Matter activates its existing Hook in the same published
history event. Closing resolves that same Hook with attributed transitions. It
cannot be consumed twice. Artifact source identity is exact; lost/destroyed
artifacts do not silently become surviving documents. Player-marked artifacts
remain protected by the Phase 2 retention contract.

New institutions and merger/split successors acquire offices through the existing
Native succession path. Vacancies materialize causal adult intake with separate
birth/introduction dates. Dissolution closes old terms and offices, displaces
members, and preserves predecessor/successor identity. It never allows the old
institution to keep acting through an automatically refilled closed office.

Locations/businesses/districts can be created, expanded, renamed, repurposed,
declined, burned, demolished, rebuilt or protected. Old geography remains durable.
Enterprise bookkeeping and property-law ownership are Phase 5, not implied by
these entity-lifecycle foundations.

## Budgets, storage and validation

All existing Lifetime and History budgets still fail atomically. This candidate
adds a 96-entity geography/institution ceiling, a one-Matter active limit and a
64-entry novelty window. Canonical history is not discarded to fit those limits.
Indexes remain derived from canonical, normalized facts. Explicit retained saves
and branches are not included in claims about active-state growth.

Run the real Package candidate with:

    node tools/package.mjs validate --renewal-only --core <compatible Core>

Default: 5,000 content-mutating turns spanning at least 50 years. Extra setup,
family, history and world changes are not used to inflate that content count.
The fixture checks two generations, current institutional renewal, later genuine
case/artifact/Hook reuse, semantic structures, bounded nonempty projections and
actual Fs/SQLite save imports. ATRIA_RENEWAL_TURNS is a smoke-test override; a
smaller run is never Gate B evidence. A candidate run is not Gate C or release.

The same Record and live HANDOFF carry actual results and remaining work. Do not
start Phase 5 until Phase 4 implementation and the frozen candidate gate pass.

### Portable-export measurement boundary

The Gate B checker explicitly requests the existing Native history.compact before
each measured export/import. This does not count as a meaningful content turn.
It asserts unchanged clock, Lifetime world state and all durable facts, heads,
anchors, artifacts, Hooks and marked memory. A single-branch portable export must
contain exactly one revision; its uncompressed save.json bytes are recorded
separately from archive bytes and active-state bytes. Projection maxima include
actual investigation evidence, not only the empty-at-open view.

This distinction matters: an uncheckpointed snapshot includes its retained raw
revision window. In the first full run the 5,000th content turn completed with
833,018 active-state bytes, but its raw-window export exceeded the unchanged
64 MiB save.json bound before final import/audits. That run did not pass Gate B.
No container/history/lifetime limit has been raised and no old save or durable
fact is deleted by the repair. Existing explicit old SavePoints and branches
continue to retain their own history and are not active-growth measurements.
