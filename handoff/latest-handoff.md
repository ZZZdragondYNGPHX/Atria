# Latest handoff — Native Prompt Controls and Resource UX

Updated: 2026-09-25 (Asia/Shanghai).

## Current status / stop gate

Repository: ZZZdragondYNGPHX/Atria.
Implementation branch: feat/native-prompt-controls.
Remote code HEAD: 2958b9c2bacfebd876a69b12e2dcffb3a30d5779 (pushed).
Remote main remains d29c2b3170798b136eb41249eaad902a23aab5bd.
Formal plan: docs:feat/native-prompt-controls.md. That plan is authoritative.

Group 1 (NPC-001) is complete. STOP and wait for the user's “继续”.
On continuation, fetch first and use the latest remote feature HEAD. Do not create
another feature branch, reset prior commits or merge main early.

## Completed Group 1 — NPC-001

- Authored Prompt parameters support human labels/descriptions, boolean controls and
  distinct finite string/number options. Exclusive choices require a default or an
  explicit required selection. Existing typed binding/conditions remain authoritative.
- Play Prompt choices inspector and Runtime Diagnostics share the same controls.
  Existing Shell dock/sheet behavior is reused; desktop and narrow viewports verified.
- Overrides persist in the existing player Runtime Route promptParameters map across
  sessions/reloads. Saving choices does not create immutable Prompt revisions, write
  Package originals, or introduce localStorage/preset/session state authority.
- Defaults < resolved route overrides < explicit request parameters. Each fallback
  uses its own route. Invalid/stale values fail closed; controls offer explicit reset.
- Authenticated GET/PUT /api/native/generation/prompt-controls/:id reads exact inherited
  Library/Project/Package definitions and updates only the selected mutable route.
  Serialized compare-and-update rejects concurrent changes instead of overwriting them.
- snapshot.promptIr.compilation exposes effective parameters, selected stages and
  included/disabled/condition-false module decisions for preview and execution.
- Shared validation is now a pure dual-host module; frontend localization stays in its
  wrapper. The P0 guard also scans this shared boundary. P5/P6 stale textual assertions
  were updated to match existing Native Library/authoring ownership.

## Executed validation

- Related Jest regression: 12 suites, 158 tests passed.
- After additional finite-choice / Project / Package / inherited metadata coverage:
  5 focused suites, 91 tests passed. Final UI save redraw: 3 focused tests passed.
- Final real-host Playwright: 2/2 passed at 1440px and 390px. Actual user controls,
  reset/save, reload/reopen, Runtime preview, Play generation, persisted typed values
  and preview/execute consistency are covered with a local synthetic provider.
  Screenshots were inspected for both widths. Scratch data is not committed.
- Root npm run lint passed; touched test lint passed; final touched UI/shared lint
  passed; modified guard scripts passed node --check; git diff --check passed.
- npm run check:native-localization passed (zh-CN/zh-TW).
- npm run frontend:prebuild-cache passed (actual webpack compilation initially,
  subsequent run reused valid library cache; product JS is served as native modules).
- P0–P7 guards passed. The P8 aggregate also passed A0–A6, then stopped at the baseline
  A7 assertion requiring attachResource/forkResource/updateResource in
  public/scripts/native/studio-workspace.js. Those calls were already absent at
  d29c2b317. Do not claim the full P8 aggregate passed. Reconcile this broad baseline
  guard against current Studio implementation during Final Integration, retaining
  substantive authoring/ownership checks. Further aggregate gates may surface then.
- No GitHub CI wait, paid model calls, Android build/device checks or Docker checks.

## Remaining groups, in the user-approved order

1. NPC-001 — DONE, code/documentation pushed; awaiting user continuation.
2. NPC-003 + NPC-004 — Knowledge entry browsing plus per-entry enabled contract.
3. NPC-002 — true Prompt Program/Module deletion with dependency integrity.
4. NPC-006 — complete Regex Native cutover; retire preset/card ownership end-to-end.
5. NPC-005 — persistent learning center and guided lessons; audit/write curriculum
   before implementing, per formal plan.
6. Final Integration — reconcile remaining guards, verify full integrated result,
   update final documents, merge feature into main, verify/push main, confirm no
   omissions, delete remote/local feat/native-prompt-controls, finalize this handoff.
   Keep docs permanently.

Each group must complete implementation, targeted tests, automated UI/browser checks,
lint/build, code commit/push and plan/handoff updates, then report HEAD/results and
stop for “继续”. Do not restart the completed prior Native Product UX backlog.
Only ask the user for genuinely necessary real-device/visual judgment, permissions,
authentication or Secret dependencies. No such dependency exists for the next group.

## Authority reminders

Read local AGENTS.md and FORK_MAINTENANCE.md plus the formal plan before continuing.
Preserve Native exact revisions, immutable authoring, dependency closure and existing
storage/runtime authorities. Do not restore legacy presets, World Info storage, DOM
control, Tavern Helper, MVU or default legacy migration. The two NPC-006 sections in
the formal plan are historical confirmed requirements; the Complete Regex Native
cutover section and the user's latest instructions govern removal of old authority.

Environment: repository was absent from D:/Dev/Atria at takeover and was cloned from
the existing remote feature branch. An additional worktree checks out the existing
docs branch. No new task branch was created. Use repository history and remote HEADs
as authority, not machine paths. Test-only files, caches and screenshots stay untracked.
