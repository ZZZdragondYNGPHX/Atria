# Atria Native Content & Session Architecture Refactor

## Status

- **Decision state:** product / data / storage / runtime / UX direction frozen
- **Implementation state:** N0 and N1 validated; N2 is next. Current validated implementation HEAD is `refactor/atria-native-content-session-architecture@fd6ad1b423b6cd18fcb5da184f75ed82d7117368`
- **Authoritative development baseline:** `main@2c1c171136cb6f35f3f4fff7c62b148b7200485a`
- **Working branch:** `refactor/atria-native-content-session-architecture`
- **Branch creation point:** `main@2c1c171136cb6f35f3f4fff7c62b148b7200485a`
- **Document branch:** `docs`
- **Implementation phases:** N0–N9
- **Merge policy:** keep the long-lived refactor branch isolated until the complete Native Package/Session/World/Knowledge cutover is validated; merge to `main` only after N9.

This plan is authoritative for the implementation conversation. Do not restart product design unless a concrete implementation contradiction is discovered.

---

## 1. Goal

Atria must stop treating a SillyTavern Character Card and its chat file as the product-level units of identity and persistence.

The new native model is:

```text
Studio Project
      ↓ Build
   .atria
      ↓ Install
PackageRepo + AssetStore
      ↓ EntryPoint
   SessionRepo
      ↓
Branch / Timeline / Session State
      ↓
SessionRevision
      ↓
SavePoint
      ↓ Export
  .atriasave
```

At runtime, mature SillyTavern generation/conversation machinery remains reusable through a one-way compatibility projection:

```text
Atria Native Authority
        ↓
SillyTavern Runtime Compatibility Adapter
        ↓
characters[] / this_chid / chat[] / chat_metadata
        ↓
existing generation / prompt / regex / conversation runtime
```

The compatibility adapter is a runtime ABI boundary. It is **not** a legacy persistence authority.

---

## 2. Hard-cutover policy

This project is a deliberate product/data-model break.

The native architecture does **not** guarantee migration of pre-native data and must not become more complex to preserve historical persistence shapes.

The following are explicitly outside the Native schema compatibility contract:

- PNG Character Card persistence.
- JSON Character Card persistence.
- CharX / BYAF persistence.
- `characters/<name>.png` identity.
- Character filename / avatar filename as an ID.
- `chats/<charDir>/*.jsonl` identity.
- `char_dir` as native ownership.
- legacy Character State sidecars as native package/session state.
- legacy CardApp directories keyed by character basename.
- legacy chat-file Checkpoint / Branch naming.
- old JSON / JSONL import/export as native Atria exchange formats.
- World Info filename/name as Native identity.
- World Info `uid` as Native cross-version identity.
- `selected_world_info`, `world_info.charLore`, character primary/auxiliary lorebook ownership, and chat-lorebook scope as Native ownership concepts.
- automatic startup migration from old local data.
- dual read.
- dual write.
- fallback from Native stores into old PNG / JSONL sources.
- Native schema fields whose only purpose is to preserve old Character/Chat storage semantics.

Formal rule:

> No field, table, API, ID, lifecycle rule, or compatibility shim may exist in the Native model solely because the pre-native Character/Chat persistence model used it.

If a legacy conversion tool is ever wanted later, it must be an independent peripheral converter that calls the public Native creation/import APIs. It must not shape the Native schema.

Native migration history starts at **Native schema v1**. Future migrations are Native v1 → v2 → v3, not SillyTavern/Luker/old-Atria → Native v1.

---

## 3. Product vocabulary

### User-facing vocabulary

- 作品
- 世界
- 知识库
- 知识条目
- 角色
- 开局
- 游戏进度
- 会话
- 存档
- 时间线
- 作品界面 / 自定义界面

### Code vocabulary

- Package
- PackageVersion
- World
- WorldRevision
- KnowledgeBase
- KnowledgeRevision
- KnowledgeEntry
- KnowledgeBinding
- KnowledgePlan
- Actor
- EntryPoint
- Project
- Session
- Branch
- TimelineEntry
- Variant
- SessionRevision
- SavePoint
- AssetRef
- Package UI

The following historical user-facing concepts should retire from Native product surfaces:

- Character Card
- Card
- Chat File
- Manage Chat Files
- Checkpoint Chat
- CardApp
- Game Package attached to Character
- JSONL
- PNG Character

SillyTavern internal terminology may remain inside the compatibility/runtime boundary when removing it would create unrelated risk.

---

## 4. Identity model

Every Native entity uses a stable opaque ID. Display names, filenames, paths, array indexes, and avatar names never serve as long-term identity.

Recommended ID families:

- `pkg_*` — Package
- `pkgv_*` — Package Version
- `actor_*` — Actor
- `entry_*` — EntryPoint
- `project_*` — Studio Project
- `ses_*` — Session
- `br_*` — Branch
- `msg_*` — Timeline Entry
- `var_*` — Message Variant
- `rev_*` — SessionRevision
- `save_*` — SavePoint
- `asset_*` — logical asset reference
- `world_*` — Library/Package World identity
- `worldv_*` — immutable World revision
- `kb_*` — KnowledgeBase identity
- `kbv_*` — immutable Knowledge revision
- `kentry_*` — stable KnowledgeEntry identity
- `kbind_*` — KnowledgeBinding identity

Renaming a work, actor, save, branch, avatar file, or source file must never move or rewrite unrelated persistence solely to preserve identity.

---

## 5. Atria Package model

A Character Card is no longer Atria's top-level product object.

The top-level installed/portable object is `AtriaPackage`.

A package may contain zero, one, or many actors. A traditional single-character roleplay card becomes the smallest possible package rather than a separate data model.

Logical package contents:

```text
AtriaPackage
├─ identity
├─ entrypoints
├─ actors
├─ worlds
├─ knowledge
├─ runtime
├─ orchestration
├─ memory
├─ ui
├─ skills
├─ presets
├─ processors
├─ assets
├─ localization
└─ permissions
```

### 5.1 Package responsibilities

A Package describes distributable authored content:

- identity and metadata;
- Actors / NPCs / narrators / enemies;
- EntryPoints;
- World definitions and initial World State;
- knowledge / lore;
- Game Runtime declarations;
- Commands / Reducers / Rules / Events;
- observations / interpretation mappings;
- Agent / orchestration authored profiles;
- Memory schemas/policies;
- Package UI / custom surfaces;
- Skills;
- recommended presets/personas/runtime role hints;
- Regex/processors where explicitly package-owned;
- images/audio/video/other assets;
- localization;
- capability and permission declarations.

A Package never contains live user progress such as current conversation history, current World State, generated Memory instance, current Orchestrator state, current checkpoints, or logs.

---

## 6. EntryPoint model

`EntryPoint` replaces the architectural special-casing of `first_mes`.

A package may declare one or many starts, for example:

- main story;
- sandbox;
- character route;
- campaign;
- challenge mode;
- new-game-plus.

An EntryPoint may specify:

- initial actors;
- playable/user identity hints;
- `worldIds[]` and an optional `primaryWorldId` referencing Package-contained immutable World snapshots;
- optional KnowledgeBinding IDs active for this start;
- World State overlay;
- initial Timeline;
- Package UI mode;
- Runtime configuration;
- recommended Persona/Preset;
- orchestration configuration;
- Memory schema/policy.

For a simple single-Actor narrative package, the experience remains one click: Package → Start → Play.

---

## 7. Package versions

Installed Package versions are immutable.

Conceptually:

```text
pkg_123
├─ v1.0 / hash_A
├─ v1.1 / hash_B
└─ v2.0 / hash_C
       ↑ current
```

A Session records the exact package dependency:

- packageId;
- packageVersion;
- packageContentHash;
- EntryPoint;
- runtime/native schema version where applicable.

Installing a new Package version does not mutate historical sessions.

Old Package versions may be garbage-collected only when:

- they are not current;
- no Session / Save dependency references them;
- no explicit retention policy pins them.

Package-version save migration may exist later as a **Native-to-Native** feature. It does not justify old Character/Chat compatibility.

---

## 8. `.atria` format

### 8.1 Purpose

`.atria` is the only normal Atria-native portable **work/package distribution** format.

Normal Native UI must not export work content as PNG, Character JSON, CharX, BYAF, or similar historical card formats.

### 8.2 Evolution from current main

Current `.atria-distribution v1` is a useful security/validation foundation and should be evolved rather than discarded.

Current reusable concepts include:

- archive-size limits;
- entry-count and per-file limits;
- path normalization / traversal rejection;
- compression-ratio limits;
- inventory;
- SHA-256 integrity;
- Source Project validation;
- validate-before-restore;
- exclusion of save/progress/checkpoint paths.

The new format becomes a general Package Container v2 rather than a `game/`-only distribution.

### 8.3 Source vs artifact

Studio Source Projects remain readable, diffable, Git-friendly authoring trees.

```text
Source Project
  ↓ normalize / validate
Package Manifest + content
  ↓ compress
binary envelope / obfuscation / encryption layer
  ↓
*.atria
```

Internal authoring may still use JSON, JS, CSS, images, audio, SVG, etc. The hard cutover applies to **user-facing native exchange artifacts**, not to developer-friendly source files.

### 8.4 Binary envelope

The final `.atria` artifact must not merely be a ZIP renamed to `.atria`.

Use an Atria binary envelope around the compressed payload with:

- magic/header;
- container/schema version;
- bounded metadata necessary for safe preflight;
- encrypted/obfuscated payload;
- integrity/authentication;
- optional creator signature.

