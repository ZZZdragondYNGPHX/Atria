import { modelPortFixture } from './helpers/model-port-fixture.js';
import { ContextPort } from '../../src/native/orchestration/context-port.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';
import { createNativeId } from '../../src/native/identity.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s metered execution Context binding', (_name, make) => {
    test('only the original compiled object and same-bank work proof bind once before dispatch', async () => {
        const f = await modelPortFixture(make); let binding, options, bindings = 0;
        try {
            const service = f.authority.execution, send = service.generationSend;
            service.generationSend = async (...args) => {
                options = await send(...args);
                expect(options.context).toBeUndefined();
                const bind = options.bindContext;
                options.bindContext = async candidate => {
                    binding = candidate; bindings++;
                    for (const forged of [
                        { ...candidate, compileProof: {} },
                        { ...candidate, compileProof: JSON.parse(JSON.stringify(candidate.compileProof)) },
                        { ...candidate, compiled: structuredClone(candidate.compiled) },
                        { ...candidate, port: new ContextPort({ sessionCore: f.core, authorizeContext: async () => ({ allowed: true, grantDigest: candidate.compiled.request.grantDigest }) }) },
                    ]) await expect(bind(forged)).rejects.toThrow();
                    expect(options.context).toBeUndefined();
                    await bind(candidate);
                    expect(Object.isFrozen(options.context)).toBe(true);
                    expect(options.context.compiled).toBe(candidate.compiled);
                    expect(() => { options.context = { ...candidate }; }).toThrow(TypeError);
                    await expect(bind(candidate)).rejects.toMatchObject({ code: 'native_orchestration_context_already_bound' });
                };
                return options;
            };
            await f.start();
            expect(bindings).toBe(1); expect(f.requests).toHaveLength(1);
            await expect(options.bindContext(binding)).rejects.toThrow();
        } finally { await f.cleanup(); }
    });

    test('cancellation after real Context work cannot bind or spend a Provider attempt', async () => {
        const f = await modelPortFixture(make); let bindCalls = 0;
        try {
            const service = f.authority.execution, send = service.generationSend;
            service.generationSend = async (...args) => {
                const options = await send(...args), bind = options.bindContext;
                options.bindContext = async candidate => {
                    bindCalls++;
                    const root = await service.runs.get(f.h.handle, args[1].runId);
                    await service.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(root), reasonCode: 'cancel_before_context_binding' });
                    return bind(candidate);
                };
                return options;
            };
            await expect(f.start()).rejects.toThrow();
            expect(bindCalls).toBe(1); expect(f.requests).toHaveLength(0);
            const root = await service.runs.get(f.h.handle, f.effectRef.runId);
            const effect = await f.h.engine.withTransaction(f.h.handle, async tx => (await readEffect(tx, f.h.handle, root, f.effectRef.effectId)).doc);
            expect(effect.status).toBe('prepared'); expect(effect.budgetAttemptRef).toBeNull();
            const control = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            const ledger = control.operations[root.budgetAuthorityRef.operationId].compute;
            expect(ledger.attempts).toHaveLength(0);
            expect(ledger.localWork.some(row => row.kind === 'context_build' && row.status === 'settled' && row.usage.outcome === 'completed')).toBe(true);
        } finally { await f.cleanup(); }
    });
});
