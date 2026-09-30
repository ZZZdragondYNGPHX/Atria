# Authority Transaction — Implementation Record

- Task ID: feat/authority-transaction
- Primary Workspace: main
- Branch: feat/authority-transaction (merged into main; temporary branch removed)
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

## C1 stage boundary / next checkpoint (historical)

C2 has not started. No transaction engine, private candidate execution, multi-domain publication, derived publication runtime, Narrator finalization, Frontend invocation or Package game content was implemented. main remains c936b0aa4c42cf5711f40ae4a00f5fc3432813dc; the task branch is retained, not merged/deleted. Package P1 remains blocked through C4.

Next stage is **C2 — Private candidate authority engine**, reusing existing World reducers, prepareLifecycle(), clock checks, deterministic RNG and Session authority. Implement bounded player-safe observation, private reads, validation/resolution, stable anchored transaction/RNG identity, private World + multi-domain Lifecycle + clock composition, derived publication hook and safe receipt preparation. Prove zero partial publication and private-read non-disclosure with direct candidate tests. Do not start C3 Turn/Frontend integration or enable Host capability support before its executable behavior is ready.

At C2 exit: commit/push the same task branch, append C2 to this Record, refresh the single HANDOFF with tested HEAD and C3 prompt, then stop. The C2 copyable resume prompt is in the live HANDOFF, not in a second live handoff file.

## C2 — Private candidate authority engine

Status: **C2 complete; stopped at the formal stage boundary; C3 not started** (2026-09-30).

- Resumed from real remote task HEAD `6b0402d6ce1579457f46e47968bd6a862283f176`; source tree clean. Fetched all remotes; actual main remains `c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`, docs advanced to `e993bb60c11e13c644a036943bc76f1768ec29ae` and was fast-forwarded with no local changes. No reset or C1 redo.
- Scope: private observation/read/Resolution/effect/derived/receipt preparation only. No publication, Narrator, Frontend, capability support advertisement, Package content or C3 work.
- Reuse existing private World adapter, reducers/rules, deterministic RNG, Information projection and Lifecycle preparation; thread a shared bounded-work context through expansion rather than adding another authority.

### C2 implementation decisions

- Internal server-only module: `src/native/authority-transaction.js` (repository-relative). Three entrypoints: `buildAuthorityObservation(base)`, `prepareAuthorityTransaction(base, installed, request)`, and `prepareAuthorityPublications(base, installed)`. They accept snapshots/pinned resources, never a repository, provider, scheduler or publication callback. No endpoint or Frontend handler was added.
- Reused `createTaskWorld()` / World reducers / Rules Engine, `prepareLifecycle()`, `projectInformation()`, `compileDataSchema()`, Formula AST and deterministic RNG. Optional internal budget callbacks propagate through nested Lifecycle World Commands and rule evaluation; legacy callers keep their existing default behavior.
- Request has closed `transactionId/input/anchor/playerMessageId/ordinal` fields. Anchor binds Session, PackageVersion, Branch and Revision; the selected player Message must be the last user Timeline entry. Package manifest and entrypoint must match the pinned Session. Lifecycle-bearing Transactions require its Ready Barrier; valid C1 World-only declarations still work without inventing a Lifecycle requirement.
- Stable identity is SHA-256 over a versioned authority anchor, entrypoint, player Message/active Variant, declared Transaction and bounded ordinal. The existing deterministic RNG uses this identity. Regenerated input/prose/provider timing is not part of the seed. Separate canonical `inputHash` is returned for C3 idempotency/conflict checks; C3 must pin the accepted selection and reject conflicting input rather than silently re-execute it.
- Observation uses only declared player/display Views, disables rollups, validates source authority state, shares a scan budget across Views, and returns an immutable envelope with an anchor and bounded safe items. Overflow items are deterministically omitted with `truncated`; even envelope/anchor bytes count. Too-small envelopes fail closed.
- Private grants select only explicit fields of one record in the declared active scope, with scope identity checks and pre-read scan accounting. Validators and Resolution run in an isolated Formula context; effects use static Package targets. Computed input/payload/App result/receipt values are validated against normalized exact schemas and strict finite JSON/UTF-8 bounds. Lower-level errors/cause/private values are not attached to the public preparation error.
- Direct World Events run through the existing Rules Engine and reducers; Lifecycle app/workflow/clock effects use existing preparation. World-rule emissions, nested World Commands, workflow entries, due interactions/automations and queued Tasks consume one shared budget. The private clock pump does not dispatch providers. Unlike ordinary legacy pumps, the Authority pump rejects budget overflow instead of silently deferring excess work at its normal batch boundary (authored catch-up policies remain intact).
- All derived publications are refreshed as one bounded, single acyclic layer after private due work. This deliberately follows C1's whole-hook budget reservation and also covers indirect writes/retention changes. Direct or expanded authority writes into derived output domains are rejected. The standalone hook accepts ordinary Lifecycle/background candidates without a fake player Transaction. Wiring it into real Session publication is C3 work, not performed here.
- Candidate, receipt and result envelope are deeply immutable. The receipt contains stable public identity/anchor plus only the explicitly authored safe result projection, never automatic summaries, private reads, raw Event payloads or whole changed records. Author-declared derived output is explicit declassification, not a new Truth store. The complete preparation result/candidate is private Host state and must never be inserted wholesale into a model prompt.
- No Session revision, Timeline, assistant Variant, Action receipt or Lifecycle receipt is published. Logical time is not incremented by preparation; the existing final Session publication owns that step. Candidate outbox entries are private only. C3 must not publish or run them before successful finalization.

