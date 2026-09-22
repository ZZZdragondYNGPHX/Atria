# Atria Native Content & Session Architecture Refactor

## Status

- **Decision state:** product / data / storage / runtime / UX direction frozen
- **Implementation state:** N0/N1/N2/N3 validated; N4 implementation has progressed through `refactor/atria-native-content-session-architecture@952410a3f3d200754b046ccc2868166282958094` but is not phase-validated. A frozen N4 design amendment now removes committed Edit/Delete/Swipe semantics from Native product authority and adds a bounded Native Context Architecture later in the program.
- **Authoritative development baseline:** `main@2c1c171136cb6f35f3f4fff7c62b148b7200485a`
- **Working branch:** `refactor/atria-native-content-session-architecture`
- **Branch creation point:** `main@2c1c171136cb6f35f3f4fff7c62b148b7200485a`
- **Document branch:** `docs`
- **Implementation phases:** N0–N10
- **Merge policy:** keep the long-lived refactor branch isolated until the complete Native Package/Session/World/Knowledge cutover is validated; merge to `main` only after N10.

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

A SavePoint may point to a fully authoritative SessionRevision even when asynchronous derived Memory/Narrative/Context artifacts lag behind. Save/restore must preserve canonical authority first and carry the durable derived coverage/artifacts that already exist.

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
- snapshots of Library-owned Knowledge revisions required by the Session;
- durable Narrative Spine artifacts required for continuity;
- Active Commitments and their provenance/lifecycle;
- durable derived coverage/provenance metadata.

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
- transient agent context;
- ContextPlan cache;
- token-count cache;
- rebuildable derived retrieval indexes.

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

## 21A. Committed Timeline immutability

Native Atria uses an immutable committed Timeline.

This is a data-layer invariant, not merely a UI preference. It applies equally to:

- users;
- plugins/extensions;
- Agents;
- Package Runtime;
- Atria-owned modules.

Once a TimelineEntry is included in a committed SessionRevision, its canonical role/content/Actor/canonical attachment references/provenance and committed metadata cannot be edited, deleted, replaced, or switched to another committed Variant in place.

The only mutable conversation surface is a **Draft** before commit:

```text
Composer Draft / Generation Draft
        ↓ may mutate, stream, continue, abort
commit boundary
        ↓
Immutable TimelineEntry
        ↓
SessionRevision
```

Changes to the past use only:

- append a compensating/new TimelineEntry;
- retry from a predecessor/post-user revision onto a new Branch;
- re-enter a turn from its pre-user revision;
- restart/fork from a historical revision;
- load a historical SavePoint and continue on a derived Branch;
- explicit destructive maintenance/privacy purge outside normal Play/runtime APIs.

Normal Native APIs do not expose committed-history rewrite/delete/select-swipe capabilities.

### 21A.1 Product semantics

Native Play replaces historical SillyTavern mutation concepts with:

- **Retry Reply** — fork from the revision after the same User message and generate a new Assistant TimelineEntry;
- **Re-enter Turn** — fork from the revision before the User message and prefill the old User text as a Draft;
- **Restart From Here** — fork from the selected historical predecessor revision;
- **Load Save** — resume the SavePoint revision; when it is historical relative to the current route, continue on a derived Branch;
- **Continue** — after a committed Assistant message, append a new continuation TimelineEntry rather than extending the old committed content;
- **Stop** — acts only on Generation Draft; the user may commit the partial result or discard the Draft.

Native product surfaces retire:

- committed message Edit;
- committed message Delete;
- manual Swipe / Swipe picker;
- Swipe deletion;
- in-place Regenerate-to-Variant semantics.

Branching may be created automatically by Retry/Load/Re-enter/Restart; ordinary users do not need to understand Branch mechanics before using those actions.

### 21A.2 Variant boundary

The existing Native Variant contract is retained during this refactor because N0–N3 already validate it and the SillyTavern generator may still use swipe-shaped candidate buffers internally.

However:

- a committed Native message does not expose later user-selectable Swipe semantics;
- committed Variant selection cannot be changed in place;
- retrying creates a new Branch/message instead of selecting/adding a historical Swipe;
- ST `swipes[]`, `swipe_info`, and `swipe_id` may remain transient compatibility/generation implementation details until the final residual audit.

N10 may remove or further narrow Variant if no remaining Native use justifies it.

### 21A.3 Runtime write barrier

The N4 compatibility projection is a mutable SillyTavern runtime workspace downstream of an immutable Native snapshot.

At Native-open/commit boundaries, committed messages must retain canonical fingerprints over load-bearing fields such as:

- messageId;
- role;
- actorId;
- committed content;
- canonical attachment references;
- committed metadata/provenance.

