# Handoff — P9 complete; merge explicitly on hold

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../../../README.md#122-minimal-validation-and-runtime-checks)。

- P9 HEAD: `88c1a776f91e0bab6becc7039e7978d56058ef85` (pushed).
- Incoming P8: `767d23a27019e0562c09548ad6ec50b39c8c4773`; every P0–P8 commit preserved.
- Current main: `4dab353ac639d42eae885c79e18245267abd6820` before integration.
- Work branch: `feat/native-experience-modes-capability-deepening`.
- Formal plan §0 now records concrete P9 boundaries.
- Completion/evidence: [P9 record](../phases/native-experience-p9-completed.md), [screenshots](../evidence/p9/).

Studio v2 now uses production versioned compile/render with existing Review/Commit; exact author previews isolate private Native slots. Scenario fixtures execute real installed Package/SessionCore in disposable storage with recorded/mock Task results and no provider calls. Play Health exposes anchored read-only diagnostics, capability negotiation and Task binding preflight; typed repair requires preview and explicit confirmation. Static UI migration is lossless and reviewed; unsupported dynamic/ledger schema migration remains rejected. Shared product controls retain P8 authenticated fixed seats, all-required submit-once Host commit/cancel and explicit refresh/presence. Default invocation IDs and private-slot fallback discovered by integration are fixed.

 Browser widths: 1440/320/390px. P5–P8 authority boundaries remain intact; no direct Player↔Realm exchange, distributed lobby or general schema migration.

User steering on 2026-09-27 explicitly forbids merging or deleting the feature branch for now. P9 remains complete at the pushed HEAD above; main is unchanged. Next authorized work is inspection and multiple discussion rounds concerning vibe-coding API discoverability, Skill invocation routing, external/local Plugin semantics and a unified top-level Skill/Plugin entry. Do not create the new formal plan or implement changes until the user has discussed and confirmed the design. After agreement, create a separate plan before coding. The earlier merge instruction is superseded.

---

# Handoff — Native Experience P8 complete

Updated: 2026-09-27. **P8 complete and pushed; stop before P9**.

- Branch: `feat/native-experience-modes-capability-deepening`.
- Incoming P7 HEAD: `cb2abf54b7aacc0f16057ddc3ec1e2a98f24c111`.
- P8 HEAD: `767d23a27019e0562c09548ad6ec50b39c8c4773` (pushed).
- All P0–P7 commits, including the P7 byte-reservation follow-up, are preserved.
- Main remains `4dab353ac639d42eae885c79e18245267abd6820`; no merge or branch deletion.
- Initial docs HEAD: `252f5ca8b6b531e5c1e0899cf352f382aae1a4d9`.
- Formal plan §0 P8 now records the concrete single-Host/typed-protocol boundaries below. Historical capability examples are not silently promoted into implemented marketplace, distributed consensus or universal exchange features.

## Implemented

1. **Strict Shared contract.** `sharedRuntime` v1 enables `shared-realm@1`. Seats bind exact existing Actors, lifecycle scopes, explicitly granted P6 display views and typed rule IDs. Views stay within the seat's Scene Scope. Optional Realm read/Command grants name declared domains and Commands. Component, Hybrid and Full use the same capability contract.
2. **Authenticated identity and ACL.** Existing server authentication supplies the principal; request bodies cannot select the acting account. A Session owner enables sharing and grants fixed seats to authenticated local account handles. Host, participant and observer are capability roles. Public projections use scoped opaque `PlayerRef` IDs and `authenticated-local` trust, separately from seat/Actor identity. Host administration does not expose arbitrary World snapshots or reducer replacement. `atri_shared_access` and its immutable revisions use the existing Native resource engine; revocation and ACL epochs survive Session Branch restore.
3. **One canonical Session.** Shared inputs, Turn state and typed outcome evidence live in protected `atri_shared` within existing immutable Session revisions. There is no participant World clone, alternate Session database or merge of client snapshots. The server returns only the seat's granted P6 projections, its Scene peers, safe Turn/receipt metadata and explicitly granted Realm views. Raw Session states, raw Timeline, account handles, seed and secrets are not part of a Shared snapshot.
4. **Shared Turn protocol.** Host opens a Turn for an active scope/epoch and freezes a stable seat roster plus ACL epoch/Branch. Every active participant submits once; observers cannot submit. Host commits only after every roster slot is filled, or explicitly cancels. Inputs use a declared App Command schema and cannot select arbitrary record IDs; records are seat-bound. Resolution reuses `prepareLifecycle` and the existing Command/Event/Reducer path, applying inputs in ASCII seat order and publishing all facts/evidence once in one Session Revision. Failed resolution publishes no partial record or receipt.
5. **Scene Scope / split party.** Each scope can retain its own pending Turn. Each participant sees only its Scene peers and declared information sources. Both scenes settle into the same Session revision graph. Cancellation can close a stale Turn without applying its inputs.
6. **Deterministic shared rule/RNG.** Rules invoke existing typed App Commands. Seed remains in protected ACL authority for replay, not in participant snapshots.
7. **Presence and reconnect.** Presence is transient, bounded, Host-owned and expires after 30 seconds; heartbeats do not create World or Session revisions. Unchanged cursors omit the projection; changed/stale cursors receive a full bounded authorized snapshot plus recent scene receipts. Late join/reconnect reads never execute old inputs, receipts or Task progress. Transport is authenticated HTTP pull/heartbeat, with explicit Host refresh cadence; no package WebSocket, arbitrary network, polling scheduler or authentication token API exists.
8. Realm remains after a room closes and does not rewind with Session Branches. Host can issue declared Realm Commands; explicitly granted participants can issue declared Commands against Host-derived per-player records. Observers cannot write. Session/ACL/Realm anchors close stale writes. Realm display views are explicitly granted and never automatically enter model Context.
9. **Cross-authority Saga reuse.** P7 remains the Session↔Player adapter; Realm adds Session↔Realm with the same transfer engine, typed lifecycle records, lineage/grants, durable intent/marker/receipt, destination capacity/receipt/byte reservations, restart resume and compensation only before Session publication. Realm uses separate Session markers and ledger resources. Every current read/publication reconciles both ledgers; historical raw snapshots stay immutable. Prepared Realm transfers block Session writes/deletion/generation through the existing barriers. A newly discovered interlock risk is fixed: a second Player/Realm Saga on the same Session is rejected before it can reserve another ledger. Both adapters keep independent authority and cannot remint an externalized item through old save/Branch restoration.
10. Shared asset delivery accepts only exact Package asset refs, not arbitrary owner attachments. `createNativeSharedClient` and `mountNativeSharedExperience` provide disposable Host transport and v2 mounting with scoped projections; they do not forward a local private World/Session into a remote mount. Client handles cursor reuse, uncertain-send exact retry, concurrent/out-of-order responses, disposal and permission-denial clearing. Existing v2 actions add `shared.*` and `realm.*`, preserving the single-authority-write ceiling and Message/Opening restrictions. Local Realm actions use the existing mount-scoped lifecycle transport. No new renderer or scheduler exists.
11. **P5/P6/P7 boundaries remain.** P5 Activity settlement-before-Narrator, prose-only handoff, exact assets, separate receipts/clocks and Host disposal remain intact. P6 explicit display/context grants, Truth/Belief/narrative separation, Actor availability, Rollup provenance/staleness and Open Loop/Memory separation remain intact. P7 exact Base/Community proofs, portability, independent Player graph and all Transfer reservations/grants remain intact.

## Concrete seams