### C2 boundedness

C1's stricter per-Package ceilings remain authoritative: 16 reads, 16 World Events, 24 App Commands, one clock advance, one workflow transition and 32 total effects (including derived and expanded work). Indirect Task scheduling and World-command invocation also consume the total effect budget.

Additional execution ceilings: 64 KiB per strict JSON value (including projected World state), 1 MiB cumulative evaluated/validated value bytes, 256 KiB cumulative private-read bytes, 4096 granted-record lookup scans per preparation / Information source scans per observation, 256 total World-rule evaluations and 1024 execution/projection steps. Repeated simulations/evaluations are conservatively charged, not just final writes. Receipt <=32 KiB and observation <=64 items/16 KiB include the complete UTF-8 envelope. Existing full-snapshot invariant validation continues to use Native schema/retention limits. Large legacy World state may therefore need a smaller authored Transaction footprint before opting into this new capability; no limits were relaxed for convenience.

### C2 validation progress

- Added direct composition/failure/disclosure/identity tests, expanded-work and UTF-8 boundary tests, and real Session repository-isolation tests parameterized over the existing storage harnesses.
- Interim runs exposed an incorrect aggregate-byte test fixture: 8 World Events accounted for 962403 bytes, below the 1 MiB ceiling, so expecting rejection was wrong. The fixture was increased to 9 Events; the limit was not weakened. Intermediate failures are not counted as passing evidence.
- Final source tree and final validation/CI outcome are recorded below after completion. C3 is not started; Host supported versions remain empty.

### C2 final validation evidence

