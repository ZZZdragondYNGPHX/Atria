# Long-Lived World — Decisions

**Task ID:** `refactor/original-occult-western-fantasy-long-lived-world`

This file records only decisions that should not be casually reopened by later implementation agents.

## Frozen

### D-001 — Preserve v1 historical truth

The existing v1.0 bounded 30-day campaign and its P1–P9 completion record remain historically valid. The long-lived-world project is a new expansion/rearchitecture, not a retroactive claim that v1 was unfinished.

### D-002 — Separate new Plan Bundle

The long-lived-world design uses its own Plan Bundle under:

`plans/package/original-occult-western-fantasy-game-long-lived-world/`

The original v1 Plan Bundle remains the authority for the released v1 scope.

### D-003 — No implementation during design discussion

During the current discussion phase, the Package task branch may exist, but game assets are not modified until the user freezes the design and explicitly hands implementation to Codex Astra.

### D-004 — One continuous player protagonist

The long-lived world keeps one player-controlled protagonist for the entire save.

There is no mandatory heir, successor, student, descendant, or replacement-character handoff. NPC generations may change around the protagonist, but player identity remains continuous.

### D-005 — Supernatural longevity is allowed as the continuity mechanism

The protagonist may remain active for decades or centuries through setting-consistent occult or supernatural means. The long-horizon design should therefore make prolonged life part of world logic rather than relying on unrealistic human lifespan assumptions.

### D-006 — Ordinary death does not end the save

Routine lethal outcomes do not automatically terminate the long-lived-world save.

The protagonist may suffer bodily death, disappearance, reconstruction, delayed return, severe injury, memory damage, identity loss, resource loss, Claim escalation, or other durable consequences while the world continues to advance.

A truly irreversible death may exist only as an exceptional and explicit end-state. It must not be triggered as a casual consequence of ordinary combat, accidents, disease, or routine ritual failure.

### D-007 — Tiered lifecycle simulation

Tier A actors receive full long-horizon lifecycle simulation. Tier B actors receive reduced but real lifecycle simulation and can promote through sustained relevance. Tier C population remains aggregate until instantiated by relevance.

### D-008 — Causal NPC entry

New NPCs must enter the world through world-state causes such as birth, migration, hiring, promotion, marriage, recruitment, institutional expansion, case involvement, disaster, war or player-created vacancies. Long-running play must not rely on context-free random NPC spawning.

### D-009 — Institutional continuity and succession

Institutions have durable identity and organizational memory separate from their changing leaders and office holders. Leadership succession can alter agendas without erasing institutional history.

### D-010 — Historical actors are compacted, not erased

Death, retirement and long-term absence remove actors from hot simulation when appropriate, but durable identity, relationships, major life events, death/exit, inheritance, claims, secrets and unresolved hooks remain queryable history.

### D-011 — Authority governs historical validity

AI may generate constrained presentation details and candidate biographies, but Runtime Authority owns dates, lifecycle legality, relationships, succession, role eligibility and whether a proposed historical fact becomes canon.

### D-012 — Family is persistent world state, not player succession

The protagonist may marry, form long-term partnerships, have biological or adopted children, become widowed, separate and remarry. Descendants can become important actors, but none replace the player protagonist.

### D-013 — Family simulation is relevance-scaled

Family graphs may span multiple generations. Important milestones and high-impact relationships are simulated; uneventful childcare and ordinary years may be abstracted. Detailed simulation follows relevance rather than enumerating every descendant equally.

### D-014 — Longevity does not automatically propagate

Spouses, partners and descendants age normally unless they separately obtain a valid supernatural longevity mechanism. Sharing longevity is a deliberate, rare and costly act, and the recipient may refuse it.

### D-015 — Inheritance carries history forward

Property, reputation, secrets, grudges, favors, institutional ties and selected supernatural consequences may persist or transfer across generations where world logic permits.

### D-016 — Surface relationship norm is socially traditional, not mechanically exclusive

