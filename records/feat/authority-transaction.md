# Authority Transaction — Implementation Record

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

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
- Tested source tree: 3f843cfd2e312e7dbe7f24392db29c1c164e0281.
- Scope: independent capability/runtime contract and strict bounded schemaVersion 3 transaction declarations only; preserve v1/v2 and legacy packages.
- C2 execution/private candidates, C3 Turn/Frontend integration, C4 merge, and Package content are not started.

## Other task recovery

The prior live HANDOFF at docs@523cb7190f23622e0b850823972a555cdfcd8197 belongs to plugin/atria-mcp-capability-expansion, not this task. Replacing the single live HANDOFF for the user-requested Core task does not complete or integrate that task.

## C1 implementation decisions (2026-09-30)

- Separate Experience capability authority-transaction@1; no action@2 changes or global Experience schema bump. Presence, including optional capability metadata, requires authorityRuntime, and the converse is enforced.
- Staging safety: registered version [1], Host supported versions [] in C1. Required Packages may be stored/inspected, but runtime activation fails closed; optional metadata does not execute transactions. Later execution/Turn stages must explicitly enable support after their gates.
- authorityRuntime v1 has intentObservation {viewIds, maxItems, maxBytes}, policy {maxReadGrants, maxWorldEvents, maxAppCommands, maxEffects, maxReceiptBytes}, optional canonicalClockId. Observation references existing player/display Views only, without Context, Knowledge or Memory exposure.
- Game Logic v3 preserves commands/reducers/rules/interpretations and optional v2 mutation shorthand, plus explicit transactions and derivedPublications arrays. Unversioned/v1 and v2 retain their legacy compiler output; no default transaction authority is injected.
- IDs, effect kinds, domain/command/event/clock/workflow references and field paths are closed statically against the pinned contract/logic.
- Input/record/payload/receipt schemas reuse compileDataSchema. Expressions reuse the non-executable Formula AST, limited to fixed scalar paths, typed operators and existing deterministic numeric helpers. World/data/selectors/eval/JS/RNG calls and dynamic authority target selection are rejected.
- There is no bulk unbounded query, namespace grant or arbitrary read path.
- Resolution is deterministic or one bounded Fortune die (2–1000 sides), up to 16 ordered cases plus a fixed fallback; no RNG execution/seed is implemented here. Receipt projection allows explicit args and public resolution fields only, never private read roots or whole-record references.
- Derived publications are one bounded, acyclic layer with statically declared dependency reads and typed App Command outputs; one publication owns each output domain. Transactions cannot directly write those outputs and must name affected publications. Aggregate budgets reserve the entire hook, including when a Transaction selects none, so background publication cannot evade limits. This is intentionally stricter than a per-publication budget.
- C1 intentionally does not evaluate these effects.
- Reused Lifecycle's strict JSON provenance/complexity helper by moving its implementation to native-values; the Lifecycle wrapper keeps its original limits and errors. No new persistence authority or generic mutation endpoint.
- No frontend invocation or runtime publication handler was added.

## C1 stage boundary / next checkpoint (historical)

C2 has not started. No transaction engine, private candidate execution, multi-domain publication, derived publication runtime, Narrator finalization, Frontend invocation or Package game content was implemented. main remains c936b0aa4c42cf5711f40ae4a00f5fc3432813dc; the task branch is retained, not merged/deleted. Package P1 remains blocked through C4.

 Prove zero partial publication and private-read non-disclosure with direct candidate tests. Do not start C3 Turn/Frontend integration or enable Host capability support before its executable behavior is ready.

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
- The existing deterministic RNG uses this identity. Regenerated input/prose/provider timing is not part of the seed. C3 must pin the accepted selection and reject conflicting input rather than silently re-execute it.
- Overflow items are deterministically omitted with `truncated`; even envelope/anchor bytes count.
- Lower-level errors/cause/private values are not attached to the public preparation error.
- Direct World Events run through the existing Rules Engine and reducers; Lifecycle app/workflow/clock effects use existing preparation. World-rule emissions, nested World Commands, workflow entries, due interactions/automations and queued Tasks consume one shared budget. The private clock pump does not dispatch providers. Unlike ordinary legacy pumps, the Authority pump rejects budget overflow instead of silently deferring excess work at its normal batch boundary (authored catch-up policies remain intact).
- All derived publications are refreshed as one bounded, single acyclic layer after private due work. This deliberately follows C1's whole-hook budget reservation and also covers indirect writes/retention changes. Direct or expanded authority writes into derived output domains are rejected. The standalone hook accepts ordinary Lifecycle/background candidates without a fake player Transaction. Wiring it into real Session publication is C3 work, not performed here.
- Candidate, receipt and result envelope are deeply immutable. The receipt contains stable public identity/anchor plus only the explicitly authored safe result projection, never automatic summaries, private reads, raw Event payloads or whole changed records. Author-declared derived output is explicit declassification, not a new Truth store. The complete preparation result/candidate is private Host state and must never be inserted wholesale into a model prompt.
- No Session revision, Timeline, assistant Variant, Action receipt or Lifecycle receipt is published. Logical time is not incremented by preparation; the existing final Session publication owns that step. Candidate outbox entries are private only. C3 must not publish or run them before successful finalization.