- Implementation HEAD / local and remote tested HEAD: f0113115138249a437d39ccdd8d6e4a46951d31c (committed and pushed on the existing task branch).
- Exact tested tree: b28691562e118fe374f2a3e2a5a07f6ef3a6a0ec. Source was staged before the final matrix, then verified unchanged before commit.
- Final local matrix: **28 suites / 947 tests passed**, including 3 new C2 suites / 78 tests. Existing flags ATRIA_DISABLE_MYSQL_TESTS=1 and ATRIA_DISABLE_POSTGRES_TESTS=1 excluded unavailable local database services; real repository tests exercised FS and SQLite.
- New C2 suites: native/authority-candidate-c2.test.js, native/authority-bounds-c2.test.js, native/authority-session-c2.test.js.
- Adjacent matrix: all 19 C1 final test paths listed earlier, plus game-runtime/logic-runtime.test.js, rules.test.js, rng.test.js, world-session.test.js, reducers.test.js and formula.test.js. The updated authority-transaction workflow contains the exact complete 28-path list.
- Invocation: from tests/, node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand --verbose=false --runTestsByPath followed by that list.
- ESLint passed for all 10 touched/new JS files; workflow YAML parsed; working/staged diff checks passed.
- Remote CI run 36681134406 on the exact implementation HEAD above: **SUCCESS — 28 suites / 1153 tests passed**, FS/SQLite/MySQL/PostgreSQL, plus source lint. https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36681134406. Remote tested HEAD equals local tested HEAD. No local MySQL/PostgreSQL pass is claimed.
- No full repository suite, Narrator/provider invocation, real browser UI, Android/device or save-container export/import round trip was performed or claimed. Same-anchor determinism was tested using cloned/restored snapshots and real Session repository reload; final retry/branch integration remains C3.

### C2 boundary / C3 target

C2 provides private candidate preparation only. No real authority publication, Narrator integration, Frontend invocation, Action idempotency storage or background publication wiring was implemented. Host capability supported versions remain []. This task has not modified or merged main, and the task branch is retained. Package P1 is still blocked through C4.

C3 must integrate the same prepared authority path for resolver and fixed typed invocation; project safe Narrator context from the frozen candidate (never dump the candidate), pass only the safe receipt as ephemeral Host input, and finalize authority + Action receipt + assistant Turn in a single existing Session CAS. Persist/check stable identity and inputHash with anchored selection, reject stale/conflicting work, keep provider failure zero-mutation, and preserve Branch Retry versus prose retry semantics. Wire the same derived-publication hook before ordinary Lifecycle/background publication where it can affect declared projections. Do not dispatch candidate outbox Tasks before final commit. Do not enable Host support until the complete execution/Turn gates justify it.

At C3 exit: commit/push the same task branch, append to this Record, refresh the unique HANDOFF with exact HEAD/tested HEAD/validation/C4 target, give a C4 takeover prompt, then stop. C4 performs final integration/merge/cleanup; no Package implementation or workaround is authorized here.

### C2 final remote reconciliation

After implementation push, a second fetch found concurrent unrelated governance work: origin/main advanced to 2a1cba78a428137ccded7647ce6dadd79a3ac60c (only AGENTS.md Skill-routing guidance differs from the stage-start main); origin/docs advanced to ba2d4cdf4db3dce44cec0225bd94dd3edfbdbe60. The new main instructions and Governance delta were read. Docs was fast-forwarded without losing this Record. No product-source conflict was introduced; the tested task commit was not rebased/reset, and main was not changed by this task. C3 must fetch/read the actual latest refs and instructions, not treat the old baseline as current.

## C3 — Turn and Frontend integration

Status: **C3 complete; stopped at the stage boundary; C4 not started** (2026-09-30).

- Fetched all remotes before changes. Source/docs worktrees were clean. Actual origin/main: 2a1cba78a428137ccded7647ce6dadd79a3ac60c; origin/docs: 1bf1e939638ab2122b98d8b1864dbf74022a7152; task branch/local/remote start HEAD: f0113115138249a437d39ccdd8d6e4a46951d31c. No rollback, rebase, main merge or Package changes.
- Read latest main AGENTS, full Governance, unique HANDOFF, Core Plan/Record and Package index → technical-design Rounds 9.5–9.8. No Skill/delegation required.
- Implementing shared resolver/typed selection, private proof-controlled Session finalization, safe candidate Narrator context, retry/Branch Retry and ordinary Lifecycle derived-publication wiring. Host advertised support remains disabled until full gate evidence.
- Interim targeted checks: real HTTP provider/Session Turn + C2 Session regression, 2 suites /26 tests passed; typed Frontend compiler/client/Host integration, 1 suite /12 tests passed. A test fixture used unsupported AUI constant syntax; corrected to the existing object expression without changing product syntax or weakening validation. Final source HEAD and complete validation are recorded below at stage closure.

