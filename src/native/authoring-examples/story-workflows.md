# Story workflows

Use Studio's existing Agent, Runtime editor, Review and Simulation for both
natural-language assisted authoring and manual JSON editing. Story definitions
are `experienceContract.lifecycleRuntime.workflows`, not runtime-generated JS.
Read the `lifecycle`, `tasks`, `information` and `scenario` references for the
current exact contracts before preparing a change.

## Turn a description into an inspectable script

For a request such as "A visitor seeks an appointment, may be delayed by work,
and must leave if the host becomes unavailable", identify:

- The existing subject, location, availability, knowledge and commitment facts.
- The domain command that requests the visit, and the domain rule that decides
  whether the person accepts, travels, arrives, or is blocked.
- An initial `user_gate` or `automation_gate`; waiting for admission does not
  reserve the person, move them, or freeze their life.
- Short `action` / `projection` nodes and `user_gate` intervention points.
- Fact-guarded alternatives, relative waits, interruption and terminal nodes.
- Player-safe discovery and notice through the existing Information views and
  messages. Workflow conditions may read private facts; they are not public UI.

Do not create duplicate subjects, balances, rewards, clocks or saves. A workflow
action may submit an intent to a declared domain command. It must not assign
"arrived", "agreed", "paid" or "victorious" merely because the script says so.
The corresponding domain rules must first establish those facts. Stage dialogue
and Scene cues are presentation, not commands or world-time advances.

## Conditions and temporal nodes

Transitions retain `id`, `from` and `to`, with optional:

- `when`: a boolean, `{all: [...]}`, `{any: [...]}`, `{not: ...}`, or a fact test.
- `automatic: true`: eligible for the existing Lifecycle pump.
- `interrupt: true`: requires `when`; bypasses the current wait/task only while
  that condition holds. An eligible interruption prevents ordinary exits.
- `taskStatus`: on a `model_task` exit, require the current invocation's `draft`,
  `applied`, `completed` or `rejected` result. Use an explicit rejected branch for
  refusal/replanning; a result from an earlier invocation cannot release it.

A fact test names an exact existing domain, record and declared field:

```json
{
  "domainId": "appointments",
  "recordId": "visit",
  "path": ["arrived"],
  "op": "eq",
  "value": true
}
```

Operators are `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `includes` and `exists`.
Ordered comparisons require numbers; `includes` requires an array of scalar
items; `exists` has no `value`. Other comparisons against a missing record or
field are false, including `ne`. Unknown schema fields are rejected at build.
Explicit `not` can invert a test, so include `exists` when absence must block it.

```json
{
  "id": "wait-for-visitor",
  "kind": "wait_for",
  "wait": { "clockId": "world", "ticks": 30 }
}
```

`wait_for` is relative to the node's recorded entry tick. `wait_until` uses an
absolute `{clockId, tick}`. Neither reads wall time or charges for reading. A
scope suspension prevents transition; world time may still advance in other
scopes. Resumption then evaluates the actual current facts and deadline.

Automatic transitions use the original bounded pump and shared Authority
budget, at most one transition per pump, rotating among eligible workflows.
Explicit domain effects and any world-time advance still run through their
original authorities. A pump is not a new background scheduler. Do not assume
an entire graph will run in one call or backdate late effects to a deadline.

## Model content, interruptions and recovery

Use `model_task` for a declared Task. Its structured output can be a proposal or
an intent accepted by a fixed declared domain command. Do not grant a model
permission to invent commands or replace author source while playing. An
accepted proposal still needs current domain checks before causing effects.

Lifecycle domain commands can reuse declarative `validators`, evaluated before
any assignment against the current record (`world`) and typed input (`args`):

```json
{
  "id": "current-candidate",
  "formula": "world.available && !world.accepted && args.epoch == world.epoch"
}
```

Place that object in the fixed command's `validators` array, not in generated
content. A command has at most 16 validators. Each predicate must produce a
boolean; false, missing data or evaluation failure rejects the command without
assignments. A missing record uses the domain's declared initial value without
creating a record on rejection. Private predicates and custom diagnostic text
are not returned to the player. The same checks apply to direct, scheduled,
Workflow and declared Task-result commands when they actually execute.

A declared Task candidate that fails a fixed command precondition is stored as
`rejected` for that exact invocation, without adopting its effects or knowledge.
Use the explicit rejection transition to replan. A scheduled interaction whose
precondition has expired is also marked `rejected`; later due interactions still
run. Other runtime errors remain errors rather than being disguised as refusal.

For progressive continuation, keep a bounded candidate in an existing content
domain: an authored capability/variant identifier, its parameters, and the
dependency epoch captured in the generation input. Increment that epoch when
the affected facts change. The fixed adoption command checks the epoch and
current availability, then records only the accepted proposal. It must not
credit payment, consent, arrival or victory. The existing action authorities
still execute and verify those effects; use Authority transaction read grants
and validators when a decision spans multiple domains. A domain validator can
only read its own record, not arbitrary world state.

Do not generate an entire remote future or silently retry a failed candidate
as though it had succeeded. Keep unaffected authored content, discard stale
near-term candidates, and request a new candidate only when an actual event
requires one. A valid continuation may end peacefully with no next episode.

A model node can exit after a completed/applied result or a generated draft
awaiting acceptance. A rejected or missing result does not count as success.
An explicit `taskStatus: "rejected"` transition handles refusal without treating
it as successful work. No result, including provider failure, leaves this gate
pending unless a separate eligible fact-based interruption is authored.
Leaving a node cancels its pending outbox work; late results cannot affect the
new node. An interruption does not undo a completed transaction, refund money,
erase a promise or resurrect a character. Author the next steps against actual
history. Still-valid hand-authored paths remain available.

Progress, entry ticks, branch and pending work live in the original Lifecycle
state and use normal Session/SavePoint recovery. Notifications and commitments
belong to their existing domains; do not reproduce them in a story journal.

## Inspect and preview

The Runtime editor accepts these definitions and validates them with the same
compiler as Package Build. The read-only `inspectWorkflow` helper in
`public/shared/native-workflow-runtime.js` explains the current phase, deadline,
and blocked exits for author tooling; it does not grant player access to facts.

Use Studio Simulation to run a saved definition in its ephemeral native host.
Exercise admission refusal, due/not-due, changed facts, intervention, departure,
interruption, checkpoint and restore. A recorded/mock Task result is not evidence
of a real provider call. Simulation never writes a player's existing save.
Use the ordinary frontend Preview for layout and separate real play for actual
movement, speech bubbles, services and model behavior.