If legacy/plugin code mutates a committed projected message directly, the adapter must fail closed with a Native committed-history mutation error, reject the write, avoid any JSONL/chat fallback, and require projection reload/recovery.

A difference in a committed projection is never translated into `revise`, `remove`, `removeVariant`, or committed `selectVariant` Native commands.

### 21A.4 Annotation vs canonical history

Immutability applies to canonical Timeline facts, not every UI/cache bit around a message.

Non-canonical overlays may be separate resources:

- presentation-only state (collapsed/favourite/render cache/translation cache) may mutate without SessionRevision when it cannot affect model/runtime semantics;
- semantic annotations that can affect Prompt/Memory/Agents are revisioned Session State keyed by stable messageId;
- hiding from the UI is presentation state; hiding from the model is a semantic/revisioned context-policy change.

This avoids using Timeline mutation for annotations while preserving strict canonical history.

---

## 21B. Bounded Native Context Architecture

Canonical history is not the model context.

Atria permanently preserves the immutable Session Timeline while compiling a bounded, target-specific **Context Projection** for each model call.

Formal rule:

> No canonical history is deleted, rewritten, or summarized away for context-budget reasons. Context reduction operates only on derived projections.

Conceptually:

```text
Immutable Timeline / Event Journal / Session State
        │
        ├─ Memory
        ├─ Narrative Spine
        ├─ Active Commitments
        ├─ KnowledgePlan
        └─ Recent Raw Timeline
                ↓
        SessionContextCompiler(target)
                ↓
             ContextPlan
                ↓
          Prompt Assembly / LLM
```

### 21B.1 History tiers

Use a bounded three-tier working model:

- **Hot** — recent raw complete TurnGroups selected by token budget, not a fixed message/floor count;
- **Warm** — source-backed Narrative Spine and active/relevant commitments;
- **Cold** — complete immutable Timeline/Event Journal/Memory that remains queryable by stable IDs/ranges and can be drilled back into exact original text.

A model not seeing an old message does not mean that message has been removed from the Session.

### 21B.2 Narrative Spine

Narrative continuity uses immutable, source-backed hierarchy rather than one repeatedly overwritten mega-summary:

```text
Raw Timeline / Event Journal
        ↓
Scene
        ↓
Chapter
        ↓
Arc
        ↓
Campaign Synopsis
```

Every Narrative artifact records provenance such as:

- branchId;
- from/to revision;
- source message IDs;
- source event IDs;
- child Narrative IDs;
- coverage.

Higher levels summarize bounded lower-level artifacts rather than re-reading the complete historical Timeline.

Scene boundaries prefer deterministic/semantic boundaries (scene/location/battle/quest/day/chapter changes). Token thresholds provide a fallback. Fixed "every N floors" is not the primary strategy.

Summary generation is asynchronous and never authoritatively writes World State. If a required summary is pending/failed, Context compilation preserves more uncovered Raw Timeline instead of losing history.

### 21B.3 Active Commitments

Open loops are independent of Narrative summaries.

A Commitment may represent:

- quest/mission obligation;
- explicit promise;
- unresolved mystery;
- debt;
- planned future action;
- relationship obligation.

It has stable identity, source provenance, open/closed/superseded lifecycle, importance and optional due/Actor/World references.

Deterministic Runtime/Event transitions are preferred for open/close operations. Orchestrator/default semantic extraction may propose missing commitments conservatively. Pollution is worse than under-capture.

Critical commitments receive guaranteed Context treatment; ordinary/background commitments compete by relevance and budget.

### 21B.4 Derived processing and cost control

Normal turns should require only the main generation call by default.

Derived work follows:

1. deterministic Runtime/State/Event updates synchronously when available;
2. a cheap deterministic **Derivation Gate** decides whether semantic work is worth running;
3. existing Runtime/Orchestrator-derived results are reused first;
4. when needed, one bounded **Turn Distiller** may produce a structured TurnDigest containing durable-fact candidates, commitment proposals, narrative beats and a scene-boundary proposal;
5. Memory performs cheap ingest first and heavier consolidation only on conflict/threshold/scene-close/compaction conditions;
6. Scene/Chapter/Arc/Campaign summaries run only at their boundaries.

Do not launch separate mandatory LLM calls every turn for Memory + Commitment + Scene detection + Summary.

Utility-model failure must not block Session play.

Atria may expose policy presets such as Economy/Balanced/Rich, but all modes share the same canonical Timeline/State/Event/Knowledge data model and save format.

### 21B.5 Coverage

Every durable derived artifact records the exact source coverage and branch/revision provenance.

Examples:

- Memory covered through revision X;
- Narrative Spine covered through revision Y;
- derived artifact covers specific message/event IDs.

