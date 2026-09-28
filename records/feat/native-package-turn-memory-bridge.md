# Native Package Turn → Atria Memory Bridge (G3)

Updated: 2026-09-28.  
Status: **completed, validated, and integrated into `main`**.

## Scope

This task closes **G3 — Package Turn → Atria Memory Bridge** only. It does not begin Native Heavy-Frontend Reference Package Phase 4 and does not add a Package-side workaround.

Baseline:

- repository: `ZZZdragondYNGPHX/Atria`;
- baseline `main`: `35bc587bb78fd6a7c0fc4fc418d99c7315f5af8b`;
- work branch: `feat/native-package-turn-memory-bridge`;
- integrated `main` tree: `698aec1ee5d366ed4e36b5b696c432793dad5e17`;
- Package branch remains untouched at `package/native-heavy-frontend-reference@489a42ce75bdca801d9a9de9b6233bd75a571ace`.

## Problem closed

A Package declaring `taskRuntime.turn` used:

`Play → /api/native/generation/turn → NativeGenerationHost.executeTurn()/prepareTurn()`.

That path compiled Native Context but did not obtain Atria Memory evidence. Existing Memory recall/ingestion lived on the ordinary Game LLM path, so `InformationRuntime.views[].memory = true` was only an authorization gate for Package Turns.

G3 reuses the existing Atria Memory Graph and Native Memory lifecycle. It does not introduce a Package Memory authority.

## Implementation

### Recall before Package Narrator context

`runNativePlayGeneration()` now performs Host-owned Package Turn Memory recall before dispatching the Turn. The bridge:

- first resolves the applicable Native Information View;
- skips Memory entirely when the view does not grant `memory: true`;
- calls the existing `memory-graph` capability API and its existing recall path;
- supplies the current committed Native snapshot to the existing Memory state-provider surface;
- carries only source-backed Memory records whose Timeline message IDs are visible in the authorized Information Perspective;
- degrades to no Memory evidence when Memory is unavailable;
- propagates cancellation instead of silently falling back.

The Package receives neither the Memory API nor arbitrary Memory selection authority.

### Host and compiler admission

The Turn request carries Host-created Memory evidence. `NativeGenerationHost` independently validates it before generation:

- bounded evidence count/content;
- exact current Timeline message IDs;
- exact current Branch and Revision;
- server-side Information View Memory authorization.

The existing Native Context compiler remains the final authority. It continues to enforce:

- `memory: true/false`;
- exact Perspective-visible Timeline provenance;
- current Branch/Revision;
- Memory lane and total Context budgets;
- existing current-state conflict handling.

Hidden, stale, foreign-Branch, unproven, or unauthorized Memory fails closed.

### Existing Memory provenance

The existing hybrid Memory retrieval now exposes each selected document with its own source message IDs rather than allowing aggregate recall text to inherit unrelated provenance. Package Turn admission therefore cannot use a valid Timeline reference to legitimize a different Memory record.

### Finalized Turn ingestion

After a Package Turn has committed, `NativeSessionRuntime.acceptOperationSnapshot(..., { turn: true })` emits the existing Native `TIMELINE_APPENDED` / `REVISION_COMMITTED` lifecycle boundary for newly committed message IDs.

The existing Memory listener consumes that event. It now receives the current committed `nativeSnapshot`, allowing the already-existing Native Memory state-provider path to observe committed `atri_*` SessionState, including authoritative App/World state, while the canonical assistant narrative remains Timeline-backed source evidence.

Exact replay with no new Timeline message emits no second append event, so it does not duplicate ingestion.

## Preserved boundaries

- No Curator, Story Compression, Day Compression, Package Memory Store, second database, second Timeline, second scheduler, or Package-specific Memory Task.
- Memory configuration, Native retrieval resources, model/provider route, Secret resolution, cancellation and budgets remain Host/player authority.
- G1 narrative-outcome → App Command atomic semantics are unchanged.
- G2 background Task → App Command bridge is unchanged.
- Package source/architecture was not modified.
- No compatibility or fallback Memory store was added.

## Validation

Authoritative touched-area run: GitHub Actions **`36376721567`**, tested HEAD **`1f59ff7957a080f76d802e1d758054d1c2438f2c`**.

Result:

- syntax checks: PASS;
- touched-file ESLint: PASS;
- 5 targeted suites: PASS;
- **134 / 134 tests: PASS**.

Suites:

- `native/package-turn-memory-bridge-g3.test.js`;
- `native/turn-app-outcome-g1.test.js`;
- `native/background-task-app-bridge-g2.test.js`;
- `memory-graph/hybrid-retrieval.test.js`;
- `memory-graph/source-lifecycle.test.js`.

G3 coverage proves:

- `memory:true` obtains fake/in-memory Atria Memory recall;
- `memory:false` performs no recall and rejects submitted evidence server-side;
- hidden Timeline, stale Revision and foreign Branch evidence do not enter Context;
- finalized Package Turn crosses the existing Timeline ingestion boundary;
- exact replay does not duplicate ingestion;
- G1/G2 regressions remain green.

MySQL/Postgres were explicitly disabled for this touched-area run; FS/SQLite/local fixtures were used. No paid model, full-repository test/lint, Android, Docker or Package Phase 4 work was run.

## Next step

Return to the existing `package/native-heavy-frontend-reference` branch. Merge the new `main` into that long-lived Package branch, then complete **Phase 3 Memory validation** through the live Package Turn path. Do not begin Phase 4 until that Package-side validation passes and Phase 3 is formally closed.
