import { describe, expect, jest, test } from '@jest/globals';
import { createNativeId, assertPromptProgram, PromptCompiler, flattenPromptProgram, createTaskContextProvider,
    createStudioContextProvider, createNativeSessionContextProvider, renderPromptMessages, renderPromptProtocol, GenerationService, VersionedJsonResourceHandler } from '../../src/native/index.js';
import { createNativeSessionContextAdapter } from '../../src/native/adapters/native-session-context.js';
import { createGenerationProviderAdapter } from '../../src/native/adapters/generation-provider.js';
import { evaluateCondition } from '../../src/native/model-prompt-runtime/prompt-values.js';
import { compileNativeContextPlan } from '../../public/scripts/native/context-compiler.js';
import { sessionFixture } from './helpers/session-fixture.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';

const ref = resource => ({ scope: 'library', resourceType: resource.promptProgramId ? 'core.prompt-program' : 'core.prompt-module',
    resourceId: resource.promptProgramId || resource.promptModuleId, revision: resource.revision });
const mod = (body, extra = {}) => ({ schemaVersion: 1, promptModuleId: createNativeId('promptModule'), revision: 'r1', displayName: 'module',
    target: 'system.foundation', stages: ['stage.main'], body, ...extra });
const program = (modules = [], extra = {}) => ({ schemaVersion: 1, promptProgramId: createNativeId('promptProgram'), revision: 'r1', displayName: 'program',
    stages: [{ stageId: 'stage.main', moduleRefs: modules.map(ref) }], ...extra });
const source = { kind: 'task', projectId: createNativeId('project'), revision: 'r1', taskId: 'task-1' };
function args(modules = [], extra = {}) {
    const p = program(modules, extra);
    return { request: { requestId: 'request-1' }, resolved: { route: { promptProgramRef: ref(p) }, resources: [p, ...modules].map(resource => ({ ref: ref(resource), resource })) },
        contextPlan: { schemaVersion: 1, requestId: 'request-1', source,
            items: [{ kind: 'context.fact', id: 'fact-1', content: 'selected fact' }, { kind: 'context.history', content: { role: 'assistant', content: 'earlier' } },
                { kind: 'context.input', content: 'current input' }], budget: { maxTokens: 800, reservedOutputTokens: 100 } } };
}
const compile = value => new PromptCompiler().compile(value);

