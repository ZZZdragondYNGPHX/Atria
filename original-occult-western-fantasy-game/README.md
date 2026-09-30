# Original Occult Western Fantasy — P2 Interaction Fixture

Task: `package/original-occult-western-fantasy-game`. Independent long-lived `package` workspace. This is a small synthetic runtime fixture, **not a campaign or a release**.

## Build / validate / preview

With Node and an independent current Atria main checkout (dependencies installed):

```text
node tools/package.mjs validate --core <main-checkout>
node tools/package.mjs build --core <main-checkout>
node tools/package.mjs preview --core <main-checkout>
```

Build creates ignored `build/0.2.0-p2.atria` exclusively. Use `--out <new-file.atria>` for a distinct output. Existing builds/releases are never overwritten. Final release production remains P9. No product source is copied into this Package.

Validation uses the real compiler, temporary FS installation, Session/Ready, Information projections, private preparations, and a local synthetic HTTP resolver/Narrator. It also invokes all nine installed fixed Native Frontend bindings. Temporary storage is cleaned. No credentials, hosted model, real UI/device, save-container restoration or cross-process uncommitted selection journal is assumed.

Preview prints safe Information JSON, not a browser screenshot. The native full Experience has a bare nine-button functional fixture solely to exercise typed transactions; P8 visual/UI design has not begun. Bindings accept closed typed input; example buttons use fixed sample text, not a final player editor.

## Ownership

- `manifest.json`: version pin, EntryPoint, World/actor identity and synthetic initial timeline.
- `runtime/capabilities.json`: required capabilities including **authority-transaction@1**. Installation requires generation permission.
- `runtime/lifecycle.json`: existing World/Session authorities, one canonical minute clock, bounded Ready initialization. Unused P3+ domains retain P1 placeholder schemas.
- `runtime/logic.json`: nine gameplay transactions; non-exposed foundation diagnostic; guarded effects and single-layer safe publications. No executable Package gameplay runtime, Outcome/Resolution domain, generic patch or duplicate journal.
- `runtime/information.json`: seven Sources, five Views, two graphs, no actor-private direct subscription. Hypotheses stay suspected/inference, testimony suspected/told_by, Matters open. Graph nodes identify hypotheses, never present their content as Truth.
- `runtime/tasks.json` / `model-resources.json`: exact four Task contracts. Narrator consumes Host receipt/projections. Reflection/Claim Advisor remain advisory. Agenda is still defer-only and has no autonomous scheduler.
- `frontend/`: fixed transaction bindings with exact input schemas and minimal native source; compiled by the existing Core frontend compiler.
- `data/`: seven hash-pinned resources; only synthetic bootstrap has content. No authored campaign expansion.
- `tools/`: build/validation and integration tests. The older conditional-Fortune probe is historical contract evidence, not the P2 acceptance suite.

See `runtime/INTERACTION.md` for the Resolution Frame, risk table, static slots and effects. Permanent evidence belongs in the single Package Record on docs.

## Retry and stage boundary

Mechanics are prepared privately before Narrator; successful narration and authority publish in one Session CAS. Same-anchor RNG is deterministic. In-process selection pinning, committed invocation idempotency and actual save restoration are different properties. Branch Retry is a new branch, not prose-only regeneration.

P3 owns obligations/deadlines, world-advance scheduling, institution/Agenda simulation and event-driven fast-forward. P2 wait advances only the canonical clock by 1–60 minutes; it is not a finished downtime or simulation system. No P3/P8 implementation is included.