- Schema: `public/shared/native-shared-contract.js`; Shared coordinator: `src/native/shared-authority.js`; Realm adapter: `src/native/realm-authority.js`.
- Shared declaration: `{schemaVersion:1,seats,rules,realm?}`. Seat: `{id,actorId,scopeId,viewIds,ruleIds,realmViewIds?,realmCommands?}`. Realm Command grant: `{domainId,commandId}`.
- Rule: `{id,domainId,commandId,roll?:{argument,sides}}`. Roll argument must be a compatible bounded integer in the declared Command schema. Participant args omit that field.
- `realm` reuses the P7 Continuity domain/transfer/view schema. Transfer endpoints must be distinct from Player transfer endpoints. Realm authority is keyed by owner handle + exact Package family, while schema/Command changes still fail migration-required.
- `POST /api/native/session/shared/enable`: owner-authenticated `{sessionId,expectedRevisionId}`.
- `/shared/membership`: `{owner,sessionId,action:{expectedAccessRevisionId,handle,seatId?,role:'participant'|'observer'|'revoked'}}`. Owner is the initial non-reassignable Host; other users cannot promote themselves to Host.
- `/shared/snapshot`: `{owner,sessionId,cursor?}`; `/shared/heartbeat`: `{owner,sessionId}`.
- `/shared/command`: `{owner,sessionId,action:{kind,invocationId,expectedRevisionId,expectedAccessRevisionId,...}}`. `turn.open` takes `{scopeId,scopeEpoch}`; `turn.submit` takes `{turnId,ruleId,args}`; `turn.commit` and `turn.cancel` take `{turnId}`. Required input policy is all submitted, commit by Host; there is no implicit AFK timeout.
- `/shared/realm`: `{owner,sessionId,expectedRevisionId,expectedAccessRevisionId,command:{type:'realm',invocationId,action}}`. Participant Commands omit `recordId`; Host derives it from authenticated Player identity. Participant invocations are scoped by the authenticated principal.
- Local owner `/command` accepts `type:'realm'` with the P7 action forms, using `expectedRealmRevisionId` instead of `expectedContinuityRevisionId`. `/realm/projection` takes `{sessionId,viewId}`; `/realm/graph` takes `{sessionId,limit?}`.
- Existing asset GET accepts `sharedOwner`/`sessionId` query parameters, limits access to Package closure and retains P5 delivery behavior.
- Host entry points are exported by `public/scripts/native/experience/index.js`. Loader's Host options accept `sharedOwner` and `signal`; arbitrary Package code cannot alter Host credentials. Shared snapshots feed existing `projection` and `shared` roots; Realm display uses `realm`. UI operations: `shared.open/submit/commit/cancel`, `realm.command/transfer/resume/cancel`.
- Fixtures and executable examples: `tests/native/helpers/shared-fixture.js`, `tests/native/shared-runtime-p8.test.js`, `tests/game-runtime/shared-host-p8.test.js`.

## Limits and evidence boundaries

- Single coordinating Host, existing local authenticated accounts, one Realm per owner/Package family. No cloud federation, external login provider, multi-process FS writers, distributed consensus, public discovery or Host election. P7 local-first Player assumptions are unchanged.
- At most 32 seats/participants/rules, 16 view/rule/Realm Command grants per seat. Protected Shared state is capped at 1 MiB and 2048 durable receipts; no silent replay-tombstone eviction. Each snapshot includes at most the latest 32 scene receipt projections plus existing P6 bounded views. Presence has at most 4096 live keys and 30-second expiry.
- Turn v1 is all-required, submit-once and explicit Host commit/cancel. Automated deadlines, optional slots, replace-own-input, AFK skip, custom host override policy and model-generated shared resolutions are not implemented. Existing P3/P4 Tasks/workflows can independently consume committed typed facts; P8 does not invent another Task scheduler.
- Split party is predeclared Actor/seat/scope structure; host may reassign non-owner membership into free declared seats. Dynamic authoring of scenes or a lobby editor belongs to later product work. Participants cannot clone or merge World snapshots.
- Realm Commands are bounded typed records. Participant grants write their own Host-derived record; Host-only declared Commands can coordinate shared records. No general guild/trade/arena product, arbitrary cross-player mutation, direct Player↔Realm asset exchange or atomic three-ledger transaction is claimed. The implemented transaction matrix is Session↔Player and Session↔Realm with independent receipts and disjoint Session endpoints.
- Realm retains P7 record/byte/receipt limits and independent history. No new DB schema migration is required; resource kinds/keys use generic Native tables. Existing packages without `sharedRuntime` retain prior behavior.
- Host mount/HTTP and real renderer DOM were exercised. No browser visual session, multi-device LAN soak, media decoding, physical gamepad/speech, paid inference or external provider send was run. P9 owns lobby/visual authoring, complete product bindings, Health/Repair/Migration, scenario tooling and final integration. P8 does not claim those surfaces.

## Next continuation — P9 only

---

# Handoff — Native Experience P7 complete

Updated: 2026-09-27. **P7 complete and pushed; stop before P8**.

- Work branch: `feat/native-experience-modes-capability-deepening`.
- Final work HEAD: `cb2abf54b7aacc0f16057ddc3ec1e2a98f24c111` (pushed).
- Main implementation: `d5579740b0efa9fc76a5e0b22d54eac292351ae7`.
- Follow-up `cb2abf54b` reserves final Saga record/receipt byte capacity before Session debit; the already-pushed implementation commit was preserved.
- Incoming P6: `52e1750d9353631878c4b6561945e1eff275e5b4`; all P0–P6 history preserved.
- Main remains `4dab353ac639d42eae885c79e18245267abd6820`. No merge or branch deletion before P9.
- Initial docs HEAD: `d02e6f493b41e51686de67e16e181b0df9e7fa86`.
- Only P7 was authorized. No P8 Shared Session/Realm implementation.
- Formal plan §0 remains unchanged: this implements its authority and exact-content boundaries without a substantive architecture deviation.

## Implemented