The normal package protection goal is:

- prevent direct ZIP browsing;
- prevent casual raw JSON editing;
- make corruption/tampering detectable;
- raise reverse-engineering cost.

Do not claim that a generally distributable client-readable Package can be cryptographically secret from the final user.

### 8.5 Permissions

Because a Package may contain UI/code, the Package manifest must declare capabilities/permissions such as:

- custom UI;
- generation;
- runtime tools;
- World writes;
- network;
- clipboard;
- asset access;
- other privileged capabilities.

Pure declarative content should be the lowest-risk tier. Scripted/custom content runs behind a constrained capability boundary. High-impact permissions require explicit user visibility/consent.

---

## 9. Studio Project model

The current `card-apps/<charId>` mixed responsibility must be retired.

A Project is editable source, not an installed Package.

Conceptually:

```text
projects/<projectId>/
├─ .git/
├─ package source metadata
├─ actors/
├─ worlds/
├─ knowledge/
├─ runtime/
├─ orchestration/
├─ memory/
├─ ui/
├─ skills/
├─ assets/
└─ localization/
```

Studio opens `projectId`, not `characterId`.

Flow:

```text
Studio Project
    ↓ Preview (ephemeral)
    ↓ Build
*.atria
    ↓ Install
PackageRepo + AssetStore
```

Installed Packages are not hot-edited in place.

"Create editable copy" / equivalent may create a new Studio Project from content when the product allows it.

Studio Preview must use an ephemeral preview session and must not contaminate the user's normal Session list.

---

## 10. AssetStore

Package/runtime assets are no longer owned by a Character directory.

Use a content-addressed, immutable AssetStore. Blob identity is based on content hash; logical package asset IDs reference the blob.

Benefits:

- filename changes do not affect identity;
- deduplication across Package versions/packages;
- stable integrity checking;
- independent lifecycle/GC;
- Sessions can retain a referenced asset even after a Package is hidden/removed;
- large binary assets do not need to live inside SQL JSON documents.

Asset GC must be reference-aware.

---

## 10A. Native World & Knowledge architecture

World Info is not carried forward as a filename-scoped Native authority. Native content uses first-class World and Knowledge entities while the mature World Info selection engine remains reusable behind a runtime adapter.

### 10A.1 World

A `World` describes a reusable content domain: what a world is, not what has happened in one player's current run.

A Library World has:

- stable `worldId`;
- immutable `WorldRevision` records identified by `worldRevisionId`;
- display identity/description;
- optional World Schema;
- immutable baseline initial state;
- Knowledge bindings;
- maps/media/assets;
- world metadata and intrinsic declarative constraints.

A World does **not** own:

- EntryPoints;
- Package UI;
- Agent orchestration;
- model-role routing;
- Package permissions;
- the executable game loop;
- current Session progress.

A Package may contain zero, one, or many World snapshots.

Library World revisions are authoring dependencies. Package build pins an exact WorldRevision and vendors the required immutable snapshot into the PackageVersion. Runtime therefore does not depend on the target machine's Library still containing that World.

```text
Library WorldRevision
        ↓ authoring reference
Studio Project
        ↓ Build / dependency closure
PackageVersion World Snapshot
        ↓ EntryPoint overlay
Session World State
```

The Package snapshot is immutable baseline content. Current mutable facts belong only to Session State / Event Journal.

### 10A.2 KnowledgeBase / KnowledgeRevision / KnowledgeEntry

A traditional Lorebook/World Info book becomes a `KnowledgeBase`.

A Library KnowledgeBase has:

- stable `knowledgeBaseId`;
- immutable revisions identified by `knowledgeRevisionId`;
- a stable set/order of entries for that revision;
- metadata/provenance.

Every `KnowledgeEntry` has a stable `knowledgeEntryId`. Neither legacy numeric `uid`, book name, filename, nor entry body is Native identity.

A KnowledgeEntry contract may represent:

- content;
- discovery: keywords, aliases, regex, semantic/vector hints;
- applicability: stateConditions, stateEvents, stateActivation;
- lifecycle: probability, sticky, cooldown, delay;
- relations: required dependencies, related entries, exclusive groups;
- delivery: insertion target/position, priority, visibility;
- metadata.

Simple authors must still be able to create natural-language entries with minimal discovery fields. Structured claims are optional advanced metadata, not a mandatory database-authoring model.

### 10A.3 Knowledge ownership

Knowledge has three runtime/content ownership classes plus Project source:

1. **Package-owned Knowledge**
   - authored or vendored into an immutable PackageVersion;
   - canonical baseline for that Package;
   - read-only during Sessions.

2. **Library-owned Knowledge**
   - reusable user-owned KnowledgeBase revisions;
   - may be referenced by many Projects/Sessions;
   - editing creates a new immutable revision;
   - an existing Session remains pinned to its previous revision until explicitly upgraded.

