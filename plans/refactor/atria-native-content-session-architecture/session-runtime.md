# Atria Native Content & Session Architecture Refactor — Session Runtime

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

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
