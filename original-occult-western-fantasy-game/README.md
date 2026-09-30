# Original Occult Western Fantasy — P1 Foundation

Task: `package/original-occult-western-fantasy-game`

This is an installable **P1 skeleton**, not a playable campaign or a P2 gameplay prototype. The long-lived `package` branch stays independent from product `main`.

## Build, validate, preview

Run from this directory with Node and a separate current Atria main checkout with its dependencies installed:

```text
node tools/package.mjs validate --core <main-checkout>
node tools/package.mjs build --core <main-checkout>
node tools/package.mjs preview --core <main-checkout>
```

Build writes `build/0.1.0-p1.atria` (ignored). Use `--out <new-file.atria>` for another output. Writes are exclusive: existing files, including historical releases, are never overwritten. Release publication is P9; `releases/` is reserved and retained.

Validation installs the actual archive in a temporary FS repository, resolves the native runtime, starts a Session, applies Ready, checks projection isolation, and executes a diagnostic Turn through a local synthetic HTTP provider. Temporary storage is removed afterwards. No user configuration, model credentials or product source is modified. The external main checkout supplies its native test harness and generation fixtures; these are not copied into the Package.

Preview prints **player-safe Information projections as JSON**, not a visual UI. The EntryPoint uses supported `experience.mode = text`. No P8 frontend assets are included.

## Source ownership

- `manifest.json`: stable Package/Version/World/EntryPoint identities and initial timeline.
- `runtime/capabilities.json`: all declared capabilities are required, including **authority-transaction@1**. Install requires an explicit generation permission grant.
- `runtime/lifecycle.json`: two scopes; eleven World authority domains, three Session authority domains and six derived Session projection domains. Empty domains have bounded placeholder schemas and no write commands; P2/P3 replace them with their real contracts before use.
- `runtime/information.json`: seven safe Sources, five Views, two graphs, no per-NPC Views. Hidden authority is never a direct Source.
- `runtime/tasks.json` and `runtime/model-resources.json`: four Tasks with exact packaged Prompt/Generation references. Narrator uses the actual Host `{stages}` input / string output protocol; advisory Tasks have no Apply Command. Agenda is FIFO, explicit-input-only and can record only `defer` intent in existing agendas authority. No scheduler invokes it in P1.
- `runtime/authority.json`: canonical minute clock, bounded safe observation and Core ceilings.
- `runtime/logic.json`: schemaVersion 3; only `foundation.check`, a no-gameplay deterministic diagnostic. It is not `observe`, does not advance time or publish World Events. Resolver selection and Session preparation bind its fixed ID; a typed frontend binding is deferred with P2/P8.
- `data/`: seven small hash-pinned Package Data resources. Six definition/Case/Canon families are empty, not fabricated game content. `seed.bootstrap` alone supplies startup constants. Build compiles these into the Ready command; no runtime data import workaround is used.

Ready creates one synthetic entity record. Two statically owned derived publications project only its explicitly safe scene/status fields. The private sentinel is test data and never enters player/Narrator context. Epistemic, Memory and graph read models remain empty until their authorities and disclosure rules are implemented. There is no Outcome, Resolution or duplicate Event Journal domain.

All automatic Memory is off. Narrator/Reflection Knowledge is off. Claim Advisor Knowledge is enabled only as a future acquired-Knowledge channel; this skeleton includes **zero** Knowledge resources/bindings, so nothing is exposed.

## Boundaries and next stage

P2 implements approved verbs, Resolution/uncertainty, typed invocation parity and substantive authority schemas using a small synthetic world. P1 does not implement those systems, authored openings, NPC strategies, save-container recovery or frontend design.

Core limits remain enforced: static targets; declared fields/references; computed-value schemas; UTF-8 byte checks; aggregate/expanded work ceilings; Ready Barrier and single final Session CAS. No parallel persistence or Package workaround exists.

The local smoke proves **in-process** selection retry with the same anchor and no RNG in this diagnostic. It does not prove or assume a persistent uncommitted selection journal, process-crash recovery, cross-process replay or save-container restoration. P0 evidence stays in its Core Record.

Permanent implementation evidence: `docs:records/package/original-occult-western-fantasy-game.md`.
