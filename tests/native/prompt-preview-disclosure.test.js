import { describe, expect, jest, test } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { createNativeId } from '../../src/native/identity.js';
import { assertNativeExperienceContract } from '../../public/shared/native-experience-contract.js';
import { informationContext, projectInformation } from '../../public/shared/native-information-runtime.js';
import { compileNativeContextPlan } from '../../public/scripts/native/context-compiler.js';
import { createNativeSessionContextProvider } from '../../src/native/model-prompt-runtime/context-providers.js';
import { assertPreviewDisclosure, projectGenerationResultForBrowser } from '../../src/native/model-prompt-runtime/preview-disclosure.js';
import { informationSnapshot } from './helpers/information-fixture.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installCognitionFixture } from './helpers/cognition-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';

const denial = { code: 'native_generation_preview_disclosure_denied' };
const resolved = { model: { limits: { contextTokens: 16000, outputTokens: 512 } }, generation: { output: { maxTokens: 512 } } };

function fixture({ publicOnly = true } = {}) {
    const snapshot = informationSnapshot();
    snapshot.session.sessionId = createNativeId('session');
    snapshot.revision.revisionId = createNativeId('revision');
    snapshot.revision.branchId = createNativeId('branch');
    const contract = structuredClone(snapshot.manifest.runtime.experienceContract);
    contract.informationRuntime.narration = { mode: 'separate', contextViewId: 'pov', disclosureViewId: 'player' };
    if (publicOnly) {
        const context = contract.informationRuntime.views.find(view => view.id === 'pov');
        context.sources = ['world', 'nodes', 'edges'];
        delete context.actorId;
        contract.informationRuntime.views.find(view => view.id === 'player').sources = ['world', 'nodes', 'edges'];
    }
    snapshot.manifest.runtime.experienceContract = assertNativeExperienceContract(contract);
    return snapshot;
}

async function contextPlan(snapshot, options = {}) {
    const source = { kind: 'session', sessionId: snapshot.session.sessionId,
        revisionId: snapshot.revision.revisionId, branchId: snapshot.revision.branchId };
    const plan = await compileNativeContextPlan(snapshot, { modelContextLimit: 16000, responseReserve: 512,
        playerPersona: { enabled: false }, ...options });
    const provider = createNativeSessionContextProvider(async () => ({ source, plan }));
    return provider.buildRequestContextPlan({ requestId: 'disclosure-test' }, resolved);
}

