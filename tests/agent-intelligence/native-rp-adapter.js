import { rpModelFixture } from '../native-orchestration/helpers/rp-model-fixture.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { EvolutionEvaluator } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { createFrozenEvaluationBridge } from '../../src/native/agent-intelligence/evaluation/worker-bridge.js';
import { runRp as consumeNativeRp } from '../../src/native/agent-intelligence/evaluation/native-adapters.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { BASE_SETTINGS } from './evaluation-settings.js';
import { hash, canonical } from './cases.js';

// Historical report consumer, backed by the current isolated Native RP consumer.
// The bridge carries public synthetic responses only; no production writer or Secret.
export async function runRp(entry, fixture, capture, evaluation = null) {
    const settings = evaluation?.settings ?? BASE_SETTINGS;
    const f = await rpModelFixture(makeTempFsEngine, { configurePlan: async (plan, { h, host, route, seeded }) => {
        const revision = 'fixture-' + hash(settings.rpPrompt).slice(0, 16);
        const module = { ...seeded.module, revision, body: settings.rpPrompt };
        const program = { ...seeded.prompt, revision, stages: seeded.prompt.stages.map(stage => ({ ...stage,
            moduleRefs: stage.moduleRefs.map(ref => ({ ...ref, revision })) })) };
        await host.library.commit(h.handle, 'core.prompt-module', module);
        await host.library.commit(h.handle, 'core.prompt-program', program);
        const nextRoute = await host.persistence.saveRuntimeRoute(h.handle, { ...route,
            promptProgramRef: { ...route.promptProgramRef, revision } });
        plan.dependencyPins[0].integrity = hashNativeDocument(nextRoute);
        const output = plan.definition.nodes.at(-1);
        output.capabilities = ['chat.output'];
        plan.definition.capabilityCeiling.push('chat.output');
        Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
    } });
    let bridge;
    try {
        const revision = await f.plans.getRevision(f.h.handle, f.planRef);
        const nativePlan = { planRef: f.planRef, revision, sourceSelector: f.sourceSelector };
        const config = await new EvolutionEvaluator({ host: f.host }).configuration(f.h.handle, f.input.routeRef.runtimeRouteId, null, nativePlan);
        bridge = await createFrozenEvaluationBridge(config, async packet => {
            const requestId = 'native-evaluation:' + capture.trialId + ':' + (capture.prompts.length);
            evaluation?.beforeSend(requestId);
            if (!evaluation?.bridge) return { choices: [{ message: { role: 'assistant', content: fixture.reply }, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 } };
            const result = await evaluation.bridge.rp({ requestId, trialId: capture.trialId, fixtureHash: entry.fixtureHash,
                messages: packet.rendered.body.messages, tools: [], signal: undefined });
            return { choices: [{ message: { role: 'assistant', content: result.response.assistantText }, finish_reason: 'stop' }],
                ...(result.response.usage ? { usage: { prompt_tokens: result.response.usage.inputTokens, completion_tokens: result.response.usage.outputTokens,
                    total_tokens: result.response.usage.totalTokens } } : {}) };
        }, { nativePlan });
        const adapted = { ...capture, evidence: [], observe: (name, ...args) => { if (name === 'isolation' || entry.expectedInvariants.includes(name)) capture.observe(name, ...args); } };
        await consumeNativeRp(entry, fixture, adapted, { bridge, settings: { ...settings, nativePlan, runtimeRouteId: config.route.runtimeRouteId } });
        capture.artifact = { domain: 'rp_chat', output: adapted.artifact.output, status: 'unavailable', sourceHash: hash(fixture),
            outcomeHash: hash({ mes: adapted.artifact.output, extra: { reasoning: '' }, is_user: false }), requestHashes: capture.prompts.map(hash),
            targetConsumed: adapted.artifact.targetConsumed && capture.prompts.every(prompt => canonical(prompt).includes(settings.rpPrompt)) };
        const runs = new RunRepository({ engine: bridge.native.store.engine,
            authorize: async ({ handle, operation }) => { if (handle !== bridge.native.store.handle || operation !== 'runs.get') throw new Error('Fixture read ownership mismatch'); },
            admit: async () => { throw new Error('Fixture observer cannot admit'); },
            assertWriter: async () => { throw new Error('Fixture observer cannot write'); } });
        // Native cancellation stops the old attempt at the send boundary.
        // Its accepted invocation remains in variant_identity evidence, while
        // generation metrics count only requests whose provider body was sent.
        const invoked = [...capture.refs.requestIds];
        const sent = invoked.slice(-capture.prompts.length);
        capture.refs.requestIds.splice(0, invoked.length, ...sent);
        for (const [index, runId] of capture.refs.runIds.entries()) {
            const root = await runs.get(bridge.native.store.handle, runId), source = root.sourceBinding.sourceRequest.source;
            capture.artifact.status = root.status;
            capture.refs.messageVariants.push({ messageId: source.input.messageId, variantId: String(source.input.variantId),
                runId, requestIds: sent.includes(invoked[index]) ? [invoked[index]] : [] });
        }
        capture.finalTextStatus = adapted.artifact.targetConsumed ? 'passed' : 'failed'; capture.reviewStatus = 'not_run';
    } finally { await bridge?.cleanup(); await f.cleanup(); }
}
