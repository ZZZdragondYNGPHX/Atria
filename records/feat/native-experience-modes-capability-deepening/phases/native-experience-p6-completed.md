# Completed — Native Experience P6

Updated: 2026-09-27. **P6 complete and pushed; stop before P7**.

- Work branch: `feat/native-experience-modes-capability-deepening`.
- Work HEAD: `52e1750d9353631878c4b6561945e1eff275e5b4` (pushed).
- Incoming P5 baseline: `e21eb93489ae7fad4fb3874c532e797337f689d3`; all P0–P5 history preserved.
- Main unchanged: `4dab353ac639d42eae885c79e18245267abd6820`.
- Initial docs HEAD: `c5fb623528778a42b8fe334157cd736039a05c5d`.
- Only P6 was authorized. No P7 implementation, main merge or branch deletion.
- Formal plan §0 unchanged: implementation reuses the existing authorities and follows its explicit exposure rules; no substantive architecture deviation.

## Implemented

1. **Versioned scoped information contract.** Optional `experienceContract.informationRuntime` v1 enables `data-projection@1` and `perspective@1`. Strict plain JSON, unknown-field rejection, closed source/view/Actor/graph declarations, fixed field paths, typed discriminator schemas and exact Package Actor/World closure are checked through existing Package validation. No executable query language, URLs or arbitrary state paths. P7/P8 feature versions remain reserved.
2. **One authority, many projections.** Sources select fields from existing World state, typed lifecycle Application records or canonical Timeline. Application source semantics distinguish facts, beliefs, threads, Open Loops and recall records; canonical Timeline prose is explicitly `narrative`, not World Truth. Beliefs retain actor, channel and epistemic status; typed publication rejects invalid statuses, unknown actors and unknown thread participants. No NPC World clone or new persistence exists.
3. **Perspective and scoped threads.** Views explicitly declare narrator/actor/player/task audience, source IDs, display/context exposure, optional exact POV Actor and bounded output. Actor-owned records and thread participants filter before projection. Player-only views cannot declare context exposure. Scope suspension/archive hides records; active scope epochs and Session/Package/Revision/Branch anchors accompany results. Late result checks reject changed identities or epochs. Host projection reads are read-only, work with historical snapshots and reject disposed mounts.
4. **Actor availability.** Declared Actors use existing scope status and an optional boolean in a typed Application record. Availability does not create Presence/World authority. Context/UI projection is empty for an unavailable POV Actor; actual generation/preview rejects that Actor before provider send. Static Ready Task binding preflight remains possible while an Actor is absent, avoiding a startup deadlock.
5. **Bounded graph query.** Directed breadth-first traversal uses declared projected Application node/edge sources. It handles cycles, includes only visible endpoints, returns truncation, checks optional result anchors and has hard depth/work/output limits. It does not perform unbounded graph walks or construct a second graph database.
6. **Explicit Context integration.** For opted-in Packages, the existing Context compiler selects scoped projection items instead of implicitly adding raw World, journal, variables, history, legacy derived lanes or provider contributions. Optional Knowledge still passes the existing actor-target/visibility contract. Existing Memory evidence requires `memory:true` and complete provenance to visible Timeline messages at the exact current Branch/Revision; missing/stale/foreign provenance fails closed. Open Loops use the existing commitments lane, separate from memory. Legacy Packages without informationRuntime keep their previous behavior.
7. **Actual model Host closure.** Package Tasks can declare `context: ['projection', ...]`; the Host selects the exact Task view, preserves explicit typed Task input and retains player-owned routes/bindings. Unscoped supplemental `messages` are rejected for P6 Packages so a later Host concatenation cannot bypass Perspective. Supplemental data must enter through a declared Task input; workflows with intermediate Turn stages should use an explicit Narrator Task. Existing P5 Observation input remains typed, committed and independent of this projection permission.
8. **Hierarchical Narrative Rollup.** `information.rollup` goes through the existing lifecycle command, expected-HEAD transaction and authority receipt, and writes existing `atri_context_derived.narrative`. Scene → Chapter → Arc → Campaign hierarchy validates current child artifacts and selected leaf evidence. Artifacts retain source IDs/record IDs, exact leaf/Variant fingerprints, source Revision/Branch, Session/Package identity, scope epochs, Timeline coverage, separate Open Loop references and Host or completed Task provenance. Task compression also checks that its Perspective cannot exceed the destination view. Exact source record IDs participate in existing conservative retention protection.
9. **Derived recall remains derived.** Rollups do not modify World, journal, App records, Memory or their coverage cursors. Highest valid parent artifacts suppress duplicate child recall. Leaf edits, Variant changes, missing sources, scope epoch changes and foreign Branches invalidate recall; historical snapshots retain their earlier valid view. Open Loop closure changes its separate projected status rather than turning it into a happened fact. Raw runtime writes/deletes cannot bypass typed derived publication in P6 Packages. Retry reuses existing lifecycle receipts.
10. **Existing renderer and Host.** `projection.<viewId>` is a read-only expression root in the existing v2 renderer. The existing capability API exposes `getInformationProjection`, `queryInformationGraph` and `getActorAvailability`. No new rendering engine, Session, World, scheduler or database was introduced.

## Concrete authoring and runtime seams

