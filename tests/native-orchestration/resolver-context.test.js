import { jest } from '@jest/globals';
import { ContextPort } from '../../src/native/orchestration/context-port.js';
import { captureNativeAuthorityResolver, inspectNativeAuthorityResolver } from '../../src/native/orchestration/authority-resolver-context.js';
import { captureNativeTurnPermit } from '../../src/native/orchestration/native-turn-permit.js';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { authorityCatalog, resolverRequest } from '../../src/native/authority-turn.js';
import { buildAuthorityObservation } from '../../src/native/authority-transaction.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { SourcePort } from '../../src/native/orchestration/source-port.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { runFixture } from '../native/helpers/run-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { prepareControllerOwnerRoot } from './fixtures.js';
import { cancelSessionMaintenance } from '../../src/native/session-maintenance.js';

if (process.env.ATRIA_TEST_RESOLVER_CONTEXT_SQL === '1') jest.setTimeout(60000);

// Original FS/SQLite Session, Package, catalog/projection/selector and Scheduler.
// This adapter test's grant callback is controlled, not a production grant.
async function fixture(make) {
    const h = await make(); let f;
    try {
        await prepareControllerOwnerRoot(h.dirs.root); attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        f = await runFixture(h, 'http://127.0.0.1:1/unused');
        let base = await f.begin();
        base = await f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Update the note.' });
        const source = new SourcePort({ sessionCore: f.core, budgetPort: new BudgetPort({ sessionCore: f.core }) });
        const { sourceBinding } = await source.capture(h.handle, { domain: 'native_session', sessionId: base.session.sessionId,
            branchId: base.revision.branchId, revisionId: base.revision.revisionId });
        const anchor = { branchId: base.revision.branchId, revisionId: base.revision.revisionId }, invocationId = 'resolver-context', requestHash = hash({ anchor });
        const resources = ['session:' + h.handle + ':' + base.session.sessionId], selection = Object.freeze({});
        const withScope = operation => nativeTaskScheduler.submit({ owner: h.handle, anchor: { sessionId: base.session.sessionId, ...anchor }, kind: 'turn', executionClass: 'turn_blocking',
            key: base.session.sessionId + ':' + invocationId + ':turn', fingerprint: requestHash, resources, retry: false, fresh: async () => true,
            run: async boundary => {
                const permit = captureNativeTurnPermit({ host: f.host, handle: h.handle, sessionId: base.session.sessionId, anchor, invocationId, requestHash, selection, resources, boundary });
                const producer = { permit, anchor, invocationId, requestHash, selection };
                const capture = captureNativeAuthorityResolver({ host: f.host, handle: h.handle, base, producer });
                const grantDigest = hash({ sourceBinding, invocationId }), request = { ownerRef: { handle: h.handle }, sourceBinding, audience: { kind: 'authority_intent' },
                    taskPurpose: 'original_native_intent_resolver', grantDigest, inputRefs: [], tokenBudget: { modelContextLimit: 32000, responseReserve: 1000 } };
                let allowed = true;
                const port = new ContextPort({ sessionCore: f.core, resolverCapture: capture, authorizeContext: async () => ({ allowed, grantDigest }) });
                return operation({ port, capture, producer, request, revoke: () => { allowed = false; }, allow: () => { allowed = true; } });
            }, finalize: async result => result }).result;
        return { ...f, h, base, withScope, cleanup: async () => { cancelSessionMaintenance(f.sessionRepo, h.handle, base.session.sessionId); await h.engine.close(); await h.cleanup(); } };
    } catch (error) { if (f) cancelSessionMaintenance(f.sessionRepo, h.handle, f.base.session.sessionId); await h.engine.close(); await h.cleanup(); throw error; }
}

