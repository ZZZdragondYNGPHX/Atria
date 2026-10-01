# Original Occult Western Fantasy Game — Package Record

- Task ID: `package/original-occult-western-fantasy-game`
- Primary Workspace: `package`
- Plan: `plans/package/original-occult-western-fantasy-game/index.md`

## P1 — Package Foundation (2026-09-30)

Status: **P1 complete; stopped at the stage boundary; P2 not started.**

- Fetched all remotes; package start HEAD: `21e02130e` (origin/package). No target assets or Package Record existed.
- Core main: `cd6bff19d54f651a4bffd8981f62ec77c0f84acb`; docs start: `da35388c8ccfcc52936864419a91318ec40f2d0d`. P0 is complete; no Core changes planned.
- Existing main/docs/plugin and detached worktrees were clean. Created separate local package tracking worktree; main was not merged into package. No live HANDOFF existed.
- Scope: modular installable skeleton, minimal bootstrap, safe projections, four Task declarations and a diagnostic-only transaction. No P2 gameplay, P8 UI, content production, or Core workaround.

### P1 implementation and decisions

- Added 21 Package-owned source/document files under the game root; no product source was copied or changed, no main merge, no reference reads, no new authority service.
- Installable schemaVersion 2 manifest, exact EntryPoint/World/actor IDs; native text Experience deliberately avoids P8 UI. Seven modular Package Data resources are hash-pinned at build: one minimal bootstrap and six empty definition/Case/Canon families.
- Required Experience capabilities: package-data@1, data-projection@1, perspective@1, model-task@1, session-application@1, temporal@1, runtime-automation@1, turn-contract@1 and authority-transaction@1. Explicit generation permission is enforced at install.
- Two Lifecycle scopes; eleven World domains, three Session authority domains and six derived Session domains. One canonical minute clock. Ready installs a synthetic entity once; two statically owned publications project only approved scene/status fields. Other domains/read models are intentionally empty scaffolds, not final gameplay schemas.
- Seven Sources, five Views, two bounded graphs. No mixed hidden authority is wired into a View. No duplicate Event Journal, Outcome or Resolution domain. Narrator/Reflection Knowledge and all automatic Memory are closed; Claim Advisor has no actual Knowledge binding in P1.
- Four exact-resource Tasks: Narrator (turn-blocking presentation), Reflection and Claim Advisor (latest advisory, no Apply Command), Agenda (FIFO background declared App Command, explicit bounded input, defer intent only). No Agenda scheduler or strategy is implemented.
- SchemaVersion 3 logic has only foundation.check: a deterministic diagnostic, no gameplay verb, World Event or clock effect. It binds to the real resolver/Session preparation path and returns a safe ephemeral receipt. Typed frontend binding remains P2/P8 work; no frontend API workaround was added.
- Seed constants are authored once in seed.bootstrap and compiled into the Ready command by the build tool. Runtime declarations are assembled into the manifest with exact data hashes and packaged model resources.
- Review caught a real Package contract mismatch before closure: declared Narrator must accept Host {stages} and return a string/Turn envelope, not a generic {context}/{text} pair. Corrected to the existing Core protocol and added a real local HTTP Turn smoke. Other initial failures were missing string maxLength, explicit install permission, text Experience metadata and correct projection purpose; no Core validation was weakened.

### Exact implementation / validation pins

- Package implementation / tested / pushed HEAD: `ecbad17290e2a8626cd99c515bc3d98f71b7da4d`.
- Committed tree: `704dbfbcfc6117cc00c90a1f4e6b220752016c11`; runtime source bytes match final successful validation/preview; committed tree was checked against the staged tree.
- Core main / tested HEAD: `cd6bff19d54f651a4bffd8981f62ec77c0f84acb`. Core worktree stayed clean.
- Package start HEAD: `21e02130e5bd0f79d18cc7c631001f13b687763d`.
- Local build: `0.1.0-p1.atria`, 8975 bytes; SHA-256 `752282327615b9b66138708a4260435d9cfe1b95633f450d063814374fb752f9`. Ignored build output is not a release and is not committed. Existing releases are untouched.

### Actually executed checks

1. `node tools/package.mjs validate --core <main-checkout>`: PASS. Actual temporary FS archive installation, reopen/runtime resolution and required authority capability activation.
2. Ready Barrier rejection before initialization; Ready bootstrap/derived publication and repeat-Ready idempotence: PASS.
3. All five Information Views and two graph queries resolve; private sentinel absent from safe Views, observation, receipt and actual model request bodies: PASS.
4. Private diagnostic preparation produces no stored state mutation; over-limit policy, broken static targets, missing exact Task resources and undeclared Agenda decision fail closed: PASS.
5. Local synthetic HTTP resolver plus exact packaged Narrator Task: PASS. Deliberate Narrator failure leaves revision/state unchanged; same-process retry succeeds and repeated invocation returns the same revision without provider re-execution. Diagnostic clock remains zero.
6. `node tools/package.mjs build --core <main-checkout>`: PASS; repeated build at the same path rejects EEXIST and archive hash remains unchanged.
7. `node tools/package.mjs preview --core <main-checkout>`: PASS on final runtime/tool source, including the integration checks above; prints safe JSON projections, not browser screenshots.
8. `node --check` on all three Package .mjs tools: PASS. Staged diff whitespace check: PASS.
9. Main adjacent Jest tests from tests/: `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand --verbose=false --runTestsByPath native/package-build-install.test.js native/experience-resources.test.js`: **2 suites / 8 tests passed**. These FS-focused tests are adjacent regression, not a repeat of P0 closure.
10. Package commit/push succeeded; remote refs/heads/package verified equal to the tested commit. No new remote CI run was triggered or claimed.

### Limits / next checkpoint

- Integration uses real FS storage and a local synthetic HTTP provider. No production hosted model, browser/UI, Android/device, other storage engine, complete repository suite or save-container round trip was tested here.
- Same-process retry uses the Core selection pin; no RNG exists in the diagnostic. No claim of cross-process uncommitted selection recovery, persistent selection journal, process-kill recovery or new save restoration evidence. P0 evidence remains in its own Record.
- P1 does not supply final schemas, meaningful evidence/graphs, complete opening/content, P2 verbs/Resolution, NPC simulation or P8 visual design. P2 must version evolving installed Package identities rather than silently overwrite a published PackageVersion.
- Next: **P2 — Interaction Runtime only**, following index → technical-design + implementation-staging + gameplay + simulation, using a small synthetic world. Implement approved nine verbs, bounded Resolution/Fortune, authority effects/projections/receipt and free-text/typed equivalence. No P3/P8 or full campaign work.
- Continue this same Package Record and long-lived package branch. A single live HANDOFF is created for this Package task; P1 work stops here.


## P2 — Interaction Runtime: contract gate (2026-09-30)

Status: **P2 authorized and started; blocked at conditional Fortune contract confirmation. P2 is NOT complete; P3/P8 not started.**

- Fetch-all/prune confirmed main, docs and package at their recorded P1 closure refs. Main/docs/package and current detached checkout were clean. Package start HEAD: ecbad17290e2a8626cd99c515bc3d98f71b7da4d; docs start: dbe33d94a6331e8cdc9a7658d1d65d9aa71dc60f.
- Read Governance, workspace adapters, the existing sole HANDOFF, Plan index and P2 contract/gameplay/simulation sections, Package Record and relevant P0 Core evidence. No reference content read, branch merge, Core edit or releases modification.
- Package checkpoint / probe-tested / pushed HEAD: **c4293fe7238b9f433b324c1778e16fc47ebfcf73**. This is a diagnostic checkpoint, NOT a tested P2 gameplay implementation. P1 installable runtime/data/manifest remain byte-for-byte unchanged; PackageVersion is intentionally unchanged because the added tool is not packaged.
- Core inspected / probe-tested HEAD: **cd6bff19d54f651a4bffd8981f62ec77c0f84acb**. Product checkout remains independent and unchanged.