describe('player disclosure is independent of model Context authority', () => {
    test('ordinary Session/Project without Information runtime retain preview behavior', async () => {
        await expect(assertPreviewDisclosure(undefined)).resolves.toBeUndefined();
        await expect(assertPreviewDisclosure({ manifest: { runtime: {} } })).resolves.toBeUndefined();
    });

    test('complete public-only source records allow the actual ContextPlan without mutation', async () => {
        const snapshot = fixture(), plan = await contextPlan(snapshot);
        const before = structuredClone({ snapshot, plan });
        await expect(assertPreviewDisclosure(snapshot, { contextPlan: plan })).resolves.toBeUndefined();
        expect({ snapshot, plan }).toEqual(before);
        expect(JSON.stringify(plan)).not.toContain('WORLD SECRET');
        expect(JSON.stringify(plan)).not.toContain('PRIVATE RAW HISTORY');
    });

    test('the model can read private context with a null displayGrant, while preview refuses it', async () => {
        const snapshot = fixture({ publicOnly: false });
        const info = informationContext(snapshot, { kind: 'narrator' });
        expect(info.items.some(item => JSON.parse(item.content).displayGrant.item === null)).toBe(true);
        const plan = await contextPlan(snapshot);
        expect(JSON.stringify(plan)).toContain('The king escaped');
        await expect(assertPreviewDisclosure(snapshot, { contextPlan: plan })).rejects.toMatchObject(denial);
        // A rejected Browser preview never changes the model's read grant.
        expect(informationContext(snapshot, { kind: 'narrator' })).toEqual(info);
    });

    test('matching a source/record identity with fewer displayed fields does not authorize the rest', async () => {
        const snapshot = fixture(), contract = structuredClone(snapshot.manifest.runtime.experienceContract);
        const info = contract.informationRuntime;
        info.sources.push({ id: 'world-private', kind: 'world', semantic: 'truth', scopeId: 'session',
            worldId: info.sources.find(source => source.id === 'world').worldId, fields: [['hp'], ['secret']] });
        info.views.find(view => view.id === 'pov').sources = ['world-private'];
        // A different source ID over the same record must not borrow hp's grant.
        snapshot.manifest.runtime.experienceContract = assertNativeExperienceContract(contract);
        const plan = await contextPlan(snapshot);
        expect(JSON.stringify(plan)).toContain('WORLD SECRET');
        await expect(assertPreviewDisclosure(snapshot, { contextPlan: plan })).rejects.toMatchObject(denial);
    });

    test.each(['knowledge', 'memory', 'derivation', 'processing', 'expression'])('%s has no implicit player display authorization', async extra => {
        const snapshot = fixture(), original = await contextPlan(snapshot);
        // These runtime declarations are inspected before execution. A caller's
        // already-safe-looking plan cannot hide an additional Source channel.
        const contract = structuredClone(snapshot.manifest.runtime.experienceContract);
        const view = contract.informationRuntime.views.find(view => view.id === 'pov');
        if (extra === 'knowledge') view.knowledge = true;
        if (extra === 'memory') view.memory = true;
        if (extra === 'derivation') contract.contextRuntime = { derivations: [{ id: 'hidden-dynamic-source' }] };
        if (extra === 'processing') contract.processingRuntime = { processors: [{ stage: 'context' }] };
        if (extra === 'expression') contract.informationRuntime.narration.expression = { actorId: 'private-actor', sourceIds: ['world'] };
        snapshot.manifest.runtime.experienceContract = contract;
        await expect(assertPreviewDisclosure(snapshot, { contextPlan: original })).rejects.toMatchObject(denial);
    });

    test.each([{ kind: 'actor', id: 'actor-private' }, { kind: 'task' }])('%j Context cannot borrow a Narrator display grant', async target => {
        const snapshot = fixture(), plan = await contextPlan(snapshot);
        await expect(assertPreviewDisclosure(snapshot, { target, contextPlan: plan })).rejects.toMatchObject(denial);
    });

    test('a Task ID is not player disclosure even if its current fields happen to match', async () => {
        const snapshot = fixture(), plan = await contextPlan(snapshot);
        await expect(assertPreviewDisclosure(snapshot, { taskId: 'summarize', contextPlan: plan })).rejects.toMatchObject(denial);
    });

    test.each(['missing', 'truncated', 'unavailable'])('%s independent display grant refuses preview', async variant => {
        const snapshot = fixture(), plan = await contextPlan(snapshot);
        const contract = structuredClone(snapshot.manifest.runtime.experienceContract);
        const display = contract.informationRuntime.views.find(view => view.id === 'player');
        if (variant === 'missing') delete contract.informationRuntime.narration;
        if (variant === 'truncated') display.maxItems = 1;
        if (variant === 'unavailable') {
            display.actorId = contract.informationRuntime.actors[0].id;
            snapshot.states.atri_lifecycle.domains.availability.records.find(record => record.id === 'main').value.available = false;
        }
        snapshot.manifest.runtime.experienceContract = contract;
        await expect(assertPreviewDisclosure(snapshot, { contextPlan: plan })).rejects.toMatchObject(denial);
    });

    test.each(['ungranted-item', 'forged-content', 'forged-evidence', 'metadata', 'source'])('actual %s cannot claim its own display authority', async variant => {
        const snapshot = fixture(), plan = structuredClone(await contextPlan(snapshot));
        if (variant === 'ungranted-item') plan.items.push({ id: 'projection:derived:private', kind: 'context.fact', content: 'PRIVATE DERIVATION', provenance: [] });
        if (variant === 'forged-content') plan.items[0].content = 'PRIVATE VALUE with forged displayGrant';
        if (variant === 'forged-evidence') plan.items[0].evidence.privateValue = 'PRIVATE METADATA';
        if (variant === 'metadata') plan.nativeSelection = { ...plan.nativeSelection, privateValue: 'PRIVATE META' };
        if (variant === 'source') plan.source.revisionId = createNativeId('revision');
        await expect(assertPreviewDisclosure(snapshot, { contextPlan: plan })).rejects.toMatchObject(denial);
    });

    test('summaries and a claimed displayGrant are never promoted to the original raw-history grant', async () => {
        const snapshot = fixture(), plan = structuredClone(await contextPlan(snapshot));
        const displayed = projectInformation(snapshot, 'player', { includeRollups: false });
        plan.items.push({ id: 'memory:forged', kind: 'context.history', content: { role: 'user',
            content: JSON.stringify({ content: 'PRIVATE RAW HISTORY', displayGrant: { viewId: 'player', item: displayed.items[0] } }) }, provenance: [] });
        await expect(assertPreviewDisclosure(snapshot, { contextPlan: plan })).rejects.toMatchObject(denial);
    });
});