Surface society generally treats one-to-one partnership and marriage as the normative public arrangement. This is a social expectation rather than a hard engine restriction.

Affairs, hidden partners, informal unions, same-sex relationships, multi-partner arrangements and other structures may exist. Their visibility, legality, stigma, risk and institutional consequences are contextual to era, locality, class, religion, law and organization.

### D-017 — Long fast-forward is genuinely long

The player may request multi-year or multi-decade fast-forward directly. The engine does not impose an arbitrary one-year confirmation ceiling.

### D-018 — Fast-forward is event-driven and interruptible

Long-horizon advancement uses hierarchical/event-driven resolution rather than full daily simulation. High-impact events may interrupt the requested span and return control to the player at the meaningful point.

### D-019 — Unresolved content does not freeze the calendar

Active cases and obligations do not universally block fast-forward. The player may explicitly continue, abandon, delegate or leave matters to world resolution. Consequences continue independently.

### D-020 — Long-term stances guide compressed time

Before substantial fast-forward, the protagonist may define persistent stances across career, family, occult practice, social posture, wealth and investigation. These stances guide background resolution until changed or interrupted.

### D-021 — Renewable content is grammar-driven, not slot-driven

Long-running cases and world events are generated from curated structural grammars composed with current world state. Fixed one-use or preallocated instance slots are not the long-horizon model.

### D-022 — Historical hooks seed future content

Resolved matters may leave compact durable hooks such as debts, secrets, missing evidence, descendants, institutional scars, unresolved Claims or disputed history. Later content may causally reuse those hooks.

### D-023 — World entities have full lifecycles

Locations, businesses, factions and institutions may be created, transformed, renamed, merged, split, relocated, repurposed, destroyed, dissolved or archived. The opening world map and organization list are historical starting conditions, not immutable canon fixtures.

### D-024 — New world entities require causal origin

Dynamically created locations, organizations and institutions must have an explainable origin in world state: founders, capital/resources, membership, social need, disaster, migration, institutional split, player action or comparable causes.

### D-025 — Anti-repetition is semantic

Content generation must track more than pattern names. Repetition control should consider actor roles, institution combinations, hidden truth, anomaly family, investigation path, stakes and resolution structure.

### D-026 — Canon promotion is impact-based

Routine resolved matters may compact heavily. Matters that materially alter important actors, institutions, geography, Claims, law, family history or the protagonist's identity become durable canonical history.

### D-027 — Historical fidelity is tiered

Long-running saves do not retain every turn and transaction at full fidelity. Historical information moves through Hot, Warm, Cold and Archive tiers according to recency, importance and unresolved causal relevance.

### D-028 — Canonical facts are separate from narrative summaries

Precise facts that later world logic may depend on are stored in a Canonical Fact Ledger and are not allowed to disappear or become ambiguous merely because narrative history was compacted.

### D-029 — Durable artifacts outlive event detail

Documents and objects such as photographs, letters, contracts, wills, newspapers, case files, diaries, property records, ritual records and heirlooms may persist independently of compressed events and can reintroduce old history into active play.

### D-030 — World Truth and Protagonist Memory are distinct

The authoritative world may retain facts that the protagonist no longer remembers clearly.

Ordinary details may fade over decades or centuries. Major events, strong relationships, deliberately recorded information and player-marked memories remain clearer for longer.

Memory degradation must remain light-touch and must not routinely override explicit player knowledge.

### D-031 — History is player-inspectable

The final design should expose a Chronicle/Archive capable of browsing historical timelines and records by major world dimensions such as date, actor, family, place, institution, case, Claim and Era.

### D-032 — Long-horizon progression becomes horizontal

Conventional vertical progression may matter early, but decades-long advancement is primarily expressed through capabilities, permissions, relationships, assets, institutions, specialized knowledge, Claims and obligations rather than unbounded numeric stat growth.

### D-033 — Wealth and property remain world-bound

Money, businesses, land and other assets have provenance and remain subject to world processes such as depreciation, destruction, seizure, legal identity, inheritance, economic change and institutional pressure.