### C3 implementation decisions

- New internal authority-turn composition reuses C2 APIs and existing NativeGenerationHost / SessionCore. The resolver receives fixed declaration tools, only public ID/verb/description/input schema and C2 player observation. One call only; undeclared targets, extra fields and invalid args fail closed. The complete resolver tool+input UTF-8 envelope is capped at 64 KiB.
- Ordinary free text must match the anchored latest user entry. The selected Transaction/input is pinned before preparation, shared across short-lived HTTP Host/Core instances for the same storage engine and isolated by owner/Session/Branch/revision. At most 128 unresolved continuations; no eviction-and-reresolve when full. Successful finalization releases the transient pin. Changed same-anchor input fails closed. Pins are execution state, not a new persisted authority or Outcome domain; process-crash continuation persistence is not introduced. C2 mechanical RNG identity remains derived solely from durable authority anchors/Transaction identity, never input/prose/provider timing.
- Narrator and turn_context stages use the frozen candidate's Narrator Information perspective, not task-private or raw World projections. Host receipt is injected independently of task input schemas. Information rollups are excluded, each authority context projection scans at most 4096 records, and its complete selected context+receipt is capped at 64 KiB UTF-8. Narrative Skill/tool execution is not enabled for this mechanically closed path. Tool output, mechanical outcomes, malformed/empty Narrator payloads and final validation failures cannot publish.
- SessionCore accepts only identity-branded private preparation proofs (WeakMap, cloned/frozen accepted input and user draft). Raw HTTP finalize cannot forge a candidate. Existing Session CAS publishes prepared states, Action receipt and assistant Turn together; no candidate outbox is dispatched. Durable Action receipts carry authorityId/inputHash/player and assistant message refs; full private candidate, work counters and Turn-local safe receipt are not copied into receipts.
- Frontend Bridge v1 action.invoke gains only a fixed target { transactionId }. Compile/Build/install/runtime link it against the exact entrypoint's pinned Game Logic; input mapping reuses the existing closed mapping/schema validator, output stays an empty public bridge acknowledgement. This is independently gated by authorityRuntime and authority-first Turn, not an action@2 redefinition.
- Typed input creates a deterministic private user draft and commits it with the assistant in the same CAS. Even that draft remains unpublished on failure. Transport epoch is excluded from durable idempotency identity; same-key replay survives frontend reopening, failures may retry the same pin, conflicting input/stale revisions fail closed.
- Ordinary Retry Reply still forks from the coherent pre-effect user boundary. Typed Retry has no separate pre-user commit, so SessionCore forks its recorded pre-effect revision and materializes the selected user input on a new branch. It validates the original committed typed receipt before replaying the fixed input; it never slices old prose over post-effect authority. Neither path is prose-only Re-narrate.
- Ordinary Lifecycle preparation and declared background App Command results share C2's expanded-effect/UTF-8 budget with the same whole derived-publication hook before CAS. Direct writes into derived output domains and generic Runtime World/journal patches for opted-in authority Packages fail closed. Existing Packages without the capability keep their old behavior. The C2 real-Session fixture no longer manually seeds a derived-owned domain; source seeding now creates it through the unified hook.
- Host supported versions remain [] at this stage boundary. C4 must audit the complete frozen integration matrix before advertising [1], then merge/revalidate/clean up. Required capability Packages therefore remain activation-gated; tests use optional metadata solely to exercise the staged integration. No Package workaround or game content is added.

### C3 validation progress / corrections

