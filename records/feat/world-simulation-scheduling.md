# World Simulation Scheduling — Core Record

- Task ID: `feat/world-simulation-scheduling`
- Primary Workspace: `main`
- Consumer: Package P3 `package/original-occult-western-fantasy-game`
- Plan: `plans/feat/world-simulation-scheduling.md`
- Start main: `cd6bff19d54f651a4bffd8981f62ec77c0f84acb`
- Implementation / tested / pushed: `648b00aa4a09dbda274fa18ee1876756ec284f45`
- PR: https://github.com/ZZZdragondYNGPHX/Atria/pull/99 (merged)
- Integrated main: `052c466e3c9e4b07912da0cb602b2933f4821187`

## Scope and decisions

The Package's G2 diagnosis demonstrated a missing orchestration contract, not a defect in P0 transaction atomicity or Fortune use. The user directed autonomous resolution rather than stopping at the gap. The correction was implemented on an independent short-lived product branch, with no copied product code in Package and no raised hard bounds. Package implementation history remains in its own single Record; this record owns only the Core correction.

- Added required `world-simulation@1` / `simulationRuntime`, alongside required `authority-transaction@1`. Optional metadata cannot enable it. Existing Packages without this declaration retain their prior paths.
- Reused the strict Formula AST/type inference/template/grant implementation through a shared module. Static scoped records/fields, scalar computed values, exact destination schemas and UTF-8/work accounting remain enforced.
- A bounded pure driver processes deterministic/conditional due jobs in due-time/priority/identifier order. It uses the existing Lifecycle clock/domain state and existing World Journal, not a scheduler state store. Intermediate due-time visits belong to one declared clock-advance operation; job Transactions cannot recursively advance clocks or dispatch Workflows.
- Added explicit non-player Transaction origin. Static simulation jobs own selection/input; these Transactions are absent from player resolver/frontend catalogs and rejected by the player preparation entrypoint. No fabricated user message or player anchor.
- After deterministic catch-up, admission permits at most one background decision per batch. Hot precedes Warm; Cold is deterministic by default. Job input is an explicit institution-scoped typed payload, not broad World/Timeline context.
- Reused existing Lifecycle outbox/cursors and Task sink. Failure creates no speculative fallback Event.
- Successful foreground Turn finalization schedules admitted work through the existing Host/Task scheduler without awaiting background completion. The callback is transient; the outbox is durable. There is no saved Promise or uncommitted player-selection journal.
- The first profile deliberately limits background admission to one, so same-tick model completion races do not exist. Larger strategic batches are not silently promised.
- Simulation jobs own canonical deadlines in opted-in Packages; competing legacy canonical schedules/interactions/waits are rejected rather than partially ordered. Maximum profile bounds: 16 jobs/steps, one deliberation, 10080 requested ticks; existing 16 reads / 24 App Commands / 32 effects and all expanded limits may reject earlier.

## Limits

No hosted model, manual browser/device, OS-kill or cross-process uncommitted-selection recovery is claimed. Pending task delivery may retry only at an explicit later opportunity; it is not an automatic provider retry cascade. A new authored occurrence is required for reconsideration after stale cancellation; committed results are not superseded.

## Integrated closure (2026-09-30)

 Authority main run: https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36723857416 ; Native run: https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36723857617 . Both Core feature branch refs are deleted; the pre-existing product worktree is retained detached at integrated main. No user worktree/release was deleted.
