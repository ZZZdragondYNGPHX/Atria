import { readChronicle, reviewInterval, readWorldView } from '../../../public/shared/native-chronicle-host.js';
import { fixedHostTarget, projectPersonaStatus, projectConversation, projectPresentation, projectParticipants, projectSession, projectMessageBlocks, projectSave } from '../../../public/shared/native-frontend-host.js';
import { bridgeFailure } from '../../../public/shared/native-frontend-bridge.js';
import { informationContext } from '../../../public/shared/native-information-runtime.js';
import { deriveExpressionPlan } from '../../../public/shared/native-expression-runtime.js';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const historyCursorKey = randomBytes(32);
function readTemporalHistory(owner, base, input) {
    const scope = [owner, base.session.sessionId, base.revision.branchId, base.revision.revisionId, input.key, input.tick, input.clockId];
    const sign = page => createHmac('sha256', historyCursorKey).update(JSON.stringify([scope, page])).digest('hex');
    let cursor = '';
    if (input.cursor) {
        let envelope;
        try { envelope = JSON.parse(input.cursor); } catch { throw bridgeFailure('bridge_binding_denied'); }
        if (!envelope?.page || typeof envelope.mac !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.mac)
            || !timingSafeEqual(Buffer.from(envelope.mac, 'hex'), Buffer.from(sign(envelope.page), 'hex'))) throw bridgeFailure('bridge_binding_denied');
        cursor = JSON.stringify(envelope.page);
    }
    const page = readChronicle(base, { ...input, cursor });
    if (page.next) { const next = JSON.parse(page.next); page.next = JSON.stringify({ page: next, mac: sign(next) }); }
    return page;
}

function expressionStatus(base) {
    const fallback = reason => ({ status: 'fallback', actorId: '', intent: '', reason, revisionId: base.revision.revisionId });
    if (!base.manifest.runtime?.experienceContract?.informationRuntime?.narration?.expression) return fallback('not_configured');
    let scanned = 0, scanExceeded = false;
    const onScan = count => { scanned += count; if (scanned > 4096) { scanExceeded = true; throw new RangeError('Expression scan limit'); } };
    try {
        const information = informationContext(base, { kind: 'narrator' }, undefined, { includeRollups: false, onScan });
        const plan = deriveExpressionPlan(base, information, { onScan });
        if (plan?.status !== 'ready') return fallback(plan?.reason ?? 'not_configured');
        return { status: 'ready', actorId: plan.actorId, intent: plan.intent, reason: '', revisionId: base.revision.revisionId };
    } catch { return fallback(scanExceeded ? 'truncated' : 'display_grant_unavailable'); }
}

export async function readFixedHost(core, owner, state, base, binding, input) {
    const { service, method } = binding.target;
    if (fixedHostTarget(binding.target, binding.outputSchema?.properties?.data).local) throw bridgeFailure('bridge_host_local_required');
    if (service === 'host.world' && method === 'view') return readWorldView(base, input);
    if (service === 'host.history' && method === 'at') return readTemporalHistory(owner, base, input);
    if (service === 'host.history' && method === 'query') return readChronicle(base, input);
    if (service === 'host.chronology' && method === 'interval') return reviewInterval(base, input);
    if (service === 'host.session' && method === 'run') return core.runStatus(owner, state.sessionId);
    if (service === 'host.persona' && method === 'status') return projectPersonaStatus(base);
    if (service === 'host.expression' && method === 'status') return expressionStatus(base);
    if (service === 'host.tasks' && method === 'presentation') {
        const task = base.manifest.runtime?.experienceContract?.taskRuntime?.tasks.find(item => item.id === input.taskId);
        if (task?.resultPolicy.resultClass !== 'presentation' || task.resultPolicy.sink !== 'artifact') throw bridgeFailure('bridge_binding_denied');
        return (base.states.atri_task_results?.records ?? []).filter(record => record.kind === 'task' && record.taskId === task.id
            && record.resultClass === 'presentation' && record.status === 'completed').slice(-32).map(record => {
            const payloadJson = JSON.stringify(record.payload);
            if (payloadJson.length > 65536) throw bridgeFailure('bridge_budget_exceeded');
            return { invocationId: record.invocationId, taskId: task.id, payloadJson };
        });
    }
    if (method === 'status') return projectSession(base);
    if (service === 'host.session' && method === 'saves') return (await core.listSavePoints(owner, state.sessionId)).map(projectSave);
    if (method === 'messages') return projectConversation(base);
    if (service === 'host.conversation' && method === 'participants') return projectParticipants(base);
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
    if (service === 'host.conversation' && method === 'switch') snapshot = await core.switchBranch(owner, state.sessionId, input.branchId, options);
    else if (service === 'host.session' && method === 'begin') {
        let value;
        try { value = JSON.parse(input.inputJson); } catch { throw new TypeError('Invalid story start input'); }
        snapshot = await core.beginStory(owner, state.sessionId, { input: value, invocationId: input.invocationId, expectedRevisionId: revision });
    } else if (service === 'host.session' && method === 'restore') snapshot = await core.restoreSavePoint(owner, state.sessionId, input.saveId, options);
    else if (service === 'host.session' && method === 'save') return { revision, data: projectSave(await core.createSavePoint(owner, state.sessionId, { ...input, revisionId: revision, ...options })) };
    else throw bridgeFailure('bridge_method_denied');
    return { revision: snapshot.revision.revisionId, data: {} };
}