1. **Exact Add-on composition.** Optional `experienceContract.contentRuntime` v1 declares Base-owned extension points, accepted typed kinds, closed schemas and capacity. Resolution has stable dependency ordering. It produces an immutable resolved PackageVersion through the existing PackageInstaller; the Base archive/source bytes and current-version pointer remain unchanged. Updating or disabling content means composing a new version for a new selection; existing Sessions keep their selected exact version.
2. **Typed shareable resources and Registry contract.** `atria-addon` carries multiple contributions; `atria-shareable-resource` carries one typed contribution without pretending to be a full Add-on. `assertCommunityRegistry` accepts bounded inert discovery metadata with exact targets/refs, rejecting URLs, latest-following selectors, scripts and trust flags. Supported extension kinds are `data`, `skill`, `template`, constrained by the receiving Base schema. Contributions compile to namespaced, ordered Package Data catalogs consumed by the existing loader/renderer. No Base reducer/source patch or new executable Plugin path exists.
3. Text stays inert text; HTML-like strings are never treated as markup. Resolved archives embed the exact Base archive and exact Community bytes in existing AssetRefs, in addition to derived Data assets. Every resolved install/open recomputes the manifest, source files and asset set from those bytes and rejects tampered resolution. A fresh local account can install the resolved archive without an external registry or already-installed Base. This is a contract plus authenticated install/compose APIs, not a hosted public marketplace.
4. **Independent Player Continuity authority.** Optional `experienceContract.continuityRuntime` v1 declares typed domains, Command/Event/Reducer definitions, retention, transfer endpoints and explicit display views. The authenticated Host handle plus Package ID identify the local player/family; No new database, localStorage, Session, World, or scheduler is introduced. No SQL schema migration is needed for the generic resource tables.
5. **Revision graph and receipts.** Continuity has a parent-linked immutable revision history, independent of Session Branches. Reusing an invocation with another request/anchor is rejected. Bounded graph reads and exact historical revision reads are available. A changed domain/schema/command contract fails with migration-required rather than silently rewriting old facts. Session restore does not rewind the player graph.
6. **Transfer Intent / Receipt / Saga.** Declared endpoints move complete typed records between an existing lifecycle Session domain and a Continuity transfer domain. Host-derived lineage is stable across Branches; withdrawal carries its lineage and a new ownership grant into protected `atri_transfers`. Preparation durably reserves lineage, target record capacity, receipt capacity and publication bytes before any Session debit. Session debit/credit plus local transfer marker publishes through the existing immutable SessionRevision path. Final Continuity publication owns the committed TransferReceipt.
7. **Failure and recovery.** Exact retries inspect durable Session transfer markers and publish once. An explicit `transfer.resume` reconstructs the original stored intent after a service restart; it does not require a surviving browser Promise or operation. Before Session publication, explicit cancellation compensates escrow and releases its reservation. After Session publication, cancellation is rejected and forward recovery finishes the recorded transfer. While prepared, ownership is unavailable at both ends; Session publications, Branch changes, Session deletion and actual generation are blocked. Host recovery controls can mount without advancing automation, and static Ready preflight remains possible. Existing scheduler/Host execution is reused.
8. **Ownership reconciliation.** Current reads and every Session publication consult the independent ledger. Fork, switch, restore and same-account old-save import cannot reactivate a lineage that is externalized or belongs to another Session/grant. Historical raw snapshots remain immutable and expose external-effect diagnostics. Recreating an exported record ID cannot remint it. Stable transferable record IDs are entity identities for that Session/domain; authors must use a fresh ID for a genuinely new entity. Withdraw → redeposit → restore tests preserve one lineage across Sessions.
9. **Existing Host/renderer integration.** Authenticated Session routes provide Continuity commands, display projections and graph reads. Existing v2 expressions gain the read-only `continuity.<viewId>` display root; four Continuity action operations enter the same Host transport and count toward the one-authority-write ceiling. Message action policies cannot write Continuity; Opening confirmation cannot smuggle in a second authority. Render/model/authority/transfer receipts remain distinct.
10. **Exposure is explicit.** Continuity views expose declared fields with exact player revision and domain-relevant receipt refs. They are display-only and are not automatically injected into Context/Tasks. Pending transfers do not bypass Actor availability or static preflight distinctions. P5 settlement-before-Narrator, prose-only handoff, Scene Cue IR, exact asset delivery, elapsed clocks and disposal boundaries remain in force.

## Concrete seams

- Content declarations: `public/shared/native-content-contract.js`; proof/materialization: `src/native/content-composition.js`.
- Community envelope: `{format,schemaVersion:1,id,revision,target,requires,conflicts,contributions}`; a shareable envelope uses `contribution` instead of `contributions`. Contribution: `{id,pointId,kind,value}`. Registry: `{schemaVersion:1,entries:[{id,revision,kind,title,target,ref}]}`.
- Authenticated Product endpoints: `/community/install` with `{base,data}` (base64 JSON bytes); `/packages/compose` with `{base,resources,grantedPermissions?}`. Composition never changes the current Base selection.
- Continuity declarations: `public/shared/native-continuity-contract.js`; authority/Saga: `src/native/continuity-authority.js`; repository: `src/native/repositories/continuity-repo.js`.
- `continuityRuntime`: `{schemaVersion:1,domains,transfers,views}`; requires lifecycleRuntime. Domains reuse lifecycle domain fields except scopeId and have no World-clock TTL. Transfer: `{id,sessionDomainId,continuityDomainId}`. Transfer-owned Continuity domains have no general creation Commands. View: `{id,domainId,fields,maxItems}`.
- Existing `/api/native/session/command`: `{sessionId,expectedRevisionId,command:{type:'continuity',invocationId,action}}`.
- Command action: `{kind:'command',domainId,recordId,commandId,args,expectedContinuityRevisionId}`. Null is the explicit expected initial player HEAD.
- Transfer action: `{kind:'transfer',transferId,direction:'deposit'|'withdraw',recordId,scopeEpoch,expectedContinuityRevisionId,lineageId?}`. Only withdraw accepts lineageId; deposit derives it from source authority.
- Recovery: `{kind:'transfer.resume',intentId}`; compensation: `{kind:'transfer.cancel',intentId,expectedContinuityRevisionId}`. Resume reuses the original fingerprint and anchors. Receipt IDs appear in `externalEffects` for Host diagnosis.
- Read APIs: `/api/native/session/continuity/projection` with `{sessionId,viewId,revisionId?}` and `/continuity/graph` with `{sessionId,limit?}`. The latter is under the same `/api/native/session` prefix.
- Capability facade: `continuityCommand`, `getContinuityProjection`, `getContinuityGraph`, `getExternalEffects`. v2 action operations: `continuity.command`, `continuity.transfer`, `continuity.resume`, `continuity.cancel`; operation `args` supplies the action fields, and Host supplies its fixed kind.
- Example fixtures: `tests/native/helpers/continuity-fixture.js`; end-to-end usage in the three P7 test suites.

## Limits and remaining boundaries

- Content: 32 extension points/resources per composition, 128 contributions per payload/point, 1 MiB Community JSON, 128 Registry entries. Base resource namespaces cannot be replaced; contributions remain additive typed catalogs. Direct third-party Knowledge bindings, Prompt/Logic code, UI document patches and executable templates are not accepted contribution kinds. Base-authored native behavior consumes the catalogs. Visual Add-on/Registry authoring and management remain P9.
- Continuity: 16 domains/views, 32 transfer declarations, 128 output records/view, existing per-domain record/byte caps, 2048 durable intents/claims/receipts with pending receipt reservations, 6 MiB state plus reservation budget below an 8 MiB repository revision envelope. Graph reads return at most 256 nodes plus a parent cursor. No silent receipt eviction or physical GC.
- Player authority is local-first and uses one Host's resource coordination. Cloud sync, login dependency, distributed conflict resolution, provider connections and account migration are not implemented. The existing filesystem engine still does not support multi-process writers.
- Transfers currently use typed lifecycle Application records as Session inventory. They do not introduce a generic World patch, arbitrary state extraction or partial-record rewrite. P8 may compose Session/Player/Realm adapters over the same intent/receipt semantics; it must not undo these reservations or ownership grants.
- After a prepared transfer has published its Session side, recovery proceeds forward; cancellation is only before that publication. Pending errors are diagnosable in externalEffects and the player graph. No background polling or new durable task scheduler is introduced.
- An offline save transported to another independent account/device does not carry or synchronize player authority. This is not a cloud anti-cheat or distributed ownership protocol.
- Continuity display state is explicitly separate from model Context. There is no new automatic Continuity Prompt source; historical Task explanations continue to use their existing captured inputs. Historical Session presentation can show current player projections, identified by their independent exact revision.
- No new page layout was introduced. P8 owns shared identity/ACL, Presence, Realm and networking; P9 owns broader authoring/health/migration and final integration.

## Next stage

Stop now. Next authorized continuation should be **P8 only — Shared Session & Realm Runtime**, capability #31. Read the formal plan §0, both updated handoffs and this record; preserve the actual latest remote work HEAD. Reuse this exact-content and Player Transfer contract while adding participant identity/ACL, shared turn, Presence, reconnect/cursors, Scene Scope, deterministic shared rules/RNG and Realm authority.

## Next continuation — P8 only

---

# Handoff — Native Experience P6 complete

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

## Next continuation — P7 only

---

