# Active checkpoint: Atria Model / Prompt / Runtime Native Refactor — P1 complete, ready for P2

## Status

Atria Native Content & Session N0–N10 and Native Authoring Platform / Product Frontend A0–A9 remain frozen semantic foundations.

- Repository: `ZZZdragondYNGPHX/Atria`
- main baseline: `2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`
- implementation branch: `refactor/atria-model-prompt-settings`
- P0 validated HEAD: `472e1a9f0759a460d845a2e6c618983c35e18654`
- P1 validated HEAD: `802a68654f53015800e141fd052f1a006df149e0`
- P1 workflow: Model Prompt Runtime P1 Checks #6
- P1 run: `35836303381`
- P0 workflow on same HEAD: Model Prompt Runtime P0 Checks #17
- P0 run: `35836303445`
- next phase: **P2 — Generation Core & Route Resolution**
- P2–P8 have not been implemented.
- Do not create a new branch and do not merge main.

## P1 delivered

- generic versioned JSON resource handler on existing Native storage;
- `core.prompt-module`, `core.prompt-program`, `core.generation-profile`;
- immutable exact revision identities;
- A2 Resource Registry + derived-readonly Resource Graph integration;
- NativeLibraryService list/get exact;
- A1/A2 Attach/Fork/Update;
- exact Package dependency closure with recursive Prompt Program dependencies;
- missing exact dependency fail closed;
- Package build vendoring to exact PackageVersion refs;
- player Connection / Model / Runtime Route persistence;
- `secretRef`-only Connection persistence;
- project/library/package origin + provenance;
- P1 architecture guard + CI.

## P1 commits

- `a2c2fee0` — add P1 Native resource persistence foundation
- `bff67534` — integrate P1 resources with A2 authoring authority
- `1822358d` — close P1 model/prompt Package dependencies
- `577eeedc` — preserve frozen P0 Package metadata contract
- `84d3fe50` — add P1 resource/package integration tests
- `fd38b8ec` — add P1 CI workflow
- `342452b4` — align persistence test fixture with normalized Model contract
- `ce900854` — focused lint fix
- `61f0b1aa` — prove project/library/package origin + provenance
- `0ff8fcb4` — add P1 architecture guard
- `802a6865` — enforce P1 architecture guard in CI

## P1 validation

Actually executed on `802a68654f53015800e141fd052f1a006df149e0`:

- 9 suites / 37 tests passed;
- P0 architecture guard: success;
- P1 architecture guard: success;
- P1 guard syntax: success;
- A1 guard: success;
- A2 guard: success;
- A7 guard: success;
- A8 guard: success;
- focused ESLint: success;
- P0 Checks #17: success.

Not run:

- full Node regression;
- frontend build;
- browser E2E;
- Android;
- Docker;
- real-host model request.

## Key decisions

- no PromptStore / GenerationStore / second Library;
- no second Resource Graph;
- no WorldRepo / KnowledgeRepo / AssetStore rewrite;
- Resource Graph stays derived-readonly;
- Studio writes stay under A1 Workspace/ChangeSet;
- Library exact refs never follow latest;
- Package gets vendored exact model/prompt resources and no private Connection/Model/Route/Secret;
- P0 Package contract compatibility is preserved when older package fixtures omit the new `resources` field;
- P2 must consume these P1 authorities rather than add parallel persistence.

## P2 objective

Implement Generation Core + Route Resolver only. Do not implement the Prompt Compiler, first-party cutover, or Runtime UI.

Read `planning/atria-model-prompt-settings/NEXT.md` for the P2 execution checklist.
