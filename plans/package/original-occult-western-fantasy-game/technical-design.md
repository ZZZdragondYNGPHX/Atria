# Original Occult Western Fantasy Game — Package Technical Design

## Responsibility

Owns Round 9: translation of the approved game/content design into current Atria Package contracts, data resources, lifecycle domains, information views, tasks, content resources, continuity, and frontend integration boundaries.

## Dependencies

- `index.md`
- `decisions.md`
- `content-architecture.md`
- `simulation.md`
- `gameplay.md`
- `player.md`
- `metaphysics.md`
- `platform-and-gameplay.md`

> **Current discussion:** Round 9 is open. Revalidate the current Atria `main` contracts before freezing any Package mapping. Existing platform capabilities must be reused where sufficient; only real missing primitives should be recorded as platform gaps.

---

### 6.46 Round 9 question — Package technical design

Round 9 must determine:

- which approved capabilities the Package declares;
- how static authored content maps to Package Data resources;
- how the fourteen logical simulation domains map to Lifecycle scopes/domains without needless fragmentation;
- how the canonical world clock, automations and workflows map to Lifecycle;
- how Narrator / Actor / Agenda / Reflection / Advisory views map to Information Runtime;
- which tasks belong in Task Runtime and which logic remains deterministic;
- how Case / Evidence graph projection is represented;
- how Outcome Packets and resolved actions reach narration;
- how save / restore and long-running continuity interact with generated/persisted state;
- how bounded generative content is promoted into authoritative state;
- which parts of the lightweight frontend contract must be supported by Presentation / Native Frontend without prescribing design;
- whether any approved game requirement is not expressible by current Atria `main`;
- which apparent gaps can be solved inside the Package and which, if any, require Core changes.

Round 9 must not start Package implementation.

## Current Atria main audit baseline

- **Verified main:** `c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`.
- **ExperienceContract v1** currently supports the relevant declared capabilities, including `package-data`, `data-projection`, `action@2`, `declarative-mutation`, `message-projection`, `turn-contract`, `turn-envelope`, `narrative-outcome`, `runtime-automation`, `perspective`, `model-task`, `session-application`, `temporal`, `player-continuity` and `workflow`.
- **Lifecycle Runtime v1** supports up to 32 scopes, 32 domains, 32 logical clocks, 64 clock advances, 32 workflows and 128 interactions. Domain retention preserves pinned / referenced records and supports up to 4096 records per domain.
- **Information Runtime v1** supports up to 32 sources, 16 views, 16 bounded graphs, depth up to 4 and 256 graph edges per graph projection. Supported semantics include `truth`, `belief`, `thread`, `open_loop`, `memory` and Timeline `narrative`.
- Belief projection already validates explicit epistemic statuses and channels, including known / believed / suspected / disputed and witnessed / direct_message / told_by / public_broadcast / surveillance / rumor / inference.
- **Task Runtime v1** supports `turn_blocking`, `interactive`, `background` and `maintenance` execution classes; result authority distinguishes advisory proposals, turn context, presentation, world-outcome proposals and declared app commands.
- Package Turn supports `authority-first` and `narrative-outcome` policies. In authority-first mode narration cannot write semantic outcomes.
- TurnEnvelope and MessageProjection already separate canonical narrative text, inert bounded presentation blocks, diagnostics and semantic outcome proposals.
- Current Task rules intentionally forbid `queuePolicy=latest` for authority-producing Tasks. Any Round 6.7 supersession design must therefore supersede pending decision requests before authority-producing task acceptance rather than superseding confirmed authority work.
- Native Session publication is immutable-revision based; retries fork from committed history rather than mutating accepted outcomes.
- Current low-level Session Core can atomically publish multiple state namespaces in one revision, but Round 9 must still verify whether the Package-facing typed action seam can express every required multi-domain gameplay transaction without Core changes.

### Confirmed design-pressure point

Information `actor` Views are statically bound to concrete `actorId` values and the whole Information Runtime allows at most 16 Views.

The approved content target contains more persistent actors than can each receive a dedicated static private Context View once Narrator / player / task views are also counted.

Round 9 must therefore resolve actor-private model context through one of:

- a smaller explicitly modeled actor-AI subset;
- a Package-safe architecture that does not require one static View per persistent NPC;
- or a genuine Core extension for dynamically actor-bound perspective projection.

Do not fall back to giving a shared task all actors' private Beliefs / Memories.

### Current gap policy

A requirement is a **Core gap** only when the approved design cannot be represented safely through current Package Data, Lifecycle, Information, Task, Continuity, Message / Turn or Native Frontend contracts.

Complexity or inconvenience alone is not a platform gap.
