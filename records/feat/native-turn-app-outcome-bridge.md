# Platform Gap G1 — Turn → Session Application Atomic Outcome

Date: 2026-09-28. Task branch: `feat/native-turn-app-outcome-bridge`.
Baseline: `93991c7ccea30ce7499935bbb91592ae137086dd` (fresh origin/main).
Implementation and verified local/remote main HEAD: `20d6b11b8e3d15a9089ffeb4da4e90d0c894b457`. Main fast-forwarded and pushed; remote HEAD equality and feature ancestry confirmed. Local and remote task branches deleted after integration verification.

## Result and scope

Narrative outcomes can apply one declared World Command, one declared Session Application Command, or both. Private preparation uses the existing World engine and `prepareLifecycle`; `SessionCore.finalizeTurn` publishes Narrative, birth Variant, World/App state and the Turn receipt through its existing single Revision CAS. No new authority, transaction, scheduler, state namespace or receipt format.

G2 background Task auto-application and D1 presentation profiles remain outside this task. The reference Package branch is unchanged and should synchronize main after both G1 and G2 land.

## Contract

Extend the existing pinned declarative logic `interpretations` entry with optional `appCommand`:

```json
{
  "eventType": "event_advanced",
  "command": "settle_event",
  "args": {},
  "appCommand": {
    "domainId": "events",
    "commandId": "advance",
    "recordId": "current",
    "args": { "severity": { "formula": "args.severity" } }
  }
}
```

`command`/top-level `args` may be omitted for App-only mapping. Existing World-only entries are unchanged. At least one target is required. Shared `when` gates the entire mapping. Evaluation occurs once against the pre-command World/semantic interpretation; World dispatch precedes App dispatch. App `domainId`/`commandId` are fixed literal IDs captured at compile time; `recordId` and `args` use the existing bounded value-template/formula language. There is no App-state formula root or generic lifecycle action/patch output.

Build/install closure validates the App target against `lifecycleRuntime.domains[].commands[]` and requires a semantic Task declaring that event. Both authoring v2 and lowered logic are validated. Runtime validates the semantic request, resolved record identifier, target argsSchema, scope activity, terminal status, reducer result recordSchema and retention. Any failure discards the entire private candidate, including already-prepared World changes.

The mapping registry only accepts the World+App pair when called by Session authority. Existing browser/non-Session consumers retain the single World Command boundary and reject App mappings before dispatch. General multi-command fan-out remains unsupported.

Task contract retains `world_outcome_proposal` as the existing semantic-result discriminator; it is not renamed and no new resultClass/sink is added. Ordinary semantic Task proposals remain inert until explicit Host acceptance, which uses the same preparation path. This does not implement G2 or permit automation to accept fresh proposals.

`expectedRevisionId`, invocation, requestHash, fingerprint, retry/tombstone and branch behavior remain owned by SessionCore. Exact retries reuse the existing receipt, changed payloads conflict, concurrent writers are resolved by the existing CAS, and branch restore restores App and World with Timeline. Lifecycle logical time advances only at publication. No data/config migration; old exact Packages and saved receipts keep their schema.

## Actual validation

From `tests/`:

```powershell
node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand native/turn-app-outcome-g1.test.js native/task-runtime-p3.test.js native/lifecycle-runtime-p4.test.js native/lifecycle-contract-p4.test.js game-runtime/interpretation-mapping.test.js game-runtime/declarative.test.js --testNamePattern='^(?!.*(?:MysqlEngine|PgEngine)).*$'
```

6 suites passed: 402 tests passed / 152 skipped at that checkpoint. After adding concurrent finalizers, ordinary App proposal acceptance, dynamic record identity/terminal rejection and fixed mapping capture/when coverage, reran the G1 suite: 38 passed / 34 skipped. Total distinct passing tests across the selected runs: 409 (not one final 409-test run).

New G1 coverage on both FS and SQLite: App-only and World+App single Revision including Variant/receipt; exact retry and fingerprint conflict; fork rollback; args/result schema, inactive scope, terminal record, World validation and retention failure rollback; stale anchor; concurrent CAS; no_change; literal target restrictions; unknown targets rejected during Package validation; model Domain/Command/patch injection rejection; explicit proposal acceptance; non-Session consumer rejection.

Changed-file ESLint (four production files plus new test) and `git diff --check` passed.

Post-merge on main: reran `native/turn-app-outcome-g1.test.js` with the same engine exclusion (`--silent --verbose=false`): 38 passed / 34 skipped. Working tree clean and whitespace check passed. This rerun is not added to the distinct-test total.

Initial run exposed three fixture assumptions (parent is `core.parentRevisionId`, scope API is `scope.transition`, retention must admit initial data), corrected before the passing runs. It also attempted existing MySQL/PostgreSQL harnesses, which failed with local connection refused; subsequent runs explicitly excluded those engines. No claim of external DB validation. No Docker, Android, unrelated full-repository tests or real provider calls. P3's existing HTTP cases use local synthetic servers.

## Files and implementation decisions

- `public/scripts/native/experience/logic/declarative.js`: strict optional App mapping and existing formula evaluation.
- `public/scripts/native/experience/logic/interpretations.js`: Session-only bounded pair, immutable validated proposals; legacy single-command default.
- `src/native/experience-validation.js`: Package App target/semantic contract closure, including lowered logic.
- `src/native/task-authority.js`: stage App changes through existing Lifecycle preparation alongside private World candidate.
- `tests/native/turn-app-outcome-g1.test.js`: real Package installation and Session repositories; no mock authority.

SessionCore and Lifecycle reducer code required no change. Their existing atomic publication and validation boundaries were sufficient; the missing piece was the interpretation sink bridge.
