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

1. **Strict Shared contract.** `sharedRuntime` v1 enables `shared-realm@1`. Seats bind exact existing Actors, lifecycle scopes, explicitly granted P6 display views and typed rule IDs. Views stay within the seat's Scene Scope. Optional Realm read/Command grants name declared domains and Commands. Unknown fields, network declarations, undeclared Actors/views/rules, cross-scope grants and overlapping Player/Realm transfer endpoints fail closed. Component, Hybrid and Full use the same capability contract.
2. **Authenticated identity and ACL.** Existing server authentication supplies the principal; request bodies cannot select the acting account. A Session owner enables sharing and grants fixed seats to authenticated local account handles. Host, participant and observer are capability roles. Public projections use scoped opaque `PlayerRef` IDs and `authenticated-local` trust, separately from seat/Actor identity. Host administration does not expose arbitrary World snapshots or reducer replacement. `atri_shared_access` and its immutable revisions use the existing Native resource engine; revocation and ACL epochs survive Session Branch restore.
3. **One canonical Session.** Shared inputs, Turn state and typed outcome evidence live in protected `atri_shared` within existing immutable Session revisions. There is no participant World clone, alternate Session database or merge of client snapshots. The server returns only the seat's granted P6 projections, its Scene peers, safe Turn/receipt metadata and explicitly granted Realm views. Raw Session states, raw Timeline, account handles, seed and secrets are not part of a Shared snapshot.
4. **Shared Turn protocol.** Host opens a Turn for an active scope/epoch and freezes a stable seat roster plus ACL epoch/Branch. Every active participant submits once; observers cannot submit. Host commits only after every roster slot is filled, or explicitly cancels. Inputs use a declared App Command schema and cannot select arbitrary record IDs; records are seat-bound. Resolution reuses `prepareLifecycle` and the existing Command/Event/Reducer path, applying inputs in ASCII seat order and publishing all facts/evidence once in one Session Revision. Failed resolution publishes no partial record or receipt. Idempotency, expected Session/ACL revisions, Actor availability, scope epochs and source Revision checks reject replay conflicts and stale inputs.
5. **Scene Scope / split party.** Each scope can retain its own pending Turn. Shared publications in another scene preserve valid pending anchors; unrelated authority publication, Branch change, scope change or ACL change invalidates the old input anchor. Each participant sees only its Scene peers and declared information sources. Both scenes settle into the same Session revision graph. Cancellation can close a stale Turn without applying its inputs.
6. **Deterministic shared rule/RNG.** Rules invoke existing typed App Commands. Optional dice arguments are generated by the Host using persisted random seed, exact Session/Turn/seat identities and SHA-256 rejection sampling; clients cannot provide the dice result. Committed receipts retain rule/seat events, rolls, source Revision/Branch/scope/ACL provenance, algorithm version and seed hash. Seed remains in protected ACL authority for replay, not in participant snapshots. This is deterministic replay, not a cryptographic anti-cheat or player-verifiable fairness protocol.
7. **Presence and reconnect.** Presence is transient, bounded, Host-owned and expires after 30 seconds; heartbeats do not create World or Session revisions. Snapshot+Cursor hashes exact Session Revision, ACL Revision, seat/scope state and Realm Revision. Unchanged cursors omit the projection; changed/stale cursors receive a full bounded authorized snapshot plus recent scene receipts. Late join/reconnect reads never execute old inputs, receipts or Task progress. Transport is authenticated HTTP pull/heartbeat, with explicit Host refresh cadence; no package WebSocket, arbitrary network, polling scheduler or authentication token API exists.
8. **Realm authority.** A Host account's Package family identifies one persistent local Realm, shared by its Sessions. `atri_realm` and immutable `atri_realm_revision` are separate from Player Continuity resources, reusing the existing revision repository, Native resource storage, integrity checks, HEAD CAS and authority lock. Realm remains after a room closes and does not rewind with Session Branches. Host can issue declared Realm Commands; explicitly granted participants can issue declared Commands against Host-derived per-player records. Observers cannot write. Session/ACL/Realm anchors close stale writes. Realm display views are explicitly granted and never automatically enter model Context.
9. **Cross-authority Saga reuse.** P7 remains the Session↔Player adapter; Realm adds Session↔Realm with the same transfer engine, typed lifecycle records, lineage/grants, durable intent/marker/receipt, destination capacity/receipt/byte reservations, restart resume and compensation only before Session publication. Realm uses separate Session markers and ledger resources. Every current read/publication reconciles both ledgers; historical raw snapshots stay immutable. Prepared Realm transfers block Session writes/deletion/generation through the existing barriers. A newly discovered interlock risk is fixed: a second Player/Realm Saga on the same Session is rejected before it can reserve another ledger. Both adapters keep independent authority and cannot remint an externalized item through old save/Branch restoration.
10. **Existing loader, renderer and Host.** Shared package/resource resolution reuses the existing exact Package loader, with authenticated Shared ACL checks. Shared asset delivery accepts only exact Package asset refs, not arbitrary owner attachments. `createNativeSharedClient` and `mountNativeSharedExperience` provide disposable Host transport and v2 mounting with scoped projections; they do not forward a local private World/Session into a remote mount. Client handles cursor reuse, uncertain-send exact retry, concurrent/out-of-order responses, disposal and permission-denial clearing. Existing v2 actions add `shared.*` and `realm.*`, preserving the single-authority-write ceiling and Message/Opening restrictions. Local Realm actions use the existing mount-scoped lifecycle transport. No new renderer or scheduler exists.
11. **P5/P6/P7 boundaries remain.** P5 Activity settlement-before-Narrator, prose-only handoff, exact assets, separate receipts/clocks and Host disposal remain intact. P6 explicit display/context grants, Truth/Belief/narrative separation, Actor availability, Rollup provenance/staleness and Open Loop/Memory separation remain intact. P7 exact Base/Community proofs, portability, independent Player graph and all Transfer reservations/grants remain intact. Unavailable P9 capability sentinels replace the former P8 sentinel in existing tests/guards; execution assertions were retained.

## Concrete seams

- Schema: `public/shared/native-shared-contract.js`; Shared coordinator: `src/native/shared-authority.js`; Realm adapter: `src/native/realm-authority.js`.
- Shared declaration: `{schemaVersion:1,seats,rules,realm?}`. Seat: `{id,actorId,scopeId,viewIds,ruleIds,realmViewIds?,realmCommands?}`. Realm Command grant: `{domainId,commandId}`.
- Rule: `{id,domainId,commandId,roll?:{argument,sides}}`. Roll argument must be a compatible bounded integer in the declared Command schema. Participant args omit that field.
- `realm` reuses the P7 Continuity domain/transfer/view schema. Transfer endpoints must be distinct from Player transfer endpoints. Realm authority is keyed by owner handle + exact Package family, while schema/Command changes still fail migration-required.
- `POST /api/native/session/shared/enable`: owner-authenticated `{sessionId,expectedRevisionId}`.
- `/shared/membership`: `{owner,sessionId,action:{expectedAccessRevisionId,handle,seatId?,role:'participant'|'observer'|'revoked'}}`. Owner is the initial non-reassignable Host; other users cannot promote themselves to Host.
- `/shared/snapshot`: `{owner,sessionId,cursor?}`; `/shared/heartbeat`: `{owner,sessionId}`.
- `/shared/command`: `{owner,sessionId,action:{kind,invocationId,expectedRevisionId,expectedAccessRevisionId,...}}`. `turn.open` takes `{scopeId,scopeEpoch}`; `turn.submit` takes `{turnId,ruleId,args}`; `turn.commit` and `turn.cancel` take `{turnId}`. Required input policy is all submitted, commit by Host; there is no implicit AFK timeout.
- `/shared/realm`: `{owner,sessionId,expectedRevisionId,expectedAccessRevisionId,command:{type:'realm',invocationId,action}}`. Participant Commands omit `recordId`; Host derives it from authenticated Player identity. Participant invocations are scoped by the authenticated principal. Host-only transfer operations remain subject to P7 Saga checks.
- Local owner `/command` accepts `type:'realm'` with the P7 action forms, using `expectedRealmRevisionId` instead of `expectedContinuityRevisionId`. `/realm/projection` takes `{sessionId,viewId}`; `/realm/graph` takes `{sessionId,limit?}`.
- Existing `/runtime/resolve` and `/runtime/resource` accept Host-configured `sharedOwner` with `sessionId`, then verify membership before resolving the owner's exact installed Package. Existing asset GET accepts `sharedOwner`/`sessionId` query parameters, limits access to Package closure and retains P5 delivery behavior.
- Host entry points are exported by `public/scripts/native/experience/index.js`. Loader's Host options accept `sharedOwner` and `signal`; arbitrary Package code cannot alter Host credentials. Shared snapshots feed existing `projection` and `shared` roots; Realm display uses `realm`. UI operations: `shared.open/submit/commit/cancel`, `realm.command/transfer/resume/cancel`.
- Fixtures and executable examples: `tests/native/helpers/shared-fixture.js`, `tests/native/shared-runtime-p8.test.js`, `tests/game-runtime/shared-host-p8.test.js`.

## Limits and evidence boundaries

- Single coordinating Host, existing local authenticated accounts, one Realm per owner/Package family. No cloud federation, external login provider, multi-process FS writers, distributed consensus, public discovery or Host election. P7 local-first Player assumptions are unchanged.
- At most 32 seats/participants/rules, 16 view/rule/Realm Command grants per seat. Protected Shared state is capped at 1 MiB and 2048 durable receipts; no silent replay-tombstone eviction. Each snapshot includes at most the latest 32 scene receipt projections plus existing P6 bounded views. Presence has at most 4096 live keys and 30-second expiry.
- Turn v1 is all-required, submit-once and explicit Host commit/cancel. Automated deadlines, optional slots, replace-own-input, AFK skip, custom host override policy and model-generated shared resolutions are not implemented. Existing P3/P4 Tasks/workflows can independently consume committed typed facts; P8 does not invent another Task scheduler.
- Split party is predeclared Actor/seat/scope structure; host may reassign non-owner membership into free declared seats. Dynamic authoring of scenes or a lobby editor belongs to later product work. Participants cannot clone or merge World snapshots.
- Realm Commands are bounded typed records. Participant grants write their own Host-derived record; Host-only declared Commands can coordinate shared records. No general guild/trade/arena product, arbitrary cross-player mutation, direct Player↔Realm asset exchange or atomic three-ledger transaction is claimed. The implemented transaction matrix is Session↔Player and Session↔Realm with independent receipts and disjoint Session endpoints. Adding direct exchange requires a separately designed lineage/reservation adapter rather than weakening P7 checks.
- Realm retains P7 record/byte/receipt limits and independent history. No new DB schema migration is required; resource kinds/keys use generic Native tables. Existing packages without `sharedRuntime` retain prior behavior.
- Host mount/HTTP and real renderer DOM were exercised. No browser visual session, multi-device LAN soak, media decoding, physical gamepad/speech, paid inference or external provider send was run. P9 owns lobby/visual authoring, complete product bindings, Health/Repair/Migration, scenario tooling and final integration. P8 does not claim those surfaces.

## Validation actually executed

**46 new P8 tests / 2 suites passed:**