# Handoff — Native Experience P5 complete

Updated: 2026-09-27. **P5 complete and pushed; stop before P6**.

- Work branch: `feat/native-experience-modes-capability-deepening`.
- Work HEAD: `e21eb93489ae7fad4fb3874c532e797337f689d3` (pushed).
- Baseline: `5beee588ef82fb4cb47d8dafc33526d190aadb15`; P0–P4 preserved.
- Main unchanged: `4dab353ac639d42eae885c79e18245267abd6820`. No merge or branch deletion before P9.
- Formal plan §0 unchanged; P5 follows the frozen design. Only P5 is complete in this continuation.

## P5 implemented

1. **Versioned contract and typed authority.** Optional `experienceContract.presentationRuntime` v1 declares Activity, Scene, Asset Pack, Actor Voice and Host requirements. Exactly `activity`, `media-scene`, `asset-pack`, `safe-presentation`, `host-presentation-input` v1 become supported. P6+ capabilities remain reserved.
2. **Activity settlement before narrative.** Typed `activity.start/pause/resume/settle/cancel` reuse the existing lifecycle command, protected `atri_lifecycle`, immutable SessionRevision and expected-HEAD publication. Narrator input incompatibility leaves no partial facts. The existing Host scheduler resumes the exact declared Task/Variant, then task result, canonical assistant Variant, completion status and authority receipt publish together. Narrator returns prose, not executable Scene markup or new authority. Render, model-delivery and authority receipts stay separate.
3. **Replay, history and elapsed.** Activity instances retain run/scope epochs, elapsed samples, observations and completion state in the same revision snapshot. Terminal tombstones prevent replay after retention. Restore/fork carries the earlier state; cancel/suspend closes late narrative without erasing committed settlement facts. Uncertain retry preserves the exact sample and pending command; resumed runs reject old epochs. `getActivityProjection()` supplies typed Activity identity plus elapsed to the existing temporal projection; no mount-duration or wall/World-clock substitution.
4. **One renderer.** Typed Scene Cue IR supports image/audio/video/caption/speech/clear, bounded to declared exact AssetRef or selected-Variant Attachments. `scene` is a v2 leaf; media/speech primitives are Host-only. Scene compiles into the existing `mountUiDocument` and SurfaceHost, not a second renderer. Caption/speech content remains text. Package actions can call declared Scene/Activity/fullscreen/focus operations, while the one typed-authority-write ceiling remains.
5. **Exact media delivery.** The authenticated existing Session asset route supports GET/HEAD, strong ETag, conditional delivery, single byte ranges and 416 responses. Responses use inert MIME handling, nosniff, CSP and private immutable caching. Limits include 64 cues, 64 Activity declarations, 128 retained Activity records, 512 MiB per pack budget and 64 MiB total unique eager resources.
6. **Host capabilities and cleanup.** Required unsupported Host capabilities block prepare. Speech uses player-owned local voice preferences and explicit user activation; no provider credentials enter Package execution. Fullscreen requires activation and a mounted current Scene. Gamepad samples are bounded, deadzoned, edge-based Host input only. Responsive/reduced-motion changes remain non-authoritative projections.
7. **Final integration fixes.** Runtime initialization failure disposes its prepared Presentation Host. Elapsed projection uses the typed adapter rather than a bare number.

## Delivery and remaining boundaries

Implementation commit contains 29 paths; no local evidence, generated binaries, caches or user data is committed. `feat/native-experience-p5-completed.md` records the stage.

Activity is an authority/handoff contract rather than a bundled minigame. Scene is typed presentation, not model-generated executable UI. Live speech availability depends on installed local voices; required capability negotiation does not prove device output. Elapsed is an explicit active Host projection, not an authoritative real-time simulation or automatic background-tab pause. Restore does not resurrect provider streams, audio playback or fullscreen; Activity resume remains explicit. Lazy media errors appear on demand. Retention reuses P4 logical compaction/tombstones rather than physical GC. P6 owns deeper scoped information, graph queries, actor perspective/context and rollup semantics; P9 owns final migration/health/productization.

## Next continuation — P6 only

---

# Handoff — Native Experience P4 complete

Updated: 2026-09-27. **P4 complete and pushed; stop before P5**.

- Repository: `ZZZdragondYNGPHX/Atria`.
- Work branch: `feat/native-experience-modes-capability-deepening`.
- Work HEAD: `5beee588ef82fb4cb47d8dafc33526d190aadb15` (pushed).
- P3 `522386dda781bab752304adcdb98bf561c857c52` and all P0–P2 commits preserved.
- Main unchanged: `4dab353ac639d42eae885c79e18245267abd6820`. No merge or branch deletion before P9.
- Formal plan §0 unchanged: P4 implements the existing frozen scope; no substantive design deviation.
- Only P4 was authorized. Stop here; P5 is the next continuation.

## P4 implemented

1. **Strict lifecycle contract.** Optional `experienceContract.lifecycleRuntime` v1 declares scopes, typed per-record Application domains, World clocks and bounded advance commands, automations, Workflow graphs, deferred interaction mappings and retention. Enable exactly `session-application@1`, `temporal@1`, `workflow@1`, `runtime-automation@1`; P5+ remains reserved.
2. **One Native authority.** Protected `atri_lifecycle` is another state document in existing immutable SessionRevision snapshots, not a new database/Session. App records, scope epochs, clocks, workflow phase/node instances, automation cursors, Opening setup, pending Task intents, scheduled interactions and authority receipts commit with expected HEAD. Existing save/load, fork and revision restore carry the exact domain view. Generic state patch/delete cannot write this namespace. App state is not automatically exposed to model context.
3. Only successful current mounts emit `EXPERIENCE_READY`; SESSION_LOADED alone does not start automations. Superseded loads, failed mounts, historical views and timeouts cannot publish startup work. `acceptOperationSnapshot.acceptGuard` rechecks after network loading, before changing the active projection.
4. **Complete Opening lifecycle.** Opening setup values, conditional step/history and completion resume from `atri_lifecycle.opening`. Confirmation Command, optional canonical Composer user input and `completed` marker commit atomically. Frontend then uses the existing Composer/generation entrypoint for the already-committed user message; it does not redispatch World authority or append input again. Lost response retry uses the same invocation; restore/fork restores the incomplete Opening without future facts. Variant/narrative/projection contracts remain unchanged.
5. **Four time domains.** World clocks use declared clock identity + nonnegative integer ticks; only declared bounded advance commands move them. `logicalTime` advances with Native revisions, independently of World time. Wall time stays in Host timeout/diagnostic projection. Activity elapsed is an explicitly supplied Host projection and defaults to null; Experience mount duration is not treated as Activity time. Calendar/UI formatting does not become clock authority.
6. **Scope lifecycle.** Declared session/world/scene scopes have active/suspended/archived status and monotonic epochs. Suspension freezes writes and hides domain records from active-scope projections; thaw preserves data; archive is terminal. Pending work from prior epochs cannot finalize. Workflow Task nodes create fresh intents after thaw, instead of reusing cancelled ones. No array-moving or duplicate World snapshots.
7. **World Process and Automation.** `experience.ready`, World schedules and logical revision intervals trigger bounded typed actions. World actions use the same pinned private World/Command/Rule/Reducer preparation as P3. `all/latest/skip` catch-up cursors commit atomically with effects and survive restart. One pump processes at most 24 due occurrences under a 32-action transaction ceiling. Startup receipts are once per scope epoch. The browser never invents its own clock/scheduler or recursively wakes on its own lifecycle snapshot installation.
8. **Durable Scheduled Interaction.** An explicitly accepted fresh P3 advisory/proposal may be mapped through declared `interactions` to `{recordId,dueTick,args}` for one typed App Command. Package automation cannot auto-accept arbitrary model proposals. Due delivery runs that App reducer, once only; cancel/scope change closes or stales the intent. This is App content delivery, not a new conversation renderer or model-delivery receipt.
9. **Workflow / Phase Graph.** Persistent user/opening/action/model_task/wait_until/automation/projection/terminal nodes store phase, instance and durable refs. Cancellation closes work and blocks late finalize. Single-record Quest states remain App-command shorthand. Activity/subflow/rollup product bodies are not introduced early.
10. **Task restart and retention.** Scheduled Task intents remain in `atri_lifecycle.outbox`; `/generation/lifecycle` drains up to four through existing NativeGenerationHost.executeTask/NativeTaskScheduler. Only pending matching scope epochs finalize; Task result and intent completion publish together into existing `atri_task_results`/Revision. Host restart resumes intents, not serialized Promises/provider streams. Partial drain failure refreshes canonical authority without auto-retrying committed work. App retention applies logical byte/item limits and replayable WorldDuration terminal TTL, conservatively preserving active/pinned/referenced records. Task compaction preserves drafts/references and replaces eligible terminal payloads with exact replay tombstones. Receipt exhaustion fails closed rather than deleting deduplication evidence.

