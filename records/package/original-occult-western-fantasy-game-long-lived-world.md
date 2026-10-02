# Original Occult Western Fantasy — Long-Lived World — Record

- Task ID: `refactor/original-occult-western-fantasy-long-lived-world`
- Primary Workspace: Package
- Status: Active
- Plan: `plans/package/original-occult-western-fantasy-game-long-lived-world/index.md`

## Summary

This task expands the released bounded v1.0 occult-western campaign into a long-lived world architecture capable of supporting thousands of authoritative turns, centuries of in-world history, generational NPC change, evolving institutions/cities/eras, multi-region play and renewable history-aware content.

The v1.0 campaign remains historically complete for its original P1–P9 scope. This task is a new v2 rearchitecture.

## Design Phase — Plan freeze

- Start Package HEAD: `79447c0b8aca028c6929ff8f9842f8835676191f`
- End/Tested Package HEAD: `79447c0b8aca028c6929ff8f9842f8835676191f`
- Status: Complete
- Validation/CI: design/documentation only; no Package implementation or runtime test was performed during discussion

### Completed

- audited the released v1.0 bounded campaign and identified the real 30-day authority ceiling;
- created task branch `refactor/original-occult-western-fantasy-long-lived-world` from `package@79447c0b8aca028c6929ff8f9842f8835676191f`;
- created a separate long-lived-world Plan Bundle without rewriting v1 historical truth;
- froze one continuous supernatural-long-lived protagonist;
- froze non-terminal ordinary death/reconstruction;
- froze tiered NPC lifecycle, multi-generation family history and institutional succession;
- froze open-ended hierarchical time and multi-decade event-driven fast-forward;
- froze renewable grammar/world-state content generation;
- froze Hot/Warm/Cold/Archive history, Canonical Fact Ledger, artifacts and century retrieval;
- froze horizontal progression, persistent assets, career/public identity and optional city-scale power;
- froze Era evolution into modern/later alternate-history technology and occult modernization;
- froze Active Hub / Warm Region / Cold World multi-region scope;
- froze macro economy/governance/war/migration/disaster/social/occult history;
- froze delegation, organizational hierarchy and institutional autonomy;
- froze final **10,000 authoritative turns / 200 in-world years** hard completion gate;
- froze 8-phase implementation staging;
- froze `2.0.0` as target release;
- froze retention of `releases/1.0.0.atria` unchanged;
- froze that old v1 save compatibility is not required.

### Key decisions

See `plans/package/original-occult-western-fantasy-game-long-lived-world/decisions.md`.

### Known limitations

- no game/runtime implementation has started;
- Phase 1 runtime schemas and exact field names remain implementation details;
- no Phase 1 tests have been run yet;
- no claim has been made that current v1.0 supports long-lived play.

### Next checkpoint

Complete **Phase 1 — Long-Horizon Runtime Foundation** on the existing task branch, validate its exit criteria, commit/push, then update this Record and `HANDOFF.md` and stop.

## Phase 1 — Long-Horizon Runtime Foundation

- Start HEAD: `79447c0b8aca028c6929ff8f9842f8835676191f`
- End/Tested HEAD: pending
- Status: Not started
- Validation/CI: pending

### Completed

None yet.

### Key decisions

Use only the approved Phase 1 scope in `implementation-staging.md`.

### Known limitations

Do not pull Phase 2+ systems forward merely to make later gates pass.

### Next checkpoint

Remove the global Day 30 authority ceiling and establish the long-horizon time/identity/provenance foundation while preserving v1 campaign behavior as regression fixtures where practical.

## Final state

Pending.
