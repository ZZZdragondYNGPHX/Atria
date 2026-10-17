import { rpModelFixture } from '../native-orchestration/helpers/rp-model-fixture.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { EvolutionEvaluator } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { createFrozenEvaluationBridge } from '../../src/native/agent-intelligence/evaluation/worker-bridge.js';
import { runRp as consumeNativeRp } from '../../src/native/agent-intelligence/evaluation/native-adapters.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
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
    const dispatched = new Map();
    try {
        const revision = await f.plans.getRevision(f.h.handle, f.planRef);
        const nativePlan = { planRef: f.planRef, revision, sourceSelector: f.sourceSelector };
        const config = await new EvolutionEvaluator({ host: f.host }).configuration(f.h.handle, f.input.routeRef.runtimeRouteId, null, nativePlan);
        bridge = await createFrozenEvaluationBridge(config, async packet => {
            const requestId = capture.refs.requestIds.at(-1);
            if (!requestId) throw new Error('Native evaluation request identity missing');
            evaluation?.beforeSend(requestId);
            if (!evaluation?.bridge) { dispatched.set(requestId, packet.rendered); return { choices: [{ message: { role: 'assistant', content: fixture.reply }, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 } }; }
            let result;
            try { result = await evaluation.bridge.rp({ requestId, trialId: capture.trialId, fixtureHash: entry.fixtureHash,
                messages: packet.rendered.body.messages, tools: [], signal: undefined });
            } finally {
                if (evaluation.bridge.observations().some(item => item.requestId === requestId)) dispatched.set(requestId, packet.rendered);
            }
            return { choices: [{ message: { role: 'assistant', content: result.response.assistantText }, finish_reason: 'stop' }],
                ...(result.response.usage ? { usage: { prompt_tokens: result.response.usage.inputTokens, completion_tokens: result.response.usage.outputTokens,
                    total_tokens: result.response.usage.totalTokens } } : {}) };
        }, { nativePlan });
        const adapted = { ...capture, evidence: [], observe: (name, ...args) => { if (name === 'isolation' || entry.expectedInvariants.includes(name)) capture.observe(name, ...args); } };
        let executionError;
        try { await consumeNativeRp(entry, fixture, adapted, { bridge, settings: { ...settings, nativePlan, runtimeRouteId: config.route.runtimeRouteId } }); }
        catch (error) { executionError = error; }
        // A rejected send still has an accepted Native invocation. Read its
        // original durable Attempt instead of inventing a variant association.
        const runs = new RunRepository({ engine: bridge.native.store.engine,
            authorize: async ({ handle, operation }) => { if (handle !== bridge.native.store.handle || operation !== 'runs.get') throw new Error('Fixture read ownership mismatch'); },
            admit: async () => { throw new Error('Fixture observer cannot admit'); },
            assertWriter: async () => { throw new Error('Fixture observer cannot write'); } });
        const owner = bridge.native.store.handle;
        const observed = await bridge.native.store.engine.withTransaction(owner, async tx => {
            const roots = await tx.listResources({ kind: K.orchestrationRun, handle: owner });
            return Promise.all(roots.map(async ({ doc }) => ({ runId: doc.runId,
                attempts: (await tx.listResources({ kind: K.orchestrationRecord, handle: owner, runId: doc.runId, recordType: 'attempt' })).map(item => item.doc),
                effects: (await tx.listResources({ kind: K.orchestrationRecord, handle: owner, runId: doc.runId, recordType: 'effect' })).map(item => item.doc) })));
        });
        capture.nativeEffects = observed.flatMap(item => item.effects.map(effect => ({ effectId: effect.effectId, runId: effect.runId,
            action: effect.actionRef.kind, capability: effect.capability, status: effect.status })));
        capture.refs.effectIds.splice(0, capture.refs.effectIds.length, ...capture.nativeEffects.map(effect => effect.effectId));
        capture.prompts.splice(0, capture.prompts.length, ...dispatched.values());
        capture.refs.requestIds.splice(0, capture.refs.requestIds.length, ...dispatched.keys());
        for (const item of observed) {
            const root = await runs.get(owner, item.runId), source = root.sourceBinding.sourceRequest.source;
            if (!capture.refs.runIds.includes(root.runId)) capture.refs.runIds.push(root.runId);
            const requestIds = [...new Set(item.attempts.flatMap(attempt => attempt.inputRefs.map(ref => ref.requestId)).filter(id => dispatched.has(id)))];
            capture.refs.messageVariants.push({ messageId: source.input.messageId, variantId: String(source.input.variantId), runId: root.runId, requestIds });
        }
        if (adapted.artifact) {
            const root = await runs.get(owner, capture.refs.runIds.at(-1));
            capture.artifact = { domain: 'rp_chat', output: adapted.artifact.output, status: root.status, sourceHash: hash(fixture),
                outcomeHash: hash({ mes: adapted.artifact.output, extra: { reasoning: '' }, is_user: false }), requestHashes: capture.prompts.map(hash),
                targetConsumed: adapted.artifact.targetConsumed && capture.prompts.every(prompt => canonical(prompt).includes(settings.rpPrompt)) };
            capture.finalTextStatus = capture.artifact.targetConsumed ? 'passed' : 'failed'; capture.reviewStatus = 'not_run';
            if (!capture.artifact.targetConsumed && !executionError) executionError = Object.assign(new Error('Native evaluation incomplete'), { code: 'native_orchestration_evaluation_incomplete' });
        }
        if (executionError) throw executionError;
    } finally { await bridge?.cleanup(); await f.cleanup(); }
}
