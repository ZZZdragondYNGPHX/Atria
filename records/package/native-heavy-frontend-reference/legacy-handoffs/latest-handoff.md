# Native Heavy-Frontend Reference Package — Phase 6 complete

Updated: 2026-09-28.

Status: **Implementation Baseline v1.0 v1 closure complete. Stop before Package release or any new phase.**

- Repository: `ZZZdragondYNGPHX/Atria`.
- Branch: `package/native-heavy-frontend-reference`.
- Final Package HEAD: `b3b6c4f01729325a789c92a15cc6946e1a97603a`.
- Tested HEAD: `699389798e94a85587c791b493a58a078a52064c`.
- main: `86b900fd0821eff3cc9fcc23bb2ea343dc1d121b`.
- Final Phase 6 run: `36395818903` — **success**.
- Four core Scenarios: **PASS**.
- Experience Health / Preview / Studio preflight / `prepare_review` / Review / Build: **PASS**.
- Adjacent Native regression: **12 / 12 suites, 488 / 488 tests PASS**.
- Manual Playtest: **PASS for frozen deterministic scope**; record at `packages/native-heavy-frontend-reference/PLAYTEST.md`.
- `providerCalls = 0`.
- No G6; `PLATFORM_GAPS.md` unchanged.
- G1–G5 remain the complete Core prerequisite set for this v1.

Phase 6 adds `branch-restore` and proves unified Native restore of World, Session Application, Lifecycle Clock and Timeline: Branch A Schedule/Church/Phone/Event/Timeline state disappears on restore, then Branch B becomes canonical without ghost future. It also closes the Studio authoring path through validation, preflight, Preview, `prepare_review`, explicit Review/Commit and Build.

No Atria Core source was changed in Phase 6. No second database, Timeline, scheduler, time source, Memory store or save system was introduced.

Known unrelated old repository failures remain out of scope: `native/model-prompt-runtime-p4.test.js` missing-Session-snapshot fixture and the prior `generation-host → public/scripts` architecture guard.

**Stop here. Do not merge/delete the Package branch and do not begin Package release or another phase without a new explicit user request.**

---

## Archived predecessor — Native Heavy-Frontend Reference Package Phase 5

# Native Heavy-Frontend Reference Package — Phase 5 complete

Updated: 2026-09-28.

Status: **Phase 5 — Phone / Communication is complete and validated; stop before Phase 6 — Branch / Regression / Build.**

- Repository: `ZZZdragondYNGPHX/Atria`.
- Long-lived Package branch: `package/native-heavy-frontend-reference`.
- Final Phase 5 Package HEAD: `b09addf9a4c6eadc47b748a53433475242bbc286`.
- Phase 5 tested Package HEAD: `e45109f3c695727ebdd72a13486199c58a57ddd7`.
- Integrated main: `86b900fd0821eff3cc9fcc23bb2ea343dc1d121b`.
- G5 UI → Session Application typed Command: PR #91; Core targeted run `36386573137` success.
- main → Package G5 sync: PR #93 / `8129f69dba48e7435a1039b4329958c1d969c841`.
- Phase 5 final targeted run: `36390830174` — **success**.
- Phase 1–5 Package validators: **PASS**.
- Adjacent Native regression: **9 / 9 suites, 458 / 458 tests PASS**.
- `providerCalls = 0`.
- Normative plan: `packages/native-heavy-frontend-reference/PLAN.md`.
- Platform gaps: `packages/native-heavy-frontend-reference/PLATFORM_GAPS.md`.
- Detailed current handoff: `handoff/native-heavy-frontend-reference.md`.
- G5 Core record: `feat/native-ui-session-application-command.md`.

## Phase 5 result

Phone is now a real Hybrid support app with three separate Session Application domains: SMS Threads, Social and Mail. They do not form a universal message database.

Player Phone forms use the new G5 `application.command` UI action to enter typed Session Application Commands through the existing Host Lifecycle client. Local UI remains draft/navigation only; Phone input is not a main Story Composer message and does not write Timeline.

NPC proactive communication reuses G2:

`Lifecycle trigger → declared background Social Task → schema-validated result → predeclared App Command / scheduled interaction`.

Implemented proof paths include a delayed welcome Mail and a game-clock-triggered caretaker SMS. Delivery uses the existing Lifecycle Game Clock/interactions; no Package scheduler exists.

Normal Communication remains outside canonical Timeline. Main-story escalation is explicit:

`Communication → events/story-current → Narrator / Interpreter → canonical Timeline`.

Narrator does not receive the complete Phone history by default.

Recorded `communication` Scenario proves ordinary SMS/Social/Mail stay outside Timeline, G2 scheduled delivery commits exactly through Lifecycle, explicit promotion creates the canonical Event, and only the subsequent recorded Turn enters Timeline.

Authority boundaries remain frozen: World = settled facts; Communication/Events/Schedule/Church processes = Session Application; Game Clock = Lifecycle; Local UI = non-authoritative; canonical prose = Timeline.

The repository-wide PR Unit Tests still have the same unrelated old `native/model-prompt-runtime-p4.test.js` missing-Session-snapshot fixture failure (811 / 812 suites, 10277 / 10278 tests passed). It is not a Phase 5 regression. The earlier `generation-host → public/scripts` architecture guard remains out of scope.

## Stop point

**Do not start Phase 6 in this handoff. Do not merge or delete the long-lived Package branch.**

Next stage is strictly:

> **Phase 6 — Branch / Regression / Build**

Scope:

- `branch-restore` Scenario;
- four core Scenario full regression;
- Experience Health;
- Preview coverage;
- Studio preflight;
- `prepare_review`;
- human review;
- Build;
- manual Playtest record.

Before continuing, fetch current remote state and read `main:AGENTS.md`, `main:FORK_MAINTENANCE.md`, Package `PLAN.md`, Package `PLATFORM_GAPS.md`, `handoff/native-heavy-frontend-reference.md`, and this file. Reuse Phase 1–5 and do not redo G1–G5.

---

## Archived predecessor — Native Heavy-Frontend Reference Package Phase 4

# Native Heavy-Frontend Reference Package — Phase 4 complete

Updated: 2026-09-28.

Status: **Phase 4 — Hybrid Application Completion is complete and validated; stop before Phase 5 — Phone / Communication.**

- Repository: `ZZZdragondYNGPHX/Atria`.
- Long-lived Package branch: `package/native-heavy-frontend-reference`.
- Final Phase 4 Package HEAD: `0c9b095e748b52ab92cccd379a2d70d4e9e58107`.
- Phase 4 tested HEAD: `7cc7ac54f3da8673d3a315cac86228b2dbaf1dfa`.
- Integrated main: `6052a6d47b13d74be24c412a69527bd445dcc55c`.
- G4 read-only UI Temporal Projection: PR #89; targeted run `36381685191` success.
- main → Package G4 sync: PR #90 / `3a60d365b9726d6c1b35ae98c649f3c7238f2a08`.
- Phase 4 final run: `36384030713` — **success**.
- Phase 1–4 Package validators: **PASS**.
- Adjacent Native regression: **6 / 6 suites, 156 / 156 tests PASS**.
- `providerCalls = 0`.
- Normative plan: `packages/native-heavy-frontend-reference/PLAN.md`.
- Platform gaps: `packages/native-heavy-frontend-reference/PLATFORM_GAPS.md`.
- Detailed current handoff: `handoff/native-heavy-frontend-reference.md`.
- G4 Core record: `feat/native-ui-temporal-projection.md`.

## Phase 4 result

Phase 4 completes the frozen Hybrid application scope:

- complete Church page with Overview / Facilities / Decrees / Projects / Opportunities;
- Schedule timeline using the existing Lifecycle `game-clock` through read-only `temporal`;
- People view with identity / Position, settled relationship, current Event, Schedule and recent canonical Timeline information;
- Current Event Story Header;
- desktop Context Rail and compact Context Sheet;
- text-first Story / Scene presentation over the same canonical prose;
- display-only commit-time `scene_marker` Message Projection with no Authority action;
- desktop 1440×900 and compact 390×844 Preview fixtures.

Authority boundaries remain frozen: World is settled objective facts; Events / Schedule / Church Operations / Projects / Opportunities are Session Application; Game Clock is Lifecycle; Local UI is non-authoritative; Projection is display-only. No second state, time source, Timeline, scheduler, Memory store or database was introduced.

G4 was required because UI v2 could not read the already-existing Host Temporal Projection. The Core fix only exposes `getTemporalProjection()` as a read-only UI root; it does not add mutation authority.

