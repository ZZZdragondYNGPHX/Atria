import { modelPortFixture } from './model-port-fixture.js';
import { installCognitionFixture } from '../../native/helpers/cognition-fixture.js';
import { authorityFixture } from '../../native/helpers/authority-fixture.js';

// Reuse the real original Host/Engine/Route/Provider fixture, replacing only its
// product source/Plan. The HTTP Provider remains a localhost synthetic response.
export async function backgroundModelFixture(make, { effectiveTurns = 4, recurring = false, usage = true, maxBytes = 65536 } = {}) {
    const f = await modelPortFixture(make, {
        createSource: async h => {
            const fixture = await installCognitionFixture(h, 'limited', null, ({ contract, fixture }) => {
                contract.taskRuntime.turn = { policy: 'authority-first', stages: [] };
                contract.taskRuntime.tasks[0].context = ['input', 'projection'];
                contract.lifecycleRuntime.workflows = [];
                contract.lifecycleRuntime.automations = [{ id: 'background-ready', scopeId: 'session', trigger: { kind: 'experience.ready' },
                    action: { kind: 'task', taskId: 'summarize', variantId: 'default', input: {} }, maxCatchUp: 1 }];
                if (recurring) contract.lifecycleRuntime.automations.push({ id: 'background-clock', scopeId: 'session',
                    trigger: { kind: 'world.schedule', clockId: 'world', at: 1, every: 1, catchUp: 'latest' },
                    action: { kind: 'task', taskId: 'summarize', variantId: 'default', input: {} }, maxCatchUp: 1 });
                const counter = { type: 'object', properties: { effectiveTurns: { type: 'integer', minimum: 0, maximum: 1000000 } }, required: ['effectiveTurns'], additionalProperties: false };
                contract.lifecycleRuntime.domains.push({ id: 'progress', scopeId: 'session', schemaVersion: 1, recordSchema: counter, initial: { effectiveTurns },
                    commands: [{ id: 'advance', argsSchema: counter, event: 'progress.changed', assign: { effectiveTurns: { formula: 'args.effectiveTurns' } } }],
                    retention: { maxItems: 32, maxLogicalBytes: 16384, keepPinned: true, keepReferenced: true } });
                contract.capabilities.push({ id: 'generation-budget', version: 1, required: true });
                contract.capabilities.push({ id: 'authority-transaction', version: 1, required: true });
                contract.authorityRuntime = authorityFixture().contract.authorityRuntime;
                contract.authorityRuntime.intentObservation.viewIds = ['player'];
                fixture.manifest.entryPoints[0].runtime = { game: { logic: 'logic.json' } };
                const { logic } = authorityFixture();
                Object.assign(logic.transactions[0], { reads: [], validators: [], effects: [], derivedPublications: [] });
                logic.derivedPublications = [];
                fixture.sourceFiles = new Map([['logic.json', Buffer.from(JSON.stringify(logic))]]);
                contract.generationBudget = { schemaVersion: 1, resolverAttempts: 2, narratorAttempts: 2, turnAttempts: 4,
                    backgroundAttempts: 1, backgroundWindowTurns: 4, backgroundPeriodTurns: 20, backgroundPeriodAttempts: 2,
                    turnCounter: { domainId: 'progress', recordId: 'main', field: 'effectiveTurns' } };
            });
            let base = fixture.snapshot;
            base = await fixture.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 'progress-init',
                action: { kind: 'app.command', domainId: 'progress', recordId: 'main', commandId: 'advance', args: { effectiveTurns } } }, { expectedRevisionId: base.revision.revisionId });
            base = await fixture.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 'background-ready',
                action: { kind: 'experience.ready' } }, { expectedRevisionId: base.revision.revisionId });
            return { ...fixture, snapshot: base };
        },
        configurePlan: async ({ plan, route }) => {
            plan.definition.nodes[0].outputs[0].type = 'json'; plan.definition.nodes[1].inputs[0].type = 'json';
            plan.definition.outputContract.resultPolicy = { outputType: 'json', maxBytes };
            plan.definition.limits.maxSteps = 50;
        },
        changeRoute: route => ({ ...route, policy: { ...route.policy, maxFallbackAttempts: 0 } }),
        responseBody: async () => ({ id: 'native-response', status: 'completed', output: [{ id: 'native-message', type: 'message', status: 'completed', role: 'assistant',
            content: [{ type: 'output_text', text: JSON.stringify({ text: 'Original background artifact' }), annotations: [] }] }],
        ...(usage ? { usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } } : {}) }),
    });
    const intent = f.base.states.atri_lifecycle.outbox.find(item => item.status === 'pending');
    const input = { sessionId: f.base.session.sessionId, revisionId: f.base.revision.revisionId,
        slotBindings: { structured: { scope: 'player', runtimeRouteId: f.route.runtimeRouteId } } };
    let serial = 0;
    return { ...f, get host() { return f.host; }, get core() { return f.core; }, get authority() { return f.authority; },
        get port() { return f.port; }, get effectRef() { return f.effectRef; }, intent, backgroundInput: input,
        run: async () => f.host.executeLifecycle(f.h.handle, { ...input, revisionId: (await f.core.observe(f.h.handle, input.sessionId)).revision.revisionId }),
        command: async action => f.core.applyLifecycleCommand(f.h.handle, input.sessionId,
            { type: 'lifecycle', invocationId: 'background-test-' + ++serial, action },
            { expectedRevisionId: (await f.core.observe(f.h.handle, input.sessionId)).revision.revisionId }),
        direct: overrides => f.host.executeTask(f.h.handle, { sessionId: input.sessionId, revisionId: input.revisionId,
            taskId: intent.taskId, variantId: intent.variantId, invocationId: intent.invocationId, input: intent.input,
            slotBindings: input.slotBindings, ...overrides }) };
}
