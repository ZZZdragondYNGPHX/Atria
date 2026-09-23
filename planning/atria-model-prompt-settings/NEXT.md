# NEXT：P2 — Generation Core & Route Resolution

## Current checkpoint

- Repository: `ZZZdragondYNGPHX/Atria`
- work branch: `refactor/atria-model-prompt-settings`
- main baseline: `2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`
- P1 validated HEAD: `802a68654f53015800e141fd052f1a006df149e0`
- P1 workflow: Model Prompt Runtime P1 Checks #6
- P1 run: `35836303381`
- P0 workflow on same HEAD: Model Prompt Runtime P0 Checks #17
- P0 run: `35836303445`
- P0/P1 complete. P2–P8 remain.
- Do not create a new branch and do not merge main.

## Execute only P2

**P2 — Generation Core & Route Resolution**

Build the host-independent Native Generation Core on top of frozen P0 contracts and the P1 persistence/resource foundation.

### Required

- implement `GenerationService.execute()`;
- implement common Route Resolver;
- deterministic Connection / Model / Generation / Prompt exact resolution;
- capability supported / unsupported / unknown evaluation with provenance;
- required unsupported => fail closed;
- required unknown => fail closed unless explicit user override permits it;
- fallback must re-resolve a complete Runtime Route;
- fallback only for eligible provider/transport failures;
- cancellation must not continue fallback;
- immutable request-local resolved configuration;
- Secret Port dereferences only at the send boundary;
- secret values never enter Effective Request Snapshot / diagnostics / Package / Project / Library;
- Provider Port execution path;
- transitional sender adapters may use mature ST senders only behind the Port boundary;
- OpenAI-compatible and raw-text fixtures;
- concurrent requests/routes must not leak configuration between each other.

### Preserve

- `Atria Core ← Host Port ← SillyTavern Adapter`;
- P1 Registry / Library / Resource Graph / persistence authority;
- A1 Workspace/ChangeSet;
- A8 human Review/Commit boundary;
- exact immutable Prompt/Generation refs;
- A6/A8 replacement gates unchanged during P2.

### Do not do

- do not implement Prompt Compiler — P3;
- do not cut first-party generation callers — P4;
- do not change Runtime product UI — P5;
- do not create a second Connection/Model/Generation/Prompt store;
- do not use PresetManager / PromptManager / active Connection Manager / `oai_settings` / `power_user` as hidden Native request authority;
- do not remove `generateTask` yet;
- do not redo P0/P1.

### Required verification

- route resolution is deterministic;
- A→B fallback result equals direct B resolution;
- exact Generation/Prompt refs never chase latest;
- required capability failure is explicit;
- unknown capability override behavior is explicit;
- cancellation stops fallback;
- ineligible application/config errors do not fallback;
- concurrent role/request isolation;
- secret redaction;
- OpenAI-compatible fixture;
- raw-text fixture;
- P0 architecture guard;
- P1 architecture guard;
- relevant frozen A1/A2/A7/A8 guards;
- focused ESLint.

Android / Docker remain opt-in.

After P2 passes: push branch, update permanent docs + handoff, record HEAD/commits/tests/guards/lint, stop, and produce the P3 handoff prompt.