- The first 41-suite adjacent matrix found two compatibility regressions: eager retry-cache construction broke legacy delayed SessionCore injection; eager Transaction compilation affected Frontends with no Transaction binding. Fixed with lazy cache access and on-demand fixed-target linkage. The two failing suites then passed (46 tests); prior failures are not passing evidence.
- Additional test-only corrections: AUI object-expression syntax, complete background mock route evidence, and the existing presentation/artifact Narrator result policy. Product schema/security checks were not relaxed.
- A Windows test child process without SystemDrive/SystemRoot expanded OS cache paths under tests/. The generated cache directory was verified inside the test workspace and removed; subsequent test processes receive explicit Windows system-directory environment variables. No generated cache or machine data is staged.

### C3 pre-refinement validation evidence

- Implementation HEAD / local tested HEAD: f3da66ad97db006b61da82aeba2df122f90a5957 (committed and pushed to the existing feat/authority-transaction branch). Exact tested tree: 170fbf2a5dda5e35c82f5ad3e6facdd671a1b4e2. Source was staged before the final matrix and verified unchanged before commit.
- Final local matrix: **42 suites / 1207 tests passed**, including four new C3 suites /54 tests. FS/SQLite; unavailable local MySQL/PostgreSQL explicitly excluded with ATRIA_DISABLE_MYSQL_TESTS=1 and ATRIA_DISABLE_POSTGRES_TESTS=1. The complete path list is in the authority-transaction workflow.
- New suites: native/authority-turn-c3.test.js, native/authority-frontend-c3.test.js, native/authority-publication-c3.test.js, native/authority-narrator-c3.test.js. Adjacent matrix includes all 28 C2 final paths, eight Frontend suites, model-prompt-runtime-p4 and package-turn-memory-bridge-g3.
- ESLint passed for all 21 touched/new JS files. Workflow YAML parsed and its 42 test paths were checked. Working/staged diff checks passed.
- Real local HTTP provider transport exercised both role Narrator and declared Narrator Task; tests also exercised the real Frontend Bridge client/Host, compile/Build/install binding closure, Session FS/SQLite persistence, derived background publication and branch snapshots. No external hosted model credentials were used.
- Four-engine CI run 36685158621 on that HEAD was superseded/cancelled by the final compatibility-refinement push; it is not passing evidence. https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36685158621
- No full repository suite, real browser UI/device/Android, production provider, process-crash continuation recovery or save-container export/import round trip was performed or claimed. Host recreation plus repository reload and snapshot-restoration mechanics were covered by C2/C3 targeted checks; complete integrated/save verification remains C4.

### C3 final compatibility refinement

- After the 42-suite local matrix, final review confined the new replay requestHash and typed-retry metadata checks to Packages with authorityRuntime. This protects the exact legacy behavior rather than extending new authority rules globally.
- Refinement commit / current HEAD / final local tested HEAD: 98dd21a37e2d215df4a065672dd685db9c02eda3; tested tree: e1c9686e1bab87f66d97cec60299df4a3c2522e0. Both C3 commits are pushed.
- Final-HEAD affected regression matrix: **8 suites /160 tests passed** (all four C3 suites plus task-runtime-p3, model-prompt-runtime-p4, package-turn-memory-bridge-g3, turn-app-outcome-g1). The earlier full 42 suites /1207 tests passed at f3da66ad97db006b61da82aeba2df122f90a5957; do not mislabel that local run as a run on the refinement commit.
- The two changed JS files passed ESLint again; working/staged diff checks passed and the exact tested tree was verified before commit. The 42-path four-engine CI runs again on the refinement HEAD; its final result is recorded below.

### C3 closure

- Final implementation HEAD / final local and remote tested HEAD: 98dd21a37e2d215df4a065672dd685db9c02eda3; tree e1c9686e1bab87f66d97cec60299df4a3c2522e0.
- Final-HEAD four-engine CI **SUCCESS: 42 suites /1451 tests passed**, FS/SQLite/MySQL/PostgreSQL, plus source lint. Run 36685494750: https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36685494750. Head SHA checked through GitHub run metadata; actual log test totals verified.
- Final local affected matrix remains 8 suites /160 tests at that exact HEAD. The broader local 42 suites /1207 tests were on the immediately preceding C3 implementation commit; CI revalidated the complete matrix on the final HEAD.
- Final fetch: origin/main remains 2a1cba78a428137ccded7647ce6dadd79a3ac60c; source local/remote task HEAD matches above; docs was 1bf1e939638ab2122b98d8b1864dbf74022a7152 before this Record/HANDOFF commit. Source worktree clean.
- This Record and the unique HANDOFF are updated for C4. C3 is complete and stops here. No C4 integration/merge/branch deletion, no Package development and no Host capability support advertisement were performed. C4 must complete the final frozen gate, enable verified support, merge/revalidate main and perform Governance cleanup before Package P1 is unblocked.