## Concrete authoring and Host seams

- Contract: `public/shared/native-lifecycle-contract.js`; fixture: `tests/native/helpers/lifecycle-fixture.js`.
- Definition: `{schemaVersion:1,scopes,domains,clocks,advances,automations,workflows,retention,interactions?}`.
- Domain: fixed `recordSchema`, `initial`, `scopeId`, mutation Commands and `{maxItems,maxLogicalBytes,terminalTtl?,keepPinned:true,keepReferenced:true}`. No caller-selected reducer paths or raw patches.
- Root retention: `maxTaskResults` 1..256 and `maxReceipts` 1..4096. Domain maximum 4096 records/1 MiB; Task intent and scheduled interaction queues each cap at 128. Pinned/live data produces backpressure instead of silent deletion.
- Existing POST `/api/native/session/command`: `{sessionId,expectedRevisionId,command:{type:"lifecycle",invocationId,action}}`.
- `action.kind`: `app.command`, `app.pin`, `scope.transition`, `clock.advance`, `workflow.transition`, `workflow.cancel`, `scheduled.cancel`, `interaction.schedule`, `interaction.cancel`, `opening.progress`, `opening.complete`, `experience.ready`, `pump`, `retention.compact`.
- POST `/api/native/generation/lifecycle/prepare`: read-only exact Task binding preflight. POST `/api/native/generation/lifecycle`: bounded existing-scheduler drain. Both use authenticated server owner and revision anchors.
- Existing Experience Host API adds `getApplicationRecords`, `getTemporalProjection`, `lifecycleCommand`, `pumpLifecycle`; no new renderer or package network API.
- `opening.complete` may carry declared `confirmation`, `submission` and temporary typed `preferences`.
- App/interaction/workflow authority receipts, model-delivery receipts and existing render receipts remain separate. No new Runtime role, mutable Variant or naked Interpreter patch.

## P4 boundaries for the next stage

- Existing packages without lifecycleRuntime keep their prior paths. Generic migration/repair UI remains P9.
- Only declared lifecycle Task intents resume across Host restart. Arbitrary in-memory P3 foreground/detached operations and partial provider streams are not serialized. Re-execution may contact a provider again after a crash, but authority finalization stays once-only.
- Pumps and drains are deliberately bounded. External revisions, successful experience reload/ready and explicit Host wakeups continue remaining work; there is no unbounded startup loop.
- Logical intervals observe revision order, not a hidden World clock. World catch-up never derives ticks from wall time.
- Retention is revision-view compaction, not physical repository GC. Tombstone/receipt hard-cap exhaustion requires an explicit future policy rather than silently re-enabling old invocations. P6 owns deeper typed-reference indexes and projection/context behavior.
- P5 must supply real Activity elapsed values and integrate Activity/Scene/Media with these already-implemented barriers/epochs/receipts. No P5 body was implemented here.

## Next continuation — P5 only

---

# Handoff — Native Experience P3 complete

Updated: 2026-09-27. **P3 complete and pushed; stop before P4**.

- Repository: `ZZZdragondYNGPHX/Atria`.
- Work branch: `feat/native-experience-modes-capability-deepening`.
- Work HEAD: `522386dda781bab752304adcdb98bf561c857c52` (pushed).
- P2 `1be87f0186d3f53c4bce8a7cc46a409e953ca46f` and all earlier commits preserved.
- Main unchanged: `4dab353ac639d42eae885c79e18245267abd6820`. No merge or branch deletion before P9.
- Formal plan §0 remains authoritative and unchanged: no substantive design deviation.
- Only P3 was authorized. Stop; P4 requires the next continuation.

## P3 implemented

1. Exact Task Prompt and Generation identities must resolve inside the Package's existing model/prompt resource closure. Task semantic ID, immutable Variant, Binding Slot and the existing fixed Runtime role vocabulary remain separate. No new per-business-task runtime role, renderer, Session or persistence family.
2. **Task Binding / Model Execution Lane.** Player `capabilitySettings.atri_task_bindings[packageId][slotId]` stores only a player Runtime Route reference, through existing settings/save. The Host borrows that route's model, connection, fallback and execution policy, and composes the Task Variant's exact Package Prompt/Generation resources over every fallback lane. It does not inherit the borrowed Narrator Prompt or prompt parameters. Route/model/connection snapshots are captured before queue execution, so later player edits cannot change the reserved resource identities. GenerationService, RouteResolver, PromptCompiler, Secret port and EffectiveRequestSnapshot remain the actual execution path.
3. P3 sinks are `advisory→proposal`, `turn_context→turn`, `presentation→artifact`, `world_outcome_proposal→proposal`. Context opt-in (`input/history/world/knowledge`) filters the existing Native selection; arbitrary stored state and past proposals do not enter prompts. P6 still owns deeper actor/perspective/source-budget work.
4. **Authority-first Turn.** For a Package with declarative World logic and free-text input, the existing Intent Resolver/tool catalog resolves only explicitly exposed Commands. The same World/Command/Rule/Reducer engine commits facts before Narrator reads them. Already-committed facts survive a later narrative failure by design; the Host never retries the entire authority-producing Turn automatically. Native retry/fork remains the explicit way to choose an earlier revision.
5. **Narrative-outcome Turn.** Up to four synchronous `turn_context` Tasks run as provisional stages. The ordinary Narrator route or optional presentation Task Variant produces the draft. The Interpreter Task receives `{narrative, stages}` as semantic evidence and emits only the existing semantic decision/event/confidence/severity/participants/evidence shape. Pinned declarative Interpretation Mapping → typed Command → Rule/Reducer prepares a private candidate using the existing World engine and the same Package/EntryPoint RNG seed. SessionCore atomically commits narrative, projection, World/Event state and Turn receipt with expected HEAD.
6. **Turn Envelope extension.** `outcomes` now accepts up to 16 typed `{requestId, interpretation}` proposals, not arbitrary JSON. The configured narrative-outcome Turn requires exactly its one declared Interpreter outcome; authority-first requires `[]`. Generic append/runtime append still rejects nonempty outcomes; only `turn.finalize` can consume them. Low-confidence no-change normalization occurs before recording outcomes.
7. **Provisional Draft barrier.** Normal Native Play routes configured Package Turns through `/generation/turn`. `markProvisionalTurn()` prevents ordinary autosave from committing stream text. Stop/failure reloads canonical authority without calling the old partial-Draft persistence path. Accepted server snapshots reuse NativeSessionRuntime's projection install. Quiet/impersonation and old Packages retain their prior paths; configured Turn continuation requires an explicit new Turn. No second conversation renderer was added.
8. **Proposal Artifact.** Revision-backed `atri_task_results` is a protected SessionCore namespace, carried by existing snapshots/save/export/fork/restore. Generating a proposal changes no World facts. Explicit Apply (including a user-edited schema-valid payload) rechecks current revision/branch, then runs a declared advisory `applyCommand` or semantic mapping atomically. Rejection has no World effect. Apply receipt replay is once-only even after a lost response; changed replay payload fails. Stale/historical proposals cannot silently apply.
9. **Host Scoped Operations / Auxiliary Tasks.** One shared server scheduler covers ordinary model calls, Task calls and complete Turns. Turn stages execute under their parent permit, avoiding nested-queue deadlock and retaining the claim through finalize. Operation kinds `turn/model_task/auxiliary_task` expose read-only queued/running/streaming/retrying/finalizing/completed/failed/cancelled/stale state, attempt count, provisional text and a separate model-delivery receipt. `finalizing` is an uninterruptible CAS boundary: cancel never claims to undo a commit. Failed/stale/cancelled provisional text is cleared; ignored-abort workers retain permits until settlement.
10. **Backpressure and lifecycle.** Host limits default to 4 total in flight, 2 per shared resource (Session, Route, Connection, Model, Provider), 64 queued and 256 retained operations, with a 120-second queue+execution deadline. Fixed execution classes use priority plus aging. Exact request coalescing, bounded provider-failure retry/backoff, stream reset, explicit cancel and latest supersede are supported. `queuePolicy:latest` is restricted away from semantic outcome/apply-command work. Package cannot declare arbitrary priorities, secrets, URLs or worker pools. Provider context/token budgets still run in GenerationService. Detached `/task/start` survives view closure; foreground disconnect cancels through the existing AbortSignal path.