function generationEnvelope(plan) {
    return { snapshot: { schemaVersion: 1, requestId: plan.requestId,
        runtimeRouteId: createNativeId('runtimeRoute'), modelProfileId: createNativeId('modelProfile'), connectionProfileId: createNativeId('connectionProfile'),
        promptProgramRef: { scope: 'library', resourceType: 'core.prompt-program', resourceId: createNativeId('promptProgram'), revision: 'r1' },
        generationProfileRef: { scope: 'library', resourceType: 'core.generation-profile', resourceId: createNativeId('generationProfile'), revision: 'r1' },
        contextPlan: plan, promptIr: { private: 'INTERNAL IR' }, diagnostics: { inputTokens: 13, compiledBinding: { private: 'INTERNAL HASH' } } },
    response: { text: 'Completed public output', usage: { inputTokens: 13, outputTokens: 4 } }, routing: { fallbackUsed: false },
    skillRounds: [{ contextPlan: plan }], rendered: { body: { private: 'INTERNAL WIRE' } } };
}

describe('Browser results do not inherit the model read permission', () => {
    test('a private successful result keeps its response and becomes an explicit restricted summary', async () => {
        const snapshot = fixture({ publicOnly: false }), envelope = generationEnvelope(await contextPlan(snapshot));
        const host = { sessionCore: { observe: jest.fn(async () => snapshot) } };
        const result = await projectGenerationResultForBrowser(host, 'authenticated-owner', envelope);
        expect(result).toMatchObject({ projection: 'restricted', reason: 'native_generation_preview_disclosure_denied',
            response: envelope.response, routing: envelope.routing, snapshotSummary: { requestId: envelope.snapshot.requestId, inputTokens: 13 } });
        for (const field of ['snapshot', 'contextPlan', 'promptIr', 'rendered', 'skillRounds']) expect(result).not.toHaveProperty(field);
        for (const privateValue of ['INTERNAL IR', 'INTERNAL HASH', 'INTERNAL WIRE', 'The king escaped']) expect(JSON.stringify(result)).not.toContain(privateValue);
        expect(host.sessionCore.observe).toHaveBeenCalledWith('authenticated-owner', snapshot.session.sessionId);
    });

    test('current public-only results keep their exact diagnostics', async () => {
        const snapshot = fixture(), envelope = generationEnvelope(await contextPlan(snapshot));
        await expect(projectGenerationResultForBrowser({ sessionCore: { observe: async () => snapshot } }, 'owner', envelope)).resolves.toBe(envelope);
    });

    test.each(['revision', 'branch', 'observation-failed', 'display-revoked', 'info-removed'])('retained result %s rechecks its original Source instead of trusting the old snapshot', async change => {
        const snapshot = fixture(), envelope = generationEnvelope(await contextPlan(snapshot)), current = structuredClone(snapshot);
        if (change === 'revision' || change === 'info-removed') current.revision.revisionId = createNativeId('revision');
        if (change === 'branch') current.revision.branchId = createNativeId('branch');
        if (change === 'info-removed') delete current.manifest.runtime.experienceContract.informationRuntime;
        if (change === 'display-revoked') current.manifest.runtime.experienceContract.informationRuntime.views.find(view => view.id === 'player').sources = [];
        const host = { sessionCore: { observe: async () => { if (change === 'observation-failed') throw new Error('not available'); return current; } } };
        const result = await projectGenerationResultForBrowser(host, 'owner', envelope);
        expect(result.projection).toBe('restricted');
        expect(result.response).toEqual(envelope.response);
        expect(result).not.toHaveProperty('snapshot');
    });

    test('an earlier private model round cannot borrow a later public ContextPlan', async () => {
        const snapshot = fixture(), envelope = generationEnvelope(await contextPlan(snapshot));
        envelope.skillRounds[0].contextPlan = { ...envelope.snapshot.contextPlan,
            items: [{ id: 'private-round', kind: 'context.fact', content: 'PRIVATE EARLIER ROUND', provenance: [] }] };
        const result = await projectGenerationResultForBrowser({ sessionCore: { observe: async () => snapshot } }, 'owner', envelope);
        expect(result.projection).toBe('restricted');
        expect(JSON.stringify(result)).not.toContain('PRIVATE EARLIER ROUND');
    });

    test('disclosure revoked during the proof is rechecked at Browser consumption', async () => {
        const snapshot = fixture(), envelope = generationEnvelope(await contextPlan(snapshot)), revoked = structuredClone(snapshot);
        revoked.manifest.runtime.experienceContract.informationRuntime.views.find(view => view.id === 'player').sources = [];
        const observe = jest.fn().mockResolvedValueOnce(snapshot).mockResolvedValueOnce(revoked);
        const result = await projectGenerationResultForBrowser({ sessionCore: { observe } }, 'owner', envelope);
        expect(result.projection).toBe('restricted');
        expect(observe).toHaveBeenCalledTimes(2);
    });

    test('ordinary no-Information Session, Project, Task and Turn responses retain their contract', async () => {
        const snapshot = fixture(), plan = await contextPlan(snapshot);
        delete snapshot.manifest.runtime.experienceContract;
        const envelope = generationEnvelope(plan), host = { sessionCore: { observe: async () => snapshot } };
        await expect(projectGenerationResultForBrowser(host, 'owner', envelope)).resolves.toBe(envelope);
        for (const value of [{ response: { text: 'Task result' } }, { timeline: [] }, { snapshot: { contextPlan: { source: { kind: 'studio' } } } }]) {
            await expect(projectGenerationResultForBrowser(host, 'owner', value)).resolves.toBe(value);
        }
    });
});