## C4 — Regression / integration / merge gate

Status: **complete — verified, integrated and closed** (2026-09-30).

- Fetched all remotes; clean source/docs/main worktrees. Start task HEAD 98dd21a37e2d215df4a065672dd685db9c02eda3, origin/main 2a1cba78a428137ccded7647ce6dadd79a3ac60c, origin/docs 42ba215232bf982e58e526a4b0dc991f80ef59d3. Local main was behind only the already-read AGENTS Skill-routing commit; no rollback or C1–C3 redo.
- Read current main AGENTS, complete docs Governance, HANDOFF → Core Plan → this Record, Package index → technical-design Rounds 9.5–9.8. Scope remains Core C4; no Package content/workaround or reference reads.
- Added real .atriasave export/import tests for unresolved and committed typed/free-text Turns, independent-engine and separate-Node-process replay, persisted idempotency and complete Branch Retry execution, computed/expanded rejection before Narrator, ordinary due-work projection and injected final storage HEAD failure.
- First C4 run: 14 passing /2 failing fixture cases. A numeric expression was intentionally placed in a string destination, so C1 correctly rejected installation before the intended runtime test. Replaced it with a statically valid numeric expression exceeding its computed destination range; no product bound was weakened.
- Scope distinction: a separate process reruns intent selection from the imported anchor. Tests supply the same declared selection and verify identical authority identity/inputHash/Fortune/receipt. This proves durable-anchor RNG and real container portability, not persistence of an uncommitted resolver selection or an execution journal across process crashes.

### C4 frozen verification matrix

| Gate | Executable evidence |
| --- | --- |
| 1 — World + multiple Lifecycle domains + canonical clock | authority-candidate-c2 composition; authority-turn-c3 single-CAS Turn; authority-integration-c4 restored typed/free-text execution |
| 2 — Invalid effect, zero published mutation | authority-session-c2 late workflow failure; authority-bounds-c2 computed/UTF-8/expanded limits; authority-integration-c4 rejects before Narrator and injects final storage HEAD CAS failure |
| 3 — Only declared player-safe intent observation | authority-bounds-c2 player/display source, scan/item/UTF-8 limits; authority-turn-c3 real resolver request assertions |
| 4 — No private read leakage into Narrator receipt/context | authority-candidate-c2 receipt/private-error tests; authority-narrator-c3 role/declared Task context; authority-integration-c4 HTTP sentinel checks including separate-process replay |
| 5 — Atomic derived publication | authority-turn-c3 authority/projection CAS; authority-publication-c3 ordinary App/background Task/schema failure; authority-integration-c4 ordinary clock pump |
| 6 — Narrator/provider final failure publishes nothing | authority-turn-c3 provider/empty/tools/stale/cancel/final-validation failures; authority-frontend-c3 private draft failure; authority-integration-c4 failed-provider saves contain only the original committed anchor |
| 7 — Success commits authority + Action receipt + assistant Turn once | authority-turn-c3 and authority-frontend-c3 commitSnapshot count; authority-integration-c4 restored execution, receipt committedRevisionId and storage-head failure/retry |
| 8 — Fixed typed and free-text share Transaction authority | authority-frontend-c3 real Bridge client/Host and prepareAuthorityTurn spy; authority-integration-c4 both paths through real HTTP Narrator and save portability |
| 9 — Stale/idempotency fail closed | authority-turn-c3 same-anchor/conflicting input/concurrency; authority-frontend-c3 reopened epoch replay; authority-integration-c4 imported committed receipts replay without a provider/CAS and reject changed/stale requests |
| 10 — Stable Fortune across provider retry/save restore | C2 cloned snapshot checks; C3 same-engine pin/Host reconstruction; C4 actual .atriasave import into a fresh engine and separate Node process preserves anchor, authorityId, inputHash and complete safe receipt for the same selected Transaction/input |
| 11 — Coherent Branch Retry, immutable committed branch | authority-turn-c3 pre-effect free-text fork; authority-frontend-c3 typed replay; authority-integration-c4 both complete a new Turn after committed-container import and retain the original revision unchanged; save-system historical restore remains a new Branch |
| 12 — Old Package compatibility | authority-contract-c1 / authority-resources-c1 absent-capability and schemaVersion 1/2; declarative/transactions compiler regressions; Package install/runtime, action@2, Turn/App, Lifecycle, Frontend, Information, Session and Save adjacent matrix |

