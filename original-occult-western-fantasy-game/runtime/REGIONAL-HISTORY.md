# Multi-Region / Era / Macro History — Phase 6

Development: 2.0.0-phase6. Final target remains 2.0.0. This is not Phase 7 UI or the
10k-turn/200-year release. Exact tested commits and CI belong to the existing Record.

## One authority and clock

The Package appends declarative regional policy after enterprise. Native stores
regional state in atri_lifecycle.lifetimes.regional, resolves it in the existing
Lifetime event queue and publishes with the same History/Authority CAS/SaveSystem.
There is no Package evaluator, new scheduler, side database or v1 migration.
Existing 24-command, read/effect, Lifetime/History and checkpoint budgets remain.

## Regions and fidelity

Eastbank begins active. Northreach and Salt Coast begin as aggregate Cold World
regions in distinct jurisdictions. All retain population accounts, capital,
macroeconomic/legal/war/movement/public-health conditions, technology and Era.
Warm regions keep existing people, institutions, assets, bonds and cases. An
active remote hub requires real interests; at most two hubs are active in this
Package. The protagonist has one physical location, not simultaneous presence.

Promotion creates geography and a civic institution only on the first visit or
relevance-backed activation. It reads prior regional history, scars and Era.
Newly relevant office holders are adults with earlier birthdays; materialization
is not birth. Offices use Native succession. Returning never reinstalls the old
opening population, property, public identity, institutions or balances.

Demotion limits active content to the current location; remote durable records
are retained, not deleted. Cold regions do not instantiate a population. Named
people already in a region retain exact lifetime milestones even after departure.
The finite authored world has three regions, not an unbounded procedural atlas.

## Typed operations, travel and remote interests

Use opening.wait with the existing lifetime/world.change envelope. The convenience
regionalCommand(verb, input) in public/shared/native-regional-contract.js constructs
input only. No extra top-level command slot is consumed.

- travel: regionId, mode (coach/rail/motor). Raw world.change uses operation
  region.travel, id=regionId, otherId=mode, sourceId/name empty.
- fidelity: regionId, tier (active/warm/cold). Raw operation region.fidelity,
  otherId=tier. Connected assets/agents/bonds/cases prevent cold demotion.
- invest: regionId, project (transport/communications/sanitation/research), sourceId.
  Raw operation region.invest, otherId=project, name empty. Requires a resolved
  local Matter, real trade/research permission and 100 treasury units through the
  existing financial ledger. Regional connections are required remotely.

Travel first records and pays for a journey, without teleporting or advancing a
second clock. Continue opening.wait until journey.arrives, or include the interval
in another permitted time-bearing operation. Route distance, available technology,
Era, transport and current disruption determine its locked duration and cost.
Departure/arrival dates survive saves. Existing Native simulation may temporarily
advance its clock before Lifetime resolution; complete candidates must resolve
all arrivals. Personal case/world/family actions are refused while in transit.
Direct investigation/world mutation in an absent hub is refused; existing local
agents handle delegated work. Agents outside the target region escalate instead
of acting there magically. Entity IDs, ownership and institutional autonomy remain
Phase 5 authorities. Macro conditions affect actual business costs/earnings;
Era obsolescence reduces asset condition, repair remains an enterprise expense.

## Sparse macro history

Each region has fixed five-year review anniversaries in the existing queue. This
is a coarse authored abstraction, not a per-day or per-person simulation. Split
and whole intervals produce the same world truth; work scales with reviews and
real lifetime events. Reviews evolve:

- capital/credit: expansion, bubble, recession, banking crisis, recovery;
- war: state-conditioned tension, mobilization, war, armistice, reconstruction;
- law: customary, proposed, disputed, adopted, implemented, amended;
- migration: paired inflow/outflow between actual regions, conserved globally;
- births/deaths and broad age/workforce shares, plus epidemic/war losses;
- epidemics and industrial disasters, relief geography and durable scars;
- social/religious movements: emerging, recruiting, split, institutionalized,
  declined; these create public/legal pressure rather than individual followers;
- large occult incidents and later standardized countermeasures. Exact concealed
  causes are private History facts, not leaked through public Chronicle queries;
- transport, communications, sanitation and research diffusion when capital and
  stability support adoption.

Public macro events retain causal links and exact dates. Relevant crises leave
bounded alerts; this phase does not add a second interrupting scheduler or promise
that an already-requested interval stops at every macro review. Old matters can
escalate during absence; ten years apart can estrange existing family bonds.

## Conditional Era and content

Opening, Networked and Regulated eras require technology/adoption thresholds,
capital, implemented law and sufficient stability. They are not year-number
switches. Actual investment can accelerate individual prerequisites; unsupported
claims cannot rewrite them. Each transition retains its satisfied requirements.
Regional eras can differ. Chronology.era_id projects the protagonist's current
region, not a second Era authority.

Transport/communication infrastructure, business use/condition, record-density
exposure, legal maintenance costs and occult standards change materially.
Network safety and integrated-register case grammars unlock in later eras with
different actual evidence paths and outcomes. Matter bindings remain local and
record the source region/Era. Original history/Hooks/artifacts remain eligible;
no rename-only novelty is counted.

regionalView is a bounded cloned backend projection, not a sandbox binding or
final UI. It exposes at most three authored regions and eight relevant alerts,
not secret causes, hidden Matter truth or enterprise loyalty/true balances.
Final information architecture follows player-facing-experience.md in Phase 7.

## Verification boundary

Run node tools/package.mjs validate --regional-only --core <compatible Core>.
Default is the user-approved focused Phase 6 acceptance: 100 actual content-mutating
turns with sparse event-driven advancement across 50 in-world years. The calendar
span retains generations, decades of regional absence and Era transitions without
5,000 persistence transactions. It is not Gate B, high-turn growth proof or Gate C.
No simulation rates, dates, permissions or safety budgets are changed.

The existing renewal checker forces historical Hook reuse every three completed
matters and institutional change every six. It checks at least two kinship edges,
early/late semantic variation, opening evidence reused after 25 years, retained
institution lineage, and four content checkpoints at turns 25/50/75/100. Together
with departure/arrival saves this performs ten actual alternating Fs/SQLite
imports, each preserving all authoritative state in a one-revision checkpoint.
Elapsed milliseconds and the explicit profile label are included in the result.

Opt into the original 5,000-turn soak with --regional-only --regional-full.
ATRIA_RENEWAL_TURNS remains available for diagnostics; custom short counts other
than the exact 100-turn acceptance are labeled smoke and do not satisfy Phase 6.
Invalid counts fail closed. Hosted package_check=regional uses focused acceptance;
regional-soak explicitly opts into the long run. Prefer local execution; retain
existing exact-code four-adapter evidence instead of rerunning it routinely.

The regional scenario adds remote foundry ownership/delegation, earned dual hubs,
Eastbank departure around year 10, return around year 40, and later Salt Coast
materialization. Save/Restore occurs at departure, arrival and content checkpoints.
Native tests add a seed matrix, whole/split equivalence, conditional Era content,
private history, macro propagation, causal intake, conserved migration, atomic
budget refusal and four-adapter old SavePoint/checkpoint/Retry transitions.

The regional event ceiling is 256 and active-hub ceiling two, inside prior safety
limits. No durable fact is evicted on exhaustion. Alert lists are projections of
retained events. Growth means active state/portable export, never accumulated old
revisions, explicit SavePoints or backup files. Preserve releases/1.0.0.atria.

Person residence is an exact History source. Birth uses the actual parent region,
not the absent protagonist location. Demotion compacts only empty rebuildable hot
profile stubs; authored notes and all canonical identity/relationship state remain.
