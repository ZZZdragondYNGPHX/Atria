# Active checkpoint: Atria Model / Prompt / Runtime Native Refactor — P0 complete, ready for P1

## Status

Atria Native Content & Session N0–N10 and Native Authoring Platform / Product Frontend A0–A9 remain frozen semantic foundations.

Current staged refactor:

**Atria Model / Prompt / Runtime Native Refactor**

P0 — Baseline / Contracts / Guard Evolution is complete and validated.

- Repository: `ZZZdragondYNGPHX/Atria`
- main baseline: `2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`
- implementation branch: `refactor/atria-model-prompt-settings`
- P0 validated HEAD: `472e1a9f0759a460d845a2e6c618983c35e18654`
- workflow: Model Prompt Runtime P0 Checks #6
- run: `35832249672`
- next phase: **P1 — Native Resource & Persistence Foundation**
- P1–P8 have not been implemented.
- Do not merge main and do not create a new branch.

## P0 delivered

P0 froze code contracts for:

1. Connection Profile
2. Model Profile
3. Generation Profile
4. Prompt Module
5. Prompt Program
6. Runtime Route

Runtime artifacts:

- RequestContextPlan
- Prompt IR
- EffectiveRequestSnapshot

Capability contract:

- supported
- unsupported
- unknown
- provenance

Ports:

- Generation Service
- Route Resolver
- Provider Port
- Secret Port
- Context Provider

Package author intent:

- `runtime.modelPrompt`
- role capability requirements
- exact Prompt Program refs
- exact Generation Profile refs
- no player-private Connection / Model / concrete Route / secret value

New Core boundary:

- `src/native/model-prompt-runtime/contracts.js`
- `src/native/model-prompt-runtime/ports.js`

Architecture guard:

- `scripts/check-p0-model-prompt-runtime-architecture.mjs`
- rejects direct ST globals / DOM / PresetManager / PromptManager / `Atria.getContext()` / `generateTask` / direct dispatch sender / browser persistence / `package.presets` authority
- includes violation-detection self-test.

## P0 validation

Actually executed on `472e1a9f0759a460d845a2e6c618983c35e18654`:

- 5 suites / 63 tests passed
- P0 architecture residual guard: success
- P0 guard self-test: success
- P0 guard syntax: success
- A0–A9 frozen guards: success
- N9 guard: success
- N10 guard: success
- focused ESLint: success

Not executed in P0:

- full Node regression
- frontend build
- browser E2E
- Android
- Docker
- real-host model request

Do not report those as passed.

## Frozen guard evolution matrix

- A6 Advanced Connection compatibility editor:
  - transitional seam
  - preserve until P5 Native Connections UI is implemented + validated
- A6 standalone Runtime Capabilities route:
  - transitional seam
  - preserve until P5 capabilities are integrated into Models / Routes / Diagnostics and navigation is validated
- A8 Studio Agent `generateTask`:
  - transitional seam
  - preserve until P4 Generation Service cutover proves tool projection + human Review/Commit invariants
- N0 Native ID family list:
  - extended in P0 for the six new opaque identity families
- N10 legacy identity/storage invariant:
  - preserved
  - only `src/native/authoring-contracts.js` was added to the existing contract-validator literal exception so rejected legacy key names do not count as runtime dependencies

No frozen guard was wholesale disabled.

## P1 immediate objective

Build the persistence/resource foundation only:

- generic versioned JSON resource handler for Prompt Module / Prompt Program / Generation Profile
- A2 Registry / Resource Graph integration
- Library exact list/get
- Attach/Fork/Update
- Package exact dependency closure
- Connection / Model / Runtime Route player persistence
- secretRef-only persistence
- origin/provenance

Do not implement P2 Generation Service, P3 Prompt Compiler, P4 runtime cutover, or P5 UI in the P1 checkpoint.

Before work, fetch the remote implementation branch and preserve any newer commits.
