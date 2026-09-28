# Native Heavy-Frontend Reference Package — Phase 6 Manual Playtest Record

Updated: 2026-09-28.

## Scope

This record closes the frozen Phase 6 manual review / Playtest requirement for the Native Heavy-Frontend Reference Package.

- Repository: `ZZZdragondYNGPHX/Atria`
- Branch: `package/native-heavy-frontend-reference`
- Tested HEAD: `699389798e94a85587c791b493a58a078a52064c`
- Package version: `0.6.0-phase6`
- Final targeted run: `36395818903` — success
- Provider calls: `0`

## Review method

The Playtest is a deterministic, non-provider manual review of the authored Native experience. Evidence was taken from:

- the real Studio Project Source;
- desktop / compact Preview fixtures;
- the compact Phone unread Preview fixture;
- the four production recorded/mock Scenarios;
- Experience Health output;
- Studio validation / preflight / Preview / Build;
- Project Agent `prepare_review` and explicit Review gate;
- manual Phase 5 → Phase 6 diff inspection.

No Android device, paid provider, Docker environment, or real UI screenshot was required for this frozen Phase 6 scope.

## Manual checklist

### Story-first

**PASS**

- Story remains the default Hybrid surface.
- The Host Native Conversation and Composer remain the only main prose/input path.
- Current Event Header / Context presentation remains read-only.
- Message Projection is presentation only.
- Canonical prose remains Timeline-owned.

### Church

**PASS**

- Overview / Facilities / Decrees / Projects / Opportunities remain present.
- Settled money/followers/reputation/level stay World-owned.
- Projects / Opportunities / day operations remain Session Application-owned.
- Deterministic Church mutations still use typed Commands.

### Schedule

**PASS**

- Schedule records remain Session Application state.
- Visible time comes from the existing Lifecycle `game-clock` Temporal Projection.
- No Package time cache or scheduler was added.

### People

**PASS**

- Identity / Position, settled relationship, current Event, Schedule and recent canonical Timeline information remain projections of their owning authorities.
- No person-specific duplicate database exists.

### Phone

**PASS**

- SMS / Social / Mail remain three independent Session Application Domains.
- Compact unread fixture exposes all three channels without merging their schemas.
- Player input uses `application.command`.
- Phone remains a supporting application and does not become a second Conversation.

### Branch / restore

**PASS**

The `branch-restore` Scenario manually reviewed and automatically executed the following sequence:

1. open the day and take a checkpoint;
2. create Branch A Schedule, Church Project/Operations, SMS, Social, Mail and Event state;
3. advance the existing Game Clock and settle World facts;
4. commit one Branch A canonical Timeline Turn;
5. restore the checkpoint;
6. verify World settlement, Clock, Schedule, Project, SMS, Social, Mail, Event and Timeline all return to the checkpoint state;
7. create Branch B Schedule/SMS/Event state;
8. advance only Branch B time;
9. commit a new Branch B canonical Timeline Turn;
10. verify no Branch A communication/project/event/timeline ghost survives.

This demonstrates the Package relies on Native revision/save restoration rather than per-app repair logic.

### Experience Health

**PASS**

- The exact built Package can create a Session and reach `experience.ready`.
- Health reports `healthy`.
- Migration remains `exact-version-pinned` and non-automatic.
- Schedule and communication Domains are visible to Health.
- No error-severity diagnostic is produced.

### Studio authoring / review / build

**PASS**

- Project validation passes.
- Studio preflight passes.
- Native Preview is non-persistent.
- `prepare_review` performs validation, Preview and `branch-restore` simulation.
- Review gate is explicit and required.
- The reviewed test proposal is source-only and has no Runtime Authority effect.
- Explicit Commit succeeds.
- Build succeeds from the resulting reviewed revision.

## Human review of Phase 6 diff

**PASS**

Compared with Phase 5 final Package HEAD `b09addf9a4c6eadc47b748a53433475242bbc286`, Phase 6 touches only:

- Package Project version metadata;
- Package Scenarios;
- Package Preview fixture;
- Package validators;
- the dedicated Package targeted workflow.

No Atria Core source file is changed. No new platform gap is introduced.

## Automated evidence accompanying the manual review

Final run `36395818903`:

- Phase 1–6 validators: PASS;
- four core Scenarios: PASS;
- Experience Health: PASS;
- Preview coverage: PASS;
- Studio preflight: PASS;
- `prepare_review` / Review gate / Commit / Build: PASS;
- adjacent regression: 12 / 12 suites, 488 / 488 tests PASS;
- `providerCalls = 0`.

## Limitations

This Playtest does not claim live-model prose quality, character naturalness, or long-horizon model consistency. The Phase 6 regression is intentionally provider-free. A future release process may add a separate live-model content-quality session if explicitly requested.

## Result

**Phase 6 manual Playtest: PASS for the frozen deterministic Native Package scope.**

No Package release or new phase is started by this record.