| Suite | Tests | Evidence |
| --- | ---: | --- |
| `native/shared-runtime-p8.test.js` | 40 | Strict contracts; FS+SQLite ACL, identity, Presence, cursors, revocation/restore, concurrent submissions, atomic Turn rollback, split scopes, exact authenticated HTTP resource access, Realm revisions/Commands/grants, deterministic RNG, Saga failure/resume/compensation, Player/Realm coexistence and interlock rejection |
| `game-runtime/shared-host-p8.test.js` | 6 | Existing v2 DOM render/action, exact Package loader/mount, uncertain retry, cursor retention, permission clearing, out-of-order/disposed responses and one-write ceiling |

**364 existing tests / 19 targeted and adjacent suites passed**, for **410 distinct accepted tests / 21 suites across selected runs**:

- All P7 suites: `native/continuity-runtime-p7`, `native/content-composition-p7`, `game-runtime/continuity-host-p7` — **77 tests**.
- All P6 suites: `native/information-runtime-p6`, `native/information-session-p6`, `game-runtime/information-ui-p6` — **79 tests**.
- All P5 suites: `native/activity-runtime-p5`, `native/presentation-contract-p5`, `native/asset-delivery-p5`, `native/activity-host-p5`, `game-runtime/presentation-host-p5` — **89 tests**.
- Adjacent storage/Session/save/loader/Host: `native/storage-foundation.contract`, `native/session-core.contract`, `native/save-system`, `native/runtime-descriptor`, `native/session-runtime-http`, `game-runtime/package-loader`, `game-runtime/lifecycle-client-p4`, `game-runtime/ui-v2` — **119 tests**.

Selected completed runs included 191/191, 83/83, 56/56 and 55/55; these counts overlap. One adjacent run had 182/184 pass because the new Shared fixture lacked explicit text Experience metadata for runtime resolution; that fixture was corrected and the P8/loader closure passed 56/56. Earlier development failures for frozen declaration copying, resource-key registration, HTTP error type and jsdom UUID injection were fixed and rerun. Final P8 server tests passed 40/40 again after plain-JSON validation hardening. Do not present this as one broad/full-repo run.

Commands used `npm --prefix tests run test:unit -- --runInBand <selected suites> --silent --verbose=false`, with `ATRIA_DISABLE_MYSQL_TESTS=1` and `ATRIA_DISABLE_POSTGRES_TESTS=1`; storage evidence is FS+SQLite only.

- All changed/new JS passed ESLint and `node --check`; changed/new guards passed syntax; whitespace checks passed.
- **12 relevant guards passed:** A0 authoring, A3 cutover, A4 Experience, Experience foundation, message presentation, Task runtime, lifecycle, presentation, information, continuity/content, new Shared runtime and Native generation (`check-p4-native-generation.mjs`). New Shared guard passed again at closure.
- No full-repository, Android, Docker, paid-model, required CI or CI polling run. The unrelated historical `check-p5-native-runtime-ui.mjs` generation-profiles baseline assertion was not modified or rerun.

## Next continuation — P9 only

```text
继续 Atria Native Experience Modes & Capability Deepening，仅执行 P9 最终产品化与集成，完成后停止。

沿用 feat/native-experience-modes-capability-deepening。
P8 已推送：767d23a27019e0562c09548ad6ec50b39c8c4773。
保留全部 P0–P8 提交；main 当前为 4dab353ac639d42eae885c79e18245267abd6820。
先 fetch 并核实远端 HEAD，保留更新提交，不重置到旧 handoff。

依次读取 main:AGENTS.md、main:FORK_MAINTENANCE.md、docs 正式方案完整 §0（含 P8 实施边界）、详细 handoff、latest-handoff、P8 完成记录；必要时参考 P5/P6/P7 完成记录。

执行 P9：#19 Studio visual authoring v2 / Scenario Simulation / Test Bench、#20 Experience Health / Diagnostics / Repair / Migration、capability negotiation UI、author preview，以及 P0–P8 最终端到端产品集成。
复用现有 Native authority、Revision/Branch、scope epoch、exact dependency closure、renderer、scheduler 和持久化，不建立平行系统。
保持 P5 facts-before-Narrator / prose-only / typed Scene / receipt/time/asset/disposal 边界；P6 显式 exposure、Truth/Belief、Actor availability、Rollup 和 Open Loop 边界；P7 exact Base/Community proof、Player graph、Transfer lineage/grant/容量/receipt/byte 预留、resume 和发布前 compensation。
保持 P8 认证 Participant/ACL epoch、Scene 分队隔离、单 Session Truth、原子 Shared Turn、Host RNG、Snapshot+Cursor、独立 Realm 和跨 ledger prepared 互锁拒绝。
Shared/Realm/Player display 数据不自动进入模型 Context，Package 不获得 WebSocket/auth token/Secret/任意 network。

P8 是 single-Host typed runtime：固定席位、all-required/submit-once/Host commit-or-cancel、HTTP pull、每 owner/Package family 一个 Realm。Session↔Player 与 Session↔Realm 是独立 Saga、Session endpoint 不重叠；不声称直接 Player↔Realm 交易、三 ledger 原子交换、分布式协调或完整大厅/公会/交易行。按完成记录明确处理产品绑定与显示，不为了界面演示绕过这些 authority 边界。

P8 已通过 46 新增与 364 既有针对性/相邻测试（去重 410 项、21 suites）、lint/syntax/whitespace 和 12 guards。FS/SQLite、认证 HTTP、现有 v2 DOM 有证据；浏览器视觉、多设备网络/媒体/语音/gamepad 和付费模型未验证。历史 runtime-UI guard 的 generation-profiles 失败保持独立。

先诊断设计再实施。P9 才执行与本任务范围相称的 broad regression 和最终端到端验证；Android、Docker、付费模型仍未经授权，不默认运行。普通失败自行修复，仅真机/认证/权限等必须依赖用户时暂停。
完成代码和产品验证后提交推送、清理更新正式方案及 docs/handoff；通过最终验证后才合并 main，验证集成结果，再删除已完成工作分支。保留文档与可核验证据，报告最终 HEAD、检查结果和实际剩余边界后停止。
```


---

## Archived predecessor — P7

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

1. **Exact Add-on composition.** Optional `experienceContract.contentRuntime` v1 declares Base-owned extension points, accepted typed kinds, closed schemas and capacity. Host composition pins the Base Package ID/version/content hash and every Community AssetRef/hash. Dependencies require exact inclusion; conflicting IDs, duplicates, absent dependencies and cycles fail closed. Resolution has stable dependency ordering. It produces an immutable resolved PackageVersion through the existing PackageInstaller; the Base archive/source bytes and current-version pointer remain unchanged. Updating or disabling content means composing a new version for a new selection; existing Sessions keep their selected exact version.
2. **Typed shareable resources and Registry contract.** `atria-addon` carries multiple contributions; `atria-shareable-resource` carries one typed contribution without pretending to be a full Add-on. `assertCommunityRegistry` accepts bounded inert discovery metadata with exact targets/refs, rejecting URLs, latest-following selectors, scripts and trust flags. Supported extension kinds are `data`, `skill`, `template`, constrained by the receiving Base schema. Contributions compile to namespaced, ordered Package Data catalogs consumed by the existing loader/renderer. No Base reducer/source patch or new executable Plugin path exists.
3. **Revalidate on installation and portable import.** Community payloads pass bounded plain-JSON copying, closed-field validation and receiving-schema validation at install and again at composition. Text stays inert text; HTML-like strings are never treated as markup. Resolved archives embed the exact Base archive and exact Community bytes in existing AssetRefs, in addition to derived Data assets. Package/Descriptor closure validation requires these exact assets. Every resolved install/open recomputes the manifest, source files and asset set from those bytes and rejects tampered resolution. A fresh local account can install the resolved archive without an external registry or already-installed Base. This is a contract plus authenticated install/compose APIs, not a hosted public marketplace.
4. **Independent Player Continuity authority.** Optional `experienceContract.continuityRuntime` v1 declares typed domains, Command/Event/Reducer definitions, retention, transfer endpoints and explicit display views. Existing lifecycle schema validation and declarative reducers are reused. The authenticated Host handle plus Package ID identify the local player/family; Package execution cannot select another account. `atri_player_continuity` and immutable `atri_player_continuity_revision` use the same Native resource engine, integrity checks, commit-last publication and HEAD CAS as existing resources. No new database, localStorage, Session, World, or scheduler is introduced. No SQL schema migration is needed for the generic resource tables.
5. **Revision graph and receipts.** Continuity has a parent-linked immutable revision history, independent of Session Branches. Typed Commands record exact source Session/Revision/PackageVersion/content hash, command/event/args and idempotent receipts. Reusing an invocation with another request/anchor is rejected. Bounded graph reads and exact historical revision reads are available. A changed domain/schema/command contract fails with migration-required rather than silently rewriting old facts. Session restore does not rewind the player graph.
6. **Transfer Intent / Receipt / Saga.** Declared endpoints move complete typed records between an existing lifecycle Session domain and a Continuity transfer domain. Incoming values are checked against the receiving schema; payload values, lineage, ownership and account identity cannot be supplied as arbitrary patches. Host-derived lineage is stable across Branches; withdrawal carries its lineage and a new ownership grant into protected `atri_transfers`. Preparation durably reserves lineage, target record capacity, receipt capacity and publication bytes before any Session debit. Session debit/credit plus local transfer marker publishes through the existing immutable SessionRevision path. Final Continuity publication owns the committed TransferReceipt.
7. **Failure and recovery.** Exact retries inspect durable Session transfer markers and publish once. An explicit `transfer.resume` reconstructs the original stored intent after a service restart; it does not require a surviving browser Promise or operation. Before Session publication, explicit cancellation compensates escrow and releases its reservation. After Session publication, cancellation is rejected and forward recovery finishes the recorded transfer. While prepared, ownership is unavailable at both ends; Session publications, Branch changes, Session deletion and actual generation are blocked. Host recovery controls can mount without advancing automation, and static Ready preflight remains possible. Existing scheduler/Host execution is reused.
8. **Ownership reconciliation.** Current reads and every Session publication consult the independent ledger. Fork, switch, restore and same-account old-save import cannot reactivate a lineage that is externalized or belongs to another Session/grant. Historical raw snapshots remain immutable and expose external-effect diagnostics. Recreating an exported record ID cannot remint it. Stable transferable record IDs are entity identities for that Session/domain; authors must use a fresh ID for a genuinely new entity. Withdraw → redeposit → restore tests preserve one lineage across Sessions.
9. **Existing Host/renderer integration.** Authenticated Session routes provide Continuity commands, display projections and graph reads. Existing mount-scoped lifecycle transport supplies retry, cancellation, history/busy and stale-result guards. Existing v2 expressions gain the read-only `continuity.<viewId>` display root; four Continuity action operations enter the same Host transport and count toward the one-authority-write ceiling. Message action policies cannot write Continuity; Opening confirmation cannot smuggle in a second authority. Render/model/authority/transfer receipts remain distinct.
10. **Exposure is explicit.** Continuity views expose declared fields with exact player revision and domain-relevant receipt refs. They are display-only and are not automatically injected into Context/Tasks. P6 information sources, Truth/Belief separation, scoped threads, bounded graph/Actor availability, Rollup fingerprints/Branch/epoch invalidation and Open Loop/Memory separation are retained. Pending transfers do not bypass Actor availability or static preflight distinctions. P5 settlement-before-Narrator, prose-only handoff, Scene Cue IR, exact asset delivery, elapsed clocks and disposal boundaries remain in force.

## Concrete seams

