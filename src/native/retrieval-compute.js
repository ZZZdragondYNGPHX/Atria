import { randomUUID } from 'node:crypto';
import { fields } from '../../public/shared/native-values.js';
import { hashNativeDocument } from './repositories/common.js';
import { selectNativeRuntimeRoute } from './adapters/generation-host.js';

const fail = code => { throw Object.assign(new TypeError(code), { code }); };
/** Optional retrieval work shares the existing Run operation / Project Task ledger. */
export async function prepareRetrievalCompute({ handle, context, profile, persistence, core, agent, studio }) {
    fields(context, ['kind', 'sessionId', 'revisionId', 'projectId', 'taskId', 'revision', 'routeRef'], 'Retrieval compute context');
    if (!['session', 'project'].includes(context.kind)) fail('native_retrieval_compute_invalid');
    const role = context.kind === 'session' ? 'role.narrator' : 'role.studio';
    if (context.routeRef && (context.routeRef.scope !== 'player' || Object.keys(context.routeRef).some(key => !['scope', 'runtimeRouteId'].includes(key)))) fail('native_retrieval_compute_invalid');
    const route = selectNativeRuntimeRoute(await persistence.listRuntimeRoutes(handle), role, context.routeRef);
    const limits = route.executionPolicy?.computeBudget;
    if (!limits) fail('native_generation_budget_lane_denied');
    const path = hashNativeDocument({ owner: handle, profile, purpose: 'retrieval.rerank' });
    let base, task;
    if (context.kind === 'session') {
        if (context.projectId || context.taskId || context.revision !== undefined) fail('native_retrieval_compute_invalid');
        base = await core.load(handle, context.sessionId);
        if (base.revision.revisionId !== context.revisionId) fail('native_generation_revision_conflict');
    } else {
        if (context.sessionId || context.revisionId) fail('native_retrieval_compute_invalid');
        task = (await agent.getContext(handle, context.projectId, context.taskId)).task;
        if (task.baseRevision !== context.revision || (await studio.getProject(handle, context.projectId)).revision.revision !== context.revision) fail('native_generation_revision_conflict');
    }
    let receipt, attemptId, charged = false;
    return {
        async beforeSend(body) {
            if (attemptId) fail('native_generation_attempt_conflict');
            attemptId = randomUUID();
            const attempt = { attemptId, requestId: 'retrieval:' + randomUUID(), targetFingerprint: path,
                estimatedTokens: Math.max(1, Buffer.byteLength(JSON.stringify(body), 'utf8')) };
            if (base) receipt = await core.runs.chargeCompute(handle, base,
                { branchId: base.revision.branchId, revisionId: base.revision.revisionId }, limits, attempt);
            else await agent.chargeGeneration(handle, context.projectId, context.taskId, context.revision, limits, attempt, task.executionFingerprint);
            charged = true;
        },
        async settle(usage) {
            if (!charged) return;
            if (base) await core.runs.settleCompute(handle, context.sessionId, receipt.operation, attemptId, usage);
            else await agent.settleGeneration(handle, context.projectId, context.taskId, attemptId, usage);
        },
    };
}
