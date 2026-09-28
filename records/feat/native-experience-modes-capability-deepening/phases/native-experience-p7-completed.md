# Completed — Native Experience P7

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
