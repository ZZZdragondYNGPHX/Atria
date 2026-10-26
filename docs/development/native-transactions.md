# Native computation and transactions

Game mechanics run in isolated V8 child processes. UI controllers retain their
separate QuickJS worker and frame-oriented budgets. CPU-heavy JavaScript belongs
in a declared package computation, not in a UI render or an HTTP handler.

## Multicore computations

Set `computation.partitioned: true` on a Transaction whose computation module
exports `partition`, `compute` and `reduce`. The normal input contains the
Transaction's `args`, authorized `reads`, `artifacts`, deterministic `seed` and
`anchor`. Partition and reduce execute in the same isolated process pool as
compute. They have no filesystem, network, clock, random or host-state access.

```js
export default {
    precondition(input) { return input.args.values.length > 0; },
    partition(input) {
        const values = input.args.values;
        const width = Math.ceil(values.length / 4);
        return Array.from({ length: Math.ceil(values.length / width) },
            (_, index) => values.slice(index * width, (index + 1) * width));
    },
    compute(input) {
        return { sum: input.shard.reduce((sum, value) => sum + value, 0) };
    },
    reduce(input) {
        return { sum: input.results.reduce((sum, result) => sum + result.sum, 0) };
    },
    invariant(input) { return Number.isFinite(input.computed.sum); },
};
```

Compute receives the original input plus `shard`, `shardIndex` and `shardCount`.
Reduce receives the original input plus `results` in partition order, independent
of completion order. The final reduced value must satisfy the declared
`computation.outputSchema`. All effects still enter one SessionCore publication;
a failed or cancelled shard cannot publish part of the world. Splitting work is
an authoring decision: dependencies between simulation steps are not automatically
parallelized. Use stable entity IDs or shard indices with the supplied seed.

Programs and compiled stages are reused by admitted package identity. A batch
serializes its original input once on the host, but IPC and guest parsing still
copy data into each process. This is not shared-memory or GPU computation. Each
stage has a fresh guest context; module globals do not persist between calls.
On the first runtime use, the host collects bounded static dependencies and the
same child-process pool performs TypeScript/JavaScript transpilation through
esbuild's native service. Source and generated-code AST admission remain on the
host; workers do not load the full TypeScript compiler. Build and runtime share
the same world transpiler and artifact hash; the frontend controller compiler
is unchanged. Source bytes are pinned before the asynchronous boundary. Concurrent
requests for identical source bytes share compilation and validation; cancelling
one caller leaves other callers active, while cancelling the last retires the job.
Compilation jobs share queue backpressure and process deadlines with computation
jobs. The compiler change intentionally changes world artifact evidence hashes;
old stored receipts are preserved, not relabelled as new artifacts.

Host settings under `native.computation` are read at startup:

| Setting | Default |
| --- | --- |
| `workers`, `heapMiB` | `0`: size from available CPU and memory |
| `timeoutMs` | 2000 per stage |
| `inputMiB`, `outputMiB` | 16 each |
| `queueMiB` | 128, with at most 64 queued jobs |
| `nodes`, `depth` | 1000000, 64 |
| `shards` | max(4, available logical CPUs * 4) |
| `modules`, `moduleMiB` | 512, 8 |

Automatic sizing reserves host capacity; workers start on demand. Increasing
workers helps independent CPU work and increases memory use. Queue pressure
rejects with `computation_busy`; timeouts retire an unresponsive process.
Generation cancellation propagates through Authority preparation, context
computations and output processors. The internal `runPackageComputation` API also
accepts an `AbortSignal`. Cancelling preparation leaves HEAD unchanged. A network
disconnect does not roll back an already committed action.

`native.authority` separately configures `valueBytes`, `totalValueBytes`,
`readBytes`, `recordScans`, `ruleEvaluations` and `steps`. Defaults are 16 MiB,
128 MiB, 64 MiB, 1000000, 16384 and 65536. These do not enlarge ordinary UI/model
messages or bypass authored permissions and schemas.

## Avoiding repeated work

`computation.precondition: false` omits a separate precondition call when compute
already performs it. `invariantSource` selects a smaller exact module exporting
`default.invariant`; `invariantContext` and `invariantReads` constrain its input.
Changed values and the final invariant remain checked.
Within one transaction, the final check recollects its current authorized reads.
If its complete input equals the successful earlier invariant input, it reuses
that verdict and preserves both logical evidence entries. Changed inputs execute
the invariant again; verdicts are not shared between transactions.

