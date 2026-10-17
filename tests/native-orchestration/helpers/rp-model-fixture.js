import http from 'node:http';
import { ChatRepo } from '../../../src/storage/repositories/chat-repo.js';
import { RpRunControl } from '../../../src/native/rp-run-control.js';
import { NativeGenerationHost } from '../../../src/native/adapters/generation-host.js';
import { NativeNarratorOrchestrationAuthority } from '../../../src/native/orchestration/native-turn-orchestration.js';
import { createOrchestrationAuthoringService } from '../../../src/native/orchestration/authoring-service.js';
import { validationDigest } from '../../../src/native/orchestration/plan-repository.js';
import { RouteResolver } from '../../../src/native/model-prompt-runtime/route-resolver.js';
import { createHttpGenerationProvider } from '../../../src/native/adapters/http-generation-provider.js';
import { attachNativeHostLifecycle } from '../../../src/storage/native-host-lifecycle.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { createNativeId } from '../../../src/native/identity.js';
import { nativeTaskScheduler } from '../../../src/native/task-scheduler.js';
import { services } from '../../native/helpers/session-fixture.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { planFixture, prepareControllerOwnerRoot } from '../fixtures.js';
import { NativeMemoryAuthority } from '../../../src/native/memory-authority.js';
import { SettingsRepo } from '../../../src/storage/repositories/settings-repo.js';
import { PROVENANCE_NAMESPACE } from '../../../public/scripts/agents/memory/source-lifecycle.js';
import { emptyProvenance, captureEpisodes } from '../../../public/scripts/agents/memory/source-provenance.js';
import { applyFactOperations } from '../../../public/scripts/agents/memory/atomic-facts.js';

const id = kind => createNativeId('orchestration' + kind);
export const RP_MODEL_TEXT = 'Synthetic original RP response.';