The existing Phase 1–3 implementation remains intact, including `church-day-cycle`, Narrator / Interpreter, G1 App outcome, Knowledge, G3 Memory bridge and recorded `story-turn`.

The known pre-existing Native Model Prompt Runtime architecture-guard issue involving `generation-host → public/scripts` remains out of scope and unchanged.

## Stop point

**Do not start Phase 5 in this handoff. Do not merge or delete the Package branch.**

Next stage is strictly:

> **Phase 5 — Phone / Communication**

Scope:

- SMS Thread;
- Social;
- Mail;
- Phone input;
- unread / notification;
- G2 background Task → App Command / scheduled delivery;
- Communication → Event bridge;
- recorded `communication` Scenario.

Before continuing, fetch remote state and read current `main:AGENTS.md`, `main:FORK_MAINTENANCE.md`, Package `PLAN.md`, Package `PLATFORM_GAPS.md`, `handoff/native-heavy-frontend-reference.md` and this file. Reuse Phase 1–4; do not redo G1/G2/G3/G4, Memory, temporal projection, Story presentation or Message Projection.

---

## Archived predecessor — Native Heavy-Frontend Reference Package Phase 3

# Native Heavy-Frontend Reference Package — Phase 3 complete

Updated: 2026-09-28.

Status: **Phase 3 — Narrative Runtime + Knowledge is complete, Package Memory validation passed, and work is stopped before Phase 4 — Hybrid Application Completion.**

- Repository: `ZZZdragondYNGPHX/Atria`.
- Long-lived Package branch: `package/native-heavy-frontend-reference`.
- Package HEAD: `34ae3892d8cd65814124ad317ed6cc86b6a5a578`.
- Integrated G3 `main`: `698aec1ee5d366ed4e36b5b696c432793dad5e17`.
- main → Package merge: PR #88, merge commit `09fd8ff0c3ecdb03040516c8f781271838f5c1f7`.
- G3 tested HEAD: `1f59ff7957a080f76d802e1d758054d1c2438f2c`.
- G3 Core targeted run: `36376721567` — **success**, 5 suites / 134 tests.
- Phase 3 Package Memory final run: `36378377773` — **success**, 5 suites / 134 tests plus Phase 1–3 Package validators.
- Phase 3 tested Package HEAD: `122396cbf9f4a139feaf5add66e4f707615f94a0`.
- `providerCalls = 0`.
- Normative Package plan: `packages/native-heavy-frontend-reference/PLAN.md`.
- Platform gap record: `packages/native-heavy-frontend-reference/PLATFORM_GAPS.md`.
- G3 completed Core record: `feat/native-package-turn-memory-bridge.md`.

## Phase 3 result

The existing Package Phase 3 architecture remains unchanged:

- Native `narrative-outcome` Narrator/Interpreter Turn;
- G1 semantic outcome → typed `events.advance-beat` Session App Command;
- Event Beat remains Session Application state, not World state;
- Planner stays advisory and World Feedback stays presentation-only;
- separate Narrator / Interpreter / Planner / World Prompt Programs;
- shared Authority / Context Prompt Modules;
- Project-owned Native Knowledge with explicit Knowledge Binding;
- scoped Native Information Runtime;
- recorded `story-turn` Scenario;
- no Curator, Story/Day Compression, Package Memory store, second DB, second Timeline, second scheduler, custom save slot or Package Memory Task.

The Package Narrator Information View already declared `memory: true`. No project declaration or G3 Core workaround was necessary after merging main. Only the Package validation layer was upgraded.

## Package Memory validation

`verify-phase3.mjs` now uses the real G3 bridge against the actual Package snapshot.

It proves:

1. `memory:true` calls fake/in-memory Atria Memory through `recallNativePackageTurnMemory()`;
2. returned source-backed evidence is actually present in the Package Narrator Context Memory lane, not merely returned by the Memory API;
3. `memory:false` does not call Memory and forged evidence is not injected;
4. hidden Timeline provenance, stale Revision and foreign Branch evidence are rejected;
5. Memory unavailable degrades through the existing graceful policy;
6. finalized canonical Narrative crosses the existing Package Turn `TIMELINE_APPENDED` lifecycle boundary;
7. that boundary observes committed `atri_lifecycle` App state and `atri_world_state` World state together with the finalized Narrative;
8. exact replay does not emit a second append, so Memory ingestion is not duplicated.

The same run also reran:

- Phase 1 shell validator;
- Phase 2 Authority/Lifecycle and `church-day-cycle`;
- Phase 3 Project/Task/Prompt/Knowledge/Context/Memory validator and recorded `story-turn`;
- `native/package-turn-memory-bridge-g3.test.js`;
- `native/turn-app-outcome-g1.test.js`;
- `native/background-task-app-bridge-g2.test.js`;
- `memory-graph/hybrid-retrieval.test.js`;
- `memory-graph/source-lifecycle.test.js`.

Final Jest result: **5 / 5 suites, 134 / 134 tests PASS**. MySQL/Postgres were explicitly disabled for this targeted run; FS/SQLite/local fixtures were used. No real provider, unrelated full-repository test/lint, Android or Docker run.

The temporary final Memory workflow and its result marker were removed after success. The existing Package Phase 3 targeted workflow remains and now includes the relevant Memory/G1/G2 targeted regression set.

## G3 status

`PLATFORM_GAPS.md` now records G3 as **Satisfied** rather than blocking. G1/G2/G3 are all satisfied without Package-side Core workarounds.

The known `Native Model Prompt Runtime` architecture-guard issue involving `generation-host → public/scripts` predates G3 and already existed at the earlier baseline. It was not treated as a Phase 3/G3 regression and was not changed.

## Stop point

**Do not begin Phase 4 in this handoff. Do not merge or delete the long-lived Package branch.**

The next stage is strictly:

> **Phase 4 — Hybrid Application Completion**

Frozen Phase 4 scope from the plan:

- Church complete page;
- Schedule timeline;
- People;
- Story Header / Context Rail / Sheet;
- Story / Scene text presentation;
- display-only Message Projection;
- desktop / compact Preview fixtures.

Before Phase 4, fetch current remotes and read:

- `main:AGENTS.md`;
- `main:FORK_MAINTENANCE.md`;
- `package/native-heavy-frontend-reference:packages/native-heavy-frontend-reference/PLAN.md`;
- `package/native-heavy-frontend-reference:packages/native-heavy-frontend-reference/PLATFORM_GAPS.md`;
- `docs:handoff/native-heavy-frontend-reference.md`;
- `docs:handoff/latest-handoff.md`.

Do not redo Phase 1–3, G1/G2/G3, Package Memory validation, or the prior recorded Scenarios. Reuse the existing frozen Authority/Lifecycle/Information/Memory design and stop again after Phase 4 is implemented, targeted-validated, documented and pushed.
---

## Archived predecessor — Native Heavy-Frontend Reference Package Phase 2

# Native Heavy-Frontend Reference Package — Phase 2 handoff

Updated: 2026-09-28.

Status: **Phase 2 complete, validated and pushed; stop before Phase 3.**

- Repository: `ZZZdragondYNGPHX/Atria`.
- Package branch: `package/native-heavy-frontend-reference`.
- Package HEAD: `d7826507e2c926c020a8e957186d9713aac37564`.
- Synced main prerequisite baseline: `35bc587bb78fd6a7c0fc4fc418d99c7315f5af8b` (unchanged during Phase 2).
- Normative plan: `packages/native-heavy-frontend-reference/PLAN.md`, Implementation Baseline v1.0.
- Platform prerequisite record: `packages/native-heavy-frontend-reference/PLATFORM_GAPS.md`; G1/G2 remain satisfied by main, with no Package-side Core workaround.
- Project Source: `packages/native-heavy-frontend-reference/project/atria.project.json`.
- World logic: `packages/native-heavy-frontend-reference/project/logic/world.json`.
- UI Source: `packages/native-heavy-frontend-reference/project/ui/main.json`.
- Recorded Scenario: `packages/native-heavy-frontend-reference/scenarios/church-day-cycle.json`.
- Validators: `packages/native-heavy-frontend-reference/verify-phase1.mjs` and `verify-phase2.mjs`.

## Completed

Phase 2 adds the real Authority/Lifecycle business core without changing the frozen Phase 1 Hybrid shell.

World now stores only settled objective facts: calendar anchors, Church money/followers/reputation/level, facilities, decrees, positions, promotion availability and unlocked areas. Session Application owns the running processes through five typed domains: `events`, `schedule`, `church-operations`, `church-projects`, and `opportunities`.

