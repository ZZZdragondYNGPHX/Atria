# Atria Native Content & Session Architecture Refactor — World & Knowledge

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

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
