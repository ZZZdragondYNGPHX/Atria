import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { createNativeId, GenerationService, PromptCompiler, ProviderFailure, RouteResolver } from '../../src/native/index.js';
import { GenerationError } from '../../src/native/model-prompt-runtime/execution-utils.js';
import { createGenerationProviderAdapter } from '../../src/native/adapters/generation-provider.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
const ref = prompt => ({ scope: 'library', resourceType: 'core.prompt-program', resourceId: prompt.promptProgramId, revision: prompt.revision });
const capability = (state, name = 'generation.tools') => ({ capability: name, state, provenance: [{ kind: 'adapter-metadata', source: 'fixture' }] });

async function fixture({ fallback = true, policy = true } = {}) {
    const h = await makeTempFsEngine(); cleanups.push(h.cleanup);
    const seeded = await seedGenerationProfiles({ ...h, endpoint: 'https://first.invalid/v1', roles: ['writer'] });
    const { persistence, library, connection, model, prompt, generation } = seeded;
    const connectionB = { ...connection, connectionProfileId: createNativeId('connectionProfile'), endpoint: 'https://second.invalid/v1' };
    const modelB = { ...model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'fallback-model',
        connectionProfileRef: { scope: 'player', connectionProfileId: connectionB.connectionProfileId } };
    await persistence.saveConnectionProfile(h.handle, connectionB);
    await persistence.saveModelProfile(h.handle, modelB);
    const nodeModule = { ...seeded.module, promptModuleId: createNativeId('promptModule'), body: 'Node writing behavior {{param.tone}}.' };
    const nodePrompt = { ...prompt, promptProgramId: createNativeId('promptProgram'), parameters: { tone: { type: 'string', default: 'calm' } },
        stages: [{ stageId: 'stage.main', moduleRefs: [{ scope: 'library', resourceType: 'core.prompt-module', resourceId: nodeModule.promptModuleId, revision: 'r1' }] }] };
    const promptB = { ...prompt, promptProgramId: createNativeId('promptProgram') };
    for (const resource of [nodeModule, nodePrompt, promptB]) await library.commit(h.handle, resource.promptModuleId ? 'core.prompt-module' : 'core.prompt-program', resource);
    const routeA = { ...seeded.routes[0] };
    const routeB = { ...routeA, runtimeRouteId: createNativeId('runtimeRoute'), promptProgramRef: ref(promptB),
        modelProfileRef: { scope: 'player', modelProfileId: modelB.modelProfileId }, connectionProfileRef: modelB.connectionProfileRef };
    if (policy) {
        routeA.executionPolicy = { schemaVersion: 1, allowedModelProfileIds: [model.modelProfileId, modelB.modelProfileId],
            computeBudget: { maxRequests: 2, maxTokens: 32000 } };
        routeB.executionPolicy = routeA.executionPolicy;
    }
    routeA.fallbackRouteRefs = [{ scope: 'player', runtimeRouteId: routeB.runtimeRouteId }];
    await persistence.saveRuntimeRoute(h.handle, routeB); await persistence.saveRuntimeRoute(h.handle, routeA);
    const sends = jest.fn(async rendered => {
        if (fallback && rendered.body.model === model.remoteModelId) throw new ProviderFailure('transport');
        return { choices: [{ message: { content: 'ok' } }] };
    });
    const provider = createGenerationProviderAdapter({ format: 'openai-compatible', countTokens: async () => 5, send: sends, parseStream: async value => value });
    const resolver = new RouteResolver({ persistence, library, providers: { 'provider.openai-compatible': provider } });
    const source = { kind: 'task', projectId: createNativeId('project'), revision: 'r1', taskId: 'binding-fixture' };
    const contextProvider = {
        buildRequestContextPlan: jest.fn(async request => ({ schemaVersion: 1, requestId: request.requestId, source,
            items: [{ id: 'fact', kind: 'context.fact', content: 'selected evidence' }], budget: { maxTokens: 14000, reservedOutputTokens: 512 }, provenance: [] })),
        assertCurrent: jest.fn(async () => {}),
    };
    const secretPort = { resolveSecret: jest.fn(async () => 'fixture-credential') };
    const compiler = new PromptCompiler();
    const service = new GenerationService({ resolver, contextProvider, secretPort, preparePrompt: value => compiler.preparePrompt(value), now: () => 1 });
    const selection = { promptProgramRef: ref(nodePrompt), assertCurrent: jest.fn(async () => {}) };
    const request = { handle: h.handle, requestId: 'binding-1', role: 'role.writer', input: 'continue',
        routeRef: { scope: 'player', runtimeRouteId: routeA.runtimeRouteId }, fallbackMode: 'automatic' };
    return { h, seeded, persistence, library, connectionB, modelB, generation, routeA, routeB, nodePrompt,
        provider, resolver, sends, contextProvider, secretPort, service, selection, request };
}