A continuous `game-clock` starts at tick 480 and advances only through the declared `advance-game-time` command. The `church-day-cycle` workflow implements DAY OPEN → ACTIVE DAY → DAY SETTLEMENT → NEXT DAY. DAY OPEN initializes the current-day Church Operations record through an App Command; settlement enters a deterministic World Command and advances the World calendar. Worked settlement is deterministic (+55 money, +3 followers, +1 reputation for the recorded outreach/project slice); idle settlement advances the day without inventing rewards. Settlement is guarded against duplicate application.

Church level never auto-increments. Settlement can make promotion available, but `church.promote-level` remains an explicit typed World Command. Facilities/decrees and their prerequisites also use declarative typed World rules.

The Event domain includes the frozen Event Instance minimum fields and Beat runtime state, but no Narrator or generated prose. Schedule supports hard/soft/background policy. Church Projects and Opportunities remain Session App process state rather than World facts.

Church and Schedule UI shells now read Native Information Runtime display-only projections plus settled World metrics. Phase 2 intentionally did not add fake UI writes: current UI v2 `command.dispatch` targets World Commands, while these process mutations belong to Lifecycle App Commands. Full interactive Church/Schedule controls remain Phase 4 work.

## Authority / lifecycle decisions

1. **World = settled objective facts. Session Application = running business processes.** Do not move Events/Schedule/Operations/Projects/Opportunities into World in Phase 3.
2. Local UI State remains draft/section/expanded state only; it is not a second business database.
3. Business mutations go through declared typed App Command / World Command contracts. UI, model output and Projection never raw-patch authority.
4. DAY SETTLEMENT is deterministic and idempotent. Replaying settlement cannot double-apply resources.
5. The Package still uses Atria's normal Session/Revision/save/branch model. No custom save slot, custom persistence, custom memory, or parallel scheduler was introduced.
6. No Atria Core modification and no G1/G2 workaround were added.
7. Phase 2 does not contain Narrator/Interpreter, model-driven Event Beat progression, Prompt Programs/Knowledge content, Atria Memory, or `story-turn`.

## Validation

Core implementation commit: `778da8cc9459fe1df10ac6e256e97c7a8b49c477`.

Final validated implementation commit: `051bff9a1a3c4e79caf3df3c2a20e8c1543476a3`.

GitHub Actions run `36369822887`, job `Phase 2 Authority Lifecycle and Scenario`: **success**.

The successful run executed:
- Phase 1 shell regression: **PASS**.
- Production Project Source validation and Hybrid UI compile: **PASS**.
- Phase 2 Authority/Lifecycle contract checks: **PASS**.
- Display-only Church/Schedule Preview fixture: **PASS**.
- Production Studio recorded `church-day-cycle` Scenario: **PASS**.
- Scenario mode: `recorded-or-mock`; `providerCalls = 0`; test Session not persisted.

The Package-local validator also compiles declarative World logic, validates World schema, checks the five exact Session App domains, clock/workflow boundaries, absence of Phase 3 Task/Presentation Runtime, and Phase 2 forbidden-content guards.

Temporary CI workflow was removed after success in `53dcfe9e24219a435fd0d4c6d95c2043f5df2c71`. PLAN completion record is `d7826507e2c926c020a8e957186d9713aac37564`.

Not run: unrelated full repository tests, full repository lint, Android, Docker, real provider inference, or Phase 3–6 Scenarios.

## Remaining / next stage

Next stage is exactly **Phase 3 — Narrative Runtime + Knowledge** on the same Package branch.

Phase 3 should add:
- Narrator / Interpreter;
- `narrative-outcome` plus existing G1 App outcome path;
- Event Beat progression;
- Planner / World Task;
- Prompt Programs / shared Modules;
- Knowledge / Context Projection;
- Atria Memory integration;
- recorded `story-turn` Scenario.

Before editing, fetch actual remote state and read latest `main:AGENTS.md`, `main:FORK_MAINTENANCE.md`, PLAN, PLATFORM_GAPS, current Project/UI/World logic, `church-day-cycle`, `verify-phase2.mjs`, and both handoffs.

Do not redo Phase 1/2, do not change the frozen Authority split, and do not add Narrative Choice/`next_action`, Curator, Story Compression, Day Compression, media Asset Packs, portraits, GAL, Full Experience, custom Save Slot, custom Memory, or Core workarounds. Validate only the Phase 3 touched area and recorded `story-turn`; no real provider is required. At completion update PLAN and both handoffs, push the same Package branch, stop before Phase 4, and do not merge/delete the Package branch.

---

# Latest handoff — Native Platform G2 integrated

Updated: 2026-09-28. Baseline main: `20d6b11b8e3d15a9089ffeb4da4e90d0c894b457`.
Verified local/remote main HEAD: `35bc587bb78fd6a7c0fc4fc418d99c7315f5af8b`. Feature `feat/native-background-task-app-bridge` was fast-forwarded into main and pushed; completed temporary branch is absent locally/remotely.

- New background-only `declared_app_command` / `app_command` result policy requires a per-Variant fixed App Command or existing scheduled interaction binding. Generation admission requires durable Lifecycle intent. App effect/scheduled intent, Task record/authority receipt and outbox completion publish atomically.
- Ordinary proposals still require explicit Host acceptance. Strict schema, scope/epoch, CAS/branch, cancellation, invocation/fingerprint/tombstone and existing clock/pump boundaries remain in force. No raw patch or second scheduler.
- 7 affected suites / 485 tests passed on FS/SQLite; final G2 suite 56 passed after adding production recorded Scenarios. 489 distinct passing tests across runs. Scenario providerCalls is 0; changed-file lint/whitespace passed. No full-repo, Android, Docker, external DB or real provider runs.
- Contract examples, audit, decisions, exact test accounting: `feat/native-background-task-app-bridge.md`.
- Post-merge G2 verification: 56 tests passed again; remote main equality, feature ancestry, clean working tree and whitespace confirmed.
- G1 is already integrated. D1 remains deferred. Package branch stays unchanged; do not start Package implementation as part of this G2 task.

---

## Archived predecessor — Native Platform G1 integrated

Updated: 2026-09-28. Baseline main: `93991c7ccea30ce7499935bbb91592ae137086dd`.
Verified local/remote main HEAD: `20d6b11b8e3d15a9089ffeb4da4e90d0c894b457`. Feature `feat/native-turn-app-outcome-bridge` was fast-forwarded into main and deleted locally/remotely after verification.

- G1 now stages declared semantic World and/or App Command effects via existing authorities and publishes with Narrative/Variant/Turn receipt in one Session Revision. Mapping gains optional fixed-target `appCommand`; old World-only mapping and Task receipt schemas remain compatible.
- 409 distinct targeted tests passed across runs; final G1 suite 38 passed on FS/SQLite plus compiler checks. Changed-file ESLint/whitespace passed. External MySQL/PostgreSQL services unavailable; no Docker/Android/full-repo/real provider validation.
- Formal contract, example, decisions, exact test accounting and limits: `feat/native-turn-app-outcome-bridge.md`.
- Post-merge G1 verification passed again: 38 tests; 34 external DB cases excluded. Remote main equality, feature ancestry, clean working tree and whitespace confirmed.
- G2 is still outstanding; D1 remains deferred. Do not start Package implementation or merge this Package branch into main as part of G1.

---

## Archived predecessor — Extensions / Skills authoring integrated

Updated: 2026-09-27. Local and remote `main`: `93991c7ccea30ce7499935bbb91592ae137086dd`.

- The user subsequently authorized integration and obsolete-branch cleanup. `main` fast-forwarded from `4dab353ac639d42eae885c79e18245267abd6820`, preserving all 16 feature commits. Local/remote `feat/native-experience-modes-capability-deepening` and the already-merged remote `feat/component-form-composer-submit` were deleted. The permanent `docs`, `vanilla` and `luker` branches remain.
- Discovery, shared Skill invocation, browser SDK/runtime, unified Extensions UI and initial five Native P0–P9 authoring Skills are implemented. Existing users may import new Skills through the bundled browser; no real account was changed.
- Real bundled install exposed/fixed dropped `atria-paths` metadata. Recorded Studio AI tool loop reads Skill references, compiles v2, runs production Scenario and reaches Review without Commit/provider calls.
- Full JS unit run initially had 9 failures; all failed suites passed targeted correction/environment/isolated reruns. Final aggregate: 802 executed suites / 9127 passing tests, 7 suites / 92 skipped. This is not one clean final full run; Git system same-second write remains an intermittent broad-run-only failure with isolated pass and no claimed root-cause fix.
- 6 integrated Edge browser cases, 21 guards, full product lint plus final changed-code lint/whitespace passed. No Android/Docker/paid inference or real-user writes.
- Post-merge verification on `main`: 3 targeted suites / 25 tests, the Experience contract foundation guard and a clean working tree passed. Full implementation evidence, exact accounting, fixes and limits: `feat/extensions-skills-authoring-completed.md`.

