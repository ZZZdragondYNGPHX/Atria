import { fields } from '../scripts/native/experience/ui/v2-values.js';
import { compileDataSchema } from '../scripts/native/experience/ui/message-templates.js';
import { assertLifecycleJson } from './native-lifecycle-contract.js';
import { assertTaskValue, taskId } from './native-task-contract.js';

export function exactContentRef(value) {
    fields(value, ['assetId', 'contentHash'], 'Exact content reference');
    if (!/^asset_[a-f0-9]{32}$/.test(value.assetId) || !/^[a-f0-9]{64}$/.test(value.contentHash)) throw new TypeError('Exact content reference required');
    return value;
}
export function exactBaseRef(value) {
    fields(value, ['packageId', 'packageVersionId', 'packageContentHash'], 'Exact Base Package');
    if (!/^pkg_[a-f0-9]{32}$/.test(value.packageId) || !/^pkgv_[a-f0-9]{32}$/.test(value.packageVersionId)
        || !/^[a-f0-9]{64}$/.test(value.packageContentHash)) throw new TypeError('Exact Base Package required');
    return value;
}
function unique(items, max, normalize) {
    if (!Array.isArray(items) || items.length > max) throw new TypeError('Content list limit');
    const result = items.map(normalize);
    if (new Set(result.map(item => item.id ?? item.assetId)).size !== result.length) throw new TypeError('Duplicate content identity');
    return result;
}
export function assertContentRuntime(raw) {
    const value = assertLifecycleJson(raw);
    fields(value, ['schemaVersion', 'extensionPoints', 'composition'], 'Content runtime');
    if (value.schemaVersion !== 1) throw new TypeError('Content runtime version');
    const extensionPoints = unique(value.extensionPoints, 32, point => {
        fields(point, ['id', 'resourceId', 'kinds', 'schema', 'maxItems'], 'Content extension point');
        taskId(point.id); taskId(point.resourceId);
        if (!Array.isArray(point.kinds) || !point.kinds.length || new Set(point.kinds).size !== point.kinds.length
            || point.kinds.some(kind => !['data', 'skill', 'template'].includes(kind))) throw new TypeError('Unsupported shareable resource kind');
        if (!Number.isSafeInteger(point.maxItems) || point.maxItems < 1 || point.maxItems > 128) throw new TypeError('Content point item limit');
        return { ...point, schema: compileDataSchema(point.schema) };
    });
    if (new Set(extensionPoints.map(point => point.resourceId)).size !== extensionPoints.length) throw new TypeError('Duplicate extension resource');
    let composition;
    if (value.composition !== undefined) {
        fields(value.composition, ['base', 'resources'], 'Exact composition');
        composition = { base: exactBaseRef(value.composition.base), resources: unique(value.composition.resources, 32, exactContentRef) };
    }
    return { schemaVersion: 1, extensionPoints, ...(composition ? { composition } : {}) };
}

// Community metadata is not a trust signal. The receiving Base supplies the
// type and bounds; strings remain inert text in the existing native renderer.
export function assertCommunityPayload(raw, base, runtime) {
    const value = assertLifecycleJson(raw);
    const addon = value.format === 'atria-addon';
    fields(value, ['format', 'schemaVersion', 'id', 'revision', 'target', 'requires', 'conflicts', ...(addon ? ['contributions'] : ['contribution'])], 'Community payload');
    if (!addon && value.format !== 'atria-shareable-resource') throw new TypeError('Unsupported Community payload');
    if (value.schemaVersion !== 1) throw new TypeError('Community payload version');
    taskId(value.id); taskId(value.revision);
    exactBaseRef(value.target);
    if (Object.keys(base).some(key => base[key] !== value.target[key])) throw new TypeError('Community target must match exact Base');
    unique(value.requires, 32, exactContentRef);
    if (!Array.isArray(value.conflicts) || value.conflicts.length > 32 || new Set(value.conflicts).size !== value.conflicts.length) throw new TypeError('Content conflict limit');
    value.conflicts.forEach(taskId);
    const normalize = item => {
        fields(item, ['id', 'pointId', 'kind', 'value'], 'Typed contribution'); taskId(item.id);
        const point = runtime.extensionPoints.find(point => point.id === item.pointId);
        if (!point || !point.kinds.includes(item.kind)) throw new TypeError('Contribution requires a declared extension point and kind');
        return { ...item, value: assertTaskValue(item.value, point.schema) };
    };
    const contributions = unique(addon ? value.contributions : [value.contribution], 128, normalize);
    return { ...value, ...(addon ? { contributions } : { contribution: contributions[0] }) };
}

// Registry listings are inert discovery metadata. Installing an entry still
// requires the exact bytes and receiving Base validation above. No remote
// execution URL, credentials, follow-latest selector or trusted flag is accepted.
export function assertCommunityRegistry(raw) {
    const value = assertLifecycleJson(raw);
    fields(value, ['schemaVersion', 'entries'], 'Community Registry');
    if (value.schemaVersion !== 1) throw new TypeError('Community Registry version');
    return { schemaVersion: 1, entries: unique(value.entries, 128, entry => {
        fields(entry, ['id', 'revision', 'kind', 'title', 'target', 'ref'], 'Community Registry entry');
        taskId(entry.id); taskId(entry.revision);
        if (!['addon', 'data', 'skill', 'template'].includes(entry.kind) || typeof entry.title !== 'string' || entry.title.length > 128
            || /[\u0000-\u001f\u007f]/.test(entry.title)) throw new TypeError('Invalid Community discovery metadata');
        exactBaseRef(entry.target); exactContentRef(entry.ref);
        return entry;
    }) };
}
