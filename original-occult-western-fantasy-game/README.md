# Original Occult Western Fantasy — P4 Content Foundation

Task: `package/original-occult-western-fantasy-game`. Independent long-lived `package` workspace. P4 adds the reusable launch-world foundation while keeping the **two-day synthetic runtime fixture**. This is not a playable campaign, P5 opening, P8 interface or release.

## Build / validate / preview

Use Node and an independent current Atria main checkout with dependencies:

```text
node tools/package.mjs validate --core <main-checkout>
node tools/package.mjs build --core <main-checkout>
node tools/package.mjs preview --core <main-checkout>
```

Build exclusively creates ignored `build/0.4.0-p4.atria`. If it already exists, use `--out <new-file.atria>`; never overwrite builds/releases. Final release production remains P9. Product code is imported for testing, never copied into this Package.

Validation covers actual FS archive installation, Session/Ready, private preparations, all nine installed fixed typed actions, local synthetic HTTP resolver/Narrator/Agenda execution and actual save-container export/import into a fresh FS store. It tests two-day deterministic catch-up, obligations, conditions, institution phases, a bounded background decision, generated Entity promotion, stale cancellation and foreground-to-background dispatch. No hosted model, manual browser/device or cross-process uncommitted selection recovery is claimed.

Preview prints safe Information JSON, not a screenshot. The nine-button native fixture is a typed-contract test entrypoint, not P8 design or final UX.

## Ownership

- `manifest.json`: version/EntryPoint/World pins and synthetic initial timeline.
- `runtime/capabilities.json`: required **authority-transaction@1** and **world-simulation@1**, plus the existing capabilities. Generation permission is required. Older main without the formal simulation support must reject activation.
- `runtime/lifecycle.json`: existing World/Session domains, canonical minute clock, bounded Ready seeding, two-day Agenda/obligation/record/condition declarations. Unused later-stage domains retain bounded placeholders.
- `runtime/logic.json`: nine player transactions, diagnostic foundation transaction, two non-player simulation transactions and one unified safe-publication layer. No Package executable scheduler, Outcome/Resolution domain or duplicate journal.
- `runtime/simulation.json`: formal Core scheduling declarations with static private grants, due times, priority, relevance, one background admission per batch and a bounded input-only Agenda context.
- `runtime/information.json`: seven Sources, five Views, two graphs. Structured status exposes known risk/condition/relation values without twelve duplicated publication branches. Hypotheses remain epistemic, not confirming Truth.
- `runtime/tasks.json` / `model-resources.json`: four core Tasks. Agenda proposes `defer`/`file_report` plus a bounded delegate name; deterministic authority accepts any real-world action. Reflection/Claim Advisor remain advisory.
- `frontend/`: fixed typed bindings; only the wait input bound changes to 1–2880 minutes. No visual/UI work.
- `data/`: thirty-one hash-pinned resources with 222 structured P4 assets; private Canon and public reading are separate. No campaign scenes or eagerly instantiated city.
- `tools/`: build and actual integration checks. `simulation-contract-check.mjs` diagnoses legacy Lifecycle limitations; it is not the acceptance test for the new capability.

See `runtime/CONTENT.md`, `runtime/INTERACTION.md` and `runtime/SIMULATION.md`.

P4 adds closed authoring schemas and reference, size, UTF-8, privacy and lazy-state checks. `node tools/content-check.mjs` runs the fast content gate; build/validate/preview include it. Six public Knowledge entries are installed but unbound in the fixture. Definition loading by Core is not lazy archive I/O; live-state materialization remains lazy. Permanent history belongs in the single Package Record on docs.

## Boundaries

Player authority and narration still finalize together. Background intent plus its validated filing, Entity promotion and safe projections use another atomic Session CAS after foreground finalization. Provider failure commits no speculative action. Same-process selection pinning, same-anchor RNG, committed invocation idempotency and actual save-container restoration are distinct properties.

The synthetic schedule defines two daily cycles. Crossing the third daily boundary fails closed before publication rather than freezing obligations while time continues. This is not a generalized campaign economy, clinic, dynamic NPC simulator or unrestricted downtime system; P4+ must author additional valid states/jobs within the unchanged limits.