No next implementation phase is assumed. On continuation, fetch first, read current main operating rules, the approved plan, latest handoff and completion record. Do not redo confirmed requirements or discard branch updates. The no-merge instructions below are archived history superseded by the user's later integration request. Do not describe the intermittent Git test as permanently fixed or imply all repository E2E/physical devices were validated.

---

## Archived predecessor — UI checkpoint

# Latest handoff — unified Extensions UI complete

Updated: 2026-09-27.

- Branch: `feat/native-experience-modes-capability-deepening`.
- HEAD: `cf6315abebdcb621b142e975d3ca0c3f61278a74` (pushed); all prior commits retained.
- Main stays `4dab353ac639d42eae885c79e18245267abd6820`. **No merge or branch deletion.**
- One Extensions entry now hosts Skill folders/path settings and external/local/built-in plugin management. Stable scope pickers, CAS draft retention, actual runtime status and script import/edit reuse existing authorities.
- Validation: 65 distinct targeted unit tests, Edge flows at 1440px / 320px, changed JS lint/whitespace and new-module locale checks. No full regression, Android/Docker/paid inference or real-user mutation.
- Next: initial Native P0–P9 authoring Skill content, followed by the deferred integrated broad verification once content is done.
- Record: `feat/extensions-ui-completed.md`. Current continuation prompt: `handoff/extensions-skills-authoring-foundation.md`.

---

## Archived predecessor — runtime checkpoint

# Latest handoff — browser extension runtime checkpoint complete

Updated: 2026-09-27. Stop before unified Extensions UI.

- Branch: `feat/native-experience-modes-capability-deepening`.
- HEAD: `c138e6eaf6c53f21e57068d2d3ff0cf0375b4e11` (pushed); all earlier commits retained.
- Main stays `4dab353ac639d42eae885c79e18245267abd6820`. **No merge or work-branch deletion.**
- Browser modules now activate with scoped SDK lifecycle, async disposal, typed Native adapters and existing storage/authentication. Initial imports/updates stay disabled. Shared Skill invocation remains complete.
- Validation: 59 distinct targeted unit tests, 1 isolated Edge browser import/runtime case, changed-file lint and whitespace. No full regression/guards, Android/Docker/paid inference or real-user mutation.
- Next: unified Extensions UI with stable scope pickers, script editing, Skill folders/path settings and removal of duplicate entrances. Initial Native authoring Skills follow; final broad validation remains deferred.
- Detailed current record: `feat/extensions-runtime-completed.md`. Current handoff and next prompt: `handoff/extensions-skills-authoring-foundation.md`.

---

## Archived predecessor — Skill invocation

# Latest handoff — Skill invocation checkpoint complete

Updated: 2026-09-27. Stop before the next phase.

- Branch: `feat/native-experience-modes-capability-deepening`.
- HEAD: `db0369deaf2b296f2e5361b88460fd047536f505` (pushed). All prior commits retained.
- Main remains `4dab353ac639d42eae885c79e18245267abd6820`. **Do not merge or delete the work branch.**
- Common Skill scope/path resolution now drives narrative, Studio and Agents with always/on-demand/off and existing denies. Narrative tool rounds remain inside the existing generation authority; no raw state exposure or new scheduler.
- Validation: 65 distinct targeted tests, changed-file ESLint and whitespace. No full regression/guard sweep, Android, Docker, paid inference or real-user data mutation.
- Next checkpoint: executable browser plugin/local script Host SDK and lifecycle. UI and initial Skills follow separately; broad verification is deferred until those are done.
- Detailed record: `feat/extensions-skills-invocation-completed.md`; current handoff and copyable prompt: `handoff/extensions-skills-authoring-foundation.md`.

---

## Archived predecessor — Extensions foundation

# Latest handoff — Extensions foundation complete; stopped for fresh chat

Updated: 2026-09-27. **User requested a checkpoint and takeover prompt. Stop now.**

- Branch: `feat/native-experience-modes-capability-deepening`.
- HEAD: `fda5907ed7e80db7c47c2baa168fdfb554ca1c7d` (pushed).
- P9 HEAD `88c1a776f91e0bab6becc7039e7978d56058ef85` and all earlier updates preserved.
- Main remains `4dab353ac639d42eae885c79e18245267abd6820`; **merge and branch deletion remain explicitly forbidden**.
- Approved separate plan: `feat/extensions-skills-authoring-foundation.md`.
- Full implementation/evidence/remaining work/next prompt: `handoff/extensions-skills-authoring-foundation.md`.

Completed current authoring API discovery, Skill supporting-file tools, persisted folder/path/script-scope contracts and initial authenticated extension install/storage/file-delivery backend. 5 suites / 48 tests, changed JS lint, whitespace and 3 guards passed. No executable browser plugin host, common Skill generation integration, unified UI or new authoring Skills yet. Do not present the full follow-up as completed.

Next fresh-chat checkpoint: Skill invocation resolution and narrative/Studio/Agents integration only, then validate/commit/push/handoff and stop again. Preserve the confirmed Global / Prompt preset / Work script scopes (Work = whole Package), per-path on-demand/always Skills, simple folders, one Extensions entry, and P0–P9 authoring focus.

---

## Archived predecessor — P9 merge hold

# Handoff — P9 complete; merge explicitly on hold

Updated: 2026-09-27. **P9 implementation and product verification complete. Stop feature work.**

- P9 HEAD: `88c1a776f91e0bab6becc7039e7978d56058ef85` (pushed).
- Incoming P8: `767d23a27019e0562c09548ad6ec50b39c8c4773`; every P0–P8 commit preserved.
- Current main: `4dab353ac639d42eae885c79e18245267abd6820` before integration.
- Work branch: `feat/native-experience-modes-capability-deepening`.
- Formal plan §0 now records concrete P9 boundaries.
- Completion/evidence: [P9 record](../feat/native-experience-p9-completed.md), [screenshots](../feat/native-experience-p9-evidence/).

Studio v2 now uses production versioned compile/render with existing Review/Commit; exact author previews isolate private Native slots. Scenario fixtures execute real installed Package/SessionCore in disposable storage with recorded/mock Task results and no provider calls. Play Health exposes anchored read-only diagnostics, capability negotiation and Task binding preflight; typed repair requires preview and explicit confirmation. Static UI migration is lossless and reviewed; unsupported dynamic/ledger schema migration remains rejected. Shared product controls retain P8 authenticated fixed seats, all-required submit-once Host commit/cancel and explicit refresh/presence. Default invocation IDs and private-slot fallback discovered by integration are fixed.

**197 suites / 2179 broad tests, 3 browser flows, 16 guards, changed JS lint and whitespace passed.** Final Shared controls closure passed 19 unit tests and its browser case again. Browser widths: 1440/320/390px. No Android/Docker/paid inference or physical/multi-device validation. P5–P8 authority boundaries remain intact; no direct Player↔Realm exchange, distributed lobby or general schema migration.

User steering on 2026-09-27 explicitly forbids merging or deleting the feature branch for now. P9 remains complete at the pushed HEAD above; main is unchanged. Next authorized work is inspection and multiple discussion rounds concerning vibe-coding API discoverability, Skill invocation routing, external/local Plugin semantics and a unified top-level Skill/Plugin entry. Do not create the new formal plan or implement changes until the user has discussed and confirmed the design. After agreement, create a separate plan before coding. The earlier merge instruction is superseded.

---

## Archived predecessor — P8

# Latest handoff — Native Experience P8 complete

Updated: 2026-09-27. **P8 complete and pushed; stop before P9**.

- Work branch: `feat/native-experience-modes-capability-deepening`.
- P8 HEAD: `767d23a27019e0562c09548ad6ec50b39c8c4773` (pushed).
- P7 `cb2abf54b7aacc0f16057ddc3ec1e2a98f24c111` and all P0–P7 commits are preserved.
- Main unchanged: `4dab353ac639d42eae885c79e18245267abd6820`. No merge or branch deletion.
- Formal plan §0 P8 records the concrete single-Host/typed-protocol boundaries.
- Completed record: `feat/native-experience-p8-completed.md`.
- Full contracts, limits, test evidence and copyable P9 prompt: `handoff/native-experience-modes-capability-deepening.md`.

