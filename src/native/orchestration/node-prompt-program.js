import { nodePromptProgramPin } from '../../../public/shared/native-orchestration-contracts.js';
import { assertExactResourceRef } from '../model-prompt-runtime/contracts.js';
import { GenerationError } from '../model-prompt-runtime/execution-utils.js';
import { hashNativeDocument, equalNativeDocuments } from '../repositories/common.js';

// Program and Route are separate exact dependencies of the same original Node.
// The Route still owns models, connections, budgets and fallback policy.
export function nodeProgramSelection({ handle, node, dependencyPins, library }) {
    const pin = nodePromptProgramPin(node, dependencyPins);
    if (!pin) return null;
    const promptProgramRef = assertExactResourceRef(pin.resourceRef, 'core.prompt-program');
    return Object.freeze({ promptProgramRef, assertCurrent: async ({ handle: owner, promptProgramRef: selected }) => {
        if (owner !== handle || !equalNativeDocuments(selected, promptProgramRef)) throw new GenerationError('generation_program_authority_required');
        const original = await library.getExact(handle, promptProgramRef);
        if (hashNativeDocument(original.snapshot) !== pin.integrity) throw new GenerationError('generation_program_selection_stale');
    } });
}

export function resolveNodeModel({ node, dependencyPins, resolver, ...request }) {
    return resolver.resolve({ ...request, programSelection: nodeProgramSelection({ ...request, node, dependencyPins, library: resolver.library }) });
}

export const declaredModelRoute = resolved => resolved.declaredPromptProgramRef
    ? { ...resolved.route, promptProgramRef: resolved.declaredPromptProgramRef } : resolved.route;
