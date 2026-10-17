import { rpModelFixture } from './rp-model-fixture.js';
import { PromptPresetStore } from '../../../src/native/model-prompt-runtime/presets.js';
import { AgentEvolutionService } from '../../../src/native/agent-intelligence/evolution-service.js';
import { NativeTaskScheduler } from '../../../src/native/task-scheduler.js';
import { AgentEvidenceRepository } from '../../../src/native/agent-intelligence/evidence-repository.js';
import { AgentEvidenceService } from '../../../src/native/agent-intelligence/evidence-service.js';
import { RpEvidenceCaptureService } from '../../../src/native/agent-intelligence/rp-capture-service.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { projectModelFixture } from './project-model-fixture.js';
import { configureProjectToolPlan } from './project-tool-fixture.js';
import { createNativeId } from '../../../src/native/identity.js';

export async function projectEvolutionAutoFixture(make) {
    const f = await projectModelFixture(make, { format: 'openai-compatible', maxModelRounds: 3, configurePlan: async args => {
        await configureProjectToolPlan(['atri_agent_get_project', 'atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review'])(args);
        Object.assign(args.plan.definition.outputContract, { kind: 'project_review', resultPolicy: { outputType: 'json', maxBytes: 16384 } });
        const node = args.plan.definition.nodes[0]; node.inputs.push({ name: 'continuation', type: 'json', required: false });
        args.plan.definition.edges.push({ edgeId: createNativeId('orchestrationEdge'), from: { nodeId: node.nodeId, port: 'response' },
            to: { nodeId: node.nodeId, port: 'continuation' }, condition: 'always', maxVisits: 2, loopBack: true });
    } });
    try {
        const handle = f.h.handle, scope = { domain: 'project', projectId: f.projectId }, subject = f.projectId;
        const service = new AgentEvolutionService({ host: f.host, scheduler: new NativeTaskScheduler({ concurrency: 1, retries: 0 }) });
        const reference = (await service.experience.target(handle, { kind: 'project_task', id: f.task.taskId, scope })).target;
        await service.experience.submit(handle, { target: reference, expectedSequence: null,
            feedback: { kind: 'explicit', signal: 'correction', dimension: 'behavior', note: 'Synthetic owner configuration test against the actual persisted Project Task.' } });
        const choice = (await service.targets.catalog(handle, scope, subject)).find(choice => choice.target.fieldPath === 'limits.maxSteps');
        await service.declare(handle, { scope, subject, target: choice.target, expectedBaseHash: choice.baseHash });
        await service.budget(handle, { limits: { maxRequests: 100, maxTokens: 1000000, minIntervalMs: 1000 }, expectedSequence: 0 });
        const configured = await service.configure(handle, { scope, subject, target: choice.target, routeId: f.route.runtimeRouteId,
            mode: 'auto', price: null, expectedSequence: 0 });
        return { ...f, service, scope, subject, target: choice.target, configured };
    } catch (error) { await f.cleanup(); throw error; }
}

export async function nativeEvolutionAutoFixture(make, kind = 'plan-strategy', { price = null } = {}) {
    const f = await rpModelFixture(make, {
        configurePlan: async (plan, { h, seeded, route }) => {
            const presets = new PromptPresetStore({ engine: h.engine });
            const saved = await presets.save(h.handle, { format: 'atria.prompt-preset', schemaVersion: 1, programId: seeded.prompt.promptProgramId,
                entries: [{ resourceType: 'core.prompt-module', resource: { ...seeded.module, target: 'system.style' } },
                    { resourceType: 'core.prompt-program', resource: seeded.prompt }, { resourceType: 'core.generation-profile', resource: seeded.generation }] });
            const preset = await presets.get(h.handle, saved.presetId);
            const selected = { ...route, promptProgramRef: preset.refs.find(ref => ref.resourceType === 'core.prompt-program'),
                generationProfileRef: preset.refs.find(ref => ref.resourceType === 'core.generation-profile') };
            await seeded.persistence.saveRuntimeRoute(h.handle, selected);
            plan.dependencyPins[0].integrity = hash(await seeded.persistence.getRuntimeRoute(h.handle, selected.runtimeRouteId));
            plan.definition.nodes.find(node => node.kind === 'output').capabilities = ['chat.output'];
            plan.definition.capabilityCeiling.push('chat.output');
            Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
        },
        responsePayload: body => {
            let input;
            try { input = JSON.parse(body.messages.at(-1).content); } catch { return 'The actor waits for your decision.'; }
            if (input?.allowedDeclaration) return JSON.stringify(typeof input.base === 'number'
                ? { value: input.base - 1, rationale: 'Synthetic local tighter bound; not independent quality evidence.' }
                : { edits: [{ before: '', after: '\nKeep the player decision unresolved.' }], rationale: 'Synthetic local style hypothesis; not independent quality evidence.' });
            if (input?.dimensions) return JSON.stringify({ preference: 'tie', deltas: Object.fromEntries(input.dimensions.map(dimension => [dimension, 0])), rationale: 'Synthetic tie; no observed improvement claim.' });
            return 'The actor waits for your decision.';
        },
    });
    try {
        const handle = f.h.handle, result = await f.run(), scope = { domain: 'rp_chat', ...f.locator, groupId: '' }, subject = f.locator.charDir;
        const service = new AgentEvolutionService({ host: f.host, chatRepo: f.chats, scheduler: new NativeTaskScheduler({ concurrency: 1, retries: 0 }) });
        const evidence = new AgentEvidenceService({ chatRepo: f.chats });
        const capture = new RpEvidenceCaptureService({ repository: new AgentEvidenceRepository({ engine: f.h.engine }), service: evidence });
        const begun = await capture.begin(handle, { scope, rootRunId: result.runId, selectors: [{ kind: 'message', messageId: 'rp1', floor: 1 }] });
        const chat = await f.chats.get(handle, f.locator.charDir, f.locator.name), output = chat.body.at(-1);
        const reference = (await evidence.capture(handle, scope, [{ kind: 'message', messageId: output.memory_os_source_id, floor: 2 }],
            { maxSources: 4, maxBytes: 32768, maxScanMessages: 128 })).references[0];
        await capture.update(handle, { evidenceId: begun.evidenceId, sequence: 1, status: 'completed',
            trace: { schemaVersion: 1, events: [], missing: 0, reasons: [] }, output: reference });
        const feedbackTarget = (await service.experience.target(handle, { kind: 'evidence', id: begun.evidenceId, scope })).target;
        const experience = await service.experience.submit(handle, { target: feedbackTarget, expectedSequence: null,
            feedback: { kind: 'explicit', signal: 'correction', dimension: 'behavior', note: 'Synthetic owner wiring feedback: preserve the pending player decision.' } });
        const choice = (await service.targets.catalog(handle, scope, subject)).find(choice => choice.target.kind === kind
            && (kind === 'plan-prompt' || choice.target.fieldPath === 'limits.maxSteps'));
        if (!choice) throw new Error('Missing original Native target');
        await service.declare(handle, { scope, subject, target: choice.target, expectedBaseHash: choice.baseHash });
        await service.budget(handle, { limits: { maxRequests: 100, maxTokens: 1000000, minIntervalMs: 1000 }, expectedSequence: 0 });
        const configured = await service.configure(handle, { scope, subject, target: choice.target, routeId: f.input.routeRef.runtimeRouteId,
            mode: 'auto', price, expectedSequence: 0 });
        return { ...f, service, scope, subject, target: choice.target, feedbackId: experience.feedback.at(-1).id, configured };
    } catch (error) { await f.cleanup(); throw error; }
}