### D-034 — Careers are social roles, not permanent classes

The protagonist may change careers repeatedly and hold multiple roles when world rules permit. Careers primarily grant access, authority, networks, duties and liabilities rather than simple stat bonuses.

### D-035 — Public identity is separate from protagonist continuity

Changing or retiring a legal/public identity does not reset the protagonist, but it may disrupt ownership, licenses, reputation, banking, marriage, criminal records, contracts and institutional standing.

### D-036 — No universal level scaling

The world does not scale every opponent to protagonist power. As personal capability grows, challenge shifts toward larger or more complex systems such as family, institutions, law, property, history, identity exposure, Claims and occult obligations.

### D-037 — City-scale power is permitted but optional

A protagonist may become a major owner, institutional leader, religious authority, occult power broker or other city-scale actor through actual play. Long-lived low-profile play remains equally valid.

### D-038 — Death can damage embodied progress without erasing deep continuity

Bodily death or reconstruction may damage current-body state, equipment, public identity or role-specific advantages while preserving most deep protagonist continuity such as core knowledge, long-term history, Claims and durable relationships where world logic permits.

### D-039 — The world advances beyond the opening era

The setting is not permanently locked to the opening occult-western technology and social structure. Long-running play may progress into modern and potentially later eras.

### D-040 — Era evolution uses authored inertia plus emergent divergence

World development follows curated historical/technological tendencies but actual timing and form depend on world state. Major occult events and sufficiently consequential player action may accelerate, delay or redirect development.

### D-041 — Occult knowledge modernizes too

Anomaly classification, Claim theory, ritual practice, countermeasures, occult medicine, regulation and potentially industrialized supernatural systems may evolve across eras rather than remaining static.

### D-042 — Era transitions are systemic

Era changes may modify careers, industries, infrastructure, transportation, communication, law, institutional authority, artifacts, social norms and content-generation grammars. Era is therefore a rule layer, not merely a historical label.

### D-043 — Era transitions are condition-driven

Era changes should emerge from development conditions and world events rather than firing only because a fixed calendar year has been reached.

### D-044 — The world is multi-region and dynamically scoped

The starting city is the first high-fidelity hub, not the permanent world boundary. Long-running play may span multiple cities, regions and countries.

### D-045 — Regional fidelity is tiered

World geography uses at least Active Hub, Warm Region and Cold World fidelity. Simulation detail follows player relevance while all regions continue to advance in time.

### D-046 — Region promotion preserves prior history

A region promoted into detailed simulation must instantiate consistently from its pre-existing macro history, institutions, population trends and prior events. First detailed visit does not imply first existence.

### D-047 — Travel consumes world time

Travel duration follows era-appropriate transport and may create meaningful absence consequences in other hubs and relationships.

### D-048 — Macro events affect local worlds

Coarse national and international history may influence migration, institutions, economy, law, family, property, technology and occult conditions without requiring whole-world population simulation.

### D-049 — International reach is allowed but earned

The protagonist may eventually maintain assets, agents, institutions and relationships across multiple regions or countries through actual play. The system does not grant global influence merely for surviving long enough.

### D-050 — Macro history is systemic but not grand strategy

The long-lived world explicitly models economic cycles, governance/law, war, migration/demography, public health/disaster, religious/social movements and large occult events through curated macro grammars and state-driven resolution.

The game does not attempt full nation-state grand-strategy simulation.

### D-051 — Macro consequences propagate into local play

Economic, military, legal, demographic, religious and occult macro events may alter prices, employment, property, institutions, migration, family, law, technology and local content generation.

### D-052 — Macro relevance controls detail

Macro events normally stay coarse unless they intersect with the protagonist's people, assets, institutions, Claims, current region or declared interests.

### D-053 — Player political/social leverage is causal

The protagonist's ability to affect public policy or macro outcomes depends on actual accumulated leverage such as capital, institutional office, media/social reach, organizations, relationships, archives or occult power.

### D-054 — National/international power is allowed but optional

