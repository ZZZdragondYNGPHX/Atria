# Atria Native Content & Session Architecture Refactor — Implementation Plan & Verification

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 24. Implementation phases

Implementation uses one isolated long-lived task branch:

`refactor/atria-native-content-session-architecture`

Do not merge partial N-phases into `main`. Each phase receives its own commits, focused tests, CI checkpoint, validated HEAD, and documentation update.

### N0 — Native Contracts & Identity

**Status: validated.**

Validated HEAD:

`e532d3c31f69bd8ceb04d9fa59ea3d4a18e0d2c6`

Validation:

- workflow: **Native Content Session Dev Checks #12**
- run: `35673592841`
- Native contract suites: **2 passed / 52 tests passed**
- adjacent `.atria` / Game Runtime package/session / Storage naming suites: **5 passed / 42 tests passed**
- `src/native/*.js` ESLint: success
- full root ESLint: success
- Android/Docker: not run; N0 changed only JS contracts/tests/CI and did not require those surfaces

N0 froze and implemented:

- Native opaque ID families for Package, PackageVersion, Actor, EntryPoint, Project, Session, Branch, TimelineEntry, Variant, SessionRevision, SavePoint, AssetRef;
- World / WorldRevision IDs: `world_*`, `worldv_*`;
- Knowledge IDs: `kb_*`, `kbv_*`, `kentry_*`, `kbind_*`;
- Native entity contracts and identity invariants;
- Package v2 logical manifest/schema;
- `.atriasave v1` logical manifest/schema;
- capability and permission vocabularies;
- Native Store schema v1 resource families/keys;
- World / immutable WorldRevision contracts;
- KnowledgeBase / immutable KnowledgeRevision / stable KnowledgeEntry / KnowledgeBinding contracts;
- optional Knowledge discovery/applicability/lifecycle/relations/delivery semantics;
- Package-contained immutable World/Knowledge snapshots;
- EntryPoint `worldIds[]`, optional `primaryWorldId`, and `knowledgeBindingIds[]`;
- Package reference-integrity checks for World, KnowledgeBinding, exact KnowledgeRevision and Asset references;
- required SessionRevision `knowledgeHead` for future resolved Knowledge dependency pinning;
- first-class Native Store identities for Worlds, World revisions, Knowledge bases/revisions/entries/bindings;
- guards rejecting filename/name/path/index, legacy World Info `uid`, book/world name, character/chat/global scope and related historical persistence identities as Native authority.

N0 deliberately did **not** implement repositories, storage-engine resource persistence, runtime binding resolution, KnowledgeCompiler, `.atria` binary Container v2, `.atriasave` export/import runtime, or UI cutover. Those remain assigned to later phases.

**Exit satisfied:** Native identity/content contracts including World/Knowledge are frozen and tested. Later phases must consume these contracts rather than inventing parallel identity.
### N1 — Native Storage Foundation

**Status: validated.**

Validated HEAD:

`fd6ad1b423b6cd18fcb5da184f75ed82d7117368`

Validation:

- workflow: **Native Content Session Dev Checks #23**
- run: `35676169036`
- N1 storage suites: **9 passed / 64 tests passed**
- N0 Native contract suites preserved: **2 passed / 52 tests passed**
- adjacent `.atria` / Game Runtime / Storage regressions preserved: **5 passed / 42 tests passed**
- N1 source ESLint: success
- full root ESLint: success
- Android/Docker: not run; N1 changed JS/storage only

N1 implemented:

- PackageRepo;
- WorldRepo as Library World authority only;
- KnowledgeRepo as Library Knowledge authority only;
- SessionRepo foundation;
- SavePointRepo;
- content-addressed AssetStore;
- first-class Native StorageTransaction resource kinds for all N0-frozen Native resource families;
- dedicated FS Native resource layout under `atria-native/resources/<kind>/`;
- dedicated SQL `native_resources` storage through additive schema-v2 migrations;
- FS / SQLite / MySQL / PostgreSQL parity;
- SQL transaction-aware Native OCC and FS best-effort OCC under the existing FS semantics;
- immutable PackageVersion / WorldRevision / KnowledgeRevision / KnowledgeEntry / Variant / SessionState / SessionRevision / SavePoint primitives;
- FS immutable-write + commit-last publication semantics;
- PackageVersion / WorldRevision / KnowledgeRevision / SessionRevision reference-aware GC foundations;
- WorldRevision validation of Library KnowledgeBinding and AssetRef references;
- KnowledgeEntry relation closure inside one immutable revision;
- KnowledgeBase / KnowledgeBinding / AssetRef deletion protection where referenced;
- Asset blob deduplication, integrity verification and reference-aware blob GC;
- MySQL/PostgreSQL dump/restore and delete-user coverage for Native resources;
- 17-kind cross-engine Native round-trip coverage;
- FS commit-last chaos coverage for Session, World and Knowledge authority pointers.

WorldRepo/KnowledgeRepo remain strictly Library authorities. Package snapshots and Session-local/current state remain assigned to their later phase owners.

No old PNG / Character JSON / JSONL / World Info file was introduced as Native fallback, and no dual-read/dual-write path was added.

**Exit satisfied:** Native resources can be created/read/updated/listed/deleted consistently across supported storage engines; immutable revision/commit-last and reference/GC primitives required by later phases are established and tested.

### N2 — Package / Project / World & Knowledge Composition

Implement:

- ProjectStore keyed by projectId;
- Studio project routing away from `characterId`;
- Project-owned World/Knowledge source;
- exact Library WorldRevision/KnowledgeRevision authoring references;
- dependency-closure resolution and cycle/missing dependency validation;
- Source Project → build flow;
- `.atria` Package Container v2;
- vendoring exact World/Knowledge snapshots into immutable PackageVersion;
- install into PackageRepo + AssetStore;
- immutable PackageVersion;
- package validation/security/permission preflight;
- Studio Preview ephemeral-session seam.

Runtime must not depend on the target Library containing the authoring-time World/Knowledge dependencies.

**Exit:** a project can build, validate, install and reopen self-contained Package metadata/content without Character PNG or live Library dependencies as runtime authority.

### N3 — Native Session Core

**Completed and validated:** `c42ee3e98a27fbea97ded0917de081bcc8893680`; CI #44 / `35679448236`, N3 3 suites / 49 tests. Detailed implementation record below.

Implement:

- Session;
- BranchGraph;
- TimelineEntry;
- Variant;
- SessionState base;
- SessionRevision;
- SavePoint primitive;
- resolved KnowledgeBindingSet pinned to exact revisions;
- load/reload behavior;
- branching using IDs, not copied chat filenames.

No production UI cutover yet.

**Checkpoint A exit:** pure Native tests can create Package → EntryPoint → Session → Timeline → Branch → Revision and reload it without PNG/JSONL authority, while preserving exact World/Knowledge dependencies.

### N4 — Native Runtime Projection & Write Barrier

**Status: complete and validated — 2026-09-22.**

- Validated work-branch HEAD: `ec95a260f4a26a4c23091227f77865dba1ae2273`
- CI: **Native Content Session Dev Checks #87**
- Run: `35693455407`
- Result: **success**
- N0/N1/N2/N3 regressions, full root lint, real-host Chromium Native Session acceptance, complete Node regression and frontend build all passed.
- N5 is next. Do not restart N4, create a new branch, or merge to main.

Keep:

- one-way Native Package/Session → transient ST runtime projection;
- stable opaque message/Actor/Package/Asset mappings;
- Native-only HTTP/command writes;
- Send/Stop/generation host reuse;
- Branch/switch/reload/historical revision view;
- Package Regex contribution;
- pinned Knowledge compatibility projection;
- attachments through AssetStore;
- R7 Play host identity/DOM reuse;
- proof that Native writes do not fall back to `/api/chats/*`/JSONL.

Change the Native command/acceptance boundary:

- committed Timeline differences are not translated into Native `revise`, `remove`, `removeVariant`, or committed Variant selection;
- introduce a committed-projection Write Barrier/fingerprint check;
- direct legacy/plugin mutation of committed projected content fails closed and requires reload/recovery;
- manual committed Edit/Delete/Swipe/Swipe-delete are not Native product capabilities;
- ST swipe-shaped structures may remain transient Draft/generator compatibility only;
- Native Retry Reply forks from the post-user revision and commits a new Assistant message;
- committed Continue appends a continuation TimelineEntry instead of mutating prior content;
- Stop operates on Draft, allowing partial commit or discard.

Existing N4 browser/unit tests that prove Edit/Delete/Swipe mutation success must be rewritten into fail-closed/non-authoritative tests rather than carried forward as product requirements.

**N4 positive acceptance:**

- Send;
- Stop/Draft behavior;
- generation;
- Continue-as-new-entry;
- Retry Reply as Fork + new Assistant message;
- Branch/switch;
- historical revision view;
- reload;
- attachments;
- prompt assembly;
- Regex;
- existing World Info/Knowledge compatibility;
- R7 Play host invariants;
- no legacy persistence fallback.

**N4 negative/fail-closed acceptance:**

- committed Edit;
- committed Delete;
- manual Swipe;
- Swipe deletion;
- committed Variant switch;
- direct third-party `chat[]` committed-content mutation.

These must not change Native authority or fall back to legacy storage.

Do not implement full N5 state integration, N6 KnowledgeCompiler, N7 ContextCompiler, N9 UI cutover, or N10 deletion of SillyTavern internals inside N4.

**Exit:** mature ST generation/rendering can operate as a mutable Draft/runtime workspace downstream of an immutable Native committed Timeline, with a tested commit/write barrier and Native-only writes.

### N4 validation record

N4 now establishes the immutable committed-Timeline/runtime boundary required by later Native phases:

- the mature ST generation/rendering host remains a mutable Draft/runtime compatibility workspace downstream of Native authority;
- committed Native Timeline entries are append-only from the product/runtime command surface;
- committed Edit/Delete/manual Swipe/Swipe deletion/Variant switching and direct canonical `chat[]` rewrites fail closed with no JSONL/`/api/chats/*` fallback;
- committed-message fingerprints protect role/actor/content/attachment/provenance authority while presentation-only overlays such as `extra.display_text` remain outside Timeline authority;
- Send commits the user turn before assistant generation, preserving an exact post-user Revision;
- Continue appends a new Assistant entry with `continuationOf` provenance instead of rewriting the prior Assistant;
- Retry Reply forks from the exact post-user Revision and appends a new Assistant reply; unsent Composer drafts/attachments do not become part of Retry;
- Stop finalizes the Generation Draft explicitly, including the no-assistant-placeholder case, without advancing HEAD past the committed post-user Revision when the Draft is discarded;
- Package Regex participates in the actual runtime hot path, pinned Native Knowledge remains compatibility-projected fail-closed, and attachments route through AssetStore;
- R7 Play host identity/uniqueness is preserved for `#sheld`, `#chat`, `#form_sheld`, `#send_form`, and `#send_textarea`;
- real-host acceptance proves Native writes remain Native-only and legacy persistence is not used as fallback.

Final validation on exact HEAD `ec95a260f4a26a4c23091227f77865dba1ae2273`:

- N0 Native Contracts: success;
- N2 Package Project Composition: success;
- N1 Storage + N3 Core + N4 Projection: success;
- N4 Live Native Session Browser Acceptance: success;
- N4 Complete Node Regression and Frontend Build: success;
- complete Node regression: **748 suites / 8705 tests passed**;
- frontend build: success.

N4 is frozen at this validated boundary. Later changes to runtime-state authority belong to N5; KnowledgeCompiler belongs to N6; bounded context architecture belongs to N7.

### N5 — Native Runtime State & Revision Lifecycle

Move Atria-owned durable runtime state to SessionState/Revision:

- Game World + Event Journal;
- Memory canonical/durable state;
- Orchestrator;
- Search;
- Variables/op-log replacement where Native applies;
- package-owned durable state.

Native lifecycle anchors become stable IDs/revisions:

- messageId;
- revisionId;
- branchId.