### G1 — Authority-dependent eligibility before Fortune

Frozen requirements: gameplay.md 6.28.2 says eligibility is determined before randomness and only Uncertain uses bounded Fortune; technical-design.md 6.48.5 requires Automatic / Impossible / Uncertain before bounded Fortune. The same verb/method may become automatic, impossible or uncertain as access/opposition changes. A model must not select an authoritative eligibility result.

Current Core evidence:

- public/scripts/native/experience/logic/transactions.js:137–153 accepts only static deterministic or bounded_fortune resolution, with kind/cases/fallback/sides; no conditional-draw predicate or authority-selected kind.
- src/native/authority-transaction.js:227–235 reads authority and applies validators, then bounded_fortune unconditionally draws before evaluating cases. Automatic/Impossible cases therefore still have a roll.
- transactions.js:254 rejects duplicate verbs. Splitting the same verb into deterministic/Fortune variants is not a supported same-verb dispatch. A fixed typed binding targets one transaction, not an authority-driven dispatch function.
- A validator can reject an ineligible action before RNG, but cannot return an accepted Automatic result or an Impossible result/receipt. World rules run after the frozen resolution; they are not a conditional replacement for Transaction Resolution.

Reproduction: tools/probe-conditional-fortune.mjs imports the independent Core candidate fixture (no copied product implementation), substitutes a minimal private-read eligibility policy and executes actual preparation. Automatic and Impossible each contain a bounded roll. It also confirms rejection of resolution.when, formula-selected kind and duplicate-verb declarations. The hypothetical fields are negative probes only, not proposed/installable Package declarations.

This establishes the missing **strict no-draw-on-non-Uncertain** contract. It does NOT establish that an ignored extra draw changes automatic success or causes rerolls: current deterministic same-anchor behavior passes. Treating that unused draw as acceptable would be a design interpretation/change requiring explicit approval, not something this Package task silently assumes.

### Actually executed at this checkpoint

- node tools/probe-conditional-fortune.mjs --core <main-checkout>: PASS in the sense **CONFIRMED_CONTRACT_LIMITATION_NOT_P2_PASS**. Three private authority states exercised; every result had roll in [1,3]; three same-anchor preparation retries matched; all source snapshots unchanged; three unsupported declaration alternatives rejected.
- node --check tools/probe-conditional-fortune.mjs: PASS.
- Staged git diff --check: PASS; Package checkpoint commit/push succeeded.
- No new install/build/preview, full gameplay, provider/typed bridge, save-container, browser/device, regression suite or CI execution claimed. Historical P1/P0 evidence remains above/in the Core Record and is not repeated.

### Required next checkpoint

Resolve G1 before representing P2 as implemented: separately authorize an existing-authority Core contract extension (conditional Fortune with closed schema, private-read eligibility, stable same-anchor identity and typed/free-text parity), or explicitly adjudicate that ignored non-Uncertain draws satisfy the approved design. Do not implement either policy change implicitly here; do not reopen/repeat P0 wholesale.

No nine-verb runtime, Resolution Frame/effects/index or typed binding has been implemented in this checkpoint. P2 exit gates remain open. Do not supply a P3 implementation handoff as though P2 passed. Resume the same Package task/Record after G1 is resolved, fetch actual refs and rerun/replace the limitation probe with acceptance assertions. Do not use Package RNG, model-selected eligibility, multi-commit dispatch or a shadow Resolution domain as a workaround.


### G1 resolved — user-authorized interpretation adjustment (2026-09-30)

Status: **G1 closed; P2 authorized/in progress, not complete. No Core extension is needed for this issue.**

- User explicitly permitted appropriate Plan adjustment after the G1 report. The previous strict "no internal draw" interpretation was unnecessarily restrictive: an unused deterministic draw is not a gameplay Fortune decision.
- Updated gameplay.md 6.28.2 and technical-design.md 6.48.5: Core may allocate its anchored draw before cases; Automatic / Impossible cases must have priority and must not depend on it. Their outcome, effects, time, derived projections and safe result are invariant; unused roll is not disclosed. Only Uncertain uses the roll. Always-deterministic verbs should declare deterministic resolution.
- No Core modification, Package RNG, model-selected eligibility, parallel authority, multi-transaction dispatch or relaxed safety limit. Historical G1 evidence above remains accurate for the strict interpretation, but is no longer a blocker under the approved semantics.
- Updated probe at Package tested/pushed HEAD **6be0ed75d68a9f8e0df5b1f3c0b291f00d73ed47**; Core probe HEAD remains cd6bff19d54f651a4bffd8981f62ec77c0f84acb. P1 runtime/data/manifest remain unchanged. This is a contract-policy test checkpoint, not nine-verb implementation.
- Actual checks: probe passes with APPROVED_FORTUNE_POLICY_SUPPORTED_NOT_P2_PASS; Core formula evaluation exhausts all 3 roll values for Automatic/Impossible/Uncertain, and 16 real private preparations across two eligibility states/eight ordinals preserve non-Uncertain effects/projections/results and source immutability. Public semantic result omits roll. Original declaration-rejection/same-anchor checks remain. Syntax and staged whitespace checks pass. Initial formula probe failure was corrected by using the same roots/strings compiler options as Core; no product change.
- No new install/build/hosted-model/typed bridge/save-container/UI/device/full-suite/CI validation claimed. Tests use a diagnostic fixture, not implemented gameplay; P2 must repeat the invariance property on actual nine-verb declarations.
- Next: continue the already-authorized P2 nine-verb runtime, bounded Resolution/effects/index, safe receipt and typed/free-text parity. No further approval for G1 is needed. No P3/P8 until the actual P2 exit gate passes.


## P2 — Interaction Runtime (2026-09-30)

Status: **P2 complete; stopped at the stage boundary. P3/P8 not started.**

- Start Package HEAD: `6be0ed75d68a9f8e0df5b1f3c0b291f00d73ed47` (G1 policy checkpoint, not P2 implementation).
- End / tested / pushed Package HEAD: **`8e7dec443d39beec5a182c16cfe7bcad97ebd6c0`**. Version: `0.2.0-p2`.
- Independent Core main / tested HEAD: **`cd6bff19d54f651a4bffd8981f62ec77c0f84acb`**. Initial and final fetch confirmed no newer main/docs/package changes during this implementation. Core remained clean and unchanged.
- Docs start HEAD: `d2ca8694aa6aff1c5b94d2fd910fbc97483a9821`. Continued this same Record and sole live HANDOFF. No main merge, reference reads, release overwrite, parallel authority or Core workaround.

### Implemented

