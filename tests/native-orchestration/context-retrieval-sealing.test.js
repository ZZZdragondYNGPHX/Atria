import { jest } from '@jest/globals';
import { contextRetrievalFixture } from './helpers/context-retrieval-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { ContextRetrievalPort } from '../../src/native/orchestration/context-retrieval-port.js';
import { RpOutputController } from '../../src/native/orchestration/rp-output-controller.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';

const compute = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;

describe.each(CONTRACT_HARNESSES)('$name original completed Context retrieval facts', ({ make }) => {
    test('before original output, sealing frees live scope while its opaque fee proof reads only protected facts', async () => {
        const f = await contextRetrievalFixture(make, { embedding: true }), create = ContextRetrievalPort.prototype.createCompilation;
        const recall = ContextRetrievalPort.prototype.assertRecall, release = ContextRetrievalPort.prototype.releaseCompilation, complete = RpOutputController.prototype.complete;
        let compilation, feeProof, released = false, checked = false;
        const createSpy = jest.spyOn(ContextRetrievalPort.prototype, 'createCompilation').mockImplementation(async function (handle, args) {
            const result = await create.call(this, handle, args); compilation = { port: this, handle, args }; return result;
        });
        const recallSpy = jest.spyOn(ContextRetrievalPort.prototype, 'assertRecall').mockImplementation(async function (handle, proof) {
            const result = await recall.call(this, handle, proof); feeProof = proof; return result;
        });
        const releaseSpy = jest.spyOn(ContextRetrievalPort.prototype, 'releaseCompilation').mockImplementation(function (...args) {
            released = true; return release.apply(this, args);
        });
        const completeSpy = jest.spyOn(RpOutputController.prototype, 'complete').mockImplementation(async function (...args) {
            expect(released).toBe(true);
            await expect(create.call(compilation.port, compilation.handle, compilation.args)).rejects.toThrow();
            expect(await recall.call(compilation.port, compilation.handle, feeProof)).toHaveLength(2);
            await expect(recall.call(compilation.port, compilation.handle, structuredClone(feeProof))).rejects.toThrow();
            checked = true; return complete.apply(this, args);
        });
        try {
            const result = await f.run({ floor: 2 }); expect(result.output.runStatus).toBe('completed'); expect(checked).toBe(true);
            const before = await compute(f); expect(f.calls).toHaveLength(2); expect(f.requests).toHaveLength(1);
            await f.chats.delete(f.h.handle, 'Actor', 'main');
            expect(await recall.call(compilation.port, compilation.handle, feeProof)).toHaveLength(2);
            expect(await compute(f)).toEqual(before); expect(f.calls).toHaveLength(2); expect(f.requests).toHaveLength(1);
        } finally { createSpy.mockRestore(); recallSpy.mockRestore(); releaseSpy.mockRestore(); completeSpy.mockRestore(); await f.cleanup(); }
    }, 120000);

    test('unknown main Model usage completes the legal original domain output while its estimated charge stays unknown', async () => {
        const f = await contextRetrievalFixture(make, { embedding: true, modelUsage: false });
        try {
            const result = await f.run({ floor: 2 }), bank = await compute(f);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(1); expect(f.calls).toHaveLength(2);
            expect(bank.attempts.map(row => row.status)).toEqual(['settled', 'settled', 'unknown']);
        } finally { await f.cleanup(); }
    }, 120000);

    test('sealing a fee proof never waives final original Memory permission or refunds completed work', async () => {
        const f = await contextRetrievalFixture(make, { embedding: true }), complete = RpOutputController.prototype.complete;
        const spy = jest.spyOn(RpOutputController.prototype, 'complete').mockImplementation(async function (...args) {
            const repo = new SettingsRepo({ engine: f.h.engine }), settings = await repo.get(f.h.handle);
            settings.atri_capabilities.memory_graph.recallEnabled = false; await repo.save(f.h.handle, settings);
            return complete.apply(this, args);
        });
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(f.requests).toHaveLength(1); expect(f.calls).toHaveLength(2);
            expect((await compute(f)).attempts.map(row => row.status)).toEqual(['settled', 'settled', 'settled']);
            expect((await new SettingsRepo({ engine: f.h.engine }).get(f.h.handle)).atri_capabilities.memory_graph.recallEnabled).toBe(false);
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(3);
        } finally { spy.mockRestore(); await f.cleanup(); }
    }, 120000);
});
