import http from 'node:http';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { attachNativeHostLifecycle } from '../../../src/storage/native-host-lifecycle.js';
import { NativeGenerationHost } from '../../../src/native/adapters/generation-host.js';
import { NativeToolOrchestrationAuthority } from '../../../src/native/orchestration/native-tool-orchestration.js';
import { createOrchestrationAuthoringService } from '../../../src/native/orchestration/authoring-service.js';
import { captureNativeTool } from '../../../src/native/orchestration/native-tool-contracts.js';
import { validationDigest } from '../../../src/native/orchestration/plan-repository.js';
import { getNativeReviewOrigin } from '../../../src/native/orchestration/review-origin.js';
import { installCognitionFixture } from '../../native/helpers/cognition-fixture.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { createSkillRepository } from '../../../src/skills/repository.js';
import { ExtensionsStore } from '../../../src/native/extensions-store.js';
import { services } from '../../native/helpers/session-fixture.js';
import { NativeModelPromptPersistence, VersionedJsonResourceHandler } from '../../../src/native/model-prompt-runtime/persistence.js';
import { planFixture, prepareControllerOwnerRoot } from '../fixtures.js';

const command = () => createNativeId('orchestrationCommand');
export async function nativeToolFixture(make, protocol = 'mcp', { operation = protocol === 'mcp' ? 'tool' : protocol === 'skill' ? 'read' : 'send', hook = async () => {}, auth = 'none' } = {}) {
    const calls = [], errors = [], secretReads = []; let endpoint, h, authority, host;
    const server = http.createServer(async (req, res) => {
        try {
            const chunks = []; for await (const chunk of req) chunks.push(chunk);
            const body = req.method === 'GET' ? { method: 'GetAgentCard' } : JSON.parse(Buffer.concat(chunks).toString());
            calls.push({ method: body.method, body, authorization: req.headers.authorization });
            const intercepted = await hook(body, req, res); if (intercepted) return;
            if (body.method === 'notifications/initialized') { res.writeHead(202); res.end(); return; }
            const card = { name: 'Synthetic', description: 'fixture', version: '1', supportedInterfaces: [{ url: endpoint, protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
                capabilities: {}, defaultInputModes: ['text/plain'], defaultOutputModes: ['application/json'], skills: [{ id: 'stats', name: 'Stats', description: 'Count', tags: [] }] };
            const task = { id: 'task-1', contextId: 'context-1', status: { state: 'TASK_STATE_WORKING' }, artifacts: [] };
            const results = { initialize: { protocolVersion: '2025-11-25', capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'fixture', version: '1' } },
                'tools/list': { tools: [{ name: 'stats' }] }, 'tools/call': { content: [{ type: 'text', text: 'synthetic public result' }] },
                'resources/list': { resources: [{ uri: 'fixture://public', name: 'Public' }] },
                'resources/read': { contents: [{ uri: 'fixture://public', text: 'synthetic public resource' }] }, SendMessage: { task } };
            res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body.method === 'GetAgentCard' ? card : { jsonrpc: '2.0', id: body.id, result: results[body.method] }));
        } catch (error) { errors.push(error); if (!res.headersSent) res.writeHead(500); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); endpoint = `http://127.0.0.1:${server.address().port}/rpc`;
    try {
        h = await make(); await prepareControllerOwnerRoot(h.dirs.root);
        attachNativeHostLifecycle(h.engine, { directoriesByHandle: h.directoriesByHandle ?? (() => h.dirs) });
        const original = await installCognitionFixture(h, 'limited', undefined, ({ contract }) => {
            contract.informationRuntime.sources.push({ id: 'public-lines', kind: 'timeline', semantic: 'narrative', scopeId: 'session', fields: [['content']] });
            contract.informationRuntime.views.find(view => view.id === 'player').sources.push('public-lines');
        });
        const base = await original.core.appendTimeline(h.handle, original.snapshot.session.sessionId, { role: 'assistant', content: 'synthetic public words' }, { expectedRevisionId: original.snapshot.revision.revisionId });
        const seeded = await seedGenerationProfiles({ ...h, endpoint }), connection = { ...seeded.connection, providerAdapter: 'provider.' + (protocol === 'skill' ? 'mcp' : protocol) };
        await seeded.persistence.saveConnectionProfile(h.handle, connection);
        const limits = { maxRequests: 1, maxTokens: 4096, localWork: { maxJobs: 16, maxItems: 10000, maxInputBytes: 16777216 } };
        const policy = protocol === 'mcp' ? { protocolVersion: '2025-11-25', connectionProfileId: connection.connectionProfileId, toolNames: ['stats'], resourceUris: ['fixture://public'], auth }
            : { protocolVersion: '1.0', connectionProfileId: connection.connectionProfileId, skillIds: ['stats'], auth };
        const route = await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1,
            allowedModelProfileIds: [seeded.model.modelProfileId], ...protocol !== 'skill' ? { [protocol]: policy } : {}, computeBudget: limits } });
        host = new NativeGenerationHost({ ...seeded, sessionCore: original.core, packageInstaller: original.packageInstaller,
            secretPort: { resolveSecret: async ref => { secretReads.push(ref); return 'synthetic-secret'; } } });
        const repository = createSkillRepository(h.dirs.root), extensions = new ExtensionsStore({ engine: h.engine });
        host.skillRepository = () => repository; host.extensions = extensions;
        let skillInput;
        if (protocol === 'skill') {
            const scope = { kind: 'global' };
            await repository.install({ scope, payload: { files: [{ path: 'SKILL.md', encoding: 'utf8', content: '---\nname: guide\ndescription: Synthetic guidance\n---\nText, never Host code.' }] } });
            const entry = await repository.get('guide', scope), pinned = await repository.pin({ scope, name: 'guide', expectedHash: entry.installedHash });
            skillInput = { scope, name: 'guide', version: pinned.version, ...operation === 'read' ? { path: 'SKILL.md', offset: 1, limit: 10 } : {} };
        }
        const ref = { kind: 'native_session_tool', protocol, operation,
            source: { domain: 'native_session', sessionId: base.session.sessionId, branchId: base.revision.branchId, revisionId: base.revision.revisionId },
            input: skillInput ?? { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, viewId: 'player', itemId: 'public-lines:' + base.timeline.at(-1).messageId,
                ...protocol === 'mcp' ? operation === 'tool' ? { toolName: 'stats' } : { resourceUri: 'fixture://public' } : { skillId: 'stats' } } };
        const authoring = createOrchestrationAuthoringService(h.engine, { sessionCore: original.core, toolHost: host });
        const { descriptor } = await captureNativeTool(h.handle, ref, host), plan = planFixture(), output = plan.definition.nodes[0], nodeId = createNativeId('orchestrationNode'), pinId = 'original.tool';
        plan.definition.nodes = [{ nodeId, kind: 'effect', label: 'Original Session restricted Tool', inputs: [], outputs: [{ name: 'result', type: 'json', required: true }],
            dependencyPinIds: [pinId], capabilities: [descriptor.capability], policy: { actionPinId: pinId } }, { ...output, inputs: [{ name: 'result', type: 'json', required: true }] }];
        plan.definition.edges = [{ edgeId: createNativeId('orchestrationEdge'), from: { nodeId, port: 'result' }, to: { nodeId: output.nodeId, port: 'result' }, condition: 'always', maxVisits: 1, loopBack: false }];
        plan.definition.entryNodeIds = [nodeId]; plan.definition.capabilityCeiling = [descriptor.capability];
        plan.definition.limits.maxSteps = 100; Object.assign(plan.definition.outputContract, { resultPolicy: { outputType: 'json', maxBytes: 16384 } });
        plan.dependencyPins = [{ pinId, port: 'tool', resourceRef: ref, integrity: hash(descriptor) }];
        const publish = async (value = plan) => {
            const draft = await authoring.plans.create(h.handle, command(), value), expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
            const report = await authoring.plans.validate(h.handle, expected);
            if (report.status !== 'valid') throw new Error('Tool Plan invalid: ' + JSON.stringify(report.issues));
            return (await authoring.plans.publish(h.handle, command(), { ...expected, validationDigest: validationDigest(report) })).planRef;
        };
        const planRef = await publish(); authority = new NativeToolOrchestrationAuthority({ host, plans: authoring.plans });
        return { h, original, base, get host() { return host; }, ref, descriptor, plan, planRef, authoring, route, seeded, calls, errors, secretReads, connection, publish, repository, extensions,
            get authority() { return authority; }, cold: async ({ reopen = false } = {}) => {
                if (reopen) {
                    await getNativeReviewOrigin(h.engine).close(); await h.engine.close();
                    h.engine = new h.engine.constructor({ url: h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: h.directoriesByHandle ?? (() => h.dirs) });
                    attachNativeHostLifecycle(h.engine, { directoriesByHandle: h.directoriesByHandle ?? (() => h.dirs) });
                    Object.assign(original, services(h));
                    host = new NativeGenerationHost({ persistence: new NativeModelPromptPersistence({ engine: h.engine }), library: new VersionedJsonResourceHandler({ engine: h.engine }),
                        sessionCore: original.core, packageInstaller: original.packageInstaller, secretPort: host.secretPort, skillRepository: () => repository });
                    host.extensions = new ExtensionsStore({ engine: h.engine });
                }
                authority = new NativeToolOrchestrationAuthority({ host });
            },
            prepare: () => authority.prepare(h.handle, { commandId: command(), planRef }), dispatch: p => authority.dispatch(h.handle, { runId: p.runId, effectId: p.effectId }),
            consume: p => authority.consume(h.handle, { runId: p.runId, effectId: p.effectId }),
            cleanup: async () => { await getNativeReviewOrigin(h.engine).close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.engine.close(); await h.cleanup(); } };
    } catch (error) {
        server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h?.engine.close?.(); await h?.cleanup(); throw error;
    }
}