3. **Session-local Knowledge**
   - belongs only to one Session;
   - is saved/exported with the Session;
   - may hold explicit player-authored notes/rules/reference material;
   - does not mutate Package or Library content.

4. **Project-owned Knowledge Source**
   - editable Studio source;
   - Build converts it into immutable Package Knowledge.

Session-local Knowledge is distinct from Memory. Knowledge is explicit editable reference/policy material; Memory represents historical evidence, recalled experience, extracted facts and provenance.

### 10A.4 KnowledgeBinding

Knowledge scope is expressed by a first-class `KnowledgeBinding`, not by properties such as "global", "character", "character_aux", or "chat".

A binding identifies:

- stable `knowledgeBindingId`;
- an exact Knowledge source/revision;
- target/scope;
- enabled state;
- binding mode;
- visibility;
- optional priority/selection policy.

At minimum, binding mode distinguishes:

- `augment` — supplement canonical content without implicitly overriding it;
- `override` — explicit user/package-author intent to override ordinary Knowledge at the Knowledge layer.

A Knowledge override never gains authority to mutate or override deterministic Runtime mechanics or authoritative Session State.

Library-wide automatic behavior is modeled as an explicit binding policy, not as a KnowledgeBase intrinsically becoming "global".

### 10A.5 Session revision pinning

Session creation resolves Package defaults, EntryPoint bindings, Library binding policies and Session-local bindings into an immutable/resolved binding set.

The Session pins exact Knowledge revisions and does not follow Library "latest" automatically.

Updating a running Session to a newer Library Knowledge revision is an explicit action and must produce a new SessionRevision.

SessionRevision therefore includes a Knowledge binding-set head/reference in addition to Timeline and state heads so old SavePoints restore the exact knowledge dependency set used at that revision.

### 10A.6 Knowledge authority and prompt compilation

Native Knowledge does not use "last text wins" semantics.

Authority is separate from per-layer priority.

The conceptual authority order is:

1. deterministic Runtime mechanics/contracts;
2. authoritative current Session World State;
3. committed Event Journal;
4. explicit Session Knowledge overrides;
5. Package/World canonical Knowledge;
6. Library augment Knowledge;
7. Session augment Knowledge;
8. Memory/history evidence;
9. raw conversation text as narrative input.

Priority only orders/selects content **within the same authority class**. A high-priority Memory item cannot override current World State.

### 10A.7 KnowledgeCompiler / KnowledgePlan

N6 introduces a deterministic `KnowledgeCompiler` stage:

```text
Package Knowledge
Library bindings
Session-local Knowledge
Memory recall
World State
Event Journal
        ↓
KnowledgeCompiler
        ↓
KnowledgePlan(target)
        ↓
Knowledge Runtime Adapter
        ↓
existing World Info selection / prompt assembly machinery
```

The compiler resolves:

- exact revisions/bindings;
- applicability;
- visibility;
- authority;
- explicit override/exclusivity;
- dependencies;
- identity-based dedupe;
- budget selection;
- rejection/selection reasons.

The intermediate/final plan preserves at least:

- knowledgeBaseId;
- knowledgeRevisionId;
- knowledgeEntryId;
- knowledgeBindingId;
- source;
- authority;
- target/visibility;
- selection reason;
- state evidence;
- budget cost.

Entry body text must never be used to reconstruct identity/source after selection.

Different Actors/Agents may receive different KnowledgePlans from the same Session because visibility is target-aware.

### 10A.8 Reuse of the existing World Info engine

This refactor does **not** require rewriting every mature World Info selection capability.

The existing runtime should initially remain responsible for suitable existing mechanics such as:

- keyword/secondary-key scanning;
- regex matching;
- optional vector/semantic candidate generation;
- probability/group behavior;
- recursion;
- sticky/cooldown/delay;
- insertion positions;
- state conditions/events/stateActivation;
- activation tracing;
- existing prompt-injection compatibility.

Native World/Knowledge replaces identity, ownership, versioning, binding and authority above that engine.

Legacy runtime `uid` may exist as an adapter-local transient handle but must not escape as Native identity.

### 10A.9 Library UX target

The final Library structure remains:

```text
Library
├─ 作品
├─ 世界与知识
│  ├─ 世界
│  └─ 知识库
└─ 技能
```

World detail may expose Overview / Knowledge / Schema / Baseline / Maps & Assets / References / Revision History.

KnowledgeBase detail may expose Overview / Entries / Bindings / References / Revision History.

The Native UI no longer treats the existing `#WorldInfo` controller as the Library data authority; it may remain an adapter/editor implementation during transition.

---

## 11. Session model

A Session is an entire playable/interactive run.

A Session is **not** a chat file.

