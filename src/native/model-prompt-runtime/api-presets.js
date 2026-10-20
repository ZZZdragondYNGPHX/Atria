import { createNativeId } from '../identity.js';
import { hashNativeDocument, getNativeDocument } from '../repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { ConflictError } from '../../storage/errors.js';
import { withRuntimeWrite } from './runtime-write.js';
import { assertGenerationProfile, assertModelProfile } from './contracts.js';
import { executionPathFingerprint } from './execution-evidence.js';
import { effectiveOutputReserve } from './execution-utils.js';
import { RouteResolver } from './route-resolver.js';

const GENERATION = 'core.generation-profile';
const exact = (type, resource, id) => ({ scope: 'library', resourceType: type, resourceId: resource[id], revision: resource.revision });

// One product operation over the original Model, Generation and Route authorities.
// The engine's nested transaction scope makes the entire publication atomic.
export async function saveApiPreset(host, handle, input) {
    if (!input?.route || !input.model || !input.generation || !input.expected) throw new TypeError('API preset fields required');
    const engine = host.persistence._engine;
    return withRuntimeWrite(handle, () => engine.withTransaction(handle, async tx => {
        const current = await host.persistence.getRuntimeRoute(handle, input.route.runtimeRouteId);
        if (hashNativeDocument(current ?? null) !== input.expected.route) throw new ConflictError('native_generation_configuration_conflict');
        const previousModel = current && await host.persistence.getModelProfile(handle, current.modelProfileRef.modelProfileId);
        if (hashNativeDocument(previousModel ?? null) !== input.expected.model) throw new ConflictError('native_generation_configuration_conflict');
        const others = (await host.persistence.listRuntimeRoutes(handle)).filter(route => route.runtimeRouteId !== current?.runtimeRouteId);
        const ownModel = previousModel && !others.some(route => route.modelProfileRef.modelProfileId === previousModel.modelProfileId);
        let modelDraft = assertModelProfile({ ...input.model,
            modelProfileId: ownModel ? previousModel.modelProfileId : createNativeId('modelProfile'), displayName: input.route.displayName });
        const connection = await host.persistence.getConnectionProfile(handle, modelDraft.connectionProfileRef.connectionProfileId);
        if (!connection) throw new TypeError('API preset connection unavailable');
        const pathFingerprint = executionPathFingerprint({ handle, connection, model: modelDraft });
        // A copied model cannot inherit measurements for another execution path.
        const capabilities = modelDraft.capabilities.filter(item => !item.binding || item.binding.pathFingerprint === pathFingerprint);
        for (const section of ['reasoning', 'cache']) {
            const capability = 'generation.' + section;
            const existing = capabilities.find(item => item.capability === capability);
            if (Object.keys(input.generation[section] ?? {}).length && (!existing || existing.state === 'supported' && !existing.binding)) {
                if (existing) capabilities.splice(capabilities.indexOf(existing), 1);
                capabilities.push({ capability, state: 'supported', provenance: [...(existing?.provenance ?? []), { kind: 'user-override', source: 'API preset generation parameters' }] });
            }
        }
        modelDraft = { ...modelDraft, capabilities: capabilities.map(item => item.provenance.some(source => source.kind === 'user-override') && !item.binding
            ? { ...item, binding: { schemaVersion: 1, pathFingerprint, observedAt: Date.now(), expiresAt: Number.MAX_SAFE_INTEGER, assurance: 'declared' } } : item) };
        const model = await host.persistence.saveModelProfile(handle, modelDraft,
            { expectedFingerprint: hashNativeDocument(ownModel ? previousModel : null) });
        const base = current?.generationProfileRef;
        const root = base?.scope === 'library' && await getNativeDocument(tx, { kind: K.versionedJsonResource, handle, resourceType: GENERATION, resourceId: base.resourceId });
        const ownGeneration = root && !root.presetOwner && root.currentRevision === base.revision
            && !others.some(route => route.generationProfileRef.scope === 'library' && route.generationProfileRef.resourceId === base.resourceId);
        const generation = assertGenerationProfile({ ...input.generation,
            generationProfileId: ownGeneration ? base.resourceId : createNativeId('generationProfile'),
            revision: createNativeId('revision'), displayName: input.route.displayName });
        effectiveOutputReserve({ model, generation });
        await host.library.commit(handle, GENERATION, generation, { expectedCurrentRevision: ownGeneration ? base.revision : null });
        let promptProgramRef = input.route.promptProgramRef;
        if (!promptProgramRef) {
            const prompt = await host.library.commit(handle, 'core.prompt-program', {
                schemaVersion: 1, promptProgramId: createNativeId('promptProgram'), revision: createNativeId('revision'), displayName: 'API default context',
                parameters: {}, parentRef: null, stages: [{ stageId: 'stage.main', entries: [
                    { entryId: 'anchor.context', kind: 'anchor', target: 'context.before_history', accepts: ['context.fact', 'context.player-persona', 'context.directive'], required: false },
                    { entryId: 'anchor.history', kind: 'anchor', target: 'context.after_history', accepts: ['context.history'], required: false },
                    { entryId: 'anchor.input', kind: 'anchor', target: 'context.before_input', accepts: ['context.input'], required: false },
                ] }], derive: [], responseDirective: {}, provenance: [],
            });
            promptProgramRef = exact('core.prompt-program', prompt, 'promptProgramId');
        }
        const route = { ...input.route, modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId },
            connectionProfileRef: model.connectionProfileRef, generationProfileRef: exact(GENERATION, generation, 'generationProfileId'), promptProgramRef };
        if (route.executionPolicy) route.executionPolicy = { ...route.executionPolicy, allowedModelProfileIds:
            route.executionPolicy.allowedModelProfileIds.map(id => id === input.model.modelProfileId || id === previousModel?.modelProfileId ? model.modelProfileId : id) };
        const persistence = Object.create(host.persistence);
        persistence.getRuntimeRoute = async (owner, id) => id === route.runtimeRouteId ? route : host.persistence.getRuntimeRoute(owner, id);
        const visited = new Set();
        async function visit(candidate, active = new Set()) {
            if (!candidate || active.has(candidate.runtimeRouteId) || candidate.role !== route.role || visited.size >= 128) throw new TypeError('Invalid fallback graph');
            if (visited.has(candidate.runtimeRouteId)) return;
            visited.add(candidate.runtimeRouteId);
            for (const ref of candidate.fallbackRouteRefs ?? []) await visit(await persistence.getRuntimeRoute(handle, ref.runtimeRouteId), new Set(active).add(candidate.runtimeRouteId));
        }
        await visit(route);
        return host.persistence.saveRuntimeRoute(handle, route, { expectedFingerprint: input.expected.route, validate: async value => {
            if (value.promptProgramRef.scope === 'library') await new RouteResolver({ persistence, library: host.library, providers: host.providers })
                .resolve({ handle, routeRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, role: route.role });
        } });
    }));
}