## Concrete authoring and Host seams

- Shared contract: `public/shared/native-task-contract.js`; semantic envelope shape remains in the import-free `public/shared/native-message-contract.js`.
- `taskRuntime`: `{schemaVersion:1,slots:[{id,requiredCapabilities}],tasks:[...],turn?}`.
- Task: `{id,bindingSlotId,executionClass,inputSchema,context,resultPolicy,variants,interpretation?,queuePolicy?}`. Execution class is `turn_blocking|interactive|background|maintenance`; queue policy defaults to `fifo`, optionally `latest` for replaceable non-authority work.
- Variant: `{id,prompt:{resourceId,revision},generation:{resourceId,revision},outputSchema,requiredCapabilities}`. Its enclosing immutable Package supplies resource ownership. No model/connection choice in the author definition.
- Result policy: `{resultClass,sink,applyCommand?}`. `applyCommand` is allowed only for advisory proposals. `world_outcome_proposal` requires the existing strict Event Interpretation request contract.
- Turn: `{policy:"authority-first"|"narrative-outcome",stages:[taskId],narratorTaskId?,interpreterTaskId?}`. Stages must be turn-blocking turn-context Tasks. An optional Narrator must be a turn-blocking presentation Task; it receives `{stages}` and returns a JSON string or typed Turn Envelope without outcomes. Interpreter receives `{narrative,stages}`. Standalone calls always name an explicit Variant; Turn defaults to the first declared Variant unless the player supplies its selection.
- Generation routes: POST `/api/native/generation/task`, `/task/start`, `/turn`; GET/DELETE `/operations/:id`. Authenticated handle is server-owned; another owner cannot inspect or cancel an operation.
- Session commands: `turn.finalize`, `proposal.resolve`, routed through existing authenticated `/api/native/session/command`. Model provenance cannot be supplied through the direct Turn command route.
- Existing Experience Host API adds `getTaskBindings/setTaskBinding`, `invokeTask/readOperation/cancelOperation/resolveProposal`. `public/scripts/native/task-client.js` rejects historical calls until explicit fork and uses existing Session/settings authorities. Visual Slot configuration, generic operation panels and Studio authoring remain P9 productization.
- Enabled exactly `turn-contract@1`, `narrative-outcome@1`, `model-task@1`, `auxiliary-task@1`; P4+ features remain reserved.

## Deliberate phase boundaries / next work

- Operation projection is transient Host execution state. Detached jobs survive view closure, not Host restart; completed artifacts/receipts are durable Session revisions. A restart does not silently replay uncertain work. Cross-restart lifecycle/ready-barrier/retention policy belongs with P4 Session Application integration.
- Task/Turn result history currently has a hard 256-record limit and fails closed without silently evicting authority. P4 must design retention/compaction coherently with revision/fork semantics.
- P3 accepts only its implemented result sinks. Session App proposals, Activity/media settlement and shared/continuity authorities wait for their phases.
- P6 owns richer Context/Perspective/actor targeting. P9 owns visual Binding Slot/operation/proposal configuration and final cross-stage productization.
- No P4 Automation, Temporal, Session Application lifecycle, full Opening readiness or Workflow body was implemented. Keep main and the feature branch intact.

## P4 takeover prompt

---

# Handoff — Native Experience P2 complete

Updated: 2026-09-26. Status: **P2 complete and pushed; stopped before P3**.

- Repository: `ZZZdragondYNGPHX/Atria`.
- Work branch: `feat/native-experience-modes-capability-deepening`.
- Work HEAD: `1be87f0186d3f53c4bce8a7cc46a409e953ca46f` (pushed).
- P1 predecessor preserved: `24e75668b9cf739796ea4c679056391702a8973b`.
- Main remains `4dab353ac639d42eae885c79e18245267abd6820`; no merge/deletion.
- Plan: `feat/native-experience-modes-capability-deepening.md`, normative §0.
- Only P2 was authorized. Continue on this same branch for P3 only after a new continuation.

## P2 implementation and contracts

