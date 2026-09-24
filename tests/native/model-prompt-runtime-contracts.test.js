import { describe, expect, test } from '@jest/globals';

import {
    ATRIA_CAPABILITY_STATES,
    ATRIA_PACKAGE_FORMAT,
    ATRIA_PACKAGE_SCHEMA_VERSION,
    NATIVE_SCHEMA_VERSION,
    assertAtriaPackageManifest,
    assertCapabilityDecision,
    assertConnectionProfile,
    assertContextProviderPort,
    assertEffectiveRequestSnapshot,
    assertExactResourceRef,
    assertGenerationProfile,
    assertGenerationServicePort,
    assertModelProfile,
    assertPackageModelPromptRuntimeMetadata,
    assertPromptIR,
    assertPromptModule,
    assertPromptProgram,
    assertProviderPort,
    assertRequestContextPlan,
    assertRouteResolverPort,
    assertRuntimeRoute,
    assertSecretPort,
    createNativeId,
    serializeEffectiveRequestSnapshot,
} from '../../src/native/index.js';

const PACKAGE_ID = createNativeId('package');
const PACKAGE_VERSION_ID = createNativeId('packageVersion');
const SESSION_ID = createNativeId('session');
const BRANCH_ID = createNativeId('branch');
const REVISION_ID = createNativeId('revision');
const CONNECTION_ID = createNativeId('connectionProfile');
const MODEL_ID = createNativeId('modelProfile');
const GENERATION_ID = createNativeId('generationProfile');
const MODULE_ID = createNativeId('promptModule');
const PROGRAM_ID = createNativeId('promptProgram');
const ROUTE_ID = createNativeId('runtimeRoute');

function packageResourceRef(resourceType, resourceId, revision = 'resource_rev_1') {
    return {
        resourceType,
        resourceId,
        revision,
        scope: 'package',
        packageId: PACKAGE_ID,
        packageVersionId: PACKAGE_VERSION_ID,
    };
}

function capability(capabilityName, state = 'supported', kind = 'adapter-metadata') {
    return {
        capability: capabilityName,
        state,
        provenance: [{ kind, source: 'adapter.test' }],
    };
}

function contextPlan() {
    return {
        schemaVersion: 1,
        requestId: 'request_1',
        source: {
            kind: 'session',
            sessionId: SESSION_ID,
            branchId: BRANCH_ID,
            revisionId: REVISION_ID,
        },
        items: [{
            kind: 'context.history',
            id: 'history_1',
            content: { messages: 2, token: 128 },
            provenance: [{ source: 'native.session', ref: REVISION_ID }],
        }],
        budget: { maxTokens: 8192, reservedOutputTokens: 1024 },
        provenance: [{ source: 'native.context', ref: REVISION_ID }],
    };
}

function promptIr() {
    return {
        schemaVersion: 1,
        requestId: 'request_1',
        directives: ['Continue the scene.'],
        contextSlots: [{ slot: 'world', content: 'Atria' }],
        history: [{ role: 'user', content: 'Hello' }],
        input: 'Next',
        responseDirectives: ['Return narrative text.'],
        tools: [{ name: 'atri_tool' }],
        outputContract: { type: 'text' },
        provenance: [{ source: 'prompt.compiler', ref: 'program_rev_1' }],
    };
}

function snapshot(overrides = {}) {
    return {
        schemaVersion: 1,
        requestId: 'request_1',
        runtimeRouteId: ROUTE_ID,
        modelProfileId: MODEL_ID,
        connectionProfileId: CONNECTION_ID,
        generationProfileRef: packageResourceRef('core.generation-profile', GENERATION_ID),
        promptProgramRef: packageResourceRef('core.prompt-program', PROGRAM_ID),
        capabilities: [capability('model.text')],
        contextPlan: contextPlan(),
        promptIr: promptIr(),
        createdAt: 100,
        diagnostics: { route: 'resolved' },
        ...overrides,
    };
}

function packageManifest(runtime) {
    const actorId = createNativeId('actor');
    return {
        format: ATRIA_PACKAGE_FORMAT,
        schemaVersion: ATRIA_PACKAGE_SCHEMA_VERSION,
        nativeSchemaVersion: NATIVE_SCHEMA_VERSION,
        packageId: PACKAGE_ID,
        packageVersionId: PACKAGE_VERSION_ID,
        name: 'P0 Contract Work',
        version: '1.0.0',
        actors: [{ actorId, displayName: 'Actor' }],
        entryPoints: [{
            entryPointId: createNativeId('entryPoint'),
            displayName: 'Main',
            actorIds: [actorId],
            primaryActorId: actorId,
        }],
        capabilities: ['narrative'],
        permissions: [],
        assets: [],
        runtime,
    };
}

