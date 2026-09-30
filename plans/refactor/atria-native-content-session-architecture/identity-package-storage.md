# Atria Native Content & Session Architecture Refactor — Identity / Package / Storage

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## Status

- **Decision state:** product / data / storage / runtime / UX direction frozen
- **Implementation state:** **N0–N8 are complete and validated; N9 — Product UI Cutover is next.** N8 validated HEAD: `f6f629800f8dae2da5c9870f6c0d6965920ea960`; workflow **Native Content Session Dev Checks #136**, run `35715208736`, success.
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
