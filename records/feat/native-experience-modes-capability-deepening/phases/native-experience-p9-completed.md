# Native Experience P9 — completion and final integration

Updated: 2026-09-27. P9 only; P0–P8 history preserved.

## Repository and lifecycle

- Incoming P8: `767d23a27019e0562c09548ad6ec50b39c8c4773`.
- Original main: `4dab353ac639d42eae885c79e18245267abd6820`.
- Existing work branch: `feat/native-experience-modes-capability-deepening`.
- Fetched before implementation; docs fast-forwarded from `252f5ca8b` through `61b862525` without dropping updates.
- Formal plan §0 records the concrete P9 migration, preview, simulation and Host binding boundaries. No P10 is started.

## Implemented

1. **One Studio editor, explicit versions.** Existing v1 remains supported. v2 view roots participate in the same tree selection, manipulation, component insertion and property/binding editing. Document sections edit localState, preferences, selectors, actions, Opening, message blocks and conversation declarations. Invalid drafts remain editable; the production compiler rejects invalid schemas and more than one authority write. Changes use existing ChangeSet Review/Commit. Source editing cannot silently switch componentModelVersion.
2. **Exact isolated preview.** Owner-authenticated preview UI is read from the actual built preview archive. Subsequent Source edits cannot mutate that preview. v1/v2 share existing production compilers/renderers. Local interactions work in Component/Hybrid/Full. Mounts dispose on navigation/replacement; late responses cannot overwrite a new view. Author Native conversation/composer slots are isolated placeholders, and Scene explicitly requires an active scoped Session. No private play DOM is reparented into author or Shared mounts.
3. **Scenario/Test Bench.** `scenarios/main.json` can be loaded/staged through Studio. A closed v1 fixture runs up to 64 steps using a temporary FS Engine and real PackageInstaller, SessionCore, SavePoint and SharedAuthority. Principal overrides are restricted to bounded local Shared fixture identities. Expected errors can be asserted; failed steps halt. Results report per-step diagnostics, zero provider calls and no persisted user state.
4. **Recorded Task evidence.** Recorded/mock result payloads use actual Task result application. `$pending` resolves a unique pending task; Shared `$current` resolves the current Turn. P5 Activity settlement is committed before Narrator and the recorded narrative cannot mutate facts. Scenario is not a replacement model scheduler, provider emulator, deterministic dice seed override or live-user migration tool.
5. **Health and capability UI.** Play inspector exposes health, supported/required capability versions, Host presentation readiness/degradation, prepared transfers and lifecycle/Task/Shared diagnostics. Task binding preflight uses the existing lifecycle prepare endpoint and saved bindings. Missing exact dependencies return a blocked read-only diagnosis when the owned snapshot is readable. Existing Runtime Diagnostics remains the detailed runtime authority.
6. **Reviewed typed repair.** Preview produces exact before/after data and anchored token. Confirmation re-reads Session revision/branch/package and independent Player/Realm revisions, then delegates to retention compaction or existing transfer resume/cancel. Cancellation is rejected after Session transfer publication. No external balance, reservation, lineage, ownership or receipt is patched. No write is performed merely by opening Health.
7. **Explicit migration.** Static v1 UI can migrate losslessly to a v2 document through one metadata+source ChangeSet. Dynamic bindings/actions/visibility/responsive/input and unsupported appearance conversion fail with author review required. Existing Session and independent ledgers retain exact schemas; no generic automatic schema adapter or rewind is claimed.
8. **Shared product controls.** Host can enable sharing, connect with authenticated account/session, grant/revoke a fixed declared seat, refresh presence/membership, open/commit/cancel Turns. Participants enter args from the declared Command schema; Host-owned RNG arguments are omitted. Buttons reflect collecting/stale/submitted/all-required states. Explicit connection/refresh sends heartbeat; there is no new polling scheduler.
9. **P8 integration fixes.** Default Shared invocation IDs now have a legal alphabetic prefix even when UUID starts with a digit. A regression covers this production HTTP failure. Explicit isolated native slots prevent fallback to a private local conversation/composer. No P8 authorization rule is weakened.
10. **Product finish.** Existing Play tokens/buttons and Studio layout are reused. 320px document tabs wrap instead of pushing the editor offscreen. New static copy has Simplified and Traditional Chinese translations.

## Practical limits

No Android, Docker, paid/live inference, multi-device network soak, physical speech/media/gamepad testing or CI polling was run. MySQL/PostgreSQL tests are disabled; relevant FS/SQLite authority tests ran. Browser evidence uses Edge on Windows. Required/optional advanced Host negotiation is inspected, not proof of every physical input/output device. Author Scene uses a scoped-session-required placeholder. Migration deliberately stops where no versioned semantic adapter exists. HTTP Shared reconnect is explicit refresh, not a public discovery/lobby service.

## Final pre-merge results

- P0–P8 authority, runtime, authoring and Shell suites are included.
- Final Shared button-state closure: `... test:unit -- --runInBand studio-experience-p9 shared-host-p8 ...` — **2 suites / 19 tests passed**, not additional unique tests.
- Studio v2 document/edit/Review Commit/exact preview/Scenario at 1440px and 320px. After the button-state change the Play Health case passed again, **1/1**. Servers use disposable seeded roots and are torn down with `removeData:true`.
- Browser server compilation/startup succeeded; no separate build script is claimed.

 Do not implement further features.

## User-directed merge hold

After P9 code/docs were pushed, the user explicitly paused merge and branch deletion to inspect and discuss AI authoring, Skill and Plugin changes. Main remains unchanged. Integration and branch cleanup are not complete and must not proceed under the earlier authorization. The follow-up requires discussion, then a separate approved plan before implementation.