describe('P3 Prompt compiler', () => {
    test('NPC-001 typed choices select mutually exclusive modules, expose evidence and reject stale values', () => {
        const value = args(['calm', 'fast'].map(mode => mod(mode, { condition: { op: 'eq', path: 'param.mode', value: mode } })), {
            parameters: { mode: { type: 'string', label: 'Writing pace', default: 'calm', options: [{ value: 'calm', label: 'Calm' }, { value: 'fast', label: 'Fast' }] }, enabled: { type: 'boolean', default: false } },
        });
        expect(compile(value).promptIr.directives).toEqual(['calm']);
        value.resolved.route.promptParameters = { mode: 'fast', enabled: true };
        const result = compile(value);
        expect(result.promptIr.directives).toEqual(['fast']);
        expect(result.promptIr.compilation.parameters).toEqual({ mode: 'fast', enabled: true });
        expect(result.promptIr.compilation.modules.map(item => item.status)).toEqual(expect.arrayContaining(['included', 'condition-false']));
        value.request.prompt = { parameters: { mode: 'calm' } };
        expect(compile(value).promptIr.directives).toEqual(['calm']);
        value.request.prompt.parameters.mode = 'removed'; expect(() => compile(value)).toThrow('parameter_option');
        value.request.prompt = { parameters: null }; expect(() => compile(value)).toThrow('parameters_invalid');
        value.request.prompt = {}; value.resolved.route.promptParameters = { obsolete: true }; expect(() => compile(value)).toThrow('parameter_unknown');
    });

    test.each([
        { type: 'string', options: [] },
        { type: 'string', options: [{ value: 'a', label: 'A' }] },
        { type: 'string', default: 'other', options: [{ value: 'a', label: 'A' }] },
        { type: 'boolean', options: [{ value: true, label: 'On' }] },
        { type: 'number', options: [{ value: '1', label: 'One' }] },
        { type: 'string', options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'Again' }] },
        { type: 'string', label: '' },
    ])('NPC-001 rejects invalid authored control metadata %j', definition => {
        expect(() => assertPromptProgram(program([], { parameters: { choice: definition } }))).toThrow();
    });
    test('deterministic immutable IR, semantic positions and request authority', () => {
        const value = args(['system.style', 'context.before_history', 'context.after_history', 'context.before_input', 'context.after_input', 'response.post_history', 'response.prefill']
            .map(target => mod(target, { target })), { responseDirective: { body: 'directive' } });
        value.request.tools = [{ name: 'read-only' }]; value.request.outputContract = { type: 'object' };
        const before = JSON.stringify(value);
        const result = compile(value);
        expect(compile(value)).toEqual(result);
        expect(Object.isFrozen(result.promptIr.contextSlots[0])).toBe(true);
        expect(JSON.stringify(value)).toBe(before);
        expect(renderPromptMessages(result.promptIr).map(item => item.content)).toEqual([
            'system.style', 'selected fact', 'context.before_history', 'earlier', 'context.after_history', 'context.before_input',
            'current input', 'context.after_input', 'response.post_history', 'directive', 'response.prefill',
        ]);
        expect(result.promptIr.tools).toEqual(value.request.tools);
        expect(result.promptIr.outputContract).toEqual(value.request.outputContract);
        expect(result.promptIr.provenance.some(item => item.source === 'prompt.module')).toBe(true);
    });

    test('typed host, program/module parameters and request locals are read-only and isolated', async () => {
        const value = args([mod('{{host.name}} {{param.n}} {{local.memo}} {{module.style}}', {
            parameters: { style: { type: 'string', default: 'calm' } },
        })], { parameters: { n: { type: 'number', required: true } }, locals: { memo: { type: 'string', default: 'scratch' } } });
        const compiler = new PromptCompiler({ hostDefinitions: { name: { type: 'string', required: true } } });
        const requests = ['A', 'B'].map((name, n) => ({ ...value, request: { ...value.request, prompt: { host: { name }, parameters: { n }, locals: { memo: name } } } }));
        const results = await Promise.all(requests.map(item => compiler.preparePrompt(item)));
        expect(results.map(item => item.directives[0])).toEqual(['A 0 A calm', 'B 1 B calm']);
        expect(() => compiler.compile({ ...value, request: { ...value.request, prompt: { host: { name: 'A' }, parameters: { n: 'bad' } } } })).toThrow('parameter_type');
        expect(() => compile(value)).toThrow('parameter_required');
    });

    test.each(['state.hp', 'local.missing', 'host.constructor', 'param.x.__proto__.x', 'secret.value'])('invalid variable %s fails closed', path => {
        expect(() => compile(args([mod('{{' + path + '}}')]))).toThrow('variable_scope');
    });

    test.each([
        [{ op: 'eq', path: 'param.x', value: 3 }, true], [{ op: 'neq', path: 'param.x', value: 3 }, false],
        [{ op: 'gt', path: 'param.x', value: 2 }, true], [{ op: 'gte', path: 'param.x', value: 3 }, true],
        [{ op: 'lt', path: 'param.x', value: 4 }, true], [{ op: 'lte', path: 'param.x', value: 3 }, true],
        [{ op: 'in', path: 'param.x', value: [2, 3] }, true], [{ op: 'exists', path: 'param.x' }, true],
        [{ all: [{ op: 'eq', path: 'param.x', value: 3 }] }, true],
        [{ any: [{ op: 'eq', path: 'param.x', value: 2 }] }, false],
        [{ not: { op: 'eq', path: 'param.x', value: 3 } }, false],
    ])('finite condition %j', (condition, expected) => {
        const result = compile(args([mod('yes', { condition })], { parameters: { x: { type: 'number', default: 3 } } }));
        expect(result.promptIr.directives).toEqual(expected ? ['yes'] : []);
    });

    test('contains is bounded; no ambiguous DSL or unbounded recursion', () => {
        expect(evaluateCondition({ op: 'contains', path: 'param.x', value: 'bc' }, () => 'abcd')).toBe(true);
        expect(evaluateCondition({ op: 'contains', path: 'param.x', value: 3 }, () => [1, 3])).toBe(true);
        expect(() => evaluateCondition({ op: 'contains', path: 'param.x', value: 'a' }, () => 'a'.repeat(4097))).toThrow('condition_limit');
        expect(() => compile(args([mod('yes', { condition: { op: 'exists', path: 'param.x', not: {} } })]))).toThrow('exactly one');
        let condition = { op: 'exists', path: 'param.x' };
        for (let i = 0; i < 18; i++) condition = { not: condition };
        expect(() => compile(args([mod('yes', { condition })]))).toThrow('condition depth');
        expect(() => compile(args([mod('yes', { condition: { op: 'eval', path: 'param.x' } })]))).toThrow('unsupported');
    });

    test('single-parent exact derive: disable, replace, configure, add and no mutation', () => {
        const a = mod('A'); const b = mod('B'); const c = mod('{{module.tone}}', { parameters: { tone: { type: 'string', default: 'old' } } });
        const replacement = mod('replacement'); const added = mod('added');
        const parent = program([a, b, c]);
        const child = program([], { parentRef: ref(parent), derive: [
            { op: 'disable', moduleId: a.promptModuleId }, { op: 'replace', moduleId: b.promptModuleId, replacementRef: ref(replacement) },
            { op: 'configure', moduleId: c.promptModuleId, config: { tone: 'new' } }, { op: 'add', moduleId: added.promptModuleId, replacementRef: ref(added) },
        ] });
        const value = args();
        value.resolved = { route: { promptProgramRef: ref(child) }, resources: [parent, child, a, b, c, replacement, added].map(resource => ({ ref: ref(resource), resource })) };
        const before = JSON.stringify(value);
        expect([...compile(value).promptIr.directives].sort()).toEqual(['added', 'new', 'replacement'].sort());
        expect(JSON.stringify(value)).toBe(before);
        child.derive.push({ op: 'disable', moduleId: a.promptModuleId });
        expect(() => compile(value)).toThrow('derive_operation_conflict');
    });

    test('exact missing revision, cycles, duplicates and illegal configure fail closed', () => {
        const value = args([mod('A')]);
        value.resolved.resources[1].ref.revision = 'missing';
        expect(() => compile(value)).toThrow('exact_resource_missing');
        const cyclic = args(); cyclic.resolved.resources[0].resource.parentRef = cyclic.resolved.route.promptProgramRef;
        expect(() => flattenPromptProgram(cyclic.resolved)).toThrow('derive_cycle');
        const duplicate = args([mod('A')]);
        duplicate.resolved.resources[0].resource.stages[0].moduleRefs.push(duplicate.resolved.resources[1].ref);
        expect(() => compile(duplicate)).toThrow('duplicate_module');
        const invalid = args([mod('A')]);
        invalid.resolved.resources[0].resource.derive = [{ op: 'configure', moduleId: invalid.resolved.resources[1].resource.promptModuleId, config: { tools: [] } }];
        expect(() => compile(invalid)).toThrow('parameter_unknown');
    });

    test('single-model and orchestrated stages project the same resources in declared order', () => {
        const first = mod('first', { stages: ['stage.plan'] });
        const last = mod('{{artifact.outline}} {{local.note}}', { stages: ['stage.write'] });
        const value = args([first, last], {
            stages: [{ stageId: 'stage.plan', moduleRefs: [ref(first)] }, { stageId: 'stage.write', consumes: ['outline'], moduleRefs: [ref(last)] }],
            artifacts: { outline: { type: 'string', stageId: 'stage.plan' } }, locals: { note: { type: 'string', default: 'note' } },
        });
        value.request.prompt = { artifacts: { outline: { stageId: 'stage.plan', value: 'public outline' } } };
        expect(compile(value).promptIr.directives).toEqual(['first', 'public outline note']);
        value.request.prompt.stageIds = ['stage.write'];
        expect(compile(value).promptIr.directives).toEqual(['public outline note']);
        value.request.prompt.artifacts.outline.stageId = 'stage.write';
        expect(() => compile(value)).toThrow('artifact_invalid');
        delete value.request.prompt.artifacts.outline;
        expect(() => compile(value)).toThrow('artifact_missing');
        value.request.prompt.stageIds = ['stage.unknown'];
        expect(() => compile(value)).toThrow('projection_invalid');
    });

    test('artifacts cannot read future/same-stage or undeclared outputs', () => {
        const value = args([mod('{{artifact.answer}}')], { artifacts: { answer: { type: 'string', stageId: 'stage.main' } } });
        expect(() => compile(value)).toThrow('variable_scope');
        value.resolved.resources[0].resource.stages[0].consumes = ['answer'];
        expect(() => compile(value)).toThrow('artifact_scope');
    });

    test('exclusive targets and undeclared semantic targets fail clearly', () => {
        expect(() => compile(args([mod('A'), mod('B')], { exclusiveTargets: ['system.foundation'] }))).toThrow('exclusive_target_conflict');
        expect(() => compile(args([mod('A', { target: 'response.prefill' }), mod('B', { target: 'response.prefill' })]))).toThrow('exclusive_target_conflict');
        expect(() => compile(args([mod('A', { target: 'legacy.position' })]))).toThrow('module_target_stage');
        const value = args([mod('A')]); value.contextPlan.items.push(value.contextPlan.items[0]);
        expect(() => compile(value)).toThrow('context_duplicate');
    });

    test('old normalized resource fields stay absent; new metadata survives normalization', () => {
        const old = assertPromptProgram(program());
        expect(Object.hasOwn(old, 'locals')).toBe(false);
        expect(Object.hasOwn(old, 'artifacts')).toBe(false);
        expect(Object.hasOwn(old.stages[0], 'consumes')).toBe(false);
        const current = assertPromptProgram(program([], { locals: { note: { type: 'string' } }, artifacts: { note: { type: 'string', stageId: 'stage.main' } } }));
        expect(current.locals.note.type).toBe('string');
        expect(current.artifacts.note.stageId).toBe('stage.main');
    });

    test('new metadata round-trips existing P1 exact persistence and compiles without a second store', async () => {
        const h = await makeTempFsEngine();
        try {
            const library = new VersionedJsonResourceHandler({ engine: h.engine });
            const module = mod('{{local.note}}');
            const value = args([module], { locals: { note: { type: 'string', default: 'persisted' } }, exclusiveTargets: ['system.foundation'] });
            // Persist dependencies before the program that references them.
            for (const entry of [...value.resolved.resources].reverse()) await library.commit(h.handle, entry.ref.resourceType, entry.resource);
            value.resolved.resources = await Promise.all(value.resolved.resources.map(async entry => ({ ...entry, resource: (await library.getExact(h.handle, entry.ref)).snapshot })));
            expect(compile(value).promptIr.directives).toEqual(['persisted']);
            const before = JSON.stringify(value.resolved.resources);
            for (let i = 0; i < 3; i++) compile(value);
            expect(JSON.stringify(value.resolved.resources)).toBe(before);
            expect((await library.getExact(h.handle, ref(module))).snapshot.body).toBe('{{local.note}}');
        } finally { await h.cleanup(); }
    });

    test('stage order wins over requested projection order, and equal-priority modules have stable identity order', () => {
        const a = mod('a', { stages: ['stage.a'] });
        const b = mod('b', { stages: ['stage.b'] });
        const value = args([a, b], { stages: [{ stageId: 'stage.a', moduleRefs: [ref(a)] }, { stageId: 'stage.b', moduleRefs: [ref(b)] }] });
        value.request.prompt = { stageIds: ['stage.b', 'stage.a'] };
        expect(compile(value).promptIr.directives).toEqual(['a', 'b']);
        const first = mod('first', { priority: 1 }); const second = mod('second', { priority: 2 });
        expect(compile(args([first, second])).promptIr.directives).toEqual(['second', 'first']);
    });
});