1. **Immutable Message Projection.** `Variant.projection` is a first-class optional field, not an arbitrary metadata convention. Shape: `{schemaVersion:1,flow:[{kind:"prose",text},{kind:"block",id,type,version:1,data}]}`. Prose segments join without separators and must equal canonical `Variant.content`. User/assistant projections are allowed; system/tool projections are rejected. Existing Variants without this field keep their behavior.
2. Unknown template/version/data keys or malformed data reject the batch without advancing HEAD. Plain prose-only projections do not require v2. The same existing SessionRevision/Variant repositories carry save/export/import/fork/restore; no new persistence authority exists.
3. **P2 Turn Envelope seam.** `{schemaVersion:1,narrative,projection?,outcomes:[],diagnostics:[]}` is normalized through existing append commands. Only assistant drafts accept it. Conflicting narrative/projection inputs reject; non-empty outcomes remain reserved for P3. Diagnostics are bounded `{code,message}` records stored only under `Variant.metadata.atri_turn_diagnostics`, never exposed to templates or canonical history. The runtime empty-Draft barrier reads envelope narrative, so accepted envelopes are not accidentally discarded. Draft host transport accepts `atri_native.envelope` or `atri_native.projection`; canonical committed projection is rebound in place.
4. **One v2 compiler/renderer.** UI document `messageBlocks[type]` declares `{version:1,dataSchema,maxInstances?,attachmentKind?,actionPolicy?,document}`. Templates recursively reuse `compileUiDocument` and `mountUiDocument`; there is no second component renderer. Model data chooses only declared block types and schema data, not Component trees/actions/HTML/CSS.
5. **Message-local UI and snapshot context.** A template has one `chat.footer / always` placeholder view, mounted by Host into its message; no nested templates, native slots, selectors, Opening or live World reads. Roots: `ui/prefs/data/env/block/message/item/index/event/form`. `block` is immutable data; `message` contains only presentation-safe role/message ID. Local state is mount-only; declared player/device preferences reuse P1 settings with template/type isolation. All blocks in one message share a 2048 rendered-node budget and unique DOM IDs.
6. **Actionable attachments.** Types `claim/payment_request/item_offer/action_ref` are semantic template tags. `ui-only` (default), `active-tail`, and `fork-from-anchor` govern actions. UI/preferences may change while viewing history; Commands/Composer remain read-only unless current tail or Host-confirmed explicit fork. Fork resumes through the newly mounted branch renderer using existing typed Action v2. Attachment idempotency uses `variantId:blockId:actionId` and existing `atri_action_receipts`; repeat claims after refresh/remount do not repeat authority writes. Failed later P1 steps can resume in-mount without repeating the successful Command. Generic durable operation recovery remains P3.
7. **Conversation / narrative presentation.** `conversation:{mode:"feed"|"latest"|"reader",profile:"default"|"novel"|"dialogue"}` defaults to feed/default. Host toolbar lets players change presentation without changing Timeline. Ordered prose/block flow uses the existing canonical prose formatter and v2 renderer; render failure leaves canonical DOM available. Host observes existing Conversation DOM/pagination, retains message mounts when identity is unchanged and cleans up on replacement/disposal. Component/Hybrid/Full use this same Host path.
8. **Scoped thread foundation.** `assertConversationThread` and Host `mountConversationThread` accept read-only typed `{schemaVersion:1,threadId,scope,participants,messages}` snapshots, with session/world/scene scope. They reuse message presentation with 50-message pages and no authority-producing actions. They are not a second main Timeline. Typed Session Application ownership/lifecycle, unread persistence, Context/Perspective routing and thread authoring belong to P4/P6, not P2.
9. **Branch Graph / Reply Variant facade.** Existing history UI now has bounded graph/lineage rows, search, branch-filtered timeline, preview, current/origin/detached/incomplete markers, and previous/next/count for reply alternatives. Command-parent ancestry and branch-content ancestry are kept separate, including state-only/switch revisions. `getSessionHistory` adds lightweight reachable-message summaries via one Timeline inventory; no full snapshot per graph node. Reply controls lazily share a Session metadata cache and call existing inspect/switch/retry/fork paths. Previous/next are preview-only; explicit switch restores the complete branch head. Exact historical revision fork uses live expected HEAD, never mutates a birth Variant. State-only revision refresh retains valid active-tail Retry.
10. **Separate receipt domains.** Render receipts are bounded mount-local `kind:"render"` diagnostics (up to 256 retained). They never write SessionState or mark model delivery/authority success. Authority receipts remain P1 revision-backed transactions. P3 must introduce real operation/delivery semantics rather than treating a successful render as delivery.

Enabled versions: `message-projection@1`, `turn-envelope@1`, `reply-variant@1`, `conversation-presentation@1`, in addition to P0/P1 support. P3–P9 requirements remain reserved. No substantive architecture deviation required changing the formal plan.

Primary executable-free fixture: `tests/native/fixtures/message-projection-v2.json` (`{document,projection}`). Shared primitives: `public/shared/native-message-contract.js`. Host presentation: `public/scripts/native/message-presentation.js`. Branch facade: `public/scripts/native/reply-variants.js` and existing `session-history.js`.

Hard limits include 128 flow nodes, 32 template types / 32 instances per type, aggregate block data 4096 nodes / depth 16 / 65536 characters, 16 diagnostics, 64 thread participants / 256 thread messages, 2048 rendered nodes per message, history metadata 20000 branches+revisions, 25 branch rows/page, at most 100 revision rows in DOM, 280-codepoint previews, and 15-second metadata timeout. Existing v2 resource/JSON limits continue to apply.

## P3 boundary and next takeover

P2 stops here. Do not implement P3 runtime work until a new continuation. P3 owns Package Turn Contract, bounded stages, authority-first/narrative-outcome finalize, Model Task/Task Variant/Binding/Proposal and scoped operation scheduling, streaming/retry/stale/cancel/backpressure. Preserve the shared renderer, authority, pinned closure and receipt separation.

---

# Handoff — Native Experience Modes & Capability Deepening

Updated: 2026-09-26. Status: **P1 complete and pushed; stopped before P2**.

- Repository: `ZZZdragondYNGPHX/Atria`.
- Work branch: `feat/native-experience-modes-capability-deepening`.
- Work HEAD: `24e75668b9cf739796ea4c679056391702a8973b` (pushed).
- P0 predecessor: `349287c166bff9344bb9bbabc812a799b9cb8534`.
- Main remains `4dab353ac639d42eae885c79e18245267abd6820`; no merge or branch deletion.
- Plan: `docs:feat/native-experience-modes-capability-deepening.md`, normative §0 Implementation Baseline v1.0.
- The user explicitly clarified: finish P1, stop, do not continue P2. The same branch remains in use through P9.

## P1 implemented

1. Explicit Component v2 document/compiler/runtime, isolated from the existing v1 renderer. Component/Hybrid/Full activate through the same SurfaceHost; v2 surfaces are owned by document views, so the old top-level `experience.surface` is rejected for v2. Component cannot own `app.root`; Hybrid/Full require exactly one primary view. Full retains Host recovery.
2. Strict, bounded local fields and Form controls; pure Formula-based expressions/templates and selectors. No Package JS/HTML/CSS, arbitrary patch, DOM, storage or network handle is exposed. Static quoted property/index access is opt-in for UI/Data expressions; original Formula defaults remain unchanged.
3. Constraint statuses are `allowed`, `advisory`, `confirm_required`, `blocked`; confirmation is Host-owned and cancels on disposal. Keyed, bounded Collection pages retain DOM identity and focus.
4. Local UI `mount`/`session` state and `player`/`device` preferences reuse existing account settings. State keys include Package/EntryPoint/stateVersion, plus Session/Branch for session drafts and Host device identity for device preferences. The Host's browser storage contains only `atri_ui_device_id`, a non-secret UUID; preference values stay in account settings. This adapter lives in `native/ui-state-storage.js`, outside Package execution, and creates no Session/World store. UI/preference changes never create World revisions. Branch/restore remounts v2; committed revisions refresh its presentation.
5. Dotted IDs map to nested `data` paths. Data is frozen for UI/selectors and declarative logic; reading it does not add Prompt exposure. Missing/mixed/unknown refs fail. Build/install reject malformed v2 documents and Data.
6. Composer has typed set/append/clear/focus/submit. Manual and declarative submission share the same `getContext().generate('normal')` Native entrypoint. No button-click simulation or second generation pipeline. Empty, busy and historical submission is rejected.
7. Action v2 uses existing typed Command/Event/Reducer and SessionRevision commits. `atri_action_receipts` is a protected namespace in the same atomic revision, containing base/committed revision, branch, event refs, request fingerprint and optional compensator. Replay is idempotent; key conflicts/stale writes fail. Explicit compensation is a new typed transaction and cannot apply twice; it never rewinds an immutable receipt. One action permits at most one authority-write step; combine atomic writes inside one Command. Local/Composer steps can surround it; there is no implicit rollback.
8. Uncertain authority failures retain the exact request for in-mount retry. After authority success, a later failed UI/Composer step resumes from that step instead of repeating the commit. Busy action invocations coalesce. Durable generic operation lifecycle remains P3.
9. Declarative logic `schemaVersion: 2` mutation shorthand lowers at build into the existing executable-free Command/Event/Reducer IR.
10. Committed setup still uses a typed command or Native Composer. Complete Opening lifecycle/ready barrier/workflow integration remains P4.