P8 enables `shared-realm@1`: authenticated participant identity and separate display/seat identity; persistent non-rewindable ACL/epochs; Host/participant/observer roles; one canonical Session; atomic typed Shared Turn; Scene Scope/split-party isolation; deterministic Host RNG; transient Presence; bounded Snapshot+Cursor reconnect. Scoped opaque PlayerRefs and P6 display grants prevent raw state/Timeline/account/seed exposure. Package has no WebSocket, credentials or arbitrary network. Shared publications reuse Session Revision, typed lifecycle reducers and the same renderer/loader. No new World clone, Session store or scheduler exists.

Realm uses independent Native revision resources per owner/Package family, typed Commands, explicit views and participant grants. Participant writes use Host-derived record identity. Session↔Realm reuses P7 Transfer Saga, distinct markers/ledger and the same lineage, ownership, capacity/receipt/byte reservations, replay, resume and pre-publication compensation. Current reads/publications reconcile both Player and Realm; prepared transfers block Session write/delete/generation. A second Saga on the same Session is rejected before reservation, preventing cross-ledger mutual blocking.

Host `createNativeSharedClient` / `mountNativeSharedExperience` use authenticated HTTP and the existing exact Package loader/v2 renderer. Shared runtime/resource requests authenticate membership; Shared asset delivery is limited to Package closure. Client supports exact uncertain retry, cursor reuse, permission-clearing and stale/disposal checks. Existing local lifecycle transport gains Realm actions. All Message/Opening/single-write restrictions remain.

**46 new P8 tests + 364 existing targeted/adjacent tests passed: 410 distinct tests / 21 suites across selected runs.** Includes all 77 P7, 79 P6 and 89 P5 tests. Last Shared/Host/HTTP closure passed 55/55, then final server hardening passed 40/40. Changed JS lint, JS/MJS syntax, whitespace and 12 relevant guards passed. FS+SQLite, authenticated HTTP, actual v2 DOM and fault recovery have evidence. No full-repo, Android, Docker, browser visual, multi-device soak, paid inference, required CI or CI polling run. Historical runtime-UI generation-profiles baseline failure remains separate and untouched.

Boundaries: one coordinating Host and one Realm per owner/Package family; fixed declared seats; all-required/submit-once/Host commit-or-cancel; HTTP pull with Host-owned refresh cadence. No dynamic lobby, Host election, AFK/deadline policy, distributed consensus or public guild/trade/arena product. Cross-authority adapters cover Session↔Player and Session↔Realm with disjoint Session endpoints; direct Player↔Realm asset exchange and atomic three-ledger transactions are not implemented or implied. No private World/Session is forwarded into a remote mount. P9 owns product bindings, visual authoring, scenario tooling, Health/Repair/Migration and final integration.

Only P8 was authorized. Stop. Next continuation is **P9 only — Studio / Health / Productization / Final Integration**, #19/#20 plus capability negotiation UI, author preview and P0–P8 end-to-end integration. Fetch/read §0, both handoffs and the P8 record first; preserve every P5/P6/P7/P8 regression boundary. Only after P9 final verification may the work merge into main, integrated verification run and the completed feature branch be deleted. Use the detailed handoff's P9 prompt.

---

## Archived predecessor — P7

# Latest handoff — Native Experience P7 complete

Updated: 2026-09-27. **P7 complete and pushed; stop before P8**.

- Work branch: `feat/native-experience-modes-capability-deepening`.
- Final HEAD: `cb2abf54b7aacc0f16057ddc3ec1e2a98f24c111` (pushed).
- Implementation: `d5579740b0efa9fc76a5e0b22d54eac292351ae7`; final follow-up reserves Saga publication bytes. All P0–P6 commits and both P7 commits are preserved.
- Main unchanged: `4dab353ac639d42eae885c79e18245267abd6820`. No merge/deletion before P9.
- Formal plan §0 unchanged; no substantive architecture deviation.
- Completed record: `feat/native-experience-p7-completed.md`.
- Full contracts, limits, evidence and copyable P8 prompt: `handoff/native-experience-modes-capability-deepening.md`.

P7 enables `addon@1` and `player-continuity@1`. Content extension points accept bounded schema-validated data/skill/template catalogs. Exact Base + Community dependencies resolve to a self-contained immutable PackageVersion through the existing installer; Base source/current pointer are unchanged. Typed shareable resources need no full Add-on wrapper. Registry discovery is inert metadata, not executable content or install trust. Install/open recomputes the embedded exact Base/Community proof and rejects altered manifest/source/assets. Existing Data loading, renderer and permission paths are reused.

Player Continuity has an independent parent-linked revision graph in the existing Native resource engine, keyed by authenticated player handle and Package family. Typed Commands, closed schemas, HEAD CAS, immutable events/receipts, exact historical reads and display views are implemented. Session Branch restore never rewinds player authority; schema/command changes require an explicit future migration. Display views include exact player revision and relevant receipt refs and do not automatically enter Context/Tasks.

Cross-Authority Transfer moves typed lifecycle Application records through durable Intent → Session marker/publication → committed player Receipt. Escrow reserves lineage, receiving capacity, receipt slots and byte budget before debit. Ownership grants survive withdrawal/redeposit across Sessions. Fork/switch/restore and same-account old-save import reconcile external ownership; old records cannot remint a lineage. Exact retries or `transfer.resume` recover without a browser Promise; compensation releases escrow only before the Session side is published. Prepared transfers block Session mutation/deletion and actual generation, while Host recovery controls and static preflight remain available. The existing mount transport and v2 renderer expose read-only Continuity views and typed single-write actions.

**77 new P7 tests / 3 suites plus 326 existing tests / 20 suites passed**: **403 distinct tests / 23 suites across selected runs**. This includes all 79 P6 and 89 P5 tests. Final selected closures included 107/107, 44/44, 92/92; counts overlap. Continuity 38/38 passed again after the byte-reservation follow-up. Changed JS lint, JS/MJS syntax, whitespace and 11 relevant guards passed. Evidence includes FS+SQLite, authenticated HTTP, actual v2 DOM rendering, Host restart/retry, both transfer publication boundaries and save reconciliation.

No full-repo, Android, Docker, paid inference, external provider send, required CI, browser visual or physical-device run. Preserve P6 explicit information exposure, Truth/Belief/narrative separation, Actor availability, Rollup staleness and Open Loop/Memory separation; preserve every P5 settlement/Narrator/Scene/receipt/time/asset/disposal boundary. The historical runtime-UI guard's obsolete generation-profiles assertion is unchanged and separate from passing presentation/continuity guards.

Remaining boundaries: typed catalogs rather than third-party Base source/Knowledge/Prompt/Logic/UI patches; local-first single-Host player authority rather than cloud/distributed sync; Session Application record transfer rather than arbitrary World mutation; explicit recovery rather than a new scheduler. Visual authoring/marketplace/health/migration and broader final integration remain P9. P8 Shared identity/ACL, Presence, Realm and networking remain unimplemented.

Stop now. Next continuation is **P8 only — Shared Session & Realm Runtime**, #31: participant identity/ACL, shared turn, Presence, reconnect/Snapshot+Cursor, Scene Scope/split party, deterministic shared rule/RNG, Realm and Session/Player/Realm transaction semantics. Fetch first, read §0, both handoffs and the P7 record; preserve newer remote commits and all existing Transfer reservations/grants. Do not continue into P9 or merge main in that continuation. Use the detailed handoff's P8 prompt.

---

## Archived predecessor — P6

# Latest handoff — Native Experience P6 complete

Updated: 2026-09-27. **P6 complete and pushed; stop before P7**.

- Work branch: `feat/native-experience-modes-capability-deepening`.
- HEAD: `52e1750d9353631878c4b6561945e1eff275e5b4` (pushed); all P0–P5 commits preserved.
- Main unchanged: `4dab353ac639d42eae885c79e18245267abd6820`. No merge/deletion before P9.
- Formal plan §0 unchanged; no substantive architecture deviation.
- Completed record: `feat/native-experience-p6-completed.md`.
- Full contract/limits/evidence/boundaries and copyable P7 prompt: `handoff/native-experience-modes-capability-deepening.md`.

P6 enables data-projection/perspective v1 through optional informationRuntime. Explicit field sources and audience/exposure views read existing World, typed App records and canonical Timeline. World Truth, Actor Belief and narrative prose remain distinct. Participants and Actor POV filter threads/records; scope epochs and Revision/Branch/Package anchors close late results. Actor availability reads existing scope/typed boolean state; it gates execution, while Ready binding preflight remains static. Bounded directed graph queries use visible projected nodes/edges and explicit work/depth limits.

The existing Context compiler consumes granted projection items; player/display-only data, raw history/World and provider contributions do not automatically enter prompts. Knowledge keeps its target contract; optional existing Memory evidence requires exact visible Timeline provenance. Tasks have explicit projection context and typed input. P6 Packages reject unscoped supplemental messages and generic context-derived patches. Existing v2 renderer exposes the read-only projection root; no new renderer, Session, World, scheduler or storage authority exists.