describe.each(CONTRACT_HARNESSES.filter(({ name }) => process.env.ATRIA_TEST_RESOLVER_CONTEXT_SQL === '1' || ['FsEngine', 'SqliteEngine'].includes(name)))('$name original resolver Context', ({ make }) => {
    test('uses only original public intent observation and tools, and original typed selection never commits World', async () => {
        const f = await fixture(make);
        try { await f.withScope(async ({ port, capture, request }) => {
            const identity = inspectNativeAuthorityResolver(capture, { sessionCore: f.core, handle: f.h.handle, sourceBinding: request.sourceBinding });
            expect(identity.request).toEqual({ sessionId: f.base.session.sessionId, revisionId: f.base.revision.revisionId, requestId: 'resolver-context:intent', role: 'intent_resolver' });
            expect(identity.logicalDescriptor).toMatchObject({ intentObservation: f.contract.authorityRuntime.intentObservation,
                logicRefs: { path: 'logic.json' }, user: { messageId: f.base.timeline.at(-1).messageId, contentHash: hash('Update the note.') } });
            const descriptor = await port.compilationDescriptor(f.h.handle, request);
            expect(descriptor.snapshot).toEqual(f.base); expect(descriptor.sourceFiles[0][0]).toBe('logic.json');
            expect(descriptor).not.toHaveProperty('observation'); expect(descriptor).not.toHaveProperty('payload');
            const context = await port.compile(f.h.handle, request), fixed = port.resolverRequest(f.h.handle, { context });
            const installed = await f.core._openPackage(f.h.handle, f.base.session.packageId, f.base.session.packageVersionId, f.base.session.entryPointId);
            const expected = resolverRequest(await authorityCatalog(f.base, installed), buildAuthorityObservation(f.base), f.base.timeline.at(-1).content);
            expect(fixed.tools).toEqual(expected.tools);
            const resolved = { route: { runtimeRouteId: 'original-route' }, model: { limits: { contextTokens: 32000, outputTokens: 2000 } } };
            const actual = await port.provider(f.h.handle, { context }).buildRequestContextPlan(fixed, resolved);
            const ref = request.sourceBinding.sourceRef;
            const serviceRequest = { requestId: fixed.requestId, role: 'role.intent_resolver', routeRef: { scope: 'player', runtimeRouteId: 'original-route' },
                requirements: [...new Set([...(f.base.manifest.runtime.modelPrompt?.roles.find(item => item.role === 'role.intent_resolver')?.requiredCapabilities ?? []), 'generation.tools'])],
                tools: fixed.tools, outputContract: null, prompt: { host: { role: 'role.intent_resolver', sourceKind: 'session', sessionId: ref.sessionId,
                    branchId: ref.branchId, revisionId: ref.revisionId, projectId: '', projectRevision: '' } }, fallbackMode: 'disabled', unknownCapabilityOverrides: [] };
            expect(await port.provider(f.h.handle, { context }).buildRequestContextPlan(serviceRequest, resolved)).toEqual(actual);
            for (const changed of [{ tools: [] }, { outputContract: {} }, { fallbackMode: 'automatic' }, { unknownCapabilityOverrides: ['generation.tools'] },
                { prompt: { ...serviceRequest.prompt, messages: [] } }, { requirements: [] }, { requestId: 'other' }, { routeRef: { scope: 'player', runtimeRouteId: 'other' } }])
                await expect(port.provider(f.h.handle, { context }).buildRequestContextPlan({ ...serviceRequest, ...changed }, resolved)).rejects.toMatchObject({ code: 'native_orchestration_resolver_request_mismatch' });
            expect(actual.items).toHaveLength(1); expect(JSON.parse(actual.items[0].content)).toEqual(expected.payload);
            expect(actual.budget).toEqual({ maxTokens: 30000, reservedOutputTokens: 2000 });
            expect(JSON.stringify(actual)).not.toContain('PRIVATE SENTINEL'); expect(JSON.stringify(actual)).not.toContain('validators');
            expect(actual.items[0].provenance).toEqual([{ source: 'host.authority' }]);
            const response = { toolCalls: [{ name: fixed.tools[0].function.name, args: f.selection.input }] };
            expect(await port.selectResolver(f.h.handle, { context, response })).toEqual(f.selection);
            expect(await f.core.observe(f.h.handle, f.base.session.sessionId)).toEqual(f.base);
        }); } finally { await f.cleanup(); }
    });

    test('JSON captures, foreign owner/core/source and expired original producer cannot acquire authority', async () => {
        const f = await fixture(make); let expired;
        try {
            await f.withScope(async ({ capture, producer, request }) => {
                expired = capture;
                for (const copy of [{}, structuredClone(capture)]) expect(() => inspectNativeAuthorityResolver(copy, { sessionCore: f.core, handle: f.h.handle })).toThrow('native_orchestration_resolver_context_denied');
                for (const changed of [{ handle: 'other' }, { sessionCore: Object.create(f.core) }, { host: {} },
                    { sourceBinding: { ...request.sourceBinding, sourceRef: { ...request.sourceBinding.sourceRef, revisionId: 'other' } } }])
                    expect(() => inspectNativeAuthorityResolver(capture, { sessionCore: f.core, handle: f.h.handle, ...changed })).toThrow('native_orchestration_resolver_context_denied');
                expect(() => captureNativeAuthorityResolver({ host: f.host, handle: f.h.handle, base: { ...f.base, timeline: [{ ...f.base.timeline.at(-1), role: 'assistant' }] }, producer })).toThrow('native_orchestration_resolver_context_denied');
                for (const changed of [{ permit: structuredClone(producer.permit) }, { invocationId: 'other' }, { selection: {} }, { requestHash: 'f'.repeat(64) }])
                    expect(() => captureNativeAuthorityResolver({ host: f.host, handle: f.h.handle, base: f.base, producer: { ...producer, ...changed } })).toThrow('native_orchestration_turn_permit_denied');
            });
            expect(() => inspectNativeAuthorityResolver(expired, { sessionCore: f.core, handle: f.h.handle })).toThrow('operation_boundary_denied');
        } finally { await f.cleanup(); }
    });

    test('only branded compiled context and exact resolver request/tools can be sent or selected', async () => {
        const f = await fixture(make);
        try { await f.withScope(async ({ port, request }) => {
            const context = await port.compile(f.h.handle, request), fixed = port.resolverRequest(f.h.handle, { context });
            for (const changed of [{ role: 'narrator' }, { requestId: 'other' }, { tools: [] }, { messages: [] }, { sessionId: 'other' }])
                expect(() => port.assertResolverRequest(f.h.handle, { context, request: { ...fixed, ...changed } })).toThrow('native_orchestration_resolver_request_mismatch');
            expect(() => port.resolverRequest(f.h.handle, { context: structuredClone(context) })).toThrow('native_orchestration_context_proof_invalid');
            for (const response of [{ toolCalls: [] }, { toolCalls: [{ name: 'unknown', args: {} }] }, { toolCalls: [{ name: fixed.tools[0].function.name, args: { injected: true } }] }])
                await expect(port.selectResolver(f.h.handle, { context, response })).rejects.toThrow();
            await expect(port.compile(f.h.handle, { ...request, audience: { kind: 'narrator' } })).rejects.toMatchObject({ code: 'native_orchestration_context_audience_invalid' });
            const bare = new ContextPort({ sessionCore: f.core, authorizeContext: async () => ({ allowed: true, grantDigest: request.grantDigest }) });
            await expect(bare.compile(f.h.handle, request)).rejects.toMatchObject({ code: 'native_orchestration_context_audience_invalid' });
        }); } finally { await f.cleanup(); }
    });

    test('revoked grants and real Session publication invalidate both send and selection without another projection', async () => {
        const f = await fixture(make);
        try { await f.withScope(async ({ port, request, revoke, allow }) => {
            const context = await port.compile(f.h.handle, request);
            revoke(); await expect(port.revalidate(f.h.handle, { context, phase: 'send' })).rejects.toMatchObject({ code: 'native_orchestration_context_denied' });
            await expect(port.selectResolver(f.h.handle, { context, response: {} })).rejects.toMatchObject({ code: 'native_orchestration_context_denied' });
            allow();
            await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Changed source.' });
            for (const phase of ['send', 'consume']) await expect(port.revalidate(f.h.handle, { context, phase })).rejects.toMatchObject({ code: 'native_orchestration_context_source_stale' });
        }); } finally { await f.cleanup(); }
    });

    test('descriptor only reads actual Package bytes; malformed logic is not evaluated until compile', async () => {
        const f = await fixture(make), open = f.core._openPackage.bind(f.core);
        try { await f.withScope(async ({ port, request }) => {
            f.core._openPackage = async (...args) => { const original = await open(...args); return { ...original, sourceFiles: new Map([['logic.json', Buffer.from('not json')]]) }; };
            const descriptor = await port.compilationDescriptor(f.h.handle, request);
            expect(descriptor.sourceFiles[0][1].toString()).toBe('not json');
            await expect(port.compile(f.h.handle, request)).rejects.toThrow();
        }); } finally { f.core._openPackage = open; await f.cleanup(); }
    });

    test('immutable Package byte drift is refused at send and consume without re-running its logic or observation', async () => {
        const f = await fixture(make), open = f.core._openPackage.bind(f.core);
        try { await f.withScope(async ({ port, request }) => {
            const context = await port.compile(f.h.handle, request);
            f.core._openPackage = async (...args) => { const original = await open(...args); return { ...original, sourceFiles: new Map([['logic.json', Buffer.from('not json')]]) }; };
            for (const phase of ['send', 'consume']) await expect(port.revalidate(f.h.handle, { context, phase })).rejects.toMatchObject({ code: 'native_orchestration_context_source_stale' });
        }); } finally { f.core._openPackage = open; await f.cleanup(); }
    });
});

test('resolver and candidate Authority contexts cannot be mixed', () => {
    expect(() => new ContextPort({ resolverCapture: {}, authorityTurn: {}, authorizeContext: () => {} })).toThrow('native_orchestration_context_authority_conflict');
});
