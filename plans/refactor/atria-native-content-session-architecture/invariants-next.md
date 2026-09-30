# Atria Native Content & Session Architecture Refactor — Architectural Invariants & Historical Next Action

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

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
