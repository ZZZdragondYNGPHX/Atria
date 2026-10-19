import { nodePromptProgramPin } from '../../../public/shared/native-orchestration-contracts.js';
import { assertExactResourceRef } from '../model-prompt-runtime/contracts.js';
import { assertVersionedModelPromptResource, getVersionedModelPromptResourceIdentity } from '../model-prompt-runtime/resources.js';
import { GenerationError } from '../model-prompt-runtime/execution-utils.js';
import { hashNativeDocument, equalNativeDocuments } from '../repositories/common.js';

// Program and Route are separate exact dependencies of the same original Node.
// The Route still owns models, connections, budgets and fallback policy.
export async function readNodePromptProgram(resolver, handle, value) {
    const ref = assertExactResourceRef(value, 'core.prompt-program');
    if (!equalNativeDocuments(ref, value)) throw new GenerationError('generation_program_authority_required');
    const original = ref.scope === 'library' ? await resolver.library.getExact(handle, ref) : await resolver.getScopedResource?.(handle, ref);
    if (!original || original.origin?.scope !== ref.scope
        || ['projectId', 'packageId', 'packageVersionId'].some(key => original.origin[key] !== ref[key]))
        throw new GenerationError('generation_resource_origin_mismatch');
    const resource = assertVersionedModelPromptResource(ref.resourceType, original.snapshot);
    const identity = getVersionedModelPromptResourceIdentity(ref.resourceType, resource);
    if (identity.resourceId !== ref.resourceId || identity.revision !== ref.revision) throw new GenerationError('generation_exact_resource_mismatch');
    return resource;
}

export function nodeProgramSelection({ handle, node, dependencyPins, resolver }) {
    const pin = nodePromptProgramPin(node, dependencyPins);
    if (!pin) return null;
    const promptProgramRef = assertExactResourceRef(pin.resourceRef, 'core.prompt-program');
    return Object.freeze({ promptProgramRef, assertCurrent: async ({ handle: owner, promptProgramRef: selected }) => {
        if (owner !== handle || !equalNativeDocuments(selected, promptProgramRef)) throw new GenerationError('generation_program_authority_required');
        const original = await readNodePromptProgram(resolver, handle, promptProgramRef);
        if (hashNativeDocument(original) !== pin.integrity) throw new GenerationError('generation_program_selection_stale');
    } });
}

export function resolveNodeModel({ node, dependencyPins, resolver, ...request }) {
    return resolver.resolve({ ...request, programSelection: nodeProgramSelection({ ...request, node, dependencyPins, resolver }) });
}

export const declaredModelRoute = resolved => resolved.declaredPromptProgramRef
    ? { ...resolved.route, promptProgramRef: resolved.declaredPromptProgramRef } : resolved.route;
