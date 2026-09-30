# Original Occult Western Fantasy Game — Implementation Staging

## Responsibility

Owns Round 10: Codex-ready implementation phases, dependency order, branch / workspace routing, per-phase reading map, validation gates, integration criteria and release handoff.

## Dependencies

- `index.md`
- `decisions.md`
- `technical-design.md`
- approved domain modules only when a phase implements their authority.

> **Current discussion:** Round 10 is open. Freeze implementation order without reopening approved game design.

---

### 6.56 Round 10 question — implementation staging

Round 10 must determine:

- the exact Core prerequisite phase and its merge gate;
- when the Package implementation workspace may begin;
- the Package branch / folder strategy;
- which phases build runtime foundation, content foundations, simulation, Signature Cases and integration;
- which phases may run in parallel and which must remain sequential;
- the minimal module reading map per implementation phase;
- phase exit criteria and targeted tests;
- when frontend-specialized work is handed off;
- when docs/records are updated during multi-phase work;
- when CI is considered a blocking verification stage;
- final integration / release criteria;
- what work is explicitly deferred from v1.

Round 10 must not add new gameplay systems unless implementation reveals a material contradiction requiring the relevant design authority to be reopened.
