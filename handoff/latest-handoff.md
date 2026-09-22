# Active checkpoint: N4 validated — N5 next

## Status

**N4 — Native Runtime Projection & Write Barrier is complete and validated. Do not redo N4.**

- Working branch: `refactor/atria-native-content-session-architecture`
- N4 validated HEAD: `ec95a260f4a26a4c23091227f77865dba1ae2273`
- Validation: **Native Content Session Dev Checks #87**
- Run: `35693455407`
- Result: **success**
- N0–N4 are frozen.
- main remains untouched.
- No new task branch; continue on the same long-lived refactor branch.
- Formal plan: `refactor/atria-native-content-session-architecture.md`
- Detailed handoff: `handoff/atria-native-content-session-architecture.md`
- N5 startup prompt: `handoff/atria-native-session-n5-prompt.md`

## N4 final boundary

N4 established:

- immutable committed Native Timeline;
- append-only Native product/runtime Timeline writes;
- committed Write Barrier with fail-closed recovery;
- Native-only persistence with no JSONL/`/api/chats/*` fallback;
- Send post-user Revision boundary;
- Continue as a new continuation TimelineEntry;
- Retry Reply as post-user Fork + new Assistant entry;
- Generation Draft / Stop lifecycle, including empty and no-placeholder discard;
- committed Edit/Delete/manual Swipe/Swipe Delete/Variant switch rejection;
- Package Regex hot-path integration;
- pinned Native Knowledge compatibility projection;
- AssetStore attachments;
- Branch/switch/history/reload;
- preserved R7 Play host identity.

Exact N4 validation passed N0/N1/N2/N3/N4 focused checks, full root lint, real-host Chromium acceptance, complete **748-suite / 8705-test** Node regression, and frontend build.

## Next action

Start **N5 — Native Runtime State & Revision Lifecycle** on the same branch.

N5 moves Atria-owned durable runtime state to SessionState/SessionRevision:

- Game World + Event Journal;
- Memory canonical/durable state;
- Orchestrator;
- Search;
- Variables/op-log replacement where Native applies;
- package-owned durable state.

Use stable `messageId`, `revisionId`, and `branchId` lifecycle anchors. Native authority should transition from floor/swipe structural events toward `TIMELINE_APPENDED`, `REVISION_COMMITTED`, `REVISION_RESTORED`, `BRANCH_ACTIVATED`, `SESSION_LOADED`, and `DRAFT_ABORTED`.

Do not start N6/N7/N8/N9/N10 early. Do not merge main. Ordinary failures should be fixed autonomously; stop only for clearly long CI, required Android/Termux logs, required real UI screenshots, or user-owned permissions/Secrets/auth.
