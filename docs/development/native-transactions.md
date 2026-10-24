# Native Transaction Hot Paths

Transaction declarations may set `computation.precondition: false` when their
compute handler already checks actionable preconditions. The default still
executes `precondition`. This flag does not skip input schemas, grants, limits,
effects, invariants or SessionCore publication checks.

`computation.invariantSource` selects a separate exact JS/TS module exporting
`default.invariant`. Without it, the computation source remains the invariant
source. `invariantContext` and `invariantReads` still constrain its input. The
compiler and installer link and validate both declared modules. A small invariant
module avoids loading the entire gameplay engine merely to check population.

## Internal Continuations

`coalesceInput: true` is allowed only on a hidden, non-simulation Transaction
without `savePointBefore`. A consecutive identical internal input can reuse the
last user Timeline anchor while that anchor and Persona identity are unchanged.
Player actions, speech, changed input or Persona identity break the sequence.

Coalescing does not reuse computation results, Authority identities, receipts or
state. Each action still executes against its expected Revision with the same
CAS and publication owner. Recent retries return their original receipts;
checkpointed invocation signatures reject expired retries. Signatures are
bounded by the existing history budget, not an unlimited replay ledger.

## Candidate And Persistence

Authority preparation owns an isolated candidate. Lifecycle effects mutate that
candidate without copying every Domain after each command. Public lifecycle
preparation still copies the caller's state, and preparation failures cannot
publish the private candidate.

The filesystem redo journal installs independent state, Revision,
Timeline and Branch files with at most four concurrent writes. Mutable roots,
deletions and Session HEAD remain ordered barriers; failed batches wait for all
in-flight siblings before returning. Journal recovery and durable sync remain
in effect. This is file I/O concurrency, not parallel world causality.