- Contract: `public/shared/native-information-contract.js`.
- Projection/query/availability: `public/shared/native-information-runtime.js`.
- Rollup publication: `src/native/information-authority.js`.
- Authoring fixture: `tests/native/helpers/information-fixture.js`.
- Root declaration: `{schemaVersion:1,sources,views,actors,graphs}`; requires the existing lifecycleRuntime.
- Source: `{id,kind,semantic,scopeId,fields,...}`. Kind is `application`, `world` or `timeline`. `fields` is a list of explicit path-segment arrays; no computed or wildcard paths. Application sources refer to `domainId`; World sources to exact `worldId`.
- Belief source requires `actorField`, `statusField`, `channelField`; thread requires `participantsField`; Open Loop requires `statusField`. Optional `actorField` can scope other App sources as well.
- View: `{id,audience,actorId?,taskId?,sources,exposure,knowledge,memory?,maxItems,maxCharacters}`. One context view per exact audience target. `knowledge` is explicit; `memory` defaults denied. Narrator may use an Actor POV without cloning that Actor's World.
- Graph: `{id,viewId,nodeSource,edgeSource,fromField,toField,maxDepth,maxEdges}`. Edges name record IDs within the declared node source. No hidden endpoint is returned.
- Existing session command route: `{type:'lifecycle',invocationId,action:{kind:'information.rollup',id,viewId,anchor,level,sourceIds,childIds,openLoopRefs,content,taskInvocationId?}}`, with existing outer `expectedRevisionId`.
- Scene artifacts require non-Open-Loop leaf IDs; higher levels require immediately preceding-level children. Child Open Loop references must be preserved. Completed Task compression validates exact current stored result, text and compatible Perspective; captures Task/Variant, route, Prompt/Generation refs and execution/context snapshot hashes where present.
- Hard bounds: 32 sources; 16 views; 64 Actors; 16 graphs; 4096 scanned source records; 128 items and 32768 characters per view; depth ≤4 and ≤256 scanned edge occurrences per query; 64 leaf refs, 32 children and 128 retained rollups. Source fingerprint and artifact JSON budgets apply independently. Exhaustion fails closed; this is not physical GC.

## Validation actually executed

**79 P6 tests / 3 suites passed:**

| Suite | Tests | Evidence |
| --- | ---: | --- |
| `native/information-runtime-p6.test.js` | 55 | Contract, field/participant isolation, bounded graph, exact anchors, Context/Memory gating, hierarchy, stale source/Variant/epoch/Branch, Open Loop separation |
| `native/information-session-p6.test.js` | 22 | FS + SQLite install/create/reopen, typed atomic rejection, retry, history/fork, actual Host preview, exact Task view, Ready preflight, Task compression provenance |
| `game-runtime/information-ui-p6.test.js` | 2 | Real `mountUiDocument` DOM render/refresh/disposal and lifecycle Host facade |

**P5 regression: all 89 tests / 5 suites passed:** `activity-runtime-p5`, `presentation-contract-p5`, `asset-delivery-p5`, `presentation-host-p5`, `activity-host-p5`. Its 2 Host tests also passed after the final preflight placement correction. Existing assertions about future reserved capabilities were updated to P7+; P5 execution assertions were retained.

**Adjacent regression: 270 tests / 11 suites passed in one selected run:** `native/context-compiler.test.js`, `context-derived.test.js`, `context-history.test.js`, `lifecycle-runtime-p4.test.js`, `task-runtime-p3.test.js`, `model-prompt-runtime-p4.test.js`, `runtime-descriptor.test.js`, `package-build-install.test.js`; `game-runtime/package-loader.test.js`, `ui-v2.test.js`, `lifecycle-client-p4.test.js`.

Final selected closure after refinements: P6's 3 suites plus existing Context compiler/derived suites, **99/99 passed**. These overlap the counts above. Accepted distinct coverage is **438 tests / 19 suites**, not a claim that one command ran all 438 together. Initial failures in new tests exposed fixture API/polyfill/binding setup and the availability/preflight distinction; they were corrected and the affected suites rerun successfully.

- Commands used `npm --prefix tests run test:unit -- --runInBand <selected suites> --silent --verbose=false`, with MySQL/Postgres test harnesses disabled; actual storage runs were FS and SQLite.
- All modified/new JS passed ESLint. All changed/new JS/MJS passed `node --check`; staged/unstaged whitespace checks passed.
- **10 guards passed:** A0 authoring, A3 cutover, A4 Experience, Experience foundation, message presentation, Task runtime, lifecycle runtime, presentation runtime, new information runtime, Native generation (`check-p4-native-generation.mjs`).
- DOM evidence covers the real v2 renderer. Generation evidence covers real Host/Context/route preview and Ready preflight, with no provider send or Secret resolution. It does not prove real model output quality.
- No full-repository, Android, Docker, paid-model or required-CI run. No browser visual QA or physical-device test was performed for P6. P5's previously unverified media decoding, audible speech and physical gamepad boundaries remain unverified.
- Historical `check-p5-native-runtime-ui.mjs` was not rerun or edited; its known P4-baseline `generation-profiles` failure remains distinct from the passing presentation runtime guard.

## Remaining boundaries

Projection grants are Package contracts, not a new multi-user ACL system; participant authentication/Shared Realm remains P8. Belief acquisition and thread/Open Loop changes use authored typed App Commands, not an automatic omniscient knowledge propagation engine. Memory recall keeps its existing provider/store; P6 neither promotes promises into facts nor invents memory from rollups. Exact current-source checks deliberately favor withholding stale recall over reusing potentially wrong material. Cross-Branch rollups require a new derivation; inherited leaf records remain available.

Rollup retention is bounded and conservative, without new automatic compression scheduling or physical GC. Compression may be Host-authored or consume an existing completed Task result; no new Model role or paid inference was introduced. Unscoped legacy supplemental messages and generic derived writes are deliberately rejected only for opted-in informationRuntime Packages. Authoring/health UI and broader end-to-end productization remain P9. P7 remains entirely unimplemented.
