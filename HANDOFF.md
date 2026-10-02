# HANDOFF

## Task

- Task ID: `refactor/original-occult-western-fantasy-long-lived-world`
- Primary Workspace: Package
- Current branch/workspace: `refactor/original-occult-western-fantasy-long-lived-world`
- Current HEAD: `79447c0b8aca028c6929ff8f9842f8835676191f`
- Current stage: **Phase 1 — Long-Horizon Runtime Foundation**
- Plan entrypoint: `plans/package/original-occult-western-fantasy-game-long-lived-world/index.md`
- Stage-required Plan modules:
  - `plans/package/original-occult-western-fantasy-game-long-lived-world/implementation-staging.md`
  - `plans/package/original-occult-western-fantasy-game-long-lived-world/time-model.md`
  - `plans/package/original-occult-western-fantasy-game-long-lived-world/verification.md`
  - `plans/package/original-occult-western-fantasy-game-long-lived-world/decisions.md`
- Record: `records/package/original-occult-western-fantasy-game-long-lived-world.md`
- Design-doc checkpoint before this HANDOFF: `docs@2cf52f7585d42732f7c26bbd6e830b8e31b9667f`
- Target release: `2.0.0`

## Completed

- v1.0 bounded-campaign audit completed.
- Task branch created from `package@79447c0b8aca028c6929ff8f9842f8835676191f`.
- Long-Lived World Plan Bundle discussed over multiple rounds and frozen as **Approved Implementation Plan v1.0**.
- Eight implementation phases frozen.
- Final hard gate frozen at **10,000 authoritative turns + at least 200 in-world years**.
- `releases/1.0.0.atria` must remain unchanged.
- v1 save compatibility is explicitly not required.
- No game implementation changes have been made yet.

## Pending

Current task is **only Phase 1**.

Implement the long-horizon runtime foundation:

- remove the global Day 30 authority ceiling;
- make Day 31+ and year rollover valid;
- establish open-ended authoritative chronology;
- establish stable persistent identifiers and base provenance/identity primitives;
- introduce the long-horizon time-advance/resolver skeleton;
- accept multi-year advancement at the runtime/schema level without implementing later lifecycle/macros;
- establish long-term stance storage/contracts;
- update Save/Restore for the new temporal foundation;
- preserve the old bounded campaign as a regression scenario/fixture where practical.

Do **not** implement Phase 2+ systems.

## Key decisions

- one protagonist remains player-controlled for the entire save;
- ordinary death is non-terminal in the final architecture;
- the world is ultimately open-ended and may span centuries;
- 1.0 is historical truth, not retroactively incomplete;
- 2.0 is a new architecture and may break old saves;
- all phases stay on the same task branch;
- each formal phase ends with validation + commit/push + Record/HANDOFF update + next-phase prompt + stop.

## Validation / CI

Design phase only:

- no Package tests/build/runtime/UI validation were executed;
- task implementation HEAD is still the exact v1.0 Package release commit;
- Phase 1 validation is pending.

Phase 1 exit evidence must include:

- Day 31+ is valid;
- year rollover is correct;
- long-span time advancement no longer depends on the old Day 30 ceiling;
- Save/Restore preserves new time/identity state;
- relevant v1 opening/Eastbank regression fixtures still run where intentionally preserved.

Do not falsely claim Gate A (1k/10y) merely by pulling Phase 2 compaction work into Phase 1.

## Next target

Complete **Phase 1 — Long-Horizon Runtime Foundation** only.

After implementation:

1. run/fix relevant tests;
2. commit and push the task branch;
3. update `records/package/original-occult-western-fantasy-game-long-lived-world.md`;
4. refresh this `HANDOFF.md`;
5. provide the Phase 2 bootstrap prompt;
6. stop.

## Read first

In order:

1. current local/package workspace instructions (`AGENTS.md` if present);
2. `docs:HANDOFF.md`;
3. `docs:plans/package/original-occult-western-fantasy-game-long-lived-world/index.md`;
4. `docs:plans/package/original-occult-western-fantasy-game-long-lived-world/implementation-staging.md`;
5. `docs:plans/package/original-occult-western-fantasy-game-long-lived-world/time-model.md`;
6. `docs:plans/package/original-occult-western-fantasy-game-long-lived-world/verification.md`;
7. `docs:plans/package/original-occult-western-fantasy-game-long-lived-world/decisions.md`;
8. `docs:records/package/original-occult-western-fantasy-game-long-lived-world.md`;
9. only then inspect directly relevant current Package runtime/schema/tests.

## Do not repeat

- do not redo the v1 audit;
- do not reopen the approved product design without a concrete implementation conflict;
- do not create another implementation branch;
- do not merge `main` into the Package task branch;
- do not overwrite/delete `releases/1.0.0.atria`;
- do not add legacy v1 save migration;
- do not implement family lifecycle, history compaction, renewable content, delegation, multi-region, Era/macro history or final UX in Phase 1;
- do not start Phase 2 after Phase 1 is complete.

## New-chat bootstrap prompt

Continue `ZZZdragondYNGPHX/Atria` task `refactor/original-occult-western-fantasy-long-lived-world`.

Primary Workspace: Package.  
Current branch/HEAD: `refactor/original-occult-western-fantasy-long-lived-world@79447c0b8aca028c6929ff8f9842f8835676191f`.

The Long-Lived World plan is frozen as Approved Implementation Plan v1.0. Current task is **Phase 1 — Long-Horizon Runtime Foundation only**.

Before coding, verify real remote refs, then read:
- `docs:HANDOFF.md`
- `docs:plans/package/original-occult-western-fantasy-game-long-lived-world/index.md`
- `docs:plans/package/original-occult-western-fantasy-game-long-lived-world/implementation-staging.md`
- `docs:plans/package/original-occult-western-fantasy-game-long-lived-world/time-model.md`
- `docs:plans/package/original-occult-western-fantasy-game-long-lived-world/verification.md`
- `docs:plans/package/original-occult-western-fantasy-game-long-lived-world/decisions.md`
- `docs:records/package/original-occult-western-fantasy-game-long-lived-world.md`

Then inspect only directly relevant Package runtime/schema/tests.

Phase 1 goals: remove the global Day 30 authority ceiling; make Day 31+ and year rollover valid; establish open-ended authoritative chronology, stable IDs/provenance/identity primitives, long-horizon time-advance/resolver skeleton, multi-year advance contract, long-term stance storage, and Save/Restore support. Preserve the old v1 bounded campaign as regression fixtures where practical.

Do not implement Phase 2+. Do not add v1 save migration. Do not touch `releases/1.0.0.atria`. Do not merge `main` into Package.

Complete Phase 1 end-to-end: implement, run/fix relevant validation, commit/push, update the same Record and HANDOFF, generate the Phase 2 bootstrap prompt, then stop.