Strict JSON admission records byte size, node count, height and longest string
for each owned immutable subtree. Smaller subsequent limits still apply. Sandbox
JSON responses are parsed, checked and frozen in place; external object inputs
still require descriptor, prototype, key and dense-array checks before copying.

A simulation may declare up to 4096 jobs and 65536 steps; actual execution also
consumes the host Authority budget. During one catch-up, static record reads
reuse their evaluation until the record value, scope or relevant clock changes.
Collection and Subject jobs retain full evaluation. Deterministic due/priority/ID
ordering is unchanged.

Internal `coalesceInput` and `continuationCondition` allow the FS caller to run
up to eight logical actions within the existing 250 ms batching window or until
a terminal condition. Before starting another atomic action, the caller reserves
the observed duration of the preceding action. This reduces batch overshoot;
an individual cold or expensive action can still exceed the window.
The Session lock stays held, while each action has its own durable transaction,
CAS, Revision, receipt and automatic-save handling. CPU preparation does not
hold the account storage queue. If a later continuation fails, earlier committed
actions remain committed; retries use their existing receipts.
Between actions and before publication, ready host continuations share a 4 ms
cooperative quantum and resume one at a time on successive event-loop turns.
No yield occurs inside the durable storage transaction. This prevents several
Sessions from simultaneously resuming long chains of resolved storage promises;
it does not interrupt synchronous JavaScript or change computation budgets.

## State and history ownership

Private candidates own mutable state containers and record envelopes. Already
admitted, deeply frozen record values and declarations can be shared. Replacing a
record value cannot mutate an older snapshot; shallow caller freezing is not a
trust signal. Validation reuses the typed result for unchanged host-owned frozen
values, while changed values, scope membership and mutable metadata are checked.

Single-ID reads use the runtime record index. Field equality and ID/field unions
build up to eight field indexes per record view. Identical private copies share
these indexes; value replacement copies only affected buckets, while removal or
cognition rebinding invalidates them. Cold construction and hot lookups charge
actual work without raising Authority budgets.
Private read fields compile to a projection tree. Common prefixes are traversed
once; a complete selection can share a sealed record subtree when field order
is identical. Missing-field checks, exact grants and observable JSON key order
are retained. Internal state writes likewise copy mutable envelopes while
borrowing sealed payloads; ordinary repository writes and public mutable copies
retain independent ownership.

Host-owned frozen record values and append-only action receipts reuse canonical
JSON and SHA256 results. Canonical text retention is bounded to 4096 entries and
32 MiB of UTF-16 text weight (8 MiB per entry); this is not a process RSS limit.
Mutable containers are never cached by reference. Logical byte accounting shares
the immutable payload sizes, and publication preserves old receipt identities
instead of cloning their contents. Canonical bytes and persisted hashes remain
unchanged. A changed namespace still hashes its complete canonical bytes; this
is not a Merkle format or a constant-time hash of arbitrary changes. The existing
delta format preserves field deletion, array truncation, ancestry and GC dependencies.

History windows and complete snapshots use the same materialization path over
the persistent Timeline index. SQL, including FS Native records, fetches at most
256 exact keys per query and observes its transaction's pending writes.
Both preserve ordering, missing-dependency errors and account boundaries. Stored
immutable entry/variant metadata is admitted by repository writes and Save import;
ordinary reads validate identity, ancestry and selection joins without admitting
every metadata leaf again.
An append-only publication with the same admitted prefix reuses its complete
history instead of re-reading every old Variant. Rewrites, branch changes and
checkpoints reconstruct history. A fresh full snapshot still loads full history;
this API does not silently truncate a game or its save data.

FS Native publication uses the [storage durable commit contract](../../src/storage/README.md#native-durable-commit-contract).
The previous per-file journal writer/overlay is removed; its decoder remains
only for migration recovery. SQL rows own their decoded JSON; internal integrity
comparisons borrow those rows and public mutable reads remain independent.
The materialized state cache holds eight heads of up to 16 MiB each. Writes,
rollback, connection close and another connection's `data_version` invalidate
cached state. These are cache weights, not process RSS limits.

For package and media transport, see [Native media capacity](native-media-capacity.md).
