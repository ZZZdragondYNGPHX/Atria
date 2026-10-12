import { fields, json, text } from './native-values.js';
import { taskId } from './native-task-contract.js';
import { assertLifecycleJson } from './native-lifecycle-contract.js';
import { isCognitionSource, assertCognitionSource } from './native-cognition-runtime.js';
import { assertHypothesisPolicy } from './native-tom-contract.js';
import { appraisalTargets } from './native-appraisal-contract.js';
import { assertMemoryPolicy, assertInformationBasisSource, hasInformationBasis } from './native-memory-contract.js';

export const INFORMATION_LIMITS = Object.freeze({ sources: 32, views: 16, records: 4096, items: 128, characters: 32768, depth: 4, edges: 256, rollups: 128 });
export function informationList(value, limit, convert = value => value) {
    if (!Array.isArray(value) || value.length > limit) throw new TypeError('Information list limit');
    const result = value.map(convert);
    if (new Set(result.map(item => item.id ?? item)).size !== result.length) throw new TypeError('Duplicate information identity');
    return result;
}
function choice(value, choices) {
    if (!choices.includes(value)) throw new TypeError('Unsupported information policy');
    return value;
}
export function informationInteger(value, min, max) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError('Information bound exceeded');
    return value;
}
const reference = value => { if (typeof value !== 'string' || !/^[a-z][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new TypeError('Invalid information reference'); return value; };
export function assertInformationRuntime(value, lifecycle, tasks) {
    value = assertLifecycleJson(value);
    fields(value, ['schemaVersion', 'sources', 'views', 'actors', 'graphs', 'narration'], 'Information runtime');
    if (value.schemaVersion !== 1 || !lifecycle) throw new TypeError('Information runtime requires version 1 and lifecycle');
    const sources = informationList(value.sources, 32, source => {
        fields(source, ['id', 'kind', 'semantic', 'scopeId', 'domainId', 'worldId', 'fields', 'actorField', 'statusField', 'channelField', 'participantsField', 'hypothesisPolicy', 'memoryPolicy', 'causalBasis'], 'Information source');
        taskId(source.id); choice(source.kind, ['application', 'world', 'timeline', 'history']);
        choice(source.semantic, ['truth', 'belief', 'thread', 'open_loop', 'memory', 'narrative', 'desire', 'intention', 'emotion', 'relationship', 'theory_of_mind']);
        if ((source.semantic === 'theory_of_mind') !== (source.hypothesisPolicy !== undefined)) throw new TypeError('Hypothesis policy requires its own Information semantic');
        if (source.hypothesisPolicy) assertHypothesisPolicy(source.hypothesisPolicy);
        if (source.memoryPolicy !== undefined) {
            if (source.kind !== 'application' || source.semantic !== 'memory') throw new TypeError('Memory policy requires its own application source');
            assertMemoryPolicy(source.memoryPolicy, lifecycle);
        }
        if (source.causalBasis !== undefined && (source.causalBasis !== true || source.kind !== 'application' || source.semantic !== 'truth')) throw new TypeError('Causal basis requires a formal application Truth source');
        if (!lifecycle.scopes.some(scope => scope.id === source.scopeId)) throw new TypeError('Unknown information scope');
        const paths = informationList(source.fields, 16, path => informationList(path, 8,
            key => (isCognitionSource(source) || hasInformationBasis(source)) && ['goalId', 'commitmentIds', 'conflictKey', 'expiresAt', 'recordedAt', 'exceptionRefs', 'sourceRefs', 'viewId', 'scopeEpochs', 'itemId'].includes(key) ? key : taskId(key)));
        if (!paths.length || paths.some(path => !path.length) || new Set(paths.map(path => path.join('.'))).size !== paths.length) throw new TypeError('Information fields must be unique nonempty paths');
        if (source.kind === 'history') {
            if (!lifecycle.history || source.semantic !== 'narrative' || paths.some(p => p.length !== 1 || !['summary', 'tick', 'year', 'refs', 'transaction'].includes(p[0]))
                || ['domainId', 'worldId', 'actorField', 'statusField', 'channelField', 'participantsField'].some(k => source[k] !== undefined)) throw new TypeError('History projection disclosure');
        } else if (source.kind === 'application') {
            if (source.semantic === 'narrative') throw new TypeError('Canonical narrative requires Timeline source');
            const domain = lifecycle.domains.find(domain => domain.id === source.domainId && domain.scopeId === source.scopeId);
            if (!domain || source.worldId !== undefined) throw new TypeError('Unknown information domain');
            for (const path of paths) {
                let schema = domain.recordSchema;
                for (const key of path) schema = schema?.properties?.[key];
                if (!schema) throw new TypeError('Undeclared information field');
            }
            for (const key of ['actorField', 'statusField', 'channelField', 'participantsField']) if (source[key] !== undefined) {
                taskId(source[key]);
                const schema = domain.recordSchema.properties?.[source[key]];
                if (key === 'participantsField' ? schema?.type !== 'array' || schema.items?.type !== 'string' : schema?.type !== 'string') throw new TypeError('Undeclared or mistyped information discriminator');
            }
            if (source.semantic === 'belief' && (!source.actorField || !source.statusField || !source.channelField)) throw new TypeError('Belief requires actor, status and channel');
            if (source.semantic === 'thread' && !source.participantsField) throw new TypeError('Thread requires participants');
            if (source.semantic === 'open_loop' && !source.statusField) throw new TypeError('Open Loop requires status');
            if (isCognitionSource(source)) assertCognitionSource(source, domain);
            if (hasInformationBasis(source)) assertInformationBasisSource(source, domain);
        } else {
            if (['domainId', 'actorField', 'statusField', 'channelField', 'participantsField'].some(key => source[key] !== undefined)
                || source.semantic !== (source.kind === 'world' ? 'truth' : 'narrative')) throw new TypeError('Invalid source semantics');
            if (source.kind === 'world') reference(source.worldId);
            else if (source.worldId !== undefined || paths.some(path => path.length !== 1 || !['content', 'role', 'actorId'].includes(path[0]))) throw new TypeError('Timeline projection only exposes canonical fields');
        }
        return { ...source, fields: paths };
    });
    for (const source of sources.filter(hasInformationBasis)) {
        if (sources.some(peer => peer !== source && peer.domainId === source.domainId && (peer.semantic !== source.semantic
            || peer.causalBasis !== source.causalBasis || JSON.stringify(peer.memoryPolicy) !== JSON.stringify(source.memoryPolicy)))) throw new TypeError('Memory/causal aliases require the same policy');
    }
    for (const source of sources.filter(source => source.semantic === 'theory_of_mind')) {
        const policy = source.hypothesisPolicy;
        for (const id of policy.behaviorSourceIds) {
            const behavior = sources.find(source => source.id === id);
            const schema = lifecycle.domains.find(domain => domain.id === behavior?.domainId)?.recordSchema;
            if (behavior?.kind !== 'application' || behavior.semantic !== 'truth'
                || [[policy.targetField, 'string'], [policy.outcomeField, 'string'], [policy.observedField, 'boolean']].some(([field, type]) =>
                    schema?.properties[field]?.type !== type || !schema.required?.includes(field)
                    || !behavior.fields.some(path => path.length === 1 && path[0] === field))
                || !schema.properties[policy.outcomeField].enum?.some(value => typeof value === 'string' && value.length > 0 && value.length <= 128)) throw new TypeError('Hypothesis behavior requires selected typed Truth fields');
        }
        if (sources.some(peer => peer !== source && peer.domainId === source.domainId && (peer.semantic !== 'theory_of_mind'
            || Object.keys(policy).some(key => JSON.stringify(peer.hypothesisPolicy[key]) !== JSON.stringify(policy[key]))))) throw new TypeError('Hypothesis aliases require the same declared policy');
    }
    const actors = informationList(value.actors, 64, actor => {
        fields(actor, ['id', 'scopeId', 'availability'], 'Actor availability'); reference(actor.id);
        if (!lifecycle.scopes.some(scope => scope.id === actor.scopeId)) throw new TypeError('Unknown Actor scope');
        if (actor.availability !== undefined) {
            fields(actor.availability, ['domainId', 'recordId', 'field'], 'Actor availability predicate');
            const domain = lifecycle.domains.find(domain => domain.id === actor.availability.domainId && domain.scopeId === actor.scopeId);
            taskId(actor.availability.recordId); taskId(actor.availability.field);
            if (domain?.recordSchema.properties?.[actor.availability.field]?.type !== 'boolean') throw new TypeError('Availability requires a declared boolean');
        }
        return actor;
    });
    const views = informationList(value.views, 16, view => {
        fields(view, ['id', 'audience', 'actorId', 'taskId', 'sources', 'exposure', 'knowledge', 'memory', 'maxItems', 'maxCharacters'], 'Information view');
        taskId(view.id); choice(view.audience, ['player', 'narrator', 'actor', 'task']);
        if (view.actorId !== undefined && !actors.some(actor => actor.id === view.actorId)) throw new TypeError('Unknown Perspective Actor');
        if (view.audience === 'actor' && !view.actorId) throw new TypeError('Actor view requires identity');
        if (view.audience === 'task' ? !tasks?.tasks.some(task => task.id === view.taskId && task.context.includes('projection')) : view.taskId !== undefined) throw new TypeError('Unknown projection Task');
        const refs = informationList(view.sources, 32, taskId);
        if (refs.some(id => !sources.some(source => source.id === id))) throw new TypeError('Unknown projection source');
        const exposure = informationList(view.exposure, 2, item => choice(item, ['display', 'context']));
        if (view.audience === 'player' && exposure.includes('context')) throw new TypeError('Player-only data cannot enter Context');
        if (typeof view.knowledge !== 'boolean') throw new TypeError('Knowledge exposure must be explicit');
        if (view.memory !== undefined && typeof view.memory !== 'boolean') throw new TypeError('Memory exposure must be explicit');
        informationInteger(view.maxItems, 1, 128); informationInteger(view.maxCharacters, 1, 32768);
        return { ...view, sources: refs, exposure };
    });
    const contextKeys = views.filter(view => view.exposure.includes('context')).map(view => view.audience + ':' + (view.audience === 'actor' ? view.actorId : view.taskId ?? ''));
    if (new Set(contextKeys).size !== contextKeys.length) throw new TypeError('Ambiguous Context Perspective');
    for (const task of tasks?.tasks ?? []) for (const variant of task.variants) {
        const binding = variant.resultBinding;
        if (binding?.kind !== 'cognition.appraise') continue;
        const view = views.find(view => view.id === binding.viewId);
        if (view?.audience !== 'task' || view.taskId !== task.id || !view.actorId || !view.exposure.includes('context')) throw new TypeError('Appraisal requires exact Actor-bound Task context');
        if (binding.eventSourceIds.some(id => !view.sources.includes(id) || sources.find(source => source.id === id)?.kind !== 'application'
            || isCognitionSource(sources.find(source => source.id === id)) || !sources.find(source => source.id === id).fields.some(path => path.length === 1 && path[0] === binding.eventGate.field))) throw new TypeError('Appraisal gate requires a selected event field');
        for (const kind of appraisalTargets(binding)) {
            const target = sources.find(source => source.id === binding[kind].sourceId);
            if (target?.kind !== 'application' || target.semantic !== (kind === 'theory' ? 'theory_of_mind' : kind) || target.domainId !== binding[kind].domainId) throw new TypeError('Appraisal target requires its declared Information domain');
            if (kind === 'theory' && (!view.sources.includes(target.id) || target.hypothesisPolicy.behaviorSourceIds.some(id => !view.sources.includes(id)))) throw new TypeError('Hypothesis Task requires its declared state and behavior view');
        }
    }
    const graphs = informationList(value.graphs, 16, graph => {
        fields(graph, ['id', 'viewId', 'nodeSource', 'edgeSource', 'fromField', 'toField', 'maxDepth', 'maxEdges'], 'Bounded graph'); taskId(graph.id);
        const view = views.find(view => view.id === graph.viewId);
        const edge = sources.find(source => source.id === graph.edgeSource);
        if (!view?.sources.includes(graph.nodeSource) || !view.sources.includes(graph.edgeSource) || edge?.kind !== 'application'
            || !['fromField', 'toField'].every(key => edge.fields.some(path => path.length === 1 && path[0] === graph[key]))) throw new TypeError('Graph must use visible declared endpoints');
        informationInteger(graph.maxDepth, 1, 4); informationInteger(graph.maxEdges, 1, 256);
        return graph;
    });
    let narration;
    if (value.narration !== undefined) {
        fields(value.narration, ['mode', 'contextViewId', 'disclosureViewId'], 'Information narration');
        const mode = choice(value.narration.mode ?? 'separate', ['separate', 'limited', 'custom']);
        taskId(value.narration.contextViewId); taskId(value.narration.disclosureViewId);
        const context = views.find(view => view.id === value.narration.contextViewId);
        const disclosure = views.find(view => view.id === value.narration.disclosureViewId);
        if (context?.audience !== 'narrator' || !context.exposure.includes('context')
            || (mode === 'limited' && !context.actorId)
            || disclosure?.audience !== 'player' || !disclosure.exposure.includes('display')) throw new TypeError('Narration requires exact context and display grants');
        narration = { mode, contextViewId: context.id, disclosureViewId: disclosure.id };
    }
    return json({ schemaVersion: 1, sources, views, actors, graphs, ...(narration ? { narration } : {}) });
}

export function assertInformationClosure(contract, manifest) {
    if (!contract) return;
    if (contract.actors.some(actor => !manifest.actors.some(item => item.actorId === actor.id))
        || contract.sources.some(source => source.kind === 'world' && !manifest.worlds.some(item => item.world.worldId === source.worldId))) throw new TypeError('Information reference outside exact Package');
}

export function boundedInformationText(value) { return text(value, INFORMATION_LIMITS.characters); }