All paths above are tests/native unless identified as Game Logic compiler tests. Full exact matrix is maintained in .github/workflows/authority-transaction.yml, now 51 suites and applicable to relevant main pushes as well as the task branch.

### C4 gate progression and scope

- Before support enablement: staged execution gate **6 suites /108 tests passed** (including C4 real save/independent-process tests); additional precise storage-CAS fault test **2 tests passed**. The initial storage fault test targeted the legacy unconditional putResource, which the modern HEAD CAS does not use; corrected instrumentation to putResourceIfMatch, without changing production storage behavior.
- Enabled Host authority-transaction supported versions from [] to [1] only after the executable gate above. Capability v1 now passes required activation; undeclared/mismatched/unknown-version contracts still fail closed. Existing C1 staging assertions were updated to test the completed capability rather than permanently expecting it disabled.
- The shared Turn fixture now declares required=true, so all C3 Turn/Frontend/Narrator/publication and new C4 integration tests exercise real required capability activation, not an optional-metadata workaround. C1 optional and legacy regression cases remain intact.
- Enabled-path targeted validation: **4 suites /94 tests passed**. All workflow-listed authority JS files passed ESLint; workflow YAML and exact 51 existing test paths validated. Full local/CI evidence and exact HEADs follow below.
- No execution journal, parallel authority, mechanical redesign, private-information widening, Package content or Package workaround was added. Separate-process testing exports committed state after a simulated Narrator failure; it is not an abrupt OS-kill/power-loss test. At this local checkpoint there was no full repository suite, real browser/UI, Android/device or production hosted model validation; subsequent adjacent remote browser evidence is recorded below.

### C4 task-branch validation

- Implementation HEAD / local tested HEAD: 7e2e36433b8bb298ca234ca11e99517c2f4d6648; tested tree 3b0a469ea3da6e3c549a4492fac75e9916920d5c. Staged tree was verified unchanged after validation and before commit. Pushed to the existing task branch.
- Complete local matrix: **51 suites /1324 tests passed**; FS/SQLite with existing explicit MySQL/PostgreSQL local exclusion flags. Includes new C4 suite /18 local tests (9 cases per engine).
- All 41 workflow-listed JavaScript lint paths passed; workflow YAML parsed, all 51 test paths exist and are unique, working/staged diff checks passed. No untracked caches or machine files were committed.
- At this historical checkpoint, exact-HEAD four-engine CI, integrated main, branch cleanup and Package unblock were pending; final results follow below.

- Task-branch CI **SUCCESS**, exact HEAD 7e2e36433b8bb298ca234ca11e99517c2f4d6648, run 36688893688: https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36688893688. **51 suites /1634 tests + lint passed**, with FS/SQLite/MySQL/PostgreSQL. Run metadata and actual log totals were checked. C4 adds 36 integration cases across four engines; separate-process restore uses a clean FS child target from each source engine.
- Integrated latest main with a non-fast-forward merge after task CI passed. Integrated commit cd6bff19d54f651a4bffd8981f62ec77c0f84acb, tree ce40ad7e2a5af89dc4e2d65b89c4ecc491263f34. Its only difference from the task tested tree is the already-fetched AGENTS Skill-routing update; no code merge conflict or unreviewed source delta. Integrated-main local/remote validation is pending below.