Atria-owned Native state must stop treating `floor`, `swipeId`, `MESSAGE_EDITED`, `MESSAGE_DELETED`, or `MESSAGE_SWIPED` as authority.

Introduce/standardize Native lifecycle concepts such as:

- TIMELINE_APPENDED;
- REVISION_COMMITTED;
- REVISION_RESTORED;
- BRANCH_ACTIVATED;
- SESSION_LOADED;
- DRAFT_ABORTED.

FloorState and old structural-event handlers may remain for Legacy/ST sessions and compatibility, but Native authority moves to coherent SessionRevision snapshots.

Preserve old public API names only as compatibility wrappers where necessary; they must route into Native revision/state semantics when a Native Session is active.

This phase establishes authoritative current-State/Event/Memory inputs required by KnowledgeCompiler.

**Exit:** append/fork/restore/reload keep Timeline and all authoritative Native state coherent without committed-message mutation or swipe-based rollback semantics.

### N5 validation receipt — 2026-09-22

N5 is complete and frozen at:

- validated HEAD: `70f59bf2894c77defa46d75e48c79485a4bc5d74`;
- workflow: **Native Content Session Dev Checks #107**;
- run: `35700429886`;
- result: **success**.

Validation on that exact HEAD:

- N5 focused state/lifecycle: **15 suites / 307 tests passed**;
- N0/N1/N2/N3/N4 compatibility gates: success;
- full root ESLint: success;
- real-host Chromium Native Session acceptance: success;
- complete Node regression: **748 suites / 8734 tests passed**;
- frontend build: success.

Delivered authority boundary:

- coherent Timeline + SessionState runtime commits;
- stable `messageId` / `revisionId` / `branchId` lifecycle;
- Game World + Event Journal, Memory, Orchestrator, Search, Variables and package runtime Session state integrated;
- exact Timeline-boundary Retry/Fork semantics in the presence of state-only Revisions;
- Native structural rollback no longer depends on floor/swipe events;
- Legacy/ST compatibility remains isolated outside Native authority.

N6 starts from this frozen boundary.

### N6 — Native Knowledge Runtime Integration

**Status: complete and validated — 2026-09-22.**

Implement:

- KnowledgeBinding resolution across Package, EntryPoint, Library policy and Session-local sources;
- exact revision pinning;
- KnowledgeCompiler;
- target-aware KnowledgePlan;
- authority-vs-priority rules;
- current-state/Event-Journal precedence;
- Package/World canonical Knowledge;
- Library/Session augment vs explicit override semantics;
- Memory as evidence/history, not current-state authority;
- applicability using the existing stateConditions/stateEvents/stateActivation capabilities;
- stable identity preservation to final prompt assembly;
- required dependencies / related entries / exclusive groups;
- target visibility for Narrator/Actor/Agent contexts;
- adapter into the existing World Info selection/prompt machinery;
- deterministic diagnostics/rejection reasons.

Do **not** rewrite all keyword, regex, vector, probability, recursion, sticky/cooldown/delay, prompt assembly, or authoring semantics without a concrete need. Do not require structured claims for ordinary authors and do not introduce a graph database.

**Checkpoint K exit:** prove at minimum:

1. Package canonical Knowledge reaches the target Context.
2. authoritative current Session State suppresses stale applicable canonical content when conditions make the conflict deterministic;
3. Library `augment` cannot silently override Package canon;
4. explicit Knowledge `override` can override ordinary Knowledge but cannot mutate/override deterministic Runtime mechanics or current state;
5. old Memory evidence cannot override current state;
6. equal entry bodies from different IDs/sources remain distinguishable;
7. visibility produces different target Context views;
8. a Session remains pinned to Library Knowledge rev N when Library moves to rev N+1 unless explicitly upgraded.


#### N6 validated implementation record

Validated HEAD: `b1043b2e0158cf4d5ade4d057570efe2a7af8ac1`  
Workflow: **Native Content Session Dev Checks #118**  
Run: `35703649183`

Implemented:

- deterministic `KnowledgeCompiler` and target-aware `KnowledgePlan`;
- authority-vs-priority separation and deterministic rejection diagnostics;
- committed SessionState/Event-Journal precedence over stale Knowledge;
- explicit Knowledge override semantics without Runtime/current-state authority escalation;
- Package canonical vs Library/Session augment ordering;
- Memory/history evidence as lower-authority evidence;
- stable Knowledge identity through existing World Info selection and prompt provenance;
- required/related/exclusive relation adaptation;
- Narrator/Actor/Agent visibility views;
- exact Library revision pinning and explicit upgrade behavior;
- Native World Info transition baseline moved from floor/swipe authority to revision/branch/message-scoped SessionState;
- Draft-local state-event baseline commits atomically with accepted generation and is discarded on Stop.

Validation:

- N6 focused integration: **7 suites / 99 tests passed**;
- complete Node regression: **749 suites / 8750 tests passed**;
- full root lint: success;
- real-host Chromium Native Session acceptance: success;
- frontend webpack build: success.

Checkpoint K is satisfied. N7 remains responsible for total-budget bounded Context compilation, Narrative Spine, Commitments, derived coverage and ContextPlan diagnostics.

### N7 — Native Context Architecture

Implement the bounded Context Projection described in §21B.

Required components:

- ContextProvider / ContextItem contract;
- SessionContextCompiler;
- structured ContextPlan;
- model-aware total token budget with response reserve/safety margin;
- Hard Reserve + Minimum Guarantees + Elastic Pool allocation;
- token-budgeted complete TurnGroup recent window;
- source-backed Narrative Spine: Scene → Chapter → Arc → Campaign;
- Active Commitments;
- Derivation Gate;
- TurnDigest/Turn Distiller compatibility contract;
- Runtime/Orchestrator/default-Utility provider reuse and de-duplication;
- Memory cheap-ingest vs heavy-consolidation scheduling;
- branch/revision/source provenance;
- durable derived coverage and lag handling;
- exact raw Timeline drill-down through sourceRefs;
- Economy/Balanced/Rich policy without changing canonical data semantics;
- ContextPlan diagnostics.

Normal turns must not require multiple mandatory hidden model calls. Deterministic State/Event/Commitment updates run without LLMs. Semantic derivation is conditional, asynchronous where possible, and must not block ordinary Session play.

Existing per-subsystem token budgets become lane caps/inputs to the total compiler rather than independent guaranteed prompt allocations.

No canonical history may be removed or rewritten to satisfy model context limits.

**Checkpoint C — Context Boundedness:**

1. fixed model budget remains bounded as Timeline grows across synthetic 100 / 1,000 / 10,000+ turn cases;
2. excluded raw history remains retrievable from SessionRepo by stable IDs/ranges;
3. recalled ancient facts can drill through provenance to exact raw Timeline excerpts;
4. derived lag preserves uncovered raw history/context instead of losing it;
5. ContextPlan reports included/rejected items, reasons, lane tokens and coverage;
6. target visibility/isolation holds across Narrator/Actor/Agent contexts;
7. Narrative hierarchy is source-backed/branch-scoped and does not replace canonical history;
8. Utility/derived-work failure degrades gracefully without blocking main play.

#### N7 validated implementation record — 2026-09-22

N7 is complete and frozen at:

- validated HEAD: `8fa25d1175603da905a45b9de7b8de5a8d4b776f`;
- workflow: **Native Content Session Dev Checks #121**;
- run: `35711043211`;
- result: **success**.

Implemented and validated:

- one `SessionContextCompiler` owns total Native model-input budgeting;
- ContextProvider / ContextItem / ContextPlan structured contracts;
- Hard Reserve + Minimum Guarantees + Elastic Pool allocation;
- runtime/system/tool framing accounted inside the same total budget;
- complete token-budgeted TurnGroups with processed-prompt token accounting;
- N6 KnowledgePlan as a stable-identity Knowledge lane with World Info lane-cap integration;
- authoritative Native World/Game World/Event Journal context;
- source-backed Scene → Chapter → Arc → Campaign Narrative Spine;
- Active Commitments;
- Derivation Gate + bounded Turn Distiller compatibility;
- Runtime/Orchestrator/Utility result reuse;
- Memory cheap ingest and gated heavy consolidation;
- durable branch/revision/source provenance and derived coverage;
- stale asynchronous derived publication degrades safely;
- exact Timeline range/message-id drill-down;
- Memory provenance drill-down to immutable raw Timeline;
- Economy / Balanced / Rich policies;
- Narrator / Actor / Agent isolation;
- graceful non-blocking utility/provider failure.