Hierarchical Rollup uses the existing lifecycle command/receipt/CAS path and atri_context_derived. It retains leaf/Variant fingerprints, source refs, revision/branch/scope provenance, Task route/resource snapshots and separate Open Loop refs. Highest current parents suppress duplicate children. Stale or foreign-Branch artifacts are withheld; raw history/World/Memory authority and coverage cursors are not replaced. Open Loops stay in the commitments lane and do not become Memory facts.

**79 new P6 tests / 3 suites passed**, **89 P5 tests / 5 suites passed**, and **270 adjacent tests / 11 suites passed** (438 distinct accepted tests across separate runs). Final P6+Context closure passed **99/99**; counts overlap. Changed JS lint, JS/MJS syntax, whitespace and 10 relevant guards passed. Evidence includes FS+SQLite, real v2 DOM rendering, real Host/Task Context preview and Ready preflight without provider send. No full-repo, Android, Docker, paid inference, required CI, browser visual or physical-device run.

Preserve all P5 settlement/Narrator/Scene/receipt/time/Asset/disposal boundaries. P5 media decoding, speech/gamepad device evidence remains absent. Historical check-p5-native-runtime-ui.mjs is unchanged; its known obsolete generation-profiles assertion is separate from the passing presentation runtime guard.

Only P6 was authorized. Stop. Next continuation is **P7 — Add-on / Community Contract / Player Continuity / Cross-Authority Transfer** (#25/#30): exact composition/shareable resources, continuity revisions and transfer Intent/Receipt/Saga. Branch restore must not duplicate externalized assets; Add-ons must not patch Base Package source; revalidate/sanitize community installs. Keep P8 separate and main untouched until P9. Use the detailed handoff's P7 prompt after explicit continuation.

---

## Archived predecessor — P5

# Latest handoff — Native Experience P5 complete

Updated: 2026-09-27. **P5 complete and pushed; stop before P6**.

- Work branch: `feat/native-experience-modes-capability-deepening`.
- HEAD: `e21eb93489ae7fad4fb3874c532e797337f689d3` (pushed); all P0–P4 commits preserved.
- Main unchanged: `4dab353ac639d42eae885c79e18245267abd6820`. No merge/deletion before P9.
- Plan §0 unchanged. Detailed contract, tests, limitations and P6 prompt: `handoff/native-experience-modes-capability-deepening.md`.
- Completed-stage record: `feat/native-experience-p5-completed.md`.

P5 enables #17/#18/#21/#22/#23 through optional presentationRuntime v1. Typed Activity settlement commits App/World facts and the exact Observation before Narrator reads it. Existing durable lifecycle outbox/Task scheduler publishes canonical narrative and completion once, with separate render/model-delivery/authority receipts. Activity state/epochs/elapsed/tombstones use existing immutable SessionRevision; restore/fork and late-result boundaries remain intact.

Scene Cue IR uses the existing v2 renderer and exact inert AssetRef/Attachment closure; no model HTML/CSS/JS. Existing authenticated Asset delivery gains verified streaming/ETag/HEAD/ranges and bounded eager/lazy packs. Host adds gesture-gated local Actor Voice/fullscreen, focus restoration, gamepad samples and responsive/reduced-motion projection. Cleanup covers failed/superseded mounts, stale scopes and late fullscreen promises; elapsed reaches the existing typed temporal projection.

**89 P5 tests / 5 suites passed**, plus Ready/environment regressions and adjacent Session/save/Package/model/UI suites. Closure aggregate: **19 suites / 297 tests accepted**, including the corrected environment suite rerun alone after its initial expected-shape failure. Nine relevant guards, changed-file lint/syntax and whitespace passed. Isolated rollback restored 18 original hashes, removed 11 new files and passed the original **52/52** baseline tests. The actual worktree retains P5.

Known evidence boundary: real activation/renderer DOM and restarted Host scheduler tests passed; browser control returned `Codex auth token is unavailable`, so no browser visual/media/device validation is claimed. Historical `check-p5-native-runtime-ui.mjs` fails the same obsolete `generation-profiles` assertion on P4; it is separate from the new passing `check-native-presentation-runtime.mjs`. No full-repo, Android, Docker or paid inference run.

Stop before **P6 — Data Projection / Perspective / Scoped Information / Narrative Rollup** (#5/#26 and #16 context/perspective deepening). Preserve World Truth vs Actor Belief, projection vs authority, derived recall vs facts, and explicit context exposure. Continue only when requested; use the full P6 prompt in the detailed handoff. Main remains untouched until P9.

---

## Archived predecessor — P4

# Latest handoff — Native Experience P4 complete

Updated: 2026-09-27. **P4 complete and pushed; stop before P5**.

- Work branch: `feat/native-experience-modes-capability-deepening`.
- HEAD: `5beee588ef82fb4cb47d8dafc33526d190aadb15` (pushed). P3 `522386dda781bab752304adcdb98bf561c857c52` and P0–P2 preserved.
- Main unchanged: `4dab353ac639d42eae885c79e18245267abd6820`. No merge/deletion before P9.
- Plan §0 unchanged; no substantive design deviation.
- Full contract, limits, tests, boundaries and P5 takeover prompt: `handoff/native-experience-modes-capability-deepening.md`.

P4 enables #13/#28/#29/#32 and completes Opening lifecycle integration. The strict optional lifecycleRuntime contract reuses protected `atri_lifecycle` in existing SessionRevision snapshots for typed App records, scope epochs, World clocks, Workflow phase/node instances, automation cursors, Opening state, pending Task intents and deferred interactions. No second renderer, Session, scheduler or persistence.

SESSION_LOADED is distinct from EXPERIENCE_READY. Exact dependencies, read-only Task resource/model-capability binding preflight and projection/UI mount precede readiness. Failed/stale/historical mounts cannot run startup work. Opening confirmation Command + optional canonical Composer user input + completion publish atomically; restart/replay/fork does not double-apply facts or input. World ticks, revision logical time, wall time and explicitly supplied Activity elapsed are separate; Activity elapsed defaults null until a real Activity supplies it.

World Process catch-up uses existing Command/Rule/Reducer with atomic cursors and all/latest/skip policies. Scope suspend/thaw/archive preserves records and invalidates old epochs. A fresh P3 advisory proposal can be explicitly accepted into a declared Scheduled Interaction, then delivers a typed App Command at its WorldInstant, with cancel/stale boundaries. Workflow coordinates typed authorities without bypassing them. Scheduled Task intents resume via existing Task scheduler; completed results stay in `atri_task_results`. Conservative domain retention preserves active/pinned/referenced records; Task payload compaction retains replay tombstones. Canonical narrative/immutable Variant, provisional Narrator, semantic-only Interpreter, Task/role/binding separation and three receipt domains remain intact.

**386 new P4 tests / 7 suites passed**, plus targeted adjacent Task, Session, save/fork, Package, model Host, lifecycle, Opening/UI and Play suites. FS+SQLite, local fixtures/fake providers only. Changed JS lint/syntax/whitespace and seven relevant guards passed. Isolated full-diff rollback restored 15 original file hashes, removed 12 new files and passed the original **49/49** baseline tests. Actual worktree retains P4. No full repository/Android/Docker/paid model/required CI run; no live browser visual QA for this non-visual lifecycle change.

Boundaries: only declared lifecycle intents resume after restart, not provider streams/Promises; bounded pumps/drains continue on explicit/external wakes; compaction is revision-view retention, not physical GC; hard receipt caps fail closed. P6 owns deeper reference/projection/context work; P9 owns migration/health productization.

User authorized **P4 only**. Stop. Next continuation is **P5 — Activity / Media / Scene / Asset / Host Capability**, #17/#18/#21/#22/#23, typed Scene Cue IR, Activity Outcome → Narrative Handoff, exact Asset Pack/heavy delivery, Speech/Actor Voice, fullscreen/focus/gamepad/responsive capability negotiation. Read §0 and both handoffs; retain newer remote commits. Activity settlement must commit facts before Narrator observes them; model output must not be executable scene HTML/CSS/JS. Finish P5 on the same branch, push/update handoffs and stop before P6. Main remains untouched until P9.

---

## Archived predecessor — P3

# Latest handoff — Native Experience P3 complete

Updated: 2026-09-27. **P3 complete and pushed; stop before P4**.

- Work branch: `feat/native-experience-modes-capability-deepening`.
- HEAD: `522386dda781bab752304adcdb98bf561c857c52` (pushed); all P0–P2 commits preserved.
- Main unchanged: `4dab353ac639d42eae885c79e18245267abd6820`. No merge/deletion before P9.
- Normative plan: `feat/native-experience-modes-capability-deepening.md` §0, unchanged (no substantive design deviation).
- Full concrete contracts, limits, validation and P4 prompt: `handoff/native-experience-modes-capability-deepening.md`.

P3 implements strict Package Task/Variant/Slot/Turn declarations and exact resource closure; player-owned Slot bindings borrow captured model/connection/fallback lanes while preserving Task-owned Prompt/Generation/output/authority. It adds typed semantic Turn outcomes, authority-first and narrative-outcome finalize, bounded synchronous stages, inert Proposal Artifacts with explicit typed Apply/reject/stale/replay, and one Host scheduler for complete Turns, Model Tasks, Auxiliary Tasks and ordinary generations. Shared global/resource budgets, priority aging, backpressure, coalescing/supersede, streaming, retry, timeout, cancel and stale checks are Host-owned.

Native Play marks configured Turns provisional: autosave cannot publish streamed text and Stop restores canonical authority. Interpreter emits semantic proposals only; pinned Interpretation Mapping → existing Command/Rule/Reducer computes consequences. SessionCore atomically publishes narrative/projection/World/Event/receipt, keeping immutable Variants and separate model-delivery/authority/render domains. Completed task records reuse protected `atri_task_results` inside existing revision snapshots; save/fork/load semantics remain Native. No second renderer, Session or persistence.

Passed **362 distinct tests / 15 targeted and adjacent suites**, including FS+SQLite, real local HTTP fake providers, both Turn policies, atomic rollback/fork, Proposal Apply/replay/stale, authenticated operation controls, ordinary model Host regressions and provisional autosave/Stop. Changed JS lint, changed guard syntax/whitespace, A0/A3/A4/Experience/P2 and new P3 guards passed. No full-repo, Android, Docker, paid inference or required CI run. No new visual UI.

Boundaries: transient operations do not survive Host restart; detached jobs survive view closure, completed artifacts remain durable. P4 owns Session Application/ready/lifecycle integration, cross-restart policy and retention/compaction (current Task history cap 256 fails closed). P6 deepens Context/Perspective. P9 owns visual Slot/operation/proposal authoring. Future result sinks and P4+ capability versions remain unsupported.

The user authorized **P3 only**. Stop now. Next continuation: **P4 — Session Application / Temporal / Automation / Experience Workflow**, #13/#28/#29/#32 plus complete #14 lifecycle, Ready Barrier, Scoped lifecycle, scheduling, retention and World Process catch-up. Fetch and preserve newer feature commits; read main rules, §0 and both handoffs first. Finish P4 on this branch, push/update handoffs, stop before P5. Keep main untouched until P9.

---

## Archived predecessor — P2

# Latest handoff — Native Experience P2 complete

Updated: 2026-09-26. **P2 complete and pushed; stop before P3**.

- Work branch: `feat/native-experience-modes-capability-deepening`.
- HEAD: `1be87f0186d3f53c4bce8a7cc46a409e953ca46f` (pushed); P1 `24e75668b9cf739796ea4c679056391702a8973b` preserved.
- Main unchanged: `4dab353ac639d42eae885c79e18245267abd6820`; no merge or branch deletion before P9.
- Normative plan: `feat/native-experience-modes-capability-deepening.md` §0. Formal plan unchanged (no substantive design deviation).
- Detailed contracts, limits, test table and P3 prompt: `handoff/native-experience-modes-capability-deepening.md`.

P2 implements immutable first-class `Variant.projection`, canonical prose equality, P2 Turn Envelope with empty/reserved outcomes, pinned Package message templates checked before commit and during load, mount-local message UI, actionable attachments through P1 typed Commands/receipts, explicit historical fork, feed/latest/reader with narrative profiles, and read-only scoped-thread primitives. It reuses the existing v2 compiler/renderer, Native Conversation/prose formatter and SessionRevision persistence. Render receipts remain mount-local diagnostics, distinct from authority/model-delivery receipts.

Branch Graph/Reply Variant facade derives branch content ancestry rather than mutable swipes, with bounded search/timeline/preview/current/origin/detached states, previous/next/count and injected Native inspect/switch/retry/fork callbacks. History adds lightweight reachable-message summaries, not full snapshots per node. Explicit switch restores the complete branch head. P2 support enables only its four implemented capability versions; P3 features remain reserved.

Passed **563 distinct tests / 22 targeted and adjacent suites**, including FS+SQLite, save/import/export/fork/restore, pinned schema rejection, host Draft envelope commit, typed receipt replay, all three layouts, bounded historical UI, context/history and HTTP contracts. Changed-area ESLint/syntax/whitespace, A0/A3/A4/Experience (53 files)/new P2 guards and zh-CN/zh-TW localization passed. Real Edge 1440px/390px fixtures and screenshot inspection passed; independent rollback probes restored original copy behavior. No full-repo, Android, Docker, paid model or required CI run.

Intentional boundaries: thread mutation/lifecycle and Context/Perspective remain P4/P6; durable generic action/operation continuation is P3; Turn Envelope outcomes stay `[]` until typed P3 finalize exists. No background task/scheduler, authority-first/narrative-outcome implementation or automatic model repair was started.

The user authorized **P2 only**. Stop now. Next continuation: **P3 — Turn / Model Task / Auxiliary Operation Runtime**, #10/#12/#24/#27. Fetch and preserve newer feature commits; read main AGENTS/FORK, normative §0 and both handoffs before editing. Reuse P0–P2; do not re-review historical heavy cards. At P3 completion push the same branch, update both handoffs, stop before P4 and provide its takeover prompt. Keep main untouched and the work branch until P9.

---

## Archived predecessor — P1 (historical)

# Latest handoff — Native Experience P1 complete

Updated: 2026-09-26. **P1 complete and pushed; stop before P2**.

Work branch: `feat/native-experience-modes-capability-deepening`.
HEAD: `24e75668b9cf739796ea4c679056391702a8973b` (pushed).
Main unchanged: `4dab353ac639d42eae885c79e18245267abd6820`.
Plan: `feat/native-experience-modes-capability-deepening.md`, normative §0 Implementation Baseline v1.0, 32 capabilities, P0–P9 on one branch.
Detailed contract/limits/test record: `handoff/native-experience-modes-capability-deepening.md`.

P1 adds isolated Component v2 UI documents, strict Form/local state/preferences, pure expressions/templates, immutable Package Data, keyed Collection basics, shared Native Composer submission, Action receipts/idempotency/typed compensation, mutation lowering into existing IR, and basic conditional Opening/Wizard. V1 remains on its existing renderer. Component/Hybrid/Full share the same Host. UI state uses existing settings; device scope uses a Host-owned non-secret browser identity. World/receipt facts still commit in one Native SessionRevision. No Package execution or second persistence authority was introduced.

Enabled only implemented P1 feature versions; all P2–P9 requirements still fail closed when unsupported. Formal plan unchanged: no substantive architecture deviation. See detailed handoff for exact schemas, scopes, hard limits and phase boundaries. Opening completion remains mount-local until P4 lifecycle work; durable generic operation recovery belongs to P3.

Passed **187 distinct tests / 19 targeted and adjacent suites**, including FS+SQLite Session Core, install/reopen/HTTP Data, atomic receipts/replay/fork/compensation, v1/v2 UI and Composer. Changed-area ESLint/syntax/whitespace, A0/A3/A4/Experience (52 files) guards and zh-CN/zh-TW localization passed. Real Edge 1440px/390px fixture checks passed; screenshots inspected. No full-repo, Android, Docker, paid inference or required CI run.

User explicitly authorized P1 then stop, not P2. Next authorized stage needs a new continuation: **P2 — Message Projection / Conversation / Branch Presentation** (#9/#11/#15 and #16 presentation/thread basics), message-local UI, actionable attachments, narrative presentation profile and Branch/Reply Variant facade. Keep Variants immutable, canonical narrative distinct from projection, historical actions read-only or explicit fork, render receipts distinct from authority/model delivery. Reuse P1 seams; do not implement P3 bodies.

Fetch first and preserve newer work-branch commits; read main AGENTS/FORK, formal §0, both handoffs, current code/tests. At P2 completion commit/push same branch, update both handoffs, stop before P3. Do not merge main or delete the branch before P9 final verification.

---

# Previous handoff — Native Experience P0 complete

Updated: 2026-09-26.
Status: **P0 complete and pushed; stopped before P1**.

Main baseline: `4dab353ac639d42eae885c79e18245267abd6820`.
Work branch: `feat/native-experience-modes-capability-deepening`.
Work branch HEAD: `349287c166bff9344bb9bbabc812a799b9cb8534` (pushed).
Plan: `feat/native-experience-modes-capability-deepening.md`.
Plan baseline commit: `6308c36e1a10b4c406f1ef5affcabe2eae545d71`.
Detailed handoff: `handoff/native-experience-modes-capability-deepening.md`.

Discussion Draft v2.3 has been normalized into **Implementation Baseline v1.0**.
The top §0 of the plan is normative and supersedes stale earlier Round wording.
The capability inventory is 32 items and implementation is split into P0–P9
on one persistent work branch.

P0 added optional strict package-level `runtime.experienceContract` v1, shared
32-feature version vocabulary with reserved vs supported versions, exact JSON
AssetRef declarations, Project/Package/Descriptor validation and Host support
checks before browser activation. Existing packages without the field and
Component Model v1 remain unchanged. Only `component-model@1` is currently
supported in the new vocabulary; required future features fail closed. Optional
reserved features are metadata only. No feature bodies or new storage authority
were implemented. EntryPoint cannot override package requirements.

Fixed the A3 guard's obsolete path filter, which previously scanned zero active
Experience files. Added a recursive Experience contract foundation guard and
strict negative fixtures plus build/install/reopen coverage. Formal plan remains
unchanged because P0 found no substantive architecture conflict.

Passed: 138 distinct tests across 10 targeted/adjacent suites (including FS and
SQLite Session Core), changed-JS ESLint, changed-MJS syntax, whitespace, and
A0/A3/A4 plus the new Experience contract foundation guard (47 files). Initial
SQLite binding absence was repaired locally, then all 22 Session Core tests
passed. No binaries/config/lockfile changes committed. Exact suites and resolved
failures are recorded in the detailed task handoff.

Next stage: **P1 — Component v2 / Form / Local State / Action / Opening
Foundation**. Cover #1/#2/#3/#4/#6/#7/#8 and basic #14. Preserve v1, keep UI state
outside World Revisions, use existing typed authority for Form/Action, and enable
only capability versions actually implemented. Do not implement P2+ bodies.

Validation policy: targeted/adjacent checks for touched code, changed-area lint
and relevant guards. No habitual full-repo suite, Android, Docker or paid model
calls. Codex Astra does not need GitHub CI to complete a phase unless CI/workflow
behavior itself changes. Fix normal failures autonomously. At P1 completion,
commit+push, update plan only for substantive design changes, update both handoff
files, stop, and provide the P2 takeover prompt. Do not merge main before P9.

---

# Latest handoff — Collapsible prompt editors

Updated: 2026-09-25 (Asia/Shanghai).
Main: `4dab353ac639d42eae885c79e18245267abd6820` (pushed).
Implementation: `dc10712b791e0d9cc14e39b3b359d6d08e0d3aae`.
Status: integrated tree matches task tree; temporary branch deleted.

Prompt program/module sections and individual stages default collapsed. Native
details support independent expansion; summaries show counts/status. Expansion
survives rerenders/editor mode changes/preset saves. New stages expand; local
semantic validation reveals the corresponding section. Save/Back remain outside
disclosures. Prior stage ordering and insertion-position fixes are retained.

Passed: 15 unit tests, four Edge desktop/mobile scenarios, localization and
whitespace checks. ESLint: no errors, two pre-existing test warnings. Screenshots
inspected. No Android/Docker or inference. Record: `feat/prompt-editor-folds.md`.
User authorized publication. This task and the preceding two tasks were pushed
to main and docs together; remote main HEAD was verified against local main.

---
# Previous handoff — Prompt stage order and insertion position

Updated: 2026-09-25 (Asia/Shanghai).
Main: `19b0aaf6b8be79cb77e0696d957a9e15ae0fabf6` (local, not pushed).
Implementation: `3774921c7c8b20a6a662bcdfd533dd12c6b185d5`.
Status: complete; integrated tree matches verified task tree; task branch deleted.

Stage module lists now share the compiler's existing ordering rule. Adding a
module preserves the picker viewport position and focus instead of jumping to
the stage ID input. User explicitly withdrew global insertion/unique ownership
and cross-stage movement; module stage constraints remain unchanged.

Passed 60 targeted unit tests, two Edge scenarios at 1440/390px, changed-file
ESLint, native localization and whitespace checks. No Android/Docker or inference.
Record: `fix/prompt-stage-order-position.md`. This and preceding loading changes
remain local; no push was performed.

---
# Previous handoff — Native loading and module category refresh

Updated: 2026-09-25 (Asia/Shanghai).
Main: `b3beb59dd1cb0d37e6329b6d669448aba213753c` (local, not pushed).
Implementation: `32f9b539c95f130340725e88e6c840bda3edc3c9`.
Status: complete; integrated tree matches tested task tree; temporary branch deleted.

Runtime lists no longer await the full resource inventory; setup checks load on
expansion and exact choices load on route edit. Revision lists use one grouped
scan. Build summaries avoid per-project Git synchronization. Session listings
share exact package validation per request and count saves in one scan. Module
category moves repaint from the committed snapshot while configuration observers
refresh, without rebuilding global search after each edit.

Validation: 41 Jest tests, five Edge scenarios, ESLint, native localization and
whitespace checks passed. Runtime/Build screenshots inspected. No Android/Docker
or inference. Production-scale latency not benchmarked. Main/docs remain local.
Full record: `fix/native-workspace-loading.md`.

---
# Previous handoff — Prompt module category navigation

Updated: 2026-09-25 (Asia/Shanghai).
Main: `e42bd5043939af90583b473c22b68c4b57ca0aaf` (pushed).
Implementation: `31f91f783e5183eab7d7ad5b4a7d950b957eb5d0`.
Status: complete and pushed; verified task tree equals integrated main tree.
Temporary branch deleted. Working trees clean after handoff commit.

Prompt Modules now uses a hierarchical category filter including descendants.
Top ellipsis creates categories/modules; category ellipsis renames/moves/deletes;
module ellipsis edits/moves/deletes. Returning from an editor preserves category,
scroll position and focus. New modules inherit the selected category. Existing
persistence, export/import and deletion ownership rules remain unchanged.

Validation: 13 Jest tests, 5 Edge scenarios (desktop 1440px and mobile 390px),
plus final desktop regression rerun passed. Screenshots inspected. ESLint,
localization coverage and whitespace checks passed. No Android/Docker/inference.
Full record: `fix/prompt-module-category-navigation.md`.

User subsequently authorized pushing; main and docs were pushed and remote HEADs verified. The prior preset cleanup below was successfully
pushed to main and docs before this task began.

---
# Previous handoff — Native orchestration presets and retired asset cleanup

Updated: 2026-09-25 (Asia/Shanghai).
Main: `5fce29a6b64af519e7d89ee888acedee6de40ba7`.
Prompt implementation: `1a3e891230eb15b65af0772a1879f97cc77db8d7`.
Cleanup implementation: `40dbf651b4cbd2abe4486c30a485cba9c87e0fbf`.
Status: locally integrated and verified; main and docs are being published together.
User explicitly authorized pushing, superseding the earlier no-push hold.

## Outcome

All four fixed orchestration presets use native World/Session authority,
Knowledge/Package references and Runtime Route-aware prompts. Spec/Loop/Agenda
remain advisory; Director writes final prose. Revision 2 restores fixed defaults
without changing user copies or route/session bindings. Director is self-contained
and no longer requires named method skills. Spec no longer bans normal analysis
words or legitimate numeric/structured output.

Deleted unused public/presets/plugin-only.json, agent-non-director.json and
agent-director.json after confirming no runtime consumers. Removed obsolete asset
content tests and import-button translations; corrected the Agenda guide. Native
Workspace uses Runtime Routes. Existing imported personal copies are untouched.

## Verification

Prompt work: 37 targeted tests across six suites passed before cleanup.
Cleanup: 18 targeted tests across three suites passed after removing two obsolete
asset tests. Changed-file ESLint, native localization coverage (zh-CN / zh-TW),
and whitespace checks passed. Integrated main tree matches verified task tree.
Temporary branches deleted locally. No paid inference, Android, Docker or full
repository suite; prompt quality has not been evaluated with real model calls.

## Durable records

- `fix/native-orchestration-presets.md`: four-mode prompt design and first audit.
- `chore/remove-retired-agent-presets.md`: cleanup, authorization and checks.
- `feat/native-regex-scopes.md`: previous Regex integration, main df03dedbd.

No changes to the prior Regex, Knowledge or native Prompt resource contracts.
