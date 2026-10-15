import http from 'node:http';
import { NativeGenerationHost } from '../../../src/native/adapters/generation-host.js';
import { ModelPort } from '../../../src/native/orchestration/model-port.js';
import { NativeNarratorOrchestrationAuthority } from '../../../src/native/orchestration/native-turn-orchestration.js';
import { createOrchestrationAuthoringService } from '../../../src/native/orchestration/authoring-service.js';
import { validationDigest } from '../../../src/native/orchestration/plan-repository.js';
import { RouteResolver } from '../../../src/native/model-prompt-runtime/route-resolver.js';
import { NativeModelPromptPersistence, VersionedJsonResourceHandler } from '../../../src/native/model-prompt-runtime/persistence.js';
import { createResponsesGenerationProvider } from '../../../src/native/adapters/responses-generation-provider.js';
import { attachNativeHostLifecycle } from '../../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { installCognitionFixture } from '../../native/helpers/cognition-fixture.js';
import { services } from '../../native/helpers/session-fixture.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { cancelSessionMaintenance } from '../../../src/native/session-maintenance.js';
import { planFixture, prepareControllerOwnerRoot } from '../fixtures.js';

const id = kind => createNativeId('orchestration' + kind);
const limits = { maxRequests: 4, maxTokens: 32000, localWork: { maxJobs: 32, maxItems: 100, maxInputBytes: 16777216 } };

// Native Host, narrator producer, Binding/Plan, Provider HTTP/private lease,
// original bank and Effect writer are real. The remote response is synthetic.
export async function modelPortFixture(make, { usage = true, failure = false, changeContract = () => {}, beforeBase = async () => {}, changeRoute = route => route } = {}) {
    const h = await make(), requests = [], chunks = []; let coldEngine, core, host, authority, port, effectRef;
    let afterSend = async () => {}, captureScope = null, transformRender = rendered => rendered;
    const server = http.createServer(async (req, res) => {
        const parts = []; for await (const part of req) parts.push(part);
        requests.push(JSON.parse(Buffer.concat(parts).toString())); await afterSend();
        res.writeHead(failure ? 503 : 200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: 'native-response', status: 'completed', output: [{ id: 'native-message', type: 'message', status: 'completed', role: 'assistant',
            content: [{ type: 'output_text', text: 'Synthetic native narrator response.', annotations: [] }] }],
        ...(usage ? { usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } } : {}) }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        await prepareControllerOwnerRoot(h.dirs.root); attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const f = await installCognitionFixture(h, 'limited', null, ({ contract }) => {
            contract.taskRuntime.turn = { policy: 'authority-first', stages: [] };
            changeContract(contract);
        });
        core = f.core;
        await beforeBase({ fixture: f, core, handle: h.handle });
        const base = await core.observe(h.handle, f.snapshot.session.sessionId);
        const seeded = await seedGenerationProfiles({ ...h, format: 'openai-responses', endpoint: `http://127.0.0.1:${server.address().port}/v1/responses` });
        await seeded.persistence.saveRuntimeRoute(h.handle, changeRoute({ ...seeded.routes[0], executionPolicy: { schemaVersion: 1,
            allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: limits } }));
        const originalProvider = createResponsesGenerationProvider();
        const providers = { 'provider.openai-responses': { ...originalProvider,
            renderRequest: async args => transformRender(await originalProvider.renderRequest(args)) } };
        const rebuild = (engine, persistence, library) => {
            host = new NativeGenerationHost({ persistence, library, sessionCore: core, providers, secretPort: { resolveSecret: async () => 'synthetic-model-secret' } });
            const modelResolver = new RouteResolver({ persistence, library, providers });
            const { plans } = createOrchestrationAuthoringService(engine, { sessionCore: core, modelResolver });
            authority = new NativeNarratorOrchestrationAuthority({ engine, sessionCore: core, plans, modelResolver });
            port = new ModelPort({ host, ...authority.execution }); authority.setModelPort(port); host.turnOrchestration = authority;
            const originalPrepare = authority.prepareNarrator.bind(authority), originalObserve = authority.execution.effects.observe.bind(authority.execution.effects);
            const prepareEffect = authority.execution.effects.prepare.bind(authority.execution.effects);
            authority.execution.effects.prepare = (handle, input) => { effectRef = { runId: input.runId, effectId: input.effectId }; return prepareEffect(handle, input); };
            authority.prepareNarrator = async args => { const scope = await originalPrepare(args); captureScope = scope; return scope; };
            authority.execution.effects.observe = (handle, input) => { effectRef = { runId: input.runId, effectId: input.effectId }; return originalObserve(handle, input); };
            return plans;
        };
        const plans = rebuild(h.engine, seeded.persistence, seeded.library), plan = planFixture(), output = plan.definition.nodes[0], nodeId = id('Node');
        plan.definition.nodes = [{ nodeId, kind: 'agent', label: 'Original narrator', inputs: [], outputs: [{ name: 'text', type: 'text', required: false }],
            dependencyPinIds: ['narrator.route'], capabilities: ['generation.send'], policy: { agentPinId: 'narrator.route' } },
        { ...output, inputs: [{ name: 'text', type: 'text', required: true }] }];
        plan.definition.entryNodeIds = [nodeId]; plan.definition.capabilityCeiling = ['generation.send'];
        plan.definition.edges = [{ edgeId: id('Edge'), from: { nodeId, port: 'text' }, to: { nodeId: output.nodeId, port: 'text' }, condition: 'always', maxVisits: 1, loopBack: false }];
        const route = await seeded.persistence.getRuntimeRoute(h.handle, seeded.routes[0].runtimeRouteId);
        plan.dependencyPins = [{ pinId: 'narrator.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, integrity: hash(route) }];
        plan.definition.limits.maxSteps = 50;
        const draft = await plans.create(h.handle, id('Command'), plan), expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
        const report = await plans.validate(h.handle, expected), { planRef } = await plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) });
        const sourceSelector = { domain: 'native_session', sessionId: base.session.sessionId, entryPointId: null };
        await plans.saveBinding(h.handle, id('Command'), { sourceSelector, planRef, expectedVersion: null });
        const input = { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, invocationId: 'sealed-narrator' };
        return { h, requests, chunks, input, base, seeded, plans, sourceSelector, planRef, route, plan, write: f.write,
            get core() { return core; }, get host() { return host; }, get authority() { return authority; }, get port() { return port; },
            get effectRef() { return effectRef; }, get scope() { return captureScope; },
            captureEffect: input => { effectRef = { runId: input.runId, effectId: input.effectId }; },
            render: callback => { transformRender = callback; },
            onResponse: callback => { afterSend = callback; },
            start: () => host.executeTurn(h.handle, input, undefined, chunk => chunks.push(chunk)),
            observe: () => port.observe(h.handle, effectRef),
            cold: async () => {
                cancelSessionMaintenance(f.sessionRepo, h.handle, base.session.sessionId);
                await h.engine.close(); coldEngine = new h.engine.constructor({ url: h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => h.dirs });
                attachNativeHostLifecycle(coldEngine, { directoriesByHandle: () => h.dirs }); core = services(h, coldEngine).core;
                rebuild(coldEngine, new NativeModelPromptPersistence({ engine: coldEngine }), new VersionedJsonResourceHandler({ engine: coldEngine }));
            },
            cleanup: async () => { cancelSessionMaintenance(f.sessionRepo, h.handle, base.session.sessionId); server.closeAllConnections();
                await new Promise(resolve => server.close(resolve)); await coldEngine?.close(); await h.engine.close(); await h.cleanup(); } };
    } catch (error) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.engine.close(); await h.cleanup(); throw error; }
}