describe('P0 core model / prompt / runtime contracts', () => {
    test('freezes Connection Profile without embedding secret values', () => {
        const parsed = assertConnectionProfile({
            schemaVersion: 1,
            connectionProfileId: CONNECTION_ID,
            scope: 'player',
            displayName: 'OpenAI Compatible',
            providerAdapter: 'provider.openai-compatible',
            transport: 'transport.https',
            endpoint: 'https://example.invalid/v1',
            networkPolicy: { proxy: 'system' },
            secretRef: { secretId: 'secret_openai', scope: 'player' },
            options: { organization: 'example' },
        });

        expect(parsed.connectionProfileId).toBe(CONNECTION_ID);
        expect(parsed.secretRef).toEqual({ secretId: 'secret_openai', scope: 'player' });
        expect(() => assertConnectionProfile({
            ...parsed,
            options: { apiKey: 'never-serialize-me' },
        })).toThrow(/secret material/);
    });

    test('binds Model Profile to a player Connection and capability provenance', () => {
        const model = assertModelProfile({
            schemaVersion: 1,
            modelProfileId: MODEL_ID,
            scope: 'player',
            displayName: 'Primary Model',
            connectionProfileRef: { connectionProfileId: CONNECTION_ID, scope: 'player' },
            remoteModelId: 'model-x',
            capabilities: [
                capability('model.text', 'supported'),
                capability('model.tools', 'unknown', 'provider-discovery'),
            ],
            limits: { contextTokens: 128000, outputTokens: 8192 },
            tokenizer: { kind: 'provider', token: 'metadata-not-a-secret' },
        });
        expect(model.capabilities.map(item => item.state)).toEqual(['supported', 'unknown']);

        expect(() => assertModelProfile({
            ...model,
            connectionProfileRef: { connectionProfileId: CONNECTION_ID, scope: 'package' },
        })).toThrow(/scope/);
    });

    test('freezes revisioned Generation, Prompt Module and Prompt Program resources', () => {
        const generation = assertGenerationProfile({
            schemaVersion: 1,
            generationProfileId: GENERATION_ID,
            revision: 'generation_rev_1',
            displayName: 'Balanced',
            sampling: { temperature: 0.8 },
            output: { maxTokens: 1200 },
            reasoning: { effort: 'medium' },
            streaming: { enabled: true },
        });
        expect(generation.sampling.temperature).toBe(0.8);

        const module = assertPromptModule({
            schemaVersion: 1,
            promptModuleId: MODULE_ID,
            revision: 'module_rev_1',
            displayName: 'Foundation',
            target: 'system.foundation',
            stages: ['stage.foundation'],
            priority: 10,
            condition: { op: 'exists', path: 'context.actor' },
            parameters: { tone: { type: 'string', required: false, default: 'neutral' } },
            body: 'You are the narrator.',
            provenance: [{ source: 'project' }],
        });
        expect(module.target).toBe('system.foundation');

        const program = assertPromptProgram({
            schemaVersion: 1,
            promptProgramId: PROGRAM_ID,
            revision: 'program_rev_1',
            displayName: 'Default Program',
            stages: [{
                stageId: 'stage.foundation',
                targets: ['system.foundation'],
                moduleRefs: [packageResourceRef('core.prompt-module', MODULE_ID)],
            }],
            responseDirective: { target: 'assistant.response' },
        });
        expect(program.stages[0].moduleRefs[0].revision).toBe('resource_rev_1');
    });

    test('rejects invalid exact resource identity and cross-scope references', () => {
        expect(() => assertExactResourceRef({
            ...packageResourceRef('core.prompt-program', PROGRAM_ID),
            resourceId: MODULE_ID,
        }, 'core.prompt-program')).toThrow(/pprog_/);

        expect(() => assertExactResourceRef({
            resourceType: 'core.prompt-program',
            resourceId: PROGRAM_ID,
            revision: 'program_rev_1',
            scope: 'project',
            packageId: PACKAGE_ID,
        }, 'core.prompt-program')).toThrow(/unsupported field|projectId/);
    });

    test('freezes Runtime Route and prevents player routes from depending on session routes', () => {
        const route = {
            schemaVersion: 1,
            runtimeRouteId: ROUTE_ID,
            scope: 'player',
            displayName: 'Narration',
            role: 'runtime.narrator',
            modelProfileRef: { modelProfileId: MODEL_ID, scope: 'player' },
            connectionProfileRef: { connectionProfileId: CONNECTION_ID, scope: 'player' },
            generationProfileRef: packageResourceRef('core.generation-profile', GENERATION_ID),
            promptProgramRef: packageResourceRef('core.prompt-program', PROGRAM_ID),
            fallbackRouteRefs: [],
            policy: { timeoutMs: 30000, maxRetries: 1, maxFallbackAttempts: 2 },
            requirements: ['model.text'],
        };
        expect(assertRuntimeRoute(route).role).toBe('runtime.narrator');

        expect(() => assertRuntimeRoute({
            ...route,
            fallbackRouteRefs: [{
                runtimeRouteId: createNativeId('runtimeRoute'),
                scope: 'session',
                sessionId: SESSION_ID,
            }],
        })).toThrow(/player route/);
    });
});