Validation:

- N7 focused Checkpoint C: **6 suites / 53 tests passed**;
- N4 real-host Chromium Native Session acceptance: **4 passed**;
- full root lint: success;
- complete Node regression: **752 suites / 8777 tests passed**;
- frontend webpack build: success;
- all prerequisite N0/N1/N2/N5/N6 jobs: success.

Checkpoint C is satisfied. N8 may start from this frozen boundary.

### N8 — Save System & `.atriasave`

Implement:

- Auto Save;
- Quick Save;
- Manual Save;
- revision-backed SavePoint semantics;
- snapshot closure export;
- full-session export;
- engine-independent logical state serialization;
- import/restore;
- Package dependency resolution;
- resolved KnowledgeBindingSet persistence;
- Session-local Knowledge export/import;
- snapshots of Library Knowledge revisions required by the Session;
- durable Narrative Spine artifacts;
- Active Commitments;
- durable derived coverage/provenance;
- restore imported Library snapshots as Session-bound embedded Knowledge by default rather than silently polluting the target Library;
- optional explicit "save to my Library" promotion;
- optional password-protected AEAD mode;
- missing-dependency UX contract.

Do not save rebuildable embeddings/rerank indexes/token caches/ContextPlan caches/render caches.

Auto Save points to authoritative stable SessionRevision and must not wait for asynchronous Narrative/Memory consolidation to finish.

Historical Save load is non-destructive: continuing from a historical revision creates/activates an appropriate derived Timeline Branch instead of overwriting the route that reached the current HEAD.

**Checkpoint B exit:** a Native Session can run, exit, restart, save, load, export `.atriasave`, re-import, and preserve World/Knowledge/Memory/Orchestrator/Narrative/Commitment/branch consistency.

Only after this checkpoint may product UI cut over.

### N9 — Product UI Cutover

Switch Library/Studio/Play management surfaces to Native authorities.

Library becomes:

```text
Library
├─ 作品
├─ 世界与知识
│  ├─ 世界
│  └─ 知识库
└─ 技能
```

Implement:

- Works Library;
- World Library;
- KnowledgeBase Library;
- World detail and revision history;
- KnowledgeBase detail / Entries / Bindings / references / revision history;
- work detail;
- EntryPoint start flow;
- Continue;
- My Games;
- Save/Load;
- Timeline;
- Studio Projects;
- Project World/Knowledge dependency management;
- install/update preflight;
- Package/session delete semantics.

Native Play actions replace historical mutable-chat controls with:

- Retry Reply;
- Re-enter Turn;
- Restart From Here;
- Save / Quick Save / Load;
- Timeline.

Retire/hide Native product UI for:

- Swipe arrows/counter/picker;
- Swipe deletion;
- committed floor Edit;
- committed floor Delete;
- traditional in-place Regenerate semantics.

Expose ContextPlan/Context diagnostics through the appropriate diagnostics/logging surface so Context omission/selection can be debugged.

Retain the R7 Shell and route authority.

The existing `#WorldInfo` controller may remain as a transition/editor adapter but is no longer the Native Library data authority.

### N10 — Hard Cutover & Legacy Retirement

Retire Native product dependence on historical formats/concepts:

- remove Native PNG/JSON/JSONL/CharX/BYAF export paths;
- retire Characters/Games dual Library authority;
- retire CardApp as Atria product identity;
- retire Native identity by avatar_url/charDir/characterId;
- retire Manage Chat Files / Checkpoint Chat from Native product flow;
- retire `selected_world_info`, character primary/auxiliary lorebook, chat-lorebook and `charaFilename` binding as Native concepts;
- retire world/book name and World Info numeric `uid` as Native identity;
- retire WorldInfoRepo/`worlds/<name>.json` as Native authority;
- retire Native committed Swipe/Variant-switch semantics;
- retire Native committed message Edit/Delete;
- retire Native floor/swipe structural-event authority;
- retire FloorState as Native authority where SessionRevision has replaced it;
- establish residual guards preventing old persistence/content/timeline authority from returning.