### C2 boundedness

C1's stricter per-Package ceilings remain authoritative: 16 reads, 16 World Events, 24 App Commands, one clock advance, one workflow transition and 32 total effects (including derived and expanded work). Indirect Task scheduling and World-command invocation also consume the total effect budget.

 Repeated simulations/evaluations are conservatively charged, not just final writes. Receipt <=32 KiB and observation <=64 items/16 KiB include the complete UTF-8 envelope. Large legacy World state may therefore need a smaller authored Transaction footprint before opting into this new capability; no limits were relaxed for convenience.

### C2 boundary / C3 target

C2 provides private candidate preparation only. No real authority publication, Narrator integration, Frontend invocation, Action idempotency storage or background publication wiring was implemented. Host capability supported versions remain []. This task has not modified or merged main, and the task branch is retained. Package P1 is still blocked through C4.

C3 must integrate the same prepared authority path for resolver and fixed typed invocation; project safe Narrator context from the frozen candidate (never dump the candidate), pass only the safe receipt as ephemeral Host input, and finalize authority + Action receipt + assistant Turn in a single existing Session CAS. Wire the same derived-publication hook before ordinary Lifecycle/background publication where it can affect declared projections. Do not dispatch candidate outbox Tasks before final commit. Do not enable Host support until the complete execution/Turn gates justify it.

 C4 performs final integration/merge/cleanup; no Package implementation or workaround is authorized here.

### C2 final remote reconciliation

After implementation push, a second fetch found concurrent unrelated governance work: origin/main advanced to 2a1cba78a428137ccded7647ce6dadd79a3ac60c (only AGENTS.md Skill-routing guidance differs from the stage-start main); origin/docs advanced to ba2d4cdf4db3dce44cec0225bd94dd3edfbdbe60. The new main instructions and Governance delta were read. Docs was fast-forwarded without losing this Record. No product-source conflict was introduced; the tested task commit was not rebased/reset, and main was not changed by this task. C3 must fetch/read the actual latest refs and instructions, not treat the old baseline as current.

## C3 — Turn and Frontend integration

Status: **C3 complete; stopped at the stage boundary; C4 not started** (2026-09-30).

- Fetched all remotes before changes. Source/docs worktrees were clean. Actual origin/main: 2a1cba78a428137ccded7647ce6dadd79a3ac60c; origin/docs: 1bf1e939638ab2122b98d8b1864dbf74022a7152; task branch/local/remote start HEAD: f0113115138249a437d39ccdd8d6e4a46951d31c. No rollback, rebase, main merge or Package changes.
- Read latest main AGENTS, full Governance, unique HANDOFF, Core Plan/Record and Package index → technical-design Rounds 9.5–9.8. No Skill/delegation required.
- Implementing shared resolver/typed selection, private proof-controlled Session finalization, safe candidate Narrator context, retry/Branch Retry and ordinary Lifecycle derived-publication wiring. Host advertised support remains disabled until full gate evidence.

### C3 implementation decisions