export async function rpModelFixture(make, { memorySettings = null, seedMemory = false, usage = true, totalTokens = 20, configurePlan = null, responsePayload = null } = {}) {
    const h = await make(), requests = [], effects = [], pending = [];
    let respond = async () => {};
    const server = http.createServer(async (req, res) => {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks)); requests.push(body);
        await respond(body);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: responsePayload ? await responsePayload(body, requests.length) : RP_MODEL_TEXT }, finish_reason: 'stop' }],
            ...(usage ? { usage: { total_tokens: totalTokens, prompt_tokens: 12, completion_tokens: totalTokens - 12 } } : {}) }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        await prepareControllerOwnerRoot(h.dirs.root); attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const chats = new ChatRepo({ engine: h.engine }), control = new RpRunControl({ engine: h.engine, chatRepo: chats });
        const locator = { charDir: 'Actor', name: 'main', isGroup: false, groupId: null };
        await chats.save(h.handle, locator.charDir, locator.name, {}, [
            { name: 'Actor', is_user: false, mes: 'Original RP context', memory_os_source_id: 'rp0' },
            { name: 'User', is_user: true, mes: 'Original RP input', memory_os_source_id: 'rp1' },
        ], null);
        const { controlId } = await control.bind(h.handle, locator);
        if (memorySettings) await new SettingsRepo({ engine: h.engine }).save(h.handle, { atri_capabilities: { memory_graph: memorySettings } });
        if (seedMemory) {
            const { body } = await chats.get(h.handle, locator.charDir, locator.name), key = 'rp:' + controlId;
            const state = emptyProvenance(); state.scopeId = key;
            const all = [...body, { name: 'Actor', mes: 'FUTURE FORBIDDEN MEMORY', memory_os_source_id: 'rp-future', is_user: false }];
            const episodeIds = captureEpisodes(state, all, [0, 2], key);
            const written = applyFactOperations(state, [{ action: 'create', type: 'inferred', text: 'Original RP remembered context promise',
                evidence: [{ episodeId: episodeIds[0], excerpt: body[0].mes }] }], { scopeId: key, episodeIds }, all, () => 'rp-memory-fact', 1000);
            const future = applyFactOperations(written.state, [{ action: 'create', type: 'inferred', text: all[2].mes,
                evidence: [{ episodeId: episodeIds[1], excerpt: all[2].mes }] }], { scopeId: key, episodeIds }, all, () => 'rp-memory-future', 1000);
            await chats.setState(h.handle, locator.charDir, locator.name, PROVENANCE_NAMESPACE, future.state);
        }
        const seeded = await seedGenerationProfiles({ ...h, endpoint: `http://127.0.0.1:${server.address().port}/v1/chat/completions` });
        let route = { ...seeded.routes[0], executionPolicy: { schemaVersion: 1,
            allowedModelProfileIds: [seeded.model.modelProfileId], continuity: 'none', reuse: 'disabled',
            computeBudget: { maxRequests: 4, maxTokens: 100000, localWork: { maxJobs: 32, maxItems: 10000, maxInputBytes: 16777216 } } } };
        await seeded.persistence.saveRuntimeRoute(h.handle, route);
        route = await seeded.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId);
        const host = new NativeGenerationHost({ ...seeded, sessionCore: services(h).core,
            providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'synthetic-secret' } });
        const modelResolver = new RouteResolver({ persistence: host.persistence, library: host.library, providers: host.providers });
        const { plans } = createOrchestrationAuthoringService(h.engine, { rpControl: control, modelResolver });
        const authority = new NativeNarratorOrchestrationAuthority({ engine: h.engine, sessionCore: host.sessionCore, rpControl: control, plans, modelResolver,
            memoryAuthority: memorySettings ? new NativeMemoryAuthority({ core: host.sessionCore, settingsRepo: new SettingsRepo({ engine: h.engine }) }) : null });
        host.turnOrchestration = authority;
        const plan = planFixture(), output = plan.definition.nodes[0], nodeId = id('Node');
        plan.definition.nodes = [{ nodeId, kind: 'agent', label: 'RP narrator', inputs: [], outputs: [{ name: 'response', type: 'text', required: false }],
            dependencyPinIds: ['rp.route'], capabilities: ['generation.send'], policy: { agentPinId: 'rp.route' } },
        { ...output, inputs: [{ name: 'response', type: 'text', required: true }] }];
        plan.definition.entryNodeIds = [nodeId]; plan.definition.capabilityCeiling = ['generation.send'];
        plan.definition.edges = [{ edgeId: id('Edge'), from: { nodeId, port: 'response' }, to: { nodeId: output.nodeId, port: 'response' }, condition: 'always', maxVisits: 1, loopBack: false }];
        plan.definition.limits.maxSteps = 50;
        plan.dependencyPins = [{ pinId: 'rp.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, integrity: hash(route) }];
        await configurePlan?.(plan, { h, host, route, seeded });
        const draft = await plans.create(h.handle, id('Command'), plan), expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
        const report = await plans.validate(h.handle, expected);
        if (report.status !== 'valid') throw new Error(JSON.stringify(report.issues));
        const { planRef } = await plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) });
        const sourceSelector = { domain: 'rp_chat', controlId };
        await plans.saveBinding(h.handle, id('Command'), { sourceSelector, planRef, expectedVersion: null });
        const prepare = authority.execution.effects.prepare.bind(authority.execution.effects);
        authority.execution.effects.prepare = async (handle, input) => { const result = await prepare(handle, input); effects.push(input); return result; };
        const input = { controlId, floor: 1, requestId: 'original-rp-request', routeRef: plan.dependencyPins[0].resourceRef };
        const start = async (change = {}) => {
            const operation = await host.startRp(h.handle, { ...input, ...change }); pending.push(operation.result); return operation;
        };
        return { h, host, authority, control, controlId, chats, locator, plans, planRef, sourceSelector, input, requests, effects, ...seeded,
            start, run: async change => (await start(change)).result, onResponse: callback => { respond = callback; },
            cleanup: async () => {
                for (const item of nativeTaskScheduler.operations.values()) if (item.owner === h.handle) nativeTaskScheduler.cancel(h.handle, item.view.operationId);
                await Promise.allSettled(pending); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
                await h.engine.close(); await h.cleanup();
            } };
    } catch (error) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.engine.close(); await h.cleanup(); throw error; }
}
