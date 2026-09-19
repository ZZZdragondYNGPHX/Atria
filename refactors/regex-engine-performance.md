# Regex Engine Performance Refactor

## Task

Reduce regex-system stalls as active rule counts grow, especially when many rules are duplicated, conflict on the same pattern, or target lanes/placements unrelated to the text currently being processed.

- Baseline: `main@9b9801ab941f8bb0c08a3cbf52974b045a96da82`
- Task branch: `refactor/regex-engine-performance`
- PR: #22
- Final validated task head: `345e4f06f6169c7383ae840997775c5cc3dfb669`
- Squash merge / resulting `main`: `21f11b93f0e165485488236b74072a12c7df0c4e`
- Validated task tree is identical to the merged `main` tree.

## Root cause

The regex engine already cached compiled `RegExp` objects, but `getRegexedString()` rebuilt the complete active script list and scanned every rule for every processed string before placement/lane/edit/depth filtering.

This made aggregate work scale roughly with processed-text count × total active rule count. The fixed 1000-entry compiled-regex LRU could also thrash once a user had more than 1000 unique active patterns.

The Regex Editor separately built and attached every rule row directly to live DOM, so large rule sets also produced noticeable UI main-thread work.

## Implementation

### Static execution plans

Persistent/global, preset and character-scoped scripts are compiled into a bounded in-memory execution plan keyed by the current character, preset, allow state and an explicit revision.

The plan:

- indexes rules by placement once;
- caches lane/edit candidate sets;
- caches bounded numeric-depth selections;
- preserves the existing static execution order;
- keeps invalid-placement handling and ReDoS reporting intact.

Plain runtime provider callbacks remain dynamic and are evaluated on every call. Their output is narrowed by placement/lane without being persisted into the static plan.

### Cache invalidation

The plan revision is invalidated by normal regex mutation paths, including:

- global/scoped/preset `saveScriptsByType()`;
- scoped/preset allow/disallow changes;
- preset embedded-regex import/clear paths;
- Regex Debugger rule-order saves.

This avoids stale execution plans after edits, imports or reorder operations.

### Compiled RegExp cache

The historical 1000-entry LRU now has adaptive session capacity:

- base capacity: 1000;
- grows to cover the active static unique-pattern set;
- hard cap: 8192.

This prevents repeated compile/evict cycles for ordinary rule sets above 1000 patterns while keeping memory bounded.

### Replacement hot path

Replacement-template normalization is now done once per script execution rather than once per individual regex match callback. Capture-group replacement work is skipped when the replacement contains no capture substitutions.

### Duplicate/conflict diagnostics

The engine exposes conservative diagnostics for:

- exact active execution duplicates;
- active same-pattern rules that overlap in placement/lane but use different replacement behavior.

No rule is automatically deleted, disabled, merged or reordered because sequential regex replacement is order-sensitive and duplicate-looking rules can intentionally execute more than once.

Conflict discovery is bucketed by atomic placement × lane execution domains instead of pairwise comparison, avoiding an O(n²) diagnostic path for large same-pattern groups.

### Large Regex Editor rendering

Regex Editor rendering now:

- builds rows in detached `DocumentFragment` containers;
- yields to the browser every 80 rows;
- aborts stale render requests;
- attaches each source list to live DOM once.

The editor surfaces a small active duplicate/conflict summary without changing rule execution.

## Compatibility / data impact

- No persisted regex schema change.
- No settings migration.
- No automatic rule deduplication.
- Existing placement, lane, edit, depth and sequential replacement semantics are preserved.
- Runtime provider callbacks remain dynamically evaluated.

## Validation

PR Checks passed on final task head `345e4f06f6169c7383ae840997775c5cc3dfb669`:

- Atria Migration Guard
- ESLint
- frontend libraries build
- complete Node unit suite

New regression coverage verifies:

- static plan reuse;
- plan invalidation after persisted saves;
- runtime providers remain dynamic;
- static-before-runtime ordering;
- duplicate rules still execute sequentially;
- duplicate/conflict diagnostics;
- non-overlapping placement/lane rules are not false-positive conflicts;
- compiled-regex capacity grows beyond the historical 1000-rule ceiling.

Android JVM/APK and Docker builds were not run because this task changes browser JavaScript/CSS/HTML only and those validations remain opt-in.