describe('P3 Context Provider and protocol ports', () => {
    const resolved = { model: { limits: { contextTokens: 1000, outputTokens: 100 } }, generation: { output: { maxTokens: 100 } } };
    test.each(['task', 'studio'])('%s delegates exact selected facts and bounds budget without writes', async kind => {
        const value = args();
        const reader = jest.fn(async () => ({ ...value.contextPlan, source: { ...source, kind, ...(kind === 'studio' ? { taskId: undefined } : {}) } }));
        const provider = kind === 'task' ? createTaskContextProvider(reader) : createStudioContextProvider(reader);
        const plan = await provider.buildRequestContextPlan(value.request, resolved);
        expect(plan.items.map(item => item.content)).toEqual(value.contextPlan.items.map(item => item.content));
        expect(plan.budget).toEqual({ maxTokens: 800, reservedOutputTokens: 100 });
        expect(reader).toHaveBeenCalledTimes(1);
    });

    test('Native provider reuses selected lanes exactly once and rejects stale revision/deferred reserves', async () => {
        const sessionSource = { kind: 'session', sessionId: createNativeId('session'), branchId: createNativeId('branch'), revisionId: createNativeId('revision') };
        const plan = { schemaVersion: 1, revisionId: sessionSource.revisionId, branchId: sessionSource.branchId,
            included: [{ contextItemId: 'fact-1', lane: 'knowledge', content: 'fact' }, { contextItemId: 'input-1', lane: 'current_user', content: 'input' }],
            renderedWarmContext: 'duplicate fact', budget: { promptCeiling: 900, safetyMargin: 50, responseReserve: 100 } };
        const provider = createNativeSessionContextProvider(async () => ({ source: sessionSource, plan }));
        const selected = await provider.buildRequestContextPlan({ requestId: 'req-1' }, resolved);
        expect(selected.items.map(item => item.content)).toEqual(['fact', 'input']);
        expect(selected.budget.maxTokens).toBe(850);
        plan.included[0].metadata = { deferredReserve: true };
        await expect(provider.buildRequestContextPlan({ requestId: 'req-1' }, resolved)).rejects.toThrow('context_unresolved_reservation');
        plan.revisionId = createNativeId('revision');
        await expect(provider.buildRequestContextPlan({ requestId: 'req-1' }, resolved)).rejects.toThrow('context_revision');
    });

    test('Native adapter actually invokes existing Context Compiler with real Session fixture', async () => {
        const f = sessionFixture();
        const sessionSource = { kind: 'session', sessionId: createNativeId('session'), branchId: createNativeId('branch'), revisionId: createNativeId('revision') };
        const snapshot = { manifest: f.manifest, knowledge: { schemaVersion: 1, bindings: [f.binding], snapshots: [] },
            states: {}, revision: { branchId: sessionSource.branchId, revisionId: sessionSource.revisionId },
            graph: [{ branchId: sessionSource.branchId, branch: { branchId: sessionSource.branchId, parentBranchId: null } }],
            timeline: [{ messageId: 'message-1', branchId: sessionSource.branchId, sequence: 0, role: 'user', content: 'hello' }] };
        const options = { countTokens: text => Math.ceil(text.length / 4), safetyMarginTokens: 10, hardReserveTokens: 50 };
        const host = createNativeSessionContextAdapter({ readSnapshot: async () => ({ source: sessionSource, snapshot }), options });
        options.safetyMarginTokens = 900;
        const plan = await host.buildRequestContextPlan({ requestId: 'req-1' }, resolved);
        const original = await compileNativeContextPlan(snapshot, { ...options, safetyMarginTokens: 10, modelContextLimit: 1000, responseReserve: 100 });
        expect(plan.items.map(item => item.content)).toEqual(original.included.map(item => item.content));
        expect(plan.source).toEqual(sessionSource);
        expect(plan.budget.maxTokens).toBe(890);
    });

    test.each(['openai-compatible', 'raw-text', 'anthropic', 'gemini'])('%s fixture preserves payload and authority', format => {
        const value = args([mod('directive')]);
        const ir = compile(value).promptIr;
        const result = renderPromptProtocol(ir, format);
        expect(JSON.stringify(result)).toContain('current input');
        expect(JSON.stringify(result)).toContain('selected fact');
        expect(result.tools).toEqual([]);
        expect(result.outputContract).toBeNull();
    });

    test('renderers reject unsupported interleaved system semantics and invalid history', () => {
        const ir = compile(args([mod('after', { target: 'context.after_input' })])).promptIr;
        expect(() => renderPromptProtocol(ir, 'anthropic')).toThrow('renderer_unsupported');
        expect(() => renderPromptProtocol(ir, 'gemini')).toThrow('renderer_unsupported');
        expect(() => renderPromptMessages({ ...ir, history: [{ role: 'tool', content: 'x' }] })).toThrow('message_invalid');
    });

    test.each(['openai-compatible', 'raw-text'])('GenerationService consumes P3 compiler and %s adapter; final request counted once', async format => {
        const value = args([mod('instruction')]);
        const resolvedConfig = { ...value.resolved, ...resolved,
            route: { ...value.resolved.route, runtimeRouteId: createNativeId('runtimeRoute'), role: 'role.writer',
                policy: { maxFallbackAttempts: 0, timeoutMs: 1000 }, fallbackRouteRefs: [],
                generationProfileRef: { scope: 'library', resourceType: 'core.generation-profile', resourceId: createNativeId('generationProfile'), revision: 'r1' } },
            connection: { connectionProfileId: createNativeId('connectionProfile'), providerAdapter: 'provider.fixture', endpoint: 'https://fixture.invalid', transport: 'transport.https',
                secretRef: { scope: 'player', secretId: 'fixture' }, options: {}, networkPolicy: {} },
            model: { ...resolved.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'fixture', messageFormat: {}, providerHints: {} },
            generation: { ...resolved.generation, sampling: {}, stop: {}, streaming: {}, reasoning: {}, cache: {}, toolChoice: {}, providerExtensions: {} },
            capabilities: [], requirements: [],
        };
        const countTokens = jest.fn(async ({ promptIr }) => renderPromptMessages(promptIr).reduce((sum, message) => sum + message.content.length, 0));
        const send = jest.fn(async () => ({ choices: [{ message: { content: 'ok' }, text: 'ok' }] }));
        const provider = createGenerationProviderAdapter({ format, send, countTokens, parseStream: async raw => raw });
        const secretPort = { resolveSecret: jest.fn(async () => 'synthetic-credential') };
        const service = new GenerationService({ resolver: { resolve: async () => resolvedConfig }, providerFor: () => provider,
            contextProvider: createTaskContextProvider(async () => value.contextPlan), preparePrompt: new PromptCompiler().preparePrompt, secretPort, now: () => 1 });
        const result = await service.execute({ ...value.request, routeRef: { runtimeRouteId: resolvedConfig.route.runtimeRouteId, scope: 'player' }, role: 'role.writer' });
        expect(result.response.text).toBe('ok');
        expect(countTokens).toHaveBeenCalledTimes(1);
        expect(result.snapshot.diagnostics.inputTokens).toBe('instructionselected factearliercurrent input'.length);
        expect(JSON.stringify(result)).not.toContain('synthetic-credential');
        expect(send).toHaveBeenCalledTimes(1);
        value.contextPlan.budget.maxTokens = 1;
        await expect(service.execute(value.request)).rejects.toMatchObject({ code: 'generation_context_budget_exceeded' });
        expect(secretPort.resolveSecret).toHaveBeenCalledTimes(1);
    });
});