```text
Session
├─ identity / package dependency
├─ active Branch
├─ BranchGraph
├─ Timeline
├─ Session State
├─ Revisions
└─ SavePoints
```

The message history is only the Session's Timeline.

A Session belongs to a Package version, not to a Character PNG/filename.

Example record fields:

- sessionId;
- packageId / packageVersion / packageContentHash;
- entryPointId;
- display title;
- activeBranchId;
- createdAt;
- updatedAt.

---

## 12. BranchGraph

Branching becomes a first-class Session structure rather than copied/truncated chat files.

A Branch contains stable identity and ancestry:

- branchId;
- sessionId;
- parentBranchId;
- forkPoint;
- createdAt;
- display name where needed.

"Checkpoint Chat" is not a Native concept.

User-facing terminology is **Timeline / 时间线**.

The UI may offer:

- create timeline from here;
- switch timeline;
- rename timeline;
- delete timeline.

---

## 13. Timeline and message variants

Timeline entries use stable `messageId`; message array index is runtime presentation only.

A Timeline entry may contain:

- messageId;
- branchId;
- stable sequence/order information;
- role;
- content;
- metadata;
- variants;
- activeVariantId.

Variants use stable `variantId`.

The compatibility adapter may project this to SillyTavern:

- `chat[index]`;
- `swipes[]`;
- `swipe_id`.

Long-term state references use `messageId + variantId`, not "floor 42, swipe 3" as identity.

---

## 14. Session State

Runtime progress belongs to Session State, not Package/Character State.

Examples:

- `atri_game_world`;
- Memory Graph durable state;
- Orchestrator durable/floor state;
- Search durable/floor state;
- Package-owned durable runtime state;
- variables / op-log;
- future plugin session namespaces.

Current `getChatState()` / `createFloorState()` APIs may temporarily remain as compatibility APIs while their Native Session backend changes.

New Native APIs may later expose clearer names such as:

- `getSessionState()`;
- `createTimelineState()`.

Do not duplicate authority.

---

## 15. Character State split

Do not port Character State as-is.

Split historical uses into correct lifecycles:

### Authored distributable configuration

Examples:

- Memory schema;
- recommended presets/personas;
- Orchestrator authored profile;
- Game Runtime configuration.

→ Package Manifest/content.

### User preference about an installed Package

Examples:

- favourite;
- local Persona override;
- local preferred model profile;
- presentation preference.

→ PackageUserState / PackageRepo state keyed by packageId + namespace.

### Live progression

Examples:

- HP;
- location;
- quest state;
- current Memory;
- world state;
- agent notes.

→ SessionState.

---

## 16. SessionRevision

Use a cross-state consistency boundary.

A SavePoint must not independently guess that a Timeline head, World state, Memory state, and Orchestrator state belong to the same moment.

A `SessionRevision` represents one coherent commit point:

```text
SessionRevision
{
  revisionId,
  sessionId,
  branchId,
  timelineHead,
  stateHeads: {
    atri_game_world: ...,
    atri_memory_graph: ...,
    atri_orchestrator: ...,
    ...
  }
}
```

SavePoints reference a revisionId.

A SessionRevision also records the exact resolved Knowledge binding-set head/reference used by that revision, so restoring a SavePoint cannot silently follow newer Library Knowledge.

### FS durability model

Current FsEngine does not provide true cross-resource rollback.

Native Session persistence therefore uses immutable writes plus **commit-last**:

1. write immutable Timeline revision/blob;
2. write immutable state revisions/blobs;
3. write other required immutable pieces;
4. atomically publish SessionRevision manifest;
5. update the Session HEAD pointer last.

An interrupted write that never publishes the Revision manifest is not committed. Unreferenced immutable data is later GC-able.

SQL engines may use true transactions as an optimization, but observable semantics must match FS.

---

## 17. SavePoint model

`Session ≠ SavePoint ≠ portable file`.

SavePoint kinds:

- auto;
- quick;
- manual.

A SavePoint is a local immutable pointer to a SessionRevision, with fields such as:

- saveId;
- sessionId;
- branchId;
- revisionId;
- display name;
- kind;
- createdAt.

Normal auto/quick/manual saves are Store operations and do not continuously produce external files.

---

## 18. `.atriasave` format

### 18.1 Purpose

`.atriasave` is the only normal Atria-native portable Session/save artifact.

It is not "encrypted JSONL".

### 18.2 Export scopes

The same format supports at least:

- `scope = snapshot` — default; export the closure necessary to restore one SavePoint.
- `scope = session` — advanced; export the full Session including relevant branches/save history.

Default user action exports `snapshot`.

### 18.3 Snapshot closure

A snapshot export includes everything necessary to continue the selected SavePoint coherently, including applicable:

- Session metadata;
- package reference/version/hash;
- EntryPoint reference;
- Branch ancestry required by the snapshot;
- Timeline/message variants;
- current active variant selections;
- authoritative World State and Event Journal;
- portable Session State;
- required Floor/Timeline-state history;
- variables/op-log;
- canonical Memory and user corrections/provenance;
- durable Orchestrator/package state;
- Session-owned attachments required for restore;
- the resolved Knowledge binding-set revision/head;
- Session-local Knowledge;
- snapshots of Library-owned Knowledge revisions required by the Session.

It must not simply copy current FS sidecar filenames.

The artifact contains a storage-engine-independent logical snapshot so FS / SQLite / MySQL / PostgreSQL produce compatible exports.

### 18.4 Excluded derived/user-global data

Do not export deterministic/rebuildable caches:

- embeddings;
- rerank caches;
- search indexes;
- prompt caches;
- render caches;
- recent indexes;
- thumbnails;
- compiled caches;
- transient agent context.

Do not export account/global secrets:

- API keys;
- provider credentials;
- account data;
- global plugin data;
- entire user settings;
- device settings.

A save may carry non-secret dependency references. Missing runtime dependencies are resolved interactively after import.

### 18.5 Encryption

Save files may contain sensitive private conversation/memory content.

The container should support:

- standard Atria portable protection;
- optional password-protected mode using a real KDF + authenticated encryption (AEAD).

---

## 19. Package/save dependency resolution

An `.atriasave` identifies:

- packageId;
- packageVersion;
- packageContentHash;
- EntryPoint;
- Native/runtime schema versions as required.

Load cases:

1. exact Package ID/version/hash available → load;
2. same Package but different version → only a declared Native save-migration path may upgrade it;
3. Package missing → surface unresolved dependency; never attach to a package based on a similar display name.

Do not embed the complete Package into every Save by default.

A future explicitly declared self-contained save mode may embed a package snapshot, but that is optional and must not blur normal Package/Save separation.

---

## 20. Storage architecture

Native runtime data uses explicit first-class repositories/resources rather than hiding inside `named_docs`.

Required authorities:

### PackageRepo

Owns:

- Package records;
- installed/current version pointers;
- PackageVersion metadata;
- PackageUserState.

Primary identity: `handle + packageId`.

### AssetStore

Owns immutable content-addressed blobs and reference metadata.

### WorldRepo

Owns **Library authority only** for World records and immutable WorldRevisions, current-revision pointers, reference tracking and GC eligibility. Package-contained World snapshots live inside PackageVersion; current mutable world facts live in Session State.

### KnowledgeRepo

Owns **Library authority only** for KnowledgeBase, immutable KnowledgeRevision, stable KnowledgeEntry records/revisions, reference tracking and GC eligibility. Package-contained Knowledge snapshots live inside PackageVersion; Session-local Knowledge lives in SessionRepo.

### SessionRepo

Owns:

- Sessions;
- BranchGraph;
- Timeline;
- Variants;
- Session State;
- Session Revisions.

Primary identity begins with `handle + sessionId`.

### SavePointRepo

Owns SavePoint records/pointers.

### ProjectStore

Owns editable Studio source projects.

ProjectStore is intentionally more filesystem/Git-oriented than runtime repositories.

### Expected Native resource/table families

Exact physical schema is finalized in N0/N1, but the architecture expects dedicated first-class resources comparable to:

- packages;
- package_versions;
- package_states;
- sessions;
- session_branches;
- timeline_entries;
- timeline_variants;
- session_states;
- session_revisions;
- save_points;
- asset_refs;
- worlds;
- world_revisions;
- knowledge_bases;
- knowledge_revisions;
- knowledge_entries;
- knowledge_bindings.

Large asset blobs should remain in AssetStore instead of SQL JSON columns.

---

## 21. SillyTavern Runtime Compatibility Adapter

Atria remains SillyTavern-based and should reuse its mature generation/conversation runtime.

Do not attempt a simultaneous rewrite of all generation, regex, prompt, message rendering, plugin, and conversation machinery.

The Native compatibility adapter projects current Package/Session state into the shapes required by the existing runtime:

- `characters[]`;
- `this_chid`;
- `characterId`;
- `chat[]`;
- `chat_metadata`;
- current swipe arrays/indexes;
- other narrowly required ABI surfaces.

Direction is strictly one way:

```text
Native authority → ST runtime projection
```

Never:

```text
PNG/JSONL/ST runtime buffers → authoritative Native reconstruction
```

The adapter is allowed to translate transient runtime operations back into explicit Native commands/writes, but those writes must land only in the Native authority.

No long-term Native↔legacy dual-write period.

---

## 22. Product UX

Keep the R7 primary shell:

- Play
- Library
- Studio
- Agents
- Runtime

Do not initiate another shell rewrite.

### 22.1 Library

Replace the Characters/Games dual authority with one **作品 / Works** authority backed by PackageRepo.

