# Atria Native Content & Session Architecture Refactor — Product UX & Sync

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

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
