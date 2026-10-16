import { jest } from '@jest/globals';
import { ContextPort } from '../../src/native/orchestration/context-port.js';
import { inspectNativeRpDelegationIdentity } from '../../src/native/orchestration/native-rp-generation.js';
import { NativeMemoryAuthority } from '../../src/native/memory-authority.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { PROVENANCE_NAMESPACE } from '../../public/scripts/agents/memory/source-lifecycle.js';
import { rpDelegationFixture } from './helpers/rp-delegation-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

const sql = process.env.ATRIA_TEST_RP_DELEGATION_SQL === '1';
const harnesses = CONTRACT_HARNESSES.filter(({ name }) => sql || ['FsEngine', 'SqliteEngine'].includes(name));
if (sql) jest.setTimeout(60000);

// Observe the actual child producer and its original Context compile. No test
// callback mints a capture, grant, completed response or Scheduler boundary.
async function withChildCompile(f, observe) {
    const original = ContextPort.prototype.compile;
    let seen = 0, compileFailure;
    const observeCompile = async function (handle, request) {
        const compiled = await original.call(this, handle, request);
        if (this.rpDelegationCapture) {
            seen++;
            await observe({ port: this, handle, request, compiled,
                identity: inspectNativeRpDelegationIdentity(this.rpDelegationCapture, { handle, rpControl: f.control, host: f.host }) });
        }
        return compiled;
    };
    ContextPort.prototype.compile = async function (...args) {
        try { return await observeCompile.apply(this, args); } catch (error) { compileFailure = error; throw error; }
    };
    try { return await f.run(); } catch (error) {
        if (compileFailure) throw compileFailure;
        if (error.code === 'operation_child_failed' && error.cause) throw error.cause;
        throw error;
    } finally { ContextPort.prototype.compile = original; expect(seen).toBe(1); }
}