- Integrated main local tested HEAD: cd6bff19d54f651a4bffd8981f62ec77c0f84acb, tree ce40ad7e2a5af89dc4e2d65b89c4ecc491263f34. **8 suites /143 tests passed**: authority-integration-c4, authority-contract-c1, authority-resources-c1, authority-frontend-c3, session-core.contract, save-system, package-build-install and experience-actions. Main tree remained clean and unchanged, diff check passed, and main was pushed. Full exact-main four-engine CI follows below.

- Integrated-main Authority CI **SUCCESS**, exact HEAD cd6bff19d54f651a4bffd8981f62ec77c0f84acb, run 36689762938: https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36689762938. **51 suites /1634 tests + lint passed**, all four storage engines; metadata and log totals verified.
- Same-main Native Frontend v3 CI **SUCCESS**, run 36689762911: https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36689762911. Selected Native/Game Runtime/Atria Shell/Memory Graph matrix **257 suites /3186 tests passed**, plus existing Installed Heavy / formal Studio browser smoke and build-lib job. This is adjacent remote browser evidence, not a manual or Transaction-specific UI acceptance test.
- Existing Cleanup merged task branches workflow 36689762977 removed the merged remote task branch after main push. Verified with ls-remote; local task branch is retained until final cleanup. No unrelated branch was manually deleted by this task.

- Same-main Native Model Prompt Runtime CI **SUCCESS**, run 36689762996: https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36689762996. Selected Native/Atria Shell/Game Runtime/Orchestrator matrix **312 suites /3761 tests passed**, integration guard, full repository lint, frontend prebuild cache and **12 Native Session browser E2E tests passed**. Metadata and actual log totals verified. These adjacent matrices overlap; counts must not be added together as unique tests.

### C4 final closure

Status: **C4 complete; Core prerequisite integrated and closed** (2026-09-30).

- Final task implementation / branch tested HEAD: 7e2e36433b8bb298ca234ca11e99517c2f4d6648; tree 3b0a469ea3da6e3c549a4492fac75e9916920d5c.
- Final integrated main / local and remote tested HEAD: **cd6bff19d54f651a4bffd8981f62ec77c0f84acb**; tree **ce40ad7e2a5af89dc4e2d65b89c4ecc491263f34**. origin/main and local main match; source trees are clean.
- Required authority-transaction@1 activation is enabled and tested. All twelve frozen gates have executable evidence above, including actual save-container and separate-process same-selection/same-anchor Fortune evidence, fail-closed limits, atomic finalization, derived publication, old-Package compatibility and coherent Branch Retry.
- Temporary remote feat/authority-transaction was removed by the existing main cleanup workflow; local temporary branch removed after all relevant main CI passed. The task checkout is detached at the verified integrated main, rather than deleting a branch still checked out elsewhere. No worktree or unrelated branch was removed.
- Core Plan status and Package Plan index routing are updated only to reflect completed P0 and P1 readiness. No game design/content, Package asset, workaround or Package implementation was added.
- Permanent Record retains C1–C4 history, exact validation scope, decisions and prior plugin-task recovery. The unique live HANDOFF is removed in the final docs closure commit; no second live handoff is created.
- **Package P1 prerequisite is now unblocked; P1 has not started.** Any Package stage still requires separate explicit authorization. Core work stops here.
- Remaining scope limits are intentional: no persistent uncommitted selection journal, abrupt OS-kill/power-loss test, full-repository test suite, manual Transaction UI acceptance, Android/device or production hosted-model claim. Independent-process replay reselects the same declared action from the saved authority anchor; this must not be represented as recovering an uncommitted selection pin.
