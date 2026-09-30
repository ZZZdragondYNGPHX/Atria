# Authority Transaction — Implementation Record

- Task ID: feat/authority-transaction
- Primary Workspace: main
- Branch: feat/authority-transaction
- Plan: plans/feat/authority-transaction.md
- Design authority: plans/package/original-occult-western-fantasy-game/technical-design.md, Rounds 9.5–9.8

## C1 — Contract and declarative surface

Status: **C1 complete; stopped at the stage boundary; C2 not started** (2026-09-30).

- Fetched all remotes before work. Actual origin/main: c936b0aa4c42cf5711f40ae4a00f5fc3432813dc; origin/docs: 523cb7190f23622e0b850823972a555cdfcd8197.
- Historical audit SHA happens to equal current remote main; no rollback performed.
- Task branch did not exist; created from actual origin/main. Source and docs worktrees were clean. Docs fast-forwarded to origin/docs.
- Start HEAD: c936b0aa4c42cf5711f40ae4a00f5fc3432813dc.
- End/Tested HEAD: 6b0402d6ce1579457f46e47968bd6a862283f176 (pushed).
- Tested source tree: 3f843cfd2e312e7dbe7f24392db29c1c164e0281. The tree was staged before final validation and verified unchanged before commit.
- Scope: independent capability/runtime contract and strict bounded schemaVersion 3 transaction declarations only; preserve v1/v2 and legacy packages.
- C2 execution/private candidates, C3 Turn/Frontend integration, C4 merge, and Package content are not started.

Validation: local matrix, four-engine remote CI and lint passed; see validation evidence below.

## Other task recovery

The prior live HANDOFF at docs@523cb7190f23622e0b850823972a555cdfcd8197 belongs to plugin/atria-mcp-capability-expansion, not this task. Its permanent recovery authority remains records/plugin/atria-mcp-capability-expansion.md; acceptance remains open, plugin fbdc372ee05556394d244ab84dac8457954aa7f9 and product feat/mcp-development-authority b2709b5af2664b05f6bd32a05a06097a3e98bd6f remain unchanged. Replacing the single live HANDOFF for the user-requested Core task does not complete or integrate that task.

## C1 implementation decisions (2026-09-30)

- Separate Experience capability authority-transaction@1; no action@2 changes or global Experience schema bump. Presence, including optional capability metadata, requires authorityRuntime, and the converse is enforced.
- Staging safety: registered version [1], Host supported versions [] in C1. Required Packages may be stored/inspected, but runtime activation fails closed; optional metadata does not execute transactions. Later execution/Turn stages must explicitly enable support after their gates.
- authorityRuntime v1 has intentObservation {viewIds, maxItems, maxBytes}, policy {maxReadGrants, maxWorldEvents, maxAppCommands, maxEffects, maxReceiptBytes}, optional canonicalClockId. Observation references existing player/display Views only, without Context, Knowledge or Memory exposure.
- Game Logic v3 preserves commands/reducers/rules/interpretations and optional v2 mutation shorthand, plus explicit transactions and derivedPublications arrays. Unversioned/v1 and v2 retain their legacy compiler output; no default transaction authority is injected.
- Each Transaction declares id/verb/inputSchema/intent/reads/validators/resolution/effects/derivedPublications/receipt. IDs, effect kinds, domain/command/event/clock/workflow references and field paths are closed statically against the pinned contract/logic.
- Input/record/payload/receipt schemas reuse compileDataSchema. Expressions reuse the non-executable Formula AST, limited to fixed scalar paths, typed operators and existing deterministic numeric helpers. World/data/selectors/eval/JS/RNG calls and dynamic authority target selection are rejected. Evaluated values still require exact destination-schema and byte validation in C2; static type validation is not a substitute for runtime bounds.
- Read grants select one record in one declared Lifecycle domain and explicit fields; transaction record selectors may reference validated input; derived selectors are fixed. There is no bulk unbounded query, namespace grant or arbitrary read path.
- Resolution is deterministic or one bounded Fortune die (2–1000 sides), up to 16 ordered cases plus a fixed fallback; no RNG execution/seed is implemented here. Receipt projection allows explicit args and public resolution fields only, never private read roots or whole-record references.
- Derived publications are one bounded, acyclic layer with statically declared dependency reads and typed App Command outputs; one publication owns each output domain. Transactions cannot directly write those outputs and must name affected publications. Aggregate budgets reserve the entire hook, including when a Transaction selects none, so background publication cannot evade limits. This is intentionally stricter than a per-publication budget.
- Limits: 64 Transactions; 16 publications; 16 total read grants including derived work; 16 fields/read; 16 validators; 16 Resolution cases; 16 World Events; 24 App Commands; one canonical clock advance; one workflow transition; 32 total effects including derived work; 32 KiB receipt; 64 observation items / 16 KiB; 1 MiB declaration; formulas <=2048 characters, 256 AST nodes, bounded nesting.
- C2 must enforce ceilings on actual expanded World-rule/Lifecycle/workflow/clock-triggered work as well as declarations, prepare privately, validate computed values/UTF-8 sizes, and perform no partial publication. C1 intentionally does not evaluate these effects.
- Reused Lifecycle's strict JSON provenance/complexity helper by moving its implementation to native-values; the Lifecycle wrapper keeps its original limits and errors. No new persistence authority or generic mutation endpoint.
- Build/install and browser/server pinned logic compilers validate/retain v3 rather than lowering away its transactions. No frontend invocation or runtime publication handler was added.

