# Atria Native Content & Session Architecture Refactor — Timeline Immutability & Context

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

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
