import { promptStageEntries } from './prompt-module-order.js';

const missing = Symbol('missing');
const copy = value => value === missing ? missing : JSON.parse(JSON.stringify(value));
const same = (a, b) => {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => same(value, b[index]));
    if (record(a) && record(b)) return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
    return false;
};
const record = value => value !== missing && value !== null && typeof value === 'object' && !Array.isArray(value);
const pointer = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');

// A three-way author edit. Exact references remain data; saving and consumer
// adoption still belong to the original resource and domain services.
export function mergePromptUpgrade(base, local, upstream, choices = {}) {
    const conflicts = [];
    const choose = (path, before, ours, theirs) => {
        const selected = choices[path];
        if (!['local', 'upstream'].includes(selected)) conflicts.push({ path, base: before === missing ? undefined : copy(before),
            local: ours === missing ? undefined : copy(ours), upstream: theirs === missing ? undefined : copy(theirs) });
        return copy(selected === 'upstream' ? theirs : ours);
    };
    function merge(before, ours, theirs, path) {
        if (same(ours, theirs) || same(before, theirs)) return copy(ours);
        if (same(before, ours)) return copy(theirs);
        if ([before, ours, theirs].every(record)) {
            const result = {};
            for (const key of new Set([...Object.keys(before), ...Object.keys(ours), ...Object.keys(theirs)])) {
                const value = merge(Object.hasOwn(before, key) ? before[key] : missing, Object.hasOwn(ours, key) ? ours[key] : missing,
                    Object.hasOwn(theirs, key) ? theirs[key] : missing, path + '/' + pointer(key));
                if (value !== missing) result[key] = value;
            }
            return result;
        }
        if ([before, ours, theirs].every(Array.isArray)) {
            const items = [...before, ...ours, ...theirs];
            const id = ['stageId', 'entryId'].find(key => items.length && items.every(item => record(item) && typeof item[key] === 'string')
                && [before, ours, theirs].every(array => new Set(array.map(item => item[key])).size === array.length));
            if (id) {
                const orders = [before, ours, theirs].map(array => array.map(item => item[id]));
                const order = same(orders[0], orders[1]) ? orders[2] : same(orders[0], orders[2]) || same(orders[1], orders[2]) ? orders[1]
                    : choose(path + '/$order', ...orders);
                const tables = [before, ours, theirs].map(array => new Map(array.map(item => [item[id], item])));
                const result = [];
                for (const key of new Set([...order, ...orders.flat()])) {
                    const value = merge(...tables.map(table => table.has(key) ? table.get(key) : missing), path + '/' + pointer(key));
                    if (value !== missing) result.push(value);
                }
                return result;
            }
        }
        return choose(path || '/', before, ours, theirs);
    }
    return { resource: merge(base, local, upstream, ''), conflicts };
}

export function promptUpgradeOrigin(resource) {
    if (resource.parentRef) return { source: resource.parentRef, baseRef: resource.parentRef, derived: true };
    for (const entry of [...(resource.provenance ?? [])].reverse()) {
        if (!['atria.upstream', 'atria.fork', 'atria.resource-bundle', 'atria.prompt-preset'].includes(entry.source)) continue;
        try {
            const value = JSON.parse(entry.ref), source = value.source ?? value;
            if (source.resourceType && source.resourceId && source.revision) return { source, baseRef: value.baseRef ?? source, derived: false };
        } catch { /* Non-resource provenance is not an upstream version. */ }
    }
    return null;
}

export function comparablePromptResource(resource, identity) {
    const result = JSON.parse(JSON.stringify(resource));
    for (const field of ['promptProgramId', 'promptModuleId', 'generationProfileId', 'revision', 'provenance']) {
        if (Object.hasOwn(identity, field)) result[field] = JSON.parse(JSON.stringify(identity[field])); else delete result[field];
    }
    if (result.stages?.every(stage => typeof stage === 'object')) result.stages = result.stages.map(stage => {
        const { moduleRefs: _refs, ...rest } = stage; return { ...rest, entries: promptStageEntries(stage) };
    });
    return result;
}