- Content declarations: `public/shared/native-content-contract.js`; proof/materialization: `src/native/content-composition.js`.
- `contentRuntime`: `{schemaVersion:1, extensionPoints:[{id,resourceId,kinds,schema,maxItems}], composition?}`. `composition` is the resolved proof `{base:{packageId,packageVersionId,packageContentHash},resources:[{assetId,contentHash}]}`.
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
- An offline save transported to another independent account/device does not carry or synchronize player authority. Same-account restore/import reconciles against its ledger; imported withdrawal grants with no matching player ownership fail closed. This is not a cloud anti-cheat or distributed ownership protocol.
- Continuity display state is explicitly separate from model Context. There is no new automatic Continuity Prompt source; historical Task explanations continue to use their existing captured inputs. Historical Session presentation can show current player projections, identified by their independent exact revision.
- No new page layout was introduced. DOM renderer/Host behavior was exercised; browser visual QA, real media decoding, audible speech, physical gamepad and paid-model output quality remain unverified. P8 owns shared identity/ACL, Presence, Realm and networking; P9 owns broader authoring/health/migration and final integration.

## Validation actually executed

**77 new P7 tests / 3 suites passed:**

| Suite | Tests | Evidence |
| --- | ---: | --- |
| `native/continuity-runtime-p7.test.js` | 38 | Strict schemas, FS/SQLite commands/history, independent revisions, lineage, cross-Session withdrawal/redeposit, fork/switch/restore/save import, races, scope epoch, forged writes, escrow/capacity, failures before and after Session publication, resume/compensation, authenticated HTTP, pending model/delete guards |
| `native/content-composition-p7.test.js` | 34 | FS/SQLite install/compose/reopen, immutable Base, typed shareable/Registry, payload revalidation, exact dependency order/conflicts, proof tamper rejection, fresh-account portable import, receiving capacity |
| `game-runtime/continuity-host-p7.test.js` | 5 | Actual v2 DOM render/refresh/typed action/disposal, one-write ceiling, historical Message restrictions, uncertain retry, late projection, restart recovery mount |

**326 existing tests / 20 targeted and adjacent suites passed** across selected runs:

- All P6 suites: `native/information-runtime-p6`, `native/information-session-p6`, `game-runtime/information-ui-p6` (**79 tests**).
- All P5 suites: `native/activity-runtime-p5`, `native/presentation-contract-p5`, `native/asset-delivery-p5`, `native/activity-host-p5`, `game-runtime/presentation-host-p5` (**89 tests**). Only assertions about future reserved capability names were moved to P8+; execution assertions were retained.
- Package/Host/Session/storage: `native/runtime-descriptor`, `native/package-build-install`, `game-runtime/package-loader`, `game-runtime/lifecycle-client-p4`, `native/storage-foundation.contract`, `native/session-core.contract`, `native/save-system`, `native/session-runtime-http`, `native/product-http`, `game-runtime/ui-v2`, `native/context-compiler`, `native/context-derived` (**158 tests**).

Total accepted distinct coverage: **403 tests / 23 suites**, not a claim of one combined full-suite command. Selected runs included 221/221, 123/123, final P7 + lifecycle 107/107, final Context/P6/Activity Host 44/44 and final composition/descriptor/loader 92/92. Counts overlap. After the publication-byte follow-up, Continuity's **38/38** passed again.

Commands used `npm --prefix tests run test:unit -- --runInBand <selected suites> --silent --verbose=false`, with MySQL/Postgres harnesses explicitly disabled; real local storage evidence is FS and SQLite. Ordinary initial test failures were corrected (assertion wording and fixture account/package/save-container setup), and the affected tests passed on rerun.

- Changed/new JS passed ESLint; changed JS/MJS passed `node --check`; staged/unstaged whitespace checks passed. Follow-up authority changes passed their targeted lint/syntax checks.
- **11 guards passed:** A0 authoring, A3 cutover, A4 Experience, Experience foundation, message presentation, Task runtime, lifecycle runtime, presentation runtime, information runtime, new continuity/content runtime, Native generation (`check-p4-native-generation.mjs`). The new P7 guard was also rerun after closure refinements.
- No full-repository run, Android, Docker, paid inference, external provider send, required CI or CI polling. Historical `check-p5-native-runtime-ui.mjs` was not edited/rerun; its previously recorded obsolete `generation-profiles` assertion remains separate from the passing presentation guard.

## Next stage

Stop now. Next authorized continuation should be **P8 only — Shared Session & Realm Runtime**, capability #31. Read the formal plan §0, both updated handoffs and this record; preserve the actual latest remote work HEAD. Reuse this exact-content and Player Transfer contract while adding participant identity/ACL, shared turn, Presence, reconnect/cursors, Scene Scope, deterministic shared rules/RNG and Realm authority. Do not merge main or delete the branch until P9 final verification.

## Next continuation — P8 only

```text
继续 Atria Native Experience Modes & Capability Deepening，仅执行 P8，完成后停止，不继续 P9。

沿用 feat/native-experience-modes-capability-deepening。
P7 已推送：cb2abf54b7aacc0f16057ddc3ec1e2a98f24c111。
P7 主实现 d5579740b0efa9fc76a5e0b22d54eac292351ae7 与此前 P0–P6 提交全部保留。
main 保持 4dab353ac639d42eae885c79e18245267abd6820；P9 最终验证前不合并 main、不删除工作分支。

先 fetch，核实远端 HEAD，保留全部更新提交，依次读取：
1. main:AGENTS.md
2. main:FORK_MAINTENANCE.md
3. docs:feat/native-experience-modes-capability-deepening.md 的完整 §0
4. docs:handoff/native-experience-modes-capability-deepening.md
5. docs:handoff/latest-handoff.md
6. docs:feat/native-experience-p7-completed.md
随后检查当前相关代码、测试与 guard。

执行 P8 — Shared Session & Realm Runtime，覆盖 #31：participant identity / ACL、shared turn、presence、late join / reconnect、Snapshot + Cursor、Scene Scope / split party、deterministic shared rule / RNG、Realm domain、Session / Player / Realm cross-authority transaction。
Host 是 participant capability role，不开放 publishArbitraryWorldSnapshot；one truth, many perspectives；Package 不获得 WebSocket、auth token、Secret 或任意 network。
不得提前实现 P9 Studio / Health / 最终集成主体，不合并 main。

复用 P0–P7 authority、Revision、Branch、scope epoch、exact closure、renderer、scheduler 和现有持久化路径。
保留 P7 exact Base/Community proof、typed extension-point schema、portable composed PackageVersion，以及独立 Player Continuity revision graph。
Transfer Intent/Saga 必须保留 lineage、ownership grant、目标容量/receipt/byte reservation、幂等 replay、durable Session marker、resume 与发布前 compensation。
旧 Branch / save restore 不能重新 claim 已 externalize 的资产；prepared 期间不允许 Session 写入/删除/实际 generation，Host 可挂载恢复控件并静态 preflight。
现有 Transfer adapter 操作 typed lifecycle Application records；Continuity display view 不自动进入 Prompt。不要用 Shared authority 掩盖或回滚 Player authority。

保持 P6 显式 display/context grants、Truth/Belief/narrative 分离、bounded graph、Actor availability、Task projection context、Rollup source fingerprint/Branch/epoch 过期边界、Open Loop/Memory 分离。
保持 P5 Activity facts 先提交再 Narrator、prose-only handoff、typed Scene Cue IR、不同 receipt、elapsed/World/logical/wall time 分离、exact Asset delivery、Host disposal/focus/fullscreen 清理。

P7 新增 77 项测试与 326 项既有针对性/相邻测试通过（403 项、23 suites，分批去重）；修改区域 lint/syntax/whitespace 和 11 个 guard 通过。
证据包含 FS/SQLite、真实 typed HTTP、existing v2 DOM 和 Host 故障恢复；浏览器视觉、媒体解码、真机语音/gamepad、云同步/分布式冲突和付费模型输出未验证。
历史 check-p5-native-runtime-ui.mjs 的已知 P4 基线 generation-profiles 失败保持独立，不顺手重构无关 UI。

先诊断设计，再实施。仅运行针对性/相邻测试、修改区域 lint/syntax 和相关 guard；不跑全仓、Android、Docker、付费模型，不依赖 CI。普通问题自行修复。
完成后提交推送工作分支，更新 docs 两份 handoff 和 P8 完成记录；仅实质设计变化才改正式方案。
核验远端、工作区和 main，提供验证结果、剩余边界及 P9 接手提示词，然后停止。
```


---

## Archived predecessor — P6

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


## Next continuation — P7 only

```text
继续 Atria Native Experience Modes & Capability Deepening，仅执行 P7，完成后停止，不继续 P8。

沿用 feat/native-experience-modes-capability-deepening。
P6 已完成并推送，交接 HEAD：52e1750d9353631878c4b6561945e1eff275e5b4。
main 保持 4dab353ac639d42eae885c79e18245267abd6820；P9 最终验证前不合并 main、不删除工作分支。

先 fetch 并核实实际远端 HEAD，保留所有已有及更新的远端提交，再依次读取：
1. main:AGENTS.md
2. main:FORK_MAINTENANCE.md
3. docs:feat/native-experience-modes-capability-deepening.md 的 §0
4. docs:handoff/native-experience-modes-capability-deepening.md
5. docs:handoff/latest-handoff.md
6. docs:feat/native-experience-p6-completed.md
随后检查相关当前代码、测试与 guard，以实际代码和最新交接为准。

执行 P7 — Add-on / Community Contract / Player Continuity / Cross-Authority Transfer：
覆盖 #25/#30；exact Add-on composition、typed shareable resource、Player Continuity revision graph、Cross-Authority Transfer Intent / Receipt / Saga。
Session Branch restore 不能复制已 externalize 的资产；Add-on 不 patch Base Package source；Community payload 在 install 时重新 validate/sanitize；Player Continuity 可 local-first，云同步不是 Package 前提。不得提前实现 P8 Shared Session/Realm 主体。

复用 P0–P6 authority、Revision、Branch、scope epoch、exact resource closure、renderer、scheduler 与现有持久化路径，不建立第二套 Session/World/事实源。
保持 P6 World Truth / Actor Belief / canonical narrative 分离、显式 display/context grants、bounded graph/Actor availability、Task projection context、derived rollup/source fingerprint/branch/epoch 边界，以及 Open Loop 与 Memory 分离。
信息 runtime 的 unscoped supplemental messages 与 generic derived writes 被拒绝；补充数据走声明的 Task input。Actor availability 在执行时检查，不阻断 Ready 的静态 binding preflight。
保留 P5 先提交 Activity facts 再让 Narrator 读取 committed Observation、prose-only Narrator、typed Scene Cue IR、三类 receipt 分离、Activity elapsed 与 World/logical/wall time 分离、exact Asset delivery、Host disposal/focus/fullscreen 清理。

P6 新增 79 项测试、P5 的 89 项专项回归、相邻 270 项测试和 10 个相关 guard 已通过；这是不同命令的去重结果，不是一次全仓运行。DOM renderer 与真实 Host preview/Ready preflight 已验证；浏览器视觉、媒体解码、真实语音/gamepad 和付费模型输出未验证。
历史 check-p5-native-runtime-ui.mjs 的 generation-profiles 已知 P4 基线失败与通过的 check-native-presentation-runtime.mjs 不同，不顺手重构无关 UI。

先诊断设计，再实施最小完整改动。只运行针对性/相邻测试、修改区域 lint/syntax 和相关 guard；普通问题自行修复，不机械跑全仓，不跑 Android、Docker、付费模型调用，不依赖 GitHub CI。
完成后提交并推送当前工作分支，在 docs 更新两份 handoff 和 P7 完成记录，仅实质设计变化才修改正式方案。核验远端、工作区和 main 未变。提供实现摘要、验证结果、剩余边界及 P8 接手提示词，然后停止。
```

