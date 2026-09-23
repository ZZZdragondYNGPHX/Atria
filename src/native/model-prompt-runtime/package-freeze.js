import { createHash } from 'node:crypto';
import { flattenPromptProgram } from './prompt-compiler.js';
import { assertPromptModule, assertPromptProgram } from './contracts.js';
import { getVersionedModelPromptResourceIdentity } from './resources.js';

// Build-only projection of the exact closure; no runtime Library lookups remain.
export function freezePackagePromptPrograms(entries, owner) {
    const refFor = entry => {
        const identity = getVersionedModelPromptResourceIdentity(entry.resourceType, entry.resource);
        return { resourceType: identity.resourceType, resourceId: identity.resourceId, revision: identity.revision, ...owner };
    };
    const resolvedResources = entries.map(entry => ({ ref: refFor(entry), resource: entry.resource }));
    const output = entries.filter(entry => entry.resourceType !== 'core.prompt-program');
    for (const entry of entries.filter(item => item.resourceType === 'core.prompt-program')) {
        if (!entry.resource.parentRef && !entry.resource.derive?.length) { output.push(entry); continue; }
        // Ancestor templates may leave required bindings for a child. Freeze structure,
        // not a request; the runtime compiler still validates every selected binding.
        const flat = flattenPromptProgram({ route: { promptProgramRef: refFor(entry) }, resources: resolvedResources }, { validateBindings: false });
        const stages = flat.stages.map(stage => {
            const refs = [];
            for (const item of stage.modules.filter(item => !item.disabled)) {
                const parameters = structuredClone(item.module.parameters);
                for (const [name, value] of Object.entries(item.config)) parameters[name].default = value;
                // Keep logical module IDs (including replacement aliases) so tie ordering is unchanged.
                const revision = 'frozen-' + createHash('sha256').update(JSON.stringify({ ref: item.ref, config: item.config, id: item.id })).digest('hex');
                const resource = assertPromptModule({ ...item.module, promptModuleId: item.id, revision, parameters,
                    provenance: [...item.module.provenance, { source: 'atria.package.freeze', ref: JSON.stringify(item.ref) }] });
                const frozen = { resourceType: 'core.prompt-module', resource, origin: owner };
                if (!output.some(old => old.resourceType === frozen.resourceType && old.resource.promptModuleId === item.id && old.resource.revision === revision)) output.push(frozen);
                refs.push(refFor(frozen));
            }
            return { stageId: stage.stageId, targets: stage.targets, condition: stage.condition, consumes: stage.consumes, moduleRefs: refs };
        });
        output.push({ ...entry, resource: assertPromptProgram({ ...entry.resource, parentRef: null, derive: [], stages,
            parameters: flat.parameters, locals: flat.locals, artifacts: flat.artifacts, exclusiveTargets: flat.exclusiveTargets,
            responseDirective: flat.responseDirective, provenance: [...entry.resource.provenance, ...flat.provenance] }) });
    }
    return output;
}
