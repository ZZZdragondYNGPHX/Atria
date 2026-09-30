import { compileDeclarativeLogic } from '../../public/scripts/native/experience/logic/declarative.js';
import { lowerDeclarativeMutations } from '../../public/scripts/native/experience/logic/mutations.js';
import { json } from '../../public/shared/native-values.js';
import { assertFrontendExperience, frontendFeatureAvailability } from '../../public/shared/native-frontend-contract.js';
import { frontendTransactions } from './frontend/authority.js';
import { validateFrontendGraph } from './frontend/graph.js';
import { validateSchemaValue } from '../../public/scripts/native/experience/world/schema.js';

export function validateFrontendResources(manifest, files, assets) {
    for (const owner of [manifest, ...manifest.entryPoints]) {
        const experience = owner.runtime?.experience;
        if (experience?.frontend === undefined) continue;
        const normalized = assertFrontendExperience(experience);
        frontendFeatureAvailability(normalized.features);
        const graph = validateFrontendGraph({ entry: normalized.frontend.entry, files, mode: normalized.mode,
            experienceContract: manifest.runtime?.experienceContract, transactions: () => frontendTransactions(manifest, owner, files) });
        validateFrontendCapabilities(normalized, graph, files, manifest.permissions);
        for (const binding of graph.bridge.bindings.filter(item => item.kind === 'read')) {
            if (!binding.target.resourceId) continue;
            const ref = manifest.runtime.experienceContract.dataResources.find(item => item.resourceId === binding.target.resourceId);
            const bytes = assets?.get(ref.assetId);
            if (!bytes || bytes.length > 2 * 1024 * 1024 || !validateSchemaValue(JSON.parse(bytes.toString('utf8')), binding.collection ? { type: 'array', items: binding.outputSchema, maxItems: 10000 } : binding.outputSchema).ok) throw new TypeError('Frontend Read projection does not match public schema');
        }
    }
}

export function validateFrontendCapabilities(normalized, graph, files, permissions = []) {
    frontendFeatureAvailability(normalized.features);
    const mediaRef = graph.resources.find(ref => ref.kind === 'media');
    if (graph.resources.some(ref => ref.kind === 'script')) {
        const feature = normalized.features?.find(item => item.id === 'frontend-script' && item.version === 1);
        if (!feature || graph.resources.filter(ref => ref.kind === 'component').some(ref => JSON.parse(files.get(ref.path).toString('utf8')).controller?.required && !feature.required)) throw new TypeError('Controllers require matching frontend-script feature');
    }
    if (mediaRef) {
        const catalog = JSON.parse(files.get(mediaRef.path).toString('utf8'));
        const permission = permissions.find(item => item.permission === 'remote-media');
        const feature = normalized.features?.find(item => item.id === 'remote-media' && item.version === 1);
        if (!permission || !feature || (catalog.required && (!permission.required || !feature.required))) throw new TypeError('Frontend media requires matching remote-media feature and External Access Permission');
    }
}

// Validate the formal graph before install; lower game shorthand only during Build.
export function validateExperienceResources(manifest, files, assets, { lower = false } = {}) {
    validateFrontendResources(manifest, files, assets);
    for (const voice of manifest.runtime?.experienceContract?.presentationRuntime?.voices ?? []) {
        if (!manifest.actors.some(actor => actor.actorId === voice.actorId)) throw new TypeError('Actor Voice must belong to Package');
    }
    const contract = manifest.runtime?.experienceContract;
    const logicPaths = new Set();
    for (const entry of manifest.entryPoints) {
        const logic = entry.runtime?.game?.logic ?? manifest.runtime?.game?.logic;
        if (logic) logicPaths.add(logic);
        else if (contract?.authorityRuntime) throw new TypeError('Authority runtime requires pinned Game Logic v3 for each entry');
    }
    for (const path of logicPaths) {
        const bytes = files.get(path);
        if (!bytes) {
            if (contract?.authorityRuntime) throw new TypeError('Authority runtime requires pinned Game Logic bytes');
            continue;
        }
        const raw = JSON.parse(bytes.toString('utf8'));
        const hasAppMapping = raw.interpretations?.some(item => item.appCommand !== undefined);
        if (contract?.authorityRuntime && raw.schemaVersion !== 3) throw new TypeError('Authority runtime requires Game Logic schemaVersion 3');
        if (raw.schemaVersion !== 2 && raw.schemaVersion !== 3 && raw.transactions === undefined && raw.derivedPublications === undefined && !hasAppMapping) continue;
        const lowered = raw.schemaVersion === 2 ? lowerDeclarativeMutations(raw) : raw;
        compileDeclarativeLogic(lowered, { data: {}, experienceContract: contract });
        for (const mapping of lowered.interpretations ?? []) {
            if (!mapping.appCommand) continue;
            const { domainId, commandId } = mapping.appCommand;
            if (!contract?.lifecycleRuntime?.domains.some(domain => domain.id === domainId && domain.commands.some(command => command.id === commandId))) throw new TypeError('Interpretation references unknown App Command');
            if (!contract.taskRuntime?.tasks.some(task => task.interpretation?.allowedEventTypes.includes(mapping.eventType))) throw new TypeError('App interpretation requires declared semantic Task');
        }
        if (lower) files.set(path, Buffer.from(JSON.stringify(lowered)));
    }
    for (const ref of manifest.runtime?.experienceContract?.dataResources ?? []) {
        const bytes = assets.get(ref.assetId);
        if (!bytes || bytes.length > 2 * 1024 * 1024) throw new TypeError('Missing or oversized Package Data');
        json(JSON.parse(bytes.toString('utf8')));
    }
}