describe('P0 capability / runtime artifact contracts', () => {
    test('freezes capability three-state with mandatory provenance', () => {
        expect(ATRIA_CAPABILITY_STATES).toEqual(['supported', 'unsupported', 'unknown']);
        for (const state of ATRIA_CAPABILITY_STATES) {
            expect(assertCapabilityDecision(capability('model.text', state)).state).toBe(state);
        }
        expect(() => assertCapabilityDecision({
            capability: 'model.text',
            state: 'unknown',
            provenance: [],
        })).toThrow(/provenance/);
    });

    test('validates RequestContextPlan and Prompt IR without introducing a second state authority', () => {
        const context = assertRequestContextPlan(contextPlan());
        expect(context.source.kind).toBe('session');
        expect(context.items[0].content.token).toBe(128);

        const ir = assertPromptIR(promptIr());
        expect(ir.requestId).toBe(context.requestId);
        expect(ir.history).toHaveLength(1);
    });

    test('EffectiveRequestSnapshot is secret-free and serializable', () => {
        const parsed = assertEffectiveRequestSnapshot(snapshot());
        expect(parsed.runtimeRouteId).toBe(ROUTE_ID);
        const serialized = serializeEffectiveRequestSnapshot(parsed);
        expect(serialized).not.toMatch(/apiKey|accessToken|password|authorization/i);

        expect(() => assertEffectiveRequestSnapshot(snapshot({
            diagnostics: { accessToken: 'secret-value' },
        }))).toThrow(/secret material/);
    });
});

describe('P0 Package runtime.modelPrompt contract', () => {
    test('allows only author intent with exact package Prompt / Generation refs', () => {
        const metadata = assertPackageModelPromptRuntimeMetadata({
            schemaVersion: 1,
            roles: [{
                role: 'runtime.narrator',
                requiredCapabilities: ['model.text'],
                optionalCapabilities: ['model.tools'],
                promptProgramRef: packageResourceRef('core.prompt-program', PROGRAM_ID),
                generationProfileRef: packageResourceRef('core.generation-profile', GENERATION_ID),
            }],
        }, { packageId: PACKAGE_ID, packageVersionId: PACKAGE_VERSION_ID });
        expect(metadata.roles[0].promptProgramRef.scope).toBe('package');

        const manifest = assertAtriaPackageManifest(packageManifest({ modelPrompt: metadata }));
        expect(manifest.runtime.modelPrompt.roles[0].role).toBe('runtime.narrator');
    });

    test.each([
        ['secretRef', { secretId: 'private' }],
        ['connectionProfileRef', { connectionProfileId: CONNECTION_ID }],
        ['modelProfileRef', { modelProfileId: MODEL_ID }],
        ['runtimeRouteId', ROUTE_ID],
    ])('rejects private player runtime data field %s', (field, payload) => {
        expect(() => assertPackageModelPromptRuntimeMetadata({
            schemaVersion: 1,
            roles: [{
                role: 'runtime.narrator',
                requiredCapabilities: ['model.text'],
                [field]: payload,
            }],
        })).toThrow(/unsupported field/);
    });

    test('rejects package refs that point at a different immutable PackageVersion', () => {
        expect(() => assertPackageModelPromptRuntimeMetadata({
            schemaVersion: 1,
            roles: [{
                role: 'runtime.narrator',
                promptProgramRef: {
                    ...packageResourceRef('core.prompt-program', PROGRAM_ID),
                    packageVersionId: createNativeId('packageVersion'),
                },
            }],
        }, { packageId: PACKAGE_ID, packageVersionId: PACKAGE_VERSION_ID })).toThrow(/enclosing PackageVersion/);
    });
});

describe('P0 port contracts', () => {
    const fn = () => {};

    test('freezes Generation Service, Route Resolver, Provider, Secret and Context Provider shapes', () => {
        expect(assertGenerationServicePort({ execute: fn }).execute).toBe(fn);
        expect(assertRouteResolverPort({ resolve: fn }).resolve).toBe(fn);
        expect(assertProviderPort({
            resolveCapabilities: fn,
            countTokens: fn,
            renderRequest: fn,
            send: fn,
            parseStream: fn,
            normalizeResponse: fn,
        }).send).toBe(fn);
        expect(assertSecretPort({ resolveSecret: fn }).resolveSecret).toBe(fn);
        expect(assertContextProviderPort({ buildRequestContextPlan: fn }).buildRequestContextPlan).toBe(fn);
    });

    test('fails closed when a required port method is absent', () => {
        expect(() => assertProviderPort({ send: fn })).toThrow(/resolveCapabilities/);
        expect(() => assertGenerationServicePort({})).toThrow(/execute/);
    });
});


test('typed Prompt defaults and variable names reject resources runtime binding cannot consume', () => {
    const module = { schemaVersion: 1, promptModuleId: MODULE_ID, revision: 'r1', displayName: 'Typed', target: 'system.foundation', stages: ['stage.main'], body: '' };
    expect(() => assertPromptModule({ ...module, parameters: { count: { type: 'number', default: '2' } } })).toThrow('does not match');
    expect(() => assertPromptModule({ ...module, parameters: { 'bad-name': { type: 'string' } } })).toThrow('Invalid parameter name');
    expect(assertPromptModule({ ...module, parameters: { count: { type: 'number', default: 2 }, enabled: { type: 'boolean', default: false }, options: { type: 'json', default: null } } }).parameters.count.default).toBe(2);
});
