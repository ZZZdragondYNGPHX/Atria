import { modelPortFixture } from './model-port-fixture.js';
import { installAppraisalFixture, appraisalCandidate } from '../../native/helpers/appraisal-fixture.js';

export async function appraisalModelFixture(make, { usage = true, maxJobs = 32, mutateCandidate = value => value } = {}) {
    let product;
    const f = await modelPortFixture(make, {
        createSource: async h => {
            product = await installAppraisalFixture(h, { publicAppraisal: true, configure: ({ contract }) => {
                contract.taskRuntime.turn = { policy: 'authority-first', stages: [] };
            } });
            await product.ready(); const queued = await product.queue();
            return { ...product, snapshot: queued };
        }, configurePlan: async ({ plan }) => {
            plan.definition.nodes[0].outputs[0].type = 'json'; plan.definition.nodes[1].inputs[0].type = 'json';
            plan.definition.outputContract.resultPolicy = { outputType: 'json', maxBytes: 65536 };
            plan.definition.limits.maxSteps = 50;
        }, changeRoute: route => ({ ...route, policy: { ...route.policy, maxFallbackAttempts: 0 }, executionPolicy: { ...route.executionPolicy,
            computeBudget: { ...route.executionPolicy.computeBudget, localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs } } } }),
        responseBody: () => ({ id: 'appraisal-model-response', status: 'completed', output: [{ id: 'appraisal-model-message', type: 'message', status: 'completed', role: 'assistant',
            content: [{ type: 'output_text', text: JSON.stringify(mutateCandidate(appraisalCandidate(product))), annotations: [] }] }],
        ...usage ? { usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } } : {} }),
    });
    const sessionId = f.base.session.sessionId, slotBindings = { structured: { scope: 'player', runtimeRouteId: f.route.runtimeRouteId } };
    return { ...f, get host() { return f.host; }, get core() { return f.core; }, get authority() { return f.authority; }, get effectRef() { return f.effectRef; },
        actorId: product.actorId, otherActorId: product.otherActorId,
        run: async () => f.host.executeLifecycle(f.h.handle, { sessionId, revisionId: (await f.core.observe(f.h.handle, sessionId)).revision.revisionId, slotBindings }) };
}
