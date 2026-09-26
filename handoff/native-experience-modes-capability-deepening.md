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