### Validation progress

Initial fixtures revealed existing Task normalization and exact-resource requirements; the new platform-neutral fixture was corrected to use no unrelated Model Task resources. First stabilized targeted pass: 4 suites / 262 tests. That intermediate checkpoint preceded the additional budget/provenance tests and adjacent regression/lint passes recorded below.

## C1 final validation evidence

- Local final matrix: **19 suites / 839 tests passed** on the tested tree above. Existing harness flags ATRIA_DISABLE_MYSQL_TESTS=1 and ATRIA_DISABLE_POSTGRES_TESTS=1 explicitly excluded unavailable database services; parameterized runtime suites ran FS and SQLite.
- New coverage: capability/runtime accepted/rejected cases, immutable data-only declarations, required-runtime negotiation, schema fields/reference closure, typed effects, forbidden patch/namespace/script/dynamic targets, private-read disclosure rejection, deterministic/Fortune declaration bounds, derived single-owner/acyclic/aggregate budgets, v1/v2 compatibility and actual Package build/install/reopen/browser-loader/server-loader behavior.
- Adjacent coverage: Native contract/authoring, existing resources and Package build/install, Lifecycle contract/runtime, G1 Turn App outcome, G2 background App bridge, Information, action@2, Task/runtime lifecycle and capability retirement; Game Logic compiler/loader/rule integration.
- Exact local test paths:
  - native/authority-contract-c1.test.js; native/authority-resources-c1.test.js; game-runtime/transactions.test.js
  - game-runtime/declarative.test.js; native/authoring-contracts.test.js; native/contracts.test.js
  - native/experience-resources.test.js; native/package-build-install.test.js
  - native/lifecycle-contract-p4.test.js; native/lifecycle-runtime-p4.test.js
  - native/turn-app-outcome-g1.test.js; native/background-task-app-bridge-g2.test.js
  - native/information-runtime-p6.test.js; native/experience-actions.test.js
  - native/task-runtime-p3.test.js; native/runtime-lifecycle.test.js
  - native/capability-retirement.test.js; game-runtime/logic-package.test.js; game-runtime/logic-rules-integration.test.js
- Invocation: from tests/, node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand --verbose=false --runTestsByPath followed by the paths above.
- ESLint passed for all 14 touched/new JavaScript files; git diff --check and staged diff check passed; CI workflow YAML parsed successfully.
- Earlier broad attempt before explicit database exclusions: 11 suites, 494 passed / 200 failed; the failures were connection refusals at the existing MySQL/PostgreSQL harness endpoints, not accepted as passes. No local MySQL/PostgreSQL pass is claimed; their successful coverage was subsequently obtained in remote CI.
- Remote CI: Authority Transaction Contracts, run 36678740285, exact HEAD 6b0402d6ce1579457f46e47968bd6a862283f176. URL: https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36678740285. **SUCCESS: 16 suites / 1030 tests passed**, with FS, SQLite, MySQL and PostgreSQL, plus Authority source lint. Remote tested HEAD equals End/Tested HEAD above.
- No full repository suite, UI/browser inspection, provider call, Android build or device validation was performed or claimed.

## Stage boundary / next checkpoint

C2 has not started. No transaction engine, private candidate execution, multi-domain publication, derived publication runtime, Narrator finalization, Frontend invocation or Package game content was implemented. main remains c936b0aa4c42cf5711f40ae4a00f5fc3432813dc; the task branch is retained, not merged/deleted. Package P1 remains blocked through C4.

Next stage is **C2 — Private candidate authority engine**, reusing existing World reducers, prepareLifecycle(), clock checks, deterministic RNG and Session authority. Implement bounded player-safe observation, private reads, validation/resolution, stable anchored transaction/RNG identity, private World + multi-domain Lifecycle + clock composition, derived publication hook and safe receipt preparation. Prove zero partial publication and private-read non-disclosure with direct candidate tests. Do not start C3 Turn/Frontend integration or enable Host capability support before its executable behavior is ready.

At C2 exit: commit/push the same task branch, append C2 to this Record, refresh the single HANDOFF with tested HEAD and C3 prompt, then stop. The C2 copyable resume prompt is in the live HANDOFF, not in a second live handoff file.