A sufficiently established protagonist may eventually influence national law, war policy, major cross-regional institutions or occult orders. This is an extreme-late-game option rather than an automatic progression path.

### D-055 — Delegation is policy-driven

Long-horizon delegation uses explicit authority boundaries, policies and escalation rules so the protagonist can manage work without approving routine actions.

### D-056 — Agents are full actors

Important agents and managers have their own competence, loyalty, ambition, relationships, secrets, Claims, values and lifecycle. Delegation outcomes arise from those properties and current world conditions rather than a single efficiency score.

### D-057 — Organizations develop hierarchy

Large player-created organizations may develop layered leadership and aggregate lower ranks so management can scale from individual tasks to departments, regions and long-term policy.

### D-058 — Delegated failure creates world consequences

Mismanagement, fraud, corruption, betrayal and bad judgment are valid outcomes. They alter world state rather than producing only abstract mission-failure messages.

### D-059 — Escalation is significance-gated

Routine delegated operations should not repeatedly interrupt long fast-forward. Interruptions occur when authority is exceeded, configured alerts fire or high-impact consequences emerge.

### D-060 — Player-founded institutions may diverge from the founder

Organizations can accumulate institutional culture, leadership interests and historical inertia. Their Agenda may become partially independent of the protagonist, and extreme divergence may lead to internal resistance or opposition.

### D-061 — 10k-turn / 200-year final release gate

The Long-Lived World project cannot be declared complete until a continuous authoritative-world soak reaches at least 10,000 authoritative turns and at least 200 in-world years.

### D-062 — Long-run completeness is behavioral, not merely crash-free

The final soak must demonstrate real lifecycle, institutional, geographic, Era, macro-history, renewable-content, history-compaction and multi-region behavior. A world that merely remains process-stable while nothing meaningfully changes does not pass.

### D-063 — Long-run validation requires multiple evidence types

Final validation requires deterministic fixtures, a multi-seed matrix and long-running soak coverage. One favorable deterministic path is insufficient.

### D-064 — Historical integrity is a hard invariant

Chronology, kinship, ownership, office tenure, institution lineage, artifact provenance, Canonical Facts and other causally significant facts must survive compaction, Save/Restore and long-horizon progression without contradiction.

### D-065 — Storage and context growth must be sublinear

Long-lived history must compact and retrieve selectively so state/history storage and active model context do not scale linearly with every turn.

### D-066 — Eight-phase implementation order is frozen

Implementation follows the dependency order in `implementation-staging.md`:

1. Long-Horizon Runtime Foundation
2. History / Memory / Compaction Core
3. Human Lifetime / Family / Institution Lifecycle
4. Renewable World Content
5. Progression / Wealth / Delegation / Organization
6. Multi-Region / Era / Macro History
7. Player-Facing Long-Life Experience
8. Century Integration / Stress / Release

Each formal phase ends with validation, persistence, Record/HANDOFF refresh and a stop.

### D-067 — One task branch across all phases

All implementation phases use `refactor/original-occult-western-fantasy-long-lived-world` until final verified integration into the long-lived `package` workspace.

### D-068 — Version 2.0 release preserves 1.0

The target long-lived-world release is `2.0.0`. The existing `releases/1.0.0.atria` is retained unchanged as historical release evidence.

### D-069 — v1 save compatibility is not required

The long-lived-world refactor may change foundational runtime/state schemas without implementing migration for old v1 saves.

The v1 campaign remains useful as a behavioral regression fixture where practical, but compatibility debt must not constrain the new century-scale architecture.

### D-070 — The Day 30 ceiling is removed in Phase 1

The old 30-day bound remains a v1 regression scenario only. Phase 1 removes it as the global authoritative world limit.

## Implementation-deferred details

Detailed numeric thresholds, serialization layouts, exact schema field names, route-specific longevity catalogues, compaction budgets, generator tuning and UI component choices remain implementation decisions inside the approved module boundaries. They must not reopen the frozen product decisions above without a real conflict.