Do not mechanically delete genuine SillyTavern runtime ABI or mature World Info/generation machinery still required behind adapters.

**Final exit:** active Native product flows use Package/World/Knowledge/immutable Timeline/SessionRevision/bounded Context authorities end-to-end; legacy persistence/content/history mutation cannot silently become authoritative.

## 25. Verification strategy

Every phase gets targeted checks plus the broader relevant regression surface.

Minimum relevant coverage over the program:

- Native schema/invariant tests;
- opaque-ID tests including World/Knowledge families;
- World/Knowledge immutable revision and identity tests;
- KnowledgeBinding resolution/revision-pin tests;
- Knowledge authority/visibility/exclusivity/identity-preservation tests;
- bounded Context compilation tests across increasing Timeline sizes;
- ContextPlan lane/rejection/coverage/visibility diagnostics tests;
- Narrative Spine provenance/hierarchy/branch tests;
- Active Commitment lifecycle/deduplication tests;
- derived-coverage lag/fallback tests;
- Package build/validate/install security tests;
- malformed container / traversal / zip-bomb / integrity tests;
- Package version immutability and GC reference tests;
- AssetStore dedup/reference/GC tests;
- Storage contract tests across FS/SQLite/MySQL/PostgreSQL;
- cross-engine round trips;
- FS crash/partial-commit SessionRevision tests;
- Session branch/timeline/variant tests;
- committed Timeline immutability / Write Barrier tests;
- direct projected `chat[]` mutation fail-closed tests;
- Retry/Re-enter/Restart/Fork semantic tests;
- runtime adapter message action tests;
- existing generation/prompt/regex regressions;
- World Runtime tests;
- Memory tests;
- Orchestrator tests;
- Floor/structural-event tests;
- SavePoint consistency tests;
- `.atriasave` snapshot/session round trips;
- encrypted save success/wrong-password/tamper tests;
- R7 Shell / Workspace / Native Play browser smokes;
- Studio Project/build/preview tests;
- Library works/session UX tests;
- World/Knowledge Library and Studio dependency UX tests;
- full Node unit suite and frontend build at major checkpoints;
- Native authority residual guard.

Android/Docker validation remains opt-in unless touched code actually requires it under repository rules.

Do not report checks that were not actually run.

---

## 26. CI / development workflow

For N0–N10:

1. work only on `refactor/atria-native-content-session-architecture`;
2. keep `main` stable and untouched until final integration;
3. commit each coherent slice;
4. run focused tests before broader tests;
5. record validated HEAD per phase;
6. when CI enters a clearly long verification run, stop polling and report status;
7. resume when the user reports CI complete;
8. if real Android/Termux logs, real UI screenshots, permissions, Secrets, or account authorization are required, stop and request only that external input;
9. otherwise diagnose/fix ordinary failures independently.

At final completion:

1. finish N10 residual scan/validation;
2. update permanent docs;
3. create/update final PR to `main`;
4. validate all required CI;
5. merge;
6. verify integrated `main`;
7. delete the temporary refactor branch only after successful integration.

---

## 27. Non-goals

Do not turn this project into:

- a total rewrite of SillyTavern generation/runtime;
- a second Conversation engine;
- a second Shell/navigation architecture;
- a second World/Event authority;
- a second Memory authority;
- a compatibility migration project for historical local data;
- a permanent dual-store architecture;
- a reason to embed large asset blobs in SQL JSON;
- a reason to hide every developer source file behind encrypted binary storage;
- a reason to preserve SillyTavern Swipe/Edit/Delete as Native product semantics;
- a rolling-summary system that overwrites/deletes canonical Timeline history;
- a design where every Memory/Narrative/Commitment subsystem independently reserves prompt tokens or launches mandatory per-turn LLM calls.

---
