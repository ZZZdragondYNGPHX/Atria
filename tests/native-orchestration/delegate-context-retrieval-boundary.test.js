import { delegateContextRetrievalFixture } from './helpers/delegate-context-retrieval-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { ContextPort } from '../../src/native/orchestration/context-port.js';
import { ContextRetrievalPort } from '../../src/native/orchestration/context-retrieval-port.js';
import { inspectNativeRpDelegationIdentity } from '../../src/native/orchestration/native-rp-generation.js';
import { readTaskLocalOutput } from '../../src/native/orchestration/task-local-output-contracts.js';
import { readHandoffReturn } from '../../src/native/orchestration/handoff-return-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { PROVENANCE_NAMESPACE } from '../../public/scripts/agents/memory/source-lifecycle.js';

const controlOf = f => f.control.status(f.h.handle, f.controlId);
const rootsOf = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle })).map(row => row.doc));

async function withChildProbe(f, probe, state) {
    const compile = ContextPort.prototype.compile, port = f.authority.execution.budgetPort, sendBank = port.sendBank.bind(port), banks = new Map();
    let hookFailure;
    port.sendBank = (handle, args) => { const bank = sendBank(handle, args); banks.set(args.effectId, { bank, ...args }); return bank; };
    ContextPort.prototype.compile = async function (handle, request, ...rest) {
        const compiled = await compile.call(this, handle, request, ...rest).catch(error => { state.compileFailureCode = error.code; throw error; });
        if (this.rpDelegationCapture) {
            state.seen = (state.seen ?? 0) + 1;
            const identity = inspectNativeRpDelegationIdentity(this.rpDelegationCapture, { host: f.host, handle, rpControl: f.control });
            try { await probe({ port: this, handle, request, compiled, identity, banks }); }
            catch (error) { hookFailure = error; throw error; }
        }
        return compiled;
    };
    try { return await f.run(); }
    catch (error) { if (hookFailure) throw hookFailure; throw error; }
    finally { ContextPort.prototype.compile = compile; port.sendBank = sendBank; }
}