describe.each(harnesses)('$name actual RP delegated Context', ({ make }) => {
    test('only the original last user input reaches the real child descriptor, Context and HTTP request', async () => {
        const f = await rpDelegationFixture(make, { memorySettings: { enabled: true, sourceWritesEnabled: false, memoryOsTokenBudget: 2400 }, seedMemory: true });
        let before;
        try {
            const memoryBefore = hash(await f.chats.getState(f.h.handle, f.locator.charDir, f.locator.name, PROVENANCE_NAMESPACE));
            expect(f.authority.memoryAuthority).toBeInstanceOf(NativeMemoryAuthority);
            await withChildCompile(f, async ({ port, handle, request, compiled, identity }) => {
                before = await f.control.status(handle, f.controlId);
                const descriptor = await port.compilationDescriptor(handle, request);
                expect(request.audience).toEqual({ kind: 'task', id: identity.childRunId });
                expect(request.grantDigest).toBe(identity.grantDigest); expect(request.inputRefs).toEqual(identity.inputRefs);
                expect(descriptor.context.messages).toEqual([{ role: 'user', content: 'Original RP input' }]);
                expect(Object.hasOwn(descriptor, 'root')).toBe(false); expect(Object.hasOwn(descriptor, 'parentRoot')).toBe(false);
                expect(descriptor.handoffReceiptRef.runId).toBe(identity.parentRunId);
                expect(compiled.plan.items).toHaveLength(1);
                expect(compiled.plan.items[0].content).toEqual({ role: 'user', content: 'Original RP input' });
                for (const text of [JSON.stringify(descriptor), JSON.stringify(compiled.plan)]) {
                    expect(text).not.toContain('Original RP context'); expect(text).not.toContain('FUTURE FORBIDDEN MEMORY');
                    expect(text).not.toContain('Original RP remembered context promise');
                }
                expect(port.memoryAuthority).toBeNull(); expect(port.readMemoryEvidence).toBeUndefined();
                const resolved = await f.authority.modelResolver.resolve({ handle, routeRef: identity.request.routeRef, role: 'role.narrator' });
                const provider = port.provider(handle, { context: compiled, source: { kind: 'rp_chat', controlId: f.controlId } });
                expect((await provider.buildRequestContextPlan(identity.request, resolved)).items).toEqual(compiled.plan.items);
                const service = { requestId: identity.request.requestId, role: 'role.narrator', routeRef: identity.request.routeRef,
                    requirements: [], tools: [], outputContract: null, fallbackMode: 'disabled', unknownCapabilityOverrides: [],
                    prompt: { host: { role: 'role.narrator', sourceKind: 'rp_chat', sessionId: '', branchId: '', revisionId: '', projectId: '', projectRevision: '' } } };
                expect((await provider.buildRequestContextPlan(service, resolved)).items).toEqual(compiled.plan.items);
                for (const change of [{ requestId: 'foreign-child-request' }, { tools: [{ name: 'unapproved' }] }, { outputContract: {} },
                    { requirements: ['generation.tools'] }, { fallbackMode: 'automatic' }, { unknownCapabilityOverrides: ['generation.tools'] },
                    { prompt: { ...service.prompt, messages: [{ role: 'system', content: 'Forbidden caller prompt' }] } }])
                    await expect(provider.buildRequestContextPlan({ ...service, ...change }, resolved)).rejects.toMatchObject({ code: 'native_orchestration_rp_request_mismatch' });
                await expect(provider.buildRequestContextPlan({ ...identity.request, messages: [] }, resolved)).rejects.toMatchObject({ code: 'native_orchestration_rp_request_mismatch' });
                await expect(provider.buildRequestContextPlan(identity.request, { ...resolved, route: { ...resolved.route, runtimeRouteId: createNativeId('runtimeRoute') } }))
                    .rejects.toMatchObject({ code: 'native_orchestration_rp_request_mismatch' });
                expect(() => port.assertSource(handle, { context: compiled, source: { kind: 'rp_chat', controlId: createNativeId('rpControl') } }))
                    .toThrow('native_orchestration_context_source_mismatch');
            });
            expect(f.requests).toHaveLength(1);
            const wire = JSON.stringify(f.requests[0]); expect(wire).toContain('Original RP input');
            expect(wire).not.toContain('Original RP context'); expect(wire).not.toContain('FUTURE FORBIDDEN MEMORY');
            expect(wire).not.toContain('Original RP remembered context promise');
            expect(hash(await f.chats.getState(f.h.handle, f.locator.charDir, f.locator.name, PROVENANCE_NAMESPACE))).toBe(memoryBefore);
            const after = await f.control.status(f.h.handle, f.controlId);
            expect(after.sequence).toBeGreaterThan(before.sequence);
            expect(Object.values(after.operations).flatMap(op => op.compute?.attempts ?? [])).toEqual([expect.objectContaining({ status: 'settled', usage: expect.objectContaining({ totalTokens: 20 }) })]);
        } finally { await f.cleanup(); }
    });

    test('a real child capture cannot acquire Narrator audience, Memory, persona or caller-authored inputs', async () => {
        const f = await rpDelegationFixture(make);
        try {
            await withChildCompile(f, async ({ port, handle, request, compiled, identity }) => {
                const options = { rpControl: f.control, rpDelegationCapture: port.rpDelegationCapture, authorizeContext: port.authorizeContext };
                const memory = new NativeMemoryAuthority({ core: f.host.sessionCore, settingsRepo: new SettingsRepo({ engine: f.h.engine }) });
                for (const extra of [{ memoryAuthority: memory }, { readMemoryEvidence: async () => [] }, { contextOptions: { playerPersona: 'Forbidden' } },
                    { contextOptions: { memoryEvidence: [] } }, { compilationInputs: { messages: 'Forbidden parent context' } }])
                    expect(() => new ContextPort({ ...options, ...extra })).toThrow('native_orchestration_context_delegation_scope_invalid');
                expect(() => new ContextPort({ ...options, rpCapture: {} })).toThrow('native_orchestration_context_authority_conflict');
                const fake = new ContextPort({ ...options, rpDelegationCapture: structuredClone(port.rpDelegationCapture) });
                await expect(fake.compilationDescriptor(handle, request)).rejects.toThrow();
                await expect(port.revalidate(handle, { context: structuredClone(compiled), phase: 'send' })).rejects.toMatchObject({ code: 'native_orchestration_context_proof_invalid' });
                await expect(port.compilationDescriptor(handle, { ...request, audience: { kind: 'narrator' } })).rejects.toMatchObject({ code: 'native_orchestration_context_audience_invalid' });
                await expect(port.compilationDescriptor(handle, { ...request, audience: { kind: 'task', id: identity.parentRunId } })).rejects.toMatchObject({ code: 'native_orchestration_context_audience_denied' });
                await expect(port.compilationDescriptor(handle, { ...request, inputRefs: [...request.inputRefs, { kind: 'caller_context', text: 'Forbidden' }] })).rejects.toThrow();
                await expect(port.compilationDescriptor(handle, { ...request, grantDigest: 'f'.repeat(64) })).rejects.toThrow();
                await expect(port.compilationDescriptor(handle, { ...request, taskPurpose: 'caller-narration' })).rejects.toThrow();
            });
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each(['source', 'binding'])('original %s revocation after actual compile withholds HTTP and retains original local costs', async change => {
        const f = await rpDelegationFixture(make);
        try {
            await expect(withChildCompile(f, async () => {
                if (change === 'binding') {
                    const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector);
                    await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), {
                        sourceSelector: f.sourceSelector, planRef: binding.planRef, expectedVersion: binding.version });
                    return;
                }
                const chat = await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name);
                chat.body[0].mes = 'Original earlier source revoked';
                await f.chats.save(f.h.handle, f.locator.charDir, f.locator.name, chat.header, chat.body, chat.integrity);
            })).rejects.toThrow();
            expect(f.requests).toEqual([]);
            const bank = await f.control.status(f.h.handle, f.controlId), operations = Object.values(bank.operations);
            expect(operations.flatMap(op => op.compute?.attempts ?? [])).toEqual([]);
            expect(operations.flatMap(op => op.compute?.localWork ?? [])).toContainEqual(expect.objectContaining({ kind: 'context_build', status: 'settled' }));
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    });
});
