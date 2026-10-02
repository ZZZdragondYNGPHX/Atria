# Long-Horizon Runtime Foundation — Phase 1

Status: implemented foundation, **not** a completed Long-Lived World release.
Task: refactor/original-occult-western-fantasy-long-lived-world.

## Build and authority ownership

Default package compilation is opening → network → convergence → long-horizon → history.
The last compiler emits only Native declarations; no Package-side evaluator,
scheduler, RNG, database or save format is shipped. Core Clock, Authority,
Lifecycle and SaveSystem remain the authorities.

- Development Package version: 2.0.0-phase2, with a distinct immutable PackageVersionId and remapped model-resource origins.
- Final release remains 2.0.0, gated by the later approved phases.
- --v1-campaign explicitly compiles the bounded historical campaign instead.
- --fixture retains the separate synthetic two-day foundation fixture.
- The source manifest/runtime JSON remain the historical bootstrap/compiler inputs;
  they are not the final compiled v2 runtime. Use tools/package.mjs.
- releases/1.0.0.atria is never rewritten; old v1 saves are not migrated.

Phase 1 time prerequisite: main@4b9fd013880cfc242d330f4a2be143416be20d4f or a descendant
containing its simulation change. The prior Core limited advances to 10,080 ticks
and instants to signed 32-bit values. The minimal prerequisite expands these to
safe integers and exposes the scheduler's read-only clock.targetTick. It does
**not** expand job, step, effect, read, command or deliberation budgets. This Core
commit is separate from Package; main is never merged into the Package branch.

## One clock and civil chronology

The Native world clock is an integer minute instant. Zero is the opening epoch.
The chronology domain is its persisted calendar/index projection, not another
clock that callers may set independently. Calendar updates occur inside the same
Native candidate/CAS as the clock advance, including direct Host clock advances.

The epoch displays as civil year 1, January 1, 00:00. This is an ordinal convention,
not a claim that the story takes place in a particular real-world historical year.
The calendar is proleptic Gregorian: normal month lengths, leap years divisible by
4 except centuries not divisible by 400. Week is an epoch-relative seven-day index,
not an ISO week. Seasons are the four calendar quarters. era.opening is a stable
ID, not an automatically ticking duration or an implemented Era transition.

chronology.calendar contains elapsed day, civil date, minute of day, week and
season. cycle_year/cycle_day are rebuildable arithmetic intermediates. They keep
each declaration within the existing formula budget. Calendar derivation has
constant work; it does not enumerate skipped days or years.

chronology.sequence orders committed player Authority transactions at the same
instant. It is a transaction ordinal, **not** evidence of the Gate A/B/C definition
of a meaningful authoritative turn. Existing opening receipts can include refused
attempts. Native revision ancestry still owns rollback/branch order; raw Host
clock commands advance the clock without inventing a player transaction.

Bounds are safe-integer integrity bounds, not campaign end dates. Overflow,
negative and fractional advances fail during preparation and publish no state.

## Interval resolver skeleton

opening.wait retains the minute API and accepts multi-year/multi-decade intervals
directly. There is no one-year confirmation ceiling. All other retained timed
transactions use the same clock and resolver.

The sole Phase 1 job, chronology.interval, is due at clock.targetTick. It passes
its already-granted starting instant into the existing simulation-origin
opening.day transaction. That transaction aggregates the retained opening rent,
appointment and monotone Eastbank deadlines, then derives the civil date. It does
not iterate daily, issue background narrative requests or invent historical events.
The global Day 30 and next_tick assumptions are absent in the default world.

last_interval records from/requested_until/resolved_until, a scale ordinal
(0 scene, 1 day, 2 week, 3 month, 4 season, 5 year), resolver steps and interrupted.
The scale is a coarse span classification (30/90/365-day thresholds), not an Era
clock or a claim that later domain resolvers have been implemented. Phase 1 has
no high-impact interruption providers; its resolved target equals the requested
target. Later phases must add meaningful event boundaries/interruption and domain
resolution without treating the current skeleton as completed fast-forward play.
Active cases do not freeze the clock.

Finite opening Pattern slots remain finite. Their due-date schemas now allow
late-world dates; this is not renewable content generation. A small equivalent
consolidation of mandate/manage/Claim-maintenance writes keeps the existing
24-command and 16-read budgets instead of widening Core work limits.

## Persistent identity and provenance

A world reference is scoped by the immutable Native sessionId plus its world
ID. SaveSystem preserves sessionId on import; a new world receives a new sessionId.
Do not replace this with a display name, current revision ID or a second UUID store.
Retry branches preserve entity identity while branching history.

continuity stores world_id, the persistent Native protagonist actor ID, the initial
public identity ID, its origin, the stable current-actor registry and a reserved
next_entity_serial for later dynamic entities. The cursor is persisted but Phase 1
does not generate new populations, institutions or artifacts. Existing authored
case/definition IDs remain scoped stable source references, not renewable slots.

Instantiated entities receive a fixed persistent_id independent of their name,
role and current record position. Provenance is a typed source ID, origin kind,
chronology stamp (tick + sequence) and optional parent ID. Repeated contact keeps
the first-introduction stamp. Introduction is **not** birth: dates of birth, death,
kinship, office tenure, ownership transfers and canonical historical facts are
not inferred or installed by this primitive. The empty pre-creation Anchor slot
has no person identity until the player completes that creation step.

The public identity points to the same persistent protagonist. Public identity
rotation, age exposure and legal continuity consequences remain later-phase work.
These primitives are not a Canonical Fact Ledger or artifact registry.

## Long-term stance contract

opening.wait accepts optional stances, a complete closed object with six domains:
career, family, occult, social, wealth, investigation. Values are declared enums
in tools/long-horizon-compile.mjs. Partial/unknown policies fail validation.

- Omission preserves the current policy.
- minutes: 0 with stances changes policy without changing time.
- minutes: 0 without stances is an impossible request, not useful progression.
- The policy, revision and changed_at stamp persist through Save/Restore.
- Stances are stored, not executed as family, wealth, longevity or delegation systems.
- The existing generic frontend keeps its minute-only action form; the optional
  structured stance argument is available at the typed Authority contract, not
  exposed as a broken scalar form. Final long-life UX remains Phase 7.

Example Authority input (not a separate script/runtime):

~~~json
{
  "minutes": 5256000,
  "stances": {
    "career": "research", "family": "selective", "occult": "conceal",
    "social": "low_profile", "wealth": "preserve", "investigation": "inactive"
  }
}
~~~

## Save and verification boundary

The new domains live in the existing atri_lifecycle namespace, so Native snapshot
export/import includes time, identity, provenance and stance state atomically.
Tests import actual save containers into fresh FsEngine and SqliteEngine stores,
compare all authoritative state namespaces and timelines, then advance again.
They also verify failure atomicity, stable namespace/actor IDs and Gregorian
ordinary/leap/century rollover. The retained opening and Eastbank fixtures exercise
real Native transactions, existing safe Graphs, Retry Reply and SaveSystem.

Phase 2 adds Hot/Warm/Cold/Archive, a Canonical Fact Ledger, artifacts/hooks,
subjective memory, Chronicle backend and portable checkpoints. See HISTORY-MEMORY.md
for ownership, exact contracts and the important archive/Retry boundary.

Family/NPC lifecycle, renewable generation, enterprise/delegation, multi-region,
macro/Era simulation and final Chronicle UI remain unimplemented. The Phase 1
date test jumping centuries is **not** Gate A/B/C or a century-world simulation.
Use the dedicated Phase 2 check for history-only development/retrieval evidence.