If Timeline HEAD is newer than derived coverage, uncovered committed history must remain represented through Raw Timeline/Event projection. A summary must never cause uncovered history to disappear from the model context.

Branching reuses only common-ancestor derived coverage; branch-specific derived artifacts remain branch-scoped.

### 21B.6 SessionContextCompiler

N7 introduces one total-budget authority.

Context providers emit structured candidates rather than independently injecting unlimited prompt text.

Conceptual `ContextItem` fields include:

- contextItemId;
- lane;
- authority;
- priority/relevance;
- content;
- atomic/required;
- sourceRefs;
- visibility/target;
- optional min/max retention.

Required lanes include, as applicable:

- Runtime/system contract;
- tools;
- current User input;
- authoritative Current State/Event;
- critical Commitments;
- KnowledgePlan;
- Recent Raw Timeline;
- Narrative Spine;
- Memory recall;
- target-specific Agent context.

Budgeting follows:

1. model context limit;
2. response reserve;
3. safety/framing margin;
4. **Hard Reserve** for non-negotiable material;
5. **Minimum Guarantees** for essential lanes;
6. **Elastic Pool** for remaining candidates.

Authority and priority remain separate. Lower-authority material cannot displace authoritative current State merely by carrying a high priority.

Recent Raw Timeline is selected in complete TurnGroups by tokens, never by fixed floor count as the primary rule.

Existing subsystem budgets (for example Memory token budget) become lane caps/inputs to the total compiler, not independent guarantees that can collectively overflow the model.

### 21B.7 ContextPlan and diagnostics

The compiler emits a structured `ContextPlan` before Prompt assembly, including:

- revisionId / branchId / target;
- model context limit and response reserve;
- per-lane included candidates;
- rejected candidates and reasons;
- token usage;
- source refs/provenance;
- derived coverage/lag diagnostics.

Typical rejection reasons include budget, lower-authority conflict, superseded summary, visibility, or outside recent raw window.

This plan should later be inspectable through diagnostics/logging so "why did the model forget X?" can be answered from evidence rather than guesswork.

### 21B.8 Long-session storage/UI boundary

A bounded model context does not by itself solve browser memory growth.

Long term, Native Play must not require the entire Session Timeline to be projected into a permanently resident `chat[]`.

The architectural direction is:

```text
SessionRepo complete Timeline
        ↓ range/message-id reads
Visible UI window / Prompt-selected ranges
```

N4 may still project a complete current test Session for compatibility while proving runtime seams; N7/N9 must preserve the ability to move toward range-based Context reads and bounded UI windows without changing identity.

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
- Retry Reply;
- Re-enter Turn;
- Restart From Here;
- Timeline;
- Game information;
- Exit to Work.

Native Play does not expose committed-message Edit/Delete/Swipe actions. Historical change is expressed as restore/fork/new continuation, not in-place mutation.

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

**Status: in progress.** Preserve all N0–N3 validated work and the useful N4 runtime seams already implemented through the live branch. Current known work-branch HEAD at this design amendment is:

`952410a3f3d200754b046ccc2868166282958094`

Do not reset/restart N4.

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
20. Committed Native Timeline is immutable for users, plugins, Agents, Package Runtime and Atria-owned writers; past changes use append/fork/restore, not in-place rewrite/delete/swipe.
21. ST mutable `chat[]`/swipe structures are downstream Draft/runtime compatibility and cannot become Native authority; committed projection mutation fails closed.
22. Context-budget pressure never deletes, rewrites, or summarizes away canonical Timeline history; only derived Context projections are reduced.
23. Recent raw context is token-budgeted in complete TurnGroups, not governed primarily by fixed floor/message counts.
24. Narrative/Memory/Commitment artifacts carry branch/revision/source provenance and explicit coverage; uncovered history cannot disappear behind stale summaries.
25. One SessionContextCompiler owns the total model input budget. Subsystem budgets are caps/inputs, not independent guaranteed allocations.
26. Derived semantic work is gated/reused/asynchronous where possible; normal play does not require multiple mandatory hidden model calls every turn.
27. Presentation-only annotations may remain outside revisions, but any annotation/policy that can affect model/runtime semantics is revisioned state keyed by stable identity.
28. Future compatibility work must not weaken these invariants without an explicit new architecture decision.

---

## 29. Next implementation action