- Nine closed transactions: observe, verify, interview, access, test, intervene, create_hypothesis, create_lead, advance_time. Private read grants and fixed domain/command/record targets; high-level intent only. Foundation diagnostic remains available for tests but is no longer resolver-exposed.
- Small registry fixture only. Existing entities/Evidence/Belief/Memory/Relation/Condition/player Matter authorities have bounded schemas and Ready seeds. Hypothesis and lead have separate static slots; a hypothesis cannot overwrite testimony or manufacture confirming Evidence. Unused P3+ domains remain explicitly limited P1 placeholders.
- Ephemeral Resolution Frame: closed method/objective, categorical qualification, permission/position, preparation, opposition, existing clerk relationship, authored stakes and bounded expected time. Eligibility precedes Fortune use. Five qualitative risk bands and bounded Core 1–3 Fortune implement the approved G1 interpretation. No Resolution/Outcome domain or custom RNG.
- Automatic and Impossible outcomes/effects/time/public results never depend on an unused draw. Only Uncertain uses Fortune. Accepted InteractionResolved events enter the existing World Journal; its fortune=0 denotes not used, not an exposed internal draw. Public receipt has no roll.
- Evidence preserves provenance/custody/integrity/verification across updates. Verification authenticates a copy, not its assertion. Testimony is suspected/told_by and hypotheses suspected/inference using actual Core enums. Costly success has a concrete authored cost (relationship strain, fatigue, or bruise); failed attempts still consume authored time. Impossible consumes none.
- Single-layer disclosure-safe scene/status/epistemic/memory/index publications, all rebuilt under existing authority. Unknown slip content is withheld; acquired content reaches safe scene context. Graph hypothesis nodes explicitly reference an unverified interpretation rather than labeling its content Truth. Known general/social risk and consequences are projected safely. Hidden sentinel/privateNote never enters model requests.
- Real Native Frontend v3 compilation and nine installed fixed typed bindings. Full Experience contains only a bare functional button fixture; no P8 visual design or final UX. Free-text and typed selection map to the same transactions and closed schemas.
- Package-owned tools import the independent main compiler/harness/services; no product implementation is copied or shipped. Historical releases and the ignored P1 build remain untouched. New ignored build is `build/0.2.0-p2.atria` (19,623 bytes at this checkpoint); final release publication is still P9.

### Actual validation

