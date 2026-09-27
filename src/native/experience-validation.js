import { compileUiDocument } from '../../public/scripts/native/experience/ui/v2-document.js';
import { compileDeclarativeLogic } from '../../public/scripts/native/experience/logic/declarative.js';
import { lowerDeclarativeMutations } from '../../public/scripts/native/experience/logic/mutations.js';
import { json } from '../../public/scripts/native/experience/ui/v2-values.js';

// Validate before install and lower authoring-only shorthand during build. Old
// v1 resources keep their exact source bytes and existing validation boundary.
export function validateExperienceResources(manifest, files, assets, { lower = false } = {}) {
    for (const voice of manifest.runtime?.experienceContract?.presentationRuntime?.voices ?? []) {
        if (!manifest.actors.some(actor => actor.actorId === voice.actorId)) throw new TypeError('Actor Voice must belong to Package');
    }
    const logicPaths = new Set();
    for (const entry of manifest.entryPoints) {
        const experience = entry.runtime?.experience ?? manifest.runtime?.experience;
        if (experience?.componentModelVersion === 2) {
            if (experience.surface !== undefined) throw new TypeError('Component v2 surfaces belong to document views');
            const bytes = files.get(experience.component);
            if (!bytes || bytes.length > 2 * 1024 * 1024) throw new TypeError('Missing or oversized UI Document v2');
            compileUiDocument(JSON.parse(bytes.toString('utf8')), { mode: experience.mode });
        }
        const logic = entry.runtime?.game?.logic ?? manifest.runtime?.game?.logic;
        if (logic) logicPaths.add(logic);
    }
    for (const path of logicPaths) {
        const bytes = files.get(path);
        if (!bytes) continue;
        const raw = JSON.parse(bytes.toString('utf8'));
        const hasAppMapping = raw.interpretations?.some(item => item.appCommand !== undefined);
        if (raw.schemaVersion !== 2 && !hasAppMapping) continue;
        const lowered = raw.schemaVersion === 2 ? lowerDeclarativeMutations(raw) : raw;
        compileDeclarativeLogic(lowered, { data: {} });
        for (const mapping of lowered.interpretations ?? []) {
            if (!mapping.appCommand) continue;
            const { domainId, commandId } = mapping.appCommand;
            const contract = manifest.runtime?.experienceContract;
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