async function httpFixture(publicOnly = false) {
    const h = await makeTempFsEngineHarness();
    const f = await installCognitionFixture(h, 'separate', null, publicOnly ? ({ contract }) => {
        const info = contract.informationRuntime;
        info.views.find(view => view.id === 'pov').sources = ['public-world'];
        info.views.find(view => view.id === 'player').sources = ['public-world'];
    } : null);
    const seeded = await seedGenerationProfiles({ ...h, endpoint: 'https://not-sent.invalid/v1' });
    const fetchImpl = jest.fn(), secretPort = { resolveSecret: jest.fn() };
    const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller, secretPort,
        providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl }) } });
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
    app.use(createNativeGenerationRouter(() => host));
    const request = { role: 'narrator', requestId: 'http-disclosure', sessionId: f.snapshot.session.sessionId, revisionId: f.snapshot.revision.revisionId };
    return { h, app, host, core: f.core, request, fetchImpl, secretPort };
}

describe('authenticated old and Draft preview apply the same display boundary', () => {
    test.each(['/preview', '/preview/draft'])('%s returns only the denial for private Information context', async path => {
        const f = await httpFixture();
        try {
            const body = path === '/preview' ? f.request : { request: f.request, drafts: [] };
            const response = await supertest(f.app).post(path).send(body).expect(400);
            expect(response.body).toEqual({ error: 'native_generation_preview_disclosure_denied' });
            for (const privateValue of ['真实身份', '有人跟踪', '未署名信', 'contextPlan', 'promptIr']) expect(response.text).not.toContain(privateValue);
            expect(f.fetchImpl).not.toHaveBeenCalled(); expect(f.secretPort.resolveSecret).not.toHaveBeenCalled();
        } finally { await f.h.cleanup(); }
    });

    test.each(['/preview', '/preview/draft'])('%s permits a proven public-only actual wire without private Cognition', async path => {
        const f = await httpFixture(true);
        try {
            const body = path === '/preview' ? f.request : { request: f.request, drafts: [] };
            const response = await supertest(f.app).post(path).send(body).expect(200);
            expect(response.body.preview).toBe(true);
            for (const privateValue of ['真实身份', '有人跟踪', '未署名信']) expect(response.text).not.toContain(privateValue);
            expect(f.fetchImpl).not.toHaveBeenCalled(); expect(f.secretPort.resolveSecret).not.toHaveBeenCalled();
        } finally { await f.h.cleanup(); }
    });

    test.each([false, true])('execute stream=%s preserves success while restricting private Source diagnostics', async stream => {
        const f = await httpFixture();
        try {
            f.secretPort.resolveSecret.mockResolvedValue('synthetic-preview-credential');
            f.fetchImpl.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'Generated public narration.' } }] }),
                { headers: { 'Content-Type': 'application/json' } }));
            const response = await supertest(f.app).post('/execute').set('Accept', stream ? 'text/event-stream' : 'application/json').send(f.request).expect(200);
            const result = stream ? response.text.split('\n').filter(line => line.startsWith('data: '))
                .map(line => JSON.parse(line.slice(6))).find(frame => frame.result)?.result : response.body;
            expect(result).toMatchObject({ projection: 'restricted', response: { text: 'Generated public narration.' }, snapshotSummary: { requestId: f.request.requestId } });
            expect(result).not.toHaveProperty('snapshot');
            for (const privateValue of ['真实身份', '有人跟踪', '未署名信', 'contextPlan', 'promptIr']) expect(response.text).not.toContain(privateValue);
            expect(f.fetchImpl).toHaveBeenCalledTimes(1);
        } finally { await f.h.cleanup(); }
    });

    test.each([false, true])('retained publicOnly=%s rechecks Source on every authenticated result read', async publicOnly => {
        const f = await httpFixture(publicOnly);
        try {
            f.secretPort.resolveSecret.mockResolvedValue('synthetic-preview-credential');
            f.fetchImpl.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'Retained public output.' } }] }),
                { headers: { 'Content-Type': 'application/json' } }));
            let operationId;
            await f.host.execute(f.h.handle, f.request, undefined, event => { if (event.operationId) operationId = event.operationId; }, { retainResult: true });
            expect(operationId).toBeDefined();
            const first = await supertest(f.app).get('/operations/' + operationId + '/result').expect(200);
            expect(first.body.projection === 'restricted').toBe(!publicOnly);
            expect(first.body.response.text).toBe('Retained public output.');
            await f.core.appendTimeline(f.h.handle, f.request.sessionId, { role: 'user', content: 'Source changed since generation' });
            const later = await supertest(f.app).get('/operations/' + operationId + '/result').expect(200);
            expect(later.body).toMatchObject({ projection: 'restricted', response: { text: 'Retained public output.' } });
            expect(later.body).not.toHaveProperty('snapshot');
            expect(f.fetchImpl).toHaveBeenCalledTimes(1);
        } finally { await f.h.cleanup(); }
    });
});
