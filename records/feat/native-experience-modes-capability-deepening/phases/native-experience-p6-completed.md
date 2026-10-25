# Completed — Native Experience P6

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../../../README.md#122-minimal-validation-and-runtime-checks)。

Updated: 2026-09-27. **P6 complete and pushed; stop before P7**.

- Work branch: `feat/native-experience-modes-capability-deepening`.
- Work HEAD: `52e1750d9353631878c4b6561945e1eff275e5b4` (pushed).
- Incoming P5 baseline: `e21eb93489ae7fad4fb3874c532e797337f689d3`; all P0–P5 history preserved.
- Main unchanged: `4dab353ac639d42eae885c79e18245267abd6820`.
- Initial docs HEAD: `c5fb623528778a42b8fe334157cd736039a05c5d`.
- Only P6 was authorized. No P7 implementation, main merge or branch deletion.
- Formal plan §0 unchanged: implementation reuses the existing authorities and follows its explicit exposure rules; no substantive architecture deviation.

## Implemented

1. **Versioned scoped information contract.** Optional `experienceContract.informationRuntime` v1 enables `data-projection@1` and `perspective@1`. No executable query language, URLs or arbitrary state paths. P7/P8 feature versions remain reserved.
2. **One authority, many projections.** Sources select fields from existing World state, typed lifecycle Application records or canonical Timeline. Application source semantics distinguish facts, beliefs, threads, Open Loops and recall records; canonical Timeline prose is explicitly `narrative`, not World Truth. Beliefs retain actor, channel and epistemic status; typed publication rejects invalid statuses, unknown actors and unknown thread participants. No NPC World clone or new persistence exists.
3. **Perspective and scoped threads.** Views explicitly declare narrator/actor/player/task audience, source IDs, display/context exposure, optional exact POV Actor and bounded output. Actor-owned records and thread participants filter before projection. Player-only views cannot declare context exposure. Scope suspension/archive hides records; active scope epochs and Session/Package/Revision/Branch anchors accompany results. Host projection reads are read-only, work with historical snapshots and reject disposed mounts.
4. **Actor availability.** Declared Actors use existing scope status and an optional boolean in a typed Application record. Availability does not create Presence/World authority. Context/UI projection is empty for an unavailable POV Actor; actual generation/preview rejects that Actor before provider send. Static Ready Task binding preflight remains possible while an Actor is absent, avoiding a startup deadlock.
5. **Bounded graph query.** Directed breadth-first traversal uses declared projected Application node/edge sources. It does not perform unbounded graph walks or construct a second graph database.
6. **Explicit Context integration.** For opted-in Packages, the existing Context compiler selects scoped projection items instead of implicitly adding raw World, journal, variables, history, legacy derived lanes or provider contributions. Optional Knowledge still passes the existing actor-target/visibility contract. Existing Memory evidence requires `memory:true` and complete provenance to visible Timeline messages at the exact current Branch/Revision; missing/stale/foreign provenance fails closed. Open Loops use the existing commitments lane, separate from memory. Legacy Packages without informationRuntime keep their previous behavior.
7. **Actual model Host closure.** Package Tasks can declare `context: ['projection', ...]`; the Host selects the exact Task view, preserves explicit typed Task input and retains player-owned routes/bindings. Unscoped supplemental `messages` are rejected for P6 Packages so a later Host concatenation cannot bypass Perspective. Supplemental data must enter through a declared Task input; workflows with intermediate Turn stages should use an explicit Narrator Task. Existing P5 Observation input remains typed, committed and independent of this projection permission.
8. **Hierarchical Narrative Rollup.** `information.rollup` goes through the existing lifecycle command, expected-HEAD transaction and authority receipt, and writes existing `atri_context_derived.narrative`. Artifacts retain source IDs/record IDs, exact leaf/Variant fingerprints, source Revision/Branch, Session/Package identity, scope epochs, Timeline coverage, separate Open Loop references and Host or completed Task provenance. Exact source record IDs participate in existing conservative retention protection.
9. **Derived recall remains derived.** Rollups do not modify World, journal, App records, Memory or their coverage cursors. Highest valid parent artifacts suppress duplicate child recall. Open Loop closure changes its separate projected status rather than turning it into a happened fact. Raw runtime writes/deletes cannot bypass typed derived publication in P6 Packages. Retry reuses existing lifecycle receipts.
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
- Scene artifacts require non-Open-Loop leaf IDs; higher levels require immediately preceding-level children. Child Open Loop references must be preserved.
- Hard bounds: 32 sources; 16 views; 64 Actors; 16 graphs; 4096 scanned source records; 128 items and 32768 characters per view; depth ≤4 and ≤256 scanned edge occurrences per query; 64 leaf refs, 32 children and 128 retained rollups. Source fingerprint and artifact JSON budgets apply independently. Exhaustion fails closed; this is not physical GC.

## Remaining boundaries

Projection grants are Package contracts, not a new multi-user ACL system; participant authentication/Shared Realm remains P8. Belief acquisition and thread/Open Loop changes use authored typed App Commands, not an automatic omniscient knowledge propagation engine. Memory recall keeps its existing provider/store; P6 neither promotes promises into facts nor invents memory from rollups. Cross-Branch rollups require a new derivation; inherited leaf records remain available.

Rollup retention is bounded and conservative, without new automatic compression scheduling or physical GC. Compression may be Host-authored or consume an existing completed Task result; no new Model role or paid inference was introduced. Unscoped legacy supplemental messages and generic derived writes are deliberately rejected only for opted-in informationRuntime Packages. Authoring/health UI and broader end-to-end productization remain P9. P7 remains entirely unimplemented.