Recommended structure:

```text
Library
├─ 作品
├─ 世界与知识
└─ 技能
```

Works may be filtered by capabilities, e.g.:

- 全部
- 角色互动
- 剧情
- 游戏
- 世界模拟
- 工具

These are views over Package capabilities, not separate databases.

### 22.2 Work detail

A Package detail page should support:

- Continue most recent Session;
- Start New;
- EntryPoint selection when needed;
- My Games / Sessions;
- Package information;
- actors/world/runtime capability summary;
- version management;
- package-local settings.

Opening a Package must not implicitly mutate global/current runtime state the way Character selection historically did.

### 22.3 Sessions

User-facing "My Games" entries are Sessions.

Opening a Session exposes its SavePoints.

Do not collapse "one run" and "one save" into the same concept.

### 22.4 Play

Play owns the active Session.

Provide contextual actions such as:

- Save;
- Quick Save;
- Load;
- Timeline;
- Game information;
- Exit to Work.

Do not turn Play into a storage-management dashboard.

### 22.5 Timeline

User-facing BranchGraph is presented as Timeline.

### 22.6 Empty Play

When no Session is active, show a product landing surface:

- Continue recent game;
- recent works;
- browse Library;
- start new game.

Do not expose an empty legacy chat page as the primary experience.

### 22.7 Studio

Studio becomes project/work authoring:

```text
Project Navigator
├─ 作品
├─ 开局
├─ 角色
├─ 世界
├─ 知识
├─ Runtime
├─ Agents
├─ Memory
├─ UI
├─ Skills
├─ Assets
└─ Localization
```

Studio identifies source by projectId.

### 22.8 Import/install

`.atria` import must validate before mutation and show a preflight summary including:

- name/author/version;
- Package ID;
- capabilities;
- content counts;
- declared permissions;
- signature status;
- installed version / update status;
- save compatibility declaration when relevant.

### 22.9 Delete semantics

Removing/hiding an installed Package must not silently delete Sessions.

When a PackageVersion is still required by Sessions, preserve required runtime content unless the user explicitly deletes dependent progress.

Deleting a Session deletes its own branches, timeline, state, revisions, SavePoints, and Session-owned attachment references. Package content remains.

---

## 23. Sync / backup boundary

Current sync categories are filesystem-shaped (`characters`, `chats`, `card-apps`, etc.).

Native long-term categories should move toward logical resources such as:

- Packages;
- Sessions & Saves;
- Projects;
- Assets;
- World Library;
- Skills;
- Presets;
- Settings.

However, a full Sync/Backup redesign is **not** the first implementation slice.

Native authorities must expose enough enumeration/export primitives that Sync/Backup can migrate later without reconstructing identity from old filenames.

---

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

### N4 — SillyTavern Runtime Projection

Implement the one-way adapter from Native Package/Session into existing runtime shapes.

Validate existing mature behavior against a Native Session:

- Send;
- Stop;
- Continue;
- user/assistant edit;
- Delete;
- Swipe;
- Regenerate;
- Branch;
- prompt assembly;
- Regex;
- existing World Info compatibility;
- generation;
- attachments;
- current R7 Play host identity/DOM invariants.

Writes return to Native stores only.

Do not implement the full Native KnowledgeCompiler in N4.

**Exit:** Native Session can drive existing conversation/generation runtime without a second Conversation engine and without authoritative JSONL dual-write.

### N5 — Native Runtime State Integration

Move Atria-owned durable runtime state to SessionState/Revision:

- Game World + Event Journal;
- Memory Graph;
- Orchestrator;
- Search;
- Variables/op-log;
- Floor/Timeline state;
- package-owned durable state.

Preserve old public API names only as runtime compatibility wrappers where necessary.

This phase establishes the authoritative current-state/Event/Memory inputs required by the KnowledgeCompiler.

**Exit:** structural operations (swipe/delete/branch/reload) keep Timeline and all authoritative runtime state coherent.

### N6 — Native Knowledge Runtime Integration

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

### N7 — Save System & `.atriasave`

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
- restore imported Library snapshots as Session-bound embedded Knowledge by default rather than silently polluting the target Library;
- optional explicit "save to my Library" promotion;
- optional password-protected AEAD mode;
- missing-dependency UX contract.

Package-contained Knowledge is already available through the pinned PackageVersion and need not be redundantly copied unless required by the chosen portable closure design.

**Checkpoint B exit:** a Native Session can run, exit, restart, save, load, export `.atriasave`, re-import, and preserve World/Knowledge/Memory/Orchestrator/branch/variant consistency.

Only after this checkpoint may product UI cut over.

### N8 — Product UI Cutover

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

Retain the R7 Shell and route authority.

The existing `#WorldInfo` controller may remain as a transition/editor adapter but is no longer the Native Library data authority.

