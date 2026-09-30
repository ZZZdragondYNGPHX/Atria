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