N3 remains the last fully validated phase at `c42ee3e98a27fbea97ded0917de081bcc8893680` (Native Content Session Dev Checks #44, run `35679448236`, success).

N4 has progressed further and is **not to be restarted or reset**. At the time of this architecture amendment, the live work branch is:

`refactor/atria-native-content-session-architecture@952410a3f3d200754b046ccc2868166282958094`

The commits from the original N4 projection work and live-runtime E2E are useful and must be preserved. Their acceptance semantics now change.

Continue N4 as follows:

1. fetch/re-read the live remote working-branch HEAD; if another conversation advanced beyond the SHA above, use the actual latest HEAD and never reset;
2. read current `main:AGENTS.md`, `main:FORK_MAINTENANCE.md`, both docs handoffs and this Master Plan;
3. preserve completed N0/N1/N2/N3 and all reusable N4 projection/generation/attachment/prompt/Regex/Knowledge/Branch/reload work;
4. add the committed Timeline Write Barrier and fail-closed direct-projection mutation protection;
5. remove committed `revise/remove/removeVariant/selectVariant` from the Native product command path rather than translating ST mutations into Native history changes;
6. keep ST swipe-shaped structures only where the mutable Draft/generator ABI still needs them;
7. change Native Retry Reply from Regenerate→Variant into Fork-from-post-user-revision → new Assistant message;
8. change committed Continue into append-continuation semantics;
9. rewrite N4 real-host tests: Edit/Delete/Swipe/Swipe-delete become negative/fail-closed cases; Send/Stop/Retry/Continue-as-append/Branch/reload/prompt/Regex/Knowledge/attachments remain positive acceptance;
10. add a direct third-party/projected `chat[]` committed-content mutation test proving Native authority does not change and no `/api/chats/*` fallback occurs;
11. do not begin N5 state migration, N6 KnowledgeCompiler, N7 Context Architecture, N9 UI cutover or N10 retirement early;
12. record actual N4 verification/CI and stop at its phase boundary.

Do not create another branch, merge to main, or introduce an old-store fallback.


---

## N2 implementation record — validated 2026-09-22

N2 — **Package / Project / World & Knowledge Composition** is complete and validated on:

`refactor/atria-native-content-session-architecture@bfa048dd2adc5bf6e90cfea47812be7bf7f4dcdb`

Validation:

- workflow: **Native Content Session Dev Checks #43**
- run: `35677654858`
- result: **success**
- N2 focused validation: **5 suites / 30 tests passed**
- N2 source ESLint: success
- N0 contracts and adjacent regressions: success
- full root ESLint: success
- N1 Native storage contract/parity job: success, including FS / SQLite / MySQL / PostgreSQL

### N2 Project source authority

Implemented a filesystem/Git-oriented `ProjectStore` rooted at:

`projects/<projectId>/`

The editable source manifest is `atria.project.json` using `atria-project-source v1`.

Native Studio source identity is exclusively opaque `projectId` / `packageId`; `characterId`, `charDir`, avatar names, filenames and paths are not identity. Project paths are authoring locations only.

Project source may contain:

- Project-owned immutable-shaped World source;
- Project-owned Knowledge source;
- Project-owned KnowledgeBindings;
- exact Library WorldRevision references;
- exact Library KnowledgeRevision references;
- exact Library KnowledgeBinding references;
- project asset source files.

### N2 dependency closure

Build resolves exact authoring dependencies and fails closed when exact immutable references are absent.

Library resolution is by:

- `worldId + worldRevisionId`;
- `knowledgeBaseId + knowledgeRevisionId`;
- `knowledgeBindingId`.

Build never follows display names or Library "latest" as a substitute for a pinned revision.

The resolver vendors:

- exact World snapshots;
- exact Knowledge snapshots and entries;
- binding closure;
- referenced immutable assets.

Project/Library KnowledgeBindings are normalized to Package-owned binding sources inside the built PackageVersion.

Knowledge `requiredEntryIds` are validated as a dependency graph. Missing relations fail composition and required-dependency cycles are rejected before packaging.

### N2 self-contained PackageVersion

`buildProjectPackage` composes the Source Project plus resolved closure into the frozen N0 `AtriaPackage v2` logical manifest and assigns a fresh opaque `packageVersionId`.

The build invariant is now executable and covered by tests:

> A built PackageVersion contains the exact World/Knowledge/asset closure required by its EntryPoints and does not need the author's live Library at runtime.

The end-to-end test builds on an author store with Library World/Knowledge, installs on a second store with no corresponding WorldRepo/KnowledgeRepo records, and successfully reopens the exact vendored World/Knowledge/assets from Package content alone.

Project-owned World/Knowledge is also covered independently and does not need to be published into Library first.

### N2 `.atria` Package Container v2

Native build/install uses a new **Package Container v2** implementation.

The final artifact is not a renamed ZIP. It uses:

- Atria binary magic/header;
- container version 2;
- bounded preflight metadata;
- compressed inner payload;
- AES-256-GCM authenticated obfuscation/envelope;
- SHA-256 payload/content integrity;
- explicit inventory;
- entry-count / file-size / total-size limits;
- path traversal / ambiguous path / case-conflict checks;
- decompression-ratio checks;
- Package manifest validation;
- exact packaged AssetRef integrity checks.

The protection layer intentionally raises casual reverse-engineering/editing cost and provides tamper detection; it is not treated as a secrecy boundary against a determined end user, consistent with this plan.

Preflight exposes only bounded Package identity/capability/permission metadata. Capabilities and permissions are independently whitelist-validated before payload decryption.

Required permissions must be explicitly granted to `PackageInstaller.install` or installation fails closed with `native_package_permission_required`.

### N2 install / AssetStore authority

Installed Package content is stored as an immutable content-addressed blob in `AssetStore` keyed by the PackageVersion `packageContentHash`.

`PackageRepo` continues to own Package / immutable PackageVersion metadata and current-version pointers only.

Install order preserves N1 FS semantics:

1. publish immutable content blob;
2. publish contained immutable assets;
3. ensure Package root exists;
4. commit immutable PackageVersion;
5. publish current-version pointer last through PackageRepo.

A failed metadata publication may leave only unreferenced immutable blob content, which remains GC-safe.

AssetStore blob GC now treats every stored PackageVersion `packageContentHash` as a strong reference.

`PackageInstaller.open` reopens installed Package content using only PackageRepo metadata + AssetStore blob data and verifies PackageVersion identity/hash consistency. It does not consult WorldRepo or KnowledgeRepo.

### N2 Studio seams

Implemented Native Studio core seams without starting N8 production UI cutover:

- `StudioProjectRouter` opens Native Studio work by `projectId`;
- `StudioPreviewHost` creates in-memory `preview_*` previews;
- preview descriptors are explicitly `persisted: false`;
- preview creation writes no `atri_session` resource and therefore does not contaminate the normal Session list.

The existing character-bound CardApp Studio surface remains only as an adjacent pre-cutover surface to be retired/re-routed in its scheduled later phases. It is not a Native Project authority.

### N2 coexistence boundary

The existing `src/game-package/distribution.js` `atria-distribution v1` implementation is intentionally still exercised as an **adjacent Game Runtime regression surface** during this long-lived branch.

It is not used by the N2 Native Source Project → Package build/install path and is not a Native fallback or dual-read authority.

Removal/rerouting of the old product-facing distribution/character transport belongs to the scheduled UI/legacy cutover phases, especially N8/N9. N2 does not perform that retirement early.

### Cross-realm JSON validation hardening

N2 exposed a pre-existing validator edge case when Native documents crossed Jest/plugin/worker realms and were revalidated during composition.

`contracts.js` and `world-knowledge.js` now identify plain JSON objects by object brand rather than same-realm prototype identity. This preserves rejection of Date/Map/Set/class instances while allowing ordinary JSON documents to move safely across runtime realms.

### N2 exit status

N2 exit criteria are satisfied:

- ProjectStore exists and is keyed by `projectId`;
- Native Studio core routing no longer requires character identity;
- Project-owned and exact Library World/Knowledge sources compose;
- exact dependency closure is resolved and validated;
- missing/cyclic dependencies fail closed;
- Source Project builds Package v2;
- `.atria` Package Container v2 exists with authenticated envelope/security preflight;
- exact World/Knowledge/assets are vendored;
- Package install/reopen uses PackageRepo + AssetStore;
- PackageVersion content is immutable/content-addressed;
- Preview is ephemeral and outside SessionRepo.

At the historical N2 boundary, the next phase was **N3 — Session Core**; N3 is now complete as recorded below.

Do not redo N0/N1/N2 and do not begin N6/N8/N9 work as part of N3.


---

## N3 implementation record — validated 2026-09-22

Working branch: `refactor/atria-native-content-session-architecture`

Validated HEAD: `c42ee3e98a27fbea97ded0917de081bcc8893680`

Status: **N3 complete and validated**. N4 is next, in a new implementation conversation.

### Session command authority

`src/native/session-core.js` exposes `SessionCore` using the existing SessionRepo, SavePointRepo and PackageInstaller, with optional KnowledgeRepo for explicit Library policy resolution.

Implemented commands:

- `create(handle, { packageId, packageVersionId, entryPointId, ... })`;
- `load(handle, sessionId, { revisionId? })`;
- `appendTimeline`, `addVariant`, `selectVariant`;
- `updateState` for base `atri_*` namespace replacement;
- `updateKnowledge` for explicit external binding-set replacement;
- `forkBranch` from a committed revision, `switchBranch`;
- `createSavePoint` and `restoreSavePoint` primitives.

Mutation commands accept an optional `expectedRevisionId`; publication always compares against the exact HEAD loaded by the command. Stale/concurrent writers receive `native_session_head_conflict`, not silent last-writer-wins.

### Immutable revision closure on the N1 resource model

No new storage engine, resource family, physical SQL schema, or Native ID family was needed. The N0 contracts remain intact.

- `atri_session_branch`: immutable branch birth/ancestry records.
- `atri_timeline_entry`: immutable message birth records (owning branch, role, actor, metadata and initial variant).
- `atri_timeline_variant`: immutable message-variant content/metadata.
- `atri_session_state`: immutable content-addressed namespace snapshots.
- `atri_session_revision`: immutable cross-state commit manifest.
- `atri_session`: mutable commit pointer, published last.

Reserved state namespaces:

1. `atri_session_core`: versioned BranchGraph membership, exact branch HEADs, exact fork revisions and parent commit revision.
2. `atri_timeline`: ordered message/owning-branch references plus the revision's variant inventory and active selections. It does not copy ancestor message text/records when branching.
3. `atri_knowledge`: resolved KnowledgeBindingSet referenced by `SessionRevision.knowledgeHead`.

`stateHeads` addresses the first two and ordinary Session state. `knowledgeHead` separately addresses the third.

The message birth record is not a current-message cache or second writable authority. Current Timeline content is materialized from the committed selection snapshot and immutable Variant records. `sequence` is reconstructed ordering, never identity.

### Base World state and exact dependencies

Session creation requires an explicit installed `packageId + packageVersionId + entryPointId`, never Package current/latest or display-name matching. Load reopens the exact installed PackageVersion and verifies version/hash against Session metadata.

Selected World snapshots always come from PackageVersion content, not WorldRepo.

`atri_world_state` is an N3 initialization/base namespace, **not the N5 Game Runtime integration**. It contains:

- `primaryWorldId`;
- `worlds[worldId] = { worldRevisionId, state }`;
- `initialState` for an EntryPoint with no World.

Each selected World's baseline initializes its state. `initialStateOverlay` shallowly replaces top-level fields of the primary World baseline (or the sole World when primary is omitted). Nonempty multi-World overlays require an explicit primary World. World-less starts retain the overlay in `initialState`. World identities/revision pins cannot change through `updateState`; only mutable state values may change.

Installing a newer PackageVersion cannot mutate an existing Session, its World revisions, or its Knowledge dependencies. Package GC continues to retain Session-referenced versions.

### Resolved KnowledgeBindingSet

`src/native/session-knowledge.js` implements N3 resolution and validation, not N6 compilation.

- Package defaults are Package bindings not scoped by any EntryPoint or World.
- The selected EntryPoint and its selected Worlds add their explicit bindings.
- Bindings scoped only to another EntryPoint/World are not silently activated.
- Library policy inputs are explicit `libraryBindingIds`; the caller selects policy applicability. N3 does not introduce a new global-policy service.
- Session-local bindings use `kind: session` and exact supplied Knowledge snapshots.
- Package bindings retain exact immutable Package content and cannot be changed by Session external-binding updates.
- Library and Session-local snapshots are copied into the immutable Session binding-set snapshot with exact revision identity and full entry closure. These are pinned Session snapshot dependencies, not dual-writable Library copies.
- Reload does not read Library current pointers, Library bindings, or the original author's Library. Explicit `updateKnowledge` creates a new SessionRevision.
- Missing exact revisions, incomplete entry sets, duplicate identities, wrong ownership, unbound snapshots and cyclic required-entry dependencies fail closed.
- `enabled`, `mode`, `target`, `visibility`, and `priority` are preserved as policy data. N3 performs no KnowledgePlan compilation, prompt selection, authority ranking, or World Info projection.

The existing N2 required-entry graph validator is reused rather than replaced.

### Branch, history and SavePoint semantics

`forkBranch` takes an exact source revision. It inherits that revision's Timeline selections, state and Knowledge while extending the current committed BranchGraph; it does not discard sibling branches or create new ancestor message IDs.

`switchBranch` publishes a new coherent commit based on that branch's exact HEAD. `restoreSavePoint` also publishes a new commit based on the saved closure; the SavePoint and historical revision remain immutable. Merely calling `load(..., { revisionId })` is read-only and does not switch Session HEAD.

A loaded historical snapshot includes the current Session descriptor plus the selected historical `revision`; consumers must use `revision.branchId` and the returned snapshot for historical views, not treat `session.activeBranchId` as the historical branch.

Session history follows explicit parent revision / branch HEAD / fork revision edges. GC retains reachable history and SavePoint roots, rejects deletion of referenced branches/revisions, and can remove failed-publication orphan revision manifests. Deliberate history pruning and full orphan fragment sweeping remain separate maintenance work; N3 does not silently prune history or pretend that revision-manifest GC sweeps every unreferenced state/message fragment.

`auto`, `quick`, and `manual` SavePoint kinds are supported as immutable local pointers. Scheduling, slot replacement, portable `.atriasave` export/import and dependency UX remain N7.

### Durability and integrity

`SessionRepo.commitSnapshot` writes immutable branches/messages/variants/state first, validates their closure, writes the revision manifest, then CAS-publishes the Session record last. Initial creation never exposes a Session record before its complete first revision.

In-process Session publication is serialized across repository/engine instances, supplementing SQL transactions and protecting FS's async read/write CAS window. The existing FS engine is still a single-server-process store: this is **not** a multi-process filesystem transaction/locking claim.

Failed writes may leave unreferenced immutable fragments but cannot expose a partially published Session. Orphan revision manifests are not loadable as committed history and cannot become SavePoint targets. Reload checks record integrity, state content hashes, exact identity ownership, graph ancestry/fork points, selected variants and Timeline HEAD consistency. Missing/corrupt resources fail closed; there is no reconstruction from runtime buffers or old stores.

Low-level N1 storage primitives remain available for their existing storage contract. Once a Session uses the N3 snapshot protocol, raw mutable HEAD/revision publication and rewriting published message/branch records are rejected. Production N4 commands must go through SessionCore, not assemble a second persistence path from the low-level N1 methods.

### N3 verification

- Local N3: **3 suites / 35 tests passed** on FS + SQLite.
- Local broader N0/N1/N2/native/adjacent regression run before the final three SavePoint-kind tests: **22 suites / 174 tests passed**, 2 suites / 12 tests skipped because MySQL/PostgreSQL services were deliberately disabled locally.
- Local full root ESLint: success.
- N3 source hard-cutover scan and `git diff --check`: success.
- SQLite binding was rebuilt locally with `npm rebuild better-sqlite3 --ignore-scripts=false`; no binary/dependency output is committed.
- CI: **Native Content Session Dev Checks #44**, run `35679448236`, **success**. N3: **3 suites / 49 tests passed** across FS / SQLite / MySQL / PostgreSQL. N1 storage/parity: **9 suites / 64 tests passed**. N0 contracts/adjacent/full root lint and N2 composition jobs also passed.
- CI reuses the existing N1 database job to run N3 across FS / SQLite / MySQL / PostgreSQL. No Android or Docker build/extra Docker validation was requested or run.

### Exit boundary / next phase

**Checkpoint A and the complete N3 exit are satisfied.** N3 local and four-engine CI validation passed on the exact recorded HEAD.

No N4 runtime projection, N5 runtime-state providers, N6 KnowledgeCompiler, N7 portable save system, N8 UI cutover, or N9 retirement has been implemented in this phase. No main merge, new branch, Legacy fallback, Native dual-read or Native dual-write was introduced.

The next phase is **N4 — SillyTavern Runtime Projection**, on the same working branch. N3 development has stopped after this validated handoff.


### Engineering guidance receipt

`tavern-card-builder` startup route used; TavernWeave library snapshot `2026-08-18`, standing `ST-A0` read for scope/red lines/acceptance. The existing Master Plan and current Native source are the implementation authority. No design catalog candidate, card-format adapter or version-sensitive host API was adopted in N3. Host API/projection acceptance remains N4.


## N4 in-progress checkpoint — 2026-09-22

**Status: implementation checkpoint only; N4 exit NOT satisfied.** The user requested an immediate push and handoff because their usage quota was nearly exhausted. Stop at this checkpoint; the next conversation must continue N4, not start N5.

- Working branch: `refactor/atria-native-content-session-architecture`
- Pushed checkpoint HEAD: `f3ac20f80f4691eee1d3c7ccab555a39e4322d3b`
- Last completely validated phase: N3 at `c42ee3e98a27fbea97ded0917de081bcc8893680`
- main remains untouched; no new branch or main merge.
- CI: push triggers `Native Content Session Dev Checks`; current run/result not yet verified. Do not carry N3 #44 success forward as N4 evidence.

### Implemented at the checkpoint

- `SessionCore.applyTimelineCommands`: explicit append/revise/select/remove/removeVariant intents in one immutable revision and HEAD-CAS publication; reuses `_publish`/SessionRepo, no second persistence engine.
- `forkBranch` optionally accepts an exact message/variant within the selected revision. Fork validation checks the referenced immutable Timeline snapshot. Earlier full-revision forks remain covered by N3 regressions.
- `public/scripts/native/session-projection.js`: Package Actor profile and selected Session revision -> transient character/chat/swipe ABI, stable opaque message/variant mappings, changes to a known projection -> explicit commands. Not a Session importer or authoritative whole-chat save.
- `public/scripts/native/session-runtime.js`: explicit open/reload/close/fork/switch seam, serialized Timeline writes, CAS failure latch, read-only historical projection, native upload transport.
- `src/endpoints/native-session.js`: authenticated server-owned handle, create/load/allowlisted command/upload/read routes. Runtime writes require expectedRevisionId. No arbitrary repository method dispatch.
- `public/script.js`: exported `openNativeSession` seam and Native interception of append/patch/save/reload; projected characters occupy a transient array slot; DOM host itself is not replaced. Native regenerate is routed toward the existing swipe generator; browser behavior still needs proof.
- bookmarks branch routing, Package Regex provider contribution, Native pinned Knowledge candidates entering existing World Info selection without loading legacy books.
- `populateFileAttachment` routes uploads to AssetStore in Native mode; logical assetId is retained in Timeline variant metadata, download URL is derived. AssetRef deletion retains immutable Timeline variant references.
- Native character-state calls return `native_state_integration_pending`; chat state resolves no legacy target. Full state backend integration remains N5. Compatibility metadata is currently transient rather than fully persisted.
- N4 unit/HTTP tests added to the existing four-engine CI job; no Android/Docker build or extra Docker validation added.

### Executed verification

- `npm run lint`: **passed**, full root source/frontend lint.
- `npm run test:unit --prefix tests -- --runInBand native atria-shell/native-play-host.test.js`: **17 suites / 139 tests passed**.
- This Jest pattern also selected `game-runtime/ui-native-components.test.js`; this is unit/DOM coverage, NOT a live R7/browser smoke.
- Local test environment explicitly disabled MySQL/PostgreSQL with `ATRIA_DISABLE_MYSQL_TESTS=1` and `ATRIA_DISABLE_POSTGRES_TESTS=1`. Local parameterized Native tests exercised FS and SQLite only. Four-engine N4 evidence remains CI-pending.
- Earlier focused checks: N3 + projection **4 suites / 47 tests**; Native runtime HTTP **1 suite / 4 tests**, passed.
- An initial test attempt used the wrong database-disable variable names and failed with local DB connection refusals. It was rerun successfully with the correct flags above; no DB service or Docker was started.
- `git diff --check`: passed before commit.
- No frontend build, full repository Node regression, live browser, real provider, mobile, Android or Docker validation was executed for N4.

### Required continuation — do not report N4 done

1. Fetch and read the live remote work branch and docs again; do not reset to this SHA if another session advanced it.
2. Inspect the whole checkpoint diff against N3, especially runtime write timing, identity binding across streaming/swipe/edit, early-save callbacks, switching/closing during queued operations, failure/reload behavior and remaining direct legacy endpoint calls. Unit pass is not sufficient evidence for these seams.
3. Add isolated real-host browser coverage using the actual Atria server/SPA and existing mock-LLM helpers. Prefer a fresh test-owned data root; do not copy private developer data or use their real configured provider. Existing `_lib/server.js` supports `useExistingDataRoot`; its default clone path uses Unix `cp`, so Windows needs the explicit fresh-root route. No live host was started here.
4. Verify Send, Stop, Continue, user/assistant Edit, Delete (message and swipe), Swipe, Regenerate, Branch, historical views, reload, exact dependencies, prompt assembly, Regex, World Info compatibility and file/media attachments. Capture Native writes and assert no `/api/chats/*`, Character/World Info persistence fallback or duplicate writes for Native operations.
5. Specifically prove the Native regenerate-to-swipe mapping uses the real generation lifecycle correctly; do not infer acceptance from pure adapter tests. Check native draft identity survives the runtime's message/swipe object updates.
6. Preserve R7 original node identities and uniqueness for `#sheld`, `#chat`, `#form_sheld`, `#send_form`, `#send_textarea`; existing unit tests do not establish actual browser lifecycle behavior.
7. N4 Knowledge projection is intentionally NOT N6: target/visibility-scoped and override bindings are skipped fail-closed; full authority/visibility/KnowledgePlan diagnostics remain N6. Review compatibility field mapping with real selector fixtures before claiming World Info compatibility.
8. Full N5 state integration, N7 saves, N8 UI cutover and N9 retirement remain unimplemented. Do not promote this development seam to production UI yet. Verify residual legacy paths rather than assuming this checkpoint exhaustively fences every extension route.
9. Read/fix CI at the exact work-branch HEAD, run broader relevant tests and frontend build, then perform the N4 real-runtime acceptance matrix. Obey the Master Plan long-CI/external-input stop rules.
10. Only after N4 completion and verification update the formal plan/handoffs and produce an N5 prompt. The present handoff is an N4 continuation prompt.

### Guidance receipt

`tavern-card-builder` and focused API/runtime skills read; library route `tavern-card-builder`, snapshot `2026-08-18`, ST-A0 opening gates used. Current repository source, not recalled upstream signatures, supplied API provenance. No design catalog candidate was adopted. Real-host execution remains explicitly unverified.
