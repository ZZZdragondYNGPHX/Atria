import { fixedHostTarget, projectConversation, projectSession, projectMessageBlocks, projectSave } from '../../../public/shared/native-frontend-host.js';
import { bridgeFailure } from '../../../public/shared/native-frontend-bridge.js';

export async function readFixedHost(core, owner, state, base, binding, input) {
    const { service, method } = binding.target;
    if (fixedHostTarget(binding.target, binding.outputSchema?.properties?.data).local) throw bridgeFailure('bridge_host_local_required');
    if (method === 'status') return projectSession(base);
    if (service === 'host.session' && method === 'saves') return (await core.listSavePoints(owner, state.sessionId)).map(projectSave);
    if (method === 'messages') return projectConversation(base);
    if (method === 'blocks') return projectMessageBlocks(base, binding.target.blockType);
    if (method === 'inspect') return projectConversation(await core.load(owner, state.sessionId, { revisionId: input.revisionId }));
    if (method === 'branches') return base.graph.map(node => ({ branchId: node.branchId, parentBranchId: node.branch?.parentBranchId ?? '', revisionId: node.headRevisionId ?? '', predecessorId: node.branch?.forkPoint?.messageId ?? '' }));
    if (method === 'alternatives') {
        const tail = base.timeline.at(-1), predecessor = base.timeline.at(-2)?.messageId;
        if (tail?.role !== 'assistant' || !predecessor) return [];
        const alternatives = [], seen = new Set();
        for (const branch of base.graph) {
            if (!branch.headRevisionId) continue;
            const snapshot = await core.load(owner, state.sessionId, { revisionId: branch.headRevisionId });
            for (const message of projectConversation(snapshot)) if (message.role === 'assistant' && message.predecessorId === predecessor && !seen.has(message.messageId)) {
                seen.add(message.messageId); alternatives.push({ ...message, alternativeBranchId: branch.branchId });
            }
        }
        return alternatives;
    }
    throw bridgeFailure('bridge_method_denied');
}
export async function writeFixedHost(core, owner, state, binding, input, revision) {
    const { service, method } = binding.target, options = { expectedRevisionId: revision };
    if (fixedHostTarget(binding.target).local) throw bridgeFailure('bridge_host_local_required');
    let snapshot;
    if (service === 'host.conversation' && method === 'retry') snapshot = await core.retryReply(owner, state.sessionId, { ...input, ...options });
    else if (service === 'host.conversation' && method === 'fork') snapshot = await core.forkBranch(owner, state.sessionId, { ...input, ...options });
    else if (service === 'host.conversation' && method === 'switch') snapshot = await core.switchBranch(owner, state.sessionId, input.branchId, options);
    else if (service === 'host.session' && method === 'restore') snapshot = await core.restoreSavePoint(owner, state.sessionId, input.saveId, options);
    else if (service === 'host.session' && method === 'save') return { revision, data: projectSave(await core.createSavePoint(owner, state.sessionId, { ...input, revisionId: revision, ...options })) };
    else throw bridgeFailure('bridge_method_denied');
    return { revision: snapshot.revision.revisionId, data: {} };
}