- New internal authority-turn composition reuses C2 APIs and existing NativeGenerationHost / SessionCore. The resolver receives fixed declaration tools, only public ID/verb/description/input schema and C2 player observation. The complete resolver tool+input UTF-8 envelope is capped at 64 KiB.
- Ordinary free text must match the anchored latest user entry. The selected Transaction/input is pinned before preparation, shared across short-lived HTTP Host/Core instances for the same storage engine and isolated by owner/Session/Branch/revision. At most 128 unresolved continuations; no eviction-and-reresolve when full. Successful finalization releases the transient pin. Changed same-anchor input fails closed. Pins are execution state, not a new persisted authority or Outcome domain; process-crash continuation persistence is not introduced. C2 mechanical RNG identity remains derived solely from durable authority anchors/Transaction identity, never input/prose/provider timing.
- Narrator and turn_context stages use the frozen candidate's Narrator Information perspective, not task-private or raw World projections. Host receipt is injected independently of task input schemas. Information rollups are excluded, each authority context projection scans at most 4096 records, and its complete selected context+receipt is capped at 64 KiB UTF-8. Narrative Skill/tool execution is not enabled for this mechanically closed path.
- SessionCore accepts only identity-branded private preparation proofs (WeakMap, cloned/frozen accepted input and user draft). Raw HTTP finalize cannot forge a candidate. Existing Session CAS publishes prepared states, Action receipt and assistant Turn together; no candidate outbox is dispatched.
- Frontend Bridge v1 action.invoke gains only a fixed target { transactionId }. This is independently gated by authorityRuntime and authority-first Turn, not an action@2 redefinition.
- Typed input creates a deterministic private user draft and commits it with the assistant in the same CAS. Even that draft remains unpublished on failure.
- Ordinary Retry Reply still forks from the coherent pre-effect user boundary. Typed Retry has no separate pre-user commit, so SessionCore forks its recorded pre-effect revision and materializes the selected user input on a new branch. Neither path is prose-only Re-narrate.
- Ordinary Lifecycle preparation and declared background App Command results share C2's expanded-effect/UTF-8 budget with the same whole derived-publication hook before CAS. Existing Packages without the capability keep their old behavior. The C2 real-Session fixture no longer manually seeds a derived-owned domain; source seeding now creates it through the unified hook.
- Host supported versions remain [] at this stage boundary. Required capability Packages therefore remain activation-gated; tests use optional metadata solely to exercise the staged integration. No Package workaround or game content is added.

### C3 final compatibility refinement

- This protects the exact legacy behavior rather than extending new authority rules globally.
- Refinement commit / current HEAD / final local tested HEAD: 98dd21a37e2d215df4a065672dd685db9c02eda3; tested tree: e1c9686e1bab87f66d97cec60299df4a3c2522e0. Both C3 commits are pushed.
- Final-HEAD affected regression matrix: **8 suites /160 tests passed** (all four C3 suites plus task-runtime-p3, model-prompt-runtime-p4, package-turn-memory-bridge-g3, turn-app-outcome-g1). The earlier full 42 suites /1207 tests passed at f3da66ad97db006b61da82aeba2df122f90a5957; do not mislabel that local run as a run on the refinement commit.
- The 42-path four-engine CI runs again on the refinement HEAD; its final result is recorded below.

### C3 closure

- Final implementation HEAD / final local and remote tested HEAD: 98dd21a37e2d215df4a065672dd685db9c02eda3; tree e1c9686e1bab87f66d97cec60299df4a3c2522e0.
- Final-HEAD four-engine CI **SUCCESS: 42 suites /1451 tests passed**, FS/SQLite/MySQL/PostgreSQL, plus source lint. Run 36685494750: https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36685494750.
- Final local affected matrix remains 8 suites /160 tests at that exact HEAD. The broader local 42 suites /1207 tests were on the immediately preceding C3 implementation commit;
- Final fetch: origin/main remains 2a1cba78a428137ccded7647ce6dadd79a3ac60c; source local/remote task HEAD matches above; docs was 1bf1e939638ab2122b98d8b1864dbf74022a7152 before this Record/HANDOFF commit. Source worktree clean.
- This Record and the unique HANDOFF are updated for C4. C3 is complete and stops here. No C4 integration/merge/branch deletion, no Package development and no Host capability support advertisement were performed.