The support catalog now enables only `component-model@1/@2`, `local-ui-state@1`, `player-preference-state@1`, `package-data@1`, `composer@1`, `action@2`, `declarative-mutation@1`, and basic `opening@1`. Other P2–P9 feature versions remain reserved/unsupported. Package and Runtime Descriptor schema versions did not change. No substantive architecture deviation required editing the formal plan.

## Concrete authoring contract

Primary executable-free fixture: `tests/native/fixtures/component-v2-opening.json`.

- `runtime.experience`: `{ mode, componentModelVersion: 2, component: "ui/main.json", selectors? }`.
- UI document: `{ schemaVersion: 2, stateVersion, localState?, preferences?, selectors?, actions?, views, opening? }`.
- Fields: named scalar string/number/integer/boolean definitions, explicit `default`, optional scope/required/min/max/step/minLength/maxLength/enum. Form models address only declared `ui.key`; state actions may address declared `ui.key`/`prefs.key`.
- Values: literal JSON, `{ expr: "ui.name" }`, or `{ template: "Hello {{ui.name}}" }`; roots `world/ui/prefs/data/selectors/env/item/index/event/form`. No evaluation side effects, dynamic property expressions or RNG in UI.
- Views: `{ id, surface, mount: "always" | "on-demand", root }`; on-demand only modal/drawer. Node fields and props are closed. Host controls include Form/input/textarea/select/checkbox/range and basic text/layout/progress/details/native slots/repeat.
- Actions: `{ steps, constraints?, idempotency?: "request" | "revision", compensation?: commandId }`; operations `ui.set/toggle/reset`, `command.dispatch/simulate`, `action.compensate`, `composer.set/append/clear/focus/submit`, `surface.open/close`, `opening.next/back/confirm`. Command args are value templates; simulation does not create receipts or authority writes.
- Opening: `{ initial, confirmAction, steps: [{ id, view, fields, next: [{ when, to }] }] }`. Navigation preserves mounted drafts. Completion is mount-local in P1, not a new persistent application phase.
- Lowered archives use ordinary existing IR.
- Hard limits include 16 views, 512 authored nodes/depth 24, 2048 rendered nodes, 128 fields per state family, 32 steps/action, 64 constraints, 32 Opening steps/64 navigation entries, Collection source 10000/page 100, 2 MiB per Data/UI resource, bounded JSON, 2048 revision receipts and 16384 Host preference keys. Reaching a limit fails closed; no silent eviction of authoritative receipts.

## Scope boundary / P2 target

P1 is complete. No P2–P9 feature body was implemented. P1 limits are intentional: scalar declared fields, basic keyed pagination (no general query engine or nested Collection), one authority write per action, mount-local wizard completion, no persistent generic operation scheduler or receipt compaction. P3/P4 own operation lifecycle and retention/ready-barrier deepening; P5/P9 own advanced presentation and visual Studio authoring.

Next: **P2 — Message Projection / Conversation / Branch Presentation**. Implement #9/#11/#15 and #16 presentation/thread foundation: message-local UI, actionable message attachments, narrative presentation profile and Branch Graph/Reply Variant facade. Preserve immutable Variants, separate canonical narrative from projection, default historical actions to read-only or explicit fork, and keep render receipts separate from authority/model-delivery receipts. Reuse P1 Component/Form/Action seams rather than creating another renderer or persistence authority. Do not implement P3 bodies.

Fetch first; read main AGENTS/FORK, formal §0, both handoffs and relevant current code/tests. Preserve newer remote commits. Finish P2 on this same branch, commit/push, update both handoffs, update the plan only for substantive design changes, stop before P3 and provide a P3 takeover prompt. Do not merge main before P9.

---

# Historical handoff — P0

Updated: 2026-09-26.
Status: **P0 complete and pushed; stopped before P1**.

## Repository / branches

- Repository: `ZZZdragondYNGPHX/Atria`
- Main / original baseline: `4dab353ac639d42eae885c79e18245267abd6820` (unchanged).
- Work branch: `feat/native-experience-modes-capability-deepening`
- Work branch HEAD: `349287c166bff9344bb9bbabc812a799b9cb8534` (pushed).
- Plan: `docs:feat/native-experience-modes-capability-deepening.md`
- Plan baseline: **Implementation Baseline v1.0**, 32 capabilities, P0–P9.
- No substantive design change; the formal plan was not mechanically edited.
- Continue this one branch through P9.

## Read before P1

Fetch origin first. Do not reopen the completed heavy-card audits or redesign the full architecture.

## P0 implemented

1. `public/shared/native-experience-contract.js` is the shared strict contract/vocabulary boundary, exported through `src/native/authoring-contracts.js` and `src/native/index.js`.
2. Optional package-level `runtime.experienceContract` has its own `schemaVersion: 1`.
3. The descriptor carries `experienceContract` separately from layout-only `experience`. Existing packages without the field retain their existing output and behavior; Package schema v2, Runtime Descriptor schema v1 and Component Model v1 remain unchanged.
4. The 32 frozen capability names have exact reserved versions, distinct from implemented Host support. Only `component-model@1` is currently marked supported in this new vocabulary. Unknown capabilities/versions fail even when optional. This is not a permission grant or a second package capability system: existing coarse Package capabilities/permissions are unchanged; these are versioned Experience feature requirements.
5. Package Data refs reuse immutable JSON AssetRefs already carried by PackageVersion. No data loader, selector/query, exposure, storage or executable behavior was added.

## Exact declaration seam

- All three fields are explicit; arrays are bounded to 256 items and reject duplicate capability IDs / data resource IDs.
- The example digest must be replaced with the actual asset digest.
- The enclosing PackageVersion supplies ownership; no new resource store, source URL, follow-latest resolution or Package execution path exists.
- Requirements belong to Package runtime. EntryPoint overrides are rejected, so a selected entry cannot weaken package requirements.
- There is no generic config/extensions/persistence/context passthrough in this declaration. Storage does not imply exposure.
- Reserved versions are API seams, not implemented feature bodies. Component v2 rendering remains rejected by the existing v1 contract until P1 deliberately implements its isolated schema.

## Architecture retained / not implemented

SessionCore, Session Runtime, Experience index and Component Model renderer were inspected and intentionally left unchanged. World / timeline / runtime state continue to commit and restore through existing Native SessionRevision and Branch authority. P0 adds no persistence family or new authority write surface.

No P1–P9 product capability was implemented: no Component v2 UI, Form, local/preference state runtime, Composer actions, Message Projection, Task scheduler, Temporal/Workflow, Activity/Scene, Add-on, Player Continuity, Shared Realm or Studio redesign.

## Next stage: P1 only

**Component v2 / Form / Local State / Action / Opening Foundation**:

- Capabilities #1 / #2 / #3 / #4 / #6 / #7 / #8 and #14's basic Opening/Wizard.
- Implement explicit Component v2 version separation while preserving v1.
- UI state must not create World Revisions. Form/Action authority writes must enter existing typed Command/Event/Reducer and SessionRevision paths. Expressions/templates cannot have side effects.
- Update only actually implemented capability versions in the shared support catalog. Do not mark all reserved capabilities supported or infer support from layout mode.
- Respect plan §0 and relevant final design sections; do not implement P2+ bodies.
- Fix ordinary failures autonomously.
- On P1 completion: commit and push this same branch, update both handoffs, update formal plan only for substantive design changes, stop before P2 and provide the P2 takeover prompt. Do not merge main.
