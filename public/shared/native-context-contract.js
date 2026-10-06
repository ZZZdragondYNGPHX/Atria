import { fields, json } from './native-values.js';
import { taskId } from './native-task-contract.js';
import { resourcePath } from './native-frontend-contract.js';

export function assertContextRuntime(raw, information, tasks) {
    const value = json(raw);
    fields(value, ['schemaVersion', 'derivations'], 'Context runtime');
    if (value.schemaVersion !== 1 || !Array.isArray(value.derivations) || value.derivations.length > 32) throw new TypeError('Context runtime budget');
    const ids = new Set(), outputs = new Set();
    for (const item of value.derivations) {
        fields(item, ['id', 'source', 'viewId', 'target', 'artifacts'], 'Context derivation');
        taskId(item.id); resourcePath(item.source); taskId(item.viewId);
        const view = information?.views.find(view => view.id === item.viewId && view.exposure.includes('context'));
        if (ids.has(item.id) || !view || !/\.(js|ts)$/.test(item.source)) throw new TypeError('Invalid Context derivation');
        ids.add(item.id);
        fields(item.target, ['kind', 'knowledgeEntryId', 'priority'], 'Context target');
        if (item.target.kind === 'knowledge') {
            if (!view.knowledge || !/^kentry_[a-f0-9]{32}$/.test(item.target.knowledgeEntryId) || item.target.priority !== undefined) throw new TypeError('Invalid Knowledge derivation target');
        } else if (item.target.kind === 'context') {
            if (item.target.knowledgeEntryId !== undefined || !Number.isSafeInteger(item.target.priority) || Math.abs(item.target.priority) > 10000) throw new TypeError('Invalid Context priority');
        } else throw new TypeError('Invalid Context target kind');
        const output = item.viewId + ':' + (item.target.knowledgeEntryId ?? item.id);
        if (outputs.has(output)) throw new TypeError('Multiple Context output owners');
        outputs.add(output);
        if (!Array.isArray(item.artifacts) || item.artifacts.length > 16) throw new TypeError('Context artifact budget');
        const grants = new Set();
        for (const grant of item.artifacts) {
            fields(grant, ['id', 'taskId', 'variantId', 'usageId', 'selector'], 'Context artifact');
            taskId(grant.id); taskId(grant.taskId); taskId(grant.variantId); taskId(grant.usageId);
            const task = tasks?.tasks.find(task => task.id === grant.taskId);
            if (grants.has(grant.id) || grant.selector !== 'latest' || !task?.variants.some(variant => variant.id === grant.variantId)
                || !task.resultPolicy.uses?.some(use => use.id === grant.usageId && use.purpose === 'context')) throw new TypeError('Invalid Context artifact grant');
            grants.add(grant.id);
        }
    }
    return value;
}