describe('trusted Node Program selection through original GenerationService', () => {
    test('different Route declarations compile the same Host-selected Node Program on fallback', async () => {
        const f = await fixture();
        const result = await f.service.execute(f.request, { programSelection: f.selection });
        expect(result.response.text).toBe('ok');
        expect(result.snapshot.promptProgramRef).toEqual(ref(f.nodePrompt));
        expect(f.sends).toHaveBeenCalledTimes(2);
        expect(f.sends.mock.calls.map(([rendered]) => rendered.body.messages[0].content)).toEqual([
            'Node writing behavior calm.', 'Node writing behavior calm.',
        ]);
        expect(f.selection.assertCurrent.mock.calls.map(([call]) => call.phase)).toEqual(['resolve', 'compile', 'send', 'resolve', 'compile', 'send']);
        expect(result.snapshot.diagnostics.executionPlan.policy.computeBudget).toMatchObject({ maxRequests: 2, maxTokens: 32000 });
    });

    test('normal execute cannot silently switch the Route Program', async () => {
        const f = await fixture({ policy: false });
        await expect(f.service.execute(f.request)).rejects.toMatchObject({ code: 'generation_semantic_authority_changed' });
        expect(f.sends).toHaveBeenCalledTimes(1);
    });

    test('fallback cannot widen network scope even without an explicit execution policy', async () => {
        const f = await fixture({ policy: false });
        await f.persistence.saveConnectionProfile(f.h.handle, { ...f.connectionB, networkPolicy: { region: 'different' } });
        await expect(f.service.execute(f.request, { programSelection: f.selection })).rejects.toMatchObject({ code: 'generation_target_policy_denied' });
        expect(f.sends).toHaveBeenCalledTimes(1);
    });

    test('candidate policy cannot replace the original accepted Compute budget', async () => {
        const f = await fixture();
        f.routeB.executionPolicy = { ...f.routeB.executionPolicy, computeBudget: { maxRequests: 20, maxTokens: 320000 } };
        await f.persistence.saveRuntimeRoute(f.h.handle, f.routeB);
        const result = await f.service.execute(f.request, { programSelection: f.selection });
        expect(result.snapshot.diagnostics.executionPlan.policy.computeBudget).toMatchObject({ maxRequests: 2, maxTokens: 32000 });
    });

    test.each(['tools', 'outputContract'])('fallback cannot change %s authority', async field => {
        const f = await fixture();
        const prepare = f.service.preparePrompt;
        f.service.preparePrompt = async value => ({ ...await prepare(value),
            ...(value.resolved.model.modelProfileId === f.modelB.modelProfileId
                ? field === 'tools' ? { tools: [{ name: 'unapproved-tool' }] } : { outputContract: { type: 'json' } } : {}) });
        await expect(f.service.execute(f.request, { programSelection: f.selection })).rejects.toMatchObject({ code: 'generation_output_authority_changed' });
        expect(f.sends).toHaveBeenCalledTimes(1);
    });

    test('JSON-shaped internal Program selection has no executable Host authority', async () => {
        const f = await fixture();
        await expect(f.service.execute(f.request, { programSelection: { promptProgramRef: ref(f.nodePrompt) } }))
            .rejects.toMatchObject({ code: 'generation_program_authority_required' });
        expect(f.sends).not.toHaveBeenCalled(); expect(f.secretPort.resolveSecret).not.toHaveBeenCalled();
    });

    test('Program selection remains frozen while its currentness callback awaits', async () => {
        const f = await fixture({ fallback: false });
        f.selection.assertCurrent.mockImplementation(async () => { f.selection.promptProgramRef = f.routeB.promptProgramRef; });
        const result = await f.service.execute(f.request, { programSelection: f.selection });
        expect(result.snapshot.promptProgramRef).toEqual(ref(f.nodePrompt));
    });

    test.each([
        ['role', 'generation_route_mismatch', async f => {
            const read = f.persistence.getRuntimeRoute.bind(f.persistence);
            jest.spyOn(f.persistence, 'getRuntimeRoute').mockImplementation(async (handle, id) => {
                const value = await read(handle, id);
                return id === f.routeB.runtimeRouteId ? { ...value, role: 'role.editor' } : value;
            });
        }],
        ['capability', 'generation_capability_unsupported', async f => {
            f.routeA.requirements = ['generation.tools']; await f.persistence.saveRuntimeRoute(f.h.handle, f.routeA);
            const primary = { ...f.seeded.model, capabilities: [capability('supported')] };
            await f.persistence.saveModelProfile(f.h.handle, primary);
            await f.persistence.saveModelProfile(f.h.handle, { ...f.modelB, capabilities: [capability('unsupported')] });
        }],
        ['network', 'generation_target_policy_denied', async f => {
            await f.persistence.saveConnectionProfile(f.h.handle, { ...f.connectionB, networkPolicy: { region: 'different' } });
        }],
        ['accepted target policy', 'generation_target_policy_denied', async f => {
            f.routeA.executionPolicy.allowedModelProfileIds = [f.seeded.model.modelProfileId];
            await f.persistence.saveRuntimeRoute(f.h.handle, f.routeA);
        }],
        ['context budget', 'generation_context_budget_exceeded', async f => {
            await f.persistence.saveModelProfile(f.h.handle, { ...f.modelB, limits: { contextTokens: 8, outputTokens: 512 } });
        }],
        ['parameter drift', 'generation_semantic_authority_changed', async f => {
            f.routeB.promptParameters = { tone: 'aggressive' }; await f.persistence.saveRuntimeRoute(f.h.handle, f.routeB);
        }],
    ])('fallback cannot bypass %s', async (_label, code, mutate) => {
        const f = await fixture(); await mutate(f);
        await expect(f.service.execute(f.request, { programSelection: f.selection })).rejects.toMatchObject({ code });
        expect(f.sends).toHaveBeenCalledTimes(1);
    });

    test('legal context reselection on a fallback preserves author semantics', async () => {
        const f = await fixture();
        const original = f.contextProvider.buildRequestContextPlan.getMockImplementation();
        f.contextProvider.buildRequestContextPlan.mockImplementation(async (request, resolved) => ({ ...await original(request),
            items: [{ id: 'fact', kind: 'context.fact', content: resolved.model.remoteModelId === f.modelB.remoteModelId ? 'shorter evidence' : 'longer selected evidence' }] }));
        const result = await f.service.execute(f.request, { programSelection: f.selection });
        expect(result.response.text).toBe('ok');
        expect(f.sends.mock.calls[1][0].body.messages.some(message => message.content.includes('shorter evidence'))).toBe(true);
        expect(f.contextProvider.assertCurrent).toHaveBeenCalledTimes(4);
    });

    test('fallback may drop selected Memory and its Host use policy without changing authored behavior', async () => {
        const f = await fixture();
        const original = f.contextProvider.buildRequestContextPlan.getMockImplementation();
        f.contextProvider.buildRequestContextPlan.mockImplementation(async (request, resolved) => ({ ...await original(request),
            items: resolved.model.modelProfileId === f.modelB.modelProfileId ? [] : [{ id: 'memory:selected', kind: 'context.history',
                content: { role: 'user', content: 'Selected summary' }, provenance: [{ source: 'native.context', ref: 'memory:selected' }] }] }));
        const result = await f.service.execute(f.request, { programSelection: f.selection });
        expect(result.response.text).toBe('ok');
        expect(f.sends.mock.calls[0][0].body.messages.length).toBeGreaterThan(f.sends.mock.calls[1][0].body.messages.length);
        expect(result.snapshot.promptIr.compilation.authoredBehaviorFingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    test.each(['context', 'program'])('%s revocation during Secret resolution blocks Provider send', async source => {
        const f = await fixture({ fallback: false }); let current = true;
        const assertCurrent = async () => { if (!current) throw new GenerationError('generation_source_stale'); };
        if (source === 'context') f.contextProvider.assertCurrent.mockImplementation(assertCurrent);
        else f.selection.assertCurrent.mockImplementation(assertCurrent);
        f.secretPort.resolveSecret.mockImplementation(async () => { current = false; return 'fixture-credential'; });
        await expect(f.service.execute(f.request, { programSelection: f.selection })).rejects.toMatchObject({ code: 'generation_source_stale' });
        expect(f.sends).not.toHaveBeenCalled();
    });

    test('preview revalidates before compile and return, without resolving a Secret or sending', async () => {
        const f = await fixture();
        const result = await f.service.execute(f.request, { preview: true, programSelection: f.selection });
        expect(result.preview).toBe(true);
        expect(f.contextProvider.assertCurrent.mock.calls.map(([call]) => call.phase)).toEqual(['compile', 'preview']);
        expect(f.selection.assertCurrent.mock.calls.map(([call]) => call.phase)).toEqual(['resolve', 'compile', 'preview']);
        expect(f.sends).not.toHaveBeenCalled(); expect(f.secretPort.resolveSecret).not.toHaveBeenCalled();
    });

    test('a source revoked by render is rejected before returning a preview', async () => {
        const f = await fixture();
        f.contextProvider.assertCurrent.mockImplementation(async ({ phase }) => { if (phase === 'preview') throw new GenerationError('generation_source_stale'); });
        await expect(f.service.execute(f.request, { preview: true, programSelection: f.selection })).rejects.toMatchObject({ code: 'generation_source_stale' });
        expect(f.sends).not.toHaveBeenCalled();
    });

    test('draft override port cannot be used by send execution', async () => {
        const f = await fixture();
        await expect(f.service.execute(f.request, { draftOverrides: { resourceOverrides: async value => value.envelope } }))
            .rejects.toMatchObject({ code: 'generation_draft_preview_only' });
        expect(f.sends).not.toHaveBeenCalled();
    });
});