### N9 — Hard Cutover & Legacy Retirement

Retire Native product dependence on historical formats/concepts:

- remove Native PNG/JSON/JSONL/CharX/BYAF export paths;
- retire Characters/Games dual Library authority;
- retire CardApp as Atria product identity;
- retire Native identity by avatar_url/charDir/characterId;
- retire Manage Chat Files / Checkpoint Chat from Native product flow;
- retire `selected_world_info`, character primary/auxiliary lorebook, chat-lorebook and `charaFilename` binding as Native concepts;
- retire world/book name and World Info numeric `uid` as Native identity;
- retire WorldInfoRepo/`worlds/<name>.json` as Native authority;
- establish residual guards preventing old persistence/content authority from returning.

Do not mechanically delete genuine SillyTavern runtime ABI or mature World Info selection machinery that the adapters still require.

**Final exit:** active Native product flows use Package/World/Knowledge/Session authorities end-to-end; legacy persistence/content identity cannot silently become authoritative.


## 25. Verification strategy

Every phase gets targeted checks plus the broader relevant regression surface.

Minimum relevant coverage over the program:

- Native schema/invariant tests;
- opaque-ID tests including World/Knowledge families;
- World/Knowledge immutable revision and identity tests;
- KnowledgeBinding resolution/revision-pin tests;
- Knowledge authority/visibility/exclusivity/identity-preservation tests;
- Package build/validate/install security tests;
- malformed container / traversal / zip-bomb / integrity tests;
- Package version immutability and GC reference tests;
- AssetStore dedup/reference/GC tests;
- Storage contract tests across FS/SQLite/MySQL/PostgreSQL;
- cross-engine round trips;
- FS crash/partial-commit SessionRevision tests;
- Session branch/timeline/variant tests;
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

For N0–N9:

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

1. finish N9 residual scan/validation;
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
- a reason to hide every developer source file behind encrypted binary storage.

---

## 28. Architectural invariants

The following invariants are load-bearing and should receive automated guards where practical:

1. Native identity never derives from display name, filename, avatar filename, path, or array index.
2. A Package is distributable authored content; a Session is user runtime progress.
3. Package content never owns current user progression.
4. Session runtime state never mutates an immutable installed PackageVersion.
5. Source Project and Installed Package are distinct.
6. Native writes never require PNG/JSONL dual-write.
7. ST compatibility projection is downstream of Native authority.
8. SavePoint references one coherent SessionRevision.
9. Rebuildable caches are not canonical save data.
10. Secrets/account-global credentials never enter Package/Save artifacts.
11. `.atria` and `.atriasave` are distinct formats with distinct lifecycles.
12. Normal user exchange paths do not expose raw PNG/JSON/JSONL as Native formats.
13. R7 Play/Library/Studio/Agents/Runtime shell ownership remains intact.
14. Old local data must not silently activate a fallback Native authority.
15. World/Knowledge names, filenames, legacy World Info `uid`, character/chat/global scope, or entry body text are never Native identity.
16. Package/World Knowledge is immutable canonical baseline; current mutable facts belong to Session State/Event Journal.
17. Library Knowledge edits create new revisions; running Sessions remain pinned until explicit upgrade.
18. Knowledge authority is separate from priority; Memory/augment content cannot override authoritative current state or deterministic Runtime mechanics.
19. Build vendors exact World/Knowledge dependency snapshots into PackageVersion so runtime does not depend on live Library content.
20. Future compatibility work must not weaken these invariants without an explicit new architecture decision.

---

## 29. Next implementation action

N0 and N1 are complete and validated.

Current validated branch HEAD:

`refactor/atria-native-content-session-architecture@fd6ad1b423b6cd18fcb5da184f75ed82d7117368`

The next implementation conversation starts at **N2 — Package / Project / World & Knowledge Composition**.

Before editing:

1. verify the live HEAD of `refactor/atria-native-content-session-architecture`;
2. preserve the complete validated N0/N1 history through `fd6ad1b423b6cd18fcb5da184f75ed82d7117368`;
3. read current `main:AGENTS.md`;
4. read current `main:FORK_MAINTENANCE.md`;
5. read `docs:handoff/latest-handoff.md`;
6. read `docs:handoff/atria-native-content-session-architecture.md`;
7. read this Master Plan;
8. inspect current `src/native/*`, `src/native/repositories/*`, the N1 Native storage engine implementation, and current Project/Studio/build/`.atria` code;
9. implement N2 only: ProjectStore, authoring dependency closure, Package Container v2 build/install, exact World/Knowledge snapshot vendoring, Package validation/security and ephemeral Preview seam.

Do not redesign N0, do not replace N1 storage, do not create another branch, do not start N3/N6/N8/N9 early, and do not make old PNG/JSONL/World Info persistence a Native fallback.

