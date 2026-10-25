# Platform Gap G1 — Turn → Session Application Atomic Outcome

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

Date: 2026-09-28. Task branch: `feat/native-turn-app-outcome-bridge`.
Baseline: `93991c7ccea30ce7499935bbb91592ae137086dd` (fresh origin/main). Main fast-forwarded and pushed; remote HEAD equality and feature ancestry confirmed.

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

 Any failure discards the entire private candidate, including already-prepared World changes.

The mapping registry only accepts the World+App pair when called by Session authority. Existing browser/non-Session consumers retain the single World Command boundary and reject App mappings before dispatch. General multi-command fan-out remains unsupported.

Task contract retains `world_outcome_proposal` as the existing semantic-result discriminator; it is not renamed and no new resultClass/sink is added. This does not implement G2 or permit automation to accept fresh proposals.

 Exact retries reuse the existing receipt, changed payloads conflict, concurrent writers are resolved by the existing CAS, and branch restore restores App and World with Timeline. Lifecycle logical time advances only at publication. No data/config migration; old exact Packages and saved receipts keep their schema.

## Files and implementation decisions

- `public/scripts/native/experience/logic/declarative.js`: strict optional App mapping and existing formula evaluation.
- `src/native/task-authority.js`: stage App changes through existing Lifecycle preparation alongside private World candidate.
- `tests/native/turn-app-outcome-g1.test.js`: real Package installation and Session repositories; no mock authority.

SessionCore and Lifecycle reducer code required no change.