describe.each(CONTRACT_HARNESSES)('$name finite RP Delegate retrieval boundary', ({ make }) => {
    test.each(['parent', 'parent_child'])('owned retrieval pins in %s do not create a brief-only Delegate source grant', async mode => {
        const f = await delegateContextRetrievalFixture(make, { mode });
        try {
            const before = await controlOf(f);
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_rp_plan_unavailable' });
            expect(await controlOf(f)).toEqual(before); expect(f.effects).toEqual([]); expect(await rootsOf(f)).toEqual([]);
            expect(f.requests).toEqual([]); expect(f.calls).toEqual([]);
        } finally { await f.cleanup(); }
    }, 180000);

    test('real child bank and parent SourceRef cannot expand its brief; the original parent still recalls its own legal Memory and continues', async () => {
        const f = await delegateContextRetrievalFixture(make), state = {};
        const memoryBefore = hash(await f.chats.getState(f.h.handle, f.locator.charDir, f.locator.name, PROVENANCE_NAMESPACE));
        try {
            const result = await withChildProbe(f, async ({ port, handle, request, compiled, identity, banks }) => {
                const before = await controlOf(f), descriptor = await port.compilationDescriptor(handle, request);
                expect(port.memoryAuthority).toBeNull(); expect(Object.hasOwn(descriptor, 'memoryDescriptor')).toBe(false);
                expect(request.audience).toEqual({ kind: 'task', id: identity.childRunId });
                expect(descriptor.context.messages).toEqual([{ role: 'user', content: 'Original RP input' }]);
                expect(compiled.plan.items.map(item => item.content)).toEqual([{ role: 'user', content: 'Original RP input' }]);
                const root = await f.authority.execution.runs.get(handle, identity.childRunId), effect = f.effects.find(row => row.runId === root.runId);
                const { bank, limits } = banks.get(effect.effectId);
                await expect(ContextRetrievalPort.prototype.createCompilation.call(f.authority.execution.contextRetrieval, handle,
                    { port, request, bank, root, modelEffectId: effect.effectId, limits, actualInput: descriptor, signal: identity.signal }))
                    .rejects.toMatchObject({ code: 'native_orchestration_context_retrieval_denied' });
                expect(await controlOf(f)).toEqual(before);
                for (const extra of [{ kind: 'source_ref', sourceRef: request.sourceBinding.sourceRef, sourceMessageIds: ['rp0'] },
                    { kind: 'memory_source', sourceRef: request.sourceBinding.sourceRef, memoryId: 'rp-memory-fact', text: 'Original RP remembered context promise' }]) {
                    await expect(port.compilationDescriptor(handle, { ...request, inputRefs: [...request.inputRefs, extra] }))
                        .rejects.toMatchObject({ code: 'native_orchestration_context_denied' });
                    expect(await controlOf(f)).toEqual(before);
                }
            }, state);
            expect(state.seen).toBe(1); expect(result.delegation.status).toBe('returned');
            expect(f.calls).toEqual([]); expect(f.requests).toHaveLength(2);
            const childWire = JSON.stringify(f.requests[0]), parentWire = JSON.stringify(f.requests[1]);
            expect(childWire).toContain('Original RP input'); expect(parentWire).toContain('Original RP context');
            expect(parentWire).toContain('Original RP remembered context promise');
            for (const denied of ['Original RP context', 'Original RP remembered context promise', 'FUTURE FORBIDDEN MEMORY']) expect(childWire).not.toContain(denied);
            expect(parentWire).not.toContain('FUTURE FORBIDDEN MEMORY');
            expect(hash(await f.chats.getState(f.h.handle, f.locator.charDir, f.locator.name, PROVENANCE_NAMESPACE))).toBe(memoryBefore);
            const roots = await rootsOf(f), parent = roots.find(root => !root.parentRef), child = roots.find(root => root.parentRef);
            const control = await controlOf(f), compute = Object.values(control.operations)[0].compute;
            expect(compute.attempts).toHaveLength(2); expect(compute.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
            expect(compute.localWork.every(row => row.status === 'settled')).toBe(true);
            expect(compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released' })]);
            expect(child.status).toBe('completed'); expect(parent.status).toBe('running');
            expect((await f.h.engine.withTransaction(f.h.handle, tx => readTaskLocalOutput(tx, f.h.handle, child))).claim.resultRef).toEqual(result.delegation.resultRef);
            expect((await f.h.engine.withTransaction(f.h.handle, tx => readHandoffReturn(tx, f.h.handle, parent, child.runId))).resultRef).toEqual(result.delegation.resultRef);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    }, 180000);

    test('external retrieval settings alone cannot upgrade a returned child or its parent continuation, and retain the paid child', async () => {
        const f = await delegateContextRetrievalFixture(make, { mode: 'external_unpinned' }), state = {};
        try {
            await expect(withChildProbe(f, async ({ port, handle, request, compiled }) => {
                const descriptor = await port.compilationDescriptor(handle, request);
                expect(Object.hasOwn(descriptor, 'memoryDescriptor')).toBe(false);
                expect(compiled.plan.items.map(item => item.content)).toEqual([{ role: 'user', content: 'Original RP input' }]);
            }, state)).rejects.toMatchObject({ code: 'generation_execution_failed' });
            expect(state.compileFailureCode).toBe('native_orchestration_memory_retrieval_scope_unavailable');
            expect(state.seen).toBe(1); expect(f.calls).toEqual([]); expect(f.requests).toHaveLength(1);
            expect(JSON.stringify(f.requests[0])).not.toContain('Original RP remembered context promise');
            const roots = await rootsOf(f), parent = roots.find(root => !root.parentRef), child = roots.find(root => root.parentRef);
            const compute = Object.values((await controlOf(f)).operations)[0].compute;
            expect(child.status).toBe('completed'); expect(parent.outputClaims).toEqual([]);
            expect(compute.attempts).toHaveLength(1); expect(compute.attempts[0]).toMatchObject({ reservationId: child.runId, status: 'settled', usage: { totalTokens: 20 } });
            expect(compute.localWork).toContainEqual(expect.objectContaining({ kind: 'context_build', status: 'settled', usage: expect.objectContaining({ outcome: 'failed' }) }));
            expect(compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released' })]);
            expect(await f.h.engine.withTransaction(f.h.handle, tx => readTaskLocalOutput(tx, f.h.handle, child))).not.toBeNull();
            expect(await f.h.engine.withTransaction(f.h.handle, tx => readHandoffReturn(tx, f.h.handle, parent, child.runId))).not.toBeNull();
            const paid = compute.attempts;
            await expect(f.run()).rejects.toThrow(); expect(Object.values((await controlOf(f)).operations)[0].compute.attempts).toEqual(paid);
            expect(f.calls).toEqual([]); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 180000);
});