---

## Archived predecessor — P5

# Handoff — Native Experience P5 complete

Updated: 2026-09-27. **P5 complete and pushed; stop before P6**.

- Work branch: `feat/native-experience-modes-capability-deepening`.
- Work HEAD: `e21eb93489ae7fad4fb3874c532e797337f689d3` (pushed).
- Baseline: `5beee588ef82fb4cb47d8dafc33526d190aadb15`; P0–P4 preserved.
- Main unchanged: `4dab353ac639d42eae885c79e18245267abd6820`. No merge or branch deletion before P9.
- Formal plan §0 unchanged; P5 follows the frozen design. Only P5 is complete in this continuation.

## P5 implemented

1. **Versioned contract and typed authority.** Optional `experienceContract.presentationRuntime` v1 declares Activity, Scene, Asset Pack, Actor Voice and Host requirements. Exactly `activity`, `media-scene`, `asset-pack`, `safe-presentation`, `host-presentation-input` v1 become supported. P6+ capabilities remain reserved. Closed JSON fields, scope/Task references, outcome schemas and exact inert-media dependencies are validated through the existing Package/Descriptor paths.
2. **Activity settlement before narrative.** Typed `activity.start/pause/resume/settle/cancel` reuse the existing lifecycle command, protected `atri_lifecycle`, immutable SessionRevision and expected-HEAD publication. Settlement applies one declared App or World Command; `publishActivities` supplies the real committed Revision/Branch to the validated Observation and durable Task outbox atomically. Narrator input incompatibility leaves no partial facts. The existing Host scheduler resumes the exact declared Task/Variant, then task result, canonical assistant Variant, completion status and authority receipt publish together. Narrator returns prose, not executable Scene markup or new authority. Render, model-delivery and authority receipts stay separate.
3. **Replay, history and elapsed.** Activity instances retain run/scope epochs, elapsed samples, observations and completion state in the same revision snapshot. Terminal tombstones prevent replay after retention. Restore/fork carries the earlier state; cancel/suspend closes late narrative without erasing committed settlement facts. Host elapsed starts only after acknowledged start/resume, stops on explicit pause or mount invalidation, and requires explicit resume after restart. Uncertain retry preserves the exact sample and pending command; resumed runs reject old epochs. `getActivityProjection()` supplies typed Activity identity plus elapsed to the existing temporal projection; no mount-duration or wall/World-clock substitution.
4. **One renderer.** Typed Scene Cue IR supports image/audio/video/caption/speech/clear, bounded to declared exact AssetRef or selected-Variant Attachments. `scene` is a v2 leaf; media/speech primitives are Host-only. Scene compiles into the existing `mountUiDocument` and SurfaceHost, not a second renderer. Caption/speech content remains text. Package actions can call declared Scene/Activity/fullscreen/focus operations, while the one typed-authority-write ceiling remains.
5. **Exact media delivery.** The authenticated existing Session asset route supports GET/HEAD, strong ETag, conditional delivery, single byte ranges and 416 responses. Existing AssetStore verifies hash/size with bounded memory and streams from the same open blob. Responses use inert MIME handling, nosniff, CSP and private immutable caching. Eager packs are fetched and SHA-256 verified before Ready; optional failures become render receipts. Lazy resources validate on demand. Limits include 64 cues, 64 Activity declarations, 128 retained Activity records, 512 MiB per pack budget and 64 MiB total unique eager resources.
6. **Host capabilities and cleanup.** Required unsupported Host capabilities block prepare. Speech uses player-owned local voice preferences and explicit user activation; no provider credentials enter Package execution. Fullscreen requires activation and a mounted current Scene. Focus restores on disposal/scope invalidation; delayed fullscreen completion is exited if its mount has gone stale. Gamepad samples are bounded, deadzoned, edge-based Host input only. Responsive/reduced-motion changes remain non-authoritative projections.
7. **Final integration fixes.** Runtime initialization failure disposes its prepared Presentation Host. Superseded UI cleanup checks load identity before releasing the current Host. Elapsed projection uses the typed adapter rather than a bare number. Scope invalidation and late fullscreen resolution release owned interaction state. The old exact responsive-environment assertion now includes reducedMotion, with a change-listener disposal regression.

## Validation actually executed

**89 P5 tests / 5 suites passed:** Activity authority 34 (FS + SQLite), Scene/contract 30, asset HTTP/delivery 9, Presentation Host/real v2 mount 14, restarted Host/exact non-default Narrator preflight 2. Three additional regressions extend existing Ready/environment suites.

