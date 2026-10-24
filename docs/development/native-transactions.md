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

`continuationCondition` may be a Boolean expression on that same hidden,
coalesced Transaction. The FS engine can prepare up to eight ordinary logical
actions in one journal, stopping after 250 ms of preparation or when the
condition becomes false. Each action still has its own Revision, Authority
budget, execution, receipt and history. Speech, pending outbox work and Run
state stop internal continuation. Other engines publish one action per call.

The next action uses the preceding private publication while the original
Session and engine locks remain held; it does not reload the same state from
storage. A preparation failure exposes none of the group. After durable journal
publication, recovery completes all its writes before reads or retries. Revision
entropy is stable for a retried group. Automatic saves retain each logical
snapshot's anchor and captured time, and execute after physical publication.

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

Only SessionCore's existing publication proof permits reuse of its freshly
computed state heads and private documents at commit. Unowned repository inputs
still have their actual heads checked. The commit fingerprint identifies those
heads rather than serializing the full world a second time. Public loads remain
isolated from the stored state and cache. Schema, scope, grant, retention,
cognition and causal checks remain active; read-only schema validation avoids
constructing an immutable copy that would immediately be discarded.

The persisted Session HEAD directly proves its current Revision is committed.
Historical single-Revision queries walk the same retained roots, prioritizing
the current lineage and stopping when that Revision is found. Full reachability
enumeration for maintenance still visits every retained root and dependency.

## Lossless State Storage

The existing `atria-world-state-v2` bounded delta encoding also stores Lifecycle,
Task results and action receipts. Object changes and indexed array changes keep
all logical values, including appends and truncation. Replay clones one snapshot
and applies the patches in order; its depth remains at most 32 and its cumulative
patch-byte bound is unchanged. GC marks all delta parents. Plain JSON records
remain readable. Portable Save APIs still return complete logical states; this
does not change their existing archive limits or promise cheap whole-history
portable export.

FS resource and redo files use `ATRZ1\n`, a four-byte uncompressed length, and
level-one raw deflate only when smaller. Documents below 4 KiB or above 64 MiB
retain JSON encoding. Decode bounds expansion and rejects truncation. Backup
extraction and scratch-owner rebinding use the same codec. Compression changes
physical representation, not resource identity or durability ordering.

The FS materialization cache holds at most eight heads, each at most 4 MiB,
isolated by user, Session, namespace and head. Reads compare the envelope's
integrity identity; managed writes/deletes invalidate the head, and transaction
failure or journal recovery clears the cache. Transaction-local raw reads are
bounded to 64 records and return copies. These caches assume Native-owned
immutable dependencies, not a fresh cryptographic proof of externally modified
ancestry on every action. Recent foreground writes defer maintenance slices;
existing idle timers resume them without competing with continuous advancement.
