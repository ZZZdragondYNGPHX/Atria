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

A simulation may declare up to 4096 jobs and 65536 steps; actual execution also
consumes the host Authority budget. During one catch-up, static record reads
reuse their evaluation until the record value, scope or relevant clock changes.
Collection and Subject jobs retain full evaluation. Deterministic due/priority/ID
ordering is unchanged.

Internal `coalesceInput` and `continuationCondition` allow the FS caller to run
up to eight logical actions, stopping after 250 ms or a terminal condition.
The Session lock stays held, while each action has its own durable transaction,
CAS, Revision, receipt and automatic-save handling. CPU preparation does not
hold the account storage queue. If a later continuation fails, earlier committed
actions remain committed; retries use their existing receipts.

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
the persistent Timeline index. SQL fetches at most 256 exact keys per query;
FS has at most 16 concurrent dependency reads and observes pending journal writes.
Both preserve ordering, missing-dependency errors and account boundaries. Stored
immutable entry/variant metadata is admitted by repository writes and Save import;
ordinary reads validate identity, ancestry and selection joins without admitting
every metadata leaf again.
An append-only publication with the same admitted prefix reuses its complete
history instead of re-reading every old Variant. Rewrites, branch changes and
checkpoints reconstruct history. A fresh full snapshot still loads full history;
this API does not silently truncate a game or its save data.

FS compression/decompression uses asynchronous zlib for request paths. The
lossless `ATRZ1` format and durable redo ordering are unchanged. A stamp-checked
file cache holds at most 4096 envelopes / 64 MiB of decoded JSON bytes, with a
16 MiB per-entry limit. The materialized state cache holds eight heads of up to
16 MiB each. These are cache weights, not process RSS limits. File changes,
managed writes/deletes, transaction failures and journal recovery invalidate the
relevant cached state. Ordinary mutable repository reads return copies; internal
snapshot reads can borrow immutable record values.

For package and media transport, see [Native media capacity](native-media-capacity.md).