- Initial targeted/adjacent run: **14 suites / 324 tests passed**, covering P4 lifecycle/Opening/Ready, Task, UI, descriptor and resource routes alongside the then-existing P5 tests.
- Broader closure run: 18 unaffected suites passed; its responsive-environment assertion initially failed only because the new reducedMotion field was absent from the expected object. That suite was corrected and rerun alone: **3/3 passed**. Latest accepted results across these 19 suites total **297/297**; this is an aggregate of the closure run plus its targeted correction, not a claim that the initially failing command passed.
- Closure includes Session core/HTTP/history/projection/save, Package build/install/loader/descriptor, model Host, Native Play, v2/live UI and responsive environment. FS/SQLite and synthetic fixtures/fake generation only.
- Real `activateNativeExperienceRuntime → SurfaceHost → mountUiDocument → Scene` mount/disposal is tested with DOM, without mocking that activation or renderer. A restarted NativeGenerationHost drains a settled Activity and verifies committed facts before its fake execution response, publishing canonical narrative once. Required non-default Narrator Variant is included in read-only preflight with no model send.
- Changed JS and guards passed ESLint; modified JS/MJS syntax and staged whitespace checks passed. Nine relevant guards passed: A0, A3, A4, Experience foundation, message presentation, Task, lifecycle, new presentation runtime, and Native generation.
- Historical `scripts/check-p5-native-runtime-ui.mjs` (an earlier project's P5) still expects the removed `generation-profiles` library section. It failed identically on the untouched P4 baseline. Neither that script nor its unrelated product UI was changed; this is not the new P5 presentation guard.
- Full isolated rollback restored **18 original SHA-256 hashes**, removed **11 new files**, restored `activity.supported=[]`, and reran the original **52/52 tests / 4 suites**. The active worktree and modified artifact retain all 29 P5 paths and `activity.supported=[1]`.
- No full-repo/Android/Docker/paid-model/required-CI run. The browser control inventory returned `Codex auth token is unavailable`; no live-browser visual QA, actual media decoding, audible speech, physical gamepad or mobile-device behavior is claimed. DOM and simulated Host tests are distinct from device/browser evidence.

## Delivery and remaining boundaries

Implementation commit contains 29 paths; no local evidence, generated binaries, caches or user data is committed. `feat/native-experience-p5-completed.md` records the stage. Machine-local verification artifacts preserve the incoming worktree, original/modified hashes, complete patch, literal commands/results and tested rollback.

Activity is an authority/handoff contract rather than a bundled minigame. Scene is typed presentation, not model-generated executable UI. Live speech availability depends on installed local voices; required capability negotiation does not prove device output. Elapsed is an explicit active Host projection, not an authoritative real-time simulation or automatic background-tab pause. Restore does not resurrect provider streams, audio playback or fullscreen; Activity resume remains explicit. Lazy media errors appear on demand. Retention reuses P4 logical compaction/tombstones rather than physical GC. P6 owns deeper scoped information, graph queries, actor perspective/context and rollup semantics; P9 owns final migration/health/productization.

## Next continuation — P6 only

```text
继续 Atria Native Experience Modes & Capability Deepening，仅执行 P6，完成后停止，不继续 P7。

沿用 feat/native-experience-modes-capability-deepening；P5 已完成并推送，HEAD：e21eb93489ae7fad4fb3874c532e797337f689d3。先 fetch，读取 main:AGENTS.md、main:FORK_MAINTENANCE.md、docs:feat/native-experience-modes-capability-deepening.md 的 §0、两份 handoff；保留所有更新的远端提交，以实际 HEAD 为准。

执行 P6 — Data Projection / Perspective / Scoped Information / Narrative Rollup：覆盖 #5/#26、#16 的 Context/Perspective 深化、bounded graph query、Actor availability、Hierarchical Narrative Rollup，以及 Open Loop 与 Memory 分离。复用 P0–P5 authority、Revision、Branch、scope epoch、exact resource closure 与 renderer；World Truth 与 Actor Belief 分离；Perspective 是 projection，不是 NPC World clone；Rollup 是 derived recall artifact，不替代 authority；player-only/presentation-only 数据不自动进入 Prompt。

保留 P5 已提交 Activity Observation → Narrator 的顺序、Narrator prose-only、typed Scene Cue IR、三类 receipt、真实 Activity elapsed 与 World/logical/wall time 分离，以及 exact Asset delivery/Host disposal 边界。现有 P5 DOM/Host 集成测试与新 guard 是回归基线。浏览器视觉/媒体解码/实际语音与 gamepad 设备证据未取得；历史 check-p5-native-runtime-ui.mjs 的 generation-profiles 断言在 P4 原基线同样失败，与本任务新的 check-native-presentation-runtime.mjs 不同。

只运行针对性/相邻测试、修改区域 lint/syntax 和相关 guard；普通问题自行修复，不机械跑全仓，不跑 Android、Docker、付费模型调用，不依赖 GitHub CI。完成后提交推送工作分支，更新两份 handoff 和阶段记录；仅实质设计变化才改正式方案。停止并提供 P7 接手提示词。P9 前不合并 main、不删除工作分支。
```

---

## Archived predecessor — P4

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

1. **Strict lifecycle contract.** Optional `experienceContract.lifecycleRuntime` v1 declares scopes, typed per-record Application domains, World clocks and bounded advance commands, automations, Workflow graphs, deferred interaction mappings and retention. It is validated through existing Package/Descriptor paths. Fixed App mutations compile through the existing Command/Event/Reducer shorthand; unknown fields, unsafe keys, undeclared refs, invalid versions/assignments and Task authority escalation fail closed. Enable exactly `session-application@1`, `temporal@1`, `workflow@1`, `runtime-automation@1`; P5+ remains reserved.
2. **One Native authority.** Protected `atri_lifecycle` is another state document in existing immutable SessionRevision snapshots, not a new database/Session. App records, scope epochs, clocks, workflow phase/node instances, automation cursors, Opening setup, pending Task intents, scheduled interactions and authority receipts commit with expected HEAD. Existing save/load, fork and revision restore carry the exact domain view. Generic state patch/delete cannot write this namespace. App state is not automatically exposed to model context.
3. **Experience Ready Barrier.** Exact Package identity/support/dependencies and validated restored domains precede Task binding preflight and projection/UI mounting. Read-only `/generation/lifecycle/prepare` uses the existing RouteResolver to validate default/automatically referenced exact Task Variants, resource closure, connection/model and capabilities without provider send. Only successful current mounts emit `EXPERIENCE_READY`; SESSION_LOADED alone does not start automations. Superseded loads, failed mounts, historical views and timeouts cannot publish startup work. `acceptOperationSnapshot.acceptGuard` rechecks after network loading, before changing the active projection.
4. **Complete Opening lifecycle.** Opening setup values, conditional step/history and completion resume from `atri_lifecycle.opening`. Server checks typed drafts, lawful next/back navigation, field constraints and exact pinned confirm Action. Confirmation Command, optional canonical Composer user input and `completed` marker commit atomically. Frontend then uses the existing Composer/generation entrypoint for the already-committed user message; it does not redispatch World authority or append input again. Lost response retry uses the same invocation; restore/fork restores the incomplete Opening without future facts. Variant/narrative/projection contracts remain unchanged.
5. **Four time domains.** World clocks use declared clock identity + nonnegative integer ticks; only declared bounded advance commands move them. `logicalTime` advances with Native revisions, independently of World time. Wall time stays in Host timeout/diagnostic projection. Activity elapsed is an explicitly supplied Host projection and defaults to null; Experience mount duration is not treated as Activity time. Calendar/UI formatting does not become clock authority.
6. **Scope lifecycle.** Declared session/world/scene scopes have active/suspended/archived status and monotonic epochs. Suspension freezes writes and hides domain records from active-scope projections; thaw preserves data; archive is terminal. Pending work from prior epochs cannot finalize. Workflow Task nodes create fresh intents after thaw, instead of reusing cancelled ones. No array-moving or duplicate World snapshots.
7. **World Process and Automation.** `experience.ready`, World schedules and logical revision intervals trigger bounded typed actions. World actions use the same pinned private World/Command/Rule/Reducer preparation as P3. `all/latest/skip` catch-up cursors commit atomically with effects and survive restart. One pump processes at most 24 due occurrences under a 32-action transaction ceiling. Startup receipts are once per scope epoch. The browser never invents its own clock/scheduler or recursively wakes on its own lifecycle snapshot installation.
8. **Durable Scheduled Interaction.** An explicitly accepted fresh P3 advisory/proposal may be mapped through declared `interactions` to `{recordId,dueTick,args}` for one typed App Command. Package automation cannot auto-accept arbitrary model proposals. WorldInstant bounds, Task/Variant schema, scope, anchor and target command are validated; acceptance consumes the P3 proposal and creates a revision-backed scheduled record. Due delivery runs that App reducer, once only; cancel/scope change closes or stales the intent. This is App content delivery, not a new conversation renderer or model-delivery receipt.
9. **Workflow / Phase Graph.** Persistent user/opening/action/model_task/wait_until/automation/projection/terminal nodes store phase, instance and durable refs. Transitions validate from/to, scope, Opening completion, Task result and temporal gate; typed on-entry actions have once-only receipts. Cancellation closes work and blocks late finalize. Single-record Quest states remain App-command shorthand. Activity/subflow/rollup product bodies are not introduced early.
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
- `opening.complete` may carry declared `confirmation`, `submission` and temporary typed `preferences`. Server derives and checks pinned Action output; preferences do not become Session authority.
- App/interaction/workflow authority receipts, model-delivery receipts and existing render receipts remain separate. No new Runtime role, mutable Variant or naked Interpreter patch.

## Actual P4 verification

**386 new P4 tests across 7 suites passed**, excluding rerun double counts:

| Suite | Tests |
| --- | ---: |
| `native/lifecycle-contract-p4.test.js` | 220 |
| `native/lifecycle-runtime-p4.test.js` | 108 (FS + SQLite) |
| `native/lifecycle-opening-p4.test.js` | 8 (FS + SQLite) |
| `native/lifecycle-scheduler-p4.test.js` | 6 |
| `game-runtime/lifecycle-client-p4.test.js`, `ui-opening-p4.test.js`, `experience-ready-p4.test.js` | 44 |

Targeted/adjacent suites actually run and passed: `native/task-runtime-p3.test.js`, `experience-actions.test.js`, `session-runtime-http.test.js`, `session-core.contract.test.js`, `save-system.test.js`, `model-prompt-runtime-p4.test.js` (the earlier project's suite name), `session-projection.test.js`, `session-history-p2.test.js`, `runtime-descriptor.test.js`, `package-build-install.test.js`, `authoring-contracts.test.js`, `contracts.test.js`, `runtime-lifecycle.test.js`; `game-runtime/package-loader.test.js`, `ui-v2.test.js`, `ui-live.test.js`; `atria-shell/native-play-product.test.js`.

Commands used `npm --prefix tests run test:unit -- --runInBand <selected paths> --silent --verbose=false` or the equivalent direct Jest command, with `ATRIA_DISABLE_MYSQL_TESTS=1` / `ATRIA_DISABLE_POSTGRES_TESTS=1`. All changed JS passed ESLint; both changed guards passed node syntax checks; staged/unstaged diff whitespace checks passed.

A0, A3, A4, Experience foundation (53 files), P2 message presentation, P3 Task and P4 lifecycle guards passed. Existing P0 descriptor/loader assertions and P3 guard were updated from now-supported Workflow/P4 to still-reserved Activity/P5+; production fences remain intact.

Full P4 diff rollback was exercised only on an isolated copy: **15 original files restored by SHA-256, 12 new files removed**; the same baseline Task/Action/HTTP suites passed **49/49** after restore. The actual worktree and modified artifact remained changed. Evidence/artifact paths are machine-local and deliberately not committed. No full-repo tests, Android, Docker, paid inference or required GitHub CI. UI behavior was checked with DOM/real integration-module tests, not a live browser visual session; no new visual design was introduced.

Routine issues resolved: missing local git identity used the existing task-series `Codex <codex@openai.com>` identity per command (no global config); obsolete reserved-capability expectations were corrected; temporary DB defaults in an agent baseline were narrowed to FS/SQLite before the successful run.

## P4 boundaries for the next stage

- Existing packages without lifecycleRuntime keep their prior paths. The new v1 domains are initialized for their exact immutable Package; unknown versions fail closed. Generic migration/repair UI remains P9.
- Only declared lifecycle Task intents resume across Host restart. Arbitrary in-memory P3 foreground/detached operations and partial provider streams are not serialized. Re-execution may contact a provider again after a crash, but authority finalization stays once-only.
- Pumps and drains are deliberately bounded. External revisions, successful experience reload/ready and explicit Host wakeups continue remaining work; there is no unbounded startup loop.
- Logical intervals observe revision order, not a hidden World clock. World catch-up never derives ticks from wall time.
- Retention is revision-view compaction, not physical repository GC. Tombstone/receipt hard-cap exhaustion requires an explicit future policy rather than silently re-enabling old invocations. P6 owns deeper typed-reference indexes and projection/context behavior.
- P5 must supply real Activity elapsed values and integrate Activity/Scene/Media with these already-implemented barriers/epochs/receipts. No P5 body was implemented here.

## Next continuation — P5 only

```text
接手 GitHub 项目 ZZZdragondYNGPHX/Atria。本次只执行 P5，完成后停止，不继续 P6。

沿用 feat/native-experience-modes-capability-deepening。
P4 已完成并推送，HEAD：5beee588ef82fb4cb47d8dafc33526d190aadb15

先 fetch，依次读取：
1. main:AGENTS.md
2. main:FORK_MAINTENANCE.md
3. docs:feat/native-experience-modes-capability-deepening.md 的 §0
4. docs:handoff/native-experience-modes-capability-deepening.md
5. docs:handoff/latest-handoff.md
6. 相关代码、测试与 guard

远端若推进，保留已有提交，以最新 HEAD 为准；不重审历史重型角色卡。

执行 P5 — Activity / Media / Scene / Asset / Host Capability：
覆盖 #17/#18/#21/#22/#23、typed Scene Cue IR、
Activity Outcome → Narrative Handoff、Asset Pack / heavy delivery、
Speech / Actor Voice，以及 Fullscreen / focus / gamepad / responsive capability negotiation。

复用 P0–P4 contract、现有 Native authority、Task/Turn scheduler、atri_task_results
与 atri_lifecycle。Activity settlement 先通过 typed authority 原子提交 facts，
再给 Narrator 已提交 Observation；Model 不输出 HTML/CSS/JS scene，
Scene/Media 只引用 exact AssetRef / Attachment。
保持 Experience Ready Barrier、Scope Lifecycle、跨重启与 retention、
Branch/Revision coherence、once-only receipts、stale/cancel/finalize 边界。
区分 World Clock、logical revision time、wall clock、Activity elapsed time；
Activity elapsed projection 默认 null，由真实 Activity 注入，不拿挂载时长冒充。
保持 immutable Variant、canonical narrative/projection 分离、provisional Narrator、
semantic-only Interpreter、Task semantic/Runtime role/Model binding 和三类 receipt 分离。
不建立第二套 renderer、Session、scheduler 或 persistence。

只运行针对性/相邻测试、修改区域 lint/syntax 和相关 guard。
普通失败自行修复；不机械跑全仓，不跑 Android、Docker、付费模型，
不依赖 GitHub CI。完成后提交推送当前分支，更新两份 handoff；
仅实质设计变化才修改正式方案。停止并提供 P6 接手提示词。
P9 最终验证前不合并 main、不删除工作分支。
```

---

## Archived predecessor — P3

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

1. **Package Task/Turn contract.** Optional `runtime.experienceContract.taskRuntime` is validated through existing Package/Descriptor paths. Exact Task Prompt and Generation identities must resolve inside the Package's existing model/prompt resource closure. Task semantic ID, immutable Variant, Binding Slot and the existing fixed Runtime role vocabulary remain separate. No new per-business-task runtime role, renderer, Session or persistence family.
2. **Task Binding / Model Execution Lane.** Player `capabilitySettings.atri_task_bindings[packageId][slotId]` stores only a player Runtime Route reference, through existing settings/save. The Host borrows that route's model, connection, fallback and execution policy, and composes the Task Variant's exact Package Prompt/Generation resources over every fallback lane. It does not inherit the borrowed Narrator Prompt or prompt parameters. Route/model/connection snapshots are captured before queue execution, so later player edits cannot change the reserved resource identities. GenerationService, RouteResolver, PromptCompiler, Secret port and EffectiveRequestSnapshot remain the actual execution path.
3. **Result authority and exposure.** Closed bounded input/output schemas reuse the existing data-schema compiler and World schema validator. P3 sinks are `advisory→proposal`, `turn_context→turn`, `presentation→artifact`, `world_outcome_proposal→proposal`. Future Session App / Activity / Media sinks fail closed until their phases. Context opt-in (`input/history/world/knowledge`) filters the existing Native selection; arbitrary stored state and past proposals do not enter prompts. P6 still owns deeper actor/perspective/source-budget work.
4. **Authority-first Turn.** For a Package with declarative World logic and free-text input, the existing Intent Resolver/tool catalog resolves only explicitly exposed Commands. The same World/Command/Rule/Reducer engine commits facts before Narrator reads them. Already-committed facts survive a later narrative failure by design; the Host never retries the entire authority-producing Turn automatically. Native retry/fork remains the explicit way to choose an earlier revision.
5. **Narrative-outcome Turn.** Up to four synchronous `turn_context` Tasks run as provisional stages. The ordinary Narrator route or optional presentation Task Variant produces the draft. The Interpreter Task receives `{narrative, stages}` as semantic evidence and emits only the existing semantic decision/event/confidence/severity/participants/evidence shape. Its Package allowlist/confidence policy is validated again at finalize; arbitrary numeric patches are rejected. Pinned declarative Interpretation Mapping → typed Command → Rule/Reducer prepares a private candidate using the existing World engine and the same Package/EntryPoint RNG seed. SessionCore atomically commits narrative, projection, World/Event state and Turn receipt with expected HEAD. Failed validation/cancel/stale never publishes the draft.
6. **Turn Envelope extension.** `outcomes` now accepts up to 16 typed `{requestId, interpretation}` proposals, not arbitrary JSON. The configured narrative-outcome Turn requires exactly its one declared Interpreter outcome; authority-first requires `[]`. Generic append/runtime append still rejects nonempty outcomes; only `turn.finalize` can consume them. Low-confidence no-change normalization occurs before recording outcomes. Canonical prose equality, immutable birth Variant and pinned projection validation remain unchanged. Structured Narrator Task JSON stays operation-local; only its validated narrative becomes provisional presentation, and projection is mounted after commit.
7. **Provisional Draft barrier.** Normal Native Play routes configured Package Turns through `/generation/turn`. `markProvisionalTurn()` prevents ordinary autosave from committing stream text. Stop/failure reloads canonical authority without calling the old partial-Draft persistence path. Accepted server snapshots reuse NativeSessionRuntime's projection install. Quiet/impersonation and old Packages retain their prior paths; configured Turn continuation requires an explicit new Turn. No second conversation renderer was added.
8. **Proposal Artifact.** Revision-backed `atri_task_results` is a protected SessionCore namespace, carried by existing snapshots/save/export/fork/restore. A record uses invocation ID as proposal identity and records task/variant, anchor/branch, schema-associated payload, result class, status, exact prompt/generation refs, definition/context/request/raw/normalized hashes, non-secret execution configuration and model-delivery receipt. Generating a proposal changes no World facts. Explicit Apply (including a user-edited schema-valid payload) rechecks current revision/branch, then runs a declared advisory `applyCommand` or semantic mapping atomically. Rejection has no World effect. Apply receipt replay is once-only even after a lost response; changed replay payload fails. Stale/historical proposals cannot silently apply. Load revalidates committed records against the pinned Task definitions.
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

## Actual P3 verification

**362 distinct tests / 15 targeted and adjacent suites passed.** Reruns are not double-counted. FS and SQLite were selected with `ATRIA_DISABLE_MYSQL_TESTS=1` and `ATRIA_DISABLE_POSTGRES_TESTS=1`.

- `native/task-runtime-p3.test.js` (31): strict contracts, immutable Variants, typed outcomes, scheduler concurrency/backpressure/coalescing/supersede/fairness/timeout/cancel/retry/stale/finalize, real local HTTP model fixtures, exact Task-vs-Narrator Program composition, FS+SQLite atomic finalize, rollback/fork, Proposal Apply/replay/stale/reject, both Turn policies and cancelled/failed Interpreter paths.
- `native/model-prompt-runtime-p4.test.js` (31): adjacent existing model Host/transport/role isolation/fallback/config/preview behavior, new authenticated task/turn/detached/operation HTTP paths and Native Play P3 publication. This pre-existing suite name belongs to the earlier model/prompt project, not authorization to execute this project's P4.
- `native/session-projection.test.js` (47): includes FS+SQLite provisional autosave/Stop regression.
- `native/message-projection-contract.test.js`, `native/contracts.test.js`, `native/authoring-contracts.test.js`, `native/runtime-descriptor.test.js`, `native/package-build-install.test.js`, `native/session-runtime-http.test.js`, `native/save-system.test.js`.
- `game-runtime/llm-runtime.test.js`, `game-runtime/llm-event-interpreter.test.js`.
- Adjacent `native/session-core.contract.test.js` (22), `native/experience-actions.test.js` (9), `atria-shell/native-play-product.test.js` (7).

Commands used `npm --prefix tests run test:unit -- --runInBand <selected paths> --silent --verbose=false`. Changed JS ESLint passed without warnings; changed guards passed `node --check`; `git diff --check` passed. A0/A3/A4, Experience foundation (53 files), P2 message presentation and new `scripts/check-native-task-runtime.mjs` guards passed. The new guard preserves P4 reserved capabilities and the provisional persistence barrier.

Resolved ordinary issues included fixture schema/resource ownership, explicit command tool exposure, preserving ordinary generation cancellation error codes and role-isolated request keys, preserving the import-free cross-realm message contract, preventing Stop from publishing provisional prose, keeping complete Turns under one scheduler permit, and avoiding whole-Turn retries after authority-first commits. No unresolved validation failure. No full-repository run, Android, Docker, paid/live inference, CI polling or new visual UI; local HTTP fixture requests and unit/contract checks supplied runtime evidence.

## Deliberate phase boundaries / next work

- Operation projection is transient Host execution state. Detached jobs survive view closure, not Host restart; completed artifacts/receipts are durable Session revisions. A restart does not silently replay uncertain work. Cross-restart lifecycle/ready-barrier/retention policy belongs with P4 Session Application integration.
- Task/Turn result history currently has a hard 256-record limit and fails closed without silently evicting authority. P4 must design retention/compaction coherently with revision/fork semantics.
- P3 accepts only its implemented result sinks. Session App proposals, Activity/media settlement and shared/continuity authorities wait for their phases.
- P6 owns richer Context/Perspective/actor targeting. P9 owns visual Binding Slot/operation/proposal configuration and final cross-stage productization.
- No P4 Automation, Temporal, Session Application lifecycle, full Opening readiness or Workflow body was implemented. Keep main and the feature branch intact.

## P4 takeover prompt

```text
接手 GitHub 项目 ZZZdragondYNGPHX/Atria。本次只执行 P4，完成后停止，不继续 P5。

沿用 feat/native-experience-modes-capability-deepening。P3 已完成并推送，HEAD：522386dda781bab752304adcdb98bf561c857c52。
先 fetch，依次读取 main:AGENTS.md、main:FORK_MAINTENANCE.md、docs:feat/native-experience-modes-capability-deepening.md 的 §0、docs:handoff/native-experience-modes-capability-deepening.md、docs:handoff/latest-handoff.md，再读相关代码、测试与 guard。若远端推进，保留已有提交，以最新 HEAD 为准；不重审历史重型角色卡。

执行 P4 — Session Application / Temporal / Automation / Experience Workflow：覆盖 #13/#28/#29/#32、#14 的完整 lifecycle integration、Experience Ready Barrier、Scope Lifecycle、Scheduled Interaction、retention/compaction 和 World Process catch-up。严格区分 session.loaded 与 experience.ready，以及 World Clock、logical revision time、wall clock、activity elapsed time。simple Quest Workflow 可编译为 shorthand；跨 Turn 的应用生命周期使用 Workflow/Phase Graph。

复用 P0–P3 和现有 Native authority。重点接续 P3 的受保护 atri_task_results、完整 Turn/Task scheduler、Scoped Operation 和确定性 Command/Event/Reducer，不把 transient operation projection 变成第二套持久化事实源。设计跨重启恢复与 retention 时保留 once-only receipts、Branch/Revision coherence、stale/cancel/finalize 语义。保留 immutable Variant、canonical narrative/projection、provisional Narrator、semantic-only Interpreter、Task semantic/Runtime role/Model binding 分离以及 render/authority/model-delivery receipt 分离。不新增 renderer、Session 或 persistence。

只运行针对性/相邻测试、修改区域 lint/syntax 和相关 guard；普通失败自行修复。不机械跑全仓，不跑 Android、Docker、付费模型调用，不依赖 GitHub CI。完成后提交推送当前分支，更新两份 handoff；仅实质设计变化才修改正式方案。停止并提供 P5 接手提示词。P9 最终验证前不合并 main、不删除工作分支。
```

---

## Archived predecessor — P2

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

1. **Immutable Message Projection.** `Variant.projection` is a first-class optional field, not an arbitrary metadata convention. Shared browser/server assertions deep-copy/freeze it and reject unknown fields. Shape: `{schemaVersion:1,flow:[{kind:"prose",text},{kind:"block",id,type,version:1,data}]}`. Prose segments join without separators and must equal canonical `Variant.content`. User/assistant projections are allowed; system/tool projections are rejected. Existing Variants without this field keep their behavior.
2. **Pinned templates at write and read.** `SessionCore` validates every new projected Variant before atomic publication and revalidates committed projections during load. Blocks resolve to the Session-pinned Package/EntryPoint v2 UI source, compiled once per validation batch. Unknown template/version/data keys or malformed data reject the batch without advancing HEAD. Plain prose-only projections do not require v2. The same existing SessionRevision/Variant repositories carry save/export/import/fork/restore; no new persistence authority exists.
3. **P2 Turn Envelope seam.** `{schemaVersion:1,narrative,projection?,outcomes:[],diagnostics:[]}` is normalized through existing append commands. Only assistant drafts accept it. Conflicting narrative/projection inputs reject; non-empty outcomes remain reserved for P3. Diagnostics are bounded `{code,message}` records stored only under `Variant.metadata.atri_turn_diagnostics`, never exposed to templates or canonical history. The runtime empty-Draft barrier reads envelope narrative, so accepted envelopes are not accidentally discarded. Draft host transport accepts `atri_native.envelope` or `atri_native.projection`; canonical committed projection is rebound in place.
4. **One v2 compiler/renderer.** UI document `messageBlocks[type]` declares `{version:1,dataSchema,maxInstances?,attachmentKind?,actionPolicy?,document}`. Templates recursively reuse `compileUiDocument` and `mountUiDocument`; there is no second component renderer. Data schema is a validated closed subset of the existing World schema validator: string/number/integer/boolean/object/array, typed bounds/enums, closed object properties and required keys. Model data chooses only declared block types and schema data, not Component trees/actions/HTML/CSS.
5. **Message-local UI and snapshot context.** A template has one `chat.footer / always` placeholder view, mounted by Host into its message; no nested templates, native slots, selectors, Opening or live World reads. Roots: `ui/prefs/data/env/block/message/item/index/event/form`. `block` is immutable data; `message` contains only presentation-safe role/message ID. Local state is mount-only; declared player/device preferences reuse P1 settings with template/type isolation. All blocks in one message share a 2048 rendered-node budget and unique DOM IDs.
6. **Actionable attachments.** Types `claim/payment_request/item_offer/action_ref` are semantic template tags. `ui-only` (default), `active-tail`, and `fork-from-anchor` govern actions. UI/preferences may change while viewing history; Commands/Composer remain read-only unless current tail or Host-confirmed explicit fork. Fork resumes through the newly mounted branch renderer using existing typed Action v2. Attachment idempotency uses `variantId:blockId:actionId` and existing `atri_action_receipts`; repeat claims after refresh/remount do not repeat authority writes. Failed later P1 steps can resume in-mount without repeating the successful Command. Generic durable operation recovery remains P3.
7. **Conversation / narrative presentation.** `conversation:{mode:"feed"|"latest"|"reader",profile:"default"|"novel"|"dialogue"}` defaults to feed/default. Host toolbar lets players change presentation without changing Timeline. Ordered prose/block flow uses the existing canonical prose formatter and v2 renderer; render failure leaves canonical DOM available. Host observes existing Conversation DOM/pagination, retains message mounts when identity is unchanged and cleans up on replacement/disposal. Component/Hybrid/Full use this same Host path.
8. **Scoped thread foundation.** `assertConversationThread` and Host `mountConversationThread` accept read-only typed `{schemaVersion:1,threadId,scope,participants,messages}` snapshots, with session/world/scene scope. They reuse message presentation with 50-message pages and no authority-producing actions. They are not a second main Timeline. Typed Session Application ownership/lifecycle, unread persistence, Context/Perspective routing and thread authoring belong to P4/P6, not P2.
9. **Branch Graph / Reply Variant facade.** Existing history UI now has bounded graph/lineage rows, search, branch-filtered timeline, preview, current/origin/detached/incomplete markers, and previous/next/count for reply alternatives. Command-parent ancestry and branch-content ancestry are kept separate, including state-only/switch revisions. `getSessionHistory` adds lightweight reachable-message summaries via one Timeline inventory; no full snapshot per graph node. Reply controls lazily share a Session metadata cache and call existing inspect/switch/retry/fork paths. Previous/next are preview-only; explicit switch restores the complete branch head. Exact historical revision fork uses live expected HEAD, never mutates a birth Variant. State-only revision refresh retains valid active-tail Retry.
10. **Separate receipt domains.** Render receipts are bounded mount-local `kind:"render"` diagnostics (up to 256 retained). They never write SessionState or mark model delivery/authority success. Authority receipts remain P1 revision-backed transactions. P3 must introduce real operation/delivery semantics rather than treating a successful render as delivery.

Enabled versions: `message-projection@1`, `turn-envelope@1`, `reply-variant@1`, `conversation-presentation@1`, in addition to P0/P1 support. P3–P9 requirements remain reserved. No substantive architecture deviation required changing the formal plan.

Primary executable-free fixture: `tests/native/fixtures/message-projection-v2.json` (`{document,projection}`). Shared primitives: `public/shared/native-message-contract.js`. Host presentation: `public/scripts/native/message-presentation.js`. Branch facade: `public/scripts/native/reply-variants.js` and existing `session-history.js`.

Hard limits include 128 flow nodes, 32 template types / 32 instances per type, aggregate block data 4096 nodes / depth 16 / 65536 characters, 16 diagnostics, 64 thread participants / 256 thread messages, 2048 rendered nodes per message, history metadata 20000 branches+revisions, 25 branch rows/page, at most 100 revision rows in DOM, 280-codepoint previews, and 15-second metadata timeout. Existing v2 resource/JSON limits continue to apply.

## Actual P2 validation

**563 distinct tests / 22 targeted and adjacent suites passed.** Reruns are not double-counted. Storage tests selected FS+SQLite via `ATRIA_DISABLE_MYSQL_TESTS=1` and `ATRIA_DISABLE_POSTGRES_TESTS=1`.

| Suite under `tests/` | Passed |
|---|---:|
| `atria-shell/native-reply-variants.test.js` | 8 |
| `atria-shell/session-history.test.js` | 2 |
| `game-runtime/message-templates.test.js` | 186 |
| `game-runtime/ui-component-model.test.js` | 4 |
| `game-runtime/ui-live.test.js` | 11 |
| `game-runtime/ui-v2.test.js` | 23 |
| `native/authoring-contracts.test.js` | 45 |
| `native/context-history.test.js` | 2 |
| `native/contracts.test.js` | 27 |
| `native/experience-actions.test.js` | 9 |
| `native/message-presentation.test.js` | 10 |
| `native/message-projection-contract.test.js` | 84 |
| `native/package-build-install.test.js` | 5 |
| `native/product-http.test.js` | 14 |
| `native/product-service.test.js` | 7 |
| `native/runtime-descriptor.test.js` | 10 |
| `native/save-system.test.js` | 13 |
| `native/session-core.contract.test.js` | 22 |
| `native/session-durability.test.js` | 17 |
| `native/session-history-p2.test.js` | 10 |
| `native/session-projection.test.js` | 45 |
| `native/session-runtime-http.test.js` | 9 |

Commands used scoped batches with `npm --prefix tests run test:unit -- --runInBand <selected suite paths>` or the equivalent `node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand --runTestsByPath <selected paths>`. Coverage includes save/export/import, FS+SQLite immutability and coherent fork/restore, pinned-template rejection before commit and on corrupted reload, P1 typed receipt replay/continuation, strict negative schema/root cases, three layouts, DOM cleanup, read-only history, graph ancestry, HTTP ownership and canonical context history.

Changed JS ESLint, changed MJS `node --check`, `git diff --check`, A0/A3/A4 guards, Experience foundation guard (53 files), new `scripts/check-native-message-presentation.mjs`, and zh-CN/zh-TW localization all passed. `node tests/frontend/experience-p2.smoke.mjs` passed on real headless Edge at 1440px/390px; screenshots inspected. Checked ordered flow, local details, once-only attachment receipt, feed/latest/reader, reply preview, responsive overflow, no page errors and canonical DOM restoration. Separate Branch Graph fixture covered desktop/mobile and light/dark presentation. These are controlled local browser fixtures, not live-model end-to-end tests.

Original-byte hashes were retained. Independent compiler/backend/history/support-catalog copies passed baseline/modified/rollback probes; rollback restores original bytes/behavior without reverting the working branch. Local evidence stays outside tracked product files.

Resolved ordinary failures: baseline Regex test fixture lacked current required id/placement (fixture corrected; Regex code unchanged); initial backend harness selected unavailable MySQL/PostgreSQL before the existing engine switches were set; browser fixture needed UTF-8 and the real library stylesheet/Host width reset. Integration fixed envelope empty-Draft detection, post-command continuation/replay UI and state-only revision Retry freshness. First commit attempt lacked local Git author config; the successful command reused preceding commits' `Codex <codex@openai.com>` via per-command config, without changing global settings. No outstanding validation failure.

No full-repository suite, Android, Docker, paid/live model inference or CI dependency/polling. Main and the feature branch are both retained.

## P3 boundary and next takeover

P2 stops here. Do not implement P3 runtime work until a new continuation. P3 owns Package Turn Contract, bounded stages, authority-first/narrative-outcome finalize, Model Task/Task Variant/Binding/Proposal and scoped operation scheduling, streaming/retry/stale/cancel/backpressure. Preserve the shared renderer, authority, pinned closure and receipt separation. P2 outcomes are deliberately empty; extending them requires typed P3 contract and tests, not permissive JSON passthrough.

```text
接手 GitHub 项目 ZZZdragondYNGPHX/Atria。本次只执行 P3，完成后停止，不继续 P4。

沿用工作分支 feat/native-experience-modes-capability-deepening；P2 已完成并推送，HEAD：1be87f0186d3f53c4bce8a7cc46a409e953ca46f。
先 fetch，依次读取 main:AGENTS.md、main:FORK_MAINTENANCE.md、docs:feat/native-experience-modes-capability-deepening.md 的 §0、docs:handoff/native-experience-modes-capability-deepening.md、docs:handoff/latest-handoff.md，再读相关代码、测试与 guard。若远端推进，保留全部已有提交，以最新 HEAD 为准；不重审历史重型角色卡。

执行 P3 — Turn / Model Task / Auxiliary Operation Runtime：覆盖 #10/#12/#24/#27、Task Variant、Task Binding Slot / Model Execution Lane、Result Authority / Sink Policy、Proposal Artifact、Scoped Operation 的 streaming/retry/stale/cancel，以及 Host scheduler/backpressure。复用 P0–P2 contract 和现有 Native authority；Package Task semantic、Runtime role、Model binding 分离；Narrator Draft 在 narrative-outcome finalize 前保持 provisional；Interpreter 只产生 semantic outcome proposal，不输出任意变量 patch。P2 Turn Envelope 当前 outcomes 必须为 []；在 P3 明确扩展该边界，保留 immutable Variant、canonical narrative/projection 分离、历史动作只读或显式 fork，以及 render/authority/model delivery receipt 分离。不要建立第二套 renderer、Session 或 persistence。

只运行针对性/相邻测试、修改区域 lint/syntax 和相关 guard。普通失败自行修复，不机械跑全仓，不跑 Android、Docker、付费模型调用，不依赖 GitHub CI 才算完成。完成后提交推送当前分支，更新两份 handoff；仅有实质设计变化才修改正式方案。停止，不继续 P4，并提供 P4 接手提示词。P9 最终验证前不合并 main、不删除工作分支。
```

---

## Archived predecessor handoff — P1 (historical, not the current stage)

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
2. Strict, bounded local fields and Form controls; pure Formula-based expressions/templates and selectors. Unknown operations, props, roots, functions and model paths fail closed. No Package JS/HTML/CSS, arbitrary patch, DOM, storage or network handle is exposed. Static quoted property/index access is opt-in for UI/Data expressions; original Formula defaults remain unchanged.
3. Form submit validates fields, links errors, focuses the first invalid input and executes named actions. Constraint statuses are `allowed`, `advisory`, `confirm_required`, `blocked`; confirmation is Host-owned and cancels on disposal. Keyed, bounded Collection pages retain DOM identity and focus.
4. Local UI `mount`/`session` state and `player`/`device` preferences reuse existing account settings. State keys include Package/EntryPoint/stateVersion, plus Session/Branch for session drafts and Host device identity for device preferences. The Host's browser storage contains only `atri_ui_device_id`, a non-secret UUID; preference values stay in account settings. This adapter lives in `native/ui-state-storage.js`, outside Package execution, and creates no Session/World store. UI/preference changes never create World revisions. Branch/restore remounts v2; committed revisions refresh its presentation.
5. Package Data loads through the existing authenticated Session runtime/resource route by declared exact AssetRef, bounded JSON and content hash. Dotted IDs map to nested `data` paths. Data is frozen for UI/selectors and declarative logic; reading it does not add Prompt exposure. Missing/mixed/unknown refs fail. Build/install reject malformed v2 documents and Data.
6. Composer has typed set/append/clear/focus/submit. Manual and declarative submission share the same `getContext().generate('normal')` Native entrypoint. No button-click simulation or second generation pipeline. Empty, busy and historical submission is rejected.
7. Action v2 uses existing typed Command/Event/Reducer and SessionRevision commits. `atri_action_receipts` is a protected namespace in the same atomic revision, containing base/committed revision, branch, event refs, request fingerprint and optional compensator. Replay is idempotent; key conflicts/stale writes fail. Explicit compensation is a new typed transaction and cannot apply twice; it never rewinds an immutable receipt. One action permits at most one authority-write step; combine atomic writes inside one Command. Local/Composer steps can surround it; there is no implicit rollback.
8. Uncertain authority failures retain the exact request for in-mount retry. After authority success, a later failed UI/Composer step resumes from that step instead of repeating the commit. Busy action invocations coalesce. Durable generic operation lifecycle remains P3.
9. Declarative logic `schemaVersion: 2` mutation shorthand lowers at build into the existing executable-free Command/Event/Reducer IR. Fixed assignments, closed args, typed validators and deterministic formulas are required. Imported shorthand is revalidated and compiled through the same path.
10. Basic conditional Opening/Wizard uses local drafts, back/next, field validation and a final named action. Committed setup still uses a typed command or Native Composer. Complete Opening lifecycle/ready barrier/workflow integration remains P4.

The support catalog now enables only `component-model@1/@2`, `local-ui-state@1`, `player-preference-state@1`, `package-data@1`, `composer@1`, `action@2`, `declarative-mutation@1`, and basic `opening@1`. Other P2–P9 feature versions remain reserved/unsupported. Package and Runtime Descriptor schema versions did not change. No substantive architecture deviation required editing the formal plan.

## Concrete authoring contract

Primary executable-free fixture: `tests/native/fixtures/component-v2-opening.json`.

- `runtime.experience`: `{ mode, componentModelVersion: 2, component: "ui/main.json", selectors? }`.
- UI document: `{ schemaVersion: 2, stateVersion, localState?, preferences?, selectors?, actions?, views, opening? }`.
- Fields: named scalar string/number/integer/boolean definitions, explicit `default`, optional scope/required/min/max/step/minLength/maxLength/enum. Form models address only declared `ui.key`; state actions may address declared `ui.key`/`prefs.key`. Draft validation may be incomplete; preferences must satisfy their constraints.
- Values: literal JSON, `{ expr: "ui.name" }`, or `{ template: "Hello {{ui.name}}" }`; roots `world/ui/prefs/data/selectors/env/item/index/event/form`. No evaluation side effects, dynamic property expressions or RNG in UI.
- Views: `{ id, surface, mount: "always" | "on-demand", root }`; on-demand only modal/drawer. Node fields and props are closed. Host controls include Form/input/textarea/select/checkbox/range and basic text/layout/progress/details/native slots/repeat.
- Actions: `{ steps, constraints?, idempotency?: "request" | "revision", compensation?: commandId }`; operations `ui.set/toggle/reset`, `command.dispatch/simulate`, `action.compensate`, `composer.set/append/clear/focus/submit`, `surface.open/close`, `opening.next/back/confirm`. Command args are value templates; simulation does not create receipts or authority writes.
- Opening: `{ initial, confirmAction, steps: [{ id, view, fields, next: [{ when, to }] }] }`. Navigation preserves mounted drafts. Completion is mount-local in P1, not a new persistent application phase.
- Mutation source: `{ schemaVersion: 2, mutations: [{ id, event, argsSchema, validators?, assign }], commands?, reducers?, rules?, interpretations? }`; `assign` paths are fixed World reducer paths. Lowered archives use ordinary existing IR.
- Hard limits include 16 views, 512 authored nodes/depth 24, 2048 rendered nodes, 128 fields per state family, 32 steps/action, 64 constraints, 32 Opening steps/64 navigation entries, Collection source 10000/page 100, 2 MiB per Data/UI resource, bounded JSON, 2048 revision receipts and 16384 Host preference keys. Reaching a limit fails closed; no silent eviction of authoritative receipts.

## Actual P1 validation

**187 distinct unit tests across 19 targeted/adjacent suites passed**, run in scoped batches with `ATRIA_DISABLE_MYSQL_TESTS=1` / `ATRIA_DISABLE_POSTGRES_TESTS=1`:

- `native/authoring-contracts.test.js` (45)
- `native/runtime-descriptor.test.js` (10)
- `native/package-build-install.test.js` (5)
- `native/session-runtime-http.test.js` (9)
- `native/studio-preview-experience.test.js` (1)
- `native/session-core.contract.test.js` (22, FS + SQLite)
- `native/experience-actions.test.js` (9)
- `native/experience-resources.test.js` (3)
- `native/ui-state-storage.test.js` (1)
- `game-runtime/package-loader.test.js` (10)
- `game-runtime/ui-component-model.test.js` (4)
- `game-runtime/ui-live.test.js` (8)
- `game-runtime/ui-v2.test.js` (23)
- `game-runtime/formula.test.js` (6)
- `game-runtime/declarative.test.js` (8)
- `game-runtime/logic-package.test.js` (3)
- `game-runtime/logic-runtime.test.js` (8)
- `game-runtime/world-session.test.js` (5)
- `atria-shell/native-play-product.test.js` (7)

Command: `npm --prefix tests run test:unit -- --runInBand <selected paths>`. Reruns are not double-counted. New tests cover exact Data HTTP/install rejection, typed mutation lowering, atomic receipt/journal/state, reload/replay/fork, compensation once, malformed documents, Form errors/focus, conditional wizard, cancellation/disposal, busy coalescing, partial failure retry, scoped persistence and all three v2 layouts.

Passed changed-JS ESLint, `node --check tests/frontend/experience-p1.smoke.mjs`, `git diff --check`, A0/A3/A4 guards, Experience contract foundation guard (52 scanned files), and Native product localization guard (zh-CN/zh-TW).

`node tests/frontend/experience-p1.smoke.mjs` passed on real headless Edge at 1440px and 390px. Checked Form focus/error, drafts across forward/back, paged Collection, no horizontal overflow, modal close/reopen/Escape, once-only Composer call, cleanup and no page errors; inspected both screenshots with actual Atria tokens loaded. This is a controlled browser fixture, not a live model/server end-to-end run.

Resolved ordinary failures: jsdom lacks `crypto.randomUUID` for the UI request generator (uses Web Crypto random bytes); tests were updated from old click-based Composer expectations and v2 rejection; a new Host cleanup test used `dispose` instead of existing `unmount`; lint brace/indent fixes; locale editing initially hit Windows default decoding and was retried explicitly as UTF-8. No remaining test/lint failure. No full-repo/Android/Docker/paid-model run or CI polling.

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
- Continue this one branch through P9. Do not merge main or delete the branch before final verification.

## Read before P1

Fetch origin first. Read current `main:AGENTS.md`, `main:FORK_MAINTENANCE.md`, the formal plan's normative §0, this handoff and `handoff/latest-handoff.md`, then relevant current code/tests/guards. Preserve a newer remote work-branch HEAD; never reset to this document's hash. Do not reopen the completed heavy-card audits or redesign the full architecture.

## P0 implemented

1. `public/shared/native-experience-contract.js` is the shared strict contract/vocabulary boundary, exported through `src/native/authoring-contracts.js` and `src/native/index.js`.
2. Optional package-level `runtime.experienceContract` has its own `schemaVersion: 1`. Project Source validates shape; Package Manifest validates shape plus exact AssetRef closure; Runtime Descriptor compilation revalidates closure and required Host support. Browser package loading also checks strict shape and required support before activation.
3. The descriptor carries `experienceContract` separately from layout-only `experience`. Existing packages without the field retain their existing output and behavior; Package schema v2, Runtime Descriptor schema v1 and Component Model v1 remain unchanged.
4. The 32 frozen capability names have exact reserved versions, distinct from implemented Host support. Only `component-model@1` is currently marked supported in this new vocabulary. Required unsupported features fail closed; optional known reserved features remain metadata only. Unknown capabilities/versions fail even when optional. This is not a permission grant or a second package capability system: existing coarse Package capabilities/permissions are unchanged; these are versioned Experience feature requirements.
5. Package Data refs reuse immutable JSON AssetRefs already carried by PackageVersion. No data loader, selector/query, exposure, storage or executable behavior was added.
6. A3 guard's obsolete `/game-runtime/` file filter was repaired to scan active `/native/experience/` files and reject an empty scan. New `scripts/check-native-experience-contract-foundation.mjs` recursively scans all current and future browser Experience modules plus shared contract/descriptor for retired authority, executable primitives and parallel persistence. Existing A0/A3/A4 guards remain in force.
7. Added fixture `tests/native/fixtures/experience-contract-v1.json`, negative contract regressions, mode-independent descriptor checks, browser rejection checks, and Project -> build -> install -> reopen -> descriptor round-trip coverage through existing storage.

## Exact declaration seam

```json
{
  "schemaVersion": 1,
  "capabilities": [
    { "id": "component-model", "version": 1, "required": true },
    { "id": "package-data", "version": 1, "required": false }
  ],
  "dataResources": [
    {
      "resourceId": "catalog.items",
      "assetId": "asset_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "contentHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  ]
}
```

- All three fields are explicit; arrays are bounded to 256 items and reject duplicate capability IDs / data resource IDs.
- Refs must match an existing same-PackageVersion AssetRef by Native asset ID + SHA-256, with `mediaType: application/json`. The example digest must be replaced with the actual asset digest.
- The enclosing PackageVersion supplies ownership; no new resource store, source URL, follow-latest resolution or Package execution path exists.
- Requirements belong to Package runtime. EntryPoint overrides are rejected, so a selected entry cannot weaken package requirements.
- There is no generic config/extensions/persistence/context passthrough in this declaration. Storage does not imply exposure.
- Reserved versions are API seams, not implemented feature bodies. Component v2 rendering remains rejected by the existing v1 contract until P1 deliberately implements its isolated schema.

## Architecture retained / not implemented

SessionCore, Session Runtime, Experience index and Component Model renderer were inspected and intentionally left unchanged. World / timeline / runtime state continue to commit and restore through existing Native SessionRevision and Branch authority. P0 adds no persistence family or new authority write surface.

No P1–P9 product capability was implemented: no Component v2 UI, Form, local/preference state runtime, Composer actions, Message Projection, Task scheduler, Temporal/Workflow, Activity/Scene, Add-on, Player Continuity, Shared Realm or Studio redesign. Package Data consumption and content/query validation belong to P1; P0 validates declarations and exact asset identity, not a future data schema.

## Actual validation

**138 distinct tests passed across 10 suites**, using targeted/adjacent runs:

- `tests/native/authoring-contracts.test.js`
- `tests/native/contracts.test.js`
- `tests/native/runtime-descriptor.test.js`
- `tests/native/package-build-install.test.js`
- `tests/game-runtime/package-loader.test.js`
- `tests/game-runtime/ui-component-model.test.js`
- `tests/native/session-runtime-http.test.js`
- `tests/native/studio-preview-experience.test.js`
- `tests/game-runtime/world-session.test.js`
- `tests/native/session-core.contract.test.js` (22 tests across FS + SQLite)

Commands: `npm --prefix tests run test:unit -- --runInBand <selected suite paths>` with `ATRIA_DISABLE_MYSQL_TESTS=1` and `ATRIA_DISABLE_POSTGRES_TESTS=1`. First six suites: 101 tests; adjacent HTTP/preview/World: 15; Session Core: 22. Authoring tests were rerun after a lint-only test correction and are not double-counted.

Changed `.js` files passed ESLint without warnings; both touched `.mjs` scripts passed `node --check`. Repo ESLint defaults do not parse `.mjs` as modules, so those scripts used syntax checks instead. `git diff --check` passed.

Passed guards:

- `node scripts/check-a0-native-authoring-hard-cutover.mjs`
- `node scripts/check-a3-native-game-runtime-cutover.mjs`
- `node scripts/check-a4-experience-runtime.mjs`
- `node scripts/check-native-experience-contract-foundation.mjs` (47 files)

Failures resolved during work: shared plain-object validation initially rejected cross-realm structuredClone objects in Jest; corrected without relaxing field/version validation. Conditional-expect lint was corrected. SQLite initially lacked its native binding; ordinary npm rebuild was suppressed by local install-script policy, then the installed better-sqlite3 prebuild installer restored the local binding and all 22 Session Core tests passed. No generated binary/config/lockfile changes were committed.

No full-repo tests, Android, Docker, live/paid inference or GitHub CI polling. No UI behavior changed, so no browser visual QA was needed in P0.

## Next stage: P1 only

**Component v2 / Form / Local State / Action / Opening Foundation**:

- Capabilities #1 / #2 / #3 / #4 / #6 / #7 / #8 and #14's basic Opening/Wizard.
- Implement explicit Component v2 version separation while preserving v1.
- Local UI / player preference state, immutable Package Data consumption, declarative Form validation (`allowed`, `advisory`, `confirm_required`, `blocked`), Host-owned Collection View basics, Composer actions and typed Action v2 / mutation shorthand.
- UI state must not create World Revisions. Form/Action authority writes must enter existing typed Command/Event/Reducer and SessionRevision paths. Expressions/templates cannot have side effects.
- Update only actually implemented capability versions in the shared support catalog. Do not mark all reserved capabilities supported or infer support from layout mode.
- Respect plan §0 and relevant final design sections; do not implement P2+ bodies.
- Run targeted/adjacent tests, changed-area lint/syntax and relevant guards. Fix ordinary failures autonomously.
- On P1 completion: commit and push this same branch, update both handoffs, update formal plan only for substantive design changes, stop before P2 and provide the P2 takeover prompt. Do not merge main.
