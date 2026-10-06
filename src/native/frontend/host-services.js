import { readChronicle, reviewInterval, readWorldView } from '../../../public/shared/native-chronicle-host.js';
import { fixedHostTarget, projectPersonaStatus, projectConversation, projectPresentation, projectSession, projectMessageBlocks, projectSave } from '../../../public/shared/native-frontend-host.js';
import { bridgeFailure } from '../../../public/shared/native-frontend-bridge.js';

export async function readFixedHost(core, owner, state, base, binding, input) {
    const { service, method } = binding.target;
    if (fixedHostTarget(binding.target, binding.outputSchema?.properties?.data).local) throw bridgeFailure('bridge_host_local_required');
    if (service === 'host.world' && method === 'view') return readWorldView(base, input);
    if (service === 'host.history' && method === 'query') return readChronicle(base, input);
    if (service === 'host.chronology' && method === 'interval') return reviewInterval(base, input);
    if (service === 'host.session' && method === 'run') return core.runStatus(owner, state.sessionId);
    if (service === 'host.persona' && method === 'status') return projectPersonaStatus(base);
    if (method === 'status') return projectSession(base);
    if (service === 'host.session' && method === 'saves') return (await core.listSavePoints(owner, state.sessionId)).map(projectSave);
    if (service === 'host.conversation' && method === 'retryStatus') return core.inspectReplyRetry(owner, state.sessionId, input);
    if (method === 'messages') return projectConversation(base);
    if (service === 'host.conversation' && method === 'presentation') return projectPresentation(base);
    if (service === 'host.conversation' && method === 'recent') {
        const before = Math.min(input.beforeSequence ?? base.timeline.length, base.timeline.length);
        return projectConversation(base).slice(Math.max(0, before - 32), before);
    }
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
    else if (service === 'host.session' && method === 'begin') {
        let value;
        try { value = JSON.parse(input.inputJson); } catch { throw new TypeError('Invalid story start input'); }
        snapshot = await core.beginStory(owner, state.sessionId, { input: value, invocationId: input.invocationId, expectedRevisionId: revision });
    } else if (service === 'host.session' && method === 'restore') snapshot = await core.restoreSavePoint(owner, state.sessionId, input.saveId, options);
    else if (service === 'host.session' && method === 'save') return { revision, data: projectSave(await core.createSavePoint(owner, state.sessionId, { ...input, revisionId: revision, ...options })) };
    else throw bridgeFailure('bridge_method_denied');
    return { revision: snapshot.revision.revisionId, data: {} };
}
