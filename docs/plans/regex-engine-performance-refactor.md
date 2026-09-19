# Regex Engine Performance Refactor

Baseline: `main@9b9801ab941f8bb0c08a3cbf52974b045a96da82`

## Problem

The current regex hot path rebuilds the complete active script list and scans every rule for every processed text. Compiled `RegExp` objects are cached, but rule selection is not. As rule counts grow, message rendering / prompt cooking scales with all active rules even when most rules target another placement or lane.

Repeated and same-pattern rules also multiply replacement work. Removing them automatically is unsafe because sequential regex replacements are order-sensitive and an apparently duplicate rule can intentionally run twice.

## Refactor

1. Keep existing rule order and replacement semantics.
2. Split persistent/static rules from dynamic runtime providers.
3. Build a bounded static execution-plan cache keyed by active character/preset/allow state and an explicit revision.
4. Index static rules by placement once, then cache lane/edit selections; numeric depth filtering is performed from the already narrowed candidate list and may use a bounded selection cache.
5. Runtime providers remain evaluated on every call so dynamic-provider semantics are preserved.
6. Invalidate static plans when persisted scripts or allow-state changes.
7. Add conservative diagnostics:
   - exact execution duplicates;
   - same-pattern overlapping rules with different replacement behavior.
   Diagnostics never auto-delete, disable, reorder, or merge rules.
8. Batch Regex Editor DOM insertion so large rule lists are attached to the live DOM once per source list rather than one row at a time.

## Safety constraints

- Preserve `GLOBAL -> PRESET -> SCOPED -> runtime` execution order exactly.
- Preserve prompt/markdown/plugin/unscoped lane behavior.
- Preserve edit and depth semantics.
- Do not cache plain runtime-provider output across calls.
- Do not auto-deduplicate user rules.
- Keep ReDoS pause/reporting behavior unchanged.

## Validation

- Existing regex-engine lane / plugin tests.
- New execution-plan ordering, invalidation, dynamic-provider, duplicate/conflict diagnostics tests.
- ESLint.
- Full Node unit suite.
- Frontend build if touched paths require it.