- `node tools/package.mjs build --core <main-checkout>`: PASS, exclusive new archive write.
- `node tools/package.mjs preview --core <main-checkout>`: PASS, actual install/start/Ready and safe JSON projections, with integration checks. This is not a screenshot or browser preview.
- Final `node tools/package.mjs validate --core <main-checkout>`: PASS on the exact content committed above. Permission enforcement, archive reopen, required authority-transaction@1, pre-Ready rejection, repeat-Ready idempotence, five Views/two Graphs and hidden-sentinel isolation pass.
- Nine real transaction preparations plus same-anchor repeat; undeclared target and extra outcome arguments rejected. Core resolver tool selection verified for all nine closed inputs.
- Core formula evaluator exhausts **600** eligibility/position/preparation/Fortune cases for actual gameplay declarations. Non-Uncertain selected effects and public results are invariant; Uncertain outcomes remain in their risk distribution.
- **80** real non-Uncertain private preparations across ordinals preserve domain/clock/public-result semantics and source snapshots; **75** real Uncertain preparations across five bands/ordinals pass outcome and expanded-work ceilings. No synthetic replacement RNG/evaluator is used.
- Local synthetic HTTP free-text interview: failed Narrator publishes no state/revision; same-process selection resolves once; retry receives identical frozen narrative request messages; repeated successful invocation is idempotent.
- Actual installed frontend bridge: **all nine actions** invoke the expected fixed transaction. Each successful action is observed to call Session commitSnapshot **exactly once**; replay does not commit again. Failed typed interview publishes neither temporary user draft nor state; retry retains the same prepared receipt. Hypothesis/lead creation leaves Evidence unchanged.
- All model requests, including typed narration, are checked for hidden sentinel/privateNote leakage.
- All tools/*.mjs `node --check`, unstaged/staged `git diff --check`: PASS. Package commit and push succeeded.
- Initial authoring errors (unsupported ternary syntax and non-Core epistemic enum names) were corrected in declarations using guarded effects and actual enums. Local synthetic HTTP calls intermittently failed during same-process execution; explicit Connection: close avoids idle pooled-socket reuse, with subsequent preview and final validation passing. No retry loop or product patch hides a failed check.

### Limits / next checkpoint

- This validates the deliberately small synthetic P2 world, not a complete authored game, generalized NPC model, final frontend or campaign acceptance. Fixed hypothesis/lead slots hold the latest current record; this is not an unlimited notebook.
- Only the interview has a real local HTTP free-text resolver run; all nine have contract selection/preparation checks and actual typed bridge runs. Different Session/branch anchors may legitimately draw differently; parity assertions use identical anchored inputs.
- No hosted-model, browser/device, save-container export/import/restore, cross-process crash/retry, broad regression suite or CI run is claimed. FS reopen/load is not save-container restoration. In-process selection pin, same-anchor RNG and committed invocation idempotency are separate from a durable uncommitted selection journal, which is not assumed.
- P3 must add real obligations/deadlines, scheduled changes, institution/Agenda progression, relevance/budgeted deliberation, same-tick/stale handling and event-driven fast-forward. Current advance_time is bounded 1–60 minute canonical-clock advance only, not full simulation or downtime. Four Tasks remain declared, with Agenda defer-only and no autonomous scheduler.
- Publication branches count against hard budgets even when mutually exclusive. P3 must re-audit the existing 16-read / 24-App / 32-effect and expanded-work constraints as its real scopes are added, rather than relax them or introduce a workaround.
- Continue via the same Package Record and sole HANDOFF after P3 authorization. Keep the independent long-lived package branch and historical releases.

## P3 — World Simulation: G2 scheduling contract diagnosis (2026-09-30)

Status: **P3 authorized/in progress; exit gate NOT met. User directed autonomous problem resolution after the diagnosis; continue with a minimal formal Core correction if required, not a Package workaround. P4/P8 remain out of scope.**

- Fetch-all/prune and worktree audit: main `cd6bff19d54f651a4bffd8981f62ec77c0f84acb`, docs `3496146a713285086497b3fd7ccce9938770e968`, package start `8e7dec443d39beec5a182c16cfe7bcad97ebd6c0`; matching origin refs and clean worktrees, including the existing detached product validation checkout. No history rollback or reference content read.
- Diagnostic Package HEAD / probe-tested / pushed: `bb13a1e47c6407a195c85f9974d7a8f81f113f8a`. Only `tools/simulation-contract-check.mjs` was added. Installed runtime remains P2 `0.2.0-p2`, byte-for-byte unchanged. This is NOT a P3 gameplay-tested HEAD.
- Core inspected / probe-tested HEAD: `cd6bff19d54f651a4bffd8981f62ec77c0f84acb`; no product changes at this checkpoint.

### G2 evidence and exact scope

The current primitives are real and useful, but do not provide the entire approved scheduling bridge assumed by technical-design 6.50.8/6.54.7:

1. `public/shared/native-lifecycle-contract.js` validates automation Task inputs as literal values; automation declarations and Workflow transitions do not accept state predicates. The real Lifecycle probe advances to tick 60 and queues a due Task with unchanged literal input `tick=0`.
2. `src/native/adapters/generation-host.js` requires the authority-producing Task payload hash to equal its durable outbox input. A caller cannot safely substitute a freshly built private institutional input. Broad projection/history would violate the approved Agenda context boundary.
3. Lifecycle actions cannot dispatch Authority Transactions. Existing transaction effects can conditionally move a Workflow, but its Task input remains static. `prepareAuthorityTransaction` currently requires the last timeline entry to be a user message matching playerMessageId. Fabricating a player turn for background institutions is not acceptable.
4. `executeLifecycle` processes at most four outbox entries sequentially, anchoring each after the preceding Task commit. This is not the approved same-tick baseline/proposal/order/acceptance protocol. Its generic four-call cap is not a relevance or per-advance deliberation budget.
5. Real Lifecycle pumping after a large jump runs automations in declaration order. A diagnostic with due ticks [60,30] executes in that order, not chronological next-event order. Fixed declarations can be manually sorted for one fixture; that does not implement dynamic event-driven fast-forward.

These are a **single missing World Simulation orchestration contract (G2)**, not a reopening of Fortune G1 and not evidence that Lifecycle, Task, CAS or authority-transaction@1 are absent. Safe deterministic reductions, static schedules, scope gates and fixed-input background Tasks already work. No new Core API/capability has yet been implemented or validated.

### Actual diagnostic validation

- `node tools/simulation-contract-check.mjs --core <main-checkout>`: PASS, seven assertions covering strict contract rejection, real in-memory Lifecycle preparation and its source immutability, plus the real Host dispatch loop with explicit storage/provider test doubles.
- The dispatch probe is a unit control-flow check, **not** an installed Session, HTTP provider or persistence integration.
- Recomputed declaration reservation for ALL publications: foundation 10 reads / 21 App / 21 effects; interview 12/24/28; intervene 11/24/28; advance_time 10/21/23. Other verbs stay within the same 16/24/32 ceilings. Expanded P3 work has not been implemented or validated; no limits were relaxed.
- `node --check tools/simulation-contract-check.mjs`, unstaged/staged `git diff --check`: PASS. Diagnostic commit/push succeeded.
- Initial probe setup omitted build-time bootstrap lowering and initially expected TypeError for all strict-field rejections; both diagnostic mistakes were fixed before the passing run. They are not Core defects.
- No new build/install/Ready/model/save-container/CI/broad regression run is claimed; existing P2 evidence above is historical. No release files changed.

### Continuation

The user explicitly instructed continued autonomous resolution rather than stopping at G2. First prefer an existing legitimate authority path; if the missing contract needs Core support, implement and validate it in an independent short-lived product worktree without copied product code, raised limits, a parallel scheduler authority or fake player transactions. Keep this Package Record and the sole live HANDOFF current. P3 still needs every simulation exit criterion, including real save-container restoration; do not issue a P4 handoff until those gates pass.

## P3 — World Simulation completed (2026-09-30)

Status: **P3 complete, tested and pushed. Stopped at the P3 boundary. P4/P8 have NOT started.**

### Pins and prerequisite closure

- Package start: `8e7dec443d39beec5a182c16cfe7bcad97ebd6c0` (completed P2); diagnostic checkpoint: `bb13a1e47c6407a195c85f9974d7a8f81f113f8a`.
- Package implementation / tested / pushed HEAD: **`472045a270c23371d7dc2dac6f7dc685fd3e1970`**.
- Tested committed tree: `920af90fb2e21058794e84dd137d546600919082`.
- Version / PackageVersion: `0.3.0-p3` / `pkgv_b9c0df8ea32803d2fb74283b4b3da042`.
- Independent latest main used for final build/validate/preview: **`052c466e3c9e4b07912da0cb602b2933f4821187`**.
- G2 was resolved through formal Core task `feat/world-simulation-scheduling`, implementation `648b00aa4a09dbda274fa18ee1876756ec284f45`, merged PR https://github.com/ZZZdragondYNGPHX/Atria/pull/99. Its product implementation/CI history is in `records/feat/world-simulation-scheduling.md`; P0 Record was not changed. Both temporary Core branch refs are removed. The existing independent product worktrees are retained and clean.
- Package requires **authority-transaction@1 AND world-simulation@1**. The second requirement is a real implemented Host capability, not optional metadata. G1 remains closed and unchanged.

### Implemented scope

- Formal Core scheduling declarations in `runtime/simulation.json`; no executable Package scheduler, fake player turns, copied product code or parallel authority.
- Two-day synthetic calendar: daily rent arrears; missed hearing with actual permission loss; scheduled clinic treatment of Condition severity; institutional processing; conditional Cold railway progression/blocking; Warm press publication; due Hot registry deliberation.
- Existing Lifecycle domains own Agendas, institutional records, obligations and Conditions. Existing World Journal records `SimulationAdvanced`/`InstitutionFiled`. There is no Outcome/Resolution shadow domain or duplicate event history.
- Static input-only Agenda Task receives its institution identity, actual clock and an explicitly known docket notice, with a bounded `defer`/`file_report` catalog. No other institution's private records or general World/Timeline context. One deliberation is admitted per batch; no normal unrelated-turn model burst.
- Valid intent is rechecked and applied through a non-player Authority Transaction. Filing, one static generated Entity slot (`entities/delegate`), safe projections and accepted Task result publish in one additional Session CAS. A proposed name is not an Entity before acceptance. Reflection/Claim Advisor remain advisory; no per-NPC Tasks/Views were added.
- Foreground authority/narration still finalize atomically; the Host then dispatches an admitted background Task without blocking the foreground result. Failed background delivery leaves the previously committed foreground world unchanged and adds no speculative consequence.
- Relevance, deterministic due-time/priority/ID ordering, bounded work/reaction, stale cancellation, scope/input freshness and provider failure are enforced through the integrated Core. New reconsideration needs an eligible authored occurrence; no immediate recursive retry.
- Unified safe publication unions repeated static grants: **7 read grants / 10 declared App Commands**, down from P2's 10/21. All guarded branches still count in declaration budgets. The fixture's actual two-day private Lifecycle advance measures **16 reads / 16 App Commands / 20 effects**, including selected publication and admission work. This is measured fixture work, not an entitlement to bypass any limit.
- The same nine frontend bindings remain, with wait widened to 1–2880 minutes. Structured player-safe risk/condition/relation fields replace repeated status text branches. No P8 visual/UX work.
- Seven Package Data resources remain modular/hash-pinned; bootstrap public schedule text is synthetic, not launch-world content. Historical releases and earlier ignored builds were preserved.

### Actual validation

- Final `node tools/package.mjs build --core <latest-main> --out <new-output>` passed against integrated main. Final ignored archive: `build/0.3.0-p3-final.atria`, **22,309 bytes**, SHA-256 **`71d007460e2f6b610d33e2199c090f805fea8fdb150a95c7d3d4b2861d5325e6`**. It is not a P9 release and is not committed.
- `node tools/package.mjs validate --core <latest-main>` passed. The subsequent final `preview` executed the same full verification function on the exact committed source, including the final public opening/name metadata, and produced ignored `build/p3-preview.json`.
- Actual FS install/reopen, required capability activation, pre-Ready rejection, Ready/repeat-Ready, five Views/two Graphs, resource/static-target/closed-schema negatives and hidden seed isolation passed.
- P2 regressions on P3 source passed: all nine preparations and resolver contracts, **600** formula cases, **80** non-Uncertain and **75** Uncertain real preparations; local HTTP free-text failure/retry; all nine actual typed actions with one CAS and committed replay; hypothesis/lead do not confirm Evidence. G1 Fortune-use semantics were preserved.
- P3 actual FS checks passed: two daily boundaries with no deterministic model calls; 20 rent arrears; missed hearing/permission loss; clinic recovery; Cold/Warm/Hot states; a conditional railway blocker; exactly one due Agenda intent; actual `tick=2880` input.
- Actual local HTTP Agenda failure publishes no Task/world changes. Retry succeeds; accepted filing/Entity/projections use one CAS. Repeated committed clock invocation and drained Task do not repeat effects or generation.
- Actual stale request cancellation after new institutional information calls no model and promotes no Entity.
- Actual fixed-transaction 2880-minute foreground Turn produces Narrator output, then automatically dispatches the background HTTP Task without a manual drain. The final Entity/filing is accepted.
- All five safe Views and actual model request bodies exclude P1/rail/archive private sentinels. Private institutional notes never enter Narrator/player context.
- **Actual save-container** manual save → export archive → install same Package in a fresh FS store → import save: canonical clock, authority domains and accepted Task payloads preserved. This is not merely reopen/load.
- An attempted advance across the third, un-authored daily boundary rejects with zero published change instead of silently freezing obligations.
- All `tools/*.mjs` syntax and unstaged/staged whitespace checks passed; Package commit/push succeeded. The final source tree is clean.
- Core integrated-main CI at `052c466e...` succeeded: Authority, integration, Native v3 regression/Hard Cut, Native v3 Heavy/Studio browser and cleanup. Core Record contains exact evidence/links; these are not a claim of manually testing Package UI.

Initial authoring checks caught a camelCase Information field ID and a stale frontend wait schema; both were corrected. A diagnostic initially confused declared publication reservation with selected expanded commands (18 expected vs 16 actual); exact measured expectations were corrected without changing any runtime limit. Passing evidence above is from subsequent runs.

### Limits and P4 entry

This is an explicit two-day synthetic fixture, not a generalized campaign economy/healing/travel system or full autonomous city. Clinic treatment is a fixed appointment, not arbitrary natural recovery. The third daily boundary intentionally fails closed until more authored schedule states exist. One admitted deliberation per batch avoids model completion races; the profile does not promise unbounded same-tick strategic batches.

No hosted-model, manual browser/device/P8 acceptance, cross-process OS-crash or durable uncommitted-selection recovery test is claimed. In-process selection pin, same-anchor RNG, committed invocation idempotency and the actual container round-trip above are distinct. The model's proposed name is bounded and promoted to a game Entity, not a new Native actor/model runtime.

Next stage is **P4 — World / Content Foundation only**, after separate authorization. Read index → content-architecture.md + implementation-staging.md, then only the world modules required by the current asset. Preserve hidden Canon boundaries, stable refs, lazy materialization, publication/expanded-work limits and the independent package branch. Do not expand into P5/P8 or the whole campaign. Continue this same Record and sole HANDOFF.

## P4 — World / Content Foundation (2026-09-30)

Status: **P4 complete, tested and pushed. P5/P8 not started.**

- Fetch-all/prune confirmed clean package `472045a270c23371d7dc2dac6f7dc685fd3e1970`, main `052c466e3c9e4b07912da0cb602b2933f4821187`, docs `4a9ee30b02aeedb9237b05282302172acdfb2194`, matching origin refs. Reusing the clean independent detached main validation tree; no main merge or reference content access.
- Read Governance/workspace instructions, sole HANDOFF, Plan index, P4 production templates/staging, this Record and runtime/SIMULATION.md. Loaded geography/institutions, relevant player background/Claim, metaphysics boundary, religion/society and technical data-budget sections for current assets.
- Implementation approach: immutable modular authoring resources with closed structural validation, explicit references and public/private separation. No eager city materialization or added scheduler jobs. P3 fixture/required capabilities and G1/G2 remain unchanged. Deep Eastbank cause remains explicitly unresolved, not promoted from a design possibility into Canon.

### P4 closure — complete / P5 not started

- Package implementation / tested / pushed HEAD: **bd2402db0818ab891b1d17658bc22509f340432d**. Tested committed tree: **fdc56f3e2b6f21b91a2818c58f4a0817bcdb28cd**. Version: **0.4.0-p4**, PackageVersion **pkgv_30e4eb31258baa84728b1f3666bd32cc**.
- Core main / independent validation HEAD: **052c466e3c9e4b07912da0cb602b2933f4821187**. Fetch-all immediately before Package commit confirmed unchanged actual main/docs/package remote baselines. No Core change, workaround, capability relaxation, branch merge, release overwrite or reference content access.

#### Authored foundation

- **31** hash-pinned Package Data resources, **222** structured assets; **393,957 bytes** total, largest resource **73,685 bytes**. Below 256 KiB per-resource and 2 MiB total P4 soft ceilings and Core hard ceilings. Scoped LF text attributes make asset hashes reproducible across checkouts; UTF-8 data has no BOM.
- Six districts / thirty locations including county estate, mill town and rail corridor; ten approved institutional/network nodes. Four subordinate civil service offices distinguish registry/courts/arrival/medical custody from police liaison; not four extra major factions.
- Twelve Tier A and thirty Tier B cores with stable affiliation, relations, competencies, limited perspectives and availability. Major cores include motive, constraints, Agenda, legitimate access, secrets/unknowns and change hooks. No Native actor/Task/View per NPC, full biography batch or eager population.
- Eight Anomaly Families, eight Claim primitives, sixteen Starter Seeds, thirty-two established archetypes and four stabilization traditions. Effects/conditions/Jurisdictions/prohibitions are definitions, **not granted powers or executable Claim authority**. Archetypes vary bounded operations, not only faction/Anchor skins.
- Twelve Eastbank Canon fragments plus index with custodians, conflicting records, evidence gateways and reveal rules. Deep origin remains unresolved; an older Boundary/Identity substrate is a hypothesis, not a newly declared final answer.
- Ten semantic Artifact templates, ten dormant inquiry hooks and one historical event; not issued Evidence, active Cases, scheduled deadlines or scene scripts.
- Seven Origins, eight Prior Lives and seven Faith options provide access/procedural interpretation, not bonuses or supernatural backstories. Selection, Personal Anchor creation and live background effects remain P5.
- Six separately authored public readings mirrored exactly into one installed Native Knowledge revision. **No active fixture Knowledge binding**; private archives, actor motives, institution knowledge, Claim engineering and Canon are not generic Knowledge. Acquisition/authorization and document instances remain later-stage work.

#### Authority and initialization

Executable logic, Lifecycle, authority, simulation, Information, Tasks, capabilities, bootstrap and frontend retain P3 semantics. Only exact model-resource PackageVersion pins changed. Required authority-transaction@1 and world-simulation@1 remain; no added targets/publication/jobs. Seven publication read grants / ten declared App Commands remain. P3 regression still exercises selected two-day **16 reads / 16 App Commands / 20 effects** within unchanged limits.

Ready materializes only the P3 fixture; none of the 222 P4 keys is copied into Session state. **This is lazy live-state materialization, not lazy archive I/O**: Core createTaskWorld parses declared Package Data before compiling logic. No Package-side loader, scheduler or alternate authority disguises that behavior.

#### Actually executed verification

- Fast content check, all tools syntax checks, unstaged/staged whitespace checks: PASS. Closed per-kind schemas, unique stable IDs, field/reference/type closure, non-orphan required dependencies, counts, Common Eight, Claim prohibitions, public Knowledge separation, unresolved deep Canon and byte budgets are enforced.
- Draft full validate passed with the initial 218-asset version. Author review then corrected civil-service custody and expanded privacy/negative checks; **final preview ran the same complete verification function on the exact final 222-asset source**. This is a full integration run, not only JSON formatting.
- Final build passed against real main. Ignored archive build/0.4.0-p4-final.atria: **74,195 bytes**, SHA-256 **fc7a2d36868a7243620ff8221fb851c411783d397a08d938726223c6287ce1ab**. No release artifact committed or overwritten.
- Final actual FS install/reopen verified every declared data asset against exact source hash/bytes and the public Knowledge revision. Ready/repeat Ready, pre-Ready rejection, five Views/two Graphs and no eager P4 live state passed.
- **15 negative checks** cover unknown/missing fields, unresolved/undeclared references, unsupported Principle, falsely settled deep cause, duplicate IDs, contaminated public Knowledge, bad Unicode/malformed UTF-8, string/resource-size/resource-count bounds and unauthorized fixture retrieval binding.
- Final P2 regression: nine preparations, 600 formula cases, 80 non-Uncertain + 75 Uncertain preparations; local HTTP free-text failure/retry; all nine installed typed actions, one-CAS application and committed replay; hypotheses/leads do not become Evidence.
- Final P3 regression: two-day progression, rent/hearing/permission/clinic, conditional rail, relevance, bounded Agenda failure/retry, stale no-model cancellation, automatic foreground-to-background HTTP dispatch and atomic filing/Entity/projections. Third-day advance rejects with no publication. Actual manual save/export and import into a fresh FS store preserves committed state.
- Actual local HTTP foreground/resolver/typed and background requests additionally exclude Canon assertions/references, major actor motives/secrets and institution private function/knowledge. Safe Views and installed public reading also pass these checks.
- Package commit/push succeeded; committed tree equals tested tree. All 58 tracked JSON/MJS/Markdown/AUI source files were byte-compared to their committed blobs. No new Core CI, hosted model, manual browser/device/P8, OS-kill or cross-process uncommitted-selection recovery claimed. Historical Core CI is not relabelled as P4 execution.

#### Limits and P5 checkpoint

P4 is reusable foundation, not a playable campaign. Two-day synthetic EntryPoint remains; third-day boundary fails closed and each batch admits at most one deliberation. Definitions are not automatically selected, acquired, instantiated or executed. P5 must evolve stage-specific fixture assertions deliberately while retaining P2/P3 coverage, and re-budget static targets/schema/publication/expanded work before binding live state. Do not disable validation to accept an opening: add its real closed Case/seed contracts in P5.

P5 next: six-step character creation, Civil Verifier and living Personal Anchor, Second Death multi-path opening, Breach/Imprints, eligible Seed candidates and postpone, earned stabilization/formal Claim, multiple dispositions and failure continuity. Read index → player.md + gameplay.md + content-architecture.md + implementation-staging.md, then technical-design/simulation for actual contracts. Keep Canon isolated and initialization lazy. P0–P4/G1/G2 are complete; P5/P8 not started. Continue this Record and sole HANDOFF; stop after each separately authorized phase.


## P4 follow-up — Third-day simulation correction (2026-10-01)

Status: **User-requested correction complete; P5/P8 not started.** Same Task ID, Package Record and live HANDOFF; no new phase or Core task.

### Pins and scope

- Start Package HEAD: bd2402db0818ab891b1d17658bc22509f340432d.
- Package implementation/tested/pushed HEAD: 37ad414f34350af238c2ca0ac4c081024ca6cf38; committed tree: 1f8e26bf888756a0e315b57df669eee707fcfe75.
- Version: 0.4.1-p4 / pkgv_e2223dfe132e2d3f5e651d4cf8925256.
- Fetched all remotes and checked refs/worktrees/dirty state. Core origin/main and independent tested checkout: 052c466e3c9e4b07912da0cb602b2933f4821187. Product worktrees remained clean; no Core changes, workaround, main merge, reference reads or release overwrite.

### Root cause and correction

The Core scheduler already supports subsequent occurrences. Package simulation.day accepted only day input 0–1 and only authored initial transition branches. Thus the third due daily occurrence was rejected at input validation, not a missing Core scheduler feature.

Added one statically targeted agendas/foundation day_recurring command for day inputs 2–29. It advances only day/nextTick; the existing institutional day command and ordinary rent command continue processing and arrears. Existing domain limits remain day/processedDay <=30 and arrears <=3000. The input contract now matches the supported pre-increment days; no stored-state, UTF-8, authority-read, App Command, effect, step or clock-advance limit was raised. Required capabilities, Ready, Information, Task and simulation scheduling declarations are unchanged. Manifest/model-resource pins identify a new immutable PackageVersion.

Days 3–30 preserve accepted/deferred decisions, existing delegate, railway construction/blocked phase and published press. Hearing/permission loss and clinic execute only at the original second-day boundary. There is no repeated healing, reset of institutional state, daily model call or newly invented institution progression. Single advances remain <=2880 minutes; background admission remains <=1; maxSteps remains 3. Day 31 remains outside the existing 30-day fixture horizon and rejects the whole candidate, including valid day-30 work if combined with overflow in one call.

### Actual verification

- Final full validate: PASS against the exact Core above. Includes actual FS install/reopen, Ready, five Views/two Graphs, required contracts, content schema/reference/UTF-8/privacy negatives, all P2 preparation/formula/HTTP typed/free-text regressions and P3 actual foreground/background HTTP, one-CAS, stale cancellation, filing and conditional rail regressions.
- New positive day-three advance: clock 4320, arrears 30, day/processedDay 3, nextTick 5760; one CAS. Repeated committed invocation makes no additional mutation.
- Actual second-day manual save/export -> new FS archive install/import -> third-day command succeeds and Lifecycle domains match the source-session continuation. This save is from **0.4.1-p4**, not a migration of an old pinned 0.4.0-p4 save.
- Repeated bounded batches reach day 30 / arrears 300. A post-clinic injury stays at severity 2; accepted filing/delegate and hearing/permission consequences persist. Deferred/blocked branches stay deferred/blocked on day three, without new pending work or model requests.
- Mixed day-two/day-three catch-up succeeds with one admitted task. Both original eventful and mixed batches: **16 reads / 16 App Commands / 20 effects**. Recurring two-day batch after accepted filing: **16 / 14 / 17**. Safe publication stays **7 declared reads / 10 declared App Commands**. The simulation transaction adds one declared static App Command, not a new target record/domain. Core ceilings remain 16 reads / 24 App Commands / 32 effects.
- Both a direct day-31 crossing and a day-29 -> day-31 request reject with the persisted snapshot unchanged. No partial rent/clock/publication commit.
- All tools node --check and unstaged/staged git diff --check: PASS. Build: PASS; ignored build/0.4.1-p4.atria, 74,252 bytes, SHA-256 f8754ee33f7bb78f336557a18cfe51bbb232f54c4b33def82d1e4a741e284c37. Build is not a release.
- Initial regression correctly failed because its old assertion expected third-day rejection. The replacement test initially expected 18 recurring effects; measured 17 is correct because an already accepted Agenda produces no new admission effect. Corrected that assertion and reran the full suite successfully; no runtime limit was relaxed.
- Content remains 31 resources / 222 assets; only fixture wording changed, giving 393,968 total data bytes (largest remains 73,685). No new content production, hosted-model/UI/device/Core CI or cross-process uncommitted journal evidence is claimed. Final code/seed was validated before commit; the only later source edit clarified runtime documentation. All 58 tracked JSON/MJS/Markdown/AUI files byte-match their committed blobs. Remote Package HEAD matches; main is unchanged.

### Remaining boundary / next checkpoint

This fixes the third day, **not unlimited campaign simulation**: recurring accounting is supported through the existing 30-day schema horizon. Installing the new PackageVersion does not retarget old pinned Sessions; old-version save migration is not implemented or tested. No payment/attendance verbs, general healing, dynamic institution strategy, P5 opening or P8 UI was added. P5 remains the next separately authorized phase; use the refreshed sole HANDOFF and preserve all prior regressions.


## P5 — Opening Vertical Slice (2026-10-01)

Status: **P5 complete; stopped before P6/P8.** Start Package HEAD 37ad414f34350af238c2ca0ac4c081024ca6cf38; fetched Core main 052c466e3c9e4b07912da0cb602b2933f4821187. The historical two-day prompt is superseded by the completed third-day correction. No P0–P4 redo, G1/G2 reopening, reference reads, main merge or release overwrite.

The default build now compiles a separate real opening profile into existing declarative contracts; the original fixture remains separately installable for P2/P3/P4 regression. This is build-time asset composition, not a shipped alternate authority. Closed Case and supported Seed schemas, six-step identity, living Anchor, multiple source routes, discrete Imprints, Breach/postpone, two Seeds/two stabilization traditions, narrow Claim use and five durable dispositions are implemented. Closure evidence and limitations follow.

### P5 closure pins

- Package implementation/tested/pushed HEAD: a30b0079c1163628e8a469016035fadd2f1dfd58. Tree: 1f1b870c9fba510d96cb188e58177316bcdd68b7. Version: 0.5.0-p5 / pkgv_87771c9db42516502b09e82d0fa28915.
- Core main and independent validation checkout: 052c466e3c9e4b07912da0cb602b2933f4821187; re-fetched before closure and unchanged. No Core implementation change. Temporary local error logging used to diagnose sanitized validation errors was immediately restored; the Core tree is clean.
- Default archive: ignored build/0.5.0-p5-verified.atria, 90105 bytes, SHA-256 4ec68888e1a90d50ef6b2d42906147671082d0a93ce6626cfca674df284f638c. This is a validation build, not a P9 release; old builds/releases were not overwritten.
- Package push succeeded; origin/package matches. All 63 tracked files byte-match their committed blobs.

### Implemented and bounded

The default profile is a real Second Death opening; --fixture retains the exact original P2/P3 behavior under a distinct Package/PackageVersion identity. This prevents synthetic hearing/clinic/railway scripts from masquerading as campaign content without deleting regression coverage. The builder composes existing Native declarations, not executable Package authority. Both profiles retain required authority-transaction@1 and world-simulation@1.

Six guarded steps create adult identity, curated Origin/Prior Life/Faith, one living ordinary Personal Anchor and the independent Civil Verifier practice. Current record support can come from mortuary or insurer; old support from registry or police. Source-specific resolved-action Imprints feed independent comparison and a one-time Breach. Family testimony and hypotheses share a bounded player-held Belief record but have **separate fields and safe epistemic Sources**, with told_by versus inference channels. Evidence keeps four independent world record IDs and references the persistent deceased Entity; the family Actor is materialized upon interview. No dialogue XP or guessed theory creates Evidence.

Only two curated Seeds are executable in this slice. Eligibility, postpone, consultation, explicit accepted Price and civic/church stabilization are Native-validated; the formal Claim, signed/witnessed institutional record, progression, Condition and obligations use existing authorities. Invocation is limited to already examined identity support, not generalized supernatural power. Five dispositions update institutional current records and Settlement state; World Journal action IDs retain accepted occurrences when inquiry reopens. Wrong theories, denied access and withdrawal remain playable.

Publication: **10 static read grants /16 declared App Commands**. The eight-choice Prior Life declaration plus publication reserves the entire **24 App Command** static ceiling. The actual two-day wait reaches **16 reads**. No Source exceeds the 16-field list limit; no Core bound, stored-state horizon, UTF-8 limit or computed schema check was relaxed. Two current/old source Imprints record completed acquisition actions rather than duplicating Evidence or maintaining Resolution history. Future Evidence invalidation must explicitly reconsider their eligibility; P5 has no destruction/invalidation surface.

The opening calendar uses existing Core simulation for rent and a kept/missed day-two Anchor promise through day 30. It intentionally has no new opening deliberation job or full-city economy. Original P3 background scheduling, conditional phases and atomic filing remain exercised in the separate retained regression profile. Deep Eastbank cause is unresolved. Installed public Knowledge remains unbound; selected ordinary familiarity is explicitly projected. P6/P8 content and visual design are absent.

### Actual verification and final-delta coverage

- Full default P5 integration: PASS, **50 actual local HTTP requests**. Real archive install/Ready, two six-step campaigns, required living Anchor, deceased/family Entity materialization, mortuary/registry and insurer/police routes, background expedited access, independent Finding/Breach, postponed and earned stabilization, both Seeds and civic/church paths, premature grant rejection, repeat-Breach no extra Imprints, narrow invocation, all five dispositions and reopening, typed one-CAS finalization/replay, free-text resolver/Narrator failure-zero-publication and stable retry receipt.
- Both actual bounded Graphs were non-empty: three nodes/two acquired edges on the alternate route. Testimony stayed suspected/told_by; a wrong hypothesis and denied archive request left Evidence unchanged. Safe Views, local HTTP requests and replies excluded private Canon, motives, institutional secrets and the private opening sentinel.
- Actual manual save/export -> fresh FS archive install/import -> subsequent day-four continuation preserved the formal Claim. Repeated real bounded advances reached day 30; both day29->31 and day30->31 requests rejected with the stored snapshot unchanged. No reconstruction was substituted for save-container import.
- Full matrix observed maxima: **16 reads /15 App Commands /18 effects**. This run completed with the otherwise-final runtime **before the final isolated Condition-clear correction** described next; do not relabel it as a second post-correction full HTTP run.
- Final audit found that granted stabilization must also clear the old Unsettled Condition. Added one existing-domain Condition command to each stabilization path. Latest-code focused check (validate --state-only): PASS against actual Native Lifecycle/Transaction preparation for civic and church, verifying active formal Claim, invested progression, cleared Condition, bounded work and unchanged persisted source. This focused setup has supported Imprints but no acquired projection nodes; observed **13 reads /12 App Commands /14 effects**. The full HTTP matrix was not repeated after this isolated assignment. Latest build/contract compilation and syntax checks passed.
- Retained --fixture full validate: PASS. P2 nine preparations, 600 formula cases, 80 non-Uncertain/75 Uncertain preparations, all nine typed actions and local HTTP failure/retry; P3 foreground/background dispatch, accepted/deferred/stale/blocked branches, one bounded deliberation, save import and recurring days through 30; P4 asset/privacy/reference/UTF-8 negative gates. No existing regression was turned off.
- Fast content gate: PASS, **31 resources /223 assets /399,213 data bytes**, largest resource 73,685 bytes. Original 15 content negatives remain; P5 additionally rejects malformed Case truth, invented eligibility Imprints and unsupported stabilization traditions, plus underage identity/unknown Seed/whole-city Claim target/refused Price/extra outcome fields.
- All twelve tool modules passed node --check; final changed modules rechecked. Staged/unstaged whitespace checks passed; staging caught and removed two whitespace-only lines in the new compiler before commit. No executable change followed the focused check.
- Ordinary initial failures were resolved in Package/tests: identifier casing, required epistemic actor/channel metadata, Native open-loop status mapping, resolution case ID, enum length, unique verbs, exact binding output schema, component binding permissions, regression resource pins and the required free-text player anchor. reported was corrected to Native told_by. None required a Core workaround.

No new Core CI, hosted-model, manual UI/device, OS-crash or cross-process uncommitted-selection journal evidence is claimed. Existing same-anchor Fortune tests remain narrower than real save restoration. Old-version save migration is not implemented; installing this version does not retarget old pinned Sessions.

### P6 checkpoint

P5 is complete and stopped. Next separately authorized stage: Dual Address Property, Impossible Burial, Dead Railway and initial reusable Institutional Case Patterns. Read index -> content-architecture.md + implementation-staging.md and only corresponding world modules; runtime/OPENING.md and this Record are the current recovery entry. Re-budget both profiles before adding live authority, preserve the complete P2/P3 regressions and P5 opening gates, and extend authored institution scheduling rather than inferring a full autonomous city. Do not start P7/P8, bulk-produce the campaign, reopen G1/G2 or merge/delete package.

## P6 — Signature Network A (2026-10-01)

Status: **P6 complete; stopped before P7/P8.** Start Package HEAD a30b0079c1163628e8a469016035fadd2f1dfd58; fetched main 052c466e3c9e4b07912da0cb602b2933f4821187 and docs 5787bff7263357abacdef655c4e07b206eba8a39. Long-lived workspaces and the independent validation checkout were clean; unrelated untracked content in an old detached chat checkout is untouched. The sole HANDOFF belongs to this task. P6 only; P0–P5 and G1/G2 remain closed.

Budget inspection confirmed that Core refreshes all derived publications together, not transaction-selected subsets. P6 therefore compacts bounded physical evidence storage and publication commands while retaining independent evidence IDs/provenance, existing authorities and both test profiles. It must not merely add per-case hooks to the saturated P5 publication. No runtime workaround or Core limit change is planned.

### P6 implementation and budget audit

Three modular Signature Case Kits and three reusable professional Pattern families are implemented on existing Lifecycle domains. Civil/estate/rail property records, sacred/community versus civil burial identity, and dangerous physical railway Echo have independent evidence-role paths. The twelve qualified dispositions persist in settlements, institutional_records and relations. Property shared use grants an executable expedited rail-dispatch referral, not hazard immunity. Six bounded Pattern instances require their own claimant/response records and leave family-specific remedy or review obligations. No arbitrary world-law generation or full-city simulation is claimed.

Core refreshes publications globally. Bounded physical packing reduces the current default to **9 publication reads /15 declared App Commands**, while keeping independent logical Evidence IDs. There are **58 transactions**; the largest background declaration reserves23 commands and mandate-open reserves24. Existing calendar processing handles day4/5/6 pressures without additional scheduler jobs. Early arrangements can prevent an event, but late intervention cannot clear its historical occurrence. New unsafe railway entry creates Injury and clears the earlier-care flag; treatment does not erase Injury. Sparse optional graph detail avoids filling ordinary opening nodes with empty network payload. All source fields, computed scalar references, UTF-8 and expanded budgets remain Core-validated; no cap was relaxed.

P6 Revelation fields are acquired cross-source contributions (incomplete account, present rights, active contradiction, organized movement), never completion counts. Deliberate stabilization is not established and deep cause remains unresolved. Source text is independently authored weaker disclosure; neither private Canon nor actor/institution perspectives is placed in model context.

### P6 validation checkpoint (historical; closure below)

- Actual final Native preparation matrix: **156 preparations PASS**, six Case orders, route alternatives/same-side rejection, twelve dispositions, reopen and graph merge/split; exact day4/5/6 boundaries and rich-state day31 rejection. Max measured15 reads/13 App Commands/15 effects in this focused setup. This is preparation evidence, not HTTP or persisted-save evidence.
- Final default civic/church focused Claim preparation: PASS; conditions cleared and source snapshot unchanged.
- Seven new content negatives, 35 resources/229 assets,430883 bytes, largest73685 bytes: PASS.
- Fifteen tool syntax checks and package/docs whitespace checks: PASS.
- Default P5 HTTP matrix and final P6 Native/HTTP/save integration still running at this checkpoint; their outcomes are not yet claimed.

- P5 default opening matrix completed: **PASS,50 actual local HTTP requests**, including both source routes/Seeds/traditions, all five dispositions, real save/import continuation, committed replay, failed Narrator zero publication/retry and day30/day31. Its first compacted P6 build measured15 reads/14 commands/16 effects. This run began before the final P6-only pattern duty/referral/reinjury/conditional-notice/sparse-node audit deltas; it is not represented as a full HTTP rerun after them. The final-state156-preparation matrix and final civic/church focused check above were run afterward; the final P6 live run covers those new paths.
- Final retained --fixture regression completed: **PASS** on the final content set and independently identified regression archive. P2 formula/preparation/typed/HTTP retry, P3 scheduling/background/save/day31 and P4 content negatives remain enabled.

### P6 closure pins and final integration

- Package implementation/tested/pushed HEAD: **b18f6649d87c6a5fa3533740c9f535520a43c6bb**. Tree: **6742595a8f296e59ef585adc6daeafd09b50bc2e**. Version:0.6.0-p6 / pkgv_859149d99b6f6b10253eeaeff796e3d1. Verification is the layered sequence above and below, not a claim that the combined default command was re-run from scratch after every edit.
- Core main and independent validation checkout: **052c466e3c9e4b07912da0cb602b2933f4821187**; all-remotes fetch repeated before closure, unchanged. Core remained clean and no product change/workaround was introduced.
- Final default validation archive: ignored build/0.6.0-p6-verified.atria; **119877 bytes**, SHA-256 **63cb3b23effde9dd399633ec380406fb640a260122ac876941db574c3bdd71cc**. Not a release; historical builds/releases were retained.
- Final P6 live integration: **PASS**.136 actual Native preparations,58 P6 Native Turn commits (plus ordinary opening setup),2 typed Native HTTP merges, **5 actual local HTTP requests** including free-text resolver/Narrator failure-zero-publication/retry. Six independent Pattern instances exercised separate requests/replies and enduring remedy/review duties. Repeated unsafe entry clears old care, treatment leaves Injury, and property shared use grants a real expedited rail-dispatch copy. Both Graphs traversed three acquired Case bundles; association split retained underlying Evidence.
- Actual manual save/export -> fresh FS archive install/import -> next-day continuation preserved multi-institution dispositions, Injury and Pattern duties. Subsequent fresh late-discovery campaign validated all missed pressure flags, denied unescorted closed-yard entry, lawful escorted recovery and a late arrangement that did not erase the closure event.
- Final P6 live maxima: **15 read grants /17 App Commands /19 effects**. The separately executed final156-preparation matrix adds exact daily boundaries and rich-state day31 rejection. The final civic/church check verifies retained Claim/Condition consistency on the final schema.
- Final retained fixture regression: PASS (build/p6-fixture-final.log). Full P5 matrix: PASS (build/p6-opening-regression.log); its preceding-build/final-delta distinction is explicitly recorded above. Final P6 live evidence: build/p6-network-final3.log/.err; final focused matrix: build/p6-final-contracts.log; final Claim check: build/p6-final-claim-regression2.log. Earlier interrupted audit probes are not completion evidence.
- Seven P6 authoring negatives and fifteen tool syntax checks passed; final changed test modules were syntax-checked again. Staged/unstaged whitespace checks passed. Package push succeeded; origin/package matches. All71 tracked game files byte-match their committed Git blobs; main/package/validation trees are clean.

### Limits and P7 checkpoint

No hosted-model, manual UI/device, new Core CI, OS-crash or cross-process uncommitted journal evidence. This is bounded content/runtime integration, not P8 UX or a complete autonomous city. No P7 content, final Hearing unlock, universal Claim engineering, Pattern fulfilment/payment or old-version save migration is implemented. The3 Pattern families have2 static slots each; their names and appearance may vary only within ordinary non-Canon bounds.

P6 deliberately leaves deliberate stabilization unproven and deep Eastbank unresolved. Next P7 must combine acquired evidence predicates, not Case completion counts, while independently representing the six final-disposition dimensions. The58-transaction inventory leaves only6 declaration slots; redesign/re-budget approved declarations rather than raising64/16/24/32 limits. All publications refresh together. The current day30 horizon and capped advances remain.

P6 is complete and stopped. P7 goals/routing and a copyable prompt are in the sole HANDOFF.
