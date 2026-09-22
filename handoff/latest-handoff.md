# Active checkpoint: N8 validated — N9 next

## Status

**N8 — Save System & `.atriasave` is complete and validated. Do not redo N0–N8.**

- Working branch: `refactor/atria-native-content-session-architecture`
- N8 validated HEAD: `f6f629800f8dae2da5c9870f6c0d6965920ea960`
- Workflow: **Native Content Session Dev Checks #136**
- Run: `35715208736`
- Result: **success**
- N0–N8 are frozen.
- `main` remains untouched.
- Continue on the same long-lived refactor branch; do not create a new branch.
- Formal plan: `refactor/atria-native-content-session-architecture.md`
- Detailed handoff: `handoff/atria-native-content-session-architecture.md`
- N9 startup prompt: `handoff/atria-native-session-n9-prompt.md`

## N8 final boundary

N8 established the Native Save authority:

- Auto / Quick / Manual SavePoints are immutable pointers to stable authoritative SessionRevisions.
- Historical Save continuation creates a derived Branch and does not overwrite the route that reached the former HEAD.
- `.atriasave` supports snapshot and full-session logical closures.
- Export/import is storage-engine-independent and does not copy FS/SQL physical layout.
- Exact Package ID/version/container-hash/EntryPoint dependencies are required; missing or mismatched dependencies fail closed.
- Session-local Knowledge is portable.
- Library-origin snapshots required by a Session import as Session-bound embedded Knowledge, not target-Library authority.
- Explicit `promoteEmbeddedKnowledge` is the future **Save to my Library** seam.
- Narrative Spine / Active Commitments / durable derived coverage/provenance round-trip as Session state.
- Memory / Orchestrator / World / Event Journal authoritative state round-trips.
- Session attachments required by the closure are exported/imported with integrity checks.
- rebuildable embeddings/rerank/search indexes, ContextPlan/token/render/recent/thumbnail/compiled caches are excluded from portable authority.
- default portable protection and optional password-protected scrypt + AES-256-GCM are authenticated; wrong password/tampering fail closed.
- import publishes immutable dependencies first and the Session commit marker last.
- Native import never falls back to Character, JSONL chat, or World Info storage authority.

## Checkpoint B validation

Exact HEAD `f6f629800f8dae2da5c9870f6c0d6965920ea960` passed:

- N0 Native Contracts: success
- N1 Storage + N3/N5 Core + N4 Projection: success
- N2 Package Project Composition: success
- N4 real-host Chromium Native Session acceptance: **4 passed**
- N5 Runtime State & Revision Lifecycle: success
- N6 Native Knowledge Runtime Integration: success
- N7 Native Context Architecture / Checkpoint C: success
- N8 Save System / Checkpoint B: **5 suites / 53 tests passed**
- N8 source lint: success
- full root lint: success
- complete Node regression: **753 suites / 8791 tests passed**
- frontend webpack build: success

The complete regression ran with MySQL/PostgreSQL services enabled, and N8 clean-store import parity uses the Native storage contract harnesses. Checkpoint B is satisfied across the applicable Native storage engines.

## Next action

Start **N9 — Product UI Cutover**.

Switch Library / Studio / Play management surfaces to Native Package / World / Knowledge / Session / Save / Timeline authorities while retaining the R7 Shell and route authority.

Do not start **N10 — Hard Cutover & Legacy Retirement** early and do not merge `main`.
