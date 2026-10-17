import { modelPortFixture } from './model-port-fixture.js';
import { installAppraisalFixture, appraisalCandidate } from '../../native/helpers/appraisal-fixture.js';

export async function appraisalModelFixture(make, { usage = true, maxJobs = 32, afterAppraisalText = null, mutateCandidate = value => value,
    configureSource = () => {}, queueSource = product => product.queue(), configurePlan = async () => {}, memorySettings = null } = {}) {
    let product;
    const f = await modelPortFixture(make, { memorySettings,
        createSource: async h => {
            product = await installAppraisalFixture(h, { publicAppraisal: true, configure: ({ contract }) => {
                contract.taskRuntime.turn = { policy: 'authority-first', stages: [] };
                configureSource({ contract });
            } });
            await product.ready(); const queued = await queueSource(product, h);
            return { ...product, snapshot: queued };
        }, configurePlan: async args => {
            const { plan } = args;
            plan.definition.nodes[0].outputs[0].type = 'json'; plan.definition.nodes[1].inputs[0].type = 'json';
            plan.definition.outputContract.resultPolicy = { outputType: 'json', maxBytes: 65536 };
            plan.definition.limits.maxSteps = 50;
            await configurePlan(args);
        }, changeRoute: route => ({ ...route, policy: { ...route.policy, maxFallbackAttempts: 0 }, executionPolicy: { ...route.executionPolicy,
            computeBudget: { ...route.executionPolicy.computeBudget, localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs } } } }),
        responseBody: ({ index }) => ({ id: 'appraisal-model-response', status: 'completed', output: [{ id: 'appraisal-model-message', type: 'message', status: 'completed', role: 'assistant',
            content: [{ type: 'output_text', text: index > 0 && afterAppraisalText !== null ? afterAppraisalText : JSON.stringify(mutateCandidate(appraisalCandidate(product))), annotations: [] }] }],
        ...usage ? { usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } } : {} }),
    });
    const sessionId = f.base.session.sessionId, slotBindings = { structured: { scope: 'player', runtimeRouteId: f.route.runtimeRouteId } };
    return { ...f, get host() { return f.host; }, get core() { return f.core; }, get authority() { return f.authority; }, get effectRef() { return f.effectRef; },
        actorId: product.actorId, otherActorId: product.otherActorId,
        run: async () => f.host.executeLifecycle(f.h.handle, { sessionId, revisionId: (await f.core.observe(f.h.handle, sessionId)).revision.revisionId, slotBindings }) };
}
